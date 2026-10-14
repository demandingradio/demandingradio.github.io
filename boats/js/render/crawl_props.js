"use strict";
/* FILE: js/render/crawl_props.js
THE CRAWL PROP ART (STAGE 3, THE GROUND, third part): original lines 23596-24187 (build 5109cd5), moved verbatim, in place
  directly after js/render/terrain.js; THE NEWER SHORES' HAZARDS follow at original line 24188 (build 5109cd5).
Seven parts: the props you smash (HB_RAMP, HB_DOTS, nodeStyle, nodeSpr, drRuin, nodeDeadSpr); the kegs and crates (PROP_ART,
  propArtS, propSpr, propDeadSpr, drawProps, propTells) and THE BOOM (BOOM_PC, boomPuff, drawBoomFx); the tile props (cover
  pc* painters, cracked pillars and their shafts, standing stones, rune bars, rubble, drawPropTile, drawPropOver, the pillar
  tell and dust); the traps (spike plates, dart traps, loose rocks, drawTraps, trapTells, drawTrapAir) with drawFalls; tall
  grass (fringeSpr, drawFringe, grassYou); the FX sprite utilities (whiteOf, fxLRU, RINGS, MARKS, ringSpr); and the set
  pieces (the beached boat, the cairn, the skull plates, secret doors, shrines, lava cracks).
Entry points: drawIslandWorld calls drawProps, drawTraps, drawBoatAshore, drawShrines, drawLava, drawPropOver, drawPropFx and
  the rest; islTells calls propTells, trapTells and ringBars; terrOverlay (js/render/terrain.js) calls drawSecrets. Shared:
  ringSpr, whiteOf and fxLRU (whaling, stairs, the saga lantern, markSpr), propChipC, propBK and propRampHex (the gameplay
  gibs, rockFall), lavaSpr (islEmissive). PROPOV is a per-frame list: reset by drawProps, filled by drawPropTile, the sanctum
  and the saga lantern, read by drawPropOver (keep that call order in drawIslandWorld).
Globals it owns: the consts HB_RAMP, HB_DOTS, PROP_ART, KEG_FX, KEG_FY, PROPZ, BOOM_PC, STONE_R, RUNE_G, PROPOV, PCLIP, RINGS,
  MARKS and SHR_SIG, and the functions named above.
Main globals it reads from elsewhere (inside functions, at runtime only): ISL, ITUNE, player, iprop, ifx, itrap, ishrines,
  ihaz, pctx, last; the pixel kit, tSpr, TSPR_S, TB, TBI and caveTI (js/render/pixkit.js); rkRamp (js/render/terrain.js);
  declared later: islScale, iwp, islOnScr, islShd, PSPR, LGT, dissCv, livCols and livSig.
Load-time statements: only original line 24051 (build 5109cd5), RINGS and MARKS, two new Map(); the rest are consts with pure
  literal initialisers and function declarations.
*/
/* ---- the props you smash (rock / herb / ruin) wear their biome: sandstone, granite, ice-rimed, obsidian, coral, crystal · fern, sagebrush, heather, berry, sea-grape, blossom, thyme, snowbell, firebloom, glowcap ---- */
const HB_RAMP={ fern:['#123018','#1a4020','#245228','#2f6632','#427e40','#5c9852'], sage:['#2a3428','#3a4636','#4e5c48','#62725a','#7c8c70','#9aaa8a'], heather:['#1a2418','#233022','#2c3a2a','#384634','#465440','#56644c'],
  berry:['#143418','#1c4822','#265c2c','#327238','#468a48','#5ea45c'], seagrape:['#163e1e','#1e5028','#2a6632','#387c3e','#4e944e','#6aae62'], blossom:['#173e1e','#1f4c26','#2a5e30','#387440','#4c8c50','#66a664'],
  thyme:['#26322a','#324034','#3e4e40','#4c5e4c','#5e705a','#76886e'], snowbell:['#16303a','#1e404c','#285260','#346676','#467e8c','#6a9ea8'], firebloom:['#1a0e0a','#2a1810','#3a2216','#4a2c1c','#5c3824','#704630'],
  bogstar:['#0e2016','#162e1e','#203e28','#2c5234','#3c6a44','#56845a'], desertrose:['#1a2a14','#28401c','#385824','#4a702e','#62883a','#80a44a'], ginseng:['#0e2a10','#163a16','#20501e','#2c6828','#3e8234','#58a046']};
const HB_DOTS={ bogstar:['#f4f0e0','#fff8a0','#e8e4d0'], desertrose:['#e84a6a','#ff8aa0','#ffd0d8','#b02a48'], ginseng:['#d8303c','#ff6a4a','#fff0c0'],  sage:['#efe6c8','#d8ceb0'], berry:['#d8303c','#ff7a84','#a01e28'], seagrape:['#6a2a7a','#9a4aaa','#4a1a5a'], blossom:['#f4b4c8','#ffffff','#f08aa6'], thyme:['#b89ad8','#d4c0ec'], snowbell:['#ffffff','#d8ecff','#a8c8e8'], firebloom:['#ff5a28','#ff9a40','#fff0c0','#c83018']};
function nodeStyle(nd){ const B=TBI(ISL.biome.key), cv=!!ISL.cave; return nd.cry?'crystal':nd.type==='rock'?(cv?'cave':B.rk):nd.type==='herb'?(cv?'glowcap':B.hb):(cv?'cave':B.ru); }
function nodeSpr(nd){ if(nd.heart) return sanctHeartSpr(false); const st=nodeStyle(nd), v=Math.abs(Math.floor(nd.x*0.37+nd.y*0.91))%3, ot=nd.type==='rock'&&!nd.cry?(nd.ot||1):0; return tSpr('n'+nd.type+st+v+ISL.biome.key+'o'+ot+(nd.cath?'c':''), ()=>{ const s=TSPR_S, sd=v*17+nd.type.length*5+3; let o;   // (C7a: + its ore tier — the seams' colour · DE5: a cathedral's crystal, tall)
  if(nd.type==='rock'){ const R=Math.max(3,10*s*0.95), vn=ot?ORE_T[ot-1][1]:null;
    if(st==='crystal') o=trSpire(R*(nd.cath?1.3:0.85),(TBI('crystal').cr.spire)[nd.cath?0:v%2],null,sd,cI('#03050a'));
    else if(st==='obsidian') o=trObsid(R*0.95,cIR(RKR.obsidian),null,sd,cI('#040303'),vn);
    else if(st==='coral') o=trCoral(R,cIR(RKR.coral),null,sd,cI('#3a2020'),vn);
    else { const C=st==='cave'?cIR(caveTI(ISL.biome).rock):rkRamp(st); o=trBoulder(R,C,null,sd,{ol:C[0], moss:st==='mossy', snow:st==='icerime', strata:st==='sandstone', speck:st==='granite'||st==='basalt'||st==='cave', vein:vn}); } }
  else if(nd.type==='herb'){ const R=Math.max(3,9*s*0.95);
    if(st==='fern') o=drFern(R*1.1,cIR(HB_RAMP.fern),sd); else if(st==='heather') o=trHeather(R,cIR(HB_RAMP.heather),null,sd,cI('#0a100a'));
    else if(st==='glowcap') o=drShrooms(R*1.1,sd,['#2a6a8a','#5ac0e0','#a8f0ff']);
    else if(st==='puffcap') o=drPuff(R*1.05,sd);                                                         // the grove's puffballs — smash one and it bursts in spores
    else { const C=cIR(HB_RAMP[st]||HB_RAMP.berry); o=drBush(R*(st==='thyme'?0.85:1),C,sd,cIR(HB_DOTS[st]||HB_DOTS.berry),st==='firebloom'?11:st==='blossom'?9:7); } }
  else o=drRuin(Math.max(3,9*s),st==='cave'?cIR(caveTI(ISL.biome).rock):rkRamp(st),sd,st);
  o.sh=shadowSpr(Math.round(o.w*0.36),Math.max(1,Math.round(o.w*0.14)),0.3); return o; }); }
function drRuin(R,C,sd,st){ const w=Math.ceil(R*2.3)+6, H=Math.round(R*1.75), h=H+6, S=PS(w,h), bx=Math.round(w*0.42), by=h-3, cw=Math.max(3,Math.round(R*0.8)), top=by-H;   // a broken column & its fallen drum — carved, weathered
  const M2=cIR(st==='coral'?['#b86a6a','#d8908a']:st==='icestone'?['#dce6ee','#ffffff']:st==='basalt'?['#5a5450','#746c66']:st==='crystone'?['#3a78a0','#6ac0e0']:['#3e5a30','#56783e']), GL=cI(st==='crystone'?'#8de9ff':st==='basalt'?'#ff7a2a':'#2a2016');
  for(let y=top;y<=by;y++){ const jag=y<top+3?Math.floor(hash2(sd,y)*3):0; for(let x=bx-(cw>>1);x<bx-(cw>>1)+cw;x++){ if(y<top+jag+(x+sd)%3) continue;
      const lf=(x-(bx-(cw>>1)))/cw; let v=3.1-lf*1.8+bayV(x,y)*0.6; if(y===top+4||y===by-2) v-=1.2; if((x-(bx-(cw>>1)))%3===1 && y>top+5 && y<by-2) v-=0.5;   // fluting, a capital groove, the base
      let c=C[clamp(Math.floor(v),0,5)]; if((y>by-4 || y<top+3) && hash2(x*5+sd,y*3)<0.4) c=M2[(x+y)&1]; psP(S,x,y,c); } }
  const gy=Math.round(top+H*0.45); psP(S,bx,gy,GL); psP(S,bx-1,gy+1,GL); psP(S,bx+1,gy+1,GL); psP(S,bx,gy+2,GL);                              // a worn glyph
  const dx0=bx+(cw>>1)+1, dw=Math.round(R*0.9), dh=Math.max(2,Math.round(R*0.5));                                                           // the fallen drum
  for(let y=by-dh;y<=by;y++) for(let x=dx0;x<dx0+dw;x++){ let v=y===by-dh?4:y===by?1:2.4+bayV(x,y)*0.6; if(x===dx0+dw-1) v=1; psP(S,x,y,C[clamp(Math.floor(v),0,5)]); }
  psDisc(S,dx0+dw-1,by-dh/2,Math.max(1.2,dh*0.35),dh*0.5,(nx)=>C[nx<0?3:2]);
  return psCv(psOut(S,C[0],false),bx,by); }
function nodeDeadSpr(nd){ if(nd.heart) return sanctHeartSpr(true); const st=nodeStyle(nd); return tSpr('nd'+nd.type+st+ISL.biome.key, ()=>{ const s=TSPR_S;
  if(nd.type==='herb'){ const S=PS(Math.ceil(10*s)+4,Math.ceil(5*s)+4), G=cIR(['#3a5a2a','#5a7a3a']); for(let i=0;i<4;i++){ const x=2+i*2.2*s; psP(S,x,S.h-3,G[0]); psP(S,x,S.h-4,G[1]); } return psCv(S,S.w>>1,S.h-3); }
  const C=st==='crystal'?(TBI('crystal').cr.spire)[0]:st==='cave'?cIR(caveTI(ISL.biome).rock):rkRamp(st==='obsidian'||st==='coral'?st:nd.type==='ruin'?(TBI(ISL.biome.key).ru):st);
  return drRocks(Math.max(2.5,6*s),C,nd.type.length); }); }
/* ---- (PT1 K7a) THE PROPS' ART — hand-set texels (the crawl's texel is ~0.7 of a world unit at any window: a rock ~14 texels across, a keg 12×14, a crate
   14×12), lit from the top-left, the dark SNES line round each (psOut) · a keg: oak staves, two iron hoops with a glint, a red X stencil, a bung for its fuse ·
   a crate: a lit lid of boards, a front framed & braced, nails · its variants: a wreck's sea-grey (the atolls) · a miner's soot-black lid & iron bands (caves) ---- */
const PROP_ART={
  keg:{a:['..dLLLld..','.dLLllold.','.kH*hhhhk.','CARBCCCrDE','CABRCCrDDE','CABBRrCDDE','CABRCCrDDE','CARBCCCrDE','kHH*hhhhkk','CABBCDCDDE','CABBCCCDDE','.EDDDDDDE.'],
    p:{L:'#d6a86e',l:'#b0804e',d:'#7a4e2a',o:'#24140a',A:'#c48c54',B:'#a46c3c',C:'#86562e',D:'#66401f',E:'#4a2c14',H:'#aeaeba',h:'#64646e',k:'#3a3a44','*':'#f4f4fc',R:'#ec5238',r:'#bc3620'}, ol:'#1a0e06'},
  crate:{a:['tTTTtTTTtTTt','tTTTtTTTtTTt','tTTTtTTTtTTt','LLLLLLLLLLLt','xNxxxxxxxxNX','xPPPqPppxXpX','xPPPqPxXqppX','xPPPxXppqppX','xPxXqPppqppX','xNxxxxxxxxNX'],
    p:{t:'#a87c4a',T:'#cca272',L:'#ecc88e',x:'#8e6234',X:'#5e3e1e',N:'#ece6d2',P:'#b8885a',p:'#986a3e',q:'#74502c'}, ol:'#2a1a0c'},
  wreck:{a:'crate', p:{t:'#7e8270',T:'#a4a690',L:'#c8c8b2',x:'#5e6a5c',X:'#3a4438',N:'#c88a4a',P:'#9a9684',p:'#7c7a68',q:'#5c5e50'}, ol:'#161c16', dots:[[2,1,'#ece6d0'],[3,1,'#bdb6a0'],[9,6,'#ece6d0'],[9,7,'#bdb6a0'],[1,7,'#5e8a5a'],[10,8,'#5e8a5a'],[6,2,'#5e8a5a'],[7,2,'#4a6e48']]},
  mine:{a:'crate', p:{t:'#4e443c',T:'#6a5e52',L:'#8a7c6a',x:'#62626c',X:'#2e2e36',N:'#d0d4de',P:'#8a6a48',p:'#6e5236',q:'#4e3a26'}, ol:'#0e0c0a', dots:[[1,0,'#2a2420'],[2,1,'#2a2420'],[5,0,'#2a2420'],[6,1,'#3a322c'],[9,2,'#2a2420'],[10,0,'#3a322c'],[3,2,'#3a322c']]},
  debris:{a:['.PPp...xX...','qPPPp..xxX..','..qq...PPpq.','.xX..PPPp...','......qq....'], p:{P:'#b8885a',p:'#986a3e',q:'#74502c',x:'#8e6234',X:'#5e3e1e'}, ol:'#2a1a0c'}};
const KEG_FX=7, KEG_FY=2;                                                                        // (the bung on the keg's lid, from its sprite's top-left: the fuse rises out of it)
function propArtS(key,v,crk){ return tSpr('pa'+key+(v||'')+(crk?'c':''), ()=>{ const A=PROP_ART[v||key]||PROP_ART[key], rows=typeof A.a==='string'?PROP_ART[A.a].a:A.a, h=rows.length, w=rows[0].length, S=PS(w+2,h+2);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const c=A.p[rows[y][x]]; if(c) psP(S,x+1,y+1,cI(c)); }
  if(A.dots) for(const q of A.dots) psP(S,q[0]+1,q[1]+1,cI(q[2]));
  if(crk){ const K=cI('#1e1208'), Q=cI(mixHex(A.p.T||'#cca272','#ffffff',0.3)); for(const q of [[3,6],[3,7],[2,8],[4,7],[7,1],[7,2],[8,3]]) psP(S,q[0]+1,q[1]+1,K); psP(S,5,8,Q); psP(S,8,2,Q); }   // (a crate struck once: split across its face & its lid)
  psOut(S,cI(A.ol),false); const o=psCv(S,(w+2)>>1,h+1); o.sh=shadowSpr(Math.round((w+2)*0.42),Math.max(1,Math.round((w+2)*0.16)),0.3); return o; }); }
function propSpr(P){ return P.k==='barrel' ? propArtS('keg','') : propArtS('crate',P.v,P.hp<P.hp0); }
function propDeadSpr(P){ return tSpr('pad'+(P.v||''), ()=>{ const B=PROP_ART[P.v||'crate']||PROP_ART.crate, A=PROP_ART.debris, rows=A.a, h=rows.length, w=rows[0].length, S=PS(w+2,h+2);   // a crate's broken boards (in its own wood)
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const ch=rows[y][x], c=B.p[ch]||A.p[ch]; if(c) psP(S,x+1,y+1,cI(c)); }
  psOut(S,cI(B.ol||A.ol),false); return psCv(S,(w+2)>>1,h); }); }
/* draw the props (after the nodes — on the ground, under the foes): a soft shadow, the sprite (a lit keg flashes white every 0.1 s and shudders in its last half;
   a struck prop jolts), the keg's fuse — a cord out of its bung, burning down with a white-gold spark — the keys' gold target ring, and a crate's white "smash" ring */
