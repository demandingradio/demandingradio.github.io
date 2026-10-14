"use strict";
/* FILE: js/data/decor_art.js
DECOR ART: the ship's decor painters, moved verbatim from original lines 30109-30907 (build 5109cd5).
One painter per decor id paints the piece texel by texel into a PS sheet (SNES-style ramps, the dark line round it) and
  returns tOut(...) with its anchor and optional seat/glass fields: the harbour set, trophies, keepsakes, the charter and
  pinboard, the town styles, figureheads, uniques and rewards, then the Seas and Depths keepsakes (SE5 landmarks, SE8 wonders).
Entry points: DECOR_ART (read through decorSpr, original line 30925 (build 5109cd5)) and decorFlip (mirrors a sheet; also
  used by the heir's chair, original line 31120 (build 5109cd5), and the saga art, original line 39716 (build 5109cd5)).
Globals it owns: decorFlip, DECOR_ART (const, original line 30111 (build 5109cd5)), SEAS_WSFR (const, original line 30806 (build 5109cd5)).
Main globals it reads from elsewhere, all inside painter bodies at paint time: the pixel-sheet kit cI, cIR, PS, psP, psOut,
  psCv, psLine, psDisc, psPoly (original lines 22820-22836 (build 5109cd5)); tRamp, tH, pR, OLC, tOut (TOWNS IN PIXELS,
  later in index.html); vnoise, clamp, mixHex, matPx, SHIP, FISH, DECOR_FACE, decorTurnPS; curios and museum (typeof-guarded).
Load-time statements (3), in this order: Object.assign(DECOR_ART, the SE5 keepsakes) (original line 30739 (build 5109cd5)),
  Object.assign(DECOR_ART, the SE8 keepsakes) (original line 30807 (build 5109cd5)) and DECOR_FR.ws_whirl=SEAS_WSFR
  (original line 30906 (build 5109cd5)); DECOR_FR is declared earlier in index.html (original line 30009 (build 5109cd5)).
Later at load index.html extends DECOR_ART again: the town-banner loop (original line 31023 (build 5109cd5)) and the
  INTROSTORY heir pieces (original line 31028 (build 5109cd5)), so this file must load before them.
The anchor comments MARK-SE5-1, MARK-SE8-0 and the SE8-ART start and end markers are kept verbatim.
*/
/* ---- the art: each piece painted texel by texel (SNES-style ramps, the dark line round it), anchored at its foot · rugs at their top-left ---- */
function decorFlip(S){ const w=S.w, d=S.d; for(let y=0;y<S.h;y++) for(let x=0;x<(w>>1);x++){ const i=y*w+x, j=y*w+w-1-x, t=d[i]; d[i]=d[j]; d[j]=t; } return S; }
const DECOR_ART={
  dc_chair:r=>{ const S=PS(14,21), W=tRamp('#7a5230'), f=DECOR_FACE[r&3];   // the oak ladder-back: 4 facings (a sitter's seat row → o.seat)
    if(f===0){ pR(S,2,1,2,12,W[3]); pR(S,2,1,1,12,W[4]); pR(S,10,1,2,12,W[1]); pR(S,11,1,1,12,W[0]); pR(S,2,1,2,1,W[5]); pR(S,10,1,2,1,W[3]);   // its back posts, capped
      pR(S,4,2,6,1,W[4]); pR(S,4,3,6,1,W[2]); for(const y of [5,7,9]){ pR(S,4,y,6,1,W[3]); psP(S,4,y,W[4]); psP(S,9,y,W[1]); }   // the top rail · three slats
      pR(S,2,11,10,2,W[3]); pR(S,2,11,10,1,W[2]); pR(S,1,13,12,1,W[4]); pR(S,1,14,12,1,W[5]); pR(S,1,15,12,1,W[1]);   // the seat · its lit front edge · its lip
      pR(S,3,16,1,2,W[0]); pR(S,10,16,1,2,W[0]); pR(S,1,16,1,4,W[3]); pR(S,12,16,1,4,W[1]); pR(S,2,18,10,1,W[1]);   // the back legs (further) · the front legs · a rung
      return Object.assign(tOut(S,7,20),{seat:11}); }
    if(f===1){ pR(S,2,10,10,3,W[3]); pR(S,2,10,10,1,W[4]); pR(S,4,13,1,4,W[0]); pR(S,9,13,1,4,W[0]);   // the seat beyond its back · its far legs
      pR(S,2,1,2,19,W[2]); pR(S,2,1,1,19,W[3]); pR(S,10,1,2,19,W[1]); pR(S,11,1,1,19,W[0]); pR(S,2,1,2,1,W[4]); pR(S,10,1,2,1,W[2]);   // the back posts, down to the planks
      pR(S,4,2,6,2,W[2]); pR(S,4,2,6,1,W[3]); for(const y of [5,7]) pR(S,4,y,6,1,W[2]); pR(S,4,9,6,1,W[1]); pR(S,4,16,6,1,W[1]);   // the rail, the slats' backs, the rung
      return Object.assign(tOut(S,7,20),{seat:99}); }
    pR(S,9,1,2,19,W[2]); pR(S,9,1,1,19,W[3]); pR(S,9,1,2,1,W[4]); for(const y of [3,6,9]) psP(S,8,y,W[1]);   // side on: the back post (the slats' ends) — facing left
    pR(S,2,11,9,1,W[4]); pR(S,2,12,9,1,W[3]); pR(S,2,13,9,1,W[1]);   // the seat
    pR(S,3,14,1,4,W[0]); pR(S,2,14,1,6,W[2]); pR(S,3,16,6,1,W[1]);   // the legs, a rung
    if(f===3) decorFlip(S); return Object.assign(tOut(S,7,20),{seat:11}); },
  dc_table:r=>{ const W=tRamp('#7a5230'), P=cIR(['#4a4e56','#7a808a','#a8aeb8','#d8dee6']);   // the trestle table, a pewter jug & a mug of ale
    const jug=(S,x,y)=>{ pR(S,x+1,y,3,1,P[3]); pR(S,x,y+1,5,6,P[2]); pR(S,x,y+1,1,6,P[3]); pR(S,x+4,y+1,1,6,P[1]); pR(S,x,y+6,5,1,P[1]); psP(S,x+5,y+2,P[1]); psP(S,x+6,y+3,P[1]); psP(S,x+6,y+4,P[1]); psP(S,x+5,y+5,P[1]); psP(S,x-1,y+1,P[2]); },
      mug=(S,x,y)=>{ pR(S,x,y,3,4,W[4]); pR(S,x,y,3,1,cI('#f4e0a8')); pR(S,x+2,y+1,1,3,W[2]); psP(S,x+3,y+1,W[2]); psP(S,x+3,y+2,W[2]); };
    if(r&1){ const S=PS(22,50);   // end on: the long top running away from you
      for(let y=6;y<40;y++) for(let x=3;x<19;x++){ const sm=x===8||x===13; psP(S,x,y, sm?W[2]:W[(x<5?4:3)-((tH(x*7,y>>2)<0.1)?1:0)]); }
      pR(S,3,40,16,1,W[5]); pR(S,4,41,14,2,W[1]); psLine(S,5,43,16,48,W[2],1); psLine(S,16,43,5,48,W[1],1); pR(S,4,43,14,1,W[2]); pR(S,4,48,14,1,W[1]);
      jug(S,8,9); mug(S,10,28); return tOut(S,11,49); }
    const S=PS(40,30);
    for(let y=9;y<15;y++) for(let x=2;x<38;x++){ const sm=y===11||y===13; psP(S,x,y, sm?W[2]:W[3+((tH(x>>2,y*5)<0.14)?1:0)]); }   // three top boards (their seams)
    pR(S,2,15,36,1,W[5]); pR(S,3,16,34,2,W[1]);   // the lit front edge · the apron
    for(const x0 of [6,28]){ psLine(S,x0,18,x0+5,27,W[2],1); psLine(S,x0+5,18,x0,27,W[1],1); pR(S,x0-1,18,8,1,W[3]); pR(S,x0-1,27,8,2,W[1]); }   // the X trestles
    pR(S,11,22,17,1,W[1]); jug(S,9,4); mug(S,26,8); return tOut(S,20,29); },
  dc_barrel:()=>{ const S=PS(14,18), B=tRamp('#8a5c34'), H=cI('#3a3434'), Lw=tRamp('#a8784a'), Ir=cIR(['#4a4848','#8a8a90']);   // the water butt (the town's barrel), its lid & a ladle
    for(let y=6;y<17;y++) for(let x=2;x<12;x++){ if(y===16 && (x<3||x>10)) continue; const v=x<4?4:x>9?1:x===4?4:(x&1)?3:2; psP(S,x,y,B[v]); }
    pR(S,2,9,10,1,H); pR(S,2,14,10,1,H); psP(S,3,9,cI('#6a6868')); psP(S,3,14,cI('#6a6868'));   // the hoops
    psDisc(S,7,6,5,1.9,(nx,ny)=>ny<-0.25?Lw[5]:ny<0.4?Lw[4]:Lw[2]); pR(S,6,5,2,1,Lw[1]);   // the lid, a knob
    psLine(S,10,0,9,5,Ir[1],1); psP(S,10,0,Ir[0]); pR(S,7,5,3,1,Ir[0]); return tOut(S,7,17); },
  dc_lantern:()=>{ const S=PS(12,25), I=cIR(['#1e1a1a','#3a3434','#5a5658']), Br=tRamp('#c8983e'), Gl=cIR(['#d8c8a0','#f4e6c0','#fffaf0']);   // a brass ship's lantern on its iron post (its glass glows after dark)
    pR(S,3,22,6,1,I[1]); pR(S,2,23,8,1,I[0]); pR(S,5,13,2,9,I[1]); pR(S,5,13,1,9,I[2]);   // the foot & the post
    pR(S,5,0,2,1,Br[2]); pR(S,4,1,4,1,Br[3]); pR(S,3,2,6,1,Br[4]); pR(S,2,3,8,1,Br[2]);   // its ring & its cap
    pR(S,2,4,8,8,Br[3]); pR(S,2,4,1,8,Br[4]); pR(S,9,4,1,8,Br[1]); pR(S,3,5,6,6,Gl[1]); pR(S,3,5,1,6,Gl[2]); pR(S,8,5,1,6,Gl[0]);   // the brass cage · its cream panes
    pR(S,5,8,2,3,cI('#f8f4e8')); psP(S,5,7,cI('#ffcf5a')); psP(S,6,7,cI('#ffe9a0'));   // a candle within
    pR(S,2,12,8,1,Br[1]); pR(S,3,11,6,1,Br[2]); return Object.assign(tOut(S,6,24),{gx:6, gy:7}); },
  dc_rug_navy:r=>{ const w=r&1?40:60, h=r&1?60:40, S=PS(w,h), N=tRamp('#2a3e62'), G=tRamp('#d8a840'), Cr=cIR(['#c8bc9a','#f4efe0']), cx=w/2, cy=h/2;   // navy wool, a gold border, a compass rose
    for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const e=Math.min(x-1,y-1,w-2-x,h-2-y); let c;
      if(e===0) c=N[1]; else if(e<=2) c=G[e===1?4:2]; else if(e===3) c=N[1];
      else { const dd=Math.hypot(x+0.5-cx,y+0.5-cy); c=N[((x*3+y*7)%5===0)?2:3]; if(dd<6.6 && dd>=5.4) c=Cr[1]; else if(dd<5.4 && dd>=4.5) c=G[2]; }
      psP(S,x,y,c); }
    for(const [ux,uy] of [[0,-1],[0,1],[-1,0],[1,0]]) for(let t=0;t<=7;t++){ const wd=Math.round((7-t)*0.4); for(let k=-wd;k<=wd;k++) psP(S,Math.floor(cx+ux*t+(uy?k:0)),Math.floor(cy+uy*t+(ux?k:0)), k<0?G[4]:k>0?G[1]:Cr[1]); }   // the rose's four great points
    for(const [ux,uy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) for(let t=1;t<=4;t++) psP(S,Math.floor(cx+ux*t*0.75),Math.floor(cy+uy*t*0.75),Cr[t<3?1:0]);   // and four small ones
    pR(S,Math.floor(cx)-1,Math.floor(cy)-1,2,2,G[5]); return psCv(psOut(S,cI(OLC),false),0,0); },
  dc_crates:()=>{ const S=PS(18,24), C=tRamp('#9a7040'), K=cI('#3a2414');   // two cargo crates, a stencilled anchor
    const cr=(x,y,w,h,t)=>{ pR(S,x,y,w,t,C[4]); pR(S,x,y,w,1,C[5]); for(let i=x+3;i<x+w-1;i+=4) pR(S,i,y,1,t,C[3]);
      pR(S,x,y+t,w,h-t,C[2]); pR(S,x,y+t,1,h-t,C[3]); pR(S,x+w-1,y+t,1,h-t,C[1]); pR(S,x,y+t,w,1,C[1]); pR(S,x,y+h-1,w,1,C[1]); psLine(S,x+1,y+h-2,x+w-2,y+t+1,C[3],1); };
    cr(2,11,14,12,3); cr(4,2,10,10,3); const A=DECOR_DEV.anchor; for(let j=0;j<5;j++) for(let i=0;i<5;i++) if(A[j][i]==='#') psP(S,7+i,16+j,K);
    return tOut(S,9,23); },
  dc_bell:()=>{ const S=PS(16,18), I=cIR(['#2a2626','#4a4848','#6a6868']), Br=tRamp('#c8983e'), Rp=cIR(['#8a7a58','#c8b890']);   // a brass bell on an iron bracket, a rope at its clapper
    pR(S,1,0,2,6,I[1]); psP(S,1,0,I[2]); pR(S,3,1,7,2,I[1]); pR(S,3,1,7,1,I[2]); psP(S,10,2,I[0]); psP(S,10,3,I[1]);
    [[7,9],[6,10],[6,10],[5,11],[5,11],[5,11],[4,12],[3,13]].forEach(([a,b],j)=>{ for(let x=a;x<=b;x++){ const u=(x-a)/Math.max(1,b-a); psP(S,x,3+j, u<0.22?Br[5]:u<0.5?Br[4]:u<0.8?Br[3]:Br[1]); } });
    pR(S,3,11,11,1,Br[2]); pR(S,4,12,9,1,Br[1]); psP(S,8,13,I[1]); pR(S,8,14,1,2,Rp[1]); pR(S,7,16,3,1,Rp[0]); return tOut(S,8,17); },
  dc_chart:()=>{ const S=PS(36,20), Wd=tRamp('#5a3a22'), Pp=cIR(['#b8a070','#e3d5a8','#f4ead0']), Sea=cIR(['#6a8aa8','#7a9ab8','#a8c4d4']), Ld=cIR(['#6a7a42','#8a9a5a','#b8b87a']), Rd=cI('#c0202a');   // a sea chart in a walnut frame
    pR(S,1,1,34,18,Wd[2]); pR(S,1,1,34,1,Wd[4]); pR(S,1,1,1,18,Wd[3]); pR(S,34,1,1,18,Wd[1]); pR(S,1,18,34,1,Wd[1]); pR(S,2,2,32,16,Wd[1]);
    for(let y=3;y<17;y++) for(let x=3;x<33;x++){ let c; if(y===3||y===16||x===3||x===32) c=Pp[0]; else { const n=vnoise(x/6+3.1,y/4+7.7); c=n>0.6?Ld[n>0.68?2:1]:n>0.565?Ld[0]:Sea[((x*5+y*3)%11===0)?2:1]; if(tH(x*3,y)<0.02) c=Pp[2]; } psP(S,x,y,c); }
    psP(S,29,5,Pp[2]); psP(S,28,6,Pp[2]); psP(S,30,6,Pp[2]); psP(S,29,7,Pp[2]); psP(S,29,6,Rd);   // a compass mark
    for(let i=0;i<5;i++) psP(S,8+i*3,12-i,Rd); psP(S,23,7,Rd); psP(S,24,8,Rd); psP(S,22,8,Rd); return tOut(S,18,19); },   // a red course, an X
  dc_fern:()=>{ const S=PS(22,22), T=tRamp('#b8603a'), G=cIR(['#2e6a32','#4e9a42','#86cc5e']), Sl=cI('#3a2414');   // a potted fern, its fronds fanning
    const A=[-2.85,-2.45,-2.0,-1.57,-1.14,-0.69,-0.29], Ln=[8,10,10,11,10,10,8];
    A.forEach((a,i)=>{ const n=Ln[i]; for(let t=1;t<=n;t++){ const u=t/n, x=11+Math.cos(a)*t, y=12+Math.sin(a)*t*0.8+u*u*4; psP(S,x,y,G[1]); if(t>1 && t<n){ const k=t&1?1:-1; psP(S,x-Math.sin(a)*k*1.2,y+Math.cos(a)*k*0.8,G[t%3===0?0:2]); } } });
    for(let y=15;y<21;y++){ const ins=Math.floor((y-15)*0.5); for(let x=7+ins;x<=14-ins;x++) psP(S,x,y,T[x-ins<9?4:x+ins>13?1:3]); }   // the pot, tapering
    pR(S,6,13,10,2,T[3]); pR(S,6,13,10,1,T[5]); pR(S,7,14,8,1,Sl); pR(S,8,17,6,1,T[2]); return tOut(S,11,21); },
  dc_telescope:()=>{ const S=PS(20,26), W=tRamp('#7a5230'), Br=tRamp('#c8983e'), I=cI('#2a2626');   // a brass telescope on its tripod, angled up at the horizon
    psLine(S,10,12,11,21,W[0],1); psLine(S,10,12,16,24,W[1],1); psLine(S,10,12,4,24,W[2],1); psLine(S,9,12,3,24,W[4],1);   // the tripod (its far leg shorter)
    pR(S,8,10,4,3,W[3]); pR(S,8,10,4,1,W[4]);
    for(let t=0;t<=12;t++){ const x=4+t, y=Math.round(15-t*0.85); psP(S,x,y-1,Br[4]); psP(S,x,y,Br[3]); psP(S,x,y+1,Br[1]); }   // the tube
    pR(S,15,2,3,4,Br[2]); pR(S,15,2,1,4,Br[4]); psP(S,17,2,cI('#ffffff')); pR(S,2,15,3,2,I); psP(S,9,7,Br[5]); psP(S,9,8,Br[5]); return tOut(S,10,25); },   // its objective (a glint) · the eyepiece · a band
  dc_bookcase:()=>{ const S=PS(42,48), Wd=tRamp('#4a3320'), cols=['#7a4a5a','#4a6a52','#5a6a8a','#8a6a3a','#6a4a7a','#9a3a2a','#3a5a6a','#a8843a'];   // a bookcase, two wide: coloured spines, a ship in a bottle, a pot plant
    pR(S,1,1,40,46,Wd[2]); pR(S,1,1,40,2,Wd[4]); pR(S,1,1,2,46,Wd[3]); pR(S,39,1,2,46,Wd[1]); pR(S,3,3,36,43,Wd[0]);
    for(const sy of [3,17,31]){ pR(S,3,sy+12,36,2,Wd[4]); pR(S,3,sy+13,36,1,Wd[2]); let x=4; const skip=sy===3?20:sy===17?30:-9;
      while(x<37){ if(x>=skip && x<skip+7){ x=skip+7; continue; } const bw=2+((x*3+sy)%3), bh=7+((x+sy)%4), c=tRamp(cols[(x*7+sy)%cols.length]); if(x+bw>38) break;
        pR(S,x,sy+12-bh,bw,bh,c[3]); pR(S,x,sy+12-bh,1,bh,c[4]); psP(S,x+bw-1,sy+12-bh,c[1]); pR(S,x,sy+14-bh,bw,1,cI('#e8d8a8')); x+=bw+((x+sy)%9===0?1:0); } }
    pR(S,21,10,6,4,cI('#3a6a5a')); pR(S,21,10,6,1,cI('#8ac8b0')); pR(S,19,11,2,2,cI('#3a6a5a')); pR(S,23,8,1,2,cI('#e8dcc0')); psP(S,24,9,cI('#e8dcc0'));   // a ship in a bottle
    pR(S,31,24,5,4,cI('#a85a3a')); pR(S,31,24,5,1,cI('#c8784a')); psP(S,32,22,cI('#4e9a42')); psP(S,34,21,cI('#86cc5e')); psP(S,33,23,cI('#4e9a42')); psP(S,35,23,cI('#4e9a42'));   // a pot plant
    pR(S,1,46,40,1,Wd[1]); return tOut(S,21,47); },
  /* (PT1 B6b) the trophies · the keepsakes · the Guild's charter · the pinboard — the banners share decorBannerArt (THE SHIP'S DECOR I-b) */
  tr_boar:()=>{ const S=PS(38,23), Wd=tRamp('#6a4428'), Iv=cIR(['#7a6a4c','#b0a080','#d8ccae','#f2eada','#fffcf4']), Br=tRamp('#c8983e');   // the Great Boar's tusks, crossed on an oak shield, a brass plate
    psDisc(S,19,11,10,9.6,(nx,ny,x,y)=>{ const e=nx*nx+ny*ny; return e>0.8?Wd[1]:e>0.62?(nx+ny<0?Wd[4]:Wd[2]):Wd[ny<-0.55?4:(y*5+(x>>2))%7===0?2:3]; });   // the shield: its rim, a bevel lit from the top-left, the grain
    const tusk=(x0,y0,x1,y1,x2,y2)=>{ const P=[]; for(let i=0;i<=70;i++){ const t=i/70, u=1-t; P.push([u*u*x0+2*u*t*x1+t*t*x2, u*u*y0+2*u*t*y1+t*t*y2, Math.max(0.6,3.2*Math.pow(u,0.85)+0.6), t<0.12?Br:null, t]); }   // (G18 FIX: a fat ivory crescent curling up to its point — read as tusks, not sabres · a brass collar at the root)
      for(const [x,y,r,C] of P) psDisc(S,x+0.4,y+0.5,r+0.2,r+0.2,()=>C?C[0]:Iv[0]);
      for(const [x,y,r,C] of P) psDisc(S,x,y,r,r,()=>C?C[2]:Iv[1]);
      for(const [x,y,r,C] of P){ const q=Math.max(0.5,r-0.8); psDisc(S,x-0.35,y-0.35,q,q,()=>C?C[4]:Iv[3]); }
      for(const [x,y,r,C] of P) if(r>1.3 && !C) psP(S,x-r*0.4,y-r*0.6,Iv[4]);
      for(const [x,y,r,C,t] of P) if(C && t>0.03 && t<0.11 && Math.round(t*70)%3===0) psP(S,x,y,C[1]); };
    tusk(27,19,7,21,9,3); tusk(11,19,31,21,29,3);   // (the far one first — they cross low behind the plate)
    pR(S,14,18,11,3,Br[3]); pR(S,14,18,11,1,Br[5]); pR(S,14,20,11,1,Br[1]); pR(S,16,19,7,1,Br[2]); psP(S,15,19,Br[1]); psP(S,23,19,Br[1]);   // the brass plate, its engraving, two pins
    return tOut(S,19,22); },
  tr_brood:()=>{ const S=PS(40,40), V=tRamp('#7a4ac8'), Tb=tRamp('#7a5230');   // the Broodmother's shell — a glossy violet carapace on a timber stand
    pR(S,5,30,30,3,Tb[4]); pR(S,5,30,30,1,Tb[5]); pR(S,5,33,30,2,Tb[2]); pR(S,5,35,30,1,Tb[1]); pR(S,7,36,3,3,Tb[2]); pR(S,7,36,1,3,Tb[3]); pR(S,30,36,3,3,Tb[1]);   // the stand: its top, its apron, two stout feet
    psDisc(S,20,19,15,12.5,(nx,ny,x)=>{ const e=nx*nx+ny*ny, l=-0.55*nx-0.75*ny+0.5*Math.sqrt(Math.max(0,1-e)); let c=e>0.88?V[1]:V[l>0.78?5:l>0.5?4:l>0.15?3:l>-0.2?2:1];
      if(Math.abs(e-0.36)<0.035 || Math.abs(e-0.66)<0.03) c=V[2]; else if(Math.abs(e-0.31)<0.03 || Math.abs(e-0.61)<0.03) c=V[l>0.3?5:4];   // two growth ridges, each with a lit lip
      if(x===20 && e<0.92) c=V[0]; else if(x===21 && e<0.86) c=V[l>0.4?4:3];   // the seam between its wing-cases
      return c; });
    for(const [x,y] of [[12,11],[13,11],[11,12],[12,12],[14,10],[26,13]]) psP(S,x,y,cI('#f4ecff'));   // a hard glint
    for(const [x,y] of [[5,23],[4,24],[35,23],[36,24],[8,28],[7,29],[32,28],[33,29]]) psP(S,x,y,V[1]);   // little spurs at its rim
    return tOut(S,20,39); },
  tr_packking:r=>{ const W=60, H=40, S=PS(W,H), F=tRamp('#66768e'), m=new Uint8Array(W*H), inE=(x,y,cx,cy,rx,ry)=>((x+0.5-cx)/rx)**2+((y+0.5-cy)/ry)**2<=1;   // the Pack King's pelt, spread flat: its head at one end, a notched ear, a ragged fur edge
    const B=[[34,20,19,12],[22,7,3.6,5.6],[22,33,3.6,5.6],[45,7.5,3.6,5.2],[45,32.5,3.6,5.2],[55,20,4.5,2.2],[13,20,8,7.6],[5.5,20,4,3.4],[15,11.2,2.6,3],[15,28.8,2.6,3]];   // the body · four legs · the tail · the head · its muzzle · two ears
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++) for(const b of B) if(inE(x,y,b[0],b[1],b[2],b[3])){ m[y*W+x]=1; break; }
    m[9*W+15]=0; m[9*W+16]=0; m[10*W+15]=0;   // (the notch in its ear)
    const ed=[]; for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ const i=y*W+x; if(m[i] && (!m[i-1]||!m[i+1]||!m[i-W]||!m[i+W])) ed.push(i); }
    for(const i of ed) if(tH(i%W*7,(i/W|0)*3)<0.34) m[i]=0;   // (a ragged edge — a fur tip here and there)
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ const i=y*W+x; if(!m[i]) continue; const dy=Math.abs(y+0.5-20), sp=dy<2.6 && x>8 && x<57, eg=!m[i-1]||!m[i+1]||!m[i-W]||!m[i+W];
      let c=F[sp?2:dy<7?3:4]; if(tH(x*3,y*7)<0.16) c=F[sp?1:dy<7?2:3]; else if((x+y*2)%9===0 && x>20) c=F[sp?1:2];   // a dark saddle down its spine, paler flanks, the fur's strokes
      if(eg) c=F[(x+y)&1?2:1]; psP(S,x,y,c); }
    for(let y=1;y<H-1;y++) for(let x=1;x<11;x++) if(m[y*W+x] && inE(x,y,5.5,20,3.6,3)) psP(S,x,y,F[4]);   // the paler muzzle
    pR(S,2,19,2,2,cI('#1a1418')); for(const [x,y] of [[10,16],[11,16],[10,23],[11,23]]) psP(S,x,y,F[0]); psP(S,15,12,cI('#b88a8a')); psP(S,15,27,cI('#b88a8a'));   // its nose, its shut eyes, the inside of its ears
    for(const [x,y] of [[21,2],[23,2],[21,37],[23,37],[44,3],[46,3],[44,36],[46,36]]) if(m[y*W+x]) psP(S,x,y,cI('#e8e0cc'));   // claws
    return psCv(psOut(r&1?decorTurnPS(S):S,cI(OLC),false),0,0); },
  tr_drowned:()=>{ const S=PS(15,23), Vg=tRamp('#4a7a62'), Gl=cIR(['#1a6a4a','#2a9a6a','#5ae0a0','#c8ffe8']), Bn=cIR(['#a89a80','#e8e0c8']), Sw=cIR(['#1e4a2a','#2e6a3a']);   // the Tidecaller's lantern — barnacled bronze, a ghostly green flame
    pR(S,6,0,2,1,Vg[2]); pR(S,5,1,4,1,Vg[3]); psP(S,5,1,Vg[4]);   // its ring
    pR(S,3,2,8,1,Vg[3]); pR(S,2,3,10,2,Vg[3]); pR(S,2,3,10,1,Vg[4]); psP(S,2,4,Vg[4]); pR(S,11,3,1,2,Vg[1]);   // the cap
    pR(S,2,5,10,11,Gl[1]); for(let y=6;y<15;y++){ psP(S,3,y,Gl[2]); psP(S,10,y,Gl[0]); }   // the green glass
    pR(S,6,8,2,6,Gl[2]); pR(S,6,10,2,3,Gl[3]); psP(S,7,7,Gl[2]); psP(S,6,13,Gl[3]); psP(S,5,11,Gl[2]); psP(S,8,9,Gl[2]);   // the ghost-flame
    for(const x of [2,4,9,11]) pR(S,x,5,1,11,Vg[x<5?3:1]);   // the cage's bars
    pR(S,2,16,10,1,Vg[2]); pR(S,3,17,8,2,Vg[3]); pR(S,3,17,8,1,Vg[4]); pR(S,2,19,10,2,Vg[2]); pR(S,2,20,10,1,Vg[1]);   // its foot
    for(const [x,y] of [[3,3],[4,2],[9,3],[10,4],[3,18],[9,19],[10,18],[4,20],[11,16]]) psP(S,x,y,Bn[(x+y)&1]);   // barnacles
    psLine(S,12,4,12,11,Sw[1],1); psP(S,13,8,Sw[0]); psP(S,12,12,Sw[0]); psP(S,13,12,Sw[1]);   // a weed trailing from its cap
    return Object.assign(tOut(S,7,22),{gx:7, gy:11}); },
  tr_white:()=>{ const S=PS(60,36), Bn=cIR(['#6e6450','#a69c82','#cec4aa','#e8e1cc','#f9f5ea']), St=tRamp('#6a6a72'), cx=30, cy=31;   // the White's jawbone — a great pale arch on two blocks of stone
    for(let y=1;y<=29;y++) for(let x=2;x<58;x++){ const nx=(x+0.5-cx)/26.5, ny=(y+0.5-cy)/29, eo=nx*nx+ny*ny, ei=((x+0.5-cx)/20)**2+((y+0.5-cy)/22.5)**2; if(eo>1 || ei<1) continue;
      let c=ei<1.16?Bn[1]:eo>0.9?(ny<-0.55?Bn[4]:Bn[2]):(ny<-0.7?Bn[3]:nx<0?Bn[3]:Bn[2]); if(tH(x*5,y*3)<0.07) c=Bn[1]; psP(S,x,y,c); }   // the bone: lit along its crown, its inner face in shadow, a few pits
    for(let k=0;k<15;k++){ const a=Math.PI+(k+0.5)/15*Math.PI, px=cx+Math.cos(a)*20, py=cy+Math.sin(a)*22.5, ux=-Math.cos(a), uy=-Math.sin(a); if(py>27) continue;   // its teeth, pointing in
      psP(S,px+ux*0.6,py+uy*0.6,Bn[4]); psP(S,px+ux*1.6,py+uy*1.6,Bn[3]); psP(S,px+ux*2.5,py+uy*2.5,Bn[2]); }
    for(const x0 of [2,46]){ pR(S,x0,29,12,6,St[2]); pR(S,x0,29,12,2,St[4]); pR(S,x0,29,12,1,St[5]); pR(S,x0+11,31,1,4,St[1]); pR(S,x0,34,12,1,St[1]); psP(S,x0+3,32,St[1]); psP(S,x0+8,33,St[3]); }   // the blocks it stands on
    return tOut(S,30,35); },
  tr_fish:()=>{ const S=PS(40,22), Vr=tRamp('#8a5a30'), Br=tRamp('#c8983e'), sp=SHIP&&SHIP.fish&&FISH.find(q=>q.key===SHIP.fish);   // a mounted fish — that first exotic's own portrait on a varnished oval, a brass plate
    psDisc(S,20,11,19,10.2,(nx,ny,x,y)=>{ const e=nx*nx+ny*ny; return e>0.84?Vr[1]:e>0.68?(nx+ny<0?Vr[4]:Vr[2]):(ny<-0.5?Vr[4]:(x+y*3)%11===0?Vr[2]:Vr[3]); });
    for(const [x,y] of [[9,5],[10,4],[11,4]]) psP(S,x,y,Vr[5]);   // the varnish's shine
    if(sp){ const F=portFinish(fishPortS(sp),true); for(let y=0;y<F.h;y++) for(let x=0;x<F.w;x++){ const c=F.d[y*F.w+x]; if(c) psP(S,8+x,3+y,c); } }
    else { psDisc(S,18,10,7,3.4,()=>Vr[2]); psLine(S,25,10,29,7,Vr[2],1); psLine(S,25,10,29,13,Vr[2],1); pR(S,29,7,1,7,Vr[2]); }   // (no fish yet: its carved place waits)
    pR(S,16,17,8,2,Br[3]); pR(S,16,17,8,1,Br[5]); return tOut(S,20,21); },
  ks_master:()=>{ const S=PS(17,19), I=cIR(['#2a2626','#4a4848','#6a6868']), Vg=tRamp('#4f8a6e'), Bz=tRamp('#b8862e'), Pl=cI('#5a3812'), Rp=cIR(['#8a7a58','#c8b890']);   // the Master's old ship's bell — polished brass (SD7 FIX SD7VB-13: was green bronze, a twin of the Meridian's), her name engraved, on a scrolled bracket
    pR(S,1,0,2,7,I[1]); psP(S,1,0,I[2]); pR(S,3,1,8,2,I[1]); pR(S,3,1,8,1,I[2]); psP(S,11,2,I[0]); psP(S,11,3,I[1]); psP(S,3,3,I[1]); psP(S,4,4,I[1]); psP(S,5,4,I[0]);   // the bracket, a scroll under its arm
    [[8,10],[7,11],[7,11],[6,12],[6,12],[6,12],[5,13],[4,14]].forEach(([a,b],j)=>{ for(let x=a;x<=b;x++){ const u=(x-a)/Math.max(1,b-a), wear=tH(x*7,j*5)<0.12; psP(S,x,3+j, wear?Vg[u<0.5?3:2]:u<0.22?Bz[5]:u<0.5?Bz[4]:u<0.8?Bz[3]:Bz[1]); } });   // the bell — kept bright by a Master's hand, a fleck of green where the polish never reaches
    pR(S,7,6,5,1,Pl); pR(S,7,8,5,1,Pl);   // her name, engraved
    pR(S,4,11,11,1,Bz[2]); pR(S,5,12,9,1,Bz[1]); psP(S,9,13,I[1]); pR(S,9,14,1,2,Rp[1]); pR(S,8,16,3,1,Rp[0]); psP(S,9,17,Rp[0]); return tOut(S,9,18); },
  ks_carto:()=>{ const S=PS(36,20), Fr=tRamp('#2a2230'), G=tRamp('#c8983e'), Pb=cIR(['#121c44','#1a2a5a','#22346a']), Wt=cIR(['#8a9ac8','#e8eeff','#ffffff']);   // the star chart — deep blue paper, white stars, a gold compass
    pR(S,1,1,34,18,Fr[2]); pR(S,1,1,34,1,Fr[4]); pR(S,1,1,1,18,Fr[3]); pR(S,34,1,1,18,Fr[1]); pR(S,1,18,34,1,Fr[1]); pR(S,2,2,32,1,G[3]); pR(S,2,17,32,1,G[2]); pR(S,2,2,1,16,G[3]); pR(S,33,2,1,16,G[2]);   // a dark frame, a gilt fillet
    for(let y=3;y<17;y++) for(let x=3;x<33;x++) psP(S,x,y,Pb[vnoise(x/5+2.3,y/4+5.1)>0.55?2:(x+y)%9===0?0:1]);
    const st=[[6,5],[9,7],[12,5],[14,9],[18,6],[21,4],[24,8],[8,12],[11,14],[16,13],[20,11],[26,5],[29,7],[23,14],[5,9],[17,15]];
    for(let i=0;i<st.length-1;i++) if(i!==3 && i!==6 && i!==10 && i!==12) psLine(S,st[i][0],st[i][1],st[i+1][0],st[i+1][1],Pb[2],1);   // its constellations, faint
    st.forEach(([x,y],i)=>{ psP(S,x,y,Wt[i%4===0?2:1]); if(i%5===0){ psP(S,x-1,y,Wt[0]); psP(S,x+1,y,Wt[0]); psP(S,x,y-1,Wt[0]); psP(S,x,y+1,Wt[0]); } });
    { const cx=28, cy=13; for(let k=1;k<=3;k++){ psP(S,cx,cy-k,G[k<3?5:4]); psP(S,cx,cy+k,G[3]); psP(S,cx-k,cy,G[3]); psP(S,cx+k,cy,G[3]); } for(const [dx,dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) psP(S,cx+dx,cy+dy,G[2]); psP(S,cx,cy,cI('#fff0b0')); }   // the gold compass in its corner
    return tOut(S,18,19); },
  ks_craft:()=>{ const S=PS(19,19), P=tRamp('#c89a64'), Wd=tRamp('#5a3a22');   // the little carved whale on its plinth
    pR(S,5,13,9,3,Wd[3]); pR(S,5,13,9,1,Wd[5]); pR(S,5,13,1,3,Wd[4]); pR(S,13,13,1,3,Wd[1]); pR(S,4,16,11,2,Wd[2]); pR(S,4,16,11,1,Wd[3]); pR(S,4,17,11,1,Wd[1]);   // the plinth
    psPoly(S,[[1,9.4],[1.8,7.4],[3.6,6],[7.6,5.6],[11,6.4],[13.6,7.5],[15.4,8.1],[15.4,9.1],[12.6,10.3],[9,11.5],[5,12.2],[2.2,11.6],[1,10.6]],(x,y)=>y>=10 && x<12 ? (x&1?P[4]:P[5]) : P[y<7?4:y<9?3:2]);   // the whale: a great blunt head, its back lit, the pale grooved throat
    psLine(S,14,8,15,5,P[3],2); pR(S,13,3,5,1,P[4]); psP(S,13,2,P[4]); psP(S,17,2,P[4]); psP(S,15,4,P[3]);   // its tail, the flukes up
    psP(S,4,8,P[0]); pR(S,1,10,5,1,P[1]); psP(S,8,12,P[1]); psP(S,9,12,P[2]); pR(S,4,6,5,1,P[5]); return tOut(S,9,18); },   // an eye, its long mouth, a flipper, the knife's last shine
  ks_crewman:()=>{ const S=PS(19,21), Rp=cIR(['#4a3a22','#7a6440','#a89060','#c8b480']), Rd=tRamp('#c8302a'), Wt=cIR(['#d8d0bc','#f6f2e6']), Br=tRamp('#c8983e'), OL=cI(OLC);   // the lucky float — three red & white cork floats tied to a scrap of net (G18 FIX: bigger floats, each inked, the net behind them unlined)
    pR(S,2,1,15,1,Rp[2]); pR(S,2,2,15,1,Rp[1]); psP(S,3,1,Br[4]); psP(S,15,1,Br[4]); psP(S,3,2,Br[2]); psP(S,15,2,Br[2]);   // the head-rope, its two pegs
    const fl=(cx,cy)=>{ psDisc(S,cx,cy,4.3,3.4,()=>OL); psDisc(S,cx,cy,3.5,2.6,(nx,ny)=>ny<-0.2?Rd[nx<-0.3&&ny<-0.55?5:4]:ny<0.3?(nx<0.1?Wt[1]:Wt[0]):Rd[nx>0.4?1:2]); psP(S,cx-2,cy-1,Rd[5]); psP(S,cx,cy-4,Rp[0]); };   // a float: red, a white band, red — its own ink line, its tie
    fl(5.5,6.5); fl(13.5,8.5); fl(9.5,14.5); psOut(S,OL,false);
    for(let y=3;y<19;y++) for(let x=1;x<18;x++){ if(y>13 && (x<1+(y-13)*1.5 || x>17-(y-13)*1.5)) continue; const i=y*S.w+x; if(S.d[i]) continue; if((x+y)%4===0 || ((x-y)%4+4)%4===0) S.d[i]=Rp[(x*3+y)%7===0?3:1]; }   // the mesh, behind the floats (no ink, so it reads as netting, not a checker)
    return psCv(S,9,20); },
  ks_explorer:()=>{ const S=PS(20,24), Wd=tRamp('#6a4428'), Pg=cIR(['#a8987a','#e3d8b8','#f6eed8']), Fl=cIR(['#e86a9a','#ffd23f','#6a8aff','#3e8a3e']);   // the pressed-flower book, open on its lectern
    pR(S,9,13,3,8,Wd[3]); pR(S,9,13,1,8,Wd[4]); pR(S,11,13,1,8,Wd[1]); pR(S,5,21,10,2,Wd[2]); pR(S,5,21,10,1,Wd[3]);   // the post & its foot
    pR(S,2,10,16,3,Wd[3]); pR(S,2,10,16,1,Wd[4]); pR(S,2,12,16,1,Wd[1]);   // the sloped top
    pR(S,2,4,7,6,Pg[2]); pR(S,11,4,7,6,Pg[1]); pR(S,2,9,7,1,Pg[0]); pR(S,11,9,7,1,Pg[0]); pR(S,9,4,2,6,Pg[0]); psP(S,9,3,Pg[1]); psP(S,10,3,Pg[0]);   // its pages, the gutter
    psLine(S,4,8,5,5,Fl[3],1); psP(S,4,5,Fl[0]); psP(S,5,4,Fl[0]); psP(S,6,5,Fl[0]); psP(S,5,6,Fl[0]); psP(S,5,5,Fl[1]);   // a pink flower …
    psLine(S,14,8,14,6,Fl[3],1); psP(S,13,5,Fl[2]); psP(S,15,5,Fl[2]); psP(S,14,4,Fl[2]); psP(S,14,5,Fl[1]); psP(S,16,7,Fl[3]); psP(S,12,7,Fl[3]);   // … a blue one, two leaves
    pR(S,10,10,1,4,cI('#b8302a')); return tOut(S,10,23); },   // the ribbon
  dc_charter:()=>{ const S=PS(36,20), G=tRamp('#c8983e'), Pp=cIR(['#c4aa78','#e6d6a8','#f6ecc8']), Ink=cI('#6a4a2e'), Rd=tRamp('#b8202a');   // the Guild charter — parchment in a gilt frame, a red wax seal
    pR(S,1,1,34,18,G[3]); pR(S,1,1,34,1,G[5]); pR(S,1,1,1,18,G[4]); pR(S,34,1,1,18,G[1]); pR(S,1,18,34,1,G[1]); pR(S,2,2,32,16,G[2]);
    for(let y=3;y<17;y++) for(let x=3;x<33;x++) psP(S,x,y, y===3||x===3||tH(x*3,y*7)<0.05?Pp[0]:Pp[(x+y*2)%13===0?1:2]);
    for(let x=4;x<32;x+=2){ psP(S,x,4,G[4]); psP(S,x,15,G[4]); } for(let y=6;y<15;y+=2){ psP(S,4,y,G[4]); psP(S,31,y,G[4]); }   // its gold border, dotted
    pR(S,12,6,12,1,Ink); psP(S,11,6,Rd[3]); psP(S,11,7,Rd[2]);   // its heading, a red capital
    for(const [y,a,b] of [[8,7,29],[10,7,27],[12,7,22],[14,7,18]]) for(let x=a;x<=b;x++) if(tH(x,y*3)>0.12) psP(S,x,y,Ink);   // the lines of its writ
    psLine(S,26,13,25,17,Rd[2],1); psLine(S,28,13,29,17,Rd[2],1);   // the ribbon's tails
    psDisc(S,27,12,2.8,2.6,(nx,ny)=>ny<-0.3&&nx<0?Rd[5]:nx*nx+ny*ny>0.6?Rd[2]:Rd[3]); psP(S,27,12,Rd[1]);   // the seal
    return tOut(S,18,19); },
  dc_pinboard:()=>{ const S=PS(36,20), Wd=tRamp('#6a4428'), Ck=cIR(['#8a5e34','#a87444','#bc8a54','#cc9c64']), Ln=cI('#8a7a6a');   // the pinboard — cork, the contracts pinned up
    pR(S,1,1,34,18,Wd[2]); pR(S,1,1,34,1,Wd[4]); pR(S,1,1,1,18,Wd[3]); pR(S,34,1,1,18,Wd[1]); pR(S,1,18,34,1,Wd[1]);
    for(let y=2;y<18;y++) for(let x=2;x<34;x++){ const h=tH(x*5,y*3); psP(S,x,y,Ck[h<0.15?0:h<0.5?1:h<0.85?2:3]); }
    const note=(x,y,w,h,c,pin,dog)=>{ const C=cI(c), D=cI(mixHex(c,'#5a4a3a',0.28)), P=tRamp(pin); pR(S,x,y,w,h,C); pR(S,x,y+h-1,w,1,D); pR(S,x+w-1,y,1,h,D);
      if(dog){ psP(S,x+w-1,y+h-1,Ck[1]); psP(S,x+w-2,y+h-2,D); } for(let j=y+2;j<y+h-1;j+=2) for(let i=x+1;i<x+w-2;i++) if(tH(i,j*7)>0.25) psP(S,i,j,Ln);   // a note: its shade, a dog-ear, its scrawl
      psP(S,x+(w>>1),y,P[4]); psP(S,x+(w>>1),y+1,P[1]); };   // its pin
    note(4,3,8,7,'#f4ead0','#d0302a',1); note(13,5,7,8,'#f4e48a','#3060d0'); note(21,3,8,6,'#cfe0f0','#30a050'); note(29,6,5,8,'#f4ead0','#d0302a',1); note(6,11,9,6,'#f0c8c0','#3060d0'); note(22,11,6,6,'#f4ead0','#d8a020');
    return tOut(S,18,19); },
  /* (PT1 B7a) the style pieces, rows 12–30 — Isle · North · Sand · East (B7b paints Forge · Glow · Bog, the figureheads & the uniques) */
  dc_rattan:r=>{ const S=PS(16,22), K=cIR(['#5a3c1c','#80602e','#b08848','#d0a868','#e8c888','#f8e4b0']), f=DECOR_FACE[r&3], cane=(x,y)=>(x+y)%3===0||((x-y)%3+3)%3===0;   // the rattan chair: a round back of woven cane in a honey hoop, bentwood legs (4 facings)
    const back=(dk)=>psDisc(S,8,6.5,7.2,6.4,(nx,ny,x,y)=>{ const e=nx*nx+ny*ny; if(e>0.7) return e>0.88?K[1]:K[dk?2:(nx+ny<-0.2?5:3)]; return cane(x,y)?K[dk?2:(ny<-0.3?5:4)]:K[dk?0:2]; });   // (its hoop of thick cane, the diagonal weave within)
    const legs=(far,near)=>{ pR(S,4,15,1,5,K[far]); pR(S,11,15,1,5,K[far]); psLine(S,2,15,1,20,K[near],1); psLine(S,13,15,14,20,K[near-1],1); pR(S,2,18,12,1,K[1]); };
    if(f===0){ back(0); psDisc(S,8,13,7,2.3,(nx,ny,x,y)=>K[cane(x,y)?4:3]); pR(S,1,14,14,1,K[4]); pR(S,1,15,14,1,K[2]); legs(1,4); return Object.assign(tOut(S,8,21),{seat:12}); }   // (facing you: the back behind the seat)
    if(f===1){ psDisc(S,8,13,7,2.3,()=>K[2]); pR(S,1,14,14,1,K[2]); legs(2,3); back(1); return Object.assign(tOut(S,8,21),{seat:99}); }   // (its back to you: the weave's reverse)
    for(let y=1;y<14;y++){ const x=11+Math.round(Math.sin((y-1)/13*Math.PI)*1.4); pR(S,x,y,3,1,K[(y&1)?3:2]); psP(S,x,y,K[4]); psP(S,x+2,y,K[1]); }   // side on: the hoop edge-on, a little bowed — facing left
    pR(S,1,12,13,1,K[4]); pR(S,1,13,13,1,K[3]); pR(S,1,14,13,1,K[2]); psP(S,1,12,K[5]);   // the seat
    psLine(S,3,15,2,20,K[3],1); psLine(S,12,15,13,20,K[2],1); pR(S,3,18,10,1,K[1]);   // the bentwood legs, a stretcher
    if(f===3) decorFlip(S); return Object.assign(tOut(S,8,21),{seat:12}); },
  dc_palm:()=>{ const S=PS(32,38), G=cIR(['#173f20','#24602c','#3a8a3a','#62b44a','#a0dc68']), Tk=tRamp('#8a6a44'), Po=tRamp('#2a8a8a'), Sl=cI('#3a2414'), cx=15.5, cy=8;   // a potted palm: a ringed trunk, fronds fanning & drooping, a glazed teal pot
    for(let y=8;y<27;y++){ const xc=Math.round(16-Math.sin((27-y)/19*Math.PI*0.5)*2); psP(S,xc-1,y,Tk[(y%3===0)?2:4]); psP(S,xc,y,Tk[(y%3===0)?1:3]); psP(S,xc+1,y,Tk[(y%3===0)?0:2]); }   // the trunk, ringed
    const frond=(a,L,g,dk)=>{ const at=t=>[cx+Math.cos(a)*L*t, cy+Math.sin(a)*L*t+g*t*t], k=Math.max(3,Math.round(L/2));
      for(let j=1;j<=k;j++){ const t=j/(k+0.4), [x,y]=at(t); let tx=Math.cos(a)*L, ty=Math.sin(a)*L+2*g*t; const m=Math.hypot(tx,ty)||1; tx/=m; ty/=m; let nx=-ty, ny=tx; if(ny>0){ nx=-nx; ny=-ny; }
        const l=(1-t*0.75)*4.2+0.8; psLine(S,x,y,x+nx*l*0.7+tx*l*0.6,y+ny*l*0.7+ty*l*0.6+l*0.35,G[dk?2:3],1); psLine(S,x,y,x-nx*l+tx*l*0.5,y-ny*l+ty*l*0.5,G[dk?1:2],1); }   // (its leaflets, combed out both sides)
      for(let i=0;i<=24;i++){ const t=i/24, [x,y]=at(t); psP(S,x,y,G[dk?2:(t>0.7?4:3)]); } };   // (its rib)
    frond(-1.6,7,1,1); frond(-2.25,11,6,1); frond(-0.9,11,6,1); frond(2.95,14,9,0); frond(0.2,14,9,0);   // (the far ones first, then the two that droop to the sides)
    psP(S,15,8,G[4]); psP(S,16,7,G[4]);
    pR(S,9,27,14,1,Po[5]); pR(S,9,28,14,1,Sl); psP(S,9,28,Po[4]); psP(S,22,28,Po[2]); pR(S,9,29,14,1,Po[3]); psP(S,9,29,Po[4]); pR(S,10,30,12,1,Po[1]);   // the rim, the soil, its lip
    for(let y=31;y<37;y++){ const ins=Math.floor((y-31)*0.4), a=10+ins, b=21-ins; for(let x=a;x<=b;x++){ const u=(x-a)/Math.max(1,b-a); psP(S,x,y, u<0.12?Po[3]:u<0.3?Po[5]:u<0.72?Po[3]:u<0.88?Po[2]:Po[1]); } }   // the glazed pot, its shine
    pR(S,12,37,8,1,Po[1]); return tOut(S,16,37); },
  dc_conch:()=>{ const S=PS(22,17), Dw=cIR(['#3e3834','#5e5650','#827870','#a89e92','#ccc4b8']), Pk=cIR(['#8a3a4a','#b8586a','#e0808e','#f4a8b0','#ffd0d0']), Lp=cIR(['#e88a7a','#f8b098','#ffd4bc']), Fl=cIR(['#b8481a','#f07a30','#ffb050','#fff4c0']);   // a conch lamp: a pink conch on driftwood, a candle glowing in its mouth
    for(let y=12;y<16;y++){ const a=y===12||y===15?3:2, b=y===12||y===15?18:19; for(let x=a;x<=b;x++) psP(S,x,y, y===12?Dw[4]:y===15?Dw[1]:tH(x*5,y*3)<0.22?Dw[1]:Dw[y===13?3:2]); }   // the driftwood, silvered, its grain
    pR(S,19,11,2,2,Dw[3]); psP(S,20,10,Dw[3]); psP(S,6,14,Dw[0]); psP(S,7,14,Dw[1]);   // a snag, a knot
    psDisc(S,10,7.6,7,4.4,(nx,ny)=>{ const l=-0.6*nx-0.8*ny; return Pk[l>0.55?4:l>0.15?3:l>-0.35?2:1]; });   // its body
    for(const [cx,cy,rx,ry] of [[4.2,6.6,2.6,2.3],[2.2,6.1,1.7,1.5],[0.9,5.8,1,0.9]]) psDisc(S,cx,cy,rx,ry,(nx,ny)=>Pk[ny<-0.2?4:ny<0.4?3:2]);   // the spire's whorls
    psLine(S,3,8,9,11,Pk[1],1); psLine(S,6,4,12,4,Pk[2],1); for(const [x,y] of [[7,3],[10,2],[13,3],[5,4]]){ psP(S,x,y,Pk[4]); psP(S,x,y+1,Pk[3]); }   // its spiral, its knobs
    psPoly(S,[[13,4],[18.5,4.5],[20.5,7.5],[19.5,11.5],[14,12.5],[12.5,9]],(x,y)=>x>18||y>11?Lp[0]:Lp[y<6?2:1]);   // the flared lip, glossy peach
    psDisc(S,16.2,8.6,1.7,3.2,(nx,ny)=>ny<-0.4?Fl[0]:ny<0.3?Fl[1]:Fl[2]);   // the long mouth, warm with the light inside
    psP(S,16,4,Fl[3]); psP(S,16,5,Fl[2]); psP(S,15,5,Fl[1]);   // the candle's flame, peeping out
    return Object.assign(tOut(S,11,16),{gx:16, gy:6}); },
  dc_mat:()=>{ const S=PS(40,40), Co=tRamp('#e8745a'), Te=tRamp('#2a9a96'), Cr=cIR(['#b8a47a','#e4d6b0','#f6eed6']), Nb=cIR(['#7a643c','#a8905e']);   // the island weave mat: chevrons of coral, cream & teal, its edge bound in palm fibre
    for(let y=1;y<39;y++) for(let x=1;x<39;x++){ const e=Math.min(x-1,y-1,38-x,38-y), dk=((x+((y>>1)&1)*2)&3)===0; let c;
      if(e===0) c=Nb[0]; else if(e===1) c=(x+y)&1?Nb[1]:Nb[0]; else if(e===2) c=Cr[0];
      else { const v=y+Math.abs(((x+1)%8)-4), b=Math.floor(v/3)%4; c=b===0?(dk?Co[2]:Co[3]):b===2?(dk?Te[2]:Te[3]):(dk?Cr[0]:Cr[1]); }
      psP(S,x,y,c); }
    for(const [x,y] of [[2,2],[37,2],[2,37],[37,37]]){ psP(S,x,y,Co[4]); }   // a knot at each corner
    return psCv(psOut(S,cI(OLC),false),0,0); },
  dc_tiki:()=>{ const S=PS(16,34), W=tRamp('#8a5a32'), Sh=cIR(['#c8beac','#fffaf0']), K=cI('#24140c'), Fr=tRamp('#d83a2a'), Fy=tRamp('#f0c030'), Fg=tRamp('#3a9a4a');   // a carved tiki post: a scowling face, shell eyes, a tuft of feathers
    const fth=(x0,y0,x1,y1,R)=>{ psLine(S,x0,y0,x1,y1,R[3],3); psLine(S,x0,y0,x1,y1,R[5],1); psP(S,x1,y1,R[2]); };
    fth(5,9,3,2,Fy); fth(11,9,13,2,Fg); fth(8,9,8,0,Fr);   // the feathers (the red one in front)
    for(let y=8;y<30;y++) for(let x=3;x<=12;x++){ if(y===8 && (x<5||x>10)) continue; if(y===9 && (x<4||x>11)) continue; psP(S,x,y, tH(x*7,y)<0.12?W[x<10?2:1]:W[x<5?4:x<10?3:x<12?2:1]); }   // the post, its grain
    pR(S,3,11,10,1,W[5]); pR(S,3,12,10,1,W[1]);   // the brow
    for(const cx of [5.5,10.5]){ psDisc(S,cx,14.5,2.1,1.8,(nx,ny)=>ny>0.3?Sh[0]:Sh[1]); psP(S,cx-0.5,14.5,K); }   // shell eyes
    pR(S,7,15,2,4,W[4]); psP(S,8,15,W[3]); pR(S,6,18,4,1,W[4]); psP(S,6,19,K); psP(S,9,19,K); pR(S,7,19,2,1,W[2]);   // the broad nose
    pR(S,4,20,8,1,W[5]); pR(S,4,21,8,2,K); for(let x=4;x<12;x+=2) psP(S,x,21,Sh[1]); pR(S,4,23,8,1,W[1]);   // the grimace, its teeth
    for(let x=3;x<=12;x++){ psP(S,x,25+((x&1)?0:1),W[5]); psP(S,x,26+((x&1)?0:1),W[1]); }   // a carved zigzag
    pR(S,3,28,10,1,W[4]); pR(S,2,30,12,3,W[2]); pR(S,2,30,12,1,W[4]); pR(S,2,32,12,1,W[1]);   // the foot
    return tOut(S,8,33); },
  dc_fur:r=>{ const W=60, H=40, S=PS(W,H), F=tRamp('#8a6040'), m=new Uint8Array(W*H), inE=(x,y,cx,cy,rx,ry)=>((x+0.5-cx)/rx)**2+((y+0.5-cy)/ry)**2<=1;   // a bear-fur rug: a shaggy brown hide, its head raised at one end, a fur edge
    const B=[[34,20,18,12],[22,6.5,4.2,5.4],[22,33.5,4.2,5.4],[46,7,4,5],[46,33,4,5],[52,20,2.6,2],[13,20,7.6,7],[6,20,3.6,3.2],[11,12.6,2.6,2.6],[11,27.4,2.6,2.6]];   // the hide · four paws · a stub of tail · the head · its muzzle · two round ears
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++) for(const b of B) if(inE(x,y,b[0],b[1],b[2],b[3])){ m[y*W+x]=1; break; }
    const ed=[]; for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ const i=y*W+x; if(m[i] && (!m[i-1]||!m[i+1]||!m[i-W]||!m[i+W])) ed.push(i); }
    for(const i of ed) if(i%W>18 && tH(i%W*5,(i/W|0)*7)<0.4) m[i]=0;   // (a shaggy edge — not on the head)
    for(let y=1;y<H-1;y++) for(let x=1;x<W-1;x++){ const i=y*W+x; if(!m[i]) continue; const dy=Math.abs(y+0.5-20), eg=!m[i-1]||!m[i+1]||!m[i-W]||!m[i+W], hd=x<21;
      let c=hd?F[3]:F[dy<5?4:dy<9?3:2]; if(!hd && tH(x*3,y*5)<0.18) c=F[dy<5?3:dy<9?2:1]; else if(!hd && (x*2+y)%7===0) c=F[dy<5?5:3];   // a cream-brown back, darker flanks, the fur's strokes
      if(eg) c=F[(x+y)&1?1:2]; psP(S,x,y,c); }
    psDisc(S,13,19.4,6.4,5.6,(nx,ny)=>ny<-0.3&&nx<0.2?F[4]:0);   // the head, lit from above
    for(let y=17;y<24;y++) for(let x=3;x<10;x++) if(m[y*W+x] && inE(x,y,6,20,3.4,3)) psP(S,x,y,F[y<20?4:3]);   // the muzzle
    pR(S,2,19,2,2,cI('#1a1214')); pR(S,4,22,5,1,cI('#7a2a2a')); psP(S,5,23,cI('#f4ecd8')); psP(S,7,23,cI('#f4ecd8'));   // its nose, its open mouth, two teeth
    for(const [x,y] of [[10,17],[10,23]]){ psP(S,x,y,cI('#1a1214')); psP(S,x,y-1,F[4]); }   // its eyes
    psP(S,11,12,F[1]); psP(S,11,13,F[1]); psP(S,11,27,F[1]); psP(S,11,28,F[1]);   // inside its ears
    for(const [x,y] of [[20,1],[22,1],[24,1],[20,38],[22,38],[24,38],[45,2],[47,2],[45,37],[47,37]]) if(m[y*W+x]||m[(y+(y<20?1:-1))*W+x]) psP(S,x,y,cI('#efe6d0'));   // claws
    return psCv(psOut(r&1?decorTurnPS(S):S,cI(OLC),false),0,0); },
  dc_stove:()=>{ const S=PS(18,40), I=cIR(['#101014','#1e1e26','#30303a','#464652','#646472','#9a9aa8']), Br=tRamp('#c8983e'), Fl=cIR(['#8a2a10','#e0601a','#ff9a3a','#ffd070','#fff4c0']);   // a pot-bellied stove: a black iron belly, its grate aglow, the pipe going up
    pR(S,7,0,4,14,I[2]); pR(S,7,0,1,14,I[4]); pR(S,10,0,1,14,I[1]); pR(S,6,4,6,2,I[3]); pR(S,6,4,6,1,I[4]); psP(S,11,8,Br[4]); psP(S,12,8,Br[2]);   // the pipe, a collar, the damper's knob
    psDisc(S,9,15.5,4.6,2.4,(nx,ny)=>ny<-0.2?I[4]:I[2]); pR(S,4,17,10,2,Br[3]); pR(S,4,17,10,1,Br[5]); psP(S,13,18,Br[1]);   // the cap · a brass band
    psDisc(S,9,25.5,7.5,7.2,(nx,ny)=>{ const l=-0.62*nx-0.78*ny; return l>0.72?I[5]:l>0.4?I[4]:l>0?I[3]:l>-0.5?I[2]:I[1]; });   // the belly
    pR(S,5,23,8,6,I[0]); pR(S,6,24,6,4,Fl[1]); pR(S,7,25,4,2,Fl[3]); psP(S,8,25,Fl[4]); psP(S,6,27,Fl[2]); psP(S,11,24,Fl[2]); for(const x of [7,9,11]) pR(S,x,24,1,4,I[1]);   // the grate's window, the fire behind its bars
    pR(S,4,33,10,2,I[3]); pR(S,4,33,10,1,I[4]); pR(S,3,35,12,1,I[1]);   // the base
    psLine(S,4,36,3,39,I[3],1); psLine(S,13,36,14,39,I[2],1); pR(S,8,36,2,3,I[1]);   // its legs
    return Object.assign(tOut(S,9,39),{gx:9, gy:25}); },
  dc_antlers:()=>{ const S=PS(24,22), Wd=tRamp('#7a5230'), Bn=cIR(['#7a6a4a','#a8987a','#d0c4a4','#f2ead6']);   // an antler rack: pale antlers on an oak shield
    for(let y=9;y<22;y++){ const hw=y<16?5:Math.max(0,5-(y-16)*1); for(let x=Math.round(12-hw);x<Math.round(12+hw);x++){ const u=(x-(12-hw))/Math.max(1,2*hw); psP(S,x,y, u<0.14||y===9?Wd[5]:u>0.86||y===21-Math.floor(hw/5)?Wd[1]:u<0.4?Wd[4]:Wd[3]); } }   // the shield, lit from the left
    pR(S,10,13,4,1,Wd[2]); pR(S,11,17,2,1,Wd[2]);
    psDisc(S,12,10.5,2.8,1.8,(nx,ny)=>ny<0?Bn[3]:Bn[2]);   // the skull's boss
    const ant=(sx)=>{ const P=[[0,0],[2.2,-1.6],[4.6,-3.8],[6.6,-6.6],[7.4,-9.6]]; for(let i=0;i<P.length-1;i++) psLine(S,12+sx*(1.5+P[i][0]),10+P[i][1],12+sx*(1.5+P[i+1][0]),10+P[i+1][1],Bn[2],2);   // the main beam
      for(let i=0;i<P.length-1;i++) psLine(S,12+sx*(1.5+P[i][0]),9+P[i][1],12+sx*(1.5+P[i+1][0]),9+P[i+1][1],Bn[3],1);
      psLine(S,12+sx*4.2,7.6,12+sx*3.6,3.2,Bn[2],1); psLine(S,12+sx*6.4,5.2,12+sx*5.4,1.4,Bn[1],1); psLine(S,12+sx*8,2.8,12+sx*10.4,0.6,Bn[2],1); };   // its tines
    ant(-1); ant(1); return tOut(S,12,21); },
  dc_pinechest:r=>{ const P=tRamp('#d0a060'), I=cIR(['#24222a','#44424c','#6a6a76']), Rd=cI('#c0362a'), Bl=cI('#2a58a8'), Wt=cI('#f4efe0'), Gn=cI('#3a8a3a');   // the pine blanket chest: iron straps, a rosemaling flower painted on its lid
    const flower=(S,cx,cy)=>{ psP(S,cx,cy,Rd); psP(S,cx+1,cy,Rd); psP(S,cx,cy-1,Rd); psP(S,cx+1,cy-1,Wt); for(const s of [-1,1]){ const x=s<0?cx-1:cx+2; psP(S,x,cy-1,Bl); psP(S,x+s,cy-1,Bl); psP(S,x+2*s,cy,Bl); psP(S,x+s,cy+1,Bl); psP(S,x,cy+1,Gn); psP(S,x+2*s,cy-2,Wt); } psP(S,cx,cy+1,Gn); psP(S,cx+1,cy+1,Gn); };   // red heart, blue scrolls, a white dot, green leaves
    if(r&1){ const S=PS(24,50);   // end on: the lid running away from you
      for(let y=3;y<38;y++) for(let x=4;x<20;x++) psP(S,x,y, x===9||x===14?P[3]:P[x<6?5:4]);
      for(const y of [7,32]){ pR(S,4,y,16,2,I[1]); pR(S,4,y,16,1,I[2]); } flower(S,11,20); psP(S,12,23,Rd); psP(S,11,17,Bl); psP(S,12,17,Bl);
      pR(S,4,38,16,1,P[5]); pR(S,4,39,16,7,P[3]); pR(S,4,39,1,7,P[4]); pR(S,19,39,1,7,P[1]); pR(S,4,42,16,1,P[2]); for(const x of [6,16]){ pR(S,x,38,2,8,I[1]); psP(S,x,38,I[2]); }   // its near end, strapped
      pR(S,11,40,2,3,I[1]); psP(S,11,41,I[0]); pR(S,3,46,18,2,P[2]); pR(S,3,47,18,1,P[1]); return tOut(S,12,47); }
    const S=PS(42,28);
    for(let y=3;y<10;y++) for(let x=2;x<40;x++) psP(S,x,y, y===5||y===8?P[3]:P[y<4?5:4]);   // the lid's top, its boards
    pR(S,2,10,38,1,P[5]); pR(S,2,11,38,1,P[2]);   // its lit front edge
    for(let y=12;y<24;y++) for(let x=2;x<40;x++) psP(S,x,y, x===2?P[4]:x===39?P[1]:y===16||y===20?P[2]:P[3]);   // the front's boards
    for(const x of [7,33]){ pR(S,x,3,2,21,I[1]); pR(S,x,3,1,21,I[2]); psP(S,x,10,I[2]); psP(S,x+1,10,I[2]); }   // the iron straps
    pR(S,19,10,4,5,I[1]); pR(S,19,10,4,1,I[2]); psP(S,20,12,I[0]); psP(S,21,12,I[0]); psP(S,20,13,I[0]);   // the hasp
    flower(S,20,6); flower(S,13,19); flower(S,27,19); pR(S,16,19,8,1,Bl); psP(S,20,18,Wt);   // the rosemaling: the lid's flower, a garland on the front
    pR(S,2,24,38,2,P[2]); pR(S,2,25,38,1,P[1]); pR(S,3,26,3,1,P[1]); pR(S,36,26,3,1,P[1]); return tOut(S,21,26); },
  dc_candles:()=>{ const S=PS(16,20), Sl=cIR(['#1c2026','#30363e','#465058','#64707c']), Wx=cIR(['#a08660','#ccb48a','#e8d6ae','#f8eccc']), Fl=cIR(['#e0601a','#ffa040','#ffe080','#fffbe8']);   // a candle cluster: three candles on a slate, their drips pooled
    pR(S,1,15,14,2,Sl[2]); pR(S,1,15,14,1,Sl[3]); pR(S,1,17,14,1,Sl[1]); pR(S,2,18,12,1,Sl[0]); psP(S,1,17,Sl[0]); psP(S,14,15,Sl[1]);   // the slate
    const cdl=(x,y0,dr)=>{ for(let y=y0;y<16;y++){ psP(S,x,y,Wx[3]); psP(S,x+1,y,Wx[2]); psP(S,x+2,y,Wx[1]); } psP(S,x,y0,Wx[2]); psP(S,x+1,y0,Wx[1]); psP(S,x+2,y0,Wx[2]); psP(S,x+1,y0-1,cI('#3a2a1a'));   // a candle, its melted top, its wick
      pR(S,x+1,y0+1,1,dr+1,Wx[3]); psP(S,x+1,y0+dr+2,Wx[3]); psP(S,x+2,y0+dr+3,Wx[2]); psP(S,x-1,y0+1,Wx[2]); psP(S,x-1,y0+2,Wx[1]); };   // (its drips)
    cdl(2,10,1); cdl(10,8,2); cdl(6,4,3);   // short, middling, tall (the tall one in front)
    pR(S,1,15,5,1,Wx[2]); pR(S,9,15,5,1,Wx[2]); psP(S,5,16,Wx[1]); psP(S,13,16,Wx[1]);   // the wax pooled on the slate
    const fl=(x,y)=>{ psP(S,x,y,Fl[2]); psP(S,x,y-1,Fl[3]); psP(S,x,y-2,Fl[1]); psP(S,x-1,y,Fl[0]); psP(S,x+1,y,Fl[1]); };
    fl(3,8); fl(11,6); fl(7,2); return Object.assign(tOut(S,8,18),{gx:7, gy:1}); },
  dc_kilim:r=>{ const W=60, H=40, S=PS(W,H), Rd=tRamp('#b03428'), Oc=tRamp('#d89430'), In=tRamp('#28387a'), Cr=cIR(['#cfc2a4','#f2ead4']);   // a kilim rug: a red field, a diamond lattice in ochre & indigo, tasselled ends
    for(let y=1;y<H-1;y++) for(let x=4;x<W-4;x++){ const e=Math.min(x-4,y-1,W-5-x,H-2-y); let c;
      const al=Math.min(y-1,H-2-y)<Math.min(x-4,W-5-x)?x:y; if(e<=1) c=In[e?3:2]; else if(e===2||e===4) c=Oc[3]; else if(e===3) c=(al%4)<2?Rd[3]:Oc[5]; else if(e===5) c=In[3];   // the border: indigo, ochre bands round a red & cream dash
      else if(e>5){ const dx=Math.abs((((x-W/2)%12)+12)%12-6), dy=Math.abs((((y-H/2)%12)+12)%12-6), s=dx+dy;
        c=s<=1?In[3]:s===2?Cr[1]:s>=11?Oc[4]:s===6?Oc[3]:s===4||s===8?Rd[2]:Rd[3]; }   // the field: diamonds within a lattice
      psP(S,x,y,c); }
    for(let y=2;y<H-2;y++) for(const x0 of [1,W-4]) for(let i=0;i<3;i++){ if((y&1) && i===(x0>2?2:0)) continue; psP(S,x0+i,y,Cr[(y&1)?0:1]); }   // the tassels, a cream fringe
    return psCv(psOut(r&1?decorTurnPS(S):S,cI(OLC),false),0,0); },
  dc_pierced:()=>{ const S=PS(16,30), Br=tRamp('#c8983e'), Gl=cIR(['#e08a2a','#ffd070','#fffae0']);   // a pierced brass lamp: an onion dome, its body starred with holes, on a tall foot
    pR(S,7,0,2,1,Br[3]); psP(S,7,1,Br[4]); psP(S,8,1,Br[2]);   // the finial's ring
    [[7,9],[6,9],[6,10],[5,10],[4,11],[3,12]].forEach(([a,b],j)=>{ for(let x=a;x<=b;x++){ const u=(x-a)/Math.max(1,b-a); psP(S,x,2+j,u<0.25?Br[5]:u<0.6?Br[4]:u<0.85?Br[3]:Br[1]); } });   // the onion dome
    pR(S,3,8,10,1,Br[2]);
    for(let y=9;y<20;y++){ const a=y<11||y>17?4:3, b=y<11||y>17?11:12; for(let x=a;x<=b;x++){ const u=(x-a)/(b-a); psP(S,x,y,u<0.15?Br[4]:u<0.35?Br[5]:u<0.75?Br[3]:Br[1]); } }   // its body
    for(const [cx,cy] of [[5,11],[10,11],[7,14],[5,17],[10,17]]){ psP(S,cx,cy,Gl[2]); psP(S,cx-1,cy,Gl[1]); psP(S,cx+1,cy,Gl[1]); psP(S,cx,cy-1,Gl[1]); psP(S,cx,cy+1,Gl[1]); }   // the pierced stars, lit within
    for(const [x,y] of [[8,10],[3,14],[12,14],[8,18],[7,12],[9,16]]) psP(S,x,y,Gl[0]);
    pR(S,3,19,10,1,Br[2]); pR(S,5,20,6,2,Br[3]); pR(S,5,20,1,2,Br[4]); pR(S,7,22,2,5,Br[3]); psP(S,7,22,Br[4]); pR(S,7,24,2,1,Br[1]);   // the neck & the stem
    pR(S,4,27,8,2,Br[3]); pR(S,4,27,8,1,Br[5]); pR(S,3,29,10,1,Br[1]);   // the foot
    return Object.assign(tOut(S,8,29),{gx:8, gy:14, spk:[[-13,15],[12,11],[2,20]]}); },
  dc_cushions:r=>{ const Oc=tRamp('#d8962a'), Te=tRamp('#2a8a8a'), Gd=tRamp('#e8c040');   // floor cushions: two plump ones, ochre & teal, tasselled
    const cu=(S,x,y,w,C)=>{ for(let j=0;j<7;j++) for(let i=0;i<w;i++){ if((j===0||j===6)&&(i===0||i===w-1)) continue; const nx=(i+0.5)/w-0.5, ny=(j+0.5)/7-0.5; psP(S,x+i,y+j,C[(nx+ny<-0.45)?5:(nx+ny<0.1)?4:3]); }   // its top, plump
      for(let j=7;j<12;j++) for(let i=0;i<w;i++){ if(j===11&&(i===0||i===w-1)) continue; psP(S,x+i,y+j,C[j===7?2:i<2?3:i>w-3?1:2]); }   // its side, bulging
      psP(S,x+(w>>1),y+3,C[1]); psP(S,x+(w>>1)-1,y+3,C[2]); psP(S,x+(w>>1),y+4,C[4]);   // the button
      for(const [ix,iy] of [[0,0],[w-1,0],[0,10],[w-1,10]]){ psP(S,x+ix+(ix?1:-1),y+iy+1,Gd[4]); psP(S,x+ix+(ix?1:-1),y+iy+2,Gd[2]); } };   // its four tassels
    if(r&1){ const S=PS(24,40); cu(S,3,4,18,Te); cu(S,3,22,18,Oc); return Object.assign(tOut(S,12,38),{seat:29}); }   // (one behind the other)
    const S=PS(44,20); cu(S,3,4,18,Oc); cu(S,23,4,18,Te); return Object.assign(tOut(S,22,18),{seat:11}); },
  dc_urn:()=>{ const S=PS(16,24), T=tRamp('#c0683a'), K=cI('#2a1a14'), C=cI('#f0e2c4'), cx=7.5;   // a clay urn: a terracotta amphora, a painted band
    const hw=[0,3,2.6,1.8,1.8,1.8,2,3,4.4,5.4,5.9,6,6,5.9,5.6,5.1,4.5,3.8,3,2.3,1.9,2.3,2.8,2.8];
    for(let y=1;y<24;y++){ const a=Math.round(cx-hw[y]), b=Math.round(cx+hw[y])-1; for(let x=a;x<=b;x++){ const u=(x-a)/Math.max(1,b-a); psP(S,x,y, y===1?T[5]:u<0.15?T[3]:u<0.32?T[5]:u<0.48?T[4]:u<0.78?T[3]:u<0.9?T[2]:T[1]); } }
    pR(S,6,2,4,1,T[1]);   // the mouth, dark within
    for(let x=2;x<14;x++){ psP(S,x,10,C); psP(S,x,11,K); psP(S,x,12,(x&3)===1?C:K); psP(S,x,13,(x&3)===3?C:K); psP(S,x,14,K); psP(S,x,15,C); }   // the painted band — a wave on black between two cream lines
    psLine(S,5,3,3,6,T[2],1); psLine(S,3,6,4,8,T[2],1); psLine(S,10,3,12,6,T[1],1); psLine(S,12,6,11,8,T[1],1);   // its two handles
    return tOut(S,8,23); },
  dc_brazier:()=>{ const S=PS(20,26), Br=tRamp('#c8983e'), Fl=cIR(['#6a1a10','#c03a14','#f07a20','#ffc040','#fff4c0']);   // a brass brazier: a bowl of embers on a tripod, sparks rising
    psLine(S,9,14,3,24,Br[4],2); psLine(S,11,14,17,24,Br[1],2); pR(S,9,15,2,8,Br[2]); pR(S,2,24,3,1,Br[2]); pR(S,16,24,3,1,Br[1]); pR(S,5,19,10,1,Br[2]);   // the tripod, a ring brace
    for(let y=10;y<15;y++){ const hw=[8.5,8.2,7.4,6.2,4.6][y-10]; for(let x=Math.round(10-hw);x<Math.round(10+hw);x++){ const u=(x-(10-hw))/(2*hw); psP(S,x,y,u<0.18?Br[5]:u<0.4?Br[4]:u<0.8?Br[3]:Br[1]); } }   // the bowl
    pR(S,2,10,16,1,Br[5]); psDisc(S,10,9.4,7,2.6,(nx,ny,x,y)=>{ const h=tH(x*7,y*11); return ny>0.6?0:h<0.2?Fl[0]:h<0.5?Fl[1]:h<0.82?Fl[2]:Fl[3]; });   // the embers heaped in it
    for(const [x,y] of [[9,8],[11,7],[8,9]]) psP(S,x,y,Fl[4]);
    for(const [x,y,c] of [[8,4,3],[12,2,4],[10,0,3],[13,5,2],[6,2,2]]) psP(S,x,y,Fl[c]);   // sparks
    return Object.assign(tOut(S,10,25),{gx:10, gy:8, spark:1}); },
  dc_paperlamp:()=>{ const S=PS(14,24), I=cI('#2a2626'), Rd=cIR(['#5a1410','#8a1e18','#c03a28','#e8603e','#ff9a6a','#ffd0a0']), Gd=tRamp('#d8a040');   // a paper lantern: red paper ribbed in bamboo, gold caps, a tassel
    pR(S,6,0,3,1,I); pR(S,7,1,1,3,I); psP(S,8,1,cI('#4a4848'));   // its hook
    pR(S,7,4,1,1,Rd[1]); pR(S,5,5,5,2,Gd[3]); pR(S,5,5,5,1,Gd[5]); psP(S,9,6,Gd[1]);   // the cord, the gold cap
    psDisc(S,7.5,12,6,5.4,(nx,ny,x,y)=>{ const l=-0.55*nx-0.35*ny, rib=y===9||y===12||y===15; return rib?Rd[l>0.2?2:1]:Rd[l>0.5?5:l>0.15?4:l>-0.3?3:2]; });   // the paper, glowing, its ribs
    pR(S,5,17,5,2,Gd[3]); pR(S,5,17,5,1,Gd[4]); psP(S,9,18,Gd[1]);   // the bottom cap
    pR(S,7,19,1,1,Gd[2]); pR(S,6,20,3,3,Rd[2]); psP(S,6,20,Rd[3]); pR(S,6,23,3,1,Rd[1]);   // the tassel
    return Object.assign(tOut(S,7,23),{gx:7, gy:12}); },
  dc_screen:r=>{ const K=cIR(['#0c0a10','#16121c','#221c2a','#302838','#4a4054']), Gd=tRamp('#d8a840'), Rs=tRamp('#d03a2a'), Wt=cIR(['#b8b0a8','#e4e0d8','#fbf8f2']);   // a lacquer screen: four black panels, a white crane & a red sun
    if(r&1){ const S=PS(22,70), X=[16,4,16,4,16], Hh=28;   // end on: the panels zigzag away from you, each in its gilt frame
      for(let i=3;i>=0;i--){ const xa=X[i], xb=X[i+1], ya=67-i*10, yb=57-i*10, lit=xb<xa;
        psPoly(S,[[xa,ya+1],[xb,yb+1],[xb,yb-Hh],[xa,ya-Hh]],(x,y)=>{ const tt=clamp((x+0.5-xa)/(xb-xa),0,1), top=ya-Hh+(yb-ya)*tt, bot=ya+(yb-ya)*tt, v=(y-top)/(bot-top);
          if(y<top+1.5) return Gd[lit?5:4]; if(y>bot-0.5) return Gd[lit?3:2]; if(tt<0.09 || tt>0.91) return Gd[lit?4:3];   // (the frame)
          if(lit && i===2 && Math.hypot((tt-0.5)*12,(v-0.3)*28)<4.2) return Rs[3];   // the red sun, far off
          if(lit && i===0 && Math.abs(tt-0.45-(v-0.5)*0.3)<0.09 && v>0.15 && v<0.8) return Wt[2];   // the crane's neck & breast
          if(lit && i===0 && v>0.15 && v<0.25 && tt>0.4 && tt<0.7) return Wt[2];
          if(!lit && v>0.78 && ((x*3+y*5)%7===0)) return Gd[2];   // gold reeds in the shade
          if(lit && Math.abs(tt-v*0.8-0.1)<0.06) return cI('#6a5e78'); return K[lit?4:3]; });   // (a gloss on the lit lacquer)
        psP(S,xa,ya+1,Gd[2]); }
      psP(S,X[4],27,Gd[2]); return tOut(S,10,68); }
    const S=PS(44,36);
    for(let p=0;p<4;p++){ const x0=2+p*10, dk=p&1;   // each panel, the folds catching the light in turn
      for(let y=2;y<33;y++) for(let x=x0;x<x0+10;x++){ let c=K[dk?1:3]; if(x===x0) c=Gd[dk?2:4]; else if(y===2||y===3) c=Gd[dk?2:4]; else if(y===32) c=Gd[dk?1:3];
        else { const sd=Math.hypot(x+0.5-31,y+0.5-11); if(sd<5.2) c=Rs[sd<3.5?(dk?3:4):(dk?2:3)]; else if(y>27 && ((x*3+y*5)%7===0)) c=Gd[dk?1:2]; }   // the red sun · a few gold reeds
        psP(S,x,y,c); }
      pR(S,x0+1,33,2,2,Gd[2]); pR(S,x0+7,33,2,2,Gd[1]); }
    pR(S,41,2,1,31,Gd[1]);
    const W2=(x,y)=>Wt[(Math.floor((x-2)/10)&1)?1:2];   // (the crane's white, on a lit or a shaded panel)
    psDisc(S,12,21,4.4,2.6,(nx,ny,x,y)=>ny>0.4?Wt[0]:W2(x,y)); for(let y=12;y<20;y++){ const x=15+Math.round(Math.sin((y-12)/8*Math.PI)*1.2); psP(S,x,y,W2(x,y)); }   // its body, its long neck
    pR(S,15,11,3,2,Wt[2]); psP(S,16,10,Rs[4]); psLine(S,18,12,21,13,cI('#8a6a3a'),1);   // its head, its red crown, its bill
    pR(S,6,20,3,2,K[0]); psP(S,5,21,K[0]); psLine(S,11,24,10,30,K[0],1); psLine(S,13,24,13,30,K[0],1); psP(S,9,30,K[0]); psP(S,14,30,K[0]);   // the black tail, its legs
    return tOut(S,22,35); },
  dc_bonsai:()=>{ const S=PS(24,22), Bl=tRamp('#2a5a9a'), Tk=tRamp('#6a4a30'), G=cIR(['#16361e','#244e2a','#36703a','#58984a','#8ac060']), Sl=cI('#3a2414');   // a bonsai: a twisted pine in a shallow blue pot
    const P=[[12,15],[11,13],[10,11],[11,9],[13,8],[14,6]]; for(let i=0;i<P.length-1;i++){ const w=i<2?3:2; psLine(S,P[i][0],P[i][1],P[i+1][0],P[i+1][1],Tk[2],w); psLine(S,P[i][0]-1,P[i][1],P[i+1][0]-1,P[i+1][1],Tk[4],1); }   // the trunk, twisting up
    psLine(S,10,11,6,9,Tk[2],1); psLine(S,13,8,17,7,Tk[2],1); psLine(S,11,13,15,12,Tk[2],1);   // its branches
    const pad=(cx,cy,rx,ry)=>{ psDisc(S,cx,cy,rx,ry,(nx,ny,x,y)=>{ const h=tH(x*5,y*9); return ny>0.35?G[1]:ny<-0.4?(h<0.5?G[4]:G[3]):h<0.3?G[2]:G[3]; }); psDisc(S,cx-rx*0.4,cy+ry*0.55,rx*0.5,ry*0.5,()=>G[0]); };   // a cloud of needles, lit on top
    pad(6,8,4.4,2.4); pad(17,6,4.8,2.6); pad(13,3,3.6,2.1); pad(16,11,3,1.6);
    pR(S,3,15,18,1,Bl[4]); pR(S,4,15,16,1,Sl); psP(S,6,15,G[3]); psP(S,15,15,G[3]); psP(S,16,15,G[2]);   // the rim, the soil, a little moss
    pR(S,3,16,18,3,Bl[3]); pR(S,3,16,1,3,Bl[4]); pR(S,20,16,1,3,Bl[1]); pR(S,3,16,18,1,Bl[5]); pR(S,4,19,16,1,Bl[1]); pR(S,5,20,2,1,Bl[2]); pR(S,17,20,2,1,Bl[1]);   // the pot & its feet
    return tOut(S,12,20); },
  dc_tea:()=>{ const S=PS(24,20), K=cIR(['#0e0c12','#1a1620','#2a2432','#3e3646','#5a5064']), Rd=cI('#a82a20'), Cl=tRamp('#9a4a2a'), Ce=cIR(['#6a9a7a','#a8d0b0','#d8f0dc']), Te=cI('#7a4a1a');   // a tea table: low black lacquer, a clay teapot & two cups
    pR(S,2,10,20,3,K[3]); pR(S,2,10,20,1,K[4]); pR(S,2,13,20,1,Rd); pR(S,3,14,18,1,K[1]);   // the top, its red edge
    psLine(S,4,14,3,18,K[2],2); psLine(S,19,14,20,18,K[1],2); pR(S,2,18,3,1,K[2]); pR(S,19,18,3,1,K[1]);   // its curved legs
    psDisc(S,9,7.6,4.2,3,(nx,ny)=>{ const l=-0.6*nx-0.8*ny; return Cl[l>0.5?5:l>0.1?4:l>-0.4?3:2]; });   // the teapot's belly
    pR(S,7,4,5,1,Cl[4]); psP(S,9,3,Cl[5]); psP(S,9,2,Cl[3]);   // its lid & knob
    psLine(S,5,7,3,4,Cl[3],1); psP(S,2,4,Cl[4]); psP(S,13,5,Cl[2]); psP(S,14,6,Cl[2]); psP(S,14,7,Cl[2]); psP(S,13,8,Cl[2]);   // the spout, the handle
    for(const x of [15,19]){ pR(S,x,8,3,2,Ce[1]); psP(S,x,8,Ce[2]); psP(S,x+2,9,Ce[0]); pR(S,x,7,3,1,Ce[2]); psP(S,x+1,7,Te); }   // two cups, the tea in them
    return tOut(S,12,18); },
  /* (PT1 B7b) the last of the art, rows 31–42 & 49–60 — Forge · Glow · Bog, the four figureheads (carved to face her bow, to the right), the uniques & the rewards */
  dc_anvil:()=>{ const S=PS(24,24), I=cIR(['#0e1016','#1e222a','#343a44','#545c68','#8a94a2','#c8d0dc']), W=tRamp('#7a5234'), Hn=tRamp('#9a7448'), Fl=cIR(['#c0401a','#ff8a2a','#ffd060','#fff6c8']);   // a display anvil on its oak stump, a hammer leaned on it, a bar still glowing on its face
    for(let y=13;y<23;y++) for(let x=6;x<18;x++){ const u=(x-6)/11; let c=u<0.12?W[4]:u>0.86?W[1]:(x%3===1?W[2]:W[3]); if(tH(x*5,y*3)<0.1) c=W[1]; psP(S,x,y,c); }   // the stump, its bark
    pR(S,5,22,14,1,W[1]); psP(S,5,21,W[2]); psP(S,18,21,W[1]); pR(S,6,17,12,1,I[2]); psP(S,6,17,I[3]); psP(S,9,17,I[4]); psP(S,14,17,I[4]);   // its roots · an iron band, riveted
    pR(S,5,10,14,3,I[2]); pR(S,5,10,14,1,I[3]); pR(S,5,10,2,3,I[3]); pR(S,17,10,2,3,I[1]); pR(S,8,8,8,2,I[2]); pR(S,8,8,2,2,I[3]); pR(S,15,8,1,2,I[1]);   // the feet · the waist
    pR(S,3,5,18,3,I[3]); pR(S,3,7,18,1,I[1]); pR(S,3,3,18,2,I[4]); pR(S,3,3,12,1,I[5]); psP(S,18,3,I[0]); psP(S,19,3,I[1]);   // the face, lit along its top · the hardy hole
    pR(S,0,4,3,2,I[3]); pR(S,0,4,3,1,I[5]); psP(S,0,5,I[2]); pR(S,1,6,2,1,I[2]);   // the horn, tapering away to the left
    pR(S,21,3,2,4,I[2]); pR(S,21,3,2,1,I[4]);   // the heel
    pR(S,8,2,7,2,Fl[1]); pR(S,9,2,5,1,Fl[2]); pR(S,10,2,3,1,Fl[3]); psP(S,8,3,Fl[0]); psP(S,14,3,Fl[0]);   // a bar on the face, still hot from the fire
    psLine(S,20,22,22,15,Hn[2],2); psLine(S,20,22,22,15,Hn[4],1); psP(S,21,22,Hn[1]);   // the hammer, head down on the planks, its haft leaned on the stump
    pR(S,18,20,5,3,I[3]); pR(S,18,20,5,1,I[5]); pR(S,18,22,5,1,I[1]); pR(S,22,20,1,3,I[2]); return tOut(S,12,23); },
  dc_ember:()=>{ const S=PS(16,32), I=cIR(['#0e0c10','#1e1a20','#342e36','#4e4650','#766c78','#a89aa8']), Fl=cIR(['#6a1a0c','#c0381a','#f07a24','#ffc048','#fff2c0']), cx=7.5, HW=[6,6,5.8,5.5,5.1,4.6,4.1,3.5,2.9,2.3];   // an ember cage lamp: an iron basket of glowing coals on a post, sparks flicking up
    psLine(S,8,24,2,31,I[3],1); psLine(S,8,24,14,31,I[1],1); pR(S,7,24,2,7,I[2]); pR(S,1,31,3,1,I[2]); pR(S,13,31,3,1,I[1]); pR(S,6,30,4,1,I[1]);   // its foot: three iron legs
    pR(S,7,14,2,11,I[3]); pR(S,7,14,1,11,I[4]); pR(S,6,19,4,1,I[2]); psP(S,6,19,I[4]);   // the post, a collar
    for(let j=0;j<10;j++){ const y=4+j, hw=HW[j], a=Math.round(cx-hw), b=Math.round(cx+hw)-1;
      for(let x=a;x<=b;x++){ const u=(x-a)/Math.max(1,b-a); let c=0;
        if(j>=3){ const h=tH(x*7,y*13), hot=1-Math.abs(u-0.5)*1.6-(j-3)*0.07; c=Fl[h<0.15?1:hot>0.72?4:hot>0.45?3:2]; }   // the coals, white-hot at their heart
        else if(j>=1 && (x+j)%3===0) c=Fl[j===1?2:3];   // flames licking up between the bars
        if(c) psP(S,x,y,c); }
      for(const u of [0,0.34,0.66,1]) psP(S,Math.round(a+u*(b-a)),y,I[u===0?4:u===1?1:2]); }   // the cage's bars
    for(const [y,k] of [[4,4],[9,3],[13,2]]){ const hw=HW[y-4], a=Math.round(cx-hw); pR(S,a,y,Math.round(cx+hw)-a,1,I[k]); }   // its rim & bands
    psLine(S,3,4,5,1,I[3],1); psLine(S,5,1,10,1,I[4],1); psLine(S,10,1,12,4,I[2],1);   // its handle
    return Object.assign(tOut(S,8,31),{gx:8, gy:9, spark:1}); },
  dc_rack:()=>{ const S=PS(40,26), Wd=tRamp('#6a4428'), St=cIR(['#2e323c','#5e6470','#9aa2ae','#ced4dc','#ffffff']), Br=tRamp('#c8983e'), Lt=tRamp('#5a3420'), Ash=tRamp('#a07a4a');   // a weapon rack: two cutlasses crossed over an oak board, a boarding pike racked above them
    pR(S,2,9,36,9,Wd[3]); pR(S,2,9,36,1,Wd[5]); pR(S,2,10,36,1,Wd[4]); pR(S,2,17,36,1,Wd[1]); pR(S,2,9,1,9,Wd[4]); pR(S,37,9,1,9,Wd[1]); for(let x=4;x<36;x++){ if(tH(x*3,13)<0.15) psP(S,x,13,Wd[2]); if(tH(x*5,15)<0.1) psP(S,x,15,Wd[2]); }   // the board, its grain
    for(const x of [6,19,32]){ pR(S,x,7,2,3,Br[3]); psP(S,x,7,Br[5]); }   // three brass pegs
    pR(S,1,5,31,2,Ash[3]); pR(S,1,5,31,1,Ash[4]); pR(S,0,5,2,2,Br[2]); psP(S,0,5,Br[4]);   // the pike's ash shaft, its butt-cap
    pR(S,30,4,3,4,St[1]); psPoly(S,[[32,3.5],[36,4.2],[39.6,6],[36,7.8],[32,8.5]],(x,y)=>y<6?St[3]:St[2]); psP(S,35,5,St[4]); psLine(S,31,8,30,11,St[2],1); psP(S,29,11,St[3]);   // its socket, its leaf-blade, the boarding hook
    const cut=(hx,hy,tx,ty,s)=>{ let ax=tx-hx, ay=ty-hy; const L=Math.hypot(ax,ay); ax/=L; ay/=L; const nx=-ay*s, ny=ax*s;
      for(let i=0;i<=90;i++){ const t=i/90, bow=Math.sin(t*Math.PI)*2.2, px=hx+ax*L*t+nx*bow, py=hy+ay*L*t+ny*bow;
        psP(S,px-nx,py-ny,St[1]); psP(S,px,py,St[t<0.92?2:3]); if(t<0.86) psP(S,px+nx,py+ny,St[3]); if(t>0.1 && t<0.7 && i%7===0) psP(S,px+nx,py+ny,St[4]); }   // the blade: its spine, its curve, the edge's shine
      for(let k=1;k<=3;k++){ psP(S,hx-ax*k,hy-ay*k,Lt[k&1?2:4]); psP(S,hx-ax*k+nx*0.7,hy-ay*k+ny*0.7,Lt[1]); }   // the grip, bound in leather
      psDisc(S,hx-ax*1.6-nx*1.4,hy-ay*1.6-ny*1.4,2.2,2.2,(qx,qy)=>qx*qx+qy*qy>0.45?(qx+qy<0?Br[5]:Br[2]):0);   // the brass basket round the hand
      for(let k=-2;k<=3;k++) psP(S,hx+nx*k*0.8,hy+ny*k*0.8,Br[k<0?4:3]);   // the guard
      psP(S,hx-ax*4.3,hy-ay*4.3,Br[5]); psP(S,hx-ax*4.9,hy-ay*4.9,Br[2]); };   // the pommel
    cut(10,19,29,1,1); cut(30,19,11,1,-1); return tOut(S,20,25); },
  dc_basalt:r=>{ const B=cIR(['#121016','#1e1a22','#2c2830','#3e3944','#58525e','#7a7482']), Fl=cIR(['#8a2a10','#e0581a','#ff9a30','#ffd870','#fff6d0']);   // a basalt table: a dark stone slab, an ember vein glowing through it
    const vein=(S,P)=>{ for(let i=0;i<P.length-1;i++) psLine(S,P[i][0],P[i][1],P[i+1][0],P[i+1][1],Fl[2],1); for(const p of P) psP(S,p[0],p[1],Fl[3]); };
    if(r&1){ const S=PS(24,50);   // end on: the slab running away from you
      for(let y=5;y<40;y++) for(let x=3;x<21;x++){ const h=tH(x*7,y*5); psP(S,x,y, x<5?B[4]:x>18?B[2]:h<0.12?B[2]:h>0.9?B[4]:B[3]); }
      vein(S,[[9,5],[11,11],[9,17],[13,24],[11,31],[14,39]]); psP(S,10,14,Fl[1]); psP(S,12,28,Fl[1]); psP(S,12,24,Fl[4]);
      pR(S,3,40,18,1,B[5]); pR(S,3,41,18,3,B[2]); pR(S,3,41,1,3,B[3]); psP(S,14,41,Fl[2]); psP(S,14,42,Fl[1]);   // its near edge, the vein showing through
      pR(S,7,44,10,4,B[2]); pR(S,7,44,2,4,B[3]); pR(S,15,44,2,4,B[1]); pR(S,5,48,14,2,B[1]); pR(S,5,48,14,1,B[3]);   // the pedestal
      return tOut(S,12,49); }
    const S=PS(42,30);
    for(let y=8;y<15;y++) for(let x=2;x<40;x++){ const h=tH(x*7,y*5); psP(S,x,y, y===8?B[5]:h<0.12?B[2]:h>0.9?B[4]:B[3]); }   // the slab's top, rough-hewn
    vein(S,[[2,12],[8,10],[13,12],[19,9],[25,11],[31,9],[36,12],[39,11]]); psP(S,16,11,Fl[1]); psP(S,28,10,Fl[1]); psP(S,19,9,Fl[4]);   // the ember vein
    pR(S,2,15,38,3,B[2]); pR(S,2,15,38,1,B[4]); pR(S,2,18,38,1,B[1]); psLine(S,36,15,37,17,Fl[2],1);   // its thick front edge, the vein running over it
    for(const x0 of [6,28]){ pR(S,x0,19,8,9,B[2]); pR(S,x0,19,2,9,B[3]); pR(S,x0+6,19,2,9,B[1]); pR(S,x0-1,27,10,2,B[1]); pR(S,x0-1,27,10,1,B[3]); for(let y=20;y<27;y+=3) psP(S,x0+3,y,B[1]); }   // two chiselled pedestals
    psP(S,32,22,Fl[1]); psP(S,32,23,Fl[2]); psP(S,31,24,Fl[1]);   // a crack in one, glowing
    return tOut(S,21,29); },
  dc_crystal:()=>{ const S=PS(20,26), Cy=cIR(['#14405a','#226e8e','#3ea8c4','#7ee0ee','#c4faff','#ffffff']), Rk=tRamp('#5a5464'), Vi=tRamp('#8a5ac8');   // a crystal lamp: a cyan cluster on a stone, lit from within
    for(let y=18;y<25;y++){ const hw=[6,7.5,8,8,7.6,7,6][y-18]; for(let x=Math.round(10-hw);x<Math.round(10+hw);x++){ const u=(x-(10-hw))/(2*hw); psP(S,x,y, y===18?Rk[4]:u<0.2?Rk[4]:u>0.8?Rk[1]:tH(x*5,y*7)<0.2?Rk[2]:Rk[3]); } }   // the stone, lumpy
    psP(S,4,20,Vi[3]); psP(S,5,19,Vi[4]); psP(S,15,21,Vi[3]); psP(S,14,20,Vi[4]);   // violet shards in it
    const prism=(x0,w,yt,yb,lean)=>{ for(let y=yt;y<=yb;y++){ const t=(y-yt)/Math.max(1,yb-yt), off=Math.round(lean*(1-t)), tip=y<yt+Math.ceil(w/2);
        for(let i=0;i<w;i++){ if(tip && Math.abs(i-(w-1)/2)>(y-yt)+0.5) continue; const u=i/(w-1); psP(S,x0+off+i,y, u<0.3?Cy[4]:u<0.55?Cy[3]:u<0.8?Cy[2]:Cy[1]); } } };   // a prism: its lit face, its dark face, a point
    prism(2,4,9,19,-2); prism(13,4,7,19,2); prism(7,6,1,19,0); prism(11,3,12,19,1);
    pR(S,9,4,1,12,Cy[5]); psP(S,10,9,Cy[5]); psP(S,4,12,Cy[5]); psP(S,15,10,Cy[5]);   // the light inside, a hard glint
    return Object.assign(tOut(S,10,25),{gx:10, gy:10, spk:[[-14,10],[14,8]]}); },
  dc_glowcap:()=>{ const S=PS(22,28), P=tRamp('#8a4ac8'), St=cIR(['#a898a8','#d8ccd0','#f4ecec']), Sp=cIR(['#7ae8f0','#d0fcff']), Po=tRamp('#4a5a6a'), Sl=cI('#2a1e18'), M=tRamp('#3a7a4a');   // a potted glowcap: a purple cap speckled with glowing spots, a little one beside it, in a stone pot
    for(let y=21;y<27;y++){ const ins=Math.floor((y-21)*0.4); for(let x=5+ins;x<=16-ins;x++){ const u=(x-5-ins)/(11-2*ins); psP(S,x,y,u<0.15?Po[4]:u<0.35?Po[3]:u<0.8?Po[2]:Po[1]); } }   // the pot
    pR(S,4,19,14,2,Po[3]); pR(S,4,19,14,1,Po[4]); pR(S,5,20,12,1,Sl); psP(S,6,20,M[3]); psP(S,7,20,M[2]); psP(S,14,20,M[2]); pR(S,7,27,8,1,Po[1]);   // its rim, the soil & a little moss
    pR(S,15,14,2,6,St[1]); psP(S,15,14,St[2]); psDisc(S,16,13,3.2,2,(nx,ny)=>ny>0.3?P[1]:ny<-0.2?P[4]:P[3]); psP(S,15,12,Sp[1]);   // a little one beside it
    pR(S,9,9,4,11,St[1]); pR(S,9,9,1,11,St[2]); pR(S,12,9,1,11,St[0]); pR(S,8,15,6,1,St[1]); psP(S,8,15,St[2]);   // the stem, its ring
    psDisc(S,11,9.5,9.4,7.2,(nx,ny)=>{ if(ny>0.22) return 0; const l=-0.5*nx-0.85*ny; return P[l>0.75?5:l>0.45?4:l>0.1?3:2]; });   // the cap, domed
    for(let x=3;x<20;x++){ psP(S,x,10,(x&1)?P[1]:P[0]); psP(S,x,11,x>5&&x<17?P[0]:0); }   // its gills under the rim
    for(const [x,y] of [[6,6],[10,3],[14,5],[8,8],[17,8],[12,7],[4,9]]){ psP(S,x,y,Sp[1]); psP(S,x+1,y,Sp[0]); psP(S,x,y+1,Sp[0]); }   // the glowing spots
    return Object.assign(tOut(S,11,27),{gx:11, gy:5}); },
  dc_starrug:()=>{ const W=60, S=PS(W,W), Bl=cIR(['#0c1230','#141c44','#1c2858','#26346c']), G=tRamp('#d8a840'), Wt=cIR(['#8a9ac8','#e8eeff']), Ln=cI('#4a5aa0');   // a star-map rug: deep blue, gold stars & their constellations, a gold sun at its heart, a crescent moon
    for(let y=1;y<W-1;y++) for(let x=1;x<W-1;x++){ const e=Math.min(x-1,y-1,W-2-x,W-2-y); let c;
      if(e===0) c=G[1]; else if(e<=2) c=G[e===1?4:3]; else if(e===3) c=Bl[0]; else if(e===5) c=((x+y)&1)?G[2]:Bl[1];
      else { const n=vnoise(x/9+1.3,y/9+4.1); c=Bl[n>0.62?3:n>0.45?2:1]; if(tH(x*13,y*7)<0.014) c=Wt[0]; }   // the night, its faint stars
      psP(S,x,y,c); }
    const C=[[[10,12],[16,9],[22,13],[20,19],[13,18]], [[39,9],[45,13],[51,10],[48,18]], [[9,40],[14,46],[11,51],[19,50]], [[41,45],[46,40],[51,46],[47,51],[40,51]]];
    for(const L of C){ for(let i=0;i<L.length-1;i++) psLine(S,L[i][0],L[i][1],L[i+1][0],L[i+1][1],Ln,1); for(const [x,y] of L){ psP(S,x,y,G[5]); psP(S,x-1,y,G[3]); psP(S,x+1,y,G[3]); psP(S,x,y-1,G[3]); psP(S,x,y+1,G[3]); } }   // the constellations
    for(let a=0;a<64;a++){ if(a&1) continue; const t=a/64*Math.PI*2; psP(S,30+Math.cos(t)*11.5,30+Math.sin(t)*11.5,G[2]); }   // a dotted gold ring
    for(let k=0;k<8;k++){ const t=k/8*Math.PI*2, L=k&1?6:9; for(let i=5;i<=L;i++) psP(S,30+Math.cos(t)*i,30+Math.sin(t)*i,i>L-2?G[3]:G[4]); }   // the sun's rays
    psDisc(S,30,30,4.6,4.6,(nx,ny)=>{ const l=-0.6*nx-0.7*ny; return G[l>0.5?5:l>0?4:3]; }); psP(S,29,29,cI('#fffbe8'));   // the sun
    psDisc(S,30.5,8.5,3.6,3.6,()=>Wt[1]); psDisc(S,32.1,7.6,3,3,(nx,ny,x,y)=>{ const e=Math.min(x-1,y-1,W-2-x,W-2-y), n=vnoise(x/9+1.3,y/9+4.1); return e<=5?0:Bl[n>0.62?3:n>0.45?2:1]; });   // a crescent moon
    return psCv(psOut(S,cI(OLC),false),0,0); },
  dc_orrery:(r,f)=>{ const S=PS(24,32), Br=tRamp('#c8983e'), Wd=tRamp('#5a3a22'), Su=cIR(['#d0701a','#ffa830','#ffdc6a','#fffbe0']), hx=12, hy=18, a=((f|0)%8)/8*Math.PI*2;   // a brass orrery: the sun on its column, two planets on their arms (spun, 8 frames carry them round)
    psDisc(S,12,28.6,8.4,2.4,(nx,ny)=>ny<-0.3?Wd[4]:Wd[3]); pR(S,4,29,17,2,Wd[2]); pR(S,4,29,1,2,Wd[3]); pR(S,4,31,17,1,Wd[1]);   // the walnut plinth
    const P=[[a*2+0.6,6,2.2,'#4a7ae0','#b8d4ff',1.5,0],[a+2.4,10.5,3.6,'#c85a3a','#f4a880',2.2,1]];
    const arm=(p,front)=>{ const s=Math.sin(p[0]); if((s>=0)!==front) return; const ex=hx+Math.cos(p[0])*p[1], ey=hy+s*p[2], py=ey-5;
      psLine(S,hx,hy,ex,ey,Br[front?3:2],1); pR(S,Math.round(ex),Math.round(py),1,5,Br[front?4:2]);   // its arm, its little post
      psDisc(S,ex+0.5,py,p[5],p[5],(nx,ny)=>nx+ny<-0.4?cI(p[4]):cI(p[3]));   // the planet
      if(p[6]){ psP(S,ex-2.6,py+1,Br[5]); psP(S,ex-1.6,py+1,Br[4]); psP(S,ex+2.6,py-0.5,Br[4]); psP(S,ex+3.4,py-1,Br[5]); }   // (the outer one ringed)
      else { const m=a*5; psP(S,ex+0.5+Math.cos(m)*2.6,py+Math.sin(m)*1.2-0.5,cI('#f4f4ff')); } };   // (the inner one's moon)
    for(const p of P) arm(p,false);
    pR(S,11,11,2,18,Br[3]); pR(S,11,11,1,18,Br[5]); pR(S,10,17,4,2,Br[2]); pR(S,10,17,4,1,Br[4]); pR(S,10,25,4,2,Br[2]); pR(S,10,25,4,1,Br[5]);   // the column, its hub & collar
    psDisc(S,12,8.5,3.4,3.4,(nx,ny)=>{ const l=-0.6*nx-0.7*ny; return Su[l>0.5?3:l>0?2:l>-0.5?1:0]; }); for(const [dx,dy] of [[0,-5],[5,0],[-5,0],[4,-4],[-4,-4]]) psP(S,12+dx,8.5+dy,Su[1]);   // the sun, its rays
    for(const p of P) arm(p,true);
    return tOut(S,12,31); },
  dc_flowers:r=>{ const Bx=tRamp('#3a7a3a'), Wd=tRamp('#7a5230'), Sl=cI('#3a2414'), G=cIR(['#1e4a22','#2e6a32','#4e9a42','#86cc5e']), Pk=cIR(['#b8406a','#e8709a','#ffb0c8']), Yl=cIR(['#8a5a20','#f0c030','#fff08a']), Wt=cIR(['#c8ccd0','#ffffff']);   // a flower box: a green-painted planter, pink & yellow flowers, a few white ones
    const bloom=(S,x,y,k)=>{ if(k===0){ psP(S,x,y,Yl[1]); psP(S,x-1,y,Pk[2]); psP(S,x,y-1,Pk[2]); psP(S,x+1,y,Pk[1]); psP(S,x,y+1,Pk[1]); psP(S,x+1,y-1,Pk[0]); }   // a pink one
      else if(k===1){ pR(S,x-1,y-1,3,3,Yl[1]); psP(S,x-1,y-1,Yl[2]); psP(S,x,y-1,Yl[2]); psP(S,x,y,Yl[0]); psP(S,x+1,y+1,cI('#c89020')); }   // a yellow one
      else { psP(S,x,y,Wt[1]); psP(S,x+1,y,Wt[0]); psP(S,x,y-1,Wt[0]); } };   // a little white one
    const clov=(S,x0,y0)=>{ const A=DECOR_DEV.clover; for(let j=0;j<5;j++) for(let i=0;i<5;i++) if(A[j][i]==='#') psP(S,x0+i,y0+j,Wt[1]); };
    if(r&1){ const S=PS(24,46);   // end on: the box running away from you, the flowers along it
      for(let y=3;y<38;y++){ psP(S,3,y,Bx[4]); psP(S,4,y,Bx[3]); psP(S,19,y,Bx[2]); psP(S,20,y,Bx[1]); for(let x=5;x<19;x++){ const h=tH(x*5,y*3); psP(S,x,y,h<0.5?G[1]:h<0.8?G[2]:G[0]); } }   // its rims, the foliage within
      pR(S,3,2,18,1,Bx[4]);
      for(let i=0;i<14;i++){ const x=6+((i*7)%12), y=5+i*2.4|0; bloom(S,x,y,i%3===1?1:i%4===3?2:0); }
      pR(S,3,38,18,1,Bx[5]); pR(S,3,39,18,5,Bx[3]); pR(S,3,39,1,5,Bx[4]); pR(S,20,39,1,5,Bx[1]); pR(S,3,41,18,1,Bx[2]); pR(S,4,44,3,2,Wd[2]); pR(S,17,44,3,2,Wd[1]);   // its near end, its feet
      return tOut(S,12,45); }
    const S=PS(42,26);
    for(let y=9;y<14;y++) for(let x=3;x<39;x++){ const h=tH(x*7,y*3); if(y===9 && h<0.5) continue; psP(S,x,y,h<0.3?G[1]:h<0.75?G[2]:G[3]); }   // the foliage
    const X=[5,8,11,14,17,20,23,26,29,32,35,37];
    for(let i=0;i<X.length;i++){ const x=X[i], h=4+((i*5)%4)+(i%3===0?2:0), y=10-h, k=i%3===1?1:i%5===4?2:0; psLine(S,x,10,x,y+1,G[1],1); psP(S,i&1?x-1:x+1,y+3,G[3]); bloom(S,x,y,k); }   // the flowers, on their stems
    pR(S,2,13,38,1,Sl); pR(S,2,14,38,1,Bx[5]); pR(S,2,15,38,8,Bx[3]); pR(S,2,15,1,8,Bx[4]); pR(S,39,15,1,8,Bx[1]); pR(S,2,18,38,1,Bx[2]); pR(S,2,23,38,1,Bx[1]); clov(S,19,16);   // the green box, its planks, a white clover painted on it
    pR(S,3,24,3,2,Wd[2]); pR(S,36,24,3,2,Wd[1]); return tOut(S,21,25); },
  dc_wicker:r=>{ const S=PS(16,25), K=cIR(['#6a5432','#9a7e50','#c4a874','#e0c890','#f0dcaa','#fbf2d8']), f=DECOR_FACE[r&3], wv=(x,y)=>((x+((y>>1)&1))&1)===0;   // the wicker chair: a tall back of pale basket-weave, rounded at the top (4 facings)
    const back=dk=>{ for(let y=0;y<14;y++){ const rr=y<3?[3,1,0][y]:0; for(let x=2+rr;x<=13-rr;x++){ const e=x===2+rr||x===13-rr||y===0; psP(S,x,y, e?(dk?K[1]:x<8?K[4]:K[2]) : wv(x,y)?K[dk?2:(y<5?5:4)]:K[dk?1:2]); } } };   // (its rim of thick cane, the weave within)
    const legs=(far,near)=>{ pR(S,4,17,1,6,K[far]); pR(S,11,17,1,6,K[far]); psLine(S,2,17,1,23,K[near],1); psLine(S,13,17,14,23,K[near-1],1); pR(S,2,21,12,1,K[1]); };
    if(f===0){ back(0); pR(S,1,14,14,2,K[4]); pR(S,1,14,14,1,K[5]); pR(S,1,16,14,1,K[2]); legs(1,4); return Object.assign(tOut(S,8,24),{seat:14}); }   // (facing you: the back behind the seat)
    if(f===1){ pR(S,1,14,14,2,K[2]); legs(2,3); back(1); return Object.assign(tOut(S,8,24),{seat:99}); }   // (its back to you)
    for(let y=0;y<16;y++){ const x=11+Math.round((15-y)/15*1.5); pR(S,x,y,3,1,K[(y&1)?3:2]); psP(S,x,y,K[4]); psP(S,x+2,y,K[1]); }   // side on: the tall back edge-on, raked — facing left
    pR(S,1,14,13,1,K[4]); pR(S,1,15,13,1,K[3]); pR(S,1,16,13,1,K[2]); psP(S,1,14,K[5]);   // the seat
    psLine(S,3,17,2,23,K[3],1); psLine(S,12,17,13,23,K[2],1); pR(S,3,21,10,1,K[1]);   // the legs, a stretcher
    if(f===3) decorFlip(S); return Object.assign(tOut(S,8,24),{seat:14}); },
  dc_ragrug:()=>{ const W=40, S=PS(W,W), C=['#b8483a','#d8a040','#6a9a5a','#4a6a9a','#e8dcc0','#8a4a6a','#c87a4a'].map(tRamp);   // a rag rug: a braided oval of mixed rags, round and round
    for(let y=1;y<W-1;y++) for(let x=1;x<W-1;x++){ const nx=(x+0.5-20)/18.6, ny=(y+0.5-20)/16.4, e=nx*nx+ny*ny; if(e>1) continue;
      const rr=Math.sqrt(e)*9.3, ring=Math.floor(rr), sub=rr-ring, ang=Math.atan2(ny,nx), R=C[(ring*3)%C.length], st=Math.floor((ang+Math.PI)/(Math.PI*2)*(8+ring*7)+sub*2)&1;   // (each braid a rag of its own, plaited)
      psP(S,x,y, ring===0?C[4][4] : sub>0.8?R[1] : st?(sub<0.35?R[4]:R[3]):R[2]); }
    return psCv(psOut(S,cI(OLC),false),0,0); },
  dc_firefly:()=>{ const S=PS(14,20), Gl=cIR(['#24403e','#365e5a','#527e76','#a0c8be','#e4fff4']), Cl=tRamp('#e4dcc4'), Tw=cI('#8a6a3a'), Ff=cIR(['#7a9a2a','#d8ff6a','#fbffd0']);   // a firefly jar: glass, a cloth tied over its mouth, little lights inside
    for(let y=6;y<19;y++){ const rd=y===6||y===18?2:y===7||y===17?1:0; for(let x=2+rd;x<=11-rd;x++) psP(S,x,y, x===2+rd?Gl[3]:x===11-rd||y===18?Gl[0]:x===3+rd && y<15?Gl[4]:Gl[1]); }   // the jar's glass, its shine
    pR(S,4,5,6,1,Gl[2]); pR(S,4,4,6,1,Gl[3]);   // its neck
    pR(S,3,1,8,3,Cl[3]); pR(S,3,1,8,1,Cl[4]); psP(S,4,2,Cl[5]); psP(S,9,2,Cl[2]); pR(S,3,4,8,1,Tw); psP(S,2,4,Cl[2]); psP(S,11,4,Cl[1]); psP(S,2,5,Cl[3]); psP(S,11,5,Cl[2]);   // the cloth tied over it, the twine
    for(const [x,y,k] of [[5,10,1],[8,8,2],[9,13,1],[5,15,1],[7,12,2],[8,16,0]]) psP(S,x,y,Ff[k]);   // the fireflies
    return Object.assign(tOut(S,7,19),{gx:7, gy:12, fly:[[-2,-2],[1,-4],[2,1],[-2,3],[0,0],[1,4]]}); },
  fg_mermaid:()=>{ const S=PS(18,26), Sk=tRamp('#e0aa80'), Hr=tRamp('#e0b030'), T=tRamp('#2a9a6a'), Sh=cIR(['#c86a8a','#f4a8c0']);   // the mermaid figurehead: gold hair streaming back, arms swept behind her, a green tail curling under (she faces the bow)
    const tail=[[9,13],[8.6,15.5],[7.4,18],[5.8,20.2],[4.4,21.4]]; for(let i=0;i<tail.length-1;i++){ const w=i<2?3:2; psLine(S,tail[i][0],tail[i][1],tail[i+1][0],tail[i+1][1],T[2],w); psLine(S,tail[i][0]+0.8,tail[i][1],tail[i+1][0]+0.8,tail[i+1][1],T[4],1); }   // the tail
    for(const [x,y] of [[9,14],[8,16],[7,18],[9,16]]) psP(S,x,y,T[1]);   // its scales
    psPoly(S,[[4.4,21],[0.6,19.6],[1.2,23],[3.6,22.4]],()=>T[3]); psPoly(S,[[4.6,21.6],[5.4,25.4],[7.8,24.4],[5.6,21.4]],()=>T[2]); psP(S,1,20,T[5]);   // its flukes
    psLine(S,9,13,11,8,Sk[3],3); psLine(S,10,13,12,8,Sk[2],1); psP(S,12,9,Sh[1]); psP(S,12,10,Sh[0]); psP(S,11,10,Sh[1]);   // her body, a shell
    psLine(S,10,8,7,10,Sk[3],2); psLine(S,7,10,5,12,Sk[2],1);   // her arms, swept back
    psDisc(S,12.6,4.8,2.6,2.8,(nx,ny)=>nx+ny<-0.4?Sk[4]:Sk[3]); psP(S,15,4,Sk[3]); psP(S,15,5,Sk[2]); psP(S,14,6,Sk[1]); psP(S,13,4,cI('#2a1a14'));   // her head: nose, lips, an eye
    psPoly(S,[[10,2],[12,1],[14.4,1.8],[13,3.4],[11.4,4.4],[10.6,7],[9.2,10],[7,11.4],[5,11],[7,8.6],[8.6,5]],(x,y)=>(x+y*2)%5===0?Hr[5]:y<4?Hr[4]:(x+y)%3===0?Hr[2]:Hr[3]);   // her hair, streaming back
    psP(S,3,11,Hr[2]); psP(S,4,12,Hr[3]); return tOut(S,2,13); },
  fg_lion:()=>{ const S=PS(21,21), G=cIR(['#5a3408','#8a5a14','#b8821c','#e0aa30','#f6d466','#fff2c0']), Mn=cIR(['#5e3608','#8e5a16','#b47e22','#d4a034','#ecc254']), Rd=tRamp('#d0302a'), K=cI('#2a1406');   // the gilded lion: a great mane in tufts, his gold face thrust out to the bow, mouth open, his red tongue lolling
    psDisc(S,8,10.5,7.8,9,(nx,ny,x,y)=>{ const a=Math.atan2(ny,nx), tf=((a*8/Math.PI)%2+2)%2, e=nx*nx+ny*ny; if(e>0.8 && tf>1.35) return 0; const l=-0.5*nx-0.7*ny; return tf<0.22||e>0.93?Mn[0]:Mn[l>0.45?4:l>0?3:l>-0.4?2:1]; });   // the mane, in tufts
    const face=(o,c)=>{ psDisc(S,11.6,9.4,3.9+o,3.7+o,()=>c); psDisc(S,15.2,11.8,3.3+o,2.4+o,()=>c); psDisc(S,11.8,13.4,2.4+o,1.8+o,()=>c); };
    face(1,G[0]); face(0,G[3]);   // his face, ringed dark against the mane
    psDisc(S,11.4,8.6,3,2.6,(nx,ny)=>nx+ny<-0.2?G[5]:G[4]); psDisc(S,15.4,11,2.4,1.4,(nx,ny)=>ny<-0.2?G[5]:G[4]);   // the light on his brow & muzzle
    pR(S,12,7,4,1,G[5]); pR(S,13,8,2,1,K); psP(S,15,8,G[1]);   // a heavy brow, his eye under it
    psDisc(S,9.6,4.4,1.8,1.6,(nx,ny)=>nx*nx+ny*ny>0.5?G[1]:G[3]);   // an ear
    pR(S,17,9,2,2,cI('#4a2410')); psP(S,18,9,cI('#7a4020'));   // his nose
    for(const [x,y] of [[14,11],[16,12],[15,11]]) psP(S,x,y,G[2]);   // whisker spots
    pR(S,14,13,5,1,cI('#3a0c08')); pR(S,14,14,4,1,G[2]); psP(S,18,12,cI('#ffffff')); psP(S,14,14,cI('#ffffff'));   // the open mouth, its fangs
    pR(S,16,14,2,3,Rd[3]); psP(S,16,14,Rd[4]); psP(S,17,16,Rd[2]); psP(S,16,17,Rd[1]);   // the tongue, lolling
    return tOut(S,1,11); },
  fg_dragon:()=>{ const S=PS(19,22), T=tRamp('#2a8a8a'), Bl=cIR(['#8ab8a0','#c8e8d0']), Fn=tRamp('#e8745a'), Wt=cI('#fffaf0');   // the sea-dragon: a teal serpent's head on a curling neck, a coral fin crest (it faces the bow)
    const nk=[[3,21],[4.6,17.6],[4.4,14.4],[6,11.6],[8.4,9.6]]; for(let i=0;i<nk.length-1;i++){ psLine(S,nk[i][0],nk[i][1],nk[i+1][0],nk[i+1][1],T[2],4); psLine(S,nk[i][0]+1.6,nk[i][1]+0.4,nk[i+1][0]+1.6,nk[i+1][1]+0.6,Bl[i&1],1); }   // the neck, its pale belly
    for(let i=0;i<4;i++){ const x=nk[i][0]-1.4, y=nk[i][1]-1; psLine(S,x,y,x-2.4,y-1.6,Fn[3],1); psP(S,x-1,y,Fn[2]); }   // the crest down its neck
    psPoly(S,[[7.6,6],[12,5.6],[16,7.4],[18.4,9],[17.6,10.2],[12.6,10.4],[9,11.6],[7,9.4]],(x,y)=>y<7?T[4]:y<9?T[3]:T[2]);   // the head, the long snout
    psPoly(S,[[10,11.2],[17.4,11.6],[16,13],[11,13]],()=>T[1]); pR(S,11,11,6,1,cI('#3a1418')); psP(S,13,11,Wt); psP(S,16,11,Wt); psP(S,15,10,Wt);   // the open jaw, its teeth
    psP(S,11,7,cI('#ffd23f')); psP(S,12,7,cI('#2a1a0a')); psP(S,17,8,T[1]);   // a yellow eye, a nostril
    psPoly(S,[[8,6],[6.4,1.4],[8.6,3.4],[9.4,0.6],[10.6,4],[12,2],[12,5.8]],(x,y)=>y<3?Fn[4]:Fn[3]);   // the fin crest on its head
    psLine(S,12,13,10,16,T[1],1); psP(S,9,17,T[3]); return tOut(S,2,15); },
  fg_owl:()=>{ const S=PS(16,21), O=tRamp('#c89a64'), Gd=cIR(['#a86a10','#ffd23f','#fff4a0']), K=cI('#2a1a0e');   // the Guild's owl, carved in pale oak: ear tufts, wide gold eyes, its wings folded, gripping a scroll
    psDisc(S,8,11.5,5.6,7.2,(nx,ny)=>{ const l=-0.5*nx-0.7*ny; return O[l>0.5?5:l>0.1?4:l>-0.3?3:2]; });   // its body
    for(const s of [-1,1]) psPoly(S,[[8+s*5.6,8],[8+s*6.2,14],[8+s*4,18],[8+s*3.6,11]],()=>O[s<0?3:1]);   // the folded wings
    for(const [x,y] of [[3,11],[3,13],[13,12],[13,14]]) psP(S,x,y,O[1]);   // their feathers, carved
    for(const y of [12,14,16]) for(let i=-2;i<=2;i++) psP(S,8+i,y+Math.abs(i)*0.5,O[2]);   // chevrons on its breast
    psPoly(S,[[3.4,2],[5.6,4.4],[10.4,4.4],[12.6,2],[12.4,6],[3.6,6]],()=>O[4]); psP(S,3,1,O[3]); psP(S,12,1,O[2]);   // its ear tufts
    psDisc(S,8,7,4.6,2.8,()=>O[5]);   // the face
    for(const x of [6,10]){ psDisc(S,x,7,1.7,1.7,(nx,ny)=>nx+ny<-0.4?Gd[2]:Gd[1]); psP(S,x+(x>8?0:0),7,K); }   // its gold eyes
    psP(S,8,8,Gd[0]); psP(S,8,9,cI('#7a4a10'));   // its beak
    pR(S,3,18,10,2,cI('#f0e2c0')); pR(S,3,18,10,1,cI('#fffaf0')); psP(S,2,18,cI('#c8b890')); psP(S,13,19,cI('#c8b890')); for(const x of [5,7,9,11]) psP(S,x,17,Gd[0]);   // the scroll it grips, its talons
    return tOut(S,1,12); },
  dc_desk:r=>{ const M=tRamp('#6a3a22'), Br=tRamp('#c8983e'), Lh=tRamp('#3a5a3a'), Pp=cIR(['#c8b890','#ece0c0','#fff8e4']), Wx=cIR(['#ccb48a','#f8eccc']), Fl=cIR(['#ff9a30','#ffe080','#fffbe8']);   // the old captain's desk: a roll-top, its pigeonholes stuffed with papers, a candle burning on it
    const candle=(S,x,y)=>{ pR(S,x-1,y+5,3,1,Br[3]); psP(S,x-2,y+5,Br[4]); psP(S,x+2,y+5,Br[1]); pR(S,x,y+1,1,4,Wx[1]); psP(S,x,y+1,Wx[0]); psP(S,x,y,Fl[1]); psP(S,x,y-1,Fl[2]); psP(S,x-1,y,Fl[0]); };   // (a candle in a brass dish)
    if(r&1){ const S=PS(26,52);   // end on: its long top running away from you, the hood along its back
      for(let y=7;y<38;y++){ for(let x=10;x<22;x++) psP(S,x,y, x===10?M[2]:x===21?M[1]:x<12||x>19?M[3]:(x+y)%7===0?Lh[2]:Lh[3]); }   // the writing top, its green leather
      for(let y=2;y<38;y++) for(let x=3;x<10;x++) psP(S,x,y, x===3?M[4]:x===9?M[1]:(y&1)?M[3]:M[2]);   // the roll-top hood, its slats
      for(let y=4;y<36;y+=4){ psP(S,9,y,Pp[1]); psP(S,9,y+1,Pp[0]); }   // papers peeping from its pigeonholes
      pR(S,13,14,6,8,Pp[2]); pR(S,16,14,1,8,Pp[0]); for(let y=16;y<21;y+=2){ pR(S,14,y,2,1,Pp[0]); pR(S,17,y,1,1,Pp[0]); }   // the open log
      candle(S,15,29);
      pR(S,3,38,19,1,M[5]); pR(S,3,39,19,11,M[3]); pR(S,3,39,1,11,M[4]); pR(S,21,39,1,11,M[1]); pR(S,5,41,15,7,M[2]); pR(S,5,41,15,1,M[1]); pR(S,3,50,19,1,M[1]);   // its near end, a raised panel
      pR(S,3,30,7,8,M[3]); psDisc(S,9,37,6,7,(nx,ny)=>nx>0&&ny<0?M[4]:0); pR(S,3,30,1,8,M[4]);   // the hood's curved end
      return Object.assign(tOut(S,12,50),{gx:15, gy:29}); }
    const S=PS(44,46);
    for(const x0 of [2,30]){ pR(S,x0,26,12,19,M[3]); pR(S,x0,26,1,19,M[4]); pR(S,x0+11,26,1,19,M[1]); for(const y of [27,32,38]){ pR(S,x0+1,y,10,y===38?6:4,M[2]); pR(S,x0+1,y,10,1,M[1]); pR(S,x0+5,y+2,2,1,Br[3]); psP(S,x0+5,y+2,Br[5]); } }   // the two pedestals, their drawers & brass pulls
    pR(S,14,26,16,19,M[0]); pR(S,14,26,16,2,M[1]); pR(S,1,45,42,1,M[1]);   // the kneehole
    pR(S,2,8,40,12,M[0]); for(let x=4;x<41;x+=6){ pR(S,x,9,1,11,M[3]); } pR(S,2,14,40,1,M[3]);   // the pigeonholes
    for(const [x,y,k] of [[6,10,0],[12,11,1],[19,10,2],[26,12,0],[31,10,1],[37,11,0],[7,16,1],[16,17,0],[25,16,2],[35,16,1]]){ if(k===2){ pR(S,x,y,2,4,cI('#2a5a4a')); psP(S,x,y-1,Pp[0]); } else { pR(S,x,y,3,k?3:4,Pp[k?1:2]); psP(S,x+2,y,Pp[0]); } }   // papers, scrolls, a little bottle of ink
    for(let y=3;y<8;y++) for(let x=3;x<41;x++) psP(S,x,y, y===3?M[5]:(y&1)?M[4]:M[2]);   // the tambour, rolled up under its hood
    for(const x of [1,41]){ pR(S,x,4,2,17,M[x<5?4:1]); } psP(S,2,3,M[4]); psP(S,41,3,M[2]);   // the hood's sides
    pR(S,2,20,40,5,Lh[3]); pR(S,2,20,40,1,Lh[2]); pR(S,3,21,38,1,Br[2]); pR(S,1,24,42,1,M[5]); pR(S,1,25,42,1,M[2]);   // the writing top, its green leather & gilt line, its lit edge
    pR(S,17,20,11,4,Pp[2]); pR(S,22,20,1,4,Pp[0]); for(const y of [21,22]){ pR(S,18,y,3,1,Pp[0]); pR(S,24,y,3,1,Pp[0]); }   // the open log
    psLine(S,30,23,33,18,cI('#fffaf0'),1); psP(S,33,17,cI('#d8d0c0'));   // a quill
    candle(S,7,15); return Object.assign(tOut(S,22,45),{gx:7, gy:15}); },
  dc_globe:(r,f)=>{ const S=PS(22,30), Wd=tRamp('#6a4428'), Br=tRamp('#c8983e'), Oc=cIR(['#6a7a5e','#8aa082','#a8bc9a','#c8d4b0','#e4ead0']), Ld=cIR(['#4a2a12','#6e4420','#946030','#b47e40']), cx=11, cy=11, R=7.2, rot=((f|0)%8)/8*Math.PI*2, TAU2=Math.PI*2;   // an antique globe: pale old seas, brown lands inked round their coasts, a brass meridian, a turned stand (spun, 8 frames turn it round)
    const CT=[[0.3,0.4,0.95,0.55],[1.95,-0.35,0.65,0.85],[3.6,0.55,1.05,0.45],[4.9,-0.6,0.6,0.5],[5.6,0.95,0.6,0.28]], M=new Int8Array(S.w*S.h).fill(-1), L=new Float32Array(S.w*S.h);   // its lands: [longitude, latitude, half-width, half-height]
    for(let y=Math.floor(cy-R);y<=Math.ceil(cy+R);y++) for(let x=Math.floor(cx-R);x<=Math.ceil(cx+R);x++){ const nx=(x+0.5-cx)/R, ny=(y+0.5-cy)/R, e=nx*nx+ny*ny; if(e>1 || x<0 || y<0) continue;
      const z=Math.sqrt(1-e), lon=Math.atan2(nx,z)+rot, lat=Math.asin(ny); let land=0;
      for(const c of CT){ const dl=(((lon-c[0])%TAU2)+TAU2*1.5)%TAU2-Math.PI; if((dl/c[2])**2+((lat-c[1])/c[3])**2<1){ land=1; break; } }
      M[y*S.w+x]=land; L[y*S.w+x]=-0.55*nx-0.6*ny+0.55*z; }
    for(let y=0;y<S.h;y++) for(let x=0;x<S.w;x++){ const i=y*S.w+x, m=M[i]; if(m<0) continue; const l=L[i], k=l>0.7?4:l>0.4?3:l>0.05?2:1;
      if(m){ const cst=M[i-1]===0||M[i+1]===0||M[i-S.w]===0||M[i+S.w]===0; psP(S,x,y,cst?Ld[0]:Ld[Math.min(3,k)]); } else psP(S,x,y,Oc[k]); }   // (a coast inked dark)
    for(let i=0;i<100;i++){ const t=i/100*TAU2; psP(S,cx+Math.cos(t)*(R+1.4),cy+Math.sin(t)*(R+1.4),Br[t>Math.PI*0.9&&t<Math.PI*1.6?5:t<Math.PI?2:4]); }   // the brass meridian
    pR(S,cx+1,1,1,2,Br[4]); pR(S,cx-2,cy+Math.ceil(R)+2,2,2,Br[2]);   // its pins
    pR(S,10,21,2,3,Wd[3]); psP(S,10,21,Wd[5]); pR(S,8,23,6,2,Wd[3]); pR(S,8,23,6,1,Wd[4]);   // the turned post
    psLine(S,9,25,4,29,Wd[3],2); psLine(S,13,25,18,29,Wd[1],2); pR(S,10,25,2,4,Wd[2]); pR(S,3,29,3,1,Wd[2]); pR(S,17,29,3,1,Wd[1]);   // its three legs
    return tOut(S,11,29); },
  dc_mirror:(r,f)=>{ const S=PS(18,25), Fr=cIR(['#24342e','#3a5046','#567062','#76907e','#9cb4a2']), Gs=cIR(['#24183e','#38285c','#52407e','#7462a2','#9e8cc8','#d4c8f0']), Bn=cIR(['#a89a80','#e8e0c8']), Sw=cIR(['#1e4a2a','#2e6a3a']);   // the drowned mirror: violet glass in a barnacled frame (frame 1, after dark: a face that isn't yours)
    pR(S,8,0,2,1,cI('#3a3434')); psP(S,8,1,cI('#3a3434'));   // the nail it hangs from
    psDisc(S,9,12.5,8,11,(nx,ny,x,y)=>{ const e=nx*nx+ny*ny; if(e>0.64) return e>0.9?(nx+ny<0?Fr[3]:Fr[1]):(nx+ny<-0.3?Fr[4]:nx+ny<0.4?Fr[2]:Fr[1]);   // the frame, worn smooth by the sea
      if(Math.abs(nx+ny*0.8+0.32)<0.1) return Gs[4]; return Gs[ny<-0.45?3:ny<0.25?2:1]; });   // the violet glass, a sheen across it
    psP(S,6,6,Gs[5]); psP(S,7,5,Gs[5]);
    if(f===1){ psDisc(S,9.5,12,2.8,3.8,(nx,ny)=>nx*nx+ny*ny>0.6?Gs[4]:Gs[5]); psP(S,8,11,Gs[1]); psP(S,11,11,Gs[1]); pR(S,9,14,2,1,Gs[2]); }   // a pale face, looking out (pale enough to show through the dark)
    for(const [x,y,k] of [[3,5,1],[4,4,0],[14,6,1],[15,15,0],[13,21,1],[2,16,1],[5,21,0],[16,10,1]]) psP(S,x,y,Bn[k]);   // barnacles
    psLine(S,3,18,2,24,Sw[1],1); psP(S,1,22,Sw[0]); psP(S,4,20,Sw[0]);   // a trailing weed
    return tOut(S,9,24); },
  dc_harp:(r,f)=>{ const S=PS(20,30), Co=tRamp('#e8746a'), Sg=cIR(['#2a8a6a','#5ae0a0','#c8ffe8']), Sh=tRamp('#e8c8b0'), Pl=cI('#f4f0ff');   // the sea-harp: a coral frame, green strings, a scallop at its foot (frame 1: its strings shimmer as it plays)
    const sb=x=>26-(x-4)*1.75;   // (where a string meets the soundbox)
    const nk=x=>3+Math.round(Math.sin((x-4)/11*Math.PI)*-1.2+(x-4)*0.12);   // (where it hangs from the neck)
    for(let x=6;x<=14;x++){ const y0=nk(x)+2, y1=Math.floor(sb(x))-1; for(let y=y0;y<=y1;y++){ const w=f===1&&((x+y)%4===0)?((x&1)?1:-1):0; psP(S,x+w,y,f===1?Sg[(y+x)%3===0?2:1]:Sg[x&1?1:0]); } }   // the strings
    for(let x=4;x<=16;x++){ const y=sb(x); psP(S,x,y,Co[4]); psP(S,x,y+1,Co[3]); psP(S,x,y+2,Co[1]); if(x%3===0) psP(S,x,y+1,Pl); }   // the soundbox, pearl studs along it
    for(let x=2;x<=16;x++){ const y=nk(x); psP(S,x,y,Co[5]); psP(S,x,y+1,Co[3]); }   // the neck's swan curve
    pR(S,2,3,2,23,Co[3]); pR(S,2,3,1,23,Co[5]); psLine(S,3,8,0,6,Co[2],1); psLine(S,3,15,0,14,Co[2],1); psLine(S,4,20,1,22,Co[2],1); psP(S,0,5,Co[4]); psP(S,0,13,Co[4]);   // the pillar: a branch of coral, knobbly
    psP(S,16,2,Pl); psP(S,17,3,Co[4]);   // a pearl at its head
    psDisc(S,7,27.4,6,2.8,(nx,ny,x)=>ny<-0.5?Sh[5]:(x&1)?Sh[3]:Sh[4]); pR(S,2,29,11,1,Sh[1]);   // the scallop at its foot
    return tOut(S,8,29); },
  dc_ammonite:()=>{ const S=PS(18,22), Wd=tRamp('#5a3a22'), Br=tRamp('#c8983e'), A=cIR(['#4e4028','#8a7850','#b4a274','#d8c8a0','#ece0bc','#fff6dc']), cx=9, cy=8.5, R=7.6;   // an ammonite on a walnut stand: its coil a ribbed tube winding in, lit from the top-left
    pR(S,8,15,2,2,Br[2]); psP(S,8,15,Br[4]);   // the brass rod
    pR(S,3,17,12,3,Wd[3]); pR(S,3,17,12,1,Wd[5]); pR(S,3,17,1,3,Wd[4]); pR(S,14,17,1,3,Wd[1]); pR(S,2,20,14,2,Wd[2]); pR(S,2,20,14,1,Wd[3]); pR(S,7,18,4,1,Br[3]); psP(S,7,18,Br[5]);   // the walnut plinth, a brass plate
    psDisc(S,cx,cy,R,R,(nx,ny,x,y)=>{ const dx=x+0.5-cx, dy=y+0.5-cy, rr=Math.hypot(dx,dy), th=Math.atan2(dy,dx), ph=rr/2.9+th/(Math.PI*2)+0.35, fr=ph-Math.floor(ph), rib=((th*16/(Math.PI*2)+ph*0.5)%1+1)%1<0.28, l=-0.6*nx-0.7*ny;
      if(rr<1.2) return A[0]; if(fr<0.16) return A[0];   // the deep groove between one whorl & the next
      const tube=Math.sin(fr*Math.PI), v=Math.round(1.4+tube*2.2+l*1.1-(rib?0.8:0)); return A[Math.max(1,Math.min(5,v))]; });   // (each whorl rounded like a tube, the ribs across it)
    return tOut(S,9,21); },
  dc_case:()=>{ const S=PS(42,32), Wd=tRamp('#6a4428'), Vl=tRamp('#7a1e2e'), Br=tRamp('#c8983e'), Sn=cI('#e8c8d0');   // a glazed walnut display case: your first three curios on red velvet, under the glass
    pR(S,2,4,38,14,Wd[3]); pR(S,2,4,38,1,Wd[5]); pR(S,2,4,1,14,Wd[4]); pR(S,39,4,1,14,Wd[1]);   // the lid's frame
    for(let y=6;y<16;y++) for(let x=4;x<38;x++) psP(S,x,y, y===6?Vl[1]:tH(x*5,y*3)<0.15?Vl[2]:Vl[3]);   // the velvet
    const C=(typeof curios!=='undefined'?curios:[]).slice(0,3);
    [11,21,31].forEach((cx,j)=>{ const c=C[j]; if(c!=null){ const n='cur'+c, [w,h]=pxiDim(n); if(w){ pxiInto(S,n,Math.round(cx-w/2),Math.max(6,15-h)); return; } }
      pR(S,cx-2,12,5,3,cI('#efe2c0')); pR(S,cx-1,13,3,1,cI('#a89878')); });   // (a curio — or its empty card, waiting)
    for(let j=0;j<7;j++){ psP(S,6+j,7+j,Sn); if(j<4) psP(S,24+j,7+j,Sn); }   // the glass's sheen
    pR(S,2,17,38,2,Wd[4]); pR(S,2,18,38,1,Wd[2]); pR(S,2,19,38,4,Vl[1]); pR(S,2,19,1,4,Wd[4]); pR(S,39,19,1,4,Wd[1]); pR(S,8,20,5,1,Sn);   // the front glass
    pR(S,2,23,38,2,Wd[2]); pR(S,2,23,38,1,Wd[3]); pR(S,19,23,4,2,Br[3]); psP(S,20,24,cI('#2a1a10'));   // the apron, its brass keyhole
    for(const x of [3,37]){ pR(S,x,25,2,6,Wd[x<20?3:1]); } pR(S,4,29,34,1,Wd[1]);   // its legs, a stretcher
    for(const [x,y] of [[2,4],[39,4],[2,17],[39,17]]) psP(S,x,y,Br[4]);   // brass corners
    return tOut(S,21,31); },
  dc_curcab:()=>{ const S=PS(42,49), Wd=tRamp('#5a3a22'), Vl=tRamp('#24365a'), Br=tRamp('#c8983e'), Sn=cI('#9ab0d8');   // the Curator's cabinet: tall & glazed, a crest on its cornice — six of your museum's finds on its shelves, a little lamp within
    pR(S,1,5,40,42,Wd[2]); pR(S,1,5,1,42,Wd[3]); pR(S,40,5,1,42,Wd[1]);   // the carcass
    pR(S,0,3,42,4,Wd[3]); pR(S,0,3,42,1,Wd[5]); pR(S,0,6,42,1,Wd[1]); pR(S,15,0,12,4,Wd[4]); pR(S,15,0,12,1,Wd[5]); psDisc(S,21,1.6,1.6,1.4,()=>Br[4]);   // its cornice, a crest & a brass medallion
    const M=(typeof museum!=='undefined'?museum:[]).slice(0,6);
    for(const x0 of [4,22]){ pR(S,x0,8,16,27,Vl[2]); pR(S,x0,8,16,1,Vl[1]);   // a glazed door, its velvet back
      for(const y of [16,25]){ pR(S,x0,y,16,1,Wd[4]); pR(S,x0,y+1,16,1,Wd[1]); } }   // its shelves
    for(let i=0;i<6;i++){ const q=M[i], x0=i&1?22:4, j=i>>1, by=[15,24,34][j]; if(!q) continue; const n=matPx('f:'+q), [w,h]=pxiDim(n); if(w) pxiInto(S,n,x0+Math.round((16-w)/2),Math.max(by-8,by-h)); }   // the finds, in the order given
    for(const x0 of [4,22]){ for(let j=0;j<6;j++) psP(S,x0+2+j,9+j,Sn); pR(S,x0-1,8,1,27,Wd[4]); pR(S,x0+16,8,1,27,Wd[1]); }   // the glass's sheen · the door frames
    pR(S,20,8,2,27,Wd[3]); pR(S,20,8,1,27,Wd[4]); pR(S,20,21,2,3,Br[3]); psP(S,20,21,Br[5]);   // the meeting stile, its brass lock
    pR(S,20,9,2,1,Br[4]); psP(S,21,8,cI('#fff0b8'));   // the little lamp within
    pR(S,1,35,40,2,Wd[4]); pR(S,1,36,40,1,Wd[2]); for(const x0 of [3,22]){ pR(S,x0,38,17,6,Wd[3]); pR(S,x0,38,17,1,Wd[1]); pR(S,x0+7,40,3,1,Br[3]); psP(S,x0+7,40,Br[5]); }   // the sill, two drawers
    pR(S,0,45,42,3,Wd[1]); pR(S,0,45,42,1,Wd[3]); return Object.assign(tOut(S,21,48),{gx:21, gy:8}); } };
