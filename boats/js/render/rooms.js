"use strict";
/* FILE: js/render/rooms.js
ROOMS IN PIXELS: original lines 33617-33867 (build 5109cd5), moved verbatim, in place after the townsfolk favours, helpers
  and folkLoad (ending at original line 33616 (build 5109cd5), still inline) and before the old smooth port renderer
  (original line 33868 (build 5109cd5), still inline).
What it is: the walkable rooms on the town texel grid (the tavern, the museum and your home): the curio stories, the baked
  floor and walls per room kind, furniture, museum plinths and wall cases as outlined sprites, the y-sorted room frame (folk,
  you and the story's actors) and the room's light pass. It ends by registering the tavern mug and 14 curio pixel icons.
Entry points: drawRoomT (frameInner, mode interior, when townPixOn); curioItem (the museum room and the Explorer menu);
  roomDecoPaint and furnSpr (the boat deck art); FURN_BASE (the story).
Globals it owns (all const or function): CURIO_TALE, curioItem, roomRamp, roomPrep, roomDecoPaint, roomRampHex, furnSpr,
  plinthSpr, pxiSil, caseSpr, FURN_BASE, flameSpr, drawRoomT, roomLightPass.
Main globals it reads from elsewhere, at runtime only: INT, INT_TS, PRT, CURIOS, MUS_SETS, matPx, museumCases
  (js/ports/museum.js), mixHex, TUNE, ETUNE, env, player, itime, pctx, IW, IH, the pixel kit (js/render/pixkit.js: PS, cIR,
  cIA, tSpr, bayV), the town kit (js/render/towns.js: tRamp, tH, TOX, TOY, TDR, TDRN, tdr, tProp, tOut, pR, pxiInto, pxiDim,
  drawFolk, folkLook, folkDir, playerLook, walkFr), LGT, lAdd, lBeam, lDraw, nightK (js/render/light.js), folkMarkAt,
  scnActorsHere, scnDrawActor, and PORT_PAL (original line 33869 (build 5109cd5), still inline, later).
Load-time statements: two literal consts, CURIO_TALE (original line 33619 (build 5109cd5)) and FURN_BASE (original line
  33788 (build 5109cd5)), and one registration, original lines 33852-33867 (build 5109cd5): Object.assign into PXI_ART of
  mug and cur0..cur13, which needs PXI_ART (js/render/hud_kit.js, earlier); the icons are only drawn at runtime.
*/
/* ---- ROOMS in pixels: the tavern, the museum & your home — the floor & walls baked once (INT._V.bg: the back wall stands a
   tile tall over the room), furniture & exhibits as outlined sprites, folk y-sorted with you, lit by hearth, candle & window ---- */
const CURIO_TALE=['Etched by a whaler with a steady hand and a long winter: a ship, a whale, and a name no one remembers.',
  'Its mirrors are fogged with salt, but it still finds the sun. Someone navigated a long way home with it.',
  'Carved from one green stone. The shell eyes follow you round the room — the curator swears they never used to.',
  'The last pages are ash. The rest tell of a heading, a storm, and a light on the water that should not have been there.',
  'It fell burning into the sea, the old fisherman said. It is still faintly warm to the touch.',
  'Grown, not carved — the reef made it round something that is no longer inside.',
  'Wind it and it plays a tune no tavern knows. Under water, they say, it plays another.',
  'Coasts and soundings for a sea on no Guild chart. Its compass rose points the wrong way.',
  'A cold blue light, stoppered in green glass. It brightens when the tide comes in.',
  'She looked out over a bow for a hundred years. The sun took her paint; it never took her smile.',
  'A pearl as black as a moonless night, set in old gold. Its first owner is not asking for it back.',
  'Obsidian, and its needle points steadily south. No one has yet found out what lies that way.',
  'A relic in silver and glass, carried by pilgrims across the water. Handle with prayer.',
  'Almost certainly a fake. Almost.'];
