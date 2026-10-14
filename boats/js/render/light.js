"use strict";
/* FILE: js/render/light.js
THE LIGHT AND DARK LAYER: original lines 25328-25690 (build 5109cd5), moved verbatim, in place directly after
  js/render/crawl_overlays.js (original lines 24891-25327); the AFTERMATH banner follows at original line 25691 (build 5109cd5).
Three parts: THE LIGHT LAYER (LGT, LC, lAdd, lBeam, lOn, the baked stamps lStamp and bStamp, nightK, bossIntroE, islAmbCalc,
  ILT, ilNear, islLights, claimRayA, islLightPass, lDraw, and the emissives GLOWC, EYE, EYEC, islEmissive); weather ashore, your
  lantern and the cave's wall torches (RAINT, RAINT_N, rainTile, rainLayer, islWeather, islFog, lampPos, lampSpr, drawLamp,
  NO_T, caveTorches, torchSpr, drawTorches); AMBIENT LIFE (iamb, AMB_N, AMB_B, breathT, ambShore, ambLavaPt, ambSpawn, updAmb,
  ambGround, ambAir, ambGlow). LGT, lAdd, lOn, lDraw and nightK are the light kit shared by crawl, caves, towns, rooms and deck.
Entry points: drawIslandWorld calls islAmbCalc, ambGround, drawLamp, ambAir, islLightPass, nightK, islWeather; updateIsland
  calls updAmb, updBiomeHaz calls ambSpawn; the caves call lAdd, lBeam, lOn, lStamp, drawTorches; the deck, town and room light
  passes call lAdd, lOn, lDraw, nightK; the town render calls islFog; js/audio/audio.js and js/audio/director.js call nightK.
Globals it owns: the names above; iamb is a let that genIsland, leaveIsland, begin and others reset to [] (one shared pool).
Main globals it reads from elsewhere (inside functions, at runtime only): ISL, env, wind, itime, player, pctx, IW, IH, icamX,
  icamY, clamp, smooth, hash2, stats, ifx, iprop, iproj, izone, ihaz, ichests, ishrines, idrops, iflag, islScale, iwp, iw2p,
  islOnScr, islTile, islWalk, bogAt, stairsOn, islRoused, sanctLights, cvRoomLit, cvShardDraw (earlier inline code); ITUNE
  (js/data/itune_defaults.js); ELEM, GEMS, GEM_RAR, IRAR, MATS, MOTH_LIFT, SHRINE_K (js/data/crawl2.js); spr2Tpl
  (js/render/spr2_core.js); BAY4, bayV, cI, cIR, PS, psP, psOut, psCv, tSpr (js/render/pixkit.js); TERR_VIS
  (js/render/terrain.js); lavaSpr (js/render/crawl_props.js); cloudSpr, ELEM_LC (js/render/crawl_fx.js); declared later in
  inline code: flagX, flagY, SAGA_DRM, sagaDreamOn, SAGA_LDK, sagaLantLights, sagaLantDay.
Load-time statements: original line 25345 (build 5109cd5), LGT with three new canvases, then 25346, its three getContext calls,
  together and in that order, needing only the DOM; 25473, GLOWC, a new Set of literals; the rest are literal consts and lets.
*/
/* ============================================================ *
 *  STAGE 3 · LIGHT & DARK · AMBIENT LIFE · AFTERMATH · CEREMONY (the crawl)
 *  · THE LIGHT LAYER (LGT): a light map the size of the buffer, filled with the hour's AMBIENT — noon white (skipped: a clear
 *    day costs nothing) · a gold dusk & dawn · a blue night · a slate storm · the cave's gloom, deeper each floor — with every
 *    light ADDED onto it as a baked pixel stamp (stepped rings, Bayer-dithered between the steps: SNES light, not an airbrush),
 *    then MULTIPLIED over the finished world. Emissives (eyes, lava, fireflies, embers, venom, flames, sparks) are redrawn after
 *    the multiply so they pierce the dark; attack tells, '!' marks & HP bars go over it (never lost at night). Lights: islLights().
 *  · AMBIENT LIFE (iamb): one capped pool, per-biome emitters (AMB_B) — pollen & butterflies, fireflies, snow & breath, embers
 *    & heat shimmer, crystal motes, gull shadows & sea spray, autumn leaves, dust devils, moor mist · below: drips & motes.
 *  · AFTERMATH: a kill dissolves (its last baked look — a white frame, then a Bayer dissolve) and leaves a GROUND MARK (fur,
 *    shell shards, goo, feathers, char, a puddle…) BAKED INTO THE TERRAIN CHUNK it fell on (ISL.gm, capped) — a cleared
 *    clearing stays a battlefield until you sail.
 *  · CEREMONY: the claim flag (pixel, twice the old), a god-ray & gold motes, the camera pushed in by a whole texel (IZ — at the
 *    blit, so the grid holds once it settles) · the boss intro's letterbox & red light pulse · bursts for level-ups & legendaries.
 *  · WEATHER ashore goes through it: storms darken, lightning lights the isle for a blink · pixel rain & ripples · fog = a haze
 *    round your lantern (clear to 45% of the screen — the stage-1 floor).
 * ============================================================ */
const LGT={cv:document.createElement('canvas'), fg:document.createElement('canvas'), sc:document.createElement('canvas'), st:new Map(), stPx:0, L:[], n:0, amb:[1,1,1], dk:0, on:false, bi:0, lamp:null, lx:0, ly:0, lr:110, v:[0,0,0,0]};
LGT.g=LGT.cv.getContext('2d'); LGT.fgg=LGT.fg.getContext('2d'); LGT.scg=LGT.sc.getContext('2d');
const LC=[[255,180,100],[255,124,48],[255,212,108],[120,208,255],[176,255,108],[232,240,255],[255,70,50],[106,156,255],[88,232,198],[184,150,255],[255,166,72],[255,226,150]];   // light colours: 0 lantern · 1 lava/fire · 2 gold · 3 crystal/ice · 4 firefly · 5 white · 6 red · 7 magic · 8 sea · 9 violet · 10 torch · 11 sunbeam
function lAdd(x,y,r,a,c,fl){ if(!(a>0.01) || !(r>1)) return null; let o=LGT.L[LGT.n]; if(!o) o=LGT.L[LGT.n]={x:0,y:0,r:0,a:0,c:0,f:0,h:0}; o.x=x; o.y=y; o.r=r; o.a=a; o.c=c; o.f=fl||0; o.h=0; LGT.n++; return o; }   // world x,y · radius (wu) · strength · colour · FLARE (1: a burst — it blooms by day too · 2: a shaft that blooms at full)
function lBeam(x,y,h,w,a,c,fl){ const o=lAdd(x,y,w,a,c,fl); if(o) o.h=h; }                                         // a shaft of light standing on (x,y): h tall, w half-wide (wu)
function lOn(x,y){ const v=LGT.v; return x>v[0]&&x<v[1]&&y>v[2]&&y<v[3]; }                                         // (inside the view + a margin — set each frame)
/* a light's baked stamp: rgb = its colour, alpha = the stepped falloff (flat core to cf, then ITUNE.lightBands steps, dithered across each step) */
function lStamp(R,c,cf){ R=Math.max(2,Math.round(R)); const NB=clamp(Math.round(ITUNE.lightBands),2,10), dq=Math.round(clamp(ITUNE.lightDither,0,1)*8), ck=cf?Math.round(cf*50):0, key=((((R*16+c)*16+NB)*16+dq)*64+ck); let o=LGT.st.get(key); if(o) return o;
  const sz=R*2+1, id=new ImageData(sz,sz), d=id.data, C=LC[c]||LC[5], dW=dq/8, K=1/(1-(cf||0.22)), R1=R+1, Q=new Float32Array(R1*R1), inv=1/(R+0.5), TH=new Float32Array(16);
  for(let y=0;y<=R;y++) for(let x=0;x<=R;x++){ const q=Math.sqrt(x*x+y*y)*inv; Q[y*R1+x]=q>=1?0:Math.pow(clamp((1-q)*K,0,1),1.25)*NB; }   // (the falloff once, for a quarter — it's round)
  for(let i=0;i<16;i++) TH[i]=0.5+((BAY4[i]+0.5)/16-0.5)*dW;
  for(let y=0;y<sz;y++){ const ay=Math.abs(y-R)*R1, by=(y&3)<<2; for(let x=0;x<sz;x++){ const I=Q[ay+Math.abs(x-R)]; if(I<=0) continue;
    const b=I|0, lv=Math.min(NB,b+((I-b)>TH[by|(x&3)]?1:0)); if(lv<=0) continue;
    const p=(y*sz+x)*4; d[p]=C[0]; d[p+1]=C[1]; d[p+2]=C[2]; d[p+3]=(lv*255/NB)|0; } }
  const cv=document.createElement('canvas'); cv.width=cv.height=sz; cv.getContext('2d').putImageData(id,0,0);
  if(LGT.stPx>4e6){ LGT.st.clear(); LGT.stPx=0; } LGT.stPx+=sz*sz; o={cv,R}; LGT.st.set(key,o); return o; }
/* a shaft's stamp: bright at its foot, fading up, widening, leaning in from the top-left (the light's side) */
function bStamp(W,H,c){ W=Math.max(2,Math.round(W)); H=Math.max(4,Math.round(H)); const NB=clamp(Math.round(ITUNE.lightBands),2,10), key=-(((W*1024+H)*16+c)*16+NB)-1; let o=LGT.st.get(key); if(o) return o;
  const sl=0.32, bx=Math.ceil(sl*(H-1)+W*1.7)+1, w=bx+Math.ceil(W*1.2)+2, id=new ImageData(w,H), d=id.data, C=LC[c]||LC[5];
  for(let y=0;y<H;y++){ const u=y/(H-1), hw=W*(1+0.7*(1-u)), cx=bx+0.5-sl*(H-1-y), Iv=Math.pow(u,1.05)*(u>0.95?0.8:1);
    for(let x=Math.max(0,Math.floor(cx-hw));x<=Math.min(w-1,Math.ceil(cx+hw));x++){ const q=Math.abs(x+0.5-cx)/hw; if(q>=1) continue;
      const I=Iv*Math.pow(1-q,0.9)*NB, b=Math.floor(I), lv=Math.min(NB,b+((I-b)>0.5+bayV(x,y)*0.7?1:0)); if(lv<=0) continue;
      const p=(y*w+x)*4; d[p]=C[0]; d[p+1]=C[1]; d[p+2]=C[2]; d[p+3]=Math.round(lv/NB*255); } }
  const cv=document.createElement('canvas'); cv.width=w; cv.height=H; cv.getContext('2d').putImageData(id,0,0);
  LGT.stPx+=w*H; o={cv,ax:bx,ay:H-1}; LGT.st.set(key,o); return o; }
