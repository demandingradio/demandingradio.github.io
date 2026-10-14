"use strict";
/* FILE: js/render/sea_creatures.js
The sea creatures in pixels (SEA CREATURES IN PIXELS, w2): fish schools, gulls, whales, the net, leaps and spouts, the irons,
the spoils, the Fish Log portraits and the Fish Log, and the net and hunt HUDs, all painted texel by texel and cached.
Moved verbatim from original lines 9905-10616 (build 5109cd5); loads in place, right after whaling.
Entry points: drawSchools, drawWhales, drawNet, drawSeaFx, drawIrons, drawSpoilsDrops and crGlow (frameInner), drawHuntHUD and
  drawFishHUD (drawHUD), renderFlog and flogShow (openFlog, pollPad), fishPortCv, whalePortCv and portURL (galley, market,
  fish HUD), and shared helpers used far beyond this file: h2i, scM, blitO, pxPathLine, fishSpr, fishDir, starSpr, gullSpr,
  shdSpr, puffSpr, capH, WHALE_ART, GULL_ART, portFinish, fishPortS.
Globals it owns: SCR, WDIRS, LVEC, scrFrame, scrCan, h2i, scM, psTrim, blitO, pxPathLine, FISH_ART, FA_DEF, SEA_DEEP, fishRamp,
  fishLen, fishSpr, paintFish, fishDir, rippleSpr, haloSpr, glintSpr, starSpr, GULL_ART, gullSpr, shdSpr, drawSchools,
  WHALE_ART, wProfK, W_CAP, mixI, whaleSpr, paintWhale, PWS, pwScratch, psTrimR, drawWhales, drawWhaleP, crGlow, corkSpr,
  meshPat, foamSpr, drawNet, puffSpr, splRing, dropSpr, drawSeaFx, ironSpr, drawIrons, spoilSpr, drawSpoilsDrops, PORT,
  portCv, portFinish, fishPortS, fishPortCv, whalePortS, whalePortCv, portURL, TIER_COL, renderFlog, flogShow, capH,
  netCapT, reticleCv, drawHuntHUD, drawFishHUD. (PORT and port... here mean PORTRAITS, not harbours.)
Globals it reads from elsewhere: TUNE, WTUNE, iscale, w2pix, pctx, ctx, IW, IH, CSSW, CSSH, env, time, wind, camX, camY, boat,
  schools, FISH, WHALES, whales, hunt, net, seafx, irons, seadrops, flog, the texel painter (PS, psP, psG, psOut, psCv, psDisc,
  cI, cIR, bayV, mixHex, hash2, clamp, ringSpr), the HUD pixel kit (pxPanel, pxBar, pxIcon, hudU, hudK, padGlyph, PXP),
  seaCardTop and seaCardOn, menuOpen, closeMenu, openFlog, and the vector fallbacks used when TUNE.seaPix is 0 (the ...V twins).
Load-time statements: SCR (original line 9922 (build 5109cd5)) and PORT (original line 10421 (build 5109cd5)) are plain inits;
  original line 10522 (build 5109cd5) adds a window click listener for [data-flog] buttons (only in the menu, so a click
  during load just returns). The rest are function declarations and const with pure literal initialisers.
*/
/* ============================================================ *
 *  SEA CREATURES IN PIXELS (w2) — the shoals, gulls, the net, the whales, spouts, irons & spoils,
 *  redrawn on the sea's own texel grid (mode 'sea': 1 texel = 1 buffer px of pctx at PIX_SCALE 3;
 *  the world is iscale() texels per world unit). Every look is PAINTED texel by texel with the ps*
 *  painter the crawl & the sea lands use — lit from the top-left, dithered, with the dark SNES line
 *  round it — then cached and blitted 1:1 at whole-texel positions (never rotated or scaled at draw).
 *   · fish: species × 16 headings × 3 tail-flick frames × 3 depth layers (surface · mid · deep shadow)
 *   · whales: species × WDIRS headings × pose (8 swim frames · 5 breach heights · 5 fluke-up dive
 *     steps · spent); each swim bake also yields her submerged silhouette (the deep & the breach
 *     shadow) and, for the cinderback / pale sounder / the White, a night-glow layer that crGlow()
 *     adds over the dark AFTER worldTint (like the lands' slGlow)
 *   · the rest (puffs, corks, gulls, irons, spoils, halos, ripples): small keyed sprites
 *  Caches flush when the texel changes (window size / the Zoom slider). Whale looks bake within
 *  TUNE.creatBudget ms a frame — past it a whale keeps her last look for a frame. Rendering only:
 *  every school, whale, net & hunt rule is untouched. TUNE.seaPix = 0 brings back the old vector
 *  drawing (the …V functions). The Fish Log portraits (side views) live at the end of this block.
 * ============================================================ */
const SCR={s:0, f:new Map(), w:new Map(), m:new Map(), wpx:0, bt:0, gl:[]};   // s = texels / wu the looks were baked at · f fish · w whales · m misc · wpx whale texels held · bt bake ms this frame · gl this frame's night glows
const WDIRS=48, LVEC=[-0.535,-0.663,0.642];                                   // whale headings · the light (top-left, from above)
function scrFrame(){ const s=iscale(), fz=TUNE.fishSize||1; if(SCR.s!==s){ SCR.s=s; SCR.f.clear(); SCR.w.clear(); SCR.m.clear(); SCR.wpx=0; } if(SCR.fz!==fz){ SCR.fz=fz; SCR.f.clear(); } SCR.bt=0; SCR.gl.length=0; }
function scrCan(){ return SCR.bt<(TUNE.creatBudget||2); }
function h2i(a,b){ let h=(a*374761393+b*668265263)|0; h=Math.imul(h^(h>>>13),1274126177); h^=h>>>16; return (h>>>0)/4294967296; }   // a seed-free hash: a sprite's speckle reads the same in every world
function scM(key,mk){ let o=SCR.m.get(key); if(o) return o; o=mk(); SCR.m.set(key,o); if(SCR.m.size>700){ let n=0; for(const k of SCR.m.keys()){ SCR.m.delete(k); if(++n>=120) break; } } return o; }
function psTrim(S,cx,cy,extra){ const w=S.w,h=S.h,d=S.d; let x0=w,y0=h,x1=-1,y1=-1;          // crop a painted buffer to its texels → {cv, ox, oy, w, h} (ox/oy: the top-left, from the anchor texel)
  const L=[S].concat(extra||[]); for(const Q of L){ const q=Q.d; for(let y=0;y<h;y++){ const r=y*w; for(let x=0;x<w;x++) if(q[r+x]){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } } }
  if(x1<0) return null; const cw=x1-x0+1, ch=y1-y0+1, mk=Q=>{ const c=document.createElement('canvas'); c.width=cw; c.height=ch; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(Q.d.buffer),w,h),-x0,-y0,x0,y0,cw,ch); return c; };
  const o={cv:mk(S), ox:x0-cx, oy:y0-cy, w:cw, h:ch}; if(extra) o.ex=extra.map(Q=>Q.any?mk(Q):null); return o; }
function blitO(o,X,Y){ if(o) pctx.drawImage(o.cv,X+o.ox,Y+o.oy); }
/* the texel rope: a polyline stepped texel by texel (one path of 1×1 rects, one fill) */
function pxPathLine(x0,y0,x1,y1){ x0=Math.round(x0); y0=Math.round(y0); x1=Math.round(x1); y1=Math.round(y1); const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));
  if(n>900) return; let rx=x0, ry=y0, rw=1;
  for(let i=1;i<=n;i++){ const x=Math.round(x0+(x1-x0)*i/n), y=Math.round(y0+(y1-y0)*i/n); if(y===ry && x===rx+rw){ rw++; continue; } if(y===ry && x===rx-1){ rx--; rw++; continue; } pctx.rect(rx,ry,rw,1); rx=x; ry=y; rw=1; }
  pctx.rect(rx,ry,rw,1); }

/* ---------------- FISH: the top-down swimmers ---------------- */
/* l = length (world units at 1 texel/wu) · w = half-width ÷ length · t = tail (0 forked · 1 round · 2 none · 3 whip)
   sh = a special body · mk = markings (sp = their colour) · glow = a night light (lantern lure, moonfin sheen) */
const FISH_ART={
  sardine:{l:4.6,w:0.15,t:0},                mackerel:{l:5.6,w:0.15,t:0,mk:'bars',sp:'#1c4254'}, mullet:{l:5.8,w:0.17,t:1,mk:'lines',sp:'#8a9a78'},
  herring:{l:5.2,w:0.15,t:0,mk:'lines',sp:'#5a7a9a'}, flying:{l:5.8,w:0.13,t:0,sh:'flying'},     snapper:{l:6,w:0.22,t:1,mk:'belly',sp:'#ffd0b0'},
  squid:{l:5.6,w:0.2,t:2,sh:'squid'},        bonito:{l:6.6,w:0.17,t:0,mk:'lines',sp:'#2a4a66'},   grouper:{l:7.6,w:0.27,t:1,mk:'spots',sp:'#4a5634'},
  amber:{l:7,w:0.16,t:0,mk:'stripe',sp:'#f4e0a0'}, stormer:{l:7,w:0.14,t:0,mk:'bolt',sp:'#ffffff'}, moonfin:{l:6,w:0.25,t:1,mk:'speck',sp:'#ffffff',glow:'#cfe6ff'},
  marlin:{l:13,w:0.09,t:0,sh:'marlin'},      sunfish:{l:9,w:0.42,t:1,sh:'sunfish'},              frostfin:{l:6.4,w:0.16,t:0,mk:'speck',sp:'#ffffff'},
  cinder:{l:6.6,w:0.19,t:1,mk:'spots',sp:'#5a1e08'}, bogeel:{l:10,w:0.07,t:2,sh:'eel'},           magma:{l:6.4,w:0.2,t:1,mk:'crack',sp:'#ffe070',glow:'#ff8a30'},
  prism:{l:4.2,w:0.17,t:0,mk:'stripe',sp:'#ff8ad8',glow:'#9fffe8'}, koi:{l:7.6,w:0.2,t:1,mk:'koi',sp:'#e8401a'}, lantern:{l:6,w:0.2,t:1,sh:'lantern',glow:'#7fffd8'},
  tempest:{l:11,w:0.46,t:3,sh:'ray'} };
const FA_DEF={l:5.6,w:0.16,t:0};
const SEA_DEEP='#0c3446';
function fishRamp(col,ly){ const R=[mixHex(col,'#06141e',0.82), mixHex(col,'#0a2638',0.55), mixHex(col,'#0a2638',0.28), col, mixHex(col,'#ffffff',0.45)];   // ink · back · shade · body · lit
  return R.map((c,i)=>cI(ly===1?mixHex(c,SEA_DEEP,i?0.42:0.25):c)); }
function fishLen(sp){ return Math.max(4,(FISH_ART[sp.key]||FA_DEF).l*SCR.s*(TUNE.fishSize||1)); }
function fishSpr(sp,di,fr,ly){ const i=sp._fi!=null?sp._fi:(sp._fi=Math.max(0,FISH.indexOf(sp))), key=((i*16+di)*3+fr)*3+ly; let o=SCR.f.get(key); if(o) return o;
  const t0=performance.now(); o=paintFish(sp,di,fr,ly); SCR.bt+=performance.now()-t0; if(SCR.f.size>2400) SCR.f.clear(); SCR.f.set(key,o); return o; }
function paintFish(sp,di,fr,ly){ const A=FISH_ART[sp.key]||FA_DEF, L=fishLen(sp), sh=A.sh||'', W=A.w*L*(sh==='ray'||sh==='sunfish'?1:0.8), a=di*TAU/16, dx=Math.cos(a), dy=Math.sin(a), nx=-dy, ny=dx;
  const ext=sh==='marlin'?1.35:sh==='ray'?1.25:sh==='squid'?1.1:1, R=Math.ceil(L*0.62*ext+W*1.6)+3, S=PS(R*2+1,R*2+1), P=fishRamp(sp.col,ly), FN=fishRamp(mixHex(sp.col,'#2a5a70',0.3),ly);
  const fk=[-1,0,1][fr], spC=A.sp?cI(ly===1?mixHex(A.sp,SEA_DEEP,0.42):A.sp):0, deep=ly===2, SIL=cI('#0b2c3e');
  for(let y=0;y<S.h;y++) for(let x=0;x<S.w;x++){ const px=x-R, py=y-R, al=px*dx+py*dy; let lat=px*nx+py*ny, u=(L*0.5-al)/L;
    if(sh==='eel') lat-=L*0.08*Math.sin(u*8.5+fr*2.1); else if(u>0.5) lat-=fk*L*0.15*((u-0.5)/0.5)**2;   // the tail flicks (the eel ripples her whole length)
    let hw=0, reg=0, al2=Math.abs(lat);
    if(sh==='sunfish'){ const q=((u-0.46)/0.44)**2+(lat/W)**2; if(q<=1){ reg=1; hw=W*Math.sqrt(Math.max(0.05,1-((u-0.46)/0.44)**2)); } else if(u>0.6&&u<0.8&&al2<W*1.55&&Math.abs(u-0.7)<0.05+0.02*fr) reg=2; }   // a round disc, fins out
    else if(sh==='ray'){ if(u>=0&&u<0.78){ hw=W*(u<0.36?Math.pow(u/0.36,0.8):1-(u-0.36)/0.42*0.88)*(u<0.36?1:1-0.12*fk*fk); if(al2<=hw) reg=1; } else if(u>=0.78&&u<1.25&&al2<0.6) reg=2; }   // the diamond & the whip
    else if(sh==='squid'){ if(u>=0&&u<0.62){ hw=W*(u<0.12?u/0.12*0.7:1-(u-0.12)*0.5); const fw=u<0.28?W*1.35*(1-Math.abs(u-0.14)/0.14):0; if(al2<=hw) reg=1; else if(al2<=fw) reg=2; }   // the mantle leads, its fins flaring
      else if(u>=0.62&&u<1.02){ const tx=Math.abs(lat-Math.sin(u*14+fr*1.9)*0.5); if((u<0.7&&al2<W*0.7)||(tx<0.55&&u<1.02)||(Math.abs(tx-W*0.55)<0.5&&u<0.95)) reg=2; } }   // arms trailing
    else { if(u>=0&&u<=0.8){ hw=W*(u<0.26?0.4+0.6*Math.sqrt(u/0.26):u<0.56?1:1-(u-0.56)/0.24*0.8); if(sh==='eel') hw=W*(u<0.1?0.55+4.5*u:1-(u-0.1)*0.55); if(al2<=hw) reg=1; }
      if(!reg && sh!=='eel' && u>0.76 && u<=1){ const f=(u-0.76)/0.24, tw=Math.max(0.5,W*(0.25+(A.t===0?1.45:1.1)*f)); if(al2<=tw && !(A.t===0 && f>0.55 && al2<tw*(f-0.55)/0.45*0.9)) reg=2; }   // the tail: a narrow stock, then the fork (or a round fan)
      if(!reg && sh==='marlin' && u<0 && u>-0.3 && al2<0.55) reg=3;                                                  // the bill
      if(!reg && sh==='flying' && u>0.18 && u<0.5){ const ww=W*(1+2.6*(1-Math.abs(u-0.3)/0.2)*(fr===1?0.8:1)); if(al2<=ww && al2>W*0.6) reg=2; }   // the long wing-fins
      if(!reg && sh==='lantern' && u<0 && u>-0.26 && Math.abs(lat-W*0.2)<0.6) reg=u<-0.18?4:3;                       // the lure on its stalk
      if(!reg && W>1.6 && u>0.26 && u<0.36 && al2<=W*1.35 && al2>hw) reg=2; }                                        // pectorals on the bigger fish
    if(!reg) continue;
    if(deep){ psP(S,x,y,SIL); continue; }
    if(reg===4){ psP(S,x,y,cI(A.glow||'#7fffd8')); continue; }
    if(reg===3){ psP(S,x,y,P[1]); continue; }
    const nl=reg===1&&hw>0?clamp(lat/hw,-1,1):0, sh3=(nx*nl*LVEC[0]+ny*nl*LVEC[1])+Math.sqrt(Math.max(0,1-nl*nl))*LVEC[2], dith=bayV(x,y)*0.55;
    if(reg===2){ psP(S,x,y,FN[clamp(Math.round(2.2+sh3*1.4+dith),1,4)]); continue; }
    let v=1.9+sh3*2.1+dith; if(Math.abs(nl)<0.34 && u>0.08 && u<0.74) v-=1;             // countershaded: the dark back, the lit flank
    let c=P[clamp(Math.round(v),1,4)];
    const cu=Math.floor(u*L), cn=Math.floor((nl+1)*1.6);                                   // body-space cells: markings stay put whichever way she heads
    if(A.mk==='bars' && Math.abs(nl)<0.8 && u>0.2 && u<0.72 && ((Math.floor(u*L*0.7+nl*1.2))&1)) c=spC;
    else if(A.mk==='lines' && u>0.15 && u<0.7 && Math.abs(Math.abs(nl)-0.55)<0.2) c=spC;
    else if(A.mk==='stripe' && u>0.12 && u<0.74 && Math.abs(nl)<0.3) c=spC;
    else if(A.mk==='spots' && u>0.12 && u<0.74 && h2i(cu*3+7,cn*5+sp.key.length)>0.66) c=spC;
    else if(A.mk==='speck' && u>0.1 && h2i(cu*5+1,cn*3+2)>0.8) c=spC;
    else if(A.mk==='bolt' && u>0.12 && u<0.72 && Math.abs(nl-((cu&1)?0.3:-0.3))<0.34) c=spC;
    else if(A.mk==='crack' && u>0.14 && u<0.72 && (h2i(cu,cn+11)>0.72 || Math.abs(nl-Math.sin(u*9)*0.4)<0.18)) c=spC;
    else if(A.mk==='koi' && u>0.08){ const h=h2i(Math.floor(u*L*0.5)+3,cn+17); if(h>0.52) c=spC; else if(h<0.14) c=cI('#fff4e0'); }
    if(L>=7.5 && u>0.08 && u<0.15 && Math.abs(nl)>0.72) c=P[0];                           // eyes, on the bigger fish
    psP(S,x,y,c); }
  if(!deep) psOut(S,cI(ly===1?'#0e3448':'#0a2433'),false);
  return psTrim(S,R,R); }
