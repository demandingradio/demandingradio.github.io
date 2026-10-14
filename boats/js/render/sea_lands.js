"use strict";
/* FILE: js/render/sea_lands.js
The sea in pixels: each isle's land seen from the sea, baked into chunk canvases in its crawl biome (THE LANDS FROM THE SEA),
then the water, the pixel harbours, the claimed isles, the wake and the boat in her livery.
Moved verbatim from original lines 8204-8668 (build 5109cd5); loads in place, right after the sea tick.
Entry points: drawSea (from frameInner; it calls slDraw), slGlow (frameInner, after the world tint), slGlowStamp (the seas' glows),
  slPortBiome (towns, folk, stalls, chart), drawPorts, drawCleared, drawWake, drawBoat (the sea draw list in frameInner),
  drawBoatInto (also the Ship's Plans livery preview), portWaterDir (docking), portLabelUp (island labels),
  and the shared camera helpers iscale and w2pix (used by the seas, the saga, scenes, audio panning and more).
Globals it owns: SB, SB_T, SB_B, SB_X, cIRw, SBI, SL_E, SLS, slPortBiome, SL_SZ, slSpr, slShd, slBake, slBakeGen, slPrep,
  slSpecial, SL_FX, slRows, slFinish, slDraw, SL_GC, slGlowStamp, slGlow, iscale, drawSea, w2pix, PORT_CLR, slPortClear,
  portWaterDir, hbRoofC, hbWallC, hbHouse, HB_LAY, harbourSpr, portLabelUp, PGL, drawPortsPx, drawPorts, drawCleared,
  drawWake, drawBoat, drawBoatInto, livSeaSail, livSeaCloth, livPennant.
Globals it reads from elsewhere: TUNE, BIOMES, TB, TR_SIZE, BAY4, SEA, SEAS, TILE_W, CHUNK, time, wind, env, mapOpen, camX, camY,
  pctx, ctx, IW, IH, CSSW, CSSH, cores, boat, wake, crew, SHIP, homePortIdx, the world helpers (coresNear, heightCell, heightAt,
  biomeOf, portSizeOf), the noise and texel kit (hash2, vnoise, PS, psP, psCv, cIA, bayV), the crawl's tree painters
  (paintTree, trBoulder, drReeds), the towns' kit (TOWN_ST, THATCH, tRamp) and the livery helpers (livCols, livLenK, livMasts:
  original lines 31435-31437 (build 5109cd5)).
Load-time statements: SB_X (original line 8250 (build 5109cd5)) calls cIRw, declared on the next line in this same file
  (hoisting: keep them together); SL_E and SLS (original line 8255 (build 5109cd5)) are plain inits. The rest are function
  declarations and const with pure literal initialisers (SB, SB_T, SB_B, SL_SZ, SL_FX, SL_GC, PORT_CLR, HB_LAY, PGL).
Called at runtime only (frames; buildWorld clears SLS). SB gets runtime caches written onto it (SB[key]._i): never clone it.
*/
/* ======================== THE LANDS FROM THE SEA (w1) ========================
   Every isle's land wears her crawl biome from the masthead. Land is BAKED per height chunk (32×32 tiles) into a canvas at the
   sea's own buffer scale (1 px = 1 buffer px, on one global pixel grid so neighbouring chunks meet seamlessly): bilinear heights
   give organic contour bands inside the land tiles — B beach · L low · M mid (the forest floor) · H high · P peak — dithered (the
   4×4 Bayer) between each biome's 4-shade ramps, hill-shaded from the top-left, patch-textured, flecked (flowers, embers, spores,
   crystal grit), with each biome's own trick (an atoll's turquoise lagoon · a caldera's crater & lava rivers · the mire's pools ·
   the dunes' wind ripples & sandstone mesas · snow caps), then dressed with tiny pixel props — each biome's OWN trees from the
   crawl's painters (paintTree), rocks, reeds, vents. THE COASTLINE IS UNTOUCHED: a land tile is land exactly as ever (the height
   field, collision & the water pass are unchanged — the water loop now just skips land tiles and the chunk canvases go on top).
   Where two isles' land meets, each tile goes to the core with the greater influence (a hashed jitter dithers the seam); ports
   keep their town look and take the biome of the nearest wild isle. At night lava, glowing caps, crystal & embers glow (drawn
   additively after the night tint — slGlow); vents & craters smoke. Chunks bake lazily (the visible ones at once, then a ring round
   the view within TUNE.seaBudget ms a frame), LRU-capped; a new sea scale (zoom / window) or a moved knob re-bakes.
   TUNE: seaLand (0 = the old flat bands) · seaProps · seaTree · seaHill · seaTex · seaGlow · seaBudget. */
const SB={   // per biome: B L M H P ramps (dark → light) · t band tops (height/1.1) · pr props per band [[kind,w]] · pd prop density per band · sp specks {c, d, b bands, g glow kind} · fx its own trick
  tropic:{B:['#c8b27e','#d8c28e','#e6d09e','#f2e0b4'], L:['#3e8a3e','#4c9a46','#5eac50','#76be5e'], M:['#2a6a34','#327638','#3c843e','#489246'], H:['#566e48','#667e56','#788e66','#8c9e78'], P:['#7a7a6a','#8c8c7c','#a0a090','#b6b6a4'],
    pr:{B:[['palm',1]], L:[['palm',0.45],['broad',0.55]], M:[['broad',0.6],['palm',0.4]], H:[['broad',0.5],['rock',0.5]], P:[['rock',1]]}, pd:[0.05,0.12,0.72,0.22,0.08], sp:{c:['#f8f0f0','#f4a0b8'],d:0.003,b:1}},
  savanna:{B:['#c4ac78','#d4bc86','#e2ca96','#eed8a8'], L:['#a09448','#b0a454','#c0b462','#d0c472'], M:['#86863c','#949446','#a4a250','#b4b25e'], H:['#8a7a58','#9a8a66','#ac9c76','#beae88'], P:['#9a8a70','#aa9a80','#bcac92','#cebea4'],
    pr:{L:[['acacia',0.5],['dgrass',0.5]], M:[['acacia',0.65],['dgrass',0.2],['scrub',0.15]], H:[['rock',0.6],['scrub',0.4]], P:[['rock',1]]}, pd:[0,0.09,0.32,0.16,0.08], sp:{c:['#6e6a34','#c8b870'],d:0.01,b:1}},
  moor:{B:['#8a8676','#9c9888','#aeaa9a','#c0bcac'], L:['#5a7650','#668258','#728e62','#809c6e'], M:['#46644a','#506e52','#5a7a5a','#668664'], H:['#666a5e','#76786c','#88887c','#9a9a8e'], P:['#c4ccd4','#d8e0e8','#eaf0f4','#ffffff'],
    pr:{L:[['heather',0.7],['gnarl',0.3]], M:[['gnarl',0.7],['heather',0.3]], H:[['rock',0.8],['heather',0.2]]}, pd:[0,0.16,0.55,0.18,0], sp:{c:['#9a64b8','#c08ad8'],d:0.012,b:1}},
  ember:{B:['#c4ac80','#d4bc90','#e2caa0','#eed6b0'], L:['#8a8840','#9a9848','#aaa652','#bab45c'], M:['#7a5a2a','#886430','#987036','#a87c3e'], H:['#7a6a58','#8a7a68','#9c8c7a','#ae9e8c'], P:['#8e8a82','#a09e96','#b4b2aa','#c8c6be'],
    pr:{L:[['oak',0.6],['broad',0.4]], M:[['oak',0.85],['broad',0.15]], H:[['oak',0.35],['rock',0.65]], P:[['rock',1]]}, pd:[0,0.14,0.78,0.2,0.06], sp:{c:['#d8823a','#c8602a','#e0a040'],d:0.01,b:1}},
  atoll:{B:['#e8dcc0','#f0e6d0','#f8f0e0','#ffffff'], L:['#5aaa5a','#68b864','#7ac66e','#8ed47c'], M:['#3e8e4a','#489a52','#54a65c','#62b266'], H:['#d8ceb0','#e2d8be','#ece4ce','#f6f0e0'], P:['#d8ceb0','#e2d8be','#ece4ce','#f6f0e0'],
    pr:{B:[['palm',1]], L:[['palm',0.75],['scrub',0.25]], M:[['palm',0.8],['scrub',0.2]], H:[['palm',1]], P:[['palm',1]]}, pd:[0.12,0.22,0.6,0.1,0.1], sp:{c:['#f4c8c0','#ffffff'],d:0.006,b:0}, fx:'lagoon'},
  meadow:{B:['#ccb888','#dac696','#e6d4a6','#f0e0b6'], L:['#66b04a','#76be56','#88ca62','#9cd670'], M:['#4e9a40','#58a648','#62b250','#6ebe5a'], H:['#789858','#88a666','#98b474','#a8c284'], P:['#98a888','#a8b898','#b8c6a8','#c8d4b8'],
    pr:{L:[['orchard',1]], M:[['orchard',0.6],['broad',0.4]], H:[['broad',0.5],['rock',0.5]], P:[['rock',1]]}, pd:[0,0.07,0.5,0.14,0.06], sp:{c:['#f08aa6','#ffd23f','#ffffff','#b49aff'],d:0.03,b:1}},
  boulder:{B:['#a8a490','#b6b29e','#c6c2ae','#d6d2c0'], L:['#6a7e58','#768a62','#849870','#92a67e'], M:['#5a7050','#627a56','#6c8660','#78926a'], H:['#6e7274','#7e8284','#909496','#a4a8aa'], P:['#8a8e90','#9ca0a2','#b0b4b6','#c6caca'],
    pr:{L:[['boulder',0.7],['scrub',0.3]], M:[['boulder',0.5],['scrub',0.3],['gnarl',0.2]], H:[['boulder',1]], P:[['boulder',1]]}, pd:[0,0.16,0.42,0.34,0.2], sp:{c:['#b8b8a8','#8a8a7c'],d:0.012,b:1}},
  frost:{B:['#a4c4da','#b8d4e8','#cee2f2','#e6f2fc'], L:['#bccad8','#ccd8e4','#dce6f0','#eef4fa'], M:['#aebcce','#c0ccdc','#d2dce8','#e4ecf4'], H:['#8a9cb0','#9cb0c2','#b2c2d4','#c8d6e4'], P:['#dae4ee','#e8eef6','#f4f8fc','#ffffff'],
    pr:{L:[['spine',1]], M:[['spine',0.9],['boulder',0.1]], H:[['boulder',0.6],['spine',0.4]]}, pd:[0,0.12,0.68,0.2,0], sp:{c:['#ffffff'],d:0.006,b:1,g:0}},
  scorch:{B:['#383432','#46423e','#56504c','#66605a'], L:['#4a4440','#56504a','#625a54','#6e665e'], M:['#3a3432','#44403c','#4e4844','#5a534e'], H:['#5a524c','#6a625a','#7a7068','#8a8078'], P:['#6a605a','#7a706a','#8a807a','#9a908a'],
    pr:{L:[['snag',0.6],['char',0.4]], M:[['char',0.5],['snag',0.3],['obsid',0.2]], H:[['obsid',0.6],['rock',0.4]], P:[['obsid',1]]}, pd:[0,0.12,0.55,0.2,0.1], sp:{c:['#ff8a3c','#ffc060'],d:0.008,b:1,g:1}},
  crystal:{B:['#5a6478','#6a7488','#7a8498','#8a94a8'], L:['#2e5a62','#36666e','#3e727a','#488088'], M:['#244a54','#2a545e','#305e68','#386a74'], H:['#3a4a6a','#44567a','#4e628a','#5a6e9a'], P:['#6a7aa8','#7a8ab8','#8c9cc8','#a0b0d8'],
    pr:{L:[['spire',0.5],['conifer',0.5]], M:[['conifer',0.6],['spire',0.4]], H:[['spire',1]], P:[['spire',1]]}, pd:[0,0.12,0.6,0.3,0.2], sp:{c:['#8de9ff','#c9a6ff'],d:0.01,b:1,g:2}},
  dunes:{B:['#c8a66a','#d6b67a','#e4c68a','#f0d69c'], L:['#c09a5a','#ceaa66','#dcb874','#e8c684'], M:['#b88e50','#c69c5a','#d4aa66','#e0b874'], H:['#8a4e2e','#a0603a','#b87448','#ce8a5a'], P:['#9a5a36','#b06c42','#c68050','#da9662'],
    pr:{B:[['datepalm',1]], L:[['cactus',0.65],['datepalm',0.35]], M:[['datepalm',0.5],['cactus',0.5]], H:[['mesa',1]], P:[['mesa',1]]}, pd:[0.015,0.045,0.07,0.1,0.08], sp:{c:['#a07848','#fff0c0'],d:0.006,b:1}, fx:'dunes', t:[0.07,0.3,0.62,0.8]},
  swamp:{B:['#2e3a2a','#384632','#44523c','#526046'], L:['#3e5a34','#48663c','#547244','#607e4e'], M:['#2e4a30','#365436','#3e5e3c','#486a44'], H:['#566a4a','#627654','#6e8260','#7a8e6c'], P:['#6a7a60','#76866c','#829278','#8e9e84'],
    pr:{B:[['reeds',0.7],['mangrove',0.3]], L:[['mangrove',0.4],['cypress',0.3],['reeds',0.3]], M:[['mangrove',0.5],['cypress',0.5]], H:[['cypress',1]], P:[['cypress',1]]}, pd:[0.2,0.16,0.3,0.26,0.2], sp:{c:['#f4f0e0','#e8d86a'],d:0.006,b:1,g:5}, fx:'bog'},
  bamboo:{B:['#b8ac7a','#c6ba88','#d4c896','#e0d6a6'], L:['#58a03e','#66ae46','#76bc50','#88ca5c'], M:['#3e8030','#468a36','#4e943c','#58a044'], H:['#5a7a4a','#688856','#769662','#84a470'], P:['#7a8a6a','#889878','#96a686','#a4b494'],
    pr:{L:[['bamboo',0.8],['broad',0.2]], M:[['bamboo',1]], H:[['bamboo',0.6],['rock',0.4]], P:[['rock',1]]}, pd:[0,0.2,0.85,0.3,0.1], sp:{c:['#c8d870','#f4f4f4'],d:0.006,b:1}},
  mushroom:{B:['#8a8090','#9a90a0','#aaa0b0','#bab0c0'], L:['#5a4a72','#665480','#725e8c','#806a9a'], M:['#4a3c62','#54446e','#5e4c7a','#6a5686'], H:['#6a5a6a','#786878','#867686','#948494'], P:['#9a8aa8','#aa9ab8','#baaac8','#cabad8'],
    pr:{L:[['gshroom',1]], M:[['gshroom',1]], H:[['gshroom',0.5],['rock',0.5]], P:[['rock',1]]}, pd:[0,0.04,0.17,0.12,0.06], sp:{c:['#c9a6ff','#8de9ff','#e8ff8a'],d:0.012,b:1,g:4}},
  volcanic:{B:['#1a1a1c','#242426','#2e2e30','#3a3a3c'], L:['#2e2a28','#3a3432','#46403c','#524a46'], M:['#262220','#302a28','#3a3430','#443c38'], H:['#3a3634','#4a4442','#5a5452','#6a6462'], P:['#2a2624','#3a3432','#4a4442','#5a5452'],
    pr:{L:[['ashtree',0.6],['basalt',0.4]], M:[['ashtree',0.5],['basalt',0.5]], H:[['basalt',0.7],['vent',0.3]], P:[['vent',1]]}, pd:[0,0.1,0.4,0.14,0.08], sp:{c:['#ff8a3c','#8a8480'],d:0.01,b:1,g:1}, fx:'lava'} };
