# BOATS: the guide for agents (read this first)

Every line number here is for the **unsplit file, build 5109cd5** (`boats/index.html`, md5 `229d72951ad337222d93a19c935ac2c6`, 42,170 lines). These "original" numbers are the ones refactor_map.md, `split_move.ts --orig` and `lint_allow.json` use too. Written 2026-10-14 at the end of refactor Stage A and revised that evening for Stage B. Treat the numbers as hints and find code by name (`function name(`, `let name`, `const name`). During Stage B they stay original numbers: `split_move.ts --html <html> --map` shows which script now holds each original line. At the end of Stage B, §4 is rewritten as file → one line each. **For any other code change, update this file in the same commit.** It is the source of truth; older specs and notes are history.

## 1. What it is

- An open-world sailing, cartography and island-crawl RPG in the browser. You sail a streamed procedural sea and chart it through fog of war. Ashore you clear island crawls with combat, loot, biomes and caves. You also fish and whale, trade in ports and towns, walk your own deck with a crew, play through a guided story (INTROSTORY), and hear music from the game's own engine (THE BARD).
- There is no build step: plain HTML, CSS and JS served as-is. The whole game is `boats/index.html` (~5.5 MB). The other files are `boats/sfx/` (CC0 samples and `manifest.json`) and this guide.
- The owner is not a programmer and judges by playing. Report in plain language: what changed, what to play, and what you're unsure of.

## 2. Deploy and git rules

