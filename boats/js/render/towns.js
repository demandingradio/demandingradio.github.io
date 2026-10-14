"use strict";
/* FILE: js/render/towns.js
TOWNS IN PIXELS: original lines 31933-32862 (build 5109cd5), moved verbatim, in place after MAELSTROM (ends at original line
  31932 (build 5109cd5), still inline) and directly before js/data/townsfolk_text.js (original lines 32863-33108).
What it is: the walkable harbours on a texel grid (parts 1-6): the grid switch and the baked ground chunks, the buildings
  painter, FOLK (the one painter for every person ashore), the harbour's props and animated water, ambient life, light and
  weather in town, and drawTown, one port frame with its y-sort. It is also the shared pixel-art kit of boat mode and the story.
Globals it owns, by part (plus the other functions between those lines): TOWN_ST, THATCH, TCH, TOX, TOY, T_SAND, T_WET,
  townPixFor, setTownPix, townGridFor, townBiomeKey, tRamp, tPick, tH, TX, TY, townPrep, townBake, townChunk; T_WALL, T_ROOF, pR,
  pxiInto, pxiDim, signSpr, bldPaint and the dress* painters; FOLK, FOLK_P, FOLK_B, folkLook, folkDir, drawFolk, paintFolk,
  CREW_LK, crewLook, PLAYER_LOOK_O, PLAYER_LOOK, playerLook, townLooks, walkFr; OLC, tProp, tOut, lampSprT, lighthouseSpr,
  boatSprT and the prop sprites, townWaterAnim; T_AMB, T_AMBC, townTick, townAmbCalc, townLights, townLightPass, townWeather;
  TDR, TDRN, tdr, drawTown, townLantern, drawBldT, drawPropT, townSpots (no callers).
Entry points: drawTown (frameInner, mode port, when townPixOn); townGridFor (enterPort, rooms, tuning panel); resize() calls
  townPixFor only when townPixOn (allow-list D2); townTick (updatePort); the sea reads TOWN_ST, THATCH, tPick; boat mode and the
  story call tRamp, tH, TX, TY, pR, tOut, tProp, OLC, tdr, TDR, folkLook, drawFolk, crewLook, playerLook, setTownPix, townAmbCalc.
Main globals it reads from elsewhere, at runtime only: TUNE, ITUNE, CSSH, DPR, ISLV, PIX_SCALE, islPixOn, townPixOn, BIOMES,
  PRT, PORT_PAL, SHIP and the livery, player, crew, env, wind, itime, pctx, IW, IH, the pixel kit (js/render/pixkit.js,
  js/render/terrain.js), PXI_ART (js/render/hud_kit.js), LGT and the weather layers (js/render/light.js), the story's actors.
Load-time statements: only literal consts and lets (original lines 31953-31982, 32176 T_WALL and 32204 T_ROOF, 32409-32412,
  32515-32516, 32525, 32653, 32668, 32741 TDR and TDRN) and two new Maps: 32408 FOLK and 32506 CREW_LK. No call at load.
*/
/* ============================================================ *
 *  TOWNS IN PIXELS (w3) — the walkable harbours & their rooms, on a texel grid like the crawl's.
 *  THE GRID: while townPixOn (mode 'port' / 'interior'), ONE TEXEL = ONE BUFFER PX = ONE WORLD UNIT (islScale() = 1),
 *  and a texel is a whole number of device px — round(CSSH·DPR / TUNE.townRows): 4 at 1280×800, 3 at 900×560, 5 at
 *  1920×1080 — so the old 200-unit framing holds at 1280×800 and nothing is ever stretched. TOX/TOY = the whole-texel
 *  camera offset this frame: a world spot (x,y) lands on buffer (round(x)+TOX, round(y)+TOY) — ground & sprites step
 *  together. TUNE.townPix = 0 falls back to the old smooth drawing (drawPortWorld / drawInterior, PIX 2).
 *  · GROUND: baked 64-texel chunks (PRT._V.ch, lazily, a small pre-bake ring each frame, LRU) — the harbour's own biome
 *    (grass ramp, flowers, forest floor, sand & water from TB), cobbles/flags/setts/dirt/sand/boardwalk streets with worn
 *    centres, a plank or stone quay with its face & pilings, the jetty's boards & gaps, a wobbling sandy shore, depth-
 *    dithered harbour water (ripples, glints & 3-frame foam animate over it), the forest past the edges, tree & building
 *    shadows, and small decor. Nothing on the ground is drawn a texel at a time per frame.
 *  · SPRITES: buildings (a pixel facade per kind × biome × port size, baked once per port), trees (the crawl's own tree
 *    painters at the town's texel), props, boats, gulls & FOLK — all with the SNES dark line — y-sorted each frame.
 *  · LIGHT: the crawl's LGT layer (townAmbCalc/townLights: lamps, windows, doors, the lighthouse sweep, the boat's lamp,
 *    hearths) → multiply; lit glass, flames & fireflies redrawn after it. Weather: pixel rain tiles, fog, lightning.
 *  HOOKS FOR THE TOWNSFOLK (w4): folkLook(seed, over) → a look {…} · drawFolk(x,y,look,dir,fr) draws anyone at a world
 *  spot (dir 0 down · 1 up · 2 left · 3 right, fr 0-3 walk) · folkDir(fx,fy) · townSpots() lists where people can
 *  stand in a harbour (shop doors, the square, the board, the well, the quay, the jetty, the lanes) for schedules.
 * ============================================================ */
const TOWN_ST={   // each biome's harbour: walls & roofs [kind, weight] · plaster tints · street · lamp · trees · extras
  _:{walls:[['timber',2],['plaster',2],['boards',1]], pl:['#e7dab9','#dcc6a0','#d9b89a','#cdd2c0','#cdbcc8','#d8c6a2'], roofs:[['gable',2],['tileR',2],['thatch',1],['slate',1]],
     gable:['#9a4a32','#5a6a8a','#4a6a4a','#7a5a3a'], tileR:'#b8563c', slate:'#5a6272', thatch:'gold', street:'cobble', sc:'#9a9aa2', wood:'#9c6e42', lamp:'iron', trees:[['broad',1]], fill:1, floor:'forest', stone:'#c8c0ad', dec:1, fl:1, gk:0.7},
  tropic:{walls:[['plaster',3],['timber',1],['boards',1]], pl:['#f2c9b8','#bfe3d0','#bcd6ee','#f4e6b8','#f6f0e4','#e8b8c8'], roofs:[['palm',3],['tileR',1]], sc:'#b8ab94', trees:[['palm',0.6],['broad',0.4]], fl:1.4},
  atoll:{walls:[['plaster',2],['plank',2]], pl:['#f6f2e8','#bfe3e8','#f2d8c8','#e8f0d8'], roofs:[['palm',1]], street:'sand', wood:'#c4ad86', trees:[['palm',1]], fill:0.8, floor:'sand'},
  savanna:{walls:[['adobe',3],['plaster',1]], pl:['#d8a878','#e4bc8c','#c89060'], roofs:[['thatch',3],['flat',1]], thatch:'straw', street:'dirt', trees:[['acacia',0.8],['dgrass',0.2]], fill:0.75},
  moor:{walls:[['field',3],['timber',1]], roofs:[['slate',3],['thatch',1]], thatch:'grey', sc:'#8a8e90', stone:'#9a9c98', trees:[['gnarl',1]], fill:0.9},
  ember:{walls:[['timber',3],['boards',1]], pl:['#e8d8b8','#dcc8a0','#e4d0b0'], roofs:[['tileR',2],['gable',2]], gable:['#8a3a22','#6a4a2a','#9a5a2a'], tileR:'#b8502e', sc:'#9a8a78', trees:[['oak',1]], leaves:1},
  meadow:{walls:[['plaster',2],['timber',2]], pl:['#f6f2e8','#f0e6d0','#f4ecdc'], roofs:[['thatch',3],['gable',1]], trees:[['orchard',0.6],['broad',0.4]], fl:2.4},
  boulder:{walls:[['field',3],['boards',1]], roofs:[['slate',2],['gable',1]], sc:'#8a9098', stone:'#a0a4a8', trees:[['gnarl',0.6],['boulder',0.4]], fill:0.85},
  frost:{walls:[['log',3],['field',1]], roofs:[['gable',2],['slate',1]], gable:['#6a4a3a','#4a5a6e'], snow:1, sc:'#7a8490', wood:'#7a5a3e', stone:'#b8c0c8', trees:[['spine',1]], fl:0.3, gk:0.1, keepStreet:1},
  scorch:{walls:[['basalt',3],['tarred',1]], roofs:[['slate',1]], slate:'#4a4448', street:'setts', sc:'#5e5854', wood:'#5a4436', stone:'#6a625c', trees:[['char',0.5],['snag',0.5]], fill:0.7, fl:0.3, gk:0.5},
  crystal:{walls:[['stone',2],['field',1]], roofs:[['slate',1]], slate:'#4a5a8a', street:'flag', sc:'#7a86a0', stone:'#9aa4bc', lamp:'crystal', trees:[['conifer',0.7],['spire',0.3]]},
  dunes:{walls:[['adobe',1]], pl:['#e8c898','#dcb482','#f0d8b0','#e0bc90'], roofs:[['flat',3],['dome',1]], street:'flag', sc:'#c8a878', wood:'#c8a878', stone:'#d8bc90', lamp:'brass', trees:[['datepalm',0.7],['cactus',0.3]], fill:0.45, floor:'sand', fl:0.4, gk:0.2},
  swamp:{walls:[['plank',3],['boards',1]], roofs:[['thatch',1]], thatch:'reed', stilts:1, street:'board', wood:'#7a7258', stone:'#7a806e', trees:[['cypress',0.5],['mangrove',0.5]], fl:0.6},
  bamboo:{walls:[['bamboo',2],['plaster',1]], pl:['#f2ece0','#ece2d0'], roofs:[['pagoda',1]], street:'dirt', lamp:'paper', trees:[['bamboo',0.8],['broad',0.2]]},
  mushroom:{walls:[['shroom',1]], roofs:[['cap',1]], street:'flag', sc:'#6a5a78', stone:'#8a7e96', wood:'#7a6450', lamp:'glow', trees:[['gshroom',1]]},
  volcanic:{walls:[['basalt',1]], roofs:[['slate',1]], slate:'#3a3638', street:'setts', sc:'#4a4442', wood:'#4a3a30', stone:'#5a5250', trees:[['ashtree',0.7],['basalt',0.3]], fill:0.7, fl:0.3, gk:0.5} };
const THATCH={gold:'#caa44e', straw:'#d8bc78', grey:'#8a8270', reed:'#6a6440', palm:'#b09448'};
const TCH=64;                                        // ground chunk size (texels)
let TOX=0, TOY=0;                                    // this frame's whole-texel camera offset (town & rooms)
function townPixFor(){ return Math.max(2, Math.round(CSSH*DPR/Math.max(100,TUNE.townRows||200)))/DPR; }   // CSS px per texel (a whole number of device px)
function setTownPix(){ islPixOn=false; townPixOn=true; ISLV.z=1; PIX_SCALE=townPixFor(); resize(); }
function townGridFor(){ if(TUNE.townPix>0) setTownPix(); else setPixScale(2); }   // (port & rooms: the pixel grid, or the old PIX 2)
function townBiomeKey(core){ const f=Math.round(TUNE.townBiome||0); if(f>0 && BIOMES[f-1]) return BIOMES[f-1].key; return slPortBiome(core).key; }
function tRamp(hex){ return cIR([mixHex(hex,'#120a22',0.62),mixHex(hex,'#1a1030',0.4),mixHex(hex,'#241a3a',0.2),hex,mixHex(hex,'#fff4d6',0.22),mixHex(hex,'#fffaf0',0.44)]); }   // 6 shades, SNES-style: shadows lean violet, lights lean warm
function tPick(r,L){ let t=0; for(const e of L) t+=e[1]; let q=r*t; for(const e of L){ q-=e[1]; if(q<=0) return e[0]; } return L[0][0]; }
function tH(x,y){ return hash2(x|0,y|0); }
function TX(x){ return Math.round(x)+TOX; } function TY(y){ return Math.round(y)+TOY; }
const T_SAND=6, T_WET=7;                              // (derived classes: grass by the water · the wet band)
function townSig(){ return (TUNE.townBiome|0)+'|'+TUNE.townTree+'|'+TUNE.townDecal; }
/* ---- the harbour's look, worked out once per visit (PRT._V) ---- */
function townPrep(){ const P=PRT, sg=townSig(); if(P._V && P._V.sig===sg) return P._V;
  const bk=townBiomeKey(P.core), ST=Object.assign({}, TOWN_ST._, TOWN_ST[bk]||{}), B=TB[bk]||TB.tropic, I=TBI(bk), W=P.W, H=P.H, SZ=P.SZ, home=P.core.idx===homePortIdx;
  let street=ST.street; if(SZ===0 && (street==='cobble'||street==='flag') && !ST.keepStreet) street=street==='flag'?'sand':'dirt';   // a hamlet's lane is beaten earth (or sand)
  const quay=(SZ===2||home)&&!ST.stilts ? 'stone' : 'plank';                          // grand harbours (and home) wear a stone quay
  const M=18, EW=W+2*M, EH=H+2*M, cls=new Uint8Array(EW*EH);
  for(let ty=-M;ty<H+M;ty++) for(let tx=-M;tx<W+M;tx++){ let c; if(tx>=0&&ty>=0&&tx<W&&ty<H) c=P.tiles[ty*W+tx]; else c = ty>=H-5?PT_WATER : ty>=H-7?T_SAND : PT_TREE; cls[(ty+M)*EW+tx+M]=c; }
  for(let ty=0;ty<H;ty++) for(let tx=0;tx<W;tx++){ const k=(ty+M)*EW+tx+M; if(cls[k]!==PT_GRASS) continue;   // grass meeting the water → a sandy shore
    let w=false; for(let dy=-1;dy<=1&&!w;dy++) for(let dx=-1;dx<=1;dx++){ if(cls[k+dy*EW+dx]===PT_WATER){ w=true; break; } } if(w) cls[k]=T_SAND; }
  const V={sig:sg, bk, ST, B, I, W, H, SZ, home, street, quay, soft:street==='dirt'||street==='sand', gk:ST.gk, M, EW, EH, cls, ch:new Map(), fr:0, fade:null, bakeMs:0, shore:(H-5)*20,
    g:I.g, u:I.u, p:I.p, sd:I.sd, fl:I.fl, wet:I.wet, st:tRamp(ST.sc), wd:tRamp(ST.wood), qs:tRamp(ST.stone), ol:cI('#1a120c'),
    wat:cIR([B.wat[2],B.wat[1],B.wat[3],B.wat[0],B.wat[4]]), wHi:cI(mixHex(B.wat[1],'#ffffff',0.45)), wSh:cI(mixHex(B.wat[4],'#050a10',0.45)), gap:cI(mixHex(B.wat[4],'#06080a',0.6))};
  V.cAt=(tx,ty)=>{ tx+=M; ty+=M; if(tx<0||ty<0||tx>=EW||ty>=EH) return ty-M>=H-5?PT_WATER:PT_TREE; return cls[ty*EW+tx]; };
  // the street's depth (tiles from its edge) — its worn centre
  const dS=new Float32Array(W*H); { const Q=[]; for(let i=0;i<W*H;i++){ if(P.tiles[i]===PT_STREET){ const x=i%W, y=(i/W)|0; let e=false; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const t=(x+dx<0||y+dy<0||x+dx>=W||y+dy>=H)?PT_GRASS:P.tiles[(y+dy)*W+x+dx]; if(t!==PT_STREET && t!==PT_DOCK){ e=true; break; } } if(e){ dS[i]=1; Q.push(i); } } }
    for(let q=0;q<Q.length;q++){ const i=Q[q], x=i%W, y=(i/W)|0; for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue; const j=ny*W+nx; if(P.tiles[j]===PT_STREET && !dS[j]){ dS[j]=dS[i]+1; Q.push(j); } } } }
  V.dS=dS;
  // the trees: a tree on every forest tile (thinner in open country) — those beside a walkable tile are drawn with the folk (y-sorted); the deep ones are baked into the ground
  V.tsp=new Map(); V.trees=[]; V.btrees=[];
  const walk=c=>c===PT_GRASS||c===PT_STREET||c===PT_DOCK||c===T_SAND;
  for(let ty=-M;ty<H+M;ty++) for(let tx=-M;tx<W+M;tx++){ if(V.cAt(tx,ty)!==PT_TREE) continue; const h1=tH(tx*7+P.core.idx,ty*13+5);
    const inMap=tx>=0&&ty>=0&&tx<W&&ty<H, edgeish=!inMap||tx<2||tx>W-3||ty<2; if(h1>(inMap&&!edgeish?1:ST.fill)) continue;
    const kind=tPick(tH(tx*3+11,ty*5+P.core.idx),ST.trees), v=Math.floor(tH(tx*17+1,ty*3+7)*9), x=tx*20+10+Math.round((tH(tx,ty*7)-0.5)*9), y=ty*20+17+Math.round((tH(tx*5,ty)-0.5)*6);
    let dyn=false; if(inMap) for(let dy=-1;dy<=2&&!dyn;dy++) for(let dx=-1;dx<=1;dx++){ if(walk(V.cAt(tx+dx,ty+dy))){ dyn=true; break; } }
    (dyn?V.trees:V.btrees).push({x,y,kind,v}); }
  V.btrees.sort((a,b)=>a.y-b.y);
  // the buildings (painted once) and the harbour's life
  V.bs=P.blds.map((b,i)=>bldPaint(V,b,i));
  V.foamY=V.shore;                                          // (the quay's waterline)
  V.jet={x0:P.jx*20, x1:(P.jx+2)*20, y1:(H-2)*20};           // the jetty's deck (for the water's clip & foam)
  V.amb=[]; V.ambT=0;
  townLooks(V);
  return P._V=V; }
function townTreeSpr(V,kind,v){ const key=kind+'|'+v; let o=V.tsp.get(key); if(o) return o;
  const sz=[0.84,1,1.17][((v/3)|0)%3], R=Math.max(3,(TR_SIZE[kind]||10)*sz*TUNE.townTree*1.06); o=paintTree(V.bk,kind,v,R); o.R=R; o.low=!!TR_LOW[kind];
  V.tsp.set(key,o); return o; }
/* ---- one texel of the ground (crisp classes for what's built · a wobbling edge where grass, sand & forest meet) ---- */
function townTexel(V,gx,gy,wob){
  const tx=Math.floor(gx/20), ty=Math.floor(gy/20), lx=gx-tx*20, ly=gy-ty*20;
  let c=V.cAt(tx,ty);
  const shoreY=V.shore+Math.round((vnoise(gx*0.09,5.3)-0.5)*9);                                                // the beach's line
  if(wob && (c===PT_GRASS||c===PT_TREE||c===T_SAND||(c===PT_STREET&&V.soft))){                                // organic edges between the soft grounds
    const wx=gx+Math.round((vnoise(gx*0.16+3.1,gy*0.16)-0.5)*7), wy=gy+Math.round((vnoise(gx*0.16,gy*0.16+7.7)-0.5)*7), c2=V.cAt(Math.floor(wx/20),Math.floor(wy/20));
    if(c2===PT_GRASS||c2===PT_TREE||c2===T_SAND||(c2===PT_STREET&&V.soft)) c=c2; }
  if((c===T_SAND||c===PT_WATER) && V.cAt(tx,V.H-6)===T_SAND && gy>=(V.H-8)*20 && gy<(V.H-3)*20) c = gy>=shoreY ? PT_WATER : gy>=shoreY-3 ? T_WET : T_SAND;
  const bay=bayV(gx,gy);
  switch(c){
    case PT_WATER: return townWater(V,gx,gy,tx,ty,lx,ly);
    case PT_DOCK: return townDock(V,gx,gy,tx,ty,lx,ly);
    case PT_STREET: return townStreet(V,gx,gy,tx,ty,lx,ly);
    case PT_BLDG: return V.g[clamp(Math.floor(2.4+bay*0.6+V.gk),0,5)];                                         // (under a building: its sprite covers it — a cap or thatch's rounded corner shows grass)
    case T_WET: return V.wet[clamp(Math.floor(1.4+bay*0.9+(tH(gx*3,gy)-0.5)*0.8),0,2)];
    case T_SAND: { let v=2.3+(vnoise(gx/23,gy/23)-0.5)*1.8+bay*0.8+(tH(gx*5+1,gy*3)<0.04?-1:0); if(gy>=shoreY-7) v-=0.7; return V.sd[clamp(Math.floor(v),0,4)]; }
    case PT_TREE: { if(V.ST.floor==='sand'){ let v=1.6+(vnoise(gx/19,gy/19)-0.5)*1.6+bay*0.8; return V.sd[clamp(Math.floor(v),0,4)]; }
      const v=1.2+(vnoise(gx/17+4,gy/17)-0.5)*2.2+bay*0.9; return v<3?V.u[clamp(Math.floor(v),0,2)]:V.g[clamp(Math.floor(v-3),0,1)]; }
    default: {                                                                                                  // grass: big soft patches, dithered (a town's grass is kept — a shade brighter than the wild)
      let v=2.55+V.gk+(vnoise(gx/31,gy/31)-0.5)*2.2+(vnoise(gx/8.5+9,gy/8.5)-0.5)*0.7+bay*0.8;
      const d=Math.min(V.cAt(tx-1,ty)===PT_STREET?lx:99, V.cAt(tx+1,ty)===PT_STREET?19-lx:99, V.cAt(tx,ty-1)===PT_STREET||V.cAt(tx,ty-1)===PT_DOCK?ly:99, V.cAt(tx,ty+1)===PT_STREET||V.cAt(tx,ty+1)===PT_DOCK?19-ly:99)+Math.round((vnoise(gx*0.3,gy*0.3)-0.5)*2);
      if(d<1 || (d<2 && bay>-0.1) || (d<3 && bay>0.3)) return V.p[clamp(Math.floor(2.2+bay*0.8-d*0.4),0,4)];    // a trodden verge along the street, dithered into the grass
      if(d<4) v-=0.7;
      return V.g[clamp(Math.floor(v),0,5)]; } } }
