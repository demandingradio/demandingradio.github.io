# Mega Trade Machine — data pipeline

These scripts rebuild `../data.js` (every listed player, their value inputs, and every draft pick).
They are not loaded by the website. Needs [Deno](https://deno.com) and `curl` (Git Bash).

Run from this `tools/` folder:

```
bash fetch.sh                      # download raw pages into raw/ (cached; delete raw/ to refresh)
deno run -A parse.js               # join lists + contracts + drafts + stats -> out/raw-dataset.json
deno run -A fitsc.js               # fit the SuperCoach-style score from raw stats -> out/scproxy.json
deno run -A trades.js              # parse the 2023-25 real trades -> out/trades.json
deno run -A calibrate.js --fit     # (optional) re-tune the model on real trades -> calibrated.json
deno run -A build.js --report      # write ../data.js and print a sanity report
deno run -A report.js              # full valuation list -> out/valuation_report.txt
```

Set `BRW=8` (Brownlow-vote weight) in the environment for parse/calibrate/build if you change it; 8 is the default.

## Things that are hand-maintained for the 2026 season

- `inputs.json` — guernsey colours, and the 2027 picks that aren't held by their original club.
  **After each real trade, update this and re-run build.js** (2026 picks are read from Wikipedia's draft-order table).
- `dvi2026.json` — the AFL's 2026 Draft Value Index (also copied into `../model.js`).
- `build.js` — the 2026 finals results (`FINISH`) and the Jesse Hogan override (Wikipedia lists him as delisted; he is being traded).
- `parse.js` — "today" (`2026-09-30`) for ages; the 51/52 pick correction lives in `build.js` (AFL official order).

`raw/` and `out/` are git-ignored.
