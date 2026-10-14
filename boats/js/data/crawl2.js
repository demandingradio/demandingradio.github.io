"use strict";
/* FILE: js/data/crawl2.js
CRAWL2 DATA: Crawl 2.0's data tables, moved verbatim from original lines 1463-2468 (build 5109cd5).
Literal tables for combat and feel, the designed sounds, skill gems and materials, the gear and the passive tree.
Entry points: the tables themselves, plus bossAfxHp (original line 1624 (build 5109cd5)), packCap (original line 1675 (build 5109cd5))
  and pf (original line 2373 (build 5109cd5), called only from the POWERS rows).
Globals it owns (142 top-level names), mainly:
  combat and feel: SAVE_SV, EHP, WEAPON, ATK, BOSS_ATK, ARCH, SIG_K, SECRET, SHRINE, SHRINE_KEYS, PACK_CAP, LEGACY_FEEL, FEEL_KEYS
  designed sounds: SFX2, SFX_OLD, SFX_SYN, SFX_MAP, SFX_SETS, SND_BUS_OF, TELL_K, BARK_K
  gems and materials: GEMS, GEM_T, ORE_T, HERB_T, GEO_T, FINDS, FORGE, BREW, ELIXIR, MUS_MS, MUS_BAG, BOUNTY, GUILD_X, LTASTE, MATS, LOOT_KEYS, MAT_FK
  gear: IBASE, IRAR, AFX, STAT_CAP, POWERS, UNIQUES, PW_BUFF_IC; passive tree: TREE_REG, TREE_MAX, TREE_ND, TREE, TREE_IDS
  Strays from other systems ride along: SAVE_SV (save), SCORE_DEF, SCORE_NOTE and PERF_P95 (meters), LEGACY_FEEL (tuning), the town-service tables.
Globals it reads from elsewhere: none (only the JS built-ins Object, Math, parseInt and String).
Load-time statements (14, each reads only tables above it in this file):
  SIG_KEYS (original line 1644 (build 5109cd5)), SHRINE_KEYS (original line 1670 (build 5109cd5)),
  SFX2 rows built with map, concat and flatMap (original lines 1684-1871 (build 5109cd5)),
  the two SND_BUS_OF loops (original lines 2032-2035 (build 5109cd5)), GUILD_X[4..6].rt (original line 2178 (build 5109cd5)),
  the MATS IIFE, LOOT_KEYS and MAT_FK (original lines 2184-2200 (build 5109cd5)), the TREE IIFE and TREE_IDS (original lines 2455-2467 (build 5109cd5)).
Must load early: index.html reads these tables at load further down (GEM_TK, GEM_KEYS, SEC_EN, the AFX tg pass, STOMP_R, PXI_ART, BUFF_IC).
*/
/* ===== CRAWL2 DATA ===== *
 *  CRAWL 2.0's data tables, in one place (specs: crawl2_design.md). Later chunks append IBASE, AFX, POWERS,
 *  UNIQUES, GEMS, TREE, MATS, ATK, WEAPON, SFX2 here. Every HP & damage number is on the NEW display scale
 *  (≈ ×10 the old one) and shown as a whole number (fmtDmg).
 * ======================== */
const SAVE_SV=12;                                 // the save's shape (minor) version inside the save key (mj_boats_v5 now) — never restarted: loadSave's sv<3/4/5/7 migrations must stay dormant · bump it when a field's shape changes (every loader defaults every field) · 12 = PT1 (the v5 key): trep · course · wg · the folk records' new shape · the loot filter's field retired · 11 = C8b: landN (the voyage's landfalls — secret rooms from the 2nd) · 10 = C7c: museum [find keys donated] · slay {kind: bounties} · gren (the Guild's renown) · gdid {deed: 1} · best.w (weighted bounty kills) · a pend entry may carry rw/ren/pearl/bty · 9 = C7b: an item may carry rf (its reforged affix's index) & av (its affixes unrounded — the forge's temper) · elixirs {kind: n} carried · elix {k, t} the one you drank · 8 = C7a: prosp {lv, xp} (the Prospector) — the Hold may hold finds 'f:<key>' · 7 = C6b: an item may carry p/pv (a Pearl's power & its roll) · u (an Abyssal unique) · 2 = C2b: the flask & the draughts (the old draught strap retired) · 3 = C4a: cargo is coin only — the materials live in hold.mats (a mid-crawl save writes pouch) · 4 = C4b: eq · bag · hold.items (the gear) · the loot filter (gone in 12) · pity · iseq — the trinkets retired · 5 = C5b: bar (the skill gems) · gems in bag & hold ({k:'g'}) · owned · gFirst · bFirst · 6 = C6a: tree (the passive nodes taken) · tpx / tpxB (bonus points: boss firsts & the museum) — skills & skillPts retired
const EHP={boar:36, snake:20, crab:28, dingo:22, urchin:26, ooze:34, clam:40, reefspike:48, diver:20, sanddev:40, alpha:60, tidecaller:34, lamprey:26, siren:34,   // §8.6: a normal-tier foe's HP at ⚔1 (× hpScale(dlE) in play)
  coco:22, kelpie:38, cinderfox:24, mshrimp:30, mothwing:20, boulderback:70, scorpion:36, bogtoad:34,   // (C8a §8.7) the eight shore signatures: light 20-26 · normal 30-40 · heavy 65-80
  termqueen:72, walrus:80, salamander:32, beetle:40, tmantis:40, sporeling:26, termite:6,   // (C8c §8.7) six more — the termite queen's brood is swarm (a termite: the swarm's 6)
  swarm:6};                                        // …and the swarm: a boar's sixth (one par blow)
const ELITE_HP=2.5;                                // an elite's HP × (magic ×1.3 / rare ×1.7 more on top — ITUNE.trHpMagic/trHpRare)
const WPN0={sword:13, bow:10, fists:6, axe:17, spear:12, daggers:6, staff:13};   // the starter Cutlass / Shortbow Attack at IP1 (the middle of their 12–14 / 9–11 rolls — the starter kit's rolls, the par model's 13) · bare fists (no main hand: the sword's moves at half a cutlass) · (C5a) each new type's IP1 base, mid-roll
const SWORD_HPS=3.46;                              // §3: the sword combo's hit-values per second (PT1 K2: 0.85 + 0.85 + 1.9 over 1.04 s) — the par model (parDps)
const PERF_P95=4.5;                                // the C1a reference scene's frame p95 (ms) (specs/harness/perf.js · median of 5 × 300 frames at 1280×800) — S20's target is max(8, this + 1.5)
/* THE SCORECARD (§1): [id, label, unit, lo, hi, note] — lo/hi null = open-ended · note = why it can't be read yet (a later chunk builds its system)
   (PT1 K11, owner calls in pt1_notes: S9's ceiling 160 → 200 ms/s — the finisher's & a skill's bigger freeze · S4's 10 → 12 % — PT1's own target, the rout gone) */
const SCORE_DEF=[
  ['S1','fight share','%',55,null], ['S2','walk share','%',null,22], ['S3','in reach (foe up)','%',60,null], ['S4','last ≤3 foes','%',null,12],
  ['S5','last kill → aboard','s',null,8], ['S6','weak blows','%',null,5], ['S7','longest kill gap','s',null,12], ['S8','held swings','/s',2.5,3.0],
  ['S9','hit-stop','ms/s',80,200], ['S10','hits / normal (boar-eq)','',2.5,3.0], ['S11','kills/min (fight)','',null,null], ['S12','bag full at','s',null,null],
  ['S13','gear drops','',8,12], ['S14','boss duel','s',45,90], ['S15','near-deaths','',1,2], ['S16','untelegraphed','%',null,25],
  ['S17','isle length','min',5,8], ['S18','cave floor','s',45,90], ['S19','decisions','',6,null], ['S20','frame p95','ms',null,8], ['S21','packs in turn','%',80,null]];
/* how the meters READ each wording (C9's refinements — PENDING the owner's sign-off, G5): the other reading rides in __score.raw.spec */
const SCORE_NOTE={ S4:'the last ≤3 foes of a clearing that BEGAN with 8+ (raw.spec.S4: every clearing, §1)',
  S10:'BASIC blows only (a kill a skill, proc or tick touched is left out), whole blows, in boar-eq (raw.spec.S10all: every kill · S10frac: C9’s last-blow fraction)',
  S13:'judged on a claimed surface isle of ⚔3–7 (raw.spec.S13: every claimed isle)', S16:'judged once ≥ 10% of life or ≥ 5 hits were taken',
  S17:'landing → aboard of a claimed ⚔3+ isle — the MAIN path only when the run skips caches, nodes & digs', S18:'mine floors only (raw.spec.S18: lord floors too)', S19:'judged from ⚔2 (raw.spec.S19 on ⚔1 too)' };
/* §3 THE WEAPON BASICS (C2a: the sword & the bow — the axe, spear, daggers & staff join in C5a). Per weapon: hs = its hit-stop weight (§2.2 hsWeap) ·
   stag = stagger × (§2.7) · th = the impact thump's weight (§11.2) · tide = Tide per connecting hit (C2b) · mw / mr = move × while winding+acting /
   recovering (null = ITUNE.swMoveWind / swMoveRec) · kb = knockback (u) [basic, heavy] (§2.3) · swing = its swing sound · combo = the held chain:
   wind / act / rec (s, at tm 1) · mul = × the weapon's Attack · step (u, at the first act frame) · dir = the sweep (1 L→R · −1 back) · heavy = a HEAVY
   hit (knockdown · H3) · sh = the hit shape (§2.1: cone {R, H°} · line {L, W} · circle {R, off} · ring {R0, R1}) · pr = arrows {n, sp° apart} */
/* (PT1 K2) THE 3-BEAT CHAIN, every weapon: beats 1 & 2 quick & flowing, beat 3 the FINISHER (fin) — a gather, a heavy freeze, the floor, a gold smear,
   a boom, ×1.5 Tide. A beat's own fields: fin · hsK (× its freeze) · tdK (× its Tide) · kb (u) · mw / mr (move ×) · sty (smear: w white · c cool · k warm ·
   h haft · g gold) · snd (its swing sound — else the weapon's) · snd2 (a second sound at the impact) · rep {n, gap s, hands, dirs} (a double strike) ·
   sh2 {L, W, m} (a fissure line from the circle's far edge, × m) · spd (× arrow speed) · lifeK (× flight) · pr.pc (+ pierce) · pit (the swing's pitch) ·
   xs (a crossing X smear) · bo {sp, life, helix, orb, R, k} (a bolt's speed & flight · the staff's ORB: splash R × k, it always bursts) */
const WEAPON={
  sword:{hs:1.2, stag:1.0, th:0.7, tide:6, mw:null, mr:null, pose:'slash', kb:[10,22], swing:'sw_sword', combo:[
    {wind:0.05, act:0.05, rec:0.15, mul:0.85, step:5,  dir:1,  sh:{k:'cone', R:26, H:60}, mw:0.6, mr:0.85, hsK:0.5, tdK:1, kb:10, sty:'w'},          // the slash
    {wind:0.05, act:0.05, rec:0.15, mul:0.85, step:5,  dir:-1, sh:{k:'cone', R:26, H:60}, mw:0.6, mr:0.85, hsK:0.5, tdK:1, kb:10, sty:'c', pit:1.18},   // the back-slash
    {wind:0.16, act:0.08, rec:0.30, mul:1.9, step:12, dir:1,  sh:{k:'cone', R:34, H:100}, heavy:1, fin:1, mw:0.3, mr:0.6, hsK:1.4, tdK:1.5, kb:26, sty:'g', snd:'sw_sword_fin'}]},   // CRESCENT CLEAVE: a 200° cleave floors the lot
  bow:{hs:0.5, stag:0.7, th:0.4, tide:5.5, mw:0.55, mr:0.8, pose:'draw', kb:[8,14], swing:'bow_release', draw:'bow_draw', life:0.93, combo:[   // arrows fly ITUNE.arrowSpeed (300 u/s) × spd for 0.93 s × lifeK (≈ 280u)
    {wind:0.10, act:0.02, rec:0.12, mul:0.8, step:0, pr:{n:1, sp:0}, spd:1.07, lifeK:0.94, mw:0.55, mr:0.85, tdK:1, kb:8},
    {wind:0.10, act:0.02, rec:0.12, mul:0.8, step:0, pr:{n:1, sp:0}, spd:1.07, lifeK:0.94, mw:0.55, mr:0.85, tdK:1, kb:8, pit:1.12},
    {wind:0.20, act:0.02, rec:0.26, mul:0.8, step:0, pr:{n:3, sp:7, pc:1}, spd:1.27, lifeK:0.85, heavy:1, fin:1, mw:0.4, mr:0.7, tdK:1.5, kb:16, snd:'sw_bow_fin'}]},   // TRIPLE LOOSE: 3 gold arrows ±7°, pierce +1 (one foe: 0.8 + 0.4 + 0.4)
  /* C5a — the four new movesets (§3). pose = the sprite's pose (§15's contract: slash chop slam thrust stab draw cast spin) · a circle's off = its centre
     ahead of you · R2 = a two-hander's own radius · hand (daggers) 0 main · 1 the off-hand's dagger · 2 both · bo = a staff BOLT. Hammers, harpoons &
     wands are BASES of these (tm, 2H: W2H) */
  axe:{hs:1.4, stag:1.5, th:1.0, tide:9, mw:null, mr:null, pose:'chop', kb:[16,26], swing:'sw_axe', combo:[
    {wind:0.10, act:0.07, rec:0.20, mul:0.85, step:6, dir:1,  pose:'chop', sh:{k:'cone', R:28, H:90}, mw:0.5, mr:0.8, hsK:0.55, tdK:1, kb:16, sty:'w'},             // the chop: a 180° cleave
    {wind:0.10, act:0.07, rec:0.20, mul:0.85, step:6, dir:-1, pose:'chop', sh:{k:'cone', R:28, H:90}, mw:0.5, mr:0.8, hsK:0.55, tdK:1, kb:16, sty:'k', pit:1.18},   // the backhew
    {wind:0.22, act:0.10, rec:0.38, mul:1.9, step:3, pose:'slam', sh:{k:'circle', R:34, off:14}, R2:40, sh2:{L:56, W:14, m:0.6}, heavy:1, fin:1, mw:0.25, mr:0.55, hsK:1.4, tdK:1.5, kb:30, sty:'g', snd:'sw_axe_fin', snd2:'slam'}]},   // EARTHSPLITTER: the slam floors its circle, a fissure runs on 56u at ×0.6
  spear:{hs:1.0, stag:1.1, th:0.8, tide:6, mw:null, mr:null, pose:'thrust', kb:[12,20], swing:'sw_spear', combo:[
    {wind:0.05, act:0.05, rec:0.15, mul:0.85, step:4, pose:'thrust', sh:{k:'line', L:44, W:14}, mw:0.6, mr:0.85, hsK:0.5, tdK:1, kb:12, sty:'w'},                   // the thrust pierces the whole line
    {wind:0.05, act:0.05, rec:0.16, mul:0.8, step:2, dir:-1, pose:'slash', sh:{k:'cone', R:34, H:70}, mw:0.6, mr:0.85, hsK:0.5, tdK:1, kb:18, sty:'h', pit:1.18},   // the HAFT SWEEP shoves them back into thrust range
    {wind:0.15, act:0.09, rec:0.30, mul:1.8, step:18, pose:'thrust', sh:{k:'line', L:64, W:16}, heavy:1, fin:1, mw:0.3, mr:0.6, hsK:1.4, tdK:1.5, kb:24, sty:'g', snd:'sw_spear_fin'}]},   // PIERCING LUNGE floors the line
  daggers:{hs:0.4, stag:0.7, th:0.3, tide:4.5, mw:null, mr:null, pose:'stab', kb:[4,10], swing:'sw_dagger', combo:[
    {wind:0.03, act:0.08, rec:0.10, mul:0.62, step:3, dir:1,  pose:'stab', hand:0, sh:{k:'cone', R:20, H:45}, rep:{n:2, gap:0.05, hands:[0,1], dirs:[1,-1]}, mw:0.7, mr:0.9, hsK:0.35, tdK:1, kb:4, sty:'w'},   // the DOUBLE STAB (the off-hand's dagger: its own Attack, or 70% of the main's)
    {wind:0.03, act:0.08, rec:0.10, mul:0.62, step:3, dir:-1, pose:'stab', hand:1, sh:{k:'cone', R:22, H:60}, rep:{n:2, gap:0.05, hands:[1,0], dirs:[-1,1]}, mw:0.7, mr:0.9, hsK:0.35, tdK:1, kb:6, sty:'c', xs:1, pit:1.12},   // the CROSS SLASH (an X)
    {wind:0.08, act:0.06, rec:0.22, mul:2.4, step:16, pose:'stab', hand:2, sh:{k:'cone', R:22, H:50}, heavy:1, fin:1, mw:0.3, mr:0.7, hsK:1.2, tdK:1.5, kb:12, sty:'g', snd:'sw_dagger_fin'}]},   // SHADOWSTEP TWIN STAB · every hit on a back or an exposed foe crits (BACKSTAB)
  staff:{hs:0.5, stag:0.8, th:0.5, tide:6, mw:0.5, mr:0.8, pose:'cast', kb:[6,14], swing:'sw_staff', bolt:{sp:240, life:1.0, R:18, k:0.5}, combo:[   // a bolt flies 240u (its flight ÷ its speed), splash R18 at ×0.5 (the Driftwood Staff R24)
    {wind:0.09, act:0.02, rec:0.15, mul:0.85, step:0, pose:'cast', bo:{sp:260}, mw:0.5, mr:0.85, tdK:1, kb:6},                 // the bolt
    {wind:0.09, act:0.02, rec:0.15, mul:0.85, step:0, pose:'cast', bo:{sp:300, helix:1}, mw:0.5, mr:0.85, tdK:1, kb:6, pit:1.12},   // the TWIN SPARK (a helix trail)
    {wind:0.18, act:0.02, rec:0.28, mul:1.5, step:0, pose:'cast', bo:{sp:200, life:1.2, orb:1, R:36, k:0.9}, heavy:1, fin:1, mw:0.35, mr:0.7, tdK:1.5, kb:14, snd:'sw_staff_fin'}]} };   // BRINE BURST ORB: it always bursts — R36 at ×0.9, every normal in it floored
const W2H={hs:1.15, th:1.3, stag:1.2, kb:1.25};     // §3 a TWO-HANDED melee base (the Maul, the Anchor-Hammer, the Harpoon): hit-stop weight · thump · stagger · knockback × (the bow & the staff are 2H but not these)
/* §2.8 THE DAMAGE TYPES (player → foe): its colour · its status · its sound when the status takes (fire / frost / storm / venom) */
const ELEM={phy:{n:'Steel', c:'#ffffff'}, fir:{n:'Ember', c:'#ff8a3c', snd:'fire'}, frs:{n:'Rime', c:'#8fd8ff', snd:'frost'}, sto:{n:'Storm', c:'#ffe55a', snd:'storm'}, ven:{n:'Venom', c:'#9be85a', snd:'venom'}};
/* §2.8 THE STATUSES ON FOES — one small aggregate per type per foe (the swarm: ONE dot {dps, t}): bleed pct of the hit over t, ≤ n stacks · burn pct over t,
   the strongest wins · chill t, tempo ×k · freeze build 25 × clamp(hit ÷ (10% of its max HP), lo, hi) (heavy ×2) → at 100 frozen t (elites tE), then imm s
   immune (a boss: 100 build = boss × its stagger bar) · shock ch (+ shk), t, takes ×mul · poison pct over t, ≤ n stacks (a new stack refreshes t) */
const STATUS={bleed:{pct:0.6, t:4, n:5}, burn:{pct:0.5, t:3}, chill:{t:2, k:0.7}, freeze:{b:25, lo:0.2, hi:2, t:1.2, tE:0.8, imm:3, boss:0.08}, shock:{ch:0.25, t:3, mul:1.15}, poison:{pct:0.3, t:5, n:20}, dotFl:40};
/* §2.13 THE EFFECT ENTITIES' CAPS: ground zones · your projectiles · the foes' · summons alive (every source together) · gulls (their own count) ·
   hitFl: hit numbers alive at once (G3 fix — a crowd under 100 shots was 400+ numbers: unreadable, and ~2 ms of text a frame; crits get ×1.5) */
const FX_CAP={zone:16, pproj:120, eproj:60, ally:4, gull:2, hitFl:60, fzone:10};   // (C8a fzone: the foes' zones — fire trails, pollen — of the 16; past it their own oldest ends, never yours)
/* §6.9 QUICK-EQUIP (G3 fix): the ▲ find you stand by (qeFind, 44u) isn't magnetised — it waits for your hold of E — until its prompt has shown `wait` s;
   then it comes to hand only once you step within r (walk onto it to bag it instead) */
const QE_GRAB={r:14, wait:0.6};
/* §2.2 HIT-STOP tiers: [the ITUNE knob, screen kick (px, capped by shakeCap), × the weapon's hsWeap?] — H5 & 'you' bypass the bank */
const HS_TIER={H1:['hsFod',0.6,1], H2:['hsFoe',1.2,1], H3:['hsHeavy',2.4,1], H4:['hsElite',4.0,0], H5:['hsBoss',7.0,0], you:['hsYou',2.4,0]}, HS_RANK={H1:1,H2:2,H3:3,H4:4,H5:5,you:0};
/* §2.4 what each kind is made of — its sparks, gibs, marks and the impact's material layer (§11) */
const EMAT={boar:'fur', dingo:'fur', alpha:'fur', snake:'scale', crab:'shell', clam:'shell', reefspike:'shell', urchin:'shell', ooze:'goo', diver:'feather',
  tidecaller:'wet', lamprey:'wet', siren:'wet', sanddev:'sand', boulderback:'stone', dummy:'fur',
  coco:'fur', kelpie:'wet', cinderfox:'fur', mshrimp:'shell', mothwing:'feather', scorpion:'shell', bogtoad:'goo',   // (C8a)
  termqueen:'sand', termite:'shell', walrus:'wet', salamander:'scale', beetle:'shell', tmantis:'shell', sporeling:'goo'};   // (C8c: the queen's clay mound · the walrus's wet blubber)
const MAT_HIT={fur:'hit_flesh', scale:'hit_flesh', feather:'hit_flesh', shell:'hit_shell', goo:'hit_goo', wet:'hit_goo', sand:'hit_stone', stone:'hit_stone'}, MAT_W={stone:5, shell:4, sand:3, fur:2, scale:2, wet:1, goo:1, feather:0};   // the impact voice per material · which one wins a multi-hit (the heaviest)
/* §8.1/§8.6 THE ATTACKS (C3a) — numbers & shapes only; each kind's own updater runs its en.st machine (st = the wind state an entry drives).
   range [min,max] (u, centre to centre) · wind/act/rec (s) · cd (s, from tokenRel) · mul (× atkAt(dlE); elites ×1.25) · heavy · type (venom poisons, frost chills) ·
   sh = the shape: cone {R, H° TOTAL arc} · circle {R} · lane {v u/s — hits by overlap while it runs} · proj {sp, pearl} · burst {n, sp} · tok = tokens (elites &
   rares 2; a ranged shot 1 — rng) · tell = its post-mask warning · push (u). Entries with `every` are no-token clocks (bristle, howl, raise, song). */
const ATK={
  boar:[{id:'charge', st:'windup', range:[0,175], wind:0.60, act:0.70, rec:0.70, cd:1.2, mul:1.8, heavy:1, type:'phy', sh:{k:'lane'}, tok:1, tell:'lane', push:28},
    {id:'gore', st:'wind', range:[0,35], wind:0.35, act:0.10, rec:0.40, cd:0.8, mul:1.0, type:'phy', sh:{k:'cone', R:30, H:60}, tok:1, tell:'cone'}],
  snake:[{id:'spit', st:'wind', range:[0,230], wind:0.35, act:0.05, rec:0.30, cd:1.8, mul:0.8, type:'venom', sh:{k:'proj', sp:86}, tok:1, rng:1, tell:'aim'}],
  crab:[{id:'lunge', st:'windup', range:[0,62], wind:0.50, act:0.34, rec:1.05, cd:0.9, mul:1.6, heavy:1, type:'phy', sh:{k:'lane'}, tok:1, tell:'lane', push:26}],
  dingo:[{id:'pounce', st:'crouch', range:[0,150], wind:0.45, act:0.40, rec:0.60, cd:1.0, mul:1.5, heavy:1, type:'phy', sh:{k:'lane'}, tok:1, tell:'lane', push:26}],
  urchin:[{id:'swell', st:'swell', range:[0,30], wind:0.50, act:0, rec:0, cd:0, mul:0.7, type:'phy', sh:{k:'burst', n:8, sp:150}, tok:1, tell:'ring', R:30}],
  ooze:[{id:'slam', st:'wind', range:[0,30], wind:0.40, act:0.10, rec:0.60, cd:1.0, mul:1.0, type:'phy', sh:{k:'cone', R:30, H:70}, tok:1, tell:'cone'}],
  clam:[{id:'pearl', st:'open', range:[0,260], wind:0.35, act:0.05, rec:0.60, cd:0, mul:0.9, type:'phy', sh:{k:'proj', sp:94, pearl:1}, tok:1, rng:1, tell:'aim'}],
  reefspike:[{id:'jab', st:'wind', range:[0,34], wind:0.40, act:0.10, rec:0.60, cd:1.0, mul:1.1, type:'phy', sh:{k:'cone', R:34, H:60}, tok:1, tell:'cone'},
    {id:'bristle', every:4.5, dur:1.0, tok:0}],
  diver:[{id:'dive', st:'dive', range:[0,150], wind:1.0, act:0, rec:1.2, cd:1.0, mul:1.3, heavy:1, type:'phy', sh:{k:'circle', R:24}, tok:1, tell:'ring', push:24}],
  sanddev:[{id:'erupt', st:'rumble', range:[0,22], wind:0.45, act:0.05, rec:1.2, cd:1.2, mul:1.4, heavy:1, type:'phy', sh:{k:'circle', R:26}, tok:1, tell:'ring', push:30}],
  alpha:[{id:'bite', st:'wind', range:[0,32], wind:0.40, act:0.10, rec:0.50, cd:0.9, mul:1.2, type:'phy', sh:{k:'cone', R:32, H:70}, tok:2, tell:'cone'},
    {id:'howl', every:6, dur:1.0, tok:0, R:200, haste:1.5}],
  tidecaller:[{id:'jab', st:'wind', range:[0,30], wind:0.40, act:0.10, rec:0.60, cd:1.2, mul:0.8, type:'phy', sh:{k:'cone', R:30, H:60}, tok:1, tell:'cone'},
    {id:'raise', every:4.2, dur:0.7, tok:0, max:3}],
  lamprey:[{id:'latch', st:'crouch', range:[0,52], wind:0.35, act:0.25, rec:0.60, cd:1.2, mul:0.4, type:'phy', sh:{k:'lane'}, tok:1, tell:'lane', v:240}],   // (a 60u lunge from ≤ 52u — it reaches you if you stand)
  siren:[{id:'keen', st:'wind', range:[0,30], wind:0.40, act:0.10, rec:1.30, cd:1.0, mul:1.2, heavy:1, type:'phy', sh:{k:'circle', R:30}, tok:1, tell:'circle', push:22},
    {id:'song', every:5, dur:1.2, tok:0, R:240}],
  /* (C8a §8.7) the eight signatures. New shapes: line {L, W} (from its centre along the locked aim — the body's radius added) · circle off (its centre
     that far ahead) · lob {R, T flight s, H arc u, bnc: one bounce u} (a thrown shot: it lands where you stood — its ring shows the whole flight).
     A kelpie's `L`/`winds` = its three dashes · a boulderback's roll `act` = its most roll time · `pst`/`ppct` = poison stacks × their share of the hit */
  coco:[{id:'lob', st:'wind', range:[0,200], wind:0.40, act:0.05, rec:0.50, cd:1.6, mul:1.0, type:'phy', sh:{k:'lob', R:20, T:0.9, H:34, bnc:30}, tok:1, rng:1, tell:'ring'}],
  kelpie:[{id:'dash', st:'windup', range:[0,200], wind:0.40, act:0, rec:0, cd:1.4, mul:1.4, heavy:1, type:'phy', sh:{k:'lane'}, tok:1, tell:'lane', push:26, sp:240, L:[70,70,140], winds:[0.4,0.3,0.3], zig:0.45, tired:1.2}],
  cinderfox:[{id:'bite', st:'wind', range:[0,30], wind:0.30, act:0.10, rec:0.40, cd:0.9, mul:0.9, type:'phy', sh:{k:'cone', R:28, H:70}, tok:1, tell:'cone'},
    {id:'pass', st:'pass', range:[0,150], cd:1.2, dur:0.9, sweep:3.1, R:30, tok:1, trail:{R:12, life:1.5, every:0.16, mul:0.3}, pant:1.0}],
  mshrimp:[{id:'punch', st:'wind', range:[0,56], wind:0.45, act:0.06, rec:1.40, cd:1.2, mul:2.0, heavy:1, type:'storm', sh:{k:'line', L:60, W:12}, tok:1, tell:'line', push:30, stun:0.25}],
  mothwing:[{id:'pollen', every:3.5, dur:0.6, tok:1, range:[0,160], R:30, life:3, slow:0.4, mul:0.2, type:'venom'}],   // (G5 fix: the puff takes a token like any skirmisher's shot)
  boulderback:[{id:'roll', st:'windup', range:[0,200], wind:0.70, act:1.6, rec:0, cd:1.5, mul:2.1, heavy:1, type:'phy', sh:{k:'lane'}, tok:1, tell:'lane', push:40, sp:180, bounce:0.4, dizzy:1.5}],
  scorpion:[{id:'snap', st:'wind', range:[0,32], wind:0.35, act:0.10, rec:0.30, cd:1.0, mul:0.9, type:'phy', sh:{k:'cone', R:30, H:70}, tok:1, tell:'cone'},
    {id:'sting', st:'wind', range:[0,60], wind:0.55, act:0.10, rec:0.60, cd:1.0, mul:1.6, heavy:1, type:'venom', sh:{k:'circle', R:20, off:30}, tok:1, tell:'ring', push:20, pst:3, ppct:0.15}],
  bogtoad:[{id:'tongue', st:'wind', range:[0,90], wind:0.50, act:0.12, rec:0.80, cd:1.4, mul:0.8, type:'venom', sh:{k:'line', L:110, W:10}, tok:1, tell:'line', push:0, pull:60},
    {id:'slam', st:'wind', range:[0,40], wind:0.40, act:0.10, rec:0.70, cd:1.4, mul:1.4, heavy:1, type:'phy', sh:{k:'circle', R:30}, tok:1, tell:'ring', push:26}],
  /* (C8c §8.7) six more. The queen's `brood` is a no-token clock (n termites every `every` s, ≤ max of hers alive) · the walrus's slide is a LANE run
     (sp u/s for `act` s at most — its lane shows exactly how far) laying ice every `iceEvery` u (≤ ice patches) · the salamander's glob is a lob that
     leaves a `pool` (a foe zone: life, tick, × a tick) where it lands — the glob itself doesn't hit · the beetle's beam tracks you, then LOCKS `lock` s
     before it fires (a 10u line, L at most — it stops at a hedge), then it's spent `cool` s (exposed) · the mantis's double slash lands twice (act,
     act2) · its guard (`every`, `dur`, blows ×k) turns the first blow into its COUNTER (a token-free 0.4 s cone) · the sporeling's `spores`: its
     `hits`-th blow taken (or its death) bursts a cloud that blooms `arm` s (the ring) first */
  termqueen:[{id:'squirt', st:'wind', range:[0,50], wind:0.50, act:0.10, rec:0.60, cd:3.0, mul:0.9, type:'venom', sh:{k:'cone', R:50, H:60}, tok:1, tell:'cone'},
    {id:'brood', every:4, dur:0.5, tok:0, n:3, max:9}],
  walrus:[{id:'slide', st:'windup', range:[0,200], wind:0.80, act:1.2, rec:0.90, cd:1.6, mul:1.8, heavy:1, type:'phy', sh:{k:'lane'}, tok:1, tell:'lane', push:32, sp:220, ice:12, iceEvery:26, thaw:18},
    {id:'tusk', st:'wind', range:[0,45], wind:0.50, act:0.10, rec:0.70, cd:1.2, mul:2.0, heavy:1, type:'frost', sh:{k:'cone', R:45, H:60}, tok:1, tell:'cone', push:26}],
  salamander:[{id:'glob', st:'wind', range:[0,200], wind:0.40, act:0.05, rec:0.60, cd:2.2, mul:0, type:'phy', sh:{k:'lob', R:36, T:0.7, H:30, bnc:0, pool:{life:3, tick:0.5, mul:0.3}}, tok:1, rng:1, tell:'ring'}],
  beetle:[{id:'beam', st:'wind', range:[0,190], wind:0.90, lock:0.35, act:0.30, rec:0, cd:1.4, mul:2.2, heavy:1, type:'storm', sh:{k:'line', L:200, W:10}, tok:1, rng:1, tell:'line', push:28, cool:1.2}],
  tmantis:[{id:'double', st:'wind', range:[0,46], wind:0.40, act:0.10, act2:0.10, rec:0.50, cd:1.0, mul:1.0, type:'phy', sh:{k:'cone', R:50, H:70}, tok:1, tell:'cone'},
    {id:'guard', every:4, dur:0.8, tok:0, k:0.5},
    {id:'counter', st:'wind', range:[0,60], wind:0.40, act:0.10, rec:0.50, cd:0.6, mul:1.4, heavy:1, type:'phy', sh:{k:'cone', R:45, H:70}, tok:0, tell:'cone', push:22}],
  sporeling:[{id:'bump', st:'wind', range:[0,30], wind:0.40, act:0.10, rec:0.60, cd:1.0, mul:0.8, type:'phy', sh:{k:'cone', R:30, H:70}, tok:1, tell:'cone', hop:10},
    {id:'spores', hits:3, arm:0.4, R:36, life:2.5, tick:0.5, mul:0.25, slow:0.25, type:'venom'}],
  swarm:[{id:'nip', gnaw:0.35, cd:1.0, mul:0.2, tok:0}] };
