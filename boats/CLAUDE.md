# BOATS: the guide for agents (read this first)

Line numbers are for the code **as it is now**, after Stage B round 1 (2026-10-15): `boats/index.html` (35,475 lines, md5 `7ddaceac96a9750b286108029961b5bc`) plus 14 classic scripts in `boats/js/` (§4). A bare number is an `index.html` line; `name.js:N` is line N of that file in `boats/js/` (no two files share a name). **`orig N`** is a line of the unsplit build 5109cd5 (`C:/Users/oscil/boats-dev/checkpoints/pre-split/index.html`, md5 `229d72951ad337222d93a19c935ac2c6`, 42,170 lines): refactor_map.md, `split_move.ts --orig` and `lint_allow.json` use those, and §4 converts them. Treat every number as a hint and find code by name (`function name(`, `let name`, `const name`). **For any other code change, update this file in the same commit.** It is the source of truth; older specs and notes are history.

## 1. What it is

- An open-world sailing, cartography and island-crawl RPG in the browser. You sail a streamed procedural sea and chart it through fog of war. Ashore you clear island crawls with combat, loot, biomes and caves. You also fish and whale, trade in ports and towns, walk your own deck with a crew, play through a guided story (INTROSTORY), and hear music from the game's own engine (THE BARD).
- There is no build step: plain HTML, CSS and JS served as-is. The game is `boats/index.html` (~4.7 MB: markup, CSS and 12 inline script parts) plus 14 classic `<script src>` files in `boats/js/` that share one global scope (§4). The other files are `boats/sfx/` (CC0 samples and `manifest.json`) and this guide.
- The owner is not a programmer and judges by playing. Report in plain language: what changed, what to play, and what you're unsure of.

## 2. Deploy and git rules