const SB_T=[0.06,0.26,0.6,0.84], SB_B=['B','L','M','H','P'];
const SB_X={lag:cIRw(['#2aa8b8','#44bcc4','#62d0ce','#8ae2d8','#b8f2e6']), lava:cIRw(['#3a0a04','#8a200a','#e0501a','#ff9a30','#ffd870']), pool:cIRw(['#16241a','#1e3024','#2a402e','#6a8a6a']), mud:cIRw(['#2a2418','#3a3222'])};
function cIRw(A){ return A.map(h=>{ const v=parseInt(h.slice(1,7),16); return ((255<<24)|((v&255)<<16)|(v&0xff00)|((v>>16)&255))>>>0; }); }   // ('#rrggbb' → ImageData words — safe to call before the crawl's cI is up)
function SBI(i){ const b=BIOMES[i]||BIOMES[0], S=SB[b.key]||SB.tropic; if(S._i) return S._i;   // a biome's sea look, as ImageData words (once)
  const R=SB_B.map(k=>cIRw(S[k])), pr=SB_B.map(k=>S.pr[k]||null), pt=pr.map(L=>{ if(!L) return 0; let t=0; for(const q of L) t+=q[1]; return t; });
  return S._i={key:b.key, R, t:S.t||SB_T, pr, pt, pd:S.pd, sp:S.sp?{c:cIRw(S.sp.c), d:S.sp.d, b:S.sp.b, g:S.sp.g}:null, fx:S.fx||null, fxk:SL_FX[S.fx]||0}; }
const SL_E=new Float32Array(3), SLS={s:-1, sig:-1, m:new Map(), spr:new Map(), fr:0, vis:[], ox:0, oy:0, bakes:0, ms:0};   // the land chunks at this sea scale · their props' sprites
function slPortBiome(c){ if(c._pb) return c._pb; let best=null, bd=1e18; for(const q of coresNear(c.x,c.y,2600)){ if(q.port) continue; const d=(q.x-c.x)**2+(q.y-c.y)**2; if(d<bd){ bd=d; best=q; } } return c._pb=best?biomeOf(best):BIOMES[0]; }   // (a harbour's land: her nearest wild isle's)
const SL_SZ={gshroom:0.78, mangrove:0.86, cypress:0.9, bamboo:0.92};   // (a few kinds read better a touch smaller from the sea)
function slSpr(bk,kind,v,s){ const R=Math.max(2.4,(TR_SIZE[kind]||9)*(SL_SZ[kind]||1)*[0.84,1,1.17][((v/3)|0)%3]*s*TUNE.seaTree), Rq=Math.round(R*2)/2, key=bk+kind+v+'_'+Rq; let o=SLS.spr.get(key); if(o) return o;
  if(kind==='rock'){ const rk=(TB[bk]||TB.tropic).rk, C=rkRamp(rk==='crystal'?'crystone':rk==='obsidian'?'basalt':rk); o=trBoulder(Rq*0.75,C,null,v*7+3,{ol:C[0], strata:rk==='sandstone', snow:bk==='frost'||bk==='moor', moss:bk==='boulder'||bk==='tropic'||bk==='swamp'}); }
  else if(kind==='reeds') o=drReeds(Rq*0.8,v*5+1);
  else o=paintTree(bk,kind,v,Rq);
  o.R=Rq; SLS.spr.set(key,o); return o; }
function slShd(rx){ const key='sh'+rx; let o=SLS.spr.get(key); if(o) return o; const ry=Math.max(1,Math.round(rx*0.42)), S=PS(rx*2+2,ry*2+2), c=cIA('#0a1406',0.28); psDisc(S,rx+1,ry+1,rx,ry,()=>c); o=psCv(S,rx+1,ry+1); SLS.spr.set(key,o); return o; }
/* one chunk: tile data (heights, owner biome, coast distance) → the pixel pass → props → a canvas + its glow, smoke & twinkle points */
function slBake(cx,cy,s){ const g=slBakeGen(cx,cy,s); let r=g.next(); while(!r.done) r=g.next(); return r.value; }   // (all at once — a chunk the view needs NOW)
function* slBakeGen(cx,cy,s){ let tS=performance.now();                                                              // (a generator: the ring round the view bakes a few rows a frame, inside the budget — the hot loops live in plain functions so they optimise)
  const B=slPrep(cx,cy,s); if(!B) return {empty:true, u:SLS.fr};
  SLS.ms+=performance.now()-tS; yield; tS=performance.now();
  for(let y0=0;y0<B.H;y0+=24){ slRows(B,y0,Math.min(B.H,y0+24)); SLS.ms+=performance.now()-tS; yield; tS=performance.now(); }
  const C=slFinish(B); SLS.bakes++; SLS.ms+=performance.now()-tS; return C; }