function curioItem(ci){ const n=CURIOS[ci]; return {name:n.charAt(0).toUpperCase()+n.slice(1), story:CURIO_TALE[ci]||'A unique find off the far isles.', cur:ci}; }
function roomRamp(h){ return tRamp(h); }
function roomPrep(){ const I=INT; if(I._V) return I._V; const TS=I.TS, W=I.W, H=I.H, EXT=TS, k=I.kind;
  const V={ps:new Map(), ext:EXT, win:[], lights:[], fr:0};
  const cv=document.createElement('canvas'); cv.width=W*TS; cv.height=H*TS+EXT; const id=new ImageData(cv.width,cv.height), d=new Uint32Array(id.data.buffer), CW=cv.width;
  const FLR = k==='museum'?null : roomRamp(k==='tavern'?'#7a5234':'#a8783e'), MB=cIR(['#8a8478','#b4ac9c','#d8d0c0','#ece6d8','#f8f4ec']), MG=cIR(['#5a5660','#7a7680','#9a96a0','#b6b2bc']),
    CP=roomRamp('#8a2a34'), GD=cI('#d8a840'), WL=k==='museum'?roomRamp('#8a8478'):roomRamp(k==='tavern'?'#d8c49a':'#c8b890'), WN=roomRamp(k==='museum'?'#4a3424':'#6a4428'), TOPW=cIR(['#140e0a','#2a1e16','#3e2e22','#5a4432']);
  for(let y=0;y<cv.height;y++) for(let x=0;x<CW;x++){ const wy=y-EXT, tx=Math.floor(x/TS), ty=Math.floor(wy/TS), bay=bayV(x,y); let c;
    if(wy<TS){                                                                                                // the back wall: its top, the plaster (or stone), the wainscot
      if(wy<-EXT+4) c=TOPW[wy<-EXT+1?3:1];
      else if(wy<TS-15){ if(k==='museum'){ const row=Math.floor((wy+EXT)/7), off=(row&1)*9, sx=(x+off)%18, sy=(wy+EXT)%7; c=(sx===17||sy===6)?WL[1]:WL[clamp(Math.floor(3+(tH(Math.floor((x+off)/18),row)-0.5)*1.2+(sy===0?0.8:0)),1,5)]; }
        else if(k==='home'){ const sx=x%8, sy=(wy+EXT)%10; c=WL[sx<4?3:4]; if(sx===6 && (sy===3||sy===5)) c=WL[2]; else if((sx===5||sx===7) && sy===4) c=WL[2]; }   // striped wallpaper with a little sprig
      else { c=WL[(tH(x*3,wy*5)<0.035)?2:3]; if(tH(Math.floor(x/7)*3,Math.floor((wy+EXT)/4))<0.06) c=WL[4]; if((x%66)<3) c=WN[(x%66)===0?3:1]; } }
      else if(wy<TS-13) c=WN[4]; else { const pl=x%6; c=WN[wy>=TS-2?0:pl===5?1:pl===0?3:2]; } }
    else if(tx===0||tx===W-1||ty===H-1){                                                                      // the side & front walls' tops
      const thr=ty===H-1 && I.tiles[ty*W+tx]===2; if(thr){ c=(x%4===0||(wy%4===0))?cI('#8a6a3a'):cI('#a8844a'); if(wy-ty*TS<3) c=cI('#caa05a'); }
      else { const inner=(tx===0&&x>=TS-3)||(tx===W-1&&x<(W-1)*TS+3)||(ty===H-1&&wy<ty*TS+3); c=inner?TOPW[3]:TOPW[1+((x+wy)&1&&bay>0.3?1:0)]; } }
    else if(k==='museum'){ const runner=Math.abs(x-W*TS/2)<24 && wy>7*TS; if(runner){ const e=24-Math.abs(x-W*TS/2); c=e<2?GD:e<4?CP[1]:CP[clamp(Math.floor(3+bay*0.6),2,4)]; }   // marble checker, a red runner to the centrepiece
      else { const cx2=Math.floor(x/11), cy2=Math.floor(wy/11), ch=(cx2+cy2)&1, sx=x%11, sy=wy%11; if(sx===10||sy===10) c=MG[0]; else { const R=ch?MB:MG; let v=(ch?2.5:2.2)+(sx===0||sy===0?0.9:0)+(sx===9||sy===9?-0.6:0); if(ch && ((x+wy*2+cx2*5)%13===0) && tH(cx2,cy2)<0.5) v-=1; c=R[clamp(Math.floor(v),0,R.length-1)]; } } }   // (marble: a vein here & there)
    else { const PH=k==='tavern'?6:5, row=Math.floor(wy/PH), off=Math.floor(tH(row,11)*40), sx=(x+off)%48, sy=wy%PH; let v=2.85+(tH(Math.floor((x+off)/48)*5,row)-0.5)*0.8;   // planks, staggered, a knot here & there
      if(sy===PH-1) v=1.2; else if(sy===0) v+=0.4; if(sx===0) v=1.2; else if(sx===1) v+=0.3; if(tH(Math.floor(x/3)*3,row*7)<0.006 && sy===2) v=1.6; c=FLR[clamp(Math.floor(v),0,5)]; }
    d[y*CW+x]=c; }
  cv.getContext('2d').putImageData(id,0,0); V.bg=cv;
  const g=cv.getContext('2d');
  // the back wall's dressing: windows (glass drawn live), and per room — a ship's wheel & a mounted fish · banners · a painting & a clock
  const wins=k==='museum'?[W*TS/2-11]:k==='tavern'?[7.5*TS,12*TS]:[W*TS*0.36];
  for(const wx of wins){ const ww=k==='museum'?22:16, wh=k==='museum'?24:18; V.win.push([wx,-EXT+6,ww,wh]); }
  V.deco=[]; if(k==='tavern'){ V.deco.push(['wheel',3.2*TS,-EXT+8]); V.deco.push(['fishm',10*TS,-EXT+10]); V.deco.push(['lantern',5.5*TS-30,-EXT+2]); V.deco.push(['lantern',5.5*TS+30,-EXT+2]); }
  else if(k==='museum'){ for(const f of [0.18,0.34,0.66,0.82]) V.deco.push(['banner',W*TS*f,-EXT+4,f]); V.deco.push(['sconce',W*TS*0.26,-EXT+12]); V.deco.push(['sconce',W*TS*0.74,-EXT+12]); }
  else { V.deco.push(['painting',W*TS*0.62,-EXT+8]); V.deco.push(['clock',W*TS*0.18,-EXT+4]); }
  for(const q of V.deco) roomDecoPaint(g,q,EXT);
  for(const p of (I.people||[])) if(!p.look){ const sd=(PRT?PRT.core.idx:0)*53+Math.round(p.x*7+p.y*3);
    p.look = p.kind==='keep' ? folkLook(sd,{apron:'#e8e0cc', hat:null, top:'#7a4a2c', cut:'shirt', beard:true, carry:null, hs:'short'})
      : p.kind==='cards' ? folkLook(sd,{hat:'hood', hatC:'#2a2640', top:'#33304a', cut:'coat', carry:null, scarf:'#b8902c', apron:null}) : folkLook(sd,{top:p.coat, carry:null, apron:null}); }
  return I._V=V; }
function roomDecoPaint(g,q,EXT){ const [k,x,y0]=q, y=y0+EXT, P=(xx,yy,c)=>{ g.fillStyle=c; g.fillRect(Math.round(xx),Math.round(yy),1,1); }, Rc=(xx,yy,w,h,c)=>{ g.fillStyle=c; g.fillRect(Math.round(xx),Math.round(yy),w,h); };
  if(k==='wheel'){ const cx=Math.round(x), cy=y+10; for(let a=0;a<8;a++){ const t=a*TAU/8; for(let r=0;r<11;r++) P(cx+Math.cos(t)*r,cy+Math.sin(t)*r,r>8?'#4a2e18':'#8a5a2e'); }
    for(let a=0;a<48;a++){ const t=a*TAU/48; P(cx+Math.cos(t)*7,cy+Math.sin(t)*7,'#6a4222'); P(cx+Math.cos(t)*8,cy+Math.sin(t)*8,'#a8743e'); } Rc(cx-1,cy-1,3,3,'#caa05a'); }
  else if(k==='fishm'){ Rc(x-10,y+4,22,10,'#5a3a1e'); Rc(x-9,y+5,20,8,'#7a5230'); for(let i=0;i<14;i++){ const h=Math.round(Math.sin(i/13*Math.PI)*3); Rc(x-6+i,y+9-h,1,2*h+1,i<3?'#4a8aa8':'#6ab0c8'); } Rc(x+6,y+6,2,6,'#4a8aa8'); P(x-4,y+8,'#101820'); }
  else if(k==='lantern'){ Rc(x,y,1,6,'#2a2420'); Rc(x-3,y+6,7,1,'#2a2420'); Rc(x-2,y+7,5,6,'#3a3430'); Rc(x-1,y+8,3,4,'#d8b860'); Rc(x-3,y+13,7,1,'#2a2420'); }
  else if(k==='banner'){ const col=PORT_PAL.banner[Math.floor(q[3]*10)%PORT_PAL.banner.length], Hx=roomRampHex(col); Rc(x-7,y,15,2,'#5a4a30'); Rc(x-7,y,15,1,'#8a7a50');   // a hanging banner, swallow-tailed, a gilt star on it
    for(let j=2;j<28;j++){ Rc(x-5,y+j,11,1,Hx[3]); P(x-5,y+j,Hx[4]); P(x-4,y+j,Hx[4]); P(x+5,y+j,Hx[1]); }
    for(let i=-5;i<=5;i++){ const L=Math.abs(i)>=3?3:Math.abs(i)===2?2:Math.abs(i)===1?1:0; if(L) Rc(x+i,y+28,1,L,Hx[i<0?3:2]); }
    Rc(x-5,y+4,11,1,'#d8a840'); Rc(x-1,y+11,3,3,'#ffd86b'); P(x,y+10,'#ffd86b'); P(x,y+14,'#ffd86b'); P(x-2,y+12,'#ffd86b'); P(x+2,y+12,'#ffd86b'); P(x,y+12,'#fff4c0'); }
  else if(k==='sconce'){ Rc(x-2,y,5,2,'#8a6a28'); Rc(x-1,y+2,3,4,'#6a4a1c'); Rc(x,y-3,1,3,'#f4e8c8'); }
  else if(k==='painting'){ Rc(x-14,y,28,18,'#6a4418'); Rc(x-13,y+1,26,16,'#c8983e'); Rc(x-12,y+2,24,14,'#8ab8d8'); Rc(x-12,y+10,24,6,'#3a6a8a'); Rc(x-4,y+5,2,7,'#5a3a1e'); Rc(x-8,y+6,6,4,'#f4efe0'); Rc(x-1,y+7,5,3,'#f4efe0'); Rc(x-9,y+11,14,2,'#6a4428'); Rc(x+6,y+4,3,2,'#ffe8a0'); }
  else if(k==='clock'){ Rc(x-5,y,11,34,'#5a3a1e'); Rc(x-4,y+1,9,32,'#7a5230'); Rc(x-3,y+3,7,7,'#f4efe0'); P(x,y+6,'#1a1410'); P(x,y+5,'#1a1410'); P(x+1,y+6,'#1a1410'); Rc(x-2,y+14,5,14,'#3a2414'); Rc(x-1,y+22,3,3,'#d8a840'); } }