- GitHub Pages serves `main` of `demandingradio/demandingradio.github.io` (local clone: `C:\Users\oscil\demandingradio.github.io`). The game is live at **mondayjeffrey.com/boats/** and has no desktop icon (URL only). **A push to main is a deploy** and goes live in about a minute. Live is still the unsplit build 5109cd5.
- **The owner says when to push.** Until then, commit locally in small steps. The split lives on the local branch `boats-split-b` in the git worktree `C:/Users/oscil/boats-split-wt`, not on main (lead decision D4, §10): not merged, not pushed.
- Stage boats files **by path** (`git add boats/index.html boats/js/<dir>/<name>.js boats/CLAUDE.md …`). Never use `git add -A`, `git add .` or `git commit -a`: the main checkout holds other apps' unfinished work (on 2026-10-14: footy, boatswiki, `assets/win95.js`, `boredom/`, `staffing/`; check `git status`). In the worktree, run every git command that writes files as `git -C C:/Users/oscil/boats-split-wt -c core.autocrlf=false …` (trap 3), and never use `git stash`.
- Don't touch other apps or `C:\Users\oscil\boats-tester` (a read-only reference copy). Local branches `boats-checkpoint-pre-*` are checkpoints: never push them.
- **Cache tags, `?v=N`.** Every game `<script src>` carries the same `?v=N` (today `?v=1`; lint check 8). **Bump N on every push that changes any file in `boats/js/`**, with `deno run -A C:/Users/oscil/boats-dev/split_move.ts --html <html> --v N` (it sets every tag; never edit tags by hand), so a deploy never pairs new html with old cached files. The split's first push ships `?v=1`, then +1 per such push. `--v N` is also the repair when tags carry different values. split_move refuses the main checkout's html unless given `--allow-main`, which needs the lead's OK: bump on the branch before it is merged.
- **Jekyll:** the repo has no `.nojekyll`, so Pages renders `.md` files through Liquid. This file must never contain two opening curly braces in a row, or an opening curly brace followed by a percent sign, even inside code blocks. One bad tag can fail the whole site's deploy. Grep for both before committing. Once pushed, this file is also public at `/boats/CLAUDE.html`. Jekyll also does not publish a file or folder whose name starts with `_` or `.`: a `js/` file named like that would 404 live while every local check passes. Each `js/<dir>/<name>.js` name must be lower-case and start with a letter or digit (split_move.ts refuses anything else; split_lint does not check it).

## 3. The file at a glance

| Lines | What |
|---|---|
| 1-7 | doctype, `<html>`, `<head>` opening, meta tags and `<title>` |
| 8-1125 | CSS (one `<style>`, inside the head) |
| 1126-1380 | `</head>` (1126), `<body>` (1127), then the HTML: `canvas#c` (1128), `#mute` (1130), title, menu, shop, talk, ledger and tuning-panel overlays. Load-time code looks these ids up, so they must keep existing |
| 1381-35473 | The 26 game scripts, in the original order: 12 inline `<script>` parts and 14 `<script src="js/…?v=1">` tags (§4). Part 1 keeps the original `"use strict";` (1382) and the SECTION INDEX comment (1383-1395, **out of date**: refactor_map.md §7) |
| 35474-35475 | `</body>`, `</html>` |

The scripts hold about 3,970 top-level functions, 1,055 `let`/`const` statements (no `var`), 5,546 top-level names and **406 statements that run at load**. LF line endings, no BOM. Banners look like `/* ==== name ==== */`, but many systems spill past their banner, and some banners mislead:
- 'start / boot' (tuning_panels.js:152) heads `ITUNE_DEF`.
- `updateIsland` and the core foe AI sit inside THE CAVES BELOW; TOWNSFOLK also covers rooms, the old port renderer and the shops.
- `frameInner` (35178) and the title (35294) have no `====` banner of their own: each opens the inline part after a js file.
- The SOUND 3.0 sfx engine (`sfx.js`) has no `====` banner, only a `/* ---- SOUND 3.0` sub-header at sfx.js:37.

## 4. File map (the 26 scripts in load order)

`split_move.ts --html <html> --map` prints the same list; the lint calls the inline parts `index.html#1`-`#12`. Every part starts with its own `"use strict";`. **To convert `orig N`:** find the row whose Orig range holds N; today's line is N − K (in `index.html` for an inline part, in the file for a js file). ↳ rows are the systems inside the big inline parts. Key names give today's line in that row's file.

| # | Now | Orig | K | What it holds · key names (line now) |
|---|---|---|---|---|
| 1 | `index.html#1` 1381-1463 | 1382-1462 (--map: 1383-1462; 1382 is the kept `"use strict";`) | 0 | Header, canvas, helpers: `cv`/`ctx` 1397-1398, `pix`/`pctx` (the low-res world buffer) 1401-1402, `resize` 1417, `setPixScale` 1432, `clamp`/`lerp`/`TAU` 1439 (const arrows, not hoisted) |
| 2 | `js/data/crawl2.js` (tag 1464) | 1463-2468 | 1442 | CRAWL2 DATA tables: `SAVE_SV` 26, `LEGACY_FEEL` 236, `SFX2` 242, `SFX_MAP`, `GEMS` 610, `MATS` 742, `AFX` 828, `TREE` 1013; also `EHP`, `WEAPON`, `ATK`, `BOSS_ATK`, `IBASE`, `POWERS` |
| 3 | `index.html#2` 1465-4184 | 2469-5185 | 1002 | World, seas, core state, save, input: |
| ↳ | 1467-1915 | 2469-2917 | | World generation: `WORLD` 1468, `cores`/`SEED` 1471, `WGEN` 1473, `buildWorld` 1549, `window.__seas` created 1909 |
| ↳ | 1916-3503 | 2918-4505 | | Seas & Depths at sea (SE2-SE7): `SEAS_SV` 1927, `seasSave`/`seasLoad` 2012-2013, anchors `<<SE6-BLOCK` 2823 … `SE7-BLOCK>>` 3503 |
| ↳ | 3504-3599 | 4506-4601 | | Palette, core state, chart state, toasts: `SAVE_KEY` 3523, `DEFAULT_TUNE`/`TUNE` 3525-3530, `boat` 3531, `time`/`started` 3534, `explored` 3537, chart `fm*`/`FMV`/`FMU`/`EXS` 3543-3553, `SHIP`/`DK` 3554, `exAdd` 3559, `exRebuild` 3562, `PLOG` 3578, `toast` 3579 |
| ↳ | 3600-3791 | 4602-4793 | | Save / load: `queueSave` 3601, `doSave` 3602, `saveWrite` 3663, `loadSave` 3675, `tunePrune` 3790 |
| ↳ | 3792-4183 | 4794-5185 | | Input, gamepad, Options tab: `keys` 3793, keydown 3794 (18 listeners in 3794-3934), `PAD` 3967, `pollPad` 4047, `renderControlsTab` 4164 |
| 4 | `js/debug/playtest_log.js` (tag 4185) | 5186-5453 | 5165 | Playtest log (DEV, off by default): `plogOn` 35, `plogStart` 37 |
| 5 | `js/audio/audio.js` (tag 4186) | 5454-5737 | 5430 | Audio graph, samples, ambience: `initAudio` 37, `#mute` onclick 79, `SNDP` 157, `ambTick` 289 |
| 6 | `js/audio/bard.js` (tag 4187) | 5738-6202 | 5717 | THE BARD music engine: `MUS` 35, `musBoot` 374 |
| 7 | `js/audio/songbook.js` (tag 4188) | 6203-7839 | 6183 | The songbook: `MUS_T` 26 (23 tracks, pure data; key order is load-bearing) |
| 8 | `index.html#3` 4189-4555 | 7840-8203 | 3649 | THE DIRECTOR (A4 waits): `musEval` 4207, `musUpdate` 4361, `musGesture` 4372-4373. World clock and the sea tick: `gameDate` 4391, `CONTROLS_HTML` 4394, `updateEnv` 4403, `update` 4438 |
| 9 | `js/render/sea_lands.js` (tag 4556) | 8204-8668 | 8180 | Sea rendering: THE LANDS FROM THE SEA, `SB_X` 70, `slDraw` 175, `drawSea` 211, `drawBoat` 423 |
| 10 | `index.html#4` 4557-5795 | 8669-9904 | 4110 | Fishing and whaling: `FISH` 4567, `FTUNE` 4598, `updateFishing` 4812, `FTUNE_DEF` 5032, `WHALES` 5060, `WTUNE` 5087, `updateWhaling` 5452 |
| 11 | `js/render/sea_creatures.js` (tag 5796) | 9905-10616 | 9881 | Sea creatures in pixels: `SCR` 41, `PORT` 540 (fish-log portraits, not harbours) |
| 12 | `index.html#5` 5797-6193 | 10617-11010 | 4818 | Whaling sliders (`WTUNE_DEF` 5800), sea HUD: `drawHUD` 5931, the toasts drawer |
| 13 | `js/chart/chart.js` (tag 6194) | 11011-11415 | 10992 | Chart and minimap: `drawMinimap` 48, `fmFrame` 165, `fmToggle` 207, `openFullMap` 249, `drawFullMap` 294, the shared `roundRect` 420. Its state stays in part 3 |
| 14 | `index.html#6` 6195-6396 | 11416-11614 | 5219 | Island state, biomes, pouch and hold: `mode` 6200, `ISL` 6202, `player` 6205, `BIOMES` 6296, `HOLD` 6357 |
| 15 | `js/data/itune_defaults.js` (tag 6397) | 11615-11680 | 11599 | The island tuning defaults: `DEFAULT_ITUNE` 16 → `ITUNE` 80, `LF` 81 |
| 16 | `index.html#7` 6398-6526 | 11681-11806 | 5281 | Player progression: `DEFAULT_PTUNE` 6408 → `PTUNE` 6412, passive tree 6447, XP and levels |
| 17 | `js/audio/sfx.js` (tag 6527) | 11807-12003 | 11788 | SOUND 3.0 sfx engine: `sfx` 39, `SND_MISS` filled 118 |
| 18 | `index.html#8` 6528-35097 | 12004-40570 | 5474 | The core, 28,567 lines: |
| ↳ | 6530-7556 | 12004-13030 | | Island generation, enter/leave, ledger, loot: `genIsland` 6556, `enterIsland` 7143, `leaveIsland` 7187, THE LANDFALL LEDGER 7238 |
| ↳ | 7557-10845 | 13031-16319 | | Combat, crawl content, AI: THE PACKS 7768, skill gems 8369 and 9523, props/traps/grass/water/set pieces 8497-9522, token director 9811, `hurtEnemy` 10062, `killEnemy` 10161, `hurtPlayer` 10687, rares 10716 |
| ↳ | 10846-11309 | 16320-16783 | | Gear, powers, bestiary: THE GEAR 10846, `EQ`/`BAG` 10853, `rollItem` 10893, THE POWERS 11052, `BEST` 11246 |
| ↳ | 11310-13222 | 16784-18696 | | Caves, the depths, island update, foe AI: THE CAVES BELOW 11310, `window.__deep` 11361, `SANCT_H` 11496, `updateIsland` 12460, foe updaters 12740-13222 |
| ↳ | 13223-17225 | 18697-22699 | | Foe sprites, Sprites 2.0: `ESPR` 13227, `eSprite` 13838, `SPR2` 13882, `spr2Build` 13962-17171 (ONE function, 41 templates), its idle pre-build 17172 |
| ↳ | 17226-20216 | 22700-25690 | | Crawl renderer, shared render kits: pixel kit `cI` 17346, terrain 17584, hazards 18714, texel FX 19007, `islScale` 19133, `drawIslandWorld` 19154, `drawExplorerSprite` 19750, light layer `LGT` 19871 |
| ↳ | 20217-21592 | 25691-27066 | | Kill aftermath, crawl HUD, icons, meters: `PXI_ART` 20438, `EMO_PXI` 20619, `hudLay` 20754, METERS 21199 (`window.__score` 21283), `islandHUD` 21307, `drawIslandMap` 21540 |
| ↳ | 21593-22322 | 27067-27796 | | Ports and trading, ship stats, interiors: `DEFAULT_ETUNE` 21600, `ETUNE` 21653, `let hull` 21655, `hullHit` 21687, `enterPort` 21943, `leavePort` 21966, `updatePort` 21976, `enterInterior` 22137 |
| ↳ | 22323-26233 | 27797-31707 | | Boat mode, deck, crew, decor, livery: `SHIP_STG` 22374, `ship0`/`shipLoad` 22388/22391, `leaveHelm` 22483, `takeHelm` 22500, `deckPilot` 22509, `deckStep` 22587, `drawDeck` 22805, `CREW_CTX` 23780, `DECOR_T` 24480, `DECOR_ART` 24637, `deckHUD` 26182 |
| ↳ | 26234-26458 | 31708-31932 | | MAELSTROM (the tavern hex card game): `let HEX` 26235 (above its banner), `startMaelstrom` 26261, `updateHex` 26317 |
| ↳ | 26459-29778 | 31933-35252 | | Towns in pixels, townsfolk, rooms, shops, forge, museum, contracts: `drawTown` 27269, `FOLK_TALK` 27470, `folkLoad` 28137, `drawRoomT` 28319, `drawPortWorld` 28408 (old renderer), `portHUD` 28888, `renderShop` 28935, THE MUSEUM 29206 (`musGot` 29213), `wireShop` 29548 |
| ↳ | 29779-30813 | 35253-36287 | | Port/player sliders, crew, the ship's menu, gear UI: `ETUNE_DEF` 29781, `PTUNE_DEF` 29817, `crew` 29864, `menuOpen` 29865, `openMenu` 30035, `DND_HOSTS` 30246, `renderCharTab` 30489, `quitToTitle` 30793 |
| ↳ | 30814-31054 | 36288-36528 | | The Explorer: `updateExplorer` 30960 |
| ↳ | 31055-34869 | 36529-40343 | | INTROSTORY and the Guild opening: `SAGA` 31063, `sagaSave`/`sagaLoad` 31092/31103, `window.__saga` 31238, `SCENES` 31279, `sagaEvent` 32040, `sagaTick` 32114, C11-C15 33715-34696, `setupGuildStart` 34720 |
| ↳ | 34870-35096 | 40344-40570 | | Danger model, LTUNE: `ptMode` 34876, `LTUNE` 34896, `dangerOf` 34924, `LTUNE_DEF` 35049, `buildLvlTune` 35090 |
| 19 | `js/debug/proving_dev.js` (tag 35098) | 40571-41043 | 40548 | Proving Grounds and the DEV panel: `ptBoot` 34, `ptNewChar` 55, `ptQuit` 129, THE DEV PANEL 135, `sndMapCheck` 221 |
| 20 | `index.html#9` 35099-35174 | 41044-41116 | 5943 | Button wiring 35101-35107 (P4 waits; orig 41044-41050), main loop: `last` 35109, `worldTint` 35111, `islStep` 35153, `frame` 35166, `frameErr` 35173 |
| 21 | `js/render/style_pass.js` (tag 35175) | 41117-41241 | 41095 | THE STYLE PASS (WebGL): `GFX` 39, `artSrc` 108, `artScan` 132 |
| 22 | `index.html#10` 35176-35268 | 41242-41330, 41332 | 6064 | `frameInner` 35178, every frame in every mode (§5); orig 41332 is 35267 |
| 23 | `js/debug/tuning_panels.js` (tag 35269) | 41333-41862 | 41316 | Tuning panels: `TUNE_DEF` 18, `buildTunePanel` 63, playtest triggers 82, `ITUNE_DEF` 154, `buildIslandTune` 538 |
| 24 | `index.html#11` 35270-35290 | 41863-41880 | 6591 | Button wiring: rename, summary, ledger, leave, inventory, cave card, fish log |
| 25 | `js/render/ui_kit.js` (tag 35291) | 41881-41989 | 41859 | W5 PIXEL UI KIT: `uiKitBuild` 62, `EMO_TEST` 95, `uiKitObserve` 104, `uiKitTips` 113 |
| 26 | `index.html#12` 35292-35473 | 41990-42167 | 6696 | The title, `begin` and the boot: `titleBGOn` 35301, `titleNewVoyage` 35403, `begin` 35413, the boot tail 35450-35466, then `requestAnimationFrame(frame);` (orig 41331, moved here by P2) 35467, then orig 42163-42167 at 35468-35472 |

refactor_map.md §2 lists each system's strays (code filed under another banner) and §3 lists all 367 sections, both in orig numbers. Once any game code changes, `split_move.ts --map` still prints the map but flags each changed line as NOT FROM THE ORIGINAL (unchanged lines keep their orig numbers), and moves are refused without `--allow-edited` (§10). Every edit also shifts this table's numbers below it: update it in the same commit.

## 5. The main loop and where each mode is dispatched

```
requestAnimationFrame(frame)  35467   the last inline part, after every other script (P2): the first frame runs after the whole page
frame(ts)        35166  try { frameInner(ts) } catch(e) { frameErr(e) }   -> window.__frameErr (reset 35164, counted 35173)
frameInner(ts)   35178  every frame, any mode: ambTick, musUpdate, pollPad, uiHandTick, icardTick, then scnTick, sagaTick,
                        devTick, ledgerTick, introTick, gchTick (these last six only behind their flags:
                        SCN||SCN_TB, SAGA, devOn, LEDG, introOpen, GCH.open)
  'hex'      35196  updateHex -> drawHexScreen
  'interior' 35203  updateInterior 22185 -> drawRoomT (townPixOn) or drawInterior -> interiorHUD
  'island'   35212  islStep 35153 -> updateIsland 12460 -> drawIslandWorld 19154 -> islandHUD 21307 (+ drawIslandMap)
  'port'     35229  updatePort 21976 -> drawTown or drawPortWorld -> portHUD 28888, or fmFrame when the chart is open (35236)
  'deck'     35241  deckStep 22587 (runs the sea's update() unless held) -> drawDeck 22805 -> deckHUD 26182,
                        or fmFrame when the chart is open (35248)
  title      35253  if titleBGOn(): drawTitleBG, return
  (sea)      35254  update(dt) 4438 -> sea draw list 35257 -> worldTint, glows, drawHUD 35264 -> fmFrame (chart open) 35265
```

- Each world mode (sea, island, port, interior, deck) draws into the low-res buffer `pix`. The style pass (`artSrc` style_pass.js:108, WebGL) and scanlines (`artScan` style_pass.js:132) then blit it to the canvas, and full-res overlays draw on top. The Maelstrom (`drawHexScreen`) and the title (`drawTitleBG`) draw straight to the canvas, outside `pix` and the style pass.
- `let mode='sea'` (6200) takes 6 values, though its comment lists only 2. Who switches it:
  - 'island': `enterIsland` (7150); back to 'sea' in `leaveIsland` (7226).
  - 'port': `enterPort` (21944); back to 'sea' in `leavePort` (21968).
  - 'interior': `enterInterior` (22140); back to 'port' in `leaveInterior` (22146).
  - 'deck': `leaveHelm` (22492, key H at sea); back to 'sea' in `takeHelm` (22503).
  - 'hex': `startMaelstrom` (26266); back to 'interior' in `hexLeave` (26268).
  - 'sea' is also set by `quitToTitle` (30804), `ptQuit` (proving_dev.js:131) and `begin` (35434).
- Not modes: `started` (3534; false = the title), `ptMode` (34876; the Proving Grounds sandbox), and `DK.pilot.mode` ('hold'/'still'/'mark'/'off', the deck autopilot).
- `update(dt)` (4438) is the sea step and a hub. It runs `updateEnv` (4403, the world clock and weather; a day is 210 s of unpaused time), steering (or `deckPilot` on deck, 4461), `updateFishing`, `updateWhaling`, `updateMissions`, `updateCrew`, `updateExplorer` and `shipWorkTick`. It also autosaves (4552). It runs on deck through `deckStep` and in the night run (`deckNightRun` 24428).
- **The clock does not run everywhere.** `updateEnv` is called only from `update` (4439: sea, and deck via `deckStep`), `updateIsland` (12462), `updatePort` (21980) and `deckSleepSkip` (24426, which adds the slept time itself, then calls `updateEnv(0)`). `sagaClockSync` (32532) also jumps `time` forward, to the story's held hour, when the guided Introstory ends (the valve 32525, the hand-off 32544). `loadSave` (3704) and `begin` (35419) set `time` outright. `updateEnv` is NOT called in 'interior' or 'hex', so time and weather stop inside buildings and at the Maelstrom table. It also adds no time while `menuOpen`. Anything time-based you add there will not see `time` move.
- Keyboard: the keydown listener (3794) checks modal layers first, then `if(!started || renaming) return` (3827), then dispatches by mode: hex 3830, island 3833, port 3845, interior 3853, deck 3858, sea after that. Gamepad: `pollPad` (4047, called from frameInner) uses the same order: modal cards 4075, hex 4090, island 4125, port 4139, interior 4144, deck 4149, sea 4150.
- New voyage or Continue: `#startBtn` → `titleNewVoyage` (35403) → `begin(true)`, or `#contBtn` (35452) → `loadSave()` → `begin(false)`. `begin` (35413) resets every system, sets `ptMode=false` and `started=true`, then a fresh voyage runs `setupGuildStart` (34720).

## 6. The save system

- **Key:** `SAVE_KEY='mj_boats_v5'` (3523) in localStorage. `OLD_SAVE_KEYS` (3524: v4, v3, v2) are never loaded. `begin` (35438) always deletes them; `saveWrite` (3665) deletes them only when a write is refused (storage full), then retries.
- **Shape version:** `SAVE_SV=12` (crawl2.js:26). Its comment says: bump it when a field's shape changes. `loadSave` keeps its `sv<3/4/5/7` migrations, and every loader defaults every field.
- **World recipe:** `WGEN.V=4` (1473) is saved as `wg`. `loadSave` refuses a log with another `wg` (3678), and `saveCanGo` (3674) hides Continue for one. A new voyage keeps such a log as `SAVE_KEY+'_w'+wg` (`titleKeepOld` 35407, called by `titleNewVoyage` 35404 and `begin(true)` 35413). Only a log that cannot be read is set aside, by `#contBtn`, as `SAVE_KEY+'_bad'` (35453).
- **Built:** `doSave` (3602). It returns at once while `ptMode` is set (3603). The object literal at 3605-3628 fixes the JSON's field order. The ashore extras at 3629-3634 make a mid-crawl save equal to a KO. `saveWrite` (3663) writes it and returns true only when the browser kept it.
- **Read:** `loadSave` (3675-3789). The restore order is load-bearing: `buildWorld(seed)` first (3682); the museum before the flask; `PTUNE` before `treeLoad` (3733-3734); crew, contracts and home before `sagaLoad` (3762) and `seasLoad` (3763); `explored` then `exRebuild()` (3782); then the Explorer's resolve-on-load (3783-3784).
- **Save shapes kept elsewhere:**
  - `gemSave`/`entSave`/`entLoad` 8391-8393; `itemSave`/`itemLoad` 10914/10916.
  - `ship0`/`shipLoad` 22388/22391. A new SHIP field must go in **both**, or it is dropped on reload.
  - `crewLoad` 24037, `folkLoad` 28137.
  - `sagaSave`/`sagaLoad` 31092/31103 (`SAGA.v` is the story's own version).
  - `seasSave`/`seasLoad` 2012/2013, `courseSave`/`courseLoad` 21816/21811, `expPack`/`expUnpack` 3647/3654.
- **When it saves:**
  - Autosave every 3 s of game time, in `update` (4552) and `updatePort` (22013).
  - `queueSave()` (3601) forces the next one; about 199 call sites use it.
  - Also on `enterIsland`, `deckLogWrite`/`deckDawn`, `quitToTitle` (30793, which refuses to quit unless `doSave()===true`), `beforeunload` (35471) and a hidden tab (35472).
- **Device-only keys** (never in the voyage save): `mj_boats_pad_v2` (3942; the legacy `mj_boats_pad_v1` is still read at 3964), `mj_boats_snd_v1` (audio.js:69), `mj_boats_plog_on`/`_v1`/`_img_v1` (playtest_log.js:29) plus the IndexedDB `mj_boats_plog`, `mj_boats_scn_v1` (31254), `mj_boats_intro_dev` (32451), `mj_boats_ui` (30056) and `mj_boats_gfx_v1` (style_pass.js:38).
- **THE RULE: additive fields only.** Read every new field with a default so older saves still load. If an old shape must be converted, bump `SAVE_SV` and add an `sv<N` branch in `loadSave`. **Bump `SAVE_KEY` only with the owner's approval**: it ends every player's voyage.

## 7. Tuning objects

Each object is a `DEFAULT_*` table plus a live `let` copy made at load. Its version field is written in `doSave` (3606) and checked in `loadSave`. For six of the seven, a version mismatch loads the defaults. TUNE is the exception (see below): it keeps every saved value and its check only resets zoom (3691).

| Object | Defaults → live | Saved as (version) | Read back | Sliders, panel builder | Covers |
|---|---|---|---|---|---|
| `TUNE` | 3525 → 3530 | `tune`, `tuneV:2` | 3690-3691 | `TUNE_DEF` tuning_panels.js:18, `buildTunePanel` tuning_panels.js:63 | sailing, the chart, sea lands and creatures, towns |
| `ITUNE` | itune_defaults.js:16 → 80 | `itune`, `ituneV:24` | 3692 | `ITUNE_DEF` tuning_panels.js:154, `buildIslandTune` tuning_panels.js:538 | the whole crawl: feel, combat, AI, terrain, camera, caves, art |
| `FTUNE` | 4597 → 4598 | `ftune`, `ftuneV:3` | 3718 | `FTUNE_DEF` 5032, `buildFishTune` 5042 | fishing |
| `WTUNE` | 5086 → 5087 | `wtune`, `wtuneV:3` | 3719 | `WTUNE_DEF` 5800, `buildWhaleTune` 5811 | whaling |
| `ETUNE` | 21600 → 21653 | `etune`, `etuneV:2` | 3720 | `ETUNE_DEF` 29781, `buildPortTune` 29810 | economy, townsfolk, reputation, deck, crew, explorer |
| `PTUNE` | 6408 → 6412 | `ptune`, `ptuneV:4` | 3733 | `PTUNE_DEF` 29817, `buildPlayerTune` 29837 | player progression |
| `LTUNE` | 34887 → 34896 | `ltune`, `ltuneV:8` | 3721 | `LTUNE_DEF` 35049, `buildLvlTune` 35090 | isle danger, the par model, renown |

- **Changing a `DEFAULT_*` value?** Bump its `*V` in **both** `doSave` (3606) and its `loadSave` line, or old saves keep the old value. The comment at 3606 says so; ETUNE's comment (21603) allows new keys without a bump.
  - **Exception: TUNE.** Its loader (3690-3691) does `if(s.tune) TUNE=Object.assign({},DEFAULT_TUNE,s.tune)` whatever `tuneV` is, so every saved value wins, and its version check is hard-coded (`s.tuneV!==2`) and only resets `zoom`. Bumping `tuneV` therefore does NOT give old saves a changed TUNE default. To push a new TUNE default to old saves, the loader itself must change: that is a save-behaviour change and needs the owner's approval. (A brand-new TUNE key does reach old saves, because they lack it.)
- `tunePrune` (3790) drops retired keys. It is applied to ITUNE, WTUNE, ETUNE, LTUNE and PTUNE, not to TUNE or FTUNE.
- The live objects are **replaced, not mutated**: by `loadSave`, by `ptQuit` (proving_dev.js:133, which restores ITUNE/LTUNE/PTUNE from `ptBoot`'s snapshot) and by `#tuneReset` (tuning_panels.js:78, TUNE). Never cache one in a const or closure at load.
- `LF(k,d)` (itune_defaults.js:81) reads a feel knob through `LEGACY_FEEL` (crawl2.js:236) when `ITUNE.legacyFeel>0`.
- Other knob tables, not saved as tuning: `WGEN` (1473; `V` is saved as `wg`, and changing the recipe reshapes every world, so bump V), `INTRO_K` (31977, never saved), `SCN_TY`/`SCN_PACE` (31252-31253), `FISH_HL` (24294), and `GFX` (style_pass.js:39, device-only).

## 8. Known traps (each has broken the game, or can in a split build)

1. **Duplicate top-level names.** Two `let hull` declarations once froze the game; the real one is at 21655. Across classic script files, a duplicate `let`/`const` kills the whole later file. Lint check 3 catches it.
2. **Comment-swallowed code.** An unclosed `/*` or a stray `//` can silently disable real code. Lint check 4 catches it. The mid-line block comments at 9731 and 9888 (live code before and after them) and at 10119 and 10120 (code before them; the latter also ends with a `//` comment) are deliberate and must stay closed.
3. **Emoji vs `\uXXXX` text.** Literal escape *text* sits on 4395-4402, 29741, 30750, 30825-31051 (mixed with real emoji) and proving_dev.js:41. Deliberate JS escapes sit at 20624 and 21520 (`\uFE0F`) and at 32251 and 32309 (`\u0001`/`\u0002`). Everything else is real UTF-8. A search for one form misses the other. Copy bytes exactly; never re-encode or normalise line endings.
   - **git writes CRLF here.** `core.autocrlf=true` is set in the system gitconfig and the repo has no `.gitattributes`, so a plain `git checkout`, `restore`, `stash`, `switch`, `worktree add`, `merge`, `pull`, `cherry-pick` or `reset --hard` can write a boats file with CRLF (always pass `-c core.autocrlf=false`); the lint's SCRIPTS check goes RED and split_move.ts refuses it. Undo a boats file with `git -c core.autocrlf=false checkout -- boats/<path>`.
4. **Load-time order.** Keep the 406 load-time statements in their relative order. Function declarations hoist only within their own script. Nine "hoisting pairs" call a function declared below them, so never put a file boundary between: 1927/1928, sea_lands.js:70/71, 6357/6359, 9240/9282-9415, 10853/10855-10857, 23049/23067, 30246/30489, 31256/31259, style_pass.js:39/40.
   - **The one accepted conditional need (lead decision D2):** 1431 `resize();` reaches `townPixFor` (26500) and `islZoomApply` (1434) only when `townPixOn`/`islPixOn` is set, and both are false at load. `lint_allow.json` holds `{ "stmt": "resize();", "name": "townPixFor", … }`, used since `crawl2.js` put a file boundary between them; `islZoomApply` needs no entry (same part). The lint ends `LINT GREEN (1 warning check)`; that WARN (handlers that can run between files, trap 10) is expected and cannot be cleared.
5. **The long-range pin.** At load, 10853 `BAG=bag0()` calls `bagSize`, which calls `musGot` (29213, in THE MUSEUM). Any file boundary between 10854 and 29212 (orig 16328-34686, all inside inline part 18 today) makes the page throw `musGot is not defined`. The fix, P1 (move the museum block 29206-29261 before THE GEAR, refactor_map.md §6.2), is a reorder, not an in-place move, so it departs from the brief's method: **it waits for the owner.** Until then, put no file boundary in that range.
6. **Tables created once, then extended at load, in order:**
   - `window.__seas`: 1909 → 2145…3502.
   - `window.__deep`: 11361 → 11681 → 12044 → 12104 → 12157 → 12188. It is not dev-only: `genSanctum` reads `.off`/`.alc`.
   - `SANCT_H`: 11496 → 11758.
   - `PXI_ART`: 20438 → 20509…20608 → 28113 (plus 28118 inside a *silent* try/catch), 28378, 31959, 32839.
   - `EMO_PXI` 20619 → `EMO_TEST` ui_kit.js:95.
   - `DECOR_ART`: 24637 → 25265, 25333, 25549, 25554.
   - `CREW_CTX`: 23780 → 33985 → 34577 (story6, which needs `SAGA_CREWL.push` at 34575 first).
   - `FOLK_TALK` is appended to exactly once (27610).
   - The SCENES/SCN_*/SAGA_EVH/`window.__saga` registrations, in order.

   The full list is refactor_map.md §5.3 H5.
