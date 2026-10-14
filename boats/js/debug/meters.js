"use strict";
/* FILE: js/debug/meters.js
METERS AND THE SCORECARD (DEV telemetry, CRAWL 2.0 section 13; the ']' key and pad L3, Proving Grounds only): original lines
  26673-26780 (build 5109cd5), moved verbatim, in place inside the crawl HUD run (bossBarRect ends at original line 26672
  (build 5109cd5); islandHUD follows at original line 26781 (build 5109cd5)).
It keeps one run's counters (MET, reset at landfall) ticked from islStep on real frame time, turns them into the scorecard
  S1-S21 judged against SCORE_DEF, hands the same numbers to the harness as window.__score, and draws the DEV meters plate.
Entry points: metReset (genIsland), metTick (islStep), metEnd (leaveIsland), metBlow, metKill, metHurt, metSwing,
  metPackWake, metPackSecure, metFloor, metFloorDone, metScore, drawMeters (islandHUD), evPush and evSum (also dummyHit).
Globals it owns: the lets metersOn, MET, ftP95C, ftP95T, metCv, metAt, metAtT; the const MET_ROWS; the functions metRing,
  ringAdd, ringSum, evSum, evTrim, evPush, metReset, metBlow, metKill, metHurt, metSwing, metPackWake, metPackSecure,
  metFloor, metFloorDone, metEnd, metTick, ftP95, metScore, drawMeters, metPaint; and the window.__score getter.
Main globals it reads from elsewhere (inside functions, at runtime only): SCORE_DEF and PERF_P95 (js/data/crawl2.js);
  DPR, ctx, clamp, keys (early inline parts); plvl (player progression); ISL, ISL_LVL, enemies, player, ishrines,
  iburied, islandCleared, mouseL, padHold, SLASH_BODY, fmtDmg, inClear, untouchable (the island core); pxPanel, panTxt, PXP (the crawl HUD
  kit just above); eSlashRange, normalHP, youBand, ptMode (later inline parts); FT and ftN (original line 41108
  (build 5109cd5), declared later; metScore returns null until MET exists, so they are never touched at load).
metersOn is toggled by the keydown listener and pollPad (original lines 4800 and 5068 (build 5109cd5)) and read by hudLay.
Load-time statements: one, Object.defineProperty(window,'__score',...) with get:metScore (original line 26757
  (build 5109cd5)); metScore is declared in this file. The rest are pure lets and consts plus function declarations.
  Nothing reads window.__score during loading.
*/
/* ============================================================ *
 *  METERS & THE SCORECARD (CRAWL 2.0 §13 · the ']' key, pad L3) —
 *  one RUN's counters (landfall → aboard; a cave dive rides in its
 *  run). The DEV plate shows them live; window.__score hands the
 *  same numbers to the harness (specs/harness). Ticked from islStep
 *  on REAL frame time (a world freeze counts), so the harness bot —
 *  which steps islStep — reads exactly what a player would.
 *  Hidden, it costs a counter or two a frame; the plate repaints at 4 Hz.
 * ============================================================ */
let metersOn=false, MET=null;                                    // (C3a: bodies deal no damage — the swarm's nip is the one untelegraphed hurt, S16)
const MET_ROWS=13;                                               // the plate: a title · 4 live rows · a header · 7 scorecard rows
function metRing(n,w){ return {n, w, b:new Float32Array(n), i0:-1}; }   // n buckets of w seconds on the run clock — a rolling window
function ringAdd(R,t,v){ const i=Math.floor(t/R.w); if(R.i0<0) R.i0=i;
  if(i>R.i0){ for(let j=Math.max(R.i0+1,i-R.n+1);j<=i;j++) R.b[j%R.n]=0; R.i0=i; }   // (a bucket reused for a newer slot starts empty)
  R.b[i%R.n]+=v; }
