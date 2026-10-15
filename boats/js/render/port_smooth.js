"use strict";
/* FILE: js/render/port_smooth.js
THE OLD SMOOTH PORT RENDERER: original lines 33868-34354 (build 5109cd5), moved verbatim, in place directly after
  js/render/rooms.js (original lines 33617-33867) and before chatBox (original line 34355 (build 5109cd5), still inline).
What it is: the pre-pixel vector drawing of a harbour (the "rendering the town" block), the fallback used only when
  TUNE.townPix is 0 (townPixOn false; the default 1 draws ports with drawTown in js/render/towns.js). It holds the port
  palette PORT_PAL and draws the tiles, canopies, mooring posts, your boat, the dinghies, the y-sorted buildings, props,
  villagers, crew and you, and the gulls.
Entry points: drawPortWorld (frameInner, mode port, when townPixOn is false). PORT_PAL is also read at runtime by genPort
  (plaster and awning colours, still inline, earlier) and by the pixel painters bldPaint, dressMarket, dressMuseum and
  stallSpr (js/render/towns.js) and roomDecoPaint (js/render/rooms.js).
Globals it owns (all const or function): PORT_PAL, drawPortWorld, drawBuilding, shade, drawRoof, drawMarketFront,
  drawWrightYard, drawTavernFront, drawMuseumFront, drawHomeFront, drawFlowerBox, drawTradeSign, drawGarlands (no callers),
  drawProp, drawTownProp, drawVillager.
Main globals it reads from elsewhere, at runtime only: PRT and the PT_* tile consts (PT_GRASS, PT_STREET, PT_DOCK,
  PT_WATER, PT_BLDG, PT_TREE), islScale, iw2p, icamX, icamY, pctx, IW, IH, itime, env, hash2, waterColor, clamp, TAU,
  livCols, SHIP, player, crew, drawCrewAshore (still inline, later) and drawExplorerSprite (js/render/crawl_overlays.js).
Load-time statements: one literal const, PORT_PAL (original lines 33869-33882 (build 5109cd5)); everything else is a
  function declaration. No call at load.
*/
/* ---- rendering the town ---- */
const PORT_PAL={ grass:['#5a9a4a','#529145','#63a752','#4c8a40'], tuft:'#7cc663', flowers:['#ffd86b','#ff9fb2','#eef6ff'],
  cobble:['#8d8d96','#83838c','#97979e','#7a7a84'], plank:['#a8784a','#9c6e42','#b48252'], seam:'#6e4a28',
  canopy:['#2c5a2a','#356d34','#3e7e3d'], hi:'#54a24d', under:'#1d3a1b', under2:'#234524',
  wallA:'#ddcba2', wallB:'#cdb588', beam:'#6e4a28', roofs:[['#b14b3a','#c25a48','#8e3c2e'],['#5f7390','#6e82a0','#4c5d78']],
  door:'#4e3014', sign:'#8a5c2e',
  stone:['#cfc8b6','#c2bba8','#d8d2c2'], stoneSeam:'#a89f88', stoneDk:'#9a917c',
  thatch:['#caa44e','#b8923e','#d8b45e'], thatchDk:'#8a6e2e',
  tileR:['#b1503a','#9c4030','#c66048'], tileDk:'#7a2f22',
  slate:['#586070','#4a5060','#646c7e'], slateDk:'#363c48',
  plaster:['#e7dab9','#dcc6a0','#d9b89a','#cdd2c0','#cdbcc8','#d8c6a2'],
  awnings:[['#b8483a','#efe6d2'],['#356a8a','#efe6d2'],['#4a7a52','#efe6d2'],['#9a6a2e','#efe6d2']],
  banner:['#8a2f3a','#2f5a8a','#6a4a8a','#1f6a5a'], brass:'#caa05a', flag:'#ffd23f',
  grassDk:'#3f7a36', grassHi:'#7ec162', pebble:'#9c968c', clover:'#6fb054', dirt:'#7a5e3e' };
