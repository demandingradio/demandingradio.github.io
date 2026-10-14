"use strict";
/* FILE: js/render/terrain.js
THE CRAWL TERRAIN PAINTERS (STAGE 3, THE GROUND, second part): original lines 23058-23595 (build 5109cd5), moved verbatim,
  in place directly after js/render/pixkit.js; the props you smash follow at original line 23596 (build 5109cd5).
Three parts: the terrain chunk bake (terrTile, TERR_K and terrKV, terrPrep and terrState build ISL._T; the value noise nLat and
  nS_; the texel classes TC_WALL ... TC_FLAG with the shallows, bridge, tall-grass and flagstone texel painters; terrBake
  classifies, colours and decals one 64x64-texel chunk; mixW, greyW, DCOL and terrDecal); the rock ramps and small painted
  things (RKR, rkRamp, propRamp, the dr* painters, drSpriteOf, DR_SIZE, drSpr, trPick) with terrSprites, a chunk's sprite
  pass; and the per-frame draw (TERR_VIS, terrDraw, terrWater, the trample, rubble, bramble, ice and bog patch sprites, and
  terrOverlay, what changed since the bake).
Entry points: terrDraw and terrOverlay (drawIslandWorld); terrBake (terrDraw, sanctPre); TERR_VIS (the light layer and the
  ambience); nLat and nS_ (slPrep, slRows in js/render/sea_lands.js); rkRamp and drReeds (slSpr, flagBaseSpr); drPuff
  (nodeSpr, puffSprH); mixW (townWater, dressMuseum). ISL._T is shared with terrEvict, sanctPre, the dev ground tools and mkStamp.
Globals it owns: the consts TERR_K, TC_WALL ... TC_FLAG (18), CHS_C, CHS_ICE, FET_C, GRASS_TIP, GRASS_TI, ASH_C, FROND_C,
  FROND_TIP, CRYROCK, BRT, BRG_C, FLAG_MOSS, CAVE_DEC, DCOL, RKR, DR_SIZE, TSP_L, TSP_G, TERR_VIS and TOV_ICE; the lets
  FROND_I and CRYROCK_I; the functions named above plus shalTexel, brgTexel, tallTexel, flagTexel and the dr* painters.
Main globals it reads from elsewhere (inside functions, at runtime only): ISL, ITUNE (the terr* knobs), the W_* and G_* codes,
  clamp and hash2; TB, TBI, caveTI, PS and the ps* kit, tSpr, treeSpr and TSPR_S (js/render/pixkit.js; terrState sets TSPR_S
  and TSPR_V); cvRails, cvDressTab, cvColSpr, cvRailDraw, drRail, sanctPre, mixHex and cavePal (the caves, an earlier script);
  declared later: islScale, mkStamp, G_BRIDGE and ISL_LVL.
Load-time statements: original lines 23103 (CHS_C, CHS_ICE) and 23104 (FET_C) call cIR; 23114 (ASH_C), 23124 (BRG_C) and
  23335-23339 (DCOL) call cI (build 5109cd5); both come from js/render/pixkit.js, which loads first. The rest are literal
  consts, empty arrays and function declarations.
*/
function terrTile(P,tx,ty){ if(tx>=0&&ty>=0&&tx<P.W&&ty<P.H){ const v=P.T0[ty*P.W+tx]; return v===W_CRACK?W_WALL:v===W_PROP?W_GROUND:v; } if(P.CV) return W_WALL;   // (PT1 K7: a solid prop bakes as the ground under it — it draws live, so breaking it never re-bakes) (C8b: a cracked wall bakes as forest / rock — terrOverlay draws its crack)   // past the grid: forest (or rock) forever — or the sea, straight on from the shore that reaches the edge
  const v=P.T0[clamp(ty,0,P.H-1)*P.W+clamp(tx,0,P.W-1)]; return v===W_WATER?W_WATER:W_WALL; }
const TERR_K=['terrEdge','terrDither','terrPatch','terrDecal','terrAO','terrTrail','terrTrailFade','terrTrees','terrBeach','terrDress','terrCliff'];
function terrKV(){ let h=0; for(let i=0;i<TERR_K.length;i++) h=h*3.7+(+ITUNE[TERR_K[i]]||0)*(i+1.3); return h+(ISL&&ISL.core&&!ISL.cave?ISL_LVL:0)*1e-3; }   // (the isle's danger is baked in too)
function terrPrep(I){ const T0=I.tiles0||(I.tiles0=I.tiles.slice()), W=I.W, H=I.H, TS=I.TS, CV=!!I.cave, bk=I.biome.key, P={I,T0,W,H,TS,CV,bk,B:TBI(bk),C:CV?caveTI(I.biome):null,bog:I.bog||null,gnd:I.gnd||null,brg:I.brg||null,fet:I.fet||null};   // (PT1 K6: the ground layer & a lake's bridges · K9b: the mire's fetid pools)
  const wd=new Uint8Array(W*H).fill(9), q=[]; for(let k=0;k<W*H;k++) if(T0[k]===W_WATER){ wd[k]=0; q.push(k); }                     // tiles from the water (the beach follows the waterline)
  for(let i=0;i<q.length;i++){ const k=q[i], d=wd[k]+1; if(d>8) continue; const x=k%W;
    if(x>0&&wd[k-1]>d){ wd[k-1]=d; q.push(k-1); } if(x<W-1&&wd[k+1]>d){ wd[k+1]=d; q.push(k+1); } if(k>=W&&wd[k-W]>d){ wd[k-W]=d; q.push(k-W); } if(k<W*(H-1)&&wd[k+W]>d){ wd[k+W]=d; q.push(k+W); } }
  P.wd=wd;
  if(I.spT){ P.spT=I.spT; if(!CV) P.CF=caveTI(I.biome); for(const c of I.clearings){ const S=c.spD; if(S && S.ramp){ if(!P.rmp) P.rmp=new Uint8Array(W*H); for(const k of S.ramp) P.rmp[k]=S.rd; } } }   // (PT1 K10a) set pieces: a chasm's & a cliff's strata in the shore's own stone · a ledge's ramp (its steps)
  if(I.rings) P.rg=I.rings.map(g=>({x:g.x, y:g.y, R:g.R}));                                                                        // (PT1 K10b) an arena ring's trodden floor
  for(const c of I.clearings) if(c.spD && c.spD.dais){ if(!P.dais) P.dais=new Set(); for(const k of c.spD.dais) P.dais.add(k); }      // (PT1 K10b) a temple altar's raised dais
  if(CV){ let pm=null; for(const c of I.clearings){ const F=c.cvF; if(!F) continue; const L=[]; for(const q of F.pil) L.push([q[0],q[1],2]); for(const q of F.stal) L.push([q[0],q[1],1]); if(F.col) L.push([F.col[0],F.col[1],3]);   // (G7 fix) the rock that STANDS in a room — a hall's pillars & column,
      for(const [x,y,z] of L){ if(!pm) pm=new Uint8Array(W*H); for(let dy=0;dy<z;dy++) for(let dx=0;dx<z;dx++) pm[(y+dy)*W+x+dx]=1;
        if(F.a==='crystal' && z>1){ const pc=P.pcr||(P.pcr=new Uint8Array(W*H)); for(let dy=-1;dy<=z;dy++) for(let dx=-1;dx<=z;dx++) pc[(y+dy)*W+x+dx]=1; (P.pcl||(P.pcl=[])).push([x,y,z]); } } } P.pm=pm; }   // (DE5: a cathedral's columns bake as crystal rock — their tiles & a ring round them — and wear clusters of crystal: terrSprites)   //  a cavern's stalagmites: terrBake gives it a lit cap & a short face
  const tw=(x,y)=>terrTile(P,Math.floor(x/TS),Math.floor(y/TS)), segs=[];                                                        // the worn trails: centre → centre, full through the corridor, fading into each clearing
  for(let i=1;i<I.clearings.length;i++){ const g=I.gates[i-1]; if(!g) continue; const a=I.clearings[g.par!=null?g.par:g.from], b=I.clearings[i]; if(!a||!b) continue;
    const L=Math.hypot(b.x-a.x,b.y-a.y); if(L<4) continue; let t0=0.5, t1=0.5;
    for(let t=0;t<=1;t+=3/L){ const v=tw(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t); if(v!==W_GROUND&&v!==W_ICE){ t0=t; break; } }
    for(let t=1;t>=0;t-=3/L){ const v=tw(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t); if(v!==W_GROUND&&v!==W_ICE){ t1=t; break; } }
    if(t1<t0) t1=t0; segs.push({ax:a.x,ay:a.y,bx:b.x,by:b.y,L,t0,t1}); }
  if(!CV && I.shore){ const c=I.clearings[0], bt=I.landing; segs.push({ax:bt.x,ay:bt.y,bx:c.x,by:c.y,L:Math.hypot(c.x-bt.x,c.y-bt.y)||1,t0:0,t1:0}); }   // (a scuffed track up the beach from the boat)
  for(const g of segs){ g.x0=Math.min(g.ax,g.bx); g.x1=Math.max(g.ax,g.bx); g.y0=Math.min(g.ay,g.by); g.y1=Math.max(g.ay,g.by); }
  P.segs=segs; P.stones=[]; P.slabs=[]; P.hoard=null; P.gcells=[]; P.rails=CV?cvRails(I):null; if(P.rails && !P.rails.length) P.rails=null;   // (DE4: the Old Workings' track)
  for(const g of I.gates) for(const c of g.cells) P.gcells.push([(c[0]+0.5)*TS,(c[1]+0.5)*TS,(c[0]*7+c[1]*13)%4]);   // every doorway: trampled canes underfoot (a shut gate's brambles are drawn over them)
  const hc=I.hoardId>=0?I.clearings[I.hoardId]:null;                                                                                   // ENV-14: the hoard's ring of ancient stones · a cache's mossy slabs
  if(hc && !CV){ const R=clamp(hc.r0*0.55,52,84), n=7, ph=hash2(I.core.idx|0,77)*TAU; P.hoard={x:hc.x,y:hc.y,R:R*0.8};
    for(let k=0;k<n;k++){ const a=ph+k*TAU/n, x=hc.x+Math.cos(a)*R, y=hc.y+Math.sin(a)*R*0.86, v=tw(x,y);
      if(v!==W_GROUND&&v!==W_PATH) continue; if(hc.gx!==undefined && Math.hypot(x-hc.gx,y-hc.gy)<40) continue; if(I.mouthP && Math.hypot(x-I.mouthP.x,y-I.mouthP.y)<34) continue;
      P.stones.push({x,y,v:k}); } }
  if(!CV) for(const cl of I.clearings){ if(cl.kind!=='bonus') continue; for(let k=0;k<4;k++){ const a=Math.PI/4+k*Math.PI/2+(hash2(cl.id,k)-0.5)*0.4, x=cl.x+Math.cos(a)*22, y=cl.y+Math.sin(a)*19; if(tw(x,y)===W_GROUND) P.slabs.push({x,y,v:k}); } }
  return P; }
function terrState(){ const s=islScale(), I=ISL, kv=terrKV(); let T=I._T;
  if(TSPR_S!==s || TSPR.size>2500){ TSPR.clear(); TSPR_S=s; TSPR_V++; }   // (a new texel repaints every sprite · a long voyage's biomes never pile up)
  if(!T || T.s!==s || T.kv!==kv){ T=I._T={m:new Map(), s, kv, CT:64, cap:320, P:terrPrep(I), fr:0, bakes:0, bakeMs:0, gs:[], is:[], fade:T?0:ITUNE.landFade|0}; }   // (fade: a fresh isle fades in from black while its view bakes)
  return T; }
/* value noise with a period of P world units, sampled texel by texel over one bake's region (lattice + per-column / per-row weights: 4 reads a texel) */
function nLat(P,salt,X0,Y0,EW,EH,s){ const k=1/(P*s), gx0=Math.floor((X0+0.5)*k), gy0=Math.floor((Y0+0.5)*k), nx=Math.floor((X0+EW-0.5)*k)-gx0+2, ny=Math.floor((Y0+EH-0.5)*k)-gy0+2, v=new Float32Array(nx*ny);
  for(let j=0;j<ny;j++) for(let i=0;i<nx;i++) v[j*nx+i]=hash2((gx0+i)*7+salt*131, (gy0+j)*11-salt*57);
  const xi=new Int32Array(EW), xf=new Float32Array(EW), yi=new Int32Array(EH), yf=new Float32Array(EH);
  for(let i=0;i<EW;i++){ const g=(X0+i+0.5)*k, f=Math.floor(g), t=g-f; xi[i]=f-gx0; xf[i]=t*t*(3-2*t); }
  for(let j=0;j<EH;j++){ const g=(Y0+j+0.5)*k, f=Math.floor(g), t=g-f; yi[j]=(f-gy0)*nx; yf[j]=t*t*(3-2*t); }
  return {v,nx,xi,xf,yi,yf}; }
function nS_(o,ix,iy){ const i=o.yi[iy]+o.xi[ix], v=o.v, fx=o.xf[ix], a=v[i]+(v[i+1]-v[i])*fx, b=v[i+o.nx]+(v[i+o.nx+1]-v[i+o.nx])*fx; return a+(b-a)*o.yf[iy]; }
const TC_WALL=1, TC_WATER=2, TC_ICE=3, TC_G=4, TC_SAND=5, TC_WET=6, TC_TRAIL=7, TC_FACE=8, TC_LAVA=9, TC_BOG=10, TC_BRIDGE=11, TC_TALL=12, TC_ASH=13, TC_SHAL=14, TC_CHASM=15, TC_CLIFF=16, TC_LEDGE=17, TC_FLAG=18;   // (PT1 K9a: tall grass · burnt grass · K9b: the shallows · K10a: a chasm · a ledge's cliff · its raised ground · K10b: a temple's flagstones)
const CHS_C=cIR(['#0a0810','#141018','#5a1a0a']), CHS_ICE=cIR(['#16283a','#22405a','#325e7e','#4c80a2','#7eb0d0','#bfe2f2']);   // (PT1 K10a) a chasm's void (deep · near its walls · a lava glow far below) · a frost crevasse's ice-blue walls
const FET_C=cIR(['#1c2a0c','#2c4012','#3e5a18','#5a6a22','#6a8a2a','#9cc040']);   // (PT1 K9b) a FETID pool: sickly green water (dark → light) · its scummed lip · a glint of scum
/* (PT1 K9b) a SHALLOWS texel (global X,Y · iv the floor's shade · a its water-ness · cb the floor's own class under it · S the bake's water & cache): the floor
   seen through the water (45% the shore's shallow water) · a darker wet line at its edge · 1-texel ripple arcs, a lighter shade, on a loose lattice */
function shalTexel(X,Y,iv,a,cb,S){ const pi=S.CV?4:cb===TC_SAND?1:cb===TC_WET?2:cb===TC_TRAIL?3:0, R=S.R[pi], j=pi===2?Math.min(2,iv>>1):Math.min(iv,R.length-1), key=pi*8+j;
  let C=S.m[key]; if(!C){ const b=mixW(R[j],S.W,0.45); C=S.m[key]=[b, mixW(R[Math.max(0,j-1)],S.Wd,0.5), mixW(b,S.L,0.38), mixW(R[j],S.W,0.56)]; }   // (body · the wet edge · a ripple's light · the deeper middle — made once a bake)
  if(a<0.54) return C[1];
  const cx=Math.floor(X/7), cy=Math.floor(Y/5), u=X-cx*7, v=Y-cy*5, h=hash2(cx*13+5,cy*7+11);
  if(h<0.3){ const v0=1+((h*31)|0)%3; if((v===v0 && u>=2 && u<=4) || (v===v0+1 && (u===1||u===5))) return C[2]; }   // (a little ⌒ of light on the water)
  return a>0.86+bayV(X,Y)*0.12 ? C[3] : C[0]; }
