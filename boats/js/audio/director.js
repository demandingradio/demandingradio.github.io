"use strict";
/* FILE: js/audio/director.js
THE DIRECTOR: the music plays itself. The stand-in chain, the sailing-into-the-unknown trigger, the 2 Hz priority table musEval
  (story, title, KO, hex, boss, victory, cave, crawl, town, deck, storm, unknown, sea day or night), transitions, rests, halts,
  stings, the muffle targets, the per-frame musUpdate, the first-gesture unlock, the music toggle and the DEV helpers.
Moved verbatim from original lines 7840-8037 (build 5109cd5), less original line 8022 (build 5109cd5): the musGesture capture
  listeners, which P3 (owner-approved, 2026-10-15) moved to the boot tail, just before original line 42146 (build 5109cd5).
Entry points: musUpdate (frameInner, every frame), MUS_HOOK (sfx), musSting (musicPlay), musFanNow (gchSting), musToggle
  (Shift+P, sndBlockWire, #tMusBtn), musTitleBtn (the boot tail, at load), musUnlock (pollPad), musGesture (the first press),
  musHalt (toggleMute), musPreview (sndSet), musResolve, musFin, musSounding, musReap (the Bard, js/audio/bard.js);
  DEV panel and console: musDirMeter, musRepick, musSkipTo, MUS_UNK, MUS_UNKK.
Globals it owns: MUS_FALLBACK, MUS_UNK, MUS_UNKK, MUS_UNKD, MUS_UNKA, MUS_REST, MUS_DECK (a let arrow: never a second
  declaration, never an assignment elsewhere), MUS_HOOK, MUS_MF and every function here (musEval, musGo, musStart, musVictory ...).
Main globals it reads from elsewhere (inside functions, at runtime): MUS, MUSG, musLP, musCompile, musInit, musEnd, musFree,
  musVolOf, musBankBuild, musTrackReady (js/audio/bard.js); MUS_T (js/audio/songbook.js); actx, audioOn, SNDP, initAudio,
  sndPrefsSave, sndApplyVol, sndBlockRefresh (js/audio/audio.js); env, boat, SEAS, SEAS_RG, SEAS_K, revealR, EXP, PLOG,
  toast (index.html, earlier parts); mode, ISL, INT, player, enemies, PRT, DK, LEDG, SCN, SAGA, GCH, menuOpen, talkOpen,
  ptMode, LTUNE and titleBGOn (original line 41997 (build 5109cd5)) from later parts and files.
Load-time statements: none that run code. Pure literal tables (MUS_FALLBACK to MUS_REST, MUS_HOOK's arrows, MUS_MF), the
  MUS_DECK arrow and function declarations. musTitleBtn is first called at load by the boot tail (original line 42147
  (build 5109cd5)), later. Keep the Bard, the songbook and this file in that order.
*/
/* ============================ THE DIRECTOR (PT1 M2a — pt1_audio §3.10) — the music plays itself, everywhere ============================
   musUpdate(dt) (the top of frameInner, every mode): the muffle & colour targets (musLP · MUSG.mg −3 dB · a cave's wetter reverb) · the drone silent under
   the music · every 0.5 s — at once on a mode change — musEval(): MUS.want {st, id, lv} by the priority table → musGo: the same tune → only its intensity ·
   another → a transition (musStart: "now", or on the next bar line) · rests (the Stardew breath: the sea after 2 loops, a calm crawl after 3, "Beyond the
   Chart" after 3) · the unknown trigger (MUS.unk: musUnknownAhead's fan of 15 fog samples + reveal()'s revN rate) · stings (musSting) & the claim / first /
   ko hooks (MUS_HOOK, asked by sfx). A state whose tune isn't composed yet plays a stand-in (MUS_FALLBACK → musResolve): the STATE (MUS.want.st) is exact.
   Console / DEV: MUS.want · musStat().dir · musSkipTo(sec, bar) · MUS.restMul · musRepick() · MUS.quiet · MUS_UNK (the DEV panel's 🎵 DIRECTOR row) */
