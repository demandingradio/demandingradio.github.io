"use strict";
/* FILE: js/render/foe_sprites.js
THE FOE SPRITE PAINTERS AND THE BAKED-LOOK CACHE (the crawl's enemies, Project Pixel): original lines 18697-19344
  (build 5109cd5), moved verbatim, in place after the core foe AI (alphaHowl ends at original line 18695 (build 5109cd5));
  PROJECT PX, SPRITES 2.0 follows at original line 19345 (build 5109cd5).
Two parts. The paint board ESPR (an offscreen canvas, resized by esprFit) and the vector painters that draw one foe onto it
  in body space: bodyKit, drawBoar, drawSnake, drawCrab, drawDingo, sgKit and drawNewMon (every other kind). Then, from
  original line 19257 (build 5109cd5), the baked-look cache: each look a foe can wear is painted once at the crawl's texel,
  outlined, cropped into its own small canvas and only blitted after that (ESC, an LRU Map with a per-frame bake budget).
Entry points: eSprite (drawIslandWorld, ringFall, drawCorpses, Sprites 2.0), escFit (drawIslandWorld), escFlush (genIsland,
  drawExplorerPix, buildIslandTune), ePose (Sprites 2.0, eBake), pixBake (Sprites 2.0, eBake, plBody), the painters (eBake and
  the bestiary's paintPortrait), escRim and eTint (eBake), CORPSE_LK (darkLook) and PIX_NONE (the empty look, ~16 readers).
Globals it owns: the consts ESPR, EWPP, ESC, ESC_T, ESC_VSD, ESC_TB, ESC_BT, ESC_OL, ESC_RK, ESC_TT, CORPSE_LK, ESC_ANY,
  PIX_NONE; the lets eit (written by drawIslandWorld), EP_P, EP_N; the functions esprFit, bodyKit, drawBoar, drawSnake,
  drawCrab, drawDingo, sgKit, drawNewMon, escFlush, escRim, eTint, eAnim, ePose, escFit, eSprite, pixBake.
Main globals it reads from elsewhere (inside functions, at runtime only): TAU and clamp (index.html part 1); ATK and MOTH_LIFT
  (js/data/crawl2.js); wind (the weather, original line 4535 (build 5109cd5)); ISL, itime, player and salIn (the island core
  above); and, declared in later scripts, spr2Pick and eBake (Sprites 2.0, below) and TB and islScale (the crawl renderer).
Load-time statements: original line 18701 (build 5109cd5) holds three, in this order: const ESPR (document.createElement),
  its width and height set to 72, then ESPR.ctx from getContext. Then const ESC, CORPSE_LK and ESC_ANY (new Map) and PIX_NONE
  (document.createElement) at original lines 19263, 19268, 19310 and 19344 (build 5109cd5); the rest are literal consts and
  lets plus function declarations. They need only document. escFlush and escFit touch CORPSE_LK and ESC_ANY, declared below
  them, so the whole range stays in this one file. Every painter's local pctx shadows the global pctx.
*/

/* ---- island enemy sprites — drawn in body space: +x is the way it faces, +y its right flank ----
   each enemy renders to a tiny offscreen, then upscales with hard pixels — so monsters sit on the
   same chunky grid as the terrain instead of floating over it like smooth stickers */