function nightK(){ const k=smooth(clamp((0.62-env.L)/0.5,0,1)); return SAGA_DRM>k && sagaDreamOn() ? SAGA_DRM : k; }                                                   // 0 by day → 1 at the dead of night
function bossIntroE(){ const B=ISL&&ISL.boss; if(!B || B.dead || !(ITUNE.bossIntro>0) || !(ISL.bannerT>=0)) return 0; const t=ISL.bannerT, h=ITUNE.bossIntroT;   // the boss intro's envelope: in 0.25 s · holds · out 0.5 s
  return t<0.25?t/0.25 : t<h?1 : clamp(1-(t-h)/0.5,0,1); }
/* the hour's ambient light (a multiplier per channel) — sets LGT.on (a mask is needed) and LGT.dk (how dark, 0-1) */
function islAmbCalc(){ const A=LGT.amb; let r=1,g=1,b=1;
  if(ISL.cave){ const L=1-clamp(ITUNE.cvDark+ISL.cave.f*ITUNE.cvDarkF,0,0.97); r=L*0.94; g=L*0.9; b=Math.min(1,L*1.14); }   // the dark below: a cold violet gloom, deeper each floor
  else { const nk=nightK(), k=ITUNE.nightLit/0.733;                                                                 // (0.733: the blue cast's own brightness)
    r*=1+(0.62*k-1)*nk; g*=1+(0.74*k-1)*nk; b*=1+(k-1)*nk;
    const w=clamp(1-Math.abs(env.sun)/0.36,0,1)*ITUNE.duskWarm*0.85; if(w>0){ r*=1-0.02*w; g*=1-0.3*w; b*=1-0.62*w; }   // the gold hour
    const st=clamp(env.storm*0.72+env.tempest*0.2,0,1); if(st>0){ r*=1-0.42*st; g*=1-0.38*st; b*=1-0.27*st; }       // a storm's slate
    if(env.drizzle>0.02){ const d=env.drizzle; r*=1-0.12*d; g*=1-0.1*d; b*=1-0.06*d; }
    const fl=clamp(env.flash*0.9,0,1); if(fl>0){ r+=(1-r)*fl; g+=(1-g)*fl; b+=(1-b)*fl; } }                         // lightning: the whole isle lit for a blink
  { const dE=clamp(itime-(LGT.litT==null?itime:LGT.litT),0,0.1); LGT.litT=itime; LGT.litE=clamp((LGT.litE||0)+(islRoused?dE:-dE),0,1);   // A FIGHT'S LIGHT FLOOR (§8.1 crawlLitFloor): while a foe is roused the ambient never sinks below it (eased over 1 s) — bodies read against the dark ground
    const f=ITUNE.crawlLitFloor*LGT.litE, lum=0.3*r+0.59*g+0.11*b; if(f>lum && lum>0.001){ const k=f/lum; r=Math.min(1,r*k); g=Math.min(1,g*k); b=Math.min(1,b*k); } }
  const bi=bossIntroE(); if(bi>0){ const k=1-0.36*bi; r*=k; g*=k; b*=k; }                                           // a boss wakes: the world dims round the two of you
  A[0]=clamp(r,0,1); A[1]=clamp(g,0,1); A[2]=clamp(b,0,1); LGT.bi=bi;
  LGT.dk=1-(0.3*A[0]+0.59*A[1]+0.11*A[2]); LGT.on=ITUNE.lightOn>0 && (A[0]<0.985||A[1]<0.985||A[2]<0.985); }