- GitHub Pages serves `main` of `demandingradio/demandingradio.github.io` (local clone: `C:\Users\oscil\demandingradio.github.io`). The game is live at **mondayjeffrey.com/boats/** and has no desktop icon (URL only). **A push to main is a deploy** and goes live in about a minute.
- **The owner says when to push.** Until then, commit locally in small steps. Stage B works on a separate local branch in a git worktree, never on main (lead decision D4, §10).
- Stage boats files **by path** (`git add boats/index.html boats/CLAUDE.md …`). Never use `git add -A`, `git add .` or `git commit -a`: the working tree holds other apps' unfinished work (on 2026-10-14: footy, boatswiki, `assets/win95.js`, `boredom/`, `staffing/`; check `git status`).
- Don't touch other apps or `C:\Users\oscil\boats-tester` (a read-only reference copy). Local branches `boats-checkpoint-pre-*` are checkpoints: never push them.
- **Jekyll:** the repo has no `.nojekyll`, so Pages renders `.md` files through Liquid. This file must never contain two opening curly braces in a row, or an opening curly brace followed by a percent sign, even inside code blocks. One bad tag can fail the whole site's deploy. Grep for both before committing. Once pushed, this file is also public at `/boats/CLAUDE.html`. Jekyll also does not publish a file or folder whose name starts with `_` or `.`: a `js/` file named like that would 404 live while every local check passes. Each `js/<dir>/<name>.js` name must be lower-case and start with a letter or digit (split_move.ts refuses anything else; split_lint does not check it).

## 3. The file at a glance

| Lines | What |
|---|---|
| 1-7 | `<head>` |
| 8-1125 | CSS (one `<style>`) |
| 1126-1380 | HTML: `canvas#c` (1128), `#mute` (1130), title, menu, shop, talk, ledger and tuning-panel overlays. Load-time code looks these ids up, so they must keep existing |
| 1381-42168 | ONE classic `<script>`: `"use strict";` at 1382; the SECTION INDEX comment at 1383-1395 is **out of date** (see refactor_map.md §7). On the Stage B branch it becomes inline parts plus `js/` files in the same slot |

The script has about 3,970 top-level functions, 1,055 `let`/`const` statements (no `var`), 5,546 top-level names and **406 statements that run at load**. LF line endings, no BOM. Banners look like `/* ==== name ==== */`, but many systems spill past their banner, and some banners mislead:
- 'start / boot' (41468) heads `ITUNE_DEF`.
- `frameInner` (41242) sits under PROJECT PX — THE STYLE PASS.
- The title and `begin()` sit under W5 PIXEL UI KIT.
- `updateIsland` and the core foe AI sit inside THE CAVES BELOW.
- TOWNSFOLK also covers rooms, the old port renderer and the shops.
- The SOUND 3.0 sfx engine (11807-12003) has no `====` banner, only a `/* ---- SOUND 3.0` sub-header at 11825.

## 4. Section map (system → lines, unsplit file, build 5109cd5)

| Lines | System | Key names (line) |
|---|---|---|
| 1381-1462 | Header, canvas, helpers | `cv`/`ctx` 1397-1398, `pix`/`pctx` (the low-res world buffer) 1401-1402, `resize` 1417, `setPixScale` 1432, `clamp`/`lerp`/`TAU` 1439 (const arrows, not hoisted) |
| 1463-2468 | CRAWL2 DATA tables | `SAVE_SV` 1468, `EHP`, `WEAPON`, `ATK`, `BOSS_ATK`, `SFX2` 1684, `SFX_MAP`, `GEMS` 2052, `MATS` 2184, `IBASE`, `AFX` 2270, `POWERS`, `TREE` 2455 |
| 2469-2917 | World generation | `WORLD` 2470, `cores`/`SEED` 2473, `WGEN` 2475, `buildWorld` 2551, `window.__seas` created 2911 |
| 2918-4505 | Seas & Depths at sea (SE2-SE7) | `SEAS_SV` 2929, `seasSave`/`seasLoad` 3014-3015, patch anchors `<<SE6-BLOCK` 3825 … `SE7-BLOCK>>` 4505 |
| 4506-4601 | Palette, core state, chart state, toasts | `SAVE_KEY` 4525, `DEFAULT_TUNE`/`TUNE` 4527-4532, `boat` 4533, `time`/`started` 4536, `explored` 4539, chart `fm*`/`FMV`/`FMU`/`EXS` 4545-4555, `SHIP`/`DK` 4556, `exAdd` 4561, `exRebuild` 4564, `PLOG` 4580, `toast` 4581 |
| 4602-4793 | Save / load | `queueSave` 4603, `doSave` 4604, `saveWrite` 4665, `loadSave` 4677, `tunePrune` 4792 |
| 4794-5185 | Input, gamepad, Options tab | `keys` 4795, keydown 4796 (18 listeners in 4796-4936), `PAD` 4969, `pollPad` 5049, `renderControlsTab` 5166 |
| 5186-5453 | Playtest log (DEV, off by default) | `plogOn` 5200, `plogStart` 5202 |
| 5454-5737 | Audio graph, samples, ambience | `initAudio` 5467, `#mute` onclick 5509, `SNDP` 5587, `ambTick` 5719 |
| 5738-8037 | Music: THE BARD, the songbook, THE DIRECTOR | `MUS` 5752, `musBoot` 6091, `MUS_T` 6209 (23 tracks), `musEval` 7856, `musUpdate` 8010, `musGesture` 8021-8022 |
| 8038-8203 | World clock and the sea tick | `gameDate` 8040, `CONTROLS_HTML` 8043, `updateEnv` 8052, `update` 8087 |
| 8204-8668 | Sea rendering | THE LANDS FROM THE SEA 8204, `slDraw` 8355, `drawSea` 8391, `drawBoat` 8603 |
| 8669-9904 | Fishing and whaling | `FISH` 8677, `FTUNE` 8708, `updateFishing` 8922, `WHALES` 9170, `WTUNE` 9197, `updateWhaling` 9562 |
| 9905-10636 | Sea creatures in pixels, whaling sliders | `PORT` 10421 (fish-log portraits, not harbours), `WTUNE_DEF` 10618 |
| 10637-11010 | Sea HUD | `drawHUD` 10749, the toasts drawer |
| 11011-11415 | Chart and minimap | `drawMinimap` 11040, `fmFrame` 11157, `fmToggle` 11199, `openFullMap` 11241, `drawFullMap` 11286 |
| 11416-12003 | Island state, biomes, pouch, ITUNE, progression, sfx | `mode` 11419, `ISL` 11421, `player` 11424, `BIOMES` 11515, `HOLD` 11576, `ITUNE` 11679, `PTUNE` 11693, passive tree 11728, `sfx` 11827 |
| 12004-13030 | Island generation, enter/leave, ledger, loot | `genIsland` 12030, `enterIsland` 12617, `leaveIsland` 12661, THE LANDFALL LEDGER 12712 |
| 13031-16319 | Combat, crawl content, AI | THE PACKS 13242, skill gems 13843 and 14997, props/traps/grass/water/set pieces 13971-14996, token director 15285, `hurtEnemy` 15536, `killEnemy` 15635, `hurtPlayer` 16161, rares 16190 |
| 16320-16783 | Gear, powers, bestiary | THE GEAR 16320, `EQ`/`BAG` 16327, `rollItem` 16367, THE POWERS 16526, `BEST` 16720 |
| 16784-18696 | Caves, the depths, island update, foe AI | THE CAVES BELOW 16784, `window.__deep` 16835, `SANCT_H` 16970, `updateIsland` 17934, foe updaters 18214-18696 |
| 18697-22699 | Foe sprites, Sprites 2.0 | `ESPR` 18701, `eSprite` 19312, `SPR2` 19356, `spr2Build` 19436-22645 (ONE function, 41 templates), its idle pre-build 22646 |
| 22700-25690 | Crawl renderer, shared render kits | pixel kit `cI` 22820, terrain 23058, hazards 24188, texel FX 24481, `islScale` 24607, `drawIslandWorld` 24628, `drawExplorerSprite` 25224, light layer `LGT` 25345 |
| 25691-27066 | Kill aftermath, crawl HUD, icons, meters | `PXI_ART` 25912, `EMO_PXI` 26093, `hudLay` 26228, METERS 26673 (`window.__score` 26757), `islandHUD` 26781, `drawIslandMap` 27014 |
| 27067-27796 | Ports & trading, ship stats, interiors | `DEFAULT_ETUNE` 27074, `ETUNE` 27127, `let hull` 27129, `hullHit` 27161, `enterPort` 27417, `leavePort` 27440, `updatePort` 27450, `enterInterior` 27611 |
| 27797-31707 | Boat mode: deck, crew, decor, livery | `SHIP_STG` 27848, `ship0`/`shipLoad` 27862/27865, `leaveHelm` 27957, `takeHelm` 27974, `deckPilot` 27983, `deckStep` 28061, `drawDeck` 28279, `CREW_CTX` 29254, `DECOR_T` 29954, `DECOR_ART` 30111, `deckHUD` 31656 |
| 31708-31932 | MAELSTROM (the tavern hex card game) | `let HEX` 31709 (above its banner), `startMaelstrom` 31735, `updateHex` 31791 |
| 31933-35252 | Towns in pixels, townsfolk, rooms, shops, forge, museum, contracts | `drawTown` 32743, `FOLK_TALK` 32944, `folkLoad` 33611, `drawRoomT` 33793, `drawPortWorld` 33882 (old renderer), `portHUD` 34362, `renderShop` 34409, THE MUSEUM 34680 (`musGot` 34687), `wireShop` 35022 |
| 35253-36287 | Port/player sliders, crew, the ship's menu, gear UI | `ETUNE_DEF` 35255, `PTUNE_DEF` 35291, `crew` 35338, `menuOpen` 35339, `openMenu` 35509, `DND_HOSTS` 35720, `renderCharTab` 35963, `quitToTitle` 36267 |
| 36288-36528 | The Explorer | `updateExplorer` 36434 |
| 36529-40343 | INTROSTORY and the Guild opening | `SAGA` 36537, `sagaSave`/`sagaLoad` 36566/36577, `window.__saga` 36712, `SCENES` 36753, `sagaEvent` 37514, `sagaTick` 37588, C11-C15 39189-40170, `setupGuildStart` 40194 |
| 40344-41043 | Danger model, LTUNE, Proving Grounds, DEV panel | `ptMode` 40350, `LTUNE` 40370, `dangerOf` 40398, `LTUNE_DEF` 40523, `ptBoot` 40582, `ptQuit` 40677, THE DEV PANEL 40683 |
| 41044-41332 | Main loop, the style pass | button wiring 41044-41049, `last` 41052, `worldTint` 41054, `islStep` 41096, `frame` 41109, style pass 41117 (`GFX` 41134), `frameInner` 41242, `requestAnimationFrame(frame)` 41331 |
| 41333-41880 | Tuning panels | `TUNE_DEF` 41334, `buildTunePanel` 41379, playtest triggers 41398, `ITUNE_DEF` 41470, `buildIslandTune` 41854 |
| 41881-42168 | Pixel UI kit, title, begin, boot | `uiKitBuild` 41921, `titleBGOn` 41997, `titleNewVoyage` 42099, `begin` 42109, the boot tail 42146-42167 |

refactor_map.md §2 lists each system's strays (code filed under another banner) and §3 lists all 367 sections. This table keeps the unsplit numbers until the end of Stage B (see the top of this file).

## 5. The main loop and where each mode is dispatched

```
requestAnimationFrame(frame)  41331   runs AT LOAD, before the tuning panels, UI kit and title code below it exist (P2 moves it: §10)
frame(ts)        41109  try { frameInner(ts) } catch(e) { frameErr(e) }   -> window.__frameErr (reset 41107, counted 41116)
frameInner(ts)   41242  every frame, any mode: ambTick, musUpdate, pollPad, uiHandTick, icardTick, then scnTick, sagaTick,
                        devTick, ledgerTick, introTick, gchTick (these last six only behind their flags:
                        SCN||SCN_TB, SAGA, devOn, LEDG, introOpen, GCH.open)
  'hex'      41260  updateHex -> drawHexScreen
  'interior' 41267  updateInterior 27659 -> drawRoomT (townPixOn) or drawInterior -> interiorHUD
  'island'   41276  islStep 41096 -> updateIsland 17934 -> drawIslandWorld 24628 -> islandHUD 26781 (+ drawIslandMap)
  'port'     41293  updatePort 27450 -> drawTown or drawPortWorld -> portHUD 34362, or fmFrame when the chart is open (41300)
  'deck'     41305  deckStep 28061 (runs the sea's update() unless held) -> drawDeck 28279 -> deckHUD 31656,
                        or fmFrame when the chart is open (41312)
  title      41317  if titleBGOn(): drawTitleBG, return
  (sea)      41318  update(dt) 8087 -> sea draw list 41321 -> worldTint, glows, drawHUD 41328 -> fmFrame (chart open) 41329
```

- Each world mode (sea, island, port, interior, deck) draws into the low-res buffer `pix`. The style pass (`artSrc` 41203, WebGL) and scanlines (`artScan` 41227) then blit it to the canvas, and full-res overlays draw on top. The Maelstrom (`drawHexScreen`) and the title (`drawTitleBG`) draw straight to the canvas, outside `pix` and the style pass.
- `let mode='sea'` (11419) takes 6 values, though its comment lists only 2. Who switches it:
  - 'island': `enterIsland` (12624); back to 'sea' in `leaveIsland` (12700).
  - 'port': `enterPort` (27418); back to 'sea' in `leavePort` (27442).
  - 'interior': `enterInterior` (27614); back to 'port' in `leaveInterior` (27620).
  - 'deck': `leaveHelm` (27966, key H at sea); back to 'sea' in `takeHelm` (27977).
  - 'hex': `startMaelstrom` (31740); back to 'interior' in `hexLeave` (31742).
  - 'sea' is also set by `quitToTitle` (36278), `ptQuit` (40679) and `begin` (42130).
- Not modes: `started` (4536; false = the title), `ptMode` (40350; the Proving Grounds sandbox), and `DK.pilot.mode` ('hold'/'still'/'mark'/'off', the deck autopilot).
- `update(dt)` (8087) is the sea step and a hub. It runs `updateEnv` (8052, the world clock and weather; a day is 210 s of unpaused time), steering (or `deckPilot` on deck, 8110), `updateFishing`, `updateWhaling`, `updateMissions`, `updateCrew`, `updateExplorer` and `shipWorkTick`. It also autosaves (8201). It runs on deck through `deckStep` and in the night run (`deckNightRun` 29902).
- **The clock does not run everywhere.** `updateEnv` is called only from `update` (8088: sea, and deck via `deckStep`), `updateIsland` (17936), `updatePort` (27454) and `deckSleepSkip` (29900, which adds the slept time itself, then calls `updateEnv(0)`). `sagaClockSync` (38006) also jumps `time` forward, to the story's held hour, when the guided Introstory ends (the valve 37999, the hand-off 38018). `loadSave` (4706) and `begin` (42115) set `time` outright. `updateEnv` is NOT called in 'interior' or 'hex', so time and weather stop inside buildings and at the Maelstrom table. It also adds no time while `menuOpen`. Anything time-based you add there will not see `time` move.
- Keyboard: the keydown listener (4796) checks modal layers first, then `if(!started || renaming) return` (4829), then dispatches by mode: hex 4832, island 4835, port 4847, interior 4855, deck 4860, sea after that. Gamepad: `pollPad` (5049, called from frameInner) uses the same order: modal cards 5077, hex 5092, island 5127, port 5141, interior 5146, deck 5151, sea 5152.
- New voyage or Continue: `#startBtn` → `titleNewVoyage` (42099) → `begin(true)`, or `#contBtn` (42148) → `loadSave()` → `begin(false)`. `begin` (42109) resets every system, sets `ptMode=false` and `started=true`, then a fresh voyage runs `setupGuildStart` (40194).

## 6. The save system

- **Key:** `SAVE_KEY='mj_boats_v5'` (4525) in localStorage. `OLD_SAVE_KEYS` (4526: v4, v3, v2) are never loaded. `begin` (42134) always deletes them; `saveWrite` (4667) deletes them only when a write is refused (storage full), then retries.
- **Shape version:** `SAVE_SV=12` (1468). Its comment says: bump it when a field's shape changes. `loadSave` keeps its `sv<3/4/5/7` migrations, and every loader defaults every field.
- **World recipe:** `WGEN.V=4` (2475) is saved as `wg`. `loadSave` refuses a log with another `wg` (4680), and `saveCanGo` (4676) hides Continue for one. A new voyage keeps such a log as `SAVE_KEY+'_w'+wg` (`titleKeepOld` 42103, called by `titleNewVoyage` 42100 and `begin(true)` 42109). Only a log that cannot be read is set aside, by `#contBtn`, as `SAVE_KEY+'_bad'` (42149).
- **Built:** `doSave` (4604). It returns at once while `ptMode` is set (4605). The object literal at 4607-4630 fixes the JSON's field order. The ashore extras at 4631-4636 make a mid-crawl save equal to a KO. `saveWrite` (4665) writes it and returns true only when the browser kept it.
- **Read:** `loadSave` (4677-4791). The restore order is load-bearing: `buildWorld(seed)` first (4684); the museum before the flask; `PTUNE` before `treeLoad` (4735-4736); crew, contracts and home before `sagaLoad` (4764) and `seasLoad` (4765); `explored` then `exRebuild()` (4784); then the Explorer's resolve-on-load (4785-4786).
- **Save shapes kept elsewhere:**
  - `gemSave`/`entSave`/`entLoad` 13865-13867; `itemSave`/`itemLoad` 16388/16390.
  - `ship0`/`shipLoad` 27862/27865. A new SHIP field must go in **both**, or it is dropped on reload.
  - `crewLoad` 29511, `folkLoad` 33611.
  - `sagaSave`/`sagaLoad` 36566/36577 (`SAGA.v` is the story's own version).
  - `seasSave`/`seasLoad` 3014/3015, `courseSave`/`courseLoad` 27290/27285, `expPack`/`expUnpack` 4649/4656.
- **When it saves:**
  - Autosave every 3 s of game time, in `update` (8201) and `updatePort` (27487).
  - `queueSave()` (4603) forces the next one; about 199 call sites use it.
  - Also on `enterIsland`, `deckLogWrite`/`deckDawn`, `quitToTitle` (36267, which refuses to quit unless `doSave()===true`), `beforeunload` (42166) and a hidden tab (42167).
- **Device-only keys** (never in the voyage save): `mj_boats_pad_v2` (4944; the legacy `mj_boats_pad_v1` is still read at 4966), `mj_boats_snd_v1` (5499), `mj_boats_plog_on`/`_v1`/`_img_v1` (5194) plus the IndexedDB `mj_boats_plog`, `mj_boats_scn_v1` (36728), `mj_boats_intro_dev` (37925), `mj_boats_ui` (35530) and `mj_boats_gfx_v1` (41133).
- **THE RULE: additive fields only.** Read every new field with a default so older saves still load. If an old shape must be converted, bump `SAVE_SV` and add an `sv<N` branch in `loadSave`. **Bump `SAVE_KEY` only with the owner's approval**: it ends every player's voyage.

## 7. Tuning objects

Each object is a `DEFAULT_*` table plus a live `let` copy made at load. Its version field is written in `doSave` (4608) and checked in `loadSave`. For six of the seven, a version mismatch loads the defaults. TUNE is the exception (see below): it keeps every saved value and its check only resets zoom (4693).

| Object | Defaults → live | Saved as (version) | Read back | Sliders, panel builder | Covers |
|---|---|---|---|---|---|
| `TUNE` | 4527 → 4532 | `tune`, `tuneV:2` | 4692-4693 | `TUNE_DEF` 41334, `buildTunePanel` 41379 | sailing, the chart, sea lands and creatures, towns |
| `ITUNE` | 11615 → 11679 | `itune`, `ituneV:24` | 4694 | `ITUNE_DEF` 41470, `buildIslandTune` 41854 | the whole crawl: feel, combat, AI, terrain, camera, caves, art |
| `FTUNE` | 8707 → 8708 | `ftune`, `ftuneV:3` | 4720 | `FTUNE_DEF` 9142, `buildFishTune` 9152 | fishing |
| `WTUNE` | 9196 → 9197 | `wtune`, `wtuneV:3` | 4721 | `WTUNE_DEF` 10618, `buildWhaleTune` 10629 | whaling |
| `ETUNE` | 27074 → 27127 | `etune`, `etuneV:2` | 4722 | `ETUNE_DEF` 35255, `buildPortTune` 35284 | economy, townsfolk, reputation, deck, crew, explorer |
| `PTUNE` | 11689 → 11693 | `ptune`, `ptuneV:4` | 4735 | `PTUNE_DEF` 35291, `buildPlayerTune` 35311 | player progression |
| `LTUNE` | 40361 → 40370 | `ltune`, `ltuneV:8` | 4723 | `LTUNE_DEF` 40523, `buildLvlTune` 40564 | isle danger, the par model, renown |

- **Changing a `DEFAULT_*` value?** Bump its `*V` in **both** `doSave` (4608) and its `loadSave` line, or old saves keep the old value. The comment at 4608 says so; ETUNE's comment (27077) allows new keys without a bump.
  - **Exception: TUNE.** Its loader (4692-4693) does `if(s.tune) TUNE=Object.assign({},DEFAULT_TUNE,s.tune)` whatever `tuneV` is, so every saved value wins, and its version check is hard-coded (`s.tuneV!==2`) and only resets `zoom`. Bumping `tuneV` therefore does NOT give old saves a changed TUNE default. To push a new TUNE default to old saves, the loader itself must change: that is a save-behaviour change and needs the owner's approval. (A brand-new TUNE key does reach old saves, because they lack it.)
- `tunePrune` (4792) drops retired keys. It is applied to ITUNE, WTUNE, ETUNE, LTUNE and PTUNE, not to TUNE or FTUNE.
- The live objects are **replaced, not mutated**: by `loadSave`, by `ptQuit` (40681, which restores ITUNE/LTUNE/PTUNE from `ptBoot`'s snapshot) and by `#tuneReset` (41394, TUNE). Never cache one in a const or closure at load.
- `LF(k,d)` (11680) reads a feel knob through `LEGACY_FEEL` (1678) when `ITUNE.legacyFeel>0`.
- Other knob tables, not saved as tuning: `WGEN` (2475; `V` is saved as `wg`, and changing the recipe reshapes every world, so bump V), `INTRO_K` (37451, never saved), `SCN_TY`/`SCN_PACE` (36726-36727), `FISH_HL` (29768), and `GFX` (41134, device-only).

## 8. Known traps (each has broken the game, or will once the file is split)

1. **Duplicate top-level names.** Two `let hull` declarations once froze the game; the real one is at 27129. Across classic script files, a duplicate `let`/`const` kills the whole later file. Lint check 3 catches it.
2. **Comment-swallowed code.** An unclosed `/*` or a stray `//` can silently disable real code. Lint check 4 catches it. The mid-line block comments at 15205 and 15362 (live code before and after them) and at 15593 and 15594 (code before them; 15594 also ends with a `//` comment) are deliberate and must stay closed.
3. **Emoji vs `\uXXXX` text.** Literal escape *text* sits on 8044-8051, 35215, 36224, 36299-36525 (mixed with real emoji) and 40589. Deliberate JS escapes sit at 26098 and 26994 (`\uFE0F`) and at 37725 and 37783 (`\u0001`/`\u0002`). Everything else is real UTF-8. A search for one form misses the other. Copy bytes exactly; never re-encode or normalise line endings.
   - **git writes CRLF here.** `core.autocrlf=true` is set in the system gitconfig and the repo has no `.gitattributes`, so a plain `git checkout`, `restore`, `stash`, `switch` or `worktree add` can write a boats file with CRLF; the lint's SCRIPTS check goes RED and split_move.ts refuses it. Undo a boats file with `git -c core.autocrlf=false checkout -- boats/<path>`.
4. **Load-time order.** Keep the 406 load-time statements in their relative order. Function declarations hoist only within their own script. Nine "hoisting pairs" call a function declared below them, so never put a file boundary between: 2929/2930, 8250/8251, 11576/11578, 14714/14756-14889, 16327/16329-16331, 28523/28541, 35720/35963, 36730/36733, 41134/41135.
   - **The one accepted conditional need (lead decision D2):** 1431 `resize();` reaches `townPixFor` (31974) and `islZoomApply` (1434) only when `townPixOn`/`islPixOn` is set, and both are false at load. `lint_allow.json` holds `{ "stmt": "resize();", "name": "townPixFor", … }`; it is used once a file boundary falls between 1434 and 31974 (piece D1, `js/data/crawl2.js`, does that). `islZoomApply` needs no entry: it always sits in `resize()`'s part. The lint then ends `LINT GREEN (1 warning check)`; that WARN (the `resize` listener at 1431 can fire before later files load, trap 10) is expected and cannot be cleared.
5. **The long-range pin.** At load, 16327 `BAG=bag0()` calls `bagSize`, which calls `musGot` (34687, in THE MUSEUM). Any file boundary between 16328 and 34686 makes the page throw `musGot is not defined`. The fix, P1 (move the museum block 34680-34735 before THE GEAR, refactor_map.md §6.2), is a reorder, not an in-place move, so it departs from the brief's method: **it waits for the owner.** Until then, put no file boundary in that range (§10).
6. **Tables created once, then extended at load, in order:**
   - `window.__seas`: 2911 → 3147…4504.
   - `window.__deep`: 16835 → 17155 → 17518 → 17578 → 17631 → 17662. It is not dev-only: `genSanctum` reads `.off`/`.alc`.
   - `SANCT_H`: 16970 → 17232.
   - `PXI_ART`: 25912 → 25983…26082 → 33587 (plus 33592 inside a *silent* try/catch), 33852, 37433, 38313.
   - `EMO_PXI` 26093 → `EMO_TEST` 41954.
   - `DECOR_ART`: 30111 → 30739, 30807, 31023, 31028.
   - `CREW_CTX`: 29254 → 39459 → 40051 (story6, which needs `SAGA_CREWL.push` at 40049 first).
   - `FOLK_TALK` is appended to exactly once (33084).
   - The SCENES/SCN_*/SAGA_EVH/`window.__saga` registrations, in order.

   The full list is refactor_map.md §5.3 H5.
