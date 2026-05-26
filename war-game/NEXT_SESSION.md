# Next Time On: War Game

_Last updated: 2026-05-26_

---

## Where things are right now

The game is **fully playable and live** at `mondayjeffrey.com/war-game/`. Everything below is working:

- Infinite procedural hex world (plains / mountains / lakes / oceans)
- You vs 3 AI factions (Crimson, Verdant, Violet) with distinct personalities
- Marches — click your hex, click destination, half your troops march
- Roads, Farms, Fortresses, Towers (cost gold to build)
- Hex development levels 1–10 (~30s per level, 5× production at max)
- Troop upkeep (armies above 25 troops/hex average start bleeding)
- Capital clusters — 7-hex groups, capturing the centre eliminates that faction
- Gold mines — ~1 in 28 hexes, fund your improvements
- Fog of war — press F to toggle
- Pause — press P or Space (30s pause, 5-min cooldown)
- Zoom (scroll wheel / pinch / +–), pan (drag)
- A 4-page retro PDF instruction manual (`war-game-manual.pdf`)
- Git tag `war-game-v1.0` marks the state before all the above was added (safe rollback point)

---

## The three files you care about

| File | What it is |
|------|------------|
| `war-game/index.html` | The entire game — ~1700 lines |
| `war-game/generate_manual.py` | ReportLab script; run `py generate_manual.py` to rebuild the PDF |
| `war-game/war-game-manual.pdf` | The printable instruction pamphlet |

---

## What to build next (ranked by bang-for-buck)

### 1. Notification log + click-to-jump ⭐ START HERE
The game now has enough going on that you need alerts. Without them, your capital can fall and you won't notice.
- A small log panel (bottom-left or below the UI strip) showing last ~5 events
- Events like: "⚔️ Crimson attacks your capital!", "🏴 You lost hex (12, -8)", "⬆️ Hex levelled up to 10"
- Clicking a log entry snaps the camera to that hex
- This is the single biggest quality-of-life upgrade right now

### 2. Save / load to localStorage
Games are long enough that you want to close the tab and come back.
- `JSON.stringify` the territory map, marches, gold, factions alive
- Auto-save every 30s, offer a "Continue" button on load
- One slot is fine to start

### 3. Mini-map
A small overview panel (corner) showing owned vs enemy vs neutral territory as coloured dots. No interaction needed — just orientation.

### 4. New Game screen / difficulty presets
Currently the game just starts. A simple modal with:
- Fog on/off
- AI aggression (easy = slower ticks, fewer moves)
- Maybe map seed input

### 5. Balance pass
Play a full game with fog ON and tune:
- `UPKEEP_PER_HEX_THRESHOLD` (currently 25) — does stockpiling feel punishing enough?
- Violet's `targetCap: 14` — is she too easy or too hard?
- Neutral garrison scaling near mid-map — are there dead zones between factions?

---

## Key numbers to remember

```
TICKS_PER_LEVEL = 20          // ~30s per level
UPKEEP_PER_HEX_THRESHOLD = 25 // average troops/hex before drain kicks in
ROAD_BUILD_COST_GOLD = 6
PAUSE_DURATION_MS = 30000     // 30 second pause
PAUSE_COOLDOWN_MS = 300000    // 5 minute cooldown

AI tick rates: Crimson 1.8s | Verdant 3.5s | Violet 1.4s
Violet stops expanding at 14 hexes
```

---

## To deploy

```bash
cd C:\Users\oscil\demandingradio.github.io
git add -A
git commit -m "your message"
git push
```
Live in ~1 minute at mondayjeffrey.com.

---

## To roll back to v1.0

```bash
git checkout war-game-v1.0 -- war-game/
```

---

_Good luck. Start with the notification log — it'll make everything else more fun to play while you build it._