const MUS_FALLBACK={sea_night:'sea_day', unknown:'sea_day', storm:'sea_day', town_small:'theme', town_big:'town_small', tavern:'town_small', table:'tavern', crawl_a:'theme', crawl_b:'crawl_a', cave:'crawl_a', boss:'crawl_a', victory:'theme', deck:'sea_day', title:'theme', sea_day:'theme'};
const MUS_UNK={frac:0.6, rate:20, spd:0.35, T:5, off:4, fresh:90};   // SAILING INTO THE UNKNOWN: fog ahead ≥ frac · charting ≥ rate cells/s · speed ≥ spd × top · held T s to begin · off s to end · the horn call after fresh s away
const MUS_UNKK=[['frac',0.05,0.1,1],['rate',2,0,120],['spd',0.05,0,1],['T',0.5,0.5,30],['off',0.5,0.5,30],['fresh',10,0,600]];   // (the DEV row's knobs: key · step · min · max)
const MUS_UNKD=[60,180,330], MUS_UNKA=[-0.5,-0.25,0,0.25,0.5];   // the look-ahead fan: past the masthead's sight by these (u) × these bearings off the bow (rad)
const MUS_REST={sea:[2,45,90], crawl:[3,30,60], cave:[3,30,60], unknown:[3,30,30], deck:[2,60,120]};   // [loops before a rest (a composed tune's own `loops` wins), the rest's min & max s] — every other state loops on · (M6: the deck — a cabin is mostly quiet)
let MUS_DECK=()=>mode==='deck';   // (the deck state's test — PT1 B1 edited THIS line in place: never a second declaration, never an assignment elsewhere)
function musResolve(id){ for(let i=0;i<10 && id;i++){ if(MUS_T[id] && !musCompile(id).errs.length) return id; id=MUS_FALLBACK[id]; } return MUS_T.theme?'theme':null; }   // the first tune in the chain that exists & compiles
function musLive(){ return !!(actx && audioOn && SNDP.on && SNDP.musOn); }
/* ---- the 2 Hz brain: the priority table (§3.10 — the first row that holds wins) ---- */
function musEval(){ const w0=performance.now(), U=MUS.unk, W=MUS.want, now=actx?actx.currentTime:0, sv=env.storm||0;
  MUS.storm=MUS.storm?sv>=0.3:sv>=0.5;                                                     // (a squall comes on at 0.5 and blows out under 0.3)
  const sea=mode==='sea', stormy=MUS.storm && (sea || mode==='deck'), isl=mode==='island' && !!ISL;
  U.rate+=((revN-U.n0)/0.5-U.rate)*0.1535; U.n0=revN;                                      // the charting rate: an EMA (τ 3 s) of reveal()'s new cells a second
  if(!sea){ U.T=0; U.frac=0; if(U.on && (U.off+=0.5)>=0.5){ U.on=false; U.end=now; } }      // (off the helm: it ends at once)
  else { const fr=U.frac=musUnknownAhead(), sp=boat.spd, B=TUNE.baseSpeed;
    if(stormy) U.sq=6; else if(U.sq>0) U.sq-=0.5;                                            // (R1a · G14V-B09: a squall blown out within 6 s — fog ahead still, she sails on into the unknown at once, never the day tune for 5 s between)
    if(!U.on){ const ok=!hunt && !stormy && !nearLand && sp>=MUS_UNK.spd*B && fr>=MUS_UNK.frac && U.rate>=MUS_UNK.rate; U.T=ok ? (U.sq>0 ? MUS_UNK.T : U.T+0.5) : Math.max(0,U.T-1);
      if(U.T>=MUS_UNK.T){ U.on=true; U.off=0; U.fresh=now-U.end>MUS_UNK.fresh; } }
    else { U.off=(fr<0.3 || sp<0.2*B || stormy || hunt || nearLand) ? U.off+0.5 : 0; if(U.off>=MUS_UNK.off){ U.on=false; U.T=0; U.end=now; } }
    U.far=1+9*Math.pow(homeDist(boat)/Math.max(1000,LTUNE.dangerR),LTUNE.dangerExp)>=10; }   // (dangerOf's base, no wobble: past the Guild's line, the farlands)
  if(isl) musFightLv(); else { MUS.fl=0; MUS.flRaw=0; MUS.flT=0; }
  if(MUS.vicT>0) MUS.vicT=(!isl || (MUS.st==='victory' && MUS.flRaw>0) || ISL!==MUS.vIsl || musVKey()!==MUS.vKey) ? 0 : Math.max(0,MUS.vicT-0.5);   // (40 s — gone off the isle or to another floor (G12 FIX), or when a fight starts under it)
  if(!(MUS.vicT>0)){ MUS.vIsl=null; MUS.vicF=false; }
  let st='off', id=null, lv=0; if(MUS.tbMus && !SCN_TB) MUS.tbMus=null;                  // (C12: a scene's band gone — its tune lets go)
  if(!musLive()) st='off';
  else if(MUS.quiet) st='quiet';                                                           // (B5b's sleep: a rest — the drone stays off)
  else if(SCN && SCN.mus && MUS_T[SCN.mus] && !ptMode){ st='story'; id=SCN.mus; lv=SCN.mlv|0; }   // (INTROSTORY C2: a story scene's own tune — above the title, so a scene's kit / papers card keeps it · a tune not in the songbook yet: the mode's, muffled)
  else if(MUS.tbMus && !ptMode){ st='story'; id=MUS.tbMus; lv=MUS.tbLv|0; }                // (C12: …and on under the chapter's title band it ended on — e_home's BOATS Theme carries "Chapter I" as you set out)
  else if(mode==='island' && SAGA && SAGA.rel && !SAGA.seen.c6_journal2 && SAGA.q[0]==='c6_journal2' && !ptMode){ st='story'; id='theme'; lv=2; }   // (INTROSTORY C14: the BOATS Theme holds from the lighting to his journal’s second half)
  else if((titleBGOn() && (!started || ptMode)) || introOpen){ st='title'; id='title'; }
  else if(koBeat || koOpen) st='ko';
  else if(mode==='hex'){ st='hex'; id=MUS_T.table?'table':'tavern'; }
  else if(isl){ const B=ISL.boss;
    if(B && !B.dead && (ISL.seal || ISL.bannerT>=0)){ st='boss'; id='boss'; lv=B.hp<0.35*(B.hp0||B.hp)?1:0; }
    else if(MUS.vicT>0 && MUS.flRaw===0){ st='victory'; id='victory'; MUS.fl=0; }        // (no foe awake near you: the fanfare & its tune)
    else if(ISL.cave){ st='cave'; id='cave'; lv=sanctHush()?0:MUS.fl; }   // (DEPTHS DE2: the bottom's hush inside an open sanctum)
    else { st='crawl'; id=((ptMode?ptLandN:landN)&1)?'crawl_a':'crawl_b'; lv=MUS.fl; } }   // (crawl_a / crawl_b by the landfall's parity — the 1st landfall crawl_a — fixed for the landfall)
  else if(mode==='interior' && INT && INT.kind==='tavern'){ st='tavern'; id='tavern'; lv=2; }
  else if(mode==='port' || mode==='interior'){ const big=!!PRT && PRT.SZ===2; st='town'; id=big?'town_big':'town_small'; lv=env.dayName==='Night'?0:big?2:1; }   // (the museum & home: the same tune, muffled)
  else if(MUS_DECK() && !MUS.storm){ st='deck'; id='deck'; }
  else if(stormy){ st='storm'; id='storm'; lv=(env.tempest>0.25 || sv>0.75)?2:1; }
  else if(sea && U.on){ st='unknown'; id='unknown'; lv=U.far?2:1; }
  else if(sea){ st='sea'; id=hunt?'sea_day':musSeaPick(); lv=hunt?2:env.calm>0.5?0:1; }    // (0 dead calm · 1 sailing · 2 whaling — a hunt plays Fair Winds' whaling level by night too, G13 FIX)
  W.st=st; W.id=id; W.lv=lv; W.sk=isl && ISL.biome ? musSkinOf(ISL.biome.key) : (st==='sea' && !hunt ? MUS.seaSk : null);   // (M5a: the shore's skin — a tune with one plays dressed for it · SEAS SE8: at sea, the sea's dress, set only at a loop's end)
  if(!MUS.juke && !MUS.hold) musGo(W);                                                     // (the DEV jukebox owns the music till musAuto)
  const w=performance.now()-w0, K=MUS.ev; K.n++; K.s+=w; if(w>K.mx) K.mx=w; }
