// Calibrate the value model against (a) real 2023-2025 AFL trades and (b) expert-checked value ranges (anchors.json).
// deno run -A calibrate.js [--fit] [--verbose] [--anchors]
import { loadSeason, seasonNorms, features, norm, R, CFG } from './lib.js';
import '../model.js';
const M = globalThis.TradeModel;
const verbose = Deno.args.includes('--verbose');

const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
const rows = {};
for (const y of years) rows[y] = loadSeason(y);
const byLink = {}; for (const y of years) for (const r of rows[y]) (byLink[r.link] ||= {})[y] = r;

const ds = JSON.parse(R('out/raw-dataset.json'));
const curByLink = Object.fromEntries(ds.players.filter((p) => p.at).map((p) => [p.at, p]));
const trades = JSON.parse(R('out/trades.json'));
const anchors = JSON.parse(R('anchors.json')).ranges;

const draftIdx = {};
for (let y = 2008; y <= 2025; y++) {
  let html; try { html = R(`raw/ft_drafts-${y}.html`); } catch { continue; }
  for (const row of html.split(/<tr class="(?:light|dark)color"/).slice(1)) {
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
    if (tds.length < 5) continue;
    draftIdx[norm(tds[3].replace(/\s[A-Z]$/, ''))] ||= { year: y, round: +tds[0], pick: +tds[1] };
  }
}
const ALIAS = { matt: 'matthew', tom: 'thomas', nick: 'nicholas', tim: 'timothy', sam: 'samuel', josh: 'joshua', dan: 'daniel', will: 'william', zac: 'zachary', zach: 'zachary', zak: 'zachary', ollie: 'oliver', alex: 'alexander', lachie: 'lachlan', jake: 'jacob', mitch: 'mitchell', cam: 'cameron', ben: 'benjamin', chris: 'christopher', charlie: 'charles', nate: 'nathan', jamie: 'james', jimmy: 'james', bobby: 'robert', rob: 'robert', joe: 'joseph', max: 'maxwell', ed: 'edward', ned: 'edward', pat: 'patrick', paddy: 'patrick', harry: 'harrison', mick: 'michael', mike: 'michael' };
const key = (first, last) => (ALIAS[norm(first).split(' ')[0]] || norm(first).split(' ')[0]) + '|' + norm(last).replace(/\b(jr|snr|sr)\b/g, '').replace(/ /g, '');
const dobOf = (p) => { const [d, mo, y] = (p.dob || '').split(' '); const dt = new Date(`${mo} ${d}, ${y}`); return isNaN(dt) ? new Date(`${(p.draft?.year || 2025) - 18}-06-01`) : dt; };