const PROPZ=[];                                        // (PT1 K7b: this frame's props in view, back to front — reused)
function drawProps(s,aL){ PROPOV.length=0; if(!iprop.length) return; const V=PROPZ, TS=ISL.TS, vw=(IW/2)/s, vh=(IH/2)/s; V.length=0;   // (R1a: islOnScr's test inline — the view's half-size once a frame)
  for(const P of iprop){ if(P.gone) continue; const m=P.cells?P.w*TS+70:45; if(Math.abs(P.x-icamX)>=vw+m || Math.abs(P.y-icamY)>=vh+m) continue; P._z=P.cells?(P.ty+P.h)*TS:P.dead?P.y-30:P.y+P.r*0.5; V.push(P); }
  if(V.length>1) V.sort((a,b)=>a._z-b._z);                                                    // (PT1 K7b) y-sorted: a keg in front of a wall is drawn over it, one behind it under it
  for(const P of V){ if(P.cells){ drawPropTile(P,s); continue; } const [sx,sy]=iwp(P.x,P.y), base=Math.round(sy+P.r*s*0.5);
    if(P.dead){ const o=propDeadSpr(P); pctx.drawImage(o.cv,sx-o.ax,base-o.ay); continue; }
    const o=propSpr(P), fu=P.st==='fuse', p=fu?clamp(1-P.t/(P.t0||1),0,1):0, X=sx+(P.fl>0?Math.round((Math.random()-0.5)*2.6*s):(fu&&p>0.45&&(Math.floor(itime*32)&1))?1:0);
    pctx.drawImage(o.sh.cv,X-o.sh.ax+1,base-o.sh.ay);
    pctx.drawImage((((fu && (P.t%0.1)<0.05) || P.fl>0.08) ? whiteOf(o) : o).cv,X-o.ax,base-o.ay);
    if(P.k==='barrel'){ const fx=X-o.ax+KEG_FX, fy=base-o.ay+KEG_FY;
      if(!fu){ pctx.fillStyle='#2e2014'; pctx.fillRect(fx,fy-1,1,1); pctx.fillStyle='#5a4630'; pctx.fillRect(fx+1,fy-2,1,1); }   // (a dark wick, curling out of the bung)
      else { const L=p<0.5, ty=fy-(L?2:1), f=Math.floor(itime*28)&1; if(L){ pctx.fillStyle='#2e2014'; pctx.fillRect(fx,fy-1,1,1); }
        pctx.fillStyle=f?'#ffffff':'#fff3a0'; pctx.fillRect(fx,ty,1,1); pctx.fillStyle=f?'#ffd23f':'#ff8a1e'; pctx.fillRect(fx+(f?1:-1),ty-1,1,1); pctx.fillRect(fx,ty-2+f,1,1); } }
    const r=P.r*s;
    if(aimBrk && aimBrkOn(P)){ const R=ringSpr(Math.round(r*1.7),Math.round(r*0.8),'#ffd86b'); pctx.globalAlpha=0.55+0.35*Math.sin(itime*9); pctx.drawImage(R.cv,sx-R.ax,base-R.ay); pctx.globalAlpha=1; }   // (the keys' lean: your shot's target)
    else if(!aL && P.k==='crate' && (player.x-P.x)**2+(player.y-P.y)**2<58*58){ const R=ringSpr(Math.round(r*1.45),Math.round(r*0.66),'#ffffff'); pctx.globalAlpha=0.35+0.25*Math.sin(itime*6); pctx.drawImage(R.cv,sx-R.ax,base-R.ay); pctx.globalAlpha=1; } } }
/* a lit keg's BLAST RING — a 1-texel red ring at kegR, a dark rim behind it, its disc filling in as the fuse burns (drawn with the tells: over the dark at night) */
function propTells(s){ for(const P of iprop){ if(P.cells){ if(P.st==='tell' && islOnScr(P.x,P.y,140)) pillarTell(P,s); continue; }   // (PT1 K7b) a toppling pillar's lane
    if(P.st!=='fuse' || P.dead || !islOnScr(P.x,P.y,ITUNE.kegR+16)) continue;
    const [sx,sy]=iwp(P.x,P.y), Rs=Math.round(ITUNE.kegR*s), p=clamp(1-P.t/(P.t0||1),0,1), a=0.35+0.45*p+((GFX.art && ART.ok && !ART.off && !ART.probe)?0.04:0);   // (PX7 FIX: the lanes' +0.04 lever under the filter — the ring at p 0 on bright floors)
    pctx.fillStyle='#4a1006'; pctx.globalAlpha=a*0.55; pxRingE(pctx,sx,sy,Rs+1,Rs+1,1);
    pctx.fillStyle='#ff5a3c'; pctx.globalAlpha=a; pxRingE(pctx,sx,sy,Rs,Rs,1);
    if(p>0.04){ const Rf=Math.max(1,Math.round((Rs-1)*p)); pctx.globalAlpha=0.1+0.16*p; pxEll(pctx,sx,sy,Rf,Rf); } pctx.globalAlpha=1; } }
/* THE BOOM (boom()'s ifx 'boom'): a white-hot flash (3 frames) · the shock ring rolling out to its reach, orange on a dark rim · a fireball of baked puffs swelling
   white → gold → orange → red, then smoke rising and thinning · a smoke ring at the edge — whole texels throughout */
const BOOM_PC=[['#ffffff','#fff3c0','#ffd23f'],['#fff3c0','#ffd23f','#ff9a3c'],['#ffd23f','#ff9a3c','#d8401a'],['#ff9a3c','#d8401a','#7a2210'],['#7a6a5a','#5a4a3a','#3a2e24'],['#6a5c4e','#4e4236','#342a22'],
  ['#e0d4bc','#bcae94','#8e806a'],['#c8bca4','#a49680','#7a6c58']];   // (PT1 K7b: 6 · 7 — a fallen pillar's dust, pale then settling)
function boomPuff(r,st){ return fxLRU(RINGS,220,'bp'+r+'_'+st, ()=>{ const S=PS(r*2+3,r*2+3), C=BOOM_PC[st].map(cI), c=r+1.5;   // a puff: lit up-left, shaded down-right, a dither between
  psDisc(S,c,c,r,r,(nx,ny,x,y)=>{ const v=-(nx*0.6+ny*0.8)+bayV(x,y)*0.5; return C[v>0.32?0:v<-0.38?2:1]; }); return psCv(S,Math.round(c),Math.round(c)); }); }
function drawBoomFx(s){ for(const f of ifx){ if(f.k!=='boom') continue; const [x,y]=iwp(f.x,f.y), t=f.t, Rs=f.R*s, sd=f.sd||0;
    if(t<0.05){ pctx.globalAlpha=0.9; pctx.fillStyle='#fff3c0'; pxRingE(pctx,x,y,Math.round(Rs*0.5),Math.round(Rs*0.5),Math.max(2,Math.round(3*s))); pctx.globalAlpha=1; pctx.fillStyle='#ffffff'; pxEll(pctx,x,y,Math.round(Rs*0.24),Math.round(Rs*0.24)); }   // (the white-hot first frames — held through the freeze)
    const q=clamp(t/0.2,0,1); if(q<1){ const Rr=Math.round(Rs*(0.35+0.65*Math.sqrt(q))); pctx.globalAlpha=0.6*(1-q); pctx.fillStyle='#46220a'; pxRingE(pctx,x,y,Rr+1,Rr+1,1);
      pctx.globalAlpha=1-q*0.7; pctx.fillStyle='#ff9a3c'; pxRingE(pctx,x,y,Rr,Rr,Math.max(1,Math.round(3*s*(1-q)))); }
    const q2=clamp((t-0.12)/0.45,0,1); if(q2>0 && q2<1){ const Rk=Math.round(Rs*(0.92+0.18*q2)); pctx.globalAlpha=0.45*(1-q2); pctx.fillStyle='#5a4a3a'; pxRingE(pctx,x,y,Rk,Rk,Math.max(1,Math.round(2*s))); }
    const st=t<0.06?0:t<0.13?1:t<0.22?2:t<0.3?3:t<0.42?4:5, g=Math.min(1,0.35+t/0.14), rise=Math.round(Math.max(0,t-0.18)*36*s), fade=t>0.42?clamp(1-(t-0.42)/0.2,0,1):1;
    if(fade>0){ pctx.globalAlpha=fade;
      for(let k=0;k<7;k++){ const h1=hash2(sd+k*13,k*7+3), h2=hash2(k*11+sd,sd+5), a=k/7*TAU+sd*0.37, d=k?Rs*0.24*(0.55+h1*0.6)*(0.6+0.6*g):0, r=Math.max(2,Math.round(Rs*(k?0.17+0.08*h2:0.26)*(0.55+0.65*g)));
        const o=boomPuff(r,Math.min(5,st+(k&&h2<0.35?1:0))); pctx.drawImage(o.cv,Math.round(x+Math.cos(a)*d)-o.ax,Math.round(y+Math.sin(a)*d*0.8)-rise-Math.round(k?h1*3*s:2*s)-o.ay); } }
    pctx.globalAlpha=1; } }
/* ---- (PT1 K7b) THE TILE PROPS' ART — painted texel by texel at the crawl's texel (a tile ≈ 15 texels), lit from the top-left, the dark SNES line round
   each (psOut), baked once (tSpr): COVER — a box on its tiles (its lid the tiles' depth ×0.6, its face a low wall's height): stacked crates · the atolls'
   wreck crates · a dry-stone wall in the shore's own rock (moss or heather on it) · an ice block · basalt columns (a glow at their seams) · broken masonry
   (a carved glyph) · a mine cart & timbers below ground — its cracks & chips as it takes blows · a CRACKED PILLAR on its 2×2 — a fluted temple column in
   the shore's ruin stone · a rough cave column · a crystal spire · a giant mushroom's stalk — always one crack (it reads: breakable), more each blow ·
   its STUMP · its SHAFT down the lane (psShaft: lean · lean · down) · RUBBLE heaps · the crash's dust (drawPropFx) ---- */
function propBK(){ return ISL ? (ISL.cave?'cave':ISL.biome.key) : 'tropic'; }
function propSK(bk){ return bk==='cave' && ISL && ISL.cave ? 'cave_'+ISL.biome.key : bk; }   // (G8 fix: a sprite's cache key — each shore's cave paints its own stone)
function propRampHex(v,bk){ const B=TB[bk]||TB.tropic;
  switch(v){ case 'crates': return ['#2a1a0c','#5e3e1e','#8e6234','#b8885a','#cca272','#ecc88e'];
    case 'wreck': return ['#161c16','#3a4438','#5e6a5c','#7c7a68','#a4a690','#c8c8b2'];
    case 'cart': return ['#0e0c0a','#2e2e36','#4e3a26','#6e5236','#8a6a48','#a8885e'];
    case 'timber': return ['#1e140a','#4a3420','#6a4a2a','#8a6a3a','#a8885a','#c8a878'];   // (SEAS & DEPTHS DE4) the Old Workings' rotten timber
    case 'ice': return ['#24384e','#3a6286','#6496bc','#94c4e0','#c4e4f4','#f4fcff'];
    case 'basalt': return RKR.basalt;
    case 'masonry': case 'temple': return RKR[B.ru]||RKR.sandstone;
    case 'spire': return TB.crystal.cr.spire[0];
    case 'stalk': return ['#3a3044','#5a4e66','#86788e','#b0a4b6','#d4ccd8','#f2eef4'];
    case 'stone': if(bk==='cave'){ const R=ISL && ISL.cave ? caveTI(ISL.biome).rock : RKR.granite, M=mixHex; return [R[0],R[2],R[4],R[5],M(R[5],'#ffffff',0.22),M(R[5],'#ffffff',0.42)]; }   // (a cave column: its rock lifted toward the lit floor — it stands out of the dark)
      return RKR[B.rk]||RKR.granite; }
  return RKR.granite; }
function propChipC(P){ const R=propRampHex(P.v,propBK()); return [R[0],R[1],R[3],R[4]]; }   // [its line, dark, mid, light] — chips, gibs & its rubble
function propDm(P,n){ return P.hp>=P.hp0 ? 0 : Math.min(n,Math.ceil((1-Math.max(0,P.hp)/P.hp0)*n)); }   // (how broken it looks: 0 … n)
/* cracks over a painted board (dm of them, longer each level — a lit lip beside each) in the box x0..x1 × y0..y1; dm ≥ 3: chips knocked off its top edge */
function psCracks(S,n,sd,cD,cL,B,chip,xl){ const w=S.w, d=S.d, x0=B?B[0]:1, x1=B?B[1]:w-2, y0=B?B[2]:1, y1=B?B[3]:S.h-2;   // (xl: each crack that many texels longer)
  for(let k=0;k<n;k++){ let x=Math.round(x0+(x1-x0)*(0.15+0.7*hash2(sd*3+k,11))), y=Math.round(y0+(y1-y0)*(0.1+0.45*hash2(sd+k*5,23))); const L=4+Math.round(hash2(k,sd)*3)+n+(xl||0), dx=hash2(sd,k+40)<0.5?1:-1;
    for(let i=0;i<L;i++){ if(x<1||y<1||x>=w-1||y>=S.h-1 || !d[y*w+x]) break; d[y*w+x]=cD; if(cL && d[y*w+x-1] && d[y*w+x-1]!==cD) d[y*w+x-1]=cL;
      if(hash2(x*3+k,y*7+sd)<0.45) x+=dx; y++; if(i===2 && n>2){ let bx=x, by=y; for(let j=0;j<3;j++){ bx-=dx; by++; if(bx>0&&by<S.h&&d[by*w+bx]) d[by*w+bx]=cD; } } } }
  if(chip) for(let x=x0;x<=x1;x++){ if(hash2(x*5+sd,77)>0.18*chip) continue; for(let y=0;y<S.h;y++) if(d[y*w+x]){ d[y*w+x]=0; if(hash2(x,sd)<0.5 && y+1<S.h) d[(y+1)*w+x]=0; break; } } }
/* COVER — w×h tiles (P.v its look) */
function coverSpr(P){ const bk=propBK(), dm=propDm(P,3), v=P.v||'stone', w=P.w, h=P.h;
  return tSpr('pc'+v+propSK(bk)+w+'x'+h+'d'+dm, ()=>{ const T=Math.max(8,Math.round(20*TSPR_S)), Wd=w*T, D=Math.round(h*T*0.6), C=cIR(propRampHex(v,bk)), sd=(w*7+h*13+v.length*5+bk.length*3)|0;
    const hf=v==='ice'?11:v==='stone'?9:10, top=(v==='crates'||v==='wreck')?14:v==='basalt'?6:v==='cart'?6:3, S=PS(Wd+4,D+hf+top+4), x0=2, yb=S.h-2;
    if(v==='crates'||v==='wreck') pcCrates(S,x0,yb,w,h,T,v,sd); else if(v==='cart') pcCart(S,x0,yb,w,h,T,sd);
    else if(v==='ice') pcIce(S,x0,yb,Wd,D,hf,C,sd); else if(v==='basalt') pcBasalt(S,x0,yb,Wd,D,hf,C,sd); else if(v==='masonry') pcMasonry(S,x0,yb,Wd,D,hf,C,sd,bk); else pcStone(S,x0,yb,Wd,D,hf,C,sd,bk);
    if(dm) psCracks(S,dm+1,sd+dm,v==='ice'?C[5]:C[0],v==='ice'?0:C[4],null,dm>=3?1:0);
    return psCv(psOut(S,C[0],false),(Wd+4)>>1,yb); }); }
function pcCrates(S,x0,yb,w,h,T,v,sd){ const p=PROP_ART[v==='wreck'?'wreck':'crate'].p, c=k=>cI(p[k]), dt=Math.round(T*0.6);
  const box=(bx,by,bw,lid,fc)=>{ for(let y=by-fc-lid;y<by-fc;y++) for(let x=bx;x<bx+bw;x++){ const u=x-bx, r=y-(by-fc-lid); psP(S,x,y,c(r===lid-1?'L':(u===0||u===bw-1||u%4===3)?'t':'T')); }   // the lid's boards (its front edge lit)
    for(let y=by-fc;y<by;y++) for(let x=bx;x<bx+bw;x++){ const u=x-bx, r=y-(by-fc); let k;
      if(u===0||u===bw-1||r===0||r===fc-1) k=(u===bw-1||r===fc-1)?'X':'x';                                                     // the frame (shaded right & foot)
      else { const a=(u-1)/Math.max(1,bw-3), b=(r-1)/Math.max(1,fc-3), d1=Math.abs(a-b), d2=Math.abs(a-1+b); k=Math.min(d1,d2)<0.1?(d1<d2?'x':'q'):(r%3===0?'q':u<bw*0.45?'P':'p'); }   // the brace · the planks
      psP(S,x,y,c(k)); }
    for(const [nx,ny] of [[1,by-fc+1],[bw-2,by-fc+1],[1,by-2],[bw-2,by-2]]) psP(S,bx+nx,ny,c('N')); };                          // nails
  for(let r=0;r<h;r++){ const by=yb-(h-1-r)*dt; for(let q=0;q<w;q++) box(x0+q*T,by,T-1,dt,10); }
  const q=sd%w, by=yb-10-Math.round(dt*0.35); box(x0+q*T+2,by,T-5,Math.round(dt*0.55),8);                                       // one crate stacked on the front row
  if(w>=3){ const q2=(q+2)%w; box(x0+q2*T+3,yb-10-Math.round(dt*0.3),T-7,Math.round(dt*0.5),7); }
  if(v==='wreck') for(let i=0;i<14;i++){ const x=x0+Math.floor(hash2(sd,i)*w*T), y=yb-1-Math.floor(hash2(i,sd+3)*(10+dt)); if(psG(S,x,y)) psP(S,x,y,cI(i%3?'#5e8a5a':'#ece6d0')); } }   // (barnacles & weed)