/* ==== PROJECT SEAS & DEPTHS — SE5 · the landmarks' seven keepsakes (sd_seas §3.12.3, §3.13): each the object itself, in the deck's pixel style · MARK-SE5-1 ==== */
Object.assign(DECOR_ART,{
  lm_arch:()=>{ const S=PS(22,18), Gl=cIR(['#2e5058','#5a8c94','#8cc0c8','#c8ecf0','#ffffff']), Sk=cIR(['#a8d6e6','#d6eff6']), Wa=cIR(['#1a4472','#2a64a0','#4e96d0','#d8f4ff']), Rk=cIR(['#2e2a36','#4e4858','#6e6878','#9a94a6']), Mo=cI('#4a7a3a'), Ck=tRamp('#a8784a'), Wd=tRamp('#6a4428'), Sa=cIR(['#d8d0bc','#fffaf0']);   // a ship under the arch, in a bottle: the bottle on its side in a cradle — inside, a little arch of grey rock and a sloop under her span
    pR(S,1,4,1,9,Gl[1]); pR(S,2,3,12,11,Gl[2]); pR(S,3,2,10,1,Gl[3]); pR(S,3,14,10,1,Gl[1]); pR(S,14,5,1,7,Gl[2]); pR(S,15,6,1,5,Gl[1]); pR(S,16,7,2,3,Gl[2]); pR(S,18,6,1,5,Gl[3]); psP(S,18,10,Gl[1]);   // the glass: body, shoulder, neck, lip
    pR(S,19,7,2,3,Ck[3]); psP(S,19,7,Ck[4]); psP(S,20,7,Ck[4]); psP(S,20,9,Ck[1]);   // the cork
    pR(S,3,4,10,6,Sk[1]); pR(S,3,4,10,1,Sk[0]); pR(S,3,10,10,1,Wa[2]); pR(S,3,11,10,1,Wa[1]); pR(S,3,12,10,1,Wa[0]);   // inside: the sky, the sea
    pR(S,4,5,8,2,Rk[2]); pR(S,5,5,6,1,Rk[3]); psP(S,4,5,Rk[3]); psP(S,11,6,Rk[1]); psP(S,7,5,Mo);   // her span (lit from above, moss on her crown)
    pR(S,4,7,2,3,Rk[2]); pR(S,4,7,1,3,Rk[3]); pR(S,10,7,1,3,Rk[2]); pR(S,11,7,1,3,Rk[1]); psP(S,5,9,Mo);   // her two pillars (the west one lit)
    psP(S,3,10,Wa[3]); psP(S,12,10,Wa[3]); psP(S,4,10,Rk[1]); psP(S,11,10,Rk[0]);   // foam at their feet
    pR(S,7,7,1,3,Rk[0]); psP(S,8,7,Sa[1]); pR(S,8,8,2,1,Sa[1]); pR(S,8,9,2,1,Sa[0]); pR(S,6,10,4,1,Wd[2]); psP(S,6,10,Wd[4]); psP(S,9,10,Wd[1]);   // the sloop under her: a mast, a white sail, a brown hull
    pR(S,4,3,5,1,Gl[4]); psP(S,2,5,Gl[3]); psP(S,2,6,Gl[3]); psP(S,16,7,Gl[4]); psP(S,14,6,Gl[3]);   // the glass's shine
    for(const x0 of [3,10]){ pR(S,x0,15,4,1,Wd[4]); psP(S,x0,15,Wd[5]); } pR(S,1,16,18,1,Wd[3]); pR(S,1,17,18,1,Wd[1]);   // the cradle's two saddles, its plank
    return tOut(S,10,17); },
  lm_needle:()=>{ const S=PS(16,23), V=cIR(['#6a7682','#9aa6b2','#c4ced8','#e8eef4','#ffffff']), Bk=cIR(['#14181e','#2e343c','#4a525c']), Qu=cIR(['#a89e80','#e8e0c8']), Br=tRamp('#d8a840'), Rd=cI('#a8302a');   // a gull feather from the Needle: a long grey primary, its black tip with a white mirror, pinned to the wall
    const P=u=>[12.6-8.4*u+1.4*Math.sin(Math.PI*u), 1.2+18.6*u], nx=0.914, ny=0.406;   // (her shaft, tip to quill, bowed a little · the normal: + her narrow leading edge, − her broad trailing vane)
    for(let u=0;u<=0.86;u+=0.004){ const [x,y]=P(u), wr=4.2*Math.pow(Math.sin(Math.PI*Math.min(1,u*1.25+0.06)),0.55)*(u>0.72?1-(u-0.72)/0.14:1), wl=1.5*Math.pow(Math.sin(Math.PI*Math.min(1,u*1.1+0.08)),0.5);
      for(let t=-wr;t<=wl;t+=0.25){ let c; if(u<0.2) c=(u>0.06 && u<0.13 && t<-1.2 && t>-3.2)?V[4]:t>0.4?Bk[1]:Bk[0];   // the black tip, its white mirror
        else if(u<0.27) c=t>0.4?Bk[2]:Bk[1]; else c=t>0.6?V[3]:t>-0.9?V[2]:t>-2.6?V[1]:V[0];   // grey into the pale vane (darker toward her trailing edge)
        psP(S,x+nx*t,y+ny*t,c); } }
    for(let u=0.32;u<0.7;u+=0.09){ const [x,y]=P(u), w=3.6; psP(S,x-nx*w,y-ny*w+0.6,V[2]); }   // the barbs' notches on her trailing edge
    for(let u=0;u<=1;u+=0.01){ const [x,y]=P(u); psP(S,x,y,u<0.2?Bk[2]:u<0.86?Qu[1]:Qu[0]); }   // the shaft, its quill
    { const [x,y]=P(0.42); pR(S,Math.round(x)-1,Math.round(y)-1,2,2,Br[3]); psP(S,Math.round(x)-1,Math.round(y)-1,Br[5]); psP(S,Math.round(x),Math.round(y),Br[1]); }   // the brass pin through it
    { const [x,y]=P(0.93); psP(S,x-1,y,Rd); psP(S,x+1,y,Rd); psP(S,x,y+0.5,Rd); }   // a red thread knotted at the quill
    return tOut(S,7,22); },
  lm_cinder:()=>{ const S=PS(15,20), Gl=cIR(['#2a2226','#4a3a3c','#7a6466','#b8a4a4','#efe2dc']), Em=cIR(['#7a1e0e','#c84a1a','#ff8a2a','#ffd070','#fff6c8']), Ck=tRamp('#a8784a'), Wd=tRamp('#5a3a22');   // a cinder in a bottle: a squat bottle, smoky glass, an ember glowing at its heart
    psDisc(S,7.5,12.5,5.6,5.2,(nx,ny)=>{ const r=Math.hypot(nx,ny+0.08); if(r<0.36) return r<0.12?Em[4]:r<0.24?Em[3]:Em[2]; if(r<0.56) return ny<-0.1?Em[1]:Em[2]; if(r<0.74) return Em[0];   // the ember · its glow on the smoke
      return nx<-0.55 && ny<0.3 ? Gl[3] : nx>0.6 || ny>0.7 ? Gl[0] : Gl[1]; });   // the glass, lit on its left
    pR(S,5,4,5,4,Gl[1]); pR(S,5,4,1,4,Gl[3]); pR(S,9,4,1,4,Gl[0]); pR(S,4,3,7,1,Gl[2]);   // the neck, its lip
    pR(S,5,0,5,3,Ck[3]); pR(S,5,0,5,1,Ck[4]); psP(S,9,1,Ck[1]); psP(S,9,2,Ck[1]);   // the cork
    psP(S,4,10,Gl[4]); psP(S,4,11,Gl[4]); psP(S,5,9,Gl[3]); psP(S,10,15,Gl[2]);   // a shine on the glass
    for(const [x,y] of [[6,10],[9,11],[8,14]]) psP(S,x,y,Em[3]);   // sparks caught in the smoke
    pR(S,2,18,11,2,Wd[3]); pR(S,2,18,11,1,Wd[4]); pR(S,2,19,11,1,Wd[1]);   // a little wooden stand
    return Object.assign(tOut(S,7,19),{gx:7, gy:12}); },
  lm_shard:()=>{ const S=PS(15,24), Cy=cIR(['#14506a','#2a88a8','#4ab8d8','#8de9ff','#c8f8ff','#ffffff']), St=tRamp('#5a5a6a');   // a singing shard: a long cyan crystal, its facets catching the light, set in a slate base
    psDisc(S,7.5,20.5,6.4,2.6,(nx,ny,x,y)=>ny<-0.3?St[4]:ny<0.3?(nx<0?St[3]:St[2]):St[1]);   // the slate base
    psPoly(S,[[2,20],[1.8,15.5],[3.4,12.6],[5,16],[5,20]],(x)=>x<3.4?Cy[3]:Cy[1]);   // a small shard leaning off it
    psPoly(S,[[4.8,20],[5.2,9],[7.4,1.4],[10.2,7.4],[10.6,20]],(x,y)=>x<6.2?Cy[4]:x<7.6?(y<8?Cy[5]:Cy[3]):x<9.4?Cy[2]:Cy[1]);   // the great shard: her lit face, her ridge, her shadowed face
    psPoly(S,[[10.4,20],[10.6,14.2],[12.2,12.4],[13,15],[12.8,20]],(x)=>x<11.6?Cy[2]:Cy[0]);   // another, behind
    psLine(S,7,3,6.6,18,Cy[5],1); pR(S,5,18,6,1,Cy[1]);   // her ridge of light · her foot in the slate
    for(const [x,y] of [[9,5],[4,11],[12,14]]) psP(S,x,y,Cy[5]); psP(S,12,3,Cy[4]); psP(S,11,4,Cy[3]); psP(S,13,4,Cy[3]); psP(S,12,5,Cy[3]); psP(S,12,4,Cy[5]);   // sparkles (one a little star)
    return Object.assign(tOut(S,7,23),{gx:7, gy:9}); },
  lm_seed:()=>{ const S=PS(17,22), T=tRamp('#b8603a'), Lf=cIR(['#1e4220','#2e5a2a','#4a8a3a','#7ab84a','#a8d86a']), Bk=tRamp('#7a5636'), So=cI('#2a1a10');   // a banyan seedling: a clay pot, a little trunk with its roots hanging to the soil, a round crown of leaves
    pR(S,4,15,9,5,T[3]); pR(S,4,15,2,5,T[4]); pR(S,11,15,2,5,T[1]); pR(S,5,20,7,1,T[1]); pR(S,6,21,5,1,T[0]);   // the pot
    pR(S,3,13,11,2,T[4]); pR(S,3,13,11,1,T[5]); pR(S,12,13,2,2,T[2]); pR(S,4,12,9,1,So);   // its rim · the soil
    pR(S,8,7,2,6,Bk[3]); psP(S,8,7,Bk[4]); psP(S,8,9,Bk[4]); psP(S,9,11,Bk[1]); psP(S,7,12,Bk[2]); psP(S,10,12,Bk[2]);   // the trunk, a buttress at its foot
    for(const [x,y0,y1] of [[5,7,11],[12,6,11],[6,8,11],[11,8,10]]){ pR(S,x,y0,1,y1-y0+1,Bk[x<8?4:2]); psP(S,x,y1+1,So); }   // its roots hang from the boughs to the soil
    psLine(S,8,7,5,6,Bk[3],1); psLine(S,9,7,12,5,Bk[2],1);   // two boughs
    for(const [cx,cy,rx,ry] of [[5,4.4,3.6,2.6],[12,4,3.6,2.6],[8.6,2.6,4.2,2.6]]) psDisc(S,cx,cy,rx,ry,(nx,ny,x,y)=>{ const l=-0.5*nx-0.85*ny+(tH(x*7,y*5)-0.5)*0.5; return l>0.55?Lf[4]:l>0.15?Lf[3]:l>-0.3?Lf[2]:Lf[1]; });   // the crown: three round clouds of leaves
    for(const [x,y] of [[3,6],[14,6],[8,5]]) psP(S,x,y,Lf[0]);   // shade under the leaves
    return tOut(S,8,21); },
  lm_icicle:()=>{ const S=PS(13,23), Ic=cIR(['#3e6a9a','#5a8ab8','#a8d0f0','#d8ecff','#f4faff','#ffffff']), I=cIR(['#1e1a1a','#3a3434','#5a5658']);   // a never-melt icicle on an iron hook: long, blue-white, faceted, a snow-cap where it hangs
    pR(S,0,0,3,4,I[1]); psP(S,0,0,I[2]); psP(S,1,1,I[0]); psP(S,1,2,I[0]); pR(S,3,1,6,1,I[1]); pR(S,3,0,6,1,I[2]); psP(S,9,1,I[1]); pR(S,9,2,1,2,I[1]); psP(S,8,3,I[1]);   // the wall plate, its arm, the hook
    for(let y=4;y<=22;y++){ const u=(y-4)/18, w=2.9*Math.pow(1-u,0.85)+0.2, cx=7.2-0.9*u*u;   // tapering to its point, a little curved like a tooth
      for(let x=Math.floor(cx-w);x<=Math.ceil(cx+w);x++){ const o=(x+0.5-cx)/Math.max(0.6,w); if(Math.abs(o)>1) continue; let c=o<-0.45?Ic[3]:o<0.1?Ic[2]:o<0.6?Ic[1]:Ic[0]; if(y%5===2 && o<0.4) c=Ic[4]; psP(S,x,y,c); } }   // lit face · mid · shade · frosted rings
    pR(S,4,4,7,1,Ic[5]); pR(S,5,5,5,1,Ic[4]); psP(S,4,5,Ic[3]);   // the snow-cap at the hook
    for(const y of [7,8,11,15]) psP(S,Math.round(7.2-0.9*((y-4)/18)**2-1.2),y,Ic[5]);   // the glint down her lit edge
    return tOut(S,7,22); },
  lm_crown:()=>{ const S=PS(19,18), Cu=tRamp('#8a2436'), Tz=tRamp('#d8a840'), St=tRamp('#8a8676'), Bn=cIR(['#6a6458','#efe8d4']), Kp=cIR(['#2a4a2a','#3a6a3a','#5a8a4a']), Li=cI('#b8b07a');   // a barnacled stone crown on a red cushion
    psDisc(S,9.5,13.6,8.6,3.6,(nx,ny)=>{ const l=-0.4*nx-0.9*ny; return ny>0.55?Cu[1]:l>0.45?Cu[4]:l>0?Cu[3]:Cu[2]; });   // the cushion, plump
    pR(S,4,16,12,1,Cu[0]); for(const [x,y] of [[1,13],[18,13],[3,16],[16,16]]){ psP(S,x,y,Tz[4]); psP(S,x,y+1,Tz[2]); }   // its shadowed underside · its four gold tassels
    for(const [a,b,h] of [[3,7,5],[7,12,8],[12,16,5]]) psPoly(S,[[a,10],[(a+b)/2,10-h],[b,10]],(x)=>x<(a+b)/2-0.6?St[4]:x<(a+b)/2+0.6?St[3]:St[2]);   // three worn points, the middle one tallest (lit on their west faces)
    pR(S,4,9,11,4,St[3]); pR(S,4,9,11,1,St[4]); pR(S,4,12,11,1,St[1]); pR(S,13,9,2,4,St[2]); pR(S,4,9,1,4,St[5]); pR(S,5,10,8,1,St[2]);   // the band, a carved groove round it
    for(const [x,y] of [[6,11],[11,11],[9,6],[13,10]]){ psP(S,x,y,Bn[1]); psP(S,x+1,y,Bn[0]); }   // barnacles
    psP(S,5,11,Li); psP(S,10,9,Li); psP(S,8,5,Li); psP(S,14,8,Li);   // lichen
    psP(S,12,12,Kp[2]); psP(S,13,13,Kp[1]); psP(S,13,14,Kp[2]); psP(S,14,15,Kp[0]);   // a strand of weed, still on him
    return tOut(S,9,17); } });
