import '../model.js';
const M = globalThis.TradeModel;
globalThis.window = globalThis;
const src = Deno.readTextFileSync('../data.js').replace('window.TRADE_DATA = ', 'globalThis.TRADE_DATA = ');
eval(src);
const D = globalThis.TRADE_DATA;
for (const [k, v] of Object.entries(D.params)) if (k !== 'modeScale' && v != null) M.params[k] = v; // calibrated settings (incl. role multipliers)
for (const [m, s] of Object.entries(D.params.modeScale)) M.params.modes[m].scale = s;
const feat = (p) => ({ A: p.A, age: p.age, avail: p.avail, ped: p.ped, group: p.grp, games: p.gms, dy: p.dy, dp: p.dp, contractEnd: p.ce, fa: p.fa });
const P = D.players.map((p) => ({ ...p, val: M.playerValue(feat(p), { mode: 'balanced' }).points, ovr: M.ovr(p.A) })).sort((a, b) => b.val - a.val);
let out = '# Player valuations (balanced/market lens), draft points (pick 1 = 3000, pick 10 = 1276, pick 20 = 757, pick 30 = 454)\n# rank | name | club | pos | age | OVR | contract end | FA status | 2026 games | value\n';
P.forEach((p, i) => { if (i < 200) out += `${i + 1} | ${p.n} | ${p.c} | ${p.pos} | ${p.age.toFixed(1)} | ${p.ovr} | ${p.ce} | ${p.fa} | ${p.s[2026]?.gm ?? 0} | ${p.val}\n`; });
out += '\n# Best 12 by position group\n';
for (const g of ['MID', 'KF', 'GF', 'KD', 'GD', 'RUC']) out += `${g}: ` + P.filter((p) => p.grp === g).slice(0, 12).map((p) => `${p.n} (${p.c}, ${p.age.toFixed(0)}y, ${p.val})`).join('; ') + '\n';
out += '\n# Each club: top 5 players by value\n';
for (const c of Object.keys(D.clubs)) out += `${c}: ` + P.filter((p) => p.c === c).slice(0, 5).map((p) => `${p.n} ${p.val}`).join('; ') + '\n';
out += '\n# Future picks (balanced): club 2026 ladder -> 2027 R1 / 2027 R2 / 2028 R1\n';
for (const c of Object.keys(D.clubs)) { const v = (y, r) => M.pickValue({ year: y, round: r, orig: c }, { ladderRank: D.ladderRank }).points; out += `${c} (${D.ladderRank[c]}): ${v(2027, 1)} / ${v(2027, 2)} / ${v(2028, 1)}\n`; }
Deno.writeTextFileSync('out/valuation_report.txt', out);
console.log(out.length);
