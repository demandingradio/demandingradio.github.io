// Parse raw footywire / afltables / wikipedia pages into one players + picks dataset.
// deno run -A parse.js  -> writes out/raw-dataset.json
const R = (f) => Deno.readTextFileSync(f);
const dec = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const CLUBS = [
  // code, footywire slug, afltables header, wiki codes, fantasy nickname
  ['ADE', 'adelaide-crows', 'Adelaide', ['Ade'], 'Crows'],
  ['BRL', 'brisbane-lions', 'Brisbane Lions', ['BL', 'Bri'], 'Lions'],
  ['CAR', 'carlton-blues', 'Carlton', ['Car'], 'Blues'],
  ['COL', 'collingwood-magpies', 'Collingwood', ['Col'], 'Magpies'],
  ['ESS', 'essendon-bombers', 'Essendon', ['Ess'], 'Bombers'],
  ['FRE', 'fremantle-dockers', 'Fremantle', ['Fre'], 'Dockers'],
  ['GEE', 'geelong-cats', 'Geelong', ['Gee'], 'Cats'],
  ['GCS', 'gold-coast-suns', 'Gold Coast', ['GC'], 'Suns'],
  ['GWS', 'greater-western-sydney-giants', 'Greater Western Sydney', ['GWS'], 'Giants'],
  ['HAW', 'hawthorn-hawks', 'Hawthorn', ['Haw'], 'Hawks'],
  ['MEL', 'melbourne-demons', 'Melbourne', ['Mel'], 'Demons'],
  ['NTH', 'kangaroos', 'North Melbourne', ['NM'], 'Kangaroos'],
  ['PTA', 'port-adelaide-power', 'Port Adelaide', ['PA'], 'Power'],
  ['RIC', 'richmond-tigers', 'Richmond', ['Ric'], 'Tigers'],
  ['STK', 'st-kilda-saints', 'St Kilda', ['StK', 'STK'], 'Saints'],
  ['SYD', 'sydney-swans', 'Sydney', ['Syd'], 'Swans'],
  ['WCE', 'west-coast-eagles', 'West Coast', ['WC'], 'Eagles'],
  ['WBD', 'western-bulldogs', 'Western Bulldogs', ['WB'], 'Bulldogs'],
];
const bySlug = Object.fromEntries(CLUBS.map((c) => [c[1], c[0]]));
const byAT = Object.fromEntries(CLUBS.map((c) => [c[2], c[0]]));
const byWiki = {}; CLUBS.forEach((c) => c[3].forEach((w) => (byWiki[w.toLowerCase()] = c[0])));
const byNick = Object.fromEntries(CLUBS.map((c) => [c[4], c[0]]));
// footywire draft pages use short club names
const byShort = { Adelaide: 'ADE', Brisbane: 'BRL', 'Brisbane Lions': 'BRL', Carlton: 'CAR', Collingwood: 'COL', Essendon: 'ESS', Fremantle: 'FRE', Geelong: 'GEE', 'Gold Coast': 'GCS', GWS: 'GWS', 'Greater Western Sydney': 'GWS', Hawthorn: 'HAW', Melbourne: 'MEL', 'North Melbourne': 'NTH', Kangaroos: 'NTH', 'Port Adelaide': 'PTA', Richmond: 'RIC', 'St Kilda': 'STK', Sydney: 'SYD', 'West Coast': 'WCE', 'Western Bulldogs': 'WBD', Footscray: 'WBD' };

