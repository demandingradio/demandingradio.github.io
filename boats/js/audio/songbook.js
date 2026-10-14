"use strict";
/* FILE: js/audio/songbook.js
THE BARD'S SONGBOOK: the game's 23 music tracks as BTN tracker data (pure literals), plus the DEV ornament test and the
Options preview tune, moved verbatim from original lines 6203-7839 (build 5109cd5).
Entry points: none to call; it is two tables. MUS_T holds the 23 tracks keyed by id; MUS_TD holds the DEV test _orn, the
  Options preview _pv, and (at runtime) the dressed skins musSkinT caches and the _bad tunes musSelfTest writes.
Globals it owns: MUS_T (original line 6209 (build 5109cd5)) and MUS_TD (original line 7828 (build 5109cd5)), both const.
Globals it reads from elsewhere: none; every value is a literal string, number, array or object.
Read at runtime only, never at load: by the Bard (js/audio/bard.js: musNeed, musCmpNext, musCmpJob, musSkinT, musCheck,
  musInst, musJukeIds, musJuke, musRow, musRenderAll, musSelfTest), the Director (musResolve, musEval, musSting, MUS_HOOK,
  musMuffle, musPreview, from original line 7853 (build 5109cd5) onwards), musicPlay (original line 31653 (build 5109cd5))
  and the DEV panel (original line 40887 (build 5109cd5) and original line 40945 (build 5109cd5)).
Load-time statements (25): const MUS_T, an empty object (original line 6209 (build 5109cd5)); the 23 assignments
  MUS_T.theme, title, sea_day, sea_night, unknown, storm, town_small, town_big, tavern, table, crawl_a, crawl_b, cave,
  boss, victory, ko, discover, dawn, shanty, harp, deck, story, chart (original line 6213 (build 5109cd5) to original
  line 7825 (build 5109cd5)); const MUS_TD (original line 7828 (build 5109cd5)). They read nothing but MUS_T itself.
The key insertion order is load-bearing (idle compile order, jukebox list, musCheck and musRenderAll iterate it): never
  reorder the tracks. Load after js/audio/bard.js and before the Director (original line 7840 (build 5109cd5)).
*/
/* ============================ THE BARD'S SONGBOOK (PT1 M1+ — pt1_audio §3.11) — the tracks, as BTN ============================
   The BOATS motif, D A D E F♯ A ("up the rigging"), turns up — transformed — in every track (§3.11.1). Each track: n (the name) · bpm · m (the meter) · key
   (tonic + mode) · sw · hum (ms) · g · fx {rv, ec, fb, ew} · ch (≤ 8: i patch, v, p pan, s steps a bar, L layer, mono) · lv (intensity → layers) · sec (b bars
   + a line per channel) · form · loop · loops. M2b: title · sea_day · M3: sea_night · unknown · storm (+ sea_day's C & its calm air) · M4: town_small · town_big · tavern · table · M5a: crawl_a · crawl_b (+ their biome skins) · M5b: cave · boss · M6: victory (its F = the fanfare) · the stings ko · discover · dawn · shanty · harp (loop −1: once through) · deck; MUS_TD holds the DEV-only test track.
   THE MIX (M6): each track's g sets it in the whole — a loop's top level renders −20.6 … −17.8 dB RMS (30 s, the calm tunes lowest, the boss highest; lv 0
   −23.6 … −18.1), a sting ≈ 2 dB over the loops' mean over its own length (musRenderAll({from, n, lv0:1}) reads them all). A skin plays at its tune's g. */
const MUS_T={};
/* THE BOATS THEME — the reference track (§3.11.2, verbatim; every composer starts here). D Mixolydian, 6/8, 72.
   A — the call: the motif on the flute, then a reach to the octave with the Mixolydian C♮ at its climax (D D G A | D Bm C D; a half close on A, a ♭VII–I close).
   B — the answer: IV → vi → the ♭VII lift → V (G D/F♯ Em Bm | C D Em A7) — the flute climbs to B5 and falls by step to the A that turns back to the call. */
MUS_T.theme={
  n:'The BOATS Theme', bpm:72, m:'6/8', key:'D mix', sw:0, hum:3, g:1,
  fx:{rv:0.3, ec:'3/16', fb:0.25, ew:0.15},
  ch:{
    mel:{i:'flute',   v:0.8,  p:-0.15, s:6, L:'top', mono:1},
    gtr:{i:'guitar',  v:0.5,  p:0.3,   s:6, L:'base'},
    bas:{i:'ubass',   v:0.75, p:0,     s:2, L:'base'},
    pad:{i:'strings', v:0.3,  p:-0.05, s:1, L:'mid'},
    drm:{i:'kit',     v:0.45, p:0.1,   s:6, L:'top'} },
  lv:[['base'],['base','mid'],['base','mid','top']],
  sec:{
    A:{b:8,
      mel:'| d5 - a4 d5 - e5 | f#5 - - a5 - - | g5 - f#5 e5 - d5 | e5 - - - - - |'+
          '| d5 - a4 d5 - e5 | f#5 - - d6 - - | c6 - a5 g5 - e5 | d5 - - - - . |',
      gtr:'| d3 a3 d4 f#4 d4 a3 | % | g2 d3 g3 b3 g3 d3 | a2 e3 a3 c#4\' a3 e3 |'+
          '| d3 a3 d4 f#4 d4 a3 | b2 f#3 b3 d4 b3 f#3 | c3 g3 c4 e4 c4 g3 | d3 a3 d4 f#4 a4 . |',
      bas:'| d2 a2 | d2 a2 | g2 d2 | a2 e2 | d2 a2 | b2 f#2 | c2 g2 | d2 - |',
      pad:'| d4+f#4+a4 | = | d4+g4+b4 | c#4\'+e4+a4 | d4+f#4+a4 | d4+f#4+b4 | c4+e4+g4 | d4+f#4+a4 |',
      drm:'| K . k K . k | % | % | K . k K . t | K . k K . k | % | % | K . k K+T . . |' },
    B:{b:8,
      mel:'| b5 - - a5 - g5 | f#5 - - d5 - - | g5 - - e5 - f#5 | d5 - - b4 - - |'+
          '| c5 - - d5 - e5 | f#5 - g5 a5 - - | b5 - a5 g5 - e5 | a5 - - - - - |',
      gtr:'| g2 d3 g3 b3 g3 d3 | f#2 a3 d4 f#4 d4 a3 | e2 b2 e3 g3 e3 b2 | b2 f#3 b3 d4 b3 f#3 |'+
          '| c3 g3 c4 e4 c4 g3 | d3 a3 d4 f#4 d4 a3 | e3 b3 e4 g4 e4 b3 | a2 e3 a3 c#4\' e4 g4 |',
      bas:'| g2 d2 | f#2 a2 | e2 b2 | b2 f#2 | c2 g2 | d2 a2 | e2 b2 | a2 e2 |',
      pad:'| d4+g4+b4 | d4+f#4+a4 | e4+g4+b4 | d4+f#4+b4 | c4+e4+g4 | d4+f#4+a4 | e4+g4+b4 | c#4\'+e4+g4+a4 |',
      drm:'| K . k K+T . k | % | % | % | % | % | % | K . k K+C . . |' } },
  form:['A','B'], loop:0, loops:0 };
/* BOATS — OVERTURE (title). D major with the Mixolydian colour (the C♮ marked '), 6/8, 58. P A B A2 T → loop to P (≈ 75 s), loops forever.
   P  — the prelude: a harp rising two octaves and falling each bar (D Bm G A | D Bm Em7 Asus4→A, the second phrase climbing higher), strings swelling
        a bar per chord, the celesta spelling the motif one note a bar (d a d e f♯ a …), soft timpani on 1 and 5, a cymbal swell into A.
   A  — the call: the BOATS theme on the flute over the harp's rocking two-swell figure (quieter), strings and the upright; the horn joins the
        second phrase and echoes the motif's head as the flute rests.
   B  — the answer on the horn an octave down; the strings sing a descant in 8ths a 3rd / 6th above (its D♯ leans into the pivot), the harp
        eases to 8ths; timpani build from bar 5 (rolls in 7–8); its last bar lifts a tone (@t+2: A7 → B7), the pivot into E.
   A2 — the tutti in E (tr +2): strings in octaves + the flute on the tune, the horn's slow rising counter-line (F♯ A B C♯ …), the harp's full
        arpeggios, celesta sparkles on the phrase starts, the crash on its downbeat.
   T  — home to D: D · G/D · D · A7sus — the ship's bell, the celesta's last motif, the harp's sweep up into the prelude again. */
MUS_T.title={
  n:'BOATS — Overture', bpm:58, m:'6/8', key:'D ion', sw:0, hum:4, g:1,
  fx:{rv:0.36, ec:'3/16', fb:0.25, ew:0.14},
  ch:{
    har:{i:'harp',    v:0.6,  p:0.25,  s:12, L:'base'},
    mel:{i:'flute',   v:0.8,  p:-0.1,  s:6,  L:'top', mono:1},
    hrn:{i:'horn',    v:0.75, p:-0.3,  s:6,  L:'mid', mono:1},
    str:{i:'strings', v:0.32, p:0.1,   s:1,  L:'base'},
    cel:{i:'celesta', v:0.85, p:0.35,  s:6,  L:'top'},
    bas:{i:'ubass',   v:0.85, p:0,     s:2,  L:'base'},
    tim:{i:'timp',    v:0.5,  p:-0.15, s:6,  L:'mid'},
    kit:{i:'kit',     v:0.45, p:0.15,  s:6,  L:'top'} },
  lv:[['base','mid','top']],
  sec:{
    P:{b:8, s:{str:2}, v:{cel:1.4, har:0.7},
      har:'| d3 a3 e4 f#4 a4 d5 f#5 d5 a4 f#4 e4 a3 | b2 f#3 c#4 d4 f#4 b4 d5 b4 f#4 d4 c#4 f#3 | g2 d3 a3 b3 d4 g4 b4 g4 d4 b3 a3 d3 | a2 e3 b3 c#4 e4 a4 c#5 a4 e4 c#4 b3 e3 |'+
          '| d3 a3 d4 e4 f#4 a4 d5 e5 f#5 a5 f#5 d5 | b2 f#3 b3 c#4 d4 f#4 b4 c#5 d5 f#5 d5 b4 | e3 b3 d4 f#4 g4 b4 d5 f#5 g5 b5 g5 d5 | a2 e3 a3 b3 d4 e4 a4 c#5 e5 a5 e5 c#5 |',
      str:'| d4+f#4+a4 - | d4+f#4+b4 - | d4+g4+b4 - | c#4+e4+a4 - | d4+f#4+a4 - | d4+f#4+b4 - | e4+g4+b4+d5 - | e4+a4+d5 e4+a4+c#5 |',
      cel:'| d6 . . . . . | a5 . . . . . | d6 . . . . . | e6 . . . . . | f#6 . . . . . | a6 . . . . . | g6 . . . . . | e6 . . c#6 . . |',
      bas:'| d2 - | b1 - | g1 - | a1 - | d2 - | b1 - | e2 - | a1 - |',
      tim:'| d2 . . . . . | _ | _ | _ | d2 . . . . . | _ | _ | . . . a2~? - - |',
      kit:'| _ | _ | _ | _ | _ | _ | _ | C . . . . . |' },
    A:{b:8, v:{har:0.5, hrn:0.8},
      mel:'| d5 - a4 d5 - e5 | f#5 - - a5 - - | g5 - f#5 e5 - d5 | e5 - - - - - |'+
          '| d5 - a4 d5 - e5 | f#5 - - d6 - - | c6\' - a5 g5 - e5 | d5 - - - - . |',
      hrn:'| _ | _ | _ | _ | a4 - - f#4 - - | d5 - - b4 - - | c5\' - - - - - | d4 - a3 d4 - e4 |',
      har:'| d3 a3 d4 f#4 d4 a3 d3 a3 d4 f#4 a4 f#4 | % | g2 d3 g3 b3 g3 d3 g2 d3 g3 b3 d4 b3 | a2 e3 a3 c#4 a3 e3 a2 e3 a3 c#4 e4 c#4 |'+
          '| d3 a3 d4 f#4 d4 a3 d3 a3 d4 f#4 a4 f#4 | b2 f#3 b3 d4 b3 f#3 b2 f#3 b3 d4 f#4 d4 | c3\' g3 c4\' e4 c4\' g3 c3\' g3 c4\' e4 g4 e4 | d3 a3 d4 f#4 d4 a3 d3 a3 d4 f#4 a4 d5 |',
      str:'| d4+f#4+a4 | = | d4+g4+b4 | c#4+e4+a4 | d4+f#4+a4 | d4+f#4+b4 | e4+g4+c5\' | d4+f#4+a4 |',
      bas:'| d2 a2 | d2 f#2 | g2 b2 | a2 c#3 | d3 f#2 | b2 f#2 | c3\' - | d3 a2 |' },
    B:{b:8, s:{str:6, har:6}, v:{har:0.7, str:1.3},
      hrn:'| b4 - - a4 - g4 | f#4 - - d4 - - | g4 - - e4 - f#4 | d4 - - b3 - - |'+
          '| c4\' - - d4 - e4 | f#4 - g4 a4 - - | b4 - a4 g4 - e4 | @t+2 a4 - - - - - |',
      str:'| g5 f#5 e5 f#5 - e5 | d5 e5 f#5 a5 g5 f#5 | e5 f#5 g5 - - a5 | b5 a5 f#5 d5 e5 g5 |'+
          '| c6\' b5 a5 g5 a5 b5 | a5 - b5 d6 c#6 b5 | g5 - f#5 e5 - d#5\' | @t+2 e5 g5 a5 g5 e5 c#5 |',
      har:'| g2 d3 g3 b3 d4 b3 | f#2 d3 f#3 a3 d4 a3 | e2 b2 e3 g3 b3 g3 | b2 f#3 b3 d4 f#4 d4 |'+
          '| c3\' g3 c4\' e4 g4 e4 | d3 a3 d4 f#4 a4 f#4 | e3 b3 e4 g4 b4 g4 | @t+2 a2 e3 g3 c#4 e4 g4 |',
      bas:'| g2 d2 | f#2 a2 | e2 b2 | b2 f#2 | c3\' g2 | d3 a2 | e2 b2 | @t+2 a2 e2 |',
      tim:'| _ | _ | _ | _ | c3\'? . . . . . | d3? . . a2? . . | @v0.6 e3~ - - - - - | @t+2 @v0.85 a2~ - - - - - |',
      kit:'| _ | _ | _ | _ | _ | _ | _ | C . . . . . |' },
    A2:{b:8, tr:2, s:{str:6}, v:{str:1.75, hrn:0.8, har:0.7, kit:2.2},
      mel:'| d5 - a4 d5 - e5 | f#5 - - a5 - - | g5 - f#5 e5 - d5 | e5 - - - - - |'+
          '| d5 - a4 d5 - e5 | f#5 - - d6 - - | c6\' - a5 g5 - e5 | d5 - - - - . |',
      str:'| d4+d5 - a3+a4 d4+d5 - e4+e5 | f#4+f#5 - - a4+a5 - - | g4+g5 - f#4+f#5 e4+e5 - d4+d5 | e4+e5 - - - - - |'+
          '| d4+d5 - a3+a4 d4+d5 - e4+e5 | f#4+f#5 - - d5+d6 - - | c5\'+c6\' - a4+a5 g4+g5 - e4+e5 | d4+d5 - - - - . |',
      hrn:'| f#4 - - - - - | a4 - - - - - | b4 - - - - - | c#5 - - - - - | a4 - - - - - | d5 - - b4 - - | e5 - - - - - | a4 - - - - . |',
      har:'| d3 a3 e4 f#4 a4 d5 f#5 d5 a4 f#4 e4 a3 | % | g2 d3 a3 b3 d4 g4 b4 g4 d4 b3 a3 d3 | a2 e3 b3 c#4 e4 a4 c#5 a4 e4 c#4 b3 e3 |'+
          '| d3 a3 e4 f#4 a4 d5 f#5 d5 a4 f#4 e4 a3 | b2 f#3 c#4 d4 f#4 b4 d5 b4 f#4 d4 c#4 f#3 | c3\' g3 d4 e4 g4 c5\' e5 c5\' g4 e4 d4 g3 | d3 a3 e4 f#4 a4 d5 f#5 d5 a4 f#4 e4 a3 |',
      cel:'| a5 d6 f#6 a6 . . | _ | g6 d6 b5 g5 . . | _ | a5 d6 f#6 a6 . . | _ | g6 e6 c6\' g5 . . | _ |',
      bas:'| d2 a2 | d2 f#2 | g2 b2 | a2 c#3 | d3 f#2 | b2 f#2 | c3\' - | d3 a2 |',
      tim:'| d3! . . a2 . . | _ | _ | _ | d3 . . a2 . . | _ | _ | d3 . . . . . |',
      kit:'| X! . . . . . | _ | _ | _ | _ | _ | _ | _ |' },
    T:{b:4, s:{har:24},
      har:'| d3 - - - a3 - - - d4 - - - f#4 - - - a4 - - - d5 - - - | d3 - - - g3 - - - b3 - - - d4 - - - g4 - - - b4 - - - |'+
          '| d3 - - - a3 - - - d4 - - - f#4 - - - a4 - - - f#4 - - - | a2 - - - - - - - - - - - - e3 g3 a3 d4 e4 g4 a4 d5 e5 g5 a5 |',
      str:'| d4+f#4+a4 | d4+g4+b4 | d4+f#4+a4 | e4+g4+a4+d5 |',
      cel:'| _ | d6 - a5 d6 - e6 | f#6 - - a6 - - | _ |',
      bas:'| d2 - | d2 - | d2 a2 | a1 - |',
      tim:'| d2? . . . . . | _ | _ | _ |',
      kit:'| B . . . . . | _ | _ | _ |' } },
  form:['P','A','B','A2','T'], loop:0, loops:0 };

/* FAIR WINDS (sea_day). D Mixolydian, 6/8, 76. I A A2 B C A3 T → loop to A (≈ 66 s), 2 loops then a rest. Layers: 0 dead calm (base + mid) ·
   1 sailing (+ the whistle) · 2 whaling (+ the drums).
   I  — the guitar picks D, the concertina's off-beat pump; C/D (the ♭VII) leans in. Only after the title (and the session's first sea).
   A  — the theme on the tin whistle an octave up (cuts on the long notes), the guitar fingerpicked, the upright, the pump on 2-3 and 5-6; under it
        the harp's own slow air (a f♯ | e d | b d | e c♯ | d f♯ | b a | g e c | d — falling, then up to its B and home by the ♭VII): dead calm's tune.
   A2 — the fiddle takes the tune at its own octave (a turn in bar 4, a run up to B), the whistle a sparse 3rd / 6th above on the long notes,
        harp rolls on each phrase, a new picking pattern; the bodhrán comes in (whaling).
   B  — the answer on the fiddle (cuts), the strings' pad under it, a lighter pump (2 · 5) that fills out for the second phrase, the
        bodhrán with a tambourine on the 2nd beat.
   C  — the open sea (PT1 M3, the lead's note: new tune, new chords): Bm G D A | Em C Asus4 A7 — the strings sing a new air in octaves (a 6th
        leap, then down by step; the second phrase leaps higher, to E), the harp's arpeggios, the upright on roots & 5ths, the guitar strums;
        the second phrase brings the light pump back and the fiddle's soft counter-line. No whistle: its return in A3 is the homecoming.
   A3 — all in: the whistle on the tune's first phrase, then a new climax (up the D triad to the top D, down by the C♯, the ♭VII's C up to A
        and home to D); the fiddle's jig counter-line in 8ths under it, the upright in jig lilt, the pad, harp rolls.
   T  — G · A7: the whistle's b a g → a, the fiddle climbing to C♯ — handing the D back to the whistle's A.
   E  — the coda (G12 FIX: end 'A3' — the last loop skips T): the whistle's A → D held over one strum, a harp roll and the pad — the rest begins on the tonic. */
MUS_T.sea_day={
  n:'Fair Winds', bpm:76, m:'6/8', key:'D mix', sw:0, hum:4, g:1.11,
  fx:{rv:0.22, ec:'3/16', fb:0.2, ew:0.1},
  ch:{
    mel:{i:'whistle',    v:0.7,  p:-0.15, s:6, L:'top',  mono:1},
    fid:{i:'fiddle',     v:0.75, p:0.2,   s:6, L:'mid',  mono:1},
    gtr:{i:'guitar',     v:0.45, p:0.3,   s:6, L:'base'},
    con:{i:'concertina', v:0.4,  p:-0.3,  s:6, L:'base'},
    bas:{i:'ubass',      v:0.7,  p:0,     s:2, L:'base'},
    har:{i:'harp',       v:0.45, p:0.35,  s:6, L:'mid'},
    pad:{i:'strings',    v:0.32, p:-0.05, s:1, L:'mid'},
    kit:{i:'kit',        v:0.45, p:0.1,   s:6, L:'drums'} },
  lv:[['base','mid'],['base','mid','top'],['base','mid','top','drums']],
  skin:{ cold:{ch:{mel:{i:'celesta', v:1.05}, fid:{i:'flute', v:0.8}}, tr:-2, rv:0.1},   // (SEAS SE8 §3.10: the seas' dress — rime/fog/fold: a celesta lead, the fiddle's line on a cold flute)
         fire:{ch:{pad:{i:'choir', t:-12, v:0.34}, con:{i:'accordion', v:0.42}, kit:{L:'top', v:0.24, km:{K:'Q', k:'Q'}}}, tr:1},   // (ember: a warm low choir for the strings, the reed pump, a soft frame drum under the sailing)
         wet:{ch:{gtr:{i:'marimba', t:12, v:0.38}, har:{v:0.5}}, rv:0.15} },   // (shallows/mire: the strum turns to marimba plucks, the harp comes forward)
  sec:{
    I:{b:2,
      gtr:'| d3 a3 d4 f#4 d4 a3 | d3 g3 c4 e4 c4 g3 |',
      con:'| . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* | . c4+e4+g4* c4+e4+g4* . c4+e4+g4* c4+e4+g4* |' },
    A:{b:8, v:{har:1.9, gtr:0.7, con:0.8, bas:0.85, mel:1.1},   // (G13 FIX: the air leads a dead calm, the guitar, pump & bass under it — the whistle still over it once sailing)
      mel:'| d6 - a5 d6 - e6 | f#6~ - - a6~ - - | g6 - f#6 e6 - d6 | e6~ - - - - - |'+
          '| d6 - a5 d6 - e6 | f#6~ - - d7 - - | c7 - a6 g6 - e6 | d6~ - - - - . |',
      har:'| a5 - - - f#5 - | e5 - - d5 - - | b4 - - d5 - - | e5 - - - - c#5\' |'+
          '| d5 - - f#5 - - | b5 - - - a5 - | g5 - - e5 - c5 | d5 - - - - - |',
      gtr:'| d3 a3 d4 f#4 d4 a3 | d3 a3 d4 f#4 a4 f#4 | g2 d3 g3 b3 g3 d3 | a2 e3 a3 c#4\' a3 e3 |'+
          '| d3 a3 d4 f#4 d4 a3 | b2 f#3 b3 d4 b3 f#3 | c3 g3 c4 e4 c4 g3 | d3 a3 d4 f#4 a4 . |',
      con:'| . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* | % | . d4+g4+b4* d4+g4+b4* . d4+g4+b4* d4+g4+b4* | . c#4\'+e4+a4* c#4\'+e4+a4* . c#4\'+e4+a4* c#4\'+e4+a4* |'+
          '| . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* | . d4+f#4+b4* d4+f#4+b4* . d4+f#4+b4* d4+f#4+b4* | . c4+e4+g4* c4+e4+g4* . c4+e4+g4* c4+e4+g4* | . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* |',
      bas:'| d2 a2 | d2 f#2 | g2 b2 | a2 c#3\' | d3 f#2 | b2 f#2 | c3 - | d3 a2 |' },
    A2:{b:8, v:{mel:0.75},
      fid:'| d5 - a4 d5 - e5 | f#5~ - - a5 - - | g5 - f#5 e5 - d5 | e5~ - - f#5 e5 c#5\' |'+
          '| d5 - a4 d5 - e5 | f#5~ - - d6 - - | c6 - a5 g5 - e5 | d5 - - e5 f#5 a5 |',
      mel:'| _ | a5 - - f#6 - - | _ | a5 - - - - - | _ | a5 - - f#6 - - | _ | f#5 - - - - . |',
      gtr:'| d3 d4 a3 f#4 a3 d4 | % | g2 g3 d3 b3 d3 g3 | a2 a3 e3 c#4\' e3 a3 |'+
          '| d3 d4 a3 f#4 a3 d4 | b2 b3 f#3 d4 f#3 b3 | c3 c4 g3 e4 g3 c4 | d3 d4 a3 f#4 a3 d4 |',
      con:'| . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* | % | . d4+g4+b4* d4+g4+b4* . d4+g4+b4* d4+g4+b4* | . c#4\'+e4+a4* c#4\'+e4+a4* . c#4\'+e4+a4* c#4\'+e4+a4* |'+
          '| . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* | . d4+f#4+b4* d4+f#4+b4* . d4+f#4+b4* d4+f#4+b4* | . c4+e4+g4* c4+e4+g4* . c4+e4+g4* c4+e4+g4* | . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* |',
      bas:'| d2 a2 | d2 f#2 | g2 b2 | a2 c#3\' | d3 f#2 | b2 f#2 | c3 - | d3 a2 |',
      har:'| d3+a3+d4+f#4> - - - - - | _ | g2+d3+b3+g4> - - - - - | _ | d3+a3+f#4+d5> - - - - - | _ | c3+g3+e4+c5> - - - - - | _ |',
      kit:'| K . k K . k | K . k K k k | K . k K . k | K . k K+T . k |'+
          '| K . k K . k | K . k K k k | K . k K . k | K k k K+T k k |' },
    B:{b:8,
      fid:'| b5~ - - a5 - g5 | f#5 - - d5 - - | g5~ - - e5 - f#5 | d5 - - b4 - - |'+
          '| c5 - - d5 - e5 | f#5 - g5 a5~ - - | b5 - a5 g5 - e5 | a5~ - - - - - |',
      pad:'| d4+g4+b4 | d4+f#4+a4 | e4+g4+b4 | d4+f#4+b4 | c4+e4+g4 | d4+f#4+a4 | e4+g4+b4 | c#4\'+e4+g4+a4 |',
      gtr:'| g2 d3 g3 b3 d4 b3 | f#2 d3 f#3 a3 d4 a3 | e2 b2 e3 g3 b3 g3 | b2 f#3 b3 d4 f#4 d4 |'+
          '| c3 g3 c4 e4 g4 e4 | d3 a3 d4 f#4 a4 f#4 | e3 b3 e4 g4 b4 g4 | a2 e3 g3 c#4\' e4 g4 |',
      con:'| . d4+g4+b4* . . d4+g4+b4* . | . d4+f#4+a4* . . d4+f#4+a4* . | . e4+g4+b4* . . e4+g4+b4* . | . d4+f#4+b4* . . d4+f#4+b4* . |'+
          '| . c4+e4+g4* c4+e4+g4* . c4+e4+g4* c4+e4+g4* | . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* | . e4+g4+b4* e4+g4+b4* . e4+g4+b4* e4+g4+b4* | . c#4\'+e4+g4* c#4\'+e4+g4* . c#4\'+e4+g4* c#4\'+e4+g4* |',
      bas:'| g2 d2 | f#2 a2 | e2 b2 | b2 f#2 | c3 g2 | d3 a2 | e2 b2 | a2 e2 |',
      kit:'| K . k K+T . k | % | % | K . k K+T k k |'+
          '| K . k K+T . k | % | % | K k k K+C . . |' },
    C:{b:8, s:{pad:6}, v:{pad:1.8, gtr:0.8, fid:0.7, har:0.8},
      pad:'| d4+d5 - - b4+b5 - - | a4+a5 - - - g4+g5 - | f#4+f#5 - - - - - | e4+e5 - - - c#4\'+c#5\' - |'+
          '| g4+g5 - - e5+e6 - - | d5+d6 - - - c5+c6 - | b4+b5 - - - a4+a5 - | g4+g5 - - - - - |',
      har:'| b2 f#3 b3 d4 f#4 d4 | g2 d3 g3 b3 d4 b3 | d3 a3 d4 f#4 a4 f#4 | a2 e3 a3 c#4\' e4 c#4\' |'+
          '| e2 b2 e3 g3 b3 g3 | c3 g3 c4 e4 g4 e4 | a2 e3 d4 a3 c#4\' e4 | a2 e3 g3 c#4\' e4 g4 |',
      bas:'| b1 f#2 | g1 d2 | d2 a2 | a1 e2 | e2 b2 | c2 g2 | a1 e2 | a1 - |',
      gtr:'| b2+f#3+b3+d4> - - - - - | g2+d3+g3+b3> - - - - - | d3+a3+d4+f#4> - - - - - | a2+e3+a3+c#4\'> - - - - - |'+
          '| e2+b2+e3+g3> - - e2+b2+e3+g3< - - | c3+g3+c4+e4> - - c3+g3+c4+e4< - - | a2+e3+a3+d4> - - a2+e3+a3+c#4\'< - - | a2+e3+g3+c#4\'> - - a2+e3+g3+c#4\'< - - |',
      con:'| _ | _ | _ | _ |'+
          '| . e4+g4+b4* . . e4+g4+b4* . | . c4+e4+g4* . . c4+e4+g4* . | . d4+e4+a4* . . c#4\'+e4+a4* . | . c#4\'+e4+g4* . . c#4\'+e4+g4* . |',
      fid:'| _ | _ | _ | _ |'+
          '| b4 - - - - - | e5 - - - - - | d5 - - - c#5\' - | e5 - - - - - |',
      kit:'| K . . . . . | % | % | K . . K . . |'+
          '| K . k K . . | % | % | K . k K+C . . |' },
    A3:{b:8, s:{bas:6}, v:{fid:0.72},
      mel:'| d6 - a5 d6 - e6 | f#6~ - - a6~ - - | g6 - f#6 e6 - d6 | e6~ - - f#6 e6 c#6\' |'+
          '| f#6 - a6 d7 - - | d7 - c#7\' b6 - a6 | g6 - e6 c7 - - | a6 - - d6~ - . |',
      fid:'| f#5 e5 d5 a5 g5 f#5 | d6 b5 a5 f#5 a5 c6 | b5 g5 d5 g5 b5 d6 | c#6\' b5 a5 e5 f#5 e5 |'+
          '| d6 c#6\' b5 a5 f#5 a5 | f#5 a5 b5 d6 c#6\' b5 | e6 d6 c6 g5 e5 g5 | f#5 e5 d5 a4 d5 f#5 |',
      gtr:'| d3 a3 d4 f#4 d4 a3 | d3 a3 d4 f#4 a4 f#4 | g2 d3 g3 b3 g3 d3 | a2 e3 a3 c#4\' a3 e3 |'+
          '| d3 a3 d4 f#4 d4 a3 | b2 f#3 b3 d4 b3 f#3 | c3 g3 c4 e4 c4 g3 | d3 a3 d4 f#4 a4 . |',
      con:'| . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* | % | . d4+g4+b4* d4+g4+b4* . d4+g4+b4* d4+g4+b4* | . c#4\'+e4+a4* c#4\'+e4+a4* . c#4\'+e4+a4* c#4\'+e4+a4* |'+
          '| . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* | . d4+f#4+b4* d4+f#4+b4* . d4+f#4+b4* d4+f#4+b4* | . c4+e4+g4* c4+e4+g4* . c4+e4+g4* c4+e4+g4* | . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* |',
      bas:'| d2 - d2 a2 - a2 | d2 - d2 f#2 - f#2 | g2 - g2 b2 - b2 | a2 - a2 c#3\' - c#3\' |'+
          '| d3 - d3 f#2 - f#2 | b2 - b2 f#2 - f#2 | c3 - c3 e3 - c3 | d3 - d3 a2 - a2 |',
      har:'| d3+a3+d4+f#4> - - - - - | _ | g2+d3+b3+g4> - - - - - | _ | d3+a3+f#4+d5> - - - - - | _ | c3+g3+e4+c5> - - - - - | _ |',
      pad:'| d4+f#4+a4 | = | d4+g4+b4 | c#4\'+e4+a4 | d4+f#4+a4 | d4+f#4+b4 | c4+e4+g4 | d4+f#4+a4 |',
      kit:'| K . k K+T . k | K k k K+T . k | K . k K+T . k | K . k K+T k k |'+
          '| K . k K+T . k | K k k K+T . k | K . k K+T . k | K k k K+T k k |' },
    T:{b:2,
      mel:'| b5 - - a5 - g5 | a5 - - - - . |',
      fid:'| g5 b5 d6 b5 a5 g5 | e5 g5 a5 c#6\' b5 c#6\' |',
      gtr:'| g2 d3 g3 b3 d4 b3 | a2 e3 g3 c#4\' e4 g4 |',
      con:'| . d4+g4+b4* d4+g4+b4* . d4+g4+b4* d4+g4+b4* | . c#4\'+e4+g4* c#4\'+e4+g4* . c#4\'+e4+g4* c#4\'+e4+g4* |',
      bas:'| g2 d2 | a2 e2 |',
      har:'| g3+b3+d4+g4> - - - - - | a3+c#4\'+e4+a4> - - - - - |',
      pad:'| d4+g4+b4 | c#4\'+e4+a4 |',
      kit:'| K . k K+T . k | K k k K+C k k |' },
    E:{b:2,
      mel:'| a5 - - d6~ - - | - - - - - . |',
      fid:'| f#5 - - - - - | - - - - - . |',
      gtr:'| d3+a3+d4+f#4> - - - - - | _ |',
      con:'| d4+f#4+a4 - - - - - | - - - . . . |',
      bas:'| d2 - | - . |',
      har:'| d3+a3+f#4+d5> - - - - - | _ |',
      pad:'| d4+f#4+a4 | = |',
      kit:'| K . . . . . | _ |' } },
  form:['I','A','A2','B','C','A3','T'], loop:1, loops:2, end:'A3', coda:'E' };