function fishDir(a){ return ((Math.round(a/(TAU/16))%16)+16)%16; }

/* ---- the tell: nervous water, glints, a rare school's glow, gulls ---- */
function rippleSpr(R,fr,tint){ return scM('rp'+R+'_'+fr+(tint||''), ()=>{ const ry=Math.max(2,Math.round(R*0.8)), S=PS(R*2+5,ry*2+3), C1=cI(tint?mixHex(tint,'#ffffff',0.55):'#effafd'), C2=cI(tint?mixHex(tint,'#dff4fa',0.7):'#c6e8f2');   // ruffled water: wave-glint dashes, thinning to the edge
  for(let y=1;y<S.h-1;y+=1) for(let x=1;x<S.w-3;x++){ const nx=(x-R-2)/R, ny=(y-ry-1)/ry, d=nx*nx+ny*ny; if(d>1) continue;
    const h=h2i(x*3+fr*57,y*7+R); if(h<0.02*(1-d*0.8)){ const n=h<0.007?3:2; for(let q=0;q<n;q++) psP(S,x+q,y,q===0&&d<0.45?C1:C2); x+=n+1; } }
  return psCv(S,R+2,ry+1); }); }
function haloSpr(R,col){ return scM('hl'+R+col, ()=>{ const S=PS(R*2+1,R*2+1), c=cI(col);                            // a rare school's glow: a dithered disc, densest at its heart
  for(let y=0;y<S.h;y++) for(let x=0;x<S.w;x++){ const d=Math.hypot(x-R,y-R)/R; if(d>1) continue; const th=d<0.42?1:d<0.58?0.75:d<0.78?0.5:0.25; if(bayV(x,y)+0.5<th) psP(S,x,y,c); }   // (banded like the crawl's lights: solid, then stepped dithers)
  return psCv(S,R,R); }); }
function glintSpr(R,col,fr,gold){ return scM('gs'+R+col+fr+(gold?1:0), ()=>{ const ry=Math.max(3,Math.round(R*0.8)), S=PS(R*2+1,ry*2+1), C1=cI(mixHex(col,'#ffffff',0.35)), C2=cI(col), G=cI('#ffe27a'), W=cI('#ffffff');   // glittering water: specks of her colour, thinning outward, a few flaring into little crosses
  for(let y=1;y<S.h-1;y++) for(let x=1;x<S.w-1;x++){ const nx=(x-R)/R, ny=(y-ry)/ry, d=nx*nx+ny*ny; if(d>1) continue; const h=h2i(x*5+fr*71,y*3+R*7);
    if(h<0.016*(1-d*0.8)){ const c=gold&&h<0.006?G:h<0.009?C1:C2; psP(S,x,y,c); if(h<0.0025){ psP(S,x-1,y,c); psP(S,x+1,y,c); psP(S,x,y-1,c); psP(S,x,y+1,c); psP(S,x,y,W); } } }
  return psCv(S,R,ry); }); }
function starSpr(big,col){ return scM('st'+big+col, ()=>{ const n=big?7:5, c=n>>1, S=PS(n,n), W=cI('#ffffff'), Y=cI(col);   // a four-point glint
  for(let i=0;i<n;i++){ const e=Math.abs(i-c); if(e<=c){ psP(S,i,c,e===0?W:Y); psP(S,c,i,e===0?W:Y); } } if(big){ psP(S,c-1,c-1,Y); psP(S,c+1,c+1,Y); psP(S,c+1,c-1,Y); psP(S,c-1,c+1,Y); }
  return psCv(S,c,c); }); }
const GULL_ART=[['.K.......K.','.dg.....gd.','..gg.W.gg..','...gWWWg...','....WsW....','.....s.....'],['...........','Kdgg.W.ggdK','.KggWWWggK.','....WWW....','....sWs....','.....s.....'],['...........','....WWW....','..ggWWWgg..','.dgg.W.ggd.','.K...s...K.','...........']];   // wings up · level · down (a gull from above: white body, grey mantle, black tips)
function gullSpr(f){ return scM('gl'+f, ()=>{ const A=GULL_ART[f], S=PS(11,6), P={K:cI('#1a2028'),W:cI('#fbfdff'),g:cI('#b4c0ca'),d:cI('#5a6672'),s:cI('#c8d2da')};
  for(let y=0;y<6;y++) for(let x=0;x<11;x++){ const q=A[y][x]; if(P[q]) psP(S,x,y,P[q]); } return psCv(S,5,2); }); }
function shdSpr(rx,ry){ return scM('sd'+rx+'_'+ry, ()=>{ const S=PS(rx*2+1,ry*2+1), c=cI('#051a26'); psDisc(S,rx+0.5,ry+0.5,rx+0.5,ry+0.5,(a,b,x,y)=>((x+y)&1)||a*a+b*b<0.45?c:0); return psCv(S,rx,ry); }); }   // a small dithered shadow on the water

function drawSchools(){
  if(!(TUNE.seaPix>0)) return drawSchoolsV();
  scrFrame();
  const s=SCR.s, night=env.L<0.5, dk=clamp((0.62-env.L)/0.5,0,1);
  for(const sc of schools){
    const [sx0,sy0]=w2pix(sc.x,sc.y), sx=Math.round(sx0), sy=Math.round(sy0), m=sc.r*s*1.6+24;
    if(sx<-m||sy<-m||sx>IW+m||sy>IH+m) continue;
    const sp=sc.sp, spread=sc.flee>0?1.55:1, tier=sp.tier, fast=sc.flee>0||sc.bolt>0;
    // the tell from afar: the water round a rare school glitters in her own colour (a scatter of twinkling specks — gold-flecked for the exotic)
    if(tier>=2){ const R=Math.max(6,Math.round(sc.r*1.15*s)), o=glintSpr(R,sp.col,Math.floor(time*2.6+sc.x*0.01)%3,tier>=3);
      pctx.globalAlpha=clamp((night?0.45:0.75)*(TUNE.shoalTell||1),0,1); pctx.drawImage(o.cv,sx-o.ax,sy-o.ay); }
    { const R=Math.max(4,Math.round(sc.r*0.7*s)), o=rippleSpr(R,Math.floor(time*4.5+sc.x*0.01)%3,null);   // nervous water over the shoal's heart (a few glints, flickering)
      pctx.globalAlpha=clamp((night?0.4:0.72)*(TUNE.shoalTell||1),0,1); pctx.drawImage(o.cv,sx-o.ax,sy-o.ay); }
    // the fish: the deep ones first (dark shadows), then the middle water, then the bright ones near the top
    const fT=time*(fast?15:7.5);
    for(let ly=2;ly>=0;ly--){ pctx.globalAlpha=ly===2?0.5:ly===1?0.92:1;
      for(let fi=0;fi<sc.fish.length;fi++){ const f=sc.fish[fi], fl=f.ly!=null?f.ly:(f.ly=f.ph<TAU*0.56?0:f.ph<TAU*0.84?1:2); if(fl!==ly) continue;
        const wig=Math.sin(time*3.2+f.ph)*3, rr=(f.d*spread+wig)*s, X=Math.round(sx0+Math.cos(f.a)*rr), Y=Math.round(sy0+Math.sin(f.a)*rr);
        if(X<-12||Y<-12||X>IW+12||Y>IH+12) continue;
        const o=fishSpr(sp,fishDir(sc.h+Math.sin(time*2.5+f.ph)*0.4),[0,1,2,1][(Math.floor(fT+f.ph*4))&3],ly); blitO(o,X,Y); } }
    pctx.globalAlpha=1;
    // glints: the sun catching a turning flank (by day) · a lantern's lure or a moonfin's sheen (by night)
    if(env.L>0.35 && sc.fish.length){ const g=Math.floor(time*2.4+sc.x*0.003), f=sc.fish[(h2i(g,sc.n)*sc.fish.length)|0], ph=(time*2.4+sc.x*0.003)%1;
      if(f && ph<0.45){ const rr=(f.d*spread)*s, o=starSpr(ph>0.12&&ph<0.3,tier>=3?'#ffe27a':'#dff4ff'); pctx.drawImage(o.cv,Math.round(sx0+Math.cos(f.a)*rr)-o.ax,Math.round(sy0+Math.sin(f.a)*rr)-o.ay); } }
    if(tier>=3){ for(let j=0;j<2;j++){ const ph=(time*0.9+j*0.5+sc.x*0.001)%1; if(ph>0.6) continue; const aa=j*2.4+time*0.7, o=starSpr(ph>0.2&&ph<0.4,'#ffd23f');   // an exotic school twinkles gold
      pctx.drawImage(o.cv,Math.round(sx0+Math.cos(aa)*sc.r*0.7*s)-o.ax,Math.round(sy0+Math.sin(aa)*sc.r*0.55*s)-o.ay); } }
    { const gc=(FISH_ART[sp.key]||FA_DEF).glow; if(dk>0.05 && (gc || tier>=1)){ const o=haloSpr(gc||tier>=2?2:1,gc||sp.col), a0=(gc?0.8:tier>=3?0.7:tier>=2?0.5:0.22)*dk*(TUNE.creatGlow||1)*(TUNE.shoalTell||1), st=gc||tier>=2?1:2;   // by night each fish of a rare (or lit) school carries her own small light — a drifting constellation
      for(let fi=0;fi<sc.fish.length;fi+=st){ const f=sc.fish[fi]; if(f.ly===2) continue; const wig=Math.sin(time*3.2+f.ph)*3, rr=(f.d*spread+wig)*s; SCR.gl.push(o.cv,Math.round(sx0+Math.cos(f.a)*rr)-o.ax,Math.round(sy0+Math.sin(f.a)*rr)-o.ay,a0*(0.65+0.35*Math.sin(time*2.3+f.ph*3))); } } }
    if(tier>=2 && (TUNE.gulls==null||TUNE.gulls>0)){                                          // gulls wheel over the richest schools
      for(let g=0;g<3;g++){ const ga=time*(0.7+g*0.13)+g*2.1, gr=(10+g*5)*s, gx=Math.round(sx0+Math.cos(ga)*gr), gy=Math.round(sy0-16*s+Math.sin(ga)*gr*0.5+Math.sin(time*3+g)*1.5*s);
        const sh=shdSpr(2,1); pctx.globalAlpha=0.28; pctx.drawImage(sh.cv,gx+2-sh.ax,Math.round(gy+16*s)-sh.ay); pctx.globalAlpha=1;
        const o=gullSpr([0,1,2,1][(Math.floor(time*7+g*1.7))&3]); pctx.drawImage(o.cv,gx-o.ax,gy-o.ay); } }
  }
  pctx.globalAlpha=1;
}

/* ---------------- WHALES: the leviathans, painted texel by texel ---------------- */
/* hd = head (box: the squared brow · melon: a pilot's bulb · point: a minke's rostrum · knob / u: a rorqual's flat head · callus · round)
   df = dorsal fin [from u, to u, height] (0 = none) · pec = flipper length ÷ body · pw = its width ÷ its length · sw = the flukes' span ÷ body
   the rest are marks: knob (humpback tubercles) · pleat (throat grooves, seen when she rolls) · cal (callosities) · wr (wrinkled skin)
   mot (mottle) · spot (narwhal spots) · tusk (÷ body) · crack (cinderback embers) · lights (the sounder's) · scars & irons (the White) */
const WHALE_ART={
  pilot:   {hd:'melon', df:[0.4,0.5,1.4],   pec:0.15, pw:0.22, sw:0.36},
  minke:   {hd:'point', df:[0.62,0.68,1],   pec:0.13, pw:0.2,  sw:0.33, band:'#e8f0f4', pleat:1},
  humpback:{hd:'knob',  df:[0.62,0.7,1.2],  pec:0.34, pw:0.17, sw:0.42, knob:1, pleat:1, flp:1},
  right:   {hd:'callus',df:0,               pec:0.11, pw:0.32, sw:0.4,  cal:1},
  sperm:   {hd:'box',   df:[0.58,0.66,0.8], pec:0.08, pw:0.32, sw:0.36, wr:1},
  blue:    {hd:'u',     df:[0.76,0.8,0.7],  pec:0.1,  pw:0.2,  sw:0.3,  mot:1, pleat:1},
  narwhal: {hd:'round', df:0,               pec:0.1,  pw:0.26, sw:0.4,  tusk:0.46, spot:1},
  cinder:  {hd:'round', df:[0.6,0.68,1],    pec:0.12, pw:0.24, sw:0.36, crack:1},
  sounder: {hd:'round', df:[0.62,0.68,0.8], pec:0.12, pw:0.24, sw:0.36, lights:1},
  white:   {hd:'box',   df:[0.58,0.66,0.8], pec:0.09, pw:0.32, sw:0.36, wr:1, scars:1, irons:1} };
function wProfK(u,hd){ let k=u<0.16?0.74+u*1.6:u<0.52?1:Math.max(0.14,1-(u-0.52)*1.66);          // the old spine's width profile, with each head's own brow
  if(hd==='box'){ if(u<0.34) k=1; } else if(hd==='point'){ if(u<0.22) k=0.42+u/0.22*0.58; } else if(hd==='knob'||hd==='u'){ if(u<0.16) k=0.86+u*0.88; }
  else if(hd==='melon'){ if(u<0.16) k=0.92+u*0.5; } else if(hd==='callus'){ if(u<0.16) k=0.84+u; } return k; }
const W_CAP={box:0.1, melon:1.0, point:0.5, knob:0.5, u:0.55, callus:0.62, round:0.72};
function mixI(a,b,t){ return cI(mixHex(a,b,t)); }
/* pose p: 0-7 swim frames · 8-12 breach (lifted & rolled, 1..5) · 13-17 the fluke-up dive (1..5) · 18 spent (rolled, a flipper to the sky) */
function whaleSpr(w,di,p){ const sp=w.sp, i=sp._wi!=null?sp._wi:(sp._wi=Math.max(0,WHALES.indexOf(sp))), key=(i*WDIRS+di)*19+p; let o=SCR.w.get(key);
  if(o){ if(SCR.w.size>60){ SCR.w.delete(key); SCR.w.set(key,o); } w._lk=o; return o; }                    // (LRU: a hit moves to the back)
  if(!scrCan() && w._lk && w._lk.s===SCR.s) return w._lk;                                                     // over this frame's bake budget: her last look, one frame more
  const t0=performance.now(); o=paintWhale(sp,di,p); SCR.bt+=performance.now()-t0; if(!o) return w._lk||null; o.s=SCR.s;
  SCR.w.set(key,o); SCR.wpx+=o.w*o.h; w._lk=o;
  while(SCR.wpx>(TUNE.whaleMem||6)*1e6 && SCR.w.size>8){ const k0=SCR.w.keys().next().value, q=SCR.w.get(k0); SCR.wpx-=q.w*q.h; SCR.w.delete(k0); }
  return o; }