const ALIAS = { matt: 'matthew', tom: 'thomas', tommy: 'thomas', nick: 'nicholas', nic: 'nicholas', tim: 'timothy', sam: 'samuel', josh: 'joshua', dan: 'daniel', danny: 'daniel', will: 'william', zac: 'zachary', zach: 'zachary', zak: 'zachary', ollie: 'oliver', olly: 'oliver', alex: 'alexander', lachie: 'lachlan', lachy: 'lachlan', jake: 'jacob', mitch: 'mitchell', cam: 'cameron', ben: 'benjamin', chris: 'christopher', charlie: 'charles', nate: 'nathan', jimmy: 'james', jamie: 'james', bobby: 'robert', rob: 'robert', joe: 'joseph', max: 'maxwell', fred: 'frederick', ed: 'edward', ned: 'edward', pat: 'patrick', paddy: 'patrick', andy: 'andrew', harry: 'harrison', jon: 'jonathan', johnny: 'jonathan', ollie2: 'oliver', rhys: 'rhys', jez: 'jeremy', archie: 'archibald', freddie: 'frederick', mick: 'michael', mike: 'michael', bailey: 'bailey', callum: 'callum', cal: 'callum', jeremy: 'jeremy', tobie: 'tobias', toby: 'tobias', kossie: 'kossie', nathaniel: 'nathan', jordie: 'jordan', jordy: 'jordan', luke: 'luke', dom: 'dominic', dominic: 'dominic', xav: 'xavier', seb: 'sebastian', ty: 'tyler', rory: 'rory', aidan: 'aidan', aiden: 'aidan', jai: 'jai', jye: 'jye', brad: 'bradley', greg: 'gregory', steve: 'steven', stephen: 'steven', jack: 'jack', angus: 'angus', gus: 'angus', rich: 'richard', dick: 'richard', tj: 'tj', bj: 'bj', cj: 'cj', jj: 'jj' };
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
const canonFirst = (f) => ALIAS[f] || f;
const keyOf = (first, last) => canonFirst(norm(first).split(" ")[0]) + "|" + norm(last).replace(/\b(jr|snr|sr)\b/g, "").replace(/ /g, "");

// ---------------- footywire team lists ----------------
const players = [];
for (const [code, slug] of CLUBS) {
  const html = R(`raw/tp-${slug}.html`);
  const rows = html.split(/<tr class="(?:light|dark)color"/).slice(1);
  for (const row of rows) {
    const m = row.match(/href="pp-([a-z0-9-]+)--([a-z0-9-]+)">([^<]+)<\/a>/);
    if (!m) continue;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    const flags = [...row.matchAll(/class="playerflag" title="([^"]+)"/g)].map((x) => x[1]);
    const [last, first] = dec(m[3]).split(',').map((s) => s.trim());
    const num = parseInt(dec(tds[0])) || null;
    const games = parseInt(dec(tds[2])) || 0;
    const dob = dec(tds[4]);
    const height = parseInt(dec(tds[5])) || null;
    const origin = dec(tds[6]);
    const pos = tds[7].split(/<br\s*\/?>/).map(dec).filter(Boolean);
    players.push({ fw: `${m[1]}--${m[2]}`, nameSlug: m[2], club: code, first, last, name: `${first} ${last}`, num, games, dob, height, origin, pos, flags });
  }
}
console.error('players from lists', players.length);
const pByFw = Object.fromEntries(players.map((p) => [p.fw, p]));

// ---------------- contracts ----------------
let contracted = 0;
for (const [code, slug] of CLUBS) {
  const html = R(`raw/to-${slug}.html`);
  const rows = html.split(/<tr class="(?:light|dark)color" id="rowpid_/).slice(1);
  for (const row of rows) {
    const pid = parseInt(row);
    const m = row.match(/href="pp-([a-z0-9-]+--[a-z0-9-]+)">/);
    if (!m) continue;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => dec(x[1]));
    const p = pByFw[m[1]];
    if (!p) { console.error('contract w/o list player', m[1]); continue; }
    p.pid = pid; p.contractEnd = parseInt(tds[1]) || null; p.service = parseInt(tds[2]) || 0; p.fa = tds[3];
    contracted++;
  }
}
console.error('contracts matched', contracted);