function pcStone(S,x0,yb,Wd,D,hf,C,sd,bk){ const M=bk==='moor'?cIR(['#3e2a4e','#5e3e74','#8458a0']):cIR(['#2c4422','#3c5c2e','#527a3c']), mos=bk==='moor'||bk==='meadow'||bk==='mushroom'||bk==='swamp'||bk==='bamboo'||bk==='tropic';
  for(let cr=0;cr*3<hf+3;cr++){ const y0=yb-hf+cr*3-1; let x=x0-((cr*2+sd)%4), j=0;                                              // the face: courses of rough stones, lit up-left, dark joints
    while(x<x0+Wd){ const sw=3+Math.floor(hash2(sd+cr*17,j*7)*4), sh=hash2(cr*5+sd,j*11);
      for(let yy=Math.max(y0,yb-hf);yy<Math.min(yb,y0+3);yy++) for(let xx=Math.max(x0,x);xx<Math.min(x0+Wd,x+sw);xx++){ const lx=xx-x, ly=yy-y0; let v;
        if((lx===sw-1 && xx<x0+Wd-1) || ly===2) v=0.7; else if(ly===0||lx===0) v=4.1; else v=2.4+sh*1.1+bayV(xx,yy)*0.5; if(yy>=yb-2) v-=0.8; psP(S,xx,yy,C[clamp(Math.floor(v),0,5)]); }
      x+=sw; j++; } }
  for(let y=yb-hf-D;y<yb-hf;y++){ const r=y-(yb-hf-D), band=Math.floor(r/3); let x=x0-((band*3+sd)%5), j=0;                       // the lid: flat capstones (moss or heather on them)
    while(x<x0+Wd){ const sw=4+Math.floor(hash2(sd+band*13,j*5+1)*4), sh=hash2(band*7+sd,j*3);
      for(let xx=Math.max(x0,x);xx<Math.min(x0+Wd,x+sw);xx++){ const lx=xx-x; let v=(lx===sw-1 && xx<x0+Wd-1)||r%3===2?1.4:3.5+sh*0.9+bayV(xx,y)*0.5; if(y===yb-hf-1) v=5.1; let c=C[clamp(Math.floor(v),0,5)];
        if(mos && v>2 && hash2(xx*3+sd,y*5)<0.22+0.25*Math.sin((xx+sd)*0.4)) c=M[clamp(Math.floor(1.2+bayV(xx,y)*1.4+(r<2?0.6:0)),0,2)]; psP(S,xx,y,c); }
      x+=sw; j++; } }
  for(const x of [x0,x0+Wd-1]) for(let y=yb-hf-D;y<yb-hf-D+2;y++) psP(S,x,y,0);                                                 // (rounded ends)
  for(let x=x0;x<x0+Wd;x++) if(hash2(x*7+sd,3)<0.2) psP(S,x,yb-hf-D,0); }                                                       // (a rough top)
function pcIce(S,x0,yb,Wd,D,hf,C,sd){ const W2=cI('#ffffff');
  for(let y=yb-hf;y<yb;y++) for(let x=x0;x<x0+Wd;x++){ const r=(y-(yb-hf))/hf, u=x-x0; let v=3.3-r*1.5+(hash2(x>>1,sd)<0.28?0.9:0)+bayV(x,y)*0.4; if(u===0) v=5.2; else if(u===Wd-1) v=1.6; if(y===yb-hf) v=5.1;
    psP(S,x,y,C[clamp(Math.floor(v),0,5)]); }
  { let x=x0+Math.round(Wd*0.33); for(let y=yb-hf+1;y<yb-3;y++){ psP(S,x,y,W2); if(hash2(y,sd)<0.5) x+=(hash2(y*3,sd)<0.5?1:-1); } }   // a white fracture inside
  for(let i=0;i<4;i++) psP(S,x0+2+Math.floor(hash2(sd,i)*(Wd-4)),yb-hf+2+Math.floor(hash2(i,sd)*(hf-4)),C[5]);                        // (bubbles)
  for(let y=yb-hf-D;y<yb-hf;y++) for(let x=x0;x<x0+Wd;x++){ const q=((x-(y-yb)*1.5+sd)%11+11)%11; let v=q<2?5.2:3.9+bayV(x,y)*0.5; if(y===yb-hf-D) v=3.2; psP(S,x,y,C[clamp(Math.floor(v),0,5)]);   // its lid: a diagonal sheen
    if(hash2(x*5+sd,y*3)<0.06) psP(S,x,y,W2); }                                                                                    // (a dust of snow)
  psP(S,x0,yb-hf-D,0); psP(S,x0+Wd-1,yb-hf-D,0); }
function pcBasalt(S,x0,yb,Wd,D,hf,C,sd){ const E=cIR(['#8a200a','#ff8a3c','#ffd060']), n=Math.max(2,Math.round(Wd/5)), cw=Wd/n;
  for(let k=0;k<n;k++){ const xa=Math.round(x0+k*cw), xb=Math.round(x0+(k+1)*cw), hk=hf+Math.round((hash2(sd,k)-0.4)*5), yt=yb-hk, mid=(xa+xb)/2;   // hexagonal columns: lit left face, shaded right
    for(let y=yt;y<yb;y++) for(let x=xa;x<xb;x++){ const lf=x+0.5<mid; let v=(lf?3.1:1.5)+((yb-y)/hk)*0.7+bayV(x,y)*0.5; if(x===xb-1) v=0.4; else if(x===xa) v=4.4; if(y>=yb-2) v-=0.7; psP(S,x,y,C[clamp(Math.floor(v),0,5)]); }
    const cd=Math.max(3,Math.round(D*0.75)); for(let y=yt-cd;y<yt;y++) for(let x=xa;x<xb;x++){ const r=y-(yt-cd), e=(x===xa||x===xb-1)&&(r===0||r===cd-1); if(e) continue; let v=4.3+bayV(x,y)*0.7; if(r===0) v=5.2; else if(r===cd-1) v=3.3; if(x===xb-1) v-=1.4; psP(S,x,y,C[clamp(Math.floor(v),0,5)]); }   // its flat hex top (a bright rim)
    if(hash2(k,sd+9)<0.55){ const L=2+Math.floor(hash2(sd,k+3)*4); for(let j=0;j<L;j++) psP(S,xb-1,yb-2-j,j===0?E[2]:j<L-1?E[1]:E[0]); } } }   // (lava glowing up a seam)   // (a glow of lava at a seam)
function pcMasonry(S,x0,yb,Wd,D,hf,C,sd,bk){ const br=x0+Math.round(Wd*(0.45+hash2(sd,5)*0.3)), G=cI(bk==='crystal'?'#8de9ff':'#2a1c10');
  for(let x=x0;x<x0+Wd;x++){ const ht=x<br?hf:x<br+3?hf-2-(x-br):hf-5, yt=yb-ht;                                                // cut blocks in courses — broken down past the break
    for(let y=yt;y<yb;y++){ const cr=Math.floor((yb-1-y)/4), ry=(yb-1-y)%4, off=(cr&1)?3:0, bx=((x-x0+off+sd)%7+7)%7; let v=(ry===3||bx===6)?1.1:2.7+hash2(cr*9+sd,Math.floor((x-x0+off)/7))*0.9+bayV(x,y)*0.5;
      if(ry===2 && bx!==6) v+=0.9; if(y===yt) v=4.6; psP(S,x,y,C[clamp(Math.floor(v),0,5)]); }
    for(let y=yt-D;y<yt;y++){ const r=y-(yt-D); let v=3.6+bayV(x,y)*0.6+(r%4===3?-1.6:0); if(y===yt-1) v=5.1; if(x>=br && r<2 && hash2(x,sd)<0.5) continue; psP(S,x,y,C[clamp(Math.floor(v),0,5)]); } }
  const gx=x0+3+Math.floor(hash2(sd,2)*Math.max(1,br-x0-8)), gy=yb-hf+3; for(const [ax,ay] of [[1,0],[0,1],[1,1],[2,1],[1,2]]) psP(S,gx+ax,gy+ay,G);   // a carved glyph (it glows on the crystal shore)
  for(let i=0;i<5;i++){ const x=br+3+Math.floor(hash2(i,sd)*Math.max(1,x0+Wd-br-4)); psP(S,x,yb-hf+5,C[1]); } }                     // (rubble on the broken course)
function pcCart(S,x0,yb,w,h,T,sd){ const p=PROP_ART.mine.p, c=k=>cI(p[k]), Fe=cIR(['#2a2a30','#4a4a52','#8a8a96']), Ore=cIR(['#3a3a42','#5a5a66','#7e7e8c','#a8a8b8']), dt=Math.round(T*0.6);
  const cart=(bx,by)=>{ const bw=T-1, fc=8, top=by-3-fc;                                                                      // a mine cart on its wheels, heaped with ore
    for(let y=top;y<by-3;y++){ const r=y-top, ins=Math.floor(r*0.25); for(let x=bx+ins;x<bx+bw-ins;x++){ const u=x-bx; let col=(u===ins+2||u===bw-3-ins)?Fe[(r===0)?2:1]:(r===0?Fe[2]:(r%3===2?c('q'):u<bw*0.5?c('P'):c('p'))); if(x===bx+bw-ins-1) col=Fe[0]; psP(S,x,y,col); } }
    for(let y=top-dt+2;y<top;y++) for(let x=bx+1;x<bx+bw-1;x++){ const r=y-(top-dt+2), q=Math.abs(x+0.5-bx-bw/2)/(bw/2); if(r<(dt-2)*q*0.8) continue; psP(S,x,y,Ore[clamp(Math.floor(1.6+bayV(x,y)*1.4+(hash2(x>>1,y)-0.5)*1.5-q),0,3)]); }   // its heap of ore
    for(const wx of [bx+3,bx+bw-4]){ psDisc(S,wx,by-2,2.2,2.2,(nx,ny)=>nx*nx+ny*ny<0.2?Fe[2]:Fe[0]); } };                  // the wheels (a lit hub)
  const posts=(bx,by)=>{ const bw=T-1, ht=12;                                                                                 // a timber barricade: posts & boards across
    for(let y=by-ht;y<by;y++) for(let x=bx;x<bx+bw;x++){ const u=x-bx, r=y-(by-ht), post=u===1||u===bw-2||u===Math.floor(bw/2); let k;
      if(post) k=r===0?'L':'x'; else if(r>=2&&r<=4 || r>=7&&r<=9) k=(r===2||r===7)?'T':(u%5===0?'q':'P'); else continue; psP(S,x,y,c(k)); }
    psP(S,bx+2,by-ht+3,c('N')); psP(S,bx+bw-3,by-ht+8,c('N')); };
  if(h>1){ posts(x0,yb-dt); cart(x0,yb); } else for(let q=0;q<w;q++) (q===sd%w?cart:posts)(x0+q*T,yb); }
/* a CRACKED PILLAR — standing (dm cracks) or its STUMP; anchored at its tiles' foot (centre) */
function pillarSpr(P,stump){ const bk=propBK(), dm=propDm(P,4), v=P.v||'temple';
  return tSpr('pp'+v+propSK(bk)+(stump?'s':'d'+dm), ()=>{ const T=Math.max(8,Math.round(20*TSPR_S)), Wd=2*T, Hs=Math.round(T*2.1), S=PS(Wd+8,Hs+T+22), cx=S.w/2, yb=S.h-2, sd=v.length*13+bk.length*7, C=cIR(propRampHex(v,bk));
    let y0=yb-11, ws=14, B=null;                                                                                               // (y0: the shaft's foot · ws its width)
    if(v==='temple'){ const step=(xa,xb,by,fc,dt)=>{ for(let y=by-fc-dt;y<by;y++) for(let x=xa;x<xb;x++){ const f=y>=by-fc; let vv=f?(y===by-fc?4.2:2.2+bayV(x,y)*0.5):(3.7+bayV(x,y)*0.6-(((x-xa+sd)%9)===8?1.6:0)); if(x===xb-1) vv-=1.2; psP(S,x,y,C[clamp(Math.floor(vv),0,5)]); } };
      step(Math.round(cx-T),Math.round(cx+T),yb,3,20); step(Math.round(cx-T+3),Math.round(cx+T-3),yb-7,2,11); y0=yb-15;
      if(bk==='ember'||bk==='swamp'||bk==='bamboo'||bk==='tropic'){ const M=cIR(['#2c4422','#3c5c2e','#527a3c']); for(let x=Math.round(cx-T);x<cx+T;x++) for(let y=yb-6;y<yb;y++) if(psG(S,x,y) && hash2(x*3+sd,y)<0.18) psP(S,x,y,M[(x+y)%3]); } }   // (moss on a jungle ruin's steps)
    else if(v==='timber'){ const SK=cIR(propRampHex('stone',bk)).map((c,i,a)=>a[Math.max(0,i-1)]);   // (SEAS & DEPTHS DE4) a timber set stands in a little spoil heap (the cave's rock, a step darker)
      psDisc(S,cx,yb-T*0.22,T*0.92,T*0.3,(nx,ny,x,y)=>{ const l=-(nx*0.6+ny*0.8)+(hash2(x>>1,y)-0.5)*0.9; return y>=yb?0:SK[clamp(Math.floor(2.2+l*1.5+bayV(x,y)*0.6),0,5)]; }); y0=yb-Math.round(T*0.3); }
    else { const MR=v==='spire'?cIR(RKR.crystone):v==='stalk'?cIR(['#1e1a2a','#2c2440','#3c3058','#4e4070','#62548a','#7a6aa6']):C;   // a mound at its foot: rock (crystal: dark crystone · a grove: violet moss)
      psDisc(S,cx,yb-T*0.55,T*0.98,T*0.6,(nx,ny,x,y)=>{ const l=-(nx*0.6+ny*0.8)+(hash2(x>>1,y)-0.5)*0.8; return y>=yb?0:MR[clamp(Math.floor(2.4+l*1.5+bayV(x,y)*0.6),0,5)]; }); y0=yb-Math.round(T*0.55); }
    const top=y0-(stump?6:Hs);
    if(v==='temple'){ ws=14; const xl=Math.round(cx-ws/2), xr=xl+ws;                                                                  // fluted, lit from the left, a moulding at its foot
      for(let y=top;y<y0;y++) for(let x=xl;x<xr;x++){ const u=(x+0.5-cx)/(ws/2), fl=(x-xl)%3; let vv=3.1-u*1.4+bayV(x,y)*0.5+(fl===1?-0.9:fl===2?0.3:0); if(y>y0-4) vv-=0.5; if(y<top+2 && !stump) vv-=0.6; psP(S,x,y,C[clamp(Math.floor(vv),0,5)]); }
      for(let y=y0-2;y<y0;y++) for(let x=xl-2;x<xr+2;x++) psP(S,x,y,C[clamp(Math.floor((y===y0-2?4.4:2.6)-(x>xr?1:0)),0,5)]);
      if(!stump){ for(let y=top-2;y<top;y++) for(let x=xl-2;x<xr+2;x++) psP(S,x,y,C[y===top-2?4:2]);                                   // the capital: echinus, abacus — its top broken (a ruin)
        const brk=x=>{ const u=(x-(xl-4))/(ws+8); return Math.max(0,Math.round(2.6*Math.max(0,u-0.55)/0.45+(hash2(x*5+sd,3)<0.2?1:0))); };   // (its abacus broken away down the right — a chip or two elsewhere)
        for(let y=top-6;y<top-2;y++) for(let x=xl-4;x<xr+4;x++){ const r=y-(top-6); if(r<brk(x)) continue; psP(S,x,y,C[r===brk(x)?(r===0?5:4):r===1?4:r===2?3:1]); } }
      B=[xl,xr-1,top+1,y0-3]; }
    else if(v==='stone'){ for(let y=top;y<y0+1;y++){ const t=(y0-y)/Hs, hw=8.2-2.4*Math.sin(Math.min(1,t)*Math.PI)+(hash2(y,sd)-0.5)*1.4, xo=Math.sin(t*2.3+sd)*1.3;   // a rough natural column: waisted, crooked, banded
        for(let x=Math.floor(cx+xo-hw);x<=Math.ceil(cx+xo+hw);x++){ const u=(x+0.5-cx-xo)/hw; if(Math.abs(u)>1) continue; let vv=2.8-u*1.5+bayV(x,y)*0.6+(hash2(x>>1,y>>1)-0.5)*0.7; const b=((y+sd)%5+5)%5; if(b===0) vv-=0.8; else if(b===1) vv+=0.4; if(y<top+2 && !stump) vv+=1.2; psP(S,x,y,C[clamp(Math.floor(vv),0,5)]); } }
      if(!stump){ let dcut=1; for(let x=Math.round(cx-10);x<cx+10;x++){ dcut=clamp(dcut+(hash2(x*3+sd,5)<0.5?1:-1),0,4); for(let y=top-1;y<top-1+dcut;y++) psP(S,x,y,0); if(psG(S,x,top-1+dcut)) psP(S,x,top-1+dcut,C[4]); } }   // (snapped off at the crown — a ragged edge, its broken face lit)
      B=[Math.round(cx-6),Math.round(cx+6),top+2,y0-3]; }
    else if(v==='spire'){ ws=14; const xl=Math.round(cx-ws/2), xr=xl+ws, tip=7;                                                       // a hexagonal crystal: lit face, the front, the dark face — bright facet lines, a point
      if(!stump){ const sx=Math.round(cx+8); for(let y=y0-14;y<y0;y++){ const r=y0-y, hw=Math.min(3,r<4?r*0.8:3); for(let x=Math.round(sx-hw);x<=Math.round(sx+hw);x++) psP(S,x-Math.round((14-r)*0.25),y,C[x<sx?3:2]); } }   // (a small one leaning beside it)
      for(let y=top;y<y0;y++){ const r=y-top, hw=!stump && r<tip ? ws/2*Math.max(0.12,r/tip) : ws/2;
        for(let x=Math.floor(cx-hw);x<Math.ceil(cx+hw);x++){ const u=(x+0.5-cx)/(ws/2); let c=u<-0.38?C[4]:u>0.34?C[2]:C[3]; if(Math.abs(u+0.38)<0.08||x===Math.floor(cx-hw)) c=C[5]; else if(Math.abs(u-0.34)<0.08) c=C[1]; if(hash2(x*7+sd,y*3)<0.05) c=C[5]; psP(S,x,y,c); } }
      B=[xl+1,xr-2,top+tip,y0-2]; }
    else if(v==='timber'){ ws=18; const WD=C, FE=cIR(['#2a2a30','#4a4a52','#6a6a6a','#9a9aa2']), RP=cIR(['#6a5a3a','#a8946a','#c8b890']), SP=cI('#b8945a'), SL=cI('#d8b47a');   // (SEAS & DEPTHS DE4) a mine's TIMBER SET: two posts under a cap beam, knee braces, iron brackets, a rope lashing — the roof's rock on its cap
      const pw=4, xl=Math.round(cx-T*0.62), xr=Math.round(cx+T*0.62)-pw, capH=4, cb=top+capH;
      const post=(x0,lit)=>{ for(let y=(stump?top:cb);y<y0;y++) for(let x=x0;x<x0+pw;x++){ const u=x-x0; let vv=u===0?(lit?4.3:3.5):u===pw-1?1.6:2.9; vv+=bayV(x,y)*0.5+((hash2(x*7+sd,(y>>2)+x0)<0.18)?-0.9:0); psP(S,x,y,WD[clamp(Math.floor(vv),1,5)]); } };
      post(xl,1); post(xr,0);
      if(!stump){ const c0=Math.round(cx-T*0.82), c1=Math.round(cx+T*0.82), RK=cIR(propRampHex('stone',bk));
        psDisc(S,cx,top-1,T*0.74,4.6,(nx,ny,x,y)=>{ if(y>=top) return 0; const l=-(nx*0.6+ny*0.8)+(hash2(x>>1,y)-0.5)*0.8; return RK[clamp(Math.floor(2.3+l*1.6+bayV(x,y)*0.6),0,5)]; });   // the roof's rock it holds up
        for(let y=top;y<cb;y++) for(let x=c0;x<c1;x++){ const r=y-top; let vv=r===0?4.4:r===capH-1?1.5:3.1-(x-c0)/(c1-c0)*0.7; vv+=bayV(x,y)*0.4+((hash2(x>>1,sd+y)<0.15)?-0.8:0); psP(S,x,y,WD[clamp(Math.floor(vv),1,5)]); }   // the cap beam
        for(const [x0,d] of [[xl+pw,1],[xr-1,-1]]) for(let k=0;k<6;k++){ const x=x0+d*k, y=cb+5-k; psP(S,x,y,WD[3]); psP(S,x,y+1,WD[1]); }   // knee braces
        for(const xb of [xl-1,xr-1]){ for(let y=cb-1;y<cb+3;y++) for(let x=xb;x<xb+pw+2;x++) psP(S,x,y,FE[y===cb-1?3:x===xb?2:1]); psP(S,xb+1,cb+1,FE[3]); psP(S,xb+pw,cb+1,FE[3]); }   // iron brackets at the joints
        const ly=Math.round(cb+(y0-cb)*0.48); for(let w=0;w<3;w++) for(let x=xr-1;x<xr+pw+1;x++) psP(S,x,ly+w*2+((x-xr+1)>>1),RP[(x+w)&1?1:2]);   // a rope lashing round the right post
        if(dm>=1){ const sx=xl+1, L2=Math.min(y0-cb-4,4+dm*5); for(let k=0;k<L2;k++){ const y=cb+3+k; psP(S,sx+((k>>2)&1),y,WD[0]); if(k%3===1) psP(S,xl-1,y,SP); if(k%4===2) psP(S,sx+2,y,SL); } } }   // cracked: the left post splits, splinters bristle
      B=[xl,xr+pw-1,stump?top:cb+2,y0-3]; }
    else { ws=11; const CAP=cIR(['#2a1438','#46205e','#6a3488','#9050b0','#b878d0','#d8a8ec']), GL=cIR(['#8de9ff','#e4fbff']);       // a giant mushroom's stalk & cap
      for(let y=top;y<y0;y++){ const r=y0-y, hw=ws/2+(r<3?1.5-r*0.5:0); for(let x=Math.floor(cx-hw);x<Math.ceil(cx+hw);x++){ const u=(x+0.5-cx)/hw; let vv=3.3-u*1.4+bayV(x,y)*0.4+(hash2(x,sd)<0.3?0.6:0); psP(S,x,y,C[clamp(Math.floor(vv),0,5)]); } }
      if(!stump){ const sk=top+Math.round(Hs*0.3); for(let x=Math.round(cx-8);x<cx+8;x++){ psP(S,x,sk,C[4]); psP(S,x,sk+1,C[2]); }
        const ry=7, cy=top+2; psDisc(S,cx,cy+3,T*0.9,3,(nx,ny,x,y)=>((x+y)&1)?cI('#3a2a44'):cI('#5a4a66'));
        psDisc(S,cx,cy,T,ry,(nx,ny,x,y)=>{ if(ny>0.45) return 0; const l=-(nx*0.55+ny*0.85); return CAP[clamp(Math.floor(2.6+l*1.7+bayV(x,y)*0.6),0,5)]; });
        for(let i=0;i<6;i++){ const a=hash2(sd*3+i,5)*TAU, d=Math.sqrt(hash2(sd*7+i,11))*0.8, x=cx+Math.cos(a)*d*T, y=cy+Math.sin(a)*d*ry*0.6-2; if(psG(S,x,y)){ psP(S,x,y,GL[0]); psP(S,x+1,y,GL[i&1]); } } }
      B=[Math.round(cx-5),Math.round(cx+4),top+Math.round(Hs*0.3)+3,y0-3]; }
    if(stump){ let dc=1; for(let x=Math.round(cx-9);x<cx+9;x++){ dc=clamp(dc+(hash2(x*3+sd,9)<0.5?1:-1),0,2); for(let y=top;y<=top+dc;y++) if(psG(S,x,y)) psP(S,x,y,y===top+dc?C[5]:C[4]); } }   // (the stump: its broken face lit, ragged)                             // (the stump: its broken top)
    else psCracks(S,1+Math.round(dm*1.4),sd+dm*17,v==='spire'?C[1]:C[0],v==='spire'||v==='stone'?C[5]:C[4],B,dm>=3?1:0,v==='stone'?1:0);   // always cracked (it reads: breakable) — a crack more each blow (G8 fix: the spire's dark with a bright lip · the cave column's lip brighter, a texel longer — both read in the dark)
    return psCv(psOut(S,C[0],false),Math.round(cx),yb); }); }