function townStreet(V,gx,gy,tx,ty,lx,ly){
  const P=PRT, R=V.st, bay=bayV(gx,gy), m=V.street;
  const inMap=tx>=0&&ty>=0&&tx<V.W&&ty<V.H;
  // the worn centre: the street's depth, eased between tile centres
  let wn=0; if(inMap){ const fx=(gx-10)/20, fy=(gy-10)/20, x0=Math.floor(fx), y0=Math.floor(fy), ax=fx-x0, ay=fy-y0, D=(x,y)=>(x<0||y<0||x>=V.W||y>=V.H)?1:(V.dS[y*V.W+x]||1);
    wn=clamp(((D(x0,y0)*(1-ax)+D(x0+1,y0)*ax)*(1-ay)+(D(x0,y0+1)*(1-ax)+D(x0+1,y0+1)*ax)*ay-1.25)/1.1,0,1); }
  if(m==='dirt'||m==='sand'){ const Rr=m==='sand'?V.sd:V.p; let v=2.2+(vnoise(gx/15,gy/15)-0.5)*1.6+bay*0.8+wn*0.6;
    const my=(V.H-11)*20; if(m==='dirt' && gy>=my && gy<my+60){ const ry=(gy-my+Math.round((vnoise(gx*0.05,1.7)-0.5)*4)); if(ry===21||ry===22||ry===38||ry===39) v-=1.2; }   // cart ruts down the high street
    if(tH(gx*3+7,gy*5)<0.03) v+=tH(gx,gy)<0.5?1.3:-1.3;                                                                    // grit & pebbles
    return Rr[clamp(Math.floor(v),0,4)]; }
  if(m==='board'){ const T=P.tiles, TW=V.W, isS=(x,y)=>x>=0&&y>=0&&x<TW&&y<V.H&&T[y*TW+x]===PT_STREET;   // the mire's boardwalk: floorboards (along the street · down the lanes), staggered ends, nails, the odd gap of bog
    const vert=inMap && (isS(tx,ty-1)||isS(tx,ty+1)) && !(isS(tx-1,ty)&&isS(tx+1,ty)), a=vert?gx:gy, l=vert?gy:gx;
    const bx=((a%5)+5)%5, bj=Math.floor(a/5), off=Math.floor(tH(bj,3)*23), L=16+Math.floor(tH(bj,9)*12), pos=(((l+off)%L)+L)%L, seg=Math.floor((l+off)/L), sk=tH(bj*7,seg);
    if(bx===4){ const hg=tH(bj*5+seg,Math.floor(l/3)); return hg<0.05?V.g[1]:hg<0.09?V.g[2]:V.u[0]; }                     // the gap: dark bog water, a reed tuft here & there
    const joint=pos===0; let v=2.5+(sk-0.5)*1.2+bay*0.35+wn*0.4; if(bx===0) v+=0.8; if(bx===3) v-=0.6; if(joint) v=0.4;
    if((pos===2||pos===L-2) && (bx===1||bx===2) && ((bx+seg)&1)) return V.wd[0];                                  // a nail pair at each board's ends
    if(sk<0.12 && bx>0 && bx<3 && tH(gx*3,gy)<0.5) return V.g[(gx+gy)&1?1:2];                                  // moss on the older boards
    if(sk>0.9) v-=1;                                                                                                // a newer, darker plank
    return V.wd[clamp(Math.floor(v),0,5)]; }
  // the square of a grand harbour: rings of setts round its heart
  if(V.SZ===2 && inMap){ const px0=(V.W>>1)-5, sx0=px0*20, sy0=(V.H-15)*20; if(gx>=sx0&&gx<sx0+140&&gy>=sy0&&gy<sy0+80){ const cx=(px0+3)*20, cy=(V.H-13.4)*20+6, dx=gx-cx, dy=(gy-cy)*1.3, r=Math.hypot(dx,dy);
    const ri=Math.floor(r/4.5), rr=r-ri*4.5, circ=Math.max(1,Math.round(TAU*ri*4.5/6)), ai=Math.floor(((Math.atan2(dy,dx)+Math.PI)/TAU)*circ+ri*0.5), aa=(((Math.atan2(dy,dx)+Math.PI)/TAU)*circ+ri*0.5)-ai;
    if(rr>3.6 || aa>0.84) return R[1]; let v=3+(tH(ai*7+ri,ri*13)-0.5)*1.3+bay*0.5+(ri%4===0?0.7:0); if(rr<1.1&&aa<0.4) v+=0.9; return R[clamp(Math.floor(v),0,5)]; } }
  let cw=6, ch=5;
  if(m==='flag'){ cw=9; ch=7; } else if(m==='setts'){ cw=4; ch=4; }
  const row=Math.floor(gy/ch), off=m==='cobble'?Math.floor(tH(row,7)*cw):(row&1)*Math.floor(cw/2)+Math.floor(tH(row,7)*2), col=Math.floor((gx+off)/cw), sx=(gx+off)-col*cw, sy=gy-row*ch;
  const rnd=m==='cobble'&&(sx===0||sx===cw-2)&&(sy===0||sy===ch-2);                                           // (a cobble's rounded corners)
  if(sx===cw-1||sy===ch-1||rnd){                                                 // the joints (a little moss creeps in near the edges; snow lies in them in the north)
    if(wn<0.15 && m!=='setts' && tH(gx*5,gy*3)<0.12) return V.ST.snow?cI('#e8eef4'):V.g[2];
    return m==='flag'?R[2]:R[1]; }
  let v=2.9+(tH(col*7+row*3,row*13+col)-0.5)*(1.0-wn*0.5)+wn*0.9+bay*0.2;                                    // (the worn centre: paler & smoother)
  if(m==='cobble'){ if(sy===0) v+=0.8; else if(sy===ch-2) v-=0.8; if(sx===0) v+=0.4; else if(sx===cw-2) v-=0.4; }   // a domed cobble, lit top-left
  else if(sx===0||sy===0) v+=0.9; else if(sx===cw-2||sy===ch-2) v-=0.6;                                     // each flag or sett lit top-left
  if(m==='flag' && tH(col*3,row*11)<0.12 && sx===((row*3+col)%(cw-2))+1) v-=1.4;                              // a crack
  if(m==='setts' && V.bk==='volcanic' && sx===1 && sy===1 && tH(col*5,row*7)<0.004) return cI('#c8501e');   // a rare coal glowing in the caldera's setts
  return R[clamp(Math.floor(v),0,5)]; }
function townDock(V,gx,gy,tx,ty,lx,ly){
  const bay=bayV(gx,gy), jetty=ty>=V.H-5;
  if(V.quay==='stone' && !jetty){ const R=V.qs, edge=V.cAt(tx,ty+1)===PT_WATER && ly>=17;                   // the stone quay: dressed blocks, a pale coping at the edge
    if(edge){ if(ly===19) return R[1]; return R[ly===17?5:4]; }
    const row=Math.floor(gy/6), off=(row&1)*6, col=Math.floor((gx+off)/12), sx=(gx+off)-col*12, sy=gy-row*6;
    if(sx===11||sy===5) return R[1]; let v=3+(tH(col*3+row,row*7)-0.5)*1.1; if(sx===0||sy===0) v+=0.8; else if(sx===10||sy===4) v-=0.5; return R[clamp(Math.floor(v),0,5)]; }
  const R=V.wd;
  if(jetty){ const by=gy%5, bj=Math.floor(gy/5); if(by===4) return V.gap;                                   // the jetty: boards across, the dark water in the gaps
    let v=2.7+(tH(bj*5,3)-0.5)*1.2+bay*0.6; if(by===0) v+=0.9; if(by===3) v-=0.7; if(lx===0&&V.cAt(tx-1,ty)===PT_WATER) v=1; if(lx===19&&V.cAt(tx+1,ty)===PT_WATER) v=0.5;
    if((gx%20===2||gx%20===17) && by===1) v=0.3;                                                                // nail heads
    return R[clamp(Math.floor(v),0,5)]; }
  const bx=gx%5, bj=Math.floor(gx/5), sh=Math.floor(tH(bj,9)*20), js=((gy+sh)%40);                         // the quay: boards run out to the water
  if(bx===4) return R[0];
  let v=2.8+(tH(bj*7,Math.floor((gy+sh)/40))-0.5)*1.3+bay*0.6; if(bx===0) v+=0.8; if(bx===3) v-=0.6;
  if(js===0) v=0.8; else if(js===2 && (bx===1||bx===2)) v=0.4;                                               // a board's end & its two nails
  if(V.ST.snow && (bx===0||bx===3) && tH(gx,gy*3)<0.3) return cI('#e8f0f6');                                  // snow in the frost-town's gaps
  return R[clamp(Math.floor(v),0,5)]; }
function townWater(V,gx,gy,tx,ty,lx,ly){
  const up=V.cAt(tx,ty-1), L=V.cAt(tx-1,ty), Rt=V.cAt(tx+1,ty), bay=bayV(gx,gy);
  if(up===PT_DOCK){ const jetty=ty-1>=V.H-5;                                                                  // the face of the quay (or the jetty's end), its piles in the water
    if(V.quay==='stone' && !jetty){ if(ly<5){ const R=V.qs, sx=(gx+(ly>=3?5:0))%10; return sx===9?R[0]:R[ly===0?2:1]; } if(ly<7) return cI(mixHex(V.ST.stone,'#1c3a22',0.72)); }
    else { const R=V.wd, pile=(gx%20)>=8&&(gx%20)<=10;
      if(ly<3) return R[ly===0?3:ly===1?2:1];
      if(pile && ly<10) return R[(gx%20)===8?2:ly>=8?0:1]; } }
  const jL=L===PT_DOCK&&tx-1>=0&&ty>=V.H-5&&V.cAt(tx-1,ty)===PT_DOCK, jR=Rt===PT_DOCK&&ty>=V.H-5;
  if((jL && lx<3) || (jR && lx>16)){ const pile=(gy%20)>=6&&(gy%20)<=9; if(pile){ const e=jL?lx:19-lx; return V.wd[e===0?1:e===1?2:0]; } }   // the jetty's piles along its sides
  const dy=gy-V.shore; let t=clamp(dy/150,0,1)*4.2+bay*0.95+(vnoise(gx/40,gy/30)-0.5)*0.8;
  let c=V.wat[clamp(Math.floor(t),0,4)];
  if((up===PT_DOCK && ly<11) || (jL && lx<4) || (jR && lx>15)) c=mixW(c,V.wSh,((up===PT_DOCK?11-ly:jL?4-lx:lx-15)/11)*0.55+((gx+gy)&1)*0.06);   // shade under the quay & beside the jetty
  return c; }
/* ---- a chunk: texel pass (with a margin for the decals) → shadows → baked trees & decor → 3 frames of foam if it has a shoreline ---- */
function townBake(V,cx,cy){ const t0=performance.now(), X0=cx*TCH, Y0=cy*TCH, MG=4, SW=TCH+MG*2;
  const id=new ImageData(TCH,TCH), d=new Uint32Array(id.data.buffer), K=new Uint8Array(SW*SW);
  for(let y=-MG;y<TCH+MG;y++) for(let x=-MG;x<TCH+MG;x++){ const gx=X0+x, gy=Y0+y, tx=Math.floor(gx/20), ty=Math.floor(gy/20); K[(y+MG)*SW+x+MG]=V.cAt(tx,ty);
    if(x>=0&&y>=0&&x<TCH&&y<TCH) d[y*TCH+x]=townTexel(V,gx,gy,true); }
  townDecals(V,d,K,X0,Y0,MG,SW);
  const cv=document.createElement('canvas'); cv.width=cv.height=TCH; const g=cv.getContext('2d'); g.putImageData(id,0,0);
  // shadows: every tree's (the light is top-left, they fall right & down) · the buildings' (their right side & their foot)
  g.fillStyle='rgba(8,4,18,0.28)';
  for(let i=0;i<PRT.blds.length;i++){ const b=PRT.blds[i], x=b.x0*20, y=b.y0*20, w=b.w*20, h=b.h*20; if(x>X0+TCH+8||x+w+8<X0||y>Y0+TCH||y+h+4<Y0) continue;
    const fh=V.bs[i].faceH; g.fillRect(x+w-X0,y+h-fh-6-Y0,5,fh+8); g.fillRect(x-X0+2,y+h-Y0,w+3,2); g.fillRect(x-X0+4,y+h+2-Y0,w-2,1); }
  const TR=[V.btrees,V.trees];
  for(const L of TR) for(const t of L){ if(t.x<X0-40||t.x>X0+TCH+40||t.y<Y0-10||t.y>Y0+TCH+24) continue; const o=townTreeSpr(V,t.kind,t.v), rx=Math.round(o.R*(o.low?0.8:0.95)), ry=Math.max(1,Math.round(o.R*(o.low?0.3:0.4))), sh=shadowSpr(rx,ry,0.3);
    g.drawImage(sh.cv,t.x+Math.round(o.R*0.28)-sh.ax-X0,t.y+1-sh.ay-Y0); }
  for(const t of V.btrees){ const o=townTreeSpr(V,t.kind,t.v); if(t.x-o.ax>X0+TCH||t.x-o.ax+o.w<X0||t.y-o.ay>Y0+TCH||t.y-o.ay+o.h<Y0) continue; g.drawImage(o.cv,t.x-o.ax-X0,t.y-o.ay-Y0); }
  const C={cv, X:X0, Y:Y0, u:V.fr, fo:null};
  if(Y0+TCH>=V.shore-8 && Y0<=V.jet.y1+16) C.fo=townFoam(V,X0,Y0);
  V.bakeMs+=performance.now()-t0; return C; }
/* the decals: stamped from their own lattice (every 3 texels), whole across chunk seams, only where the ground suits them */
function townDecals(V,d,K,X0,Y0,MG,SW){ const dk=TUNE.townDecal*(V.ST.dec||1); if(!(dk>0)) return;
  const put=(x,y,c)=>{ x-=X0; y-=Y0; if(x>=0&&y>=0&&x<TCH&&y<TCH) d[y*TCH+x]=c; };
  const kAt=(x,y)=>{ x-=X0-MG; y-=Y0-MG; return (x<0||y<0||x>=SW||y>=SW)?255:K[y*SW+x]; };
  const g=V.g, fl=V.fl, flK=V.ST.fl, pb=V.I.pb, sn=V.ST.snow, lv=V.ST.leaves;
  for(let ly=Math.floor((Y0-MG)/3);ly<=Math.floor((Y0+TCH+MG)/3);ly++) for(let lx=Math.floor((X0-MG)/3);lx<=Math.floor((X0+TCH+MG)/3);lx++){
    const h=tH(lx*31+7,ly*17+3); if(h>0.2*dk) continue; const x=lx*3+Math.floor(tH(lx,ly*5)*3), y=ly*3+Math.floor(tH(lx*9,ly)*3), k=kAt(x,y);
    const clump=vnoise(x/26+2,y/26); const r=tH(lx*5+1,ly*7+2);
    if(k===PT_GRASS){ if(kAt(x,y-2)!==PT_GRASS || kAt(x+1,y)!==PT_GRASS) continue;
      if(r<0.07*flK*clump*2 && h<0.08*dk){ const c=fl[Math.floor(tH(lx,ly*3)*fl.length)]; put(x,y,c); put(x-1,y,c); put(x+1,y,c); put(x,y-1,c); put(x,y+1,g[1]); put(x,y,cI('#fff4c8')); }   // a flower
      else if(sn && r<0.5){ put(x,y,cI('#f2f6fa')); put(x+1,y,cI('#dce6f0')); put(x-1,y,cI('#c4d2e0')); }        // a drift of snow
      else if(lv && r<0.45){ const c=cI(['#c8641e','#e08a2a','#a84a1a'][Math.floor(h*37)%3]); put(x,y,c); put(x+1,y,c); }   // fallen leaves
      else if(r<0.72){ put(x,y,g[5]); put(x,y-1,g[5]); put(x-1,y,g[4]); put(x+1,y,g[0]); if(r<0.5) put(x+1,y-1,g[4]); }   // a tuft
      else if(r<0.86){ put(x,y,pb[0]); put(x+1,y,pb[1]); put(x,y-1,pb[0]); }                                        // a pebble
      else { put(x,y,g[4]); put(x+1,y,g[4]); put(x,y+1,g[1]); } }                                                   // clover
    else if(k===T_SAND){ if(r<0.35){ put(x,y,cI('#f0e8dc')); put(x+1,y,cI('#c8b8a4')); } else if(r<0.55){ put(x,y,pb[0]); } }   // shells & grit
    else if(k===PT_TREE){ if(V.ST.floor==='sand') continue; if(r<0.5){ put(x,y,g[1]); put(x+1,y,g[0]); } else if(lv||r<0.6) put(x,y,cI('#8a4a1e')); }
    else if(k===PT_STREET && V.street!=='board'){ const edge=kAt(x,y-5)!==PT_STREET||kAt(x,y+5)!==PT_STREET||kAt(x-5,y)!==PT_STREET||kAt(x+5,y)!==PT_STREET;   // weeds in the joints near the edge
      if(edge && r<0.5 && !sn){ put(x,y,g[4]); put(x,y-1,g[5]); } else if(sn && edge && r<0.7){ put(x,y,cI('#eef4f8')); put(x+1,y,cI('#dce6ee')); } } } }
/* the foam at the water's edge: 3 frames per chunk (only chunks with a shoreline) — the swash creeps in and out */
function townFoam(V,X0,Y0){ const F=[]; let any=false;
  const isW=(gx,gy)=>{ const tx=Math.floor(gx/20), ty=Math.floor(gy/20); let c=V.cAt(tx,ty); if(c!==PT_WATER && c!==T_SAND) return false;
    if(V.cAt(tx,V.H-6)===T_SAND && gy>=(V.H-8)*20 && gy<(V.H-3)*20) return gy>=V.shore+Math.round((vnoise(gx*0.09,5.3)-0.5)*9);
    if(c!==PT_WATER) return false; if(V.cAt(tx,ty-1)===PT_DOCK){ const face=(V.quay==='stone'&&ty-1<V.H-5)?7:3; if(gy-ty*20<face) return false; } return true; };
  const edge=new Uint8Array(TCH*TCH);
  for(let y=0;y<TCH;y++) for(let x=0;x<TCH;x++){ const gx=X0+x, gy=Y0+y; if(!isW(gx,gy)) continue;
    let e=0; for(let q=1;q<=3;q++){ if(!isW(gx,gy-q)){ e=q; break; } if(!isW(gx-q,gy)||!isW(gx+q,gy)){ e=q+8; break; } } if(e){ edge[y*TCH+x]=e; any=true; } }   // (+8: a side — the jetty's flanks lap more gently than the quay's face)
  if(!any) return null;
  const W1=cIA('#f4fbff',0.95), W2=cIA('#dff2f8',0.7), W3=cIA('#c8e6f0',0.45);
  for(let f=0;f<3;f++){ const id=new ImageData(TCH,TCH), d=new Uint32Array(id.data.buffer);
    for(let i=0;i<TCH*TCH;i++){ let e=edge[i]; if(!e) continue; const gx=X0+(i%TCH), gy=Y0+((i/TCH)|0), h=tH(gx*3+f*7,Math.floor(gx/3)+f*13);
      if(e>8){ e-=8; const hs=tH(gy*5+f*11,Math.floor(gy/4)+f*3); if(e===1 && hs<0.4) d[i]=hs<0.15?W1:W2; else if(e===2 && hs<0.12) d[i]=W3; continue; }
      const reach=1+((f+Math.floor(gx/4))%3===0?1:0)+(h<0.3?1:0);                                           // the swash reaches 1-3 texels out, frame by frame
      if(e<=reach) d[i]= e===1?(h<0.8?W1:W2) : e===2?(h<0.6?W2:0) : (h<0.4?W3:0); }
    const cv=document.createElement('canvas'); cv.width=cv.height=TCH; cv.getContext('2d').putImageData(id,0,0); F.push(cv); }
  return F; }
function townChunk(V,cx,cy){ const key=(cx+512)*4096+(cy+512); let C=V.ch.get(key); if(C){ C.u=V.fr; return C; }
  C=townBake(V,cx,cy); V.ch.set(key,C);
  if(V.ch.size>300){ let n=0; for(const [k,o] of V.ch){ if(V.fr-o.u>60){ V.ch.delete(k); if(++n>=60) break; } } }
  return C; }
/* ---- the buildings: a 3/4 pixel facade per kind × biome × port size — the wall, its windows & door, the roof & its eave
   shadow, a chimney, the trade's dressing — painted texel by texel into one sprite with the dark SNES line (baked once) ---- */
function pR(S,x,y,w,h,c){ for(let j=y;j<y+h;j++) for(let i=x;i<x+w;i++) psP(S,i,j,c); }
function pxiInto(S,n,x0,y0){ const A=PXI_ART[n]; if(!A) return; const rows=typeof A.a==='string'?PXI_ART[A.a].a:A.a, P={}; for(const k in A.p) P[k]=cI(A.p[k]);   // a HUD pixel icon painted into a sprite
  for(let y=0;y<rows.length;y++) for(let x=0;x<rows[y].length;x++){ const c=P[rows[y][x]]; if(c) psP(S,x0+x,y0+y,c); } }