/* the tile data: heights (with a margin), the owner isle & biome of each land tile, its distance from the water, the seam flags */
function slPrep(cx,cy,s){ const T=TILE_W, CT=CHUNK, MG=5, tx0=cx*CT-MG, ty0=cy*CT-MG, TW=CT+MG*2;
  const hh=new Float32Array(TW*TW); let land=false;
  for(let j=0;j<TW;j++) for(let i=0;i<TW;i++){ const h=heightCell(tx0+i,ty0+j); hh[j*TW+i]=h; if(h>=SEA && i>=MG-1 && j>=MG-1 && i<=MG+CT && j<=MG+CT) land=true; }
  if(!land) return null;
  const wcx=(cx*CT+CT/2)*T, wcy=(cy*CT+CT/2)*T, cand=coresNear(wcx,wcy,CT*T*0.75+520), nC=cand.length, cB=new Int16Array(nC);
  for(let q=0;q<nC;q++){ const c=cand[q]; cB[q]=BIOMES.indexOf(c.port?slPortBiome(c):biomeOf(c)); }
  const own=new Int16Array(TW*TW).fill(-1), bi=new Uint8Array(TW*TW), cd=new Uint8Array(TW*TW).fill(9), Q=[];
  for(let j=0;j<TW;j++) for(let i=0;i<TW;i++){ const k=j*TW+i; if(hh[k]<SEA){ cd[k]=0; Q.push(k); continue; }
    const wx=(tx0+i+0.5)*T, wy=(ty0+j+0.5)*T; let bm=-1, bv=0.035, nm=-1, nd=1e18;
    for(let q=0;q<nC;q++){ const c=cand[q], dx=wx-c.x, dy=wy-c.y, d2=dx*dx+dy*dy, inf=c.amp*Math.exp(-d2/(2*c.r*c.r))*(1+(hash2(tx0+i+q*31,ty0+j-q*17)-0.5)*0.34); if(inf>bv){ bv=inf; bm=q; } const dn=d2/(c.r*c.r); if(dn<nd){ nd=dn; nm=q; } }   // (the core whose hill this is — jittered, so a seam between two isles dithers)
    const q=bm>=0?bm:nm; if(q>=0){ own[k]=q; bi[k]=Math.max(0,cB[q]); } }
  const brd=new Uint8Array(TW*TW), s2=new Int16Array(TW*TW).fill(-1);                                                  // tiles within 2 of another isle's biome (only they need the seam's wander) · s2: that other isle
  for(let j=2;j<TW-2;j++) for(let i=2;i<TW-2;i++){ const k=j*TW+i; if(own[k]<0) continue; const b0=bi[k]; let m=0; for(let dj=-2;dj<=2 && !m;dj++) for(let di=-2;di<=2;di++){ const k2=k+dj*TW+di; if(own[k2]>=0 && bi[k2]!==b0){ m=1; s2[k]=own[k2]; break; } } brd[k]=m; }
  for(let h=0;h<Q.length;h++){ const k=Q[h], d=cd[k]+1; if(d>6) continue; const x=k%TW; for(const k2 of [x>0?k-1:-1, x<TW-1?k+1:-1, k-TW, k+TW]){ if(k2<0||k2>=TW*TW||cd[k2]<=d) continue; cd[k2]=d; Q.push(k2); } }   // tiles from the water (props keep off the swash)
  const P0x=Math.floor(cx*CT*T*s), P0y=Math.floor(cy*CT*T*s), W=Math.ceil(CT*T*s)+2, H=W;
  const colT=new Int32Array(W), colU=new Int32Array(W), colF=new Float32Array(W), rowT=new Int32Array(H), rowU=new Int32Array(H), rowF=new Float32Array(H);
  for(let x=0;x<W;x++){ const wx=(P0x+x+0.5)/s, u=wx/T-0.5; colT[x]=Math.floor(wx/T)-tx0; colU[x]=Math.floor(u)-tx0; colF[x]=u-Math.floor(u); }
  for(let y=0;y<H;y++){ const wy=(P0y+y+0.5)/s, u=wy/T-0.5; rowT[y]=Math.floor(wy/T)-ty0; rowU[y]=Math.floor(u)-ty0; rowF[y]=u-Math.floor(u); }
  const SBL=[]; for(let i=0;i<BIOMES.length;i++) SBL.push(SBI(i));
  const cxA=new Float32Array(nC), cyA=new Float32Array(nC), crA=new Float32Array(nC), ciA=new Int32Array(nC), laA=new Float32Array(nC), irA=new Float32Array(nC); for(let q=0;q<nC;q++){ cxA[q]=cand[q].x; cyA[q]=cand[q].y; crA[q]=cand[q].r; ciA[q]=cand[q].idx; laA[q]=Math.log(Math.max(1e-6,cand[q].amp||1)); irA[q]=1/(2*cand[q].r*cand[q].r); }
  return {s, cx, cy, T, TW, tx0, ty0, hh, own, bi, cd, brd, s2, laA, irA, cand, cB, nC, cxA, cyA, crA, ciA, P0x, P0y, W, H, img:new Uint32Array(W*H), colT, colU, colF, rowT, rowU, rowF, SBL,
    nP:nLat(26,301,P0x,P0y,W,H,s), nF:nLat(7,303,P0x,P0y,W,H,s), nL:nLat(90,305,P0x,P0y,W,H,s), nW1:nLat(15,307,P0x,P0y,W,H,s), nW2:nLat(15,309,P0x,P0y,W,H,s),   // (nW: the biome seam's wander)
    HK:16*TUNE.seaHill, TX:TUNE.seaTex, gl:[], tw:[], sm:[]}; }
/* a biome's own trick at a world point: 0 none · 1 lagoon · 2 lagoon rim · 3 lava · 4 lava crust · 7 crater rim (q = the owner isle's slot in the chunk's candidates) */
function slSpecial(B,fx,q,wx,wy,band,cdk,nl){ if(!fx || q<0) return 0; const dx=wx-B.cxA[q], dy=wy-B.cyA[q], r=B.crA[q], d=Math.sqrt(dx*dx+dy*dy)/r;
  if(fx===1){ if(cdk<2 || band<1) return 0; const lg=0.44+(nl-0.5)*0.14; return d<lg?1:d<lg+0.09?2:0; }                   // (an atoll: her lagoon & its white rim)
  if(fx===2){ if(band<1) return 0; const cr=0.24+(nl-0.5)*0.06; if(d<cr*0.62) return 3; if(d<cr*0.8) return 7; if(d>=1.45) return 0;   // (a caldera: her crater, and lava rivers down her flanks)
    const ci=B.ciA[q], th=Math.atan2(dy,dx), nr=2+(ci%2); for(let k=0;k<nr;k++){ const a=hash2(ci*7+k,91)*TAU+Math.sin(d*6+k*2.3)*0.28; let da=th-a; da-=Math.round(da/TAU)*TAU; const pp=Math.abs(da)*d*r, w=2.2+Math.max(0,1.3-d)*2.6;
      if(pp<w) return pp<w*0.5?3:4; } return 0; }
  return 0; }
const SL_FX={lagoon:1, lava:2, dunes:3, bog:4};
/* rows y0..y1 of the pixel pass — every land pixel: its band (bilinear height + a dithered wobble), hill shade, texture, the biome's trick & flecks */
function slRows(B,y0,y1){ const hh=B.hh, own=B.own, bi=B.bi, cd=B.cd, brd=B.brd, TW=B.TW, W=B.W, img=B.img, colT=B.colT, colU=B.colU, colF=B.colF, rowT=B.rowT, rowU=B.rowU, rowF=B.rowF, SBL=B.SBL,
    nP=B.nP, nF=B.nF, nL=B.nL, nW1=B.nW1, nW2=B.nW2, HK=B.HK, TX=B.TX, P0x=B.P0x, P0y=B.P0y, s=B.s, gl=B.gl, tw=B.tw, LAG=SB_X.lag, LAVA=SB_X.lava, POOL=SB_X.pool, MUD=SB_X.mud;
  for(let y=y0;y<y1;y++){ const tj=rowT[y], bv=rowU[y], fy=rowF[y], Y=P0y+y, row=y*W; if(tj<0||tj>=TW-1||bv<0||bv>=TW-1) continue;
    for(let x=0;x<W;x++){ const ti=colT[x]; if(ti<0||ti>=TW-1) continue; const k=tj*TW+ti; if(hh[k]<SEA) continue;         // water stays see-through (the animated sea is beneath)
      const bu=colU[x]; if(bu<0||bu>=TW-1) continue; let kb=k, qS=-1;
      if(brd[k]){ const q1=own[k], q2=B.s2[k];
        if(q1>=0 && q2>=0){ const wx=(P0x+x+0.5)/s, wy=(P0y+y+0.5)/s, ax=wx-B.cxA[q1], ay=wy-B.cyA[q1], bx=wx-B.cxA[q2], by2=wy-B.cyA[q2], lr=B.laA[q1]-(ax*ax+ay*ay)*B.irA[q1]-B.laA[q2]+(bx*bx+by2*by2)*B.irA[q2];
          qS=lr+((BAY4[(((P0y+y)&3)<<2)|((P0x+x)&3)]+0.5)/16-0.5)*0.9+(vnoise((P0x+x)*0.085,(P0y+y)*0.085)-0.5)*2+(vnoise((P0x+x)*0.3+7,(P0y+y)*0.3)-0.5)*0.6>0?q1:q2; }                  // where two isles meet: whose pull is stronger at this very texel (dithered — a fine, wandering seam)
        else { const wdx=Math.round((nS_(nW1,x,y)-0.5)*2.8), wdy=Math.round((nS_(nW2,x,y)-0.5)*2.8); if(wdx||wdy){ const wi=ti+wdx, wj=tj+wdy; if(wi>=0&&wj>=0&&wi<TW&&wj<TW){ const k2=wj*TW+wi; if(hh[k2]>=SEA && own[k2]>=0) kb=k2; } } } }
      const fx=colF[x], X=P0x+x, S=SBL[qS>=0?Math.max(0,B.cB[qS]):bi[kb]], k00=bv*TW+bu, h00=hh[k00], h10=hh[k00+1], h01=hh[k00+TW], h11=hh[k00+TW+1];
      const e=(h00+(h10-h00)*fx+(h01-h00)*fy+(h00-h10-h01+h11)*fx*fy)/1.1, sl=(h10-h00)*(1-fy)+(h11-h01)*fy+(h01-h00)*(1-fx)+(h11-h10)*fx, bay=(BAY4[((Y&3)<<2)|(X&3)]+0.5)/16-0.5;
      const np=nS_(nP,x,y), nf=nS_(nF,x,y), ej=e+(nf-0.5)*0.035+bay*0.02, t=S.t;
      const band=ej<t[0]?0:ej<t[1]?1:ej<t[2]?2:ej<t[3]?3:4; let v=1.6+sl*HK+(np-0.5)*1.3*TX+(nf-0.5)*0.5*TX+bay*0.9;
      if(e<0.004) v-=1.2;                                                                                               // wet at the water's edge
      let col=0; const fxk=S.fxk;
      if(fxk===1||fxk===2){ const nl=nS_(nL,x,y), q=qS>=0?qS:own[kb], sp=slSpecial(B,fxk,q,(X+0.5)/s,(Y+0.5)/s,band,cd[k],nl);
        if(sp===1){ const dx=(X+0.5)/s-B.cxA[q], dy=(Y+0.5)/s-B.cyA[q], d=Math.sqrt(dx*dx+dy*dy)/B.crA[q], li=Math.floor(1+d*6+bay*0.8+(nf-0.5)*0.8); col=LAG[li<0?0:li>4?4:li]; if(hash2(X*3,Y*5)<0.01) tw.push(x,y); }   // an atoll's lagoon — turquoise, paler toward its sandy rim
        else if(sp===2){ const li=Math.floor(2.6+bay*0.8); col=S.R[0][li>3?3:li]; }
        else if(sp===3){ const li=Math.floor(2.2+(nf-0.5)*2.2+bay*0.9+(np>0.6?1:0)); col=LAVA[li<1?1:li>4?4:li]; if(hash2(X*7+1,Y*3+5)<0.045) gl.push(x,y,1); }   // molten: a crater's pool, the rivers down her flanks
        else if(sp===4){ const li=Math.floor(0.6+bay*1.2+(nf>0.6?1:0)); col=LAVA[li<0?0:li>2?2:li]; }
        else if(sp===7){ const dx=(X+0.5)/s-B.cxA[q], dy=(Y+0.5)/s-B.cyA[q], lit=-(dx*0.6+dy*0.8)/Math.max(1,Math.hypot(dx,dy)), li=Math.floor(1.2+lit*1.4+(nf-0.5)*2+bay*1.2); col=li<=0?LAVA[0]:S.R[3][li>3?3:li]; } }   // (the crater's lip: broken rock lit from the top-left, glowing cracks)
      if(!col){
        if(fxk===3){ if(band>=1 && band<=2){ const q=Math.sin((X*0.62+Y*0.3)/s*0.33+nS_(nL,x,y)*11+np*2.5); v+=q>0.55?1.4:q<-0.25?-0.9:0; } else if(band>=3) v+=((Math.floor(e*40+nf*2))&1)?0.7:-0.5; }   // the dunes' wind ripples · a mesa's strata
        else if(fxk===4 && (band===1||band===2) && cd[k]>=1){ const pq=nf*0.6+np*0.4; if(pq<0.37){ const li=Math.floor(pq*7+bay*0.8); col=POOL[li<0?0:li>2?2:li]; if(hash2(X*7,Y*3)<0.006) col=POOL[3]; } else if(pq<0.38) col=MUD[bay>0?1:0]; }   // the mire's pools & their muddy lips
        if(!col){ const li=Math.floor(v); col=S.R[band][li<0?0:li>3?3:li];
          const SP=S.sp; if(SP && band===SP.b && hash2(X*13+7,Y*17-3)<SP.d*TX){ col=SP.c[Math.floor(hash2(X,Y*3)*SP.c.length)]; if(SP.g!=null && hash2(X*5,Y*7)<0.25) gl.push(x,y,SP.g); } } }   // flecks: flowers, heather, embers, spores, grit
      img[row+x]=col; } } }
