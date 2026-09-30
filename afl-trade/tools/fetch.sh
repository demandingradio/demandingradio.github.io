#!/usr/bin/env bash
# Download every raw page the data pipeline needs into tools/raw/ (skips files already downloaded;
# delete raw/ to force a full refresh). Run from the tools/ folder:  bash fetch.sh
set -e
mkdir -p raw
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
get() { [ -s "$1" ] || { curl -sL -A "$UA" -o "$1" "$2"; sleep 0.6; }; }

TEAMS="adelaide-crows brisbane-lions carlton-blues collingwood-magpies essendon-bombers fremantle-dockers geelong-cats gold-coast-suns greater-western-sydney-giants hawthorn-hawks kangaroos melbourne-demons port-adelaide-power richmond-tigers st-kilda-saints sydney-swans west-coast-eagles western-bulldogs"
# footywire: lists (tp), contracts (to), draft history (td)
for t in $TEAMS; do for k in tp to td; do get "raw/$k-$t.html" "https://www.footywire.com/afl/footy/$k-$t"; done; done
# footywire: current-season AFL Fantasy + SuperCoach averages (the site only serves the current season)
get raw/dream_team_season-2026.html "https://www.footywire.com/afl/footy/dream_team_season"
get raw/supercoach_season-2026.html "https://www.footywire.com/afl/footy/supercoach_season"
# footywire: national drafts (draft pedigree)
for y in $(seq 2008 2025); do get "raw/ft_drafts-$y.html" "https://www.footywire.com/afl/footy/ft_drafts?year=$y"; done
# afltables: full season stats
for y in $(seq 2019 2026); do get "raw/afltables-$y.html" "https://afltables.com/afl/stats/$y.html"; done
# Squiggle: ladders
for y in 2022 2023 2024 2025 2026; do get "raw/ladder-$y.json" "https://api.squiggle.com.au/?q=standings;year=$y"; done
# Wikipedia wikitext: 2026 draft order + retirements/delistings, 2023-25 trades
for y in 2023 2024 2025 2026; do get "raw/${y}_AFL_draft.wiki" "https://en.wikipedia.org/w/index.php?title=${y}_AFL_draft&action=raw"; done
echo "done: $(ls raw | wc -l) files in raw/"
