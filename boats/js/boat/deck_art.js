"use strict";
/* FILE: js/boat/deck_art.js
THE BOAT DECK ART: original lines 28181-28920 (build 5109cd5), moved verbatim, in place after the ship-naming card
  (shipRenameDone, ending at original line 28180 (build 5109cd5), still inline) and before THE CREW ABOARD (original
  line 28921 (build 5109cd5), still inline).
What it is: the whole deck renderer of boat mode: the baked hull and planks, the sea and foam round her, the y-sorted deck
  scene, the rig and sails (thin while you stand behind them), flags, station sprites, the trophy shelf, deck sightings
  and the helm's call-outs, the night light, the lower deck, the schooner's great cabin and stern castle, and the
  PIRATES HOOK (shipGunPorts, shipFire: a no-op today).
Entry points: drawDeck (frameInner, mode deck); deckCallsAtSea (updateWhaling, at sea); deckSightA (drawToasts, deckHUD);
  sailRamp (boatSpr, the livery); DECK_FLAGS (livIcon); cabLay (decorPrep); lowLayout (deckParse); deckShelfCard,
  deckPlaqueCard, deckHatchUp (deckInteract); crewHamPick (crewSpotFor); deckPin (decorSailK).
Globals it owns: its functions (deckBake*, drawDeck, deckTop, deckRoom, deckSpr*, deckRig*, sailRamp, deckFlag*, deckShelf*,
  deckLightPass, low*, cabLay, greatCabinBake, chand*, castle*, deckHouseOf...) plus DK_OCX, DK_OCY, deckSeaCD (a let
  that begin reassigns), DECK_FLAGS, DK_TROPHY, LOW_PH and LOW_BLK.
Main globals it reads from elsewhere, at runtime only: SHIP, DK, boat, env, wind, SEA, SEAS, heightAt, pctx, IW, IH, itime,
  player, mode, deckLiv, deckLivSig, deckLevel, deckMaps (still inline, earlier); js/render/pixkit.js, js/render/towns.js
  (the town kit), js/render/light.js, js/render/rooms.js (roomDecoPaint, furnSpr), js/render/sea_creatures.js, sfx; the
  decor, crew, fishing, livery and story code (still inline, later).
Load-time statements, in order: the literal consts DK_OCX, DK_OCY (original line 28347 (build 5109cd5)), the literal let
  deckSeaCD (original line 28382 (build 5109cd5)), DECK_FLAGS (original lines 28523-28540 (build 5109cd5)), which calls
  deckFlagRows (original line 28541 (build 5109cd5), in this file, hoisted) while it initialises, and the literal consts
  DK_TROPHY, LOW_PH, LOW_BLK (original lines 28588, 28721, 28732 (build 5109cd5)). No other call at load.
*/
/* ---- the painter: the deck (the bake: hull, bulwarks, planks · live: the sea, the foam, what stands, the light) ---- */
function deckBakeIf(L){ const sg=deckLivSig()+'|'+DK.stg; if(L.bg && L.bgSig===sg) return; L.bgSig=sg; if(L.id==='top') deckBakeTop(L); else if(L.id==='low' && L.lay) lowBake(L); else if(L.id==='cab' && cabLay(L).g) greatCabinBake(L); else deckBakeRoom(L); }   // (PT1 B10a: below deck has its own bake · B10b: so has the Grand Schooner's great cabin)
function deckBakeTop(L){ const TS=L.TS, W=L.W, H=L.H, WW=W*TS, MX=80, MY=28, BW=WW+MX*2, BH=H*TS+MY+30, LV=deckLiv();
  const rE=L.rows.map(s=>{ let e=0; for(let i=0;i<s.length;i++) if(s[i]!=='~') e=i+1; return e; });
  const Y0=TS, Y1=(H-1)*TS, NY=Y1-Y0+1, pts=[[Y0,rE[0]*TS]]; for(let r=1;r<H-1;r++) pts.push([r*TS+TS/2,(rE[r]-1)*TS+6]); pts.push([Y1,rE[H-1]*TS]);   // the bow: the bulwark's inner edge through each row's end (a smooth curve over the blocky grid)
  const raw=new Float32Array(NY), xin=new Float32Array(NY);
  for(let i=0;i<NY;i++){ const y=Y0+i; let k=0; while(k<pts.length-2 && y>pts[k+1][0]) k++; const a=pts[k], b=pts[k+1]; raw[i]=a[1]+(b[1]-a[1])*clamp((y-a[0])/Math.max(1,b[0]-a[0]),0,1); }
  for(let i=0;i<NY;i++){ let s=0,c=0; for(let j=-4;j<=4;j++){ const q=i+j; if(q<0||q>=NY) continue; s+=raw[q]; c++; } xin[i]=s/c; }
  let it=0; for(let i=1;i<NY;i++) if(xin[i]>xin[it]) it=i; const xT=xin[it], yT=Y0+it;
  const yN=new Int16Array(BW).fill(-999), yS=new Int16Array(BW).fill(-999);                             // per column: the deck's north & south edges (the bow's two halves)
  for(let X=12;X<Math.ceil(xT);X++){ const c=X+MX;
    if(X<xin[0]) yN[c]=Y0; else for(let i=0;i<=it;i++) if(xin[i]>X){ yN[c]=Y0+i; break; }
    if(X<xin[NY-1]) yS[c]=Y1; else for(let i=NY-1;i>=it;i--) if(xin[i]>X){ yS[c]=Y0+i; break; } }
  const PL=tRamp('#b8844e'), CP=tRamp('#c8945a'), FC=tRamp('#8a5a30'), HU=tRamp(LV.hull), TR=tRamp(LV.trim), SHD=cIA('#04101c',0.3);
  const cv=document.createElement('canvas'); cv.width=BW; cv.height=BH; const id=new ImageData(BW,BH), d=new Uint32Array(id.data.buffer);
  const xE=Y=>xin[clamp(Y-Y0,0,NY-1)];
  for(let cy=0;cy<BH;cy++){ const Y=cy-MY;
    for(let cx=MX+12;cx<BW;cx++){ const n=yN[cx]; if(n===-999) continue; const s=yS[cx], X=cx-MX, bowN=X>=xin[0], bowS=X>=xin[NY-1]; let c=0;
      if(Y>=n-15 && Y<n){ const u=Y-(n-15);                                                              // the port bulwark: its oak rail cap, then its inner face (planks, stanchions) toward you
        if(u<3) c=CP[u===0?5:u===1?4:2];
        else { let v=u<6?3.6:u<11?3:2.4; if(X%20===9||X%20===10) v=1.6; else if(X%4===0) v-=0.7; if(u===14) v=1.2; if(bowN) v-=0.6; v+=bayV(cx,cy)*0.4; c=FC[clamp(Math.floor(v),0,5)];
          if(!bowN && X%60===30 && u>=10 && u<=11) c=cI('#2e2a2c'); } }                                   // (a cleat every 60)
      else if(Y>=n && Y<s){
        if(X<TS){ const e=X-12; c=CP[e===0?5:e===1?4:e===7?1:e>=5?2:3]; if(Math.abs(Y-(n+s)/2)<3 && e>=3 && e<=6) c=cI('#3a2a1e'); }   // the transom's rail, the rudder head
        else { const pr=Math.floor(Y/5), sy=Y-pr*5, jl=40+((tH(pr,7)*17)|0), off=(tH(pr,3)*jl)|0, jx=(X+off)%jl;   // planks 5 texels wide, bow to stern · staggered butts with their nails · a darker waterway along the bulwarks
          let v=2.9+(tH((X+off)>>3,pr*7)-0.5)*0.7+bayV(cx,cy)*0.35; if(sy===4) v=1.15; else if(sy===0) v+=0.45;
          if(jx===0) v=1.25; else if(jx===1 && (sy===1||sy===3)) v=1.9;
          if(Y-n<3 || s-Y<3 || X-TS<3 || xE(Y)-X<3) v-=0.75; c=PL[clamp(Math.floor(v),0,5)]; } }
      else if(Y>=s && Y<s+4){ const u=Y-s; c=CP[u===0?5:u===1?4:u===2?3:1]; if(!bowS && X%60===10 && u===1) c=cI('#3a3434'); }   // the starboard rail cap, from above (a ring bolt every 60)
      else if(Y>=s+4 && Y<s+20){ const u=Y-s-4; let v=u===0?1:(u%4===3?2:3); if(u>=14) v=2; if(bowS) v-=1; if(X%40===12&&u>4&&u<13) v=Math.min(v,2);   // her side in her paint: plank seams · the trim stripe 3 below the cap · wet along the waterline
        c=(u===3||u===4)?TR[u===3?4:3]:HU[clamp(v+(u%4!==3 && bayV(cx,cy)>0.44?1:0),0,5)]; }
      else if(Y>=s+20 && Y<s+26) c=SHD;                                                                // her shadow on the water
      if(c) d[cy*BW+cx]=c; } }
  const OLw=cI(OLC), op=i=>(d[i]>>>24)===255, mk=[]; for(let cy=1;cy<BH-1;cy++) for(let cx=1;cx<BW-1;cx++){ const i=cy*BW+cx; if(!op(i)) continue;   // the outline: every hull texel against the water goes dark (the towns' sprites wear the same)
    if(!op(i-1) || !op(i+1) || !op(i-BW) || !op(i+BW)) mk.push(i); }
  for(const i of mk) d[i]=OLw;
  const g=cv.getContext('2d'); g.putImageData(id,0,0);
  const P=(x,y,c)=>{ g.fillStyle=c; g.fillRect(MX+x,MY+y,1,1); }, R=(x,y,w,h,c)=>{ g.fillStyle=c; g.fillRect(MX+x,MY+y,w,h); }, fh=n=>'#'+((n&0xff).toString(16).padStart(2,'0'))+(((n>>8)&0xff).toString(16).padStart(2,'0'))+(((n>>16)&0xff).toString(16).padStart(2,'0')), F=FC.map(fh), CPh=CP.map(fh);
  { const sx=Math.round(xT)-5, sy=yT-1;                                                                // the stem post · the bowsprit (a tapered spar 60 past the stem)
    R(sx,sy-14,5,15,F[1]); R(sx,sy-14,2,15,F[3]); R(sx-1,sy-15,7,2,CPh[4]);
    for(let t=0;t<=62;t++){ const x=sx+3+t, y=Math.round(sy-12-t*0.18), w=t<20?3:t<44?2:1; R(x,y,1,w+1,F[1]); R(x,y,1,1,F[4]); if(w>1) R(x,y+1,1,w-1,F[3]); }
    R(sx+63,Math.round(sy-12-63*0.18)-1,2,3,F[1]); }
  for(const m of L.st.masts){ const mx=(m.x+0.5)*TS; R(mx-8,TS-9,17,1,CPh[2]); for(const o of [-6,-2,2,6]){ R(mx+o,TS-12,1,3,CPh[5]); R(mx+o,TS-9,1,1,F[1]); } }   // a pin rail on the bulwark, abreast of each mast
  if(L.st.fish){ const f=L.st.fish, x=f.x*TS+4, y=f.y*TS+8; R(x,y,7,7,F[1]); R(x+1,y,5,6,F[3]); R(x+1,y,5,1,'#5a8aa8'); R(x,y+2,7,1,'#3a3434');   // the stern line's bait bucket
    R(x+9,y+7,8,1,'rgba(40,20,8,0.35)'); R(x+10,y-7,6,1,CPh[5]); R(x+9,y-6,8,2,CPh[3]); R(x+9,y-4,8,1,CPh[1]); R(x+10,y-3,1,4,F[1]); R(x+15,y-3,1,4,F[1]); R(x+12,y-2,1,4,F[2]);   // (B2) the angler's stool
    const hx=14, hy=y-5; R(hx-1,hy,3,4,'#3a3434'); R(hx,hy,1,1,'#6a6868'); }                             // a rod holder on the transom rail (PT1 B5b: its rod, line & float are drawn live — fishWater — so the hand-line can take them up)
  if(L.st.windlass){ const a=L.st.windlass, x0=(a.x+0.5)*TS+15, y0=(a.y+1)*TS-6, x1=Math.round(xT)-11, y1=yT-1, n=Math.max(1,Math.round((x1-x0)/2));   // (B2) the cable from the windlass's drum to the hawse at her stem
    R(x1-2,y1-1,5,3,CPh[1]); R(x1-1,y1,3,1,'#120a06'); for(let i=0;i<=n;i++){ const t=i/n; R(Math.round(x0+(x1-x0)*t),Math.round(y0+(y1-y0)*t),1,1,(i&1)?'#6a6868':'#3a3838'); } }
  for(const m of L.st.masts){ const mx=Math.round((m.x+0.5)*TS); for(const o of [-6,4]){ const s=yS[mx+o+MX]; if(s===-999) continue; R(mx+o,s,3,2,'#2a2222'); R(mx+o+1,s,1,1,'#7a7068'); R(mx+o+1,s+4,1,9,fh(HU[1])); } }   // (B2) the shrouds' deadeyes on her starboard rail, their chainplates down her side
  L.hatchB=null; if(L.st.hatch && L.st.hatch.length){ let x0=1e9,y0=1e9,x1=-1,y1=-1; for(const h of L.st.hatch){ x0=Math.min(x0,h.x); y0=Math.min(y0,h.y); x1=Math.max(x1,h.x); y1=Math.max(y1,h.y); }   // (stage 2+, PT1 B10a: the hatch — a coaming round a grating, the hold's lamplight in its gaps after dark)
    const X=x0*TS+1, Y=y0*TS+1, w=(x1-x0+1)*TS-2, h=(y1-y0+1)*TS-2, ix=X+3, iy=Y+3, iw=w-6, ih=h-8; R(X+2,Y+h,w,2,'rgba(30,14,4,0.32)'); R(X+w,Y+2,2,h,'rgba(30,14,4,0.32)');
    R(X,Y,w,h,F[2]); R(X,Y,w,1,CPh[5]); R(X,Y+1,w,1,CPh[4]); R(X,Y,1,h-3,CPh[4]); R(X+w-1,Y+1,1,h-3,F[1]); R(X,Y+h-3,w,1,CPh[3]); R(X,Y+h-2,w,2,F[1]);   // (the coaming: lit on top, its face toward you)
    R(ix,iy,iw,ih,'#24160c'); for(let j=0;j<ih;j+=5){ R(ix,iy+j,iw,2,'#8a6236'); R(ix,iy+j,iw,1,'#b0804c'); } for(let i=0;i<iw;i+=5){ R(ix+i,iy,1,ih,'#5a4024'); R(ix+i,iy+ih,1,1,'#3a2a18'); }   // (the grating's battens)
    L.hatchB={ix, iy, iw, ih}; }
  L.bg=cv; L.MX=MX; L.MY=MY; L.xT=xT; L.yT=yT;
  const wl=new Int16Array(BW).fill(-999); for(let c=0;c<BW;c++) if(yS[c]!==-999) wl[c]=yS[c]+20; L.wl=wl; }   // the waterline, per column (the foam runs along it)
function deckBakeRoom(L){ const TS=L.TS, W=L.W, H=L.H, EXT=TS, low=L.id==='low', CW=W*TS, CH=H*TS+EXT;   // your cabin (and the lower deck) — the rooms' look: a back wall a tile tall, the walls' tops, warm planks
  const cv=document.createElement('canvas'); cv.width=CW; cv.height=CH; const id=new ImageData(CW,CH), d=new Uint32Array(id.data.buffer);
  const FLR=tRamp(low?'#7a5a36':'#a8783e'), WN=tRamp(low?'#6a4a2c':'#6a4428'), PLS=tRamp('#c8b890'), TOPW=cIR(['#140e0a','#2a1e16','#3e2e22','#5a4432']), C=L.rows;
  for(let y=0;y<CH;y++) for(let x=0;x<CW;x++){ const wy=y-EXT, tx=Math.floor(x/TS), ty=Math.floor(wy/TS), bay=bayV(x,y); let c;
    if(wy<TS){ if(wy<-EXT+4) c=TOPW[wy<-EXT+1?3:1];
      else if(low){ const rib=(x%40)<6; c=rib?WN[x%40<2?3:1]:WN[clamp(Math.floor(2.8+(tH(x>>3,(wy+EXT)>>2)-0.5)*0.8+((wy+EXT)%6===5?-1.4:0)),0,5)]; }   // the inner hull's planking & its ribs
      else if(wy<TS-15){ c=PLS[(x%8===0)?2:(tH(x*3,wy*5)<0.035)?2:3]; }                                  // plaster with a faint stripe
      else if(wy<TS-13) c=WN[4];                                                                          // the dado rail
      else { const pl=x%10; c=WN[wy>=TS-2?0:pl===9?1:pl===0?4:(wy===TS-12||wy===TS-3)?2:3]; } }        // the wainscot's panels
    else if(tx===0||tx===W-1||ty===H-1){ const ch=(C[ty]&&C[ty][tx])||'#';
      if(ch==='d'){ c=(x%4===0||(wy%4===0))?cI('#8a6a3a'):cI('#a8844a'); if(wy-ty*TS<3) c=cI('#caa05a'); }   // the threshold
      else { const inner=(tx===0&&x>=TS-3)||(tx===W-1&&x<(W-1)*TS+3)||(ty===H-1&&wy<ty*TS+3); c=inner?TOPW[3]:TOPW[1+((x+wy)&1&&bay>0.3?1:0)]; } }
    else { const row=Math.floor(wy/5), off=Math.floor(tH(row,11)*40), sx=(x+off)%48, sy=wy%5; let v=2.85+(tH(Math.floor((x+off)/48)*5,row)-0.5)*0.8;
      if(sy===4) v=1.2; else if(sy===0) v+=0.4; if(sx===0) v=1.2; else if(sx===1) v+=0.3; c=FLR[clamp(Math.floor(v),0,5)]; }
    d[y*CW+x]=c; }
  cv.getContext('2d').putImageData(id,0,0);
  const g=cv.getContext('2d'); L.win=[]; L.lamps=[];
  if(!low){ const Y=cabLay(L); L.win=Y.win; L.lamps=Y.lamps; roomDecoPaint(g,['lantern',Y.lamps[0][0],-EXT+2],EXT); }   // two stern windows (drawn live) · the hanging lantern (PT1 B10b: their places from cabLay — the decor's wall rule reads the same)
  else for(let i=0;i<3;i++) L.lamps.push([Math.round(CW*(i+0.5)/3),-EXT+12]);
  L.bg=cv; L.EXT=EXT; }
/* the sea under her: the colour of the water she sails (shallows near a coast are paler) — two drifting layers of crests, running astern */
function deckWatPal(){ const d=clamp((SEA-heightAt(boat.x,boat.y))/0.5,0,1), q=Math.round(d*8), tk=SEAS.on?SEAS.tk:'', k='dwp'+q+'|'+tk; if(DK.wtk!==tk){ seasDeckPurge(); DK.wtk=tk; }   // (SEAS SE2: her deck's water wears the sea's tint — a new tint re-bakes it)
  return tProp(DK.V,k, ()=>{ const w=waterColorT(q/8*(SEAS.on?SEAS.dl:1)), h=v=>clamp(Math.round(v+6),0,255).toString(16).padStart(2,'0'), hex='#'+h(w[0])+h(w[1])+h(w[2]);
  return {q, hex, cr:mixHex(hex,'#ffffff',0.42), cr2:mixHex(hex,'#ffffff',0.22), tr:mixHex(hex,'#04101c',0.3)}; }); }
function deckRip(V,k,pal){ return tProp(V,'drip'+k+'_'+pal.q, ()=>{ const T=96, S=PS(T,T), c=cIA(k===2?'#f4fbff':k?pal.cr2:pal.cr,1), c2=cIA(k===2?pal.cr:pal.tr,1);
  if(k===2){ for(let i=0;i<18;i++){ const x0=Math.floor(tH(i*11,41)*T), y0=Math.floor(tH(i*5+3,43)*T), n=2+Math.floor(tH(i,47)*4); for(let j=0;j<n;j++){ psP(S,(x0+j)%T,y0,c); if(j&&j<n-1&&(j&1)) psP(S,(x0+j)%T,(y0+1)%T,c2); } psP(S,(x0+n+2)%T,(y0+1)%T,c); } return psCv(S,0,0); }   // (B2) a blow's whitecaps: crests breaking white, a fleck of spume behind
  for(let i=0;i<(k?30:22);i++){ const x0=Math.floor(tH(i*7+k*31,k*5+3)*T), y0=Math.floor(tH(i*13+k*17,k*9+1)*T), n=3+Math.floor(tH(i,k+7)*4);
    for(let j=0;j<n;j++){ psP(S,(x0+j)%T,(y0+(j===0||j===n-1?1:0))%T,c); if(!k && j>0 && j<n-1) psP(S,(x0+j)%T,(y0+2)%T,c2); } }
  return psCv(S,0,0); }); }
function deckWater(toy0){ const D=DK, pal=deckWatPal(), T=96, calm=boat.spd<4;
  pctx.fillStyle=pal.hex; pctx.fillRect(0,0,IW,IH);
  for(let k=0;k<2;k++){ const o=deckRip(D.V,k,pal), ox=Math.round(-D.flow*(k?1.3:1)+(k?40:0)+(calm?Math.sin(itime*0.4+k)*2:0)), oy=Math.round(Math.sin(itime*0.35+k*2)*2+(k?30:0)), bx=(((TOX+ox)%T)+T)%T-T, by=(((toy0+oy)%T)+T)%T-T;
    pctx.globalAlpha=k?0.3:0.5; for(let y=by;y<IH;y+=T) for(let x=bx;x<IW;x+=T) pctx.drawImage(o.cv,x,y); }
  const wc=clamp((env.storm-0.25)*1.4+env.tempest*0.3,0,0.85); if(wc>0.02){ const o=deckRip(D.V,2,pal), ox=Math.round(-D.flow*1.15+itime*7), oy=Math.round(Math.sin(itime*0.5)*3+60), bx=(((TOX+ox)%T)+T)%T-T, by=(((toy0+oy)%T)+T)%T-T;   // (B2) whitecaps in a blow
    pctx.globalAlpha=wc; for(let y=by;y<IH;y+=T) for(let x=bx;x<IW;x+=T) pctx.drawImage(o.cv,x,y); }
  pctx.globalAlpha=1; const w=Math.floor(itime*1.7); pctx.fillStyle='#ffffff';                            // glints winking on the swell
  for(let i=0;i<10;i++){ const a=1-Math.abs(((itime*1.7)%1)-0.5)*2; if(a<0.3) break; const x=Math.floor(tH(i*31+w*7,w*3+i)*IW), y=Math.floor(tH(i*5+w,i*9)*IH); pctx.globalAlpha=a*0.7; pctx.fillRect(x,y,1,1); }
  pctx.globalAlpha=1; }