/* the fight level, crawl & cave (§3.10): aggro'd foes within 420 u → 0 · 1 · 2 (6+, or an elite / a magic or rare) · 3 (12+, or an elite with 6+) — it rises at
   once (the layers ramp from the next beat) and falls a level at a time, after 6 s below, once the room is won or every foe is 600 u off (trailing packs
   don't pump it). MUS.flRaw = this instant's count (the victory row reads it) */
function musFightLv(){ const px=player.x, py=player.y; let n=0, e=false, near=false;
  for(const en of enemies){ if(!en.aggro || en.dead || en.rout || en.dummy) continue; const dx=en.x-px, dy=en.y-py, d2=dx*dx+dy*dy; if(d2<360000) near=true; if(d2>176400) continue; n++; if(en.elite || en.rar) e=true; }
  const raw=MUS.flRaw=n===0?0:(n>=12 || (e && n>=6))?3:(n>=6 || e)?2:1;
  if(raw>=MUS.fl){ MUS.fl=raw; MUS.flT=0; } else if((MUS.flT+=0.5)>=6 && (!near || musClSecured())) MUS.fl--;
  return MUS.fl; }
function musClSecured(){ for(const cl of ISL.clearings) if(inClear(cl,player.x,player.y)) return !!cl.secured; return false; }
/* the look-ahead: the share of the fan ahead of the bow (past the masthead's sight — revealR, W7's) that is still fog */
function musUnknownAhead(){ const R=revealR()*EXP; let n=0, u=0;
  for(const dd of MUS_UNKD) for(const da of MUS_UNKA){ const a=boat.a+da, x=boat.x+Math.cos(a)*(R+dd), y=boat.y+Math.sin(a)*(R+dd); if(x<0 || y<0 || x>=WORLD || y>=WORLD) continue;
    n++; if(!explored.has(Math.floor(x/EXP)+Math.floor(y/EXP)*EGW)) u++; }
  return n?u/n:0; }