/* the canvas, then the props: each biome's trees (the crawl's own painters, tiny), rocks, reeds, vents — on a world lattice, shadows first, then y-sorted */
function slFinish(B){ const s=B.s, T=B.T, TW=B.TW, tx0=B.tx0, ty0=B.ty0, hh=B.hh, own=B.own, bi=B.bi, cd=B.cd, P0x=B.P0x, P0y=B.P0y, W=B.W, H=B.H, gl=B.gl, sm=B.sm, SBL=B.SBL;
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H; const g=cv.getContext('2d'); g.putImageData(new ImageData(new Uint8ClampedArray(B.img.buffer),W,H),0,0);
  const PSP=7, L=[], wx0=P0x/s-16, wx1=(P0x+W)/s+16, wy0=P0y/s-6, wy1=(P0y+H)/s+30, PC=[];
  for(let q=0;q<B.nC;q++){ const c=B.cand[q]; if(!c.port) continue; const R=PORT_CLR[portSizeOf(c)]||40, w=portWaterDir(c); PC.push([c.x,c.y,R*R,w?c.x+w.dx*w.d:c.x,w?c.y+w.dy*w.d:c.y]); }   // (the harbours in reach: their clearing & lane)
  if(TUNE.seaProps>0) for(let gj=Math.floor(wy0/PSP);gj<=Math.floor(wy1/PSP);gj++) for(let gi=Math.floor(wx0/PSP);gi<=Math.floor(wx1/PSP);gi++){
    const h1=hash2(gi*17+5,gj*29+3), h2=hash2(gi*31-9,gj*11+7), h3=hash2(gi*5+43,gj*23-11), h4=hash2(gi*13+3,gj*7+1), wx=(gi+0.15+h1*0.7)*PSP, wy=(gj+0.15+h2*0.7)*PSP;
    const ti=Math.floor(wx/T)-tx0, tj=Math.floor(wy/T)-ty0; if(ti<1||tj<1||ti>=TW-2||tj>=TW-2) continue; const k=tj*TW+ti; if(hh[k]<SEA) continue;
    const u=wx/T-0.5-tx0, uv=wy/T-0.5-ty0, bu=Math.floor(u), bv=Math.floor(uv); if(bu<0||bv<0||bu>=TW-1||bv>=TW-1) continue;
    const fx=u-bu, fy=uv-bv, k00=bv*TW+bu, h00=hh[k00], h10=hh[k00+1], h01=hh[k00+TW], h11=hh[k00+TW+1], e=(h00+(h10-h00)*fx+(h01-h00)*fy+(h00-h10-h01+h11)*fx*fy)/1.1;
    const S=SBL[bi[k]], t=S.t, band=e<t[0]?0:e<t[1]?1:e<t[2]?2:e<t[3]?3:4, tab=S.pr[band]; if(!tab || e<0.01) continue;
    if(h3>=S.pd[band]*TUNE.seaProps) continue;
    let r=h4*S.pt[band], kind=tab[tab.length-1][0]; for(const q of tab){ if(r<q[1]){ kind=q[0]; break; } r-=q[1]; }
    const shore=kind==='palm'||kind==='reeds'||kind==='mangrove'||kind==='datepalm'; if(cd[k]<(shore?1:2)) continue;       // (tall things keep off the swash)
    if(PC.length && slPortClear(PC,wx,wy)) continue;                                                                        // (a harbour's clearing & her lane stay open)
    if((S.fxk===1||S.fxk===2) && slSpecial(B,S.fxk,own[k],wx,wy,band,cd[k],0.5)) continue;                               // (nothing grows in a lagoon or a lava river)
    const v=Math.floor(hash2(gi*7+1,gj*3+9)*9), o=slSpr(S.key,kind,v,s), X=Math.round(wx*s)-P0x, Y=Math.round(wy*s)-P0y; L.push({o,X,Y});
    if(kind==='gshroom' && v%3===1) gl.push(X,Y-Math.round(o.h*0.7),4); else if(kind==='spire' && h1<0.5) gl.push(X,Y-Math.round(o.h*0.6),2); else if(kind==='vent'){ gl.push(X,Y-Math.round(o.h*0.7),1); sm.push(X,Y-Math.round(o.h*0.7)); } }
  for(let q=0;q<B.nC;q++){ const c=B.cand[q]; if(BIOMES[B.cB[q]] && BIOMES[B.cB[q]].key==='volcanic' && !c.port){ const X=Math.round(c.x*s)-P0x, Y=Math.round(c.y*s)-P0y; if(X>=0&&Y>=0&&X<W&&Y<H && heightAt(c.x,c.y)>=SEA) sm.push(X,Y); } }   // a caldera's crater smokes
  L.sort((a,b)=>a.Y-b.Y||a.X-b.X);
  for(const q of L){ const sh=slShd(Math.max(1,Math.round(q.o.R*0.8))); g.drawImage(sh.cv,q.X-sh.ax+Math.max(1,Math.round(q.o.R*0.35)),q.Y-sh.ay); }
  for(const q of L) g.drawImage(q.o.cv,q.X-q.o.ax,q.Y-q.o.ay);
  return {cv, X:P0x, Y:P0y, W, H, gl:gl.length?Int16Array.from(gl):null, tw:B.tw.length?Int16Array.from(B.tw):null, sm:sm.length?Int16Array.from(sm):null, u:SLS.fr}; }
/* per frame (drawSea, after the water): blit the land chunks in view, bake what's missing, pre-bake the ring round the view within the budget */
function slDraw(s,ox,oy,minTX,maxTX,minTY,maxTY){ const sig=TUNE.seaProps*7.1+TUNE.seaHill*13.3+TUNE.seaTex*17.9+TUNE.seaTree*19.7;
  if(SLS.s!==s || SLS.sig!==sig){ SLS.m.clear(); SLS.spr.clear(); SLS.s=s; SLS.sig=sig; SLS.job=null; }
  SLS.fr++; const OX=Math.floor(ox), OY=Math.floor(oy), V=SLS.vis; SLS.ox=OX; SLS.oy=OY; V.length=0; const tv=performance.now(); let nb=0;
  const c0=Math.floor(minTX/CHUNK), c1=Math.floor(maxTX/CHUNK), r0=Math.floor(minTY/CHUNK), r1=Math.floor(maxTY/CHUNK);
  for(let cy=r0;cy<=r1;cy++) for(let cx=c0;cx<=c1;cx++){ const key=(cx+4096)*8192+(cy+4096); let C=SLS.m.get(key);
    if(!C){ if(nb>0 && performance.now()-tv>4) continue;                                                                   // (≤ 4 ms of baking in view a frame — the rest next frame, the flat land standing in)
      nb++; if(SLS.job && SLS.job.key===key){ let r=SLS.job.g.next(); while(!r.done) r=SLS.job.g.next(); C=r.value; SLS.job=null; } else C=slBake(cx,cy,s); SLS.m.set(key,C); }   // (needed now: finish it)
    C.u=SLS.fr; if(C.empty) continue; V.push(C); pctx.drawImage(C.cv,C.X+OX,C.Y+OY); }
  const t=time;
  for(const C of V){ const bx=C.X+OX, by=C.Y+OY;
    if(C.tw){ const L=C.tw; pctx.fillStyle='#f4ffff'; for(let i=0;i<L.length;i+=2){ const ph=(t*1.6+(L[i]*0.37+L[i+1]*0.61))%3; if(ph<0.22){ pctx.fillRect(bx+L[i],by+L[i+1],1,1); if(ph<0.1){ pctx.globalAlpha=0.5; pctx.fillRect(bx+L[i]-1,by+L[i+1],3,1); pctx.globalAlpha=1; } } } }   // a lagoon glitters
    if(C.sm){ const L=C.sm, dr=Math.cos(wind.a)*0.8; for(let i=0;i<L.length;i+=2){ for(let k=0;k<4;k++){ const p=(t*0.22+k/4+(L[i]*0.013))%1, sz=1+Math.round(p*3.2*Math.max(1,s)), x=Math.round(bx+L[i]+dr*p*22*s+Math.sin(t*1.3+k)*1.5-sz/2), y=Math.round(by+L[i+1]-p*30*s-sz/2);   // smoke curling off vents & craters (tinted by the night like the rest)
        pctx.globalAlpha=(1-p)*0.42; pctx.fillStyle=p<0.2?'#9a8a82':'#7a7470'; pctx.fillRect(x,y,sz,sz); } } pctx.globalAlpha=1; } }
  const bud=TUNE.seaBudget; if(bud>0){ const tb=performance.now();                                                      // the ring round the view, a few rows each frame (a time-sliced bake)
    while(performance.now()-tb<bud){ if(!SLS.job){ let nx=null;
        outer: for(let cy=r0-1;cy<=r1+1;cy++) for(let cx=c0-1;cx<=c1+1;cx++){ if(cy>=r0&&cy<=r1&&cx>=c0&&cx<=c1) continue; const key=(cx+4096)*8192+(cy+4096); if(!SLS.m.has(key)){ nx=[cx,cy,key]; break outer; } }
        if(!nx) break; SLS.job={key:nx[2], g:slBakeGen(nx[0],nx[1],s)}; }
      const r=SLS.job.g.next(); if(r.done){ r.value.u=SLS.fr; SLS.m.set(SLS.job.key,r.value); SLS.job=null; } } }
  if(SLS.m.size>90){ const A=[...SLS.m.entries()].sort((a,b)=>a[1].u-b[1].u); for(let i=0;i<A.length-70;i++) SLS.m.delete(A[i][0]); }
  if(SLS.spr.size>900) SLS.spr.clear(); }