/* every light this frame (world units) */
const ILT=[]; function ilNear(a,b){ return a._ld-b._ld; }                                        // (islLights' scratch list of lit finds — nearest first)
function islLights(evis){ const cv=ISL.cave, dk=LGT.dk, s=islScale(), V=LGT.v; LGT.n=0;
  V[0]=icamX-IW/2/s-70; V[1]=icamX+IW/2/s+70; V[2]=icamY-IH/2/s-70; V[3]=icamY+IH/2/s+110;
  const la=cv?1:clamp((dk-0.04)/0.3,0,1)*(dk<0.35?0.8:dk<0.45?0.8+(dk-0.35)*2:1);   // (at dusk it's a glow, not a floodlight)                                                                           // YOUR LANTERN — lit as the light fails (always, below)
  const R=(cv ? ITUNE.cvLight*Math.max(ITUNE.cvLightMin,1-ITUNE.cvLightF*Math.max(0,cv.f-1)) : ITUNE.lantern)*(1+(stats().lightR||0)); LGT.lr=R;   // (each floor down, a smaller ring — the dark is the challenge · C7b: the Elixir of the Deep +30%)
  if(la>0){ const fk=ITUNE.lanternFlick, n=Math.sin(itime*8.3)*0.5+Math.sin(itime*13.7+1.3)*0.35+Math.sin(itime*2.1)*0.45;
    lAdd(player.x*0.7+LGT.lx*0.3, player.y*0.7+LGT.ly*0.3, R*(1+n*0.02*fk), la*(1-0.08*fk*(0.5+0.5*Math.sin(itime*11.9+Math.sin(itime*3.1)*2))), 0);
    lAdd(LGT.lx,LGT.ly,15,0.5*la,10); }
  for(const h of ihaz){ if(!lOn(h.x,h.y)) continue;                                                                   // lava breathes · warns · flares
    if(h.st==='flare') lAdd(h.x,h.y,86,1.15,1,1); else if(h.st==='warn') lAdd(h.x,h.y,56,0.55+0.4*clamp(1-h.t/1.1,0,1),1); else lAdd(h.x,h.y,36,0.4+0.14*Math.sin(itime*2.4+h.x*0.07),1); }
  for(const ch of ichests){ if(!lOn(ch.x,ch.y)) continue; if(ch.opened) lAdd(ch.x,ch.y-4,ch.big?34:24,0.5,2); else if(ch.sec || ISL.clearings[ch.clear].secured) lAdd(ch.x,ch.y,ch.big?56:44,0.5+0.2*Math.sin(itime*3.2),2); }   // an open chest's gold glows · a won cache calls you (C8b: a grotto's chest too)
  for(const q of ishrines){ if(q.used || !lOn(q.x,q.y)) continue; lAdd(q.x,q.y-18,34,0.5+0.14*Math.sin(itime*2.2+q.x*0.1),SHRINE_K[q.k].lc); }   // (C8b) a shrine's sigil glows in its colour
  if(ISL.sagaL) sagaLantLights();                                                                                     // (INTROSTORY C14) the Far Lantern’s lamp, from its lighting
  if(ISL.sanct) sanctLights();                                                                                        // (DEPTHS DE2) the sanctum's find · its lit runes
  if(cv) cvRoomLit();                                                                                                 // (SEAS & DEPTHS DE5) the deep rooms' own light (≤ cvLightCap)
  { const L=ISL.secrets; if(L) for(const S of L){ if(S.open || S.kind!=='glyph' || !lOn(S.door.x,S.door.y)) continue; lAdd(S.door.x-S.dx*6,S.door.y-S.dy*6,18,0.3+0.1*Math.sin(itime*1.7+S.px),3); } }   // (…& a glyph boulder's rune, faint blue)
  let gc=0; const IL=ILT; IL.length=0; for(const d of idrops){ if(!lOn(d.x,d.y)) continue;
    if(d.k==='item'||d.k==='gem'){ const r=d.k==='gem'?GEM_RAR[GEMS[d.gm.g].r].t:d.it.r; if(IRAR[r].bm){ d._lr=r; d._ld=(d.x-player.x)**2+(d.y-player.y)**2; IL.push(d); } }   // (a find with a beam: lit below, nearest first)
    else if(MATS[d.k] && MATS[d.k].lc) lAdd(d.x,d.y,20,0.5,MATS[d.k].lc); else if(d.k==='gold'){ if(gc++<30) lAdd(d.x,d.y,10,0.32,2); } else if(d.k==='potion') lAdd(d.x,d.y,12,0.35,6); }
  if(IL.length){ if(IL.length>16) IL.sort(ilNear); let ib=0; for(let i=0;i<IL.length && i<16;i++){ const d=IL[i], r=d._lr, R=IRAR[r]; lAdd(d.x,d.y,22+r*10,0.7,R.lc); if(ib<6 && r>=1){ ib++; lBeam(d.x,d.y,R.bm[0],2+r,0.6,R.lc); } } }   // a find's beam lights a column of the night — the NEAREST 16 pools & 6 shafts a frame (G3 fix: were the first 24 & 6 in list order)
  let nS=0, nA=0; for(const f of ifx){ const p=f.life?clamp(f.t/f.life,0,1):0;   // (G3 fix: the hit stars' & gold arrows' little lights — at most 16 & 12 a frame; a storm of shots lit ~150)
    switch(f.k){
      case 'beacon': { const c=f.c.charCodeAt(0)===50?2:7; lAdd(f.x,f.y,40,0.8*(1-p),c); lBeam(f.x,f.y,96-30*p,4,0.7*(1-p),c); break; }
      case 'claim': lAdd(f.x,f.y,f.r*(0.6+p*2.2),1.3*(1-p),2,1); break;
      case 'lvlup': lAdd(player.x,player.y,30+140*p,1.3*(1-p),2,1); break;                                          // a level-up: a burst of gold light
      case 'lburst': lAdd(f.x,f.y,30+160*p,1.4*(1-p),f.c,1); break;                                                 // a legendary (or rare) find: a burst in its colour
      case 'whirl': lAdd(player.x,player.y,f.R*1.35,0.95*(1-p),11,1); break;
      case 'volley': lAdd(player.x,player.y,f.R*(0.4+p*1.1),0.55*(1-p),2); break;
      case 'death': lAdd(f.x,f.y,f.r*2.4,0.6*(1-p),5); break;                                                        // a kill's white flash lights the dark round it
      case 'slash': lAdd(player.x,player.y,f.fin?40:30,(f.fin?0.7:0.4)*(1-p),f.fin?11:5); break;                     // (the smear lights its own sweep — it reads at night; no bloom by day)
      case 'star': if(nS++<16) lAdd(f.x,f.y,f.big?20:12,0.8*(1-p),5); break;                                        // a hit's white star flashes through the dark
      case 'nova': lAdd(player.x,player.y,30+80*p,1.2*(1-p),2,1); break;
      case 'slamfx': lAdd(f.x,f.y,f.R*1.4,0.5*(1-p),10); break;                                                     // (C5a) a slam's crack of light · a bolt's splash in its element's glow · the staff's cast flash
      case 'bsplash': lAdd(f.x,f.y,f.R*1.6,(f.big?0.9:0.6)*(1-p),ELEM_LC[f.c]||5); break;
      case 'boom': if(f.t<0.25) lAdd(f.x,f.y,120,0.9*(1-f.t/0.25),1,1); else lAdd(f.x,f.y-8,40,0.6*(1-p),1); break;   // (PT1 K7a) a keg's BOOM: a 120u flash for 0.25 s, then its fire's glow
      case 'cast': lAdd(player.x+Math.cos(f.a)*16,player.y+Math.sin(f.a)*16,f.big?30:20,0.8*(1-p),ELEM_LC[f.c]||5); break; } }
  for(const P of iprop) if(P.st==='fuse' && !P.dead && lOn(P.x,P.y)) lAdd(P.x,P.y-12,14+5*Math.sin(itime*31+P.id),0.75,1);   // (PT1 K7a) a lit fuse sparks in the dark
  if(ISL.rings) for(const Rg of ISL.rings){ if(Rg.st!=='sealed' || !lOn(Rg.x,Rg.y)) continue; const W=ISL.W, TS=ISL.TS;   // (PT1 K10b) a sealed ring: its bars & its runes glow in the dark
    for(const k of Rg.gc) lAdd((k%W+0.5)*TS,(((k/W)|0)+0.5)*TS,26,0.7+0.15*Math.sin(itime*7+k),3);
    let n=0; for(const P of iprop) if(P.rg===Rg && P.tall && n++<12 && lOn(P.x,P.y)) lAdd(P.x,P.y-18,11,0.5,3); }
  for(const pr of iproj){ if(!lOn(pr.x,pr.y)) continue; if(pr.k==='spit' && !pr.pearl && !pr.lob) lAdd(pr.x,pr.y,14,0.55,4); else if(pr.lob && pr.pool) lAdd(pr.x,pr.y-pr.z,18,0.7,1); else if(pr.k==='arrow' && pr.gold){ if(nA++<12) lAdd(pr.x,pr.y,9,0.4,2); } else if(pr.k==='bolt') lAdd(pr.x,pr.y,pr.orb?24:pr.burst?20:14,0.7,ELEM_LC[(ELEM[pr.el]||ELEM.phy).c]||5); }   // (C8c: a lava glob lights its arc)
  for(const z of izone) if(z.type!=='phy' && !(z.arm>z.t) && lOn(z.x,z.y)) lAdd(z.x,z.y,z.R*1.3,z.kind==='lavapool'?0.55:0.35,ELEM_LC[z.col]||(z.kind==='lavapool'?1:5));            // (a zone of an element glows in the dark)
  for(const en of evis){ const tk=en.tk;                                                                              // what burns, what's magic, what's a lord
    if((tk&&tk.burning) || en.scorch || (en.st_bu&&en.st_bu.t>0)) lAdd(en.x,en.y,en.r*2.8,0.55,1);                 // (C5a: a BURNING foe lights its ground)
    if(en.guard) lAdd(en.x,en.y,en.r*3.2,en.ph>=3?0.6+0.25*Math.sin(itime*9):0.35,6);
    else if(en.rar===2) lAdd(en.x,en.y,en.r*2.8,0.4,2); else if(en.rar===1) lAdd(en.x,en.y,en.r*2.6,0.36,7);
    if(en.type==='tidecaller' && en.cast>0) lAdd(en.x,en.y,44,0.7,8); else if(en.type==='siren' && (player.snare||0)>0.05) lAdd(en.x,en.y,40,0.55,3); else if(en.drowned) lAdd(en.x,en.y,en.r*2,0.25,8);
    else if(en.type==='mshrimp' && en.st==='wind') lAdd(en.x,en.y,en.r*2.8,0.7,5); else if(en.type==='cinderfox' && !en.fodder) lAdd(en.x,en.y,en.r*1.9,0.32,1);
    else if(en.type==='salamander') lAdd(en.x,en.y,en.r*(en.st==='wind'?3:1.8),en.st==='wind'?0.7:0.3,1);            // (C8c) a salamander's embers — its throat blazes as it winds
    else if(en.type==='beetle'){ if(en.st==='wind') lAdd(en.x+Math.cos(en.aa)*en.r,en.y+Math.sin(en.aa)*en.r,18+16*(en.lk?1:0),en.lk?0.8:0.45,3);   // (C8c) the beetle's prism horn charges — then its BEAM lights its whole line
      else if(en.st==='act'){ const L=en.lnL||200, c=Math.cos(en.aa), sn=Math.sin(en.aa); for(let q=0;q<=L;q+=40) lAdd(en.x+c*(en.r+q),en.y+sn*(en.r+q),26,0.8,3); } } }   // (C8a) a mantis shrimp's clubs glow white as it winds · a cinder fox's ember paws
  for(const q of iamb){ const k=q.k;                                                                                  // fireflies, embers, motes
    if(k==='ff') lAdd(q.x,q.y,12,0.2+0.35*(0.5+0.5*Math.sin(q.ph)),q.c==='#d8ff8a'?4:3); else if(k==='em') lAdd(q.x,q.y,8,0.5*(1-q.t/q.life),1); else if(k==='mo') lAdd(q.x,q.y,9,0.4*q.a,3); else if(k==='gm') lAdd(q.x,q.y,7,0.55*(1-q.t/q.life),2); }
  if(cv){ lAdd(ISL.landing.x,ISL.landing.y,60,0.55,10);                                                            // the ropes & the stairs · the wall torches
    if(ISL.caveOpen && ISL.ropeP) lAdd(ISL.ropeP.x,ISL.ropeP.y,95,0.9,10); if(stairsOn()) lAdd(ISL.stairP.x,ISL.stairP.y,80,0.8,9);
    for(const t of caveTorches()) if(lOn(t.x,t.y)) lAdd(t.x,t.y+2,ITUNE.cvTorchR*(1+0.03*Math.sin(itime*9+t.ph)),0.8+0.12*Math.sin(itime*13+t.ph*2),10); }
  else if(dk>0.1){ const I=ISL; lAdd(I.landing.x,I.landing.y-6,54,0.7,10);                                         // the boat's lamp · a won clearing's cairn-lamp · the hoard stones' runes
    for(const cl of I.clearings){ if(!cl.secured||cl.id===0) continue; const x=cl.flx||cl.x, y=cl.fly||cl.y; if(lOn(x,y)) lAdd(x,y-8,36,0.6,10); }
    const P=I._T&&I._T.P; if(P) for(const q of P.stones) if(lOn(q.x,q.y)) lAdd(q.x,q.y-8,16,0.4,3); }
  if(ISL.mouthOn && ISL.mouthP && dk>0.1 && lOn(ISL.mouthP.x,ISL.mouthP.y)) lAdd(ISL.mouthP.x,ISL.mouthP.y,44,0.5,9);   // a cave mouth breathes a violet glow
  if(iflag){ const rise=clamp(iflag.t/1.4,0,1), ra=claimRayA(), fx=flagX(), fy=flagY(); if(rise>0.2 && dk>0.05) lAdd(fx,fy-30*rise,50,0.65*rise,2);   // the flag · its god-ray & the pool of light at its foot
    if(ra>0){ lBeam(fx,fy+3,180,22,ra*0.85,11,2); lAdd(fx,fy,48,ra*0.45,11,1); } }
  if(dk>0.1 && ISL._T){ const T=ISL._T, s2=T.s, ox=Math.round(IW/2-icamX*s2), oy=Math.round(IH/2-icamY*s2); let n=0;        // the ground's own glow: embers, crystal grit, glowcaps
    for(const C of TERR_VIS){ const L=C.gl; if(!L) continue; for(let i=0;i<L.length && n<64;i+=3){ const kd=L[i+2]; if(kd!==1&&kd!==2&&kd!==4&&kd!==5) continue; const bx=C.X+L[i]+ox, by=C.Y+L[i+1]+oy; if(bx<-20||by<-20||bx>IW+20||by>IH+20) continue;
      if(kd===5){ if(((C.X+L[i])*7+(C.Y+L[i+1])*3)%3) continue; lAdd((C.X+L[i]+0.5)/s2,(C.Y+L[i+1]+0.5)/s2,30,0.5+0.08*Math.sin(itime*2.3+L[i]),1); n++; continue; }   // (a lava river lights its banks — every third point)
      lAdd((C.X+L[i]+0.5)/s2,(C.Y+L[i+1]+0.5)/s2,kd===1?9:kd===4?16:12,kd===1?0.45:kd===4?0.42:0.38,kd===1?1:kd===4?9:3); n++; } } }
  if(LGT.bi>0){ const B=ISL.boss, p=clamp(ISL.bannerT/0.9,0,1); lAdd(B.x,B.y,40+170*p,1.5*(1-p)+0.45*LGT.bi,6,1); } }   // the boss wakes: a red pulse off it
function claimRayA(){ if(!iflag || !(ITUNE.claimRay>0) || iflag.t>40) return 0; const t=iflag.t, h=1.4+ITUNE.claimHold;   // (a claimed isle's standing flag: no ray)
  return ITUNE.claimRay*(t<0.25?0 : t<1.2?(t-0.25)/0.95 : t<h?1 : clamp(1-(t-h)/1.2,0,1)); }
/* THE PASS — the mask (when the hour needs one) · the bursts' bloom (by day too) · what glows through the dark */
function islLightPass(evis){ const s=islScale(), A=LGT.amb, g=LGT.g, cv=LGT.cv;
  islLights(evis);
  if(LGT.on){ if(cv.width!==IW||cv.height!==IH){ cv.width=IW; cv.height=IH; }
    g.globalCompositeOperation='source-over'; g.globalAlpha=1; g.fillStyle='rgb('+Math.round(A[0]*255)+','+Math.round(A[1]*255)+','+Math.round(A[2]*255)+')'; g.fillRect(0,0,IW,IH);
    g.globalCompositeOperation='lighter'; lDraw(g,s,0);
    g.globalAlpha=1; g.globalCompositeOperation='darken'; g.fillStyle='rgb(255,226,176)'; g.fillRect(0,0,IW,IH);   // (a lamp's pool tops out warm — never back to noon white)
    g.globalCompositeOperation='source-over';
    pctx.globalCompositeOperation='multiply'; pctx.drawImage(cv,0,0); pctx.globalCompositeOperation='source-over'; }
  if(ITUNE.flareBloom>0){ pctx.globalCompositeOperation='lighter'; lDraw(pctx,s,LGT.on?0.55:1); pctx.globalCompositeOperation='source-over'; pctx.globalAlpha=1; }
  islEmissive(evis); }