/* §8.8 THE BOSSES' MOVES (C3c) — no tokens (§8.2): a RUN (charge · lunge · pounce) lands once by overlap (LANE_ST), a cone through hitShape at its first
   act frame, a RING (stomp · tide) through ishock. Heavy ×2.2, big ×2.8 of atkAt(the boss's dlE) · wind / act / rec (s) · sp: a run's speed (u/s) ·
   push: the shove on you (u). The rhythm knobs (seal, howl, raise, ring clocks) stay ITUNE cv* sliders. */
const BOSS_ATK={
  greatboar:{charge:{id:'charge', wind:0.72, act:0.7, sp:168, mul:2.2, heavy:1, type:'phy', push:34},              // the lane winds (its aim LOCKED), then it runs · a chain of 2 (3 from phase 2)
    sweep:{id:'sweep', range:[0,60], wind:0.5, act:0.1, rec:0.7, mul:1.6, heavy:1, type:'phy', sh:{k:'cone', R:52, H:120}, push:26},   // TUSK SWEEP — you within 60u when it picks its next move
    stomp:{id:'stomp', wind:0.62, mul:2.8, heavy:1, type:'phy', push:34, R:190, v:210, sp:[8,12], spMul:0.6},   // rears up (its ring tell) → a shockwave to dash through + spines (phase 2: 8 · 3: 12)
    rec:0.7, recStag:1.2, roar:1.0, enrSpd:1.3, enrWind:0.8, windMin:0.4, exhaust:1.8, exhaustMul:1.25},        // recover (stagger ×1.2 in it) · the phase-2 roar · ENRAGED speed & winds (never under 0.4 s) · exhausted after a stomp (takes +25%)
  brood:{lunge:{id:'lunge', wind:0.55, act:0.42, sp:280, mul:2.4, heavy:1, type:'phy', push:30},                // the lane → the lunge → her BELLY exposed
    acid:{id:'acid', range:[0,90], wind:0.6, act:0.1, rec:0.5, mul:1.2, type:'venom', sh:{k:'cone', R:90, H:70}},
    exposed:1.2, bellyMul:1.5, sealMul:0.3, sealStag:2, broodCap:8},                                               // the belly (s, ×) · the SEAL: takes ×0.3, stagger builds ×2 (a BREAK cracks it) · crablings alive at most
  packking:{pounce:{id:'pounce', wind:0.45, act:0.42, sp:330, mul:2.2, heavy:1, type:'phy', push:30},
    bite:{id:'bite', range:[0,34], wind:0.4, act:0.1, rec:0.5, mul:1.0, type:'phy', sh:{k:'cone', R:34, H:70}},
    ring:[90,120], howl:1.0, cloneHp:0.2, chainWind:0.4},                                                         // he circles at 90-120u · the howl's head-up (s) · a shadow's HP (× his) · a chained crouch (s) — (how many shadows: cvClones)
  drowned:{ring:{id:'ring', wind:0.6, mul:1.8, heavy:1, type:'phy', push:34, R:220, v:160, dbl:0.5},             // a 0.6 s cast → a tide ring 0 → 220u at 160 u/s (phase 3: a second 0.5 s on)
    blinkR:50, blinkCD:5, raise:[2,2,3], raiseCap:4} };
const BOSS_STG={brk:2.0, reset:20, vul:1.5};   // §2.7 a boss BREAK: stunned 2 s · the bar's +stagGrow growth resets 20 s after the last break · vulnerable ×1.5
const BOSS_HASTE={sp:1.15, wind:0.9, wMin:0.4};   // (G2 fix) a HASTY boss: its steps ×1.15 & its runs cover the same lane ×1.15 faster (the tell stays exact) · its wind-ups ×0.9, never under 0.4 s (§8.8's floor) — Hasty was a no-op on bosses
const BOSS_AFX_HP={hasty:1.12, frenzy:1.12};           // (C9 — the lead's note: a Hasty / Frenzied boss's quicker cycles open more punish windows — ⚔15 duels ran 42 s; its HP carries a little more)
function bossAfxHp(tr){ let m=1; for(const k of (tr||[])) m*=BOSS_AFX_HP[k]||1; return m; }
const BOSS_AFX_W={venom:1};                       // (G2 fix) an affix's weight in the boss THREAT (bossThreat: d + Σ) — the rest ½ · Venomous a whole danger (its fan was the duels' KO-maker)
const BOSS_VEN={near:45};                         // (G2 fix) a Venomous BOSS's fan waits for the gap between its moves AND for you to stand off (> its body + near u) — a fan at point-blank can't be dodged
/* §8.3 THE AI ARCHETYPES — a = brute (guard facing you) · circler (an angle slot round you) · charger (backs up, paws, charges) · skirm (keeps its distance,
   shoots only with a token) · caster (casts on its own clock) · ambush · air · w = its WAIT RING [min, max] (u, no token) · mv = its move speed (u/s, §8.6) */
const ARCH={boar:{a:'charger', w:[60,80], mv:58}, snake:{a:'skirm', w:[110,140], mv:46}, crab:{a:'brute', w:[40,60], mv:30}, dingo:{a:'circler', w:[40,60], mv:82},
  urchin:{a:'brute', w:[40,60], mv:40}, ooze:{a:'brute', w:[40,60], mv:44}, clam:{a:'skirm', w:[0,0], mv:0}, reefspike:{a:'brute', w:[40,60], mv:38},
  diver:{a:'air', w:[64,80], mv:0}, sanddev:{a:'ambush', w:[50,70], mv:58}, alpha:{a:'brute', w:[40,60], mv:62}, tidecaller:{a:'caster', w:[150,250], mv:30},
  lamprey:{a:'ambush', w:[60,90], mv:116}, siren:{a:'caster', w:[150,250], mv:34},
  coco:{a:'skirm', w:[110,140], mv:70}, kelpie:{a:'charger', w:[60,80], mv:64}, cinderfox:{a:'circler', w:[40,60], mv:110}, mshrimp:{a:'brute', w:[40,60], mv:50},   // (C8a)
  mothwing:{a:'air', w:[30,50], mv:60}, boulderback:{a:'charger', w:[60,80], mv:35}, scorpion:{a:'brute', w:[40,60], mv:54}, bogtoad:{a:'ambush', w:[60,90], mv:40},
  termqueen:{a:'caster', w:[0,0], mv:0}, walrus:{a:'charger', w:[60,80], mv:30}, salamander:{a:'skirm', w:[110,140], mv:48}, beetle:{a:'skirm', w:[110,140], mv:40},   // (C8c — the queen never leaves her mound)
  tmantis:{a:'brute', w:[40,60], mv:60}, sporeling:{a:'brute', w:[40,60], mv:38}};
/* §8.7 THE SHORES' SIGNATURES (C8a): kind → its gate (the isle's ⚔ from which it turns up) & its weight per biome — every biome has one (pickEnL's 30%) */
const SIG_K={coco:{g:1, w:{tropic:2.0, atoll:1.5, bamboo:1.6}}, kelpie:{g:3, w:{moor:2.0, frost:2.0, swamp:1.0}}, cinderfox:{g:2, w:{ember:2.0, scorch:2.0, volcanic:1.6, savanna:1.0}},
  mshrimp:{g:3, w:{atoll:2.0, tropic:1.2, crystal:2.0}}, mothwing:{g:1, w:{meadow:2.2, mushroom:2.0, crystal:1.0}}, boulderback:{g:4, w:{boulder:2.4, moor:1.2, volcanic:1.4}},
  scorpion:{g:3, w:{dunes:2.2, savanna:2.0}}, bogtoad:{g:2, w:{swamp:2.4, bamboo:1.2, mushroom:1.0}},
  termqueen:{g:2, w:{savanna:2.2, dunes:1.2}}, walrus:{g:4, w:{frost:2.2, atoll:0.8, moor:0.6}}, salamander:{g:3, w:{volcanic:2.2, scorch:2.0, ember:0.8}},   // (C8c §8.7 · w.cave: its weight on ANY cave floor)
  beetle:{g:4, w:{crystal:2.4, mushroom:0.8, boulder:0.6}}, tmantis:{g:4, w:{bamboo:2.2, tropic:0.8, meadow:0.6}}, sporeling:{g:2, w:{mushroom:2.4, swamp:1.0, cave:1.2}}};
const SIG_ONE={termqueen:1};                          // (C8c) at most ONE of these in a pack (a mound of queens would bury you in termites) — the rest of its primary share goes to the secondary
const SIG_KEYS=Object.keys(SIG_K), MIX_K={sig:0.3, str:0.2};   // §8.7 the roll mix for a real foe: 30% the shore's signatures · 20% the older strange ones (EW_BIOME) · the rest (50%) the common four
/* (C8a) their HIT-ME windows (hurtEnemy's denial table): state → × a blow takes — a kelpie winded +25% · a mantis shrimp's long recovery +25% ·
   a boulderback's roll ×0.5 (the blow still counts — S6's floor) and dizzy +50% */
const EXPOSE={kelpie:{exposed:1.25}, mshrimp:{recover:1.25}, boulderback:{charge:0.5, exposed:1.5}};
const MOTH_LIFT=0.55;                                 // (C8a) a mothwing's body is painted this × its radius above its shadow (its eyes & bar follow)
/* (C8c) LAVA-SKIN: a salamander standing in its OWN lava pool takes × skin (it counts) — it basks in a pool within bask u of it (never one within
   near u of you): lure it out, or wait the pool out */
const SAL_SKIN={skin:0.6, bask:90, near:40};
/* §10 SECRETS & SHRINES (C8b). SECRET: the hidden grottoes — from the voyage's land-th landfall · a surface isle one at surf (a second at surf2 from ⚔surf2Dg) ·
   a cave floor one at cave · never off the landing or the first fight · a 1-tile corridor ray [4..9] tiles through solid wall to a pocket of radius pr tiles,
   kept 2 tiles from any other floor, trail, gate or water · the door: a CRACKED WALL (W_CRACK, 3 hits) or a GLYPH BOULDER (5) · its cues: a glint every
   glint s, a wind whistle within whR u · the chest (§6.7): 1 item ≥ Sea-glass + 1 cut gem + 1 geode · gem 15% · the Ship's Bell 15% · the Mermaid's
   Comb 25% (atoll & tropic) · the Crystal Lens (U09) 5% on crystal isles · a shrine inside 25% */
const SECRET={land:2, surf:0.7, surf2:0.35, surf2Dg:10, cave:0.25, ray:[4,9], pr:[2.5,3.5], hits:{crack:3, glyph:5}, crack2:0.5, shrine:0.25, glint:4, whR:60, whT:3.2, dR:9, rq:3,
  gem:0.15, bell:0.15, comb:0.25, combB:{atoll:1, tropic:1}, u09:0.05};
/* SHRINES (§10.2): from ⚔dg one a surface isle (a second at second from ⚔secondDg) in a fight clearing (not the first, not the hoard), ≥ ex u from a chest ·
   E once · a buff in the HUD's buff row (BUFF key) — the Wreck shrine a gamble: 15 × ⚔ g → an item (Coral 65 / Pearl 32 / the shore's Abyssal 3) 50% ·
   1-2 cut gems 25% · CURSED! 15% (30 s, +20% taken) · 10% the sea keeps it · the kinds equally likely, the Wreck ×1.2 */
const SHRINE={dg:2, second:0.35, secondDg:8, ex:50, cost:15, odds:[0.5,0.25,0.15,0.1], item:[65,32,3], curse:{t:30, tk:0.2}};
const SHRINE_K={
  squall:{n:'Squall', b:'sq', t:30, w:1, c:'#9fe8ff', lc:3, ic:'wind', tx:'+30% attack speed (past its cap) & +30% move speed · 30 s', asp:0.3, mov:0.3},
  flood:{n:'Flood', b:'fl', t:20, w:1, c:'#2fb7c9', lc:8, ic:'tide', tx:'your skills cost no Tide · 20 s'},
  kraken:{n:'Kraken', b:'kr', t:30, w:1, c:'#6fe0a0', lc:4, ic:'kraken', tx:'a quarter of your blows call a tentacle slam (100%, R30) · 30 s', ch:0.25, pct:100, R:30},
  pearl:{n:'Pearl', b:'pr', t:120, w:1, c:'#ffe9a6', lc:11, ic:'pearl', tx:'the next 3 items that drop are raised a tier (to Pearl at most) · 120 s', cnt:3},
  deep:{n:'Deep', b:'dp', t:20, w:1, c:'#6a8cff', lc:7, ic:'deep', tx:'+50% damage & −30% damage taken · 20 s', more:1.5, tk:0.7},
  wreck:{n:'Wreck', b:null, t:0, w:1.2, c:'#ffb040', lc:10, ic:'anchor', tx:'a gamble — pay 15 × the danger in gold'} };
const SHRINE_KEYS=Object.keys(SHRINE_K);
/* §8.4 THE PACKS (C3b) — the TRICK species: at most ONE per clearing (a second pack rolling one — or a different one — rerolls to a common kind).
   C8c adds its thicket mantis, salamander & sporeling here. */
const TRICK_K={clam:1, reefspike:1, diver:1, sanddev:1, siren:1, lamprey:1, tmantis:1, salamander:1, sporeling:1};
const PACK_CAP={lo:20, hi:24, dg:10};               // §8.4 a pack clearing's foes: 8-20 on a ⚔1-10 isle, capped at 24 beyond (G2 fix — was 24 everywhere) · packCap(the isle's ⚔)
function packCap(dl){ return dl<=PACK_CAP.dg ? PACK_CAP.lo : PACK_CAP.hi; }
/* §2.14 THE LEGACY FEEL (ITUNE.legacyFeel — the [ key / DEV): these knobs read as today's at read time (LF); swings wind 0 / act 0 / rec = the old
   cooldown, the old one-frame shove and the old combo rule live in the action code. Stats, numbers and the AI are untouched. */
const LEGACY_FEEL={swMoveWind:1, swMoveRec:1, swStepMul:0, hsFod:0, hsFoe:0, hsHeavy:0.03, hsElite:0.03, hsBoss:0.06, hsYou:0.03, kbSlide:0, corpseV:0, gibN:0, sparkN:0.3, shakeCap:3, sfxLegacy:1};
const FEEL_KEYS=['swMoveWind','swMoveRec','swWindMul','swRecMul','swStepMul','hsFod','hsFoe','hsHeavy','hsElite','hsBoss','hsFoeOnly','hsBank','hsRefill','hsWeapMul','finHsMin','lightHs','skillK','crestK','skillHs',
  'kbSlide','kbFric','pinball','kdTime','kdImm','corpseV','corpseCap','gibN','sparkN','fxCap','burstOver','burstCap','bowlV','bowlK','bowlMax','shakeCap','inputBuffer','comboWindow','hvOn','hvTime','hvMul','hvReach','hvKb','hvMove','hvHs','hvTide','hvMax','legacyFeel','sfxLegacy'];   // (📋 Copy tuning writes the changed ones · PX: THE HEAVY's hv*)
/* §11.3 THE DESIGNED SOUNDS (sfx2 — built-in WebAudio, no files). A recipe = its layers: [primitive, {params}] — tr (a noise transient: hp Hz, d s) ·
   th (a thump: sine f0→f1) · bd (a body: osc w f0→f1, lp) · nz (filtered noise: t type, f0→f1, q) · mat (the struck material: m, or the call's own) ·
   sin (a plain sine f). Every layer: g = gain, d = length (s), a = attack (s), at = start offset (s). */