const ESPR={cv:document.createElement('canvas'), sz:72, c:36}; ESPR.cv.width=ESPR.cv.height=72; ESPR.ctx=ESPR.cv.getContext('2d',{willReadFrequently:true});   // the paint board (read back once per BAKED look — keep it CPU-side) · sz grows with the texel scale (esprFit)
function esprFit(s){ const sz=Math.max(72, Math.min(256, 2*Math.ceil(54*s)+8)); if(ESPR.sz!==sz){ ESPR.sz=sz; ESPR.c=sz/2; ESPR.cv.width=ESPR.cv.height=sz; } }   // room for the biggest lord (r≈20, ~2.6r reach) at this many texels per world unit
const EWPP=1.45;           // world units per sprite pixel — the bestiary PORTRAITS only (the crawl paints at its own texel: 1/islScale())
let eit=0;                 // enemy anim clock quantized to 10fps — limbs snap between poses like sprite frames
function bodyKit(sx,sy,fcx,fcy,pxn,pyn,r){
  const pctx=ESPR.ctx;                                       // the kit paints to the sprite grid too
  const PT=(dx,dy)=>[sx+(fcx*dx+pxn*dy)*r, sy+(fcy*dx+pyn*dy)*r];
  const px=(dx,dy,w,h,col)=>{ const p=PT(dx,dy); pctx.fillStyle=col; pctx.fillRect(p[0]-w/2,p[1]-h/2,Math.max(1.4,w),Math.max(1.4,h)); };
  const tri=(a,b,c,col)=>{ pctx.fillStyle=col; pctx.beginPath(); pctx.moveTo(a[0],a[1]); pctx.lineTo(b[0],b[1]); pctx.lineTo(c[0],c[1]); pctx.closePath(); pctx.fill(); };
  const seg=(a,b,w,col)=>{ pctx.strokeStyle=col; pctx.lineWidth=w; pctx.beginPath(); pctx.moveTo(a[0],a[1]); pctx.lineTo(b[0],b[1]); pctx.stroke(); };
  return {PT,px,tri,seg};
}
function drawBoar(en,sx,sy,r,fa,fcx,fcy,pxn,pyn,fl,s){
  const pctx=ESPR.ctx;                                                         // paint to the sprite grid
  const K=bodyKit(sx,sy,fcx,fcy,pxn,pyn,r), bm=ISL.biome.mods;
  const charging=en.st==='charge', windup=en.st==='windup';
  if(!fl){ const lp=charging? Math.sin(eit*24)*0.34 : en.mv? Math.sin(eit*18)*0.3 : 0;   // trotting legs + hooves (swarm trash trots too)
    [[-0.45,0.84,1],[-0.45,-0.84,-1],[0.4,0.84,-1],[0.4,-0.84,1]].forEach(L=>{   // (out past the flanks: stout legs you can see trot)
      K.px(L[0]+lp*L[2], L[1], Math.max(2,r*0.24), Math.max(2.4,r*0.34), '#4a2f1a');
      K.px(L[0]+lp*L[2]+0.1, L[1]*1.08, Math.max(1.6,r*0.2), Math.max(1.4,r*0.16), '#241307'); });
    K.px(-1.04,0.04,Math.max(1.6,r*0.16),Math.max(1.6,r*0.16),'#4a2f1a');      // curl of tail + tuft
    K.px(-1.16,Math.sin(eit*3+en.sd)*0.12,Math.max(2,r*0.22),Math.max(2,r*0.22),'#2e1c0c');
  }
  pctx.fillStyle='#2a1708'; pctx.beginPath(); pctx.ellipse(sx,sy,r*1.12,r*0.92,fa,0,TAU); pctx.fill();   // outline
  const idleCol = en.guard?'#5e3a24' : en.elite?'#8a4030' : (bm.boarTint||'#7a4f30');
  pctx.fillStyle = fl?'#fff':(windup?'#c4683c':charging?'#a85f36':idleCol);
  pctx.beginPath(); pctx.ellipse(sx,sy,r,r*0.8,fa,0,TAU); pctx.fill();
  if(fl) return;
  pctx.fillStyle='rgba(42,23,8,.38)';                                          // heavy haunch shading
  pctx.beginPath(); pctx.ellipse(sx-fcx*r*0.45,sy-fcy*r*0.45,r*0.52,r*0.6,fa,0,TAU); pctx.fill();
  pctx.fillStyle='rgba(255,236,200,.15)';                                      // pale ridge along the spine
  pctx.beginPath(); pctx.ellipse(sx+fcx*r*0.1,sy+fcy*r*0.1,r*0.7,r*0.28,fa,0,TAU); pctx.fill();
  for(let k=0;k<6;k++){ const wob=Math.sin(en.sd*3+k*2.1);                     // bristle mohawk
    K.px(-0.72+k*0.24, wob*0.06, Math.max(1.6,r*0.15), Math.max(2,r*0.28+wob*r*0.06), en.guard?'#1c0f04':'#3a2110'); }
  for(let k=0;k<5;k++){ const a2=en.sd+k*2.4, d2=0.25+0.45*((k*53%10)/10);     // hide speckles
    K.px(Math.cos(a2)*d2-0.2, Math.sin(a2)*d2*0.55, Math.max(1.4,r*0.13), Math.max(1.4,r*0.13), 'rgba(42,23,8,.5)'); }
  const hx=sx+fcx*r*0.82, hy=sy+fcy*r*0.82;                                    // wedge head
  pctx.fillStyle='#2a1708'; pctx.beginPath(); pctx.arc(hx,hy,r*0.62,0,TAU); pctx.fill();
  pctx.fillStyle=(windup||charging)?'#8a5232':'#6b432a'; pctx.beginPath(); pctx.arc(hx,hy,r*0.55,0,TAU); pctx.fill();
  K.tri(K.PT(0.62,0.5),K.PT(0.95,0.72),K.PT(0.82,0.3),'#4a2f1a');              // cheek tufts
  K.tri(K.PT(0.62,-0.5),K.PT(0.95,-0.72),K.PT(0.82,-0.3),'#4a2f1a');
  K.tri(K.PT(0.5,0.48),K.PT(0.42,0.8),K.PT(0.72,0.62),'#33200e');              // ears, pink inside
  K.tri(K.PT(0.5,-0.48),K.PT(0.42,-0.8),K.PT(0.72,-0.62),'#33200e');
  K.px(0.54,0.6,Math.max(1.4,r*0.12),Math.max(1.4,r*0.12),'#b06a5a'); K.px(0.54,-0.6,Math.max(1.4,r*0.12),Math.max(1.4,r*0.12),'#b06a5a');
  const nx_=hx+fcx*r*0.52, ny_=hy+fcy*r*0.52;                                  // snout, nostrils, warts
  pctx.fillStyle='#3a2412'; pctx.beginPath(); pctx.ellipse(nx_,ny_,r*0.33,r*0.27,fa,0,TAU); pctx.fill();
  pctx.fillStyle='#caa27e'; pctx.beginPath(); pctx.ellipse(nx_,ny_,r*0.27,r*0.21,fa,0,TAU); pctx.fill();
  K.px(1.43,0.09,Math.max(1.4,r*0.12),Math.max(1.4,r*0.12),'#5a3a22'); K.px(1.43,-0.09,Math.max(1.4,r*0.12),Math.max(1.4,r*0.12),'#5a3a22');
  K.px(1.05,0.3,Math.max(1.4,r*0.14),Math.max(1.4,r*0.14),'#54331c'); K.px(1.05,-0.3,Math.max(1.4,r*0.14),Math.max(1.4,r*0.14),'#54331c');
  const tuskC = en.guard?'#ffd23f':'#f2ead8';                                  // curved tusks (gold on the Great Boar)
  K.seg(K.PT(1.02,0.28),K.PT(1.28,0.5),Math.max(1.6,r*0.16),'#cfc4a8'); K.seg(K.PT(1.28,0.5),K.PT(1.5,0.4),Math.max(1.3,r*0.13),tuskC);
  K.seg(K.PT(1.02,-0.28),K.PT(1.28,-0.5),Math.max(1.6,r*0.16),'#cfc4a8'); K.seg(K.PT(1.28,-0.5),K.PT(1.5,-0.4),Math.max(1.3,r*0.13),tuskC);
  const eye=(windup||charging)?'#ff5d4a':'#2a1408';                            // eyes go red on the attack
  K.px(0.72,0.3,Math.max(1.8,r*0.18),Math.max(1.8,r*0.18),eye); K.px(0.72,-0.3,Math.max(1.8,r*0.18),Math.max(1.8,r*0.18),eye);
  K.px(0.68,0.26,1.4,1.4,'#ffe9c8'); K.px(0.68,-0.34,1.4,1.4,'#ffe9c8');
  if(en.elite) K.seg(K.PT(-0.1,-0.45),K.PT(0.32,-0.16),Math.max(1.2,r*0.1),'#d8a088');   // an old scar
  // (the windup's snorting steam & the charge's speed lines are drawn over the scene each frame — eFxPre / eFxPost — not baked in)
}
function drawSnake(en,sx,sy,r,fa,fcx,fcy,pxn,pyn,fl,s){
  const pctx=ESPR.ctx;
  const bm=ISL.biome.mods, sT=(!en.elite&&bm.snakeTint)||null;
  const c0=fl?'#fff':(en.elite?'#4a3570':(sT?sT[0]:'#2e5d4e'));
  const c1=fl?'#fff':(en.elite?'#5a4385':(sT?sT[2]:'#387058'));
  const headC=fl?'#fff':(en.elite?'#634a92':(sT?sT[1]:'#356a59'));
  const mark=fl?'#fff':(en.elite?'#c9a6ff':(bm.mark||'#a8e0bc'));
  const dpl=Math.hypot(player.x-en.x,player.y-en.y), agitated=en.aggro||dpl<240;
  const segs=en.elite?6:5;
  for(let i=segs;i>=1;i--){ const off=i*r*0.5, wig=Math.sin(eit*7 - i*1.15 + en.sd*3)*r*0.42;   // tapered, diamond-marked coils
    const cx_=sx-fcx*off+pxn*wig, cy_=sy-fcy*off+pyn*wig, rr=r*(0.8-i*0.085);
    if(i===segs){ const tx2=cx_-fcx*rr*1.7, ty2=cy_-fcy*rr*1.7;               // tail: point — or the elite's rattle
      if(en.elite){ const sh2=(agitated&&en.tmr<0.6)? Math.sin(eit*30)*1.5*s:0;
        pctx.fillStyle='#d8cfa8'; pctx.beginPath(); pctx.arc(tx2+pxn*sh2,ty2+pyn*sh2,Math.max(1.6,rr*0.55),0,TAU); pctx.fill();
        pctx.fillStyle='#b8ab7e'; pctx.beginPath(); pctx.arc(tx2-fcx*rr*0.9+pxn*sh2,ty2-fcy*rr*0.9+pyn*sh2,Math.max(1.2,rr*0.4),0,TAU); pctx.fill(); }
      else { pctx.strokeStyle=c0; pctx.lineWidth=Math.max(1.2,rr*0.6); pctx.beginPath(); pctx.moveTo(cx_,cy_); pctx.lineTo(tx2,ty2); pctx.stroke(); } }
    pctx.fillStyle='#10241e'; pctx.beginPath(); pctx.arc(cx_,cy_,rr*1.28,0,TAU); pctx.fill();
    pctx.fillStyle=i%2?c0:c1; pctx.beginPath(); pctx.arc(cx_,cy_,rr,0,TAU); pctx.fill();
    if(!fl && rr>r*0.32 && r>=5){ pctx.fillStyle=mark; pctx.beginPath();   // (the diamonds only where there's room for them)
      pctx.moveTo(cx_,cy_-rr*0.62); pctx.lineTo(cx_+rr*0.5,cy_); pctx.lineTo(cx_,cy_+rr*0.62); pctx.lineTo(cx_-rr*0.5,cy_); pctx.closePath(); pctx.fill();
      pctx.fillStyle=i%2?c1:c0; pctx.beginPath(); pctx.arc(cx_,cy_,rr*0.24,0,TAU); pctx.fill(); }
  }
  const hooding=!fl && agitated && en.tmr<0.5;                                 // the hood flares before a spit
  if(hooding){ pctx.fillStyle=c0;
    pctx.beginPath(); pctx.ellipse(sx+pxn*r*0.52,sy+pyn*r*0.52, r*0.54,r*0.3, fa+1.1,0,TAU); pctx.fill();
    pctx.beginPath(); pctx.ellipse(sx-pxn*r*0.52,sy-pyn*r*0.52, r*0.54,r*0.3, fa-1.1,0,TAU); pctx.fill(); }
  const hsc=hooding?1.12:1;                                                    // spade head, gland cheeks, brow
  pctx.fillStyle='#10241e'; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.95*hsc,r*0.72*hsc,fa,0,TAU); pctx.fill();
  pctx.fillStyle=headC; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.8*hsc,r*0.6*hsc,fa,0,TAU); pctx.fill();
  if(fl) return;
  pctx.fillStyle=c1;
  pctx.beginPath(); pctx.arc(sx-fcx*r*0.15+pxn*r*0.42, sy-fcy*r*0.15+pyn*r*0.42, r*0.26,0,TAU); pctx.fill();
  pctx.beginPath(); pctx.arc(sx-fcx*r*0.15-pxn*r*0.42, sy-fcy*r*0.15-pyn*r*0.42, r*0.26,0,TAU); pctx.fill();
  pctx.strokeStyle='rgba(16,36,30,.55)'; pctx.lineWidth=Math.max(1,r*0.1);
  pctx.beginPath(); pctx.arc(sx,sy,r*0.55, fa-0.85, fa+0.85); pctx.stroke();
  for(const side of [1,-1]){ const X=sx+fcx*r*0.3+pxn*r*0.32*side, Y=sy+fcy*r*0.3+pyn*r*0.32*side;   // slit eyes
    const e=Math.max(1,Math.round(r*0.22)); pctx.fillStyle='#ffd23f'; pctx.fillRect(Math.round(X-e/2),Math.round(Y-e/2),e,e);
    if(e>=2){ pctx.fillStyle='#10241e'; pctx.fillRect(Math.round(X-0.5),Math.round(Y-e/2),1,e); } }
  if(agitated && en.tmr<0.16){ const mx_=sx+fcx*r*0.78, my_=sy+fcy*r*0.78;     // jaws open, fangs out
    pctx.fillStyle='#5e2436'; pctx.beginPath(); pctx.ellipse(mx_,my_,r*0.3,r*0.22,fa,0,TAU); pctx.fill();
    pctx.fillStyle='#fff';
    pctx.fillRect(mx_+pxn*r*0.16-0.8,my_+pyn*r*0.16-0.8,1.6,2.4);
    pctx.fillRect(mx_-pxn*r*0.16-0.8,my_-pyn*r*0.16-0.8,1.6,2.4); }
  else if(((eit*1.8+en.y*0.05)%1)<0.35){                                       // forked tongue flick
    const t0x=sx+fcx*r*0.82, t0y=sy+fcy*r*0.82, t1x=t0x+fcx*r*0.4, t1y=t0y+fcy*r*0.4;
    pctx.strokeStyle='#ff7d8c'; pctx.lineWidth=Math.max(1.3,r*0.1);   // (≥1.3 texels, or the pixel snap eats it)
    pctx.beginPath(); pctx.moveTo(t0x,t0y); pctx.lineTo(t1x,t1y);
    pctx.lineTo(t1x+fcx*r*0.16+pxn*r*0.12, t1y+fcy*r*0.16+pyn*r*0.12);
    pctx.moveTo(t1x,t1y); pctx.lineTo(t1x+fcx*r*0.16-pxn*r*0.12, t1y+fcy*r*0.16-pyn*r*0.12); pctx.stroke(); }
}
function drawCrab(en,sx,sy,r,fa,fcx,fcy,pxn,pyn,fl,s){
  const pctx=ESPR.ctx;
  const bm=ISL.biome.mods, tint=bm.crabTint||['#c2563a','#e07a50','#7e3322'];
  const windup=en.st==='windup', recov=en.st==='recover', lung=en.st==='lunge';
  const wob=recov? Math.sin(eit*9)*0.1 : 0;
  if(!fl){ pctx.strokeStyle='#5e2616'; pctx.lineWidth=Math.max(1.4,r*0.14); pctx.beginPath();   // six scuttling legs
    for(let i2=0;i2<3;i2++) for(const side of [1,-1]){
      const ph=Math.sin(eit*(lung?16:9)+en.sd+i2*1.9+(side>0?0:2.4))*0.18;
      const bx2=-0.4+i2*0.36;
      const bX=sx+(fcx*bx2+pxn*side*0.9)*r, bY=sy+(fcy*bx2+pyn*side*0.9)*r;
      pctx.moveTo(bX,bY); pctx.lineTo(bX+(pxn*side*(0.5+ph)-fcx*0.2)*r, bY+(pyn*side*(0.5+ph)-fcy*0.2)*r); }
    pctx.stroke(); }
  pctx.fillStyle='#3a160c'; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.95,r*1.18,fa+wob,0,TAU); pctx.fill();   // wide shell
  pctx.fillStyle=fl?'#fff':(recov?'#e8a06a':(windup?tint[1]:tint[0]));
  pctx.beginPath(); pctx.ellipse(sx,sy,r*0.82,r*1.05,fa+wob,0,TAU); pctx.fill();
  if(fl) return;
  pctx.strokeStyle=en.elite?'#ffd23f':tint[1]; pctx.lineWidth=Math.max(1.2,r*0.12);   // the armored brow — its face is a wall
  pctx.beginPath(); pctx.ellipse(sx,sy,r*0.7,r*0.92,fa+wob,-1.1,1.1); pctx.stroke();
  pctx.fillStyle='rgba(58,22,12,.45)';
  for(let k=0;k<4;k++){ const a2=en.sd+k*1.7;                                  // mottled shell spots
    const X=sx+(fcx*Math.cos(a2)*0.4+pxn*Math.sin(a2)*0.62)*r, Y=sy+(fcy*Math.cos(a2)*0.4+pyn*Math.sin(a2)*0.62)*r;
    pctx.fillRect(X-1.2,Y-1.2,Math.max(1.6,r*0.16),Math.max(1.6,r*0.16)); }
  if(recov){ pctx.fillStyle='#f2c890'; pctx.beginPath(); pctx.ellipse(sx+fcx*r*0.3,sy+fcy*r*0.3,r*0.34,r*0.5,fa,0,TAU); pctx.fill(); }   // soft belly shows — strike now
  const ca=windup?0.95:(recov?1.3:0.55), cd=r*(windup?1.3:1.25), cr2=r*(windup?0.5:0.42)*(en.elite?1.15:1);
  for(const side of [1,-1]){ const a2=fa+ca*side;                              // the pincers
    const X=sx+Math.cos(a2)*cd, Y=sy+Math.sin(a2)*cd;
    pctx.fillStyle='#3a160c'; pctx.beginPath(); pctx.arc(X,Y,cr2*1.2,0,TAU); pctx.fill();
    pctx.fillStyle=windup?tint[1]:tint[0]; pctx.beginPath(); pctx.arc(X,Y,cr2,0,TAU); pctx.fill();
    pctx.fillStyle='#3a160c'; pctx.beginPath();                                // notch of the claw
    pctx.moveTo(X+Math.cos(fa)*cr2*1.1, Y+Math.sin(fa)*cr2*1.1);
    pctx.lineTo(X+Math.cos(fa+0.5*side)*cr2*0.4, Y+Math.sin(fa+0.5*side)*cr2*0.4);
    pctx.lineTo(X+Math.cos(fa)*cr2*0.2, Y+Math.sin(fa)*cr2*0.2); pctx.closePath(); pctx.fill();
    if(windup){ pctx.fillStyle='#fff'; pctx.fillRect(X-1,Y-1,2,2); } }
  for(const side of [1,-1]){ const bX=sx+(fcx*0.55+pxn*side*0.3)*r, bY=sy+(fcy*0.55+pyn*side*0.3)*r;   // eye stalks
    const tX=bX+fcx*r*0.3, tY=bY+fcy*r*0.3;
    pctx.strokeStyle='#5e2616'; pctx.lineWidth=Math.max(1,r*0.1);
    pctx.beginPath(); pctx.moveTo(bX,bY); pctx.lineTo(tX,tY); pctx.stroke();
    const q=Math.max(1,Math.round(r*0.2)); pctx.fillStyle='#16080a'; pctx.fillRect(Math.round(tX-q/2),Math.round(tY-q/2),q,q);
    if(q>=2){ pctx.fillStyle='#ffe9c8'; pctx.fillRect(Math.round(tX-q/2),Math.round(tY-q/2),1,1); } }
}
function drawDingo(en,sx,sy,r,fa,fcx,fcy,pxn,pyn,fl,s){
  const pctx=ESPR.ctx;
  const bm=ISL.biome.mods, tint=bm.dingoTint||(en.elite?['#8a5c30','#5e3c1c','#d8b88a']:['#c08a52','#8a5c30','#e8d4ae']);
  const crouch=en.st==='crouch', pounce=en.st==='pounce', mov=pounce||!!en.mv;
  const str=pounce?1.28:(crouch?0.86:1), wid=pounce?0.46:(crouch?0.68:0.58);
  if(!fl){ const ph=eit*(pounce?20:13)+en.sd, lo=crouch?0.55:0.72; pctx.fillStyle=tint[1];   // galloping legs — out past the flanks, so it reads as a four-legged hunter, not a log (crouched: tucked in)
    [[0.52,lo,0],[0.52,-lo,Math.PI],[-0.55,lo,Math.PI],[-0.55,-lo,0]].forEach(L=>{
      const ext=mov? Math.sin(ph+L[2])*0.3 : 0;
      const X=sx+(fcx*(L[0]+ext)+pxn*L[1])*r, Y=sy+(fcy*(L[0]+ext)+pyn*L[1])*r;
      pctx.fillRect(X-Math.max(1,r*0.1), Y-Math.max(1.2,r*0.17), Math.max(2,r*0.2), Math.max(2.4,r*0.34)); }); }
  if(!fl){ const wag=crouch?0: Math.sin(eit*6+en.sd)*0.3;                      // white-tipped tail
    const t0X=sx-fcx*r*1.0*str, t0Y=sy-fcy*r*1.0*str;
    const t1X=t0X-(fcx*0.55-pxn*wag)*r, t1Y=t0Y-(fcy*0.55-pyn*wag)*r;
    pctx.strokeStyle=tint[1]; pctx.lineWidth=Math.max(1.6,r*0.2);
    pctx.beginPath(); pctx.moveTo(t0X,t0Y); pctx.lineTo(t1X,t1Y); pctx.stroke();
    pctx.fillStyle=tint[2]; pctx.beginPath(); pctx.arc(t1X,t1Y,Math.max(1.5,r*0.16),0,TAU); pctx.fill(); }
  pctx.fillStyle='#2a1c0c'; pctx.beginPath(); pctx.ellipse(sx,sy,r*1.08*str,r*(wid+0.1),fa,0,TAU); pctx.fill();   // lean body (shorter — the head & legs carry the shape)
  pctx.fillStyle=fl?'#fff':tint[0]; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.96*str,r*wid,fa,0,TAU); pctx.fill();
  if(fl) return;
  pctx.fillStyle='rgba(42,28,12,.5)';                                          // dorsal stripe
  pctx.beginPath(); pctx.ellipse(sx,sy,r*0.9*str,r*0.16,fa,0,TAU); pctx.fill();
  pctx.fillStyle='rgba(42,28,12,.28)';                                         // shoulder + haunch muscle
  pctx.beginPath(); pctx.arc(sx-fcx*r*0.6*str,sy-fcy*r*0.6*str,r*0.32,0,TAU); pctx.fill();
  pctx.beginPath(); pctx.arc(sx+fcx*r*0.45*str,sy+fcy*r*0.45*str,r*0.28,0,TAU); pctx.fill();
  const hX=sx+fcx*r*1.0*str, hY=sy+fcy*r*1.0*str;                              // a bigger head, a pale muzzle, a dark nose
  pctx.fillStyle='#2a1c0c'; pctx.beginPath(); pctx.arc(hX,hY,r*0.54,0,TAU); pctx.fill();
  pctx.fillStyle=tint[0]; pctx.beginPath(); pctx.arc(hX,hY,r*0.46,0,TAU); pctx.fill();
  pctx.fillStyle=tint[2]; pctx.beginPath(); pctx.ellipse(hX+fcx*r*0.3,hY+fcy*r*0.3,r*0.3,r*0.2,fa,0,TAU); pctx.fill();
  { const q=Math.max(1,Math.round(r*0.18)); pctx.fillStyle='#16080a'; pctx.fillRect(Math.round(hX+fcx*r*0.5-q/2),Math.round(hY+fcy*r*0.5-q/2),q,q); }
  for(const side of [1,-1]){ const eX=hX+(pxn*side*0.38-fcx*0.08)*r, eY=hY+(pyn*side*0.38-fcy*0.08)*r;   // pricked ears, big & dark (the dingo's tell)
    pctx.fillStyle='#2a1c0c'; pctx.beginPath();
    pctx.moveTo(eX-pxn*side*r*0.08,eY-pyn*side*r*0.08);
    pctx.lineTo(eX+(pxn*side*0.34-fcx*0.24)*r, eY+(pyn*side*0.34-fcy*0.24)*r);
    pctx.lineTo(eX+(pxn*side*0.12+fcx*0.24)*r, eY+(pyn*side*0.12+fcy*0.24)*r);
    pctx.closePath(); pctx.fill();
    pctx.fillStyle='#b06a5a'; pctx.fillRect(eX-0.8,eY-0.8,1.6,1.6); }
  const eyeC=(crouch||pounce)?'#ff5d4a':'#ffb44a';                             // eyes flare on the hunt
  pctx.fillStyle=eyeC;
  { const q=Math.max(1,Math.round(r*0.18)); pctx.fillRect(Math.round(hX+(fcx*0.16+pxn*0.2)*r-q/2),Math.round(hY+(fcy*0.16+pyn*0.2)*r-q/2),q,q);
    pctx.fillRect(Math.round(hX+(fcx*0.16-pxn*0.2)*r-q/2),Math.round(hY+(fcy*0.16-pyn*0.2)*r-q/2),q,q); }
  // (the pounce's leap streaks are drawn over the scene each frame — eFxPre — not baked in)
}
/* (C8a) the signatures' paint kit — body space (dx forward · dy its right flank, × r) → ellipses, texel dots, strokes & polygons on the sprite board */
function sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn){ const g=ESPR.ctx, P=(dx,dy)=>[sx+(fcx*dx+pxn*dy)*r, sy+(fcy*dx+pyn*dy)*r];
  return { P,
    el:(dx,dy,rx,ry,col,ro)=>{ const p=P(dx,dy); g.fillStyle=col; g.beginPath(); g.ellipse(p[0],p[1],Math.max(0.9,rx*r),Math.max(0.9,ry*r),fa+(ro||0),0,TAU); g.fill(); },
    dot:(dx,dy,q,col)=>{ const p=P(dx,dy), w=Math.max(1.4,q); g.fillStyle=col; g.fillRect(p[0]-w/2,p[1]-w/2,w,w); },
    ln:(x0,y0,x1,y1,w,col)=>{ const a=P(x0,y0), b=P(x1,y1); g.strokeStyle=col; g.lineWidth=Math.max(1.3,w*r); g.beginPath(); g.moveTo(a[0],a[1]); g.lineTo(b[0],b[1]); g.stroke(); },
    poly:(pts,col)=>{ g.fillStyle=col; g.beginPath(); for(let i=0;i<pts.length;i++){ const p=P(pts[i][0],pts[i][1]); if(i) g.lineTo(p[0],p[1]); else g.moveTo(p[0],p[1]); } g.closePath(); g.fill(); } }; }