function pxiDim(n){ const A=PXI_ART[n]; if(!A) return [0,0]; const rows=typeof A.a==='string'?PXI_ART[A.a].a:A.a; return [rows.reduce((m,r)=>Math.max(m,r.length),0), rows.length]; }
/* walls — (S, x0,y0 w×h, R a 6-shade ramp, sd a seed, o extras) */
const T_WALL={
  plaster(S,x0,y0,w,h,R,sd){ for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ let v=3; const q=tH(x*3+sd,y*5); if(q<0.06) v=2; else if(q>0.965) v=4; if(x===x0) v=4; else if(x===x0+w-1) v=2; if(y>=y0+h-2) v=Math.min(v,2); psP(S,x,y,R[v]); } },
  timber(S,x0,y0,w,h,R,sd,o){ T_WALL.plaster(S,x0,y0,w,h,R,sd); const B=o.beam, my=y0+Math.round(h*0.42);
    const posts=[x0,x0+w-2]; for(let x=x0+22;x<x0+w-12;x+=22) posts.push(x);
    for(const px of posts){ pR(S,px,y0,2,h,B[1]); pR(S,px,y0,1,h,B[2]); }
    pR(S,x0,y0,w,2,B[1]); pR(S,x0,y0+1,w,1,B[0]); pR(S,x0,my,w,2,B[1]); pR(S,x0,my,w,1,B[2]);
    for(let k=0;k<posts.length-1;k++){ const a=posts[k]+2, b2=posts[k+1]; if(b2-a<10) continue; const flip=(k+sd)&1;   // a brace in each lower panel
      psLine(S,flip?a:b2-1,my+2,flip?a+Math.min(7,b2-a-2):b2-1-Math.min(7,b2-a-2),y0+h-3,B[1],2); } },
  boards(S,x0,y0,w,h,R,sd){ for(let y=y0;y<y0+h;y++){ const k=Math.floor((y-y0)/3), r=(y-y0)%3; for(let x=x0;x<x0+w;x++){ let v=r===2?1:r===0?4:3; if(tH(k*5+sd,Math.floor((x+k*7)/13))<0.18&&r!==2) v--; if(x===x0&&r!==2) v=Math.min(5,v+1); if(x===x0+w-1) v=Math.max(1,v-1); psP(S,x,y,R[v]); } } },
  stone(S,x0,y0,w,h,R,sd,o){ const bw=(o&&o.bw)||9, bh=(o&&o.bh)||5; for(let y=y0;y<y0+h;y++){ const row=Math.floor((y-y0)/bh), off=(row&1)*Math.floor(bw/2), sy=(y-y0)%bh;
    for(let x=x0;x<x0+w;x++){ const col=Math.floor((x-x0+off)/bw), sx=(x-x0+off)%bw; if(sx===bw-1||sy===bh-1){ psP(S,x,y,R[1]); continue; }
      let v=3+(tH(col*7+sd,row*3)-0.5)*1.4+bayV(x,y)*0.4; if(sx===0||sy===0) v+=0.9; if(x===x0+w-1) v-=0.8; psP(S,x,y,R[clamp(Math.floor(v),1,5)]); } } },
  field(S,x0,y0,w,h,R,sd){ for(let y=y0;y<y0+h;y++){ const row=Math.floor((y-y0)/5), sy=(y-y0)%5; let cx=x0-Math.floor(tH(row,sd)*5), col=0;   // rounded fieldstones, no two alike
    while(cx<x0+w){ const cw=4+Math.floor(tH(row*13+col,sd*3)*5), tone=tH(row*7+col*3,sd+1); for(let x=Math.max(x0,cx);x<Math.min(x0+w,cx+cw);x++){ const sx=x-cx;
        const corner=(sx===0||sx===cw-1)&&(sy===0||sy===3); if(sx===cw-1||sy===4||corner){ psP(S,x,y,R[0]); continue; }
        let v=2.2+tone*1.6+(sy===0||sx===0?0.8:0)-(sy===3?0.6:0); psP(S,x,y,R[clamp(Math.floor(v),1,5)]); } cx+=cw; col++; } } },
  tarred(S,x0,y0,w,h,R,sd){ for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const bx=(x-x0)%4, bj=Math.floor((x-x0)/4); let v=bx===3?0:bx===0?3:2; if(tH(bj*3+sd,Math.floor(y/9))<0.2&&bx!==3) v=Math.max(1,v-1); if(y===y0&&bx!==3) v=4; psP(S,x,y,R[v]); } },
  adobe(S,x0,y0,w,h,R,sd){ for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ let v=3+(vnoise(x/6+sd,y/6)-0.5)*1.1+bayV(x,y)*0.5; if(x===x0) v+=1; if(x===x0+w-1) v-=1; if(y>=y0+h-3) v-=0.9; psP(S,x,y,R[clamp(Math.floor(v),1,5)]); }
    for(let k=0;k<2;k++){ let x=x0+5+Math.floor(tH(sd,k)*(w-10)), y=y0+4+Math.floor(tH(k,sd)*(h-10)); for(let j=0;j<4;j++){ psP(S,x,y,R[1]); x+=tH(sd+j,k)<0.5?1:0; y++; } } },   // hairline cracks
  log(S,x0,y0,w,h,R,sd){ for(let y=y0;y<y0+h;y++){ const r=(y-y0)%4, k=Math.floor((y-y0)/4); for(let x=x0;x<x0+w;x++){ let v=[4,3,2,0][r]; if(tH(k*9+sd,Math.floor(x/7))<0.15&&r===1) v=2; psP(S,x,y,R[v]); } }
    for(let y=y0;y<y0+h-1;y+=4){ for(const ex of [x0-1,x0+w-2]){ psP(S,ex,y,R[3]); psP(S,ex+1,y,R[4]); psP(S,ex,y+1,R[2]); psP(S,ex+1,y+1,R[3]); psP(S,ex,y+2,R[1]); psP(S,ex+1,y+2,R[2]); } } },   // the log ends at the corners
  basalt(S,x0,y0,w,h,R,sd){ T_WALL.stone(S,x0,y0,w,h,R,sd,{bw:7,bh:6}); if(PRT&&PRT._Vbk==='volcanic') for(let k=0;k<3;k++){ const x=x0+2+Math.floor(tH(sd,k+3)*(w-4)), y=y0+3+Math.floor(tH(k+5,sd)*(h-6)); psP(S,x,y,cI('#ff7a2a')); } },
  bamboo(S,x0,y0,w,h,R,sd){ for(let x=x0;x<x0+w;x++){ const cx=(x-x0)%3, cj=Math.floor((x-x0)/3), of=Math.floor(tH(cj,sd)*7); for(let y=y0;y<y0+h;y++){ const node=((y-y0+of)%8)===0;
      let v=cx===0?4:cx===1?3:1; if(node) v=cx===2?0:1; else if(((y-y0+of)%8)===1&&cx<2) v=5; psP(S,x,y,R[v]); } } },
  plank(S,x0,y0,w,h,R,sd){ for(let x=x0;x<x0+w;x++){ const bx=(x-x0)%5, bj=Math.floor((x-x0)/5), t=tH(bj*7+sd,3); for(let y=y0;y<y0+h;y++){ let v=bx===4?0:2.2+t*1.5+(bx===0?0.8:0); if(y>=y0+h-4 && tH(x*3,y)<0.5+(y-(y0+h-4))*0.15) { psP(S,x,y,cI(['#3e5a2e','#4e6a36','#5a7a3e'][(x+y)%3])); continue; } psP(S,x,y,R[clamp(Math.floor(v),0,5)]); } } },   // weathered boards, moss creeping up the foot
  shroom(S,x0,y0,w,h,R,sd){ for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const fib=tH(x*5+sd,Math.floor(y/5))<0.25; let v=3+(fib?-0.8:0)+bayV(x,y)*0.5; const rel=(x-x0)/w; v+=rel<0.15?1:rel>0.85?-1:0; psP(S,x,y,R[clamp(Math.floor(v),1,5)]); } } };
/* roofs — (S, x0,y0 w×h: the roof's rect, eave at the bottom, R ramp, sd, o) */
function roofLit(x,x0,w){ return (1-(x-x0)/Math.max(1,w))*0.9-0.45; }                           // (the top-left light across a roof)
const T_ROOF={
  gable(S,x0,y0,w,h,R,sd,o){ const T=o.trim; for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const yy=y-y0;
      if(yy<2){ psP(S,x,y,R[yy===0?5:4]); continue; }
      const row=Math.floor((yy-2)/4), ry=(yy-2)%4, off=(row%2)*3, sx=(x-x0+off)%6; let v=3+roofLit(x,x0,w)+bayV(x,y)*0.5+(tH(Math.floor((x-x0+off)/6)*3+sd,row)-0.5)*0.9;
      if(ry===3) v-=1.6; else if(sx===5) v-=1.1; else if(ry===0) v+=0.5;
      if(y>=y0+h-2) v=y===y0+h-1?0:1; psP(S,x,y,R[clamp(Math.floor(v),0,5)]); }
    for(let y=y0;y<y0+h-1;y++){ psP(S,x0,y,T[2]); psP(S,x0+1,y,T[1]); psP(S,x0+w-1,y,T[0]); psP(S,x0+w-2,y,T[1]); } },
  tileR(S,x0,y0,w,h,R,sd){ for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const yy=y-y0; if(yy<2){ psP(S,x,y,R[yy===0?4:3]); continue; }
      const row=Math.floor((yy-2)/5), ry=(yy-2)%5, sx=(x-x0+(row&1)*2)%5; let v=3+roofLit(x,x0,w)+bayV(x,y)*0.4;
      if(sx===0) v=1.2; else if(sx===1) v+=1.1; else if(sx===4) v-=0.9; if(ry===4) v=(sx===0||sx===4)?0.2:1.4; else if(ry===0&&sx>0) v+=0.4;
      if(y>=y0+h-1) v=0; psP(S,x,y,R[clamp(Math.floor(v),0,5)]); } },
  slate(S,x0,y0,w,h,R,sd){ for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const yy=y-y0; if(yy<2){ psP(S,x,y,R[yy===0?4:2]); continue; }
      const row=Math.floor((yy-2)/4), ry=(yy-2)%4, off=(row&1)*4, sx=(x-x0+off)%8; let v=2.8+roofLit(x,x0,w)+(tH(Math.floor((x-x0+off)/8)*5+sd,row*3)-0.5)*1.3+bayV(x,y)*0.3;
      if(ry===3||sx===7) v=1.1; else if(ry===0) v+=0.5; if(y>=y0+h-1) v=0; psP(S,x,y,R[clamp(Math.floor(v),0,5)]); } },
  thatch(S,x0,y0,w,h,R,sd,o){ const cut=(x,y)=>{ const yy=y-y0, e=Math.min(x-x0,x0+w-1-x); return (yy<3 && e<3-yy) || (y>=y0+h-2 && e<1); };   // (rounded at the corners)
    for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ if(cut(x,y)) continue; const yy=y-y0;
      const k=Math.floor((yy-3)/6), cy=(yy-3)%6, st=tH(x*5+sd,k*7), hang=cy===5 && tH(x*3+k,sd)<0.4;   // courses of straw: bundled strands, each course lipping over the next
      let v=2.9+roofLit(x,x0,w)+(st-0.5)*0.9+(tH(Math.floor(x/2)*3+sd,k)<0.16?-0.7:0);
      if(yy<3) v=((x>>1)+yy)&1?1.8:3.6; else if(cy===0) v+=0.9; else if(cy===4) v-=0.7; else if(cy===5 && !hang) v-=1.6;   // the ridge braid · a course's lit top & its shadowed lip
      if(y>=y0+h-3){ v=y===y0+h-1?0.4:y===y0+h-2?1.2:2.2; if(y===y0+h-1 && tH(x*3,sd)<0.35) continue; }       // the thick eave lip, ragged
      psP(S,x,y,R[clamp(Math.floor(v),0,5)]); }
    if(o.palm){ const G=cIR(['#1e4a1c','#2e6a2a','#4a8a38','#6aa64a']); for(let x=x0+2;x<x0+w-2;x+=4){ const L=2+Math.floor(tH(x,sd)*3); for(let j=0;j<L;j++){ psP(S,x+(j>>1),y0+h+j-1,G[j===0?3:j===L-1?0:2]); psP(S,x-1-(j>>1),y0+h+j-1,G[1]); } } }   // frond tips hang off the eave
    if(o.moss){ const G=cIR(['#2e4a22','#3e5e2a','#56763a']); for(let i=0;i<w*h*0.06;i++){ const x=x0+Math.floor(tH(i,sd)*w), y=y0+3+Math.floor(tH(sd,i)*(h-5)); if(!cut(x,y)){ psP(S,x,y,G[i%3]); psP(S,x+1,y,G[(i+1)%3]); } } } },
  pagoda(S,x0,y0,w,h,R,sd){ const up=x=>{ const u=Math.abs(2*(x-x0)/(w-1)-1); return Math.round(Math.pow(u,5)*4); };   // glazed tiles, the eave sweeping up at the ends
    for(let x=x0;x<x0+w;x++){ const e=up(x); for(let y=y0-1;y<y0+h-e;y++){ const yy=y-y0; if(yy<1){ if(x===x0||x===x0+w-1) continue; psP(S,x,y,R[5]); continue; } if(yy<3){ psP(S,x,y,R[yy===1?4:2]); continue; }
        const sx=(x-x0+((Math.floor((yy-3)/4))&1)*2)%4, ry=(yy-3)%4; let v=3+roofLit(x,x0,w)+bayV(x,y)*0.4; if(sx===0) v=1.3; else if(sx===1) v+=1; if(ry===3) v-=1.2;
        if(y>=y0+h-e-2) v=y===y0+h-e-1?0:1.2; psP(S,x,y,R[clamp(Math.floor(v),0,5)]); } }
    for(const ex of [x0-1,x0+w]){ psP(S,ex,y0+h-6,R[4]); psP(S,ex,y0+h-7,R[5]); } psP(S,x0+1,y0-2,R[4]); psP(S,x0+w-2,y0-2,R[4]); },   // the curled ridge ends
  cap(S,x0,y0,w,h,R,sd,o){ const cx=x0+w/2, rx=w/2+3, top=y0-10, ry=(h+10), cyc=top+ry;   // a mushroom cap: a dome spilling over the walls, gills under the rim, spots
    for(let y=top;y<y0+h+1;y++) for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){ const nx=(x+0.5-cx)/rx, ny=(y+0.5-cyc)/ry; if(nx*nx+ny*ny>1 || ny>0) continue;
      const l=-(nx*0.6+ny*0.8); let v=2.4+l*1.8+bayV(x,y)*0.6; if(y>=y0+h-2) v=y===y0+h?0:1; psP(S,x,y,R[clamp(Math.floor(v),0,5)]); }
    const D=cIR(['#fff4e8','#f0e0cc']); for(let i=0;i<Math.round(w/5);i++){ const a=tH(sd*3+i,5), x=Math.round(cx+(a-0.5)*w*0.9), y=Math.round(top+4+tH(i,sd)*(h+2)); if(!psG(S,x,y)||!psG(S,x+1,y+1)) continue; psP(S,x,y,D[0]); psP(S,x+1,y,D[1]); psP(S,x,y+1,D[1]); if(i%2){ psP(S,x+1,y+1,D[1]); psP(S,x-1,y,D[1]); } } },
  flat(S,x0,y0,w,h,R,sd,o){ const D=cIR([mixHex('#9a6a44','#1a1030',0.35),'#9a6a44','#b0805a','#c09068']);   // a flat adobe roof seen from above: a clay-tiled deck sunk inside its parapet, the parapet's face at the front, life up top
    for(let y=y0;y<y0+h;y++) for(let x=x0+2;x<x0+w-2;x++){ const yy=y-y0, e=Math.min(x-x0-2,x0+w-3-x,yy);
      let c; if(y>=y0+h-5) c=R[y===y0+h-1?1:y===y0+h-5?5:y===y0+h-4?4:3];
      else if(e<3) c=R[e===0?3:e===1?5:4];
      else { const inS=(x-x0-5)<2||yy<5; const tx=(x-x0)%6, ty=yy%5; let v=1.8+(tH(Math.floor((x-x0)/6)*3+sd,Math.floor(yy/5))-0.5)*1.2+(tx===0||ty===0?-0.9:0)+(inS?-1:0); c=D[clamp(Math.floor(v),0,3)]; }
      psP(S,x,y,c); }
    const P2=cIR(['#6a3a1c','#a0562a','#c8783e']), pot=(px,py)=>{ pR(S,px,py,4,4,P2[1]); pR(S,px,py,4,1,P2[2]); psP(S,px+3,py+2,P2[0]); psP(S,px+3,py+3,P2[0]); pR(S,px+1,py-1,2,1,cI('#4a8a3a')); };
    pot(x0+7,y0+6); if(w>60) pot(x0+w-14,y0+8);
    if(!o.dome){ const rx0=x0+Math.round(w*0.36), Rg=[cI('#b83a3a'),cI('#e8c050'),cI('#3a6ab0')]; for(let j=0;j<7;j++) for(let i=0;i<14;i++) psP(S,rx0+i,y0+8+j,Rg[(i>>1)%3]); pR(S,rx0,y0+15,14,1,cI('#5a2a1a')); }   // a rug airing on the roof
    const hx=x0+w-18, hy=y0+h-14; pR(S,hx,hy,7,6,cI('#3a2414')); for(let j=0;j<6;j+=2) pR(S,hx+1,hy+j,5,1,cI('#8a6a40'));   // the hatch & its ladder
    if(o.dome){ const cx=x0+w/2, rx=Math.min(12,Math.round(w*0.2)), base=y0+Math.round(h*0.62), ht=Math.round(rx*0.95), Wd=cIR(['#8a8878','#c8c4b4','#e8e4d8','#f8f6ee','#ffffff']);   // a whitewashed dome & its gilt finial
      for(let y=base-ht;y<base+2;y++) for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){ const nx=(x+0.5-cx)/rx, ny=(y+0.5-base)/ht; if(y<=base && nx*nx+ny*ny>1) continue; if(y>base && Math.abs(nx)>1) continue;
        const l=-(nx*0.7+ny*0.6); psP(S,x,y,y>base?Wd[0]:Wd[clamp(Math.floor(2.2+l*1.5+bayV(x,y)*0.4),1,4)]); }
      pR(S,Math.round(cx)-1,base-ht-3,2,3,cI('#d8a840')); psP(S,Math.round(cx)-1,base-ht-4,cI('#ffe070')); }
    for(let x=x0+6;x<x0+w-6;x+=9){ psP(S,x,y0+h,R[0]); psP(S,x+1,y0+h,R[1]); psP(S,x,y0+h+1,R[0]); psP(S,x+1,y0+h+1,R[0]); } }   // the vigas poking out under the parapet
};
/* a window: frame, glass (a glint by day), mullions, sill, shutters & a flower box — returns the glass rect */
function tWindow(S,x,y,ww,wh,F,glass,shut,box,sn,arch){ pR(S,x-1,y-1,ww+2,wh+2,F[1]); pR(S,x-1,y-1,ww+2,1,F[3]);
  const G=glass; for(let j=0;j<wh;j++) for(let i=0;i<ww;i++){ if(arch && j===0 && (i===0||i===ww-1)) { psP(S,x+i,y+j,F[1]); continue; } psP(S,x+i,y+j, (i+j===1||i+j===2)&&j<3?G[2]:(j<wh/2?G[1]:G[0])); }
  const mx=x+(ww>>1), my=y+(wh>>1); for(let j=0;j<wh;j++) psP(S,mx,y+j,F[2]); if(wh>5) for(let i=0;i<ww;i++) psP(S,x+i,my,F[2]);
  pR(S,x-2,y+wh+1,ww+4,1,F[4]); pR(S,x-2,y+wh+2,ww+4,1,F[0]);
  if(shut){ for(const sx of [x-4,x+ww+1]){ for(let j=-1;j<wh+1;j++){ psP(S,sx,y+j,shut[j%2?2:3]); psP(S,sx+1,y+j,shut[j%2?1:2]); } } }
  if(box){ pR(S,x-1,y+wh+3,ww+2,2,cI('#6e4428')); pR(S,x-1,y+wh+3,ww+2,1,cI('#8a5a34')); for(let i=0;i<ww+2;i++){ if(tH(x+i,y)<0.7) psP(S,x-1+i,y+wh+2,box[(i+x)%box.length]); } }
  if(sn) pR(S,x-2,y+wh+1,ww+4,1,cI('#f2f6fa'));
  return [x,y,ww,wh]; }
/* a door: frame, planks, handle (and a round top for a cottage, an arch for the museum) */
function tDoor(S,x,y,dw,dh,W2,F,top){ pR(S,x-1,y-1,dw+2,dh+1,F[0]);
  for(let j=0;j<dh;j++) for(let i=0;i<dw;i++){ if(top && j<2 && ((j===0&&(i<2||i>dw-3))||(j===1&&(i<1||i>dw-2)))){ psP(S,x+i,y+j,F[0]); continue; } const pl=i%3; let v=pl===2?1:pl===0?3:2; if(j===0) v=Math.min(4,v+1); psP(S,x+i,y+j,W2[v]); }
  psP(S,x+dw-3,y+(dh>>1),cI('#ffd86b')); psP(S,x+dw-3,y+(dh>>1)+1,cI('#a87a28')); }
/* the sign that swings over a trade's door (3 frames of swing) */
function signSpr(icon,f){ return tSpr('tsign'+icon+f, ()=>{ const S=PS(17,15), B=tRamp('#8a5c2e'), [iw,ih]=pxiDim(icon);
  const T=PS(15,12); pR(T,0,0,15,12,B[3]); pR(T,0,0,15,1,B[4]); pR(T,0,11,15,1,B[1]); pR(T,14,0,1,12,B[1]); pR(T,0,0,1,12,B[4]); pxiInto(T,icon,Math.floor((15-iw)/2),Math.floor((12-ih)/2));
  for(let y=0;y<12;y++){ const sh=Math.round(f*(y+1)/7); for(let x=0;x<15;x++){ const c=T.d[y*15+x]; if(c) psP(S,1+x+sh,2+y,c); } }
  const Ch=cI('#3a3430'); psP(S,4,0,Ch); psP(S,4,1,Ch); psP(S,12,0,Ch); psP(S,12,1,Ch);
  return psCv(psOut(S,cI('#1a120c'),false),8,0); }); }
