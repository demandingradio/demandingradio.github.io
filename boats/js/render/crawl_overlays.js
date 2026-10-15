"use strict";
/* FILE: js/render/crawl_overlays.js
THE CRAWL OVERLAYS and THE EXPLORER SPRITE: original lines 24891-25327 (build 5109cd5), moved verbatim, in place directly after
  drawIslandWorld (ends at original line 24890, still inline); THE LIGHT LAYER follows at original line 25328 (build 5109cd5).
Four parts: THE FINISHERS' FLOURISH and THE GEMS' FX (STY_PAL, drawFinFx, drawGemFx, drawGemProj, drawGemTells); the crawl's
  tells and overlays (IEVIS; the hero rim heroRim, RIMB, rimBoard, rimOf; the DEV tokens overlay drawTokDbg and TOKDBG; youRing;
  islTells, every foe attack telegraph; islBang, islHpBars, drawStagger); the explorer sprite (paintExplorer, the pose contract
  W_REST and wPose, the weapon layer WSPR, wLook, offLook, wLen, wSpr, psCrop, WPC, wPaint, oPaint, and drawExplorerSprite); and
  the crawl's pixel explorer (PSPR, PSPR_R, XR4, plBody, plWarm, plFaceA, drawExplorerPix).
Entry points: drawIslandWorld calls drawGemProj, islTells, islBang, islHpBars, drawFinFx (with STY_PAL), drawGemFx,
  drawExplorerSprite, youRing, heroRim and drawTokDbg; drawInterior and drawPortWorld call drawExplorerSprite, which hands the
  crawl to drawExplorerPix; drawPropOver calls rimOf; islandHUD reads TOKDBG; drawPropOver, grassYou and heroRim read PSPR's
  last-drawn look; buildIslandTune clears PSPR.m.
Globals it owns: the consts STY_PAL, IEVIS, RIMB, TOKDBG, W_REST, WSPR, WPC, PSPR, PSPR_R and XR4, and the functions named above.
Main globals it reads from elsewhere (inside functions, at runtime only): ISL, ITUNE, player, enemies, ifx, iprop, itrap, iproj,
  izone, itime, pctx, clamp, env, stats, wpnOf, reachMul, EQ, IB, thornsUp, STOMP_R, islPixOn, islScale, iwp (earlier inline
  code); ATK, BOSS_ATK, MOTH_LIFT, WEAPON (js/data/crawl2.js); PIX_NONE, pixBake, escFlush (js/render/foe_sprites.js); SPR2,
  spr2Tpl, spr2Top, spr2Player (js/render/spr2_core.js); pxLine (js/render/spr2_templates.js); PS, cI (js/render/pixkit.js);
  pxEll, pxRingE, pxSect, arrowSpr, ELEM_PAL, shadowSprC, islShd, creamOf (js/render/crawl_fx.js); declared later: LGT, pxiCv,
  lvlSpdMul, GFX and ART (js/render/style_pass.js).
Load-time statements: original line 25164 (build 5109cd5), WSPR, a literal with a new Map(); 25249 (PSPR, creates its canvas)
  and 25250 (PSPR.ctx=getContext), together and in that order, needing only the DOM; the rest are literal consts and functions.
*/
/* (PT1 K2) THE FINISHERS' FLOURISH — whole texels: a gold cone's SHOCK ARC (R+2…R+3, rolling out to R+10, gone in 0.2 s) · the lunge's 3 pale STREAKS
   (one every 0.03 s, each fading) · EARTHSPLITTER's FISSURE (a dark crack, its orange glow the first 0.15 s) */
const STY_PAL={w:['#dfe8f6','#f2f6ff','#ffffff','#141a28'], c:['#a8cdf0','#bcdeff','#f0f8ff','#0e1a2a'], k:['#e8c8a0','#ffe0b8','#fff8e8','#2a1a0a'], h:['#c8a878','#e0c898','#fff3d8','#2a1a0a'], g:['#ffc450','#ffe39a','#fff8dc','#46220a']};   // the smear palettes (faint · arc · edge · rim): w white · c cool · k warm · h haft · g gold
function drawFinFx(s){ for(const f of ifx){ const k=f.k; if(k!=='shock' && k!=='lunge' && k!=='fissure') continue; const p=clamp(f.t/f.life,0,1);
    if(k==='shock'){ const [sx,sy]=iwp(player.x,player.y), Rr=Math.round(f.R*s)+Math.round((2+8*p)*s); pctx.fillStyle='#46220a'; pctx.globalAlpha=0.45*(1-p); pxSect(pctx,sx,sy,Rr+2,Rr+2,f.a,f.h);
      pctx.fillStyle='#fff3c0'; pctx.globalAlpha=1-p; pxSect(pctx,sx,sy,Rr,Rr+1,f.a,f.h); }
    else if(k==='lunge'){ const [sx,sy]=iwp(player.x,player.y), c=Math.cos(f.a), si=Math.sin(f.a), L=f.L*s, r0=player.r*s;
      for(let j=0;j<3;j++){ const q=(f.t-0.03*j)/0.09; if(q<0||q>1) continue; const o=(j-1)*f.W*s/3; pctx.fillStyle=j===1?'#fff8dc':'#e8eef4'; pctx.globalAlpha=0.9*(1-q);
        pxLine(sx+c*r0*(1+q)-si*o, sy+si*r0*(1+q)+c*o, sx+c*L-si*o, sy+si*L+c*o); } }
    else { const P=f.pts, g=p<0.33?1-p/0.33:0;                                                      // the fissure: its glow first, the crack lingers
      if(g>0){ pctx.fillStyle='#ff9a3c'; pctx.globalAlpha=0.85*g; for(let j=1;j<P.length;j++){ const [x0,y0]=iwp(P[j-1][0],P[j-1][1]), [x1,y1]=iwp(P[j][0],P[j][1]); pxLine(x0,y0-1,x1,y1-1); pxLine(x0,y0+1,x1,y1+1); } }
      pctx.fillStyle='#1a0e04'; pctx.globalAlpha=Math.min(1,1.6*(1-p)); for(let j=1;j<P.length;j++){ const [x0,y0]=iwp(P[j-1][0],P[j-1][1]), [x1,y1]=iwp(P[j][0],P[j][1]); pxLine(x0,y0,x1,y1); } } }
  pctx.globalAlpha=1; }
/* (C5b) THE GEMS' FX — whole texels, no allocation: a RING (a nova, a roar, a ward, a dance step) · a ZAP (lightning: a jittered polyline) · a coral SPIKE ·
   a falling BARB · the kraken's TENTACLES · a BOOM (the broadside lands) · Riposte's GUARD (a gold arc before you) — the tells (the broadside's telegraph,
   the ground reticle) are drawn by drawGemTells, post-mask at night */
function drawGemFx(s){ for(const f of ifx){ if(f.k!=='gfx') continue; const p=clamp(f.t/f.life,0,1), g=f.g;
    if(g==='ring'){ const [x,y]=iwp(f.x,f.y), R=Math.max(1,Math.round(f.R*s*(0.3+0.7*Math.sqrt(p)))); pctx.fillStyle='#04070e'; pctx.globalAlpha=0.4*(1-p); pxRingE(pctx,x,y,R+1,R+1,1);
      pctx.fillStyle=f.c; pctx.globalAlpha=0.9*(1-p); pxRingE(pctx,x,y,R,R,Math.max(1,Math.round((f.w||1)*s*(1-p*0.5)))); if(p<0.25){ pctx.globalAlpha=0.18*(1-p); pxEll(pctx,x,y,R-1,R-1); } }
    else if(g==='zap'){ const P=f.pts, fl=((itime*40)|0)&1; pctx.fillStyle=fl?'#ffffff':f.c; pctx.globalAlpha=(1-p)*(fl?0.9:1);
      for(let j=1;j<P.length;j++){ const [x0,y0]=iwp(P[j-1][0],P[j-1][1]), [x1,y1]=iwp(P[j][0],P[j][1]), dx=x1-x0, dy=y1-y0, L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L; let px=x0, py=y0;
        for(let q=1;q<=4;q++){ const t=q/4, o=q<4?((((j*7+q*13+((itime*30)|0))%5)-2)*1.5):0, qx=x0+dx*t+nx*o, qy=y0+dy*t+ny*o; pxLine(px,py,qx,qy); px=qx; py=qy; } } }
    else if(g==='spike'){ const [x,y]=iwp(f.x,f.y), h=Math.round(12*s*(p<0.2?p/0.2:1)), a=p>0.6?(1-p)/0.4:1; pctx.globalAlpha=a;
      for(let r=0;r<h;r++){ const w=Math.max(0,Math.round((1-r/Math.max(1,h))*3*s)); pctx.fillStyle=r<2?'#fff0ec':r<h*0.5?'#ff9a7a':'#c8403a'; pctx.fillRect(x-w,y-r,2*w+1,1); } }
    else if(g==='barb'){ const [x,y]=iwp(f.x,f.y), dy=Math.round((1-p)*28*s); pctx.globalAlpha=1; pctx.fillStyle='#e8e0c8'; pctx.fillRect(x,y-dy-Math.round(6*s),1,Math.round(6*s)); pctx.fillStyle='#ffd23f'; pctx.fillRect(x,y-dy,1,1);
      if(p>0.85){ pctx.fillStyle='#d8c8a0'; pctx.globalAlpha=0.7; pxRingE(pctx,x,y,Math.round(3*s),Math.round(2*s),1); } }
    else if(g==='tent'){ const [x,y]=iwp(f.x,f.y), up=p<0.3?p/0.3:p>0.7?(1-p)/0.3:1;
      for(let j=0;j<6;j++){ const a=j/6*TAU+(f.x*0.013), rr=f.R*s*(0.3+0.4*((j*37)%10)/10), tx=Math.round(x+Math.cos(a)*rr), ty=Math.round(y+Math.sin(a)*rr*0.8), h=Math.round(14*s*up);
        for(let r=0;r<h;r++){ const sw=Math.round(Math.sin(r*0.5+itime*8+j)*1.2); pctx.fillStyle=r<h-2?(r&1?'#1e6a5e':'#2a8a7a'):'#9fe8d8'; pctx.globalAlpha=0.95; pctx.fillRect(tx+sw,ty-r,Math.max(1,Math.round(2*s*(1-r/(h+1)))),1); } } }
    else if(g==='boom'){ const [x,y]=iwp(f.x,f.y), R=Math.round(f.R*s*(0.5+0.5*Math.sqrt(p))); pctx.fillStyle=p<0.3?'#fff0c0':'#ff8a3c'; pctx.globalAlpha=0.5*(1-p); pxEll(pctx,x,y,R,Math.round(R*0.8));
      pctx.fillStyle='#ffd23f'; pctx.globalAlpha=0.9*(1-p); pxRingE(pctx,x,y,R,Math.round(R*0.8),Math.max(1,Math.round(2*s))); }
    else if(g==='breach'){ const [x,y]=iwp(f.x,f.y), up=Math.sin(p*Math.PI), h=Math.round(24*s*up), w=Math.max(3,Math.round(f.R*0.3*s));   // (C6b Leviathan's Tooth) a whale BREACHES up through the broken foe and falls back
      const hy=Math.max(2,Math.round(w*0.45)), sol=f.t<0.06;                                    // (G4 fix: solid only for its first 60 ms — then a see-through body inside a bright rim, so the boss's tells show through)
      pctx.globalAlpha=sol?0.9:0.35*(1-p*0.4); pctx.fillStyle='#e8f6ff'; pxEll(pctx,x,y-h,w,hy); pctx.fillStyle='#8fd8ff'; pxEll(pctx,x,y-h+Math.round(w*0.3),Math.max(2,w-2),Math.max(1,Math.round(w*0.18)));
      if(!sol){ pctx.globalAlpha=0.55*(1-p*0.5); pctx.fillStyle='#04070e'; pxRingE(pctx,x,y-h,w+1,hy+1,1); pctx.globalAlpha=0.9*(1-p*0.5); pctx.fillStyle='#e8f6ff'; pxRingE(pctx,x,y-h,w,hy,1); }
      pctx.globalAlpha=sol?0.9:0.6; pctx.fillStyle='#04070e'; pctx.fillRect(x+Math.round(w*0.55),y-h-1,1,1); }
    else if(g==='guard'){ const [x,y]=iwp(player.x,player.y), fl=((itime*20)|0)&1; pctx.fillStyle=fl?'#fff3c0':'#ffd23f'; pctx.globalAlpha=0.9-0.4*p; pxSect(pctx,x,y,Math.round(10*s),Math.round(12*s),Math.atan2(player.fy,player.fx),1.1); }
    pctx.globalAlpha=1; } }