/* the falling/fallen SHAFT: from its foot (0,0) to its top (tx,ty) on the screen (texels) — a lean, a lean, then down the lane */
function pillarShaftSpr(P,tx,ty){ const bk=propBK(), v=P.v||'temple'; return tSpr('ps'+v+propSK(bk)+tx+'_'+ty, ()=>{ const T=Math.max(8,Math.round(20*TSPR_S)), ws=v==='stone'?15:v==='stalk'?11:v==='timber'?18:14, hw=ws/2, L=Math.hypot(tx,ty)||1, ux=tx/L, uy=ty/L, nx=-uy, ny=ux, M=Math.ceil(T)+4;
    const x0=Math.floor(Math.min(0,tx))-M, y0=Math.floor(Math.min(0,ty))-M, S=PS(Math.ceil(Math.abs(tx))+2*M+1,Math.ceil(Math.abs(ty))+2*M+1), C=cIR(propRampHex(v,bk)), lg=(nx*-0.6+ny*-0.8)>=0?1:-1, sd=v.length*5;
    for(let y=0;y<S.h;y++) for(let x=0;x<S.w;x++){ const px=x+x0+0.5, py=y+y0+0.5, al=px*ux+py*uy, pe=px*nx+py*ny, t=al/L; if(t<0||t>1.02) continue; let w2=hw;
      if(v==='temple' && t>0.9) w2=hw*1.4; else if(v==='spire' && t>0.8) w2=hw*Math.max(0.08,(1.02-t)/0.22); else if(v==='stone') w2=hw*(1-0.22*Math.sin(t*Math.PI))+(hash2(Math.round(al),7)-0.5)*1.4; else if(v==='stalk' && t>0.86) continue;
      else if(v==='timber' && t<0.86 && Math.abs(pe)<hw-4.5 && Math.abs(t-0.42)>0.03) continue;   // (DE4: a timber set goes down as its frame — two posts, a rung of brace, the cap beam at its end)
      if(Math.abs(pe)>w2) continue; const l=pe/w2*lg; let vv=2.7+l*1.4+bayV(x,y)*0.5+(v==='timber' && hash2(Math.round(al)>>2,Math.round(pe)+9)<0.2?-0.8:0), c;
      if(v==='temple'){ if(t<0.9){ const fl=Math.floor(pe+w2)%3; if(fl===1) vv-=0.9; else if(fl===2) vv+=0.3; } else vv+=t>0.95?1.2:0.5; if(Math.abs(t-0.9)<0.012) vv=1; }
      else if(v==='stone'){ const b=((Math.floor(al/3)+sd)%5+5)%5; if(b===0) vv-=0.8; else if(b===1) vv+=0.4; vv+=(hash2(Math.round(px)>>1,Math.round(py)>>1)-0.5)*0.6; }
      if(v==='spire'){ c=l>0.36?C[4]:l<-0.32?C[2]:C[3]; if(Math.abs(l-0.36)<0.1) c=C[5]; else if(Math.abs(l+0.32)<0.1) c=C[1]; } else c=C[clamp(Math.floor(vv),0,5)];
      if(t<0.04) c=C[4];                                                                                                         // (its broken foot)
      psP(S,x,y,c); }
    if(v==='stalk'){ const CAP=cIR(['#2a1438','#46205e','#6a3488','#9050b0','#b878d0','#d8a8ec']), cx=tx-x0-ux*2, cy=ty-y0-uy*2, R=T*0.85;   // its cap at the end
      psDisc(S,cx,cy,R,R*0.72,(qx,qy,x,y)=>CAP[clamp(Math.floor(2.6-(qx*0.55+qy*0.85)*1.6+bayV(x,y)*0.6),0,5)]);
      for(let i=0;i<5;i++){ const a=hash2(i,sd)*TAU, d=Math.sqrt(hash2(sd,i+3))*0.7; psP(S,cx+Math.cos(a)*d*R,cy+Math.sin(a)*d*R*0.7,cI(i&1?'#e4fbff':'#8de9ff')); } }
    return psCv(psOut(S,C[0],false),-x0,-y0); }); }
/* (PT1 K10b) an ARENA's STANDING STONE (1 tile): a tall one (~1.6 tiles) or a low one between, rough-hewn & leaning a little, lit from the top-left — grey with
   lichen (sandstone on the dry shores, dark on the burnt ones, a snow cap on the frost) · a tall one carries a carved RUNE, glowing #9ff0ff while the ring is sealed */
const STONE_R={grey:['#1c1a18','#3c3a34','#5e5a52','#8a8478','#a8a294','#c8c2b2'], sand:['#24180e','#4e3c28','#76604a','#9c866a','#bea684','#dcc6a0'], dark:['#100c0c','#2a2424','#443a38','#625652','#827470','#a0928c']};
const RUNE_G=['.#.','#.#','.#.','.#.','#.#'];                                                           // (its rune, 3×5 texels)
function stoneGrp(bk){ return bk==='dunes'||bk==='savanna'||bk==='ember'||bk==='atoll'?'sand':bk==='volcanic'||bk==='scorch'?'dark':'grey'; }
function stoneSpr(P,lit){ const bk=propBK(), gp=stoneGrp(bk), fr=bk==='frost'?1:0, sh=((P.tx*7+P.ty*13)%3+3)%3, tall=P.tall?1:0;
  return tSpr('pst'+gp+fr+sh+tall+(lit?1:0), ()=>{ const T=Math.max(8,Math.round(20*TSPR_S)), H=tall?Math.round(T*1.6):Math.round(T*0.7), Wd=tall?Math.max(6,Math.round(T*0.64)):Math.max(7,Math.round(T*0.82)), S=PS(T+6,H+5), cx=(T+6)/2, yb=S.h-2;
    const C=cIR(STONE_R[gp]), LC=gp==='grey'?cIR(['#4e6a36','#6a8a4a']):gp==='sand'?cIR(['#8a6a2a','#b08a3a']):null, SN=cIR(['#cfe0ea','#eef6fa']), sd=sh*31+tall*7+3, ln=(sh-1)*(tall?1.4:0.5);
    for(let y=yb-H;y<=yb;y++){ const r=(y-(yb-H))/H, hw=Wd/2*(0.8+0.2*r)*(r<0.16?Math.sqrt(Math.max(0.2,r/0.16)):1)+(hash2(y,sd)-0.5)*0.9, xc=cx+ln*(1-r);   // (a rounded crown, a thicker foot, a ragged edge, a lean)
      for(let x=Math.floor(xc-hw);x<Math.ceil(xc+hw);x++){ const u=(x+0.5-xc)/hw; let v=2.7-u*1.2+bayV(x,y)*0.45+(hash2(x*3+sd,y*5)-0.5)*0.7; if(y<yb-H+3) v+=1.1; if(y>=yb-1) v-=0.9;
        let c=C[clamp(Math.floor(v),0,5)];
        if(LC && r>0.3 && u<0.25 && hash2(x*7+sd,y*3)<0.2+0.3*r) c=LC[hash2(x,y+sd)<0.5?0:1];                                      // (lichen creeping up from its foot)
        if(fr && y<yb-H+3+(hash2(x,sd)<0.5?1:0)) c=SN[u<0?1:0];                                                                   // (a cap of snow)
        psP(S,x,y,c); } }
    let rx=0, ry=0; if(tall){ const gx=Math.round(cx+ln*0.4)-1, gy=Math.round(yb-H*0.68), G=RUNE_G;   // its RUNE — carved; alight while the ring is sealed
      for(let j=0;j<5;j++) for(let q=0;q<3;q++) if(G[j][q]==='#') psP(S,gx+q,gy+j,lit?cI(j===2?'#ffffff':'#9ff0ff'):C[1]); rx=gx-Math.round(cx); ry=gy-yb; }
    const o=psCv(psOut(S,C[0],false),Math.round(cx),yb); o.rx=rx; o.ry=ry; return o; }); }
/* (PT1 K10b) a sealed gateway's RUNE BARS (a tile): three bars of light, a pulse running up each, a band of runes across them, a dark foot (fr: the pulse's frame) */
function runeBarSpr(fr){ return tSpr('rbar'+fr, ()=>{ const T=Math.max(8,Math.round(20*TSPR_S)), H=Math.round(T*1.3), S=PS(T+2,H+3), yb=S.h-2, C=cIR(['#14303c','#2e7a98','#5cc8e4','#9ff0ff','#d8fbff','#ffffff']);
  for(let b=0;b<3;b++){ const x=Math.round(1+(b+0.5)*T/3); for(let y=yb-H;y<=yb;y++){ const ph=((y+fr*3+b*5)%7+7)%7; psP(S,x-1,y,C[2]); psP(S,x,y,ph===0?C[5]:C[4]); psP(S,x+1,y,C[3]); } }
  const by=yb-Math.round(H*0.55); for(let x=1;x<T+1;x++){ psP(S,x,by,C[3]); if((x+fr)%4===0){ psP(S,x,by-1,C[5]); psP(S,x,by+1,C[4]); } }
  for(let x=0;x<T+2;x++) psP(S,x,yb+1,C[0]);
  return psCv(S,Math.round((T+2)/2),yb); }); }
/* (PT1 K10b) the arena rings' gateways (after terrOverlay — under every body): sealed, the rune bars · won, they fade out (0.45 s) · post: again over the dark
   (islTells — they glow at night), with the tall stones' runes */
function ringBars(post){ const I=ISL, TS=I.TS, W=I.W, s=islScale(), hw=Math.round(TS*s/2), dk=post?clamp((LGT.dk-0.05)*1.6,0,0.85):1; if(!(dk>0)) return;
  for(const Rg of I.rings){ const a=dk*(Rg.st==='sealed'?1:(Rg.st==='won' && itime-Rg.ot<0.45)?1-(itime-Rg.ot)/0.45:0); if(!(a>0) || !islOnScr(Rg.x,Rg.y,Rg.R+60)) continue;
    const o=runeBarSpr(Math.floor(itime*8)%3);
    for(const k of Rg.gc){ const [X,Y]=iwp((k%W+0.5)*TS,(((k/W)|0)+0.5)*TS); pctx.globalAlpha=a*(0.84+0.16*Math.sin(itime*9+k)); pctx.drawImage(o.cv,X-o.ax,Y+hw-o.ay); }
    if(post && Rg.st==='sealed') for(const P of iprop){ if(P.rg!==Rg || !P.tall || P.gone || !islOnScr(P.x,P.y,40)) continue; const q=stoneSpr(P,true), X=iwp((P.tx+0.5)*TS,0)[0], Y=iwp(0,(P.ty+1)*TS)[1];   // (each tall stone's rune, alight over the dark)
      pctx.globalAlpha=a*(0.75+0.25*Math.sin(itime*5+P.id)); for(let j=0;j<5;j++) for(let x=0;x<3;x++) if(RUNE_G[j][x]==='#'){ pctx.fillStyle=j===2?'#ffffff':'#9ff0ff'; pctx.fillRect(X+q.rx+x,Y+q.ry+j,1,1); } } }
  pctx.globalAlpha=1; }
/* RUBBLE: a heap of its pillar's broken stone (crystal shards · mushroom chunks) */
function propRubbleSpr(P){ const bk=propBK(), v=P.v||'stone', dm=P.hp<P.hp0?1:0; return tSpr('pr'+v+propSK(bk)+dm, ()=>{ const T=Math.max(8,Math.round(20*TSPR_S)), S=PS(T+6,T+2), cx=S.w/2, yb=S.h-2, sd=v.length*7+3, C=cIR(propRampHex(v,bk));
  const L=[[-0.28,-0.18,0.3,0.22],[0.24,-0.16,0.28,0.2],[0.02,-0.42,0.27,0.2],[-0.36,0.02,0.18,0.14],[0.34,0.02,0.2,0.15],[0.05,-0.05,0.22,0.17]];
  L.sort((a,b)=>a[1]-b[1]); const by=yb-T*0.32;
  if(v==='timber') for(let i=0;i<6;i++){ if(dm && i===3) continue; const a=(hash2(sd,i)-0.5)*2.4, L2=T*(0.42+hash2(i,sd)*0.3), x=cx+(hash2(sd*3,i)-0.5)*T*0.55, y=by+(hash2(i*5,sd)-0.5)*T*0.35+T*0.1, ca=Math.cos(a), sa=Math.sin(a)*0.5;   // (SEAS & DEPTHS DE4) a timber set's heap: broken beams & splinters
    for(let k=-L2/2;k<L2/2;k++){ const px=x+ca*k, py=y+sa*k, e=Math.abs(k)>L2/2-1.5; psP(S,px,py-1,C[e?5:4]); psP(S,px,py,C[e?4:3]); psP(S,px,py+1,C[1]); } }
  else for(let i=0;i<L.length;i++){ if(dm && i===2) continue; const q=L[i], R=v==='stalk'&&i===2?cIR(['#2a1438','#46205e','#6a3488','#9050b0','#b878d0','#d8a8ec']):C;
    if(v==='spire'){ const x=cx+q[0]*T, y=by+q[1]*T+q[3]*T, hh=q[2]*T*1.6, hw2=q[3]*T*0.7; psPoly(S,[[x-hw2,y],[x-hw2*0.4,y-hh],[x+hw2*0.6,y-hh*0.8],[x+hw2,y]],(px,py)=>R[px+0.5<x?4:2]); psP(S,x-hw2*0.4,y-hh+1,R[5]); continue; }   // (a shard)
    psBall(S,cx+q[0]*T,by+q[1]*T,q[2]*T,q[3]*T,R,[cx,by-T*0.2,T*0.6],sd+i,1.1,0.8); }
  if(v==='temple' && !dm){ const x=cx-T*0.15, y=yb-3; psDisc(S,x,y,T*0.22,T*0.16,(nx,ny,px,py)=>C[clamp(Math.floor(3.4-(nx*0.6+ny*0.8)*1.2-(((px-x+20)|0)%3===0?0.9:0)),0,5)]); }   // (a fallen drum, fluted)
  return psCv(psOut(S,C[0],false),Math.round(cx),yb); }); }