function drawPortWorld(){
  const s=islScale(), pal=PORT_PAL, TS=PRT.TS;
  pctx.fillStyle=pal.under; pctx.fillRect(0,0,IW,IH);
  const halfW=(IW/2)/s, halfH=(IH/2)/s;
  const minTX=Math.max(0,((icamX-halfW)/TS|0)-1), maxTX=Math.min(PRT.W-1,((icamX+halfW)/TS|0)+1);
  const minTY=Math.max(0,((icamY-halfH)/TS|0)-2), maxTY=Math.min(PRT.H-1,((icamY+halfH)/TS|0)+1);
  const ts=Math.ceil(TS*s)+1, NW=PRT.W;
  // pass 1 — the ground underfoot
  for(let ty=minTY;ty<=maxTY;ty++)for(let tx=minTX;tx<=maxTX;tx++){
    const t=PRT.tiles[ty*NW+tx];
    const sx=Math.floor((tx*TS-icamX)*s+IW/2), sy=Math.floor((ty*TS-icamY)*s+IH/2);
    const h1=hash2(tx+5,ty+9), h2=hash2(tx*3+7,ty*5+1), h3=hash2(tx*13+5,ty*7+11);
    const cwx=tx*TS+TS/2, cwy=ty*TS+TS/2;
    if(t===PT_WATER){
      const dpt=clamp(0.18+(ty-(PRT.H-5))*0.16,0,1), c2=waterColor(dpt);
      const band=Math.sin(cwy*0.15+itime*1.1+Math.sin(cwx*0.05)*1.3);
      const band2=Math.sin(cwx*0.11-itime*0.8+Math.cos(cwy*0.07)*1.1);          // a cross-swell for depth
      const br=6+(band*0.5+0.5)*13+(band2*0.5+0.5)*7;
      pctx.fillStyle='rgb('+((c2[0]+br)|0)+','+((c2[1]+br)|0)+','+((c2[2]+br*1.05)|0)+')'; pctx.fillRect(sx,sy,ts,ts);
      const cau=Math.sin(cwx*0.4+cwy*0.2-itime*1.6);                            // drifting caustic ripples
      if(cau>0.55){ pctx.fillStyle='rgba(208,238,255,'+(0.09+0.12*(cau-0.55)).toFixed(3)+')'; pctx.fillRect(sx,sy+(h2*ts*0.6)|0,ts,Math.max(1,(ts*0.16)|0)); }
      if(h3>0.82){ pctx.fillStyle='rgba(255,255,255,.5)'; pctx.fillRect(sx+h1*ts*0.7, sy+h2*ts*0.7, 2.5, 1.6); }
      if(h2>0.9){ pctx.fillStyle='rgba(200,235,255,.45)'; pctx.fillRect(sx+h3*ts*0.5, sy+h1*ts*0.4, 1.6, 1.4); }
      const fo=0.3+0.25*Math.sin(itime*2.6+cwx*0.2);
      pctx.fillStyle='rgba(255,255,255,'+fo.toFixed(2)+')';
      if(ty>0&&PRT.tiles[(ty-1)*NW+tx]!==PT_WATER) pctx.fillRect(sx,sy,ts,2.5);
      if(tx>0&&PRT.tiles[ty*NW+tx-1]!==PT_WATER) pctx.fillRect(sx,sy,2.5,ts);
      if(tx<NW-1&&PRT.tiles[ty*NW+tx+1]!==PT_WATER) pctx.fillRect(sx+ts-2.5,sy,2.5,ts);
      continue; }
    if(t===PT_DOCK){
      pctx.fillStyle=pal.plank[(h1*3)|0]; pctx.fillRect(sx,sy,ts,ts);
      pctx.fillStyle=pal.seam; pctx.fillRect(sx,sy+ts-2,ts,2);                       // board seams
      pctx.globalAlpha=0.35; pctx.fillStyle=pal.plank[(h2*3)|0]; pctx.fillRect(sx,sy+(h2*ts*0.5)|0,ts,(ts*0.3)|0); pctx.globalAlpha=1;
      if(h3>0.7){ pctx.fillStyle='#54371e'; pctx.fillRect(sx+2,sy+2,2,2); pctx.fillRect(sx+ts-4,sy+ts-5,2,2); }   // nails
      if(h3<0.08){ pctx.fillStyle='#4e3014'; pctx.beginPath(); pctx.arc(sx+ts*0.5,sy+ts*0.45,2.2,0,TAU); pctx.fill(); }  // a knot
      continue; }
    if(t===PT_STREET){
      pctx.fillStyle=pal.cobble[(h1*4)|0]; pctx.fillRect(sx,sy,ts,ts);
      pctx.fillStyle=pal.cobble[(h2*4)|0]; pctx.beginPath(); pctx.arc(sx+h2*ts*0.7+2, sy+h3*ts*0.7+2, ts*0.16, 0, TAU); pctx.fill();
      pctx.fillStyle=pal.cobble[(h3*4)|0]; pctx.beginPath(); pctx.arc(sx+h3*ts*0.6+2, sy+h1*ts*0.6+2, ts*0.13, 0, TAU); pctx.fill();
      if(h3>0.92){ pctx.fillStyle='#6a8a5a'; pctx.fillRect(sx+h1*ts*0.8, sy+h2*ts*0.8, 2, 2); }   // a weed in the cracks
      continue; }
    if(t===PT_BLDG){ pctx.fillStyle='#241a10'; pctx.fillRect(sx,sy,ts,ts); continue; }   // under the buildings
    // grass (and the trees that stand on it)
    pctx.fillStyle=pal.grass[(h1*4)|0]; pctx.fillRect(sx,sy,ts,ts);
    pctx.globalAlpha=0.5;                                                       // mottled blotches break the hard tile grid
    pctx.fillStyle=pal.grass[(h2*4)|0]; pctx.fillRect(sx+(h2*ts*0.5)|0, sy+(h1*ts*0.5)|0, (ts*0.6)|0, (ts*0.55)|0);
    pctx.fillStyle=pal.grass[(h3*4)|0]; pctx.fillRect(sx, sy+(h3*ts*0.4)|0, (ts*0.5)|0, (ts*0.6)|0);
    pctx.globalAlpha=1;
    pctx.fillStyle=pal.grassDk; pctx.fillRect(sx+(h2*ts*0.82)|0, sy+(h3*ts*0.85)|0, 2, 2);    // fine specks of depth
    pctx.fillStyle=pal.grassHi; pctx.fillRect(sx+(h3*ts*0.72)|0, sy+(h1*ts*0.6)|0, 2, 1);
    if(t===PT_GRASS){
      if(h3<0.34){ const swy=Math.sin(itime*1.7+cwx*0.21)*1.3;                  // a tuft of swaying blades
        pctx.strokeStyle=pal.tuft; pctx.lineWidth=1; const bx_=sx+h1*ts*0.5+3, by_=sy+h2*ts*0.45+ts*0.55;
        for(let q=0;q<3;q++){ const ox2=(q-1)*2.1; pctx.beginPath(); pctx.moveTo(bx_+ox2,by_); pctx.lineTo(bx_+ox2+swy*(0.5+q*0.18), by_-Math.max(3,ts*0.2)*(0.7+0.16*q)); pctx.stroke(); } }
      else if(h3<0.44){ const fx_=sx+h2*ts*0.7+1, fy_=sy+h1*ts*0.7+1;            // a wildflower
        pctx.fillStyle=pal.flowers[(h2*3)|0]; pctx.fillRect(fx_,fy_,3,3); pctx.fillStyle='#fff'; pctx.fillRect(fx_+0.8,fy_+0.8,1.3,1.3); }
      else if(h3<0.50){ pctx.fillStyle=pal.pebble; pctx.beginPath(); pctx.arc(sx+h1*ts*0.6+3,sy+h2*ts*0.55+3,1.9,0,TAU); pctx.fill();   // a pebble
        pctx.fillStyle='rgba(255,255,255,.3)'; pctx.fillRect(sx+h1*ts*0.6+2.3,sy+h2*ts*0.55+2.2,1.2,1); }
      else if(h3<0.55){ pctx.fillStyle=pal.clover;                              // a sprig of clover
        for(let q=0;q<3;q++){ const a2=q*2.1; pctx.beginPath(); pctx.arc(sx+h1*ts*0.55+4+Math.cos(a2)*2, sy+h2*ts*0.55+4+Math.sin(a2)*2, 1.3,0,TAU); pctx.fill(); } }
    }
  }
  // tree canopies (drawn over their grass)
  for(let ty=minTY;ty<=maxTY;ty++)for(let tx=minTX;tx<=maxTX;tx++){
    if(PRT.tiles[ty*NW+tx]!==PT_TREE) continue;
    const sx=Math.floor((tx*TS-icamX)*s+IW/2), sy=Math.floor((ty*TS-icamY)*s+IH/2);
    const h1=hash2(tx,ty), h2=hash2(tx*5+3,ty*3+7), h3=hash2(tx*11+1,ty*13+5);
    const cx_=sx+ts*(0.3+h1*0.4), cy_=sy+ts*(0.3+h2*0.4), cr_=ts*(0.42+h3*0.22);
    pctx.fillStyle='rgba(6,18,8,.4)'; pctx.beginPath(); pctx.arc(cx_+ts*0.08,cy_+ts*0.12,cr_,0,TAU); pctx.fill();
    pctx.fillStyle=pal.canopy[(h2*3)|0]; pctx.beginPath(); pctx.arc(cx_,cy_,cr_,0,TAU); pctx.fill();
    pctx.globalAlpha=0.55; pctx.fillStyle=pal.hi; pctx.beginPath(); pctx.arc(cx_-cr_*0.3,cy_-cr_*0.3,cr_*0.45,0,TAU); pctx.fill(); pctx.globalAlpha=1;
  }
  const night=env.L<0.45, dusk=env.L<0.62;
  // mooring posts along the quay edge
  for(let tx=minTX;tx<=maxTX;tx++){ if(tx%4!==1) continue;
    const t=PRT.tiles[(PRT.H-6)*NW+tx]; if(t!==PT_DOCK) continue;
    const [sx,sy]=iw2p(tx*TS+TS*0.5,(PRT.H-5)*TS);
    pctx.fillStyle='#54371e'; pctx.fillRect(sx-1.6*s,sy-5*s,3.2*s,6*s);
    pctx.fillStyle='#6e4a28'; pctx.fillRect(sx-2.2*s,sy-6*s,4.4*s,1.6*s); }
  // your boat, riding at the jetty
  { const bob=Math.sin(itime*1.6)*1.2*s, LC=livCols(SHIP&&SHIP.liv);   // (PT1 B8: in her livery)
    const [bx,by0]=iw2p(PRT.boatX,PRT.boatY); const by=by0+bob;
    pctx.fillStyle='rgba(0,20,40,.3)'; pctx.beginPath(); pctx.ellipse(bx,by0+4*s,16*s,6*s,0,0,TAU); pctx.fill();
    pctx.fillStyle=LC.hullD; pctx.beginPath(); pctx.ellipse(bx,by,15*s,6.6*s,1.35,0,TAU); pctx.fill();
    pctx.fillStyle=LC.hull; pctx.beginPath(); pctx.ellipse(bx,by,13.5*s,5.6*s,1.35,0,TAU); pctx.fill();
    pctx.fillStyle='#9c6a3a'; pctx.beginPath(); pctx.ellipse(bx,by,9.5*s,3.8*s,1.35,0,TAU); pctx.fill();
    pctx.fillStyle=LC.sail; pctx.fillRect(bx-1.2,by-17*s,2.4,17*s);
    pctx.beginPath(); pctx.moveTo(bx+1,by-16*s); pctx.lineTo(bx+8*s,by-9*s); pctx.lineTo(bx+1,by-8*s); pctx.closePath(); pctx.fill();
    pctx.fillStyle=LC.flag; pctx.fillRect(bx-6.4*s,by-17.5*s,5.4*s,3.2*s);
    const rl=0.5+0.5*Math.sin(itime*2.2);                              // riding light after dark
    if(dusk||night){ pctx.save(); pctx.globalAlpha=0.5;
      for(var ri=0;ri<4;ri++){ pctx.fillStyle=ri%2?'rgba(255,210,120,.4)':'rgba(244,239,224,.4)'; const ry3=by0+5*s+ri*3*s; pctx.fillRect(bx-3*s+Math.sin(itime*4+ri)*1.5*s,ry3,6*s,1.4*s); }
      pctx.restore(); }
    if(night){ pctx.fillStyle='rgba(255,220,130,'+(0.35+0.3*rl)+')'; pctx.beginPath(); pctx.arc(bx,by-17*s,2.4*s,0,TAU); pctx.fill(); } }
  // a couple of harbour dinghies
  for(let i=0;i<1+PRT.SZ;i++){ const dxw=(5+i*9+((PRT.core.idx+i*7)%6))*TS, dyw=(PRT.H-2.6)*TS;
    const [dx2,dy2]=iw2p(dxw,dyw); if(dx2<-40||dx2>IW+40) continue;
    const bob=Math.sin(itime*1.4+i*2.1)*1.1*s;
    pctx.fillStyle='#4e3621'; pctx.beginPath(); pctx.ellipse(dx2,dy2+bob,7.5*s,3*s,0.1*(i%2?1:-1),0,TAU); pctx.fill();
    pctx.fillStyle='#6e4a2c'; pctx.beginPath(); pctx.ellipse(dx2,dy2+bob,6*s,2.2*s,0.1*(i%2?1:-1),0,TAU); pctx.fill(); }
  // drawables sorted by baseline so folk pass in front of and behind things properly
  const draws=[];
  if(!PRT.pt) for(let ci=1;ci<crew.length;ci++){ const m=crew[ci];   // (the grounds: no crew on the jetty)
    const cxw=(PRT.jx+(ci%2?-0.9:1.9))*TS+(ci*7%11), cyw=(PRT.H-5.7+(ci%3)*0.5)*TS;
    draws.push({by:cyw, fn:()=>drawCrewAshore(m,cxw,cyw,s,ci)}); }
  for(const b of PRT.blds) draws.push({by:(b.y0+b.h)*TS-2, fn:()=>drawBuilding(b,s,night,dusk)});
  for(const p of PRT.props) draws.push({by:p.y, fn:()=>drawProp(p,s,night)});
  for(const n of PRT.npcs) draws.push({by:n.y, fn:()=>drawVillager(n,s)});
  if(PRT.folk) for(const n of PRT.folk) if(!n.inside) draws.push({by:n.y, fn:()=>drawVillager(n,s)});
  draws.push({by:player.y, fn:()=>drawExplorerSprite(false)});
  draws.sort((a,b)=>a.by-b.by);
  for(const d of draws) d.fn();
  // gulls wheel over the harbour
  for(let g=0;g<3;g++){ const ga=itime*(0.5+g*0.11)+g*2.1;
    const gx0=PRT.W*TS*0.5+Math.cos(ga)*(PRT.W*TS*0.22), gy0=(PRT.H-7)*TS+Math.sin(ga*1.3)*30-40-g*14;
    const [gx,gy]=iw2p(gx0,gy0); if(gx<-20||gx>IW+20) continue;
    const ww=Math.max(2,2.6*s), fl2=Math.sin(itime*8+g*1.7)*0.5;
    pctx.strokeStyle='rgba(244,248,252,.85)'; pctx.lineWidth=Math.max(1,1.1*s);
    pctx.beginPath(); pctx.moveTo(gx-ww,gy-fl2*ww); pctx.lineTo(gx,gy+ww*0.4); pctx.lineTo(gx+ww,gy-fl2*ww); pctx.stroke(); }
}
function drawBuilding(b,s,night,dusk){
  var TS=PRT.TS, pal=PORT_PAL;
  var p0=iw2p(b.x0*TS, b.y0*TS), x0=p0[0], y0=p0[1];
  var w=b.w*TS*s, h=b.h*TS*s, kind=b.kind, mat=b.mat||'timber', rt=b.roofType||'gable';
  var faceH=Math.min(h*0.46, 1.7*TS*s), fy=y0+h-faceH, i;
  var dsx=iw2p((b.door.tx+0.5)*TS,0)[0];
  pctx.fillStyle='rgba(8,20,12,.32)'; pctx.fillRect(x0+3*s,y0+h-3*s,w,5*s);
  var wallTop, wallBot, beamC=pal.beam;
  if(mat==='stone'){ wallBot='#bdb6a3'; wallTop='#d4cdbb'; beamC=pal.stoneSeam; }
  else if(mat==='tarred'){ wallBot='#3f3326'; wallTop='#4d3e2d'; beamC='#241a12'; }
  else if(mat==='plaster'){ wallBot=b.plasterCol; wallTop=shade(b.plasterCol,14); beamC='#7a5a36'; }
  else { wallBot=(b.roof?pal.wallB:pal.wallA); wallTop=shade(wallBot,12); beamC=pal.beam; }
  pctx.fillStyle=wallBot; pctx.fillRect(x0,fy,w,faceH);
  pctx.fillStyle=wallTop; pctx.fillRect(x0,fy,w,faceH*0.34);
  if(mat==='stone'){ pctx.strokeStyle='rgba(120,112,96,.5)'; pctx.lineWidth=1;
    for(i=1;i<4;i++){ var yy=fy+faceH*i/4; pctx.beginPath(); pctx.moveTo(x0,yy); pctx.lineTo(x0+w,yy); pctx.stroke(); } }
  else if(mat==='timber'||mat==='tarred'){
    pctx.fillStyle=beamC; pctx.fillRect(x0,fy,2.2*s,faceH); pctx.fillRect(x0+w-2.2*s,fy,2.2*s,faceH); pctx.fillRect(x0,fy,w,1.8*s);
    pctx.globalAlpha=0.5; pctx.fillRect(x0,fy+faceH*0.5,w,1.4*s); pctx.globalAlpha=1; }
  else { pctx.fillStyle=beamC; pctx.fillRect(x0,fy,w,1.6*s); pctx.fillRect(x0,fy+faceH-2*s,w,2*s); }
  if(mat!=='stone'){
    var wn=Math.max(1,b.w-2);
    for(i=0;i<wn;i++){ var wx=x0+w*(i+0.75)/(wn+0.5)-2.4*s;
      if(Math.abs(wx-dsx)<6*s) continue;
      if(night){ pctx.fillStyle='rgba(255,200,110,.22)'; pctx.fillRect(wx-2.4*s,fy+faceH*0.3-2.4*s,9.6*s,9.6*s); }
      pctx.fillStyle=night?'#ffcd6e':'#2c3c54'; pctx.fillRect(wx,fy+faceH*0.3,4.8*s,5*s);
      pctx.fillStyle=beamC; pctx.fillRect(wx-0.8*s,fy+faceH*0.3-0.8*s,6.4*s,1.2*s);
      pctx.strokeStyle=night?'#caa057':'#1c2940'; pctx.lineWidth=1;
      pctx.beginPath(); pctx.moveTo(wx+2.4*s,fy+faceH*0.3); pctx.lineTo(wx+2.4*s,fy+faceH*0.3+5*s); pctx.stroke();
      pctx.beginPath(); pctx.moveTo(wx,fy+faceH*0.3+2.5*s); pctx.lineTo(wx+4.8*s,fy+faceH*0.3+2.5*s); pctx.stroke(); }
  }
  var dw=(kind==='wright'?9*s:6.5*s), dh=faceH*(kind==='museum'?0.74:0.62), dx0=dsx-dw/2, dy0=y0+h-dh;
  if(night){ pctx.fillStyle='rgba(255,190,100,.16)'; pctx.beginPath(); pctx.ellipse(dx0+dw/2,y0+h,dw*1.7,6*s,0,Math.PI,0); pctx.fill(); }
  if(kind==='wright'){
    pctx.fillStyle='#1a140d'; pctx.fillRect(dx0,dy0,dw,dh);
    pctx.fillStyle=beamC; pctx.fillRect(dx0-1.4*s,dy0-1.4*s,dw+2.8*s,1.6*s);
    if(dusk){ pctx.fillStyle='rgba(255,170,80,.5)'; pctx.beginPath(); pctx.arc(dx0+dw*0.5,dy0+dh*0.4,3*s,0,TAU); pctx.fill(); } }
  else if(kind==='forge'){                                                        // (C7b) the smithy's open mouth, the hearth glowing at its back
    pctx.fillStyle='#8a8478'; pctx.fillRect(dx0-2*s,dy0-2.4*s,dw*1.3+4*s,2.4*s);
    pctx.fillStyle='#160c06'; pctx.fillRect(dx0,dy0,dw*1.3,dh);
    const fl=0.75+0.25*Math.sin(itime*9+b.ph); pctx.fillStyle='rgba(255,'+Math.round(120+60*fl)+',50,.95)'; pctx.fillRect(dx0+2*s,dy0+dh-4*s,dw*1.3-4*s,2.4*s);
    pctx.fillStyle='rgba(255,150,60,'+(0.18*fl).toFixed(3)+')'; pctx.beginPath(); pctx.ellipse(dx0+dw*0.65,y0+h,dw*1.4,5*s,0,Math.PI,0); pctx.fill(); }
  else if(kind==='museum'){
    pctx.fillStyle=pal.stoneDk; pctx.fillRect(dx0-1.6*s,dy0-1.6*s,dw+3.2*s,dh+1.6*s);
    pctx.fillStyle='#4b3a22'; pctx.fillRect(dx0,dy0,dw,dh);
    pctx.beginPath(); pctx.arc(dx0+dw/2,dy0,dw/2,Math.PI,0); pctx.fill();
    pctx.fillStyle=pal.brass; pctx.fillRect(dx0+dw*0.5-0.7*s,dy0+dh*0.4,1.4*s,1.4*s); }
  else {
    pctx.fillStyle=beamC; pctx.fillRect(dx0-1.2*s,dy0-1.2*s,dw+2.4*s,dh+1.2*s);
    pctx.fillStyle=(kind==='home'?'#6e4a26':pal.door); pctx.fillRect(dx0,dy0,dw,dh);
    pctx.fillStyle='#caa05a'; pctx.fillRect(dx0+dw-2.2*s,dy0+dh*0.45,1.4*s,1.4*s); }
  drawRoof(b,x0,y0,w,h,faceH,rt,s,night);
  if(kind==='market') drawMarketFront(b,x0,y0,w,h,faceH,fy,dsx,s,pal);
  else if(kind==='wright') drawWrightYard(b,x0,y0,w,h,faceH,fy,dsx,s,pal,dusk);
  else if(kind==='tavern') drawTavernFront(b,x0,y0,w,h,faceH,fy,dsx,s,pal,night,dusk);
  else if(kind==='museum') drawMuseumFront(b,x0,y0,w,h,faceH,fy,dsx,s,pal);
  else if(kind==='home') drawHomeFront(b,x0,y0,w,h,faceH,fy,dsx,s,pal,night,dusk);
  else if(kind==='forge'){ var cx3=x0+w*0.08, cy3=y0-8*s, cw3=11*s, ch3=h-2*s+8*s; pctx.fillStyle='#8a8478'; pctx.fillRect(cx3,cy3,cw3,ch3); pctx.fillStyle='#a8a294'; pctx.fillRect(cx3,cy3,cw3*0.35,ch3); pctx.fillStyle='rgba(40,34,30,.35)';   // (C7b) the stone stack up the wall & its smoke
    for(var yy3=cy3+3*s; yy3<cy3+ch3; yy3+=3.2*s) pctx.fillRect(cx3,yy3,cw3,0.8*s);
    pctx.fillStyle='#5a544c'; pctx.fillRect(cx3-1.2*s,cy3-1.6*s,cw3+2.4*s,2*s); pctx.fillStyle='#ff8a2a'; pctx.fillRect(cx3+2*s,cy3-0.8*s,cw3-4*s,0.9*s);
    for(i=0;i<4;i++){ var pr3=((itime*0.34+b.ph+i*0.25)%1); pctx.fillStyle='rgba(120,116,124,'+(0.42*(1-pr3)).toFixed(3)+')'; pctx.beginPath(); pctx.arc(cx3+cw3/2+Math.sin((itime+i*2)*0.8)*3*s*pr3, cy3-2*s-pr3*20*s, (1.8+pr3*3.4)*s, 0, TAU); pctx.fill(); } }
  else if(b.flowerBox) drawFlowerBox(x0+w*0.5,fy+faceH*0.34,s,pal);
  if((kind==='house'||kind==='tavern'||kind==='home') && dusk){
    var rh2=h-faceH, chx=x0+w*0.74, chy=y0+rh2*0.18;
    pctx.fillStyle='#6e5e50'; pctx.fillRect(chx,chy,4*s,5*s); pctx.fillStyle='#5a4c40'; pctx.fillRect(chx-0.6*s,chy-1.2*s,5.2*s,1.4*s);
    for(i=0;i<3;i++){ var pr2=((itime*0.24+b.ph+i*0.33)%1);
      pctx.fillStyle='rgba(220,220,224,'+(0.3*(1-pr2)).toFixed(3)+')';
      pctx.beginPath(); pctx.arc(chx+2*s+Math.sin((itime+i*2)*0.8)*3*s*pr2, chy-2*s-pr2*16*s, (1.5+pr2*3)*s, 0, TAU); pctx.fill(); } }
  if(kind==='market'||kind==='wright'||kind==='tavern'||kind==='forge') drawTradeSign(b,fy,s,pal);
}
function shade(hex,d){ var n=parseInt(hex.slice(1),16),r=(n>>16)+d,g=((n>>8)&255)+d,bl=(n&255)+d;
  r=r<0?0:r>255?255:r; g=g<0?0:g>255?255:g; bl=bl<0?0:bl>255?255:bl; return 'rgb('+r+','+g+','+bl+')'; }