async function playerInfo(link) {
  const cur = curByLink[link];
  if (cur) return { dob: dobOf(cur), height: cur.height, draft: cur.draft, gamesNow: cur.games };
  const f = `raw/players/${link.replace('/', '_')}.html`;
  let html;
  try { html = R(f); } catch {
    Deno.mkdirSync('raw/players', { recursive: true });
    html = await (await fetch(`https://afltables.com/afl/stats/players/${link}.html`, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mj-trade-research/1.0)' } })).text();
    Deno.writeTextFileSync(f, html); await new Promise((r) => setTimeout(r, 400));
  }
  const b = html.match(/<b>Born:<\/b>(\d+)-(\w+)-(\d{4})/);
  const h = html.match(/<b>Height:<\/b>\s*(\d+)\s*cm/);
  const name = norm(link.split('/')[1].replace(/\d+$/, '').replace(/_/g, ' '));
  return { dob: b ? new Date(`${b[2]} ${b[1]}, ${b[3]}`) : new Date('1998-01-01'), height: h ? +h[1] : null, draft: draftIdx[name] || null, gamesNow: null };
}
function findLink(name, club, year) {
  const [first, ...rest] = name.split(' ');
  const k = key(first, rest.join(' '));
  for (const y of [year, year - 1, year - 2]) {
    const hits = (rows[y] || []).filter((r) => key(r.first, r.last) === k);
    const same = hits.filter((r) => r.team === club);
    if (same.length === 1) return same[0].link;
    if (hits.length === 1) return hits[0].link;
  }
  const ln = norm(rest.join(' ')).replace(/ /g, '');
  const hits = (rows[year] || []).filter((r) => r.team === club && norm(r.last).replace(/ /g, '') === ln);
  return hits.length === 1 ? hits[0].link : null;
}
const CODE = { Adelaide: 'ADE', 'Brisbane Lions': 'BRL', Carlton: 'CAR', Collingwood: 'COL', Essendon: 'ESS', Fremantle: 'FRE', Geelong: 'GEE', 'Gold Coast': 'GCS', 'Greater Western Sydney': 'GWS', Hawthorn: 'HAW', Melbourne: 'MEL', 'North Melbourne': 'NTH', 'Port Adelaide': 'PTA', Richmond: 'RIC', 'St Kilda': 'STK', Sydney: 'SYD', 'West Coast': 'WCE', 'Western Bulldogs': 'WBD' };
const ladders = {};
for (const y of [2022, 2023, 2024, 2025, 2026]) ladders[y] = Object.fromEntries(JSON.parse(R(`raw/ladder-${y}.json`)).standings.map((s) => [CODE[s.name], s.rank]));

// ---- static prep: who is in each trade, and the anchor players ----
const prepared = [];
for (const t of trades) {
  if (t.flows.some((f) => !f.from || !f.to || f.type === 'unknown')) continue;
  const items = []; let bad = false;
  for (const f of t.flows) {
    if (f.type === 'player') {
      const link = findLink(f.name, f.from, t.year);
      if (!link) { bad = true; continue; }
      const info = await playerInfo(link);
      let gamesAt;
      if (info.gamesNow != null) { gamesAt = info.gamesNow; for (const y of years) if (y > t.year && byLink[link]?.[y]) gamesAt -= byLink[link][y].gm; }
      else gamesAt = Object.entries(byLink[link] || {}).filter(([y]) => +y <= t.year).reduce((a, [, s]) => a + s.gm, 0) + 20;
      items.push({ ...f, link, info: { ...info, games: gamesAt } });
    } else items.push(f);
  }
  if (!bad) prepared.push({ ...t, items });
}
const withPlayers = prepared.filter((t) => t.items.some((i) => i.type === 'player'));
for (const t of withPlayers) { const pk = t.items.filter((i) => i.type !== 'player').reduce((a, i) => a + (i.type === 'pick' ? M.dvi(i.pick) : 400 / i.round), 0); t.w = Math.sqrt(300 + pk); }

const displayName = (p) => { const s = p.at ? byLink[p.at] : null; const latest = s ? s[Math.max(...Object.keys(s).map(Number))] : null; return `${latest?.first || p.first} ${p.last}`; };
const anchorPlayers = [];
for (const [name, lo, hi] of anchors) {
  const p = ds.players.find((x) => !x.status && displayName(x) === name) || (name === 'Jesse Hogan' ? ds.players.find((x) => x.name === name) : null);
  if (!p) { console.log('anchor not found:', name); continue; }
  anchorPlayers.push({ name, lo, hi, p, info: { dob: dobOf(p), height: p.height, draft: p.draft, games: p.games } });
}
console.log('usable trades', prepared.length, 'with players', withPlayers.length, '| anchors', anchorPlayers.length);

// ---- features depend on the goal weight (group norms move), so rebuild them when GW changes ----
let featGW = null;
function rebuildFeatures() {
  const sig = CFG_KEYS.map((k) => CFG[k]).join('|');
  if (featGW === sig) return;
  const norms = {}; for (const y of years) norms[y] = seasonNorms(rows[y], y);
  for (const t of withPlayers) for (const it of t.items) if (it.type === 'player') it.feat = features(byLink[it.link], it.info, t.year, norms);
  for (const a of anchorPlayers) a.feat = { ...features(a.p.at ? byLink[a.p.at] : null, a.info, 2026, norms), contractEnd: a.p.contractEnd, fa: a.p.fa };
  featGW = sig;
}

const CAL_LEV = 0.92; // typical traded player: out of contract or requested a move
function valueItem(it, year) {
  if (it.type === 'player') return M.playerValue(it.feat, { season: year, leverage: CAL_LEV }).points;
  if (it.type === 'pick') return M.dvi(it.pick);
  if (it.type === 'future') return M.pickValue({ year: it.year, round: it.round, orig: it.orig }, { season: year, ladderRank: ladders[year] }).points;
  return 0;
}
function tradeLoss(t) {
  const net = {};
  for (const it of t.items) { const v = valueItem(it, t.year); (net[it.to] ??= { in: 0, out: 0 }).in += v; (net[it.from] ??= { in: 0, out: 0 }).out += v; }
  let tl = 0, k = 0;
  for (const c of Object.values(net)) { const r = Math.log((c.in + 200) / (c.out + 200)); tl += r * r; k++; }
  return { l: tl / k, net };
}
function anchorLoss(a) {
  const v = M.playerValue(a.feat, { season: 2026 }).points;
  const d = v < a.lo ? Math.log((a.lo + 100) / (v + 100)) : v > a.hi ? Math.log((v + 100) / (a.hi + 100)) : 0;
  return { v, d };
}
const PRIORS = { S: [400, 400], gamma: [1.6, 0.5], zRep: [-1.0, 0.6], delta: [0.8, 0.08], declineMult: [1.0, 0.5], growthMult: [0.8, 0.4], pedGrowth: [0.5, 0.5], GW: [6, 5], KGW: [6, 6], MISSED: [6, 4], vetStart: [30, 1.5], vetSlope: [0.15, 0.1] };
const LAMBDA = Number(Deno.env.get('LAMBDA') ?? 0.003);
const ANCHOR_W = Number(Deno.env.get('ANCHOR_W') ?? 1);
const CFG_KEYS = ['GW', 'KGW', 'MISSED'];
const POS = ['MID', 'MF', 'GF', 'KF', 'GD', 'KD', 'RUC'];
for (const g of POS) PRIORS['pm_' + g] = [1, 0.25];
const get = (k) => (CFG_KEYS.includes(k) ? CFG[k] : k.startsWith('pm_') ? M.params.posMult[k.slice(3)] : M.params[k]);
const set = (k, v) => { if (CFG_KEYS.includes(k)) CFG[k] = v; else if (k.startsWith('pm_')) M.params.posMult[k.slice(3)] = v; else M.params[k] = v; };
function objective() {
  rebuildFeatures();
  let loss = 0, wsum = 0;
  for (const t of withPlayers) { loss += t.w * Math.min(tradeLoss(t).l, 0.6); wsum += t.w; }
  loss /= wsum;
  let al = 0; for (const a of anchorPlayers) al += Math.min(anchorLoss(a).d ** 2, 1);
  al /= anchorPlayers.length;
  let pen = 0; for (const [k, [m, sd]] of Object.entries(PRIORS)) pen += ((get(k) - m) / sd) ** 2;
  return loss + ANCHOR_W * al + LAMBDA * pen;
}
var BOUNDS = { S: [50, 3000], gamma: [1.0, 2.6], zRep: [-2.2, 0], delta: [0.6, 0.95], declineMult: [0.4, 2], growthMult: [0.2, 1.6], pedGrowth: [0, 2], GW: [0, 20], KGW: [0, 25], MISSED: [0, 15], vetStart: [27, 32], vetSlope: [0, 0.35] };
for (const g of POS) BOUNDS['pm_' + g] = [0.5, 1.6];

const FIX = Object.fromEntries((Deno.env.get('FIX') || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, +v]; }));
if (Deno.args.includes('--fit')) {
  const starts = [
    { S: 250, gamma: 1.7, zRep: -1.2, delta: 0.76, declineMult: 0.9, growthMult: 0.65, pedGrowth: 0.4, GW: 6, KGW: 6, MISSED: 6, vetStart: 30, vetSlope: 0.15 },
    { S: 500, gamma: 1.4, zRep: -1.5, delta: 0.82, declineMult: 1.1, growthMult: 0.9, pedGrowth: 0.8, GW: 4, KGW: 12, MISSED: 4, vetStart: 29, vetSlope: 0.2 },
    { S: 180, gamma: 2.0, zRep: -0.9, delta: 0.72, declineMult: 0.8, growthMult: 0.5, pedGrowth: 1.2, GW: 8, KGW: 3, MISSED: 8, vetStart: 30.5, vetSlope: 0.1 },
  ];
  let best = null;
  for (const st of starts) {
    const step = { ...Object.fromEntries(POS.map((g) => ['pm_' + g, 0.1])), S: 0.3, gamma: 0.2, zRep: 0.25, delta: 0.03, declineMult: 0.2, growthMult: 0.15, pedGrowth: 0.3, GW: 2.5, KGW: 3, MISSED: 2, vetStart: 0.6, vetSlope: 0.04 };
    for (const [k, v] of Object.entries({ ...Object.fromEntries(POS.map((g) => ['pm_' + g, 1])), ...st, ...FIX })) set(k, v);
    for (const k of Object.keys(FIX)) delete step[k];
    let cur = objective();
    for (let iter = 0; iter < 50; iter++) {
      let improved = false;
      for (const k of Object.keys(step)) for (const dir of [1, -1]) {
        const old = get(k);
        const nv = k === 'S' ? old * Math.exp(dir * step[k]) : old + dir * step[k];
        set(k, Math.min(BOUNDS[k][1], Math.max(BOUNDS[k][0], nv)));
        const v = objective();
        if (v < cur - 1e-6) { cur = v; improved = true; } else set(k, old);
      }
      if (!improved) { for (const k in step) step[k] /= 2; if (step.gamma < 0.01) break; }
    }
    const res = { obj: cur, ...Object.fromEntries(Object.keys(PRIORS).map((k) => [k, +get(k).toFixed(3)])) };
    console.log('start ->', JSON.stringify(res));
    if (!best || cur < best.obj) best = res;
  }
  for (const [k, v] of Object.entries(best)) if (k !== 'obj') set(k, v);
  Deno.writeTextFileSync('calibrated.json', JSON.stringify(best, null, 1));
  console.log('BEST', JSON.stringify(best));
} else {
  try { for (const [k, v] of Object.entries(JSON.parse(R('calibrated.json')))) if (k !== 'obj') set(k, v); } catch { /* defaults */ }
}