function lDraw(g,s,bloom){ for(let i=0;i<LGT.n;i++){ const L=LGT.L[i]; if(bloom && !L.f) continue;   // (bloom: only the bursts & the shafts)
    const X=Math.round((L.x-icamX)*s+IW/2), Y=Math.round((L.y-icamY)*s+IH/2); let a=bloom ? L.a*(L.f===2?0.6:ITUNE.flareBloom*bloom) : L.a;
    if(L.h){ const o=bStamp(L.r*s,L.h*s,L.c); if(X-o.ax>IW||X+o.cv.width-o.ax<0||Y-o.ay>IH||Y<0) continue; g.globalAlpha=Math.min(1,a); g.drawImage(o.cv,X-o.ax,Y-o.ay); continue; }
    const R=L.r*s, Rq=(R<24||L.c===0)?Math.round(R) : L.f?(R<64?Math.round(R/4)*4:Math.round(R/8)*8) : Math.round(R/3)*3; if(X+Rq<0||Y+Rq<0||X-Rq>IW||Y-Rq>IH) continue; const o=lStamp(Rq,L.c);   // (your lantern: every texel of its flicker · a growing burst: coarse steps, few stamps)
    while(a>0.004){ g.globalAlpha=Math.min(1,a); g.drawImage(o.cv,X-o.R,Y-o.R); a-=1; } } g.globalAlpha=1; }
const GLOWC=new Set(['#ffd23f','#fff3b0','#ffffff','#ffe9a6','#ff8a3c','#ff7a3c','#ffd9a8','#ffe066','#ff9a3c','#ff5d4a','#8fb8ff','#b9a6ff','#ffe68c']);   // spark colours that glow at night
const EYE={boar:[0.72,0.3,0], reefspike:[0.42,0.24,0], snake:[0.3,0.32,1], crab:[0.55,0.3,0], dingo:[1.16,0.2,0], ooze:[0.34,0.3,2], clam:[0.3,0.22,0], diver:[0.9,0.14,0], sanddev:[0.35,0.28,0], alpha:[1.16,0.22,0], tidecaller:[0.36,0.2,3], lamprey:[0.72,0.16,0], siren:[0.42,0.18,4],
  coco:[0.5,0.26,0], kelpie:[0.8,0.2,1], cinderfox:[0.9,0.2,0], mshrimp:[0.6,0.3,2], mothwing:[0.4,0.3,3], boulderback:[0.7,0.25,0], scorpion:[0.7,0.24,0], bogtoad:[0.55,0.36,0],
  termqueen:[0.3,0.3,0], termite:[0.6,0.3,0], walrus:[0.7,0.3,0], salamander:[0.8,0.22,0], beetle:[0.6,0.3,2], tmantis:[0.7,0.3,0], sporeling:[0.4,0.3,3]};   // (C8c) · where each kind's eyes sit (× its radius: forward · apart) · their glow
const EYEC=[['#ffb44a','#ff4a36'],['#ffd23f','#ff7a3c'],['#e8ff7a','#e8ff7a'],['#7affe0','#7affe0'],['#9ff0ff','#e0fcff']];   // amber beasts (red when they mean it) · snake gold · ooze lime · tidecaller sea-teal · siren ice
function islEmissive(evis){ const dk=LGT.dk; if(!LGT.on || dk<0.08){ if(SAGA_LDK>0 && ISL.sagaL) sagaLantDay(0); return; } const k=clamp((dk-0.08)/0.4,0,1), s=islScale();   // (IS7 FIX: the Far Lantern lit by day — its glass & beam while its scenes play)
  pctx.globalCompositeOperation='lighter';
  for(const h of ihaz){ if(h.rock || !islOnScr(h.x,h.y,30)) continue; const [sx,sy]=iwp(h.x,h.y), v=Math.abs(Math.floor(h.x*0.13+h.y*0.29))%4, co=lavaSpr(v,h.st==='flare'), kk=h.st==='flare'?1:h.st==='warn'?0.8:0.5+0.2*Math.sin(itime*2.4+h.x*0.07);   // lava's core burns through
    pctx.globalAlpha=clamp(k*kk*0.75,0,1); pctx.drawImage(co.cv,sx-co.ax,sy-co.ay); }
  pctx.globalAlpha=1; ambGlow(k); if(ISL.sagaL) sagaLantDay(k);
  if(ISL._T){ const s2=ISL._T.s, ox=Math.round(IW/2-icamX*s2), oy=Math.round(IH/2-icamY*s2), lk=ISL.cave?0.3:0.85; for(const C of TERR_VIS) if(C.lv){ pctx.globalAlpha=clamp(k*lk,0,1); pctx.drawImage(C.lv,C.X+ox,C.Y+oy); } pctx.globalAlpha=1; }   // the caldera's lava burns through the night (DE5: a magma vault's through the dark below — softer: its glints & lights already light it)
  if(ISL.cave && ITUNE.cvLip>0 && ISL._T){ const s2=ISL._T.s, ox=Math.round(IW/2-icamX*s2), oy=Math.round(IH/2-icamY*s2); pctx.globalAlpha=clamp(ITUNE.cvLip*k,0,1); for(const C of TERR_VIS) if(C.lp) pctx.drawImage(C.lp,C.X+ox,C.Y+oy); pctx.globalAlpha=1; }
  if(ISL.cave && ISL._T && ISL.grassN>0){ const s2=ISL._T.s, ox=Math.round(IW/2-icamX*s2), oy=Math.round(IH/2-icamY*s2); for(const C of TERR_VIS) if(C.fg){ pctx.globalAlpha=clamp(k*(0.6+0.3*Math.sin(itime*1.4+C.X*0.013+C.Y*0.007)),0,1); pctx.drawImage(C.fg,C.X+ox,C.Y+oy); } pctx.globalAlpha=1; }   // (SEAS & DEPTHS DE5) a grotto's frond tips glow, breathing
  if(ISL.shards && ISL.shards.length) for(const S of ISL.shards) cvShardDraw(S,s,k);   // (DE5) a ringing crystal's reach, through the dark
  if(ISL.cave && ISL.clouds && ISL.clouds.length){ for(const c of ISL.clouds){ if(!islOnScr(c.x,c.y,c.R+10)) continue; const [x,y]=iwp(c.x,c.y), R=c.R*Math.min(1,0.35+c.t*2.6), o=cloudSpr(Math.max(6,Math.round(R/4)*4)), a=clamp(Math.min(c.t*4,(c.life-c.t)/0.8),0,1); pctx.globalAlpha=clamp(a*k*0.35,0,1); pctx.drawImage(o.cv,x-o.ax,y-o.ay-Math.round(3*s)); } pctx.globalAlpha=1; }   // (SD5 fix: below ground a spore cloud glows a little — it reads past the lantern)
  for(const pr of iproj){ if(pr.k!=='spit'||pr.pearl||pr.lob) continue; const [sx,sy]=iwp(pr.x,pr.y); pctx.fillStyle='rgba(216,255,90,'+(0.85*k).toFixed(3)+')'; pctx.fillRect(sx-1,sy-1,2,2); }   // venom's acid core
  for(const f of ifx){ if(f.k!=='p' || !GLOWC.has(f.c)) continue; const [sx,sy]=iw2p(f.x,f.y); pctx.globalAlpha=clamp(1-f.t/f.life,0,1)*k; pctx.fillStyle=f.c; pctx.fillRect(Math.round(sx),Math.round(sy),1,1); }   // gold & ember sparks
  pctx.globalAlpha=1;
  if(LGT.lamp){ const q=LGT.lamp; pctx.fillStyle='rgba(255,214,130,'+(0.85*k).toFixed(3)+')'; pctx.fillRect(q[0],q[1],1,3); }   // the lamp's glass
  if(ISL.cave){ for(const t of caveTorches()){ if(!islOnScr(t.x,t.y,20)) continue; const [x,y]=iwp(t.x,t.y); pctx.fillStyle='rgba(255,190,90,'+(0.7*k).toFixed(3)+')'; pctx.fillRect(x-1,y-9,3,4); pctx.fillStyle='rgba(255,244,200,'+(0.8*k).toFixed(3)+')'; pctx.fillRect(x,y-8,1,2); } }
  else if(LGT.dk>0.1){ for(const cl of ISL.clearings){ if(!cl.secured||cl.id===0) continue; const x0=cl.flx||cl.x, y0=cl.fly||cl.y; if(!islOnScr(x0,y0,20)) continue; const [x,y]=iwp(x0,y0), fl=(Math.sin(itime*11+cl.id)>0.2)?1:0;   // the cairn's lamp-flame
      pctx.fillStyle='rgba(255,176,80,'+(0.9*k).toFixed(3)+')'; pctx.fillRect(x,y-Math.round(10*s)-fl,2,2); pctx.fillStyle='rgba(255,240,190,'+(0.9*k).toFixed(3)+')'; pctx.fillRect(x,y-Math.round(10*s)-fl,1,1); } }
  pctx.globalCompositeOperation='source-over';
  const eg=ITUNE.eyeGlow*clamp((dk-0.12)/0.35,0,1); if(eg>0.02){ const R=LGT.lr;                                   // EYES in the dark: every foe past your light shows its eyes
    for(const en of evis){ const E=EYE[en.type]; if(!E || en._ex==null || en.flash>0 || (en.type==='clam'&&en.st!=='open') || (en.type==='sanddev'&&en.st!=='erupt')) continue;
      const d=Math.hypot(en.x-player.x,en.y-player.y), a=Math.min(1,eg*clamp((d-R*0.5)/(R*0.4),0,1)*(en.fodder?0.75:1)*(en.clone?0.6:1)); if(a<0.03) continue;
      const fa=en._fa, fx=Math.cos(fa), fy=Math.sin(fa), r=en.r*s, hot=en.aggro||en.st==='windup'||en.st==='charge'||en.st==='crouch'||en.st==='pounce'||en.st==='lunge', col=EYEC[E[2]][hot?1:0], q=r>12?2:1;
      pctx.fillStyle=col;
      const C=en._C, Y=C&&C.eyes; if(Y){ const p=C.ek||1, kd=en.kd>0, dk2=Math.round(r*0.35); for(let i=0;i<Y.length;i+=2){ const ex=en._ex+Y[i], ey=kd?en._ey+dk2-Y[i+1]-p:en._ey+Y[i+1];   // (PX E1) a template's eyes come from its frame (none facing away) · knocked down: flipped with the body
          pctx.globalAlpha=a*0.28; pctx.fillRect(ex-1,ey-1,p+2,p+2); pctx.globalAlpha=a; pctx.fillRect(ex,ey,p,p); } continue; }
      if(ITUNE.artSpr>0 && spr2Tpl(en)) continue;   // (a templated body with no look yet: no glint — never the old top-down offsets on a 3/4 body)
      const lift=(en.type==='diver'&&en.st!=='grounded')?Math.round(Math.round(clamp(en.alt==null?1:en.alt,0,1)*8)/8*r*1.7):en.type==='mothwing'?Math.round(r*MOTH_LIFT):0;   // (a diver aloft: its body is drawn lifted · C8a a mothwing hovers)
      for(let sg=-1;sg<=1;sg+=2){ const ex=Math.round(en._ex+(fx*E[0]-fy*E[1]*sg)*r), ey=Math.round(en._ey-lift+(fy*E[0]+fx*E[1]*sg)*r);
        pctx.globalAlpha=a*0.28; pctx.fillRect(ex-1,ey-1,q+2,q+2); pctx.globalAlpha=a; pctx.fillRect(ex,ey,q,q); } }
    pctx.globalAlpha=1; } }