function roomRampHex(h){ return [mixHex(h,'#120a22',0.62),mixHex(h,'#1a1030',0.4),mixHex(h,'#241a3a',0.2),h,mixHex(h,'#fff4d6',0.22),mixHex(h,'#fffaf0',0.44)]; }
/* furniture */
function furnSpr(V,f){ const key=f.k; return tProp(V,key, ()=>{ const TS=INT_TS;
  if(f.k==='bar'){ const w=Math.round(6.4*TS), S=PS(w,28), Wd=roomRamp('#6a4428'), Tp=roomRamp('#8a5a30'), Br=cIR(['#8a6424','#caa05a','#f0d88a']);
    pR(S,0,0,w,6,Tp[3]); pR(S,0,0,w,1,Tp[5]); pR(S,0,5,w,1,Tp[1]); for(let x=0;x<w;x++){ for(let y=6;y<27;y++){ const pn=x%18; psP(S,x,y, y===6?Wd[1]:(pn===0||pn===17)?Wd[1]:(y===7||y===25)?Wd[4]:(pn===1)?Wd[4]:Wd[3]); } }
    pR(S,0,23,w,1,Br[1]); pR(S,0,24,w,1,Br[0]);                                                              // the brass foot-rail
    for(let x=10;x<w-8;x+=22){ pR(S,x,-0+1,4,4,cI('#e8dcc0')); pR(S,x,1,4,1,cI('#fff8e8')); pR(S,x+4,2,1,2,cI('#c8b890')); pR(S,x+1,2,2,2,cI('#e8a030')); }   // mugs
    for(const tx of [w*0.4,w*0.6]){ pR(S,Math.round(tx),-0,2,5,Br[1]); psP(S,Math.round(tx),0,Br[2]); }
    return tOut(S,w>>1,27); }
  if(f.k==='bottles'){ const w=Math.round(5.4*TS), S=PS(w,26), Wd=roomRamp('#4a2e18'), cols=['#6a8a5a','#8a5c34','#5a6a8a','#7a4a5a','#caa05a','#3a5a3a','#9a3a2a'];
    pR(S,0,0,w,26,Wd[2]); pR(S,0,0,w,1,Wd[4]); pR(S,0,12,w,2,Wd[4]); pR(S,0,24,w,2,Wd[4]); pR(S,0,0,2,26,Wd[3]); pR(S,w-2,0,2,26,Wd[1]);
    for(const sy of [2,14]) for(let x=4;x<w-4;x+=5){ const c=roomRamp(cols[(x*7+sy)%cols.length]), bh=6+((x+sy)%3); pR(S,x,sy+10-bh,3,bh,c[3]); psP(S,x,sy+11-bh,c[5]); pR(S,x+1,sy+8-bh,1,2,c[2]); psP(S,x+2,sy+10-bh+2,c[1]); }
    return tOut(S,w>>1,25); }
  if(f.k==='fire'){ const S=PS(44,56), St=roomRamp('#8a8478'), Dk=cIR(['#140c08','#241810']), Lg=roomRamp('#5a3a1e');   // a stone hearth, its breast up the wall
    for(let y=0;y<56;y++) for(let x=0;x<44;x++){ const breast=y<30&&x>=8&&x<36; if(y<30&&!breast) continue; const row=Math.floor(y/5), off=(row&1)*4, sx=(x+off)%8, sy=y%5; psP(S,x,y,(sx===7||sy===4)?St[1]:St[clamp(Math.floor(3+(tH(Math.floor((x+off)/8),row)-0.5)*1.2+(sy===0?0.7:0)+(x<10?0.6:x>33?-0.6:0)),1,5)]); }
    pR(S,4,28,36,3,St[5]); pR(S,4,30,36,1,St[2]);                                                              // the mantel
    pR(S,10,36,24,17,Dk[0]); pR(S,11,37,22,2,Dk[1]); pR(S,12,49,20,2,Lg[2]); pR(S,14,47,16,2,Lg[3]); psP(S,14,47,Lg[5]);   // the firebox & its logs
    pR(S,6,24,4,4,cI('#caa05a')); pR(S,34,25,3,3,cI('#6a8aa8'));
    return tOut(S,22,54); }
  if(f.k==='kegs'){ const S=PS(34,30), B=roomRamp('#8a5c34'), H=cI('#3a3434'); const keg=(x,y)=>{ for(let j=0;j<12;j++) for(let i=0;i<14;i++){ const nx=(i+0.5-7)/7; if(Math.abs(nx)>0.98 && (j<2||j>9)) continue; let v=i<3?4:i>10?1:3; if(j===3||j===8){ psP(S,x+i,y+j,H); continue; } psP(S,x+i,y+j,B[v]); } pR(S,x+5,y+4,4,4,B[1]); pR(S,x+6,y+5,2,2,B[5]); };
    keg(3,16); keg(17,16); keg(10,4); pR(S,24,24,2,4,cI('#8a8070')); return tOut(S,17,29); }
  if(f.k==='table'){ const S=PS(40,26), Tp=roomRamp('#7a5230'), L=roomRamp('#4a3320'), Sl=roomRamp('#6a4428');
    for(const [sx,sy] of [[2,14],[31,14],[16,20]]){ psDisc(S,sx+3.5,sy+2,3.6,2,(nx,ny)=>Sl[ny<0?4:2]); pR(S,sx+1,sy+3,1,4,Sl[1]); pR(S,sx+5,sy+3,1,4,Sl[1]); }
    pR(S,18,12,4,10,L[2]); pR(S,14,21,12,2,L[1]); psDisc(S,20,9,17,7.5,(nx,ny,x,y)=>{ const r=nx*nx+ny*ny; return r>0.8?Tp[ny>0?1:2]:Tp[clamp(Math.floor(3.3-(nx*0.5+ny*0.7)*1.2+bayV(x,y)*0.4),2,5)]; });
    pR(S,10,6,4,4,cI('#e8dcc0')); pR(S,10,6,4,1,cI('#fff8e8')); pR(S,11,7,2,2,cI('#e8a030')); pR(S,26,8,3,3,cI('#e8dcc0')); pR(S,19,5,2,4,cI('#f4efe0')); psP(S,19,4,cI('#ffd070'));
    return tOut(S,20,25); }
  if(f.k==='hexboard'){ const S=PS(46,28), Tp=roomRamp('#5a3c22'), L=roomRamp('#3a2616'), G=cIR(['#8a5a2a','#caa05a','#e2d2a4','#b9886a']);
    pR(S,20,14,6,10,L[2]); pR(S,15,23,16,2,L[1]); psDisc(S,23,10,21,9,(nx,ny,x,y)=>{ const r=nx*nx+ny*ny; return r>0.82?Tp[ny>0?1:2]:(r>0.7?cI('#2a4a2a'):Tp[clamp(Math.floor(3.2-(nx*0.5+ny*0.7)+bayV(x,y)*0.3),2,5)]); });
    const hx=(cx,cy,c)=>{ for(let j=-2;j<=2;j++) for(let i=-3;i<=3;i++){ if(Math.abs(i)+Math.abs(j)*0.9>3.4) continue; psP(S,cx+i,cy+j,j===-2?G[2]:c); } };
    hx(23,10,G[2]); for(let r=0;r<6;r++){ const a=(30+60*r)*Math.PI/180; hx(Math.round(23+Math.cos(a)*7),Math.round(10+Math.sin(a)*4.6),r%2?G[1]:G[3]); }
    pR(S,6,6,4,5,cI('#e8e0d0')); pR(S,7,7,2,1,cI('#c8302a')); pR(S,36,11,4,5,cI('#e8e0d0')); pR(S,37,13,1,2,cI('#1a1a28')); pR(S,40,4,2,4,cI('#f4efe0')); psP(S,40,3,cI('#ffd070'));
    return tOut(S,23,27); }
  if(f.k==='bed'){ const S=PS(38,50), Wd=roomRamp('#6e4a2c'), Sh=cIR(['#b8c4dc','#dde6f6','#f4f8ff']), Q=[roomRamp('#8aa0d0'),roomRamp('#c86a5a'),roomRamp('#e8c86a'),roomRamp('#6aa07a')];
    pR(S,0,0,38,10,Wd[2]); pR(S,0,0,38,2,Wd[4]); pR(S,2,2,34,7,Wd[3]); pR(S,0,10,38,38,Wd[1]);
    pR(S,3,10,32,12,Sh[1]); pR(S,5,11,12,8,Sh[2]); pR(S,21,11,12,8,Sh[2]); pR(S,5,18,12,1,Sh[0]); pR(S,21,18,12,1,Sh[0]);
    for(let y=22;y<46;y++) for(let x=3;x<35;x++){ const q=Q[(Math.floor(x/8)+Math.floor((y-22)/8))%4]; psP(S,x,y,(x%8===0||(y-22)%8===0)?q[1]:q[x%8<2?4:3]); }
    pR(S,3,22,32,2,Sh[2]); pR(S,0,46,38,4,Wd[2]); pR(S,0,46,38,1,Wd[4]);
    return tOut(S,19,49); }
  if(f.k==='desk'){ const S=PS(44,28), Wd=roomRamp('#5a3c22');
    pR(S,0,4,44,6,Wd[3]); pR(S,0,4,44,1,Wd[5]); pR(S,0,9,44,1,Wd[1]); pR(S,2,10,6,16,Wd[2]); pR(S,36,10,6,16,Wd[1]); pR(S,9,10,26,5,Wd[2]); psP(S,21,12,cI('#caa05a'));
    pR(S,12,1,10,6,cI('#e8e2cc')); pR(S,14,2,6,1,cI('#a89878')); pR(S,14,4,5,1,cI('#a89878')); pR(S,26,2,3,4,cI('#1a1a24')); psLine(S,27,-0,31,4,cI('#f4f4f4'),1);
    pR(S,35,1,2,5,cI('#f4efe0')); psP(S,35,0,cI('#ffd070')); return tOut(S,22,27); }
  if(f.k==='shelf'){ const S=PS(28,46), Wd=roomRamp('#4a3320'), cols=['#7a4a5a','#4a6a52','#5a6a8a','#8a6a3a','#6a4a7a','#9a3a2a'];
    pR(S,0,0,28,46,Wd[2]); pR(S,0,0,28,2,Wd[4]); pR(S,0,0,2,46,Wd[3]); pR(S,26,0,2,46,Wd[1]);
    for(const sy of [3,17,31]){ pR(S,2,sy+11,24,2,Wd[4]); let x=3; while(x<24){ const bw=2+((x*3+sy)%3), bh=8+((x+sy)%3), c=roomRamp(cols[(x*5+sy)%cols.length]); pR(S,x,sy+11-bh,bw,bh,c[3]); pR(S,x,sy+11-bh,1,bh,c[4]); psP(S,x,sy+13-bh,cI('#e8d8a8')); x+=bw; if((x+sy)%11===0){ pR(S,x,sy+5,4,6,cI('#3a6a3a')); psP(S,x+1,sy+4,cI('#6ab83e')); x+=5; } } }
    return tOut(S,14,45); }
  if(f.k==='rug'){ const w=3*TS, h=2*TS, S=PS(w,h), R=roomRamp('#7a3b4a'), G=cIR(['#8a6424','#caa05a']), Bl=roomRamp('#2e4a6a');
    for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const e=Math.min(x,y,w-1-x,h-1-y); let c; if(e<2) c=G[e]; else if(e<4) c=R[1]; else if(e<5) c=G[1]; else { const dx=Math.abs(x-w/2)/(w/2), dy=Math.abs(y-h/2)/(h/2); c=(dx+dy<0.5)?(dx+dy<0.25?G[1]:Bl[3]):R[((x>>2)+(y>>2))%2?3:2]; } psP(S,x,y,c); }
    for(let x=1;x<w;x+=2){ psP(S,x,-0,G[1]); } return psCv(S,w>>1,h>>1); }
  if(f.k==='bench'){ const w=64, S=PS(w,22), Wd=roomRamp('#6a4428');   // a long settle against the back wall: its back, its seat, its legs
    pR(S,0,0,w,8,Wd[2]); pR(S,0,0,w,1,Wd[4]); for(let x=0;x<w;x+=9) pR(S,x,1,1,7,Wd[1]); pR(S,0,8,w,5,Wd[3]); pR(S,0,8,w,1,Wd[5]); pR(S,0,12,w,2,Wd[1]);
    for(const lx of [2,w>>1,w-4]) pR(S,lx,14,2,7,Wd[1]); pR(S,0,0,2,21,Wd[2]); pR(S,w-2,0,2,21,Wd[1]); return tOut(S,w>>1,21); }
  if(f.k==='stool'){ const S=PS(12,13), Wd=roomRamp('#6a4428');   // a bar stool: a round seat on three legs
    psDisc(S,6,3,5.4,2.6,(nx,ny)=>Wd[ny<-0.2?5:ny<0.4?4:2]); pR(S,2,5,1,7,Wd[1]); pR(S,9,5,1,7,Wd[1]); pR(S,5,6,2,6,Wd[2]); pR(S,2,9,8,1,Wd[1]); return tOut(S,6,12); }
  if(f.k==='crates'){ const S=PS(30,30), C=roomRamp('#9a7040'), cr=(x,y,w,h)=>{ pR(S,x,y,w,h,C[3]); pR(S,x,y,w,1,C[5]); pR(S,x,y,1,h,C[4]); pR(S,x+w-1,y,1,h,C[1]); pR(S,x,y+h-1,w,1,C[1]);   // a stack of crates: planked, braced
      for(let j=3;j<h-1;j+=4) pR(S,x+1,j+y,w-2,1,C[2]); psLine(S,x+1,y+h-2,x+w-2,y+1,C[2],1); };
    cr(1,15,15,14); cr(15,17,14,12); cr(6,2,14,13); pR(S,9,6,6,3,cI('#3a2a1a')); return tOut(S,15,29); }
  if(f.k==='map'){ const S=PS(46,40), Wd=roomRamp('#5a3c22'), Pp=cIR(['#b8a070','#e3d5a8','#f4ead0']), Sea=cI('#7a9ab8'), Ld=cIR(['#8a9a5a','#b8b87a']);
    pR(S,2,16,4,22,Wd[1]); pR(S,40,16,4,22,Wd[1]); pR(S,0,10,46,8,Wd[3]); pR(S,0,10,46,1,Wd[5]);
    for(let y=0;y<16;y++) for(let x=3;x<43;x++){ const e=y<1||y>14||x<4||x>41; let c=e?Pp[0]:Pp[1]; if(!e){ const n=vnoise(x/5,y/4+3); if(n>0.58) c=Ld[n>0.66?1:0]; else if(n<0.4) c=Sea; if(tH(x*3,y)<0.02) c=Pp[2]; } psP(S,x,y+1,c); }
    pR(S,20,5,2,2,cI('#c0202a')); psP(S,30,9,cI('#c0202a')); psLine(S,21,6,30,9,cI('#6a3a1e'),1);
    return tOut(S,23,38); }
  if(f.k==='dbox'){ const S=PS(20,26), Wd=roomRamp('#5a3a1e'), Br=cIR(['#8a6424','#d8a840','#ffe08a']), Gd=cIR(['#a87818','#ffd23f','#fff4c0']);   // (C7c §7.8) the DONATION BOX: a walnut box on a turned post — a brass slot on its lid, coins behind its little window
    pR(S,8,15,4,9,Wd[2]); pR(S,8,15,1,9,Wd[4]); pR(S,5,23,10,3,Wd[1]); pR(S,5,23,10,1,Wd[3]);                     // the post & its foot
    pR(S,1,3,18,12,Wd[3]); pR(S,1,3,18,1,Wd[5]); pR(S,1,3,1,12,Wd[4]); pR(S,18,3,1,12,Wd[1]); pR(S,1,14,18,1,Wd[1]);   // the box
    pR(S,0,1,20,3,Wd[2]); pR(S,0,1,20,1,Wd[4]); pR(S,6,1,8,2,Br[0]); pR(S,7,1,6,1,cI('#140c06'));                 // the lid · the brass coin slot
    pR(S,4,6,12,6,cI('#1a1410')); pR(S,4,6,12,1,cIA('#dcf0ff',0.4)); for(const [cx,cy] of [[6,10],[9,9],[12,10],[8,11],[11,11],[14,9]]){ psP(S,cx,cy,Gd[1]); psP(S,cx+1,cy,Gd[0]); } psP(S,9,9,Gd[2]);   // its window: the coins inside
    pR(S,6,12,8,2,Br[1]); pR(S,6,12,8,1,Br[2]);                                                                   // a brass plate
    return tOut(S,10,25); }
  return tOut(PS(2,2),1,1); }); }