/* NIGHT WATCH (sea_night). G major (one Lydian C♯ as a passing colour), a 3/4 waltz at 84. A B A2 C → loop (≈ 69 s), 2 loops then the coda E
   and a rest. Stars on black water — a lullaby.
   A  — the motif, augmented, on the celesta: G . . D | G . . A | B —— | D —— (up the rigging, slowed to starlight), answered in the same
        rhythm going down — E . . D | B . . G | C . . B | A —— (a half close); the harp's waltz (the bass on 1, the chord in 8ths), the
        strings barely there, the pizzicato on 1 (G C Em D | G Em Am7 D).
   B  — a new, tender tune on the low flute (B . . A G | F♯ —— | E . . G C | B —— | E . . D C | A —— | B . . A G | G . . F♯): the soft
        piano's chords on 2 and 3, the harp lighter, the celesta answering in the flute's long notes — its C♯ over Bm the Lydian glint (Em Bm C G | Am D Em C–D).
   A2 — the motif's tune again on the ocarina (it sings where the celesta rang), the celesta twinkling above its long notes, the harp's full
        arpeggios.
   C  — the motif in full on the ocarina and the celesta (an octave up, then together): G . D G | A B D | E —— | D . . C B | A . . C | B . . A
        | G —— and the ocarina's pickup D; the low flute's counter-line, the strings fuller (G D Em C | Am7 D G D7).
   Every 8-bar phrase closes with the ship's bell, twice (the watch).
   E  — the coda (after C on the last loop): G — the celesta's B D G rising into the dark, the piano's rolled chord, the last two bells. */
MUS_T.sea_night={
  n:'Night Watch', bpm:84, m:'3/4', key:'G ion', sw:0, hum:5, g:1.1,
  fx:{rv:0.38, ec:'1/4', fb:0.28, ew:0.14},
  ch:{
    cel:{i:'celesta', v:1.0,  p:0.3,   s:6, L:'top'},
    oca:{i:'ocarina', v:0.8,  p:-0.15, s:6, L:'top', mono:1},
    flt:{i:'flute',   v:0.72, p:-0.25, s:6, L:'mid', mono:1},
    har:{i:'harp',    v:0.5,  p:0.2,   s:6, L:'base'},
    pad:{i:'strings', v:0.22, p:0,     s:1, L:'base'},
    key:{i:'keys',    v:0.5,  p:-0.1,  s:3, L:'mid'},
    bas:{i:'pizz',    v:0.6,  p:0.05,  s:3, L:'base'},
    kit:{i:'kit',     v:0.35, p:0.25,  s:6, L:'base'} },
  lv:[['base','mid','top']],
  skin:{ cold:{ch:{oca:{i:'musicbox', v:1.3}}, tr:-2, rv:0.1},   // (SEAS SE8 §3.10: the seas' dress — rime/fog/fold: the celesta & a music-box lead)
         fire:{ch:{pad:{i:'choir', v:0.24}, flt:{i:'horn', t:-12, v:0.62}}, tr:1},   // (ember: a warm choir pad, the low flute's counter-line on a soft horn · the watch's bell is the night's only drum)
         wet:{ch:{key:{i:'marimba', v:0.48}, pad:{i:'harp', v:0.36}}, rv:0.15} },   // (shallows/mire: the piano's chords on marimba, the pad as harp plucks)
  sec:{
    A:{b:8, v:{har:0.65, cel:1.15},
      cel:'| g5 - - - d5 - | g5 - - - a5 - | b5 - - - - - | d6 - - - - - |'+
          '| e6 - - - d6 - | b5 - - - g5 - | c6 - - - b5 - | a5 - - - - - |',
      har:'| g2 - b3 d4 g4 d4 | c3 - g3 c4 e4 c4 | e2 - b3 e4 g4 e4 | d3 - a3 d4 f#4 d4 |'+
          '| g2 - b3 d4 g4 b4 | e2 - b3 e4 g4 b4 | a2 - e3 a3 e4 g4 | d3 - a3 d4 f#4 a4 |',
      pad:'| b3+d4+g4 | c4+e4+g4 | b3+e4+g4 | a3+d4+f#4 | b3+d4+g4 | b3+e4+g4 | a3+e4+g4 | a3+d4+f#4 |',
      bas:'| g2 . . | c3 . . | e2 . . | d3 . . | g2 . . | e2 . . | a2 . . | d3 . . |',
      kit:'| _ | _ | _ | _ | _ | _ | _ | . . . . B B? |' },
    B:{b:8, v:{har:0.7, key:0.75, flt:1.15},
      flt:'| b4 - - a4 g4 - | f#4 - - - - - | e4 - - g4 c5 - | b4 - - - - - |'+
          '| e5 - - d5 c5 - | a4 - - - - - | b4 - - a4 g4 - | g4 - - - f#4 - |',
      key:'| . g3+b3+e4 g3+b3+e4 | . f#3+b3+d4 f#3+b3+d4 | . g3+c4+e4 g3+c4+e4 | . g3+b3+d4 g3+b3+d4 |'+
          '| . a3+c4+e4 a3+c4+e4 | . f#3+a3+d4 f#3+a3+d4 | . g3+b3+e4 g3+b3+e4 | . g3+c4+e4 a3+d4+f#4 |',
      har:'| e2 - - - b3 e4 | b2 - - - f#3 b3 | c3 - - - g3 c4 | g2 - - - d3 g3 |'+
          '| a2 - - - e3 a3 | d3 - - - a3 d4 | e2 - - - b3 e4 | c3 - - - a3 d4 |',
      cel:'| _ | . . . . c#6\' b5 | _ | . . . . g5 d6 | _ | _ | _ | _ |',
      oca:'| _ | _ | _ | _ | _ | f#5 - - - - - | _ | e5 - - - d5 - |',
      pad:'| e3+b3 | f#3+b3 | g3+c4 | d3+g3 | e3+a3 | f#3+a3 | e3+b3 | e3+a3 |',
      bas:'| e2 . . | b2 . . | c3 . . | g2 . . | a2 . . | d3 . . | e2 . . | c3 . d3 |',
      kit:'| _ | _ | _ | _ | _ | _ | _ | . . . . B B? |' },
    A2:{b:8, v:{pad:1.2, har:0.9},
      oca:'| g5 - - - d5 - | g5 - - - a5 - | b5 - - - a5 b5 | d6 - - - - - |'+
          '| e6 - - - d6 - | b5 - - - g5 - | c6 - - - b5 - | a5 - - - - - |',
      cel:'| _ | _ | . . g6 . e6 . | . . a6 . f#6 . | _ | _ | . . a6 . e6 . | . . f#6 . d6 . |',
      har:'| g2 d3 b3 d4 g4 b4 | c3 g3 e4 g4 c5 g4 | e2 b2 g3 b3 e4 g4 | d3 a3 f#4 a4 d5 a4 |'+
          '| g2 d3 b3 d4 g4 d5 | e2 b2 g3 b3 e4 b4 | a2 e3 a3 e4 g4 e4 | d3 a3 c4 f#4 a4 d5 |',
      pad:'| b3+d4+g4 | c4+e4+g4 | b3+e4+g4 | a3+d4+f#4 | b3+d4+g4 | b3+e4+g4 | a3+e4+g4 | a3+c4+d4+f#4 |',
      bas:'| g2 . . | c3 . . | e2 . . | d3 . . | g2 . . | e2 . . | a2 . . | d3 . . |',
      kit:'| _ | _ | _ | _ | _ | _ | _ | . . . . B B? |' },
    C:{b:8, v:{pad:1.25, har:0.9, flt:0.75},
      oca:'| g5 - - d5 g5 - | a5 - b5 - d6 - | e6 - - - - - | d6 - - - c6 b5 |'+
          '| a5 - - - c6 - | b5 - - - a5 - | g5 - - - - - | . . . . d5 - |',
      cel:'| g6 - - d6 g6 - | a6 - b6 - d7 - | e6 - - - - - | d6 - - - c6 b5 |'+
          '| a5 - - - c6 - | b5 - - - a5 - | g5 - - - b5 d6 | . . a6 . f#6 . |',
      flt:'| b4 - - - - - | a4 - - - f#4 - | g4 - - - b4 - | e4 - - - g4 - |'+
          '| c5 - - - e5 - | d5 - - - a4 - | b4 - - - d5 - | a4 - - - - - |',
      har:'| g2 d3 g3 b3 d4 g4 | d3 a3 d4 f#4 a4 d5 | e2 b2 e3 g3 b3 e4 | c3 g3 c4 e4 g4 c5 |'+
          '| a2 e3 g3 c4 e4 a4 | d3 a3 d4 f#4 a4 f#4 | g2 d3 g3 b3 d4 b3 | d3 a3 c4 f#4 a4 c5 |',
      pad:'| g3+b3+d4+g4 | f#3+a3+d4+f#4 | b3+e4+g4 | g3+c4+e4+g4 | g3+a3+c4+e4 | f#3+a3+d4+f#4 | g3+b3+d4+g4 | f#3+a3+c4+d4 |',
      bas:'| g2 . . | d3 . . | e2 . . | c3 . . | a2 . . | d3 . . | g2 . . | d3 . . |',
      kit:'| _ | _ | _ | _ | _ | _ | _ | . . . . B B? |' },
    E:{b:2,
      cel:'| b5 - d6 - g6 - | - - - - - . |',
      key:'| g3+b3+d4+g4> - - | - - . |',
      har:'| g2 d3 b3 d4 g4 b4 | _ |',
      pad:'| b3+d4+g4 | = |',
      bas:'| g2 . . | _ |',
      kit:'| . . . . B B? | _ |' } },
  form:['A','B','A2','C'], loop:0, loops:2, end:'C', coda:'E' };

/* BEYOND THE CHART (unknown) — the owner's own request: the music of sailing into the fog off the chart. D Lydian (the raised G♯), 6/8 at 64;
   B in B minor, C the horizon in plain D. I A B A2 C → loop to A (60 s), 3 loops, then the coda and a rest. Layers: 1 near home (base + mid) ·
   2 the farlands, past the Guild's line (+ the choir).
   I  — a fresh entry only: the lookout's cry — the solo horn calls the motif (d a d e f♯ a) over the strings' low open fifth (the choir's too, far
        out) and one timpani stroke, holds its A while the echo carries it off over the water; a glock star, a cymbal swell into A.
   A  — the floating sound: the harp's ripple of four notes over the 6/8 (three against two), D and E-over-D a bar each (I and the Lydian II),
        climbing a little each bar; the strings swell over the D pedal; glock stars off the beat; the horn's tune: a d e | f♯ b | a —— |
        b g♯ f♯ e (the Lydian answer, on the II) then higher: a d e | f♯ b c♯ | d — a | b —— (it ends open, on the 6th).
   B  — a touch of danger, B minor: the strings sing the theme's answer bent to minor in octaves (f♯ e d | c♯ a | d b d | c♯ e … g f♯ e d |
        c♯), the timpani's heartbeat on each 1, the horn low on the roots, the harp's dark ripple, two cold stars, the choir's chords far out —
        the danger's colour, so the choir is already singing by A2 (Bm A G A).
   A2 — as A with the harp an octave down: the flute sings the full motif, stretched across the floating bars (d a d e | f♯ —— | a ——) on
        to the horizon's B and the Lydian answer (b g♯ f♯ e), the horn's slow counter-line falling under it, the choir in open 5ths (far).
   C  — the horizon: the motif in horn & flute octaves over G A Bm D/F♯ | G A D — climbing to the top D (the Lydian G♯ gives way to G♮:
        land in sight); the crash on its downbeat, the harp's sweeping arpeggios, the timpani's roll into the arrival, the choir (far).
   E  — the coda: D held with its 9th, the horn's last motif head echoing, a final glock star on the G♯ — wonder, not an ending. */
MUS_T.unknown={
  n:'Beyond the Chart', bpm:64, m:'6/8', key:'D lyd', sw:0, hum:5, g:1,
  fx:{rv:0.42, ec:'3/8', fb:0.32, ew:0.17},
  ch:{
    har:{i:'harp',    v:0.5,  p:0.3,   s:12, L:'base'},
    str:{i:'strings', v:0.3,  p:-0.1,  s:1,  L:'base'},
    hrn:{i:'horn',    v:0.75, p:-0.3,  s:6,  L:'mid', mono:1},
    glk:{i:'glock',   v:0.55, p:0.4,   s:6,  L:'mid'},
    tim:{i:'timp',    v:0.5,  p:-0.15, s:6,  L:'mid'},
    flt:{i:'flute',   v:0.78, p:-0.05, s:6,  L:'mid', mono:1},
    cho:{i:'choir',   v:0.5,  p:0.05,  s:1,  L:'far'},
    kit:{i:'kit',     v:0.45, p:0.15,  s:6,  L:'mid'} },
  lv:[['base','mid'],['base','mid'],['base','mid','far']],
  sec:{
    I:{b:4, v:{cho:0.6},
      str:'| d2+a2 | = | = | = |',
      hrn:'| d4 - a3 d4 - e4 | f#4 - - a4 - - | - - - - - . | _ |',
      tim:'| d2 . . . . . | _ | _ | _ |',
      glk:'| _ | _ | . . . . e7 . | . . a6 . . . |',
      cho:'| d3+a3 | = | = | = |',
      kit:'| _ | _ | _ | C . . . . . |' },
    A:{b:8, v:{har:0.7, str:0.85},
      har:'| d5 a5 d6 f#6 d5 a5 d6 f#6 d5 a5 d6 f#6 | e5 b5 e6 g#6 e5 b5 e6 g#6 e5 b5 e6 g#6 |'+
          '| d5 a5 d6 f#6 d5 a5 d6 f#6 d5 a5 d6 a6 | e5 b5 e6 g#6 e5 b5 e6 g#6 e5 b5 e6 b6 |'+
          '| f#5 a5 d6 f#6 f#5 a5 d6 f#6 f#5 a5 d6 f#6 | g#5 b5 e6 g#6 g#5 b5 e6 g#6 g#5 b5 e6 g#6 |'+
          '| a5 d6 f#6 a6 a5 d6 f#6 a6 a5 d6 f#6 a6 | b5 e6 g#6 b6 b5 e6 g#6 b6 b5 e6 g#6 e6 |',
      str:'| d2+a2+f#4+a4 | d2+b3+e4+g#4 | d2+a2+f#4+a4 | d2+b3+e4+g#4 | d2+a2+f#4+a4 | d2+b3+e4+g#4 | d2+a2+a4+d5 | d2+e4+b4+e5 |',
      hrn:'| a3 - - d4 - e4 | f#4 - - b4 - - | a4 - - - - - | b4 - g#4 f#4 e4 - |'+
          '| a3 - - d4 - e4 | f#4 - - b4 - c#5 | d5 - - - - a4 | b4 - - - - - |',
      glk:'| . . . . a6 . | . e7 . . . . | . . . . f#6 . | . . b6 . . . | . . . . d7 . | . e7 . . . . | . . . . a6 . | . . f#7 . . . |',
      flt:'| _ | _ | _ | . . . b5 g#5 f#5 | e5 - - - - - | _ | _ | _ |',
      kit:'| _ | _ | _ | _ | _ | _ | _ | C . . . . . |' },
    B:{b:8, s:{str:6}, v:{str:2.0, hrn:0.7, har:0.6, cho:0.6},
      str:'| f#4+f#5 - - e4+e5 - d4+d5 | c#4+c#5 - - a3+a4 - - | d4+d5 - - b3+b4 - d4+d5 | c#4+c#5 - - e4+e5 - - |'+
          '| d4+d5 - - e4+e5 - f#4+f#5 | c#4+c#5 - d4+d5 e4+e5 - - | g4\'+g5\' - f#4+f#5 e4+e5 - d4+d5 | c#4+c#5 - - - - - |',
      har:'| b2 f#3 b3 d4 b2 f#3 b3 d4 b2 f#3 b3 d4 | a2 e3 a3 c#4 a2 e3 a3 c#4 a2 e3 a3 c#4 |'+
          '| g2\' d3 g3\' b3 g2\' d3 g3\' b3 g2\' d3 g3\' b3 | a2 e3 a3 c#4 a2 e3 a3 c#4 a2 e3 a3 e4 |'+
          '| b2 f#3 b3 d4 b2 f#3 b3 d4 b2 f#3 b3 d4 | a2 e3 a3 c#4 a2 e3 a3 c#4 a2 e3 a3 c#4 |'+
          '| g2\' d3 g3\' b3 g2\' d3 g3\' b3 g2\' d3 g3\' b3 | a2 e3 a3 c#4 a2 e3 a3 c#4 e4 a4 c#5 e5 |',
      hrn:'| b2 - - - - - | a2 - - - - - | g2\' - - - - - | a2 - - - - - |'+
          '| b2 - - - - - | a2 - - - - - | g2\' - - - - - | a2 - - - - - |',
      tim:'| b2! b2? . . . . | a2! a2? . . . . | g2\'! g2\'? . . . . | a2! a2? . . . . |'+
          '| b2! b2? . . . . | a2! a2? . . . . | g2\'! g2\'? . . . . | a2! a2? . . . . |',
      cho:'| d4+f#4+b4 | e4+a4+c#5 | b3+d4+g4\' | c#4+e4+a4 | d4+f#4+b4 | c#4+e4+a4 | b3+d4+g4\' | c#4+e4+a4 |',
      glk:'| _ | _ | _ | . . . . c#7 . | _ | _ | _ | . . e7 . . . |',
      kit:'| _ | _ | _ | _ | _ | _ | _ | C . . . . . |' },
    A2:{b:8, v:{hrn:0.75, har:0.6, cho:0.7},
      har:'| d4 a4 d5 f#5 d4 a4 d5 f#5 d4 a4 d5 f#5 | e4 b4 e5 g#5 e4 b4 e5 g#5 e4 b4 e5 g#5 |'+
          '| d4 a4 d5 f#5 d4 a4 d5 f#5 d4 a4 d5 a5 | e4 b4 e5 g#5 e4 b4 e5 g#5 e4 b4 e5 b5 |'+
          '| f#4 a4 d5 f#5 f#4 a4 d5 f#5 f#4 a4 d5 f#5 | g#4 b4 e5 g#5 g#4 b4 e5 g#5 g#4 b4 e5 g#5 |'+
          '| a4 d5 f#5 a5 a4 d5 f#5 a5 a4 d5 f#5 a5 | b4 e5 g#5 b5 b4 e5 g#5 b5 b4 e5 g#5 b5 |',
      str:'| d2+f#4+a4 | d2+e4+g#4 | d2+f#4+a4 | d2+e4+g#4 | d2+f#4+a4 | d2+e4+g#4 | d2+a4+d5 | d2+e4+b4 |',
      flt:'| d6 - a5 d6 - e6 | f#6 - - - - - | a6 - - - - - | b6 - g#6 f#6 - e6 |'+
          '| a6 - - f#6 - d6 | e6 - - - - - | d6 - - e6 - f#6 | e6 - - - - - |',
      hrn:'| a3 - - - - - | b3 - - - - - | f#3 - - - - - | e3 - - - - - |'+
          '| d4 - - - - - | b3 - - - - - | a3 - - - - - | b3 - - - - - |',
      cho:'| d4+a4 | e4+b4 | f#4+a4 | g#4+b4 | f#4+a4 | e4+b4 | f#4+d5 | g#4+b4 |',
      glk:'| . . . . a6 . | . . e7 . . . | . . . . d7 . | . f#7 . . . . | . . . . a6 . | . . b6 . . . | . . . . f#7 . | . . e7 . . . |',
      tim:'| _ | _ | _ | _ | _ | _ | _ | . . . d2~ - - |',
      kit:'| _ | _ | _ | _ | _ | _ | _ | C . . . . . |' },
    C:{b:8, s:{har:6}, v:{str:1.3, cho:0.6},
      flt:'| d5 - a4 d5 - e5 | f#5 - - a5 - - | b5 - - d6 - - | a5 - - - f#5 - |'+
          '| g5\' - - b5 - - | a5 - - c#6 - e6 | d6 - - - - - | - - - - - . |',
      hrn:'| d4 - a3 d4 - e4 | f#4 - - a4 - - | b4 - - d5 - - | a4 - - - f#4 - |'+
          '| g4\' - - b4 - - | a4 - - c#5 - e5 | d5 - - - - - | - - - - - . |',
      str:'| g2\'+d3+b3 | a2+e3+c#4 | b2+f#3+d4 | f#2+a3+d4 | g2\'+d3+b3 | a2+e3+c#4 | d2+a3+f#4 | d2+a2+f#4 |',
      har:'| g2\' d3 g3\' b3 d4 g4\' | a2 e3 a3 c#4 e4 a4 | b2 f#3 b3 d4 f#4 b4 | f#2 a2 d3 f#3 a3 d4 |'+
          '| g3\' b3 d4 g4\' b4 d5 | a3 c#4 e4 a4 c#5 e5 | d3 a3 d4 f#4 a4 d5 | d5 a5 d6 f#6 a6 d6 |',
      cho:'| d4+g4\'+b4 | e4+a4+c#5 | f#4+b4+d5 | f#4+a4+d5 | d4+g4\'+b4 | e4+a4+c#5 | f#4+a4+d5 | f#4+a4+d5 |',
      glk:'| _ | . . a6 . . . | . . . . b6 . | . . f#7 . . . | _ | . . c#7 . . . | d7 . . a6 . . | . . . . f#7 . |',
      tim:'| g2\'! . . . . . | _ | _ | _ | g2\' . . . . . | . . . a2~ - - | d2! . . . . . | _ |',
      kit:'| X! . . . . . | _ | _ | _ | _ | C . . . . . | _ | _ |' },
    E:{b:2, v:{cho:0.6},
      str:'| d2+a2+e4+a4 | = |',
      har:'| d4 . a4 . e5 . a5 . d6 . e6 . | _ |',
      hrn:'| d4 - a3 d4 - - | - - - - - . |',
      glk:'| _ | . . . g#6 . . |',
      cho:'| d4+e4+a4 | = |' } },
  form:['I','A','B','A2','C'], loop:1, loops:3, end:'C', coda:'E' };