function paintWhale(sp,di,p){ const A=WHALE_ART[sp.key]||WHALE_ART.minke, C=sp.col, s=SCR.s, hd=A.hd;
  const a=di*TAU/WDIRS, dx=Math.cos(a), dy=Math.sin(a), nx=-dy, ny=dx;
  const swim=p<8, bk=p>=8&&p<13?(p-7)/5:0, sk=p>=13&&p<18?(p-12)/5:0, spent=p===18, phi=swim?p/8*TAU:spent?1.6:0.9;
  const L=sp.len*s*(1+0.5*bk), G=sp.girth||0.26, roll=bk>0?0.3+bk*0.6:spent?0.75:0, sd=ny>=0?1:-1;
  const NU=64, SW=new Float32Array(NU+1), HW=new Float32Array(NU+1); let hwMax=0, swMax=0;
  for(let q=0;q<=NU;q++){ const u=q/NU; SW[q]=Math.sin(phi-u*2.6)*L*0.05*(0.22+u*u)*(swim?1:0.5); HW[q]=L*G*0.5*wProfK(u,hd); hwMax=Math.max(hwMax,HW[q]); swMax=Math.max(swMax,Math.abs(SW[q])); }
  const capD=Math.max(1,HW[0]*(W_CAP[hd]||0.7)), tusk=A.tusk?A.tusk*sp.len*s:0, sh=L*A.sw*0.5, pl=L*A.pec, fh=sk>0?L*A.sw*(0.35+0.8*sk):0;
  const R=Math.ceil(Math.max(L*0.34+capD+tusk, L*0.52+sh*1.1, L*0.3+pl+hwMax)+fh+6), N=R*2+1, Z=pwScratch(N), S=Z.S, D=S.d, GL=Z.GL, SI=Z.SI; GL.any=!!(A.crack||A.lights||A.scars); SI.any=swim;
  const RG=Z.RG, UA=Z.UA, NA=Z.NA;           // per texel: region (1 body · 2 flipper · 3 flukes · 4 tusk · 5 dorsal · 6 raised flukes) · u · across (−1…1)
  const ink='#07111a', RB=[mixHex(C.body,ink,0.8), mixHex(C.body,ink,0.52), mixHex(C.body,ink,0.26), C.body, C.back, mixHex(C.back,'#ffffff',0.42)].map(cI);
  const FB=A.flp?['#2a3a48','#8a9aa8','#b8c8d4','#dde8ee','#f2f8fb','#ffffff'].map(cI):[RB[0],mixI(C.fin,ink,0.5),mixI(C.fin,ink,0.25),cI(C.fin),mixI(C.fin,'#ffffff',0.25),mixI(C.fin,'#ffffff',0.45)];
  const BL=A.flp||A.pleat?[RB[0],mixI(C.det,ink,0.45),mixI(C.det,ink,0.25),cI(C.det),mixI(C.det,'#ffffff',0.4),cI('#ffffff')]:[RB[0],mixI(C.body,'#c8d0d8',0.2),mixI(C.body,'#c8d0d8',0.38),mixI(C.body,'#d8dee4',0.55),mixI(C.body,'#e8eef2',0.7),cI('#f4f8fa')];
  const DQ=0.45;                                                                                       // dither: only where two tones meet (a light hand — no checkerboard hides)
  // the spine's tail: where the flukes hang, and which way they trail
  const T0x=R-dx*0.52*L+nx*SW[NU], T0y=R-dy*0.52*L+ny*SW[NU], dSw=(SW[NU]-SW[NU-2])/(2/NU), tbx0=-dx*0.82*L+nx*dSw, tby0=-dy*0.82*L+ny*dSw, tbl=Math.hypot(tbx0,tby0)||1, tbx=tbx0/tbl, tby=tby0/tbl, tpx=-tby, tpy=tbx;
  const beat=0.85+0.15*Math.sin(phi-2.9);
  // flippers: roots on her flanks, swept back (flung wide when she breaches)
  const pu=A.knob?0.22:0.26, pq=Math.round(pu*NU), th=bk>0?0.3:spent?0.55:0.95+0.12*Math.sin(phi*0.7), PF=[];
  for(const sg of [-1,1]){ const rx=R+dx*(0.30*L-pu*0.82*L)+nx*(SW[pq]+sg*HW[pq]*0.8), ry=R+dy*(0.30*L-pu*0.82*L)+ny*(SW[pq]+sg*HW[pq]*0.8);
    PF.push(rx,ry,sg*nx*Math.cos(th)-dx*Math.sin(th),sg*ny*Math.cos(th)-dy*Math.sin(th)); }
  const fw0=Math.max(0.9,pl*A.pw*0.5), uK=1/(0.82*L), fuA=pu-0.04, fuB=pu+(pl*Math.max(Math.sin(th),0.3)+fw0*2+2)*uK;
  // the reach of this pose as a box of texels: the painter never walks the open water around her
  const ext=Math.max(hwMax+swMax, pl+HW[pq]+2, sh+swMax)+1.5, a0=-0.52*L-sh*0.8-2, a1=0.30*L+capD+tusk+1.5;
  let bx0=N, by0=N, bx1=0, by1=0; for(const [al,lt] of [[a0,-ext],[a0,ext],[a1,-ext],[a1,ext]]){ const x=R+al*dx+lt*nx, y=R+al*dy+lt*ny; if(x<bx0)bx0=x; if(x>bx1)bx1=x; if(y<by0)by0=y; if(y>by1)by1=y; }
  bx0=clamp(Math.floor(bx0)-1,1,N-2); by0=clamp(Math.floor(by0)-1,1,N-2); bx1=clamp(Math.ceil(bx1)+1,1,N-2); by1=clamp(Math.ceil(by1)+1,1,N-2);
  for(let y=by0;y<=by1;y++){ const py=y-R; let I=y*N+bx0-1;
    for(let x=bx0;x<=bx1;x++){ I++; const px=x-R, lat=px*nx+py*ny; if(lat>ext||lat<-ext) continue;
      const al=px*dx+py*dy, u=(0.30*L-al)*uK; let reg=0, nl=0, uu=u;
      if(u>=0 && u<=1){ const q=(u*NU+0.5)|0, l2=lat-SW[q], h=HW[q]; if(l2<=h && l2>=-h){ reg=1; nl=l2/h; if(A.df && u>=A.df[0] && u<=A.df[1] && Math.abs(l2)<Math.max(0.62,h*0.1)) reg=5; } }
      else if(u<0){ const dd=al-0.30*L, l2=lat-SW[0], h0=HW[0]; uu=0;
        if(hd==='box'){ if(dd<=capD && Math.abs(l2)<=h0-(dd>capD-1.2&&Math.abs(l2)>h0-1.5?1:0)){ reg=1; nl=l2/h0; } }
        else if((dd/capD)*(dd/capD)+(l2/h0)*(l2/h0)<=1){ reg=1; nl=l2/h0; }
        if(!reg && tusk && dd>capD-1 && dd<capD+tusk && Math.abs(l2+h0*0.18)<(L>40?1.05:0.62)){ reg=4; nl=dd; } }
      if(!reg && u>=fuA && u<=fuB){ for(let k=0;k<8;k+=4){ const qx=x-PF[k], qy=y-PF[k+1], t=qx*PF[k+2]+qy*PF[k+3]; if(t<0||t>pl) continue;   // a flipper
          const wv=Math.abs(-qx*PF[k+3]+qy*PF[k+2]); let fw=fw0*(1-0.55*t/pl)+(A.knob&&(((t|0)%3)===0)?0.55:0); if(t<1.2) fw+=0.5;
          if(wv<=fw){ reg=2; nl=t/pl; uu=wv/fw; break; } } }
      if(!reg && sk===0 && u>0.84){ const qx=x-T0x, qy=y-T0y, ta=qx*tbx+qy*tby, tb=qx*tpx+qy*tpy, B=Math.abs(tb)/sh;   // the flukes, flat on the water: a broad crescent, notched
        if(B<=1 && ta>-sh*0.2){ const lead=sh*(-0.16+0.4*B*B*beat), trail=B<0.14?sh*(0.06+0.12*B/0.14):sh*(0.2+0.22*B-0.12*B*B*B*B); if(ta>=lead && ta<=trail){ reg=3; nl=(ta-lead)/Math.max(1,trail-lead); uu=tb; } } }
      if(!reg) continue;
      RG[I]=reg; UA[I]=uu; NA[I]=nl;
      const dith=bayV(x,y)*DQ; let c;
      if(reg===1){ const ca=u<0?clamp((al-0.30*L)/capD,0,1):0, nlx=nl*Math.sqrt(1-ca*ca), nz=Math.sqrt(Math.max(0,1-nlx*nlx-ca*ca)), shd=(nx*nlx+dx*ca)*LVEC[0]+(ny*nlx+dy*ca)*LVEC[1]+nz*LVEC[2];
        if(roll>0 && nl*sd>1.05-roll){ let v=2.8+shd*1.4+dith; if((A.pleat||A.flp) && ((Math.abs(nl)*HW[32]*1.1)&1) && u<0.62) v-=1.2; c=BL[clamp(Math.round(v),1,5)]; }   // rolled: her pale belly (& the rorquals' throat grooves)
        else c=RB[clamp(Math.round(2.45+shd*2.4+dith),1,5)]; }
      else if(reg===5){ const sg=(lat-SW[(u*NU+0.5)|0])>=0?1:-1; c=(nx*sg*LVEC[0]+ny*sg*LVEC[1])>0?RB[4]:RB[1]; }
      else if(reg===2){ c=FB[clamp(Math.round(3+(uu>0.55?0.8:-0.5)-nl*0.9+dith),1,5)]; if(A.band && nl>0.3 && nl<0.6) c=cI(A.band); }
      else if(reg===3){ c=RB[clamp(Math.round(3.3-nl*1.6+dith),1,5)]; }
      else c=cI(((nl*0.9)&1)?'#f4eedc':'#b8ab88');
      D[I]=c; } }
  // marks on her back, laid in body space (u × across) so they ride with her whichever way she heads
  const HM=HW[24]||1;
  for(let y=by0;y<=by1;y++) for(let x=bx0;x<=bx1;x++){ const I=y*N+x; if(RG[I]!==1) continue; const u=UA[I], nl=NA[I], an=Math.abs(nl), cu=Math.floor(u*L*0.5), cn=Math.floor((nl+1)*HM*0.5);
    if(roll>0&&nl*sd>1.05-roll) continue;
    if(hd==='box'||hd==='callus' ? (u>0.02&&u<0.05&&nl>-0.55&&nl<-0.25) : (u>0.08&&u<0.11&&an<0.18)) D[I]=RB[0];                                     // the blowhole (a sperm's sits to the left of her brow)
    else if(an>0.8 && u>(hd==='box'?0.28:hd==='melon'?0.12:0.15) && u<(hd==='box'?0.31:hd==='melon'?0.15:0.18)) D[I]=RB[0];                             // her eyes, at the flanks
    else if(A.mot && u>0.06 && u<0.9 && an<0.85 && h2i(cu*7+1,cn*13+3)>0.62 && ((x+y)&1)) D[I]=cI(C.det);
    else if(A.spot && u>0.05 && an<0.9 && h2i(cu*5+2,cn*11)>0.64) D[I]=cI(C.det);
    else if(A.cal && u<0.2 && ((u<0.12&&an<0.7) || (an>0.5&&an<0.85)) && h2i(Math.floor(u*L),Math.floor((nl+1)*HM))>0.5) D[I]=cI(C.det);
    else if(A.knob && u<0.17 && an<0.75 && h2i(Math.floor(u*L*0.8),cn+5)>0.66) D[I]=cI(mixHex(C.back,'#cfdce6',0.5));
    else if(A.wr && u>0.4 && u<0.95 && an<0.8 && Math.floor(u*L*0.75+Math.sin(nl*3.2)*1.2)%3===0 && ((x^y)&1)) D[I]=RB[2]; }
  const bxy=(u,nl)=>{ const q=clamp(Math.round(u*NU),0,NU); return [R+dx*(0.30*L-u*0.82*L)+nx*(SW[q]+nl*HW[q]), R+dy*(0.30*L-u*0.82*L)+ny*(SW[q]+nl*HW[q])]; };   // body space → sprite texels
  const onB=(x,y)=>{ const X=Math.floor(x), Y=Math.floor(y); return X>=0&&Y>=0&&X<N&&Y<N&&RG[Y*N+X]===1; };
  if(A.crack){ const CO=cI('#b04818'), CC=cI('#f09040'), GO=cI('#ff5a1a'), GC=cI('#ffd070');          // the cinderback's ember cracks — dull by day, blazing through the dark (GL) · fewer on a small body
    for(let j=0,nCk=L<34?2:3;j<nCk;j++){ let [x0,y0]=bxy(0.14+j*0.05,-0.45+j*0.42); for(let k=1;k<=5;k++){ const u=0.14+j*0.05+k*0.12, nl=clamp(-0.45+j*0.42+(h2i(j*9+k,3)-0.5)*0.55,-0.8,0.8), [x1,y1]=bxy(u,nl);
        const n=Math.ceil(Math.hypot(x1-x0,y1-y0)*1.4); for(let q=0;q<=n;q++){ const xx=x0+(x1-x0)*q/n, yy=y0+(y1-y0)*q/n; if(!onB(xx,yy)) continue; psP(S,xx,yy,q%4===2?CC:CO); psP(GL,xx,yy,GC);
          for(const [ox,oy] of [[1,0],[-1,0],[0,1],[0,-1]]) if(!psG(GL,xx+ox,yy+oy) && !((Math.floor(xx+ox)+Math.floor(yy+oy)*2)&3)) psP(GL,xx+ox,yy+oy,GO); }
        x0=x1; y0=y1; } } }
  if(A.lights){ const LC=cI('#8de9ff'), LW=cI('#e8fcff'), LH=cI('#3aa8c8');                           // the sounder's ghost-lights along her flanks
    for(let j=0;j<8;j++){ const [lx,ly]=bxy(0.14+j*0.095,(j&1?0.52:-0.52)*(0.9+0.2*h2i(j,5))); if(!onB(lx,ly)) continue; psP(S,lx,ly,LW); psP(GL,lx,ly,LW);
      for(const [ox,oy] of [[1,0],[-1,0],[0,1],[0,-1]]){ if(onB(lx+ox,ly+oy)) psP(S,lx+ox,ly+oy,LC); psP(GL,lx+ox,ly+oy,LH); } } }
  if(A.scars){ const SC=cI('#6e7a86'), SH=cI('#ffffff');                                              // the White: old scars raked down his flanks
    for(let j=0;j<7;j++){ const u0=0.1+h2i(j,1)*0.7, n0=(h2i(j,2)-0.5)*1.4, [x0,y0]=bxy(u0,n0), [x1,y1]=bxy(u0+0.05+h2i(j,4)*0.06,clamp(n0+(h2i(j,3)-0.5)*0.9,-0.9,0.9)), n=Math.ceil(Math.hypot(x1-x0,y1-y0)*1.3);
      for(let q=0;q<=n;q++){ const xx=x0+(x1-x0)*q/n, yy=y0+(y1-y0)*q/n; if(!onB(xx,yy)) continue; psP(S,xx,yy,SC); if(onB(xx-1,yy-1) && !(q&1)) psP(S,xx-1,yy-1,SH); } } }
  let ironTop=0;
  if(A.irons && !sk){ const SHF=cI('#5a4630'), SHL=cI('#8a6a44'), IR=cI('#9aa6b0'), RP=cI('#d8c89c');   // …and the broken irons of the hunters who failed him, still standing in his back, their lines trailing
    for(const [u,nl,h] of [[0.34,-0.32,1],[0.47,0.3,0.85],[0.6,-0.08,0.7]]){ const [bx,by]=bxy(u,nl); if(!onB(bx,by)) continue; const hh=Math.max(4,Math.round(L*0.12*h)); ironTop=Math.max(ironTop,hh+2);
      for(let q=0;q<hh;q++){ const xx=bx+q*0.4, yy=by-q; psP(S,xx,yy,q<2?IR:SHF); if(q>=2 && q<hh-1) psP(S,xx+1,yy,SHL); }
      const tx=bx+hh*0.4, ty=by-hh; psP(S,tx+1,ty+1,RP); psP(S,tx+2,ty+2,RP); psP(S,tx+2,ty+3,RP); psP(S,tx+3,ty+4,RP); } }
  // THE FLUKE-UP: she arches, her head goes under, and the flukes rise dripping out of the sea (seen from behind as she heads away — the pale underside)
  if(sk>0){ const Wf=Math.max(2.5,L*A.sw*0.5*(0.45+0.55*Math.abs(dy))), Tx=T0x, Ty=T0y, und=dy<0, stw=Math.max(0.8,L*A.sw*0.5*0.12);
    const UP=und&&A.flp?FB:und?[RB[0],mixI(C.fin,ink,0.3),cI(C.fin),mixI(C.fin,'#ffffff',0.2),mixI(C.fin,'#ffffff',0.4),mixI(C.fin,'#ffffff',0.55)]:RB;
    for(let y=Math.floor(Ty-fh-1);y<=Math.ceil(Ty);y++) for(let x=Math.floor(Tx-Wf-1);x<=Math.ceil(Tx+Wf+1);x++){ const X=(x+0.5-Tx)/Wf, Y=(Ty-(y+0.5))/fh, aX=Math.abs(X);
      let inn=false; if(Math.abs(x+0.5-Tx)<=stw*(1-Y*0.3) && Y>=0 && Y<=0.5) inn=true;                                                            // the tail-stock, short & thick
      const lo=0.36+0.4*Math.pow(aX,1.5), hi=0.6+0.4*Math.pow(aX,0.85)-(aX<0.12?0.1*(1-aX/0.12):0); if(aX<=1 && Y>=lo && Y<=hi) inn=true;   // the two broad lobes, tips swept up, a notch between
      if(!inn || x<1||y<1||x>=N-1||y>=N-1) continue; const I=y*N+x; RG[I]=6; UA[I]=Y; NA[I]=X;
      let v=3+(X<0?0.9:-0.5)+bayV(x,y)*DQ; if(Y>hi-1.3/fh && aX>0.08) v-=2; if(und && A.flp && h2i(Math.floor(X*6)+9,Math.floor(Y*5))>0.72) v-=2.2;   // a dark trailing edge · the humpback's own markings, her fingerprint
      D[I]=UP[clamp(Math.round(v),1,5)]; } }
  // the dark line round her (walked only over the box she can fill; the rarer poses use the whole board)
  if(!swim){ const m=Math.ceil(sk>0?sh+4:bk>0?L*0.45+4:4); bx0=Math.max(1,bx0-m); bx1=Math.min(N-2,bx1+m); by0=Math.max(1,by0-m-(sk>0?Math.ceil(fh)+2:0)); by1=Math.min(N-2,by1+m); }   // (the rarer poses reach further: the raised flukes above, a breach's spray all round)
  else if(ironTop){ by0=Math.max(1,by0-ironTop); bx1=Math.min(N-2,bx1+ironTop); bx0=Math.max(1,bx0-3); by1=Math.min(N-2,by1+3); }
  { const M=Z.M, OL=RB[0]; for(let y=by0-1;y<=by1+1;y++) for(let x=bx0-1;x<=bx1+1;x++){ const I=y*N+x; if(D[I]) M[I]=1; }
    for(let y=by0;y<=by1;y++) for(let x=bx0;x<=bx1;x++){ const I=y*N+x; if(!M[I] && (M[I-1]||M[I+1]||M[I-N]||M[I+N])) D[I]=OL; } }
  // after the line: water. Sheets off a breach, drips off the raised flukes, and the sea closing over her head as she sounds
  const WA=cI('#e2f4fa'), WB=cI('#b8dcea'), SEAT=cI('#082234');
  if(sk>0){ const subU=0.1+0.62*sk;
    const SUB=Z.M; SUB.fill(0);
    for(let y=by0;y<=by1;y++) for(let x=bx0;x<=bx1;x++){ const I=y*N+x, r=RG[I]; if(!r||r===6||r===3) continue;
      const u=r===2?pu:r===4?-0.1:UA[I]; if(u<subU){ SUB[I]=1; D[I]=bayV(x,y)<-0.24?SEAT:0; } else if(u<subU+0.14 && r===1 && Math.abs(NA[I])<0.42) D[I]=RB[5]; }   // under the sea: a faint dark ghost · the arch of her back catching the light
    for(let y=by0;y<=by1;y++) for(let x=bx0;x<=bx1;x++){ const I=y*N+x; if(RG[I]||!D[I]) continue; let keep=false;                                          // her outline goes under with her (a line texel stays only beside a part still above water)
      for(const J of [I-1,I+1,I-N,I+N]) if(RG[J] && !SUB[J]){ keep=true; break; } if(!keep) D[I]=0; }
    const Tx=T0x, Ty=T0y;
    for(let y=Math.floor(Ty-fh);y<=Math.ceil(Ty+2);y++) for(let x=Math.floor(Tx-sh-2);x<=Math.ceil(Tx+sh+2);x++){ if(x<0||y<2||x>=N||y>=N) continue; const I=y*N+x; if(D[I]) continue;
      const up=RG[I-N]===6||(RG[I-2*N]===6&&h2i(x,y*3)>0.5); if(up && h2i(x*7,y)>0.45) psP(S,x,y,((y+x)&1)?WA:WB); }                             // streams off the trailing edge
    for(let j=0;j<Math.round(L*0.4);j++){ const aa=h2i(j,11)*TAU, rr=sh*0.6*(0.7+0.4*h2i(j,12)); psP(S,Tx+Math.cos(aa)*rr,Ty+Math.sin(aa)*rr*0.35,j&1?WA:WB); } }   // the ring of white where the stock leaves the sea
  if(bk>0){ for(let y=Math.max(1,by0);y<=Math.min(N-3,by1);y++) for(let x=bx0;x<=bx1;x++){ const I=y*N+x; if(RG[I]!==1||RG[I+N]===1) continue; if(h2i(x,y)>0.35){ psP(S,x,y+1,WA); if(h2i(x*3,y)>0.6) psP(S,x,y+2,WB); } }   // water sheeting off her lower edge
    const nS=Math.round(L*1.2*bk); for(let j=0;j<nS;j++){ const aa=h2i(j,21)*TAU, rr=L*(0.3+0.3*h2i(j,22)), xx=R+Math.cos(aa)*rr, yy=R+Math.sin(aa)*rr*0.8+L*0.1; if(!psG(S,xx,yy)) psP(S,xx,yy,j%3?WA:WB); } }   // spray flung round her
  // her shadow & her deep silhouette: the same shape, dithered dark (solid at her heart, stippled at the edge)
  if(swim){ const D1=cI('#08283a'), D2=cI('#0c3448'), Q=SI.d; for(let y=by0;y<=by1;y++) for(let x=bx0;x<=bx1;x++){ const I=y*N+x, r=RG[I]; if(!r) continue; if(r===1&&Math.abs(NA[I])<0.62) Q[I]=((x+y)&1)?D1:D2; else if((x+y)&1) Q[I]=D1; } }
  if(A.scars && swim){ const H1=cI('#9fb4d4'), H2=cI('#6a7e9e'), H3=cI('#3e4c66'), HB=cI('#2a3446'), G=GL.d;   // the White gleams in the dark: his pale body lifts, and a halo steps out round him (dithered thinner with each texel)
    for(let y=Math.max(3,by0-3);y<=Math.min(N-4,by1+3);y++) for(let x=Math.max(3,bx0-3);x<=Math.min(N-4,bx1+3);x++){ const I=y*N+x, g=RG[I]; if(g===1||g===2||g===3){ G[I]=HB; continue; } if(g) continue;
      let dm=4; for(let q=-3;q<=3&&dm>1;q++) for(let r=-3;r<=3;r++){ const rr=RG[I+q*N+r]; if(rr===1||rr===3){ const d=Math.max(q<0?-q:q,r<0?-r:r); if(d<dm) dm=d; } }
      const bv=bayV(x,y); if(dm===1&&bv<0.25) G[I]=H1; else if(dm===2&&bv<0) G[I]=H2; else if(dm===3&&bv<-0.25) G[I]=H3; } }
  const o=psTrimR(S,R,R,[SI,GL],[bx0-3,by0-3,bx1+3,by1+3]); if(!o) return null; o.sil=o.ex[0]; o.gl=o.ex[1]; o.ex=null; return o; }