function bldPaint(V,b,i){
  const ST=V.ST, k=b.kind, FW=b.w*20, FH=b.h*20, OX=10, OY=30, S=PS(FW+20,FH+OY+8), sd=(PRT.core.idx*31+i*7)&1023;
  const rng=mulberry32((((PRT.core.idx*977+i*131+17)>>>0)^0xB1D6)>>>0);
  PRT._Vbk=V.bk;
  let mat=k==='museum'?'stone':tPick(rng(),ST.walls), roof=k==='museum'?'pediment':tPick(rng(),ST.roofs);
  if(k==='wright' && (mat==='plaster'||mat==='timber')) mat=rng()<0.6?'tarred':'boards';                   // a working yard: tarred boards
  if(k==='home' && ST.roofs.some(r=>r[0]==='thatch') && V.bk!=='swamp') roof='thatch';
  if(k==='forge'){ mat=(V.bk==='volcanic'||V.bk==='scorch')?'basalt':'field'; roof='slate'; }            // (C7b §7.1) the forge: fieldstone walls under slate, whatever the harbour builds in
  const pl=ST.pl[Math.floor(rng()*ST.pl.length)], boardC=['#8a5a3a','#5a6a7a','#6a7a5a','#9a7a5a','#a8987a','#7a6a8a'][Math.floor(rng()*6)];
  const WR = mat==='plaster'||mat==='timber'||mat==='adobe' ? tRamp(pl) : mat==='boards' ? tRamp(boardC) : mat==='stone' ? tRamp(k==='museum'&&V.bk!=='volcanic'&&V.bk!=='scorch'?mixHex(ST.stone,'#e8e2d4',0.35):ST.stone)
    : mat==='field' ? tRamp(mixHex(ST.stone,'#5a5650',0.25)) : mat==='tarred' ? tRamp('#4a3c2c') : mat==='log' ? tRamp(V.bk==='frost'?'#6a4a30':'#7a5234') : mat==='basalt' ? tRamp(V.bk==='volcanic'?'#34302e':'#3e3a40')
    : mat==='bamboo' ? tRamp('#b8a860') : mat==='plank' ? tRamp(ST.wood) : tRamp('#e8dcc4');
  let rc; if(roof==='gable') rc=ST.gable[Math.floor(rng()*ST.gable.length)]; else if(roof==='tileR') rc=ST.tileR; else if(roof==='slate') rc=ST.slate; else if(roof==='thatch') rc=THATCH[ST.thatch]||THATCH.gold;
    else if(roof==='palm') rc=THATCH.palm; else if(roof==='pagoda') rc=['#2e7a6a','#8a2a2a','#2a4a7a'][Math.floor(rng()*3)]; else if(roof==='cap') rc=['#c43e30','#7a4a82','#427076'][Math.floor(rng()*3)]; else if(roof==='flat'||roof==='dome') rc=mixHex(pl,'#8a6a4a',0.18); else rc=ST.stone;
  const RR=tRamp(rc), BEAM=tRamp(V.bk==='bamboo'?'#3a2a1c':'#5a3c22'), F=tRamp(k==='museum'?'#8a8070':V.bk==='dunes'?'#7a5a3a':'#6a4a2c'), DOOR=tRamp(k==='home'?'#7a4a26':k==='museum'?'#5a3a1a':['#5a3a1e','#4a5a6a','#6a3a2a','#3e5a3e'][Math.floor(rng()*4)]);
  const faceH=Math.round(FH*(k==='museum'?0.5:0.46)), wy0=OY+FH-faceH, wy1=OY+FH, stilts=!!ST.stilts;
  const out={cv:null, ox:OX, oy:OY, faceH, win:[], door:null, chim:null, lamp:[], sign:null, glowC:0};
  // the wall
  const wallH=stilts?faceH-6:faceH;
  (T_WALL[mat]||T_WALL.plaster)(S,OX,wy0,FW,wallH,WR,sd,{beam:BEAM});
  if(stilts){ const PW=V.wd; for(let x=OX+2;x<OX+FW-2;x+=11){ pR(S,x,wy1-6,2,6,PW[2]); psP(S,x,wy1-6,PW[4]); psLine(S,x+2,wy1-6,Math.min(OX+FW-3,x+10),wy1-2,PW[1],1); } pR(S,OX,wy1-7,FW,1,PW[1]); }   // raised on piles over the mire
  else if(mat!=='stone'&&mat!=='field'&&mat!=='basalt'&&k!=='museum'){ const Q=V.qs; pR(S,OX,wy1-3,FW,3,Q[2]); pR(S,OX,wy1-3,FW,1,Q[3]); for(let x=OX+3;x<OX+FW;x+=6) psP(S,x,wy1-2,Q[1]); }   // a stone footing
  pR(S,OX,wy0,FW,2,WR[1]);                                                                                     // the eave's shadow on the wall
  // the door
  const dcx=OX+(b.door.tx-b.x0)*20+10, dw=k==='wright'?20:k==='forge'?16:k==='tavern'?12:k==='museum'?13:10, dh=Math.min(faceH-(stilts?4:6), k==='wright'?24:k==='forge'?22:k==='museum'?27:k==='tavern'?20:18), dx=dcx-(dw>>1), dy=wy1-dh-(stilts?0:1);
  if(k==='wright'){ pR(S,dx-1,dy-1,dw+2,dh+1,BEAM[0]); for(let j=0;j<dh;j++) for(let x=0;x<dw;x++){ const half=x<dw/2, lx=half?x:dw-1-x, pl=lx%4; psP(S,dx+x,dy+j,DOOR[pl===3?1:pl===0?3:2]); }   // the big barn doors, X-braced
    for(const h0 of [0,1]){ const x0=dx+h0*(dw>>1), x1=x0+(dw>>1)-1; psLine(S,x0+1,dy+2,x1-1,dy+dh-3,BEAM[2],1); psLine(S,x1-1,dy+2,x0+1,dy+dh-3,BEAM[2],1); pR(S,x0,dy+1,(dw>>1),1,BEAM[1]); pR(S,x0,dy+dh-2,(dw>>1),1,BEAM[1]); } pR(S,dcx,dy,1,dh,BEAM[0]); }
  else if(k==='forge') forgeMouth(S,dx,dy,dw,dh,WR,out);                                                   // (C7b) the smithy's open mouth: the hearth glowing at its back
  else tDoor(S,dx,dy,dw,dh,DOOR,F,k==='home'||k==='museum'||roof==='cap');
  if(!stilts){ const Q=V.qs; pR(S,dx-2,wy1-1,dw+4,1,Q[4]); pR(S,dx-2,wy1,dw+4,1,Q[1]); } else { const PW=V.wd; for(let j=0;j<3;j++) pR(S,dx+1,wy1-5+j*2,dw-2,1,PW[3]); }   // a doorstep · (on piles: a few rungs down)
  out.door=[dx,dy,dw,dh];
  // the windows
  const big=faceH>=34, ww=big?7:6, wh=big?8:6, wyy=wy0+Math.round(faceH*(k==='museum'?0.3:0.26)), shut=(mat==='plaster'||mat==='adobe'||mat==='timber'||mat==='log')&&rng()<0.6?tRamp(['#3a6a5a','#5a4a8a','#8a3a3a','#3a5a8a','#6a7a3a'][Math.floor(rng()*5)]):null;
  const GL=cIR(['#1c2a40','#2c4262','#9cc4e8']), box=(k==='home'||b.flowerBox||(k==='house'&&V.ST.fl>1.5&&rng()<0.6))?cIR(['#f08aa6','#ffd86b','#fff4f4','#c898f0','#ff7a6a']).concat(V.fl):null;
  if(k!=='museum' && !(k==='market')){ const slots=[]; for(let x=OX+9;x<OX+FW-8;x+=(big?21:19)) slots.push(x); for(const sx of slots){ if(Math.abs(sx+ww/2-dcx)<dw/2+9) continue; if(k==='wright'&&sx>dcx) continue; if(k==='forge'&&sx<dcx+24) continue;   // (the forge: its chimney stack & sign on the left, the tool rack right of the mouth — one window, far right)
      out.win.push(tWindow(S,sx,wyy,ww,wh,F,GL,shut,box,ST.snow,roof==='cap'||roof==='dome')); } }
  if(k==='market'){ for(const sx of [OX+6,OX+FW-6-ww]) if(Math.abs(sx+ww/2-dcx)>dw/2+6) out.win.push(tWindow(S,sx,wy0+4,ww,6,F,GL,null,null,ST.snow)); }
  // the roof
  const rx0=OX-3, rw=FW+6, rh=FH-faceH+2;
  if(roof==='pediment') paintPediment(S,OX,OY,FW,FH,faceH,WR,sd,V);
  else if(roof==='flat'||roof==='dome'){ T_ROOF.flat(S,rx0+2,OY,rw-4,rh,RR,sd,{dome:roof==='dome'}); }
  else if(roof==='cap') T_ROOF.cap(S,rx0,OY,rw,rh,RR,sd);
  else if(roof==='palm') T_ROOF.thatch(S,rx0,OY,rw,rh,RR,sd,{palm:1});
  else if(roof==='thatch') T_ROOF.thatch(S,rx0,OY,rw,rh,RR,sd,{moss:ST.thatch==='reed'});
  else (T_ROOF[roof]||T_ROOF.gable)(S,rx0,OY,rw,rh,RR,sd,{trim:BEAM});
  if(ST.snow && roof!=='pediment') tSnowRoof(S,rx0,OY-10,rw,rh+10,OY+rh,sd);
  // a chimney (homes, taverns & most houses)
  if((k==='house'&&rng()<0.75)||k==='tavern'||k==='home'||k==='wright'){ if(roof!=='cap'&&roof!=='flat'&&roof!=='dome'){ const cx=OX+Math.round(FW*(k==='tavern'?0.8:0.7)), ct=OY-7, cb=OY+Math.round(rh*0.5), SR=V.bk==='volcanic'||V.bk==='scorch'?tRamp('#4a4040'):tRamp(V.bk==='dunes'?'#c89a68':'#8a6a5a');
    T_WALL.stone(S,cx,ct+2,6,cb-ct-2,SR,sd,{bw:3,bh:2}); pR(S,cx-1,ct,8,2,SR[4]); pR(S,cx-1,ct+1,8,1,SR[2]); pR(S,cx+1,ct,4,1,SR[0]); if(ST.snow) pR(S,cx-1,ct-1,8,1,cI('#f4f8fb'));
    out.chim=[cx+3,ct]; } }
  // the trade's dressing
  if(k==='market') dressMarket(S,OX,FW,wy0,wy1,dcx,dw,b,V,out);
  else if(k==='wright') dressWright(S,OX,FW,wy0,wy1,dcx,dw,V,out);
  else if(k==='tavern') dressTavern(S,OX,FW,wy0,wy1,dcx,dw,dy,V,out);
  else if(k==='museum') dressMuseum(S,OX,FW,wy0,wy1,dcx,dw,V,out,sd);
  else if(k==='home') dressHome(S,OX,FW,wy0,wy1,dcx,dw,dy,V,out);
  else if(k==='forge') dressForge(S,OX,OY,FW,wy0,wy1,dcx,dw,dy,V,out,sd);
  else if(b.awning && rng()<0.7){ const A=PORT_PAL.awnings[(b.awnCol||0)%PORT_PAL.awnings.length], c1=tRamp(A[0]), c2=tRamp(A[1]); for(let x=dx-3;x<dx+dw+3;x++) for(let j=0;j<4;j++){ const st=Math.floor((x-dx+3)/3)&1; psP(S,x,dy-5+j,(st?c1:c2)[j===0?4:j===3?1:3]); } }   // a little canopy over the door
  if(k!=='museum' && k!=='wright' && k!=='forge' && !ST.stilts && rng()<0.5){ const L=V.ST.lamp==='paper'?1:0; out.lamp.push([dx+dw+3,dy+3,L]); pR(S,dx+dw+2,dy+2,3,1,cI('#2a2420')); pR(S,dx+dw+2,dy+3,3,4,cI('#3a3430')); pR(S,dx+dw+3,dy+4,1,2,cI('#d8c890')); }   // a wall lantern by the door
  out.cv=psCv(psOut(S,cI('#1a120c'),false),0,0).cv;
  return out; }
function tSnowRoof(S,x0,y0,w,h,eave,sd){ const SW=cIR(['#9fb4c6','#c4d4e2','#e2ecf4','#ffffff']), IC=cIR(['#a8d0f0','#dcf0ff']);   // snow lies on the roof (thinner toward the eave) & icicles hang from it
  for(let x=x0;x<x0+w;x++){ const lim=y0+Math.round(h*0.6+(vnoise(x*0.25,sd)-0.5)*7); for(let y=y0;y<lim;y++){ if(!psG(S,x,y)) continue; const e=lim-y; psP(S,x,y,SW[e<=1?1:clamp(Math.floor(2.3+roofLit(x,x0,w)+bayV(x,y)*0.5),1,3)]); } }
  for(let x=x0+2;x<x0+w-2;x++){ if(tH(x*7,sd)<0.28 && psG(S,x,eave-1)){ const L=1+Math.floor(tH(x,sd*3)*3); for(let j=0;j<L;j++) psP(S,x,eave+j,IC[j===0?1:0]); } } }
function paintPediment(S,OX,OY,FW,FH,faceH,WR,sd,V){ const top=OY+FH-faceH;   // the museum: a stone deck, a cornice, a pediment with a roundel over the columns
  for(let y=OY;y<top;y++) for(let x=OX-2;x<OX+FW+2;x++){ const yy=y-OY, row=Math.floor(yy/6), off=(row&1)*8, sx=(x-OX+off+64)%16; let v=3.1+(tH(Math.floor((x-OX+off+64)/16)*3,row)-0.5)*0.6+roofLit(x,OX,FW)*0.8;   // dressed stone slabs, laid in courses
    if(yy%6===5||sx===15) v=2; else if(yy%6===0) v+=0.6; psP(S,x,y,WR[clamp(Math.floor(v),1,5)]); }
  for(let x=OX-3;x<OX+FW+3;x++){ psP(S,x,top-5,WR[5]); psP(S,x,top-4,WR[4]); psP(S,x,top-3,WR[3]); psP(S,x,top-2,(x%3)?WR[1]:WR[3]); psP(S,x,top-1,WR[1]); }   // the cornice & its dentils
  const cx=OX+FW/2, ph=Math.min(38,Math.round((top-5-OY)*0.9+6)), base=top-5, apex=base-ph;
  psPoly(S,[[OX-3,base],[cx,apex],[OX+FW+3,base]],(x,y)=>{ const t=(base-y)/ph, e=Math.abs(x+0.5-cx)/((FW/2+3)*(1-t)+0.01); if(e>0.86||y>=base-2) return WR[e>0.86&&x<cx?5:2]; return WR[3]; });
  const ry=Math.round(base-ph*0.42); for(let y=-4;y<=4;y++) for(let x=-4;x<=4;x++){ const d=x*x+y*y; if(d>18) continue; psP(S,Math.round(cx)+x,ry+y, d>10?cI('#a87a28'):cI(d<3?'#fff3b0':'#ffd23f')); }   // the gilt roundel
  pxiInto(S,'star',Math.round(cx)-4,ry-4); }
function dressMarket(S,OX,FW,wy0,wy1,dcx,dw,b,V,out){ const A=PORT_PAL.awnings[(b.awnCol||0)%PORT_PAL.awnings.length], c1=tRamp(A[0]), c2=tRamp(A[1]), ay=wy0+11, ax0=OX+3, ax1=OX+FW-3;
  for(let x=ax0;x<ax1;x++){ const st=Math.floor((x-ax0)/5)&1, C=st?c1:c2; for(let j=0;j<7;j++) psP(S,x,ay+j,C[j===0?5:j<3?4:j<6?3:2]); const sc=(x-ax0)%5; if(sc>0&&sc<4) psP(S,x,ay+7,C[sc===2?2:3]); if(sc===2) psP(S,x,ay+8,C[1]); }   // the striped awning, scalloped
  for(let x=ax0;x<ax1;x++) psP(S,x,ay+9,cI('#2a1c14'));
  const cy=wy1-10, W2=V.wd; for(let x=OX+3;x<OX+FW-3;x++){ if(Math.abs(x-dcx)<dw/2+2) continue; pR(S,x,cy,1,2,W2[4]); pR(S,x,cy+2,1,6,W2[x%4===0?1:2]); }   // the counter, goods laid out on it
  const goods=[['#b8c8d8','#6a7a8a','#2a3440'],['#d83a3a','#8a1a1a','#ffb0a0'],['#e8c040','#a87a18','#fff0a0'],['#6ab83e','#3a7a22','#b8f07a'],['#e8783a','#a84a1a','#ffc08a']];
  let gi=0; for(let x=OX+4;x<OX+FW-6;x+=5){ if(Math.abs(x+2-dcx)<dw/2+3) continue; const G=goods[gi++%goods.length].map(cI);
    if(G===null) continue; if(gi%5===1){ pR(S,x,cy-2,4,2,G[0]); psP(S,x+3,cy-2,G[1]); psP(S,x,cy-2,G[2]); psP(S,x+1,cy-3,G[0]); }   // a fish on ice
    else { psP(S,x,cy-1,G[0]); psP(S,x+1,cy-1,G[1]); psP(S,x+2,cy-1,G[0]); psP(S,x+1,cy-2,G[0]); psP(S,x,cy-2,G[2]); psP(S,x+3,cy-1,G[1]); psP(S,x+2,cy-2,G[1]); } }   // a heap of fruit
  out.sign={x:dcx+dw/2+9, y:wy0+2, icon:'fish'}; pR(S,dcx+dw/2+4,wy0+2,7,1,cI('#2a2420')); }
function dressWright(S,OX,FW,wy0,wy1,dcx,dw,V,out){ const W2=V.wd;
  for(let k=0;k<4;k++){ const x=OX+4+k*3; psLine(S,x,wy1-2,x+6,wy0+5,W2[k%2?2:3],2); }                                          // timber leaning on the wall
  const hx=dcx+dw/2+5, hw=Math.min(22,OX+FW-hx-2); if(hw>10){ for(let x=hx;x<hx+hw;x++){ const t=(x-hx)/(hw-1), yk=wy1-5+Math.round(Math.sin(t*Math.PI)*2); psP(S,x,yk,W2[1]); psP(S,x,yk+1,W2[0]); }   // a hull on the slip: keel & ribs
    for(let x=hx+2;x<hx+hw-1;x+=3){ const t=(x-hx)/(hw-1), top=wy1-8-Math.round(Math.sin(t*Math.PI)*7); for(let y=top;y<wy1-4;y++) psP(S,x,y,W2[y===top?4:2]); }
    pR(S,hx-1,wy1-3,2,3,W2[1]); pR(S,hx+hw-1,wy1-3,2,3,W2[1]); }
  const by=wy0-4, bx=dcx; pR(S,bx-1,by,3,6,cI('#3a2a1c')); pR(S,bx-6,by,12,2,cI('#4a3424')); psP(S,bx+5,by+2,cI('#8a8070')); for(let j=3;j<9;j++) psP(S,bx+5,by+j,cI('#c8b48a'));   // the hoist beam over the doors
  out.sign={x:dcx-dw/2-8, y:wy0+2, icon:'anchor'}; pR(S,dcx-dw/2-12,wy0+2,7,1,cI('#2a2420')); }
function dressTavern(S,OX,FW,wy0,wy1,dcx,dw,dy,V,out){ const B=tRamp('#8a5c34'), H=cI('#3a2a1c');
  const barrel=(x,y)=>{ for(let j=0;j<8;j++) for(let i=0;i<6;i++){ const edge=(j===0||j===7)&&(i===0||i===5); if(edge) continue; let v=i===0?4:i===5?1:i===1?4:3; if(j===2||j===5) { psP(S,x+i,y+j,H); continue; } psP(S,x+i,y+j,B[v]); } pR(S,x+1,y,4,1,B[5]); };
  const bx=dcx-dw/2-15; barrel(bx,wy1-8); barrel(bx+6,wy1-8); barrel(bx+3,wy1-16);
  out.lamp.push([dcx+dw/2+4,dy+4,0]); pR(S,dcx+dw/2+3,dy+2,3,1,cI('#2a2420')); pR(S,dcx+dw/2+3,dy+3,3,4,cI('#3a3430')); pR(S,dcx+dw/2+4,dy+4,1,2,cI('#d8c890'));
  out.sign={x:dcx+dw/2+12, y:wy0+2, icon:'mug'}; pR(S,dcx+dw/2+7,wy0+2,7,1,cI('#2a2420')); out.glowC=1; }
function dressMuseum(S,OX,FW,wy0,wy1,dcx,dw,V,out,sd){ const Rs=tRamp(mixHex(V.ST.stone,'#e8e2d4',0.45)), n=Math.max(4,Math.round(FW/18));
  for(let y=wy0+2;y<wy1-5;y++) for(let x=OX+2;x<OX+FW-2;x++){ if(!psG(S,x,y)) continue; psP(S,x,y,mixW(psG(S,x,y),cI('#2a2430'),0.35)); }   // the portico's shade behind the columns
  for(let k=0;k<n;k++){ const cx=Math.round(OX+FW*(k+0.5)/n); if(Math.abs(cx-dcx)<dw/2+4) continue;
    pR(S,cx-3,wy0+2,7,2,Rs[5]); pR(S,cx-3,wy0+3,7,1,Rs[3]);                                                                   // capital
    for(let y=wy0+4;y<wy1-6;y++){ psP(S,cx-2,y,Rs[5]); psP(S,cx-1,y,Rs[4]); psP(S,cx,y,Rs[4]); psP(S,cx+1,y,Rs[2]); psP(S,cx+2,y,Rs[1]); }   // the fluted shaft, lit on its left
    pR(S,cx-3,wy1-6,7,1,Rs[4]); pR(S,cx-3,wy1-5,7,1,Rs[2]); }
  const bn=tRamp(PORT_PAL.banner[sd%PORT_PAL.banner.length]);
  for(const sg of [-1,1]){ const bx=Math.round(dcx+sg*(dw/2+Math.max(7,FW/n*0.5)))-2; if(bx<OX+2||bx>OX+FW-7) continue;   // banners either side of the door
    pR(S,bx-1,wy0+5,7,1,cI('#5a4a30')); for(let y=wy0+6;y<wy0+22;y++) for(let x=bx;x<bx+5;x++) psP(S,x,y,bn[x===bx?4:x===bx+4?1:3]); psP(S,bx+1,wy0+22,bn[2]); psP(S,bx+2,wy0+23,bn[2]); psP(S,bx+3,wy0+22,bn[2]);
    psP(S,bx+2,wy0+11,cI('#ffd86b')); psP(S,bx+1,wy0+12,cI('#ffd86b')); psP(S,bx+3,wy0+12,cI('#ffd86b')); psP(S,bx+2,wy0+13,cI('#ffd86b')); }
  for(let st=0;st<3;st++){ const y=wy1-4+st+ (st>0?0:0), inset=4-st*2; pR(S,OX+inset-2,y,FW-inset*2+4,1,Rs[st===0?5:st===1?4:2]); }   // three steps up
  pR(S,OX-2,wy1-1,FW+4,1,Rs[1]); }
function dressHome(S,OX,FW,wy0,wy1,dcx,dw,dy,V,out){ const Fc=cIR(['#8a8070','#d8d0c0','#f4f0e6']), FL=cIR(['#f08aa6','#ffd86b','#c898f0','#ff7a6a']), LV=cIR(['#2e5a24','#3e7a30','#5a9a40']);
  for(let x=OX+1;x<OX+FW-1;x++){ if(Math.abs(x-dcx)<dw/2+3) continue; const post=(x-OX)%4===1; for(let j=0;j<6;j++){ if(post||j===2||j===4) psP(S,x,wy1-6+j,Fc[post?(j===0?2:1):1]); } if(post) psP(S,x,wy1-7,Fc[2]); }   // a picket fence
  for(let x=OX+1;x<OX+FW-1;x++){ if(Math.abs(x-dcx)<dw/2+3) continue; if(tH(x,5)<0.6) psP(S,x,wy1-8,FL[x%4]); if(tH(x,9)<0.5) psP(S,x,wy1-9,LV[x%3]); }
  for(let y=wy0+3;y<wy1-8;y++) for(let x=OX;x<OX+5;x++){ if(tH(x*3,y*5)<0.55-(x-OX)*0.09) psP(S,x,y,LV[(x+y)%3]); if(tH(x*7,y)<0.05) psP(S,x,y,FL[0]); }   // ivy & roses up the corner
  const wx=dcx, wy=dy+4; for(let a=0;a<12;a++){ const t=a/12*TAU; psP(S,Math.round(wx+Math.cos(t)*2.5),Math.round(wy+Math.sin(t)*2.5),LV[a%2?1:2]); } psP(S,wx,wy+3,cI('#d83a4a')); psP(S,wx-1,wy+3,cI('#a82a3a')); }   // a wreath on the door
/* (C7b §7.1) THE FORGE: an open smithy mouth under a heavy stone lintel, the hearth glowing at its back (out.furnR — lit after dark, flickering by
   day; out.furn — its light, townLights colour 1) · a tall fieldstone chimney stack up the left wall, embers at its lip (out.chim) · tongs &
   hammers hung by the mouth · a heap of iron bars & coal at its foot · the hammer sign. The anvil & the quench barrel stand out front as props. */
function forgeMouth(S,dx,dy,dw,dh,WR,out){ const D=cIR(['#0c0604','#160c06','#22140a','#2e1c10']), E=cIR(['#8a2a0a','#d8501a','#ff8a2a','#ffc050','#fff0a0']);
  pR(S,dx-2,dy-3,dw+4,3,WR[1]); pR(S,dx-2,dy-3,dw+4,1,WR[4]); for(let x=dx;x<dx+dw;x+=4) psP(S,x,dy-2,WR[0]);   // the lintel: one long dressed stone
  pR(S,dx-2,dy,2,dh,WR[2]); pR(S,dx+dw,dy,2,dh,WR[1]); psP(S,dx-2,dy,WR[4]);                                   // its jambs
  for(let j=0;j<dh;j++) for(let i=0;i<dw;i++){ const d=Math.min(3,Math.floor(j/Math.max(1,dh/4))); psP(S,dx+i,dy+j,D[Math.max(0,3-d)]); }   // the dark within (the smoky top darkest)
  const hx=dx+3, hw=dw-6, hy=dy+dh-7; pR(S,hx-1,hy-6,hw+2,5,D[0]); pR(S,hx,hy-7,hw,1,D[2]); for(let i=1;i<hw;i+=3) psP(S,hx+i,hy-3,D[3]);   // the hood over the hearth
  pR(S,hx-1,hy,hw+2,6,cI('#3a3230')); pR(S,hx-1,hy,hw+2,1,cI('#5a504a'));                                       // the hearth's stone bed
  for(let i=0;i<hw;i++){ const t=tH(i*7,hy), top=hy+1+(t<0.35?0:1); for(let y=top;y<hy+4;y++) psP(S,hx+i,y,E[y===top?(t<0.5?4:3):y<hy+3?2:1]); }   // the coals: white-hot tips, orange, a red ember bed
  out.furnR=[hx,hy+1,hw,3]; out.furn=[dx+(dw>>1),hy+2]; }