function deckFoam(L){ const wl=L.wl, MX=L.MX, fo=Math.floor(DK.flow+itime*1.2), x0=Math.max(0,-TOX+MX-2), x1=Math.min(wl.length,IW-TOX+MX+2);   // the waterline's foam, running astern with her way
  pctx.fillStyle='#e8f4fa'; for(let c=x0;c<x1;c++){ const y=wl[c]; if(y===-999) continue; const q=c-MX+fo, k=Math.floor(q/8), m=q-k*8, h=h2i(k,11), n=h<0.14?0:1+((h*997)|0)%4, o=(h2i(k,23)*4)|0;   // (PT1 B11: dashes of every length & gap, riding the water — no ruler's beat)
    if(m>=o && m<o+n) pctx.fillRect(TOX+c-MX,TOY+y-(n===4&&m===o+1?2:1),1,n===4&&m===o+1?2:1); }
  pctx.globalAlpha=0.55; for(let c=x0;c<x1;c++){ const y=wl[c]; if(y===-999) continue; const q=c-MX+Math.floor(fo*1.4)+4, k=Math.floor(q/13), m=q-k*13, h=h2i(k,37); if(h<0.75 && m>=((h*9)|0) && m<((h*9)|0)+1+(h<0.3?1:0)) pctx.fillRect(TOX+c-MX,TOY+y+1,1,1); } pctx.globalAlpha=1; }
function drawDeck(){ const D=DK, L=deckLevel(); if(!L) return; D.V.fr=(D.V.fr||0)+1; if(D._sb) D._sb.length=0;   // (PT1 B11: this frame's sightings, for the plates' fade)
  if(L.id==='top') deckTop(L); else deckRoom(L); if(SAGA_DRM>0) sagaDreamVeil(L);
  const pr=D._rr||(D._rr=[0,0,0,0,0,0,0,0]); pr[0]=(TX(player.x)-7)*IKX; pr[1]=(TY(player.y)-30)*IKY; pr[2]=(TX(player.x)+7)*IKX; pr[3]=(TY(player.y)+2)*IKY;   // (R1a · G20V-B05: what the plates fade over — you, and in a room its own art: CSS px)
  if(L.id!=='top' && L.bg){ pr[4]=TOX*IKX; pr[5]=(TOY-L.EXT)*IKY; pr[6]=(TOX+L.bg.width)*IKX; pr[7]=(TOY-L.EXT+L.bg.height)*IKY; } else pr[4]=pr[5]=pr[6]=pr[7]=0;
  const a=D.tr ? (D.tr.f<10?D.tr.f/10:(20-D.tr.f)/10) : D.fade>0 ? D.fade/10 : 0;                       // (a level change: dark out, dark in)
  if(a>0){ pctx.fillStyle='rgba(6,8,12,'+clamp(a,0,1).toFixed(3)+')'; pctx.fillRect(0,0,IW,IH); } }
function deckTop(L){ const D=DK; deckBakeIf(L);
  TOX=Math.round(IW/2-icamX); const toy0=Math.round(IH/2-icamY); TOY=toy0+D.bob;                         // (the ship bobs — the sea doesn't)
  deckWater(toy0); deckSights(L,toy0,true);                                                              // (PT1 B11: what swims past off her far side — behind her)
  pctx.drawImage(L.bg,TOX-L.MX,TOY-L.MY);
  deckFoam(L); deckWake(L); fishWater(L); deckFigDraw(L);                                                // (B2: the bow wave, her wake · B5b: the stern line in the water · PT1 B8: her figurehead under the bowsprit)
  decorDraw(L); crewFxGround(L);                                                                         // (PT1 B6a: the rugs & what hangs on her bulwark · B3a: the mop's wet planks)
  D.rig.st=deckSailSt(); D.rig.vr=deckSailVr(); D._sailA=1; D._jibA=1; D._xr=[];                         // (the sail as she carries it this frame · G18 FIX: the set sails' outlines, for the decor seen through them)
  pctx.fillStyle='rgba(28,14,4,0.22)'; for(const s of L.sp) if(s.k==='mast'){ const o=deckMastSpr(DK.V,DK.stg,s.fore); pctx.fillRect(TX(s.x)-o.ax+3,TY(s.y)-1,o.ax-5,3); }   // the boom's shadow on the deck (it rides 16 over it)
  deckJibShadow(L);                                                                                      // (PT1 B11: the set jib's shadow along her foredeck — it stands up off her, not a wedge laid on her)
  TDRN=0; for(const s of L.sp) tdr(s.sy,20,s,0); crewSort(L); decorSort(L); deckWorksSort(L); tdr(player.y,6,null,0);    // (B3a: the crew, kind 21 · PT1 B6a: the furniture, kind 22 · PT1 B9: the carpenter's works)
  const Q=TDR; for(let i=1;i<TDRN;i++){ const o=Q[i]; let j=i-1; while(j>=0 && Q[j].y>o.y){ Q[j+1]=Q[j]; j--; } Q[j+1]=o; }
  for(let i=0;i<TDRN;i++){ const o=Q[i]; if(o.k===20) deckSprDraw(o.a); else if(o.k===21) crewDraw(o.a); else if(o.k===22) decorFurnDraw(o.a); else if(o.k===40) scnDrawActor(o.a); else if(D.sit) decorSitDraw(); else { const dr=folkDir(player.fx,player.fy); drawFolk(player.x+(D.fish&&D.fish.hold?1:0),player.y,playerLook(),dr,walkFr(player.moving,player.wph||0)); if(D.fish) fishRod(); if(nightK()>0.45) townLantern(player.x,player.y,dr,player.moving?itime*1.7:0); } }   // (B5b: you lean back as you reel — the rod & the line in your hands)
  deckSights(L,toy0,false);                                                                              // (PT1 B11: …and off her near side, in front of her)
  deckSprayDraw(); crewFxAir(L); decorFxDraw(L); if(D.lfx.length) fishFx(); deckGulls(L); scnGullDraw(L);                              // (B2: a blow's spray, over everything · B3a: chips, sawdust, a spark · B5b: the catch leaping aboard · PT1 B11: dawn's gulls)
  deckLightPass(L); crewZs(L); townWeather(); if(D.edit) editDraw(L); }                                  // (PT1 B6b: decorating — the grid, the ghost, the cursor, over the night)
function deckRoom(L){ deckBakeIf(L); const rb=clamp(DK.bob,-1,1); DK.rb=rb;                              // (B2: the room rides the swell too — ±1, no water to show it but the windows)
  TOX=Math.round(IW/2-icamX); TOY=Math.round(IH/2-icamY)+rb;
  pctx.fillStyle='#070504'; pctx.fillRect(0,0,IW,IH); pctx.drawImage(L.bg,TOX,TOY-L.EXT); if(L.lay) portholeDraw(L);   // (PT1 B10a: below, the sea in the portholes)
  const dayK=env.L, pal=deckWatPal(), fl=DK.flow*0.3, nk=nightK(), seaC=nk>0.05?mixHex(pal.hex,'#08122a',0.7*nk):pal.hex, crC=nk>0.05?mixHex(pal.cr,'#08122a',0.6*nk):pal.cr, rn=Math.max(env.storm,env.drizzle*0.6);   // (the sea outside darkens with the hour)
  for(const w of L.win){ const X=TX(w[0]), Y=TY(w[1]), ww=w[2], wh=w[3], hw=(wh>>1)-clamp(DK.bob,-2,2), gw=w[4];   // the stern windows: the sky above, her wake below (it runs with her way · the horizon rides against her bob) · (PT1 B10b) gw: the great cabin's gallery — gilt, arched, small panes
    pctx.fillStyle=gw?'#5a3e10':'#4a3020'; if(gw) pctx.fillRect(X-1,Y-1,ww+2,wh+2); else pctx.fillRect(X-2,Y-2,ww+4,wh+4); pctx.fillStyle=dayK>0.62?'#9ccbee':dayK>0.45?'#e8a878':'#1a2448'; pctx.fillRect(X,Y,ww,hw);
    if(dayK<=0.45){ pctx.fillStyle='#e8f0ff'; pctx.fillRect(X+3,Y+2,1,1); pctx.fillRect(X+ww-5,Y+4,1,1); }
    pctx.fillStyle=seaC; pctx.fillRect(X,Y+hw,ww,wh-hw); pctx.fillStyle=crC;
    for(let i=0;i<4;i++){ const cx=Math.floor((i*7+fl)%ww), cy=Y+hw+1+((i*3)%Math.max(1,wh-hw-2)); pctx.fillRect(X+cx,cy,Math.min(3,ww-cx),1); }
    if(env.storm>0.3){ pctx.fillStyle='rgba(60,70,90,0.55)'; pctx.fillRect(X,Y,ww,wh); }
    if(rn>0.05){ pctx.fillStyle='rgba(206,222,246,'+(0.3+0.45*rn).toFixed(3)+')'; for(let k=0;k<2+Math.round(rn*5);k++){ const sx=(k*7+Math.floor(itime*(9+k*2)+k*13))%ww, sy=(Math.floor(itime*(34+k*5)+k*11)%(wh+6))-3; for(let j=0;j<3;j++){ const yy=sy+j; if(yy>=0&&yy<wh) pctx.fillRect(X+((sx-j+ww)%ww),Y+yy,1,1); } } }   // (B2) rain running down the glass
    if(env.flash>0.05){ pctx.fillStyle='rgba(230,236,255,'+(env.flash*0.8).toFixed(3)+')'; pctx.fillRect(X,Y,ww,wh); }   // (…and the lightning)
    if(gw){ pctx.fillStyle='#8a6424'; pctx.fillRect(X+(ww>>1),Y+2,1,wh-2); pctx.fillRect(X,Y+Math.round(wh*0.38),ww,1); pctx.fillRect(X,Y+Math.round(wh*0.7),ww,1); pctx.fillStyle='#c09030'; pctx.fillRect(X,Y,3,1); pctx.fillRect(X,Y+1,1,1); pctx.fillRect(X+ww-3,Y,3,1); pctx.fillRect(X+ww-1,Y+1,1,1); pctx.fillRect(X+(ww>>1)-1,Y,3,2); continue; }   // (the gallery: its glazing bars · gilt spandrels arching its head · a keystone)
    pctx.fillStyle='#4a3020'; pctx.fillRect(X+(ww>>1),Y,1,wh); pctx.fillRect(X,Y+(wh>>1),ww,1); pctx.fillStyle='#8a6a40'; pctx.fillRect(X-3,Y+wh+2,ww+6,2); }
  decorDraw(L);                                                                                          // (PT1 B6a: the rugs · what hangs on the wall, beside the stern windows)
  TDRN=0; for(const s of L.sp) tdr(s.sy,20,s,0); crewSort(L); decorSort(L); tdr(player.y,6,null,0);
  const Q=TDR; for(let i=1;i<TDRN;i++){ const o=Q[i]; let j=i-1; while(j>=0 && Q[j].y>o.y){ Q[j+1]=Q[j]; j--; } Q[j+1]=o; }
  for(let i=0;i<TDRN;i++){ const o=Q[i]; if(o.k===20) deckSprDraw(o.a); else if(o.k===21) crewDraw(o.a); else if(o.k===22) decorFurnDraw(o.a); else if(o.k===40) scnDrawActor(o.a); else if(DK.sit) decorSitDraw(); else drawFolk(player.x,player.y,playerLook(),folkDir(player.fx,player.fy),walkFr(player.moving,player.wph||0)); }
  if(L.chand) chandDraw(L);                                                                              // (PT1 B10b: the great cabin's chandelier — it hangs over the map table, above all who pass under it)
  decorFxDraw(L); deckRoomLight(L); crewZs(L); if(DK.edit) editDraw(L); }
function deckSprDraw(s){ const V=DK.V; let o;
  switch(s.k){ case 'house': o=deckHouseOf(s); if(o.wr){ pctx.fillStyle='rgba(28,14,4,0.24)'; pctx.fillRect(TX(s.x)-o.ax+o.w-1,TY(s.y)-o.ay+12,5,o.h-13); } break; case 'helm': o=deckWheelSpr(V,DK.wob); break; case 'mast': deckRigDraw(s); return; case 'ensign': deckEnsignDraw(s); return;   // (PT1 B10b: the castle's two storeys throw a shadow aft of the light)
    case 'galley': o=deckStoveSpr(V); break; case 'bench': o=deckBenchSpr(V); break; case 'windlass': o=deckWindlassSpr(V); break; case 'lantern': o=deckLanternSpr(V); break;
    case 'bed': o=furnSpr(V,{k:'bed'}); break; case 'table': o=furnSpr(V,{k:'map'}); break; case 'chest': o=deckChestSpr(V,Math.hypot(player.x-s.x,player.y-s.y+8)<30); break; case 'shelf': o=deckShelfSpr(V,s.b.x1-s.b.x0+1); break;
    case 'boat': { o=longboatSpr(V); const sh=decorShadow(54); pctx.drawImage(sh.cv,TX(s.x)-sh.ax,TY(s.y)-1); break; }                      // (PT1 B9: the ship's boat on her chocks, her shadow on the planks)
    case 'works': if(!SHIP || !SHIP.work) return; o=deckWorksSpr(V); break;                               // (PT1 B9: the carpenter's plank stack & sawhorse while the works are on)
    case 'ham': lowHamDraw(s); return; case 'ladder': ladderDraw(s); return; case 'cargo': o=cargoSpr(V,s.v); break;   // (PT1 B10a: below — the hammock racks, the ladder to the hatch, the hold's cargo)
    default: return; }
  const X=TX(s.x)-o.ax, Y=TY(s.y)-o.ay; if(X>IW||Y>IH||X+o.w<0||Y+o.h+30<0) return; pctx.drawImage(o.cv,X,Y);
  if(s.k==='galley'){ const f=Math.floor(itime*7)%3; pctx.fillStyle=f?'#ffb040':'#ffd070'; pctx.fillRect(X+o.fb[0]+f,Y+o.fb[1]+1,2,1); deckSmoke(X+o.pipe[0],Y+o.pipe[1],0.13,4,1); deckSteam(X+o.pot[0],Y+o.pot[1]); }   // (the coals flicker · the pipe smokes · the pot steams)
  else if(s.k==='house') deckSmoke(X+o.pipe[0],Y+o.pipe[1],0.61,3,0.7); }                                   // (the cabin's stove, through its roof)
function deckSmoke(cx,cy,sd,n,th){ for(let k=0;k<n;k++){ const pr=(itime*0.3+sd+k/n)%1, q=1+Math.round(pr*3), dx=Math.round(Math.sin(itime*0.9+k*2+sd*9)*1.5*pr+DK.awx*pr*16);   // pixel puffs (the town's chimneys'), leaning with the wind over her deck
    pctx.globalAlpha=0.5*th*(1-pr); pctx.fillStyle=pr<0.3?'#c8c4c8':'#9a98a2'; pctx.fillRect(cx-(q>>1)+dx,cy-2-Math.round(pr*22),q,q); } pctx.globalAlpha=1; }
function deckSteam(cx,cy){ for(let k=0;k<2;k++){ const pr=(itime*0.55+k*0.5)%1; pctx.globalAlpha=0.45*(1-pr); pctx.fillStyle='#f4f4f8'; pctx.fillRect(cx+Math.round(Math.sin(itime*2+k*3)*1.5+DK.awx*pr*4),cy-Math.round(pr*9),1,2); } pctx.globalAlpha=1; }
function deckRigDraw(s){ const D=DK, V=D.V, R=D.rig, X=TX(s.x), Y=TY(s.y), mo=deckMastSpr(V,D.stg,s.fore), so=deckSailSpr(V,D.stg,s.fore,R.st,R.vr);   // the sail (thin while you're behind it), the mast & boom, the jib, the pennant
  const a=so.poly?deckOccA(so.poly,s.x,s.y):1, ea=deckEase(s,'sA',a); if(!s.fore){ D._sailA=a; D.sA=ea; } pctx.globalAlpha=ea; pctx.drawImage(so.cv,X-so.ax,Y-so.ay); pctx.globalAlpha=1;   // (G15 FIX: _sailA the target · sA what's drawn, eased)
  if(R.st) decorXray(D.L.top,s,so.poly,clamp((ea-0.35)/0.65,0,1));                                       // (G18 FIX: her decor seen through the set canvas, as the wheel is)
  if(R.st) deckBoatXray(D.L.top,s,so.poly,clamp((ea-0.35)/0.65,0,1));                                    // (PT1 B9: the Long Sloop's boat, lashed under her main — seen through it too)
  if(!s.fore) deckHelmXray(D.L.top); else crewXray(D.L.top,s,so.poly,clamp((ea-0.35)/0.65,0,1),-1e9,1e9);   // (G15 FIX: the wheel through her canvas — under the boom, under whoever stands in front · B3a: the hands behind a foresail too)
  pctx.drawImage(mo.cv,X-mo.ax,Y-mo.ay);
  if(s.jib){ const jo=deckJibSpr(V,D.L.top,D.stg,R.st,R.vr), ja=jo.poly?deckOccA(jo.poly,s.x,s.y):1, je=deckEase(s,'jA',ja); D._jibA=ja; pctx.globalAlpha=je; pctx.drawImage(jo.cv,X-jo.ax,Y-jo.ay); pctx.globalAlpha=1;
    decorXray(D.L.top,s,jo.poly,clamp((je-0.35)/0.65,0,1)); crewXray(D.L.top,s,jo.poly,clamp((je-0.35)/0.65,0,1),-1e9,1e9); }                                     // (B3a: a hand forward, behind the jib)
  if(!s.fore){ const fo=deckFlagNow(); pctx.drawImage(fo.cv,X-fo.ax,Y-mo.MH-5-fo.ay); } }
function deckEase(o,k,tg){ const v=o[k]==null?tg:o[k]; return o[k]=v+(tg-v)*Math.min(1,(DK.fdt||0.0167)*10); }   // (G15 FIX: a sail thins & fills over ≈ 0.3 s — no pop as you cross the mast's line)
function deckFlagNow(ph){ const D=DK, fid=(SHIP&&SHIP.liv&&SHIP.liv.flag)||'guild';                         // her flag this frame: streaming down the wind over her deck (end-on to you, it's short)
  return deckFlagSpr(D.V,fid,(Math.floor(itime*(5+3*Math.min(2,wind.str)))+(ph|0))%3,D.awx>=0?1:-1,Math.abs(D.awx)<0.3?1:0); }
function deckEnsignDraw(s){ const o=deckEnsignSpr(DK.V), fo=deckFlagNow(1), X=TX(s.x), Y=TY(s.y); pctx.drawImage(o.cv,X-o.ax,Y-o.ay); pctx.drawImage(fo.cv,X-fo.ax,Y-o.ay+1-fo.ay); }
const DK_OCX=[-6,6,0,-6,6], DK_OCY=[-24,-24,-13,-3,-3];
function deckPin(P,px,py){ let inn=false; for(let j=0,k=P.length-1;j<P.length;k=j++){ const a=P[j], b=P[k]; if(((a[1]>py)!==(b[1]>py)) && px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0]) inn=!inn; } return inn; }   // (a point in a sail's outline)
function deckOccA(P,ox,oy){ const hit=(x,y)=>{ if(y>=oy) return false; for(let q=0;q<5;q++) if(deckPin(P,x+DK_OCX[q]-ox,y+DK_OCY[q]-oy)) return true; return false; };   // a set sail goes thin (0.35) while you stand north of its mast, behind it
  return hit(player.x,player.y)||(DK.edit && editOcc(hit))?0.35:1; }   // (PT1 B6b: decorating, the cursor & the ghost thin it too · B3a: the crew don't thin it — a hand behind the canvas is seen through it, as the wheel is (crewXray): the helmsman and a sketching Cartographer would keep her main see-through all day)
function deckBehindSail(L,x,y){ const D=DK; if(!D.rig.st || D._sailA<1) return false; return deckInSail(L,x,y); }   // a lamp hidden by her (opaque) mainsail
function deckInSail(L,x,y){ const D=DK; for(const s of L.sp){ if(s.k!=='mast' || s.fore || y>=s.y) continue; const P=deckSailSpr(D.V,D.stg,0,D.rig.st,D.rig.vr).poly; if(P && deckPin(P,x-s.x,y-s.y)) return true; } return false; }   // (a point behind the main's set canvas — the outline only)
function deckHelmXray(L){ const D=DK; if(!D.rig.st) return; const k=clamp(((D.sA==null?D._sailA:D.sA)-0.35)/0.65,0,1); if(k<0.05) return;   // (G15 FIX) the wheel & binnacle seen through a set main — the deck's one lesson is "walk back to the wheel"
  const M=D.mainM, P=M?deckSailSpr(D.V,D.stg,0,D.rig.st,D.rig.vr).poly:null;                            // (B3a: the hands behind the main too — the helmsman before his wheel)
  for(const s of L.sp){ if(s.k!=='helm') continue; if(M) crewXray(L,M,P,k,-1e9,s.y);
    if(deckInSail(L,s.x,s.y-12)){ const o=deckWheelSpr(D.V,D.wob); pctx.globalAlpha=0.55*k; pctx.drawImage(o.cv,TX(s.x)-o.ax,TY(s.y)-o.ay); pctx.globalAlpha=1; }
    if(M) crewXray(L,M,P,k,s.y,1e9); } }
/* the bow wave (white water heaped at her stem, peeling aft along her side: 0 → 18 texels with her way, 3 frames) · her wake (4-8 streaks astern, longer
   with speed) · the spray a blow throws over her rail */