7. **Strict mode is per script.** Every js file and every inline part starts with its own `"use strict";` (part 1's is the original 1382); without it that script silently runs sloppy. split_move.ts adds it; lint check 2 and golden's "now SLOPPY" catch a loss.
8. **The loop start.** P2 is done: `requestAnimationFrame(frame);` (orig 41331) sits at 35467, after every other script, so no frame can run between files and the first frame is the one-script first frame. Keep it below every game script. `spr2Build`'s idle pre-build (17172) must stay right after `spr2Build`, in the same file.
   - **Microtasks started at load run before the next file.** Keep what uiKitObserve's MutationObserver (started by 35461) and plogDb's `.then` (playtest_log.js:219, via 35462/35463) call (`pxify`, `pxifyText`, `EMO_TEST`, `ukIcon`, `pxiCv`…, `plogDbMigrate`) in the same file or an earlier one. The lint's LOAD ORDER FAILs this, and also a 0 ms timer, a `postMessage` ("post-message") or an `el.click()`/`focus()`/`blur()`/`dispatchEvent` at load ("dispatch": the handlers run now) that needs a later file. A reorder failure opens with "N of M swapped pair(s) share top-level state (e.g. X)": the shared-state pairs, listed first, are the dangerous ones.
9. **Listener order is load-bearing:**
   - resize: 1431 → 20752 → 25840 → 30618 → 34182 → 35461.
   - keydown 3794 before the Esc keydown at 35470.
   - visibilitychange audio.js:136 before 35472.
   - window blur: 3884 → 25839 → the dnd blur (30397, registered by `dndInit()` at 30469).
   - window wheel: 3886 → 3932 → 25838.
   - window capture mousedown: 3921 → `scnMouse` 31491.
   - document mouseover: 30134 → `uiKitTips` (ui_kit.js:115, registered by 35461).
   - The 18 registrations at 3794-3934 keep their exact order.

   The full list is refactor_map.md §5.3 H10; to find every registration, filter §5.2 on the category `listener` (35462 `plogStart` is filed as `monkey-patch`).
10. **Events between files.** The early input listeners (3794-3934) read about 120 names declared later (`mode`, `player`, `menuOpen`, `GCH`, `ptMode`…). On this split build a key or mouse event during page load throws inside the handler. It shows in the console only, and the golden check sends input only after load, so it cannot see it. The `resize` listener at 1431 is the same case for a window resize during load. The lint lists these as LOAD ORDER WARNs ("event handler(s) registered at load … can run before … has loaded"); they are information, not failures. Known cases: §10.
11. **Silent fallbacks hide a broken load.** Each of these turns a failure into a quiet change, not an error, so assert positively (golden's R4 checks do, for `spr2Build`, `SANCT_H`, `BAG` and `SND_MISS`):
    - typeof guards on game names;
    - `spr2Build.done`: foes fall back to the old painters;
    - `SANCT_H` defaults;
    - `SND_MISS` (declared audio.js:83, filled at sfx.js:118): a missing sound becomes a beep or silence;
    - a top-level name equal to an element id: `flog` (4600) and `<div id="flog">` (1256), the only one today. If its script were missing, `flog` would quietly return the element.

    (The 28118 try/catch is silent too but harmless: `uiKitBuild`, run at 35461, sets `--fkhand` again at ui_kit.js:88.)
12. **The frame safety net.** `frame()` wraps `frameInner` in try/catch, and `window.__frameErr` counts the errors. Keep it as it is. `dev.throwOnce=1` forces one test error (35181). A swallowed error is still a bug.
13. **`ptMode` blocks saving** (3603). `begin()` resets it (35437). A leak once silently disabled saving for good.
14. **Hand-maintained reset lists.** Add a new per-isle or on-screen global to each list that applies: genIsland's tail (7077-7122), `leaveIsland`, `caveEnter`/`caveSurface` (12247/12275), `islDrop` (35409), `begin` (35413), `ptNewChar` (proving_dev.js:55) and `quitToTitle` (30793).
15. **The fog of war.** `explored` has one writer, `exAdd` (3559). Any reassignment of `explored` must be followed by `exRebuild()`.
16. **Seeded generation.** `genIsland`, `genPort`, `genOffers` and `genCrew` draw from seeded streams in a fixed order. Reordering the draws changes every isle, town, board or crew.
17. **Name traps.** Grep with word boundaries:
    - `PORT`/`portCv` (sea_creatures.js:540…) are fish-log portraits, not harbours.
    - `K` (34911) is a top-level function but also a common local name.
    - `pctx` is redeclared inside every enemy painter. `pf`, `fg`, `cv`, `TB`, `SB`, `last` and `shade` have local twins too.
    - `last` (35109) is the frame timestamp, read all over the code.
18. **Self-reading DEV checks (lead decision D1).** `seasLint` (2141), `window.__deep.lint` (11687) and `sndMapCheck` (proving_dev.js:221; the read is on 222) read `document.scripts` text, and a `<script src>` has empty text, so on this build they scan only the inline parts and their reports mean little. Nothing in gameplay calls them, so the lead accepted this: three `{ "selfread": … }` entries in `lint_allow.json`, flagged to the owner for review. **Do not use them from the console to check the code; use split_lint and golden.** The harness's own copies (`specs/harness/a2mc.js`, `_page.js`) have the same limit; the lint lists them as info.

## 9. How to verify

**Lint, about 3 s (up to ~50 s on a loaded machine):** `deno run -A C:/Users/oscil/boats-dev/split_lint.ts --html C:/Users/oscil/boats-split-wt/boats/index.html` (add `--work <your temp dir>`). Without `--html` it checks the main checkout's `index.html`, still the unsplit file.

- Checks `0 SCRIPTS` (UTF-8, no BOM or CR, src files exist with the exact case, no async/defer/module, tags in the original slot, self-reads), `1 SYNTAX`, `2 STRICT`, `3 DUPLICATES`, `4 COMMENTS`, `5 UNDECLARED`, `6 LOAD ORDER`, `7 CONSERVATION`, `8 CACHE TAGS` (one shared `?v=N`), then an `allow-list (lint_allow.json): …` block listing each entry as used / not used / REFUSED, then `LINT GREEN` (exit 0) or `LINT RED: …` (exit 1).
- **Green on this build:** `LINT GREEN (1 warning check)`: 26 game scripts; SCRIPTS names the 3 accepted self-read sites; 5546 names; 406 load-time statements; the WARN lines are handlers that can run between files (trap 10), plus an info line that P2's statement is ALLOWED by its `{ move }` entry; `40785 lines conserved in order, 4 run(s)`; `14 src tag(s), all ?v=1`; `5 entries, all used`. A FAIL is never expected. (On the unsplit main checkout: `LINT GREEN`, 1 game script, `5 entries, 0 used`.)
- What FAILs, briefly: a need on a later file (DEFINITE or CONDITIONAL), a new TDZ, any change in load-time order (trap 8), a microtask, 0 ms timer, post-message or dispatch that needs a later file; in CONSERVATION, any added, changed or lost line, or a cut inside a statement or comment. (A function-only section moved verbatim before or after the core passes CONSERVATION; LOAD ORDER still judges it.) A missing or non-UTF-8 src file fails SCRIPTS (reported there once) and CONSERVATION (unless the bad byte is only in the `/* FILE:` header); a bad byte in code fails SYNTAX too, one in a comment or string does not; STRICT and UNDECLARED never fail for it, at most noting "not checked". Fix that file first.
- Files in `boats-dev/specs/refactor_baseline/`: `lint_baseline.json` (version 3, md5 `4d5bdcd9…`, saved from the unsplit file) and `lint_allow.json`.
- **The allow-list** holds reviewed exceptions, each with a `reason` naming who approved it: `{ stmt, name }` a CONDITIONAL later-file need, `{ stmt, wait }` a promise waiting on real I/O, `{ order }` a statement that may run elsewhere in the order, `{ selfread }` an accepted self-reading function, `{ move, from, before }` one statement moved to exactly one place (orig line numbers). DEFINITE needs are never allowed; an unknown field is refused. Today it holds exactly the five entries of §10. Adding one is a lead or owner decision, never a way to clear a RED.
- Options: `--html <copy>`, `--allow <file>`, `--baseline <file>`, `--brief`, `--verbose`, `--json`, `--work <dir>`, and `--selftest` (~130 cases, 133 today; about 2-6 min per its header, 92 s quiet and 221 s loaded on 2026-10-15: give it a 600000 ms timeout or run it in the background; `--only <regex>` runs a subset). Run `--selftest --html C:/Users/oscil/boats-dev/checkpoints/pre-split/index.html` (the unsplit checkpoint, read only; this keeps working after the split is merged into main): it passes there, while on the split file it refuses with "the current file is not clean enough to selftest against" (it does not apply `lint_allow.json`; refactor_stageB_report.md §6.2).
- **Re-baselining.** `--save-baseline` over the default baseline is REFUSED unless `index.html` is byte-identical to `checkpoints/pre-split/index.html`. The only way past is `--save-baseline --rebaseline "<what changed, who approved it>"` (stored in the baseline's `saved` field), for an owner-approved change to the game, once the other checks are clean; say so in the commit. Never re-baseline to clear a RED in a split.

**Golden check, headless, 80-130 s (up to ~200 s busy):** `deno run -A C:/Users/oscil/boats-dev/specs/harness/golden_run.ts --root C:/Users/oscil/boats-split-wt --slow 300` (without `--root` it serves the main checkout). When other agents may run golden at the same time, give it your own `--tmp <dir>` (and `--last <file>` for the fingerprint).

- **Timeouts:** more than a shell tool's usual 120 s default, so give the command a 600000 ms timeout or run it in the background. `--runs 3` takes 4-7 min and `--save-baseline --runs 3` about 5.5 min on a quiet machine (on a busy one run them in the background rather than under a 600000 ms timeout), and `--slow N` adds about N ms × 1.1 per script file. Don't run several golden runs at once: the machine swamps.
- It serves the site root on a free 127.0.0.1 port and starts its own headless Chrome (SwiftShader, temp profile). Parts:
  - `load`: the natural run (real frames and timers): zero console errors, exceptions and 404s, `__frameErr` 0, plus the R4 checks once the idle pre-build has had its chance: `spr2Build.done` 1 and 41 templates, 8 `SANCT_H` rooms, `BAG` = `bagSize()` slots, the `PXI_ART` key count, `MUS_T` key order, `SND_MISS`.
  - `boot`, `voyage`, `tour`, `input`: hashes of all 5,546 top-level bindings plus the game's 9 window properties (`window.__deep`, `__seas`, `__saga`, `__scn`, `__worldStats`, `__frameErr`, `__score`, `__powFired`, `sagaUrlSkip`). The tour visits port, sea, island, a fight, the chart, a townsfolk talk, the deck and the helm. `input` sends real key and mouse events through the load-time listeners: a key on the title, then M, wheel, drag, Esc (chart shut), Esc (the ship's menu), a click on its Crew tab, Esc, W and A held and released, W held then a window blur (no key may stay held), a click on the sea, H (the deck), D held and released, Esc (the menu opens on deck), Esc again, then back to the helm (`helm_again`).
  - `save`: doSave → A, 30 frames, doSave → A2, A written back, reload: the `beforeunload` save must have stored A2. Then Continue → B, reload → C (B→C identical), then the hidden-page (`visibilitychange`) save.
  - `render` (pixel hashes), `isles` (seeds 1-20), `perf` (WARN only), `html` (static: `index.html` without its scripts, byte for byte).
- **`--slow 300`** holds each `.js` until the page has reached its tag, then 300 ms more, so frames, timers and idle callbacks really run between files. Without it (`--js-delay 500`, the default) files can arrive together; that caught a broken split by one frame error only. The report adds `slow 300 ms (run 1): 14 script file(s), each held 312-352 ms … at least 12 frame(s), 26 timer tick(s), 8 idle callback(s) ran before each file` (the numbers vary); a WARN means a wait tested nothing.
- It ends `GOLDEN GREEN` (exit 0) or `GOLDEN RED` with a readable diff (exit 1). A green run prints one long summary line, here shortened at the `…`:
  ```
  load clean, fe 0/0, checks spr2 1/41 sanct 8 bag 24/24 · boot 5546 globals + 9 window props · … · seed 160569963, 2005 isles, 235 ports · tour port0:port … helm:sea fe 0 · input title_key:sea … helm_again:sea · save 15032 chars, beforeunload saved A2, A2→B DIFFERS (2 documented load default(s)), B→C identical, hidden page saved · isles 20 · html 1383 lines outside the scripts · pinned errors 0
  ```
  then the perf lines, any WARNs, `fingerprint: <file>   (N s)`, and `GOLDEN GREEN` last.
- "A2→B DIFFERS (2 documented load defaults)" is expected: bug B31, `folkLoad` fills `dz:''` and `nr:0` into townsfolk records (`SAVE_LOAD_DEFAULTS` in golden_run.ts).
- Reading a RED: "now SLOPPY — only their strictness changed" means a file lost its `"use strict"`; a missing file lists its 404 and the page's load exceptions; "Chrome exited unexpectedly … retrying it once" is not a fingerprint difference (a second DevTools timeout means a hang in the page or a swamped machine: re-run alone). Paths print without `?v=`. Script tags inside HTML comments are ignored.
- Perf WARNs only beyond ±50% on a quiet machine, after one re-measure (`--perf-retries`). On a busy machine it prints `perf NOT JUDGED — the machine is busy (…)`. Perf is never RED.
- Files: `refactor_baseline/golden_baseline.json` (md5 `d8f33103…`, saved 2026-10-14 11:08Z from the unsplit file with `--runs 3`, Chrome/155.0.8059.40; the previous one is `golden_baseline.prev.json`). Each run writes `refactor_baseline/golden_runs/<UTC time>_<pid>.json` (the newest 30 are kept; `--last <file>` chooses another).
- Options: `--root <dir>` (a site root, or a bare boats folder such as `boats-dev/checkpoints/pre-split`), `--slow <ms>`, `--only load,boot,voyage,tour,input,render,save,isles,perf,html`, `--runs N`, `--keep`, `--verbose`, `--eval file.js` (`--natural` loads the page without pinning). The rest are in golden_run.ts's header.
- **Re-saving.** `--save-baseline` and `--save-perf` are refused (`GOLDEN REFUSED`, exit 2) on any build other than the unsplit file or the build the baseline was saved from. Re-save only from the unsplit checkpoint: `--root C:/Users/oscil/boats-dev/checkpoints/pre-split --save-baseline --runs 3`. For an owner-approved behaviour change, add `--force` on that build and keep a copy of it: from then on it is the build to re-save from.
- **When Chrome updates**, golden WARNs "Chrome changed" and the render hashes (sometimes more) go RED for that reason alone. 1. Run golden with `--root C:/Users/oscil/boats-dev/checkpoints/pre-split`: RED in the same paths means Chrome is the cause (RED only on your build is your build's own change: stop). 2. Copy `golden_baseline.json` to `golden_baseline.prev.json`, then re-save from that root with `--save-baseline --runs 3`. 3. Run golden on the current build again: it must be GREEN; say so in the commit.
- **It cannot see:** input during page load (trap 10, §10); the `setTimeout` fallback at 17172 (browsers without `requestIdleCallback`, such as Safari); the `TUNE.townPix=0` / `TUNE.seaPix=0` fallback renderers. Test those by hand when you touch them.

**Older tools** in `boats-dev/specs/harness/`: `chk.ts`, `cmtfull.ts`, `cmtscan.ts` and `undef.ts` read **inline** scripts only, so on this build they miss the 14 js files: rely on split_lint.ts. For a live tab: run `deno run --allow-net --allow-read C:/Users/oscil/boats-dev/specs/harness/serve.ts` (it serves only the harness folder, on port 3019); in the game tab define the two helpers smoke.js needs:
```
window.__wait=ms=>new Promise(r=>setTimeout(r,ms));
window.__step=(n,dt)=>{ for(let i=0;i<n;i++){ try{ frameInner(last+(dt||16.67)); }catch(e){ frameErr(e); } } return window.__frameErr|0; };
```
then eval `eval(await (await fetch('http://127.0.0.1:3019/smoke.js?t='+Date.now())).text())` and the same for `bot.js`, and run `await SMK.fresh()`, `await SMK.sail(30)`, `await SMK.net()`, `await SMK.dock()`, `SMK.talk()`, `await SMK.crawl()`, `SMK.save()`. Most steps return `{mode, fe, …}` (`fe` is `__frameErr`, 0 on this build); `SMK.save()` returns `{saved, gold, plvl}`, and `SMK.talk()`, `SMK.net()` and `SMK.crawl()` return a plain string such as 'not in port' when called in the wrong mode. `SMK.fresh()` deletes that browser's voyage save first. `perf.js` loads the same way.

**Preview and browser gotchas:**
- **Serve the worktree, not the main checkout,** or a visible-tab check plays the unsplit live build and passes for the wrong reason. The repo's `.claude/launch.json` configs serve the main checkout (`site` = `npx serve -l 3000 .` in the folder it starts in; the others use Python 3.13 by its full path, `C:/Users/oscil/AppData/Local/Programs/Python/Python313/python.exe`, with `--directory C:/Users/oscil/demandingradio.github.io`; a plain `python` hits the Windows Store stub), and `.claude/` is gitignored, so the worktree has no launch.json. Add a config of your own on a free port (the Python one, e.g. `-m http.server 8791 --directory C:/Users/oscil/boats-split-wt`) and open http://localhost:8791/boats/, or use `golden_run.ts --root <worktree> --eval <file> --natural`. `file://` is not the same as a server.
- A background or covered tab throttles rAF to 2-3 fps; that is not a perf bug. Measure perf with synchronous loops (100 calls of `drawIslandWorld()` or `frameInner(last+16.67)`).
- Drive and assert in **one** eval: the game keeps running between tool calls. If the screenshot tool wedges, recover with an eval ping, then restart the preview.
- Count console errors with the playtest log **off** (no `?playtest`, no `mj_boats_plog_on`): `plogStart` replaces `console.error`.

## 10. Stage B: status, decisions, how to move code

**Round 1 is done (2026-10-15)**, committed on `boats-split-b` after this guide's first commit (880f787), not merged or pushed: the 14 pieces of decision D3 (map §6.3 ids) plus P2 `eb06d33` (the ninth step, after G3 and before G4 and R17, the two pieces that need it): D1 `crawl2.js` 6da6228 · D2 `itune_defaults.js` 069f950 · A1 `audio.js` e499238 · A2 `bard.js` 573e39b · A3 `songbook.js` 5ef3e32 · A5 `sfx.js` 45145f4 · G1 `playtest_log.js` b89fba3 · G3 `proving_dev.js` 9e3988c · G4 `tuning_panels.js` 520e1e3 · C1 `chart.js` 50e548d · R1 `sea_lands.js` 8c1bcf7 · R2 `sea_creatures.js` 96bbe46 · R16 `style_pass.js` 6ac3891 · R17 `ui_kit.js` 8d5c747. That is 6,742 lines (16.5% of the script) in 14 files.
- Final checks on 8d5c747: `LINT GREEN (1 warning check)`; golden GREEN with `--runs 2 --slow 300`, with `--slow 800` and in the default mode, every part but perf byte-identical to the unsplit baseline, perf inside ±50% on the runs that were judged; a byte check confirmed each js file is `"use strict";` + its FILE header + the exact original lines, and the flattened scripts are the original body with only P2's line moved. Per-step log: `boats-dev/specs/refactor_stageB_log.md`; the round's report: `boats-dev/specs/refactor_stageB_report.md`.
- **The byte check** is `…/scratchpad/work/ryan/ryan_bytecheck.ts` in a session scratchpad (`C:/Users/oscil/AppData/Local/Temp/claude/C--Users-oscil/ca9c3d11-4880-4224-acd7-838af2f30813/`), which may be cleaned away. It is the only exact-layout check (report §4.4); the report recommends running lint, golden and it before a push, and copying it into `specs/harness/` (report §6.2). Copying it is the lead's call: until then it is not part of §9 or §11.
- **Next:** the owner's playtest (brief §6: a sea voyage, an island clear, a port visit, a fishing haul, a save and reload; refactor_stageB_report.md §7 is the draft list), then the owner decides on merging and pushing (§2, §11).

The lead's decisions of 2026-10-14 (refactor_map.md §6.0) are called D1-D4 there too, but they are NOT the data pieces D1-D4 of map §6.3: write "decision D1".
- **Decision D1:** the three self-reading DEV checks are accepted (trap 18).
- **Decision D2:** the `resize()` allowance (trap 4).
- **Decision D3:** round 1 does only in-place moves of the 14 low-risk pieces above, plus P2 (done).
- **Decision D4:** Stage B runs on a separate local branch in a git worktree, not on main.
- **Waiting for the owner (asked 2026-10-15):** P1 (the museum relocation, trap 5), P3 (moving the `musGesture` listeners, 4373, orig 8022), P4 (moving the button wiring, 35101-35107, orig 41044-41050, as in §4), A4 (the Director, 4191-4388, orig 7840-8037) and Tier 5 (S1-S4). **Blocked until P1 is decided:** D3, D4, G2, R3-R15 and R18. Do none of these.
- **lint_allow.json holds the five entries these decisions need:** the three `{ selfread }` entries (seasLint, window.__deep.lint, sndMapCheck), `{ stmt: "resize();", name: "townPixFor" }` and P2's `{ move: "requestAnimationFrame(frame);", from: 41331, before: 42163 }` (orig numbers). Add nothing. Map §6.0 and §6.2 still name an `{ order }` entry for P2: that is superseded.
- **Open on this build** (input during load, which golden cannot see): a first click or key during load can leave the title music silent until the voyage starts (R2; P3 waits); a `#ptestBtn` click (35105) before the last files load half-boots the Proving Grounds (P4 waits); a `#mute` click (audio.js:79) before `bard.js`, the Director or `sfx.js` has loaded throws inside `toggleMute`; and the rest of trap 10.

**How to move code (a later round, once the owner decides).**
1. **Set up.** Work in the worktree (`git -c core.autocrlf=false worktree add …` for a new one, trap 3). `split_move.ts --html <worktree>/boats/index.html --map` must end "the scripts hold exactly the original's body lines": split_move moves code only while that holds, so once any game code changes, a move needs `--allow-edited`, which only the lead can OK.
2. **Move only with `C:/Users/oscil/boats-dev/split_move.ts`**, never by hand or editor; read its header. It copies the original bytes, adds `"use strict";` and your `/* FILE: …` header, checks the cuts with acorn, and either does the whole move or refuses and writes nothing. A piece: `… split_move.ts --html <worktree>/boats/index.html --orig A-B --file js/<dir>/<name>.js --header <text file>` (orig numbers; `--dry-run` first). The header text (brief §6 step 6: what the file is, its main entry points, the globals it owns and those it reads) lives outside the repo. A statement moved later: `--relocate-orig A --before-orig D`. `--selftest` takes 1-4 min (600000 ms timeout or background).
   - **It refuses** (and writes nothing): the main checkout's html under any spelling (never pass `--allow-main` for a move); an html whose scripts are no longer exactly the original's body (restore the edited file, step 5); mixed `?v` tags (repair with `--v N`); CR line endings or a BOM; an empty header or one holding a comment opener or closer, a Liquid opener, a CR or a BOM; and a `js/` name that breaks §2's rule or already exists.
3. **One piece per step, then the lint, then golden:** `split_lint.ts --html <worktree>/boats/index.html` must end `LINT GREEN (1 warning check)`, then `golden_run.ts --root <worktree> --slow 300` must end `GOLDEN GREEN`.
4. **Green → commit locally on the branch, boats files by path only:** `git -C <worktree> -c core.autocrlf=false add boats/index.html boats/js/<dir>/<name>.js`, message like `boats split: move the X to js/<dir>/<name>.js (no behaviour change)`.
5. **Red → never fix forward.** Do not edit code, add allow entries or re-save a baseline to make it green. Undo the step (delete the new `js/` file; `git -C <worktree> -c core.autocrlf=false checkout -- boats/index.html`), investigate, and report. Log any bug you find in `refactor_found_bugs.md`; don't fix it.
6. Keep one `?v=N` (split_move keeps the current N); bump it only for a push (§2). Never push. After each round, update §4 and this section, then follow the brief's "Stage B done when" (a plain summary and a playtest list for the owner) and stop.

## 11. Pre-push checklist

- [ ] The owner said "push", after a playtest if anything a player could notice changed.
- [ ] Merging `boats-split-b` into main (only once the owner says so): in the main checkout first delete the untracked `boats/CLAUDE.md` (the Stage A copy, identical to 880f787's; otherwise the merge stops), then `git -C C:/Users/oscil/demandingradio.github.io -c core.autocrlf=false merge --ff-only boats-split-b`, then run the lint with no `--html` (it now reads the merged split file).
- [ ] For a split build: `deno run -A C:/Users/oscil/boats-dev/specs/harness/split_bytecheck.ts` says `BYTECHECK GREEN` (an independent proof that every js file and the flattened script are the original bytes; its `PIECES` list names round 1's pieces, so extend it when more pieces move).
- [ ] `LINT GREEN (1 warning check)`, with the allow-list block showing no REFUSED entry.
- [ ] `GOLDEN GREEN` with `--slow 300`. For an approved behaviour change: RED exactly where intended, then both baselines re-saved (lint `--rebaseline "<reason>"`, golden `--force` plus a kept copy of the build: §9).
- [ ] A short real play in a visible tab (served as in §9, from the checkout or worktree that holds the build; sea, an island, a port, the deck) shows `window.__frameErr===0` and no console errors.
- [ ] Saves:
  - `SAVE_KEY` is unchanged.
  - New fields are additive, with defaults.
  - A changed `DEFAULT_*` has its `*V` bumped in doSave and loadSave (for TUNE that is not enough: §7).
  - A changed field shape bumps `SAVE_SV` and adds an `sv` migration.
  - Save → reload → Continue works.
- [ ] `git status`: only the intended `boats/` paths, staged by path; new `js/` files added.
- [ ] Every game tag carries the same `?v=N`, bumped on this push if any `boats/js/` file changed (§2).
- [ ] This guide's map (§4) matches the code, with no Liquid markers (grep). New bugs are logged, not fixed, in `boats-dev/specs/refactor_found_bugs.md`.
- [ ] After the push: hard-refresh mondayjeffrey.com/boats/, check that every `js/` file loads with the new `?v=` (no 404), start a voyage and Continue one.

## 12. Refactor status and where to read more

- **Stage A (2026-10-14)** built the map, the lint, the golden check, split_move.ts and this guide. **Stage B round 1 (2026-10-15)** moved 14 self-contained pieces plus P2 (§10); the live game is still the one-script 5109cd5. Further Stage B rounds (about 44% of the script in all) wait for the owner's P1 decision; Stage C (the tangled core) is a separate owner decision.
- `C:\Users\oscil\boats-dev\` is the private workspace, not in this repo. For refactor work start at `specs/refactor_map.md` (orig numbers): 367 sections, systems and strays, all 406 load-time statements, the ordering rules H1-H14, and the Stage B plan (§6.0 the lead's decisions and round 1's load order, §6.2 prerequisites P0-P4, §6.3 the pieces). Its `README.md` predates Stage A.
  - `specs/` also holds the design docs and decision logs: `crawl2_*`, `pt1_*`, `pt2_*`, `is_*` (Introstory), `sd_*` (Seas & Depths), `px_*` (Project Pixel), `ch_*` (Smooth Chart), `playtest1_notes.md` (owner decisions) and `backlog_after_split.md` (the owner's next requests).
  - Also: `specs/harness/`, `specs/refactor_baseline/`, `checkpoints/` (the pre-split copy), `workflows/` and `sfx_work/`.
- `specs/refactor_found_bugs.md` lists 31 bugs (B01-B31), logged and not fixed (none new in Stage B); the golden baseline includes their current behaviour. `specs/refactor_split_brief.md` (v2.1) is the staged plan; `specs/refactor_stageB_log.md` logs each Stage B step; `specs/refactor_stageB_report.md` is round 1's report (§6.2 findings on the tools, §7 the draft playtest list and decisions for the owner).