function dressForge(S,OX,OY,FW,wy0,wy1,dcx,dw,dy,V,out,sd){ const SR=V.bk==='volcanic'||V.bk==='scorch'?tRamp('#4a4040'):tRamp(mixHex(V.ST.stone,'#6a6258',0.35)), IR=cIR(['#16181e','#2c3038','#4a505a','#7a8290']), W2=V.wd;
  const cx=OX+7, cw=11, ct=OY-18, cb=wy1-1;                                                                        // the chimney stack, up the left wall and through the slates
  T_WALL.stone(S,cx,ct+3,cw,cb-ct-3,SR,sd,{bw:4,bh:3}); pR(S,cx+cw-1,ct+3,1,cb-ct-3,SR[1]);
  pR(S,cx-1,ct,cw+2,3,SR[4]); pR(S,cx-1,ct+2,cw+2,1,SR[2]); pR(S,cx+1,ct,cw-2,1,cI('#1a0c06'));                   // its cap & the black throat
  for(const q of [[cx+2,ct],[cx+5,ct],[cx+8,ct]]) psP(S,q[0],q[1],cI(tH(q[0],sd)<0.5?'#ff8a2a':'#ffc050'));        // embers at the lip
  if(V.ST.snow) pR(S,cx-1,ct-1,cw+2,1,cI('#f2f6fa'));
  out.chim=[cx+(cw>>1),ct]; out.forge=1;
  const tx=dcx+(dw>>1)+5; pR(S,tx-1,wy0+8,12,1,W2[1]);                                                               // a rack of tongs & hammers by the mouth
  for(let k=0;k<3;k++){ const x=tx+k*4; pR(S,x,wy0+9,1,7+k,IR[2]); psP(S,x,wy0+9,IR[3]); if(k===1){ pR(S,x-1,wy0+15+k,3,2,IR[1]); } else { psP(S,x-1,wy0+15+k,IR[1]); psP(S,x+1,wy0+15+k,IR[1]); } }
  const hx=OX+FW-16; for(let r=0;r<3;r++) for(let c=0;c<4-r;c++){ const x=hx+c*3+r, y=wy1-3-r*2; pR(S,x,y,3,2,IR[2]); psP(S,x,y,IR[3]); }   // a stack of iron bars…
  for(let i=0;i<9;i++){ const x=hx-9+i, h=2+Math.round(Math.sin(i/8*Math.PI)*3); pR(S,x,wy1-h,1,h,cI(i%3?'#1c1a1e':'#2e2c32')); }   // …and a heap of coal
  out.sign={x:dcx-(dw>>1)-10, y:wy0+2, icon:'hammer'}; pR(S,dcx-(dw>>1)-14,wy0+2,7,1,cI('#2a2420')); }
/* ---- FOLK: every person ashore — townsfolk, crew, patrons, the barkeep, the card-sharp & you — one 3/4 pixel painter.
   folkLook(seed, over) → a look (skin · hair & its style · hat · top & its cut · trousers · boots · apron · beard · scarf ·
   strap · carry); drawFolk(x,y,look,dir,fr) draws it standing at a world spot (dir 0 down · 1 up · 2 left · 3 right ·
   fr 0-3: stand, step, stand, step). Baked per look × dir × frame (FOLK, ~16×26 texels with the dark line). ---- */
const FOLK={m:new Map(), n:0};
const FOLK_P={ skin:['#f0d0b0','#e8c39a','#d8a878','#c08c5a','#a87248','#7a5034'], hair:['#2a1c14','#4a3020','#6e4a28','#9a7a3c','#c0c0c8','#8a3c2a','#e0c080','#1a1a1a'],
  top:['#7a5a3a','#5a6a8a','#7a4a5a','#4a6a52','#8a7a4a','#a84a3a','#3a5a7a','#6a4a7a','#c8a060','#5a7a8a','#b86a4a','#e8dcc0'], bot:['#4a3a2a','#3a3a4a','#5a4a3a','#2e3a4a','#6a5a40','#4a4a3a'],
  hat:['#54483c','#6a4a2a','#8a3a2a','#3a4a6a','#c8b078','#4a6a4a'], sc:['#c83a3a','#3a6ac8','#e8b83a','#4a9a5a','#9a4ab8'] };
let FOLK_B=null;                                                                                            // (the harbour's biome leans its folk's dress: set per visit)
function folkLook(seed,over){ const r=mulberry32(((seed>>>0)^0x5EED1F)>>>0), P=FOLK_P, pk=a=>a[Math.floor(r()*a.length)], bb=FOLK_B||'';
  const L={skin:pk(P.skin), hair:pk(P.hair), hs:pk(['short','short','long','bun','bald','pony','curly','crop']), hat:null, hatC:pk(P.hat), band:null, top:pk(P.top), cut:pk(['shirt','shirt','vest','coat','dress','tunic']),
    bot:pk(P.bot), boots:pk(['#2c1e10','#3a2a1a','#4a3424','#1e1a18']), apron:null, beard:false, scarf:null, strap:null, carry:null};
  L.hat = r()<0.5 ? pk(['knit','flat','straw','kerchief','bandana','trek']) : null;
  if(L.cut==='dress' && L.hs==='bald') L.hs='long';
  if(L.cut!=='dress' && r()<0.3) L.beard=true;
  if(r()<0.18) L.scarf=pk(P.sc);
  if(r()<0.2) L.apron='#e8e0cc';
  if(r()<0.16) L.carry='basket';
  if(bb==='frost'){ if(r()<0.7) L.cut='coat'; if(r()<0.7) L.hat='knit'; L.scarf=L.scarf||pk(P.sc); }
  else if(bb==='dunes'||bb==='savanna'){ if(r()<0.6) L.hat=pk(['kerchief','straw']); if(r()<0.5) L.top=pk(['#e8dcc0','#d8c090','#c8a060','#e0b890']); }
  else if(bb==='tropic'||bb==='atoll'){ if(r()<0.5) L.hat='straw'; if(r()<0.5) L.top=pk(['#e86a5a','#5ab8c8','#f0d060','#8ad06a','#f0f0e8']); if(L.cut==='coat') L.cut='shirt'; }
  else if(bb==='swamp'){ if(r()<0.5) L.top=pk(['#5a6a3a','#6a5a3a','#4a5a4a']); if(r()<0.4) L.hat='straw'; }
  else if(bb==='volcanic'||bb==='scorch'){ if(r()<0.5) L.top=pk(['#3a3434','#5a3a2a','#4a4a52']); if(r()<0.4) L.apron='#6a5a4a'; }
  else if(bb==='mushroom'){ if(r()<0.5) L.top=pk(['#7a5a9a','#5a4a7a','#9a6ab0','#4a6a7a']); }
  else if(bb==='bamboo'){ if(r()<0.5) L.cut='tunic'; if(r()<0.5) L.hat='straw'; }
  if(over) Object.assign(L,over);
  L.id=++FOLK.n; return L; }
function folkDir(fx,fy){ return Math.abs(fx)>Math.abs(fy)*1.05 ? (fx<0?2:3) : (fy<0?1:0); }
function folkSpr(L,dir,fr){ const key=L.id*16+dir*4+(fr&3); let o=FOLK.m.get(key); if(o) return o;
  o=paintFolk(L,dir,fr&3); FOLK.m.set(key,o); if(FOLK.m.size>1600){ let n=0; for(const k of FOLK.m.keys()){ FOLK.m.delete(k); if(++n>=300) break; } } return o; }
function drawFolk(x,y,L,dir,fr,a){ const X=TX(x), Y=TY(y), sh=tSpr('fsh', ()=>{ const S=PS(11,4), c=cIA('#0a0614',0.32); psDisc(S,5.5,2,5.5,2,()=>c); return psCv(S,5,2); });
  pctx.drawImage(sh.cv,X-sh.ax,Y-sh.ay); const o=folkSpr(L,dir,fr); if(a!=null&&a<1) pctx.globalAlpha=a; pctx.drawImage(o.cv,X-o.ax,Y-o.ay); if(a!=null&&a<1) pctx.globalAlpha=1; return o; }
function paintFolk(L,dir,fr){
  const side=dir>=2, back=dir===1, S=PS(18,28), O=1;
  const P=(x,y,c)=>psP(S,x+O,y+O,c), Rr=(x,y,w,h,c)=>{ for(let j=0;j<h;j++) for(let i=0;i<w;i++) P(x+i,y+j,c); };
  const SK=cIR([mixHex(L.skin,'#5a2a2a',0.35),L.skin,mixHex(L.skin,'#fff4e0',0.3)]), HR=cIR([mixHex(L.hair,'#000000',0.35),L.hair,mixHex(L.hair,'#ffffff',0.25)]);
  const TP=tRamp(L.top), BT=tRamp(L.bot), BO=cIR([L.boots,mixHex(L.boots,'#ffffff',0.2)]), HT=tRamp(L.hatC||'#54483c'), EYE=cI('#24160e');
  const step=fr===1||fr===3, lf=fr===1;                                                                    // (which foot leads)
  const dress=L.cut==='dress', coat=L.cut==='coat', legTop=dress?23:coat?21:19;
  // legs & boots
  if(!side){ for(const [lx,lead] of [[5,lf],[8,!lf]]){ const up=step&&!lead?1:0;
      for(let y=19;y<23-up;y++) if(y>=legTop){ P(lx,y,BT[3]); P(lx+1,y,BT[2]); P(lx+2,y,BT[lx===5?2:1]); }
      Rr(lx,23-up,3,2,BO[0]); P(lx+(lx===5?0:2),23-up,BO[1]); } }
  else { const legs = step ? [[4,7,1],[8,11,0]] : [[6,9,1]];                                                // (profile: stride apart, or together)
    if(step){ for(let y=19;y<23;y++) if(y>=legTop){ const t=y-19; P(6-t*0.5|0,y,BT[3]); P(7-t*0.5|0,y,BT[2]); P(8+t*0.5|0,y,BT[1]); P(9+t*0.5|0,y,BT[1]); }
      Rr(3,23,4,2,BO[0]); P(3,23,BO[1]); Rr(9,23,4,2,BO[0]); }
    else { for(let y=19;y<23;y++) if(y>=legTop){ P(6,y,BT[3]); P(7,y,BT[2]); P(8,y,BT[2]); P(9,y,BT[1]); } Rr(5,23,5,2,BO[0]); P(5,23,BO[1]); } }
  // the body (torso · coat skirts · dress)
  const tx0=side?5:4, tw=side?6:8;
  for(let y=12;y<19;y++) for(let i=0;i<tw;i++){ const x=tx0+i; P(x,y, i===0?TP[4]:i>=tw-2?TP[2]:TP[3]); }
  if(coat) for(let y=19;y<21;y++) for(let i=0;i<tw;i++) P(tx0+i,y, i===0?TP[4]:i>=tw-2?TP[1]:TP[2]);
  if(dress){ for(let y=18;y<23;y++){ const fl=y>=20?1:0, x0=tx0-fl, w=tw+fl*2; for(let i=0;i<w;i++) P(x0+i,y, y===22?TP[1]:i===0?TP[4]:i>=w-2?TP[2]:TP[3]); } }
  else if(!coat) Rr(tx0,18,tw,1,cI(mixHex(L.bot,'#1a1208',0.5)));                                                // a belt
  if(L.cut==='vest'&&!side&&!back){ Rr(7,12,2,6,cI(mixHex(L.top,'#fff4e0',0.55))); }
  if(coat&&!side&&!back){ Rr(7,14,2,6,TP[1]); P(7,15,cI('#d8b860')); P(7,17,cI('#d8b860')); }                  // the coat's opening & buttons
  if(L.cut==='tunic'&&!side){ Rr(tx0,16,tw,1,cI(mixHex(L.top,'#fff4e0',0.4))); }
  if(L.apron && !back){ const ax=side?(dir===2?5:8):5, aw=side?3:6, A=cIR([mixHex(L.apron,'#6a5a4a',0.4),L.apron]); for(let y=14;y<21;y++) for(let i=0;i<aw;i++) P(ax+i,y,A[i===aw-1?0:1]); Rr(side?5:4,14,side?6:8,1,A[0]); }
  if(L.strap && !side){ const Sp=cI(L.strap); for(let t=0;t<7;t++) P(back?10-t:4+t,12+t,Sp); P(back?4:10,18,cI('#6a4a2a')); }
  if(L.strap && side){ const Sp=cI(L.strap); for(let y=12;y<18;y++) P(dir===2?8:7,y,Sp); }
  // arms & hands (swinging with the stride)
  if(!side){ const sw=step?(lf?1:-1):0; for(const [ax,s2] of [[3,sw],[12,-sw]]){ const y0=13+Math.max(0,s2), y1=17+s2; for(let y=y0;y<=y1;y++){ P(ax,y,ax===3?TP[4]:TP[1]); } P(ax,y1+1,SK[1]); } }
  else { const f=dir===2?-1:1, sw=step?(lf?1:-1):0, ax=7+sw*f*2, hx=ax+(sw?sw*f:0); for(let y=13;y<18;y++) { P(ax,y,TP[2]); P(ax+1,y,TP[1]); } P(hx,18,SK[1]); P(hx+1,18,SK[0]); }
  // the head
  const hx0=side?5:4, hw=side?6:8;
  if(!back){ const fx0=side?(dir===2?5:7):5, fw=side?4:6;
    Rr(fx0,6,fw,5,SK[1]); Rr(fx0+1,11,fw-2,1,SK[1]); if(!side){ Rr(10,6,1,5,SK[0]); P(5,6,SK[2]); }
    if(side){ P(dir===2?4:11,8,SK[1]); P(dir===2?4:11,9,SK[0]); P(dir===2?8:7,8,SK[0]); }                        // the nose · an ear
    if(!side){ P(6,8,EYE); P(6,9,EYE); P(9,8,EYE); P(9,9,EYE); P(7,10,SK[0]); } else { const ex=dir===2?5:10; P(ex,8,EYE); P(ex,9,EYE); } }
  else Rr(5,6,6,6,SK[0]);
  // hair
  const hs=L.hs;
  if(hs!=='bald'){ Rr(hx0+1,3,hw-2,1,HR[1]); Rr(hx0,4,hw,2,HR[1]); Rr(hx0+1,4,hw-3,1,HR[2]);
    if(back){ Rr(hx0,6,hw,hs==='crop'?3:5,HR[1]); Rr(hx0,6,1,5,HR[2]); }
    else if(!side){ P(4,6,HR[1]); P(11,6,HR[1]); P(4,7,HR[0]); P(11,7,HR[0]); if(hs!=='crop'){ P(4,8,HR[0]); P(11,8,HR[0]); } }
    else { const bx=dir===2?9:4; Rr(bx,6,2,4,HR[1]); if(dir===2) P(8,6,HR[1]); else P(7,6,HR[1]); }
    if(hs==='long'){ const cols=side?[dir===2?9:5,dir===2?10:6]:[3,4,11,12]; for(const cx of cols) for(let y=6;y<14;y++) if(back||side||cx===3||cx===12||y<12) P(cx,y,HR[cx%2?0:1]); if(back) Rr(5,6,6,8,HR[1]); }
    if(hs==='bun'){ Rr(6,1,4,2,HR[1]); P(7,1,HR[2]); if(L.pen){ const Pn=cIR([mixHex(L.pen,'#5a3010',0.45),L.pen]); P(10,1,Pn[0]); P(11,0,Pn[1]); P(12,-1,cI('#3a2a22')); } }   // (INTROSTORY C3: a pencil stuck through the bun — Nell's)
    if(hs==='pony' && (back||side)){ const px=back?7:(dir===2?11:4); for(let y=6;y<13;y++){ P(px,y,HR[0]); P(px+(back?1:0),y,HR[1]); } }
    if(hs==='curly'){ for(let x=hx0;x<hx0+hw;x+=2){ P(x,2,HR[1]); } if(!back&&!side){ P(4,9,HR[1]); P(11,9,HR[1]); } } }
  else if(!back){ Rr(hx0+1,4,hw-2,2,SK[1]); Rr(hx0+1,4,2,1,SK[2]); P(hx0,6,HR[1]); P(hx0+hw-1,6,HR[1]); } else Rr(hx0,4,hw,4,SK[1]);
  if(L.beard && !back){ const bx=side?(dir===2?5:7):5, bw=side?4:6; Rr(bx,10,bw,2,HR[1]); Rr(bx+1,12,bw-2,1,HR[0]); if(!side) P(7,10,HR[2]); }
  if(L.spec && !back){ const G=cI('#dfe8f0'); if(!side){ P(5,8,G); P(10,8,G); } else P(dir===2?6:9,8,G); }
  // the hat
  const hat=L.hat;
  if(hat==='tricorn'||hat==='trek'||hat==='straw'||hat==='slouch'){ const brim=hat==='straw'?[1,15]:hat==='tricorn'?[2,14]:[2,14], H=hat==='straw'?cIR([mixHex(L.hatC,'#6a4a1a',0.3),L.hatC,mixHex(L.hatC,'#fff8e0',0.4)]):[HT[1],HT[3],HT[4]];
    Rr(brim[0],5,brim[1]-brim[0],1,H[0]); Rr(brim[0]+1,5,brim[1]-brim[0]-2,1,H[1]); if(hat==='slouch'){ P(brim[0],6,H[0]); P(brim[1]-1,6,H[0]); }
    Rr(5,2,6,3,H[1]); Rr(5,2,2,2,H[2]); if(hat==='slouch'){ P(7,2,0); P(8,2,H[0]); }
    if(hat==='tricorn'){ Rr(3,4,10,1,H[1]); Rr(2,5,12,1,cI('#e0b040')); P(7,1,H[1]); P(8,1,H[1]); }
    if(L.band) Rr(5,4,6,1,cI(L.band)); else if(hat==='trek') Rr(5,4,6,1,HT[0]); }
  else if(hat==='knit'){ Rr(4,2,8,4,HT[3]); for(let x=4;x<12;x+=2) Rr(x,5,1,1,HT[1]); Rr(4,2,3,1,HT[4]); P(7,1,HT[4]); P(8,1,HT[3]); }
  else if(hat==='flat'){ Rr(4,3,8,2,HT[3]); Rr(4,3,4,1,HT[4]); if(!back){ if(!side) Rr(4,5,8,1,HT[1]); else Rr(dir===2?2:9,5,5,1,HT[1]); } else Rr(4,5,8,1,HT[2]); }
  else if(hat==='bandana'||hat==='kerchief'){ Rr(4,3,8,3,HT[3]); Rr(4,3,4,1,HT[4]); if(hat==='bandana'){ if(back){ P(7,6,HT[2]); P(8,7,HT[1]); P(7,8,HT[1]); } else if(!side){ P(12,5,HT[2]); P(13,6,HT[1]); } } else { P(4,6,HT[2]); P(11,6,HT[2]); if(!side&&!back){ P(4,7,HT[1]); P(11,7,HT[1]); } } }
  else if(hat==='hood'){ const HD=tRamp(L.hatC||L.top); for(let y=2;y<13;y++) for(let x=3;x<13;x++){ const inFace=!back&&!side&&x>=5&&x<=10&&y>=6&&y<=11, inSide=side&&!back&&y>=6&&y<=11&&(dir===2?x<=8&&x>=4:x>=7&&x<=11);
      if(inFace||inSide){ if(y===6) P(x,y,HD[1]); continue; } if((y===2&&(x<5||x>10))) continue; P(x,y,x<5?HD[3]:x>10?HD[1]:HD[2]); } if(!back) { if(!side){ P(6,8,cI('#ffd86b')); P(9,8,cI('#ffd86b')); } } }   // a hood in shadow (and a gleam of eyes)
  if(L.scarf){ const Sc=tRamp(L.scarf); Rr(side?5:4,12,side?6:8,1,Sc[3]); if(!side) Rr(5,13,6,1,Sc[2]); if(!back&&!side){ P(10,14,Sc[3]); P(10,15,Sc[2]); P(11,15,Sc[1]); } else if(side){ const tx=dir===2?11:4, s2=dir===2?1:-1; P(tx,12,Sc[3]); P(tx+s2,13,Sc[2]); P(tx+s2*2,13+(step?0:1),Sc[1]); } }
  if(L.carry==='basket'&&!back){ const Bk=cIR(['#6a4424','#9a6a3a','#c8945a']), bx=side?(dir===2?3:10):12; Rr(bx,17,3,3,Bk[1]); Rr(bx,17,3,1,Bk[2]); P(bx+1,18,Bk[0]); P(bx,16,cI('#d83a3a')); P(bx+1,16,cI('#6ab83e')); }
  if(L.carry==='lantern'){ const bx=side?(dir===2?3:11):12; P(bx,18,cI('#3a3430')); Rr(bx,19,2,3,cI('#3a3430')); P(bx,20,cI('#ffd070')); }
  if(L.kid) folkKidRows(S);                                                                                 // (a harbour child: the same painter, a head shorter — two rows of body & one of leg taken out)
  psOut(S,cI('#1a120c'),false);
  return psCv(S,9,26); }
function folkKidRows(S){ const w=S.w, h=S.h, d=S.d, o=new Uint32Array(w*h); let yo=h-1; for(let y=h-1;y>=0;y--){ if(y===15||y===16||y===21) continue; o.set(d.subarray(y*w,(y+1)*w),yo*w); yo--; } d.set(o); }
/* the looks for this harbour's folk & the crew (crew follow their portraits: skin, hair & beard from the name) */
const CREW_LK=new Map();                                                                                    // (kept off the crew objects — they're saved)
function crewLook(m){ const ck=m.name+'|'+m.role; let L0=CREW_LK.get(ck); if(L0) return L0;
  let h=2166136261; for(let i=0;i<m.name.length;i++){ h^=m.name.charCodeAt(i); h=Math.imul(h,16777619); }
  const r=mulberry32(h>>>0), skin=['#e8c39a','#d8a878','#c08c5a','#a87248'][(r()*4)|0], hair=['#3a2c1a','#6e4a28','#9a7a3c','#c0c0c8','#8a3c2a','#222222'][(r()*6)|0], beard=r()<0.45;
  const R=ROLE_DEF[m.role]||ROLE_DEF.crewman, coat=mixHex(R.col,'#2a2438',0.42);
  const hat={captain:'tricorn',master:'bandana',carto:'slouch',craft:'flat',explorer:'trek',crewman:'knit',relief:'tricorn'}[m.role]||'knit';
  const hatC={captain:'#1c2434',master:'#2a7a8a',carto:'#54483c',craft:'#6e4a28',explorer:'#6e5128',crewman:'#8a4a3a',relief:'#3e2c52'}[m.role]||'#54483c';   // (PT1 B3b: the second captain — a plum tricorn, a long coat & a gold scarf)
  const L=folkLook(h, {skin, hair, beard, hs:beard?'short':'crop', hat, hatC, top:coat, cut:m.role==='carto'||m.role==='captain'||m.role==='relief'?'coat':'shirt', apron:m.role==='craft'?'#8a6a4a':null, scarf:m.role==='relief'?'#d8b44a':null, carry:null, spec:m.role==='carto', strap:m.role==='explorer'?'#5a3a22':null, bot:'#3a3448'});
  CREW_LK.set(ck,L); return L; }