function plinthSpr(V,big,cur,cur2){ return tProp(V,'pl'+(big?1:0)+'_'+cur+'_'+(cur2==null?'':cur2), ()=>{ const w=big?30:20, S=PS(w+2,big?48:40), St=roomRamp('#6e6680'), Tp=roomRamp('#8a84a0'), Vl=roomRamp('#6a1a2a'), Gl=cIR(['#6a9ab8','#9fc6e6','#e8f6ff']), Br=cIR(['#8a6424','#d8a840']);
  const H0=big?20:16, py=S.h-H0-2;                                                                                // the pedestal
  pR(S,1,py,w,H0,St[3]); pR(S,1,py,2,H0,St[4]); pR(S,w-1,py,2,H0,St[1]); pR(S,0,py-3,w+2,4,Tp[4]); pR(S,0,py-3,w+2,1,Tp[5]); pR(S,0,S.h-3,w+2,3,St[2]); pR(S,0,S.h-3,w+2,1,St[4]);
  pR(S,(w>>1)-3,py+5,8,3,Br[1]); pR(S,(w>>1)-3,py+7,8,1,Br[0]);                                                   // the brass placard
  const gy0=2, gh=py-3-gy0, gx0=2, gw=w-2;                                                                        // the glass case
  pR(S,gx0+1,gy0+1,gw-2,py-3-gy0-1,cIA('#1e2a3a',0.55)); pR(S,gx0+1,gy0+1,gw-2,2,cIA('#dcf0ff',0.45));              // (dark glass behind the find, a sheen along its top)
  pR(S,gx0+2,py-6,gw-4,3,Vl[3]); pR(S,gx0+2,py-6,gw-4,1,Vl[4]);                                                   // velvet
  const drawC=(ci,cx)=>{ const n='cur'+ci; const [iw,ih]=pxiDim(n); if(iw) pxiInto(S,n,Math.round(cx-iw/2),py-6-ih+1); };
  if(cur!=null && cur>=0){ if(cur2!=null){ drawC(cur,w*0.32); drawC(cur2,w*0.7); } else drawC(cur,w/2+1); }
  for(let y=gy0;y<py-3;y++){ psP(S,gx0,y,Gl[1]); psP(S,gx0+gw-1,y,Gl[0]); } for(let x=gx0;x<gx0+gw;x++){ psP(S,x,gy0,Gl[2]); psP(S,x,gy0+1,Gl[1]); }
  for(let j=0;j<Math.min(6,gh-4);j++) psP(S,gx0+3+j,gy0+3+j,Gl[2]); for(let j=0;j<3;j++) psP(S,gx0+3+j,gy0+10+j,Gl[1]);   // the glass's glints
  const o=tOut(S,(w>>1)+1,S.h-1); o.gy=py-8; return o; }); }