function deckWake(L){ const D=DK, wl=L.wl, MX=L.MX, sp=clamp(boat.spd/TUNE.baseSpeed,0,1.3), fr=Math.floor(itime*(5+sp*7))%3, fo=Math.floor(D.flow), xs=Math.floor(L.xT)-1, bw=Math.round(18*Math.min(1,sp));
  D._bowW=sp<0.04?0:bw; if(sp<0.04) return;
  const yw=x=>{ const c=x+MX; return c>=0 && c<wl.length && wl[c]!==-999 ? wl[c] : -999; }, y0=yw(xs);
  if(y0!==-999){ pctx.fillStyle='#f2fbff';
    for(let i=0;i<=bw;i++){ const x=xs-i, y=yw(x); if(y===-999) continue; const up=Math.round((1-i/(bw+1))*(1+2.5*sp)), out=Math.round(i*0.42*sp+1);   // white water climbing her bow · the crest spreading out from her side
      for(let u=0;u<=up;u++) if(u<up-1 || ((i+u+fr)&1)) pctx.fillRect(TOX+x,TOY+y-1-u,1,1);
      if(i<3 || (i+fr)%3) pctx.fillRect(TOX+x,TOY+y+out,1,i<bw*0.5?2:1);
      pctx.globalAlpha=0.45; for(let v=1;v<out;v++) if(((x+v+fr)&1)===0) pctx.fillRect(TOX+x,TOY+y+v,1,1); pctx.globalAlpha=1; }
    const nc=2+Math.round(sp*3); for(let j=1;j<=nc;j++) for(let v=-2;v<=1;v++) if(((j+v+fr)%3)!==0 || j===1) pctx.fillRect(TOX+xs+j,TOY+y0+v-Math.round(j*0.4),1,1); }   // (the cushion she shoves ahead of her stem)
  pctx.fillStyle='#e8f4fa'; const len=Math.round(16+sp*60), n=2+Math.min(4,Math.round(sp*4)), H=(L.H-1)*L.TS+18, yN=46, yM=(yN+H)>>1;   // her wake (the foam left on the water runs astern with the sea):
  for(const [y0,dy] of [[yN,-0.38],[H,0.38]]) for(let j=0;j<len;j++){ const ph=((j+fo)%9+9)%9; if(ph>5) continue; pctx.globalAlpha=0.85*(1-j/len); pctx.fillRect(TOX+11-j,TOY+y0+Math.round(dy*j+Math.sin((j+fo)*0.35)*0.8),1,(j<len*0.4&&ph<2)?2:1); }   // the quarter waves, a V spreading from her counter
  for(let k=0;k<n;k++){ const yk=yN+16+Math.round((k+0.5)/n*(H-yN-32)), lk=Math.round(len*(0.35+0.45*tH(k,7))); for(let j=0;j<lk;j++){ if((((j+fo+k*4)%7)+7)%7>2) continue; pctx.globalAlpha=0.45*(1-j/lk); pctx.fillRect(TOX+10-j,TOY+yk+Math.round((yk-yM)*j*0.004+Math.sin((j+fo)*0.2+k)*1.2),1,1); } }   // the slick between, flecked with foam
  pctx.globalAlpha=0.6; for(let i=0;i<10+Math.round(sp*8);i++) pctx.fillRect(TOX+11-Math.floor(tH(i,fr+fo*3)*12),TOY+56+Math.floor(tH(i*3+1,fr*7+fo)*72),1,1);   // (the churn under her counter)
  pctx.globalAlpha=1; }
function deckJibShadow(L){ const D=DK, R=D.rig; if(!R.st) return; for(const s of L.sp){ if(s.k!=='mast' || !s.jib) continue; const P=deckJibSpr(D.V,L,D.stg,R.st,R.vr).poly; if(!P || P.length<3) continue;   // (PT1 B11) under her set jib's foot, from the tack to the clew: deepest where her belly hangs
    const a=P[1], b=P[2], n=Math.max(1,Math.round(Math.abs(b[0]-a[0]))), X0=TX(s.x), Y0=TY(s.y); pctx.fillStyle='rgba(28,14,4,0.2)';
    for(let i=0;i<=n;i++){ const u=i/n; pctx.fillRect(Math.round(X0+a[0]+(b[0]-a[0])*u),Math.round(Y0+a[1]+(b[1]-a[1])*u)+2,1,2+Math.round(Math.sin(Math.PI*u)*3)); } } }
function deckSprayDraw(){ for(const f of DK.fx){ if(f.k!=='spray') continue; const a=clamp(1-f.t/f.life,0,1); pctx.globalAlpha=0.9*a; pctx.fillStyle=f.t<0.3?'#ffffff':'#cfe6f4'; pctx.fillRect(TX(f.x),TY(f.y)-Math.round(f.z),f.t<0.3?2:1,1); } pctx.globalAlpha=1; }
/* ---- (PT1 B11) DECK SIGHTINGS (pt1_boat §4 B11) — what swims past while you walk her: a whale's back breaking the water beside her hull on her true side
   (port = the far water at the top, starboard = the near), her blow in three frames, sliding bow → stern at the deck sea's own pace as you pass · a school
   close by glinting, a fish leaping · gulls wheeling over her mastheads at dawn (gullSpr) · and at the helm the Master's whale & the Crewman's fish calls
   too (deckCallsAtSea). Draw-only: the sea's own whales, schools & seafx mapped into the deck's water (which doesn't bob — toy0) ---- */
let deckSeaCD={whale:-1e9, fish:-1e9};   // (the helm's two calls: their cooldowns — runtime, begin() resets them)
function deckHullX(L){ if(L._hx) return L._hx; const W=L.wl; let a=-1, b=-1, m=0; for(let c=0;c<W.length;c++){ if(W[c]===-999) continue; if(a<0) a=c; b=c; if(W[c]>m) m=W[c]; } return L._hx=[a-L.MX, b-L.MX, m]; }   // her hull's stern & stem (level x) · her deepest waterline
function deckSeaPt(L,x,y,r,toy0){ const dx=x-boat.x, dy=y-boat.y; if(dx*dx+dy*dy>r*r) return null;   // a world point → the deck's view: along her → x (the bow to the right) · across → the water on her side, the nearer the closer in
  const c=Math.cos(boat.a), s=Math.sin(boat.a), al=dx*c+dy*s, ac=-dx*s+dy*c, H=deckHullX(L), t=clamp(Math.abs(ac)/r,0,1), hx=clamp(IW/2-TOX,H[0],H[1])+al*clamp(ETUNE.deckFlow||0.9,0.3,3);   // (G21 FIX · G21V-B03: "the beam" is the middle of what you see — S2–S4's helm sits far aft of her middle)
  let wv=L.wl[Math.round(hx)+L.MX]; if(!(wv>0)) wv=H[2];
  let Y=ac<0 ? toy0-2-t*clamp(toy0-12,0,5) : toy0+wv+4+t*Math.max(0,IH-toy0-H[2]-12);                    // (the far water is a narrow strip under the plates — it hugs her rail)
  const out=Math.max(H[0]-hx,hx-H[1],0); if(out>0) Y+=(toy0+L.yT+ac*0.14-Y)*clamp(out/40,0,1);   // (past her stern or her bow: out in the open water — in her wake, or ahead)
  return {X:TOX+Math.round(hx), Y:Math.round(Y), far:ac<0}; }
function deckWhaleSpr(sp,n,fr,fl){ return tProp(DK.V,'dkWh'+sp.key+n+'_'+fr+(fl?'f':''), ()=>{ const C=sp.col||{body:'#33404e', back:'#46586a', fin:'#2a3540'}, H=Math.max(3,Math.round(n*0.2)), S=PS(n+2,H*2+4), by=S.h-2, ink='#07111a', P=(x,y,c)=>psP(S,fl?S.w-1-x:x,y,c);   // a whale's back breaking the water, side on, her head toward the bow: 0 awash · 1 the hump · 2 the fin & a sliver (fl: she swims astern)
    const R=[mixHex(C.body,ink,0.45),C.body,C.back,mixHex(C.back,'#ffffff',0.35)].map(cI), F=cI(mixHex(C.fin||C.body,ink,0.15)), cut=fr===0?0:fr===1?0.42:0.78;
    const hk=u=>u<0.2?u/0.2*0.55:u<0.78?0.55+0.45*Math.sin(Math.PI*(u-0.2)/1.16):Math.max(0.25,1-(u-0.78)/0.22*0.75), hAt=x=>Math.round(H*hk((x+0.5)/n)-H*cut);   // (the tail's stock low · her back's long rise · the head rounding down into the water)
    for(let x=0;x<n;x++){ const h=hAt(x); for(let j=0;j<h;j++) P(x+1,by-j, j===h-1?R[3]:j===h-2?R[2]:j===0?R[0]:R[1]); }
    if((WHALE_ART[sp.key]||{}).df!==0){ const fx=Math.round(n*0.36), fb=by-Math.max(0,hAt(fx)), fh=Math.max(2,Math.round(H*0.62));   // her dorsal fin, a third of her back from the tail, raked aft
      for(let j=0;j<fh;j++){ const w=Math.max(1,fh-j-1), x0=fx+1-Math.round(j*0.5); for(let i=0;i<w;i++) P(x0+i,fb-j, j===fh-1||i===0?R[2]:F); } }
    const o=psCv(psOut(S,cI(ink),false),(S.w>>1),by); return o; }); }
function deckSightA(k,x0,y0,x1,y1){ const D=DK, B=D&&D._sb; if(!D) return 1; let hit=false; if(B) for(let i=0;i<B.length && !hit;i+=4) hit=B[i]*IKX<x1 && (B[i]+B[i+2])*IKX>x0 && B[i+1]*IKY<y1 && (B[i+1]+B[i+3])*IKY>y0;   // a deck plate (CSS px) over a sighting fades to 0.3 while it passes beneath — the far water is the plates' strip
  let tg=hit?0.3:1; const R=D._rr; if(!hit && k!=='t' && R && ((R[0]<x1 && R[2]>x0 && R[1]<y1 && R[3]>y0) || (R[6]>R[4] && R[4]<x1 && R[6]>x0 && R[5]<y1 && R[7]>y0))) tg=0.4;   // (R1a · G20V-B05: over you, or over a room's own art — the great cabin's gallery & bell, the hammocks — 40 %, still readable)
  const P=D._pa||(D._pa={}), v=P[k]==null?1:P[k]; return P[k]=v+(tg-v)*Math.min(1,(D.fdt||0.0167)*8); }
function deckSights(L,toy0,far){ const D=DK; if(D.lv!=='top') return; const B=D._sb||(D._sb=[]), box=(x,y,w,h)=>{ if(B.length<64) B.push(x,y,w,h); };   // (the boxes drawn — deckSightA's)
  for(const w of whales){ if(w.st==='gone') continue; const p=deckSeaPt(L,w.x,w.y,450,toy0); if(!p || p.far!==far || p.X<-60 || p.X>IW+60) continue; const dep=clamp(w.depth,0,1); if(dep>0.8) continue;
    const n=clamp(Math.round(w.sp.len*0.6),10,42), fr=dep<0.15?0:dep<0.45?1:2, o=deckWhaleSpr(w.sp,n,fr,Math.cos(w.a-boat.a)<0), br=w.breachK>0?Math.round(Math.sin(clamp(w.breachK,0,1)*Math.PI)*6):0, Y=p.Y+Math.round(Math.sin(time*1.3+(w.seed&255))*0.6)-br;
    pctx.globalAlpha=clamp(1.15-dep*1.3,0,1); pctx.drawImage(o.cv,p.X-o.ax,Y-o.ay); box(p.X-o.ax,Y-o.ay,o.w,o.h); pctx.fillStyle='#eef8fa';   // her back · the water fizzing white along it
    for(let i=0;i<5;i++){ if(h2i(i+((time*6)|0),w.seed&1023)>0.6) continue; pctx.fillRect(p.X-(n>>1)+Math.round(h2i(i,w.seed&511)*n),Y+1,(i&1)+1,1); }
    pctx.globalAlpha=1; }
  for(const f of seafx){ if(f.k!=='spout' && f.k!=='jump') continue; const p=deckSeaPt(L,f.x,f.y,f.k==='spout'?450:250,toy0); if(!p || p.far!==far || p.X<-30 || p.X>IW+30) continue; const pr=clamp(f.t/Math.max(0.01,f.life),0,1);
    if(f.k==='spout'){ const fr=pr<0.18?0:pr<0.55?1:2, h=Math.round((f.big?15:10)*(f.weak?0.65:1)), X=p.X, Y=p.Y-2, dr=Math.round(D.awx*pr*7);   // her blow: 0 the jet · 1 the column & its crown · 2 the mist drifting off down the wind
      pctx.globalAlpha=fr===2?clamp(1.7-pr*1.7,0,0.8):0.95; box(X-5,Y-h-5,11,h+6);
      if(fr<2){ const ch=fr?h:Math.round(h*0.6); for(let j=0;j<ch;j++){ const u=j/Math.max(1,ch-1), ww=1+Math.round(u*(fr?3:1)), x0=X-(ww>>1)+Math.round(dr*u*0.5);   // the column, flaring as it climbs — lit left, shaded right
          pctx.fillStyle='#ffffff'; pctx.fillRect(x0,Y-j,ww,1); if(ww>1){ pctx.fillStyle='#c4dcea'; pctx.fillRect(x0+ww-1,Y-j,1,1); } } }
      if(fr>=1){ const pf=puffSpr(fr===1?3:4); pctx.drawImage(pf.cv,X+dr-pf.ax,Y-h-(fr===2?2:0)-pf.ay); pctx.fillStyle='#ffffff';   // the crown · spray fraying off it, then falling
        for(let j=0;j<5;j++){ const ja=j*1.7+f.t*3; pctx.fillRect(X+dr+Math.round(Math.cos(ja)*(4+pr*5)),Y-h+Math.round(Math.sin(ja)*(2+pr*2))+(fr===2?Math.round(pr*6):0),1,1); } }
      pctx.globalAlpha=1; }
    else { const up=Math.round(Math.sin(pr*Math.PI)*5), sg=Math.cos((f.a||0)-boat.a)>=0?1:-1, X=p.X+Math.round((pr-0.5)*8*sg);   // a fish leaping clear & back in
      pctx.fillStyle=f.col||'#cfe6f0'; pctx.fillRect(X-1,p.Y-up,2,1); if(pr<0.2||pr>0.8){ pctx.fillStyle='#eef8fc'; const ex=p.X+(pr<0.2?-4:4)*sg; pctx.fillRect(ex-1,p.Y,3,1); pctx.fillRect(ex,p.Y-1,1,1); } } }
  for(const s of schools){ const p=deckSeaPt(L,s.x,s.y,250,toy0); if(!p || p.far!==far || p.X<-30 || p.X>IW+30) continue;   // a school close by: a dark stir under the surface, glints winking off turning flanks (by night, their own faint light)
    const sd=(Math.round(s.r*7)+s.n*131+((s.sp.key||'').length*17))|0, n=Math.min(6,2+(s.n>>2)), w=Math.round(clamp(s.r*0.5,6,18)), night=env.L<0.35, gold=(s.sp.tier|0)>=3, gx=i=>p.X+Math.round((h2i(sd,i)-0.5)*w*2+Math.sin(time*1.6+i*2)*2), gy=i=>p.Y+Math.round((h2i(sd,i+9)-0.5)*5);
    pctx.fillStyle='rgba(6,20,36,0.42)'; for(let i=0;i<n;i++) pctx.fillRect(gx(i)-1,gy(i)+1,3,1); box(p.X-w-3,p.Y-4,w*2+6,9);
    for(let i=0;i<n;i++){ const ph=(time*2.3+i*0.37+h2i(sd,i+3))%1; if(ph>0.4) continue;
      if(night){ pctx.globalAlpha=0.7*(1-ph/0.4); pctx.fillStyle=s.sp.col||'#9fd2ff'; pctx.fillRect(gx(i),gy(i),1,1); pctx.globalAlpha=1; }
      else { const o=starSpr(ph>0.08&&ph<0.2,gold?'#ffe27a':'#dff4ff'); pctx.drawImage(o.cv,gx(i)-o.ax,gy(i)-o.ay); } } } }
function deckGulls(L){ if(L.id!=='top' || env.dayT>=0.5 || env.storm>0.45 || env.fog>0.6) return; const k=clamp((env.sun+0.12)/0.12,0,1)*clamp((0.7-env.sun)/0.2,0,1); if(k<0.02) return;   // dawn (and on into the early morning — a dawn is ~15 s): gulls wheel over her masthead(s), their shadows sliding over her planks
  let g=0; for(const s of L.sp){ if(s.k!=='mast') continue; const X=TX(s.x), Y=TY(s.y), MH=deckMastH(DK.stg,s.fore);
    for(let j=0;j<(s.fore?1:2);j++,g++){ const ga=itime*(0.55+g*0.12)+g*2.3, rx=22+g*6, gx=Math.round(X+Math.cos(ga)*rx), gy=Math.round(Y-MH+12+Math.sin(ga)*rx*0.38+Math.sin(itime*2.6+g)*1.5);
      const sh=shdSpr(2,1); pctx.globalAlpha=0.2*k; pctx.drawImage(sh.cv,gx+3-sh.ax,Math.round(Y-8+Math.sin(ga)*rx*0.3)-sh.ay);
      const o=gullSpr([0,1,2,1][(Math.floor(itime*7+g*1.7))&3]); pctx.globalAlpha=k; pctx.drawImage(o.cv,gx-o.ax,gy-o.ay); } }
  pctx.globalAlpha=1; }
function deckCallsAtSea(){ if(mode!=='sea' || !started || ptMode || hunt || LEDG) return; const t=time, C=deckSeaCD, wk=t-C.whale>=60 && whales.length>0, fk=taughtFish && !net && netCD<=0 && t-C.fish>=90 && schools.length>0;   // at the helm: the Master sings out for a whale to close on for the irons, the Crewman for fish jumping — once a whale or a school, on their cooldowns (the deck's calls mark them too)
  if((!wk && !fk) || !crew.some(m=>m.role!=='captain' && !(expd && m.role==='explorer'))) return;   // (nobody aboard to sing out — or nothing to sing out about: no allocation a frame)
  if(wk) for(const w of whales){ if(w.st==='gone' || w.st==='flee' || w._mc || w.depth>0.5) continue; if((w.x-boat.x)**2+(w.y-boat.y)**2<450*450){ w._mc=1; C.whale=t; toast('🐋  '+deckSpeaker('master')+': “Whale off the '+deckSide(w.x,w.y)+', Cap’n — close in for the irons!”','an iron flies ~'+fmtDist(WTUNE.throwRange)+': when your aim turns gold, '+(inDev==='pad'?glyph('attack'):'🖱 click')+' to throw'); break; } }   // (G21 FIX · G21V-B02: the call's 450 — an iron flies throwRange)
  if(fk) for(const s of schools){ if(s._mc) continue; if((s.x-boat.x)**2+(s.y-boat.y)**2<250*250){ s._mc=1; C.fish=t; toast('🐟  '+deckSpeaker('crewman')+': “Fish jumping off the '+deckSide(s.x,s.y)+', Cap’n!”',keyGlyph('skill2','F')+' pays out the net — circle them'); break; } } }
/* the stations' sprites (B1: simple, clean — B2 dresses them: the sails, the binnacle, the awning, the smoke) */
function deckHouseSpr(V,b){ const w=(b.x1-b.x0+1)*20, h=(b.y1-b.y0+1)*20, T=deckLevel('top'), dx=T&&T.st.door?(T.st.door.x-b.x0)*20+12:w>>1, LV=deckLiv();
  return tProp(V,'dkHouse'+w+'_'+h+'_'+dx+LV.hull, ()=>{ const WH=24, RH=4, SW=w+4, SH=h+RH+WH, ry=h+RH, S=PS(SW,SH), FC=tRamp('#8a5a30'), RF=tRamp('#6a5240'), HU=tRamp(LV.hull), BR=cIR(['#8a6424','#d8a840','#ffe08a']), GL=cIR(['#1a2636','#2e4458','#7aa0c0']);
    for(let y=0;y<ry;y++){ const u=y/Math.max(1,ry-1), lit=2.1+1.6*Math.exp(-(((u-0.3)/0.22)**2))-0.5*u;   // the roof: a cambered top of tarred canvas — its crown a third back catches the light, the front slope falls away
      for(let x=0;x<SW;x++){ let v=lit+bayV(x,y)*0.9; const q=y%8; if(q===4) v-=1.05; else if(q===5) v+=0.5; else if(q===3 && (x%4)===1) v-=0.7; else if(h2i(x>>1,(y>>3)+7)<0.07) v-=0.45; psP(S,x,y,RF[clamp(Math.floor(v),0,5)]); } }   // (dithered between shades · PT1 B11: warm tarred canvas, lapped seams fore & aft every 8 — the lap's dark line, its lit edge, a row of stitches — and the odd tar streak)
    for(let y=0;y<ry;y++){ pR(S,0,y,3,1,FC[y<2?4:2]); pR(S,SW-3,y,3,1,FC[1]); psP(S,2,y,FC[3]); } pR(S,0,0,SW,3,FC[3]); pR(S,0,0,SW,1,FC[5]); pR(S,0,2,SW,1,FC[1]);   // its oak coaming round the edge
    pR(S,4,ry-8,SW-8,1,FC[4]); pR(S,4,ry-7,SW-8,1,FC[1]); for(let x=6;x<SW-6;x+=12) pR(S,x,ry-7,1,4,FC[2]);   // a grab-rail along its front edge
    pR(S,0,ry-2,SW,2,FC[4]); pR(S,0,ry-2,SW,1,FC[5]);                                                   // the eave's oak trim
    const sx=Math.round(SW*0.28), sy=Math.round(ry*0.3); pR(S,sx-1,sy-1,14,9,FC[2]); pR(S,sx,sy,12,7,GL[0]); pR(S,sx,sy,12,1,GL[2]); pR(S,sx+6,sy,1,7,FC[1]); psP(S,sx+2,sy+2,GL[2]);   // the skylight
    const px=Math.round(SW*0.8); pR(S,px,Math.max(0,ry-34),3,12,cI('#2a2628')); pR(S,px-1,Math.max(0,ry-35),5,2,cI('#4a4648'));   // the stovepipe
    for(let y=ry;y<SH;y++) for(let x=0;x<SW;x++){ let c;                                                    // the front wall: oak planks, corner posts, a band of her paint at its foot
      if(y>=SH-5) c=HU[y===SH-5?5:x<2?4:3]; else { let v=x%5===0?2:3; if(x<2) v=4; else if(x>SW-3) v=1; if(y===ry) v=1; c=FC[v]; } psP(S,x,y,c); }
    const d0=clamp(dx-6,3,SW-15); pR(S,d0-1,SH-24,14,19,FC[1]); pR(S,d0,SH-23,12,18,FC[2]); for(let x=d0+3;x<d0+12;x+=4) pR(S,x,SH-23,1,18,FC[1]); pR(S,d0,SH-23,12,1,FC[4]); pR(S,d0+9,SH-14,2,2,BR[1]); psP(S,d0+9,SH-14,BR[2]);   // the door, its brass handle
    const win=[]; for(const f of [0.2,0.8]){ let cx=Math.round(SW*f); if(Math.abs(cx-(d0+6))<12) cx+=cx<d0+6?-10:10; const cy=SH-16; psDisc(S,cx,cy,3.6,3.6,(nx,ny)=>{ const r=nx*nx+ny*ny; return r>0.62?BR[ny<0?2:0]:GL[ny<-0.2?2:0]; }); win.push([cx,cy]); }   // two round windows in brass
    const o=tOut(S,SW>>1,SH-1); o.win=win; o.door=[d0,SH-23,12,18]; o.pipe=[px+1,Math.max(0,ry-35)]; o.sky=[sx,sy,12,7]; return o; }); }