/* SQUALL (storm). D minor (the V's C♯ marked), 6/8 at 104 — a jig in a gale. A B A2 C D → loop (≈ 46 s), on for as long as the storm blows.
   Layers: 1 a squall (base + mid) · 2 a gale — a tempest or a storm past 0.75 (+ the big drum, the crash, the timpani, the choir).
   A  — the low strings' staccato ostinato (d · a d · f) interlocking with the accordion's off-beat stabs, the bodhrán's drive; the motif in minor
        on the horn (d a d e | f — a) then down from the ♭VI (b♭ a g f | e ——) · again, down from the ♭VII to the A (Dm Dm B♭ A7 | Dm Dm C A7).
   B  — hope through the spray, the relative major: F C Dm A — the horn's broad tune (a — c | e — d c | d —— | c♯ — a …), the fiddle's
        tremolo above it in 16ths, a tambourine on the 2nd beat.
   A2 — the motif on the fiddle an octave up with cuts, the horn heaving under it (a — f · a — d · b♭ — f · a — e).
   C  — heave-ho: the Andalusian fall Dm C B♭ A twice, call & response — the horn calls (a f d | e), the fiddle answers (d b♭ f | e), the
        horn calls higher (a c d | e), the fiddle climbs (f b♭ d | e c♯ a); stomps & claps for the bodhrán.
   D  — the gale's peak, a tone up (E minor, tr +2): the fiddle and the horn in octaves on a long wailing line (a — | d — c b♭ | b♭ — g d
        | c♯ —), then the fiddle alone up to its top while the horn heaves; the last bar falls back to the real A7 (@t-2) and round to A. */
MUS_T.storm={
  n:'Squall', bpm:104, m:'6/8', key:'D aeo', sw:0, hum:3, g:1,
  fx:{rv:0.2, ec:'3/16', fb:0.15, ew:0.06},
  ch:{
    low:{i:'strings',   v:0.6,  p:0,     s:6,  L:'base'},
    hrn:{i:'horn',      v:0.9,  p:-0.25, s:6,  L:'mid', mono:1},
    fid:{i:'fiddle',    v:0.7,  p:0.25,  s:6,  L:'mid', mono:1},
    acc:{i:'accordion', v:0.5,  p:-0.35, s:6,  L:'base'},
    kit:{i:'kit',       v:0.42, p:0.1,   s:6,  L:'base'},
    big:{i:'kit',       v:0.5,  p:0,     s:6,  L:'gale'},
    tim:{i:'timp',      v:0.55, p:-0.1,  s:6,  L:'gale'},
    cho:{i:'choir',     v:0.5,  p:0.05,  s:1,  L:'gale'} },
  lv:[['base','mid'],['base','mid'],['base','mid','gale']],
  sec:{
    A:{b:8, v:{cho:0.55},
      low:'| d2!* . a2* d2!* . f2* | % | bb1!* . f2* bb1!* . d2* | a1!* . e2* a1!* . c#2\'* |'+
          '| d2!* . a2* d2!* . f2* | % | c2!* . g2* c2!* . e2* | a1!* . e2* a1!* . g2* |',
      acc:'| . d4+f4+a4* . . d4+f4+a4* . | % | . d4+f4+bb4* . . d4+f4+bb4* . | . c#4\'+e4+g4+a4* . . c#4\'+e4+g4+a4* . |'+
          '| . d4+f4+a4* . . d4+f4+a4* . | % | . c4+e4+g4* . . c4+e4+g4* . | . c#4\'+e4+g4+a4* . . c#4\'+e4+g4+a4* . |',
      kit:'| K! k k K k k | K k k K k k | K! k k K k k | K k k K k K |'+
          '| K! k k K k k | K k k K k k | K! k k K k k | K k K K k K |',
      hrn:'| d4 - a3 d4 - e4 | f4 - - a4 - - | bb4 - a4 g4 - f4 | e4 - - - - - |'+
          '| d4 - a3 d4 - e4 | f4 - - a4 - - | c5 - bb4 a4 - g4 | a4 - - - - - |',
      big:'| X+D . . . . . | D . . . . . | D . . . . . | D . . D . D |'+
          '| X+D . . . . . | D . . . . . | D . . . . . | D . D D . D |',
      tim:'| _ | _ | _ | a2~ - - - - - | _ | _ | _ | a2~ - - - - - |',
      cho:'| d4+f4+a4 | = | d4+f4+bb4 | a3+e4+a4 | d4+f4+a4 | = | c4+e4+g4 | c#4\'+e4+a4 |' },
    B:{b:8, s:{fid:12}, v:{fid:0.6, cho:0.55},
      hrn:'| a4 - - - - c5 | e5 - - - d5 c5 | d5 - - - - - | c#5\' - - a4 - - |'+
          '| f4 - - a4 - c5 | e5 - - - - - | d5 - - a4 - - | a4 - - e5 - c#5\' |',
      fid:'| c6 c6 c6 c6 c6 c6 a5 a5 a5 a5 a5 a5 | g5 g5 g5 g5 g5 g5 c6 c6 c6 c6 c6 c6 | a5 a5 a5 a5 a5 a5 f5 f5 f5 f5 f5 f5 | e5 e5 e5 e5 e5 e5 a5 a5 a5 a5 a5 a5 |'+
          '| c6 c6 c6 c6 c6 c6 f6 f6 f6 f6 f6 f6 | e6 e6 e6 e6 e6 e6 g6 g6 g6 g6 g6 g6 | f6 f6 f6 f6 f6 f6 d6 d6 d6 d6 d6 d6 | c#6\' c#6\' c#6\' c#6\' c#6\' c#6\' e6 e6 e6 e6 e6 e6 |',
      low:'| f2!* . c3* f2!* . a2* | c2!* . g2* c2!* . e2* | d2!* . a2* d2!* . f2* | a1!* . e2* a1!* . c#2\'* |'+
          '| f2!* . c3* f2!* . a2* | c2!* . g2* c2!* . g2* | d2!* . a2* d2!* . f2* | a1!* . e2* a1!* . c#2\'* |',
      acc:'| . c4+f4+a4* . . c4+f4+a4* . | . c4+e4+g4* . . c4+e4+g4* . | . d4+f4+a4* . . d4+f4+a4* . | . c#4\'+e4+a4* . . c#4\'+e4+a4* . |'+
          '| . c4+f4+a4* . . c4+f4+a4* . | . c4+e4+g4* . . c4+e4+g4* . | . d4+f4+a4* . . d4+f4+a4* . | . c#4\'+e4+a4* . . c#4\'+e4+a4* . |',
      kit:'| K! k k K+T k k | K k k K+T k k | K! k k K+T k k | K k k K+T k K |'+
          '| K! k k K+T k k | K k k K+T k k | K! k k K+T k k | K k K K+T K K |',
      big:'| X+D . . . . . | D . . . . . | D . . . . . | D . . D . . |'+
          '| X+D . . . . . | D . . . . . | D . . . . . | D . . D . D |',
      tim:'| _ | _ | _ | a2~ - - - - - | _ | _ | _ | a2~ - - - - - |',
      cho:'| c4+f4+a4 | c4+e4+g4 | f4+a4+d5 | c#4\'+e4+a4 | c4+f4+a4 | c4+e4+g4 | f4+a4+d5 | a3+e4+a4 |' },
    A2:{b:8, v:{hrn:0.6, fid:1.15, cho:0.55},
      fid:'| d5 - a4 d5 - e5 | f5~ - - a5~ - - | bb5 - a5 g5 - f5 | e5~ - - - - - |'+
          '| d5 - a4 d5 - e5 | f5~ - - a5~ - - | c6 - bb5 a5 - g5 | a5~ - - - - - |',
      hrn:'| a3 - - f4 - - | a3 - - d4 - - | bb3 - - f4 - - | a3 - - e4 - - |'+
          '| a3 - - f4 - - | a3 - - d4 - - | c4 - - e4 - - | a3 - - e4 - - |',
      low:'| d2!* . a2* d2!* . f2* | % | bb1!* . f2* bb1!* . d2* | a1!* . e2* a1!* . c#2\'* |'+
          '| d2!* . a2* d2!* . f2* | % | c2!* . g2* c2!* . e2* | a1!* . e2* a1!* . g2* |',
      acc:'| . d4+f4+a4* . . d4+f4+a4* . | % | . d4+f4+bb4* . . d4+f4+bb4* . | . c#4\'+e4+g4+a4* . . c#4\'+e4+g4+a4* . |'+
          '| . d4+f4+a4* . . d4+f4+a4* . | % | . c4+e4+g4* . . c4+e4+g4* . | . c#4\'+e4+g4+a4* . . c#4\'+e4+g4+a4* . |',
      kit:'| K! k k K k k | K k k K k k | K! k k K k k | K k k K k K |'+
          '| K! k k K k k | K k k K k k | K! k k K k k | K k K K k K |',
      big:'| X+D . . . . . | D . . . . . | D . . . . . | D . . D . D |'+
          '| X+D . . . . . | D . . . . . | D . . . . . | D . D D . D |',
      tim:'| _ | _ | _ | a2~ - - - - - | _ | _ | _ | a2~ - - - - - |',
      cho:'| d4+f4+a4 | = | d4+f4+bb4 | a3+e4+a4 | d4+f4+a4 | = | e4+g4+c5 | c#4\'+e4+a4 |' },
    C:{b:8, v:{cho:0.55},
      hrn:'| a4 - - f4 - d4 | e4 - - - - - | _ | _ |'+
          '| a4 - - c5 - d5 | e5 - - - - - | _ | _ |',
      fid:'| _ | _ | d6 - - bb5 - f5 | e5 - - - - - |'+
          '| _ | _ | f5 - - bb5 - d6 | e6 - - c#6\' - a5 |',
      low:'| d2!* . a2* d2!* . f2* | c2!* . g2* c2!* . e2* | bb1!* . f2* bb1!* . d2* | a1!* . e2* a1!* . c#2\'* |'+
          '| d2!* . a2* d2!* . f2* | c2!* . g2* c2!* . e2* | bb1!* . f2* bb1!* . d2* | a1!* . e2* a1!* . g2* |',
      acc:'| . d4+f4+a4* . . d4+f4+a4* . | . c4+e4+g4* . . c4+e4+g4* . | . d4+f4+bb4* . . d4+f4+bb4* . | . c#4\'+e4+a4* . . c#4\'+e4+a4* . |'+
          '| . d4+f4+a4* . . d4+f4+a4* . | . c4+e4+g4* . . c4+e4+g4* . | . d4+f4+bb4* . . d4+f4+bb4* . | . c#4\'+e4+g4+a4* . . c#4\'+e4+g4+a4* . |',
      kit:'| Q! k k P k k | Q k k P k k | Q! k k P k k | Q k k P k K |'+
          '| Q! k k P k k | Q k k P k k | Q! k k P k k | Q k Q P K K |',
      big:'| D . . . . . | D . . . . . | D . . . . . | D . . D . . |'+
          '| X+D . . . . . | D . . . . . | D . . . . . | D . D D . D |',
      tim:'| _ | _ | _ | a2~ - - - - - | _ | _ | _ | a2~ - - - - - |',
      cho:'| d4+f4+a4 | c4+e4+g4 | d4+f4+bb4 | a3+e4+a4 | d4+f4+a4 | c4+e4+g4 | d4+f4+bb4 | c#4\'+e4+a4 |' },
    D:{b:8, tr:2, v:{cho:0.55, hrn:0.6, fid:1.1},
      fid:'| a5 - - - - - | d6 - - c6 - bb5 | bb5 - - g5 - d5 | c#6\' - - - - - |'+
          '| f6 - - d6 - a5 | bb5 - - f6 - - | g6 - - d6 - bb5 | @t-2 a5 - - e5 - c#5\' |',
      hrn:'| a4 - - - - - | d5 - - c5 - bb4 | bb4 - - g4 - d4 | c#5\' - - - - - |'+
          '| d4 - - - - - | bb3 - - - - - | g3 - - - - - | @t-2 a3 - - - - - |',
      low:'| d2!* . a2* d2!* . f2* | bb1!* . f2* bb1!* . d2* | g1!* . d2* g1!* . bb1* | a1!* . e2* a1!* . c#2\'* |'+
          '| d2!* . a2* d2!* . f2* | bb1!* . f2* bb1!* . d2* | g1!* . d2* g1!* . bb1* | @t-2 a1!* . e2* a1!* . g2* |',
      acc:'| . d4+f4+a4* . . d4+f4+a4* . | . d4+f4+bb4* . . d4+f4+bb4* . | . d4+g4+bb4* . . d4+g4+bb4* . | . c#4\'+e4+a4* . . c#4\'+e4+a4* . |'+
          '| . d4+f4+a4* . . d4+f4+a4* . | . d4+f4+bb4* . . d4+f4+bb4* . | . d4+g4+bb4* . . d4+g4+bb4* . | @t-2 . c#4\'+e4+g4+a4* . . c#4\'+e4+g4+a4* . |',
      kit:'| K! k k K k k | K k k K k k | K! k k K k k | K k k K k K |'+
          '| K! k k K k k | K k k K k k | K! k k K k k | K K K K K K |',
      big:'| X+D . . . . . | D . . . . . | D . . . . . | D . . D . . |'+
          '| X+D . . . . . | D . . D . . | D . . D . . | D . D D D D |',
      tim:'| d2 . . . . . | _ | _ | a2~ - - - - - | d2 . . . . . | _ | _ | @t-2 a2~ - - - - - |',
      cho:'| d4+f4+a4 | d4+f4+bb4 | d4+g4+bb4 | a3+e4+a4 | d4+f4+a4 | d4+f4+bb4 | d4+g4+bb4 | @t-2 c#4\'+e4+g4+a4 |' } },
  form:['A','B','A2','C','D'], loop:0, loops:0 };
/* PEBBLE HARBOUR (town_small — a hamlet or a harbour town). G major, 4/4 at 104 with a soft swing — a cosy seaside village at its morning chores.
   A B A2 C → loop (≈ 74 s), on for as long as you're ashore. Layers: 0 night (the base + the music box) · 1 day (the base + the winds, the kit & the celesta).
   A  — the flute's own tune: a dotted fall from the 3rd (B —— A G — D) and a rising answer, again a step up, the half close leaping to the top D;
        the second phrase climbs to E and comes home (G Em C D | G Em Am7-D7 G); the swung marimba ostinato, guitar strums on 2 & 4, pizzicato
        on 1 & 3, shaker & woodblock.
   B  — the ocarina's counter-tune in long notes over the circle C D Bm7 Em | Am D G G, a celesta shimmer as it enters, the flute answering in
        its gaps; the marimba's off-beat chords, the guitar's strums let ring.
   A2 — the tune on the ocarina, the chords warmed (Cmaj7 · Am7 · Bm7), the celesta twinkling in its long notes; a 3-3-2 marimba, a walking
        pizzicato, syncopated strums.
   C  — the bridge: the BOATS motif in G on the flute (G D G A B — the high D over C add9), answered by the tune's own falling figure; again,
        higher, to E, and up the D7 into A; the celesta's sparkles, the guitar fingerpicked, the marimba's soft half notes.
   At night the music box sings every line in the winds' place — a lullaby of the same tunes. */
MUS_T.town_small={
  n:'Pebble Harbour', bpm:104, m:'4/4', key:'G ion', sw:0.18, hum:4, g:1.05,
  fx:{rv:0.26, ec:'3/16', fb:0.18, ew:0.1},
  ch:{
    mar:{i:'marimba',  v:0.36, p:0.25,  s:8, L:'base'},
    gtr:{i:'guitar',   v:0.42, p:-0.3,  s:8, L:'base'},
    bas:{i:'pizz',     v:0.75, p:0.05,  s:4, L:'base'},
    flt:{i:'flute',    v:0.78, p:-0.12, s:8, L:'top', mono:1},
    oca:{i:'ocarina',  v:0.8,  p:0.12,  s:8, L:'top', mono:1},
    kit:{i:'kit',      v:0.4,  p:0.18,  s:8, L:'top'},
    cel:{i:'celesta',  v:0.9,  p:0.35,  s:8, L:'top'},
    nbx:{i:'musicbox', v:1.0,  p:0.1,   s:8, L:'night'} },
  lv:[['base','night'],['base','top']],
  sec:{
    A:{b:8, v:{flt:1.12, gtr:0.9},   // (G13 FIX: the flute's own tune clear of the strums)
      flt:'| b5 - - a5 g5 - d5 - | e5 - g5 - b5 - - - | c6 - - b5 a5 - e5 - | f#5 - a5 - d6 - - . |'+
          '| b5 - - a5 g5 - d5 - | e5 - g5 - b5 - e6 - | c6 - - b5 a5 - f#5 - | g5 - - - - - . . |',
      nbx:'| b5 - - a5 g5 - d5 - | e5 - g5 - b5 - - - | c6 - - b5 a5 - e5 - | f#5 - a5 - d6 - - . |'+
          '| b5 - - a5 g5 - d5 - | e5 - g5 - b5 - e6 - | c6 - - b5 a5 - f#5 - | g5 - - - - - . . |',
      mar:'| g3 d4 b4 d4 g4 d4 b4 d4 | e3 b3 g4 b3 e4 b3 g4 b3 | c3 g3 e4 g3 c4 g3 e4 g3 | d3 a3 f#4 a3 d4 a3 f#4 a3 |'+
          '| g3 d4 b4 d4 g4 d4 b4 d4 | e3 b3 g4 b3 e4 b3 g4 b3 | a3 e4 g4 e4 d3 a3 c4 f#4 | g3 d4 b4 d4 g4 d4 b4 d4 |',
      gtr:'| . . d3+g3+b3+d4> - . . d3+g3+b3+d4> - | . . e3+g3+b3+e4> - . . e3+g3+b3+e4> - | . . e3+g3+c4+e4> - . . e3+g3+c4+e4> - | . . d3+a3+d4+f#4> - . . d3+a3+d4+f#4> - |'+
          '| . . d3+g3+b3+d4> - . . d3+g3+b3+d4> - | . . e3+g3+b3+e4> - . . e3+g3+b3+e4> - | . . e3+a3+c4+g4> - . . d3+a3+c4+f#4> - | . . d3+g3+b3+d4> - . . d3+g3+b3+d4> - |',
      bas:'| g2 . d3 . | e2 . g2 . | c3 . g2 . | d3 . a2 . | g2 . d3 . | e2 . g2 . | a2 . d3 . | g2 . d3 . |',
      kit:'| H H? H W H H? H W | % | % | H H? H W H s s W |'+
          '| H H? H W H H? H W | % | % | H H? H W H H? H W |' },
    B:{b:8,
      oca:'| g5 - - - e5 - c5 - | d5 - f#5 - a5 - d6 - | b5 - - - a5 - f#5 - | e5 - - - - - . . |'+
          '| c6 - - - a5 - e5 - | f#5 - a5 - d6 - c6 - | b5 - - - g5 - d5 - | g5 - - - - - . . |',
      flt:'| _ | _ | _ | . . . . g5 a5 b5 d6 |'+
          '| _ | _ | _ | . . . . d5 e5 f#5 a5 |',
      cel:'| . e6 g6 c7 . . . . | _ | _ | _ |'+
          '| . e6 a6 c7 . . . . | _ | _ | _ |',
      nbx:'| g5 - - - e5 - c5 - | d5 - f#5 - a5 - d6 - | b5 - - - a5 - f#5 - | e5 - - - g5 a5 b5 d6 |'+
          '| c6 - - - a5 - e5 - | f#5 - a5 - d6 - c6 - | b5 - - - g5 - d5 - | g5 - - - d5 e5 f#5 a5 |',
      mar:'| c3 . e4+g4 . g3 . e4+g4 . | d3 . f#4+a4 . a3 . f#4+a4 . | b2 . d4+f#4 . f#3 . d4+a4 . | e3 . g4+b4 . b3 . g4+b4 . |'+
          '| a2 . c4+e4 . e3 . c4+e4 . | d3 . f#4+a4 . a3 . f#4+a4 . | g3 . b4+d5 . d4 . b4+d5 . | g3 . b4+d5 . d4 . b4+d5 . |',
      gtr:'| c3+g3+c4+e4> - - - c3+g3+c4+e4< - - - | d3+a3+d4+f#4> - - - d3+a3+d4+f#4< - - - | d3+f#3+b3+d4> - - - d3+f#3+a3+d4< - - - | e3+g3+b3+e4> - - - e3+g3+b3+e4< - - - |'+
          '| e3+a3+c4+e4> - - - e3+a3+c4+e4< - - - | d3+a3+d4+f#4> - - - d3+a3+d4+f#4< - - - | d3+g3+b3+d4> - - - d3+g3+b3+d4< - - - | d3+g3+b3+d4> - - - d3+g3+b3+d4< - - - |',
      bas:'| c3 . g2 . | d3 . f#2 . | b2 . f#2 . | e2 . b2 . | a2 . e2 . | d3 . a2 . | g2 . d3 . | g2 . d3 . |',
      kit:'| H . H W H . H W | % | % | % |'+
          '| H . H W H . H W | % | % | H . H W H s s W |' },
    A2:{b:8, v:{gtr:0.85, bas:0.8},
      oca:'| b5 - - a5 g5 - d5 - | e5 - g5 - b5 - - - | c6 - - b5 a5 - e5 - | f#5 - a5 - d6 - - . |'+
          '| b5 - - a5 g5 - d5 - | e5 - g5 - c6 - e6 - | c6 - - b5 a5 - f#5 - | g5 - - - - - . . |',
      cel:'| _ | . . . . . e6 g6 b6 | _ | . . . . . a6 f#6 d6 |'+
          '| _ | . . . . . e6 g6 c7 | _ | . . . . . d6 g6 b6 |',
      nbx:'| b5 - - a5 g5 - d5 - | e5 - g5 - b5 - - - | c6 - - b5 a5 - e5 - | f#5 - a5 - d6 - - . |'+
          '| b5 - - a5 g5 - d5 - | e5 - g5 - c6 - e6 - | c6 - - b5 a5 - f#5 - | g5 - - - - - . . |',
      mar:'| g3 b4 d4 g3 b4 d4 g3 b4 | c3 g4 e4 c3 b4 e4 c3 g4 | a2 g4 e4 a2 c5 e4 a2 g4 | b2 f#4 d4 b2 a4 f#4 d3 a4 |'+
          '| g3 b4 d4 g3 b4 d4 g3 b4 | c3 g4 e4 c3 g4 e4 c3 g4 | a2 g4 e4 a2 c5 f#4 d3 c5 | g3 b4 d4 g3 b4 d4 g3 d4 |',
      gtr:'| . . d3+g3+b3+d4> - . d3+g3+b3+d4< d3+g3+b3+d4> - | . . c3+g3+b3+e4> - . c3+g3+b3+e4< c3+g3+b3+e4> - | . . e3+a3+c4+g4> - . e3+a3+c4+g4< e3+a3+c4+g4> - | . . d3+a3+b3+f#4> - . d3+a3+d4+f#4< d3+a3+d4+f#4> - |'+
          '| . . d3+g3+b3+d4> - . d3+g3+b3+d4< d3+g3+b3+d4> - | . . c3+g3+c4+e4> - . c3+g3+c4+e4< c3+g3+c4+e4> - | . . e3+a3+c4+g4> - . d3+a3+c4+f#4< d3+a3+c4+f#4> - | . . d3+g3+b3+d4> - . d3+g3+b3+d4< d3+g3+b3+d4> - |',
      bas:'| g2 b2 d3 b2 | c3 e3 g3 e3 | a2 c3 e3 c3 | b2 d3 d3 a2 | g2 b2 d3 b2 | c3 e3 g3 e3 | a2 c3 d3 a2 | g2 d3 g2 b2 |',
      kit:'| H H? H+W H? H H? H+W H? | % | % | % |'+
          '| H H? H+W H? H H? H+W H? | % | % | H H? H+W H? s s S W |' },
    C:{b:8,
      flt:'| g5 - d5 g5 - a5 b5 - | d6 - - - . . . . | c6 - - b5 a5 - f#5 - | g5 - - - . . . . |'+
          '| b5 - f#5 b5 - c6 d6 - | e6 - - - c6 - g5 - | a5 - - b5 c6 - e6 - | d6 - - - c6 - a5 - |',
      cel:'| _ | . . . . e6 g6 d7 - | _ | . . . . d6 g6 b6 d7 |'+
          '| _ | _ | _ | _ |',
      nbx:'| g5 - d5 g5 - a5 b5 - | d6 - - - . . . . | c6 - - b5 a5 - f#5 - | g5 - - - . . . . |'+
          '| b5 - f#5 b5 - c6 d6 - | e6 - - - c6 - g5 - | a5 - - b5 c6 - e6 - | d6 - - - c6 - a5 - |',
      mar:'| e3+b3 . . . g4+b4 . . . | c3+g3 . . . d4+e4 . . . | d3+a3 . . . c4+f#4 . . . | g3+d4 . . . b4+d5 . . . |'+
          '| e3+b3 . . . g4+b4 . . . | c3+g3 . . . e4+g4 . . . | a2+e3 . . . g4+c5 . . . | d3+a3 . . . a3+d4 . . . |',
      gtr:'| e3 b3 e4 g4 b4 g4 e4 b3 | c3 g3 d4 e4 g4 e4 d4 g3 | d3 a3 c4 f#4 a4 f#4 c4 a3 | g2 d3 g3 b3 d4 b3 g3 d3 |'+
          '| e3 b3 e4 g4 b4 g4 e4 b3 | c3 g3 c4 e4 g4 e4 c4 g3 | a2 e3 a3 c4 g4 c4 a3 e3 | d3 a3 c4 f#4 a4 f#4 c4 a3 |',
      bas:'| e2 . b2 . | c3 . g2 . | d3 . f#2 . | g2 . d3 . | e2 . b2 . | c3 . g2 . | a2 . e2 . | d3 . a2 . |',
      kit:'| H . H . H . H . | % | % | % |'+
          '| H . H . H . H . | % | % | H . H . s s s S |' } },
  form:['A','B','A2','C'], loop:0, loops:0 };

/* BRASSPORT SHANTY (town_big — a Grand Harbour). D Mixolydian, 4/4 at 116 — a bustling port, sailors singing: the shanty heart of the soundtrack.
   A B A2 C → loop (≈ 66 s), on while you're ashore. Layers: 0 night (the squeezebox & the band) · 1 + the fiddle, the whistle & the crowd's
   stomps · 2 a Grand Harbour by day (+ the trumpet).
   A  — call & response: the accordion calls the motif (D — A — D — E F♯ | A), the fiddle and the whistle (an octave up) answer down the scale
        (A G F♯ E D | C — D) to stomps & claps; the call again, and a higher answer that lands home (B A G F♯ E | D) — D D D C-D | D D G-A D.
   B  — the verse: the accordion sings it alone, low (D G G A B | A F♯ D …, up to the high D and home by a real A major), the fiddle's fills
        in its holds, the whistle's descant in the second half, a tambourine in 8ths, the guitar's strum (G D C D | G D A D).
   A2 — the call & response again, the trumpet on the call; the whistle answers alone up high, the fiddle in harmony beneath it; the bass walks.
   C  — the breakdown: the bass's riff to stomps & claps over a hush of strings on D, the guitar's chops creeping in; then everyone back for the refrain — a falling
        sequence the whole crowd sings (B B A G | A A F♯ D | G G E C | A A E C♯ over G D C A), the whistle an octave up, the trumpet's long
        notes, and the leading note into the call. */