/* your gem projectiles: an ANCHOR on its spectral chain · a HARPOON on its rope · a KNIFE · a water CRESCENT · a STORM arrow crackling */
function drawGemProj(pr,sx,sy,s){ const L2=Math.hypot(pr.vx,pr.vy)||1, ux=pr.vx/L2, uy=pr.vy/L2, k=pr.gk;
  if(k==='anchor'){ const [px,py]=iwp(player.x,player.y), dx=sx-px, dy=sy-py, D=Math.hypot(dx,dy)||1, n=Math.max(1,Math.round(D/3)), nx=-dy/D, ny=dx/D, n2=Math.min(n,6);   // (G3 fix) the spectral CHAIN back to your hand — a link every 3 texels in two tones, doubled for its last 18 (it tapers to the flukes)
    pctx.imageSmoothingEnabled=false; pctx.globalAlpha=0.9;                                                    // (colour by colour: a handful of state changes, not one per link)
    pctx.fillStyle='#9ff0ff'; for(let j=1;j<n;j+=2) pctx.fillRect(Math.round(px+dx*j/n),Math.round(py+dy*j/n),1,1);
    pctx.fillStyle='#2a8a9a'; for(let j=2;j<n;j+=2) pctx.fillRect(Math.round(px+dx*j/n),Math.round(py+dy*j/n),1,1);
    pctx.fillStyle='#0a3a4c'; for(let j=n-n2;j<n;j++) if(j>0) pctx.fillRect(Math.round(px+dx*j/n+nx),Math.round(py+dy*j/n+ny),1,1);
    pctx.globalAlpha=1; const c=pxiCv('g07'), w=c.width*2, h=c.height*2; pctx.drawImage(c,Math.round(sx-w/2),Math.round(sy-h/2),w,h); return; }   // …and the ANCHOR at 2× — it reads across a crowd
  if(k==='harpoon'){ const [px,py]=iwp(player.x,player.y), n=Math.max(1,Math.round(Math.hypot(sx-px,sy-py)/3)); pctx.fillStyle='#d8c8a0'; pctx.globalAlpha=0.8;   // the rope back to you
    for(let j=1;j<n;j++) pctx.fillRect(Math.round(px+(sx-px)*j/n),Math.round(py+(sy-py)*j/n),1,1); pctx.globalAlpha=1;
    { pctx.fillStyle='#6a4a28'; for(let j=1;j<=Math.round(8*s);j++) pctx.fillRect(Math.round(sx-ux*j),Math.round(sy-uy*j),1,1); pctx.fillStyle='#e8f0f4'; pctx.fillRect(sx,sy,1,1); pctx.fillRect(Math.round(sx-ux),Math.round(sy-uy),1,1); pctx.fillRect(Math.round(sx-ux*2-uy*1.5),Math.round(sy-uy*2+ux*1.5),1,1); pctx.fillRect(Math.round(sx-ux*2+uy*1.5),Math.round(sy-uy*2-ux*1.5),1,1); } return; }
  if(k==='knife'){ pctx.fillStyle='#eef4fb'; for(let j=0;j<=Math.round(4*s);j++) pctx.fillRect(Math.round(sx-ux*j),Math.round(sy-uy*j),1,1); pctx.fillStyle='#e8483a'; pctx.fillRect(Math.round(sx-ux*(4*s+1)),Math.round(sy-uy*(4*s+1)),1,1); return; }
  if(k==='wave'){ const w=Math.max(4,Math.round((pr.hr||12)*1.2*s)), fl=((itime*16)|0)&1;          // (C6b) a WAVE: a curling wall of water across its path — a white crest, sea-teal below, a dark lip, foam behind
    for(let j=-w;j<=w;j++){ const b=Math.abs(j)/w, o=Math.round(b*b*4*s), px=Math.round(sx-uy*j-ux*o), py=Math.round(sy+ux*j-uy*o), bx=px-Math.round(ux*2), by=py-Math.round(uy*2);
      pctx.fillStyle='#04070e'; pctx.fillRect(bx-Math.round(ux),by-Math.round(uy)+1,1,1); pctx.fillStyle='#2a8a9a'; pctx.fillRect(bx,by,1,1); pctx.fillStyle='#5fd8e8'; pctx.fillRect(px-Math.round(ux),py-Math.round(uy),1,1);
      pctx.fillStyle=(b<0.7||fl)?'#e8fffc':'#9ff0ff'; pctx.fillRect(px,py,1,1); if(((j+((itime*20)|0))&3)===0){ pctx.fillStyle='#e8fffc'; pctx.fillRect(bx-Math.round(ux*3),by-Math.round(uy*3),1,1); } } return; }
  if(k==='whale'){ const L=Math.max(6,Math.round(15*s)), H=Math.max(2,Math.round(5*s)), nx=-uy, ny=ux;   // (C6b) the WHITE's spirit: a pale whale surging on (body across its path, a fluke behind, a dark eye) — spray in its wake
    pctx.globalAlpha=0.9;
    for(let j=-L;j<=L;j++){ const t=(j+L)/(2*L), hh=Math.round(H*Math.sin(Math.PI*Math.min(1,0.12+t*0.95))); if(hh<1) continue;
      for(let q=-hh;q<=hh;q++){ const e=q>=hh-1||q<=-hh+1; pctx.fillStyle=q>=hh-1?'#8fb8d8':(q<=-hh+1&&t>0.3)?'#ffffff':'#e8f6ff'; pctx.fillRect(Math.round(sx+ux*j+nx*q),Math.round(sy+uy*j+ny*q),e?1:2,e?1:2); } }   // (the body's inner texels 2×2 — no gaps on a slant)
    pctx.fillStyle='#bfe6ff'; for(const q of [-1,1]) for(let f=1;f<=Math.round(3*s)+1;f++) pctx.fillRect(Math.round(sx-ux*(L+f)+nx*q*f),Math.round(sy-uy*(L+f)+ny*q*f),1,1);   // (the fluke)
    pctx.fillStyle='#04070e'; pctx.fillRect(Math.round(sx+ux*L*0.62+nx*(H*0.4)),Math.round(sy+uy*L*0.62+ny*(H*0.4)),1,1);
    pctx.fillStyle='#8fd8ff'; for(let f=0;f<3;f++) pctx.fillRect(Math.round(sx-ux*(L+5+f*3)+Math.sin(itime*17+f)*3),Math.round(sy-uy*(L+5+f*3)+Math.cos(itime*13+f)*2),1,1);   // (spray)
    pctx.globalAlpha=1; return; }
  if(k==='crescent'){ const w=Math.round(4*s); for(let j=-w;j<=w;j++){ const b=Math.abs(j)/Math.max(1,w), o=Math.round(b*b*2*s); pctx.fillStyle=Math.abs(j)<w*0.4?'#e8fffc':'#5fd8e8'; pctx.fillRect(Math.round(sx-uy*j-ux*o),Math.round(sy+ux*j-uy*o),1,1); } return; }
  const a=Math.atan2(pr.vy,pr.vx), di=((Math.round(a/(TAU/32))%32)+32)%32, o=arrowSpr(di,true); pctx.drawImage(o.cv,sx-o.ax,sy-o.ay);   // (a storm arrow — a gold shaft & its crackle)
  if(((itime*30)|0)&1){ pctx.fillStyle='#ffe55a'; pctx.fillRect(sx+((itime*97|0)%5)-2,sy+((itime*61|0)%5)-2,1,1); } }
/* the gems' TELLS (post-mask at night): Broadside's 0.8 s ground telegraph (a ring closing on its spot) · the ground-target reticle (0.15 s) */
function drawGemTells(s){ for(const f of ifx){ if(f.k!=='gfx' || f.g!=='tele') continue; const [x,y]=iwp(f.x,f.y), p=clamp(f.t/f.life,0,1), R=Math.round(f.R*s), r=Math.max(1,Math.round(R*(1-p)));
    pctx.fillStyle='#ff5d2a'; pctx.globalAlpha=0.16+0.2*p; pxEll(pctx,x,y,R,Math.round(R*0.8)); pctx.globalAlpha=0.9; pxRingE(pctx,x,y,R,Math.round(R*0.8),1);
    pctx.fillStyle='#ffd23f'; pctx.globalAlpha=0.9; pxRingE(pctx,x,y,r,Math.max(1,Math.round(r*0.8)),1); pctx.globalAlpha=1; }
  if(gtRet && itime-gtRet.t<0.15){ const [x,y]=iwp(gtRet.x,gtRet.y), R=Math.max(3,Math.round(Math.min(gtRet.R,30)*s)); pctx.fillStyle='#fff3c0'; pctx.globalAlpha=1-(itime-gtRet.t)/0.15;
    pxRingE(pctx,x,y,R,Math.round(R*0.8),1); pctx.fillRect(x-1,y,3,1); pctx.fillRect(x,y-1,1,3); pctx.globalAlpha=1; } }
const IEVIS=[];                                        // (this frame's on-screen foes, threat-sorted — reused, never reallocated)
/* §8.1 THE HERO RIM: after dark (and below ground) your outline shines — a bright 1-texel rim (#fff3c0 at 70%) over the light mask, so you're found at a glance */
function heroRim(){ const C=PSPR.lc; if(!C || C===PIX_NONE) return; const R=rimOf(C); if(!R) return;
  pctx.globalAlpha=(PSPR.lb?0.3:0.7)*(player.hid?0.6:1); pctx.drawImage(R.cv, PSPR.lx+C.ox, PSPR.ly+C.oy); pctx.globalAlpha=1; }   // (PT1 K9a: hidden, the rim fades too)
const RIMB={};                                         // (the rim bake's two scratch boards — S: the look's solid silhouette · E: it eroded one texel)
function rimBoard(k,w,h){ let c=RIMB[k]; if(!c){ c=RIMB[k]=document.createElement('canvas'); c.width=c.height=64; }
  if(c.width<w || c.height<h){ c.width=Math.max(c.width,w); c.height=Math.max(c.height,h); }
  const g=c.getContext('2d'); g.globalCompositeOperation='source-over'; g.globalAlpha=1; g.clearRect(0,0,w,h); return c; }
function rimOf(o){ if(o.rim!==undefined) return o.rim; const w=o.w|0, h=o.h|0; if(!(w>0&&h>0)){ o.rim=null; return null; }   // (baked once per look: its outermost texels)
  // G2 fix: composited on the boards, never read back (a getImageData on a just-drawn canvas stalled the GPU ~7 ms per new look)
  const S=rimBoard('s',w+2,h+2), gs=S.getContext('2d'); gs.drawImage(o.cv,1,1); gs.globalCompositeOperation='lighter'; gs.drawImage(o.cv,1,1); gs.drawImage(o.cv,1,1);   // (any texel → solid: the pale ring's 140 alpha saturates)
  gs.globalCompositeOperation='source-in'; gs.fillStyle='#fff'; gs.fillRect(0,0,w+2,h+2); gs.globalCompositeOperation='source-over';
  const E=rimBoard('e',w+2,h+2), ge=E.getContext('2d'); ge.drawImage(S,0,0); ge.globalCompositeOperation='destination-in';   // E: a texel survives only if all 4 neighbours are solid
  for(const q of XR4) ge.drawImage(S,q[0],q[1]); ge.globalCompositeOperation='source-over';
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h; const g=cv.getContext('2d');
  g.drawImage(S,-1,-1); g.globalCompositeOperation='destination-out'; g.drawImage(E,-1,-1);   // the silhouette minus its eroded core = the outermost texels
  g.globalCompositeOperation='source-in'; g.fillStyle='#fff3c0'; g.fillRect(0,0,w,h); g.globalCompositeOperation='source-over';
  return o.rim={cv}; }
/* DEV 👁 TOKENS (§8.2): a gold pip over each token holder (two for an elite's 2) · a grey pip over each foe waiting its turn · the waiting foes' rings round you */
function drawTokDbg(s){ const P=iwp(player.x,player.y), seen=new Set(); let wN=0;
  for(const en of enemies){ if(en.dead||en.dummy) continue; const [sx,sy]=iwp(en.x,en.y), y=Math.round(sy-en.r*s-Math.max(14,16*s));
    if(en.tok>0){ for(let k=0;k<en.tok;k++){ pctx.fillStyle='#1a0e04'; pctx.fillRect(sx-4+k*5,y-1,5,5); pctx.fillStyle=en.tokRel!=null?'#b89a4a':'#ffd23f'; pctx.fillRect(sx-3+k*5,y,3,3); } }
    else if(en.wait===tokFid && !en.fodder){ wN++; pctx.fillStyle='#1a0e04'; pctx.fillRect(sx-2,y-1,5,5); pctx.fillStyle='#9aa4b8'; pctx.fillRect(sx-1,y,3,3);
      const R=Math.round(en.wR||0); if(R>0 && !seen.has(R) && seen.size<8){ seen.add(R); const Rs=Math.round(R*s); pctx.fillStyle='#9aa4b8'; pctx.globalAlpha=0.35; pxRingE(pctx,P[0],P[1],Rs,Rs,1); pctx.globalAlpha=1; } } }
  TOKDBG.w=wN; }