function deckWheelSpr(V,rot){ rot=rot|0; return tProp(V,'dkWheel'+rot, ()=>{ const S=PS(26,32), W=tRamp('#8a5a30'), Br=cIR(['#8a6424','#d8a840','#ffe08a']), cx=11, cy=12, rx=6, ry=9;   // (rot ±1: the Master's hands on the spokes — B2)
  pR(S,9,21,4,9,W[2]); pR(S,9,21,1,9,W[4]); pR(S,6,29,10,3,W[1]); pR(S,6,29,10,1,W[3]);                 // the pedestal
  for(let a=0;a<8;a++){ const t=a*TAU/8+0.2+rot*0.16; for(let r=0;r<=1.3;r+=0.06) psP(S,Math.round(cx+Math.cos(t)*rx*r),Math.round(cy+Math.sin(t)*ry*r), r>1.06?W[5]:W[3]); }   // spokes & their turned handles
  for(let a=0;a<72;a++){ const t=a*TAU/72; psP(S,Math.round(cx+Math.cos(t)*rx),Math.round(cy+Math.sin(t)*ry), Math.cos(t+2.4)>0.2?W[5]:Math.cos(t+2.4)<-0.4?W[1]:W[3]); }   // the rim, lit from the top-left
  pR(S,cx-1,cy-1,3,3,Br[1]); psP(S,cx-1,cy-1,Br[2]);
  pR(S,19,22,4,8,W[2]); pR(S,19,22,1,8,W[4]); pR(S,22,22,1,8,W[1]); pR(S,18,29,6,2,W[1]); pR(S,18,29,6,1,W[3]);   // (B2) the binnacle, just forward of the wheel: its oak post,
  psDisc(S,21,18.5,3.2,3.4,(nx,ny)=>ny>0.45?Br[0]:(nx<-0.2&&ny<0)?Br[2]:Br[1]); pR(S,20,20,3,1,cI('#3a3028')); psP(S,21,20,cI('#ffd070'));   // its brass hood over the compass · the lamp's slit
  return Object.assign(tOut(S,11,31),{bn:[21,20]}); }); }
/* (PT1 B2) THE RIG — the mast & its boom · the gaff mainsail as she carries it (furled · reefed in 6 steps · full · bellied to her lee · shaking head to
   wind) · the jib on the forestay · the masthead pennant & the stern ensign. Sails are baked per state into DK.V (a dozen small canvases) and go thin
   (0.35) while you stand north of the mast behind one */
function deckBoomL(stg,fore){ return Math.round([76,90,90,96,104][clamp(stg|0,0,4)]*(fore?0.73:1)); }
function deckMastH(stg,fore){ return fore?70:(stg>=3?84:78); }
function sailRamp(c){ const v=parseInt(c.slice(1,7),16), lu=(((v>>16)&255)*0.3+((v>>8)&255)*0.59+(v&255)*0.11)/255;   // (pt1_boat §3.15: a sail colour's 5 shades — B8's harbour & landing boats use it too)
  if(lu<0.72) return cIR([mixHex(c,'#1a1424',0.42),mixHex(c,'#1a1424',0.25),mixHex(c,'#1a1424',0.1),c,mixHex(c,'#fff4e0',0.24)]);   // (PT1 B8: a dyed cloth — tanbark, rust, midnight — darkens into its folds; the spec's greys would lift it)
  return cIR([mixHex(c,'#6a6258',0.45),mixHex(c,'#8a8070',0.3),mixHex(c,'#b8ae94',0.12),c,mixHex(c,'#ffffff',0.25)]); }
function deckSailSt(){ const s=boat.sail; return s<0.08?0 : s>0.6?7 : 1+clamp(Math.floor((s-0.08)/0.52*6),0,5); }   // 0 furled · 1-6 reefed (the gaff dropped to 45…91 %) · 7 full
function deckSailVr(){ if((Math.cos(boat.a-wind.a)+1)/2<0.25) return 2+(Math.floor(itime*8)&1); return Math.sin(wind.a-boat.a)>=0?0:1; }   // 0 bellied to starboard (toward you) · 1 to port · 2/3 head to wind: the leech shakes (8 Hz)
function deckMastSpr(V,stg,fore){ const bl=deckBoomL(stg,fore), MH=deckMastH(stg,fore);
  return tProp(V,'dkMast'+bl+'_'+MH, ()=>{ const SW=bl+10, SH=MH+6, mx=SW-6, by=SH-1, S=PS(SW,SH), M=tRamp('#8a5a30'), IR=cI('#3a3434');
    const yb=by-16; pR(S,3,yb,mx-3,3,M[2]); pR(S,3,yb,mx-3,1,M[4]); pR(S,3,yb+2,mx-3,1,M[1]); pR(S,3,yb-1,2,5,M[1]); psP(S,4,yb,M[3]);   // the boom, aft along her deck (its end capped)
    pR(S,mx-6,yb-1,4,5,M[1]); pR(S,mx-5,yb,2,3,IR);                                                        // its gooseneck at the mast
    for(let y=by-MH;y<=by;y++){ psP(S,mx-2,y,M[4]); psP(S,mx-1,y,M[3]); psP(S,mx,y,M[3]); psP(S,mx+1,y,M[2]); psP(S,mx+2,y,M[1]); if((by-y)%14===7) for(let x=mx-2;x<=mx+2;x++) psP(S,x,y,IR); }   // the mast: its hoops every 14
    pR(S,mx-5,by-60,11,2,M[2]); pR(S,mx-5,by-60,11,1,M[4]); pR(S,mx-1,by-MH-2,3,3,M[4]); pR(S,mx,by-MH-5,1,3,M[1]);   // the crosstree · the truck & the pennant's staff
    const o=tOut(S,mx,by); o.lx=mx; o.ly=by-MH-1; o.MH=MH; return o; }); }
function deckSailSpr(V,stg,fore,st,vr){ const bl=deckBoomL(stg,fore), MH=deckMastH(stg,fore), LV=deckLiv(), sc=LV.sail;
  return tProp(V,'dkSail'+bl+'_'+MH+'_'+st+'_'+vr+LV.sid, ()=>{ const SW=bl+10, SH=MH+6, mx=SW-6, by=SH-1, yb=by-16, S=PS(SW,SH), SR=sailRamp(sc), SD=cI(mixHex(sc,'#3a3028',0.62)), M=tRamp('#8a5a30'), RP=cI('#4a3424'), PT=livSailPat(LV);   // (PT1 B8: her sails' own cloth — a band, patches, pale stitching, a gold hem)
    if(!st){ for(let x=6;x<mx-3;x++){ const hg=4+Math.round(Math.sin(x*0.45)+Math.sin(x*0.13+1)); for(let j=0;j<hg;j++) psP(S,x,yb-1-j,j===hg-1?SR[3]:j===0?SD:j===hg-2?SR[1]:SR[0]); if(x%12===0) for(let j=0;j<=hg;j++) psP(S,x,yb-j,RP); }   // furled & lashed on the boom (in its own shade, lit along its top)
      const gx=Math.round(mx-bl*0.62); pR(S,gx,yb-7,mx-3-gx,2,M[2]); pR(S,gx,yb-7,mx-3-gx,1,M[4]);        // the gaff, lowered onto the bundle
      const o=tOut(S,mx,by); o.poly=[[4-mx,yb-8-by],[-3,yb-8-by],[-3,yb+3-by],[4-mx,yb+3-by]]; return o; }   // (G15 FIX: the bundle & the gaff thin too while you stand behind them)
    const h=st>=7?1:lerp(0.45,1,(st-1)/6), Lx=mx-3, F=yb-1, Hh=Math.round(51*h), Pk=Math.round(63*h), px=Math.round(mx-bl*0.85), cx=mx-bl+3, lee=vr===0?1:vr===1?-1:0, lf=vr===2?1:vr===3?-1:0, bul=lee?(st>=7?3:2):0;
    const lxAt=t=>cx+(px-cx)*t-bul*Math.sin(Math.PI*t)+(lf?lf*Math.sin(t*Math.PI*3+0.6)*1.7:0);   // the leech: bowed by her belly · or shaking
    const P=[[Lx+0.5,F+0.5],[Lx+0.5,F-Hh]]; for(let i=12;i>=0;i--){ const t=i/12; P.push([lxAt(t),F+0.5-Pk*t]); }
    const yh=x=>F-Hh+(Hh-Pk)*clamp((Lx-x)/Math.max(1,Lx-px),0,1);                                              // (the gaff over this column)
    const fdx=Lx-px, fdy=Pk, fl=Math.hypot(fdx,fdy);                                                   // (the stress fold: the peak down to the tack)
    const PR=PT.pt?[[0.24,0.26],[0.58,0.62],[0.7,0.2]].map(([u0,v0],i)=>{ const x0=Math.round(Lx-u0*(Lx-cx)), y0=Math.round(F-v0*Hh); return [x0-3,y0-3,x0+3+(i&1),y0+2]; }):null;   // (the patches: three squares sewn into her cloth)
    const pat=(x,y,u,v,k)=>{ if(PT.hem && (F-y<1.5 || x-lxAt(clamp((F+0.5-y)/Math.max(1,Pk),0,1))<1.6)) return PT.hem;   // (silk: a gold hem round her foot & leech)
      if(PR) for(let i=0;i<3;i++){ const r=PR[i]; if(x>=r[0] && x<=r[2] && y>=r[1] && y<=r[3]) return (x===r[0]||x===r[2]||y===r[1]||y===r[3]) && ((x+y)&1) ? SD : PT.pt[i][clamp(k,0,4)]; }
      if(PT.band && v>=0.4 && v<0.55) return PT.band[clamp(k,0,4)];
      if(PT.st && ((Lx-x)%12)===0) return (y&1)?PT.st:SR[1];   // (midnight: every other seam sewn in a pale thread)
      return 0; };
    psPoly(S,P,(x,y)=>{ const u=clamp((Lx-x)/Math.max(1,Lx-cx),0,1), v=clamp((F-y)/Math.max(1,F-yh(x)),0,1), b=Math.pow(Math.sin(Math.PI*u),0.8)*(0.7+0.3*Math.sin(Math.PI*v)), fd=Math.abs((x+0.5-px)*fdy-(y+0.5-(F-Pk))*fdx)/fl, pn=Math.floor((Lx-x)/6);
      let s=1.7+bayV(x,y)*0.6+(pn&1)*0.22;                                                                 // (the cloths: every other one a shade apart)
      if(lee>0) s+=b*2.5-0.2; else if(lee<0) s+=1.45-b*1.35+u*0.3; else s+=0.8+(((Math.floor((x+y*0.7+lf*2)/3))&1)?0.85:-0.55)*u;   // her belly toward you catches the light · away from you, in its own shade · (shaking: the cloth ripples aft)
      if(lf===0 && fd<1.1 && u>0.15 && u<0.85) s-=0.7;                                                      // the fold the gaff's pull puts in her
      if(u<0.05 || F-y<2 || y-yh(x)<1.5) s-=0.85;                                                           // the luff in the mast's lee · the foot on the boom · the head under the gaff
      if(((Lx-x)%6)===0) s=Math.min(s,1.3);                                                                // the cloths' seams
      const pc=pat(x,y,u,v,Math.floor(s)); if(pc) return pc;
      return s<0.5?SD:SR[clamp(Math.floor(s),0,4)]; });
    if(st<7){ for(let x=cx+1;x<Lx;x++){ const hg=2+((x*7)%5<2?1:0); for(let j=0;j<hg;j++) psP(S,x,F-j,j===hg-1?SR[2]:j?SR[0]:SD); if(x%5===2){ psP(S,x,F-hg,RP); psP(S,x,F-hg-1,SR[1]); } } }   // (reefed: the cloth rolled on the boom · its reef points)
    if(!fore && stg>=3 && st>=7){ const T=[[Lx+0.5,F-Hh-2.5],[Lx+0.5,by-MH+4.5],[px+3,F-Pk-2.5]];   // (PT1 B10b) stage 3+: the main's gaff topsail — her head at the masthead, her clew out at the gaff's peak (handed whenever she's reefed)
      psPoly(S,T,(x,y)=>{ const u=clamp((Lx-x)/Math.max(1,Lx-px),0,1); let s=2.75+bayV(x,y)*0.5+((((Lx-x)/6)|0)&1)*0.2; if(lee>0) s+=0.6*Math.sin(Math.PI*u); else if(lee<0) s-=0.25; else if(lf) s+=((Math.floor((x+y*0.7+lf*2)/3))&1)?0.6:-0.5;
        if(u<0.05) s-=0.8; if(((Lx-x)%6)===0) s=Math.min(s,1.3); if(PT.st && ((Lx-x)%12)===0) return (y&1)?PT.st:SR[1]; return s<0.5?SD:SR[clamp(Math.floor(s),0,4)]; }); for(let y=by-MH+6;y<F-Hh-3;y+=3) psP(S,Lx-1,y,RP); }   // (lit higher than the main · laced to the mast)
    psLine(S,Lx+1,F-Hh-1,px+1,F-Pk-1,M[2],2); psLine(S,Lx+1,F-Hh-2,px+1,F-Pk-2,M[4],1); pR(S,Lx-1,F-Hh-2,3,3,M[1]);   // the gaff along her head · its jaws on the mast
    psOut(S,cI(OLC),false);
    for(const t of [0.42,0.82]) psLine(S,mx-1,by-MH+4,Math.round(Lx+(px-Lx)*t),Math.round(F-Hh-1+(Hh-Pk)*t)-1,RP,1);   // the peak halyards from the masthead
    const o=psCv(S,mx,by); o.poly=P.map(p=>[p[0]-mx,p[1]-by]); return o; }); }
function deckJibSpr(V,L,stg,st,vr){ const LV=deckLiv(), sc=LV.sail, n=L.st.masts.length, m=L.st.masts[n-1], fx=(m.x+0.5)*L.TS, fy=(m.y+1)*L.TS-4, MH=deckMastH(stg,n>1);
  return tProp(V,'dkJib'+stg+'_'+(st?1:0)+'_'+(st?vr:0)+LV.sid, ()=>{ const ax=4, ay=MH+6, tx=ax+Math.round(L.xT+60-fx), ty=ay+Math.round(L.yT-24-fy), SW=tx+5, SH=ay+4, S=PS(SW,SH), SR=sailRamp(sc), SD=cI(mixHex(sc,'#3a3028',0.62)), RP=cI('#4a3424'), PT=livSailPat(LV);
    const hx=ax+3, hy=ay-Math.min(70,MH-2), kx=ax, ky=ay-MH-1, clx=ax+Math.round(L.xT-4-fx), cly=ay+Math.round(L.yT-3-fy);   // the head (on the forestay, 70 up the mast) · the masthead · the clew, down at her stem
    let poly=null;
    if(!st){ for(let k=0;k<26;k++){ const x=tx-3-k, y=ty+Math.round(k*0.18)-1, hg=2+((k*5)%4<2?1:0); for(let j=0;j<hg;j++) psP(S,x,y-j,j===hg-1?SR[3]:j?SR[1]:SD); if(k%7===3) for(let j=0;j<=hg;j++) psP(S,x,y-j+1,RP); } }   // stowed: rolled & lashed along the bowsprit
    else { const lee=vr===0?1:vr===1?-1:0, lf=vr===2?1:vr===3?-1:0, bul=lee?2:0, P=[[hx,hy],[tx,ty]];
      for(let i=0;i<=10;i++){ const t=i/10, w=Math.sin(Math.PI*t); P.push([clx+(hx-clx)*t-bul*w*0.8+(lf?lf*Math.sin(t*Math.PI*3)*1.6:0), cly+(hy-cly)*t+bul*w*0.6]); }   // tack → clew → up her leech to the head
      const dx=tx-hx, dy=ty-hy, dl=Math.hypot(dx,dy), dC=Math.abs((clx-hx)*dy-(cly-hy)*dx)/dl, lx=hx-clx, ly=hy-cly, ll=Math.hypot(lx,ly)||1, ftx=clx-tx, fty=cly-ty, ftl=Math.hypot(ftx,fty)||1;   // (PT1 B11: the leech & the foot — her cloths cross-cut square to the leech, a tabling along her foot)
      psPoly(S,P,(x,y)=>{ const u=clamp(Math.abs((x+0.5-hx)*dy-(y+0.5-hy)*dx)/dl/Math.max(1,dC),0,1), v=clamp(((x+0.5-hx)*dx+(y+0.5-hy)*dy)/(dl*dl),0,1), b=Math.sin(Math.PI*u)*Math.sin(Math.PI*v);
        let s=1.75+bayV(x,y)*0.8; if(lee>0) s+=b*2.2+(1-u)*0.3; else if(lee<0) s+=1.25-b*1.15+u*0.45; else s+=0.8+(((Math.floor((x-y*0.5+lf*2)/3))&1)?0.85:-0.55)*u;
        const wl=((x+0.5-clx)*lx+(y+0.5-cly)*ly)/ll, df=Math.abs((x+0.5-tx)*fty-(y+0.5-ty)*ftx)/ftl;
        if(u<0.06) s-=0.85; if(df<1.7) s-=0.7; else if(((Math.floor(wl)%7)+7)%7===0) s=Math.min(s,1.4); else if(((Math.floor(wl/7))&1) && s>1.2) s-=0.18;
        if(PT.hem && u>0.9) return PT.hem; if(PT.pt && u>0.34 && u<0.56 && v>0.34 && v<0.5) return ((x+y)&1) && (u<0.37||u>0.53||v<0.36||v>0.48) ? SD : PT.pt[1][clamp(Math.floor(s),0,4)];   // (PT1 B8: her cloth — a gold hem · a patch ·
        if(PT.band && u>=0.42 && u<0.58) return PT.band[clamp(Math.floor(s),0,4)]; if(PT.st && (x%12)===0) return (y&1)?PT.st:SR[1];   //  a band · pale stitching, as the main's)
        return s<0.5?SD:SR[clamp(Math.floor(s),0,4)]; });
      poly=P.map(p=>[p[0]-ax,p[1]-ay]); }
    psOut(S,cI(OLC),false);
    psLine(S,tx,ty-1,kx,ky,RP,1);                                                                              // the forestay: the bowsprit's end up to her masthead
    const o=psCv(S,ax,ay); o.poly=poly; return o; }); }
const DECK_FLAGS={   // a flag's 10×7 field: (x, y) → a shade in its palette, or −1 (no cloth: a pennant's taper, a swallowtail's notch) — B8 adds the rest, one row each
  guild:{p:['#8a6414','#d8a830','#ffd23f','#fff0a0'], f:(x,y)=>{ const t=Math.abs(y-3); if(x>=6 && t<=(x-6)*0.8) return -1; return x===0?0:y===0?3:y===6?1:(x===1?1:2); }},   // the Guild's gold swallowtail pennant
  /* (PT1 B8) the rest, painted texel by texel (0 the hoist's shade · 1 the field · 2 the device · 3 its second colour) */
  anchor:{p:['#1a2840','#2a3e62','#f4efe0','#a8b8d0'], f:deckFlagRows(['0111111111','0111121111','0111323111','0111121111','0112121211','0111222111','0111111111'])},   // the harbour's: navy, a white anchor
  palm:{p:['#1a6060','#2a8a8a','#ffd23f','#c8902a'], f:deckFlagRows(['0112211221','0121122112','0211311121','0111131111','0111131111','0111311111','0113333111'])},   // the isles': teal, a yellow palm (its fronds splaying & drooping, a tall trunk) on its mound
  snowstar:{p:['#3a4458','#5a6478','#f4f6fa','#a8c8e8'], f:deckFlagRows(['0111111111','0112121211','0111222111','0112232211','0111222111','0112121211','0111111111'])},   // the north's: slate, a white snow-star
  sun:{p:['#8a5a14','#c8902a','#c8301a','#ffd060','#7a2410'], f:deckFlagRows(['0111141111','0114111411','0111232111','0141222141','0111222111','0114111411','0111141111'])},   // the sands': ochre, a round red sun lit gold, a ring of eight dark rays clear of it (G19 FIX: it read as a splat)
  crane:{p:['#c8c0b0','#f4efe0','#c0302a','#1e1a1a'], f:deckFlagRows(['0111111111','0111132211','0111322221','0113122221','0113122221','0131112211','0111111111'])},   // the east's: white, a red sun, a black crane's neck
  hammer:{p:['#4a4444','#2a2628','#e8701a','#ffb050','#c8945a'], f:deckFlagRows(['0111111111','0123322221','0122222111','0111141111','0111141111','0111141111','0111141111'])},   // the forges': black, an orange hammer head (its face, its claw tapering) on a pale haft (G19 FIX: it read as a K)
  crystal:{p:['#4a2878','#6a3aa8','#5ae8f0','#e8ffff'], f:deckFlagRows(['0111121111','0111232111','0112322211','0112322211','0112222211','0111222111','0111121111'])},   // the glow shores': violet, a cyan crystal
  clover:{p:['#2a5a2a','#3a7a3a','#f4f6e8','#c8e0b8','#a8d098'], f:deckFlagRows(['0111221111','0112222111','0111221111','0221141221','0222212221','0122112211','0111114111'])},   // the bogs': green, a white clover — three round leaves, the green between them — & its stem (G19 FIX: it read as a splat)
  boar:{p:['#6a1a14','#a82a22','#f0e6c8','#c8b890'], f:deckFlagRows(['0111111111','0112111211','0121111121','0121000121','0113000311','0111313111','0111111111'])},   // the first Great Boar's: red, his ivory tusks round his snout
  whale:{p:['#1a4a7a','#2a6aa8','#f4f8ff','#a8c8e8'], f:deckFlagRows(['0111111311','0211111131','0122222221','0123222201','0211222221','0111333311','0111111111'])},   // the first whale's: sea-blue, a white whale & her spout
  white:{p:['#c8c8c0','#f4f4f0','#1e1a1a','#6a5a48'], f:deckFlagRows(['0111111111','0111111211','0111111221','0133333222','0111111221','0111111211','0111111111'])},   // the White's: white, a black harpoon
  compass:{p:['#1a2840','#2a3e62','#d8a840','#fff0a0'], f:deckFlagRows(['0111121111','0111121111','0111232111','0122232221','0111222111','0111121111','0111121111'])},   // Capt. rank 5: navy, a gold compass rose
  crown:{p:['#8a2a2a','#e8705a','#d8a840','#fff4c0'], f:deckFlagRows(['0111111111','0131131131','0121222121','0122222221','0120202021','0122222221','0111111111'])},   // the museum's 24th find: coral, a gold crown set with garnets
  skull:{p:['#3a3434','#1e1a1a','#e8e0c8','#a89e88'], f:deckFlagRows(['0111111111','0111222111','0112222211','0112121211','0112323211','0111212111','0111111111'])},   // (the PIRATES HOOK — painted, never sold, never won)
  lantern:{p:['#0e1828','#1a2840','#ffd860','#fff4c0'], f:deckFlagRows(['0111111111','0111121111','0111232111','0112333211','0112333211','0111222111','0111111111'])} };   // (INTROSTORY C13: the Far Lantern's — night blue, a gold lamp lit white at its heart · story §3.11)