/* weather ashore — pixel rain (slanting with the wind) & drizzle, fog round your lantern, lightning's over-bright blink */
const RAINT={}; let RAINT_N=0;
function rainTile(sq,L,d,v){ const key=sq*1000+L*100+d*10+v; let o=RAINT[key]; if(o) return o; if(++RAINT_N>48){ for(const k in RAINT) delete RAINT[k]; RAINT_N=1; } const T=96, id=new ImageData(T,T), D=id.data, sl=sq/4;   // a 96-texel tile of pixel rain streaks (baked per slant step · length · density · layer) — tiled & scrolled each frame
  for(let i=0;i<d*3;i++){ const x0=Math.floor(hash2(i*7+v*131,d*3+L*17)*T), y0=Math.floor(hash2(i*13+v*71,L*5+d*29)*T);
    for(let j=0;j<L;j++){ const x=((Math.round(x0-sl*j)%T)+T)%T, y=((y0-j)%T+T)%T, p=(y*T+x)*4; D[p]=206; D[p+1]=220; D[p+2]=246; D[p+3]=j===0?235:150; } }
  const c=document.createElement('canvas'); c.width=c.height=T; c.getContext('2d').putImageData(id,0,0); return RAINT[key]={cv:c,T}; }
function rainLayer(o,spd,sl,a){ const T=o.T, oy=((itime*spd)%T+T)%T, ox=((itime*spd*sl)%T+T)%T; pctx.globalAlpha=a;
  for(let y=oy-T;y<IH;y+=T) for(let x=ox-T;x<IW;x+=T) pctx.drawImage(o.cv,Math.round(x),Math.round(y)); pctx.globalAlpha=1; }
function islWeather(){ if(ISL.cave) return; const rk=ITUNE.rainAsh, st=env.storm, dz=env.drizzle, lum=1-LGT.dk*0.55;
  if(rk>0 && st>0.02){ const slr=Math.cos(wind.a)*(0.55+env.tempest*0.5)+0.2, sq=clamp(Math.round(slr*4),-6,6), L=3+Math.round(env.tempest*3), d=clamp(Math.round(st*(1+env.tempest)*rk*4),1,9), a=(0.5+0.45*st)*lum;   // (tiles, not a pixel at a time — a storm is hundreds of streaks)
    rainLayer(rainTile(sq,Math.max(2,L-1),d,1),150,sq/4,a*0.6); rainLayer(rainTile(sq,L,d,0),230,sq/4,a); }
  if(rk>0 && dz>0.05 && st<0.2){ rainLayer(rainTile(0,2,clamp(Math.round(dz*rk*3),1,9),2),115,0,0.45*dz*lum); }
  if(env.fog>0.02 && ITUNE.fogAsh>0) islFog();
  if(env.flash>0.02){ pctx.globalCompositeOperation='lighter'; pctx.fillStyle='rgba(110,122,150,'+(env.flash*0.2).toFixed(3)+')'; pctx.fillRect(0,0,IW,IH); pctx.globalCompositeOperation='source-over'; } }
function islFog(){ const f=clamp(env.fog*ITUNE.fogAsh,0,1), c=LGT.fg, g=LGT.fgg, A=LGT.amb; if(c.width!==IW||c.height!==IH){ c.width=IW; c.height=IH; }
  const cr=Math.round(206*(0.22+0.78*A[0])), cg=Math.round(212*(0.22+0.78*A[1])), cb=Math.round(222*(0.22+0.78*A[2]));   // (fog in the dark is a dim grey — it takes the hour's light)
  g.globalCompositeOperation='source-over'; g.clearRect(0,0,IW,IH); g.fillStyle='rgba('+cr+','+cg+','+cb+','+(f*0.62).toFixed(3)+')'; g.fillRect(0,0,IW,IH);
  const P=iwp(player.x,player.y), o=lStamp(Math.round(IH*0.84),5,0.54);                                             // clear to 45% of the screen round you (the stage-1 floor), thickening past it
  g.globalCompositeOperation='destination-out'; g.drawImage(o.cv,P[0]-o.R,P[1]-o.R); g.globalCompositeOperation='source-over';
  pctx.drawImage(c,0,0);
  const w=lStamp(Math.round(IH*0.2),5,0.3); pctx.globalAlpha=f*0.14*(0.4+0.6*(1-LGT.dk));                           // slow wisps drifting through
  for(let i=0;i<4;i++){ const x=((i*97.3+itime*(4+i*1.3))%(IW+w.R*2))-w.R, y=(i*61.7+Math.sin(itime*0.1+i)*10)%IH; pctx.drawImage(w.cv,Math.round(x-w.R),Math.round(y-w.R)); } pctx.globalAlpha=1; }
/* your lantern (after dark & below): a little brass lamp in your off hand — behind you when that hand is */
function lampPos(){ const s=islScale(), pr=player.r*s*ITUNE.pScale, P=iwp(player.x,player.y), fa0=(player.spinT>0||player.aimT>0)?player.atkA:Math.atan2(player.fy,player.fx), fi=((Math.round(fa0/(TAU/16))%16)+16)%16, pfa=fi*TAU/16;
  const sw=player.moving?Math.round(Math.sin(itime*11.5)):0; return [Math.round(P[0]+Math.sin(pfa)*pr*1.05)+sw, Math.round(P[1]-Math.cos(pfa)*pr*1.05)+1, P[1]]; }
function lampSpr(){ return tSpr('lamp', ()=>{ const S=PS(7,9), F=cI('#5a3e18'), F2=cI('#a8802c'), G=cI('#ffd070'), G2=cI('#fff4c0');
  psP(S,3,1,F); psP(S,2,2,F); psP(S,4,2,F); for(let x=2;x<=4;x++){ psP(S,x,3,F2); psP(S,x,7,F2); }
  for(let y=4;y<=6;y++){ psP(S,2,y,F); psP(S,4,y,F); psP(S,3,y,y===5?G2:G); }
  return psCv(psOut(S,cI('#140c04'),false),3,1); }); }
function drawLamp(front){ if(!LGT.on || !(LGT.dk>0.12)){ if(front){ LGT.lamp=null; LGT.lx=player.x; LGT.ly=player.y; } return; }
  const q=lampPos(), behind=q[1]<q[2]-1; if(behind===front) return;                                                // (drawn before you when it's on your far side)
  const o=lampSpr(), s=islScale(); pctx.drawImage(o.cv,q[0]-o.ax,q[1]-o.ay); LGT.lamp=[q[0],q[1]+3];
  LGT.lx=player.x+(q[0]-iwp(player.x,player.y)[0])/s; LGT.ly=player.y+(q[1]+4-q[2])/s; }
/* the wall torches of a cave floor — on flat stretches of cliff over a chamber's floor; fewer each floor down (then none) */
const NO_T=[];
function caveTorches(){ const I=ISL; if(!I||!I.cave) return NO_T; const kv=ITUNE.cvTorch*100+ITUNE.cvTorchF*7+ITUNE.terrCliff; if(I._tor && I._torV===kv) return I._tor;
  const T=[], TS=I.TS, W=I.W, H=I.H, t0=I.tiles0||I.tiles, f=I.cave.f, per=Math.max(0,Math.round(ITUNE.cvTorch-ITUNE.cvTorchF*(f-1)));
  if(per>0) for(const cl of I.clearings){ const c=[], r=(cl.r0||60)+TS*1.5, tx0=Math.max(1,Math.floor((cl.x-r)/TS)), tx1=Math.min(W-2,Math.floor((cl.x+r)/TS)), ty0=Math.max(0,Math.floor((cl.y-r)/TS)), ty1=Math.min(H-2,Math.floor((cl.y+r)/TS));
    for(let ty=ty0;ty<=ty1;ty++) for(let tx=tx0;tx<=tx1;tx++){ const k=ty*W+tx; if(t0[k]!==W_WALL||t0[k+W]!==W_GROUND||t0[k-1]!==W_WALL||t0[k+1]!==W_WALL||t0[k+W-1]===W_WALL||t0[k+W+1]===W_WALL) continue;
      const x=(tx+0.5)*TS, y=(ty+1)*TS; if(Math.hypot(x-cl.x,y-cl.y)>r) continue; c.push({x, y:y-ITUNE.terrCliff*0.5, ph:hash2(tx*7+f,ty*13)*9, h:hash2(tx*3+f*11,ty*5+17)}); }
    c.sort((a,b)=>a.h-b.h); let n=0; for(const q of c){ if(n>=per) break; if(T.some(o=>Math.abs(o.x-q.x)<TS*3.5&&Math.abs(o.y-q.y)<TS*3.5)) continue; T.push(q); n++; } }
  I._torV=kv; return I._tor=T; }
function torchSpr(f){ return tSpr('torch'+f, ()=>{ const S=PS(9,15), W2=cIR(['#3a2412','#6a4424']), IR=cI('#2a2a30'), FL=cIR(['#c8401c','#ff8a3c','#ffd070','#fff4c0']), hh=[5,6,4][f], sw=[0,1,-1][f];
  for(let y=8;y<=12;y++){ psP(S,4,y,W2[1]); psP(S,5,y,W2[0]); } for(let x=3;x<=6;x++) psP(S,x,11,IR); psP(S,3,10,IR); psP(S,6,10,IR);
  for(let j=0;j<hh;j++){ const t=j/hh, wd=t<0.3?1:t<0.75?1:0, x=4+Math.round(sw*t); for(let q=-wd;q<=wd;q++) psP(S,x+q,7-j,Math.abs(q)===wd&&wd>0?FL[0]:t<0.35?FL[2]:t<0.7?FL[1]:FL[0]); }
  psP(S,4,7,FL[3]); psP(S,4,6,FL[3]); return psCv(psOut(S,cI('#140a04'),false),4,12); }); }