/* at night the land's own lights glow through (after worldTint — additive, on the screen canvas, in whole buffer pixels) */
const SL_GC=['#ffffff','#ff8a3c','#8de9ff','#ffd070','#c9a6ff','#c8ff7a'];   // (glow kinds: 0 frost glint · 1 lava & embers · 2 crystal · 3 warm · 4 glow-caps · 5 the mire's fireflies)
function slGlowStamp(k){ const key='gw'+k; let o=SLS.spr.get(key); if(o) return o; const R=4, S=PS(R*2+1,R*2+1), col=SL_GC[k]||'#ffffff';
  for(let y=0;y<=R*2;y++) for(let x=0;x<=R*2;x++){ const d=Math.hypot(x-R,y-R)/R; if(d>1) continue; const a=d<0.25?1:d<0.55?0.55:0.22; if(d>0.55 && bayV(x,y)+0.5<(d-0.55)*1.8) continue; psP(S,x,y,cIA(col,a)); }
  o=psCv(S,R,R); SLS.spr.set(key,o); return o; }
function slGlow(){ const dk=clamp((0.82-env.L)/0.55,0,1)*TUNE.seaGlow; if(dk<0.04 || !SLS.vis.length || mapOpen) return;
  const kx=CSSW/IW, ky=CSSH/IH, OX=SLS.ox, OY=SLS.oy, t=time; ctx.save(); ctx.globalCompositeOperation='lighter'; ctx.imageSmoothingEnabled=false;
  for(const C of SLS.vis){ const L=C.gl; if(!L) continue; const bx=C.X+OX, by=C.Y+OY;
    for(let i=0;i<L.length;i+=3){ const x=bx+L[i], y=by+L[i+1]; if(x<-6||y<-6||x>IW+6||y>IH+6) continue; if(SEAS_LCV && seasLmkCov(x,y)) continue; const k=L[i+2], o=slGlowStamp(k), fl=k===1?0.75+0.25*Math.sin(t*3.1+L[i]*0.7):0.7+0.3*Math.sin(t*1.7+L[i+1]*0.3);   // (SEAS SE4: none from under the volcano's mount)
      ctx.globalAlpha=clamp(dk*fl*(k===1?0.8:0.6),0,1); ctx.drawImage(o.cv,(x-o.ax)*kx,(y-o.ay)*ky,o.w*kx,o.h*ky); } }
  if(PGL.length){ const o=slGlowStamp(3); for(let i=0;i<PGL.length;i+=3){ const x=PGL[i], y=PGL[i+1], k=PGL[i+2];   // the harbours: lit windows, the lighthouse's lamp
      if(k===0||k===4){ if(k===0){ ctx.globalAlpha=clamp(dk*0.32,0,1); ctx.drawImage(o.cv,(x+0.5-o.ax)*kx,(y+0.5-o.ay)*ky,o.w*kx,o.h*ky); } ctx.globalAlpha=clamp(dk*0.85,0,1); ctx.fillStyle='#ffc860'; ctx.fillRect(x*kx,y*ky,kx,ky); }
      else { const a=clamp(dk*(k-0.6)*0.8,0,1); ctx.globalAlpha=a; ctx.drawImage(o.cv,(x-o.ax*2)*kx,(y-o.ay*2)*ky,o.w*2*kx,o.h*2*ky); } } }
  ctx.globalAlpha=1; ctx.restore(); }
/* ============================ render: the sea ============================ */
function iscale(){ return IH/360*TUNE.zoom; }          // internal px per world unit
function drawSea(){
  const s=iscale();
  const halfW=(IW/2)/s, halfH=(IH/2)/s;
  const minTX=Math.floor((camX-halfW)/TILE_W)-1, maxTX=Math.ceil((camX+halfW)/TILE_W)+1;
  const minTY=Math.floor((camY-halfH)/TILE_W)-1, maxTY=Math.ceil((camY+halfH)/TILE_W)+1;
  const ts=Math.ceil(TILE_W*s)+1;
  const ox=IW/2-camX*s, oy=IH/2-camY*s;
  const gq=SEAW_DK, gT=gq?gq.T:null, gx=gq?gq.x-420:0, gy=gq?gq.y-420:0, gK=gq?gq.a:0;   // (SEAS SE6: the Eye's water, hoisted for the tiles)
  const bq=SEAB_DK, bT=bq?bq.T:null, bx=bq?bq.x:0, by=bq?bq.y:0, bK=bq?bq.a:0;   // (SEAS SE7: the Glowing Tide's water, hoisted)
  const t=time, slOn=TUNE.seaLand>0, sdl=SEAS.on?SEAS.dl:1, spT=0.93-0.06*(SEAS.wcK-1);   // (SEAS SE2: the sea's own water — its tint, its colour depth · a squall sea glints ×1.4 more — its breaking crests are decals)
  let slMiss=null, slAll=false;                                                                  // (land chunks not baked yet: the old flat land stands in for them this frame)
  if(slOn){ slAll = SLS.s!==s || SLS.sig!==(TUNE.seaProps*7.1+TUNE.seaHill*13.3+TUNE.seaTex*17.9+TUNE.seaTree*19.7);
    if(!slAll) for(let cy=Math.floor(minTY/CHUNK);cy<=Math.floor(maxTY/CHUNK);cy++) for(let cx=Math.floor(minTX/CHUNK);cx<=Math.floor(maxTX/CHUNK);cx++){ const key=(cx+4096)*8192+(cy+4096); if(!SLS.m.has(key)) (slMiss||(slMiss=new Set())).add(key); } }
  for(let ty=minTY;ty<=maxTY;ty++){
    const wy=ty*TILE_W+TILE_W*0.5;
    const sy=Math.floor(wy*s-TILE_W*0.5*s+oy);
    for(let tx=minTX;tx<=maxTX;tx++){
      const h=heightCell(tx,ty);
      const wx=tx*TILE_W+TILE_W*0.5;
      const sx=Math.floor(wx*s-TILE_W*0.5*s+ox);
      let r,g,b;
      if(h<SEA){
        const d=clamp((SEA-h)/0.5,0,1);
        const c=waterColorT(d*sdl);
        // palette-cycle shimmer (the SNES water look) — drifting highlight bands
        const band=Math.sin(wy*0.16 + t*1.05 + Math.sin(wx*0.05+t*0.2)*1.3);
        const spark=Math.sin(wx*0.5+wy*0.31 - t*2.0);
        let lift=(band*0.5+0.5); lift=lift*lift;
        const cm=1-env.calm*0.78;                                   // dead calm flattens the chop to glass
        let bright=(1-d)*9 + lift*(8+(1-d)*16)*cm + ((spark>spT&&env.calm<0.4)?22:0) + (spark>0.95-env.storm*0.2?env.storm*30:0);
        r=c[0]+bright; g=c[1]+bright; b=c[2]+bright*1.05;
        if(gq){ const ex=wx-gx, ey=wy-gy; if(ex>=0 && ey>=0 && ex<840 && ey<840){ const k=gT[((ey/6)|0)*140+((ex/6)|0)]*gK; r-=k; g-=k; b-=k*0.8; } }   // (SEAS SE6: the Eye's water — darker within, banded along its arms, its heart dark, its lip pale · one table read a tile)
        if(bq){ const ex=wx-bx, ey=wy-by; if(ex>=0 && ey>=0 && ex<900 && ey<900){ const k=bT[((ey/6)|0)*150+((ex/6)|0)]*bK*(0.35+lift); r+=k*0.25; g+=k; b+=k*0.8; } }   // (SEAS SE7: the Glowing Tide — the water lit green-blue from beneath, brighter on the swell · one table read a tile)
        // shore foam where a neighbour is land
        if(d<0.2){
          if(heightCell(tx+1,ty)>=SEA||heightCell(tx-1,ty)>=SEA||heightCell(tx,ty+1)>=SEA||heightCell(tx,ty-1)>=SEA){
            const fo=(Math.sin(t*3+wx*0.2+wy*0.2)*0.5+0.5);
            r=lerp(r,240,0.45+fo*0.4); g=lerp(g,248,0.45+fo*0.4); b=lerp(b,248,0.4+fo*0.4);
          }
        }
      } else {
        if(slOn && !slAll && !(slMiss && slMiss.has((Math.floor(tx/CHUNK)+4096)*8192+(Math.floor(ty/CHUNK)+4096)))) continue;   // (the lands are baked per chunk & blitted after the water — slDraw; a chunk still baking shows the flat land a moment)
        const e=clamp(h/1.1,0,1);
        const c=landColor(e);
        const dither=((hash2(tx,ty)*12)|0)-6;
        // tiny shading from a NW "sun"
        const sh=(heightCell(tx-1,ty-1)-h)*40;
        r=c[0]+dither+sh; g=c[1]+dither+sh; b=c[2]+dither+sh;
      }
      pctx.fillStyle='rgb('+(clamp(r,0,255)|0)+','+(clamp(g,0,255)|0)+','+(clamp(b,0,255)|0)+')';
      pctx.fillRect(sx,sy,ts,ts);
    }
  }
  // sun-glint big soft gradient drifting across the water (fades to nothing at night)
  const glint=0.10*env.L;
  const gg=pctx.createRadialGradient(IW*(0.5+0.18*Math.sin(time*0.03)),IH*0.32,0, IW*0.5,IH*0.4,IW*0.7);
  gg.addColorStop(0,'rgba(255,250,225,'+glint+')'); gg.addColorStop(1,'rgba(255,250,225,0)');
  pctx.fillStyle=gg; pctx.fillRect(0,0,IW,IH);
  if(slOn) slDraw(s,ox,oy,minTX,maxTX,minTY,maxTY); else SLS.vis.length=0;   // each isle's biome, from the masthead (w1) — over the glint: the sun glitters on the water, it doesn't wash out the land
}

function w2pix(wx,wy){ const s=iscale(); return [ (wx-camX)*s+IW/2, (wy-camY)*s+IH/2 ]; }

const PORT_CLR=[26,32,40];                                                                                        // (world units round a harbour kept clear of trees & rocks)
function slPortClear(PC,wx,wy){ for(const p of PC){ const dx=wx-p[0], dy=wy-p[1]; if(dx*dx+dy*dy<p[2]) return true;
    const ex=p[3]-p[0], ey=p[4]-p[1], L2=ex*ex+ey*ey; if(L2>1){ const t=clamp((dx*ex+dy*ey)/L2,0,1), qx=dx-ex*t, qy=dy-ey*t; if(qx*qx+qy*qy<81) return true; } } return false; }
function portWaterDir(c){ if(c._hw!==undefined) return c._hw; let best=null; const far=Math.max(120,c.r*1.9);   // the nearest open water from the town (her lane runs down to it)
  for(let i=0;i<16;i++){ const a=i/16*TAU, dx=Math.cos(a), dy=Math.sin(a); for(let d=12;d<=far;d+=5) if(heightAt(c.x+dx*d,c.y+dy*d)<SEA){ if(!best||d<best.d) best={d, dx, dy}; break; } }
  return c._hw=best; }