/* (C7c §7.8) THE WALL CASES — glass-fronted walnut cabinets, one cell a find (its pixel icon once donated · a faint shape till then):
   minerals in one long case under the back wall's window (10 in a row) · fossils & artifacts in tall cases against the side walls (2 × 4, a brass plaque in the 8th) */
function pxiSil(S,n,x0,y0,c){ const A=PXI_ART[n]; if(!A) return; const rows=typeof A.a==='string'?PXI_ART[A.a].a:A.a;   // an icon's shape in one colour (a find the hall still lacks)
  for(let y=0;y<rows.length;y++) for(let x=0;x<rows[y].length;x++) if(rows[y][x]!=='.' && A.p[rows[y][x]]) psP(S,x0+x,y0+y,c); }
function caseSpr(V,f){ const C=museumCases().find(c=>c.s===f.set); return tProp(V,'mc'+f.set+C.L.map(x=>x.got?1:0).join(''), ()=>{
  const back=f.set==='min', CW=11, cols=back?10:2, rows=back?1:4, iw=cols*CW+cols-1, ih=rows*CW+rows-1, top=back?3:5, base=back?10:8, w=iw+6, h=top+1+ih+1+base;
  const S=PS(w,h), Wd=roomRamp('#6a4428'), Vl=roomRamp(back?'#24365a':f.set==='fos'?'#5a4a32':'#5a1a28'), Br=cIR(['#8a6424','#d8a840','#ffe08a']), Gl=cIA('#dcf0ff',0.4);
  pR(S,0,0,w,h,Wd[2]); pR(S,0,0,w,1,Wd[4]); pR(S,0,1,w,top-1,Wd[3]); pR(S,0,top-1,w,1,Wd[1]);                 // the walnut carcass · its cornice
  if(!back){ pR(S,(w>>1)-4,0,9,2,Wd[4]); pR(S,(w>>1)-2,-0,5,1,Br[1]); }                                          // (a tall case: a crest on its cornice)
  pR(S,0,top,2,h-top,Wd[3]); pR(S,w-2,top,2,h-top,Wd[1]);                                                       // its stiles
  const gx=3, gy=top+1;
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){ const i=r*cols+c, x=gx+c*(CW+1), y=gy+r*(CW+1), o=C.L[i];
    pR(S,x,y,CW,CW,Vl[2]); pR(S,x,y+CW-1,CW,1,Vl[1]); pR(S,x,y,CW,1,Vl[3]);                                     // velvet in each cell
    if(o){ const n=matPx('f:'+o.q), [dw,dh]=pxiDim(n), ix=x+((CW-dw)>>1), iy=y+Math.max(0,CW-1-dh);
      if(o.got) pxiInto(S,n,ix,iy); else pxiSil(S,n,ix,iy,Vl[1]); }
    else { pR(S,x+1,y+2,CW-2,CW-4,Br[1]); pR(S,x+1,y+2,CW-2,1,Br[2]); pR(S,x+1,y+CW-3,CW-2,1,Br[0]);           // the 8th cell: the set's brass plaque
      const pn=MUS_SETS.find(q=>q[0]===f.set)[3], [pw,ph]=pxiDim(pn); pxiSil(S,pn,x+((CW-pw)>>1),y+((CW-ph)>>1),Br[0]); }
    if(c<cols-1) pR(S,x+CW,y,1,CW,Wd[back?3:2]); if(r<rows-1) pR(S,x,y+CW,CW,1,Wd[2]); }                         // the glazing bars
  pR(S,gx,gy,iw,1,Gl); for(let j=0;j<Math.min(ih,9);j++) psP(S,gx+2+j,gy+1+j,Gl); if(back) for(let j=0;j<5;j++) psP(S,gx+iw-12+j,gy+2+j,Gl);   // the glass: a sheen along its top, a glint
  const ly=gy+ih; pR(S,0,ly,w,2,Wd[4]); pR(S,0,ly+1,w,1,Wd[2]);                                                 // the sill
  pR(S,2,ly+2,w-4,base-2,Wd[2]); pR(S,2,ly+2,w-4,1,Wd[1]);                                                      // the base: drawers (the long case) or a plinth
  if(back){ for(const dx of [0.25,0.5,0.75]){ const px=Math.round(w*dx); pR(S,px-6,ly+3,12,4,Wd[3]); pR(S,px-1,ly+4,3,1,Br[1]); psP(S,px,ly+4,Br[2]); } }
  else { pR(S,4,ly+3,w-8,2,Wd[3]); pR(S,(w>>1)-3,ly+3,7,2,Br[1]); pR(S,(w>>1)-2,ly+3,5,1,Br[2]); }                // (a brass label under the glass)
  pR(S,0,h-2,3,2,Wd[1]); pR(S,w-3,h-2,3,2,Wd[1]);                                                               // feet
  const o=tOut(S,w>>1,h-1); return o; }); }