/* sprites for the ten new monsters (+ C8a's eight signatures) */
function drawNewMon(en,sx,sy,r,fa,fcx,fcy,pxn,pyn,fl,s){
  const pctx=ESPR.ctx;
  switch(en.type){
  case 'dummy': {                                                          // the DEV TRAINING DUMMY (§13): a straw man on a post — a burlap sack, a crossbar of arms, a painted target, stitched eyes
    pctx.fillStyle='#4a3018'; pctx.fillRect(sx-r*0.12,sy-r*0.2,r*0.24,r*1.3);                                                 // the post
    pctx.fillStyle=fl?'#fff':'#6e4a26'; pctx.fillRect(sx-r*1.15,sy-r*0.62,r*2.3,r*0.26);                                   // the arms
    pctx.fillStyle=fl?'#fff':'#c8a860'; for(const sg of [-1,1]){ pctx.beginPath(); pctx.ellipse(sx+sg*r*1.12,sy-r*0.5,r*0.18,r*0.26,0,0,TAU); pctx.fill(); }   // straw tufts at the wrists
    pctx.fillStyle=fl?'#fff':'#b8925a'; pctx.beginPath(); pctx.ellipse(sx,sy-r*0.1,r*0.62,r*0.78,0,0,TAU); pctx.fill();   // the sack body
    pctx.fillStyle=fl?'#fff':'#d4b070'; pctx.beginPath(); pctx.arc(sx,sy-r*1.12,r*0.42,0,TAU); pctx.fill();               // the head
    if(fl) break;
    pctx.fillStyle='#8a6a3a'; pctx.fillRect(sx-r*0.62,sy-r*0.5,r*1.24,r*0.1); pctx.fillRect(sx-r*0.5,sy+r*0.35,r*1.0,r*0.1);   // the twine bands
    pctx.fillStyle='#c83a2a'; pctx.beginPath(); pctx.arc(sx,sy-r*0.05,r*0.34,0,TAU); pctx.fill();                          // the painted target
    pctx.fillStyle='#f2e6c8'; pctx.beginPath(); pctx.arc(sx,sy-r*0.05,r*0.22,0,TAU); pctx.fill();
    pctx.fillStyle='#c83a2a'; pctx.beginPath(); pctx.arc(sx,sy-r*0.05,r*0.1,0,TAU); pctx.fill();
    pctx.strokeStyle='#3a2410'; pctx.lineWidth=Math.max(1,r*0.07); for(const sg of [-1,1]){ const ex=sx+sg*r*0.16, ey=sy-r*1.16, q=r*0.07;   // stitched X eyes
      pctx.beginPath(); pctx.moveTo(ex-q,ey-q); pctx.lineTo(ex+q,ey+q); pctx.moveTo(ex+q,ey-q); pctx.lineTo(ex-q,ey+q); pctx.stroke(); }
    break; }
  case 'urchin': {
    const swell=en.st==='swell', sw=swell?1+0.28*Math.sin(itime*40):1, sc=fl?'#fff':(swell?'#ff7a4a':'#5a4a6e');
    pctx.strokeStyle=sc; pctx.lineWidth=Math.max(1.2,r*0.13);
    for(let i=0;i<14;i++){ const a=i/14*TAU; pctx.beginPath(); pctx.moveTo(sx+Math.cos(a)*r*0.7,sy+Math.sin(a)*r*0.7); pctx.lineTo(sx+Math.cos(a)*r*1.35*sw,sy+Math.sin(a)*r*1.35*sw); pctx.stroke(); }
    pctx.fillStyle='#15101f'; pctx.beginPath(); pctx.arc(sx,sy,r*0.86*sw,0,TAU); pctx.fill();
    pctx.fillStyle=fl?'#fff':(swell?'#c8482e':'#3a2a4a'); pctx.beginPath(); pctx.arc(sx,sy,r*0.74*sw,0,TAU); pctx.fill();
    if(fl) break;
    pctx.fillStyle=swell?'#ffd23f':'#8a6ab0'; pctx.beginPath(); pctx.arc(sx,sy,r*0.28,0,TAU); pctx.fill();
    break; }
  case 'ooze': {                                                           // a SLIME, not a bush: acid-lime jelly (magma on scorched isles), a glossy top-left shine, bubbles, a drip & big googly eyes
    const wob=Math.sin(itime*5+en.sd)*0.12, sc=en.scorch, rim=sc?'#4a160a':'#1e4a10', body=sc?'#d0602a':'#8ad83e', deep=sc?'#8a2e10':'#56a82a', hi=sc?'#ffd08a':'#e2ffa8';
    pctx.fillStyle=rim; pctx.beginPath(); pctx.ellipse(sx-fcx*r*0.62,sy-fcy*r*0.62,r*0.62,r*0.46,fa,0,TAU); pctx.fill();   // the slick it leaves behind
    pctx.fillStyle=fl?'#fff':deep; pctx.beginPath(); pctx.ellipse(sx-fcx*r*0.62,sy-fcy*r*0.62,r*0.46,r*0.32,fa,0,TAU); pctx.fill();
    pctx.fillStyle=rim; pctx.beginPath(); pctx.ellipse(sx,sy,r*1.02,r*(0.86+wob),fa,0,TAU); pctx.fill();
    pctx.fillStyle=fl?'#fff':deep; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.9,r*(0.74+wob),fa,0,TAU); pctx.fill();
    if(fl) break;
    pctx.fillStyle=body; pctx.beginPath(); pctx.ellipse(sx-r*0.1,sy-r*0.12,r*0.74,r*(0.58+wob*0.8),0,0,TAU); pctx.fill();   // lit from the top-left, deeper low-right
    pctx.fillStyle=hi; pctx.beginPath(); pctx.ellipse(sx-r*0.42,sy-r*0.4,r*0.24,r*0.15,-0.5,0,TAU); pctx.fill();
    pctx.fillRect(sx+r*0.3,sy-r*0.46,Math.max(1.4,r*0.12),Math.max(1.4,r*0.12));
    pctx.fillStyle=deep; for(let k=0;k<3;k++){ const a2=en.sd*2+k*2.2, d2=r*(0.25+0.12*k); pctx.fillRect(sx+Math.cos(a2)*d2-0.8,sy+Math.sin(a2)*d2*0.7-0.8,Math.max(1.4,r*0.13),Math.max(1.4,r*0.13)); }   // bubbles
    for(const sg of [1,-1]){ const ex=sx+fcx*r*0.34+pxn*r*0.3*sg, ey=sy+fcy*r*0.34+pyn*r*0.3*sg;   // big white eyes, pupils toward you
      pctx.fillStyle='#fff'; pctx.beginPath(); pctx.arc(ex,ey,Math.max(1.6,r*0.2),0,TAU); pctx.fill();
      pctx.fillStyle='#10200a'; pctx.fillRect(ex+fcx*r*0.07-0.8,ey+fcy*r*0.07-0.8,Math.max(1.4,r*0.11),Math.max(1.4,r*0.11)); }
    break; }
  case 'clam': {
    const open=en.st==='open', glow=!open&&en.tmr<0.35, gap=open?r*0.55:0;
    pctx.fillStyle=fl?'#fff':'#4a3a2a'; pctx.beginPath(); pctx.ellipse(sx,sy-gap*0.5,r*1.0,r*0.78,0,Math.PI,TAU); pctx.fill();
    pctx.fillStyle=fl?'#fff':'#b8945a'; pctx.beginPath(); pctx.ellipse(sx,sy-gap*0.5,r*0.9,r*0.68,0,Math.PI,TAU); pctx.fill();
    if(open){ pctx.fillStyle='#2a1420'; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.7,r*0.5,0,0,TAU); pctx.fill();
      pctx.fillStyle='#f0e6d2'; pctx.beginPath(); pctx.arc(sx,sy,r*0.26,0,TAU); pctx.fill();
      pctx.fillStyle='#fff'; pctx.beginPath(); pctx.arc(sx-r*0.1,sy-r*0.1,r*0.09,0,TAU); pctx.fill(); }
    pctx.fillStyle=fl?'#fff':'#4a3a2a'; pctx.beginPath(); pctx.ellipse(sx,sy+gap*0.5,r*1.0,r*0.78,0,0,Math.PI); pctx.fill();
    pctx.fillStyle=fl?'#fff':'#caa46a'; pctx.beginPath(); pctx.ellipse(sx,sy+gap*0.5,r*0.9,r*0.68,0,0,Math.PI); pctx.fill();
    if(!fl){ pctx.strokeStyle='#8a6e44'; pctx.lineWidth=Math.max(1,r*0.08);
      for(let i=-2;i<=2;i++){ pctx.beginPath(); pctx.moveTo(sx,sy+gap*0.5); pctx.lineTo(sx+i*r*0.3,sy+gap*0.5+r*0.74); pctx.stroke(); } }
    if(glow){ pctx.strokeStyle='#ffe9a6'; pctx.lineWidth=Math.max(1,r*0.12); pctx.beginPath(); pctx.moveTo(sx-r*0.85,sy); pctx.lineTo(sx+r*0.85,sy); pctx.stroke(); }
    break; }
  case 'reefspike': {
    const spk=en.spk>0; pctx.strokeStyle=fl?'#fff':(spk?'#ffd23f':'#8a9aa0'); pctx.lineWidth=Math.max(1.4,r*0.16);
    for(let i=0;i<10;i++){ const a=i/10*TAU; pctx.beginPath(); pctx.moveTo(sx+Math.cos(a)*r*0.7,sy+Math.sin(a)*r*0.62); pctx.lineTo(sx+Math.cos(a)*r*(spk?1.5:1.24),sy+Math.sin(a)*r*(spk?1.5:1.24)); pctx.stroke(); }
    pctx.fillStyle='#222b30'; pctx.beginPath(); pctx.ellipse(sx,sy,r*1.0,r*0.88,fa,0,TAU); pctx.fill();
    pctx.fillStyle=fl?'#fff':'#46565c'; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.88,r*0.76,fa,0,TAU); pctx.fill();
    if(fl) break;
    pctx.fillStyle='rgba(20,28,32,.5)'; for(let k=0;k<5;k++){ const a2=en.sd+k*1.5; pctx.beginPath(); pctx.arc(sx+Math.cos(a2)*r*0.4,sy+Math.sin(a2)*r*0.34,r*0.12,0,TAU); pctx.fill(); }
    for(const sg of [1,-1]){ const q=Math.max(1,Math.round(r*0.18)); pctx.fillStyle='#16080a'; pctx.fillRect(Math.round(sx+fcx*r*0.42+pxn*r*0.24*sg-q/2),Math.round(sy+fcy*r*0.42+pyn*r*0.24*sg-q/2),q,q); }
    break; }
  case 'diver': {
    const grounded=en.st==='grounded', alt=(en.alt==null?1:en.alt), by=sy+(grounded?0:-alt*r*1.7), flap=Math.abs(Math.sin(itime*16))*(grounded?0.15:0.7);
    pctx.fillStyle=fl?'#fff':'#3a4654';
    for(const sg of [1,-1]){ pctx.beginPath(); pctx.moveTo(sx,by);
      pctx.lineTo(sx-fcx*r*0.2+pxn*sg*r*1.3, by-fcy*r*0.2+pyn*sg*r*1.3-flap*r);
      pctx.lineTo(sx-fcx*r*0.8+pxn*sg*r*0.4, by-fcy*r*0.8+pyn*sg*r*0.4); pctx.closePath(); pctx.fill(); }
    pctx.fillStyle='#1a2230'; pctx.beginPath(); pctx.ellipse(sx,by,r*0.7,r*0.42,fa,0,TAU); pctx.fill();
    pctx.fillStyle=fl?'#fff':'#5a6a7a'; pctx.beginPath(); pctx.ellipse(sx,by,r*0.6,r*0.34,fa,0,TAU); pctx.fill();
    if(fl) break;
    pctx.fillStyle='#ffb44a'; pctx.beginPath(); pctx.moveTo(sx+fcx*r*0.55,by+fcy*r*0.55); pctx.lineTo(sx+fcx*r*1.15,by+fcy*r*1.15); pctx.lineTo(sx+fcx*r*0.45+pxn*r*0.22,by+fcy*r*0.45+pyn*r*0.22); pctx.closePath(); pctx.fill();
    pctx.fillStyle='#16080a'; pctx.fillRect(sx+fcx*r*0.3+pxn*r*0.18-1,by+fcy*r*0.3+pyn*r*0.18-1,2,2);
    break; }
  case 'sanddev': {
    if(en.st!=='erupt'){ pctx.fillStyle=fl?'#fff':'#caa46a'; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.92,r*0.5,fa,0,TAU); pctx.fill();
      pctx.fillStyle='#b8945a'; pctx.beginPath(); pctx.ellipse(sx,sy-r*0.1,r*0.6,r*0.3,fa,0,TAU); pctx.fill();
      pctx.fillStyle='#e3cf9c'; pctx.fillRect(sx-r*0.5,sy-1.5,r*1.0,3); break; }
    pctx.fillStyle='#2a2018'; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.95,r*1.02,fa,0,TAU); pctx.fill();
    pctx.fillStyle=fl?'#fff':'#6e5a3e'; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.82,r*0.88,fa,0,TAU); pctx.fill();
    if(fl) break;
    pctx.fillStyle='#3a1420'; pctx.beginPath(); pctx.arc(sx+fcx*r*0.15,sy+fcy*r*0.15,r*0.52,0,TAU); pctx.fill();
    for(let i=0;i<9;i++){ const a=fa+(-1.1+i*0.26); pctx.fillStyle='#f0e6d2';
      pctx.beginPath(); pctx.moveTo(sx+Math.cos(a)*r*0.52,sy+Math.sin(a)*r*0.52); pctx.lineTo(sx+Math.cos(a)*r*0.26,sy+Math.sin(a)*r*0.26); pctx.lineTo(sx+Math.cos(a+0.13)*r*0.48,sy+Math.sin(a+0.13)*r*0.48); pctx.closePath(); pctx.fill(); }
    break; }
  case 'alpha': {
    const howl=en.howl>0;
    if(!fl){ pctx.fillStyle='#2a1c10'; for(const L of [[0.62,0.74],[0.62,-0.74],[-0.66,0.72],[-0.66,-0.72]]){ const X=sx+(fcx*L[0]+pxn*L[1])*r, Y=sy+(fcy*L[0]+pyn*L[1])*r; pctx.fillRect(X-r*0.13,Y-r*0.13,Math.max(2,r*0.26),Math.max(2,r*0.26)); } }   // four big paws out past the flanks (a wolf, not a log)
    pctx.fillStyle='#1a120a'; pctx.beginPath(); pctx.ellipse(sx,sy,r*1.35,r*0.66,fa,0,TAU); pctx.fill();
    pctx.fillStyle=fl?'#fff':'#5a3a22'; pctx.beginPath(); pctx.ellipse(sx,sy,r*1.22,r*0.56,fa,0,TAU); pctx.fill();
    if(fl) break;
    pctx.fillStyle='#2a1c10'; for(let k=0;k<7;k++){ const a=en.sd+k; pctx.beginPath(); pctx.arc(sx-fcx*r*0.3+Math.cos(a)*r*0.32,sy-fcy*r*0.3+Math.sin(a)*r*0.32,r*0.2,0,TAU); pctx.fill(); }
    const hX=sx+fcx*r*1.12, hY=sy+fcy*r*1.12;
    pctx.fillStyle='#2a1c10'; pctx.beginPath(); pctx.arc(hX,hY,r*0.5,0,TAU); pctx.fill();
    pctx.fillStyle='#5a3a22'; pctx.beginPath(); pctx.arc(hX,hY,r*0.42,0,TAU); pctx.fill();
    pctx.fillStyle=howl?'#ff5d4a':'#ffb44a'; for(const sg of [1,-1]) pctx.fillRect(hX+(fcx*0.16+pxn*0.22*sg)*r-1.3,hY+(fcy*0.16+pyn*0.22*sg)*r-1.3,2.6,2.6);
    if(howl){ pctx.strokeStyle='rgba(255,90,74,.5)'; pctx.lineWidth=2; pctx.beginPath(); pctx.arc(hX,hY,r*0.95,0,TAU); pctx.stroke(); }
    break; }
  case 'tidecaller': {
    const cast=en.cast>0;
    pctx.fillStyle='#1a2a26'; pctx.beginPath(); pctx.moveTo(sx,sy-r*1.3); pctx.lineTo(sx+r*0.82,sy+r); pctx.lineTo(sx-r*0.82,sy+r); pctx.closePath(); pctx.fill();
    pctx.fillStyle=fl?'#fff':(cast?'#2f6b58':'#244a42'); pctx.beginPath(); pctx.moveTo(sx,sy-r*1.15); pctx.lineTo(sx+r*0.68,sy+r*0.85); pctx.lineTo(sx-r*0.68,sy+r*0.85); pctx.closePath(); pctx.fill();
    if(fl) break;
    pctx.fillStyle='#0c1a16'; pctx.beginPath(); pctx.arc(sx,sy-r*0.5,r*0.4,0,TAU); pctx.fill();
    pctx.fillStyle=cast?'#8fe0c0':'#3fae9e'; pctx.beginPath(); pctx.arc(sx,sy+r*0.12,r*0.22,0,TAU); pctx.fill();
    pctx.fillStyle=cast?'#bfffe6':'#2f6b58'; for(const sg of [1,-1]) pctx.fillRect(sx+sg*r*0.16-1,sy-r*0.5-1,2,2);
    break; }
  case 'lamprey': {
    pctx.strokeStyle=fl?'#fff':'#3a2a44'; pctx.lineWidth=Math.max(2,r*0.7); pctx.lineCap='round';
    pctx.beginPath(); pctx.moveTo(sx,sy);
    for(let i=1;i<=4;i++){ const wig=Math.sin(itime*12-i)*r*0.4; pctx.lineTo(sx-fcx*r*0.55*i+pxn*wig,sy-fcy*r*0.55*i+pyn*wig); }
    pctx.stroke(); pctx.lineCap='butt';
    if(fl) break;
    const hx=sx+fcx*r*0.2, hy=sy+fcy*r*0.2;
    pctx.fillStyle='#5a3b5a'; pctx.beginPath(); pctx.arc(hx,hy,r*0.55,0,TAU); pctx.fill();
    pctx.fillStyle='#1a0e1a'; pctx.beginPath(); pctx.arc(hx,hy,r*0.32,0,TAU); pctx.fill();
    for(let i=0;i<8;i++){ const a=i/8*TAU; pctx.fillStyle='#f0e6d2'; pctx.fillRect(hx+Math.cos(a)*r*0.32-1,hy+Math.sin(a)*r*0.32-1,2,2); }
    if(en.latched){ pctx.fillStyle='#ff5d8c'; pctx.beginPath(); pctx.arc(hx,hy,r*0.14,0,TAU); pctx.fill(); }
    break; }
  case 'siren': {
    const snaring=(player.snare||0)>0.05 && (player.x-en.x)*(player.x-en.x)+(player.y-en.y)*(player.y-en.y)<240*240;
    pctx.fillStyle='#1a2a3e'; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.7,r*1.1,fa,0,TAU); pctx.fill();
    pctx.fillStyle=fl?'#fff':'#7a8fb8'; pctx.beginPath(); pctx.ellipse(sx,sy,r*0.6,r*1.0,fa,0,TAU); pctx.fill();
    if(!fl){ pctx.strokeStyle='#5a6f96'; pctx.lineWidth=Math.max(1,r*0.12);
      for(const sg of [-1,0,1]){ pctx.beginPath(); pctx.moveTo(sx+sg*r*0.3,sy+r*0.5); pctx.lineTo(sx+sg*r*0.3+Math.sin(itime*4+sg)*r*0.3,sy+r*1.25); pctx.stroke(); } }
    if(fl) break;
    pctx.fillStyle=snaring?'#dfffff':'#8de9ff'; for(const sg of [1,-1]){ pctx.beginPath(); pctx.arc(sx+fcx*r*0.25+pxn*r*0.22*sg,sy+fcy*r*0.25+pyn*r*0.22*sg,r*0.13,0,TAU); pctx.fill(); }
    if(snaring){ pctx.strokeStyle='rgba(141,233,255,.55)'; pctx.lineWidth=1.4; pctx.beginPath(); pctx.arc(sx,sy,r*1.2,0,TAU); pctx.stroke(); }
    break; }
  /* ---- (C8a §8.7) THE SHORES' SIGNATURES — top-down, head along +x; the bake adds the dark SNES line ---- */
  case 'coco': {                                                          // a brown monkey with a pale face, clutching a coconut — it hoists it overhead to throw
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, wind=st==='wind', hop=st==='hop', thrown=st==='recover', mv=!!en.mv&&!wind&&!hop&&!thrown, lp=mv?Math.sin(eit*16+en.sd)*0.14:0;
    const OL='#2a1608', FUR=fl?'#fff':'#9a6438', FUR2='#6a4224', FACE='#f2d8b0', NUT='#7a5226';
    if(!fl){ const w=Math.sin(eit*5+en.sd)*0.18; K.ln(-0.5,0,-0.95,0.28+w,0.2,OL); K.ln(-0.95,0.28+w,-1.2,0.05+w,0.2,OL); K.ln(-0.5,0,-0.95,0.28+w,0.11,FUR2); K.ln(-0.95,0.28+w,-1.2,0.05+w,0.11,FUR2);   // the tail: a curl behind it
      const fx=hop?-0.62:-0.35; K.el(fx+lp,0.56,0.2,0.15,OL); K.el(fx-lp,-0.56,0.2,0.15,OL); }   // its feet (tucked back mid-hop)
    K.el(-0.08,0,0.8,0.68,OL); K.el(-0.08,0,0.7,0.58,FUR);
    if(fl) break;
    K.el(-0.25,0,0.4,0.36,FUR2);                                                            // its back, darker
    K.el(0.52,0,0.5,0.48,OL); K.el(0.52,0,0.42,0.41,FUR);                                    // the head
    K.el(0.44,0.5,0.2,0.18,OL); K.el(0.44,-0.5,0.2,0.18,OL); K.el(0.44,0.5,0.14,0.12,'#e0a888'); K.el(0.44,-0.5,0.14,0.12,'#e0a888');   // round ears, pink inside
    K.el(0.68,0,0.3,0.36,FACE); K.dot(0.7,0.15,Math.max(1.4,r*0.14),'#1a0e04'); K.dot(0.7,-0.15,Math.max(1.4,r*0.14),'#1a0e04'); K.dot(0.9,0,Math.max(1.4,r*0.1),'#6a4224');   // the big pale face, dark eyes, a nose
    if(wind){ const p=K.P(0.35,0), R=Math.max(1.6,r*0.34);                                    // WINDING UP: the coconut hoisted over its head (screen-up, so it reads at any facing)
      K.ln(0.35,0.3,0.35,0.05,0.14,FUR); pctx.fillStyle=OL; pctx.beginPath(); pctx.arc(p[0],p[1]-r*0.75,R+1,0,TAU); pctx.fill(); pctx.fillStyle=NUT; pctx.beginPath(); pctx.arc(p[0],p[1]-r*0.75,R,0,TAU); pctx.fill();
      pctx.fillStyle='#b08a52'; pctx.fillRect(Math.round(p[0]-R*0.4),Math.round(p[1]-r*0.75-R*0.5),Math.max(1,Math.round(R*0.45)),Math.max(1,Math.round(R*0.45))); }
    else { K.el(0.86,0.3,0.13,0.12,FUR2); K.el(0.86,-0.3,0.13,0.12,FUR2);                     // its hands…
      if(!thrown){ K.el(1.12,0,0.36,0.36,OL); K.el(1.12,0,0.3,0.3,NUT); K.dot(1.18,-0.1,Math.max(2,r*0.16),'#d0a868'); K.dot(1.05,0.1,Math.max(1.4,r*0.1),'#4a3014'); } }   // …round a COCONUT held out front (empty once it's thrown)
    break; }
  case 'kelpie': {                                                        // a translucent sea-green horse with a kelp mane — it stamps before each dash
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, stamp=st==='windup', run=st==='charge', tired=st==='exposed', mv=!!en.mv&&!stamp&&!run&&!tired;
    const OL='#0e2e2a', B=fl?'#fff':(tired?'#8ad8c4':'#5fc4a8'), B2='#3a8a78', HI='#c8fff0', MANE='#1e5a3a', MANE2='#3a8a4a';
    const g=(run||mv)?Math.sin(eit*(run?24:12)+en.sd)*0.22:0;
    if(!fl){ for(const L of [[0.55,0.56,1],[0.55,-0.56,-1],[-0.55,0.56,-1],[-0.55,-0.56,1]]){ let x=L[0]+g*L[2]*(run?1.5:1); if(stamp && L[0]>0 && L[1]>0) x+=0.32*Math.abs(Math.sin(eit*18));   // four hooves (one STAMPING)
        K.el(x,L[1],0.15,0.13,OL); K.el(x,L[1],0.1,0.08,'#2a4a44'); }
      const w=Math.sin(eit*6+en.sd)*0.2; K.ln(-0.88,0,-1.45,w,0.15,MANE); K.ln(-0.88,0.08,-1.32,0.26+w,0.1,MANE2); K.ln(-0.88,-0.08,-1.32,-0.22+w,0.1,MANE2); }   // a tail of kelp
    K.el(0,0,1.02,0.56,OL); K.el(0,0,0.92,0.47,B);
    if(fl) break;
    K.el(-0.15,0,0.6,0.26,B2); for(const x of [-0.45,-0.15,0.15]) K.ln(x,-0.34,x,0.34,0.06,HI);   // its back · the light through its ribs (it's half sea)
    const hd=stamp?1.04:tired?0.96:1.18, hy=tired?0.24:0;                                    // the head: low as it stamps, hung when it's winded
    K.el(0.72,hy*0.5,0.34,0.24,OL); K.el(0.72,hy*0.5,0.28,0.18,B); K.el(hd,hy,0.34,0.24,OL); K.el(hd,hy,0.28,0.19,B); K.el(hd+0.2,hy,0.12,0.12,HI);
    K.dot(hd,hy+0.13,Math.max(1.4,r*0.1),'#10323c'); K.dot(hd,hy-0.13,Math.max(1.4,r*0.1),'#10323c');
    const mw=Math.sin(eit*(run?18:6)+en.sd)*0.08; for(let k=0;k<4;k++){ const x=0.95-k*0.2; K.ln(x,0,x-0.12,(k&1?0.22:-0.22)+mw,0.09,k&1?MANE:MANE2); }   // the KELP MANE
    break; }
  case 'cinderfox': {                                                     // a slim orange fox, ember paws, a white-tipped brush — it pants after a pass
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, run=st==='pass', pant=st==='recover', bite=st==='wind', mv=!!en.mv&&!bite&&!run&&!pant, str=run?1.18:1;
    const OL='#2a1206', O=fl?'#fff':'#e0782c', O2='#b85418', W='#f4e8d8', EMB=((eit*8+en.sd)|0)&1?'#ffd23f':'#ff8a3c', g=(run||mv)?Math.sin(eit*(run?22:14)+en.sd)*0.25:0;
    if(!fl){ for(const L of [[0.5,0.42,1],[0.5,-0.42,-1],[-0.5,0.42,-1],[-0.5,-0.42,1]]) K.el(L[0]*str+g*L[2],L[1],0.13,0.11,EMB);   // EMBER PAWS
      const tw=Math.sin(eit*5+en.sd)*0.25; K.el(-1.12*str,tw*0.5,0.5,0.25,OL,tw*0.3); K.el(-1.12*str,tw*0.5,0.44,0.19,O,tw*0.3); K.el(-1.5*str,tw*0.7,0.16,0.14,W); }   // the brush
    K.el(0,0,0.98*str,0.44,OL); K.el(0,0,0.9*str,0.37,O);
    if(fl) break;
    K.el(-0.2,0,0.55,0.14,O2); K.el(0.45,0,0.28,0.25,W);                                     // the dorsal shade · a white chest
    const hx=(bite?1.08:0.98)*str; K.el(hx,0,0.4,0.34,OL); K.el(hx,0,0.34,0.28,O); K.el(hx+0.28,0,0.18,0.13,W); K.dot(hx+0.44,0,Math.max(1.4,r*0.12),'#16080a');   // the head, the muzzle, a black nose
    K.poly([[hx-0.05,0.18],[hx-0.22,0.54],[hx+0.12,0.28]],OL); K.poly([[hx-0.05,-0.18],[hx-0.22,-0.54],[hx+0.12,-0.28]],OL);   // big dark-tipped ears
    K.poly([[hx-0.02,0.2],[hx-0.13,0.41],[hx+0.08,0.27]],O); K.poly([[hx-0.02,-0.2],[hx-0.13,-0.41],[hx+0.08,-0.27]],O);
    const ey=bite||run?'#ff5d4a':'#ffd23f'; K.dot(hx+0.12,0.13,Math.max(1.4,r*0.1),ey); K.dot(hx+0.12,-0.13,Math.max(1.4,r*0.1),ey);
    if(pant && ((eit*6)|0)&1) K.el(hx+0.5,0.06,0.1,0.07,'#ff8db0');                           // panting: its tongue lolls
    if(bite) K.el(hx+0.42,0,0.12,0.1,'#5e1a14');                                              // jaws open
    break; }
  case 'mshrimp': {                                                       // a rainbow-shelled shrimp with clubbed forearms — they glow white as it winds a punch
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, wind=st==='wind', act=st==='act', rec=st==='recover', mv=!!en.mv&&!wind&&!act&&!rec, lp=mv?Math.sin(eit*16+en.sd)*0.1:0;
    const OL='#1e0a18', SEG=['#5ac0d8','#6ad06a','#f0c040','#d85aa0'], CL=wind?'#ffffff':'#ff9ab8', CL2=wind?'#fff3c0':'#b04a78';
    if(!fl){ for(let k=0;k<3;k++){ K.ln(-0.2+k*0.25,0.35,-0.3+k*0.25+lp,0.72,0.08,OL); K.ln(-0.2+k*0.25,-0.35,-0.3+k*0.25-lp,-0.72,0.08,OL); }   // little legs
      K.el(-1.05,0.18,0.2,0.13,SEG[0],0.5); K.el(-1.05,-0.18,0.2,0.13,SEG[3],-0.5); K.el(-1.1,0,0.2,0.12,SEG[1]); }   // the tail fan
    K.el(-0.15,0,0.95,0.5,OL);
    if(fl){ K.el(-0.15,0,0.86,0.42,'#fff'); break; }
    for(let k=0;k<4;k++) K.el(-0.75+k*0.3,0,0.2,0.42,SEG[k]);                                  // the rainbow segments
    K.el(0.55,0,0.3,0.34,OL); K.el(0.55,0,0.25,0.29,'#e86a50');                                // the head
    for(const sg of [1,-1]){ K.ln(0.7,0.15*sg,0.95,0.26*sg,0.07,OL); K.dot(0.97,0.27*sg,Math.max(1.6,r*0.16),'#ffe066'); K.dot(0.99,0.27*sg,1.4,'#1a0a14'); }   // eyes on stalks
    const cx=wind?0.3:act?1.3:rec?1.05:0.8, cy=wind?0.62:act?0.22:rec?0.45:0.46;               // the CLUBS: folded · pulled back & white-hot · thrown · spent
    for(const sg of [1,-1]){ K.ln(0.5,0.3*sg,cx,cy*sg,0.12,OL); K.el(cx,cy*sg,0.23,0.2,OL); K.el(cx,cy*sg,0.18,0.15,CL); K.dot(cx+0.04,cy*sg-0.04,1.4,CL2); }
    break; }
  case 'mothwing': {                                                      // a big dusty-white moth with eye-spot wings, flapping above its shadow
    const K=sgKit(sx,sy-r*MOTH_LIFT,r,fa,fcx,fcy,pxn,pyn), fp=0.55+0.45*Math.abs(Math.sin(eit*18+en.sd)), drop=!!en.pf;
    const OL='#3a3024', W1=fl?'#fff':'#e8e0cc', W2=fl?'#fff':'#c8bca4';
    for(const sg of [1,-1]){ K.el(0.12,0.7*sg*fp,0.5,0.62*fp+0.1,OL,0.35*sg); K.el(0.12,0.7*sg*fp,0.43,0.54*fp+0.08,W1,0.35*sg);   // the forewings (beating)
      K.el(-0.4,0.48*sg*fp,0.36,0.4*fp+0.08,OL,-0.3*sg); K.el(-0.4,0.48*sg*fp,0.3,0.33*fp+0.06,W2,-0.3*sg); }                     // the hindwings
    if(fl) break;
    for(const sg of [1,-1]){ K.el(0.12,0.78*sg*fp,0.17,0.12*fp+0.08,'#3a2a1a'); K.el(0.12,0.78*sg*fp,0.1,0.06*fp+0.05,'#e0782c'); }   // the EYE-SPOTS
    K.el(0,0,0.62,0.17,'#5a4a36'); K.el(0.22,0,0.2,0.19,'#d8cfb8');                           // the body, a fuzzy thorax
    K.ln(0.4,0.08,0.75,0.3,0.06,'#8a7a5e'); K.ln(0.4,-0.08,0.75,-0.3,0.06,'#8a7a5e');         // feathered feelers
    if(drop){ pctx.fillStyle='#f0e68c'; for(let k=0;k<5;k++){ const q=Math.round(r*0.16)+1; pctx.fillRect(Math.round(sx+Math.cos(k*1.3+eit*4)*r*0.5),Math.round(sy-r*0.2+k*r*0.12),q,q); } }   // (dropping POLLEN: a trickle of gold dust under it)
    break; }
  case 'boulderback': {                                                   // a sandstone armadillo, moss in its seams — it TUCKS into a banded ball and rolls
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, ball=st==='windup'||st==='charge', roll=st==='charge', dz=st==='exposed', mv=!!en.mv&&!ball&&!dz, lp=mv?Math.sin(eit*10+en.sd)*0.12:0;
    const OL='#1a1610', SH=fl?'#fff':'#9a8e6c', SH2='#6e6448', BAND='#4a4232', MOSS='#6aa04a', SKIN='#d8b8a0', RIM='#e0d6b4';   // (G5 fix: weathered sandstone, a pale rim — no longer green on green · the moss stays its accent)
    if(ball){ const ph=roll?((eit*10)%1):0; K.el(0,0,0.98,0.98,OL); K.el(0,0,0.9,0.9,fl?'#fff':RIM); K.el(0,0,0.83,0.83,SH);
      if(fl) break;
      for(let k=0;k<4;k++){ const t=((k+ph)/4)*1.7-0.85, h=0.82*Math.sqrt(Math.max(0,1-t*t)); K.ln(t,-h,t,h,0.08,BAND); }   // the bands wheel as it rolls
      K.el(-0.35,0.35,0.12,0.1,MOSS); K.el(0.3,-0.4,0.1,0.08,MOSS); K.el(0.1,0.2,0.08,0.07,'#8ac05a');
      if(!roll) K.el(0.82,0,0.13,0.11,SKIN);                                                   // (tucking: its snout still peeks out)
      break; }
    if(!fl){ for(const L of [[0.5,0.72,1],[0.5,-0.72,-1],[-0.45,0.74,-1],[-0.45,-0.74,1]]) K.el(L[0]+lp*L[2],L[1],0.16,0.13,OL);   // stubby legs
      K.el(-1.0,0,0.2,0.14,OL); K.el(-1.0,0,0.14,0.09,SH2); }                                   // a tail stub
    K.el(0,0,1.02,0.84,OL); K.el(0,0,0.94,0.76,fl?'#fff':RIM); K.el(0,0,0.87,0.69,SH);   // (its shell's pale rim)
    if(fl) break;
    for(const x of [-0.5,-0.2,0.1,0.4]) K.ln(x,-0.66,x,0.66,0.07,BAND);                        // the plated bands
    K.el(-0.3,0.3,0.14,0.11,MOSS); K.el(0.2,-0.35,0.12,0.1,MOSS); K.el(-0.6,-0.2,0.1,0.08,'#8ac05a'); K.el(0.45,0.25,0.09,0.08,'#8ac05a');   // moss
    const hw=dz?Math.sin(eit*8)*0.15:0; K.el(0.95,hw,0.24,0.2,OL); K.el(0.95,hw,0.19,0.15,SKIN); K.dot(1.12,hw,Math.max(1.4,r*0.08),'#d88a8a');   // the head (wobbling when DIZZY), a pink snout
    K.dot(0.95,hw+0.1,1.4,'#1a1208'); K.dot(0.95,hw-0.1,1.4,'#1a1208');
    break; }
  case 'scorpion': {                                                      // a sand-gold scorpion — its tail curled over its back, arched forward to STING
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, sting=en.atk===ATK.scorpion[1]&&(st==='wind'||st==='act'), snap=!sting&&en.atk===ATK.scorpion[0]&&st==='wind', strike=sting&&st==='act', mv=!!en.mv&&!sting&&!snap, lp=mv?Math.sin(eit*16+en.sd)*0.1:0;
    const OL='#2a1c08', G=fl?'#fff':'#d8b060', G2='#a88040', VEN='#9be85a';
    if(!fl){ for(let k=0;k<4;k++){ const x=0.35-k*0.26, w=(k&1?lp:-lp); K.ln(x,0.3,x-0.15+w,0.9,0.07,OL); K.ln(x,-0.3,x-0.15-w,-0.9,0.07,OL); } }   // eight legs
    const op=snap?0.35:0.12;
    for(const sg of [1,-1]){ K.ln(0.45,0.25*sg,0.95,0.45*sg,0.16,OL); K.ln(0.45,0.25*sg,0.95,0.45*sg,0.08,G2); K.el(1.1,0.46*sg,0.32,0.22,OL,op*sg); K.el(1.1,0.46*sg,0.26,0.16,G,op*sg);   // the big PINCERS (gaping as it snaps)
      if(snap){ K.ln(1.3,0.46*sg,1.55,0.68*sg,0.1,G); K.ln(1.3,0.46*sg,1.55,0.34*sg,0.1,G); } }
    K.el(-0.35,0,0.5,0.42,OL); K.el(-0.35,0,0.43,0.35,G); K.el(0.2,0,0.5,0.45,OL); K.el(0.2,0,0.43,0.38,G);   // abdomen · head
    if(fl) break;
    for(const x of [-0.55,-0.35,-0.15]) K.ln(x,-0.3,x,0.3,0.05,G2); K.dot(0.52,0.1,1.4,'#1a0e04'); K.dot(0.52,-0.1,1.4,'#1a0e04');
    const T=sting ? (strike?[[-0.7,0],[-0.45,0.02],[-0.15,0.03],[0.2,0.02],[0.6,0],[1.05,0]]:[[-0.7,0],[-0.55,0.05],[-0.3,0.08],[0,0.08],[0.3,0.05],[0.55,0]])   // the TAIL: arched forward over its back to strike…
      : [[-0.72,0],[-1.0,0.08],[-1.2,0.3],[-1.1,0.55],[-0.85,0.62]];                                                                     // …or curled behind it
    for(let k=0;k<T.length-1;k++) K.ln(T[k][0],T[k][1],T[k+1][0],T[k+1][1],0.2,OL); for(let k=0;k<T.length-1;k++) K.ln(T[k][0],T[k][1],T[k+1][0],T[k+1][1],0.13,k%2?G:G2);
    const e=T[T.length-1]; K.el(e[0],e[1],0.15,0.15,OL); K.el(e[0],e[1],0.1,0.1,sting?VEN:'#6a4a20');       // the STINGER (venom-green, raised)
    break; }
  case 'bogtoad': {                                                       // a squat mud-brown toad with golden flanks & a yellow throat — it swells to lash its tongue
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, tongue=en.atk===ATK.bogtoad[0]&&st==='wind', slam=en.atk===ATK.bogtoad[1]&&st==='wind', hop=!tongue&&!slam&&(en.lift||0)>0.5, pul=0.08*Math.sin(eit*6+en.sd);
    const OL='#140f04', B=fl?'#fff':'#7e6a36', B2='#54441e', HI='#c8b040', Y='#ffe63a', sc=slam?1.12:1;   // (G5 fix: a muddy brown-olive back, a golden stripe & a bright throat — no longer a shrub on the grass)
    if(!fl){ const bx=hop?-1.05:-0.55, by=hop?0.55:0.8; for(const sg of [1,-1]){ K.el(bx,by*sg,0.36,0.24,OL); K.el(bx,by*sg,0.3,0.18,B2); K.el(bx+(hop?-0.25:0.3),(by+0.2)*sg,0.14,0.12,OL); }   // the big back legs (flung out mid-hop)
      for(const sg of [1,-1]) K.el(0.5,0.72*sg*sc,0.14,0.12,OL); }
    K.el(0,0,0.98*sc,0.91*sc,OL); K.el(0,0,0.87*sc,0.8*sc,B);
    if(fl) break;
    for(const sg of [1,-1]) K.el(0.1,0.62*sg*sc,0.5*sc,0.13*sc,'#e8d27a');   // (its pale flanks)
    K.el(-0.15,0,0.5,0.2,HI); for(let k=0;k<5;k++){ const a=(en.sd||0)*2+k*1.3; K.el(Math.cos(a)*0.45-0.1,Math.sin(a)*0.5,0.08,0.08,B2); }   // a pale stripe · warts
    const th=tongue?0.42+Math.abs(Math.sin(eit*14))*0.08:0.2+pul*0.5; K.el(0.75,0,th+0.05,th+0.05,OL); K.el(0.75,0,th,th,Y);   // the THROAT — swelling as it winds the tongue
    for(const sg of [1,-1]){ K.el(0.42,0.42*sg,0.2,0.2,OL); K.el(0.42,0.42*sg,0.16,0.16,'#ff9a2a'); K.dot(0.44,0.42*sg,Math.max(1.4,r*0.1),'#1a1208'); }   // bulging eyes (orange)
    break; }
  /* ---- (C8c §8.7) SIX MORE — the same kit; a painter reads only what its ePose code holds ---- */
  case 'termqueen': {                                                     // a bloated termite QUEEN on her clay MOUND — a pale ringed belly, a small dark head & mandibles toward you
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, cast=en.cast>0, sq=st==='wind', sa=st==='act', br=0.05*Math.sin(eit*7+en.sd), sh=cast?0.07*Math.sin(eit*55):0;
    const OL='#2a160a', CL=fl?'#fff':'#a8683a', CL2='#c88a54', CL3='#7a4424', HOLE='#24120a', BEL=fl?'#fff':'#e8d8b0', BEL2='#c4ae84', HD='#6a2a14';
    const E=(x,y,rx,ry,c)=>{ pctx.fillStyle=c; pctx.beginPath(); pctx.ellipse(sx+(x+sh)*r,sy+y*r,Math.max(0.9,rx*r),Math.max(0.9,ry*r),0,0,TAU); pctx.fill(); };   // (the mound in SCREEN space — its light stays top-left as she turns)
    for(let k=0;k<10;k++){ const a=k*0.628+0.3; E(Math.cos(a)*1.08,Math.sin(a)*0.9+0.1,0.3,0.26,OL); }   // THE MOUND: a lumpy heap of clay…
    E(0,0.1,1.24,1.02,OL);
    if(!fl){ E(0,0.12,1.16,0.94,CL3);
      for(let k=0;k<10;k++){ const a=k*0.628+0.3, lt=Math.cos(a+2.36); E(Math.cos(a)*1.08,Math.sin(a)*0.9+0.1,0.23,0.19,lt>0.35?CL2:lt>-0.4?CL:CL3); }   // (its bumpy rim, lit from the top-left)
      E(-0.04,0.0,0.98,0.8,CL); E(-0.22,-0.2,0.66,0.46,CL2);                                   // …its body & lit crown
      for(const h of [[0.82,0.3],[-0.8,0.36],[0.3,-0.62],[-0.46,-0.52],[0.52,0.66],[-0.22,0.72]]){ E(h[0],h[1],0.1,0.08,HOLE); if(cast) E(h[0],h[1]-0.03,0.06,0.05,'#e8c890'); }   // tunnel mouths (termites peek out as she births)
      E(-0.04,-0.02,0.7,0.56,'#6a3a1c'); E(-0.04,0.04,0.64,0.48,'#4a2612'); }                  // the NEST crater she sits in
    else E(0,0.1,1.16,0.94,'#fff');
    K.el(-0.26,0,0.64+br,0.5+br,OL); K.el(-0.26,0,0.57+br,0.43+br,BEL);                        // her swollen BELLY (it breathes)
    K.el(0.2,0,0.21,0.21,OL); K.el(0.42,0,0.25,0.31,OL);                                       // thorax · head
    if(fl) break;
    for(const x of [-0.66,-0.46,-0.26,-0.06]) K.ln(x,-0.4-br,x,0.4+br,0.05,BEL2);              // the belly's rings
    K.el(-0.36,-0.14,0.26,0.11,'#fff6dc');                                                    // (its sheen)
    K.el(0.2,0,0.15,0.15,'#8a4a24'); K.el(0.42,0,0.2,0.26,HD);
    for(const sg of [1,-1]){ K.ln(0.56,0.12*sg,0.8,(sa?0.12:0.05)*sg,0.08,'#140804'); K.dot(0.36,0.17*sg,Math.max(1.4,r*0.08),'#140804'); }   // mandibles (gaping as she spits) · eyes
    if(sq||sa){ K.el(0.72,0,sa?0.2:0.12+0.04*Math.sin(eit*30),sa?0.16:0.1,'#9be85a'); K.dot(0.74,0,Math.max(1.4,r*0.08),'#e8ffb0'); }   // ACID welling at her mouth
    break; }
  case 'termite': {                                                       // a pale TERMITE (her brood): a soft cream abdomen, a red-brown head & dark mandibles, six scuttling legs
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), lp=Math.sin(eit*22+en.sd)*0.18, OL='#1a0e06';
    if(!fl) for(const x of [0.2,-0.05,-0.3]){ K.ln(x,0.2,x-0.1+lp,0.72,0.1,OL); K.ln(x,-0.2,x-0.1-lp,-0.72,0.1,OL); }
    K.el(-0.42,0,0.52,0.4,OL); K.el(0.08,0,0.26,0.26,OL); K.el(0.5,0,0.32,0.32,OL);
    if(fl){ K.el(-0.42,0,0.44,0.32,'#fff'); K.el(0.5,0,0.25,0.25,'#fff'); break; }
    K.el(-0.42,0,0.44,0.32,'#e4cc9c'); K.el(-0.5,-0.1,0.2,0.1,'#fff0d0'); K.el(0.08,0,0.18,0.18,'#c89060'); K.el(0.5,0,0.25,0.25,'#8a3a1a');
    K.ln(0.72,0.12,0.98,0.03,0.1,OL); K.ln(0.72,-0.12,0.98,-0.03,0.1,OL);
    break; }
  case 'walrus': {                                                        // a tusked WALRUS: a huge blue-grey blubbery body, a whiskered muzzle, two long ivory TUSKS — it flops flat to BELLY-SLIDE
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, su=st==='windup', sl=st==='charge', pw=st==='paw', tw=st==='wind', ta=st==='act', mv=!!en.mv&&!su&&!sl&&!pw&&!tw&&!ta, lp=mv?Math.sin(eit*10+en.sd)*0.1:0;
    const OL='#141a1e', B=fl?'#fff':'#7e8a92', B2='#5e6a72', B3='#a8b4bc', MZ='#cdbca2', TK='#f6f0de', FL='#4a545a', L=sl?1.16:1, W=sl?0.7:0.8;
    if(!fl){ for(const sg of [1,-1]){ const up=pw && (((eit*8)|0)&1)===(sg>0?1:0), fx=sl?0.1:0.36, fy=(sl?0.66:0.84)*sg;   // front FLIPPERS (slapping as it paws · swept back as it slides)
        K.el(fx+lp*sg,fy,0.28,up?0.22:0.15,OL,0.5*sg); K.el(fx+lp*sg,fy,0.21,up?0.16:0.1,FL,0.5*sg); }
      for(const sg of [1,-1]){ K.el(-1.08*L,0.28*sg,0.32,0.15,OL,0.55*sg); K.el(-1.08*L,0.28*sg,0.25,0.09,FL,0.55*sg); } }   // the rear flippers, fanned
    K.el(0,0,1.05*L,W,OL); K.el(0,0,0.97*L,W-0.08,B);
    const hx=sl?1.02*L:tw?0.7:ta?1.02:su?1.0:0.9;                                              // the head: reared back to SLAM · thrust down in it · low & long as it slides
    K.el(hx,0,0.42,0.44,OL); K.el(hx,0,0.35,0.37,B);
    if(fl) break;
    K.el(0.05,-0.26,0.55*L,0.2,B3); K.el(-0.1,0.3,0.6*L,0.22,B2);                               // blubber light & shade
    for(const x of [-0.55,-0.25]) K.ln(x,-0.5,x+0.06,0.5,0.05,B2);                              // (its folds)
    K.el(hx+0.2,0,0.2,0.3,MZ); K.dot(hx+0.3,0.1,1.4,'#6a5a48'); K.dot(hx+0.3,-0.1,1.4,'#6a5a48'); K.dot(hx+0.24,0,1.4,'#6a5a48');   // the whiskered muzzle
    for(const sg of [1,-1]) K.dot(hx+0.02,0.21*sg,Math.max(1.4,r*0.07),'#10141a');
    const tl=tw?0.32:ta?0.95:sl?0.5:0.7;                                                         // the TUSKS: short as it rears (raised) · long, driven down in the slam
    for(const sg of [1,-1]){ K.ln(hx+0.26,0.13*sg,hx+0.26+tl,0.17*sg,0.12,OL); K.ln(hx+0.26,0.13*sg,hx+0.26+tl,0.17*sg,0.065,TK); }
    break; }
  case 'salamander': {                                                    // a sooty SALAMANDER: a long black lizard dotted with glowing embers, a curling tail — its throat BLAZES as it winds a glob
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, w=st==='wind', rc=st==='recover', bk=!!en._bk&&!w&&!rc, mv=!!en.mv&&!w&&!rc, g=mv?Math.sin(eit*16+en.sd)*0.2:0, tw=Math.sin(eit*4+en.sd)*0.25;
    const OL='#0a0604', B=fl?'#fff':'#2a2020', B2='#46342c', EM=bk?'#ffe070':'#ff6a2a', EM2=bk?'#fff6c0':'#ffb040';
    if(!fl){ for(const L of [[0.42,1],[-0.3,-1]]) for(const sg of [1,-1]){ const x=L[0], k=g*L[1]*sg; K.ln(x,0.18*sg,x+0.12+k,0.6*sg,0.13,OL); K.dot(x+0.12+k,0.62*sg,Math.max(1.4,r*0.12),OL); }   // four splayed legs
      const T=[[-0.7,0],[-1.05,0.1+tw*0.4],[-1.38,0.26+tw],[-1.62,0.16+tw*1.2]]; for(let k=0;k<3;k++) K.ln(T[k][0],T[k][1],T[k+1][0],T[k+1][1],0.24-k*0.06,OL);   // the curling tail
      for(let k=0;k<3;k++) K.ln(T[k][0],T[k][1],T[k+1][0],T[k+1][1],0.15-k*0.04,B); }
    K.el(0,0,0.86,0.35,OL); K.el(0,0,0.79,0.28,B); K.el(0.84,0,0.31,0.27,OL); K.el(0.84,0,0.25,0.21,B);
    if(fl) break;
    K.el(-0.1,-0.1,0.5,0.1,B2);                                                                  // (a sheen down its back)
    for(const p of [[-0.52,0.1],[-0.22,-0.12],[0.12,0.1],[0.42,-0.08],[-1.1,0.16+tw*0.7],[0.68,0.12]]) K.dot(p[0],p[1],Math.max(1.4,r*0.13),EM);   // EMBER spots (blazing gold as it basks)
    for(const p of [[-0.22,-0.12],[0.42,-0.08]]) K.dot(p[0],p[1],1.4,EM2);
    if(w){ const q=0.2+0.05*Math.sin(eit*30); K.el(0.72,0,q+0.04,q,'#ff8a2a'); K.el(0.72,0,q*0.6,q*0.6,'#fff0a0'); }   // the THROAT glows — a glob is coming
    else if(rc) K.dot(1.06,0,Math.max(1.4,r*0.14),'#ff6a2a');                                  // (a drip of lava at its lips)
    for(const sg of [1,-1]) K.dot(0.92,0.13*sg,1.4,'#ffb040');
    break; }
  case 'beetle': {                                                        // a PRISM BEETLE: a pale crystal-blue shell cut into rainbow facets, a clear prism HORN that gathers the beam
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, w=st==='wind', lk=w&&!!en.lk, a=st==='act', ex=st==='exposed', mv=!!en.mv&&!w&&!a&&!ex, lp=mv?Math.sin(eit*18+en.sd)*0.12:0;
    const OL='#0e1a22', SH=fl?'#fff':'#a8e0f0', SH2='#78b4cc', HD='#2a3a4a', F=['#ffc0ea','#fff2a8','#bfffe4','#ccd4ff'];
    if(!fl){ for(const x of [0.32,0,-0.3]){ K.ln(x,0.3,x-0.14+lp,1.0,0.07,OL); K.ln(x,-0.3,x-0.14-lp,-1.0,0.07,OL); }   // six legs
      if(ex) for(const sg of [1,-1]){ K.el(-0.42,0.72*sg,0.62,0.28,OL,0.4*sg); K.el(-0.42,0.72*sg,0.54,0.21,'#e4f6ff',0.4*sg); } }   // COOLING: its wings out, the shell cracked open
    K.el(-0.08,0,0.86,0.76,OL); K.el(-0.08,0,0.78,0.68,SH); K.el(0.72,0,0.26,0.31,OL);
    const hl=w||a?1.46:1.34; K.poly([[0.82,0.16],[hl+0.06,0],[0.82,-0.16]],OL);               // the prism HORN
    if(fl) break;
    K.poly([[-0.52,0.06],[-0.12,0.56],[0.2,0.1]],F[0]); K.poly([[-0.6,-0.06],[-0.2,-0.56],[0.16,-0.1]],F[1]);   // the rainbow FACETS
    K.poly([[0.24,0.1],[0.52,0.44],[0.6,0.06]],F[2]); K.poly([[0.24,-0.1],[0.52,-0.44],[0.6,-0.06]],F[3]); K.poly([[-0.82,0.1],[-0.6,0.48],[-0.46,0.1]],F[2]); K.poly([[-0.82,-0.1],[-0.6,-0.48],[-0.46,-0.1]],F[0]);
    if(ex){ K.ln(-0.84,0.05,0.6,0.08,0.05,SH2); K.ln(-0.84,-0.05,0.6,-0.08,0.05,SH2); } else K.ln(-0.84,0,0.6,0,0.05,SH2);   // the elytra's seam (parted while it cools)
    K.el(-0.26,-0.32,0.24,0.09,'#ffffff'); K.el(0.72,0,0.2,0.25,HD);
    const hc=a?'#ffffff':lk?'#f0ffff':w?'#c8f6ff':ex?'#6a8a96':'#d8fbff'; K.poly([[0.86,0.1],[hl-0.02,0],[0.86,-0.1]],hc);
    if(w||a) K.dot(hl-0.04,0,Math.max(1.6,r*(a?0.24:lk?0.19:0.12)),'#ffffff');               // (it gathers light — brighter once LOCKED)
    for(const sg of [1,-1]) K.dot(0.8,0.17*sg,1.4,'#0a1018');
    break; }
  case 'tmantis': {                                                       // a THICKET MANTIS: a slim jade insect, a triangle head, two rose SCYTHE arms — crossed on GUARD, flung wide to slash
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, C=en.atk===ATK.tmantis[2], g=st==='guard', w=st==='wind', ac=st==='act', rc=st==='recover', mv=!!en.mv&&!g&&!w&&!ac&&!rc, lp=mv?Math.sin(eit*14+en.sd)*0.12:0;
    const OL='#081008', B=fl?'#fff':'#3cbf94', B2='#1e6a50', B3=fl?'#fff':'#b8f4d8', BL=fl?'#fff':'#fff4dc';   // (G5 fix: an orchid-jade body, a pale belly, rose forearms, a heavy outline & red eyes — it no longer reads as a bamboo sprout)
    if(!fl){ K.ln(0.1,0.08,-0.08+lp,0.52,0.07,OL); K.ln(0.1,-0.08,-0.08-lp,-0.52,0.07,OL); K.ln(-0.22,0.08,-0.5-lp,0.5,0.07,OL); K.ln(-0.22,-0.08,-0.5+lp,-0.5,0.07,OL);
      K.ln(0.1,0.08,-0.08+lp,0.52,0.04,B2); K.ln(0.1,-0.08,-0.08-lp,-0.52,0.04,B2); K.ln(-0.22,0.08,-0.5-lp,0.5,0.04,B2); K.ln(-0.22,-0.08,-0.5+lp,-0.5,0.04,B2); }   // four short spindly legs
    K.el(-0.52,0,0.64,0.3,OL); K.el(0.18,0,0.4,0.17,OL); K.poly([[0.42,0.36],[1.0,0],[0.42,-0.36]],OL);   // a slim abdomen · the long thorax · a triangle head
    if(!fl){ K.el(-0.52,0,0.54,0.21,B); K.el(-0.5,0,0.38,0.08,'#f6ecc8'); K.el(-0.92,0,0.12,0.1,'#ff7a9a'); K.el(0.18,0,0.31,0.08,B); K.poly([[0.52,0.23],[0.86,0],[0.52,-0.23]],B3);   // (its cream belly-stripe & a rose tail-tip)
      for(const sg of [1,-1]){ K.el(0.54,0.23*sg,0.11,0.11,OL); K.el(0.54,0.23*sg,0.075,0.075,'#ff4030'); K.dot(0.56,0.23*sg,1.4,'#ffe0a0'); } }   // big RED eyes on the head's corners (a glint)
    const A=(sg,E,T)=>{ const s0=[0.32,0.1*sg]; K.ln(s0[0],s0[1],E[0],E[1],0.13,OL); K.ln(E[0],E[1],T[0],T[1],0.14,OL); K.ln(s0[0],s0[1],E[0],E[1],0.07,fl?'#fff':'#ff8aa8'); K.ln(E[0],E[1],T[0],T[1],0.075,BL); };   // a SCYTHE arm: a rose forearm → the pale blade
    const pc=g?1:w?(C?5:2):ac?(C?6:(en.sl>0?4:3)):rc?7:0;
    for(const sg of [1,-1]){
      if(pc===1) A(sg,[0.76,0.36*sg],[0.78,-0.32*sg]);                                        // GUARD: crossed in an X before its face
      else if(pc===2) A(sg,[0.42,0.66*sg],[0.08,0.96*sg]);                                   // winding the double slash: flung wide
      else if(pc===3) A(sg,sg>0?[0.96,0.26]:[0.42,-0.66],sg>0?[1.36,-0.08]:[0.08,-0.96]);     // the first cut (the right), the left still high
      else if(pc===4) A(sg,sg>0?[0.8,-0.08]:[0.96,-0.26],sg>0?[0.95,-0.42]:[1.36,0.08]);      // …the second (the left)
      else if(pc===5) A(sg,sg>0?[0.2,0.72]:[0.72,-0.34],sg>0?[-0.26,0.86]:[0.76,0.28]);       // the COUNTER cocked: one arm drawn far back
      else if(pc===6) A(sg,sg>0?[1.0,0.1]:[0.72,-0.34],sg>0?[1.2,-0.46]:[0.76,0.28]);        // …and swept across
      else if(pc===7) A(sg,[0.76,0.2*sg],[1.02,0.34*sg]);                                     // spent: arms low
      else A(sg,[0.92,0.22*sg],[0.7,0.36*sg]); }                                               // at rest: raised before its face, praying
    break; }
  case 'sporeling': {                                                     // a SPORELING: a squat purple toadstool on stubby feet — pale spots on its cap, a shy face under the brim · burst, its cap splits open
    const K=sgKit(sx,sy,r,fa,fcx,fcy,pxn,pyn), st=en.st, w=st==='wind', a=st==='act', sp=!!en.spB, mv=!!en.mv&&!w&&!a, lp=mv?Math.sin(eit*18+en.sd)*0.14:0, br=0.03*Math.sin(eit*5+en.sd);
    const OL='#1a0a26', C1=fl?'#fff':(sp?'#7a5a9a':'#9a6ad0'), C2='#b890e8', C3='#6a44a0', SP='#f4e6ff', ST='#ecdcc4', X=w?1.12:a?0.9:1, Y=w?0.9:a?1.08:1;   // (the cap squashes as it crouches, stretches as it hops)
    if(!fl){ for(const sg of [1,-1]){ K.el(-0.3+lp*sg,0.8*sg,0.22,0.18,OL); K.el(-0.3+lp*sg,0.8*sg,0.16,0.12,ST); }   // stubby feet
      K.el(0.92,0,0.28,0.34,OL); K.el(0.92,0,0.22,0.28,ST); K.dot(1.02,0.12,1.4,'#24102e'); K.dot(1.02,-0.12,1.4,'#24102e'); }   // its shy face under the brim
    K.el(-0.08,0,0.84*X+br,0.8*Y+br,OL); K.el(-0.08,0,0.76*X+br,0.72*Y+br,C1);
    if(fl) break;
    K.el(-0.2,-0.22,0.45*X,0.3*Y,C2); K.el(0.1,0.34,0.5*X,0.24*Y,C3);                              // the cap's light & its shadowed brim
    if(sp){ K.el(-0.08,0,0.36*X,0.3*Y,'#2e1440'); K.el(-0.08,0,0.22*X,0.18*Y,'#4a2a66'); for(const p of [[0.4,0.3],[-0.5,-0.3]]) K.el(p[0]*X,p[1]*Y,0.1,0.08,SP); }   // BURST: split open, spent
    else for(const p of [[-0.34,0.3],[0.22,-0.36],[-0.48,-0.24],[0.28,0.3],[-0.05,0.02],[0.5,-0.02]]) K.el(p[0]*X,p[1]*Y,0.12,0.1,SP);   // its pale SPOTS
    break; }
  }
}
/* ---- BAKED FOE LOOKS — every look a foe can wear (kind · size · 16 facings · pose · anim frame · hide pattern · flash · cast · rank · trait tint · swarm)
   is painted ONCE at the crawl's texel (1 sprite px = 1 buffer px = 1/islScale() world units), snapped to hard pixels, ringed in the SNES
   1-px dark outline (+ its rank's: elite gold · MAGIC blue · RARE bright gold, 2 px · a boss crimson; swarm fodder muted to a husk), cropped
   into its own small canvas, and from then on only blitted 1:1 at whole-texel spots — a crowd of 60 is 60 drawImage calls. LRU-capped;
   flushed per isle (biome tints) and whenever the texel changes (camView / pixRows sliders, the window). Smooth FX (charge lines, leap
   streaks, steam, telegraph rings) are NOT baked — eFxPre/eFxPost draw them over the scene each frame, where half-alpha survives. */
