// Shared feature-building for the AFL trade value model (Deno build + calibration).
// Everything "as of" a given season so historical trades can be re-valued with the data
// that existed at the time.
export const R = (f) => Deno.readTextFileSync(f);
const dec = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

export const AT_TEAMS = { Adelaide: 'ADE', 'Brisbane Lions': 'BRL', Carlton: 'CAR', Collingwood: 'COL', Essendon: 'ESS', Fremantle: 'FRE', Geelong: 'GEE', 'Gold Coast': 'GCS', 'Greater Western Sydney': 'GWS', Hawthorn: 'HAW', Melbourne: 'MEL', 'North Melbourne': 'NTH', 'Port Adelaide': 'PTA', Richmond: 'RIC', 'St Kilda': 'STK', Sydney: 'SYD', 'West Coast': 'WCE', 'Western Bulldogs': 'WBD' };
const COLS = ['num', 'player', 'gm', 'ki', 'mk', 'hb', 'di', 'da', 'gl', 'bh', 'ho', 'tk', 'rb', 'if', 'cl', 'cg', 'ff', 'fa', 'br', 'cp', 'up', 'cm', 'mi', 'op', 'bo', 'ga', 'pct', 'su'];

// ---- afltables season pages -> rows ----
export function loadSeason(y) {
  const html = R(`raw/afltables-${y}.html`);
  const parts = html.split(/<th colspan=28><a href="[^"]*">/).slice(1);
  const rows = [];
  for (const part of parts) {
    const team = AT_TEAMS[part.slice(0, part.indexOf('<'))];
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
  return rows;
}

// ---- SuperCoach proxy (fitted on 2026: R^2 0.976) ----
const SCP = JSON.parse(R('out/scproxy.json'));
// 2020 had 16-minute quarters: scale counting stats up to an 80-minute-quarter equivalent
const SEASON_SCALE = { 2020: 1.22 };
export function scPerGame(s, year) {
  if (!s || !s.gm) return null;
  const k = SEASON_SCALE[year] || 1;
  let v = SCP.beta[0];
  SCP.F.forEach((f, i) => { v += SCP.beta[i + 1] * (s[f] / s.gm) * k; });
  // partial-game adjustment (subs / managed minutes): half-way credit toward a full game
  const pct = s.pct || 80;
  if (pct < 78) v *= Math.sqrt(80 / Math.max(45, pct));
  return v;
}

// season impact = SuperCoach proxy + Brownlow votes per game (umpires' view of who dominated)
// + a scoreboard term (SuperCoach under-credits goals: a 60-goal key forward rates near replacement otherwise)
// key forwards get extra goal credit (KGW): contested goal-kicking is what the market pays them for
export const CFG = { BRW: Number(Deno.env.get('BRW') ?? 8), GW: 6, KGW: 6, MISSED: 6 };
export function impact(s, year) { const kf = inferGroup(s) === 'KF'; return scPerGame(s, year) + (CFG.BRW * (s.br || 0) + (CFG.GW + (kf ? CFG.KGW : 0)) * (s.gl || 0)) / s.gm; }

// ---- stat-inferred position group ----
// RUC ruck, MID inside midfield, MF mid-forward, KF key forward, GF general forward, KD key defender, GD general defender
export function inferGroup(s) {
  const g = s.gm || 1, per = (k) => s[k] / g;
  if (per('ho') >= 9) return 'RUC';
  const midish = per('cl') >= 2.6 || (per('cl') >= 1.8 && per('di') >= 20);
  if (midish && per('gl') >= 0.9 && per('cl') < 5) return 'MF';
  if (midish) return 'MID';
  if (per('cl') >= 1.5 && per('gl') >= 0.9) return 'MF';
  const fwd = per('gl') * 2 + per('mi') * 1.5 + per('if') * 0.4 + per('bh');
  const def = per('rb') * 1.2 + per('op') * 0.8;
  if (fwd >= def) return (per('cm') >= 0.9 || per('mi') >= 1.9 || (per('gl') >= 1.8 && per('cm') >= 0.6)) ? 'KF' : 'GF';
  return per('op') >= 4.2 && per('rb') < 4.5 ? 'KD' : 'GD';
}

// ---- per-season group norms over every player with >= 6 games ----
export function seasonNorms(rows, year) {
  const byG = {}; const all = [];
  for (const r of rows) {
    if (r.gm < 6) continue;
    const sc = impact(r, year); const g = inferGroup(r);
    (byG[g] ||= []).push(sc); all.push(sc);
  }
  const ms = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); return { m, sd, n: a.length }; };
  const out = { all: ms(all) };
  for (const [g, a] of Object.entries(byG)) out[g] = ms(a);
  return out;
}
// blend happens in the model (M.ability); here we return both components.
// height (when known) stops a 188cm intercept defender being judged as a key-position player
export function seasonZ(s, year, norms, height) {
  const sc = impact(s, year); let g = inferGroup(s); const n = norms[year];
  if (height && g === 'KD' && height < 192) g = 'GD';
  if (height && g === 'KF' && height < 190) g = 'GF';
  return { zg: (sc - n[g].m) / n[g].sd, za: (sc - n.all.m) / n.all.sd, sc, g };
}

