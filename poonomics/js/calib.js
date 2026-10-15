/* ==========================================================================
   POONOMICS - calibration data and lever definitions.

   Everything here is a rounded approximation of Australia around FY2025-26,
   written from memory of ABS / Treasury / AIHW / ATO / RBA published figures.
   None of it is an official statistic. Edit freely (Debug > Calibration, or
   the `calib` console command), the engine recalibrates itself from this file.

   Units: A$ billions per year unless a name says otherwise, people in millions,
   rates as fractions (0.15 = 15%).
   ========================================================================== */
(function (root) {
  'use strict';

  const CALIB = {
    baseYear: 2026,          // FY2025-26 is the calibration year (year 0)
    horizon: 30,             // years simulated after the base year

    // ---- macro base ------------------------------------------------------
    Y0: 2900,                // nominal = real GDP in base year
    gap0: 0.004,             // output gap in base year
    nairu0: 0.043,
    alpha: 0.38,             // capital share in production
    K2Y: 2.8,                // productive capital / GDP
    delta: 0.05,             // depreciation
    gA: 0.009,               // baseline TFP growth
    hours0: 1.0,
    okun: 0.45,              // pp unemployment per 1% output gap
    cpi0: 0.030,             // inflation in the base year
    rcash0: 0.036,
    mortSpread: 0.024,
    termPremium: 0.008,
    effDebtRate0: 0.039,
    worldInfl: 0.022,
    lifeExp0: 83.5,
    emissions0: 440,         // Mt CO2e

    // ---- expenditure shares of GDP in the base year ----------------------
    shares: { C: 0.520, Id: 0.058, X: 0.223, M: 0.208 },   // Ib is the residual

    // ---- demographics (millions) -----------------------------------------
    cohorts: ['0-14', '15-24', '25-44', '45-64', '65-79', '80+'],
    pop0:    [4.95, 3.45, 7.55, 6.65, 3.70, 1.30],
    ageOut:  [1 / 15, 1 / 10, 1 / 20, 1 / 20, 1 / 15, 0],
    mort:    [0.0003, 0.0004, 0.0008, 0.003, 0.014, 0.085],
    nomSplit:[0.07, 0.30, 0.60, 0.03, 0, 0],
    partic:  [0, 0.70, 0.89, 0.78, 0.19, 0.02],
    births: { span: 28 },
    empShare: 0.9,           // employees as a share of the employed

    // ---- 11 income groups: deciles 1-9, next 9% (P90-99), top 1% ---------
    groups: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'P90-99', 'Top 1%'],
    gShare: [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.09, 0.01],  // of tax units and people
    labourShare: [1.2, 2.8, 4.2, 5.6, 7.0, 8.5, 10.4, 12.4, 15.4, 25.5, 7.0],
    capitalShare:[1.5, 2.5, 3.5, 4.5, 5.5, 7.0, 8.5, 11.0, 16.0, 28.0, 12.0],
    mpc:     [1.00, 0.97, 0.95, 0.93, 0.91, 0.89, 0.87, 0.84, 0.80, 0.70, 0.45],
    debtShare:[0.02, 0.04, 0.06, 0.09, 0.12, 0.15, 0.17, 0.17, 0.13, 0.05, 0.00],
    cgtShare:[0, 0, 0.01, 0.02, 0.03, 0.05, 0.08, 0.13, 0.20, 0.28, 0.20],
    compShare:[0.22, 0.20, 0.17, 0.14, 0.11, 0.09, 0.07, 0, 0, 0, 0],
    sigma: 0.33,             // within-group dispersion (lognormal) for poverty/Gini
    taxUnits: 17.0,          // millions of individual taxpayers
    taxQuad: { m: [0.5, 1.0, 1.6], w: [0.3, 0.45, 0.25] },
    capTaxable: 0.78,        // share of household capital income that is taxable
    ghh: 0.31,               // share of gross operating surplus accruing to households
    payout: 0.40,            // company dividend payout
    medicareThreshold: 26000,

    // transfer allocation across the 11 groups (each sums to 1)
    alloc: {
      pension:  [0.12, 0.24, 0.24, 0.18, 0.10, 0.06, 0.04, 0.02, 0, 0, 0],
      dsp:      [0.22, 0.25, 0.18, 0.12, 0.09, 0.06, 0.04, 0.025, 0.015, 0, 0],
      family:   [0.14, 0.17, 0.17, 0.15, 0.13, 0.10, 0.08, 0.04, 0.02, 0, 0],
      js:       [0.38, 0.26, 0.16, 0.09, 0.05, 0.03, 0.02, 0.01, 0, 0, 0],
      vets:     [0.08, 0.14, 0.16, 0.16, 0.14, 0.12, 0.09, 0.06, 0.04, 0.01, 0],
      health:   [0.14, 0.14, 0.13, 0.12, 0.11, 0.10, 0.09, 0.07, 0.06, 0.04, 0],
      edu:      [0.08, 0.09, 0.10, 0.11, 0.11, 0.11, 0.11, 0.11, 0.10, 0.08, 0],
      care:     [0.22, 0.25, 0.18, 0.12, 0.09, 0.06, 0.04, 0.025, 0.015, 0, 0]
    },

    // ---- government revenue, base year ($B) ------------------------------
    rev0: {
      pit: 342, cgt: 20, corp: 138, gst: 92, fuel: 24, tobacco: 11, alcohol: 7,
      customs: 13, superTax: 46, fbt: 3.5, payroll: 46, stamp: 38, land: 31,
      gambling: 9, motor: 10, insurance: 8, otherTax: 20, royalties: 28, rent: 2.5,
      wealth: 0, inherit: 0, carbon: 0, nonTax: 135
    },

    // ---- government spending, base year ($B) -----------------------------
    spend0: {
      pension: 68, ndis: 48, dsp: 40, family: 50, js: 20, vets: 15, aged: 40,
      medicare: 70, hospitals: 110, otherHealth: 40, dental: 4,
      schools: 85, higher: 32, vet: 14,
      defence: 59, order: 58, transport: 85, housing: 28, env: 40, general: 70, econ: 60
    },
    gi0Share: {              // share of each line that is public investment
      transport: 0.75, defence: 0.15, hospitals: 0.06, schools: 0.05,
      housing: 0.35, env: 0.20, general: 0.05
    },
    netDebt0: 920,           // general government net debt, B
    govIntForeign: 0.40,     // share of government interest paid abroad

    // ---- services: need weights per cohort, price drift, workforce -------
    needW: {
      health:  [0.8, 0.5, 0.55, 1.0, 2.6, 6.5],
      aged:    [0, 0, 0, 0.02, 0.5, 10],
      edu:     [1.0, 0.8, 0.2, 0, 0, 0],
      dental:  [0.7, 0.9, 1.0, 1.0, 0.9, 0.7],
      ndis:    [1.0, 1.0, 0.7, 0.8, 0.3, 0]
    },
    svc: {                    // base relative price drift, workforce growth, short-run slack
      health: { relp: 0.006, cap: 0.019, slack: 0.05, trend: -0.004 },
      aged:   { relp: 0.006, cap: 0.025, slack: 0.05, trend: -0.009 },
      edu:    { relp: 0.004, cap: 0.007, slack: 0.05, trend: 0 },
      dental: { relp: 0.004, cap: 0.015, slack: 0.45, trend: 0 },
      ndis:   { relp: 0.008, cap: 0.030, slack: 0.05, trend: 0 }
    },
    dentalCover0: 0.27,

    // ---- welfare unit values ($ per recipient per year) ------------------
    pensionPerRecipient: 25500,
    jsPerRecipient: 13500,
    jsFixedRecipients: 0.35,  // millions on JobSeeker for non-unemployment reasons
    povertyMedianShare: 0.5,

    // ---- housing ---------------------------------------------------------
    dwellings0: 11.0,         // million
    hhSize0: 2.55,
    completions0: 190,        // thousand per year
    demolition: 0.001,
    medianHouse: 880,         // $k
    avgRent: 28.0,            // $k per year
    homeown0: 0.66,
    hhDebt0: 2800,            // $B
    superAssets0: 4300,
    nfl0: 955,                // net foreign liabilities, B

    // ---- wealth tail (Pareto) --------------------------------------------
    wealth: { alpha: 1.35, nRef: 60000, tRefM: 10 },   // 60k people above $10M

    // ---- calibration constants for line-level drivers --------------------
    totLong: 0.88,
    nipRate: { debt: 0.35, equity: 0.65, equityReturn: 0.085, spread: 0.015 },
    mining0Share: 0.075       // mining profits as a share of GDP in the base year
  };

  // ------------------------------------------------------------------------
  //  Levers. type: pct | num | usd | usdB | mult | bool | sel | int
  // ------------------------------------------------------------------------
  const L = [];
  function lv(id, g, label, type, def, min, max, step, tip, opts) {
    L.push({ id, g, label, type, def, min, max, step, tip: tip || '', opts: opts || null });
  }

  // ---- Personal income tax
  const G1 = 'Tax: personal income';
  lv('t_free', G1, 'Tax-free threshold', 'usd', 18200, 0, 60000, 100, 'Income below this is untaxed.');
  lv('t_th1', G1, 'Bracket 2 starts at', 'usd', 45000, 20000, 150000, 500, 'Where the first rate steps up.');
  lv('t_th2', G1, 'Bracket 3 starts at', 'usd', 135000, 50000, 400000, 1000, '');
  lv('t_th3', G1, 'Top bracket starts at', 'usd', 190000, 100000, 1000000, 5000, '');
  lv('t_r1', G1, 'Rate: first bracket', 'pct', 0.15, 0, 0.6, 0.005, 'Legislated 15% in 2026-27, 14% from 2027-28.');
  lv('t_r2', G1, 'Rate: second bracket', 'pct', 0.30, 0, 0.7, 0.005, '');
  lv('t_r3', G1, 'Rate: third bracket', 'pct', 0.37, 0, 0.8, 0.005, '');
  lv('t_r4', G1, 'Rate: top bracket', 'pct', 0.45, 0, 0.9, 0.005, '');
  lv('t_legislated', G1, 'Apply legislated 14% cut from 2027-28', 'bool', 1, 0, 1, 1, 'Current law drops the first rate to 14% in 2027-28.');
  lv('t_medicare', G1, 'Medicare levy', 'pct', 0.02, 0, 0.1, 0.0025, '');
  lv('t_index', G1, 'Index thresholds to', 'sel', 1, 0, 2, 1, 'No indexation means bracket creep: wages rise and more income falls in higher brackets.', ['Nothing (bracket creep)', 'Prices (CPI)', 'Wages']);
  lv('t_flat', G1, 'Flat tax mode', 'bool', 0, 0, 1, 1, 'One rate above the tax-free threshold. Overrides the brackets.');
  lv('t_flatRate', G1, 'Flat tax rate', 'pct', 0.25, 0, 0.7, 0.005, '');

  // ---- Capital, super, estates
  const G2 = 'Tax: capital, super, wealth';
  lv('t_cgtDisc', G2, 'Capital gains discount', 'pct', 0.5, 0, 1, 0.05, 'Share of a long-held gain that is not taxed.');
  lv('t_negGear', G2, 'Negative gearing allowed', 'bool', 1, 0, 1, 1, 'Rental losses offset other income.');
  lv('t_franking', G2, 'Refundable franking credits', 'bool', 1, 0, 1, 1, '');
  lv('s_sg', G2, 'Super guarantee rate', 'pct', 0.12, 0, 0.25, 0.005, 'Employer contribution on top of wages.');
  lv('s_contribTax', G2, 'Tax on super contributions', 'pct', 0.15, 0, 0.5, 0.005, '');
  lv('s_earnTax', G2, 'Tax on super fund earnings', 'pct', 0.15, 0, 0.5, 0.005, 'Effective burden is lower in retirement phase.');
  lv('w_rate', G2, 'Wealth tax rate', 'pct', 0, 0, 0.1, 0.0025, 'Annual tax on net wealth above the threshold.');
  lv('w_thresh', G2, 'Wealth tax threshold', 'usd', 10000000, 1000000, 1000000000, 1000000, 'Dollars of net wealth. $1B hits only billionaires.');
  lv('w_avoid', G2, 'Avoidance elasticity', 'num', 0.25, 0, 1.5, 0.05, 'How hard the rich shift, hide or move wealth as the rate rises.');
  lv('w_admin', G2, 'Valuation / admin quality', 'pct', 0.7, 0.1, 1, 0.05, 'Share of the base the tax office can actually value and reach.');
  lv('w_inherit', G2, 'Inheritance tax rate', 'pct', 0, 0, 0.6, 0.01, 'On estates above $2M.');

  // ---- Company
  const G3 = 'Tax: companies and avoidance';
  lv('t_corp', G3, 'Company tax rate', 'pct', 0.30, 0, 0.5, 0.005, '');
  lv('e_shift', G3, 'Profit-shifting leakage (today)', 'pct', 0.14, 0, 0.5, 0.01, 'Share of the company tax base moved offshore or hidden.');
  lv('e_enforce', G3, 'Tax office funding', 'usdB', 4.5, 1, 30, 0.5, 'More enforcement shrinks leakage with diminishing returns.');
  lv('t_gmt', G3, 'Global minimum tax / diverted profits law', 'bool', 0, 0, 1, 1, 'Cuts leakage by about 45%.');
  lv('t_rent', G3, 'Extra resource rent tax rate', 'pct', 0, 0, 0.6, 0.01, 'On mining profits above a normal level.');
  lv('t_royalty', G3, 'State royalties multiplier', 'mult', 1, 0, 3, 0.05, '');
  lv('t_carbon', G3, 'Carbon price ($ per tonne)', 'usd', 0, 0, 300, 5, 'Applied to all emissions. Cuts emissions, adds revenue and some price pressure.');
  lv('t_carbonDiv', G3, 'Share of carbon revenue paid back as dividend', 'pct', 0, 0, 1, 0.05, 'Paid to the lower seven deciles.');

  // ---- Consumption and state
  const G4 = 'Tax: consumption and state';
  lv('t_gst', G4, 'GST rate', 'pct', 0.10, 0, 0.3, 0.005, '');
  lv('t_gstFood', G4, 'GST on fresh food', 'bool', 0, 0, 1, 1, '');
  lv('t_gstHealth', G4, 'GST on health', 'bool', 0, 0, 1, 1, '');
  lv('t_gstEdu', G4, 'GST on education', 'bool', 0, 0, 1, 1, '');
  lv('t_gstComp', G4, 'Share of extra GST paid back to low incomes', 'pct', 0, 0, 1, 0.05, '');
  lv('t_fuelIdx', G4, 'Index fuel excise to CPI', 'bool', 1, 0, 1, 1, 'Switch off to freeze the rate.');
  lv('t_fuelMult', G4, 'Fuel excise multiplier', 'mult', 1, 0, 3, 0.05, '');
  lv('t_tobacco', G4, 'Tobacco excise multiplier', 'mult', 1, 0, 3, 0.05, '');
  lv('t_alcohol', G4, 'Alcohol excise multiplier', 'mult', 1, 0, 3, 0.05, '');
  lv('t_payroll', G4, 'Payroll tax multiplier', 'mult', 1, 0, 3, 0.05, '');
  lv('t_stampSwap', G4, 'Swap stamp duty for land tax', 'pct', 0, 0, 1, 0.05, 'Revenue neutral at the start. Frees up housing turnover.');
  lv('t_land', G4, 'Land tax and rates multiplier', 'mult', 1, 0, 3, 0.05, '');
  lv('t_gamble', G4, 'Gambling tax multiplier', 'mult', 1, 0, 3, 0.05, '');

  // ---- Welfare
  const G5 = 'Spend: income support';
  lv('g_pension', G5, 'Age pension rate (1 = today)', 'mult', 1, 0.5, 2, 0.01, '');
  lv('g_pensionIdx', G5, 'Pension indexed to', 'sel', 1, 0, 1, 1, '', ['Prices', 'Wages']);
  lv('g_retAge', G5, 'Pension age', 'int', 67, 60, 75, 1, 'Raising it cuts recipients and keeps people working.');
  lv('g_means', G5, 'Pension means test generosity', 'mult', 1, 0.5, 2, 0.05, 'Above 1 lets more people claim.');
  lv('g_js', G5, 'JobSeeker rate (1 = today)', 'mult', 1, 0.5, 3, 0.01, 'Roughly $49 a day at 1.0.');
  lv('g_jsIdx', G5, 'JobSeeker indexed to', 'sel', 0, 0, 1, 1, 'Prices today, so it falls behind wages.', ['Prices', 'Wages']);
  lv('g_dsp', G5, 'Disability support rate', 'mult', 1, 0.5, 2, 0.01, '');
  lv('g_family', G5, 'Family and child payments', 'mult', 1, 0.5, 3, 0.01, '');
  lv('g_vets', G5, 'Veterans payments', 'mult', 1, 0.5, 2, 0.01, '');
  lv('g_welIdx', G5, 'Other payments indexed to', 'sel', 0, 0, 1, 1, '', ['Prices', 'Wages']);
  lv('g_ubi', G5, 'Universal basic income ($ per adult per year)', 'usd', 0, 0, 40000, 500, 'Paid to every adult, taxable.');
  lv('g_jg', G5, 'Job guarantee', 'bool', 0, 0, 1, 1, 'Government employs people who cannot find work.');
  lv('g_jgWage', G5, 'Job guarantee wage', 'usd', 55000, 30000, 90000, 1000, '');

  // ---- Health, care, education
  const G6 = 'Spend: health, care, education';
  lv('g_health', G6, 'Medicare and PBS funding', 'mult', 1, 0.3, 3, 0.01, '1.0 keeps today\'s service level as needs grow.');
  lv('g_hosp', G6, 'Public hospital funding', 'mult', 1, 0.3, 3, 0.01, '');
  lv('g_oth', G6, 'Other health funding', 'mult', 1, 0.3, 3, 0.01, 'Mental health, public health, aids.');
  lv('g_aged', G6, 'Aged care funding', 'mult', 1, 0.3, 3, 0.01, '');
  lv('g_dentalCover', G6, 'Public share of dental costs', 'pct', 0.27, 0, 1, 0.01, 'Medicare dental is zero today. 100% is universal dental.');
  lv('g_ndisCap', G6, 'NDIS growth cap', 'pct', 0.085, 0, 0.25, 0.005, 'Maximum yearly growth in NDIS spending.');
  lv('g_train', G6, 'Health and care workforce training', 'mult', 1, 0, 4, 0.1, 'More training grows the number of doctors, nurses, dentists and carers over time.');
  lv('g_schools', G6, 'School funding', 'mult', 1, 0.3, 3, 0.01, '');
  lv('g_higher', G6, 'University funding', 'mult', 1, 0.3, 3, 0.01, '');
  lv('g_vet', G6, 'TAFE and vocational funding', 'mult', 1, 0.3, 3, 0.01, '');

  // ---- Other spending
  const G7 = 'Spend: everything else';
  lv('g_defence', G7, 'Defence (% of GDP)', 'pct', 0.0203, 0, 0.08, 0.001, 'Today about 2%.');
  lv('g_order', G7, 'Police, courts, prisons', 'mult', 1, 0.3, 3, 0.01, '');
  lv('g_infra', G7, 'Roads, rail and infrastructure', 'mult', 1, 0.3, 3, 0.01, 'Also lifts productivity growth a little.');
  lv('g_housing', G7, 'Housing assistance and services', 'mult', 1, 0.3, 3, 0.01, '');
  lv('g_pubHouse', G7, 'New public homes per year (thousands)', 'num', 0, 0, 200, 5, 'Each costs about $550k.');
  lv('g_env', G7, 'Environment and energy', 'mult', 1, 0.3, 3, 0.01, '');
  lv('g_econ', G7, 'Industry and other subsidies', 'mult', 1, 0, 3, 0.01, '');
  lv('g_gen', G7, 'General public services and aid', 'mult', 1, 0.3, 3, 0.01, '');
  lv('g_drift', G7, 'Real per-person growth of these lines', 'pct', 0.009, -0.02, 0.04, 0.001, 'Governments tend to spend more per head each year.');

  // ---- Fiscal rule
  const G8 = 'Fiscal rule';
  lv('f_mode', G8, 'Budget rule', 'sel', 0, 0, 3, 1, 'Automatic correction towards the target balance.', ['None', 'Cut discretionary spending', 'Raise income tax', 'Both']);
  lv('f_target', G8, 'Target balance (% GDP)', 'pct', 0, -0.06, 0.06, 0.0025, '');
  lv('f_gain', G8, 'Correction speed', 'num', 0.5, 0.05, 2, 0.05, '');
  lv('f_monFin', G8, 'Share of deficit printed by the central bank', 'pct', 0, 0, 1, 0.05, 'No interest cost, but inflation expectations and the dollar pay for it.');

  // ---- Monetary
  const G9 = 'Central bank';
  lv('m_mode', G9, 'Cash rate set by', 'sel', 0, 0, 1, 1, '', ['Taylor rule (independent RBA)', 'Fixed by you']);
  lv('m_cash', G9, 'Fixed cash rate', 'pct', 0.036, 0, 0.2, 0.0025, 'Used when set by you.');
  lv('m_target', G9, 'Inflation target', 'pct', 0.025, 0, 0.08, 0.0025, '');
  lv('m_cred', G9, 'Central bank credibility', 'pct', 0.9, 0, 1, 0.05, 'How firmly expectations hold to the target.');
  lv('m_neutral', G9, 'Neutral real rate', 'pct', 0.01, -0.02, 0.05, 0.0025, '');
  lv('m_kappa', G9, 'Phillips curve slope', 'num', 0.35, 0, 1.5, 0.05, 'How much a positive output gap lifts inflation.');

  // ---- Housing
  const G10 = 'Housing';
  lv('h_supply', G10, 'Building capacity / planning reform', 'mult', 1, 0.3, 2.5, 0.05, 'More lets builders respond to demand.');
  lv('h_foreign', G10, 'Foreign and investor demand', 'mult', 1, 0, 2, 0.05, '');
  lv('h_firstHome', G10, 'First-home buyer subsidy', 'pct', 0, 0, 1, 0.05, 'Boosts demand and prices.');
  lv('h_rentCap', G10, 'Cap rent rises at inflation', 'bool', 0, 0, 1, 1, 'Holds rents down and discourages new supply.');

  // ---- Trade and world
  const G11 = 'Trade and world';
  lv('x_tariff', G11, 'Import tariff', 'pct', 0, 0, 0.4, 0.01, '');
  lv('x_retaliate', G11, 'Retaliation (export loss per tariff point)', 'num', 0.3, 0, 1.5, 0.05, '');
  lv('x_students', G11, 'International student volume', 'mult', 1, 0, 2, 0.05, '');
  lv('x_totLong', G11, 'Long-run terms of trade', 'num', 0.88, 0.5, 1.5, 0.01, '1.0 is the base year. Iron ore prices are expected to fall.');
  lv('x_worldGrowth', G11, 'World demand growth', 'pct', 0.024, -0.02, 0.06, 0.001, '');
  lv('x_worldRate', G11, 'World interest rate', 'pct', 0.038, 0, 0.12, 0.0025, '');

  // ---- People and productivity
  const G12 = 'People and productivity';
  lv('p_nom', G12, 'Net overseas migration (thousands)', 'num', 300, -100, 800, 10, '');
  lv('p_tfr', G12, 'Fertility rate', 'num', 1.5, 0.8, 3, 0.05, 'Births per woman.');
  lv('p_mortImp', G12, 'Death rate improvement per year', 'pct', 0.01, 0, 0.04, 0.0025, '');
  lv('l_gA', G12, 'Productivity (TFP) growth', 'pct', 0.009, -0.01, 0.04, 0.001, '');
  lv('l_rnd', G12, 'R&D incentives', 'mult', 1, 0, 3, 0.1, 'Small boost to productivity growth.');
  lv('l_hours', G12, 'Hours worked (1 = today)', 'mult', 1, 0.6, 1.2, 0.01, 'A four-day week is about 0.8 and partly pays for itself in productivity.');
  lv('l_wagePush', G12, 'Extra wage growth (pp per year)', 'pct', 0, -0.02, 0.05, 0.0025, 'Union power, minimum wage decisions.');
  lv('l_nairuShift', G12, 'Shift to natural unemployment (pp)', 'pct', 0, -0.02, 0.05, 0.0025, '');

  // ---- Chaos and god mode
  const G13 = 'Chaos and god mode';
  lv('c_vol', G13, 'Random shock volatility', 'num', 0, 0, 3, 0.1, '0 is a smooth forecast. Higher adds yearly random shocks.');
  lv('c_seed', G13, 'Random seed', 'int', 1, 1, 9999, 1, '');
  lv('god_workforce', G13, 'GOD: unlimited workforce', 'bool', 0, 0, 1, 1, 'Removes the staff constraint so money converts straight into services.');
  lv('god_noInterest', G13, 'GOD: zero interest on government debt', 'bool', 0, 0, 1, 1, '');
  lv('god_noDelays', G13, 'GOD: no demand add-factors', 'bool', 0, 0, 1, 1, 'Turns off the baseline calibration add-factors (advanced).');

  const LEVERS = L;
  const LEVER_BY_ID = {};
  LEVERS.forEach((l) => { LEVER_BY_ID[l.id] = l; });
  const GROUPS = [];
  LEVERS.forEach((l) => { if (GROUPS.indexOf(l.g) < 0) GROUPS.push(l.g); });

  root.POON_CALIB = CALIB;
  root.POON_LEVERS = LEVERS;
  root.POON_LEVER_BY_ID = LEVER_BY_ID;
  root.POON_LEVER_GROUPS = GROUPS;
})(typeof window !== 'undefined' ? window : globalThis);