const ESC={m:new Map(), cap:2400, miss:0, fb:16, s:0};           // (fb: fresh bakes left this frame — past it, a foe borrows its kind's first frame, so a new crowd never stalls a frame · s: the texel scale the cache was baked at)
const ESC_T={boar:0,snake:1,crab:2,dingo:3,urchin:4,ooze:5,clam:6,reefspike:7,diver:8,sanddev:9,alpha:10,tidecaller:11,lamprey:12,siren:13,dummy:14,coco:15,kelpie:16,cinderfox:17,mshrimp:18,mothwing:19,boulderback:20,scorpion:21,bogtoad:22,termqueen:23,walrus:24,salamander:25,beetle:26,tmantis:27,sporeling:28,termite:29},ESC_VSD=[0.9,3.1,5.3], ESC_TB=[0.1,0.3,0.55,1], ESC_BT={};
const ESC_OL=[20,12,8,255,0], ESC_RK={elite:[196,140,52,255,1], magic:[90,156,255,255,1], rare:[255,224,84,255,1], rare2:[176,92,20,255,0], boss:[206,48,30,255,1]};   // outline rings [r,g,b,a, 8-connected?]: the dark SNES line · rank colours
const ESC_TT=[null,'rgba(255,120,40,.26)','rgba(150,210,255,.34)','rgba(120,120,130,.42)','rgba(120,220,60,.2)'];   // trait casts: Burning · Frost · Stoneskin · Venomous
function escFlush(){ ESC.m.clear(); ESC_ANY.clear(); CORPSE_LK.clear(); }
const CORPSE_LK=new Map();                                   // the fallen's looks (§2.4): on their backs, 35% darker, no outline — keyed by the look they were made from (a swarm skin: one shared) · LRU 160 (PT1 K3)
function escRim(){ const I=ISL; if(!I) return null; if(I._rim!==undefined) return I._rim; const c=!I.cave && TB[I.biome.key] && TB[I.biome.key].rim;   // the biome's light rim (dark floors only: TB[bk].rim)
  return I._rim = c ? {n:[c[0],c[1],c[2],c[3],0], f:[c[0],c[1],c[2],Math.round(c[3]*0.72),0]} : null; }