function deckFlagRows(R){ return (x,y)=>{ const c=R[y]&&R[y][x]; return c==null||c==='.'?-1:+c; }; }   // (PT1 B8: a flag as ten-texel rows)
function deckFlagSpr(V,id,f,dir,sh){ const F=DECK_FLAGS[id]||DECK_FLAGS.guild;   // streaming one way (dir ±1) · end-on to you it's short (sh) · 3 wave frames
  return tProp(V,'dkFlag'+id+f+(dir<0?'l':'r')+(sh?'s':''), ()=>{ const S=PS(14,11), P=cIR(F.p), n=sh?6:10;
    for(let i=0;i<n;i++){ const x=sh?Math.min(9,Math.round(i*1.8)):i, dy=Math.round(Math.sin(i*0.9-f*2.1)*0.8*(i/(n-1))); for(let y=0;y<7;y++){ const k=F.f(x,y); if(k<0) continue; psP(S,dir<0?11-i:i+2,y+2+dy,P[k]); } }
    return tOut(S,dir<0?12:1,2); }); }
function deckEnsignSpr(V){ return tProp(V,'dkEns', ()=>{ const S=PS(5,32), M=tRamp('#8a5a30'), Br=cIR(['#8a6424','#d8a840','#ffe08a']);   // the ensign staff on her transom, its gilt truck
  pR(S,2,2,1,27,M[4]); pR(S,1,2,1,27,M[2]); pR(S,1,0,2,2,Br[1]); psP(S,1,0,Br[2]); pR(S,0,28,4,3,M[1]); pR(S,0,28,4,1,M[3]); return tOut(S,2,30); }); }
function deckLanternSpr(V){ return tProp(V,'dkLant', ()=>{ const S=PS(8,26), M=tRamp('#6a4a2c'), I=cI('#2a2628'), Br=cI('#b8862a');   // the stern lantern on its post
  pR(S,3,9,2,15,M[3]); pR(S,3,9,1,15,M[5]); pR(S,2,23,4,2,M[1]); psP(S,3,0,I); psP(S,4,0,I); pR(S,2,1,4,1,I); pR(S,1,2,6,1,Br);
  pR(S,1,3,6,5,I); pR(S,2,3,4,5,cI('#c89850')); pR(S,3,4,2,3,cI('#f0d890')); pR(S,1,8,6,1,Br); return Object.assign(tOut(S,4,24),{lg:[4,6]}); }); }
function deckStoveSpr(V){ return tProp(V,'dkStove2', ()=>{ const S=PS(44,46), I=tRamp('#2c2a2e'), Cu=tRamp('#9a6234'), Wd=tRamp('#8a5a30'), CA=cIR(['#9a8c74','#cfc2a6','#ece2cc']), RD=cIR(['#6a2620','#9a3a2c','#b8503a']), X=2, Y=14;   // (B2: under its awning)
  pR(S,0,9,2,37,Wd[2]); pR(S,0,9,1,37,Wd[4]); pR(S,42,9,2,37,Wd[1]); pR(S,43,9,1,37,Wd[3]);              // the awning's two poles
  for(let y=3;y<12;y++){ const ins=Math.round((11-y)*0.35); for(let x=ins;x<44-ins;x++){ const red=((x>>2)&1)===1; psP(S,x,y, red?RD[y<6?2:y<9?1:0]:CA[y<6?2:y<9?1:0]); } }   // its striped canvas, pitched to shed the spray
  for(let x=0;x<44;x++) if((x&3)!==3){ psP(S,x,12,((x>>2)&1)?RD[0]:CA[0]); if((x&3)===1) psP(S,x,13,((x>>2)&1)?RD[0]:CA[0]); }   // the scalloped valance
  pR(S,X+7,Y+16,26,14,I[2]); pR(S,X+7,Y+16,26,1,I[4]); pR(S,X+7,Y+16,2,14,I[3]); pR(S,X+31,Y+16,2,14,I[1]); pR(S,X+6,Y+14,28,3,I[3]); pR(S,X+6,Y+14,28,1,I[5]);   // the iron stove & its top plate
  pR(S,X+12,Y+21,9,5,cI('#1a0c08')); pR(S,X+13,Y+23,7,3,cI('#c84a1a')); pR(S,X+13,Y+24,7,2,cI('#ff8a3a')); pR(S,X+11,Y+20,11,1,I[4]);   // the firebox window, its coals
  pR(S,X+8,Y+30,3,2,I[1]); pR(S,X+29,Y+30,3,2,I[1]); pR(S,X+23,Y+20,2,2,Cu[3]); pR(S,X+26,Y+20,2,2,Cu[3]);   // its feet · the damper knobs
  pR(S,X+10,0,3,Y+15,I[2]); pR(S,X+10,0,1,Y+15,I[4]); pR(S,X+9,0,5,2,I[3]); pR(S,X+9,7,5,2,Cu[2]); pR(S,X+9,7,5,1,Cu[4]);   // the pipe, up through the awning (its copper collar)
  psDisc(S,X+26,Y+11,5,3,(nx,ny)=>Cu[ny<-0.3?4:ny>0.4?1:2]); pR(S,X+21,Y+11,11,4,Cu[2]); pR(S,X+21,Y+14,11,1,Cu[1]); pR(S,X+21,Y+11,11,1,Cu[4]); pR(S,X+30,Y+5,1,6,cI('#6a6868')); psP(S,X+29,Y+5,cI('#8a8888'));   // the pot · its ladle
  for(let i=0;i<3;i++){ pR(S,X+35,Y+24-i*3,6,3,Wd[2+(i&1)]); psP(S,X+35,Y+24-i*3,Wd[4]); }                // a few billets of firewood
  const o=tOut(S,X+20,Y+31); o.fb=[X+13,Y+23]; o.pipe=[X+11,0]; o.pot=[X+26,Y+8]; return o; }); }
function deckBenchSpr(V){ return tProp(V,'dkBench', ()=>{ const S=PS(42,20), Wd=tRamp('#9a6a3a'), I=cI('#3a3434');
  pR(S,1,4,40,4,Wd[3]); pR(S,1,4,40,1,Wd[5]); pR(S,1,7,40,1,Wd[1]);                                      // the top
  pR(S,3,8,3,11,Wd[2]); pR(S,36,8,3,11,Wd[1]); pR(S,3,14,36,2,Wd[2]);                                    // legs & stretcher
  pR(S,0,1,6,6,Wd[2]); pR(S,0,1,6,1,Wd[4]); pR(S,2,0,2,2,I);                                             // the vise
  pR(S,14,2,11,1,cI('#c8ccd0')); pR(S,14,3,11,1,cI('#8a9098')); pR(S,25,1,3,3,Wd[1]);                    // a saw
  pR(S,30,1,2,3,Wd[1]); pR(S,29,1,5,2,cI('#5a5658'));                                                    // a mallet
  pR(S,8,2,5,2,Wd[4]); pR(S,8,3,5,1,Wd[2]); psP(S,10,1,cI('#3a3434')); psP(S,13,3,cI('#e8d4a8'));        // (B2) a plane, a curl off its blade
  pR(S,15,8,10,4,Wd[2]); pR(S,15,8,10,1,Wd[1]); psP(S,20,10,cI('#d8a840'));                               // its drawer, a brass pull
  psDisc(S,30,16,4,2.2,(nx,ny)=>{ const r=nx*nx+ny*ny; return r>0.55?cI('#8a7a58'):r>0.2?cI('#c8b890'):cI('#3a2a1a'); });   // a coil of line stowed under it
  for(const [x,y] of [[8,18],[12,19],[19,18],[27,19]]) psP(S,x,y,cI('#e8d4a8'));                          // shavings
  return tOut(S,21,19); }); }
function deckWindlassSpr(V){ return tProp(V,'dkWind2', ()=>{ const S=PS(30,19), Wd=tRamp('#8a5a30'), I=cIR(['#2a2828','#4a4848','#6a6868','#8a8888']);   // (B2: a drum between its bitts, four handspikes, the pawl, the cable round it)
  pR(S,5,15,20,3,Wd[1]); pR(S,5,15,20,1,Wd[3]);                                                         // its bed on the deck
  for(const x of [5,21]){ pR(S,x,3,4,14,Wd[2]); pR(S,x,3,1,14,Wd[4]); pR(S,x+3,3,1,14,Wd[1]); pR(S,x,2,4,1,Wd[5]); }   // the two bitts (cheeks)
  for(let y=7;y<14;y++) pR(S,9,y,12,1,Wd[y<8?5:y<10?4:y<12?3:1]); for(let x=10;x<21;x+=3) pR(S,x,7,1,7,Wd[1]);   // the drum & its whelps
  for(let x=10;x<20;x++){ psP(S,x,9+((x>>1)&1),I[(x&1)?3:1]); psP(S,x,11+((x>>1)&1),I[(x&1)?2:0]); }   // the cable's turns round it
  pR(S,14,2,2,5,Wd[3]); pR(S,14,2,1,5,Wd[5]); psP(S,15,6,I[3]);                                          // the pawl post (its iron tooth on the drum)
  for(const [x0,y0,x1,y1] of [[5,9,0,4],[5,11,1,16],[25,9,29,4],[25,11,28,16]]) psLine(S,x0,y0,x1,y1,Wd[3],1);   // the four handspikes in its heads
  const o=tOut(S,15,18); const g=o.cv.getContext('2d'); for(let x=20;x<30;x++){ g.fillStyle=(x&1)?'#6a6868':'#3a3838'; g.fillRect(x,14,1,1); } return o; }); }   // (the cable off the drum's foot, forward to the hawse)
function deckChestSpr(V,op){ op=op?1:0; return tProp(V,'dkChest'+op, ()=>{ const S=PS(22,20), Wd=tRamp('#7a4a26'), Ir=cIR(['#2a2828','#4a4848','#6a6868']), Br=cIR(['#8a6424','#d8a840','#ffe08a']), L=2-op*2;   // (B2: op — you're near, the lid lifts a crack)
  if(op){ pR(S,2,6,18,2,cI('#140c08')); psP(S,8,7,Br[2]); psP(S,13,7,Br[1]); psP(S,15,7,cI('#c8d0d8')); }   // the dark inside, a glint of what's in it
  for(let y=0;y<6;y++){ const ins=y<2?2-y:0; pR(S,1+ins,L+y,20-ins*2,1,Wd[y<2?4:3]); } for(const x of [5,15]) pR(S,x,L,2,6,Ir[1]);   // the domed lid & its straps
  pR(S,1,8,20,11,Wd[2]); pR(S,1,8,20,1,Wd[4]); pR(S,1,8,1,11,Wd[3]);
  for(const x of [5,15]) pR(S,x,8,2,11,Ir[1]); pR(S,1,18,20,1,Ir[0]);                                   // iron straps
  pR(S,9,8,4,4,Br[1]); psP(S,10,9,Br[2]); psP(S,10,10,cI('#1a1410'));                                     // the brass lock
  return tOut(S,11,19); }); }
const DK_TROPHY=[['greatboar','trBoar'],['brood','trBrood'],['packking','trPack'],['drowned','trTide']];   // (B5a) the shelf's top row: each lord's mini-trophy (a PXI icon), in BOSSES order
function deckShelfSig(){ return DK_TROPHY.map(t=>bFirst[t[0]]?1:0).join('')+(whiteTaken?'w':'')+'|'+curios.join(','); }   // what stands on it (the sprite's cache key)
function deckShelfSpr(V,w){ if(w>=3) return deckCase3Spr(V); const sg=deckShelfSig(); return tProp(V,'dkShelf'+sg, ()=>{ const S=PS(40,50), Wd=tRamp('#5a3a22'), Iv=cIR(['#8a7e64','#c8bc9a','#f8f2e0']);   // (B5a: dynamic — the lords' trophies on top, the curios below, in the order found · PT1 B10b: three wide, the great cabin's trophy case)
  pR(S,0,4,40,46,Wd[1]); pR(S,0,4,40,2,Wd[4]); pR(S,0,4,2,46,Wd[3]); pR(S,38,4,2,46,Wd[1]); pR(S,2,6,36,42,Wd[0]);   // an open oak case against the bulkhead
  for(const y of [17,32,47]){ pR(S,2,y,36,3,Wd[3]); pR(S,2,y,36,1,Wd[5]); }                               // three shelves
  DK_TROPHY.forEach((t,i)=>{ if(!bFirst[t[0]]) return; const [w,h]=pxiDim(t[1]); pxiInto(S,t[1],3+i*9+((8-w)>>1),17-h); });   // the top shelf: up to four lords' trophies, each in its own place
  curios.slice(0,6).forEach((c,j)=>{ const n='cur'+c, [w,h]=pxiDim(n), by=j<3?32:47; if(w) pxiInto(S,n,Math.round(8+(j%3)*12-w/2),Math.max(by-12,by-h)); });   // the middle & bottom shelves: six curios, in the order found
  if(curios.length<6){ pR(S,31,41,3,6,cI('#3a6a4a')); psP(S,32,40,cI('#c8b890')); }                      // (an empty corner: a bottle)
  if(whiteTaken){ pR(S,11,2,18,2,Iv[1]); pR(S,11,2,18,1,Iv[2]); for(let x=13;x<28;x+=3) psP(S,x,1,Iv[2]); pR(S,10,1,2,3,Iv[0]); pR(S,28,1,2,3,Iv[0]); }   // the White's jaw laid across the top
  return tOut(S,20,49); }); }
/* (B5a) the trophy shelf's placard: the four lords (unearned ones a faint shape) · the White's jaw · the fourteen curios */
function deckShelfCard(){ const nB=DK_TROPHY.filter(t=>bFirst[t[0]]).length, nC=curios.length, nM=Object.keys(FINDS).length;
  const r1=DK_TROPHY.map(t=>({n:t[1], got:!!bFirst[t[0]]})); if(whiteTaken) r1.push({n:'tooth', got:true});
  const r2=CURIOS.map((_,i)=>({n:'cur'+i, got:curios.indexOf(i)>=0}));
  DK.card={title:'🏆  The trophy shelf', icons:[r1,r2], iks:[3,2], body:nB+' of 4 lords & guardians felled'+(whiteTaken?' · the White’s jaw':'')+' · '+nC+' of '+CURIOS.length+' curios · the museum holds '+museum.length+' / '+nM+' · your trophies can stand anywhere aboard — '+keyGlyph('skill2','F')+' to decorate.'};
  sfx('ui_open',{v:'card'}); }
/* the light: the hour's ambient × her lamps (the deckhouse windows, the galley's fire, the masthead light, your hand lantern) */
function deckLightPass(L){ const A=LGT.amb, g=LGT.g, cv=LGT.cv; townAmbCalc(); if(!LGT.on) return;
  LGT.n=0; const b=DK.bob;
  if(LGT.dk>=0.04){ const Vv=LGT.v; Vv[0]=icamX-IW/2-80; Vv[1]=icamX+IW/2+80; Vv[2]=icamY-IH/2-120; Vv[3]=icamY+IH/2+120;
    for(const s of L.sp){ if(s.k==='house'){ const o=deckHouseOf(s); for(const q of o.win) lAdd(s.x-o.ax+q[0],s.y-o.ay+q[1]+8+b,22,0.5,0); if(o.wr) castleLights(s,o,b); }   // (PT1 B10b: the Grand Schooner's castle — its gallery & her stern lanterns)
      else if(s.k==='galley') lAdd(s.x-7,s.y-8+b,46*(1+0.05*Math.sin(itime*9)+0.03*Math.sin(itime*23)),0.9,1);
      else if(s.k==='mast'){ const o=deckMastSpr(DK.V,DK.stg,s.fore); lAdd(s.x,s.y-o.ay+o.ly+b,40,0.7,10); }
      else if(s.k==='helm'){ const o=deckWheelSpr(DK.V,0), x=s.x-o.ax+o.bn[0], y=s.y-o.ay+o.bn[1], hid=deckBehindSail(L,x,y); if(!hid) lAdd(x,y+b,30,0.8,10); }   // (B2) the binnacle's lamp (G15 FIX: none while the set sail hides it — even dimmed, the light pass painted its disc on the canvas)
      else if(s.k==='lantern'){ const o=deckLanternSpr(DK.V); lAdd(s.x-o.ax+o.lg[0],s.y-o.ay+o.lg[1]+b,60*(1+0.03*Math.sin(itime*7.3)),0.95,10); } }   // (B2) the stern lantern
    if(L.st.hatch && L.st.hatch.length){ let hx=0, hy=0; for(const h of L.st.hatch){ hx+=h.x; hy+=h.y; } const n=L.st.hatch.length; lAdd((hx/n+0.5)*L.TS,(hy/n+0.5)*L.TS+b,34,0.6,10); }   // (stage 2+: lamplight up through the hatch)
    if(nightK()>0.45){ const pd=folkDir(player.fx,player.fy); lAdd(player.x+(pd===2||pd===1?-5:5),player.y-8+b,42,0.8,0); }   // (your own hand lantern, after dark)
    for(const a of DK.crew){ if(!a.lantern || a.lv!==L.id) continue; const x=a.x+(a.dr===2||a.dr===1?-5:5), y=a.y-8; if(!deckBehindSail(L,x,y)) lAdd(x,y+b,42,0.8,0); }
    decorLights(L,b); { const q=deckFigLamp(L); if(q) lAdd(q.x,q.y+b,34*(1+0.04*Math.sin(itime*6.1)),0.85,10); } if(SAGA_DRM>0) sagaDreamLight(L,b); }   // (PT1 B6a: her decor lamps — unless put out) · (INTROSTORY C13: the Lamplighter's lantern at her bow)   // (B3a: the night watch's lantern at the wheel — none while the set main hides it, as the binnacle)
  if(cv.width!==IW||cv.height!==IH){ cv.width=IW; cv.height=IH; }
  g.globalCompositeOperation='source-over'; g.globalAlpha=1; g.fillStyle='rgb('+Math.round(A[0]*255)+','+Math.round(A[1]*255)+','+Math.round(A[2]*255)+')'; g.fillRect(0,0,IW,IH);
  g.globalCompositeOperation='lighter'; lDraw(g,1,0);
  g.globalAlpha=1; g.globalCompositeOperation='darken'; g.fillStyle='rgb(255,228,184)'; g.fillRect(0,0,IW,IH); g.globalCompositeOperation='source-over';
  pctx.globalCompositeOperation='multiply'; pctx.drawImage(cv,0,0); pctx.globalCompositeOperation='source-over';
  deckEmissive(L); }
function deckEmissive(L){ const dk=LGT.dk; if(dk<0.08) return; const k=clamp((dk-0.08)/0.35,0,1); pctx.globalAlpha=k;   // what glows through the dark: the deckhouse's windows & skylight, the firebox, the lamps' glass, your lantern
  for(const s of L.sp){ if(s.k==='house'){ const o=deckHouseOf(s), X=TX(s.x)-o.ax, Y=TY(s.y)-o.ay, q=o.sky; if(o.wr) castleGlow(o,X,Y); for(const w of o.win){ pctx.fillStyle='#ffc860'; pctx.fillRect(X+w[0]-2,Y+w[1]-2,5,5); pctx.fillStyle='#fff0b8'; pctx.fillRect(X+w[0]-1,Y+w[1]-1,2,2); }
      pctx.fillStyle='#e8a850'; pctx.fillRect(X+q[0],Y+q[1],q[2],q[3]); pctx.fillStyle='#ffd890'; pctx.fillRect(X+q[0]+1,Y+q[1]+1,4,q[3]-2); pctx.fillRect(X+q[0]+7,Y+q[1]+1,4,q[3]-2); pctx.fillStyle='#6a4020'; pctx.fillRect(X+q[0]+6,Y+q[1],1,q[3]); }   // (B2) the skylight, lit from the cabin below
    else if(s.k==='galley'){ const o=deckStoveSpr(DK.V), X=TX(s.x)-o.ax, Y=TY(s.y)-o.ay; pctx.fillStyle='#ff9a3a'; pctx.fillRect(X+o.fb[0],Y+o.fb[1],7,3); }
    else if(s.k==='mast'){ const o=deckMastSpr(DK.V,DK.stg,s.fore), X=TX(s.x), Y=TY(s.y)-o.ay+o.ly; pctx.fillStyle='#ffd070'; pctx.fillRect(X-1,Y-1,3,3); pctx.fillStyle='#fff8d8'; pctx.fillRect(X,Y,1,1); }
    else if(s.k==='helm'){ const o=deckWheelSpr(DK.V,0); if(deckBehindSail(L,s.x-o.ax+o.bn[0],s.y-o.ay+o.bn[1])) continue; const X=TX(s.x)-o.ax+o.bn[0], Y=TY(s.y)-o.ay+o.bn[1]; pctx.fillStyle='#ffc860'; pctx.fillRect(X-1,Y,3,1); pctx.fillStyle='#fff4c8'; pctx.fillRect(X,Y,1,1); }
    else if(s.k==='lantern'){ const o=deckLanternSpr(DK.V), X=TX(s.x)-o.ax, Y=TY(s.y)-o.ay; pctx.fillStyle='#ffc860'; pctx.fillRect(X+2,Y+3,4,5); pctx.fillStyle='#fff4c8'; pctx.fillRect(X+3,Y+4,2,3); } }
  const HB=L.hatchB; if(HB){ pctx.fillStyle='rgba(255,186,96,0.5)'; for(let j=2;j<HB.ih;j+=5) for(let i=1;i<HB.iw;i+=5) pctx.fillRect(TX(HB.ix+i),TY(HB.iy+j),Math.min(4,HB.iw-i),Math.min(3,HB.ih-j)); }   // (stage 2+: the hatch's grating, lit from below — PT1 B10a: in its gaps)
  if(nightK()>0.45){ const dr=folkDir(player.fx,player.fy), X=TX(player.x)+(dr===2||dr===1?-5:5), Y=TY(player.y)-7+(player.moving&&Math.sin(itime*1.7*5.2)>0.3?1:0); pctx.fillStyle='#ffe090'; pctx.fillRect(X,Y-2,1,2); }
  for(const a of DK.crew){ if(!a.lantern || a.lv!==L.id) continue; const dx=a.dr===2||a.dr===1?-5:5; if(deckBehindSail(L,a.x+dx,a.y-8)) continue; const X=TX(a.x)+dx, Y=TY(a.y)-7; pctx.fillStyle='#ffe090'; pctx.fillRect(X,Y-2,1,2); }
  decorGlow(L); { const q=deckFigLamp(L); if(q){ pctx.fillStyle='#ffd860'; pctx.fillRect(TX(q.x)-1,TY(q.y)-1,2,3); pctx.fillStyle='#fff4c0'; pctx.fillRect(TX(q.x),TY(q.y),1,1); } }   // (PT1 B6a: a lit decor lamp's glass) · (INTROSTORY C13: the Lamplighter's glass)   // (B3a: the watch's lantern glass — not through the canvas)
  pctx.globalAlpha=1; }