const SFX2={
  swing_sword:[['nz',{t:'bandpass',f0:1800,f1:900,q:1.4,d:0.09,a:0.03,g:0.34}],['bd',{w:'sawtooth',f0:300,f1:200,d:0.09,a:0.02,g:0.04,lp:1400}]],
  swing_heavy:[['nz',{t:'bandpass',f0:1200,f1:500,q:1.2,d:0.14,a:0.045,g:0.42}],['th',{f0:80,f1:55,d:0.12,g:0.3}]],
  bow_release:[['tr',{hp:3200,d:0.005,g:0.5}],['bd',{w:'triangle',f0:720,f1:270,d:0.06,g:0.13}],['nz',{t:'bandpass',f0:2600,f1:1300,q:1.2,d:0.06,a:0.004,g:0.2}],['nz',{t:'highpass',f0:3000,f1:2400,d:0.05,g:0.14}],['bd',{w:'sine',f0:165,f1:120,d:0.08,g:0.09}]],   // (PT1 A2: less "pew" — the string's twang lower & quieter, the arrow's air, a soft thrum)
  hit_flesh:[['tr',{hp:2600,d:0.005,g:0.55}],['th',{f0:110,f1:45,d:0.1,g:0.72,w:1}],['mat',{g:0.5}]],   // (PT1 A2 — the hit family, G5V-B02: th ×1.3 here; sfx2 adds the 160-260 Hz body, a 2nd transient & 5 variants — SFX_HITV)
  hit_shell:[['tr',{hp:3600,d:0.004,g:0.6}],['mat',{m:'shell',g:0.5}],['bd',{w:'square',f0:900,f1:600,d:0.05,g:0.065,lp:3000}],['th',{f0:120,f1:60,d:0.07,g:0.39,w:1}]],
  hit_goo:[['tr',{hp:2000,d:0.004,g:0.3}],['mat',{m:'goo',g:0.6}],['th',{f0:100,f1:50,d:0.1,g:0.46,w:1}]],
  hit_stone:[['tr',{hp:3000,d:0.006,g:0.55}],['mat',{m:'stone',g:0.55}],['th',{f0:60,f1:40,d:0.12,g:0.72,w:1}]],
  hit_crit:[['bd',{w:'sawtooth',f0:220,f1:110,d:0.12,g:0.16,lp:1800}],['tr',{hp:3000,d:0.005,g:0.5}],['tr',{hp:4200,d:0.004,g:0.4,at:0.012}]],   // (played ON TOP of the hit_* for the struck material)
  kill_pop:[['tr',{hp:2200,d:0.004,g:0.3}],['nz',{t:'bandpass',f0:1500,f1:600,q:1.2,d:0.06,a:0.002,g:0.34}],['bd',{w:'triangle',f0:700,f1:1100,d:0.04,g:0.07}],['th',{f0:150,f1:80,d:0.06,g:0.12}]],   // (PT1 A2: a wet splat with a little weight — the old bubble chirp kept, quieter)
  kill_crunch:[['tr',{hp:2400,d:0.006,g:0.5}],['th',{f0:100,f1:40,d:0.16,g:0.78}],['mat',{g:0.45}],['nz',{t:'lowpass',f0:500,f1:300,d:0.12,g:0.32}]],
  stagger_break:[['th',{f0:70,f1:30,d:0.25,g:0.65}],['mat',{m:'shell',g:0.5}],['mat',{m:'shell',g:0.4,at:0.03}],['sin',{f:880,d:0.2,g:0.12}],['sin',{f:1320,d:0.2,g:0.09}]],
  thud:[['th',{f0:90,f1:40,d:0.11,g:0.6}],['nz',{t:'lowpass',f0:300,f1:200,d:0.1,g:0.4}]],
  dash:[['nz',{t:'bandpass',f0:2500,f1:800,q:1.1,d:0.12,a:0.025,g:0.3}]],
  dash_perfect:[['nz',{t:'bandpass',f0:1100,f1:4200,q:1.3,d:0.13,a:0.012,g:0.34}],['sin',{f:1318,f1:1976,d:0.11,g:0.06}],['sin',{f:2637,d:0.16,g:0.035,at:0.05}]],   // (PT2 X2) THE PERFECT DASH — a rising whoosh (the plain dash's falls) & a bright two-note glint
  nope:[['tr',{hp:1800,d:0.004,g:0.2}],['nz',{t:'bandpass',f0:520,f1:380,q:2.5,d:0.08,a:0.002,g:0.34}],['bd',{w:'square',f0:165,f1:135,d:0.08,g:0.05,lp:650}]],   // (PT1 A2: a dull wooden "no" — the old square buzz kept under it, half as loud)
  flask:[['sin',{f:400,d:0.05,g:0.14}],['sin',{f:520,d:0.05,g:0.13,at:0.05}],['sin',{f:650,d:0.05,g:0.12,at:0.1}],['bd',{w:'square',f0:120,f1:110,d:0.1,g:0.06,lp:600,at:0.02}]],
  tide_tick:[['sin',{f:1568,d:0.04,g:0.07}]],                                                                             // (C2b — the resources) Tide crosses slot 2's cost
  tide_full:[['sin',{f:523,d:0.06,g:0.09}],['sin',{f:659,d:0.06,g:0.09,at:0.06}],['sin',{f:784,d:0.08,g:0.09,at:0.12}],['nz',{t:'lowpass',f0:800,f1:450,d:0.3,a:0.08,g:0.16}]],
  flask_full:[['sin',{f:1047,d:0.18,g:0.09}],['sin',{f:1568,d:0.18,g:0.06}]],                                            // a flask charge fills from kills
  whirl:[['nz',{t:'bandpass',f0:400,f1:2000,q:1.2,d:0.18,a:0.06,g:0.34}],['nz',{t:'bandpass',f0:2000,f1:600,q:1.2,d:0.18,a:0.02,g:0.3,at:0.17}],   // the spin: a whoosh that rises & falls
    ['bd',{w:'sawtooth',f0:160,f1:350,d:0.18,a:0.03,g:0.05,lp:1600}],['bd',{w:'sawtooth',f0:350,f1:110,d:0.18,g:0.05,lp:1600,at:0.17}]],
  gong:[['th',{f0:60,f1:52,d:0.25,g:0.5}],['sin',{f:110,d:0.25,g:0.14}]],   // (the finisher's low gong — a layer the heavy hit adds)
  block:[['tr',{hp:3400,d:0.005,g:0.5}],['mat',{m:'shell',g:0.5}],['th',{f0:90,f1:70,d:0.1,g:0.4}]],                          // (C3a — the hits on you) a shield takes it
  hurt_light:[['tr',{hp:2200,d:0.004,g:0.25}],['nz',{t:'bandpass',f0:1300,f1:850,q:1.2,d:0.05,g:0.22}],['th',{f0:130,f1:70,d:0.07,g:0.14}],['bd',{w:'square',f0:240,f1:185,d:0.06,g:0.045,lp:1000}]],   // (PT1 A2: a blow lands on you — a thump, the buzz under it)
  hurt_heavy:[['th',{f0:70,f1:40,d:0.16,g:0.6}],['bd',{w:'sawtooth',f0:180,f1:90,d:0.2,g:0.12,lp:1200}],['tr',{hp:2400,d:0.006,g:0.45}]],
  ko:[['th',{f0:60,f1:25,d:0.7,g:0.6}],['sin',{f:440,f1:110,d:0.8,g:0.12}]],
  venom:[['nz',{t:'highpass',f0:3000,f1:3000,d:0.2,g:0.16}],['sin',{f:300,f1:500,d:0.14,g:0.08}]],                         // poisoned · chilled
  frost:[['nz',{t:'highpass',f0:5000,f1:5000,d:0.18,g:0.14}],['sin',{f:1760,f1:1320,d:0.18,g:0.07}]],
  boss_roar:[['bd',{w:'sawtooth',f0:70,f1:62,d:1.1,a:0.12,g:0.2,lp:1000,lp1:300}],['bd',{w:'sawtooth',f0:73,f1:64,d:1.1,a:0.14,g:0.18,lp:1000,lp1:300}],   // (C3c, §11.3's C9 recipe pulled forward) the hoard's distant ROAR —
    ['bd',{w:'sawtooth',f0:110,f1:96,d:1.0,a:0.1,g:0.12,lp:900,lp1:280}],['nz',{t:'lowpass',f0:700,f1:250,d:0.45,a:0.08,g:0.22}]],   // 3 detuned saws, the lowpass closing 1 kHz → 300 Hz + breath
  loot_sg:[['sin',{f:1319,d:0.25,g:0.08}],['sin',{f:1760,d:0.25,g:0.06}]],                                                  // (C4b, §11.3's C9 loot chimes pulled forward) a Sea-glass drop
  loot_coral:[['bd',{w:'triangle',f0:784,f1:784,d:0.07,g:0.1}],['bd',{w:'triangle',f0:988,f1:988,d:0.07,g:0.1,at:0.07}],['bd',{w:'triangle',f0:1319,f1:1319,d:0.12,g:0.1,at:0.14}]],
  loot_pearl:[['sin',{f:523,d:0.2,g:0.07}],['sin',{f:659,d:0.2,g:0.07,at:0.1}],['sin',{f:784,d:0.2,g:0.07,at:0.2}],['sin',{f:1047,d:0.3,g:0.07,at:0.3}],['sin',{f:1319,d:0.5,g:0.07,at:0.4}],['nz',{t:'highpass',f0:6000,f1:7000,d:0.9,a:0.2,g:0.05}]],
  loot_abyss:[['bd',{w:'sawtooth',f0:55,f1:52,d:1.4,a:0.1,g:0.18,lp:400}],['bd',{w:'sawtooth',f0:58,f1:55,d:1.4,a:0.12,g:0.16,lp:400}],['sin',{f:220,d:1.0,g:0.1,at:0.1}]],
  swing_axe:[['nz',{t:'lowpass',f0:900,f1:400,d:0.15,a:0.04,g:0.42}],['bd',{w:'square',f0:140,f1:90,d:0.12,a:0.02,g:0.06,lp:900}]],        // (C5a — the weapons, §11.3) a heavy chop's whoomp
  thrust:[['nz',{t:'highpass',f0:3000,f1:2600,d:0.05,a:0.01,g:0.3}],['bd',{w:'triangle',f0:500,f1:380,d:0.04,g:0.1}]],                      // the spear: a hiss & a hollow knock
  dagger:[['nz',{t:'highpass',f0:4000,f1:3600,d:0.035,a:0.006,g:0.28}]],                                                                     // a quick steel whisper
  bow_draw:[['bd',{w:'sawtooth',f0:180,f1:240,d:0.12,a:0.03,g:0.05,lp:700}]],                                                                // the string creaks taut
  cast_bolt:[['bd',{w:'sine',f0:600,f1:1150,d:0.09,a:0.005,g:0.075}],['nz',{t:'bandpass',f0:1400,f1:2600,q:2,d:0.09,a:0.01,g:0.18}],['nz',{t:'lowpass',f0:1600,f1:500,d:0.12,a:0.01,g:0.2}]],        // a bolt leaves the staff (PT1 A2: its tone softer, a whoosh of air under it)
  slam:[['th',{f0:80,f1:28,d:0.3,g:0.7,w:1}],['nz',{t:'lowpass',f0:600,f1:200,d:0.25,a:0.01,g:0.4}],['mat',{m:'stone',g:0.45}]],            // the axe's SLAM: the ground shakes
  storm:[['nz',{t:'highpass',f0:3000,f1:3000,d:0.008,g:0.3}],['nz',{t:'highpass',f0:3200,f1:3200,d:0.008,g:0.26,at:0.03}],['nz',{t:'highpass',f0:3000,f1:3000,d:0.008,g:0.24,at:0.055}],
    ['nz',{t:'highpass',f0:3400,f1:3400,d:0.008,g:0.22,at:0.085}],['nz',{t:'highpass',f0:3000,f1:3000,d:0.008,g:0.2,at:0.11}],['bd',{w:'square',f0:1100,f1:980,d:0.12,g:0.04,lp:3000}]],   // five crackles & a buzz (a Shock takes)
  fire:[['nz',{t:'lowpass',f0:1200,f1:700,d:0.25,a:0.03,g:0.3}],['sin',{f:120,f1:100,d:0.22,g:0.12}]],                                     // a whoosh & a low roar (a Burn takes)
  prosp_up:[['tr',{hp:3600,d:0.005,g:0.45}],['mat',{m:'stone',g:0.35}],['sin',{f:1047,d:0.1,g:0.08,at:0.06}],['sin',{f:1319,d:0.1,g:0.08,at:0.13}],['sin',{f:1760,d:0.22,g:0.08,at:0.2}]],   // (C7a) the Prospector's pick-chime: a pick strikes stone, then a bright three-note ring
  forge:[['tr',{hp:3400,d:0.005,g:0.55}],['bd',{w:'square',f0:1800,f1:1760,d:0.3,g:0.05,lp:4200}],['sin',{f:2400,d:0.3,g:0.04}],['th',{f0:120,f1:70,d:0.06,g:0.25}]],   // (C7b, §11.3's C9 recipe pulled forward) the hammer on the anvil: a clang & its ring
  brew:[0,0.07,0.15,0.24].map((t,i)=>['sin',{f:340+i*70,f1:520+i*80,d:0.06,g:0.09,at:t}]).concat([['nz',{t:'lowpass',f0:600,f1:350,d:0.3,a:0.05,g:0.14}]]),   // (C7b) the kettle: bubbles rising & a simmer
  /* (C5b §11.3 — the gems' signature sounds) */
  chain_whirr:[0,0.04,0.08,0.12,0.16,0.20,0.24,0.28].map(t=>['bd',{w:'square',f0:92,f1:88,d:0.026,a:0.003,g:0.07,lp:900,at:t}]).concat([['nz',{t:'bandpass',f0:1500,f1:900,q:2,d:0.3,a:0.03,g:0.08}]]),   // a chain paying out: a 25 Hz square rattle
  chain_thunk:[['th',{f0:120,f1:48,d:0.14,g:0.6}],['mat',{m:'stone',g:0.5}],['tr',{hp:2400,d:0.005,g:0.4}]],                                // …and it bites (a stone thump)
  cannon:[['th',{f0:55,f1:30,d:0.3,g:0.75}],['nz',{t:'lowpass',f0:400,f1:180,d:0.35,a:0.005,g:0.5}],['sin',{f:1800,f1:600,d:0.78,g:0.05,at:0.12}]],   // the ship's guns boom — then the shot whistles down (0.8 s to the impact)
  foghorn:[['bd',{w:'sawtooth',f0:110,f1:110,d:0.9,a:0.18,g:0.13,lp:500}],['bd',{w:'sawtooth',f0:112,f1:112,d:0.9,a:0.18,g:0.13,lp:500}]],       // the beacon's two detuned saws
  gurgle:[0,0.16,0.33,0.5,0.66].map(t=>['nz',{t:'lowpass',f0:520,f1:320,d:0.12,a:0.03,g:0.3,at:t}]).concat([['sin',{f:300,f1:520,d:0.06,g:0.08,at:0.1}],['sin',{f:260,f1:470,d:0.06,g:0.07,at:0.42}],['sin',{f:340,f1:600,d:0.05,g:0.06,at:0.6}]]),   // the deep: LP noise at 6 Hz + bubbles
  wet_slap:[['nz',{t:'lowpass',f0:700,f1:450,d:0.06,g:0.45}],['th',{f0:90,f1:48,d:0.11,g:0.5}],['mat',{m:'wet',g:0.3}]],                     // a tentacle slaps down
  gem_level:[['sin',{f:1319,d:0.12,g:0.08}],['sin',{f:1760,d:0.12,g:0.08,at:0.07}],['sin',{f:2093,d:0.22,g:0.08,at:0.14}]],                   // a gem climbs a level: the glass arpeggio
  shrine_gamble:[0,0.07,0.14,0.21,0.28,0.35].map(t=>['tr',{hp:2800,d:0.008,g:0.35,at:t}]).concat([['sin',{f:880,d:0.25,g:0.08,at:0.45}],['sin',{f:1320,d:0.25,g:0.06,at:0.45}]]),   // (C8b's — the dice rattle, then the result chime)
  /* (C8b §11.3 — pulled forward from C9's list) */
  secret:[['th',{f0:90,f1:38,d:0.22,g:0.65}],['mat',{m:'stone',g:0.5}],['sin',{f:200,f1:800,d:0.6,g:0.1}],['nz',{t:'bandpass',f0:600,f1:1800,q:1.4,d:0.7,a:0.12,g:0.2}]],   // a door gives: a thump & rubble, a rising note, the draught rushing out
  shrine:[['bd',{w:'sine',f0:392,f1:392,d:0.9,a:0.12,g:0.08}],['bd',{w:'sine',f0:587,f1:587,d:0.9,a:0.16,g:0.06}],['bd',{w:'sine',f0:784,f1:784,d:0.9,a:0.2,g:0.05}]],   // a shrine answers: root, fifth & octave, a soft swell
  whistle:[['nz',{t:'bandpass',f0:1300,f1:1750,q:9,d:0.9,a:0.3,g:0.05}],['sin',{f:1180,f1:1420,d:0.8,g:0.012}]],   // the wind through a cracked wall — faint, from the stone
  /* (C9 §11.3 — the rest) TELLS: a foe's wind-up speaks by its archetype (enTell) · BARKS: a kind's voice as its pack wakes & as it falls (enBark) */
  tell_snort:[['nz',{t:'lowpass',f0:400,f1:280,d:0.15,a:0.02,g:0.4}],['bd',{w:'sawtooth',f0:110,f1:92,d:0.15,a:0.01,g:0.07,lp:600}]],          // a charger paws & snorts
  tell_growl:[0,1,2,3,4,5,6,7,8].map(i=>['bd',{w:'sawtooth',f0:90,f1:84,d:0.03,a:0.004,g:0.09,lp:700,at:i*0.033}]),                           // a pouncer growls (a 30 Hz tremolo)
  tell_click:[['tr',{hp:3600,d:0.004,g:0.35}],['mat',{m:'shell',g:0.28}],['tr',{hp:3800,d:0.004,g:0.3,at:0.08}],['mat',{m:'shell',g:0.24,at:0.08}]],   // a shell clicks twice
  tell_hiss:[['nz',{t:'highpass',f0:4000,f1:4600,d:0.25,a:0.05,g:0.2}]],                                                                       // a skirmisher hisses
  tell_hum:[['bd',{w:'sine',f0:220,f1:222,d:0.5,a:0.3,g:0.09}],['bd',{w:'sine',f0:330,f1:333,d:0.5,a:0.33,g:0.06}]],                         // a caster's hum swells
  bark_grunt:[['bd',{w:'sawtooth',f0:140,f1:92,d:0.16,a:0.01,g:0.08,lp:700}],['nz',{t:'lowpass',f0:600,f1:350,d:0.14,a:0.01,g:0.26}]],
  bark_yip:[['bd',{w:'triangle',f0:700,f1:1150,d:0.08,a:0.005,g:0.1}],['nz',{t:'bandpass',f0:1800,f1:2300,q:2,d:0.06,g:0.12}]],
  bark_click:[['bd',{w:'square',f0:1400,f1:1300,d:0.03,g:0.05,lp:3000}],['nz',{t:'bandpass',f0:3000,f1:3000,q:6,d:0.03,g:0.25}],['nz',{t:'bandpass',f0:3300,f1:3300,q:6,d:0.03,g:0.2,at:0.06}]],
  bark_croak:[['bd',{w:'square',f0:130,f1:108,d:0.18,a:0.02,g:0.07,lp:500}],['nz',{t:'bandpass',f0:500,f1:380,q:2,d:0.16,g:0.2}]],
  bark_chitter:[0,0.035,0.07,0.105].map(t=>['bd',{w:'square',f0:1900,f1:1500,d:0.022,g:0.035,lp:3500,at:t}]).concat([['nz',{t:'highpass',f0:3000,f1:3000,d:0.14,a:0.01,g:0.1}]]),
  bark_hoot:[['bd',{w:'sine',f0:520,f1:430,d:0.2,a:0.03,g:0.1}],['nz',{t:'bandpass',f0:900,f1:780,q:3,d:0.18,a:0.03,g:0.08}]],
  gem_drop:[['sin',{f:2093,d:0.15,g:0.08}],['sin',{f:1568,d:0.06,g:0.05,at:0.05}],['sin',{f:2637,d:0.12,g:0.05,at:0.1}]],                          // a skill gem drops: a bright ping & a small run
  pick:[['bd',{w:'triangle',f0:640,f1:900,d:0.05,a:0.003,g:0.09}],['mat',{g:0.14}]],                                                           // the pickup tick (pickCombo climbs its pitch) + the material it is (coin · stone · glass · leaf…)
  node_hit:[['tr',{hp:3000,d:0.005,g:0.45}],['mat',{g:0.4}]],                                                                        // a pick on a node (its own stuff)
  node_break:[['tr',{hp:2600,d:0.006,g:0.5}],['th',{f0:90,f1:45,d:0.12,g:0.45}],['mat',{g:0.55}],['nz',{t:'lowpass',f0:700,f1:250,d:0.18,a:0.005,g:0.3}]],   // …and it gives: rubble
  geode:[['tr',{hp:2600,d:0.006,g:0.45}],['mat',{m:'stone',g:0.5}],['nz',{t:'lowpass',f0:700,f1:250,d:0.16,g:0.25}],['sin',{f:2637,d:0.3,g:0.07,at:0.05}],['sin',{f:3520,d:0.25,g:0.05,at:0.09}]],   // a geode: the break & a glass ping
  lvl:[[523,0],[659,0.085],[784,0.17],[1047,0.29]].flatMap(([f,t],i)=>[['bd',{w:'triangle',f0:f,f1:f,d:i<3?0.12:0.36,a:0.004,g:0.09,at:t}],['sin',{f:f*2,d:i<3?0.1:0.3,g:0.03,at:t}]]),   // the level-up: four rising notes, triangle + a sine an octave up
  secure:[[587,0],[740,0.11],[880,0.22]].map(([f,t],i)=>['bd',{w:'triangle',f0:f,f1:f,d:i<2?0.09:0.28,a:0.004,g:0.1,at:t}]).concat([['sin',{f:1760,d:0.25,g:0.025,at:0.22}]]),   // a clearing won: a 3-note STING (4 variants, rotating — stingSecure)
  secure2:[[659,0],[784,0.11],[988,0.22]].map(([f,t],i)=>['bd',{w:'triangle',f0:f,f1:f,d:i<2?0.09:0.28,a:0.004,g:0.1,at:t}]).concat([['sin',{f:1976,d:0.25,g:0.025,at:0.22}]]),
  secure3:[[523,0],[784,0.11],[659,0.22]].map(([f,t],i)=>['bd',{w:'triangle',f0:f,f1:f,d:i<2?0.09:0.28,a:0.004,g:0.1,at:t}]).concat([['sin',{f:1319,d:0.25,g:0.025,at:0.22}]]),
  secure4:[[698,0],[880,0.11],[1047,0.22]].map(([f,t],i)=>['bd',{w:'triangle',f0:f,f1:f,d:i<2?0.09:0.28,a:0.004,g:0.1,at:t}]).concat([['sin',{f:2093,d:0.25,g:0.025,at:0.22}]]),
  claim:[[392,0,0.09],[392,0.12,0.09],[392,0.24,0.09],[523,0.38,0.5],[440,0.95,0.14],[494,1.12,0.14]].flatMap(([f,t,d])=>[['bd',{w:'sawtooth',f0:f,f1:f,d,a:0.01,g:0.06,lp:1500,at:t}],['bd',{w:'triangle',f0:f*2,f1:f*2,d,a:0.006,g:0.04,at:t}]])   // THE CLAIM (and a boss's fall): 3 short notes, a long one, 2 steps…
    .concat([523,659,784].flatMap(f=>[['bd',{w:'sawtooth',f0:f,f1:f,d:1.1,a:0.02,g:0.05,lp:1600,lp1:900,at:1.3}],['bd',{w:'triangle',f0:f*2,f1:f*2,d:0.9,a:0.02,g:0.025,at:1.3}]]))   // …and the chord resolves
    .concat([['bd',{w:'sine',f0:131,f1:131,d:1.1,a:0.02,g:0.1,at:1.3}],['th',{f0:70,f1:45,d:0.3,g:0.4,at:1.3}],['nz',{t:'highpass',f0:6000,f1:7000,d:1.0,a:0.3,g:0.04,at:1.35}]]),
  ui_click:[['tr',{hp:4000,d:0.003,g:0.15}],['nz',{t:'bandpass',f0:2400,f1:2000,q:3,d:0.02,g:0.12}],['bd',{w:'triangle',f0:1200,f1:1150,d:0.02,g:0.018}]],   // (PT1 A2: a soft click, not a beep)                                       // a button
  ui_equip:[['tr',{hp:3000,d:0.004,g:0.3}],['mat',{m:'shell',g:0.22}],['sin',{f:880,d:0.08,g:0.05,at:0.03}],['sin',{f:1319,d:0.12,g:0.05,at:0.08}]],   // worn / slotted: a clasp & a ding
  ui_ok:[['sin',{f:784,d:0.1,g:0.07}],['sin',{f:1175,d:0.18,g:0.07,at:0.08}]],                                                                   // a deal done (a buy, a contract, a respec) — the old all-purpose 'secure' beep
  /* (C9: the crawl's old beeps redone in the same kit) */
  chest:[['nz',{t:'bandpass',f0:500,f1:900,q:3,d:0.18,a:0.03,g:0.2}],['th',{f0:120,f1:70,d:0.1,g:0.35,at:0.12}],['sin',{f:1568,d:0.2,g:0.05,at:0.2}],['sin',{f:2093,d:0.25,g:0.05,at:0.26}]],   // a lid creaks up: a thump & a glitter
  streak:[['bd',{w:'triangle',f0:1047,f1:1047,d:0.1,a:0.003,g:0.08}],['sin',{f:2093,d:0.08,g:0.03}]],                                            // the streak's climbing ding (the pitch is the call's)
  dig:[['nz',{t:'lowpass',f0:500,f1:250,d:0.12,a:0.005,g:0.4}],['mat',{m:'sand',g:0.35}],['th',{f0:100,f1:60,d:0.08,g:0.25}]],                     // a spade (or a paw) into the ground
  howl:[['bd',{w:'sawtooth',f0:260,f1:420,d:0.25,a:0.08,g:0.07,lp:1200}],['bd',{w:'sawtooth',f0:420,f1:300,d:0.35,g:0.07,lp:1100,at:0.24}],['nz',{t:'bandpass',f0:900,f1:700,q:2,d:0.5,a:0.1,g:0.08}]],   // a howl rises & falls
  raise:[['bd',{w:'triangle',f0:210,f1:420,d:0.45,a:0.15,g:0.08}],['nz',{t:'bandpass',f0:600,f1:1400,q:2,d:0.45,a:0.2,g:0.12}]],             // something is called up out of the ground
  /* (PT1 W4 — pt1_audio §3.5.5) the harbour */
  chart_ink:[['nz',{t:'bandpass',f0:2500,f1:2000,q:1.5,d:0.3,a:0.08,g:0.12}],['sin',{f:784,d:0.2,g:0.04,at:0.15}],['sin',{f:1175,d:0.3,g:0.04,at:0.25}]],   // "Dock at" inks the town & her waters: a pen's scratch & two soft notes
  sail_set:[['nz',{t:'bandpass',f0:700,f1:1200,q:0.8,d:0.35,a:0.08,g:0.2}]],                                                                     // canvas shaken out — leaving port at rest
  /* (PT1 W5 — pt1_audio §3.5.5) the course marker */
  waypoint_set:[['nz',{t:'bandpass',f0:3000,f1:2600,q:2,d:0.12,a:0.01,g:0.14}],['sin',{f:1047,d:0.1,g:0.05,at:0.05}],['sin',{f:1568,d:0.16,g:0.05,at:0.11}]],   // a pin into the chart & a two-note chime
  waypoint_clear:[['nz',{t:'bandpass',f0:2600,f1:2000,q:2,d:0.1,a:0.01,g:0.12}]],                                                                              // the pin pulled
  /* (PT1 W6 — pt1_audio §3.5.5) the explorer */
  explorer_none:[['tr',{hp:1800,d:0.004,g:0.2}],['nz',{t:'bandpass',f0:520,f1:380,q:2.5,d:0.08,a:0.002,g:0.34}],['bd',{w:'square',f0:165,f1:135,d:0.08,g:0.05,lp:650}]],                                                                                       // X with no explorer aboard (a copy of nope's row)
  /* (PT1 W10 — pt1_audio §3.5.5) drag & drop */
  drag_pick:[['nz',{t:'bandpass',f0:1200,f1:1000,q:1,d:0.06,a:0.005,g:0.2}]],                                                                                  // a piece lifted off its tile
  drag_drop:[['nz',{t:'bandpass',f0:900,f1:700,q:1,d:0.06,g:0.2}],['th',{f0:140,f1:100,d:0.05,g:0.2}]],                                                       // set down where it'll stay
  drag_bad:[['tr',{hp:1800,d:0.004,g:0.2}],['nz',{t:'bandpass',f0:520,f1:380,q:2.5,d:0.08,a:0.002,g:0.34}],['bd',{w:'square',f0:165,f1:135,d:0.08,g:0.05,lp:650}]],                                                                                            // it won't go there — it snaps back (a copy of nope's row)
  drag_salvage:[['tr',{hp:3000,d:0.005,g:0.35}],['mat',{m:'stone',g:0.3}]],                                                                                     // onto the salvage bin — broken down
  /* (PT1 W11 — pt1_audio §3.5.5) */
  drag_sell:[['sin',{f:784,d:0.1,g:0.07}],['sin',{f:1175,d:0.18,g:0.07,at:0.08}]],                                                                             // onto the market's sell box — sold (a copy of ui_ok's row)
  /* (PT1 A1 — pt1_audio §3.5.5) the synth fallback of every new canonical id: the crawl's props, traps & terrain · the finishers & crits · the split old beeps */
  barrel_boom:[['th',{f0:70,f1:30,d:0.45,g:0.8}],['nz',{t:'lowpass',f0:1200,f1:150,d:0.6,a:0.004,g:0.6}],['tr',{hp:1800,d:0.01,g:0.5}],['mat',{m:'stone',g:0.4,at:0.05}]],
  barrel_hit:[['tr',{hp:2400,d:0.005,g:0.4}],['nz',{t:'bandpass',f0:700,f1:500,q:1.5,d:0.08,g:0.4}],['th',{f0:110,f1:70,d:0.08,g:0.35}]],
  barrel_fuse:[['nz',{t:'highpass',f0:3000,f1:3500,d:0.6,a:0.05,g:0.12}]],
  crate_hit:[['tr',{hp:2400,d:0.005,g:0.4}],['nz',{t:'bandpass',f0:800,f1:600,q:1.5,d:0.07,g:0.4}],['th',{f0:120,f1:80,d:0.07,g:0.3}]],
  crate_break:[['tr',{hp:2200,d:0.006,g:0.5}],['nz',{t:'bandpass',f0:900,f1:500,q:1.2,d:0.18,g:0.45}],['th',{f0:110,f1:60,d:0.12,g:0.4}],['nz',{t:'bandpass',f0:1400,f1:900,q:2,d:0.08,g:0.3,at:0.06}]],
  rock_warn:[['nz',{t:'bandpass',f0:1800,f1:1200,q:2,d:0.25,a:0.05,g:0.15}],['mat',{m:'sand',g:0.2,at:0.1}]],
  rock_fall:[['th',{f0:80,f1:35,d:0.3,g:0.7}],['nz',{t:'lowpass',f0:900,f1:250,d:0.35,a:0.005,g:0.5}],['mat',{m:'stone',g:0.5,at:0.04}],['mat',{m:'stone',g:0.35,at:0.11}]],
  trap_arm:[['bd',{w:'square',f0:1500,f1:1400,d:0.03,g:0.06,lp:3500}],['tr',{hp:4000,d:0.004,g:0.3}]],
  trap_spike:[['tr',{hp:3000,d:0.005,g:0.5}],['mat',{m:'shell',g:0.45}],['nz',{t:'highpass',f0:3000,f1:2000,d:0.08,g:0.25}],['th',{f0:100,f1:60,d:0.08,g:0.3}]],
  trap_dart:[['nz',{t:'bandpass',f0:3000,f1:1500,q:2,d:0.08,a:0.01,g:0.3}],['tr',{hp:3500,d:0.004,g:0.3}]],
  dart_hit:[['tr',{hp:3000,d:0.005,g:0.45}],['th',{f0:130,f1:70,d:0.06,g:0.35}]],
  arrow_hit:[['tr',{hp:3000,d:0.005,g:0.35}],['th',{f0:140,f1:80,d:0.05,g:0.25}]],
  pillar_crack:[['tr',{hp:2600,d:0.006,g:0.5}],['mat',{m:'stone',g:0.55}],['nz',{t:'bandpass',f0:700,f1:1400,q:2,d:0.25,g:0.2}]],
  pillar_fall:[['th',{f0:60,f1:28,d:0.5,g:0.85}],['nz',{t:'lowpass',f0:700,f1:150,d:0.7,a:0.02,g:0.6}],['mat',{m:'stone',g:0.5,at:0.08}],['mat',{m:'stone',g:0.4,at:0.2}]],
  bridge_creak:[['bd',{w:'sawtooth',f0:180,f1:230,d:0.4,a:0.1,g:0.05,lp:900}],['nz',{t:'bandpass',f0:600,f1:900,q:6,d:0.4,a:0.1,g:0.12}]],
  bridge_snap:[['tr',{hp:2000,d:0.008,g:0.55}],['nz',{t:'bandpass',f0:1100,f1:500,q:1.4,d:0.2,g:0.45}],['th',{f0:90,f1:45,d:0.18,g:0.45}]],
  lava_hiss:[['nz',{t:'highpass',f0:2500,f1:4000,d:0.4,a:0.05,g:0.18}],['nz',{t:'lowpass',f0:500,f1:300,d:0.4,g:0.15}]],
  bog_bubble:[0,0.12,0.26].map(t=>['sin',{f:260,f1:480,d:0.06,g:0.07,at:t}]).concat([['nz',{t:'lowpass',f0:500,f1:300,d:0.3,a:0.03,g:0.2}]]),
  bog_squelch:[['nz',{t:'lowpass',f0:600,f1:250,d:0.14,a:0.01,g:0.35}],['sin',{f:180,f1:110,d:0.12,g:0.12}]],
  ice_crack:[['tr',{hp:4000,d:0.004,g:0.45}],['sin',{f:2400,f1:1800,d:0.12,g:0.06}],['nz',{t:'highpass',f0:5000,f1:4000,d:0.15,g:0.2}]],
  ice_slide:[['nz',{t:'bandpass',f0:4000,f1:2500,q:3,d:0.3,a:0.05,g:0.1}]],
  grass_rustle:[['nz',{t:'bandpass',f0:2500,f1:1800,q:1.2,d:0.18,a:0.03,g:0.18}]],
  shallows_splash:[['nz',{t:'lowpass',f0:1500,f1:600,d:0.15,a:0.005,g:0.3}],['sin',{f:400,f1:900,d:0.05,g:0.05,at:0.02}]],
  arena_gong:[['th',{f0:55,f1:50,d:0.8,g:0.6}],['sin',{f:110,d:1.5,g:0.12}],['sin',{f:165,d:1.2,g:0.06}],['sin',{f:233,d:0.9,g:0.05}]],
  temple_rumble:[['nz',{t:'lowpass',f0:200,f1:120,d:1.2,a:0.3,g:0.5}],['th',{f0:45,f1:35,d:1.0,g:0.4}]],
  kill_burst:[['nz',{t:'lowpass',f0:900,f1:300,d:0.14,a:0.003,g:0.5}],['th',{f0:90,f1:40,d:0.14,g:0.55}],['mat',{g:0.45}]],
  crit_crunch:[['tr',{hp:2800,d:0.005,g:0.5}],['nz',{t:'bandpass',f0:1800,f1:900,q:2,d:0.06,g:0.4}],['nz',{t:'bandpass',f0:1400,f1:700,q:2,d:0.05,g:0.35,at:0.02}],['th',{f0:100,f1:45,d:0.12,g:0.5}]],
  hit_fin:[['th',{f0:70,f1:32,d:0.25,g:0.7}],['nz',{t:'lowpass',f0:900,f1:200,d:0.25,a:0.004,g:0.45}]],
  skill_boom:[['tr',{hp:2400,d:0.006,g:0.5}],['th',{f0:75,f1:32,d:0.28,g:0.7}],['nz',{t:'lowpass',f0:1100,f1:220,d:0.3,a:0.004,g:0.45}]],
  deflect:[['tr',{hp:3800,d:0.004,g:0.45}],['mat',{m:'shell',g:0.45}],['sin',{f:2200,f1:2100,d:0.12,g:0.04}]],
  tell_lock:[['tr',{hp:4200,d:0.003,g:0.25}],['sin',{f:1760,f1:2637,d:0.15,g:0.05}]],
  jaw_snap:[['tr',{hp:2500,d:0.005,g:0.35}],['nz',{t:'bandpass',f0:1400,f1:900,q:2,d:0.05,g:0.25}]],
  spore_puff:[['nz',{t:'lowpass',f0:1200,f1:500,d:0.12,a:0.01,g:0.3}],['sin',{f:500,f1:900,d:0.06,g:0.05}]],
  ui_open:[['nz',{t:'bandpass',f0:1800,f1:1200,q:1,d:0.08,a:0.01,g:0.16}],['bd',{w:'triangle',f0:500,f1:620,d:0.05,g:0.04}]],
  ui_close:[['nz',{t:'bandpass',f0:1200,f1:1700,q:1,d:0.07,a:0.01,g:0.14}]],
  ui_tab:[['nz',{t:'bandpass',f0:2200,f1:1800,q:1.2,d:0.05,a:0.005,g:0.13}]],
  ui_tick:[['tr',{hp:5000,d:0.003,g:0.14}],['bd',{w:'triangle',f0:1800,f1:1750,d:0.03,g:0.025}]],
  explorer_send:[['nz',{t:'lowpass',f0:800,f1:400,d:0.5,a:0.1,g:0.2}],['nz',{t:'lowpass',f0:800,f1:400,d:0.5,a:0.1,g:0.18,at:0.6}]],
  net_cast:[['nz',{t:'bandpass',f0:1500,f1:600,q:1,d:0.3,a:0.05,g:0.25}],['nz',{t:'lowpass',f0:1200,f1:400,d:0.2,a:0.005,g:0.25,at:0.42}]],
  rope_snap:[['tr',{hp:2500,d:0.005,g:0.4}],['nz',{t:'bandpass',f0:2000,f1:800,q:1.5,d:0.1,g:0.3}]],
  harpoon_throw:[['nz',{t:'bandpass',f0:800,f1:2000,q:1.2,d:0.2,a:0.03,g:0.3}]],
  hull_hit:[['th',{f0:70,f1:35,d:0.25,g:0.7}],['nz',{t:'lowpass',f0:500,f1:200,d:0.2,g:0.4}],['mat',{m:'stone',g:0.4}]],
  ground_scrape:[['th',{f0:60,f1:35,d:0.3,g:0.6}],['nz',{t:'lowpass',f0:700,f1:200,d:0.35,a:0.01,g:0.4}]],
  repair:[0,0.18].flatMap(t=>[['tr',{hp:2400,d:0.005,g:0.35,at:t}],['nz',{t:'bandpass',f0:900,f1:700,q:1.5,d:0.06,g:0.3,at:t}]]),
  buoy_drop:[['nz',{t:'lowpass',f0:1000,f1:300,d:0.3,a:0.005,g:0.3}],['sin',{f:300,f1:150,d:0.1,g:0.06}]],
  landfall:[['nz',{t:'lowpass',f0:900,f1:350,d:0.3,a:0.02,g:0.25}],['th',{f0:100,f1:60,d:0.1,g:0.3,at:0.12}]],
  port_arrive:[['nz',{t:'lowpass',f0:600,f1:300,d:0.4,a:0.1,g:0.25}],['th',{f0:90,f1:60,d:0.12,g:0.3,at:0.25}]],
  door_in:[['th',{f0:120,f1:80,d:0.1,g:0.3}],['nz',{t:'bandpass',f0:700,f1:500,q:1.5,d:0.12,g:0.2}]],
  door_out:[['nz',{t:'bandpass',f0:600,f1:800,q:1.5,d:0.1,g:0.2}],['th',{f0:110,f1:70,d:0.08,g:0.3,at:0.08}]],
  crew_grumble:[['bd',{w:'sawtooth',f0:120,f1:90,d:0.3,a:0.03,g:0.06,lp:500}]],
  talk_blip:[['nz',{t:'bandpass',f0:1300,f1:1000,q:3,d:0.025,a:0.002,g:0.22}],['bd',{w:'triangle',f0:640,f1:760,d:0.03,g:0.03,lp:1500}]],   // (G11 fix: a soft "tk", the tone at half under it — not a beep)
  hex_deal:[0,0.07,0.14].map(t=>['nz',{t:'bandpass',f0:3000,f1:2500,q:1.5,d:0.06,g:0.14,at:t}]),
  hex_rotate:[['nz',{t:'bandpass',f0:3500,f1:3000,q:1.5,d:0.04,g:0.13}]],
  hex_place:[['tr',{hp:3000,d:0.004,g:0.3}],['nz',{t:'bandpass',f0:1500,f1:1200,q:1.2,d:0.05,g:0.2}]],
  /* (PT1 A1 — the old-beep redesigns SFX_SYN leans on, moved up from A2: sw_bow_fin → volley · eat → heart) */
  heart:[['bd',{w:'triangle',f0:659,f1:659,d:0.09,g:0.07}],['bd',{w:'triangle',f0:880,f1:880,d:0.16,g:0.07,at:0.08}],['sin',{f:1760,d:0.14,g:0.02,at:0.08}]],   // a warm two-note lift (a meal · a draught)
  volley:[0,0.035,0.07].flatMap(t=>[['tr',{hp:3200,d:0.005,g:0.4,at:t}],['bd',{w:'triangle',f0:720,f1:270,d:0.06,g:0.06,at:t}],['nz',{t:'bandpass',f0:2600,f1:1300,q:1.2,d:0.06,a:0.004,g:0.2,at:t}]]).concat([['nz',{t:'highpass',f0:3000,f1:2200,d:0.13,a:0.004,g:0.12}],['bd',{w:'sine',f0:165,f1:120,d:0.15,g:0.04}],['th',{f0:150,f1:90,d:0.14,g:0.14}]]),   // three strings let go in a ripple (G11 fix: as the softened bow_release — twang low & quiet, the air of the shafts, one thrum · its weight from a thump, not a louder "pew")
  /* (PT1 A2 — pt1_audio §3.5.5: the last old beeps, redesigned) */
  first:[['bd',{w:'triangle',f0:784,f1:784,d:0.12,g:0.07}],['bd',{w:'triangle',f0:1175,f1:1175,d:0.3,g:0.07,at:0.1}],['sin',{f:2349,d:0.3,g:0.025,at:0.1}],['nz',{t:'highpass',f0:6000,f1:7000,d:0.5,a:0.1,g:0.03}]],   // a first meeting: a fifth rising & a shimmer
  rarekill:[[523,0],[784,0.06],[1047,0.12]].map(([f,t],i)=>['bd',{w:'triangle',f0:f,f1:f,d:i<2?0.07:0.22,g:0.08,at:t}]).concat([['tr',{hp:3000,d:0.005,g:0.3}]]),   // a magic or rare foe falls: a quick triad
  stamp:[['th',{f0:95,f1:48,d:0.16,g:0.6}],['nz',{t:'lowpass',f0:400,f1:250,d:0.1,g:0.35}]],                                                                    // the ledger's name stamp — a dull thump
  heavy:[['nz',{t:'bandpass',f0:900,f1:350,q:1.1,d:0.2,a:0.05,g:0.45}],['th',{f0:70,f1:45,d:0.2,g:0.4}]],                                                       // a boss winds up something big
  chip:[['bd',{w:'square',f0:300,f1:220,d:0.05,g:0.06,lp:1200}],['nz',{t:'bandpass',f0:1500,f1:1000,q:1.2,d:0.04,g:0.15}]],                                     // a swarm's nip (a siphon)
  ground_thud:[['th',{f0:85,f1:38,d:0.18,g:0.7}],['nz',{t:'lowpass',f0:600,f1:200,d:0.16,a:0.004,g:0.45}],['nz',{t:'bandpass',f0:210,f1:160,q:1.3,d:0.06,g:0.4}],['mat',{m:'sand',g:0.22,at:0.01}]],   // a heavy body meets the ground: a dull thud, its body & a little grit (was an alias of thud — the old thunks' pitches went too low for it)
  /* (PT1 A1 — pt1_design §2.5) the crawl's kept ids & the deck's, where no alias fits */
  orb_charge:[['sin',{f:300,f1:900,d:0.18,g:0.07}],['nz',{t:'bandpass',f0:900,f1:2200,q:1.5,d:0.18,a:0.08,g:0.1}]],                                          // the orb gathers: a rising tone & a soft rush
  fin_gather:[['nz',{t:'bandpass',f0:1800,f1:3200,q:1.4,d:0.12,a:0.06,g:0.14}]],                                                                              // a finisher winds up
  body_launch:[['nz',{t:'bandpass',f0:900,f1:400,q:1.2,d:0.15,a:0.01,g:0.3}]],                                                                                // a body flung through the air
  tide_crest:[['sin',{f:660,d:0.3,g:0.08}],['sin',{f:990,d:0.35,g:0.06,at:0.06}],['nz',{t:'lowpass',f0:1200,f1:500,d:0.45,a:0.12,g:0.16}]],                // the Tide crests: a fifth & a wash
  swarm_frenzy:[0,0.06,0.12].map(t=>['nz',{t:'bandpass',f0:3200,f1:2400,q:4,d:0.05,g:0.18,at:t}]),                                                             // the swarm's last few chitter & rush
  hide_on:[['sin',{f:220,f1:180,d:0.2,g:0.08}]],                                                                                                             // into the grass — out of sight
  drip:[['sin',{f:1400,f1:2200,d:0.06,g:0.05}],['sin',{f:900,f1:1300,d:0.04,g:0.02,at:0.03}]],                                                            // (PT1 A3) a drop off a cave's roof — the reverb carries it
  steam_hiss:[['nz',{t:'highpass',f0:4000,f1:4500,d:0.3,a:0.03,g:0.16}]],                                                                                    // fire meets water
  fall_chasm:[['sin',{f:600,f1:150,d:0.5,g:0.08}],['nz',{t:'bandpass',f0:1200,f1:400,q:1,d:0.5,a:0.05,g:0.15}]],                                             // a long fall away
  ship_bell:[['tr',{hp:3000,d:0.005,g:0.35}],['sin',{f:880,d:0.9,g:0.09}],['sin',{f:1320,d:0.6,g:0.05}]],                                                    // the ship's bell
  saw:[0,0.33].map(t=>['nz',{t:'bandpass',f0:1000,f1:1400,q:2,d:0.3,a:0.08,g:0.2,at:t}]),                                                                     // two strokes of a saw
  bed_rest:[[392,0],[330,0.2],[262,0.4]].map(([f,t])=>['sin',{f,d:0.5,g:0.05,at:t}]),                                                                          // settling in: three soft falling notes
  dawn:[['bd',{w:'triangle',f0:588,f1:588,d:0.12,g:0.07}],['bd',{w:'triangle',f0:881,f1:881,d:0.3,g:0.07,at:0.1}],['sin',{f:1762,d:0.3,g:0.025,at:0.1}],['nz',{t:'highpass',f0:6000,f1:7000,d:0.5,a:0.1,g:0.03}]] };   // a new day (the discovery chime's shape, a 4th lower)
