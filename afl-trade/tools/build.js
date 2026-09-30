// Build the app's data file from the raw dataset + calibrated model.
// deno run -A build.js [--report]  -> ../data.js
import { loadSeason, seasonNorms, features, R, scPerGame, CFG } from './lib.js';
import '../model.js';
const M = globalThis.TradeModel;
// calibrated settings: GW/KGW/MISSED shape the season ratings (lib), pm_* are role multipliers, the rest are model params
const CAL = JSON.parse(R('calibrated.json'));
for (const [k, v] of Object.entries(CAL)) {
  if (k === 'obj') continue;
  if (k in CFG) CFG[k] = v; else if (k.startsWith('pm_')) M.params.posMult[k.slice(3)] = v; else M.params[k] = v;
}
const report = Deno.args.includes('--report');

const years = [2023, 2024, 2025, 2026];
const rows = {}, norms = {};
for (const y of years) { rows[y] = loadSeason(y); norms[y] = seasonNorms(rows[y], y); }
const byLink = {}; for (const y of years) for (const r of rows[y]) (byLink[r.link] ||= {})[y] = r;

const ds = JSON.parse(R('out/raw-dataset.json'));
const GROUP_LABEL = { MID: 'Midfielder', MF: 'Mid-forward', RUC: 'Ruck', KF: 'Key forward', GF: 'Forward', KD: 'Key defender', GD: 'Defender' };
function fallbackGroup(p) {
  const pos = p.pos || [];
  if (pos[0] === 'Ruck' || (pos.includes('Ruck') && p.height >= 200)) return 'RUC';
  if (pos.includes('Midfield')) return 'MID';
  if (pos.includes('Defender')) return p.height >= 193 ? 'KD' : 'GD';
  if (pos.includes('Forward')) return p.height >= 192 ? 'KF' : 'GF';
  return 'MID';
}

const players = [];
for (const p of ds.players) {
  // Hogan: wiki lists a delisting but afl.com.au (30 Sep) confirms he's still a Giant and being traded
  if (p.status && !['Jesse Hogan'].includes(p.name)) continue; // retired / delisted
  const [d, mo, y] = (p.dob || '').split(' ');
  let dob = new Date(`${mo} ${d}, ${y}`);
  if (isNaN(dob)) dob = new Date(`${(p.draft?.year || 2025) - 18}-06-01`); // unknown DOB: assume drafted at 18
  const seasons = p.at ? byLink[p.at] : null;
  // afltables uses the name fans know (Zach not Zachary, Tom not Thomas)
  const latest = seasons ? seasons[Math.max(...Object.keys(seasons).map(Number))] : null;
  // first name as fans know it (afltables: Zach, Tom); surname from footywire (keeps apostrophes: O'Keeffe, D'Ambrosio)
  const first = latest?.first || p.first, last = p.last;
  const f = features(seasons, { dob, height: p.height, draft: p.draft, games: p.games }, 2026, norms);
  const group = f.group || fallbackGroup(p);
  const feat = { ...f, group, contractEnd: p.contractEnd, fa: p.fa };
  const A = M.ability(feat);
  const v = M.playerValue(feat, { season: 2026 });
  players.push({
    id: p.pid || p.fw, n: `${first} ${last}`, f: first, l: last, c: p.club, no: p.num, dob: p.dob, age: f.age, ht: p.height,
    pos: GROUP_LABEL[group], grp: group, gms: p.games, ce: p.contractEnd, fa: p.fa, svc: p.service, rk: p.flags.includes('Rookie') ? 1 : 0,
    dr: p.draft ? { y: p.draft.year, r: p.draft.round, p: p.draft.pick, by: p.draft.by, t: p.draft.flag || null } : null,
    or: p.origin,
    A: +A.toFixed(3), ped: f.ped, avail: f.avail, dy: f.dy, dp: f.dp,
    s: Object.fromEntries(years.filter((yy) => seasons?.[yy]).map((yy) => { const s = seasons[yy]; return [yy, { gm: s.gm, di: +(s.di / s.gm).toFixed(1), gl: s.gl, sc: Math.round(scPerGame(s, yy)), br: s.br, tk: +(s.tk / s.gm).toFixed(1), mk: +(s.mk / s.gm).toFixed(1), ho: +(s.ho / s.gm).toFixed(1), cl: +(s.cl / s.gm).toFixed(1), tm: s.team }]; })),
    sc26: p.sc26?.avg ?? null, af26: p.af26?.avg ?? null,
    v: v.points,
  });
}
players.sort((a, b) => b.v - a.v);