/* the painter's scratch boards, reused bake after bake (no garbage in the hot path) */
const PWS={n:0};
function pwScratch(N){ const n=N*N; if(PWS.n<n){ PWS.n=n; PWS.bS=new Uint32Array(n); PWS.bSI=new Uint32Array(n); PWS.bGL=new Uint32Array(n); PWS.RGb=new Uint8Array(n); PWS.Mb=new Uint8Array(n); PWS.UAb=new Float32Array(n); PWS.NAb=new Float32Array(n); }
  else { PWS.bS.fill(0,0,n); PWS.bSI.fill(0,0,n); PWS.bGL.fill(0,0,n); PWS.RGb.fill(0,0,n); PWS.Mb.fill(0,0,n); }
  return {S:{w:N,h:N,d:PWS.bS.subarray(0,n)}, SI:{w:N,h:N,d:PWS.bSI.subarray(0,n)}, GL:{w:N,h:N,d:PWS.bGL.subarray(0,n)}, RG:PWS.RGb.subarray(0,n), M:PWS.Mb.subarray(0,n), UA:PWS.UAb.subarray(0,n), NA:PWS.NAb.subarray(0,n)}; }
/* crop a painted buffer to its texels, scanning only a hint rect (plus a 2-texel hem for the halo) */
function psTrimR(S,cx,cy,extra,hint){ const w=S.w,h=S.h,d=S.d; let X0=0,Y0=0,X1=w-1,Y1=h-1; if(hint){ X0=Math.max(0,hint[0]); Y0=Math.max(0,hint[1]); X1=Math.min(w-1,hint[2]); Y1=Math.min(h-1,hint[3]); }
  let x0=w,y0=h,x1=-1,y1=-1; for(let y=Y0;y<=Y1;y++){ const r=y*w; for(let x=X0;x<=X1;x++) if(d[r+x]){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } }
  if(x1<0) return null; x0=Math.max(0,x0-3); y0=Math.max(0,y0-3); x1=Math.min(w-1,x1+3); y1=Math.min(h-1,y1+3);
  const cw=x1-x0+1, ch=y1-y0+1, mk=Q=>{ const c=document.createElement('canvas'); c.width=cw; c.height=ch; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(Q.d.buffer,Q.d.byteOffset,w*h*4),w,h),-x0,-y0,x0,y0,cw,ch); return c; };
  return {cv:mk(S), ox:x0-cx, oy:y0-cy, w:cw, h:ch, ex:(extra||[]).map(Q=>Q.any?mk(Q):null)}; }
function drawWhales(){
  if(!(TUNE.seaPix>0)) return drawWhalesV();
  const s=SCR.s||iscale();
  if((SCR.warm|0)<WHALES.length && !whales.length && SCR.bt<0.4){ const sp=WHALES[SCR.warm|0], d=((SCR.warm|0)*7)%WDIRS; SCR.warm=(SCR.warm|0)+1;   // warm the painter on the first quiet sea frames (one species a frame): the first real whale never hitches
    if(SCR.warm===1) pwScratch(Math.ceil(68*1.5*s*0.75+14)*2+1);
    const t0=performance.now(); try{ const o=paintWhale(sp,d,0); if(o){ o.s=s; SCR.w.set((WHALES.indexOf(sp)*WDIRS+d)*19,o); SCR.wpx+=o.w*o.h; } }catch(e){} SCR.bt+=performance.now()-t0; }
  for(const w of whales){
    if(w.st==='gone') continue;
    const [sx,sy]=w2pix(w.x,w.y), m=w.sp.len*s+70;
    if(sx<-m||sy<-m||sx>IW+m||sy>IH+m) continue;
    drawWhaleP(w,s);
  }
}
function drawWhaleP(w,s){
  const sp=w.sp, L=sp.len, deep=clamp(w.depth,0,1), [sx0,sy0]=w2pix(w.x,w.y), X=Math.round(sx0), Y=Math.round(sy0);
  const di=((Math.round(w.a/(TAU/WDIRS))%WDIRS)+WDIRS)%WDIRS, ph=((w.swimPh%TAU)+TAU)%TAU, f=Math.floor(ph/TAU*8)&7;
  const br=w.breachK>0?Math.sin(clamp(w.breachK,0,1)*Math.PI):0, bq=Math.round(br*5), sndK=w.st==='sound'?clamp(w.t/1.4,0,1):0;
  const dirx=Math.cos(w.a), diry=Math.sin(w.a), pxn=-diry, pyn=dirx;
  const sw=whaleSpr(w,di,f); if(!sw) return;
  // the wake she leaves (a draw-side memory of where she swam: a widening, fading V of foam)
  const tr=w._tr||(w._tr=[]); if(!tr.length || time-tr[tr.length-1].t>0.14 || time<tr[tr.length-1].t){ if(tr.length>=12) tr.shift(); tr.push({x:w.x-dirx*L*0.4, y:w.y-diry*L*0.4, t:time, a:w.a}); }
  if(deep<0.3 && w.curSpd>8){ pctx.fillStyle='#e6f6fa'; pctx.beginPath();
    for(let i=0;i<tr.length;i++){ const q=tr[i], age=time-q.t; if(age>1.7||age<0) continue; const spd=(0.8+age*3.2)*L*0.06, [qx,qy]=w2pix(q.x,q.y), c=Math.cos(q.a), sn=Math.sin(q.a);
      for(const sg of [-1,1]){ if(h2i(i*2+(sg>0?1:0),Math.floor(q.t*7))>0.8-age*0.3) continue; pctx.rect(Math.round(qx-sn*sg*spd*s),Math.round(qy+c*sg*spd*s),age<0.5?2:1,1); } }
    pctx.globalAlpha=clamp(0.55-deep,0,0.55); pctx.fill(); pctx.globalAlpha=1; }
  // far down: a great dithered shadow under the blue
  if(deep>0.45){ pctx.globalAlpha=clamp(0.62-deep*0.36,0.14,0.5); pctx.drawImage(sw.sil,X+sw.ox,Y+sw.oy); pctx.globalAlpha=1; return; }
  const bodyA=clamp(1-deep*1.6,0,1);
  // her shadow on the water — it parts from her when she breaches
  { const shOff=(0.045+0.34*br)*L*s; pctx.globalAlpha=(0.3+0.12*br)*bodyA; pctx.drawImage(sw.sil,Math.round(X+sw.ox+shOff*0.45),Math.round(Y+sw.oy+shOff)); }
  if(deep>0.12){ pctx.globalAlpha=0.4; pctx.drawImage(sw.sil,X+sw.ox,Y+sw.oy); }                   // (going under: her shape stays under the fading body)
  // the body — the pose from the moment: swimming · breaching (lifted, rolled, bigger) · fluke-up · spent
  const pose=sndK>0?12+Math.max(1,Math.ceil(sndK*5)):bq>0?7+bq:(w.st==='spent'?18:f);
  const o=pose===f?sw:(whaleSpr(w,di,pose)||sw), lift=Math.round(L*0.10*br*s);
  pctx.globalAlpha=bodyA; pctx.drawImage(o.cv,X+o.ox,Y+o.oy-lift);
  if(o.gl && env.L<0.6){ const dk=clamp((0.62-env.L)/0.5,0,1)*(TUNE.creatGlow||1); if(dk>0.02) SCR.gl.push(o.gl,X+o.ox,Y+o.oy-lift,(sp.key==='white'?0.55:0.9)*dk*bodyA*(0.85+0.15*Math.sin(time*3+w.seed))); }
  // the waterline: foam fizzing along her flanks · a bow-wave when she runs · a glint of sun on her wet back
  if(deep<0.2 && br<0.3 && sndK<0.5){ pctx.fillStyle='#eef8fa'; pctx.beginPath(); const gw=L*(sp.girth||0.26)*0.5*s, hd=(WHALE_ART[sp.key]||{}).hd;
    for(let i=0;i<8;i++){ const u=i/7, along=L*(0.30-0.82*u), h2=hash2(i+((time*5)|0), w.seed&255); if(h2>0.55) continue; const sg=h2<0.27?-1:1;
      const [fx,fy]=w2pix(w.x+dirx*along,w.y+diry*along), off=gw*wProfK(u,hd)+1.2; pctx.rect(Math.round(fx+pxn*sg*off),Math.round(fy+pyn*sg*off),1,1); }
    pctx.globalAlpha=0.75*bodyA; pctx.fill(); }
  if(w.curSpd>55 && deep<0.2){ const [nx2,ny2]=w2pix(w.x+dirx*L*0.36,w.y+diry*L*0.36); pctx.fillStyle='#f0fafc'; pctx.beginPath();
    for(const sg of [-1,1]) for(let q=0;q<5;q++){ const bx=nx2-dirx*q*1.3+pxn*sg*(1+q*1.2), by=ny2-diry*q*1.3+pyn*sg*(1+q*1.2); pctx.rect(Math.round(bx),Math.round(by),1,1); }
    pctx.globalAlpha=0.75; pctx.fill(); }
  if(env.L>0.5 && deep<0.12 && br<0.2 && ((time*0.7+w.seed*0.001)%1)<0.12){ const [gx,gy]=w2pix(w.x+dirx*L*0.05,w.y+diry*L*0.05), gs=starSpr(false,'#fff8e0');
    pctx.globalAlpha=bodyA; pctx.drawImage(gs.cv,Math.round(gx-pxn*L*0.06*s)-gs.ax,Math.round(gy-pyn*L*0.06*s)-gs.ay-lift); }
  pctx.globalAlpha=1;
  if(w.ramSt===1){ const gp=0.5+0.5*Math.sin(time*18), [nx3,ny3]=w2pix(w.x+dirx*L*0.3,w.y+diry*L*0.3), rr=Math.round(L*(sp.girth||0.28)*0.5*s*1.6+gp*2);   // he turns on you — the warning ring
    const rg=ringSpr(rr,rr,'#ff5d4a'); pctx.globalAlpha=0.45+gp*0.45; pctx.drawImage(rg.cv,Math.round(nx3)-rg.ax,Math.round(ny3)-rg.ay); pctx.globalAlpha=1; }
}
/* the night glows (after worldTint, on the screen — the lands' slGlow does the same for lava & glowcaps) */
function crGlow(){ const G=SCR.gl; if(!(TUNE.seaPix>0) || !G.length || mapOpen) return; const kx=CSSW/IW, ky=CSSH/IH;
  ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.imageSmoothingEnabled=false;
  for(let i=0;i<G.length;i+=4){ const c=G[i]; ctx.globalAlpha=clamp(G[i+3],0,1); ctx.drawImage(c,G[i+1]*kx,G[i+2]*ky,c.width*kx,c.height*ky); }
  ctx.restore(); }