/* the room, a frame */
const FURN_BASE={bar:13, bottles:10, fire:12, kegs:14, table:11, hexboard:11, bed:22, desk:11, shelf:19, map:15, bench:4, stool:3, crates:12, mcase:1, dbox:1};
function flameSpr(f,big){ return tSpr('fl'+f+(big?1:0), ()=>{ const w=big?18:5, h=big?16:5, S=PS(w,h), C=cIR(['#c8401a','#ff8a2a','#ffd050','#fff4c0']);   // a hearth's (or a candle's) flame, 3 frames
  if(!big){ psP(S,2,4-(f===1?1:0),C[1]); psP(S,2,3-(f===1?1:0),C[2]); psP(S,2,2,C[3]); if(f===2) psP(S,1,3,C[1]); return psCv(S,2,4); }
  for(let k=0;k<5;k++){ const cx=3+k*3+(f===k%3?1:0), ht=6+((k*7+f*5)%7)+(k===2?4:0); for(let y=0;y<ht;y++){ const t=y/ht, hw=Math.max(0,(1-t)*2.2); for(let x=Math.floor(cx-hw);x<=Math.ceil(cx+hw);x++){ const e=Math.abs(x-cx)/Math.max(0.5,hw+0.5); psP(S,x,h-1-y,C[clamp(Math.floor(3.2-e*2-t*1.6),0,3)]); } } }
  return psCv(S,w>>1,h-1); }); }