function deckRoomLight(L){ const A=LGT.amb, g=LGT.g, cv=LGT.cv, nk=nightK(), st=clamp(env.storm*0.6,0,1), dim=L.id==='low'?0.8:1, Dy=[0.86,0.8,0.72], Nn=[0.34,0.31,0.37], nm=TUNE.roomNight/0.42;   // (your home's warm light — darker below)
  for(let c=0;c<3;c++) A[c]=clamp(lerp(Dy[c],Nn[c]*nm,nk)*(1-0.25*st)*dim,0,1); LGT.dk=1-(0.3*A[0]+0.59*A[1]+0.11*A[2]); LGT.on=TUNE.townLight>0;
  if(!LGT.on) return;
  LGT.n=0; const Vv=LGT.v; Vv[0]=-1e5; Vv[1]=1e5; Vv[2]=-1e5; Vv[3]=1e5; const rk=TUNE.roomLight, fk=Math.sin(itime*9.3)*0.06+Math.sin(itime*14.1+1)*0.05, rb=DK.rb|0;
  for(const q of L.lamps) lAdd(q[0],q[1]+10+rb,70*rk,0.85*(1+fk*0.5),10);
  if(L.chand) lAdd(L.chand[0],L.chand[1]-6+rb,90*rk,0.9*(1+fk*0.6),10);                                   // (PT1 B10b: the chandelier — §3.5's light 90)
  decorLights(L,rb);                                                                                     // (PT1 B6a: your decor lamps)
  const day=clamp(1-nk,0,1)*(1-st*0.7); if(day>0.1) for(const w of L.win){ lBeam(w[0]+w[2]/2+10,30+w[3]+rb,50,w[2]*0.55,0.3*day,11); lAdd(w[0]+w[2]/2+8,26+w[3]+rb,36,0.35*day,11); }
  if(day>0.1 && L.lay){ for(const p of L.lay.ports){ lBeam(p[0]+5,44+rb,46,5,0.26*day,11); lAdd(p[0]+3,26+rb,20,0.22*day,11); } const ld=L.st.ladder; if(ld) lBeam((ld.x+0.5)*L.TS,(ld.y+1)*L.TS+rb,44,10,0.34*day,11); }   // (PT1 B10a: daylight through the portholes · down the hatch)
  if(cv.width!==IW||cv.height!==IH){ cv.width=IW; cv.height=IH; }
  g.globalCompositeOperation='source-over'; g.globalAlpha=1; g.fillStyle='rgb('+Math.round(A[0]*255)+','+Math.round(A[1]*255)+','+Math.round(A[2]*255)+')'; g.fillRect(0,0,IW,IH);
  g.globalCompositeOperation='lighter'; lDraw(g,1,0);
  g.globalAlpha=1; g.globalCompositeOperation='darken'; g.fillStyle='rgb(255,232,196)'; g.fillRect(0,0,IW,IH); g.globalCompositeOperation='source-over';
  pctx.globalCompositeOperation='multiply'; pctx.drawImage(cv,0,0); pctx.globalCompositeOperation='source-over';
  for(const q of L.lamps){ pctx.fillStyle='#ffd070'; pctx.fillRect(TX(q[0])-1,TY(q[1])+3,3,4); pctx.fillStyle='#fff4c8'; pctx.fillRect(TX(q[0]),TY(q[1])+4,1,2); }   // the lantern's glass
  if(L.chand) chandFlames(L); }                                                                          // (PT1 B10b: the chandelier's candles)
/* ---- (PT1 B10a) THE LOWER DECK — what lies under the Deep Sloop's hatch (pt1_boat §3.5): the crew's quarters (hammocks slung two high in an oak rack —
   "a hammock for every hand"), the hold (cargo lashed against the hull, the ladder up to the lit hatch), the forepeak (S3+). The inner hull's planking & ribs
   under a clamp beam, round portholes with the sea sloshing in them (drawn live), bulkheads with their doorways, lanterns on iron hooks. lowLayout runs in
   deckParse (the decor's wall rules need it): the bulkheads, the rooms, the portholes, the lanterns, the hammocks' slots (the racks' lower tier first, then a
   hammock in front, then the upper tier — a bedroll below if every one is taken) and the y-sorted sprites. Gun ports (S4's `g`) are B10b's. ---- */
function lowLayout(L,C){ const W=L.W, H=L.H, TS=L.TS, st=L.st, wk=L.walk, ix=(x,y)=>y*W+x, ch=(x,y)=>C[ix(x,y)]||'#';
  const bulk=[]; for(let x=1;x<W-1;x++) if(ch(x,0)==='#') bulk.push(x);                                      // (a '#' in her inner hull: a bulkhead meets it)
  const rooms=[]; { let x0=1; for(const b of bulk.concat([W-1])){ if(b>x0) rooms.push({x0, x1:b-1}); x0=b+1; } }
  const busy=[]; for(const b of bulk) busy.push([b*TS-5,(b+1)*TS+5]); for(let x=0;x<W;x++) if(ch(x,1)==='x') busy.push([x*TS-3,(x+1)*TS+3]);   // (the bulkheads' ends · cargo stacked up the hull)
  for(const q of st.guns) busy.push([q.x*TS-4,(q.x+1)*TS+4]);                                               // (PT1 B10b: the gun ports — a lantern hangs between them)
  const posts=[]; for(const h of st.hammocks) if(h.y===1) posts.push(h.x*TS+2,(h.x+2)*TS-2);                // (the racks' posts stand up the hull too)
  const rib=(a,b)=>{ for(let x=a;x<=b;x++) if(x%40<6) return true; return false; }, hit=(a,b,A)=>A.some(q=>b>=q[0] && a<=q[1]);
  const ports=[];
  for(const R of rooms){ let g=0; for(let x=R.x0;x<=R.x1;x++) if(ch(x,0)==='g') g=1; if(g) continue;       // (B10b: a room with gun ports gets those instead)
    const R0=R.x0*TS, R1=(R.x1+1)*TS, w=R1-R0, n=R.x1-R.x0+1>=6?2:1;
    for(let k=0;k<n;k++){ const t=Math.round(R0+w*(n===2?(k+1)/3:0.5));
      for(let d=0;d<=34;d++){ let done=0; for(const cx of [t-d,t+d]){ const a=cx-7, b=cx+7; if(a<R0+4 || b>R1-4 || rib(a,b) || hit(a,b,busy) || posts.some(p=>p>=a-1 && p<=b+1) || ports.some(p=>Math.abs(p[0]-cx)<20)) continue; ports.push([cx,-8]); done=1; break; } if(done) break; } } }
  const lamps=[], nL=Math.max(3,rooms.length);                                                                 // lanterns along her length, one in every room at least (≥ 3 — §3.5's three)
  for(let i=0;i<nL;i++){ const t=Math.round(TS+(W-2)*TS*(i+0.5)/nL);
    for(let d=0;d<=50;d++){ let done=0; for(const cx of [t+d,t-d]){ if(cx<TS+6 || cx>(W-1)*TS-6 || hit(cx-4,cx+4,busy) || ports.some(p=>Math.abs(p[0]-cx)<12) || posts.some(p=>Math.abs(p-cx)<4)) continue; lamps.push([cx,-11]); done=1; break; } if(done) break; } }
  for(const R of rooms) if(!lamps.some(q=>q[0]>=R.x0*TS && q[0]<(R.x1+1)*TS)){ const cx=Math.round((R.x0+R.x1+1)/2*TS); lamps.push([cx,-11]); }
  const S=[], up=[];                                                                                           // the hammocks' slots: {i, t (0 low · 1 high), sx sy dir (the tile a hand stands on to turn in), hx hy (their head)}
  st.hammocks.forEach((h,i)=>{ let a=null; for(const q of [[0,1,1],[1,1,1],[-1,0,3],[2,0,2],[0,2,1],[1,2,1]]){ const x=h.x+q[0], y=h.y+q[1]; if(x>0 && y>0 && x<W-1 && y<H-1 && wk[ix(x,y)] && L.cls[ix(x,y)]!==6){ a={x,y,dir:q[2]}; break; } }
    if(!a) a=L.entry?{x:L.entry.x, y:L.entry.y, dir:0}:{x:1, y:H-2, dir:0}; L.spots.ham[i]=a;                                            // (G18 FIX's note: the hammock's own spot is a tile a hand can stand on — under it, or beside it)
    const fy=(h.y+0.5)*TS, sl=t=>({i, t, sx:a.x, sy:a.y, dir:a.dir, hx:h.x*TS+9, hy:fy-(t?30:14)});
    S.push(sl(0)); if(h.y===1) up.push(sl(1)); });
  S.sort((p,q)=>(st.hammocks[p.i].y===1?0:1)-(st.hammocks[q.i].y===1?0:1) || p.i-q.i); for(const q of up) S.push(q);   // (the racks' lower tier, a hammock in front, then the upper tier)
  const hR=rooms.reduce((b,R)=>{ const n=st.hammocks.filter(h=>h.x>=R.x0 && h.x<=R.x1).length; return n>b.n?{R,n}:b; },{R:rooms[0],n:-1}).R, rolls=[];   // (no slot left: a bedroll on the quarters' deck)
  if(hR) for(let x=hR.x0+1;x<=hR.x1;x+=2) if(wk[ix(x,H-2)] && ch(x,H-2)==='.') rolls.push({x,y:H-2,dir:0});
  const sp=(k,x,y,o)=>{ const s=Object.assign({k, b:null, x, y},o||{}); s.sy=y; L.sp.push(s); return s; };
  st.hammocks.forEach((h,i)=>sp('ham',(h.x+1)*TS,(h.y+1)*TS,{hi:i, two:h.y===1}));
  if(st.ladder) sp('ladder',(st.ladder.x+0.5)*TS,(st.ladder.y+1)*TS-3);
  for(const c of st.cargo){ const v=(c.y===1?(tH(c.x*7,c.y*3)<0.5?1:0):2)+(tH(c.x,c.y*11)<0.3&&c.y===1?2:0); sp('cargo',(c.x+0.5)*TS,(c.y+1)*TS,{v:v%4}); }   // (stacked up the hull · a barrel or a sack in front)
  const gR=rooms.find(R=>st.guns.some(q=>q.x>=R.x0 && q.x<=R.x1))||null, gm=st.guns.length?st.guns[st.guns.length>>1]:null, plq=gm?{x:(gm.x+0.5)*TS, tx:gm.x}:null;   // (PT1 B10b: the gun deck's room · the brass plaque over its middle port — read from the deck below it)
  if(plq){ const use=new Set(); for(const dx of [-1,0,1]){ const j=ix(gm.x+dx,1); if(gm.x+dx>0 && gm.x+dx<W-1 && wk[j]) use.add(j); } if(use.size) L.acts.push({k:'plaque', fp:new Set([ix(gm.x,0)]), tiles:use, x:plq.x, y:TS/2}); }
  L.lay={bulk, rooms, ports, guns:st.guns.map(q=>(q.x+0.5)*TS), gR, plq, fpk:rooms.length>=3?rooms[rooms.length-1]:null}; L.lamps=lamps; L.hamS=S; L.lowRolls=rolls; L.win=[]; }   // (B10b: fpk — the forepeak, at her bow)
/* the bake: the inner hull (planks, ribs & their knees under a clamp beam), the bulkheads' ends & tops (a face over each doorway, a sill through it), darker
   planks with the hull's shadow along her side · then the portholes' brass rings and the lanterns on their hooks */
function lowBake(L){ const TS=L.TS, W=L.W, H=L.H, EXT=TS, CW=W*TS, CH=H*TS+EXT, C=L.rows, bk=new Set(L.lay.bulk);
  const cv=document.createElement('canvas'); cv.width=CW; cv.height=CH; const id=new ImageData(CW,CH), d=new Uint32Array(id.data.buffer);
  const FLR=tRamp('#7a5a36'), WN=tRamp('#6a4a2c'), OAK=tRamp('#8a6038'), TOPW=cIR(['#140e0a','#2a1e16','#3e2e22','#5a4432']), ch=(x,y)=>(C[y]&&C[y][x])||'#';
  for(let y=0;y<CH;y++) for(let x=0;x<CW;x++){ const wy=y-EXT, tx=Math.floor(x/TS), ty=Math.floor(wy/TS), u=x-tx*TS, bay=bayV(x,y); let c;
    if(wy<TS){ const hy=wy+EXT;
      if(hy<3) c=TOPW[hy<1?3:1];                                                                            // the top of her side
      else if(bk.has(tx)) c=u<2?OAK[4]:u>=TS-2?WN[0]:u%5===0?WN[1]:WN[(hy%11===0)?2:3];                      // a bulkhead's end, its planks upright
      else if(hy<6) c=OAK[hy===3?4:hy===5?1:3];                                                             // the clamp: the beam her deck rests on
      else { const r=x%40; if(r<6){ c=WN[r<2?3:r>4?0:1]; if(hy<10 && r<6) c=OAK[r<2?4:2]; }                 // a rib (its knee under the clamp)
        else { c=WN[clamp(Math.floor(2.8+(tH(x>>3,hy>>2)-0.5)*0.8+(hy%6===5?-1.4:0)+bay*0.3),0,5)]; if(hy<10 && (r<6+(10-hy)||r>=40-(10-hy))) c=OAK[2]; }   // the inner planking (the knees' feet)
        if(hy>=EXT+TS-2) c=WN[0]; } }                                                                        // (where her side meets the deck)
    else if(tx===0||tx===W-1||ty===H-1){ const inner=(tx===0&&x>=TS-3)||(tx===W-1&&x<(W-1)*TS+3)||(ty===H-1&&wy<ty*TS+3); c=inner?TOPW[3]:TOPW[1+((x+wy)&1&&bay>0.3?1:0)]; }
    else if(ch(tx,ty)==='#'){ const v=wy-ty*TS, end=ty<H-1 && '.:lF'.indexOf(ch(tx,ty+1))>=0;                // a bulkhead from above: dark, a plank cap down its middle · a face toward you over a doorway
      if(end && v>=14) c=v===14?OAK[4]:v===19?WN[0]:u%5===0?WN[1]:WN[3];
      else if(u>=7 && u<=12) c=OAK[(v%7===6)?1:u===7?4:3]; else if(u===6||u===13) c=TOPW[3]; else c=TOPW[1+((x+wy)&1&&bay>0.3?1:0)]; }
    else { const row=Math.floor(wy/5), off=Math.floor(tH(row,11)*40), sx=(x+off)%48, sy=wy%5; let v=2.7+(tH(Math.floor((x+off)/48)*5,row)-0.5)*0.8;   // the planks, darker below
      if(sy===4) v=1.2; else if(sy===0) v+=0.4; if(sx===0) v=1.2; else if(sx===1) v+=0.3;
      if(wy<TS+3) v-=1.1-(wy-TS)*0.3; if(ch(tx-1,ty)==='#' && u<3) v-=0.8; if(ch(tx+1,ty)==='#' && u>16) v-=0.5;   // (her side's shadow · a bulkhead's)
      if(bk.has(tx)){ if(u>=8 && u<=11) v=sy===4?1.6:u===8?4.2:3.4; else if(u===7||u===12) v=1.3; }        // (a doorway's sill)
      c=FLR[clamp(Math.floor(v),0,5)]; }
    d[y*CW+x]=c; }
  cv.getContext('2d').putImageData(id,0,0);
  const g=cv.getContext('2d'), R=(x,y,w,h,c)=>{ g.fillStyle=c; g.fillRect(Math.round(x),Math.round(y)+EXT,w,h); };
  for(const p of L.lay.ports){ const cx=p[0], cy=p[1];                                                        // a porthole's ring: iron, then brass (its glass is drawn live)
    for(let j=-7;j<=7;j++) for(let i=-7;i<=7;i++){ const r=Math.hypot(i+0.5,j); if(r>7.2) continue; R(cx+i,cy+j,1,1, r>6.3?'#1e1610':r>4.6?(i+j<-3?'#f0cc70':i+j>3?'#7a5a20':'#c09038'):'#0c1420'); }
    for(const q of [[-5,-5],[4,-5],[-5,4],[4,4]]) R(cx+q[0],cy+q[1],1,1,'#5a4018'); }
  for(const q of L.lamps){ const x=q[0], y=q[1];                                                               // a lantern on its hook under the clamp
    R(x-1,-EXT+5,3,1,'#2a2420'); R(x,-EXT+6,1,y-(-EXT+6),'#2a2420'); R(x-1,y,3,1,'#3a3430'); R(x-2,y+1,5,1,'#2a2420');
    R(x-2,y+2,5,6,'#2a2420'); R(x-1,y+3,3,4,'#d8b860'); R(x-2,y+8,5,1,'#2a2420'); R(x-1,y+9,3,1,'#4a4038'); }
  lowDress(g,L,R);                                                                                             // (PT1 B10b: the gun ports & the plaque · the forepeak's stores)
  L.bg=cv; L.EXT=EXT; }
/* the portholes, live: sky over the sea — the water line sloshing ±2 as she rolls, the crests running astern, the hour's colours, rain on the glass, the lightning */
const LOW_PH=[2,3,4,4,5,4,4,3,2];   // (the glass's half-widths, row by row — the bake's ring fits round it)
function portholeDraw(L){ const dayK=env.L, pal=deckWatPal(), nk=nightK(), seaC=nk>0.05?mixHex(pal.hex,'#08122a',0.7*nk):pal.hex, crC=nk>0.05?mixHex(pal.cr,'#08122a',0.6*nk):pal.cr, sky=dayK>0.62?'#9ccbee':dayK>0.45?'#e8a878':'#1a2448', rn=Math.max(env.storm,env.drizzle*0.6), fl=DK.flow*0.3;
  for(const p of L.lay.ports){ const X=TX(p[0]), Y=TY(p[1]), wl=clamp(Math.round(-DK.bob*0.8+Math.sin(itime*1.6+p[0]*0.07)*1.3),-2,2);
    for(let j=0;j<9;j++){ const hw=LOW_PH[j], yy=Y-4+j, x0=X-hw; pctx.fillStyle=j-4<wl?sky:seaC; pctx.fillRect(x0,yy,hw*2,1);
      if(j-4===wl){ pctx.fillStyle=crC; pctx.fillRect(x0+((Math.floor(fl)+j)%Math.max(1,hw*2-1)),yy,2,1); } else if(j-4>wl && ((j+Math.floor(fl*0.7))%3===0)){ pctx.fillStyle=crC; pctx.fillRect(X-1+((Math.floor(fl*1.3)+j*3)%3)-1,yy,2,1); } }
    if(env.storm>0.3){ pctx.fillStyle='rgba(60,70,90,0.5)'; for(let j=0;j<9;j++) pctx.fillRect(X-LOW_PH[j],Y-4+j,LOW_PH[j]*2,1); }
    if(rn>0.05){ pctx.fillStyle='rgba(206,222,246,'+(0.35+0.4*rn).toFixed(3)+')'; const sx=Math.floor(itime*11+p[0])%4-2, sy=Math.floor(itime*30+p[0])%6-3; pctx.fillRect(X+sx,Y+sy,1,2); }   // (rain down the glass)
    if(env.flash>0.05){ pctx.fillStyle='rgba(230,236,255,'+(env.flash*0.8).toFixed(3)+')'; for(let j=0;j<9;j++) pctx.fillRect(X-LOW_PH[j],Y-4+j,LOW_PH[j]*2,1); }
    if(dayK>0.45){ pctx.fillStyle='rgba(255,255,255,0.7)'; pctx.fillRect(X-3,Y-3,1,1); pctx.fillRect(X-2,Y-4,1,1); } } }   // (a glint on the glass)
/* the hammock rack (two oak posts, iron rings — the lower tier's, and the upper's against her side) · a hammock slung, empty (a folded blanket, a pillow) or
   with its sleeper (their hair on the pillow, the blanket over them) · the upper hammock lashed up by day */
const LOW_BLK=['#8a3a34','#3a5a7a','#4a6a3a','#7a5a2a'];
function lowRackSpr(V,two){ return tProp(V,'dkRack'+(two?2:1), ()=>{ const S=PS(44,52), O=tRamp('#8a6038'), top=two?2:18;   // (anchored at the hammock row's foot, mid-pair: the floor's middle is y 40)
  for(const px of [3,38]){ for(let y=top;y<45;y++){ psP(S,px,y,O[4]); psP(S,px+1,y,O[3]); psP(S,px+2,y,O[1]); } pR(S,px-1,top,5,2,O[3]); psP(S,px-1,top,O[5]); pR(S,px-1,44,5,1,O[1]);
    const ri=px===3?px+3:px-1; for(const ry of two?[10,26]:[26]){ psP(S,ri,ry,cI('#3a3434')); psP(S,ri,ry+1,cI('#6a6868')); } }
  return tOut(S,22,50); }); }