function eTint(en){ const k=en.tk; return !k?0:k.burning?1:k.frost?2:k.stone?3:k.venom?4:0; }
let EP_P=0, EP_N=1;                                          // (ePose's anim loop: period in s · frames)
function eAnim(P){ EP_P=P; EP_N=P>0?clamp(Math.round(P*10),4,8):1; }   // ~10 poses a second, like the old frame clock
function ePose(en,fl){ const st=en.st;                       // → the pose code: only what the painter reads (and the loop it animates on)
  switch(en.type){
  case 'boar': { const ch=st==='charge', wu=st==='windup'; eAnim(fl?0:ch?0.2618:en.mv?0.349:en.guard&&(st==='idle'||st==='roar'||st==='exhaust')?(st==='roar'?0.4:st==='exhaust'?1.2:1.0):0); return ch?1:wu?2:en.mv?3:0; }   // (the windup's steam is an FX now — no loop to bake · PX K7a: the Great Boar's breath, its ROAR & its SPENT heave animate its template)
  case 'snake': { const agit=!!en.aggro||Math.hypot(player.x-en.x,player.y-en.y)<240, tb=en.tmr<0.16?0:en.tmr<0.5?1:en.tmr<0.6?2:3, tg=((eit*1.8+en.y*0.05)%1)<0.35;
    eAnim(0.8976); return (agit?8:0)+tb*2+(tg?1:0); }
  case 'crab': { const lu=st==='lunge'; eAnim(fl?0:lu?0.3927:0.6981); return st==='windup'?1:st==='recover'?2:lu?3:0; }
  case 'dingo': { const cr=st==='crouch', po=st==='pounce'; eAnim(fl||cr?0:po?0.3142:en.mv?0.4833:1.0472); return cr?1:po?2:en.mv?3:0; }
  case 'urchin': { const sw=st==='swell'; eAnim(sw?0.1571:en.mv?0.6:0.8); return sw?1:0; }   // (PX E1: its sway & its trundle animate the template)
  case 'ooze': eAnim(1.2566); return en.scorch?1:0;
  case 'clam': eAnim(st==='open'?0.6:en.tmr<0.35?0.3:0); return st==='open'?1:en.tmr<0.35?2:0;   // (PX K1: the seam's flicker · the mantle breathing animate the template)
  case 'reefspike': eAnim(en.spk>0?0.2:en.mv?0.4:0); return en.spk>0?1:0;   // (PX K1: the bristle's shiver · its knuckle-walk)
  case 'diver': { const gr=st==='grounded'; eAnim(gr?0.8:st==='dive'?0.2:0.36); return gr?0:1+Math.round(clamp(en.alt==null?1:en.alt,0,1)*8); }   // (PX K3: the wingbeat on 4 even poses · the dive's streaks · the dazed loll)
  case 'sanddev': eAnim(fl?0:st==='rumble'?0.2:st==='erupt'?0.6:0.8); return st==='erupt'?1:st==='rumble'?2:0;   // (PX K6: the buried ripple · the rumble's shake · the erupted jaws animate the template — and the rumble is its own pose)
  case 'alpha': eAnim(fl?0:en.howl>0?1.0:en.mv?0.4833:1.0472); return en.howl>0?1:0;   // (PX E1: the HOWL's 2 frames · its walk on the dingo's loop · its idle's tail flick on the dingo's idle)
  case 'tidecaller': eAnim(en.cast>0?0.3:en.mv?0.8:1.0); return en.cast>0?1:0;   // (PX K2: the cast's pulse · its glide · the hem's sway animate the template — the Drowned's too)
  case 'lamprey': eAnim(en.mv?0.4:0.5236); return en.latched?1:0;   // (PX K2: its wave on 4 even poses)
  case 'siren': { const sg=en.song>0, sn=(player.snare||0)>0.05 && (player.x-en.x)*(player.x-en.x)+(player.y-en.y)*(player.y-en.y)<240*240; eAnim(sg?0.3:1.5708); return (sg?2:0)+(sn?1:0); }   // (PX K2: her SONG in the code — its notes pulse on their own clock)
  /* (C8a) the signatures — each painter reads only what its pose code holds */
  case 'coco': { const w=st==='wind', h=st==='hop', t=st==='recover', m=!!en.mv&&!w&&!h&&!t; eAnim(fl?0:m?0.4:w||h||t||st==='act'?0:1.0); return w?1:h?2:t?3:m?4:0; }   // (PX K3: its idle's tail swish animates the template)
  case 'kelpie': { const su=st==='windup', ch=st==='charge', ex=st==='exposed', m=!!en.mv&&!su&&!ch&&!ex; eAnim(fl?0:ch||su?0.25:ex?0.6:m?0.4:1.0); return su?1:ch?2:ex?3:m?4:0; }   // (PX K4: the winded heave · its trot on 4 even poses · the idle's kelp drift animate the template)
  case 'cinderfox': { const w=st==='wind', p=st==='pass', pa=st==='recover', m=!!en.mv&&!w&&!p&&!pa; eAnim(p?0.25:pa?0.4:m?0.35:fl||w||st==='act'?0:1.0); return w?1:p?2:pa?3:m?4:0; }   // (PX K3: its idle's brush flick animates the template)
  case 'mshrimp': { const w=st==='wind', a=st==='act', rc=st==='recover', m=!!en.mv&&!w&&!a&&!rc; eAnim(fl?0:w?0.2:rc?0.8:m?0.4:a?0:1.0); return w?1:a?2:rc?3:m?4:0; }   // (PX K5: the white-hot clubs' flicker · the slump · the stalks' twitch animate the template)
  case 'mothwing': eAnim(fl?0:0.3); return en.pf?1:0;
  case 'boulderback': { const su=st==='windup', ch=st==='charge', ex=st==='exposed', m=!!en.mv&&!su&&!ch&&!ex; eAnim(fl?0:ch?0.3:ex||m?0.8:su?0:1.2); return su?1:ch?2:ex?3:m?4:0; }   // (PX K4: the roll's 4 rings · the dizzy loll & its walk on 8 even poses · the idle's ear twitch)
  case 'scorpion': { const sg=en.atk===ATK.scorpion[1]&&(st==='wind'||st==='act'), sn=!sg&&en.atk===ATK.scorpion[0]&&st==='wind', m=!!en.mv&&!sg&&!sn; eAnim(fl?0:m?0.4:sg||sn||st==='act'?0:1.0); return sg?(st==='act'?3:2):sn?1:m?4:0; }   // (PX K5: the stinger's sway animates the template — the strikes still)
  case 'bogtoad': { const tw=en.atk===ATK.bogtoad[0]&&st==='wind', sw=en.atk===ATK.bogtoad[1]&&st==='wind', h=!tw&&!sw&&(en.lift||0)>0.5; eAnim(fl?0:tw?0.2:(!sw&&!h)?1.0:0); return tw?1:sw?2:h?3:0; }   // (PX K6: the balloon's flicker on even poses — ≤ 10 a second)
  /* (C8c) six more */
  case 'termqueen': { const c=en.cast>0, w=st==='wind', a=st==='act'; eAnim(fl?0:c?0.2:0.9); return (c?4:0)+(w?1:a?2:0); }   // (her belly breathes · the mound shakes as she births)
  case 'termite': eAnim(fl?0:0.3); return 0;
  case 'walrus': { const su=st==='windup', ch=st==='charge', pw=st==='paw', tw=st==='wind', ta=st==='act', m=!!en.mv&&!su&&!ch&&!pw&&!tw&&!ta; eAnim(fl?0:pw?0.25:ch?0.3:m?0.8:su||tw||ta||st==='recover'?0:1.2); return su?1:ch?2:pw?3:tw?4:ta?5:m?6:0; }   // (PX K4: the slide's spray · its lollop on 8 even poses · the idle's breath; the one-frame poses still)
  case 'salamander': { const w=st==='wind', rc=st==='recover', b=en._bk=salIn(en), m=!!en.mv&&!w; eAnim(fl?0:w?0.2:m?0.4:rc?0:0.8); return w?1:rc?2:(b?4:0)+(m?1:0)+(!w&&!rc?8:0); }   // (en._bk: basking — the painter & the template's gold embers read it off the pose · PX K6: the throat's flicker · the wiggle on 4 even poses)
  case 'beetle': { const w=st==='wind', a=st==='act', ex=st==='exposed', m=!!en.mv&&!w&&!a&&!ex; eAnim(fl?0:w?0.2:ex?0.6:m?0.4:a?0:1.0); return w?(en.lk?2:1):a?3:ex?4:m?5:0; }   // (PX K5: the horn's gather & lock pulse · the cooling smoke · its walk on 4 even poses · the idle bob)
  case 'tmantis': { const g=st==='guard', C=en.atk===ATK.tmantis[2], w=st==='wind', a=st==='act', rc=st==='recover', m=!!en.mv&&!g&&!w&&!a&&!rc; eAnim(fl?0:g?0.2:m?0.4:w||a||rc?0:1.0); return g?1:w?(C?5:2):a?(C?6:(en.sl>0?4:3)):rc?7:m?8:0; }   // (PX K5: the guard's glint · the praying sway animate the template)
  case 'sporeling': { const w=st==='wind', a=st==='act', m=!!en.mv&&!w&&!a; eAnim(fl?0:m?0.35:1.2); return (en.spB?8:0)+(w?1:a?2:m?3:0); }
  }
  eAnim(0); return 0; }
