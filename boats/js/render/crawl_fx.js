"use strict";
/* FILE: js/render/crawl_fx.js
THE TEXEL FX KIT and the crawl's hazard, loot and fixture sprites: original lines 24449-24604 (build 5109cd5), moved verbatim,
  in place after THE NEWER SHORES' HAZARDS (original lines 24188-24448, still inline); the island render follows at original
  line 24605 (build 5109cd5).
Three parts: the newer shores' hazard looks (pitSpr, puffSprH, cloudSpr, rockSpr, rustleSpr, drawHazGround, drawHazAir); THE
  TEXEL FX KIT, whole-texel shapes drawn into a 2D context (pxEll, pxRingE, pxSect, pxLane with BAYT and LANE_EX), the light
  beam colStamp (COLS cache), shadowSprC and islShd; and baked sprites: chests (chestSpr, chestOutSpr), projectiles (arrowSpr,
  arrowSprT, boltSpr, blobSpr, ELEM_LC, ELEM_PAL), gear on the ground (itemIcon, itBake, itBake1, itPool, itCone with the ITFX
  and ITBK caches), the cave's rope and stairs (ropeSpr, upTriSpr, stairSpr) and YOU (youRingSpr, creamOf).
Entry points: drawIslandWorld calls drawHazGround, drawHazAir, rustleSpr, chestSpr, itBake, itCone, arrowSprT, boltSpr and the
  rest; islTells calls pxLane and pxSect and writes LANE_EX every frame; pxEll, pxRingE, shadowSprC, islShd and colStamp are
  shared (zoneSpr, the sanctum art, cvShardDraw, drawAllies, the props, drawCorpses, sagaLantDraw). Also: rockSpr (drawLava),
  cloudSpr (islEmissive), ELEM_LC (islLights), ELEM_PAL (wPaint), blobSpr (spr2Build), ropeSpr, upTriSpr and stairSpr
  (drawRope, drawStairs), youRingSpr (youRing), creamOf (iceOf, drawExplorerPix).
Globals it owns: the consts BAYT, LANE_EX, COLS, ELEM_LC, ELEM_PAL, ITFX and ITBK, and the functions named above.
Main globals it reads from elsewhere (inside functions, at runtime only): ISL, ITUNE, itime, pctx, clamp, hash2, TAU; BAY4, bayV,
  cI, cIA, cIR, PS and the ps* kit, tSpr, TSPR_S, TB and TBI (js/render/pixkit.js); drPuff (js/render/terrain.js); fxLRU and
  whiteOf (js/render/crawl_props.js); GEMS, GEM_RAR and IRAR (js/data/crawl2.js); IB and cvShardDraw (earlier inline code);
  declared later: iwp, islOnScr and pxiCv.
Load-time statements: original line 24506 (build 5109cd5), BAYT=BAY4.map(...) and LANE_EX, needs BAY4 from js/render/pixkit.js,
  which loads first; 24508 (COLS), 24558 (ITFX) and 24561 (ITBK) are plain new Map(); the rest are literals and functions.
*/
/* ---- their looks: the pits' swirl, the puffballs, the spore clouds, a falling rock, a rustle in the canes (all baked pixel sprites) ---- */
function pitSpr(Rw,f){ return tSpr('pit'+Rw+'_'+f, ()=>{ const s=TSPR_S, R=Math.max(4,Math.round(Rw*s)), sz=R*2+3, S=PS(sz,sz), c=sz>>1, G=TBI('dunes').g, D=cIR(['#3a2412','#5a3a1e']);
  for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){ const dx=x+0.5-c, dy=(y+0.5-c)/0.7, d=Math.hypot(dx,dy)/R; if(d>1) continue; const a=Math.atan2(dy,dx);
    const sw=Math.sin(a*3+d*10-f*Math.PI/2)>0.45, lip=d>0.84; let v=lip?4.6-(d-0.84)*7:0.5+d*3+(sw?-1.4:0.3)+bayV(x,y)*0.6;
    const col=d<0.14?D[0]:d<0.24?D[1]:G[clamp(Math.floor(v),0,5)]; if(d>0.93 && bayV(x,y)>0.2) continue; psP(S,x,y,col); }   // a sunken bowl, a swirl of streaming sand, the dark eye, a lit lip dithered into the dunes
  return psCv(S,c,c); }); }
function puffSprH(v,st){ return tSpr('puffh'+v+st, ()=>{ const s=TSPR_S, R=Math.max(3,8*s); if(st==='spent'){ const S=PS(Math.ceil(R*1.6)+4,Math.ceil(R*0.7)+4), C=cIR(['#2a1a38','#4a3060','#6a4a86']); psDisc(S,S.w/2,S.h-3,R*0.7,R*0.3,(nx,ny,x,y)=>C[clamp(Math.floor(1.4-ny+bayV(x,y)*0.6),0,2)]); return psCv(psOut(S,cI('#140a1e'),false),S.w>>1,S.h-3); }
  return drPuff(R*(st==='swell'?1.25:1),v*7+3); }); }