function musSeaPick(){ const I=MUS.cur, lp=I && !I.fin && !I.ending ? I.loopsDone : -1;   // day or night — picked when the sea begins, at a loop's end or after a rest: never mid-tune
  if(!MUS.seaPick || MUS.st!=='sea' || lp<0 || lp!==MUS.seaL){ MUS.seaPick=(env.dayName==='Night' || (env.dayName==='Dusk' && nightK()>0.5))?'sea_night':'sea_day'; MUS.seaL=lp; MUS.seaSk=seasMusSkin(); }   // (SEAS SE8: the sea's dress, picked with it)
  return MUS.seaPick; }
function seasMusSkin(){ const R=SEAS.on && !ptMode ? SEAS_RG[SEAS.cur] : null, K=R && SEAS_K[R.k]; return (K && K.skin) || null; }   // (SEAS SE8 §3.10: rime/fog/fold → cold · ember → fire · shallows/mire → wet · else, home included, the tune as written)
function musRepick(){ MUS.seaPick=null; MUS.evT=0; return 'repick'; }                      // (DEV: the sea picks again now)
/* ---- the hands: keep the tune (its intensity), rest, or move to another ---- */
function musGo(W){ const from=MUS.st, to=W.st, now=actx?actx.currentTime:0; MUS.st=to; if(PLOG && from!==to) plogEv(PLE.mus,to,from,W.lv);
  if(to==='off' || to==='quiet' || to==='ko'){ MUS.rest=null; musFadeAll(to==='ko'?0.4:to==='quiet'?0.8:0.6); return; }   // (the KO: 0.4 s, its sting plays on — then silence till the sea)
  let rid=musResolve(W.id); if(!rid) return; if(W.sk) rid=musDress(rid,W.sk);              // (M5a: crawl_a on a frost isle → crawl_a.cold — a tune without that skin plays as written)
  const C=MUS.cur, I=C && !C.fin && !C.ending && !C.sting ? C : null;
  if(I && I.id===rid){ const lv=clamp(W.lv,0,(I.T.lv||[[]]).length-1); if(I.st!==to){ I.st=to; I.lp0=I.calm0=I.loopsDone; } if(I.lv!==lv) musSetLv(I,lv); musRestPlan(I,to,W.lv); return; }   // the same tune: only its intensity & the rest it plans (a stand-in carries on across states)
  const R=MUS.rest; if(R){ if(R.st===to && now<R.until && !((to==='crawl' || to==='cave') && W.lv>0)) return; MUS.rest=null; MUS.aftR=R.st===to; }   // resting (the ambience carries on) · a fight breaks a crawl's rest · another state ends any rest
  if(!musTrackReady(rid)){ if(MUS.bankAsk!==rid){ MUS.bankAsk=rid; musBankBuild([...musNeed(rid)]); } return; }   // (the bank isn't ready: wait — its patches to the front — then a soft fade-in)
  musStart(rid,W,from,I); }
/* the transitions (§3.10's table): where the new tune begins (its intro I, the title's prelude P, the victory's fanfare F, else A) · how long the old one
   takes to go (xf) · "now" or on its next bar line (at) · when the new one comes in (dl after) and how soft (fi) */