const SFX_OLD={swing_sword:'slash', swing_heavy:'heavy', bow_release:'shoot', hit_flesh:'hit', hit_shell:'hit', hit_goo:'hit', hit_stone:'hit', hit_crit:'hit', kill_pop:'pop', kill_crunch:'crunch',
  stagger_break:'heavy', thud:'thunk', nope:'tink', flask:'heart', gong:'heavy', node_break:'break', tide_tick:'tink', tide_full:'legend', flask_full:'heart',
  block:'tink', hurt_light:'chip', hurt_heavy:'hurt', ko:'thunk', venom:'chip', frost:'tink', boss_roar:'howl', loot_sg:'trk', loot_coral:'trk', loot_pearl:'legend', loot_abyss:'legend',
  swing_axe:'heavy', thrust:'slash', dagger:'slash', bow_draw:'tink', cast_bolt:'shoot', slam:'thunk', storm:'tink', fire:'chip',
  chain_whirr:'slash', chain_thunk:'thunk', cannon:'thunk', foghorn:'howl', gurgle:'chip', wet_slap:'thunk', gem_level:'lvl', shrine_gamble:'tink', prosp_up:'lvl', forge:'thunk', brew:'heart', secret:'streak', shrine:'lvl', whistle:'tink',
  tell_snort:'-', tell_growl:'-', tell_click:'-', tell_hiss:'-', tell_hum:'-', bark_grunt:'-', bark_yip:'-', bark_click:'-', bark_croak:'-', bark_chitter:'-', bark_hoot:'-',   // (C9: the old game had no tells or barks — '-' = silent under the Legacy feel)
  gem_drop:'trk', node_hit:'tink', geode:'break', secure2:'secure', secure3:'secure', secure4:'secure', claim:'secure', ui_click:'tink', ui_equip:'tink', ui_ok:'secure',
  chart_ink:'-', sail_set:'-', waypoint_set:'-', waypoint_clear:'-', explorer_none:'-', drag_pick:'-', drag_drop:'-', drag_bad:'-', drag_salvage:'-', drag_sell:'-',   // (sfxLegacy: the new names fall back to the old beeps · PT1: '-' = a sound the old game never had)
  barrel_boom:'-', barrel_hit:'-', barrel_fuse:'-', crate_hit:'-', crate_break:'-', rock_warn:'-', rock_fall:'-', trap_arm:'-', trap_spike:'-', trap_dart:'-', dart_hit:'-', arrow_hit:'-', pillar_crack:'-', pillar_fall:'-',   // (PT1 A1: every new id)
  bridge_creak:'-', bridge_snap:'-', lava_hiss:'-', bog_bubble:'-', bog_squelch:'-', ice_crack:'-', ice_slide:'-', grass_rustle:'-', shallows_splash:'-', arena_gong:'-', temple_rumble:'-', kill_burst:'-', crit_crunch:'-', hit_fin:'-', skill_boom:'-',
  deflect:'tink', tell_lock:'tink', jaw_snap:'snap', spore_puff:'cast', ui_open:'tink', ui_close:'-', ui_tab:'tink', ui_tick:'tink', explorer_send:'cast', net_cast:'cast', rope_snap:'snap', harpoon_throw:'shoot', hull_hit:'thunk', ground_scrape:'thunk', repair:'thunk', buoy_drop:'cast',   // (PT1 A2: a split old beep's ids keep that beep under the Legacy feel)
  landfall:'land', port_arrive:'land', door_in:'land', door_out:'tink', crew_grumble:'snap', talk_blip:'pop', hex_deal:'tink', hex_rotate:'tink', hex_place:'tink', orb_charge:'-', fin_gather:'-', body_launch:'-', tide_crest:'-', swarm_frenzy:'-', hide_on:'-',
  steam_hiss:'-', fall_chasm:'-', ship_bell:'-', saw:'-', bed_rest:'-', dawn:'-',
  sw_sword:'-', sw_sword_fin:'-', sw_axe:'-', sw_axe_fin:'-', sw_spear:'-', sw_spear_fin:'-', sw_dagger:'-', sw_dagger_fin:'-', sw_bow_fin:'-', sw_staff:'-', sw_staff_fin:'-', body_thud:'-', ledge_land:'-', ground_thud:'thunk',   // (the SFX_SYN ids)
  ledge_jump:'-', guard_up:'tink', tell_bristle:'tink', talk_open:'-', coin_sell:'chest', iron_stick:'thunk', eat:'heart', bow_draw_full:'-', orb_burst:'-', multi_kill:'-', last_stand:'-', scramble:'-', cover_break:'-', ambush_crit:'-', zap_water:'-',
  splash_fall:'-', helm_leave:'-', helm_take:'-', rigging_creak:'-', hatch:'-', anchor_chain:'-', decor_place:'-', fish_bite:'-', reel_click:'-', line_cast:'-', mop_swish:'-', cook:'-', sea_chest:'-', drip:'-', dash_perfect:'-'};
const SFX_OLDP={talk_blip:0.5, harpoon_throw:0.6, hex_deal:0.6, hex_rotate:0.5, crew_grumble:0.5, door_in:0.7, door_out:0.7, ui_open:0.8, tell_lock:1.9, guard_up:1.55, tell_bristle:1.3, ground_thud:0.6};   // (G11 fix) the Legacy feel: a split id's call pitch × this = the old call's (ground_thud & ui_open: the usual one of several)
const SFX_LEN={boss_roar:1.15, loot_pearl:0.95, loot_abyss:1.45, cannon:0.95, foghorn:0.95, gurgle:0.8, shrine_gamble:0.75, secret:0.75, shrine:0.95, whistle:0.95,   // a recipe longer than the pool's flat 0.4 s voice (so a steal can't cut it early)
  tell_hum:0.55, lvl:0.7, secure:0.55, secure2:0.55, secure3:0.55, secure4:0.55, claim:2.45, howl:0.65, raise:0.5, chest:0.5, geode:0.4, chart_ink:0.55, sail_set:0.45,
  barrel_boom:0.65, pillar_fall:0.75, arena_gong:1.5, temple_rumble:1.25, rock_fall:0.4, bridge_creak:0.45, explorer_send:1.1, net_cast:0.65, port_arrive:0.4,   // (PT1 A1)
  barrel_fuse:0.65, lava_hiss:0.45, tide_crest:0.5, fall_chasm:0.55, ship_bell:0.95, saw:0.65, bed_rest:0.95, dawn:0.55, first:0.55};
/* (PT1 A1 — SOUND 3.0, pt1_audio §3.4-§3.5) SFX_SYN: a new id's synth fallback = an existing recipe [recipe, pitch ×, gain ×] (every target must be an SFX2 row) ·
   SFX_ALIAS: another chunk's name → the canonical id (kept empty) · SFX_MAP: an id's recorded voice — s set · l [[set, gain, delay ms, rate ×]] · lb the same, blades only ·
   g gain · p [rate lo, hi] · gj ±dB · y the synth kept under it ('th' / 'th|bd' kinds · 'all' · a recipe) · yg its gain · m live voices · b bus cmb|wld|ui · pr steal priority ·
   st {step: set | {s, g}} · sv {v|mat: set | {s, l, r, g}} (a variant's own set · layers in place of l · rate × · gain × g — sndCal fits it) · k KEEP (synth only) · kl {mat: [set, gain]} ·
   pos 0 = never panned. SFX_SETS: set → its file keys under sfx/ (t load tier · alt · ar alt's rate · x no files of its own: it plays its alt). */
const SFX_SYN={ sw_sword:['swing_sword',1,1], sw_sword_fin:['swing_heavy',1,1.1], sw_axe:['swing_axe',1,1], sw_axe_fin:['swing_heavy',0.85,1.1],
  sw_spear:['thrust',1,1], sw_spear_fin:['swing_heavy',1.1,1], sw_dagger:['dagger',1,1], sw_dagger_fin:['dagger',0.8,1.2],
  sw_bow_fin:['volley',1,1], sw_staff:['cast_bolt',1,1], sw_staff_fin:['cast_bolt',0.8,1.3], body_thud:['thud',0.9,0.9], ledge_land:['thud',1,0.8],
  ledge_jump:['dash',0.8,0.6], guard_up:['block',1.2,0.6], tell_bristle:['tell_click',1.3,1], talk_open:['ui_open',1,1], coin_sell:['ui_ok',1,1], iron_stick:['dart_hit',1,1], eat:['heart',1,1],
  bow_draw_full:['bow_draw',0.8,1.2], orb_burst:['slam',1.2,1], multi_kill:['kill_crunch',1,1], last_stand:['howl',0.9,1], scramble:['dash',1.4,1], cover_break:['node_break',0.8,1],   // (pt1_design §2.5: the crawl's kept ids)
  ambush_crit:['crit_crunch',1.1,1], zap_water:['storm',1.3,1], splash_fall:['wet_slap',0.8,1],
  helm_leave:['door_out',0.9,1], helm_take:['sail_set',1,1], rigging_creak:['bridge_creak',0.7,1], hatch:['door_in',0.8,1], anchor_chain:['chain_whirr',0.8,1], decor_place:['drag_drop',0.8,1],   // (… & the deck's)
  fish_bite:['wet_slap',1.4,1], reel_click:['ui_tick',1.3,1], line_cast:['harpoon_throw',1.3,1], mop_swish:['grass_rustle',0.8,1], cook:['brew',0.5,1], sea_chest:['chest',1,1] };