/* ---------------- the cork-line & the cinch ---------------- */
function corkSpr(k){ return scM('ck'+k, ()=>{ const A=k?['..K..','.KWK.','KRRrK','KRrrK','.KKK.']:['.KKK.','KWoOK','KooOK','.KKK.'], S=PS(5,A.length), P={K:cI('#2a1a0c'),W:cI('#fff4dc'),o:cI('#e8b878'),O:cI('#b07a40'),R:cI('#e04a34'),r:cI('#9a2a1e')};
  A.forEach((row,y)=>{ for(let x=0;x<5;x++){ const q=row[x]; if(P[q]) psP(S,x,y,P[q]); } }); return psCv(S,2,A.length-2); }); }
function meshPat(){ return scM('mesh', ()=>{ const c=document.createElement('canvas'); c.width=c.height=6; const g=c.getContext('2d'); g.fillStyle='#efe4c8';   // the mesh: a diamond lattice of cord, one texel wide
  for(let i=0;i<6;i++){ g.fillRect(i,i,1,1); g.fillRect(5-i,i,1,1); } return {cv:c, pat:pctx.createPattern(c,'repeat')}; }); }
function foamSpr(R,fr){ return scM('fo'+R+'_'+fr, ()=>{ const S=PS(R*2+1,R*2+1), W=cI('#f4fbfd'), B=cI('#c4e4ee');   // churned white water, fraying at its edge
  for(let y=0;y<S.h;y++) for(let x=0;x<S.w;x++){ const d=Math.hypot(x-R,y-R)/R; if(d>1) continue; const h=h2i(x*5+fr*31,y*3+R); if(h<0.62*(1-d*d)) psP(S,x,y,h<0.28?W:B); }
  return psCv(S,R,R); }); }
function drawNet(){
  if(!(TUNE.seaPix>0)) return drawNetV();
  if(!net) return;
  const s=SCR.s||iscale(), off=(x,y)=>x<-20||y<-20||x>IW+20||y>IH+20;
  if(net.phase==='lay'){
    const pts=net.pts; pctx.beginPath(); let [px0,py0]=w2pix(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++){ const [px,py]=w2pix(pts[i].x,pts[i].y); if(!(off(px,py)&&off(px0,py0))) pxPathLine(px0,py0,px,py); px0=px; py0=py; }
    { const [bx2,by2]=w2pix(boat.x-Math.cos(boat.a)*9, boat.y-Math.sin(boat.a)*9); pxPathLine(px0,py0,bx2,by2); }
    pctx.fillStyle='#d8ccae'; pctx.globalAlpha=0.8; pctx.fill(); pctx.globalAlpha=1;
    for(let i=0;i<pts.length;i+=2){ const [px,py]=w2pix(pts[i].x,pts[i].y); if(off(px,py)) continue; const o=corkSpr(i%8===0?1:0);   // corks bobbing on the swell, a red marker float every few
      pctx.drawImage(o.cv,Math.round(px)-o.ax,Math.round(py)-o.ay+(Math.sin(time*3+i)>0.35?1:0)); }
  } else {
    const k=1-clamp(net.t/net.T,0,1)*0.85, P=net.poly, cx=net.cx, cy=net.cy, Q=[];                 // the ring tightens
    for(let i=0;i<P.length;i++){ const p=P[i]; Q.push(w2pix(cx+(p.x-cx)*k, cy+(p.y-cy)*k)); }
    const [cxp,cyp]=w2pix(cx,cy), mp=meshPat();
    pctx.beginPath(); for(let i=0;i<Q.length;i++){ if(i===0) pctx.moveTo(Q[i][0],Q[i][1]); else pctx.lineTo(Q[i][0],Q[i][1]); } pctx.closePath();   // the mesh, hauled tight under the corks
    try{ mp.pat.setTransform(new DOMMatrix([1,0,0,1,Math.round(IW/2-camX*s),Math.round(IH/2-camY*s)])); }catch(e){}
    pctx.fillStyle=mp.pat; pctx.globalAlpha=0.32; pctx.fill();
    const R=Math.max(3,Math.round(26*k*s)), fo=foamSpr(R,Math.floor(time*9)%3); pctx.globalAlpha=0.55+0.15*Math.sin(time*9); pctx.drawImage(fo.cv,Math.round(cxp)-fo.ax,Math.round(cyp)-fo.ay);   // churning water inside
    pctx.globalAlpha=1;
    const nC=Math.min(net.caught.length,18);                                                          // the catch, thrashing in the purse
    for(let i=0;i<nC;i++){ const c=net.caught[i], tk=Math.floor(time*6+i*0.37), jx=(h2i(i,tk)-0.5)*3, jy=(h2i(tk,i)-0.5)*3, p=P[(i*7)%P.length], fr=0.2+0.6*h2i(i,3), [fx,fy]=w2pix(cx+(p.x-cx)*k*fr+jx, cy+(p.y-cy)*k*fr+jy);   // (spread through the purse)
      blitO(fishSpr(c.sp,(h2i(i*3,tk)*16)|0,Math.floor(time*14+i)%3,i%5===4?1:0),Math.round(fx),Math.round(fy)); }
    pctx.beginPath(); for(let i=0;i<Q.length;i++){ const a=Q[i], b=Q[(i+1)%Q.length]; pxPathLine(a[0],a[1],b[0],b[1]); }
    const tf=net.torn && net.t-net.tornT<0.6 && ((time*16)|0)&1;
    pctx.fillStyle=tf?'#ff7a5a':'#e4d8b8'; pctx.globalAlpha=0.9; pctx.fill(); pctx.globalAlpha=1;
    for(let i=0;i<Q.length;i+=2){ const o=corkSpr(i%8===0?1:0); pctx.drawImage(o.cv,Math.round(Q[i][0])-o.ax,Math.round(Q[i][1])-o.ay+(Math.sin(time*8+i)>0?1:0)); }
  }
}

/* ---------------- leaps, spouts, splashes & bubbles ---------------- */
function puffSpr(r){ return scM('pf'+r, ()=>{ const S=PS(r*2+1,r*2+1), C=cIR(['#a8cadc','#d6ecf4','#f2fafd','#ffffff']);   // a spout's crown: lit top-left, fraying at the rim
  for(let y=0;y<S.h;y++) for(let x=0;x<S.w;x++){ const nx=(x-r)/r, ny=(y-r)/r, d=Math.hypot(nx,ny); if(d>1) continue; if(d>0.62 && bayV(x,y)+0.5<(d-0.62)*2.4) continue; if(d>0.5 && h2i(x*3+r,y*5)<0.12) continue;
    const l=-(nx*0.6+ny*0.8)+bayV(x,y)*0.5; psP(S,x,y,C[l>0.45?3:l>-0.05?2:l>-0.5?1:0]); }
  return psCv(S,r,r); }); }
function splRing(rx,ry,col){ if(rx<=1&&ry<=1) return scM('pr'+col, ()=>{ const S=PS(3,3), c=cI(col); psP(S,1,0,c); psP(S,0,1,c); psP(S,2,1,c); psP(S,1,2,c); return psCv(S,1,1); }); return ringSpr(rx,ry,col); }   // a ripple ring (the smallest is four drops, not a box)
function dropSpr(k){ return scM('dp'+k, ()=>{ const S=PS(1,1); psP(S,0,0,cI(k?'#ffffff':'#d8eef6')); return psCv(S,0,0); }); }
function drawSeaFx(){
  if(!(TUNE.seaPix>0)) return drawSeaFxV();
  const s=SCR.s||iscale();
  for(const f of seafx){
    if(f.t<0) continue;
    const [sx,sy]=w2pix(f.x,f.y), pr=clamp(f.t/f.life,0,1);
    if(sx<-60||sy<-60||sx>IW+60||sy>IH+60) continue;
    if(f.k==='jump'){                                                                 // a fish in the air: an arc, its shadow on the sea, a splash at each end
      const h2=Math.sin(pr*Math.PI)*9*s, ca=Math.cos(f.a), sa=Math.sin(f.a), dx=(pr-0.5)*10*s*ca, dy=(pr-0.5)*10*s*sa;
      const sh=shdSpr(2,1); pctx.globalAlpha=0.32*(1-Math.abs(pr-0.5)); pctx.drawImage(sh.cv,Math.round(sx+dx)-sh.ax,Math.round(sy+dy)-sh.ay); pctx.globalAlpha=1;
      const vy=sa*10*s-Math.cos(pr*Math.PI)*9*s*Math.PI, X=Math.round(sx+dx), Y=Math.round(sy+dy-h2);
      if(f.sp) blitO(fishSpr(f.sp,fishDir(Math.atan2(vy,ca*10*s)),Math.floor(pr*9)%3,0),X,Y);
      else { pctx.fillStyle=f.col||'#cfe6f0'; pctx.fillRect(X-1,Y,3,1); }
      if(pr<0.22||pr>0.8){ const e=pr<0.22?-1:1, ex=Math.round(sx+e*5*s*ca), ey=Math.round(sy+e*5*s*sa), q=pr<0.22?pr/0.22:(pr-0.8)/0.2, rg=splRing(1+Math.round(q*2),1+Math.round(q*1.5),'#eef8fc');
        pctx.globalAlpha=0.8*(1-q*0.6); pctx.drawImage(rg.cv,ex-rg.ax,ey-rg.ay); pctx.fillStyle='#ffffff'; pctx.fillRect(ex-1,ey-1-Math.round(q*2),1,1); pctx.fillRect(ex+1,ey-Math.round(q*3),1,1); pctx.globalAlpha=1; }
    } else if(f.k==='spout'){                                                         // the blow — a tall bright plume you can sight from far off
      const h2=(f.big?17:11)*(f.weak?0.6:1)*s*(pr<0.22?pr/0.22:1), drift=pr*pr*10*s, wx2=Math.cos(wind.a), wy2=Math.sin(wind.a);
      const al=Math.min(1,(1.25-pr*1.25))*(f.weak?0.6:1); if(al<=0.01) continue;
      const n=Math.max(2,Math.round(h2/2)); pctx.globalAlpha=al;
      for(const [col,part] of [['#b8d6e4',0],['#f4fbfe',1],['#ffffff',2]]){ pctx.fillStyle=col; pctx.beginPath();   // the column in whole-texel slabs: shaded right, lit left
        for(let j=0;j<n;j++){ const jf=(j+1)/n, jw=Math.max(1,Math.round((0.9+jf*2.4)*s)), X=Math.round(sx+wx2*drift*jf-jw/2+Math.sin(f.t*9+j)*0.8), Y=Math.round(sy-h2*jf+wy2*drift*jf*0.4);
          if(part===0) pctx.rect(X+1,Y+1,jw,2); else if(part===1) pctx.rect(X,Y,jw,2); else pctx.rect(X,Y,1,2); }
        pctx.fill(); }
      const tx2=Math.round(sx+wx2*drift), ty2=Math.round(sy-h2+wy2*drift*0.4), pf=puffSpr(Math.max(2,Math.round((2.2+pr*4.5)*s)));
      pctx.drawImage(pf.cv,tx2-pf.ax,ty2-pf.ay);
      pctx.fillStyle='#ffffff'; pctx.beginPath();
      for(let j=0;j<5;j++){ const ja=j*1.7+f.t*2; pctx.rect(Math.round(tx2+Math.cos(ja)*(2.5+pr*6)*s),Math.round(ty2+Math.sin(ja)*(1.4+pr*3)*s),1,1); }   // spray fraying off the crown
      if(pr>0.3) for(let j=0;j<3;j++) pctx.rect(Math.round(tx2+(j-1)*2.4*s),Math.round(ty2+(2+pr*5)*s+j),1,1);                                            // …and falling beneath it
      pctx.fill(); pctx.globalAlpha=1;
    } else if(f.k==='bub'){                                                           // bubbles where she swims beneath
      const rr=1+Math.round(pr*1.6*Math.max(1,s*0.7)), rg=splRing(rr,rr,'#d6f0f8'); pctx.globalAlpha=0.6*(1-pr); pctx.drawImage(rg.cv,Math.round(sx)-rg.ax,Math.round(sy)-rg.ay); pctx.globalAlpha=1;
    } else {                                                                           // a splash: a ring spreading, and (big ones) droplets flung and falling
      const rr=Math.max(1,Math.round((1.5+pr*(f.big?9:5))*s)), rg=splRing(rr,Math.max(1,Math.round(rr*0.78)),'#eef8fc');
      pctx.globalAlpha=0.78*(1-pr); pctx.drawImage(rg.cv,Math.round(sx)-rg.ax,Math.round(sy)-rg.ay);
      if(f.big){ const r2=Math.max(1,Math.round(rr*0.55)), rg2=splRing(r2,Math.max(1,Math.round(r2*0.78)),'#ffffff'); pctx.globalAlpha=0.6*(1-pr); pctx.drawImage(rg2.cv,Math.round(sx)-rg2.ax,Math.round(sy)-rg2.ay);
        const sd=Math.floor(f.x*7+f.y*3); pctx.fillStyle='#ffffff'; pctx.beginPath(); pctx.globalAlpha=0.9*(1-pr*0.7);
        for(let j=0;j<7;j++){ const ja=j/7*TAU+h2i(sd,j)*0.8, dd=pr*(5+5*h2i(j,sd))*s, lf=Math.sin(pr*Math.PI)*(4+3*h2i(sd,j+9))*s; pctx.rect(Math.round(sx+Math.cos(ja)*dd),Math.round(sy+Math.sin(ja)*dd*0.7-lf),1,1); }
        pctx.fill(); }
      pctx.globalAlpha=1;
    }
  }
}

/* ---------------- the harpoon: irons in flight, the line, the irons fast in her ---------------- */
function ironSpr(di){ return scM('ir'+di, ()=>{ const s=SCR.s, L=Math.max(6,Math.round(7.5*s)), hl=Math.max(2,Math.round(2.2*s)), a=di*TAU/32, ux=Math.cos(a), uy=Math.sin(a), n=L+hl+4, S=PS(n*2+1,n*2+1), c=n;
  const SH=cI('#7a5a36'), SL=cI('#b08850'), HD=cI('#c8d4dc'), HS=cI('#6a7884'), RP=cI('#e8dcbe');
  for(let t=-L;t<=0;t+=0.5){ psP(S,c+ux*t,c+uy*t,(t<-L+1.5)?RP:((uy*0.8+ux*0.6)<0?SL:SH)); }                              // the shaft (a rope-bound butt)
  for(let t=0;t<=hl;t+=0.5){ psP(S,c+ux*t,c+uy*t,HD); } for(const sg of [-1,1]) psP(S,c+ux*(hl*0.35)-uy*sg*1.2,c+uy*(hl*0.35)+ux*sg*1.2,HS);   // the iron head, barbed
  return psCv(psOut(S,cI('#10161c'),false),c,c); }); }