const PLAYER_LOOK_O={skin:'#e8c39a', hair:'#4a3020', hs:'short', hat:'trek', hatC:'#5c4020', band:'#c8342a', top:'#2a4d63', cut:'coat', bot:'#34303e', boots:'#2c1e10', scarf:'#d23a2e', strap:'#8a5a2c', apron:null, beard:false, carry:null};   // your navy sea coat, red scarf & banded hat — the crawl's explorer
let PLAYER_LOOK=null;
function playerLook(){ return PLAYER_LOOK||(PLAYER_LOOK=folkLook(1,PLAYER_LOOK_O)); }
function townLooks(V){ FOLK_B=V.bk; for(let i=0;i<PRT.npcs.length;i++){ const n=PRT.npcs[i]; if(!n.look){ const L=n.look=folkLook(PRT.core.idx*97+i*13+5), g='#827d74';   // (passers-by in muted, workaday colours)
      L.top=mixHex(L.top,g,0.5); L.hatC=mixHex(L.hatC,g,0.4); L.bot=mixHex(L.bot,g,0.3); if(L.scarf) L.scarf=mixHex(L.scarf,g,0.45); if(L.apron) L.apron=mixHex(L.apron,g,0.3); } } FOLK_B=null; }
function walkFr(moving,ph){ return moving ? Math.floor(ph)&3 : 0; }                                      // (a walk: 4 frames — stand, step, stand, step)
/* ---- the harbour's furniture: lamps (iron · paper · crystal · glowcap · brass), crates, barrels, the stall, the well, the
   notice board, the fountain, the explorer's monument, the lighthouse, buoys, rope, the anchor, drying nets, the cat,
   bollards, dinghies & your boat — pixel sprites (V.ps), the anchor point on the ground ---- */
function tProp(V,key,mk){ let o=V.ps&&V.ps.get(key); if(o) return o; if(!V.ps) V.ps=new Map(); o=mk(); V.ps.set(key,o); return o; }
const OLC='#1a120c';
function tOut(S,ax,ay,diag){ return psCv(psOut(S,cI(OLC),!!diag),ax,ay); }
function lampSprT(V,night){ const kind=V.ST.lamp; return tProp(V,'lamp'+kind+(night?1:0), ()=>{
  const S=PS(13,30), IR=cIR(['#1e1a1a','#34302c','#4a4440','#5e5852']), G=night?cIR(['#ffb040','#ffe08a','#fff8d8']):cIR(['#6a7480','#9aa8b4','#c8d2da']);
  if(kind==='paper'){ const W=tRamp('#6a4a2a'); pR(S,5,6,2,23,W[2]); pR(S,5,6,1,23,W[3]); pR(S,5,6,6,1,W[1]); pR(S,3,28,6,1,W[1]); psP(S,10,7,W[1]);
    const Rd=night?cIR(['#c83a1a','#ff7a3a','#ffd08a']):cIR(['#8a1a1a','#c83a2a','#e86a4a']); for(let y=0;y<7;y++) for(let x=0;x<5;x++){ if((y===0||y===6)&&(x===0||x===4)) continue; psP(S,8+x,8+y,Rd[x===0?2:x===4?0:1]); if(y===2||y===4) psP(S,8+x,8+y,Rd[0]); } pR(S,9,7,3,1,cI('#d8a040')); pR(S,9,15,3,1,cI('#d8a040')); psP(S,10,16,cI('#d8a040'));
    return Object.assign(tOut(S,5,29),{gx:10,gy:11,c:1}); }
  if(kind==='crystal'){ pR(S,5,10,3,19,IR[1]); pR(S,5,10,1,19,IR[3]); pR(S,3,27,7,2,IR[1]); const C=night?cIR(['#4ab8e8','#8de9ff','#e8ffff']):cIR(['#2a6a9a','#4aa8d8','#8de9ff']);
    psPoly(S,[[4,10],[5,3],[7,1],[9,4],[9,10]],(x,y)=>C[x<6?2:x<8?1:0]); psP(S,6,3,C[2]); return Object.assign(tOut(S,6,29),{gx:6,gy:5,c:3}); }
  if(kind==='glow'){ const St=cIR(['#8a8070','#c8bca8','#ece4d4']), Cp=night?cIR(['#5a2a88','#9a60d8','#d0a8f4']):cIR(['#3e1a5e','#5a2a88','#7a44b0']), D=night?cI('#b8fff4'):cI('#e8c8ff');
    for(let y=10;y<29;y++){ psP(S,5,y,St[2]); psP(S,6,y,St[1]); psP(S,7,y,St[0]); } psDisc(S,6.5,8,6,4.5,(nx,ny,x,y)=>ny>0.45?0:Cp[clamp(Math.floor(1.3-(nx*0.6+ny*0.8)*1.4),0,2)]); pR(S,2,10,9,1,St[0]);
    for(const [x,y] of [[3,7],[6,5],[9,7],[5,8]]) psP(S,x,y,D); return Object.assign(tOut(S,6,29),{gx:6,gy:7,c:9,k:1.3}); }
  const Bz=kind==='brass'?cIR(['#5a3e18','#8a6428','#c8983e','#f0cc70']):IR;                                  // the iron (or brass) street lamp
  pR(S,5,8,2,20,Bz[1]); pR(S,5,8,1,20,Bz[3]); pR(S,3,27,6,2,Bz[1]); pR(S,3,27,6,1,Bz[2]); pR(S,4,12,4,1,Bz[2]);
  pR(S,2,1,8,1,Bz[1]); pR(S,3,0,6,1,Bz[2]); pR(S,2,2,1,6,Bz[1]); pR(S,9,2,1,6,Bz[0]); pR(S,3,2,6,5,G[1]); pR(S,3,2,2,2,G[2]); pR(S,5,2,1,5,Bz[1]); pR(S,2,7,8,1,Bz[1]); pR(S,5,8,2,1,Bz[2]);
  if(V.ST.snow) pR(S,2,0,8,1,cI('#f2f6fa'));
  return Object.assign(tOut(S,6,29),{gx:6,gy:5,c:10}); }); }
function crateSpr(V){ return tProp(V,'crate', ()=>{ const S=PS(12,12), W=V.wd; pR(S,0,0,12,3,W[4]); pR(S,0,0,12,1,W[5]); for(let x=0;x<12;x+=4) pR(S,x,0,1,3,W[3]);
  pR(S,0,3,12,9,W[2]); pR(S,0,3,1,9,W[3]); pR(S,11,3,1,9,W[1]); pR(S,0,3,12,1,W[1]); pR(S,0,11,12,1,W[1]); psLine(S,1,4,10,10,W[1],1); psLine(S,1,5,9,10,W[3],1); psP(S,2,5,W[0]); psP(S,9,5,W[0]);
  if(V.ST.snow) pR(S,1,0,10,1,cI('#f2f6fa')); return tOut(S,6,11); }); }
function barrelSpr(V){ return tProp(V,'barrel', ()=>{ const S=PS(10,12), B=tRamp('#8a5c34'), H=cI('#3a3434');
  for(let y=0;y<12;y++) for(let x=0;x<10;x++){ const e=(y===0||y===11)&&(x<2||x>7); if(e) continue; let v=x<2?4:x>7?1:x===2?4:3; if(y<3) v=y===0?5:(x>1&&x<8)?(y===1?2:3):v; psP(S,x,y,B[v]); }
  pR(S,1,4,8,1,H); pR(S,1,9,8,1,H); pR(S,2,1,6,1,B[1]); return tOut(S,5,11); }); }
function stallSpr(V){ return tProp(V,'stall', ()=>{ const S=PS(24,26), W=V.wd, A=PORT_PAL.awnings[((PRT.core.idx%PORT_PAL.awnings.length)+PORT_PAL.awnings.length)%PORT_PAL.awnings.length], c1=tRamp(A[0]), c2=tRamp(A[1]);
  pR(S,1,6,2,20,W[1]); pR(S,21,6,2,20,W[1]); pR(S,1,6,1,20,W[3]);
  for(let x=0;x<24;x++){ const C=Math.floor(x/4)&1?c1:c2; for(let y=0;y<6;y++) psP(S,x,y+1,C[y===0?5:y<3?4:3]); if(x%4===1||x%4===2) psP(S,x,7,C[2]); }
  pR(S,1,16,22,3,W[4]); pR(S,1,16,22,1,W[5]); pR(S,2,19,20,6,W[2]); for(let x=3;x<22;x+=4) pR(S,x,19,1,6,W[1]);
  const goods=[['#b8c8d8','#6a7a8a'],['#e8c040','#a87a18'],['#d83a3a','#8a1a1a'],['#6ab83e','#3a7a22']]; for(let k=0;k<4;k++){ const G=goods[k].map(cI), x=3+k*5; pR(S,x,14,4,2,G[0]); psP(S,x+3,15,G[1]); psP(S,x+1,13,G[0]); }
  return tOut(S,12,25); }); }
function wellSpr(V){ return tProp(V,'well', ()=>{ const S=PS(20,28), Q=V.qs, W=V.wd, R=tRamp(V.ST.tileR||'#b8563c');
  psDisc(S,10,15,9,3.4,(nx,ny)=>Q[nx*nx+ny*ny>0.45?(ny<0?4:2):1]); psDisc(S,10,15.3,6,2,()=>cI('#10202a')); psP(S,8,15,cI('#4a7a9a'));
  for(let y=16;y<25;y++) for(let x=1;x<19;x++){ const r=Math.floor((y-16)/3), sx=(x+(r&1)*3)%6; psP(S,x,y, (sx===5||(y-16)%3===2)?Q[1]:x<4?Q[4]:x>15?Q[2]:Q[3]); }
  pR(S,3,4,2,12,W[2]); pR(S,15,4,2,12,W[1]); pR(S,3,4,1,12,W[4]); pR(S,4,8,12,1,W[1]); psP(S,10,9,cI('#8a8070'));
  for(let y=0;y<5;y++) for(let x=1-y+2;x<19+y-2;x++) psP(S,x,y+1,R[y===0?4:y===4?1:3]);
  for(let j=9;j<13;j++) psP(S,10,j,cI('#c8b48a')); pR(S,9,12,3,2,W[1]);
  if(V.ST.snow) pR(S,2,0,16,2,cI('#eef4f8')); return tOut(S,10,24); }); }
function boardSpr(V){ return tProp(V,'board', ()=>{ const S=PS(22,28), W=V.wd, R=tRamp('#6a3a24');
  pR(S,2,8,2,20,W[1]); pR(S,18,8,2,20,W[1]); pR(S,2,8,1,20,W[3]);
  pR(S,1,6,20,14,W[3]); pR(S,1,6,20,1,W[4]); pR(S,1,19,20,1,W[1]); pR(S,2,7,18,12,W[2]);
  const note=(x,y,w,h,c,seal)=>{ pR(S,x,y,w,h,cI(c)); pR(S,x,y,w,1,cI('#fffaf0')); for(let j=y+2;j<y+h-1;j+=2) pR(S,x+1,j,w-2,1,cI('#a89878')); if(seal) psP(S,x+w-2,y+h-2,cI('#c8302a')); psP(S,x+(w>>1),y,cI('#6a6a70')); };
  note(3,8,5,7,'#efe6c8',true); note(9,9,5,6,'#e2d8b8',false); note(15,8,4,8,'#f4ecd4',true); note(6,15,5,3,'#d8cca8',false);
  for(let y=0;y<6;y++) for(let x=1-Math.min(y,1);x<21+Math.min(y,1);x++) psP(S,x,y+1,R[y===0?5:y===5?1:3]);
  if(V.ST.snow) pR(S,1,0,20,2,cI('#eef4f8')); return tOut(S,11,27); }); }
function fountainSpr(V,f){ return tProp(V,'fount'+f, ()=>{ const S=PS(46,34), Q=tRamp(mixHex(V.ST.stone,'#e8e2d4',0.3)), Wt=cIR([V.B.wat[4],V.B.wat[0],V.B.wat[3],V.B.wat[1],mixHex(V.B.wat[1],'#ffffff',0.5)]);
  psDisc(S,23,22,22,8,(nx,ny)=>{ const r=nx*nx+ny*ny; return r>0.72?Q[ny<0?4:2]:r>0.62?Q[1]:0; });
  psDisc(S,23,22.5,18.5,6.2,(nx,ny,x,y)=>{ const h=tH(x*3+f*7,y*5+f); return h<0.06?Wt[4]:h<0.2?Wt[3]:ny<-0.3?Wt[1]:Wt[2]; });
  for(let y=23;y<32;y++) for(let x=1;x<45;x++){ const nx=(x+0.5-23)/22; if(nx*nx>1) continue; if(y<23+Math.round(Math.sqrt(1-nx*nx)*8)) continue; psP(S,x,y,(x+(y>>1))%7===0?Q[1]:x<12?Q[4]:x>34?Q[2]:Q[3]); }
  pR(S,21,8,4,16,Q[3]); pR(S,21,8,1,16,Q[5]); pR(S,24,8,1,16,Q[1]); psDisc(S,23,8,7,2.4,(nx,ny)=>ny<0?Q[5]:Q[2]); psDisc(S,23,8,5,1.4,()=>Wt[3]);
  pR(S,22,3,2,5,Q[4]); pR(S,22,2,2,1,Wt[4]);
  return tOut(S,23,31); }); }
function monumentSpr(V){ return tProp(V,'monu', ()=>{ const S=PS(30,58), Q=tRamp(mixHex(V.ST.stone,'#d8d2c2',0.3)), Bz=cIR(['#2a3a2e','#3e5a44','#5f7d63','#7fa07f','#a8c8a0']), G=cIR(['#8a6a28','#d8a840','#fff0a0']);
  pR(S,1,50,28,7,Q[2]); pR(S,1,50,28,1,Q[4]); pR(S,4,44,22,6,Q[3]); pR(S,4,44,22,1,Q[5]); pR(S,8,30,14,14,Q[3]); pR(S,8,30,2,14,Q[4]); pR(S,20,30,2,14,Q[1]); pR(S,8,30,14,1,Q[5]);
  pR(S,11,35,8,4,G[1]); pR(S,11,35,8,1,G[2]); pR(S,11,38,8,1,G[0]);                                          // the brass plaque
  // the explorer in bronze, spyglass raised toward the sea
  pR(S,12,24,3,6,Bz[1]); pR(S,16,24,3,6,Bz[1]); pR(S,12,24,1,6,Bz[3]); pR(S,11,13,9,12,Bz[2]); pR(S,11,13,2,12,Bz[3]); pR(S,18,13,2,12,Bz[1]); pR(S,10,22,11,3,Bz[2]);
  pR(S,12,6,6,7,Bz[2]); pR(S,12,6,2,4,Bz[3]); pR(S,10,5,10,2,Bz[1]); pR(S,12,3,6,3,Bz[2]); pR(S,12,3,2,1,Bz[4]);
  psLine(S,19,14,24,9,Bz[2],2); psLine(S,23,9,27,5,Bz[3],2); psP(S,27,4,Bz[4]); pR(S,8,14,3,8,Bz[2]); pR(S,8,14,1,8,Bz[3]);
  return tOut(S,15,57); }); }
function lighthouseSpr(V){ return tProp(V,'lh', ()=>{ const S=PS(40,156), Wh=tRamp('#eae6dc'), Rd=tRamp('#c2402e'), Rk=tRamp('#6a645c'), Dk=tRamp('#2a2c34'), GL=cIR(['#e8c060','#fff0b0']);
  psDisc(S,20,148,19,7,(nx,ny,x,y)=>Rk[clamp(Math.floor(2.5-(nx*0.6+ny*0.8)*1.6+bayV(x,y)*0.8),0,5)]);       // the rocks it stands on
  const top=24, bot=146;
  for(let y=top;y<bot;y++){ const t=(y-top)/(bot-top), hw=7+t*6, band=Math.floor((y-top)/14)%2===1;
    for(let x=Math.floor(20-hw);x<Math.ceil(20+hw);x++){ const rel=(x+0.5-20)/hw, R=band?Rd:Wh; psP(S,x,y,R[rel<-0.55?4:rel>0.45?1:rel>0.1?2:3]); } }
  for(const wy of [48,76,104,128]) { pR(S,19,wy,3,5,Dk[1]); pR(S,19,wy,3,1,Dk[3]); }                       // windows up the tower
  pR(S,9,top-2,22,3,Dk[2]); pR(S,9,top-2,22,1,Dk[4]); for(let x=10;x<30;x+=3) pR(S,x,top-6,1,4,Dk[1]); pR(S,9,top-7,22,1,Dk[2]);   // the gallery & its railing
  pR(S,13,top-16,14,10,Dk[1]); pR(S,14,top-15,12,8,GL[0]); pR(S,15,top-15,3,8,GL[1]); pR(S,19,top-15,1,8,Dk[1]); pR(S,23,top-15,1,8,Dk[1]);   // the lamp room
  psPoly(S,[[11,top-16],[20,top-24],[29,top-16]],(x,y)=>Rd[x<20?4:2]); pR(S,19,top-26,2,3,Dk[2]);
  const o=tOut(S,20,150); o.lx=20; o.ly=top-11; return o; }); }
function buoySpr(V){ return tProp(V,'buoy', ()=>{ const S=PS(9,14), Rd=tRamp('#c2402e'), Wh=tRamp('#efe6d2');
  psPoly(S,[[1,12],[4,2],[8,12]],(x,y)=>(y>=6&&y<=8?Wh:Rd)[x<4?4:x>5?1:3]); pR(S,0,11,9,2,Rd[1]); pR(S,3,0,3,2,cI('#2a2c34'));
  return tOut(S,4,12); }); }
function townRopeSpr(V){ return tProp(V,'rope', ()=>{ const S=PS(15,9), R=cIR(['#6a4e2a','#a07f4e','#c8a870','#e0c890']);
  for(let k=3;k>=1;k--) psDisc(S,7.5,4.5,k*2.3,k*1.2+0.4,(nx,ny)=>{ const r=nx*nx+ny*ny; return r>0.55?R[ny<0?3:1]:0; }); psP(S,7,4,R[0]); psP(S,8,4,R[0]); return tOut(S,7,7); }); }
function anchorSprT(V){ return tProp(V,'anch', ()=>{ const S=PS(16,17), I=cIR(['#1e2228','#3a4048','#5a6470','#8a96a2']);
  psDisc(S,8,2.5,2.4,2.4,(nx,ny)=>nx*nx+ny*ny>0.3?I[ny<0?3:1]:0); pR(S,7,4,2,11,I[2]); pR(S,7,4,1,11,I[3]); pR(S,3,6,10,2,I[1]); pR(S,3,6,10,1,I[3]);
  for(let x=1;x<15;x++){ const t=(x-8)/7, y=15-Math.round((1-t*t)*3); psP(S,x,y,I[2]); psP(S,x,y+1,I[1]); } psP(S,1,11,I[3]); psP(S,14,11,I[1]); psP(S,0,10,I[2]); psP(S,15,10,I[1]);
  return tOut(S,8,16); }); }
function netsSpr(V){ return tProp(V,'nets', ()=>{ const S=PS(30,30), W=V.wd, N=cIR(['#6a5e44','#9a8c68','#c8bc98']), Fl=cIR(['#c2402e','#e8b53a','#e8e0c8']);   // a fishing net hung to dry: two poles, a line, the mesh sagging, cork floats along its foot
  pR(S,2,1,2,29,W[1]); pR(S,2,1,1,29,W[3]); pR(S,26,1,2,29,W[1]); pR(S,26,1,1,29,W[3]); psP(S,2,0,W[4]); psP(S,26,0,W[4]);
  for(let x=3;x<27;x++){ const t=(x-3)/23, top=3+Math.round(Math.sin(t*Math.PI)*2), bot=15+Math.round(Math.sin(t*Math.PI)*8); psP(S,x,top-1,N[0]);
    for(let y=top;y<bot;y++){ const dx=(x+y)%4, dy=(x-y+40)%4; if(dx===0||dy===0) psP(S,x,y,(dx===0&&dy===0)?N[2]:N[1]); }
    if(x%5===2){ psP(S,x,bot,Fl[(x/5|0)%2]); psP(S,x+1,bot,Fl[(x/5|0)%2]); psP(S,x,bot+1,Fl[2]); } }
  return tOut(S,15,29); }); }
function catSpr(V,f){ return tProp(V,'cat'+f, ()=>{ const S=PS(12,11), col=['#3a322c','#d8883a','#8a8a92','#f0ece4'][((PRT.core.idx%4)+4)%4], C=tRamp(col), E=cI(col==='#3a322c'?'#9ad7c0':'#6ab83e');
  psDisc(S,5,7.5,3.6,3,(nx,ny)=>C[ny<-0.3?4:nx>0.4?2:3]); psDisc(S,7.5,3.5,2.4,2.2,(nx,ny)=>C[ny<-0.2?4:3]); psP(S,6,1,C[3]); psP(S,6,0,C[2]); psP(S,9,1,C[3]); psP(S,9,0,C[2]);
  psP(S,7,3,E); psP(S,9,3,E); psP(S,8,4,cI('#e89aa0'));
  if(f===0){ psP(S,1,8,C[3]); psP(S,0,7,C[3]); psP(S,0,6,C[4]); } else { psP(S,1,9,C[3]); psP(S,1,10,C[2]); psP(S,2,10,C[3]); }
  return tOut(S,5,10); }); }
function bollardSpr(V){ return tProp(V,'boll', ()=>{ const S=PS(7,9), I=V.quay==='stone'?cIR(['#1e2228','#3a4048','#5a6470','#8a96a2']):cIR(['#2e2014','#4a3620','#66502e','#86704a']);
  pR(S,1,2,5,7,I[2]); pR(S,1,2,1,7,I[3]); pR(S,5,2,1,7,I[1]); pR(S,0,1,7,2,I[2]); pR(S,0,1,7,1,I[3]); pR(S,1,6,5,1,cI('#a07f4e')); return tOut(S,3,8); }); }
function dinghySpr(V,v){ return tProp(V,'ding'+v, ()=>{ const S=PS(24,12), H=tRamp(['#6e4a2c','#4a5a6a','#7a3a2a'][((v%3)+3)%3]), In=tRamp('#a8844e');
  for(let y=0;y<12;y++) for(let x=0;x<24;x++){ const nx=(x+0.5-12)/12, ny=(y+0.5-6)/5.5, prow=x>17?((x-17)/6.5):0, r=nx*nx+ny*ny+prow*prow*1.2; if(r>1) continue;
    psP(S,x,y, r>0.55?H[ny<0?4:ny>0.4?1:2]:In[ny<-0.2?4:3]); }
  pR(S,8,3,1,6,In[1]); pR(S,14,3,1,6,In[1]); psLine(S,5,2,11,9,cI('#c8a870'),1);
  return tOut(S,12,8); }); }