const ESC_ANY=new Map();                                     // (per kind · size · rank: a look to borrow while this frame's bakes are spent)
function escFit(){ const s=islScale(); if(s!==ESC.s){ ESC.s=s; ESC.m.clear(); ESC_ANY.clear(); CORPSE_LK.clear(); esprFit(s); } return s; }   // a new texel → every look re-bakes
function eSprite(en,fa,fl){                                  // → {cv, ox,oy (crop origin from the body's centre, in texels), w,h}
  const s=escFit(), pose=ePose(en,fl), P=EP_P, N0=EP_N, sd=en.sd||0, bt=en.guard&&en.boss&&en.boss!=='greatboar' ? (ESC_BT[en.boss]||(ESC_BT[en.boss]=2+Object.keys(ESC_BT).length)) : en.clone?1:0, K=spr2Pick(en,fa,pose,en.r*s);   // (PX1 FIX PX1VC-13: N0 read beside P, before spr2Pick — a T.sel / T.lift calling ePose can't change it)
  let N=N0, fi=((Math.round(fa/(TAU/16))%16)+16)%16, v=en.fodder?0:Math.min(2,Math.floor(((sd%TAU)+TAU)%TAU/TAU*3)), f=N>1 ? (Math.floor(itime/P*N)+Math.floor(((sd*7.31)%1+1)%1*N))%N : 0;   // each foe runs the loop from its own phase (no lockstep herds)
  if(K){ fi=K.vi; v=0; f=K.n>1?K.u[Math.floor(f*K.n/N)%K.n]:0; N=K.n; }   // (PX A1) a templated foe: its view's one facing, no hide pattern, its frame of the chosen name's n (repeats folded)
  const head=((((ESC_T[en.type]||0)*128+Math.min(127,Math.round(en.r*2)))*16+fi)*32+(K?K.pk:pose))*32, tail=((((((fl?1:0)*4+(en.elite?1:0)+(en.guard?2:0))*16+bt)*4+(en.rar||0))*2+(en.drowned?1:0))*8+eTint(en))*2+(en.fodder?1:0), ix=K?K.idx:0;   // (a number, no string per foe per frame · PX A1: a template keys on its pose code pk, not ePose's — and on its frame name ix)
  let key=((head+f*4+v)*16+ix)*16384+tail, C=ESC.m.get(key);
  if(C){ if(ESC.m.size>ESC.cap*0.7){ ESC.m.delete(key); ESC.m.set(key,C); } return C; }   // (a look in use moves to the back of the line — the LRU evicts the stale ones)
  const ak=((ESC_T[en.type]||0)*128+Math.min(127,Math.round(en.r*2)))*64+(en.rar||0)*8+(en.guard?4:0)+(en.elite?2:0)+(en.fodder?1:0);
  if(ESC.fb<=0){ C=ESC.m.get((head*16+ix)*16384+tail); if(C) return C; C=en._C; if(C && C.s===s) return C; C=ESC_ANY.get(ak); return C||PIX_NONE; }   // (over this frame's bake budget: its first frame — the same key scheme, f & v 0 · its last look · any look of its kind — a bake waits for the next frame)
  ESC.miss++; ESC.fb--; C=eBake(en,fa,fl,f,v,P,N,s,K); if(C!==PIX_NONE){ C.s=s; if(!fl) ESC_ANY.set(ak,C); }
  if(ESC.m.size>=ESC.cap){ let n=0; for(const k of ESC.m.keys()){ ESC.m.delete(k); if(++n>=240) break; } }   // (the least-recently-seen looks go first)
  ESC.m.set(key,C); return C; }