function ringSum(R,t){ ringAdd(R,t,0); let s=0; for(let j=0;j<R.n;j++) s+=R.b[j]; return s; }
function evSum(E,t,w){ evTrim(E,t,w); let s=0; for(let j=1;j<E.length;j+=2) s+=E[j]; return s; }   // an exact rolling sum over [t−w, t] of [time, value] pairs (the DPS & kills windows)
function evTrim(E,t,w){ let i=0; while(i<E.length && E[i]<=t-w) i+=2; if(i) E.splice(0,i); }   // (drop what's left the window)
function evPush(E,t,v,w){ E.push(t,v); if(E.length>(E.cap||4000)){ evTrim(E,t,w); E.cap=Math.max(4000,E.length*2); } }   // (G3 fix: trimmed only when it doubles — a busy fight's every blow used to re-sum the whole window)
function metReset(){ MET={ t:0, dg:ISL_LVL, bio:ISL?ISL.biome.key:'', lv:plvl, band:youBand(), cave:!!(ISL&&ISL.cave), peace:!!(ISL&&ISL.peace), dive:false, fl:0, fdg:0, pt:ptMode, end:null,
    tFight:0, tWalk:0, tReach:0, tFA:0, tRA:0, tLast3:0, tFrz:0, tFrzF:0, frzMax:0, heldT:0, swHeld:0, sw:0, swPrev:-1, relT:0, lastAct:-9,
    dmg:0, kills:0, lastK:-1, firstK:-1, gapMax:0, blows:0, weak:0, zero:0, htk:[], hurtTel:0, hurtChip:0, near:0, low:false,
    boss0:-1, bossDur:null, fl0:-1, floors:[], trk:0, opp:(ISL?ISL.cacheN+(ISL.secrets||[]).length:0)+ishrines.length+(iburied&&!iburied.dug?1:0)+(ISL&&ISL.mouthOn?1:0), claimed:false,   /* (C8b S19: a shrine & a secret room are offered choices too) */ satFull:bagFree()?null:0, s5:null, clId:-1, clT0:0, s21n:0, s21ok:0, dAcc:0, dAccK:0,
    eD:[], eK:[], rSw:metRing(50,0.1), rHeld:metRing(50,0.1), rFrz:metRing(10,0.1), rFrzF:metRing(50,0.1), rFt:metRing(50,0.1) }; }
function metBlow(en,val,dealt){ const M=MET; if(!M) return; M.blows++; if(dealt<val*0.5) M.weak++; if(!(dealt>0)) M.zero++;   // S6: a blow on a targetable foe that lands under half its value (a clink, a reflect)
  if(dealt>0){ M.dmg+=dealt; evPush(M.eD,M.t,dealt,5); } M.lastAct=M.t; }
function metKill(en){ const M=MET; if(!M) return; M.kills++; evPush(M.eK,M.t,1,60);
  if(M.lastK>=0) M.gapMax=Math.max(M.gapMax,M.t-M.lastK-((M.dAcc||0)-(M.dAccK||0))); else M.firstK=M.t; M.lastK=M.t; M.dAccK=M.dAcc||0;   // S7: the longest gap between kills, mid-run (C3b: a boss DUEL's own time is left out — §8.8's room holds the boss alone)
  if(!en.fodder && !en.elite && !en.guard && en._mh){ const be=normalHP(en.dlE||ISL_LVL)/Math.max(1,en.hp0||en._mh);   // S10: blows to kill a normal foe, in BOAR-EQUIVALENTS (G1 fix: × a boar's HP at its danger ÷ its own — §8.6's lighter kinds stay light)
    (M.htkA||(M.htkA=[])).push(en._mh*be);                                                // (raw: every kill, whole blows — the pre-C9 reading)
    if(!en._mhS){ M.htk.push(en._mh*be); (M.htkF||(M.htkF=[])).push((en._mh-1+clamp((en._hpB||0)/Math.max(1e-6,en._lastD||1),0,1))*be); } }   // (G5 fix: S10 = BASIC hits only, WHOLE blows · raw S10frac = C9's reading, the killing blow as the fraction it needed)
  if(en.guard && M.boss0>=0 && M.bossDur==null) M.bossDur=M.t-M.boss0; }                     // S14: the duel, from its first aggro to the fall