function boatSprT(V,f,lv){ lv=lv||(SHIP&&SHIP.liv); const C=livCols(lv), stg=livStg(), ex=5*stg; return tProp(V,'boat'+f+'|'+livSigOf(lv,stg), ()=>{   // (PT1 B8: her livery & her stage — the start's look exactly as before)
  const S=PS(34,80+ex), H=tRamp(C.hullT), D=tRamp('#b8844e'), M=tRamp('#5a3a1e'), SR=sailRamp(C.sail), SL=C.sid==='canvas'?cIR(['#a89c80','#d8cdb0','#f4efe0']):[SR[0],SR[1],SR[3]], G=C.fid==='guild'?cIR(['#c89a1c','#ffd23f']):cIR([mixHex(C.flag,'#000000',0.3),C.flag]), R=tRamp(C.trim);
  const hx=17, top=30, bot=76+ex, HW=11;                                                                       // your sloop, bow north, lying alongside the jetty (a longer stage: her stern grows into open water)
  const hwAt=y=>{ const t=(y-top)/(bot-top); return t<0.4?Math.pow(t/0.4,0.6)*HW:t>0.86?HW*Math.sqrt(Math.max(0,1-(t-0.86)/0.15)):HW; };
  psLine(S,hx,top-8,hx,top+2,M[3],1); psP(S,hx,top-9,M[4]);                                                    // the bowsprit
  for(let y=top;y<=bot;y++){ const hw=hwAt(y); for(let x=Math.floor(hx-hw);x<Math.ceil(hx+hw);x++){ const e=Math.min(x+0.5-(hx-hw),hx+hw-x-0.5); let c;
      if(e<1.2) c=H[x<hx?4:1]; else if(e<2.2) c=x<hx?R[4]:R[2]; else if(e<3.2) c=H[x<hx?3:2];                  // the rail · a red strake · the gunwale
      else { const pl=(x-hx+40)%4; c=D[pl===0?2:(x<hx?4:3)]; if(y%11===0) c=D[2]; } psP(S,x,y,c); } }         // the deck's planks, fore & aft
  pR(S,hx-5,top+26,11,9,M[1]); pR(S,hx-5,top+26,11,2,M[3]); pR(S,hx-4,top+28,9,6,M[2]); pR(S,hx-2,top+30,1,3,cI('#ffd070'));   // the little cabin aft (a lamp in its window)
  pR(S,hx-3,top+13,7,5,M[0]); pR(S,hx-3,top+13,7,1,M[2]); pR(S,hx-2,top+14,5,3,cI('#2a1a10'));                 // the hatch
  pR(S,hx-1,2,2,top+12,M[2]); pR(S,hx-1,2,1,top+12,M[4]);                                                      // the mast
  for(let y=top+14;y<top+25;y++){ pR(S,hx-2,y,5,1,SL[y%3===0?0:1]); psP(S,hx-2,y,SL[2]); } pR(S,hx,top+13,1,14,M[1]);   // the furled sail on its boom
  pR(S,hx-6,14,13,1,M[1]); pR(S,hx-6,15,13,1,SL[0]); pR(S,hx-5,16,11,1,SL[1]);                               // the yard & its furled topsail
  if(stg>=3){ for(let y=top+2;y<top+10;y++){ pR(S,hx-2,y,5,1,SL[y%3===0?0:1]); psP(S,hx-2,y,SL[2]); } pR(S,hx,top+1,1,10,M[1]); pR(S,hx-5,top-12,11,1,M[1]); pR(S,hx-5,top-11,11,1,SL[0]); pR(S,hx-4,top-10,9,1,SL[1]); }   // (PT1 B8: the Schooner's foremast — its sail furled on its boom, its yard)
  for(let y=0;y<4;y++) for(let x=0;x<8;x++){ const wv=f?((x>>1)&1):(((x+1)>>1)&1); psP(S,hx+1+x,y+wv,G[y===0?1:0]); }   // the gold pennant
  if(C.flagOn) for(const [x,y] of [[3,1],[4,1],[3,2],[4,2]]){ const wv=f?((x>>1)&1):(((x+1)>>1)&1); psP(S,hx+1+x,y+wv,cI(C.flagD)); }   // (PT1 B8: her own flag's device)
  if(C.figC){ const FC=tRamp(C.figC); pR(S,hx-1,top-2,2,2,FC[3]); psP(S,hx-1,top-2,FC[5]); }   // (her figurehead at the bowsprit's root)
  const o=tOut(S,hx,58); o.lx=hx; o.ly=16; return o; }); }
/* ---- the harbour's animated water: two drifting layers of pixel wave-crests & a few glints over the baked water ---- */
function rippleTile(V,L){ return tProp(V,'rip'+L, ()=>{ const T=96, S=PS(T,T), c=L?cIA(mixHex(V.B.wat[1],'#ffffff',0.3),1):cIA(mixHex(V.B.wat[1],'#ffffff',0.55),1), c2=cIA(V.B.wat[4],1);
  for(let i=0;i<(L?30:22);i++){ const x0=Math.floor(tH(i*7+L*31,L*5+3)*T), y0=Math.floor(tH(i*13+L*17,L*9+1)*T), n=3+Math.floor(tH(i,L+7)*4);
    for(let j=0;j<n;j++){ psP(S,(x0+j)%T,(y0+(j===0||j===n-1?1:0))%T,c); if(!L && j>0 && j<n-1) psP(S,(x0+j)%T,(y0+2)%T,c2); } }
  return psCv(S,0,0); }); }
function townWaterAnim(V){ const y0=V.shore+10+TOY; if(y0>IH) return;
  pctx.save(); pctx.beginPath(); pctx.rect(0,Math.max(0,y0),IW,IH); const j=V.jet; pctx.rect(j.x0-4+TOX,V.shore+TOY,j.x1-j.x0+8,j.y1+12-V.shore); pctx.clip('evenodd');
  for(let L=0;L<2;L++){ const o=rippleTile(V,L), T=96, sp=L?-5:3.5, ox=Math.round(itime*sp+(L?40:0)), oy=Math.round(Math.sin(itime*0.35+L*2)*2+(L?30:0)), bx=(((TOX+ox)%T)+T)%T-T, by=(((TOY+oy)%T)+T)%T-T;   // (anchored to the world: the camera never drags the swell)
    pctx.globalAlpha=L?0.3:0.5; for(let y=by;y<IH;y+=T){ if(y+T<y0) continue; for(let x=bx;x<IW;x+=T) pctx.drawImage(o.cv,x,y); } }
  pctx.globalAlpha=1;
  const w=Math.floor(itime*1.7); pctx.fillStyle='#ffffff';                                                          // glints winking on the swell
  for(let i=0;i<14;i++){ const h=tH(i*31+w*7,w*3+i), x=Math.floor(h*IW), y=y0+Math.floor(tH(i*5+w,i*9)*(IH-y0)), a=1-Math.abs(((itime*1.7)%1)-0.5)*2; if(a<0.3) continue;
    pctx.globalAlpha=a*0.8; pctx.fillRect(x,y,1,1); if(a>0.8){ pctx.globalAlpha=a*0.4; pctx.fillRect(x-1,y,3,1); } }
  pctx.globalAlpha=1; pctx.restore(); }
/* ---- ambient life: snow, leaves, petals, fireflies, embers, spores, dust — a small pool per harbour ---- */
const T_AMB={ frost:[['snow',14,60]], ember:[['leaf',2.4,14]], meadow:[['petal',1.6,10],['fly',2,14,2]], tropic:[['petal',0.8,6],['fly',2,14,2]], atoll:[['fly',1.4,10,2]], savanna:[['dust',1.2,8],['fly',1,8,2]],
  moor:[['fly',1,8,2]], boulder:[['fly',1,8,2]], scorch:[['ember',2.4,16],['ash',2,14]], volcanic:[['ember',3,18],['ash',3,20]], crystal:[['mote',2.4,16]], dunes:[['dust',2,12]], swamp:[['fly',3.2,22,2]],
  bamboo:[['leafg',1.4,10],['fly',1.6,12,2]], mushroom:[['spore',3,22]] };
function townTick(dt){ const V=PRT&&PRT._V; if(!V) return; const E=T_AMB[V.bk]||[], k=TUNE.townLife, nk=nightK(), A=V.amb;
  for(let i=0;i<PRT.npcs.length;i++) PRT.npcs[i].lant = nk>0.45 && (i%3!==1);                                        // after dark most folk carry a lantern
  if(k>0) for(const e of E){ const nightOnly=e[3]===2; if(nightOnly && nk<0.3) continue; if(env.storm>0.3 && e[0]!=='snow') continue;
    const cnt=A.reduce((n,q)=>n+(q.k===e[0]?1:0),0); if(cnt>=e[2]*k) continue; if(Math.random()>e[1]*k*dt) continue;
    const x=icamX+(Math.random()-0.5)*IW*1.1, y=icamY+(Math.random()-0.5)*IH*1.1-(e[0]==='snow'||e[0]==='leaf'||e[0]==='petal'||e[0]==='ash'||e[0]==='leafg'?IH*0.4:0);
    A.push({k:e[0], x, y, vx:0, vy:0, t:0, life:e[0]==='fly'?6+Math.random()*6:e[0]==='snow'?8:5+Math.random()*4, ph:Math.random()*TAU}); }
  for(let i=A.length-1;i>=0;i--){ const q=A[i]; q.t+=dt; q.ph+=dt*3;
    if(q.k==='snow'){ q.x+=(Math.sin(q.ph*0.6)*8+wind.str*6*Math.cos(wind.a))*dt; q.y+=14*dt; }
    else if(q.k==='leaf'||q.k==='petal'||q.k==='leafg'){ q.x+=(Math.sin(q.ph*0.8)*14+6)*dt; q.y+=9*dt; }
    else if(q.k==='fly'||q.k==='mote'||q.k==='spore'){ q.x+=Math.sin(q.ph*0.7)*10*dt; q.y+=(Math.cos(q.ph*0.5)*6-(q.k==='spore'?4:0))*dt; }
    else if(q.k==='ember'){ q.x+=Math.sin(q.ph)*6*dt; q.y-=16*dt; } else if(q.k==='ash'){ q.x+=(Math.sin(q.ph*0.5)*6+4)*dt; q.y+=7*dt; } else if(q.k==='dust'){ q.x+=18*dt; q.y+=Math.sin(q.ph)*3*dt; }
    if(q.t>q.life){ A[i]=A[A.length-1]; A.pop(); } } }
const T_AMBC={snow:['#ffffff','#dce8f4'], leaf:['#d8703a','#e8a040','#b04a1a'], leafg:['#8ab84e','#5a8a34'], petal:['#f4a8c8','#ffffff','#f8d0e0'], fly:['#e8ff8a'], ember:['#ff9a3c','#ffd070'], ash:['#8a8480','#b0aaa4'], mote:['#8de9ff','#c9a6ff'], spore:['#d8a6ff','#8de9ff'], dust:['#d8c098','#c8ac80']};
function townAmbDraw(V,glow){ for(const q of V.amb){ const isGlow=q.k==='fly'||q.k==='ember'||q.k==='mote'||q.k==='spore'; if(glow!==isGlow) continue;
    const X=TX(q.x), Y=TY(q.y); if(X<-2||Y<-2||X>IW+2||Y>IH+2) continue; const C=T_AMBC[q.k], a=Math.min(1,q.t*2,(q.life-q.t)*1.5);
    let al=a; if(q.k==='fly') al*=0.3+0.7*Math.max(0,Math.sin(q.ph*1.3)); pctx.globalAlpha=al; pctx.fillStyle=C[Math.floor(q.ph)%C.length];
    if(q.k==='leaf'||q.k==='petal'||q.k==='leafg') pctx.fillRect(X,Y,2,1); else pctx.fillRect(X,Y,1,1); }
  pctx.globalAlpha=1; }
/* ---- light & night in town: the hour's ambient × every lamp, window, doorway, the lighthouse & your boat — then the glass glows ---- */
function townAmbCalc(){ const A=LGT.amb; let r=1,g=1,b=1; const nk=nightK(), kk=TUNE.townNight/0.733;
  r*=1+(0.62*kk-1)*nk; g*=1+(0.74*kk-1)*nk; b*=1+(kk-1)*nk;
  const w=clamp(1-Math.abs(env.sun)/0.36,0,1)*ITUNE.duskWarm*0.85; if(w>0){ r*=1-0.02*w; g*=1-0.3*w; b*=1-0.62*w; }
  const st=clamp(env.storm*0.72+env.tempest*0.2,0,1); if(st>0){ r*=1-0.42*st; g*=1-0.38*st; b*=1-0.27*st; }
  if(env.drizzle>0.02){ const d=env.drizzle; r*=1-0.12*d; g*=1-0.1*d; b*=1-0.06*d; }
  const fl=clamp(env.flash*0.9,0,1); if(fl>0){ r+=(1-r)*fl; g+=(1-g)*fl; b+=(1-b)*fl; }
  A[0]=clamp(r,0,1); A[1]=clamp(g,0,1); A[2]=clamp(b,0,1); LGT.bi=0;
  LGT.dk=1-(0.3*A[0]+0.59*A[1]+0.11*A[2]); LGT.on=TUNE.townLight>0 && (A[0]<0.985||A[1]<0.985||A[2]<0.985); }
function winLit(i,w){ return PRT.blds[i].kind!=='house' || tH(i*13+w*7+PRT.core.idx,w*3+i)<0.82; }   // (most homes have a light in; the trades always do)
function townLights(V){ const dk=LGT.dk, Vv=LGT.v; LGT.n=0; if(dk<0.04) return;
  Vv[0]=icamX-IW/2-80; Vv[1]=icamX+IW/2+80; Vv[2]=icamY-IH/2-80; Vv[3]=icamY+IH/2+160;
  const wk=TUNE.townWin, P=PRT;
  for(const p of P.props){ if(!lOn(p.x,p.y)) continue;
    if(p.k==='lamp'){ const o=lampSprT(V,true); lAdd(p.x-o.ax+o.gx,p.y-o.ay+o.gy,TUNE.townLamp*(1+0.02*Math.sin(itime*9+p.x)),0.95*(o.k||1),o.c); }
    else if(p.k==='lighthouse'){ const o=lighthouseSpr(V); lAdd(p.x-o.ax+o.lx,p.y-o.ay+o.ly,70,1.1,11); lAdd(p.x,p.y-10,50,0.4,11); }
    else if(p.k==='buoy') lAdd(p.x,p.y-10,12,0.55,4); }
  for(let i=0;i<P.blds.length;i++){ const b=P.blds[i], o=V.bs[i], bx=b.x0*20-o.ox, by=b.y0*20-o.oy; if(!lOn(bx+b.w*10,by+b.h*20)) continue;
    for(let w=0;w<o.win.length;w++){ if(!winLit(i,w)) continue; const q=o.win[w]; lAdd(bx+q[0]+q[2]/2,by+q[1]+q[3]+6,22,0.5*wk,0); }
    for(const q of o.lamp) lAdd(bx+q[0],by+q[1]+2,34,0.8,q[2]?1:10);
    if(o.glowC){ const d=o.door; lAdd(bx+d[0]+d[2]/2,by+d[1]+d[3],40,0.75,10); }
    if(o.furn){ lAdd(bx+o.furn[0],by+o.furn[1],46*(1+0.05*Math.sin(itime*9+i*2)+0.03*Math.sin(itime*23)),0.95,1); lAdd(bx+o.chim[0],by+o.chim[1]-2,16,0.5,1); } }   // (C7b) the forge's furnace glow — the hearth & the chimney's lip
  lAdd(P.boatX,P.boatY-36,36,0.7,10);
  for(const n of P.npcs) if(n.lant&&lOn(n.x,n.y)) lAdd(n.x+5,n.y-8,32,0.75,0);
  if(P.folk) for(const n of P.folk) if(n.lant&&!n.inside&&lOn(n.x,n.y)) lAdd(n.x+5,n.y-8,32,0.75,0);
  if(nightK()>0.45){ const pd=folkDir(player.fx,player.fy); lAdd(player.x+(pd===2||pd===1?-5:5),player.y-8,42,0.8,0); }                     // (your own hand lantern, after dark)
  for(const q of V.amb){ if(q.k==='fly') lAdd(q.x,q.y,10,0.3,4); else if(q.k==='ember') lAdd(q.x,q.y,8,0.4,1); else if(q.k==='spore'||q.k==='mote') lAdd(q.x,q.y,8,0.35,q.k==='spore'?9:3); } }
function lhBeam(V,g,a,add){ const P=PRT; for(const p of P.props){ if(p.k!=='lighthouse') continue; const o=lighthouseSpr(V), X=TX(p.x-o.ax+o.lx), Y=TY(p.y-o.ay+o.ly), ang=itime*0.8+(p.ph||0), L=IW*0.9, sp=0.16, sea=clamp(Math.sin(ang)*2.2+0.2,0,1);   // (it sweeps the sea: over the town it fades)
    if(sea<0.02) continue; a*=sea;
    g.fillStyle=add?'rgba(255,240,196,1)':'rgb(255,236,190)';
    for(const [s2,k] of [[sp*1.3,0.35],[sp*0.8,0.35],[sp*0.4,0.3]]){ const x1=X+Math.cos(ang-s2)*L, y1=Y+Math.sin(ang-s2)*L*0.55, x2=X+Math.cos(ang+s2)*L, y2=Y+Math.sin(ang+s2)*L*0.55;   // (three nested wedges: a stepped edge, like the lamps' rings)
      g.globalAlpha=a*k; g.beginPath(); g.moveTo(X,Y); g.lineTo(x1,y1); g.lineTo(x2,y2); g.closePath(); g.fill(); } g.globalAlpha=1; } }
function townLightPass(V){ const A=LGT.amb, g=LGT.g, cv=LGT.cv;
  townAmbCalc(); if(!LGT.on) return;
  townLights(V);
  if(cv.width!==IW||cv.height!==IH){ cv.width=IW; cv.height=IH; }
  g.globalCompositeOperation='source-over'; g.globalAlpha=1; g.fillStyle='rgb('+Math.round(A[0]*255)+','+Math.round(A[1]*255)+','+Math.round(A[2]*255)+')'; g.fillRect(0,0,IW,IH);
  g.globalCompositeOperation='lighter'; lDraw(g,1,0); if(LGT.dk>0.2){ g.save(); g.beginPath(); g.rect(0,V.shore+8+TOY,IW,IH); g.clip(); lhBeam(V,g,0.3*clamp((LGT.dk-0.2)/0.3,0,1),false); g.restore(); }   // (the lighthouse sweeps the harbour water)
  g.globalAlpha=1; g.globalCompositeOperation='darken'; g.fillStyle='rgb(255,228,184)'; g.fillRect(0,0,IW,IH); g.globalCompositeOperation='source-over';
  pctx.globalCompositeOperation='multiply'; pctx.drawImage(cv,0,0); pctx.globalCompositeOperation='source-over';
  townEmissive(V); }
function townEmissive(V){ const dk=LGT.dk; if(dk<0.08) return; const k=clamp((dk-0.08)/0.35,0,1), P=PRT;
  pctx.globalAlpha=k;
  for(let i=0;i<P.blds.length;i++){ const b=P.blds[i], o=V.bs[i]; if(!o.nt) o.nt=bldNight(o,i); const X=TX(b.x0*20)-o.ox, Y=TY(b.y0*20)-o.oy; if(X>IW||Y>IH||X+o.cv.width<0||Y+o.cv.height<0) continue; pctx.drawImage(o.nt,X,Y); }
  for(const n of P.npcs){ if(!n.lant) continue; const dir=folkDir(n.fx||0,n.fy||1), X=TX(n.x)+(dir===2||dir===1?-5:5), Y=TY(n.y)-7+(n.mv&&Math.sin(n.ph*5.2)>0.3?1:0); pctx.fillStyle='#ffe090'; pctx.fillRect(X,Y-2,1,2); }
  if(P.folk) for(const n of P.folk){ if(!n.lant||n.inside) continue; const dir=folkDir(n.fx||0,n.fy||1), X=TX(n.x)+(dir===2||dir===1?-5:5), Y=TY(n.y)-7+(n.mv&&Math.sin(n.ph*5.2)>0.3?1:0); pctx.fillStyle='#ffe090'; pctx.fillRect(X,Y-2,1,2); }   // (the named folk's lanterns too)
  if(nightK()>0.45){ const dir=folkDir(player.fx,player.fy), X=TX(player.x)+(dir===2||dir===1?-5:5), Y=TY(player.y)-7+(player.moving&&Math.sin(itime*1.7*5.2)>0.3?1:0); pctx.fillStyle='#ffe090'; pctx.fillRect(X,Y-2,1,2); }   // (and yours)
  for(const p of P.props){ if(p.k==='lamp'){ const o=lampSprT(V,true), X=TX(p.x)-o.ax, Y=TY(p.y)-o.ay; if(X<-20||X>IW+20||Y<-40||Y>IH+10) continue; pctx.drawImage(o.cv,X,Y); }
    else if(p.k==='lighthouse'){ const o=lighthouseSpr(V), X=TX(p.x)-o.ax+o.lx, Y=TY(p.y)-o.ay+o.ly; pctx.fillStyle='#fff4c8'; pctx.fillRect(X-5,Y-4,10,8); pctx.fillStyle='#ffffff'; pctx.fillRect(X-2,Y-2,4,4); }
    else if(p.k==='buoy'){ const X=TX(p.x), Y=TY(p.y)+(Math.sin(itime*1.8+(p.ph||0))>0?1:0); pctx.fillStyle='#8aff9a'; pctx.fillRect(X-1,Y-12,2,2); } }
  { const o=boatSprT(V,0), X=TX(PRT.boatX)-o.ax+o.lx, Y=TY(PRT.boatY)-o.ay+o.ly+(V.bob||0); pctx.fillStyle='#ffd070'; pctx.fillRect(X-1,Y-1,3,3); pctx.fillStyle='#fff8d8'; pctx.fillRect(X,Y,1,1); }
  pctx.globalAlpha=1;
  pctx.globalCompositeOperation='lighter'; townAmbDraw(V,true); if(dk>0.2) lhBeam(V,pctx,0.07*clamp((dk-0.2)/0.3,0,1),true); pctx.globalCompositeOperation='source-over'; }