const GRASS_TIP={moor:['#9a64b8','#c08ad8'], meadow:['#f4f0e0','#ffe680','#f4b4c8'], swamp:['#6a4428','#8a5a34'], ember:['#c8602a','#d8823a'], savanna:['#d8c87a','#e4d690'], bamboo:['#a8c860','#c8d488'], tropic:['#7ab86a','#9ad07a']};   // (PT1 K9a) the blades' tips per shore: heather · tall flowers · cattails · russet · straw · bamboo leaf · palm-green
const GRASS_TI={}, ASH_C={a1:cI('#2a2624'), a2:cI('#3a3430'), a3:cI('#5a5450'), e1:cI('#ff8a3c'), e2:cI('#a8401c')};   // (their ImageData words — made once a shore) · burnt grass: grey-black, a few embers
const FROND_C=['#0e1a14','#16281e','#22382c','#2e4a3e','#4a7a5e','#7ab08a'], FROND_TIP=['#b8fff4','#e8ff8a','#d8a6ff']; let FROND_I=null;   // (SEAS & DEPTHS DE5) a fungal grotto's FRONDS: deep moss-green blades, tips that glow (cyan · lime · violet)
const CRYROCK=['#10162a','#18223c','#223252','#2e4670','#425f90','#6488b8']; let CRYROCK_I=null;   // (DE5) a cathedral column's crystal rock: deep blue, lit toward its crown
/* (PT1 K6) a lake's plank bridge, texel by texel (global texel X,Y at scale s): which bridge, across (xc of wc) & along (ya of la), over water or the shore → BRT (reused) or null */
const BRT={b:null, xc:0, wc:0, ya:0, la:0, wet:false};
function brgTexel(BR,X,Y,s,TS){ const px=X+0.5, py=Y+0.5;
  for(const b of BR){ const x0=b.x0*TS*s, x1=(b.x1+1)*TS*s, y0=b.y0*TS*s, y1=(b.y1+1)*TS*s; if(px<x0||px>=x1||py<y0||py>=y1) continue;
    const A=b.v?Y:X, a0=Math.ceil((b.v?y0:x0)-0.5), a1=Math.ceil((b.v?y1:x1)-0.5), C=b.v?X:Y, c0=Math.ceil((b.v?x0:y0)-0.5), c1=Math.ceil((b.v?x1:y1)-0.5), t=Math.floor((A+0.5)/(TS*s));   // (whole texels: the first & one past the last whose centre is on it)
    BRT.b=b; BRT.xc=C-c0; BRT.wc=c1-c0; BRT.ya=A-a0; BRT.la=a1-a0; BRT.wet=t>=b.w0&&t<=b.w1; return BRT; }
  return null; }
const BRG_C={p1:cI('#8a6a44'), p2:cI('#a07a4a'), p3:cI('#7a5a38'), gap:cI('#3a2a1a'), rope:cI('#c8b890'), post:cI('#1a120a')};
/* (PT1 K9a) a TALL GRASS texel (global X,Y · iv the floor's own shade · a its patch-ness): a dark rim round the patch · inside, a field of TUFTS on a
   4×4 lattice, each row shifted its own way (each a crown of 3 blades: a lit centre tip, two lit side tips, a body, the shadow under it) on ground a step darker than the floor —
   now & then a tip in the shore's own colour (heather, a flower, a cattail, straw) and a gap between the tufts */
function tallTexel(X,Y,iv,a,G,T,bv){ const SH=G[Math.max(0,iv-2)]; if(a<0.56) return SH;
  const cx=Math.floor(X/4), oy=(hash2(cx*7+1,31)*4)|0, ry=Math.floor((Y+oy)/4), h=hash2(cx*7+ry*13,ry*11-cx*3+5), g=hash2(cx*3+ry*17+7,ry*5-cx+13), B0=G[Math.max(0,iv-1)];
  const u=X-cx*4-(g<0.5?0:1), v=Y+oy-ry*4;                                                                                    // (G9 fix: columns of tufts, each column dropped its own way, each tuft nudged a texel — no woven rows)
  if(u<0 || u>2 || h<0.15) return bv>0.3?SH:B0;                                                                              // (between the tufts — ~15% of the lattice left bare)
  if(v===3) return SH; if(v===2) return G[iv];
  if(v===1) return u===1?G[iv]:G[Math.min(5,iv+1)];
  if(u!==1 || (g*8)%1<0.3) return B0;                                                                                        // (a third of them a texel shorter: no centre tip)
  if(h>0.8) return T[((h*97)|0)%T.length];                                                                                   // (the shore's own tip — greyed with her danger, as the fringe's are)
  return G[Math.min(5,iv+2)]; }
/* (PT1 K10b) a FLAGSTONE texel (a temple's plaza — global X,Y · iv the floor's shade · a its plaza-ness · R the shore's path stone · GT the grout · MO moss or 0):
   slabs 6 texels square in offset rows, each its own shade, its top edge lit & its foot shaded · dark grout between (moss in it on the green shores) · a few
   slabs cracked across · the rim worn ragged into the ground */
const FLAG_MOSS={tropic:'#3c5c2e', meadow:'#46682e', swamp:'#3a5226', crystal:'#3e5a5c', moor:'#4a3e5a'};
function flagTexel(X,Y,iv,a,R,GT,MO){ const n=R.length-1; if(a<0.58) return R[Math.max(0,Math.min(n,iv)-1)];
  const row=Math.floor(Y/6), sx=X+((row&1)?3:0), col=Math.floor(sx/6), u=sx-col*6, v=Y-row*6, h=hash2(col*13+row*7+1,row*11-col*5+3);
  if(u===0 || v===0) return (MO && hash2(X*3+1,Y*5+2)<0.3) ? MO : GT;                                                         // the grout (moss in it now & then)
  if(h<0.09 && v<5 && u===((1+((h*97)|0)%4+v)%5)+1) return GT;                                                                  // a cracked slab
  if(h>0.95) return R[Math.max(0,Math.min(n,iv)-2)];                                                                             // (one gone — the earth beneath)
  let k=Math.min(n,iv)+(h<0.33?-1:h>0.72?1:0); if(v===1) k++; else if(v===5 || u===5) k--; return R[clamp(k,0,n)]; }