function metHurt(dmg,untel){ const M=MET; if(!M || !(dmg>0)) return; if(untel) M.hurtChip+=dmg; else M.hurtTel+=dmg; M.hurtN=(M.hurtN||0)+1; M.lastAct=M.t; }   // S16 (G5 fix: hurtN — S16 is judged only on a real sample)
function metSwing(conn){ const M=MET; if(!M) return; M.sw++;                                // S8: the held rhythm — the real time between two connecting swings with the attack HELD all the way between them
  if(conn && (mouseL||keys['j']||padHold.s)){ if(M.swPrev>=0 && M.relT<M.swPrev){ const iv=M.t-M.swPrev; M.swHeld++; M.heldT+=iv; ringAdd(M.rSw,M.t,1); ringAdd(M.rHeld,M.t,iv); } M.swPrev=M.t; }
  else M.swPrev=-1; }
/* S21 — a pack clearing (2+ packs, not a god rush) is 'in turn' when no pack woke while another of it was still FIGHTING (2+ of its non-swarm
   standing — a lone straggler isn't a second pack in the fight) · s21s: the strict count (any one foe of it standing) */
function metPackWake(P,cl){ if(cl.god) return; for(const Q of ISL.packs){ if(Q===P || Q.cl!==P.cl || !Q.awake) continue; let n=0; for(const e of Q.m) if(!e.dead && !e.fodder && !e.rout) n++;
    if(n>=1) cl.s21xs=true; if(n>=2) cl.s21x=true; } }
function metPackSecure(cl){ const M=MET; if(!M || cl.god || cl.horde || !ISL || !ISL.packs) return; let n=0; for(const Q of ISL.packs) if(Q.cl===cl.id) n++;
  if(n>=2){ M.s21n++; if(!cl.s21x) M.s21ok++; if(!cl.s21xs) M.s21s=(M.s21s||0)+1; } }