function cloudSpr(Rw){ return tSpr('spc'+Rw, ()=>{ const s=TSPR_S, R=Math.max(6,Math.round(Rw*s)), sz=R*2+3, S=PS(sz,sz), c=sz>>1, C=[cIA('#8a5ab8',0.78),cIA('#b48ae0',0.72),cIA('#d8c0f4',0.62),cIA('#c8e888',0.8)];
  for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){ const dx=x+0.5-c, dy=(y+0.5-c)/0.72, d=Math.hypot(dx,dy)/R+(hash2(x>>2,y>>2)-0.5)*0.18; if(d>1) continue;   // a lumpy violet cloud, dithered thin toward its edge
    if(bayV(x,y)+0.5 < (d-0.35)*1.6) continue; const l=-(dx*0.5+dy*0.7)/R; psP(S,x,y,hash2(x*7,y*5)<0.04?C[3]:C[clamp(Math.floor(1+l*1.6+bayV(x,y)*0.8),0,2)]); }
  return psCv(S,c,c); }); }
function rockSpr(f){ return tSpr('erock'+f, ()=>{ const s=TSPR_S, R=Math.max(3,Math.round(6*s)), S=PS(R*2+6,R*2+6), c=(R*2+6)>>1, C=cIR(['#140c0a','#2a1e1a','#40302a','#5a463c']), E=cIR(['#e0501a','#ffb040','#fff0a0']);   // a burning rock: basalt, cracked with fire
  psDisc(S,c,c,R,R*0.86,(nx,ny,x,y)=>{ const l=-(nx*0.6+ny*0.8); if(Math.abs(Math.sin((nx+ny*0.6)*5+f))<0.16) return E[(x+y+f)%3===0?1:0]; return C[clamp(Math.floor(1.6+l*1.6+bayV(x,y)*0.6),0,3)]; });
  return psCv(psOut(S,cI('#0a0404'),false),c,c); }); }
function rustleSpr(f){ return tSpr('rustle'+f, ()=>{ const s=TSPR_S, R=Math.max(3,Math.round(7*s)), S=PS(R*2+6,R+6), bx=R+3, by=R+3, C=TBI('bamboo').cr.bamboo[0];   // a clump of canes & leaves — shivering when something's in it
  for(let i=0;i<5;i++){ const x=Math.round(bx+(i-2)*R*0.36), L=Math.round(R*(0.5+hash2(i,f)*0.4)); for(let t=0;t<L;t++) psP(S,x+(f&&t>L*0.6?(i%2?1:-1):0),by-t,C[t>L-2?5:3]); const sg=i%2?1:-1; for(let j=1;j<4;j++) psP(S,x+sg*j+(f?sg:0),by-L+Math.round(j*0.5),C[4]); }
  return psCv(psOut(S,C[0],false),bx,by); }); }
function drawHazGround(s){ const I=ISL; if(!I) return;
  if(I.pits) for(const p of I.pits){ if(!islOnScr(p.x,p.y,p.r+10)) continue; const [x,y]=iwp(p.x,p.y), o=pitSpr(Math.round(p.r),Math.floor(itime*ITUNE.pitSpin+p.ph)&3); pctx.drawImage(o.cv,x-o.ax,y-o.ay); }
  if(I.puffs) for(const p of I.puffs){ if(p.st==='gone' || !islOnScr(p.x,p.y,40)) continue; const [x,y]=iwp(p.x,p.y), v=Math.abs(Math.floor(p.x*0.13+p.y*0.29))%3;
    if(p.st==='swell'){ const q=clamp(1-p.t/ITUNE.puffSwell,0,1), R=ITUNE.sporeR*s;   // the burst's true reach shows BEFORE it goes (like the lava's warning)
      pctx.fillStyle='#c9a6ff'; pctx.globalAlpha=0.35+0.5*q; pxRingE(pctx,x,y,R,R*0.72,1); pctx.globalAlpha=0.08+0.14*q; pxEll(pctx,x,y,Math.max(0,R*q-1),Math.max(0,(R*q-1)*0.72)); pctx.globalAlpha=1;
      const o=puffSprH(v,'swell'), fl=Math.floor(itime*14)%2; pctx.drawImage((fl?whiteOf(o):o).cv,x-o.ax+(fl?1:0),y-o.ay); }
    else { const o=puffSprH(v,p.st==='spent'?'spent':'idle'); pctx.drawImage(o.cv,x-o.ax,y-o.ay); } }
  if(I.shards) for(const S of I.shards) cvShardDraw(S,s); }   // (SEAS & DEPTHS DE5) a ringing crystal's reach