/* ---- one chunk: the texel pass (class & shade), the decals, then the sprites (dressing, the ring, shadows, the forest y-sorted) ---- */
function terrBake(T,cx,cy){ const tS=performance.now(), P=T.P, I=P.I, CT=T.CT, s=T.s, TS=P.TS, CV=P.CV, B=P.B, CP=P.C;
  const FH=CV?Math.max(3,Math.round(ITUNE.terrCliff*s)):0, M=5, MB=Math.max(M,FH+2), EW=CT+2*M, EH=CT+M+MB, X0=cx*CT-M, Y0=cy*CT-M, N=EW*EH;
  const EA=ITUNE.terrEdge*(CV?1.7:1), DA=ITUNE.terrDither, PK=ITUNE.terrPatch, AK=ITUNE.terrAO;
  const nL=nLat(170,11,X0,Y0,EW,EH,s), nM=nLat(46,23,X0,Y0,EW,EH,s), nSx=nLat(6.5,37,X0,Y0,EW,EH,s), nE=nLat(24,51,X0,Y0,EW,EH,s), nE2=nLat(8,67,X0,Y0,EW,EH,s);
  const dxS=Math.round(7*s), dyS=Math.round(9*s);                                                                                    // where the top-left light is blocked from (the directional shade)
  const tx0=Math.floor((X0-dxS)/s/TS)-1, ty0=Math.floor((Y0-dyS)/s/TS)-1, TW=Math.floor((X0+EW)/s/TS)+2-tx0+1, TH=Math.floor((Y0+EH)/s/TS)+2-ty0+1;
  const lw=new Float32Array(TW*TH), la=new Float32Array(TW*TH), li=new Float32Array(TW*TH), ld=new Float32Array(TW*TH), lv=new Float32Array(TW*TH), lb=new Float32Array(TW*TH); let anyW=0, anyI=0, anyL=0, anyB=0, anyG=0, anyX=0;
  const lg=P.gnd?new Float32Array(TW*TH):null, lx=P.gnd?new Float32Array(TW*TH):null, lsh=P.gnd?new Float32Array(TW*TH):null; let anyS=0;   // (PT1 K9a: tall grass · ash · K9b: the shallows)
  const SPT=P.spT, lc=SPT&&SPT.ch?new Float32Array(TW*TH):null, lcf=SPT&&SPT.cf?new Float32Array(TW*TH):null, lld=SPT&&SPT.ld&&P.gnd?new Float32Array(TW*TH):null; let anyC=0, anyCf=0, anyLd=0;   // (PT1 K10a: a chasm · a ledge's cliff · its raised ground)
  const lfl=SPT&&SPT.fl&&P.gnd?new Float32Array(TW*TH):null, RGc=P.rg?P.rg.filter(g=>g.x+g.R>=X0/s-20 && g.x-g.R<=(X0+EW)/s+20 && g.y+g.R>=Y0/s-20 && g.y-g.R<=(Y0+EH)/s+20):null; let anyF=0;   // (PT1 K10b: a temple's flagstones · an arena ring's trodden floor)
  for(let j=0;j<TH;j++) for(let i=0;i<TW;i++){ const tx=tx0+i, ty=ty0+j, v=terrTile(P,tx,ty), k=j*TW+i;
    lw[k]=v===W_WALL?1:0; if(v===W_WATER){ la[k]=1; anyW=1; } if(v===W_ICE){ li[k]=1; anyI=1; } if(v===W_LAVA){ lv[k]=1; anyL=1; }
    if(lc && v===W_CHASM){ lc[k]=1; anyC=1; } if(lcf && v===W_CLIFF){ lcf[k]=1; anyCf=1; }   // (PT1 K10a)
    if(P.brg && v===W_PATH && P.gnd[ty*P.W+tx]===G_BRIDGE){ for(const b of P.brg){ const t=b.v?ty:tx; if(tx>=b.x0&&tx<=b.x1&&ty>=b.y0&&ty<=b.y1&&t>=b.w0&&t<=b.w1){ if(!b.ch){ la[k]=1; anyW=1; } else if(lc && b.cm.has(ty*P.W+tx)){ lc[k]=1; anyC=1; } break; } } }   // (K6: a bridge over the lake — the water runs on beneath its planks · K10a: over a chasm, the void)
    if(P.bog && tx>=0&&ty>=0&&tx<P.W&&ty<P.H && P.bog[ty*P.W+tx]){ lb[k]=1; anyB=1; }
    if(lg && tx>=0&&ty>=0&&tx<P.W&&ty<P.H){ const gv=P.gnd[ty*P.W+tx]; if(gv===G_GRASS){ lg[k]=1; anyG=1; } else if(gv===G_ASH){ lx[k]=1; anyX=1; } else if(gv===G_SHAL){ lsh[k]=1; anyS=1; } else if(gv===G_LEDGE && lld){ lld[k]=1; anyLd=1; } else if(gv===G_FLAG && lfl){ lfl[k]=1; anyF=1; } }   // (PT1 K9a · K9b · K10a · K10b)
    ld[k]=(tx>=0&&ty>=0&&tx<P.W&&ty<P.H) ? P.wd[ty*P.W+tx] : (v===W_WATER?0:9); }
  const cxI=new Int32Array(EW+dxS), cxF=new Float32Array(EW+dxS), cyI=new Int32Array(EH+dyS), cyF=new Float32Array(EH+dyS);             // the tile-centre lattice, per column / row (index 0 = dxS / dyS texels up-left of the region)
  for(let i=0;i<EW+dxS;i++){ const u=(X0-dxS+i+0.5)/s/TS-0.5, f=Math.floor(u); cxI[i]=f-tx0; cxF[i]=u-f; }
  for(let j=0;j<EH+dyS;j++){ const u=(Y0-dyS+j+0.5)/s/TS-0.5, f=Math.floor(u); cyI[j]=(f-ty0)*TW; cyF[j]=u-f; }
  const segs=[]; { const wx0=X0/s-40, wx1=(X0+EW)/s+40, wy0=Y0/s-40, wy1=(Y0+EH)/s+40; for(const g of P.segs) if(g.x1>=wx0&&g.x0<=wx1&&g.y1>=wy0&&g.y0<=wy1) segs.push(g); }
  const TW_=ITUNE.terrTrail, TF=Math.max(1,ITUNE.terrTrailFade), HD=P.hoard, BW=ITUNE.terrBeach, allSand=!CV&&!!I.biome.mods.allSand;
  const BR=P.brg?P.brg.filter(b=>(b.x1+1)*TS*s>=X0 && b.x0*TS*s<=X0+EW && (b.y1+1)*TS*s>=Y0 && b.y0*TS*s<=Y0+EH):null;   // (K6: the bridges this chunk touches)
  const cls=new Uint8Array(N), shd=new Int8Array(N), A1=new Float32Array(N), A2=new Float32Array(N), img=new Uint32Array(CT*CT), cbS=anyS?new Uint8Array(N):null, cbL=anyLd?new Uint8Array(N):null;   // (cbS: the floor's own class under the shallows — PT1 K9b · cbL: under a ledge's raised ground — K10a)
  // pass 1 — what each texel IS (wall / water / ice / floor), from bilinear wall-ness + the edge noise (organic, never a staircase)
  for(let iy=0;iy<EH;iy++){ const yI=cyI[iy+dyS], fy=cyF[iy+dyS];
    for(let ix=0;ix<EW;ix++){ const xI=cxI[ix+dxS], fx=cxF[ix+dxS], k0=yI+xI, w00=(1-fx)*(1-fy), w10=fx*(1-fy), w01=(1-fx)*fy, w11=fx*fy, k=iy*EW+ix;
      const e=(nS_(nE,ix,iy)-0.5)*1.5+(nS_(nE2,ix,iy)-0.5)*0.7+(CV?(nS_(nM,ix,iy)-0.5)*1.3:0), wf=lw[k0]*w00+lw[k0+1]*w10+lw[k0+TW]*w01+lw[k0+TW+1]*w11, wv=wf+e*EA;
      A1[k]=wv;
      if(BR && BR.length){ const t=brgTexel(BR,X0+ix,Y0+iy,s,TS); if(t){ const ch=t.b.ch; if(t.wet && (t.xc===0||t.xc===t.wc-1) && (!ch || t.b.cm.has(Math.floor((Y0+iy+0.5)/s/TS)*P.W+Math.floor((X0+ix+0.5)/s/TS)))){ cls[k]=ch?TC_CHASM:TC_WATER; A2[k]=0.95; } else cls[k]=TC_BRIDGE; continue; } }   // (K6: planks — the water shows a texel either side · K10a: over a chasm, the void)
      if(wv>0.5){ cls[k]=TC_WALL; continue; }
      if(anyCf){ const cf=lcf[k0]*w00+lcf[k0+1]*w10+lcf[k0+TW]*w01+lcf[k0+TW+1]*w11+e*EA*0.35; if(cf>0.5){ cls[k]=TC_CLIFF; A2[k]=cf; continue; } }   // (PT1 K10a) a ledge's CLIFF
      if(anyC){ const cv=lc[k0]*w00+lc[k0+1]*w10+lc[k0+TW]*w01+lc[k0+TW+1]*w11+e*EA*0.7; if(cv>0.5){ cls[k]=TC_CHASM; A2[k]=cv; continue; } }   //  · a CHASM's void (its rim wanders, rocky)
      if(anyW){ const af=la[k0]*w00+la[k0+1]*w10+la[k0+TW]*w01+la[k0+TW+1]*w11, av=af+e*EA*0.85; if(av>0.5){ cls[k]=TC_WATER; A2[k]=av; continue; } }
      if(anyL){ const lf=lv[k0]*w00+lv[k0+1]*w10+lv[k0+TW]*w01+lv[k0+TW+1]*w11, lvv=lf+e*EA*0.9; if(lvv>0.5){ cls[k]=TC_LAVA; A2[k]=lvv; continue; } if(lvv>0.28) shd[k]=-1-Math.round((lvv-0.28)*14); }   // lava: glowing rivers · (a scorched rim beside them — shd<0 marks it) · (DE5: before the ice — a frost cave's magma vault: the ice never laps over the lava)
      if(anyI){ const ic=li[k0]*w00+li[k0+1]*w10+li[k0+TW]*w01+li[k0+TW+1]*w11, iv=ic+e*EA*1.4+(nS_(nM,ix,iy)-0.5)*0.25; if(iv>0.5){ cls[k]=TC_ICE; A2[k]=iv; continue; } }   // (a patch's rim wanders — never a stamped diamond)
      if(anyB){ const bf=lb[k0]*w00+lb[k0+1]*w10+lb[k0+TW]*w01+lb[k0+TW+1]*w11, bv=bf+e*EA*1.2+(nS_(nM,ix,iy)-0.5)*0.3; if(bv>0.5){ cls[k]=TC_BOG; A2[k]=bv; continue; } if(bv>0.36) shd[k]=-8; }   // the mire's pools (a muddy lip round them)
      let c=TC_G;
      if(!CV){ if(allSand) c=TC_SAND; if(anyW||allSand){ const dv=(ld[k0]*w00+ld[k0+1]*w10+ld[k0+TW]*w01+ld[k0+TW+1]*w11)+e*0.5+(nS_(nM,ix,iy)-0.5)*0.9; if(dv<0.68 && dv<BW) c=TC_WET; else if(dv<BW) c=TC_SAND; } }
      if(segs.length && c===TC_G){ const wx=(X0+ix+0.5)/s, wy=(Y0+iy+0.5)/s; let tr=0;                                                  // the worn trail
        for(const g of segs){ const vx=g.bx-g.ax, vy=g.by-g.ay, t=clamp(((wx-g.ax)*vx+(wy-g.ay)*vy)/(g.L*g.L),0,1), d=Math.hypot(g.ax+vx*t-wx, g.ay+vy*t-wy), hw=TW_*(0.8+nS_(nM,ix,iy)*0.5);
          if(d>hw*1.6) continue; const st=clamp(t<g.t0?1-(g.t0-t)*g.L/TF : t>g.t1?1-(t-g.t1)*g.L/TF : 1,0,1), v=st*clamp(1.6-d/hw,0,1); if(v>tr) tr=v; }
        if(tr>0 && tr+bayV(X0+ix,Y0+iy)*0.3>0.5) c=TC_TRAIL; }
      if(RGc && RGc.length && (c===TC_G||c===TC_SAND||c===TC_TRAIL)){ const wx=(X0+ix+0.5)/s, wy=(Y0+iy+0.5)/s; for(const g of RGc){ const dx=wx-g.x, dy=wy-g.y, r=g.R-9+(nS_(nM,ix,iy)-0.5)*12; if(dx*dx+dy*dy<r*r){ c=TC_TRAIL; break; } } }   // (PT1 K10b) an arena ring's floor: trodden earth
      if(anyF){ const ff=lfl[k0]*w00+lfl[k0+1]*w10+lfl[k0+TW]*w01+lfl[k0+TW+1]*w11+e*EA*0.45; if(ff>0.5){ c=TC_FLAG; A2[k]=ff; } }   // (PT1 K10b) a temple's FLAGSTONES (their rim worn ragged)
      if(anyLd){ const lf=lld[k0]*w00+lld[k0+1]*w10+lld[k0+TW]*w01+lld[k0+TW+1]*w11+e*EA*0.3; if(lf>0.5){ cbL[k]=c; c=TC_LEDGE; } }   // (PT1 K10a) a ledge's raised ground (its own floor kept beneath)
      if(anyS){ const sf=lsh[k0]*w00+lsh[k0+1]*w10+lsh[k0+TW]*w01+lsh[k0+TW+1]*w11, sv=sf+e*EA*0.9+(nS_(nM,ix,iy)-0.5)*0.25; if(sv>0.5){ cbS[k]=c; c=TC_SHAL; A2[k]=sv; } }   // (PT1 K9b) the shallows — a waterline that wanders like the ice's
      if(anyG){ const gf=lg[k0]*w00+lg[k0+1]*w10+lg[k0+TW]*w01+lg[k0+TW+1]*w11, gv=gf+e*EA*0.8+(nS_(nM,ix,iy)-0.5)*0.3; if(gv>0.5){ c=TC_TALL; A2[k]=gv; } }   // (PT1 K9a) tall grass — a patch's rim wanders like the ice's
      if(anyX && c!==TC_TALL){ const xf=lx[k0]*w00+lx[k0+1]*w10+lx[k0+TW]*w01+lx[k0+TW+1]*w11, xv=xf+e*EA*0.9+(nS_(nM,ix,iy)-0.5)*0.3; if(xv>0.5){ c=TC_ASH; A2[k]=xv; } }   //  · burnt to ash
      cls[k]=c; } }
  if(CV){ const pm=P.pm, fP=Math.min(FH,Math.max(4,Math.round(FH*0.75))), pmAt=(ix,y)=>{ const tx=Math.floor((X0+ix+0.5)/s/TS), ty=Math.floor(y/s/TS); return tx>=0&&ty>=0&&tx<P.W&&ty<P.H&&pm[ty*P.W+tx]===1; };
    for(let ix=0;ix<EW;ix++){ let d=99, pc=0; for(let iy=EH-1;iy>=0;iy--){ const k=iy*EW+ix; if(cls[k]!==TC_WALL){ d=0; continue; }
      if(d===0) pc=pm&&pmAt(ix,Y0+iy-1.5)?1:0; else if(d===99) pc=0; d++; const f=pc?fP:FH;
      if(d<=f){ cls[k]=TC_FACE; A2[k]=(pc && d===f)?FH:d; } else if(pm && pmAt(ix,Y0+iy+0.5)) shd[k]=5; } } }   // a cave cliff: the wall's south face, FH texels tall · (G7 fix) a standing column: a short face (≈¾ FH, its top edge lit) and above it a lit cap (shd 5)
  const FHk=Math.max(3,Math.min(M,Math.round(ITUNE.terrCliff*s*0.6)));                                                              // (PT1 K10a) a chasm's far wall · a cliff's face — never taller than the bake's margin
  if(anyC) for(let ix=0;ix<EW;ix++){ let d=0; for(let iy=0;iy<EH;iy++){ const k=iy*EW+ix, c=cls[k];                                   // a CHASM: its far (north) wall's strata from its edge down · its south lip
      if(c===TC_CHASM){ d++; shd[k]=d<=FHk?d:0; if(iy<EH-1){ const dn=cls[k+EW]; if(dn!==TC_CHASM && dn!==TC_BRIDGE) shd[k]=-2; } } else if(c!==TC_BRIDGE) d=0; } }
  if(anyCf){ const lo=q=>q!==TC_CLIFF && q!==TC_WALL && q!==TC_LEDGE && q!==TC_FACE && q!==TC_CHASM;                                  // a CLIFF: its face up from the low floor south of it — a 2-texel dark lip along its other edges
    for(let ix=0;ix<EW;ix++){ let d=0, low=0; for(let iy=EH-1;iy>=0;iy--){ const k=iy*EW+ix, c=cls[k]; if(c!==TC_CLIFF){ low=lo(c)?1:0; d=0; continue; } if(d>0) d++; else if(low) d=1; low=0; shd[k]=d>0&&d<=FHk?d:0; } }
    for(let iy=2;iy<EH-1;iy++) for(let ix=2;ix<EW-2;ix++){ const k=iy*EW+ix; if(cls[k]!==TC_CLIFF || shd[k]!==0) continue; if(lo(cls[k-1])||lo(cls[k+1])||lo(cls[k-EW])||lo(cls[k-2])||lo(cls[k+2])||lo(cls[k-2*EW])) shd[k]=-3; }
    const fl=q=>q===TC_G||q===TC_SAND||q===TC_WET||q===TC_TRAIL||q===TC_TALL||q===TC_ASH||q===TC_SHAL, RP=P.rmp, CL=TC_CLIFF, onR=(ix,iy)=>{ if(!RP) return false; const tx=Math.floor((X0+ix+0.5)/s/TS), ty=Math.floor((Y0+iy+0.5)/s/TS); return tx>=0&&ty>=0&&tx<P.W&&ty<P.H&&RP[ty*P.W+tx]>0; };
    for(let iy=3;iy<EH-3;iy++) for(let ix=3;ix<EW-3;ix++){ const k=iy*EW+ix, c=cls[k]; let d=0;   // (G10 fix) so the ledge reads RAISED: the low floor at a cliff's foot in its shadow — 3 texels south & east of it (lit from the top-left), 2 north & west · the ledge's own edge catching the light (shd 11 · 12) · never on its ramp
      if(c===TC_LEDGE){ if(cls[k-1]===CL||cls[k+1]===CL||cls[k-EW]===CL||cls[k+EW]===CL) d=11; else if(cls[k-2]===CL||cls[k+2]===CL||cls[k-2*EW]===CL||cls[k+2*EW]===CL) d=12; if(d && !onR(ix,iy)) shd[k]=d; continue; }
      if(!fl(c)) continue; for(let j=1;j<=3 && !d;j++){ if(cls[k-j*EW]===CL || cls[k-j]===CL || cls[k-j*EW-j]===CL) d=4-j; else if(j<=2 && (cls[k+j*EW]===CL || cls[k+j]===CL || cls[k+j*EW+j]===CL)) d=3-j; }
      if(d && !onR(ix,iy) && shd[k]>-d) shd[k]=-d; }
    for(let iy=0;iy<EH;iy++) for(let ix=0;ix<EW;ix++){ const k=iy*EW+ix; if(cls[k]!==CL || shd[k]>0) continue; let dl=99, dh=99;   // · its rock top a SLOPE (A2: 0 at the low floor → 1 at the ledge), dark at its foot, lit up at the brow
      for(let q=0;q<4;q++){ const sx=q===0?1:q===1?-1:0, sy=q===2?1:q===3?-1:0; let x=ix, y=iy; for(let j=1;j<=24;j++){ x+=sx; y+=sy; if(x<0||y<0||x>=EW||y>=EH) break; const c=cls[y*EW+x]; if(c===CL) continue; if(c===TC_LEDGE){ if(j<dh) dh=j; } else if(lo(c) && j<dl) dl=j; break; } }
      A2[k]=dl<99 && dh<99 ? dl/(dl+dh) : -1; } }
  // pass 2 — colour
  const DL=(!CV && I.core)?ISL_LVL:0, dvS=clamp((DL-4)*0.05,0,0.5), dgK=clamp((DL-6)*0.03,0,0.3), gr=A=>dgK>0?A.map(c=>greyW(c,dgK)):A;   // (a dangerous isle looks it from its first screen: darker, then greyer)
  const G=gr(B.g), U=gr(B.u), PR=gr(B.p), SD=gr(B.sd), WET=gr(B.wet), IC=B.ice, GTI=gr(GRASS_TI[P.bk]||(GRASS_TI[P.bk]=cIR(GRASS_TIP[P.bk]||['#9ad07a'])));   // (G9 fix: the tall grass's tips greyed with the ground)
  const SHS=anyS?{CV, R:[G,SD,WET,PR,CV?CP.floor:G], W:gr([cI(CV?CP.wat[1]:(SHAL_W[P.bk]||B.wat[2]))])[0], Wd:gr([cI(CV?CP.wat[0]:B.wat[3])])[0], L:cI('#eef8f4'), m:{}}:null;   // (PT1 K9b) the shallows' water — the shore's own (a cave lake's), greyed with her danger like the ground
  const CFP=P.CF||CP, CHF=P.bk==='frost'?CHS_ICE:CFP?CFP.face:null, CHG=P.bk==='volcanic', RMP=P.rmp;   // (PT1 K10a) a chasm's walls & a cliff's face: the shore's stone (a frost crevasse ice-blue) · a volcanic chasm glows far below · a ledge's ramp
  const FGT=anyF?mixW(PR[0],cI('#0c0806'),0.45):0, FMO=anyF&&FLAG_MOSS[P.bk]?gr([cI(FLAG_MOSS[P.bk])])[0]:0, DR=anyF&&P.dais?PR.map(q=>mixW(q,cI('#f6ead0'),0.32)):null;   // (PT1 K10b) a flagstone's grout · the moss in it (the green shores) · the altar dais's pale slabs
  const FRI=CV&&anyG?(FROND_I||(FROND_I=[cIR(FROND_C),cIR(FROND_TIP)])):null, PCR=CV?P.pcr:null, SPI=PCR?(CRYROCK_I||(CRYROCK_I=cIR(CRYROCK))):null;   // (SEAS & DEPTHS DE5) a grotto's fronds · a cathedral's columns: crystal rock (their tiles, + a ring — the noisy edge)
  const pcrAt=(ix,iy)=>{ const tx=Math.floor((X0+ix+0.5)/s/TS), ty=Math.floor((Y0+iy+0.5)/s/TS); return tx>=0 && ty>=0 && tx<P.W && ty<P.H && PCR[ty*P.W+tx]===1; }; let FGL=null;
  for(let iy=0;iy<EH;iy++){ const Y=Y0+iy, yS=cyI[iy], fyS=cyF[iy], core=iy>=M&&iy<M+CT;
    for(let ix=0;ix<EW;ix++){ const k=iy*EW+ix, c=cls[k], X=X0+ix, bv=bayV(X,Y); let col=0;
      if(c===TC_WALL){
        if(CV){ const n0=nS_(nE,ix,iy)*0.62+nS_(nE2,ix,iy)*0.38, n1=ix>0&&iy>0?nS_(nE,ix-1,iy-1)*0.62+nS_(nE2,ix-1,iy-1)*0.38:n0; let v=2.2+(n0-n1)*16+(n0-0.5)*1.6+(nS_(nSx,ix,iy)-0.5)*0.7+bv*0.5; if(n0<0.3) v-=1.4; const up=iy>0?cls[k-EW]:TC_WALL;   // lumpy rock, lit from the top-left, shadowed hollows between
          if(up!==TC_WALL && up!==TC_FACE) v=4.6;                                                                                     // the lit lip where the floor runs up to the rock's north edge
          col=CP.top[clamp(Math.floor(v),0,5)];
          if(shd[k]===5){ let w=4.05+(n0-n1)*9+(nS_(nSx,ix,iy)-0.5)*0.9+bv*0.4; if(n0<0.3) w-=0.7; if(up!==TC_WALL && up!==TC_FACE) w=5.2; col=CP.floor[clamp(Math.floor(w),2,5)]; }   // (G7 fix) a column's CAP: the floor's own stone, lit (≈ +20%), lumpy — its north rim brightest
          if(CP.vein && Math.abs(nS_(nE2,ix,iy)-0.5)<0.014 && nS_(nM,ix,iy)>0.6 && nS_(nL,ix,iy)>0.45) col=CP.vein[bv>0.2?2:1];   // (a few glinting seams, not a web)
          if(PCR && pcrAt(ix,iy)){ col=SPI[up!==TC_WALL && up!==TC_FACE ? 4 : clamp(Math.floor(v*0.8+(shd[k]===5?0.9:0.2)),0,4)]; if(hash2(X*7+1,Y*3+5)<0.02) col=SPI[5]; } }   // (DE5) a cathedral's column: deep-blue crystal rock — lumpy, its north rim lit, a glint (its crystals stand on it: terrSprites)
        else { const v=1+(nS_(nSx,ix,iy)-0.5)*2.2+(nS_(nM,ix,iy)-0.5)*1.3+bv*0.8-dvS; col=U[clamp(Math.floor(v),0,2)]; } }
      else if(c===TC_FACE){ const d=A2[k], sN=Math.floor((Y+(nS_(nM,ix,iy)-0.5)*9)/Math.max(2,Math.round(3.2*s)));   // strata: bands, a lit top edge, a dark foot
        let v=(sN&1?2.4:3.1)+(nS_(nSx,ix,iy)-0.5)*1.2+bv*0.6; if(d>=FH) v=4.6; else if(d<=1) v=0.6; else if(d<=2) v-=0.9;
        col=CP.face[clamp(Math.floor(v),0,5)];
        if(CP.vein && d>1 && d<FH && Math.abs(nS_(nE2,ix,iy)-0.5)<0.028) col=CP.vein[1];
        if(PCR && pcrAt(ix,iy)){ const sN=Math.floor((Y+(nS_(nM,ix,iy)-0.5)*9)/Math.max(2,Math.round(3.2*s))); col=SPI[d>=FH?4:d<=1?0:clamp(Math.floor((sN&1?1.6:2.3)+bv*0.6),1,3)]; } }   // (DE5) its face: the crystal rock's strata, its top edge lit, a dark foot
      else if(c===TC_WATER){ const av=A2[k], WB=CV?CP:B; if(av<0.535) col=bv<0.25?WB.fo:WB.fo2; else { const q=(av-0.5)/0.45+bv*0.3; col=q<0.32?WB.sh:q<0.7?WB.md:WB.dp; } }   // (K6: a cave lake in the stone's own dark water)
      else if(c===TC_BRIDGE){ const t=brgTexel(BR,X,Y,s,TS), xc=t.xc, wc=t.wc, ya=t.ya, la=t.la;   // (K6) planks across the way, a gap every 3rd texel line, a rope rail each side, a dark post at each end corner
        if((ya<=1||ya>=la-2) && (xc<=1||xc>=wc-2)) col=BRG_C.post;
        else if(xc===1||xc===wc-2) col=BRG_C.rope;
        else if(xc===0||xc===wc-1||ya%3===2) col=BRG_C.gap;
        else { const bn=(ya/3)|0, h=hash2(bn*7+t.b.x0*31, t.b.y0*13+(xc>>2)); col=h<0.12?BRG_C.p3:(bn&1)?BRG_C.p1:BRG_C.p2; } }
      else if(c===TC_LAVA){ const lvv=A2[k], n1=nS_(nSx,ix,iy), fl=Math.sin((X*0.3+Y*0.75)*0.55+nS_(nM,ix,iy)*14);   // molten rock: a black crust at its banks & in floating plates, orange flow, bright streaks at its heart
        let v; if(lvv<0.56) v=bv>0?1:0; else if(n1>0.68 && lvv<0.85) v=(n1>0.74?0:1)+(bv>0.3?1:0); else v=2+(lvv-0.56)*2.2+(fl>0.55?1:0)+bv*0.7+(fl>0.9&&lvv>0.78?1:0);
        col=B.lava[clamp(Math.floor(v),0,5)]; }
      else if(c===TC_BOG){ const bw=A2[k], q=(bw-0.5)/0.4+bv*0.4+(nS_(nSx,ix,iy)-0.5)*0.4;                                                 // still, murky water: a dark lip, deep olive-black, a few dull glints
        const fz=P.fet && P.fet[clamp(Math.floor((Y+0.5)/s/TS),0,P.H-1)*P.W+clamp(Math.floor((X+0.5)/s/TS),0,P.W-1)]===1, BB=fz?FET_C:B.bog;   // (PT1 K9b: a FETID pool — sickly green, scummed)
        col=BB[bw<0.545?(bv>0.2?4:3):clamp(Math.floor(1.3-q*1.1+((X+Y*2)%7===0&&bw>0.62?1:0)),0,2)]; if(bw>0.6 && hash2(X*3+1,Y*5+7)<0.014) col=BB[5]; }   // (a muddy olive lip · dark tea-green water with a few dull glints)
      else if(c===TC_ICE){ const iv=A2[k], wx=(X+0.5)/s, wy=(Y+0.5)/s;                                                                     // glossy blue — a dark rim against the snow, a diagonal sheen
        if(iv<0.545) col=IC[0]; else { let q=((wx*0.55+wy*0.3)*0.05+nS_(nM,ix,iy)*0.7)%1; if(q<0) q+=1; col=q<0.05?IC[4]:q<0.09?IC[3]:IC[clamp(Math.floor(1.9+(nS_(nSx,ix,iy)-0.5)*1.2+bv*0.6),1,3)]; } }
      else if(c===TC_CHASM){ const d=shd[k];                                                                                             // (PT1 K10a) A CHASM: its far wall's strata (lit at the lip, dark at the foot) · the void, Bayer-dithered · its south lip lit
        if(d===-2) col=CHF[4];
        else if(d>0 && d<=FHk){ const sN=Math.floor((Y+(nS_(nM,ix,iy)-0.5)*9)/Math.max(2,Math.round(2.4*s))); let v=(sN&1?2.6:3.6)+(nS_(nSx,ix,iy)-0.5)*1.2+bv*0.6; if(d===1) v=5.2; else if(d>=FHk) v=0.8; else if(d>=FHk-1) v-=1.0; col=CHF[clamp(Math.floor(v),0,5)]; }
        else { const a=A2[k], q=clamp((1.02-a)/0.42,0,1); col=q+bv*0.35>0.55?CHS_C[1]:CHS_C[0]; if(CHG && a>0.9 && nS_(nM,ix,iy)+(nS_(nSx,ix,iy)-0.5)*0.5+bv*0.4>0.86) col=CHS_C[2]; } }   //  (the void: dim at its rims, darkening to its depth — Bayer-dithered · a volcanic chasm: lava far below)
      else if(c===TC_CLIFF){ const d=shd[k];                                                                                             //  · A CLIFF: its face where the low floor lies south (strata, its top edge lit) · else the raised top, a dark lip along its edges
        if(d>0){ const sN=Math.floor((Y+(nS_(nM,ix,iy)-0.5)*9)/Math.max(2,Math.round(3.2*s))); let v=(sN&1?2.4:3.1)+(nS_(nSx,ix,iy)-0.5)*1.2+bv*0.6; if(d>=FHk) v=4.6; else if(d<=1) v=0.6; else if(d<=2) v-=0.9; col=CHF[clamp(Math.floor(v),0,5)]; }
        else { const n0=nS_(nE,ix,iy)*0.62+nS_(nE2,ix,iy)*0.38, n1=ix>0&&iy>0?nS_(nE,ix-1,iy-1)*0.62+nS_(nE2,ix-1,iy-1)*0.38:n0; let v=(CV?2.7:3.3)+(n0-n1)*14+(n0-0.5)*1.4+bv*0.5; const up=iy>0?cls[k-EW]:TC_CLIFF;   // (its top: a rim of the shore's rock, lumpy, lit from the top-left)
          if(A2[k]>=0) v+=(A2[k]-0.45)*2.4;                                                                                               // (G10 fix: the slope — dark at its foot, lit at the brow)
          if(d===-3) v=Math.min(v,1.1); else if(up!==TC_CLIFF && up!==TC_FACE) v=4.6; col=CFP.top[clamp(Math.floor(v),0,5)]; } }
      else {                                                                                                                              // FLOOR — big soft patches, dithered; dark rim & AO at the edges; shaded where the forest blocks the light
        const wv=A1[k], ao=wv>0.16?Math.pow(clamp((wv-0.16)/0.34,0,1),1.4)*1.25*AK:0;
        const kS=yS+cxI[ix], fxs=cxF[ix], wS=lw[kS]*(1-fxs)*(1-fyS)+lw[kS+1]*fxs*(1-fyS)+lw[kS+TW]*(1-fxs)*fyS+lw[kS+TW+1]*fxs*fyS, sh=clamp((wS-0.26)/0.34,0,1)*1.35*AK;
        let v=2.45-dvS+(nS_(nL,ix,iy)-0.5)*1.25*PK+(nS_(nM,ix,iy)-0.5)*0.75*PK+(nS_(nSx,ix,iy)-0.5)*0.55-ao-sh+bv*DA;
        if(wv>0.44) v-=0.9;                                                                                                               // the dark rim (1-2 texels)
        const sR=shd[k]; if(sR<0) v+=sR===-8?-1.1:Math.max(-3,sR*0.55); else if(sR>10) v+=sR===11?1.1:0.5;                                                                   // (scorched beside the lava · muddy beside a bog pool)
        if(HD){ const dx=(X+0.5)/s-HD.x, dy=(Y+0.5)/s-HD.y, dd=dx*dx+dy*dy; if(dd<HD.R*HD.R) v-=0.7*(1-Math.sqrt(dd)/HD.R); }            // the hoard's trampled ground
        if(c===TC_LEDGE) v+=1.5;                                                                                                          // (PT1 K10a) a ledge's raised ground: lighter
        let rt=0; if(RMP){ rt=RMP[clamp(Math.floor((Y+0.5)/s/TS),0,P.H-1)*P.W+clamp(Math.floor((X+0.5)/s/TS),0,P.W-1)]; if(rt){ const ph=(((rt<3?X:Y)%4)+4)%4; v+=ph===0?-2.2:ph===1?2.7:ph===2?1.4:0.3; } }   //  · its ramp: cut in steps — a dark riser, a lit tread (G10 fix: the floor's highlight), shading down to the next
        const iv=clamp(Math.floor(v),0,(c===TC_LEDGE||(rt&&c===TC_G&&!CV))?5:4); shd[k]=iv;
        if(c===TC_TALL){ col=CV ? tallTexel(X,Y,iv,A2[k],FRI[0],FRI[1],bv) : tallTexel(X,Y,iv,A2[k],G,GTI,bv);                    // (PT1 K9a) tall grass: blades a step darker, lit tips (DE5: below ground, a grotto's fronds —
          if(CV && core && ix>=M && ix<M+CT && (col===FRI[1][0] || col===FRI[1][1] || col===FRI[1][2])){ (FGL||(FGL=new Uint32Array(CT*CT)))[(iy-M)*CT+(ix-M)]=col; } }   //  their tips glow through the dark: C.fg)
        else if(c===TC_FLAG){ col=0; if(P.dais){ const tY=(Y+0.5)/s/TS, ty=Math.floor(tY), tX=(X+0.5)/s/TS, tx=Math.floor(tX), tk=clamp(ty,0,P.H-1)*P.W+clamp(tx,0,P.W-1);   // (PT1 K10b) a temple's flagstones — its altar's DAIS a step up: big pale slabs, a lit top edge, its riser in shadow
            if(P.dais.has(tk)){ const fy=tY-ty, fx=tX-tx;
              if(!P.dais.has(tk+P.W) && fy>0.72) col=fy>0.88?FGT:mixW(PR[0],FGT,0.4);
              else if((!P.dais.has(tk-1) && fx<0.07) || (!P.dais.has(tk+1) && fx>0.93)) col=mixW(PR[0],FGT,0.4);   // (its sides' edge)
              else { const row=Math.floor(Y/6), sx=X+((row&1)?6:0), u=sx-Math.floor(sx/12)*12, v=Y-row*6, h=hash2(Math.floor(sx/12)*7+row*3,row*5+11); col=(u===0||v===0)?FGT:DR[clamp(iv+1+((v===1||(!P.dais.has(tk-P.W)&&fy<0.16))?1:0)-(h<0.3?1:0),0,DR.length-1)]; } } }
          if(!col) col=flagTexel(X,Y,iv,A2[k],PR,FGT,FMO); }
        else if(c===TC_LEDGE){ const cb=cbL[k], R=CV?CP.floor:(cb===TC_SAND?SD:cb===TC_WET?WET:cb===TC_TRAIL?PR:G); col=R[cb===TC_WET&&!CV?Math.min(2,iv>>1):Math.min(iv,R.length-1)]; }   // (PT1 K10a) the ledge: its own floor, raised
        else if(c===TC_ASH){ const h=hash2(X*7+3,Y*11+5); col=h<0.008?ASH_C.e1 : h<0.016?ASH_C.e2 : h<0.06?ASH_C.a3 : (A2[k]>0.56 && nS_(nSx,ix,iy)+bv*0.6>0.5)?ASH_C.a2:ASH_C.a1; }   //  · ash: grey-black, a few embers
        else if(c===TC_SHAL) col=shalTexel(X,Y,iv,A2[k],cbS[k],SHS);                                                                    // (PT1 K9b) the shallows: the floor through the water, ripples
        else if(CV){ const R=c===TC_TRAIL?CP.trail:(nS_(nL,ix,iy)>0.6+(nS_(nE,ix,iy)-0.5)*0.2?CP.wet:CP.floor); col=R[Math.min(iv,R.length-1)]; }
        else col=(c===TC_SAND?SD:c===TC_WET?WET:c===TC_TRAIL?PR:G)[c===TC_WET?Math.min(2,iv>>1):iv]; }
      if(core && ix>=M && ix<M+CT) img[(iy-M)*CT+(ix-M)]=col; } }
  // shore texels (the per-frame swash runs from them, up the sand) & glints
  let shore=null, glint=null;
  if(anyW){ const L=[]; for(let iy=M;iy<M+CT;iy++) for(let ix=M;ix<M+CT;ix++){ const k=iy*EW+ix; if(cls[k]!==TC_WATER || A2[k]>=0.535) continue;
      const gx=(cls[k+1]===TC_WATER?1:0)-(cls[k-1]===TC_WATER?1:0), gy=(cls[k+EW]===TC_WATER?1:0)-(cls[k-EW]===TC_WATER?1:0); if(!gx&&!gy) continue; L.push(ix-M,iy-M,gx,gy); }
    if(L.length) shore=Int16Array.from(L); }
  // decals — their own hash, on a global lattice (a decal straddling two chunks is stamped whole in both), clumped by the patch noise
  const DC=5, dMul=ITUNE.terrDecal, put=(x,y,cc)=>{ if(x>=M&&y>=M&&x<M+CT&&y<M+CT&&cc) img[(y-M)*CT+(x-M)]=cc; }, gl=[];
  const gxa=Math.floor(X0/DC), gxb=Math.floor((X0+EW-1)/DC), gya=Math.floor(Y0/DC), gyb=Math.floor((Y0+EH-1)/DC), dl=I.core?ISL_LVL:0;
  for(let gy=gya;gy<=gyb;gy++) for(let gx=gxa;gx<=gxb;gx++){ const h1=hash2(gx*3+9001,gy*5-313), h2=hash2(gx*7-517,gy*3+7717), h3=hash2(gx*11+33,gy*13+71);
    const ax=gx*DC+Math.floor(h1*DC)-X0, ay=gy*DC+Math.floor(h2*DC)-Y0; if(ax<1||ay<1||ax>=EW-1||ay>=EH-1) continue;
    const k=ay*EW+ax, c=cls[k]; if(c===TC_WALL||c===TC_WATER||c===TC_FACE||c===TC_LAVA||c===TC_BRIDGE||c===TC_TALL||c===TC_ASH||c===TC_SHAL||c===TC_CHASM||c===TC_CLIFF||c===TC_FLAG) continue;   // (K9a: no pebble in the tall grass or the ash · K9b: nor the shallows · K10b: nor the flagstones)
    const iv=shd[k], clump=0.3+nS_(nM,ax,ay)*1.4;
    let tab, base;
    if(c===TC_ICE){ if(h3<0.4*dMul) terrDecal('icecrack',ax,ay,put,h1,h2,B,CP,0); continue; }
    if(c===TC_BOG){ const X=X0+ax, Y=Y0+ay;
      if(P.fet && P.fet[clamp(Math.floor((Y+0.5)/s/TS),0,P.H-1)*P.W+clamp(Math.floor((X+0.5)/s/TS),0,P.W-1)]===1){ if(h3<0.24*dMul && A2[k]>0.62){ if(h1<0.55){ put(ax-1,ay,FET_C[4]); put(ax,ay,FET_C[4]); put(ax+1,ay,FET_C[3]); if(h2<0.4) put(ax,ay-1,FET_C[3]); } else { put(ax,ay-1,FET_C[5]); put(ax-1,ay,FET_C[5]); put(ax+1,ay,FET_C[4]); put(ax,ay+1,FET_C[4]); } } continue; }   // (PT1 K9b) a fetid pool: streaks of scum · a bubble's ring
      if(h3<0.34*dMul && A2[k]>0.6) terrDecal(h1<0.62?'lily':'bubble',ax,ay,put,h1,h2,B,CP,1,B.bog,gl,M); continue; }   // lily pads & a rising bubble on the mire's pools
    if(CV){ tab=CAVE_DEC[P.bk]||CAVE_DEC._; base=0.22; }
    else if(c===TC_TRAIL){ tab=B.dt; base=0.26; } else if(c===TC_SAND||c===TC_WET){ tab=B.ds; base=0.22; } else { tab=B.dg; base=0.34; }
    if(iv<1 || h3>base*dMul*clump*(B.dd||1)) continue;
    let tot=0; for(const d of tab) tot+=d[1]; const bn=(!CV&&c===TC_G&&dl>=5)?0.045+clamp((dl-5)*0.006,0,0.06):0; let r=hash2(gx*13+5,gy*17-3)*(tot+bn), kind=null;   // (a dangerous isle's grass is strewn with bones — more, the worse it is)
    for(const d of tab){ if(r<d[1]){ kind=d[0]; break; } r-=d[1]; } if(!kind) kind=bn?((dl>=8 && h1<0.28)?'skull':'bone'):tab[tab.length-1][0];
    terrDecal(kind,ax,ay,put,h1,h2,B,CP,iv, c===TC_WET?WET:c===TC_SAND?SD:c===TC_TRAIL?PR:G, gl, M); }
  let lvC=null;                                                                                                                         // the caldera: its lava texels on their own layer (they breathe by day & burn through the night) · glow points along them
  if(anyL){ const LV=new Uint32Array(CT*CT); let nL2=0; for(let iy=M;iy<M+CT;iy++) for(let ix=M;ix<M+CT;ix++){ const k=iy*EW+ix; if(cls[k]!==TC_LAVA) continue; const q=(iy-M)*CT+(ix-M); LV[q]=img[q]; nL2++;
      if(A2[k]>0.72 && ((X0+ix)%7===0) && ((Y0+iy)%7===0)) gl.push(ix-M,iy-M,5); }
    if(nL2){ lvC=document.createElement('canvas'); lvC.width=CT; lvC.height=CT; lvC.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(LV.buffer),CT,CT),0,0); } }
  if(gl.length) glint=Int16Array.from(gl);
  // the canvas, then the sprites on it
  let lip=null;
  if(CV){ const LP=new Uint32Array(CT*CT), LC1=cI('#8a9ad0'), LC2=cI('#5e6c9a'); let nL=0;                           // a cave's chamber edges: rock & cliff texels touching the floor
    for(let iy=M;iy<M+CT;iy++) for(let ix=M;ix<M+CT;ix++){ const k=iy*EW+ix, c=cls[k]; if(c!==TC_WALL && c!==TC_FACE) continue;
      const fl=q=>q!==TC_WALL && q!==TC_FACE; if(fl(cls[k-1])||fl(cls[k+1])||fl(cls[k-EW])||fl(cls[k+EW])){ LP[(iy-M)*CT+(ix-M)]=(c===TC_WALL)?LC1:LC2; nL++; } }
    if(nL){ lip=document.createElement('canvas'); lip.width=CT; lip.height=CT; lip.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(LP.buffer),CT,CT),0,0); } }
  const cv=document.createElement('canvas'); cv.width=CT; cv.height=CT; const g=cv.getContext('2d'); g.putImageData(new ImageData(new Uint8ClampedArray(img.buffer),CT,CT),0,0);
  if(I.gm && I.gm.length) mkStamp(g,I.gm,cx*CT,cy*CT,CT);                                                                             // the fallen's marks (a chunk baked after a fight still shows it)
  const sp=document.createElement('canvas'); sp.width=CT; sp.height=CT;                                                               // the sprite layer — kept, so a later mark can slip under it
  terrSprites(T,P,sp.getContext('2d'),cx*CT,cy*CT,CT); g.drawImage(sp,0,0);
  { const dB=performance.now()-tS; T.bakes++; T.bakeMs+=dB; T.bkE=T.bkE==null?dB:T.bkE*0.75+dB*0.25; }   // (SD5 fix: bkE — the recent bakes' cost: a cold page's run high)
  if(TSP_G.length){ const a=glint?Array.from(glint):[]; for(let i=0;i<TSP_G.length;i+=3){ const x=TSP_G[i]-cx*CT, y=TSP_G[i+1]-cy*CT; if(x>=0&&y>=0&&x<CT&&y<CT) a.push(x,y,TSP_G[i+2]); } glint=a.length?Int16Array.from(a):null; }   // (glowing caps from the sprite pass)
  let fgC=null; if(FGL){ fgC=document.createElement('canvas'); fgC.width=CT; fgC.height=CT; fgC.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(FGL.buffer),CT,CT),0,0); }   // (SEAS & DEPTHS DE5) a grotto's frond tips, on their own layer
  return {cv, sp, lp:lip, lv:lvC, fg:fgC, X:cx*CT, Y:cy*CT, wat:!!anyW, sh:shore, gl:glint, u:T.fr}; }