function hammockSpr(V,Lk,bi){ return tProp(V,'dkHam'+(Lk?Lk.hair+Lk.skin:'e')+bi, ()=>{ const S=PS(44,16), CV=tRamp('#d8c8a0'), BL=tRamp(LOW_BLK[bi%LOW_BLK.length]), yc=x=>Math.round(5+5*Math.sin(Math.PI*clamp((x-6)/32,0,1)));   // (row 3 = the rings' line, 2 over the canvas's ends)
  for(let x=6;x<=38;x++){ const y=yc(x); psP(S,x,y,CV[5]); psP(S,x,y+1,CV[4]); psP(S,x,y+2,CV[3]); psP(S,x,y+3,CV[1]); }   // the canvas: its lit near edge, its belly, the shadow under it
  for(const q of [[4,3],[5,4],[5,5],[39,3],[38,4],[38,5]]) psP(S,q[0],q[1],cI('#c8b088'));                    // (the clews at the rings)
  if(!Lk){ pR(S,8,yc(8)-1,5,2,CV[5]); psP(S,8,yc(8)-1,CV[4]); for(let x=24;x<32;x++){ psP(S,x,yc(x)-1,BL[3]); psP(S,x,yc(x),BL[2]); } psP(S,24,yc(24)-1,BL[4]); }   // a pillow · a blanket folded at her foot
  else { const HR=cIR([mixHex(Lk.hair,'#000000',0.35),Lk.hair,mixHex(Lk.hair,'#ffffff',0.25)]), SK=cIR([mixHex(Lk.skin,'#5a2a2a',0.35),Lk.skin]);
    for(let x=12;x<=36;x++){ const y=yc(x), hp=x<18?1:x>32?1:2; for(let k=0;k<=hp;k++) psP(S,x,y-k,BL[k===hp?4:3]); psP(S,x,y+1,BL[2]); }   // the blanket over them, rising over a shoulder & a knee
    for(let x=13;x<=35;x+=5) psP(S,x,yc(x)-1,BL[1]);
    pR(S,6,yc(6)-4,6,3,HR[1]); pR(S,7,yc(7)-4,4,1,HR[2]); psP(S,6,yc(6)-2,HR[0]); psP(S,6,yc(6)-1,HR[0]); pR(S,9,yc(9)-2,4,2,SK[1]); psP(S,10,yc(10)-1,SK[0]); psP(S,12,yc(12)-2,SK[0]); }   // their head on the pillow, an eye shut
  psOut(S,cI('#1a120c'),false); return psCv(S,22,3); }); }
function lowRollSpr(V){ return tProp(V,'dkRoll2', ()=>{ const S=PS(44,10), CV=tRamp('#d8c8a0'), RP=cIR(['#4a3420','#7a5a34','#a07a48']);   // the upper hammock lashed up for the day — a soft roll between the rings, its lashings round it
  for(let x=6;x<=38;x++){ const e=Math.min(x-6,38-x), t=e<1?2:e<2?1:0, sg=Math.round(Math.sin(Math.PI*(x-6)/32)), y0=2+t+sg, y1=8-t+sg; for(let y=y0;y<y1;y++){ const v=(y-y0)/Math.max(1,y1-y0-1); psP(S,x,y,CV[v<0.2?5:v<0.45?4:v<0.75?3:v<0.95?2:1]); }
    const k=(x-9)%7; if(e>=2 && k>=0 && k<2) for(let y=y0;y<y1;y++) psP(S,x+((y-y0)>>1)-1,y,RP[k===0?(y===y0?2:1):0]); }
  for(const q of [[4,0],[5,1],[5,2],[39,0],[38,1],[38,2]]) psP(S,q[0],q[1],cI('#c8b088'));
  psOut(S,cI('#1a120c'),false); return psCv(S,22,0); }); }
function lowHamWho(hi,t){ const L=DK.L.low; if(!L || !L.hamS) return null; for(const A of [DK.crew,DK.guests]) for(const a of A){ if(a.lv!=='low' || !a.hide || !a.arr || a.ham<0) continue; const s=L.hamS[a.ham]; if(s && s.i===hi && s.t===t) return a; } return null; }   // (who sleeps in hammock hi, tier t)
function lowHamDraw(s){ const V=DK.V, X=TX(s.x), Y=TY(s.y), r=lowRackSpr(V,s.two); if(X<-30||X>IW+30) return; pctx.drawImage(r.cv,X-r.ax,Y-r.ay);
  if(s.two){ const a=lowHamWho(s.hi,1), o=a?hammockSpr(V,crewLookOf(a),s.hi+1):lowRollSpr(V); pctx.drawImage(o.cv,X-o.ax,Y-40-o.ay); }
  const a=lowHamWho(s.hi,0), o=hammockSpr(V,a?crewLookOf(a):null,s.hi); pctx.drawImage(o.cv,X-o.ax,Y-24-o.ay); }
/* the ladder up to the hatch — the square of sky (or the night's) at its head, the daylight down its rungs · the hold's cargo: barrels, crates & sacks lashed */
function ladderSpr(V){ return tProp(V,'dkLadder', ()=>{ const S=PS(22,50), O=tRamp('#8a6038'), F=tRamp('#5a4028');
  for(let y=6;y<48;y++){ psP(S,5,y,O[4]); psP(S,6,y,O[2]); psP(S,15,y,O[3]); psP(S,16,y,O[1]); }             // the rails
  for(let y=44;y>8;y-=5){ for(let x=7;x<15;x++){ psP(S,x,y,O[4]); psP(S,x,y+1,O[2]); } }                       // the rungs
  for(let x=0;x<22;x++){ psP(S,x,0,F[4]); psP(S,x,1,F[3]); psP(S,x,6,F[2]); psP(S,x,7,F[0]); } for(let y=0;y<8;y++){ psP(S,0,y,F[3]); psP(S,1,y,F[2]); psP(S,20,y,F[1]); psP(S,21,y,F[0]); }   // the hatch's coaming seen from below (its square is drawn live)
  psOut(S,cI('#1a120c'),false); return psCv(S,11,49); }); }
function ladderDraw(s){ const o=ladderSpr(DK.V), X=TX(s.x)-o.ax, Y=TY(s.y)-o.ay, dayK=env.L; if(X>IW||X+o.w<0) return;
  pctx.fillStyle=dayK>0.62?'#cfe8fa':dayK>0.45?'#f0c090':'#141c38'; pctx.fillRect(X+2,Y+2,18,4);                // the hatch's square: the sky (dawn & dusk warm) · the night
  if(dayK<=0.45){ pctx.fillStyle='#e8f0ff'; pctx.fillRect(X+6+((itime*0.2|0)%9),Y+3,1,1); } else if(env.storm>0.3){ pctx.fillStyle='rgba(60,70,90,0.6)'; pctx.fillRect(X+2,Y+2,18,4); }
  pctx.drawImage(o.cv,X,Y); }
function cargoSpr(V,v){ return tProp(V,'dkCargo'+v, ()=>{ const S=PS(22,34), O=tRamp('#9a6a3a'), B=tRamp('#7a4a26'), IR=cI('#3a3434'), SA=tRamp('#c8b084');
  const barrel=(x0,y0,h)=>{ for(let y=y0+2;y<y0+h;y++) for(let x=x0;x<x0+9;x++){ const e=x-x0; let k=e===0?1:e===1?3:e===8?0:e===7?1:2; if((y-y0)%4===1) k=Math.max(0,k-1); psP(S,x,y,(y===y0+4||y===y0+h-3)?IR:B[k]); }   // staves & two hoops
    for(let x=x0+1;x<x0+8;x++){ psP(S,x,y0,B[4]); psP(S,x,y0+1,B[3]); } psP(S,x0+4,y0+1,B[1]); };
  const crate=(x0,y0,w,h)=>{ for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ const fx=x-x0, fy=y-y0, top=fy<3; let k=top?(fy===0?5:4):((fx===0||fx===w-1||fy===3||fy===h-1)?1:(fx+fy)%5===0||(w-fx+fy)%5===0?2:3); psP(S,x,y,O[k]); } };   // its lid lit · slats & a cross brace
  const sack=(x0,y0)=>{ for(let y=y0;y<y0+8;y++) for(let x=x0;x<x0+9;x++){ const e=Math.abs(x-x0-4)+Math.abs(y-y0-4)*0.8; if(e>5.2) continue; psP(S,x,y,SA[y<y0+2?5:x<x0+3?4:x>x0+6?1:3]); } psP(S,x0+4,y0,SA[1]); psP(S,x0+4,y0+1,cI('#6a5030')); };
  if(v===0){ barrel(1,20,13); barrel(11,20,13); barrel(6,8,13); }                                               // barrels, three high
  else if(v===1){ crate(1,15,19,18); crate(4,4,13,11); }                                                        // a crate, a smaller one on it
  else if(v===2){ barrel(2,20,13); sack(11,24); }                                                               // a barrel & a sack
  else { crate(1,18,19,15); sack(4,11); sack(10,12); }                                                          // a crate & two sacks on it
  psOut(S,cI('#1a120c'),false); return psCv(S,11,33); }); }
/* the way up: the deck tile beside the hatch you climb out onto — south of it first, then west (§3.4.2) */
function deckHatchUp(T){ const H=T.st.hatch||[]; if(!H.length) return null; let y1=-1, x0=1e9; for(const h of H){ y1=Math.max(y1,h.y); x0=Math.min(x0,h.x); }
  const ok=(x,y)=>x>=0 && y>=0 && x<T.W && y<T.H && T.walk[y*T.W+x] && !H.some(k=>k.x===x&&k.y===y);
  for(const h of H) if(h.y===y1 && h.x===x0 && ok(h.x,h.y+1)) return {x:h.x,y:h.y+1};
  for(const h of H) if(ok(h.x,y1+1) && h.y===y1) return {x:h.x,y:h.y+1};
  for(const h of H) if(h.x===x0 && ok(h.x-1,h.y)) return {x:h.x-1,y:h.y};
  for(const h of H) for(const q of [[1,0],[0,-1]]) if(ok(h.x+q[0],h.y+q[1])) return {x:h.x+q[0],y:h.y+q[1]}; return null; }
/* a hand turning in at stage 2+: the first hammock no one else has (a bedroll below when all are taken) → its tile */
function crewHamPick(a,L){ const used=new Set(); for(const A of [DK.crew,DK.guests]) for(const b of A) if(b!==a && b.ham>=0 && b.spot && b.spot.lv==='low') used.add(b.ham);
  for(let i=0;i<L.hamS.length;i++) if(!used.has(i)){ a.ham=i; const s=L.hamS[i]; return {x:s.sx, y:s.sy, dir:s.dir}; }
  const tk=new Set(); for(const A of [DK.crew,DK.guests]) for(const b of A) if(b!==a && b.spot && b.spot.lv==='low') tk.add(b.spot.x+','+b.spot.y);
  for(const r of L.lowRolls) if(!tk.has(r.x+','+r.y)) return r; return L.lowRolls[0]||{x:L.entry.x, y:L.entry.y, dir:0}; }
/* ---- (PT1 B10b) THE SCHOONER & THE GRAND SCHOONER (pt1_boat §3.4.4, §3.5, §3.16) — the main's gaff topsail (stage 3+, set only with her full sail: in
   deckSailSpr) · a blow mans the foremast too (crewAgentsBuild) · the Grand Schooner's stern castle (two storeys: the gallery's three windows over her door, gilt
   mouldings, a frieze in her paint, the poop's balustrade, its skylight & her two stern lanterns) · the great cabin (a stern gallery of five arched windows between
   gilt pilasters, two sconces, a chandelier over the map table, a runner from the door, the trophy case three wide) · below, the gun ports cut & shuttered (iron
   straps, ring bolts for tackles that aren't there) under the brass plaque, and the forepeak's bosun's stores (the stem & the hawse, the cable heaped under it,
   coils on their pegs, a block, a sail bag). The PIRATES HOOK note is at SHIP_STG. ---- */
function shipGunPorts(){ const s=SHIP?SHIP.stg:0, L=DK && DK.stg===s && DK.L.low; if(L) return L.st.guns.length; const M=deckMaps(s); return M.low ? M.low.join('').split('g').length-1 : 0; }   // (PIRATES HOOK: the guns she could mount, one a port — read by nothing yet)
function shipFire(){ return false; }   // (PIRATES HOOK, owner 2026-10-02: her broadside — fired by you at the wheel, B or the pad's RT, once SHIP.guns > 0 · nothing to fire yet)
function gunPortSpr(V){ return tProp(V,'dkGunPort', ()=>{ const S=PS(22,18), O=tRamp('#7a5434'), F=tRamp('#4a3420'), I=cIR(['#1e1a1a','#3a3434','#5a5656','#8a8686']);   // a gun port, its lid shut: anchored at its middle
  pR(S,3,1,16,14,F[1]); pR(S,3,1,16,1,F[3]); pR(S,3,1,1,14,F[2]);                                             // the port's lining — heavy timber, lit along its head & its after side
  for(let y=2;y<14;y++) for(let x=4;x<18;x++){ const e=x===4||x===9||x===13; let k=e?3:(x===8||x===12||x===17)?1:2; if(y===2) k=4; else if(y===13) k=1; if(((x*7+y*3)%11)===0) k=Math.max(1,k-1); psP(S,x,y,O[k]); }   // the lid: three planks, lit edges & dark seams
  for(const sx of [6,15]){ pR(S,sx-1,0,3,2,I[1]); psP(S,sx,0,I[3]); for(let y=2;y<11;y++){ psP(S,sx,y,I[y===2?3:2]); psP(S,sx+1,y,I[0]); } psP(S,sx,11,I[1]); psP(S,sx,5,I[3]); psP(S,sx,8,I[3]); }   // two iron straps down from the hinges over it (the lid swings up) · their rivets
  pR(S,10,11,3,1,I[2]); psP(S,10,12,I[1]); psP(S,12,12,I[1]); pR(S,10,13,3,1,I[0]); psP(S,11,12,cI('#0c0806'));   // the ring that hauls it open
  pR(S,2,15,18,2,O[4]); pR(S,2,16,18,1,O[2]);                                                                    // the sill
  for(const rx of [0,20]){ psP(S,rx,9,I[2]); psP(S,rx+1,9,I[1]); psP(S,rx,10,I[1]); psP(S,rx+1,10,I[0]); }      // ring bolts either side, where a gun's tackle would hook
  return tOut(S,11,9); }); }
/* the lower deck's dressing (lowBake's last pass): the gun ports & the brass plaque · the forepeak — her stem & its knee, the hawse & the cable heaped below,
   coils on their pegs, a block, a sail bag (wall decor hung there covers them) */
function lowDress(g,L,R){ const TS=L.TS, Y=L.lay;
  if(Y.guns && Y.guns.length){ const o=gunPortSpr(DK.V); for(const x of Y.guns) g.drawImage(o.cv,Math.round(x)-o.ax,3+TS-o.ay);
    const p=Y.plq; if(p){ const x=Math.round(p.x)-7, y=-14; R(x+1,y+7,14,1,'rgba(20,10,4,0.35)'); R(x,y,14,7,'#c09038'); R(x,y,14,1,'#f0cc70'); R(x,y,1,7,'#e0b450'); R(x,y+6,14,1,'#7a5a20'); R(x+13,y+1,1,6,'#8a6824');   // the plaque: brass, lit top-left
      for(const q of [[1,1],[12,1],[1,5],[12,5]]) R(x+q[0],y+q[1],1,1,'#5a4018'); for(let i=3;i<11;i++){ if(i!==6) R(x+i,y+2,1,1,'#6a4a18'); if(i!==5 && i!==8) R(x+i,y+4,1,1,'#6a4a18'); } } }   // (four rivets · two engraved lines)
  const FP=Y.fpk; if(!FP) return; const x0=FP.x0*TS, xr=(FP.x1+1)*TS, RP=['#6a4a2a','#a07a48','#c8a870','#e8d4a0'];
  R(xr-5,-17,5,37,'#4a3018'); R(xr-5,-17,1,37,'#8a6038'); R(xr-4,-17,1,37,'#6a4828');                          // her stem's inner face, where her sides meet
  for(let j=0;j<11;j++){ R(xr-6-(11-j),-14+j,11-j,1,j===0?'#a07040':'#6a4828'); R(xr-6-(11-j),-14+j,1,1,'#a07040'); }   // its knee, under the clamp
  for(let j=-3;j<=3;j++) for(let i=-3;i<=3;i++){ const r=Math.hypot(i,j); if(r>3.3) continue; R(xr-11+i,-7+j,1,1,r<1.6?'#0a0806':i+j<0?'#8a8480':'#4a4440'); }   // the hawse, ringed in iron
  for(let i=0;i<13;i++){ const t=i/12, x=Math.round(xr-11+2*t+Math.sin(t*2.6)*1.6), y=Math.round(-3+24*t); R(x,y,2,1,'#2a2828'); R(x+(i&1),y,1,1,(i&1)?'#8a8888':'#5a5858'); }   // the cable out of it, link by link, down to the deck…
  R(xr-21,29,19,2,'rgba(10,6,2,0.4)'); for(let j=-4;j<=4;j++) for(let i=-9;i<=9;i++){ const e=(i/9)**2+(j/4.2)**2; if(e>1) continue; const ring=Math.round(Math.hypot(i/2.2,j)*1.6), lk=((i+j*2+ring*3)&3)===0 || ((i*3+j+ring)&7)===1; R(xr-12+i,26+j,1,1,e>0.8?'#1a1818':lk?(j<0?'#a8a6a6':j<2?'#7a7878':'#4a4848'):(j<-1?'#3e3c3c':'#2a2828')); }   // …& heaped in its locker corner, coil on coil
  const busy=[[xr-26,xr+2],[x0-6,x0+6]]; for(const p of Y.ports) busy.push([p[0]-11,p[0]+11]); for(const q of L.lamps) busy.push([q[0]-7,q[0]+7]);
  let x=xr-28; for(const it of ['coil','block','bag','coil']){ const w=it==='block'?7:11; while(x-w>x0+6 && busy.some(b=>x+2>=b[0] && x-w-2<=b[1])) x--; if(x-w<=x0+6) break; const c=Math.round(x-w/2); busy.push([x-w-2,x+2]); x-=w+5;
    if(it==='coil'){ R(c-1,-16,2,2,'#2a2018'); for(let yy=-13;yy<=-3;yy++) for(let xx=-5;xx<=5;xx++){ const r=Math.hypot(xx/5,(yy+8)/5.3); if(r>1 || r<0.48) continue; R(c+xx,yy,1,1,(xx+yy<-9)?RP[3]:(xx+yy>-5)?RP[1]:((xx*3+yy)&3)?RP[2]:RP[1]); } R(c-1,-14,2,2,RP[2]); R(c+3,-4,1,6,RP[1]); R(c+3,2,1,1,RP[2]); }   // a coil of spare line on its peg, its tail hanging
    else if(it==='block'){ R(c,-17,1,4,'#3a3434'); R(c-1,-14,3,1,'#5a5656'); R(c-1,-13,3,1,'#b08050'); R(c-2,-12,5,5,'#8a6038'); R(c-2,-12,1,5,'#b08050'); R(c+2,-12,1,5,'#5a3a20'); R(c-1,-7,3,1,'#5a3a20'); R(c,-12,1,5,'#2a1a0c');   // a spare block on its hook: a lit oak shell, the sheave's slot
      R(c+1,-6,1,4,RP[2]); R(c+2,-3,1,2,RP[1]); R(c+1,-1,1,1,RP[1]); R(c-1,-6,1,2,RP[1]); }   // (a line rove through it, its tail hanging)
    else { R(c-1,-16,2,2,'#2a2018'); for(let yy=-14;yy<=1;yy++){ const t=(yy+14)/15, hw=Math.max(1,Math.round(1.5+4*Math.sin(Math.min(1,t*1.2)*Math.PI*0.88))); R(c-hw,yy,hw*2,1,yy<-11?'#e8dcb8':'#d0c09a'); R(c-hw,yy,1,1,'#e8dcb8'); R(c+hw-1,yy,1,1,'#8a7a5e'); } R(c-2,-12,4,1,'#6a5030'); R(c-1,-5,3,3,'#b8a888'); } } }   // a sail bag hung by its drawstring, a patch on it
function deckPlaqueCard(){ const n=shipGunPorts(); DK.card={title:'⚓  A brass plaque', body:'“No guns aboard — yet.”  '+n+' gun ports are cut along her side and shuttered tight — the Guild sells no cannon. Yet.'}; sfx('ui_open',{v:'card'}); }
/* the cabin's back wall — where its windows & lamps go (the bake and the decor's wall rule read the same sums): your cabin, two stern windows & the lantern ·
   the great cabin (13 wide), a stern gallery of five, 20 apart (g: gilt), sconces on its end pilasters, the chandelier over the map table */
function cabLay(L){ const TS=L.TS, CW=L.W*TS, EXT=TS; if(L.W<13) return {g:0, win:[0.22,0.45].map(f=>[Math.round(CW*f)-8,-EXT+5,16,18]), lamps:[[Math.round(CW*0.5+5),-EXT+12]], chand:null};
  const c=Math.round(CW/2), win=[]; for(let i=-2;i<=2;i++) win.push([c+i*20-6,-EXT+7,12,16,1]); const T=L.st.table;
  return {g:1, win, lamps:[[c-50,-EXT+6],[c+49,-EXT+6]], chand:T?[Math.round((T.x0+T.x1+1)/2*TS)-2, T.y0*TS-24]:null}; }