rebuildFeatures();
let raw = 0; const res = withPlayers.map((t) => { const r = tradeLoss(t); raw += Math.min(r.l, 1); return { t, ...r }; });
const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
console.log('trades: mean loss', (raw / withPlayers.length).toFixed(4), '| median |log ratio|', med(res.map((r) => Math.sqrt(r.l))).toFixed(3));
const al = anchorPlayers.map((a) => ({ a, ...anchorLoss(a) }));
console.log('anchors: inside range', al.filter((x) => !x.d).length, '/', al.length, '| median |log miss|', med(al.map((x) => x.d)).toFixed(3));
if (Deno.args.includes('--anchors') || verbose) for (const { a, v, d } of al.sort((x, y) => y.d - x.d)) console.log(`  ${d ? (v < a.lo ? 'LOW ' : 'HIGH') : ' ok '} ${a.name.padEnd(22)} ${String(v).padStart(5)}  [${a.lo}-${a.hi}]`);
if (verbose) for (const { t, net, l } of res.sort((a, b) => b.l - a.l)) {
  const desc = t.items.map((i) => `${i.from}->${i.to} ${i.type === 'player' ? `${i.name}(${i.feat.age.toFixed(0)}y A=${M.ability(i.feat).toFixed(2)} ${Math.round(valueItem(i, t.year))})` : i.type === 'pick' ? `#${i.pick}(${M.dvi(i.pick)})` : `${i.year}R${i.round}${i.orig}(${Math.round(valueItem(i, t.year))})`}`).join(', ');
  console.log(`${t.year} loss=${l.toFixed(2)} ${Object.entries(net).map(([c, v]) => `${c} in ${Math.round(v.in)} out ${Math.round(v.out)}`).join(' | ')}\n    ${desc}`);
}