// ---------------- 2026 fantasy + supercoach (footywire) ----------------
function parseSeasonAvg(file, prefix) {
  const html = R(file);
  const out = {};
  for (const row of html.split(/<tr class="(?:light|dark)color" id="rowpid_/).slice(1)) {
    const m = row.match(new RegExp(`href="${prefix}-([a-z0-9-]+--[a-z0-9-]+)"`));
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => dec(x[1]));
    if (!m) continue;
    out[m[1]] = { gm: parseInt(tds[3]), avg: parseFloat(tds[6]) };
  }
  return out;
}
const af26 = parseSeasonAvg('raw/dream_team_season-2026.html', 'pr');
const sc26 = parseSeasonAvg('raw/supercoach_season-2026.html', 'pu');
let afm = 0, scm = 0;
for (const p of players) {
  if (af26[p.fw]) { p.af26 = af26[p.fw]; afm++; }
  if (sc26[p.fw]) { p.sc26 = sc26[p.fw]; scm++; }
}
console.error('af26 matched', afm, 'of', Object.keys(af26).length, '| sc26', scm, 'of', Object.keys(sc26).length);

// ---------------- national drafts (footywire) ----------------
let dm = 0;
for (let y = 2008; y <= 2025; y++) {
  let html; try { html = R(`raw/ft_drafts-${y}.html`); } catch { continue; }
  for (const row of html.split(/<tr class="(?:light|dark)color"/).slice(1)) {
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    if (tds.length < 5) continue;
    const m = row.match(/href="pp-([a-z0-9-]+--[a-z0-9-]+)"/);
    if (!m) continue;
    const p = pByFw[m[1]];
    if (!p) continue;
    const round = parseInt(dec(tds[0])), pick = parseInt(dec(tds[1]));
    const by = byShort[dec(tds[2])] || dec(tds[2]);
    const flag = (row.match(/class="playerflag" title="([^"]+)"/) || [])[1] || null;
    if (!p.draft || p.draft.year < y) { p.draft = { year: y, round, pick, by, flag }; dm++; }
  }
}
console.error('draft matched', dm);

// ---------------- afltables seasons ----------------
const COLS = ['num', 'player', 'gm', 'ki', 'mk', 'hb', 'di', 'da', 'gl', 'bh', 'ho', 'tk', 'rb', 'if', 'cl', 'cg', 'ff', 'fa', 'br', 'cp', 'up', 'cm', 'mi', 'op', 'bo', 'ga', 'pct', 'su'];
const seasons = {};
for (const y of [2023, 2024, 2025, 2026]) {
  const html = R(`raw/afltables-${y}.html`);
  const parts = html.split(/<th colspan=28><a href="[^"]*">/).slice(1);
  const rows = [];
  for (const part of parts) {
    const team = byAT[part.slice(0, part.indexOf('<'))];
    const body = part.slice(0, part.indexOf('</tbody>'));
    for (const tr of body.split('<tr>').slice(1)) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
      const link = (tr.match(/href="players\/([^"]+)\.html"/) || [])[1];
      if (!link) continue;
      const o = { team, link };
      COLS.forEach((c, i) => { if (c === 'player') { const [l, f] = dec(tds[i]).split(',').map((s) => s.trim()); o.last = l; o.first = f; } else if (c !== 'su') o[c] = parseFloat(dec(tds[i] || '')) || 0; });
      rows.push(o);
    }
  }
  seasons[y] = rows;
  console.error('afltables', y, rows.length, 'rows');
}