if (report) {
  const eq = (pts) => { let best = 1; for (let i = 1; i <= M.DVI.length; i++) if (Math.abs(M.dvi(i) - pts) < Math.abs(M.dvi(best) - pts)) best = i; return pts > 3000 ? `${(pts / 3000).toFixed(1)}x pick 1` : pts < 14 ? '-' : `~#${best}`; };
  console.log('TOP 70');
  players.slice(0, 70).forEach((p, i) => console.log(`${String(i + 1).padStart(3)} ${p.n.padEnd(26)} ${p.c} ${p.pos.padEnd(12)} age ${p.age.toFixed(1)} OVR ${M.ovr(p.A)} A ${p.A.toFixed(2).padStart(5)} ce ${p.ce} ${(p.fa || '').slice(0, 3)} v ${String(p.v).padStart(5)} ${eq(p.v)}`));
  const watch = (Deno.env.get('WATCH') || 'Harley Reid,Sam Darcy,Colby McKercher,Jagga Smith,Sam Lalor,Finn O\'Sullivan,Nick Watson,Levi Ashcroft,George Wardlaw,Daniel Curtin,Ryley Sanders,Harry Sheezel,Will Ashcroft,Sam Walsh,Patrick Cripps,Jeremy Cameron,Harris Andrews,Max Gawn,Tom Stewart,Laitham Vandermeer,Zach Merrett,Zak Butters,Charlie Curnow,Jack Macrae,Dustin Martin,Toby Greene,Tom Lynch,Josh Daicos,Riley Thilthorpe,Aaron Naughton').split(',');
  console.log('\nWATCH');
  for (const w of watch) { const p = players.find((x) => x.n === w); if (!p) { console.log('  (not found)', w); continue; } console.log(`  #${players.indexOf(p) + 1} ${p.n.padEnd(22)} ${p.c} ${p.pos.padEnd(12)} age ${p.age.toFixed(1)} OVR ${M.ovr(p.A)} A ${p.A.toFixed(2)} ce ${p.ce} ${p.fa} v ${p.v} ${eq(p.v)} | 26: ${JSON.stringify(p.s[2026] || {})}`); }
  const byClub = {}; for (const p of players) (byClub[p.c] ||= 0), byClub[p.c] += p.v;
  console.log('\nLIST VALUE BY CLUB', Object.entries(byClub).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} ${Math.round(v / 1000)}k`).join(', '));
  const dist = [0, 10, 50, 100, 250, 500, 1000, 2000, 4000, 1e9]; const h = dist.slice(0, -1).map((lo, i) => `${lo}-${dist[i + 1]}: ${players.filter((p) => p.v >= lo && p.v < dist[i + 1]).length}`);
  console.log('value histogram', h.join(' | '));
}
Deno.writeTextFileSync('out/players.json', JSON.stringify(players));
console.log('players', players.length);

// ======================= app data export =======================
const CLUBS = {
  ADE: { name: 'Adelaide', short: 'Crows', abbr: 'ADE', tag: 'ADE' }, BRL: { name: 'Brisbane Lions', short: 'Lions', abbr: 'BRL', tag: 'BL' },
  CAR: { name: 'Carlton', short: 'Blues', abbr: 'CAR', tag: 'CARL' }, COL: { name: 'Collingwood', short: 'Magpies', abbr: 'COL', tag: 'COLL' },
  ESS: { name: 'Essendon', short: 'Bombers', abbr: 'ESS', tag: 'ESS' }, FRE: { name: 'Fremantle', short: 'Dockers', abbr: 'FRE', tag: 'FRE' },
  GEE: { name: 'Geelong', short: 'Cats', abbr: 'GEE', tag: 'GEE' }, GCS: { name: 'Gold Coast', short: 'Suns', abbr: 'GCS', tag: 'GC' },
  GWS: { name: 'GWS Giants', short: 'Giants', abbr: 'GWS', tag: 'GWS' }, HAW: { name: 'Hawthorn', short: 'Hawks', abbr: 'HAW', tag: 'HAW' },
  MEL: { name: 'Melbourne', short: 'Demons', abbr: 'MEL', tag: 'MELB' }, NTH: { name: 'North Melbourne', short: 'Kangaroos', abbr: 'NTH', tag: 'NM' },
  PTA: { name: 'Port Adelaide', short: 'Power', abbr: 'PTA', tag: 'PA' }, RIC: { name: 'Richmond', short: 'Tigers', abbr: 'RIC', tag: 'RICH' },
  STK: { name: 'St Kilda', short: 'Saints', abbr: 'STK', tag: 'STK' }, SYD: { name: 'Sydney', short: 'Swans', abbr: 'SYD', tag: 'SYD' },
  WCE: { name: 'West Coast', short: 'Eagles', abbr: 'WCE', tag: 'WC' }, WBD: { name: 'Western Bulldogs', short: 'Bulldogs', abbr: 'WBD', tag: 'WB' },
};
const inputs = JSON.parse(R('inputs.json'));
for (const c of inputs.colours) if (CLUBS[c.code]) Object.assign(CLUBS[c.code], { c1: c.primary, c2: c.secondary, c3: c.tertiary || null });
const FINISH = { FRE: 'Grand Final runners-up', SYD: 'Lost preliminary final', BRL: 'Premiers', HAW: 'Lost preliminary final', GEE: 'Lost semi-final', ADE: 'Lost semi-final', MEL: 'Lost wildcard final', WBD: 'Lost elimination final', COL: 'Lost wildcard final', CAR: 'Lost elimination final' };
for (const l of ds.ladder) {
  const c = CLUBS[l.club]; c.rank = l.rank; c.w = l.w; c.l = l.l; c.d = l.d; c.pct = l.pct;
  c.finish = FINISH[l.club] || 'Missed finals';
  c.mode = l.rank <= 6 ? 'contender' : l.rank <= 12 ? 'balanced' : 'rebuild';
}
const ladderRank = Object.fromEntries(ds.ladder.map((l) => [l.club, l.rank]));

// picks: 2026 order (AFL official for 51/52), future 2027/2028 rounds 1-4
const picks = ds.picks2026.map((p) => ({ ...p }));
const fix = { 51: { owner: 'WCE', orig: 'HAW', via: ['HAW'] }, 52: { owner: 'BRL', orig: 'SYD', via: ['SYD'] } };
for (const p of picks) if (fix[p.pick]) Object.assign(p, fix[p.pick]);
const traded27 = inputs.future2027Traded;
const future = [];
for (const y of [2027, 2028]) for (const c of Object.keys(CLUBS)) for (let r = 1; r <= 4; r++) {
  const t = y === 2027 ? traded27.find((x) => x.round === r && x.orig === c) : null;
  future.push({ year: y, round: r, orig: c, owner: t ? t.owner : c });
}
const pickAssets = [
  ...picks.map((p) => ({ id: `k${p.pick}`, year: 2026, round: p.round, pick: p.pick, orig: p.orig, owner: p.owner, via: p.via })),
  ...future.map((f) => ({ id: `f${f.year}-${f.round}-${f.orig}`, year: f.year, round: f.round, orig: f.orig, owner: f.owner })),
];

// perspective scales: keep the average value of the top 300 players the same in every mode
const top = [...players].sort((a, b) => b.v - a.v).slice(0, 300);
const featOf = (p) => ({ A: p.A, age: p.age, avail: p.avail, ped: p.ped, group: p.grp, games: p.gms, dy: p.dy, dp: p.dp, contractEnd: p.ce, fa: p.fa });
const modeScale = {};
for (const m of Object.keys(M.params.modes)) {
  M.params.modes[m].scale = 1;
  const sum = top.reduce((a, p) => a + M.playerValue(featOf(p), { mode: m }).points, 0);
  const base = top.reduce((a, p) => a + M.playerValue(featOf(p), { mode: 'balanced' }).points, 0);
  modeScale[m] = +(base / sum).toFixed(4);
}
console.log('mode scales', modeScale);

const cal = JSON.parse(R('calibrated.json'));
const out = {
  season: 2026, asOf: '30 Sep 2026',
  params: { ...Object.fromEntries(Object.entries(cal).filter(([k]) => !(k in CFG) && !k.startsWith('pm_') && k !== 'obj')), posMult: { ...M.params.posMult }, modeScale },
  clubs: CLUBS, ladderRank,
  players: players.map((p) => ({ ...p, id: 'p' + p.id })),
  picks: pickAssets,
  meta: { calibrationTrades: 57, anchors: JSON.parse(R('anchors.json')).ranges.length },
};
Deno.writeTextFileSync('../data.js', '// Generated by build.js — AFL Trade Machine data (as at 30 Sep 2026). Do not edit by hand.\nwindow.TRADE_DATA = ' + JSON.stringify(out) + ';\n');
console.log('data.js', (JSON.stringify(out).length / 1024).toFixed(0), 'KB;', players.length, 'players;', pickAssets.length, 'picks');