/* <<SE8-ART */
/* ==== PROJECT SEAS & DEPTHS — SE8 · the wonders' ten keepsakes (sd_seas §3.12.4, §3.13): each the object itself, in the deck's pixel style · MARK-SE8-0 ==== */
const SEAS_WSFR=4;   // (the whirl-shell's spin: its stripes go round in 4 frames)
Object.assign(DECOR_ART,{
  ws_lantern:()=>{ const S=PS(14,27), Pw=cIR(['#262c30','#3e484c','#5e6c6e','#8a9a96','#b8c8c0','#e0ece4']), Gl=cIR(['#3a6a32','#6aa84e','#a8e47a','#d8ff9e','#f6ffe4']), Wd=tRamp('#4a3a2e');   // the Grey Lady's stern lantern: old pewter gone pale, panes of ghost-green light, a carved crown & a pendant finial
    pR(S,6,0,2,1,Pw[3]); psP(S,5,1,Pw[2]); psP(S,8,1,Pw[1]);   // the ring she hung by
    pR(S,5,2,4,1,Pw[4]); pR(S,4,3,6,1,Pw[3]); pR(S,3,4,8,1,Pw[4]); pR(S,2,5,10,1,Pw[3]); psP(S,4,3,Pw[5]); psP(S,3,4,Pw[5]); psP(S,10,5,Pw[1]); psP(S,11,5,Pw[1]);   // the crown, stepped
    for(const x of [3,6,9]) psP(S,x,6,Pw[2]); for(const x of [2,5,8,11]) psP(S,x,6,Pw[4]);   // its carved scallops
    pR(S,2,7,10,1,Pw[3]); psP(S,2,7,Pw[5]); psP(S,11,7,Pw[1]);   // the head band
    for(let y=8;y<=18;y++) for(let x=3;x<=10;x++){ const cx=Math.abs(x-6.5), cy=Math.abs(y-13); psP(S,x,y, cx<1.3 && cy<2.6 ? Gl[4] : cx<2.4 && cy<3.8 ? Gl[3] : cx<3.2 ? Gl[2] : Gl[1]); }   // the panes, lit from her flame
    pR(S,2,8,1,11,Pw[4]); pR(S,11,8,1,11,Pw[1]); pR(S,6,8,2,11,Pw[2]); psP(S,6,8,Pw[4]); pR(S,3,12,8,1,Pw[2]);   // the corner posts, the centre mullion, a glazing bar
    pR(S,6,13,2,3,Gl[4]); psP(S,6,12,Gl[3]);   // her flame, seen through the bar
    for(const [x,y] of [[4,9],[9,15],[4,17]]) psP(S,x,y,Gl[0]);   // old soot in the panes' corners
    pR(S,2,19,10,1,Pw[3]); psP(S,2,19,Pw[5]); pR(S,3,20,8,1,Pw[2]); pR(S,4,21,6,1,Pw[3]); pR(S,5,22,4,1,Pw[2]); pR(S,6,23,2,1,Pw[3]); psP(S,6,24,Pw[1]);   // the base, tapering to her pendant finial
    pR(S,2,24,10,3,Wd[2]); pR(S,2,24,10,1,Wd[4]); pR(S,2,26,10,1,Wd[1]); psP(S,2,25,Wd[3]);   // a little block of ship's timber she stands on
    return Object.assign(tOut(S,7,26),{gx:7, gy:13}); },
  ws_earbone:()=>{ const S=PS(19,18), Bn=cIR(['#5a5244','#8a8270','#b8b098','#e0dac4','#fbf8ec']), Dk=cIR(['#241c16','#4a3e32']), Wd=tRamp('#5a3a22'), Br=tRamp('#c8983e');   // a whale's ear-bone: the heavy bulla, pale as chalk, its thick lip rolled over a dark curling slit — on a little stand
    psDisc(S,9.5,7.6,8,5.9,(nx,ny,x,y)=>{ const l=-0.55*nx-0.8*ny+(tH(x*5,y*7)-0.5)*0.25, qx=(nx-0.34)/0.56, qy=(ny-0.1)/0.74, q=Math.hypot(qx,qy), a=Math.atan2(qy,qx), arc=a>-1.75 && a<2.35;   // (the hollow: an oval tucked into her right side · the slit runs round its rim, open at the top-left)
      if(arc && q>0.78 && q<1.0) return q<0.9 ? Dk[0] : Dk[1];   // the slit, deep & dark
      if(arc && q>=1.0 && q<1.42) return q<1.16 ? Bn[4] : l>-0.2 ? Bn[4] : Bn[3];   // the lip rolled over it, catching the light
      if(q<=0.78) return l>0.1 ? Bn[2] : Bn[1];   // the hollow's floor, in its shade
      return l>0.6 ? Bn[4] : l>0.15 ? Bn[3] : l>-0.35 ? Bn[2] : Bn[1]; });   // her body: lit from the upper left
    psLine(S,4,4,7,3,Bn[4],1); psP(S,3,6,Bn[4]); psLine(S,3,9,5,11,Bn[1],1); psP(S,7,12,Bn[1]);   // the shine on her crown · the fine ridges under her
    pR(S,6,13,1,2,Br[3]); pR(S,13,13,1,2,Br[2]); psP(S,6,13,Br[5]); psP(S,13,13,Br[4]);   // two brass prongs
    pR(S,3,15,14,2,Wd[3]); pR(S,3,15,14,1,Wd[4]); pR(S,2,17,16,1,Wd[1]); psP(S,3,16,Wd[5]);   // the stand
    return tOut(S,9,17); },
  ws_bell:()=>{ const S=PS(19,24), I=cIR(['#1e1a1a','#3a3434','#5a5658']), Bz=tRamp('#a8742e'), Vg=tRamp('#3e8a72'), Rp=cIR(['#4a3a24','#7a6a48','#a89870']), Wt=cI('#d8f4ff');   // the drowned bell: bronze green with age, broad & heavy, hung on a knotted rope from an iron hook — a drop of the sea still on her lip
    pR(S,8,0,3,2,I[1]); psP(S,8,0,I[2]); psP(S,10,2,I[1]); psP(S,9,3,I[0]);   // the iron hook in the wall
    pR(S,9,3,1,2,Rp[2]); psP(S,8,4,Rp[1]); psP(S,10,4,Rp[0]); pR(S,8,5,3,1,Rp[1]); psP(S,9,5,Rp[2]);   // the knotted rope
    pR(S,8,6,3,1,Bz[3]); psP(S,8,6,Bz[5]); psP(S,10,6,Bz[1]); psP(S,8,7,Bz[2]); psP(S,10,7,Bz[1]);   // her crown loop
    const HW=[4.0,5.0,5.4,5.5,5.5,5.6,5.7,6.0,6.4,7.0,7.7,8.4];   // her profile: a domed crown, a straight waist, the flare
    HW.forEach((hw,j)=>{ const y=8+j; for(let x=Math.round(9.5-hw);x<=Math.round(9.5+hw)-1;x++){ const u=(x+0.5-(9.5-hw))/(2*hw), g=tH(x*11,y*7), v=vnoise(x/3.1+2.2,y/2.7+1.4);
      const bz=u<0.16?Bz[5]:u<0.38?Bz[4]:u<0.7?Bz[3]:u<0.88?Bz[2]:Bz[1], vg=u<0.3?Vg[4]:u<0.62?Vg[3]:Vg[2]; psP(S,x,y, (j===0 && (u<0.1 || u>0.9)) ? 0 : (v>0.52 || (j>7 && g<0.35)) ? vg : bz); } });   // the bronze lit on her left, the green bloom where the sea had her
    pR(S,4,13,11,1,Bz[2]); for(const x of [5,7,9,11,13]) psP(S,x,13,Bz[4]);   // her waist band, a row of worn letters
    pR(S,1,20,17,1,Bz[3]); psP(S,1,20,Bz[5]); psP(S,17,20,Bz[1]); pR(S,2,21,15,1,Vg[1]);   // the sound bow, her lip
    psP(S,9,22,I[2]); psP(S,9,23,I[1]);   // the clapper
    psP(S,15,21,Wt); psP(S,15,23,Wt);   // a drop of the sea, still falling from her
    return tOut(S,9,23); },
  ws_scale:()=>{ const S=PS(19,19), Wd=tRamp('#3a2a20'), Sc=cIR(['#0e3a32','#16584a','#228068','#3aaa86','#7ad8b0','#c8fff0']), Ir=cIR(['#4a3a7a','#7a6ab8']), Br=tRamp('#c8983e');   // a serpent's scale on an oak plaque: a great teal scale, keeled, ringed with growth, a sheen of violet at its free edge
    psDisc(S,9.5,9.5,8.6,8.6,(nx,ny)=>{ const r=Math.hypot(nx,ny), l=-0.6*nx-0.7*ny; return r>0.86 ? (l>0.2?Wd[4]:l>-0.2?Wd[3]:Wd[1]) : r>0.78 ? Wd[0] : (l>0.3?Wd[3]:Wd[2]); });   // the round plaque, its bevelled rim
    const inS=(x,y)=>{ const dx=x-9.5; return (y>=10 && Math.hypot(dx/5.3,(y-10)/5.4)<=1) || (y<10 && y>=3 && Math.abs(dx)<=5.3*(y-3)/7+0.4); };   // its root a point, its free edge round
    for(let y=2;y<=16;y++) for(let x=3;x<=16;x++){ if(!inS(x+0.5,y+0.5)) continue; const edge=!inS(x+1.5,y+0.5) || !inS(x-0.5,y+0.5) || !inS(x+0.5,y+1.5);
      const d=Math.hypot(x+0.5-9.5,y+0.5-3), l=-0.55*(x+0.5-9.5)/5-0.5*(y-9)/6; let c=l>0.45?4:l>0.05?3:l>-0.35?2:1; if(Math.floor(d/2.3)%2===1 && d>3) c=Math.max(0,c-1);   // growth rings round its root, lit upper-left
      psP(S,x,y, edge && y>8 ? Ir[x<9?1:0] : Sc[c]); }
    pR(S,9,4,1,11,Sc[4]); psP(S,9,5,Sc[5]); psP(S,9,7,Sc[5]); psP(S,10,13,Sc[2]);   // its keel, catching the light
    for(const [x,y] of [[9,1],[17,9],[9,17],[1,9]]) psP(S,x,y,Br[4]);   // brass pins round the plaque
    return tOut(S,9,18); },
  ws_paper:()=>{ const S=PS(15,25), I=cIR(['#1e1a1a','#3a3434']), Cp=tRamp('#3a2414'), Pp=cIR(['#c86a2a','#ff9a4a','#ffc860','#ffe08a','#fff6d0']), Rd=tRamp('#b8302a'), Gd=cI('#f0c040');   // a paper lantern: warm paper on bamboo ribs, black-lacquered caps, a red tassel — as the raft's
    pR(S,7,0,1,3,I[1]); psP(S,6,0,I[0]); psP(S,7,3,Cp[2]);   // its cord from a nail
    pR(S,4,4,7,2,Cp[2]); pR(S,4,4,7,1,Cp[4]); psP(S,4,5,Cp[3]);   // the top cap
    psDisc(S,7.5,11.5,6.4,5.8,(nx,ny,x,y)=>{ const r=Math.hypot(nx*0.9,ny), l=-0.45*nx-0.5*ny; if((y&1)===0 && Math.abs(ny)<0.92) return Pp[r<0.5?2:r<0.8?1:0];   // the ribs, every other row
      return r<0.32?Pp[4]:r<0.58?(l>-0.2?Pp[3]:Pp[2]):r<0.84?Pp[2]:Pp[1]; });
    pR(S,4,17,7,2,Cp[2]); pR(S,4,17,7,1,Cp[3]); pR(S,4,18,7,1,Cp[1]);   // the bottom cap
    psP(S,7,19,Gd); pR(S,6,20,3,1,Rd[3]); pR(S,6,21,3,3,Rd[2]); psP(S,6,21,Rd[4]); psP(S,8,23,Rd[1]); psP(S,7,24,Rd[1]);   // the tassel
    return Object.assign(tOut(S,7,24),{gx:7, gy:11}); },
  ws_whirl:(r,f)=>{ const S=PS(19,18), Sh=cIR(['#4a2e1c','#7a4e2c','#b88a58','#e2c89c','#f8ecd4']), Pk=cIR(['#9a5a5a','#d8988c','#f4c8bc']), Wd=tRamp('#5a3a22'), ph=((f|0)%SEAS_WSFR)/SEAS_WSFR;   // a whirl-shell: a turban shell standing on its stand, cream whorls banded with brown spirals — spun, the bands climb round it
    const hw=y=>y<11.5 ? 7.4*Math.pow(Math.max(0,(y-0.2)/11.3),0.9) : 7.4*Math.sqrt(Math.max(0,1-((y-11.5)/3.3)**2));   // (her half-width down from the apex: a straight spire, then the round body whorl)
    for(let y=0;y<=14;y++){ const w=hw(y+0.5); for(let x=Math.floor(9-w);x<=Math.ceil(9+w);x++){ const nx=(x+0.5-9)/Math.max(1,w); if(Math.abs(nx)>1) continue;
      const s=y+0.5-0.42*(x+0.5-9), su=((s/2.7)%1+1)%1, st=(((x+0.5-9)*0.55+s*0.8+ph*4.5)%4.5+4.5)%4.5, l=-0.75*nx-0.25*(y/14);
      let c=l>0.45?4:l>0.05?3:l>-0.4?2:1; if(st<1.1) c=Math.max(0,c-2); else if(su<0.22 && y>1) c=Math.max(0,c-1);   // lit from the left · a brown spiral band · the suture between one whorl & the next
      psP(S,x,y,Sh[c]); } }
    psDisc(S,13.4,11.4,2.6,2.8,(nx,ny)=>{ const r=Math.hypot(nx,ny); return r>0.72 ? (nx<0 ? Sh[4] : Sh[3]) : r>0.4 ? Pk[1] : ny<0 ? Pk[2] : Pk[0]; });   // her mouth, round & pink, its pale lip
    psP(S,8,1,Sh[4]); psP(S,6,5,Sh[4]); psP(S,5,8,Sh[4]); psP(S,4,10,Sh[4]);   // the shine down her lit side
    pR(S,4,15,12,2,Wd[3]); pR(S,4,15,12,1,Wd[4]); pR(S,3,17,14,1,Wd[1]); psP(S,4,16,Wd[5]);   // a little turned stand
    return tOut(S,9,17); },
  ws_mirage:()=>{ const S=PS(13,20), Gl=cIR(['#7a8494','#a8b2c0','#d0d8e4','#eef2f8']), Li=cIR(['#dfe8f6','#f0f5ff','#ffffff']), Sa=cIR(['#e0cc9a','#f4e4bc']), Ph=cIR(['#8a8eb8','#a4a8d0','#c0c4e4']), Ck=tRamp('#a8784a');   // a jar of mirage-light: a tall jar of white glare — in it, a white tower, a palm, a strip of sand, there and not there
    pR(S,4,0,5,3,Ck[3]); pR(S,4,0,5,1,Ck[4]); psP(S,8,1,Ck[1]); psP(S,8,2,Ck[1]); pR(S,3,3,7,1,Gl[2]);   // the cork, the lip
    pR(S,4,4,5,1,Gl[1]); pR(S,2,5,9,1,Gl[2]);   // the neck, the shoulder
    for(let y=6;y<=17;y++) for(let x=2;x<=10;x++){ const cx=Math.abs(x-6)/4.2, cy=Math.abs(y-10)/6, h=Math.hypot(cx,cy); psP(S,x,y, x===2 ? Gl[3] : x===10 ? Gl[1] : h<0.4 ? Li[2] : h<0.75 ? Li[1] : Li[0]); }   // the glass full of glare, whitest at its heart
    pR(S,3,15,7,2,Sa[0]); pR(S,3,15,7,1,Sa[1]);   // the sand, in the jar
    pR(S,4,10,2,5,Ph[1]); pR(S,4,10,1,5,Ph[2]); psP(S,4,9,Ph[0]); psP(S,5,9,Ph[0]); psP(S,4,8,Ph[1]); psP(S,5,12,Ph[0]);   // the white tower, more glare than stone
    { const Tk=cI('#b0a488'), Fr=cIR(['#7aa898','#9ac4b4']); for(let y=10;y<=14;y++) psP(S,y<12?9:8,y,Tk); for(const [x,y,k] of [[9,8,1],[8,8,1],[10,8,1],[7,9,0],[11,9,0],[6,10,0],[10,9,1],[8,9,0],[12,10,0]]) psP(S,x,y,Fr[k]); }   // a palm, nodding — faded, as a mirage is
    for(const x of [3,5,7,9]) psP(S,x,7,Li[0]);   // the shimmer
    pR(S,2,18,9,1,Gl[1]); pR(S,3,19,7,1,Gl[0]); psP(S,3,7,Gl[3]); psP(S,3,8,Gl[3]); psP(S,9,6,Li[2]);   // the jar's foot · a shine
    return Object.assign(tOut(S,6,19),{gx:6, gy:10}); },
  ws_glow:()=>{ const S=PS(15,20), Mt=cIR(['#3a4044','#6a7276','#9aa4a8','#c8d0d2']), Gl=cIR(['#2a5a5a','#4e8482','#8ac4c0','#d0f4f0']), Sw=cIR(['#0e3a3e','#126058','#1e9a82','#4ad8b0','#9affe0','#eafff8']);   // a jar of sea-glow: a clamp-lid jar of night water, lit green-blue from within, sparks drifting in it
    psLine(S,3,7,4,1,Mt[1],1); psLine(S,11,7,10,1,Mt[1],1); pR(S,5,0,5,1,Mt[2]); psP(S,4,1,Mt[2]); psP(S,10,1,Mt[2]);   // the wire bail
    pR(S,3,3,9,2,Mt[2]); pR(S,3,3,9,1,Mt[3]); psP(S,11,4,Mt[0]); pR(S,4,5,7,1,Mt[1]);   // the clamped lid, its rubber seal
    for(let y=6;y<=18;y++) for(let x=2;x<=12;x++){ const cx=(x+0.5-7.5)/5.5, cy=(y+0.5-12.2)/6.8, cr=(Math.abs(cx)>0.8 && Math.abs(cy)>0.75); if(cr && Math.hypot((Math.abs(cx)-0.8)/0.2,(Math.abs(cy)-0.75)/0.25)>1) continue;   // (a jar: straight sides, round shoulders & foot)
      const ed=x===2 || x===12 || y===18 || (y===6 && (x<4 || x>10)), r=Math.hypot(cx*0.95,cy), v=vnoise(x/2.4+3.1,y/2.2+0.7);
      psP(S,x,y, ed ? (x===2 ? Gl[3] : x===12 ? Gl[0] : Gl[1]) : y===6 ? Sw[1] : r<0.32 ? (v>0.5?Sw[5]:Sw[4]) : r<0.62 ? (v>0.55?Sw[4]:Sw[3]) : (v>0.6?Sw[3]:Sw[2])); }   // the glass · the water's dark top under the lid · the glow, brightest at its heart, mottled
    for(const [x,y] of [[5,9],[10,11],[6,16],[9,14],[4,12],[8,8]]) psP(S,x,y,Sw[5]);   // sparks
    psP(S,3,8,Gl[3]); psP(S,3,9,Gl[3]); psP(S,3,10,Gl[2]);   // a shine on the glass
    return Object.assign(tOut(S,7,19),{gx:7, gy:12}); },
  ws_scute:()=>{ const W=40, S=PS(W,W), Sh=cIR(['#2a2a18','#4a4a26','#6a6a36','#8a8048','#a89a5a','#c8b878']), Br=cIR(['#4a3420','#6a4a2a','#8a6236']), Mo=cIR(['#2e4a22','#4a6a2e','#6a8a3a']), Bn=cIR(['#8a8474','#efe8d4']);   // a shell-plate rug: one great scute of the Old Shellback, its plates ringed with growth, moss in the seams, barnacles at its rim
    const C=[[0,0]]; for(let k=0;k<6;k++) C.push([Math.cos(k*Math.PI/3+Math.PI/6)*0.7, Math.sin(k*Math.PI/3+Math.PI/6)*0.7]);   // the plates' hearts: one middle plate, six round it
    for(let y=0;y<W;y++) for(let x=0;x<W;x++){ const nx=(x+0.5-W/2)/(W/2-1), ny=(y+0.5-W/2)/(W/2-1), e=Math.pow(Math.abs(nx),2.6)+Math.pow(Math.abs(ny),2.6); if(e>1) continue;
      let d1=9, d2=9, ci=0; for(let i=0;i<C.length;i++){ const d=Math.hypot(nx-C[i][0],ny-C[i][1])*(i?1:1.18); if(d<d1){ d2=d1; d1=d; ci=i; } else if(d<d2) d2=d; }
      const l=-0.5*nx-0.6*ny, n=vnoise(x/6+ci*3.1,y/6+1.7); let c;
      if(e>0.86) c=e>0.95?Br[0]:(l>0.2?Br[2]:Br[1]);   // the rim, worn dark
      else if(d2-d1<0.06) c=n>0.55?Mo[1]:Br[0];   // a seam, moss in it
      else { const ring=Math.floor(d1*13)&1; c=Sh[clamp((ring?2:3)+(l>0.35?1:l<-0.35?-1:0)+(n>0.7?1:0),0,5)]; if(n<0.22) c=Mo[2]; }   // growth rings, lit from the left · a patch of moss
      psP(S,x,y,c); }
    for(let k=0;k<14;k++){ const a=k/14*Math.PI*2+0.3, r=0.9, x=W/2+Math.cos(a)*r*(W/2-1)*0.97, y=W/2+Math.sin(a)*r*(W/2-1)*0.97; if(tH(k*7,3)<0.45) continue; psP(S,x,y,Bn[1]); psP(S,x+1,y,Bn[0]); }   // barnacles round the rim
    return psCv(psOut(S,cI(OLC),false),0,0); },
  ws_tile:()=>{ const S=PS(18,18), Bl=tRamp('#2a5aa8'), Gd=cIR(['#6a4a10','#c8982e','#f0c850','#fff0a0']), Tc=tRamp('#b86a4a'), Wt=cI('#d8e8ff');   // a drowned city's tile: deep blue glaze crazed with age, a gold eight-point star at its heart, a corner chipped to the clay
    for(let y=1;y<=16;y++) for(let x=1;x<=16;x++){ const e=Math.min(x-1,y-1,16-x,16-y), cr=tH(x*5,y*9)<0.06; psP(S,x,y, e===0 ? (x===1||y===1?Bl[4]:Bl[1]) : e===1 ? Wt : cr ? Bl[2] : Bl[(x+y)<14?4:3]); }   // the glaze, its pale border line, a crazing of fine cracks
    const star=(R,r)=>{ const P=[]; for(let k=0;k<16;k++){ const a=k*Math.PI/8-Math.PI/2; P.push([8.5+Math.cos(a)*(k&1?r:R), 8.5+Math.sin(a)*(k&1?r:R)]); } return P; };
    psPoly(S,star(6.6,3.3),()=>Gd[0]); psPoly(S,star(5.8,2.6),(x,y)=>(x+y)<16.5?Gd[2]:Gd[1]);   // the star, darkly edged, lit on its upper-left points
    pR(S,8,8,2,2,Gd[3]); psP(S,8,8,Wt);   // its bright heart
    pR(S,14,15,3,2,Tc[3]); psP(S,16,14,Tc[3]); psP(S,15,14,Tc[4]); psP(S,13,16,Tc[2]);   // the chipped corner: the red clay underneath
    return tOut(S,9,17); } });
DECOR_FR.ws_whirl=SEAS_WSFR;
/* SE8-ART>> */