MUS_T.town_big={
  n:'Brassport Shanty', bpm:116, m:'4/4', key:'D mix', sw:0, hum:4, g:1.13,
  fx:{rv:0.24, ec:'1/8', fb:0.15, ew:0.08},
  ch:{
    acc:{i:'accordion', v:0.8,  p:-0.2,  s:8, L:'base'},
    fid:{i:'fiddle',    v:0.8,  p:0.3,   s:8, L:'top',   mono:1},
    wst:{i:'whistle',   v:0.66, p:0.15,  s:8, L:'top',   mono:1},
    gtr:{i:'guitar',    v:0.28, p:0.35,  s:8, L:'base'},
    bas:{i:'ubass',     v:0.55, p:0,     s:4, L:'base'},
    kit:{i:'kit',       v:0.38, p:0.1,   s:8, L:'top'},
    tpt:{i:'trumpet',   v:0.7,  p:-0.15, s:8, L:'brass', mono:1},
    pad:{i:'strings',   v:0.25, p:-0.05, s:2, L:'base'} },
  lv:[['base'],['base','top'],['base','top','brass']],
  sec:{
    A:{b:8,
      acc:'| d4 - a3 - d4 - e4 f#4 | a4 - - - . . . . | . d4+f#4+a4* . d4+f#4+a4* . d4+f#4+a4* . d4+f#4+a4* | . c4+e4+g4* . c4+e4+g4* . d4+f#4+a4* . d4+f#4+a4* |'+
          '| d4 - a3 - d4 - e4 f#4 | a4 - - - . . . . | . d4+g4+b4* . d4+g4+b4* . c#4\'+e4+a4* . c#4\'+e4+a4* | . d4+f#4+a4* . d4+f#4+a4* . . . . |',
      fid:'| _ | _ | a5 g5 f#5 e5 d5 - . . | c5 - d5 - . . . . |'+
          '| _ | _ | b5 a5 g5 f#5 e5 - . . | d5 - - - . . . . |',
      wst:'| _ | _ | a6 g6 f#6 e6 d6 - . . | c6 - d6 - . . . . |'+
          '| _ | _ | b6 a6 g6 f#6 e6 - . . | d6 - - - . . . . |',
      gtr:'| . . d3+a3+d4+f#4> - . d3+a3+d4+f#4< d3+a3+d4+f#4> - | % | % | . . c3+g3+c4+e4> - . d3+a3+d4+f#4< d3+a3+d4+f#4> - |'+
          '| . . d3+a3+d4+f#4> - . d3+a3+d4+f#4< d3+a3+d4+f#4> - | % | . . d3+g3+b3+g4> - . e3+a3+c#4\'+e4< e3+a3+c#4\'+e4> - | . . d3+a3+d4+f#4> - . . . . |',
      bas:'| d2 . a1 . | d2 . a1 . | d2 . a1 . | c2 . d2 . | d2 . a1 . | d2 . a1 . | g1 . a1 . | d2 . a1 . |',
      pad:'| d3+a3+f#4 - | = | = | c3+g3+e4 d3+a3+f#4 | d3+a3+f#4 - | = | d3+g3+b3 e3+a3+c#4\' | d3+a3+f#4 - |',
      tpt:'| _ | _ | _ | _ | _ | _ | _ | . . . . a4* . d5! . |',
      kit:'| _ | _ | Q . P . Q . P . | Q . P . Q . P . |'+
          '| _ | _ | Q . P . Q . P . | Q . P . Q P Q P |' },
    B:{b:8, v:{acc:1.12, kit:0.75},
      acc:'| d4 - g4 . g4 - a4 b4 | a4 - f#4 - d4 - - . | e4 - g4 . g4 - a4 g4 | f#4 - - - - - . . |'+
          '| d4 - g4 . g4 - a4 b4 | a4 - d5 . d5 - c5 a4 | c#5\' - b4 - a4 - e4 - | d4 - - - - - . . |',
      fid:'| _ | . . . . a5 b5 c6 a5 | _ | . . a5 - f#5 - d5 e5 |'+
          '| _ | _ | _ | . . d5 f#5 a5 - . . |',
      wst:'| _ | _ | _ | _ |'+
          '| d6 - - - b5 - - - | a5 - - - d6 - - - | e6 - - - c#6\' - - - | d6 - - - - - . . |',
      gtr:'| g2+d3+g3+b3> . g2+d3+g3+b3> g2+d3+g3+b3< . g2+d3+g3+b3< g2+d3+g3+b3> . | a2+d3+f#3+a3> . a2+d3+f#3+a3> a2+d3+f#3+a3< . a2+d3+f#3+a3< a2+d3+f#3+a3> . |'+
          '| c3+e3+g3+c4> . c3+e3+g3+c4> c3+e3+g3+c4< . c3+e3+g3+c4< c3+e3+g3+c4> . | a2+d3+f#3+a3> . a2+d3+f#3+a3> a2+d3+f#3+a3< . a2+d3+f#3+a3< a2+d3+f#3+a3> . |'+
          '| g2+d3+g3+b3> . g2+d3+g3+b3> g2+d3+g3+b3< . g2+d3+g3+b3< g2+d3+g3+b3> . | a2+d3+f#3+a3> . a2+d3+f#3+a3> a2+d3+f#3+a3< . a2+d3+f#3+a3< a2+d3+f#3+a3> . |'+
          '| a2+e3+a3+c#4\'> . a2+e3+a3+c#4\'> a2+e3+a3+c#4\'< . a2+e3+a3+c#4\'< a2+e3+a3+c#4\'> . | a2+d3+f#3+a3> . a2+d3+f#3+a3> a2+d3+f#3+a3< . . . . |',
      bas:'| g1 . d2 . | d2 . a1 . | c2 . g1 . | d2 . a1 . | g1 . d2 . | d2 . a1 . | a1 . e2 . | d2 . a1 . |',
      pad:'| _ | _ | _ | _ | d3+g3+b3 - | d3+a3+f#4 - | e3+a3+c#4\' - | d3+a3+f#4 - |',
      kit:'| T t? T t? T t? T t? | % | % | % |'+
          '| T t? T t? T t? T t? | % | % | T t? T t? T T T T |' },
    A2:{b:8, v:{gtr:0.6, fid:0.75, wst:1.1},
      acc:'| d4 - a3 - d4 - e4 f#4 | a4 - - - . . . . | . d4+f#4+a4* . d4+f#4+a4* . d4+f#4+a4* . d4+f#4+a4* | . c4+e4+g4* . c4+e4+g4* . d4+f#4+a4* . d4+f#4+a4* |'+
          '| d4 - a3 - d4 - e4 f#4 | a4 - - - . . . . | . d4+g4+b4* . d4+g4+b4* . c#4\'+e4+a4* . c#4\'+e4+a4* | . d4+f#4+a4* . d4+f#4+a4* . . . . |',
      tpt:'| d5 - a4 - d5 - e5 f#5 | a5 - - - . . . . | _ | _ |'+
          '| d5 - a4 - d5 - e5 f#5 | a5 - - - . . . . | _ | _ |',
      wst:'| _ | _ | a6 g6 f#6 e6 d6 - . . | c6 - d6 - . . . . |'+
          '| _ | _ | b6 a6 g6 f#6 e6 - . . | d6 - - - . . . . |',
      fid:'| _ | _ | f#5 e5 d5 c5 a4 - . . | e5 - g5 - . . . . |'+
          '| _ | _ | g5 f#5 e5 d5 c#5\' - . . | f#5 - - - . . . . |',
      gtr:'| d3+a3+d4+f#4> . d3+a3+d4+f#4> d3+a3+d4+f#4< . d3+a3+d4+f#4< d3+a3+d4+f#4> d3+a3+d4+f#4< | % | % | c3+g3+c4+e4> . c3+g3+c4+e4> c3+g3+c4+e4< . d3+a3+d4+f#4< d3+a3+d4+f#4> d3+a3+d4+f#4< |'+
          '| d3+a3+d4+f#4> . d3+a3+d4+f#4> d3+a3+d4+f#4< . d3+a3+d4+f#4< d3+a3+d4+f#4> d3+a3+d4+f#4< | % | d3+g3+b3+g4> . d3+g3+b3+g4> d3+g3+b3+g4< . e3+a3+c#4\'+e4< e3+a3+c#4\'+e4> e3+a3+c#4\'+e4< | d3+a3+d4+f#4> . d3+a3+d4+f#4> d3+a3+d4+f#4< . . . . |',
      bas:'| d2 f#2 a2 b2 | d3 b2 a2 f#2 | d2 a2 f#2 a1 | c2 e2 d2 a1 | d2 f#2 a2 b2 | d3 b2 a2 f#2 | g1 d2 a1 c#2\' | d2 a1 d2 . |',
      pad:'| d3+a3+f#4 - | = | = | c3+g3+e4 d3+a3+f#4 | d3+a3+f#4 - | = | d3+g3+b3 e3+a3+c#4\' | d3+a3+f#4 - |',
      kit:'| T . . . T . . . | % | Q . P . Q . P . | Q . P . Q . P . |'+
          '| T . . . T . . . | % | Q . P . Q . P . | Q . P . Q P Q P |' },
    C:{b:8,
      bas:'| d2 . a1 c2 | d2 . a1 c#2\' | d2 f#2 a2 c3 | d3 c3 b2 a2 | g2 . d2 . | d2 . f#2 . | c2 . g1 . | a1 . e2 a1 |',
      kit:'| Q . P . Q . P . | % | % | Q . P . Q P Q P |'+
          '| Q t P t Q t P t | % | % | Q t P t Q P Q P |',
      gtr:'| _ | _ | . . d3+a3+d4* . . . d3+a3+d4* . | . . d3+a3+d4* . . . d3+a3+d4* d3+a3+d4* |'+
          '| g2+d3+b3> . g2+d3+b3> g2+d3+b3< . g2+d3+b3< g2+d3+b3> . | d3+a3+f#4> . d3+a3+f#4> d3+a3+f#4< . d3+a3+f#4< d3+a3+f#4> . |'+
          '| c3+g3+e4> . c3+g3+e4> c3+g3+e4< . c3+g3+e4< c3+g3+e4> . | e3+a3+c#4\'> . e3+a3+c#4\'> e3+a3+c#4\'< . e3+a3+c#4\'< e3+a3+c#4\'> . |',
      acc:'| _ | _ | _ | _ |'+
          '| b4 - . b4 a4 - g4 - | a4 - . a4 f#4 - d4 - | g4 - . g4 e4 - c4 - | a4 - . a4 e4 - c#5\' - |',
      fid:'| _ | _ | _ | _ |'+
          '| b4 - . b4 a4 - g4 - | a4 - . a4 f#4 - d4 - | g4 - . g4 e4 - c4 - | a4 - . a4 e4 - c#5\' - |',
      wst:'| _ | _ | _ | _ |'+
          '| b5 - . b5 a5 - g5 - | a5 - . a5 f#5 - d5 - | g5 - . g5 e5 - c5 - | a5 - . a5 e5 - c#6\' - |',
      tpt:'| _ | _ | _ | _ |'+
          '| d5 - - - - - b4 - | a4 - - - - - d5 - | c5 - - - - - e5 - | e5 - - - - - - - |',
      pad:'| @v1.2 a3+d4+f#4 - | = | @v0.9 f#3+a3+d4 - | = | @v1 d3+g3+b3 - | d3+a3+f#4 - | c3+g3+e4 - | e3+a3+c#4\' - |' } },   // (G13 FIX: the strings hold D under the breakdown — at night it isn't a lone bass)
  form:['A','B','A2','C'], loop:0, loops:0 };

/* THE SALTY LANTERN (tavern). A Dorian (the bright F♯), a 6/8 jig at 118 — a lantern-lit pub with dancing boards. A A2 B B2 C C2 → loop
   (≈ 49 s), the old AABB(CC) form of a session tune. Layers: 0 (base + mid: only a stand-in, the Maelstrom has its own tune) · 1 = 2 the full session.
   A  — the fiddle's own jig: A~ —— E A C | B — G D G B | A — C E — C | B — G E~ (cuts on the long notes), then running 8ths to the close
        (Am G Am Em | Am G C Em-Am); the accordion's chords on 1 & 2, the guitar's boom-chk, the bodhrán with a tambourine on the 2.
   A2 — the whistle joins the fiddle in unison; the second-time bar closes on A.
   B  — the high part: the whistle leads (G — E C D E | D — B G A B …, up to the top A), the fiddle a 3rd under it (C G Am Em | C G Em Am).
   B2 — the fiddle & the whistle together on it, the accordion singing the harmony a 10th below; harp rolls on the phrases.
   C  — the BOATS motif as a jig (A — E A — B | C —— E ——) on the fiddle alone, then running figures through the Dorian D major and the
        ♭VI-♭VII lift (Am C D G | F G Em Am); the harp's arpeggios.
   C2 — the whistle on the tune, the fiddle an octave under, and the room joins in — stomps & claps on the bodhrán; the last bar turns to A. */
MUS_T.tavern={
  n:'The Salty Lantern', bpm:118, m:'6/8', key:'A dor', sw:0, hum:3, g:1,
  fx:{rv:0.2, ec:'3/16', fb:0.12, ew:0.05},
  ch:{
    fid:{i:'fiddle',    v:0.82, p:0.25,  s:6, L:'top',   mono:1},
    wst:{i:'whistle',   v:0.68, p:-0.2,  s:6, L:'top',   mono:1},
    acc:{i:'accordion', v:0.4,  p:-0.35, s:6, L:'mid'},
    gtr:{i:'guitar',    v:0.3,  p:0.35,  s:6, L:'base'},
    bas:{i:'ubass',     v:0.6,  p:0,     s:2, L:'base'},
    kit:{i:'kit',       v:0.28, p:0.1,   s:6, L:'drums'},
    har:{i:'harp',      v:0.4,  p:0.4,   s:6, L:'mid'} },
  lv:[['base','mid'],['base','mid','top','drums'],['base','mid','top','drums']],
  sec:{
    A:{b:8,
      fid:'| a5~ - - e5 a5 c6 | b5 - g5 d5 g5 b5 | a5 - c6 e6 - c6 | b5 - g5 e5~ - - |'+
          '| a5~ - - e5 a5 c6 | d6 c6 b5 g5 a5 b5 | e6 d6 c6 g5 e5 g5 | b5 - g5 a5 - e5 |',
      acc:'| a3+c4+e4 - . a3+c4+e4 - . | g3+b3+d4 - . g3+b3+d4 - . | a3+c4+e4 - . a3+c4+e4 - . | g3+b3+e4 - . g3+b3+e4 - . |'+
          '| a3+c4+e4 - . a3+c4+e4 - . | g3+b3+d4 - . g3+b3+d4 - . | g3+c4+e4 - . g3+c4+e4 - . | g3+b3+e4 - . a3+c4+e4 - . |',
      gtr:'| a2 . e3+a3+c4* . . e3+a3+c4* | g2 . d3+g3+b3* . . d3+g3+b3* | a2 . e3+a3+c4* . . e3+a3+c4* | e2 . e3+g3+b3* . . e3+g3+b3* |'+
          '| a2 . e3+a3+c4* . . e3+a3+c4* | g2 . d3+g3+b3* . . d3+g3+b3* | c3 . e3+g3+c4* . . e3+g3+c4* | e2 . e3+g3+b3* . . e3+a3+c4* |',
      bas:'| a2 c3 | g2 b2 | a2 c3 | e2 g2 | a2 c3 | g2 b2 | c3 e2 | e2 a2 |',
      kit:'| K k k K+T k k | % | % | K k k K+T k K |'+
          '| K k k K+T k k | % | % | K k k K+T K K |' },
    A2:{b:8,
      fid:'| a5~ - - e5 a5 c6 | b5 - g5 d5 g5 b5 | a5 - c6 e6 - c6 | b5 - g5 e5~ - - |'+
          '| a5~ - - e5 a5 c6 | d6 c6 b5 g5 a5 b5 | e6 d6 c6 g5 e5 g5 | b5 - g5 a5 - - |',
      wst:'| a5~ - - e5 a5 c6 | b5 - g5 d5 g5 b5 | a5 - c6 e6 - c6 | b5 - g5 e5~ - - |'+
          '| a5~ - - e5 a5 c6 | d6 c6 b5 g5 a5 b5 | e6 d6 c6 g5 e5 g5 | b5 - g5 a5 - - |',
      acc:'| a3+c4+e4 - . a3+c4+e4 - . | g3+b3+d4 - . g3+b3+d4 - . | a3+c4+e4 - . a3+c4+e4 - . | g3+b3+e4 - . g3+b3+e4 - . |'+
          '| a3+c4+e4 - . a3+c4+e4 - . | g3+b3+d4 - . g3+b3+d4 - . | g3+c4+e4 - . g3+c4+e4 - . | g3+b3+e4 - . a3+c4+e4 - . |',
      gtr:'| a2 . e3+a3+c4* . . e3+a3+c4* | g2 . d3+g3+b3* . . d3+g3+b3* | a2 . e3+a3+c4* . . e3+a3+c4* | e2 . e3+g3+b3* . . e3+g3+b3* |'+
          '| a2 . e3+a3+c4* . . e3+a3+c4* | g2 . d3+g3+b3* . . d3+g3+b3* | c3 . e3+g3+c4* . . e3+g3+c4* | e2 . e3+g3+b3* . . e3+a3+c4* |',
      bas:'| a2 c3 | g2 b2 | a2 c3 | e2 g2 | a2 c3 | g2 b2 | c3 e2 | e2 a2 |',
      kit:'| K+T k k K+T k k | K k k K+T k k | K+T k k K+T k k | K k k K+T k K |'+
          '| K+T k k K+T k k | K k k K+T k k | K+T k k K+T k k | K k K K+T k k |' },
    B:{b:8, v:{fid:0.7, wst:1.15},
      wst:'| g6 - e6 c6 d6 e6 | d6 - b5 g5 a5 b5 | c6 - a5 e6 - c6 | e6 - b5 g5 - b5 |'+
          '| g6 - e6 c6 d6 e6 | d6 - b5 d6 e6 f#6 | g6 - e6 b5 e6 g6 | a6 - - e6 - - |',
      fid:'| e6 - c6 g5 b5 c6 | b5 - g5 d5 f#5 g5 | a5 - e5 c6 - a5 | b5 - g5 e5 - g5 |'+
          '| e6 - c6 g5 b5 c6 | b5 - g5 b5 c6 d6 | e6 - b5 g5 b5 e6 | e6 - - c6 - - |',
      har:'| c3+g3+e4+c5> - - - - - | _ | _ | _ | c3+g3+e4+c5> - - - - - | _ | _ | _ |',
      acc:'| g3+c4+e4 - . g3+c4+e4 - . | g3+b3+d4 - . g3+b3+d4 - . | a3+c4+e4 - . a3+c4+e4 - . | g3+b3+e4 - . g3+b3+e4 - . |'+
          '| g3+c4+e4 - . g3+c4+e4 - . | g3+b3+d4 - . g3+b3+d4 - . | g3+b3+e4 - . g3+b3+e4 - . | a3+c4+e4 - . a3+c4+e4 - . |',
      gtr:'| c3 . e3+g3+c4* . . e3+g3+c4* | g2 . d3+g3+b3* . . d3+g3+b3* | a2 . e3+a3+c4* . . e3+a3+c4* | e2 . e3+g3+b3* . . e3+g3+b3* |'+
          '| c3 . e3+g3+c4* . . e3+g3+c4* | g2 . d3+g3+b3* . . d3+g3+b3* | e2 . e3+g3+b3* . . e3+g3+b3* | a2 . e3+a3+c4* . . e3+a3+c4* |',
      bas:'| c3 e2 | g2 b2 | a2 e2 | e2 b1 | c3 e2 | g2 d2 | e2 g2 | c3 a2 |',
      kit:'| K k k K+T k k | % | % | K k k K+T k K |'+
          '| K k k K+T k k | % | % | K k k K+T K K |' },
    B2:{b:8,
      wst:'| g6 - e6 c6 d6 e6 | d6 - b5 g5 a5 b5 | c6 - a5 e6 - c6 | e6 - b5 g5 - b5 |'+
          '| g6 - e6 c6 d6 e6 | d6 - b5 d6 e6 f#6 | g6 - e6 b5 e6 g6 | a6 - - - - - |',
      fid:'| g6 - e6 c6 d6 e6 | d6 - b5 g5 a5 b5 | c6 - a5 e6 - c6 | e6 - b5 g5 - b5 |'+
          '| g6 - e6 c6 d6 e6 | d6 - b5 d6 e6 f#6 | g6 - e6 b5 e6 g6 | a6 - - - - - |',
      acc:'| e5 - c5 g4 b4 c5 | b4 - g4 d4 f#4 g4 | a4 - e4 c5 - a4 | b4 - g4 e4 - g4 |'+
          '| e5 - c5 g4 b4 c5 | b4 - g4 b4 c5 d5 | e5 - b4 g4 b4 e5 | e5 - - - - - |',
      har:'| c3+g3+e4+c5> - - - - - | _ | a2+e3+c4+a4> - - - - - | _ |'+
          '| c3+g3+e4+c5> - - - - - | _ | e3+b3+g4+e5> - - - - - | a2+e3+c4+a4> - - - - - |',
      gtr:'| c3 . e3+g3+c4* . . e3+g3+c4* | g2 . d3+g3+b3* . . d3+g3+b3* | a2 . e3+a3+c4* . . e3+a3+c4* | e2 . e3+g3+b3* . . e3+g3+b3* |'+
          '| c3 . e3+g3+c4* . . e3+g3+c4* | g2 . d3+g3+b3* . . d3+g3+b3* | e2 . e3+g3+b3* . . e3+g3+b3* | a2 . e3+a3+c4* . . e3+a3+c4* |',
      bas:'| c3 e2 | g2 b2 | a2 e2 | e2 b1 | c3 e2 | g2 d2 | e2 g2 | c3 a2 |',
      kit:'| K k K K+T k k | K k k K+T k k | K k K K+T k k | K k k K+T k K |'+
          '| K k K K+T k k | K k k K+T k k | K k K K+T k k | K k k K+T K K |' },
    C:{b:8,
      fid:'| a5 - e5 a5 - b5 | c6 - - e6 - - | d6 c6 a5 f#5 a5 d6 | b5 a5 g5 d6 b5 g5 |'+
          '| c6 - a5 c6 b5 a5 | b5 - g5 d6 c6 b5 | g5 - b5 e6 d6 b5 | a5 - - e5 - - |',
      acc:'| a3+c4+e4 - . a3+c4+e4 - . | g3+c4+e4 - . g3+c4+e4 - . | a3+d4+f#4 - . a3+d4+f#4 - . | g3+b3+d4 - . g3+b3+d4 - . |'+
          '| a3+c4+f4\' - . a3+c4+f4\' - . | g3+b3+d4 - . g3+b3+d4 - . | g3+b3+e4 - . g3+b3+e4 - . | a3+c4+e4 - . a3+c4+e4 - . |',
      har:'| a4 - c5 e5 - c5 | c5 - e5 g5 - e5 | d5 - f#5 a5 - f#5 | b4 - d5 g5 - d5 |'+
          '| c5 - f5\' a5 - f5\' | b4 - d5 g5 - d5 | b4 - e5 g5 - e5 | a4 - c5 e5 - a5 |',
      gtr:'| a2 . e3+a3+c4* . . e3+a3+c4* | c3 . e3+g3+c4* . . e3+g3+c4* | d3 . d3+f#3+a3* . . d3+f#3+a3* | g2 . d3+g3+b3* . . d3+g3+b3* |'+
          '| f2\' . c3+f3\'+a3* . . c3+f3\'+a3* | g2 . d3+g3+b3* . . d3+g3+b3* | e2 . e3+g3+b3* . . e3+g3+b3* | a2 . e3+a3+c4* . . e3+a3+c4* |',
      bas:'| a2 e2 | c3 g2 | d2 a2 | g2 d2 | f2\' c3 | g2 d2 | e2 b1 | a2 c3 |',
      kit:'| K k k K+T k k | % | % | K k k K+T k K |'+
          '| K k k K+T k k | % | % | K k k K+T K K |' },
    C2:{b:8, v:{fid:0.75, wst:1.15},
      wst:'| a5 - e5 a5 - b5 | c6 - - e6 - - | d6 c6 a5 f#5 a5 d6 | b5 a5 g5 d6 b5 g5 |'+
          '| c6 - a5 c6 b5 a5 | b5 - g5 d6 c6 b5 | g5 - b5 e6 d6 b5 | a5 - - g5 e5 g5 |',
      fid:'| a4 - e4 a4 - b4 | c5 - - e5 - - | d5 c5 a4 f#4 a4 d5 | b4 a4 g4 d5 b4 g4 |'+
          '| c5 - a4 c5 b4 a4 | b4 - g4 d5 c5 b4 | g4 - b4 e5 d5 b4 | a4 - - b4 g4 b4 |',
      acc:'| a3+c4+e4 - . a3+c4+e4 - . | g3+c4+e4 - . g3+c4+e4 - . | a3+d4+f#4 - . a3+d4+f#4 - . | g3+b3+d4 - . g3+b3+d4 - . |'+
          '| a3+c4+f4\' - . a3+c4+f4\' - . | g3+b3+d4 - . g3+b3+d4 - . | g3+b3+e4 - . g3+b3+e4 - . | a3+c4+e4 - . g3+b3+e4 - . |',
      har:'| a4 - c5 e5 - c5 | c5 - e5 g5 - e5 | d5 - f#5 a5 - f#5 | b4 - d5 g5 - d5 |'+
          '| c5 - f5\' a5 - f5\' | b4 - d5 g5 - d5 | b4 - e5 g5 - e5 | a4 - c5 b4 - e5 |',
      gtr:'| a2 . e3+a3+c4* e2 . e3+a3+c4* | c3 . e3+g3+c4* g2 . e3+g3+c4* | d3 . d3+f#3+a3* a2 . d3+f#3+a3* | g2 . d3+g3+b3* d3 . d3+g3+b3* |'+
          '| f2\' . c3+f3\'+a3* c3 . c3+f3\'+a3* | g2 . d3+g3+b3* d3 . d3+g3+b3* | e2 . e3+g3+b3* b2 . e3+g3+b3* | a2 . e3+a3+c4* e2 . e3+g3+b3* |',
      bas:'| a2 e2 | c3 g2 | d2 a2 | g2 d2 | f2\' c3 | g2 d2 | e2 b1 | a2 e2 |',
      kit:'| K+Q k k K+P k k | % | % | K+Q k k K+P k K |'+
          '| K+Q k k K+P k k | % | % | K+Q k K K+P K K |' } },
  form:['A','A2','B','B2','C','C2'], loop:0, loops:0 };

/* THE MAELSTROM TABLE (table — the tavern's board game). F major, a quick 3/4 waltz at 132 — playful, a clockwork to think to. A B A2 C T →
   loop (≈ 46 s), on while the game lasts. One layer.
   A  — the flute's see-saw (A . F . A . | B♭ . G . B♭ . | A . F . C …) with the celesta ticking in its gaps (a hocket), the marimba's
        oom-pah-pah, the pizzicato on 1, a woodblock's tick-tock (F C7 F C7 | F Dm Gm7-C7 F).
   B  — the celesta's thoughtful tune in D minor (D —— A | C♯ —— E | D —— F — E | C ——), the flute's low counter-line joining for the second
        phrase (Dm A7 Dm C7 | F B♭ Gm7-C7 F).
   A2 — the see-saw on the celesta, the flute's pips in its gaps (the roles swapped).
   C  — the BOATS motif wandering round the board in the see-saw's pips: in F on the flute (F · C · F · | G A C ——), answered in D minor on the celesta, then on B♭,
        and home (F C Dm Dm | B♭ F Gm7-C7 F).
   T  — a clockwork wind-up on C7, back to the see-saw. */