function drawRoomT(){ const I=INT, V=roomPrep(), TS=I.TS; V.fr++;
  TOX=Math.round(IW/2-icamX); TOY=Math.round(IH/2-icamY);
  pctx.fillStyle='#070504'; pctx.fillRect(0,0,IW,IH);
  pctx.drawImage(V.bg,TOX,TOY-V.ext);
  const dayK=1-nightK();
  for(const w of V.win){ const X=TX(w[0]), Y=TY(w[1]), ww=w[2], wh=w[3];                                  // the windows: the sky outside (day, dusk, night)
    pctx.fillStyle='#4a3020'; pctx.fillRect(X-2,Y-2,ww+4,wh+4); const sky=env.L>0.62?'#9ccbee':env.L>0.45?'#e8a878':'#1a2448'; pctx.fillStyle=sky; pctx.fillRect(X,Y,ww,wh);
    pctx.fillStyle=env.L>0.62?'#cfe6fa':env.L>0.45?'#f4d0a0':'#2a3868'; pctx.fillRect(X,Y+wh-5,ww,5);
    if(env.L<=0.45){ pctx.fillStyle='#e8f0ff'; for(let s=0;s<4;s++) pctx.fillRect(X+2+((s*7+3)%(ww-3)),Y+2+((s*5)%(wh-8)),1,1); }
    if(env.storm>0.3){ pctx.fillStyle='rgba(60,70,90,0.6)'; pctx.fillRect(X,Y,ww,wh); }
    pctx.fillStyle='#4a3020'; pctx.fillRect(X+(ww>>1),Y,1,wh); pctx.fillRect(X,Y+(wh>>1),ww,1); pctx.fillStyle='#8a6a40'; pctx.fillRect(X-3,Y+wh+2,ww+6,2); }
  for(const f of I.furn) if(f.k==='rug'){ const s=furnSpr(V,f); pctx.drawImage(s.cv,TX(f.x)-s.ax,TY(f.y)-s.ay); }
  TDRN=0;
  for(const f of I.furn){ if(f.k==='rug') continue; tdr(f.y+(FURN_BASE[f.k]||10),11,f,0); }
  for(const d of I.disp) tdr(d.y+(d.big?12:8),12,d,0);
  for(const p of (I.people||[])) tdr(p.kind==='keep'?p.y-33:p.y,13,p,0);
  for(const a of scnActorsHere()) tdr(a.y,40,a,0);   // (INTROSTORY C3)
  tdr(player.y,6,null,0);
  const D=TDR; for(let i=1;i<TDRN;i++){ const o=D[i]; let j=i-1; while(j>=0 && D[j].y>o.y){ D[j+1]=D[j]; j--; } D[j+1]=o; }
  for(let i=0;i<TDRN;i++){ const o=D[i];
    if(o.k===11){ const f=o.a, s=f.k==='mcase'?caseSpr(V,f):furnSpr(V,f), X=TX(f.x), Y=TY(f.y+(FURN_BASE[f.k]||10)); pctx.drawImage(s.cv,X-s.ax,Y-s.ay);   // (C7c: a wall case bakes per what it holds)
      if(f.k==='fire' && !f.cold){ const fl=flameSpr(Math.floor(itime*8)%3,true); pctx.drawImage(fl.cv,X-fl.ax,Y-4-fl.ay); } }
    else if(o.k===12){ const d=o.a, s=plinthSpr(V,!!d.big,d.item?d.item.cur:-1,d.item&&d.item.cur2!=null?d.item.cur2:null); pctx.drawImage(s.cv,TX(d.x)-s.ax,TY(d.y+(d.big?12:8))-s.ay); }
    else if(o.k===13){ const p=o.a, dx=player.x-p.x, dy=player.y-p.y, near=dx*dx+dy*dy<70*70; const dir=p.kind==='keep'?0:near?folkDir(dx,dy):0; drawFolk(p.x,p.kind==='keep'?p.y-33:p.y,p.look,dir,0); }   // (the barkeep stands behind his bar)
    else if(o.k===40) scnDrawActor(o.a);
    else if(o.k===6) drawFolk(player.x,player.y,playerLook(),folkDir(player.fx,player.fy),walkFr(player.moving,player.wph||0)); }
  roomLightPass(V);
  if(I.people && ETUNE.folkMarks>0) for(const p of I.people) if(p.fk) folkMarkAt(TX(p.x),TY(p.kind==='keep'?p.y-33:p.y)-29,p.fk.d,p.x*0.1);   // (💬 / ❗ over the folk in the room)
  if(V.fade==null) V.fade=8; if(V.fade>0){ pctx.fillStyle='rgba(6,4,3,'+(V.fade/8).toFixed(3)+')'; pctx.fillRect(0,0,IW,IH); V.fade--; }   // (stepping in: a breath of dark while the room is laid out)
}
function roomLightPass(V){ const I=INT, A=LGT.amb, g=LGT.g, cv=LGT.cv, nk=nightK(), k=I.kind, st=clamp(env.storm*0.6,0,1);
  const Dy=k==='museum'?[0.92,0.9,0.86]:k==='tavern'?[0.76,0.68,0.6]:[0.86,0.8,0.72], Nn=k==='museum'?[0.34,0.35,0.46]:k==='tavern'?[0.36,0.31,0.34]:[0.34,0.31,0.37], nm=TUNE.roomNight/0.42;
  for(let c=0;c<3;c++) A[c]=clamp(lerp(Dy[c],Nn[c]*nm,nk)*(1-0.25*st),0,1); LGT.dk=1-(0.3*A[0]+0.59*A[1]+0.11*A[2]); LGT.on=TUNE.townLight>0;
  if(!LGT.on) return;
  LGT.n=0; const Vv=LGT.v; Vv[0]=-1e5; Vv[1]=1e5; Vv[2]=-1e5; Vv[3]=1e5; const rk=TUNE.roomLight, fk=Math.sin(itime*9.3)*0.06+Math.sin(itime*14.1+1)*0.05;
  for(const f of I.furn){ const b=f.y+(FURN_BASE[f.k]||10);
    if(f.k==='fire' && !f.cold){ lAdd(f.x,b-16,130*rk*(1+fk),1.05,1); lAdd(f.x,b-6,46,0.7,10); }
    else if(f.k==='table') lAdd(f.x,f.y-4,34*rk,0.7*(1+fk),10);
    else if(f.k==='hexboard') lAdd(f.x+17,f.y-6,44*rk,0.85*(1+fk),2);
    else if(f.k==='desk') lAdd(f.x+13,f.y-10,42*rk,0.8*(1+fk),10);
    else if(f.k==='bar') lAdd(f.x,f.y-4,70*rk,0.55,10);
    else if(f.k==='mcase') lAdd(f.x,b-(f.set==='min'?14:34),f.set==='min'?62:40,0.5,11); }   // (C7c: the cases glow a little, like the plinths)
  for(const q of V.deco){ if(q[0]==='lantern') lAdd(q[1],q[2]+10+V.ext-V.ext,70*rk,0.85,10); else if(q[0]==='sconce') lAdd(q[1],q[2]-2,56*rk,0.7,10); }
  if(k==='museum') for(const d of I.disp) lAdd(d.x,d.y-6,d.big?40:26,d.item?0.55:0.3,11);
  const day=clamp(1-nk,0,1)*(1-st*0.7); if(day>0.1) for(const w of V.win){ lBeam(w[0]+w[2]/2+10,44+w[3],56,w[2]*0.55,0.3*day,11); lAdd(w[0]+w[2]/2+8,40+w[3],36,0.35*day,11); }
  if(cv.width!==IW||cv.height!==IH){ cv.width=IW; cv.height=IH; }
  g.globalCompositeOperation='source-over'; g.globalAlpha=1; g.fillStyle='rgb('+Math.round(A[0]*255)+','+Math.round(A[1]*255)+','+Math.round(A[2]*255)+')'; g.fillRect(0,0,IW,IH);
  g.globalCompositeOperation='lighter'; lDraw(g,1,0);
  g.globalAlpha=1; g.globalCompositeOperation='darken'; g.fillStyle='rgb(255,232,196)'; g.fillRect(0,0,IW,IH); g.globalCompositeOperation='source-over';
  pctx.globalCompositeOperation='multiply'; pctx.drawImage(cv,0,0); pctx.globalCompositeOperation='source-over';
  // what glows through: the hearth, candles, lanterns, the ghost-light in its bottle
  for(const f of I.furn){ const b=f.y+(FURN_BASE[f.k]||10);
    if(f.k==='fire' && !f.cold){ const fl=flameSpr(Math.floor(itime*8)%3,true); pctx.globalAlpha=0.85; pctx.drawImage(fl.cv,TX(f.x)-fl.ax,TY(b)-4-fl.ay); pctx.globalAlpha=1; }
    const cand = f.k==='table'?[f.x-1,f.y-10] : f.k==='hexboard'?[f.x+17,f.y-13] : f.k==='desk'?[f.x+13,f.y-16] : null;
    if(cand){ const fl=flameSpr(Math.floor(itime*7+f.x)%3,false); pctx.drawImage(fl.cv,TX(cand[0])-fl.ax,TY(cand[1])-fl.ay); } }
  for(const q of V.deco){ if(q[0]==='lantern'){ pctx.fillStyle='#ffd070'; pctx.fillRect(TX(q[1])-1,TY(q[2])+8,3,4); pctx.fillStyle='#fff4c8'; pctx.fillRect(TX(q[1]),TY(q[2])+9,1,2); } else if(q[0]==='sconce'){ const f=Math.floor(itime*7)%3; pctx.fillStyle='#ffc050'; pctx.fillRect(TX(q[1])-1,TY(q[2])-4-(f===1?1:0),2,3); pctx.fillStyle='#fff4c8'; pctx.fillRect(TX(q[1]),TY(q[2])-3,1,1); } }
  if(k==='museum') for(const d of I.disp){ if(!d.item || (d.item.cur!==8 && d.item.cur2!==8)) continue; const s=plinthSpr(V,!!d.big,d.item.cur,d.item.cur2!=null?d.item.cur2:null), X=TX(d.x)-s.ax, Y=TY(d.y+(d.big?12:8))-s.ay+s.gy, cx=d.item.cur2===8?Math.round(s.w*0.7):d.item.cur2!=null?Math.round(s.w*0.32):(s.w>>1)+1;   // the ghost-light breathes in its bottle
    pctx.globalCompositeOperation='lighter'; pctx.globalAlpha=0.3+0.18*Math.sin(itime*2); pctx.fillStyle='#4ad8ff'; pctx.fillRect(X+cx-3,Y-4,6,6); pctx.globalAlpha=0.5; pctx.fillRect(X+cx-1,Y-2,3,3); pctx.globalAlpha=1; pctx.globalCompositeOperation='source-over'; } }