const TOKDBG={w:0};
/* your identity ring: a crisp cream ellipse (a dark texel outside it) — drawn over the crowd, under you; after dark its front arc again over the mask */
function youRing(front){ const k=ITUNE.pRing; if(!(k>0) || !ISL) return; const s=islScale(), pr=player.r*s*ITUNE.pScale, P=iwp(player.x,player.y), gy=P[1]+Math.round(pr*0.6);
  const a=Math.min(1,k*(ISL.dark?1.9:1+(1-clamp(env.L,0,1))*0.9)*1.55), o=youRingSpr(Math.round(pr*1.5),Math.max(2,Math.round(pr*0.72)),front);
  pctx.globalAlpha=a; pctx.drawImage(o.cv,P[0]-o.ax,gy-o.ay); pctx.globalAlpha=1; }
/* attack tells on the ground: charge / pounce / lunge lanes (dithered texels), a diver's strike ring, a sand devil's blast ring, the stomp's shockwave */
function islTells(s){ const halfW=(IW/2)/s, halfH=(IH/2)/s, bmods=ISL.biome.mods, aL=(GFX.art && ART.ok && !ART.off && !ART.probe)?0.04:0; drawGemTells(s);   // (C5b: the broadside's telegraph & the ground reticle ride with the tells)
  if(iprop.length) propTells(s);                                                     // (PT1 K7a) a lit powder keg's blast ring, filling in as its fuse burns
  if(itrap.length) trapTells(s);                                                     // (PT1 K8) an armed plate · a dart trap's line · loose rocks' shadows
  if(ISL.rings) ringBars(true);                                                      // (PT1 K10b) a sealed ring's bars & runes glow through the night
  { const P=iwp(player.x,player.y), pr=player.r*s*ITUNE.pScale*1.35; LANE_EX[0]=P[0]; LANE_EX[1]=P[1]; LANE_EX[2]=pr*pr; }
  const lane=(en,a,len,prog)=>{ const [sx,sy]=iwp(en.x,en.y); pctx.fillStyle='#ff4632'; pctx.globalAlpha=(LGT.on?0.14:0.2)+aL+0.3*prog; pxLane(pctx,sx,sy,a,len*s,en.r*s,en.r*s*0.6); pctx.globalAlpha=1; };   // (softer over the dark mask — a warning, never a curtain over you) · (PX A2) +0.04 while the style pass runs: its faintest still reads (AT-17 · PX1 FIX PX1VC-3: aL = this frame's switch, not last frame's ART.P)
  const ring=(x,y,R,al,prog)=>{ const [sx,sy]=iwp(x,y), Rs=R*s; pctx.fillStyle='#ff4632'; pctx.globalAlpha=clamp(al+aL,0,1); pxRingE(pctx,sx,sy,Rs,Rs,1);   // (PX Z0, AT-17: aL — the lanes' +0.04 under the style pass — on the ring & its fill too: the night stomp ring had read 73–88 % filtered vs 93–100 bare)
    if(prog>0.05){ pctx.globalAlpha=clamp(al*0.3+aL,0,1); pxEll(pctx,sx,sy,Math.max(0,Rs*prog-1),Math.max(0,Rs*prog-1)); } pctx.globalAlpha=1; };
  const cone=(en,a,R,H,prog)=>{ const [sx,sy]=iwp(en.x,en.y), Rs=Math.round(R*s), r0=en.r*s*0.8; pctx.fillStyle='#ff4632';   // a strike's CONE: the wedge fills as it comes · its rim & edges show exactly where it reaches
    pctx.globalAlpha=(LGT.on?0.16:0.2)+0.3*prog; pxSect(pctx,sx,sy,0,Math.max(1,Math.round(Rs*prog)),a,H); pctx.globalAlpha=0.5+0.45*prog; pxSect(pctx,sx,sy,Rs-1,Rs,a,H);
    for(const e of [a-H,a+H]) pxLine(sx+Math.cos(e)*r0, sy+Math.sin(e)*r0, sx+Math.cos(e)*Rs, sy+Math.sin(e)*Rs); pctx.globalAlpha=1; };
  const aim=(en,a,L,prog)=>{ const [sx,sy]=iwp(en.x,en.y), n=Math.round(L*s), c=Math.cos(a), si=Math.sin(a); pctx.fillStyle='#ff4632'; pctx.globalAlpha=0.35+0.55*prog;   // a shot's AIM: a dotted 1-texel line
    for(let i=Math.round(en.r*s)+2;i<n;i++){ if((i>>1)&1) continue; pctx.fillRect(Math.round(sx+c*i),Math.round(sy+si*i),1,1); } pctx.globalAlpha=1; };
  const spikes=(en,col)=>{ const [sx,sy]=iwp(en.x,en.y), r=en.r*s; pctx.fillStyle=col; pctx.globalAlpha=0.65+0.35*Math.sin(itime*18);   // BRISTLING spines / THORNS: a spiky ring round the body
    for(let k=0;k<10;k++){ const a=k*TAU/10+itime*0.6; pxLine(sx+Math.cos(a)*r*1.1, sy+Math.sin(a)*r*0.95, sx+Math.cos(a)*r*1.6, sy+Math.sin(a)*r*1.4); } pctx.globalAlpha=1; };
  const vring=(x,y,R,al,col)=>{ const [sx,sy]=iwp(x,y), Rs=Math.max(1,Math.round(R*s)); pctx.fillStyle=col; pctx.globalAlpha=clamp(al,0,1); pxRingE(pctx,sx,sy,Rs,Rs,Math.max(1,Math.round(1.4*s))); pctx.globalAlpha=1; };
  const laneAt=(x,y,a,len,w,al)=>{ const [sx,sy]=iwp(x,y); pctx.fillStyle='#ff4632'; pctx.globalAlpha=clamp(al,0,1); pxLane(pctx,sx,sy,a,len*s,w*s,w*s*0.6); pctx.globalAlpha=1; };   // (C8a) a lane from any spot (a kelpie's NEXT dash)
  const line=(en,a,L,W,prog)=>{ const [sx,sy]=iwp(en.x,en.y), Ls=Math.round(L*s), hw=Math.max(1,W*s/2), c=Math.cos(a), si=Math.sin(a), r0=Math.round(en.r*s*0.8); pctx.fillStyle='#ff4632';   // (C8a) a LINE strike: a thin lane filling as it comes · its edges exact
    pctx.globalAlpha=(LGT.on?0.16:0.2)+0.3*prog; pxLane(pctx,sx+c*r0,sy+si*r0,a,Math.max(2,Math.round((Ls-r0)*prog)),hw,hw);
    pctx.globalAlpha=0.55+0.4*prog; for(const o of [-hw,hw]) pxLine(sx+c*r0-si*o, sy+si*r0+c*o, sx+c*Ls-si*o, sy+si*Ls+c*o); pxLine(sx+c*Ls-si*hw, sy+si*Ls+c*hw, sx+c*Ls+si*hw, sy+si*Ls-c*hw); pctx.globalAlpha=1; };
  for(const en of enemies){ if(Math.abs(en.x-icamX)>halfW+180 || Math.abs(en.y-icamY)>halfH+180) continue;
    const toP=Math.atan2(player.y-en.y, player.x-en.x), sm=lvlSpdMul(), st=en.st;
    if(en.fodder){ if(en.nipF && itime-en.nipF<0.25){ const [sx,sy]=iwp(en.x*0.4+player.x*0.6,en.y*0.4+player.y*0.6), q=Math.max(2,Math.round(2*s)); pctx.fillStyle='#ff3a2a'; pctx.globalAlpha=1-(itime-en.nipF)/0.25;   // the NIP: a red bite-mark where it lands
        pxLine(sx-q,sy-q,sx,sy); pxLine(sx+1,sy-q,sx+q+1,sy); pctx.globalAlpha=1; } continue; }
    if(en.type==='boar' && st==='windup'){ const G=BOSS_ATK.greatboar.charge, chg=en.guard?G.sp*(en.ph>=3?ITUNE.bossEnrage:1)*(bmods.chargeMul||1):ITUNE.boarCharge*(en.elite?1.2:1)*(bmods.chargeMul||1)*sm;
      lane(en, en.aa==null?toP:en.aa, chg*(en.guard?G.act:0.7), clamp(1-en.tmr/(en.wu||0.62),0,1)); }   // (a boar's aim is locked as it winds — the lane shows exactly where it runs)
    else if(en.type==='boar' && st==='paw'){ const chg=ITUNE.boarCharge*(en.elite?1.2:1)*(bmods.chargeMul||1)*sm; lane(en, toP, chg*0.7*0.5, 0); }   // pawing the ground: the lane-to-be, faint
    else if(en.guard && st==='stomp'){ const p=clamp(1-en.tmr/(en.wu||0.62),0,1); ring(en.x, en.y, STOMP_R, 0.25+0.45*p, p); }   // the stomp's full reach, filling as it rears — dash through the ring when it rolls, or stand clear
    else if(en.type==='dingo' && st==='crouch'){ const K=BOSS_ATK.packking.pounce; lane(en, en.guard?en.aa:toP, en.guard ? K.sp*K.act*(en.ph>=3?1.1:1) : 265*(en.elite?1.18:1)*sm*0.4, clamp(1-en.tmr/(en.guard?(en.wu||K.wind):0.45),0,1)); }   // (a lord's lane: its own LOCKED leap)
    else if(en.type==='lamprey' && st==='crouch'){ const A=ATK.lamprey[0]; lane(en, toP, A.v*sm*A.act, clamp(1-en.tmr/A.wind,0,1)); }
    else if(en.type==='crab' && st==='windup'){ const L=BOSS_ATK.brood.lunge; lane(en, en.guard?en.aa:en.fa, en.guard ? L.sp*L.act*(en.ph>=3?1.15:1) : 205*(en.elite?1.15:1)*sm*0.34, clamp(1-en.tmr/(en.wu||0.5),0,1)); }
    else if(en.type==='diver' && st==='dive'){ const al=1-(en.alt==null?1:en.alt); ring(en.tx, en.ty, ATK.diver[0].sh.R, 0.35+0.5*al, al); }
    else if(en.type==='sanddev' && st==='rumble'){ const A=ATK.sanddev[0], p=clamp(1-en.tmr/A.wind,0,1); ring(en.x, en.y, A.sh.R, 0.45+0.45*p, p); }
    else if(en.type==='urchin' && st==='swell'){ const A=ATK.urchin[0], p=clamp(1-en.tmr/A.wind,0,1); ring(en.x, en.y, A.R, 0.45+0.45*p, p); }
    else if((en.type==='kelpie'||en.type==='boulderback'||en.type==='walrus') && st==='windup'){ const p=clamp(1-en.tmr/(en.wu||0.4),0,1); laneAt(en.x, en.y, en.aa, en.lnL||60, en.r, (LGT.on?0.14:0.2)+aL+0.3*p); }   // (PX A2: +0.04 under the style pass, as lane's · PX1 FIX: aL) (C8a) a kelpie's stamp · a boulderback's tuck (& its wall-spin) · (C8c) a walrus's wind-up: the LOCKED lane, exactly as far as it runs
    else if(en.type==='walrus' && st==='paw') lane(en, toP, ATK.walrus[0].sp*sm*ATK.walrus[0].act*0.5, 0);   // (C8c) flippers slapping the ground: the slide-to-be, faint
    else if(en.type==='beetle' && (st==='wind'||st==='act')){ const A=en.atk||ATK.beetle[0];   // (C8c) THE PRISM BEETLE: a flickering aim while it tracks you → the LOCKED line (10u, as far as it reaches) → the BEAM itself
      if(st==='act'){ const [sx,sy]=iwp(en.x,en.y), c=Math.cos(en.aa), si=Math.sin(en.aa), r0=Math.round(en.r*s*0.8), Ls=Math.round((en.lnL+en.r)*s), hw=Math.max(1,A.sh.W*s/2), f=0.75+0.25*Math.sin(itime*60);
        pctx.fillStyle='#8fe8ff'; pctx.globalAlpha=0.55*f; pxLane(pctx,sx+c*r0,sy+si*r0,en.aa,Ls-r0,hw+1,hw+1); pctx.fillStyle='#e8ffff'; pctx.globalAlpha=0.9; pxLane(pctx,sx+c*r0,sy+si*r0,en.aa,Ls-r0,Math.max(1,hw*0.45),Math.max(1,hw*0.45)); pctx.globalAlpha=1; }
      else if(en.lk) line(en, en.aa, (en.lnL||A.sh.L)+en.r, A.sh.W, clamp(1-en.tmr/A.lock,0,1));
      else if(Math.sin(itime*38)>-0.35){ const [sx,sy]=iwp(en.x,en.y), n=Math.round(Math.min(A.sh.L,Math.hypot(player.x-en.x,player.y-en.y)+20)*s), c=Math.cos(en.aa), si=Math.sin(en.aa); pctx.fillStyle='#bff4ff'; pctx.globalAlpha=0.35+0.3*clamp(1-(en.tmr-A.lock)/(A.wind-A.lock),0,1);
        for(let i=Math.round(en.r*s)+2;i<n;i++){ if(((i+((itime*40)|0))>>1)&1) continue; pctx.fillRect(Math.round(sx+c*i),Math.round(sy+si*i),1,1); } pctx.globalAlpha=1; } }   // (a flickering dotted line that follows you)
    else if(st==='wind' && en.atk && en.atk.sh){ const A=en.atk, sh=A.sh, p=clamp(1-en.tmr/(en.wu||A.wind||0.4),0,1);   // THE GENERIC STRIKE'S TELL: its exact shape (a boss's Tusk Sweep, acid spray & bite too)
      if(sh.k==='cone') cone(en, en.aa, sh.R, sh.H*Math.PI/360, p); else if(sh.k==='circle') ring(en.x+(sh.off?Math.cos(en.aa)*sh.off:0), en.y+(sh.off?Math.sin(en.aa)*sh.off:0), sh.R, 0.4+0.5*p, p); else if(sh.k==='proj') aim(en, en.aa, 130, p);
      else if(sh.k==='line') line(en, en.aa, sh.L+en.r, sh.W, p);
      else if(sh.k==='lob' && en.lx!=null) ring(en.lx, en.ly, sh.R, 0.35+0.35*p, p*0.5); }   // (C8a: a circle ahead — the scorpion's sting · a LINE — the shrimp's punch, the toad's tongue · C8c: a LOCKED lob — the salamander's landing ring as its throat glows)
    if(en.type==='tmantis' && st==='guard'){ const [sx,sy]=iwp(en.x,en.y), r=en.r*s, k=0.6+0.4*Math.sin(itime*24); pctx.globalAlpha=k; pctx.fillStyle='#f4fbff';   // (C8c) GUARD: a silver X glint across its crossed arms (+ its '!')
      const fx=Math.cos(en.fa)*r*0.7, fy=spr2Top(en)>0?-Math.round(spr2Top(en)*0.58):Math.sin(en.fa)*r*0.7, g=Math.round(r*0.55); pxLine(sx+fx-g,sy+fy-g,sx+fx+g,sy+fy+g); pxLine(sx+fx-g,sy+fy+g,sx+fx+g,sy+fy-g); pctx.fillStyle='#ffffff'; pctx.fillRect(Math.round(sx+fx)-1,Math.round(sy+fy)-1,3,3); pctx.globalAlpha=1; }   // (PX K5) a templated mantis: the X up on its crossed scythes, before its face
    if(en.type==='kelpie' && st==='charge' && en.nxA!=null) laneAt(en.nxX, en.nxY, en.nxA, en.nxL, en.r, LGT.on?0.28:0.26);   // (C8a) its NEXT dash's lane, locked as this one began (≥ 0.58 s of warning for each ×1.4 dash)
    if(en.type==='mothwing' && en.pf){ const p=clamp(1-en.pf.t/ATK.mothwing[0].dur,0,1); ring(en.pf.x, en.pf.y, ATK.mothwing[0].R, 0.35+0.5*p, p); }   // (C8a) the POLLEN puff blooms — its ring is the cloud to come
    if(en.type==='clam' && st==='open' && !en.fired && en.tok>0) aim(en, toP, 130, clamp((en.ow||0)/ATK.clam[0].wind,0,1));   // a clam about to spit: its aim line
    if(thornsUp(en)) spikes(en, en.type==='reefspike'?'#ffd23f':'#9be85a');
    else if(en.type==='reefspike' && en.brT!=null && en.brT<0.3 && en.aggro) spikes(en,'rgba(255,210,63,.35)');   // (a breath before the spines stand)
    if(en.type==='alpha' && st==='howl'){ const p=clamp(1-en.tmr/ATK.alpha[1].dur,0,1); vring(en.x, en.y, en.r*(1.6+0.9*p), 0.5+0.4*Math.sin(itime*20), '#ffcf6a'); }   // head up: the HOWL is coming
    if(en.guard){ if(st==='howl'){ const p=clamp(1-en.tmr/BOSS_ATK.packking.howl,0,1); vring(en.x, en.y, en.r*(1.6+1.1*p), 0.5+0.4*Math.sin(itime*20), '#bfc8ff'); }   // the Pack King's HOWL: his shadows are coming
      else if(st==='roar'){ const p=clamp(1-en.tmr/BOSS_ATK.greatboar.roar,0,1); vring(en.x, en.y, en.r*(1.5+1.2*p), 0.5+0.4*Math.sin(itime*18), '#ff9a3c'); }   // the Great Boar's ROAR: the herd is coming
      else if(en.rgC>0){ const p=clamp(1-en.rgC/BOSS_ATK.drowned.ring.wind,0,1); vring(en.x, en.y, BOSS_ATK.drowned.ring.R, 0.2+0.45*p, '#5ae6c8'); vring(en.x, en.y, en.r*(1.3+0.8*p), 0.8, '#d2fff5'); } }   // the Drowned's CAST: the tide ring's full reach
    if(en.rsp && en.cast>0){ const p=clamp(1-en.cast/0.7,0,1); vring(en.rsp.x, en.rsp.y, 14-6*p, 0.5+0.5*p, '#b98cff'); vring(en.rsp.x, en.rsp.y, 22-10*p, 0.35*p, '#8fe0c0'); }   // the RAISE: violet rings where the drowned will rise
    if(en.type==='siren' && en.song>0){ const p=clamp(en.song/ATK.siren[1].dur,0,1); vring(en.x, en.y, ATK.siren[1].R, 0.35+0.35*p, '#b8f0ff'); vring(en.x, en.y, en.r*2.2+4*Math.sin(itime*14), 0.8, '#b8f0ff'); }   // the SONG: its reach — look away
    if(en.tk && en.tk.venom && en.vT!=null && en.vT<0.45){ const p=clamp(1-en.vT/0.45,0,1), R=en.r*(1.9-0.6*p); vring(en.x, en.y, R, 0.4+0.5*p, '#b8ff6a'); }   // Venomous: the green glow closes in — the fan is coming
  }
  for(const pr of iproj){ if(!pr.lob || !(pr.life>0)) continue; const p=clamp(pr.lt/pr.T,0,1); ring(pr.tx, pr.ty, pr.R, 0.35+0.55*p, p); }   // (C8a) a LOBBED coconut: the ring where it lands, filling as it falls
  for(const z of izone){ if(z.owner==='player' || !islOnScr(z.x,z.y,z.R+10)) continue;
    if(z.arm>z.t){ const p=clamp(z.t/z.arm,0,1); ring(z.x, z.y, z.R, 0.4+0.5*p, p); continue; }                 // (C8c) a sporeling's spores BLOOM: the ring fills — then the cloud
    if(LGT.on) vring(z.x, z.y, z.R, 0.5*clamp(Math.min((z.t-(z.arm||0))/0.2,(z.life-z.t)/0.3),0,1), '#ff7a4a'); }   // (C8a) a foe's ground (a fire trail, a pollen cloud) — its rim over the dark
  for(const f of ifx){ if(f.k==='eatk'){ const [sx,sy]=iwp(f.x,f.y), p=clamp(f.t/f.life,0,1), Rs=Math.round(f.R*s); pctx.fillStyle='#ffd0b8'; pctx.globalAlpha=0.55*(1-p);   // the strike lands: its shape flashes pale
      if(f.line) pxLane(pctx,sx,sy,f.a,Rs,Math.max(1,f.W*s/2),Math.max(1,f.W*s/2)); else if(f.H>=Math.PI-0.01) pxRingE(pctx,sx,sy,Rs,Rs,Math.max(1,Math.round(2*s))); else pxSect(pctx,sx,sy,Math.round(Rs*0.4),Rs,f.a,f.H); pctx.globalAlpha=1; }
    else if(f.k==='howlR'){ const p=clamp(f.t/f.life,0,1); vring(f.x, f.y, f.R*(0.15+0.85*p), 0.7*(1-p), '#ffcf6a'); } }
  for(const w of ishock){ if(w.R<=1) continue; const [sx,sy]=iwp(w.x,w.y), R=Math.round(w.R*s), a=clamp(1-w.R/w.max,0,1)*0.9+0.1, td=!!w.tide;   // the stomp's shockwave: a hard front with a dusty wake (a tide ring: sea-green) · (a delayed ring isn't out yet)
    pctx.fillStyle=td?'#061e22':'#28100a'; pctx.globalAlpha=0.55*a; pxRingE(pctx,sx,sy,R+2,R+2,Math.max(2,Math.round(3.7*s)));
    pctx.fillStyle=td?'#5ae6c8':'#ff9646'; pctx.globalAlpha=a; pxRingE(pctx,sx,sy,R+1,R+1,Math.max(1,Math.round(2.2*s)));
    if(R>4){ pctx.fillStyle=td?'#d2fff5':'#ffecb4'; pctx.globalAlpha=0.6*a; pxRingE(pctx,sx,sy,R-Math.round(3*s),R-Math.round(3*s),1); } pctx.globalAlpha=1; } }