MUS_T.table={
  n:'The Maelstrom Table', bpm:132, m:'3/4', key:'F ion', sw:0, hum:3, g:1.24,
  fx:{rv:0.25, ec:'1/8', fb:0.15, ew:0.08},
  ch:{
    flt:{i:'flute',   v:1.0,  p:-0.15, s:6, L:'base', mono:1},
    cel:{i:'celesta', v:0.85, p:0.3,   s:6, L:'base'},
    mar:{i:'marimba', v:0.25, p:0.2,   s:3, L:'base'},
    pzz:{i:'pizz',    v:0.55, p:0,     s:3, L:'base'},
    kit:{i:'kit',     v:0.5,  p:0.1,   s:3, L:'base'} },
  lv:[['base']],
  sec:{
    A:{b:8, v:{cel:0.7},
      flt:'| a5 . f5 . a5 . | bb5 . g5 . bb5 . | a5 . f5 . c6 . | e5 - - - . . |'+
          '| a5 . f5 . a5 . | d6 . a5 . d6 . | bb5 - d6 c6 - e5 | f5 - - . . . |',
      cel:'| . c6 . c6 . f6 | . e6 . c6 . e6 | . c6 . f6 . a6 | . . g6 e6 c6 bb5 |'+
          '| . c6 . c6 . f6 | . f6 . d6 . f6 | _ | . . c6 a5 f5 . |',
      mar:'| . a3+c4+f4 a3+c4+f4 | . g3+bb3+e4 g3+bb3+e4 | . a3+c4+f4 a3+c4+f4 | . g3+c4+e4 g3+bb3+e4 |'+
          '| . a3+c4+f4 a3+c4+f4 | . a3+d4+f4 a3+d4+f4 | . bb3+d4+f4 g3+bb3+e4 | . a3+c4+f4 . |',
      pzz:'| f2 . . | c2 . . | f2 . . | c2 . . | f2 . . | d2 . . | g2 . c2 | f2 . . |',
      kit:'| . W W? | % | % | % | . W W? | % | % | . W . |' },
    B:{b:8, v:{cel:1.15, flt:0.6},
      cel:'| d6 - - a5 - - | c#6\' - - e6 - - | d6 - - f6 - e6 | c6 - - - - - |'+
          '| a5 - - c6 - f6 | d6 - - bb5 - - | g5 - bb5 - e6 - | f6 - - - - - |',
      flt:'| _ | _ | _ | _ |'+
          '| c5 - - - a4 - | bb4 - - - d5 - | d5 - - - c5 - | a4 - - - - - |',
      mar:'| . a3+d4+f4 a3+d4+f4 | . a3+c#4\'+e4 g3+c#4\'+e4 | . a3+d4+f4 a3+d4+f4 | . g3+bb3+e4 g3+bb3+e4 |'+
          '| . a3+c4+f4 a3+c4+f4 | . bb3+d4+f4 bb3+d4+f4 | . bb3+d4+f4 g3+bb3+e4 | . a3+c4+f4 a3+c4+f4 |',
      pzz:'| d2 . . | a2 . . | d2 . . | c2 . . | f2 . . | bb2 . . | g2 . c2 | f2 . . |',
      kit:'| . W . | % | % | % | . W W? | % | % | % |' },
    A2:{b:8, v:{flt:0.55},
      cel:'| a5 . f5 . a5 . | bb5 . g5 . bb5 . | a5 . f5 . c6 . | e5 - - - . . |'+
          '| a5 . f5 . a5 . | d6 . a5 . d6 . | bb5 - d6 c6 - e5 | f5 - - . . . |',
      flt:'| . c6 . c6 . f6 | . e6 . c6 . e6 | . c6 . f6 . a6 | . . g6 e6 c6 bb5 |'+
          '| . c6 . c6 . f6 | . f6 . d6 . f6 | _ | . . c6 a5 f5 . |',
      mar:'| . a3+c4+f4 a3+c4+f4 | . g3+bb3+e4 g3+bb3+e4 | . a3+c4+f4 a3+c4+f4 | . g3+c4+e4 g3+bb3+e4 |'+
          '| . a3+c4+f4 a3+c4+f4 | . a3+d4+f4 a3+d4+f4 | . bb3+d4+f4 g3+bb3+e4 | . a3+c4+f4 . |',
      pzz:'| f2 . . | c2 . . | f2 . . | c2 . e2 | f2 . . | d2 . . | g2 . c2 | f2 . . |',
      kit:'| H W W? | % | % | % | H W W? | % | % | . W . |' },
    C:{b:8, v:{cel:1.2},
      flt:'| f5 . c5 . f5 . | g5 a5 c6 - - - | @v0.5 a5 - - - - - | - - - - - . |'+
          '| @v1 bb5 . f5 . bb5 . | c6 d6 f6 - - - | d6 - c6 - bb5 g5 | a5 - - - - . |',
      cel:'| _ | _ | d6 . a5 . d6 . | e6 f6 a6 - - - |'+
          '| _ | . . . . . . | . . . . . . | . . f6 c6 a5 . |',
      mar:'| . a3+c4+f4 a3+c4+f4 | . g3+c4+e4 g3+c4+e4 | . a3+d4+f4 a3+d4+f4 | . a3+d4+f4 a3+d4+f4 |'+
          '| . bb3+d4+f4 bb3+d4+f4 | . a3+c4+f4 a3+c4+f4 | . bb3+d4+f4 g3+bb3+e4 | . a3+c4+f4 a3+c4+f4 |',
      pzz:'| f2 . . | c2 . e2 | d2 . . | d2 . a2 | bb2 . . | f2 . . | g2 . c2 | f2 . c2 |',
      kit:'| . W W? | % | % | % | . W W? | % | % | % |' },
    T:{b:2, v:{cel:0.7},
      flt:'| c6 - bb5 - g5 - | e5 - f5 - g5 - |',
      cel:'| . e6 . c6 . bb5 | . g5 . c6 . e6 |',
      mar:'| . g3+bb3+e4 g3+bb3+e4 | . . g3+bb3+e4 |',
      pzz:'| c2 . . | c2 . e2 |',
      kit:'| . W W? | . W W |' } },
  form:['A','B','A2','C','T'], loop:0, loops:0 };
/* LANDFALL (crawl_a — the odd landfalls). A Dorian (the bright F♯; B's ♭VI F♮ and its E-major V marked '), 4/4 at 100, straight. I A B C A2 → loop to A
   (≈ 77 s), 2 calm loops then a rest. Layers: 0 explore (flute, horn, marimba, pizzicato — no drums: the drums ARE the fight) · 1 a fight (+ the low strings'
   3-3-2 drive, the kit, the fiddle's runs) · 2 = 3 a big fight (+ the trumpet's stabs). Skins: cold (the tune on the celesta, the marimba a glockenspiel two
   octaves up, −2) · fire (the tune on a fiddle, +1) · wet (the tune on the ocarina, −3, wetter).
   I  — landfall: the horn calls the motif in its A-Dorian 4/4 form (A E A B C | E), a marimba chord, the pizzicato's A — the marimba's pickup into A.
   A  — explore: the flute's own tune — E up to A then B C, D falling through G, the D/F♯ bar, home to E · again, up to the high E and down by the C chord to
        F♯–A over D (Am G D/F♯ Am | Am G C D); the marimba's rolling 8ths, pizzicato on 1 & 3, the horn's long notes under the second phrase.
        Fight: the strings' 3-3-2 chug, a backbeat kit (bodhrán & snare), the fiddle's runs in the tune's holds; big: trumpet stabs in the motif's rhythm.
   B  — the turn: the horn's broad tune over the rising ♭VI–♭VII–i (F G Am Am | F G Esus E), C — A | B — D | E …, falling home, again higher to the F
        and down to the E chord; the flute's descant joins the second phrase; the marimba's off-beat chords. Fight: held power fifths, a half-time
        big drum & snare, fiddle arpeggios; big: the trumpet doubles the horn.
   C  — the ruins: the motif itself on the flute (A E A B C | E–D) and the horn's falling answer (C G E | F♯ D B), again a step higher, then both climb
        (Am Bm C Bm | Am Bm C D — Dorian triads planing up); the marimba's rolled chords twice a bar, a pizzicato walk. Fight: a gallop on the low
        strings, war drums, the fiddle spinning 16ths under the answer; big: the trumpet echoes the flute's call.
   A2 — the lift (+2, B Dorian — D is IV in A and ♭III in B, so the climb lands softly): the tune again, a new turn in bars 4 and 6 up to the high G; the
        horn's slow counter-line falling C B A G against it and back up; the marimba's 3-against-8 cross-rhythm; bars 7–8 fall back (@t-2) for the
        Andalusian close F–E into A. Fight: the drive and the kit at full (crash, tambourine), the fiddle's runs; big: the trumpet's held cadence.
   E  — the coda (end 'A2' — the last calm loop): the flute's E up to A, the horn's low A, one rolled marimba chord — the rest begins on the tonic. */
MUS_T.crawl_a={
  n:'Landfall', bpm:100, m:'4/4', key:'A dor', sw:0, hum:4, g:1.17,
  fx:{rv:0.24, ec:'1/8', fb:0.18, ew:0.08},
  ch:{
    flt:{i:'flute',    v:0.8,  p:-0.15, s:8,  L:'mid',    mono:1},
    hrn:{i:'horn',     v:0.7,  p:-0.3,  s:8,  L:'mid',    mono:1},
    mar:{i:'marimba',  v:0.5,  p:0.25,  s:8,  L:'base'},
    bas:{i:'pizz',     v:0.65, p:0.05,  s:4,  L:'base'},
    lst:{i:'strings',  v:0.55, p:0,     s:8,  L:'fight'},
    kit:{i:'kit',      v:0.5,  p:0.1,   s:8,  L:'fight'},
    fid:{i:'fiddle',   v:0.65, p:0.3,   s:16, L:'fight',  mono:1},
    tpt:{i:'trumpet',  v:0.6,  p:-0.1,  s:8,  L:'fight2', mono:1} },
  lv:[['base','mid'],['base','mid','fight'],['base','mid','fight','fight2'],['base','mid','fight','fight2']],
  skin:{ cold:{ch:{flt:{i:'celesta', v:1.2}, mar:{i:'glock', t:24, v:0.6}}, tr:-2},
         fire:{ch:{flt:{i:'fiddle', v:0.72}}, tr:1},
         wet:{ch:{flt:{i:'ocarina'}}, tr:-3, rv:0.1} },
  sec:{
    I:{b:2, v:{mar:0.85},
      hrn:'| a4! - e4 a4 - b4 c5 - | e5 - - - - - . . |',
      mar:'| a3+c4+e4> . . . . . . . | . . . . a3 e4 a4 e4 |',
      bas:'| a2 . . . | a2 . . . |' },
    A:{b:8, v:{flt:1.05, mar:0.85, hrn:0.8},
      flt:'| e5 - a5 - - - b5 c6 | d6 - - - b5 - g5 - | a5 - - - f#5 - e5 d5 | e5 - - - - - . . |'+
          '| e5 - a5 - - - b5 c6 | d6 - e6 - - - d6 b5 | c6 - - - g5 - e5 g5 | f#5 - - - a5 - - . |',
      hrn:'| _ | _ | _ | _ | a3 - - - - - - - | b3 - - - d4 - - - | e4 - - - - - - - | f#4 - - - - - - . |',
      mar:'| a3 e4 a4 e4 c5 e4 a4 e4 | g3 d4 g4 d4 b4 d4 g4 d4 | a3 d4 f#4 d4 a4 d4 f#4 d4 | a3 e4 a4 e4 c5 e4 b4 e4 |'+
          '| a3 e4 a4 e4 c5 e4 a4 e4 | g3 d4 g4 d4 b4 d4 g4 d4 | g3 c4 e4 c4 g4 c4 e4 c4 | a3 d4 f#4 d4 a4 d4 f#4 a4 |',
      bas:'| a2 . e2 . | g2 . d2 . | f#2 . d2 . | a2 . e2 . | a2 . e2 . | g2 . d2 . | c3 . e2 . | d3 . a2 . |',
      lst:'| a2!* e3* c4* a2!* e3* c4* a2!* e3* | g2!* d3* g3* g2!* d3* g3* g2!* d3* | f#2!* d3* a3* f#2!* d3* a3* f#2!* d3* | a2!* e3* c4* a2!* e3* c4* a2!* e3* |'+
          '| a2!* e3* c4* a2!* e3* c4* a2!* e3* | g2!* d3* g3* g2!* d3* g3* g2!* d3* | c3!* g3* c4* c3!* g3* c4* c3!* g3* | d3!* a3* d4* d3!* a3* d4* d3!* a3* |',
      kit:'| X+K . S . K k S . | K . S . K k S k | K . S . K k S . | K . S . K S s S |'+
          '| K . S . K k S . | K . S . K k S k | K . S . K k S . | K+C . S . K k S S |',
      fid:'| _ | . . . . . . . . . . . . g5 a5 b5 c6 | _ | . . . . . . . . a6 g6 e6 d6 c6 b5 a5 g5 |'+
          '| _ | . . . . . . . . . . . . g5 a5 b5 d6 | _ | . . . . . . . . d6 e6 f#6 a6 g6 f#6 e6 d6 |',
      tpt:'| a4!* . . a4* . c5* e5!* . | _ | a4!* . . a4* . d5* f#5!* . | _ |'+
          '| a4!* . . a4* . c5* e5!* . | _ | g4!* . . g4* . c5* e5!* . | f#4!* . . f#4* . a4* d5!* . |' },
    B:{b:8, v:{hrn:1.15, flt:0.75, mar:0.85, lst:0.8},
      hrn:'| c5 - - - - - a4 - | b4 - - - - - d5 - | e5 - - - - - d5 e5 | c5 - - - b4 - a4 - |'+
          '| c5 - - - - - f5\' - | e5 - - - d5 - - - | e5 - - - - - d5 - | b4 - - - g#4\' - - . |',
      flt:'| _ | _ | _ | . . . . e6 - c6 - |'+
          '| a5 - - - - - c6 - | g5 - - - b5 - - - | a5 - - - - - b5 - | g#5\' - - - e5 - - . |',
      mar:'| a3 . c4+f4\' . a3 . c4+f4\' . | b3 . d4+g4 . b3 . d4+g4 . | a3 . c4+e4 . a3 . c4+e4 . | a3 . c4+e4 . e4 . a3+e4 . |'+
          '| a3 . c4+f4\' . a3 . c4+f4\' . | b3 . d4+g4 . b3 . d4+g4 . | a3 . b3+e4 . a3 . b3+e4 . | g#3\' . b3+e4 . g#3\' . b3+e4 . |',
      bas:'| f2\' . c3 . | g2 . d3 . | a2 . e3 . | % | f2\' . c3 . | g2 . d3 . | e2 . b2 . | % |',
      lst:'| f2\'+c3 - - - - - - - | g2+d3 - - - - - - - | a2+e3 - - - - - - - | = |'+
          '| f2\'+c3 - - - - - - - | g2+d3 - - - - - - - | e2+b2 - - - - - - - | = |',
      kit:'| D+X . . . S . . . | K . . k S . . . | D . . . S . . . | K . . k S . k k |'+
          '| D . . . S . . . | K . . k S . . . | D . . . S . s S | K+C . S . S S S S |',
      fid:'| _ | . . . . . . . . g5 b5 d6 g6 d6 b5 g5 b5 | _ | . . . . . . . . e6 c6 a5 e5 a5 c6 e6 c6 |'+
          '| _ | . . . . . . . . g5 b5 d6 g6 d6 b5 g5 d5 | _ | . . . . . . . . e5 g#5\' b5 e6 g#6\' e6 b5 g#5\' |',
      tpt:'| _ | _ | _ | _ | c5 - - - - - f5\' - | e5 - - - d5 - - - | e5 - - - - - d5 - | b4 - - - g#4\' - - . |' },
    C:{b:8, v:{mar:0.8},
      flt:'| a5 - e5 a5 - b5 c6 - | e6 - - - d6 - - . | _ | _ |'+
          '| c6 - a5 c6 - d6 e6 - | f#6 - - - e6 - d6 - | e6 - - - g6 - - - | f#6 - - - a6 - - . |',
      hrn:'| _ | _ | c5 - - - g4 - - e4 | f#4 - - - d4 - b3 - |'+
          '| _ | _ | g4 - - - c5 - - - | a4 - - - f#4 - - . |',
      mar:'| a3+c4+e4> . . . a3+c4+e4> . . . | b3+d4+f#4> . . . b3+d4+f#4> . . . | g3+c4+e4> . . . g3+c4+e4> . . . | b3+d4+f#4> . . . b3+d4+f#4> . . . |'+
          '| a3+c4+e4> . . . a3+c4+e4> . . . | b3+d4+f#4> . . . b3+d4+f#4> . . . | g3+c4+e4> . . . g3+c4+e4> . . . | a3+d4+f#4> . . . a3+d4+f#4> . . . |',
      bas:'| a2 . e2 . | b2 . f#2 . | c3 . e2 . | b2 . f#2 . | a2 . e2 . | b2 . f#2 . | c3 . e2 . | d3 . a2 . |',
      lst:'| a2!* . a2* e3* a2!* . a2* e3* | b2!* . b2* f#3* b2!* . b2* f#3* | c3!* . c3* g3* c3!* . c3* g3* | b2!* . b2* f#3* b2!* . b2* f#3* |'+
          '| a2!* . a2* e3* a2!* . a2* e3* | b2!* . b2* f#3* b2!* . b2* f#3* | c3!* . c3* g3* c3!* . c3* g3* | d3!* . d3* a3* d3!* . d3* a3* |',
      kit:'| D+X . k k S . k k | D . k k S . k k | % | D . D D S S S S |'+
          '| D . k k S . k k | % | D . k k S . D k | D+C . D D S S S S |',
      fid:'| _ | _ | c6 g5 e5 g5 c6 g5 e5 g5 c6 g5 e5 g5 c6 g5 e5 g5 | b5 f#5 d5 f#5 b5 f#5 d5 f#5 b5 f#5 d5 f#5 b5 f#5 d5 f#5 |'+
          '| _ | _ | c5 g4 e4 g4 c5 g4 e4 g4 e5 c5 g4 c5 e5 c5 g4 c5 | d5 a4 f#4 a4 d5 a4 f#4 a4 f#5 d5 a4 d5 f#5 d5 a4 d5 |',
      tpt:'| a4!* . e4* a4!* . b4* c5!* . | e5! - - - . . . . | _ | _ |'+
          '| c5!* . a4* c5!* . d5* e5!* . | f#5! - - - . . . . | _ | _ |' },
    A2:{b:8, tr:2, v:{flt:1.05, hrn:0.78, mar:0.85},
      flt:'| e5 - a5 - - - b5 c6 | d6 - - - b5 - g5 - | a5 - - - f#5 - e5 d5 | e5 - - - c6 - b5 - |'+
          '| e5 - a5 - - - b5 c6 | d6 - e6 - g6 - - - | @t-2 c6 - - - a5 - f5\' - | e5 - - - b5 - g#5\' - |',
      hrn:'| c5 - - - - - d5 - | b4 - - - - - - - | a4 - - - - - - - | g4 - - - - - - . |'+
          '| a4 - - - - - - - | b4 - - - - - - - | @t-2 c5 - - - f4\' - - - | e4 - - - - - - . |',
      mar:'| e4 a4 c5 e4 a4 c5 e4 a4 | d4 g4 b4 d4 g4 b4 d4 g4 | d4 f#4 a4 d4 f#4 a4 d4 f#4 | e4 a4 c5 e4 a4 c5 e4 a4 |'+
          '| % | d4 g4 b4 d4 g4 b4 d4 g4 | @t-2 c4 f4\' a4 c4 f4\' a4 c4 f4\' | b3 e4 g#4\' b3 e4 g#4\' b3 e4 |',
      bas:'| a2 . e2 . | g2 . d2 . | f#2 . d2 . | a2 . e2 . | a2 . c3 . | g2 . b2 . | @t-2 f2\' . c3 . | e2 . g#2\' . |',
      lst:'| a2!* e3* c4* a2!* e3* c4* a2!* e3* | g2!* d3* g3* g2!* d3* g3* g2!* d3* | f#2!* d3* a3* f#2!* d3* a3* f#2!* d3* | a2!* e3* c4* a2!* e3* c4* a2!* e3* |'+
          '| % | g2!* d3* g3* g2!* d3* g3* g2!* d3* | @t-2 f2\'!* c3* f3\'* f2\'!* c3* f3\'* f2\'!* c3* | e2!* b2* e3* e2!* b2* e3* e2!* b2* |',
      kit:'| X+K . S T K k S T | K . S T K k S T | % | K . S T K S s S |'+
          '| X+K . S T K k S T | K . S T K k S T | D . S T D k S T | D+C . S S D S S S |',
      fid:'| _ | . . . . . . . . . . . . d6 e6 f#6 g6 | _ | . . . . . . . . a5 c6 e6 a6 e6 c6 a5 e5 |'+
          '| _ | _ | @t-2 . . . . . . . . c6 a5 f5\' c5 f5\' a5 c6 f6\' | e6 - - - b5 - g#5\' - e5 g#5\' b5 e6 g#6\' e6 b5 g#5\' |',
      tpt:'| a4!* . . a4* . c5* e5!* . | _ | a4!* . . a4* . d5* f#5!* . | _ |'+
          '| a4!* . . a4* . c5* e5!* . | g4!* . . g4* . b4* d5!* . | @t-2 a4! - - - c5! - - - | b4! - - - - - - . |' },
    E:{b:2,
      flt:'| e5 - a5 - - - - - | - - - - - - - . |',
      hrn:'| a3 - - - - - - - | - - - - - - - . |',
      mar:'| a3+c4+e4+a4> . . . . . . . | _ |',
      bas:'| a2 . . . | _ |' } },
  form:['I','A','B','C','A2'], loop:1, loops:2, end:'A2', coda:'E' };
/* WILD SHORES (crawl_b — the even landfalls). E minor (Aeolian; the Dorian A major's C♯ and the V's D♯ marked '), 6/8 at 112 — tribal, windswept,
   adventurous. A B A2 C B2 A3 → loop (≈ 51 s), 3 calm loops then a rest. Layers: 0 explore (the whistle, the marimba, pizzicato, frame drums) · 1 a fight
   (+ the low strings' spiccato octaves, the big drums, the fiddle) · 2 = 3 a big fight (+ the horn). Skins: cold (the tune on the flute's cold breath, the
   marimba a music box two octaves up, −2) · fire (the tune on a fiddle, +1) · wet (the tune on the ocarina, −3, wetter).
   A  — the minor motif on the tin whistle (E — B E — F♯ | G — B, a cut on its first E), answered down the scale (A G F♯ E | D — B) and in a hemiola
        (E — G — C | B — A — F♯) home to E (Em Em D Bm | C D Em Em); the marimba's rolling 8ths, the pizzicato's dotted quarters, the frame drums'
        K . k K k . Fight: the strings in spiccato octaves, big drums, the fiddle's jig fills then its running counter; big: the horn doubles the tune.
   B  — the wind: a broad high tune in long notes (E — | D B | A — | B G ‖ C E | D B | E C A | B —) over C G D Em | C G Am B, the marimba's dyads
        in a three-against-two hemiola, the drums thinning to K . . k . . Fight: a dum-da gallop, slower big drums, fiddle arpeggios; big: the horn under the tune.
   A2 — the tune on the marimba in octaves, the whistle's slow descant above it (G | B | A | F♯ D | E | D | B G | B). Fight: the fiddle sings the tune;
        big: the horn doubles the descant.
   C  — the drum circle: the frame drums alone in a busier pattern, a three-against-two marimba hocket, the pizzicato's pulse; the whistle's high call
        in the second half (B | E D | E | F♯). Fight: the big drums in hemiola (three against the frame drums' two), the fiddle's jig riff; big: the horn
        calls the motif.
   B2 — the wind again, higher (to the high G and the D♯ that turns home), over the marimba's rolling arpeggios. Fight: the fiddle's falling runs.
   A3 — the climax: the tune an octave up with its cuts, a new second half (the E-minor arpeggio up to the top B over C, down through D, the Dorian A major,
        home to E); the marimba's hemiola, the frame drums at full. Fight: the fiddle an octave under the whistle; big: the horn's broad counter.
   E  — the coda (end 'A3' — the last calm loop): the whistle's high E held over one rolled chord and a last drum. */