7. **Strict mode is per script.** `"use strict";` at 1382 covers only its own script. Every new `js/` file and every inline `<script>` part must start with its own, or it silently runs sloppy (split_move.ts adds it; lint check 2 and golden's "now SLOPPY" catch a loss).
8. **The loop starts mid-file.** `requestAnimationFrame(frame)` (41331) runs before the tuning panels, UI kit and title exist. With several files, a frame, timer or event can run *between* two files. P2 moves that one statement to directly before 42163 (approved, §10) before any file boundary after 41331. `spr2Build`'s idle pre-build (22646) must stay right after `spr2Build`, in the same file.
   - **Microtasks started at load run before the next file.** Keep what uiKitObserve's MutationObserver (started by 42157) and plogDb's `.then` (5384, via 42158/42159) call (`pxify`, `pxifyText`, `EMO_TEST`, `ukIcon`, `pxiCv`…, `plogDbMigrate`) in the same file or an earlier one. The lint's LOAD ORDER FAILs this, and also a 0 ms timer, a `postMessage` ("post-message") or an `el.click()`/`focus()`/`blur()`/`dispatchEvent` at load ("dispatch": the handlers run now) that needs a later file. A reorder failure opens with "N of M swapped pair(s) share top-level state (e.g. X)": the shared-state pairs, listed first, are the dangerous ones.
9. **Listener order is load-bearing:**
   - resize: 1431 → 26226 → 31314 → 36092 → 39656 → 42157.
   - keydown 4796 before the Esc keydown at 42165.
   - visibilitychange 5566 before 42167.
   - window blur: 4886 → 31313 → the dnd blur (35871, registered by `dndInit()` at 35943).
   - window wheel: 4888 → 4934 → 31312.
   - window capture mousedown: 4923 → `scnMouse` 36965.
   - document mouseover: 35608 → `uiKitTips` (41974, registered by 42157).
   - The 18 registrations at 4796-4936 keep their exact order.

   The full list is refactor_map.md §5.3 H10; to find every registration, filter §5.2 on the category `listener` (42158 `plogStart` is filed as `monkey-patch`).
10. **Events between files.** The early input listeners (4796-4936) read about 110 names declared later (`mode`, `player`, `menuOpen`, `GCH`, `ptMode`…). After a split, a key or mouse event during page load throws inside the handler. It shows in the console only, and the golden check sends input only after load, so it cannot see it. The `resize` listener at 1431 is the same case for a window resize during load. The lint lists these as LOAD ORDER WARNs ("event handler(s) registered at load … can run before … has loaded"); they are information, not failures.
11. **Silent fallbacks hide a broken load.** Each of these turns a failure into a quiet change, not an error, so assert positively (golden's R4 checks do, for `spr2Build`, `SANCT_H`, `BAG` and `SND_MISS`):
    - typeof guards on game names;
    - `spr2Build.done`: foes fall back to the old painters;
    - `SANCT_H` defaults;
    - `SND_MISS` (declared 5513, filled at 11906): a missing sound becomes a beep or silence;
    - a top-level name equal to an element id: `flog` (8710) and `<div id="flog">` (1256), the only one today. If its file were missing, `flog` would quietly return the element.

    (The 33592 try/catch is silent too but harmless: `uiKitBuild`, run at 42157, sets `--fkhand` again at 41947.)
12. **The frame safety net.** `frame()` wraps `frameInner` in try/catch, and `window.__frameErr` counts the errors. Keep it as it is. `dev.throwOnce=1` forces one test error (41245). A swallowed error is still a bug.
13. **`ptMode` blocks saving** (4605). `begin()` resets it (42133). A leak once silently disabled saving for good.
14. **Hand-maintained reset lists.** Add a new per-isle or on-screen global to each list that applies: genIsland's tail (12551-12596), `leaveIsland`, `caveEnter`/`caveSurface` (17721/17749), `islDrop` (42105), `begin` (42109), `ptNewChar` (40603) and `quitToTitle` (36267).
15. **The fog of war.** `explored` has one writer, `exAdd` (4561). Any reassignment of `explored` must be followed by `exRebuild()`.
16. **Seeded generation.** `genIsland`, `genPort`, `genOffers` and `genCrew` draw from seeded streams in a fixed order. Reordering the draws changes every isle, town, board or crew.
17. **Name traps.** Grep with word boundaries:
    - `PORT`/`portCv` (10421…) are fish-log portraits, not harbours.
    - `K` (40385) is a top-level function but also a common local name.
    - `pctx` is redeclared inside every enemy painter. `pf`, `fg`, `cv`, `TB`, `SB`, `last` and `shade` have local twins too.
    - `last` (41052) is the frame timestamp, read all over the file.
18. **Self-reading DEV checks (lead decision D1).** `seasLint` (3143), `window.__deep.lint` (17161) and `sndMapCheck` (40769; the read is on 40770) read `document.scripts` text, and a `<script src>` has empty text. Once any game `<script src>` exists they scan only the inline parts, so their reports mean little. Nothing in gameplay calls them, so the lead accepted this: three `{ "selfread": … }` entries in `lint_allow.json`, flagged to the owner for review. **After a split, do not use them from the console to check the code; use split_lint and golden.** The harness's own copies (`specs/harness/a2mc.js`, `_page.js`) have the same limit; the lint lists them as info.

## 9. How to verify

**Lint, about 3 s (up to ~50 s on a loaded machine):** `deno run -A C:/Users/oscil/boats-dev/split_lint.ts`. The default is the main checkout's `index.html`; on the Stage B worktree add `--html <worktree>/boats/index.html`.

- Checks `0 SCRIPTS` (UTF-8, no BOM or CR, src files exist with the exact case, no async/defer/module, tags in the original slot, self-reads), `1 SYNTAX`, `2 STRICT`, `3 DUPLICATES`, `4 COMMENTS`, `5 UNDECLARED`, `6 LOAD ORDER`, `7 CONSERVATION`, `8 CACHE TAGS` (one shared `?v=N`), then an `allow-list (lint_allow.json): …` block listing each entry as used / not used / REFUSED, then `LINT GREEN` (exit 0) or `LINT RED: …` (exit 1).
- **Green on 5109cd5:** 1 game script; 5546 names; 406 load-time statements; 114 deferred starts listed (info); `40785 lines conserved in order, concatenation byte-identical`; info lines naming the three self-read sites and the two harness files; `{ move } … not applied: the statement is still in its original place`; and `5 entries, 0 used (nothing is split yet …)`.
- **Green on a split:** `LINT GREEN (1 warning check)`. The WARN lines are handlers that can run between files (trap 10). After P2 alone the block reads `5 entries, 1 used`; once piece D1 and P2 are done (and on tonight's whole set) it must read `5 entries, all used`. A FAIL is never expected.
- What FAILs, briefly: a need on a later file (DEFINITE or CONDITIONAL), a new TDZ, any change in load-time order (trap 8), a microtask, 0 ms timer, post-message or dispatch that needs a later file; in CONSERVATION, any added, changed or lost line, or a cut inside a statement or comment. (A function-only section moved verbatim before or after the core passes CONSERVATION; LOAD ORDER still judges it.) A missing or non-UTF-8 src file fails SCRIPTS (reported there once) and CONSERVATION (unless the bad byte is only in the `/* FILE:` header); a bad byte in code fails SYNTAX too, one in a comment or string does not; STRICT and UNDECLARED never fail for it, at most noting "not checked". Fix that file first.
- Files in `boats-dev/specs/refactor_baseline/`: `lint_baseline.json` (version 3, md5 `4d5bdcd9…`, saved from the unsplit file) and `lint_allow.json`.
- **The allow-list** holds reviewed exceptions, each with a `reason` naming who approved it: `{ stmt, name }` a CONDITIONAL later-file need, `{ stmt, wait }` a promise waiting on real I/O, `{ order }` a statement that may run elsewhere in the order, `{ selfread }` an accepted self-reading function, `{ move, from, before }` one statement moved to exactly one place (baseline line numbers). DEFINITE needs are never allowed; an unknown field is refused. Today it holds exactly the five entries of §10. Adding one is a lead or owner decision, never a way to clear a RED.
- Options: `--html <copy>`, `--allow <file>`, `--baseline <file>`, `--brief`, `--verbose`, `--json`, `--work <dir>`, and `--selftest` (~130 cases; 2-6 min quiet, 15+ min while other agents' Chrome runs load the machine: run it in the background rather than under a 600000 ms timeout; `--only <regex>` runs a subset).
- **Re-baselining.** `--save-baseline` over the default baseline is REFUSED unless `index.html` is byte-identical to `checkpoints/pre-split/index.html`. The only way past is `--save-baseline --rebaseline "<what changed, who approved it>"` (stored in the baseline's `saved` field), for an owner-approved change to the game, once the other checks are clean; say so in the commit. Never re-baseline to clear a RED in a split.

**Golden check, headless, 80-100 s (up to ~200 s busy):** `deno run -A C:/Users/oscil/boats-dev/specs/harness/golden_run.ts`. **In Stage B, after every step:** `… golden_run.ts --root <worktree> --slow 300`.

- **Timeouts:** more than a shell tool's usual 120 s default, so give the command a 600000 ms timeout or run it in the background. `--runs 3` takes 4-7 min and `--save-baseline --runs 3` about 5.5 min on a quiet machine (on a busy one run them in the background rather than under a 600000 ms timeout), and `--slow N` adds about N ms × 1.1 per script file. Don't run several golden runs at once: the machine swamps.
- It serves the site root (default: the main checkout) on a free 127.0.0.1 port and starts its own headless Chrome (SwiftShader, temp profile). Parts:
  - `load`: the natural run (real frames and timers): zero console errors, exceptions and 404s, `__frameErr` 0, plus the R4 checks once the idle pre-build has had its chance: `spr2Build.done` 1 and 41 templates, 8 `SANCT_H` rooms, `BAG` = `bagSize()` slots, the `PXI_ART` key count, `MUS_T` key order, `SND_MISS`.
  - `boot`, `voyage`, `tour`, `input`: hashes of all 5,546 top-level bindings plus the game's 9 window properties (`window.__deep`, `__seas`, `__saga`, `__scn`, `__worldStats`, `__frameErr`, `__score`, `__powFired`, `sagaUrlSkip`). The tour visits port, sea, island, a fight, the chart, a townsfolk talk, the deck and the helm. `input` sends real key and mouse events through the load-time listeners: a key on the title, then M, wheel, drag, Esc (chart shut), Esc (the ship's menu), a click on its Crew tab, Esc, W and A held and released, W held then a window blur (no key may stay held), a click on the sea, H, D, Esc.
  - `save`: doSave → A, 30 frames, doSave → A2, A written back, reload: the `beforeunload` save must have stored A2. Then Continue → B, reload → C (B→C identical), then the hidden-page (`visibilitychange`) save.
  - `render` (pixel hashes), `isles` (seeds 1-20), `perf` (WARN only), `html` (static: `index.html` without its scripts, byte for byte).
- **`--slow 300`** holds each `.js` until the page has reached its tag, then 300 ms more, so frames, timers and idle callbacks really run between files. Without it (`--js-delay 500`, the default) files can arrive together; that caught a broken split by one frame error only. The report adds `slow 300 ms (run 1): 14 script file(s), each held 312-352 ms … at least 12 frame(s), 26 timer tick(s), 8 idle callback(s) ran before each file` (the numbers vary from run to run); a WARN means a wait tested nothing. On the unsplit file it says there is nothing to hold.
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
- **It cannot see:** input during page load (trap 10, §10); the `setTimeout` fallback at 22646 (browsers without `requestIdleCallback`, such as Safari); the `TUNE.townPix=0` / `TUNE.seaPix=0` fallback renderers. Test those by hand when you touch them.

**Older tools** in `boats-dev/specs/harness/`: `chk.ts`, `cmtfull.ts`, `cmtscan.ts` and `undef.ts` read **inline** scripts only; once `js/` files exist, rely on split_lint.ts. For a live tab: run `deno run --allow-net --allow-read C:/Users/oscil/boats-dev/specs/harness/serve.ts` (it serves only the harness folder, on port 3019); in the game tab define the two helpers smoke.js needs:
```
window.__wait=ms=>new Promise(r=>setTimeout(r,ms));
window.__step=(n,dt)=>{ for(let i=0;i<n;i++){ try{ frameInner(last+(dt||16.67)); }catch(e){ frameErr(e); } } return window.__frameErr|0; };
```
then eval `eval(await (await fetch('http://127.0.0.1:3019/smoke.js?t='+Date.now())).text())` and the same for `bot.js`, and run `await SMK.fresh()`, `await SMK.sail(30)`, `await SMK.net()`, `await SMK.dock()`, `SMK.talk()`, `await SMK.crawl()`, `SMK.save()`. Each step returns `{mode, fe, …}` (`fe` is `__frameErr`, 0 on 5109cd5). `SMK.fresh()` deletes that browser's voyage save first. `perf.js` loads the same way.

**Preview and browser gotchas:**
- **To play locally,** start the preview config `site` from the repo's `.claude/launch.json` (`npx serve -l 3000 .`, which needs the network on first start) and open http://localhost:3000/boats/. Offline, the repo's other configs (`diorama` on 8771 and the rest) serve the same root with Python 3.13 by its full path (`C:/Users/oscil/AppData/Local/Programs/Python/Python313/python.exe`; a plain `python` hits the Windows Store stub): open http://localhost:8771/boats/. Headless, `golden_run.ts --eval <file> --natural` serves and drives the game. `file://` is not the same as a server.
- **On the Stage B worktree, serve the worktree, not the main checkout.** The repo's launch.json configs serve the main checkout (`site` serves the folder it starts in, the Python ones name `--directory C:/Users/oscil/demandingradio.github.io`), and `.claude/` is gitignored, so a worktree has no launch.json at all. Add a config of your own on a free port (the Python 3.13 one, e.g. `-m http.server 8791 --directory <worktree>`) and open http://localhost:8791/boats/, or use `golden_run.ts --root <worktree> --eval <file> --natural`. Otherwise a visible-tab check plays the unsplit live build and passes for the wrong reason.
- A background or covered tab throttles rAF to 2-3 fps; that is not a perf bug. Measure perf with synchronous loops (100 calls of `drawIslandWorld()` or `frameInner(last+16.67)`).
- Drive and assert in **one** eval: the game keeps running between tool calls. If the screenshot tool wedges, recover with an eval ping, then restart the preview.
- Count console errors with the playtest log **off** (no `?playtest`, no `mj_boats_plog_on`): `plogStart` replaces `console.error`.

## 10. Stage B: the lead's decisions and how to move code

The lead's decisions of 2026-10-14 (refactor_map.md §6.0) are called D1-D4 there too, but they are NOT the data pieces D1-D4 of map §6.3: write "decision D1".
- **Decision D1:** the three self-reading DEV checks are accepted (trap 18).
- **Decision D2:** the `resize()` allowance (trap 4).
- **Decision D3:** tonight Stage B does only in-place moves of 14 low-risk pieces, plus P2. P2 goes first; then the pieces in map §6.3's order (all "original" lines; 26 script elements, 14 files, 6,742 lines, 16.5%; the full load order is in map §6.0):
  - P2: `requestAnimationFrame(frame);` from 41331 to directly before 42163 (the brief's §6 step 4: move the call site, never the function).
  - Data: D1 `js/data/crawl2.js` 1463-2468 · D2 `js/data/itune_defaults.js` 11615-11680.
  - Audio: A1 `js/audio/audio.js` 5454-5737 · A2 `js/audio/bard.js` 5738-6202 · A3 `js/audio/songbook.js` 6203-7839 · A5 `js/audio/sfx.js` 11807-12003 (in place only).
  - Debug: G1 `js/debug/playtest_log.js` 5186-5453 · G3 `js/debug/proving_dev.js` 40571-41043 · G4 `js/debug/tuning_panels.js` 41333-41862 (after P2).
  - Chart and render: C1 `js/chart/chart.js` 11011-11415 · R1 `js/render/sea_lands.js` 8204-8668 · R2 `js/render/sea_creatures.js` 9905-10616 · R16 `js/render/style_pass.js` 41117-41241 · R17 `js/render/ui_kit.js` 41881-41989 (after P2).
- **Decision D4:** Stage B runs on a separate local branch in a git worktree, not on main.
- **Waiting for the owner:** P1 (the museum relocation, trap 5), P3 (moving the `musGesture` listeners at 8022), P4 (moving the 41044-41050 button wiring), A4 (the Director, 7840-8037) and Tier 5 (S1-S4). **Blocked until P1 is decided:** D3, D4, G2, R3-R15 and R18. Do none of these.
- **lint_allow.json already holds the five entries these decisions need:** the three `{ selfread }` entries (seasLint, window.__deep.lint, sndMapCheck), `{ stmt: "resize();", name: "townPixFor" }` and P2's `{ move: "requestAnimationFrame(frame);", from: 41331, before: 42163 }`. Add nothing. Map §6.0 and §6.2 still name an `{ order }` entry for P2: that is superseded; an `{ order }` entry is not place-precise and would also accept wrong placements.
- **Open after tonight** (input during load, which golden cannot see): a first click or key during load can leave the title music silent until the voyage starts (R2, P3 waits); a `#ptestBtn` click before the last files load half-boots the Proving Grounds (P4 waits); a `#mute` click before A2, the Director or A5 has loaded throws inside `toggleMute`; and the rest of trap 10.

**How to move code (Stage B).**
1. **Set up (once).** Make the worktree with `git -c core.autocrlf=false worktree add …` (trap 3), then check that `<worktree>/boats/index.html` has md5 `229d72951ad337222d93a19c935ac2c6` before the first move. This guide is untracked in the main checkout, so a worktree made from HEAD lacks it: read it at `C:/Users/oscil/demandingradio.github.io/boats/CLAUDE.md` (whether to commit it on the branch is the lead's call).
2. **Move only with `C:/Users/oscil/boats-dev/split_move.ts`**, never by hand or editor. Read its header for the exact usage. It copies the original bytes, adds `"use strict";` and your `/* FILE: …` header, checks the cuts with acorn, and either does the whole move or refuses and writes nothing.
   - P2: `deno run -A C:/Users/oscil/boats-dev/split_move.ts --html <worktree>/boats/index.html --relocate-orig 41331 --before-orig 42163`
   - A piece: `… split_move.ts --html <worktree>/boats/index.html --orig 1463-2468 --file js/data/crawl2.js --header <text file>`; add `--dry-run` first. The header text is yours (brief §6 step 6: what the file is, its main entry points, the globals it owns and those it reads). Keep that text file outside the repo.
   - `--map` prints which original lines each script holds and whether the scripts still hold exactly the original's body (its header shows `?v MIXED (…)` for mixed tags). `--selftest` takes 1-4 min: give it a 600000 ms timeout or run it in the background. Each run works in its own new folder `split_move_selftest_<random>` (inside `--work` if given, else the system temp folder) and deletes only that folder (`--keep` keeps it).
   - **It refuses** (and writes nothing):
     - the main checkout's `index.html` under any spelling (relative, `..`, `/c/…`, an 8.3 short name, a junction, a hard link, a `\\localhost\c$` share), and any html in the main checkout's `boats/` folder. Never pass `--allow-main`.
     - an html whose scripts are no longer exactly the original's body: a hand edit anywhere (a changed, added or lost line, in an inline part or a `js/` file). Restore the edited file (step 5). Never pass `--allow-edited` without the lead's OK, just as for `--allow-main`.
     - tags with mixed `?v` values (step 6), CR line endings (trap 3) or a BOM, an empty header or one holding a comment opener or closer, a Liquid opener, a CR or a BOM, and a `js/` name that breaks §2's rule or already exists.
3. **One piece per step, then the lint, then golden:** `split_lint.ts --html <worktree>/boats/index.html` must end `LINT GREEN` (`(1 warning check)` once a file exists), then `golden_run.ts --root <worktree> --slow 300` must end `GOLDEN GREEN`.
4. **Green → commit locally on the branch, boats files by path only:** `git add boats/index.html boats/js/data/crawl2.js`, message like `boats split: move crawl2 data → js/data/crawl2.js (no behaviour change)`.
5. **Red → never fix forward.** Do not edit code, add allow entries or re-save a baseline to make it green. Undo the step (delete the new `js/` file; `git -c core.autocrlf=false checkout -- boats/index.html`), investigate, and report. Log any bug you find in `refactor_found_bugs.md`; don't fix it.
6. **`?v=N`:** every game `<script src>` carries the same `?v=N` (lint check 8). split_move.ts keeps the current N (1 for the first file). **Bump N on every push:** `split_move.ts --html <html> --v N` sets every tag (the first push of the split ships `?v=1`, then +1 per push), so a deploy never mixes old and new files. `--v N` on its own is also the repair when the tags carry different `?v` values (a hand edit or a merge): moves refuse that state until it is run.
7. Never push. At the end of Stage B, rewrite §4 as file → one line each, then follow the brief's "Stage B done when" (a plain summary and a playtest list for the owner) and stop.

## 11. Pre-push checklist

- [ ] The owner said "push", after a playtest if anything a player could notice changed.
- [ ] `LINT GREEN`, with the allow-list block showing no REFUSED entry.
- [ ] `GOLDEN GREEN` (`--slow 300` once `js/` files exist). For an approved behaviour change: RED exactly where intended, then both baselines re-saved (lint `--rebaseline "<reason>"`, golden `--force` plus a kept copy of the build: §9).
- [ ] A short real play in a visible tab (served as in §9, from the checkout or worktree that holds the build; sea, an island, a port, the deck) shows `window.__frameErr===0` and no console errors.
- [ ] Saves:
  - `SAVE_KEY` is unchanged.
  - New fields are additive, with defaults.
  - A changed `DEFAULT_*` has its `*V` bumped in doSave and loadSave (for TUNE that is not enough: §7).
  - A changed field shape bumps `SAVE_SV` and adds an `sv` migration.
  - Save → reload → Continue works.
- [ ] `git status`: only the intended `boats/` paths, staged by path; new `js/` files added.
- [ ] If `<script src>` files exist, every game tag carries the same `?v=N`, bumped on this push (§10 step 6).
- [ ] This guide's map matches the code, with no Liquid markers (grep). New bugs are logged, not fixed, in `boats-dev/specs/refactor_found_bugs.md`.
- [ ] After the push: hard-refresh mondayjeffrey.com/boats/, start a voyage and Continue one.

## 12. Refactor status and where to read more

- **Stage A (2026-10-14)** built the map, the lint, the golden check, split_move.ts and this guide. No code moved; `index.html` is still the live build 5109cd5.
- **Stage B** moves self-contained pieces (data tables, audio, debug tools, chart, render kits: about 44% of the script once P1 is decided) into classic `<script src="js/…?v=N">` files in the original script slot, in today's order, with no defer/async/module. Tonight's first round is decision D3's 14 pieces plus P2 (§10). Stage C (the tangled core) is a separate owner decision.
- `C:\Users\oscil\boats-dev\` is the private workspace, not in this repo. For refactor work start at `specs/refactor_map.md`: 367 sections, systems and strays, all 406 load-time statements, the ordering rules H1-H14, and the Stage B plan (§6.0 the lead's decisions and tonight's load order, §6.2 prerequisites P0-P4, §6.3 the pieces). Its `README.md` predates Stage A.
  - `specs/` also holds the design docs and decision logs: `crawl2_*`, `pt1_*`, `pt2_*`, `is_*` (Introstory), `sd_*` (Seas & Depths), `px_*` (Project Pixel), `ch_*` (Smooth Chart), `playtest1_notes.md` (owner decisions) and `backlog_after_split.md` (the owner's next requests).
  - Also: `specs/harness/`, `specs/refactor_baseline/`, `checkpoints/` (the pre-split copy), `workflows/` and `sfx_work/`.
- `specs/refactor_found_bugs.md` lists 31 bugs (B01-B31), logged and not fixed; the golden baseline includes their current behaviour. `specs/refactor_split_brief.md` (v2.1) is the staged plan.