const CAVE_DEC={_:[['rubble',1.2],['pebble',1],['crack',0.5],['puddle',0.18]], crystal:[['rubble',1],['grit',1.4],['crack',0.4],['shroom',0.1]], frost:[['rubble',1],['sparkle',0.8],['crack',0.8],['pebble',0.8]],
  scorch:[['rubble',1],['ash',1.2],['ember',0.35],['crack',1]], meadow:[['rubble',1],['moss',1],['crack',0.7],['puddle',0.25]], tropic:[['rubble',1],['moss',1],['puddle',0.3],['crack',0.7]],
  moor:[['rubble',1.2],['moss',0.7],['shroom',0.12],['crack',0.5]], ember:[['rubble',1],['moss',0.6],['shroom',0.1],['crack',0.5]], atoll:[['rubble',0.8],['shell',0.6],['puddle',0.4],['crack',0.6]],
  swamp:[['rubble',0.8],['moss',1.2],['puddle',0.7],['crack',0.4]], dunes:[['rubble',1],['pebble',1.2],['bone',0.3],['crack',0.8]], bamboo:[['rubble',1],['moss',1],['puddle',0.3],['crack',0.5]],
  mushroom:[['rubble',0.8],['shroom',0.6],['spore',1],['crack',0.4]], volcanic:[['rubble',1],['ash',1],['ember',0.45],['crack',1.1]]};