function drawHazAir(s){ const I=ISL; if(!I||!I.clouds||!I.clouds.length) return;
  for(const c of I.clouds){ if(!islOnScr(c.x,c.y,c.R+10)) continue; const [x,y]=iwp(c.x,c.y), R=c.R*Math.min(1,0.35+c.t*2.6), o=cloudSpr(Math.max(6,Math.round(R/4)*4)), a=clamp(Math.min(c.t*4,(c.life-c.t)/0.8),0,1);
    pctx.globalAlpha=a*0.9; pctx.drawImage(o.cv,x-o.ax,y-o.ay-Math.round(3*s)); pctx.globalAlpha=a; pctx.fillStyle='#e8ff8a';
    for(let i=0;i<6;i++){ const ph=itime*1.3+i*1.7+c.x*0.01, rr=R*s*0.7*((i*0.37+itime*0.2)%1); pctx.fillRect(Math.round(x+Math.cos(ph)*rr),Math.round(y+Math.sin(ph)*rr*0.7-4*s*((itime+i)%1)),1,1); } }   // spores tumbling in it
  pctx.globalAlpha=1; }

/* ============================================================ *
 *  THE TEXEL FX KIT — the crawl's props, drops & FX on the ONE GRID: every shape is built from whole-texel spans (never an
 *  antialiased edge, never a gradient) · see-through is flat per shape (SNES-style translucency) · beams & glows are dithered
 *  stamps · props & drops are baked pixel sprites with the dark SNES line. They draw into g (pctx) at integer buffer coords.
 * ============================================================ */
function pxEll(g,cx,cy,rx,ry){ cx=Math.round(cx); cy=Math.round(cy); rx=Math.max(0,Math.round(rx)); ry=Math.max(0,Math.round(ry));   // a filled ellipse
  for(let y=-ry;y<=ry;y++){ const t=y/(ry+0.5), hw=Math.round(rx*Math.sqrt(1-t*t)); g.fillRect(cx-hw,cy+y,hw*2+1,1); } }
function pxRingE(g,cx,cy,rx,ry,w){ cx=Math.round(cx); cy=Math.round(cy); rx=Math.max(0,Math.round(rx)); ry=Math.max(0,Math.round(ry)); w=Math.max(1,Math.round(w||1));   // an ellipse ring w texels thick (outer span minus inner span, row by row)
  const irx=rx-w, iry=ry-w;
  for(let y=-ry;y<=ry;y++){ const t=y/(ry+0.5), ho=Math.round(rx*Math.sqrt(1-t*t)); let hi=-1; if(irx>=0 && iry>=0 && Math.abs(y)<=iry){ const u=y/(iry+0.5); hi=Math.round(irx*Math.sqrt(1-u*u)); }
    if(hi<0) g.fillRect(cx-ho,cy+y,ho*2+1,1); else { const d=Math.max(1,ho-hi); g.fillRect(cx-ho,cy+y,d,1); g.fillRect(cx+ho-d+1,cy+y,d,1); } } }
function pxSect(g,cx,cy,R0,R1,am,ah){ cx=Math.round(cx); cy=Math.round(cy); if(R1<0.5||ah<=0) return;   // an annular sector round the mid-angle am (± ah): R0 = 0 → a pie wedge · R0 = R1 → a one-texel arc
  const o2=(R1+0.5)*(R1+0.5), i2=R0>0.5?(R0-0.5)*(R0-0.5):-1, ca=Math.cos(am), sa=Math.sin(am), ch=Math.cos(Math.min(Math.PI,ah)), R=Math.ceil(R1+0.5);
  for(let y=-R;y<=R;y++){ const y2=y*y; if(y2>o2) continue; const xo=Math.floor(Math.sqrt(o2-y2)); let run=-9999;
    for(let x=-xo;x<=xo+1;x++){ let on=false; if(x<=xo){ const d2=x*x+y2; if(d2>=i2) on = d2===0 || (x*ca+y*sa)>=ch*Math.sqrt(d2); }
      if(on){ if(run===-9999) run=x; } else if(run!==-9999){ g.fillRect(cx+run,cy+y,x-run,1); run=-9999; } } } }
function pxLane(g,x,y,a,L,W0,W1){ if(!(L>1)) return; const c=Math.cos(a), s=Math.sin(a), P=[[x-s*W0,y+c*W0],[x+c*L-s*W1,y+s*L+c*W1],[x+c*L+s*W1,y+s*L-c*W1],[x+s*W0,y-c*W0]];   // a charge lane: W0 → W1 half-wide, dithered away along its length (Bayer, whole texels)
  let y0=1e9,y1=-1e9, any=0; for(const p of P){ if(p[1]<y0) y0=p[1]; if(p[1]>y1) y1=p[1]; } g.beginPath();   // (PX L1) every lit run → a whole-texel rect in ONE path, filled once (was a fillRect a run: hundreds of GPU ops a lane, flushed by the style pass's upload)
  for(let Y=Math.floor(y0);Y<=Math.ceil(y1);Y++){ const py=Y+0.5; let xl=1e9, xr=-1e9;
    for(let i=0,j=3;i<4;j=i++){ const A=P[i], B=P[j]; if((A[1]>py)!==(B[1]>py)){ const xx=A[0]+(py-A[1])*(B[0]-A[0])/(B[1]-A[1]); if(xx<xl) xl=xx; if(xx>xr) xr=xx; } }
    if(xl>xr) continue; const xa=Math.round(xl), xb=Math.round(xr); if(xb<=xa) continue; let run=-9999, t=((xa+0.5-x)*c+(py-y)*s)/L; const dt=c/L, rb=(Y&3)<<2;
    const ey2=(Y-LANE_EX[1])*(Y-LANE_EX[1]);
    for(let X=xa;X<=xb;X++,t+=dt){ const on=X<xb && (1-t)*1.15>BAYT[rb|(X&3)] && (X-LANE_EX[0])*(X-LANE_EX[0])+ey2>LANE_EX[2];   // (never over YOU — the lane stops short of your sprite)
      if(on){ if(run===-9999) run=X; } else if(run!==-9999){ g.rect(run,Y,X-run,1); any=1; run=-9999; } } }
  if(any) g.fill(); }                                                                  // (PX L1) the same texels; one fill a lane