export const DVI26 = JSON.parse(R('dvi2026.json'));
export const dvi = (pick) => (pick >= 1 && pick <= DVI26.length ? DVI26[pick - 1] : 0);

// ---- player features as of the end of season `asOf` ----
// seasonsByYear: {year: statsRow}; info: {dob: Date, height, draft:{year,pick}, games (career at asOf)}
export const MISSED_Z = -1.0; // games lost from the latest season count as games at about replacement level
export function features(seasonsByYear, info, asOf, norms) {
  const zs = []; const groups = {}; let gRecent = 0; const scs = {};
  for (let ago = 0; ago < 4; ago++) {
    const y = asOf - ago; const s = seasonsByYear?.[y];
    if (!s || !s.gm || !norms[y]) continue;
    const { zg, za, g, sc } = seasonZ(s, y, norms, info.height);
    zs.push([+zg.toFixed(3), +za.toFixed(3), s.gm, ago, g]);
    scs[y] = +sc.toFixed(1);
    groups[g] = (groups[g] || 0) + [1, 0.6, 0.35, 0.2][ago] * s.gm;
    if (ago < 2) gRecent += s.gm;
  }
  // an established player who (mostly) missed the latest season: count the missing games against him
  const gNow = seasonsByYear?.[asOf]?.gm || 0;
  const established = [1, 2].some((a) => (seasonsByYear?.[asOf - a]?.gm || 0) >= 8);
  if (established && gNow < 10 && CFG.MISSED > 0) zs.push([MISSED_Z, MISSED_Z, +(CFG.MISSED * (10 - gNow) / 10).toFixed(2), 0, 'MISSED']);
  const age = (new Date(`${asOf}-09-30`) - info.dob) / (365.25 * 864e5);
  const ped = info.draft && info.draft.pick ? dvi(info.draft.pick) / 3000 : 0;
  const yrsIn = info.draft ? Math.max(0, asOf - info.draft.year) : 3;
  let zPrior = -1.55 + 1.15 * ped;
  if ((info.games || 0) < 15) zPrior -= 0.22 * Math.max(0, yrsIn - 1);
  const group = Object.entries(groups).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  let avail = Math.min(1, (gRecent + 10) / (46 + 10));
  if (info.draft && asOf - info.draft.year <= 1) avail = Math.max(avail, 0.85); // first/second-year players: not playing isn't injury
  return { zs, zPrior: +zPrior.toFixed(2), ped: +ped.toFixed(3), age: +age.toFixed(3), avail: +avail.toFixed(2), group, games: info.games || 0, scs, dy: info.draft?.year || null, dp: info.draft?.pick || null };
}

export function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim(); }