MUS_T.crawl_b={
  n:'Wild Shores', bpm:112, m:'6/8', key:'E aeo', sw:0, hum:4, g:0.81,
  fx:{rv:0.26, ec:'3/16', fb:0.22, ew:0.1},
  ch:{
    wst:{i:'whistle',  v:0.75, p:-0.15, s:6, L:'base',   mono:1},
    mar:{i:'marimba',  v:0.5,  p:0.25,  s:6, L:'base'},
    bas:{i:'pizz',     v:0.6,  p:0.05,  s:6, L:'base'},
    kt1:{i:'kit',      v:0.5,  p:-0.1,  s:6, L:'base'},
    lst:{i:'strings',  v:0.55, p:0,     s:6, L:'fight'},
    fid:{i:'fiddle',   v:0.6,  p:0.3,   s:6, L:'fight',  mono:1},
    kt2:{i:'kit',      v:0.5,  p:0.1,   s:6, L:'fight'},
    hrn:{i:'horn',     v:0.65, p:-0.3,  s:6, L:'fight2', mono:1} },
  lv:[['base'],['base','fight'],['base','fight','fight2'],['base','fight','fight2']],
  skin:{ cold:{ch:{wst:{i:'flute'}, mar:{i:'musicbox', t:24}}, tr:-2},
         fire:{ch:{wst:{i:'fiddle'}}, tr:1},
         wet:{ch:{wst:{i:'ocarina', v:0.85}}, tr:-3, rv:0.1} },
  sec:{
    A:{b:8, v:{wst:1.1, mar:0.65, kt2:0.75},
      wst:'| e5~ - b4 e5 - f#5 | g5 - - b5 - - | a5 - g5 f#5 - e5 | d5 - - b4 - - |'+
          '| e5 - g5 - c6 - | b5 - a5 - f#5 - | g5 - - e5 - d5 | e5 - - - - . |',
      mar:'| e3 b3 e4 g4 e4 b3 | e3 b3 e4 g4 b4 g4 | d3 a3 d4 f#4 d4 a3 | d3 f#3 b3 d4 b3 f#3 |'+
          '| c3 g3 c4 e4 c4 g3 | d3 a3 d4 f#4 a4 f#4 | e3 b3 e4 g4 e4 b3 | e3 b3 e4 b3 g3 b3 |',
      bas:'| e2 . . b2 . . | % | d2 . . a2 . . | b2 . . f#2 . . | c3 . . g2 . . | d3 . . a2 . . | e2 . . b2 . . | e2 . . . . . |',
      kt1:'| K . k K k . | % | % | K . k K k k | K . k K k . | % | % | K . k K K k |',
      lst:'| e2!* e3* b2* e2!* e3* b2* | % | d2!* d3* a2* d2!* d3* a2* | b2!* b3* f#3* b2!* b3* f#3* |'+
          '| c3!* c4* g3* c3!* c4* g3* | d2!* d3* a2* d2!* d3* a2* | e2!* e3* b2* e2!* e3* b2* | % |',
      kt2:'| X+D . . D . . | D . . D . D | D . . D . . | D . D D . D | D . . D . . | D . . D . D | D . . D . . | D . D D D D |',
      fid:'| _ | . . . . d6 e6 | _ | . . . b5~ a5 f#5 |'+
          '| g5 e5 g5 c6 g5 e5 | f#5 d5 f#5 a5 f#5 d5 | g5 e5 b4 e5 g5 b5 | e5 - - b5 d6 e6 |',
      hrn:'| e4 - b3 e4 - f#4 | g4 - - b4 - - | a4 - g4 f#4 - e4 | d4 - - b3 - - |'+
          '| e4 - g4 - c5 - | b4 - a4 - f#4 - | g4 - - e4 - d4 | e4 - - - - . |' },
    B:{b:8, v:{wst:1.1, mar:0.65, kt2:0.75},
      wst:'| e6~ - - - - - | d6 - - - b5 - | a5 - - - - - | b5 - - g5 - - |'+
          '| c6 - - e6 - - | d6 - - - b5 - | e6 - - c6 - a5 | b5 - - - - . |',
      mar:'| c3 . g3+e4 . g3+e4 . | g3 . d4+b4 . d4+b4 . | d3 . a3+f#4 . a3+f#4 . | e3 . b3+g4 . b3+g4 . |'+
          '| c3 . g3+e4 . g3+e4 . | g3 . d4+b4 . d4+b4 . | a3 . e4+c5 . e4+c5 . | f#3 . b3+d#4\' . b3+d#4\' . |',
      bas:'| c3 . . g2 . . | g2 . . d3 . . | d3 . . a2 . . | e2 . . b2 . . | c3 . . g2 . . | g2 . . d3 . . | a2 . . e2 . . | b2 . . f#2 . . |',
      kt1:'| K . . k . . | % | % | K . . k k k | K . . k . . | % | % | K . k K k k |',
      lst:'| c3!* . g3* c3* . g3* | g2!* . d3* g2* . d3* | d3!* . a3* d3* . a3* | e2!* . b2* e2* . b2* |'+
          '| c3!* . g3* c3* . g3* | g2!* . d3* g2* . d3* | a2!* . e3* a2* . e3* | b2!* . f#3* b2* . f#3* |',
      kt2:'| X+D . . . . . | D . . D . . | D . . . . . | D . . D . D | D . . . . . | D . . D . . | D . . . . . | D . D D D D |',
      fid:'| c5 e5 g5 c6 g5 e5 | b4 d5 g5 b5 g5 d5 | a4 d5 f#5 a5 f#5 d5 | g4 b4 e5 g5 e5 b4 |'+
          '| e5 g5 c6 e6 c6 g5 | d5 g5 b5 d6 b5 g5 | c5 e5 a5 c6 a5 e5 | b4 d#5\' f#5 b5 f#5 d#5\' |',
      hrn:'| e5 - - - - - | d5 - - - b4 - | a4 - - - - - | b4 - - g4 - - |'+
          '| c5 - - e5 - - | d5 - - - b4 - | e5 - - c5 - a4 | b4 - - - - . |' },
    A2:{b:8, v:{wst:0.8, mar:0.9, kt2:0.75},
      mar:'| e3+e4 - b3 e3+e4 - f#3+f#4 | g3+g4 - - b3+b4 - - | a3+a4 - g3+g4 f#3+f#4 - e3+e4 | d3+d4 - - b3 - - |'+
          '| e3+e4 - g3+g4 - c4+c5 - | b3+b4 - a3+a4 - f#3+f#4 - | g3+g4 - - e3+e4 - d3+d4 | e3+e4 - - - - . |',
      wst:'| g5 - - - - - | b5 - - - - - | a5 - - - - - | f#5 - - d6 - - |'+
          '| e6 - - - - - | d6 - - - - - | b5 - - g5 - - | b5 - - - - . |',
      bas:'| e2 . . b2 . . | % | d2 . . a2 . . | b2 . . f#2 . . | c3 . . g2 . . | d3 . . a2 . . | e2 . . b2 . . | e2 . . . . . |',
      kt1:'| K . k K k . | % | % | K . k K k k | K . k K k . | % | % | K . k K K k |',
      lst:'| e2!* e3* b2* e2!* e3* b2* | % | d2!* d3* a2* d2!* d3* a2* | b2!* b3* f#3* b2!* b3* f#3* |'+
          '| c3!* c4* g3* c3!* c4* g3* | d2!* d3* a2* d2!* d3* a2* | e2!* e3* b2* e2!* e3* b2* | % |',
      kt2:'| X+D . . D . . | D . . D . D | D . . D . . | D . D D . D | D . . D . . | D . . D . D | D . . D . . | D . D D D D |',
      fid:'| e5~ - b4 e5 - f#5 | g5 - - b5 - - | a5 - g5 f#5 - e5 | d5 - - b4 - - |'+
          '| e5 - g5 - c6 - | b5 - a5 - f#5 - | g5 - - e5 - d5 | e5 - - - - . |',
      hrn:'| g4 - - - - - | b4 - - - - - | a4 - - - - - | f#4 - - d5 - - |'+
          '| e5 - - - - - | d5 - - - - - | b4 - - g4 - - | b4 - - - - . |' },
    C:{b:8, v:{fid:1.45, mar:0.7, kt2:0.7, wst:0.85, bas:0.85},
      kt1:'| K . k K . k | K k k K . k | K . k K . k | K k K K K k |'+
          '| K . k K . k | K k k K . k | K . k K . k | K k K K K k |',
      mar:'| e4 - b3+g4 - e4 - | % | c4 - g3+e4 - c4 - | d4 - a3+f#4 - d4 - |'+
          '| e4 - b3+g4 - e4 - | % | c4 - g3+e4 - c4 - | b3 - f#3+d#4\' - b3 - |',
      bas:'| e2 . e2 b2 . e2 | % | e2 . e2 g2 . c3 | d3 . d3 a2 . d3 | e2 . e2 b2 . e2 | % | e2 . e2 g2 . c3 | b2 . b2 f#2 . b2 |',
      wst:'| _ | _ | _ | _ | b5 - - - - - | e6 - - d6 - - | e6 - - - - - | f#6 - - - - . |',
      lst:'| e2!* . e2* e2!* . b2* | % | c3!* . c3* c3!* . g2* | d3!* . d3* d3!* . a2* |'+
          '| e2!* . e2* e2!* . b2* | % | c3!* . c3* c3!* . g2* | b2!* . b2* b2!* . f#2* |',
      kt2:'| X+D . D . D . | D . . D . . | D . D . D . | D . D D D D |'+
          '| D . D . D . | D . . D . . | D . D . D . | D . D D D D |',
      fid:'| e5~ - - g5 a5 b5 | g5 f#5 g5 b5 - - | c6 - b5 a5 g5 e5 | f#5 - d5 a5 - - |'+
          '| g5 e5 b4 e5 g5 b5 | e5 b4 e5 g5 a5 b5 | c6 g5 e5 g5 c6 e6 | d#6\' b5 f#5 b5 d#6\' - |',
      hrn:'| e4 - b3 e4 - f#4 | g4 - - b4 - - | c5 - - g4 - - | a4 - - f#4 - - |'+
          '| e4 - b3 e4 - f#4 | g4 - - b4 - - | c5 - - e5 - - | d#5\' - - - - . |' },
    B2:{b:8, v:{wst:1.1, mar:0.65, kt2:0.75},
      wst:'| e6~ - - - - - | d6 - - - b5 - | a5 - - - - - | b5 - - g5 - - |'+
          '| c6 - - e6 - - | g6 - - - f#6 - | e6 - - - d6 - | d#6\' - - b5 - . |',
      mar:'| c3 g3 c4 e4 c4 g3 | g3 d4 g4 b4 g4 d4 | d3 a3 d4 f#4 d4 a3 | e3 b3 e4 g4 e4 b3 |'+
          '| c3 g3 c4 e4 c4 g3 | g3 d4 g4 b4 g4 d4 | a3 e4 a4 c5 a4 e4 | f#3 b3 d#4\' f#4 d#4\' b3 |',
      bas:'| c3 . . g2 . . | g2 . . d3 . . | d3 . . a2 . . | e2 . . b2 . . | c3 . . g2 . . | g2 . . d3 . . | a2 . . e2 . . | b2 . . f#2 . . |',
      kt1:'| K . k K k . | % | % | K . k K k k | K . k K k . | % | % | K . k K K k |',
      lst:'| c3!* c4* g3* c3!* c4* g3* | g2!* g3* d3* g2!* g3* d3* | d2!* d3* a2* d2!* d3* a2* | e2!* e3* b2* e2!* e3* b2* |'+
          '| c3!* c4* g3* c3!* c4* g3* | g2!* g3* d3* g2!* g3* d3* | a2!* a3* e3* a2!* a3* e3* | b2!* b3* f#3* b2!* b3* f#3* |',
      kt2:'| X+D . . D . . | D . . D . D | D . . D . . | D . D D . D | D . . D . . | D . . D . D | D . . D . . | D . D D D D |',
      fid:'| e6 c6 g5 e5 g5 c6 | b5 g5 d5 g5 b5 d6 | a5 f#5 d5 f#5 a5 d6 | g5 e5 b4 e5 g5 b5 |'+
          '| e6 c6 g5 e5 g5 c6 | d6 b5 g5 b5 d6 g6 | c6 a5 e5 a5 c6 e6 | d#6\' b5 f#5 b5 d#6\' f#6 |',
      hrn:'| e5 - - - - - | d5 - - - b4 - | a4 - - - - - | b4 - - g4 - - |'+
          '| c5 - - e5 - - | d5 - - - - - | c5 - - - b4 - | b4 - - - - . |' },
    A3:{b:8, v:{wst:1.05, mar:0.7, kt2:0.75},
      wst:'| e6~ - b5 e6 - f#6 | g6 - - b6 - - | a6 - g6 f#6 - e6 | d6 - - b5 - - |'+
          '| e6 - g6 - b6 - | a6 - f#6 - d6 - | e6 - - c#6\' - a5 | b5 - - e6 - . |',
      mar:'| e3 . b3+g4 . b3+g4 . | % | d3 . a3+f#4 . a3+f#4 . | d3 . b3+f#4 . b3+f#4 . |'+
          '| c3 . g3+e4 . g3+e4 . | d3 . a3+f#4 . a3+f#4 . | a3 . e4+c#5\' . e4+c#5\' . | e3 . b3+g4 . b3+g4 . |',
      bas:'| e2 . . b2 . . | % | d2 . . a2 . . | b2 . . f#2 . . | c3 . . g2 . . | d3 . . a2 . . | a2 . . e2 . . | e2 . . b2 . . |',
      kt1:'| K k k K k k | K . k K k k | K k k K k k | K . K K k K |'+
          '| K k k K k k | K . k K k k | K k k K k k | K K K K K K |',
      lst:'| e2!* e3* b2* e2!* e3* b2* | % | d2!* d3* a2* d2!* d3* a2* | b2!* b3* f#3* b2!* b3* f#3* |'+
          '| c3!* c4* g3* c3!* c4* g3* | d2!* d3* a2* d2!* d3* a2* | a2!* a3* e3* a2!* a3* e3* | e2!* e3* b2* e2!* e3* b2* |',
      kt2:'| X+D . . D . . | D . . D . D | D . . D . . | D . D D . D | X+D . . D . . | D . . D . D | D . . D . . | D . D D D D |',
      fid:'| e5~ - b4 e5 - f#5 | g5 - - b5 - - | a5 - g5 f#5 - e5 | d5 - - b4 - - |'+
          '| e5 - g5 - b5 - | a5 - f#5 - d5 - | e5 - - c#5\' - a4 | b4 - - e5 - . |',
      hrn:'| b3 - - - - - | e4 - - - - - | f#4 - - - - - | f#4 - - d4 - - |'+
          '| e4 - - - - - | f#4 - - a4 - - | a4 - - c#5\' - - | e4 - - - - . |' },
    E:{b:2,
      wst:'| e6 - - - - - | - - - - - . |',
      mar:'| e3+b3+e4+g4> . . . . . | _ |',
      bas:'| e2 . . . . . | _ |',
      kt1:'| K . . . . . | _ |' } },
  form:['A','B','A2','C','B2','A3'], loop:0, loops:3, end:'A3', coda:'E' };
/* THE DEEP BELOW (cave — every cave floor). A Phrygian (the ♭2 B♭ is the cave's unease; C's B♮ and the E-major G♯ marked '), 4/4 at 86 — a dripping,
   echoing FF dungeon. A B C A2 → loop (≈ 89 s), 2 calm loops then the coda and a rest; deeper floors darken it (the director: musLP 9000 → 4500 Hz,
   the reverb ×1.05 → ×1.5). Layers: 0 explore (base + mid: the drone, the celesta's drips, the harp, the choir) · 1 a fight (+ the timpani, the
   pizzicato ostinato, the drums) · 2 = 3 a big fight (+ the fiddle).
   A  — the drips: over an A pedal (the low strings' open fifth) the celesta drips the Phrygian motif (A — E — A | B♭ — C | E … D) in a 3-3-2 rhythm,
        falling C B♭ to G, then again up to the F and down E D C to the B♭ → A close; the harp's low plinks (a stone into a pool), the choir's soft
        chords (Am B♭ Am Gm | Am B♭ C/A B♭–Am). Fight: the timpani's 3-3-2 heartbeat, the pizzicato's A–B♭ ostinato, big drum & bodhrán toms; big:
        the fiddle's 16th bariolage round the open E.
   B  — the lament: the bass moves (Dm B♭ Gm Am | Dm B♭ C B♭–Am); the choir sings a slow tune that leaps a minor 6th (D → B♭), sighs B♭–A and
        falls by step to E, then climbs D F A B♭ C to the D and falls home by the Phrygian cadence; the harp's 8th arpeggios, the celesta answering
        in the gaps. Fight: the timpani on the roots, octave-pumping pizzicato, a half-time snare; big: the fiddle sings the lament an octave up.
   C  — the lake of glass: a lament bass falling by semitones (C B B♭ A G F E — C G/B Gm/B♭ F/A Gm Dm/F Esus4 E), the harp's ripple sweeping up
        each bar, a new glassy tune rising against it on the celesta with the choir an octave below; the E-major chord pulls home. Fight: a driving
        backbeat, the pizzicato in octaves, the timpani's roll into the E; big: the fiddle's broken-chord 16ths.
   A2 — the drips again over a moving bass (Am B♭ Am Gm | Am B♭ Dm B♭–Am), the choir's slow counter-line rising under them, the harp's ripples
        rising each bar; a new last phrase up to the high F and down C B♭ A. Fight: the A groove at full (crash, snare, the pizzicato in octaves);
        big: the fiddle sings the drip tune.
   E  — the coda (end 'A2' — the last calm loop): the motif's three drips over the drone, a last plink — the rest begins on the tonic. */
MUS_T.cave={
  n:'The Deep Below', bpm:86, m:'4/4', key:'A phr', sw:0, hum:5, g:1,
  fx:{rv:0.45, ec:'3/16', fb:0.35, ew:0.18},
  ch:{
    cel:{i:'celesta',  v:0.8,  p:0.3,   s:8,  L:'base'},
    cho:{i:'choir',    v:0.5,  p:-0.25, s:8,  L:'mid'},
    har:{i:'harp',     v:0.55, p:0.2,   s:8,  L:'base'},
    low:{i:'strings',  v:0.5,  p:0,     s:8,  L:'base'},
    tim:{i:'timp',     v:0.5,  p:-0.15, s:8,  L:'fight'},
    pzz:{i:'pizz',     v:0.5,  p:0.1,   s:8,  L:'fight'},
    kt:{i:'kit',       v:0.5,  p:0.05,  s:8,  L:'fight'},
    fid:{i:'fiddle',   v:0.55, p:0.35,  s:16, L:'fight2', mono:1} },
  lv:[['base','mid'],['base','mid','fight'],['base','mid','fight','fight2'],['base','mid','fight','fight2']],
  sec:{
    A:{b:8, v:{cel:1.75, cho:0.6, har:0.8, low:0.4, pzz:0.77, kt:0.9, fid:0.7},
      cel:'| a5 . . e5 . . a5 . | bb5 . . c6 . . . . | e6 . . . . . d6 . | c6 . . bb5 . . g5 . |'+
          '| a5 . . e5 . . a5 . | bb5 . . c6 . . f6 . | e6 . . . d6 . c6 . | bb5 . . . a5 . . . |',
      cho:'| a3+c4+e4 - - - - - - - | bb3+d4 - - - - - - - | a3+c4+e4 - - - - - - - | bb3+d4+g4 - - - - - - - |'+
          '| a3+c4+e4 - - - - - - - | bb3+d4 - - - - - - - | g3+c4+e4 - - - - - - - | bb3+d4 - - - a3+c4+e4 - - - |',
      har:'| . . a3 . . . . e4 | . . d4 . . . . bb3 | . . a3 . . . . c4 | . . g3 . . . . d4 |'+
          '| . . a3 . . . . e4 | . . d4 . . . . f4 | . . c4 . . . . g3 | . . bb3 . . . . a3 |',
      low:'| a1+e2 - - - - - - - | = | a1+e2 - - - - - - - | = | a1+e2 - - - - - - - | = | a1+e2 - - - - - - - | = |',
      tim:'| a2! . . a2 . . a2 . | % | % | a2! . . a2 . . a2~ - | a2! . . a2 . . a2 . | % | % | a2! . . a2 . . e2 e2 |',
      pzz:'| a2! a2 bb2 a2! a2 bb2 a2! e2 | % | % | a2! a2 bb2 a2! a2 c3 bb2 a2 |'+
          '| a2! a2 bb2 a2! a2 bb2 a2! e2 | % | % | a2! a2 bb2 a2! e2 f2 e2 d2 |',
      kt:'| X+D . . K . . K . | D . . K . . K k | D . . K . . K . | D . . K . k K k |'+
         '| X+D . . K . . K . | D . . K . . K k | D . . K . . K . | D . K k K+C k K K |',
      fid:'| a4 e4 bb4 e4 a4 e4 c5 e4 a4 e4 bb4 e4 a4 e4 g4 e4 | d5 bb4 f4 bb4 d5 bb4 c5 bb4 d5 bb4 f4 bb4 d5 bb4 c5 bb4 |'+
          '| a4 e4 bb4 e4 a4 e4 c5 e4 a4 e4 bb4 e4 a4 e4 g4 e4 | g4 d4 bb4 d4 g4 d4 c5 d4 g4 d4 bb4 d4 g4 d4 a4 d4 |'+
          '| a4 e4 bb4 e4 a4 e4 c5 e4 a4 e4 bb4 e4 a4 e4 g4 e4 | d5 bb4 f4 bb4 d5 bb4 c5 bb4 d5 bb4 f4 bb4 d5 bb4 c5 bb4 |'+
          '| e5 c5 a4 c5 e5 c5 g4 c5 e5 c5 a4 c5 e5 c5 d5 c5 | d5 bb4 f4 bb4 d5 bb4 c5 bb4 a4 e4 bb4 e4 a4 e4 c5 e4 |' },
    B:{b:8, v:{cho:1.3, cel:0.7, har:0.6, low:0.55, pzz:0.72, kt:0.9},
      cho:'| d4 - - - - - - - | bb4 - - - - - a4 - | g4 - - - - - f4 - | e4 - - - - - - - |'+
          '| d4 - - - f4 - a4 - | bb4 - - - - - c5 - | d5 - - - - - c5 - | c5 - bb4 - a4 - - - |',
      cel:'| . . . . a5 . d6 . | . . . . f6 . . . | . . . . d6 . bb5 . | . . . . e6 . . . |'+
          '| . . . . a5 . d6 . | . . . . f6 . . . | . . . . g6 . e6 . | . . . . c6 . . . |',
      har:'| d3 a3 d4 f4 a4 f4 d4 a3 | bb2 f3 bb3 d4 f4 d4 bb3 f3 | g2 d3 g3 bb3 d4 bb3 g3 d3 | a2 e3 a3 c4 e4 c4 a3 e3 |'+
          '| d3 a3 d4 f4 a4 f4 d4 a3 | bb2 f3 bb3 d4 f4 d4 bb3 f3 | c3 g3 c4 e4 g4 e4 c4 g3 | bb2 f3 bb3 d4 a2 e3 a3 c4 |',
      low:'| d2+a2 - - - - - - - | bb1+f2 - - - - - - - | g2+d3 - - - - - - - | a1+e2 - - - - - - - |'+
          '| d2+a2 - - - - - - - | bb1+f2 - - - - - - - | c2+g2 - - - - - - - | bb1+f2 - - - a1+e2 - - - |',
      tim:'| d2! . . . a2 . . . | bb2! . . . f2 . . . | g2! . . . d2 . . . | a2! . . . e2 . a2 a2 |'+
          '| d2! . . . a2 . . . | bb2! . . . f2 . . . | c3! . . . g2 . . . | bb2! . . . a2~ - - - |',
      pzz:'| d2! d2 d3 d2 a2! d2 d3 d2 | bb1! bb1 bb2 bb1 f2! bb1 bb2 bb1 | g2! g2 g3 g2 d3! g2 g3 g2 | a2! a2 a3 a2 e2! a2 a3 a2 |'+
          '| d2! d2 d3 d2 a2! d2 d3 d2 | bb1! bb1 bb2 bb1 f2! bb1 bb2 bb1 | c2! c2 c3 c2 g2! c2 c3 c2 | bb1! bb1 bb2 bb1 a2! a2 e2 a2 |',
      kt:'| X+D . k . S . k k | D . k . S . k . | D . k . S . k k | D . k . S . S S |'+
         '| X+D . k . S . k k | D . k . S . k . | D . k . S . k k | D . k . S+C S S S |',
      fid:'| d5 - - - - - - - - - - - e5 f5 g5 a5 | bb5 - - - - - - - - - - - a5 - - - | g5 - - - - - - - - - - - f5 - - - | e5 - - - - - - - a4 c5 e5 a5 g5 f5 e5 d5 |'+
          '| d5 - - - - - - - f5 - - - a5 - - - | bb5 - - - - - - - - - - - c6 - - - | d6 - - - - - - - - - - - c6 - - - | c6 - - - bb5 - - - a5 - - - - - - . |' },
    C:{b:8, s:{har:16}, v:{cel:1.7, cho:1.0, har:0.5, low:0.5, pzz:0.9, kt:0.9, fid:0.7},
      cel:'| e5 - - - g5 - c6 - | d6 - - - - - - - | d6 - - - bb5 - g5 - | a5 - - - c6 - f6 - |'+
          '| g6 - - - - - f6 - | f6 - - - d6 - a5 - | a5 - - - - - b5\' - | g#5\' - - - - - - - |',
      cho:'| e4 - - - g4 - c5 - | d5 - - - - - - - | d5 - - - bb4 - g4 - | a4 - - - c5 - f5 - |'+
          '| g5 - - - - - f5 - | f5 - - - d5 - a4 - | a4 - - - - - b4\' - | g#4\' - - - - - - - |',
      har:'| c3 g3 c4 e4 g4 c5 e5 g5 . . . . . . . . | b2\' g3 b3\' d4 g4 b4\' d5 g5 . . . . . . . . | bb2 g3 bb3 d4 g4 bb4 d5 g5 . . . . . . . . | a2 f3 a3 c4 f4 a4 c5 f5 . . . . . . . . |'+
          '| g2 d3 g3 bb3 d4 g4 bb4 d5 . . . . . . . . | f2 d3 f3 a3 d4 f4 a4 d5 . . . . . . . . | e2 b2\' e3 a3 b3\' e4 a4 b4\' . . . . . . . . | e2 b2\' e3 g#3\' b3\' e4 g#4\' b4\' . . . . . . . . |',
      low:'| c3+g3 - - - - - - - | b2\'+g3 - - - - - - - | bb2+g3 - - - - - - - | a2+f3 - - - - - - - |'+
          '| g2+d3 - - - - - - - | f2+d3 - - - - - - - | e2+b2\' - - - - - - - | = |',
      tim:'| c3! . . . . . . . | b2\'! . . . . . . . | bb2! . . . . . . . | a2! . . . a2~ - - - |'+
          '| g2! . . . . . . . | f2! . . . . . . . | e2! . . . . . . . | e2~ - - - - - - - |',
      pzz:'| c2! c3 c2 c3 c2! c3 c2 c3 | b1\'! b2\' b1\' b2\' b1\'! b2\' b1\' b2\' | bb1! bb2 bb1 bb2 bb1! bb2 bb1 bb2 | a1! a2 a1 a2 a1! a2 a1 a2 |'+
          '| g2! g3 g2 g3 g2! g3 g2 g3 | f2! f3 f2 f3 f2! f3 f2 f3 | e2! e3 e2 e3 e2! e3 e2 e3 | e2! e3 e2 e3 e2! b2\' g#2\' b2\' |',
      kt:'| X+D . S k D . S k | D . S k D . S k | D . S k D . S k | D . S k D S S S |'+
         '| X+D . S k D . S k | D . S k D . S k | D . S k D S S k | D . S S S+C S S S |',
      fid:'| e5 c5 g4 c5 e5 c5 g4 c5 e5 c5 g4 c5 e5 c5 g5 c5 | d5 b4\' g4 b4\' d5 b4\' g4 b4\' d5 b4\' g4 b4\' d5 b4\' g5 b4\' |'+
          '| d5 bb4 g4 bb4 d5 bb4 g4 bb4 d5 bb4 g4 bb4 d5 bb4 g5 bb4 | c5 a4 f4 a4 c5 a4 f4 a4 c5 a4 f4 a4 c5 a4 f5 a4 |'+
          '| bb4 g4 d4 g4 bb4 g4 d4 g4 bb4 g4 d4 g4 bb4 g4 d5 g4 | a4 f4 d4 f4 a4 f4 d4 f4 a4 f4 d4 f4 a4 f4 d5 f4 |'+
          '| a4 e4 b3\' e4 a4 e4 b3\' e4 a4 e4 b3\' e4 a4 e4 b4\' e4 | g#4\' e4 b3\' e4 g#4\' e4 b3\' e4 e5 b4\' g#4\' b4\' e5 b4\' g#4\' b4\' |' },
    A2:{b:8, v:{cel:1.7, cho:0.8, har:0.7, low:0.55, pzz:0.72, kt:0.9},
      cel:'| a5 . . e5 . . a5 . | bb5 . . c6 . . . . | e6 . . . . . d6 . | c6 . . bb5 . . g5 . |'+
          '| a5 . . e5 . . a5 . | bb5 . . c6 . . d6 . | f6 . . e6 . . d6 . | c6 . bb5 . a5 . . . |',
      cho:'| e4 - - - - - - - | d4 - - - - - - - | c4 - - - e4 - - - | d4 - - - - - - - |'+
          '| e4 - - - a4 - - - | bb4 - - - - - - - | a4 - - - - - - - | f4 - - - e4 - - - |',
      har:'| a2 e3 a3 c4 e4 . . . | bb2 f3 bb3 d4 f4 . . . | a2 e3 a3 c4 e4 . . . | g2 d3 g3 bb3 d4 . . . |'+
          '| a2 e3 a3 c4 e4 . . . | bb2 f3 bb3 d4 f4 . . . | d3 a3 d4 f4 a4 . . . | bb2 f3 bb3 . a2 e3 a3 . |',
      low:'| a1+e2 - - - - - - - | bb1+f2 - - - - - - - | a1+e2 - - - - - - - | g2+d3 - - - - - - - |'+
          '| a1+e2 - - - - - - - | bb1+f2 - - - - - - - | d2+a2 - - - - - - - | bb1+f2 - - - a1+e2 - - - |',
      tim:'| a2! . . a2 . . a2 . | bb2! . . bb2 . . bb2 . | a2! . . a2 . . a2 . | g2! . . g2 . . g2~ - |'+
          '| a2! . . a2 . . a2 . | bb2! . . bb2 . . bb2 . | d2! . . d2 . . d2 . | bb2! . . . a2~ - - - |',
      pzz:'| a2! a3 bb2 a2! a3 bb2 a2! e3 | bb2! bb3 c3 bb2! bb3 c3 bb2! f3 | a2! a3 bb2 a2! a3 bb2 a2! e3 | g2! g3 a2 g2! g3 a2 g2! d3 |'+
          '| a2! a3 bb2 a2! a3 bb2 a2! e3 | bb2! bb3 c3 bb2! bb3 c3 bb2! f3 | d2! d3 e2 d2! d3 e2 d2! a2 | bb2! bb3 c3 bb2 a2! a3 bb2 a2 |',
      kt:'| X+D . k K S k K k | D . k K S k K k | D . k K S k K k | D . k K S k S S |'+
         '| X+D . k K S k K k | D . k K S k K k | D . k K S k K k | D . K K S+C S S S |',
      fid:'| a4 - - - - - e4 - - - - - a4 - - - | bb4 - - - - - c5 - - - - - - - - - | e5 - - - - - - - - - - - d5 - - - | c5 - - - - - bb4 - - - - - g4 a4 bb4 c5 |'+
          '| a4 - - - - - e4 - - - - - a4 - - - | bb4 - - - - - c5 - - - - - d5 - - - | f5 - - - - - e5 - - - - - d5 - - - | c5 - - - bb4 - - - a4 - - - - - - . |' },
    E:{b:2, v:{cel:1.75, cho:0.6, har:0.8, low:0.4},
      cel:'| a5 . . e5 . . a5 . | _ |',
      cho:'| a3+c4+e4 - - - - - - - | - - - - . . . . |',
      har:'| . . a3 . . . . e4 | _ |',
      low:'| a1+e2 - - - - - - - | - - - - - - - . |' } },
  form:['A','B','C','A2'], loop:0, loops:2, end:'A2', coda:'E' };
/* CLASH OF TIDES (boss — a boss's room, from its banner or its seal). D minor (Aeolian; the Phrygian ♭2 E♭ and the V's C♯ marked '), 4/4 at 152 —
   an FF boss battle with pirate fiddle runs. I A B A2 C D → loop to A (≈ 57 s), on for the whole duel. Layers: 0 the duel (base + mid) · 1 the
   frenzy — the boss under 35 % of its life (+ the trumpet: the tune an octave up, the fiddle's line doubled, the calls, the fanfare).
   I  — the challenge: a timpani roll, the crash, the BOATS motif inverted (D G D C B♭ G) called on the horn, the fiddle's run down into the fight.
   A  — the clash: the upright's 8th ostinato (D D F D D E♭ D C — the E♭ is the menace) under the horn's tune in long notes, the inverted motif
        slowed (D … G | D … C … B♭ | G over E♭ | A C♯ E), then a leap to A and down B♭ A G F G to the A; power chords, a rock drive (big drum,
        snare, bodhrán tips), the fiddle's runs up and down the Phrygian-dominant scale in bars 4 and 8.
   B  — the fiddle's counter-tune: a falling sequence (D C D A | B♭ A B♭ F | G F G D | E D E C♯) then one climbing to the top A, the choir's
        chords (Dm B♭/D Gm A), the horn's long D F G E under the second half; a tresillo kick.
   A2 — the tune again, the choir singing it an octave over the horn, the fiddle spinning 16th arpeggios; a new second half that climbs twice to
        the B♭ (B♭ Gm E♭ A); a crash every 4 bars; A's V lands deceptively on C's F.
   C  — the heroic turn: F major, the motif un-inverted and called on the horn (F C F G A | C), sequenced up on B♭ (B♭ F B♭ C D | E) over a bass
        walking down F E D C; the fiddle answers each call; the choir's big chords; a snare march; A7 back to the minor.
   D  — the undertow: the ostinato and the soft choir over one drum & timpani stroke a bar (G14 FIX: a 2-bar breath ≈ 4 dB under A), then the E♭ and the A — the horn low, the fiddle racing up to its
        top, a snare roll and a cymbal swell into A. */