const BAYT=BAY4.map(v=>(v+0.5)/16), LANE_EX=[0,0,-1];                                  // (LANE_EX: a disc the lanes leave clear — x, y, r² in texels)                                                  // (the 4×4 thresholds, 0-1)
/* a beam of light standing on the ground (loot beacons, the level-up pillar): brightest at its foot, dithered away up its height, a dark hem so a pale beam reads on sand & snow */
const COLS=new Map();
function colStamp(W,H,rgb){ W=Math.max(1,Math.round(W)); H=Math.max(4,Math.round(H/4)*4); return fxLRU(COLS,64,W+'_'+H+'_'+rgb, ()=>{ const w=W+4, id=new ImageData(w,H), d=id.data, C=rgb.split(',').map(Number), hw=W/2+0.5, cxx=w/2;
  for(let y=0;y<H;y++){ const u=y/(H-1); for(let x=2;x<w-2;x++){ const q=Math.abs(x+0.5-cxx)/hw; if(q>=1) continue; const I=Math.pow(u,1.15)*(1-q*q*0.55)*4, b=Math.floor(I), lv=Math.min(4,b+((I-b)>(BAY4[((y&3)<<2)|(x&3)]+0.5)/16?1:0)); if(lv<=0) continue;
    const p=(y*w+x)*4; d[p]=C[0]; d[p+1]=C[1]; d[p+2]=C[2]; d[p+3]=lv*60; } }
  for(let y=0;y<H;y++) for(let x=0;x<w;x++){ const p=(y*w+x)*4; if(d[p+3]) continue; const nb=Math.max(x>0?d[p-1]:0, x<w-1?d[p+7]:0); if(nb>60) d[p+3]=Math.round(nb*0.4), d[p]=20, d[p+1]=12, d[p+2]=4; }   // (the hem)
  const cv2=document.createElement('canvas'); cv2.width=w; cv2.height=H; cv2.getContext('2d').putImageData(id,0,0); return {cv:cv2, ax:w>>1, ay:H-1}; }); }