function islBang(en,sx0,sy,r,s){ const st=en.st; if(st==='windup'||st==='crouch'||st==='swell'||st==='rumble'||st==='stomp'||st==='wind'||st==='paw'||st==='guard'||(en.type==='reefspike'&&en.bris>0)||(en.guard&&(st==='roar'||st==='howl'||en.rgC>0))){   // "!" (1.5×, dark-outlined so it reads on sand & snow) — "!!" from the Great Boar
    const bw=Math.max(2,Math.round(1.6*s)), bh=Math.max(4,Math.round(5.5*s)), dt2=Math.max(2,Math.round(1.6*s)), tp=spr2Top(en), top=tp>0?Math.min(spr2Tpl(en).topN?1e9:Math.round(sy-r-Math.max(8,11*s)-bh),(en._ey!=null?en._ey:Math.round(sy))-Math.ceil(tp)-4-bh-dt2):Math.round(sy-r-Math.max(8,11*s)-bh);   // (in whole texels · PX E1: over a tall body's head · PX2 FIX: from the drawn body, a hop's lift too)
    for(const ox of (en.guard?[-bw-1,bw+1]:[0])){ const x0=Math.round(sx0+ox-bw/2);
      pctx.fillStyle='#1a0e04'; pctx.fillRect(x0-1,top-1,bw+2,bh+2); pctx.fillRect(x0-1,top+bh+1,bw+2,dt2+2);
      pctx.fillStyle='#ffd23f'; pctx.fillRect(x0,top,bw,bh); pctx.fillRect(x0,top+bh+2,bw,dt2); } } }
function islHpBars(evis,s){ for(const en of evis){ if(en.fodder||en.guard||!(en.hp0>0)||en.hp<=0||en.dummy) continue;
    const sx0=(en.x-icamX)*s+IW/2, sy=(en.y-icamY)*s+IH/2, r=en.r*s, w=Math.max(8,Math.round(r*2)), x=Math.round(sx0-w/2); let y=Math.round(sy-r*(en.type==='diver'&&en.st!=='grounded'?2.2:en.type==='mothwing'?1.2+MOTH_LIFT:1.2)-3-(en.lift>0?en.lift*s:0));
    const hurt=en.hp<en.hp0 && !en.rar;                                                     // (magic / rare foes carry a nameplate bar instead)
    const sg=!en.rar && en.stgMax>0 && (en.stg>0 || en.stgImm>0 || en.brk>0), tp=(hurt||sg)?spr2Top(en):0;   // (PX E1) a tall 3/4 body: the bar & its stagger bar clear its head
    if(tp>0){ const yn=Math.round(sy-(en.lift>0?en.lift*s:0))-Math.ceil(tp)-2-(hurt&&sg?5:sg?2:1); if(yn<y || spr2Tpl(en).topN) y=yn; }   // (PX5 FIX: a topN kind's bar sits on the frame it shows)
    if(hurt){ pctx.fillStyle=en.elite?'#ffd23f':'#1a0e04'; pctx.fillRect(x-1,y-1,w+2,3);
      pctx.fillStyle='#3a1414'; pctx.fillRect(x,y,w,1);
      pctx.fillStyle=en.elite?'#ff7a3c':'#e8483a'; pctx.fillRect(x,y,Math.max(1,Math.round(w*clamp(en.hp/en.hp0,0,1))),1); }
    if(!en.rar) drawStagger(en,x,y+(hurt?3:0),w); } }                                    // (a magic / rare foe's stagger rides under its nameplate)