/* draw a tile prop (drawProps' y-sorted pass) — its contact shadow, the sprite (a struck one jolts & flashes; a pillar's tell shudders; fallen: its stump) — and keep its
   place for the pass over the actors (PROPOV) · a standing pillar glints now & then */
const PROPOV=[], PCLIP=[];
function propWash(P,o,x,y){ if(!(last-P.fw<30)) return; const ga=pctx.globalAlpha; pctx.globalAlpha=ga*0.4; pctx.drawImage(whiteOf(o).cv,x,y); pctx.globalAlpha=ga; }   // (G8 fix: a struck wall or column takes a soft white wash for ≤ 2 frames of real time — never a white slab held through the freeze)
function drawPropTile(P,s){ const TS=ISL.TS, x0=Math.round((P.tx*TS-icamX)*s+IW/2), x1=Math.round(((P.tx+P.w)*TS-icamX)*s+IW/2), Y=Math.round(((P.ty+P.h)*TS-icamY)*s+IH/2), SHD=islShd(); let X=(x0+x1)>>1, o;
  const rx=Math.round(P.w*TS*s*0.55), ry=Math.max(2,Math.round(P.h*TS*s*0.2)+1), lit=P.k==='stone' && !!(P.rg && P.rg.st==='sealed');   // (R1a: the shadow's size from the tile's own span — no 1-texel flicker as the camera rounds)
  if(P.k==='stone' && !(P.fl>0)){ const B=P._cb; if(B && B.v===TSPR_V && B.lit===lit && B.rx===rx && B.ry===ry){ o=B.o; pctx.drawImage(B.cv,X+B.dx,Y+B.dy); propWash(P,o,X-o.ax,Y-o.ay); PROPOV.push(P,o,X-o.ax,Y-o.ay); return; } }   // (R1a: a standing stone never changes but for its rune — no lookups while it stays the same)
  const sh=shadowSprC(rx,ry,SHD[0],SHD[1]);
  if(P.k==='pillar' && P.st!=='idle'){ pctx.drawImage(sh.cv,X+2-sh.ax,Y-2-sh.ay); if(P.st==='down' || P.t<PROP.pillar.lean){ o=pillarSpr(P,true); pctx.drawImage(o.cv,X-o.ax,Y-o.ay); return; } X+=(Math.floor(itime*40)&1)?1:-1; }
  o=P.k==='pillar'?pillarSpr(P,false):P.k==='rubble'?propRubbleSpr(P):P.k==='stone'?stoneSpr(P,lit):coverSpr(P);   // (PT1 K10b: an arena's standing stone — its rune lit while the ring is sealed)
  if(P.fl>0 || (P.k==='pillar' && P.st!=='idle')){ if(P.fl>0){ if(!(P.k==='pillar' && P.st!=='idle')) pctx.drawImage(sh.cv,X+2-sh.ax,Y-2-sh.ay); X+=Math.round((Math.random()-0.5)*2.6*s); } pctx.drawImage(o.cv,X-o.ax,Y-o.ay); }   // (struck — it jolts off its shadow · a tipping pillar)
  else { let B=P._cb; if(!B || B.o!==o || B.sh!==sh){ const dx=Math.min(2-sh.ax,-o.ax), dy=Math.min(-2-sh.ay,-o.ay), c=document.createElement('canvas');   // (R1a: still, it's ONE blit — its shadow & its look baked together, re-made when either changes)
      c.width=Math.max(2-sh.ax+sh.w,o.w-o.ax)-dx; c.height=Math.max(-2-sh.ay+sh.h,o.h-o.ay)-dy; const g=c.getContext('2d'); g.drawImage(sh.cv,2-sh.ax-dx,-2-sh.ay-dy); g.drawImage(o.cv,-o.ax-dx,-o.ay-dy); B=P._cb={o, sh, cv:c, dx, dy}; }
    B.v=TSPR_V; B.lit=lit; B.rx=rx; B.ry=ry; pctx.drawImage(B.cv,X+B.dx,Y+B.dy); }
  const ox=X-o.ax, oy=Y-o.ay; propWash(P,o,ox,oy); PROPOV.push(P,o,ox,oy);
  if(P.k==='pillar' && P.st==='idle'){ const gph=((itime*0.55)+(P.x*0.013+P.y*0.007))%1.9; if(gph<0.14){ const ga=1-Math.abs(gph/0.14-0.5)*2, gx=X+Math.round(o.w*0.18), gy=oy+Math.round(o.h*0.35), q=Math.max(2,Math.round(2.6*s));   // "I'm breakable!"
      pctx.fillStyle='rgba(255,255,255,'+(0.95*ga).toFixed(3)+')'; pctx.fillRect(gx,gy-q,1,q*2+1); pctx.fillRect(gx-q,gy,q*2+1,1); } } }
/* THE PASS OVER THE ACTORS (after you're drawn): a tile prop is drawn again over whoever stands BEHIND it (clipped to their looks — never over one in front) ·
   you behind one: your cream rim shows through · then every falling or fallen pillar's shaft, over everyone in its lane */
function drawPropOver(evis){ const V=PROPOV, C=PSPR.lc, pOK=!!C && C!==PIX_NONE; let ux0=1e9, uy0=1e9, ux1=-1e9, uy1=-1e9;
  if(V.length){ if(pOK){ ux0=PSPR.lx+C.ox; uy0=PSPR.ly+C.oy; ux1=ux0+C.w; uy1=uy0+C.h; }   // (R1a: the box round every actor drawn — a prop clear of it covers no one, and skips the crowd's loop)
    for(const en of evis){ const E=en._C; if(!E || E===PIX_NONE || en._ex==null || en.dead) continue; const ax=en._ex+E.ox, ay=en._ey+E.oy; if(ax<ux0) ux0=ax; if(ay<uy0) uy0=ay; if(ax+E.w>ux1) ux1=ax+E.w; if(ay+E.h>uy1) uy1=ay+E.h; } }
  for(let i=0;i<V.length;i+=4){ const P=V[i], o=V[i+1], rx0=V[i+2], ry0=V[i+3], rx1=rx0+o.w, ry1=ry0+o.h, R=PCLIP; R.length=0; let pB=false;
    if(rx1<=ux0 || rx0>=ux1 || ry1<=uy0 || ry0>=uy1) continue;
    if(pOK && player.y<P.y){ const ax=PSPR.lx+C.ox, ay=PSPR.ly+C.oy; if(ax<rx1 && ax+C.w>rx0 && ay<ry1 && ay+C.h>ry0){ R.push(ax,ay,C.w,C.h); pB=true; } }
    for(const en of evis){ const E=en._C; if(en.y>=P.y || !E || E===PIX_NONE || en._ex==null || en.dead) continue; const ax=en._ex+E.ox, ay=en._ey+E.oy; if(ax<rx1 && ax+E.w>rx0 && ay<ry1 && ay+E.h>ry0) R.push(ax,ay,E.w,E.h); }
    if(!R.length) continue;
    pctx.save(); pctx.beginPath(); for(let j=0;j<R.length;j+=4) pctx.rect(R[j],R[j+1],R[j+2],R[j+3]); pctx.clip(); pctx.drawImage(o.cv,rx0,ry0); propWash(P,o,rx0,ry0); pctx.restore();
    if(pB){ const rm=rimOf(C); if(rm){ pctx.globalAlpha=0.9; pctx.drawImage(rm.cv,PSPR.lx+C.ox,PSPR.ly+C.oy); pctx.globalAlpha=1; } } }
  for(const P of iprop) if(P.k==='pillar' && !P.gone && (P.st==='down' || (P.st==='tell' && P.t<PROP.pillar.lean))) drawPillarShaft(P); }
function drawPillarShaft(P){ const Ln=P.lane; if(!Ln) return; const s=islScale(), T=Math.max(8,Math.round(20*TSPR_S)), B=iwp(P.x,P.y), Hs=Math.round(T*2.1);
  const th=P.st==='down' ? 1 : (1-P.t/PROP.pillar.lean)<0.5 ? 0.42 : 0.8, a=th*Math.PI/2, Lt=Ln.L*s, tx=Math.round(Ln.ux*Lt*Math.sin(a)), ty=Math.round(Ln.uy*Lt*Math.sin(a)-Hs*Math.cos(a)), o=pillarShaftSpr(P,tx,ty);
  const TS=ISL.TS, fB=iwp(P.x,(P.ty+P.h)*TS)[1], by=fB-(P.v==='temple'?15:Math.round(T*0.55))-((P.st==='down' && P.t0-P.t<0.05)?1:0); pctx.drawImage(o.cv,B[0]-o.ax,by-o.ay); }
/* a pillar's TELL (with the tells — over the dark at night): its lane on the ground, its shadow filling in from its foot as it tips, a warm edge each side */
function pillarWarm(P){ const k=P.wm|0, Ln=P.lane; if(k>4 || !Ln) return; P.wm=k+1; const s=islScale();   // (PT1 K11) the crash's art baked ahead, a piece a frame through the tell: the shaft's three looks (drawPillarShaft's sums), then the dust puffs' two rows — the first crash cost a 42 ms frame cold
  if(k<3){ const T=Math.max(8,Math.round(20*TSPR_S)), Hs=Math.round(T*2.1), a=[0.42,0.8,1][k]*Math.PI/2, Lt=Ln.L*s; pillarShaftSpr(P,Math.round(Ln.ux*Lt*Math.sin(a)),Math.round(Ln.uy*Lt*Math.sin(a)-Hs*Math.cos(a))); return; }
  for(let r=1;r<=Math.max(1,Math.round(6.8*s*1.25));r++) boomPuff(r,k===3?6:7); }
function pillarTell(P,s){ const Ln=P.lane; if(!Ln) return; pillarWarm(P); const [bx,by]=iwp(P.x+Ln.ux*Ln.e,P.y+Ln.uy*Ln.e), p=clamp(1-P.t/(P.t0||1),0,1), L=Math.max(2,(Ln.L-Ln.e)*s), hw=Math.max(2,Math.round(PROP.pillar.w*ISL.TS*s/2)), c=Ln.ux, si=Ln.uy;
  pctx.fillStyle='#1a0e04'; pctx.globalAlpha=0.2; pxLane(pctx,bx,by,P.fa,L,hw,hw); pctx.globalAlpha=0.45+0.2*p; pxLane(pctx,bx,by,P.fa,L*(0.15+0.85*p),hw,hw);
  pctx.fillStyle='#ff7a3c'; pctx.globalAlpha=0.35+0.45*p; for(const o of [-hw,hw]) pxLine(bx-si*o,by+c*o,bx+c*L-si*o,by+si*L+c*o); pxLine(bx+c*L-si*hw,by+si*L+c*hw,bx+c*L+si*hw,by+si*L-c*hw);
  pctx.globalAlpha=1; }
/* the crash's dust down the lane: puffs swelling & rising, then thinning (whole texels — baked puffs) */
function drawPropFx(s){ for(const f of ifx){ if(f.k!=='pdust') continue; const p=clamp(f.t/f.life,0,1), n=Math.max(3,Math.round((f.L-f.e)/11));
    for(let k=0;k<=n;k++){ const h1=hash2(f.sd+k*7,k*3+1), h2=hash2(k*5+1,f.sd+k), q=clamp((p-h2*0.18)/(1-h2*0.18),0,1); if(q<=0) continue;   // (each puff its own beat — they roll up out of the stone one after another)
      const d=f.e+(f.L-f.e)*(k+h2*0.6-0.3)/n, side=(h1-0.5)*2, [sx,sy]=iwp(f.x+f.ux*d-f.uy*side*(10+18*q),f.y+f.uy*d+f.ux*side*(10+18*q)), r=Math.max(1,Math.round((1.6+3.4*Math.sqrt(q)+h2*1.8)*s*1.25)), o=boomPuff(r,q<0.35?6:7);
      pctx.globalAlpha=Math.min(1,(1-q)*1.6)*(0.55+0.45*h1); pctx.drawImage(o.cv,sx-o.ax,sy-Math.round(q*(8+h1*8)*s)-o.ay); }
    pctx.globalAlpha=1; } }
/* ---- (PT1 K8) THE TRAPS' ART — whole texels, lit from the top-left, the dark SNES line: a SPIKE PLATE — a 1-tile iron grate (3×3 holes, a lit rim, rivets; a
   bamboo shore's punji pit, a cave's rusted one) and its spikes out of each hole (the tips peek · 4 texels up) · a DART TRAP — a flagstone with a worn chevron
   pointing at its wall, and the carved face on the rim (3 holes — they flash as it arms) · LOOSE ROCKS — scree spilling over the rim & cracked ground (below
   ground: a dark crack in the roof's shadow) and the rocks that fall (an icicle on the frost, a shard on the crystal) ---- */
function spikeSpr(v,h){ const g=Math.max(9,Math.round(20*TSPR_S)); return tSpr('tsp'+v+h+'_'+g, ()=>{ const top=5, S=PS(g+2,g+top+2), x0=1, y0=top, pj=v==='punji', rs=v==='rust';
  const RIM=cI(pj?'#9a7a48':rs?'#7a6656':'#6a6a78'), BD=cI(pj?'#4a3620':rs?'#463a32':'#3a3a44'), BD2=cI(pj?'#3e2c1a':rs?'#3c312a':'#32323b'), DK=cI(pj?'#2a1e10':rs?'#29211c':'#24242c'), HO=cI(pj?'#0c0804':'#111116'), HI=cI(pj?'#b8b060':rs?'#9a8270':'#8a8a98'), BM=cI('#7a7a30');
  const H3=[0.25,0.5,0.75].map(f=>Math.round(g*f)-1), inH=q=>H3.some(o=>q===o||q===o+1);
  for(let y=0;y<g;y++) for(let x=0;x<g;x++){ let c;
    if(x===0||y===0) c=RIM; else if(x===g-1||y===g-1) c=DK;
    else if(pj) c=(x===1||y===1||x===g-2||y===g-2)?(((x+y)>>1)&1?HI:BM):(bayV(x,y)>0.3?DK:HO);                                    // a punji pit: a bamboo frame round the dark
    else c=(inH(x)&&inH(y))?HO:(inH(x) && H3.some(o=>y===o-1))?DK:(bayV(x,y)>0.35?BD2:BD);                                         // the holes (a shadowed lip over each) in the iron
    psP(S,x0+x,y0+y,c); }
  if(!pj) for(const [rx,ry] of [[1,1],[g-2,1],[1,g-2],[g-2,g-2]]) psP(S,x0+rx,y0+ry,HI);                                            // rivets
  if(h>0){ const SP=cI(pj?'#d8c070':'#d8d8e0'), SD=cI(pj?'#8a7a3a':'#9a9aa8'), TIP=cI(pj?'#f4e8b0':'#ffffff'), OL=cI(pj?'#2a2010':'#1a1a22');
    for(const hy of H3) for(const hx of H3){ const c=x0+hx, b=y0+hy+1, t=b-h;                                                      // a spike out of each hole: a white tip, its right side shaded, a dark line round what stands over the grate
      for(let y=t;y<=b;y++){ psP(S,c,y,y===t?TIP:SP); if(y>t) psP(S,c+1,y,SD); if(y<y0+hy){ psP(S,c-1,y,OL); psP(S,c+2,y,OL); } }
      if(t<y0+hy){ psP(S,c,t-1,OL); psP(S,c+1,t,OL); } } }
  psOut(S,cI(pj?'#140e06':'#141418'),false); return psCv(S,(g+2)>>1,y0+(g>>1)); }); }
function dartPlateSpr(dir,pr){ const bk=propBK(), g=Math.max(7,Math.round(15*TSPR_S)); return tSpr('tdp'+propSK(bk)+dir+(pr?1:0)+'_'+g, ()=>{ const C=cIR(propRampHex(bk==='cave'?'stone':'masonry',bk)), S=PS(g+2,g+3), x0=1, y0=1+(pr?1:0);
  for(let y=0;y<g;y++) for(let x=0;x<g;x++){ let v=(x===0||y===0)?4.4:(x===g-1||y===g-1)?1.2:2.9+bayV(x,y)*0.8+(hash2(x>>1,(y>>1)+7)-0.5)*0.6; if(pr) v-=0.9; psP(S,x0+x,y0+y,C[clamp(Math.floor(v),0,5)]); }   // a flagstone (pressed: sunk a texel, darker)
  const m=(g-1)/2, L=Math.max(2,Math.round(g*0.24)), ux=dir==='E'?-1:dir==='W'?1:0, uy=dir==='S'?-1:dir==='N'?1:0;              // its worn glyph: a chevron pointing back at the face on the wall
  for(let k=-L;k<=L;k++){ const a=Math.abs(k), px=x0+m+ux*(L*0.5-a)-uy*k, py=y0+m+uy*(L*0.5-a)+ux*k; psP(S,px,py,C[pr?0:1]); psP(S,px,py+1,C[4]); }
  psOut(S,C[0],false); return psCv(S,(g+2)>>1,y0+(g>>1)); }); }