/* the pixel pass for a look painted on a board (ec; read back only the SZ² square at (X0,Y0) round the body's centre c): soft edges snap
   to hard texels · (swarm: muted toward grey) · each ring in `rings` wraps the silhouette one texel further out · crop → {cv,ox,oy,w,h}
   (ox/oy from the centre) */
function pixBake(ec,SZ,c,rings,mute,X0,Y0){ X0=X0||0; Y0=Y0||0;
  const id=ec.getImageData(X0,Y0,SZ,SZ), da=id.data, n=SZ*SZ; let M=pixBake.M; if(!M||M.length<n) M=pixBake.M=new Uint8Array(n); M.fill(0,0,n);
  let x0=SZ,y0=SZ,x1=-1,y1=-1;
  for(let i=0,p=0;i<n;i++,p+=4){ if(da[p+3]<110){ da[p+3]=0; continue; } da[p+3]=255; M[i]=1;
    if(mute>0){ const r=da[p],g=da[p+1],b=da[p+2], L=0.3*r+0.59*g+0.11*b, k=1-mute*0.18; da[p]=(r+(L-r)*mute)*k; da[p+1]=(g+(L-g)*mute)*k; da[p+2]=(b+(L-b)*mute)*k; }
    const x=i%SZ, y=(i/SZ)|0; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  if(x1<0) return null;
  let lv=1;
  for(const R of rings){ lv++; x0=Math.max(1,x0-1); y0=Math.max(1,y0-1); x1=Math.min(SZ-2,x1+1); y1=Math.min(SZ-2,y1+1);
    for(let y=y0;y<=y1;y++) for(let x=x0,i=y*SZ+x0;x<=x1;x++,i++){ if(M[i]) continue;
      let q=M[i-1], h=(q&&q<lv)||((q=M[i+1])&&q<lv)||((q=M[i-SZ])&&q<lv)||((q=M[i+SZ])&&q<lv);
      if(!h && R[4]) h=((q=M[i-SZ-1])&&q<lv)||((q=M[i-SZ+1])&&q<lv)||((q=M[i+SZ-1])&&q<lv)||((q=M[i+SZ+1])&&q<lv);
      if(h){ M[i]=lv; const p=i*4; da[p]=R[0]; da[p+1]=R[1]; da[p+2]=R[2]; da[p+3]=R[3]; } } }
  const w=x1-x0+1, h=y1-y0+1, cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  cv.getContext('2d').putImageData(id,-x0,-y0,x0,y0,w,h);
  const px=new Uint8ClampedArray(w*h*4); for(let y=0;y<h;y++) px.set(da.subarray(((y+y0)*SZ+x0)*4,((y+y0)*SZ+x1+1)*4),y*w*4);   // (PT1 K3: its pixels kept — a corpse's dark look & a dissolve read these, never the canvas back mid-frame: ~15 ms a stall)
  return {cv, ox:x0+X0-c, oy:y0+Y0-c, w, h, px}; }
const PIX_NONE={cv:document.createElement('canvas'), ox:0, oy:0, w:1, h:1};