// match footywire players -> afltables links
const atIndex = {}; // key -> [{link, team, year}]
for (const y of [2026, 2025, 2024, 2023]) for (const r of seasons[y]) {
  const k = keyOf(r.first, r.last);
  (atIndex[k] ||= []).push({ link: r.link, team: r.team, y });
  const k2 = 'L|' + norm(r.last).replace(/ /g, '') + '|' + norm(r.first)[0];
  (atIndex[k2] ||= []).push({ link: r.link, team: r.team, y });
}
let matched = 0; const unmatched = [];
for (const p of players) {
  const cands = [...(atIndex[keyOf(p.first, p.last)] || [])];
  let links = [...new Set(cands.map((c) => c.link))];
  if (links.length > 1) { // disambiguate by current team
    const sameTeam = [...new Set(cands.filter((c) => c.team === p.club).map((c) => c.link))];
    if (sameTeam.length === 1) links = sameTeam;
  }
  if (links.length === 0) { // fallback: surname + initial + team
    const c2 = (atIndex['L|' + norm(p.last).replace(/ /g, '') + '|' + norm(p.first)[0]] || []).filter((c) => c.team === p.club);
    links = [...new Set(c2.map((c) => c.link))];
  }
  if (links.length === 1) { p.at = links[0]; matched++; }
  else if (links.length > 1) { unmatched.push(`${p.name} (${p.club}) AMBIG ${links.join(',')}`); }
  else if (p.games > 0) unmatched.push(`${p.name} (${p.club}) games=${p.games}`);
}
// two current players with the same name (e.g. Max King STK/SYD) can both grab one afltables link:
// keep it only for the player whose club matches the link's most recent team
const claims = {};
for (const p of players) if (p.at) (claims[p.at] ||= []).push(p);
for (const [link, ps] of Object.entries(claims)) {
  if (ps.length < 2) continue;
  let lastTeam = null;
  for (const y of [2026, 2025, 2024, 2023]) { const r = seasons[y].find((x) => x.link === link); if (r) { lastTeam = r.team; break; } }
  for (const p of ps) if (p.club !== lastTeam) { console.error('  link collision: dropped', link, 'from', p.name, p.club); delete p.at; matched--; }
}
console.error('afltables matched', matched, 'unmatched w/ games:', unmatched.length);
unmatched.forEach((u) => console.error('  ', u));

// attach seasons
const atByLink = {};
for (const y of [2023, 2024, 2025, 2026]) for (const r of seasons[y]) {
  const e = (atByLink[r.link] ||= {});
  const { link, first, last, num, player, ...stats } = r;
  if (e[y]) { // traded mid-season? merge (rare, not in AFL) — keep bigger
    if (stats.gm > e[y].gm) e[y] = stats;
  } else e[y] = stats;
}
for (const p of players) if (p.at) p.seasons = atByLink[p.at];

// ---------------- retirements / delistings (wiki 2026) ----------------
const wiki = R('raw/2026_AFL_draft.wiki');
function wikiNames(section, endMarker) {
  const s = wiki.slice(wiki.indexOf(section), wiki.indexOf(endMarker));
  const out = []; let club = null;
  for (const row of s.split(/\n\|-/)) {
    const nm = row.match(/\{\{sortname\|([^|}]+)\|([^|}]+)/);
    const cm = row.match(/\{\{AFL[ |]([A-Za-z]+)\}\}/);
    if (cm) club = byWiki[cm[1].toLowerCase()];
    if (nm) out.push({ first: nm[1], last: nm[2], club });
  }
  return out;
}
const retired = wikiNames('===Retirements===', '===Delistings===');
const delisted = wikiNames('===Delistings===', '==Tasmania concessions==');
console.error('retired', retired.length, 'delisted', delisted.length);
const gone = [];
for (const [list, why] of [[retired, 'retired'], [delisted, 'delisted']]) for (const r of list) {
  const k = keyOf(r.first, r.last);
  const hit = players.filter((p) => keyOf(p.first, p.last) === k && (!r.club || p.club === r.club));
  if (hit.length === 1) { hit[0].status = why; gone.push(`${why}: ${hit[0].name} ${hit[0].club}`); }
  else console.error(`  ${why} not matched: ${r.first} ${r.last} ${r.club} (${hit.length})`);
}
console.error('status applied', gone.length);