/* §2.7 the STAGGER BAR: a 2-texel gold bar under an elite's HP bar — filling with your blows · BROKEN: a bright pulse · recovering (6 s immune): grey, refilling */
function drawStagger(en,x,y,w){ const S=en.stgMax; if(!(S>0) || !(en.stg>0 || en.stgImm>0 || en.brk>0)) return;
  pctx.fillStyle='#1a0e04'; pctx.fillRect(x-1,y-1,w+2,4);
  if(en.brk>0){ pctx.fillStyle=(Math.floor(itime*12)&1)?'#fff3c0':'#ffd23f'; pctx.fillRect(x,y,w,2); return; }
  if(en.stgImm>0){ pctx.fillStyle='#3a3a3a'; pctx.fillRect(x,y,w,2); pctx.fillStyle='#8a8a8a'; pctx.fillRect(x,y,Math.max(1,Math.round(w*clamp(1-en.stgImm/6,0,1))),2); return; }
  pctx.fillStyle='#3a2a08'; pctx.fillRect(x,y,w,2); pctx.fillStyle='#ffd23f'; pctx.fillRect(x,y,Math.max(1,Math.round(w*clamp(en.stg/S,0,1))),2); }
/* the explorer sprite — shared by island crawls (sword in hand) and port strolls (sword sheathed).
   paintExplorer(g,…) is THE painter. Ports & rooms paint straight onto their buffer (smooth, as ever); the CRAWL bakes it at its texel
   through the foes' own pixel pass (snap · the dark SNES line · a pale rim so you read on sand, on snow & in a crowd) with a red scarf
   no isle wears, drawn pScale × bigger (the hitbox is unchanged) — cached by facing (16) × walk frame (6) × stride way (8) × blade
   angle (32) × lunge × blade length × bow, and blitted 1:1 on the grid. */