function musStart(rid,W,from,I){ const to=W.st, now=actx.currentTime, R=musCompile(rid), has=s=>R.form.indexOf(s)>=0, isl=s=>s==='crawl' || s==='cave' || s==='boss' || s==='victory', aR=MUS.aftR; MUS.aftR=false;
  let sec=to==='title'?'P' : to==='sea'?((from==='title' || !MUS.seaN) && !aR?'I':'A') : to==='crawl'?((isl(from) || aR)?'A':'I') : to==='boss'?'I' : to==='victory'?(MUS.vicF?'A':'F') : to==='unknown'?(MUS.unk.fresh && !aR?'I':'A') : (to==='town' && from==='tavern')?'A' : null;
  if(to==='sea') MUS.seaN=1; if(to==='victory') MUS.vicF=false;                             // (G12 FIX: the session's first sea from its intro, after the harbour too · a claim whose fanfare already played (its herd's last stand) — victory from A)
  if(sec && !has(sec)) sec=has('A')?'A':null;                                               // (a stand-in without that section: its A, or its top)
  let at=now, xf=1.0, dl=0.3, fi=0.5, lp0=0;
  if(!I){ dl=0.1; fi=to==='title'?2.0 : aR?((to==='crawl' || to==='cave')?0.8:1.5) : 1.0; }   // from silence: the title's 2 s · after a rest 1.5 s (0.8 s when a fight broke a crawl's rest) · else 1 s
  else if(from==='title'){ xf=1.2; dl=0.4; fi=0.4; }                                       // (the voyage begins: the overture bows out — the sea from its intro)
  else if(to==='story'){ xf=1.2; dl=0.4; fi=1.4; }                                         // (INTROSTORY C2: a story scene's tune steals in…)
  else if(from==='story'){ xf=1.6; dl=0.3; fi=1.0; }                                       // (…and the mode's comes back under it)
  else if(to==='hex' || from==='hex'){ xf=0.5; dl=0.2; fi=0.2; }
  else if((from==='sea' && (to==='unknown' || to==='storm')) || (from==='unknown' && to==='storm')){ at=musNextBar(I); xf=3.0; dl=0; fi=to==='unknown'?0.3:1.0; }   // (R1a: a squall overtaking the unknown comes in as it does over the sea — on the bar, not a 1 s cut)
  else if((from==='unknown' || from==='storm') && to==='sea'){ at=musNextBar(I); musEnd(I,4.0,at); MUS.seaPick=null;   // out over 4 s from the bar…
    if(from==='unknown'){ MUS.rest={st:'sea', until:at+4+20*MUS.restMul}; return null; } I=null; xf=0; dl=1.0; fi=3.0; }   // …then 20 s of rest after the unknown · after a squall the sea swells in under the fade
  else if(from==='storm' && to==='unknown'){ at=musNextBar(I); xf=4.0; dl=1.0; fi=3.0; }  // (R1a · G14V-B09: the squall blows out into the fog — out over 4 s from its bar, the unknown swelling in under it, as the squall-out to the sea)
  else if(from==='sea' && to==='town'){ xf=0.6; dl=0.3; fi=0.1; }
  else if(from==='town' && to==='sea'){ xf=0.8; dl=0.3; fi=0.3; }
  else if((from==='town' && to==='tavern') || (from==='tavern' && to==='town')){ xf=0.5; dl=0.3; fi=0.1; }
  else if(to==='crawl' && !isl(from)){ xf=0.8; dl=0.3; fi=0.1; }                            // (landfall: the horn call)
  else if((from==='crawl' && to==='cave') || (from==='cave' && to==='crawl')){ xf=1.0; dl=0; fi=1.0; }
  else if(to==='boss'){ xf=0.4; dl=0.1; fi=0.05; }
  else if(to==='victory'){ xf=from==='boss'?0.3:0.5; dl=0; fi=0.05; }
  else if(from==='victory' && (to==='crawl' || to==='cave')){ at=musNextBar(I); xf=3.0; dl=0; fi=2.0; }
  else if(isl(from) && to==='sea'){ xf=1.0; dl=0.3; fi=0.3; }                              // (cast off: the sea from A — its intro skipped)
  else if(from===to){ at=musNextBar(I); xf=3.0; dl=0; fi=1.0; lp0=I.loopsDone; }           // the same state, another tune (the sea's day ↔ night at a loop's end): a crossfade on the bar line, the loop count carried
  const Sg=MUS.sting, sgOn=!!(Sg && Sg.slen && Sg.ts+Sg.slen>now+0.1);
  if(sgOn && !Sg.dk && at+dl<Sg.ts+Sg.slen) dl=Sg.ts+Sg.slen-at;                            // (M6: no tune comes in under the fanfare — a boss falls with its herd alive: the fanfare, then the last stand's crawl · G14 FIX: nor under a dawn, a shanty or the sea-harp)
  const J=musPlay(rid,{lv:W.lv, sec, fadeIn:fi, t0:Math.max(now+0.05,at+dl), xf, xfAt:at}); if(!J) return null; if(PLOG) plogEv(PLE.trk,rid,to,W.lv);
  if(sgOn && Sg.dk>0){ if(to==='victory' && sec==='F'){ musEnd(Sg,0.3); MUS.sting=null; } else musDuckI(J,Sg.dk,Sg.ts+Sg.slen-now); }   // (…and under any other sting it comes in ducked, as the tune it replaces was · G14 FIX: the claim's fanfare is never ducked — a sting under way bows out)
  J.st=to; J.loopsDone=lp0; J.lp0=J.calm0=0; musRestPlan(J,to,W.lv);
  if(MUS.rvK!==1 && J.snd) J.snd[0].gain.value=((J.T.fx && J.T.fx.rv)||0)*MUS.rvK;        // (a cave floor's wetter reverb, from the first note)
  return J; }
/* the rest a tune plans: the loops it plays before the director lets it end (musSched → musFin → MUS.rest). A crawl or a cave counts only calm loops — any fight
   (lv > 0) starts the count again from the next loop */
function musRestPlan(I,st,lv){ const L=MUS_REST[st]; if(!L){ I.endLoops=0; return; } const n=I.T.loops>0?I.T.loops:L[0];
  if(st==='crawl' || st==='cave'){ if(lv>0){ I.endLoops=0; I.calm0=I.loopsDone+1; } else I.endLoops=(I.calm0||0)+n; } else I.endLoops=(I.lp0||0)+n; }   // (lp0 / calm0: the loop count when it took this state — a stand-in carried across counts afresh)