const SFX_ALIAS={};
const SFX_MAP={   /* (A1: the combat core — your weapons, the impacts & kills · A2 maps the rest) */
  swing_sword:{s:'sw_l', st:{2:{s:'sw_blade', g:0.66}}, l:[['sw_blade',0.3,0,1]], g:0.12, p:[0.95,1.05], m:3},
  swing_heavy:{s:'sw_h', l:[['sw_rope',0.5,0,1]], g:0.32, p:[0.92,1.02], y:'th', m:2},
  swing_axe:{s:'sw_sheet', l:[['sw_h',0.4,0,1]], g:0.13, p:[0.90,1.00], y:'th', yg:0.6, m:2},
  thrust:{s:'sw_bamboo', g:0.41, p:[0.98,1.10], m:3},
  dagger:{s:'sw_l', l:[['knife',0.3,0,1]], g:0.29, p:[1.15,1.30], m:4},
  bow_draw:{s:'leather', g:0.088, p:[0.95,1.05], y:'all', yg:0.5, m:1},
  bow_release:{s:'bow_rel', g:0.48, p:[0.96,1.04], m:3},
  cast_bolt:{s:'sw_tube', l:[['spell',0.4,0,1]], g:0.09, p:[1.00,1.12], m:3},
  whirl:{s:'sw_rope', l:[['sw_rope',0.8,170,1]], g:0.12, p:[0.95,1.05], m:1},
  dash:{s:'cloth', l:[['sw_l',0.5,0,1]], g:0.16, p:[1.05,1.20], m:2},
  dash_perfect:{s:'sw_rope', l:[['sparkle',0.22,0,1.3]], g:0.14, p:[1.25,1.38], y:'sin', yg:0.9, m:2},   // (PT2 X2) the perfect dash: a fast rope whoosh, a sparkle's shimmer & the synth's glint kept under them (g by sndCal: its synth + 1 dB, ≈ 2 dB over the plain dash)
  slam:{s:'boom_far', l:[['stone',0.6,10,1],['rubble',0.5,40,1]], g:0.99, p:[0.85,0.95], y:'th', m:1},
  hit_flesh:{s:'hit_fl', lb:[['hit_blade',0.35,0,1]], g:0.58, p:[0.92,1.08], y:'th', m:4},
  hit_shell:{s:'hit_sh', l:[['hit_helm',0.5,0,1]], g:0.49, p:[0.95,1.10], y:'th', yg:0.6, m:4},
  hit_goo:{s:'hit_so', l:[['spl_s',0.35,0,1.3]], g:0.69, p:[0.90,1.10], y:'th', yg:0.5, m:4},
  hit_stone:{s:'hit_st', l:[['stone',0.5,0,1]], g:1.28, p:[0.90,1.05], y:'th', m:4},
  hit_crit:{s:'hit_fl', sv:{shell:'hit_sh', goo:{s:'hit_so', g:1.12}, wet:{s:'hit_so', g:1.25}, sand:{s:'hit_st', g:1.89}, stone:{s:'hit_st', g:1.83}}, l:[['bone',0.7,4,1],['slice',0.4,0,1]], g:0.53, p:[0.95,1.02], y:'th|bd', m:3},   // (the struck material's hit + a crunch)
  kill_pop:{s:'hit_so', g:0.197, p:[1.20,1.40], m:4},
  kill_crunch:{s:'hit_flh', l:[['bone',0.5,5,1]], g:0.65, p:[0.90,1.05], y:'th', m:3},
  stagger_break:{s:'clang', l:[['hit_mth',0.5,0,1]], g:0.48, p:[0.90,1.00], y:'th|sin', yg:1.7, m:1},   // (GA fix — GAV-B05: its synth's 70 Hz thump under the clang too — the low end within 1 dB of the synth's)
  thud:{s:'hit_soh', l:[['hit_wdh',0.4,0,1]], g:0.4, p:[0.90,1.00], y:'th', m:2},
  block:{s:'clang', l:[['hit_mtm',0.5,0,1]], g:0.27, p:[0.95,1.08], y:'th', yg:2.5, m:2},   // (GA fix — GAV-B05: a metal impact & the synth's thump (yg 0.4 → 2.5) under the clang — its < 250 Hz back within 3.3 dB of the synth's, not 17 under)
  nope:{s:'hit_wdl', g:0.16, p:[0.80,0.90], y:'all', yg:0.6, m:1, b:'ui'},
  hurt_light:{s:'hit_fl', g:0.14, p:[1.00,1.15], y:'all', yg:0.5, m:2},
  hurt_heavy:{s:'hit_flh', g:0.48, p:[0.85,0.95], y:'th', m:2},
  ko:{s:'hit_soh', g:0.82, p:[0.80,0.80], y:'all', yg:0.7, m:1},
  chip:{s:'hit_fl', g:0.08, p:[1.25,1.40], m:2},
  heavy:{s:'sw_h', l:[['boom_far',0.4,60,1]], g:0.52, p:[0.75,0.85], m:1},
  volley:{s:'bow_rel', l:[['bow_rel',0.9,35,1],['bow_rel',0.8,70,1]], g:0.46, p:[0.95,1.06], m:1},
  rarekill:{s:'bone', g:0.35, p:[0.95,1.05], y:'all', m:1},
  /* (PT1 A2 — pt1_audio §3.5.3: the rest) statuses & gem signatures */
  venom:{s:'bubbles', l:[['vox_spit',0.3,0,1]], g:0.39, p:[1.10,1.30], y:'all', yg:0.5, m:1}, frost:{s:'glass', l:[['uiglass',0.3,20,1]], g:0.29, p:[0.60,0.70], y:'all', yg:0.5, m:1},
  fire:{s:'fire', g:0.154, p:[0.90,1.10], m:1}, flask:{s:'bubbles', g:0.24, p:[1.25,1.35], y:'all', yg:0.6, m:1}, chain_whirr:{s:'chain_h', l:[['sw_rope',0.4,0,1]], g:0.143, p:[0.95,1.05], m:1},
  chain_thunk:{s:'hit_mth', l:[['stone',0.6,6,1]], g:0.85, p:[0.90,1.00], y:'th', m:2}, cannon:{s:'boom', g:0.9, p:[0.90,1.00], y:'sin', m:2}, gurgle:{s:'bubbles', l:[['bubbles',0.8,300,1]], g:0.117, p:[0.80,0.95], m:1},
  wet_slap:{s:'spl_s', l:[['hit_soh',0.6,0,1]], g:0.43, p:[0.85,1.00], y:'th', m:2}, shrine_gamble:{s:'dice_sh', l:[['dice',0.8,350,1]], g:0.7, p:[0.95,1.05], y:'sin', m:1, b:'wld'},
  /* enemies — tells, barks, bosses (G11 fix: a telegraph — the tells, tell_bristle/lock, guard_up, jaw_snap, ground_thud — is pr 3: never dropped in a crowded frame) */
  tell_snort:{s:'vox_grunt', g:0.056, p:[0.70,0.80], m:2, pr:3}, tell_growl:{s:'vox_beast', g:0.05, p:[0.75,0.90], m:2, pr:3}, tell_click:{s:'hit_mt', l:[['hit_mt',0.8,80,1]], g:0.149, p:[1.55,1.80], m:2, pr:3},
  tell_hiss:{s:'vox_spit', g:0.47, p:[0.90,1.10], y:'all', yg:0.5, m:2, pr:3}, bark_grunt:{s:'vox_grunt', g:0.066, p:[0.85,1.05], m:2}, bark_yip:{s:'vox_cute', g:0.04, p:[0.90,1.10], m:2},
  bark_click:{s:'hit_mt', l:[['hit_mt',0.8,60,1]], g:0.064, p:[1.40,1.60], m:2}, bark_croak:{s:'vox_slime', g:0.096, p:[0.85,1.00], m:2}, bark_chitter:{s:'vox_bug', g:0.22, p:[1.00,1.20], m:2},
  bark_hoot:{s:'vox_weird', g:0.145, p:[0.90,1.05], m:2}, boss_roar:{s:'vox_roar', l:[['vox_beast',0.5,40,1]], g:0.24, p:[0.60,0.70], y:'all', yg:0.6, m:1}, howl:{s:'vox_wolf', g:0.07, p:[0.90,1.10], m:1},
  raise:{s:'stonedrag', l:[['vox_weird',0.4,100,0.6]], g:0.2, p:[0.90,1.00], y:'all', yg:0.5, m:1}, dig:{s:'rubble', l:[['hit_so',0.5,0,1]], g:0.3, p:[0.75,0.90], y:'th', m:2, b:'wld'},
  /* the crawl's objects, loot handling, UI */
  node_hit:{s:'mine', sv:{leaf:{s:'twigs', g:4.26}}, g:0.17, p:[0.92,1.08], m:3, b:'wld'}, node_break:{s:'rubble', sv:{leaf:{s:'twigs', l:[['cloth',0.5,0,1]], g:1.55}}, l:[['mine',0.6,0,1]], g:0.54, p:[0.90,1.00], y:'th', m:2, b:'wld'},
  geode:{s:'rubble', l:[['glass_m',0.6,40,1]], g:0.6, p:[0.95,1.05], y:'sin', m:1, b:'wld'}, prosp_up:{s:'mine', g:0.39, p:[1,1], y:'sin', m:1, b:'wld'},
  chest:{s:'creak', l:[['latch',0.6,0,1]], g:0.23, p:[1.10,1.25], y:'sin', m:2, b:'wld'}, secret:{s:'stonedrag', l:[['rubble',0.6,400,1]], g:1.42, p:[0.85,0.95], y:'nz', yg:0.6, m:1, b:'wld'},
  forge:{s:'anvil', g:0.184, p:[0.97,1.03], y:'sin', yg:0.4, m:2, b:'wld'}, brew:{s:'brew', l:[['bubbles',0.5,200,1]], g:0.18, p:[0.95,1.05], m:1, b:'wld'},
  stamp:{s:'bookp', l:[['hit_wdh',0.5,0,1]], g:0.7, p:[0.85,0.95], m:1, b:'ui'}, ui_click:{s:'click', g:0.12, p:[0.95,1.05], m:2, b:'ui'}, ui_equip:{s:'cloth', l:[['latch',0.7,20,1]], g:0.16, p:[0.95,1.05], y:'sin', yg:0.8, m:2, b:'ui'},
  /* the old beeps' call-site split */
  ui_open:{s:'book_o', sv:{menu:'book_o', shop:{s:'shopbell', g:0.24}, talk:'page', card:'page'}, g:0.14, p:[0.95,1.05], m:2, b:'ui'}, ui_close:{s:'book_c', g:0.066, p:[1,1], m:2, b:'ui'},
  ui_tab:{s:'page', g:0.09, p:[1.00,1.10], m:2, b:'ui'}, ui_tick:{s:'select', g:0.031, p:[0.95,1.10], m:2, b:'ui'}, deflect:{s:'clang', l:[['hit_mt',0.6,0,1]], g:0.146, p:[1.10,1.30], m:3},
  tell_bristle:{s:'hit_mt', l:[['tin',0.4,0,1]], g:0.18, p:[1.35,1.45], m:2, pr:3}, tell_lock:{s:'uiglass', l:[['sparkle',0.3,0,1]], g:0.101, p:[1.40,1.60], m:2, pr:3}, guard_up:{s:'clang', g:0.23, p:[1.15,1.25], m:2, pr:3},
  iron_stick:{s:'hit_arrow', l:[['spl_s',0.4,30,1]], g:0.54, p:[0.95,1.05], m:1, b:'wld'}, ground_scrape:{s:'hit_wdh', l:[['rockfall',0.5,30,1]], g:0.71, p:[0.90,1.00], y:'th', m:1, b:'wld'},
  hull_hit:{s:'hit_wdh', l:[['plank',0.6,10,1],['spl_b',0.4,60,1]], g:0.81, p:[0.85,1.00], y:'th', m:1, b:'wld'}, repair:{s:'hit_wd', l:[['hit_wd',0.9,180,1]], g:0.23, p:[0.95,1.05], m:1, b:'wld'},
  ground_thud:{s:'hit_soh', l:[['hit_wdh',0.3,0,1]], g:0.53, p:[0.85,1.00], y:'th', m:3, pr:3}, rope_snap:{s:'twigs', l:[['sw_l',0.3,0,1]], g:0.49, p:[1.10,1.30], m:2, b:'wld'},
  jaw_snap:{s:'vox_grunt', l:[['hit_wdl',1.4,0,1]], g:0.076, p:[1.15,1.25], y:'all', yg:1.9, m:3, pr:3}, crew_grumble:{s:'vox_grunt', g:0.048, p:[0.65,0.75], m:1, b:'ui'},
  landfall:{s:'spl_s', l:[['hit_soh',0.5,120,1]], g:0.29, p:[0.72,0.80], y:'th', yg:0.5, m:1, b:'wld'}, port_arrive:{s:'oars', l:[['gull',0.4,300,1]], g:0.23, p:[0.95,1.05], m:1, b:'wld'},
  door_in:{s:'door_o', g:0.26, p:[0.95,1.05], m:1, b:'wld'}, door_out:{s:'door_c', g:0.164, p:[0.95,1.05], m:1, b:'wld'}, net_cast:{s:'sw_rope', l:[['spl_s',0.6,450,1]], g:0.14, p:[1.05,1.15], m:1, b:'wld'},
  buoy_drop:{s:'spl_s', l:[['chain',0.4,0,1]], g:0.14, p:[0.95,1.05], m:1, b:'wld'}, explorer_send:{s:'oars', g:0.075, p:[1,1], m:1, b:'wld'}, spore_puff:{s:'hit_so', l:[['bubbles',0.4,0,1]], g:0.12, p:[1.30,1.50], m:2},
  talk_blip:{s:'pluck', g:0.05, p:[0.90,1.10], m:1, b:'ui'}, harpoon_throw:{s:'sw_rope', g:0.09, p:[1.15,1.25], m:1, b:'wld'},
  eat:{k:1, kl:{meal:['pot',0.4]}, b:'wld'}, first:{k:1, b:'ui'}, coin_sell:{s:'coins', l:[['chips',0.6,60,1]], g:0.24, p:[0.95,1.05], m:2, b:'ui'},
  hex_rotate:{s:'cslide', g:0.085, p:[1.15,1.25], m:1, b:'ui'}, hex_deal:{s:'cslide', l:[['cslide',0.8,70,1],['cslide',0.7,140,1]], g:0.121, p:[0.95,1.05], m:1, b:'ui'}, hex_place:{s:'card', g:0.22, p:[0.95,1.05], m:1, b:'ui'},
  /* the batch-1 ids */
  drag_pick:{s:'leather', g:0.096, m:2, b:'ui'}, drag_drop:{s:'drop', l:[['cloth',0.4,0,1]], g:0.17, m:2, b:'ui'}, drag_bad:{s:'hit_wdl', g:0.15, p:[0.76,0.84], m:1, b:'ui'},
  drag_sell:{s:'coins', l:[['chips',0.6,60,1]], g:0.25, m:2, b:'ui'}, drag_salvage:{s:'hit_mt', l:[['rubble',0.3,40,1]], g:0.21, m:1, b:'ui'}, waypoint_set:{s:'scratch', g:0.091, m:1, b:'ui'},
  waypoint_clear:{s:'scratch', g:0.027, p:[0.76,0.84], m:1, b:'ui'}, chart_ink:{s:'page', l:[['scratch',0.5,80,1]], g:0.17, m:1, b:'ui'}, explorer_none:{s:'hit_wdl', g:0.17, m:1, b:'ui'}, sail_set:{s:'sail', g:0.13, m:1, b:'wld'},
  /* the crawl & hazards — the naming contract (sw_spear's 2nd beat is a sweep: sw_l) */
  sw_sword:{s:'sw_l', st:{2:{s:'sw_blade', g:0.62}}, g:0.131, p:[0.96,1.06], m:3}, sw_sword_fin:{s:'sw_rope', l:[['sw_blade',0.5,20,1]], g:0.26, p:[0.92,1.00], y:'th', m:1},
  sw_axe:{s:'sw_sheet', g:0.13, p:[0.90,1.00], m:2}, sw_axe_fin:{s:'sw_rope', l:[['sw_h',0.6,0,1]], g:0.24, p:[0.90,1.00], y:'th', m:1},
  sw_spear:{s:'sw_bamboo', st:{2:'sw_l'}, g:0.4, p:[0.98,1.10], m:3}, sw_spear_fin:{s:'sw_stick', l:[['sw_tube',0.5,30,1]], g:0.29, p:[0.98,1.10], y:'th', m:1},
  sw_dagger:{s:'sw_l', l:[['knife',0.3,0,1]], g:0.32, p:[1.38,1.56], m:4}, sw_dagger_fin:{s:'slice', l:[['slice',0.9,40,1]], g:0.175, p:[1.15,1.30], m:1},
  sw_bow_fin:{s:'bow_rel', l:[['bow_rel',0.9,35,1],['bow_rel',0.8,70,1]], g:0.48, p:[0.95,1.06], m:1}, sw_staff:{s:'sw_tube', l:[['spell',0.4,0,1]], g:0.09, p:[1.00,1.12], m:3},
  sw_staff_fin:{s:'sw_tube', l:[['spell_fire',0.7,0,1],['boom_far',0.3,60,1]], g:0.098, p:[1.00,1.12], y:'th', m:1}, hit_fin:{s:'hit_flh', l:[['boom_far',0.35,8,1]], g:0.57, p:[0.90,1.00], y:'gong', m:2},
  crit_crunch:{s:'bone', l:[['hit_flh',0.5,0,1]], g:0.56, p:[0.95,1.05], y:'th', m:2}, skill_boom:{s:'hit_flh', l:[['boom',0.4,5,1]], g:0.59, p:[0.90,1.00], y:'th', m:2}, arrow_hit:{s:'hit_arrow', g:0.5, p:[0.95,1.10], m:3},
  kill_burst:{s:'hit_soh', l:[['spl_s',0.4,0,0.7]], g:0.49, p:[0.85,1.00], y:'th', m:2}, body_thud:{s:'hit_soh', l:[['hit_wdh',0.35,0,1]], g:0.42, p:[0.85,1.00], y:'th', yg:0.5, m:3},
  trap_arm:{s:'latch', g:0.17, p:[1.05,1.15], m:2}, trap_spike:{s:'hit_mt', l:[['hit_mt',0.8,25,1],['slice',0.5,10,1]], g:0.3, p:[0.95,1.05], y:'th', yg:0.4, m:2},
  trap_dart:{s:'sw_l', g:0.21, p:[1.40,1.60], m:3}, dart_hit:{s:'hit_arrow', g:0.66, p:[0.95,1.10], m:3}, rock_warn:{s:'rubble', g:0.12, p:[0.64,0.80], m:2}, rock_fall:{s:'rockfall', l:[['stone',0.6,20,1]], g:0.96, p:[0.80,1.00], y:'th', m:2},
  barrel_hit:{s:'hit_wd', g:0.6, p:[0.90,1.05], m:2}, barrel_fuse:{s:'fire', g:0.32, p:[1.26,1.47], m:1}, barrel_boom:{s:'boom', l:[['rubble',0.5,30,1],['hit_wdh',0.5,0,1]], g:0.93, p:[0.90,1.05], y:'th', m:2},
  crate_hit:{s:'hit_wd', g:0.49, p:[0.90,1.05], m:3}, crate_break:{s:'hit_wdh', l:[['twigs',0.6,10,1]], g:0.62, p:[0.90,1.05], y:'th', yg:0.5, m:2},
  pillar_crack:{s:'stone', l:[['stonedrag',0.5,0,1]], g:0.65, p:[0.85,1.00], m:2}, pillar_fall:{s:'rockfall', l:[['boom_far',0.5,50,1],['stonethud',0.6,200,1]], g:0.92, p:[0.85,1.00], y:'th', m:1},
  bridge_creak:{s:'creak', l:[['plank',0.3,80,1]], g:0.05, p:[0.70,0.90], m:1, b:'wld'}, bridge_snap:{s:'twigs', l:[['hit_wdh',0.8,0,1]], g:0.66, p:[0.90,1.00], y:'th', m:1, b:'wld'},
  drip:{k:1, b:'wld'},   // (PT1 A3: a cave's drips — wld, so the cave's reverb takes them · A4: the synth drip stays — its recorded source (Kenney Foley, D2) was declined)
  lava_hiss:{s:'fire', g:0.36, p:[0.65,0.75], m:2, b:'wld'}, bog_bubble:{s:'bubbles', g:0.12, p:[0.60,0.72], m:2, b:'wld'}, bog_squelch:{s:'hit_so', l:[['spl_s',0.3,0,1]], g:0.2, p:[0.53,0.63], m:2, b:'wld'},
  ice_crack:{s:'glass_h', g:0.89, p:[0.55,0.65], m:1, b:'wld'}, ice_slide:{s:'sw_l', g:0.07, p:[0.55,0.65], m:1, b:'wld'}, grass_rustle:{s:'cloth', l:[['twigs',0.2,0,1]], g:0.15, p:[1.20,1.40], m:2, b:'wld'},
  shallows_splash:{s:'spl_s', g:0.172, p:[0.80,1.10], m:2, b:'wld'}, ledge_jump:{s:'cloth', g:0.09, p:[0.90,1.10], m:1}, ledge_land:{s:'hit_soh', g:0.35, p:[0.90,1.10], y:'th', m:1},
  arena_gong:{s:'bellhit', g:0.94, p:[0.48,0.52], y:'gong', m:1}, temple_rumble:{s:'stonedrag', l:[['boom_far',0.5,100,1]], g:0.66, p:[0.55,0.65], y:'th', m:1, b:'wld'},
  /* the crawl's kept ids (pt1_design §2.5) */
  bow_draw_full:{s:'leather', l:[['sw_bamboo',0.3,0,1]], g:0.091, p:[0.76,0.84], m:1}, orb_charge:{s:'spell', g:0.08, p:[0.66,0.74], m:1}, orb_burst:{s:'boom_far', l:[['spell_fire',0.6,0,1]], g:0.91, p:[0.90,1.00], y:'th', m:1},
  fin_gather:{s:'sw_l', g:0.1, p:[1.33,1.47], m:1}, multi_kill:{s:'hit_flh', l:[['bone',0.5,5,1]], g:0.63, p:[0.90,1.05], y:'th', m:1}, body_launch:{s:'sw_h', g:0.093, p:[0.76,0.84], m:2},
  last_stand:{s:'vox_roar', l:[['boom_far',0.3,0,1]], g:0.078, p:[0.86,0.94], m:1}, swarm_frenzy:{s:'vox_bug', l:[['vox_bug',1,50,1],['vox_bug',1,100,1]], g:0.045, p:[1.00,1.20], m:1},
  scramble:{s:'cloth', l:[['rubble',0.4,0,1]], g:0.2, p:[0.95,1.05], m:1}, cover_break:{s:'rubble', sv:{wood:{s:'hit_wdh', l:[['twigs',0.6,0,1]], g:0.92}}, l:[['stone',0.6,0,1]], g:0.55, p:[0.90,1.00], y:'th', m:2},
  hide_on:{s:'cloth', g:0.16, p:[0.76,0.84], m:1, b:'wld'}, ambush_crit:{s:'bone', l:[['slice',0.6,0,1]], g:0.57, p:[0.95,1.05], m:2}, steam_hiss:{s:'fire', g:0.29, p:[1.43,1.57], m:1, b:'wld'},
  fall_chasm:{s:'sw_h', l:[['rubble',0.4,300,1]], g:0.24, p:[0.57,0.63], m:2, b:'wld'}, splash_fall:{s:'spl_b', g:0.38, p:[0.90,1.05], m:2, b:'wld'},
  /* the deck (batch 4 calls these) — saw & the mop stay synth */
  helm_leave:{s:'plank', g:0.28, p:[0.90,1.00], m:1, b:'wld'}, helm_take:{s:'sail', l:[['plank',0.4,0,1]], g:0.14, m:1, b:'wld'}, ship_bell:{s:'bellhit', g:0.37, p:[0.78,0.82], y:'sin', yg:0.5, m:1, b:'wld'},
  rigging_creak:{s:'creak', g:0.05, p:[0.58,0.62], m:1, b:'wld'}, hatch:{s:'door_o', l:[['plank',0.5,0,1]], g:0.22, p:[0.78,0.82], m:1, b:'wld'}, anchor_chain:{s:'chain_h', l:[['chain',0.6,120,1]], g:0.093, p:[0.90,1.00], m:1, b:'wld'},
  decor_place:{s:'drop', l:[['plank',0.4,0,1]], g:0.17, m:2, b:'wld'}, fish_bite:{s:'spl_s', g:0.69, p:[1.20,1.40], m:1, b:'wld'}, reel_click:{s:'tick', g:0.124, p:[1.20,1.40], m:2, b:'wld'},
  line_cast:{s:'sw_rope', l:[['spl_s',0.4,400,1]], g:0.117, p:[1.20,1.35], m:1, b:'wld'}, saw:{k:1, b:'wld'}, mop_swish:{k:1, b:'wld'}, cook:{s:'pot', l:[['fire',0.4,0,1]], g:0.056, m:1, b:'wld'},
  bed_rest:{s:'cloth', g:0.23, p:[0.85,0.95], m:1, b:'wld'}, dawn:{k:1, b:'wld'}, sea_chest:{s:'creak', l:[['latch',0.6,0,1]], g:0.23, p:[1.10,1.25], m:1, b:'wld'},
  /* the KEEP list (§3.5.1 — the owner likes these: synth only) */
  loot_sg:{k:1}, loot_coral:{k:1}, loot_pearl:{k:1}, loot_abyss:{k:1}, gem_drop:{k:1}, gem_level:{k:1}, lvl:{k:1}, secure:{k:1}, secure2:{k:1}, secure3:{k:1}, secure4:{k:1}, streak:{k:1},
  tide_tick:{k:1}, tide_full:{k:1}, flask_full:{k:1}, ui_ok:{k:1, b:'ui'}, shrine:{k:1, b:'wld'}, whistle:{k:1, b:'wld'}, foghorn:{k:1, b:'wld'}, tell_hum:{k:1, pr:3}, storm:{k:1}, claim:{k:1}, tide_crest:{k:1}, zap_water:{k:1},
  pick:{k:1, kl:{coin:['coins',0.35], glass:['glass',0.3], stone:['stone',0.3], leaf:['twigs',0.25]}} };
const SFX_SETS={   /* (PT1 A4: filled from the installed pack — boats/sfx, its key list SFX_FILES · more takes where a pack had them (the owner's "repetitive") · x: its source
     was declined (Kenney Foley, D2) and nothing approved replaces it → no files of its own: it plays its alt, else the synth) */
  sw_l:{f:'sw/l0-4',t:0}, sw_h:{f:'sw/h0-5 sw/sw0-3',t:0}, sw_blade:{f:'sw/bl0-3',t:0}, sw_rope:{f:'sw/rope0-5',t:0}, sw_stick:{f:'sw/stick0-2 sw/bamboo0',t:0}, sw_bamboo:{f:'sw/bamboo0-2 sw/stick0',t:0},
  sw_sheet:{f:'sw/sheet0-3',t:0}, sw_tube:{f:'sw/tube0-5',t:0}, bow_rel:{f:'sw/bow0-3',t:0}, knife:{f:'sw/knife0-3',t:0}, slice:{f:'sw/slice0-3',t:0},   // (GA fix — GAV-B03: a weapon's swing & finisher sets ≥ 4 takes)
  hit_fl:{f:'hit/fl0-4',t:0}, hit_flh:{f:'hit/flh0-4',t:0}, hit_sh:{f:'hit/sh0-4',t:0}, hit_helm:{f:'hit/helm0-4',t:0,alt:'hit_sh'}, hit_st:{f:'hit/st0-3',t:0,alt:'stone'},
  hit_blade:{f:'hit/bl0-3',t:0,alt:'slice'}, hit_so:{f:'hit/so0-4',t:0}, hit_soh:{f:'hit/soh0-4',t:0}, hit_wd:{f:'hit/wd0-4',t:1}, hit_wdh:{f:'hit/wdh0-4',t:1}, hit_wdl:{f:'hit/wdl0-4',t:1},
  hit_mt:{f:'hit/mt0-4',t:0}, hit_mtm:{f:'hit/mtm0-4',t:0}, hit_mth:{f:'hit/mth0-4',t:0}, clang:{f:'hit/cl0-5',t:0,alt:'hit_mtm'}, bone:{f:'hit/bone0-4',t:0}, hit_arrow:{f:'hit/ar0-4',t:0,alt:'hit_wd'},
  mine:{f:'wld/mine0-4',t:1}, stone:{f:'wld/st0-6',t:1}, rubble:{f:'wld/rb0-3',t:1}, stonedrag:{f:'',x:1,t:1,alt:'rockfall',ar:0.6}, stonethud:{f:'wld/dh0',t:1}, plank:{f:'wld/pl0-4',t:1},
  glass:{f:'wld/gl0-4',t:1}, glass_m:{f:'wld/gm0-2',t:1}, glass_h:{f:'wld/gh0-2',t:1}, bellhit:{f:'wld/be0-2',t:1}, tin:{f:'wld/tn0-1',t:1}, creak:{f:'wld/cr0-2',t:1}, latch:{f:'wld/la0-1',t:1},
  door_o:{f:'wld/do0-1',t:2}, door_c:{f:'wld/dc0-3',t:2}, pot:{f:'wld/po0-2',t:2}, anvil:{f:'wld/an0-3',t:2}, brew:{f:'wld/bw0',t:2}, shopbell:{f:'wld/sb0',t:2}, oars:{f:'wld/oa0-1',t:2},
  dice_sh:{f:'wld/ds0',t:2}, dice:{f:'wld/di0-2',t:2}, gull:{f:'wld/gu0-5',t:2}, rockfall:{f:'wld/rf0-2',t:1}, twigs:{f:'wld/tw0-3',t:1}, sail:{f:'wld/sa0-1',t:1},
  spl_s:{f:'wat/ss0-3',t:1}, spl_b:{f:'wat/sb0-1',t:1}, bubbles:{f:'wat/bu0-3',t:1}, boom:{f:'boom/b0-3',t:1}, boom_far:{f:'boom/f0-3',t:1}, thunder:{f:'boom/th0-7',t:2},   // (GA fix — GAV-B02: 8 claps, 4 of them far)
  spell:{f:'mag/sp0-3',t:1}, spell_fire:{f:'mag/sf0-3',t:1}, fire:{f:'mag/fi0-3',t:1}, sparkle:{f:'mag/sk0-3',t:1}, chain:{f:'mag/ch0-2',t:1}, chain_h:{f:'mag/chh0-3',t:1},
  vox_grunt:{f:'vox/gr0-4',t:1}, vox_roar:{f:'vox/ro0-3',t:1}, vox_slime:{f:'vox/sl0-3',t:1}, vox_cute:{f:'vox/cu0-4',t:1}, vox_weird:{f:'vox/we0-3',t:1}, vox_spit:{f:'vox/sp0-3',t:1},
  vox_beast:{f:'vox/be0-3',t:1}, vox_wolf:{f:'vox/wo0-3',t:1,alt:'vox_roar',ar:0.9}, vox_bug:{f:'vox/bu0-3',t:1,alt:'vox_cute',ar:1.4},
  click:{f:'ui/ck0-4',t:0}, select:{f:'ui/se0-3',t:0}, tick:{f:'ui/ti0-1',t:0}, drop:{f:'ui/dr0-3',t:0}, pluck:{f:'ui/pl0-1',t:0}, scratch:{f:'ui/sc0-3',t:0}, uiglass:{f:'ui/gl0-4',t:0},
  book_o:{f:'ui/bo0',t:0}, book_c:{f:'ui/bc0',t:0}, page:{f:'ui/pg0-2',t:0}, bookp:{f:'ui/bp0-2',t:0}, cloth:{f:'ui/cl0-5',t:0}, leather:{f:'ui/le0-3',t:0}, coins:{f:'ui/co0-4',t:0}, chips:{f:'ui/ch0-2',t:0},
  card:{f:'ui/ca0-3',t:2}, cslide:{f:'ui/cs0-2',t:2},
  amb_sea:{f:'amb/sea',t:2,loop:1}, amb_rig:{f:'amb/rig',t:2,loop:1}, amb_wind:{f:'amb/wind',t:2,loop:1}, amb_gale:{f:'amb/gale',t:2,loop:1}, amb_rain:{f:'amb/rain',t:2,loop:1},
  amb_whistle:{f:'amb/whistle',t:2,loop:1}, amb_harbour:{f:'amb/harbour',t:2,loop:1}, amb_tavern:{f:'amb/tavern',t:2,loop:1}, amb_cave:{f:'amb/cave',t:2,loop:1},
  amb_breeze:{f:'amb/breeze',t:2,loop:1}, amb_birds:{f:'amb/birds',t:2,loop:1}, amb_fire:{f:'amb/fire',t:2,loop:1} };
const SND_BUS_OF={};   // a synth voice's bus when its id has no map row yet (the rest: cmb) — A3's cave reverb taps cmb + wld only
'ui_click ui_equip ui_ok ui_open ui_close ui_tab ui_tick talk_blip talk_open coin_sell crew_grumble hex_deal hex_rotate hex_place nope explorer_none drag_pick drag_drop drag_bad drag_salvage drag_sell waypoint_set waypoint_clear chart_ink'.split(' ').forEach(k=>{ SND_BUS_OF[k]='ui'; });
('node_hit node_break geode prosp_up chest secret forge brew shrine_gamble dig rope_snap hull_hit ground_scrape repair iron_stick landfall port_arrive door_in door_out net_cast buoy_drop explorer_send harpoon_throw sail_set eat '+
  'bridge_creak bridge_snap lava_hiss bog_bubble bog_squelch ice_crack ice_slide grass_rustle shallows_splash temple_rumble hide_on steam_hiss fall_chasm splash_fall '+
  'helm_leave helm_take ship_bell rigging_creak hatch anchor_chain decor_place fish_bite reel_click line_cast saw mop_swish cook bed_rest dawn sea_chest').split(' ').forEach(k=>{ SND_BUS_OF[k]='wld'; });
/* (C9) who says what: a wind-up's TELL by archetype (a shelled kind clicks) · a kind's BARK (as its pack wakes · as it falls) · a pickup's material */
const TELL_A={charger:'tell_snort', circler:'tell_growl', caster:'tell_hum'}, TELL_K={alpha:'tell_growl', cinderfox:'tell_growl'};   // (the rest hiss — a shell clicks: tellOf)
const BARK_K={boar:'grunt', walrus:'grunt', boulderback:'grunt', termqueen:'grunt', ooze:'croak', bogtoad:'croak', salamander:'croak', sporeling:'croak', lamprey:'croak',
  dingo:'yip', alpha:'yip', cinderfox:'yip', crab:'click', clam:'click', reefspike:'click', urchin:'click', mshrimp:'click', scorpion:'click', beetle:'click', tmantis:'click', termite:'click',
  coco:'chitter', snake:'chitter', mothwing:'chitter', sanddev:'chitter', siren:'hoot', tidecaller:'hoot', diver:'hoot', kelpie:'hoot'};
const PICK_MAT={ore:'stone', geo:'stone', gem:'glass', herb:'leaf', relic:'stone', salv:'shell', find:'glass'};   // (coin & the rest: a chink)
const SECURE_V=['secure','secure2','secure3','secure4'];                                   // §11.2 the clearing sting's 4 variants, rotating
/* §4 THE SKILL GEMS (C5b) — 30 gems. n = its name · k = a short key · w = the weapon types it needs (null = any weapon) · sl = basic (slot 1 only: it modifies
   the weapon's own combo) | skill (slots 2-6) | persist (slotted = on) · c = Tide (paid when it RESOLVES — never under 10) · cd / fl = cooldown & its floor
   under cdr (s) · r = rarity (0 Common · 1 Uncommon · 2 Rare) · dg = the least danger it drops at · pct = its headline damage % (the DEV cast-all's check) ·
   ty = its damage type · mel / prj = a melee / projectile skill (§9.1's mel / prj increases; a melee skill freezes the world once) · st = its single-target
   value for sheetDps (× the weapon hit; a BASIC gem: × the basic) · nod = no damage term (buffs, reactions) · cdEq = a summon's re-cast pace for the sheet ·
   gt = ground-targeted, its range (u) · R = its radius (u) · tim = [wind, act, rec] (s — fixed: attack speed never applies; default GEM_TIM) · mw = move ×
   while casting (0 = the skill moves you) · iF = grace (s) · lq / lk = what a level scales (dmg · dur · move · bonus · shield) & by how much (default +6%
   a level; a BASIC gem +2%) · ic = its pixel icon · tg = its tags · tx = what it does at L1 · m5 / m15 = the L5 & L15 milestones */