function shadowSprC(rx,ry,col,a){ rx=Math.max(1,rx); ry=Math.max(1,ry); return tSpr('shc'+rx+'_'+ry+col+a, ()=>{ const S=PS(rx*2+2,ry*2+2), c=cIA(col,a); psDisc(S,rx+1,ry+1,rx,ry,()=>c); return psCv(S,rx+1,ry+1); }); }   // a hard drop shadow in the ground's own shade
function islShd(){ const I=ISL; if(I._shd) return I._shd; const B=TB[I.biome.key]||TB.tropic; return I._shd=I.cave?['#06040a',0.42]:[B.u[0], I.biome.key==='frost'?0.3:I.biome.key==='atoll'?0.3:0.4]; }   // (the forest floor's darkest — a shadow in the isle's own colour, never a flat green-black)
/* ---- chests (a side cache · the island HOARD) — locked (muted) · ready (bright gold) · opened (lid flung back, the hold emptied) ---- */
function chestSpr(big,locked,opened){ return tSpr('chest'+(big?1:0)+(locked?1:0)+(opened?1:0), ()=>{ const s=TSPR_S, k=Math.max(4,Math.round((big?12:8.5)*s)), w=2*k+3, cx=k+1, top=Math.round((opened?1.15:0.85)*k), h=top+Math.round(0.6*k)+3, cy=top+1, S=PS(w,h);   // anchor: the chest's centre (the old chest's footprint)
  const WD=cIR(locked?['#2a1e14','#3e2e20','#524030','#62503c','#76644c']:['#34200e','#583618','#7a4e22','#98662e','#bc8a44']), IRN=cIR(locked?['#1e1c18','#34302a','#4c4840']:['#221e18','#4a443a','#8a8474']);
  const GD=cIR(locked?['#2e2412','#4a3c20','#665430','#7a6a44']:['#7a4e0c','#b8841a','#ffd23f','#fff0a0']), IN=cIR(['#0e0804','#1c1208','#2e1e0c']), X0=1, X1=w-2;
  const wood=(y0,y1,lid)=>{ for(let y=y0;y<=y1;y++) for(let x=X0;x<=X1;x++){ let v=lid?3:2; if(y===y0) v=lid?4:3; else if(y===y1) v=0; else if(!lid && (y-y0)%3===0) v=1; if(x===X0 && v>0) v=Math.min(4,v+1); if(x===X1 && v>0) v--; psP(S,x,y,WD[v]); } };
  const straps=(y0,y1)=>{ const o=Math.max(1,Math.round(k*0.32)); for(const sx of [X0+o, X1-o]) for(let y=y0;y<=y1;y++) psP(S,sx,y,IRN[y===y0?2:(y===y1?0:1)]); };
  if(opened){ const lt=cy-Math.round(1.15*k), lb=lt+Math.max(2,Math.round(0.5*k))-1; for(let y=lt;y<=lb;y++) for(let x=X0;x<=X1;x++) psP(S,x,y,WD[y===lt?3:y===lb?0:1]);   // the lid flung open behind (its dark inside to us)
    const b0=cy-Math.round(0.45*k), b1=cy+Math.round(0.6*k)-1; wood(b0,b1,false); straps(b0,b1);
    const i0=b0+1, i1=Math.min(b1-1,b0+Math.max(2,Math.round(0.55*k))), ix0=X0+Math.max(1,Math.round(0.2*k)), ix1=X1-Math.max(1,Math.round(0.2*k));   // the emptied hold
    for(let y=i0;y<=i1;y++) for(let x=ix0;x<=ix1;x++) psP(S,x,y,IN[y===i0?0:y===i1?2:1]);
    if(big) for(let i=0;i<3;i++) psP(S,ix0+1+Math.floor(hash2(i,7)*Math.max(1,ix1-ix0-1)),i1-Math.floor(hash2(i,9)*2),GD[i===0?2:1]); }   // (a few coins left glinting)
  else { const lt=cy-Math.round(0.85*k), lb=lt+Math.max(2,Math.round(0.5*k))-1, b1=cy+Math.round(0.6*k)-1; wood(lt,lb,true); wood(lb+1,b1,false); straps(lt,b1);
    const lw=Math.max(1,Math.round(k*0.28)), lx0=cx-(lw>>1); for(let y=lt;y<=lb+1;y++) for(let x=lx0;x<lx0+lw;x++) psP(S,x,y,GD[y===lt?3:2]);   // the gold hasp over the lid
    const q=Math.max(2,Math.round(k*0.4)), qx=cx-(q>>1), qy=cy-Math.round(0.15*k); for(let y=qy;y<qy+q;y++) for(let x=qx;x<qx+q;x++) psP(S,x,y,GD[(x===qx||y===qy)?3:(x===qx+q-1||y===qy+q-1)?1:2]);   // the lock
    if(q>=3) psP(S,qx+(q>>1),qy+(q>>1),IN[0]); }                                                                                     // its keyhole
  return psCv(psOut(S,cI('#1a0e04'),false),cx,cy); }); }
function chestOutSpr(big,locked){ return tSpr('chestO'+(big?1:0)+(locked?1:0), ()=>{ const o=chestSpr(big,locked,false), w=o.w+2, h=o.h+2, id=o.cv.getContext('2d').getImageData(0,0,o.w,o.h).data, S=PS(w,h), G=cI('#ffd23f');   // a chest a foe stands over still shows through: its silhouette's edge & its gold, in texels
  const A=(x,y)=>x>=0&&y>=0&&x<o.w&&y<o.h&&id[(y*o.w+x)*4+3]>0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const ox=x-1, oy=y-1; if(A(ox,oy)){ const p=(oy*o.w+ox)*4; if(id[p]>200 && id[p+1]>150 && id[p+2]<120) psP(S,x,y,G); continue; } if(A(ox-1,oy)||A(ox+1,oy)||A(ox,oy-1)||A(ox,oy+1)) psP(S,x,y,G); }
  return psCv(psOut(S,cIA('#1a0e04',0.75),false),o.ax+1,o.ay+1); }); }
/* ---- projectiles: an arrow (32 ways — a pale shaft, a steel tip, red fletching, the dark line) · venom & pearls ---- */
function arrowSprT(di,gold){ return tSpr('arwt'+di+(gold?'g':''), ()=>{ const o=arrowSpr(di,gold), L=Math.max(5,Math.round(8*TSPR_S)), a=di*TAU/32, ux=Math.cos(a), uy=Math.sin(a), P=[];   // (G3 fix) the arrow WITH its 3-texel fading trail baked in — one blit a shot, not four
  for(let i=1;i<=3;i++) P.push([Math.round(-ux*(L+1+i)), Math.round(-uy*(L+1+i)), 0.5-i*0.13]);
  let x0=-o.ax, y0=-o.ay, x1=o.cv.width-o.ax, y1=o.cv.height-o.ay; for(const p of P){ x0=Math.min(x0,p[0]); y0=Math.min(y0,p[1]); x1=Math.max(x1,p[0]+1); y1=Math.max(y1,p[1]+1); }
  const c=document.createElement('canvas'); c.width=x1-x0; c.height=y1-y0; const g=c.getContext('2d'); g.fillStyle=gold?'#ffd86b':'#f2e6c8';
  for(const p of P){ g.globalAlpha=p[2]; g.fillRect(p[0]-x0,p[1]-y0,1,1); } g.globalAlpha=1; g.drawImage(o.cv,-o.ax-x0,-o.ay-y0); return {cv:c, ax:-x0, ay:-y0}; }); }