function mixW(a,b,t){ const u=1-t; return ((255<<24)|(Math.round(((a>>16)&255)*u+((b>>16)&255)*t)<<16)|(Math.round(((a>>8)&255)*u+((b>>8)&255)*t)<<8)|Math.round((a&255)*u+(b&255)*t))>>>0; }   // (two ImageData words mixed)
function greyW(c,k){ const r=c&255, g=(c>>8)&255, b=(c>>16)&255, L=(0.3*r+0.59*g+0.11*b)*(1-k*0.25); return ((255<<24)|(Math.round(b+(L-b)*k)<<16)|(Math.round(g+(L-g)*k)<<8)|Math.round(r+(L-r)*k))>>>0; }   // (toward its own grey, a touch darker)
const DCOL={pbL:cI('#a6a69a'), bone:cI('#cfc4ac'), boneH:cI('#e8dfcc'), shell:cI('#f4e8dc'), shell2:cI('#e2b6a6'), twig:cI('#4a3420'), twigH:cI('#7a5a36'), ash:cI('#8c8682'), ash2:cI('#aaa49e'),
  emb:cI('#ff8a3c'), emb2:cI('#a8401c'), spk:cI('#ffffff'), grit:cI('#7fe0f0'), grit2:cI('#b8a0ff'), heath:cI('#9a64b8'), heath2:cI('#c08ad8'), leaf:[cI('#c8602a'),cI('#d8823a'),cI('#a83a24'),cI('#b8862e')],
  moss:cI('#4a6a34'), moss2:cI('#5e8040'), pud:cI('#1c2c3a'), pudH:cI('#7a98b0'), glow:cI('#8de9ff'), glow2:cI('#e4fbff'), stem:cI('#d8d0c0'), cen:cI('#fff4d8'),
  mud:cI('#241c12'), mud2:cI('#3a2e1c'), mudH:cI('#6a6a4a'), reed:cI('#5a7a34'), reedH:cI('#8aa84a'), reedT:cI('#6a4428'), bleaf:[cI('#8ab84e'),cI('#a8c860'),cI('#c8d488'),cI('#6a9a3a')],
  spore:cI('#c9a6ff'), spore2:cI('#f0c8ff'), vmoss:cI('#5a4478'), vmoss2:cI('#7a5aa0'), lily:cI('#3e6a2e'), lilyH:cI('#6a9a44'), lilyF:cI('#f4e8f0'), bub:cI('#8aa88a')};
function terrDecal(kind,x,y,put,h1,h2,B,CP,iv,R,gl,M){ const pb=B.pb, dk=R?R[Math.max(0,iv-2)]:(CP?CP.floor[1]:0), lt=R?R[Math.min(5,iv+2)]:0, hi=R&&R.length>5?R[5]:lt;
  switch(kind){
    case 'blade': put(x,y,hi); put(x,y+1,lt); break;
    case 'tuft': put(x,y-1,hi); put(x,y,lt); put(x,y+1,lt); put(x-1,y,hi); put(x-1,y+1,lt); put(x+1,y+1,hi); put(x+1,y+2,dk); put(x,y+2,dk); break;
    case 'clover': put(x,y,lt); put(x-1,y,lt); put(x+1,y,lt); put(x,y-1,hi); put(x,y+1,dk); break;
    case 'flower': { const c=B.fl[Math.floor(h2*B.fl.length)]; if(h1<0.78){ put(x,y,c); put(x,y+1,dk); if(h1<0.3){ put(x+2,y+1,c); put(x+2,y+2,dk); } } else { put(x-1,y,c); put(x+1,y,c); put(x,y-1,c); put(x,y,lt); put(x,y+1,dk); } break; }   // mostly single blooms — a few little crosses
    case 'pebble': put(x,y,DCOL.pbL); put(x+1,y,pb[0]); put(x,y+1,pb[1]); put(x+1,y+1,dk); if(h2<0.4){ put(x+3,y+1,pb[0]); put(x+3,y+2,dk); } break;
    case 'twig': put(x,y,DCOL.twig); put(x+1,y,DCOL.twigH); put(x+2,y+1,DCOL.twig); if(h2<0.5) put(x+3,y+1,DCOL.twig); break;
    case 'leaf': { const c=DCOL.leaf[Math.floor(h2*4)]; put(x,y,c); put(x+1,y,c); put(x+1,y+1,dk); break; }
    case 'shell': put(x,y,DCOL.shell); put(x+1,y,DCOL.shell2); put(x,y+1,DCOL.shell2); put(x+1,y+1,dk); break;
    case 'ripple': put(x,y,lt); put(x+1,y,lt); put(x+2,y,lt); if(h2<0.6) put(x+3,y,lt); put(x+1,y+1,dk); put(x+2,y+1,dk); break;
    case 'ash': put(x,y,h2<0.5?DCOL.ash:DCOL.ash2); if(h2<0.3) put(x+2,y+1,DCOL.ash); break;
    case 'ember': put(x,y,DCOL.emb); put(x+1,y,DCOL.emb2); if(gl) gl.push(x-M,y-M,1); break;
    case 'sparkle': put(x,y,DCOL.spk); if(gl && h2<0.5) gl.push(x-M,y-M,0); break;
    case 'drift': for(let i=-2;i<=2;i++){ put(x+i,y,hi); if(Math.abs(i)<2) put(x+i,y-1,hi); } put(x+1,y+1,lt); break;
    case 'grit': put(x,y,h2<0.5?DCOL.grit:DCOL.grit2); if(h2<0.3) put(x+1,y+1,DCOL.grit); if(gl && h2<0.25) gl.push(x-M,y-M,2); break;
    case 'heather': put(x,y,DCOL.heath); put(x+1,y,lt); put(x,y-1,DCOL.heath2); put(x+1,y+1,dk); break;
    case 'crack': { let cx=x, cy=y; const dx=h1<0.5?1:-1; put(cx,cy,dk); for(let i=0;i<3+Math.floor(h2*3);i++){ if(hash2(x*3+i,y*7)<0.5) cx+=dx; else cy+=1; put(cx,cy,CP?CP.crack:(R?R[0]:dk)); } break; }
    case 'icecrack': { const I2=B.ice; let cx=x, cy=y; const dx=h1<0.5?1:-1, dy=h2<0.5?1:-1; for(let i=0;i<4+Math.floor(h2*4);i++){ put(cx,cy,I2[1]); if(hash2(x+i*5,y*3+i)<0.55) cx+=dx; else cy+=dy; } put(cx,cy,I2[4]); break; }
    case 'foot': put(x,y,dk); put(x+2,y+1,dk); break;
    case 'bone': { const f=lt||dk, b1=mixW(DCOL.bone,f,0.5), b2=mixW(DCOL.bone,dk,0.55); put(x,y,b1); put(x+1,y,b1); put(x+2,y,b2); put(x-1,y-1,b1); put(x-1,y+1,b2); put(x+1,y+1,dk); put(x+2,y+1,dk); put(x+3,y,dk); break; }   // (old, half-buried: one knob up, the rest sunk in the dirt)
    case 'skull': { const f=lt||dk, b1=mixW(DCOL.bone,f,0.42), b2=mixW(DCOL.bone,dk,0.5); put(x-1,y-1,b1); put(x,y-1,b1); put(x+1,y-1,b2); put(x-1,y,dk); put(x,y,b1); put(x+1,y,dk); put(x-1,y+1,b2); put(x+1,y+1,b2); put(x,y+2,dk); break; }
    case 'rubble': { const c=CP?CP.top:null; if(!c) break; put(x,y,c[4]); put(x+1,y,c[3]); put(x+1,y+1,c[1]); put(x,y+1,c[2]); if(h2<0.6){ put(x+3,y+1,c[4]); put(x+3,y+2,c[1]); } if(h2<0.3){ put(x-2,y+2,c[3]); put(x-2,y+3,c[1]); } break; }
    case 'moss': put(x,y,DCOL.moss); put(x+1,y,DCOL.moss2); put(x,y+1,DCOL.moss); if(h2<0.5) put(x-1,y+1,DCOL.moss2); break;
    case 'puddle': { const c=CP?CP.wet:null; if(!c) break; for(let i=-2;i<=2;i++){ put(x+i,y,c[0]); if(Math.abs(i)<2) put(x+i,y+1,c[1]); } put(x-1,y,c[5]); if(gl) gl.push(x-1-M,y-M,3); break; }
    case 'shroom': put(x-1,y,DCOL.glow); put(x,y,DCOL.glow2); put(x+1,y,DCOL.glow); put(x,y+1,DCOL.stem); if(gl) gl.push(x-M,y-1-M,2); break;
    // ---- the newer shores (w1) ----
    case 'mud': put(x,y,DCOL.mud); put(x+1,y,DCOL.mud2); put(x-1,y,DCOL.mud2); put(x,y+1,DCOL.mud2); if(h2<0.4) put(x+1,y-1,DCOL.mudH); break;   // a wet mud splotch, one glint
    case 'reed': put(x,y,DCOL.reed); put(x,y-1,DCOL.reedH); put(x+1,y,DCOL.reed); put(x+1,y-1,DCOL.reed); put(x+1,y-2,DCOL.reedT); if(h2<0.5){ put(x-1,y,DCOL.reed); put(x-1,y-1,DCOL.reedH); } break;   // a little clump, one seed head
    case 'dune': { const L=3+Math.floor(h2*4); for(let i=0;i<L;i++){ const yy=y+(i>L/2?1:0); put(x+i,yy,hi); put(x+i,yy+1,dk); } break; }   // a wind ripple in the sand: a lit crest over its shadow
    case 'bleaf': { const c=DCOL.bleaf[Math.floor(h2*4)]; put(x,y,c); put(x+1,y,c); put(x+2,y+(h1<0.5?1:-1),c); put(x+1,y+1,dk); break; }   // a fallen bamboo leaf
    case 'spore': put(x,y,h2<0.5?DCOL.spore:DCOL.spore2); if(h2<0.3) put(x+2,y+1,DCOL.spore); if(gl && h2<0.35) gl.push(x-M,y-M,4); break;   // glowing spores on the moss
    case 'moss2': put(x,y,DCOL.vmoss); put(x+1,y,DCOL.vmoss2); put(x,y+1,DCOL.vmoss); if(h2<0.5) put(x-1,y+1,DCOL.vmoss2); break;   // the grove's violet moss
    case 'lily': put(x,y,DCOL.lily); put(x+1,y,DCOL.lilyH); put(x,y+1,DCOL.lilyH); put(x-1,y,DCOL.lily); put(x,y-1,DCOL.lily); if(h2<0.25) put(x,y,DCOL.lilyF); break;   // a lily pad (the odd flower)
    case 'bubble': put(x,y,DCOL.bub); put(x+1,y-1,R?R[4]:DCOL.bub); break;
  } }
const RKR={ basalt:['#26241f','#38352f','#4c4840','#625d53','#7c766a','#9c9486'], sandstone:['#4a3020','#664430','#825a40','#9e7252','#b88c68','#d2a882'], granite:['#2a2e30','#3e4244','#565a5c','#707476','#8e9292','#b0b4b2'],
  mossy:['#2e2c26','#423e34','#5a5448','#726c5e','#8e8878','#aaa392'], coral:['#7a4a4c','#9a6262','#ba7e78','#d49c90','#e8bcac','#f6dccc'], icerime:['#34404c','#4a5664','#627080','#7e8c9a','#a0acb8','#d8e4ee'],
  obsidian:['#0c0812','#181224','#261e36','#3a3050','#6a5c90','#b4a6dc'], crystal:['#12204a','#1e3a7a','#2e58a8','#4e8ad4','#7cc8f2','#d6f8ff'], marble:['#5e5e66','#7e7e86','#9e9ea6','#bebec4','#d8d8dc','#f2f2f4'],
  crystone:['#1e2632','#2c3644','#3c4858','#4e5c6e','#667688','#8898aa'], moss:['#2e2c26','#423e34','#5a5448','#726c5e','#8e8878','#aaa392'], icestone:['#34404c','#4a5664','#627080','#7e8c9a','#a0acb8','#d8e4ee'],
  jade:['#10281e','#1c3e2e','#2a5842','#3a7258','#548e72','#7cb496']};   // (the bamboo's old shrines are carved jade)