function drawIrons(){
  if(!(TUNE.seaPix>0)) return drawIronsV();
  const s=SCR.s||iscale();
  if(hunt&&hunt.attached&&hunt.w){
    const w=hunt.w, dx=Math.cos(w.a), dy=Math.sin(w.a);
    const [bx,by]=w2pix(boat.x+Math.cos(boat.a)*7, boat.y+Math.sin(boat.a)*7);
    const [wx2,wy2]=w2pix(w.x-dx*w.sp.len*0.1, w.y-dy*w.sp.len*0.1);
    const d=Math.hypot(w.x-boat.x,w.y-boat.y), slack=clamp((hunt.L-d)/120,0,1), mx=(bx+wx2)/2, my=(by+wy2)/2+slack*26*s;
    const n=Math.min(900,Math.ceil(Math.hypot(wx2-bx,wy2-by)*1.2)+2), hum=hunt.strain>78 && slack<0.05, ll=Math.hypot(wx2-bx,wy2-by)||1, pxl=-(wy2-by)/ll, pyl=(wx2-bx)/ll;
    for(const pass of [0,1]){ pctx.beginPath(); let lx=null, ly=null;                       // the line: texel by texel, sagging when slack · humming (a texel's shiver) & reddening when strained
      for(let i=0;i<=n;i++){ const t=i/n, u=1-t; let x=u*u*bx+2*u*t*mx+t*t*wx2, y=u*u*by+2*u*t*my+t*t*wy2;
        if(hum && ((i>>2)&1) && ((time*40)|0)&1){ x+=pxl; y+=pyl; }
        const X=Math.round(x)+(pass?0:1), Y=Math.round(y)+(pass?0:1); if(X===lx&&Y===ly) continue; lx=X; ly=Y; pctx.rect(X,Y,1,1); }
      if(pass===0){ pctx.fillStyle='#062030'; pctx.globalAlpha=0.28; } else { pctx.fillStyle=hunt.strain>78?(((time*10)|0)&1?'#ff5a3a':'#ff9a7a'):hunt.strain>50?'#f4c888':'#eadfc2'; pctx.globalAlpha=0.95; }
      pctx.fill(); }
    pctx.globalAlpha=1;
    if(w.depth<0.4){ const k=Math.min(4,hunt.irons||1);                                    // the irons fast in her flank, standing out of the sea
      for(let j=0;j<k;j++){ const [ax,ay]=w2pix(w.x-dx*w.sp.len*(0.1+j*0.08)-dy*(j&1?1:-1)*j*1.5, w.y-dy*w.sp.len*(0.1+j*0.08)+dx*(j&1?1:-1)*j*1.5), X=Math.round(ax), Y=Math.round(ay);
        pctx.fillStyle='#10161c'; pctx.fillRect(X-1,Y-4,3,5); pctx.fillStyle='#8a6a40'; pctx.fillRect(X,Y-4,1,4); pctx.fillStyle='#c8d4dc'; pctx.fillRect(X,Y,1,1); pctx.fillStyle='#d23a2e'; pctx.fillRect(X+1,Y-4,2,1); } }
  }
  for(const ir of irons){
    const [sx,sy]=w2pix(ir.x,ir.y), a=Math.atan2(ir.vy,ir.vx), Y=Math.round(sy-ir.z*s*0.5), X=Math.round(sx);
    const [bx,by]=w2pix(boat.x,boat.y); pctx.beginPath(); pxPathLine(bx,by,X,Y); pctx.fillStyle='#e8dcbe'; pctx.globalAlpha=0.4; pctx.fill();   // the line paying out behind it
    const sh=shdSpr(2,1); pctx.globalAlpha=0.3; pctx.drawImage(sh.cv,X-sh.ax,Math.round(sy)-sh.ay); pctx.globalAlpha=1;                  // its shadow on the water, parting as it arcs
    const o=ironSpr(((Math.round(a/(TAU/32))%32)+32)%32); pctx.drawImage(o.cv,X-o.ax,Y-o.ay);
  }
}

/* ---------------- the catch & the spoils bobbing on the swell ---------------- */
function spoilSpr(k){ return scM('sp'+k, ()=>{ const q=Math.max(0.7,SCR.s/1.41), ink=cI('#10141a');
  if(k==='cask'){ const w=Math.max(5,Math.round(8*q)), h=Math.max(4,Math.round(6*q)), S=PS(w+2,h+2), C=cIR(['#4a2e16','#6e4622','#8e5e30','#b07a42','#d09a5a']), HP=cIR(['#2a1e12','#4a3a28']);   // a whale-oil cask on her side
    const h1=Math.round(w*0.24), h2=w-1-Math.round(w*0.24), E=cIR(['#8e5e30','#c89458','#e8b878']);
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const nx=(x+0.5)/w*2-1, ny=(y+0.5)/h*2-1, bulge=1-ny*ny, ed=Math.abs(ny)>0.62?(1-bulge)*0.9:0; if(x===0&&Math.abs(ny)>0.6 || x>=w-1&&Math.abs(ny)>0.6) continue;   // her staves bulge, lit from above-left
      let c=C[clamp(Math.round(1.2+bulge*2.2-ny*0.8-ed+bayV(x,y)*0.4),0,4)]; if((x+((y*3)>>1))%3===0 && Math.abs(ny)<0.7) c=C[clamp(Math.round(0.8+bulge*2),0,4)];                   // the stave seams
      if(x===h1||x===h2) c=HP[ny<-0.4?1:0];                                                                                    // two iron hoops
      if(x===w-1) c=E[Math.abs(ny)<0.3?2:1]; else if(x===w-2 && Math.abs(ny)<0.6) c=E[0];                                   // the bung end, catching the light
      psP(S,x+1,y+1,c); }
    return psCv(psOut(S,ink,false),(w>>1)+1,(h>>1)+1); }
  if(k==='baleen'){ const n=Math.max(7,Math.round(10*q)), S=PS(n+4,n+4), P=cI('#2a2e36'), P2=cI('#4a5058'), F=cI('#e0d8c4'), F2=cI('#b8ae96');   // a baleen plate: dark keratin, a pale bristled fringe
    for(let i=0;i<n;i++){ const x=2+i*0.7, y=2+n-i; psP(S,x,y,P2); psP(S,x+1,y,P); psP(S,x+2,y,P); if(i%2===0) psP(S,x+3,y,F); else psP(S,x+3,y,F2); if(i%3===0) psP(S,x+4,y+1,F2); }
    return psCv(psOut(S,ink,false),(n>>1)+2,(n>>1)+2); }
  if(k==='amber'){ const r=Math.max(3,Math.round(3.6*q)), S=PS(r*2+3,r*2+3), C=cIR(['#6a5a3a','#9a8458','#c8aa6a','#e8c860','#f8ecb0']);   // ambergris: a waxy grey-gold lump, faintly aglow
    for(let y=0;y<S.h;y++) for(let x=0;x<S.w;x++){ const nx=(x-r-1)/r, ny=(y-r-1)/(r*0.85), d=Math.hypot(nx,ny); if(d>1-h2i(x,y*3)*0.25) continue; const l=-(nx*0.6+ny*0.8)*1.4+(1-d)+bayV(x,y)*0.6; psP(S,x,y,C[clamp(Math.round(1.4+l),0,4)]); }
    return psCv(psOut(S,ink,false),r+1,r+1); }
  if(k==='tusk'){ const n=Math.max(9,Math.round(13*q)), S=PS(n+4,n+4), A=cI('#f4eedc'), B=cI('#b8ab88'), T=cI('#8a7a58');   // a narwhal tusk: a spiral ivory lance
    for(let i=0;i<n;i++){ const x=2+i, y=2+n-i-1; psP(S,x,y,i>n-3?T:(i&1)?A:B); if(i<n*0.55) psP(S,x,y+1,(i&1)?B:A); }
    return psCv(psOut(S,ink,false),(n>>1)+2,(n>>1)+2); }
  const S=PS(3,3); psP(S,1,1,cI('#ffffff')); return psCv(S,1,1); }); }
function drawSpoilsDrops(){
  if(!(TUNE.seaPix>0)) return drawSpoilsDropsV();
  const s=SCR.s||iscale(), dk=clamp((0.62-env.L)/0.5,0,1);
  for(const dr of seadrops){
    const [sx0,sy0]=w2pix(dr.x,dr.y); if(sx0<-20||sy0<-20||sx0>IW+20||sy0>IH+20) continue;
    const X=Math.round(sx0), Y0=Math.round(sy0), Y=Y0+(Math.sin(dr.ph)>0.2?-1:0);
    const rp=((dr.ph*0.22+(dr.x%1))%1+1)%1; if(rp<0.6){ const rr=1+Math.round(rp*5*Math.max(0.8,s*0.6)), rg=splRing(rr,Math.max(1,Math.round(rr*0.7)),'#dff2f8'); pctx.globalAlpha=0.4*(1-rp/0.6); pctx.drawImage(rg.cv,X-rg.ax,Y0+1-rg.ay); }   // a ripple rings out now and then
    const sh=shdSpr(3,1); pctx.globalAlpha=0.3; pctx.drawImage(sh.cv,X-sh.ax,Y0+2-sh.ay); pctx.globalAlpha=1;
    if(dr.k==='fish'){ const sp=fishByKey(dr.sp); if(!sp) continue; blitO(fishSpr(sp,fishDir(dr.ph*0.25+(dr.x%7)),[0,1,2,1][Math.floor(dr.ph*2.2)&3],0),X,Y); continue; }   // the catch, flopping on the swell
    if(dr.k==='amber'){ const gp=0.5+0.5*Math.sin(time*3+dr.ph), h=haloSpr(Math.max(4,Math.round(5*s)),'#e8c860'); pctx.globalAlpha=0.3+gp*0.25; pctx.drawImage(h.cv,X-h.ax,Y-h.ay); pctx.globalAlpha=1;
      if(dk>0.05) SCR.gl.push(h.cv,X-h.ax,Y-h.ay,0.5*dk*(0.6+0.4*gp)*(TUNE.creatGlow||1)); }
    const o=spoilSpr(dr.k); pctx.drawImage(o.cv,X-o.ax,Y-o.ay);
    if(((time*0.8+dr.ph*0.1)%1)<0.1){ const g=starSpr(false,dr.k==='amber'?'#ffe27a':'#dff4ff'); pctx.drawImage(g.cv,X-o.ax+1-g.ax,Y-o.ay+1-g.ay); }   // a wet glint
  }
}

/* ---------------- PORTRAITS: the Fish Log's side views (crisp, canvas-painted; the unknown are dark silhouettes) ---------------- */
const PORT=new Map();
function portCv(key,mk){ let c=PORT.get(key); if(!c){ c=mk(); PORT.set(key,c); } return c; }
function portFinish(S,known,ink){ if(known) return psOut(S,cI(ink||'#0a121a'),false);                     // the known wear their colours & the dark line · the unknown, a shadow with a pale rim
  const D=cI('#18263e'); for(let i=0;i<S.d.length;i++) if(S.d[i]) S.d[i]=D; return psOut(S,cI('#4a6890'),false); }
function fishPortS(sp){ const A=FISH_ART[sp.key]||FA_DEF, sh=A.sh||'', W=24, H=14, S=PS(W,H), col=sp.col, cy=7;
  const BK=cI(mixHex(col,'#0a2030',0.5)), BK2=cI(mixHex(col,'#0a2030',0.3)), FL=cI(col), LT=cI(mixHex(col,'#ffffff',0.35)), BE=cI(mixHex(col,'#ffffff',0.62)), FN=cI(mixHex(col,'#1a3a4a',0.35)), FN2=cI(mixHex(col,'#ffffff',0.2)), INK=cI('#0a121a'), EW=cI('#ffffff'), SPC=A.sp?cI(A.sp):FL;
  const body=(x,y,v,t)=>{ let c=v<0.18?BK:v<0.34?(bayV(x,y)+0.5<(v-0.18)/0.16?BK2:BK):v<0.7?FL:v<0.8?(bayV(x,y)+0.5<(v-0.7)/0.1?BE:FL):BE; if(v<0.1&&t>0.1&&t<0.7) c=BK2;   // back · flank · belly, dithered where they meet
    const cu=Math.floor(x/2), cv=Math.floor(y/2);
    if(A.mk==='bars' && v<0.5 && t>0.12 && t<0.85 && ((Math.floor(x+v*3))%3===0)) c=SPC;
    else if(A.mk==='lines' && v>0.2 && v<0.7 && (y%2===0) && t>0.1) c=SPC;
    else if(A.mk==='stripe' && Math.abs(v-0.48)<0.1 && t>0.08) c=SPC;
    else if(A.mk==='spots' && v<0.75 && t>0.1 && h2i(x*3+7,y*5+sp.key.length)>0.72) c=SPC;
    else if(A.mk==='speck' && h2i(x*5+1,y*3+2)>0.82) c=SPC;
    else if(A.mk==='bolt' && t>0.1 && t<0.9 && Math.abs(v-(0.4+((cu&1)?0.12:-0.12)))<0.1) c=SPC;
    else if(A.mk==='crack' && t>0.1 && (h2i(cu,cv+11)>0.75 || Math.abs(v-0.45-Math.sin(x*0.9)*0.12)<0.07)) c=SPC;
    else if(A.mk==='koi'){ const h=h2i(Math.floor(x/3)+3,Math.floor(y/3)+17); if(h>0.5) c=SPC; else if(h<0.18) c=cI('#fff4e0'); }
    else if(A.mk==='belly' && v>0.62) c=SPC;
    if(v<0.12 && t>0.15 && t<0.6 && y>0) c=c===BK?BK2:c;
    psP(S,x,y,c); };
  if(sh==='ray'){ for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const q=Math.abs(x+0.5-14)/(x>14?7:10)+Math.abs(y+0.5-cy)/6.2; if(q<=1) psP(S,x,y,(y<cy-1?BK:FL)); else if(x<6 && Math.abs(y+0.5-cy)<0.6) psP(S,x,y,FN); }   // a ray seen from above — wings & whip
    psP(S,17,5,INK); psP(S,17,9,INK); psP(S,16,5,EW); for(let x=9;x<18;x+=3) psP(S,x,cy,LT); return S; }
  if(sh==='squid'){ for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const X=x+0.5, Y=y+0.5; if(X>9&&X<23){ const t=(23-X)/13, hh=t<0.25?t/0.25*3.2:3.2-(t-0.25)*1.6; if(Math.abs(Y-cy)<=hh) body(x,y,(Y-cy+hh)/(2*hh),t); else if(X>18 && Math.abs(Y-cy)<=hh+2.2*(X-18)/5 && Math.abs(Y-cy)<5) psP(S,x,y,FN2); } }
    for(let a=0;a<4;a++) for(let x=1;x<10;x++){ const y=Math.round(cy-1.5+a+Math.sin(x*0.9+a)*0.8); psP(S,x,y,a&1?FL:BK2); }
    psP(S,10,cy-1,INK); psP(S,10,cy-2,EW); return S; }
  if(sh==='eel'){ for(let x=1;x<23;x++){ const yc=cy+Math.sin(x*0.42)*1.7, th=x>19?2.1-(x-19)*0.2:x<6?0.7+(x-1)*0.28:2.1; for(let y=Math.floor(yc-th-0.8);y<=Math.ceil(yc+th);y++){ const v=(y+0.5-(yc-th))/(2*th); if(v>=-0.35&&v<=1) body(x,y,v<0?0:v,(22-x)/20); } }   // a mire eel, rippling
    { const ey=Math.round(cy+Math.sin(20*0.42)*1.7)-1; psP(S,20,ey,INK); psP(S,19,ey-1,EW); } return S; }
  if(sh==='sunfish'){ for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const X=x+0.5, Y=y+0.5, q=((X-13)/8)**2+((Y-cy)/5.2)**2; if(q<=1) body(x,y,(Y-cy+5.2)/10.4,(21-X)/16);
      else if(X>5.5&&X<9 && (Y<cy-4 && Y>0.5 || Y>cy+4 && Y<13.5)) psP(S,x,y,FN); else if(X>4&&X<6 && Math.abs(Y-cy)<4 && ((y&1))) psP(S,x,y,FN2); }   // the round sunbather: tall fins, a frilled back edge
    psP(S,18,cy-1,INK); psP(S,17,cy-2,EW); psP(S,21,cy+1,INK); return S; }
  const L0=sh==='marlin'?20:21, x0=sh==='marlin'?5:6, D=clamp(A.w*2.4,0.26,0.62)*(sh==='marlin'?7:8.5);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const X=x+0.5, Y=y+0.5, t=(L0-X)/(L0-x0);
    if(t>=0&&t<=1){ const hh=D*(t<0.3?0.45+0.55*Math.sqrt(t/0.3):t<0.62?1:1-(t-0.62)/0.38*0.72), top=cy-hh*1.08, bot=cy+hh*0.92; if(Y>=top&&Y<=bot){ body(x,y,(Y-top)/(bot-top),t); continue; }
      if(t>0.34&&t<0.62 && Y<top && Y>top-D*(sh==='marlin'?1.5:0.6)*(1-Math.abs(t-0.46)/0.16)) { psP(S,x,y,sh==='marlin'?BK:FN); continue; }   // the dorsal fin (the marlin's tall sail)
      if(t>0.6&&t<0.78 && Y>bot && Y<bot+D*0.4) { psP(S,x,y,FN); continue; }
      if(t>0.18&&t<0.3 && Y>cy+0.5 && Y<cy+D*0.9 && X<L0-2) { psP(S,x,y,FN2); continue; } }
    else if(t>1){ const tt=(x0-X)/(x0-0.5); if(tt<=1){ const th=D*(0.35+(A.t===0?1.25:0.95)*Math.sqrt(tt)); if(Math.abs(Y-cy)<=th && !(A.t===0 && tt>0.5 && Math.abs(Y-cy)<D*1.1*(tt-0.5)/0.5)) psP(S,x,y,Math.abs(Y-cy)>th-1?FN2:FN); } }   // the tail
    else if(t<0){ if(sh==='marlin' && X<W-0.5 && Math.abs(Y-(cy-0.4))<0.6) psP(S,x,y,BK); else if(sh==='lantern' && ((X<L0+2.5 && Math.abs(Y-(cy-D-1.2+(X-L0)*0.9))<0.6) || (Math.hypot(X-(L0+2.6),Y-(cy-D+0.9))<1.2))) psP(S,x,y,X>L0+1.5?cI(A.glow):BK); } }
  if(sh==='flying'){ for(let y=0;y<cy;y++) for(let x=8;x<17;x++){ const X=x+0.5, Y=y+0.5; if(Y>cy-1-(X-8)*0.62 && Y<cy-0.5 && !psG(S,x,y)) psP(S,x,y,((x+y)&1)?FN2:LT); } }   // wing-fins spread
  const ex=L0-2, ey=Math.round(cy-D*0.35); psP(S,ex,ey,INK); psP(S,ex-1,ey-1,EW); psP(S,L0-1,cy+1,INK);           // an eye with its glint · the mouth
  if(sh==='lantern'){ for(let x=x0+1;x<L0-2;x+=3) psP(S,x,cy+1,cI(A.glow)); }
  return S; }