function paintExplorer(g,x,y0,pr,pfa,stride,bob,tvx,tvy,sw,bow,px){
  const pfx=Math.cos(pfa), pfy=Math.sin(pfa), ppx=-pfy, ppy=pfx, y=y0-bob;
  // boots, stepping along the direction of travel
  g.fillStyle=px?'#2c1e10':'#3e2c18';
  g.beginPath(); g.ellipse(x+ppx*pr*0.42+tvx*stride, y0+ppy*pr*0.42+tvy*stride, pr*0.3, pr*0.24, pfa, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(x-ppx*pr*0.42-tvx*stride, y0-ppy*pr*0.42-tvy*stride, pr*0.3, pr*0.24, pfa, 0, TAU); g.fill();
  if(px){ const wv=stride/pr*0.9, bx=x-pfx*pr*0.62, by=y-pfy*pr*0.62;   // the red scarf's tails stream out behind you (they flick with the stride)
    g.fillStyle='#8e2018'; g.beginPath(); g.moveTo(bx+ppx*pr*0.32,by+ppy*pr*0.32); g.lineTo(bx-pfx*pr*0.95+ppx*pr*(0.5+wv),by-pfy*pr*0.95+ppy*pr*(0.5+wv)); g.lineTo(bx-pfx*pr*0.55+ppx*pr*0.05,by-pfy*pr*0.55+ppy*pr*0.05); g.closePath(); g.fill();
    g.fillStyle='#d23a2e'; g.beginPath(); g.moveTo(bx-ppx*pr*0.3,by-ppy*pr*0.3); g.lineTo(bx-pfx*pr*1.05+ppx*pr*(0.12-wv),by-pfy*pr*1.05+ppy*pr*(0.12-wv)); g.lineTo(bx-pfx*pr*0.45-ppx*pr*0.02,by-pfy*pr*0.45-ppy*pr*0.02); g.closePath(); g.fill(); }
  // coat (outlined)
  g.fillStyle='#33271a'; g.beginPath(); g.arc(x,y,pr*1.12,0,TAU); g.fill();
  g.fillStyle=px?'#2a4d63':'#b9925c'; g.beginPath(); g.arc(x,y,pr*0.98,0,TAU); g.fill();
  if(px){ g.fillStyle='#3d6d88'; g.beginPath(); g.arc(x-pr*0.14,y-pr*0.16,pr*0.8,0,TAU); g.fill();   // the crawl: your navy SEA COAT (no isle wears it) — lit top-left, shaded low-right
    g.fillStyle='#5a8eaa'; g.beginPath(); g.arc(x-pr*0.42,y-pr*0.44,pr*0.34,0,TAU); g.fill(); }
  // satchel strap across the chest
  g.strokeStyle=px?'#8a5a2c':'#5a3a22'; g.lineWidth=Math.max(1.5,pr*0.22);
  g.beginPath(); g.moveTo(x-ppx*pr*0.8-pfx*pr*0.3, y-ppy*pr*0.8-pfy*pr*0.3);
  g.lineTo(x+ppx*pr*0.55+pfx*pr*0.55, y+ppy*pr*0.55+pfy*pr*0.55); g.stroke();
  g.strokeStyle=px?'#d23a2e':'#dcc08a'; g.lineWidth=px?Math.max(1.6,pr*0.26):Math.max(1,pr*0.15);                // collar (the crawl: the scarf round your neck)
  g.beginPath(); g.arc(x,y,pr*0.72, pfa-(px?0.95:0.7), pfa+(px?0.95:0.7)); g.stroke();
  // off-hand swings with the walk
  g.fillStyle='#e8c39a'; g.beginPath();
  g.arc(x-ppx*pr*1.0-pfx*stride*0.5, y-ppy*pr*1.0-pfy*stride*0.5, pr*(px?0.3:0.26), 0, TAU); g.fill();
  // head peeking forward, brimmed hat sitting back
  g.fillStyle='#e8c39a'; g.beginPath(); g.arc(x+pfx*pr*0.22, y+pfy*pr*0.22, pr*0.5, 0, TAU); g.fill();
  g.fillStyle=px?'#5c4020':'#6e5128'; g.beginPath(); g.ellipse(x-pfx*pr*0.18, y-pfy*pr*0.18, pr*0.74, pr*0.66, 0, 0, TAU); g.fill();
  g.fillStyle=px?'#94723f':'#8a6a3c'; g.beginPath(); g.arc(x-pfx*pr*0.2, y-pfy*pr*0.2, pr*0.45, 0, TAU); g.fill();
  g.strokeStyle=px?'#c8342a':'#503a1c'; g.lineWidth=px?Math.max(1.4,pr*0.2):Math.max(1,pr*0.14);                   // hat band (the crawl: scarf-red)
  g.beginPath(); g.arc(x-pfx*pr*0.2, y-pfy*pr*0.2, pr*0.34, pfa-1.2, pfa+1.2); g.stroke();
  if(px){ g.fillStyle='#c09a5c'; g.fillRect(Math.round(x-pfx*pr*0.2-pr*0.28), Math.round(y-pfy*pr*0.2-pr*0.3), 1, 1); }   // a glint on the crown (top-left light)
  // the sword — always in hand on the isles; sweeps on a slash, tucks back while the bow is out
  if(sw){ const swc=Math.cos(sw.a), swn=Math.sin(sw.a), lunge=sw.lunge;
    const hx=x+swc*pr*0.95+pfx*lunge, hy=y+swn*pr*0.95+pfy*lunge;
    const bx0=hx+swc*pr*0.18, by0=hy+swn*pr*0.18, bl=sw.bl;
    const tipx=hx+swc*bl, tipy=hy+swn*bl;
    g.strokeStyle='#5a3a22'; g.lineWidth=Math.max(1.6,pr*0.2);                      // grip
    g.beginPath(); g.moveTo(hx-swc*pr*0.35, hy-swn*pr*0.35); g.lineTo(hx,hy); g.stroke();
    g.strokeStyle='#8a6a3c'; g.lineWidth=Math.max(1.6,pr*0.18);                     // crossguard
    g.beginPath(); g.moveTo(bx0-swn*pr*0.36, by0+swc*pr*0.36); g.lineTo(bx0+swn*pr*0.36, by0-swc*pr*0.36); g.stroke();
    g.strokeStyle='#6e7f93'; g.lineWidth=Math.max(2.2,pr*0.34);                     // blade outline
    g.beginPath(); g.moveTo(bx0,by0); g.lineTo(tipx,tipy); g.stroke();
    g.strokeStyle='#eef4fb'; g.lineWidth=Math.max(1.3,pr*0.18);                     // bright edge
    g.beginPath(); g.moveTo(bx0,by0); g.lineTo(tipx-swc*1.2, tipy-swn*1.2); g.stroke();
    g.fillStyle='#e8c39a'; g.beginPath(); g.arc(hx,hy,pr*0.28,0,TAU); g.fill(); }   // sword hand
  if(bow){                                     // bow flash when loosing an arrow (at the shot's own angle)
    const bhx=x+pfx*pr*0.95, bhy=y+pfy*pr*0.95;
    g.strokeStyle='#7a5230'; g.lineWidth=Math.max(1.6,pr*0.2);
    g.beginPath(); g.arc(bhx,bhy,pr*0.85,pfa-1.25,pfa+1.25); g.stroke();
    g.strokeStyle='#e8e0c8'; g.lineWidth=px?1.3:1;
    g.beginPath(); g.moveTo(bhx+Math.cos(pfa-1.25)*pr*0.85, bhy+Math.sin(pfa-1.25)*pr*0.85);
    g.lineTo(bhx+Math.cos(pfa+1.25)*pr*0.85, bhy+Math.sin(pfa+1.25)*pr*0.85); g.stroke();
    g.fillStyle='#e8c39a'; g.beginPath(); g.arc(bhx,bhy,pr*0.26,0,TAU); g.fill(); }
}
/* §15 THE POSE CONTRACT (C5a): the basic action's pose (slash · chop · slam · thrust · stab · draw · cast — spin is the Whirl's · STEEL: the sword's sweep
   & lunge) + its phase progress → wPose(pfa, prk) = {a: the weapon's angle · lg: its lunge along your facing (texels — prk: the body's own scale) · st: a
   bow's draw 0-2 · oa / olg: the off-hand's dagger · STEEL: dy the weapon lower on screen · bd your body down · bl your body along your facing (texels)}. The wind cocks it, the ACT is when the blade arrives (its sweep, its thrust, its slam, its loose), the recovery holds it and eases it
   home. The Legacy feel (no act) plays its act over the first 0.16 s of the recovery, as ever. */
const W_REST={sword:0.6, axe:0.75, spear:0.3, daggers:0.7, bow:0.9, staff:0.45};   // each type's rest angle off your facing (rad)
function wPose(pfa,prk){ const A=player.act||(player.hv&&player.hv.A), W=wpnOf(), R={a:pfa+(W_REST[W]||0.6), lg:0, st:0, oa:pfa-0.75, olg:0};
  if(!A || A.slot!=='basic' || !A.c) return R;                                                   // (a skill leaves the weapon at rest — the Whirl & the Volley draw their own)
  const c=A.c, pose=c.pose||(WEAPON[A.W]||WEAPON.sword).pose, dir=c.dir||1, sw=A.act>0.01?A.act:0.16, hv=!!c.heavy, wd=A.ph==='wind';
  const w=wd?clamp(A.t/Math.max(0.001,A.wind),0,1):1, p=wd?0 : A.ph==='act'?clamp(A.t/sw,0,1) : (A.act>0.01?1:clamp(A.t/sw,0,1)), r=A.ph==='rec'?clamp(A.t/Math.max(0.001,A.rec),0,1):0;
  if(pose==='slash' || pose==='chop'){ const H=c.sh.H*Math.PI/180*(pose==='chop'?0.9:1), s0=pfa-dir*H;   // the SWEEP: cocked past its wedge's edge, then across all of it
    R.a=wd ? s0-dir*(pose==='chop'?0.55:0.4)*w : s0+dir*2*H*p; R.lg=p>0&&p<1 ? Math.sin(p*Math.PI)*prk*(hv?0.6:pose==='chop'?0.45:0.35) : 0; }
  else if(pose==='slam'){ R.a=wd ? pfa+dir*(1.2+1.6*w) : A.ph==='act' ? pfa+dir*2.8*(1-p) : pfa; R.lg=wd?0 : A.ph==='act'?prk*0.6*p : prk*0.6*(1-r); }   // the SLAM: swung back over the shoulder, brought down ahead
  else if(pose==='thrust'){ const L=prk*(hv?1.3:0.9); R.a=pfa; R.lg=wd ? -prk*0.4*w : A.ph==='act' ? -prk*0.4+(L+prk*0.4)*p : L*(1-r); }   // the THRUST: drawn back, driven out, eased home
  else if(pose==='stab'){ const L=prk*(hv?1.0:0.75), lg=wd ? -prk*0.25*w : A.ph==='act' ? L*p : L*(1-r), h=(A.hd!=null?A.hd:c.hand)|0;   // a STAB of the hand in turn (both on the twin stab · PT1 K2: a double stab's hand in turn)
    if(h!==1){ R.a=pfa+0.12*dir; R.lg=lg; } if(h>=1){ R.oa=pfa-0.12; R.olg=lg; } }
  else if(pose==='draw'){ R.a=pfa; R.st=wd ? (w<0.5?1:2) : A.ph==='act' ? 2 : 0; }                   // the DRAW: the string comes back to your cheek · loosed in the act
  else if(pose==='cast'){ R.a=wd ? pfa+0.45*(1-w)-0.3*w : A.ph==='act' ? pfa : pfa+0.45*r; R.lg=wd ? -prk*0.2*w : A.ph==='act' ? prk*0.5 : prk*0.5*(1-r); }   // the CAST: raised, thrust at the aim, lowered
  else if(pose==='sweep'){ const H=c.sh.H*Math.PI/180, s0=pfa-dir*H, lo=Math.round(prk*0.45), e=s0+dir*2*H, q=pfa+(W_REST[W]||0.6), d=Math.atan2(Math.sin(q-e),Math.cos(q-e)), u=(A.ph==='rec' && A.act>0.01)?clamp((r-0.4)/0.6,0,1):0;
    R.a=wd ? s0-dir*0.6*w : u>0 ? e+d*u*u*(3-2*u) : s0+dir*2*H*p; R.lg=p>0&&p<1 ? Math.sin(p*Math.PI)*prk*0.3 : 0; R.dy=wd ? Math.round(lo*w) : A.ph==='act' ? lo : Math.round(lo*(1-r)); R.bd=(wd ? w>0.5 : A.ph==='act' || r<0.6) ? 1 : 0; }   // (STEEL) the SWEEP (the sword's 4th): a LOW back-hand — wound back across you, swept close over the ground through its whole 180°, then (u) brought back down to your guard, never left raised (dy: the blade drawn lower · bd: you crouch a texel)
  else if(pose==='lunge'){ const L=prk*1.5, b=prk*0.3; R.a=pfa; R.lg=wd ? -prk*0.5*w : A.ph==='act' ? -prk*0.5+(L+prk*0.5)*p : L*(1-r); R.bl=Math.round(wd ? -b*0.5*w : A.ph==='act' ? b : b*(1-r)); }   // (STEEL) the LUNGE (the sword's 5th): coiled back, then you & the blade drive forward together (bl: your body leans along your facing — the 22u step itself is real, drawExplorerPix trails it), eased home
  return R; }
/* THE WEAPON LAYER (C5a — §15's split): the body bakes without its weapon; each weapon look is its own little texel sprite per 1/32 turn (WSPR), its
   grip at the anchor, drawn on the grid at your hand · the off-hand's piece (a shield, a quiver on your back, a focus) one sprite per facing, a second
   dagger in your off hand. Built with the pixel kit (no read-back), kept (LRU) — WSPR.bk counts the builds (none once warmed: plWarm). */
const WSPR={m:new Map(), cap:520, bk:0};
function wLook(S){ if(S.fists) return 'fist'; const b=S.base;
  return b==='maul'?'maul' : b==='anchor'?'anchor' : b==='trident'?'trident' : b==='harpoon'?'harpoon' : (b==='cwand'||b==='pwand')?'wand' : S.wt==='daggers'?'dagger' : S.wt; }
function offLook(){ const o=EQ.off&&IB(EQ.off); if(!o) return ''; const b=EQ.off.b; return o.t==='daggers'?'dagger' : o.t==='shield'?(b==='tower'?'tower':b==='kite'?'kite':'buckler') : o.t==='quiver'?'quiver' : b==='cfocus'?'cfocus':'sgfocus'; }
function wLen(look,pr,prk){ const s=islScale(), rm=reachMul();                                            // a look's reach from the grip (texels) — a blade's tip meets its hitbox's edge
  switch(look){ case 'sword': return Math.round(Math.max(pr*1.2, 26*rm*s-pr*0.95));
    case 'axe': return Math.round(Math.max(pr*1.1, 28*rm*s-pr*0.95-prk*0.45));
    case 'maul': case 'anchor': return Math.round(pr*1.9);
    case 'spear': case 'trident': case 'harpoon': return Math.round(Math.max(pr*1.6, 44*rm*s-pr*0.95-prk*0.9));
    case 'dagger': return Math.round(Math.max(pr*0.7, 20*rm*s-pr*0.95-prk*0.75));
    case 'staff': return Math.round(pr*2.0); case 'wand': return Math.round(pr*1.0); case 'bow': return Math.round(pr*0.9); }
  return 0; }
function wSpr(look,ai,st,bl,pr,el){ if(look!=='staff' && look!=='wand') el=''; const key=look+'|'+ai+'|'+st+'|'+bl+'|'+Math.round(pr*8)+'|'+el; let o=WSPR.m.get(key);   // (only a staff's & a wand's gem wears its element)
  if(o){ if(WSPR.m.size>WSPR.cap*0.7){ WSPR.m.delete(key); WSPR.m.set(key,o); } return o; }
  WSPR.bk++; o=look[0]==='o'&&look[1]===':' ? oPaint(look.slice(2),ai*TAU/16,pr) : wPaint(look,ai*TAU/32,st,bl,pr,el);   // ('o:<look>': an off-hand piece, per 1/16 turn)
  if(WSPR.m.size>=WSPR.cap){ let n=0; for(const k of WSPR.m.keys()){ WSPR.m.delete(k); if(++n>=64) break; } }
  WSPR.m.set(key,o); return o; }
function psCrop(S,ax,ay){ let x0=S.w,y0=S.h,x1=-1,y1=-1; for(let y=0;y<S.h;y++) for(let x=0;x<S.w;x++) if(S.d[y*S.w+x]){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }   // (a sprite trimmed to what it holds, its anchor kept)
  if(x1<0) return {cv:PIX_NONE.cv, ax:0, ay:0, w:1, h:1}; const w=x1-x0+1, h=y1-y0+1, d=new Uint32Array(w*h);
  for(let y=0;y<h;y++) d.set(S.d.subarray((y+y0)*S.w+x0,(y+y0)*S.w+x0+w),y*w);
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d.buffer),w,h),0,0); return {cv, ax:ax-x0, ay:ay-y0, w, h}; }
const WPC={K:'#10141c', st:'#a8b8ca', ed:'#f2f7fc', dk:'#5e6c7e', gr:'#5a3a22', gd:'#d0a840', wd:'#8a5a2c', wdl:'#b8884e', ir:'#7a8494', irl:'#d0d8e2', sk:'#e8c39a', str:'#e8e0c8', ar:'#f2e6c8', fl:'#d23a2e', gl:'#ffd86b', gls:'#b8861c', dw:'#b89060'};
/* a weapon look at angle a — its grip at the sprite's anchor (t = along it, o = across it, in texels) */
function wPaint(look,a,st,bl,pr,el){ const E=Math.ceil(bl+pr*1.4)+4, c=E, S=PS(E*2+1,E*2+1), ux=Math.cos(a), uy=Math.sin(a), C={}; for(const k in WPC) C[k]=cI(WPC[k]);
  const EP=(ELEM_PAL[el]||ELEM_PAL.frs).map(cI), P=(t,o)=>[c+ux*t-uy*o, c+uy*t+ux*o];
  const ln=(t0,o0,t1,o1,col,w)=>{ const A=P(t0,o0), B=P(t1,o1), n=Math.max(1,Math.ceil(Math.hypot(B[0]-A[0],B[1]-A[1])*2)); for(let i=0;i<=n;i++){ const f=i/n, x=A[0]+(B[0]-A[0])*f, y=A[1]+(B[1]-A[1])*f; if(w>1.3) psDisc(S,x,y,w/2,w/2,()=>col); else psP(S,x,y,col); } };
  const dot=(t,o,R,col)=>{ const q=P(t,o); psDisc(S,q[0],q[1],Math.max(0.6,R),Math.max(0.6,R),()=>col); }, poly=(pts,col)=>psPoly(S,pts.map(q=>P(q[0],q[1])),()=>col);
  const hand=()=>dot(0,0,Math.max(1,pr*0.28),C.sk), shaft=(t0,t1,col,w)=>ln(t0,0,t1,0,col,w);
  switch(look){
    case 'sword': shaft(-pr*0.35,0,C.gr,pr*0.22); ln(pr*0.18,-pr*0.36,pr*0.18,pr*0.36,C.gd,pr*0.18); shaft(pr*0.2,bl,C.st,pr*0.3); ln(pr*0.24,-pr*0.08,bl-1.2,-pr*0.08,C.ed,1); break;   // grip · brass guard · the blade & its bright edge
    case 'axe': shaft(-pr*0.3,bl,C.wd,pr*0.22); poly([[bl-pr*0.5,0.8],[bl-pr*0.8,pr*0.8],[bl+pr*0.18,pr*0.92],[bl+pr*0.2,0.8]],C.ir); ln(bl-pr*0.75,pr*0.82,bl+pr*0.15,pr*0.9,C.irl,1);   // the haft · a bearded head, its edge bright
      poly([[bl-pr*0.28,-0.5],[bl-pr*0.12,-pr*0.4],[bl+0.5,-0.5]],C.dk); break;
    case 'maul': shaft(-pr*0.4,bl,C.wd,pr*0.26); poly([[bl-pr*0.36,-pr*0.62],[bl+pr*0.36,-pr*0.62],[bl+pr*0.36,pr*0.62],[bl-pr*0.36,pr*0.62]],C.ir); ln(bl-pr*0.3,-pr*0.56,bl-pr*0.3,pr*0.56,C.irl,1); ln(bl+pr*0.3,-pr*0.56,bl+pr*0.3,pr*0.56,C.dk,1); break;
    case 'anchor': shaft(-pr*0.4,bl,C.ir,pr*0.22); ln(bl-pr*0.95,-pr*0.45,bl-pr*0.95,pr*0.45,C.ir,pr*0.2); dot(-pr*0.45,0,pr*0.2,C.irl);   // the shank · its stock · the ring
      for(let i=0;i<14;i++){ const f0=-1.55+i/14*3.1, f1=f0+3.1/14; ln(bl-pr*0.5+Math.cos(f0)*pr*0.6,Math.sin(f0)*pr*0.6,bl-pr*0.5+Math.cos(f1)*pr*0.6,Math.sin(f1)*pr*0.6,C.ir,pr*0.22); }   // the arms curving back
      dot(bl-pr*0.5,-pr*0.62,pr*0.2,C.irl); dot(bl-pr*0.5,pr*0.62,pr*0.2,C.irl); break;                                                     // (the flukes)
    case 'spear': shaft(-pr*0.9,bl-pr*0.45,C.wd,pr*0.18); poly([[bl+0.5,0],[bl-pr*0.6,-pr*0.25],[bl-pr*0.42,0],[bl-pr*0.6,pr*0.25]],C.st); ln(bl-pr*0.45,-pr*0.08,bl,0,C.ed,1); dot(bl-pr*0.55,0,pr*0.13,C.gd); break;
    case 'trident': shaft(-pr*0.9,bl-pr*0.5,C.wd,pr*0.18); ln(bl-pr*0.55,-pr*0.4,bl-pr*0.55,pr*0.4,C.gl,pr*0.16);
      for(const o of [-pr*0.4,0,pr*0.4]) ln(bl-pr*0.55,o,o?bl-pr*0.1:bl,o,o?C.gls:C.gl,pr*0.15); break;
    case 'harpoon': shaft(-pr*0.8,bl-pr*0.55,C.gr,pr*0.24); poly([[bl+0.5,0],[bl-pr*0.72,-pr*0.32],[bl-pr*0.55,0],[bl-pr*0.72,pr*0.32]],C.ir); ln(bl-pr*0.55,-pr*0.1,bl,0,C.irl,1);
      ln(bl-pr*0.72,-pr*0.32,bl-pr*1.0,-pr*0.12,C.ir,1); ln(bl-pr*0.72,pr*0.32,bl-pr*1.0,pr*0.12,C.ir,1); dot(-pr*0.8,0,pr*0.16,C.str); break;   // (barbed · a line's ring at its butt)
    case 'dagger': shaft(-pr*0.22,0,C.gr,pr*0.2); ln(pr*0.12,-pr*0.22,pr*0.12,pr*0.22,C.gd,1); shaft(pr*0.14,bl,C.st,pr*0.22); ln(pr*0.18,-0.4,bl-1,-0.4,C.ed,1); break;
    case 'bow': { const Q=-pr*0.3, Rb=bl, e0=[Q+Math.cos(-1.15)*Rb, Math.sin(-1.15)*Rb], e1=[Q+Math.cos(1.15)*Rb, Math.sin(1.15)*Rb], N=st?-pr*(st===2?0.55:0.28):null;   // the bow's limbs · the string (drawn: a V to your cheek & an arrow nocked)
      for(let i=0;i<16;i++){ const f0=-1.15+i/16*2.3, f1=f0+2.3/16; ln(Q+Math.cos(f0)*Rb,Math.sin(f0)*Rb,Q+Math.cos(f1)*Rb,Math.sin(f1)*Rb,C.wd,pr*0.22); }
      ln(Q+Math.cos(-0.5)*Rb+0.6,Math.sin(-0.5)*Rb,Q+Math.cos(0.5)*Rb+0.6,Math.sin(0.5)*Rb,C.wdl,1);
      if(N==null) ln(e0[0],e0[1],e1[0],e1[1],C.str,1); else { ln(e0[0],e0[1],N,0,C.str,1); ln(N,0,e1[0],e1[1],C.str,1); ln(N,0,Q+Rb+pr*0.25,0,C.ar,1); psP(S,...P(Q+Rb+pr*0.35,0),C.ed); ln(N+0.5,-1,N+pr*0.3,-1,C.fl,1); ln(N+0.5,1,N+pr*0.3,1,C.fl,1); }
      break; }
    case 'staff': shaft(-pr*0.7,bl,C.wd,pr*0.22); ln(-pr*0.6,-pr*0.08,bl-1,-pr*0.08,C.wdl,1); dot(bl,0,pr*0.3,C.dw); dot(bl+pr*0.12,0,pr*0.2,EP[1]); { const q=P(bl+pr*0.05,-pr*0.1); psP(S,q[0],q[1],EP[2]); } break;   // (the gem in its element's colour)
    case 'wand': shaft(-pr*0.25,bl,C.dw,pr*0.15); dot(bl,0,pr*0.22,EP[1]); { const q=P(bl-0.3,-0.6); psP(S,q[0],q[1],EP[2]); } break; }
  hand(); psOut(S,C.K,false); return psCrop(S,c,c); }