function metFloor(quiet){ const M=MET; if(!M) return; M.fl0=quiet?-1:M.t; M.dive=true; M.fl=ISL&&ISL.cave?ISL.cave.f:0; M.fdg=ISL_LVL; if(ISL && ISL.secrets) M.opp+=ISL.secrets.length+ishrines.length; }   // (C8b S19: a floor's grotto is one more choice)   // a floor to fight (a checkpoint's quiet floor isn't timed) · the run is a dive now
function metFloorDone(){ const M=MET; if(M && M.fl0>=0){ (ISL&&ISL.cave&&ISL.cave.boss?(M.floorsL||(M.floorsL=[])):M.floors).push(M.t-M.fl0); M.fl0=-1; } }   // (C9: a LORD's floor is a duel — S14 judges it; S18 is the mine floors')                   // S18: a floor, landing → secured
function metEnd(ko){ const M=MET; if(!M || M.end) return; M.end=ko?'KO':'aboard'; if(!ko && islandCleared && M.lastK>=0) M.s5=M.t-M.lastK; }   // S5: the last kill → aboard (a claimed isle)
function metTick(dt,frz){ const M=MET; if(!M || !ISL || M.end) return; M.t+=dt;
  ringAdd(M.rFrz,M.t,frz?dt:0); if(frz) M.tFrz+=dt;
  let cur=null; for(const cl of ISL.clearings) if(inClear(cl,player.x,player.y)){ cur=cl; break; }
  let nd=1e9, awake=false;                                                                 // the nearest awake, hittable foe
  for(const e of enemies){ if(e.dead || e.rout || !(e.aggro || (e.pk==null && cur && e.clear===cur.id && !cur.secured))) continue;   // (C3b: a sleeping pack isn't a fight yet)
    const dx=e.x-player.x, dy=e.y-player.y, q2=dx*dx+dy*dy; if(q2<260*260) awake=true;
    if(!untouchable(e)){ const q=Math.sqrt(q2)-e.r*SLASH_BODY; if(q<nd) nd=q; } }
  const reach=nd<=eSlashRange()+10, fight=awake || M.t-M.lastAct<1.5;                     // a fight: awake foes within 260u (or a blow / a hurt this last 1.5 s)
  const Bd=ISL.boss, duel=!!(Bd && !Bd.dead && (Bd.aggro || ISL.bannerT>=0)); if(duel) M.dAcc=(M.dAcc||0)+dt;   // (a boss DUEL — from its wake to its fall: S4 & S7 leave it out)
  if(awake){ M.tFA+=dt; if(reach) M.tRA+=dt; }                                            // S3 (G2 fix): in reach over the time a foe is AWAKE near you — the 1.5 s after-blow tail (no foe up) isn't a chance to be in reach
  if(fight){ M.tFight+=dt; ringAdd(M.rFt,M.t,dt); if(frz){ M.tFrzF+=dt; ringAdd(M.rFrzF,M.t,dt); } else ringAdd(M.rFrzF,M.t,0); if(reach) M.tReach+=dt;
    if(cur && cur.id>0 && !cur.secured && cur.enemyCount>0 && cur.enemyCount<=3 && !duel){ M.tLast3s=(M.tLast3s||0)+dt; if((cur.ns0||0)+(cur.sw0||0)>=8) M.tLast3+=dt; }   // (C9: a clearing that began with 8+ — a cache of 3-5 is small by design, not a straggler hunt · G5 fix: raw.spec.S4 keeps §1's every-clearing reading)   // S4: the last ≤3 of a clearing (not a boss duel — C3b)
    M.frzMax=Math.max(M.frzMax, ringSum(M.rFrz,M.t)); }                                    // S9: the worst freeze in any 1 s
  else if(player.moving) M.tWalk+=dt;
  if(!(mouseL||keys['j']||padHold.s)) M.relT=M.t;                                      // (the last moment the attack wasn't held — S8's pairs must straddle no release)
  const f=player.hp/Math.max(1,player.maxhp); if(f<0.25 && player.hp>0 && !M.low){ M.low=true; M.near++; } if(f>0.4) M.low=false;   // S15
  if(cur && cur.id!==M.clId){ M.clId=cur.id; M.clT0=M.t; }
  const B=ISL.boss; if(B && !B.dead && M.boss0<0 && (B.aggro || ISL.bannerT>=0)) M.boss0=M.t;
  if(islandCleared && !M.claimed){ M.claimed=true; if(!ISL.cave) M.opp++; }              // S19: the claim opens the cave mouth — one more choice
  }                                                                                      // (S12: materials can't fill anything now — C4a; the gear bag's 'full at' lands with C4b · raw.matStop counts refused materials, always 0)
let ftP95C=null, ftP95T=-1e9;
function ftP95(){ const n=Math.min(ftN,600); if(n<30) return null; const now=performance.now(); if(now-ftP95T<500 && ftP95C!=null) return ftP95C;
  const a=Array.from(FT.subarray(0,n)).sort((x,y)=>x-y); ftP95T=now; return ftP95C=+a[Math.floor(n*0.95)].toFixed(2); }