function dartFaceSpr(dir,lit){ const bk=propBK(), w=Math.max(8,Math.round(18*TSPR_S)); return tSpr('tdf'+propSK(bk)+dir+(lit?1:0)+'_'+w, ()=>{ const R=propRampHex(bk==='cave'?'stone':'masonry',bk), C=cIR(R.map(h=>mixHex(h,'#2a2a30',0.28))), fh=Math.round(w*0.95), td=Math.round(w*0.4), S=PS(w+2,fh+td+3), x0=1, yb=S.h-2;   // (a worked stone, a shade greyer than the shore's rock — it never reads as scenery)
  const OC=[cI('#a8402a'),cI('#6e2416')], sd=dir==='E'?w-4:dir==='W'?0:-9, side=x=>sd>=0 && x>=sd && x<sd+4;                       // an ochre war-band · (E / W: the side it looks out of, a shade darker)
  for(let y=yb-fh-td;y<yb-fh;y++) for(let x=0;x<w;x++) psP(S,x0+x,y,C[clamp(Math.floor((y===yb-fh-td?5:4.1)+bayV(x,y)*0.6-(x===w-1?1.5:0)),0,5)]);   // its top, lit
  for(let y=yb-fh;y<yb;y++) for(let x=0;x<w;x++){ let v=2.6+bayV(x,y)*0.7+(x===0?1:0)-(x===w-1?1:0)-(y>=yb-2?0.8:0)-(side(x)?0.9:0); if(y===yb-fh) v=1.4; psP(S,x0+x,y,C[clamp(Math.floor(v),0,5)]); }   // its face
  const by=yb-fh+2; for(let x=1;x<w-1;x++){ psP(S,x0+x,by,OC[(x>>1)&1]); psP(S,x0+x,by+1,OC[1]); }                               // the band, zig-zagged
  const HO=lit?[cI('#ff8a3c'),cI('#ffe080')]:[cI('#0a0604'),C[5]], put=(x,y)=>{ psP(S,x,y,HO[0]); psP(S,x+1,y,HO[0]); psP(S,x,y+1,HO[0]); psP(S,x+1,y+1,HO[0]); psP(S,x,y+2,HO[1]); psP(S,x+1,y+2,HO[1]); };   // its 3 holes, a lit lip under each (armed: they glow)
  const ey=by+3, eye=x=>{ psP(S,x0+x,ey,C[0]); psP(S,x0+x+1,ey,C[0]); psP(S,x0+x,ey+1,C[4]); };                                   // carved eyes over the maw
  if(dir==='S'){ eye(Math.round(w*0.25)-1); eye(Math.round(w*0.75)-1); const y=Math.min(yb-4,ey+3); for(const f of [0.22,0.5,0.78]) put(x0+Math.round(w*f)-1,y); }
  else if(dir==='N'){ const y=yb-fh-td+1; for(const f of [0.22,0.5,0.78]) put(x0+Math.round(w*f)-1,y-1); }
  else { eye(dir==='E'?w-7:4); const x=dir==='E'?x0+w-3:x0+1; for(const f of [0.4,0.62,0.84]) put(x,yb-fh+Math.round(fh*f)-2); }
  psOut(S,C[0],false); return psCv(S,(w+2)>>1,yb); }); }
function rkCrackSpr(v,sd){ const bk=propBK(), Rs=Math.max(8,Math.round(TRAP.rockfall.R*TSPR_S)); return tSpr('trc'+v+propSK(bk)+sd+'_'+Rs, ()=>{ const n=Rs*2+5, S=PS(n,n), c=n>>1, C=cIR(propRampHex(v,bk)), K=cIA('#120c06',0.72), Lp=cIA('#ffffff',0.2);
  for(let k=0;k<5;k++){ let a=(k/5)*TAU+hash2(sd,k)*0.9, x=c+Math.cos(a)*2, y=c+Math.sin(a)*2; const L=Rs*(0.45+0.4*hash2(k,sd+3));   // the ground cracked under them
    for(let i=0;i<L;i++){ a+=(hash2(i+k*7,sd)-0.5)*0.5; x+=Math.cos(a); y+=Math.sin(a)*0.8; psP(S,x,y,K); if(hash2(i,k+sd)<0.8) psP(S,x+1,y+1,Lp); } }
  for(let k=0;k<16;k++){ const a=(k/16)*TAU+hash2(k*3,sd+11)*0.6, d=Rs*(k&1?0.35+0.3*hash2(sd,k*5):0.7+0.25*hash2(sd,k*5)), x=Math.round(c+Math.cos(a)*d), y=Math.round(c+Math.sin(a)*d*0.8);   // gravel already down — strewn over the ground they'll strike
    psP(S,x,y,C[4]); psP(S,x+1,y,C[2]); psP(S,x,y+1,C[1]); if(k%3===0){ psP(S,x+1,y-1,C[5]); psP(S,x+2,y,C[1]); } }
  return psCv(S,c,c); }); }
function rkShadowSpr(v,sd){ const bk=propBK(), Rs=Math.max(8,Math.round(TRAP.rockfall.R*TSPR_S)); return tSpr('trd'+v+propSK(bk)+sd+'_'+Rs, ()=>{ const n=Rs*2+5, S=PS(n,n), c=n>>1, A=cIA('#000000',0.34), B=cIA('#000000',0.62), RH=propRampHex(v||'stone',bk), C=cIR(RH), Lp=cIA(RH[4],0.55);
  for(let y=0;y<n;y++) for(let x=0;x<n;x++){ const dx=(x+0.5-c)/(Rs*0.85), dy=(y+0.5-c)/(Rs*0.6), q=dx*dx+dy*dy+(hash2(x>>1,(y>>1)+sd)-0.5)*0.35; if(q<0.75 || (q<1 && bayV(x,y)+0.5>(q-0.75)*4)) psP(S,x,y,A); }   // the roof's crack, its shadow on the floor
  const K=new Set(); for(let k=0;k<4;k++){ let a=(k/4)*TAU+hash2(sd,k)*1.2, x=c, y=c; for(let i=0;i<Rs*0.75;i++){ a+=(hash2(i+k*5,sd+1)-0.5)*0.6; x+=Math.cos(a); y+=Math.sin(a)*0.65; psP(S,x,y,B); if(i>1) K.add(Math.floor(x)+','+Math.floor(y)); } }
  for(const q of K){ const [x,y]=q.split(',').map(Number); if(!K.has(x+','+(y+1))) psP(S,x,y+1,Lp); }                       // (G9 fix: a lit lip under the crack)
  for(const [px,py,ci] of [[0,-1,4],[-1,0,3],[0,0,4],[1,0,2],[2,0,3],[-1,1,0],[0,1,1],[1,1,0]]) psP(S,c+px,c+py,C[ci]);          // (G9 fix: a little pile of fallen pebbles at its heart)
  return psCv(S,c,c); }); }
function rkScreeSpr(v,d8){ const bk=propBK(), F=Math.max(8,Math.round(18*TSPR_S)); return tSpr('trs'+v+propSK(bk)+d8+'_'+F, ()=>{ const n=F*2+12, S=PS(n,n+6), c=n>>1, C=cIR(propRampHex(v,bk)), a0=d8*Math.PI/4+Math.PI, ca=Math.cos(a0), sa=Math.sin(a0), L=[], K=Math.max(1,TSPR_S*1.35);   // the rim's LOOSE ROCK: an outcrop hanging over the edge, scree spilt below it
  const at=(d,w)=>[c+ca*d-sa*w, c+(sa*d+ca*w)*0.8];
  for(let k=0;k<7;k++){ const p=at(1+hash2(k*3,d8)*F*0.85,(hash2(k,d8+5)-0.5)*F*0.9); L.push([p[0],p[1],Math.max(1.2,(1.6+hash2(k,7)*0.9)*K)]); }   // the scree — chips on the floor
  if(v==='ice'||v==='spire') for(let k=-2;k<=2;k++){ const p=at(-2-Math.abs(k),k*F*0.22), x=Math.round(p[0]), y=Math.round(p[1]), Lh=Math.round((5+2*hash2(k+3,d8))*K*0.8), w=Math.max(1,Math.round(1.2*K));   // icicles hanging off the rim · crystal shards jutting from it
      if(v==='ice') psPoly(S,[[x-w,y-Lh*0.4],[x+w+1,y-Lh*0.4],[x+0.5,y+Lh*0.6]],(px)=>C[px<x+0.5?5:3]); else psPoly(S,[[x-w,y+2],[x+w+1,y+2],[x+0.5,y-Lh]],(px)=>C[px<x+0.5?4:2]); }
  else for(let k=0;k<3;k++){ const p=at(-3-k*1.5,(k-1)*F*0.32); L.push([p[0],p[1]-k*0.5,(3.2-0.4*k+hash2(k,d8)*0.6)*K]); }   // stone: boulders perched on the edge, ready to go
  const CL=[C[1],C[2],C[3],C[4],C[5],C[5]]; L.sort((p,q)=>p[1]-q[1]); for(let k=0;k<L.length;k++){ const q=L[k]; psBall(S,q[0],q[1],q[2],q[2]*0.8,CL,null,d8*13+k,1,0.6); }   // (G9 fix: a shade lighter than the rim's rock)
  psOut(S,cI('#141418'),false); return psCv(S,c,c); }); }   // (G9 fix: a dark line round it, as the grates have)
function rkBoulderSpr(v,f){ const bk=propBK(), r=Math.max(2.5,5*TSPR_S); return tSpr('trb'+v+propSK(bk)+f+'_'+Math.round(r*2), ()=>{ const sz=Math.ceil(r*2)+6, S=PS(sz,Math.ceil(r*3)+6), cx=sz/2, by=S.h-3, C=cIR(propRampHex(v,bk));
  if(v==='ice'||v==='spire') psPoly(S,[[cx-r,by-r*2.4],[cx+r,by-r*2.4],[cx+r*0.15,by]],(px)=>C[px<cx?4:2]);                     // an icicle · a crystal shard, point down
  else psBall(S,cx,by-r,r,r*0.9,C,null,f*7+3,1.1,0.8);                                                                            // a rock in the shore's own stone
  psOut(S,C[0],false); return psCv(S,Math.round(cx),by); }); }
/* the traps on the ground (before the props — flat underfoot): the grates & their spikes · a dart trap's flagstone & its face on the wall · loose rocks' scree & cracks */
function drawTraps(s){ if(!itrap.length) return; const TS=ISL.TS, cv=!!ISL.cave;
  for(const P of itrap){ if(P.st==='spent') continue;
    if(P.k==='spike'){ if(!islOnScr(P.x,P.y,24)) continue; const [sx,sy]=iwp(P.x,P.y), h=P.st==='arm'?1:P.st==='up'?4:P.st==='reset'?(P.t>0.75?4:P.t>0.6?2:P.t>0.45?1:0):0, o=spikeSpr(P.v,h);
      pctx.drawImage(o.cv,sx-o.ax,sy-o.ay); continue; }
    if(P.k==='dart'){ const dir=P.ny>0?'S':P.ny<0?'N':P.nx>0?'E':'W';
      if(islOnScr(P.x,P.y,20)){ const [sx,sy]=iwp(P.x,P.y), o=dartPlateSpr(dir,P.st==='arm'); pctx.drawImage(o.cv,sx-o.ax,sy-o.ay); }
      if(islOnScr(P.ex,P.ey,30)){ const [ex,ey]=iwp(P.ex,P.ey+TS/2), o=dartFaceSpr(dir,P.st==='arm' && (Math.floor(itime*20)&1)===0); pctx.drawImage(o.cv,ex-o.ax,ey-o.ay); }
      continue; }
    if(!islOnScr(P.x,P.y,P.R+30)) continue; const [sx,sy]=iwp(P.x,P.y);
    if(cv){ const o=rkShadowSpr(P.v,P.id%2); pctx.drawImage(o.cv,sx-o.ax,sy-o.ay); continue; }
    { const o=rkCrackSpr(P.v,P.id%2); pctx.drawImage(o.cv,sx-o.ax,sy-o.ay); }
    if(P.wx!=null){ const [wx,wy]=iwp(P.wx,P.wy), o=rkScreeSpr(P.v,((Math.round(P.wa/(Math.PI/4))%8)+8)%8); pctx.drawImage(o.cv,wx-o.ax,wy-o.ay); } } }
/* the traps' TELLS (with the tells — over the dark at night): an armed plate's red frame · a dart trap's line as it arms · loose rocks' shadows & rings */
function trapTells(s){ for(const P of itrap){
    if(P.k==='spike'){ if(P.st!=='arm' || !islOnScr(P.x,P.y,20)) continue; const [sx,sy]=iwp(P.x,P.y), h=Math.round(TRAP.spike.hw*s)+1;
      pctx.fillStyle='#ff4632'; pctx.globalAlpha=0.55+0.4*Math.sin(itime*40); pctx.fillRect(sx-h,sy-h,2*h+1,1); pctx.fillRect(sx-h,sy+h,2*h+1,1); pctx.fillRect(sx-h,sy-h,1,2*h+1); pctx.fillRect(sx+h,sy-h,1,2*h+1); pctx.globalAlpha=1; continue; }
    if(P.k==='dart'){ if(P.st!=='arm' || !islOnScr(P.x,P.y,TRAP.dart.L)) continue; const TS=ISL.TS, ox=P.ex+P.nx*(TS/2+2), oy=P.ey+P.ny*(TS/2+2), p=clamp(1-P.t/(P.t0||1),0,1); let L=TRAP.dart.L;
      for(let d=6;d<=TRAP.dart.L;d+=6){ const t=islTile(ox+P.nx*d,oy+P.ny*d); if(t===W_WALL||t===W_GATE){ L=d; break; } }
      const [sx,sy]=iwp(ox,oy), n=Math.round(L*s); pctx.fillStyle='#ff4632'; pctx.globalAlpha=0.4+0.55*p;   // (the line is square to the tiles: a dash of 2 texels, a gap of 2 — one rect a dash)
      for(let i=0;i<n;i+=4) pctx.fillRect(Math.round(sx+P.nx*i)-(P.nx<0?1:0),Math.round(sy+P.ny*i)-(P.ny<0?1:0),P.nx?2:1,P.ny?2:1); pctx.globalAlpha=1; continue; }
    if(P.st!=='warn' || !islOnScr(P.x,P.y,P.R+20)) continue; const p=clamp(1-P.t/(P.t0||1),0,1), Rh=Math.round(TRAP.rockfall.hit*s), RG=ringSpr(Rh,Rh,'#ff7a3c'), r=Math.max(1,Math.round(Rh*(0.25+0.55*p))), SH=shadowSprC(r,Math.max(1,Math.round(r*0.6)),'#000000',1), rf=Math.max(1,Math.round(Rh*p-1)), FL=p>0.05?shadowSprC(rf,rf,'#ff7a3c',1):null;   // (baked rings & discs — a size a step)
    for(const q of P.rk){ const [qx,qy]=iwp(q.x,q.y);
      pctx.globalAlpha=0.18+0.3*p; pctx.drawImage(SH.cv,qx-SH.ax,qy-SH.ay); pctx.globalAlpha=0.35+0.5*p; pctx.drawImage(RG.cv,qx-RG.ax,qy-RG.ay); if(FL){ pctx.globalAlpha=0.06+0.14*p; pctx.drawImage(FL.cv,qx-FL.ax,qy-FL.ay); } }
    pctx.globalAlpha=1; } }
/* over the actors: loose rocks coming down out of the sky (their shadows grow under them — trapTells) */
function drawTrapAir(s){ if(!itrap.length) return; for(const P of itrap){ if(P.k!=='rockfall' || P.st!=='warn' || !islOnScr(P.x,P.y,P.R+40)) continue; const p=clamp(1-P.t/(P.t0||1),0,1), fall=Math.pow(1-p,1.6)*ITUNE.emberH*s;
    for(const q of P.rk){ const [qx,qy]=iwp(q.x,q.y), o=rkBoulderSpr(P.v,q.sd&1); pctx.drawImage(o.cv,qx-o.ax,Math.round(qy-fall)-o.ay); } } }
/* a body rung out sinks where it went in: 2 texels down a step, its lower rows under the surface, dithering away (whole texels) */
function drawFalls(){ for(const f of ifx){ if(f.k!=='fall') continue; const C=f.C; if(!C || !C.cv) continue; const [X,Y]=iwp(f.x,f.y), n=Math.min(4,Math.floor(clamp(f.t/f.life,0,1)*5)), sk=2*n, hd=C.h-sk; if(hd<=0) continue;
    const o=dissCv(C,n*4); if(o) pctx.drawImage(o,0,0,C.w,hd,X+C.ox,Y+C.oy+sk,C.w,hd); } }
/* (PT1 K9a) TALL GRASS, drawn — a body standing in it wears a FRINGE drawn over it (blades across its footprint in the shore's grass, a ragged lit top,
   two sway frames: its lower half sinks in) · you, hidden: drawn at 0.6 with a closed eye over your head (#e8f0c8) */