function bldNight(o,i){ const c=document.createElement('canvas'); c.width=o.cv.width; c.height=o.cv.height; const g=c.getContext('2d');   // a building's lit glass, for after dark
  for(let w=0;w<o.win.length;w++){ if(!winLit(i,w)) continue; const q=o.win[w]; g.fillStyle='#ffc860'; g.fillRect(q[0],q[1],q[2],q[3]); g.fillStyle='#fff0b8'; g.fillRect(q[0],q[1],Math.max(1,q[2]>>1),Math.max(1,q[3]>>1));
    g.fillStyle='#6a4020'; g.fillRect(q[0]+(q[2]>>1),q[1],1,q[3]); if(q[3]>5) g.fillRect(q[0],q[1]+(q[3]>>1),q[2],1); }
  for(const q of o.lamp){ g.fillStyle='#ffd070'; g.fillRect(q[0],q[1],1,2); }
  if(o.glowC){ const d=o.door; g.fillStyle='rgba(255,200,110,0.9)'; g.fillRect(d[0]+2,d[1]+2,2,3); }
  if(o.furnR){ const q=o.furnR; g.fillStyle='#ff9a3a'; g.fillRect(q[0],q[1],q[2],q[3]); g.fillStyle='#ffe090'; g.fillRect(q[0]+1,q[1],q[2]-2,1); g.fillStyle='rgba(255,140,60,0.55)'; g.fillRect(q[0]-1,q[1]-6,q[2]+2,5); }   // (C7b) the hearth burns through the dark
  return c; }
function townWeather(){ const rk=ITUNE.rainAsh, st=env.storm, dz=env.drizzle, lum=1-LGT.dk*0.55;
  if(rk>0 && st>0.02){ const slr=Math.cos(wind.a)*(0.55+env.tempest*0.5)+0.2, sq=clamp(Math.round(slr*4),-6,6), L=3+Math.round(env.tempest*3), d=clamp(Math.round(st*(1+env.tempest)*rk*4),1,9), a=(0.5+0.45*st)*lum;
    rainLayer(rainTile(sq,Math.max(2,L-1),d,1),150,sq/4,a*0.6); rainLayer(rainTile(sq,L,d,0),230,sq/4,a); }
  if(rk>0 && dz>0.05 && st<0.2) rainLayer(rainTile(0,2,clamp(Math.round(dz*rk*3),1,9),2),115,0,0.45*dz*lum);
  if(env.fog>0.02 && ITUNE.fogAsh>0) islFog();
  if(env.flash>0.02){ pctx.globalCompositeOperation='lighter'; pctx.fillStyle='rgba(110,122,150,'+(env.flash*0.2).toFixed(3)+')'; pctx.fillRect(0,0,IW,IH); pctx.globalCompositeOperation='source-over'; } }
/* ---- THE TOWN, a frame ---- */
const TDR=[]; let TDRN=0;                                                                                    // (the y-sort list, reused)
function tdr(y,k,a,b){ let o=TDR[TDRN]; if(!o) o=TDR[TDRN]={y:0,k:0,a:null,b:0}; o.y=y; o.k=k; o.a=a; o.b=b; TDRN++; }
function drawTown(){
  const V=townPrep(), P=PRT; V.fr++;
  TOX=Math.round(IW/2-icamX); TOY=Math.round(IH/2-icamY);
  const night=env.L<0.45;
  pctx.fillStyle='#10140e'; pctx.fillRect(0,0,IW,IH);
  // the ground (baked chunks; a missing one is baked now — on arrival behind a short fade)
  const cx0=Math.floor(-TOX/TCH), cx1=Math.floor((IW-TOX)/TCH), cy0=Math.floor(-TOY/TCH), cy1=Math.floor((IH-TOY)/TCH), t0=performance.now();
  if(V.fade==null) V.fade=12;
  const ff=Math.floor(itime*2.4)%4, fo=ff===3?1:ff;
  for(let cy=cy0;cy<=cy1;cy++) for(let cx=cx0;cx<=cx1;cx++){ const key=(cx+512)*4096+(cy+512); let C=V.ch.get(key);
    if(!C){ if(V.fade>0 && performance.now()-t0>4) continue; C=townChunk(V,cx,cy); } else C.u=V.fr;          // (arriving: ≤ 4 ms of baking a frame, behind the fade)
    pctx.drawImage(C.cv,C.X+TOX,C.Y+TOY); }
  { const B=TUNE.townBudget; let n=0; if(B>0 && !(V.fade>0)) for(let cy=cy0-1;cy<=cy1+1 && performance.now()-t0<B;cy++) for(let cx=cx0-1;cx<=cx1+1;cx++){ if(V.ch.has((cx+512)*4096+(cy+512))) continue; townChunk(V,cx,cy); if(++n>=2||performance.now()-t0>B) break; } }   // (the ring round the view, a little each frame)
  townWaterAnim(V);
  for(let cy=cy0;cy<=cy1;cy++) for(let cx=cx0;cx<=cx1;cx++){ const C=V.ch.get((cx+512)*4096+(cy+512)); if(C&&C.fo) pctx.drawImage(C.fo[fo],C.X+TOX,C.Y+TOY); }
  if(V.rd && V.rd.length){ for(const q of V.rd){ const a=0.95*(1-q.t/q.life), x=TX(q.x+q.vx*q.t), y=TY(q.y+q.vy*q.t);   // (PT1 W3) the run's dust — on the ground, under whatever stands
      pctx.globalAlpha=a*0.5; pctx.fillStyle='#5e5040'; pctx.fillRect(x,y+1,2,1); pctx.globalAlpha=a; pctx.fillStyle='#e8dcc4'; pctx.fillRect(x,y,2,1); } pctx.globalAlpha=1; }   // (G1 fix: 2×1 pale motes over a faint shadow — they read on dark earth and pale stone alike)
  // what stands up — y-sorted
  TDRN=0; const vx0=icamX-IW/2-60, vx1=icamX+IW/2+60, vy0=icamY-IH/2-30, vy1=icamY+IH/2+170;
  for(let i=0;i<P.blds.length;i++){ const b=P.blds[i]; tdr((b.y0+b.h)*20-2,1,b,i); }
  for(const t of V.trees){ if(t.x<vx0||t.x>vx1||t.y<vy0||t.y>vy1) continue; tdr(t.y,2,t,0); }
  for(const p of P.props){ if(p.x<vx0-80||p.x>vx1+80||p.y<vy0||p.y>vy1+40) continue; tdr(p.y,3,p,0); }
  for(const n of P.npcs){ if(n.x<vx0||n.x>vx1||n.y<vy0||n.y>vy1) continue; tdr(n.y,4,n,0); }
  if(P.folk) for(const n of P.folk){ if(n.inside||n.x<vx0||n.x>vx1||n.y<vy0||n.y>vy1) continue; tdr(n.y,10,n,0); }   // (the named folk — w4)
  for(const a of scnActorsHere()) tdr(a.y,40,a,0);   // (INTROSTORY C3: Nell, Bert & a scene's people)
  if(!P.pt) for(let ci=1;ci<crew.length;ci++){ const cp=crewAshorePos(ci); tdr(cp.y,5,cp,ci); }   // (the grounds: no crew on the jetty)
  tdr(player.y,6,null,0);
  tdr(P.boatY+18,7,null,0);
  for(let i=0;i<1+P.SZ;i++) tdr((P.H-2.6)*20+4,8,null,i);
  for(let tx=0;tx<P.W;tx++){ if(tx%4!==1||P.tiles[(P.H-6)*P.W+tx]!==PT_DOCK) continue; tdr((P.H-5)*20-1,9,null,tx); }
  const D=TDR; for(let i=1;i<TDRN;i++){ const o=D[i]; let j=i-1; while(j>=0 && D[j].y>o.y){ D[j+1]=D[j]; j--; } D[j+1]=o; }   // (insertion sort: the order barely changes frame to frame)
  V.bob=Math.sin(itime*1.6)>0.35?1:0;
  for(let i=0;i<TDRN;i++){ const o=D[i];
    switch(o.k){
      case 1: drawBldT(V,o.a,o.b); break;
      case 2: { const t=o.a, s=townTreeSpr(V,t.kind,t.v); pctx.drawImage(s.cv,TX(t.x)-s.ax,TY(t.y)-s.ay); break; }
      case 3: drawPropT(V,o.a,night); break;
      case 4: { const n=o.a, dir=folkDir(n.fx||0,n.fy||1); drawFolk(n.x,n.y,n.look,dir,walkFr(n.mv,n.ph*2.6)); if(n.lant) townLantern(n.x,n.y,dir,n.mv?n.ph:0); break; }
      case 5: { const cp=o.a, m=crew[o.b], dx=player.x-cp.x, dy=player.y-cp.y, near=dx*dx+dy*dy<90*90; let dir=near?folkDir(dx,dy):[0,0,2,0,3,0][(Math.floor(itime/2.5)+o.b)%6];
        drawFolk(cp.x,cp.y,crewLook(m),dir,0); break; }
      case 6: drawFolk(player.x,player.y,playerLook(),folkDir(player.fx,player.fy),walkFr(player.moving,player.wph||0)); if(nightK()>0.45) townLantern(player.x,player.y,folkDir(player.fx,player.fy),player.moving?itime*1.7:0); break;
      case 7: { const f=Math.floor(itime*3)%2, o2=boatSprT(V,f), X=TX(P.boatX), Y=TY(P.boatY)+V.bob, sh=tProp(V,'boatsh|'+livSig(), ()=>{ const c=document.createElement('canvas'); c.width=o2.cv.width; c.height=o2.cv.height; const g=c.getContext('2d'); g.drawImage(o2.cv,0,0); g.globalCompositeOperation='source-in'; g.fillStyle='#061018'; g.fillRect(0,0,c.width,c.height); return {cv:c}; });   // (PT1 B8: her look in the key)
        pctx.globalAlpha=0.3; pctx.drawImage(sh.cv,X-o2.ax+3,Y-o2.ay+2); pctx.globalAlpha=1;                                                  // her shadow on the water (the light's top-left)
        pctx.drawImage(o2.cv,X-o2.ax,Y-o2.ay); const fw=Math.floor(itime*3)%3; pctx.fillStyle='rgba(240,250,255,0.8)'; pctx.fillRect(X-13-(fw===1?1:0),Y-6,2,1); pctx.fillRect(X+12+(fw===2?1:0),Y+2,2,1); pctx.fillRect(X-12,Y+10+(fw===0?1:0),1,2); pctx.fillRect(X-2,Y+19+5*livStg(),4,1); break; }
      case 8: { const i2=o.b, dxw=(5+i2*9+((P.core.idx+i2*7)%6))*20, dyw=(P.H-2.6)*20, s=dinghySpr(V,i2+P.core.idx), X=TX(dxw), Y=TY(dyw)+(Math.sin(itime*1.4+i2*2.1)>0.2?1:0); if(X<-30||X>IW+30) break; pctx.drawImage(s.cv,X-s.ax,Y-s.ay); break; }
      case 9: { const s=bollardSpr(V); pctx.drawImage(s.cv,TX(o.b*20+10)-s.ax,TY((P.H-5)*20-1)-s.ay); break; }
      case 10: drawFolkN(o.a); break;
      case 40: scnDrawActor(o.a); break;
    } }
  townAmbDraw(V,false);
  for(let g=0;g<3;g++){ const ga=itime*(0.5+g*0.11)+g*2.1, gx=P.W*20*0.5+Math.cos(ga)*(P.W*20*0.22), gy=(P.H-7)*20+Math.sin(ga*1.3)*30-40-g*14, X=TX(gx), Y=TY(gy); if(X<-20||X>IW+20) continue;   // gulls wheel over the harbour
    const s=gullSpr(Math.floor(itime*6+g)%3); pctx.drawImage(s.cv,X-s.ax,Y-s.ay); }
  townLightPass(V);
  townWeather();
  folkMarks();                                     // 💬 / ❗ over the named folk (after the light: they read at night)
  if(V.fade>0){ pctx.fillStyle='rgba(8,10,14,'+(V.fade/12).toFixed(3)+')'; pctx.fillRect(0,0,IW,IH); let all=true; for(let cy=cy0;cy<=cy1&&all;cy++) for(let cx=cx0;cx<=cx1;cx++) if(!V.ch.has((cx+512)*4096+(cy+512))){ all=false; break; } if(all) V.fade--; }
}
function townLantern(x,y,dir,ph){ const X=TX(x)+(dir===2||dir===1?-5:5), Y=TY(y)-7+(Math.sin(ph*5.2)>0.3?1:0);   // a hand lantern, swinging a little with the stride (lit after dark)
  pctx.fillStyle='#2a2420'; pctx.fillRect(X-1,Y-4,3,1); pctx.fillRect(X,Y-5,1,1); pctx.fillStyle='#3a3430'; pctx.fillRect(X-1,Y-3,3,4); pctx.fillStyle='#ffd070'; pctx.fillRect(X,Y-2,1,2); }
function drawBldT(V,b,i){ const o=V.bs[i], X=TX(b.x0*20)-o.ox, Y=TY(b.y0*20)-o.oy; if(X>IW||Y>IH||X+o.cv.width<0||Y+o.cv.height<0) return;
  pctx.drawImage(o.cv,X,Y);
  if(o.sign){ const f=Math.round(Math.sin(itime*1.3+i*1.7+(env.storm*itime*3))*(1+env.storm)); const s=signSpr(o.sign.icon,clamp(f,-1,1)); pctx.drawImage(s.cv,X+Math.round(o.sign.x)-s.ax,Y+o.sign.y); }
  if(o.chim && (b.kind==='tavern'||b.kind==='home'||o.forge||env.L<0.62||V.ST.snow||(i%3===0))){ const cx=X+o.chim[0], cy=Y+o.chim[1], fg=!!o.forge, N=fg?6:4;   // chimney smoke: pixel puffs, drifting with the wind (C7b: the forge's darker & thicker, sparks in it)
    for(let k=0;k<N;k++){ const pr=((itime*(fg?0.36:0.28)+b.x0*0.37+k/N)%1), q=(fg?2:1)+Math.round(pr*3), dxw=Math.round(Math.sin(itime*0.9+k*2)*1.5*pr+Math.cos(wind.a)*pr*10);
      pctx.globalAlpha=(fg?0.62:0.5)*(1-pr); pctx.fillStyle=fg?(pr<0.3?'#8a8488':'#5e5a62'):(pr<0.3?'#c8c4c8':'#9a98a2'); pctx.fillRect(cx-(q>>1)+dxw,cy-2-Math.round(pr*(fg?30:24)),q,q);
      if(fg && k<2){ const sp=(itime*0.9+k*0.5+b.x0*0.1)%1; pctx.globalAlpha=1-sp; pctx.fillStyle=sp<0.4?'#ffd060':'#ff7a2a'; pctx.fillRect(cx+Math.round(Math.sin(itime*3+k*3)*2+Math.cos(wind.a)*sp*6),cy-1-Math.round(sp*16),1,1); } } pctx.globalAlpha=1; }
  if(o.furnR){ const q=o.furnR; for(let k=0;k<3;k++){ const t=Math.floor(itime*(7+k*2.3)+k*5+i)%Math.max(1,q[2]); pctx.fillStyle=(Math.floor(itime*11+k)&1)?'#fff0a0':'#ffc050'; pctx.fillRect(X+q[0]+t,Y+q[1]+(k&1),1,1); } } }   // (the coals flicker by day too)
function drawPropT(V,p,night){ const P=PRT;
  switch(p.k){
    case 'lamp': { const o=lampSprT(V,false); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)-o.ay); return; }
    case 'crate': { const o=crateSpr(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)-o.ay); return; }
    case 'barrel': { const o=barrelSpr(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)-o.ay); return; }
    case 'stall': { const o=stallSpr(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)-o.ay); return; }
    case 'well': { const o=wellSpr(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)+6-o.ay); return; }
    case 'board': { const o=boardSpr(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)+2-o.ay); return; }
    case 'fountain': { const o=fountainSpr(V,Math.floor(itime*4)%3), X=TX(p.x), Y=TY(p.y)+10; pctx.drawImage(o.cv,X-o.ax,Y-o.ay);
      pctx.fillStyle='#e8f8ff'; for(let k=0;k<6;k++){ const ph=(itime*1.5+k/6)%1, a=(k-2.5)*0.5, dx=Math.round(Math.sin(a)*ph*14), dy=Math.round(-28+ph*ph*20-ph*6*(1-ph)); pctx.globalAlpha=1-ph*0.6; pctx.fillRect(X+dx,Y+dy,1,1); } pctx.globalAlpha=1; return; }
    case 'monument': { const o=monumentSpr(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)+10-o.ay); return; }
    case 'lighthouse': { const o=lighthouseSpr(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)-o.ay); return; }
    case 'buoy': { const o=buoySpr(V), X=TX(p.x), Y=TY(p.y)+(Math.sin(itime*1.8+(p.ph||0))>0?1:0), rr=Math.floor(itime*2+(p.ph||0))%3; pctx.fillStyle='rgba(230,246,255,0.6)'; pctx.fillRect(X-4-rr,Y+1,2,1); pctx.fillRect(X+3+rr,Y+1,2,1); pctx.drawImage(o.cv,X-o.ax,Y-o.ay); return; }
    case 'rope': { const o=townRopeSpr(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)-o.ay); return; }
    case 'anchor': { const o=anchorSprT(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)-o.ay); return; }
    case 'nets': { const o=netsSpr(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)-o.ay); return; }
    case 'cat': { const o=catSpr(V,Math.sin(itime*2+(p.ph||0))>0.2?1:0); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)-o.ay); return; }
    case 'helm': { const o=helmSpr(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)+8-o.ay); return; }                 // (the Proving Harbour's furniture — §13)
    case 'anvil': { const o=anvilSpr(V); pctx.drawImage(o.cv,TX(p.x)-o.ax,TY(p.y)-o.ay); return; }                  // (C7b the forge's yard)
    case 'quench': { const o=quenchSpr(V), X=TX(p.x), Y=TY(p.y); pctx.drawImage(o.cv,X-o.ax,Y-o.ay);
      const st=(itime*0.45+p.x*0.01)%3; if(st<1){ pctx.globalAlpha=0.55*(1-st); pctx.fillStyle='#e8eef4'; pctx.fillRect(X-2+Math.round(Math.sin(itime*2)*1),Y-o.ay-2-Math.round(st*9),2,2); pctx.fillRect(X+1,Y-o.ay-5-Math.round(st*7),1,1); pctx.globalAlpha=1; } return; }   // (a wisp of steam off the quench now & then)
  } }
/* THE HELM STONE (§13 · C6a in every port): a standing stone carved with a ship's wheel — the passive tree's respec stone · (C7b) THE FORGE'S YARD:
   the anvil on its oak stump · the quench barrel, tongs standing in it */
function anvilSpr(V){ return tProp(V,'anvil', ()=>{ const S=PS(20,16), I=cIR(['#16181e','#2c3038','#4a505a','#7a8290','#b8c0cc']), W=tRamp('#7a5234');
  pR(S,6,9,8,6,W[2]); pR(S,6,9,2,6,W[4]); pR(S,13,9,1,6,W[1]); pR(S,6,9,8,1,W[3]); for(let x=7;x<13;x+=2) psP(S,x,11,W[1]);   // the stump
  pR(S,1,2,16,3,I[3]); pR(S,1,2,16,1,I[4]); pR(S,0,3,2,1,I[3]); psP(S,0,2,I[2]); pR(S,17,2,2,2,I[2]);                  // the face, its horn to the left, the heel right
  pR(S,5,5,9,2,I[2]); pR(S,7,7,5,2,I[1]); pR(S,5,5,9,1,I[3]); psP(S,14,3,cI('#ffc050'));                                 // the waist & feet · a glint of hot iron on the face
  return tOut(S,10,15); }); }
function quenchSpr(V){ return tProp(V,'quench', ()=>{ const S=PS(12,18), B=tRamp('#6a4424'), H=cI('#34302e'), Wt=cIR(['#1a3448','#2a5470','#6a9ab8']), I=cI('#4a505a');
  pR(S,5,0,1,6,I); pR(S,7,1,1,5,I); psP(S,4,0,I); psP(S,8,1,I);                                                         // tongs standing in it
  for(let y=5;y<18;y++) for(let x=0;x<12;x++){ const e=(y===5||y===17)&&(x<2||x>9); if(e) continue; let v=x<2?4:x>9?1:x===2?4:3; psP(S,x,y,B[v]); }
  pR(S,1,6,10,2,Wt[1]); pR(S,2,6,6,1,Wt[2]); psP(S,9,7,Wt[0]); pR(S,1,9,10,1,H); pR(S,1,14,10,1,H);                      // the dark water · the hoops
  return tOut(S,6,17); }); }
function helmSpr(V){ return tProp(V,'helm', ()=>{ const S=PS(24,42), Q=tRamp(mixHex(V.ST.stone,'#8a96a8',0.35)), G=cIR(['#1e4a52','#2e7a80','#5ec8c0','#b8fff0']), M=cIR(['#3a5a2a','#5a7a3a']);
  pR(S,2,36,20,5,Q[1]); pR(S,2,36,20,1,Q[3]); pR(S,3,40,18,1,Q[0]);                                                   // the plinth
  psPoly(S,[[5,37],[4,14],[6,6],[10,2],[14,2],[18,6],[20,14],[19,37]],(x,y)=>{ const l=x<9?4:x>15?2:3; return Q[(x+y*3)%11===0?l-1:l]; });   // the stone, lit from the top-left
  pR(S,5,14,1,22,Q[4]); pR(S,18,12,1,24,Q[1]);
  const cx=12, cy=19; for(let a=0;a<8;a++){ const an=a*TAU/8; psLine(S,cx,cy,cx+Math.cos(an)*6,cy+Math.sin(an)*6,G[1],1); }   // the carved helm: 8 spokes, a rim, a hub
  psDisc(S,cx,cy,4.5,4.5,(nx,ny)=>nx*nx+ny*ny>0.55?G[2]:0); psDisc(S,cx,cy,1.5,1.5,()=>G[3]);
  for(let a=0;a<8;a++){ const an=a*TAU/8; psP(S,cx+Math.round(Math.cos(an)*7),cy+Math.round(Math.sin(an)*7),G[2]); }
  for(const [x,y] of [[6,33],[7,34],[17,31],[18,32],[16,35]]) psP(S,x,y,M[1]); pR(S,5,35,4,1,M[0]);                    // moss at its foot
  return tOut(S,12,40); }); }
/* where people can stand (for the townsfolk's schedules, w4): {k, x, y} in world units — every shop door, the board, the well,
   the square (and its fountain/monument), the quay, the jetty's end, the lanes to the water, a bench of grass by the trees */
function townSpots(){ const P=PRT; if(!P) return []; const TS=P.TS, S=[], px0=(P.W>>1)-5;
  for(const a of P.acts) S.push({k:a.kind, x:a.x, y:a.y});
  S.push({k:'square', x:(px0+3)*TS, y:(P.H-12.4)*TS}); S.push({k:'well', x:(px0+1.5)*TS, y:(P.H-12.4)*TS});
  for(let i=0;i<4;i++) S.push({k:'street', x:(4+i*(P.W-8)/3)*TS, y:(P.H-10)*TS});
  for(let i=0;i<3;i++) S.push({k:'quay', x:(4+i*(P.W-8)/2)*TS, y:(P.H-6.4)*TS});
  S.push({k:'jetty', x:(P.jx+1)*TS, y:(P.H-3.4)*TS});
  for(const cx2 of [6,P.W-9]) S.push({k:'lane', x:(cx2+1)*TS, y:(P.H-7.6)*TS});
  return S; }