function drawRoof(b,x0,y0,w,h,faceH,rt,s,night){
  var pal=PORT_PAL, ry=y0, rh=h-faceH, ov=3*s, i;
  if(rt==='pediment'){ var apex=ry-rh*0.25;
    pctx.fillStyle='#c2bba8'; pctx.beginPath(); pctx.moveTo(x0-ov,ry+rh); pctx.lineTo(x0+w/2,apex); pctx.lineTo(x0+w+ov,ry+rh); pctx.closePath(); pctx.fill();
    pctx.fillStyle='#d4cdbb'; pctx.beginPath(); pctx.moveTo(x0-ov,ry+rh); pctx.lineTo(x0+w/2,apex); pctx.lineTo(x0+w/2-3*s,apex+2*s); pctx.lineTo(x0-ov+5*s,ry+rh-1*s); pctx.closePath(); pctx.fill();
    pctx.fillStyle='#a89f88'; pctx.fillRect(x0-ov,ry+rh-2.4*s,w+ov*2,2.8*s);
    pctx.fillStyle='#b4ac98'; pctx.beginPath(); pctx.arc(x0+w/2,ry+rh*0.55,rh*0.15,0,TAU); pctx.fill();
    pctx.strokeStyle='#8f876f'; pctx.lineWidth=1; pctx.stroke(); return; }
  if(rt==='thatch'){
    pctx.fillStyle=pal.thatchDk; pctx.beginPath(); pctx.moveTo(x0-ov,ry+rh); pctx.quadraticCurveTo(x0+w/2,ry-rh*0.45,x0+w+ov,ry+rh); pctx.closePath(); pctx.fill();
    pctx.fillStyle=pal.thatch[0]; pctx.beginPath(); pctx.moveTo(x0-ov,ry+rh-2*s); pctx.quadraticCurveTo(x0+w/2,ry-rh*0.45+2*s,x0+w+ov,ry+rh-2*s); pctx.lineTo(x0-ov,ry+rh-2*s); pctx.closePath(); pctx.fill();
    pctx.strokeStyle=pal.thatchDk; pctx.lineWidth=1; var nstr=Math.max(4,(b.w*3)|0);
    for(i=0;i<nstr;i++){ var t=i/nstr, xx=x0-ov+(w+ov*2)*t, yy=ry+rh-3*s-Math.sin(Math.PI*t)*rh*0.6; pctx.beginPath(); pctx.moveTo(xx,yy); pctx.lineTo(xx,yy+3*s); pctx.stroke(); }
    pctx.fillStyle=pal.thatch[2]; pctx.fillRect(x0+w/2-2*s,ry-rh*0.45,4*s,rh*0.45); return; }
  var rp=PORT_PAL.roofs[b.roof], cTop,cMid,cBot;
  if(rt==='tileR'){ cBot=pal.tileDk; cMid=pal.tileR[0]; cTop=pal.tileR[2]; }
  else if(rt==='slate'){ cBot=pal.slateDk; cMid=pal.slate[0]; cTop=pal.slate[2]; }
  else { cBot=rp[2]; cMid=rp[0]; cTop=rp[1]; }
  pctx.fillStyle=cBot; pctx.fillRect(x0-ov,ry+rh*0.5,w+ov*2,rh*0.5+1);
  pctx.fillStyle=cMid; pctx.fillRect(x0-ov,ry,w+ov*2,rh*0.52);
  pctx.fillStyle=cTop; pctx.fillRect(x0-ov,ry,w+ov*2,2.2*s);
  if(rt==='tileR'){ pctx.fillStyle=pal.tileDk;
    for(var ty2=ry+4*s; ty2<ry+rh; ty2+=4*s) for(var cx=x0-ov; cx<x0+w+ov; cx+=4.5*s){ pctx.beginPath(); pctx.arc(cx+2.2*s,ty2,2*s,0,Math.PI); pctx.fill(); } }
  else if(rt==='slate'){ pctx.strokeStyle=pal.slateDk; pctx.lineWidth=1; var row=0;
    for(var sy3=ry+3.5*s; sy3<ry+rh; sy3+=3.5*s){ pctx.beginPath(); pctx.moveTo(x0-ov,sy3); pctx.lineTo(x0+w+ov,sy3); pctx.stroke();
      var off=(row%2)?2.2*s:0; row++; for(var cx2=x0-ov+off; cx2<x0+w+ov; cx2+=4.4*s){ pctx.beginPath(); pctx.moveTo(cx2,sy3); pctx.lineTo(cx2,sy3+3.5*s); pctx.stroke(); } } }
  else { for(var i2=0;i2<b.w;i2++){ pctx.fillStyle='rgba(0,0,0,.08)'; pctx.fillRect(x0-ov+(w+ov*2)*(i2+0.5)/b.w,ry+2*s,1.4,rh-2*s); } }
  pctx.fillStyle='rgba(8,20,12,.34)'; pctx.fillRect(x0-ov,ry+rh-1.6*s,w+ov*2,1.8*s);
}
function drawMarketFront(b,x0,y0,w,h,faceH,fy,dsx,s,pal){
  var aw=pal.awnings[(b.awnCol||0)%pal.awnings.length], ay=fy+faceH*0.30, aw0=x0+w*0.10, awW=w*0.80, dep=6*s, i;
  for(i=0;i*8*s<awW;i++){ pctx.fillStyle=(i%2)?aw[0]:aw[1]; var xx=aw0+i*8*s; pctx.beginPath(); pctx.moveTo(xx,ay); pctx.lineTo(xx+8*s,ay); pctx.lineTo(xx+8*s,ay+dep); pctx.lineTo(xx,ay+dep); pctx.closePath(); pctx.fill(); }
  pctx.fillStyle=aw[0]; for(i=0;i*6*s<awW;i++){ var xs=aw0+i*6*s; pctx.beginPath(); pctx.arc(xs+3*s,ay+dep,3*s,0,Math.PI); pctx.fill(); }
  var cy=y0+h-2*s, cx=dsx, cols=['#e2643a','#e8b53a','#6fbf5a','#d83a4a','#caa05a'];
  pctx.fillStyle='#7a5230'; pctx.fillRect(cx-9*s,cy-3*s,18*s,4*s);
  for(i=0;i<5;i++){ pctx.fillStyle=cols[i]; pctx.beginPath(); pctx.arc(cx-7*s+i*3.5*s,cy-3.6*s,1.7*s,0,TAU); pctx.fill(); }
}
function drawWrightYard(b,x0,y0,w,h,faceH,fy,dsx,s,pal,dusk){
  var gy=y0+h+1*s, gx=x0+w*0.10, i, tx;
  pctx.strokeStyle='#5a4026'; pctx.lineWidth=Math.max(1,1.6*s);
  for(tx=0;tx<2;tx++){ var trx=gx+tx*13*s; pctx.beginPath(); pctx.moveTo(trx-2*s,gy); pctx.lineTo(trx,gy-4*s); pctx.lineTo(trx+2*s,gy); pctx.stroke(); }
  pctx.strokeStyle='#7a5230'; pctx.lineWidth=Math.max(1.4,2*s);
  pctx.beginPath(); pctx.moveTo(gx-3*s,gy-4*s); pctx.lineTo(gx+16*s,gy-4*s); pctx.stroke();
  for(i=0;i<4;i++){ var rx=gx+i*4.6*s; pctx.beginPath(); pctx.arc(rx,gy-4*s,3.4*s,Math.PI,TAU); pctx.stroke(); }
  pctx.fillStyle='#9c6e42'; for(i=0;i<3;i++) pctx.fillRect(x0+w*0.72,gy-2*s-i*2*s,11*s,1.6*s);
}
function drawTavernFront(b,x0,y0,w,h,faceH,fy,dsx,s,pal,night,dusk){
  var by=y0+h-4*s;
  function barrel(cx,cy){ pctx.fillStyle='#8a5c34'; pctx.beginPath(); pctx.ellipse(cx,cy,4*s,5*s,0,0,TAU); pctx.fill();
    pctx.fillStyle='#a8744a'; pctx.beginPath(); pctx.ellipse(cx,cy,2.4*s,4.4*s,0,0,TAU); pctx.fill();
    pctx.strokeStyle='#54371e'; pctx.lineWidth=1; pctx.beginPath(); pctx.moveTo(cx-4*s,cy-1*s); pctx.lineTo(cx+4*s,cy-1*s); pctx.stroke(); }
  barrel(dsx-13*s,by); barrel(dsx-6*s,by); barrel(dsx-9.5*s,by-8*s);
  var lx=dsx+9*s, ly=fy+faceH*0.34;
  pctx.fillStyle=pal.beam; pctx.fillRect(lx-0.6*s,fy,1.2*s,ly-fy);
  if(dusk){ pctx.fillStyle='rgba(255,180,80,'+(0.28+0.12*Math.sin(itime*4+b.ph)).toFixed(3)+')'; pctx.beginPath(); pctx.arc(lx,ly+2*s,7*s,0,TAU); pctx.fill(); }
  pctx.fillStyle='#3a2c1c'; pctx.fillRect(lx-1.6*s,ly,3.2*s,4*s);
  pctx.fillStyle=dusk?'#ffd98a':'#9aa0a8'; pctx.fillRect(lx-1*s,ly+0.6*s,2*s,2.8*s);
}
function drawMuseumFront(b,x0,y0,w,h,faceH,fy,dsx,s,pal){
  pctx.fillStyle='#b4ac98'; pctx.fillRect(x0-2*s,y0+h-2*s,w+4*s,3*s);
  pctx.fillStyle='#c8c0ad'; pctx.fillRect(x0,y0+h-4.4*s,w,2.6*s);
  var nc=Math.max(4,b.w), colW=3*s, capH=2*s, i;
  for(i=0;i<nc;i++){ var cx=x0+w*(i+0.5)/nc; if(Math.abs(cx-dsx)<6*s) continue;
    pctx.fillStyle='#d8d2c2'; pctx.fillRect(cx-colW/2,fy+3*s,colW,faceH-7*s);
    pctx.fillStyle='#bdb6a3'; pctx.fillRect(cx+colW*0.18,fy+3*s,colW*0.3,faceH-7*s);
    pctx.fillStyle='#c8c0ad'; pctx.fillRect(cx-colW*0.7,fy+3*s,colW*1.4,capH);
    pctx.fillRect(cx-colW*0.7,fy+faceH-4.5*s,colW*1.4,capH); }
  var banC=pal.banner[(Math.floor(b.ph*10))%pal.banner.length], banD=shade(banC,-26);
  for(var bb=-1;bb<=1;bb+=2){ var bcx=dsx+bb*w*0.27, bw=4*s, btop=fy+1.6*s, bh=faceH*0.58;
    pctx.fillStyle='#5a4a30'; pctx.fillRect(bcx-bw*0.72,btop-1.8*s,bw*1.44,1.8*s);                  // the rod it hangs from
    pctx.fillStyle=banC; pctx.fillRect(bcx-bw/2,btop,bw,bh);                                         // the cloth
    pctx.fillStyle=banD; pctx.fillRect(bcx-bw/2,btop,bw*0.34,bh);                                    // a shaded fold
    pctx.fillStyle=banC; pctx.beginPath(); pctx.moveTo(bcx-bw/2,btop+bh); pctx.lineTo(bcx+bw/2,btop+bh); pctx.lineTo(bcx,btop+bh+3.5*s); pctx.closePath(); pctx.fill();
    pctx.fillStyle='rgba(255,255,255,.85)'; pctx.beginPath(); pctx.arc(bcx,btop+bh*0.4,1.7*s,0,TAU); pctx.fill(); }
}
function drawHomeFront(b,x0,y0,w,h,faceH,fy,dsx,s,pal,night,dusk){
  var fy2=y0+h+1*s, i;
  pctx.strokeStyle='#cdbfa6'; pctx.lineWidth=Math.max(1,1.4*s);
  for(i=0;i*4*s<w;i++){ var xx=x0+i*4*s; pctx.beginPath(); pctx.moveTo(xx,fy2); pctx.lineTo(xx,fy2-3.5*s); pctx.stroke();
    pctx.fillStyle=['#ff9fb2','#ffd86b','#cda0ff','#fff'][i%4]; pctx.beginPath(); pctx.arc(xx,fy2-4*s,1.3*s,0,TAU); pctx.fill(); }
  pctx.strokeStyle='#cdbfa6'; pctx.beginPath(); pctx.moveTo(x0,fy2-2*s); pctx.lineTo(x0+w,fy2-2*s); pctx.stroke();
  drawFlowerBox(x0+w*0.26, fy+faceH*0.36, s, pal);
  pctx.strokeStyle='#4a7a44'; pctx.lineWidth=Math.max(1.4,2*s); pctx.beginPath(); pctx.arc(dsx,y0+h-faceH*0.42,2.4*s,0,TAU); pctx.stroke();
  pctx.fillStyle='#d83a4a'; pctx.beginPath(); pctx.arc(dsx,y0+h-faceH*0.42+2.4*s,1*s,0,TAU); pctx.fill();
  if(dusk){ pctx.fillStyle='rgba(255,180,80,.28)'; pctx.beginPath(); pctx.arc(dsx+8*s,y0+h-faceH*0.4,6*s,0,TAU); pctx.fill();
    pctx.fillStyle='#ffd98a'; pctx.fillRect(dsx+7*s,y0+h-faceH*0.4-1.5*s,2*s,3*s); }
}
function drawFlowerBox(cx,cy,s,pal){
  var cols=['#ff9fb2','#ffd86b','#cda0ff','#fff','#ff7a6a'], i;
  pctx.fillStyle='#6e4a28'; pctx.fillRect(cx-4*s,cy,8*s,3*s);
  pctx.fillStyle='#4a7a44'; pctx.fillRect(cx-4*s,cy-1*s,8*s,1.2*s);
  for(i=0;i<4;i++){ pctx.fillStyle=cols[i%cols.length]; pctx.beginPath(); pctx.arc(cx-3*s+i*2*s,cy-1*s,1.3*s,0,TAU); pctx.fill(); }
}
function drawTradeSign(b,fy,s,pal){
  var sx2=iw2p((b.door.tx+1.7)*PRT.TS,0)[0], sy2=fy+1*s;
  pctx.fillStyle=pal.beam; pctx.fillRect(sx2,sy2,1.2*s,4*s);
  pctx.fillStyle=pal.sign; pctx.fillRect(sx2-3.4*s,sy2+4*s,8*s,6*s);
  pctx.strokeStyle='#54371e'; pctx.lineWidth=1; pctx.strokeRect(sx2-3.4*s,sy2+4*s,8*s,6*s);
  var cx2=sx2+0.6*s, cy2=sy2+7*s;
  if(b.kind==='market'){ pctx.fillStyle='#7fd6c8'; pctx.beginPath(); pctx.ellipse(cx2,cy2,2.6*s,1.4*s,0,0,TAU); pctx.fill();
    pctx.beginPath(); pctx.moveTo(cx2+2.2*s,cy2); pctx.lineTo(cx2+3.6*s,cy2-1.2*s); pctx.lineTo(cx2+3.6*s,cy2+1.2*s); pctx.closePath(); pctx.fill(); }
  else if(b.kind==='wright'){ pctx.strokeStyle='#dfe9f2'; pctx.lineWidth=Math.max(1.2,1.4*s);
    pctx.beginPath(); pctx.moveTo(cx2,cy2-1.8*s); pctx.lineTo(cx2,cy2+1.8*s); pctx.stroke();
    pctx.beginPath(); pctx.arc(cx2,cy2+0.6*s,1.8*s,0.3,Math.PI-0.3); pctx.stroke();
    pctx.fillStyle='#dfe9f2'; pctx.fillRect(cx2-1.6*s,cy2-2.4*s,3.2*s,1.2*s); }
  else if(b.kind==='forge'){ pctx.fillStyle='#cfd6e0'; pctx.fillRect(cx2-2.6*s,cy2-2.2*s,5.2*s,2*s); pctx.fillStyle='#a8743e'; pctx.fillRect(cx2-0.5*s,cy2-0.2*s,1.2*s,3*s); }   // (C7b) a hammer
  else { pctx.fillStyle='#e8c06a'; pctx.fillRect(cx2-1.8*s,cy2-1.6*s,3.6*s,3.4*s);
    pctx.fillStyle='#fff'; pctx.fillRect(cx2-1.8*s,cy2-2.2*s,3.6*s,1*s);
    pctx.strokeStyle='#caa057'; pctx.lineWidth=1; pctx.beginPath(); pctx.arc(cx2+2.4*s,cy2,1.2*s,-1.2,1.2); pctx.stroke(); }
}
function drawGarlands(s,night){
  if(!PRT.garlands) return; var gi, i;
  for(gi=0;gi<PRT.garlands.length;gi++){ var g=PRT.garlands[gi], cols=PORT_PAL.banner, prev=null;
    for(i=0;i<=g.n;i++){ var t=i/g.n, wx=g.x1+(g.x2-g.x1)*t, wy=g.y1+(g.y2-g.y1)*t+Math.sin(Math.PI*t)*g.sag, pt=iw2p(wx,wy);
      if(prev){ pctx.strokeStyle='rgba(40,30,20,.7)'; pctx.lineWidth=Math.max(1,1.1*s); pctx.beginPath(); pctx.moveTo(prev[0],prev[1]); pctx.lineTo(pt[0],pt[1]); pctx.stroke(); }
      if(i<g.n){ pctx.fillStyle=cols[(i+g.seed)%cols.length]; pctx.beginPath(); pctx.moveTo(pt[0],pt[1]); pctx.lineTo(pt[0]+5*s,pt[1]); pctx.lineTo(pt[0]+2.5*s,pt[1]+7*s); pctx.closePath(); pctx.fill();
        pctx.fillStyle='rgba(255,255,255,.25)'; pctx.fillRect(pt[0]+1*s,pt[1]+1*s,3*s,1.4*s); }
      prev=pt; } }
}