function arrowSpr(di,gold){ return tSpr('arw'+di+(gold?'g':''), ()=>{ const s=TSPR_S, L=Math.max(5,Math.round(8*s)), sz=L*2+7, c=sz>>1, a=di*TAU/32, ux=Math.cos(a), uy=Math.sin(a), S=PS(sz,sz);
  const SH=cI(gold?'#ffd86b':'#f2e6c8'), TP=cI(gold?'#fff6c8':'#e8eef4'), F1=cI('#ff5a4a'), F2=cI('#c8342a');
  for(let i=L;i>=0;i--) psP(S,Math.round(c-ux*i),Math.round(c-uy*i),i===0?TP:SH);
  psP(S,Math.round(c+ux),Math.round(c+uy),TP);                                                                                    // (the head, a texel proud of the shaft)
  const tx=c-ux*(L-0.5), ty=c-uy*(L-0.5); psP(S,Math.round(tx-uy*1.2),Math.round(ty+ux*1.2),F1); psP(S,Math.round(tx+uy*1.2),Math.round(ty-ux*1.2),F1);
  psP(S,Math.round(tx-ux-uy*1.2),Math.round(ty-uy+ux*1.2),F2); psP(S,Math.round(tx-ux+uy*1.2),Math.round(ty-uy-ux*1.2),F2);   // the red fletching (your scarf's red)
  return psCv(psOut(S,cI('#1a0e04'),false),c,c); }); }
const ELEM_LC={'#ff8a3c':1, '#8fd8ff':3, '#ffe55a':2, '#9be85a':4, '#ffffff':5};   // an element's colour → its light (LC: fire · ice · gold · firefly · white)
const ELEM_PAL={fir:['#6a220a','#ff8a3c','#fff0b0'], frs:['#163e5a','#8fd8ff','#ffffff'], sto:['#5a4a08','#ffe55a','#ffffff'], ven:['#27430f','#9be85a','#f4ffc0'], phy:['#3a3a3a','#d8d8d8','#ffffff']};   // an element's rim · body · core
function boltSpr(el,big){ return tSpr('bolt'+el+big, ()=>{ const R=Math.max(2,Math.round(2.2*TSPR_S))+(big?1:0), sz=R*2+3, c=sz>>1, S=PS(sz,sz), P=cIR(ELEM_PAL[el]||ELEM_PAL.phy);   // (C5a) a staff's bolt: an orb, its core hot
  psDisc(S,c+0.5,c+0.5,R+0.5,R+0.5,(nx,ny)=>{ const q=nx*nx+ny*ny; return q>0.55?P[0]:(q<0.18||(nx<-0.1&&ny<-0.1&&q<0.35))?P[2]:P[1]; }); return psCv(S,c,c); }); }
function blobSpr(kind,R){ return tSpr('blob'+kind+R, ()=>{ const sz=R*2+3, c=sz>>1, S=PS(sz,sz), P=kind==='pearl'?cIR(['#6a4a2a','#f0e6d2','#ffffff']):kind==='coco'?cIR(['#2a1a0a','#6a4a22','#b08a52']):kind==='lava'?cIR(['#3a0a04','#ff5a1a','#ffe070']):cIR(['#27430f','#d8ff5a','#f4ffc0']);   // (C8a coco: a brown husk, a pale glint · C8c lava: a crust round a molten core)
  psDisc(S,c+0.5,c+0.5,R+0.5,R+0.5,(nx,ny)=>{ const q=nx*nx+ny*ny; return q>0.5?P[0]:(nx<-0.15&&ny<-0.15&&q>0.08?P[2]:P[1]); });
  return psCv(S,c,c); }); }
/* ---- gear on the ground (C4b §6.9): its slot's pixel icon · a Driftwood piece wears a twine knot, no beam ---- */
function itemIcon(it){ return pxiCv(IB(it).ic)||pxiCv('bag'); }
const ITFX=new Map();                                                                     // a find's baked pool of light & its lighthouse cone (per tier, per 1/16 turn) — never per-texel fills in a frame
/* (G3 fix) a SETTLED find below Pearl, baked whole — its shadow, pool of light, beam, twine knot & icon in one canvas per (tier · icon · scale · bob ·
   one of 6 pulse steps · the ground's shade), shared by every drop alike: one drawImage a frame instead of four or five (60 finds were ~1 ms) */