MUS_T.boss={
  n:'Clash of Tides', bpm:152, m:'4/4', key:'D aeo', sw:0, hum:3, g:0.93,
  fx:{rv:0.22, ec:'1/8', fb:0.12, ew:0.05},
  ch:{
    hrn:{i:'horn',     v:0.9,  p:-0.25, s:8,  L:'base',   mono:1},
    fid:{i:'fiddle',   v:0.7,  p:0.3,   s:16, L:'mid',    mono:1},
    tpt:{i:'trumpet',  v:0.7,  p:-0.1,  s:8,  L:'frenzy', mono:1},
    str:{i:'strings',  v:0.5,  p:0.1,   s:8,  L:'base'},
    cho:{i:'choir',    v:0.5,  p:-0.05, s:8,  L:'mid'},
    bas:{i:'ubass',    v:0.5,  p:0,     s:8,  L:'base'},
    tim:{i:'timp',     v:0.6,  p:-0.15, s:8,  L:'base'},
    kit:{i:'kit',      v:0.5,  p:0.15,  s:8,  L:'base'} },
  lv:[['base','mid'],['base','mid','frenzy']],
  sec:{
    I:{b:2, v:{hrn:1.1, str:0.72, cho:0.9, kit:0.88},
      hrn:'| d4 - g4 - d4 c4 bb3 g3 | a3 - - - - - - . |',
      tpt:'| d5 - g5 - d5 c5 bb4 g4 | a4 - - - - - - . |',
      str:'| d3+a3+d4 - - - - - - - | a2+e3+c#4\' - - - - - - - |',
      cho:'| d4+a4 - - - - - - - | c#4\'+e4+a4 - - - - - - - |',
      bas:'| d2 - - - - - - - | a2 - - - a1 . a1 a1 |',
      tim:'| d2~ - - - - - - - | a2! . . . a2 . a2 a2 |',
      kit:'| X . . . . . . . | D C S . D S S S |',
      fid:'| _ | . . . . . . . . a5 g5 f5 e5 d5 c#5\' bb4 a4 |' },
    A:{b:8, v:{hrn:1.1, str:0.72, kit:0.88},
      hrn:'| d4 - - g4 - - - - | d4 - - c4 - - bb3 - | g3 - - - - - - - | a3 - - c#4\' - - e4 - |'+
          '| d4 - - a4 - - - - | bb4 - - a4 - - g4 - | f4 - - - g4 - - - | a4 - - - e4 - - - |',
      tpt:'| d5 - - g5 - - - - | d5 - - c5 - - bb4 - | g4 - - - - - - - | a4 - - c#5\' - - e5 - |'+
          '| d5 - - a5 - - - - | bb5 - - a5 - - g5 - | f5 - - - g5 - - - | a5 - - - e5 - - - |',
      str:'| d3+a3+d4 - - - - - - - | d3+g3+bb3 - - - - - - - | eb3\'+g3+bb3 - - - - - - - | a2+e3+c#4\' - - - - - - - |'+
          '| d3+a3+d4 - - - - - - - | d3+f3+bb3 - - - - - - - | d3+g3+bb3 - - - eb3\'+g3+bb3 - - - | a2+e3+g3+c#4\' - - - - - - - |',
      bas:'| d2 d2 f2 d2 d2 eb2\' d2 c2 | d2 d2 f2 d2 d2 eb2\' d2 c2 | eb2\' eb2\' g2 eb2\' eb2\' f2 eb2\' d2 | a1 a1 c#2\' a1 a1 bb1 a1 g1 |'+
          '| d2 d2 f2 d2 d2 eb2\' d2 c2 | bb1 bb1 d2 bb1 bb1 c2 bb1 a1 | g1 g1 bb1 g1 eb2\' f2 eb2\' d2 | a1 a1 c#2\' a1 a1 bb1 a1 c#2\' |',
      tim:'| d2! . . d2 . . . . | d2! . . d2 . . . . | eb2\'! . . eb2\' . . . . | a2! . . . a2~ - - - |'+
          '| d2! . . d2 . . . . | bb2! . . bb2 . . . . | g2! . . . eb2\'! . . . | a2! . . . a2~ - - - |',
      kit:'| X+D k S k D k S k | D k S k D k S k | D k S k D k S k | D k S k D S S S |'+
          '| X+D k S k D k S k | D k S k D k S k | D k S k D k S k | D C S k D S S S |',
      fid:'| _ | _ | _ | . . . . . . . . a4 bb4 c#5\' d5 e5 f5 g5 a5 |'+
          '| _ | _ | _ | . . . . . . . . a5 g5 f5 e5 d5 c#5\' bb4 a4 |' },
    B:{b:8, v:{fid:1.3, hrn:0.75, cho:0.72, str:0.72, kit:0.88},
      fid:'| d6 - - - - - c6 - d6 - - - a5 - - - | bb5 - - - - - a5 - bb5 - - - f5 - - - | g5 - - - - - f5 - g5 - - - d5 - - - | e5 - - - - - d5 - e5 - - - c#5\' - - - |'+
          '| f5 - - - - - e5 - f5 - - - a5 - - - | d6 - - - - - c6 - d6 - - - f6 - - - | g6 - - - - - f6 - g6 - - - d6 - - - | c#6\' - - - - - d6 - e6 - - - a6 - - - |',
      tpt:'| d5 - - c5 d5 - a4 - | bb4 - - a4 bb4 - f4 - | g4 - - f4 g4 - d4 - | e4 - - d4 e4 - c#4\' - |'+
          '| f4 - - e4 f4 - a4 - | d5 - - c5 d5 - f5 - | g5 - - f5 g5 - d5 - | c#5\' - - d5 e5 - a5 - |',
      hrn:'| _ | _ | _ | _ | d4 - - - - - - - | f4 - - - - - - - | g4 - - - - - - - | e4 - - - - - - . |',
      cho:'| d4+f4+a4 - - - - - - - | d4+f4+bb4 - - - - - - - | d4+g4+bb4 - - - - - - - | c#4\'+e4+a4 - - - - - - - |'+
          '| d4+f4+a4 - - - - - - - | d4+f4+bb4 - - - - - - - | d4+g4+bb4 - - - - - - - | c#4\'+e4+a4 - - - - - - - |',
      str:'| d3+a3 - - - - - - - | d3+bb3 - - - - - - - | g2+d3 - - - - - - - | a2+e3 - - - - - - - |'+
          '| d3+a3 - - - - - - - | d3+bb3 - - - - - - - | g2+d3 - - - - - - - | a2+e3 - - - - - - - |',
      bas:'| d2 d2 f2 d2 d2 eb2\' d2 c2 | d2 d2 f2 d2 d2 eb2\' d2 c2 | g1 g1 bb1 g1 g1 a1 g1 f1 | a1 a1 c#2\' a1 a1 bb1 a1 g1 |'+
          '| d2 d2 f2 d2 d2 eb2\' d2 c2 | d2 d2 f2 d2 d2 eb2\' d2 c2 | g1 g1 bb1 g1 g1 a1 g1 f1 | a1 a1 c#2\' a1 a1 bb1 a1 c#2\' |',
      tim:'| d2! . . d2 . . a2 . | d2! . . d2 . . f2 . | g2! . . g2 . . d2 . | a2! . . a2 . . e2 . |'+
          '| d2! . . d2 . . a2 . | d2! . . d2 . . f2 . | g2! . . g2 . . d2 . | a2! . . a2 . a2~ - - |',
      kit:'| X+D . S D . k S k | D . S D . k S k | D . S D . k S k | D . S D . S S S |'+
          '| X+D . S D . k S k | D . S D . k S k | D . S D . k S k | D C S D . S S S |' },
    A2:{b:8, v:{hrn:1.1, cho:0.9, str:0.72, kit:0.88},
      hrn:'| d4 - - g4 - - - - | d4 - - c4 - - bb3 - | g3 - - - - - - - | a3 - - c#4\' - - e4 - |'+
          '| f4 - - bb4 - - - - | bb4 - - a4 - - g4 - | g4 - - - bb4 - - - | a4 - - - - - - - |',
      cho:'| d5 - - g5 - - - - | d5 - - c5 - - bb4 - | g4 - - - - - - - | a4 - - c#5\' - - e5 - |'+
          '| f5 - - bb5 - - - - | bb5 - - a5 - - g5 - | g5 - - - bb5 - - - | a5 - - - - - - - |',
      tpt:'| d5 - - g5 - - - - | d5 - - c5 - - bb4 - | g4 - - - - - - - | a4 - - c#5\' - - e5 - |'+
          '| f5 - - bb5 - - - - | bb5 - - a5 - - g5 - | g5 - - - bb5 - - - | a5 - - - - - - - |',
      fid:'| d5 f5 a5 d6 a5 f5 d5 f5 a5 d6 a5 f5 d5 f5 a5 f5 | d5 g5 bb5 d6 bb5 g5 d5 g5 bb5 d6 bb5 g5 d5 g5 bb5 g5 |'+
          '| eb5\' g5 bb5 eb6\' bb5 g5 eb5\' g5 bb5 eb6\' bb5 g5 eb5\' g5 bb5 g5 | a5 c#6\' e6 a6 e6 c#6\' a5 c#6\' e6 a6 e6 c#6\' a5 c#6\' e6 c#6\' |'+
          '| f5 bb5 d6 f6 d6 bb5 f5 bb5 d6 f6 d6 bb5 f5 bb5 d6 bb5 | g5 bb5 d6 g6 d6 bb5 g5 bb5 d6 g6 d6 bb5 g5 bb5 d6 bb5 |'+
          '| g5 bb5 eb6\' g6 eb6\' bb5 g5 bb5 eb6\' g6 eb6\' bb5 g5 bb5 eb6\' bb5 | c#6\' e6 a6 e6 c#6\' a5 e5 a5 c#6\' e6 a6 e6 c#6\' a5 g5 f5 |',
      str:'| d3+a3+d4 - - - - - - - | d3+g3+bb3 - - - - - - - | eb3\'+g3+bb3 - - - - - - - | a2+e3+c#4\' - - - - - - - |'+
          '| bb2+f3+d4 - - - - - - - | g2+d3+bb3 - - - - - - - | eb3\'+g3+bb3 - - - - - - - | a2+e3+a3+c#4\' - - - - - - - |',
      bas:'| d2 d2 f2 d2 d2 eb2\' d2 c2 | d2 d2 f2 d2 d2 eb2\' d2 c2 | eb2\' eb2\' g2 eb2\' eb2\' f2 eb2\' d2 | a1 a1 c#2\' a1 a1 bb1 a1 g1 |'+
          '| bb1 bb1 d2 bb1 bb1 c2 bb1 a1 | g1 g1 bb1 g1 g1 a1 g1 f1 | eb2\' eb2\' g2 eb2\' eb2\' f2 eb2\' d2 | a1 a1 c#2\' a1 a1 bb1 a1 e2 |',
      tim:'| d2! . . d2 . . d2 . | d2! . . d2 . . d2 . | eb2\'! . . eb2\' . . eb2\' . | a2! . . . a2~ - - - |'+
          '| bb2! . . bb2 . . bb2 . | g2! . . g2 . . g2 . | eb2\'! . . eb2\' . . eb2\' . | a2~ - - - - - - - |',
      kit:'| X+D k S k D k S k | D k S k D k S k | D k S k D k S k | D k S k D S S S |'+
          '| X+D k S k D k S k | D k S k D k S k | D k S k D k S k | D C S k S S S S |' },
    C:{b:8, v:{hrn:1.1, fid:0.9, cho:0.68, str:0.72, kit:0.88},
      hrn:'| f4 - c4 f4 - g4 a4 - | c5 - - - . . . . | bb4 - f4 bb4 - c5 d5 - | e5 - - - . . . . |'+
          '| f4 - c4 f4 - g4 a4 - | c5 - - - d5 - e5 - | f5 - - - d5 - bb4 - | a4 - - - - - - . |',
      tpt:'| f5 - c5 f5 - g5 a5 - | c6 - - - . . . . | bb5 - f5 bb5 - c6 d6 - | c6 - - - . . . . |'+
          '| f5 - c5 f5 - g5 a5 - | c6 - - - d6 - - - | f5 - - - d5 - bb4 - | a4 - - - - - - . |',
      fid:'| c6 - - - - - - - - - - - a5 - - - | g5 - - - - - - - c6 bb5 a5 g5 a5 bb5 c6 d6 |'+
          '| d6 - - - - - - - - - - - bb5 - - - | g5 - - - - - - - e6 d6 c6 bb5 a5 g5 a5 bb5 |'+
          '| c6 - - - - - - - - - - - f6 - - - | e6 - - - - - - - g6 f6 e6 d6 e6 f6 g6 a6 |'+
          '| bb6 - - - - - - - g6 - - - d6 - - - | c#6\' - - - - - - - e6 - - - a6 - - - |',
      cho:'| f4+a4+c5 - - - - - - - | e4+g4+c5 - - - - - - - | d4+f4+bb4 - - - - - - - | e4+g4+c5 - - - - - - - |'+
          '| f4+a4+c5 - - - - - - - | e4+g4+c5 - - - - - - - | d4+f4+bb4 - - - - - - - | c#4\'+e4+a4 - - - - - - - |',
      str:'| f3+c4 - - - - - - - | e3+c4 - - - - - - - | d3+bb3 - - - - - - - | c3+g3 - - - - - - - |'+
          '| f3+c4 - - - - - - - | e3+c4 - - - - - - - | d3+bb3 - - - - - - - | a2+e3 - - - - - - - |',
      bas:'| f2 f2 a2 f2 f2 g2 f2 e2 | e2 e2 g2 e2 e2 f2 e2 d2 | d2 d2 f2 d2 d2 eb2\' d2 c2 | c2 c2 e2 c2 c2 d2 c2 e2 |'+
          '| f2 f2 a2 f2 f2 g2 f2 e2 | e2 e2 g2 e2 e2 f2 e2 d2 | d2 d2 f2 d2 g1 g1 bb1 g1 | a1 a1 c#2\' a1 a1 bb1 a1 c#2\' |',
      tim:'| f2! . . . c3 . . . | e2! . . . g2 . . . | d2! . . . f2 . . . | c3! . . . g2~ - - - |'+
          '| f2! . . . c3 . . . | e2! . . . g2 . . . | d2! . . . g2 . . . | a2~ - - - - - - - |',
      kit:'| X+D . S . D . S S | D . S . D . S S | D . S . D . S S | D . S . D S S S |'+
          '| X+D . S . D . S S | D . S . D . S S | D . S . D S S S | D . S S S S S S |' },
    D:{b:4, v:{cho:0.5, str:0.72, kit:0.88},
      hrn:'| _ | _ | g3 - - - - - - - | a3 - - - - - - . |',
      tpt:'| _ | _ | g4 - - g4 g4 - bb4 - | a4 - - a4 a4 - c#5\' e5 |',
      fid:'| _ | _ | . . . . . . . . eb5\' f5 g5 a5 bb5 c6 d6 eb6\' | a5 bb5 c#6\' d6 e6 f6 g6 a6 - - - - - - - . |',
      cho:'| d4+f4+a4 - - - - - - - | d4+f4+bb4 - - - - - - - | eb4\'+bb4 - - - - - - - | c#4\'+e4+a4 - - - - - - - |',
      str:'| _ | _ | eb3\'+bb3 - - - - - - - | a2+e3 - - - - - - - |',
      bas:'| d2 d2 f2 d2 d2 eb2\' d2 c2 | d2 d2 f2 d2 d2 eb2\' d2 c2 | eb2\' eb2\' g2 eb2\' eb2\' f2 eb2\' d2 | a1 a1 c#2\' a1 a1 bb1 a1 c#2\' |',
      tim:'| d2! . . . . . . . | d2 . . . . . . . | eb2\'! . . eb2\' . . eb2\' . | a2~ - - - - - - - |',
      kit:'| D . . . . . . . | D . . . . . . . | D . . . D . S S | D+C . S . S S S S |' } },
  form:['I','A','B','A2','C','D'], loop:1, loops:0 };

/* FLAG RAISED (victory — a claim, a boss's fall). C major, 4/4 at 120 (the fanfare at 125). F A B A2 B2 → loop to A (≈ 48 s; the state lasts 40 s, so
   a victory never hears its tune twice). F is also the off-isle `fanfare` sting (ledger rank-ups, the museum, the renown).
   F  — the fanfare, the claim's own notes and rhythm orchestrated (G G G C · A B C at 0 · .12 · .24 · .36 · .96 · 1.08 · 1.32 s): trumpets with the horns
        an octave under, the timpani rolling the G into the C chord, the crash, the strings and a pizzicato C swelling under the held chord.
   A  — the bright loop: the BOATS motif in C on the flute (C G C D E | G), answered (A … C B A | F A D C | B, up G A B), over a bouncing marimba,
        pizzicato on 1 and 3, a tambourine on 2 and 4 (C Am F G | C Am Dm7 G7).
   B  — the cadence: an arch up the F and G chords to the top E and down to the leading note B (F G Em7–Am Dm7–G7).
   A2 — the tune again on the horn, an octave down, the flute's descant in long notes above it, the marimba's 3-3-2, a crash on its downbeat.
   B2 — the cadence with the flute and the horn in harmony, a new turn into the loop. */
MUS_T.victory={
  n:'Flag Raised', bpm:120, m:'4/4', key:'C ion', sw:0, hum:3, g:1.12,
  fx:{rv:0.26, ec:'1/8', fb:0.15, ew:0.08},
  ch:{
    tpt:{i:'trumpet', v:0.8,  p:-0.15, s:16, L:'base'},
    hrn:{i:'horn',    v:0.7,  p:-0.3,  s:8,  L:'base'},
    flt:{i:'flute',   v:0.8,  p:0.1,   s:8,  L:'base', mono:1},
    mar:{i:'marimba', v:0.5,  p:0.3,   s:8,  L:'base'},
    str:{i:'strings', v:0.5,  p:-0.05, s:1,  L:'base'},
    bas:{i:'pizz',    v:0.6,  p:0,     s:4,  L:'base'},
    tim:{i:'timp',    v:0.6,  p:-0.2,  s:16, L:'base'},
    kit:{i:'kit',     v:0.5,  p:0.2,   s:8,  L:'base'} },
  lv:[['base']],
  sec:{
    F:{b:2, bpm:125, s:{hrn:16, str:16, bas:16, kit:16}, v:{tpt:1.2, hrn:1.2, str:1.2, tim:1.1, kit:1.1, bas:1.2},
      tpt:'| g4 g4 g4 c5 - - - - a4 b4 - c5+e5+g5 - - - - | - - - - - - - - . . . . . . . . |',
      hrn:'| g3 g3 g3 c4 - - - - a3 b3 - c4+e4 - - - - | - - - - - - - - . . . . . . . . |',
      str:'| . . . . . . . . . . . c4+e4+g4+c5 - - - - | - - - - - - - - - - - - - - - . |',
      bas:'| . . . . . . . . . . . c2 - - - - | _ |',
      tim:'| g2~? - - - - - - - - - - c3! - - - - | _ |',
      kit:'| . . . . . . . . . . . X! . . . . | _ |' },
    A:{b:8, v:{str:0.6, mar:0.72, kit:0.75},
      flt:'| c5 - g4 c5 - d5 e5 - | g5 - - - . . e5 g5 | a5 - - c6 - a5 g5 f5 | g5 - - - - - . . |'+
          '| c5 - g4 c5 - d5 e5 - | a5 - - - c6 - b5 a5 | f5 - a5 - d6 - c6 - | b5 - - - . g5 a5 b5 |',
      mar:'| c4 g4 e4 g4 c4 g4 e4 g4 | a3 e4 c4 e4 a3 e4 c4 e4 | f3 c4 a3 c4 f3 c4 a3 c4 | g3 d4 b3 d4 g3 d4 b3 d4 |'+
          '| c4 g4 e4 g4 c4 g4 e4 g4 | a3 e4 c4 e4 a3 e4 c4 e4 | d4 a4 f4 a4 d4 a4 c5 a4 | g3 d4 b3 f4 g3 d4 b3 f4 |',
      str:'| c4+e4+g4 | c4+e4+a4 | c4+f4+a4 | b3+d4+g4 | c4+e4+g4 | c4+e4+a4 | d4+f4+a4+c5 | b3+d4+g4 |',
      bas:'| c3 . g2 . | a2 . e2 . | f2 . a2 . | g2 . d3 . | c3 . g2 . | a2 . e2 . | d3 . a2 . | g2 . b2 . |',
      kit:'| . . T . . . T t | . . T . . . T t | . . T . . . T t | . . T . . . T t |'+
          '| . . T . . . T t | . . T . . . T t | . . T . . . T t | . . T . . T T t |' },
    B:{b:4, s:{str:2}, v:{str:0.6, mar:0.72, kit:0.75},
      flt:'| c6 - - a5 f5 - a5 c6 | d6 - - b5 g5 - b5 d6 | e6 - - d6 c6 - - b5 | a5 - - g5 d5 - - b4 |',
      mar:'| f3 c4 a3 c4 f3 c4 a3 c4 | g3 d4 b3 d4 g3 d4 b3 d4 | e4 b4 g4 b4 a3 e4 c4 e4 | d4 a4 f4 a4 g3 d4 b3 f4 |',
      str:'| c4+f4+a4 - | b3+d4+g4 - | b3+e4+g4 c4+e4+a4 | d4+f4+a4+c5 b3+d4+g4 |',
      bas:'| f2 . c3 . | g2 . d3 . | e2 . a2 . | d3 . b2 . |',
      kit:'| . . T . . . T t | . . T . . . T t | . . T . . . T t | . . T . T t T t |' },
    A2:{b:8, v:{flt:0.62, hrn:1.25, str:0.6, mar:0.72, kit:0.75},
      hrn:'| c4 - g3 c4 - d4 e4 - | g4 - - - . . e4 g4 | a4 - - c5 - a4 g4 f4 | g4 - - - - - . . |'+
          '| c4 - g3 c4 - d4 e4 - | a4 - - - c5 - b4 a4 | f4 - a4 - d5 - c5 - | b4 - - - . g4 a4 b4 |',
      flt:'| e5 - - - - - g5 - | c6 - - - - - - - | c6 - - - - - - - | b5 - - - d6 - - - |'+
          '| e6 - - - - - d6 c6 | c6 - - - e6 - - - | a5 - - - f5 - - - | d6 - - - - - - - |',
      mar:'| c4 g4 e4 c4 g4 e4 c5 g4 | a3 e4 c4 a3 e4 c4 a4 e4 | f3 c4 a3 f3 c4 a3 f4 c4 | g3 d4 b3 g3 d4 b3 g4 d4 |'+
          '| c4 g4 e4 c4 g4 e4 c5 g4 | a3 e4 c4 a3 e4 c4 a4 e4 | d4 a4 f4 d4 a4 f4 c5 a4 | g3 d4 b3 g3 d4 b3 f4 d4 |',
      str:'| c4+e4+g4 | c4+e4+a4 | c4+f4+a4 | b3+d4+g4 | c4+e4+g4 | c4+e4+a4 | d4+f4+a4+c5 | b3+d4+g4 |',
      bas:'| c3 . g2 . | a2 . e2 . | f2 . a2 . | g2 . d3 . | c3 . g2 . | a2 . e2 . | d3 . a2 . | g2 . b2 . |',
      kit:'| X . T . . . T t | . . T . . . T t | . . T . . . T t | . . T . . . T t |'+
          '| . . T . . . T t | . . T . . . T t | . . T . . . T t | . . T . . T T t |' },
    B2:{b:4, s:{str:2}, v:{hrn:0.9, str:0.6, mar:0.72, kit:0.75},
      flt:'| c6 - - a5 f5 - a5 c6 | d6 - - b5 g5 - b5 d6 | e6 - - g6 e6 - c6 - | d6 - - c6 b5 - g5 - |',
      hrn:'| a4 - - - c5 - - - | b4 - - - d5 - - - | g4 - - - a4 - - - | f4 - - - g4 - - - |',
      mar:'| f3 c4 a3 c4 f3 c4 a3 c4 | g3 d4 b3 d4 g3 d4 b3 d4 | e4 b4 g4 b4 a3 e4 c4 e4 | d4 a4 f4 a4 g3 d4 b3 f4 |',
      str:'| c4+f4+a4 - | b3+d4+g4 - | b3+e4+g4 c4+e4+a4 | d4+f4+a4+c5 b3+d4+g4 |',
      bas:'| f2 . c3 . | g2 . d3 . | e2 . a2 . | d3 . g2 . |',
      kit:'| . . T . . . T t | . . T . . . T t | . . T . . . T t | . . T . T t T t |' } },
  form:['F','A','B','A2','B2'], loop:1, loops:0 };

/* CARRIED HOME (ko — the sting when you fall). B minor, 3/4 at 60 — 4 bars (12 s), once. The harp's arpeggio falls (b f♯ d …) under the flute's
   minor motif, slow (B F♯ B C♯ | D … F♯), the strings Bm · D · F♯sus4–F♯ · Bm, the timpani's soft roll on the dominant settling home, a last
   high celesta B. Not a dirge — a hand on the shoulder. */
MUS_T.ko={
  n:'Carried Home', bpm:60, m:'3/4', key:'B aeo', sw:0, hum:5, g:1.42,
  fx:{rv:0.4, ec:'1/4', fb:0.25, ew:0.12},
  ch:{
    flt:{i:'flute',   v:0.75, p:-0.1,  s:6, L:'base', mono:1},
    har:{i:'harp',    v:0.55, p:0.25,  s:6, L:'base'},
    str:{i:'strings', v:0.5,  p:0,     s:3, L:'base'},
    tim:{i:'timp',    v:0.5,  p:-0.2,  s:6, L:'base'},
    cel:{i:'celesta', v:0.7,  p:0.3,   s:6, L:'base'} },
  lv:[['base']],
  sec:{
    S:{b:4, v:{str:0.6, har:0.9},
      flt:'| b4 - f#4 b4 - c#5 | d5 - - f#5 - - | e5 - d5 c#5 - a#4\' | b4 - - - - . |',
      har:'| b4 f#4 d4 b3 f#3 d3 | a4 f#4 d4 a3 f#3 d3 | c#5 f#4 c#4 a#3\' f#3 c#3 | b2+f#3+d4+b4> - - - - - |',
      str:'| b3+d4+f#4 - - | a3+d4+f#4 - - | b3+c#4+f#4 a#3\'+c#4+f#4 - | b3+d4+f#4 - - |',
      tim:'| _ | _ | f#2~? - - - - - | b2? . . . . . |',
      cel:'| _ | _ | _ | . . . . b6 . |' } },
  form:['S'], loop:-1 };

/* A FIRST! (discover — a first sighting, a first meeting, the deepest floor yet). D major, 6/8 at 90 — 2 bars (2.7 s), once. The glock and the harp
   (an octave under) run up the BOATS motif fast (D A D E F♯ A | D), the strings land on D add9, the celesta sparkles F♯ A D. */
MUS_T.discover={
  n:'A First!', bpm:90, m:'6/8', key:'D ion', sw:0, hum:0, g:1.57,
  fx:{rv:0.34, ec:'3/16', fb:0.25, ew:0.12},
  ch:{
    glk:{i:'glock',   v:0.7,  p:0.25,  s:6, L:'base'},
    har:{i:'harp',    v:0.6,  p:-0.2,  s:6, L:'base'},
    str:{i:'strings', v:0.5,  p:0,     s:1, L:'base'},
    cel:{i:'celesta', v:0.7,  p:0.35,  s:6, L:'base'} },
  lv:[['base']],
  sec:{
    S:{b:2, v:{glk:1.5, har:0.75, str:0.8},
      glk:'| d6 a5 d6 e6 f#6 a6 | d7 - - - - - |',
      har:'| d5 a4 d5 e5 f#5 a5 | d3+a3+f#4+d6> - - - - - |',
      str:'| _ | d4+f#4+a4+e5 |',
      cel:'| _ | f#6 . a6 . d7 . |' } },
  form:['S'], loop:-1 };