const GEM_TIM=[0.10,0.10,0.20];
const GEMS={
  G01:{n:'Riptide Edge', k:'riptide', w:['sword'], sl:'basic', r:0, dg:1, pct:25, ty:'phy', st:1.05, ic:'g01', tg:'melee · projectile · physical', tx:'your swings deal ×0.8 and loose a water crescent (25%, 70u, pierces)', m5:'the crescent flies 100u', m15:'the finisher fires 3 crescents ±15°'},
  G02:{n:'Whirl', k:'whirl', w:['sword','axe'], sl:'skill', c:35, r:0, dg:1, pct:420, ty:'phy', mel:1, st:4.2, R:42, kb:2.2, tim:[0.06,0.34,0.12], mw:0.6, iF:0.25, ic:'whirl', tg:'melee · area · physical', tx:'a 360° spin R42 (an axe R46): 420%, knockback ×2.2 · you move ×0.6 · 0.25 s of grace', m5:'radius +20%', m15:'it spins twice (the 2nd at 60%)'},
  G03:{n:'Tidal Lunge', k:'lunge', w:['sword','spear'], sl:'skill', c:30, cd:2, r:1, dg:2, pct:300, ty:'phy', mel:1, st:4.8, L:90, tim:[0.08,0.15,0.20], mw:0, ic:'g03', tg:'movement · melee · physical', tx:'lunge 90u (grace): 300% to all you pass, then a 480% cone (R40, 60°)', m5:'a kill resets its cooldown', m15:'it leaves a 90u wake that Chills 2 s'},
  G04:{n:'Riposte', k:'riposte', w:['sword'], sl:'skill', c:10, cd:4, r:2, dg:6, pct:450, ty:'phy', mel:1, nod:1, tim:[0.05,0.35,0.15], mw:0.3, ic:'g04', tg:'melee · buff', tx:'guard 0.35 s (0.5 with a shield): the next hit is negated — even a heavy — and you riposte for 450% (cone R40, 80°) + stagger 5× Attack', m5:'the riposte strikes all within 45u', m15:'a riposte refunds its cooldown'},
  G05:{n:'Rending Chop', k:'rend', w:['axe'], sl:'basic', r:0, dg:1, pct:85, ty:'phy', st:1.1, ic:'g05', tg:'melee · physical · bleed', tx:'every hit ×0.85 and Bleeds (30% of it over 4 s)', m5:'bleeding foes take +10% from axe hits', m15:'a bleeding foe you kill bursts for 60% (R30)'},
  G06:{n:'Groundswell Slam', k:'slam', w:['axe'], sl:'skill', c:40, cd:1.5, r:1, dg:3, pct:480, ty:'phy', mel:1, st:4.8, gt:90, R:55, tim:[0.12,0.22,0.25], mw:0, ic:'g06', tg:'area · movement · melee · physical', tx:'leap to the target (≤ 90u), slam R55 for 480% · normals go down 0.8 s · stagger ×3', m5:'an aftershock ring 55→90u at 80%', m15:'a 3 s quake: 60% every 0.5 s'},
  G07:{n:'Anchor Chain', k:'anchor', w:['axe'], sl:'skill', c:30, r:0, dg:2, pct:260, ty:'phy', prj:1, st:5.2, ic:'g07', tg:'projectile · physical', tx:'a spectral anchor flies 150u and back: 260% each way, pierces · its return drags foes 30u to you', m5:'190u', m15:'two anchors ±12°'},
  G08:{n:'Bloodtide Roar', k:'roar', w:['axe','sword'], sl:'skill', c:15, cd:12, fl:10, r:1, dg:4, pct:0, nod:1, R:120, lq:'dur', lk:0.015, ic:'g08', tg:'buff · area', tx:'roar R120: +20% damage & +10% attack speed for 6 s · foes near are Chilled 2 s · the swarm cowers 1 s', m5:'R150', m15:'the roar Shocks'},
  G09:{n:'Tempest Thrust', k:'tempest', w:['spear'], sl:'basic', r:1, dg:3, pct:40, ty:'sto', st:0.98, ic:'g09', tg:'melee · storm', tx:'each thrust ×0.85 (25% Shock) and a spark 40u past the tip (40% storm)', m5:'the spark chains once', m15:'the 3rd hit calls a bolt (100% storm)'},
  G10:{n:'Harpoon Line', k:'harpoon', w:['spear'], sl:'skill', c:25, cd:3, r:0, dg:1, pct:340, ty:'phy', prj:1, st:3.4, gt:200, ic:'harpoon', tg:'projectile · movement · physical', tx:'throw 200u: 340% · hauls normals & swarm to 28u in front of you · pulls YOU to elites & bosses (20u short)', m5:'it pierces 1 more (hauls both)', m15:'hauled foes are stunned 1 s'},
  G11:{n:'Reef Barrage', k:'reef', w:['spear'], sl:'skill', c:30, r:0, dg:2, pct:260, ty:'phy', st:3.9, gt:120, ic:'g11', tg:'area · physical', tx:'5 coral spears erupt in a line to the target, 24u apart (to 120u): R14, 260% each', m5:'7 spears', m15:'caltrops for 3 s: slow 40%, 30% every 0.5 s'},
  G12:{n:'Whirlpool', k:'whirlpool', w:['spear','staff'], sl:'skill', c:45, r:2, dg:6, pct:62, ty:'frs', st:5.0, gt:180, R:70, ic:'g12', tg:'area · frost · control', tx:'a whirlpool R70 at the target (≤ 180u) for 4 s: pulls 45 u/s, 62% frost every 0.5 s, Chills', m5:'R85', m15:'it implodes at the end for 450% frost'},
  G13:{n:'Venom Kiss', k:'venom', w:['daggers'], sl:'basic', r:1, dg:3, pct:85, ty:'phy', st:1.06, ic:'g13', tg:'melee · venom', tx:'every hit ×0.85 and Poisons (25% of it over 5 s, stacks)', m5:'poisoned foes take +20% crit damage', m15:'the finisher spreads its Poison to foes within 40u'},
  G14:{n:'Undertow Step', k:'undertow', w:['daggers'], sl:'skill', c:15, cd:2.5, r:0, dg:1, pct:50, nod:1, lq:'bonus', lk:0.06, tim:[0.04,0.05,0.10], ic:'g14', tg:'movement', tx:'blink behind the target (≤ 140u) or 80u on · your next hit within 1.5 s crits for +50%', m5:'a 1.8 s cooldown', m15:'the blink leaves a 1 s Rime patch (Chill)'},
  G15:{n:'Knife Fan', k:'knives', w:['daggers'], sl:'skill', c:25, r:0, dg:2, pct:150, ty:'phy', prj:1, st:3.0, ic:'g15', tg:'projectile · physical · bleed', tx:'7 knives in a 60° fan, 170u: 150% each, Bleed 30%', m5:'9 knives', m15:'the knives come back (60%)'},
  G16:{n:'Maelstrom Dance', k:'dance', w:['daggers'], sl:'skill', c:50, r:2, dg:7, pct:105, ty:'phy', mel:1, st:5.3, tim:[0.06,0.5,0.15], mw:0, ic:'g16', tg:'movement · area · melee', tx:'dance 100u along your aim over 0.5 s (grace): 8 hits of 105% to all within 32u of your path', m5:'10 hits', m15:'it ends in a 380% burst (R50)'},
  G17:{n:'Split Shot', k:'split', w:['bow'], sl:'basic', r:0, dg:1, pct:45, ty:'phy', st:0.72, ic:'g17', tg:'projectile · physical', tx:'each shot looses 3 arrows in a 12° fan, 45% each (a repeat hit ×0.3) · 5 Tide an arrow that hits, 8 a shot at most', m5:'5 arrows', m15:'the arrows pierce 1'},
  G18:{n:'Volley', k:'volley', w:['bow'], sl:'skill', c:35, r:0, dg:1, pct:260, ty:'phy', prj:1, st:3.9, ic:'volley', tg:'projectile · area', tx:'16 arrows in a ring, 260% each (a repeat hit ×0.5)', m5:'20 arrows', m15:'they pierce 1 & gently home'},
  G19:{n:'Storm Arrow', k:'storm', w:['bow'], sl:'skill', c:25, r:1, dg:3, pct:380, ty:'sto', prj:1, st:3.8, tim:[0.35,0.05,0.15], mw:0.55, ic:'g19', tg:'projectile · storm · chain', tx:'a 0.35 s draw → 380% storm that chains to 3 (70% each) · Shock 100%', m5:'5 chains', m15:'each chain forks once'},
  G20:{n:'Rain of Barbs', k:'rain', w:['bow'], sl:'skill', c:40, cd:1, r:1, dg:4, pct:140, ty:'phy', st:4.2, gt:240, R:60, ic:'g20', tg:'area · physical', tx:'12 arrows rain on R60 at the target (≤ 240u) over 1 s: 140% each · slow 30%', m5:'Bleed 30%', m15:'a second rain 1 s later at 50%'},
  G21:{n:'Ember Lob', k:'ember', w:['staff'], sl:'basic', r:0, dg:1, pct:55, ty:'fir', st:1.1, ic:'g21', tg:'projectile · area · fire', tx:'your bolts become firebolts: 55% fire + a 30% blast (R24) · the fire part Burns', m5:'blast R32', m15:'burning ground for 2 s (40% every 0.5 s)'},
  G22:{n:'Rime Burst', k:'rime', w:['staff'], sl:'skill', c:30, cd:1, r:0, dg:1, pct:360, ty:'frs', st:3.6, R:70, ic:'g22', tg:'area · frost', tx:'a nova R70: 360% frost · Chill · freeze build ×2', m5:'R85', m15:'it echoes 0.5 s later at 50%'},
  G23:{n:'St Elmo’s Chain', k:'elmo', w:['staff'], sl:'skill', c:30, r:1, dg:3, pct:360, ty:'sto', st:3.6, ic:'g23', tg:'storm · chain', tx:'lightning to the target (≤ 200u) that chains 4 times (≤ 120u a hop): 360% storm · Shock 100%', m5:'6 chains', m15:'the last chain returns and heals you 1% a foe'},
  G24:{n:'Call the Deep', k:'deep', w:['staff'], sl:'skill', c:50, r:2, dg:5, pct:45, ty:'frs', st:18, cdEq:20, lk:0.05, tim:[0.15,0.10,0.25], ic:'g24', tg:'summon · frost', tx:'2 drowned thralls for 20 s: invulnerable, each strikes for 45% a second', m5:'3 thralls', m15:'they burst as they go (150% frost, R40)'},
  G25:{n:'Seafoam Rush', k:'rush', w:null, sl:'skill', c:10, cd:10, fl:6, r:0, dg:1, pct:100, nod:1, lq:'move', lk:0.015, tim:[0.04,0.05,0.05], ic:'g25', tg:'movement · buff', tx:'sprint 3 s: +40% move, through foes · your first hit after deals +100%', m5:'an 8 s cooldown', m15:'you knock foes 20u aside as you pass'},
  G26:{n:'Brine Ward', k:'ward', w:null, sl:'skill', c:20, cd:10, fl:10, r:1, dg:2, pct:0, nod:1, lq:'shield', tim:[0.05,0.05,0.10], ic:'g26', tg:'buff · frost', tx:'a shield absorbs 20% of your max life for 5 s (recasting never refreshes it)', m5:'it lasts 7 s', m15:'it bursts for 200% frost (R50) when broken'},
  G27:{n:'Gull Familiar', k:'gull', w:null, sl:'persist', c:0, rsv:20, r:0, dg:2, pct:12, ty:'phy', nod:1, lk:0.05, ic:'g27', tg:'summon', tx:'reserves 20 max Tide · a gull pecks the nearest foe (150u) for 12% twice a second and fetches materials to you', m5:'its pecks Shock 25%', m15:'two gulls'},
  G28:{n:'Kraken’s Grasp', k:'kraken', w:null, sl:'skill', c:35, cd:4, r:2, dg:6, pct:320, ty:'phy', st:3.2, gt:180, R:60, ic:'kraken', tg:'area · control', tx:'tentacles grip R60 at the target (≤ 180u): 320% · Root 1.5 s (elites 0.6 s, bosses never)', m5:'R75', m15:'they stay 3 s, slamming 60% every 0.5 s'},
  G29:{n:'Lighthouse Beacon', k:'beacon', w:null, sl:'skill', c:30, cd:12, fl:10, r:1, dg:4, pct:0, nod:1, gt:160, R:90, lq:'dur', lk:0.03, ic:'g29', tg:'area · buff · storm', tx:'a beacon for 8 s: foes within 90u are Shocked · inside it you mend 1% life a second & crit +10%', m5:'R110', m15:'a sweeping beam: 100% storm every 0.5 s to what it crosses'},
  G30:{n:'Broadside', k:'broadside', w:null, sl:'skill', c:40, cd:8, r:2, dg:7, pct:500, ty:'fir', st:7.5, gt:260, R:36, ic:'g30', tg:'area · fire', tx:'your ship’s guns fire 3 shots at the target (spread R40): each a 0.8 s telegraph, then 500% fire (R36) + Burn', m5:'4 shots', m15:'5 shots & a 30u shove'} };
const GEM_RAR=[{n:'Common', c:'#6fe0c0', w:60, t:1}, {n:'Uncommon', c:'#ff7f6a', w:30, t:2}, {n:'Rare', c:'#ffd86b', w:10, t:3}];   // §4.1 the drop weights · t = the sea-glass tier whose beam it wears (§6.9: Common teal · Uncommon coral · Rare the Pearl-gold)
const GEM_DROP={elite:0.03, magic:0.06, rare:0.20, boss:0.5, hoard:0.25, cache:0.05, deep:0.15, bossChest:1, own:3, any:1.5};   // §4.1 a gem's chance per source · × weight for your wielded type's gems / any-weapon gems
const GEM_XP={share:0.5, kill:0.5, win:8, base:25, exp:1.8, max:20, maxGlv:24, merge:150, bossLv:3, bossLvCap:8};   // §4.1 50% of a kill's XP (cast or hit in the last 8 s) · +50% the killing blow · 25·L^1.8 a level · max 20 (glv 24) · a merge: its XP + 150 × its level · a boss's gem min(8, dlE/3)
const GEM_ST={sword:['G01','G02'], axe:['G02','G05','G07'], spear:['G10','G11'], daggers:['G14','G15'], bow:['G17','G18'], staff:['G21','G22']};   // each type's Common gems (the first pickup of a weapon type · the DEV rack)
const KIT_GEMS={sword:[null,'G02','G25'], bow:[null,'G18','G25'], staff:[null,'G22','G25'], axe:[null,'G02','G25'], spear:[null,'G10','G25'], daggers:[null,'G15','G25']};   // §3 the starting kit's bar: its weapon's skill in slot 2 · Seafoam Rush in slot 3
const BAR_KEYS=['LMB','RMB','1','2','3','4'], BAR_ROLES=['attack','skill2','skill3','skill4','skill5','skill6'];   // each slot's key cap on the keys · its pad role (§4.1)
const TIDE_CAP=180;                                // §2.9 the Tide pool: 100 (+ nodes & affixes, C4b/C6a) — never past 180
const FLASK_PTS={swarm:0.25, normal:3, elite:10, magic:14, rare:20, boss:40};   // §2.11 kill points toward the next flask charge (scripted adds: 0)
const DRAUGHT={h:{n:'Healing Draught', heal:0.40}, g:{n:'Greater Draught', heal:0.60, regen:0.01, t:5}}, DRAUGHT_CAP=10;   // the backups the flask falls back on (Q, flask empty) — carried, 10 of each at most
/* §7.4 THE MATERIALS (C4a) — ONE registry for everything the isles give: ore, cut gems, herbs, the Old relic, salvage, geodes (C7c adds the museum's
   finds, 'f:<key>'). Per key: n = its name · f = its family · t = its tier in the family (fTake spends the lowest first) · v = its market price (g) ·
   px = the pixel icon it recolours with p (baked as PXI_ART['m:'+key]) · gp = a smaller ground icon · bm = a ground beacon (rgb) · lc = its light's
   colour index. Materials weigh nothing: the POUCH (one landfall's) never fills, boarding stows it in the HOLD (unlimited), a KO loses ⌈n/2⌉ of each
   stack (§6.10). The legacy goods map to tier-1 kinds (§7.4): ore → o1 · herb → h:sage · bits → scrap · gems → the biome's signature gem, Chipped. */
const MAT_FAM={relic:{n:'Relics', ic:'🏺'}, gem:{n:'Cut gems', ic:'💎'}, ore:{n:'Ore', ic:'⛏'}, herb:{n:'Herbs', ic:'🌿'}, salv:{n:'Salvage', ic:'🦴'}, wood:{n:'Timber', ic:'🪵'}, geo:{n:'Geodes', ic:'🪨'}, find:{n:'Finds', ic:'🏛'}};   // (listed in this order — the most precious first · PT1 B9: timber, the shipwright's makings for her extensions)
const ORE_T=[['Copper','#d0843c',3],['Iron','#9aa0a8',5,'#6a645a','#46403a'],['Silver','#d8dde6',9,'#6a645a','#46403a'],['Cobalt','#4a78d8',15],['Star-iron','#b8c8ff',24,'#5a5868','#3a3846'],['Deepsteel','#7a52c0',40,'#4a4452','#2c2834']];   // §7.3 tiers 1-6: name · vein · price (g) · [rock, rock shade]
const GEM_T={garnet:['Garnet','#e8404a','#9a1a2a','#2a0a10'], aqua:['Aquamarine','#7fe0f0','#2a9ab8','#0a2430'], citrine:['Citrine','#ffd23f','#c89018','#2a1c04'],   // §6.4 the six gem types: name · face · shade · outline
  jade:['Jade','#4ad07a','#1e8a44','#062410'], amethyst:['Amethyst','#c890ff','#7a4ac0','#1a0a2a'], onyx:['Onyx','#74748a','#2a2a36','#08080c']};
const GEM_CUT=['Chipped','Flawed','Cut','Flawless','Royal'], GEM_CUT_DG=[1,5,10,15,21], GEM_CUT_X=[1,1.6,2.4,3.4,4.8];   // §6.4 the cuts · the danger each starts at · × the Chipped value
const HERB_T={sage:['Sea-sage','#a8c8a0','#5e7e5a',3], tide:['Tidebloom','#6ad0d8','#2a8a9a',4], ember:['Emberroot','#f08a3a','#a8401a',4], frost:['Frostcap','#d0ecff','#7aa8d0',4], glow:['Glowcap','#d8a0ff','#8a4ac8',5]};   // §7.4 the five herbs (C7a grows them per biome)
const GEO_T={'1':['Geode','#c8d0d8','#7a8490',5], frost:['Frost Geode','#9fe0ff','#4a90c8',12], magma:['Magma Geode','#ff8a3a','#b8401a',20], omni:['Omni Geode','#e0a0ff','#7a4ac0',40]};   // §7.4 (cracked at the Forge, C7b — sold for half the crack)
const BIOME_GEM={tropic:'jade', savanna:'citrine', moor:'onyx', ember:'garnet', atoll:'aqua', meadow:'amethyst', boulder:'onyx', frost:'aqua', scorch:'garnet', dunes:'citrine', swamp:'jade', bamboo:'jade', mushroom:'amethyst', volcanic:'garnet'};   // §7.2 each shore's signature gem (crystal: any)
/* §7.2 THE NODES PER BIOME (C7a) — hb: the herb(s) that grow there (Sea-sage is half of every shore's herbs on top) · fs: a rock's fossil chance ·
   fk: the fossils its rocks hold (§7.8). The rock / herb / ruin weights are the biome mods' rockW / herbW / ruinW (unchanged). Below ground: Glowcap,
   3% fossils (Kraken Beak from floor 5, the Ichthyosaur Skull from floor 10 — half of them), the isle's own signature gem. */
const NODE_B={tropic:{hb:['tide'], fs:0.005, fk:['mega']}, savanna:{hb:['ember'], fs:0.005, fk:['ammo','trilo']}, moor:{hb:['frost'], fs:0.02, fk:['ammo','trilo']},
  ember:{hb:['ember'], fs:0.005, fk:['fern']}, atoll:{hb:['tide'], fs:0.005, fk:['mega']}, meadow:{hb:['tide'], fs:0.005, fk:['fern']}, boulder:{hb:['sage'], fs:0.02, fk:['ammo','trilo']},
  frost:{hb:['frost'], fs:0.005, fk:['ammo','trilo']}, scorch:{hb:['ember'], fs:0.005, fk:['ammo','trilo']}, crystal:{hb:['frost'], fs:0.005, fk:['ammo','trilo']},
  dunes:{hb:['ember'], fs:0.02, fk:['ammo','trilo','scorp']}, swamp:{hb:['glow'], fs:0.01, fk:['scorp']}, bamboo:{hb:['tide'], fs:0.005, fk:['fern']},
  mushroom:{hb:['glow'], fs:0.005, fk:['ammo','trilo']}, volcanic:{hb:['ember'], fs:0.005, fk:['ammo','trilo']}};
const GEO_B={frost:'frost', moor:'frost', crystal:'frost', scorch:'magma', volcanic:'magma', ember:'magma'};   // §7.4 the shores (& their caves) whose rocks crack into a Frost / Magma Geode (any cave from floor 5 / 10)
/* §7.2-7.5 THE GATHERING numbers (C7a): a rock's cut-gem chance (a biome's gemRockCh overrides) · its geode chance (+ Geologist's) · Omni geodes from ⚔ [0]
   at [1] of the geodes · a special (Frost/Magma) geode's share where one can form · a cave rock's fossil chance · a ruin's Old relic (a biome's relicCh
   overrides) · an elite's cut gem · the hoard's cut gems [lo, hi] · a drop one cut lower · ore one tier lower / higher · a shore's signature gem × ·
   Sea-sage's share of the herbs · STAIRS under a rock [base, + per rock broken, + Lode Sense, cap] (§8.9) · Forager's heal (× max life) · a surface shore's least rock share */
const GATHER={gemRock:0.2, geo:0.06, geoGeol:0.04, geoOmni:[15,0.2], geoSp:0.5, cvFoss:0.03, ruinRelic:0.4, eliteGem:0.08, hoardGems:[2,4],
  cutLo:0.3, oreLo:0.25, oreHi:0.08, gemSig:2, sage:0.5, stair:[0.04,0.02,0.10,0.3], forHeal:0.02, rockMin:0.45};   // (rockMin — G4 fix: a surface shore's least share of rocks among its nodes)
/* §7.5 THE PROSPECTOR (C7a) — levels by breaking nodes: XP per kind (geodes cracked at the Forge C7b, secret doors C8b) · round(10 × lv^1.5) to the next ·
   the perks, automatic: [level, name, what it does] */
const PROSP={max:10, xp:{rock:1, cry:2, herb:1, ruin:2, geode:3, door:3}, perk:[[2,'Keen Pick','nodes break in one fewer hit'],[3,'Forager','+25% herb yield · an herb heals 2% of your life'],
  [4,'Rich Veins','+25% ore & cut-gem yield'],[6,'Geologist','+4% geode chance per rock'],[8,'Lode Sense','secret doors & a buried ✕ show on your maps within 30 tiles · +10% stairs under a rock'],
  [10,'Bedrock','rocks break in one hit · +1 from every rock']]};
/* §7.8 THE MUSEUM'S FINDS (24 — materials 'f:<key>', family 'find'): [name, set (min · fos · art), price (a duplicate sells for it), icon, its recolour,
   beacon]. C7a drops the fossils (rocks) & the ruins' artifacts; the geodes' minerals (C7b), the donations & the rest (C7c) read the same rows. */
const FINDS={quartz:['Quartz','min',40,'gem',{C:'#eef0f8',c:'#a8b0c8',W:'#ffffff',K:'#2a2e3a'}], pyrite:['Pyrite','min',45,'stone',{R:'#e0c050',r:'#8a7020',W:'#fff0a0',K:'#2a2008'}],
  lode:['Lodestone','min',55,'stone',{R:'#6a6a78',r:'#34343e',W:'#b8bcc8',K:'#0c0c12'}], kyan:['Kyanite','min',70,'crystal',{C:'#5a90f0',c:'#2a4aa8',W:'#d8e8ff',K:'#0a1430'}],
  moon:['Moonstone','min',80,'gem',{C:'#e8f4ff',c:'#9ab8d8',W:'#ffffff',K:'#1a2a3a'}], obsid:['Obsidian','min',90,'crystal',{C:'#4a3a5a',c:'#1e1428',W:'#b8a8d8',K:'#06040a'}],
  opal:['Fire Opal','min',110,'gem',{C:'#ff8a4a',c:'#c8401a',W:'#fff0c0',K:'#2a0a04'}], fulg:['Fulgurite','min',100,'crystal',{C:'#e0d0a8',c:'#8a7a58',W:'#fffbe8',K:'#2a2010'}],
  sgarn:['Star Garnet','min',150,'gem',{C:'#ff5a7a',c:'#a01838',W:'#fff0f4',K:'#2a0610'}], amber:['Leviathan Amber','min',200,'gem',{C:'#ffc040',c:'#b0600a',W:'#fff4c0',K:'#2a1404'}],
  ammo:['Ammonite','fos',50,'fossil',{S:'#d8c8a0',s:'#9a8a64',W:'#fff4d8',K:'#1a140c'}], trilo:['Trilobite','fos',55,'fossil',{S:'#a8a090',s:'#6a6458',W:'#e0dccc',K:'#12100c'}],
  mega:['Megalodon Tooth','fos',90,'fossil',{S:'#f0ece0',s:'#b0a890',W:'#ffffff',K:'#1a1810'}], scorp:['Sea-scorpion','fos',80,'fossil',{S:'#8a6a4a',s:'#5a4028',W:'#c8a880',K:'#1a0e06'}],
  fern:['Fossil Fern','fos',60,'fossil',{S:'#8a9a78',s:'#556048',W:'#c8d4b8',K:'#10140c'}], kraken:['Kraken Beak','fos',130,'fossil',{S:'#6a4a7a',s:'#3a2448',W:'#b890c8',K:'#0e0612'}],
  ichthy:['Ichthyosaur Skull','fos',180,'skull',{W:'#e8dcc0',s:'#a89878',K:'#1a140a'}],
  doubl:['Drowned Doubloon','art',60,'coin',{Y:'#c8a440',W:'#f0e0a0',O:'#4a7a5a',D:'#8a8a3a',K:'#1a1c08'}], hilt:['Rusted Cutlass Hilt','art',70,'blade',{W:'#b8a890',S:'#7a6a5a',H:'#a86a3a',h:'#5a3a1a',K:'#1a100a'}],
  scrim:['Scrimshaw Map','art',110,'book',{Y:'#e8dcc0',y:'#a89878',W:'#fffaf0',K:'#2a2010'}], idol:['Sunken Idol','art',150,'relic',{u:'#3a6a5a',U:'#5a9a7a',W:'#b8e0c8',K:'#0a1a14'}],
  bell:['Ship’s Bell','art',120,'relic',{u:'#8a6a1a',U:'#d8a830',W:'#fff0a0',K:'#2a1a04'}], comb:['Mermaid’s Comb','art',140,'relic',{u:'#a86a8a',U:'#f0a8c8',W:'#fff0f8',K:'#2a0a1a'}],
  astro:['Captain’s Astrolabe','art',200,'ring',{W:'#fff0c0',G:'#e0b040',g:'#8a6a1a',Y:'#ffd23f',o:'#c8901a',K:'#1c1004'}]};
const FIND_SET={min:1, fos:2, art:3};
/* §7.6 THE FORGE (C7b) — T = the ore tier (1-6). craftIP: the IP a craft at tier T makes (Deepsteel: max(29, the hardest danger you've conquered)) ·
   sg / co: a Sea-glass (2 affixes) / Coral (3 affixes) craft — ore of tier T, scrap, shards, fragments, Old relics, g × T² · temper: 3 ore of the NEW IP's
   band + 20 × (IP+1) g · reforge: 1 Old relic + 1 cut gem (any) + 20 + 4 × IP g · drill: 1 relic + 5 ore of the item's band + 100 × (sockets+1) g ·
   unsock: 10 × the cut g · comb: 3 of a type & cut → the next cut, 20 / 60 / 150 / 400 g · crack: a geode's price · GEO_MIN: what each geode's
   mineral half holds (§7.8 — an Omni's Leviathan Amber is 3% of its cracks) · geoDg: the least danger a geode's gems & ore are graded at */
const FORGE={craftIP:[3,8,13,18,23,29], sg:{ore:8, scrap:4, g:25}, co:{ore:12, shard:3, frag:1, relic:1, g:60}, temper:{ore:3, g:20}, reforge:{relic:1, gem:1, g:20, gip:4},
  drill:{relic:1, ore:5, g:100}, unsock:10, comb:[20,60,150,400], crack:{'1':10, frost:25, magma:40, omni:80}};
const GEO_MIN={'1':['quartz','pyrite','lode'], frost:['kyan','moon'], magma:['obsid','opal'], omni:['fulg','sgarn']}, GEO_AMBER=0.06, GEO_DG={'1':1, frost:5, magma:10, omni:15};
const FORGE_TABS=[['craft','🔨 Craft'],['temper','🔥 Temper'],['reforge','⟳ Reforge'],['sock','◈ Sockets'],['salv','⟲ Salvage · Geodes']];
const CRAFT_SLOTS=['main','off','helm','chest','gloves','boots','amu','ring'];
/* §7.7 THE APOTHECARY (the Market's tab, C7b) — BREW: 8 recipes (ingredient keys: a material, or 'gem:<type>' = one cut gem of that type, any cut —
   the lowest first) → a draught ('dr': h / g) or an ELIXIR ('ex'). An Elixir lasts the landfall — until you board, or ELIXIR_T s at most; one at a
   time (a new one replaces it); its fx fold into STATS (fractions, but tdm / crm flat). FLASK_UP: the flask's Capacity / Potency / Refill tiers' prices
   (PT1 W9: a third Capacity tier — the Friend's flask — & a third Potency tier, fitted only where the town's standing reaches FLASK_REP). */
const BREW=[{id:'B1', dr:'h', in:{'h:sage':2}}, {id:'B2', dr:'g', in:{'h:tide':2,'h:sage':1}},
  {id:'B3', ex:'flood', in:{'h:glow':2,'gem:onyx':1}}, {id:'B4', ex:'ember', in:{'h:ember':2,'gem:garnet':1}}, {id:'B5', ex:'rime', in:{'h:frost':2,'gem:aqua':1}},
  {id:'B6', ex:'storm', in:{'h:ember':1,'h:frost':1,'gem:citrine':1}}, {id:'B7', ex:'plenty', in:{'h:tide':2,'gem:jade':1,'relic':1}}, {id:'B8', ex:'deep', in:{'h:glow':2,'gem:amethyst':1}}];
const ELIXIR={flood:{n:'Elixir of the Flood', fx:{tdg:0.2, tdm:10}, tx:'+20% Tide gain · +10 max Tide', c:'#6fd8e8'},
  ember:{n:'Elixir of Ember', fx:{fir:0.2, asp:0.08}, tx:'+20% fire damage · +8% attack speed', c:'#ff8a3a'},
  rime:{n:'Elixir of Rime', fx:{arp:0.25, lip:0.10}, tx:'+25% armour · +10% max life', c:'#bfe6ff'},
  storm:{n:'Elixir of the Storm', fx:{crm:0.15, mov:0.10}, tx:'+0.15 crit multiplier · +10% move', c:'#ffe55a'},
  plenty:{n:'Elixir of Plenty', fx:{gld:0.25, rar:0.25, gth:0.25}, tx:'+25% gold & item rarity · +25% gathering', c:'#6ad07a'},
  deep:{n:'Elixir of the Deep', fx:{lip:0.15, lightR:0.30}, tx:'+15% max life · +30% light radius', c:'#c890ff'}};
const ELIXIR_T=1200, ELIXIR_CAP=10, FLASK_UP={cap:[300,1200,3000], pot:[400,1500,4200], ref:[250,900]}, FLASK_REP={cap:3, pot:4};   // (FLASK_REP: the town's standing a third tier needs — a friend of the town · the harbour's own)
/* §7.8 THE MUSEUM (C7c) — the donation box: one of each of the 24 FINDS · MUS_MS: the milestones by donations [n, kind, name, what it does] ·
   MUS_SETS: the three wall cases [set, name, wall, icon] — the finds in each run in FINDS order (minerals 10 · fossils 7 · artifacts 7) */