function fishPortCv(sp,known){ return portCv('f'+sp.key+(known?1:0), ()=>{ const S=portFinish(fishPortS(sp),known); return psCv(S,0,0).cv; }); }
function whalePortS(sp){ const A=WHALE_ART[sp.key]||WHALE_ART.minke, C=sp.col, hd=A.hd, W=56, H=20, S=PS(W,H), cy=9.5;
  const xn=A.tusk?38:50, xt=8, D=({pilot:5.6,minke:5,humpback:6.4,right:7.4,sperm:7.4,blue:5.2,narwhal:5,cinder:6,sounder:5.8,white:7.4})[sp.key]||clamp((sp.girth||0.26)*22,4.4,7.2), ink='#07111a';
  const RB=[mixHex(C.body,ink,0.55),mixHex(C.body,ink,0.3),C.body,C.back,mixHex(C.back,'#ffffff',0.35)].map(cI), BEL=cI(A.flp||A.pleat?C.det:mixHex(C.body,'#dfe6ec',0.5)), BEL2=cI(A.flp||A.pleat?mixHex(C.det,ink,0.35):mixHex(C.body,'#dfe6ec',0.3)), INK=cI(ink), EW=cI('#ffffff');
  const FNC=A.flp?cIR(['#8a9aa8','#dde8ee','#ffffff']):[RB[0],cI(C.fin),RB[2]];
  const kT=t=>{ let k=t<0.5?1:1-(t-0.5)/0.5*0.78;                                                            // each head's own profile (top & belly), tapering to the tail-stock
    if(hd==='box'){ if(t<0.42) k=1.04; if(t<0.015) k=0.92; } else if(hd==='melon'){ if(t<0.2) k=0.66+0.44*Math.sqrt(t/0.2); } else if(hd==='point'){ if(t<0.32) k=0.22+0.78*Math.pow(t/0.32,0.85); }
    else if(hd==='knob'){ if(t<0.3) k=0.3+0.7*Math.pow(t/0.3,0.9); } else if(hd==='u'){ if(t<0.26) k=0.36+0.64*Math.pow(t/0.26,0.7); } else if(hd==='callus'){ if(t<0.3) k=0.42+0.58*Math.sin(t/0.3*Math.PI/2); } else { if(t<0.2) k=0.48+0.52*Math.sqrt(t/0.2); } return k; };
  const kB=t=>{ let k=t<0.46?1:1-(t-0.46)/0.54*0.84;
    if(hd==='box'){ if(t<0.32) k=0.34; else if(t<0.44) k=0.34+(t-0.32)/0.12*0.66; } else if(hd==='point'){ if(t<0.32) k=0.2+0.8*Math.pow(t/0.32,0.8); } else if(hd==='knob'||hd==='u'){ if(t<0.3) k=0.62+0.38*Math.pow(t/0.3,0.6); }
    else if(hd==='callus'){ if(t<0.3) k=0.7+0.3*t/0.3; } else { if(t<0.18) k=0.5+0.5*Math.sqrt(t/0.18); } return k*0.9; };
  for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const X=x+0.5, Y=y+0.5, t=(xn-X)/(xn-xt);
    if(t>=0&&t<=1){ const top=cy-D*kT(t), bot=cy+D*kB(t); if(Y<top||Y>bot) continue; const v=(Y-top)/(bot-top);
      let c=Y<top+1?RB[4]:v<0.2?RB[3]:v<0.52?RB[2]:v<0.62?RB[1]:v<0.72?(bayV(x,y)+0.5<(v-0.62)/0.1?BEL:RB[1]):BEL;             // a lit top edge · her back · the flank's shade · the pale belly
      if(v>0.72 && (A.pleat||A.flp) && t<0.55 && (y%2===0)) c=BEL2;                                               // throat grooves
      if(A.mot && v<0.62 && h2i(Math.floor(x/2)*7,Math.floor(y/2)*5)>0.7 && ((x+y)&1)) c=cI(C.det);
      if(A.spot && v<0.66 && h2i(x*3+1,y*7)>0.74) c=cI(C.det);
      if(A.wr && t>0.4 && v<0.7 && (x%3===0) && ((y+x)&1)) c=RB[1];
      psP(S,x,y,c); }
    else if(t>1){ const tt=(xt-X)/xt; if(tt<=1){ const th=0.9+tt*1.6, yc=cy+0.8-tt*tt*1.5; if(Math.abs(Y-yc)<=th*(tt>0.7?0.7:1)) psP(S,x,y,Y<yc?RB[3]:RB[1]); } } }   // the flukes, edge-on
  const tx=t=>xn-t*(xn-xt), topY=t=>cy-D*kT(t);
  if(A.df){ const x0=Math.round(tx(A.df[1])), x1=Math.round(tx(A.df[0])), hh=Math.max(1,Math.round(A.df[2]*1.6)); for(let x=x0;x<=x1;x++){ const f=(x-x0)/Math.max(1,x1-x0), h=Math.round(hh*(1-Math.abs(f-0.35)*1.2)); for(let q=1;q<=h;q++) psP(S,x,Math.floor(topY((xn-x)/(xn-xt)))-q+1,RB[q>1?1:2]); } }   // the dorsal fin
  { const t0=hd==='box'?0.34:0.28, px0=Math.round(tx(t0)), py0=Math.round(cy+D*0.4), pl=Math.max(4,Math.round(A.pec*44)), ang=A.flp?1.05:0.85;   // the flipper, hanging back & down (the humpback's long white wing)
    for(let q=0;q<=pl;q++){ const fx=px0-Math.cos(ang)*q, fy=py0+Math.sin(ang)*q, w=Math.max(0,Math.round((1-q/pl)*(A.flp?1.2:1.6))); for(let r=-w;r<=w;r++) psP(S,fx+r*0.5,fy-r*0.3,FNC[r<0?2:r>0?0:1]); } }
  const ex=Math.round(tx(hd==='box'?0.34:hd==='melon'?0.2:0.24)), ey=Math.round(cy+D*0.2); psP(S,ex,ey,INK); psP(S,ex-1,ey-1,EW);             // the eye
  { const mt=hd==='box'?0.34:hd==='callus'?0.3:0.22; for(let x=Math.round(tx(mt));x<=xn;x++){ const t=(xn-x-0.5)/(xn-xt), my=hd==='box'?cy+D*kB(t)-0.5:hd==='callus'?cy+D*0.3-Math.sin((1-t/mt)*Math.PI)*1.6:cy+D*0.25; psP(S,x,Math.round(my),RB[0]); } }   // the mouth line
  if(hd==='box'||hd==='knob'||hd==='u'){ const bx=Math.round(tx(hd==='box'?0.02:0.16)); psP(S,bx,Math.round(topY(hd==='box'?0.02:0.16))+1,RB[0]); }   // the blowhole
  if(A.knob) for(let t=0.03;t<0.22;t+=0.035) psP(S,Math.round(tx(t)),Math.round(topY(t))+(h2i(Math.round(t*100),3)>0.5?1:0),cI(mixHex(C.back,'#cfdce6',0.6)));
  if(A.cal) for(let t=0.02;t<0.24;t+=0.03){ if(h2i(Math.round(t*100),7)>0.35) psP(S,Math.round(tx(t)),Math.round(topY(t))+1,cI(C.det)); if(t<0.14) psP(S,Math.round(tx(t)),Math.round(cy+D*0.55),cI(C.det)); }
  if(A.tusk){ for(let x=xn;x<W;x++){ const y=Math.round(cy+D*0.1-(x-xn)*0.14); psP(S,x,y,((x+1)>>1)&1?cI('#f4eedc'):cI('#b8ab88')); } }   // the narwhal's spiral tusk
  if(A.crack){ for(let j=0;j<3;j++){ let y=Math.round(cy-D*0.4+j*1.6); for(let x=Math.round(tx(0.1+j*0.05));x<tx(0.75);x++){ if(h2i(x,j)>0.66) y+=h2i(x,j+5)>0.5?1:-1; if(psG(S,x,y)) psP(S,x,y,cI((x+j)%3?'#ff8a3c':'#ffd070')); } } }   // ember cracks
  if(A.lights){ for(let j=0;j<8;j++){ const x=Math.round(tx(0.12+j*0.1)), y=Math.round(cy+(j&1?1:-1)*1.2); if(psG(S,x,y)){ psP(S,x,y,cI('#e8fcff')); psP(S,x+1,y,cI('#8de9ff')); psP(S,x-1,y,cI('#8de9ff')); } } }
  if(A.scars){ for(let j=0;j<6;j++){ const x=Math.round(tx(0.12+j*0.12)), y=Math.round(cy-D*0.3+h2i(j,2)*D*0.8); for(let q=0;q<3;q++) if(psG(S,x+q,y+q)) psP(S,x+q,y+q,cI('#7a8692')); }
    for(const t of [0.36,0.5,0.62]){ const x=Math.round(tx(t)), y=Math.floor(topY(t)); for(let q=1;q<=4;q++) psP(S,x+Math.round(q*0.5),y-q,q<2?cI('#8a949e'):cI('#4a3a28')); psP(S,x+3,y-4,cI('#cbb98e')); } }   // …and the old irons
  return S; }
function whalePortCv(sp,known){ return portCv('w'+sp.key+(known?1:0), ()=>{ const S=portFinish(whalePortS(sp),known); return psCv(S,0,0).cv; }); }
function portURL(kind,sp,known,k){ const key='u'+kind+sp.key+(known?1:0)+'@'+k; let u=PORT.get(key); if(u) return u; const c=kind==='w'?whalePortCv(sp,known):fishPortCv(sp,known);
  const o=document.createElement('canvas'); o.width=c.width*k; o.height=c.height*k; const g=o.getContext('2d'); g.imageSmoothingEnabled=false; g.drawImage(c,0,0,o.width,o.height); u=o.toDataURL(); PORT.set(key,u); return u; }

/* ---------------- the Fish Log (L): portraits, and a card that tells each one's tale (mouse · keys · pad) ---------------- */
const TIER_COL=['#9fb6dd','#8ef0b0','#6ab8ff','#ffd86b','#ff8ad8'];
function renderFlog(){
  if(!(TUNE.seaPix>0)) return renderFlogV();
  const fc=FISH.filter(f=>flog[f.key]).length, wc=WHALES.filter(x=>flog[x.key]).length;
  document.getElementById('flogCount').textContent=fc+' / '+FISH.length+' fish · '+wc+' / '+WHALES.length+' leviathans';
  const g=document.getElementById('flogGrid'); g.innerHTML=''; g.classList.add('fpx');
  const sec=(ic,t)=>{ const d=document.createElement('div'); d.className='fsec'; d.innerHTML='<img class="ipx ipxs" alt="" src="'+pxiURL(ic,2)+'"> '+t; g.appendChild(d); };
  const add=(it,isW)=>{ const lg=flog[it.key], b=document.createElement('button'); b.type='button'; b.className='itile ftile'+(isW?' wtile':'')+(lg?'':' unk');
    const cv=isW?whalePortCv(it,!!lg):fishPortCv(it,!!lg);
    b.innerHTML='<img class="ipx" alt="" src="'+portURL(isW?'w':'f',it,!!lg,2)+'" width="'+cv.width*2+'" height="'+cv.height*2+'"><i class="ftier" style="background:'+TIER_COL[it.tier]+'"></i>'+(lg?'<span class="icnt">'+lg.n+'</span>':'');
    b._fl=[it,isW]; const show=()=>flogShow(it,isW); b.onmouseenter=show; b.onfocus=show; b.onclick=show; g.appendChild(b); };
  sec('fish','FISH — '+fc+' of '+FISH.length); for(const f of FISH) add(f,false);
  sec('wave','LEVIATHANS — '+wc+' of '+WHALES.length); for(const x of WHALES) add(x,true);
  const first=FISH.find(f=>flog[f.key]); if(first) flogShow(first,false); else flogShow(null);
}
function flogShow(it,isW){ const el=document.getElementById('flogInfo'); if(!el) return; el._it=it;
  if(!it){ el.innerHTML='<b>Nothing netted yet.</b><span>Sail near a shimmering school, press F (pad: '+padGlyph('skill2')+') and ring it.</span>'; return; }
  const lg=flog[it.key], tier=isW?WHALE_TIER[it.tier]:FISH_TIER[it.tier], tc=TIER_COL[it.tier];
  if(!lg){ el.innerHTML='<b style="color:#8aa0c8">??? <em style="color:'+tc+'">'+tier+'</em></b><span>seek it: '+it.hint+'</span>'; return; }
  el.innerHTML='<b>'+it.name+' <em style="color:'+tc+'">'+tier+'</em></b><span>'+(isW?'taken '+lg.n+' · greatest '+lg.best+' m':'caught '+lg.n+' · best '+lg.best+' cm · '+it.val+'g each')+' · '+it.hint+'</span>'; }
addEventListener('click',e=>{ const b=e.target&&e.target.closest&&e.target.closest('[data-flog]'); if(!b) return; if(menuOpen) closeMenu(); openFlog(); });   // (Esc → Voyage → Fish log · open: the pad's way into the log)

/* ---------------- the net & the hunt on the HUD: the crawl's pixel kit (brass plates, pixel gauges, key caps) ---------------- */
function capH(t,h){ const pad=inDev==='pad'; return glyphCap(t,Math.round(h),pad); }                                   // a key cap for a key or pad button that isn't a crawl role
function netCapT(){ return inDev==='pad'?padGlyph('skill2'):'F'; }
function reticleCv(on){ return portCv('ret'+(on?1:0), ()=>{ const n=15, c=7, S=PS(n,n), C=cI(on?'#ffd66b':'#e2eaf4'), K=cI('#10161c');   // the harpooner's eye: a ring & four ticks
  for(let i=0;i<40;i++){ const a=i/40*TAU; psP(S,c+Math.cos(a)*4.2,c+Math.sin(a)*4.2,C); } for(let q=0;q<3;q++){ psP(S,c,q,C); psP(S,c,n-1-q,C); psP(S,q,c,C); psP(S,n-1-q,c,C); }
  if(on) psP(S,c,c,C); return psCv(psOut(S,K,false),c,c).cv; }); }