function hbRoofC(ST,roof,r){ if(roof==='gable') return ST.gable[Math.floor(r*ST.gable.length)]; if(roof==='tileR') return ST.tileR; if(roof==='slate') return ST.slate; if(roof==='thatch') return THATCH[ST.thatch]||THATCH.gold;
  if(roof==='palm') return THATCH.palm; if(roof==='pagoda') return ['#2e7a6a','#8a2a2a','#2a4a7a'][Math.floor(r*3)]; if(roof==='cap') return ['#c43e30','#7a4a82','#427076'][Math.floor(r*3)]; if(roof==='flat'||roof==='dome') return '#c8a070'; return ST.stone; }
function hbWallC(ST,mat,r,bk){ if(mat==='plaster'||mat==='timber'||mat==='adobe') return ST.pl[Math.floor(r*ST.pl.length)]; if(mat==='boards') return ['#8a5a3a','#5a6a7a','#6a7a5a','#9a7a5a'][Math.floor(r*4)];
  if(mat==='stone'||mat==='field') return ST.stone; if(mat==='tarred') return '#4a3c2c'; if(mat==='log') return bk==='frost'?'#6a4a30':'#7a5234'; if(mat==='basalt') return bk==='volcanic'?'#3a3634':'#46424a';
  if(mat==='bamboo') return '#b8a860'; if(mat==='plank') return ST.wood; return '#e8dcc4'; }
/* one little house from the sea (3/4 view, like the towns): a roof in her biome's tiles, a lit-left wall, a door, a window (it glows at night) */
/* one little house from the sea (3/4 view, like the towns): a shingled roof in her biome's colour, lit from the top-left, a wall with a door
   and windows (they glow at night) — about a tree's size, so the town sits in the land like the rest */
function hbHouse(S,x0,yb,w,wh,rh,RR,WR,roof,snow,win,rs,D){ const top=yb-wh-rh, cap=roof==='cap'||roof==='dome', flat=roof==='flat', thatch=roof==='thatch'||roof==='palm', pag=roof==='pagoda';
  for(let y=0;y<wh;y++) for(let x=0;x<w;x++){ let v=x===0?4:x===w-1?2:3; if(y===0) v=1; else if(y===wh-1) v=Math.min(v,2); if(v===3 && tH(x0+x,yb+y*7)<0.08) v=2; psP(S,x0+x,yb-wh+y,WR[v]); }   // the wall (the eave's shadow along its top)
  const dw=Math.max(1,D(2)), dh=Math.max(2,Math.min(wh-1,D(3))), dx=x0+1+Math.floor(rs*Math.max(1,w-dw-2)), DC=cI('#3a2414'), DL=cI('#6a4424');
  for(let y=0;y<dh;y++) for(let x=0;x<dw;x++) psP(S,dx+x,yb-dh+y,x===0&&y>0?DL:DC);                                                 // the door
  const ww=Math.max(1,D(2)), whh=Math.max(1,Math.min(wh-2,D(2))), wy=yb-wh+Math.max(1,Math.round((wh-whh)/2)-0), G=cI('#1e2436'), FR=WR[5];
  for(let wx=x0+1; wx+ww<=x0+w-1; wx+=ww+Math.max(2,D(3))){ if(wx+ww>dx-1 && wx<dx+dw+1) continue;                                      // windows either side of the door
    for(let y=-1;y<=whh;y++) for(let x=-1;x<=ww;x++){ const fr=y<0||y===whh||x<0||x===ww; if(fr){ if(y===whh) psP(S,wx+x,wy+y,FR); continue; } psP(S,wx+x,wy+y,G); win.push([wx+x,wy+y,x===0&&y===0?1:0]); } }
  for(let y=0;y<rh;y++){ const inset=cap?Math.max(0,3-y*2):flat?0:(y===0?1:0), up=pag&&y===rh-1?1:0;                                        // the roof: ridge lit, the left slope in the sun, the eave dark
    for(let x=-1-up+inset;x<=w+up-inset;x++){ const lit=x<w*0.45; let v;
      if(flat){ v=y===0||y===rh-1?(y===0?4:1):3; if(y>0&&y<rh-1&&((x+y)%5===0)) v=2; }
      else if(cap){ v=y===rh-1?1:lit?4:3; if(y>0&&y<rh-1&&tH(x+x0,y*5)<0.14) v=5; }
      else { v=y===rh-1?1:y===0?4:(lit?3:2); if(y>0 && y<rh-1){ const band=(y-1)%2===1, seam=((x+(((y-1)>>1)&1)*2)%(thatch?2:4))===0; if(band) v=Math.max(1,v-1); else if(seam && !thatch) v=Math.max(1,v-1); if(thatch && tH(x0+x,y*3)<0.25) v=Math.min(5,v+1); } }
      const sn=snow && y<Math.ceil(rh*0.55) && y!==rh-1; psP(S,x0+x,top+y,sn?cI(y===0||lit?'#ffffff':'#dce6f2'):RR[v]); } }
  if(cap){ const c2=cI('#fff4e8'); psP(S,x0+Math.round(w*0.3),top+1,c2); psP(S,x0+Math.round(w*0.7),top+2,c2); if(w>9) psP(S,x0+Math.round(w*0.5),top+3,c2); } }
const HB_LAY={1:[[0,0]], 2:[[-9,-2],[8,2]], 3:[[-11,-3],[8,-5],[-1,6]], 4:[[-16,-4],[1,-8],[17,-3],[-5,7]], 5:[[-17,-4],[0,-8],[17,-4],[-9,7],[9,8]], 6:[[-25,-3],[-9,-9],[8,-8],[25,-3],[-15,8],[5,9]], 7:[[-25,-3],[-9,-9],[8,-8],[25,-3],[-16,8],[3,9],[20,10]]};
function harbourSpr(c,s){ const key='hb'+c.idx; let o=SLS.spr.get(key); if(o) return o;
  const SZ=portSizeOf(c), home=c.idx===homePortIdx, bk=slPortBiome(c).key, ST=Object.assign({},TOWN_ST._,TOWN_ST[bk]||{}), u=Math.max(0.75,s/1.41), D=v=>Math.max(1,Math.round(v*u));
  const r=mulberry32(((c.idx*2654435761)^0x4A7B)>>>0), wd=portWaterDir(c), n=[2,4,6][SZ]+(home?1:0), LAY=HB_LAY[Math.min(7,n)];
  let mx=0, my=0; for(const p of LAY){ mx=Math.max(mx,Math.abs(p[0])); my=Math.max(my,Math.abs(p[1])); }
  const rx=Math.round((mx+13)*u), ry=Math.round((my+10)*u);
  const dl=wd?wd.d*s:0, span=Math.ceil(Math.max(rx+6, ry+D(34), dl+D(18))), Wc=span*2+1, Bs=PS(Wc,Wc), cx=span, cy=span;
  // the ground: the town's own street — cobbles, flags, setts, a boardwalk, beaten earth or sand — dithered out into the land
  const SR=tRamp(ST.sc||'#9a9aa2'), soft=ST.street==='dirt'||ST.street==='sand', board=ST.street==='board', WDR=tRamp(ST.wood||'#9c6e42');
  for(let y=-ry-1;y<=ry+1;y++) for(let x=-rx-1;x<=rx+1;x++){ const d=Math.hypot(x/rx,y/ry)+(vnoise((x+c.idx)/7,y/7)-0.5)*0.22; if(d>1) continue; if(d>0.7 && bayV(x+cx,y+cy)+0.5<(d-0.7)*3.3) continue;
    let v; if(board){ v=(y&3)===3?1:((x+(y>>2)*3)%9===0?2:3); if(((x*7+y*13)&31)===0) v=4; psP(Bs,cx+x,cy+y,WDR[v]); continue; }
    if(soft) v=3+(tH(x*3+c.idx,y*5)<0.12?-1:tH(x,y+c.idx)>0.9?1:0); else { const row=((y+99)>>1), off=(row&1)*2, j=((x+99+off)%4===3)||(((y+99)&1)===1&&tH(x>>2,row)<0.35); v=j?2:3+(tH((x+off)>>2,row*3+c.idx)>0.7?1:0); }
    psP(Bs,cx+x,cy+y,SR[clamp(v,1,5)]); }
  // her lane down to the water, and the jetty at its end (along whichever axis faces the sea), a boat moored alongside
  let boatAt=null; const hz=wd?Math.abs(wd.dx)>Math.abs(wd.dy):false;
  if(wd && dl>rx*0.5){ const lw=D(3); for(let t=rx*0.4;t<dl-1;t+=0.5){ const px=Math.round(cx+wd.dx*t), py=Math.round(cy+wd.dy*t); for(let q=0;q<lw;q++){ const e=q===0||q===lw-1; psP(Bs,hz?px:px+q-(lw>>1),hz?py+q-(lw>>1):py,SR[soft?(e?2:3):(e?2:3+(((px*3+py)&3)===0?1:0))]); } }
    const ex=Math.round(cx+wd.dx*(dl-D(3))), ey=Math.round(cy+wd.dy*(dl-D(3))), sg=hz?Math.sign(wd.dx):Math.sign(wd.dy), L=D(16), jw=D(4);
    for(let i=0;i<L;i++) for(let j=0;j<jw;j++){ const x=hz?ex+sg*i:ex-(jw>>1)+j, y=hz?ey-(jw>>1)+j:ey+sg*i; let v=(i%2===1)?2:3; if(j===0) v=4; if(j===jw-1) v=1; psP(Bs,x,y,WDR[v]); }   // cross-boards, lit on one side
    for(let i=1;i<L;i+=3) for(const j of [-1,jw]){ const x=hz?ex+sg*i:ex-(jw>>1)+j, y=hz?ey-(jw>>1)+j:ey+sg*i; psP(Bs,x,y,WDR[0]); }                 // the piles
    boatAt=hz?[ex+sg*Math.round(L*0.55)-(sg<0?D(8):0), ey+(jw>>1)+2]:[ex+(jw>>1)+2, ey+sg*Math.round(L*0.55)]; }
  // the town: 2 · 4 · 6 roofs (+1 at home), a lighthouse for grand harbours & home — outlined & y-sorted
  const Tw=rx*2+D(14), Th=ry*2+D(44), T=PS(Tw,Th), tcx=Tw>>1, tcy=Th-ry-D(6), win=[], snow=!!ST.snow;
  const H=LAY.map(p=>({x:p[0], y:p[1], r:r()})).sort((a,b)=>a.y-b.y);
  let lh=null; if(SZ===2||home){ const side=wd&&wd.dx<0?-1:1; lh={x:Math.round(tcx+side*(mx+9)*u), y:Math.round(tcy+D(2))}; }
  let top=tcy;
  const lhDraw=()=>{ const tw=D(5), th=D(24), x0=lh.x-(tw>>1), yb=lh.y, RD=tRamp('#c8402e'), WH=tRamp('#ece6da');   // the lighthouse: red & white bands, a gallery, a lit lamp room, a dome
    for(let y=0;y<th;y++){ const band=Math.floor(y/D(4))%2===0, R=band?RD:WH, ins=Math.floor((th-y)/th*1.2); for(let x=ins;x<tw-ins;x++) psP(T,x0+x,yb-th+y,R[x===ins?4:x>=tw-ins-1?2:3]); }
    for(let x=-1;x<=tw;x++) psP(T,x0+x,yb-th,cI('#2a2a34'));
    const lr=D(3); for(let y=1;y<=lr;y++) for(let x=0;x<tw;x++) psP(T,x0+x,yb-th-y,cI(x===0||x===tw-1?'#3a3440':(y===1?'#ffd060':'#fff0a0')));
    for(let x=-1;x<=tw;x++) psP(T,x0+x,yb-th-lr-1,RD[1]); for(let x=0;x<tw;x++) psP(T,x0+x,yb-th-lr-2,RD[x<tw/2?3:2]); psP(T,lh.x,yb-th-lr-3,RD[1]);
    lh.lamp=[lh.x,yb-th-Math.ceil(lr/2)]; top=Math.min(top,yb-th-lr-3); };
  let lhDone=!lh, fX=tcx, fT=tcy;
  for(const h of H){ if(!lhDone && Math.round(tcy+h.y*u)>lh.y){ lhDraw(); lhDone=true; }
    const mat=tPick(h.r,ST.walls), roof=tPick((h.r*7.13)%1,ST.roofs), RR=tRamp(hbRoofC(ST,roof,(h.r*3.7)%1)), WR=tRamp(hbWallC(ST,mat,(h.r*5.3)%1,bk));
    const w=D(12+Math.floor(h.r*5)), wh=D(6), rh=D(7+(h.r>0.6?1:0)), x0=Math.round(tcx+h.x*u-w/2), yb=Math.round(tcy+h.y*u)-(ST.stilts?D(2):0);
    if(ST.stilts){ const P=cI('#3a3024'); for(let x=x0+1;x<x0+w-1;x+=D(4)) for(let q=0;q<D(2);q++) psP(T,x,yb+q,P); }
    hbHouse(T,x0,yb,w,wh,rh,RR,WR,roof,snow,win,(h.r*9.1)%1,D); top=Math.min(top,yb-wh-rh); if(h===H[0]){ fX=x0+Math.round(w*0.3); fT=yb-wh-rh; }
    if(h.r>0.42 && roof!=='cap' && roof!=='dome' && roof!=='flat'){ const chx=x0+w-D(4), cty=yb-wh-rh-D(2); for(let y=0;y<D(3);y++) for(let x=0;x<D(2);x++) psP(T,chx+x,cty+y,cI(x===0?'#8a746a':'#5a4a44')); } }
  if(!lhDone) lhDraw();
  psOut(T,cI('#12101a'));
  const tc=psCv(T,tcx,tcy), bc=psCv(Bs,cx,cy), cv=document.createElement('canvas'); cv.width=Wc; cv.height=Wc; const g=cv.getContext('2d'); g.drawImage(bc.cv,0,0);
  const ox=cx-tcx, oy=cy-tcy; g.drawImage(tc.cv,ox,oy);
  if(boatAt){ const bx=boatAt[0], by=boatAt[1], hl=D(9), hw=D(3);   // her moored boat, alongside the jetty
    g.fillStyle='#12101a'; g.fillRect(bx-1,by-1,hl+2,hw+2); g.fillStyle='#7a4a2a'; g.fillRect(bx,by,hl,hw); g.fillStyle='#b07a42'; g.fillRect(bx,by,hl,1); g.fillStyle='#4a2c18'; g.fillRect(bx,by+hw-1,hl,1);
    const mx2=bx+(hl>>1); g.fillStyle='#12101a'; g.fillRect(mx2-1,by-D(6)-1,D(4)+2,D(5)+2); g.fillStyle='#5a3a1e'; g.fillRect(mx2,by-D(6),1,D(6)); g.fillStyle='#f4f0e6'; g.fillRect(mx2+1,by-D(6),D(3),D(4)); g.fillStyle='#c8c0b0'; g.fillRect(mx2+1,by-D(6)+D(4)-1,D(3),1); }
  const fx=fX+ox, fy=fT+oy-D(5);                                                                                   // (her pennant flies off the back roof's ridge)
  o={cv, ax:cx, ay:cy, win:win.map(p=>[p[0]+ox,p[1]+oy,p[2]]), lamp:lh&&lh.lamp?[lh.lamp[0]+ox,lh.lamp[1]+oy]:null, flag:[fx,fy], fl:D(1), top:cy-(top+oy)+D(6)};
  SLS.spr.set(key,o); return o; }