const ITBK=new Map();
function itBake(d,s,bob,SHD){ let V=d._bv; if(!V || d._bs!==s || d._bh!==SHD){ const gm=d.k==='gem', r=gm?GEM_RAR[GEMS[d.gm.g].r].t:d.it.r;   // (the drop holds its variants' row — a steady frame is one index, no key)
    if(r>=3){ d._bv=V={r, v:null}; } else { const icn=gm?GEMS[d.gm.g].ic:((IB(d.it)||{}).ic||'bag'), k=r+'|'+icn+'|'+Math.round(s*20)+'|'+SHD[0]+'|'+SHD[1]; V=ITBK.get(k); if(!V){ if(ITBK.size>160) ITBK.clear(); V={r, icn, gm, v:[]}; ITBK.set(k,V); } d._bv=V; }
    d._bs=s; d._bh=SHD; }
  if(!V.v) return null;                                                                                   // (a Pearl's turning cone & an Abyssal's motes keep their own draw)
  const r=V.r, st=r>=2?(((Math.sin(itime*TAU/1.2+d.x)+1)*3)|0)%6:0, vi=bob*6+st; return V.v[vi]||(V.v[vi]=itBake1(r,V.icn,V.gm,s,bob,st,SHD)); }
function itBake1(r,icn,gm,s,bob,st,SHD){
    const R=IRAR[r], ic=pxiCv(icn)||pxiCv('bag'), sh=shadowSprC(3,1,SHD[0],SHD[1]*0.8), L=[[sh.cv,-sh.ax,1-sh.ay,1]];      // the layers, as the old draw laid them: [canvas, x, y, alpha] from the drop's foot
    if(R.bm){ const bp=r===1?0.8:0.62+0.38*(-1+(st+0.5)/3), B=colStamp(R.bm[1],R.bm[0]*s,R.rgb), P=itPool(r,s); L.push([P.cv,-P.ax,1-P.ay,0.16+0.12*bp], [B.cv,-B.ax,-bob-B.ay,0.55+0.4*bp]); }
    if(r===0 && !gm){ const kn=pxiCv('knot'); if(kn) L.push([kn,2,-bob,1]); }
    const ix=-(ic.width>>1), iy=-bob-(ic.height>>1); L.push([ic,ix,iy,1]);
    let x0=1e9, y0=1e9, x1=-1e9, y1=-1e9; for(const q of L){ x0=Math.min(x0,q[1]); y0=Math.min(y0,q[2]); x1=Math.max(x1,q[1]+q[0].width); y1=Math.max(y1,q[2]+q[0].height); }
    const c=document.createElement('canvas'); c.width=Math.max(1,x1-x0); c.height=Math.max(1,y1-y0); const g=c.getContext('2d'); g.imageSmoothingEnabled=false;
    for(const q of L){ g.globalAlpha=q[3]; g.drawImage(q[0],q[1]-x0,q[2]-y0); }
    return {cv:c, ax:-x0, ay:-y0, ix, iy}; }
function itPool(r,s){ return fxLRU(ITFX,48,'p'+r+'_'+Math.round(s*20), ()=>{ const rx=Math.max(1,Math.round((6+r*2)*s)), ry=Math.max(1,Math.round((2.5+r*0.8)*s)), c=document.createElement('canvas'); c.width=rx*2+1; c.height=ry*2+1;
  const g=c.getContext('2d'); g.fillStyle=IRAR[r].c; pxEll(g,rx,ry,rx,ry); return {cv:c, ax:rx, ay:ry}; }); }
function itCone(r,ai,s){ return fxLRU(ITFX,48,'c'+r+'_'+ai+'_'+Math.round(s*20), ()=>{ const L=Math.max(4,Math.round(34*s)), H=Math.max(2,Math.round(17*s)), c=document.createElement('canvas'); c.width=L*2+3; c.height=H*2+3;
  const g=c.getContext('2d'), cx=L+1, cy=H+1, a0=ai/16*TAU; g.fillStyle=r>=4?'#b58cff':'#fff3c0';
  for(let k=-2;k<=2;k++){ const a=a0+k*0.07, x1=cx+Math.cos(a)*L, y1=cy+Math.sin(a)*H, n=Math.max(1,Math.round(Math.max(Math.abs(x1-cx),Math.abs(y1-cy)))); for(let i=0;i<=n;i++){ const t=i/n; g.fillRect(Math.round(cx+(x1-cx)*t),Math.round(cy+(y1-cy)*t),1,1); } }
  return {cv:c, ax:cx, ay:cy}; }); }
/* ---- the cave's fixtures: the rope (swaying in 3 frames · lit = your way up) and the stairs / the cave mouth's arch ---- */
function ropeSpr(lit,f){ return tSpr('rope'+(lit?1:0)+f, ()=>{ const s=TSPR_S, H=Math.round(70*s), sw=(f-1)*Math.max(1,Math.round(1.5*s)), cw=Math.max(3,Math.round(6*s)), ch=Math.max(1,Math.round(2.6*s)), w=cw*2+7, h=H+ch+6, c=w>>1, by=H+2, S=PS(w,h);   // anchor: the rope's foot
  const RC=cIR(lit?['#8a6a3a','#d8b070','#f4dca4']:['#4e3a20','#8a6a3a','#a8844e']), bot=by-Math.max(2,Math.round(4*s));
  for(let i=0;i<=H*2;i++){ const t=i/(H*2); psP(S,Math.round(c+2*t*(1-t)*sw),Math.round(by-H+t*(bot-(by-H))),RC[1]); }
  for(let k=1;k<6;k++){ const t=k/6, x=Math.round(c+2*t*(1-t)*sw), y=Math.round(by-H+t*(bot-(by-H))); psP(S,x,y,RC[2]); psP(S,x+1,y,RC[1]); psP(S,x,y+1,RC[0]); psP(S,x+1,y+1,RC[0]); }   // knots
  for(let i=0;i<64;i++){ const a=i/64*TAU; psP(S,Math.round(c+Math.cos(a)*cw),Math.round(by+Math.sin(a)*ch),Math.sin(a)<0?RC[2]:RC[1]); }   // the coil at its foot
  return psCv(psOut(S,cI('#1a0e04'),false),c,by); }); }