/* an off-hand piece at facing a: a shield strapped to your far arm (anchor: your off hand) · a quiver on your back · a focus glowing in your off hand */
function oPaint(look,a,pr){ const E=Math.ceil(pr*1.6)+3, c=E, S=PS(E*2+1,E*2+1), ux=Math.cos(a), uy=Math.sin(a), P=(t,o)=>[c+ux*t-uy*o, c+uy*t+ux*o], C={}; for(const k in WPC) C[k]=cI(WPC[k]);
  const poly=(pts,col)=>psPoly(S,pts.map(q=>P(q[0],q[1])),()=>col), dot=(t,o,R,col)=>{ const q=P(t,o); psDisc(S,q[0],q[1],Math.max(0.6,R),Math.max(0.6,R),()=>col); };
  if(look==='buckler'){ dot(0,-pr*0.05,pr*0.44,C.gd); dot(0,-pr*0.05,pr*0.34,C.wd); dot(0,-pr*0.05,pr*0.12,C.irl); }
  else if(look==='kite'){ poly([[pr*0.62,-pr*0.05],[pr*0.05,-pr*0.36],[-pr*0.55,-pr*0.05],[pr*0.05,pr*0.26]],cI('#3a64a0')); poly([[pr*0.5,-pr*0.07],[pr*0.02,-pr*0.1],[-pr*0.4,-pr*0.07],[pr*0.02,-pr*0.02]],C.gl); }
  else if(look==='tower'){ poly([[pr*0.62,-pr*0.32],[pr*0.62,pr*0.12],[-pr*0.58,pr*0.12],[-pr*0.58,-pr*0.32]],C.wd); poly([[pr*0.5,-pr*0.12],[pr*0.5,-pr*0.06],[-pr*0.46,-pr*0.06],[-pr*0.46,-pr*0.12]],C.ir); }
  else if(look==='quiver'){ const t0=-pr*0.55, o0=-pr*0.38; for(let i=0;i<=10;i++){ const f=i/10; dot(t0-f*pr*0.75,o0-f*pr*0.1,pr*0.17,C.gr); }   // (behind your shoulder, its fletchings peeking)
    for(const d of [-1,0,1]){ const q=P(t0+pr*0.18,o0+d*1.2); psP(S,q[0],q[1],C.fl); } }
  else { const cf=look==='cfocus'; dot(0,0,pr*0.3,cI(cf?'#f0b8a0':'#6fe0c0')); dot(-pr*0.08,-pr*0.08,pr*0.1,cI(cf?'#fff0e8':'#e8fff8')); if(cf){ const q=P(pr*0.12,pr*0.1); psP(S,q[0],q[1],cI('#a0584a')); } }
  psOut(S,C.K,false); return psCrop(S,c,c); }
function drawExplorerSprite(armed){
  if(armed && islPixOn) return drawExplorerPix();                   // the crawl: the baked pixel explorer on the one grid
  const s=islScale();
  const [pxp,pyp0]=iw2p(player.x,player.y), pr=player.r*s;
  const spin=armed && player.spinT>0, spinA=spin ? player.atkA+(1-player.spinT/(player.spinL||0.34))*TAU*1.25 : 0;   // the special: you spin 1¼ turns (the Whirl's crescent follows the same angle)
  const pfa=spin ? spinA : (armed && player.aimT>0) ? player.atkA : Math.atan2(player.fy,player.fx), pfx=Math.cos(pfa), pfy=Math.sin(pfa);   // mid-attack you face the blow
  const wph=itime*11.5, stride=player.moving? Math.sin(wph)*pr*0.55 : 0;
  const vl=armed?Math.hypot(player.velX||0,player.velY||0):0, tvx=vl>1?player.velX/vl:pfx, tvy=vl>1?player.velY/vl:pfy;   // legs stride the way you TRAVEL (strafing / kiting) — ashore only; towns & rooms stride along your facing
  const bob = player.moving ? Math.abs(Math.sin(wph))*1.1*s : 0;
  pctx.fillStyle='rgba(0,20,10,.28)'; pctx.beginPath(); pctx.ellipse(pxp,pyp0+pr*0.6,pr,pr*0.5,0,0,TAU); pctx.fill();
  const blink=(armed && (player.invul>0 || player.invulH>0) && !spin && Math.floor(itime*18)%2);   // (only heavy-hit / dash grace — swarm chip uses graceL and never blinks; the special's grace doesn't flicker the spin)
  if(blink) pctx.globalAlpha=0.4; else if(armed && player.hid) pctx.globalAlpha=0.6;   // grace = a see-through flicker; you never lose your facing or your blade (PT1 K9a: hidden in the grass — see-through)
  paintExplorer(pctx,pxp,pyp0,pr,pfa,stride,bob,tvx,tvy,null,false,false);   // (C5a: the body alone — the weapon is its own layer)
  if(armed){ const S=stats(), look=wLook(S), Wp=(spin && player.spinK==='whirl') ? {a:pfa, lg:0, st:0} : wPose(pfa,pr), ai=((Math.round(Wp.a/(TAU/32))%32)+32)%32, W=wSpr(look,ai,Wp.st,wLen(look,pr,pr),pr,S.el), wa=ai*TAU/32;   // (Graphics LOW: the same weapon sprites at your hand)
    pctx.drawImage(W.cv, Math.round(pxp+Math.cos(wa)*pr*0.95+pfx*Wp.lg)-W.ax, Math.round(pyp0-bob+Math.sin(wa)*pr*0.95+pfy*Wp.lg+(Wp.dy||0))-W.ay); }   // (STEEL: the sweep's blade low)
  if(armed){
    // subtle aim tick (the old navy arrow, shrunk to a whisper)
    pctx.fillStyle='rgba(255,255,255,.5)';
    pctx.beginPath(); pctx.moveTo(pxp+pfx*pr*1.55, pyp0-bob+pfy*pr*1.55);
    pctx.lineTo(pxp+Math.cos(pfa+2.7)*pr*1.2, pyp0-bob+Math.sin(pfa+2.7)*pr*1.2);
    pctx.lineTo(pxp+Math.cos(pfa-2.7)*pr*1.2, pyp0-bob+Math.sin(pfa-2.7)*pr*1.2);
    pctx.closePath(); pctx.fill();
  }
  pctx.globalAlpha=1;
}
const PSPR={cv:document.createElement('canvas'), sz:0, c:0, m:new Map(), cap:600, s:0, k:0, a:-1, bk:0, wi:0, wk:'', wj:0};   // the crawl explorer's paint board & its baked BODY looks (LRU) · bk: bakes made · wi / wk+wj: the warm-up's place
PSPR.ctx=PSPR.cv.getContext('2d',{willReadFrequently:true});
const PSPR_R=[[26,16,8,255,0],[255,244,214,140,0]], XR4=[[-1,0],[1,0],[0,-1],[0,1]];              // the dark SNES line · a pale rim outside it (you read on dark ground, on sand & in a crowd)
/* the BODY look (C5a): facing (16) × walk frame (6 + standing) × stride axis — the 8 travel ways fold onto 4 (a stride the other way is the walk half a
   cycle on; standing has no stride) → at most 400 looks, none holding a weapon */
function plBody(fi,wf,ti,pr,s,k){ if(wf<0) ti=0; else if(ti>=4){ ti-=4; wf=(wf+3)%6; }
  const key=(fi*7+wf+1)*4+ti; let C=PSPR.m.get(key);
  if(C){ if(PSPR.m.size>PSPR.cap*0.7){ PSPR.m.delete(key); PSPR.m.set(key,C); } return C; }
  const pfa=fi*TAU/16, wph=wf<0?0:(wf+0.5)/6*TAU, stride=wf<0?0:Math.sin(wph)*pr*0.55, bob=wf<0?0:Math.round(Math.abs(Math.sin(wph))*1.1*s*k), tva=ti*TAU/8, need=Math.ceil(pr*2.6)+4;
  if(2*need>PSPR.sz){ PSPR.sz=2*need; PSPR.c=need; PSPR.cv.width=PSPR.cv.height=PSPR.sz; }
  const g=PSPR.ctx, c=PSPR.c; g.clearRect(0,0,PSPR.sz,PSPR.sz);
  if(!spr2Player(g,c,c,pr,pfa,wf)) paintExplorer(g,c,c,pr,pfa,stride,bob,Math.cos(tva),Math.sin(tva),null,0,true);   // (PX A2) the pixel explorer (Sprites 2.0) · artSpr 0 → the old body
  C=pixBake(g,PSPR.sz,c,PSPR_R,0)||PIX_NONE; PSPR.bk++;
  if(PSPR.m.size>=PSPR.cap){ let n=0; for(const kk of PSPR.m.keys()){ PSPR.m.delete(kk); if(++n>=100) break; } }
  PSPR.m.set(key,C); return C; }
/* THE WARM-UP: a crawl's first breaths bake every body look (4 a frame) and every angle of the weapon & off-hand in hand (12 a frame) — after it no look
   is ever baked mid-fight (§16 C5a (4)) · a new weapon warms its own looks the same way */
function plWarm(pr,s,k,prk,S){ const t0=performance.now(), T=0.45;                                          // (a budget of 0.45 ms a frame: a body look ≈ 0.15 ms, a weapon angle ≈ 0.1 ms)
  const look=wLook(S), ol=offLook(), el=S.el, wk=look+'|'+ol+'|'+el+'|'+Math.round(pr*8)+'|'+reachMul().toFixed(3); if(PSPR.wk!==wk){ PSPR.wk=wk; PSPR.wj=0; }
  const bl=wLen(look,pr,prk), dl=wLen('dagger',pr,prk), sts=look==='bow'?3:1, nW=32*sts, nO=ol?(ol==='dagger'?32:16):0, nV=look!=='bow'?32:0, bw=wLen('bow',pr,prk);   // (nV: the bow the Volley conjures in a blade's hands)
  while(PSPR.wj<nW+nO+nV && performance.now()-t0<T){ const j=PSPR.wj++;                                         // the weapon in hand first (a swap reads at once)…
    if(j<nW) wSpr(look,j%32,(j/32)|0,bl,pr,el); else if(j<nW+nO){ if(ol==='dagger') wSpr('dagger',j-nW,0,dl,pr,''); else wSpr('o:'+ol,j-nW,0,0,pr,''); } else wSpr('bow',j-nW-nO,2,bw,pr,''); }
  while(PSPR.wi<16*7*4 && performance.now()-t0<T){ const i=PSPR.wi++, ti=i%4, wf=((i>>2)%7)-1, fi=(i/28)|0; if(wf<0 && ti) continue; const key=(fi*7+wf+1)*4+ti; if(!PSPR.m.has(key)) plBody(fi,wf,ti,pr,s,k); } }   // …then every body look
/* (PT2 X1) the crawl explorer's DRAWN facing (radians, before the 16-way snap): the special's 1¼-turn spin · an action faces its blow throughout · a shot's
   aim hold · else your aim (the cursor, the right stick or the keys — updateIsland keeps player.fx/fy on it every frame). The harness's facing regression reads this */
function plFaceA(){ const sT=player.spinT;
  if(sT>0) return player.atkA+(1-Math.min(sT,player.spinL||0.34)/(player.spinL||0.34))*TAU*1.25;
  return (player.act && player.act.slot!=='skill') ? player.act.a : player.aimT>0 ? player.atkA : Math.atan2(player.fy,player.fx); }