function fringeSpr(bk,w,h,fr){ const dk=(ISL && ISL.core && !ISL.cave) ? Math.round(clamp((ISL_LVL-6)*0.03,0,0.3)*20) : 0;   // (a dangerous isle's grass goes greyer — as its ground does)
  return tSpr('gf'+bk+'_'+w+'_'+h+'_'+fr+'_'+dk, ()=>{ const B=TB[bk]||TB.tropic, fd=bk==='frond', gk=c=>dk?greyW(c,dk/20):c, g=(fd?FROND_C:B.g).map(c=>gk(cI(c))), S=PS(w,h), tp=cIR(fd?FROND_TIP:GRASS_TIP[bk]||[B.g[5]]).map(gk);   // (DE5 'frond': a grotto's fronds below ground)
  for(let x=0;x<w;x++){ const hs=hash2(x*13+w*3,h*7), ed=Math.min(x,w-1-x), bh=Math.max(2,Math.round(h*(ed<1?0.45:ed<2?0.7:0.6+0.4*hs))), sw=((x+fr)&1) && bh>3 ? (fr?1:-1) : 0;   // (its edges shorter: a clump, not a box)
    for(let y=0;y<bh;y++){ const top=bh-1-y; let c;                                                                   // (the ground's own tall-grass shades: dark at the foot, a lit blade-top, now & then the shore's tip)
      if(y<2) c=g[(x+y)&1]; else if(top===0) c=(hs>0.72)?tp[(x*7)%tp.length]:g[4]; else if(top===1) c=g[3]; else c=g[1+((x+y)&1)];
      psP(S, top<=1 ? x+sw : x, h-1-y, c); } }
  return psCv(S,w>>1,h-1); }); }
function hideEyeSpr(){ return tSpr('hideEye', ()=>{ const S=PS(7,5), c=cI('#e8f0c8');                      // a closed eye: the lid's curve and two lashes hanging off it (5×3), a dark line round it
  for(const [x,y] of [[0,0],[4,0],[1,1],[2,1],[3,1],[1,2],[3,2]]) psP(S,x+1,y+1,c); psOut(S,cI('#141c0c'),false); return psCv(S,3,4); }); }
/* the fringe over one body (x,y its centre in world units · X its screen x · Yb the foot of its look on the screen · r its radius & hh its look's height in
   texels · ph its sway phase) — only on a G_GRASS tile: as wide as its body, as tall as the lower 45% of its look (4-8 texels) */
function drawFringe(x,y,X,Yb,r,hh,ph,ho){ if(gndAt(x,y)!==G_GRASS) return; const w=Math.round(r*2.3)+2, h=clamp(Math.round((hh||r*2.4)*0.45),4,8), fr=Math.floor(itime*2.4+ph)&1, kk=w*1000+h*10+fr;
  let o=ho && ho._gfv===TSPR_V && ho._gfk===kk && ho._gfi===ISL.core ? ho._gfo : null; if(!o){ o=fringeSpr(ISL.cave?'frond':ISL.biome.key,w,h,fr); if(ho){ ho._gfo=o; ho._gfk=kk; ho._gfv=TSPR_V; ho._gfi=ISL.core; } }   // (ho: the body keeps its last fringe — no key built a frame; you carry yours isle to isle)
  pctx.drawImage(o.cv,X-o.ax,Yb-o.ay); }
/* you in the grass: your fringe · hidden, the closed eye over your head (after dark it rides over the light mask instead — post) */
function grassYou(post){ const I=ISL; if(!I || !I.gnd || !(I.grassN>0) || koBeat) return; const s=islScale(), pr=player.r*s*ITUNE.pScale, P=iwp(player.x,player.y), C=PSPR.lc, ok=!!C && C!==PIX_NONE && C.h>0;
  if(!post) drawFringe(player.x,player.y,P[0],ok?P[1]+C.oy+C.h-2:P[1]+Math.round(pr*0.9),pr,ok?C.h:0,player.moving?itime*1.7:0,player);
  if(player.hid && (post || !LGT.on)){ const o=hideEyeSpr(), ty=ok?P[1]+C.oy-1:P[1]-Math.round(pr*2.05)-2; pctx.globalAlpha=0.85+0.15*Math.sin(itime*3); pctx.drawImage(o.cv,P[0]-o.ax,ty-o.ay); pctx.globalAlpha=1; } }
function whiteOf(o){ if(o.wh) return o.wh; const c=document.createElement('canvas'); c.width=o.w; c.height=o.h; const g=c.getContext('2d'); g.drawImage(o.cv,0,0); g.globalCompositeOperation='source-in'; g.fillStyle='#fff'; g.fillRect(0,0,o.w,o.h);
  return o.wh={cv:c, ax:o.ax, ay:o.ay, w:o.w, h:o.h}; }
function fxLRU(M,cap,key,mk){ let o=M.get(key); if(o){ if(M.size>cap*0.7){ M.delete(key); M.set(key,o); } return o; } o=mk(); M.set(key,o); if(M.size>cap){ let n=0; for(const k of M.keys()){ M.delete(k); if(++n>=cap>>3) break; } } return o; }   // (a small LRU for FX sprites)
const RINGS=new Map(), MARKS=new Map();
function ringSpr(rx,ry,col){ return fxLRU(RINGS,220,'ring'+rx+'_'+ry+col, ()=>{ const S=PS(rx*2+3,ry*2+3), c=cI(col);   // a hard one-texel ellipse ring on the ground
  for(let i=0;i<Math.ceil((rx+ry)*4);i++){ const a=i/Math.ceil((rx+ry)*4)*TAU; psP(S,rx+1+Math.cos(a)*rx,ry+1+Math.sin(a)*ry,c); } return psCv(S,rx+1,ry+1); }); }
/* ---- the beached boat, bow up the sand, stern in the shallows ---- */
function boatSpr(ai){ const C=livCols(SHIP&&SHIP.liv); return tSpr('boat'+ai+'|'+livSig(), ()=>{ const s=TSPR_S, a=ai*TAU/16, ca=Math.cos(a), sa=Math.sin(a), L=30*s, Wd=12.5*s, sz=Math.ceil(L+8), S=PS(sz,sz), c=sz/2;   // (PT1 B8: in her paint & her sails)
  const hc=C.hull, HU=C.hid==='oak'?cIR(['#3a2210','#5e3a1e','#7a4a26','#8e5a2e','#a8743c','#c89a5c']):cIR([mixHex(hc,'#120a22',0.6),mixHex(hc,'#1a1030',0.3),hc,mixHex(hc,'#fff4d6',0.12),mixHex(hc,'#fff4d6',0.26),mixHex(hc,'#fffaf0',0.42)]), FL=cIR(['#6a4222','#845430','#9a683a']), BN=cI('#caa27e'), BN2=cI('#9a7a52'), SR=sailRamp(C.sail), SL=C.sid==='canvas'?cIR(['#bcb4a0','#e8e0cc','#fff8ea']):[SR[1],SR[3],SR[4]];
  for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){ const dx=x+0.5-c, dy=y+0.5-c, u=dx*ca+dy*sa, v=-dx*sa+dy*ca, t=u/(L/2); if(t>1||t<-0.94) continue;
    const hw=Wd/2*(t>0?Math.sqrt(Math.max(0,1-t*t))*(1-t*0.25):1-0.28*t*t); if(Math.abs(v)>hw) continue;
    const e=hw-Math.abs(v), nl=(v<0?-1:1)*(0.6*sa-0.8*ca), lit=nl>0;                                                                      // the gunwale's lit / shaded side (light from the top-left)
    let col;
    if(e<1.15*Math.max(1,s)) col=lit?HU[5]:HU[3];
    else if(e<2.2*Math.max(1,s)) col=lit?HU[4]:HU[2];
    else { col=FL[(Math.floor((v+Wd)/(1.7*Math.max(0.8,s)))&1)?1:2]; if(Math.abs(u+L*0.12)<0.9 || Math.abs(u-L*0.22)<0.9) col=BN; if(Math.abs(u+L*0.12)<0.9 && v>0) col=BN2; }
    psP(S,x,y,col); }
  const mx=c+ca*L*0.06, my=c+sa*L*0.06; for(let i=0;i<Math.round(L*0.42);i++){ const px=mx-ca*i, py=my-sa*i; psP(S,px,py,SL[i%3===0?0:1]); psP(S,px-sa,py+ca,SL[2]); }   // the furled sail along its boom
  psP(S,mx,my,cI(C.sail)); psP(S,mx+1,my,cI('#3a2a1a'));
  return psCv(psOut(S,cI('#1c1008'),false),c,c); }); }
function drawBoatAshore(s){ const I=ISL, bt=I.landing, [bx,by0]=iwp(bt.x,bt.y), sa=I.shore?I.shore.a:Math.PI/2, ai=((Math.round((sa+Math.PI)/(TAU/16))%16)+16)%16, o=boatSpr(ai), by=by0+(Math.sin(itime*1.6)>0.55?1:0);
  const gp=0.5+0.5*Math.sin(itime*2.6), R=ringSpr(Math.round(22*s),Math.round(13*s),'#ffe68c');                                                // the way home glows
  pctx.globalAlpha=0.3+0.4*gp; pctx.drawImage(R.cv,bx-R.ax,by0-R.ay); pctx.globalAlpha=1;
  if(I.shore){ const cx=Math.cos(sa), cy=Math.sin(sa);                                                                                    // ripples off the stern, seaward only
    pctx.fillStyle='#e8f6f6'; for(let k=0;k<2;k++){ const p=(itime*0.45+k*0.5)%1, rr=(5+p*13)*s; pctx.globalAlpha=(1-p)*0.7;
      for(let i=-5;i<=5;i++){ const a=sa+i*0.26; pctx.fillRect(Math.round(bx+cx*9*s+Math.cos(a)*rr), Math.round(by0+cy*9*s+Math.sin(a)*rr*0.6), 1, 1); } } pctx.globalAlpha=1; }
  pctx.drawImage(o.cv,bx-o.ax,by-o.ay);
  pctx.fillStyle='#d23a2e'; pctx.fillRect(Math.round(bx+Math.cos(sa+Math.PI)*3*s)-1, by-Math.round(7*s), Math.max(2,Math.round(4*s)), Math.max(1,Math.round(2*s))); }   // her little pennant (scarf-red — never the coin's gold)
/* ---- ENV-14: a secured clearing's cairn & pennant ---- */
function cairnSpr(f){ return tSpr('cairn'+f+ISL.biome.key+(ISL.cave?'c':''), ()=>{ const s=TSPR_S, C=ISL.cave?cIR(caveTI(ISL.biome).rock):rkRamp(TBI(ISL.biome.key).rk==='crystal'?'crystone':TBI(ISL.biome.key).rk), w=Math.ceil(16*s)+8, h=Math.ceil(26*s)+6, S=PS(w,h), bx=Math.round(w*0.36), by=h-3;
  const st=[[5,2.4,0],[4,2.1,-1],[2.8,1.7,0.5]]; let y=by;
  for(const q of st){ const rx=q[0]*s*0.8, ry=Math.max(1.2,q[1]*s*0.8), cx=bx+q[2]; psDisc(S,cx,y-ry,rx,ry,(nx,ny,px,py)=>C[clamp(Math.floor(3-(nx*0.6+ny*0.8)*1.4+bayV(px,py)*0.6),0,5)]); y-=ry*1.8; }
  const pt=Math.round(y-10*s), P1=cI('#5a3e22'), P2=cI('#8a6440'); for(let yy=Math.round(y+1);yy>=pt;yy--){ psP(S,bx,yy,P1); psP(S,bx+1,yy,P2); }
  const G=cIR(['#2e8a58','#5fd08a','#9ff0c0']), L=Math.round(8*s), Hh=Math.max(3,Math.round(4.5*s));                                       // the pennant, flapping
  for(let i=0;i<L;i++){ const t=i/L, hh=Math.max(1,Math.round(Hh*(1-t))), wv=Math.round(Math.sin(t*3+f*2.1)*1.2*t); for(let j=0;j<hh;j++) psP(S,bx+2+i,pt+j+wv+Math.round((Hh-hh)/2),G[j===0?2:j>=hh-1?0:1]); }
  return psCv(psOut(S,cI('#101008'),false),bx,by); }); }
/* §8.8 THE SKULL PLATE: a bone-white skull on a stake at each post of the hoard's gate (the doorway's two ends, a little out into the hedge) — a boss waits beyond */
function skullPosts(){ const I=ISL; if(I._skP!==undefined) return I._skP; const g=I.hoardId>0?I.gates[I.hoardId-1]:null; if(!g || !g.cells.length){ I._skP=null; return null; }
  const gc=g.n0>0?g.cells.slice(0,g.n0):g.cells; let a=gc[0], b=a, bd=-1; for(const p of gc) for(const q of gc){ const d=(p[0]-q[0])**2+(p[1]-q[1])**2; if(d>bd){ bd=d; a=p; b=q; } }   // the doorway's two far ends · (SD5 fix: its own cells, not a back-door plug)
  const TS=I.TS, ax=(a[0]+0.5)*TS, ay=(a[1]+0.5)*TS, bx=(b[0]+0.5)*TS, by=(b[1]+0.5)*TS, l=Math.hypot(bx-ax,by-ay);
  let ux=l>0?(bx-ax)/l:1, uy=l>0?(by-ay)/l:0; if(l===0){ const cl=I.clearings[I.hoardId], dx=cl.x-ax, dy=cl.y-ay, dl=Math.hypot(dx,dy)||1; ux=-dy/dl; uy=dx/dl; }   // (a one-tile doorway: across the way in)
  return I._skP=[{x:ax-ux*TS*0.8, y:ay-uy*TS*0.8}, {x:bx+ux*TS*0.8, y:by+uy*TS*0.8}]; }
function skullPlateSpr(){ return tSpr('skplate'+(ISL.cave?'c':''), ()=>{ const s=TSPR_S, k=Math.max(1,Math.round(s*0.9)), w=5*k+6, h=Math.round(15*s)+6*k+4, S=PS(w,h), cx=Math.floor(w/2);
  const P=cIR(['#3a2412','#5a3a1e','#7a5430']), B=cIR(['#fff4dc','#e2d4b4','#b8a888']), D=cI('#140a04');
  for(let y=4*k;y<h-1;y++){ psP(S,cx-1,y,P[0]); psP(S,cx,y,P[1]); psP(S,cx+1,y,P[y%4===0?2:0]); }                     // the stake
  const x0=cx-Math.floor(5*k/2); for(let yy=0;yy<6;yy++) for(let xx=0;xx<5;xx++){ if(SKULL_PX[yy][xx]!=='#') continue;   // the skull (its eyes & nose left open — the outline darkens them)
    for(let a=0;a<k;a++) for(let b2=0;b2<k;b2++) psP(S,x0+xx*k+a,1+yy*k+b2,B[yy<2?(xx<2?0:1):yy<4?1:2]); }
  psOut(S,D,false); return psCv(S,cx,h-2); }); }
/* §10 (C8b) THE SECRET DOORS & THE SHRINES — pixel props (the kit's stone ramps; lit from the top-left; the dark SNES line) */
function secStone(){ const I=ISL; return I.cave ? cIR(caveTI(I.biome).rock) : rkRamp(TBI(I.biome.key).rk==='crystal'?'crystone':TBI(I.biome.key).rk); }   // (the shore's own rock — below ground the cave's)
function crackSpr(v){ return tSpr('crk'+v+ISL.biome.key+(ISL.cave?'c':''), ()=>{ const s=TSPR_S, T=Math.round(ISL.TS*s), w=T+6, h=Math.round(T*1.3)+5, S=PS(w,h), bx=w>>1, by=h-3, sd=v*23+7;   // a CRACKED WALL: a mossy stone plug in the forest's edge, split by a dark hollow
  const C=secStone(), MS=ISL.cave?cIR(['#243a34','#34504a','#4a6a60']):cIR(['#2a4a1a','#3e6a26','#5a8a34']), HO=cI('#0a0806'), CR=cI('#1c1612');
  const x0=bx-(T>>1)-1, x1=bx+(T>>1)+1, top=by-Math.round(T*1.15);
  for(let y=top;y<=by;y++) for(let x=x0;x<=x1;x++){ const e=hash2(x*7+sd,y*5-sd); if((y<top+2 && (x<x0+2||x>x1-2)) || ((x===x0||x===x1) && e<0.35) || (y===top && e<0.4)) continue;   // a rough block, its corners worn
    const lf=(x-x0)/(x1-x0), up=(y-top)/(by-top); let c=C[clamp(Math.floor(3.6-lf*1.6-up*1.1+bayV(x,y)*0.7+((x+y*3+sd)%7===0?-1:0)),0,5)];
    if((y-top)%Math.max(3,Math.round(T*0.34))===0 && e<0.8) c=C[1];                                                   // (its courses)
    if((up<0.16 && hash2(x*3+sd,y*11)<0.55) || (up>0.84 && hash2(x*5,y*7+sd)<0.35 && (lf<0.3||lf>0.7))) c=MS[(x+y)%3];   // moss on its brow & at its foot
    psP(S,x,y,c); }
  let cx=bx+Math.round((hash2(sd,1)-0.5)*T*0.2), cy=top+1;                                                              // the crack: a jagged split down its face…
  while(cy<by-Math.round(T*0.25)){ psP(S,cx,cy,CR); psP(S,cx+1,cy,HO); cy++; if(hash2(cx*3+sd,cy)<0.35) cx+=hash2(cy,cx*5+sd)<0.5?-1:1; }
  psDisc(S,bx+0.5,by-T*0.55,Math.max(2,T*0.17),Math.max(2,T*0.24),(nx,ny)=>nx*nx+ny*ny>0.55?CR:HO);                  // …opening on a dark HOLLOW (something's behind it)
  return psCv(psOut(S,cI('#0a0806'),false),bx,by); }); }