function metScore(){ const M=MET; if(!M) return null; const T=Math.max(1e-3,M.t), F=Math.max(1e-3,M.tFight), r=(v,p)=>v==null?null:+(+v).toFixed(p==null?1:p),
    avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null, hurt=M.hurtTel+M.hurtChip, dgR=M.fl?M.fdg:M.dg, onPar=Math.abs(M.band-dgR)<=1.5;   // (a dive: judged at its floor's danger)
  const S={ S1:r(100*M.tFight/T), S2:r(100*M.tWalk/T), S3:M.tFA>0?r(100*M.tRA/M.tFA):null, S4:M.tFight>0?r(100*M.tLast3/F):null,
    S5:r(M.s5!=null?M.s5:(islandCleared&&M.lastK>=0&&!M.end?M.t-M.lastK:null)), S6:M.blows?r(100*M.weak/M.blows):null, S7:r(M.gapMax),
    S8:M.heldT>0.5?r(M.swHeld/M.heldT,2):null, S9:M.tFight>0?r(1000*M.tFrzF/F,0):null, S10:r(avg(M.htk),2), S11:M.tFight>0?r(M.kills/(F/60)):null,
    S12:r(M.satFull), S13:M.trk, S14:r(M.bossDur), S15:M.near, S16:hurt>0?r(100*M.hurtChip/hurt):null, S17:(!M.cave&&!M.dive&&!M.peace&&M.dg>=3&&M.claimed)?r(T/60,2):null,
    S18:r(avg(M.floors)), S19:M.opp, S20:ftP95(), S21:M.s21n?r(100*M.s21ok/M.s21n):null };
  const ok={}; for(const d of SCORE_DEF){ const id=d[0], v=S[id]; let lo=d[3], hi=d[4];
    if(id==='S14' && dgR<=1){ lo=30; hi=45; } if(id==='S20') hi=Math.max(8,(PERF_P95||6.5)+1.5);
    if(id==='S13' && (M.cave||M.dive||M.dg<3||M.dg>7||!M.claimed)){ ok[id]=null; continue; }   // (C9: §1 S13 is 'gear items per ⚔5 isle' — judged on a claimed surface isle of ⚔3–7; a bigger isle drops more, a ⚔1 isle fewer)
    if(id==='S19' && !M.fl && M.dg<2){ ok[id]=null; continue; }                               // (C9: a ⚔1 isle has no shrine (§10.2: ⚔2+), no grotto, one fight — the teaching isle; S19 from ⚔2)
    if(id==='S16' && !(hurt>=0.1*Math.max(1,player.maxhp) || (M.hurtN||0)>=5)){ ok[id]=null; continue; }   // (G5 fix: judged on a real sample — ≥ 10% of your life taken or ≥ 5 hits; one 3-HP nip isn't a verdict)
    ok[id] = (v==null || d[5] || (lo==null&&hi==null) || (id==='S10'&&!onPar)) ? null : ((lo==null||v>=lo) && (hi==null||v<=hi)); }
  return { run:{dg:M.dg, biome:M.bio, lv:M.lv, lvNow:plvl, band:+M.band.toFixed(2), cave:M.cave||M.dive, floor:M.fl, floorDg:M.fdg, pt:M.pt, t:r(T), end:M.end, kills:M.kills, frameErr:window.__frameErr|0},
    S, ok, S9max:r(1000*M.frzMax,0), live:{dps5:r(evSum(M.eD,M.t,5)/Math.min(5,T)), kpm:r(evSum(M.eK,M.t,60)/(Math.min(60,Math.max(1,T))/60))}, raw:{tFight:r(M.tFight), tWalk:r(M.tWalk), s3old:M.tFight>0?r(100*M.tReach/F):null, dmg:Math.round(M.dmg), blows:M.blows, zero:M.zero, sw:M.sw, hurtTel:Math.round(M.hurtTel), hurtChip:Math.round(M.hurtChip), floors:M.floors.map(v=>r(v)), floorsL:(M.floorsL||[]).map(v=>r(v)), s21:[M.s21ok,M.s21n], s21strict:[M.s21s||0,M.s21n], matStop:M.matStop||0, matGot:M.matGot||0,
      spec:{S4:M.tFight>0?r(100*(M.tLast3s||0)/F):null, S10all:r(avg(M.htkA||[]),2), S10frac:r(avg(M.htkF||[]),2), S13:M.claimed&&!M.cave&&!M.dive?M.trk:null, S18:r(avg(M.floors.concat(M.floorsL||[]))), S19:M.opp, hurtN:M.hurtN||0}} }; }   // (G5 fix: SCORE_NOTE's other readings side by side — §1's plain wording & C9's refinements)