function drawTorches(){ for(const t of caveTorches()){ if(!islOnScr(t.x,t.y,20)) continue; const [x,y]=iwp(t.x,t.y), o=torchSpr(Math.floor(itime*8+t.ph)%3); pctx.drawImage(o.cv,x-o.ax,y-o.ay); } }
/* ---- AMBIENT LIFE ---- */
let iamb=[];
const AMB_N={};
const AMB_B={   // per biome: [kind, per second, cap, when (0 always · 1 by day · 2 at night)] · lf: its leaves' colours
  tropic:{lf:['#3e8a3a','#5ea84a','#2e6a30','#8ac050'], e:[['lf',0.9,6,0],['pl',1.2,12,1],['bf',0.25,3,1],['gu',0.1,1,1],['ff',4,11,2]]},
  savanna:{lf:['#c8a860','#a88a48','#e0c880'], e:[['lf',0.6,5,0],['dm',1.5,14,1],['dv',0.08,1,1],['ff',3,8,2]]},
  moor:{lf:['#9a64b8','#7a8a5a','#c08ad8'], e:[['lf',0.5,4,0],['mi',0.2,4,0],['ff',3,9,2]]},
  ember:{lf:['#c8602a','#d8823a','#a83a24','#e0a040','#b8862e'], e:[['lf',3.2,16,0],['ff',4,11,2]]},
  atoll:{e:[['gu',0.16,2,1],['sp',2.4,30,0],['pl',0.5,6,1],['ff',2,6,2]]},
  meadow:{lf:['#f4b4c8','#ffffff','#f08aa6','#c9a6ff'], e:[['lf',0.8,6,0],['pl',2,18,1],['bf',0.35,5,1],['ff',5,12,2]]},
  boulder:{lf:['#7a8a5a','#9a9a6a'], e:[['lf',0.4,4,0],['dm',1,10,0],['ff',3,8,2]]},
  frost:{e:[['sn',24,70,0],['ff',2,6,2]], breath:1},
  scorch:{e:[['em',8,30,0],['ff',1.5,4,2]], shimmer:1},
  crystal:{e:[['mo',3,16,0],['ff',2,6,2]]},
  // the newer shores (w1): the mire's mist, frogs & a swarm of fireflies · the dunes' blowing sand & heat haze · falling bamboo leaves · the grove's drifting glow-spores · the caldera's ash, embers & smoke
  swamp:{lf:['#4a6a34','#6a7a3a','#8a9a5a'], e:[['mi',0.35,6,0],['fr',0.9,5,0],['lf',0.3,3,0],['ff',7,16,2]]},
  dunes:{e:[['bs',7,44,0],['hz',2.2,10,1],['dv',0.1,1,1],['ff',1,3,2]]},
  bamboo:{lf:['#7aa83a','#a0c85a','#5a8a2a','#c8d870'], e:[['lf',2.6,16,0],['pl',0.7,8,1],['bf',0.2,2,1],['ff',4,10,2]]},
  mushroom:{mo:['#c9a6ff','#e8c0ff','#ff9ad8','#e8ff8a'], e:[['mo',5,26,0],['ff',2,6,2]]},
  volcanic:{e:[['as',12,56,0],['em',7,28,0],['sm',0.7,6,0],['ff',0.8,3,2]], shimmer:1},
  _cave:{e:[['ff',3,10,0],['dr',0.9,5,0],['dm',2,14,0]]} };
let breathT=0;
function ambShore(){ const T=ISL._T; if(!T) return null; let C=null, n=0; for(const q of TERR_VIS) if(q.sh && Math.random()<1/(++n)) C=q; if(!C) return null;   // a random bit of the visible surf line
  const L=C.sh, i=Math.floor(Math.random()*(L.length/4))*4; return [(C.X+L[i]+0.5)/T.s,(C.Y+L[i+1]+0.5)/T.s]; }
function ambLavaPt(){ const T=ISL._T; if(!T) return null; let C=null, n=0; for(const q of TERR_VIS) if(q.lv && q.gl && Math.random()<1/(++n)) C=q; if(!C) return null;   // a random glowing point on the visible lava (the caldera's embers & smoke rise off it)
  const L=C.gl; for(let tr=0;tr<6;tr++){ const i=Math.floor(Math.random()*(L.length/3))*3; if(L[i+2]===5) return [(C.X+L[i]+0.5)/T.s,(C.Y+L[i+1]+0.5)/T.s]; } return null; }
function ambSpawn(k,B,cx,cy,vw,vh){ const R=Math.random, q={k, x:cx+(R()-0.5)*vw, y:cy+(R()-0.5)*vh, vx:0, vy:0, z:0, vz:0, t:0, life:5, ph:R()*TAU, a:1, c:null, r:0};
  switch(k){
    case 'lf': q.y=cy-vh*0.55; q.vx=6+R()*9; q.vy=11+R()*9; q.life=40; q.c=B.lf[(R()*B.lf.length)|0]; break;          // a leaf (a petal on the meadow) drifting down
    case 'pl': q.vx=3+R()*4; q.vy=(R()-0.5)*3; q.life=4+R()*4; break;                                                  // pollen, adrift in the sun
    case 'bf': if(!islWalk(q.x,q.y)) return; q.life=10+R()*8; q.c=['#f4a0c8','#fff0a0','#a8d8ff','#ffffff','#ffb870'][(R()*5)|0]; q.a=R()*TAU; q.z=6+R()*7; break;   // a butterfly
    case 'ff': q.x=cx+(R()-0.5)*vw*0.9; q.y=cy+(R()-0.5)*vh*0.9; if(!islWalk(q.x,q.y)) return; q.life=30+R()*30; q.a=R()*TAU; q.c=ISL.cave?'#9fe8ff':ISL.biome.key==='frost'?'#cfefff':'#d8ff8a'; break;   // fireflies (ice wisps on the frost · glow-worms below)
    case 'sn': q.y=R()<0.6?cy-vh*0.55-R()*10:cy+(R()-0.5)*vh; q.vy=10+R()*10; q.vx=4+R()*4; q.life=30; q.z=R()<0.15?1.6:1; break;   // snow (a few big near flakes)
    case 'em': { const L=ihaz.length&&R()<0.65?ihaz[(R()*ihaz.length)|0]:null; if(L && islOnScr(L.x,L.y,30)){ q.x=L.x+(R()-0.5)*16; q.y=L.y+(R()-0.5)*8; } else if(B.shimmer && R()<0.8){ const p=ambLavaPt(); if(p){ q.x=p[0]+(R()-0.5)*10; q.y=p[1]; } } q.vy=-(12+R()*16); q.vx=(R()-0.5)*6; q.life=1.4+R()*1.8; break; }   // embers rising (most off the lava — the caldera's off its rivers)
    case 'mo': q.vx=(R()-0.5)*5; q.vy=(R()-0.5)*5-1; q.life=5+R()*4; q.c=B.mo?B.mo[(R()*B.mo.length)|0]:(R()<0.6?'#8de9ff':'#c9a6ff'); q.a=0; break;       // crystal motes (the grove's glow-spores)
    case 'fr': { let ok=false; for(let tr=0;tr<4 && !ok;tr++){ q.x=cx+(R()-0.5)*vw*0.9; q.y=cy+(R()-0.5)*vh*0.9; ok=bogAt(q.x,q.y)||islTile(q.x,q.y)===W_WATER; } if(!ok) return; q.life=1.4; q.vx=(R()<0.5?-1:1)*(8+R()*6); break; }   // a frog plops into a bog pool: a hop, a splash, the rings
    case 'bs': { const G=ISL.gust, ga=G&&G.st!=='idle'?G.a:wind.a, ca=Math.cos(ga), sa=Math.sin(ga), sp=(G&&G.st==='on'?150:80)+R()*50; q.x=cx-ca*(vw*0.6)+(R()-0.5)*vw*Math.abs(sa)*1.2; q.y=cy-sa*(vh*0.6)+(R()-0.5)*vh*Math.abs(ca)*1.2;   // blowing sand, streaming downwind (a gust: thick & fast)
      q.vx=ca*sp; q.vy=sa*sp+(R()-0.5)*8; q.life=(vw*1.3)/sp; q.a=(G&&G.st==='on'?0.55:0.3)+R()*0.25; q.c=R()<0.55?'#fff0c8':'#a88450'; break; }
    case 'hz': if(!islWalk(q.x,q.y)) return; q.life=1.6+R()*0.8; q.r=6+R()*7; break;                                     // heat shimmer off the sand
    case 'as': q.y=R()<0.6?cy-vh*0.55-R()*10:cy+(R()-0.5)*vh; q.vy=6+R()*6; q.vx=3+R()*5; q.life=34; q.z=R()<0.06?2:1; break;   // ash sifting down (the odd one still glowing)
    case 'sm': { const p=ambLavaPt(); if(p){ q.x=p[0]; q.y=p[1]; } else if(!islWalk(q.x,q.y)) return; q.vy=-(6+R()*5); q.vx=1.5+R()*3; q.life=5+R()*2; q.r=6; break; }   // smoke curling up off the lava
    case 'gu': { const fl=R()<0.5; q.x=cx+(fl?-1:1)*(vw*0.6+20); q.y=cy+(R()-0.5)*vh*0.8; q.vx=(fl?1:-1)*(55+R()*25); q.vy=(R()-0.5)*20; q.life=12; break; }   // a gull's shadow sweeps over
    case 'sp': { const p=ambShore(); if(!p) return; for(let i=0;i<4;i++){ iamb.push({k:'sp', x:p[0]+(R()-0.5)*6, y:p[1]+(R()-0.5)*4, vx:(R()-0.5)*16, vy:(R()-0.5)*6, z:0, vz:24+R()*34, t:0, life:2, ph:0, a:1, c:null, r:0}); } return; }   // spray off the surf
    case 'dv': q.x=cx+(R()-0.5)*vw*0.7; if(!islWalk(q.x,q.y)) return; q.vx=(R()<0.5?-1:1)*(14+R()*10); q.vy=(R()-0.5)*8; q.life=5+R()*3; break;   // a dust devil
    case 'dm': q.vx=2+R()*3; q.vy=(R()-0.5)*2; q.life=5+R()*5; break;                                                   // dust motes
    case 'mi': q.x=cx-vw*0.6-30; q.vx=5+R()*5; q.life=(vw*1.2+60)/q.vx; q.r=26+R()*20; break;                          // a wisp of moor mist
    case 'dr': if(!islWalk(q.x,q.y)) return; q.z=44+R()*20; q.life=3; break;                                          // a drip from the roof
    case 'rp': if(!islWalk(q.x,q.y)) return; q.life=0.38; break;                                                         // a raindrop's ripple
    case 'gm': q.x=flagX()-8+(R()-0.5)*30; q.y=flagY()-R()*80; q.vy=-(5+R()*9); q.vx=(R()-0.5)*4; q.life=1.3+R()*1.2; break;   // gold motes in the claim's shaft
  }
  iamb.push(q); }