function rkRamp(st){ const k='_'+st; return RKR[k]||(RKR[k]=cIR(RKR[st]||RKR.granite)); }
function propRamp(st){ if(ISL && ISL.cave && st!=='crystal') return cIR(caveTI(ISL.biome).rock); return rkRamp(st); }
/* ---- small painted things: rim dressing, the hoard's standing stones, a cache's slabs, cave stalagmites ---- */
function drFern(R,C,sd){ const w=Math.ceil(R*2.8)+6, h=Math.ceil(R*1.9)+6, S=PS(w,h), bx=w>>1, by=h-3, fr=[];   // arching fronds, feathered, the upright ones behind
  for(let f=0;f<7;f++) fr.push(-Math.PI+0.38+f/6*(Math.PI-0.76)+(hash2(sd,f)-0.5)*0.22); fr.sort((a,b)=>Math.abs(Math.cos(a))-Math.abs(Math.cos(b)));
  for(let f=0;f<fr.length;f++){ const a=fr[f], L=R*(1.05+hash2(sd,f+9)*0.35), ca=Math.cos(a), sa=Math.sin(a);
    for(let t=0;t<=1;t+=0.45/L){ const x=bx+ca*L*t, y=by-1+sa*L*t*1.35+L*0.6*t*t, wd=(1-t)*R*0.3+0.7;
      for(let q=-wd;q<=wd;q+=0.5){ if(Math.abs(q)>0.9 && hash2(Math.round(x*3+q*7)+sd,Math.round(y*5))<0.3) continue; const lit=(q*-sa)*(-0.6)+(q*ca)*(-0.8)>0; psP(S,x-sa*q,y+ca*q*0.85,Math.abs(q)<0.6?C[4]:lit?C[3]:C[1]); } } }
  return psCv(psOut(S,C[0],false),bx,by); }
function drLog(R,tk,sd,o){ const L=Math.round(R*1.7), H=Math.max(3,Math.round(R*0.55)), w=L+6, h=H+6, S=PS(w,h), x0=3, y0=3, bark=o&&o.bark?cIR(o.bark):tk;
  for(let y=0;y<H;y++) for(let x=0;x<L;x++){ const gr=((y+Math.floor(hash2(x>>2,sd)*3))%3===0) && hash2(x*3+sd,y)<0.75, v=y===0?2:y>=H-1?0:gr?0:1; psP(S,x0+x,y0+y,bark[v]); }   // bark grain: broken dark lines along the log
  for(let i=0;i<2;i++){ const kx=x0+2+Math.floor(hash2(sd,i+40)*(L-5)); psP(S,kx,y0+1,bark[0]); psP(S,kx+1,y0+1,bark[2]); }   // a knot or two
  const ex=x0+L-1, ey=y0+(H>>1), ring=cIR(o&&o.end||['#b8925c','#8a6a3c']); psDisc(S,ex,ey+0.5,Math.max(1.5,H*0.42),H*0.5,(nx,ny)=>nx*nx+ny*ny<0.3?ring[1]:ring[0]);
  if(o&&o.moss) for(let x=2;x<L-2;x++) if(hash2(x+sd,7)<0.35) psP(S,x0+x,y0,cI('#5e8040'));
  if(o&&o.emb) for(let i=0;i<3;i++) psP(S,x0+2+Math.floor(hash2(sd,i)*(L-4)),y0+1+(i&1),cI(i?'#ff8a3c':'#ffc060'));
  return psCv(psOut(S,cI(o&&o.ol||'#140c06'),false),w>>1,y0+H); }
function drStump(R,tk,sd){ const rx=Math.max(2,Math.round(R*0.55)), w=rx*2+6, h=Math.round(R*1.1)+6, S=PS(w,h), bx=w>>1, by=h-3, top=by-Math.round(R*0.5), ring=cIR(['#c8a068','#9a7442','#7a5a32']);
  for(let y=top;y<=by;y++) for(let x=bx-rx;x<=bx+rx;x++) psP(S,x,y,x<bx-rx+1?tk[2]:y>=by?tk[0]:tk[1]);
  psDisc(S,bx+0.5,top+0.5,rx+0.5,Math.max(1.2,rx*0.55),(nx,ny)=>{ const q=nx*nx+ny*ny; return q<0.2?ring[2]:q<0.55?ring[1]:ring[0]; });
  return psCv(psOut(S,cI('#140c06'),false),bx,by); }
function drShrooms(R,sd,cap){ const w=Math.ceil(R*2)+6, h=Math.ceil(R*1.5)+6, S=PS(w,h), bx=w>>1, by=h-3, C=cIR(cap), st=cI('#e0d8c8'), st2=cI('#a8a090'), dot=cI('#fff4e8');   // a cluster of caps: a tall one behind, two short in front
  const M3=[[0.1,0.95,0.36],[-0.62,0.45,0.27],[0.62,0.3,0.24]].map((q,i)=>[bx+q[0]*R+(hash2(sd,i)-0.5)*1.5, Math.round(R*q[1]*(0.85+hash2(sd,i+3)*0.3)), Math.max(1.5,R*q[2])]);
  for(const q of M3){ const x=q[0], hh=q[1], cr=q[2]; for(let y=by-hh;y<=by;y++){ psP(S,x,y,st); psP(S,x+1,y,st2); }
    psDisc(S,x+0.5,by-hh-cr*0.2,cr,cr*0.78,(nx,ny)=>ny>0.45?C[0]:ny<-0.25&&nx<0.1?C[2]:C[1]); psP(S,x-cr*0.35,by-hh-cr*0.55,dot); psP(S,x+cr*0.3,by-hh-cr*0.25,dot); }
  return psCv(psOut(S,cI('#140a08'),false),bx,by); }
function drBones(R,sd){ const w=Math.ceil(R*2)+6, h=Math.ceil(R*1.1)+6, S=PS(w,h), bx=w>>1, by=h-3, B1=cI('#e6dcc6'), B2=cI('#b8ac94'), D=cI('#2a2218');
  psDisc(S,bx-R*0.4,by-R*0.45,R*0.34,R*0.28,(nx,ny)=>ny>0.2?B2:B1); psP(S,bx-R*0.5,by-R*0.45,D); psP(S,bx-R*0.28,by-R*0.45,D);          // a skull
  for(let i=0;i<3;i++){ const x=bx+R*0.1+i*2; psLine(S,x,by-R*0.6,x+1,by-1,i%2?B2:B1,1); }                                                  // ribs
  psLine(S,bx-R*0.9,by-1,bx+R*0.9,by-2,B1,1);
  return psCv(psOut(S,cI('#1a140c'),false),bx,by); }
function drShells(R,sd){ const w=Math.ceil(R*2)+6, h=Math.ceil(R)+6, S=PS(w,h), bx=w>>1, by=h-3, P=cIR(['#f4e8dc','#e2b6a6','#c88a7a']), SF=cIR(['#e8743c','#c8502a']);
  for(let i=0;i<3;i++){ const x=bx+(i-1)*R*0.6, y=by-1-(i&1)*2; psDisc(S,x,y,Math.max(1.5,R*0.22),Math.max(1.2,R*0.18),(nx,ny)=>nx<0?P[0]:P[1]); psP(S,x,y+1,P[2]); }
  if(hash2(sd,1)<0.6){ const x=bx+R*0.9, y=by-R*0.5; psP(S,x,y,SF[0]); psP(S,x-1,y,SF[1]); psP(S,x+1,y,SF[1]); psP(S,x,y-1,SF[0]); psP(S,x,y+1,SF[1]); }   // a starfish
  return psCv(psOut(S,cI('#3a2a1c'),false),bx,by); }
function drReeds(R,sd){ const w=Math.ceil(R*1.6)+6, h=Math.ceil(R*1.8)+6, S=PS(w,h), bx=w>>1, by=h-3, G=cIR(['#2a4a24','#3e6a30','#5a8a40']), K=cIR(['#4a2e18','#6a4428']);
  for(let i=0;i<6;i++){ const x=bx+(i-2.5)*R*0.28, L=R*(1+hash2(sd,i)*0.7), ln=(hash2(sd,i+9)-0.5)*2; for(let t=0;t<L;t++) psP(S,x+ln*t/L,by-t,G[t<2?0:t>L-3?2:1]);
    if(i%2===0){ psP(S,x+ln,by-L,K[1]); psP(S,x+ln,by-L+1,K[0]); psP(S,x+ln,by-L+2,K[0]); } }
  return psCv(psOut(S,cI('#0e160a'),false),bx,by); }
function drRocks(R,C,sd){ const w=Math.ceil(R*2.2)+6, h=Math.ceil(R*1.1)+6, S=PS(w,h), bx=w>>1, by=h-3;
  for(let i=0;i<3;i++){ const r=R*(0.34+hash2(sd,i)*0.2), x=bx+(i-1)*R*0.62, y=by-r*0.7; psDisc(S,x,y,r,r*0.75,(nx,ny,px,py)=>C[clamp(Math.floor(2.4-(nx*0.6+ny*0.8)*1.4+bayV(px,py)*0.6-(ny>0.5?1:0)),0,5)]); }
  return psCv(psOut(S,C[0],false),bx,by); }
function drMound(R,sd){ const w=Math.ceil(R*2.2)+6, h=Math.ceil(R)+6, S=PS(w,h), bx=w>>1, by=h-3, C=cIR(['#8ea2b6','#a8bacc','#c4d2e0','#dce6f0','#f4f8fc']);
  psDisc(S,bx,by-R*0.35,R,R*0.42,(nx,ny,x,y)=>C[clamp(Math.floor(2.4-(nx*0.5+ny*0.9)*1.3+bayV(x,y)*0.6),0,4)]); return psCv(psOut(S,cI('#5a6a7c'),false),bx,by); }
function drStone(R,C,sd,moss){ const w=Math.ceil(R*1.7)+6, H=Math.round(R*(2.1+hash2(sd,5)*0.5)), h=H+6, S=PS(w,h), bx=w>>1, by=h-3, hw=Math.max(2.5,R*0.62), tl=(hash2(sd,6)-0.5)*hw*0.5, M2=cIR(moss||['#3e5a30','#56783e','#6e9048']), LI=cI('#b8b070'), RU=cI('#9ad0ff');   // an ancient standing stone: a leaning menhir, lichen & moss, a rune
  psPoly(S,[[bx-hw,by],[bx-hw*1.02+tl*0.4,by-H*0.55],[bx-hw*0.75+tl,by-H*0.9],[bx-hw*0.2+tl,by-H],[bx+hw*0.45+tl,by-H*0.95],[bx+hw*0.9+tl*0.6,by-H*0.62],[bx+hw,by]],(x,y)=>{ const lf=(x+0.5-bx-tl*(by-y)/H)/hw; let v=2.8-lf*1.5+bayV(x,y)*0.6+(hash2((x>>1)*3+sd,y>>1)-0.5)*0.9; if(y>by-2) v-=1.1; if(lf>0.55) v-=0.7;
    const hh=hash2(x*5+sd,y*3); if(y>by-H*0.3 && hh<0.5-(by-y)/H) return M2[Math.floor(hh*6)%3]; if(y<by-H*0.8 && hh<0.3) return M2[1]; if(hh>0.965) return LI; return C[clamp(Math.floor(v),0,5)]; });
  const gy=Math.round(by-H*0.58), gx=Math.round(bx+tl*0.4); psP(S,gx,gy,RU); psP(S,gx,gy+1,RU); psP(S,gx-1,gy+2,RU); psP(S,gx+1,gy+2,RU); psP(S,gx,gy+3,RU);   // a carved rune, faintly lit
  return psCv(psOut(S,C[0],false),bx,by); }
function drSlab(R,C,sd){ const w=Math.ceil(R*1.6)+6, h=Math.ceil(R*0.8)+6, S=PS(w,h), bx=w>>1, by=h-3, M2=cIR(['#3e5a30','#56783e']);
  psPoly(S,[[bx-R*0.7,by-R*0.1],[bx-R*0.5,by-R*0.6],[bx+R*0.62,by-R*0.55],[bx+R*0.72,by]],(x,y)=>{ if(hash2(x*5+sd,y*3)<0.22) return M2[(x+y)&1]; return C[clamp(Math.floor(3-(y-by+R*0.6)/(R*0.6)*1.2+bayV(x,y)*0.8),0,5)]; });
  return psCv(psOut(S,C[0],false),bx,by); }
function drStal(R,C,sd){ const w=Math.ceil(R*2)+6, H=Math.round(R*(1.5+hash2(sd,1)*0.9)), h=H+6, S=PS(w,h), bx=w>>1, by=h-3, hw=R*0.72;   // a stalagmite (or its crystal / ice / glass cousin)
  psPoly(S,[[bx-hw,by],[bx-hw*0.3,by-H*0.7],[bx,by-H],[bx+hw*0.35,by-H*0.6],[bx+hw,by]],(x,y)=>{ const lf=x+0.5<bx; return C[clamp(Math.floor((lf?3:1.8)+(by-y)/H*0.8+bayV(x,y)*0.6),0,5)]; });
  if(hash2(sd,2)<0.6){ const x2=bx+hw*0.9, H2=H*0.5; psPoly(S,[[x2-hw*0.45,by],[x2,by-H2],[x2+hw*0.45,by]],(x,y)=>C[clamp(Math.floor((x+0.5<x2?2.8:1.6)+bayV(x,y)*0.6),0,5)]); }
  return psCv(psOut(S,C[0],true),bx,by); }
function drBush(R,C,sd,dots,n){ const w=Math.ceil(R*2.2)+6, h=Math.ceil(R*1.7)+6, S=PS(w,h), bx=w>>1, by=h-3, cy=by-R*0.62;   // a bush (+ its flowers / berries)
  psBall(S,bx-R*0.35,cy+R*0.05,R*0.58,R*0.5,C,[bx,cy,R],sd,1.2,0.9); psBall(S,bx+R*0.35,cy+R*0.08,R*0.56,R*0.48,C,[bx,cy,R],sd+1,1.2,0.9); psBall(S,bx,cy-R*0.25,R*0.6,R*0.5,C,[bx,cy,R],sd+2,1.2,0.9);
  if(dots) for(let i=0;i<(n||6);i++){ const a=hash2(sd*3+i,5)*TAU, d=Math.sqrt(hash2(sd*7+i,11))*R*0.8, x=bx+Math.cos(a)*d, y=cy+Math.sin(a)*d*0.7; if(!psG(S,x,y)) continue; psP(S,x,y,dots[i%dots.length]); if(dots.length>2 && i%3===0) psP(S,x+1,y,dots[(i+1)%dots.length]); }
  return psCv(psOut(S,C[0],false),bx,by); }