/* A NEW DAY (dawn — waking in the bunk, batch 4's sleep till dawn). D major, 6/8 at 72 — 2 bars and a tail (5 s), once. The celesta sings the motif's
   head (D A D E | F♯ A) and comes home to the high D; the harp rolls D, then A over D (the day's light), then D; the strings swell under it. A cabin,
   not a fanfare. */
MUS_T.dawn={
  n:'A New Day', bpm:72, m:'6/8', key:'D ion', sw:0, hum:4, g:1.86,
  fx:{rv:0.36, ec:'3/16', fb:0.25, ew:0.12},
  ch:{
    cel:{i:'celesta', v:0.75, p:0.2,   s:6, L:'base'},
    har:{i:'harp',    v:0.55, p:-0.2,  s:6, L:'base'},
    str:{i:'strings', v:0.5,  p:0,     s:1, L:'base'} },
  lv:[['base']],
  sec:{
    S:{b:3, v:{cel:1.6, str:0.45, har:0.8},
      cel:'| d5 - a4 d5 - e5 | f#5 - - a5 - - | d6 - - - - - |',
      har:'| d3+a3+d4+f#4> - - - - - | d3+a3+c#4+e4> - - - - - | d3+a3+f#4+d5> - - - - - |',
      str:'| d4+f#4+a4 | c#4+e4+a4 | d4+f#4+a4 |' } },
  form:['S'], loop:-1 };

/* ALL HANDS (shanty — "Sing us a shanty", batch 4's crew order). D Mixolydian, 6/8 at 112 — 8 bars and a button (9.6 s), once. The town_big call &
   response, condensed: the concertina calls the motif alone (D A D E | F♯ A), the crew answers on the whistle & the fiddle (A G F♯ E D | C … D) with
   stomps on 1 and claps on 4 and the guitar's strum; the call again, reaching to B over G, and a higher answer home (B A G F♯ E | D: G A D); the
   button — every hand on D and the ship's bell. */
MUS_T.shanty={
  n:'All Hands', bpm:112, m:'6/8', key:'D mix', sw:0, hum:4, g:1.77,
  fx:{rv:0.2, ec:'3/16', fb:0.12, ew:0.06},
  ch:{
    con:{i:'concertina', v:0.75, p:-0.25, s:6, L:'base'},
    wst:{i:'whistle',    v:0.6,  p:0.25,  s:6, L:'base', mono:1},
    fid:{i:'fiddle',     v:0.7,  p:0.15,  s:6, L:'base', mono:1},
    gtr:{i:'guitar',     v:0.5,  p:0.35,  s:6, L:'base'},
    bas:{i:'ubass',      v:0.6,  p:0,     s:2, L:'base'},
    kit:{i:'kit',        v:0.55, p:0.1,   s:6, L:'base'} },
  lv:[['base']],
  sec:{
    S:{b:9, v:{gtr:0.6},
      con:'| d5 - a4 d5 - e5 | f#5 - - a5 - - | @v0.5 . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* | . c4+e4+g4* c4+e4+g4* . d4+f#4+a4* d4+f#4+a4* |'+
          '| @v1 d5 - a4 d5 - e5 | f#5 - - b5 - - | @v0.5 . d4+g4+b4* d4+g4+b4* . c#4\'+e4+a4* c#4\'+e4+a4* | . d4+f#4+a4* d4+f#4+a4* . d4+f#4+a4* d4+f#4+a4* | @v1 d4+f#4+a4+d5! . . . . . |',
      wst:'| _ | _ | a6 g6 f#6 e6 - d6 | c6 - - d6 - - | _ | _ | b6 a6 g6 f#6 - e6 | d6 - - - - . | d6 . . . . . |',
      fid:'| _ | _ | a5 g5 f#5 e5 - d5 | c5 - - d5 - - | _ | _ | b5 a5 g5 f#5 - e5 | d5 - - - - . | a5 . . . . . |',
      gtr:'| _ | _ | d3+a3+d4+f#4> . . d3+a3+d4+f#4> . . | c3+g3+c4+e4> . . d3+a3+d4+f#4> . . |'+
          '| _ | _ | g2+d3+g3+b3> . . a2+e3+a3+c#4\'> . . | d3+a3+d4+f#4> . . d3+a3+d4+f#4> . . | d3+a3+d4+f#4> . . . . . |',
      bas:'| d2 a2 | d2 a2 | d2 a2 | e2 d2 | d2 a2 | d2 g2 | g2 a2 | d2 a2 | d2 . |',
      kit:'| _ | _ | Q . . P . . | Q . . P . . | _ | _ | Q . . P . . | Q . . P . P | Q+B . . . . . |' } },
  form:['S'], loop:-1 };

/* THE SEA-HARP (harp — the sea-harp decor's "play", batch 4). D Lydian, 3/4 at 66 — 2 bars (5.5 s), once. The harp alone runs the motif up as an
   arpeggio (D A D E F♯ A) and down by the Lydian answer (G♯ F♯ E D A D), then rolls D with its 9th and raised 4th and lets it ring; one glock A at the end. */
MUS_T.harp={
  n:'The Sea-Harp', bpm:66, m:'3/4', key:'D lyd', sw:0, hum:6, g:2.4,
  fx:{rv:0.42, ec:'3/16', fb:0.28, ew:0.14},
  ch:{
    har:{i:'harp',  v:0.65, p:0,    s:12, L:'base'},
    glk:{i:'glock', v:0.6,  p:0.3,  s:12, L:'base'} },
  lv:[['base']],
  sec:{
    S:{b:2,
      har:'| d4 a4 d5 e5 f#5 a5 g#5 f#5 e5 d5 a4 d4 | d3+a3+e4+g#4> - - - - - - - - - - . |',
      glk:'| _ | . . . . . . a6 . . . . . |' } },
  form:['S'], loop:-1 };

/* HOME ABOARD (deck — walking your own deck, batch 4's MUS_DECK). D major, 6/8 at 60, a lullaby. A B C A2 → loop to A (64 s), 2 loops, then the coda
   and a long rest (60–120 s: a cabin should be mostly quiet — the Stardew farmhouse).
   A  — the concertina's own rocking tune, climbing the motif's tail (A … D E | F♯ … E D), down to the G chord and up again, the reach to B over Bm,
        home (D D G A | Bm G D/A–A7 D); the guitar fingerpicks, the pizzicato rocks on 1 and 4, a harp roll at each phrase, the ship's bell at the start.
   B  — the harp sings a new tune, music-box soft, over the relative minor (Em A F♯m Bm | G D/F♯ Em7 A7): up the Em chord, the A, the F♯ minor to the
        high A, home to Bm, again by G and D/F♯; the concertina holds soft chords, the flute answers in the Bm and A7 bars.
   C  — the motif in G, slow, on the concertina (G D G A | B … D) with the flute a third above in the second phrase; the guitar strums, the harp's
        arpeggios (G G Em A | G Bm Em7 A7).
   A2 — the tune again on the flute, the concertina's harmony a third and a sixth under its long notes, the harp rolling, the guitar fingerpicking.
   E  — the coda (after A2 on the last loop): D held — the flute's D, the concertina's chord, a harp roll, the bell twice. */
MUS_T.deck={
  n:'Home Aboard', bpm:60, m:'6/8', key:'D ion', sw:0, hum:6, g:1.38,
  fx:{rv:0.32, ec:'3/16', fb:0.22, ew:0.1},
  ch:{
    con:{i:'concertina', v:0.7,  p:-0.2,  s:6, L:'base'},
    flt:{i:'flute',      v:0.7,  p:0.15,  s:6, L:'base', mono:1},
    gtr:{i:'guitar',     v:0.5,  p:0.3,   s:6, L:'base'},
    bas:{i:'pizz',       v:0.55, p:0,     s:2, L:'base'},
    har:{i:'harp',       v:0.55, p:0.35,  s:6, L:'base'},
    kit:{i:'kit',        v:0.5,  p:0.2,   s:6, L:'base'} },
  lv:[['base']],
  sec:{
    A:{b:8, v:{gtr:0.85},
      con:'| a4 - - d5 - e5 | f#5 - - - e5 d5 | b4 - - d5 - g5 | e5 - - c#5 - - |'+
          '| d5 - - f#5 - b5 | a5 - - g5 - e5 | f#5 - - e5 - - | d5 - - - - . |',
      gtr:'| d3 a3 f#4 a3 d4 a3 | d3 a3 f#4 a3 d4 a3 | g2 d3 b3 d3 g3 d3 | a2 e3 c#4 e3 a3 e3 |'+
          '| b2 f#3 d4 f#3 b3 f#3 | g2 d3 b3 d3 g3 d3 | a2 a3 f#4 a3 a2 g3 | d3 a3 f#4 a3 d4 . |',
      bas:'| d2 a2 | d2 a2 | g2 d2 | a2 e2 | b2 f#2 | g2 d2 | a2 a2 | d2 - |',
      har:'| d3+a3+f#4+d5> - - - - - | _ | _ | _ | b2+f#3+d4+b4> - - - - - | _ | _ | _ |',
      kit:'| B . . . . . | _ | _ | _ | _ | _ | _ | _ |' },
    B:{b:8, v:{har:1.5, con:0.35},
      har:'| g5 - - e5 - b4 | c#5 - - e5 - a5 | a5 - - f#5 - c#5 | d5 - - - - - |'+
          '| b4 - - d5 - g5 | f#5 - - a5 - d6 | g5 - - e5 - d5 | e5 - - c#5 - - |',
      con:'| e4+g4+b4 - - - - - | e4+a4+c#5 - - - - - | f#4+a4+c#5 - - - - - | d4+f#4+b4 - - - - - |'+
          '| d4+g4+b4 - - - - - | d4+f#4+a4 - - - - - | e4+g4+b4 - - - - - | e4+g4+a4 - - - - - |',
      flt:'| _ | _ | _ | . . . f#5 e5 d5 | _ | _ | _ | . . . a4 - - |',
      bas:'| e2 b2 | a2 e2 | f#2 c#3 | b2 f#2 | g2 d2 | f#2 a2 | e2 b2 | a2 e2 |',
      kit:'| _ | _ | _ | _ | _ | _ | _ | _ |' },
    C:{b:8, v:{flt:0.8, har:0.6, gtr:0.75},
      con:'| g4 - d4 g4 - a4 | b4 - - d5 - - | e5 - - d5 - b4 | c#5 - - - - - |'+
          '| g4 - d4 g4 - a4 | b4 - - d5 - f#5 | g5 - - e5 - - | c#5 - - - - - |',
      flt:'| _ | _ | _ | _ | d5 - - - - - | f#5 - - - a5 - | b5 - - g5 - - | e5 - - - - - |',
      gtr:'| g2+d3+g3+b3> - - - - - | g2+d3+g3+b3> - - g2+d3+g3+b3< - - | e2+b2+e3+g3> - - - - - | a2+e3+a3+c#4> - - a2+e3+g3+c#4< - - |'+
          '| g2+d3+g3+b3> - - - - - | b2+f#3+b3+d4> - - b2+f#3+b3+d4< - - | e2+b2+d3+g3> - - - - - | a2+e3+g3+c#4> - - a2+e3+g3+c#4< - - |',
      har:'| g3 d4 b4 d4 g4 d4 | g3 d4 b4 d4 g4 d4 | e3 b3 g4 b3 e4 b3 | a3 e4 c#5 e4 a4 e4 |'+
          '| g3 d4 b4 d4 g4 d4 | b3 f#4 d5 f#4 b4 f#4 | e3 b3 g4 b3 d4 b3 | a3 e4 g4 e4 c#5 e4 |',
      bas:'| g2 d2 | g2 d2 | e2 b2 | a2 e2 | g2 d2 | b2 f#2 | e2 b2 | a2 e2 |' },
    A2:{b:8, v:{con:0.75, gtr:0.75, flt:1.1},
      flt:'| a4 - - d5 - e5 | f#5 - - - e5 d5 | b4 - - d5 - g5 | e5 - - c#5 - a4 |'+
          '| d5 - - f#5 - b5 | a5 - - g5 - e5 | f#5 - - e5 - c#5 | d5 - - - - . |',
      con:'| f#4 - - - - - | d5 - - - - - | g4 - - - - - | c#5 - - - - - |'+
          '| b4 - - - - - | d5 - - - - - | d5 - - a4 - - | f#4 - - - - - |',
      gtr:'| d3 a3 f#4 a3 d4 a3 | d3 a3 f#4 a3 d4 a3 | g2 d3 b3 d3 g3 d3 | a2 e3 c#4 e3 a3 e3 |'+
          '| b2 f#3 d4 f#3 b3 f#3 | g2 d3 b3 d3 g3 d3 | a2 a3 f#4 a3 a2 g3 | d3 a3 f#4 a3 d4 . |',
      bas:'| d2 a2 | d2 a2 | g2 d2 | a2 e2 | b2 f#2 | g2 d2 | a2 a2 | d2 - |',
      har:'| d3+a3+f#4+d5> - - - - - | _ | g2+d3+b3+g4> - - - - - | _ | b2+f#3+d4+b4> - - - - - | _ | . . . a2+e3+g3+c#4> - - | _ |' },
    E:{b:2, v:{con:0.5},
      flt:'| d5 - - - - - | - - - - - . |',
      con:'| d4+f#4+a4 - - - - - | - - - . . . |',
      gtr:'| d3+a3+d4+f#4> - - - - - | _ |',
      bas:'| d2 - | - . |',
      har:'| d3+a3+f#4+d5> - - - - - | _ |',
      kit:'| B . . . . . | B? . . . . . |' } },
  form:['A','B','C','A2'], loop:0, loops:2, end:'A2', coda:'E' };
/* THE OLD MAN’S CHART (story — the Introstory's scenes: your grandfather's tune · INTROSTORY C12, is_design §2.9 · engine §3.2.9). B Aeolian (the
   BOATS key's relative minor, Carried Home's key), 6/8 at 60 — A B C A2 → loop to A (64 s), forever while a scene lasts. Layers: base (the harp, the
   strings, the upright) · mid (the tune — celesta, flute) · top (the horn, the choir, the timpani). A letter plays lv 1; his leaves, Isaura, the wreck lv 2.
   A  — the music box: the celesta sings the BOATS motif turned minor and re-timed (B … F♯ B | C♯ D F♯ … — the hoist, remembered), up the Em chord, a
        half close on A; again, reaching past D and E to the high B and the leading tone home (Bm F♯m Em A | Bm D G–F♯ Bm). The harp rocks in 8ths,
        the strings hold, the upright walks roots & fifths; at lv 2 the horn and the choir breathe in under the second phrase, a soft timpani.
   B  — the flute answers, far off, in the relative major's light (G D Em Bm | G A F♯ Bm): up the G chord, the motif's tail (F♯ … A), down the Em
        arpeggio, climbing G B, A C♯ to the high F♯ over F♯ major and home; the celesta drops a few bright notes; the horn & choir join its second half.
   C  — the showpiece: the motif in D, whole, on the flute (D A D E | F♯ … A) with the horn two octaves under it, the choir swelling, the timpani on
        each phrase — up to the high B over G, a half close on A; then the heroic ♭VI–♭VII–i (G A Bm) climbing to C♯ and the held high B, and F♯ major
        turning the key: its C♯ becomes the new home.
   A2 — the lift: A's tune a whole step up (C♯ minor) on the flute, the celesta an octave over it, the horn's long counter-line, the choir, the harp
        higher — the full statement; then the loop drops back to the music box. */
MUS_T.story={
  n:'The Old Man’s Chart', bpm:60, m:'6/8', key:'B aeo', sw:0, hum:5, g:0.86,
  fx:{rv:0.4, ec:'3/16', fb:0.28, ew:0.14},
  ch:{
    mel:{i:'flute',   v:0.78, p:-0.12, s:6, L:'mid', mono:1},
    cel:{i:'celesta', v:0.62, p:0.28,  s:6, L:'mid'},
    hrn:{i:'horn',    v:0.48, p:0.18,  s:6, L:'top', mono:1},
    har:{i:'harp',    v:0.55, p:-0.25, s:6, L:'base'},
    str:{i:'strings', v:0.34, p:0,     s:2, L:'base'},
    bas:{i:'ubass',   v:0.62, p:0,     s:2, L:'base'},
    cho:{i:'choir',   v:0.3,  p:0.05,  s:2, L:'top'},
    tim:{i:'timp',    v:0.38, p:-0.1,  s:6, L:'top'} },
  lv:[['base'],['base','mid'],['base','mid','top']],
  sec:{
    A:{b:8, v:{cel:1.76, har:0.71},   // (IS6 FIX: the music box's tune 2.4 dB over its harp — it sat 3.6 dB under; the loop's level unchanged)
      cel:'| b5 - - f#5 - b5 | c#6 - d6 f#6 - - | g6 - - e6 - d6 | c#6 - - - - - |'+
          '| b5 - - f#5 - b5 | d6 - e6 f#6 - a6 | b6 - - a#6\' - f#6 | b5 - - - - . |',
      har:'| b2 f#3 b3 d4 b3 f#3 | f#2 c#3 f#3 a3 f#3 c#3 | e2 b2 e3 g3 e3 b2 | a2 e3 a3 c#4 e4 a4 |'+
          '| b2 f#3 b3 d4 b3 f#3 | d3 a3 d4 f#4 d4 a3 | g2 d3 b3 f#2 c#3 a#3\' | b2 f#3 b3 d4 f#4 . |',
      str:'| b3+d4+f#4 - | a3+c#4+f#4 - | g3+b3+e4 - | a3+c#4+e4 - | b3+d4+f#4 - | a3+d4+f#4 - | b3+d4+g4 a#3\'+c#4+f#4 | b3+d4+f#4 - |',
      bas:'| b1 f#2 | f#1 c#2 | e2 b1 | a1 e2 | b1 f#2 | d2 a1 | g1 f#1 | b1 - |',
      hrn:'| _ | _ | _ | _ | d4 - - - - - | f#4 - - - - - | b3 - - c#4 - - | d4 - - - - . |',
      cho:'| _ | _ | _ | _ | b3+d4+f#4 - | a3+d4+f#4 - | b3+d4+g4 f#3+a#3\'+c#4 | d4+f#4+b4 - |',
      tim:'| _ | _ | _ | _ | b2? . . . . . | _ | _ | b2? . . f#2? . . |' },
    B:{b:8, v:{mel:0.85, cel:0.8},
      mel:'| d5 - - b4 - d5 | f#5 - - a5 - - | g5 - - e5 - b4 | d5 - - f#5 - - |'+
          '| g5 - - b5 - g5 | a5 - - c#6 - e6 | f#6 - - c#6 - a#5\' | b5 - - - - . |',
      cel:'| _ | . . . . f#6 . | _ | . . . . d6 . | _ | . . . . e6 . | _ | . . . b6 . . |',
      har:'| g2 d3 g3 b3 g3 d3 | d3 a3 d4 f#4 d4 a3 | e2 b2 e3 g3 e3 b2 | b2 f#3 b3 d4 b3 f#3 |'+
          '| g2 d3 g3 b3 d4 g4 | a2 e3 a3 c#4 e4 a4 | f#2 c#3 f#3 a#3\' c#4 f#4 | b2 f#3 b3 d4 f#4 . |',
      str:'| b3+d4+g4 - | a3+d4+f#4 - | b3+e4+g4 - | b3+d4+f#4 - | b3+d4+g4 - | a3+c#4+e4 - | a#3\'+c#4+f#4 - | b3+d4+f#4 - |',
      bas:'| g1 d2 | d2 a1 | e2 b1 | b1 d2 | g1 d2 | a1 e2 | f#1 a#1\' | b1 - |',
      hrn:'| _ | _ | _ | _ | b3 - - d4 - - | c#4 - - e4 - - | c#4 - - - - - | d4 - - - - . |',
      cho:'| _ | _ | _ | _ | b3+d4+g4 - | c#4+e4+a4 - | c#4+f#4+a#4\' - | b3+d4+f#4 - |',
      tim:'| _ | _ | _ | _ | g2? . . . . . | a2? . . . . . | f#2~ - - - - - | b2 . . . . . |' },
    C:{b:8, v:{har:1.1, str:1.15},
      mel:'| d6 - a5 d6 - e6 | f#6 - - a6 - - | b6 - a6 g6 - f#6 | e6 - - - - - |'+
          '| g6 - - b6 - - | a6 - - c#7 - - | b6 - - - - - | f#6 - e6 c#6 - a#5\' |',
      cel:'| _ | . . . . a6 . | _ | . . . . e6 . | _ | . . . . c#7 . | . . . f#6 . d6 | _ |',
      hrn:'| d4 - a3 d4 - e4 | f#4 - - a4 - - | b4 - a4 g4 - f#4 | e4 - - - - - |'+
          '| d4 - - g4 - - | e4 - - a4 - - | f#4 - - d4 - - | c#4 - - a#3\' - - |',
      har:'| d3 a3 d4 e4 f#4 a4 | d3 a3 d4 f#4 a4 d5 | g2 d3 g3 b3 d4 g4 | a2 e3 a3 c#4 e4 a4 |'+
          '| g2 d3 g3 b3 d4 g4 | a2 e3 a3 c#4 e4 a4 | b2 f#3 b3 d4 f#4 b4 | f#2 c#3 f#3 a#3\' c#4 f#4 |',
      str:'| d4+f#4+a4 - | d4+f#4+a4 - | d4+g4+b4 - | c#4+e4+a4 - | d4+g4+b4 - | c#4+e4+a4 - | d4+f#4+b4 - | c#4+f#4+a#4\' - |',
      bas:'| d2 a1 | d2 a2 | g1 d2 | a1 e2 | g1 d2 | a1 e2 | b1 f#2 | f#1 c#2 |',
      cho:'| d4+f#4+a4 - | = | d4+g4+b4 - | c#4+e4+a4 - | d4+g4+b4 - | e4+a4+c#5 - | d4+f#4+b4 - | c#4+f#4+a#4\' - |',
      tim:'| d2! . . . . . | _ | g2 . . . . . | a2 . . a2 . . | g2 . . . . . | a2 . . . . . | b2~ - - - - - | f#2 . . f#2 . . |' },
    A2:{b:8, tr:2, v:{cel:0.55, har:1.05},
      mel:'| b4 - - f#4 - b4 | c#5 - d5 f#5 - - | g5 - - e5 - d5 | c#5 - - - - - |'+
          '| b4 - - f#4 - b4 | d5 - e5 f#5 - a5 | b5 - - a#5\' - f#5 | b4 - - - - . |',
      cel:'| b5 - - f#5 - b5 | c#6 - d6 f#6 - - | g6 - - e6 - d6 | c#6 - - - - - |'+
          '| b5 - - f#5 - b5 | d6 - e6 f#6 - a6 | b6 - - a#6\' - f#6 | b5 - - - - . |',
      hrn:'| d4 - - - - - | c#4 - - - - - | b3 - - - - - | c#4 - - e4 - - |'+
          '| d4 - - - - - | f#4 - - - - - | b3 - - c#4 - - | b3 - - - - . |',
      har:'| b2 f#3 b3 d4 f#4 b4 | f#2 c#3 f#3 a3 c#4 f#4 | e2 b2 e3 g3 b3 e4 | a2 e3 a3 c#4 e4 a4 |'+
          '| b2 f#3 b3 d4 f#4 b4 | d3 a3 d4 f#4 a4 d5 | g2 d3 b3 f#2 c#3 a#3\' | b2 f#3 b3 d4 f#4 b4 |',
      str:'| b3+d4+f#4 - | a3+c#4+f#4 - | g3+b3+e4 - | a3+c#4+e4 - | b3+d4+f#4 - | a3+d4+f#4 - | b3+d4+g4 a#3\'+c#4+f#4 | b3+d4+f#4 - |',
      bas:'| b1 f#2 | f#1 c#2 | e2 b1 | a1 e2 | b1 f#2 | d2 a1 | g1 f#1 | b1 - |',
      cho:'| b3+d4+f#4 - | a3+c#4+f#4 - | g3+b3+e4 - | a3+c#4+e4 - | b3+d4+f#4 - | a3+d4+f#4 - | b3+d4+g4 f#3+a#3\'+c#4 | d4+f#4+b4 - |',
      tim:'| b2 . . . . . | _ | _ | a2 . . . . . | b2 . . . . . | _ | g2 . . c#3~ - - | b2 . . . . . |' } },
  form:['A','B','C','A2'], loop:0, loops:0 };
/* THE OLD MAN’S SEAL (chart — a leaf of his chart found: his seal broken · INTROSTORY C12). B Aeolian, 6/8 at 72 — 2 bars (≈ 3.3 s) and the ring, once.
   The celesta & the harp run the minor motif up (B F♯ B C♯ D F♯) to the high B; the harp rolls B minor, the strings and a soft choir land on it with
   the high B, one timpani B. The music under it ducks to 30 % (musSting) — the story's own bed stays beneath. */
MUS_T.chart={
  n:'The Old Man’s Seal', bpm:72, m:'6/8', key:'B aeo', sw:0, hum:0, g:1.2,
  fx:{rv:0.42, ec:'3/16', fb:0.25, ew:0.12},
  ch:{
    cel:{i:'celesta', v:0.75, p:0.3,  s:6, L:'base'},
    har:{i:'harp',    v:0.6,  p:-0.2, s:6, L:'base'},
    str:{i:'strings', v:0.5,  p:0,    s:1, L:'base'},
    cho:{i:'choir',   v:0.32, p:0.05, s:1, L:'base'},
    tim:{i:'timp',    v:0.45, p:0.1,  s:6, L:'base'} },
  lv:[['base']],
  sec:{
    S:{b:2, v:{cel:1.5, har:0.8, str:0.8},
      cel:'| b5 f#5 b5 c#6 d6 f#6 | b6 - - - - - |',
      har:'| b3 f#4 b4 c#5 d5 f#5 | b2+f#3+d4+b4> - - - - - |',
      str:'| _ | b3+d4+f#4+b4 |',
      cho:'| _ | b3+d4+f#4 |',
      tim:'| _ | b2 . . . . . |' } },
  form:['S'], loop:-1 };
/* (DEV) the ornament test (musSelfTest) — every BTN token once: a cut, a scoop, staccato, accent, ghost, a hold, % · @v · @t · _ · strums both ways · = · a marked
   chromatic in a 4-note chord · a timp roll · every kit element. Never a real track (musCheck / musRenderAll / the jukebox list only MUS_T — and the skins musSkinT dresses into MUS_TD, M5a) */
const MUS_TD={_orn:{n:'(DEV) the ornament test', bpm:120, m:'4/4', key:'C ion', sw:0, hum:0, g:1, fx:{rv:0.2, ec:'1/8', fb:0.2, ew:0.1},
  ch:{ a:{i:'fiddle', v:0.8, p:-0.2, s:8, L:'x', mono:1}, k:{i:'keys', v:0.6, p:0.2, s:4, L:'x'}, t:{i:'timp', v:0.6, p:0, s:4, L:'x'}, d:{i:'kit', v:0.5, p:0, s:8, L:'x'} },
  lv:[['x']],
  sec:{ A:{b:4,
    a:'| c5~ d5^ e5* f5! g5? a5 - b5 | % | @v0.5 c6 - - - @t+2 c5 - - - | _ |',
    k:'| c4+e4+g4> - c4+e4+g4< - | = | f4+a4+c5 - - - | g4+b4+d5+f#4\' - - . |',
    t:'| c3~ - - - | _ | g2 . g2 . | c3 - - - |',
    d:'| K . S . K k S s | T t H W Q P . . | C . . . X . . . | B . . . D . . . |' } },
  form:['A'], loop:0 },
  _pv:{n:'(the Music −/+ preview) three harp notes', bpm:150, m:'4/4', key:'D ion', sw:0, hum:0, g:1, fx:{rv:0.3, ec:'1/8', fb:0, ew:0},   // (PT1 M2a — not DEV: the Options row plays it at the new level)
  ch:{ h:{i:'harp', v:0.8, p:0, s:8, L:'x'} }, lv:[['x']], sec:{ A:{b:1, h:'| d5 f#5 a5 - - - - . |'} }, form:['A'], loop:0 }};