function updAmb(dt){ const s=islScale(), vw=IW/s, vh=IH/s, cx=icamX, cy=icamY, CV=!!ISL.cave, B=CV?AMB_B._cave:(AMB_B[ISL.biome.key]||AMB_B.tropic), nk=CV?1:nightK(), day=nk<0.35 && env.storm<0.3 && env.drizzle<0.45, night=nk>0.3, K=ITUNE.ambLife, N=AMB_N, R=Math.random;
  for(const k in N) N[k]=0; for(const q of iamb) N[q.k]=(N[q.k]||0)+1;
  if(K>0){ for(const e of B.e){ const k=e[0]; if((e[3]===1&&!day)||(e[3]===2&&!night)) continue; if((N[k]||0)>=Math.round(e[2]*K)) continue; if(R()<e[1]*K*dt) ambSpawn(k,B,cx,cy,vw,vh); }
    if(!CV && (env.storm>0.2||env.drizzle>0.3) && (N.rp||0)<30*K && R()<(env.storm*38+env.drizzle*14)*K*dt*2) ambSpawn('rp',B,cx,cy,vw,vh);
    if(B.breath && (breathT-=dt)<=0){ breathT=1.2+R()*0.5; const fa=Math.atan2(player.fy,player.fx), fx=Math.cos(fa), fy=Math.sin(fa);   // your breath fogs in the frost
      for(let i=0;i<3;i++) iamb.push({k:'br', x:player.x+fx*player.r*1.1+(R()-0.5)*3, y:player.y+fy*player.r*1.1-4, vx:fx*(6+R()*5)+(R()-0.5)*3, vy:fy*4-3-R()*3, z:0, vz:0, t:-i*0.07, life:0.9, ph:0, a:1, c:null, r:0}); }
    if(iflag && iflag.t>0.3 && iflag.t<1.4+ITUNE.claimHold+0.6 && (N.gm||0)<34 && R()<22*dt) ambSpawn('gm',B,cx,cy,vw,vh); }
  for(let i=iamb.length-1;i>=0;i--){ const q=iamb[i]; q.t+=dt; let dead=q.t>=q.life;
    switch(q.k){
      case 'lf': q.ph+=dt*2.2; q.x+=(q.vx+Math.sin(q.ph)*9)*dt; q.y+=q.vy*dt; if(q.y>cy+vh*0.6+20) dead=true; break;
      case 'pl': q.x+=q.vx*dt; q.y+=q.vy*dt+Math.sin(q.t*2+q.ph)*2*dt; break;
      case 'bf': { if(!day && q.life>q.t+1.5) q.life=q.t+1.5; const dx=q.x-player.x, dy=q.y-player.y; if(dx*dx+dy*dy<38*38) q.a=Math.atan2(dy,dx)+(R()-0.5)*0.6; else q.a+=(R()-0.5)*4*dt; q.x+=Math.cos(q.a)*22*dt; q.y+=Math.sin(q.a)*22*dt; q.ph+=dt*15; break; }
      case 'ff': q.a+=(R()-0.5)*3.4*dt; q.ph+=dt*5; q.x+=Math.cos(q.a)*13*dt; q.y+=Math.sin(q.a)*13*dt; if(!night) dead=true; break;
      case 'sn': q.ph+=dt*1.6; q.x+=(q.vx+Math.sin(q.ph)*6)*dt*q.z; q.y+=q.vy*dt*q.z; if(q.y>cy+vh*0.6+10) dead=true; break;
      case 'em': q.x+=(q.vx+Math.sin(q.t*5+q.ph)*6)*dt; q.y+=q.vy*dt; break;
      case 'mo': q.x+=q.vx*dt; q.y+=q.vy*dt; q.a=clamp(Math.min(q.t,q.life-q.t)/1.2,0,1); break;
      case 'fr': if(q.t<0.35) q.x+=q.vx*dt; break;
      case 'bs': q.x+=q.vx*dt; q.y+=q.vy*dt; break;
      case 'hz': q.y-=6*dt; break;
      case 'as': q.ph+=dt*1.2; q.x+=(q.vx+Math.sin(q.ph)*4)*dt; q.y+=q.vy*dt; if(q.y>cy+vh*0.6+10) dead=true; break;
      case 'sm': q.x+=q.vx*dt; q.y+=q.vy*dt; q.r=6+q.t*4; break;
      case 'gu': q.x+=q.vx*dt; q.y+=q.vy*dt; q.ph+=dt*6; break;
      case 'sp': q.x+=q.vx*dt; q.y+=q.vy*dt; q.z+=q.vz*dt; q.vz-=110*dt; if(q.z<0) dead=true; break;
      case 'dv': q.x+=q.vx*dt; q.y+=q.vy*dt; if(!islWalk(q.x,q.y)) q.life=Math.min(q.life,q.t+0.6); if((N.du||0)<40 && R()<34*dt){ iamb.push({k:'du', x:q.x, y:q.y, cx:q.x, cy:q.y, vx:q.vx, vy:q.vy, z:0, vz:18+R()*16, t:0, life:0.9+R()*0.5, ph:0, a:R()*TAU, c:R()<0.5?'#d8c090':'#b89a68', r:0}); N.du=(N.du||0)+1; } break;
      case 'du': q.a+=7*dt; q.cx+=q.vx*dt; q.cy+=q.vy*dt; q.z+=q.vz*dt; { const rr=3+q.z*0.35; q.x=q.cx+Math.cos(q.a)*rr; q.y=q.cy+Math.sin(q.a)*rr*0.45; } break;
      case 'dm': q.x+=q.vx*dt; q.y+=q.vy*dt+Math.sin(q.t+q.ph)*1.5*dt; break;
      case 'mi': q.x+=q.vx*dt; break;
      case 'dr': if(q.z>0){ q.vz-=160*dt; q.z=Math.max(0,q.z+q.vz*dt); if(q.z<=0) q.r=q.t; } else if(q.t-q.r>0.35) dead=true; break;
      case 'gm': case 'br': q.x+=q.vx*dt; q.y+=q.vy*dt; break; }
    if(!dead && q.k!=='mi' && q.k!=='gu' && q.k!=='bs' && (Math.abs(q.x-cx)>vw*0.75+40 || Math.abs(q.y-cy)>vh*0.75+40)) dead=true;
    if(dead){ iamb[i]=iamb[iamb.length-1]; iamb.pop(); } } }
/* under the actors: ripples, a gull's passing shadow, a drip's splash · the rest drifts over them (ambAir) · what glows, after the dark (ambGlow) */
function ambGround(){ if(!iamb.length) return; for(const q of iamb){ const k=q.k; if(k!=='rp'&&k!=='gu'&&!(k==='dr'&&q.z<=0)&&k!=='dv'&&k!=='fr') continue; const [x,y]=iwp(q.x,q.y);
    if(k==='fr'){ const hop=q.t<0.35, p=clamp((q.t-0.35)/(q.life-0.35),0,1);                                      // a frog: a green hop, then a splash & its rings
      if(hop){ const z=Math.round(Math.sin(q.t/0.35*Math.PI)*4); pctx.globalAlpha=1; pctx.fillStyle='#1a2a10'; pctx.fillRect(x-1,y-z-1,3,3); pctx.fillStyle='#6ac83e'; pctx.fillRect(x-1,y-z-1,2,2); pctx.fillStyle='#f0f8e0'; pctx.fillRect(x+(q.vx>0?0:-1),y-z-1,1,1); }
      else { const rr=1+Math.round(p*4); pctx.globalAlpha=(1-p)*0.75; pctx.fillStyle='#b8d8a8'; pctx.fillRect(x-rr,y,1,1); pctx.fillRect(x+rr,y,1,1); pctx.fillRect(x,y-Math.max(1,rr>>1),1,1); pctx.fillRect(x,y+Math.max(1,rr>>1),1,1); if(rr>2){ pctx.fillRect(x-rr+1,y-1,1,1); pctx.fillRect(x+rr-1,y+1,1,1); pctx.fillRect(x-rr+1,y+1,1,1); pctx.fillRect(x+rr-1,y-1,1,1); } }
      continue; }
    if(k==='rp'||k==='dr'){ const p=clamp((k==='dr'?q.t-q.r:q.t)/(k==='dr'?0.35:q.life),0,1), rr=1+Math.round(p*2.4); pctx.globalAlpha=(1-p)*0.7; pctx.fillStyle=k==='dr'?'#bfe4ff':'#dce8f8';
      pctx.fillRect(x-rr,y,1,1); pctx.fillRect(x+rr,y,1,1); pctx.fillRect(x,y-Math.max(1,rr>>1),1,1); pctx.fillRect(x,y+Math.max(1,rr>>1),1,1); if(rr>2){ pctx.fillRect(x-rr+1,y-1,1,1); pctx.fillRect(x+rr-1,y+1,1,1); } }
    else if(k==='gu'){ const f=Math.floor(q.ph)%2, d=q.vx>0?1:-1; pctx.globalAlpha=0.3; pctx.fillStyle='#000a14';   // a gull's shadow: wings beating (up — a gull 'M' · down — flat, tips dipped), its head leading
      pctx.fillRect(x-1,y,3,2); pctx.fillRect(x+d*2,y,1,1);
      if(f){ pctx.fillRect(x-4,y-1,3,1); pctx.fillRect(x+2,y-1,3,1); pctx.fillRect(x-6,y-2,2,1); pctx.fillRect(x+5,y-2,2,1); pctx.fillRect(x-7,y-3,1,1); pctx.fillRect(x+7,y-3,1,1); }
      else { pctx.fillRect(x-6,y,5,1); pctx.fillRect(x+2,y,5,1); pctx.fillRect(x-7,y+1,1,1); pctx.fillRect(x+7,y+1,1,1); } }
    else if(k==='dv'){ pctx.globalAlpha=0.18; pctx.fillStyle='#6a5030'; pctx.fillRect(x-3,y,7,1); pctx.fillRect(x-2,y+1,5,1); } }
  pctx.globalAlpha=1; }