function drawProp(p,s,night){
  const [sx,sy]=iw2p(p.x,p.y);
  if(p.k==='fountain'||p.k==='monument'||p.k==='lighthouse'||p.k==='buoy'||p.k==='rope'||p.k==='anchor'||p.k==='nets'||p.k==='cat'){ drawTownProp(sx,sy,p,s,night); return; }
  if(p.k==='helm'){ pctx.fillStyle='#6a7488'; pctx.beginPath(); pctx.ellipse(sx,sy-12*s,7*s,15*s,0,0,TAU); pctx.fill(); pctx.strokeStyle='#5ec8c0'; pctx.lineWidth=Math.max(1,1.2*s); pctx.beginPath(); pctx.arc(sx,sy-14*s,4*s,0,TAU); pctx.stroke(); return; }   // (the smooth town: plain stand-ins for the grounds' furniture)
  if(p.k==='anvil'){ pctx.fillStyle='#7a5234'; pctx.fillRect(sx-4*s,sy-6*s,8*s,6*s); pctx.fillStyle='#4a505a'; pctx.fillRect(sx-9*s,sy-12*s,17*s,3*s); pctx.fillRect(sx-4*s,sy-9*s,7*s,3*s); pctx.fillStyle='#8a929e'; pctx.fillRect(sx-9*s,sy-12*s,17*s,1*s); return; }   // (C7b the forge's yard — the smooth town's stand-ins)
  if(p.k==='quench'){ pctx.fillStyle='#6a4424'; pctx.beginPath(); pctx.ellipse(sx,sy-5*s,5*s,6*s,0,0,TAU); pctx.fill(); pctx.fillStyle='#2a5470'; pctx.beginPath(); pctx.ellipse(sx,sy-10*s,4*s,1.4*s,0,0,TAU); pctx.fill(); return; }
  if(p.k==='lamp'){
    pctx.fillStyle='rgba(8,20,12,.3)'; pctx.beginPath(); pctx.ellipse(sx,sy+1.5*s,3.5*s,1.4*s,0,0,TAU); pctx.fill();
    pctx.fillStyle='#3a3430'; pctx.fillRect(sx-1*s,sy-14*s,2*s,15*s);
    pctx.fillStyle='#54483c'; pctx.fillRect(sx-2.4*s,sy-16*s,4.8*s,3*s);
    const duskL=env.L<0.62, gl=duskL?0.5+0.18*Math.sin(itime*3+p.x):0;
    if(gl>0){ pctx.fillStyle='rgba(255,176,80,'+(gl*0.14)+')'; pctx.beginPath(); pctx.ellipse(sx,sy+1.5*s,13*s,5*s,0,0,TAU); pctx.fill();
      pctx.fillStyle='rgba(255,206,110,'+(gl*0.34)+')'; pctx.beginPath(); pctx.arc(sx,sy-14.5*s,9*s,0,TAU); pctx.fill(); }
    pctx.fillStyle=night?'#ffd98a':'#c8ccd4'; pctx.fillRect(sx-1.4*s,sy-15.4*s,2.8*s,2*s);
  } else if(p.k==='crate'){
    pctx.fillStyle='rgba(8,20,12,.3)'; pctx.fillRect(sx-4*s,sy+2*s,9*s,2*s);
    pctx.fillStyle='#9c6e42'; pctx.fillRect(sx-4.5*s,sy-7*s,9*s,9*s);
    pctx.strokeStyle='#6e4a28'; pctx.lineWidth=1; pctx.strokeRect(sx-4.5*s,sy-7*s,9*s,9*s);
    pctx.beginPath(); pctx.moveTo(sx-4.5*s,sy-7*s); pctx.lineTo(sx+4.5*s,sy+2*s); pctx.stroke();
  } else if(p.k==='barrel'){
    pctx.fillStyle='rgba(8,20,12,.3)'; pctx.beginPath(); pctx.ellipse(sx,sy+2*s,4.5*s,1.6*s,0,0,TAU); pctx.fill();
    pctx.fillStyle='#8a5c34'; pctx.beginPath(); pctx.ellipse(sx,sy-2*s,4*s,5.5*s,0,0,TAU); pctx.fill();
    pctx.fillStyle='#a8744a'; pctx.beginPath(); pctx.ellipse(sx,sy-2*s,2.6*s,5*s,0,0,TAU); pctx.fill();
    pctx.strokeStyle='#54371e'; pctx.lineWidth=1;
    pctx.beginPath(); pctx.moveTo(sx-4*s,sy-3.4*s); pctx.lineTo(sx+4*s,sy-3.4*s); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(sx-4*s,sy-0.4*s); pctx.lineTo(sx+4*s,sy-0.4*s); pctx.stroke();
  } else if(p.k==='stall'){
    pctx.fillStyle='rgba(8,20,12,.3)'; pctx.fillRect(sx-9*s,sy+2*s,19*s,2*s);
    pctx.fillStyle='#6e4a28'; pctx.fillRect(sx-9*s,sy-9*s,1.8*s,12*s); pctx.fillRect(sx+7.5*s,sy-9*s,1.8*s,12*s);
    pctx.fillStyle='#9c6e42'; pctx.fillRect(sx-9*s,sy-2*s,18.5*s,3.4*s);
    for(let i=0;i<5;i++){ pctx.fillStyle=i%2?'#e8e2d2':'#b8483a'; pctx.fillRect(sx-10*s+i*4.2*s,sy-11.5*s,4.2*s,3.6*s); }
    pctx.fillStyle='#7fd6c8'; pctx.fillRect(sx-6*s,sy-1.4*s,3*s,1.6*s);
    pctx.fillStyle='#ffd86b'; pctx.fillRect(sx-1*s,sy-1.4*s,2.4*s,1.6*s);
  } else if(p.k==='well'){
    pctx.fillStyle='rgba(8,20,12,.3)'; pctx.beginPath(); pctx.ellipse(sx,sy+2*s,6.5*s,2.2*s,0,0,TAU); pctx.fill();
    pctx.fillStyle='#8a8a92'; pctx.beginPath(); pctx.ellipse(sx,sy,6*s,4.4*s,0,0,TAU); pctx.fill();
    pctx.fillStyle='#1c2940'; pctx.beginPath(); pctx.ellipse(sx,sy,4*s,2.8*s,0,0,TAU); pctx.fill();
    pctx.fillStyle='#6e4a28'; pctx.fillRect(sx-5.5*s,sy-9*s,1.6*s,9*s); pctx.fillRect(sx+4*s,sy-9*s,1.6*s,9*s);
    pctx.fillStyle='#b14b3a'; pctx.fillRect(sx-7*s,sy-11.5*s,14*s,3*s);
  } else if(p.k==='board'){
    pctx.fillStyle='rgba(8,20,12,.3)'; pctx.fillRect(sx-7*s,sy+1.5*s,14*s,2*s);
    pctx.fillStyle='#6e4a28'; pctx.fillRect(sx-6.5*s,sy-12*s,1.8*s,14*s); pctx.fillRect(sx+4.7*s,sy-12*s,1.8*s,14*s);
    pctx.fillStyle='#9c6e42'; pctx.fillRect(sx-7.5*s,sy-12*s,15*s,9*s);
    pctx.strokeStyle='#54371e'; pctx.lineWidth=1; pctx.strokeRect(sx-7.5*s,sy-12*s,15*s,9*s);
    const fl=Math.sin(itime*6+sx)*0.8*s;
    pctx.fillStyle='#efe6c8'; pctx.fillRect(sx-5.5*s,sy-10.5*s,4*s,5*s);
    pctx.fillStyle='#e2d8b8'; pctx.fillRect(sx-0.5*s,sy-10.5*s,4*s,5.5*s+fl*0.3);
    pctx.fillStyle='#d8cca8'; pctx.fillRect(sx+2.5*s,sy-9.5*s,3*s,4*s);
    pctx.fillStyle='#8a5c2e'; for(let i=0;i<3;i++) pctx.fillRect(sx-4.8*s+i*3.4*s,sy-9.6*s+(i%2),2.2*s,0.8*s);
  }
}
function drawTownProp(sx,sy,p,s,night){
  var pal=PORT_PAL, u=PRT.TS*s, dusk=env.L<0.62, i;
  if(p.k==='fountain'){
    pctx.fillStyle='rgba(8,20,12,.3)'; pctx.beginPath(); pctx.ellipse(sx,sy+3*s,u*1.3,u*0.5,0,0,TAU); pctx.fill();
    pctx.fillStyle=pal.stoneDk; pctx.beginPath(); pctx.ellipse(sx,sy,u*1.2,u*0.5,0,0,TAU); pctx.fill();
    pctx.fillStyle=pal.stone[0]; pctx.beginPath(); pctx.ellipse(sx,sy-1.4*s,u*1.1,u*0.44,0,0,TAU); pctx.fill();
    pctx.fillStyle='#3a6e8c'; pctx.beginPath(); pctx.ellipse(sx,sy-1.4*s,u*0.82,u*0.32,0,0,TAU); pctx.fill();
    var rr=(itime*0.5)%1; pctx.strokeStyle='rgba(255,255,255,'+(0.4*(1-rr)).toFixed(3)+')'; pctx.lineWidth=1; pctx.beginPath(); pctx.ellipse(sx,sy-1.4*s,u*0.25+rr*u*0.5,u*0.1+rr*u*0.2,0,0,TAU); pctx.stroke();
    pctx.fillStyle=pal.stone[1]; pctx.fillRect(sx-2*s,sy-u*0.95,4*s,u*0.85);
    pctx.fillStyle=pal.stone[2]; pctx.beginPath(); pctx.ellipse(sx,sy-u*0.95,u*0.5,u*0.2,0,0,TAU); pctx.fill();
    pctx.strokeStyle='rgba(180,224,255,.7)'; pctx.lineWidth=Math.max(1,1.4*s); pctx.beginPath(); pctx.moveTo(sx,sy-u*0.95); pctx.lineTo(sx,sy-u*1.5); pctx.stroke();
    for(i=0;i<5;i++){ var ph=(itime*1.6+i*0.45)%1, ang=(i-2)*0.45, dx=Math.sin(ang)*u*0.6*ph, dy=-u*1.5+ph*ph*u*1.5; pctx.fillStyle='rgba(200,232,255,'+(0.7*(1-ph)).toFixed(3)+')'; pctx.beginPath(); pctx.arc(sx+dx,sy+dy,1.3*s,0,TAU); pctx.fill(); }
    return; }
  if(p.k==='monument'){
    pctx.fillStyle='rgba(8,20,12,.3)'; pctx.beginPath(); pctx.ellipse(sx,sy+3*s,u*1.0,u*0.4,0,0,TAU); pctx.fill();
    pctx.fillStyle=pal.stoneDk; pctx.fillRect(sx-u*0.9,sy-1*s,u*1.8,u*0.5);
    pctx.fillStyle=pal.stone[0]; pctx.fillRect(sx-u*0.7,sy-u*0.5,u*1.4,u*0.5);
    pctx.fillStyle=pal.stone[1]; pctx.fillRect(sx-u*0.5,sy-u*1.3,u*1.0,u*0.85);
    pctx.fillStyle=pal.brass; pctx.fillRect(sx-u*0.25,sy-u*0.85,u*0.5,u*0.28);
    var bz='#5f7d63', bzh='#7fa07f', ty=sy-u*1.3;
    pctx.fillStyle=bz; pctx.fillRect(sx-2.2*s,ty-u*0.9,4.4*s,u*0.95);
    pctx.beginPath(); pctx.arc(sx,ty-u*0.95,2.4*s,0,TAU); pctx.fill();
    pctx.fillRect(sx-3.4*s,ty-u*1.02,6.8*s,1.6*s);
    pctx.beginPath(); pctx.moveTo(sx-3.4*s,ty-u*1.02); pctx.lineTo(sx,ty-u*1.3); pctx.lineTo(sx+3.4*s,ty-u*1.02); pctx.closePath(); pctx.fill();
    pctx.strokeStyle=bz; pctx.lineWidth=Math.max(1.6,2.2*s); pctx.beginPath(); pctx.moveTo(sx+1.6*s,ty-u*0.6); pctx.lineTo(sx+6*s,ty-u*0.95); pctx.stroke();
    pctx.fillStyle=bzh; pctx.fillRect(sx+5*s,ty-u*1.05,4*s,1.8*s);
    pctx.fillStyle=bzh; pctx.fillRect(sx-2.2*s,ty-u*0.9,1.2*s,u*0.95);
    return; }
  if(p.k==='lighthouse'){
    var baseH=u*7, topW=u*0.9, botW=u*1.5;
    pctx.fillStyle='#5a5650'; pctx.beginPath(); pctx.ellipse(sx,sy,botW,u*0.5,0,0,TAU); pctx.fill();
    pctx.beginPath(); pctx.moveTo(sx-botW*0.7,sy); pctx.lineTo(sx-topW*0.6,sy-baseH); pctx.lineTo(sx+topW*0.6,sy-baseH); pctx.lineTo(sx+botW*0.7,sy); pctx.closePath();
    pctx.fillStyle='#eae6dc'; pctx.fill();
    pctx.save(); pctx.clip();
    pctx.fillStyle='#c2402e'; for(i=0;i<4;i++){ var yy=sy-baseH*(i*2+1)/8; pctx.fillRect(sx-botW,yy-baseH*0.06,botW*2,baseH*0.1); }
    pctx.fillStyle='rgba(40,40,50,.16)'; pctx.fillRect(sx+topW*0.1,sy-baseH,botW,baseH);
    pctx.restore();
    pctx.fillStyle='#3a3c44'; pctx.fillRect(sx-topW*0.9,sy-baseH-1*s,topW*1.8,2*s);
    pctx.fillStyle='#23252c'; pctx.fillRect(sx-topW*0.6,sy-baseH-u*0.7,topW*1.2,u*0.7);
    var lit=dusk?0.6+0.35*Math.sin(itime*2+(p.ph||0)):0.2;
    pctx.fillStyle='rgba(255,236,170,'+(0.4+lit*0.5).toFixed(3)+')'; pctx.fillRect(sx-topW*0.4,sy-baseH-u*0.6,topW*0.8,u*0.5);
    pctx.fillStyle='#c2402e'; pctx.beginPath(); pctx.moveTo(sx-topW*0.7,sy-baseH-u*0.7); pctx.lineTo(sx,sy-baseH-u*1.1); pctx.lineTo(sx+topW*0.7,sy-baseH-u*0.7); pctx.closePath(); pctx.fill();
    if(dusk){ var ba=itime*0.9, d2;
      pctx.fillStyle='rgba(255,240,180,.10)';
      for(d2=0;d2<2;d2++){ var a=ba+d2*Math.PI, ex=sx+Math.cos(a)*u*7, ey=sy-baseH-u*0.35+Math.sin(a)*u*2; pctx.beginPath(); pctx.moveTo(sx,sy-baseH-u*0.35); pctx.lineTo(ex,ey-u*1.5); pctx.lineTo(ex,ey+u*1.5); pctx.closePath(); pctx.fill(); }
      pctx.fillStyle='rgba(255,236,170,.25)'; pctx.beginPath(); pctx.arc(sx,sy-baseH-u*0.35,u*1.4,0,TAU); pctx.fill();
      pctx.fillStyle='rgba(255,220,150,.10)'; pctx.beginPath(); pctx.ellipse(sx,sy+u*1.4,u*0.8,u*1.8,0,0,TAU); pctx.fill(); }
    return; }
  if(p.k==='buoy'){
    var bob=Math.sin(itime*1.8+(p.ph||0))*1.4*s;
    pctx.strokeStyle='rgba(255,255,255,.3)'; pctx.lineWidth=1; pctx.beginPath(); pctx.ellipse(sx,sy+2*s,6*s,2.2*s,0,0,TAU); pctx.stroke();
    pctx.fillStyle='#c2402e'; pctx.beginPath(); pctx.moveTo(sx-3*s,sy+bob); pctx.lineTo(sx+3*s,sy+bob); pctx.lineTo(sx,sy+bob-7*s); pctx.closePath(); pctx.fill();
    pctx.fillStyle='#efe6d2'; pctx.fillRect(sx-2.4*s,sy+bob-4*s,4.8*s,1.6*s);
    pctx.fillStyle='#222'; pctx.fillRect(sx-0.7*s,sy+bob-9*s,1.4*s,2*s);
    if(night){ pctx.fillStyle='rgba(120,255,180,.7)'; pctx.beginPath(); pctx.arc(sx,sy+bob-9.5*s,1.3*s,0,TAU); pctx.fill(); }
    return; }
  if(p.k==='rope'){
    pctx.fillStyle='rgba(8,20,12,.25)'; pctx.beginPath(); pctx.ellipse(sx,sy+1.5*s,7*s,2.4*s,0,0,TAU); pctx.fill();
    for(i=3;i>=1;i--){ pctx.strokeStyle=(i%2)?'#b89366':'#a07f4e'; pctx.lineWidth=Math.max(1.4,2*s); pctx.beginPath(); pctx.ellipse(sx,sy,i*2.2*s,i*1.0*s,0,0,TAU); pctx.stroke(); }
    return; }
  if(p.k==='anchor'){
    pctx.strokeStyle='#3a4048'; pctx.lineWidth=Math.max(1.6,2.2*s);
    pctx.beginPath(); pctx.arc(sx,sy-8*s,2*s,0,TAU); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(sx,sy-6*s); pctx.lineTo(sx,sy+5*s); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(sx-4*s,sy-3*s); pctx.lineTo(sx+4*s,sy-3*s); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(sx,sy+5*s); pctx.quadraticCurveTo(sx-6*s,sy+5*s,sx-5*s,sy-0.5*s); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(sx,sy+5*s); pctx.quadraticCurveTo(sx+6*s,sy+5*s,sx+5*s,sy-0.5*s); pctx.stroke();
    return; }
  if(p.k==='nets'){
    pctx.strokeStyle='#5a4026'; pctx.lineWidth=Math.max(1,1.6*s);
    pctx.beginPath(); pctx.moveTo(sx-9*s,sy+2*s); pctx.lineTo(sx-9*s,sy-10*s); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(sx+9*s,sy+2*s); pctx.lineTo(sx+9*s,sy-10*s); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(sx-9*s,sy-10*s); pctx.lineTo(sx+9*s,sy-10*s); pctx.stroke();
    pctx.strokeStyle='rgba(220,214,190,.7)'; pctx.lineWidth=1;
    for(i=0;i<=8;i++){ var t=i/8, xx=sx-9*s+18*s*t; pctx.beginPath(); pctx.moveTo(xx,sy-10*s); pctx.lineTo(xx,sy-10*s+8*s+Math.sin(Math.PI*t)*5*s); pctx.stroke(); }
    var j; for(j=0;j<4;j++){ var yy2=sy-9*s+j*2.2*s; pctx.beginPath(); for(i=0;i<=8;i++){ var t2=i/8, xx2=sx-9*s+18*s*t2, sag=Math.sin(Math.PI*t2)*5*s*(j/4); if(i===0) pctx.moveTo(xx2,yy2+sag); else pctx.lineTo(xx2,yy2+sag); } pctx.stroke(); }
    pctx.fillStyle='#c2402e'; pctx.beginPath(); pctx.arc(sx-3*s,sy-4*s,1.6*s,0,TAU); pctx.fill();
    pctx.fillStyle='#e8b53a'; pctx.beginPath(); pctx.arc(sx+4*s,sy-6*s,1.4*s,0,TAU); pctx.fill();
    return; }
  if(p.k==='cat'){
    var flick=Math.sin(itime*2+(p.ph||0))*3*s;
    pctx.fillStyle='rgba(8,20,12,.25)'; pctx.beginPath(); pctx.ellipse(sx,sy+1.5*s,5*s,1.8*s,0,0,TAU); pctx.fill();
    pctx.fillStyle='#3a322c';
    pctx.beginPath(); pctx.ellipse(sx,sy-1.5*s,4*s,3*s,0,0,TAU); pctx.fill();
    pctx.beginPath(); pctx.arc(sx+2.5*s,sy-4*s,2.2*s,0,TAU); pctx.fill();
    pctx.beginPath(); pctx.moveTo(sx+1*s,sy-5.6*s); pctx.lineTo(sx+2*s,sy-7.4*s); pctx.lineTo(sx+3*s,sy-5.6*s); pctx.closePath(); pctx.fill();
    pctx.beginPath(); pctx.moveTo(sx+3*s,sy-5.6*s); pctx.lineTo(sx+4*s,sy-7.2*s); pctx.lineTo(sx+4.6*s,sy-5.2*s); pctx.closePath(); pctx.fill();
    pctx.strokeStyle='#3a322c'; pctx.lineWidth=Math.max(1.4,2*s); pctx.beginPath(); pctx.moveTo(sx-3*s,sy-1*s); pctx.quadraticCurveTo(sx-6*s,sy-2*s+flick,sx-5*s,sy-5*s+flick); pctx.stroke();
    pctx.fillStyle=night?'#ffe06a':'#9ad7c0'; pctx.fillRect(sx+1.8*s,sy-4.4*s,0.9*s,0.9*s); pctx.fillRect(sx+3.2*s,sy-4.4*s,0.9*s,0.9*s);
    return; }
}