function musRestLen(st){ const L=MUS_REST[st]||[0,30,30]; return (L[1]+Math.random()*(L[2]-L[1]))*MUS.restMul; }
function musFin(I){ I.fin=true; I.tEnd=I.t0; if(I===MUS.cur && !I.sting && I.st && MUS_REST[I.st] && !MUS.rest) MUS.rest={st:I.st, until:I.tEnd+musRestLen(I.st)}; }   // its last bar line: the rest begins (its tail rings into it)
function musSounding(I,now){ for(const V of I.G.V) if(V.I===I && V.e>now) return true; return false; }
function musReap(I){ if(MUS.sting===I) MUS.sting=null; if(MUS.pv===I) MUS.pv=null; musFree(I); }
function musFadeAll(f){ for(const I of MUS.all.slice()) if(!I.sting && !I.ending) musEnd(I,f); }   // (a sting plays on)
/* P (all sound off) & the music off: everything stops at once and the tick stops with it (musVolG is already 0) — the director restarts a tune when it's back,
   never resumes a stale one (musSched would catch up all at once) */
function musHalt(){ MUS.rest=null; MUS.cur=MUS.old=MUS.sting=MUS.pv=null; if(MUS.tickId!=null){ clearInterval(MUS.tickId); MUS.tickId=null; }
  const L=MUS.all.splice(0); if(!MUSG || !actx) return; const t=actx.currentTime;
  for(const V of MUSG.V) if(V.e>t) musKill(V,t,0.05);
  for(const I of L){ I.ending=true; setTimeout(()=>musFree(I),400); } }
/* ---- stings (short, once — §3.10): `discover` (the music ducks to 25 %) · `ko` (to 40 %) · `fanfare` (victory's F) & (M6, B2) `dawn` `shanty` `harp` — the music out under them ---- */
function musSting(id,o){ o=o||{}; if(!musVolOf() || !actx || !musInit()) return null; let tid=id, sec=null;
  if(!MUS_T[tid]){ if(id==='fanfare' && MUS_T.victory){ tid='victory'; sec='F'; } else return null; }
  const R=musCompile(tid); if(R.errs.length || (sec && !R.secs[sec]) || !musTrackReady(tid)) return null;
  const S=MUS.sting; if(S && !S.fin && S.sid===id && actx.currentTime-S.ts<(id==='fanfare'?(S.slen||1):1)) return S;   // (twice in a breath — the double `first` — plays once · a fanfare already sounding is the one)
  if(id==='discover' && musFanNow()) return null;                                         // (G14 FIX: never a glock run over the claim's fanfare — the hook's synth chime instead)
  const I=musInst(MUSG,tid,{sec, fadeIn:0, t0:actx.currentTime+0.05, keepFx:1, lv:o.lv}); if(!I) return null;
  I.sting=true; I.sid=id; if(sec) I.endSec=true; else I.endLoops=1; MUS.all.push(I); MUS.sting=I; musTickOn(); musSched(I,actx.currentTime+MUS_LOOK); if(PLOG) plogEv(PLE.sting,id);
  const len=sec?R.secs[sec].dur:musLen(tid), dk=id==='discover'?0.25:id==='ko'?0.4:id==='chart'?0.3:0; for(const J of MUS.all) if(J!==I && !J.sting && !J.ending) musDuckI(J,dk,len);   // (G14 FIX: a dawn, a shanty or the sea-harp takes the music out like the fanfare — never two meters at once · C12: his seal — the story's bed stays under it, at 30 %)
  I.slen=len; I.dk=dk; return I; }                                                         // (M6: its length & duck — a tune that starts under it waits for a dk-0 sting, or ducks under the rest: musStart)
function musSecNow(I){ const now=I.G.c.currentTime; let S=I.sec; if(now<I.t0 && I.hist[0]) S=I.hist[0].S; return S?S.name:null; }   // (G14 FIX: the section sounding now — the scheduler runs MUS_LOOK ahead)
function musFanNow(){ const C=MUS.cur, F=MUS.sting; return !!((C && C.id==='victory' && !C.ending && !C.fin && musSecNow(C)==='F') || (F && !F.fin && F.sid==='fanfare' && actx.currentTime-F.ts<F.slen)); }   // (G14 FIX: the claim's fanfare is sounding — victory's F, or the sting)
function musDuckI(I,k,secs){ const p=I.trkG.gain, t=actx.currentTime, te=t+secs, ts=I.ts==null?t:I.ts, s=Math.max(t,ts), fL=I.fiL||0, g0=I.T.g==null?1:I.T.g;   // one tune under a sting: down in τ 0.05, back in τ 0.4 when it ends
  if(s>=te) return;                                                                        // (G14 FIX: a tune that starts after the sting keeps its own fade-in)
  try{ if(p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); p.setValueAtTime(p.value,t); }
    if(s>t){ p.setValueAtTime(0,s); p.linearRampToValueAtTime(g0*k,s+Math.max(0.05,fL)); }   // (…one that starts inside it: silent till its first note, then its fade-in to the duck)
    else if(fL>0 && t<ts+fL*k) p.linearRampToValueAtTime(g0*k,ts+fL*k); else p.setTargetAtTime(g0*k,t,0.05);   // (one still fading in under the duck's level: its own fade, up to it — never a jump)
    p.setTargetAtTime(g0,Math.max(te,ts+fL),0.4); }catch(e){} }