const MUS_MS=[[4,'flask','A flask charge','your flask holds +1 charge (with the upgrades — never past 7)'], [8,'pt','A passive point','+1 point for the ✦ Tree'],
  [12,'bag','The Curator’s Satchel','+6 satchel slots'], [16,'pt','A passive point','+1 point for the ✦ Tree'], [20,'gem','The Curator’s Learning','+15% skill gem XP, for good'],
  [24,'white','The White’s Iron','an Abyssal harpoon · +100 renown · the title “Curator of the Drowned Hall”']];
const MUS_SETS=[['min','Minerals','the back wall','crystal'], ['fos','Fossils','the left wall','fossil'], ['art','Artifacts','the right wall','relic']];
const MUS_REN=100, MUS_GMX=0.15, MUS_BAG=6, MUS_TITLE='Curator of the Drowned Hall', MUS_MEGA=0.08;   // (MUS_MEGA: a deep chest's Megalodon Tooth — §7.8 names the source, not the chance)
/* §7.9 GUILD SLAYER BOUNTIES (C7c) — every bestiary kind: 100 kills (a swarm kill in its skin 0.25 · an elite or better 3) → at the next dock
   50 g × your band + 20 renown · every 4th kind's bounty a Pearl (a slot you wear, IP = your band) · ONE per kind (slay {kind: 1} — G4 fix) */
const BOUNTY={need:100, sw:0.25, big:3, g:50, ren:20, pearl:4};
/* §14 THE GUILD CHAIN's steps 4-6 (C7c) — posted one after another (the first at the dock after your first flag), each paid once at the next dock (rw: what it pays besides coin) */
const GUILD_X={4:{t:'gtemper', ev:'temper', pay:25, rw:'g4'}, 5:{t:'gbrew', ev:'brew', pay:0, rw:'g5'}, 6:{t:'gtree', ev:'tree', pay:0, rw:'g6'}};
const GEO_UQ={magma:['U07',0.005], frost:['U08',0.005]};   // (C7c §6.6) a Magma Geode's 0.5% Obsidian Heart · a Frost Geode's 0.5% Rimeheart
GUILD_X[4].rt='2 Chipped gems'; GUILD_X[5].rt='2 Healing Draughts + the Guild charter'; GUILD_X[6].rt='a Sea-glass ring + the Guild’s owl';   // (what each step pays besides coin — the boards & the ledger say it)
const MUS_SRC={quartz:'a Geode', pyrite:'a Geode', lode:'a Geode', kyan:'a Frost Geode', moon:'a Frost Geode', obsid:'a Magma Geode', opal:'a Magma Geode', fulg:'a Geode off the dunes, or an Omni',
  sgarn:'an Omni Geode', amber:'an Omni Geode — rarely', ammo:'rocks on moor, boulder & dune shores', trilo:'rocks on moor, boulder & dune shores', mega:'rocks on atolls & tropic shores · deep chests',
  scorp:'rocks on dunes & swamps', fern:'rocks on meadows, bamboo & ember shores', kraken:'cave rocks, floor 5 and down', ichthy:'cave rocks from floor 10 · a boss floor’s chest',
  doubl:'ruins', hilt:'ruins', scrim:'ruins', idol:'ruins past ⚔8', bell:'secret rooms', comb:'secret rooms on atolls & tropic shores', astro:'hoards'};   // (C7c) the museum's hint for a find you've never held — §7.8's sources
const LTASTE={ore:'ore', herb:'herb', gems:'gem', bits:'scrap', relic:'relic'};   // the townsfolk's old taste ids ('l:<id>') → a family (or one key): any ore · any herb · any cut gem · scrap · the Old relic (this order = folkAll's old one: the seeded tastes don't shift)
const MATS=(()=>{ const M={}, hx=c=>parseInt(c.slice(1,3),16)+','+parseInt(c.slice(3,5),16)+','+parseInt(c.slice(5,7),16);
  M.relic={n:'Old relic', f:'relic', t:1, v:12, px:'relic', bm:'255,170,60', lc:2};
  for(const g in GEM_T){ const G=GEM_T[g]; for(let c=1;c<=5;c++) M['g:'+g+':'+c]={n:GEM_CUT[c-1]+' '+G[0], f:'gem', t:c, v:Math.round(7*GEM_CUT_X[c-1]), px:'gem', p:{C:G[1], c:G[2], K:G[3]}, bm:hx(G[1]), lc:3}; }
  ORE_T.forEach((o,i)=>{ M['o'+(i+1)]={n:o[0]+' ore', f:'ore', t:i+1, v:o[2], px:'ore', p:Object.assign({s:o[1]}, o[3]?{g:o[3], G:o[4]}:{})}; });
  for(const h in HERB_T){ const H=HERB_T[h]; M['h:'+h]={n:H[0], f:'herb', t:1, v:H[3], px:'herb', p:{L:H[1], l:H[2]}}; }
  M.scrap={n:'Scrap', f:'salv', t:1, v:2, px:'bone', gp:'boneS'};
  M.shard={n:'Sea-glass shard', f:'salv', t:2, v:6, px:'gem', p:{C:'#9ff0d8', c:'#3aa890', W:'#f0fff8', K:'#0a2420'}, bm:'159,240,216', lc:3};
  M.frag={n:'Coral fragment', f:'salv', t:3, v:18, px:'gem', p:{C:'#ff9a8a', c:'#d0504a', W:'#fff0ec', K:'#2a0a08'}, bm:'255,154,138', lc:2};
  M.w1={n:'Ship’s timber', f:'wood', t:1, v:4, px:'plank'};                                                            // (PT1 B9) TIMBER: three oak planks tied with rope — the yard's makings ("Sell the lot" keeps it)
  M.w2={n:'Ironwood', f:'wood', t:2, v:14, px:'plank', p:{P:'#5a4a3e', p:'#3e322a', W:'#76665a', w:'#8a7a6c', G:'#c0c6d2'}};   // dark grey-brown planks, a steel sheen along the grain
  M.w3={n:'Heartwood', f:'wood', t:3, v:40, px:'plank', p:{P:'#8a2a2a', p:'#5a1a1c', W:'#a8403a', w:'#c05a40', G:'#ffd23f'}, bm:'255,200,90', lc:2};   // deep red with a gold grain — it glints on the ground
  let gt=1; for(const q in GEO_T){ const G=GEO_T[q]; M['geo:'+q]={n:G[0], f:'geo', t:gt++, v:G[3], px:'geode', p:{C:G[1], c:G[2]}, bm:hx(G[1]), lc:3}; }
  for(const q in FINDS){ const F=FINDS[q], P=F[4], c0=P.C||P.R||P.S||P.U||P.G||P.Y||P.W; M['f:'+q]={n:F[0], f:'find', t:FIND_SET[F[1]], v:F[2], px:F[3], p:P, bm:hx(c0), lc:2, set:F[1]}; }   // (C7a) the museum's finds — a beacon each (a find is never ordinary)
  return M; })();
const LOOT_KEYS=Object.keys(MATS);                 // every material key, in display order (family by family — the ONE list: no literal copies)
const MAT_FK={}; for(const k of LOOT_KEYS) (MAT_FK[MATS[k].f]||(MAT_FK[MATS[k].f]=[])).push(k);
for(const f in MAT_FK) MAT_FK[f].sort((a,b)=>MATS[a].t-MATS[b].t);   // each family's keys, lowest tier first (fTake's order)
/* §6.1 THE GEAR (C4b) — IBASE: every base. s = its slot (main · off · helm · chest · gloves · boots · amu · ring) · t = the weapon type (sword · axe ·
   spear · daggers · bow · staff) or the off-hand's kind (shield · quiver · focus) · h 2 = two-handed · tm = its timing factor (§3) · ip = the least item power
   it drops at · w = its Attack roll at IP1 [lo, hi] (× 1.13^(IP−1)) · imp = its implicit {stat: v} — armour & flat life × 1.12^(IP−1), percentages fixed ·
   x = a moveset implicit (text — C5a wires it) · el = a staff's element · ic = its pixel icon. Only the sword & bow types drop or equip until C5a (WT_LIVE). */
const IBASE={
  cutlass:{n:'Cutlass', s:'main', t:'sword', ip:1, w:[12,14], imp:{asp:5}, ic:'blade'},
  sabre:{n:'Sabre', s:'main', t:'sword', ip:6, w:[11,13], imp:{crc:5}, ic:'blade'},
  broadsword:{n:'Broadsword', s:'main', t:'sword', ip:14, w:[14,16], imp:{stg:20, asp:-5}, ic:'blade'},
  baxe:{n:'Boarding Axe', s:'main', t:'axe', ip:1, w:[16,18], imp:{stg:15}, ic:'axe'},
  beard:{n:'Bearded Axe', s:'main', t:'axe', ip:9, w:[16,18], imp:{bld:10}, ic:'axe'},
  maul:{n:'Maul', s:'main', t:'axe', h:2, tm:1.15, ip:4, w:[23,26], imp:{stg:30}, x:'slam radius +10%', ic:'hammer'},
  anchor:{n:'Anchor-Hammer', s:'main', t:'axe', h:2, tm:1.15, ip:16, w:[24,27], imp:{stg:40}, x:'slams pull 15u inward', ic:'hammer'},
  pike:{n:'Boarding Pike', s:'main', t:'spear', ip:1, w:[11,13], imp:{rch:10}, ic:'spear'},
  trident:{n:'Trident', s:'main', t:'spear', ip:10, w:[11,13], imp:{sto:10}, x:'thrust line W20', ic:'trident'},
  harpoon:{n:'Harpoon', s:'main', t:'spear', h:2, tm:1.1, ip:5, w:[16,18], imp:{}, x:'Harpoon Line costs 5 less Tide', ic:'harpoon'},
  dirk:{n:'Dirk', s:'main', s2:'off', t:'daggers', ip:1, w:[5,7], imp:{crc:4}, ic:'dagger'},
  kris:{n:'Kris', s:'main', s2:'off', t:'daggers', ip:7, w:[5,7], imp:{bld:12}, ic:'dagger'},
  stiletto:{n:'Stiletto', s:'main', s2:'off', t:'daggers', ip:15, w:[5,7], imp:{crc:8}, ic:'dagger'},
  shortbow:{n:'Shortbow', s:'main', t:'bow', h:2, ip:1, w:[9,11], imp:{asp:6}, ic:'bow'},
  longbow:{n:'Longbow', s:'main', t:'bow', h:2, ip:6, w:[11,13], imp:{arng:20, asp:-6}, ic:'bow'},
  hornbow:{n:'Horn Bow', s:'main', t:'bow', h:2, ip:14, w:[10,12], imp:{prc:1}, ic:'bow'},
  dstaff:{n:'Driftwood Staff', s:'main', t:'staff', h:2, ip:1, w:[12,14], el:'frs', imp:{}, x:'bolt splash R24', ic:'staff'},
  sgstaff:{n:'Stormglass Staff', s:'main', t:'staff', h:2, ip:12, w:[12,14], el:'sto', imp:{}, x:'bolts chain +1 (60%)', ic:'staff'},
  cwand:{n:'Coral Wand', s:'main', t:'staff', tm:0.85, ip:3, w:[9,11], el:'fir', imp:{asp:10}, ic:'wand'},
  pwand:{n:'Pearl Wand', s:'main', t:'staff', tm:0.85, ip:18, w:[9,11], el:'sto', imp:{crc:8}, ic:'wand'},
  buckler:{n:'Buckler', s:'off', t:'shield', ip:1, imp:{blk:15, arm:8}, ic:'shield'},
  kite:{n:'Kite Shield', s:'off', t:'shield', ip:8, imp:{blk:20, arm:14}, ic:'shield'},
  tower:{n:'Tower Shield', s:'off', t:'shield', ip:16, imp:{blk:25, arm:22, mov:-4}, ic:'shield'},
  quiver:{n:'Quiver', s:'off', t:'quiver', ip:1, imp:{prj:10}, ic:'quiver'},
  bquiver:{n:'Barbed Quiver', s:'off', t:'quiver', ip:9, imp:{bld:12}, ic:'quiver'},
  squiver:{n:'Storm Quiver', s:'off', t:'quiver', ip:15, imp:{sto:10, arng:10}, ic:'quiver'},
  sgfocus:{n:'Sea-glass Focus', s:'off', t:'focus', ip:1, imp:{tdm:10}, ic:'focus'},
  cfocus:{n:'Conch Focus', s:'off', t:'focus', ip:10, imp:{skl:10}, ic:'focus'},
  tricorn:{n:'Tricorn', s:'helm', ip:1, imp:{arm:6}, ic:'helm'},
  bosun:{n:'Bosun’s Cap', s:'helm', ip:1, imp:{arm:4, tdm:8}, ic:'helm'},
  circlet:{n:'Coral Circlet', s:'helm', ip:6, imp:{arm:4, skl:8}, ic:'helm'},
  divehelm:{n:'Brass Diving Helm', s:'helm', ip:12, imp:{arm:14, lif:20}, ic:'helm'},
  coat:{n:'Sailcloth Coat', s:'chest', ip:1, imp:{arm:10, lip:5}, ic:'coat'},
  jerkin:{n:'Boarding Jerkin', s:'chest', ip:1, imp:{arm:16}, ic:'coat'},
  vest:{n:'Sharkskin Vest', s:'chest', ip:8, imp:{arm:10, eva:3}, ic:'coat'},
  cuirass:{n:'Brass Cuirass', s:'chest', ip:14, imp:{arm:30, mov:-4}, ic:'coat'},
  targl:{n:'Tar Gloves', s:'gloves', ip:1, imp:{arm:3, asp:4}, ic:'glove'},
  grapple:{n:'Grappling Gauntlets', s:'gloves', ip:6, imp:{arm:6, stg:12}, ic:'glove'},
  bracers:{n:'Coral Bracers', s:'gloves', ip:12, imp:{arm:4, crm:0.1}, ic:'glove'},
  seaboots:{n:'Sea Boots', s:'boots', ip:1, imp:{arm:4, mov:4}, ic:'boot'},
  sandals:{n:'Cork Sandals', s:'boots', ip:5, imp:{arm:1, mov:8}, ic:'boot'},
  sealboots:{n:'Sealskin Boots', s:'boots', ip:12, imp:{arm:8, mov:4, slw:40}, ic:'boot'},
  pendant:{n:'Driftglass Pendant', s:'amu', ip:1, imp:{lip:6}, ic:'amulet'},
  sharkt:{n:'Shark-tooth Necklace', s:'amu', ip:1, imp:{dmg:8}, ic:'amulet'},
  tideamu:{n:'Tide Amulet', s:'amu', ip:6, imp:{tdm:12}, ic:'amulet'},
  locket:{n:'Compass Locket', s:'amu', ip:12, imp:{mov:6, gmx:10}, ic:'amulet'},
  coralband:{n:'Coral Band', s:'ring', ip:1, imp:{lif:12}, ic:'ring'},
  pearlring:{n:'Oyster Ring', s:'ring', ip:1, imp:{crc:2}, ic:'ring'},
  scrim:{n:'Scrimshaw Band', s:'ring', ip:4, imp:{tdg:8}, ic:'ring'},
  signet:{n:'Brass Signet', s:'ring', ip:10, imp:{dmg:6}, ic:'ring'} };
const WT_LIVE={sword:1, bow:1, axe:1, spear:1, daggers:1, staff:1};   // the weapon types that drop & equip (C5a: all six — the axe, spear, daggers & staff joined the sword & bow)
const OFF_OK={shield:{sword:1, axe:1, spear:1, none:1}, quiver:{bow:1}, focus:{wand:1}, daggers:{daggers:1}};   // who takes which off-hand (a 1H melee main or bare fists: a shield · a bow: its quiver · a wand: a focus — C5a)
const EQ_SLOTS=['main','off','helm','chest','gloves','boots','amu','r1','r2'], EQ_N={main:'Main hand', off:'Off-hand', helm:'Helm', chest:'Chest', gloves:'Gloves', boots:'Boots', amu:'Amulet', r1:'Ring', r2:'Ring', ring:'Ring'};
/* §6.2 THE SEA-GLASS TIERS: c = its text colour · wax = the seal & beam · rgb = the beam stamp · na = affix count [lo, hi] · ip = its item-power bump · sv = its sale
   price (× 1 + IP/10) · bm = the beam [height u, width texels] · lc = its light (LC) · so = sockets (§6.2) · sal = its salvage (§6.10) · ic = the seal's emboss */
const IRAR=[
  {n:'Driftwood', c:'#d8cdb6', wax:'#8a6a42', rgb:'216,205,182', na:[0,0], ip:0, sv:2,   bm:null,    lc:0, ic:'knot',   sal:{scrap:2}},
  {n:'Sea-glass', c:'#6fe0c0', wax:'#3fbfa0', rgb:'63,191,160',  na:[1,2], ip:0, sv:8,   bm:[48,4],  lc:8, ic:'wave',   sal:{scrap:3, shard:1}},
  {n:'Coral',     c:'#ff7f6a', wax:'#e8584a', rgb:'232,88,74',   na:[3,4], ip:1, sv:25,  bm:[80,6],  lc:6, ic:'coralb', sal:{scrap:4, shard:2, frag:1}},
  {n:'Pearl',     c:'#fff1d0', ol:'#ffd86b', wax:'#f6e6b8', rgb:'255,216,107', na:[3,3], ip:1, sv:80,  bm:[140,8], lc:2, ic:'pearl',  sal:{scrap:5, frag:3}},
  {n:'Abyssal',   c:'#b58cff', wax:'#5b2a9e', rgb:'181,140,255', na:[3,4], ip:2, sv:200, bm:[180,8], lc:9, ic:'kraken', sal:{frag:6}} ];
/* §6.3 THE AFFIXES (42): n = its line (v → text) · sl = the slots / tags it rolls on · r = its IP1 range · k = how it scales with item power (P: × min(2.5,
   1 + 0.03(IP−1)) · A: the same, capped ×1.5 — absolute points · F: × 1.12^(IP−1), flat · 1: a fixed +1) · d = decimals shown · sf = a Sea-glass name's suffix ·
   cor = Coral+ only · ip = the least IP · c5 = its system lands later (weight 0 until then: 'a' = C5a's statuses & elements · 'b' = C5b's gems & cooldowns) */
const AFX={
  dmg:{n:v=>'+'+v+'% damage', sl:'weapon amu ring', r:[6,10], k:'P', sf:'of Ruin'},
  mel:{n:v=>'+'+v+'% melee damage', sl:'melee gloves amu', r:[8,14], k:'P', sf:'of the Brawler'},
  prj:{n:v=>'+'+v+'% projectile damage', sl:'bow staff quiver focus gloves amu', r:[8,14], k:'P', sf:'of the Hawk'},
  skl:{n:v=>'+'+v+'% skill damage', sl:'helm amu focus ring', r:[8,14], k:'P', sf:'of the Tide-song'},
  phy:{n:v=>'+'+v+'% physical damage', sl:'weapon gloves', r:[8,14], k:'P', sf:'of Steel'},
  fir:{n:v=>'+'+v+'% fire damage', sl:'weapon ring amu focus', r:[10,16], k:'P', sf:'of Embers', c5:'a'},
  frs:{n:v=>'+'+v+'% frost damage', sl:'weapon ring amu focus', r:[10,16], k:'P', sf:'of Rime', c5:'a'},
  sto:{n:v=>'+'+v+'% storm damage', sl:'weapon ring amu focus', r:[10,16], k:'P', sf:'of the Squall', c5:'a'},
  ven:{n:v=>'+'+v+'% venom damage', sl:'weapon ring amu focus', r:[10,16], k:'P', sf:'of Venom', c5:'a'},
  dot:{n:v=>'+'+v+'% damage over time', sl:'weapon ring amu focus', r:[10,16], k:'P', sf:'of Wasting', c5:'a'},
  asp:{n:v=>(v<0?'−'+(-v):'+'+v)+'% attack speed', sl:'weapon gloves ring quiver', r:[4,7], k:'P', sf:'of Haste'},
  crc:{n:v=>'+'+v+'% crit chance', sl:'weapon helm ring amu quiver', r:[1.5,3], k:'A', sf:'of Luck'},
  crm:{n:v=>'+'+v+' crit multiplier', sl:'weapon gloves amu', r:[0.10,0.18], k:'P', d:2, sf:'of Slaughter'},
  stg:{n:v=>'+'+v+'% stagger', sl:'weapon gloves shield', r:[10,20], k:'P', sf:'of the Ram'},
  aoe:{n:v=>'+'+v+'% area of effect', sl:'helm amu focus', r:[6,10], k:'P', sf:'of Breadth'},
  prc:{n:()=>'projectiles pierce +1', sl:'bow staff quiver', r:[1,1], k:'1', cor:1, sf:'of Piercing'},
  bld:{n:v=>v+'% chance to Bleed', sl:'weapon gloves', r:[8,15], k:'P', sf:'of Bleeding', c5:'a'},
  psn:{n:v=>v+'% chance to Poison', sl:'weapon gloves ring', r:[8,15], k:'P', sf:'of the Adder', c5:'a'},
  shk:{n:v=>'+'+v+'% chance to Shock', sl:'weapon ring focus', r:[8,15], k:'P', sf:'of Thunder', c5:'a'},
  elt:{n:v=>'+'+v+'% damage vs elites & bosses', sl:'weapon amu ring', r:[8,14], k:'P', sf:'of the Hunt'},
  lch:{n:v=>'leech '+v+'% of hit damage as life', sl:'weapon ring amu', r:[0.4,0.8], k:'A', d:2, sf:'of the Leech'},
  lok:{n:v=>'+'+v+' life per kill', sl:'weapon ring gloves', r:[3,5], k:'F', sf:'of the Feast'},
  lif:{n:v=>'+'+v+' max life', sl:'helm chest boots gloves shield amu ring', r:[12,20], k:'F', sf:'of the Whale'},
  lip:{n:v=>'+'+v+'% max life', sl:'chest helm amu', r:[4,8], k:'P', sf:'of Vigour'},
  arm:{n:v=>'+'+v+' armour', sl:'helm chest gloves boots shield', r:[6,12], k:'F', sf:'of the Turtle'},
  arp:{n:v=>'+'+v+'% armour', sl:'chest shield helm', r:[10,20], k:'P', sf:'of Iron'},
  blk:{n:v=>'+'+v+'% block chance', sl:'shield', r:[3,6], k:'A', sf:'of the Wall'},
  eva:{n:v=>'+'+v+'% evade chance', sl:'boots gloves chest', r:[2,4], k:'A', sf:'of the Eel'},
  reg:{n:v=>'regenerate '+v+'% life a second', sl:'chest helm amu ring', r:[0.3,0.6], k:'A', d:2, sf:'of Mending'},
  fkh:{n:v=>'+'+v+'% flask healing', sl:'chest amu ring', r:[10,20], k:'P', sf:'of the Apothecary'},
  fkg:{n:v=>'+'+v+'% flask charge gain', sl:'gloves ring amu', r:[10,20], k:'P', sf:'of Plenty'},
  tdm:{n:v=>'+'+v+' max Tide', sl:'helm amu focus ring', r:[8,14], k:'P', sf:'of the Deep'},
  tdg:{n:v=>'+'+v+'% Tide gain', sl:'weapon gloves ring focus', r:[6,12], k:'P', sf:'of the Tide'},
  cdr:{n:v=>'−'+v+'% cooldowns', sl:'helm amu focus', r:[4,8], k:'P', sf:'of the Current', c5:'b'},
  mov:{n:v=>(v<0?'−'+(-v):'+'+v)+'% move speed', sl:'boots amu', r:[3,6], k:'P', sf:'of the Gale'},
  dsh:{n:v=>'−'+v+'% dash recharge', sl:'boots', r:[8,15], k:'P', sf:'of the Wind'},
  gmx:{n:v=>'+'+v+'% skill gem XP', sl:'helm amu ring', r:[10,20], k:'P', sf:'of Learning', c5:'b'},
  gld:{n:v=>'+'+v+'% gold found', sl:'ring amu gloves', r:[10,20], k:'P', sf:'of Plunder'},
  rar:{n:v=>'+'+v+'% item rarity', sl:'ring amu helm', r:[8,15], k:'P', sf:'of Fortune'},
  mag:{n:v=>'+'+v+' magnet reach', sl:'gloves ring boots', r:[20,40], k:'P', sf:'of the Lodestone'},
  gth:{n:v=>'+'+v+'% gathering yield', sl:'gloves ring', r:[10,20], k:'P', sf:'of the Prospector'},
  glv:{n:v=>'+'+v+' level to your weapon’s skill gems', sl:'weapon amu', r:[1,1], k:'1', cor:1, ip:10, sf:'of Mastery', c5:'b'} };
const IMP_N={fzb:v=>'+'+v+'% freeze build', rch:v=>'+'+v+'% reach', arng:v=>'+'+v+'% arrow range & speed', slw:v=>'−'+v+'% slow from bog, pits & ice', blk:v=>'block '+v+'%', arm:v=>'armour '+v};   // implicit lines the affix table doesn't word (the rest read AFX[k].n)
/* §6.4 SOCKETS: the most a slot holds · what a cut gem gives in a WEAPON / an ARMOUR piece (helm, chest, gloves, boots, off-hand) / JEWELLERY — [stat, v, …] at
   Chipped (× GEM_CUT_X by cut) · (C5a: the elements & statuses are live — an Aquamarine's freeze build, a Citrine's Shock & a Jade's Poison chance too) */
const SOCK_MAX={main2:3, main:2, chest:2};             // (every other slot: 1)
const SOCK_FX={garnet:{w:['fir',8], a:['lip',3], j:['tdg',4]}, aqua:{w:['frs',8,'fzb',10], a:['tdm',6], j:['cdr',2]}, citrine:{w:['sto',8,'shk',4], a:['gld',6,'rar',2], j:['mov',3]},
  jade:{w:['ven',8,'psn',4], a:['fkh',5], j:['fkg',6]}, amethyst:{w:['lch',0.15], a:['arp',8], j:['reg',0.1]}, onyx:{w:['crm',0.04], a:['eva',1], j:['crc',1]}};
/* §6.2 names: a Coral find = a CORAL_PRE word + a noun for its slot (a Pearl: its power's name — C6b · an Abyssal: its own) */
const CORAL_PRE=['Storm-kissed','Gilded','Drowned','Salt-bitten','Moonlit','Sunken','Blackwater','Kraken-bone','Wave-worn','Gale-blessed'];
const CORAL_NOUNS={sword:['Reaver','Cleaver','Edge','Fang'], bow:['Longshot','Wing','Recurve','Gale'], axe:['Chopper','Splitter'], spear:['Lance','Tine'], daggers:['Needle','Sting'], staff:['Rod','Wand'],
  shield:['Bulwark','Ward','Aegis'], quiver:['Quill','Sheaf'], focus:['Lens','Eye'], helm:['Crown','Cowl','Visage'], chest:['Hauberk','Mantle','Coat'], gloves:['Grip','Fists','Hands'],
  boots:['Striders','Treads','Soles'], amu:['Charm','Talisman','Locket'], ring:['Loop','Band','Coil']};
/* §9.1 the stat caps — totals over every source, applied where STATS is built (and where a stat is read) */
const STAT_CAP={asp:0.30, crc:0.50, crx:3.0, stg:1.0, aoe:0.8, blk:0.45, eva:0.25, dr:0.75, lch:0.03, lchRate:0.03, reg:0.02, fkg:0.6, tdg:1.0, tdm:180, cdr:0.4, mov:0.5, dsh:0.35, rar:1, mag:200, slw:0.8};
/* §6.7 the drops: an item's chance per kill · the slot pick's weights (PT1 W1: the loot filter is gone — every drop shows) */
const IT_SLOT_W=[['main',18],['off',10],['helm',10],['chest',10],['gloves',10],['boots',10],['amu',7],['ring',12]];
/* §6.5 THE PEARL LEGENDARY POWERS (C6b) — a Pearl rolls ONE from its slot's pool (a weapon's: the types in w · P03 the two-handed axes only). A row is DATA:
   on = where it fires (finisher heavy hit crit kill dash block flask cast still brk hurtHeavy hurt timer shot · 'stat' = always on) · f = its filter ·
   do = what it does (nova proj zone pull castGem buff drop · code = a bespoke hook — 10 of the 40) · a = its numbers · vk = the bracketed number, × the
   Pearl's roll pv 0.8-1.2 (inv: a cooldown — ÷ pv) · st = what it grants always · tx = its line. EVERY packet a power makes is a PROC (§2.13). */