function drawVillager(n,s){
  const [sx,sy0]=iw2p(n.x,n.y);
  if(sx<-30||sx>IW+30||sy0<-30||sy0>IH+30) return;
  const r=5*s, bob=n.mv?Math.abs(Math.sin(n.ph*2))*1*s:0, sy=sy0-bob;
  const fa=Math.atan2(n.fy||1,n.fx||0), pfx=Math.cos(fa), pfy=Math.sin(fa), ppx=-pfy, ppy=pfx;
  const stride=n.mv?Math.sin(n.ph*2)*r*0.5:0;
  pctx.fillStyle='rgba(0,20,10,.26)'; pctx.beginPath(); pctx.ellipse(sx,sy0+r*0.6,r*0.9,r*0.42,0,0,TAU); pctx.fill();
  pctx.fillStyle='#2c2418';
  pctx.beginPath(); pctx.ellipse(sx+ppx*r*0.4+pfx*stride, sy0+ppy*r*0.4+pfy*stride, r*0.26, r*0.2, fa, 0, TAU); pctx.fill();
  pctx.beginPath(); pctx.ellipse(sx-ppx*r*0.4-pfx*stride, sy0-ppy*r*0.4-pfy*stride, r*0.26, r*0.2, fa, 0, TAU); pctx.fill();
  pctx.fillStyle='#241c12'; pctx.beginPath(); pctx.arc(sx,sy,r*1.0,0,TAU); pctx.fill();
  pctx.fillStyle=n.coat; pctx.beginPath(); pctx.arc(sx,sy,r*0.86,0,TAU); pctx.fill();
  pctx.fillStyle='#e8c39a'; pctx.beginPath(); pctx.arc(sx+pfx*r*0.2,sy+pfy*r*0.2,r*0.42,0,TAU); pctx.fill();
  if(n.hat){ pctx.fillStyle='#54483c'; pctx.beginPath(); pctx.ellipse(sx-pfx*r*0.12,sy-pfy*r*0.12,r*0.6,r*0.52,0,0,TAU); pctx.fill();
    pctx.fillStyle='#6a5c4c'; pctx.beginPath(); pctx.arc(sx-pfx*r*0.14,sy-pfy*r*0.14,r*0.36,0,TAU); pctx.fill(); }
  else { pctx.fillStyle='#4a3520'; pctx.beginPath(); pctx.arc(sx-pfx*r*0.16,sy-pfy*r*0.16,r*0.4,0,TAU); pctx.fill(); }
}