// ---------------- draft picks 2026 (wiki national draft table) ----------------
const nd = wiki.slice(wiki.indexOf('== 2026 national draft =='), wiki.indexOf('== 2026 rookie draft =='));
const picks2026 = [];
let round = 0;
for (const row of nd.split(/\n\|-/)) {
  const rm = row.match(/rowspan="?\d+"?\s*\|\s*(\d+)\s*\n\|\s*(\d+)/);
  let pick;
  if (rm) { round = +rm[1]; pick = +rm[2]; }
  else { const pm = row.match(/^\s*\n?\|\s*(\d+)\s*\n/); if (pm) pick = +pm[1]; }
  const cm = row.match(/\{\{AFL[ |]([A-Za-z]+)\}\}/);
  if (!pick || !cm) continue;
  const via = [...row.matchAll(/←\{\{AFL[ |]([A-Za-z]+)\}\}/g)].map((x) => byWiki[x[1].toLowerCase()]);
  picks2026.push({ year: 2026, round, pick, owner: byWiki[cm[1].toLowerCase()], orig: via.length ? via[via.length - 1] : byWiki[cm[1].toLowerCase()], via });
}
console.error('2026 picks', picks2026.length);

// ---------------- 2027 traded picks from 2025 trades ----------------
const w25 = R('raw/2025_AFL_draft.wiki');
const t25 = w25.slice(w25.indexOf('=== Trades ==='), w25.indexOf('== List changes =='));
const future27 = [];
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
for (const row of t25.split(/\n\|-/)) {
  // blocks: "to {{AFL|X}} ... ----" lists
  const isSwap = /Trade Picks? [\d, ]+ to/.test(row);
  const blocks = isSwap ? [] : row.split(/to \{\{AFL[ |]/).slice(1);
  for (const b of blocks) {
    const to = byWiki[b.match(/^([A-Za-z]+)/)[1].toLowerCase()];
    for (const m of b.matchAll(/2027 (first|second|third|fourth|fifth) round pick \(\{\{AFL[ |]([A-Za-z]+)\}\}\)/g)) {
      future27.push({ year: 2027, round: ORD[m[1]], orig: byWiki[m[2].toLowerCase()], owner: to });
    }
  }
  // draft-night swaps: "X Trade Pick N to Y for ... 2027 third round pick (Z)"
  const sw = row.match(/\{\{AFL[ |]([A-Za-z]+)\}\} Trade Picks? [\d, ]+ to \{\{AFL[ |]([A-Za-z]+)\}\} for (.*)/);
  if (sw) {
    const receiver = byWiki[sw[1].toLowerCase()];
    for (const m of sw[3].matchAll(/2027 (first|second|third|fourth|fifth) round pick \(\{\{AFL[ |]([A-Za-z]+)\}\}\)/g)) future27.push({ year: 2027, round: ORD[m[1]], orig: byWiki[m[2].toLowerCase()], owner: receiver, note: 'draft-night swap' });
  }
}
console.error('2027 traded picks', JSON.stringify(future27));

// ---------------- ladder / finals ----------------
const lad = JSON.parse(R('raw/ladder-2026.json')).standings;
const ladder = lad.map((s) => ({ rank: s.rank, club: CLUBS.find((c) => c[2] === s.name || (s.name === 'Brisbane Lions' && c[0] === 'BRL') || (s.name === 'Greater Western Sydney' && c[0] === 'GWS'))?.[0], w: s.wins, l: s.losses, d: s.draws, pct: +s.percentage.toFixed(1) }));

// ---------------- write ----------------
const today = new Date('2026-09-30');
for (const p of players) {
  const [d, mo, y] = p.dob.split(' ');
  const dt = new Date(`${mo} ${d}, ${y}`);
  p.age = +((today - dt) / (365.25 * 864e5)).toFixed(2);
}
Deno.mkdirSync('out', { recursive: true });
Deno.writeTextFileSync('out/raw-dataset.json', JSON.stringify({ players, picks2026, future27, ladder }, null, 0));
console.error('wrote out/raw-dataset.json', players.length, 'players,', players.filter((p) => p.status).length, 'gone');