function musVictory(){ MUS.vicT=40; MUS.evT=0; MUS.vIsl=ISL; MUS.vKey=musVKey(); }         // (the claim, a boss's fall: the isle's victory — 40 s, on this isle & floor only)
function musVKey(){ return ISL?(ISL.cave?'c'+ISL.cave.f:'s'):''; }                          // (G12 FIX: the floor the victory belongs to — a fresh floor or the cave mouth ends it)
function musVicNow(){ const B=ISL&&ISL.boss, c=B?B.clear:-1, px=player.x, py=player.y;     // (G12 FIX: can the victory row hold at once? no foe left in the boss's room (K5: its herd's last stand) & none awake near you)
  for(const e of enemies){ if(e.dead || e.dummy || e===B) continue; if(e.clear===c && c!=null && c>=0 && !e.guard && !(e.ring && ringDorm(e))) return false;
    if(e.aggro && !e.rout){ const dx=e.x-px, dy=e.y-py; if(dx*dx+dy*dy<176400) return false; } } return true; }
const MUS_HOOK={   // sfx(name) asks these first: true = the Bard took the sound over (the synth stays quiet) · false = the synth plays as ever
  claim:()=>{ if(mode==='island' && !LEDG){ const V=MUS.cur, onV=!!(V && V.id==='victory' && !V.ending && !V.fin); musVictory();   // (on the isle the claim starts `victory` itself — its F is the fanfare)
      if(onV) return musSecNow(V)==='F' || !!musSting('fanfare');                         // (G14 FIX: the flag after the guardian's fall — victory already playing: its fanfare again as a sting, the tune out under it (inside F it's already sounding))
      if(!musVicNow()){ const S=musSting('fanfare'); if(S) MUS.vicF=true; return !!S; }       // (G12 FIX: the herd fights on — the fanfare now, as a sting; victory comes from A when they fall)
      return !!(MUS_T.victory && musVolOf() && MUSG && musTrackReady('victory')); } return !!musSting('fanfare'); },
  first:(o)=>{ if(!MUS_T.discover || (o && o.card)) return false; const dt=actx.currentTime-(MUS.dsT||-99);   // (G14 FIX: a lesson card keeps the synth chime — the sting is for real firsts, at most one in 45 s; the double `first` is one)
      if(dt>1 && dt<45) return false; const I=musSting('discover'); if(I) MUS.dsT=I.ts; return !!I; },
  ko:()=>{ if(MUS_T.ko) musSting('ko'); return false; } };                                 // (the synth thud plays under it)
/* ---- the muffle & colour targets (§3.10; eased τ 0.25 s by WebAudio): → MUS_MF [the lowpass Hz, the gain (0.708 = −3 dB), the reverb send ×]. B2 adds the cabin & the lower deck here ---- */
const MUS_MF=[11000,1,1];
function musMuffle(){ const M=MUS_MF, tk=(talkOpen || (SCN && SCN.L && !(SCN.mus && MUS_T[SCN.mus])))?0.708:1; M[2]=1;   // (INTROSTORY C2: a story line over the mode's tune steps it back −3 dB, as a talk does)
  if(menuOpen && menuTab==='controls'){ M[0]=11000; M[1]=1; return M; }                     // (G12 FIX: 🎮 Options — the Music volume is set against the mix you'll play with)
  if(menuOpen || mapOpen || imapOpen || journalOpen || invOpen || LEDG || renaming || summaryOpen || caveOpen || (introOpen && MUS.st!=='title') || (GCH.open && !GCH.scn)){ M[0]=1400; M[1]=0.708; return M; }   // (a panel over the world: the music behind a door · C12: the Long Chart as a panel — a scene's leaf keeps its tune clear)
  if(mode==='interior' && INT && INT.kind!=='tavern'){ M[0]=2500; M[1]=0.708; return M; }    // (the museum & your home: the town's tune through the walls)
  if(mode==='deck' && DK && DK.lv!=='top'){ M[0]=2500; M[1]=0.708; return M; }               // (PT1 B2: your cabin & below — the deck's tune through her planking)
  if(mode==='island' && ISL && ISL.cave){ const f=Math.max(1,ISL.cave.f|0); M[0]=Math.max(4500,9000-450*(f-1)); M[1]=tk; M[2]=Math.min(1.5,1+0.05*f); return M; }   // (deeper floors: darker & wetter)
  M[0]=(mode==='sea' && env.fog>0.4)?6000:11000; M[1]=tk; return M; }                      // (a fog bank softens it · else the warmth · a word with the townsfolk: −3 dB)
