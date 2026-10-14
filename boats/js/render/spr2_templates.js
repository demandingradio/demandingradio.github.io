"use strict";
/* FILE: js/render/spr2_templates.js
THE SPRITES 2.0 TEMPLATES (spr2Build, Project PX: the crawl's 41 hand-placed pixel bodies): original lines 19436-22699
  (build 5109cd5), moved verbatim, in place after js/render/spr2_core.js (the registry and helpers, original lines
  19345-19435 (build 5109cd5)); STAGE 3, THE GROUND, follows at original line 22700 (build 5109cd5).
spr2Build (original lines 19436-22645 (build 5109cd5)) is ONE function, so it cannot be cut without a code change. It sets
  spr2Build.done=1 first, then fills SPR2.tpl with 41 templates (boar, dingo, crab, snake, their swarm Minis, the PX E1-K6
  kinds, the K7 lords, the explorer 'player'), each a header object plus an IIFE that composes its S/D/U views from letter
  rows. Order inside it matters: the Minis, oozeMini, tidecallerBoss and dingoClone read templates built before them.
The tail rides along: eBake (eSprite's cache-miss baker: Sprites 2.0 first, else the old painters, then pixBake), pxLine
  (a texel line on the global pctx, shared by many crawl renderers), eFxPre and eFxPost (the FX a foe wears on the scene).
Entry points: spr2Build (spr2Tpl, spr2Player and allySpr while spr2Build.done is unset, and the idle pre-build below);
  eBake (eSprite); eFxPre and eFxPost (drawIslandWorld); pxLine (about ten crawl renderers, e.g. drawIslandWorld, islTells).
Globals it owns: the functions spr2Build, eBake, pxLine, eFxPre and eFxPost; the flag spr2Build.done; the SPR2.tpl entries.
Main globals it reads from elsewhere: while spr2Build runs, SPR2, spr2F, spr2Bob, spr2Mir, spr2Over, spr2Rep, spr2Shift and
  spr2Flip (js/render/spr2_core.js); at runtime only, ATK and MOTH_LIFT (js/data/crawl2.js, inside template lambdas), TAU,
  clamp and pctx (index.html part 1), ITUNE, itime, player, salIn and bossTint (earlier code), ESPR, the ESC tables, ePose,
  eTint, escRim, pixBake, PIX_NONE, eit and the old painters (js/render/foe_sprites.js), spr2K, spr2Draw and spr2Tpl
  (js/render/spr2_core.js), and iwp (the crawl renderer, a later script).
Load-time statement: only original line 22646 (build 5109cd5), the idle pre-build (requestIdleCallback with a 1500 ms timeout,
  else setTimeout(spr2Build,200)). It must stay right after spr2Build in this same file: the setTimeout branch reads spr2Build
  at load. If spr2Build ever threw mid-build, every foe would quietly fall back to the old painters for the session.
*/
function spr2Build(){ if(spr2Build.done) return; spr2Build.done=1;   // (PX Z1) every template below is composed on first use (spr2Tpl · spr2Player · allySpr) or when the title idles — not at load (§2.9 load → title)
/* ---------------- BOAR: a wedge head low on a humped body, bristle mane on the spine, tusk, trotters ---------------- */
SPR2.tpl.boar={ r0:8, cx0:11, cy0:8, tint:'boarTint', atk:['windup'], atk2:['charge'], eyeL:'k', mouth:{S:[22,10], D:[8,10], U:[7,1]},   // (PX E1) the eye letter (night glints) · the snout, authored on the windup frames (its steam)
  pal:{r:'#2a160a', d:'#4a2a14', m:'#7a4f30', l:'#9a6a44', h:'#b8865c', s:'#b48070', p:'#3a1c14', t:'#f4ecd8', k:'#140a04', n:'#241408', e:'#9a5c4c'},   // (PX E1 lint: the ear's inner a shade pinker — it kept its tone through the grade)
  elite:{d:'#4a1c14', m:'#8a4030', l:'#a85a40', h:'#c87a58', r:'#200a06', e:'#a8604e'}, boss:{d:'#2e1a10', m:'#5e3a24', l:'#7a5030', h:'#9a6a44', r:'#160b02'} };
(function(){
  const T=SPR2.tpl.boar;
  // ---- side (facing right; mirrored for left) 23 x 14 ----
  const body=[
'......rrrrr............',
'....rrrrrrrrr..........',
'...rrllllllllrr...dd...',
'..rmlllllllllllrr.ded..',
'..dmhlllllllllllmrdmmd.',
'.dmmhllllllllllmmmmmmmd',
'.dmmmmmmmmmmmmmmmmkmmmd',
'dmmmmmmmmmmmmmmmmmmmmmd',
'dmmmmmmmmmmmmmmmdmmmmss',
'ddmmmmmmmmmmmmmmdmmmssp',
'.dddmmmmmmmmdddmddtsss.'];
  const legs=[
'..dmdd...ddmdmdd..t....',
'..dmd....ddddmd........',
'..nnn....nn..nn........'];
  const legsA=[
'..dmd...dd.dmdd...t....',
'.dmd....dd..dmd........',
'.nnn....nn...nn........'];   // near-rear forward, near-front back
  const legsB=[
'...dmd.dd..dmd....t....',
'....dmdd...dm..........',
'....nnn....nn..........'];   // near-rear back, near-front forward
  const legsBob=[
'..dmd...dd.dmdd...t....',
'..nnn...nn.nnn.........'];
  const legsBob2=[
'...dmd.dd..dmd....t....',
'...nnn.nn..nnn.........'];
  // windup: head lowers, mane bristles up
  const bodyWind=[
'.....rrrrrrr...........',
'...rrrrrrrrrrr.........',
'..rrllllllllrrrr.......',
'..rmlllllllllllrrr.....',
'..dmhllllllllllmmrrdd..',
'.dmmhllllllllllmmmmded.',
'.dmmmmmmmmmmmmmmmmmdmmd',
'dmmmmmmmmmmmmmmmmmkmmmd',
'dmmmmmmmmmmmmmmmdmmmmmd',
'ddmmmmmmmmmmmmmmdmmmmss',
'.dddmmmmmmmmdddmddmtssp'];
  const legsWind=[
'..dmdd...ddmdmdd..tts..',
'..dmd....ddddmd........',
'..nnn....nn..nn........'];
  // charge: stretched, head forward and low, legs flung
  const bodyCharge=[
'.......rrrrr...........',
'.....rrrrrrrrr.........',
'....rrllllllllrr..dd...',
'...rmlllllllllllrrded..',
'..dmhllllllllllllmdmmd.',
'.dmmhlllllllllllmmmmmmd',
'.dmmmmmmmmmmmmmmmmmkmmd',
'dmmmmmmmmmmmmmmmmmmmmmd',
'dmmmmmmmmmmmmmmmdmmmmss',
'.dmmmmmmmmmmmmmmdmmmssp',
'..ddddmmmmmmdddmddtsss.'];
  const legsCharge=[
'.dmd........dd.dmd.t...',
'dmd.........dd..dmd....',
'nn..........nn...nn....'];
  T.S={ idle:spr2F(body,legs), walk:[spr2F(body,legsA), spr2Bob(body,legsBob), spr2F(body,legsB), spr2Bob(body,legsBob2)], atk:spr2F(bodyWind,legsWind), atk2:spr2F(bodyCharge,legsCharge) };
  // ---- front (facing the camera / down) 16 x 14: ears up, the head fills the view, shoulders behind ----
  const fbody=[
'.dd...rrrr...dd.',
'dedd.rrrrrr.dded',
'dmmdmllllllmdmmd',
'.dmmmlllllllmmd.',
'.dmmmmmmmmmmmmd.',
'dmmmmmmmmmmmmmmd',
'dmmmmmmmmmmmmmmd',
'ddmmkmmmmmmkmmdd',
'.dmmmmmmmmmmmmd.',
'.dmmmmmsssssmmd.',
'..dmmmspsspsmd..'];
  const flegs=[
'..dmd.tsssst.dmd'.slice(0,16),
'..dmd.t.....dmd.',
'..nnn.......nnn.'];
  const flegsBob=[
'..dmd.tsssst.dmd'.slice(0,16),
'..nnn.t.....nnn.'];
  const fwind=[
'....r.rrrr.r....',
'...rrrrrrrrrr...',
'dd.rrllllllrr.dd',
'dedmmllllllmmded',
'.dmmmlllllllmmd.',
'dmmmmmmmmmmmmmmd',
'dmmmmmmmmmmmmmmd',
'dmmmmmmmmmmmmmmd',
'ddmmkmmmmmmkmmdd',
'.dmmmmmsssssmmd.',
'.dmmmmspsspsmmd.',
'dmd..tssssst.dmd',
'dmd..........dmd',
'nnn..........nnn'];   // (PX E1) winding up at you: head dropped, the mane bristling up, ears laid back, forelegs braced wide
  T.D={ idle:spr2F(fbody,flegs), walk:[spr2F(fbody,flegs), spr2Bob(fbody,flegsBob), spr2F(fbody,flegs), spr2Bob(fbody,flegsBob)], atk:fwind };
  // ---- back (facing up / away) 16 x 14: ears, the mane ridge down the spine, round haunches, a tail, hind legs ----
  const ubody=[
'.dd...rrrr...dd.',
'.ded.rrrrrr.ded.',
'.dmmdrllllrdmmd.',
'.dmmllrllrllmmd.',
'dmmlllrllrlllmmd',
'dmlhllrllrllhlmd',
'dmlhlllrrlllhlmd',
'dmllllldrdlllmmd',
'dmmlllldrdlllmmd',
'.dmmmmldrdlmmmd.',
'.ddmmmmdrdmmmdd.'];
  const ulegs=[
'.dmd.ddmrdd.dmd.',
'.dmd..dmd...dmd.',
'.nnn..nnn...nnn.'];
  const ulegsBob=[
'.dmd.ddmrdd.dmd.',
'.nnn..nnn...nnn.'];
  const uwind=[
'....r.rrrr.r....',
'...rrrrrrrrrr...',
'.dmmrrllllrrmmd.',
'.dmmllrllrllmmd.',
'dmmlllrllrlllmmd',
'dmlhllrllrllhlmd',
'dmlhlllrrlllhlmd',
'dmllllldrdlllmmd',
'dmmlllldrdlllmmd',
'.dmmmmldrdlmmmd.',
'.ddmmmmdrdmmmdd.',
'dmd..ddmrdd..dmd',
'dmd...dmd....dmd',
'nnn...nnn....nnn'];   // (PX E1) winding up, from behind: the head gone low past the hump, the mane bristling, hind legs braced
  T.U={ idle:spr2F(ubody,ulegs), walk:[spr2F(ubody,ulegs), spr2Bob(ubody,ulegsBob), spr2F(ubody,ulegs), spr2Bob(ubody,ulegsBob)], atk:uwind };
  T.S.cx0=8; T.D.cx0=8; T.U.cx0=7;   // (PX A1) per-face anchors: each view's feet on the body's centre & its shadow (PX_T.hop ±1 texel in all 16 facings)
  const fchA=[
'................',
'.....rrrrrr.....',
'dd.rrrrrrrrrr.dd',
'dedrrllllllrrded',
'.dmmmlllllllmmd.',
'dmmmmmmmmmmmmmmd',
'dmmmmmmmmmmmmmmd',
'ddmmkmmmmmmkmmdd',
'.dmmmmmsssssmmd.',
'dmdmmmspsspsmmd.',
'dmd.tssssssst.dd',
'dmd...........dm',
'nnn...........nn',
'................'], fchB=fchA.slice(0,9).concat(spr2Mir(fchA.slice(9)));   // (PX K7a V2-3) charging at you: head down, tusks out, the mane laid back, the forelegs striding in turn
  const uchA=[
'................',
'.....rrrrrr.....',
'.dmmrrllllrrmmd.',
'.dmmllrllrllmmd.',
'dmmlllrllrlllmmd',
'dmlhllrllrllhlmd',
'dmlhlllrrlllhlmd',
'dmllllldrdlllmmd',
'dmmlllldrdlllmmd',
'.dmmmmldrdlmmmd.',
'.ddmmmmdrdmmmdd.',
'dmd..ddmrdd..dmd',
'dmd...dmd.....nn',
'nnn...........dd'], uchB=uchA.slice(0,11).concat(spr2Mir(uchA.slice(11)));   // (PX K7a V2-3) …and away: the crest laid flat, the hind legs kicking in turn
  T.D.atk2=[fchA,fchB]; T.U.atk2=[uchA,uchB];   // (PX K7a V2-3: its own front & back charge — was the walk)
})();
/* ---------------- DINGO: lean, long-legged, pricked ears, a brush tail held up, pale belly ---------------- */
SPR2.tpl.dingo={ r0:7, cx0:10, cy0:7, tint:'dingoTint', atk:['crouch'], atk2:['pounce'], eyeL:'k',   // (PX E1) the eye letter
  pal:{d:'#8a5a2a', m:'#c48a44', l:'#e0ae68', h:'#f0d8a0', w:'#f4e8cc', k:'#140a04', n:'#3a2210', e:'#b06a58', o:'#1c1008'},
  elite:{d:'#5a3418', m:'#8a5a2c', l:'#b07c44', h:'#d0a064'}, boss:{d:'#3a2210', m:'#5a3a1c', l:'#7a5a30', h:'#9a7a48'} };
(function(){
  const T=SPR2.tpl.dingo;
  // ---- side (facing right) 21 x 14 ----
  const body=[
'..................dd.',
'.....d...........ded.',
'....dmd.........dmmd.',
'....dmmd.......dmmmd.',
'....dmmmdlllllllmmmmd',
'.....dmmmllllllmmmmmd',
'......dmmmmmmmmmmkmmd',
'......dmmmmmmmmmmmmmm',
'......dmmmmmmmmmdmmwo',
'.......dmwwwwwwmdmwww',
'........dwwwwwwdd.ww.'];
  const legs=[
'........dmd..dmd.....',
'........dmd..dmd.....',
'........nn...nn......'];
  const legsA=[
'.......dmd...ddmd....',
'......dmd......dmd...',
'......nn........nn...'];
  const legsB=[
'........ddmd.dmd.....',
'..........dmdmd......',
'...........nnn.......'];
  const legsBobA=[
'.......dmd...ddmd....',
'.......nn......nn....'];
  const legsBobB=[
'........ddmd.dmd.....',
'..........nn.nn......'];
  // crouch: body low and flat, tail straight, ears back
  const bodyCrouch=[
'.....................',
'.....................',
'..d..................',
'..dmd..........dd.dd.',
'...dmmd.......dmmdmd.',
'....dmmmdlllllllmmmmd',
'.....dmmmllllllmmmkmd',
'......dmmmmmmmmmmmmmm',
'......dmmmmmmmmmdmmwo',
'.......dmwwwwwwmdmwww',
'........dwwwwwwdd.ww.'];
  const legsCrouch=[
'.......dmd.....dmd...',
'......dmnn......dmnn.',
'.....................'];
  // pounce: stretched flat, legs out
  const bodyPounce=[
'.....................',
'.....................',
'.....................',
'd..............dd.dd.',
'dmd...........dmmdmd.',
'.dmmmdlllllllllmmmmmd',
'..dmmmmlllllmmmmmmkmd',
'...dmmmmmmmmmmmmmmmmm',
'....dmmmmmmmmmmdmmmwo',
'.....dmwwwwwwwmdmwwww',
'......dwwwwwwdd..ww..'];
  const legsPounce=[
'....dmd.........dmd..',
'...dmd...........dmd.',
'...nn.............nn.'];
  T.S={ idle:spr2F(body,legs), walk:[spr2F(body,legsA), spr2Bob(body,legsBobA), spr2F(body,legsB), spr2Bob(body,legsBobB)], atk:spr2F(bodyCrouch,legsCrouch), atk2:spr2F(bodyPounce,legsPounce) };
  // ---- front (facing down) 13 x 14 ----
  const fbody=[
'.dd.......dd.',
'ded.......ded',
'dmmd.....dmmd',
'dmmmdlllldmmmd'.slice(0,13),
'.dmmmllllmmmd',
'.dmmmmmmmmmmd',
'.dmkmmmmmmkmd',
'.dmmmmwwwmmmd',
'..dmmmwowmmd.',
'..dmmwwwwwmd.',
'..ddmwwwwwdd.'];
  const flegs=[
'..dmd..d.dmd.',
'..dmd....dmd.',
'..nnn....nnn.'];
  const flegsBob=[
'..dmd....dmd.',
'..nnn....nnn.'];
  const fcrouch=[
'.............',
'.............',
'.............',
'ddd.......ddd',
'.dmmdlllldmmd',
'..dmmllllmmd.',
'.dmmmmmmmmmmd',
'.dmkmmmmmmkmd',
'.dmmmmwwwmmmd',
'ddmmmmwowmmdd',
'dmddmwwwwwdmd',
'dmd.dwwwwwdmd',
'dmd.......dmd',
'nnn.......nnn'];   // (PX E1) crouching at you: low & wide, ears pinned flat, elbows out
  T.D={ idle:spr2F(fbody,flegs), walk:[spr2F(fbody,flegs), spr2Bob(fbody,flegsBob), spr2F(fbody,flegs), spr2Bob(fbody,flegsBob)], atk:fcrouch };
  // ---- back (facing up) 13 x 14: ears, back, tail up the middle ----
  const ubody=[
'.dd.......dd.',
'.dmd.....dmd.',
'.dmmd...dmmd.',
'.dmmmdllldmmd',
'..dmmlllllmd.',
'..dmlllllllmd',
'..dmllllwllmd',
'..dmlllwwwlmd',
'..dmlllwwwlmd',
'..dmmllwwwlmd',
'..ddmmmwwwmdd'];
  const ulegs=[
'..dmd.dwwd.dmd'.slice(0,13),
'..dmd..ww.dmd',
'..nnn.....nnn'];
  const ulegsBob=[
'..dmd..ww.dmd',
'..nnn.....nnn'];
  const ucrouch=[
'.............',
'.............',
'.............',
'ddd.......ddd',
'.dmmdllldmmd.',
'.dmmlllllmmd.',
'.dmlllllllmd.',
'.dmllllwllmd.',
'.dmlllwwwlmd.',
'ddmlllwwwlmdd',
'dmdmllwwwldmd',
'dmd.dmwwwmdmd',
'dmd...ww..dmd',
'nnn.......nnn'];   // (PX E1) crouching, from behind: flattened, ears pinned, haunches out
  T.U={ idle:spr2F(ubody,ulegs), walk:[spr2F(ubody,ulegs), spr2Bob(ubody,ulegsBob), spr2F(ubody,ulegs), spr2Bob(ubody,ulegsBob)], atk:ucrouch };
  T.S.cx0=11; T.D.cx0=T.U.cx0=7;   // (PX A1) per-face anchors
  const s7=L=>L.map(x=>x+[...x.slice(0,6)].reverse().join(''));   // (a left half of 7 → the 13-wide row, mirrored)
  const fpounce=s7(['.......','.......','dd.....','.dddmll','..dmlll','.dmkmll','.dmmmll','ddmmwww','dmmwooo','dmdwoee','dmd.dww','dmd..dd','nn.....','.......']);   // (PX K7a V2-3) pouncing at you: off the ground, ears pinned, jaws wide, the forelegs flung out
  const upounce=s7(['.......','.......','dd.....','.dddlll','..dmlll','..dmlll','.dmllll','.dmlllw','dmd.dww','dmd..ww','nn...w.','.......','.......','.......']);   // (PX K7a V2-3) …and away: the hind legs kicked out, the brush streaming back at you
  T.D.atk2=fpounce; T.U.atk2=upounce;   // (PX K7a V2-3: its own front & back pounce — was the walk)
})();
/* ---------------- CRAB: a wide carapace seen from above, two pincers toward the facing, thin legs out the sides, eyes on the front rim ---------------- */
SPR2.tpl.crab={ r0:7.4, cx0:9, cy0:6, tint:'crabTint', atk:['windup','lunge'], always:true, eyeL:'k',   // (PX E1) the eye letter
  pal:{d:'#7a2418', m:'#c84a34', l:'#e8704c', h:'#f8a070', k:'#140a04', w:'#f4ecdc', j:'#e47048', g:'#5a1810'},   // (PX E1 lint: the claws' light a step brighter — they read through the grade)
  elite:{d:'#4a1838', m:'#8a3060', l:'#b0507c', h:'#d08098', j:'#a84c84', g:'#36102a'}, boss:{d:'#2e1408', m:'#6a3018', l:'#8a4a28', h:'#b07048', j:'#a85a30', g:'#200c04'} };
(function(){
  const T=SPR2.tpl.crab;
  // ---- facing down (the front, pincers and eyes, toward the camera) 20 x 14 ----
  const D=[
'....d..........d....',
'...d.ddddddddd..d...',
'..d.dmllllllllmd.d..',
'.d.dmllllhhllllmd.d.',
'.dddmmlllllllllmmdd.',
'...dmmmmlllllmmmmd..',
'..ddmmmmmmmmmmmmmdd.',
'.d.dmmkwmmmmmwkmd.d.',
'...ddmmmmmmmmmmmdd..',
'..dmjgdddmmmddgjmd..',
'.dmjjjg.ddddd.gjjjmd',
'.djjjjg.......gjjjjd',
'.dj.jd.........dj.jd',
'..dd.............dd.'];
  const Dw=[
'...d............d...',
'..d..ddddddddd...d..',
'..d.dmllllllllmd.d..',
'.d.dmllllhhllllmd.d.',
'..ddmmlllllllllmmdd.',
'.d.dmmmmlllllmmmmd.d',
'..ddmmmmmmmmmmmmmdd.',
'...dmmkwmmmmmwkmd...',
'..dddmmmmmmmmmmmddd.',
'..dmjgdddmmmddgjmd..',
'.dmjjjg.ddddd.gjjjmd',
'.djjjjg.......gjjjjd',
'.dj.jd.........dj.jd',
'..dd.............dd.'];
  const Datk=[           // windup: pincers spread wide and opened
'....d..........d....',
'...d.ddddddddd..d...',
'..d.dmllllllllmd.d..',
'.d.dmllllhhllllmd.d.',
'.dddmmlllllllllmmdd.',
'...dmmmmlllllmmmmd..',
'..ddmmmmmmmmmmmmmdd.',
'.d.dmmkwmmmmmwkmd.d.',
'.d.ddmmmmmmmmmmmdd.d',
'djjgdddddmmmdddddgjjd'.slice(0,20),
'jjjjjg..ddddd..gjjjjj'.slice(0,20),
'j..jjg.........gjj..j'.slice(0,20),
'.d.jd...........dj.d'.slice(0,20),
'....................'];
  T.D={ idle:D, walk:[D,Dw,D,Dw], atk:Datk };
  // ---- facing up: the same crab from behind (pincers up) ----
  const U=spr2Flip(D).map(r=>r.replace(/kw|wk/g,'mm'));   // the eyes are on the far rim: hidden (PX E1: every row — the flip had left them on row 6, so the back view wore eyes)
  const Uw=spr2Flip(Dw).map(r=>r.replace(/kw|wk/g,'mm'));
  T.U={ idle:U, walk:[U,Uw,U,Uw], atk:spr2Flip(Datk).map(r=>r.replace(/kw|wk/g,'mm')) };
  // ---- facing right: its broad front (a crab scuttles sideways — the old quarter-turned view read as a tall card) ----
  T.S=T.D;   // (PX A1) the D frames & anchors
  T.D.cx0=10;   // (PX A1) per-face anchors (S shares the D frames)
})();
/* ---------------- SNAKE: a slim S-curve seen from above, head raised, a forked tongue on the strike ---------------- */
SPR2.tpl.snake={ r0:6.7, cx0:9, cy0:5, tint:'snakeTint', atk:['wind','act'], always:true, eyeL:'k',   // (PX E1) the eye letter
  pal:{d:'#1e4a30', m:'#3a7a4c', l:'#5aa868', h:'#8cd090', b:'#2a5a38', k:'#100a04', y:'#f0d040', t:'#e04040', w:'#f4f0e0'},
  elite:{d:'#2a1a50', m:'#4e3a8a', l:'#7a60b8', h:'#a890d8', b:'#3a2a68'}, boss:{d:'#1a1a1a', m:'#3a3a3a', l:'#606060', h:'#8a8a8a', b:'#1e1e1e'} };
(function(){
  const T=SPR2.tpl.snake;
  // ---- facing right 19 x 11: tail trailing left, body in a wave, head raised at the right ----
  const S=[
'..............ddd..',
'.............dmlld.',
'.............dlkmd.',
'....dddd.....dmmmd.',
'...dmllmd....dmmd..',
'..dmlmbmmd..dmmd...',
'.dmmd.dmmmddmmd....',
'.dmd...dmbmmmmd....',
'.dd.....ddmmdd.....',
'..........dd.......',
'...................'];
  const Sw=[
'..............ddd..',
'.............dmlld.',
'.............dlkmd.',
'.....ddd.....dmmmd.',
'....dmlmd....dmmd..',
'...dmlmbmd..dmmd...',
'..dmmd.dmmmddmmd...',
'.dmmd...dmbmmmd....',
'.dd......ddmdd.....',
'...................',
'...................'];
  const Satk=[           // wind-up / strike: head thrown forward, low, tongue out
'...................',
'...................',
'.....dddd..........',
'....dmllmdd........',
'...dmlmbmmmd.......',
'..dmmd.dmmmmd.dddd.',
'..dmd...dmbmmdmlldd',
'..dd.....ddmmmlkmmt',
'..........ddmmmmd.t',
'............dddd...',
'...................'];
  T.S={ idle:S, walk:[S,Sw,S,Sw], atk:Satk };
  // ---- facing down 11 x 15: body winding up and away, head toward the camera ----
  const D=[
'.....ddd...',
'....dmlmd..',
'...dmlmmmd.',
'...dmmmbmd.',
'....dmmmd..',
'...dmmmd...',
'..dmbmd....',
'..dmmmd....',
'...dmmmd...',
'....dmmd...',
'...dmllmd..',
'..dmllllmd.',
'..dmkmmkmd.',
'..dmmmmmmd.',
'...dmtdtd..'];
  const Dw=[
'....ddd....',
'...dmlmd...',
'..dmlmmmd..',
'..dmmmbmd..',
'...dmmmd...',
'....dmmmd..',
'.....dmbmd.',
'....dmmmd..',
'...dmmmd...',
'....dmmd...',
'...dmllmd..',
'..dmllllmd.',
'..dmkmmkmd.',
'..dmmmmmmd.',
'...dmtdtd..'];
  const Datk=[
'....ddd....',
'...dmlmd...',
'...dmmmd...',
'..dmbmd....',
'..dmmmd....',
'...dmmmd...',
'....dmmd...',
'...dmllmd..',
'..dmllllmd.',
'..dmkmmkmd.',
'..dmmwwmmd.',
'...dmwwmd..',
'....dtdt...',
'....dt.t...',
'...........'];
  T.D={ idle:D, walk:[D,Dw,D,Dw], atk:Datk };
  // ---- facing up: head away (the top of the head, no eyes), tail toward the camera ----
  const U=[
'...dmllmd..',
'..dmllllmd.',
'..dmlllmmd.',
'..dmmmmmmd.',
'...dmmmd...',
'....dmmd...',
'...dmbmd...',
'..dmmmd....',
'..dmbmd....',
'...dmmmd...',
'....dmmmd..',
'....dmbmd..',
'...dmmmd...',
'...dmmd....',
'...dd......'];
  const Uw=[
'...dmllmd..',
'..dmllllmd.',
'..dmlllmmd.',
'..dmmmmmmd.',
'...dmmmd...',
'...dmmd....',
'...dmbmd...',
'....dmmmd..',
'....dmbmd..',
'...dmmmd...',
'..dmmmd....',
'..dmbmd....',
'...dmmmd...',
'....dmmd...',
'.....dd....'];
  const Uatk=[
'....t.t....',
'.....t.....',
'...dmllmd..',
'..dmllllmd.',
'..dmlllmmd.',
'...dmmmmd..',
'....dmmd...',
'....dmmd...',
'...dmbmd...',
'..dmmmmdd..',
'.dmbmddmmd.',
'.dmmd.dmbd.',
'..dmmddmmd.',
'...dmmmmd..',
'....dddd...'];   // (PX E1) striking away: coiled low, the neck stretched, the red fork flicking out ahead
  T.U={ idle:U, walk:[U,Uw,U,Uw], atk:Uatk };
  T.S.cx0=8; T.D.cx0=6; T.U.cx0=5; T.D.cy0=T.U.cy0=10;   // (PX A1) per-face anchors (the long front & back views stand on the shadow too: no 4-texel hop on a turn) · (PX1 FIX V1-3: U 4 → 5 — both slither frames within a texel)
})();
/* ---------------- THE SWARM (fodder): small kinds of their own, drawn at the swarm's size, not shrunk from the big ones ---------------- */
SPR2.tpl.boarMini={ r0:5, cx0:6, cy0:4, tint:'boarTint', atk:['windup'], atk2:['charge'], eyeL:'k', mouth:{S:[12,6], D:[6,6], U:[5,0]}, pal:SPR2.tpl.boar.pal, elite:SPR2.tpl.boar.elite, boss:SPR2.tpl.boar.boss };
(function(){
  const T=SPR2.tpl.boarMini;
  const S=[
'...rrrr......',
'..rllllrr.dd.',
'.dmllllllrdmd',
'dmmmmmmmmmkmd',
'dmmmmmmmmmmss',
'.dmmmmmdmmtsp',
'.dmd.dmd.dd..',
'.nn..nn..nn..'];
  const Sw=[
'...rrrr......',
'..rllllrr.dd.',
'.dmllllllrdmd',
'dmmmmmmmmmkmd',
'dmmmmmmmmmmss',
'.dmmmmmdmmtsp',
'dmd...dmd.dd.',
'nn....nn..nn.'];
  const Sa=[
'..rrrrr......',
'.rllllllr....',
'.dmllllllrdd.',
'dmmmmmmmmmdmd',
'dmmmmmmmmmkmd',
'.dmmmmmdmmmss',
'.dmd.dmd.tssp',
'.nn..nn..nn..'];
  T.S={ idle:S, walk:[S,Sw,S,Sw], atk:Sa, atk2:Sw };
  const D=[
'.dd.rrrr.dd.',
'dmddllllddmd',
'.dmmllllmmd.',
'dmmmmmmmmmmd',
'dmkmmmmmmkmd',
'.dmmmsssmmd.',
'.dmdtsssdmd.',
'.nn.t...nn..'];
  const Dw=[
'.dd.rrrr.dd.',
'dmddllllddmd',
'.dmmllllmmd.',
'dmmmmmmmmmmd',
'dmkmmmmmmkmd',
'.dmmmsssmmd.',
'dmd.tsss.dmd',
'nn..t....nn.'];
  T.D={ idle:D, walk:[D,Dw,D,Dw], atk:[
'...r.rr.r...',
'dd.rrrrrr.dd',
'ddmmllllmmdd',
'dmmmmmmmmmmd',
'dmkmmmmmmkmd',
'.dmmssssmmd.',
'dmdtspsptdmd',
'nn........nn'] };   // (PX E1) its windup at you: bristled, head low, legs braced
  const U=[
'.dd..rr..dd.',
'dmdrrrrrrdmd',
'dmlllrrlllmd',
'dmlllrrlllmd',
'dmmlllrllmmd',
'.dmmmdrdmmd.',
'.dmd.drd.dmd',
'.nn..nn..nn.'];
  const Uw=[
'.dd..rr..dd.',
'dmdrrrrrrdmd',
'dmlllrrlllmd',
'dmlllrrlllmd',
'dmmlllrllmmd',
'.dmmmdrdmmd.',
'dmd..drd..dmd'.slice(0,12),
'nn...nn...nn'];
  T.U={ idle:U, walk:[U,Uw,U,Uw], atk:[
'...r.rr.r...',
'..rrrrrrrr..',
'dmlllrrlllmd',
'dmlllrrlllmd',
'dmmlllrllmmd',
'.dmmmdrdmmd.',
'dmd..drd.dmd',
'nnn..nn..nnn'] };   // (PX E1) …and from behind
  T.D.atk2=[[
'............',
'..rrrrrrrr..',
'ddrrllllrrdd',
'dmmmmmmmmmmd',
'dmkmmmmmmkmd',
'dmdmssssmmd.',
'dmdtspsptdd.',
'nn........nn'],[
'............',
'..rrrrrrrr..',
'ddrrllllrrdd',
'dmmmmmmmmmmd',
'dmkmmmmmmkmd',
'.dmmssssmdmd',
'.ddtspsptdmd',
'nn........nn']];   // (PX K7a V2-3) its charge at you: the run, head down…
  T.U.atk2=[[
'............',
'..rrrrrrrr..',
'dmlllrrlllmd',
'dmlllrrlllmd',
'dmmlllrllmmd',
'.dmmmdrdmmd.',
'dmd..drd..nn',
'nn........dd'],[
'............',
'..rrrrrrrr..',
'dmlllrrlllmd',
'dmlllrrlllmd',
'dmmlllrllmmd',
'.dmmmdrdmmd.',
'nn...drd.dmd',
'dd.......nn.']];   // …and away
})();
SPR2.tpl.dingoMini={ r0:4.4, cx0:6, cy0:4, tint:'dingoTint', atk:['crouch'], atk2:['pounce'], eyeL:'k', pal:SPR2.tpl.dingo.pal, elite:SPR2.tpl.dingo.elite, boss:SPR2.tpl.dingo.boss };
(function(){
  const T=SPR2.tpl.dingoMini;
  const S=[
'...........dd',
'..d.......ded',
'..dmd....dmmd',
'...dmdllldmkd',
'....dmmmmmmmm',
'....dmmmmdmwo',
'.....dwwwdww.',
'.....dd.dd...'];
  const Sw=[
'...........dd',
'..d.......ded',
'..dmd....dmmd',
'...dmdllldmkd',
'....dmmmmmmmm',
'....dmmmmdmwo',
'.....dwwwdww.',
'....dd...dd..'];
  const Sa=[
'.............',
'.............',
'.d.......dd.d',
'.dmd....dmmdd',
'..dmdlllmmmkd',
'...dmmmmmmmmm',
'....dwwwdmwo.',
'...dd....dd..'];
  T.S={ idle:S, walk:[S,Sw,S,Sw], atk:Sa, atk2:Sa };
  const D=[
'.dd....dd.',
'ded....ded',
'dmmdlldmmd',
'.dmmllmmd.',
'.dkmmmmkd.',
'.dmmwwwmd.',
'..dmwowd..',
'..dd..dd..'];
  const Dw=[
'.dd....dd.',
'ded....ded',
'dmmdlldmmd',
'.dmmllmmd.',
'.dkmmmmkd.',
'.dmmwwwmd.',
'.dmmwowmd.',
'.dd....dd.'];
  T.D={ idle:D, walk:[D,Dw,D,Dw], atk:[
'..........',
'dd......dd',
'ddmdlldmdd',
'.dmmllmmd.',
'.dkmmmmkd.',
'.dmmwwwmd.',
'dddmwowddd',
'dd......dd'] };   // (PX E1) its crouch at you: flat, ears pinned
  const U=[
'.dd....dd.',
'.dmd..dmd.',
'.dmmdldmmd'.slice(0,10),
'..dmllllmd',
'..dmllwlmd',
'..dmlwwwld',
'..dmdwwwdd',
'..dd.ww.dd'];
  const Uw=[
'.dd....dd.',
'.dmd..dmd.',
'.dmmdldmmd'.slice(0,10),
'..dmllllmd',
'..dmllwlmd',
'..dmlwwwld',
'.dmd.wwwdmd'.slice(0,10),
'.dd..ww..d'];
  T.U={ idle:U, walk:[U,Uw,U,Uw], atk:[
'..........',
'dd......dd',
'ddmdlldmdd',
'.dmllllmd.',
'.dmllwlmd.',
'.dmlwwwld.',
'dddlwwwddd',
'dd..ww..dd'] };   // (PX E1) …and from behind
  T.S.cx0=8; T.D.cx0=5; T.U.cx0=6;   // (PX A1) per-face anchors
  T.D.atk2=[
'dd......dd',
'.ddmllmdd.',
'.dmmllmmd.',
'.dkmmmmkd.',
'ddmwoowmdd',
'dmdweewdmd',
'nn......nn',
'..........'];   // (PX K7a V2-3) its pounce at you: off the ground, jaws wide, forelegs out
  T.U.atk2=[
'dd......dd',
'.ddmllmdd.',
'..dmllmd..',
'..dmlwlmd.',
'..dmlwwld.',
'dmd.ww.dmd',
'nn..w...nn',
'..........'];   // …and away: hind legs kicked out, the brush streaming
})();
SPR2.tpl.crabMini={ r0:4.6, cx0:6, cy0:4, tint:'crabTint', atk:['windup','lunge'], always:true, eyeL:'k', pal:SPR2.tpl.crab.pal, elite:SPR2.tpl.crab.elite, boss:SPR2.tpl.crab.boss };
(function(){
  const T=SPR2.tpl.crabMini;
  const D=[
'..d.......d..',
'.d.ddddddd.d.',
'.ddmllllllmdd',
'..dmmmmmmmmd.',
'.ddmkwmmwkmdd',
'..dmmmmmmmmd.',
'.djjgdmmdgjjd',
'.dj.jd..dj.jd'];
  const Dw=[
'.d.........d.',
'..dddddddd.d.',
'.ddmllllllmdd',
'..dmmmmmmmmd.',
'.ddmkwmmwkmdd',
'..dmmmmmmmmd.',
'.djjgdmmdgjjd',
'.dj.jd..dj.jd'];
  const Da=[
'..d.......d..',
'.d.ddddddd.d.',
'.ddmllllllmdd',
'..dmmmmmmmmd.',
'.ddmkwmmwkmdd',
'.d.dmmmmmmd.d',
'jjgd.dmmd.djj'.slice(0,13),
'j.jd......dj.j'.slice(0,13)];
  T.D={ idle:D, walk:[D,Dw,D,Dw], atk:Da };
  const U=spr2Flip(D).map(r=>r.replace(/kw|wk/g,'mm')), Uw=spr2Flip(Dw).map(r=>r.replace(/kw|wk/g,'mm'));
  T.U={ idle:U, walk:[U,Uw,U,Uw], atk:spr2Flip(Da).map(r=>r.replace(/kw|wk/g,'mm')) };   // (PX E1) from behind its pincers spread too (as the crab)
  T.S=T.D;   // (PX A1) the side view = its front, as the crab
})();
SPR2.tpl.snakeMini={ r0:4.1, cx0:6, cy0:3, tint:'snakeTint', atk:['wind','act'], always:true, eyeL:'k', pal:SPR2.tpl.snake.pal, elite:SPR2.tpl.snake.elite, boss:SPR2.tpl.snake.boss };
(function(){
  const T=SPR2.tpl.snakeMini;
  const S=[
'.........ddd.',
'........dmlkd',
'...ddd..dmmd.',
'..dmlmd.dmd..',
'.dmmdmmddmd..',
'.dd..dmmmd...',
'......ddd....'];
  const Sw=[
'.........ddd.',
'........dmlkd',
'....ddd.dmmd.',
'...dmlmddmd..',
'..dmmdmmmmd..',
'.dmd..dmmd...',
'.dd....dd....'];
  const Sa=[
'.............',
'...ddd.......',
'..dmlmdd.....',
'.dmmdmmmd.ddd',
'.dd..dmmmdmlkt',
'......ddmmmd.',
'........ddd..'];
  T.S={ idle:S, walk:[S,Sw,S,Sw], atk:Sa.map(r=>r.slice(0,13)) };
  const D=[
'...ddd..',
'..dmlmd.',
'..dmmmd.',
'...dmd..',
'..dmmd..',
'.dmlmmd.',
'.dkmmkd.',
'..dtdt..'];
  const Dw=[
'..ddd...',
'.dmlmd..',
'.dmmmd..',
'..dmmd..',
'...dmd..',
'.dmlmmd.',
'.dkmmkd.',
'..dtdt..'];
  T.D={ idle:D, walk:[D,Dw,D,Dw], atk:[
'........',
'...ddd..',
'..dmlmd.',
'..dmmd..',
'.dmllmd.',
'.dkmmkd.',
'.dmwwmd.',
'..tddt..'] };   // (PX E1) striking at you: head down & forward, the mouth open, the fork out
  const U=[
'..dllmd.',
'.dmllmmd',
'..dmmmd.',
'...dmd..',
'..dmmd..',
'..dmmd..',
'...dmd..',
'...dd...'];
  const Uw=[
'..dllmd.',
'.dmllmmd',
'..dmmmd.',
'..dmmd..',
'...dmmd.',
'...dmmd.',
'..dmd...',
'..dd....'];
  T.U={ idle:U, walk:[U,Uw,U,Uw], atk:[
'..t.t...',
'...t....',
'..dllmd.',
'.dmllmmd',
'..dmmmd.',
'..dmmd..',
'.dmmmmd.',
'..dddd..'] };   // (PX E1) striking away: coiled, the red fork ahead
  T.S.cx0=5; T.D.cx0=T.U.cx0=4;   // (PX A1) per-face anchors
})();
/* ---------------- URCHIN (PX E1 · px_art §5.1, Megan's prototype): a spiny dome, one drawing every way (faces:'D') — idle sways · walk trundles · SWELL (the tell):
   the body flushes hot, the spines stand long & gold-tipped, the mouth-star glows ---------------- */
SPR2.tpl.urchin={ r0:6.67, cx0:9, cy0:9, faces:'D', sel:(en,pose)=>pose===1?'swell':en.mv?'walk':'idle',
  pal:{d:'#1e1430', m:'#3a2a52', l:'#5a4478', h:'#8a6ab0', s:'#5a4a74', t:'#8a7aa8', c:'#b090e0', o:'#c8482e', O:'#ff7a4a', y:'#ffd23f', Y:'#fff0a0'},
  elite:{d:'#2a1010', m:'#5a2424', l:'#7a3a34', h:'#a8584a', s:'#7a3c38', t:'#a07068'} };   // (the elite: a "blood urchin")
(function(){
  const T=SPR2.tpl.urchin;
  const A=[
'.........t.........',
'...t.....s.....t...',
'....s....s....s....',
'.....s.ddddd.s.....',
'..t...dmmmmmd...t..',
'...ssdmllmmmmdss...',
'.....dmlhlmmmmd....',
'tsssdmmllmmmmmmdsst',
'....dmmmmmmmmmmd...',
'...sdmmmmmcmmmmds..',
'..t.ddmmmmmmmmdd.t.',
'.....ddmmmmmmdd....',
'....s.dddddddd.s...',
'...t...s...s...t...',
'.......t...t.......'];
  const B=[
'...................',
'..t......t......t..',
'...s.....s.....s...',
'....ss.ddddd.ss....',
'......dmmmmmd......',
'.t.ssdmllmmmmdss.t.',
'.....dmlhlmmmmd....',
'.sssdmmllmmmmmmdss.',
'....dmmmmmmmmmmd...',
'..ssdmmmmmcmmmmdss.',
'....ddmmmmmmmmdd...',
'.t...ddmmmmmmdd..t.',
'...ss.dddddddd.ss..',
'......s...s...s....',
'.....t....t....t...'];
  const S1=[            // SWELL: hot, the spines long & gold-tipped, the mouth-star lit
'.........Y.........',
'..Y......O......Y..',
'...O.....O.....O...',
'....O..ddddd..O....',
'Y....OdoooooodO...Y',
'.OO.OdoOOooooodOOO.',
'.....doOyOooooodd..',
'YOOOdooOOoooooooOOY',
'....dooooooooooo...',
'..OOdoooooyooooOO..',
'.Y..ddoooooooodd.Y.',
'.....ddoooooodd....',
'...O..dddddddd..O..',
'..Y...O....O...Y...',
'......Y....Y.......'];
  T.D={ idle:[A,A,B,B], walk:[A,B], swell:[S1,spr2Rep(S1,{O:'y',Y:'O'})] };   // (the swell flickers its gold · the trundle turns its spines)
})();
/* ---------------- OOZE (PX E1 · px_art §5.4, Megan's prototype): a slime — idle wobbles · walk squashes & stretches · wind (the slam) rises tall, eyes squeezed shut ·
   act SPLATS wide & flat · scorch (a caldera's): magma · its halves (oozeSplit, gen 1) wear the oozeMini — by role, never by size ---------------- */
SPR2.tpl.ooze={ r0:8.15, cx0:9, cy0:8, eyeL:'k',
  sel:(en,pose)=>en.st==='wind'?'wind':en.st==='act'?'act':en.mv?'walk':'idle',
  alt:{key:'scorch', pal:{d:'#7a2a0e', m:'#c8582a', l:'#f08a3a', h:'#ffd08a', k:'#2a0a04', s:'#4a160a'}},
  pal:{d:'#2e6a18', m:'#5aae2c', l:'#8ad83e', h:'#e2ffa8', w:'#ffffff', k:'#10200a', s:'#1e4a10'},
  elite:{d:'#1e4a5a', m:'#3a8aa0', l:'#5ac0d0', h:'#c8f8ff', s:'#103a44'} };   // (the elite: a "glacier ooze")
(function(){
  const T=SPR2.tpl.ooze, shut=rows=>rows.map(r=>r.replace(/wk/g,'dd').replace(/kw/g,'dd').replace(/ww/g,'ll'));   // (eyes squeezed shut: a dark line each)
  const Da=[
'..................',
'.......dddd.......',
'.....ddllmmdd.....',
'....dllhhlmmmd....',
'...dlhhllllmmmd...',
'..dllhlllllmmmmd..',
'..dlllllllllmmmd..',
'.dmllwwllllwwmmmd.',
'.dmllwkllllwkmmmd.',
'.dmmlllllllllmmmd.',
'dmmmmllllllmmmmmmd',
'dmmmmmmmmmmmmmmmmd',
'.ddmmmmmmmmmmmmdd.',
'..sddddddddddddss.'];
  const Db=[                // squash
'..................',
'..................',
'......dddddd......',
'....ddllhlmmdd....',
'...dlhhllllmmmd...',
'..dlhhlllllmmmmd..',
'.dllllllllllmmmmd.',
'.dmllwwllllwwmmmd.',
'dmmllwkllllwkmmmmd',
'dmmmlllllllllmmmmd',
'dmmmmllllllmmmmmmd',
'dmmmmmmmmmmmmmmmmd',
'.ddmmmmmmmmmmmmdd.',
'..sddddddddddddss.'];
  const Dc=[                // stretch (taller, narrower)
'........dd........',
'......ddlmdd......',
'.....dlhhlmmd.....',
'....dlhhllmmmd....',
'....dlhllllmmd....',
'...dlllllllmmmd...',
'...dmlwwllwwmmd...',
'...dmlwkllwkmmd...',
'..dmmllllllmmmmd..',
'..dmmmllllmmmmmd..',
'..dmmmmmmmmmmmmd..',
'..dmmmmmmmmmmmmd..',
'...ddmmmmmmmmdd...',
'...sddddddddddss..'];
  const Dact=[              // SPLAT: flat & wide, eyes wide
'..................',
'..................',
'..................',
'..................',
'.....dddddddd.....',
'...ddllhhllmmdd...',
'..dllhhlllllmmmd..',
'.dlllwwllllwwmmmd.',
'dmmllwkllllwkmmmmd',
'dmmmmllllllllmmmmd',
'dmmmmmmmmmmmmmmmmd',
'dmmmmmmmmmmmmmmmmd',
'sddmmmmmmmmmmmmdds',
'.ssddddddddddddss.'];
  T.D={ idle:[Da,Da,Db,Da], walk:[Da,Db,Da,Dc], wind:shut(Dc), act:Dact };
  const Sa=[                // facing right: the dome leans into its way, both eyes toward the front
'..................',
'......dddd........',
'....ddllmmdd......',
'...dllhhlmmmd.....',
'..dlhhllllmmmd....',
'..dllhllllllmmd...',
'.dlllllllllwwlmd..',
'.dmlllllllwwkwwmd.',
'.dmmlllllllkllkmd.',
'dmmmmlllllllllmmd.',
'dmmmmmmllllllmmmmd',
'dmmmmmmmmmmmmmmmmd',
'.ddmmmmmmmmmmmmdd.',
'..sddddddddddddsss'];
  const Sb=spr2Shift(Sa,0,1).map((r,i)=>i===13?'.sddddddddddddddss':i===12?'dddmmmmmmmmmmmmddd':r);
  const Sc=spr2Shift(Sa,1,-1).map((r,i)=>i===13?'...sdddddddddddss.':i===12?'..ddmmmmmmmmmmdd..':r);
  const Sact=[              // its splat, eyes to the front
'..................',
'..................',
'..................',
'..................',
'.....dddddddd.....',
'...ddllhhllmmdd...',
'..dllhhlllllmmmd..',
'.dlllllllllwwkwwd.',
'dmmllllllllkllkmmd',
'dmmmmllllllllmmmmd',
'dmmmmmmmmmmmmmmmmd',
'dmmmmmmmmmmmmmmmmd',
'sddmmmmmmmmmmmmdds',
'.ssddddddddddddss.'];
  T.S={ idle:[Sa,Sa,Sb,Sa], walk:[Sa,Sb,Sa,Sc], wind:spr2Rep(Sc,{w:'l',k:'d'}), act:Sact };
  const back=rows=>spr2Rep(rows,{w:'l',k:'l'});   // (from behind: the same dome, no eyes)
  T.U={ idle:[back(Da),back(Da),back(Db),back(Da)], walk:[back(Da),back(Db),back(Da),back(Dc)], wind:back(Dc), act:back(Dact) };
})();
/* the ooze's halves (gen 1) — its own small drawing (r0 5.87 = ooze ERAD 11 × 0.72 × 200/270), never the big one shrunk */
SPR2.tpl.oozeMini={ r0:5.87, cx0:6, cy0:5, eyeL:'k', sel:SPR2.tpl.ooze.sel, alt:SPR2.tpl.ooze.alt, pal:SPR2.tpl.ooze.pal, elite:SPR2.tpl.ooze.elite };
(function(){
  const T=SPR2.tpl.oozeMini, shut=rows=>rows.map(r=>r.replace(/wk/g,'dd').replace(/kw/g,'dd').replace(/ww/g,'ll'));
  const A=[
'.............',
'.....ddd.....',
'...ddllmdd...',
'..dlhhllmmd..',
'.dllhlllmmmd.',
'.dlwwllwwmmd.',
'dmlwkllwkmmmd',
'dmmllllllmmmd',
'.ddmmmmmmmdd.',
'..sddddddds..'];
  const B=[
'.............',
'.............',
'....ddddd....',
'..ddllhlmdd..',
'.dlhhllllmmd.',
'.dlwwllwwmmd.',
'dmlwkllwkmmmd',
'dmmllllllmmmd',
'.ddmmmmmmmdd.',
'..sddddddds..'];
  const C=[
'......dd.....',
'....ddlmd....',
'...dlhhlmd...',
'...dhhllmd...',
'..dlllllmmd..',
'..dlwwlwwmd..',
'..dlwklwkmd..',
'..dmllllmmd..',
'..ddmmmmmdd..',
'..sdddddddss.'];
  const Ac=[
'.............',
'.............',
'.............',
'.............',
'...ddddddd...',
'..dllhhlmmd..',
'.dlwwllwwmmd.',
'dmlwkllwkmmmd',
'dmmmmmmmmmmmd',
'.sddddddddds.'];
  const Sa=[
'.............',
'....dddd.....',
'..ddllmmdd...',
'.dlhhllmmmd..',
'.dllhllwwlwd.',
'dmllllllwklkd',
'dmmlllllllmmd',
'dmmmmmmmmmmmd',
'.ddmmmmmmmdd.',
'..sdddddddsss'];
  const Sb=spr2Shift(Sa,0,1).map((r,i)=>i===9?'.sddddddddsss':i===8?'dmmmmmmmmmmmd':r);
  T.D={ idle:[A,B], walk:[A,C], wind:shut(C), act:Ac };
  T.S={ idle:[Sa,Sb], walk:[Sa,Sb], wind:shut(C).map(r=>'.'+r), act:Ac.map(r=>'.'+r) };   // (rising to slam, eyes shut, it looks the same every way · its splat shows both eyes · a column on the left: the profile's anchor)
  const back=rows=>spr2Rep(rows,{w:'l',k:'l'});
  T.U={ idle:[back(A),back(B)], walk:[back(A),back(C)], wind:back(C), act:back(Ac) };
  T.S.cx0=7;   // (its profile's feet on the centre: PX_T.hop)
})();
/* ---------------- THE PACK ALPHA (PX E1 · its own drawing at its true size, r0 9.63 = ERAD 13 × 200/270): a heavy grey wolf — shoulders over the hips, a shaggy dark
   ruff, a scar through the eye, amber eyes, a bushy tail held low · HOWL (head thrown back, muzzle up, the throat out) in every view · wind = the crouch · act = the
   lunge-bite (jaws wide, fangs bared) · TG1's grey-brown palette, its elite & lord rows ---------------- */
SPR2.tpl.alpha={ r0:9.63, cx0:15, cy0:12, eyeL:'k',
  sel:(en,pose)=>en.howl>0?'howl':en.st==='wind'?'wind':en.st==='act'?'act':en.mv?'walk':'idle',   // (howl: the 1.0 s head-up & the 0.7 s after — ePose's own test)
  pal:{d:'#4a3a2c', m:'#7a6650', l:'#a08c70', h:'#c8b494', w:'#e8e0cc', k:'#e8a030', r:'#2e2219', o:'#1c1008', t:'#f4ecd8'},
  elite:{d:'#3a2a30', m:'#605060', l:'#8a7a88', h:'#b0a0ac'}, boss:{d:'#2a2020', m:'#4a3c3c', l:'#6a5c5c', h:'#8a7c7c'} };
(function(){
  const T=SPR2.tpl.alpha;
  const row=(W,parts)=>{ const a=Array(W).fill('.'); for(const [x,s] of parts) for(let i=0;i<s.length;i++) if(x+i>=0&&x+i<W) a[x+i]=s[i]; return a.join(''); };   // (parts in order: far legs first, near legs over them)
  const R=(W,L)=>L.map(p=>row(W,p)), put=(rows,parts)=>{ const o=rows.map(r=>r.split('')); for(const [x,y,s] of parts) for(let i=0;i<s.length;i++) o[y][x+i]=s[i]; return o.map(r=>r.join('')); };   // (put overwrites — '.' clears)
  const lift=(rows,x0,x1,y0,y1,dy)=>{ const o=rows.map(r=>r.split('')), c=rows.map(r=>r.split('')); for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) o[y][x]='.';
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++){ const n=y+dy; if(n>=0&&n<o.length&&c[y][x]!=='.') o[n][x]=c[y][x]; } return o.map(r=>r.join('')); };   // (a block of texels moved dy rows)
  // ---- side (facing right) 28 × 19: a 14-row body on 5 rows of legs ----
  const body=[
'.....................d.d....',
'....................dmdmd...',
'...................ddmmmmd..',
'..............r.r.rdmlwlmd..',
'.............rrrrrrdmllkmmd.',
'........ddddrrrmrrrmllllwmmo',
'......ddmhhllmrmrrrmllmwwwd.',
'....ddmmlllllmmmrmrrrrmddoo.',
'..ddmmmmmmmmmmmmmrrrrrrwwd..',
'.dmmmmmmmmmmmmmmmmrrrrrwd...',
'dmlmd.dmmmmmmmmmmmmrrrrd....',
'dmlmd.ddmmmmmmmmmmmmmrd.....',
'dmmd...dmwwwwwwwwwmmmd......',
'.dd....dmmdwwwwwwdmmdmd.....'];
  const L=(a,b,c,d,top)=>[[12+a,'dmd'],[21+b,'dmd'],[7+c,top?'dmmd':'dmd'],[17+d,top?'dmmd':'dmd']];   // far hind · far front · near hind · near front
  const P=(a,b,c,d)=>[[12+a,'oo'],[21+b,'oo'],[7+c,'oo'],[17+d,'ooo']];
  const legs=R(28,[L(0,0,0,0,1),L(0,0,0,0),L(0,0,0,0),L(0,0,0,0),P(0,0,0,0)]);
  const legsA=R(28,[L(0,0,0,0,1),L(0,0,-1,0),L(1,-1,-1,1),L(1,-1,-2,1),P(1,-1,-2,1)]);   // near hind back · near front forward
  const legsB=R(28,[L(0,0,0,0,1),L(0,0,1,0),L(-1,1,1,-1),L(-1,1,2,-1),P(-1,1,2,-1)]);   // …and the other way
  const legsP=R(28,[L(0,0,0,0,1),L(0,0,0,0),L(0,0,0,0),P(0,0,0,0)]);                   // passing (the bob)
  const wind=lift(['.'.repeat(28),'.'.repeat(28),'.'.repeat(28)].concat(body),18,27,3,13,2).concat(R(28,[[[12,'dd'],[21,'dd'],[5,'dmmd'],[16,'dmmmd']],[[11,'oo'],[22,'oo'],[4,'ooo'],[17,'oooo']]]));   // the crouch: sunk 3, the head 2 lower still, legs folded
  const act=put(spr2F(body,R(28,[L(0,-1,-1,1,1),L(1,0,-2,2),L(2,1,-3,3),[[15,'dd'],[23,'dd'],[3,'dmd'],[21,'dmd']],[[15,'oo'],[24,'oo'],[2,'oo'],[22,'ooo']]])),
    [[18,3,'rdmlwlmd..'],[18,4,'rdmllkmmd.'],[18,5,'rmllllwmmo'],[18,6,'rmllmtttd.'],[18,7,'rrdoooo...'],[18,8,'rrrdtttd..'],[18,9,'rrrdwwd...']]);   // the lunge-bite: jaws wide, fangs bared, legs flung
  const howl=put(body,[[16,0,'.........oo.'],[16,1,'........dmmd'],[16,2,'.......dmlo.'],[16,3,'..dd..dmllot'],[16,4,'.rdmddmlklwd'],[16,5,'rrdmmllllwwd'],[16,6,'rrrdmlllwwwd'],[16,7,'rrrrdmlwwwd.'],[16,8,'rrrrrdwwwd..'],[16,9,'rrrrrwwwd...']]);   // head thrown back, ears laid flat
  T.S={ idle:[spr2F(body,legs),spr2F(lift(body,0,4,10,13,-1),legs)], walk:[spr2F(body,legsA), spr2Bob(body,legsP), spr2F(body,legsB), spr2Bob(body,legsP)], wind, act, howl:[spr2F(lift(howl,16,27,0,9,1),legs), spr2F(howl,legs)] };   // (the idle flicks its tail · the howl stretches up)
  // ---- front (toward the camera) 18 × 19 (PX2 FIX: a wolf, not a cat) — tall ears, a narrower brow with the dark widow's peak, pale brows, the scar over its left eye
  //      · the long pale muzzle tapering to the nose at its tip, the cheek tufts flaring into the dark ruff, the pale bib ----
  const s9=L=>L.map(x=>x+[...x].reverse().join(''));   // (PX K7a: a left half of 9 → the 18-wide row, mirrored)
  const fb=s9(['.........','...d.....','..dld....','..dlld...','..dlmmdmm','...ddmlll','...dmllld','..dmmdkll','.rdmmmmlw','rrrdmmmlw','.rrrdmmlw','.rrrrdmwo','..rrrrddw','...ddmwww']).map((x,i)=>i===5?x.slice(0,6)+'w'+x.slice(7):x);   // (PX K7a: a wolf's front — ears lower & wider, the stop, the long muzzle, a narrower ruff; the old scar over its left eye · PX Z0: the pale muzzle a narrow snout to a 2-texel nose, not a square box)
  const fl=R(18,[[[2,'dd'],[14,'dd'],[4,'dmd'],[11,'dmd']],[[2,'d'],[15,'d'],[4,'dmd'],[11,'dmd']],[[4,'dmd'],[11,'dmd']],[[4,'dmd'],[11,'dmd']],[[4,'ooo'],[11,'ooo']]]);
  const flB=R(18,[[[2,'dd'],[14,'dd'],[4,'dmd'],[11,'dmd']],[[4,'dmd'],[11,'dmd']],[[4,'dmd'],[11,'dmd']],[[4,'ooo'],[11,'ooo']]]);
  const E=()=>'.'.repeat(18);
  const fwind=[E(),E(),E(),E(),E(),row(18,[[0,'ddd'],[6,'dmmmmd'],[15,'ddd']])].concat(put(fb.slice(4),[[1,0,'.dd'],[14,0,'dd.']])).concat(R(18,[[[2,'dmd'],[13,'dmd']],[[1,'dmd'],[14,'dmd']],[[1,'ooo'],[14,'ooo']]]));   // crouched at you: sunk 2, ears laid back, elbows out
  const fact=spr2F(put(fb,[[1,11,'rrrrdtooootdrrrr'],[2,12,'rrrrdoooodrrrr'],[3,13,'ddmtwwwwtmdd']]),R(18,[[[2,'dd'],[14,'dd'],[3,'dmd'],[12,'dmd']],[[2,'dmd'],[13,'dmd']],[[2,'dmd'],[13,'dmd']],[[1,'dmd'],[14,'dmd']],[[1,'ooo'],[14,'ooo']]]));   // jaws wide at you, fangs bared, legs braced
  const fh=R(18,[[[8,'oo']],[[7,'dmmd']],[[6,'dmoomd']],[[1,'dd'],[15,'dd'],[5,'dmtootmd']],[[1,'dmd'],[14,'dmd'],[4,'dmmwwwwmmd']],[[1,'r'],[16,'r'],[2,'dmlkmwwwwmklmd']],[[0,'rr'],[16,'rr'],[2,'dmmllwwwwllmmd']],
    [[0,'rrr'],[15,'rrr'],[3,'dmmwwwwwwmmd']],[[0,'rrrr'],[14,'rrrr'],[4,'dmwwwwwwmd']],[[0,'rrrrr'],[13,'rrrrr'],[5,'dwwwwwwd']],[[1,'rrrrrdwwwwdrrrrr']],[[1,'rrrrdmwwwwmdrrrr']],[[2,'rrrdwwwwwwdrrr']],[[3,'ddmwwwwwwmdd']]]);   // the howl from the front: muzzle up, the throat, the open mouth on top
  T.D={ idle:[spr2F(fb,fl),spr2F(put(fb,[[14,1,'.'],[15,1,'d']]),fl)], walk:[spr2F(fb,fl), spr2Bob(fb,flB), spr2F(fb,fl), spr2Bob(fb,flB)], wind:fwind, act:fact, howl:[spr2F(fh,fl), spr2F(put(fh,[[6,2,'dooood']]),fl)] };   // (an ear twitches · the howl's mouth opens wider)
  // ---- back (away) 18 × 19 (PX2 FIX: no face) — the head carried low behind the ruff (ears from row 2, so the HOWL's head rises 2 rows over it), the dark ruff's jagged
  //      edge flowing into ONE 3-wide saddle down the spine, one highlight on the near (upper-left) shoulder, the haunches, the bushy tail hanging to a pale tip ----
  const ub=[
'..................',
'..................',
'....d........d....',
'....dd......dd....',
'....dmd....dmd....',
'...dmmmmmmmmmmd...',
'...dmmmmmmmmmmd...',
'.rrrdmmmmmmmmdrrr.',
'rrrrrrmmmmmmrrrrrr',
'dlrrrrrrdddrrrrrrd',
'dllrmrmmdddmmrmrmd',
'dlmmmmmmdddmmmmmdd',
'.dmmmmmmdddmmmmdd.',
'.ddmmmmmmdmmmmddd.'];
  const ul=R(18,[[[2,'dmd'],[7,'dmmd'],[13,'dmd']],[[2,'dmd'],[7,'dmmd'],[13,'dmd']],[[2,'dmd'],[6,'dmmmmd'],[13,'dmd']],[[2,'dmd'],[7,'dhhd'],[13,'dmd']],[[2,'oo'],[8,'hh'],[14,'oo']]]);
  const ulB=R(18,[[[2,'dmd'],[7,'dmmd'],[13,'dmd']],[[2,'dmd'],[6,'dmmmmd'],[13,'dmd']],[[2,'dmd'],[7,'dhhd'],[13,'dmd']],[[2,'oo'],[8,'hh'],[14,'oo']]]);
  const ulT=R(18,[[[2,'dmd'],[7,'dmmd'],[13,'dmd']],[[2,'dmd'],[8,'dmmd'],[13,'dmd']],[[2,'dmd'],[7,'dmmmmd'],[13,'dmd']],[[2,'dmd'],[8,'dhhd'],[13,'dmd']],[[2,'oo'],[9,'hh'],[14,'oo']]]);   // (the idle's tail sway)
  const uwind=[E(),E(),E(),E(),E(),E(),row(18,[[3,'dd'],[6,'dmmmmd'],[13,'dd']])].concat(put(ub.slice(5,14),[[2,0,'dd'],[14,0,'dd']])).concat(R(18,[[[0,'dmd'],[6,'dmmmmd'],[15,'dmd']],[[0,'dmd'],[7,'dhhd'],[15,'dmd']],[[0,'ooo'],[8,'hh'],[15,'ooo']]]));   // crouched, from behind: ears laid back, haunches out
  const uact=spr2F(put(ub,[[0,2,'..................'],[0,3,'..................'],[0,4,'...dd.dmmmmd.dd...'],[2,5,'dd'],[14,5,'dd']]),R(18,[[[1,'dmd'],[7,'dmmd'],[14,'dmd']],[[0,'dmd'],[7,'dmmd'],[15,'dmd']],[[0,'dmd'],[6,'dmmmmd'],[15,'dmd']],[[0,'dd'],[7,'dhhd'],[16,'dd']],[[0,'oo'],[8,'hh'],[16,'oo']]]));   // lunging away: ears laid back, legs flung wide
  const uh=put(ub,[[0,0,'........oo........'],[0,1,'.......dmmd.......'],[0,2,'.......dmmd.......'],[0,3,'......dmmmmd......'],[0,4,'......dmmmmd......'],[0,5,'.dd..dmmmmmmd..dd.'],[0,6,'.dmddmmmmmmmmddmd.']]);   // the howl from behind: the head thrown up — its wedge 2 rows over the idle's ears, the ears laid back
  T.U={ idle:[spr2F(ub,ul),spr2F(ub,ulT)], walk:[spr2F(ub,ul), spr2Bob(ub,ulB), spr2F(ub,ul), spr2Bob(ub,ulB)], wind:uwind, act:uact, howl:[spr2F(lift(uh,0,17,0,6,1),ul), spr2F(uh,ul)] };
  T.D.cx0=T.U.cx0=9;   // (the front & back views' centre: PX_T.hop)
})();
/* ---------------- CLAM (PX K1 · px_art §5.2): a giant clam, one drawing every way (faces:'D') — a fat tan shell of four heavy flutes, the valves meeting in a deep
   ZIG-ZAG (its signature) · idle = shut · glow (the tell): the seam flickers pale gold before it gapes · open: the top valve tilts back — the frilled mantle, its two
   bright eyes, the PEARL (the "hit me now") · fired: open, the mouth empty ---------------- */
SPR2.tpl.clam={ r0:8.15, cx0:9, cy0:10, faces:'D', eyeL:'k',
  sel:(en,pose)=>en.st==='open'?(en.fired?'fired':'open'):pose===2&&(en.tmr>0||en.hs>0||en.kd>0||en.stun>0||en.brk>0||en.stl>0)?'glow':'idle',   // (glow only while it's really about to gape: an idle clam's timer runs on below 0 and it never opens — no false tell · held / knocked / stunned / BROKEN / startled, its timer runs out & it gapes the moment it's free: it glows till then)
  pal:{d:'#6e5434', m:'#b8945a', l:'#d8b47a', h:'#f0d8a0', r:'#8a6e44', i:'#2a1420', I:'#7a3a5a', p:'#f0e6d2', P:'#ffffff', g:'#ffd23f', G:'#fffbe0', k:'#a8f0e8'},
  elite:{d:'#3a3a5a', m:'#7a7aa8', l:'#a0a0d0', h:'#d0d0f0', r:'#5a5a80'} };   // (the elite: a "blue-lip clam")
(function(){
  const T=SPR2.tpl.clam, Z=[1,0,-1,-1,0,1];   // (the rim's zig-zag: the top valve ends on row 9+Z[x%6], the seam one below)
  const SH=[
'..................',
'..................',
'......hhhlll......',
'....hhhhhlllll....',
'..hhhhhhrhllmmmm..',
'.hhhllrhrhlrlmmmd.',
'hhhlmdhmdlhmdllmmd',
'hhlmdhhmdlhlmdlmmd',
'hlmdlhhmdllhlmdlmd',
'hliilhlmiilhlmiimd',
'lilmillilmilmimdim',
'.mmlmiimlmmiimmdd.',
'ddmmlmdmlmmdmmdddd',
'.dmmmldmlmmdmdddd.',
'..dmmmldlmdmdddd..',
'....dddddddddd....'];
  const glow=f=>SH.map((r,y)=>r.replace(/./g,(c,x)=>{ const sy=10+Z[x%6]; return c==='.'?c:y===sy?(f||x%2===0?'G':'g'):y===sy+1?(f||x%2===0?'g':'d'):y===sy-1?'d':c; }));   // (the seam lit gold & white, framed dark above & below so it reads at 1×, a texel thick on every other column · frame 2 flares: white over a full gold line — it flickers)
  const OP=[
'......hhhlll......',
'....hhhhhlllll....',
'.hhhllrhrhlrlmmmd.',
'hhhlmdhmdlhmdllmmd',
'hhlmdhhmdlhlmdlmmd',
'hlmdlhhmdllhlmdlmd',
'hlIIlhlmIIlhlmIImd',
'lIiikllIPpIlmkiiIm',
'IiiiiIIippiIIiiiiI',
'IiIIiiiiIIiiiiIIiI',
'IIlmIiiIlmIiiImdII',
'ImmlmIImlmmIImmddI',
'ddmmlmdmlmmdmmdddd',
'.dmmmldmlmmdmdddd.',
'..dmmmldlmdmdddd..',
'....dddddddddd....'];
  const OP2=spr2Over(OP,['IIiiIIIippIIIiiiII'],0,8);   // (the mantle breathes)
  const FI=spr2Over(OP,['ii','ii'],8,7);
  T.D={ idle:SH, glow:[glow(0),glow(1)], open:[OP,OP2], fired:FI };
})();
/* ---------------- REEFSPIKE (PX K1 · px_art §5.3): a hunched reef brute — a lumpy dome back crusted with barnacles & coral, a crest of spines, a heavy frowning
   jaw with a tusk, small yellow eyes, knuckle-walking on a spiked fist · wind: it rears back, the fist drawn under · act: the fist thrust out (the jab) · rec: it sags,
   eyes shut · BRISTLE (the tell): the spines stand tall & shiver — alt spk turns them GOLD in every frame ---------------- */
SPR2.tpl.reefspike={ r0:9.26, cx0:11, cy0:10, eyeL:'y',
  sel:(en,pose)=>en.st==='wind'?'wind':en.st==='act'?'act':en.st==='recover'?'rec':en.spk>0?'bristle':en.mv?'walk':'idle',
  alt:{key:'spk', pal:{s:'#ffd23f', t:'#fff0a0'}},
  pal:{d:'#2a363c', m:'#46565c', l:'#66787e', h:'#8ea0a4', s:'#8a9aa0', t:'#c8d4d8', b:'#d8d0b8', c:'#c86a5a', k:'#16080a', y:'#e8d878'},
  elite:{d:'#3a2030', m:'#6a3a52', l:'#8a5a70', h:'#b08098'} };   // (the elite: "fire coral")
(function(){
  const T=SPR2.tpl.reefspike, O=spr2Over, E=w=>'.'.repeat(w), pts=(w,h,L)=>{ const g=Array(h).fill(0).map(()=>E(w).split('')); for(const [x,y,c] of L) g[y][x]=c; return g.map(r=>r.join('')); };
  /* ---- the profile (facing right) 24 × 17 ---- */
  const B=[E(24),E(24),E(24),E(24),
'......hhhhlll...........',
'....hhbbhlllllm.........',
'...hhhbhllllclmm........',
'..lhhhllllllllmmmlll....',
'.lhllllllbbmmmmmdlddll..',
'dllllllmmbmmmmmmdmkymll.',
'dllmmcmmmmmmmmmmdmmmmbmm',
'dmmmmmmmkmmmmcmmmmkkkbkk',
'.dmmmmmmmmmmmmmmmkmmmmmd',
'...dddmmmmmmmmmmddddddd.',E(24),E(24),E(24)];
  const SP=pts(24,17,[[4,4,'s'],[3,3,'t'],[7,3,'s'],[6,2,'s'],[5,1,'t'],[10,3,'s'],[9,2,'t'],[13,4,'s'],[12,3,'s'],[11,2,'t'],[16,6,'s'],[15,5,'t'],[19,6,'t'],[2,6,'s'],[1,5,'t']]);   // laid back
  const BR=pts(24,17,[[4,4,'s'],[4,3,'s'],[3,2,'s'],[3,1,'t'],[7,3,'s'],[7,2,'s'],[7,1,'s'],[7,0,'t'],[10,3,'s'],[10,2,'s'],[10,1,'s'],[10,0,'t'],[13,4,'s'],[13,3,'s'],[13,2,'s'],[14,1,'s'],[14,0,'t'],[16,6,'s'],[16,5,'s'],[16,4,'s'],[15,3,'t'],[19,6,'s'],[19,5,'s'],[20,4,'t'],[2,6,'s'],[2,5,'s'],[1,4,'s'],[1,3,'t']]);   // BRISTLING: tall
  const BR2=pts(24,17,[[4,4,'s'],[4,3,'s'],[5,2,'s'],[5,1,'t'],[7,3,'s'],[7,2,'s'],[8,1,'s'],[8,0,'t'],[10,3,'s'],[10,2,'s'],[11,1,'s'],[11,0,'t'],[13,4,'s'],[13,3,'s'],[13,2,'s'],[12,1,'s'],[12,0,'t'],[16,6,'s'],[16,5,'s'],[17,4,'s'],[17,3,'t'],[19,6,'s'],[19,5,'s'],[19,4,'t'],[2,6,'s'],[2,5,'s'],[3,4,'s'],[3,3,'t']]);   // (the shiver: the tips sway)
  const L0=[E(24),'...dmd...dmd....dmmd....','...dmd...dmd....dlmmt...','..dddd..dddd....dddd....'];   // legs & the knuckle-fist, standing
  const LA=[E(24),'..dmd.....dmd....dmmd...','.dmd......dmd....dlmmt..','.ddd......dddd...dddd...'];
  const LC=[E(24),'....dmd.dmd....dmmd.....','....dmd.dmd....dlmmt....','...dddd.ddd....dddd.....'];
  const LB=[E(24),E(24),'...dmd...dmd....dlmmt...','..dddd..dddd....dddd....'];   // (the bob)
  const LW=[E(24),'...dmd...dmd.dmmd.......','...dmd...dmd.dlmmt......','..dddd..dddd.dddd.......'];   // wind: the fist drawn back under
  const LX=[E(24),'.dmd....dmd.............','dmd.....dmd.............','ddd.....dddd............'];   // act: braced
  const AX=pts(24,17,[[19,13,'m'],[20,13,'m'],[21,13,'l'],[22,13,'l'],[23,13,'t'],[18,14,'d'],[19,14,'m'],[20,14,'m'],[21,14,'m'],[22,14,'m'],[23,14,'t'],[19,15,'d'],[20,15,'d'],[21,15,'d'],[22,15,'d']]);   // the jab: the fist out under the jaw
  const LR=[E(24),E(24),'...dmd...dmd.....dmmt...','..dddd..dddd.....dddd...'];   // rec: sagged, the fist dragging
  const ROAR=pts(24,17,[[17,11,'k'],[18,11,'k'],[19,11,'k'],[20,11,'b'],[21,11,'k'],[22,11,'k'],[17,12,'k'],[18,12,'k'],[19,12,'k'],[20,12,'k'],[21,12,'k'],[22,12,'m'],[16,13,'d'],[17,13,'m'],[18,13,'m'],[19,13,'m'],[20,13,'b'],[21,13,'m'],[22,13,'d']]);   // wind: it roars as it rears — the jaw drops, the tusk bared
  const leg=(body,L)=>O(body,L,0,13), S=(sp,dx,dy)=>spr2Shift(O(B,sp,0,0),dx,dy), shut=r=>spr2Rep(r,{y:'d'});
  T.S={ idle:leg(S(SP,0,0),L0), walk:[leg(S(SP,0,0),LA),leg(S(SP,0,1),LB),leg(S(SP,0,0),LC),leg(S(SP,0,1),LB)],
    wind:leg(O(S(SP,-1,0),ROAR,0,0),LW), act:O(leg(S(SP,1,0),LX),AX,0,0), rec:shut(leg(S(SP,0,1),LR)), bristle:[leg(S(BR,0,0),L0),leg(S(BR2,0,0),L0)] };
  /* ---- toward the camera 19 × 18 (the face low on the mound: brows, eyes, the frown & two tusks) · from behind (a barnacled back) ---- */
  const BD=[E(19),E(19),E(19),E(19),
'......hhhhlll......',
'....hhbbhlllllm....',
'...hhhbhllllclmm...',
'..lhhllllllllmmmm..',
'.lhlllbbllllmmmmmd.',
'.llmdddmmmmmdddmmd.',
'dlmmmymmmmmmmymmmmd',
'dlmmmmmmmmmmmmmmmmd',
'dmmmmmkbkkkbkmmmmmd',
'.dmmmkmmmmmmmkmmmd.',
'..ddmmmmmmmmmmmdd..',
'....ddddddddddd....',E(19),E(19)];
  const BU=[E(19),E(19),E(19),E(19),
'......hhhhlll......',
'....hhhhhlllllm....',
'...hhbbhlllllllm...',
'..lhhbllllcllmmmm..',
'.lhlllllllllmmmmmd.',
'.llllbbllmmmmmmmmd.',
'dllmmbmmmmmmcmmmmmd',
'dlmmmmmmmmmmmmmmmmd',
'dmmmmcmmmmmmmmbbmmd',
'.dmmmmmmmmmmmmmbmd.',
'..ddmmmmmmmmmmmdd..',
'....ddddddddddd....',E(19),E(19)];
  const SPD=pts(19,18,[[9,3,'s'],[9,2,'t'],[7,3,'s'],[6,2,'t'],[11,3,'s'],[12,2,'t'],[5,4,'s'],[4,3,'t'],[13,4,'s'],[14,3,'t'],[2,6,'s'],[1,5,'t'],[16,6,'s'],[17,5,'t']]);
  const BRD=pts(19,18,[[9,3,'s'],[9,2,'s'],[9,1,'s'],[9,0,'t'],[7,3,'s'],[7,2,'s'],[6,1,'s'],[6,0,'t'],[11,3,'s'],[11,2,'s'],[12,1,'s'],[12,0,'t'],[5,4,'s'],[4,3,'s'],[3,2,'s'],[3,1,'t'],[13,4,'s'],[14,3,'s'],[15,2,'s'],[15,1,'t'],[2,6,'s'],[1,5,'s'],[1,4,'s'],[0,3,'t'],[16,6,'s'],[17,5,'s'],[17,4,'s'],[18,3,'t']]);
  const BRD2=pts(19,18,[[9,3,'s'],[9,2,'s'],[10,1,'s'],[10,0,'t'],[7,3,'s'],[7,2,'s'],[7,1,'s'],[7,0,'t'],[11,3,'s'],[11,2,'s'],[11,1,'s'],[11,0,'t'],[5,4,'s'],[4,3,'s'],[4,2,'s'],[4,1,'t'],[13,4,'s'],[14,3,'s'],[14,2,'s'],[14,1,'t'],[2,6,'s'],[1,5,'s'],[2,4,'s'],[1,3,'t'],[16,6,'s'],[17,5,'s'],[16,4,'s'],[17,3,'t']]);
  const AL=['dm.................','dmmd...............','tlmd...............','dddd...............'], AR=['.................md','...............dmmd','...............dlmt','...............dddd'];   // the arms hang to the knuckles
  const LG0=[E(19),E(19),'......dm...md......','.....ddd...ddd.....'];
  const LGa=[E(19),'......dm...........','.....ddd...md......','...........ddd.....'], LGc=[E(19),'...........md......','......dm...ddd.....','.....ddd...........'];
  const ARU=pts(19,18,[[15,6,'d'],[16,6,'d'],[17,6,'d'],[18,6,'t'],[15,7,'d'],[16,7,'l'],[17,7,'m'],[18,7,'d'],[15,8,'d'],[16,8,'m'],[17,8,'m'],[18,8,'d'],[16,9,'d'],[17,9,'m'],[17,10,'d']]);   // wind: the fist cocked up by the head
  const ARX=pts(19,18,[[11,12,'d'],[12,12,'d'],[13,12,'d'],[14,12,'d'],[15,12,'d'],[11,13,'d'],[12,13,'l'],[13,13,'l'],[14,13,'m'],[15,13,'d'],[11,14,'d'],[12,14,'t'],[13,14,'m'],[14,14,'t'],[15,14,'d'],[11,15,'d'],[12,15,'d'],[13,15,'d'],[14,15,'d'],[15,15,'d']]);   // act: the fist at you
  const fr=(body,sp,dy,legs,al,ar,ov)=>{ let r=spr2Shift(O(body,sp,0,0),0,dy); r=O(r,legs,0,14); if(al) r=O(r,AL,0,14); if(ar) r=O(r,AR,0,14); if(ov) r=O(r,ov,0,0); return r; };
  T.D={ idle:fr(BD,SPD,0,LG0,1,1), walk:[fr(BD,SPD,0,LGa,1,1),fr(BD,SPD,1,LG0,1,1),fr(BD,SPD,0,LGc,1,1),fr(BD,SPD,1,LG0,1,1)],
    wind:fr(BD,SPD,0,LG0,1,0,ARU), act:fr(BD,SPD,0,LG0,1,0,ARX), rec:shut(fr(BD,SPD,1,LG0,1,1)), bristle:[fr(BD,BRD,0,LG0,1,1),fr(BD,BRD2,0,LG0,1,1)] };
  T.U={ idle:fr(BU,SPD,0,LG0,1,1), walk:[fr(BU,SPD,0,LGa,1,1),fr(BU,SPD,1,LG0,1,1),fr(BU,SPD,0,LGc,1,1),fr(BU,SPD,1,LG0,1,1)],
    wind:fr(BU,SPD,0,LG0,1,0,ARU), act:fr(BU,SPD,-1,LG0,1,0), rec:fr(BU,SPD,1,LG0,1,1), bristle:[fr(BU,BRD,0,LG0,1,1),fr(BU,BRD2,0,LG0,1,1)] };
  T.D.cx0=T.U.cx0=9; T.D.cy0=T.U.cy0=11;
})();
/* ---------------- SPORELING (PX K1 · px_art §5.5): a waddling toadstool — a big spotted purple cap on a pale stalk, a shy face under the brim (D, S), stubby feet ·
   wind (the tell): it squashes down & spreads · act: the hop — stretched, feet off the ground · SPENT (burst): the cap split open, dark inside, dulled (its own letters D M L H),
   in every pose ---------------- */
SPR2.tpl.sporeling={ r0:6.67, cx0:8, cy0:12, eyeL:'k',
  sel:(en,pose)=>{ const w=en.st==='wind', a=en.st==='act'; return en.spB ? (w?'spentWind':a?'spentAct':en.mv?'spentWalk':'spent') : w?'wind':a?'act':en.mv?'walk':'idle'; },
  pal:{d:'#6a44a0', m:'#9a6ad0', l:'#b890e8', h:'#e0c8ff', p:'#f4e6ff', S:'#ecdcc4', s:'#c8b49a', k:'#24102e', i:'#2e1440', I:'#4a2a66', D:'#4a3070', M:'#7a5a9a', L:'#9a7ab8', H:'#c0a8d8'},
  elite:{d:'#8a2a3a', m:'#c84a5a', l:'#e87a7a', h:'#ffc0c0', p:'#fff0e0', D:'#671f2b', M:'#963743', L:'#ae5b5b', H:'#bf9090'} };   // (the elite: a "fly agaric" — red cap, white spots · spent, its red dulled ×0.75, never the normal's purple)
(function(){
  const T=SPR2.tpl.sporeling, O=spr2Over, X=17, E='.'.repeat(X), blank=()=>Array(17).fill(E);
  const CAP=[                // the cap, 15 wide, 8 rows
'......lllll......',
'....lhhlllllm....',
'...lhhplllmpmm...',
'..lhhhllllmmmmm..',
'.lhpphllllmmpmmd.',
'.llhllllpplmmmmd.',
'.dlllmmmmmmmmmdd.',
'..ddddddddddddd..'];
  const CAPB=[E].concat(CAP.slice(1));   // (breathing: its crown sinks a row)
  const CAPQ=[               // squashed: a row lower & a column wider each side, 7 rows
'.....lllllll.....',
'...lhhhllllmmm...',
'.llhhpllllmpmmm..',
'lhhpphllllmmpmmd.',
'llhlllllpplmmmmdd',
'dlllmmmmmmmmmmddd',
'.ddddddddddddddd.'];
  const CR=['.......Ii........','......IiiI.......','.....I.ii.I......','........i........'];      // SPENT: the split crown
  const CRQ=['.......Ii........','.....IiiiI.......','.......ii........'];
  const ST={ D:['......sssss......','......SkSks......','......SSSSs......','.....SSSSSss.....','.....sSSSSss.....'],   // the stalk: the shy face under the brim
             S:['......sssss......','......SSSks......','......SSSSs......','.....SSSSSss.....','.....sSSSSss.....'],   // (one eye toward its way)
             U:['......sssss......','......SSSSs......','......SSSSs......','.....SSSSSss.....','.....sSSSSss.....'] };
  const FT={ D:['....sSs...sSs....','....sss...sss....'], S:['....sSs...sSs....','....sss...ssss...'], U:['....sSs...sSs....','....sss...sss....'] };
  const FL=['....sSs..........','....sss...sSs....'], FR=['..........sSs....','....sSs...sss....'], FW=['...sSs.....sSs...','..ssss.....ssss..'], FH=['....sSs...sSs....'];
  const mk=(cap,cy,st,sy,ft,fy,dx)=>{ let r=blank(); r=O(r,st,0,sy); r=O(r,ft,0,fy); r=O(r,dx?spr2Shift(cap,dx,0):cap,0,cy); return r; };
  const view=v=>{ const st=ST[v], ft=FT[v], A=mk(CAP,2,st,10,ft,15), B=mk(CAPB,2,st,10,ft,15);
    const wind=mk(CAPQ,4,st.slice(1),11,FW,15), act=mk(CAP,0,st.concat([st[4]]),8,FH,14);   // wind: squashed, spread · act: stretched up off the ground (feet tucked)
    const wk=[mk(CAP,2,st,10,FL,15), spr2Shift(mk(CAP,2,st,10,ft,15,1),0,-1), mk(CAP,2,st,10,FR,15), spr2Shift(mk(CAP,2,st,10,ft,15,-1),0,-1)];   // the waddle-hop
    const sp=r=>spr2Rep(r,{d:'D',m:'M',l:'L',h:'H'}), cr=(r,y)=>sp(O(r,CR,0,y));   // (spent: the cap re-lettered to its dulled ramp)
    return { idle:[A,B], walk:wk, wind, act, spent:[cr(A,2),cr(B,3)], spentWalk:[cr(wk[0],2),cr(wk[2],2)], spentWind:sp(O(wind,CRQ,0,4)), spentAct:cr(act,0) }; };
  T.D=view('D'); T.S=view('S'); T.U=view('U');
})();
/* ---------------- TRAINING DUMMY (PX K1 · px_art §5.25): the Proving Grounds' straw man, one drawing every way (faces:'D') — a burlap head with stitched X eyes &
   a straw topknot, a crossbar of arms with straw bursting at the wrists, a twine-banded sack with a painted target, on a post (a hit reads by the bake's flash) ---------------- */
SPR2.tpl.dummy={ r0:8.15, cx0:10, cy0:15, faces:'D',
  pal:{d:'#8a6a3a', m:'#b8925a', l:'#d4b070', h:'#e8cc90', w:'#4a3018', W:'#6e4a26', s:'#ceb05a', S:'#e8d08a', t:'#8a6a3a', r:'#c83a2a', R:'#f2e6c8', k:'#3a2410'} };   // (lint: the straw s a shade more golden than #c8a860 — at night it fell ΔE 9.8 from the sack)
(function(){
  SPR2.tpl.dummy.D={ idle:[
'........s.S.s........',
'......hhhhllllm......',
'.......hhhlllm.......',
'.....lklklllklkm.....',
'.....llklllllklm.....',
'.....lklklllklkm.....',
'.....lllllllllmm.....',
'......llkkkkkmm......',
'.S......ttttt......S.',
'SsWWWWhllllllmmWWWWsS',
'sSwwwwhlllllmmdwwwwSs',
'.s....ttttttttt....s.',
'......hllrrrmmd......',
'......llrRRRrmd......',
'......llrRrRrmd......',
'......llrRRRrmd......',
'......lllrrrmmd......',
'......ttttttttt......',
'.......lmmmmmd.......',
'........sWwws........',
'.........Www.........',
'.......dwWwwwd.......'] };
})();
/* ---------------- TIDECALLER (PX K2 · px_art §5.6): a hunched drowned acolyte — a deep kelp-green hood (its grey drowned face & two teal eyes inside), strands of
   kelp hung from the shoulders, a ragged robe, the TIDE-PEARL cupped at its chest · walk: a glide (no legs — the hem ripples) · wind: the pearl drawn back over
   its shoulder · act: thrust at you · CAST (the tell — the drowned are coming): both arms up in a V, the pearl raised & pulsing, the eyes blazing (alt: cast) ---------------- */
SPR2.tpl.tidecaller={ r0:8.15, cx0:7, cy0:16, eyeL:'e',
  sel:(en,pose)=>en.cast>0?'cast':en.st==='wind'?'wind':en.st==='act'?'act':en.mv?'walk':'idle',   // (recover = idle)
  alt:{key:'cast', pal:{e:'#bfffe6', p:'#8fe0c0', P:'#e8fff6'}},   // (casting: the eyes & the pearl blaze)
  pal:{d:'#22463e', m:'#3a7a66', l:'#58987f', h:'#80bca4', k:'#0c1a16', f:'#a8c4b8', e:'#5fd8c0', p:'#3fae9e', P:'#8fe0c0', W:'#e8fff6', g:'#2a5a2a', G:'#5a9a3a'},
  elite:{d:'#2a2040', m:'#3e3462', l:'#56487e', h:'#7a6aa8'} };   // (the elite: a "deep-caller" — the eyes, the pearl & its kelp stay as they were)
(function(){
  const T=SPR2.tpl.tidecaller, E=w=>'.'.repeat(w), sh=spr2Shift;
  const put=(rows,parts)=>{ const o=rows.map(r=>r.split('')); for(const [x,y,s] of parts) if(y>=0 && y<o.length) for(let i=0;i<s.length;i++) if(s[i]!==' ' && x+i>=0 && x+i<o[y].length) o[y][x+i]=s[i]; return o.map(r=>r.join('')); };   // (overwrites; ' ' keeps, '.' clears)
  const hem=(r,H)=>r.slice(0,r.length-2).concat(H);
  const HA=['lmdmdmdkdmdmmdd','.d.ddd.dd.ddd.d'], HB=['lmmdmdmkdmdmdmd','d.dd.dd.d.dd.d.'], HC=['ldmmdmdkdmmdmdd','.dd.d.ddd.dd.dd'];   // the hem's ripple
  /* ---- toward the camera 15 × 22 (3 rows of headroom for the cast's raised pearl; the hem on row 21 = cy0+5) ---- */
  const D0=[E(15),E(15),
'.......h.......',
'......hhm......',
'.....hhlmd.....',
'....hhllmmd....',
'...hlhhhhhmd...',
'..hlhkkkkkhmd..',
'..hlhkekekhmd..',
'..hlhkfffkhmd..',
'.GhllhkfkhmmdG.',
'.ghlllhhhmmmdg.',
'gGhlldmmmdmmdGg',
'gGlllfpPpfmmdGg',
'.GlllfPWPfmmdG.',
'.glllfpPpfmmdg.',
'.GllmmdkdmmmdG.',
'.hllmmdkdmmmmd.',
'.hlmmmdkdmmmmdd',
'hllmmmdkdmmmmmd'].concat(HA);
  const kel=(r,j)=>put(r,j?[[1,10,'g'],[13,10,'G'],[0,12,'Gg'],[13,12,'gG'],[1,15,'g'],[13,15,'G']]:[]);   // (the kelp sways)
  const DCH=[[5,12,'dmmmd'],[5,13,'fmmmf'],[5,14,'fmmmf'],[5,15,'mmmmm']];   // (the chest, the pearl gone from it)
  const Dwind=put(D0,DCH.concat([[0,4,'pPp'],[0,5,'PWP'],[0,6,'pPp'],[1,7,'f'],[1,8,'hl'],[1,9,'hl'],[1,10,'hl'],[1,11,'hl']]));   // the pearl drawn back over its shoulder
  const Dact=put(sh(D0,0,1),[[3,13,'dpPPPd'],[3,14,'fPWWWPf'],[3,15,'fPWWWPf'],[4,16,'pPPPp'],[3,12,'h'],[11,12,'d']]);   // thrust at you: the pearl big & low, the hood bowed
  const ARMS=[[0,0,'......pPp......'],[0,1,'.....fPWPf.....'],[0,2,'....ffpPpff....'],[0,3,'...fd.hhm.df...'],[0,4,'..fd.hhlmd.df..'],[0,5,'.fd.hhllmmd.df.'],[0,6,'ld.hlhhhhhmd.dm'],[0,7,'ld'],[13,7,'dm'],[0,8,'ld'],[13,8,'dm'],[0,9,'ld'],[13,9,'dm'],[0,10,'l'],[14,10,'m']], DCX=[[5,12,'mdkdm'],[5,13,'mdkdm'],[5,14,'mdkdm'],[5,15,'mdkdm']];   // (the arms raised off the robe's front)
  const Dc=put(D0,DCX.concat(ARMS));   // CAST: both arms up in a V — the sleeves fall back off pale drowned forearms — the pearl over the hood
  const Dc2=put(Dc,[[5,0,'P'],[9,0,'P'],[4,1,'p'],[10,1,'p']]);   // (it pulses)
  T.D={ idle:[D0, kel(hem(D0,HB),1)], walk:[hem(D0,HA), sh(hem(D0,HB),0,-1), hem(D0,HC), sh(hem(D0,HB),0,-1)], wind:Dwind, act:Dact, cast:[Dc,Dc2] };
  /* ---- from behind: the hood's back, the kelp down its back, a seam down the robe, the pearl's glow at its sides ---- */
  const U0=put(D0,[[4,6,'hhllmm'],[3,7,'hhlllmmm'],[3,8,'hlllmmmm'],[3,9,'hllmmmmd'],[2,10,'Ghllmmmmmd'],[2,11,'hllmGmmmmd'],[2,12,'llmmgmmdmd'],[2,13,'llmGmmmmmd'],[2,14,'lmmgmmGmmd'],[2,15,'lmmmmmgmmd'],[6,16,'mdmm'],[6,17,'mdmm'],[6,18,'mdmm'],[7,19,'d'],[1,13,'P'],[13,13,'p'],[1,14,'p']]);
  const Uwind=put(U0,[[0,4,'pPp'],[0,5,'PWP'],[0,6,'pPp'],[1,7,'m'],[1,8,'hl'],[1,9,'hl'],[1,10,'hl'],[1,11,'hl'],[1,13,'g'],[1,14,'G']]);
  const Uact=put(sh(U0,0,1),[[1,14,'G'],[1,15,'g'],[13,14,'g']]);
  const Uc=put(U0,ARMS.concat([[1,13,'g'],[1,14,'G'],[13,13,'g'],[5,12,'mmdmm'],[5,13,'mmdmm']]));
  const Uc2=put(Uc,[[5,0,'P'],[9,0,'P'],[4,1,'p'],[10,1,'p']]);
  T.U={ idle:[U0, kel(hem(U0,HB),1)], walk:[hem(U0,HA), sh(hem(U0,HB),0,-1), hem(U0,HC), sh(hem(U0,HB),0,-1)], wind:Uwind, act:Uact, cast:[Uc,Uc2] };
  /* ---- the profile (facing right) 15 × 22: hunched, the hood jutting forward with the face in it, the pearl held out before it ---- */
  const S0=[E(15),E(15),
'....hh.........',
'...hhlm........',
'...hlllmd......',
'..hllllmmd.....',
'..hlllllhhd....',
'..hllllhkkkh...',
'..hllllhkkek...',
'..hlllmhkffk...',
'.GhlllmmhkkG...',
'.ghllmmlllld...',
'gGhllmmmmmmlfpP',
'gGlllmmmmmdfPWP',
'.GlllmmmmmmdpPp',
'.glllmmmmmmmdG.',
'.GllmmmmmmmmdG.',
'.hllmmmmmmmmd..',
'.hlmmmmmmmmmdd.',
'hllmmmmmmmmmmmd'].concat(HA);
  const SCH=[[10,11,'d....'],[10,12,'dm...'],[10,13,'dm...'],[11,14,'d...']];
  const Swind=put(sh(S0,-1,0),SCH.concat([[0,5,'pPp'],[0,6,'PWP'],[0,7,'pPp'],[1,8,'f'],[1,9,'l'],[2,10,'h']]));   // leaning back, the pearl behind its shoulder
  const Sact=put(sh(S0,1,0),[[8,11,'llllh'],[10,12,'llfpP'],[11,13,'fPWW'],[11,14,'dpPP'],[12,15,'.p.']]);   // thrust: the arm out, the pearl at you
  const Sc=put(S0,SCH.concat([[9,0,'pPp'],[8,1,'fPWPf'],[8,2,'fpPpf'],[11,3,'f'],[11,4,'df'],[11,5,'df'],[11,6,'dl'],[11,7,'dl'],[11,8,'dl'],[10,9,'dl'],[9,10,'ld']]));   // CAST: the arms up before the hood, the pearl high
  const Sc2=put(Sc,[[8,0,'P'],[12,0,'P'],[7,1,'p'],[13,1,'p']]);
  T.S={ idle:[S0, kel(hem(S0,HB),1)], walk:[hem(S0,HA), sh(hem(S0,HB),0,-1), hem(S0,HC), sh(hem(S0,HB),0,-1)], wind:Swind, act:Sact, cast:[Sc,Sc2] };
})();
/* ---------------- THE DROWNED TIDECALLER (PX K2 · tidecallerBoss · px_art §5.6 + px_design §2.7's lord table): her own drawing at her true size (r0 12.59 — never
   a scaled acolyte) — a tall drowned priestess: a CORAL CROWN, long kelp hair down her back, a grey drowned face with teal eyes, a kelp sash, a tattered robe
   trailing water, a barnacled staff topped with the tide-pearl in a claw · idle: the hem sways, the pearl glimmers · CAST (a tide ring, a raising): she rises a
   texel, the staff thrust high & the pearl blazing, her other hand flung up, her hair lifting (alt: cast) · her blink is the old FX, her phases bossRoar's
   (bossTint washes her teal, pixBake draws the crimson line) ---------------- */
SPR2.tpl.tidecallerBoss={ r0:12.59, cx0:11, cy0:27, eyeL:'e',
  sel:(en,pose)=>en.cast>0?'cast':'idle',   // (she drifts — no walk · a BREAK's recover is idle for her)
  alt:SPR2.tpl.tidecaller.alt,
  pal:{d:'#10302e', m:'#1e5048', l:'#2e7064', h:'#4a9a88', c:'#ff8a6a', C:'#ffd0c0', w:'#6a5a3a', b:'#d8d0b8', k:'#0c1a16', f:'#8aaa9c', e:'#5fd8c0', p:'#3fae9e', P:'#8fe0c0', W:'#e8fff6', g:'#2a5a2a', G:'#5a9a3a'} };
(function(){
  const T=SPR2.tpl.tidecallerBoss;
  const put=(rows,parts)=>{ const o=rows.map(r=>r.split('')); for(const [x,y,s] of parts) if(y>=0 && y<o.length) for(let i=0;i<s.length;i++) if(s[i]!==' ' && x+i>=0 && x+i<o[y].length) o[y][x+i]=s[i]; return o.map(r=>r.join('')); };
  const up=r=>['.'.repeat(r[0].length),'.'.repeat(r[0].length)].concat(r), glim=(r,x,y)=>put(r,[[x,y,' W '],[x,y+1,'W P'],[x,y+2,' W ']]);   // (2 rows of headroom: the cast's halo · the pearl glimmers)
  const RA=[[0,-2,'P'],[-1,-2,'p'],[1,-2,'p'],[-2,-1,'p'],[2,-1,'p'],[-2,0,'P'],[2,0,'P'],[-2,1,'p'],[2,1,'p'],[-1,2,'p'],[0,2,'P'],[1,2,'p']], RB=[[0,-3,'P'],[-3,0,'P'],[3,0,'P'],[0,3,'P'],[-2,-2,'p'],[2,-2,'p'],[-2,2,'p'],[2,2,'p'],[0,-2,'P'],[-2,0,'P'],[2,0,'P']], halo=(r,x,y,R)=>put(r,R.map(([a,b,c])=>[x+a,y+b,c]));   // (CAST: the pearl blazes out to 5 × 5 · then its halo flares)
  /* ---- toward the camera 23 × 36 (6 rows of headroom for the cast's staff & its halo; the hem on row 35 = cy0+8) ---- */
  const D0=[
'.......................',
'.......................',
'.......................',
'.......................',
'.pPp...................',
'pPWPp...c..C..c........',
'.pPp....cc.C.cc........',
'.w.w...gcCcCcCcg.......',
'..w...gGGfffffGGg......',
'..w..gGgfffffffgGg.....',
'..w..gGgfefffefgGg.....',
'..b..gGgfffffffgGg.....',
'..w..gGgffkkkffgGg.....',
'..w.gGgg.fffff.ggGg....',
'..w.gGghhhlPlmmdgGg....',
'..w.gGhlllhllmmmdGgg...',
'..w.Ghllllhlllmmmdgg...',
'.bfhlllllhhlllmmmmdg...',
'..ffhdddlhllllmmmdmg...',
'..w.d.lldhllllmmmdmdg..',
'..w..hllldlllmmmmdmdf..',
'..b..gGgGgGgGgGgGgdff..',
'..w..hgllllllmmmmmgd...',
'..w.hllllllPmmmmmmmd...',
'..w.hlllllhdmmmmmmmmd..',
'..w.hllllllhdmmmdmmmd..',
'..whlllllllhdmmmmdmmdd.',
'..bhllllllllhdmmmmdmmd.',
'..hlllllmlllhdmmmmmdmmd',
'..hllllmmlllhdmmmmmdmmd',
'.hlllmmmllllhdmmmmmmdmd',
'.hllmmdmmmdlhdmmmdmmdmd',
'.lldmmdmmdmllddmdmmdmdd',
'..d.dd.ddp.dd.ddPdd.dd.'];
  const HD=[[0,33,'.d.dd.dd.p.dd.dPd.ddd..']];
  const Dc=[
'.pPp...................',
'pPWPp..................',
'.pPp....c..C..c........',
'.w.w....cc.C.cc........',
'..w....gcCcCcCcg.......',
'..w...gGGfffffGGg......',
'.ff..gGgfffffffgGg..f..',
'.ff.GgGgfefffefgGgG.ff.',
'..w.Ggggfffffffgggg.f..',
'..wdGgggffkkkffggggdf..',
'..wdgGgg.fffff.ggGgdf..',
'..wdgGgghhlPlmmdgGgdl..',
'..w.dlGhlllhllmmmdgdl..',
'..w..dhllllhlllmmmdd...',
'..w..hllllhhlllmmmmd...',
'..w..hlllllhllllmmmd...',
'..w..hllllhllllmmmmd...',
'..b..hlllllllllmmmmd...',
'..w..hlllllllmmmmmmd...',
'..w..gGgGgGgGgGgGgGd...',
'..w..hgllllllmmmmmgd...',
'..w..hlllllPmmmmmmmd...',
'..w.hlllllhdmmmmmmmmd..',
'..b.hllllllhdmmmdmmmd..',
'..w.hlllllllhdmmmmdmmd.',
'..w.hllllllllhdmmmmdmmd',
'...hlllllmlllhdmmmmmdmd',
'...hllllmmlllhdmmmmmdmd',
'..hlllmmmllllhdmmmmmmdd',
'..hllmmdmmmdlhdmmmdmmdd',
'.hlldmmdmmdmllddmdmmdmd',
'.lld.dd.ddmllddmdmdmdd.',
'..d.....dd.p.dd.Pd.dd..',
'.......................'];
  T.D={ idle:[up(D0), up(glim(put(D0,HD),1,4))], cast:[halo(up(Dc),2,3,RA), halo(up(Dc),2,3,RB)] };
  /* ---- the profile (facing right) 21 × 36: the staff before her, her hair down her back ---- */
  const S0=[
'.....................',
'.....................',
'.....................',
'.....................',
'...............pPp...',
'........c..C..pPWPp..',
'.......cCc.Cc..pPp...',
'......gcCcCcCg.w.w...',
'.....gGGgffffk..w....',
'....ggGGgfffff..w....',
'....ggGGgffeff..w....',
'....ggGGgffffff.b....',
'....ggGGgfffkf..w....',
'...gGgGGg.fff...w....',
'...gGgGghhlll...w....',
'...gGgghllhlllm.w....',
'..gGGghlllhllllmw....',
'..gGGglllllhlllfff...',
'..gGGgllllhllldfff...',
'..gGGglllllhlllmdw...',
'...gGgllllhllllmdw...',
'...gGgGGgGgGgGgGgw...',
'...hhllllllmmmmmdw...',
'...hllllllPmmmmmdw...',
'..hlllllllhdmmmmmwd..',
'..hllllllllhdmmmmbd..',
'.hlllllllllhdmmmmwmd.',
'.hllllllllllhdmmmwmd.',
'hlllllmlllllhdmmmwmd.',
'hllllmmllllllhdmmwmmd',
'hlllmmmlllllllhdmwmmd',
'hllmmdmmmdlllllhdbmmd',
'lldmmdmmdmllldlhdwmdd',
'.d.dd.ddp.dd.ddPdwd..'];
  const Sc=[
'...............pPp...',
'..............pPWPp..',
'...............pPp...',
'...............w.w...',
'........c..C....w....',
'.......cCc.Cc...w....',
'......gcCcCcCg..w....',
'..f..gGGgffffk..w....',
'.ff.ggGGgfffff.ffw...',
'..fgGgGGgffeff.ff....',
'..fgGgGGgffffffdw....',
'..dgGgGGgfffkf.dw....',
'..dgGgGGg.fff.dw.....',
'...dggGghhlllmdw.....',
'...gdgghllhllmdw.....',
'..gGgdhlllhllmmw.....',
'..gGGgllllllllmw.....',
'..gGGgllllhllldw.....',
'..gGGglllllhlllmw....',
'...gGgllllhllllmw....',
'...gGgGGgGgGgGgGgw...',
'...hhllllllmmmmmdw...',
'...hllllllPmmmmmdw...',
'..hlllllllhdmmmmmdb..',
'..hllllllllhdmmmmmd..',
'.hlllllllllhdmmmmmmd.',
'.hllllllllllhdmmmmmd.',
'hlllllmlllllhdmmmmmd.',
'hllllmmllllllhdmmmmmd',
'hlllmmmlllllllhdmmmmd',
'hllmmdmmmdlllllhdmmmd',
'lldmmdmmdmllldlhddmdd',
'.d.dd.ddp.dd.ddPdd.d.',
'.....................'];
  T.S={ idle:[up(S0), up(glim(put(S0,[[0,33,'d.dd.ddp.dd.dPd.dwd..']]),15,4))], cast:[halo(up(Sc),16,3,RA), halo(up(Sc),16,3,RB)] };
  /* ---- from behind 23 × 36: the crown's back, her hair down to the sash, the staff at her side ---- */
  const U0=[
'.......................',
'.......................',
'.......................',
'.......................',
'...................pPp.',
'........c..C..c...pPWPp',
'........cc.C.cc....pPp.',
'.......gcCcCcCcg...w.w.',
'......gGGgGGgGGgg...w..',
'.....ggGGgGGgGGgGg..w..',
'.....ggGGgGGgGGgGg..w..',
'.....ggGGgGGgGGgGg..b..',
'.....ggGGgGGgGGgGg..w..',
'....gGgGGgGGgGGgGGg.w..',
'....gGgGGgGGgGGgGGg.w..',
'....hggGGgGGgGGgGgd.w..',
'...hlggGGgGGgGGgGgmdw..',
'...hlggGGgGGgGGgGgmffb.',
'...hlggGGgGGgGGgGgmdff.',
'...dlhgGGgGGgGGgGgmd.w.',
'....hlgGGgGGgGGggmd..w.',
'....gGgGGgGGgGGgGgd..w.',
'....hllgGgGGgGgmmmd..w.',
'...hllllggGGggmmmmmd.b.',
'...hlllllgGgmmmmmmmd.w.',
'..hllllllldmmmmmmmmmdw.',
'..hlllllllldmmmmmmmmdw.',
'..hllllllllldmmmmmmmdwd',
'.hllllllllllldmmmmmmdwd',
'.hlllllllllllldmmmmmdwd',
'hllllllllllllldmmmmmdwd',
'hllmmdmmmdmmmmldmmmmmbd',
'lldmmdmmdmmmdmldmdmddwd',
'.d.dd.ddp.dd.ddPdd.d.w.'];
  const Uc=[
'...................pPp.',
'..................pPWPp',
'...................pPp.',
'...................w.w.',
'........c..C..c.....w..',
'........cc.C.cc.....w..',
'.......gcCcCcCcg....w..',
'..f...gGgGgGgGgGg..ffw.',
'.ff..ggGGgGGgGGgGg.ff..',
'..f.gGgGGgGGgGGgGGg.dw.',
'..d.gGgGGgGGgGGgGGg.dw.',
'..dgGGgGGgGGgGGgGGggdw.',
'..dgGGgGGgGGgGGgGGggdw.',
'...dgGgGGgGGgGGgGGgd.w.',
'....gGgGGgGGgGGgGGg..w.',
'....hggGGgGGgGGgGgd..w.',
'...hlggGGgGGgGGgGgmd.w.',
'...hlggGGgGGgGGgGgmd.b.',
'...hlggGGgGGgGGgGgmd.w.',
'...dlhgGGgGGgGGgGgmd.w.',
'....hlgGGgGGgGGggmd..w.',
'....gGgGGgGGgGGgGgd..w.',
'....hllgGgGGgGgmmmd..w.',
'...hllllggGGggmmmmmd.b.',
'...hlllllgGgmmmmmmmd...',
'..hllllllldmmmmmmmmmd..',
'..hlllllllldmmmmmmmmd..',
'..hllllllllldmmmmmmmd..',
'.hllllllllllldmmmmmmd..',
'.hlllllllllllldmmmmmd..',
'hllllllllllllldmmmmmdd.',
'hllmmdmmmdmmmmldmmmmmd.',
'lldmmdmmdmmmdmldmdmddd.',
'.d.dd.ddp.dd.ddPdd.d...'];
  const UcA=put(Uc,[[0,3,'..f.'],[0,4,'.fff'],[0,5,'.fff'],[0,6,'..ff'],[0,7,'..ff'],[0,8,'..ff'],[0,9,'..fd'],[0,10,'..ld']]);   // (her other arm flung up beside her hair — the sleeve fallen back off a pale forearm, so the cast reads from behind too)
  T.U={ idle:[up(U0), up(glim(put(U0,[[0,33,'d.dd.ddp.dd.dPd.dd.w..']]),19,4))], cast:[halo(up(UcA),20,3,RA), halo(up(UcA),20,3,RB)] };
  T.D.cx0=T.U.cx0=11; T.S.cx0=10;   // (her hem & the staff's foot on the shadow in every view — PX_T.hop)
})();
/* ---------------- SIREN (PX K2 · px_art §5.7): a pale spectral sea-maiden who floats a hand above the ground (lift 2) — long sea-blue hair streaming, bare pale arms,
   a fish-tail curling under her in place of legs · idle: her hair & tail drift, a one-row bob · SONG (the tell — LOOK AWAY): her arms flung wide, her mouth open,
   notes rising over her head, her hair lifting — in every facing · wind: hands to her face, hair flaring · act: the keen — thrown forward, mouth wide · rec: drooping ---------------- */
SPR2.tpl.siren={ r0:7.78, cx0:7, cy0:17, eyeL:'e', lift:(en,r)=>2,
  sel:(en,pose)=>en.song>0?'song':en.st==='wind'?'wind':en.st==='act'?'act':en.st==='recover'?'rec':'idle',
  pal:{d:'#3e4e74', m:'#6a7fa8', l:'#8ea2c8', h:'#c0d0ec', f:'#d0e8f8', a:'#2e6a8a', A:'#4a9ab8', t:'#7ad0d8', e:'#2a6aa8', k:'#1a2a3e', n:'#dfffff'},
  elite:{d:'#4a2e5a', m:'#7a4e8a', l:'#a070b0', h:'#d0a8e0', a:'#6a2a6a', A:'#9a4a9a'} };   // (the elite: a "dusk siren")
(function(){
  const T=SPR2.tpl.siren, sh=spr2Shift, E=n=>Array(n).fill('.'.repeat(15));
  const put=(rows,parts)=>{ const o=rows.map(r=>r.split('')); for(const [x,y,s] of parts) if(y>=0 && y<o.length) for(let i=0;i<s.length;i++) if(s[i]!==' ' && x+i>=0 && x+i<o[y].length) o[y][x+i]=s[i]; return o.map(r=>r.join('')); };
  const flick=r=>put(r,[[0,20,'.....tlmdt.....'],[0,21,'...ttt...ttt...'],[0,22,'..tt.......tt..']]);   // (the fluke flicks open)
  const flickS=r=>put(r,[[0,20,'...lmmd.tt.....'],[0,21,'....dmmtttt....'],[0,22,'.....dd..tt....']]);
  const notes=r=>put(r,[[0,0,'n..........n...'],[0,1,'.n........nn...'],[0,2,'nn.........n...']]);   // (the notes rise & change)
  const notesS=r=>put(r,[[9,0,'n..n..'],[9,1,'.n.nn.'],[9,2,'nn..n.']]);
  const idle=(X,fk)=>[X, sh(X,0,-1), fk(X)];
  /* ---- toward the camera 15 × 23 (3 rows of headroom for the song's notes; the fluke on row 22 = cy0+5, then lifted 2) — each pose is its upper body over the one tail ---- */
  const TD=[
'...ahmmmmmda...',
'....lmmlmmd....',
'....hmlmmmd....',
'.....lmmmd.....',
'.....lmmmd.....',
'......lmd......',
'.....tlmdt.....',
'....ttt.ttt....',
'...tt.....tt...'];
  const D0=E(3).concat([
'.....aaAaa.....',
'....aAAAAAa....',
'....aAfffAa....',
'...aAfefefAa...',
'...aAfffffAa...',
'...aAAflfAAa...',
'..aAAaafaaAAa..',
'..aAafffffaAa..',
'.faAafffflaAaf.',
'.faAalfffllAaf.',
'..fAahhhhhlAf..']).concat(TD);
  const DSong=E(0).concat([
'.n.........n...',
'nn........nn...',
'n.........n....',
'.....aaAaa.....',
'...aaAAAAAaa...',
'..aAAAfffAAAa..',
'.aAAAfefefAAAa.',
'.aA.AfffffA.Aa.',
'.a..aAfkfAa..a.',
'....aAfkfAa....',
'f..aAafffaAa..f',
'fffAafffffaAfff',
'...Aalfffll....',
'...Aahhhhhl....']).concat(TD);
  const DWind=E(3).concat([
'.....aaAaa.....',
'..a.aAAAAAa.a..',
'.aA.aAfffAa.Aa.',
'.aAaAfefefAaAa.',
'..aAffffffffAa.',
'..aAfAfkfAfAa..',
'..aAAffffffAa..',
'..aAaaflfaaAa..',
'...AdfffffdA...',
'...AafffffaA...',
'...Aahhhhhla...']).concat(TD);
  const DAct=E(0).concat([
'..a.........a..',
'.aA.........Aa.',
'.aAa.......aAa.',
'..aAaaaAaaaAa..',
'...aAAAAAAAa...',
'....aAfffAa....',
'...aAfefefAa...',
'...aAfkkkfAa...',
'...aAfkkkfAa...',
'..aAAafffaAAa..',
'.faAafffffaAaf.',
'f.aAafffflaAa.f',
'...Aalfffll....',
'...Aahhhhhl....']).concat(TD);
  const DRec=E(3).concat([
'...............',
'.....aaAaa.....',
'....aAAAAAa....',
'....aAAAAAa....',
'...aAAfffAAa...',
'...aAfefefAa...',
'...aAAfffAAa...',
'..aAAaafaaAAa..',
'..aAafffffaAa..',
'..aAafffflaAa..',
'.faAalfffllAaf.',
'.fAahhhhhhlAaf.']).concat([TD[0]].concat(TD.slice(2)));
  T.D={ idle:idle(D0,flick), song:[DSong, notes(DSong)], wind:DWind, act:DAct, rec:DRec };
  /* ---- the profile (facing right): her hair streaming back, the tail curling under her ---- */
  const TS=[
'...ahmmmmmd....',
'...lmmmlmmd....',
'...hmmlmmmd....',
'....lmmmmd.....',
'....lmmmd......',
'...lmmmd.......',
'...lmmd..tt....',
'....dmmdttt....',
'.....ddtt......'];
  const S0=E(3).concat([
'....aaAaa......',
'...aAAAAAa.....',
'..aAAAAAAAa....',
'..aAAAAAffa....',
'.aAAAAAAfef....',
'.aAAAAAAfff....',
'.aAAAAAAaff....',
'aAAaAAAalf.....',
'aAaaAAAaffff...',
'aA.aAAaaffffl..',
'a..aAahhhhfl...']).concat(TS);
  const SSong=E(0).concat([
'..........n.n..',
'.........nn.nn.',
'.........n..n..',
'....aaAaa......',
'..aaAAAAAa.....',
'.aAAAAAAffa....',
'aAAAAAAAfeff...',
'aAAAAAAAffff.f.',
'aA.AAAAAfkf.ff.',
'a..AaAAAfkfff..',
'..aAAaaffff....',
'.faAaafffff....',
'ff.aAalffff....',
'...aAhhhhld....']).concat(TS);
  const SWind=E(3).concat([
'..a.aaAaa......',
'.aA.AAAAAa.....',
'aAAaAAAAffa....',
'aAAAAAAAfeffff.',
'.aAAAAAAffff.f.',
'.aAAAAAAffff...',
'.aAAAaAAfffd...',
'aAAaAaaffffd...',
'aAaaAaffffd....',
'aA.aAalfff.....',
'a..aAhhhhl.....']).concat(TS);
  const SAct=E(2).concat([
'.aa............',
'aAAaaaAaa......',
'aAAAAAAAAa.....',
'.aAAAAAAAffa...',
'..aAAAAAAfeff..',
'...aAAAAAffff..',
'...aAAAAAfkkf..',
'...aAAAaAfkkf..',
'..aAAaAaafff...',
'.aAaaAafffff...',
'ffaaAalfffff...',
'...aAhhhhld....']).concat(TS);
  const SRec=E(3).concat([
'...............',
'....aaAaa......',
'...aAAAAAa.....',
'..aAAAAAAAa....',
'..aAAAAAAffa...',
'.aAAAAAAAfef...',
'.aAAAAAAAff....',
'.aAAAaAAff.....',
'aAAaAaafff.....',
'aAaaAaffffl....',
'aA.aAalffff....',
'a..aAhhhhff....']).concat([TS[0]].concat(TS.slice(2)));
  T.S={ idle:idle(S0,flickS), song:[SSong, notesS(SSong)], wind:SWind, act:SAct, rec:SRec };
  /* ---- from behind: the cascade of her hair, the tail ---- */
  const TU=TD.slice(2);
  const UB=[                 // (her head of hair parted at the crown, falling down the middle of her back between bare shoulders · her arms at her sides)
'.....aAaAa.....',
'....aAAaAAa....',
'...aAAAaAAAa...',
'...aAAAaAAAa...',
'...aAAAaAAAa...',
'...aaAAaAAaa...',
'..ffaAAaAAaff..',
'.fffaAAaAAafff.',
'.f.haAAaAAah.f.',
'.f..aAAaAAa..f.',
'..f.aAAaAAa.f..',
'....aAAaAAa....',
'....haAaAah....'], U0=E(3).concat(UB).concat(TU);
  const USong=E(0).concat([
'.n.........n...',
'nn........nn...',
'n.........n....',
'.....aAAaa.....',
'...aAaAAaAAa...',
'..aAAaAAaAAaa..',
'.aaAAaAAaAAaAa.',
'.aa.aaAAaAa.aa.',
'.a..aaAAaAa..a.',
'....aaAAaAa....',
'f..aAaAAaAAa..f',
'fffaAaAAaAAafff',
'...aAaAAaAAa...',
'...aAaAAaAAa...',
'....aaAAaAa....',
'....hmlmmmd....']).concat(TU);
  const UWind=E(3).concat([
'.....aAAaa.....',
'..a.aaAAaAa.a..',
'.aa.aaAAaAa.aa.',
'.aaAAaAAaAAaAa.',
'..aafaAAaAafaa.',
'..aafaAAaAafa..',
'..aAAaAAaAAaa..',
'..aAAaAAaAAaa..',
'...aAaAAaAAa...',
'...aAaAAaAAa...',
'...aAaAAaAAa...',
'...aAaAAaAAa...',
'....aaAAaAa....']).concat(TU);
  const UAct=E(1).concat([
'..a.........a..',
'.aAa.......aAa.',
'..aAAaAAaAAaa..',
'...aAaAAaAAa...',
'....aaAAaAa....',
'...aAaAAaAAa...',
'...aAaAAaAAa...',
'..aAAaAAaAAaa..',
'.faAAaAAaAAaaf.',
'f.aAAaAAaAAaa.f',
'..aAAaAAaAAaa..',
'...aAaAAaAAa...',
'...aAaAAaAAa...',
'....aaAAaAa....',
'....hmlmmmd....']).concat(TU);
  const URec=E(4).concat(UB.slice(0,10),UB.slice(11)).concat(TU);   // (drooping a row)
  T.U={ idle:idle(U0,flick), song:[USong, notes(USong)], wind:UWind, act:UAct, rec:URec };
})();
/* ---------------- LAMPREY (PX K2 · px_art §5.8): a toothed eel that latches on — a dark violet body with a mauve belly lying in an S along the ground, its head
   all mouth: the round SUCKER DISC ringed with pale teeth (edge-on in profile · full-face toward you), a small yellow eye · walk: the wave runs down its body ·
   COIL (the tell — the lunge is coming): bunched, the head drawn back, the disc flared · lunge: stretched straight, the mouth wide · rec: limp · LATCH (on your
   back): the disc clamped, the pink gullet showing, the body taut, a pulse running down it — drawn short of the head's reach, so the clamp shows at your back ---------------- */
SPR2.tpl.lamprey={ r0:6.3, cx0:12, cy0:4, eyeL:'y',
  sel:(en,pose)=>en.latched?'latch':en.st==='crouch'?'coil':en.st==='lunge'?'lunge':en.st==='recover'?'rec':en.mv?'walk':'idle',
  pal:{d:'#2a1a32', m:'#3a2a44', l:'#5a3b5a', h:'#7a5a7a', b:'#8a6a7a', o:'#1a0e1a', t:'#f0e6d2', G:'#ff5d8c', y:'#e8c84a'},
  elite:{d:'#1a2a2a', m:'#2a4444', l:'#3a6060', h:'#5a8a80'} };   // (the elite: a "bog lamprey")
(function(){
  const T=SPR2.tpl.lamprey, E=w=>'.'.repeat(w);
  const put=(rows,parts)=>{ const o=rows.map(r=>r.split('')); for(const [x,y,s] of parts) if(y>=0 && y<o.length) for(let i=0;i<s.length;i++) if(s[i]!==' ' && x+i>=0 && x+i<o[y].length) o[y][x+i]=s[i]; return o.map(r=>r.join('')); };
  const blank=(w,h)=>Array(h).fill(E(w));
  /* the body as a wave: a band along y = c + A·sin, tapering to the tail · S: along x (columns, 2–4 deep: back · flank · belly · its shade) · D / U: along y (rows, 'dlmd') */
  const waveS=(ph,A,x1,c)=>{ const g=blank(24,9).map(r=>r.split('')); for(let x=0;x<=x1;x++){ const a=A*Math.min(1,(x1+1-x)/4), t=x<2?2:x<5?3:x<9?4:5, y0=Math.round(c+a*Math.sin((x+ph)*Math.PI/5)-t/2+0.5), C=t===2?'md':t===3?'mbd':t===4?'lmbd':'lmmbd';
      for(let i=0;i<t;i++) if(y0+i>=0 && y0+i<9) g[y0+i][x]=C[i]; } return g.map(r=>r.join('')); };
  const waveV=(ph,A,y0,y1,h,hd)=>{ const g=blank(11,h).map(r=>r.split('')); for(let y=y0;y<=y1;y++){ const dh=hd?y-y0:y1-y, dt=hd?y1-y:y-y0, a=A*Math.min(1,dh/4+0.25)*(hd?Math.min(1,dt/3+0.34):1), x=Math.round(4+a*Math.sin((y+ph)*Math.PI/4)), C=dt<2?'dmd':!hd&&dh<2?'dllmd':'dlmd';
      for(let i=0;i<C.length;i++) g[y][x-(C.length>4?1:0)+i]=C[i]; } return g.map(r=>r.join('')); };   // (hd: the head at the top · the body thickens toward its head & tapers to the tail tip)
  /* ---- the profile (facing right) 24 × 9: the head on the right — the disc edge-on, its teeth, the yellow eye ---- */
  const HS=[[15,1,'....hhll.'],[15,2,'...hllymt'],[15,3,'..hlllmot'],[15,4,'.dllmmmot'],[15,5,'mmmbbbmot'],[15,6,'.dbbbbmmt'],[15,7,'..dddddd.']];
  const S=(ph,A)=>put(waveS(ph,A,15,4.4),HS);
  const COIL=['........................','.......dddd.............','......dmllmd....hhll....','..ddd.dmhlmmd..hllymd...','.dmlmd.dmbbmmd.hlllmoo..','dmlbbmd.dbbbmmdllmmmott.','dmbbbmmddmbbbmmmbbbmoo..','.dbbbbbbmbbbdmmbbbbmd...','..dddddddddd.dddddd.....'];
  const LUNGE=['........................','.....................hd.','...................hllot','..dddddddddddddddhlllyoo','.dmmllllllllllllllllmoot','dmlbbbbbbbbbbbbbbbbbmoot','.ddbbbbbbbbbbbbbbbbbmot.','...dddddddddddddddddd...','........................'];
  const REC=['........................','........................','........................','...................hhl..','..........ddd.....hlldmt','..ddd....dmlmd...hllmmot','.dmlmdd.dmlbmmddmllmmmt.','dmlbbbmmmlbbbmmmmbbbbmd.','.dddddddddddddddddddddd.'];
  const HL=[[11,1,'..hhl..'],[11,2,'.hllyt.'],[11,3,'hllGot'],[11,4,'llmGot'],[11,5,'mbbGot'],[11,6,'mbbbot'],[11,7,'dddddd']];   // the clamp, short of the reach
  const L=ph=>put(waveS(ph,0.9,11,4.8),HL);
  T.S={ cx0:13, idle:[S(0,1.2),S(1,1.2)], walk:[S(0,1.4),S(2.5,1.4),S(5,1.4),S(7.5,1.4)], coil:COIL, lunge:LUNGE, rec:REC, latch:[L(0),L(4)] };
  /* ---- toward the camera 21 × 17 (11 drawn, 5 clear each side for the latch's arc): its round head full-face — the SUCKER DISC (a ring of teeth round the dark throat) fills its face, two yellow eyes above it, the body trailing away up-screen ---- */
  const HD=['...dhlmd...','..dhllmmd..','.dhyllmymd.','dhltttttmmd','dlttooottmd','dltoooootmd','dlttooottmd','.dltttttmd.','..dlbbbmd..','...ddddd...'];   // (rows 7–16: a ring of teeth round the throat)
  const GUL=['dlttoGottmd','dltoGGGotmd','dlttoGottmd'];   // (rows 11–13: the pink gullet)
  const D=(ph,A,g)=>put(waveV(ph,A,0,6,17,0),HD.map((r,i)=>[0,7+i,r]).concat(g?g.map((r,i)=>[0,11+i,r]):[]));
  const FL=['dltttttttmd','dttooooottd','dtoooooootd','dttooooottd','dltttttttmd','.dlbbbbbmd.','..ddddddd..'];   // (rows 10–16: the disc FLARED — the mouth spread to the rim)
  const DCOIL=put(waveV(1,1.8,2,7,17,0),[[0,8,'..dhllmmd..'],[0,9,'.dhyllmymd.']].concat(FL.map((r,i)=>[0,10+i,r])));   // COIL: bunched, the head drawn back, the disc flared
  const DLUNGE=put(waveV(0,0,0,6,17,0),HD.slice(0,3).map((r,i)=>[0,7+i,r]).concat(FL.map((r,i)=>[0,10+i,r]),[[0,11,'dttoGGGottd'],[0,12,'dtoGGGGGotd'],[0,13,'dttoGGGottd']]));   // lunge: stretched straight, the mouth wide, the pink throat
  const DREC=put(waveV(2,1,3,9,17,0),[[0,10,'..dhllmmd..'],[0,11,'.dhyllmymd.'],[0,12,'.dlltttmmd.'],[0,13,'.dltoootmd.'],[0,14,'.dlltttmmd.'],[0,15,'..dlbbbmd..'],[0,16,'...ddddd...']]);   // rec: limp, the disc slack
  const pd=r=>r.map(x=>'.....'+x+'.....');   // (the views are 21 wide: a latched body arcs past your shoulders, where it shows)
  const DLA=['....dddd.............','...dmllmdd...........','..dmlddlmmd..........','..dld...dlmd.........','.dlmd....dlmd........','.dmd.....dlmd........','.dd......dlmmd.......'], DLB=['......dddd...........','....ddmllmd..........','...dmlmddlmd.........','..dlmd...dlmd........','..dmd....dlbmd.......','.dlmd.....dlmd.......','.dmd......dlmmd......'];
  const DL=a=>put(pd(D(0,0,GUL)),a.map((r,i)=>[0,i,r]));   // LATCHED, you facing the camera: it hangs on your back, its body hooked up over your shoulder
  T.D={ idle:[D(0,1.2),D(2,1.2)].map(pd), walk:[D(0,1.5),D(2,1.5),D(4,1.5),D(6,1.5)].map(pd), coil:pd(DCOIL), lunge:pd(DLUNGE), rec:pd(DREC), latch:[DL(DLA),DL(DLB)], cx0:10, cy0:12 };
  /* ---- from behind 11 × 17: the back of its head away up-screen, tapering into the body that comes toward you, the tail's tip nearest ---- */
  const HU=['...dhlmd...','..dhllmmd..','..dhllmmd..','..dlllmmd..','...dlmmd...'];
  const U=(ph,A,dy)=>put(waveV(ph,A,5+(dy|0),16,17,1),HU.map((r,i)=>[0,i+(dy|0),r]));
  const ULA=['.........dlmd........','.........dlmmd.......','..........dlmmd......','...........dlmmd.....','............dlmmd....','............dlbmd....','............dlmmd....','............dlmmd....','...........dlmmd.....','.....ddddddlmmmd.....','....dllllmmmmbd......','.....ddbbbbbdd.......'], ULB=['.........dlmd........','.........dlbmd.......','..........dlmmd......','...........dlmmd.....','............dlmmd....','............dlmmd....','............dlbmd....','............dlmmd....','...........dlmmd.....','....dddddddlmmmd.....','...dlllmmmbmmmd......','....ddbbbbbbdd.......'];   // (down behind your legs, then its tail laid along the ground under your boots, where it shows)
  const UL=a=>put(pd(blank(11,17)),HU.map((r,i)=>[5,i,r]).concat(a.map((r,i)=>[0,5+i,r])));   // LATCHED, you facing up-screen: clamped on your back, its body slung down behind your legs & out along the ground beside you
  T.U={ idle:[U(0,1.2),U(2,1.2)].map(pd), walk:[U(0,1.5),U(2,1.5),U(4,1.5),U(6,1.5)].map(pd), coil:pd(U(1,1.8,4)), lunge:pd(U(0,0)), rec:pd(U(3,1.4,5)),
    latch:[UL(ULA),UL(ULB)], cx0:10, cy0:12 };
})();
/* ---------------- DIVER (PX K3 · px_art §5.9): a seabird that dive-bombs — a gannet: slate-grey wings with darker tips, a white face & belly, a long orange dagger
   beak · aloft (lifted over its shadow, ghosted by the actor loop) its wings beat up · level · down · level · DIVE (the tell): wings swept back tight, the beak
   down at you, streaks behind · GROUND (the punish window): flopped on its belly, wings spread on the ground, orange feet out, its head lolling ---------------- */
SPR2.tpl.diver={ r0:6.3, cx0:11, cy0:8, eyeL:'k',
  lift:(en,r)=>en.st==='grounded'?0:Math.min(15,Math.round(Math.round(Math.max(0,Math.min(1,en.alt==null?1:en.alt))*8)/8*r*1.7)),   // (alt quantised to 1/8, as eBake & the eyes do · ≤ 15: all the cache key's pose field holds)
  sel:(en,pose)=>en.st==='grounded'?'ground':en.st==='dive'?'dive':'idle',
  pal:{d:'#2a3440', m:'#3a4654', l:'#5a6a7a', h:'#8a9aaa', W:'#d8e0e6', o:'#ffb44a', O:'#c87a2a', f:'#ff9a3a', k:'#16080a'},
  elite:{d:'#3a2a20', m:'#5a4434', l:'#7a6050', h:'#a08870'} };   // (the elite: a "skua")
(function(){
  const T=SPR2.tpl.diver, O=spr2Over, B=(w,h)=>Array(h).fill('.'.repeat(w)), rv=s=>s.split('').reverse().join('');
  const at=(parts)=>{ let r=B(23,18); for(const [rows,x,y] of parts) r=O(r,rows,x,y); return r; };   // (every frame on one 23 × 18 board)
  /* ---- toward the camera (the body's centre on (11,8)) ---- */
  const HD=['.lhl.','lWWWm','WkWkW','WWoWW','.WoW.'];                        // the head: the white face, two eyes, the beak hanging toward you
  const BD=HD.concat(['WWOWW','WWWWW','.dWd.','.ddd.']);
  const BU=['..o..','.lol.','lhhhm','lhhmm','lmmmm','.mmm.','lmmmd','dmmmd','.dmd.','dd.dd'];   // from behind: the beak's tip past the crown (away up-screen), the grey back, the tail toward you
  const WL={ mid:[['...lll...',0],['.dlhhhll.',1],['dmmllllhh',2],['dd.ddmmmm',3]],
    up:[['d........',-5],['dl.......',-4],['.lh......',-3],['.dlh.....',-2],['..dlhl...',-1],['...dllh..',0],['....dmlhl',1],['.....ddmm',2]],
    down:[['.....llll',1],['...dlhhll',2],['..dlhmmdd',3],['.dlmd....',4],['.dmd.....',5],['dd.......',6]] };
  const shade=s=>s.replace(/h/g,'l').replace(/l(?=[^l]*$)/,'m');            // (the right wing a shade darker: the light is from the top left)
  const wings=(fr,y0)=>{ const P=[]; for(const [s,dy] of WL[fr]){ P.push([[s],0,y0+dy]); P.push([[shade(rv(s))],14,y0+dy]); } return P; };
  const airD=fr=>at(wings(fr,6).concat([[BD,9,3]])), airU=fr=>at(wings(fr,6).concat([[BU,9,2]]));
  const DV=['.d.....d.','.dl...ld.','.dml.lmd.','..dmlmd..','..dlmmd..','..lWWWm..','..WkWkW..','..WWoWW..','...WoW...','...oOo...','....O....'];   // plunging at you: wings swept back tight beside the tail, head & beak down
  const DVU=['....o....','...lol...','..lhhhm..','..lhhmm..','..dlmmd..','..dmlmd..','.dml.lmd.','.dl...ld.','.d.....d.'];   // from behind: the back, wings swept back toward you
  const SK=[['.W.....W.','.W..W..W.','....W....'],['....W....','.W..W..W.','.W.....W.']];   // the streaks behind — unbroken 1-texel strokes, so the SNES line wraps each as a dash (2 frames)
  const GH=['.lhl.','lWWWm','WkWkW','WWoWW','.WoW.','..O..'], GHU=['.lhl.','lhhhm','lhmmm','lmmmm','.mmm.'];
  const GB=['..dmll.......llmd..','.dmlhhml...mlhhlmd.','dmlhhlmmWWWmmlhlmmd','dmd.ddmWWWWWmdd.dmd','dd....dfWWWfd....dd','......ff...ff......'];   // flopped: the wings spread on the ground, the white chest, the orange feet out front
  const GBU=['..dmll.......llmd..','.dmlhhml...mlhhlmd.','dmlhhlmmmmmmmlhlmmd','dmd.ddmmmmmmmdd.dmd','dd....ddmmmdd....dd','......dd.d.dd......'];
  T.D={ idle:[airD('up'),airD('mid'),airD('down'),airD('mid')], dive:SK.map(s=>at([[s,7,0],[DV,7,3]])),
    ground:[at([[GB,2,7],[GH,9,4]]), at([[GB,2,7],[GH,10,5]])] };            // (the head lolls)
  T.U={ idle:[airU('up'),airU('mid'),airU('down'),airU('mid')], dive:SK.map(s=>at([[s,7,0],[DVU,7,3]])),
    ground:[at([[GBU,2,7],[GHU,9,4]]), at([[GBU,2,7],[GHU,10,5]])] };
  /* ---- the profile (facing right; the body's centre on (10,8)) ---- */
  const SB=['...........lhl.....','..........lhWWl....','.d.....dmmlhWWkWoo.','.ddmmllllllhWWWOooo','..dmmlllllWWWWW....','....ddmWWWWWWd.....','......ddddddd......'];   // the tail left, the white face & long dagger beak right
  const SWu=['..d........','..dd.......','...dl......','...dml.....','....dml....','....dmlh...','.....dmlh..','.....dmllh.'];   // the near wing raised over the back
  const SWm=['....dmlllhh.','.ddmmlllllhh','dddmmmmlllll'];                         // spread toward you, across the body
  const SWd=['.dmmlllh....','..dmmlll....','...dmml.....','....dml.....','.....dd.....'];   // swept down under it
  const airS=fr=>at(fr==='up'?[[SB,2,5],[SWu,3,0]]:fr==='down'?[[SB,2,5],[SWd,3,10]]:[[SB,2,5],[SWm,1,8]]);
  const DS=['....dd..........','...dmmll........','....dmmllhh.....','......dmmlllhl..','.......ddmlWWWl.','.........dmWkWW.','..........dWWoo.','............dOo.','..............o.'];   // the dive in profile: down & forward, the wings swept back along it, the beak at the ground ahead
  const SKS=[['WW....','.WW...','..WW..','......','WW....','.WW...'],['......','WW....','.WW...','..WW..','......','WW....']];   // (diagonal strokes, stair-stepped & unbroken)
  const GS=['.............lhl.....','............lhWWl....','.d.....dmmlhhWWkWo...','.ddmmllllllhWWWWOo...','..dmmlhhhhlldWWWWoo..','.dmlhhllllllmmdWWdOo.','dmllmmdddmmmmd..ff...','ddd.............f....'];   // flopped in profile, the near wing on the ground, the head drooping, the beak's tip in the sand
  const GS2=O(GS.map((r,i)=>i<2?'.'.repeat(21):r),['..............lhl....','.............lhWWl...','................kOo..'],0,1);   // (the lolled head a texel lower — its eye & beak redrawn on it)
  T.S={ idle:[airS('up'),airS('mid'),airS('down'),airS('mid')], dive:SKS.map(s=>at([[s,2,2],[DS,4,3]])), ground:[at([[GS,2,6]]),at([[GS2,2,6]])], cx0:10 };   // (PX_T.hop: flopped where it landed)
})();
/* ---------------- MOTHWING (PX K3 · px_art §5.10): a dusty moth with eye-spot wings, hovering over its shadow (lift r × MOTH_LIFT) — cream forewings, each with an
   orange EYE-SPOT ringed dark, dusky hindwings, a plump striped body under a golden fuzzy thorax, feathered feelers, two dark eyes (D, S) · its wings beat up · mid ·
   down · mid · DROP (the tell — leave the ring): the abdomen curls down & gold POLLEN streams out under it ---------------- */
SPR2.tpl.mothwing={ r0:6.67, cx0:10, cy0:8, eyeL:'e', port:'D',   // (PX Z0) its card shows its wings-spread front
  lift:(en,r)=>Math.round(r*MOTH_LIFT),
  sel:(en,pose)=>en.pf?'drop':'idle',
  pal:{d:'#8a7a60', m:'#c8bca4', l:'#e8e0cc', h:'#fff8e8', b:'#5a4a36', B:'#b0905c', k:'#3a2a1a', o:'#e0782c', f:'#6a5a42', y:'#f0e68c', e:'#1a1208'},
  elite:{d:'#4a5a7a', m:'#7a8ab0', l:'#a8b8d8', h:'#e0e8ff', o:'#8de9ff'} };   // (the elite: a "moonmoth")
(function(){
  const T=SPR2.tpl.mothwing, O=spr2Over, B=(w,h)=>Array(h).fill('.'.repeat(w)), rv=s=>s.split('').reverse().join('');
  const at=(W,H,parts)=>{ let r=B(W,H); for(const [rows,x,y] of parts) r=O(r,rows,x,y); return r; };
  const shade=s=>s.replace(/h/g,'l');                                           // (the right wings a shade darker: the light is from the top left)
  const pair=(L,y0)=>L.map((s,i)=>[[s.slice(0,10)+s[10]+shade(rv(s.slice(0,10)))],0,y0+i]);   // (a left half of 11 → the whole 21-wide row)
  /* ---- toward the camera 21 × 18 (the body's centre on (10,8)): the forewings & their eye-spots, the hindwings under them, the face & the feelers up top ---- */
  const W={ mid:[
'.hhll......',
'lhhhhlll...',
'lhhkkhhlll.',
'lhkookhhll.',
'dlhkkhhlmd.',
'.dmmhllmd..',
'..dmmmmmd..',
'..dmmmmd...',
'...dddd....'],
    up:[
'..lh.......',
'..lhh......',
'..lhhll....',
'..lhkkhl...',
'..hkookl...',
'..lhkkhld..',
'...dmmlmd..',
'...dmmmd...',
'....ddd....'],
    down:[
'...........',
'...........',
'..hhhll....',
'.lhhkkhll..',
'lhhkookhll.',
'lmhhkkhhlmd',
'dmmlhhlmmd.',
'.ddmmmmmd..',
'...dmmmmd..',
'....dddd...'] };
  const BD=['f...f','.f.f.','.ebe.','.BBB.','BBhBB','.bhb.','.bbb.','.hbh.','.bbb.','..b..'];   // the feelers, two eyes either side of the head, the fuzzy thorax, the striped body
  const BU=['f...f','.f.f.','.bbb.','.BBB.','BBhBB','.bhb.','.bbb.','.hbh.','.bbb.','..b..'];   // (from behind: no eyes)
  const fly=(fr,BB)=>at(21,18,pair(W[fr],fr==='up'?2:3).concat([[BB,8,1]]));
  const dust=[['.y.','yyy','.y.','...','...','...'],['.y.','.y.','yyy','.y.','...','...'],['.y.','...','.y.','yyy','.y.','...'],['.y.','.y.','...','.y.','y.y','.y.']];   // the pollen: a puff of gold that falls & spreads (4 frames)
  const drop=(fr,BB,i)=>O(O(fly(fr,BB),['.b.','.y.'],8,10),dust[i],9,12);   // DROP: the abdomen's tip curls down & the pollen streams out under it
  const view=BB=>({ idle:[fly('up',BB),fly('mid',BB),fly('down',BB),fly('mid',BB)], drop:[drop('up',BB,0),drop('mid',BB,1),drop('down',BB,2),drop('mid',BB,3)] });
  T.D=view(BD); T.U=view(BU);
  /* ---- the profile (facing right) 16 × 18 (the body's centre on (8,10)): the striped abdomen, the fuzzy thorax, the head & its big eye, the feathered feeler
     swept forward, dangling legs · the near forewing (its eye-spot) beats over it — raised · back · down — the far one a dark sliver behind ---- */
  const SB=['...........ff.','.........ff..f','......BBBB.f..','.bdbdbBBBBeB..','bdbdbdbBBBBB..','.bdbdbbbBBB...','..f.f...f.f...'];
  const NEAR={ up:['........lh.','.......lhh.','......lhhh.','.....lhhhl.','....lhkkhl.','...lhkookl.','..lmhkkhll.','.dmmhhhll..','.ddmmmmd...'],
    mid:['.lhh.......','.lhhhl.....','..lhkkhl...','..lkookhl..','...lkkhhll.','....dmmhlll','.....ddmmd.'],
    down:['.....dmmll.','....lhkkhl.','...lhkookh.','..lhhkkhl..','.lhhhhl....','.dmmd......'] };
  const FAR={ up:['.......dm','......dmm','.....dmmd','....dmmd.','...dmmd..'], mid:['dmm......','.dmmm....','..dmmmd..'], down:['...dmmd..','..dmmd...','.dmd.....'] };
  const flyS=fr=>at(16,18, fr==='up'?[[FAR.up,5,2],[NEAR.up,1,0],[SB,1,8]] : fr==='mid'?[[FAR.mid,0,3],[NEAR.mid,0,2],[SB,1,8]] : [[FAR.down,1,7],[SB,1,8],[NEAR.down,0,10]]);
  const dropS=(fr,i)=>O(O(flyS(fr),['b','y'],1,13),dust[i].slice(0,4),0,14);
  T.S={ idle:[flyS('up'),flyS('mid'),flyS('down'),flyS('mid')], drop:[dropS('up',0),dropS('mid',1),dropS('down',2),dropS('mid',3)], cx0:7, cy0:10 };   // (PX_T.hop: the body over its shadow)
})();
/* ---------------- COCO MONKEY (PX K3 · px_art §5.13): an upright little monkey with a coconut — a round brown head, a pale heart-shaped face, big round pink-lined
   ears, a long curled tail, the COCONUT in both hands (its colours = the lobbed nut's, blobSpr('coco'): the dark husk, the brown shell, the pale glint) · idle: a tail
   swish · walk: a bobbing knuckle-walk, the nut clutched · WIND (the tell — a lob is coming): both arms up, the nut over its head, in every facing · hop: crouched
   in the air, knees up, the nut hugged · thrown: an arm flung forward, the hands empty ---------------- */
SPR2.tpl.coco={ r0:6.3, cx0:7, cy0:17, eyeL:'k',
  sel:(en,pose)=>en.st==='wind'?'wind':en.st==='hop'?'hop':en.st==='recover'||en.st==='act'?'thrown':en.mv?'walk':'idle',
  pal:{d:'#6a4224', m:'#9a6438', l:'#b8804c', h:'#d8a070', f:'#f2d8b0', F:'#d8b890', p:'#e0a888', k:'#1a0e04', x:'#2a1a0a', n:'#6a4a22', N:'#b08a52'},
  elite:{d:'#3a3a3a', m:'#5a5a5a', l:'#7a7a7a', h:'#a0a0a0', f:'#e8e0d0', F:'#c8c0b0'} };   // (the elite: a "grey langur" — its coconut stays brown)
(function(){
  const T=SPR2.tpl.coco, O=spr2Over, B=(w,h)=>Array(h).fill('.'.repeat(w)), rv=s=>s.split('').reverse().join('');
  const at=(parts)=>{ let r=B(15,22); for(const [rows,x,y] of parts) r=O(r,rows,x,y+2); return r; };   // (every frame on one 15 × 22 board, the feet on row 21: 5 rows of headroom for the nut held up at arm's length)
  const sym=L=>L.map(s=>s+rv(s.slice(0,7)));                                   // (a left half of 8 → the whole 15-wide row, mirrored about col 7)
  const NUT=['..xxx..','.xNnnx.','xNNnnnx','xnnnnnx','xnnnnnx','.xnnnx.','..xxx..'];   // the coconut — exactly blobSpr('coco',3)'s disc (the lobbed nut at this texel): husk · shell · the glint top-left
  /* ---- toward the camera (feet on row 19 = cy0+4) ---- */
  const HEAD=sym(['.....ddd','....dmll','.dd.dlhh','dppdmffl','dppdfkff','.dddffff','...dlfFF','....dlfF']);   // the head: big round ears (pink inside), the heart face, two close eyes, the muzzle
  const HEADU=sym(['.....ddd','....dmll','.dd.dlhh','dmmdmlll','dmmdmlll','.dddmmmm','...dmmmm','....dmmm']);   // (from behind: the round head, the backs of its ears)
  const BODY=['...dmmlllmmd...','..dmlhfffhlmd..','..dmlf...flmd..','..dhl.....lhd..','..dhd.....dhd..','...dm.....md...','...dmm...mmd...'];   // shoulders, the pale chest, the arms round the nut
  const BODYU=['...dmmlllmmd...','..dmlhlllhlmd..','..dmlhlllhlmd..','..dmlhllllmmd..','..dmmllllmmmd..','...dmmmmmmmd...','...ddmmmmmdd...'];
  const LEG=['...dmd...dmd...','..ddmd...dmdd..'], LEGa=['...dmd....dmd..','..ddmd....ddd..'], LEGb=['..dmd...dmd....','..ddd...dmdd...'], LEGt=['..dmmdd.ddmmd..'];
  const TAIL=[[['.d'],13,10],[['dm'],13,11],[['.m'],13,12],[['.m'],13,13],[['md'],12,14],[['d.'],12,15]], TAIL2=[[['dd'],12,10],[['.m'],13,11],[['.dm'],12,12],[['.m'],13,13],[['md'],12,14],[['d.'],12,15]];
  const tl=L=>L.map(([r,x,y])=>[r,x,y]);
  const stand=(H,BD,lg,dy,tail,nut)=>at(tl(tail).map(([r,x,y])=>[r,x,y+dy]).concat([[H,0,3+dy],[BD,0,11+dy],[lg,0,18],[nut===false?[]:NUT,4,11+dy]]));
  const ARMSUP=['...h.......h...','..dh.......hd..','..dh.......hd..','..dh.......hd..','..lh.......hl..','..dl.......ld..'];   // WIND: both arms up past the head, the hands round the nut held high over it
  const wind=(H,BD)=>at([[H,0,5],[BD.slice(0,1).concat(['..dmlhfffhlmd..','..dmlhfffhlmd..','..dmmlfffllmd..','...dmmmmmmmd...','...dmm...mmd...']),0,13],[LEG,0,18],[NUT,4,-2],[ARMSUP,0,1]]);
  const CHEST=['...dmmlllmmd...','..dmlhfffhlmd..','.hdmlhfffhlmd..','.ldmlhfffflmd..','..ddmmfffmmd...','...dmmmmmmd....','...dmm...mmd...'];   // thrown: one arm flung out, the chest bare
  T.D={ idle:[stand(HEAD,BODY,LEG,0,TAIL), stand(HEAD,BODY,LEG,0,TAIL2)],
    walk:[stand(HEAD,BODY,LEGa,0,TAIL), stand(HEAD,BODY,LEG,1,TAIL), stand(HEAD,BODY,LEGb,0,TAIL2), stand(HEAD,BODY,LEG,1,TAIL2)],
    wind:wind(HEAD,BODY), hop:at([[HEAD,0,2],[BODY,0,10],[NUT,4,10],[LEGt,0,17],[['..dd.....dd..'],1,16]]), thrown:at(TAIL.concat([[HEAD,0,3],[CHEST,0,11],[LEG,0,18]])) };
  const TU=['....ddd.','...dlld.','...dl.dl','....dddl','......dl','.....dl.','....dl..','...dl...','..dl....','.dl.....'], TU2=['.ddd....','dlld....','ld.ld...','ldddd...','ld......','.ld.....','..ld....','...ld...','....dl..','.....dl.'];   // from behind: the long tail up its back & out, curled at the tip (2 swishes)
  const backU=(lg,dy,tu,tx,hd,bd,by)=>at([[HEADU,0,(hd!=null?hd:3)+dy],[BODYU,0,(by!=null?by:11)+dy],[lg,0,18],[tu,tx,6+dy]]);
  T.U={ idle:[backU(LEG,0,TU,7), backU(LEG,0,TU2,0)],
    walk:[backU(LEGa,0,TU,7), backU(LEG,1,TU,7), backU(LEGb,0,TU2,0), backU(LEG,1,TU2,0)],
    wind:at([[HEADU,0,5],[BODYU,0,13],[LEG,0,18],[TU.slice(3),7,10],[NUT,4,-2],[ARMSUP,0,1]]), hop:at([[HEADU,0,2],[BODYU,0,10],[LEGt,0,17],[TU,7,4]]), thrown:at([[HEADU,0,3],[BODYU,0,11],[LEG,0,18],[TU,7,6],[['..dhl'],0,10],[['.dl'],0,9]]) };
  /* ---- the profile (facing right) — sitting up, the muzzle & an ear, the tail curled behind, the nut held out front ---- */
  const HS=['....dddd...','..ddmlllm..','.dppdlhhlld','.dppmlffff.','.ddmlfkfFf.','..dmlfffFFf','...dmlfFFd.','....ddddd..'];
  const BS=['...dmmlld....','..dmmllhfd...','.ddmllhff....','.dmmllhff....','.dmmlllff....','..dmmllfd....','..ddmmmmd....'];
  const ARM=['dhl.','.dhl'], LS=['..dmd.dmd.....','.ddmd.dmdd....'], LSa=['..dmd..dmd....','.ddmd...ddd...'], LSb=['...dmddmd.....','..ddddmdd.....'];
  const TS=[[['..dd.'],0,7],[['.d..m'],0,8],[['d...m'],0,9],[['d..dm'],0,10],[['.mmd.'],0,11],[['..mm.'],1,12],[['...m.'],1,13]], TS2=[[['.dd..'],0,6],[['d..m.'],0,7],[['d...m'],0,8],[['.d.dm'],0,9],[['..md.'],0,10],[['..mm.'],1,12],[['...m.'],1,13]];
  const sit=(lg,dy,tail,nut,hd)=>at(tail.map(([r,x,y])=>[r,x,y+dy]).concat([[HS,4,3+dy+(hd||0)],[BS,2,11+dy],[lg,1,18],[nut===false?[]:NUT,8,11+dy],[ARM,7,13+dy]]));
  const a3=R=>['.'.repeat(15)].concat(R), at3=(parts)=>{ let r=B(15,23); for(const [rows,x,y] of parts) r=O(r,rows,x,y); return r; };   // (the profile on a 15 × 23 board: a row more headroom, so the wind's nut floats clear of the head)
  T.S={ idle:[sit(LS,0,TS), sit(LS,0,TS2)].map(a3), walk:[sit(LSa,0,TS), sit(LS,1,TS), sit(LSb,0,TS2), sit(LS,1,TS2)].map(a3),
    wind:at3(TS.map(([r,x,y])=>[r,x,y+5]).concat([[HS,4,8],[BS,2,16],[LS,1,21],[NUT,7,0],[['....dfffd','...lhd...','..lhd....','.lhd.....','.lhd.....','lhd......','lhd......','dd.......'],4,7]])),   // (the near arm raised up the back of its head, the pale palm under the nut held high)
    hop:a3(at(TS.concat([[HS,4,2],[BS.slice(0,5),2,10],[NUT,8,10],[ARM,7,12],[['.dmmmmd...','.ddd.ddd..'],2,15]]))),
    thrown:a3(at(TS.concat([[HS,4,3],[BS,2,11],[LS,1,18],[['....dh','.dhhl.','dhl...'],9,11]]))), cx0:6, cy0:18 };   // (PX_T.hop: the feet on the anchor)
})();
/* ---------------- CINDER FOX (PX K3 · px_art §5.12): a slim orange fox — never the dingo: a deeper fiery orange, BLACK stockings & ear backs, a WHITE mask & bib,
   a long thin snout, big pointed ears, a bushy brush held out low behind with a white tip, gold eyes, EMBER PAWS (flickering gold · red) · idle: a brush flick ·
   walk 4 · wind: a low crouch, jaws open · act: the snap · PASS (the tell — don't chase its fire): a stretched gallop, the paws blazing · PANT: sat back on its
   haunches, the tongue lolling in & out ---------------- */
SPR2.tpl.cinderfox={ r0:6.67, cx0:11, cy0:7, eyeL:'y',
  sel:(en,pose)=>en.st==='pass'?'pass':en.st==='wind'?'wind':en.st==='act'?'act':en.st==='recover'?'pant':en.mv?'walk':'idle',
  pal:{d:'#a04a14', m:'#e0782c', l:'#f4a04c', h:'#ffd08a', w:'#f4e8d8', n:'#2a1206', E:'#ffd23f', e:'#ff4422', y:'#ffd23f', k:'#16080a', t:'#ff8db0', o:'#5e1a14'},
  elite:{d:'#5a1a1a', m:'#9a2e22', l:'#c8483a', h:'#f07a5a'} };   // (the elite: a "blood fox" — its embers, white & black stay)
(function(){
  const T=SPR2.tpl.cinderfox, O=spr2Over, B=(w,h)=>Array(h).fill('.'.repeat(w)), rv=s=>s.split('').reverse().join('');
  const at=(W,H,parts)=>{ let r=B(W,H); for(const [rows,x,y] of parts) if(rows) r=O(r,rows,x,y); return r; };
  const em=(rows,a)=>a?rows:spr2Rep(rows,{E:'e'});                            // (the ember paws flicker: gold ↔ red)
  /* ---- the profile (facing right) 25 × 12 (the body's centre on (11,7); the paws on row 11) — the brush · the torso · the head · the legs, posed apart ---- */
  const HEAD=['..nn.....','..nmn....','.dmmmn...','dmlymmd..','dmlmmmmmk','.dwwwwwd.','..dww....'];   // big black-tipped ears, a gold eye, the long thin snout & black nose, the white jaw
  const HEADo=['..nn.....','..nmn....','.dmmmn...','dmlymmmmk','dmlmmmooo','.dwwwwdo.','..dww....'];   // (jaws open)
  const HEADp=['..nn.....','..nmn....','.dmmmn...','dmlymmd..','dmlmmmmmk','.dwwwwtt.','..dww.t..'];   // (panting: the tongue out)
  const TORSO=['.dlllllllld..','dmmmmmmmmmmmm','dmmmmmmmmmwww','.ddmwwwwwmdww'];
  const BRUSH=['..dllll.','wwllllll','wwwmmmmm','.wwddd..'], BRUSHu=['wwlll...','wwlllll.','.wwmmmmm','...ddd..'];   // (the brush · flicked up)
  const LEG={ st:['.dn.....dn.','.nn.....nn.','.nn.....nn.','.EE.....EE.'], a:['.dn......dn','nn........nn','n..........n','E..........E'].map(r=>r.slice(0,12)),
    b:['..dn...dn..','...nn.nn...','....nnn....','....EEE....'], ba:['.dn......dn.','nn........nn','E..........E'], bb:['..dn...dn..','...nnnnn...','....EEE....'],
    crouch:['dnn....dnn.','EE.....EE..'], snap:['.dn........dn','nn..........nn','E............E'].map(r=>r.slice(0,14)),
    p1:['dn............dn','n..............nn','E...............E'].map(r=>r.slice(0,17)), p2:['....dnn.dnn.....','.....nnnnn......','......EEE.......'] };
  const S=(o)=>at(25,12,[[o.br||BRUSH,o.bx!=null?o.bx:0,4+(o.by||0)],[o.lg,o.lx!=null?o.lx:6,o.ly!=null?o.ly:8],[o.to||TORSO,o.tx!=null?o.tx:6,4+(o.ty||0)],[o.hd||HEAD,o.hx!=null?o.hx:16,o.hy||0]]);
  const em2=(r,a)=>em(r,a);
  T.S={ idle:[S({lg:LEG.st}), em2(S({lg:LEG.st,br:BRUSHu,by:-1}),0)],
    walk:[S({lg:LEG.a,lx:5}), em2(S({lg:LEG.ba,lx:5,ly:9,ty:1,hy:1,by:1}),0), S({lg:LEG.b}), em2(S({lg:LEG.bb,ly:9,ty:1,hy:1,by:1}),0)],
    wind:S({lg:LEG.crouch,lx:6,ly:10,ty:2,hy:3,hx:17,hd:HEADo,by:2,br:BRUSH}),
    act:S({lg:LEG.snap,lx:5,ly:9,ty:1,tx:7,hy:1,hx:16,hd:HEADo,bx:1,by:1}),
    pass:[S({lg:LEG.p1,lx:4,ly:9,ty:1,hy:1,hx:16,bx:-1,by:1,br:['wwlll...','wwwllll.','.wwmmmmm','...dd...']}), em2(S({lg:LEG.p2,lx:5,ly:9,ty:1,hy:2,hx:16,bx:0,by:1,br:['wwlll...','wwwllll.','.wwmmmmm','...dd...']}),1)],
    pant:[S({lg:['dnnnn..dn..','EEEE...EE..'],lx:7,ly:10,to:['....dlllld...','..dmmmmmmmmw.','.dmmmmmmmmww.','dddmwwwwwdww.'],tx:8,ty:2,hd:HEADp,hy:0,hx:16,bx:2,by:3}),
          em2(S({lg:['dnnnn..dn..','EEEE...EE..'],lx:7,ly:10,to:['....dlllld...','..dmmmmmmmmmw','.dmmmmmmmmmww','dddmwwwwwdww.'],tx:8,ty:2,hd:HEAD,hy:0,hx:16,bx:2,by:3}),0)], cx0:11 };
  /* ---- toward the camera 15 × 15 (the body's centre on (7,10); the paws on row 14): tall ears (pale inside, black-tipped), the WHITE cheek ruff flaring out past
     them, gold eyes, the white muzzle round a black nose, the bib, black stockings · the brush with its white tip out at its side ---- */
  const sym=L=>L.map(s=>s+rv(s.slice(0,7)));                                    // (a left half of 8 → the whole 15-wide row, mirrored about col 7)
  const FACE=sym(['.nn.....','.nnn....','.dwmn...','.dwmmd..','.dmmmmdl','..dmmlll','..dmymml','wwdmmmml','.wwwmmml','..wwwwml','...wwwwk','....dwww']);
  const FACEo=O(FACE,['......wow......','.....dooo......'.slice(0,15),'......dwd......'],0,9).map((r,i)=>i===10?r.slice(0,5)+'woooow'.slice(0,5)+r.slice(10):r);   // (jaws open)
  const FACEp=O(FACE,['......wtw......','......dtd......'],0,10);   // (panting: the tongue out)
  const LGD={ st:sym(['....dmww','....dnww','....EE..']), a:sym(['....dmww','...dnmww','...EE...']).map((r,i)=>i?r.slice(0,9)+(i===1?'.dn..':'.EE..').slice(0,4)+r.slice(13):r), wide:sym(['...ddmww','..dn..ww','..EE....']), run:sym(['...dmmww','..dn...w','.EE.....']) };
  const BRD=['.dll','dlhl','dlww','.dww'], BRD2=['dll.','dlhl','.dww','..dw'];   // (the brush peeping out beside it, its white tip)
  const front=(f,lg,dy,br,by)=>at(15,15,[br?[br,11,by!=null?by:8]:null,[f,0,dy||0],[lg,0,12+(dy||0)]]);
  T.D={ idle:[front(FACE,LGD.st,0,BRD), front(FACE,em(LGD.st,0),0,BRD2)],
    walk:[front(FACE,LGD.a,0,BRD), front(FACE,em(LGD.st,0),0,BRD2,7), front(FACE,spr2Mir(LGD.a),0,BRD), front(FACE,em(LGD.st,0),0,BRD2,7)],
    wind:at(15,15,[[BRD2,11,10],[FACEo,0,2],[LGD.wide.slice(1),0,13]]), act:at(15,15,[[BRD,11,9],[FACEo,0,1],[LGD.wide.slice(0,1).concat(LGD.wide.slice(1)),0,12]]),
    pass:[at(15,15,[[BRD,11,8],[FACE,0,0],[LGD.run,0,12]]), em(at(15,15,[[BRD2,11,9],[FACE,0,0],[sym(['....dmww','....ndnn','.....EEE']).map(r=>r),0,12]]),1)],
    pant:[front(FACEp,LGD.st,0,BRD), front(FACE,em(LGD.st,0),0,BRD2)], cx0:7, cy0:10 };
  /* ---- from behind 15 × 15: the black ear backs, the back of the head, the dark saddle down the back, black hocks · the bushy brush hanging out to one side, its white tip ---- */
  const BACK=sym(['.nn.....','.nnn....','.nnnn...','.dnnmd..','.dmmmmdl','..dmmmll','..dmmmml','.wdmmmml','...ddmml','...dmmmd','...dmmmd','..dmmmmd']);   // (the head, then a narrower back with its dark saddle, the haunches)
  const LGU={ st:sym(['...dnmmd','...dnd..','...EE...']), a:sym(['..dnmmmd','..dnd...','..EE....']).map((r,i)=>i?r.slice(0,9)+(i===1?'dnd':'EE.')+r.slice(12):r), wide:sym(['..dnmmmd','.dnd....','.EE.....']) };
  const BRU=['.dlld.','dllhld','dlhhld','.dlhld','..dwwd','...ww.'], BRU2=spr2Mir(BRU);
  const back=(lg,br,bx,dy)=>at(15,15,[[BACK,0,dy||0],[lg,0,12+(dy||0)],[br,bx,8+(dy||0)]]);
  T.U={ idle:[back(LGU.st,BRU,8), back(em(LGU.st,0),BRU2,1)], walk:[back(LGU.a,BRU,8), back(em(LGU.st,0),BRU,8,0), back(spr2Mir(LGU.a),BRU2,1), back(em(LGU.st,0),BRU2,1)],
    wind:at(15,15,[[BACK,0,2],[LGU.wide.slice(1),0,13],[BRU.slice(0,5),8,10]]), act:at(15,15,[[BACK,0,1],[LGU.wide,0,12],[BRU,8,9]]),
    pass:[at(15,15,[[BACK,0,0],[sym(['..dnmmmd','.dn.....','.EE.....']),0,12],[['dllld','dlhld','.dwd.'],5,10]]), em(at(15,15,[[BACK,0,0],[sym(['...dnmmd','....dnn.','....EE..']),0,12],[['dllld','dlhld','.dwd.'],5,10]]),1)],
    pant:[back(LGU.st,BRU,8), back(em(LGU.st,0),BRU2,1)], cx0:7, cy0:10 };
})();
/* ---------------- KELPIE (PX K4 · px_art §5.11): a sea-green water-horse with a ragged kelp mane & tail, light through its ribs · idle: the kelp drifts, a weight
   shift · walk 4: a trot · STAMP 2 (the tell): head low, the near fore-hoof up · hammered down · DASH 2: the gallop — legs flung fore & aft · gathered, the mane & tail
   streaming · WINDED 2 (the punish window): the head hung to the ground, steam at the nostril, the flanks heaving ---------------- */
SPR2.tpl.kelpie={ r0:8.52, cx0:14, cy0:14, eyeL:'k',
  sel:(en,pose)=>en.st==='windup'?'stamp':en.st==='charge'?'dash':en.st==='exposed'?'winded':en.mv?'walk':'idle',
  pal:{d:'#2a7a68', m:'#5fc4a8', l:'#8ae0c8', h:'#c8fff0', r:'#d8fff4', g:'#1e5a3a', G:'#3a8a4a', n:'#2a4a44', k:'#10323c', w:'#e8fff8'},
  elite:{d:'#1e3a5a', m:'#3a6a9a', l:'#6a9ac8', h:'#b0d8f8', g:'#10203a', G:'#2a4a7a'} };   // (the elite: a "storm kelpie")
(function(){
  const T=SPR2.tpl.kelpie, O=spr2Over, B=(w,h)=>Array(h).fill('.'.repeat(w));
  const at=(W,H,parts)=>{ let r=B(W,H); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1],p[2]); return r; };
  const leg=(x,dx,far,y0)=>dx.map((d,i)=>[[i===dx.length-1?'nn':far?'dd':'dm'],x+d,(y0==null?15:y0)+i]);   // (a 2-texel leg down from the belly, its hoof last)
  /* ---- the profile (facing right) 28 × 20: the body's centre on (13,14), the hooves on row 19 ---- */
  const BODY=['..dllllllllmmmd','dlhhhhllllllmmd','dmlrlmmlrlmmlmd','dmmlmmmmlmmmmmd','.ddmmmmmmmmmmd.'];
  const BODYh=['..dllllllllmmmd','dlhhhhllllllmmd','dmlrlmmlrlmmlmd','dmmlrmmmlrmmmmd','dmmlmmmmlmmmmmd','.ddmmmmmmmmmd..'];   // (winded: the flanks heave out a row)
  const HUP=['.......dl.......','......gml.......','.....ggmmlhd....','....gGgmmmlhhd..','...gGggmmkmmlhd.','..ggGgmmmmdmmlhh','..gGgdmmmd.ddmmd','.ggGgdmmmd...dd.','.gGggdmmmd......','ggGgdmmmmd......'];
  const HFW=['.........gdl....','.....gggGgmld...','..ggGGgdmmmlhd..','gggGgggdmmkmmlhd','.gg.ggdmmmmmdmlh','....ggdmmmd..ddd','....gdmmmd......'];   // (the dash: the neck flung forward, ears back, the mane streaming)
  const HHU=['.ggd.........','gGgdmd.......','ggGdmmmd.....','.gGgdmmmmd...','..gg.dmmmmd..','.....dmmlkmd.','......dmmmlhd','......ddmmlhh','........dddd.'];   // (winded: the head hung to the ground)
  const TA=['.....gg..','...gGGgg.','..gGggg..','.gGg.gg..','.gg..g...','gg...g...','g....g...'], TB=['.....gg..','...gGGgg.','..gGggg..','.gGg.gg..','gg...g...','g....g...','.g....g..'];   // (the kelp tail · its drift)
  const TS=['...gGGgg.','gggGgggg.','.gGgg.g..','gg..g....'], TS2=['...gGGgg.','.ggGgggg.','gGgg.gg..','g...g.g..'];   // (streaming out behind the dash)
  const S=(o)=>at(28,20,[[o.t||TA,0,9+(o.ty||0)]].concat(o.far||[],[[o.b||BODY,7,10+(o.by||0)]],o.near||[],[[o.h||HUP,o.hx!=null?o.hx:12,o.hy||0]],o.fx||[]));
  const st=(a,b,c,d,o)=>Object.assign({far:leg(9,a||[0,0,0,0,0],1).concat(leg(18,c||[0,0,0,0,0],1)), near:leg(10,b||[0,0,0,0,0]).concat(leg(19,d||[0,0,0,0,0]))},o||{});   // (far hind · near hind · far fore · near fore: the far pair a texel behind)
  const F=[1,1,2,2,3], Bk=[-1,-1,-2,-2,-3], Fa=[0,1,2,2,3], Ba=[0,-1,-2,-2,-3], Uf=[0,1,0], Uh=[0,-1,0], Z=[0,0,0,0,0];
  const KNEE=[[['dmmm'],19,15],[['..dm'],19,16],[['..nn'],19,17]];             // (the stamp: the near fore-knee flung up, the hoof hanging)
  T.S={ idle:[S(st()), S(st([0,0,0,-1,-1],Z,Z,[0,0,0,1,1],{t:TB}))],
    walk:[S(st(Fa,Ba,Ba,Fa)), S(st(Uh,Z,Z,Uf,{t:TB,hy:1})), S(st(Ba,Fa,Fa,Ba)), S(st(Z,Uh,Uf,Z,{t:TB,hy:1}))],
    stamp:[S({far:leg(9,Z,1).concat(leg(18,Z,1)),near:leg(10,Z),fx:KNEE,hx:13,hy:2}), S(st(Z,Z,[0,0,-1,-1,-1],[0,1,1,2,2],{hx:13,hy:2,fx:[[['w.w'],20,18]]}))],
    dash:[S({t:TS,ty:1,h:HFW,hy:3,far:leg(8,[0,-1,-2,-3],1).concat(leg(17,[1,2,3,4],1)),near:leg(10,[0,-1,-2,-3,-4]).concat(leg(19,[1,2,3,4,5]))}),
          S({t:TS2,ty:0,by:-1,h:HFW,hy:2,far:leg(9,[0,1,1],1,14).concat(leg(17,[0,-1,-1],1,14)),near:leg(10,[0,1,1,2],0,14).concat(leg(19,[0,-1,-2,-1],0,14))})],
    winded:[S(st(Z,Z,[0,0,1,1,1],[0,1,1,2,2],{h:HHU,hx:15,hy:6,fx:[[['w'],27,13]]})), S(st(Z,Z,[0,0,1,1,1],[0,1,1,2,2],{b:BODYh,h:HHU,hx:15,hy:6,t:TB,fx:[[['w'],27,11],[['w'],26,12]]}))], cx0:14 };
  /* ---- toward the camera 15 × 22 (the body's centre on (7,16), the hooves on row 21): the long face with its pale blaze, ears up, the mane down both sides, the chest ---- */
  const FACE=['....d.....d....','....dl...ld....','....dmd.dmd....','...gdmmGmmdg...','..gGdklhlkdGg..','..gGgdmhmdgGg..','..gggdmhmdggg..','...gGdmhmdGg...','...ggdlhldgg...','....dlhhhld....','....dnhhhnd....'];   // (the long narrow face, ears pricked close, eyes at its sides, the blaze, the muzzle)
  const FDR=['...............','..dl.....ld....','...ddmd.dmdd...'].concat(FACE.slice(3));   // (winded: the ears drooped out sideways)
  const FWL=O(FACE,['gg...........gg','ggg.........ggg','.gg.........gg.','..g.........g..'],0,3);   // (the dash: the mane flung wide)
  const CH=['..dmmdllldmmd..','.dmlhmdddmmmmd.','.dmllmmmmmmmmd.','..dmlmmmmmmmd..','..dmlmmmmmmmd..'], CHh=['..dmmdllldmmd..','dmlhmmdddmmmmmd','dmlllmmmmmmmmmd','.dmlmmmmmmmmmd.','..dmlmmmmmmmd..'];
  const lD=(dl,dr,yl,yr)=>leg(3,dl||[0,0,0,0,0,0],0,yl||16).concat(leg(9,dr||[0,0,0,0,0,0],0,yr||16));
  const D=(o)=>at(15,22,[[o.c||CH,0,11+(o.cy||0)]].concat(o.lg||lD(),[[o.f||FACE,0,o.fy||0]],o.fx||[]));
  const Z6=[0,0,0,0,0,0], DR=[[['dm'],3,16],[['dm'],2,17],[['nn'],2,18]];      // (the near fore lifted, knee out)
  T.D={ idle:[D({}), D({f:O(FACE,['..G.........G..'],0,9)})],
    walk:[D({lg:lD(Z6,[0,0,0,0])}), D({fy:1,lg:lD()}), D({lg:lD([0,0,0,0],Z6)}), D({fy:1,lg:lD()})],
    stamp:[D({fy:2,lg:leg(9,Z6,0,16).concat(DR)}), D({fy:2,lg:lD([0,0,-1,-1,-1,-1],Z6),fx:[[['w...w'],0,21]]})],
    dash:[D({f:FWL,fy:3,lg:lD([0,0,-1,-1,-2,-2],[0,0,1,1,2,2])}), D({f:FWL,fy:2,lg:lD([0,0,0,0],[0,0,0,0],15,15)})],
    winded:[D({f:FDR,fy:6,lg:lD([0,0,-1,-1,-1,-1],[0,0,1,1,1,1]),fx:[[['w'],12,17]]}), D({c:CHh,f:FDR,fy:6,lg:lD([0,0,-1,-1,-1,-1],[0,0,1,1,1,1]),fx:[[['w'],13,15],[['w'],12,16]]})], cx0:7, cy0:16 };
  /* ---- from behind 15 × 24: the ears, the mane down the long neck, the barrel, the round haunches with the kelp tail between, the hind legs (PX4 FIX: no tulip) ---- */
  const BACK=['....d.....d....','...dld...dld...','...dmmdddmmd...','....dmmgmmd....','...gdmgGgd.....','..g.dgGgmdg....','...gdmGgmmdg...','..dmlgGgmmmd...','.dmlhlgGmmmmd..','.dmlhlmgmmmmmd.','dmlhllmmmmmmmmd','dmlhhlmmdmlhhmd','dmlhhlmdgdmlhmd','dmlhlmdgGgdmlmd','.dmlmdgGGgdmmd.','..dmd.gGgg.dmd.','..dmd.gGgG.dmd.','..dmd.gGgg.dmd.'];   // (the ears & the back of its head away up-screen, the kelp mane down its neck — fronds astray at its sides — the withers, the barrel, the two round haunches lit on top with the cleft between, the kelp tail from it, the gap under the rump · PX Z0)
  const E15='...............', BLO=[E15,E15].concat(BACK.slice(0,4),BACK.slice(6));   // (stamping: the head dipped)
  const BHU=[E15,E15,E15,E15,E15,'.....dgGgd.....','....dmgGgmd....'].concat(BACK.slice(7));   // (winded: the head hung out of sight)
  const BHh=BHU.map((r,i)=>i>=9&&i<=14?r[0]+r.slice(0,7)+r.slice(8)+r[14]:r);    // (…the flanks heaving out)
  const UT=['.gGg.','.gGgg','gGg.g','.gg..','.g.g.'], UT2=['.gGg.','gGgg.','g.gGg','..gg.','.g.g.'], UTS=['g.gGg.g','gGgGgGg','.gGgGg.'];   // (the long kelp tail down to the hocks, its fronds astray (PX Z0) · its sway · streaming over the rump)
  const lU=(dl,dr,yl,yr)=>leg(2,dl||Z6,0,yl||18).concat(leg(11,dr||Z6,0,yr||18));
  const U=(o)=>at(15,24,[[o.b||BACK,0,o.by||0]].concat(o.lg||lU(),[[o.t||UT,o.tx!=null?o.tx:5,o.ty!=null?o.ty:18]],o.fx||[]));
  T.U={ idle:[U({}), U({t:UT2})], walk:[U({lg:lU(Z6,[0,0,0,0])}), U({t:UT2}), U({lg:lU([0,0,0,0],Z6)}), U({t:UT2})],
    stamp:[U({b:BLO,fx:[[['dm'],0,17],[['nn'],0,18]]}), U({b:BLO,lg:lU([0,0,-1,-1,-1,-1],Z6),fx:[[['w...w'],0,23]]})],
    dash:[U({t:UTS,tx:4,ty:13,lg:leg(2,[0,0,0],0,18).concat(leg(11,[0,0,0],0,18))}), U({t:UTS,tx:4,ty:14,lg:lU()})],
    winded:[U({b:BHU,t:UT}), U({b:BHh,t:UT2})], cx0:7, cy0:18 };
})();
/* ---------------- TUSKED WALRUS (PX K4 · px_art §5.14): a huge blubbery blue-grey walrus — its folds, a small round head, the bristly whisker pad, two long ivory
   tusks, fore-flippers on the ground and the hind flippers fanned · idle: breathing, a whisker twitch · walk 4: the lollop (the bulk humps) · PAW 2: the fore-flippers
   slap · SLIDEW: reared, chest up, head high (its lane locks) · SLIDE 2: flat on its belly, flippers swept back, ice spray · TUSKW: the head reared back, tusks raised ·
   TUSK: the head slammed down, tusks driven long · REC: sprawled, panting ---------------- */
SPR2.tpl.walrus={ r0:10.37, cx0:13, cy0:13, eyeL:'k',
  sel:(M=>(en,pose)=>M[en.st] || (en.mv?'walk':'idle'))({windup:'slidew', charge:'slide', paw:'paw', wind:'tuskw', act:'tusk', recover:'rec'}),   // (the map built once — no object a walrus a frame)
  pal:{d:'#4e5a62', m:'#7e8a92', l:'#a8b4bc', h:'#d0dae0', F:'#4a545a', z:'#cdbca2', Z:'#a89a80', q:'#6a5a48', t:'#f6f0de', T:'#c8c0a8', k:'#10141a', w:'#e8f6ff'},
  elite:{d:'#5a3e30', m:'#8a6450', l:'#b08a70', h:'#d8b898'} };   // (the elite: a "bull walrus")
(function(){
  const T=SPR2.tpl.walrus, O=spr2Over, B=(w,h)=>Array(h).fill('.'.repeat(w)), rv=s=>s.split('').reverse().join('');
  const at=(W,H,parts)=>{ let r=B(W,H); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1],p[2]); return r; };
  const cut=(R,x0,y0,x1,y1)=>R.slice(y0,y1).map(r=>r.slice(x0,x1));             // (a part lifted out of a frame)
  const wipe=(R,x0,y0,x1,y1)=>R.map((r,y)=>y<y0||y>=y1?r:r.slice(0,x0)+'.'.repeat(Math.max(0,Math.min(r.length,x1)-x0))+r.slice(x1));
  const cs=(R,x0,x1,dy)=>{ const W=R[0].length, H=R.length; return R.map((r,y)=>{ let s=''; for(let x=0;x<W;x++){ const sy=x>=x0&&x<x1?y-dy:y; s+=sy>=0&&sy<H?R[sy][x]:'.'; } return s; }); };   // (columns x0..x1 moved dy rows — the lollop's hump)
  const sym=L=>L.map(s=>s+rv(s.slice(0,-1)));
  /* ---- the profile (facing right) 34 × 20: the body's centre on (15,13), its belly & flippers on row 19 ---- */
  const S0=['..................................','.......................dddd.......','.....................ddmlhhmd.....','....................dmllhhhlmd....','....................dmlhhlhkmmd...',
    '...................dmlllllmmzzzd..','..............ddddddmlllmmzzzzzz..','...........dddmmllldmllmmzqzzqzz..','.........ddmmlllhlldmlmmmzzzzzzz..','........dmmllhhlllldmmmmdzqzzqzz..',
    '......ddmllhlllllldmmmmmdZZZZZZd..','.....dmllllllllllldmmmmmmdtTdtTd..','....dmlllllllllllldmmmmmd.tTdtT...','...dmlllllmmmmmmmdmmmmmd..tT.tT...','..dmlllmmmmmmmmmmmdmmmd...tT.tT...',
    '.dmllmmmmmmmmmmmmmmdmd....tT.tT...','.dmlmmmmmmmmmmmmmmmmmdFF...T..T...','FFdmmmmmmmmmmmmmmmmmdFFFF.........','FFFddmmmmmmmmmmmmmmdFFFFFF........','.FFF.ddddddddddddd...FFFF.........'];
  const HD=wipe(cut(S0,19,1,34,17),0,15,7,16), FORE=cut(S0,20,16,27,20), BODY=wipe(wipe(wipe(S0,25,0,34,17),19,0,25,7),20,16,27,20);   // (the head with its throat & tusks · the fore-flipper · the bulk, its neck kept under the head)
  const rise=(R,x0,x1,y,dy)=>R.map((r,yy)=>{ let o=''; for(let x=0;x<r.length;x++) o+=x>=x0&&x<x1&&yy<=y?(yy+dy<=y?R[yy+dy][x]:R[y][x]):r[x]; return o; });   // (columns stretched up dy rows above row y — a neck craned, a chest reared)
  const sq=(R,y,n)=>B(R[0].length,n).concat(R.slice(0,y),R.slice(y+n)), wd=(R,x,n)=>R.map(r=>(r.slice(0,x)+r[x].repeat(n)+r.slice(x)).slice(0,r.length));   // (squashed n rows · lengthened n columns)
  const HDw=O(HD,['zqzzqzzz','zzzqzzqz'],6,6).map((r,y)=>y===8?r.slice(0,7)+'zzqzzq'+r.slice(13):r);   // (the whiskers twitch)
  const HDs=wipe(HD,0,12,15,16), HDl=O(HD.concat(B(15,2)),['tT.tT','tT.tT','.T..T'],7,15), HDf=O(wipe(HD,6,10,15,16),['tT.tT.','.tT.tT','..tT.T'],7,10), HDr=O(wipe(HD,0,13,15,16),['.qqq'],8,9);   // (tusks raised short · driven long · raked forward in the slide · resting, the mouth open)
  const FSL=['.......','FFFFFFF','.FFFFF.'], FBK=['FFFFd..','.FFFFd.'];   // (the fore-flipper slapped flat · swept back)
  const S=(o)=>{ const F=[o.f||FORE,20+(o.fx||0),16+(o.fy||0)]; return at(34,20,[[o.b||BODY,0,0],o.fl?null:F,[o.h||HD,19+(o.hx||0),1+(o.hy||0)],o.fl?F:null].concat(o.fx2||[])); };   // (o.fl: the flipper in front of the throat)
  const FLAT=wd(sq(BODY,9,2),10,2);
  T.S={ idle:[S({}), S({h:HDw,b:cs(BODY,2,18,-1)})],
    walk:[S({}), S({b:cs(BODY,17,34,-1),hy:-1,fx:1}), S({b:cs(BODY,5,17,-1)}), S({b:cs(BODY,0,7,-1),fx:-1})],
    paw:[S({fx:1,fy:-2,fl:1}), S({f:FSL,fx:1,fy:1})],
    slidew:S({b:rise(BODY,12,26,12,2),hy:-2,fx:2}),
    slide:[S({b:FLAT,f:FBK,fx:-6,fy:1,h:HDf,hx:2,hy:3,fx2:[[['w.w..w'],28,18]]}), S({b:FLAT,f:FBK,fx:-6,fy:1,h:HDf,hx:2,hy:3,fx2:[[['.w..w.w'],27,17]]})],
    tuskw:S({b:rise(BODY,16,26,12,2),h:HDs,hx:-1,hy:-2}), tusk:S({b:cs(BODY,17,26,2),h:HDl,hx:1,hy:3}),
    rec:S({b:sq(BODY,9,2),f:FSL,fy:1,h:HDr,hy:3}), cx0:13 };
  /* ---- toward the camera 25 × 23 (the body's centre on (12,16), the flippers on row 22): the round head, two small eyes, the whisker pad, both tusks hanging
     over the broad chest, the fore-flippers out the sides ---- */
  const FACE=['.........ddddddd.........','.......ddmllllhmmd.......','......dmlhhhhlllmmd......','.....dmlhhllllllmmmd.....','.....dmlklllllllkmmd.....','.....dmllllllllllmmd.....',
    '....dmzzzzzzdzzzzzzmd....','....dzzqzqzzdzzqzqzzd....','....dzzzzzzzdzzzzzzzd....','....dZzzqzzzdzzzqzzZd....','.....dZZZZZdddZZZZZd.....'];
  const FACEw=O(FACE,['zqzzqz.zqzzqz'],6,7).map((r,y)=>y===9?'....dZzqzzzzdzzzzqzZd....':r);   // (the whiskers twitch)
  const CH=['.....dmmmmmmmmmmmmmd.....','....dmlmmmmmmmmmmmmmd....','...dmlllmmmmmmmmmmmmmd...','..dmlllmmmmmmmmmmmmmmmd..','..dmllmmmmmmmmmmmmmmmmd..','.dmllmmmmmmmmmmmmmmmmmmd.',
    '.dmlmmmmmmmmmmmmmmmmmmmd.','.dmlmmmmmmmmmmmmmmmmmmmd.','.dmmmmmmmmmmmmmmmmmmmmmd.','FFdmmmmmmmmmmmmmmmmmmmdFF','FFFddmmmmmmmmmmmmmmmddFFF','.FFF.ddddddddddddddd.FFF.'];
  const TUSK=['dtTd','dtTd','dtTd','dtTd','dtTd','dtTd','.dtT','..dt'], TUSKs=['dtTd','.dtT','..dt'], TUSKl=['dtTd','dtTd','dtTd','dtTd','dtTd','dtTd','dtTd','dtTd','.dtT','..dt'];   // (hanging · raised at you, short · driven long)
  const FLu=['..F','.FF','FFd','Fd.'], FLs=['FFFFF'];
  const D=(o)=>{ const tk=o.t||TUSK, ty=11+(o.fy||0); return at(25,23,[(o.fy||0)<0?[cut(CH,0,0,25,4),0,11+o.fy]:null,[o.c||CH,0,11+(o.cy||0)]].concat(o.fl||[],[[o.f||FACE,0,o.fy||0],[tk,6,ty],[tk.map(rv),15,ty]],o.fx2||[])); };
  const CHf=O(spr2Shift(CH,0,1),['FFF','.FF'],0,20).map((r,y)=>y===20?'FFF'+r.slice(3,22)+'FFF':r), DSL={c:CHf,fy:3};
  T.D={ idle:[D({}), D({f:FACEw})], walk:[D({}), D({fy:-1,cy:-1}), D({}), D({fy:-1,cy:-1})],
    paw:[D({c:wipe(CH,0,9,4,12),fl:[[FLu,0,16]]}), D({c:wipe(CH,21,9,25,12),fl:[[spr2Mir(FLu),22,16]]})],
    slidew:D({fy:-2,cy:-1,fl:[[['FF.','FFF'],0,20],[['.FF','FFF'],22,20]]}),
    slide:[D(Object.assign({fx2:[[['w.w'],0,19],[['w.w'],22,19]]},DSL)), D(Object.assign({fx2:[[['.w.w'],0,18],[['w.w.'],21,18]]},DSL))],
    tuskw:D({fy:-2,cy:-1,t:TUSKs}), tusk:D({fy:2,t:TUSKl}), rec:D({c:CHf,fy:3,t:TUSKs,fl:[[FLs,0,21],[FLs,20,21]]}), cx0:12, cy0:16 };
  /* ---- from behind 25 × 24: the back of the round head — as big as the face it turns away — the whisker pad's sides bulging past it, the neck fold, the broad back,
     the fore-flippers out the sides, the hind flippers fanned toward you (PX4 FIX: no rock · PX Z0: the tusks' tips under the pads, paddles & a webbed fan) ---- */
  const UHD=['.........ddddddd.........','.......ddmllhhlmmd.......','......dmlhhhhlllmmd......','.....dmlhhllllllmmmd.....','.....dmlhlllllllmmmd.....','.....dmllllllllmmmmd.....','....zzdmlllllllmmmdzz....','...zzqzdmllllllmmdzqzz...','...ZzzzddmmmmmmmddzzzZ...','....ZZZZdddddddddZZZZ....'];   // (the back of its round head — as big as the face it turns away — the whisker pad bulging past both cheeks, a fold of neck under it)
  const TU=['dtTd...........dTtd','dtTd...........dTtd','.dtd...........dtd.'];   // (PX Z0) the tusks' tips hanging below the whisker pads, past both cheeks — the walrus read from behind too
  const UB=['....dmmdmmmmmmmmmdmmd....','...dmllhhllllllmmmmmmd...','..dmlhhhlllllllmmmmmmmd..','..dlhhllllllllmmmmmmdmd..','.dmlhlllllllmmmmmmmmmmdd.','ddmlllllllmmmmmmmmmmmdmdd',
    'dFFdlllllmmmmmmmmmmmmdFFd','dFmFdllllmmmmmmmmmmmdFmFd','.dFmdlllmmmmmmmmmmmmdmFd.','..ddmlmmmmmmmmmmmmmmmdd..','..dmmmmmmmmmmmmmmmmmmmd..','...ddmmmmmmmmmmmmmmmdd...',
    '....ddddmmmmmmmmmdddd....','...dFmFdddmmmmmdddFmFd...','..dFmFmFd.ddddd.dFmFmFd..','..dddddd.........dddddd..'];   // (lit from the top left · PX Z0: the fore-flippers paddles out the sides, the hind flippers webbed & fanned toward you — its tail)
  const UBf=O(spr2Shift(UB,0,1),['..dFmFmFd.......dFmFmFd..'],0,15);
  const U=(o)=>at(25,24,[(o.hy||0)<0?[cut(UB,0,0,25,3),0,8+o.hy]:null,[o.b||UB,0,8+(o.by||0)],[o.h||UHD,0,o.hy||0],[TU,3,10+(o.hy||0)]].concat(o.fx2||[]));
  T.U={ idle:[U({}), U({h:O(O(UHD,['zqz'],3,7),['zzq'],18,7)})], walk:[U({}), U({hy:-1,by:-1}), U({}), U({hy:1})],
    paw:[U({b:O(wipe(UB,0,5,4,9),['dFFd','dFmFd','.ddd'],0,2)}), U({b:O(wipe(UB,21,5,25,9),['.dFFd','dFmFd','.ddd.'],20,2)})],
    slidew:U({hy:-2}), slide:[U({b:UBf,hy:2,fx2:[[['w..w'],0,21],[['w..w'],21,21]]}), U({b:UBf,hy:2,fx2:[[['.w.w'],0,20],[['w.w.'],21,20]]})],
    tuskw:U({hy:-2}), tusk:U({hy:3}), rec:U({b:UBf,hy:3}), cx0:12, cy0:17 };
})();
/* ---------------- BOULDERBACK (PX K4 · px_art §5.15): a sandstone armadillo — a long banded shell with moss in its seams and a pale rim, tall pointed ears, a
   long pink-tipped snout, stubby clawed legs, a ringed tail · idle: an ear twitch · walk 4 · BALL (the tell): tucked into a banded ball, the snout still peeking ·
   ROLL 4: the rings wheel down a row a frame — ball & roll are ONE drawing (left-right symmetric) in every facing · DIZZY 2 (the punish window): sat back on its
   haunches, the head lolling under eFxPost's stars ---------------- */
SPR2.tpl.boulderback={ r0:9.63, cx0:10, cy0:11, eyeL:'k',
  sel:(en,pose)=>en.st==='windup'?'ball':en.st==='charge'?'roll':en.st==='exposed'?'dizzy':en.mv?'walk':'idle',
  pal:{d:'#6e6448', m:'#9a8e6c', l:'#c0b490', h:'#e0d6b4', b:'#4a4232', g:'#6aa04a', G:'#8ac05a', s:'#d8b8a0', S:'#b8987e', p:'#d88a8a', k:'#1a1208'},
  elite:{d:'#4a4a52', m:'#6e6e7a', l:'#9a9aa6', h:'#c8c8d2', g:'#a0a06a', G:'#c0c08a'} };   // (the elite: a "granite back", lichen in its seams)
(function(){
  const T=SPR2.tpl.boulderback, O=spr2Over, B=(w,h)=>Array(h).fill('.'.repeat(w)), rv=s=>s.split('').reverse().join('');
  const at=(W,H,parts)=>{ let r=B(W,H); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1],p[2]); return r; };
  const sym=L=>L.map(s=>s+rv(s.slice(0,-1)));                                  // (a left half of 10 → a 19-wide row, mirrored about col 9)
  /* ---- the BALL 19 × 18 (lit from above, so left-right symmetric: the same texels in all four views; its bottom row on the shadow): rings of bands round it,
     moss in the seams · BALL: the snout peeking at the bottom (the tuck) · ROLL i: the rings and the moss a row further down (4 frames) ---- */
  const MS=[[4,4,'G'],[5,4,'g'],[3,5,'g'],[6,9,'g'],[7,9,'G'],[5,13,'g']];
  const ball=i=>{ const R=[]; for(let y=0;y<18;y++){ let s=''; for(let x=0;x<19;x++){ const dx=x-9, dy=y-8.5, q=dx*dx/88+dy*dy/79; if(q>1){ s+='.'; continue; }
        const v=dy/8.5+Math.abs(dx)/18, ring=((y+i+(Math.abs(dx)>6?0:Math.abs(dx)>3?1:2))%4)===0 && q<0.93;   // (each ring a ∪ — its middle dips two rows)
        s+=q>0.86&&dy>0?'d':ring?'b':v<-0.55?'h':v<-0.1?'l':v<0.62?'m':'d'; } R.push(s); }
    for(const [x,y0,c] of MS){ const y=3+(y0-3+i)%12, dx=x-9, dy=y-8.5; if(dx*dx/88+dy*dy/79<0.75){ for(const xx of [x,18-x]) R[y]=R[y].slice(0,xx)+c+R[y].slice(xx+1); } }   // (moss in symmetric pairs, rolling with the rings)
    return R; };
  const BALL=O(ball(0),['dSd','sps'],8,15), ROLL=[0,1,2,3].map(ball);
  const onB=(W,H,ax,ay,rows)=>at(W,H,[[rows,ax-9,ay+6-17]]);                   // (the ball's centre column on the anchor, its bottom row on the feet row ay+6)
  /* ---- the profile (facing right) 25 × 18: the body's centre on (11,11), the feet on row 17 ---- */
  const SHELL=['......ddddddd......','...ddlhlhlhlhldd...','..dlhlhbhbhblhhld..','.dlhlGglblblblllmd.','dlhlGggblblblmlmmd.','dllmlmlblblblmlmmmd','dmlmlmmblblblmmmgGd','dmmmmmmbmbmbmmmmggd','dhhhhhhhhhhhhhhhhhd'];   // (scaled shields fore & aft, the bands between)
  const HEAD=['.dd....','dSsd...','dSsd...','.dSsd..','dmmssd.','dmlkssd','.dsssSp','..dSdd.'], HEADt=['dd.....','Ssd....','dSsd...','.dSsd..','dmmssd.','dmlkssd','.dsssSp','..dSdd.'];   // (tall pointed ears, the head shield, the eye, the long pink-tipped snout · an ear twitches)
  const TAIL=['....db','..dbl.','.dbl..','dbl...','bl....'];
  const LEG=['dSs','dSs','dSs','SdS'], LEGu=['dSs','dSs','SdS'], LEGf=['dSs.','.dSs','.dSs','.SdS'], LEGb=['.dSs','dSs.','dSs.','SdS.'];   // (standing · lifted · stepping forward · pushing back)
  const S=(o)=>at(25,18,[[TAIL,0,11+(o.ty||0)],[o.lb||LEG,4,14],[o.lf||LEG,15,14],[SHELL,2,5+(o.by||0)],[o.hd||HEAD,18,7+(o.hy||0)]]);
  const SIT=['....ddddddd....','..ddlhlhlhldd..','.dlhbhlbllbmmd.','.dhlhbllblmbmmh','dlhlGgbllbmmbmh','dllGgllbmmbmmh.','dllglmlmbmmbh..','dmlmlmmmmbmh...','dmlmmmmgGmh....','dmmmmmmmmh.....','dmmmmmmmh......','dmmmmmmh.......','.dmmmmh........','..hhhh.........'];   // (dizzy: sat back, the banded shell a big arch behind it — its rim along the belly)
  const BELLY=['..........sd..','..........ssd.','.........sssd.','........sssSd.','.......sssSd..','......sssSd...','.....sssSSd...','....sssSSd....','...sssSSd.....','..sssSdd......'];
  const HZ=['.ddd........','dSSddd......','.ddmmmd.....','...dmmmsd...','...dmlkssd..','....dssssSd.','.....ddsSSSp','.......ddd..'];   // (the head lolling out over its belly, the ears flopped back, the long snout drooping)
  const SD=(hx,hy)=>at(25,18,[[TAIL,0,13],[BELLY,6,6],[SIT,1,3],[['dSs','SdS'],9,16],[['dSs','SdS'],13,16],[['dS','Sd'],16,11],[HZ,hx,hy]]);
  T.S={ idle:[S({}), S({hd:HEADt})], walk:[S({lb:LEGb,lf:LEGf}), S({lf:LEGu,by:-1,hy:-1}), S({lb:LEGf,lf:LEGb}), S({lb:LEGu,by:-1,hy:-1})],
    ball:onB(25,18,10,11,BALL), roll:ROLL.map(r=>onB(25,18,10,11,r)), dizzy:[SD(11,0), SD(12,1)], cx0:10 };
  /* ---- toward the camera 19 × 20 (the body's centre on (9,13), the feet on row 19): the banded dome arching over a small head, the ears inside
     it, the eyes, the snout pointing down at you to its pink tip below the rim, the front legs under it (PX4 FIX: no cat face over a box) ---- */
  const DSH=sym(['......dddd','....ddlhhh','...dlhhlll','..dlhbbbbb','.dlhblllll','.dlhbbbbbb','.dlGglllll','.dlbbbbbbb','.dlllllllm','.dhhhhhhhh']);   // (the bands as arcs over the back)
  const DHD=sym(['.......dd.','.......dSd','......dmmm','......dklm','.......dsS','........ds','........dp']), DHDt=sym(['......dd..','......dSd.','......dmmm','......dklm','.......dsS','........ds','........dp']);   // (a small head peeking out under the front of the dome: two little ears, the head shield, the eyes, the long snout at you to its pink tip · an ear flick)
  const DLG=(a,b)=>[[['dSd','dSs','dSs','SdS'].slice(a||0),3,16+(a||0)],[['dSd','sSd','sSd','SdS'].slice(b||0),13,16+(b||0)]];
  const D=(o)=>at(19,20,[[DSH,0,6+(o.by||0)]].concat(o.lg||DLG(),[[o.hd||DHD,0,11+(o.hy||0)]]));
  const DBY=['..dsssssd..','.dssssssSd.','.dsssssSSd.','.dssssSSSd.','..dsSSSSd..','...ddddd...'];   // (dizzy: sat back — the pale belly under its head, the shell a dome reared up behind)
  const DD=(dx)=>at(19,20,[[DSH,0,3],[DBY,4,12],[['dS','Sd'],3,13],[['Sd','dS'],14,13],[['dSd','SdS'],3,18],[['dSd','SdS'],13,18],[spr2Shift(DHD,dx,0),0,7]]);
  T.D={ idle:[D({}), D({hd:DHDt})], walk:[D({lg:DLG(1,0)}), D({by:-1,hy:-1}), D({lg:DLG(0,1)}), D({by:-1,hy:-1})],
    ball:onB(19,20,9,13,BALL), roll:ROLL.map(r=>onB(19,20,9,13,r)), dizzy:[DD(-1), DD(1)], cx0:9, cy0:13 };
  /* ---- from behind 19 × 20: the banded back (arcs) with its moss, the ringed tail down the middle, the hind legs ---- */
  const UB=sym(['......dddd','....ddlhhh','...dlhbbbb','..dlhblllG','.dlhbbbbbb','.dllblllll','.dlbbbbbbb','.dlblllllm','.dmbbbbbbb','.dhhhhhhhh']);
  const UT=['.bl','.lb','..b'], UT2=['lb.','bl.','b..'];
  const ULG=(a,b)=>[[['dSd','dSs','SdS'].slice(a||0),3,17+(a||0)],[['dSd','sSd','SdS'].slice(b||0),13,17+(b||0)]];
  const U=(o)=>at(19,20,[[UB,0,8+(o.by||0)]].concat(o.lg||ULG(),[[o.t||UT,8,17]]));
  const USIT=sym(['...ddddddd','..dlhhhlll','.dlbbbbbbb','.dlhllllll','.dlbbbbbbb','.dllllGgll','.dlbbbbbbb','.dlhlllllm','..dbbbbbbb','...dmmmmmm','....ddddbd']);
  const UHD=sym(['...ds.....','...dSd....','...dSsdddd','....dmmmmm','....dmmmmm','.....dmmmm']);
  const UD=(dx)=>at(19,20,[[USIT,0,8],[['dSd','SdS'],4,18],[['dSd','SdS'],12,18],[['bl','lb'],9,18],[spr2Shift(UHD,dx,0),0,2]]);
  T.U={ idle:[U({}), U({t:UT2})], walk:[U({lg:ULG(1,0)}), U({by:-1,t:UT2}), U({lg:ULG(0,1)}), U({by:-1,t:UT2})],
    ball:onB(19,20,9,13,BALL), roll:ROLL.map(r=>onB(19,20,9,13,r)), dizzy:[UD(-1), UD(1)], cx0:9, cy0:13 };
})();
/* ---------------- DUNE SCORPION (PX K5 · px_art §5.16): a sand-gold scorpion — the low segmented body, two big pincers held forward on their arms, eight
   legs, the classic tail arched over its back with a dark stinger · idle: the stinger sways · walk 4 · SNAP: the pincers gape · snapAct: clamped & thrust ·
   STINGW (the tell, every facing): the tail reared high & forward, the stinger venom-GREEN & glinting · STING: struck down in front, green ---------------- */
SPR2.tpl.scorpion={ r0:7.78, cx0:10, cy0:10, eyeL:'k',
  sel:(en,pose)=>{ const sg=en.atk===ATK.scorpion[1]; return en.st==='wind'?(sg?'stingw':'snap'):en.st==='act'?(sg?'sting':'snapAct'):en.mv?'walk':'idle'; },
  pal:{d:'#8a6430', m:'#c89a50', l:'#e0b868', h:'#f8dc98', s:'#a88040', n:'#6a4a20', v:'#9be85a', V:'#e0ffb0', k:'#1a0e04'},
  elite:{d:'#2a2a3a', m:'#4a4a62', l:'#6a6a8a', h:'#9a9ab8'} };
(function(){
  const T=SPR2.tpl.scorpion, O=spr2Over, B=(w,h)=>Array(h).fill('.'.repeat(w)), pad=(w,L)=>L.map(r=>(r+'.'.repeat(w)).slice(0,w));
  const at=(W,H,parts)=>{ let r=B(W,H); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1],p[2]); return r; };
  /* ---- the profile (facing right) 24 × 16: the body's centre on (9,10), the feet on row 15 ---- */
  const BODY=pad(13,['.......hhhl..','..hhlhhllllk.','.hllsllsllllh','hlmmsmmsmlmml','mmmmsmmsmmmmd','.ddddddddddd.']);
  const TAIL={
    idle:pad(12,['............','............','..hhhl......','.hllmmls....','hlms...mln..','lmm....nnnn.','lms.....nnn.','lmm.....n...','dlm.........','.dl.........']),
    idle2:pad(12,['............','............','..hhhl......','.hllmmls....','hlms...mln..','lmm....nnnn.','lms....nnn..','lmm.....n...','dlm.........','.dl.........']),
    stingw:pad(18,['.hhhhlll..........','hllmmmmmlls.......','lms.......smls....','lmm.........mlvv..','lms.........vVvvv.','lmm..........vvv..','lms............v..','lmm...............','dlm...............','.dl...............']),
    sting:pad(21,['.....................','...hhhhlll...........','.hhllmmmmmmlls.......','hlms..........mls....','lmm.............mls..','lms...............mvv','lmm..............vVvv','lms...............vv.','dlm.................v','.dl..................']) };
  /* the near pincer on its arm (the arm's root on the head) · the far one peeks above, a step darker */
  const CLAW={
    rest:pad(9,['....hhl..','...hlllll','..hlll...','..llll...','..mmmmmm.','.l.dd....','l........']),
    open:pad(9,['....hhl.l','...hllll.','..hlll...','..llll...','..mmmm...','.l.ddmmm.','l........']),
    shut:pad(11,['......hhl..','.....hlllll','....hllllll','....lllmmm.','....mmmm...','..ll.dd....','ll.........']) };
  const FAR={ rest:pad(9,['....ddm..','...dmmmmm','..dmm....']), open:pad(9,['....ddm.m','...dmmmm.','..dmm....']), shut:pad(11,['......ddm..','.....dmmmmm','....dmmmmmm']) };
  const LEGS={
    st:pad(24,['.....d..d...d..d........','....d..d.....d..d.......','...d...d.....d...d......']),
    a: pad(24,['.....d..d...d..d........','.....d.d.....d.d........','....d..d.....d..d.......']),
    b: pad(24,['.....d..d...d..d........','....d...d...d...d.......','...d....d...d....d......']) };
  const S=(o)=>{ const c=o.c||'rest', cx=o.cx!=null?o.cx:14, cy=o.cy||0, tl=[o.tl||TAIL.idle,0,o.ty!=null?o.ty:0]; return at(24,16,[o.top?null:tl,[FAR[c],cx+2,4+cy],[o.lg||LEGS.st,0,13],[BODY,2,7+(o.by||0)],[CLAW[c],cx,5+cy],o.top?tl:null]); };
  T.S={ idle:[S({}), S({tl:TAIL.idle2})],
    walk:[S({lg:LEGS.a}), S({lg:LEGS.st,by:0}), S({lg:LEGS.b}), S({lg:LEGS.st})],
    snap:S({c:'open',cy:-1}), snapAct:S({c:'shut',cx:13}),
    stingw:S({tl:TAIL.stingw,ty:0}), sting:S({tl:TAIL.sting,ty:0,top:1}), cx0:10 };
  /* ---- toward the camera 21 × 20 (the body's centre on (10,14), the front feet on row 19): the claws spread at you on their arms, the head's two
     eyes, the segmented back rising behind, four legs a side · the tail stands up behind it and curls over toward you, the stinger poised above ---- */
  const rv=s=>s.split('').reverse().join(''), sym=L=>L.map(s=>s+rv(s.slice(0,10)));   // (a left half of 11 → the 21-wide row, mirrored about col 10)
  const BODYD=sym(['...........','...........','...........','...........','...........','...........','...........','........hhl','.......hlll','......hllss','..dd..hlmmm','.d..d.lllss','......lmmmm','.......hlll','......hllhl','......lkllm','......dmmmm','.......dddd','...........','...........']);
  const LEGD={ st:sym(['..d..d.....','.d..d......','d..d.......','..d........']), a:sym(['..d..d.....','..d.d......','.d.d.......','...d.......']), b:sym(['..d..d.....','.d...d.....','d....d.....','.....d.....']) };
  const PINC={ rest:['..hhh..','.hllll.','hlllllm','lll.lmm','ll...mm','.d...d.'], open:['.hh..hl','hll..lm','hlllllm','llllmmm','.lmmmm.','..ddd..'], shut:['..hhh..','.hllll.','.lllll.','..llm..','..lmm..','...d...'] };
  const ARMD=['lll','..l'];
  const TAILD={
    idle:pad(21,['.........hhhl........','........hlmmll.......','........lms.mnn......','........lmm.nnnn.....','........lms..nn......','.........lm..n.......','.........ls..........','.........lm..........','.........dm..........']),
    stingw:pad(21,['.......hhhhl.........','......hlmmmmll.......','......lms...ml.......','......lmm..vvvv......','......lms.vVvvvv.....','.......lm..vvvv......','.......ls...vv.......','.......lm............','........dm...........']),
    sting:pad(21,['.....................','.........hhhl........','........hlmmll.......','........lms.sm.......','.........lm.lm.......','.........ls.ls.......','.........lm.lm.......','.........ls.ls.......','.........dm.lm.......']) };
  const D=(o)=>{ const c=o.c||'rest', P=PINC[c], px=o.px||0, py=o.py||0, lg=o.lg||LEGD.st;
    return at(21,20,[[o.tl||TAILD.idle,0,o.ty||0],[lg,0,9],[BODYD,0,0],[ARMD,4,15],[spr2Mir(ARMD),14,15],[P,0-px,13+py],[spr2Mir(P),14+px,13+py],o.fx||null]); };
  T.D={ idle:[D({}), D({ty:1})], walk:[D({lg:LEGD.a}), D({}), D({lg:LEGD.b}), D({})], snap:D({c:'open',px:1}), snapAct:D({c:'shut',px:-2,py:1,fx:[['k.....k'],7,15]}),
    stingw:D({tl:TAILD.stingw}), sting:D({tl:TAILD.sting,fx:[pad(7,['..mlm..','.vvvvv.','vVvvvvv','.vvvvv.','...v...']),7,14]}), cx0:10, cy0:14 };
  /* ---- from behind 21 × 20 (the body's centre on (10,14), the hind feet on row 19): the tail rising nearest you from the back's end, the stinger up
     at its curl · the banded back · the claws reaching out beyond the head ---- */
  const BODYU=sym(['...........','...........','...........','...........','...........','...........','.......hhls','......hllms','.....hlmsss','.....lmmsss','.....lmssss','.....lmmsss','.....dmssss','......dmsss','.......dddd','...........','...........','...........','...........','...........']);   // (PX5 FIX: the back a band darker under the tail)
  const LEGU={ st:sym(['..d..d.....','.d...d.....','d.....d....','.....d.....','...d.d.....','..d........','..d........']), a:sym(['..d..d.....','..d.d......','.d....d....','.....d.....','....dd.....','...d.......','...d.......']), b:sym(['..d..d.....','.d...d.....','d......d...','d....d.....','..d..d.....','.d.........','.d.........']) };
  const PINCU={ rest:['.hh.h','hll.l','hlllm','.lmm.','..ll.','...l.'], open:['h...h','hl.ll','hlllm','.lmm.','..ll.','...l.'], shut:['..h..','.hll.','.llm.','..mm.','..ll.','...l.'] };
  const TB=['........dhhld........','........dllmd........','.........ddd.........'], TB3=TB.concat(TB,TB), TBASE=['.........hhd.........','.........lld.........','.........ddd.........','.........hld.........','.........dd..........'];   // (PX5 FIX: light beads, each with its own dark joint — it stands off the back)
  const TAILU={
    idle:pad(21,['.........hhhl........','........hhllnn.......','........dhlnnnn......','........dhhd.nn......'].concat(TB3,TBASE.slice(0,4),['.........lld.........','.........dd..........'])),
    stingw:pad(21,['.........vvv.........','........vVvvv........','........vvvvv........','.........vvv.........'].concat(TB3,TBASE.slice(0,4),['.........lld.........','.........dd..........'])),
    sting:pad(21,['.....................','.....................','.....................','........vVvv.........','.......vvvvvv........','........vvvv.........'].concat(TB,TB,TBASE)) };
  const U=(o)=>{ const c=o.c||'rest', P=PINCU[c], px=o.px||0, py=o.py||0, lg=o.lg||LEGU.st;
    return at(21,20,[[lg,0,8],[BODYU,0,0],[['ll.','..l'],4,6],[spr2Mir(['ll.','..l']),14,6],[P,1-px,2+py],[spr2Mir(P),15+px,2+py],[o.tl||TAILU.idle,0,o.ty!=null?o.ty:0]]); };   // (PX5 FIX: the claws a row lower, the curl & stinger up over them)
  T.U={ idle:[U({}), U({ty:1})], walk:[U({lg:LEGU.a}), U({}), U({lg:LEGU.b}), U({})], snap:U({c:'open',px:1}), snapAct:U({c:'shut',px:-1,py:-1}),
    stingw:U({tl:TAILU.stingw,ty:0}), sting:U({tl:TAILU.sting,ty:2}), cx0:10, cy0:14 };
})();
/* ---------------- MANTIS SHRIMP (PX K5 · px_art §5.17): a rainbow shrimp — its cyan · green · gold · pink segments, the tail fan, a red-orange head with two
   gold eyes up on stalks, the pink clubs folded under its chin · idle: the stalks twitch · walk 4 · WIND (the tell, every facing): the clubs pulled back & WHITE-
   HOT, flickering · ACT: thrown forward full length · REC 2: the clubs dragging, the body slumped ---------------- */
SPR2.tpl.mshrimp={ r0:7.41, cx0:10, cy0:6, eyeL:'k',
  sel:(en,pose)=>en.st==='wind'?'wind':en.st==='act'?'act':en.st==='recover'?'rec':en.mv?'walk':'idle',
  pal:{'1':'#5ac0d8', '2':'#6ad06a', '3':'#f0c040', '4':'#d85aa0', b:'#2a1a30', d:'#a03a2a', m:'#e86a50', l:'#f08a6a', h:'#ffc0a0', c:'#ff9ab8', C:'#b04a78', W:'#ffffff', Y:'#fff3c0', e:'#ffe066', k:'#1a0a14', n:'#3a1a2a'},
  elite:{d:'#4a2a6a', m:'#7a4aa8', l:'#a070d0', h:'#d0a8f0'} };
(function(){
  const T=SPR2.tpl.mshrimp, O=spr2Over, B=(w,h)=>Array(h).fill('.'.repeat(w)), pad=(w,L)=>L.map(r=>(r+'.'.repeat(w)).slice(0,w));
  const at=(W,H,parts)=>{ let r=B(W,H); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1],p[2]); return r; };
  const hot=(rows,y)=>spr2Rep(rows,y?{c:'Y',C:'W'}:{c:'W',C:'Y'});   // (the clubs white-hot: a flicker W ↔ Y)
  const rv=s=>s.split('').reverse().join(''), sym=(L,c)=>L.map(s=>s+rv(s.slice(0,c)));
  /* ---- the profile (facing right) 22 × 12: the body's centre on (10,6), the legs on row 11 ---- */
  const BODY=pad(17,['...........hhh...','..b4b4.hhhhllllh.','1b2b3b4dmlllllllh','1b22b33b4dmmllllm','1b22b33b44dmmmmmd','1b22b33b44dddddd.','.b2b3b4b4........']);
  const FAN=pad(5,['.4...','414..','1144.','b1112','1144.','414..','.4...']);
  const EYES=pad(5,['..ee.','.eke.','..d..','..d..']), EYES2=pad(5,['.ee..','eke..','.d...','..d..']);   // (the stalks twitch)
  const LEGS={ st:pad(22,['....n.n.n.n.n.........','...n.n.n.n.n..........']), a:pad(22,['....n.n.n.n.n.........','....nn.nn.nn..........']), b:pad(22,['....n.n.n.n.n.........','...n..n..n..n.........']) };
  const CLUB={ fold:pad(6,['cc....','.cC...','.ccCc.','cccCCc','.CCCC.']),
    back:pad(6,['.cccC.','cccCCC','.cCCC.','..cC..','...cC.']),
    fwd:pad(10,['.......cc.','cccccccCCc','.CCCCCcCCc','.......CC.']),
    drag:pad(7,['.cC....','..cCC..','...cccC','....CC.']) };
  const S=(o)=>at(22,12,[[FAN,0,3+(o.by||0)],[o.lg||LEGS.st,0,10],[BODY,2,2+(o.by||0)],[o.cl||CLUB.fold,o.cx!=null?o.cx:14,o.cy!=null?o.cy:6],[o.ey||EYES,14,0+(o.by||0)]]);
  T.S={ idle:[S({}), S({ey:EYES2})],
    walk:[S({lg:LEGS.a}), S({by:0}), S({lg:LEGS.b}), S({})],
    wind:[S({cl:hot(CLUB.back,0),cx:11,cy:0}), S({cl:hot(CLUB.back,1),cx:11,cy:0})],
    act:S({cl:CLUB.fwd,cx:12,cy:5}),
    rec:[S({cl:CLUB.drag,cx:14,cy:8,by:1}), S({cl:CLUB.drag,cx:14,cy:8,by:1,ey:EYES2})], cx0:10 };
  /* ---- toward the camera 13 × 18 (the body's centre on (6,12), the legs on row 17): the big stalked eyes up front, the red head shield, the clubs
     folded either side · the rainbow back going away behind it, the tail fan at the far end ---- */
  const BD=sym(['....4.','...414','...111','..b111','..b222','..b222','..b333','..b333','..b444','..hhll','.dmlll','.dmllh','.dmmll','.ddmmm','..dddd','......','......','......'],5);
  const EYD=pad(13,['.ee.......ee.','.eke.....eke.','..dd.....dd..','....d...d....','.....d.d.....']), EYD2=pad(13,['ee.........ee','eke.......eke','.dd.......dd.','...dd...dd...','.....d.d.....']);
  const LGD={ st:sym(['...n.n','..n..n'],5), a:sym(['...n.n','...nn.'],5), b:sym(['...n.n','..n...'],5) };
  const CD={ fold:['.c.','cC.','cCc','cCC','.C.'], up:['.cc','cCc','cCC','.cC','..c'], fwd:['.cc.','cCCc','cCCc','.CC.'], drag:['..c','.cC','cCC','.CC'] };
  const D=(o)=>{ const c=o.c||CD.fold, cy=o.cy!=null?o.cy:10, cx=o.cx||0; return at(13,18,[[o.lg||LGD.st,1,15],[BD,1,(o.by||0)],[o.ey||EYD,0,4+(o.by||0)],[c,0+cx,cy],[spr2Mir(c),13-cx-c[0].length,cy]]); };
  T.D={ idle:[D({}), D({ey:EYD2,by:0})], walk:[D({lg:LGD.a}), D({}), D({lg:LGD.b}), D({})],
    wind:[D({c:hot(CD.up,0),cy:6}), D({c:hot(CD.up,1),cy:6})], act:D({c:CD.fwd,cy:13,cx:2}),
    rec:[D({c:CD.drag,cy:14,by:1}), D({c:CD.drag,cy:14,by:1,ey:EYD2})], cx0:6, cy0:12 };
  /* ---- from behind 13 × 18: the tail fan nearest you, the rainbow back going away, the red head beyond — the backs of its eye stalks — the clubs at its sides ---- */
  const BU=sym(['......','......','..dmll','.dmmll','.dmmmm','..dddd','..b444','..b444','..b333','.b3333','.b2222','.b2222','.b1111','..1111','.41414','414141','4.4.4.','......'],5);
  const EYU=pad(13,['..dd...dd..','...d...d...','....d.d....']);
  const CU={ fold:['.c.','cC.','cCc','.C.'], up:['cc.','cCc','.CC','..c'], fwd:['.cc.','cCCc','.cC.'], drag:['...','.c.','cCc','.CC'] };
  const U=(o)=>{ const c=o.c||CU.fold, cy=o.cy!=null?o.cy:3, cx=o.cx||0; return at(13,18,[[o.lg||LGD.st,1,15],[BU,1,(o.by||0)],[EYU,1,0+(o.by||0)],[c,0+cx,cy],[spr2Mir(c),13-cx-c[0].length,cy]]); };
  T.U={ idle:[U({}), U({})], walk:[U({lg:LGD.a}), U({}), U({lg:LGD.b}), U({})],
    wind:[U({c:hot(CU.up,0),cy:0}), U({c:hot(CU.up,1),cy:0})], act:U({c:CU.fwd,cy:0,cx:2}),
    rec:[U({c:CU.drag,cy:5,by:1}), U({c:CU.drag,cy:5,by:1})], cx0:6, cy0:12 };
})();
/* ---------------- PRISM BEETLE (PX K5 · px_art §5.18): a crystal beetle — a high dome cut like a gem (a white table facet, pink & gold crown facets, the girdle
   seam, mint & lavender below), the dark head, a clear prism HORN · idle: a bob · walk 4 · GATHER 2: the horn takes light, a spark grows at its tip · LOCK 2:
   white, a steady 2×2 tip pulsing · FIRE: horn & tip blazing, a star · COOL 2 (the punish window): the elytra parted, the wings out, the horn dull & smoking
   (the horn's light shows over its head from behind) ---------------- */
SPR2.tpl.beetle={ r0:7.78, cx0:9, cy0:8, eyeL:'y',
  sel:(en,pose)=>en.st==='wind'?(en.lk?'lock':'gather'):en.st==='act'?'fire':en.st==='exposed'?'cool':en.mv?'walk':'idle',
  pal:{d:'#5a8aa0', m:'#a8e0f0', l:'#d0f4ff', h:'#ffffff', s:'#78b4cc', H:'#2a3a4a', n:'#1e2a34', '1':'#ff9ad8', '2':'#ffe27a', '3':'#8af0c8', '4':'#a8b4ff',
    c:'#d8fbff', G:'#c8f6ff', L:'#f0ffff', W:'#ffffff', X:'#6a8a96', w:'#e4f6ff', y:'#e8ff7a'},
  elite:{d:'#6a4a8a', m:'#c0a0e8', l:'#e0d0ff', h:'#ffffff'} };
(function(){
  const T=SPR2.tpl.beetle, O=spr2Over, B=(w,h)=>Array(h).fill('.'.repeat(w)), pad=(w,L)=>L.map(r=>(r+'.'.repeat(w)).slice(0,w));
  const at=(W,H,parts)=>{ let r=B(W,H); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1],p[2]); return r; };
  const rv=s=>s.split('').reverse().join('');
  /* ---- the profile (facing right) 22 × 14: the body's centre on (10,8), the feet on row 13 — a high dome cut like a gem (a white table facet, pink &
     gold crown facets, the girdle seam, mint & lavender below), the dark head, the clear prism horn ---- */
  const DOME=pad(15,['.....mmlmm.....','...mmlhlmmmd...','..m11lmhml22d..','.m111lmmml222d.','m1111lmddl2222d','lllllllllllllld','d33ld44ld333ddd','dd33ld4ld33dddd','dddddldldddddds','.sssssssssssss.']);
  const COOL=pad(15,[                                                       // (cooling: the elytra parted down the seam, the hind one lifted)
    '..mmml.........',
    '.mm11l...mmmm..',
    'm111l...m1l22d.',
    'm111l...ml222d.',
    'm11ll..mml222dd',
    'llll...lllllllld',
    'd33l.d4ld333ddd',
    'd33l.d4ld33dddd',
    'dddl.dldddddddd',
    '.sss.sssssssss.']);
  const WING=pad(8,['wwww....','.whwww..','..wwhww.','...wwww.','....www.']);
  const HEAD=pad(5,['.HHH.','HHyHH','HHHHH','.HHH.']);
  const HORN={ c:pad(5,['c....','ccc..','ccccc','cc...']), G:pad(5,['G....','GGG..','GGGGW','GG...']), L:pad(6,['L.....','LLL.WW','LLLLWW','LL....']),
    W:pad(7,['W....W.','WWW.WW.','WWWWWWW','WW..WW.','.....W.']), X:pad(5,['X....','XXX..','XXXXX','XX...']) };
  const LEGS={ st:pad(22,['....n....n....n.......','...n....n......n......','...n....n......n......']), a:pad(22,['....n....n....n.......','....n...n.....n.......','....n....n.....n......']), b:pad(22,['....n....n....n.......','...n.....n.....n......','..n......n......n.....']) };
  const S=(o)=>at(22,14,[[o.lg||LEGS.st,0,11],[o.dm||DOME,2,1+(o.by||0)],o.wg?[WING,0,0+(o.by||0)]:null,[HEAD,14,6+(o.by||0)],[o.hn||HORN.c,17,6+(o.by||0)],o.fx||null]);
  const SPK=(c,x,y)=>[[c],x,y];
  T.S={ idle:[S({}), S({by:1})],
    walk:[S({lg:LEGS.a}), S({}), S({lg:LEGS.b}), S({})],
    gather:[S({hn:HORN.G}), S({hn:HORN.G,fx:SPK('W',21,7)})],
    lock:[S({hn:HORN.L}), S({hn:spr2Rep(HORN.L,{W:'L',L:'W'})})],
    fire:S({hn:HORN.W}),
    cool:[S({dm:COOL,wg:1,hn:HORN.X,fx:SPK('X',21,5)}), S({dm:COOL,wg:1,hn:HORN.X,by:1,fx:SPK('X',20,4)})], cx0:9 };
  /* ---- toward the camera 21 × 18 (the body's centre on (10,12), the feet on row 17): the gem-cut dome rising behind, the dark head with its two eyes, the
     prism horn pointing at you under it, six legs splayed OUT of its flanks (PX5 FIX: hung under the dome they read as a jellyfish's tentacles) ---- */
  const symc=(L,map,c)=>L.map(s=>{ c=c||s.length-1; return s+spr2Rep([rv(s.slice(0,c))],map)[0]; }), FM={'1':'2','3':'4'};
  const DOMED=[' '].concat(symc(['....mmm','..mmmlh','.m11lmm','.m111lm','m1111lm','m1111lm','lllllll','d333ldd','dd33ldd','ddd3ldd','.ssssss'],FM)).slice(1).map(r=>'..'+r+'..');
  const HEADD=pad(17,['....HHHHHHHHH....','....HHyHHHyHH....','.....HHHHHHH.....','......HHHHH......']);
  const HORND={ c:pad(17,['.......cccc......'.slice(0,17),'.......ccc.......','........c........']), G:pad(17,['.......GGG.......','.......GGG.......','........W........']), L:pad(17,['.......LLL.......','.......LWL.......','.......WWW.......','........W........']),
    W:pad(17,['.......LLL.......','......WWWWW......','.....W.WWW.W.....','......WWWWW......','........W........']), X:pad(17,['.......XXX.......','.......XXX.......','........X........']) };
  const LEGD={ st:symc(['.........','..n......','.n.......','.n.......','.........','..n......','.n.......','.n.......'],{}), a:symc(['.........','...n.....','..n......','..n......','.........','.n.......','n........','n........'],{}), b:symc(['.........','.n.......','n........','n........','.........','...n.....','..n......','..n......'],{}) };
  const WINGD=symc(['ww.......','whw......','.www.....','..ww.....'],{});
  const sy=(L)=>L.map(s=>s+s.slice(0,10).split('').reverse().join('')); const LEGD2={ st:sy(['...........','...........','...........','...........','n..........','.n.........','..nn.......','...........','...........','.nnn.......','n..........','...........','....n......','...n.......','..n........','..n........','...........','...........']), a:sy(['...........','...........','...........','n..........','.n.........','..nn.......','...........','...........','n..........','.nnn.......','...........','...........','....n......','...n.......','...n.......','..n........','...........','...........']), b:sy(['...........','...........','...........','...........','...........','.nn........','n.nn.......','...........','...........','.nnn.......','.n.........','...........','....n......','...n.......','..n........','.n.........','...........','...........']) };
  const D=(o)=>{ const body=at(17,18,[o.wg?[WINGD,0,0]:null,[o.dm||DOMED,0,1+(o.by||0)],[HEADD,0,10+(o.by||0)],[o.hn||HORND.c,0,14+(o.hy||0)],o.fx||null]).map(r=>'..'+r+'..'); return at(21,18,[[o.lg||LEGD2.st,0,0],[body,0,0]]); };
  const DCOOL=DOMED.map((r,i)=>i<10?r.slice(0,7)+'.s.'+r.slice(10):r);   // (cooling: the elytra parted down the middle)
  T.D={ idle:[D({}), D({by:1})], walk:[D({lg:LEGD2.a}), D({}), D({lg:LEGD2.b}), D({})],
    gather:[D({hn:HORND.G}), D({hn:HORND.G,fx:[['W'],8,17]})], lock:[D({hn:HORND.L}), D({hn:spr2Rep(HORND.L,{W:'L',L:'W'})})], fire:D({hn:HORND.W,hy:-1}),
    cool:[D({dm:DCOOL,wg:1,hn:HORND.X,fx:[['X'],10,16]}), D({dm:DCOOL,wg:1,hn:HORND.X,by:1,fx:[['X'],11,15]})], cx0:10, cy0:12 };
  /* ---- from behind 21 × 18: the faceted elytra and their DARK seam nearest you, the head beyond, the horn's tip just over it (its glow shows here too), six
     legs splayed out of its flanks (PX5 FIX) ---- */
  const DOMEU=symc(['...mmmm','.mmm11l','.m1111l','m11111l','m1111ll','m111l3l','d11l33l','d1l333l','dl3333l','d33333l','dd333dl','.ddddds','..sssss'],FM).map(r=>'..'+r.slice(0,6)+'n'+r.slice(7)+'..');
  const HEADU=pad(17,['.......HHH.......','......HHHHH......']);
  const HORNU={ c:pad(17,['........c........']), G:pad(17,['........W........','........G........']), L:pad(17,['.......WWW.......','........L........']),
    W:pad(17,['......W.W.W......','.......WWW.......','......WWWWW......','.......WWW.......']), X:pad(17,['........X........']) };
  const LEGU={ st:symc(['.n.......','n........','.........','.n.......','n........','.........','..n......','..n......'],{}), a:symc(['..n......','.n.......','.........','n........','n........','.........','.n.......','.n.......'],{}), b:symc(['n........','n........','.........','..n......','.n.......','.........','...n.....','...n.....'],{}) };
  const WINGU=symc(['.ww......','wwhw.....','.wwww....','...ww....'],{});
  const LEGU2={ st:sy(['...........','...........','...........','...........','...........','n..........','.nn........','...........','...........','nnn........','...........','...........','.nn........','n..........','...........','...........','...........','...........']), a:sy(['...........','...........','...........','...........','n..........','.nn........','...........','...........','n..........','.nn........','...........','...........','.nn........','...........','n..........','...........','...........','...........']), b:sy(['...........','...........','...........','...........','...........','...........','nnn........','...........','...........','nnn........','...........','.nn........','n..........','...........','...........','...........','...........','...........']) };
  const U=(o)=>{ const body=at(17,18,[[HEADU,0,2],[o.hn||HORNU.c,0,o.hy!=null?o.hy:1],[o.dm||DOMEU,0,4+(o.by||0)],o.wg?[WINGU,0,5]:null]).map(r=>'..'+r+'..'); return at(21,18,[[o.lg||LEGU2.st,0,0],[body,0,0]]); };
  const UCOOL=DOMEU.map((r,i)=>r.slice(0,7)+'.s.'+r.slice(10));
  T.U={ idle:[U({}), U({by:1})], walk:[U({lg:LEGU2.a}), U({}), U({lg:LEGU2.b}), U({})],
    gather:[U({hn:HORNU.G,hy:0}), U({hn:spr2Rep(HORNU.G,{G:'W'}),hy:0})], lock:[U({hn:HORNU.L,hy:0}), U({hn:pad(17,['.......LWL.......','........W........']),hy:0})], fire:U({hn:HORNU.W,hy:0}),
    cool:[U({dm:UCOOL,wg:1,hn:HORNU.X}), U({dm:UCOOL,wg:1,hn:HORNU.X,by:1})], cx0:10, cy0:12 };
})();
/* ---------------- THICKET MANTIS (PX K5 · px_art §5.19): an orchid-jade mantis — long feelers, a triangle head with big red eyes, the long neck, the leaf-winged
   abdomen with its rose tip, thin legs, the rose scythes with pale blades folded before its chest (praying) · idle: a sway · walk 4 · GUARD 2 (don't strike):
   the scythes crossed in an X before its face, a silver glint hopping on the blades · WIND: flung wide & high · CUT1 / CUT2: one scythe swept, then the other ·
   CTRW: one drawn far back (the counter) · CTR: swept across · REC: scythes low ---------------- */
SPR2.tpl.tmantis={ r0:7.78, cx0:7, cy0:14, eyeL:'e',
  sel:(en,pose)=>{ const C=en.atk===ATK.tmantis[2]; return en.st==='guard'?'guard':en.st==='wind'?(C?'ctrw':'wind'):en.st==='act'?(C?'ctr':(en.sl>0?'cut2':'cut1')):en.st==='recover'?'rec':en.mv?'walk':'idle'; },
  pal:{d:'#1e6a50', m:'#3cbf94', l:'#78dcb4', h:'#b8f4d8', b:'#f6ecc8', a:'#ff8aa8', A:'#c85a78', s:'#fff4dc', S:'#ffffff', e:'#ff4030', E:'#ffe0a0', p:'#ff7a9a'},
  elite:{d:'#6a4a14', m:'#c89a2c', l:'#e8c050', h:'#fff0a0'} };
(function(){
  const T=SPR2.tpl.tmantis, O=spr2Over, B=(w,h)=>Array(h).fill('.'.repeat(w)), pad=(w,L)=>L.map(r=>(r+'.'.repeat(w)).slice(0,w));
  const at=(W,H,parts)=>{ let r=B(W,H); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1],p[2]); return r; };
  const rv=s=>s.split('').reverse().join('');
  /* ---- the profile (facing right) 16 × 20: the body's centre on (7,14), the feet on row 19 — an upright mantis: the leaf-winged abdomen raised behind
     (its rose tip), the long thorax rising, the triangle head on top with its big red eye, its mouth down & feelers forward, the big rose scythes folded
     before its chest (PX5 FIX: no crest, no beak — it read as a heron) ---- */
  const BODY=pad(16,['..............d.','............dd..','........dhhhd...','.........eeEl...','.........eelm....','.........hlmA...','........hlmd....','........lmd.....','.......hlm......','.......lmd......','.hhhhhhlmd......','hllhllhlmd......','pmmmmmmmmd......','.pbbbbbmd.......','..dddddd........','................']);
  /* the scythes: [rows, dx, dy] from the shoulder (col 10, row 8) — the near one rose & pale blade, the far one a step behind in its shade */
  const ARM={
    pray:[['....ss','...aAs','..aA.s','.aA..s','aA...s','A...ss'],0,-1],
    guard:[['.s...s','..s.s.','...s..','..s.s.','.a...s','aA....'],0,-6],
    wide:[['.....s','....s.','...s..','..a...','..a...','.a....','a.....'],0,-7],
    cut:[['aa.....','.Aaa...','...Asss','......s'],0,0],
    low:[['a....','.a...','.Aa..','...ss','....s'],0,0],
    back:[['s.....','.s....','..as..','...aa.'],-5,-3],
    sweep:[['aaasss.','.AA..sS'],0,-1] };
  const FAR={ pray:[['....s','...As','..AAs','.AA.s','AA..s'],-1,-4], guard:[['s.s..','.S...','s.s..','.AA..'],1,-5], wide:[['s.....','s.....','.A....','..A...','...A..'],-2,-6],
    cut:[['AA.....','.AAA...','...Asss'],-1,1], low:[['A....','.A...','.AA..','...ss'],-1,0], high:[['...s','..s.','.A..','A...'],-1,-5] };
  const LEGS={ st:pad(16,['......dd.d......','.....d....d.....','....d......d....','...d.......d....','..d.........d...']),
    a:pad(16,['......dd.d......','......d...d.....','.....d.....d....','....d.....d.....','...d.......d....']), b:pad(16,['......dd.d......','.....d.....d....','...dd.......d...','..d..........d..','.d...........d..']) };
  const S=(o)=>{ const f=FAR[o.f||'pray'], n=ARM[o.n||'pray'], by=o.by||0, bx=o.bx||0;
    return at(16,20,[[o.lg||LEGS.st,0,15],[f[0],9+f[1]+bx,9+f[2]+by],[spr2Shift(BODY,bx,by),0,0],[n[0],9+n[1]+bx,9+n[2]+by],o.fx||null]); };
  T.S={ idle:[S({}), S({by:1})],
    walk:[S({lg:LEGS.a}), S({}), S({lg:LEGS.b}), S({})],
    guard:[S({n:'guard',f:'guard',fx:[['S'],12,5]}), S({n:'guard',f:'guard',fx:[['S'],14,3]})],
    wind:S({n:'wide',f:'wide'}),
    cut1:S({n:'cut',f:'high'}), cut2:S({n:'low',f:'cut'}),
    ctrw:S({n:'back',f:'low',bx:-1}), ctr:S({n:'sweep',f:'low',bx:1}),
    rec:S({n:'low',f:'low',by:1}), cx0:7 };
  /* ---- toward the camera 19 × 20 (the body's centre on (9,14), the feet on row 19): the triangle head with a big red eye at each corner, its chin down,
     the feelers from between the eyes, the scythes folded under it as a rose ∧ (praying), a narrow body, four thin legs (PX5 FIX: it read as a cat's face) ---- */
  const sym=(L,c)=>L.map(s=>{ c=c||s.length-1; return s+rv(s.slice(0,c)); });
  const BD=sym(['.....d....','......dd..','....eEhhdh','....elllll','.....dmlll','......dmlh','.......dml','........dA','.........d','........lm','.......hlm','.......hlm','......hllm','......dmmm','.......ddd','..........']);
  const ARMD={ pray:sym(['..........','.......a..','.....aaA..','...aaA.s..','..aA...s..','..A.......','..s.......'],9), guard:sym(['...s......','....s.....','.....s....','......s...','.......s..','........ss','.......s..','....a.s...','....aA....'],9),
    wide:sym(['.s........','..s.......','...s......','...a......','....a.....','.....a....'],9), low:sym(['..........','.....a....','....aA....','....A.....','...ss.....','..s.......'],9) };
  const ONE=(a,b)=>{ const n=Math.max(a.length,b.length), e='.'.repeat(19); return Array.from({length:n},(_,i)=>(a[i]||e).slice(0,10)+(b[i]||e).slice(10)); };               // (the left half of one pose, the right of another — a cut is one scythe)
  const LGD={ st:sym(['.d........','d.dd......','d...dd.d..','......d...','.....d....','....d.....','...d......','...d......'],9), a:sym(['..d.......','.d.dd.....','.d...d.d..','.......d..','......d...','.....d....','....d.....','....d.....'],9), b:sym(['d.........','.ddd......','d....dd.d.','......d...','....dd....','...d......','..d.......','..d.......'],9) };
  const D=(o)=>at(19,20,[[o.lg||LGD.st,0,11],[BD,0,(o.by||0)],[o.a||ARMD.pray,0,(o.ay!=null?o.ay:6)+(o.by||0)],o.fx||null]);
  T.D={ idle:[D({}), D({by:1})], walk:[D({lg:LGD.a}), D({}), D({lg:LGD.b}), D({})],
    guard:[D({a:ARMD.guard,ay:1,fx:[['S'],9,6]}), D({a:ARMD.guard,ay:1,fx:[['S'],5,3]})], wind:D({a:ARMD.wide,ay:0}),
    cut1:D({a:ONE(ARMD.wide,ARMD.low),ay:3}), cut2:D({a:ONE(ARMD.low,ARMD.wide),ay:3}),
    ctrw:D({a:ONE(ARMD.pray,ARMD.wide),ay:2}), ctr:D({a:ONE(ARMD.low,ARMD.pray),ay:7}), rec:D({a:ARMD.low,ay:8,by:1}), cx0:9, cy0:14 };
  /* ---- from behind 17 × 20: the folded leaf wings nearest you, the widest mass, a dark seam down them (its rose tip), the long narrow prothorax rising, the
     small head and its feelers, the scythes' hooks beside it (crossed, their blades show above its head), the legs from its waist (PX5 FIX: a vase) ---- */
  const BU=sym(['..d.....','...d....','....d...','.....dmm','.....mll','......ml','......dm','......lm','......lm','.....dlm','....dhll','...dhlld','...dhlhd','...dlhld','...dhlhd','....dhld','....dmld','.....dmd','......mp','......pp']);
  const ARMU={ pray:sym(['........','........','........','....s...','....a...','....aA..','........'],7), guard:sym(['.s......','..s.....','...s....','....s...','..aA....','...aA...','....AA..'],7), wide:sym(['s.......','.s......','..a.....','..aA....','...aA...','....AA..','........'],7),
    low:sym(['........','........','........','...aA...','..aA....','..s.....','..s.....'],7) };
  const ONEU=(a,b)=>{ const n=Math.max(a.length,b.length), e='.'.repeat(15); return Array.from({length:n},(_,i)=>(a[i]||e).slice(0,8)+(b[i]||e).slice(8)); };
  const LGU={ st:sym(['........','..ddd...','.d......','.d......','........','.dd.....','d.......','d.......'],7), a:sym(['........','.ddd....','d.......','d.......','........','..dd....','.d......','.d......'],7), b:sym(['........','...dd...','..d.....','..d.....','........','.ddd....','d.......','........'],7) };
  const U=(o)=>at(17,20,[[o.lg||LGU.st,1,9],[BU,1,(o.by||0)],[o.a||ARMU.pray,1,(o.ay!=null?o.ay:1)+(o.by||0)],o.fx||null]);
  T.U={ idle:[U({}), U({by:1})], walk:[U({lg:LGU.a}), U({}), U({lg:LGU.b}), U({})],
    guard:[U({a:ARMU.guard,ay:0,fx:[['S'],3,1]}), U({a:ARMU.guard,ay:0,fx:[['S'],12,2]})], wind:U({a:ARMU.wide,ay:1}),
    cut1:U({a:ONEU(ARMU.wide,ARMU.low),ay:1}), cut2:U({a:ONEU(ARMU.low,ARMU.wide),ay:1}),
    ctrw:U({a:ONEU(ARMU.pray,ARMU.wide),ay:1}), ctr:U({a:ONEU(ARMU.low,ARMU.pray),ay:3}), rec:U({a:ARMU.low,ay:5,by:1}), cx0:8, cy0:14 };
})();
/* ---------------- SAND DEVIL (PX K6 · px_art §5.21): an ambusher under the sand, one drawing every way (faces:'D') · BURIED (idle 2): a low mound of sand,
   two amber eyes peeking through it — it moves · RUMBLE (2, the tell — step OUT): the mound heaved & cracked, the tips of its pincers breaking the sand, pebbles
   jumping · ERUPT (2, the punish window): a sandy antlion-worm reared out of its crater, sickle jaws either side of a round MAW ringed with teeth; frame 2
   the jaws snap half-shut · the portrait shows it erupted · topN: its marks sit over the frame it shows ---------------- */
SPR2.tpl.sanddev={ r0:8.89, cx0:10, cy0:14, faces:'D', eyeL:'e', topN:1,   // (PX5 FIX) topN: the marks & the rumble's "!" over the mound it shows, not over its erupt
  sel:(en,pose)=>en.st==='erupt'?'erupt':en.st==='rumble'?'rumble':'idle',
  pal:{d:'#8a6e44', m:'#caa46a', l:'#e3cf9c', h:'#f4e6c0', b:'#6e5a3e', B:'#8a7454', D:'#4a3a28', M:'#3a1420', t:'#f0e6d2', e:'#ffe680', p:'#a08458'},
  elite:{b:'#5a2a3a', B:'#7a3e52', D:'#3a1424'} };
(function(){
  const T=SPR2.tpl.sanddev, rv=s=>s.split('').reverse().join(''), sym=L=>L.map(s=>s+rv(s.slice(0,10)));   // (a left half of 11 → the 21-wide row, mirrored about col 10)
  const E='.'.repeat(21), pre=(n,L)=>Array(n).fill(E).concat(L);
  /* ---- BURIED (idle 2): a low mound of sand 21 × 8 on rows 13–20, lit from the top left, a ridge along its crest, and two amber eyes peeking through
     the sand at its front — harmless-looking, but it moves · the ripple on its flank slides a texel ---- */
  const MOUND=f=>pre(13,['........lhhl.........','.....llhlllmmm.......','...llmmm'+(f?'l':'m')+'mmmmmmd.....',
    '..lmmDeeDmDeeDmmmd...',
    '.lmm'+(f?'mdd':'ddm')+'mmmmmm'+(f?'dd':'md')+'mmmd..',
    'lmmmmmmmmmmmmmmmmmdd.',
    'dmmmmmmmmmmmmmmmmddd.',
    '.ddddddddddddddddd...']);
  /* ---- RUMBLE (2, the tell): the mound heaved a row and CRACKED, the tips of its pincers breaking the sand, its eyes up, pebbles jumping off it ---- */
  const RUM=f=>pre(9,[
    f?'.........p.......p...':'...p...........p.....',
    f?'...p.................':'..........p..........',
    f?'.......D.....D.......':'.....................',
    f?'.......DB...BD.......':'.......D.....D.......',
    f?'........DB.BD........':'.......DB...BD.......',
    '.....lhhDBhBDlm......',
    '...lhhlmmDlDmmmmd....',
    '..lhlmDmmeDemmDmmd...',
    '.lhlmmmDmmDmmDmmmmd..',
    'lhmmDmmmmDmDmmmDmmmd.',
    'dmmmmmDmmmmmmmDmmddd.',
    '.ddddddddddddddddd...']);
  /* ---- ERUPT (2): a sandy antlion-worm reared up out of its crater — two great sickle pincers over its head, small amber eyes, the round MAW ringed
     with teeth open at you · the near rim of the crater in front of its body · frame 2: the jaws & pincers snap half-shut ---- */
  const ER1=sym(['...........','........lhh','......DBllh','.....DbBBBl','....DbBBBBB','....DbBeBBB','..D.DbBBBtt','.DBDDbBBtMM','.DBBDbBtMMM','.DtBDbbtMMM','..DtBDbBtMM','...DtBDbBtt','....DtDDbbb','......DbDDD','......DbbBB','hl..lDDbDDD','mhhl.mdbbbb','dmlhhlmmddd','.dmmlllhhll','..ddmmmmmmm','....ddddddd']);
  const ER2=sym(['...........','...........','........lhh','......DBllh','.....DbBBBl','....DbBeBBB','....DbBBBBB','...DDbBBBtt','..DBDbBBtMM','..DBBDbBttt','...DtBDbBBB','....DtBDbBB','.....DttDbb','......DbDDD','......DbbBB','hl..lDDbDDD','mhhl.mdbbbb','dmlhhlmmddd','.dmmlllhhll','..ddmmmmmmm','....ddddddd']);
  T.D={ idle:[MOUND(0),MOUND(1)], rumble:[RUM(0),RUM(1)], erupt:[ER1,ER2] };
})();
/* ---------------- TERMITE QUEEN (PX K6 · px_art §5.22): a bloated queen in her clay mound — THE MOUND IS THE SAME ROWS IN EVERY FACING (symmetric, lit
   from above: the L view's mirror is the very same heap) and only she turns: a grub-white ringed belly (the elite's ramp — the clay never changes), the dark
   thorax, the small red-brown head, amber eyes, black mandibles · idle 2: her belly breathes · BIRTH 2: the heap shudders, her brood's heads in its tunnel
   mouths · SQUIRTW: acid welling at her mandibles · SQUIRT: the mandibles wide, acid flung forward ---------------- */
SPR2.tpl.termqueen={ r0:10.37, cx0:15, cy0:17, eyeL:'e',
  sel:(en,pose)=>en.cast>0?'birth':en.st==='wind'?'squirtw':en.st==='act'?'squirt':'idle',
  pal:{d:'#c4ae84', m:'#e8d8b0', l:'#f0e0c0', h:'#fff6dc', c:'#7a4424', C:'#a8683a', L:'#c88a54', o:'#24120a', n:'#4a2612', N:'#6a3a1c', H:'#6a2a14', x:'#8a4a24', k:'#140804',
    e:'#ffcf7a', a:'#9be85a', A:'#e8ffb0', t:'#ffd27a'},
  elite:{d:'#a87a9a', m:'#d8a8c8', l:'#f0d0e8', h:'#fff0fa'} };
(function(){
  const T=SPR2.tpl.termqueen, O=spr2Over, rv=s=>s.split('').reverse().join(''), sym=L=>L.map(s=>s+rv(s.slice(0,15)));   // (a left half of 16 → the 31-wide row, mirrored about col 15)
  const W=31, H=24, B=()=>Array(H).fill('.'.repeat(W)), at=parts=>{ let r=B(); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1]|0,p[2]|0); return r; };
  const pad=(w,L)=>L.map(r=>(r+'.'.repeat(w)).slice(0,w));
  /* ---- THE MOUND (the same rows in every facing — symmetric & lit from above, so the L view's mirror is the very same heap): a lumpy clay heap 31 wide
     on rows 9–23 (its foot on row 23, the shadow's line), tunnel holes in its face, the NEST crater on its crown where she lies · LIP = the crater's near
     rim (rows 14–15), drawn over her so she lies IN it ---- */
  const BACK=sym(['...........cLLLL','.......cLc.cLNNN','.....cLLCCcLNnnn','....cLCCCCCLLLLL','..cLLCCoCCCCCCCC','.cLCCCcCCcLLLcCC','.LCCLLLcCCCCCooC','cLCCCCCCCooCCCCC','LCooCCLLLcCCCLLL','CCCCCcCCCCCLLcCC','cCCLLLCCoCCCCCCC','.ccCCCCCcCCcCCCC','...ccccccccccccc']);   // (rows 11–23: a low lumpy heap of clay clods, the crater on its crown)
  const HOLES=[[13,17,2],[16,17,2],[9,18,2],[20,18,2],[2,19,2],[27,19,2],[8,21,1],[22,21,1]];   // (the tunnel mouths [x, y, width] — her brood's heads show in them while she births)
  const MOUND=(dx,heads)=>{ let r=O(B(),BACK,dx,11); if(heads) for(const i of heads){ const [x,y,w]=HOLES[i]; r=O(r,['t'.repeat(w)],x+dx,y); r=O(r,['t'],x+dx+(x<15?0:w-1),y-1); } return r; };   // (a head in the hole, one climbing out over its lip — mirrored on the right, so the heap stays symmetric)
  const LIP=(dx)=>[BACK.slice(3,5),dx,14];
  /* ---- HER: the swollen pale belly — grub-white, ringed, a row of little brown plates down its back (the re-mappable ramp: the elite changes her, never the
     clay), the dark thorax, the small red-brown head, amber eyes, the black mandibles · S: lying along the nest, head right · D: her head & mandibles at you
     over the near rim, the belly piled up behind · U: the belly's round end nearest, its rings in arcs, the head beyond ---- */
  const QS=(br)=>pad(25,['.........................','....hhhhhlll.............','..hhlxlxlxlxlm...........','.hllldlldlldlmm..........','hlllmdlmdlmdlmmd..xx.....','llmmmdmmdmmdmmmdxxxHHH...','lmmmmdmmdmmdmmmdxxHHHeH..','mmmmmdmmdmmdmmddxxHHHHHk.','dmmmmdmmdmmdmmdd...HHH..k','.dddddddddddddd...k.k....']).slice(br?0:1).concat(br?[]:['.........................']);
  const QSF={ aw:pad(6,['.Aa...','aaa...']), as:pad(7,['..aA.a.','.aAAaAa','..a.a..']) };
  const QD=(br)=>sym(pad(16,['................','...........hhhll','.........hhlllll','........hllxlxlx','.......hlddddddd','.......lllllllll','.......lmdddddddd','.......lmmmmmmmm','........ddddddmm','..........ddxxxx','..........dHHHHH','..........HHeHHH','...........HHHHH']).slice(br?0:1).concat(br?[]:['................']));
  const QDF={ k:sym(['..........k.....','...........k....','............k...']), kw:sym(['.........k......','.........k......','..........k.....']),
    aw:sym(['................','..............Aa','..............aa']), as:sym(['..............Aa','.............aAa','............a.aa','..............a.']) };
  const QU=(br)=>sym(pad(16,['............k...','............kHHH','............HHHH','.............xxx','...........hhhll','.........hhlxlxl','........hlllllll','.......hldddddmm','.......lllllllmm','.......lmddddddd','.......lmmmmmmmm','........dddddddd']).slice(br?0:1).concat(br?[]:['................']));
  const QUF={ aw:sym(['..............aA','..............aa']), as:sym(['............a..A','.............a.a','..............Aa']) };
  /* the frames: idle 2 (the belly breathes a row) · birth 2 (the heap shudders a column each way, her brood's heads in the tunnel mouths) · squirtw (acid welling
     at her mandibles) · squirt (the mandibles wide, a spray of acid flung forward) */
  const heave=L=>{ const o=L.slice(1,18); o.push(L[17]); return o.concat(L.slice(18)); };   // (BIRTH: the heap & she heave up a row, the foot held — symmetric, so every view shows the same heap)
  const S=(o)=>at([[MOUND(o.dx|0,o.hd)],[QS(o.br),4,4],LIP(o.dx|0),o.fx?[o.fx[0],o.fx[1],o.fx[2]]:null]);
  T.S={ idle:[S({}),S({br:1})], birth:[heave(S({hd:[0,1,4,5]})),S({hd:[2,3,6,7]})], squirtw:S({fx:[QSF.aw,27,10]}), squirt:S({fx:[QSF.as,27,9]}) };
  const D=(o)=>at([[MOUND(o.dx|0,o.hd)],[QD(o.br),0,1],LIP(o.dx|0),[o.k||QDF.k,0,12],o.fx?[o.fx,0,13]:null]);
  T.D={ idle:[D({}),D({br:1})], birth:[heave(D({hd:[0,1,4,5]})),D({hd:[2,3,6,7]})], squirtw:D({fx:QDF.aw}), squirt:D({k:QDF.kw,fx:QDF.as}) };
  const U=(o)=>at([[MOUND(o.dx|0,o.hd)],[QU(o.br),0,4],LIP(o.dx|0),o.fx?[o.fx,0,2]:null]);
  T.U={ idle:[U({}),U({br:1})], birth:[heave(U({hd:[0,1,4,5]})),U({hd:[2,3,6,7]})], squirtw:U({fx:QUF.aw}), squirt:U({fx:QUF.as}) };
})();
/* ---------------- TERMITE (PX K6 · px_art §5.20): the queen's brood, swarm only (always small — no Mini; the bake mutes it): a fat pale abdomen, the
   red-brown head, dark mandibles forward, three legs a side · it never stops scuttling (always) ---------------- */
SPR2.tpl.termite={ r0:3.7, cx0:4, cy0:2, always:true, eyeL:'e',   // (PX7 FIX: its card keeps the side view — head, eye & legs; Z0's front read as a cupcake)
  pal:{d:'#c4a070', m:'#e4cc9c', l:'#fff0d0', h:'#ffffff', x:'#c89060', H:'#8a3a1a', k:'#1a0e06', e:'#140804'} };
(function(){
  const T=SPR2.tpl.termite;
  /* ---- the profile (facing right) 9 × 5: the fat pale abdomen behind, the thorax, the red-brown head with its eye & the dark mandibles forward; three legs scuttle ---- */
  const SB=['.lhl.....','lmmml.HH.','dmmmdxHek','.ddd.xH.k'];
  T.S={ walk:[SB.concat(['..k.k.k..']), SB.concat(['.k.k...k.'])] }; T.S.idle=T.S.walk[0];
  /* ---- toward the camera 7 × 8 (centre (3,5), the mandibles on row 7): the head & its pincers nearest, the abdomen rising behind, three legs out each side ---- */
  T.D={ walk:[['..lhl..','.lmmml.','.dmmmd.','k.ddd.k','.kxxxk.','k.HHH.k','.HeHeH.','.k...k.'],
              ['..lhl..','.lmmml.','kdmmmdk','.kdddk.','k.xxx.k','.kHHHk.','.HeHeH.','..k.k..']], cx0:3, cy0:5 }; T.D.idle=T.D.walk[0];
  /* ---- from behind 7 × 8: the mandible tips & the head away up-screen, the thorax, the fat pale abdomen nearest ---- */
  T.U={ walk:[['.......','.k...k.','..HHH..','k.xxx.k','.klhlk.','k.mmm.k','.dmmmd.','..ddd..'],
              ['.......','..k.k..','.kHHHk.','..xxx..','klhhhlk','.kmmmk.','kdmmmdk','..ddd..']], cx0:3, cy0:5 }; T.U.idle=T.U.walk[0];
})();
/* ---------------- BOG TOAD (PX K6 · px_art §5.23): a squat mud toad — the warty olive back & its golden stripe, two orange eyes bulging on top, the wide
   mouth, the pale yellow throat, the great folded hind legs · idle 2: the throat pulses · HOP: tilted up, the hind legs flung out · TONGUEW 2 (the tell): the
   throat a great yellow balloon, flickering (from behind it swells past its cheeks) · TONGUE: the mouth gaping — eFxPost's tongue leaves T.mouth · SLAMW:
   puffed up 2 texels taller & wider · SLAM: flattened, splayed ---------------- */
SPR2.tpl.bogtoad={ r0:8.15, cx0:10, cy0:10, eyeL:'k', mouth:{S:[19,10], D:[11,11], U:[11,6]},   // (the tongue's start — authored on the tongue frame, the same texel on idle & slamw · PX5 FIX: D on the mouth line, not the throat)
  sel:(en,pose)=>{ const T0=en.atk===ATK.bogtoad[0]; return en.st==='wind'?(T0?'tonguew':'slamw'):en.st==='act'?(T0?'tongue':'slam'):(en.lift||0)>0.5?'hop':'idle'; },
  pal:{d:'#54441e', m:'#7e6a36', l:'#a08a48', h:'#c8b040', f:'#e8d27a', y:'#ffe63a', Y:'#fff6a0', o:'#ff9a2a', k:'#1a1208', M:'#8a2a3a'},
  elite:{d:'#2a3a5a', m:'#3a5a8a', l:'#5a7ab0', h:'#8ab0e0', f:'#c8e0ff', y:'#ff7a3a'} };
(function(){
  const T=SPR2.tpl.bogtoad, O=spr2Over, rv=s=>s.split('').reverse().join(''), sym=L=>L.map(s=>s+rv(s.slice(0,11)));   // (a left half of 12 → the 23-wide row, mirrored about col 11)
  const pad=(w,L)=>L.map(r=>(r+'.'.repeat(w)).slice(0,w)), blank=(w,h)=>Array(h).fill('.'.repeat(w));
  /* the PUFF (slamw): the body blown up 2 texels taller & wider — row ry and column cx doubled twice, the feet & the mouth's texel kept where they were ·
     the SPLAT (slam): 2 rows squashed out above the mouth, 2 columns more of width, the feet flung out */
  const dupR=(L,ry,n)=>{ const o=L.slice(0,ry+1); for(let i=0;i<n;i++) o.push(L[ry]); return o.concat(L.slice(ry+1)).slice(n); };
  const dupC=(L,cx,n,side)=>L.map(r=>{ const s=r.slice(0,cx+1)+r[cx].repeat(n)+r.slice(cx+1); return side==='L'?s.slice(n):side==='R'?s.slice(0,r.length):s.slice(n>>1,(n>>1)+r.length); });
  const dup2=L=>L.map(r=>(r.slice(0,11)+r[10]+r[11]+r[12]+r[12]+r.slice(13)).slice(1,1+r.length));   // (D · U: columns 10 & 12 doubled — 2 wider, still symmetric about col 11, the stripe & the mouth's centre kept)
  const cutR=(L,ry,n)=>Array(n).fill('.'.repeat(L[0].length)).concat(L.slice(0,ry),L.slice(ry+n));
  /* ---- the profile (facing right) 22 × 16 (centre (10,10), the feet on row 15): a squat mud-brown toad — the warty back with its golden stripe, the big
     orange eye bulging on top, the wide mouth line, the pale yellow throat under the chin, the great hind leg folded at its haunch, the front foot planted ---- */
  const S0=pad(22,['......................','......................','......................','......................','............lhl.......','...........lookl......','.....lhhhhlooool......','...lhllhllmlool.ll....','..lhmmhmmmhmmmmmmmml..','.lmmmmmmmmmmmmmmmmmml.','.lmmmddddmmmmMMMMMMMd.','.lmmdllllddmmfyyyyyd..','.lmdlmmmmmdmffyYyyd...','.lmdlmmmmmdffffdddd...','..ddmmmmmmddd.dmd.....','...dddllllllld.dd.dd..']);
  const S0b=O(S0,['ffyyyyyyd.','fyyYyyyyd.'],11,11);   // (the throat's pulse: a breath out)
  const STW=[O(S0,['..yyyyyy..','.yyYYyyyy.','.yYYyyyyyd','.yyyyyyyyd','..dyyyyyd.'],11,10), O(S0,['..yyyyyyy.','.yyYYYyyyy','.yYYYyyyyd','.yyyyyyyyd','..dyyyyyd.'],11,10)];   // TONGUEW: the throat a great yellow balloon (flickering)
  const STO=O(S0,['MMMMMMMd','.MMMMMd.','..ddd...'],13,10);   // TONGUE: the jaw dropped — the mouth gaping
  const SH=pad(22,['......................','......................','..............lhl.....','.............lookl....','.......lhhhhlooool....','.....lhllhllmlool.l...','...lhmmhmmmhmmmmmmml..','..lmmmmmmmmmmmmmmmmml.','.lmmllllmmmmmMMMMMMd..','lmmdmmmdlmmmfyyyyyd...','lmdmmmmmdmffyyyyd.....','ddmmmmmmmdffffdd......','.ddmmddddddd..dmd.....','...ddd.........dd.....','......................','......................']);   // HOP: tilted up, the hind leg flung out behind
  T.S={ idle:[S0,S0b], hop:SH, tonguew:STW, tongue:STO, slamw:dupC(dupR(S0,9,2),6,2,'L'), slam:dupC(cutR(S0,8,2),6,2,'L'), cx0:10 };
  T.S.slam=O(T.S.slam,['d....................d'],0,15);
  /* ---- toward the camera 23 × 16 (centre (11,10), the feet on row 15): its broad face — two orange eyes bulging on top, the wide mouth across, the pale
     throat under it, the front feet planted, the folded hind legs out at its sides ---- */
  const D0=sym(['............','............','............','............','............','....lhl.....','...lokol....','..looooolmmm','.lmmooommmhm','.lmmmmmmmmmm','lmmmhmmmmmmm','ldmMMMMMMMMM','ldmmffyyyyyy','dmmdfffyyyyy','dmmd.dddffff','ddd..dd.dddd']);
  const D0b=O(D0,['yyyyyyyyy','.yyyyyyy.'],7,13);
  const DTW=[O(D0,['...yyyyy...','.yyYYyyyyy.','yyYYyyyyyyy','yyyyyyyyyyd','.dyyyyyyyd.'],6,12), O(D0,['..yyyyyyy..','.yYYYyyyyy.','yyYYYyyyyyy','yyyyyyyyyyd','.dyyyyyyyd.'],6,12)];
  const DTO=O(D0,['MMMMMMMMMMMMM','.MMMMMMMMMMM.','..ddddddddd..'],5,11);
  const DH=sym(['............','............','............','....lhl.....','...lokol....','..looooolmmm','.lmmooommmhm','.lmmmmmmmmmm','lmmmhmmmmmmm','ldmMMMMMMMMM','ldmmffyyyyyy','.dmmfffyyyyy','d.dd.ddddfff','dd.......ddd','d...........','............']);
  T.D={ idle:[D0,D0b], hop:DH, tonguew:DTW, tongue:DTO, slamw:dup2(dupR(D0,9,2)), slam:dup2(cutR(D0,8,2)), cx0:11 };
  T.D.slam=O(T.D.slam,['d.....................d'],0,15);
  /* ---- from behind 23 × 16: the warty back and its golden stripe down the spine, the backs of the two eye-bulges on top, the great folded hind legs at its
     haunches (the frog's M), no face ---- */
  const U0=sym(['............','............','............','............','............','....ooo.....','...ooooo....','..lmooomlllh','.lmmmmmmhmmh','.lmhmmmmmmmh','lmmmmmhmmmmh','lmmldddmmmmh','lmldmmmdmmmm','dmdmmmmmdmmm','dmmdmmmdddmm','ddddddd..ddd']);
  const UTW=[O(U0,['yY.........Yy','yy.........yy'],5,8), O(U0,['yYy.......yYy','yyy.......yyy'],4,8)];   // (from behind the balloon swells out past its cheeks)
  const UTO=U0.slice(1,10).concat([U0[9]],U0.slice(10));   // (TONGUE from behind: the head thrust up a row)
  const UH=sym(['............','............','............','....ooo.....','...ooooo....','..lmooomlllh','.lmmmmmmhmmh','.lmhmmmmmmmh','lmmmmmhmmmmh','lmmmmmmmmmmh','dmmdmmmmmmmm','ddmmdddmdddd','.dmmd.......','..dmd.......','...dd.......','............']);
  T.U={ idle:[U0,U0], hop:UH, tonguew:UTW, tongue:UTO, slamw:dup2(dupR(U0,9,2)), slam:dup2(cutR(U0,8,2)), cx0:11 };
  T.U.slam=O(T.U.slam,['d.....................d'],0,15);
})();
/* ---------------- SALAMANDER (PX K6 · px_art §5.24): a sooty lizard dotted with embers — near-black, a lit ridge down its back, ≥ 6 EMBERS in every
   frame (GOLD while it basks: alt _bk, set by ePose), four splayed legs, the tail curling behind · idle 2: the tail curls · walk 4: the wiggle (its spine bends,
   the legs alternate) · WIND 2 (the tell): the throat blazing, flickering · REC: lava dripping from its lips ---------------- */
SPR2.tpl.salamander={ r0:7.04, cx0:13, cy0:5, eyeL:'y', port:'D', alt:{key:'_bk', pal:{e:'#ffe070', E:'#fff6c0'}},   // (ePose sets en._bk — basking: the embers burn GOLD · PX Z0 port: its card shows its front)
  sel:(en,pose)=>en.st==='wind'?'wind':en.st==='recover'?'rec':en.mv?'walk':'idle',
  pal:{d:'#160e0e', m:'#2a2020', l:'#46342c', h:'#6a5040', e:'#ff6a2a', E:'#ffb040', g:'#ff8a2a', G:'#fff0a0', y:'#ffe68a', v:'#ff6a2a'},
  elite:{d:'#2a1010', m:'#4a1c18', l:'#6a2a20', h:'#8a4030'} };
(function(){
  const T=SPR2.tpl.salamander, O=spr2Over, pad=(w,L)=>L.map(r=>(r+'.'.repeat(w)).slice(0,w));
  const wave=(L,ph,A,y0,y1)=>L.map((r,y)=>{ if(y<y0||y>y1) return r; const k=Math.round(A*Math.sin((y+ph)*Math.PI/5)*Math.min(1,(y1-y)/3)); return k>0?('.'.repeat(k)+r).slice(0,r.length):k<0?(r.slice(-k)+'.'.repeat(-k)):r; });   // (the lizard's S-bend: rows y0–y1 swung side to side, the head's rows held)
  /* ---- the profile (facing right) 24 × 10 (centre (13,5), the feet on row 9): a long sooty lizard — the head raised over a neck dip, its amber eye on a lit
     head, a lit ridge down its back dotted with EMBERS, four splayed legs showing under it, the tail curling up behind (PX5 FIX: it read as a log) ---- */
  const BODY=pad(24,['........................','....................lhh.','...................lhhhl','..........lhhhhl...lmyhd','........lhhEhhehl..lmmmd','......llmmmmmmmEmllmmmd.','....llmEmmmemmmmmEmmd...','...dmmmdddmmddddmmd.....','........................','........................']);
  const TAIL=[pad(7,['.hl....','lmd....','lm.....','led....','.dmm...']), pad(7,['.......','.hl....','lmd....','lmed...','.ddm...'])];   // (an ember on the tail too: ≥ 6 in every frame)
  const LEG={ st:pad(24,['....dl...ld.....dl...ld.','...dd.....dd...dd.....dd']), a:pad(24,['.....dl.ld.......dl.ld..','....dd...dd.....dd...dd.']), b:pad(24,['...dl.....ld...dl.....ld','..dd.......dd.dd.......d']) };
  const S=(o)=>{ let r=O(BODY,o.tl||TAIL[0],0,2); r=O(r,o.lg||LEG.st,0,8); if(o.fx) for(const f of o.fx) r=O(r,f[0],f[1],f[2]); return r; };
  const THR=f=>[f?['GgG','.g.']:['gGg','.G.'],20,5];   // WIND: the throat blazing under its jaw (flickering)
  T.S={ idle:[S({}), S({tl:TAIL[1]})], walk:[S({lg:LEG.a}), S({tl:TAIL[1]}), S({lg:LEG.b}), S({tl:TAIL[1]})], wind:[S({fx:[THR(0)]}), S({fx:[THR(1)]})], rec:S({fx:[[['v'],23,5],[['v'],23,6]]}) };
  /* ---- toward the camera 15 × 20 (centre (7,15), the chin on row 19): seen from above its head — the flat head nearest, an amber eye at each side, the
     forelegs splayed out & forward, the shoulders, the waist, the hips & the hind legs splayed back, the ember-dotted back, the tail curling away up-screen ---- */
  const D0=['.........hl....','..........ml...','..........lm...','.........lEd...','........lmd....','.......lmd.....','......lmEd.....','.dl..lmmmd..ld.','..dllmEmmmdld..','....lmmmemd....','.....lmmmd.....','.....lmEmd.....','.....lmmmd.....','....lmemmEd....','..dllmmmmmdld..','.dl.dmmmmmd.ld.','.d..lhhhhhl..d.','....yhmmmhy....','....dmmmmmd....','.....ddddd.....'];
  const DT2=O(D0.map((r,i)=>i<4?'...............':r),['........hl.....','.........ml....','.........lm....','.........lEd...'],0,0);   // (idle: the tail's tip curls)
  T.D={ idle:[D0, DT2], walk:[0,1,2,3].map(i=>wave(D0,i*2.5,1,0,15)), wind:[O(D0,['.gGg.','gGGGg'],5,18), O(D0,['.GgG.','GgggG'],5,18)], rec:O(D0,['v...v'],5,19), cx0:7, cy0:15 };
  /* ---- from behind 15 × 20: from above its back — the flat head away up-screen (the glow of its throat shows past its jaws as it winds), the forelegs
     splayed forward, the ember-dotted back, the hind legs splayed back, the tail curling toward you ---- */
  const U0=spr2Flip(D0).map((r,i)=>i===0?'.....lhhhl.....':i===1?'....lhmmmhl....':i===2?'....lmmmmmd....':i===3?'.l..dmmmmmd..l.':r).slice(0,14).concat(['.......lmd.....','.......lEd.....','.......lmd.....','.......lmd.....','......lmd......','.....dhl.......']);   // (the tail comes toward you & curls, its tip under the body's centre)
  const UT2=U0.slice(0,16).concat(['......lmd......','.......lmd.....','.......lmd.....','......dl.......']);   // (PX5 FIX: the tip flicks back under the centre — the feet stay put)
  T.U={ idle:[U0, UT2], walk:[0,1,2,3].map(i=>wave(U0,i*2.5,1,4,19)), wind:[O(U0,['g.......g','.g.....g.'],3,1), O(U0,['G.......G','g.......g'],3,1)], rec:U0, cx0:7, cy0:15 };
})();
/* ---------------- THE GREAT BOAR (PX K7a · boarBoss · px_design §2.7's lord table): its own drawing at its true size (r0 12.59 — never a scaled boar), TG1's boar
   grown: a towering silver-tipped bristle CREST, the hump, two old claw-rakes on the shoulder, a long wedge head, GOLD tusks (the old lord's), eyes that burn red
   while it means it (alt: en.atk) · idle 2 · WINDUP (head low, every bristle up, legs braced: the lane locks) · CHARGE 2 (the gallop, the crest laid back) · WIND
   (the sweep's tucked head) · ACT (the toss) · STOMP (reared on its hind legs) → SLAM (the forelegs down: the ring) · ROAR 2 (P2: the snout up, jaws agape) ·
   EXHAUST 2 (SPENT: the head hung, the tongue out, the flanks heaving) · RECOVER (planted — a BREAK's too) · NO WALK: it only ever moves by its charge ---------------- */
SPR2.tpl.boarBoss={ r0:12.59, cx0:14, cy0:21, eyeL:'k', mouth:{S:[38,21], D:[12,22], U:[12,8]},
  sel:(en,pose)=>{ const st=en.st; return st==='windup'?'windup':st==='charge'?'charge':st==='wind'?'wind':st==='act'?'act':st==='stomp'?(en.tmr>0.12?'stomp':'slam'):st==='roar'?'roar':st==='exhaust'?'exhaust':st==='recover'?'recover':'idle'; },
  alt:{key:'atk', pal:{k:'#ff4a30'}},
  pal:{d:'#34200f', m:'#5e3a24', l:'#7e5434', h:'#a07048', r:'#1a0e06', g:'#c8bca8', t:'#ffd23f', k:'#f0c070', s:'#b07a64'} };
(function(){
  const T=SPR2.tpl.boarBoss, O=spr2Over, W=39, H=30, B=()=>Array(H).fill('.'.repeat(W)), at=parts=>{ let r=B(); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1]|0,p[2]|0); return r; };
  const tilt=(rows,k,x0,pad)=>{ const w=rows[0].length, h=rows.length, o=Array.from({length:h+2*pad},()=>Array(w).fill('.')); for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const c=rows[y][x]; if(c==='.') continue; const ny=y+pad-Math.round(k*Math.max(0,x-x0)); if(ny>=0&&ny<o.length) o[ny][x]=c; } return o.map(r=>r.join('')); };   // (a column shear: k > 0 lifts the columns right of x0 — a snout up)
  const clr=(rows,x0,y0,x1,y1)=>rows.map((r,y)=>y<y0||y>y1?r:r.slice(0,x0)+'.'.repeat(x1-x0+1)+r.slice(x1+1));
  // ---- side (facing right) 39 × 30: the TORSO (rows 4–23: the bristle crest, the hump, two old claw-rakes, the tail's tuft) · HEADS · LEGS ----
  const TORSO=['...........g...g...g..................','...........rr..rr..rr.................','.........g.rrr.rrr.rrr................','........rrrrrrrrrrrrrr................','.......rrrrrhhhhhhhlrrg...............','......rrrhhhhhhhhhhlllrr..............','.....rrlhhhhlllllllglllrr.............','....rlllhlllllllllgllgllrr............','...llllllllllllllgllgllllr............','..mhlllllllllllmgmmgmmmmll............','ddmhlllllllllllmmmgmmmmmmld...........','rdmhmmmmmmmmmmmmmmmmmmmmmmd...........','rdmhmmlmmmmmmmmmmmmmmmmmmmd...........','rdmhmlmmmmmmmmmmmmmmmmmmmmd...........','.dmmmlmmmmmmmmmmmmmmmmmmmmd...........','.dmmmmlmmmmmmmmmmmmmmmmmmmd...........','..dmmmmmdddddddmmmmmmmmmmmd...........','..dddddddddddddmmmmmmmmmmmd...........','...ddddd.......dddddddddddd...........','...............dddddddddddd...........'];
  const MUP=[[11,2,'g'],[15,2,'g'],[19,2,'g'],[11,3,'r'],[15,3,'r'],[19,3,'r'],[11,4,'r'],[15,4,'r'],[19,4,'r'],[13,3,'g'],[17,3,'g'],[13,4,'r'],[17,4,'r'],[9,4,'g'],[9,5,'r'],[21,4,'g'],[21,5,'r'],[22,6,'g'],[23,7,'g']];   // the crest BRISTLES: every spike up a row or two
  const flat=(r,ty)=>O(clr(r,7,4+ty,23,6+ty),['.........g...g...g..','.......rrrrrrrrrrrrrr.'],5,5+ty);   // the crest laid back (the run, the spent)
  const HEAD=['.....d..........','....dsd.........','..rrdsdd........','rrlllll.........','rrlllddl........','rdllllkll.......','dmllllllml.t....','dmmllllmmml.t...','dmmmmmmmmmmltt..','dmmmmmmmmmmmttss','dmmmmmmmmmmttmsr','dmmmmmmmmmgtmdss','ddmmmmrrrggrrdd.','.ddmmmmmmmmdd...','..ddddddddd.....'];
  const HSP=O(O(O(spr2Rep(HEAD,{k:'d'}),['s'],7,13),['s'],7,14),['s'],7,15);   // spent: the eye shut, the tongue lolling
  const HUP=tilt(HEAD,0.5,3,6), HTK=tilt(HEAD,-0.35,3,5), HSP2=tilt(HSP,-0.25,3,4);   // the gore's toss · the sweep's tucked head · spent, hung low
  /* the jaws agape, the snout thrown up (the open head sheared, cleaned) */
  const HROAR=['.....d..........','....dsd.........','....dsdd........','..rrdlll...t....','rrlllddlll..tt..','rrllllklmmllttss','rdlllllmmmmmtmsr','dmlllllmmmmttdss','dmmllmmmmmmdrsd.','dmmmmmmmmrrsss..','dmmmmmmmmssss...','dmmmmmmmrssgg...','dmmmmmmmrrrgd...','dmmmmmmmmmm.....','dmmmmmmmmdd.....','ddmmmmmdd.......','.ddmmdd.........','..ddd...........'];
  /* STOMP: reared on its hind legs (the hind feet where they stood), the forelegs tucked high, the snout up, every bristle up — its ring's tell */
  const REAR=['..............g...g........dd.........','............g.r...r.g.....dsdd........','..........g.rrr.grrr.r....dsl.........','........grrrrrrrrrrrhhrrrrlldll..tt...','.......rrrrrrrrrrhhhllrrllldklmll.ttss','......rrrrrrrrhhhhllllrrllllllmmmlttsr','.....rrrrrrrhhhhllllllrdlllllmmmmmtmss','....rrrrrrhhhllllglllldmllllmmmmmtmdd.','...rrrrrrhhlllllgllglmdmmlmmmmmmgtrd..','..rrrrrrhllllllgllgllmdmmmmmmmmmgrd...','..rrrrrlhllllllllglmmmdmmmmmmmrgmd....','.rrrlhllllllllllmmmmmmdmmmmmrrmmd.....','.rlhllllllllllmmmmmmmmdmmmmmmmdd......','.dmhllllllllmmmmmmmmmmddmmmmdd........','ddmhllllllmmmmmmmmmmmd.ddmdddmmd......','rdmhllllmmmmmmmmmmmmddlmd....dmd......','rdmhlllmmmmmmmmmmmmd...dlmd..rrr......','rdmhlmmmmmmmmmmmmmd......dmd..........','.dmmlmmmmmmmmmmmdd........rrr.........','.dmmmlmmmmmmmmmdd.....................','..dmmmmmmmmmmdd.......................','..dmmmmmmmmmdd........................','...dddmmmmddd.........................','....dmmmd.ddd.........................','....dlmd..dmd.........................','.....dlmd.dmd.........................','.....dlmd.dmd.........................','.....dmmd.dmd.........................','.....rrrr.rrr.........................','.....rrrr.rrr.........................'];
  const LEGS=['....dmmmd.ddd.........................','....dlmd..dmd..dlmmd.ddd..............','.....dlmd.dmd...dlmd.dmd..............','.....dlmd.dmd...dlmd.dmd..............','.....dmmd.dmd...dmmd.dmd..............','.....rrrr.rrr...rrrr.rrr..............','.....rrrr.rrr...rrrr.rrr..............'];
  const BRACE=['...dmmmd..ddd.........................','..dlmd...dmd...dlmmd..ddd.............','..dlmd...dmd.....dlmd..dmd............','.dlmd...dmd.......dlmd..dmd...........','.dmmd...dmd.......dmmd...dmd..........','rrrr...rrr.........rrrr..rrr..........','rrrr...rrr.........rrrr..rrr..........'];
  const GALA=['...dmmd...ddd.........................','..dlmd...dmd......dlmmd..ddd..........','.dlmd...dmd........ddlmd..dmd.........','dlmd...dmd...........dlmd..dmd........','dmd...dmd.............dmmd..dmd.......','rr...rrr...............rrr...rrr......','.........................r.....r......'];
  const GALB=['.....dmmd.dd..........................','......dlmddmd....dlmmddd..............','.......dlmdmd...dlmddmd...............','.......dlmmd...dlmddmd................','........dmd....dmmdmd.................','........rrr....rrrrrr.................','......................................'];
  const SPLAY=['...dmmmd..ddd.........................','...dlmd...dmd...dlmmd..ddd............','..dlmd....dmd....dlmd...dmd...........','..dmmd....dmd....dmmd...dmd...........','.rrrr....rrr.....rrrr...rrr...........','.rrrr....rrr.....rrrr...rrr...........','......................................'];
  const S=(o)=>{ let r=at([[TORSO,0,4+(o.ty|0)],[o.legs||LEGS,0,23+(o.ly|0)],[o.head||HEAD,(o.hx==null?22:o.hx),(o.hy==null?9:o.hy)]]); if(o.mane==='up') for(const [x,y,c] of MUP) r=O(r,[c],x,y+(o.ty|0)); if(o.mane==='flat') r=flat(r,o.ty|0); return r; };
  T.S={ idle:[S({}), S({hy:10})],
    windup:S({mane:'up', hx:23, hy:11, legs:BRACE}),
    charge:[S({mane:'flat', hx:23, hy:11, legs:GALA}), S({mane:'flat', hx:23, hy:10, legs:GALB, ty:-1})],
    wind:S({head:HTK, hx:22, hy:6, legs:BRACE}),
    act:S({head:HUP, hx:23, hy:2, legs:BRACE}),
    stomp:at([[REAR,0,0]]),
    slam:S({mane:'up', hx:23, hy:12, legs:SPLAY, ly:1}),   // (PX6F: ly 1 — the hooves on the line, as exhaust & recover)
    roar:[S({mane:'up', head:HROAR, hx:22, hy:3}), S({mane:'up', head:HROAR, hx:22, hy:2, ty:-1})],
    exhaust:[S({mane:'flat', head:HSP2, hx:23, hy:9, legs:SPLAY, ly:1, ty:1}), S({mane:'flat', head:HSP2, hx:23, hy:10, legs:SPLAY, ly:1, ty:2})],
    recover:S({hx:22, hy:11, legs:SPLAY, ly:1, ty:1}) };
  // ---- front (toward the camera) 25 × 30: the crest rising behind the head, the shoulders either side · the HEAD (ears · the old scar over its right eye ·
  //      the long snout & its disc · two GOLD tusks) · LEGS ----
  const W2=25, B2=()=>Array(H).fill('.'.repeat(W2)), at2=parts=>{ let r=B2(); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1]|0,p[2]|0); return r; };
  const DB=['..........g.g.g..........','........g.r.r.r.g........','........rrrrrrrrr........','......g.rrrrrrrrr.g......','......rrrrrrrrrrrrr......','.....rrrrrrrrrrrrrrr.....','....rrlllllllllllllrr....','...dllllllllllllllllld...','..dmlllllllllllllllllmd..','.dmmlllllllllllllllllmmd.','.dmmmmmmmmmmmmmmmmmmmmmd.','.dmmmmmmmmmmmmmmmmmmmmmd.','.dmmmmmmmmmmmmmmmmmmmmmd.','.dmmmmmmmmmmmmmmmmmmmmmd.','.dmmmmmmmmmmmmmmmmmmmmmd.','.dmmmmmmmmmmmmmmmmmmmmmd.','.dmmmmmmmmmmmmmmmmmmmmmd.','.dmmmmmmmmmmmmmmmmmmmmmd.','.dmmmmmmmmmmmmmmmmmmmmmd.','.dmmmmmmmmmmmmmmmmmmmmmd.','.ddmmmmmmmmmmmmmmmmmmmdd.','..ddddddddddddddddddddd..'];
  const DUP=[[10,1,'g'],[12,1,'g'],[14,1,'g'],[10,2,'r'],[12,2,'r'],[14,2,'r'],[10,3,'r'],[12,3,'r'],[14,3,'r'],[8,3,'g'],[16,3,'g'],[8,4,'r'],[16,4,'r'],[6,5,'g'],[18,5,'g']];   // (the crest bristling, head-on)
  const flat2=(r,ty)=>O(clr(r,6,3+ty,18,5+ty),['.........g.g.g.....','.......rrrrrrrrrrr..'],1,5+ty);
  const DH=['...d.................d...','...dd...............dd...','...dsd.............dsd...','....dsdmlllllllllmdsd....','.....ddlllllllgllldd.....','.....dmmddlllllgdmmd.....','....dmmmmklllllkmmmmd....','...ddmmmmmmlllmmmmmmdd...','...dmmmmmmmlllmmmmmmmd...','..tdmmmmmmmlllmmmmmmmdt..','..tddmmmmmmlllmmmmmmddt..','...tdmmmmmmmmmmmmmmmdt...','....tdmmmmsssssmmmmdt....','.....tdmmssrsrssmmdt.....','......gdmmsssssmmdg......','.......gdrrrrrrrdg.......','.........ddmmmdd.........','..........ddddd..........'];
  const DHO=DH.slice(0,15).concat(['.......gdrsssssrdg.......','........drsssssrd........','.........drrrrrd.........','..........ddddd..........']);   // ROAR: the jaw dropped, the pink maw
  const DHS=O(spr2Rep(DH,{k:'d'}).concat(['.........................']),['s','s'],12,17);   // spent: the eyes shut, the tongue out
  const DL=['..dmmmd...........dmmmd..','...dlmd.dd.....dd.dmld...','...dlmd.dd.....dd.dmld...','...dmmd.dd.....dd.dmmd...','...rrrr.rr.....rr.rrrr...','...rrrr.rr.....rr.rrrr...'];
  const DLB=['.dmmmd.............dmmmd.','.dlmd...dd.....dd...dmld.','dlmd....dd.....dd....dmld','dmmd....dd.....dd....dmmd','rrrr....rr.....rr....rrrr','rrrr....rr.....rr....rrrr'];
  const DGA=['..dmmmd...........dmmmd..','...dlmd.dd.....dd.dmld...','...dlmd.dd.....dd.dmmd...','...dlmd.dd.....rr.rrrr...','...dmmd.rr.......rrrr....','...rrrr..................'];
  const DGB=['..dmmmd...........dmmmd..','...dlmd.dd.....dd.dmld...','...dmmd.dd.....dd.dmld...','...rrrr.rr.....dd.dmld...','....rrrr.......rr.dmmd...','..................rrrr...'];
  const DLS=['.........................','.dmmmd.............dmmmd.','.dlmd...dd.....dd...dmld.','.dmmd...dd.....dd...dmmd.','rrrr....rr.....rr....rrrr','rrrr....rr.....rr....rrrr'];   // (PX6F: the blank row on top — the splayed hooves on the line)
  const D=(o)=>{ const ty=o.ty|0; let r=at2([[DB,0,3+ty],[o.legs||DL,0,24+(o.ly|0)],[o.head||DH,o.hx|0,7+(o.hy|0)]]); if(o.mane==='up') for(const [x,y,c] of DUP) r=O(r,[c],x,y+ty); if(o.mane==='flat') r=flat2(r,ty); return r; };
  const DREAR=(()=>{ let r=at2([[DB,0,0],[DH,0,3]]); for(const [x,y,c] of DUP) r=O(r,[c],x,y-3);
    r=O(r,['.dmmd.............dmmd.','dlmmd.............dmmld','dlmd...............dmld','rrrd...............drrr','.rr.................rr.'],1,14);   // the forelegs up either side of the face, hooves out
    r=O(r,['.dlllllllld.','..dlllllld..','...dddddd...'],7,21);   // the pale belly
    return O(r,['..dmmd.dd.....dd.dmmd..','..dlmd.dd.....dd.dmld..','..dmmd.dd.....dd.dmmd..','..rrrr.rr.....rr.rrrr..','..rrrr.rr.....rr.rrrr..'],1,25); })();   // the hind legs planted
  T.D={ idle:[D({}), D({hy:1})], windup:D({mane:'up', hy:2, legs:DLB}), charge:[D({mane:'flat', hy:2, legs:DGA}), D({mane:'flat', hy:1, ty:-1, legs:DGB})],
    wind:D({hx:-2, hy:2, legs:DLB}), act:D({hx:2, hy:-2, legs:DLB}), stomp:DREAR,
    slam:D({mane:'up', hy:3, legs:DLS}), roar:[D({mane:'up', head:DHO, hy:-1}), D({mane:'up', head:DHO, hy:-2, ty:-1})],
    exhaust:[D({mane:'flat', head:DHS, hy:3, ty:1, legs:DLS}), D({mane:'flat', head:DHS, hy:4, ty:2, legs:DLS})], recover:D({hy:2, ty:1, legs:DLS}) };
  // ---- back (away) 25 × 30: the crest running down the spine from the hump, the ears either side of it, the scarred back, the haunches, the tail's tuft ----
  const UB=['..........g.g.g..........','........g.r.r.r.g........','........rrrrrrrrr........','......g.rrrrrrrrr.g......','.......rrrrrrrrrrr.......','.......rrrrrrrrrrr.......','..dddllrrrrrrrrrrrllddd..','.dmhhllllrrrrrrrllllhmmd.','dmhllllllllrrrlllllllhmmd','dmhlllglllllrlllllllmmmmd','dmhllllgllllrllllllmmmmmd','dmmlllllglllrlllllmmmmmmd','.dmmlllllllldlllllmmmmmd.','.dmmmllllllldllllmmmmmmd.','.dmmmmllllllmllllmmmmmmd.','.dmmmmmllllldlllmmmmmmmd.','.dmmmmmmlllldllmmmmmmmmd.','.ddmmmmmmmmdmdmmmmmmmmdd.','..dmmmmmmmmdmdmmmmmmmmd..','..ddmmmmmmdrrrdmmmmmmdd..','...ddmmmmd.rrr.dmmmmdd...','...dmmmmd...r...dmmmmd...'];
  const UE=['....d...............d....','...ddd.............ddd...'];   // the ears, from behind
  const UL=['....dlmd.........dmld....','....dlmd.........dmld....','....dmmd.........dmmd....','....rrrr.........rrrr....','....rrrr.........rrrr....'];
  const ULB=['...dlmd...........dmld...','..dlmd.............dmld..','..dmmd.............dmmd..','.rrrr...............rrrr.','.rrrr...............rrrr.'];
  const UGA=['....dlmd.........dmld....','....dlmd.........dmmd....','....dlmd.........rrrr....','....dmmd.................','....rrrr.................'];
  const UGB=['....dlmd.........dmld....','....dmmd.........dmld....','....rrrr.........dmld....','.................dmmd....','.................rrrr....'];
  const ULS=['.........................','...dlmd...........dmld...','...dmmd...........dmmd...','..rrrr.............rrrr..','..rrrr.............rrrr..'];   // (PX6F: the hooves on the line)
  const UTL=['.r.','.r.','rrr','.r.'];   // (PX6F) the tail hanging below the haunches to its tuft — a rump, not a heart
  const U=(o)=>{ const ty=o.ty|0; let r=at2([[UB,0,3+ty],[o.legs||UL,0,25+(o.ly|0)],[o.ears===0?null:(o.ears||UE),o.ex|0,7+(o.ey|0)+ty],[UTL,11,25+ty]]); if(o.mane==='up') for(const [x,y,c] of DUP) r=O(r,[c],x,y+ty); if(o.mane==='flat') r=flat2(r,ty); if(o.fx) r=O(r,o.fx[0],o.fx[1],o.fx[2]); return r; };
  const UROAR=['..ss..','.ssss.','.ssrss','t.ss.t'];   // a snout thrown up past the crest (the roar)
  T.U={ idle:[U({}), U({fx:[['r'],13,24]})], windup:U({mane:'up', ears:0, legs:ULB}), charge:[U({mane:'flat', ears:0, legs:UGA}), U({mane:'flat', ears:0, legs:UGB, ty:-1})],
    wind:U({ex:-2, ey:1, legs:ULB}), act:U({ex:2, ey:-1, legs:ULB, fx:[['ss','sr','t.'],19,6]}),
    stomp:U({mane:'up', ey:-2, ty:-2, legs:['....dlmd.........dmld....','....dlmd.........dmld....','....dlmd.........dmld....','....dlmd.........dmld....','....dmmd.........dmmd....','....rrrr.........rrrr....','....rrrr.........rrrr....'], ly:-2}),   // reared away: up on its hind legs, taller, every bristle up
    slam:U({mane:'up', ears:0, ty:2, legs:ULS}), roar:[U({mane:'up', ey:-1, fx:[UROAR,9,0]}), U({mane:'up', ey:-2, ty:-1, fx:[UROAR,9,-1]})],
    exhaust:[U({mane:'flat', ears:['.........................','..dd.................dd..'], ty:1, legs:ULS}), U({mane:'flat', ears:['.........................','.dd...................dd.'], ty:2, legs:ULS})],
    recover:U({ey:1, ty:1, legs:ULS}) };
  T.S.cx0=14; T.D.cx0=T.U.cx0=12;   // (each view's feet on the body's centre & its shadow)
})();
/* ---------------- THE PACK KING (PX K7a · dingoBoss · px_design §2.7's lord table): his own drawing at his true size (r0 11.11), TG1's dingo grown — a great
   shaggy RUFF over his neck & shoulders, a COLLAR of bone beads with a fang at his throat, the tall ears, the long pale muzzle (bossTint's dusk cast washes him) ·
   idle 2 · walk 4 · CROUCH (the pounce's wind-up: low, ears pinned — the lane locks) · POUNCE (the leap) · WIND (the snarl) · ACT (the bite) · HOWL 2 (the muzzle
   thrown up: his shadows come) · RECOVER (panting) — from the front a WOLF's face (the stop, the long muzzle) and the ruff a collar, never a halo ---------------- */
SPR2.tpl.dingoBoss={ r0:11.11, cx0:15, cy0:20, eyeL:'k',
  sel:(en,pose)=>{ const st=en.st; return en.howl>0||st==='howl'?'howl':st==='crouch'?'crouch':st==='pounce'?'pounce':st==='wind'?'wind':st==='act'?'act':st==='recover'?'recover':en.mv?'walk':'idle'; },
  alt:{key:'atk', pal:{k:'#ff4a30'}},
  pal:{d:'#8a5a2a', m:'#c48a44', l:'#e0ae68', h:'#f0d8a0', w:'#f4e8cc', r:'#2a1a10', R:'#4a3220', b:'#fffaf0', k:'#ffd040', o:'#1c1008', e:'#c06a5a'} };
(function(){
  const T=SPR2.tpl.dingoBoss, O=spr2Over, W=36, H=28, B=()=>Array(H).fill('.'.repeat(W)), at=parts=>{ let r=B(); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1]|0,p[2]|0); return r; };
  const tilt=(rows,k,x0,pad)=>{ const w=rows[0].length, h=rows.length, o=Array.from({length:h+2*pad},()=>Array(w).fill('.')); for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const c=rows[y][x]; if(c==='.') continue; const ny=y+pad-Math.round(k*Math.max(0,x-x0)); if(ny>=0&&ny<o.length) o[ny][x]=c; } return o.map(r=>r.join('')); };   // (a column shear: k > 0 lifts the muzzle)
  // ---- side (facing right) 36 × 28: TAIL · BODY · LEGS · the shaggy RUFF & its bone COLLAR · HEAD ----
  const TAIL=['..hw.....','.hlw.....','.dlhw....','..dlld...','...dmld..','....dmmd.','.....dmmd','......dmm'];
  const TAILB=['.........','hw.......','dlhw.....','.dllld...','..ddmmld.','.....dmmd','......dmm','.........'];   // (the idle's flick · straight back: the crouch, the leap)
  const TAILS=['.........','.........','.........','hhw......','dllllldd.','.ddmmmmmd','......dmm','.........'];
  const BODY=['.............lll.......','......dllllllllllll....','....dmlhhhlllllllllm...','...dmlhllllllllllmmm...','..dmmlllllllllllmmmmm..','..dmmmmmmmmmmmmmmmmmm..','..dmmmmmmmmmmmmmmmmmm..','..dmmmmmmmmmmmmmmmmmm..','...dmmmmmmmmmmmmmmmmm..','...dmmmwwwwwwwwmmmmmm..','....dmwwwwwwwwwwwmmm...','.....dwwwwwwwwwwdd.....'];
  const RUFF=['......r.r.r..','....r.rrrrrr.','..r.rrrrrrrr.','.rrrrrrrrrrr.','rrrrRrrrrrrr.','.rrrrrRrrrrr.','rrRrrrrrrrrrr','.rrrrrrRrrrrr','..rrRrrrrrrrr','.rrrrrrrrrrr.','..rrrRrrrrr..','...rrrrrrrr..','...rr.rrr.r..','....r..r.....'];
  const COLLAR=[[6,3,'b'],[6,4,'o'],[6,5,'b'],[6,6,'o'],[7,7,'b'],[7,8,'o'],[8,9,'b'],[8,10,'o'],[9,11,'b'],[9,12,'b'],[8,12,'b'],[10,12,'b'],[9,13,'b']];   // bone beads round the neck, a fang hung at the throat
  const HEAD=['...d..d........','..dd.dld.......','..dmddeld......','..dmmdeed......','.dmmmmmmmd.....','dmlllllllld....','dmllklllllllld.','dmllllllllllloo','dmmlllllwwwwwo.','ddmmmwwwwwwoo..','.ddmwwwwwwd....','..ddwwwwdd.....','....dddd.......'];
  const PIN=r=>O(r.map((x,i)=>i<4?'.'.repeat(15):x),['...............','...............','dd.............','.ddd...........'],0,0).map((x,i)=>i===3?'.dddmmmmmd'.padEnd(15,'.'):x);   // the ears laid flat back
  const OPEN=HEAD.slice(0,8).concat(['dmmlllllwwwwbo.','ddmmmwwwob.ooo.','.ddmwwwooeeo...','..ddwwwbooo....','....dddddd.....']);   // the jaws wide: a fang above, a fang below, the pink tongue
  const SNARL=HEAD.slice(0,8).concat(['dmmlllllbwbwbo.','ddmmmwwwooooo..','.ddmwwwwwwd....','..ddwwwwdd.....','....dddd.......']);   // the lips curled off the fangs
  const TONGUE=O(HEAD.concat(['...............','...............']),['ee','e.','e.'],8,10);   // spent: the tongue lolling
  const HPIN=PIN(HEAD), HPO=PIN(OPEN), HHOWL=tilt(PIN(OPEN),0.75,4,7), HHOWL2=tilt(PIN(OPEN),0.95,4,8);   // the crouch & the leap · the HOWL: the muzzle thrown up
  const LEGS=['......dlmd.dmd.....dlmd.dmd.........','......dlmd.dmd.....dlmd.dmd.........','.......dlmd.dmd....dlmd.dmd.........','........dmd.dmd....dlmd.dmd.........','.......dmd..dmd....dlmd.dmd.........','......dmd..dmd.....dlmd.dmd.........','......dmd..dmd.....dmmd.dmd.........','......dmd..dmd.....dmd..dmd.........','.....oooo.ooo......oooo.ooo.........','.....oooo.ooo......oooo.ooo.........'];
  const LA=['......dlmd..dmd...dlmd..dmd.........','......dlmd..dmd...dlmd..dmd.........','.....dlmd...dmd....dlmd..dmd........','.....dlmd....dmd....dlmd..dmd.......','....dlmd.....dmd.....dlmd..dmd......','....dmd.......dmd.....dmd...dmd.....','...dmd........dmd......dmd...dmd....','...dmd........dmd......dmd...dmd....','..dmd.........ooo.......ooo...ooo...','..ooo.........ooo.......ooo...ooo...'];   // (PX6F: every paw on leg row 9 — the shadow's line, as the idle)
  const LP=['......dlmd.dmd.....dlmd.dmd.........','......dlmd.dmd.....dlmd.dmd.........','.......dlmd.dmd....dlmd.dmd.........','........dmd.dmd....dlmd.dmd.........','.......dmd..dmd....dmmd.dmd.........','......dmd..dmd.....dmd..dmd.........','......dmd..dmd.....dmd..dmd.........','.....oooo.ooo......oooo.ooo.........','.....oooo.ooo......oooo.ooo.........'];   // (the bob: the body sinks a row, the legs bend — set at ly 1, the paws stay on the line)
  const LB=['.......dlmd.dmd...dlmd.dmd..........','........dlmddmd..dlmd.dmd...........','.........dlmdmd.dlmd.dmd............','..........dlmdddlmd.dmd.............','..........dmmddmd..dmd..............','.........dmd.dmd..dmd...............','.........dmd.dmd..dmd...............','.........dmd.dmd..dmd...............','........ooo..ooo.ooo................','........ooo..ooo.ooo................'];
  const LCR=['.....ddmmd.dmd....dlmmd.dmd.........','....dlmmd..dmmd..dlmmdd.dmd.........','....dlmmd..dmmd..dlmd...dmd.........','...ooooo..oooo..oooo...ooo..........','...oooo...ooo...oooo...ooo..........'];   // the crouch: legs folded under
  const LPO=['.........................dmd........','........dlmd.dmd....dlmd..dmd.......','......dlmd.dmd.......dlmd..dmd......','....dlmd.dmd...........dlmd.dmd.....','..dlmd.dmd...............dlmd.ooo...','.ooo.ooo...................ooo......'];   // the leap: hind legs kicked out behind, forelegs reaching
  const LSP=['.....dlmd..dmd....dlmd...dmd........','.....dlmd..dmd.....dlmd..dmd........','....dlmd...dmd.....dlmd...dmd.......','....dmd....dmd......dmd...dmd.......','...dmd.....dmd......dmd....dmd......','...dmd.....dmd......dmd....dmd......','...dmd.....dmd......dmd....dmd......','..oooo....ooo........ooo...ooo......','..oooo....ooo........ooo...ooo......'];   // (set at ly 1 under the slumped body: the paws on the line)
  const S=(o)=>{ const ty=o.ty|0; let r=at([[o.tail||TAIL,0+(o.tx|0),5+ty],[BODY,4,7+ty],[o.legs||LEGS,0+(o.lx|0),18+(o.ly|0)],[RUFF,13,3+ty],[o.head||HEAD,21+(o.hx|0),(o.hy|0)+ty]]); for(const [x,y,c] of COLLAR) r=O(r,[c],x+13,y+3+ty); return r; };
  T.S={ idle:[S({}), S({tail:TAILB})],
    walk:[S({legs:LA}), S({legs:LP, ty:1, ly:1}), S({legs:LB}), S({legs:LP, ty:1, ly:1})],
    crouch:S({head:HPIN, hx:1, hy:6, ty:4, legs:LCR, ly:5, tail:TAILS}),
    pounce:S({head:HPO, hx:2, hy:1, ty:-1, legs:LPO, ly:-4, tail:TAILS, tx:-1}),
    wind:S({head:SNARL, hx:-1, hy:1, ty:1}),
    act:S({head:OPEN, hx:2, hy:2}),
    howl:[S({head:HHOWL, hx:0, hy:-7, tail:TAILB}), S({head:HHOWL2, hx:0, hy:-8, tail:TAILB})],
    recover:S({head:TONGUE, hx:1, hy:3, ty:1, legs:LSP, ly:1}) };
  // ---- front (toward the camera) 23 × 28, drawn as left halves mirrored about col 11: a WOLF'S face, not a cat's — the dark stop between the eyes, the long pale
  //      muzzle with the nose at its end and the mouth under it; the ruff a shaggy COLLAR from the jaw down over the chest (never a halo), the bone beads in
  //      an arc across it, a fang hung on the pale chest ----
  const W2=23, B2=()=>Array(H).fill('.'.repeat(W2)), at2=parts=>{ let r=B2(); for(const p of parts) if(p&&p[0]) r=O(r,p[0],p[1]|0,p[2]|0); return r; };
  const sym=L=>L.map(s=>s+[...s.slice(0,11)].reverse().join(''));   // (a left half of 12 → the 23-wide row, mirrored about col 11)
  const DH=sym(['...dd.......','...ded......','...deed.....','...deeed....','....deedmmmm','.....ddmllll','....dmllllld','....dmdkllld','...dmmmmlwww','...dmmmwwwoo','....dmmwwwwo','.....ddmwwoo','......ddwwww','.......ddddd']);
  const DB=sym(['.rr.........','rrrr........','rrrrr.......','rrRrrr......','.rrrrrrr....','rrrrRrrrrrrr','rrrrrrrrrrrr','.rrrRrrrwwww','.rr.rrrrdwww','..dmm.r.dwww','..dmmm..dwww','..ddmm..dwww']);
  const DCOL=[[3,4,'b'],[5,5,'o'],[6,5,'b'],[8,6,'b'],[9,6,'o'],[10,7,'b'],[11,7,'o'],[12,7,'b'],[13,6,'o'],[14,6,'b'],[16,5,'b'],[17,5,'o'],[19,4,'b'],[11,8,'b'],[11,9,'b']];   // (the bone beads in an arc across the ruff, the fang on the chest)
  const DPIN=DH.map((r,i)=>i<4?'.'.repeat(W2):i===4?'ddddd...mmmmmmm...ddddd':i===5?'.dddddddmllllllldddddd.'.slice(0,23):r);   // the ears pinned flat out to the sides
  const DOPEN=DH.slice(0,10).concat(sym(['....dmmwbwwo','.....dmwoeee','......doeeee','.......dbooo','........dddd']));   // the jaws wide at you: fangs, the pink tongue
  const DSNARL=DH.slice(0,10).concat(sym(['....dmmbbbbo','.....ddooooo','......ddwwww','.......ddddd']));   // the lips curled off the fangs
  /* the HOWL from the front: the head thrown back — the nose on top, the open mouth & its fangs, the eyes low, the ears laid back, the pale throat */
  const DHOWL=sym(['..........oo','.........dmm','........dmoo','...dd..dmboo','...dmd.dmmee','....dmdmlkmw','.....dmmllww','......dmwwww','......dwwwww','.......dwwww','........dwww','.......rdwww','.....rrrdwww','...rrrrrdwww']);
  const DTONG=O(DH.concat(['.'.repeat(W2),'.'.repeat(W2)]),['e','e','e'],11,13);   // panting: the tongue out
  const DL=sym(['...dlmd.....','...dlmd.....','...dlmd.dd..','...dlmd.dd..','...dmmd.dd..','...oooo.oo..','...oooo.oo..']);
  const DLA=['...dlmd.........dmld...','...dlmd.........dmld...','...dlmd.dd...dd.dmld...','...dlmd.dd...dd.dmmd...','...dmmd.dd...dd.oooo...','...oooo.oo...oo........','...oooo.oo...oo........'];
  const DLB=['...dlmd.........dmld...','...dlmd.........dmld...','...dlmd.dd...dd.dmld...','...dmmd.dd...dd.dmld...','...oooo.dd...dd.dmmd...','........oo...oo.oooo...','........oo...oo.oooo...'];
  const DLP=sym(['............','...dlmd.....','...dlmd.dd..','...dlmd.dd..','...dmmd.dd..','...oooo.oo..','...oooo.oo..']);   // (the bob: the body sinks, the paws stay on the line)
  const DLC=sym(['............','.dmmd.......','dlmd........','dlmd...dd...','dmmd...dd...','oooo...oo...','oooo...oo...']);   // crouched at you: elbows out, low
  const DLPO=sym(['..dlmd......','.dlmd.......','dlmd........','oooo....dd..','........oo..','............','............']);   // leaping at you: forelegs flung wide
  const DLS=sym(['..dlmd......','..dlmd......','..dlmd..dd..','.dlmd...dd..','.dmmd...dd..','.oooo...oo..','.oooo...oo..']);
  const D=(o)=>{ const ty=o.ty|0; let r=at2([[DB,0,10+ty],[o.legs||DL,0,21+(o.ly|0)],[o.head||DH,o.hx|0,(o.hy|0)+ty]]); for(const [x,y,c] of DCOL) r=O(r,[c],x,y+10+ty); return r; };
  T.D={ idle:[D({}), D({head:O(DH,['..','dd','ded'],18,0)})],
    walk:[D({legs:DLA}), D({legs:DLP, ty:1}), D({legs:DLB}), D({legs:DLP, ty:1})],
    crouch:D({head:DPIN, hy:3, ty:3, legs:DLC}), pounce:D({head:DPIN.slice(0,10).concat(DOPEN.slice(10)), hy:1, ty:-1, legs:DLPO, ly:-2}),
    wind:D({head:DSNARL, hy:1}), act:D({head:DOPEN, hy:1}),
    howl:[D({head:DHOWL, hy:-1}), D({head:O(DHOWL,['.eee.'],9,4), hy:-1, ty:-1})], recover:D({head:DTONG, hy:2, ty:1, legs:DLS}) };
  // ---- back (away) 23 × 28: the ears' backs, the skull, the great ruff over the nape & shoulders (the collar's string across it), the dark saddle, the bushy
  //      tail raised & curled over the ruff to its pale tip (PX Z0 — hung only in the crouch & the leap) ----
  const UH=sym(['...dd.......','...dRd......','...dRRd.....','...dRRRd....','....dRRdmmmm','.....ddmmlll','.....dmmllll']);   // (PX6F: the ears' dark backs — pink ears face you, dark ones face away)
  const UHP=sym(['............','............','............','............','dddd....mmmm','.dddddddmlll','.....dmmllll']);   // the ears pinned flat
  const UHH=sym(['...........o','..........dm','...dd.....dm','...dmd...dmm','...dmmd.dmmm','....dmmdmmll','.....ddmmlll']);   // the howl, from behind: the muzzle's tip thrown up over the skull, the ears laid back
  const UB=sym(['...rrdmmmmmm','..rrrrbmmmmm','.rrrrrrbrrrr','rrrrRrrrrbrb','rrrrrrrrrrrr','.rrRrrrrrrrr','.rrrrrrrrrrR','..rr.rrrrrrr','..dmllrrr.rr','..dmllllllld','..dmlllllllm','..dmmllllllm','..dmmmllllld','..ddmmmmmmmd','...dmmmmmd..']);
  const UT=['....dddd....','...dlhhwd...','..dlhldwwd..','..dlhd.dwd..','..dlhd..d...','..dllhd.....','..dlmld.....','...dmld.....','...dmd......','...dmd......'];   // (PX Z0) the brush tail RAISED, as in his profile: up from the rump, curled over the dark ruff to its pale tip — his back no longer wears his front's outline
  const UT2=['.....dddd...','....dlhhwd..','...dlhldwwd.','..dlhd..dwd.','..dlhd...d..','..dllhd.....','..dlmld.....','...dmld.....','...dmd......','...dmd......'];   // (its sway)
  UT.y=UT2.y=8;   // (a raised tail's own row: drawn from the back's middle, not hung at the haunches like UTS)
  const UTS=['..dlld..','.dllld..','.dlllld.','..dlhhd.','..dwwwd.','........','........'];   // straight out toward you (the crouch, the leap)
  const UL=sym(['...dlmd.....','...dlmd.....','...dlmd.....','...dmmd.....','...oooo.....','...oooo.....']);
  const ULA=['...dlmd.........dmld...','...dlmd.........dmld...','...dlmd.........dmmd...','...dmmd.........oooo...','...oooo................','...oooo................'];
  const ULB=['...dlmd.........dmld...','...dlmd.........dmld...','...dmmd.........dmld...','...oooo.........dmmd...','................oooo...','................oooo...'];
  const ULP=sym(['............','...dlmd.....','...dlmd.....','...dmmd.....','...oooo.....','...oooo.....']);
  const ULC=sym(['.dmmd.......','.dmd........','.oooo.......','.oooo.......','............','............']);
  const ULPO=sym(['..dlmd......','.dlmd.......','dlmd........','dmd.........','ooo.........','............']);   // leaping away: the hind legs kicked out toward you
  const ULS=sym(['..dlmd......','..dlmd......','..dlmd......','..dmmd......','..oooo......','..oooo......']);
  const U=(o)=>{ const ty=o.ty|0, tl=o.tail||UT; return at2([[o.head||UH,0,(o.hy|0)+ty],[UB,0,7+ty],[o.legs||UL,0,22+(o.ly|0)],[tl,(tl.y!=null?8:7)+(o.tx|0),(tl.y!=null?tl.y:16)+ty+(o.tly|0)]]); };
  T.U={ idle:[U({}), U({tail:UT2})],
    walk:[U({legs:ULA, tail:UT2}), U({legs:ULP, ty:1}), U({legs:ULB}), U({legs:ULP, ty:1, tail:UT2})],
    crouch:U({head:UHP, ty:3, legs:ULC, ly:2, tail:UTS}), pounce:U({head:UHP, ty:-1, legs:ULPO, ly:-1, tail:UTS, tly:2}),
    wind:U({head:UHP, hy:1}), act:U({head:UHP}),
    howl:[U({head:UHH, hy:-1}), U({head:UHH, hy:-1, ty:-1})], recover:U({hy:2, ty:1, legs:ULS}) };
  T.S.cx0=15; T.D.cx0=T.U.cx0=11;   // (each view's feet on the body's centre & its shadow)
})();
/* ---------------- THE PACK KING'S SHADOWS (PX K7a · dingoClone · kingCall's {clone:true}): the dingo's own frames wearing the King's marks — his ruff over the
   neck & his bone collar, stamped by spr2Over at each frame's eye (S, D) or nape (U) · the King's colours (no biome tint) — bossTint's cold shadow still washes
   them, so they read as shadows of HIM ---------------- */
SPR2.tpl.dingoClone={ r0:7, cx0:10, cy0:7, atk:['crouch'], atk2:['pounce'], eyeL:'k', pal:Object.assign({}, SPR2.tpl.dingo.pal, {r:'#2a1a10', b:'#fffaf0'}) };   // (the King's colours — no biome tint; bossTint's cold shadow washes it)
(function(){
  const T=SPR2.tpl.dingoClone, Dg=SPR2.tpl.dingo, O=spr2Over;
  const RS=['..r.r.r.','.rrrrrb.','rrrrrrr.','rrrrrb..','.rrrrr..','..rrrb..','...rr.b.','......b.'];   // S: the ruff over the neck behind the eye, the beads down its front, a fang at the throat
  const RD=['r...........r','rr.........rr','rrb.......brr','.rrbobobobrr.','..r...b...r..'];   // D: the ruff at the jaw's sides, the beads across the chest, the fang
  const RU=['r.rbrbrbr.r','rrrrrrrrrrr','.r.r.r.r.r.'];   // U: the ruff over the nape, the collar's string across it
  const mark=(rows,face)=>{ let ey=-1, ex=1; for(let y=0;y<rows.length && ey<0;y++){ const x=rows[y].indexOf(face==='U'?'l':'k'); if(x>=0){ ey=y; if(face!=='U') ex=x; } }   // (the anchor: the eye — S & D — or the nape's first lit row — U)
    return ey<0 ? rows : face==='S' ? O(rows,RS,ex-7,ey-3) : face==='D' ? O(rows,RD,ex-3,ey+1) : O(rows,RU,ex,ey); };
  const conv=(F,face)=>{ const o={}; for(const k in F){ if(k[0]==='_') continue; const v=F[k]; o[k]=(k==='cx0'||k==='cy0') ? v : typeof v[0]==='string' ? mark(v,face) : v.map(r=>mark(r,face)); } return o; };
  T.S=conv(Dg.S,'S'); T.D=conv(Dg.D,'D'); T.U=conv(Dg.U,'U');
})();
/* ---------------- THE BROODMOTHER (PX K7b · crabBoss · px_design §2.7's lord table): her own drawing at her true size (r0 15.56 — never a scaled crab), the crab
   grown: a broad BARNACLED dome, spines down its margins, HUGE claws with dark tips, eyes on stalks (red while she means it — alt: en.atk) · three views (the
   front · a profile whose CLAWS & EYES lead, so her front — the side that halves your blows — reads from a flank · her back, the claws beyond it) · idle 2 (asleep) ·
   walk 2 (always, once roused) · WINDUP (claws flung wide & open: the lane locks) · LUNGE (claws thrust) · WIND / ACT (claws reared up, the acid foaming → sprayed) ·
   SHELL (SEALED: legs & claws drawn in, the eyes down — sized inside the actor loop's ring, never a second dome) · EXPOSED 2 (BELLY BARED: tipped on her back, the
   pale apron at you, the legs kicking) · RECOVER (slumped — a BREAK's too) ---------------- */
SPR2.tpl.crabBoss={ r0:15.56, cx0:25, cy0:23, eyeL:'k', alt:{key:'atk', pal:{k:'#ff4a30'}},
  sel:(en)=>{ const st=en.st; return st==='windup'?'windup':st==='lunge'?'lunge':st==='wind'?'wind':st==='act'?'act':st==='shell'?'shell':st==='exposed'?'exposed':st==='recover'?'recover':en.aggro?'walk':'idle'; },
  pal:{d:'#3a1020', m:'#7a2a30', l:'#b04a3e', h:'#e8885e', b:'#ece2d0', B:'#857468', c:'#1a0a0e', w:'#f8f0e0', k:'#140a04', v:'#f0d8b8', a:'#28ff00', A:'#a0ff40'} };
(function(){ const T=SPR2.tpl.crabBoss, P=s=>s.split('|');   // (her parts — rows joined by | — composed into every frame at load)
  const CLC=P('....ddddd.........|..ddlhhhhdd.......|.dlhhhhhhhhdddddd.|dlhhhlllllllhhhmcd|dlhhllllllllllmccc|dlllllllllldddd.cc|dllllllllld.......|dlllllllllmmmmdc..|dmlllllllmmmmmmcc.|.dmmmmmmmmmmmdc...|..dddddddddd......'), CLO=P('..............dcc.|...........ddhmc..|....dddd..dhhwd...|..ddlhhhddhlwd....|.dlhhhhhhhlld.....|dlhhhlllllld......|dlhhllllllld......|dlllllllllld......|dllllllllllwmwmdc.|dlllllllllmmmmmmcc|dmlllllllmmmmmmdc.|.dmmmmmmmmmmmdd...|..ddddddddddd.....'), CLU=P('.cc......cc..|.dcd....dcd..|.dhd....dmd..|dlhd....dlmd.|dlhw....wlmd.|dlhld..dllmd.|dlhlldddllmmd|dlhllllllllmd|dlhlllllllmmd|dlhllllllmmmd|dlllllllmmmmd|dmlllllmmmmd.|.dmmmmmmmmmd.|..dmmmmmmmd..|...ddmmmdd...|....dmmmd....|....dmmmd....');   // the claws: closed · open · reared up
  const SHD=[P('....................l....................|.............lhbbhhllllbllmm.............|..........hhhhbBBbhhhlbBblllmmm..........|........hhhhhhhbdhhhhllllllllmmmm........|.......hhbbbhhhhhhhhhlllllllbbmmmm.......|......hhbbBbbhhhhhhhbbbllllbBBbmmmm......|.....hhhbBBBbhhhhhhbbBbbllllbdmmmmmd.....|....hhhhhddbBbhhhhlbBBBbllllmmmmmbmdd....|.ch.hhhhhhhhhhhhhllldddllllbmmmmmBbdd.mc.|...hhbhhhhhhhhhlllllllllllmBbmmmmmdddd...|...hhBbhhhhhllllbllllllllmmmmmmmmmdddd...|ch.llllllllllllbBblllllmmmmmmmmmmddddd.mc|...dlllllllllllllllllmmmmmmmmmmbdddddd...|....lllllblllllllllmmmmmmmmmmmbBbdddd....|.ch.dllllBblllllmmmmmmmmmmmmddddddddd.mc.|.....dllllllmmmmmmmmmmmmmmmddddddddd.....|......dmmmmmmmmmmmmmmmmmmdddddddddd......|..ch...dmmmmmmmmmmmmmmdddddddddmmd...mc..|........ddmmmmmmmmmdddddddddmmmdd........|..........dddllllllldlllllllddd..........|.............dddddddlddddddd.............|....................d....................'),5,4];
  const SHS=[P('.............l.............|.......lhhhhllllllmm.......|.....hhhhhbbhhllllllmm.....|...hhhhhhbBBbhlllbllmmmm...|..hhhbbbhhbdhhllbBblmmmmm..|.hhhbbBbbhhhhlllllllmmmmmd.|hhhhbBBBbhhhllllllllmbmmmdd|hhhhhdddhhhlllbbbllmmBbmmdd|hhhhhhbhhllllbbBbbmmmmmmmdd|hbhhhbBblllllbBBBbmmmmmmddd|lBbllllllllllldddmmmmmmdddd|llllllllllllllmmmmmmmmddddd|llllllllllllmmmmmmbmmdddddd|dlllllllbmmmmmmmmbBbddddddd|.dmmmmmmBbmmmmmmmmdddddddd.|..dmmmmmmmmmmmmmddddddddd..|...ddllmmmmmmdddddddlldd...|.....ddlllllldlllllldd.....|....h..ddddddldddddd..m....|...c......h..d...m.....c...|.........c........c........'),8,5];
  const SHU=[P('...............lllllllllmm...............|............hhhhbbhhllllbllmm............|.........hhhhhhbBBbhhllbBblllmmm.........|........hhhhhhhhbdhhhllllllllmmmm........|......hhhhbbbhhhhhhhhllllllllbbmmmm......|.....hhhhbbBbbhhhhhhllllllllbBBbmmmd.....|.....hhhhbBBBbhhhhhlllbbbllllbdmmmmd.....|....hhhhhhdddbhhhhlllbbBbbllmmmmmmmdd....|.chhhbhhhhhhbBbhlllllbBBBblmmmmmmmbdddmc.|...hhBbhhhhhhhlllllllldddlmmbmmmmmBbdd...|...lhhhhhhhhlllllllllllllmmmBbmmmddddd...|ch.llllllllllllllllllllmmmmmmmmmmddddd.mc|...llllllllllllllblllmmmmmmmmmmddddddd...|...dllllllllllllbBbmmmmmmmmmmmddbddddd...|.ch.dllllblllllllmmmmmmmmmmmmddbBbddd.mc.|.....llllBbllmmmmmmmbbmmmmmddddddddd.....|.....dmmmmmmmmmmmmmbBBbmmddddddddddd.....|..ch..ddmmmmmmmmmmmmbdmdddddddddmdd..mc..|........dmmlmmmmmmmmdddddddddlmmd........|.........dddlllmddddddddddlllddd.........|............dddlllllllllllddd............|...............ddddddddddd...............'),5,5];
  const SED=[P('................l................|..........lbbhhlllblllm..........|.......hhhbBBbhhhbBblllmmm.......|......hhhhhbdhhhhlllllllmmm......|....hhbbbhhhhhhhbbbllllbbmmmm....|...hhbbBbbhhhhhbbBbbllbBBbmmmd...|...hhbBBbBbhhhhbBBBblllbdmmbmd...|..hhhhdddhhhhhlldddlllbmmmmBbdd..|..hbhhhhhhhhlllllllllmBbmmmmddd..|..hBbhhhhlllblllllllmmmmmmmmddd..|..lllllllllbBblllllmmmmmmmmdddd..|chlllllllllllllllmmmmmmmmbdddddmc|..dlllbllllllllmmmmmmmmmbBbdddd..|...lllBbllllmmmmmmmmmmmddddddd...|...dmmmmmmmmmmmmmmmmmddddddddd...|..chddmmmmmmmmmmmmmddddddddddmc..|......dmmmmmmmmmdddddddmmmd......|......ddddlllllldlllllldddd......|.....dlhhlddddddlddddddmllmd.....|.....dmmmccdd...d....ddcmmmd.....'),9,11];
  const SES=[P('...............l...............|.........hhhhhlllllllm.........|......hhhhhhbbhhlllllllmm......|....hhhhhhhbBBbhlllblllmmmm....|...hhhbbbhhhbdhhllbBbllmmmmm...|..hhhbbBbbhhhhhllllllllmmmmmm..|.hhhhbBBBbhhhhllllllllmbmmmmmd.|.hhhhhdddhhhllllbbblllmBbmmmdd.|hhhhhhhhbhhllllbbBbblmmmmmmmddd|hbhhhhhbBblllllbBBBbmmmmmmmdddd|lBbllllllllllllldddmmmmmmmddddd|dlllllllllllllllmmmmmmmmmdddddd|.lllllllllllllmmmmmmmbmmdddddd.|.dlllllllblmmmmmmmmmbBbddddddd.|..dmmmmmmBbmmmmmmmmmddddddddd..|...dmmmmmmmmmmmmmmdddddddmdddd.|....ddmllmmmmmmdddddddllmddlhld|......dddlllllldllllllddd.dmmcc|.....h...ddddddldddddd...m.....|....c......h...d...m......c....|..........c.........c..........'),6,11];
  const SEU=[P('...........bblllllblm............|.........hbBBbhhlbBblllm.........|.......hhhhbdhhhhlllllllmm.......|.....hbbbhhhhhhhhllllllbbmmm.....|....hbbBbbhhhhhhbbblllbBBbmmm....|...hhbBBBbhhhhhbbBbblllbdmmmmd...|..hhhhddbBbhhhhbBBBblllmmmmbmdd..|..hhhhhhhhhhhllldddlllbmmmmBbdd..|..hbhhhhhhhhlllllllllmBbmmmmddd..|..hBbhhhhlllblllllllmmmmmmmmddd..|..lllllllllbBblllllmmmmmmmmdddd..|..lllllllllllllllmmmmmmmmbddddd..|chllllbllllllllmmmmmmmmmbBbddddmc|..dlllBblllllmmmmmmmmmmdddddddd..|...dllllmmmmmmmmmmmmmddddddddd...|..chdmmmmmmmmmmmmmmddddddddddmc..|.....ddmlmmmmmmmmdddddddlmdd.....|.......ddlllmmdddddddllldd.......|.........dddlllllllllddd.........|............ddddddddd............'),9,11];
  const BXD=[P('............kk.....kk............|............l.......l............|............l...m...l............|.........mmmlmmmmmmmlmmm.........|.......mmmmbbbbbbbbbbbmmmm.......|.....mmmbbbbbbbbbbbbvvvvvmmm.....|....mmbbbbbbbbbbbbvvvvvvvvvmm....|..mmmbbbbbbbbbbbvvvvvvvvvvvvmmm..|..mmbBbbbbbbbvvvvvvvvvvvvvvBvmm..|.mmbbbBBbbbvvvvvvvvvvvvvvBBvvvmm.|mmbbbbbbBBvvvvBBBBBvvvvBBvvvvvvmm|mmbbbbbvvvBvBBvvvvvBBvBvvvvvvvvmm|mmbbvvvvvvvBBBBBBBBBBBvvvvvvvvvmm|mmvBBBvvvvBvvvvvvvvvvvBvvvvBBBBmm|mmvvvvBBBBBvvvvvvvvvvvBBBBBBBBBmm|ddvvvvvvvvBvBBBBBBBBBBBvBBBBBBBdd|.ddvvvvvvvBvvvvvvvvvvvBBBBBBBBdd.|..ddvvvvBBBvvvvvvvvvBBBBBBBBBdd..|..dddBBBvvBvBBBBBBBBBBBBBBBBddd..|....ddvvvvvBvvvBBBBBBBBBBBBdd....|.....dddvvvvBBBBBBBBBBBBBddd.....|.......ddddBBBBBBBBBBBdddd.......|.........ddddddddddddddd.........|................d................'),9,5];
  const BXS=[P('......................kk|......................l.|.........hhhlll......l..|......bhhhhhllllBl...l..|.....hBbhhhhllBBBBB.l...|....hhhhhhhhBBvvvvvBB...|...hhhhhhhhhBbvvvvvvB...|..bbbhhhhhhBbbvvvvvvvB..|.bbBbbhhhhBbbbvvvBBBBvB.|.bBBBbhhhhBbbbBBBvvvvvB.|.hdddhhhhlBbbbvvvvvvvvB.|hhhhhhhhlBbbbbvvvvvvvvvB|hhhhbbhllBbbbbvvvBBBBvvB|lhhbBBbllBbbbbBBBvvvvvvB|llllbdlllBbbbbvvvvvvvvvB|lllllllllBbbbbvvvvvvvvvB|lllllllllBbbbbvvvBBBBvvB|lllllllllBbbbbBBBvvvvvvB|lllblllllBbbbbvvvvvvvvvB|.lbBbllmmBbbbbvvvvvvvvvB|.mmmmmmmmmBbbbvvvBBBBvB.|..mmmmmmmmBbbbBBBvvvvvB.|..mmmmmmmmBbbbvvvvvvvvB.|...mmmmmmmmBbbvvvvvvvB..|....mmmmmdddBbvvvvvvB...|.....dddddddBBvvvvvBB...|......ddddddddBBBBB.....|.........dddddd.B.......'),5,3];
  const W=51, H=36, Gr=()=>Array.from({length:H},()=>Array(W).fill('.')), rows=g=>g.map(r=>r.join('')), get=(g,x,y)=>y>=0&&y<H&&x>=0&&x<W?g[y][x]:'.';
  const put=(g,x,y,c)=>{ x=Math.round(x); y=Math.round(y); if(y>=0&&y<H&&x>=0&&x<W) g[y][x]=c; };
  const line=(g,x0,y0,x1,y1,c)=>{ const dx=Math.abs(x1-x0), dy=-Math.abs(y1-y0), sx=x0<x1?1:-1, sy=y0<y1?1:-1, P=[]; let e=dx+dy, x=x0, y=y0;   // (Bresenham · c a letter, or (i,n) → a letter, '' = skip)
    for(;;){ P.push(x,y); if(x===x1&&y===y1) break; const e2=2*e; if(e2>=dy){ e+=dy; x+=sx; } if(e2<=dx){ e+=dx; y+=sy; } }
    const n=P.length/2; for(let i=0;i<n;i++){ const q=typeof c==='string'?c:c(i,n); if(q) put(g,P[2*i],P[2*i+1],q); } };
  const stamp=(g,R,ox,oy)=>{ for(let y=0;y<R.length;y++) for(let x=0;x<R[y].length;x++){ const c=R[y][x]; if(c!=='.') put(g,ox+x,oy+y,c); } };
  const layR=(g,R,ox,oy)=>{ const h=R.length, w=R[0].length, on=(x,y)=>y>=0&&y<h&&x>=0&&x<w&&R[y][x]!=='.';   // a limb laid over the body, a dark rim where it overlaps (the SNES line between parts)
    for(let y=-1;y<=h;y++) for(let x=-1;x<=w;x++) if(!on(x,y)&&get(g,x+ox,y+oy)!=='.'&&(on(x-1,y)||on(x+1,y)||on(x,y-1)||on(x,y+1))) put(g,x+ox,y+oy,'c'); stamp(g,R,ox,oy); };
  const rep=(R,m)=>R.map(r=>r.replace(/./g,c=>m[c]||c)), mir=R=>R.map(r=>[...r].reverse().join('')), dark=R=>rep(R,{h:'l',l:'m',m:'d',w:'d'}), shade=R=>rep(R,{h:'l',l:'m'});
  const rot=R=>{ const o=[]; for(let x=R[0].length-1;x>=0;x--){ let r=''; for(let y=0;y<R.length;y++) r+=R[y][x]; o.push(r); } return o; };   // a quarter turn anticlockwise (fingers up)
  const LEG=(g,q,far)=>{ const [[hx,hy],[kx,ky],[tx,ty]]=q, M=far?'d':'m', sd=tx<kx?1:-1;   // a jointed leg: the thigh lit on top, a knee, the shin to a dark tip
    line(g,hx,hy+1,kx,ky+1,M); line(g,hx,hy,kx,ky,far?'m':'l'); put(g,kx,ky-1,far?'m':'h'); line(g,kx,ky+1,tx,ty,(i,n)=>i>=n-2?'c':M); line(g,kx+sd,ky+1,tx+sd,ty-2,(i,n)=>i>=n-2?'':'d'); };
  const LD={ stand:'12,9,6,3,2,9,10,13,3,9,0,17,10,17,3,16,0,25,12,21,6,22,3,33', walkA:'12,9,6,2,2,8,10,13,3,10,1,18,10,17,3,15,0,24,12,21,6,23,4,33', walkB:'12,9,6,4,3,10,10,13,3,8,0,16,10,17,3,17,1,26,12,21,5,21,2,32',
    brace:'12,9,5,4,0,11,10,13,2,11,0,19,10,17,2,18,0,27,12,21,5,24,1,33', splay:'12,11,5,9,0,15,10,15,2,15,0,22,10,19,2,22,0,29,12,23,5,27,1,33', flailA:'13,10,8,2,4,0,11,13,4,6,0,3,11,17,3,13,0,8,12,21,4,20,0,15', flailB:'13,10,7,3,2,2,11,13,3,8,1,4,11,17,2,14,1,10,12,21,4,22,0,18' };
  const LSF={ stand:'12,9,8,3,5,7,17,7,15,1,12,4,24,7,27,1,30,4,29,9,33,4,36,8', walkA:'12,9,8,2,5,6,17,7,15,2,13,5,24,7,27,0,30,3,29,9,33,5,37,9', walkB:'12,9,8,4,6,8,17,7,15,0,12,3,24,7,27,2,29,5,29,9,33,3,36,7',
    brace:'12,9,7,4,3,9,17,7,14,2,10,5,24,7,28,2,32,5,29,9,34,5,38,9', splay:'12,10,6,6,2,10,17,8,13,4,9,7,24,8,29,4,33,7,29,10,35,7,39,11' };
  const LSN={ stand:'12,22,8,24,6,33,17,24,14,26,13,33,24,24,27,26,28,33,29,22,33,24,35,33', walkA:'12,22,8,23,5,33,17,24,14,26,14,33,24,24,27,26,27,33,29,22,33,23,36,33', walkB:'12,22,8,25,7,33,17,24,14,25,12,33,24,24,28,25,29,33,29,22,33,25,34,33',
    brace:'12,22,7,24,3,33,17,24,13,26,11,33,24,24,28,26,30,33,29,22,34,24,37,33', splay:'12,23,6,26,2,33,17,25,12,28,10,33,24,25,29,28,31,33,29,23,35,27,38,33' };
  const XSF='18,18,24,8,29,3,20,20,29,12,35,9,22,22,32,18,38,16,22,24,32,25,38,24', XSN='24,16,32,9,37,6,25,21,34,17,40,14,25,25,34,26,41,25,22,28,30,31,36,33';
  const legs=s=>{ const v=s.split(',').map(Number), o=[]; for(let i=0;i<v.length;i+=6) o.push([[v[i],v[i+1]],[v[i+2],v[i+3]],[v[i+4],v[i+5]]]); return o; };   // (each leg: hip · knee · tip)
  const legsD=(g,set,sh)=>{ sh=sh|0; for(const q of legs(LD[set])){ LEG(g,q.map(p=>[p[0],p[1]+sh]),false); LEG(g,q.map(p=>[W-1-p[0],p[1]+sh]),true); } };
  const pair=(g,R,x,y)=>{ layR(g,R,x,y); layR(g,shade(mir(R)),W-x-R[0].length,y); };   // the left claw & its mirror (the right, a shade darker)
  const at=(p,dy)=>(g)=>stamp(g,p[0],p[1],p[2]+(dy|0)), full=p=>{ const g=Gr(); stamp(g,p[0],p[1],p[2]); return rows(g); };
  const MOUTH=[['.dmmd.','dlmcld','dmmcmd','.ddcd.'],['dmAAAmd','dAaAaAd','dcaAacd','dcaaacd','.dacad.','..a.a..','..A....'],['.dAAAd..','dAAwAAd.','cAaAaAc.','caAAAac.','daAaAad.','aA.A.Aa.','A..a..A.','.a.A.a..','a..A..a.']];
  // ---- front (toward the camera): the legs fanned out both sides, the dome, the mouthparts, the eyes on their stalks, the claws held before the face ----
  const D=o=>{ const g=Gr(), ly=o.ly|0, c=o.claw||'rest'; legsD(g,o.legs||'stand'); at(SHD,ly)(g); stamp(g,MOUTH[o.mouth|0],o.mouth?22:23,24+ly);
    for(const [x,s] of [[21,-1],[29,1]]){ line(g,x,24+ly,x,21+ly,s<0?'h':'l'); line(g,x-s,24+ly,x-s,22+ly,'d'); put(g,x,20+ly,'k'); put(g,x-s,20+ly,'k'); put(g,x-s,19+ly,'d'); put(g,x,19+ly,'w'); }
    if(c==='rest') pair(g,CLC,3,22+ly); else if(c==='open') pair(g,CLO,-1,19); else if(c==='thrust') pair(g,CLC,7,24); else if(c==='up') pair(g,CLU,4,3+ly); else pair(g,CLC,2,23);
    return rows(g); };
  const XD=fl=>{ const g=Gr(); legsD(g,fl,1); at(BXD)(g); layR(g,CLC,0,22); layR(g,shade(mir(CLC)),W-18,22); return rows(g); };
  // ---- the profile (facing right): the far legs & claw up behind, the dome, the face at the front (the eyes, the mouthparts), the near legs & claw before it ----
  const S=o=>{ const g=Gr(), ly=o.ly|0, L=o.legs||'stand', c=o.claw||'rest', sp=o.mouth===2;
    for(const q of legs(LSF[L])) LEG(g,q.map(p=>[p[0],p[1]+ly]),true);
    const f=c==='rest'?[CLC,31,10]:c==='open'?[CLO,33,3]:c==='thrust'?[CLC,34,11]:c==='up'?[CLU,28,-2]:[CLC,30,13]; layR(g,dark(f[0]),f[1],f[2]+ly);   // the far claw, high & behind
    at(SHS,ly)(g); line(g,33,12+ly,33,9+ly,'d'); put(g,33,8+ly,'k'); line(g,35,15+ly,35,12+ly,'h'); line(g,36,15+ly,36,13+ly,'l'); put(g,35,11+ly,'k'); put(g,36,11+ly,'k'); put(g,35,10+ly,'w'); put(g,36,12+ly,'d');
    stamp(g,sp?['dcA.','cAAa','cAwAa','caAA','dca.']:o.mouth===1?['dc.','caA','cAa','da.']:['dm','cl','cm','dd'],35,16+ly);
    if(sp) for(const [x,y] of [[40,17],[41,18],[42,17],[43,19],[44,18],[45,20],[46,17],[47,19],[42,21],[46,22],[48,21],[44,23]]) put(g,x,y+ly,(x+y)%2?'a':'A');   // the spray, flung forward
    for(const q of legs(LSN[L])) LEG(g,q.map((p,i)=>i===2?[p[0],33]:[p[0],p[1]+ly]),false);
    const n=c==='rest'?[CLC,31,20]:c==='open'?[CLO,33,17]:c==='thrust'?[CLC,35,20]:c==='up'?[CLU,37,-2]:[CLC,30,22]; layR(g,n[0],n[1],n[2]+ly); return rows(g); };   // the near claw, low & in front
  const XS=A=>{ const g=Gr(); for(const q of legs(XSF)) LEG(g,A?q:q.map((p,i)=>i?[p[0]+1,p[1]+(i===2?2:1)]:p),true); at(BXS)(g);
    for(const q of legs(XSN)) LEG(g,A?q:q.map((p,i)=>i?[p[0]-1,p[1]+(i===2?-2:-1)]:p),false); layR(g,dark(rot(CLC)),25,A?0:1); layR(g,CLC,26,24); for(const x of [6,10,14,18,22]) put(g,x,31,'d'); return rows(g); };
  // ---- the back (away): the claws beyond the dome, the legs fanned, the dome & its back margin ----
  const U=o=>{ const g=Gr(), ly=o.ly|0, c=o.claw||'rest', tw=o.tw|0, cl=c==='open'?[dark(CLO),1,4]:c==='up'?[dark(CLU),6,0]:c==='thrust'?[dark(rot(CLC)),11,0]:[dark(rot(CLC)),9,c==='droop'?4:1];
    layR(g,cl[0],cl[1],cl[2]+ly+tw); layR(g,mir(cl[0]),W-cl[1]-cl[0][0].length,cl[2]+ly); legsD(g,o.legs||'stand'); at(SHU,ly)(g); return rows(g); };
  const XU=f=>{ const v=f.slice().reverse(); return v.slice(1).concat([v[0]]).map(r=>r.replace(/k/g,'c')); };   // (no eye texel from behind) (PX Z0) from behind, on her back: the front's BELLY BARED turned over — the claws beyond, the legs kicking toward you
  T.D={ idle:[D({}), D({}).map((r,y)=>y===26?r.replace('dmmcmd','dmcmmd'):r)], walk:[D({legs:'walkA'}), D({legs:'walkB', ly:-1})], windup:D({legs:'brace', claw:'open'}), lunge:D({legs:'brace', claw:'thrust', ly:1}),
    wind:D({claw:'up', mouth:1}), act:D({claw:'up', mouth:2}), shell:full(SED), exposed:[XD('flailA'), XD('flailB')], recover:D({legs:'splay', claw:'droop', ly:2}) };
  T.S={ idle:[S({}), S({}).map((r,y)=>y===17||y===18?r.slice(0,36)+(y===17?'m':'l')+r.slice(37):r)], walk:[S({legs:'walkA'}), S({legs:'walkB', ly:-1})], windup:S({legs:'brace', claw:'open'}), lunge:S({legs:'brace', claw:'thrust', ly:1}),
    wind:S({claw:'up', mouth:1}), act:S({claw:'up', mouth:2}), shell:full(SES), exposed:[XS(1), XS(0)], recover:S({legs:'splay', claw:'droop', ly:2}), cx0:21 };
  T.U={ idle:[U({}), U({tw:1})], walk:[U({legs:'walkA'}), U({legs:'walkB', ly:-1})], windup:U({legs:'brace', claw:'open'}), lunge:U({legs:'brace', claw:'thrust', ly:1}),
    wind:U({claw:'up'}), act:U({claw:'up'}), shell:full(SEU), exposed:T.D.exposed.map(XU), recover:U({legs:'splay', claw:'droop', ly:2}) };
})();
/* ---------------- THE EXPLORER (PX A2 · from TG1): a 14×19 body in the 3/4 view — TG1's shapes & walk, in YOUR colours: the navy sea coat, the red scarf
   (the collar W) and its tails (the front G column), the banded trek hat (H · B brim · G band), trousers, boots — PLAYER_LOOK_O, as in towns, on deck and in
   every story scene. Drawn by plBody → spr2Player at the whole scale spr2K (1 at every real window) — no tint, no ranks ---------------- */
SPR2.tpl.player={ r0:6.7, cx0:7, cy0:11, pal:{H:'#5c4020', B:'#7a5530', G:'#c8342a', F:'#e8c39a', k:'#1a1410', A:'#4a3020', C:'#2a4d63', L:'#3d6d88', D:'#1c3446', S:'#8a5a2c', T:'#34303e', o:'#2c1e10', s:'#e8c39a', W:'#d23a2e', m:'#2a4d63', d:'#1c3446', l:'#3d6d88'},
  D:{ idle:[
'.....HHHH.....',
'...HHHHHHHH...',
'..HHHHHHHHHH..',
'.BBBBGGGGBBBB.',
'..AAFFFFFFAA..',
'..AFFkFFFkFA..',
'..AFFFFFFFFA..',
'...FFFFFFFF...',
'..CCCWWWWCCC..',
'.CCCCWGGWCCCC.',
'.LCCCWGGWCCCL.',
'.LCCCCGGCCCCL.',
'.sCCCCCCCCCCs.',
'..SSSSSSSSSS..',
'..TTTTTTTTTT..',
'..TTTT..TTTT..',
'..TTT....TTT..',
'.ooo......ooo.',
'.ooo......ooo.'],
  walk:[[
'.....HHHH.....',
'...HHHHHHHH...',
'..HHHHHHHHHH..',
'.BBBBGGGGBBBB.',
'..AAFFFFFFAA..',
'..AFFkFFFkFA..',
'..AFFFFFFFFA..',
'...FFFFFFFF...',
'..CCCWWWWCCC..',
'.CCCCWGGWCCCC.',
'.LCCCWGGWCCCL.',
'.LCCCCGGCCCCL.',
'.sCCCCCCCCCCs.',
'..SSSSSSSSSS..',
'..TTTTTTTTTT..',
'..TTTT..TTTT..',
'..TTT....TTT..',
'.ooo......ooo.',
'..........ooo.'],[
'.....HHHH.....',
'...HHHHHHHH...',
'..HHHHHHHHHH..',
'.BBBBGGGGBBBB.',
'..AAFFFFFFAA..',
'..AFFkFFFkFA..',
'..AFFFFFFFFA..',
'...FFFFFFFF...',
'..CCCWWWWCCC..',
'.CCCCWGGWCCCC.',
'.LCCCWGGWCCCL.',
'.LCCCCGGCCCCL.',
'.sCCCCCCCCCCs.',
'..SSSSSSSSSS..',
'..TTTTTTTTTT..',
'..TTTT..TTTT..',
'..TTT....TTT..',
'.ooo......ooo.',
'.ooo..........']]},
  U:{ idle:[
'.....HHHH.....',
'...HHHHHHHH...',
'..HHHHHHHHHH..',
'.BBBBBBBBBBBB.',
'..AAAAAAAAAA..',
'..AAAAAAAAAA..',
'..AAAAAAAAAA..',
'...AAAAAAAA...',
'..CCCCCCCCCC..',
'.CCCCCCCCCCCC.',
'.LCCCCCCCCCCL.',
'.LCCCCDDCCCCL.',
'.sCCCCDDCCCCs.',
'..SSSSSSSSSS..',
'..TTTTTTTTTT..',
'..TTTT..TTTT..',
'..TTT....TTT..',
'.ooo......ooo.',
'.ooo......ooo.'],
  walk:[[
'.....HHHH.....',
'...HHHHHHHH...',
'..HHHHHHHHHH..',
'.BBBBBBBBBBBB.',
'..AAAAAAAAAA..',
'..AAAAAAAAAA..',
'..AAAAAAAAAA..',
'...AAAAAAAA...',
'..CCCCCCCCCC..',
'.CCCCCCCCCCCC.',
'.LCCCCCCCCCCL.',
'.LCCCCDDCCCCL.',
'.sCCCCDDCCCCs.',
'..SSSSSSSSSS..',
'..TTTTTTTTTT..',
'..TTTT..TTTT..',
'..TTT....TTT..',
'.ooo......ooo.',
'..........ooo.'],[
'.....HHHH.....',
'...HHHHHHHH...',
'..HHHHHHHHHH..',
'.BBBBBBBBBBBB.',
'..AAAAAAAAAA..',
'..AAAAAAAAAA..',
'..AAAAAAAAAA..',
'...AAAAAAAA...',
'..CCCCCCCCCC..',
'.CCCCCCCCCCCC.',
'.LCCCCCCCCCCL.',
'.LCCCCDDCCCCL.',
'.sCCCCDDCCCCs.',
'..SSSSSSSSSS..',
'..TTTTTTTTTT..',
'..TTTT..TTTT..',
'..TTT....TTT..',
'.ooo......ooo.',
'.ooo..........']]},
  S:{ idle:[
'....HHHHH.....',
'...HHHHHHHHH..',
'.HHHHHHHHHHH..',
'.BBBBGGGGBBBB.',
'....AAFFFFF...',
'....AAFFFkF...',
'....AAFFFFF...',
'.....FFFFF....',
'....CCCWWC....',
'...CCCCCWCC...',
'..LCCCCCWCCC..',
'..LCCCCCCCCC..',
'..LCCCDCCCCs..',
'...SSSSSSSS...',
'...TTTTTTTT...',
'...TTTT.TTT...',
'...TTT..TTT...',
'..ooo...ooo...',
'..ooo...ooo...'],
  walk:[[
'....HHHHH.....',
'...HHHHHHHHH..',
'.HHHHHHHHHHH..',
'.BBBBGGGGBBBB.',
'....AAFFFFF...',
'....AAFFFkF...',
'....AAFFFFF...',
'.....FFFFF....',
'....CCCWWC....',
'...CCCCCWCC...',
'..LCCCCCWCCC..',
'..LCCCCCCCCC..',
'..LCCCDCCCCs..',
'...SSSSSSSS...',
'...TTTTTTTT...',
'..TTTT...TTT..',
'.TTT......TTT.',
'ooo........ooo',
'ooo........ooo'],[
'....HHHHH.....',
'...HHHHHHHHH..',
'.HHHHHHHHHHH..',
'.BBBBGGGGBBBB.',
'....AAFFFFF...',
'....AAFFFkF...',
'....AAFFFFF...',
'.....FFFFF....',
'....CCCWWC....',
'...CCCCCWCC...',
'..LCCCCCWCCC..',
'..LCCCCCCCCC..',
'..LCCCDCCCCs..',
'...SSSSSSSS...',
'...TTTTTTTT...',
'....TTTTTT....',
'....TTTTTT....',
'....oooooo....',
'....oooooo....']]} };
(function(){ const T=SPR2.tpl.player; T.S.cx0=6; })();   // (PX A2) the profile's anchor: its feet stand on your centre (PX_T.hop)
}
if(window.requestIdleCallback) window.requestIdleCallback(()=>spr2Build(),{timeout:1500}); else setTimeout(spr2Build,200);   // (PX Z1) built while the title shows
function eBake(en,fa,fl,f,v,P,N,s,K){                         // (PX A1 K: eSprite's spr2Pick — a template's look, drawn from the very pick it was keyed on)
  const T=N>1?f*P/N:0, it0=itime, e0=eit, pr=Object.create(en), ec=ESPR.ctx, SZ=ESPR.sz, c=ESPR.c;   // paint at the loop's own clock, on a stand-in wearing the pattern
  pr.sd=ESC_VSD[v];
  if(en.type==='snake'){ const pc=ePose(en,fl), agit=pc>=8, tb=(pc>>1)&3, tg=pc&1;
    pr.aggro=agit; pr.x=agit?en.x:player.x+1e5; pr.tmr=ESC_TB[tb]; pr.y=((tg?0.1:0.6)+10-T*1.8)/0.05; }
  else if(en.type==='clam' && en.st!=='open') pr.tmr=en.tmr<0.35?0.1:1;
  else if(en.type==='diver' && en.st!=='grounded') pr.alt=Math.round(clamp(en.alt==null?1:en.alt,0,1)*8)/8;
  const rs=en.r*s, rk=K?Math.max(rs,spr2K(K.T,en,rs)*K.T.r0):rs, fcx=Math.cos(fa), fcy=Math.sin(fa), pxn=-fcy, pyn=fcx, R=Math.min(c, Math.ceil(rk*(en.type==='snake'||en.type==='lamprey'?3.8:3.1))+4), X0=c-R;   // (only the square this body can reach is cleared & read back · PX A1 rk: a template drawn bigger than its radius never clips)
  ec.clearRect(X0,X0,R*2,R*2);
  itime=T; eit=T;
  try{ if(K && spr2Draw(pr,c,c,rs,K,fl,f)){}                           // (PX A1) Sprites 2.0 first — then the old painters
    else if(en.type==='boar') drawBoar(pr,c,c,rs,fa,fcx,fcy,pxn,pyn,fl,s);
    else if(en.type==='snake') drawSnake(pr,c,c,rs,fa,fcx,fcy,pxn,pyn,fl,s);
    else if(en.type==='crab') drawCrab(pr,c,c,rs,fa,fcx,fcy,pxn,pyn,fl,s);
    else if(en.type==='dingo') drawDingo(pr,c,c,rs,fa,fcx,fcy,pxn,pyn,fl,s);
    else drawNewMon(pr,c,c,rs,fa,fcx,fcy,pxn,pyn,fl,s); }
  finally{ itime=it0; eit=e0; }
  if(!fl){ const tt=ESC_TT[eTint(en)];
    if(en.drowned || tt){ ec.globalCompositeOperation='source-atop'; if(en.drowned){ ec.fillStyle='rgba(70,200,180,.42)'; ec.fillRect(0,0,SZ,SZ); } if(tt){ ec.fillStyle=tt; if(en.guard) ec.globalAlpha=0.5; ec.fillRect(0,0,SZ,SZ); ec.globalAlpha=1; } ec.globalCompositeOperation='source-over'; } }   // raised from the deep: sea-green · a trait's cast (PX Z0, PX6V-4: half on a lord, so a frost Great Boar stays a brown boar, not a pale pink one)
  bossTint(en,fl);                                                                                                    // a lord of the deep's cast · a clone's cold shadow
  const R2=R, RG=[ESC_OL]; if(en.rar===2) RG.push(ESC_RK.rare,ESC_RK.rare2); else if(en.rar===1) RG.push(ESC_RK.magic); else if(en.guard) RG.push(ESC_RK.boss); else if(en.elite) RG.push(ESC_RK.elite);
  else { const rim=escRim(); if(rim) RG.push(en.fodder?rim.f:rim.n); }                                              // (a dark floor: a light rim outside the dark line — the body never sinks into the ash)
  const C=pixBake(ec,R2*2,c,RG,(en.fodder&&!fl)?ITUNE.fodderMute:0,X0,X0) || PIX_NONE; if(K && C!==PIX_NONE){ C.eyes=K.ey||[]; C.ek=K.ek||1; }   // (PX E1) a template's look carries its eyes (texels from the centre · none in a back view)
  return C; }
/* smooth FX a foe wears, drawn on the scene (not baked): behind it — a charging boar's speed lines, a pouncing dingo's leap streaks (texel
   dashes, see-through); in front — a winding-up boar's snorting steam (CV-04: the alpha snap used to erase all three) */
function pxLine(x0,y0,x1,y1){ const n=Math.max(1,Math.round(Math.max(Math.abs(x1-x0),Math.abs(y1-y0)))); let rx=0, ry=0, rw=0, rh=0;   // (G3 fix: the same texels, but a straight run of them is ONE rect — a long shallow line was ~90 fills)
  for(let i=0;i<=n;i++){ const t=i/n, x=Math.round(x0+(x1-x0)*t), y=Math.round(y0+(y1-y0)*t);
    if(rw && rh===1 && y===ry && (x===rx+rw || x===rx-1)){ if(x<rx) rx=x; rw++; continue; } if(rw===1 && x===rx && (y===ry+rh || y===ry-1)){ if(y<ry) ry=y; rh++; continue; }
    if(rw) pctx.fillRect(rx,ry,rw,rh); rx=x; ry=y; rw=1; rh=1; }
  if(rw) pctx.fillRect(rx,ry,rw,rh); }
function eFxPre(en,sx,sy,fcx,fcy,pxn,pyn,r){
  const ch=(en.type==='boar'||en.type==='kelpie'||en.type==='boulderback'||en.type==='walrus')&&en.st==='charge', po=(en.type==='dingo'&&en.st==='pounce')||(en.type==='cinderfox'&&en.st==='pass'); if(!ch&&!po) return;   // (C8a: a kelpie's dash & a boulderback's roll trail speed lines · a cinder fox's pass its streaks)
  const a0=ch?1.25:1.45, a1=ch?2.3:2.4, w=ch?0.5:0.4, ph=(Math.floor(itime*12)%2)*0.18;   // (the dashes tick back along the run)
  pctx.fillStyle=ch?'rgba(255,255,255,.5)':'rgba(255,244,220,.5)';
  for(const sg of [1,-1]) pxLine(sx-fcx*r*(a0+ph)+pxn*r*w*sg, sy-fcy*r*(a0+ph)+pyn*r*w*sg, sx-fcx*r*(a1+ph)+pxn*r*w*sg, sy-fcy*r*(a1+ph)+pyn*r*w*sg);
  pctx.fillStyle=ch?'rgba(255,255,255,.3)':'rgba(255,244,220,.3)'; pxLine(sx-fcx*r*(a0+0.3-ph), sy-fcy*r*(a0+0.3-ph), sx-fcx*r*(a1+0.5-ph), sy-fcy*r*(a1+0.5-ph)); }
function eFxPost(en,sx,sy,fcx,fcy,pxn,pyn,r,s){
  if(en.type==='boar' && (en.st==='windup'||en.st==='paw')){ let nx=sx+fcx*r*1.36, ny=sy+fcy*r*1.36;   // snorting steam off the snout (pawing & winding up)
    const T=ITUNE.artSpr>0&&spr2Tpl(en), M=T&&T.mouth; if(M){ const fi=((Math.round((en._fa||0)/(TAU/16))%16)+16)%16, fc=T.faces==='D'?'D':fi>=3&&fi<=5?'D':fi>=11&&fi<=13?'U':'S', m=M[fc], F=T[fc]||T.S;   // (PX E1 T.mouth) from the drawn snout — authored on the windup frame
      if(m){ const k=spr2K(T,en,r), ax=F.cx0!=null?F.cx0:T.cx0, ay=F.cy0!=null?F.cy0:T.cy0; nx=sx+(fc==='S'&&fi>=6&&fi<=10?ax-m[0]:m[0]-ax)*k; ny=sy-(T.lift?Math.round(T.lift(en,r)):0)+(m[1]-ay)*k; } }
    for(const sd2 of [0,0.5]){ const pf=(eit*6+sd2)%1, q=Math.max(1,Math.round((1.3+pf*2.8)*s)), sg=sd2?1:-1, d=r*(0.3+pf*0.35);
      pctx.fillStyle='rgba(255,255,255,'+(0.6*(1-pf)).toFixed(3)+')';
      pctx.fillRect(Math.round(nx+pxn*d*sg+fcx*pf*r*0.3-q/2), Math.round(ny+pyn*d*sg+fcy*pf*r*0.3-q/2), q, q); } }
  if(en.type==='bogtoad'){ const P=player.pull, pl=!!(P&&P.tng===en), tg=itime-(en.tgT==null?-9:en.tgT); if(pl || tg<0.2){   // (C8a) the TONGUE: out to its reach (or to you, reeling you in), then back
      let mx=sx+fcx*r*0.9, my=sy+fcy*r*0.9; { const T=ITUNE.artSpr>0&&spr2Tpl(en), M=T&&T.mouth, fi=((Math.round((en._fa||0)/(TAU/16))%16)+16)%16, fc=T&&(T.faces==='D'?'D':fi>=3&&fi<=5?'D':fi>=11&&fi<=13?'U':'S'), m=M&&M[fc]; if(m){ const F=T[fc]||T.S, k=spr2K(T,en,r), ax=F.cx0!=null?F.cx0:T.cx0, ay=F.cy0!=null?F.cy0:T.cy0; mx=sx+(fc==='S'&&fi>=6&&fi<=10?ax-m[0]:m[0]-ax)*k; my=sy+(m[1]-ay)*k; } }   // (PX K6 T.mouth) the tongue leaves the drawn mouth — authored on the tongue frame
      const a=en.aa!=null?en.aa:Math.atan2(fcy,fcx), L=(en.tgL||60)*s*(tg<0.07?tg/0.07:Math.max(0,1-(tg-0.07)/0.13));
      const [tx,ty]=pl?iwp(player.x,player.y):[mx+Math.cos(a)*L, my+Math.sin(a)*L];
      pctx.fillStyle='#5a1a24'; pxLine(mx,my+1,tx,ty+1); pctx.fillStyle='#e8889a'; pxLine(mx,my,tx,ty); pctx.fillStyle='#ffc0c8'; pctx.fillRect(Math.round(tx)-1,Math.round(ty)-1,2,2); } }
  if(en.type==='boulderback' && en.st==='exposed'){ pctx.fillStyle='#ffe066'; for(let k=0;k<3;k++){ const a=itime*7+k*TAU/3; pctx.fillRect(Math.round(sx+Math.cos(a)*r*0.8), Math.round(sy-r*1.0+Math.sin(a)*r*0.3), 1, 1); } }   // (C8a) DIZZY: stars round its head
  if(en.type==='salamander' && salIn(en)){ for(let k=0;k<3;k++){ const pf=(eit*1.6+k/3+en.sd)%1, q=Math.max(1,Math.round(1.3*s)); pctx.fillStyle='rgba(255,'+(140+(k*40))+',60,'+(0.7*(1-pf)).toFixed(3)+')';   // (C8c) BASKING in its lava: heat rises off its skin (it shrugs off blows)
      pctx.fillRect(Math.round(sx+(k-1)*r*0.5+Math.sin(eit*5+k)*r*0.15), Math.round(sy-r*0.4-pf*r*1.6), q, q); } } }

