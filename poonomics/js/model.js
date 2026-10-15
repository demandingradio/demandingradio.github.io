/* ==========================================================================
   POONOMICS engine. Pure functions, no DOM. Runs in the browser and in Node.

   One call to run(params, events) simulates 30 years of Australian economy
   from FY2025-26. Each year:
     demography -> capacity (capital, labour, productivity) -> world and
     prices -> central bank -> housing -> services and public spending ->
     demand solved by fixed point (income, tax, transfers, consumption) ->
     sector accounts and identity checks -> stocks update.

   Baseline add-factors: the first run with default policy is forced onto a
   smooth output-gap path and the residual demand is stored. Scenarios reuse
   those add-factors, so every difference you see is caused by your changes.
   ========================================================================== */
(function (root) {
  'use strict';
  const C = root.POON_CALIB;
  const LV = root.POON_LEVERS;

  // ---------------------------------------------------------------- helpers
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  function defaults() { const p = {}; LV.forEach((l) => { p[l.id] = l.def; }); return p; }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

  // ------------------------------------------------------------ pure pieces
  function taxBrackets(P, n, S) {
    // thresholds after indexation; first rate after the legislated cut
    const idx = P.t_index === 1 ? S.idxCPI : P.t_index === 2 ? S.idxW : 1;
    let r1 = P.t_r1;
    if (P.t_legislated && n >= 2 && r1 === 0.15) r1 = 0.14;
    if (P.t_legislated && n < 1 && r1 === 0.15) r1 = 0.16; // base year (2025-26) rate
    const b = {
      free: P.t_free * idx, th1: P.t_th1 * idx, th2: P.t_th2 * idx, th3: P.t_th3 * idx,
      r1, r2: P.t_r2, r3: P.t_r3, r4: P.t_r4, med: P.t_medicare
    };
    if (P.t_flat) { b.r1 = b.r2 = b.r3 = b.r4 = P.t_flatRate; b.th1 = b.th2 = b.th3 = 1e12; }
    return b;
  }
  function pitFn(inc, b, medThresh) {
    if (inc <= b.free) return 0;
    let t = (Math.min(inc, b.th1) - b.free) * b.r1;
    if (inc > b.th1) t += (Math.min(inc, b.th2) - b.th1) * b.r2;
    if (inc > b.th2) t += (Math.min(inc, b.th3) - b.th2) * b.r3;
    if (inc > b.th3) t += (inc - b.th3) * b.r4;
    if (inc > medThresh) t += inc * b.med;
    return t;
  }
  function wealthExcessB(Tdollars) {
    const w = C.wealth;
    return w.nRef * Math.pow(w.tRefM, w.alpha) * Math.pow(Tdollars / 1e6, 1 - w.alpha) / (w.alpha - 1) / 1000;
  }
  function wealthHoldersAbove(Tdollars) {
    const w = C.wealth;
    return w.nRef * Math.pow(w.tRefM / (Tdollars / 1e6), w.alpha);
  }
  function distStats(meansK, shares, sigma) {
    // lognormal mixture over per-person incomes ($k). Returns median, poverty rate, Gini
    const N = 420, lo = Math.log(1.5), hi = Math.log(4000);
    const F = new Array(N + 1);
    const xs = new Array(N + 1);
    for (let j = 0; j <= N; j++) {
      const lx = lo + (hi - lo) * j / N;
      xs[j] = Math.exp(lx);
      let f = 0;
      for (let g = 0; g < meansK.length; g++) {
        const mu = Math.log(Math.max(0.5, meansK[g])) - sigma * sigma / 2;
        f += shares[g] * Phi((lx - mu) / sigma);
      }
      F[j] = f;
    }
    function cdfAt(x) {
      const lx = Math.log(x);
      let f = 0;
      for (let g = 0; g < meansK.length; g++) {
        const mu = Math.log(Math.max(0.5, meansK[g])) - sigma * sigma / 2;
        f += shares[g] * Phi((lx - mu) / sigma);
      }
      return f;
    }
    let med = xs[N];
    for (let j = 1; j <= N; j++) {
      if (F[j] >= 0.5) { const t = (0.5 - F[j - 1]) / (F[j] - F[j - 1] || 1); med = xs[j - 1] + t * (xs[j] - xs[j - 1]); break; }
    }
    const line = C.povertyMedianShare * med;
    const poverty = cdfAt(line);
    let tot = 0; const cell = new Array(N + 1).fill(0);
    for (let j = 1; j <= N; j++) { cell[j] = 0.5 * (xs[j] + xs[j - 1]) * (F[j] - F[j - 1]); tot += cell[j]; }
    let L = 0, area = 0;
    for (let j = 1; j <= N; j++) {
      const dF = F[j] - F[j - 1];
      const Lnew = L + cell[j] / tot;
      area += dF * (L + Lnew);
      L = Lnew;
    }
    return { median: med, line, poverty, gini: clamp(1 - area, 0, 1) };
  }

  // ----------------------------------------------------------- service table
  // Each line: key, group (svc) and funding multiplier source.
  const SVC_LINES = [
    { key: 'medicare', svc: 'health', lever: 'g_health' },
    { key: 'hospitals', svc: 'health', lever: 'g_hosp' },
    { key: 'otherHealth', svc: 'health', lever: 'g_oth' },
    { key: 'aged', svc: 'aged', lever: 'g_aged' },
    { key: 'dental', svc: 'dental', lever: null },
    { key: 'schools', svc: 'edu', lever: 'g_schools' },
    { key: 'higher', svc: 'edu', lever: 'g_higher' },
    { key: 'vet', svc: 'edu', lever: 'g_vet' }
  ];
  const SVC_KEYS = ['health', 'aged', 'dental', 'edu', 'ndis'];
  const PLAIN_LINES = [      // volume = base * population index * drift * lever
    { key: 'order', lever: 'g_order' },
    { key: 'transport', lever: 'g_infra' },
    { key: 'housing', lever: 'g_housing' },
    { key: 'env', lever: 'g_env' },
    { key: 'general', lever: 'g_gen' }
  ];
  const DISC_KEYS = ['defence', 'order', 'transport', 'housing', 'env', 'general', 'econ'];

  function needIndex(pop, svc) {
    const w = C.needW[svc];
    let a = 0, b = 0;
    for (let i = 0; i < 6; i++) { a += w[i] * pop[i]; b += w[i] * C.pop0[i]; }
    return a / b;
  }
  function laborForce(pop, P) {
    let lf = 0;
    for (let i = 0; i < 6; i++) {
      let pr = C.partic[i];
      if (i === 4) pr = clamp(pr + 0.035 * (P.g_retAge - 67), 0.02, 0.6);
      lf += pr * pop[i];
    }
    return lf * (1 - 0.06 * clamp(P.g_ubi / 40000, 0, 1.5));
  }

  // ----------------------------------------------------------------- base state
  function baseState() {
    const pop = C.pop0.slice();
    const S = {
      n: 0, year: C.baseYear, pop,
      K: C.K2Y * C.Y0, A: 1, P: 1, Pm: 1, Px: 1, ToT: 1, fx: 1,
      pi: C.cpi0, pe: 0.027, w: 0.035, wavg: 0,
      rcash: C.rcash0, eff: C.effDebtRate0,
      gap: C.gap0, u: 0, Y: C.Y0, Yn: C.Y0, Ystar: C.Y0 / (1 + C.gap0),
      HP: 1, hpgr: 0.04, dlnTgt: 0.04, rent: 1, dwell: C.dwellings0, tightRatio0: 0,
      hhDebt: C.hhDebt0, superA: C.superAssets0, nfl: C.nfl0,
      netDebt: C.netDebt0, deficitPrev: 0.017,
      idxCPI: 1, idxW: 1, pensionIdx: 1, jsIdx: 1, welIdx: 1,
      fuelRate: 1, discScale: 1, taxScale: 1,
      cap: { health: 1, aged: 1, dental: 1, edu: 1, ndis: 1 },
      relp: { health: 1, aged: 1, dental: 1, edu: 1, ndis: 1 },
      relpBase: { health: 1, aged: 1, dental: 1, edu: 1, ndis: 1 },
      prem: { health: 0, aged: 0, dental: 0, edu: 0, ndis: 0 },
      piCore: C.cpi0, excess: 0,
      ndisNom: C.spend0.ndis, ndisCreep: 1,
      human: 1, lifeExp: C.lifeExp0, homeown: C.homeown0,
      Ib: 0, Id: 0, Gi: 0, costIdx: 1, capIdx: 1,
      assetIdx: 1, wealthBase: 1, estateIdx: 1,
      sh: { gap: 0, pi: 0, tot: 0, tfp: 0, hp: 0, x: 0 },
      prevTariff: 0, prevGst: C.rev0.gst, prevCarbon: 0,
      Cn: 0, yd: 0, jgJobs: 0, popTot: sum(pop),
      mortMult: 1, emissions: C.emissions0, discGapPrev: 0
    };
    return S;
  }

  // ------------------------------------------------------------------ the year
  /* prepare(): everything that is known before demand is solved */
  function prepare(S, P, n, ev, rng, pins) {
    const X = { n };
    const sh = { gap: S.sh.gap * 0.4, pi: S.sh.pi * 0.4, tot: 0, tfp: 0, hp: 0, x: S.sh.x * 0.5 };
    // events: one-off shocks queued for this year
    const patch = [];
    ev.forEach((e) => {
      const k = e.kind;
      const m = e.mag === undefined ? 1 : e.mag;
      if (k === 'oreCrash') sh.tot -= 0.25 * m;
      else if (k === 'oreBoom') sh.tot += 0.25 * m;
      else if (k === 'pandemic') { sh.gap -= 0.035 * m; sh.pi -= 0.005 * m; sh.x -= 0.10 * m; patch.push(['deaths', 0.35 * m]); }
      else if (k === 'financialCrisis') { sh.gap -= 0.045 * m; sh.hp -= 0.22 * m; patch.push(['credit', 0.15 * m]); }
      else if (k === 'oilShock') { sh.pi += 0.035 * m; sh.gap -= 0.015 * m; }
      else if (k === 'drought') { sh.gap -= 0.012 * m; sh.x -= 0.06 * m; sh.pi += 0.008 * m; }
      else if (k === 'housingBoom') sh.hp += 0.20 * m;
      else if (k === 'techBoom') { sh.tfp += 0.04 * m; sh.gap += 0.01 * m; }
      else if (k === 'techBust') { sh.tfp -= 0.03 * m; sh.gap -= 0.02 * m; }
      else if (k === 'war') { sh.pi += 0.025 * m; sh.gap -= 0.01 * m; sh.x -= 0.05 * m; patch.push(['defence', 0.012 * m]); }
      else if (k === 'refugees') patch.push(['popAdd', 0.4 * m]);
      else if (k === 'patch') patch.push(['patch', e]);
    });
    if (P.c_vol > 0) {
      sh.gap += normal(rng) * 0.006 * P.c_vol;
      sh.pi += normal(rng) * 0.004 * P.c_vol;
      sh.tot += normal(rng) * 0.04 * P.c_vol;
      sh.hp += normal(rng) * 0.03 * P.c_vol;
    }
    X.sh = sh;

    // ---- state patches from the debug panel
    const T = Object.assign({}, S, {
      pop: S.pop.slice(), cap: Object.assign({}, S.cap), relp: Object.assign({}, S.relp)
    });
    patch.forEach(([k, v]) => {
      if (k === 'popAdd') { for (let i = 0; i < 6; i++) T.pop[i] += v * C.pop0[i] / sum(C.pop0); }
      if (k === 'patch') {
        const path = v.target.split('.');
        let o = T;
        for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
        const last = path[path.length - 1];
        if (v.op === 'mul') o[last] *= v.value; else if (v.op === 'add') o[last] += v.value; else o[last] = v.value;
      }
    });
    X.deathBoost = patch.filter((p) => p[0] === 'deaths').reduce((s, p) => s + p[1], 0);
    X.credit = patch.filter((p) => p[0] === 'credit').reduce((s, p) => s + p[1], 0);
    X.defExtra = patch.filter((p) => p[0] === 'defence').reduce((s, p) => s + p[1], 0);
    S = T;
    X.S = T;

    // ---- demography
    const oldPop = S.pop;
    const women = 0.5 * (oldPop[1] + oldPop[2]);
    const births = P.p_tfr * women / C.births.span;
    const mortScale = S.mortMult * (1 - P.p_mortImp) * (1 + X.deathBoost);
    const nom = P.p_nom / 1000;
    const pop = new Array(6);
    const flowIn = [births, 0, 0, 0, 0, 0];
    for (let i = 0; i < 5; i++) flowIn[i + 1] = oldPop[i] * C.ageOut[i];
    for (let i = 0; i < 6; i++) {
      const out = oldPop[i] * C.ageOut[i];
      const deaths = oldPop[i] * C.mort[i] * mortScale;
      pop[i] = Math.max(0.01, oldPop[i] + flowIn[i] - out - deaths + nom * C.nomSplit[i]);
    }
    X.pop = pop; X.popTot = sum(pop); X.births = births;
    X.deaths = sum(oldPop.map((p, i) => p * C.mort[i] * mortScale));
    X.LF = laborForce(pop, P);

    // ---- supply side
    X.K = S.K * (1 - C.delta) + S.Ib + S.Gi;
    X.hours = P.l_hours;
    // human capital builds slowly from delivered education quality
    X.human = S.human + 0.06 * ((S.eduDelivered || 1) - S.human);
    const gA = P.l_gA + 0.002 * (P.l_rnd - 1) + 0.0015 * (P.g_infra - 1) + 0.004 * (X.human - 1);
    X.A = S.A * (1 + gA) * (1 + sh.tfp);
    X.nairu = clamp(C.nairu0 + P.l_nairuShift + 0.004 * (P.g_js - 1) - 0.002 * (P.g_vet - 1) - 0.004 * (P.g_train - 1) * 0.3, 0.015, 0.12);
    X.Leff = X.LF * (1 - X.nairu) * Math.pow(X.hours, 0.45);
    X.Ystar = X.A * Math.pow(X.K, C.alpha) * Math.pow(X.Leff, 1 - C.alpha);

    // ---- world, terms of trade, exchange rate
    const tot = P.x_totLong + 0.7 * (S.ToT - P.x_totLong) + sh.tot;
    X.ToT = clamp(pins.tot !== undefined ? pins.tot : tot, 0.4, 2);
    // monetary: Taylor rule on last year's outcome
    const piPrev = S.piCore === undefined ? S.pi : S.piCore, gapPrev = S.gap;
    const credEff = clamp(P.m_cred * (1 - 0.6 * P.f_monFin) * (S.netDebt / S.Yn > 1.2 ? 0.85 : 1), 0, 1);
    X.credEff = credEff;
    const taylor = P.m_neutral + piPrev + 0.5 * (piPrev - P.m_target) + 0.5 * gapPrev;
    let rcash = P.m_mode === 1 ? P.m_cash : 0.5 * S.rcash + 0.5 * taylor;
    rcash = clamp(rcash, 0.001, 0.25);
    if (pins.rcash !== undefined) rcash = pins.rcash;
    X.rcash = rcash;
    X.rm = rcash + C.mortSpread;
    const riskPrem = 0.03 * Math.max(0, S.netDebt / S.Yn - 0.6);
    X.bond = rcash + C.termPremium + riskPrem + 0.02 * P.f_monFin;
    X.eff = S.eff + 0.15 * (X.bond - S.eff);
    // fx
    const lnE = 0.5 * Math.log(X.ToT) + 3 * (rcash - P.x_worldRate - (C.rcash0 - 0.038)) - 1.5 * P.f_monFin * S.deficitPrev
      - 0.25 * (P.x_tariff) - 0.4 * (S.nfl / S.Yn - C.nfl0 / C.Y0);
    X.fx = clamp(pins.fx !== undefined ? pins.fx : Math.exp(0.5 * Math.log(S.fx) + 0.5 * lnE), 0.4, 2.5);
    const dlnE = Math.log(X.fx / S.fx);
    X.Pm = S.Pm * (1 + C.worldInfl - dlnE);
    X.Px = X.ToT * X.Pm;

    // ---- expectations, inflation, wages
    X.pe = 0.5 * S.pe + 0.5 * (credEff * P.m_target + (1 - credEff) * piPrev);
    let levelPush = 0;
    levelPush += 0.30 * (P.x_tariff - S.prevTariff);
    const gstBase = 0.52 + 0.075 * P.t_gstFood + 0.06 * P.t_gstHealth + 0.04 * P.t_gstEdu;
    const gstEff = P.t_gst * gstBase;
    levelPush += 0.9 * (gstEff - S.prevGstEff);
    levelPush += 0.0004 * (P.t_carbon - S.prevCarbon);
    X.gstEff = gstEff;
    const monPush = 2.0 * P.f_monFin * Math.max(0, S.deficitPrev);
    let pi = X.pe + P.m_kappa * gapPrev + 0.06 * (C.worldInfl - dlnE - X.pe) + sh.pi + levelPush + monPush + 0.8 * (S.excess || 0);
    pi = clamp(pi, -0.05, 0.4);
    if (pins.pi !== undefined) pi = pins.pi;
    X.pi = pi;
    X.piCore = pi - levelPush - 0.5 * sh.pi;
    X.P = S.P * (1 + pi);
    const gprod = 0.011 + 0.4 * (gA - C.gA);
    let w = X.pe + gprod + 0.30 * gapPrev + P.l_wagePush + 0.2 * (pi - X.pe);
    if (pins.w !== undefined) w = pins.w;
    X.w = w;
    X.wavg = S.wavg * (1 + w);
    X.gprod = gprod;
    X.idxCPI = S.idxCPI * (1 + pi);
    X.idxW = S.idxW * (1 + w);

    // ---- housing
    const hhSize = C.hhSize0 * Math.pow(0.998, n);
    X.H = X.popTot / hhSize;
    const tight = (X.H / S.dwell) / (S.H0 / C.dwellings0);
    X.tight = tight;
    const ydHH = S.yd / X.H;
    const rrm = X.rm - X.pe;
    const rrm0 = C.rcash0 + C.mortSpread - 0.027;
    const gx = 0.02;
    let tgtLn = Math.log(S.tgtBase) + Math.log(ydHH / S.ydHH0) + 0.012 * n + 0.4 * Math.log((C.rcash0 + C.mortSpread) / Math.max(0.025, X.rm))
      + 1.5 * Math.log(tight) + Math.log(P.h_foreign) * 0.15
      + 0.05 * (P.t_negGear ? 0 : -1) + 0.04 * (P.t_cgtDisc - 0.5)
      + 0.20 * P.h_firstHome;
    X.tgtLn = tgtLn;
    const dlnTgt = tgtLn - Math.log(S.tgt);
    let dlnHP = dlnTgt + 0.30 * (Math.log(S.tgt) - Math.log(S.HP)) + 0.25 * (S.hpgrLn - S.dlnTgtPrev)
      + sh.hp;
    dlnHP = clamp(dlnHP, -0.35, 0.35);
    if (pins.hp !== undefined) dlnHP = pins.hp;
    X.dlnTgt = dlnTgt;
    X.HP = S.HP * Math.exp(dlnHP);
    X.tgt = Math.exp(tgtLn);
    X.hpgr = Math.exp(dlnHP) - 1;
    X.hpgrLn = dlnHP;
    let rentG = w + 0.8 * Math.log(tight / (S.tight || 1));
    rentG = P.h_rentCap ? Math.min(rentG, pi) : rentG;
    X.rent = S.rent * (1 + clamp(rentG, -0.1, 0.25));
    X.costIdx = S.costIdx * 1.01 * (1 + 0.3 * (P.x_tariff - S.prevTariff));
    const capTarget = Math.pow(1.012, n) * P.h_supply;
    X.capIdx = capTarget > S.capIdx ? Math.min(capTarget, S.capIdx * 1.10) : capTarget;

    // ---- real investment decisions
    const rr = rcash - X.pe;
    const rr0 = C.rcash0 - 0.027;
    X.rr = rr;
    const tc0 = 0.30;
    const wealthDrag = 1 - 0.8 * P.w_rate * (P.w_thresh < 50e6 ? 1 : 0.4);
    X.Ib = S.Ib0 * (X.Ystar / S.Ystar0) * Math.exp(-2.0 * (rr - rr0) + 0.6 * gapPrev + 0.4 * Math.log((1 - P.t_corp) / (1 - tc0))
      + 0.3 * (X.ToT - 1)) * wealthDrag;
    // builders respond to household growth, the price signal and the shortage signal
    const need = (X.H - S.Hlast) * 1000 + C.demolition * S.dwell * 1000;
    const hpRel = clamp(X.HP / (X.P * X.costIdx), 0.5, 2.5);
    const compRaw = Math.max(20, need) * (C.completions0 / 172) * Math.pow(hpRel, 1.5) * Math.pow(clamp(X.tight, 0.8, 1.4), 2)
      * Math.exp(-2.0 * (rr - rr0));
    const compCap = C.completions0 * X.capIdx * 1.04;
    const comp = Math.min(compRaw, compCap);
    X.idConstrained = compRaw > compCap;
    X.Id = S.Id0 * comp / C.completions0;
    X.completions = comp + P.g_pubHouse;
    X.dwell = S.dwell * (1 - C.demolition) + X.completions / 1000;
    return X;
  }

  /* services and public spending that does not depend on this year's GDP */
  function services(S, X, P, n) {
    const out = { svc: {}, lines: {}, vol: {}, nom: {} };
    const needIdx = {};
    SVC_KEYS.forEach((s) => { needIdx[s] = needIndex(X.pop, s) * Math.pow(1 + (C.svc[s].trend || 0), n); });
    out.needIdx = needIdx;
    const m = {};     // funding multiplier per line
    SVC_LINES.forEach((l) => {
      m[l.key] = l.key === 'dental' ? P.g_dentalCover / C.dentalCover0 : P[l.lever];
    });
    const popIdx = X.popTot / sum(C.pop0);
    // group delivered indices
    SVC_KEYS.forEach((s) => {
      const lines = SVC_LINES.filter((l) => l.svc === s);
      const sl = C.svc[s];
      if (s === 'ndis') return;
      const base = sum(lines.map((l) => C.spend0[l.key]));
      const mAvg = sum(lines.map((l) => C.spend0[l.key] * m[l.key])) / base;
      const capRatio = S.cap[s] / needIdx[s] * (1 + sl.slack);
      let delivered;
      if (P.god_workforce) delivered = mAvg;
      else {
        const mi = Math.min(mAvg, capRatio);
        delivered = mi + 0.3 * Math.max(0, mAvg - capRatio);
      }
      out.svc[s] = { m: mAvg, capRatio, delivered, need: needIdx[s], excess: Math.max(0, mAvg - capRatio) };
      lines.forEach((l) => {
        const mi = m[l.key];
        const cr = capRatio;
        const d = P.god_workforce ? mi : Math.min(mi, cr) + 0.3 * Math.max(0, mi - cr);
        const base0 = C.spend0[l.key];
        out.vol[l.key] = base0 * needIdx[s] * d;
        out.nom[l.key] = base0 * needIdx[s] * mi * S.relp[s] * X.P;
      });
    });
    // NDIS: capped nominal growth
    const nd = out.svc.ndis = {};
    const creep = S.ndisCreep * (n === 0 ? 1 : 1.035);
    const natural = C.spend0.ndis * needIdx.ndis * creep * S.relp.ndis * X.P;
    const capped = Math.min(natural, S.ndisNom * (1 + P.g_ndisCap));
    const vol = capped / (S.relp.ndis * X.P);
    nd.need = needIdx.ndis * creep; nd.m = 1;
    nd.delivered = vol / (C.spend0.ndis * nd.need);
    nd.capRatio = 1; nd.excess = 0;
    out.nom.ndis = capped; out.vol.ndis = vol; out.ndisCreep = creep;

    // plain lines
    const drift = Math.pow(1 + P.g_drift, n);
    PLAIN_LINES.forEach((l) => {
      const v = C.spend0[l.key] * popIdx * drift * P[l.lever] * S.discScale;
      out.vol[l.key] = v;
      out.nom[l.key] = v * X.P;
    });
    // defence as a share of last year's GDP
    const defShare = P.g_defence + X.defExtra;
    out.nom.defence = defShare * S.Yn * (n === 0 ? 1 : 1 + X.pi + 0.02) * S.discScale;
    out.vol.defence = out.nom.defence / X.P;
    // econ subsidies (transfer to firms)
    const sub = C.spend0.econ * popIdx * drift * P.g_econ * S.discScale;
    out.vol.econ = sub; out.nom.econ = sub * X.P;
    // public housing build
    out.pubHouseNom = P.g_pubHouse * 0.55 * X.P * X.costIdx;
    out.nom.housing += out.pubHouseNom;
    out.vol.housing += out.pubHouseNom / X.P;
    return out;
  }

  /* One evaluation of the economy at real GDP = Y and nominal consumption Cn.
     cal === null: raw pass used for calibration (no scalers). */
  function econ(S, X, P, SV, Y, Cn, cal, dShare, mExtra) {
    const n = X.n;
    const R = { rev: {}, spend: {}, raw: {} };
    // ---- labour market
    const gap = Y / X.Ystar - 1;
    let u = clamp(X.nairu - C.okun * gap, 0.012, 0.25);
    const unemp0 = X.LF * u;
    let jgJobs = 0;
    if (P.g_jg) jgJobs = 0.7 * unemp0;
    const unemp = unemp0 - jgJobs;
    const uShown = unemp / X.LF;
    const emp = X.LF - unemp;
    const employees = C.empShare * emp;
    const Wn = X.wavg * employees;
    R.gap = gap; R.u = uShown; R.uRaw = u; R.emp = emp; R.jgJobs = jgJobs; R.Wn = Wn;
    const sg = P.s_sg;
    const LabCash = Wn / (1 + sg);
    const SGc = Wn - LabCash;

    // ---- trade (real)
    const retal = 1 - P.x_retaliate * P.x_tariff;
    const Xr = S.X0 * Math.pow(1 + P.x_worldGrowth, n) * Math.pow(X.fx, -0.7) * (0.93 + 0.07 * P.x_students)
      * Math.max(0.3, retal) * (1 + X.sh.x);
    const Mr = S.M0 * Math.pow(Y / S.Y0, 1.1) * Math.pow(X.fx, 0.7) / (1 + P.x_tariff * 0.8) + (mExtra || 0);
    const Xn = Xr * X.Px, Mn = Mr * X.Pm;

    // ---- expenditure on investment (nominal)
    const Ibn = X.Ib * X.P;
    const Idn = X.Id * X.P * X.costIdx;
    const Ginom = SV.giNom;
    const Gcnom = SV.gcNom + (P.g_jg ? jgJobs * (P.g_jgWage + 12000) / 1000 : 0);
    const jgCost = P.g_jg ? jgJobs * (P.g_jgWage + 12000) / 1000 : 0;
    R.jgCost = jgCost;

    // ---- taxes on production and products (from last-iteration consumption)
    const k = (cal && cal.k) || {};
    const kk = (name) => (k[name] === undefined ? 1 : k[name]);
    const Crl = Cn / X.P;
    const rv = R.rev;
    const raw = R.raw;
    raw.gst = X.gstEff * Cn / (1 + P.t_gst);
    raw.fuel = S.fuelRate * (Crl / S.C0real) ** 0.8 * Math.pow(0.975, n) * P.t_fuelMult * (1 - 0.35 * (1 - Math.exp(-0.004 * P.t_carbon)));
    raw.tobacco = Math.pow(0.92, n) * Math.pow(X.P, 0.5) * P.t_tobacco;
    raw.alcohol = Cn * P.t_alcohol;
    raw.customs = Mn;
    raw.payroll = Wn * P.t_payroll;
    const turnover = Math.exp(1.2 * (X.hpgr - 0.04)) * (1 + 0.8 * P.t_stampSwap);
    raw.stamp = X.HP * turnover * (X.H / S.H0) * (1 - 0.6 * P.t_stampSwap);
    raw.stampNoSwap = X.HP * Math.exp(1.2 * (X.hpgr - 0.04)) * (X.H / S.H0);
    raw.land = P.t_land * (0.5 * X.HP + 0.5 * (S.YnLast / S.Yn0));
    raw.gambling = Cn * P.t_gamble;
    raw.motor = X.popTot * X.P;
    raw.insurance = Cn;
    raw.otherTax = S.YnLast / S.Yn0;
    const miningVol = Math.pow(1.015, n);
    raw.royalties = (1 + 0.9 * (X.ToT - 1)) * X.P * miningVol * P.t_royalty;
    const emis = S.emissions0 * Math.pow(Y / S.Y0, 0.7) * Math.pow(0.98, n) * Math.exp(-0.004 * P.t_carbon);
    R.emissions = emis;
    raw.carbon = P.t_carbon * emis / 1000;

    ['gst', 'fuel', 'tobacco', 'alcohol', 'customs', 'payroll', 'stamp', 'land', 'gambling', 'motor', 'insurance', 'otherTax', 'royalties'].forEach((nm) => {
      rv[nm] = kk(nm) * raw[nm];
    });
    rv.carbon = raw.carbon;
    const tariffRev = P.x_tariff * Mr * X.Pm;
    rv.customs += tariffRev;
    // land tax picks up part of the stamp duty swap
    rv.land += P.t_stampSwap * 0.6 * kk('stamp') * raw.stampNoSwap;

    const TOPP = rv.gst + rv.fuel + rv.tobacco + rv.alcohol + rv.customs + rv.payroll + rv.stamp + rv.land
      + rv.gambling + rv.motor + rv.insurance + rv.otherTax + rv.royalties + rv.carbon;

    // ---- income side
    const Yn = Cn + Ibn + Idn + Gcnom + Ginom + Xn - Mn;     // expenditure side
    const GOS = Yn - Wn - TOPP;
    const GOShh = C.ghh * GOS;
    const GOScorp = GOS - GOShh;
    R.Yn = Yn; R.TOPP = TOPP; R.GOS = GOS;

    // interest and income flows
    const dNI = S.hhDebt * (X.rm - (C.rcash0 + C.mortSpread)) * 0.65;   // extra net interest households pay
    const intGov = P.god_noInterest ? 0 : S.netDebt * X.eff * (1 - P.f_monFin);
    const nipPriv = S.nfl * (C.nipRate.debt * (X.rcash + C.nipRate.spread) + C.nipRate.equity * C.nipRate.equityReturn) * (0.8 + 0.2 * (1 + 2 * (X.ToT - 1)));
    const nipGov = C.govIntForeign * intGov;
    const nipTot = nipPriv + nipGov;

    // ---- company tax and avoidance
    const enfEff = P.e_enforce / 4.5;
    const leak = clamp(P.e_shift * Math.exp(-0.32 * (enfEff - 1)) * (P.t_gmt ? 0.55 : 1), 0, 0.9);
    R.leak = leak;
    const corpBase = Math.max(0, GOScorp + dNI);
    raw.corp = P.t_corp * corpBase * (1 - leak);
    rv.corp = kk('corp') * raw.corp;
    const mprof = Math.max(0.1, S.mining0 * (Yn / S.Yn0)) * Math.max(0.2, 1 + 2.0 * (X.ToT - 1));
    R.mprof = mprof;
    raw.rent = mprof;
    rv.rent = kk('rent') * raw.rent + P.t_rent * Math.max(0, mprof - 0.6 * S.mining0 * (Yn / S.Yn0)) * 0.8;
    rv.fbt = kk('fbt') * Wn;
    raw.superTax = 0.7 * P.s_contribTax * SGc + 0.3 * P.s_earnTax * S.superA * 0.065;
    rv.superTax = kk('superTax') * raw.superTax;
    const afterTaxCorp = Math.max(0, corpBase - nipPriv - rv.corp - rv.rent - rv.fbt);
    const divDom = C.payout * afterTaxCorp;

    // ---- government payments to people
    const T = {};
    const ur = unemp;
    const jsRec = C.jsFixedRecipients + ur * 1.05;
    const pensRec = (X.pop[4] * 0.5 * clamp(1 - 0.12 * (P.g_retAge - 67), 0.3, 1.4) * P.g_means + X.pop[5] * 0.68);
    T.pension = pensRec * S.pensionPer0 * S.pensionIdx * P.g_pension / 1000;
    T.js = jsRec * S.jsPer0 * S.jsIdx * P.g_js / 1000;
    const needDsp = (0.3 * X.pop[2] + 0.7 * X.pop[3]) / (0.3 * C.pop0[2] + 0.7 * C.pop0[3]);
    const needFam = (X.pop[0] + 0.2 * X.pop[1]) / (C.pop0[0] + 0.2 * C.pop0[1]);
    const needVet = (X.pop[4] + X.pop[5]) / (C.pop0[4] + C.pop0[5]);
    T.dsp = C.spend0.dsp * needDsp * S.welIdx * P.g_dsp;
    T.family = C.spend0.family * needFam * S.welIdx * P.g_family;
    T.vets = C.spend0.vets * needVet * S.welIdx * P.g_vets;
    const adults = 0.8 * X.pop[1] + X.pop[2] + X.pop[3] + X.pop[4] + X.pop[5];
    T.ubi = P.g_ubi * adults / 1000;
    T.carbonDiv = P.t_carbonDiv * rv.carbon;
    const gst0scaled = (cal && cal.base ? cal.base.gst : C.rev0.gst) * (Cn / (cal && cal.base ? cal.base.Cn : 1));
    T.gstComp = P.t_gstComp * Math.max(0, rv.gst - gst0scaled);
    T.compTotal = T.carbonDiv + T.gstComp;
    const cashTr = T.pension + T.js + T.dsp + T.family + T.vets + T.ubi + T.compTotal;
    R.T = T;

    // ---- household income by group
    const CIhh = GOShh + divDom + (1 - C.govIntForeign) * intGov;
    R.CIhh = CIhh; R.LabCash = LabCash;
    const brk = taxBrackets(P, n, S);
    const units = C.taxUnits;
    const groups = C.groups.length;
    const grp = [];
    let pitRaw = 0, medRaw = 0;
    for (let g = 0; g < groups; g++) {
      const li = LabCash * C.labourShare[g] / 100;
      const ci = CIhh * C.capitalShare[g] / 100;
      const ubi = T.ubi * C.gShare[g];
      const trans = T.pension * C.alloc.pension[g] + T.js * C.alloc.js[g] + T.dsp * C.alloc.dsp[g] + T.family * C.alloc.family[g]
        + T.vets * C.alloc.vets[g] + ubi + T.compTotal * C.compShare[g];
      const nUnits = units * C.gShare[g];
      const taxable = li + C.capTaxable * ci + ubi;
      const perUnit = taxable / nUnits * 1000;     // dollars
      let t = 0, med = 0;
      for (let q = 0; q < 3; q++) {
        const inc = perUnit * C.taxQuad.m[q];
        const tt = pitFn(inc, brk, C.medicareThreshold);
        const ex = inc > C.medicareThreshold ? inc * brk.med : 0;
        t += C.taxQuad.w[q] * tt; med += C.taxQuad.w[q] * ex;
      }
      const pitG = t * nUnits / 1000;
      pitRaw += pitG; medRaw += med * nUnits / 1000;
      grp.push({ li, ci, trans, pit: pitG, nUnits, perUnit });
    }
    raw.pit = pitRaw;
    rv.pit = kk('pit') * raw.pit * S.taxScale;
    const pitScale = raw.pit > 0 ? rv.pit / raw.pit : 0;
    R.medicare = kk('pit') * medRaw * S.taxScale;
    // capital gains
    const lock = 1 - 0.4 * (0.5 - P.t_cgtDisc);
    raw.cgt = (Yn / S.Yn0) * Math.max(0.2, 1 + 3 * (X.hpgr - 0.04)) * (1 - P.t_cgtDisc) * lock;
    rv.cgt = kk('cgt') * raw.cgt;
    rv.negGear = P.t_negGear ? 0 : 9.0 * (Yn / S.Yn0) * 0.75;
    rv.franking = P.t_franking ? 0 : 5.5 * (divDom / (cal && cal.base ? cal.base.divDom : divDom));
    // wealth and estates
    const avoid = 1 - Math.exp(-P.w_avoid * P.w_rate * 100);
    R.wealthAvoid = avoid;
    const excess = wealthExcessB(P.w_thresh) * S.assetIdx * S.wealthBase;
    rv.wealth = P.w_rate * excess * (1 - avoid) * P.w_admin;
    R.wealthBaseB = excess;
    const estateTax = P.w_inherit * 100 * S.estateIdx * 0.35 * (1 - 0.4 * (1 - Math.exp(-P.w_inherit * 4)));
    rv.inherit = estateTax;
    rv.nonTax = kk('nonTax') * (Yn / S.Yn0) ** 0.8;
    R.units = null;

    // allocate taxes and compute disposable income and consumption
    const wealthShareTop = P.w_thresh >= 5e6 ? 1 : 0.7;
    let sumMpcYd = 0, ydTot = 0, cashYd = 0;
    const gOut = [];
    for (let g = 0; g < groups; g++) {
      const gg = grp[g];
      const cgtG = (rv.cgt + rv.negGear) * C.cgtShare[g];
      const wG = g === 10 ? rv.wealth * wealthShareTop : g === 9 ? rv.wealth * (1 - wealthShareTop) : 0;
      const estG = rv.inherit * C.cgtShare[g];
      const frG = rv.franking * C.cgtShare[g];
      const intG = dNI * C.debtShare[g];
      const pitG = gg.pit * pitScale;
      const yd = gg.li + gg.ci + gg.trans - pitG - cgtG - wG - estG - frG - intG;
      const ydP = Math.max(0.1, yd);
      sumMpcYd += C.mpc[g] * ydP;
      ydTot += yd;
      gOut.push({ li: gg.li, ci: gg.ci, trans: gg.trans, pit: pitG, other: cgtG + wG + estG + frG, yd, perPerson: 0 });
    }
    const mpcScale = (cal && cal.mpcScale) || 1;
    const wealthFx = 1 + 0.04 * (X.hpgr - 0.04) * 1.0 + 0.0;
    const Cnew = mpcScale * sumMpcYd * wealthFx;
    R.Cnew = Cnew; R.sumMpcYd = sumMpcYd;
    R.groups = gOut;
    const taxHH = rv.superTax;
    R.HHdisp = ydTot + SGc - taxHH;

    // ---- government finance
    const sp = R.spend;
    SVC_LINES.forEach((l) => { sp[l.key] = SV.nom[l.key]; });
    sp.ndis = SV.nom.ndis;
    PLAIN_LINES.forEach((l) => { sp[l.key] = SV.nom[l.key]; });
    sp.defence = SV.nom.defence; sp.econ = SV.nom.econ;
    sp.pension = T.pension; sp.js = T.js; sp.dsp = T.dsp; sp.family = T.family; sp.vets = T.vets;
    sp.ubi = T.ubi; sp.compensation = T.compTotal; sp.jobGuarantee = jgCost;
    sp.interest = intGov;
    const spendTot = sum(Object.keys(sp).map((kx) => sp[kx]));
    const revTot = sum(Object.keys(rv).map((kx) => rv[kx]));
    R.revTot = revTot; R.spendTot = spendTot;
    R.bal = revTot - spendTot;

    // ---- sector accounts (net lending). Each sector from its own statement.
    const subsidy = sp.econ;
    // households
    const hhIncome = ydTot + SGc - taxHH;
    const Shh = hhIncome - Cn;
    const NLhh = Shh - Idn;
    // corporations
    const corpIncome = GOScorp + dNI + subsidy;
    const corpOut = nipPriv + rv.corp + rv.rent + rv.fbt + divDom + rv.nonTax;
    const Scorp = corpIncome - corpOut;
    const NLcorp = Scorp - Ibn;
    // government (net lending uses revenue lines less payments; goods and services purchases are Gc + Gi)
    const NLgov = revTot - (Gcnom + Ginom + cashTr + subsidy + intGov);
    // rest of world
    const CA = Xn - Mn - nipTot;
    const NLrow = -CA;
    R.sectors = { hh: NLhh, corp: NLcorp, gov: NLgov, row: NLrow };
    R.identity = NLhh + NLcorp + NLgov + NLrow;
    R.CA = CA; R.NIP = nipTot;
    R.S = { hh: Shh, corp: Scorp };

    // demand
    const Cr = Cnew / X.P;
    const Gcr = SV.gcReal + (P.g_jg ? jgCost / X.P : 0);
    const demand = Cr + X.Ib + X.Id + Gcr + SV.giReal + Xr - Mr;
    R.Xr = Xr; R.Mr = Mr; R.Xn = Xn; R.Mn = Mn; R.Ibn = Ibn; R.Idn = Idn; R.Gcnom = Gcnom; R.Ginom = Ginom;
    R.Cr = Cr; R.Gcr = Gcr; R.demandReal = demand;
    R.demandSum = demand + ((dShare || 0) + X.sh.gap) * X.Ystar;
    R.divDom = divDom; R.dNI = dNI; R.intGov = intGov; R.nipPriv = nipPriv; R.SGc = SGc;
    R.cashTr = cashTr; R.employees = employees; R.unemp = unemp; R.unemp0 = unemp0;
    R.pensRec = pensRec; R.jsRec = jsRec;
    R.tariffRev = tariffRev;
    return R;
  }

  /* Government spending totals that feed GDP (needs SV and X) */
  function govGoods(SV, X, P) {
    const cashLines = ['pension', 'js', 'dsp', 'family', 'vets'];
    let gc = 0, gi = 0, gcR = 0, giR = 0;
    const keys = Object.keys(SV.nom).filter((k) => cashLines.indexOf(k) < 0 && k !== 'econ');
    keys.forEach((k) => {
      const sh = C.gi0Share[k] || 0;
      gi += SV.nom[k] * sh; gc += SV.nom[k] * (1 - sh);
      giR += SV.vol[k] * sh; gcR += SV.vol[k] * (1 - sh);
    });
    SV.gcNom = gc; SV.giNom = gi; SV.gcReal = gcR; SV.giReal = giR;
  }

  // -------------------------------------------------------------- calibration
  let CAL = null;
  function calibrate() {
    const P = defaults();
    const S = baseState();
    // base-year drivers
    const Y0 = C.Y0;
    S.Y0 = Y0; S.Yn0 = Y0; S.YnLast = Y0; S.Yn = Y0;
    S.Ystar0 = Y0 / (1 + C.gap0); S.Ystar = S.Ystar0;
    const LF0 = laborForce(S.pop, P);
    S.LF0 = LF0;
    const u0 = C.nairu0 - C.okun * C.gap0;
    S.u = u0;
    const Leff0 = LF0 * (1 - C.nairu0);
    S.A = S.Ystar0 / (Math.pow(S.K, C.alpha) * Math.pow(Leff0, 1 - C.alpha));
    const emp0 = LF0 * (1 - u0);
    S.wavg = 0.475 * Y0 / (C.empShare * emp0);
    S.H0 = sum(S.pop) / C.hhSize0;
    S.Hlast = S.H0 - 0.160;
    S.hhSize = C.hhSize0;
    S.tight = 1;
    S.fuelRate = 1;
    S.emissions0 = C.emissions0;
    S.mining0 = C.mining0Share * Y0;
    S.C0real = C.shares.C * Y0;
    S.X0 = C.shares.X * Y0; S.M0 = C.shares.M * Y0;

    // base spending
    const X0 = { n: 0, P: 1, pop: S.pop, popTot: sum(S.pop), pi: C.cpi0, defExtra: 0, ToT: 1, fx: 1, Pm: 1, Px: 1, sh: { x: 0 } };
    X0.LF = LF0; X0.Ystar = S.Ystar0; X0.nairu = C.nairu0; X0.wavg = S.wavg; X0.H = S.H0; X0.HP = 1; X0.hpgr = 0.04;
    X0.gstEff = P.t_gst * 0.52; X0.rcash = C.rcash0; X0.rm = C.rcash0 + C.mortSpread; X0.eff = C.effDebtRate0;
    X0.costIdx = 1; X0.tight = 1; X0.Ib = 0; X0.Id = 0;
    S.relp = { health: 1, aged: 1, dental: 1, edu: 1, ndis: 1 };
    S.cap = { health: 1, aged: 1, dental: 1, edu: 1, ndis: 1 };
    S.pensionIdx = 1; S.jsIdx = 1; S.welIdx = 1;
    const pensRec0 = S.pop[4] * 0.5 + S.pop[5] * 0.68;
    S.pensionPer0 = C.spend0.pension / pensRec0 * 1000;
    const jsRec0 = C.jsFixedRecipients + LF0 * u0 * 1.05;
    S.jsPer0 = C.spend0.js / jsRec0 * 1000;
    const SV = services(S, Object.assign({}, X0), P, 0);
    govGoods(SV, X0, P);
    // residual business investment so shares sum to 1
    const Cn0 = C.shares.C * Y0;
    const Id0 = C.shares.Id * Y0;
    const Xn0 = C.shares.X * Y0, Mn0 = C.shares.M * Y0;
    const Ib0 = Y0 - Cn0 - Id0 - SV.gcNom - SV.giNom - Xn0 + Mn0;
    S.Ib0 = Ib0; S.Id0 = Id0; S.Ib = Ib0; S.Id = Id0; S.Gi = SV.giNom;
    X0.Ib = Ib0; X0.Id = Id0;
    // initial household disposable income guess (set after raw pass)
    S.hhDebt = C.hhDebt0; S.superA = C.superAssets0; S.nfl = C.nfl0; S.netDebt = C.netDebt0;
    S.yd = 0; S.ydHH0 = 1; S.tgtBase = 1; S.tgt = 1; S.hpgrLn = 0.04; S.dlnTgtPrev = 0.04; S.prevGstEff = P.t_gst * 0.52;

    // iterate the line scalers until revenue lines hit their targets. TOPP lines
    // depend only on spending, so they settle at once; income-based lines settle
    // after a few passes as GOS and household income stabilise.
    const cal = { k: {}, mpcScale: 1, base: null };
    const lines = ['pit', 'cgt', 'corp', 'gst', 'fuel', 'tobacco', 'alcohol', 'customs', 'payroll', 'stamp', 'land', 'gambling', 'motor', 'insurance', 'otherTax', 'royalties', 'rent', 'superTax'];
    let rawPass = null;
    for (let pass = 0; pass < 8; pass++) {
      rawPass = econ(S, X0, P, SV, Y0, Cn0, pass === 0 ? null : cal, 0);
      lines.forEach((nm) => {
        const rr = rawPass.raw[nm];
        cal.k[nm] = rr > 0 ? C.rev0[nm] / rr : 1;
      });
      cal.k.fbt = C.rev0.fbt / rawPass.Wn;
      cal.k.nonTax = C.rev0.nonTax;
    }
    const raw1 = econ(S, X0, P, SV, Y0, Cn0, cal, 0);
    cal.mpcScale = Cn0 / raw1.sumMpcYd;
    cal.base = { Cn: Cn0, gst: raw1.rev.gst, divDom: raw1.divDom };
    // final base-year pass for reference values
    const raw2 = econ(S, X0, P, SV, Y0, Cn0, cal, 0);
    S.yd = raw2.HHdisp;
    S.ydHH0 = S.yd / S.H0;
    S.base = { rev: raw2.rev, spend: raw2.spend };
    S.pti0 = (S.HP * C.medianHouse) / (raw2.LabCash / S.H0);
    CAL = { cal, S0: S, X0, SV0: SV, R0: raw2, P0: P };
    return CAL;
  }

  // ------------------------------------------------------------------ run loop
  function step(S, P, n, events, cal, dShare, gapTarget, rng) {
    // pins
    const pins = {};
    (P._pins || []).forEach((pn) => { if (n + C.baseYear >= pn.from && n + C.baseYear <= (pn.to || 9999)) pins[pn.name] = pn.value; });
    const X = prepare(S, P, n, events, rng, pins);
    S = X.S;
    // services and public volumes
    const Sx = Object.assign({}, S, { pop: X.pop });
    const SV = services(Sx, X, P, n);
    govGoods(SV, X, P);

    // solve
    const fixedY = gapTarget !== undefined ? X.Ystar * (1 + gapTarget) : undefined;
    let Y = fixedY !== undefined ? fixedY : S.Y, Cn = S.Cn || cal.base.Cn;
    let R = null;
    const damp = 0.65;
    for (let it = 0; it < 120; it++) {
      R = econ(Sx, X, P, SV, Y, Cn, cal, dShare);
      const Cn2 = Cn + damp * (R.Cnew - Cn);
      const dC = Math.abs(Cn2 - Cn) / Cn;
      Cn = Cn2;
      if (fixedY !== undefined) { if (dC < 1e-7) break; continue; }
      const Y2 = Y + damp * (R.demandSum - Y);
      const dY = Math.abs(Y2 - Y) / Y;
      Y = Y2;
      if (dY < 1e-7 && dC < 1e-7) break;
    }
    // capacity ceiling: demand beyond +3.5% of potential spills into imports and prices
    let mExtra = 0;
    const capY = X.Ystar * 1.035;
    if (fixedY === undefined && Y > capY) {
      Y = capY;
      for (let it = 0; it < 100; it++) {
        R = econ(Sx, X, P, SV, Y, Cn, cal, dShare, mExtra);
        const ex = R.demandSum - Y;
        const Cn2 = Cn + damp * (R.Cnew - Cn);
        const dC = Math.abs(Cn2 - Cn) / Cn;
        Cn = Cn2;
        mExtra = Math.max(0, mExtra + damp * ex);
        if (dC < 1e-7 && Math.abs(ex) / Y < 1e-7) break;
      }
    }
    R = econ(Sx, X, P, SV, Y, Cn, cal, dShare, mExtra);
    let dOut = dShare;
    if (fixedY !== undefined) dOut = (Y - R.demandReal) / X.Ystar;
    return { X, SV, R, Y, Cn, dOut, Sx, mExtra };
  }

  /* Build next state and the flat output row from a solved step */
  function advance(S0, P, n, sol, cal) {
    const { X, SV, R, Y, Cn, Sx } = sol;
    const S = Sx;
    const N = {};
    Object.assign(N, Sx);
    N.n = n; N.year = C.baseYear + n;
    N.pop = X.pop; N.popTot = X.popTot;
    N.K = X.K; N.A = X.A; N.P = X.P; N.Pm = X.Pm; N.Px = X.Px; N.ToT = X.ToT; N.fx = X.fx;
    N.pi = X.pi; N.piCore = X.piCore; N.excess = sol.mExtra / X.Ystar; N.pe = X.pe; N.w = X.w; N.wavg = X.wavg; N.rcash = X.rcash; N.eff = X.eff;
    N.idxCPI = X.idxCPI; N.idxW = X.idxW;
    N.Y = Y; N.Yn = R.Yn; N.YnLast = R.Yn; N.Ystar = X.Ystar; N.gap = R.gap; N.u = R.u;
    N.Cn = Cn;
    N.HP = X.HP; N.hpgr = X.hpgr; N.hpgrLn = X.hpgrLn; N.dlnTgtPrev = X.dlnTgt; N.tgt = X.tgt;
    N.Hlast = X.H; N.rent = X.rent; N.dwell = X.dwell; N.tight = X.tight; N.costIdx = X.costIdx; N.capIdx = X.capIdx;
    N.Ib = X.Ib; N.Id = X.Id; N.Gi = SV.giReal;
    N.yd = R.HHdisp;
    N.sh = { gap: X.sh.gap, pi: X.sh.pi, tot: 0, tfp: 0, hp: 0, x: X.sh.x };
    N.human = X.human;

    // public finance
    const deficit = -R.bal;
    N.netDebt = S.netDebt + deficit;
    N.deficitPrev = deficit / R.Yn;
    N.nfl = S.nfl - R.CA;
    // payment indices (indexation rules)
    N.pensionIdx = S.pensionIdx * (1 + (P.g_pensionIdx === 1 ? Math.max(X.pi, X.w) : X.pi));
    N.jsIdx = S.jsIdx * (1 + (P.g_jsIdx === 1 ? Math.max(X.pi, X.w) : X.pi));
    N.welIdx = S.welIdx * (1 + (P.g_welIdx === 1 ? Math.max(X.pi, X.w) : X.pi));
    N.fuelRate = S.fuelRate * (P.t_fuelIdx ? 1 + X.pi : 1);
    N.prevTariff = P.x_tariff; N.prevGstEff = X.gstEff; N.prevCarbon = P.t_carbon;

    // fiscal rule
    const balPct = R.bal / R.Yn;
    let dsc = S.discScale, ts = S.taxScale;
    if (P.f_mode === 1 || P.f_mode === 3) dsc = clamp(dsc * (1 + P.f_gain * 0.5 * (balPct - P.f_target)), 0.4, 1.4);
    if (P.f_mode === 2 || P.f_mode === 3) ts = clamp(ts * (1 - P.f_gain * 0.5 * (balPct - P.f_target)), 0.7, 1.6);
    N.discScale = dsc; N.taxScale = ts;

    // services: workforce and relative price
    const svcOut = SV.svc;
    N.cap = Object.assign({}, S.cap); N.relp = Object.assign({}, S.relp);
    N.relpBase = Object.assign({}, S.relpBase); N.prem = Object.assign({}, S.prem);
    SVC_KEYS.forEach((s) => {
      const sv = svcOut[s];
      const sl = C.svc[s];
      let g = sl.cap + 0.03 * (P.g_train - 1) * (s === 'edu' ? 0.2 : 1) + 0.00004 * (P.p_nom - 300);
      if (s !== 'ndis') {
        const pressure = clamp((sv.m - sv.capRatio) / Math.max(0.2, sv.m), 0, 0.5);
        g += 0.06 * pressure;
      }
      N.cap[s] = S.cap[s] * (1 + g);
      N.relpBase[s] = S.relpBase[s] * (1 + sl.relp);
      N.prem[s] = 0.6 * S.prem[s] + (s === 'ndis' ? 0 : 0.35 * (sv.excess / Math.max(0.5, sv.m)));
      N.relp[s] = N.relpBase[s] * (1 + N.prem[s]);
      if (P.god_workforce && s !== 'ndis') N.cap[s] = Math.max(N.cap[s], sv.need * sv.m);
    });
    N.ndisNom = SV.nom.ndis; N.ndisCreep = SV.ndisCreep;
    N.eduDelivered = svcOut.edu.delivered;
    // health -> mortality and life expectancy
    const hd = svcOut.health.delivered;
    N.lifeExp = S.lifeExp + 0.10 + 0.12 * (hd - 1) + 0.03 * (svcOut.aged.delivered - 1);
    N.mortMult = clamp(S.mortMult * (1 - 0.02 * (hd - 1)), 0.5, 1.5);

    // stocks
    const credit = P.c_vol * 0;
    N.hhDebt = S.hhDebt * (1 + 0.65 * X.hpgr + 0.35 * (R.Yn / S.Yn - 1) + 0.0);
    const retShare = (X.pop[4] + X.pop[5]) / (C.pop0[4] + C.pop0[5]);
    const ret = 0.045 + X.pi + 0.003;
    const benefits = 0.043 * S.superA * Math.pow(retShare, 0.5);
    N.superA = S.superA * (1 + ret) + R.SGc * 1.3 - benefits - R.rev.superTax;
    N.assetIdx = S.assetIdx * (1 + (R.Yn / S.Yn - 1) + 0.01 - 0.0);
    const flight = 0.05 * R.wealthAvoid + 1.5 * P.w_rate;
    N.wealthBase = S.wealthBase * (1 - clamp(flight, 0, 0.5));
    N.estateIdx = S.estateIdx * (1 + (R.Yn / S.Yn - 1) + 0.01);
    const priceToInc = (X.HP * C.medianHouse) / (R.LabCash / X.H);
    N.homeown = clamp(S.homeown - 0.0006 * (priceToInc - S.pti0) , 0.4, 0.8);
    N.emissions = R.emissions;

    // ---- outputs row
    const o = {};
    o.year = N.year;
    o.gdp = R.Yn; o.gdpReal = Y; o.gdpGrowth = S.Y ? Y / S.Y - 1 : 0;
    o.gdpPC = Y / X.popTot;    // $k per person, real
    o.potential = X.Ystar; o.gap = R.gap * 100;
    o.u = R.u * 100; o.emp = R.emp; o.LF = X.LF; o.pop = X.popTot;
    o.part = X.LF / (X.popTot - X.pop[0]) * 100;
    o.cpi = X.pi * 100; o.pe = X.pe * 100; o.rcash = X.rcash * 100; o.rm = X.rm * 100; o.bond = X.bond * 100;
    o.wage = X.w * 100; o.realWage = (X.w - X.pi) * 100;
    o.realWageIdx = X.wavg / X.P / (cal.wavgBase0);
    o.priceLevel = X.P;
    o.fx = X.fx; o.tot = X.ToT;
    o.rev = R.revTot; o.spend = R.spendTot; o.bal = R.bal;
    o.revPct = R.revTot / R.Yn * 100; o.spendPct = R.spendTot / R.Yn * 100; o.balPct = R.bal / R.Yn * 100;
    o.primaryPct = (R.bal + R.intGov) / R.Yn * 100;
    o.debt = N.netDebt; o.debtPct = N.netDebt / R.Yn * 100;
    o.interest = R.intGov; o.interestPct = R.intGov / R.Yn * 100;
    o.taxPct = (R.revTot - R.rev.nonTax) / R.Yn * 100;
    o.CA = R.CA; o.CAPct = R.CA / R.Yn * 100; o.nfl = N.nfl; o.nflPct = N.nfl / R.Yn * 100;
    o.exports = R.Xn; o.imports = R.Mn;
    o.sectorHH = R.sectors.hh / R.Yn * 100; o.sectorCorp = R.sectors.corp / R.Yn * 100;
    o.sectorGov = R.sectors.gov / R.Yn * 100; o.sectorRow = R.sectors.row / R.Yn * 100;
    o.identity = R.identity;
    o.C = R.Cr; o.Ib = X.Ib; o.Id = X.Id; o.Gc = R.Gcr; o.Gi = SV.giReal; o.Xr = R.Xr; o.Mr = R.Mr;
    o.wageShare = R.Wn / R.Yn * 100; o.profitShare = (R.GOS) / R.Yn * 100;
    // distribution
    const popTot = X.popTot;
    const per = R.groups.map((g, i) => Math.max(0.5, g.yd / (popTot * C.gShare[i])));
    const ds = distStats(per, C.gShare, C.sigma);
    o.gini = ds.gini * 100; o.poverty = ds.poverty * 100; o.medianInc = ds.median; o.povLine = ds.line;
    o.perGroup = per;
    o.gYd = R.groups.map((g) => g.yd); o.gPit = R.groups.map((g) => g.pit); o.gTrans = R.groups.map((g) => g.trans);
    o.gLi = R.groups.map((g) => g.li); o.gCi = R.groups.map((g) => g.ci); o.gOther = R.groups.map((g) => g.other);
    o.popC = X.pop.slice(); o.Wn = R.Wn; o.GOS = R.GOS; o.TOPP = R.TOPP; o.excessDemand = sol.mExtra;
    const totInc = sum(R.groups.map((g) => g.yd));
    o.topShare = (R.groups[9].yd + R.groups[10].yd) / totInc * 100;
    o.top1Share = R.groups[10].yd / totInc * 100;
    o.bottom20Share = (R.groups[0].yd + R.groups[1].yd) / totInc * 100;
    o.realMedian = ds.median / X.P;
    // payments vs poverty line
    o.pensionAdequacy = S.pensionPer0 * N.pensionIdx * P.g_pension / 1000 / ds.line * 100;
    o.jsAdequacy = S.jsPer0 * N.jsIdx * P.g_js / 1000 / ds.line * 100;
    o.pensioners = R.pensRec; o.jsRec = R.jsRec;
    o.unemployed = R.unemp;
    // tax detail
    o.pit = R.rev.pit; o.corp = R.rev.corp; o.gst = R.rev.gst;
    o.avgTaxRate = R.rev.pit / (R.LabCash + R.CIhh * C.capTaxable) * 100;
    o.leak = R.leak * 100;
    // housing
    o.hp = X.HP; o.house = X.HP * C.medianHouse; o.rentIdx = X.rent; o.rentK = X.rent * C.avgRent;
    o.dwellings = X.dwell; o.households = X.H; o.tight = X.tight; o.completions = X.completions;
    o.priceToIncome = priceToInc;
    o.rentBurden = (X.rent * C.avgRent) / (per[2] * 1.7) * 100;
    o.homeown = N.homeown * 100;
    o.hhDebt = N.hhDebt; o.dsr = N.hhDebt * X.rm / R.HHdisp * 100;
    o.mortgageStress = 100 / (1 + Math.exp(-(o.dsr - 17) * 0.45));
    o.hpgr = X.hpgr * 100;
    // services
    o.svc = {};
    SVC_KEYS.forEach((s) => { o.svc[s] = { delivered: svcOut[s].delivered, funded: svcOut[s].m, cap: svcOut[s].capRatio, need: svcOut[s].need, excess: svcOut[s].excess }; });
    o.healthIdx = svcOut.health.delivered * 100; o.agedIdx = svcOut.aged.delivered * 100;
    o.dentalIdx = svcOut.dental.delivered * 100; o.eduIdx = svcOut.edu.delivered * 100; o.ndisIdx = svcOut.ndis.delivered * 100;
    o.dentalCover = P.g_dentalCover * 100 * Math.min(1, svcOut.dental.delivered / Math.max(0.01, svcOut.dental.m));
    o.lifeExp = N.lifeExp; o.humanCapital = X.human;
    o.careGap = 100 - clamp(100 * (0.30 * Math.min(1, svcOut.health.delivered) + 0.20 * Math.min(1, svcOut.aged.delivered)
      + 0.15 * Math.min(1, svcOut.dental.delivered / 1.6) + 0.15 * Math.min(1, svcOut.edu.delivered)
      + 0.10 * Math.min(1, svcOut.ndis.delivered) + 0.10 * Math.min(1, o.jsAdequacy / 100 * 0.9 + 0.1)), 0, 100);
    o.workforceGap = 100 - 100 * Math.min(1, Math.min(svcOut.health.capRatio, svcOut.aged.capRatio));
    o.moneyVsStaff = svcOut.health.excess;
    // wealth
    o.billionaires = wealthHoldersAbove(1e9) * Math.pow(N.assetIdx * N.wealthBase, C.wealth.alpha);
    o.wealthTaxBase = R.wealthBaseB; o.wealth = R.rev.wealth; o.wealthAvoid = R.wealthAvoid * 100;
    o.superA = N.superA; o.superPct = N.superA / R.Yn * 100;
    o.taxGapB = R.leak * R.rev.corp / Math.max(0.01, 1 - R.leak);
    o.emissions = R.emissions;
    o.births = X.births; o.deaths = X.deaths; o.popGrowth = null;
    o.old = (X.pop[4] + X.pop[5]) / X.popTot * 100;
    o.dependency = (X.pop[0] + X.pop[4] + X.pop[5]) / (X.pop[1] + X.pop[2] + X.pop[3]) * 100;
    o.revLines = Object.assign({}, R.rev);
    o.spendLines = Object.assign({}, R.spend);
    o.debtService = R.intGov / R.revTot * 100;
    o.jgJobs = R.jgJobs;
    o.rev1 = R.rev;
    let bad = 0;
    Object.keys(o).forEach((k) => { if (typeof o[k] === 'number' && !isFinite(o[k])) { o[k] = 0; bad++; } });
    o.nonFinite = bad;
    return { N, o };
  }

  function run(Pin, events, opts) {
    opts = opts || {};
    if (!CAL) calibrate();
    const P = Object.assign(defaults(), Pin || {});
    const cal = CAL.cal;
    cal.wavgBase0 = CAL.S0.wavg;
    const evByYear = {};
    (events || []).forEach((e) => { (evByYear[e.year] = evByYear[e.year] || []).push(e); });
    let S = Object.assign({}, CAL.S0);
    S.pop = CAL.S0.pop.slice(); S.cap = Object.assign({}, CAL.S0.cap); S.relp = Object.assign({}, CAL.S0.relp);
    S.sh = Object.assign({}, CAL.S0.sh);
    // fill base derived state used by prepare()
    S.Ib0 = CAL.S0.Ib0; S.Id0 = CAL.S0.Id0;
    S.Cn = cal.base.Cn;
    const rng = mulberry32((P.c_seed || 1) * 7919);
    const rows = [];
    rows.push(baseOutputs(S, cal));
    const dList = [];
    const mode = opts.recordBaseline ? 'record' : 'scenario';
    const gapPath = [0.003, 0.002, 0.001];
    for (let n = 1; n <= C.horizon; n++) {
      const year = C.baseYear + n;
      const ev = evByYear[year] || [];
      let dShare = 0, gapTarget;
      if (mode === 'scenario' && opts.baselineD && !P.god_noDelays) dShare = opts.baselineD[n] || 0;
      if (mode === 'record') gapTarget = n <= gapPath.length ? gapPath[n - 1] : 0;
      const sol = step(S, P, n, ev, cal, dShare, gapTarget, rng);
      if (mode === 'record') dList[n] = sol.dOut;
      const out = advance(S, P, n, sol, cal);
      out.o.dShare = mode === 'record' ? sol.dOut : dShare;
      const prev = rows[rows.length - 1];
      out.o.gdpGrowth = prev.gdpReal ? sol.Y / prev.gdpReal - 1 : 0;
      out.o.popGrowth = (out.o.pop / prev.pop - 1) * 100;
      rows.push(out.o);
      S = out.N;
    }
    return { rows, dList, params: P };
  }
  function baseOutputs(S, cal) {
    const R0 = CAL.R0;
    const SV0 = CAL.SV0;
    const fake = { X: CAL.X0, SV: SV0, R: R0, Y: C.Y0, Cn: cal.base.Cn, Sx: S };
    const X = Object.assign({}, CAL.X0);
    X.pop = S.pop; X.popTot = sum(S.pop); X.LF = CAL.S0.LF0; X.Ystar = S.Ystar;
    X.pi = C.cpi0; X.pe = 0.027; X.rcash = C.rcash0; X.rm = C.rcash0 + C.mortSpread; X.bond = C.rcash0 + C.termPremium;
    X.w = 0.035; X.wavg = S.wavg; X.P = 1; X.fx = 1; X.ToT = 1; X.HP = 1; X.hpgr = 0.04; X.hpgrLn = 0.04; X.dlnTgt = 0.04;
    X.tgt = 1; X.rent = 1; X.dwell = S.dwell; X.tight = 1; X.H = S.H0; X.costIdx = 1; X.capIdx = 1; X.Ib = S.Ib0; X.Id = S.Id0;
    X.births = 0.29; X.deaths = 0.19; X.human = 1; X.idxCPI = 1; X.idxW = 1; X.Pm = 1; X.Px = 1;
    X.gstEff = 0.052; X.completions = C.completions0; X.sh = { gap: 0, pi: 0, tot: 0, tfp: 0, hp: 0, x: 0 };
    const sol = { X, SV: SV0, R: R0, Y: C.Y0, Cn: cal.base.Cn, Sx: S };
    const P = defaults();
    const out = advance(Object.assign({}, S, { Y: 0, Yn: C.Y0, netDebt: C.netDebt0 - 0, wavgBase: S.wavg }), P, 0, sol, cal);
    out.o.gdpGrowth = 0.022;
    out.o.popGrowth = 1.6;
    out.o.netDebtBase = true;
    // base year debt = starting stock (advance added this year's deficit)
    out.o.debt = C.netDebt0; out.o.debtPct = C.netDebt0 / R0.Yn * 100;
    return out.o;
  }

  // cached baseline
  let BASE = null;
  function baseline() {
    if (!BASE) {
      const rec = run({}, [], { recordBaseline: true });
      BASE = { rows: rec.rows, dList: rec.dList };
    }
    return BASE;
  }
  function resetBaseline() { BASE = null; CAL = null; }
  function scenario(Pin, events) {
    const b = baseline();
    return run(Pin, events, { baselineD: b.dList });
  }

  const API = {
    defaults, calibrate, run, baseline, scenario, resetBaseline,
    getCal: () => { if (!CAL) calibrate(); return CAL; },
    wealthExcessB, wealthHoldersAbove, pitFn, taxBrackets,
    SVC_KEYS, DISC_KEYS
  };
  root.POON = API;
})(typeof window !== 'undefined' ? window : globalThis);