/* ---- every frame (O(1)): the clock, the muffle, the drone ---- */
function musUpdate(dt){ if(!actx) return;
  if(mode!==MUS.lm || MUS.quiet!==MUS.lq || started!==MUS.ls){ MUS.lm=mode; MUS.lq=MUS.quiet; MUS.ls=started; MUS.evT=0; }   // (a mode change is answered now)
  if((MUS.evT-=dt)<=0){ MUS.evT=0.5; musEval(); }
  const dr=(SNDP.musOn && SNDP.mus>0)?0:1; if(droneG && dr!==MUS.drT){ MUS.drT=dr; try{ droneG.gain.setTargetAtTime(dr,actx.currentTime,0.8); }catch(e){} }   // the drone: today's ambience with the music off (or at 0 % — G12 FIX) — silent under it (rests too)
  if(!MUSG) return; const M=musMuffle(), t=actx.currentTime;
  if(M[0]!==MUS.lpT){ MUS.lpT=M[0]; try{ musLP.frequency.setTargetAtTime(M[0],t,0.25); }catch(e){} }
  if(M[1]!==MUS.mgT){ MUS.mgT=M[1]; try{ MUSG.mg.gain.setTargetAtTime(M[1],t,0.25); }catch(e){} }
  if(M[2]!==MUS.rvK){ MUS.rvK=M[2]; for(const I of MUS.all) if(!I.sting && I.snd) try{ I.snd[0].gain.setTargetAtTime(((I.T.fx && I.T.fx.rv)||0)*M[2],t,0.5); }catch(e){} } }
/* ---- the title's first press (browsers keep a page silent until a gesture) · 🎵 on/off (Shift+P · #tMusBtn · the Options row) · the Music −/+ preview ---- */
function musUnlock(){ if(!actx) initAudio(); if(!actx) return false; if(actx.state==='suspended' && SNDP.on && document.visibilityState!=='hidden') try{ actx.resume().catch(()=>{}); }catch(e){}
  if(SNDP.on && SNDP.musOn) musInit(); MUS.evT=0; return true; }                           // (musInit's convolver set-up, ≈ 24 ms, lands on the click — a quiet moment)
function musGesture(){ removeEventListener('pointerdown',musGesture,true); removeEventListener('keydown',musGesture,true); if(titleBGOn()) musUnlock(); }
function musToggle(q){ musUnlock(); SNDP.musOn=SNDP.musOn?0:1; sndPrefsSave(); sndApplyVol(); if(!SNDP.musOn) musHalt(); else if(actx){ musBankBuild(); musInit(); } MUS.evT=0;
  sndBlockRefresh(); musTitleBtn(); if(!q) toast(SNDP.musOn?'🎵  Music on':'🎵  Music off','Shift+P · Esc → 🎮 Options for volumes'); return SNDP.musOn; }
function musTitleBtn(){ const b=document.getElementById('tMusBtn'); if(b) b.textContent='🎵 Music: '+(SNDP.musOn?'On':'Off'); }
function musPreview(){ if(!musVolOf() || !musUnlock() || !MUSG) return null; if(!musTrackReady('_pv')){ musBankBuild(['harp']); return null; }   // three harp notes at the new level
  if(MUS.pv && !MUS.pv.ending) musEnd(MUS.pv,0.1); const I=musInst(MUSG,'_pv',{t0:actx.currentTime+0.03, fadeIn:0, keepFx:1}); if(!I) return null;
  I.sting=true; I.sid='_pv'; I.endLoops=1; MUS.all.push(I); MUS.pv=I; musTickOn(); musSched(I,actx.currentTime+MUS_LOOK); return I; }
/* ---- DEV: musSkipTo(sec, bar) jumps the playing tune (the loop count & its planned rest kept; a stand-in without that section skips to its last) ---- */
function musSkipTo(sec,bar){ const I=MUS.cur; if(!I || !actx || I.fin || I.ending) return 'nothing playing'; const F=I.R.form, s=F.indexOf(sec)>=0?sec:F[F.length-1];
  const J=musInst(MUSG,I.id,{lv:I.lv, sec:s, bar:bar||1, t0:actx.currentTime+0.1, fadeIn:0.05, keepFx:1}); if(!J) return 'no';
  Object.assign(J,{st:I.st, loopsDone:I.loopsDone, calm0:I.calm0, lp0:I.lp0, endLoops:I.endLoops}); musEnd(I,0.15); MUS.old=I; MUS.cur=J; MUS.all.push(J); musTickOn(); musSched(J,actx.currentTime+MUS_LOOK);
  return s+' bar '+(bar||1); }
function musDirMeter(){ const W=MUS.want, U=MUS.unk, I=MUS.cur, now=actx?actx.currentTime:0, R=MUS.rest;
  return W.st+(W.id?' · '+W.id+(I && I.id!==W.id?'→'+I.id:'')+' lv '+W.lv:'')+(R?' · rest '+Math.max(0,R.until-now).toFixed(1)+' s':'')+(MUS.hold?' · held (Auto)':'')+(MUS.vicT>0?' · vic '+MUS.vicT.toFixed(1):'')+
    ' · fight '+MUS.fl+'/'+MUS.flRaw+' · fog '+U.frac.toFixed(2)+' · rate '+U.rate.toFixed(0)+' · T '+U.T.toFixed(1)+(U.on?' · UNKNOWN'+(U.far?' far':''):''); }