function drawHuntHUD(){
  if(!(TUNE.seaPix>0)) return drawHuntHUDV();
  const U=hudU(), k=hudK(); ctx.save(); ctx.imageSmoothingEnabled=false; ctx.textBaseline='middle'; ctx.textAlign='left';
  if(limpT>0){ const t2='BAILING — '+Math.ceil(limpT)+'s at half sail'; ctx.font='800 '+Math.round(13*U)+'px system-ui';
    const iw=pxiW('wave',k), w2=Math.round(ctx.measureText(t2).width+iw+30*U), h=Math.round(28*U), x=Math.round(CSSW/2-w2/2), y=128;
    pxPanel(x,y,w2,h,PXP.red); pxIcon('wave',x+Math.round(10*U),y+h/2,k); panTxt(t2,x+Math.round(18*U)+iw,y+h/2+1,'#ffb4a0'); }
  let near=null, nd=1e18;
  for(const w of whales){ if(w.st==='gone'||w.st==='under'||w.st==='flee') continue; const d2=(w.x-boat.x)**2+(w.y-boat.y)**2; if(d2<nd){ nd=d2; near=w; } }
  if(near && nd<600*600 && !(hunt&&hunt.attached)){                                   // the harpooner's eye
    const aim=seaAim(), inR=Math.hypot(aim.x-boat.x,aim.y-boat.y)<=WTUNE.throwRange, rc=reticleCv(inR), kk=Math.max(2,k);
    ctx.drawImage(rc,Math.round(mouseX-rc.width*kk/2),Math.round(mouseY-rc.height*kk/2),rc.width*kk,rc.height*kk);
    ctx.textAlign='center'; const ty=Math.round(mouseY+rc.height*kk/2+10*U);
    if(ironCD>0) hudTxt(ironCD.toFixed(1),mouseX,ty,'rgba(230,238,250,.8)','700 '+Math.round(10*U)+'px system-ui');
    else if(inR) hudTxt('LET FLY',mouseX,ty,'#ffd66b','800 '+Math.round(10*U)+'px system-ui');
    ctx.textAlign='left'; }
  if(!hunt){ ctx.restore(); return; }
  const w=hunt.w, W=Math.round(372*U), rh=Math.round(15*U), bh=Math.max(6,Math.round(8*U)), hh=Math.round(34*U), H=hh+rh*4+Math.round(34*U), x=Math.round(CSSW/2-W/2), y=Math.round(CSSH-100*U-H), pd=Math.round(12*U);
  pxPanel(x,y,W,H,PXP.brass);
  // the head: her portrait, her name, the rounds she has left in her (diamonds), your irons
  const pc=whalePortCv(w.sp,true), pk=U>=1.2?2:1, pw=pc.width*pk, ph2=pc.height*pk; ctx.drawImage(pc,x+pd,Math.round(y+hh/2+2-ph2/2),pw,ph2);
  ctx.font='800 '+Math.round(14*U)+'px system-ui'; const nm=w.sp.name; panTxt(nm,x+pd+pw+Math.round(8*U),y+Math.round(hh/2)+2,'#ffe6a6');
  let dx0=x+pd+pw+Math.round(16*U)+ctx.measureText(nm).width; const rd=Math.max(3,Math.round(4*U)), cur=Math.min(w.sndDone,w.sp.rounds-1);
  for(let r=0;r<w.sp.rounds;r++){ const done=r<w.sndDone, on=r===cur; pxDia(dx0+rd,y+Math.round(hh/2)+2,rd,done?'#6a5a3a':on?(Math.sin(time*6)>0?'#ffd86b':'#e0a820'):'#2c3a58','#04070e'); dx0+=rd*2+Math.round(5*U); }
  ctx.font='700 '+Math.round(11*U)+'px system-ui'; const it='×'+hunt.irons, iw=ctx.measureText(it).width; panTxt(it,x+W-pd-iw,y+Math.round(hh/2)+2,'#cfe0ff'); pxIcon('harpoon',x+W-pd-iw-pxiW('harpoon',k)-Math.round(4*U),y+Math.round(hh/2)+2,k);
  // the gauges
  const lx=x+pd, bx=x+pd+Math.round(58*U), bw=W-pd*2-Math.round(58*U); ctx.font='800 '+Math.round(9.5*U)+'px system-ui';
  const row=(i,lab,f,col,hi,lo,tick)=>{ const ry=y+hh+i*rh+Math.round(rh/2); panTxt(lab,lx,ry+1,'#8aa0c8'); pxBar(bx,Math.round(ry-bh/2),bw,bh,f,col,hi,lo,'#16223a');
    if(tick!=null){ ctx.fillStyle='#04070e'; ctx.fillRect(Math.round(bx+bw*tick)-1,Math.round(ry-bh/2)-2,3,bh+4); ctx.fillStyle='#ffe6a6'; ctx.fillRect(Math.round(bx+bw*tick),Math.round(ry-bh/2)-1,1,bh+2); } };
  const st=hunt.strain/100, sc=st>0.78?['#ff5d4a','#ff9a8a','#9a2418']:st>0.5?['#ffce54','#fff0a8','#a8781c']:['#7fd6c8','#c8fff4','#2a8a7a'];
  row(0,'STRAIN',st,sc[0],sc[1],sc[2],0.78);
  const lf=hunt.attached?hunt.L/eLineMax():0; row(1,'LINE',lf,lf>0.85?'#ff9f8a':'#9fc6e6',lf>0.85?'#ffd0c4':'#dff0ff',lf>0.85?'#9a3a2a':'#4a7aa6');
  row(2,'WHALE',clamp(w.stam/w.stamMax,0,1),'#cfa6e8','#f0dcff','#7a4aa8');
  const hf=clamp(hull/hullMaxNow(),0,1); row(3,'HULL',hf,hf<0.3?'#ff5d4a':'#d8c878',hf<0.3?'#ff9a8a':'#fff0b0',hf<0.3?'#9a2418':'#8a7a2a');
  // what to do now — with the keys (or the pad's stick) as caps
  const my=y+hh+rh*4+Math.round(15*U), gh=Math.round(16*U); ctx.font='700 '+Math.round(11.5*U)+'px system-ui';
  let msg=null, warn=false;
  if(!hunt.attached) msg = w.st==='under' ? 'she’s under — follow the bubbles' : w.st==='rise' ? 'she rises!' : 'close in and throw again';
  else if(w.st==='diveline'){ msg='SHE SOUNDS — GIVE LINE!'; warn=true; }
  else if(hunt.snag){ msg='SNAGGED — give line, steer off the rocks!'; warn=true; }
  else if(w.thrash>0){ msg='she thrashes — ease off, bow to her!'; warn=true; }
  const segs=[]; const pad=inDev==='pad';
  if(msg){ segs.push([msg,warn?'#ff9f8a':'#dbe7fb']); if(!hunt.attached && w.st!=='under' && w.st!=='rise') segs.push([' ',''],['cap',pad?padGlyph('attack'):'click']); else if(w.st==='diveline'||hunt.snag) segs.push([' ',''],['cap',pad?'L▼':'S']); }
  else segs.push(['cap',pad?'L◀▶':'A'],pad?['','']:['cap','D'],[' follow her  ','#dbe7fb'],['cap',pad?'L▲':'W'],[' haul in  ','#dbe7fb'],['cap',pad?'L▼':'S'],[' give line','#dbe7fb']);
  let tw=0; for(const q of segs){ if(!q[0]) continue; tw+=q[0]==='cap'?capH(q[1],gh).w+Math.round(3*U):ctx.measureText(q[0]).width; }
  let tx=Math.round(x+W/2-tw/2); for(const q of segs){ if(!q[0]) continue; if(q[0]==='cap'){ const c=capH(q[1],gh); ctx.drawImage(c.cv,tx,Math.round(my-c.h/2),c.w,c.h); tx+=c.w+Math.round(3*U); } else { panTxt(q[0],tx,my+1,q[1]); tx+=ctx.measureText(q[0]).width; } }
  ctx.restore();
}
function drawFishHUD(){
  if(!(TUNE.seaPix>0)) return drawFishHUDV();
  const U=hudU(), k=hudK(); ctx.save(); ctx.imageSmoothingEnabled=false; ctx.textBaseline='middle';
  for(const f of seafloat){ const [ix,iy]=w2pix(f.x,f.y), sxp=ix*(CSSW/IW), syp=iy*(CSSH/IH)-f.t*16+(f.oy||0);      // tallies & galley notes (a netted fish shows its own portrait)
    ctx.globalAlpha=clamp(1-f.t/f.life,0,1); ctx.font='700 '+Math.round(13*U)+'px system-ui';
    if(f.fk){ const sp=fishByKey(f.fk), nm=sp?sp.name:f.txt, pc=sp&&fishPortCv(sp,true), tw=ctx.measureText(nm).width, pw=pc?pc.width:0, x0=Math.round(sxp-(tw+pw+4)/2);
      if(pc) ctx.drawImage(pc,x0,Math.round(syp-pc.height/2),pc.width,pc.height); ctx.textAlign='left'; hudTxt(nm,x0+pw+4,syp,f.c); }
    else { const fs=Math.round(13*U), tw=emoW(f.txt,fs), pw=Math.round(tw+18*U), ph=Math.round(fs+10*U); ctx.imageSmoothingEnabled=false; pxPanel(Math.round(sxp-pw/2),Math.round(syp-fs-3*U),pw,ph,PXP.dim); ctx.textAlign='center'; emoTxt(f.txt,sxp,syp,f.c,fs,'pan'); } }   // (on a dim plate — readable on the darkest water)
  ctx.globalAlpha=1; ctx.textAlign='left';
  const fpY=Math.min(CSSH-132, seaCardTop-30), gh=Math.round(16*U);
  const prompt=(parts,st,y)=>{ ctx.font='700 '+Math.round(12*U)+'px system-ui'; let w2=Math.round(24*U); for(const q of parts) w2+=q[0]==='cap'?capH(q[1],gh).w+Math.round(4*U):q[0]==='icon'?pxiW(q[1],k)+Math.round(6*U):ctx.measureText(q[0]).width;
    const h=Math.round(26*U), x=Math.round(CSSW/2-w2/2); pxPanel(x,y,w2,h,st); let tx=x+Math.round(12*U); const cy=y+h/2;
    for(const q of parts){ if(q[0]==='cap'){ const c=capH(q[1],gh); ctx.drawImage(c.cv,tx,Math.round(cy-c.h/2),c.w,c.h); tx+=c.w+Math.round(4*U); } else if(q[0]==='icon'){ tx+=pxIcon(q[1],tx,cy,k)+Math.round(6*U); } else { panTxt(q[0],tx,cy+1,q[1]); tx+=ctx.measureText(q[0]).width; } } };
  if(net && net.phase==='lay'){                                                         // cork-line remaining
    const fr=clamp(1-net.len/eNetLen(),0,1), W2=Math.round(330*U), h=Math.round(40*U), x=Math.round(CSSW/2-W2/2), y=Math.round(fpY-h+14*U);
    pxPanel(x,y,W2,h,PXP.brass); ctx.font='800 '+Math.round(10.5*U)+'px system-ui'; pxIcon('net',x+Math.round(10*U),y+Math.round(13*U),k); panTxt('CORK-LINE',x+Math.round(14*U)+pxiW('net',k),y+Math.round(13*U),'#cfe0ff');
    ctx.font='600 '+Math.round(10*U)+'px system-ui'; const c=capH(netCapT(),Math.round(14*U)), rt='reel in', rw=ctx.measureText(rt).width, lt='cross your line to cinch · ';
    panTxt(rt,x+W2-Math.round(10*U)-rw,y+Math.round(13*U),'#8aa0c8'); ctx.drawImage(c.cv,Math.round(x+W2-Math.round(14*U)-rw-c.w),Math.round(y+Math.round(13*U)-c.h/2),c.w,c.h);
    const lw=ctx.measureText(lt).width; if(x+Math.round(20*U)+pxiW('net',k)+ctx.measureText('CORK-LINE').width+lw+c.w+rw+Math.round(24*U)<x+W2) panTxt(lt,Math.round(x+W2-Math.round(18*U)-rw-c.w-lw),y+Math.round(13*U),'#8aa0c8');
    const bw=W2-Math.round(20*U); pxBar(x+Math.round(10*U),y+Math.round(25*U),bw,Math.max(6,Math.round(8*U)),fr,fr<0.25?'#ff9f8a':'#7fd6c8',fr<0.25?'#ffd0c4':'#c8fff4',fr<0.25?'#9a3a2a':'#2a8a7a','#16223a');
  } else if(net && net.phase==='cinch'){                                                // strain over the tightening ring
    const kk=1-clamp(net.t/net.T,0,1)*0.85; let ty=1e9, tb=-1e9; for(const p of net.poly){ const yy=net.cy+(p.y-net.cy)*kk; ty=Math.min(ty,yy); tb=Math.max(tb,yy); }   // (the gauge rides just above the tightening ring — never over the catch)
    const [ix,iy]=w2pix(net.cx,ty), iyb=w2pix(net.cx,tb)[1], px=ix*(CSSW/IW), pyT=iy*(CSSH/IH)-Math.round(30*U), py=pyT>=Math.round(150*U)?pyT:Math.min(CSSH-Math.round(90*U),iyb*(CSSH/IH)+Math.round(34*U));   // (below the compass & the pills — or under the ring)
    const W2=Math.round(118*U), H2=Math.max(6,Math.round(9*U)), scl=Math.max(net.sTot,eNetCap()*1.15), ff=clamp(net.t/net.T,0,1)*net.sTot/scl, capF=eNetCap()/scl;
    const shake=(net.torn && net.t-net.tornT<0.45)?Math.round((Math.random()-0.5)*6):0, x=Math.round(px-W2/2-Math.round(8*U)+shake), y=Math.round(py-Math.round(16*U)), w3=W2+Math.round(16*U), h3=Math.round(36*U);
    pxPanel(x,y,w3,h3,net.torn?PXP.red:PXP.brass); ctx.textAlign='center'; ctx.font='800 '+Math.round(10*U)+'px system-ui'; panTxt(net.torn?'TORN!':'STRAIN',x+w3/2,y+Math.round(11*U),net.torn?'#ff7a5a':'#cfe0ff'); ctx.textAlign='left';
    const col=ff>capF?['#ff5d4a','#ff9a8a','#9a2418']:ff>capF*0.7?['#ffce54','#fff0a8','#a8781c']:['#7fd6c8','#c8fff4','#2a8a7a'], bx=x+Math.round(8*U), by=y+Math.round(20*U);
    pxBar(bx,by,W2,H2,Math.min(ff,1),col[0],col[1],col[2],'#16223a'); ctx.fillStyle='#04070e'; ctx.fillRect(Math.round(bx+W2*capF)-1,by-3,3,H2+6); ctx.fillStyle='#ffffff'; ctx.fillRect(Math.round(bx+W2*capF),by-2,1,H2+4);
  } else if(seaCardOn){                                                                 // (the landfall card's footer carries the net hint)
  } else if(netCD>0){ prompt([['mending the net — '+Math.ceil(netCD)+'s','#ffb4a0']],PXP.red,fpY);
  } else if(!hunt){
    let nd=1e18; for(const s2 of schools){ const d2=(s2.x-boat.x)**2+(s2.y-boat.y)**2; if(d2<nd) nd=d2; }
    if(nd<300*300) prompt([['icon','net'],['cap',netCapT()],[' pay out the net','#ffe6a6']],PXP.brass,fpY);
  }
  if(nearLand && nearLand.port && (wellN()+spoilN())>0 && !net && !hunt){             // the fish merchant
    const sn=spoilN(); ctx.font='700 '+Math.round(13*U)+'px system-ui';
    prompt([['icon','fish'],['cap','G'],[' sell your catch  ('+wellN()+' fish'+(sn?', '+sn+' spoils':'')+')','#9fe8c0']],PXP.green,CSSH-Math.round(62*U));
  }
  ctx.restore(); ctx.textAlign='left'; ctx.textBaseline='alphabetic';
}