function greatCabinBake(L){ const TS=L.TS, W=L.W, H=L.H, EXT=TS, CW=W*TS, CH=H*TS+EXT, C=L.rows, Y=cabLay(L);
  const cv=document.createElement('canvas'); cv.width=CW; cv.height=CH; const id=new ImageData(CW,CH), d=new Uint32Array(id.data.buffer);
  const FLR=tRamp('#a8783e'), MH=tRamp('#6a3a24'), DM=tRamp('#6a2a30'), GD=cIR(['#5a3e10','#8a6424','#c09030','#e8c050','#fff0a0']), TOPW=cIR(['#140e0a','#2a1e16','#3e2e22','#5a4432']), RG=tRamp('#8a2a2a'), RB=cIR(['#6a4a14','#c09030','#e8c050']);
  const gx0=Y.win[0][0]-7, gx1=Y.win[4][0]+Y.win[4][2]+7, rc=Math.round(CW/2), rx0=rc-13, rx1=rc+13, ry0=44, ry1=(H-1)*TS;   // the gallery's span · the runner, from the door up to the trophy case
  for(let y=0;y<CH;y++) for(let x=0;x<CW;x++){ const wy=y-EXT, tx=Math.floor(x/TS), ty=Math.floor(wy/TS), bay=bayV(x,y); let c;
    if(wy<TS){ if(wy<-EXT+4) c=TOPW[wy<-EXT+1?3:1];
      else if(wy<-EXT+6) c=GD[wy===-EXT+4?4:2];                                                               // the gilt cornice
      else if(wy<5){ if(x>=gx0 && x<gx1){ const p=(x-gx0)%20; c=MH[p<2?4:p>17?1:2]; }                         // (behind the gallery: mahogany — its glass is drawn live)
        else { const px=x<gx0?x:x-gx1, pw=x<gx0?gx0:CW-gx1, e=Math.min(px,pw-px-1), v=wy+EXT; if(e<3 || v<9 || v>=23) c=MH[e===0||v===9?4:e===2||v===22?1:3];   // damask panels framed in mahogany
          else { const u=((x+((v>>2)&1)*4)%8)-4, w2=(v%8)-4; c=DM[Math.abs(u)+Math.abs(w2)===4?4:(Math.abs(u)+Math.abs(w2)<2?3:2+(bay>0.42?1:0))]; } } }
      else if(wy<8) c=GD[wy===5?3:wy===6?2:1];                                                                 // the gilt dado rail
      else { const pl=x%16; c=MH[wy>=TS-2?0:pl===15?1:pl===0?4:(wy===9||wy===TS-4)?2:3]; if(wy===10 && pl>1 && pl<14) c=GD[2]; } }   // the wainscot's raised panels, a gilt bead
    else if(tx===0||tx===W-1||ty===H-1){ const ch=(C[ty]&&C[ty][tx])||'#';
      if(ch==='d'){ c=(x%4===0||(wy%4===0))?cI('#8a6a3a'):cI('#a8844a'); if(wy-ty*TS<3) c=cI('#caa05a'); }   // the threshold
      else { const inner=(tx===0&&x>=TS-3)||(tx===W-1&&x<(W-1)*TS+3)||(ty===H-1&&wy<ty*TS+3); c=inner?TOPW[3]:TOPW[1+((x+wy)&1&&bay>0.3?1:0)]; } }
    else if(x>=rx0 && x<rx1 && wy>=ry0 && wy<ry1){ const u=x-rx0, v=wy-ry0, e=Math.min(u,rx1-rx0-1-u);   // the runner: crimson, a gold border, lozenges down its middle, a fringe at its head
      if(v<2) c=((x+v)&1)?cI('#e8dcc0'):cI('#c8b890'); else if(e===0) c=RB[0]; else if(e<3) c=RB[e===1?2:1]; else if(e===3) c=RG[1];
      else { const lz=Math.abs(u-13)+Math.abs(((v-6)%14)-7); c=lz===5?RB[1]:lz<3?RB[2]:lz<5?RG[2]:RG[3-(bay>0.46?1:0)]; } }
    else { const row=Math.floor(wy/5), off=Math.floor(tH(row,11)*40), sx=(x+off)%48, sy=wy%5; let v=2.85+(tH(Math.floor((x+off)/48)*5,row)-0.5)*0.8;   // warm planks
      if(sy===4) v=1.2; else if(sy===0) v+=0.4; if(sx===0) v=1.2; else if(sx===1) v+=0.3; c=FLR[clamp(Math.floor(v),0,5)]; }
    d[y*CW+x]=c; }
  cv.getContext('2d').putImageData(id,0,0);
  const g=cv.getContext('2d'), R=(x,y,w,h,c)=>{ g.fillStyle=c; g.fillRect(Math.round(x),Math.round(y)+EXT,w,h); };
  R(gx0-3,-14,gx1-gx0+6,1,'#5a3e10');                                                                            // the gallery's head, under the cornice
  for(let i=0;i<=5;i++){ const px=i===0?gx0:i===5?gx1-6:Y.win[i][0]-6, pw=i===0||i===5?6:4;                     // its gilt pilasters (wider at its ends) · a carved head & a foot on each
    R(px,-13,pw,17,'#c09030'); R(px,-13,1,17,'#fff0a0'); R(px+pw-1,-13,1,17,'#6a4a14'); R(px-1,-13,pw+2,2,'#e8c050'); R(px-1,2,pw+2,2,'#8a6424'); }
  R(gx0-3,4,gx1-gx0+6,2,'#e8c050'); R(gx0-3,6,gx1-gx0+6,1,'#5a3e10');                                           // the gallery's sill
  for(const q of Y.lamps){ const x=q[0]; R(x-2,q[1]+11,5,6,'#8a6424'); R(x-1,q[1]+12,3,4,'#e8c050'); R(x,q[1]+10,1,2,'#c09030'); R(x-2,q[1]+9,5,1,'#e8c050'); R(x,q[1]+7,1,2,'#f4ecd8'); R(x-1,q[1]+16,3,1,'#5a3e10'); }   // the sconces: a gilt plate, its cup, a candle (its flame is drawn live)
  L.bg=cv; L.EXT=EXT; L.win=Y.win; L.lamps=Y.lamps; L.chand=Y.chand; }
/* the chandelier: a gilt stem & bowl, a ring of six candle arms, crystal drops · drawn after the y-sort (it hangs high over the table), lit by its own light,
   its candle flames after the light pass */
function chandSpr(V){ return tProp(V,'dkChand', ()=>{ const S=PS(30,20), GD=cIR(['#5a3e10','#8a6424','#c09030','#e8c050','#fff0a0']), CN=cIR(['#b8ac8c','#f4ecd8']), fl=[];
  const cups=[[3,12],[8,10],[22,10],[27,12],[9,15],[21,15]];                                                     // (the far arms first: they sit higher)
  for(const [cx,cy] of cups){ psLine(S,15,13,cx,cy+1,GD[1],1); psLine(S,15,12,cx,cy,GD[3],1); pR(S,cx-1,cy,3,1,GD[3]); psP(S,cx-1,cy+1,GD[1]); psP(S,cx+1,cy+1,GD[1]); pR(S,cx,cy-3,1,3,CN[1]); psP(S,cx,cy-1,CN[0]); fl.push([cx,cy-4]); }   // the arms (S-curved, lit on top), their cups & candles
  for(let y=0;y<13;y++){ psP(S,15,y,GD[y%4===0?4:3]); psP(S,14,y,GD[1]); }                                          // the stem
  pR(S,13,3,4,2,GD[3]); psP(S,13,3,GD[4]); psDisc(S,15,14,3.5,2.6,(nx,ny)=>GD[ny<-0.3?4:ny>0.4?1:3]); psP(S,15,18,GD[2]);   // a knop · the bowl · its finial
  for(const q of [[6,14],[11,17],[19,17],[24,14],[15,19]]){ psP(S,q[0],q[1],cI('#d8f0ff')); psP(S,q[0],q[1]-1,cI('#8aa8c0')); }   // crystal drops
  const o=tOut(S,15,19); o.fl=fl; return o; }); }
function chandDraw(L){ const c=L.chand, o=chandSpr(DK.V), X=TX(c[0]), Y=TY(c[1]), y0=Y-o.ay-11;          // (G20 FIX) a short chain from a gilt ceiling rose — the ¾ view has no deckhead, and a long one crossed the case & the gallery
  pctx.fillStyle='#4a3a28'; for(let y=y0+3;y<Y-o.ay;y+=2) pctx.fillRect(X,y,1,1); pctx.fillStyle='#8a6424'; for(let y=y0+4;y<Y-o.ay;y+=2) pctx.fillRect(X,y,1,1);
  pctx.fillStyle='#5a3e10'; pctx.fillRect(X-2,y0+1,5,2); pctx.fillStyle='#c09030'; pctx.fillRect(X-1,y0,3,2); pctx.fillStyle='#fff0a0'; pctx.fillRect(X-1,y0,1,1); pctx.fillStyle='#e8c050'; pctx.fillRect(X,y0+2,1,1);
  pctx.drawImage(o.cv,X-o.ax,Y-o.ay); }
function chandFlames(L){ const c=L.chand, o=chandSpr(DK.V), X=TX(c[0])-o.ax, Y=TY(c[1])-o.ay; o.fl.forEach((f,i)=>{ const k=Math.sin(itime*11+i*2.3)>0.6?1:0; pctx.fillStyle='#ffc860'; pctx.fillRect(X+f[0],Y+f[1]-k,1,2+k); pctx.fillStyle='#fff8d8'; pctx.fillRect(X+f[0],Y+f[1]+1,1,1); }); }
/* the great cabin's trophy case, three wide (TTT): low enough to sit under the stern gallery — the lords' trophies stood on its top with the White's jaw, two
   glazed shelves of the curios behind its doors (six a shelf, in the order found) */
function deckCase3Spr(V){ const sg=deckShelfSig(); return tProp(V,'dkCase3'+sg, ()=>{ const S=PS(62,44), Wd=tRamp('#5a3a22'), GD=cIR(['#5a3e10','#8a6424','#c09030','#e8c050']), T0=10;
  pR(S,0,T0,62,34,Wd[1]); pR(S,0,T0,62,3,Wd[4]); pR(S,0,T0,62,1,GD[3]); pR(S,0,T0+2,62,1,Wd[2]); pR(S,0,T0,2,34,Wd[3]); pR(S,60,T0,2,34,Wd[0]); pR(S,3,T0+4,56,25,Wd[0]);   // the carcass, its top gilt-edged · the dark inside
  for(const y of [T0+16,T0+29]){ pR(S,3,y,56,2,Wd[3]); pR(S,3,y,56,1,Wd[5]); } pR(S,0,T0+30,62,4,Wd[1]); pR(S,0,T0+30,62,1,GD[2]); pR(S,2,T0+33,4,1,Wd[0]); pR(S,56,T0+33,4,1,Wd[0]);   // two shelves · the plinth, a gilt bead
  const nT=DK_TROPHY.length; DK_TROPHY.forEach((t,i)=>{ if(!bFirst[t[0]]) return; const [w,h]=pxiDim(t[1]); pxiInto(S,t[1],5+i*10+((8-w)>>1),T0-h); });   // the lords' trophies, stood on its top in their places
  if(whiteTaken){ const [w,h]=pxiDim('tooth'); pxiInto(S,'tooth',5+nT*10+((8-w)>>1),T0-h); }                  // the White's jaw beside them
  pR(S,56,T0-6,2,6,GD[2]); psP(S,56,T0-6,GD[3]); pR(S,55,T0-1,4,1,GD[1]);                                       // a gilt candlestick at its end
  const C=curios.slice(0,12); for(const odd of [1,0]) C.forEach((c,j)=>{ if((j&1)!==odd) return; const n='cur'+c, [w,h]=pxiDim(n), k=j%6, by=j<6?T0+16:T0+29; if(w) pxiInto(S,n,Math.round(7.5+k*9.4-w/2),Math.max(by-13,by-h)-(odd?1:0)); });   // the curios, six a shelf (the odd ones a step back)
  if(curios.length<12){ pR(S,51,T0+23,3,6,cI('#3a6a4a')); psP(S,52,T0+22,cI('#c8b890')); }                       // (an empty corner: a bottle)
  pR(S,30,T0+4,2,25,GD[1]); psP(S,30,T0+4,GD[3]); for(const x of [3,58]) pR(S,x,T0+4,1,25,GD[1]);              // its glazed doors' gilt frames
  for(const [x0,y0] of [[6,T0+6],[34,T0+6],[10,T0+19],[40,T0+19]]) for(let i=0;i<5;i++) psP(S,x0+i,y0+i,cI('#9ab4c8'));   // a gleam on the glass
  psP(S,29,T0+12,GD[3]); psP(S,32,T0+12,GD[3]);                                                                  // the doors' knobs
  return tOut(S,31,43); }); }
/* the Grand Schooner's stern castle — the deckhouse grown two storeys (the K block at stage 4): the poop on top (planked, a balustrade round it, the great cabin's
   skylight, her two stern lanterns on the taffrail, the stove's pipe) · its face: a gilt cornice, the gallery's three arched windows over her door, a frieze in her
   paint studded with gilt, the door under a gilt pediment, two round windows in brass, gilt corner posts, her paint at its foot */
function deckHouseOf(s){ return DK.stg>=4 ? castleSpr(DK.V,s.b) : deckHouseSpr(DK.V,s.b); }
function castleSpr(V,b){ const w=(b.x1-b.x0+1)*20, h=(b.y1-b.y0+1)*20, T=deckLevel('top'), dx=T&&T.st.door?(T.st.door.x-b.x0)*20+12:w>>1, LV=deckLiv();
  return tProp(V,'dkCastle'+w+'_'+h+'_'+dx+LV.hull, ()=>{ const WH=42, ry=h-8, SW=w+4, SH=ry+WH, S=PS(SW,SH), FC=tRamp('#8a5a30'), PL=tRamp('#c49258'), HU=tRamp(LV.hull), IR=cI('#2a2628'),
    GD=cIR(['#5a3e10','#8a6424','#c09030','#e8c050','#fff0a0']), GL=cIR(['#141e2c','#22344a','#3a5674','#8ab0d0']), IV=cIR(['#7a6e58','#b8ac8c','#e8e0c8']), LG=cIR(['#2a2420','#c89850','#f0d890']);
    for(let y=0;y<ry;y++) for(let x=0;x<SW;x++){ const pr=Math.floor(y/5), sy=y%5, jl=36+((tH(pr,5)*16)|0), off=(tH(pr,9)*jl)|0, jx=(x+off)%jl; let v=2.9+(tH((x+off)>>3,pr*7)-0.5)*0.6+bayV(x,y)*0.35;   // the poop: her planks fore & aft
      if(sy===4) v=1.2; else if(sy===0) v+=0.4; if(jx===0) v=1.3; if(y<10 || y>=ry-9 || x<5 || x>=SW-5) v-=0.6; psP(S,x,y,PL[clamp(Math.floor(v),0,5)]); }   // (a shade in along her rails)
    const bal=(y0)=>{ pR(S,0,y0,SW,2,GD[3]); pR(S,0,y0+1,SW,1,GD[2]); for(let x=0;x<SW;x++){ const k=x%3; for(let y=y0+2;y<y0+6;y++) psP(S,x,y,k===2?FC[0]:IV[k===0?2:1]); } pR(S,0,y0+6,SW,1,GD[1]); };   // a balustrade: its gilt rail over turned balusters
    bal(0); for(let y=2;y<ry;y++){ pR(S,0,y,3,1,GD[y%8===0?4:2]); psP(S,2,y,GD[1]); pR(S,SW-3,y,3,1,GD[y%8===0?3:1]); psP(S,SW-3,y,GD[2]); }   // the far rail toward you · the taffrail astern & the rail forward, their caps from above
    const sx=Math.round(SW*0.42), sy=Math.round(ry*0.36); pR(S,sx-2,sy-2,16,11,FC[2]); pR(S,sx-2,sy-2,16,1,FC[5]); pR(S,sx-2,sy+8,16,1,FC[1]); pR(S,sx,sy,12,7,GL[0]); pR(S,sx,sy,12,1,GL[2]); pR(S,sx+6,sy,1,7,FC[1]); psP(S,sx+2,sy+2,GL[3]); for(const q of [[-2,-2],[13,-2],[-2,8],[13,8]]) psP(S,sx+q[0],sy+q[1],GD[3]);   // the great cabin's skylight
    const px=Math.round(SW*0.8); pR(S,px,4,3,12,IR); pR(S,px-1,3,5,2,cI('#4a4648'));                            // the stove's pipe
    { const bx=Math.round(SW*0.14)+4; pR(S,bx,9,16,3,FC[4]); pR(S,bx,9,16,1,FC[5]); pR(S,bx,12,16,1,FC[1]); pR(S,bx+1,13,2,2,FC[1]); pR(S,bx+13,13,2,2,FC[1]); }   // a bench along her rail
    { const cx=SW-14, cy=ry-17; psDisc(S,cx,cy,5,3,(nx,ny)=>{ const r=nx*nx+ny*ny; return r<0.22?0:cI(r>0.7?'#8a6a3e':(nx+ny<0?'#e0c890':'#c8a870')); }); psP(S,cx+5,cy+2,cI('#a07a48')); psP(S,cx+6,cy+3,cI('#a07a48')); }   // a coil of line, flaked down
    const lg=[]; for(const ly of [13,ry-5]){ const lx=6; pR(S,lx,ly+1,1,4,IR); pR(S,lx-3,ly-8,7,1,GD[3]); pR(S,lx-2,ly-9,5,1,GD[2]); psP(S,lx,ly-11,GD[4]); psP(S,lx,ly-10,GD[3]);   // her two stern lanterns on the taffrail: a gilt crown & finial …
      pR(S,lx-3,ly-7,7,6,LG[0]); pR(S,lx-2,ly-7,5,6,LG[1]); pR(S,lx-1,ly-6,3,4,LG[2]); psP(S,lx,ly-7,LG[0]); pR(S,lx-3,ly-1,7,1,GD[2]); pR(S,lx-2,ly,5,1,GD[1]); lg.push([lx,ly-4]); }   //  the glass in its iron cage, a gilt foot, its bracket
    for(let y=ry;y<SH;y++) for(let x=0;x<SW;x++){ const u=y-ry; let c;                                           // its face:
      if(y>=SH-5) c=HU[y===SH-5?5:x<2?4:3];                                                                     // her paint at its foot
      else if(u<2) c=GD[u===0?4:2];                                                                              // the cornice
      else if(u>=18 && u<22) c=u===18?GD[3]:u===21?GD[1]:(x%6===3?GD[3]:HU[u===19?4:3]);                         // the frieze between the storeys — her paint, gilt-edged, studded
      else { let v=x%10===0?2:3; if(u===2||u===22) v=1; else if(u===17||y===SH-6) v=2; c=FC[v]; }               // oak panels
      psP(S,x,y,c); }
    bal(ry-7);                                                                                                  // the poop's rail along its front
    for(const cx of [0,SW-3]) for(let y=ry+2;y<SH-5;y++){ psP(S,cx,y,GD[cx?2:4]); psP(S,cx+1,y,GD[cx?1:3]); psP(S,cx+2,y,GD[cx?0:1]); }   // gilt corner posts
    const wx=[dx-20,dx,dx+20].map(v=>clamp(v,9,SW-10)), wr=[];
    for(const c of wx){ const x0=c-4, y0=ry+4; pR(S,x0-1,y0-1,11,13,GD[1]); pR(S,x0-1,y0-1,11,1,GD[3]); pR(S,x0-1,y0-1,1,13,GD[3]); pR(S,x0+1,y0-2,7,1,GD[2]); psP(S,c,y0-3,GD[4]);   // the gallery's three windows: arched, framed in gilt, a keystone …
      for(let y=0;y<11;y++) for(let x=0;x<9;x++){ if(y===0 && (x<2||x>6)) continue; if(y===1 && (x<1||x>7)) continue; psP(S,x0+x,y0+y,(x===4||y===5)?FC[1]:GL[y<3?2:x+y<7?3:1]); }   //  their panes & glazing bars
      wr.push([x0,y0,9,11]); }
    if(wx[0]-6>13){ const c=Math.round((3+wx[0]-6)/2); psDisc(S,c,ry+9,5,3.6,(nx,ny)=>{ const r=nx*nx+ny*ny; return r>0.6?GD[ny<0?3:1]:HU[ny<-0.2?4:3]; }); psP(S,c-1,ry+9,GD[4]); psP(S,c+1,ry+9,GD[4]); }   // a gilt cartouche in her paint
    const d0=clamp(dx-6,3,SW-15); pR(S,d0-1,SH-22,14,17,FC[1]); pR(S,d0,SH-21,12,16,FC[2]); for(let x=d0+3;x<d0+12;x+=4) pR(S,x,SH-21,1,16,FC[1]); pR(S,d0,SH-21,12,1,FC[4]); pR(S,d0+9,SH-13,2,2,GD[2]); psP(S,d0+9,SH-13,GD[4]);   // the door, its gilt handle
    for(let j=0;j<4;j++) pR(S,d0-1+j*2,SH-23-j,14-j*4,1,GD[j?3:1]); psP(S,d0+5,SH-27,GD[4]); psP(S,d0+6,SH-27,GD[4]);   // its gilt pediment
    const win=[]; for(const c of [wx[0],wx[2]]){ if(Math.abs(c-(d0+6))<11) continue; const cy=SH-13; psDisc(S,c,cy,3.6,3.6,(nx,ny)=>{ const r=nx*nx+ny*ny; return r>0.62?GD[ny<0?4:1]:GL[ny<-0.2?3:1]; }); win.push([c,cy]); }   // two round windows in brass, under the gallery's outer ones
    const o=tOut(S,SW>>1,SH-1); o.win=win; o.wr=wr; o.lg=lg; o.door=[d0,SH-21,12,16]; o.pipe=[px+1,3]; o.sky=[sx,sy,12,7]; return o; }); }
function castleLights(s,o,b){ for(const r of o.wr) lAdd(s.x-o.ax+r[0]+r[2]/2,s.y-o.ay+r[1]+r[3]/2+8+b,20,0.45,0); for(const q of o.lg) lAdd(s.x-o.ax+q[0],s.y-o.ay+q[1]+b,60*(1+0.03*Math.sin(itime*7.3+q[1])),0.95,10); }   // (night: the gallery lit from within · her stern lanterns)
function castleGlow(o,X,Y){ for(const r of o.wr){ pctx.fillStyle='#ffc860'; pctx.fillRect(X+r[0],Y+r[1]+2,r[2],r[3]-2); pctx.fillRect(X+r[0]+2,Y+r[1],r[2]-4,2); pctx.fillStyle='#fff0b8'; pctx.fillRect(X+r[0]+1,Y+r[1]+3,3,3); pctx.fillRect(X+r[0]+5,Y+r[1]+3,3,3); pctx.fillStyle='#8a5a28'; pctx.fillRect(X+r[0]+4,Y+r[1]+1,1,r[3]-1); pctx.fillRect(X+r[0],Y+r[1]+5,r[2],1); }
  for(const q of o.lg){ pctx.fillStyle='#ffc860'; pctx.fillRect(X+q[0]-2,Y+q[1]-3,5,6); pctx.fillStyle='#fff4c8'; pctx.fillRect(X+q[0]-1,Y+q[1]-2,3,3); } }   // (what glows through the dark: the gallery's panes · the lanterns' glass)