function drawExplorerPix(){
  const s=islScale(), k=ITUNE.pScale, pr=player.r*s*k, prk=pr/k, P=iw2p(player.x,player.y), X=Math.round(P[0]), Y=Math.round(P[1]);
  const spin=player.spinT>0;   // the special: you spin 1¼ turns (plFaceA)
  const fa0=plFaceA(), fi=((Math.round(fa0/(TAU/16))%16)+16)%16, pfa=fi*TAU/16;   // drawn facing: 16 ways, like the foes (an action faces its blow throughout)
  const wf=player.moving ? Math.floor(itime*11.5/TAU*6)%6 : -1, wph=wf<0?0:(wf+0.5)/6*TAU;   // the walk: 6 stop-motion frames a stride (~11 a second)
  const stride=wf<0?0:Math.sin(wph)*pr*0.55, bob=wf<0?0:Math.round(Math.abs(Math.sin(wph))*1.1*s*k);   // (the bob: a whole texel or none)
  const vl=Math.hypot(player.velX||0,player.velY||0), ti=vl>1 ? ((Math.round(Math.atan2(player.velY,player.velX)/(TAU/8))%8)+8)%8 : Math.round(fi/2)%8;   // legs stride the way you TRAVEL (8 ways)
  if(PSPR.s!==s || PSPR.k!==k || PSPR.a!==ITUNE.artSpr){ if(PSPR.a>=0 && PSPR.a!==ITUNE.artSpr){ escFlush(); SPR2.m.clear(); } PSPR.m.clear(); WSPR.m.clear(); PSPR.s=s; PSPR.k=k; PSPR.a=ITUNE.artSpr; PSPR.wi=0; PSPR.wk=''; }   // (a new texel or size: re-bake — and re-warm) · (PX1 FIX PX1VC-6: artSpr changed by a load or the PG's restore, not the slider — every look re-bakes)
  const C=plBody(fi,wf,ti,pr,s,k), S=stats(); plWarm(pr,s,k,prk,S);
  // THE WEAPON (its pose: §15's contract) · the Whirl holds it straight out · the Volley conjures a bow in your hands
  const Wp=(spin && player.spinK==='whirl') ? {a:fa0, lg:0, st:0, oa:pfa-0.75, olg:0} : wPose(pfa,prk); let look=wLook(S), wst=Wp.st;
  if(spin && player.spinK==='volley' && look!=='bow'){ look='bow'; wst=2; Wp.a=fa0; }
  const ai=((Math.round(Wp.a/(TAU/32))%32)+32)%32, wa=ai*TAU/32, W=wSpr(look,ai,wst,wLen(look,pr,prk),pr,S.el), fcx=Math.cos(pfa), fcy=Math.sin(pfa), bX=X+Math.round(fcx*(Wp.bl||0)), bY=Y+Math.round(fcy*(Wp.bl||0))+(Wp.bd||0);   // (STEEL) bX, bY: your body — the lunge leans it along your facing, the sweep crouches it a texel (else X, Y)
  const wx=bX+Math.round(Math.cos(wa)*pr*0.95+fcx*Wp.lg), wy=bY-bob+Math.round(Math.sin(wa)*pr*0.95+fcy*Wp.lg)+(Wp.dy||0);
  const T3=ITUNE.artSpr>0, ol=offLook(), ohx=bX+Math.round(fcy*pr-fcx*stride*0.5+(T3?fcx*pr*0.5:0)), ohy=bY-bob+Math.round(-fcx*pr*(T3?0.35:1)-fcy*stride*0.5);   // your OFF hand (the far side) · (PX A2) on the 3/4 pixel body it sits at the chest, a little toward your facing — never over your head (or at your boots)
  let O=null, ox=0, oy=0; if(ol==='dagger'){ const oi=((Math.round(Wp.oa/(TAU/32))%32)+32)%32; O=wSpr('dagger',oi,0,wLen('dagger',pr,prk),pr,''); ox=ohx+Math.round(fcx*Wp.olg); oy=ohy+Math.round(fcy*Wp.olg); }
  else if(ol){ O=wSpr('o:'+ol,fi,0,0,pr,''); if(ol==='quiver'){ ox=bX; oy=bY-bob; } else { ox=ohx; oy=ohy; } }
  const gy=Y+Math.round(pr*0.6), SHD=islShd(), sh=shadowSprC(Math.round(pr*1.02),Math.max(1,Math.round(pr*0.5)),SHD[0],Math.min(0.5,SHD[1]+0.05));
  pctx.drawImage(sh.cv,X-sh.ax,gy-sh.ay);                                                                         // your shadow (the ground's own shade)
  youRing(false);                                                                                                 // YOUR ring: cream, crisp — over every foe, under you (you're found at a glance)
  let crowd=false; if(ITUNE.pXray>0 && C!==PIX_NONE){ const x0=bX+C.ox, y0=bY+C.oy, x1=x0+C.w, y1=y0+C.h;          // a foe's look over yours → an x-ray rim: your silhouette in cream round the sprite
    for(const en of IEVIS){ const E=en._C; if(!E || E===PIX_NONE || en._ex==null || en.dead) continue; const ex=en._ex+E.ox, ey=en._ey+E.oy; if(ex<x1 && ex+E.w>x0 && ey<y1 && ey+E.h>y0){ crowd=true; break; } } }
  const blink=((player.invul>0 || player.invulH>0) && !spin && Math.floor(itime*18)%2);   // (only heavy-hit / dash grace — swarm chip never blinks; the special's spin doesn't flicker)
  pctx.imageSmoothingEnabled=false; PSPR.lc=C; PSPR.lx=bX; PSPR.ly=bY; PSPR.lb=blink;   // (the hero rim redraws this look over the dark — heroRim)
  if(player.dashT>0 && player.pdFree){ const cr=creamOf(C).cv, ddx=(player.dashX||0)*pr*0.55, ddy=(player.dashY||0)*pr*0.55;   // (PT2 X2) THE PERFECT DASH: three bright cream after-images, longer
    pctx.globalAlpha=0.62; pctx.drawImage(cr, Math.round(X-ddx*2)+C.ox, Math.round(Y-ddy*2)+C.oy); pctx.globalAlpha=0.4; pctx.drawImage(cr, Math.round(X-ddx*4)+C.ox, Math.round(Y-ddy*4)+C.oy);
    pctx.globalAlpha=0.2; pctx.drawImage(cr, Math.round(X-ddx*6.5)+C.ox, Math.round(Y-ddy*6.5)+C.oy); pctx.globalAlpha=1; }
  else if(player.dashT>0){ for(const [k,a] of [[2,0.34],[4,0.16]]){ pctx.globalAlpha=a; pctx.drawImage(C.cv, Math.round(X-(player.dashX||0)*k*pr*0.55)+C.ox, Math.round(Y-(player.dashY||0)*k*pr*0.55)+C.oy); } pctx.globalAlpha=1; }   // the dash: two see-through after-images trail you (whole texels)
  else { const A=player.act, g=(A && A.lx!=null && A.c && A.c.pose==='lunge') ? (A.ph==='act' ? 1 : A.ph==='rec' ? clamp(1-A.t/0.12,0,1) : 0) : 0; if(g>0){ for(const [q,a] of [[0.3,0.16],[0.65,0.34]]){ const P2=iw2p(A.lx+(player.x-A.lx)*q, A.ly+(player.y-A.ly)*q); pctx.globalAlpha=a*g; pctx.drawImage(C.cv, Math.round(P2[0])+C.ox, Math.round(P2[1])+C.oy); } pctx.globalAlpha=1; } }   // (STEEL) the LUNGE: two see-through after-images down the 22u it just stepped (the dash's look), gone 0.12 s into its recovery
  if(crowd){ const cr=creamOf(C); pctx.globalAlpha=(blink?0.4:1)*0.92; for(const q of XR4) pctx.drawImage(cr.cv, bX+C.ox+q[0], bY+C.oy+q[1]); }
  pctx.globalAlpha=blink?0.4:player.hid?0.6:1;                                                                    // (PT1 K9a: hidden in the tall grass — see-through)
  const back=ITUNE.artSpr>0 && fi>=11 && fi<=13 && Math.sin(wa)<-0.2;                                           // (PX A2) seen from behind (the U view) with the weapon raised up-screen: it rides BEHIND your back (the 0.2: no flicker at the horizontal)
  if(O && ol==='quiver') pctx.drawImage(O.cv, ox-O.ax, oy-O.ay);                                                  // (C5a) a quiver rides your back — under you
  const oB=back || (T3 && (fi>=14 || fi<=2));                                                                     // (PX A2) …and in the right profile the far hand is behind you: its piece draws under you
  if(O && ol!=='quiver' && oB) pctx.drawImage(O.cv, ox-O.ax, oy-O.ay);
  if(back) pctx.drawImage(W.cv, wx-W.ax, wy-W.ay);                                                                 // (PX A2) …the weapon under you
  pctx.drawImage(C.cv, bX+C.ox, bY+C.oy);
  if(player.pdFree && player.dashT>0 && itime-player.pdT<0.09){ const ga=pctx.globalAlpha; pctx.globalAlpha=0.85*(1-(itime-player.pdT)/0.09); pctx.drawImage(creamOf(C).cv, bX+C.ox, bY+C.oy); pctx.globalAlpha=ga; }   // (PT2 X2) the perfect dash's flash: you, lit cream for a breath
  if(O && ol!=='quiver' && !oB) pctx.drawImage(O.cv, ox-O.ax, oy-O.ay);                                            // the off-hand's piece on your far arm (a shield, a focus, a second dagger)
  if(!back) pctx.drawImage(W.cv, wx-W.ax, wy-W.ay);                                                                // THE WEAPON in your hand, posed (whole texels, never baked into you)
  pctx.globalAlpha=1;
  { const H=player.hv, A=player.act||(H&&H.A); if(A && A.gth && A.ph==='wind'){ const q=H?clamp(H.t/Math.max(0.05,+ITUNE.hvTime||0.55),0,1):A.t/Math.max(1e-3,A.wind); if(q>=0.5){ const L=Math.max(3,wLen(look,pr,prk)), tx=Math.round(wx+Math.cos(wa)*L), ty=Math.round(wy+Math.sin(wa)*L), big=q>=0.9 || A.W==='bow' || A.W==='staff' || A.W==='daggers', n=big?2:1;   // (PT1 K2) the finisher GATHERS: a white star on the weapon's tip from half its wind-up — a 2-texel cross flash at 90% (G6 fix: the bow's, the staff's & the twin stab's whole gather — their draws are short)
      pctx.fillStyle='#ffd86b'; if(big){ pctx.globalAlpha=0.5; pctx.fillRect(tx-3,ty,7,1); pctx.fillRect(tx,ty-3,1,7); } pctx.globalAlpha=big?0.75:0.45; pctx.fillRect(tx-1,ty-1,3,3); pctx.globalAlpha=1; pctx.fillStyle='#ffffff'; pctx.fillRect(tx-n,ty,2*n+1,1); pctx.fillRect(tx,ty-n,1,2*n+1); } } }
  if(player.hv){ const H=player.hv, q=clamp(H.t/Math.max(0.05,+ITUNE.hvTime||0.55),0,1), R=Math.round(pr*2.1)+2, cy=Y-bob+Math.round(pr*0.3);   // (PX H1) THE HEAVY's ring: gold as it fills (clockwise from the top), white & pulsing at full — one texel wide, on the grid
    if(H.full && LGT.on){ H._t=itime; H._x=X; H._y=cy; H._R=R; } else {                       // (PX2 FIX) in the dark the full ring waits for the light pass — drawn over it, so its white is never the lamp's peach
    pctx.fillStyle=H.full?'#ffffff':'#ffd23f'; pctx.globalAlpha=H.full?(0.55+0.35*Math.abs(Math.sin(itime*14))):0.5;
    if(q>0.01) pxSect(pctx,X,cy,R,R,-Math.PI/2+q*Math.PI,q*Math.PI); }                             // (pxSect: R0 = R1 → a one-texel arc round its mid-angle ± ah · ah ≥ π = the whole ring)
    pctx.globalAlpha=1; }
  const ax=Math.cos(fa0), ay=Math.sin(fa0), tr=pr*1.72, tx=Math.round(X+ax*tr), ty=Math.round(Y-bob+ay*tr);   // the aim tick: a whisper of three texels
  pctx.fillStyle='rgba(255,255,255,.55)'; pctx.fillRect(tx,ty,1,1);
  pctx.fillStyle='rgba(255,255,255,.3)'; pctx.fillRect(Math.round(tx-ax*1.4-ay*1.2),Math.round(ty-ay*1.4+ax*1.2),1,1); pctx.fillRect(Math.round(tx-ax*1.4+ay*1.2),Math.round(ty-ay*1.4-ax*1.2),1,1);
}