function upTriSpr(){ return tSpr('uptri', ()=>{ const s=TSPR_S, R=Math.max(3,Math.round(5*s)), S=PS(R*2+3,R+3), c=R+1, A=cI('#fffbe6'), B=cI('#ffe9a6'); for(let y=0;y<R;y++) for(let x=-y;x<=y;x++) psP(S,c+x,1+y,y===0?A:B); return psCv(psOut(S,cI('#1a0e04'),false),c,R+1); }); }
function stairSpr(mouth){ return tSpr('stair'+(mouth?1:0)+(ISL.cave?'c':''), ()=>{ const s=TSPR_S, w=Math.max(4,Math.round(13*s)), h=Math.max(3,Math.round(9*s)), m=mouth?Math.round(10*s)+2:2, W=w*2+m*2+3, Hh=h*2+m*2+5, cx=W>>1, cy=(Hh>>1)+1, S=PS(W,Hh);   // anchor: the hole's centre
  const HO=cI('#07040e'), ST=cIR(['#6c6488','#5a5276','#4a4262','#3a3350']), AR=cIR(['#2a2622','#6a6258','#8a8276','#a39a8a','#c4bcaa']);
  psDisc(S,cx+0.5,cy+0.5,w,h,()=>HO);                                                                                          // the hole into the dark
  const sh=Math.max(1,Math.round(1.4*s)); for(let k=0;k<4;k++){ const yy=Math.round(cy-h*0.5+k*h*0.34), ww=Math.round(w*(0.85-k*0.16)); for(let y=yy;y<yy+sh;y++) for(let x=cx-ww;x<=cx+ww;x++) psP(S,x,y,ST[k]); }   // the steps, dimming down
  if(mouth) for(let i=0;i<9;i++){ const a=Math.PI*1.02+i/8*Math.PI*0.96, bx=Math.round(cx+Math.cos(a)*(w+4*s)), by=Math.round(cy+Math.sin(a)*(h+6*s)-2*s), q=Math.max(2,Math.round(3*s));   // the arch: a ring of dressed stones, lit top-left
    for(let y=-q;y<=q;y++) for(let x=-q;x<=q;x++){ const e=Math.max(Math.abs(x),Math.abs(y))===q; psP(S,bx+x,by+y,e?AR[0]:(x+y<-1?AR[i%2?3:4]:x+y>1?AR[1]:AR[i%2?2:3])); } }
  return psCv(psOut(S,cI('#0c0810'),false),cx,cy); }); }
/* ---- YOU: the identity ring (cream — a colour no foe wears — with a dark outer texel; half = its front arc only) · an x-ray rim when the crowd closes in ---- */
function youRingSpr(rx,ry,half){ return tSpr('you'+rx+'_'+ry+(half?'h':''), ()=>{ const S=PS(rx*2+5,ry*2+5), c=cI('#fff0c0'), d=cI('#1a0e04'), cx=rx+2, cy=ry+2, n=Math.ceil((rx+ry)*5);
  for(let i=0;i<n;i++){ const a=i/n*TAU; psP(S,Math.round(cx+Math.cos(a)*rx),Math.round(cy+Math.sin(a)*ry),c); }
  const o=[]; for(let y=0;y<S.h;y++) for(let x=0;x<S.w;x++){ const i=y*S.w+x; if(S.d[i]) continue; const nx=(x-cx)/rx, ny=(y-cy)/ry; if(nx*nx+ny*ny<1) continue;   // (the dark texel only OUTSIDE the ring)
    if((x>0&&S.d[i-1]===c)||(x<S.w-1&&S.d[i+1]===c)||(y>0&&S.d[i-S.w]===c)||(y<S.h-1&&S.d[i+S.w]===c)) o.push(i); }
  for(const i of o) S.d[i]=d; if(half) for(let y=0;y<cy;y++) for(let x=0;x<S.w;x++) S.d[y*S.w+x]=0;
  return psCv(S,cx,cy); }); }
function creamOf(o){ if(o.crm) return o.crm; const c=document.createElement('canvas'); c.width=o.w; c.height=o.h; const g=c.getContext('2d'); g.drawImage(o.cv,0,0); g.globalCompositeOperation='source-in'; g.fillStyle='#fff0c0'; g.fillRect(0,0,o.w,o.h); return o.crm={cv:c}; }