function drSpriteOf(kind,R,P,sd){ const B=P.B, tk=B.tk, cr=B.cr;   // the rim dressing's painters, by kind
  switch(kind){
    case 'fern': return drFern(R,(cr.broad||cr.palm||cr.scrub||Object.values(cr)[0])[0],sd);
    case 'log': return drLog(R,tk,sd,{moss:P.bk!=='savanna'&&P.bk!=='scorch'});
    case 'driftwood': return drLog(R,cIR(['#6a645a','#8e877a','#b2aa9a']),sd,{bark:['#6a645a','#8e877a','#b2aa9a'],end:['#c8c0ae','#a09888']});
    case 'charlog': return drLog(R,cIR(['#141010','#241c18','#382c24']),sd,{bark:['#141010','#241c18','#382c24'],end:['#3a2a20','#8a2a10'],emb:true,ol:'#040303'});
    case 'stump': return drStump(R,tk,sd);
    case 'shroom': return drShrooms(R,sd,['#8a2018','#c83a2a','#e8684a']);
    case 'glowcap': return drShrooms(R,sd,['#2a6a8a','#5ac0e0','#a8f0ff']);
    case 'bones': return drBones(R,sd);
    case 'shells': return drShells(R,sd);
    case 'reeds': return drReeds(R,sd);
    case 'rocks': return drRocks(R,propRamp(B.rk==='crystal'?'crystone':B.rk),sd);
    case 'snowmound': return drMound(R,sd);
    case 'coralbit': return trCoral(R*0.8,cIR(RKR.coral),tk,sd,cI('#3a2020'));
    case 'obsbit': return trObsid(R*0.7,cIR(RKR.obsidian),tk,sd,cI('#040303'));
    case 'crybit': return trSpire(R*0.7,B.cr.spire?B.cr.spire[sd%2]:cIR(RKR.crystal),tk,sd,cI('#03050a'));
    case 'fbush': return drBush(R,(cr.orchard||cr.broad)[0],sd,cIR(['#f08aa6','#ffffff','#b49aff']),9);
    case 'bstump': return drBStump(R,sd);
    case 'stal': return drStal(R,P.C?cIR(P.C.rock):rkRamp('granite'),sd);
    case 'cryst': return trSpire(R*0.9,(TBI('crystal').cr.spire)[sd%2],tk,sd,cI('#03050a'));
    case 'icic': return drStal(R,rkRamp('icerime'),sd);
    case 'obs': return trObsid(R*0.8,cIR(RKR.obsidian),tk,sd,cI('#040303'));
    case 'rail': return drRail(R,sd);                                                                     // (SEAS & DEPTHS DE4) a loose length of the workings' rail
  } return drRocks(R,rkRamp('granite'),sd); }
const DR_SIZE={rail:9, fern:8, log:9, driftwood:9, charlog:9, stump:6, shroom:6, glowcap:6.5, bones:7, shells:6, reeds:7, rocks:6, snowmound:8, coralbit:7, obsbit:8, crybit:8, fbush:7, stal:7, cryst:7.5, icic:7, obs:7.5, bstump:6.5};
/* a puffball cluster (the mushroom grove's herb — and its trap) · cut bamboo stumps */
function drPuff(R,sd){ const w=Math.ceil(R*2.3)+6, h=Math.ceil(R*1.6)+6, S=PS(w,h), bx=w>>1, by=h-3, C=cIR(['#3a2050','#5a3478','#7e50a4','#a476cc','#caa4ec','#f0dcff']), D=cI('#f4ecff');
  const P=[[0,0.62,0.5],[-0.62,0.36,0.34],[0.6,0.3,0.3]].map((q,i)=>[bx+q[0]*R+(hash2(sd,i)-0.5)*1.2, by-R*q[2]*0.9, R*q[1]]);
  P.sort((a,b)=>a[1]-b[1]); for(const q of P){ psDisc(S,q[0],q[1],q[2],q[2]*0.82,(nx,ny,x,y)=>C[clamp(Math.floor(2.6-(nx*0.55+ny*0.85)*1.7+bayV(x,y)*0.6-(ny>0.55?1:0)),0,5)]);   // round, soft & lit top-left
    psP(S,q[0]-q[2]*0.3,q[1]-q[2]*0.35,D); psP(S,q[0]+q[2]*0.25,q[1]-q[2]*0.1,D); psP(S,q[0],q[1]-q[2]*0.62,C[5]); }   // pale warts & its pore
  return psCv(psOut(S,cI('#140a1e'),false),bx,by); }
function drBStump(R,sd){ const w=Math.ceil(R*2)+6, h=Math.ceil(R*1.3)+6, S=PS(w,h), bx=w>>1, by=h-3, G=cIR(['#2a4a1a','#4a7a2a','#7aa83e','#a8cc6a']), CUT=cI('#e8e0a0');
  for(let i=0;i<3;i++){ const x=Math.round(bx+(i-1)*R*0.5), L=Math.round(R*(0.5+hash2(sd,i)*0.6)); for(let t=0;t<=L;t++){ psP(S,x,by-t,t===Math.round(L*0.5)?G[0]:G[2]); psP(S,x+1,by-t,G[1]); } psP(S,x,by-L,CUT); psP(S,x+1,by-L,G[3]); }   // three cut canes, pale where the blade went through
  return psCv(psOut(S,cI('#0a1406'),false),bx,by); }
function drSpr(kind,v){ return tSpr('d'+ISL.biome.key+(ISL.cave?'c':'')+kind+v, ()=>{ const P=ISL._T.P, R=Math.max(2.5,(DR_SIZE[kind]||7)*[0.85,1,1.15][v%3]*TSPR_S); const o=drSpriteOf(kind,R,P,v*5+kind.length); o.sh=kind==='rail'?null:shadowSpr(Math.round(R*0.8),Math.max(1,Math.round(R*0.3)),0.26); return o; }); }   // (DE4: a rail lies flat — no shadow)
function trPick(P,gi,gj,tc){ const h1=hash2(gi*17+3,gj*29+5), h2=hash2(gi*31-7,gj*11+13), h3=hash2(gi*5+41,gj*23-9), h4=hash2(gi*13+1,gj*7+3), tr=P.B.tr;
  let tot=0; for(const t of tr) tot+=t[1]; let r=h3*tot, kind=tr[tr.length-1][0]; for(const t of tr){ if(r<t[1]){ kind=t[0]; break; } r-=t[1]; }
  return {kind, v:Math.floor(h4*9), x:(gi+0.1+h1*0.8)*tc, y:(gj+0.1+h2*0.8)*tc}; }
const TSP_L=[], TSP_G=[];
function terrSprites(T,P,g,CX,CY,CT){ const s=T.s, TS=P.TS, I=P.I, wx0=CX/s, wx1=(CX+CT)/s, wy0=CY/s, wy1=(CY+CT)/s, L=TSP_L; L.length=0;
  const tile=(x,y)=>terrTile(P,Math.floor(x/TS),Math.floor(y/TS)), wall=(tx,ty)=>terrTile(P,tx,ty)===W_WALL;
  // the rim dressing: logs, stumps, bones, shells, reeds, mushrooms — on the floor at a clearing's edge, never in the way of anything
  TSP_G.length=0;                                                                                                        // (glow points the sprites carry — a lit cap, filled below)
  if(ITUNE.terrDress>0){ const DRC=46/Math.max(0.2,ITUNE.terrDress), tab=P.CV?(P.bk==='crystal'||P.bk==='moor'||P.bk==='mushroom'||P.bk==='swamp'?[['rocks',1.4],['glowcap',1],['bones',0.4]]:[['rocks',1.6],['bones',0.5],['stal',0.8]]):P.B.dr;
    const keep=[]; for(const cl of I.clearings) if(cl.kind==='bonus'||cl.kind==='hoard') keep.push([cl.x,cl.y,34]); if(I.landing && !P.CV) keep.push([I.landing.x,I.landing.y,34]);
    for(const q of [I.mouthP,I.ropeP,I.stairP]) if(q) keep.push([q.x,q.y,30]); if(P.CV) keep.push([I.landing.x,I.landing.y,30]);
    for(let gj=Math.floor((wy0-6)/DRC);gj<=Math.floor((wy1+22)/DRC);gj++) for(let gi=Math.floor((wx0-16)/DRC);gi<=Math.floor((wx1+16)/DRC);gi++){
      const h1=hash2(gi*19+7,gj*23+11), h2=hash2(gi*29-3,gj*17+5), h3=hash2(gi*7+13,gj*31-1), x=(gi+h1)*DRC, y=(gj+h2)*DRC, tx=Math.floor(x/TS), ty=Math.floor(y/TS);
      if(terrTile(P,tx,ty)!==W_GROUND) continue; let rim=false, gate=false;
      for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const v=terrTile(P,tx+dx,ty+dy); if(v===W_WALL) rim=true; if(v===W_GATE||v===W_PATH) gate=true; }
      const wet=!P.CV && P.wd[clamp(ty,0,P.H-1)*P.W+clamp(tx,0,P.W-1)]<=1;
      if((!rim && !wet) || gate || h3>0.62) continue; if(keep.some(q=>(q[0]-x)*(q[0]-x)+(q[1]-y)*(q[1]-y)<q[2]*q[2])) continue;
      let kind; if(wet && h3<0.35 && P.bk!=='scorch' && P.bk!=='frost') kind=P.bk==='atoll'?'shells':P.bk==='crystal'?'crybit':P.bk==='volcanic'?'obsbit':P.bk==='mushroom'?'glowcap':'reeds';
      else { const tb=(P.CV && cvDressTab(I,tx,ty))||tab; let tot=0; for(const d of tb) tot+=d[1]; let r=hash2(gi*3+1,gj*5+2)*tot; kind=tb[tb.length-1][0]; for(const d of tb){ if(r<d[1]){ kind=d[0]; break; } r-=d[1]; } }   // (DE4: a deep room's own dressing)
      L.push({o:drSpr(kind,Math.floor(h3*97)%3), x, y, sh:1}); } }
  for(const q of P.stones) L.push({o:tSpr('stone'+q.v+P.bk, ()=>{ const o=drStone(Math.max(3,8.5*TSPR_S),cIR(RKR[{crystal:'crystone',scorch:'basalt',volcanic:'basalt',frost:'icerime',atoll:'coral',dunes:'sandstone',bamboo:'jade',mushroom:'crystone'}[P.bk]||'mossy']),q.v*3+1,{scorch:['#4a4440','#5e5650','#766c64'],volcanic:['#3a3434','#524a48','#ff7a2a'],frost:['#c4d2de','#e0eaf2','#ffffff'],crystal:['#2a6a90','#4a9ac0','#8de9ff'],atoll:['#b86a6a','#d8908a','#f0b8a8'],dunes:['#a07a50','#b88c60','#d0a878'],mushroom:['#4a2a6a','#7a54a0','#c9a6ff']}[P.bk]); o.sh=shadowSpr(Math.round(5*TSPR_S),Math.max(1,Math.round(2*TSPR_S)),0.3); return o; }), x:q.x, y:q.y, sh:1});
  for(const q of P.slabs) L.push({o:tSpr('slab'+(q.v&1)+P.bk, ()=>drSlab(Math.max(3,10.5*TSPR_S),cIR(RKR[P.B.ru]||RKR.mossy),q.v+5)), x:q.x, y:q.y});
  // the forest wall — every tree that can reach this chunk (base within the crown's reach), shadows first, then y-sorted
  if(!P.CV){ const tc=P.B.tc*Math.max(0.4,ITUNE.terrTrees);
    for(let gj=Math.floor((wy0-6)/tc)-1;gj<=Math.floor((wy1+58)/tc)+1;gj++) for(let gi=Math.floor((wx0-38)/tc)-1;gi<=Math.floor((wx1+38)/tc)+1;gi++){   // (every tree whose crown can reach in — the tallest palm, the widest acacia — so a crown straddling two chunks is whole in both)
      const t=trPick(P,gi,gj,tc), tx=Math.floor(t.x/TS), ty=Math.floor(t.y/TS); if(!wall(tx,ty)) continue;
      const lf=trPick(P,gi-1,gj,tc), up=trPick(P,gi,gj-1,tc); for(let n=0;n<2;n++) if((lf.kind===t.kind&&lf.v===t.v)||(up.kind===t.kind&&up.v===t.v)) t.v=(t.v+1+n)%9;   // no two neighbours alike
      const o=treeSpr(P.bk,t.kind,t.v); let x=t.x, y=t.y; const hU=o.ay/s, hL=o.ax/s, hR=(o.w-o.ax)/s;
      if(t.kind==='gshroom' && t.v%3!==0) TSP_G.push(0,0,4,L.length);                                                     // (a glowing cap: its point is placed once the tree settles)
      if(!wall(tx,ty-1)) y=Math.max(y, ty*TS-3-hash2(gi*3,gj*5)*9+hU);     // the forest's north face: crowns lean a little over the floor, never along one ruled line
      if(!wall(tx-1,ty)) x=Math.max(x, tx*TS-5+hL);
      if(!wall(tx+1,ty)) x=Math.min(x, (tx+1)*TS+5-hR);
      if(!wall(tx,ty+1)) y=Math.min(Math.max(y,(ty+1)*TS-4-hash2(gi,gj)*5),(ty+1)*TS+1);   // its south face: the trunks stand at the edge, in plain view
      L.push({o, x, y, sh:1, tree:1}); }
    if(TSP_G.length){ const G2=[]; for(let i=0;i<TSP_G.length;i+=4){ const q=L[TSP_G[i+3]]; if(q) G2.push(Math.round(q.x*s), Math.round(q.y*s)-q.o.ay+Math.round(q.o.h*0.28), TSP_G[i+2]); }   // (global texels, at the cap)
      TSP_G.length=0; for(const v of G2) TSP_G.push(v); } }
  else { for(let ty=Math.floor(wy0/TS)-1;ty<=Math.floor((wy1+30)/TS)+1;ty++) for(let tx=Math.floor((wx0-16)/TS)-1;tx<=Math.floor((wx1+16)/TS)+1;tx++){   // cave: stalagmites at the foot of the cliffs
      if(!wall(tx,ty) || wall(tx,ty+1) || (P.pcr && tx>=0 && ty>=0 && tx<P.W && ty<P.H && P.pcr[ty*P.W+tx])) continue; const h=hash2(tx*13+5,ty*7+3); if(h>0.42) continue;   // (DE5: not under a cathedral's crystals)
      const kind=P.bk==='crystal'?'cryst':P.bk==='frost'?'icic':(P.bk==='scorch'||P.bk==='volcanic')?'obs':P.bk==='mushroom'&&h<0.2?'glowcap':'stal';
      L.push({o:drSpr(kind,Math.floor(h*50)%3), x:(tx+0.15+hash2(tx,ty*5)*0.7)*TS, y:(ty+1)*TS+1.5, sh:1}); }
    if(P.pcl) for(const q of P.pcl){ const z=q[2], Z=z*TS, x0=q[0]*TS, y0=q[1]*TS; if(x0+Z<wx0-30 || x0>wx1+30 || y0+Z<wy0-10 || y0>wy1+40) continue;   // (SEAS & DEPTHS DE5) a cathedral's standing column: crystal prisms clustered on it — a back row, a taller front row, all inside its footprint
      for(let j=0, n=z===3?5:3;j<n;j++){ const h=hash2(q[0]*31+j*7,q[1]*17+j*3), bk=z===3?j<2:j===0, fx=bk?(z===3?0.3+j*0.4:0.5):(z===3?0.18+(j-2)*0.32:0.25+(j-1)*0.5), Ru=(bk?0.22:0.27)*Z*(0.85+h*0.3);
        L.push({o:cvColSpr(Math.max(3,Math.round(Ru*s)),(q[0]*7+q[1]*13+j)%7,h<0.18?1:0), x:x0+fx*Z+(h-0.5)*4, y:y0+(bk?0.55:0.97)*Z}); } } }
  for(const q of P.gcells){ if(q[0]<wx0-20||q[0]>wx1+20||q[1]<wy0-20||q[1]>wy1+20) continue; const o=trampleSpr(q[2]); g.drawImage(o.cv, Math.round(q[0]*s)-CX-o.ax, Math.round(q[1]*s)-CY-o.ay); }
  if(P.rails) cvRailDraw(P,g,s,CX,CY,CT);                                                                                                // (SEAS & DEPTHS DE4) the Old Workings' track, flat on the floor
  L.sort((a,b)=>a.y-b.y||a.x-b.x);
  for(const q of L) if(q.sh && q.o.sh){ const X=Math.round(q.x*s)-CX, Y=Math.round(q.y*s)-CY, S2=q.o.sh; g.drawImage(S2.cv, X-S2.ax+Math.round(q.o.R?q.o.R*0.28:1), Y-S2.ay); }
  for(const q of L){ const X=Math.round(q.x*s)-CX, Y=Math.round(q.y*s)-CY, o=q.o; if(X-o.ax>CT||Y-o.ay>CT||X-o.ax+o.w<0||Y-o.ay+o.h<0) continue; g.drawImage(o.cv, X-o.ax, Y-o.ay); } }
