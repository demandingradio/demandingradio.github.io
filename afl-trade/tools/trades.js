// Parse historical trade tables (2023-2025 trade periods) from Wikipedia wikitext.
// deno run -A trades.js -> out/trades.json
const byWiki = { ade: 'ADE', bl: 'BRL', bri: 'BRL', car: 'CAR', col: 'COL', ess: 'ESS', fre: 'FRE', gee: 'GEE', gc: 'GCS', gws: 'GWS', haw: 'HAW', mel: 'MEL', nm: 'NTH', pa: 'PTA', ric: 'RIC', stk: 'STK', syd: 'SYD', wc: 'WCE', wb: 'WBD' };
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };
const club = (s) => byWiki[s.toLowerCase()];
const out = [];
for (const year of [2023, 2024, 2025]) {
  const w = Deno.readTextFileSync(`raw/${year}_AFL_draft.wiki`);
  const t = w.slice(w.indexOf('=== Trades ==='), w.indexOf('== List changes =='));
  for (const row of t.split(/\n\|-/)) {
    if (/Trade Picks? [\d, ]+ to/.test(row)) continue; // draft-night pick swaps: picks only, handled separately
    const cells = row.split(/\|\s*valign="?top"?\s*\|/).slice(1);
    if (cells.length < 2) continue;
    const flows = [];
    for (const cell of cells) {
      // a cell can contain several "to X ---- items" blocks
      const blocks = cell.split(/(?=to \{\{AFL[ |])/).filter((b) => b.startsWith('to {{AFL'));
      for (const b of blocks) {
        const to = club(b.match(/^to \{\{AFL[ |]([A-Za-z]+)\}\}/)[1]);
        const fromM = b.match(/^to \{\{AFL[ |][A-Za-z]+\}\}\s*\(?from \{\{AFL[ |]([A-Za-z]+)\}\}/);
        const blockFrom = fromM ? club(fromM[1]) : null;
        const items = b.split(/\n\s*\*/).slice(1);
        for (let it of items) {
          it = it.replace(/\{\{sort\|\d+\|([^{}]*)\}\}/g, '$1').replace(/'''/g, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').replace(/\{\{ref label[^}]*\}\}/g, '').replace(/\|\s*align="center"[\s\S]*/, '').trim();
          const itFrom = (it.match(/\(from \{\{AFL[ |]([A-Za-z]+)\}\}\)/) || [])[1];
          const from = itFrom ? club(itFrom) : blockFrom;
          let a = null;
          let m;
          if ((m = it.match(/^pick No\.\s*(\d+)/i))) a = { type: 'pick', year, pick: +m[1] };
          else if ((m = it.match(/(?:\[\[\d{4} AFL draft\|)?(\d{4})(?:\]\])? (first|second|third|fourth|fifth|sixth) round pick \(\{\{AFL[ |]([A-Za-z]+)\}\}\)/))) a = { type: 'future', year: +m[1], round: ORD[m[2]], orig: club(m[3]) };
          else if ((m = it.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/))) a = { type: 'player', name: (m[2] || m[1]).replace(/ \(.*\)$/, ''), wiki: m[1] };
          if (a) flows.push({ to, from, ...a });
          else if (it) flows.push({ to, from, type: 'unknown', raw: it.slice(0, 80) });
        }
      }
    }
    if (flows.length) out.push({ year, flows });
  }
}
// fill missing "from" in 2-club trades
for (const t of out) {
  const clubs = [...new Set(t.flows.flatMap((f) => [f.to, f.from]).filter(Boolean))];
  t.clubs = clubs;
  for (const f of t.flows) if (!f.from && clubs.length === 2) f.from = clubs.find((c) => c !== f.to);
}
Deno.writeTextFileSync('out/trades.json', JSON.stringify(out, null, 1));
console.log('trades', out.length, 'by year', [2023, 2024, 2025].map((y) => out.filter((t) => t.year === y).length));
console.log('unknown items', out.flatMap((t) => t.flows.filter((f) => f.type === 'unknown')).map((f) => f.raw));
console.log('missing from', out.flatMap((t) => t.flows.filter((f) => !f.from)).length);
console.log('with players', out.filter((t) => t.flows.some((f) => f.type === 'player')).length);
for (const t of out.slice(-6)) console.log(t.year, t.clubs.join('/'), t.flows.map((f) => `${f.from}->${f.to}:${f.type === 'player' ? f.name : f.type === 'pick' ? '#' + f.pick : f.year + 'R' + f.round + f.orig}`).join(' | '));