const POWERS={
  P01:{n:'Tidebreaker', sl:'main', w:['sword'], on:'finisher', do:'proj', a:{k:'wave', L:120, W:24, pct:150, kb:20}, vk:'pct', tx:a=>'every finisher also sends a wave '+a.L+'u forward — '+pf(a.pct)+'%, '+a.kb+'u knockback, piercing'},
  P02:{n:'Kraken’s Maw', sl:'main', w:['axe'], on:'finisher', f:{slam:1, pre:1}, do:'pull', a:{R:80, u:25}, vk:'u', tx:a=>'your slams first drag every foe within '+a.R+'u '+pf(a.u)+'u toward the impact — then strike'},
  P03:{n:'Leviathan’s Rib', sl:'main', w:['axe'], h2:1, on:'finisher', f:{slam:1}, do:'nova', a:{dl:0.4, pct:60, of:'hit', fx:'quake'}, vk:'pct', tx:a=>'your slams repeat 0.4 s later as an aftershock at '+pf(a.pct)+'%'},
  P04:{n:'The Old Line', sl:'main', w:['spear'], on:'cast', f:{gem:['G10']}, do:'code', a:{deg:30}, vk:'deg', tx:a=>'Harpoon Line yanks EVERY normal in a '+pf(a.deg)+'° cone'},
  P05:{n:'Twin Serpents', sl:'main', w:['daggers'], on:'finisher', do:'proj', a:{k:'boomer', L:120, pct:100}, vk:'pct', tx:a=>'the twin stab also throws both daggers as boomerangs — 120u out & back, '+pf(a.pct)+'% each way'},
  P06:{n:'Siren’s Kiss', sl:'main', w:['daggers'], on:'crit', do:'code', a:{pc:15}, vk:'pc', tx:a=>'your crits mark foes DOOMED — a Doomed non-boss dies the moment it drops below '+pf(a.pc)+'% life'},
  P07:{n:'Gale-Bow', sl:'main', w:['bow'], on:'hit', f:{arrow:1, first:1}, do:'proj', a:{k:'split', deg:25, pct:50}, vk:'pct', tx:a=>'basic arrows split into 3 on their first hit — '+pf(a.pct)+'% each, ±25°'},
  P08:{n:'Star-iron String', sl:'main', w:['bow'], on:'shot', f:{arrow:1}, do:'castGem', a:{g:'G19', every:5, lv:10}, vk:'lv', tx:a=>'every 5th basic shot looses a free Storm Arrow at gem level '+Math.round(a.lv)},
  P09:{n:'Undertow Rod', sl:'main', w:['staff'], on:'shot', f:{bolt:1}, do:'proj', a:{k:'wave', every:4, L:160, W:24, pct:120, kb:20, rep:1}, vk:'pct', tx:a=>'every 4th basic bolt becomes a rolling wave — 160u, '+pf(a.pct)+'%, piercing, pushing foes 20u along'},
  P10:{n:'Coral Scepter', sl:'main', w:['staff'], on:'hit', f:{bolt:1}, do:'zone', a:{R:40, life:2, pct:40, type:'fir', kind:'coralfire', cd:0.25}, vk:'pct', tx:a=>'your bolts leave burning ground — R40 for 2 s, '+pf(a.pct)+'% a half-second (never stacks)'},
  P11:{n:'Heart of the White', sl:'main', w:null, on:'kill', f:{elite:1}, do:'proj', a:{k:'whale', L:160, pct:300, type:'frs'}, vk:'pct', tx:a=>'killing an elite or rare looses a white-whale spirit that crashes 160u through them — '+pf(a.pct)+'% frost'},
  P12:{n:'Kraken-Tooth', sl:'main', w:['sword','axe'], on:'kill', f:{nth:3, win:4}, do:'nova', a:{R:35, pct:150, at:'corpse', fx:'tent'}, vk:'pct', tx:a=>'every 3rd kill within 4 s bursts a tentacle slam at the body — '+pf(a.pct)+'%, R35'},
  P13:{n:'Barnacle Aegis', sl:'off', w:['shield'], on:'block', f:{noEv:1}, do:'nova', a:{R:50, pct:80, cd:1, at:'you', fx:'spike'}, vk:'pct', tx:a=>'a block looses a spike nova — '+pf(a.pct)+'%, R50, at most once a second'},
  P14:{n:'Wreck Door', sl:'off', w:['shield'], on:'stat', do:'code', a:{pct:150, stun:1}, vk:'pct', tx:a=>'your dashes & lunges BASH the foes in your path — '+pf(a.pct)+'% and a 1 s stun (normals)'},
  P15:{n:'Hurricane Quiver', sl:'off', w:['quiver'], on:'stat', do:'stat', a:{homeVS:4}, vk:'homeVS', tx:a=>'Volley & Split Shot arrows home in (turning '+pf(a.homeVS,1)+' rad/s)'},
  P16:{n:'Lodestone Focus', sl:'off', w:['focus'], on:'cast', f:{gem:['G22','G12']}, do:'pull', a:{u:20}, vk:'u', tx:a=>'your novas & whirlpools also drag foes '+pf(a.u)+'u inward as you cast'},
  P17:{n:'Crown of the Deep', sl:'helm', on:'stat', do:'code', st:{sm:1}, a:{ck:50}, vk:'ck', tx:a=>'+1 max summon · your summons take your leech and '+pf(a.ck)+'% of your crit chance'},
  P18:{n:'Captain’s Tricorn', sl:'helm', on:'cast', f:{full:1}, do:'castGem', a:{g:'G30', lv:8}, vk:'lv', tx:a=>'the first skill you cast at FULL Tide also fires a free Broadside at its target (gem level '+Math.round(a.lv)+')'},
  P19:{n:'Lantern-Eye Helm', sl:'helm', on:'timer', do:'code', a:{R:120}, vk:'R', tx:a=>'your light reveals burrowed sand devils, ambushers & secret doors within '+pf(a.R)+'u — and drags divers on the wing down to the ground'},
  P20:{n:'Storm-Crowned', sl:'helm', on:'heavy', do:'nova', a:{pct:250, type:'sto', cd:2, at:'foe', fx:'bolt'}, vk:'pct', tx:a=>'your heavy hits call a bolt down on the target — '+pf(a.pct)+'% storm, at most once every 2 s'},
  P21:{n:'Whale-Hide Coat', sl:'chest', on:'hurtHeavy', do:'buff', a:{b:'bar', pc:20, t:4, cd:8}, vk:'pc', tx:a=>'a heavy hit you take gives a barrier of '+pf(a.pc)+'% of your max life for 4 s (8 s cooldown)'},
  P22:{n:'Coat of the Tides', sl:'chest', on:'cast', f:{tide:1}, do:'buff', a:{b:'barT', per:0.5, t:4, max:30}, vk:'per', tx:a=>'spending Tide grants a barrier of '+pf(a.per,2)+'% of max life per Tide spent, for 4 s (max 30%)'},
  P23:{n:'Shipwright’s Plate', sl:'chest', on:'block', do:'buff', st:{noKb:1}, a:{b:'tide', v:8}, vk:'v', tx:a=>'you can’t be knocked back · a blocked or evaded hit restores '+pf(a.v)+' Tide'},
  P24:{n:'Pirate’s Last Coat', sl:'chest', on:'flask', do:'nova', a:{R:70, pct:100, kb:30, at:'you', fx:'ring'}, vk:'pct', tx:a=>'drinking a flask blasts the foes within 70u — '+pf(a.pct)+'% and 30u of knockback'},
  P25:{n:'Stormhands', sl:'gloves', on:'hit', f:{basic:1}, do:'proj', a:{k:'chain', R:100, pct:40, type:'sto'}, vk:'pct', tx:a=>'your basic hits chain to 1 more foe — '+pf(a.pct)+'% storm'},
  P26:{n:'Grappler’s Grips', sl:'gloves', on:'heavy', do:'pull', a:{k:'grip', stun:0.5}, vk:'stun', tx:a=>'your heavy hits pull the target into you and stun it '+pf(a.stun,2)+' s (elites half)'},
  P27:{n:'Gauntlets of the Whirl', sl:'gloves', on:'stat', do:'code', a:{pc:50, u:10}, vk:'pc', tx:a=>'Whirl moves at full speed, lasts '+pf(a.pc)+'% longer and drags foes 10u in'},
  P28:{n:'Tarred Mitts', sl:'gloves', on:'kill', f:{dot:1}, do:'code', a:{n:2, R:50}, vk:'n', tx:a=>'when a burning or poisoned foe dies, its Burn & Poison spread to '+Math.round(a.n)+' foes within 50u'},
  P29:{n:'Waveskimmers', sl:'boots', on:'dash', do:'zone', a:{k:'trail', R:16, life:2, pct:40, type:'frs', chill:2, kind:'icetrail'}, vk:'pct', tx:a=>'your dash leaves an ice trail — the foes crossing it are Chilled 2 s and take '+pf(a.pct)+'% frost'},
  P30:{n:'Burrower’s Boots', sl:'boots', on:'dash', do:'code', a:{dk:1.5, pct:150, R:30}, vk:'dk', tx:a=>'your dash becomes a BURROW — '+pf(a.dk,2)+'× the distance, untargetable, erupting at its end for 150% (R30)'},
  P31:{n:'Boots of the Undertow', sl:'boots', on:'dash', do:'buff', a:{b:'free', cd:6}, vk:'cd', inv:1, tx:a=>'after a dash your next skill costs no Tide ('+pf(a.cd,1)+' s cooldown)'},
  P32:{n:'Stompers', sl:'boots', on:'stat', do:'code', a:{u:40, st:2.5}, vk:'st', tx:a=>'dashing into a foe knocks it back 40u and adds '+pf(a.st,2)+'× your Attack of stagger'},
  P33:{n:'Eye of the Storm', sl:'amu', on:'still', do:'buff', a:{b:'anchor', area:40}, vk:'area', tx:a=>'stand still 0.5 s to DROP ANCHOR: basic attacks +'+pf(a.area)+'% area & ×2 knockback, and nothing moves you — till you move'},
  P34:{n:'Siren’s Last Song', sl:'amu', on:'cast', f:{dmgSk:1}, do:'code', a:{cd:20, pct:50}, vk:'cd', inv:1, tx:a=>'every '+pf(a.cd,1)+' s your next skill casts a second time at 50% (an echo)'},
  P35:{n:'Tide Amulet of Ages', sl:'amu', on:'timer', do:'buff', a:{b:'tidefoes', R:60, max:5}, vk:'max', tx:a=>'gain 1 Tide a second per foe within 60u (at most '+pf(a.max,1)+')'},
  P36:{n:'Leviathan’s Tooth', sl:'amu', on:'brk', do:'nova', a:{R:60, pct:300, type:'frs', tide:40, at:'foe', fx:'breach'}, vk:'pct', tx:a=>'a stagger BREAK brings a whale breaching up through it — '+pf(a.pct)+'% frost (R60) — and refills 40 Tide'},
  P37:{n:'Signet of the Drowned', sl:'ring', on:'kill', f:{frost:1}, do:'nova', a:{ch:15, R:40, pct:100, type:'frs', at:'corpse', fx:'shatter'}, vk:'ch', tx:a=>'frost kills have a '+pf(a.ch)+'% chance to SHATTER — 100% frost, R40 (a shatter’s kills never shatter)'},
  P38:{n:'Band of Plenty', sl:'ring', on:'stat', do:'stat', a:{node1:1, yld:1}, vk:'yld', tx:a=>'rocks, herbs & ruins break in one hit · +'+pf(a.yld,1)+' extra from every rock & herb'},
  P39:{n:'Mermaid’s Tear', sl:'ring', on:'flask', do:'buff', a:{b:'mt', v:25, asp:20, t:4}, vk:'v', tx:a=>'your flasks also restore '+pf(a.v)+' Tide and give +20% attack speed for 4 s (inside the cap)'},
  P40:{n:'Gambler’s Pearl', sl:'ring', on:'kill', f:{elite:2}, do:'drop', st:{taken:0.1}, a:{ch:10, floor:1}, vk:'ch', tx:a=>pf(a.ch)+'% of elite-or-better kills roll an extra item (Sea-glass or better) · you take 10% more damage'} };
function pf(v,d){ return d ? String(+v.toFixed(d)) : String(Math.round(v)); }                    // (a power line's number: whole, or to d places)
/* §6.6 THE ABYSSAL UNIQUES (13) — a fixed base, fixed stats (st: [key, value] — a value left out rolls the Abyssal's best: +life, +armour), and a power: the
   four boss uniques carry a BESPOKE one (pw — a POWERS-shaped row), every other a Pearl power at ×1.5 (p: its key). src = where it comes from · fl = its line */
const UNIQUES={
  U01:{n:'Tusk of the Great Boar', b:'baxe', st:[['stg',40],['mel',15],['asp',8],['lif']], pw:{n:'Gore-charge', on:'heavy', do:'code', a:{u:40, pct:150}, tx:()=>'your heavy hits make you GORE-CHARGE 40u forward through the foes — 150% to each'}, src:'the Great Boar', fl:'Still warm. Still angry.'},
  U02:{n:'Broodmother’s Carapace', b:'cuirass', st:[['arp',25],['lip',12],['blk',10]], pw:{n:'Brood', on:'hurt', do:'code', a:{ch:20, life:8}, tx:()=>'when you’re hit, a 20% chance a crabling hatches to fight for you — 8 s, 30% of your weapon a second (a summon) · blocks without a shield'}, src:'the Broodmother', fl:'Something inside it still scratches to get out.'},
  U03:{n:'The Pack King’s Crown', b:'tricorn', st:[['mov',10],['crm',0.15],['lif']], pw:{n:'The King’s Howl', on:'kill', f:{nth:3, win:5}, do:'buff', a:{b:'howl', asp:20, mov:20, t:4}, tx:()=>'every 3rd kill within 5 s HOWLS — +20% attack speed (inside the cap) & move for you and your summons, 4 s'}, src:'the Pack King', fl:'Worn by the one the pack follows.'},
  U04:{n:'Staff of the Drowned', b:'dstaff', st:[['frs',20],['summonMax',1],['tdm',12]], pw:{n:'The Cold Tide', on:'stat', do:'code', a:{}, tx:()=>'your Call the Deep thralls leave an ice patch as they go — normals standing on it FREEZE 1 s'}, src:'the Drowned Tidecaller', fl:'It drips, even in the sun.'},
  U05:{n:'Siren’s Harp', b:'longbow', st:[['prj',15],['arng',20],['crc',6]], p:'P07', src:'rare sirens · frost & crystal hoards', fl:'Strung with a voice nobody should have heard.'},
  U06:{n:'Lamprey’s Kiss', b:'kris', st:[['lch',0.8],['ven',10],['asp',8]], p:'P06', src:'swamp elites & rares · swamp hoards', fl:'It bites, and it does not let go.'},
  U07:{n:'Obsidian Heart', b:'pendant', st:[['fir',25],['lip',8]], p:'P28', src:'scorched & caldera hoards · Magma Geodes', fl:'Glass that remembers being fire.'},
  U08:{n:'Rimeheart', b:'coralband', st:[['frs',15],['lif']], p:'P37', src:'deep chests on frost isles · Frost Geodes', fl:'Cold enough to crack a bone.'},
  U09:{n:'Crystal Lens', b:'sgfocus', st:[['crc',10],['tdm',20]], p:'P25', src:'crystal hoards · secret rooms on crystal isles', fl:'Look through it and the storm looks back.'},
  U10:{n:'Sporeking’s Mitts', b:'targl', st:[['ven',15],['asp',6],['arm']], pw:{n:'Spore Cloud', on:'hit', f:{basic:1}, do:'zone', a:{R:40, life:2, pct:60, type:'ven', kind:'sporecloud', cd:0.3}, tx:()=>'your basic hits (any weapon) leave a venom cloud — R40 for 2 s, 60% a half-second (never stacks)'}, src:'mushroom hoards · rare sporelings', fl:'Soft, damp — and breathing.'},
  U11:{n:'Anchor of the Abyss', b:'anchor', st:[['stg',40],['aoe',20]], p:'P02', src:'boss-floor chests, floor 15 and deeper', fl:'Dropped from a ship no chart remembers.'},
  U12:{n:'Sandstrider Sandals', b:'sandals', st:[['mov',12],['dsh',20],['eva',3]], p:'P30', src:'dunes hoards · rare dune scorpions', fl:'The sand parts for whoever wears them.'},
  U13:{n:'The White’s Iron', b:'harpoon', st:[['phy',30],['stg',20],['glv',1]], p:'P04', src:'the museum’s 24th donation', fl:'The iron that finally found the White.'} };
const UQ_PV=1.5;                                   // an Abyssal's Pearl power: ×1.5 (the §6.6 table's worked numbers — U05 splits at 75%, U08 shatters 22%)
const UQ_BOSS={greatboar:['U01',d=>Math.min(0.12,0.03+0.003*d)], brood:['U02',()=>0.08], packking:['U03',()=>0.08], drowned:['U04',()=>0.08]};   // (C6b) the boss sources — the chance at the boss's dlE
const PW_ECHO={G02:1, G07:1, G10:1, G11:1, G12:1, G15:1, G18:1, G19:1, G20:1, G22:1, G23:1, G24:1, G28:1, G30:1, G03:'ch', G06:'ch', G16:'ch'};   // (P34 Siren's Last Song) the skills that echo — every one that deals damage (a channel echoes its landing where you stand)
const PW_BUFF_IC={bar:'shield', free:'tide', anchor:'anchor', mt:'pearl', howl:'g08'};   // the buff row's icons for the powers' buffs (a barrier · a free skill · the anchor · Mermaid's Tear · the King's Howl)
const UQ_HOARD={frost:[['U05',0.01]], crystal:[['U05',0.01],['U09',0.03]], swamp:[['U06',0.02]], scorch:[['U07',0.03]], volcanic:[['U07',0.03]], mushroom:[['U10',0.03]], dunes:[['U12',0.03]]};   // a surface hoard by its shore (§6.6)
/* §5 THE PASSIVE TREE (C6a) — 85 nodes on a compass rose: the Helm (the start, free) and eight regions round it (N Steel · NE Storm · E Rigging ·
   SE Deep · S Hull · SW Tide · W Wake · NW Fortune). Each region: X1 → X2 → X3 (a RULE notable — bespoke code, gold rim) → X4, which forks to
   X5 → X7 and X6 → X8 (bundle notables) → the keystone XK (3 points). The X3s ring each other (the inner ring); each X9 joins X6 to the next
   region's X5 (the outer ring, clockwise); SE10 → RED TIDE and DP10 → LAST LIGHT hang one step further out. A node: [name, effect, fx, rule] —
   fx = its stat bundle (fractions: .08 = +8% · crm tdm prc mag dashCh summonMax flat), rule = its flag in TR (read where the rule lives). */
const TREE_REG=[['SE','Steel','#d8dde6'],['SM','Storm','#ffe55a'],['RG','Rigging','#d8b87a'],['DP','Deep','#4fd0c0'],['HL','Hull','#b07a4a'],['TD','Tide','#4a90e8'],['WK','Wake','#e8f4ff'],['FT','Fortune','#ffd86b']];
const TREE_MAX=35, TREE_KS=3, TREE_KC=3;                                  // the most points you'll ever hold (29 levels + 4 boss firsts + 2 museum) · keystones at most · a keystone's price
const TREE_ND={
  SE:{n:[['Honed Edge','+8% melee damage',{mel:.08}], ['Weighted Grip','+12% stagger',{stg:.12}],
      ['Keelhauler','+10% melee damage · heavy hits deal +30% and keep normals down +0.4 s',{mel:.1},'rKeel'], ['Sharpened Steel','+10% physical damage',{phy:.1}],
      ['Barbed Edge','+10% Bleed chance on melee hits',{bldM:.1}], ['Brawler','+6% attack speed with melee weapons',{aspM:.06}],
      ['Bloodletter','+20% physical damage over time · +15% Bleed chance',{dotP:.2, bld:.15}], ['Cleaver’s Arc','melee arcs and radii +20% · +10% melee damage',{marea:.2, mel:.1}],
      ['Boarding Party','+6% melee damage, +4% attack speed',{mel:.06, asp:.04}], ['Red Mist','+8% damage while below 50% life',{lowDmg:.08}]],
    K:['Corsair’s Creed','your combo NEVER RESETS (idle time, skills and dashes keep its place) · every 3rd connecting melee hit is a HEAVY (knockdown, ×1.5 stagger) · melee hits leech 1% · your projectiles deal 40% less','blade','kCC'],
    X:['Red Tide','while below 50% life you deal 40% more damage and have +15% attack speed (inside the +30% cap) · your flasks heal 50% less','anger','kRT']},
  SM:{n:[['Static','+10% storm damage',{sto:.1}], ['Keen Eye','+2% crit chance',{crc:.02}],
      ['St Elmo’s Fire','your crits Shock · +0.15 crit multiplier',{crm:.15},'rElmo'], ['Quickening','+5% attack speed',{asp:.05}],
      ['Charged Air','Shock effect +5% (+15% → +20%)',{shkE:.05}], ['Killer Instinct','+0.15 crit multiplier',{crm:.15}],
      ['Thunderhead','storm chains and forks +1 target · +15% storm damage',{chS:1, sto:.15}], ['Squall','+8% attack speed · +6% move speed',{asp:.08, mov:.06}],
      ['Gale Force','+2% crit chance, +10% projectile speed',{crc:.02, arng:.1}]],
    K:['Stormcaller','100% of your damage becomes STORM · the Shock you inflict is doubled (+30% taken) and lasts 4 s · you can no longer inflict Bleed, Burn, Chill or Poison','g23','kSC']},
  RG:{n:[['Taut String','+10% projectile damage',{prj:.1}], ['Long Reach','+15% projectile speed and range',{arng:.15}],
      ['Deadeye’s Mark','projectiles pierce +1 · your first hit on a foe at full life deals +40%',{prc:1},'rMark'], ['Fletcher','+10% projectile damage',{prj:.1}],
      ['Steady Aim','+12% damage to foes farther than 100u',{farDmg:.12}], ['Quick Nock','+6% attack speed with bows and staves',{aspR:.06}],
      ['Chain Shot','projectiles fork once on their first hit (2 at 40%) · +10% projectile damage',{fork:1, prj:.1}], ['Crow’s Nest','+25% projectile range · +15% projectile damage',{prng:.25, prj:.15}],
      ['Tar-Tipped','+8% projectile damage, +10% damage over time',{prj:.08, dot:.1}]],
    K:['Deadeye','projectiles pierce +2 · each foe a projectile has pierced makes its next hit deal 15% more (max +45%) · your melee damage is 30% less','bow','kDE']},
  DP:{n:[['Chill Water','+10% frost damage',{frs:.1}], ['Toxin','+10% venom and fire damage over time',{dotVF:.1}],
      ['Cold Depths','chilled foes deal 15% less damage · +25% freeze build',{fzb:.25},'rCold'], ['Undercurrent','+10% damage over time',{dot:.1}],
      ['Brood','+15% summon damage',{sumD:.15}], ['Venom Sac','Poison lasts 25% longer',{psnDur:.25}],
      ['Drowned Host','+1 max summon · +20% summon damage',{summonMax:1, sumD:.2}], ['Rot & Rime','+20% damage over time · +15% frost damage',{dot:.2, frs:.15}],
      ['Deep Pressure','+8% frost damage, +5% max life',{frs:.08, lip:.05}], ['Last Breath','+8% max life',{lip:.08}]],
    K:['Drowned King','+1 max summon · your summons deal 40% more · a kill with a basic attack raises a drowned THRALL for 6 s (30% weapon damage a second) · your own hits deal 25% less','kraken','kDK'],
    X:['Last Light','once per landfall, a blow that would knock you out leaves you at 1 life — invulnerable for 3 s, healing 30% over them · max life −20%','g29','kLL']},
  HL:{n:[['Stout','+6% max life',{lip:.06}], ['Iron Rivets','+15% armour',{arp:.15}],
      ['Barnacle Hide','+10% max life · heavy hits you take deal 20% less',{lip:.1},'rBarn'], ['Hardened','+15% armour',{arp:.15}],
      ['Shield Wall','+4% block chance (with a shield)',{blkS:.04}], ['Deep Lungs','+12% flask healing',{fkh:.12}],
      ['Bulwark','+5% block chance (with a shield) · +25% armour',{blkS:.05, arp:.25}], ['Second Wind','+20% flask healing · +15% flask charge gain',{fkh:.2, fkg:.15}],
      ['Salted Hide','+5% max life, +10% armour',{lip:.05, arp:.1}]],
    K:['Ironclad','armour takes from ALL damage (poison included) · you can’t be knocked back, stunned or snared (siren, bog, pits) · armour 25% more · move 12% less · your dash has 1 charge','shield','kIC']},
  TD:{n:[['Swell','+10 max Tide',{tdm:10}], ['Flood','+10% Tide gain',{tdg:.1}],
      ['High Water','+20 max Tide · skills costing 40+ cost 15% less',{tdm:20},'rHigh'], ['Ebb','−6% cooldowns',{cdr:.06}],
      ['Current','+12% skill damage',{skl:.12}], ['Brimming','+1 Tide a second while a foe is roused',{tRgn:1}],
      ['Spring Tide','+20% skill damage · +10% Tide gain',{skl:.2, tdg:.1}], ['Moon Pull','−10% cooldowns · +10% area of effect',{cdr:.1, aoe:.1}],
      ['Tidewise','+6% Tide gain, +3% move',{tdg:.06, mov:.03}]],
    K:['Blood Tide','you have NO TIDE — skills cost LIFE (1 Tide = 0.2% of max life; never below 1 life) · skills deal 20% more · each basic hit heals 0.8% of max life (the leech rate cap)','blood','kBT']},
  WK:{n:[['Nimble','+5% move speed',{mov:.05}], ['Quick Feet','−12% dash recharge',{dsh:.12}],
      ['Slipstream','foes you dash through are Chilled 2 s · +6% move',{mov:.06},'rSlip'], ['Sure-footed','−30% slows on you (bog, pits, Chill, siren)',{slowR:.3}],
      ['Long Stride','+20% dash distance',{dDist:.2}], ['Evasion','+3% evade chance',{eva:.03}],
      ['Rogue Wave','your first hit within 1.5 s after a dash deals +30% and gains +6 Tide (once per 2 s)',{},'rWave'], ['Sea Legs','+1 dash charge · +5% move',{dashCh:1, mov:.05}],
      ['Windward','+4% move, +4% attack speed',{mov:.04, asp:.04}]],
    K:['Ride the Wake','dash 3 charges (0.9 s each) · your dash deals 80% weapon damage and 1.2× Attack of stagger to every foe you pass through · your dashes grant NO i-frames','wave','kRW']},
  FT:{n:[['Deep Pockets','+25 magnet reach',{mag:25}], ['Treasure Nose','+8% item rarity',{rar:.08}],
      ['Magpie','+15% item rarity · the first item each clearing drops is raised one tier (max Coral)',{rar:.15},'rMag'], ['Quick Study','+8% XP',{xpI:.08}],
      ['Lucky Coin','+15% gold',{gld:.15}], ['Gem Polish','+15% skill gem XP',{gmx:.15}],
      ['Treasure Hunter','+15% item rarity · +20% gold',{rar:.15, gld:.2}], ['Scholar','+25% skill gem XP · +8% XP',{gmx:.25, xpI:.08}],
      ['Scavenger','+15% flask charge gain, +5% gold',{fkg:.15, gld:.05}]],
    K:['Wrecker’s Fortune','+50% item rarity, +30% gold · picking up a Coral-or-better piece heals 10% of max life and fills 20 Tide · you take 15% more damage','coin','kWF', {rar:.5, gld:.3}]}};
/* the tree itself: TREE[id] = {id, n, tx, k ('h' the Helm · 's' small · 'r' rule notable · 'b' bundle notable · 'k' keystone), g (its region), c (colour), x, y (tree units — polar:
   a region at −90° + 45°·g · X1 70 · X2 120 · X3 170 · X4 220 · X5/X6 275 ∓14° · X7/X8 330 ∓12° · XK 390 · X9 300 between regions · X10 345 · the outer keystones 400), fx, r, ic, l (links)} */
const TREE=(()=>{ const T={}, P=(r,d)=>[Math.round(r*Math.cos(d*Math.PI/180)), Math.round(r*Math.sin(d*Math.PI/180))];
  const add=(id,o)=>{ T[id]=Object.assign({id, l:[], fx:{}}, o); }, link=(a,b)=>{ T[a].l.push(b); T[b].l.push(a); };
  add('HELM',{n:'The Helm', tx:'where every course is set — free (every captain holds it)', k:'h', g:-1, c:'#fff0b0', x:0, y:0});
  TREE_REG.forEach(([p,nm,c],g)=>{ const th=-90+45*g, D=TREE_ND[p], at=[null,P(70,th),P(120,th),P(170,th),P(220,th),P(275,th-14),P(275,th+14),P(330,th-12),P(330,th+12),P(300,th+22.5),P(345,th+22.5)];
    D.n.forEach((d,i)=>{ const j=i+1, id=p+j; add(id,{n:d[0], tx:d[1], fx:d[2]||{}, r:d[3]||null, k:j===3?'r':(j===7||j===8)?'b':'s', g, c, x:at[j][0], y:at[j][1]}); });
    const K=D.K, kp=P(390,th); add(p+'K',{n:K[0], tx:K[1], ic:K[2], r:K[3], fx:K[4]||{}, k:'k', g, c, x:kp[0], y:kp[1]});
    if(D.X){ const X=D.X, xp=P(400,th+22.5), xid=p==='SE'?'RTK':'LLK'; add(xid,{n:X[0], tx:X[1], ic:X[2], r:X[3], fx:{}, k:'k', g, c, x:xp[0], y:xp[1]}); } });
  TREE_REG.forEach(([p],g)=>{ const q=TREE_REG[(g+1)%8][0];
    link('HELM',p+1); link(p+1,p+2); link(p+2,p+3); link(p+3,p+4); link(p+4,p+5); link(p+4,p+6); link(p+5,p+7); link(p+6,p+8); link(p+7,p+'K'); link(p+8,p+'K');
    link(p+3,q+3); link(p+6,p+9); link(p+9,q+5); });                     // (the inner ring · the outer ring, clockwise)
  link('SE9','SE10'); link('SE10','RTK'); link('DP9','DP10'); link('DP10','LLK');
  return T; })();
const TREE_IDS=Object.keys(TREE);