function portLabelUp(c){ const o=SLS.spr.get('hb'+c.idx); return o?Math.max(0,Math.round(o.top*(CSSH/IH))-18):0; }
const PGL=[];                                                                                                      // (this frame's harbour lights: x, y, kind — slGlow lights them after dark)
function drawPortsPx(){ const s=iscale(), margin=Math.hypot(IW,IH)/s/2+160, t=time; PGL.length=0;
  for(const c of coresNear(camX,camY,margin)){ if(!c.port) continue; const o=harbourSpr(c,s), X=Math.round(c.x*s)+SLS.ox-o.ax, Y=Math.round(c.y*s)+SLS.oy-o.ay;
    if(X>IW || Y>IH || X+o.cv.width<0 || Y+o.cv.height<0) continue;
    pctx.drawImage(o.cv,X,Y);
    { const fx=X+o.flag[0], fy=Y+o.flag[1], q=o.fl, ph=Math.floor(t*4+c.x)%2;   // her pennant, snapping in the wind
      pctx.fillStyle='#12101a'; pctx.fillRect(fx-1,fy-1,q+2,q*5+2); pctx.fillStyle='#8a6a3a'; pctx.fillRect(fx,fy,q,q*5);
      const dir=Math.cos(wind.a)>=0?1:-1, px=dir>0?fx+q:fx-q*4; pctx.fillStyle='#12101a'; pctx.fillRect(px-1,fy-1,q*4+2,q*2+2+ph); pctx.fillStyle=c.idx===homePortIdx?'#ffd23f':'#e8483a'; pctx.fillRect(px,fy,q*4,q*2); if(ph){ pctx.fillRect(dir>0?px+q*2:px,fy+q*2,q*2,q); } }
    if(o.lamp){ const b=Math.sin(t*2.2+c.x)*0.5+0.5; pctx.fillStyle=b>0.5?'#fffbe0':'#ffd23f'; pctx.fillRect(X+o.lamp[0]-1,Y+o.lamp[1],3,1); if(env.L<0.8) PGL.push(X+o.lamp[0],Y+o.lamp[1],1+b); }
    if(env.L<0.8) for(const w of o.win) if((c.idx+w[0]*3+w[1])%7!==0) PGL.push(X+w[0],Y+w[1],w[2]?0:4); } }                       // (most windows lit — one glow each)
function drawPorts(){
  if(TUNE.seaLand>0){ drawPortsPx(); return; }                                                                   // (the harbours in pixels — the old marker with the old flat land)
  const s=iscale();
  const margin=Math.hypot(IW,IH)/s/2 + 120;
  for(const c of coresNear(camX,camY,margin)){ if(!c.port) continue;
    const [sx,sy]=w2pix(c.x,c.y);
    if(sx<-30||sy<-30||sx>IW+30||sy>IH+30) continue;
    const SZ=portSizeOf(c);
    const k=Math.max(1.4, 3*s)*(SZ===0?0.8:SZ===2?1.25:1);
    // the waterfront, by its standing: a hut, a town, or a crowded grand quay
    pctx.fillStyle='#d8c7a0'; pctx.fillRect(sx-3*k,sy,6*k,2*k);
    pctx.fillStyle='#b14b3a'; pctx.fillRect(sx-2*k,sy-1.6*k,1.6*k,1.6*k);
    if(SZ>=1){ pctx.fillStyle='#caa'; pctx.fillRect(sx+0.4*k,sy-1.2*k,1.2*k,1.2*k); }
    if(SZ===2){ pctx.fillStyle='#9a8aa0'; pctx.fillRect(sx-3.4*k,sy-1.3*k,1.3*k,1.3*k);
      pctx.fillStyle='#b8a890'; pctx.fillRect(sx+2*k,sy-1*k,1.4*k,1*k);
      pctx.fillStyle='#eee'; pctx.fillRect(sx+1.4*k,sy-3*k,1*k,3*k); }
    // the light itself: a pole lamp for hamlets, a proper tower above
    if(SZ===0){ pctx.fillStyle='#eee'; pctx.fillRect(sx-0.35*k,sy-2.8*k,0.7*k,2.8*k); }
    else { pctx.fillStyle='#eee'; pctx.fillRect(sx-0.5*k,sy-3.6*k,1.2*k,3.6*k); }
    const blink=(Math.sin(time*2.2+c.x)*0.5+0.5);
    const ng=0.5+(1-env.L)*0.95;                       // beacons blaze brighter at night to guide you
    const ly=SZ===0?-3.3*k:-4.2*k;
    pctx.fillStyle='rgba(255,236,140,'+clamp((0.4+blink*0.6)*ng,0,1)+')'; pctx.fillRect(sx-0.7*k,sy+ly,1.6*k,1*k);
    if(blink>0.5){ pctx.fillStyle='rgba(255,236,140,'+clamp((blink-0.5)*0.7*ng,0,1)+')'; pctx.fillRect(sx-2.6*k,sy+ly-0.6*k,5.2*k,2.6*k); }
  }
}

