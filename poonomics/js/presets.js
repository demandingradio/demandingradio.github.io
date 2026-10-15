/* Scenario presets and the reform-lab list. Parameter ids come from calib.js. */
(function (root) {
  'use strict';
  const PRESETS = [
    { id: 'baseline', name: 'Current policy (baseline)', desc: 'Everything as it stands today, plus legislated changes.', p: {}, ev: [] },
    { id: 'billionaires', name: 'Tax the billionaires', desc: '2% a year on net wealth above $1B. See how small the number is.', p: { w_rate: 0.02, w_thresh: 1e9, w_admin: 0.8 }, ev: [] },
    { id: 'loopholes', name: 'Close the loopholes', desc: 'Negative gearing off, smaller CGT discount, no franking refunds, global minimum tax, tax office doubled, resource rent tax.',
      p: { t_negGear: 0, t_cgtDisc: 0.25, t_franking: 0, s_earnTax: 0.25, t_gmt: 1, e_enforce: 9, t_rent: 0.25, t_stampSwap: 0.5 }, ev: [] },
    { id: 'basics', name: 'Fund the basics', desc: 'Universal dental, JobSeeker up 50%, more aged care and school money, double the training pipeline.',
      p: { g_dentalCover: 1, g_js: 1.5, g_jsIdx: 1, g_aged: 1.15, g_schools: 1.1, g_train: 2 }, ev: [] },
    { id: 'basicsFunded', name: 'Fund the basics, paid for', desc: 'The same spending, paid for by closing the loopholes and a billionaire wealth tax.',
      p: { g_dentalCover: 1, g_js: 1.5, g_jsIdx: 1, g_aged: 1.15, g_schools: 1.1, g_train: 2,
        t_negGear: 0, t_cgtDisc: 0.25, t_franking: 0, s_earnTax: 0.25, t_gmt: 1, e_enforce: 9, t_rent: 0.25, t_stampSwap: 0.5, w_rate: 0.02, w_thresh: 1e9, w_admin: 0.8 }, ev: [] },
    { id: 'nordic', name: 'Nordic mode', desc: 'Higher taxes, stronger services and payments, much more training capacity.',
      p: { t_r2: 0.34, t_r3: 0.42, t_r4: 0.50, t_payroll: 1.2, w_rate: 0.01, w_thresh: 5e6, g_health: 1.1, g_hosp: 1.1, g_aged: 1.25, g_schools: 1.2, g_higher: 1.2, g_vet: 1.3,
        g_js: 1.6, g_jsIdx: 1, g_family: 1.3, g_train: 2.5, g_dentalCover: 0.9, g_pension: 1.1, g_pubHouse: 30, g_infra: 1.2, g_env: 1.3 }, ev: [] },
    { id: 'libertarian', name: 'Small government', desc: 'Flat 22% tax, 20% company rate, trimmed services and payments.',
      p: { t_flat: 1, t_flatRate: 0.22, t_corp: 0.20, t_payroll: 0.5, g_pension: 0.9, g_pensionIdx: 0, g_js: 0.8, g_health: 0.9, g_hosp: 0.9, g_aged: 0.9, g_schools: 0.9, g_higher: 0.8,
        g_econ: 0, g_gen: 0.7, g_order: 0.9, g_defence: 0.015, g_family: 0.8 }, ev: [] },
    { id: 'ubi', name: 'UBI + flat tax', desc: '$15,000 per adult each year, paid for by a 42% flat tax with no tax-free threshold.', p: { g_ubi: 15000, t_flat: 1, t_flatRate: 0.42, t_free: 0 }, ev: [] },
    { id: 'housing', name: 'Fix housing', desc: 'Planning reform, 60,000 public homes a year, negative gearing off, stamp duty swapped for land tax, fewer investor buyers.',
      p: { h_supply: 1.8, g_pubHouse: 60, t_negGear: 0, t_stampSwap: 1, h_foreign: 0.6, t_cgtDisc: 0.35 }, ev: [] },
    { id: 'austerity', name: 'Austerity', desc: 'A rule that cuts spending and lifts tax until the budget is in surplus.', p: { f_mode: 3, f_target: 0.01, f_gain: 0.8 }, ev: [] },
    { id: 'printing', name: 'Print the money', desc: '60% of deficits financed by the central bank, credibility drops.', p: { f_monFin: 0.6, m_cred: 0.6, g_dentalCover: 1, g_js: 1.5 }, ev: [] },
    { id: 'ore', name: 'Iron ore crash in 2030', desc: 'Terms of trade fall by a quarter in 2030.', p: {}, ev: [{ year: 2030, kind: 'oreCrash', mag: 1 }] },
    { id: 'pandemic', name: 'Pandemic in 2030', desc: 'A sharp recession and extra deaths in 2030.', p: {}, ev: [{ year: 2030, kind: 'pandemic', mag: 1 }] },
    { id: 'gfc', name: 'Financial crisis in 2032', desc: 'House prices fall, credit tightens, output drops.', p: {}, ev: [{ year: 2032, kind: 'financialCrisis', mag: 1 }] },
    { id: 'stagflation', name: 'Oil shock and war', desc: 'Energy prices spike in 2029, defence need rises.', p: {}, ev: [{ year: 2029, kind: 'oilShock', mag: 1 }, { year: 2029, kind: 'war', mag: 1 }] },
    { id: 'chaos', name: 'Chaos monkey', desc: 'Random yearly shocks to demand, prices, terms of trade and housing.', p: { c_vol: 1.2, c_seed: 7 }, ev: [] },
    { id: 'god', name: 'God mode: money no object', desc: 'Unlimited workforce, big funding everywhere. See what the budget and prices do.',
      p: { god_workforce: 1, g_dentalCover: 1, g_health: 1.5, g_hosp: 1.5, g_aged: 1.5, g_js: 2, g_jsIdx: 1, g_schools: 1.5, g_higher: 1.5, g_pension: 1.4, g_vet: 2, g_ndisCap: 0.2, g_pubHouse: 100, g_family: 1.5 }, ev: [] }
  ];

  /* One-lever reforms for the lab. kind: 'raise' (revenue) or 'spend'. */
  const REFORMS = [
    { id: 'wt1b', name: 'Wealth tax 2% above $1B', kind: 'raise', p: { w_rate: 0.02, w_thresh: 1e9, w_admin: 0.8 } },
    { id: 'wt10m', name: 'Wealth tax 1% above $10M', kind: 'raise', p: { w_rate: 0.01, w_thresh: 10e6, w_admin: 0.7 } },
    { id: 'ng', name: 'End negative gearing', kind: 'raise', p: { t_negGear: 0 } },
    { id: 'cgt', name: 'Halve the CGT discount', kind: 'raise', p: { t_cgtDisc: 0.25 } },
    { id: 'fr', name: 'End franking refunds', kind: 'raise', p: { t_franking: 0 } },
    { id: 'supe', name: 'Super earnings tax 25%', kind: 'raise', p: { s_earnTax: 0.25 } },
    { id: 'corp5', name: 'Company tax +5 points', kind: 'raise', p: { t_corp: 0.35 } },
    { id: 'gmt', name: 'Global minimum tax + double tax office', kind: 'raise', p: { t_gmt: 1, e_enforce: 9 } },
    { id: 'rrt', name: 'Resource rent tax 25%', kind: 'raise', p: { t_rent: 0.25 } },
    { id: 'top5', name: 'Top income tax rate +5 points', kind: 'raise', p: { t_r4: 0.50 } },
    { id: 'mid', name: 'Middle bracket +2 points', kind: 'raise', p: { t_r2: 0.32 } },
    { id: 'gst15', name: 'GST to 15% with 50% paid back', kind: 'raise', p: { t_gst: 0.15, t_gstComp: 0.5 } },
    { id: 'inh', name: 'Inheritance tax 20%', kind: 'raise', p: { w_inherit: 0.20 } },
    { id: 'carbon', name: 'Carbon price $50, half returned', kind: 'raise', p: { t_carbon: 50, t_carbonDiv: 0.5 } },
    { id: 'dental', name: 'Universal dental', kind: 'spend', p: { g_dentalCover: 1 } },
    { id: 'js', name: 'JobSeeker up 50%, wage-indexed', kind: 'spend', p: { g_js: 1.5, g_jsIdx: 1 } },
    { id: 'pens', name: 'Age pension up 20%', kind: 'spend', p: { g_pension: 1.2 } },
    { id: 'health', name: 'Medicare and hospitals +10%', kind: 'spend', p: { g_health: 1.1, g_hosp: 1.1 } },
    { id: 'schools', name: 'Schools +20%', kind: 'spend', p: { g_schools: 1.2 } },
    { id: 'homes', name: '50,000 public homes a year', kind: 'spend', p: { g_pubHouse: 50 } },
    { id: 'train', name: 'Double health training', kind: 'spend', p: { g_train: 2 } },
    { id: 'ubi6', name: 'UBI $6,000 per adult', kind: 'spend', p: { g_ubi: 6000 } }
  ];

  root.POON_PRESETS = PRESETS;
  root.POON_REFORMS = REFORMS;
})(window);