/* new pixel icons: the tavern's mug · the fourteen curios the Explorer brings home (the museum's exhibits) */
Object.assign(PXI_ART,{
  mug:{p:{K:'#1a0e04',W:'#fff4dc',w:'#d8c8a8',Y:'#e8a030',y:'#b0701c',G:'#caa05a'}, a:['.KKKKKK...','KWWwWWWK..','KYWWWWYKKK','KYYYYYYKGK','KYyYYyYKGK','KYyYYyYKKK','KYYYYYYK..','.KKKKKK...']},
  cur0:{p:{K:'#2a2418',W:'#f2ead2',s:'#c8b890',d:'#3a3a4a'}, a:['....KKK...','...KWWWK..','..KWWsWK..','..KWsWWK..','.KWWWdWK..','.KWdWWWK..','.KWWsWsK..','KWWWWWWK..','KsWWdWK...','KssWWK....','.KKKK.....']},
  cur1:{p:{K:'#2a1a04',Y:'#e0a830',y:'#a87818',W:'#bfefff'}, a:['....KK....','...KYYK...','..KYKKYK..','.KYK..KYK.','.KY.KK.YK.','KYK.KWK.YK','KYYYYYYYYK','.KKKyyKKK.','...KyK....','...KKK....']},
  cur2:{p:{K:'#0a1a10',G:'#5ab87a',g:'#2e7a4a',W:'#f4f0e8'}, a:['..KKKKK..','.KGGGGGK.','KGWKGKWGK','KGGGGGGgK','.KGgggGK.','KGGKGKGgK','KGgGGGggK','.KGGKGgK.','.KGgKggK.','.KKKKKKK.']},
  cur3:{p:{K:'#1a0c04',R:'#8a3a22',r:'#5a2414',D:'#1a1410',W:'#e8dcb8'}, a:['KKKKKKKK..','KRRRRRRDDK','KRrRRRDDK.','KRrRWWRDK.','KRrRRRRDK.','KRrRRRRRDK','KRrRRRRRRK','KWWWWWWWWK','.KKKKKKKKK']},
  cur4:{p:{K:'#0a0c14',S:'#5a6070',s:'#2e3240',W:'#dff4ff'}, a:['...K......','..KSK.....','..KSSK....','.KSsSSK...','.KSsWsSK..','KSssSsSK..','KSsSsssSK.','.KSssSsSK.','..KKSSsSK.','....KKKK..']},
  cur5:{p:{K:'#2a0806',R:'#e8483a',r:'#a02a22',W:'#ffd0c8'}, a:['.K...K...K.','KRK.KRK.KRK','KRRKRRRKRRK','KRrRRWRRrRK','KRRRRRRRRRK','KrRrRrRrRrK','.KKKKKKKKK.']},
  cur6:{p:{K:'#1a0e04',B:'#8a5a34',b:'#5a3a1e',Y:'#ffd23f',y:'#c8901a'}, a:['KKKKKKKKK.','KBBBBBBBK.','KbbbbbbbK.','KKKKKKKKKK','KYyYyYyYK.','KBBBBBBBBK','KBbBBBBbBK','KBBBYYBBBK','KbbbbbbbbK','.KKKKKKKK.']},
  cur7:{p:{K:'#2a1a08',P:'#e8d8a8',p:'#b8a070',b:'#4a7aa8',r:'#c8302a'}, a:['KKKKKKKKKKK','KPPPPPPPPPK','KPpPPbPPPPK','KPPbbbPPrPK','KPPPbPPPPPK','KPPPPPbbPPK','KPrPPPPbPPK','KPPPPPPPPpK','KKKKKKKKKKK']},
  cur8:{p:{K:'#081418',c:'#8a6a40',G:'#3a7a8a',C:'#8de9ff',W:'#ffffff'}, a:['...KK...','...KcK..','..KKKK..','.KGGGGK.','KGCWCCGK','KGCCWCGK','KGCCCCGK','KGGCCGGK','.KGGGGK.','..KKKK..']},
  cur9:{p:{K:'#2a2014',W:'#e8dcc4',s:'#b8a888'}, a:['..KKKK...','.KWWWWK..','KWWsWWK..','KWKWWWK..','.KWWsK...','..KWWK...','.KWWWWKK.','KWWsWWWWK','KWsWWWsWK','.KKKKKKK.']},
  cur10:{p:{K:'#1a0c04',D:'#1a1a28',w:'#a8b0d0',Y:'#ffd23f',R:'#8a2a4a',r:'#5a1a2e'}, a:['...KKK...','..KDDwK..','..KDDDK..','...KYK...','..KY.YK..','..KY.YK..','...KYK...','.KRRRRRK.','KRrRRRrRK','.KKKKKKK.']},
  cur11:{p:{K:'#0a0810',O:'#3a3448',o:'#1a1624',W:'#8a84a0',R:'#e8483a'}, a:['..KKKKK..','.KOOOOOK.','KOoWoWoOK','KOoooooOK','KOWoRoWOK','KOooRooOK','KOoWRWoOK','.KOOOOOK.','..KKKKK..']},
  cur12:{p:{K:'#14161c',S:'#c8d0dc',G:'#7fd6e8',W:'#f2ead2',b:'#bfb190'}, a:['....K....','...KSK...','..KSSSK..','.KSGGGSK.','.KSWbWSK.','.KSGGGSK.','..KSSSK..','...KSK...','..KSSSK..','.KKKKKKK.']},
  cur13:{p:{K:'#061a14',T:'#3ab89a',t:'#1a6a5a',W:'#b8ffe8'}, a:['...KKKK...','..KTTtTK..','.KTtTTtTK.','KTTtWtTTtK','KTtTTtTTtK','KtTTtTTtTK','.KtTTtTtK.','..KtTTtK..','...KtK....','....K.....']} });