function drawCleared(){          // cleared isles fly your victory flag, visible from the sea
  const s=iscale();
  // rare isles shimmer on the horizon — something worth a detour
  for(const c of coresNear(boat.x,boat.y,900)){ if(c.port) continue;
    const b=biomeOf(c); if(b.tier<2) continue;
    const [sx,sy]=w2pix(c.x,c.y); if(sx<-20||sy<-20||sx>IW+20||sy>IH+20) continue;
    const k=Math.max(1.4,3*s), gp=0.5+0.5*Math.sin(time*2.4+c.x*0.02);
    pctx.globalAlpha=0.3+gp*0.55; pctx.fillStyle=b.mods.mark||'#ffffff';
    pctx.beginPath(); pctx.moveTo(sx, sy-5.4*k-gp*1.5); pctx.lineTo(sx+1.4*k, sy-3.8*k-gp*1.5);
    pctx.lineTo(sx, sy-2.2*k-gp*1.5); pctx.lineTo(sx-1.4*k, sy-3.8*k-gp*1.5); pctx.closePath(); pctx.fill();
    pctx.globalAlpha=1; }
  for(const c of cores){ if(!c.cleared||c.port) continue;
    const [sx,sy]=w2pix(c.x,c.y);
    if(sx<-30||sy<-30||sx>IW+30||sy>IH+30) continue;
    const k=Math.max(1.4, 3*s)*1.5;
    const hp2=0.5+0.5*Math.sin(time*1.6+c.x*0.01);                            // a proud claim, plain from the swell
    pctx.strokeStyle='rgba(255,210,63,'+(0.16+0.2*hp2)+')'; pctx.lineWidth=Math.max(1.2,1.6*s);
    pctx.beginPath(); pctx.arc(sx,sy-2.4*k,(5.2+hp2*1.2)*k,0,TAU); pctx.stroke();
    pctx.fillStyle='#8a8276'; pctx.fillRect(sx-1.2*k,sy-0.4*k,2.4*k,1.2*k);     // stone cairn
    pctx.fillStyle='#a39a8a'; pctx.fillRect(sx-0.7*k,sy-1.0*k,1.4*k,0.8*k);
    pctx.fillStyle='#e8e2d2'; pctx.fillRect(sx-0.22*k,sy-4.6*k,0.45*k,4.4*k);   // pole
    const wv=Math.sin(time*4+c.x*0.01)*0.5;                                     // waving golden pennant
    pctx.fillStyle='#ffd23f';
    pctx.beginPath(); pctx.moveTo(sx+0.2*k,sy-4.5*k);
    pctx.lineTo(sx+2.7*k, sy-3.9*k+wv*k); pctx.lineTo(sx+0.2*k,sy-3.3*k); pctx.closePath(); pctx.fill();
    const ng=1-env.L;                                                           // a soft gleam at night
    if(ng>0.3){ pctx.fillStyle='rgba(255,210,63,'+(0.22*ng)+')'; pctx.fillRect(sx-1.6*k,sy-5.2*k,4.6*k,2.4*k); }
  }
}
function drawWake(){
  for(const w of wake){ const [sx,sy]=w2pix(w.x,w.y); const a=(1-w.t/w.life)*0.55;
    pctx.fillStyle='rgba(236,246,250,'+a+')'; const r=Math.max(1,w.r*iscale()*0.5);
    pctx.fillRect(sx-r,sy-r,r*2,r*2); }
}

function drawBoat(){
  const s=iscale(); drawBoatInto(pctx, SHIP&&SHIP.liv, livStg(), time);   // (PT1 B8: her livery & her stage — the start livery draws her exactly as ever)
  // bow foam when moving briskly
  if(boat.spd>TUNE.baseSpeed*0.4){
    const bx=boat.x+Math.cos(boat.a)*9, by=boat.y+Math.sin(boat.a)*9; const [fx,fy]=w2pix(bx,by);
    const a=clamp((boat.spd/TUNE.baseSpeed-0.4)*0.7,0,0.5);
    pctx.fillStyle='rgba(240,248,252,'+a+')'; const r=Math.max(1,2*s);
    pctx.fillRect(fx-r,fy-r,r*2,r*2);
  }
}
/* (PT1 B8) her at sea in her livery — drawBoat's own lines on any context g: the hull in her paint, her trim along the deck's edge (none with the start
   oak & red: today's look), her sail's cloth (a band · patches · pale stitching · a gold hem), the Schooner's foresail, a pennant at the masthead streaming
   down the wind (none for the Guild's, her start flag), her figurehead a dot at the bow; the stage's length (SHIP_STG lenK). o (the Plans' preview):
   {x, y, s, a, rel, wa, crew} in place of the sea's boat, wind & storm */
function drawBoatInto(g,lv,stg,t,o){ const C=livCols(lv), K=livLenK(stg), s=o?o.s:iscale(), p=o?[o.x,o.y]:w2pix(boat.x,boat.y), sx=p[0], sy=p[1];
  const L=16*s*K; // length in px
  g.save(); g.translate(sx,sy); g.rotate(o?o.a:boat.a + env.storm*0.13*Math.sin(t*2.4));   // rocks in heavy weather
  // shadow
  g.fillStyle='rgba(0,20,40,0.28)'; g.beginPath(); g.ellipse(L*0.05,L*0.14,L*0.55,L*0.3,0,0,TAU); g.fill();
  // hull (pointed)
  g.fillStyle=C.hull;
  g.beginPath(); g.moveTo(L*0.58,0);
  g.quadraticCurveTo(L*0.1,-L*0.34,-L*0.5,-L*0.2);
  g.lineTo(-L*0.5,L*0.2);
  g.quadraticCurveTo(L*0.1,L*0.34,L*0.58,0); if(C.rim){ g.strokeStyle=C.rim; g.lineWidth=Math.max(1,s); g.lineJoin='round'; g.stroke(); } g.fill();   // (G19 FIX: a navy hull's lit rim — half a unit shows outside her)
  // deck
  g.fillStyle=C.trimOn?C.trim:'#9c6a3a';
  g.beginPath(); g.moveTo(L*0.46,0);
  g.quadraticCurveTo(L*0.05,-L*0.22,-L*0.38,-L*0.12);
  g.lineTo(-L*0.38,L*0.12);
  g.quadraticCurveTo(L*0.05,L*0.22,L*0.46,0); g.fill();
  if(C.trimOn){ const d=Math.max(0.5,L*0.035); g.fillStyle='#9c6a3a'; g.beginPath(); g.moveTo(L*0.46-d*1.6,0); g.quadraticCurveTo(L*0.05,-L*0.22+d,-L*0.38+d,-L*0.12+d); g.lineTo(-L*0.38+d,L*0.12-d); g.quadraticCurveTo(L*0.05,L*0.22-d,L*0.46-d*1.6,0); g.fill(); }   // her trim: the deck's edge in her trim colour, the planks inset within it
  // the crew about the deck — four small souls who keep her moving
  if((!o||o.crew) && crew.length>1){ const sway=Math.sin(t*1.7)*0.04, q=s*K;
    const spots=[[-0.30,0.10],[-0.13,-0.12],[0.04,0.11],[0.22,-0.07]];
    for(let ci=1;ci<crew.length;ci++){ const sp=spots[ci-1]||spots[0], RC=ROLE_DEF[crew[ci].role];
      const fx2=L*(sp[0]+sway*(ci%2?1:-1)), fy2=L*sp[1];
      g.fillStyle='#2c2418'; g.fillRect(fx2-0.8*q, fy2-0.7*q, 1.6*q, 1.5*q);
      g.fillStyle=RC.col; g.fillRect(fx2-0.8*q, fy2-1.9*q, 1.6*q, 1.3*q); } }
  // sail — billows to the lee side relative to wind
  const rel=o?o.rel:Math.sin(wind.a-boat.a); const billow=clamp(rel,-1,1);
  if(livMasts(stg)>1) livSeaSail(g,C,L,s,L*0.34,0.8,billow);   // (the Schooner's foresail, forward of the main)
  g.fillStyle=C.sail;
  g.beginPath(); g.moveTo(L*0.16,0);
  g.quadraticCurveTo(-L*0.1+L*0.18*billow, billow*L*0.5, -L*0.28, billow*L*0.06);
  g.lineTo(L*0.16,0); g.closePath(); g.fill();
  if(C.cloth) livSeaCloth(g,C,L,s,L*0.16,1,billow);
  g.strokeStyle='#cfc6ad'; g.lineWidth=Math.max(0.6,s*0.4);
  g.beginPath(); g.moveTo(L*0.16,L*0.04); g.lineTo(L*0.16,-L*0.04); g.stroke(); // mast
  if(C.flagOn) livPennant(g,C,L*0.16,s,o?o.wa:wind.a-boat.a,t);
  if(C.figC){ g.fillStyle=C.figC; g.fillRect(L*0.58-0.6*s,-0.6*s,1.2*s,1.2*s); }   // her figurehead
  g.restore(); }
function livSeaSail(g,C,L,s,m,k,b){ g.fillStyle=C.sail; g.beginPath(); g.moveTo(m,0); g.quadraticCurveTo(m+(-L*0.26+L*0.18*b)*k, b*L*0.5*k, m-L*0.44*k, b*L*0.06*k); g.closePath(); g.fill();   // a sail on the mast at m, k its size
  if(C.cloth) livSeaCloth(g,C,L,s,m,k,b);
  g.strokeStyle='#cfc6ad'; g.lineWidth=Math.max(0.6,s*0.4); g.beginPath(); g.moveTo(m,L*0.04); g.lineTo(m,-L*0.04); g.stroke(); }
function livSeaCloth(g,C,L,s,m,k,b){ const ex=m-L*0.44*k, ey=b*L*0.06*k, cx=m+(-L*0.26+L*0.18*b)*k, cy=b*L*0.5*k;   // her cloth, between the sail's foot (the chord) & its belly (no clip — a few small shapes)
  const P=t=>{ const u=1-t; return [u*u*m+2*t*u*cx+t*t*ex, 2*t*u*cy+t*t*ey]; }, Q=t=>[m+(ex-m)*t, ey*t];   // (her belly · her foot, at t along her)
  if(C.sb){ const a=Q(0.4), b1=P(0.4), b2=P(0.475), b3=P(0.55), c2=Q(0.55); g.fillStyle=C.sb; g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b1[0],b1[1]); g.lineTo(b2[0],b2[1]); g.lineTo(b3[0],b3[1]); g.lineTo(c2[0],c2[1]); g.closePath(); g.fill(); }   // the band across her, 40–55 % aft of the mast
  if(C.sp){ const d=Math.max(1,0.9*s*k); [[0.3,0],[0.64,2]].forEach(([t,i])=>{ const p=P(t), q=Q(t); if(Math.hypot(p[0]-q[0],p[1]-q[1])<d*1.4) return; g.fillStyle=C.sp[i]; g.fillRect((p[0]+q[0])/2-d/2,(p[1]+q[1])/2-d/2,d,d); }); }   // two patches
  if(C.sst){ g.strokeStyle=C.sst; g.lineWidth=Math.max(0.4,s*0.22); g.beginPath(); for(const t of [0.3,0.62]){ const p=P(t), q=Q(t); g.moveTo(q[0],q[1]); g.lineTo(p[0],p[1]); } g.stroke(); }   // her seams in a pale thread
  if(C.hem){ g.strokeStyle=C.hem; g.lineWidth=Math.max(0.5,s*0.32); g.beginPath(); g.moveTo(m,0); g.quadraticCurveTo(cx,cy,ex,ey); g.stroke(); } }   // silk: a gold hem along her belly
function livPennant(g,C,mx,s,wa,t){ const ca=Math.cos(wa), sa=Math.sin(wa), ln=3*s, w=0.7*s, fl=((Math.floor(t*6)&1)?0.45:-0.45)*s;   // 3 u long, streaming down the wind, flapping (2 frames)
  g.fillStyle=C.flag; g.beginPath(); g.moveTo(mx-sa*w,ca*w); g.lineTo(mx+sa*w,-ca*w); g.lineTo(mx+ca*ln-sa*fl,sa*ln+ca*fl); g.closePath();
  if(C.fe){ g.strokeStyle=C.fe; g.lineWidth=Math.max(1,s); g.lineJoin='round'; g.stroke(); } g.fill();   // (G19 FIX: a dark flag wears a pale edge — half a unit outside — or her deck & the sea swallow it)
  if(C.flagD){ g.fillStyle=C.flagD; g.fillRect(mx+ca*ln*0.42-0.3*s,sa*ln*0.42-0.3*s,0.6*s,0.6*s); } }   // its device, a dot (small — the flag's own colour leads)