function glyphSpr(){ return tSpr('gly'+ISL.biome.key+(ISL.cave?'c':''), ()=>{ const s=TSPR_S, T=Math.round(ISL.TS*s), w=Math.round(T*1.5)+6, h=Math.round(T*1.25)+5, S=PS(w,h), bx=w>>1, by=h-3;   // a GLYPH BOULDER: an odd, mossy rune-rock sealing a corridor's mouth
  const C=secStone(), MS=ISL.cave?cIR(['#243a34','#34504a','#4a6a60']):cIR(['#2a4a1a','#3e6a26','#5a8a34']), rx=T*0.68, ry=T*0.56, cy=by-ry;
  psBall(S,bx,cy,rx,ry,C,[bx,cy,Math.max(rx,ry)],31,0.8,0.5);
  for(let y=Math.floor(cy-ry);y<cy-ry*0.25;y++) for(let x=Math.floor(bx-rx);x<=bx+rx;x++) if(psG(S,x,y) && hash2(x*5+3,y*7)<0.5) psP(S,x,y,MS[(x*3+y)%3]);   // moss over its crown
  const k=Math.max(1,Math.round(T/20)), G1=cI('#9fd8ff'), G2=cI('#4a8ac8'), gx=bx, gy=Math.round(cy+ry*0.15);                   // the rune (faint blue): a stave, two branches, a ring at its foot
  for(let i=-3;i<=3;i++) for(let a=0;a<k;a++) psP(S,gx+a,gy+i*k,i===0?G1:G2);
  for(let i=1;i<=2;i++) for(let a=0;a<k;a++){ psP(S,gx-i*k+a,gy-(i+1)*k,G2); psP(S,gx+i*k+a,gy-(i+1)*k,G2); }
  psP(S,gx-k,gy+4*k,G2); psP(S,gx+k,gy+4*k,G2); psP(S,gx,gy+5*k,G2); psP(S,gx,gy-4*k,G1);
  return psCv(psOut(S,cI('#0a0806'),false),bx,by); }); }
const SHR_SIG={squall:['###..','....#','####.','#....','.###.'], flood:['.....','.#.#.','#.#.#','.....','#####'], kraken:['#.#.#','#.#.#','#.#.#','.#.#.','#...#'],
  pearl:['.###.','#...#','#.#.#','#...#','.###.'], deep:['#.#.#','#.#.#','#####','..#..','..#..'], wreck:['..#..','.###.','..#..','#.#.#','.###.']};   // the sigils carved on the obelisks' faces (5×5)
function shrineSpr(k,used){ return tSpr('shr'+k+(used?1:0)+(ISL.cave?'c':''), ()=>{ const s=TSPR_S, u=Math.max(1,Math.round(s)), w=13*u+6, h=34*u+6, S=PS(w,h), bx=w>>1, by=h-3, K=SHRINE_K[k];   // a SHRINE: a stone obelisk, its sigil glowing in its colour (dim once used)
  const C=cIR(['#2a2622','#46403a','#625a50','#7e766a','#9c9486','#bcb4a4']), MS=cIR(['#2a4a1a','#3e6a26','#5a8a34']), SG=cI(used?'#6e6a64':K.c), SD=cI(used?'#3a3632':mixHex(K.c,'#000000',0.55));
  for(let y=by-3*u;y<=by;y++) for(let x=bx-6*u;x<=bx+6*u;x++) psP(S,x,y,C[y===by-3*u?5:x<bx-3*u?3:2]);                // the plinth
  const top=by-3*u-26*u; for(let y=top;y<by-3*u;y++){ const t=(y-top)/(26*u), hw=Math.round((2.4+2*t)*u);            // the column, tapering up
    for(let x=bx-hw;x<=bx+hw;x++) psP(S,x,y,C[clamp(Math.floor((x<bx-hw+u?4.6:x>bx+hw-u?1.4:3)+bayV(x,y)*0.6),0,5)]); }
  for(let i=0;i<=3*u;i++){ const hw=Math.round((3*u-i)*0.85); for(let x=bx-hw;x<=bx+hw;x++) psP(S,x,top-i,C[x<bx?5:3]); }   // its capstone
  const P=SHR_SIG[k], sx=bx-2*u, sy=top+7*u; for(let r=0;r<5;r++) for(let c=0;c<5;c++){ if(P[r][c]!=='#') continue;
    for(let a=0;a<u;a++) for(let b=0;b<u;b++){ psP(S,sx+c*u+a,sy+r*u+b,SG); } }                                         // the sigil
  for(let r=-1;r<=5;r++) for(let c=-1;c<=5;c++){ if(r>=0&&r<5&&c>=0&&c<5&&P[r][c]==='#') continue; const n=(rr,cc)=>rr>=0&&rr<5&&cc>=0&&cc<5&&P[rr][cc]==='#'; if(!(n(r-1,c)||n(r+1,c)||n(r,c-1)||n(r,c+1))) continue;
    for(let a=0;a<u;a++) for(let b=0;b<u;b++) psP(S,sx+c*u+a,sy+r*u+b,SD); }                                           // (a carved rim round it)
  for(const [x,y] of [[bx-5*u,by-2*u],[bx-4*u,by-3*u],[bx+4*u,by-2*u],[bx+5*u,by-3*u],[bx-2*u,by-4*u]]) psP(S,x,y,MS[(x+y)%3]);   // moss at its foot
  if(used){ let x=bx+u, y=top+2*u; while(y<by-4*u){ psP(S,x,y,C[0]); y++; if(((x*7+y*3)%5)===0) x+=((y&1)?1:-1); } }   // a used shrine: its sigil gone grey, a crack down its face
  const o=psCv(psOut(S,cI('#0e0a08'),false),bx,by); o.sy=by-(sy+2*u)+1; return o; }); }   // (o.sy: the sigil's height over its foot)
/* the doors — drawn over the baked ground (terrOverlay) · post: after dark, only their glint & the Lantern-Eye's light over the mask */
function drawSecrets(s,post){ const L=ISL.secrets; if(!L || !L.length) return; const TS=ISL.TS, hw=Math.round(TS*s/2);
  for(const S of L){ if(S.open || !islOnScr(S.door.x,S.door.y,40)) continue; const gl=S.kind==='glyph', dmg=S.hp0-S.hp;
    const [X,Y]=gl ? iwp(S.door.x-S.dx*6,S.door.y-S.dy*6) : iwp(S.door.x,S.door.y), base=Y+(gl?Math.round(hw*0.7):hw);
    if(!post){ const fl=S.fl>0, jx=fl?Math.round((Math.random()-0.5)*2*s):0;
      if(gl){ const o=glyphSpr(); pctx.drawImage((fl?whiteOf(o):o).cv,X+jx-o.ax,base-o.ay);
        if(dmg>0 && !fl){ pctx.fillStyle='rgba(12,8,6,.85)'; const r=o.h*0.4; for(let i=0;i<Math.min(4,dmg);i++){ const a=i*1.9+S.px*0.01; pxLine(X+jx+Math.cos(a)*r*0.2,base-o.h*0.5+Math.sin(a)*r*0.2,X+jx+Math.cos(a)*r,base-o.h*0.5+Math.sin(a)*r*0.7); } } }   // (a struck rune-rock cracks)
      else { const c=S.dc[0], [cx,cy]=iwp((c[0]+0.5)*TS,(c[1]+0.5)*TS), o=crackSpr((c[0]*7+c[1]*13)%3), b2=cy+hw;   // (its mouth cell wears the crack — a second W_CRACK cell behind it stays under the forest)
        pctx.drawImage((fl?whiteOf(o):o).cv,cx+jx-o.ax,b2-o.ay);
        if(dmg>0 && !fl){ pctx.fillStyle='rgba(12,8,6,.9)'; for(let i=0;i<Math.min(3,dmg);i++){ const y0=b2-o.h*(0.8-i*0.2), sd=i*2-1; pxLine(cx+jx,y0,cx+jx+sd*o.w*0.28,y0+o.h*0.14); pxLine(cx+jx+sd*o.w*0.28,y0+o.h*0.14,cx+jx+sd*o.w*0.2,y0+o.h*0.3); } } } }   // (each blow splits it further)
    if(post || !LGT.on){ const gy=base-Math.round(TS*s*(gl?0.75:1.05)), ph=(itime+S.px*0.013)%SECRET.glint;                 // THE GLINT: every 4 s, a star on the stone
      if(ph<0.3){ const a=1-Math.abs(ph/0.3-0.5)*2, q=Math.max(2,Math.round(3*s)); pctx.fillStyle='rgba(255,246,210,'+(0.95*a).toFixed(3)+')'; pctx.fillRect(X+2,gy-q,1,q*2+1); pctx.fillRect(X+2-q,gy,q*2+1,1); }
      if(S.lit>itime){ const R=ringSpr(Math.round(TS*s*0.7),Math.round(TS*s*0.42),'#ffe9a6'); pctx.globalAlpha=0.55+0.35*Math.sin(itime*9); pctx.drawImage(R.cv,X-R.ax,base-Math.round(TS*s*0.35)-R.ay); pctx.globalAlpha=1; }   // (the Lantern-Eye: your light rings it)
      else if(aimBrk && aimBrkOn(S)){ const R=ringSpr(Math.round(TS*s*0.8),Math.round(TS*s*0.48),'#ffd86b'); pctx.globalAlpha=0.55+0.35*Math.sin(itime*9); pctx.drawImage(R.cv,X-R.ax,base-Math.round(TS*s*0.35)-R.ay); pctx.globalAlpha=1; }   // (PT1 K1 · G5 fix) your shot leans onto it: the gold target ring a rock wears
    } } }
function drawShrines(s){ if(!ishrines.length) return; const SHD=islShd();
  for(const q of ishrines){ const [sx,sy]=iwp(q.x,q.y); if(sx<-40||sx>IW+40||sy<-70||sy>IH+40) continue; const K=SHRINE_K[q.k];
    const sh=shadowSprC(Math.round(8*s),Math.max(1,Math.round(3*s)),SHD[0],SHD[1]); pctx.drawImage(sh.cv,sx-sh.ax,sy+1-sh.ay);
    if(!q.used && (player.x-q.x)**2+(player.y-q.y)**2<64*64){ const R=ringSpr(Math.round(13*s),Math.round(6*s),K.c); pctx.globalAlpha=0.35+0.25*Math.sin(itime*5); pctx.drawImage(R.cv,sx-R.ax,sy-R.ay); pctx.globalAlpha=1; }   // near enough to use: its ring on the ground
    const o=shrineSpr(q.k,q.used); pctx.drawImage(o.cv,sx-o.ax,sy-o.ay);
    if(!q.used || q.roll>itime){ const gy=sy-o.sy, rl=q.roll>itime;                                                        // motes rise off the sigil (the dice: it flickers)
      pctx.fillStyle=rl?(Math.floor(itime*20)%2?'#ffffff':K.c):K.c; for(let i=0;i<(rl?4:2);i++){ const ph=(itime*(rl?1.6:0.55)+i*0.5+q.x*0.01)%1; pctx.globalAlpha=1-ph; pctx.fillRect(sx-2+((i*3+Math.floor(q.x))%5),Math.round(gy-ph*16*s),1,1); } pctx.globalAlpha=1; } } }
function drawUpRing(d,sx,sy,s){ const R=ringSpr(Math.round(10*s),Math.round(5*s),'#ffe9a6'); pctx.globalAlpha=0.45+0.3*Math.sin(itime*4+d.x); pctx.drawImage(R.cv,sx-R.ax,sy+1-R.ay);   // (C8b) a find the Pearl shrine raised: a pearl ring round its beam's foot
  pctx.fillStyle='#fff4d0'; for(let i=0;i<2;i++){ const ph=(itime*0.7+i*0.5+d.x*0.01)%1; pctx.globalAlpha=1-ph; pctx.fillRect(sx+(i?4:-5),Math.round(sy-ph*14*s),1,1); } pctx.globalAlpha=1; }
/* ---- lava cracks: a scorched crust that's always there, a core that glows — idle it breathes, warning it swells, flaring it's white-hot ---- */
function lavaSpr(v,hot){ return tSpr('lava'+v+(hot==null?'c':hot?'h':'k'), ()=>{ const s=TSPR_S, R=Math.round(11*s), sz=R*2+5, S=PS(sz,sz), c=sz>>1, a0=v*0.7, P=[];
  for(let i=0;i<=5;i++){ const t=i/5-0.5, j=(hash2(v,i)-0.5)*R*0.5; P.push([c+Math.cos(a0)*t*R*1.7-Math.sin(a0)*j, c+Math.sin(a0)*t*R*1.7*0.7+Math.cos(a0)*j*0.7]); }
  const br=[[P[2],[P[2][0]+Math.cos(a0+1.3)*R*0.5,P[2][1]+Math.sin(a0+1.3)*R*0.4]],[P[4],[P[4][0]+Math.cos(a0-1.5)*R*0.45,P[4][1]+Math.sin(a0-1.5)*R*0.35]]];
  const segs=[]; for(let i=0;i<5;i++) segs.push([P[i],P[i+1]]); segs.push(...br);
  const dist=(x,y)=>{ let m=1e9; for(const q of segs){ const ax=q[0][0],ay=q[0][1],bx=q[1][0],by=q[1][1],vx=bx-ax,vy=by-ay,l2=vx*vx+vy*vy||1,t=clamp(((x-ax)*vx+(y-ay)*vy)/l2,0,1); m=Math.min(m,Math.hypot(ax+vx*t-x,ay+vy*t-y)); } return m; };
  const K=hot?cIR(['#ffb040','#ffe080','#fff4c8','#ffffff']):cIR(['#8a200a','#e0501a','#ff9a30','#ffd870']), CR=cIR(['#140a06','#24120a','#3a1c10']), HALO=cIA('#000000',0.3);
  for(let y=0;y<sz;y++) for(let x=0;x<sz;x++){ const d=dist(x+0.5,y+0.5);
    if(hot!=null){ if(d<0.75) psP(S,x,y,K[3]); else if(d<1.3) psP(S,x,y,K[2]); else if(d<1.75) psP(S,x,y,K[1]); else if(hot && d<2.4 && ((x+y)&1)) psP(S,x,y,K[0]); }
    else { if(d<1.9) psP(S,x,y,CR[d<1.1?0:(bayV(x,y)>0?1:2)]); else if(d<3.6+hash2(x+v,y)*1.4) psP(S,x,y,HALO); } }
  return psCv(S,c,c); }); }
function drawLava(s){ for(const h of ihaz){ if(!islOnScr(h.x,h.y,h.rock?60:30)) continue; const [sx,sy]=iwp(h.x,h.y), v=Math.abs(Math.floor(h.x*0.13+h.y*0.29))%4;
    if(h.rock){ const R=h.R*s; if(h.st==='warn'){ const p=clamp(1-h.t/(h.T0||1),0,1), fall=Math.pow(1-p,1.6)*ITUNE.emberH*s;   // a burning rock falls: its shadow grows, the ring shows where it lands, embers stream off it
        pctx.fillStyle='#000000'; pctx.globalAlpha=0.18+0.3*p; pxEll(pctx,sx,sy,Math.max(1,R*(0.25+0.55*p)),Math.max(1,R*(0.25+0.55*p)*0.5));
        pctx.fillStyle='#ff7828'; pctx.globalAlpha=0.35+0.5*p; pxRingE(pctx,sx,sy,R,R*0.62,1); if(p>0.05){ pctx.globalAlpha=0.06+0.14*p; pxEll(pctx,sx,sy,Math.max(0,R*p-1),Math.max(0,(R*p-1)*0.62)); }
        pctx.globalAlpha=1; const o=rockSpr(Math.floor(itime*10)%3), ry=Math.round(sy-fall); pctx.fillStyle='#ffb040';
        for(let i=1;i<=5;i++){ pctx.globalAlpha=0.7-i*0.12; pctx.fillRect(sx+((i*7)%3)-1, ry-o.ay-i*2*Math.max(1,Math.round(s)), 1, 2); } pctx.globalAlpha=1;
        pctx.drawImage(o.cv,sx-o.ax,ry-o.ay); }
      else if(h.st==='flare'){ const p=clamp(1-h.t/0.45,0,1); pctx.fillStyle='#ffb43c'; pctx.globalAlpha=0.4*(1-p); pxEll(pctx,sx,sy,R*(0.8+p*0.4),R*(0.8+p*0.4)*0.62);
        pctx.fillStyle='#fff0a0'; pctx.globalAlpha=0.9*(1-p); pxRingE(pctx,sx,sy,R*(0.5+p*0.9),R*(0.5+p*0.9)*0.62,1); pctx.globalAlpha=1; const o=rockSpr(0); pctx.drawImage(o.cv,sx-o.ax,sy-o.ay+2); }
      continue; }
    const k = h.st==='flare'?1 : h.st==='warn'?0.7+0.3*clamp(1-h.t/1.1,0,1) : 0.62+0.26*Math.sin(itime*2.4+h.x*0.07);   // (idle never drops below a clear glow — it reads as a hazard, not a twig)
    const cr=lavaSpr(v,null), co=lavaSpr(v,h.st==='flare'); pctx.drawImage(cr.cv,sx-cr.ax,sy-cr.ay); pctx.globalAlpha=k; pctx.drawImage(co.cv,sx-co.ax,sy-co.ay); pctx.globalAlpha=1;
    const n=h.st==='idle'?2:4; for(let i=0;i<n;i++){ const p=(itime*(0.55+i*0.13)+i/n+h.x*0.011)%1, ex=Math.round(sx+(hash2(i,Math.floor(h.x))-0.5)*14*s+Math.sin(itime*3+i)*1), ey=Math.round(sy-p*18*s);   // embers rising off it
      pctx.globalAlpha=(1-p)*(0.5+k*0.5); pctx.fillStyle=p<0.3?'#ffe08a':'#ff8a3c'; pctx.fillRect(ex,ey,1,1); } pctx.globalAlpha=1;
    if(h.st==='warn'){ const p=clamp(1-h.t/1.1,0,1), R=LAVA_R*s;   // the burn zone shows BEFORE it burns: its true edge, filling as the flare nears (whole texels)
      pctx.fillStyle='#ff7828'; pctx.globalAlpha=0.3+0.5*p; pxRingE(pctx,sx,sy,R,R,1);
      if(p>0.05){ pctx.fillStyle='#ff8c32'; pctx.globalAlpha=0.06+0.14*p; pxEll(pctx,sx,sy,Math.max(0,R*p-1),Math.max(0,R*p-1)); } pctx.globalAlpha=1; }
    if(h.st==='flare'){ pctx.fillStyle='#ffb43c'; pctx.globalAlpha=0.28; pxEll(pctx,sx,sy,LAVA_R*s,LAVA_R*s); pctx.globalAlpha=1; } } }