Object.defineProperty(window,'__score',{get:metScore, configurable:true});   // the harness reads the live run (or the last one) — always fresh, never a per-frame cost
let metCv=null, metAt=-1e9, metAtT=-1e9;
function drawMeters(L){ const R=L.met; if(!R || !MET) return; const now=performance.now(), W=Math.round(R.w*DPR), H=Math.round(R.h*DPR);
  if(!metCv) metCv=document.createElement('canvas');
  if(metCv.width!==W || metCv.height!==H){ metCv.width=W; metCv.height=H; metAt=metAtT=-1e9; }
  if(now-metAt>250 || Math.abs(MET.t-metAtT)>=0.25){ metAt=now; metAtT=MET.t; metPaint(metCv.getContext('2d'), R, L.U); }   // (repainted at 4 Hz of real or run time — the frame only blits it)
  ctx.drawImage(metCv, R.x, R.y, R.w, R.h); }
function metPaint(g,R,U){ const M=MET, t=M.t, sc=metScore(), S=sc.S, u=v=>Math.round(v*U), rh=u(14), fs=Math.round(11*U), font='700 '+fs+'px system-ui', px=u(9);
  g.setTransform(DPR,0,0,DPR,0,0); g.clearRect(0,0,R.w,R.h); g.imageSmoothingEnabled=false; pxPanel(0,0,R.w,R.h,PXP.dim,g);
  g.textBaseline='middle'; g.textAlign='left'; const mmss=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'), row=i=>u(10)+rh*i+rh/2;
  panTxt('▤ METERS', px, row(0), '#ffd86b', '800 '+fs+'px system-ui', g);
  const er=window.__frameErr|0; g.textAlign='right'; panTxt((er?'● '+er+' frame err  ':'')+(M.fl?'▼'+M.fl+' ⚔'+M.fdg:'⚔'+M.dg)+' · '+mmss(t)+(M.end?' · '+M.end:''), R.w-px, row(0), er?'#ff6a5a':'#9fb6dd', font, g); g.textAlign='left';
  const s5=Math.min(5,Math.max(0.1,t)), fz=ringSum(M.rFt,t), hd=ringSum(M.rHeld,t), cur=ISL&&ISL.clearings[M.clId];
  const live=[['DPS 5s', fmtDmg(evSum(M.eD,t,5)/s5)], ['kills/min', (evSum(M.eK,t,60)/(Math.min(60,Math.max(1,t))/60)).toFixed(1)],
    ['swings/s', hd>0.3?(ringSum(M.rSw,t)/hd).toFixed(2):'—'], ['hit-stop', fz>0.2?Math.round(1000*ringSum(M.rFrzF,t)/fz)+' ms/s':'—'],
    ['in reach', S.S3!=null?S.S3+'%':'—'], ['taken/min', Math.round(M.hurtTel/(Math.max(1,t)/60))+' tel · '+Math.round(M.hurtChip/(Math.max(1,t)/60))+' chip'],
    ['clearing', cur&&!cur.secured&&cur.id>0?mmss(t-M.clT0):'—'], ['frame p95', S.S20!=null?S.S20+' ms':'—']];
  const cw=(R.w-px*2)/2;
  live.forEach((c,i)=>{ const x=px+(i%2)*cw, y=row(1+(i>>1)); panTxt(c[0], x, y, '#8aa0c8', font, g); g.textAlign='right'; panTxt(c[1], x+cw-u(8), y, '#eef4ff', font, g); g.textAlign='left'; });
  let nOk=0, nAll=0; for(const k in sc.ok){ if(sc.ok[k]!=null){ nAll++; if(sc.ok[k]) nOk++; } }
  panTxt('SCORECARD  '+nOk+' / '+nAll+' on target', px, row(5), '#ffd86b', '800 '+fs+'px system-ui', g);
  const c3=(R.w-px*2)/3;
  SCORE_DEF.forEach((d,i)=>{ const x=px+(i%3)*c3, y=row(6+Math.floor(i/3)), v=S[d[0]], o=sc.ok[d[0]], col=o===true?'#7fe3a0':o===false?'#ff7a6a':'#6d80a8';
    panTxt(d[0], x, y, col, '800 '+fs+'px system-ui', g); g.textAlign='right'; panTxt(v==null?'—':(v+(d[2]==='%'?'%':'')), x+c3-u(8), y, col, font, g); g.textAlign='left'; }); }