/* ---- per frame: the chunks round the view (baking what's missing), the water beneath, the swash & glints above ---- */
const TERR_VIS=[];
function terrDraw(){ const T=terrState(), s=T.s, CT=T.CT, P=T.P; T.fr++;
  const ox=Math.round(IW/2-icamX*s), oy=Math.round(IH/2-icamY*s);
  const c0=Math.floor(-ox/CT), c1=Math.floor((IW-1-ox)/CT), r0=Math.floor(-oy/CT), r1=Math.floor((IH-1-oy)/CT), vis=TERR_VIS; vis.length=0; let wat=false;
  const lim=T.fr<=16?8:1e9, tb=performance.now(), bk=T.bakes?T.bakeMs/T.bakes:1.5; let rb=0, vb=0;                                         // (the first frames on a new isle: at most ~12 ms of baking each — the fade hides the rest) · (R1a bk: a bake's usual cost — a second one starts only if it fits)
  if(T.rq && T.rq.length){ while(T.rq.length && (!rb || performance.now()-tb+bk<=SECRET.rq)){ const q=T.rq.shift(), C=terrBake(T,q[0],q[1]); C.u=T.fr; T.m.set(q[2],C); rb++; } }   // (C8b: a broken secret door's chunks rebake — ≤ SECRET.rq ms a frame, the stale ones drawn meanwhile, behind the rubble)
  for(let cy=r0;cy<=r1;cy++) for(let cx=c0;cx<=c1;cx++){ const k=(cx+4096)*8192+(cy+4096); let C=T.m.get(k); if(!C){ if(performance.now()-tb>lim) continue; C=terrBake(T,cx,cy); T.m.set(k,C); vb++; } C.u=T.fr; vis.push(C); if(C.wat) wat=true; }
  if(wat) terrWater(T,ox,oy,vis);
  for(const C of vis) pctx.drawImage(C.cv, C.X+ox, C.Y+oy);
  { let lvOn=false; for(const C of vis) if(C.lv){ if(!lvOn){ lvOn=true; pctx.globalCompositeOperation='lighter'; } pctx.globalAlpha=0.1+0.08*Math.sin(itime*2.3+C.X*0.01); pctx.drawImage(C.lv, C.X+ox, C.Y+oy); }   // the caldera's lava breathes
    if(lvOn){ pctx.globalAlpha=1; pctx.globalCompositeOperation='source-over'; } }
  if(wat){ pctx.fillStyle='rgba(236,248,246,.8)';                                                                                            // the swash: foam laps up the sand and slides back
    for(const C of vis){ const L=C.sh; if(!L) continue; const bx=C.X+ox, by=C.Y+oy;
      for(let i=0;i<L.length;i+=4){ const x=L[i], y=L[i+1], gx=C.X+x, gy=C.Y+y, o=Math.sin(itime*1.5+gx*0.19+gy*0.23+Math.sin(gx*0.07)*2);
        if(o<-0.1 || ((gx*7+gy*3)&3)===0) continue; const d=Math.round((o+0.1)*2.2); pctx.fillRect(bx+x-L[i+2]*d, by+y-L[i+3]*d, 1, 1); } } }
  { const tw=itime*2.3;                                                                                                                  // glints: frost sparkles, crystal grit, embers, a cave's glowcaps & puddles
    for(const C of vis){ const L=C.gl; if(!L) continue; const bx=C.X+ox, by=C.Y+oy;
      for(let i=0;i<L.length;i+=3){ const x=L[i], y=L[i+1], kd=L[i+2], ph=(tw+(C.X+x)*0.31+(C.Y+y)*0.57)%4; if(ph>0.6) continue;
        pctx.fillStyle=kd===1?'#ffd070':kd===2?'#e4fbff':kd===3?'#cfe4f2':kd===4?'#f0d8ff':kd===5?'#fff0a0':'#ffffff'; pctx.fillRect(bx+x,by+y,1,1); if(ph<0.25 && kd!==3 && kd!==5){ pctx.globalAlpha=0.6; pctx.fillRect(bx+x-1,by+y,3,1); pctx.fillRect(bx+x,by+y-1,1,3); pctx.globalAlpha=1; } } } }
  const bud=ITUNE.terrBudget; let nb=0; if(bud>0 && !rb){ const t0=performance.now();                                                    // pre-bake the ring round the view, a little each frame (R1a: not on a frame that rebaked — a blast's burnt grass no longer stacks two budgets)
    outer: for(let cy=r0-1;cy<=r1+1;cy++) for(let cx=c0-1;cx<=c1+1;cx++){ if(cy>=r0&&cy<=r1&&cx>=c0&&cx<=c1) continue; const k=(cx+4096)*8192+(cy+4096); if(T.m.has(k)) continue;
      if(nb && performance.now()-t0+bk>bud) break outer; const C=terrBake(T,cx,cy); C.u=T.fr; T.m.set(k,C); nb++; } }
  if(!rb && !vb && !nb && ISL.sanct) sanctPre(T);                                                                                      // (SEAS & DEPTHS DE4) a sealed sanctum's open look, a chunk at a time — only on a frame that baked no land
  if(T.m.size>T.cap){ const A=[...T.m.entries()].sort((a,b)=>a[1].u-b[1].u); for(let i=0;i<A.length-T.cap*0.8;i++) T.m.delete(A[i][0]); } }
function terrWater(T,ox,oy,vis){ const P=T.P, w=P.CV&&P.C?P.C.wat:P.B.wat, s=T.s, CT=T.CT; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;   // the water under the chunks' see-through texels: a base, drifting crests, sparkles (K6: a cave lake's own)
  for(const C of vis) if(C.wat){ x0=Math.min(x0,C.X+ox); y0=Math.min(y0,C.Y+oy); x1=Math.max(x1,C.X+ox+CT); y1=Math.max(y1,C.Y+oy+CT); }
  x0=Math.max(0,x0); y0=Math.max(0,y0); x1=Math.min(IW,x1); y1=Math.min(IH,y1); if(x1<=x0||y1<=y0) return;
  pctx.fillStyle=w[0]; pctx.fillRect(x0,y0,x1-x0,y1-y0);
  const cell=Math.max(5,Math.round(13*s)), gx0=Math.floor((x0-ox)/cell), gx1=Math.floor((x1-ox)/cell), gy0=Math.floor((y0-oy)/cell), gy1=Math.floor((y1-oy)/cell);
  pctx.fillStyle=w[1];
  for(let gy=gy0;gy<=gy1;gy++) for(let gx=gx0;gx<=gx1;gx++){ const h=hash2(gx*7+3,gy*13+1), a=Math.sin(itime*1.25+h*TAU); if(a<0.3) continue;
    const L=1+Math.round((a-0.3)*4.5), X=gx*cell+Math.floor(h*cell)+ox+Math.round(Math.sin(itime*0.5+gy*0.7)*1.5), Y=gy*cell+Math.floor(hash2(gx+11,gy*3)*cell)+oy; pctx.fillRect(X,Y,L,1); if(a>0.85) pctx.fillRect(X+1,Y-1,Math.max(1,L-2),1); }
  pctx.fillStyle='#f0fbff'; for(let gy=gy0;gy<=gy1;gy+=2) for(let gx=gx0;gx<=gx1;gx+=2){ const h=hash2(gx*5+1,gy*9+4); if(((itime*1.7+h*9)%5)<0.18) pctx.fillRect(gx*cell+Math.floor(h*cell)+ox, gy*cell+Math.floor(hash2(gy,gx)*cell)+oy, 1, 1); } }
/* what changed since the bake, drawn over it: a shut gate's brambles, frost & tide ice laid mid-fight */
function trampleSpr(v){ return tSpr('tr'+v+ISL.biome.key+(ISL.cave?'c':''), ()=>{ const s=TSPR_S, T=Math.round(ISL.TS*s), S=PS(T+4,T+4), c=(T+4)>>1, sd=v*19+5, cv=!!ISL.cave;   // a doorway's trampled brambles: broken canes & crushed leaves flat on the trail (a cave: kicked-aside rubble)
  const W2=cv?cIR(['#3a3632','#5a544c']):cIR(['#3a2412','#5a3a1c']), LF=cv?cIR(['#4a4640','#6a6258']):cIR(['#2a4a24','#3e6230']);
  for(let k=0;k<4;k++){ const a=hash2(sd,k)*Math.PI, L=T*(0.25+hash2(sd,k+5)*0.25), x0=c+(hash2(sd,k+9)-0.5)*T*0.6, y0=c+(hash2(sd,k+13)-0.5)*T*0.6; psLine(S,x0,y0,x0+Math.cos(a)*L,y0+Math.sin(a)*L*0.6,W2[k&1],1); }
  for(let i=0;i<5;i++) psP(S,c+(hash2(sd,i+20)-0.5)*T*0.8,c+(hash2(sd,i+30)-0.5)*T*0.7,LF[i&1]);
  return psCv(S,c,c); }); }
function rubbleSpr(v){ return tSpr('rb'+v+ISL.biome.key, ()=>{ const s=TSPR_S, T=Math.round(ISL.TS*s*(1.15+(v%3)*0.12)), S=PS(T+8,T+8), bx=(T+8)>>1, by=T+5, sd=v*13+7, C=cIR(caveTI(ISL.biome).rock), st=[];   // a rockfall across a cave's doorway
  for(let i=0;i<7;i++) st.push([bx+(hash2(sd,i)-0.5)*T*0.72, by-2-hash2(sd,i+9)*T*0.5, T*(0.15+hash2(sd,i+19)*0.12)]); st.sort((a,b)=>a[1]-b[1]);
  for(const q of st) psDisc(S,q[0],q[1],q[2],q[2]*0.8,(nx,ny,x,y)=>C[clamp(Math.floor(2.6-(nx*0.6+ny*0.8)*1.6+bayV(x,y)*0.6-(ny>0.5?1:0)),0,5)]);
  return psCv(psOut(S,C[0],false),bx,by); }); }
function brambleSpr(v){ return tSpr('br'+v+ISL.biome.key, ()=>{ const s=TSPR_S, T=Math.round(ISL.TS*s*(1.15+(v%3)*0.12)), S=PS(T+8,T+8), bx=(T+8)>>1, by=T+5, sd=v*11+3, B=TBI(ISL.biome.key);   // a thorny mound — neighbours overlap into one hedge
  const WR=cIR(['#1c1612','#2a221a','#3a3026','#4c4034','#5e5042','#726252']), W2=cIR(['#241a12','#4a3a2c','#6e5c48']), TH=cI('#d4c4a0'), TH2=cI('#9a8a6c'), cx=bx, cy=by-T*0.42;
  for(let i=0;i<4;i++){ const a=i/4*TAU+sd, x=cx+Math.cos(a)*T*0.2, y=cy+Math.sin(a)*T*0.12; psBall(S,x,y,T*0.31,T*0.27,WR,[cx,cy,T*0.5],sd+i,1.9,1.2); }   // a tangled mound of dead wood
  for(let k=0;k<7;k++){ const a=-Math.PI*1.02+k*0.34+(hash2(sd,k)-0.5)*0.25, n=T*(0.42+hash2(sd,k+20)*0.18); let x=cx+(hash2(sd,k+30)-0.5)*T*0.3, y=cy+2;   // canes arching out, bristling with pale thorns (they point OUTWARD)
    for(let i=0;i<n;i++){ x+=Math.cos(a)*0.9; y+=Math.sin(a)*0.6+i*0.03; psP(S,x,y,W2[2]); psP(S,x,y+1,W2[0]); if(i%2===1){ const ox=Math.round(Math.cos(a-0.9)), oy=Math.round(Math.sin(a-0.9)); psP(S,x+ox,y+oy,TH); psP(S,x+ox*2,y+oy*2,i%4===1?TH2:TH); } } }
  return psCv(psOut(S,cI('#0a0806'),false),bx,by); }); }
function icePatchSpr(v,rim){ return tSpr('ip'+v+(rim?'r':''), ()=>{ const s=TSPR_S, T=Math.round(ISL.TS*s), S=PS(T+8,T+8), c=(T+8)/2, IC=TBI('frost').ice, rx=T*0.6+(rim?1.2:0), ry=T*0.55+(rim?1.2:0);   // frost laid mid-fight: every rim first, then every fill — touching patches melt into one sheet
  psDisc(S,c,c,rx,ry,(nx,ny,x,y)=>{ if(rim) return IC[0]; const sh=((x-y+v*3)%9+9)%9; return sh===0?IC[4]:sh===1?IC[3]:IC[clamp(Math.floor(2.2+bayV(x,y)*0.7),1,3)]; });
  return psCv(S,c,c); }); }
const TOV_ICE=[];
function terrOverlay(){ const I=ISL, T=I._T; if(!T) return; const P=T.P, s=T.s, TS=I.TS, W=I.W;
  const tx0=Math.max(0,Math.floor((icamX-IW/2/s)/TS)-1), tx1=Math.min(W-1,Math.floor((icamX+IW/2/s)/TS)+1), ty0=Math.max(0,Math.floor((icamY-IH/2/s)/TS)-1), ty1=Math.min(I.H-1,Math.floor((icamY+IH/2/s)/TS)+2);
  const IL=TOV_ICE; IL.length=0;
  for(let ty=ty0;ty<=ty1;ty++) for(let tx=tx0;tx<=tx1;tx++){ const k=ty*W+tx, v=I.tiles[k]; if(v===P.T0[k] && v!==W_GATE) continue;
    const [X,Y]=iwp((tx+0.5)*TS,(ty+0.5)*TS);
    if(v===W_GATE){ if(I.ringCells && I.ringCells.has(k)) continue; const gv=(tx*7+ty*13)%6, o=T.gs[gv]||(T.gs[gv]=I.cave?rubbleSpr(gv):brambleSpr(gv)), hw=Math.round(TS*s/2);   // (PT1 K10b: an arena's sealed gateway is rune bars — ringBars)
      pctx.fillStyle='rgba(10,6,2,.5)'; pctx.fillRect(X-hw,Y+hw-1,hw*2,2);                                             // (a dark foot along the barrier: a wall, not a bush)
      pctx.drawImage(o.cv, X-o.ax+((tx*37+ty*11)%5)-2, Y+hw-o.ay+((tx*13+ty*29)%5)-2); }   // (a thorny hedge — below ground a rockfall)
    else if(I.gateT && I.gateT[k]!=null && itime-I.gateT[k]<0.4){ const gv=(tx*7+ty*13)%6, o=T.gs[gv]||(T.gs[gv]=I.cave?rubbleSpr(gv):brambleSpr(gv)), p=clamp((itime-I.gateT[k])/0.4,0,1), hh=Math.round(o.h*(1-p*p));   // S3-05: a gate that just opened SINKS into the ground (0.4 s)
      if(hh>0) pctx.drawImage(o.cv,0,0,o.w,hh, X-o.ax+((tx*37+ty*11)%5)-2, Y+Math.round(TS*s/2)-o.ay+((tx*13+ty*29)%5)-2+(o.h-hh), o.w, hh); }
    else if(v===W_ICE) IL.push(X,Y,(tx*5+ty*3)%3); }
  for(let pass=0;pass<2;pass++) for(let i=0;i<IL.length;i+=3){ const iv=IL[i+2]*2+(pass===0?1:0), o=T.is[iv]||(T.is[iv]=icePatchSpr(IL[i+2],pass===0)); pctx.drawImage(o.cv, IL[i]-o.ax, IL[i+1]-o.ay); }
  const BX=I.bogX; if(BX) for(let pass=0;pass<2;pass++) for(let i=0;i<BX.length;i+=3){ const tx=BX[i], ty=BX[i+1]; if(tx<tx0||tx>tx1||ty<ty0||ty>ty1) continue;   // (§8.8 a boss's ring left the mire behind it)
    const [X,Y]=iwp((tx+0.5)*TS,(ty+0.5)*TS), o=bogPatchSpr(BX[i+2],pass===0); pctx.drawImage(o.cv, X-o.ax, Y-o.ay); }
  if(I.secrets && I.secrets.length) drawSecrets(s,false); }                            // (C8b §10.1) the secret doors: a cracked wall's crack · a glyph boulder (the only thing drawn of a grotto till it opens)
function bogPatchSpr(v,rim){ return tSpr('bp'+v+(rim?'r':''), ()=>{ const s=TSPR_S, T=Math.round(ISL.TS*s), S=PS(T+8,T+8), c=(T+8)/2, BG=TBI('swamp').bog, rx=T*0.62+(rim?1.2:0), ry=T*0.56+(rim?1.2:0);   // a murky pool laid mid-fight (every rim first, then every fill — touching pools run together)
  psDisc(S,c,c,rx,ry,(nx,ny,x,y)=>{ if(rim) return BG[3]; const sh=((x*3+y*5+v*7)%11+11)%11; return sh===0?BG[5]:BG[clamp(Math.floor(1+bayV(x,y)*1.2),0,2)]; });
  return psCv(S,c,c); }); }