function ambAir(){ const s=islScale();
  if(!ISL.cave && (AMB_B[ISL.biome.key]||{}).shimmer && ITUNE.ambLife>0){ let n=0;                                  // heat haze: wavering bands of hot air rise off the lava (drawn — a canvas read back mid-frame costs a whole flush)
    pctx.globalCompositeOperation='lighter'; pctx.fillStyle='#ffc48c';
    const hz=(sx,sy,hot,ph)=>{ const L=Math.round((hot?13:8)*s); for(let k=0;k<3;k++){ const p=(itime*0.7+k/3+ph)%1, y=Math.round(sy-3-p*(hot?26:17)*s); pctx.globalAlpha=Math.sin(p*Math.PI)*(hot?0.2:0.12);
        for(let i=-L;i<=L;i++) pctx.fillRect(sx+i, y+Math.round(Math.sin(i*0.6+itime*6+k*2.1)*0.9), 1, 1); } };
    for(const h of ihaz){ if(h.rock || n>=6 || !islOnScr(h.x,h.y,20)) continue; n++; const [sx,sy]=iwp(h.x,h.y); hz(sx,sy,h.st!=='idle',h.x*0.013); }
    if(ISL._T){ const s2=ISL._T.s, ox=Math.round(IW/2-icamX*s2), oy=Math.round(IH/2-icamY*s2);   // (the caldera: haze off its lava rivers)
      for(const C of TERR_VIS){ if(!C.lv || !C.gl || n>=10) continue; const L=C.gl; for(let i=0;i<L.length && n<10;i+=3){ if(L[i+2]!==5 || ((C.X+L[i])*5+(C.Y+L[i+1]))%4) continue; const x=C.X+L[i]+ox, y=C.Y+L[i+1]+oy; if(x<0||y<0||x>IW||y>IH) continue; n++; hz(x,y,false,(C.X+L[i])*0.013); } } }
    pctx.globalAlpha=1; pctx.globalCompositeOperation='source-over'; }
  if(!iamb.length) return;
  for(const q of iamb){ const k=q.k; if(k==='rp'||k==='gu'||k==='dv'||k==='fr') continue; const [x0,y0]=iwp(q.x,q.y);
    switch(k){
      case 'lf': pctx.globalAlpha=0.9; pctx.fillStyle=q.c; if(Math.sin(q.ph)>0) pctx.fillRect(x0,y0,2,1); else pctx.fillRect(x0,y0,1,2); break;
      case 'pl': { const a=clamp(Math.min(q.t,q.life-q.t)/0.8,0,1)*(0.55+0.45*Math.sin(q.t*6+q.ph)); pctx.globalAlpha=a; pctx.fillStyle='#fff4b0'; pctx.fillRect(x0,y0,1,1); break; }
      case 'bf': { const y=y0-Math.round(q.z+Math.sin(q.ph*0.5)*1.5), op=Math.floor(q.ph)%2; pctx.globalAlpha=0.24; pctx.fillStyle='#000a10'; pctx.fillRect(x0-1,y0,op?3:1,1); pctx.globalAlpha=1;   // a butterfly: wings open (upper & lower) / folded up — its shadow on the grass
        pctx.globalAlpha=clamp((q.life-q.t)/0.8,0,1)*clamp(q.t/0.5,0,1);
        if(op){ pctx.fillStyle=q.c; pctx.fillRect(x0-3,y-2,3,2); pctx.fillRect(x0+1,y-2,3,2); pctx.fillRect(x0-2,y,2,1); pctx.fillRect(x0+1,y,2,1); pctx.fillStyle='#ffffff'; pctx.fillRect(x0-3,y-2,1,1); pctx.fillRect(x0+3,y-2,1,1); }
        else { pctx.fillStyle=q.c; pctx.fillRect(x0-1,y-3,1,3); pctx.fillRect(x0+1,y-3,1,3); }
        pctx.fillStyle='#24160c'; pctx.fillRect(x0,y-2,1,3); break; }
      case 'ff': pctx.globalAlpha=0.5+0.5*Math.sin(q.ph); pctx.fillStyle=q.c; pctx.fillRect(x0,y0,1,1); break;
      case 'sn': pctx.globalAlpha=0.9; pctx.fillStyle=q.z>1?'#ffffff':'#e4eef8'; pctx.fillRect(x0,y0,q.z>1?2:1,q.z>1?2:1); break;
      case 'em': { const p=q.t/q.life; pctx.globalAlpha=1-p*0.6; pctx.fillStyle=p<0.3?'#fff0a0':p<0.65?'#ffa040':'#c8401c'; pctx.fillRect(x0,y0,1,1); break; }
      case 'mo': pctx.globalAlpha=q.a*(0.5+0.5*Math.sin(q.t*5+q.ph)); pctx.fillStyle=q.c; pctx.fillRect(x0,y0,1,1); break;
      case 'sp': pctx.globalAlpha=0.85; pctx.fillStyle='#f4fbff'; pctx.fillRect(x0,y0-Math.round(q.z*s),1,1); break;
      case 'du': { const w=q.z<10?2:1; pctx.globalAlpha=0.85*(1-q.t/q.life); pctx.fillStyle=q.c; pctx.fillRect(x0,y0-Math.round(q.z*s),w,1); break; }   // (low in the whirl: a thicker swirl of grit)
      case 'dm': { const d=ISL.cave?Math.hypot(q.x-player.x,q.y-player.y):0; pctx.globalAlpha=(ISL.cave?0.55*clamp(1-d/(LGT.lr*0.8),0,1):0.4)*clamp(Math.min(q.t,q.life-q.t),0,1); if(pctx.globalAlpha<0.02) break; pctx.fillStyle='#ece4cc'; pctx.fillRect(x0,y0,1,1); break; }   // (below: seen only in your light)
      case 'mi': { const o=lStamp(Math.round(q.r*s),5,0.3), a=clamp(Math.min(q.t,q.life-q.t)/3,0,1); pctx.globalAlpha=0.13*a; pctx.drawImage(o.cv,x0-o.R,y0-o.R); break; }
      case 'bs': { const big=q.a>0.5, L=big?9:4, sp=Math.hypot(q.vx,q.vy)||1, ux=q.vx/sp, uy=q.vy/sp; pctx.globalAlpha=Math.min(1,q.a*1.25)*clamp(Math.min(q.t,q.life-q.t)*4,0,1); pctx.fillStyle=q.c; for(let i=0;i<L;i++){ const X=Math.round(x0-ux*i), Y=Math.round(y0-uy*i); pctx.fillRect(X,Y,1,1); if(big && i<L-3) pctx.fillRect(X,Y+1,1,1); } break; }   // (a gust's streaks run long & thick)
      case 'hz': { const p=q.t/q.life, L=Math.round(q.r*s); pctx.globalCompositeOperation='lighter'; pctx.globalAlpha=Math.sin(p*Math.PI)*0.1; pctx.fillStyle='#ffe6b0'; for(let i=-L;i<=L;i++) pctx.fillRect(x0+i, y0+Math.round(Math.sin(i*0.55+itime*6+q.ph)*0.9), 1, 1); pctx.globalCompositeOperation='source-over'; break; }
      case 'as': pctx.globalAlpha=0.85; pctx.fillStyle=q.z>1?(Math.sin(q.t*7+q.ph)>0?'#ff9a40':'#c8501c'):(q.ph%2>1?'#9a948e':'#6e6862'); pctx.fillRect(x0,y0,1,1); if(q.z<=1 && (q.ph*3)%2>1.4) pctx.fillRect(x0+1,y0,1,1); break;
      case 'sm': { const o=lStamp(Math.max(3,Math.round(q.r*s)),5,0.3), a=clamp(Math.min(q.t,q.life-q.t)/1.2,0,1); pctx.globalAlpha=0.16*a; pctx.drawImage(o.cv,x0-o.R,y0-o.R); break; }
      case 'dr': if(q.z>0){ pctx.globalAlpha=0.85; pctx.fillStyle='#a8d4f4'; pctx.fillRect(x0,y0-Math.round(q.z*s),1,2); } break;
      case 'fr': break;
      case 'gm': { const a=clamp(Math.min(q.t,q.life-q.t)/0.3,0,1); pctx.globalAlpha=a*(0.6+0.4*Math.sin(q.t*14+q.ph)); pctx.fillStyle='#ffe9a6'; pctx.fillRect(x0,y0,1,1); if(Math.sin(q.t*9+q.ph)>0.85){ pctx.fillRect(x0-1,y0,3,1); pctx.fillRect(x0,y0-1,1,3); } break; }
      case 'br': { const p=clamp(q.t/q.life,0,1); if(q.t<0) break; const w=2+Math.round(p*2); pctx.globalAlpha=0.6*(1-p); pctx.fillStyle='#f2f8ff'; pctx.fillRect(x0-(w>>1),y0-(w>>1),w,w-1); pctx.fillRect(x0-(w>>1)+1,y0-(w>>1)-1,Math.max(1,w-2),1); break; } } }
  pctx.globalAlpha=1; }
function ambGlow(k){ if(!iamb.length) return; for(const q of iamb){ const t=q.k; if(t==='as' && q.z>1){ const [x,y]=iwp(q.x,q.y); pctx.globalAlpha=k*0.9; pctx.fillStyle='#ff9a40'; pctx.fillRect(x,y,1,1); continue; } if(t!=='ff'&&t!=='em'&&t!=='mo'&&t!=='gm') continue; const [x,y]=iwp(q.x,q.y);
    const a=k*(t==='ff'?0.5+0.5*Math.sin(q.ph):t==='em'?1-q.t/q.life:t==='mo'?q.a:clamp(Math.min(q.t,q.life-q.t)/0.3,0,1)); if(a<0.03) continue;
    pctx.fillStyle=t==='ff'?q.c:t==='em'?'#ff9a40':t==='mo'?q.c:'#ffe9a6'; pctx.globalAlpha=a*0.3; pctx.fillRect(x-1,y,3,1); pctx.fillRect(x,y-1,1,3); pctx.globalAlpha=a; pctx.fillRect(x,y,1,1); }
  pctx.globalAlpha=1; }
