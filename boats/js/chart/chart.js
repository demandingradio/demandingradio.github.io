"use strict";
/* FILE: js/chart/chart.js
The chart: the minimap in the corner and the full parchment chart (M), with PROJECT SMOOTH CHART's motion, underlay and repaint.
Moved verbatim from original lines 11011-11415 (build 5109cd5); loads in place, right after the toasts drawer.
Entry points: drawMinimap (from drawHUD), fmFrame (from frameInner), fmToggle, fmKey, fmWheel, fmReset, fmRub (input and pad),
  openFullMap, renderFullMap, drawFullMap, mapRect, screenToMapWorld, signsByIsle, signLabel, chartLand, skullCv, roundRect.
Globals it owns: drawSignGlyph, SKULL_PX, SKULLC, skullCv, signsByIsle, signLabel, SIGN_COL, chartCols, chartOwner, chartLand,
  MMC, drawMinimap, the fm* functions (fmFrame ... fmCursor), mapRect, screenToMapWorld, clampMap, zoomMap, panMap,
  openFullMap, renderFullMap, drawFullMap, and roundRect (a shared canvas helper used well beyond the chart).
Globals it reads from elsewhere: the chart state in the core (mmCanvas/mmCtx/mmImg, the fm* lets, FMV, FMU, EXS, COURSE,
  fmNote, padMapCross: original lines 4546-4557 (build 5109cd5)), mapOpen (original line 4542 (build 5109cd5)), explored,
  cores, signs, boat, buoys, whales, SAGA, TUNE, WORLD, EXP, EGW, SEA, ctx, cv, CSSW, CSSH, SB (original line 8218 (build 5109cd5)),
  and many helpers from the seas, whaling, course, story and HUD code.
Load-time statements: none. Only function declarations and const/let with pure literal initialisers
  (SKULL_PX/SKULLC, SIGN_COL, MMC).
Called at runtime only; the wheel and keydown listeners (original lines 4888 and 4796 (build 5109cd5)) call fmWheel/fmKey,
  so an input event during page load before this file has run would throw in that handler (map residual R1).
*/

/* a signpost on the chart: a post and an arrow-board pointing on out — parchment for your furthest claim, dark red where you fell */
function drawSignGlyph(px,py,kind,k){ k=k||1;
  ctx.strokeStyle='#4a2e14'; ctx.lineWidth=1.6*k; ctx.beginPath(); ctx.moveTo(px,py+3*k); ctx.lineTo(px,py-9*k); ctx.stroke();
  ctx.fillStyle=kind==='fell'?'#9a2c2c':kind==='deep'?'#34458e':kind==='top'?'#d98a1c':kind==='lantern'?'#ffd860':'#f0dca0'; ctx.beginPath();
  ctx.moveTo(px-1.5*k,py-10*k); ctx.lineTo(px+6*k,py-10*k); ctx.lineTo(px+8.8*k,py-7.4*k); ctx.lineTo(px+6*k,py-4.8*k); ctx.lineTo(px-1.5*k,py-4.8*k); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#2e1c0a'; ctx.lineWidth=1*k; ctx.stroke();
  if(kind==='deep'){ ctx.fillStyle='#dfe4ff'; ctx.beginPath(); ctx.moveTo(px+1.2*k,py-8.9*k); ctx.lineTo(px+5.2*k,py-8.9*k); ctx.lineTo(px+3.2*k,py-5.9*k); ctx.closePath(); ctx.fill(); }   // (a pale ▼ — the way down)
  if(kind==='fell'){ ctx.fillStyle='#ffe0d0'; ctx.fillRect(px+1.5*k,py-8.2*k,1.6*k,1.6*k); ctx.fillRect(px+4*k,py-8.2*k,1.6*k,1.6*k); }   // (two pale pips — a skull's eyes)
  if(kind==='lantern'){ ctx.fillStyle='#4a2e10'; ctx.fillRect(px+2*k,py-9.4*k,3*k,4*k); ctx.fillStyle='#fff0a0'; ctx.fillRect(px+2.8*k,py-8.6*k,1.4*k,2.2*k); }   // (INTROSTORY C14: his lantern on the board)
  if(kind==='top'){ ctx.strokeStyle='#fff3c0'; ctx.lineWidth=0.9*k; ctx.beginPath(); ctx.moveTo(px+0.8*k,py-9.2*k); ctx.lineTo(px+5.6*k,py-5.6*k); ctx.moveTo(px+5.6*k,py-9.2*k); ctx.lineTo(px+0.8*k,py-5.6*k); ctx.stroke(); } }   // (crossed blades — the hardest you've conquered)
/* §8.10 THE CHART SKULL: a pixel skull in a boss threat's colour (Hard and worse) left of a wild isle's ⚔N — k px a texel, a dark 1-texel outline, baked once per colour & size */
const SKULL_PX=['.###.','#####','#.#.#','##.##','.###.','.#.#.'], SKULLC={};
function skullCv(col,k){ const key=col+k; if(SKULLC[key]) return SKULLC[key]; const w=7, h=8, cv=document.createElement('canvas'); cv.width=w*k; cv.height=h*k; const g=cv.getContext('2d');
  g.fillStyle='#1a0e04'; for(let y=0;y<6;y++) for(let x=0;x<5;x++) if(SKULL_PX[y][x]==='#') g.fillRect(x*k,y*k,3*k,3*k);   // (the outline: every lit texel's ring — the eyes & nose stay dark)
  g.fillStyle=col; for(let y=0;y<6;y++) for(let x=0;x<5;x++) if(SKULL_PX[y][x]==='#') g.fillRect((x+1)*k,(y+1)*k,k,k);
  g.fillStyle='rgba(255,255,255,.45)'; g.fillRect(2*k,1*k,2*k,k);                                                       // (a glint on the crown)
  return SKULLC[key]=cv; }
/* your marks, grouped by isle — several on one isle stack instead of piling up (far · top · fell · deep) */
function signsByIsle(){ const G=new Map(); for(const k of ['far','top','fell','deep']){ const s=signs[k], c=s&&cores[s.ci]; if(!c) continue; if(!G.has(c)) G.set(c,[]); G.get(c).push([k,s]); } { const c=SAGA ? sagaLantC() : null; if(c){ if(!G.has(c)) G.set(c,[]); G.get(c).push(['lantern',{ci:c.idx}]); } } return G; }
function signLabel(k,s){ return k==='lantern'?'the Far Lantern — Ansel Wake kept the light' : k==='far'?'furthest claim · ⚔'+s.dg : k==='top'?'hardest conquered · ⚔'+s.dg+(s.fl?' (▼'+s.fl+')':'') : k==='deep'?'▼ deepest · Floor '+s.fl : '☠ here I fell · ⚔'+s.dg; }
const SIGN_COL={far:'#6a4a14', top:'#8a5208', fell:'#8a2020', deep:'#2a3a8a', lantern:'#7a5208'};
/* minimap — the live chart in the corner, painted from what you've explored ----- */
/* the charts' land, by biome: each land texel takes the isle whose reach is nearest (d²/r², like the sea's own ownership) — parchment-muted */
function chartCols(c){ if(c._chc) return c._chc; const S=SB[(c.port?slPortBiome(c):biomeOf(c)).key]||SB.tropic, P=[233,220,192], m=(h,t)=>{ const v=parseInt(h.slice(1),16); return [Math.round(((v>>16)&255)*(1-t)+P[0]*t),Math.round(((v>>8)&255)*(1-t)+P[1]*t),Math.round((v&255)*(1-t)+P[2]*t)]; };
  return c._chc=[m(S.B[2],0.3), m(S.L[1],0.26), m(S.M[1],0.22), m(S.H[1],0.2)]; }
function chartOwner(cs,wx,wy){ let b=null, bd=1e18; for(let i=0;i<cs.length;i++){ const c=cs[i], dx=wx-c.x, dy=wy-c.y, d=(dx*dx+dy*dy)/(c.r*c.r); if(d<bd){ bd=d; b=c; } } return b; }
function chartLand(cs,wx,wy,e){ const o=cs&&cs.length?chartOwner(cs,wx,wy):null; if(!o) return null; const C=chartCols(o); return e<0.06?C[0]:e<0.3?C[1]:e<0.55?C[2]:C[3]; }
const MMC={x:-1e9, y:-1e9, f:99};
function drawMinimap(){
  const size=Math.min(196, CSSW*0.24), pad=14;
  const mx=CSSW-size-pad, my=CSSH-size-pad; hudRec('minimap',mx,my,size,size);
  const span=1500;                          // world units shown across the minimap
  const MM=98;
  if(!mmImg){ mmCanvas=document.createElement('canvas'); mmCanvas.width=MM; mmCanvas.height=MM;
    mmCtx=mmCanvas.getContext('2d'); mmImg=mmCtx.createImageData(MM,MM); }
  const data=mmImg.data, x0=boat.x-span/2, y0=boat.y-span/2, step=span/MM;
  const mmRe = Math.abs(boat.x-MMC.x)>step*0.5 || Math.abs(boat.y-MMC.y)>step*0.5 || ++MMC.f>=6;             // (re-inked when she's moved a texel, or every few frames)
  const cs=mmRe && TUNE.seaLand>0 ? coresNear(boat.x,boat.y,span*0.72+400) : null; if(mmRe){ MMC.x=boat.x; MMC.y=boat.y; MMC.f=0; }
  if(mmRe) for(let j=0;j<MM;j++){ const wy=y0+(j+0.5)*step;
    for(let i=0;i<MM;i++){ const wx=x0+(i+0.5)*step, di=(j*MM+i)*4;
      let R=233,G=220,B=192;                 // unknown = blank parchment
      if(wx>=0&&wy>=0&&wx<WORLD&&wy<WORLD && (dev.revealAll || explored.has(Math.floor(wx/EXP)+Math.floor(wy/EXP)*EGW))){
        const h=heightAt(wx,wy);
        if(h<SEA){ const d=clamp((SEA-h)/0.5,0,1); if(d<0.16){R=150;G=178;B=178;} else {R=120;G=150;B=170;} }
        else { const e=clamp(h/1.1,0,1);
          const q=cs?chartLand(cs,wx,wy,e):null; if(q){ R=q[0]; G=q[1]; B=q[2]; }
          else if(e<0.06){R=206;G=182;B=128;} else if(e<0.5){R=96;G=140;B=80;} else {R=70;G=104;B=66;}
          if(heightAt(wx+EXP,wy)<SEA||heightAt(wx-EXP,wy)<SEA||heightAt(wx,wy+EXP)<SEA||heightAt(wx,wy-EXP)<SEA){R=74;G=58;B=36;} }
      }
      data[di]=R; data[di+1]=G; data[di+2]=B; data[di+3]=255;
    }
  }
  if(mmRe) mmCtx.putImageData(mmImg,0,0);
  ctx.save();
  ctx.imageSmoothingEnabled=false; pxPanel(mx-7,my-7,size+14,size+14,PXP.brass);                                   // the chart in a brass pixel frame
  ctx.beginPath(); ctx.rect(mx,my,size,size); ctx.clip();
  ctx.imageSmoothingEnabled=true;
  ctx.drawImage(mmCanvas, 0,0,MM,MM, mx,my,size,size);
  ctx.strokeStyle='rgba(90,70,40,.12)'; ctx.lineWidth=1;
  for(let i=1;i<5;i++){ ctx.beginPath(); ctx.moveTo(mx+size*i/5,my); ctx.lineTo(mx+size*i/5,my+size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx,my+size*i/5); ctx.lineTo(mx+size,my+size*i/5); ctx.stroke(); }
  seasMiniPips(mx,my,size,span);            // (SEAS SE4 §2.6) the landmarks in sight — pips on the rim, first: under the ports, the whale's flare & the story's pin
  // discovered port markers — ports just over the horizon clamp to the chart's edge, still clickable
  for(const c of coresNear(boat.x,boat.y,4200)){ if(!c.port) continue; if(!c.found && !dev.revealAll) continue;
    let px=mx+(c.x-boat.x)/span*size+size/2, py=my+(c.y-boat.y)/span*size+size/2;
    const off = px<mx+5||px>mx+size-5||py<my+5||py>my+size-5;
    if(off){ if(Math.hypot(c.x-boat.x,c.y-boat.y)>4000) continue;
      px=clamp(px,mx+7,mx+size-7); py=clamp(py,my+7,my+size-7); }
    ctx.globalAlpha=off?0.7:1;
    ctx.fillStyle=c.found?'#b8482f':'#9a7a55'; ctx.beginPath(); ctx.arc(px,py,off?2.6:2.6+portSizeOf(c)*0.7,0,TAU); ctx.fill();
    ctx.strokeStyle='#fff6dd'; ctx.lineWidth=1; ctx.stroke(); ctx.globalAlpha=1;
  }
  // cleared isles fly a little golden flag on the chart
  for(const c of coresNear(boat.x,boat.y,span*0.75)){ if(!c.cleared) continue;
    const px=mx+(c.x-boat.x)/span*size+size/2, py=my+(c.y-boat.y)/span*size+size/2;
    if(px<mx+4||px>mx+size-6||py<my+8||py>my+size-4) continue;
    ctx.strokeStyle='#7a5a1c'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(px,py+3); ctx.lineTo(px,py-5); ctx.stroke();
    ctx.fillStyle='#e7b416'; ctx.beginPath(); ctx.moveTo(px,py-5); ctx.lineTo(px+5.5,py-3.2); ctx.lineTo(px,py-1.4); ctx.closePath(); ctx.fill();
  }
  // each charted wild isle's danger — a small coloured number (green under your band · amber yours · orange/red above · purple skull far beyond)
  { const band=youBand(); ctx.font='800 9px system-ui'; ctx.textAlign='center'; ctx.lineJoin='round';
    for(const c of coresNear(boat.x,boat.y,span*0.75)){ if(c.port||c.cleared||(!c.found&&!dev.revealAll)) continue;
      const px=mx+(c.x-boat.x)/span*size+size/2, py=my+(c.y-boat.y)/span*size+size/2;
      if(px<mx+8||px>mx+size-8||py<my+12||py>my+size-4) continue;
      if(!isleLandable(c)) continue;                                               // (no landing on her — no badge)
      const dg=dangerOf(c), v=isleVerdict(c,band), tx=(v.i>=4?'☠':'')+dg, bt=bossThreat(c,band);
      ctx.strokeStyle='rgba(28,18,6,.85)'; ctx.lineWidth=2.6; ctx.strokeText(tx,px+7,py-4); ctx.fillStyle=v.col; ctx.fillText(tx,px+7,py-4);
      if(bt && bt.i>=2){ const sk=skullCv(bt.col,1), tw2=ctx.measureText(tx).width; ctx.drawImage(sk, Math.round(px+7-tw2/2-sk.width-1), Math.round(py-12)); } }   // (§8.10: her guardian's skull pip — Hard or worse)
    ctx.textAlign='left'; }
  // your furthest marks — a signpost where you got to, a dark one where the sea stopped you, a deep-blue one over your deepest cave
  for(const [c,L] of signsByIsle()){ const px=mx+(c.x-boat.x)/span*size+size/2, py=my+(c.y-boat.y)/span*size+size/2;   // (several marks on one isle stand side by side)
    if(px<mx+6||px>mx+size-12-9*(L.length-1)||py<my+12||py>my+size-6) continue;
    L.forEach(([k],i)=>drawSignGlyph(px+i*9,py,k,0.9)); }
  if(SAGA) sagaLantMini(mx,my,size,span);   // (INTROSTORY C14: the Far Lantern, lit — a gold pixel beside its signposts)
  // the Craftsman's buoys within the glass
  for(const b of buoys){
    const px=mx+(b.x-boat.x)/span*size+size/2, py=my+(b.y-boat.y)/span*size+size/2;
    if(px<mx+5||px>mx+size-5||py<my+5||py>my+size-5) continue;
    ctx.save(); ctx.translate(px,py); ctx.rotate(Math.PI/4);
    ctx.fillStyle='#2a9a98'; ctx.fillRect(-2.6,-2.6,5.2,5.2); ctx.restore();
    ctx.strokeStyle='#fff6dd'; ctx.lineWidth=1; ctx.strokeRect(px-1.2,py-1.2,2.4,2.4);
  }
  // contract & rumor marks within the glass
  for(const mk of allMarks()){
    const px=mx+(mk.x-boat.x)/span*size+size/2, py=my+(mk.y-boat.y)/span*size+size/2;
    if(px<mx+5||px>mx+size-5||py<my+5||py>my+size-5) continue;
    ctx.save(); ctx.translate(px,py); ctx.rotate(Math.PI/4);
    ctx.fillStyle=MK_COL[mk.kind]||'#8a5c2e'; ctx.fillRect(-3,-3,6,6); ctx.restore();
    ctx.strokeStyle='#fff6dd'; ctx.lineWidth=1; ctx.strokeRect(px-1.5,py-1.5,3,3);
  }
  // nearest few uncleared wild isles — a "something to do here" nudge (amber pulsing pips)
  { ctx.globalAlpha=1;
    const todo=coresNear(boat.x,boat.y,6000).filter(c=>c.found&&!c.cleared&&!c.port&&isleLandable(c))
      .sort((a,b)=>((a.x-boat.x)**2+(a.y-boat.y)**2)-((b.x-boat.x)**2+(b.y-boat.y)**2)).slice(0,4);
    for(let k=0;k<todo.length;k++){ const c=todo[k];
      let px=mx+(c.x-boat.x)/span*size+size/2, py=my+(c.y-boat.y)/span*size+size/2;
      const off=px<mx+7||px>mx+size-7||py<my+7||py>my+size-7;
      if(off){ if(k>0) continue;                       // only the nearest one clamps to the rim, as a pointer
        px=clamp(px,mx+8,mx+size-8); py=clamp(py,my+8,my+size-8); }
      const pl=0.5+0.5*Math.sin(time*4-k*0.8);
      ctx.strokeStyle='rgba(255,154,60,'+(0.55*(1-pl)).toFixed(2)+')'; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(px,py,3.4+pl*3.2,0,TAU); ctx.stroke();
      ctx.fillStyle='#ff9a3c'; ctx.beginPath(); ctx.arc(px,py,2.7,0,TAU); ctx.fill();
      ctx.strokeStyle='#ffe6a6'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(px,py,2.7,0,TAU); ctx.stroke(); } }
  for(let i=0;i<whales.length;i++){ const w=whales[i]; if(w.st==='gone' || !w.mmS) continue;   // (PT2 X2) WHALES — a sighting flares (rings & a bright spouting whale), then a steady mark while she's on the glass
    const age=whaleFlareAge(w); let px=mx+(w.x-boat.x)/span*size+size/2, py=my+(w.y-boat.y)/span*size+size/2;
    if(px<mx+6||px>mx+size-6||py<my+6||py>my+size-6){ if(age<0) continue; px=clamp(px,mx+9,mx+size-9); py=clamp(py,my+9,my+size-9); }   // (off the glass: a fresh flare rides the rim her way)
    whaleMark(ctx, px, py, age, Math.cos(w.a)>=0, 1.1, w.depth>0.6?0.45:1); }
  if(COURSE && !ptMode){ const hx=(COURSE.x-boat.x)/span*size, hy=(COURSE.y-boat.y)/span*size, m=Math.max(Math.abs(hx),Math.abs(hy)), lim=size/2-7, off=m>lim, k=off?lim/m:1;   // (PT1 W5) the course marker — off the glass, it rides the rim her way
    ctx.globalAlpha=off?0.8:1; courseStar(ctx, mx+size/2+hx*k, my+size/2+hy*k, 6, '#ffd86b', '#3a2410'); ctx.globalAlpha=1; }
  if(SAGA) sagaMkMini(mx,my,size,span);                             // (INTROSTORY C4b) the goal's quill pin — off the glass, it rides the rim
  // boat marker (arrow)
  const bx=mx+size/2, by=my+size/2;
  ctx.translate(bx,by); ctx.rotate(boat.a+Math.PI/2);
  ctx.fillStyle='#c0202a'; ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(5,6); ctx.lineTo(0,3); ctx.lineTo(-5,6); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#fff'; ctx.lineWidth=1; ctx.stroke();
  ctx.restore();
  // label
  ctx.fillStyle='rgba(8,17,31,.5)'; roundRect(mx,my-2,52,16,6); ctx.fill();
  ctx.fillStyle='#cfe0ff'; ctx.font='10px system-ui'; ctx.textAlign='left'; ctx.fillText('CHART', mx+8, my+10);
}

/* full parchment map (M) — the whole world, painted from explored cells on open -- */
/* full map (M) — pannable/zoomable chart, drawn the same crisp way as the minimap */
/* ============================ PROJECT SMOOTH CHART (CH) — the chart's motion, its settle-time repaint, its underlay ============================ */
function fmFrame(ts){ const V=FMV;   // (CH Q1) every chart frame (sea · port · deck): the clock, "moving", the underlay, the ONE repaint once still, the draw
  let iv=V.ts===null?0:ts-V.ts; if(iv<0){ V.mvTs=Math.min(V.mvTs,ts); V.st=Math.min(V.st,ts); V.rlTs=-1e9; iv=0; }   // (a clock that went back can't hold the repaint off)
  if(iv>0 && iv<=100 && !V.rp){ V.iv.push(iv); if(V.iv.length>15) V.iv.shift(); const A=V.iv, s=V.ivs, n=A.length; for(let i=0;i<n;i++){ const x=A[i]; let j=i-1; while(j>=0 && s[j]>x){ s[j+1]=s[j]; j--; } s[j+1]=x; } V.vEst=s[n>>1]; }   // the display's interval: median of 15, never after a repaint (CH Q1 · CH1C-1: sorted in place, no per-frame garbage)
  let dt=Math.min(Math.max(iv/1000,0),0.1); if(V.rp || iv>4*V.vEst) dt=Math.min(dt,V.vEst/1000); V.dt=dt;   // a freeze is never integrated (F1's motions read V.dt)
  if(iv>1000){ V.gv.x=V.gv.y=0; V.kv.x=V.kv.y=0; }                         // (CH F1) a gap over 1 s (a hidden tab): the glide & the keys' run stop — the ease simply goes on
  if(V.stF){ const g=ts-V.st, W=Math.max(TUNE.chSettle,TUNE.chNotchWait), P=V.pg, Te=TUNE.chEase>0?1000*TUNE.chEase*Math.log(Math.log(Math.max(TUNE.chZoom,1.01))/0.002):0; V.sd=g<250?clamp(2*g,TUNE.chSettle,W):(TUNE.chNotchWait>0 && P>=250 && P<=1100 && g<=1100 ? clamp(1.3*Math.max(g,P)-Te,W,1100) : W); V.pg=g; V.nw=1; V.st=ts; V.stF=0; }   // (CH Q1 · CH1-B1) a step (a wheel notch) waits by its rhythm: lone (≥ 0.25 s) → 500 ms, else twice its gap (150…500) — notching 0.15–0.25 s apart never repaints between notches (CH2V-B1: two slow gaps in a row, 0.25–1.1 s → the wait covers 1.3 × the longer gap, counted from the end of the notch's glide (Te, 255 ms), 500…1100 ms — a slow series learns its rhythm; ≤ 0.6 s rhythms unchanged · chNotchWait 0 keeps 150)
  if(V.rel){ const R=V.rel; if(R.moved && !fmDrag && TUNE.chGlide>0 && V.pn>1){ const S=V.ps, l=((V.pn-1)%32)*3, tl=S[l]; let o=l; for(let k=1, N=Math.min(V.pn,32); k<N; k++){ const q=((V.pn-1-k)%32)*3; if(S[q]<tl-80) break; o=q; }   // (CH F1) the glide, decided here on frame time: the pointer's travel over the last 80 ms of its held-frame samples (≥ 50 ms of span)
      const w=Math.max(tl-S[o],50)/1000, vx=(S[l+1]-S[o+1])/w, vy=(S[l+2]-S[o+2])/w, m=Math.hypot(vx,vy); if(m>=120){ const c=Math.min(1,3000/m); V.gv.x=vx*c; V.gv.y=vy*c; V.gt=ts; } }   // (CH F1: ≥ 120 px/s to start · ≤ 3,000 · a still release or a wobbly click never flings)
    if(!fmDrag) V.pn=0; V.mvTs=ts; V.rlTs=R.moved?ts:-1e9; V.rel=null; }    // a release restarts the settle timer (CH Q1 · CH1-B3: a drag's release is stamped · CH F1: the samples go)
  if(fmDrag){ const S=V.ps, j=(V.pn%32)*3; S[j]=ts; S[j+1]=V.px; S[j+2]=V.py; V.pn++; }   // (CH F1) a pointer sample every frame a press is held (a ring — no garbage)
  if(V.hv){ V.hv=0; if(ts-V.rlTs<600) V.mvTs=ts; }                         // (CH Q1 · CH1-B3) the free pointer moving over the chart ≤ 0.6 s after a drag (re-grabbing) holds the settle — it sharpens once the hand rests
  const MR=mapRect(); fmTick(dt,ts,MR);                                     // (CH F1) every motion: pad → keys → glide → ease → spring (CH2C-3: one mapRect a frame, shared)
  if(V.mvF){ const R=V.ref, sz=MR.size, sc=sz/fmSpan;               // moving = ≥ 0.5 CSS px at the chart's edge since the last stamp
    if(Math.abs(fmCX-R.cx)*sc>=0.5 || Math.abs(fmCY-R.cy)*sc>=0.5 || Math.abs(Math.log(fmSpan/R.s))*sz/2>=0.5){ V.mvTs=ts; R.cx=fmCX; R.cy=fmCY; R.s=fmSpan; } V.mvF=0; }
  if(V.nwP && !V.nw) V.mvTs=ts;   // (CH CRB-1) a key / the stick / a trackpad / a drag ended a lone step's wait: the settle counts from this frame — never a repaint on a new gesture's first (sub-0.5 px) frame
  if(TUNE.chUnder>0 && !dev.revealAll) fmUnderSync(1500);
  if((fmDirty || !fmCanvas || fmViewNe()) && fmSettled(ts)){ renderFullMap(); fmRenderTs=ts; fmDirty=false; V.rp=1; const R=V.ref; R.cx=fmCX; R.cy=fmCY; R.s=fmSpan; } else V.rp=0;   // (CH Q1 · CH1-B4: "moving" is then measured from the painted view)
  drawFullMap(); fmCursor(MR); V.ts=ts; V.nwP=V.nw; }   // (CH F1: the hand cursor · CH CRB-1: this frame's "a step" kept for the next)
function fmSettled(ts){ return fmDrag===null && ts-FMV.mvTs>=(FMV.nw?FMV.sd:TUNE.chSettle); }   // (CH Q1) no press held, and still long enough (CH1-B1: after a step, its own wait)
function fmViewNe(){ if(!fmCanvas) return true; const z=mapRect().size, h=Math.max(fmRSpan/(fmCanvas.width||520)/2, 0.5*fmSpan/z); return Math.abs(fmCX-fmRX)>h || Math.abs(fmCY-fmRY)>h || Math.abs(Math.log(fmSpan/fmRSpan))*z/2>0.5; }   // (CH Q1) the view ≠ the painted one (> half a texel · CH1-B4: and > 0.5 CSS px, the "moving" metric — a sub-pixel nudge never repaints unsettled)
function fmReset(off){ const V=FMV; V.ts=null; V.mvTs=-1e9; V.mvF=0; V.rp=0; V.nw=0; V.nwP=0; V.sd=500; V.st=-1e9; V.pg=0; V.rel=null; V.rlTs=-1e9; V.hv=0; V.ref={cx:fmCX, cy:fmCY, s:fmSpan}; fmDrag=null;   // (CH Q1 · CH F1: off = the chart shut) every open: the first frame paints at once · a button held from before can't drag the new view
  if(off) for(const k of V.k) if(!V.ko.has(k)){ SCN_LATCH.add(k); if(k==='=') SCN_LATCH.add('+'); else if(k==='-') SCN_LATCH.add('_'); } V.k.clear(); V.ko.clear(); V.kv.x=V.kv.y=0; V.gv.x=V.gv.y=0; V.pv.x=V.pv.y=0; V.pz=0; V.z.t=null; V.rb.x=V.rb.y=0; V.pn=0; if(V.cur){ cv.style.cursor=''; V.cur=''; } }   // (CH F1) …and every motion stops · shut (off): a key held on the chart waits for its keyup (a W held across M never sails) · the cursor back
function fmUnderSync(n){ const U=FMU, D=U.dirty; if(!D.length || !U.img) return 0; const d=U.img.data, m=Math.min(n,D.length); let x0=512,y0=512,x1=-1,y1=-1;   // (CH Q1) ≤ n newly covered texels a frame, coloured as renderFullMap colours that cell (no coast ink)
  for(let i=0;i<m;i++){ const t=D.pop(), key=U.rep[t], wx=(key%EGW+0.5)*EXP, wy=(((key/EGW)|0)+0.5)*EXP, h=rawHeight(wx,wy); let R,G,B;
    if(h<SEA){ const dp=clamp((SEA-h)/0.5,0,1); if(dp<0.16){R=150;G=178;B=178;} else {R=120;G=150;B=170;} }
    else { const e=clamp(h/1.1,0,1), q=TUNE.seaLand>0?chartLand(coresNear(wx,wy,620),wx,wy,e):null; if(q){R=q[0];G=q[1];B=q[2];} else if(e<0.06){R=206;G=182;B=128;} else if(e<0.5){R=96;G=140;B=80;} else {R=70;G=104;B=66;} }
    const o=t*4, tx=t&511, ty=t>>9; d[o]=R; d[o+1]=G; d[o+2]=B; d[o+3]=255; if(tx<x0)x0=tx; if(tx>x1)x1=tx; if(ty<y0)y0=ty; if(ty>y1)y1=ty; }
  U.g.putImageData(U.img,0,0,x0,y0,x1-x0+1,y1-y0+1); return m; }   // (only the batch's dirty rectangle)
function fmUnderDraw(mx,my,size,ox,oy,sc){ ctx.fillStyle='rgb(212,201,174)'; ctx.fillRect(mx,my,size,size);   // (CH Q1) the picture doesn't cover the view: beyond-the-world · parchment over the world · the underlay's view rect
  const x0=Math.max(mx,mx-ox*sc), y0=Math.max(my,my-oy*sc), x1=Math.min(mx+size,mx+(WORLD-ox)*sc), y1=Math.min(my+size,my+(WORLD-oy)*sc); if(!(x1>x0 && y1>y0)) return;
  ctx.fillStyle='#e9dcc0'; ctx.fillRect(x0,y0,x1-x0,y1-y0); const U=FMU; if(!U.cv) return; const T=WORLD/512;
  ctx.drawImage(U.cv, ((x0-mx)/sc+ox)/T, ((y0-my)/sc+oy)/T, (x1-x0)/sc/T, (y1-y0)/sc/T, x0, y0, x1-x0, y1-y0); }
function fmWheel(e){ if(!started || !mapOpen) return; e.preventDefault(); if(GCH.open) return;   // (CH CRC-2: with the M chart open the page never zooms — under the Long Chart too, as before CH) (CH Q1) the wheel: notches counted (×chZoom each, on any screen), small events proportional, Ctrl-pinch, sideways / zero ignored
  const V=FMV, m=e.deltaMode|0, dy=+e.deltaY||0, dx=+e.deltaX||0; V.wl.push({dy:+dy.toFixed(2), dx:+dx.toFixed(2), mode:m, ctrl:e.ctrlKey?1:0, dpr:window.devicePixelRatio||1}); if(V.wl.length>16) V.wl.shift();
  if(!dy || Math.abs(dx)>Math.abs(dy)) return;                              // (a tilt wheel, Shift+wheel, a sideways swipe — no longer zooms in)
  const dpr=window.devicePixelRatio||1; if(V.Ud!==dpr){ V.U[0]=V.U[1]=V.U[2]=0; V.Ud=dpr; }   // (CH Q1 · CH1-B2) the notch is learned per devicePixelRatio: another monitor's scaling or a page zoom starts it over (else the unit only shrinks)
  const px=dy*(m===1?33.33:m===2?400:1), a=Math.abs(px), L=Math.log(TUNE.chZoom); let dl;
  if(e.ctrlKey && m===0 && Math.abs(dy)<50){ dl=clamp(0.01*px,-0.4,0.4); V.nw=0; }   // a trackpad pinch: 1:1 with the fingers
  else if(m!==0 || a>=50){ if(!V.U[m] || a<0.8*V.U[m]) V.U[m]=a; dl=Math.sign(px)*clamp(Math.round(a/V.U[m]),1,3)*L; V.stF=1; }   // a notch: counted against the smallest seen in this deltaMode (≤ 3 an event)
  else { dl=L/100*clamp(px,-300,300); V.nw=0; }                             // a trackpad / hi-res wheel: by how far it scrolled
  const r=mapRect(), ax=clamp(e.clientX,r.mx,r.mx+r.size), ay=clamp(e.clientY,r.my,r.my+r.size);   // (over the dark margin: anchored on the square's edge)
  fmZoomBy(dl,ax,ay); }   // (CH F1: into the ease — it glides there, toward the pointer)
function fmToggle(e){ if(e && e.repeat) return; if(mapOpen){ mapOpen=false; fmReset(1); } else { mapOpen=true; openFullMap(); } }   // (CH Q1 · Ben M3) M held no longer flickers the chart (CH F1: shut — its held keys wait for their keyup)
function fmTick(dt,ts,R0){ const V=FMV, r=R0||mapRect(), sz=r.size, x0=fmCX, y0=fmCY, s0=fmSpan;   // (CH F1) every chart motion, on the frame's real elapsed time, integrated exactly (§2.1–2.2): pad → keys → glide → ease → spring
  if(V.pv.x||V.pv.y){ panMap(V.pv.x*dt, V.pv.y*dt); V.gv.x=V.gv.y=0; }   // the stick: rate × dt (panMap: the hard clamp, nw 0) · it stops a glide
  if(V.pz){ const os=fmSpan; zoomMap(Math.exp(V.pz*dt), null); if(fmSpan!==os) V.nw=0; } V.pv.x=V.pv.y=0; V.pz=0;   // the triggers straight to the span (they stop the moment they're released) · consumed: a pad that stops reporting stops the chart
  if((PLOG && PLOG.box) || GCH.open){ V.k.clear(); V.ko.clear(); }          // (the playtest note box, or the Long Chart over the chart: the held keys are released)
  let tx=0, ty=0, sh=1, cz=0; if(V.k.size) for(const k of V.k){ const a=V.kx[k], b=V.ky[k], h0=V.kh[k]||0; if(a) tx=a; else if(b) ty=b; else if(k==='shift') sh=2.5;   // the last pressed wins on each axis · Shift ×2.5
    else if(k==='='||k==='-') cz+=(k==='-'?1:-1)*Math.log(2.5)*Math.max(0,h0+dt-Math.max(h0,0.3)); V.kh[k]=h0+dt; }   // (+/- held past 0.3 s: ×2.5 a second · the hold summed from frame dt, never an event clock)
  if(V.ko.size) for(const k of V.ko) if(V.kh[k]>=0.1){ V.ko.delete(k); V.k.delete(k); }   // (the tap rule: a quick tap is held 0.1 s — every tap the same nudge)
  { const m=Math.hypot(tx,ty), u=m?TUNE.chKeyV*sh/m:0; let dx=0, dy=0;          // the pan keys: ramp τ 0.07 s to the speed · released τ 0.04 s · diagonals normalised
    for(let i=0;i<2;i++){ const t=(i?ty:tx)*u, v=i?V.kv.y:V.kv.x, T=t?0.07:0.04, e=Math.exp(-dt/T), d=t*dt+(v-t)*T*(1-e); let nv=t+(v-t)*e; if(!t && Math.abs(nv)<0.03) nv=0; if(i){ dy=d; V.kv.y=nv; } else { dx=d; V.kv.x=nv; } }
    if(dx||dy) panMap(dx,dy); if(tx||ty) V.gv.x=V.gv.y=0; }
  if(V.gv.x||V.gv.y){ const tg=TUNE.chGlide, gd=V.gt===ts?0:dt; if(!(tg>0)) V.gv.x=V.gv.y=0; else if(gd>0){ const e=Math.exp(-gd/tg), f=tg*(1-e)*fmSpan/sz, wx=-V.gv.x*f, wy=-V.gv.y*f, lo=-fmSpan*0.1, hi=WORLD+fmSpan*0.1, qx=fmCX+wx-clamp(fmCX+wx,lo,hi), qy=fmCY+wy-clamp(fmCY+wy,lo,hi);   // the glide: coasts τ chGlide from the release (not on its own frame)
      panMap(wx/fmSpan, wy/fmSpan); const ee=Math.exp(-gd/0.05); if(qx){ V.rb.x+=qx/fmSpan; V.gv.x*=ee; } else V.gv.x*=e; if(qy){ V.rb.y+=qy/fmSpan; V.gv.y*=ee; } else V.gv.y*=e;   // (into the edge: the eaten motion pours into the rubber and dies fast there, τ 0.05)
      if(Math.hypot(V.gv.x,V.gv.y)<50) V.gv.x=V.gv.y=0; } }                 // (stops below 50 px/s)
  const Z=V.z; if(cz && (Z.t==null || fmSpan!==Z.ls)){ Z.t=Math.log(fmSpan); Z.ax=Z.ay=null; Z.ls=fmSpan; }   // the ease (a zoom glides to its target, τ chEase): the held +/- run feeds the target and the shown span alike, so it stops on release
  if(Z.t!=null){ if(fmSpan!==Z.ls) Z.t=null; else { const L0=Math.log(fmSpan), LO=Math.log(1500), HI=Math.log(WORLD*1.06), tau=TUNE.chEase; Z.t=clamp(Z.t+cz,LO,HI);   // (someone else set the span — an open, the trigger, a tool: the ease lets go)
      let L1=clamp(tau>0 ? L0+cz+(Z.t-L0-cz)*(1-Math.exp(-dt/tau)) : Z.t, LO, HI); if(Math.abs(Z.t-L1)<0.002) L1=Z.t;   // (snapped under 0.002 — never by a long frame)
      if(L1!==L0){ const ax=fmDrag?V.px:Z.ax, ay=fmDrag?V.py:Z.ay; zoomMap(Math.exp(L1-L0), ax==null?null:screenToMapWorld(ax,ay,r)); if(cz) V.nw=0; }   // (the point under the pointer stays there · under a held drag the anchor follows the pointer)
      Z.ls=fmSpan; if(L1===Z.t) Z.t=null; } }
  if((V.rb.x||V.rb.y) && !fmDrag){ const e=Math.exp(-dt/0.07), R=0.06; for(let i=0;i<2;i++){ const d=fmRub(i?V.rb.y:V.rb.x)*e, q=Math.abs(d)*sz<0.5?0:-Math.sign(d)*R*Math.log(1-Math.abs(d)/R); if(i) V.rb.y=q; else V.rb.x=q; } V.mvF=1; V.mvTs=ts; }   // the spring: the shown overshoot back τ 0.07 s, snapped under 0.5 px · never while pressed · it holds the settle off
  if(fmDrag && (fmCX!==x0 || fmCY!==y0 || fmSpan!==s0)){ fmDrag.gx=fmCX+(V.rb.x+(V.px-r.mx)/sz-0.5)*fmSpan; fmDrag.gy=fmCY+(V.rb.y+(V.py-r.my)/sz-0.5)*fmSpan; } }   // (a zoom / key / stick under a held drag: the grab re-bases on the point now under the pointer)
function fmZoomBy(dl,ax,ay){ const V=FMV, Z=V.z; V.gv.x=V.gv.y=0;   // (CH F1) a zoom step (the wheel, +/-) moves the ease's target: it may lead the shown span by ≤ 6 notches (×2.31), within the limits · chEase 0 = instant (Q1) · it stops a glide
  if(!(TUNE.chEase>0)){ zoomMap(Math.exp(dl), ax==null?null:screenToMapWorld(ax,ay,mapRect())); return; }
  const L=Math.log(fmSpan); if(Z.t==null || fmSpan!==Z.ls) Z.t=L; Z.t=clamp(clamp(Z.t+dl,L-0.839,L+0.839),Math.log(1500),Math.log(WORLD*1.06)); Z.ax=ax; Z.ay=ay; Z.ls=fmSpan; }
function fmKey(k,e){ const V=FMV; k=k==='+'?'=':k==='_'?'-':k;   // (CH F1) THE chart's keys for sea, port & deck (+ their keyups): held keys live in their own set, in press order — never keys[] · canonical + → =, _ → - (keydown and keyup) · OS repeats change nothing
  if(e.type==='keyup'){ if(V.k.has(k)){ if((V.kx[k]||V.ky[k]) && (V.kh[k]||0)<0.1) V.ko.add(k); else V.k.delete(k); } return; }   // (a pan key released before 0.1 s is owed the rest — the tap rule)
  if(k==='backspace'||k==='delete'){ e.preventDefault(); if(COURSE) courseClear('⚑  Course cleared'); return; }   // (PT1 W5) the course, cleared
  if(e.repeat || e.metaKey) return; if(e.shiftKey && !V.k.has('shift')){ V.k.add('shift'); V.kh.shift=0; }   // (CH2C-5: a key with ⌘ / the Windows key never joins the held set — its keyup may never come)
  const a=V.kx[k], b=V.ky[k]; if(a||b){ for(const q of V.ko) if((a && V.kx[q]===-a) || (b && V.ky[q]===-b)){ V.ko.delete(q); V.k.delete(q); } }   // (an owed opposite tap gives way)
  else if(k==='='||k==='-'){ fmZoomBy((k==='-'?1:-1)*Math.log(1.25),null,null); V.stF=1; }   // (a fresh +/- = one eased ×1.25 step — a step for the settle · held past 0.3 s it runs on, in fmTick)
  else if(k!=='shift') return;
  V.k.delete(k); V.k.add(k); V.kh[k]=0; V.ko.delete(k); if(e.code) V.kc[e.code]=k; }   // (CH CRC-1) the physical key → the held key it joined as: its keyup frees it on any layout (a QWERTZ Shift+0 = released as 0)
function fmRub(r){ return r ? Math.sign(r)*0.06*(1-Math.exp(-Math.abs(r)/0.06)) : 0; }   // (CH F1) the rubber edge: the pull past the limit, squeezed to ≤ 6 % of the span (a fraction of it)
function fmCursor(R0){ const V=FMV, r=R0||mapRect(), w=fmDrag && fmDrag.moved ? 'grabbing' : (!GCH.open && V.px>=r.mx && V.px<=r.mx+r.size && V.py>=r.my && V.py<=r.my+r.size ? 'grab' : ''); if(w!==V.cur){ cv.style.cursor=w; V.cur=w; } }   // (CH F1) a hand over the chart, grabbing while it drags — set only on a change
function mapRect(){ const size=Math.min(CSSW,CSSH)*0.86; return {size, mx:(CSSW-size)/2, my:(CSSH-size)/2}; }
function screenToMapWorld(cx,cy,r){ return { x:fmCX+(fmRub(FMV.rb.x)+(cx-r.mx)/r.size-0.5)*fmSpan, y:fmCY+(fmRub(FMV.rb.y)+(cy-r.my)/r.size-0.5)*fmSpan }; }   // (CH F1: the view as shown — the rubber edge's offset in; bit-equal when it's 0)
function clampMap(){ fmSpan=clamp(fmSpan,1500,WORLD*1.06);
  fmCX=clamp(fmCX,-fmSpan*0.1,WORLD+fmSpan*0.1); fmCY=clamp(fmCY,-fmSpan*0.1,WORLD+fmSpan*0.1); }
function zoomMap(factor,cursor){ const ns=clamp(fmSpan*factor,1500,WORLD*1.06), ox=fmCX, oy=fmCY, os=fmSpan;   // (CH Q1)
  if(cursor){ fmCX=cursor.x-(cursor.x-fmCX)*(ns/fmSpan); fmCY=cursor.y-(cursor.y-fmCY)*(ns/fmSpan); }
  fmSpan=ns; clampMap(); if(fmCX!==ox||fmCY!==oy||fmSpan!==os) FMV.mvF=1; }   // (CH Q1: input moves the view — it never marks the picture dirty; fmFrame repaints once it's still)
function panMap(fx,fy){ const ox=fmCX, oy=fmCY; fmCX+=fmSpan*fx; fmCY+=fmSpan*fy; clampMap(); if(fmCX!==ox||fmCY!==oy){ FMV.mvF=1; FMV.nw=0; } }   // (CH Q1: keys & the stick — never a lone step)
function openFullMap(){ if(SAGA) sagaEvent('map');
  if(dev.revealAll){ fmCX=boat.x; fmCY=boat.y; fmSpan=20000; }          // a wide-but-readable default; zoom out for the whole world
  else {
    let minX=1e18,minY=1e18,maxX=-1e18,maxY=-1e18; const E=EXS; E.ok();   // (CH R1: the running box — no walk over the Set · the underlay's coverage comes from exAdd, nothing is painted on open)
    if(E.n){ minX=E.gx0*EXP; maxX=E.gx1*EXP; minY=E.gy0*EXP; maxY=E.gy1*EXP; }   // (CH R1: exactly the old walk's min / max of gx·EXP, gy·EXP)
    if(minX>maxX){ minX=maxX=boat.x; minY=maxY=boat.y; }
    minX=Math.min(minX,boat.x); maxX=Math.max(maxX,boat.x); minY=Math.min(minY,boat.y); maxY=Math.max(maxY,boat.y);
    for(const mk of allMarks().concat(COURSE?[COURSE]:[])){ if(mk.kind==='home') continue; minX=Math.min(minX,mk.x); maxX=Math.max(maxX,mk.x);   // contracts & rumors (and the course marker) stay on the glass (PT1 B4: a crewmate's home doesn't pull the frame)
      minY=Math.min(minY,mk.y); maxY=Math.max(maxY,mk.y); }
    fmCX=(minX+maxX)/2; fmCY=(minY+maxY)/2; fmSpan=Math.max(Math.max(maxX-minX,maxY-minY)*1.25, 2600);
    const sm=SAGA ? sagaStoryMark() : null;                              // (IS5 FIX: his mark's words stay on the glass — the frame makes room for them on its right)
    if(sm){ ctx.save(); ctx.font='italic 9.5px Georgia,serif'; const lw=ctx.measureText(sm.label).width+23+14; ctx.restore();
      for(let k=0;k<2;k++){ const need=sm.x+lw*fmSpan/mapRect().size; if(need<=fmCX+fmSpan/2) break; maxX=Math.max(maxX,need); fmCX=(minX+maxX)/2; fmSpan=Math.max(Math.max(maxX-minX,maxY-minY)*1.25, 2600); } }
  }
  if(SAGA) sagaChartFrame();                                             // (INTROSTORY C7: S3 — her and the Guild's isle on the glass · on a pad the crosshair starts on the isle)
  clampMap(); fmDirty=true; padMapCross=false; fmNote=null; fmReset();   // (CH Q1: the clock & the settle start over — the first frame paints at once)
}
function renderFullMap(){ EXS.ok();   // (CH R1) the bits in step with `explored` (else one walk, counted in EXS.rb)
  const S = dev.revealAll ? 340 : 520;     // coarser for the whole-world debug reveal, crisp for your charted map
  if(!fmCanvas){ fmCanvas=document.createElement('canvas'); fmCtx=fmCanvas.getContext('2d'); }
  if(fmCanvas.width!==S){ fmCanvas.width=S; fmCanvas.height=S; }
  const g=fmCtx, img=g.createImageData(S,S), d=img.data, GC=!dev.revealAll&&TUNE.chCoast>0, ink=!dev.revealAll&&!GC;   // (CH R1: chCoast 1 → the grid coastline, else the classic 4 probes)
  const ox=fmCX-fmSpan/2, oy=fmCY-fmSpan/2, step=fmSpan/S, BK=8, nb=Math.ceil(S/BK), BL=TUNE.seaLand>0?new Array(nb*nb):null;   // (each 8-texel block keeps the isles in reach, fetched when it first meets land)
  const XA=dev.revealAll||FMV.allT, XS=FMV.setT, XB=EXS.b, W=S+12, r=Math.min(6,Math.max(1,Math.round(EXP/step))), HM=GC?(EXS.hm||(EXS.hm=new Float64Array(532*532))):null;   // (CH R1) the charted test hoisted (FMV.allT: all charted, the perf gates · FMV.setT: the Set, a same-page A/B · else the bit) · chCoast 1: probes ±r texels (≈ 14 u), heights memoised on the (S+12)² grid
  const ph=(ii,jj)=>{ const q=(jj+6)*W+ii+6; let v=HM[q]; if(v!==v) v=HM[q]=rawHeight(ox+(ii+0.5)*step, oy+(jj+0.5)*step); return v; }; let gk=0, gs=0; if(GC) HM.fill(NaN,0,W*W);   // (CH R1) a texel's height, computed once (a charted texel's own, or the true height under the fog / past the picture's edge)
  for(let j=0;j<S;j++){ const wy=oy+(j+0.5)*step, ky=Math.floor(wy/EXP)*EGW;   // (CH R1: the row's cell offset)
    for(let i=0;i<S;i++){ const wx=ox+(i+0.5)*step, di=(j*S+i)*4;
      let R=233,G=220,B=192;                                  // unknown = blank parchment
      const inW = wx>=0&&wy>=0&&wx<WORLD&&wy<WORLD;
      if(!inW){ R=212;G=201;B=174; }                          // beyond the world's edge
      else if(XA || (gk=Math.floor(wx/EXP)+ky, XS ? explored.has(gk) : XB[gk>>3]>>(gk&7)&1)){   // (CH R1) charted? — the bit, same cell index as the Set's
        const h=GC?ph(i,j):rawHeight(wx,wy);   // (CH R1)
        if(h<SEA){ const dp=clamp((SEA-h)/0.5,0,1); if(dp<0.16){R=150;G=178;B=178;} else {R=120;G=150;B=170;} }
        else { const e=clamp(h/1.1,0,1);
          let q=null; if(BL){ const bi=((j/BK)|0)*nb+((i/BK)|0); let cs=BL[bi]; if(!cs) cs=BL[bi]=coresNear(ox+(((i/BK)|0)+0.5)*BK*step, oy+(((j/BK)|0)+0.5)*BK*step, BK*step*0.75+500); q=chartLand(cs,wx,wy,e); }
          if(q){ R=q[0]; G=q[1]; B=q[2]; } else if(e<0.06){R=206;G=182;B=128;} else if(e<0.5){R=96;G=140;B=80;} else {R=70;G=104;B=66;}
          if(GC && (r>1 ? (ph(i+r,j)<SEA||ph(i-r,j)<SEA||ph(i,j+r)<SEA||ph(i,j-r)<SEA) : (gs=(ph(i+1,j)<SEA)+(ph(i-1,j)<SEA)+(ph(i,j+1)<SEA)+(ph(i,j-1)<SEA), gs>0&&gs<4))){R=74;G=58;B=36;}   // (CH R1) the grid coastline: a probe ±r texels lands in the sea · at r 1 a lone land texel (no land neighbour) stays land-coloured
          if(ink && (rawHeight(wx+EXP,wy)<SEA||rawHeight(wx-EXP,wy)<SEA||rawHeight(wx,wy+EXP)<SEA||rawHeight(wx,wy-EXP)<SEA)){R=74;G=58;B=36;} }
      }
      d[di]=R;d[di+1]=G;d[di+2]=B;d[di+3]=255;
    }
  }
  g.putImageData(img,0,0);
  fmRX=fmCX; fmRY=fmCY; fmRSpan=fmSpan;                       // remember the view this canvas was drawn for
}
function drawFullMap(){
  ctx.fillStyle='rgba(4,10,22,.72)'; ctx.fillRect(0,0,CSSW,CSSH);
  const r=mapRect(), size=r.size, mx=r.mx, my=r.my;
  ctx.fillStyle='#0c1830'; roundRect(mx-12,my-12,size+24,size+24,16); ctx.fill();
  ctx.save(); ctx.beginPath(); roundRect(mx,my,size,size,8); ctx.clip();
  ctx.imageSmoothingEnabled=true;
  const ox=fmCX+fmRub(FMV.rb.x)*fmSpan-fmSpan/2, oy=fmCY+fmRub(FMV.rb.y)*fmSpan-fmSpan/2, sc=size/fmSpan;   // (CH F1: the centre as shown — the rubber edge's give; bit-equal at rest)
  if(TUNE.chUnder>0 && !dev.revealAll && (fmViewNe() || FMV.rb.x || FMV.rb.y)) fmUnderDraw(mx,my,size,ox,oy,sc); else { ctx.fillStyle='#e9dcc0'; ctx.fillRect(mx,my,size,size); }   // (CH Q1) moving: the underlay under the picture · covered (settled): today's one fill, pixel for pixel (CH F1: a springing edge shows the world's rim, not parchment)
  // blit the last-rendered canvas positioned for the CURRENT view → pan/zoom slides smoothly between renders
  if(fmCanvas){ const rx0=fmRX-fmRSpan/2, ry0=fmRY-fmRSpan/2;
    ctx.drawImage(fmCanvas, mx+(rx0-ox)*sc, my+(ry0-oy)*sc, fmRSpan*sc, fmRSpan*sc); }
  const w2px=wx=>mx+(wx-ox)*sc, w2py=wy=>my+(wy-oy)*sc;
  // ports in view
  for(const c of cores){ if(!c.port) continue; if(!c.found && !dev.revealAll) continue;
    if(c.x<ox||c.x>ox+fmSpan||c.y<oy||c.y>oy+fmSpan) continue;
    const px=w2px(c.x), py=w2py(c.y);
    ctx.fillStyle=c.found?'#b8482f':'#9a7a55'; ctx.beginPath(); ctx.arc(px,py,2.7+portSizeOf(c)*0.8,0,TAU); ctx.fill();
    ctx.strokeStyle='#fff6dd'; ctx.lineWidth=1; ctx.stroke();
    if(c.found){ ctx.fillStyle='#5a3a1c'; ctx.font='10px Georgia,serif'; ctx.textAlign='left'; ctx.fillText(c.city, px+6, py+3); }
  }
  // cleared isles — golden flags + your names for them; the chart fills with conquests
  for(const c of cores){ if(!c.cleared) continue;
    if(c.x<ox||c.x>ox+fmSpan||c.y<oy||c.y>oy+fmSpan) continue;
    const px=w2px(c.x), py=w2py(c.y);
    ctx.strokeStyle='rgba(231,180,22,.4)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(px,py,8,0,TAU); ctx.stroke();
    ctx.strokeStyle='#7a5a1c'; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(px,py+4); ctx.lineTo(px,py-6); ctx.stroke();
    ctx.fillStyle='#e7b416'; ctx.beginPath(); ctx.moveTo(px,py-6); ctx.lineTo(px+7,py-3.8); ctx.lineTo(px,py-1.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle='#8a6a14'; ctx.font='italic 10px Georgia,serif'; ctx.textAlign='left';
    ctx.fillText(c.customName||c.label||c.name, px+11, py+3);
  }
  // charted wild isles wear their danger, coloured against you — numbers when you're zoomed in, a pip when you're not
  { const band=youBand(), num=fmSpan<=26000; ctx.font='800 10px system-ui'; ctx.textAlign='center'; ctx.lineJoin='round';
    for(const c of cores){ if(c.port||c.cleared||(!c.found&&!dev.revealAll)) continue;
      if(c.x<ox||c.x>ox+fmSpan||c.y<oy||c.y>oy+fmSpan) continue;
      if(!isleLandable(c)) continue;
      const px=w2px(c.x), py=w2py(c.y), dg=dangerOf(c), v=isleVerdict(c,band), bt=bossThreat(c,band), sk=bt&&bt.i>=2?skullCv(bt.col,num?2:1):null;   // (§8.10: a guardian that reads Hard or worse wears its skull)
      if(num){ const tx=v.glyph+dg; ctx.strokeStyle='rgba(40,26,10,.9)'; ctx.lineWidth=3; ctx.strokeText(tx,px,py+4); ctx.fillStyle=v.col; ctx.fillText(tx,px,py+4);
        if(sk) ctx.drawImage(sk, Math.round(px-ctx.measureText(tx).width/2-sk.width-2), Math.round(py-8)); }
      else if(sk) ctx.drawImage(sk, Math.round(px-sk.width/2), Math.round(py-sk.height/2));
      else { ctx.fillStyle=v.col; ctx.beginPath(); ctx.arc(px,py,2.2,0,TAU); ctx.fill(); ctx.strokeStyle='rgba(40,26,10,.8)'; ctx.lineWidth=0.8; ctx.stroke(); } }
    ctx.textAlign='left'; }
  seasChartDraw(mx,my,size,ox,oy,sc);                                   // (SEAS SE3) the seas: borders → their names → the archipelagos' → the straits' (under the signposts, the marks & the story)
  seasChartLmk(mx,my,size,ox,oy,sc);                                    // (SEAS SE4 §2.6 layer 3) the landmarks you've sighted — her glyph, her name in sepia, your course's ring
  // your furthest marks — signposts: how far you got, and where the sea stopped you
  const lbOK=SEAS_CH.lmF===last && !ptMode && !SEAS_CH.off;   // (SD7 FIX SD7VB-7: this frame's label boxes are fresh — seasChartDraw filled them; the signposts' & the marks' words join them)
  for(const [c,L] of signsByIsle()){                                                 // several marks on one isle: the posts stand in a row, their boards stack up the left (never over each other — or her name)
    if(c.x<ox-400||c.x>ox+fmSpan+400||c.y<oy-400||c.y>oy+fmSpan+400) continue;
    const n=L.length, px0=w2px(c.x)-10-(n-1)*13, py=w2py(c.y)+2;
    ctx.font='italic 700 10.5px Georgia,serif'; ctx.lineJoin='round';
    let wmax=0; for(const [k,s] of L) wmax=Math.max(wmax, ctx.measureText(signLabel(k,s)).width);
    const lft=px0-4-wmax>mx+4;                                                        // (flips right — below the posts — at the chart's west edge)
    L.forEach(([k,s],i)=>{ drawSignGlyph(px0+i*13,py,k,1.3);
      const tx=signLabel(k,s), ty=lft ? py-8-(n-1-i)*13 : py+14+i*13, tx0=lft?px0-4:Math.max(mx+6,px0-2);
      ctx.textAlign='left'; if(lft) ctx.textAlign='right';
      ctx.strokeStyle='rgba(240,228,198,.9)'; ctx.lineWidth=3; ctx.strokeText(tx,tx0,ty);
      ctx.fillStyle=SIGN_COL[k]; ctx.fillText(tx,tx0,ty); if(lbOK){ const w=ctx.measureText(tx).width; SEAS_CH.box.push(lft ? [tx0-w,ty-9,tx0,ty+2] : [tx0,ty-9,tx0+w,ty+2]); } });
    ctx.textAlign='left'; }
  // contract & rumor marks — what the chart remembers you're chasing
  for(const mk of allMarks()){
    if(mk.x<ox-2000||mk.x>ox+fmSpan+2000||mk.y<oy-2000||mk.y>oy+fmSpan+2000) continue;
    const px=w2px(mk.x), py=w2py(mk.y), col=MK_COL[mk.kind]||'#8a5c2e';
    if(mk.r){ ctx.strokeStyle=col; ctx.globalAlpha=0.55; ctx.setLineDash([5,4]); ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.arc(px,py,Math.max(7,mk.r*sc),0,TAU); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1; }
    ctx.fillStyle=col; ctx.font='700 12px Georgia,serif'; ctx.textAlign='center';
    if(mk.kind==='wonder') seasWonderGlyph(px,py); else ctx.fillText(MK_GLYPH[mk.kind]||'◎', px, py+4);   // (SEAS SE6: the wonder's ✺ in pixels)
    ctx.font='italic 9.5px Georgia,serif'; ctx.textAlign='left';
    const tg=mk.tag||(mk.kind==='home' && mk.who ? String(mk.who).split(' ')[0]+'’s home' : null);   // (G16 FIX: a hand's home sits on a port — its own name is printed there already)
    const lt=tg||mk.label||'', lx=px+(mk.kind==='story'?23:9), ly=tg?py-9:py-5;   // (a tag rides a line higher, clear of the port's own name · IS5 FIX: his mark's words start past the goal's quill)
    if(lt && lbOK && mk.kind!=='story'){ const lw=ctx.measureText(lt).width, R=[lx,ly-8,lx+lw,ly+2], L=[px-9-lw,ly-8,px-9,ly+2], U=[px-lw/2,py+8,px+lw/2,py+18];   // (SD7 FIX SD7VB-7: a mark's words step round the names already inked — ports, claims, landmarks, the seas — to the glyph's left, else under it, else wait for a closer span)
      const B=!seasBoxHit(R) ? R : !seasBoxHit(L) ? L : !seasBoxHit(U) ? U : fmSpan<=16000 ? R : null; if(B){ ctx.textAlign=B===L?'right':B===U?'center':'left'; ctx.fillText(lt, B===L?px-9:B===U?px:lx, B===U?py+16:ly); ctx.textAlign='left'; SEAS_CH.box.push(B); } }
    else if(lt) ctx.fillText(lt, lx, ly);
  }
  // the Craftsman's buoys
  for(const b of buoys){
    if(b.x<ox||b.x>ox+fmSpan||b.y<oy||b.y>oy+fmSpan) continue;
    const px=w2px(b.x), py=w2py(b.y);
    ctx.fillStyle='#2a9a98'; ctx.save(); ctx.translate(px,py); ctx.rotate(Math.PI/4); ctx.fillRect(-3.4,-3.4,6.8,6.8); ctx.restore();
    ctx.strokeStyle='#fff6dd'; ctx.lineWidth=1; ctx.strokeRect(px-1.4,py-1.4,2.8,2.8);
    ctx.fillStyle='#1c6a68'; ctx.font='italic 9.5px Georgia,serif'; ctx.textAlign='left'; ctx.fillText('buoy '+b.n, px+8, py+3);
  }
  for(let i=0;i<whales.length;i++){ const w=whales[i]; if(w.st==='gone' || !w.mmS) continue;   // (PT2 X2) the whales you've sighted — a steady whale mark; a fresh sighting's flare rolls out here too
    const age=whaleFlareAge(w); if(w.x<ox||w.x>ox+fmSpan||w.y<oy||w.y>oy+fmSpan) continue; whaleMark(ctx, w2px(w.x), w2py(w.y), age, Math.cos(w.a)>=0, 1.3, w.depth>0.6?0.45:1); }
  drawCourseMap(mx,my,size,ox,oy,sc);                                   // (PT1 W5) the course: the dashed line from the boat, the gold star
  if(SAGA) sagaMapDraw(mx,my,size,ox,oy,sc);                            // (INTROSTORY C12) his route: home → each leaf you hold → his mark
  if(SAGA) sagaMkChart(mx,my,size,ox,oy,sc);                            // (INTROSTORY C4b) the goal's quill pin · the guided isle's gold ring
  // boat
  ctx.save(); ctx.translate(w2px(boat.x),w2py(boat.y)); ctx.rotate(boat.a+Math.PI/2);
  ctx.fillStyle='#c0202a'; ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(6,7); ctx.lineTo(0,4); ctx.lineTo(-6,7); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#fff'; ctx.lineWidth=1.2; ctx.stroke(); ctx.restore();
  const cross=padMapCross && inDev==='pad';                             // (PT1 W5) the pad's crosshair: A taps the chart here
  if(cross){ const cx=mx+size/2, cy=my+size/2; ctx.lineCap='round';
    for(const [w,col] of [[3.4,'rgba(58,36,16,.85)'],[1.5,'#ffd86b']]){ ctx.strokeStyle=col; ctx.lineWidth=w; ctx.beginPath(); ctx.arc(cx,cy,5.5,0,TAU);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ ctx.moveTo(cx+dx*8,cy+dy*8); ctx.lineTo(cx+dx*11,cy+dy*11); } ctx.stroke(); }
    ctx.lineCap='butt'; }
  // scale bar
  const nice=[200,500,1000,2000,5000,10000,20000,50000]; let u=nice[0];
  for(const n of nice){ if(n<=fmSpan*0.28) u=n; } const barPx=u*sc;
  ctx.strokeStyle='#5a3a1c'; ctx.lineWidth=2; ctx.beginPath();
  ctx.moveTo(mx+16,my+size-16); ctx.lineTo(mx+16+barPx,my+size-16); ctx.stroke();
  ctx.fillStyle='#5a3a1c'; ctx.font='10px Georgia,serif'; ctx.textAlign='left';
  ctx.fillText('≈ '+(u>=1000?(u/1000)+'k':u)+' leagues', mx+16, my+size-22);
  ctx.restore();
  // title + controls
  ctx.fillStyle='#f0e4c6'; ctx.font='700 16px Georgia,serif'; ctx.textAlign='center';
  ctx.fillText('✦ The Charted Reaches ✦', CSSW/2, my-20);
  const isle=discoveredCount+' isle'+(discoveredCount===1?'':'s'), prt=portCount+' port'+(portCount===1?'':'s'), dk=mode==='sea';
  const gap=CSSH-my-size, y1=my+size+Math.min(27,Math.round(gap*0.44)), y2=my+size+Math.min(43,gap-5);   // (PT1 W5: two lines — how to work her, then what she holds · a short screen pulls them up)
  const fitF=t=>{ let f=12; ctx.font=f+'px Georgia,serif'; while(f>9 && ctx.measureText(t).width>CSSW-24){ f-=0.5; ctx.font=f+'px Georgia,serif'; } return f; };
  const L1=cross ? 'stick pans   •   '+padGlyph('zoomout')+' / '+padGlyph('zoomin')+' zoom   •   '+padGlyph('attack')+' set / clear the course at the crosshair'+(dk?' (a ⚓ port in reach docks)':'')+'   •   '+padGlyph('skill2')+' clear   •   '+padGlyph('cancel')+' close'
    : 'scroll / +− zoom   •   drag / arrows pan   •   click a known place to set your course (again to clear)'+(dk?'   •   a ⚓ port in reach docks':'')+(COURSE?'   •   Backspace clears':'');
  fitF(L1); ctx.fillStyle='#b9a880'; ctx.fillText(L1, CSSW/2, y1);
  const L2=isle+' & '+prt+' charted'+(clearedCount?'   •   ⚑ '+clearedCount+' cleared':'')+'   •   📒 '+biomesFound.size+'/'+BIOMES.length+' biomes'+seasLegend()+(giftCells?'   •   '+(newCellsCharted()/1000|0)+'k leagues inked beyond the Guild’s line':''), L2b=cross?'':'   •   M or Esc to close';
  fitF(L2+L2b); const w2=ctx.measureText(L2).width, w2b=ctx.measureText(L2b).width, x2=CSSW/2-(w2+w2b)/2; ctx.textAlign='left';
  ctx.fillStyle='#b9a880'; ctx.fillText(L2, x2, y2); ctx.fillStyle='#8194b8'; ctx.fillText(L2b, x2+w2, y2); ctx.textAlign='left';
  if(fmNote){ const age=(performance.now()-fmNote.at)/1000;                  // (PT1 W5) the chart's own note — what the last tap did — riding on the chart's top edge
    if(age>2.8) fmNote=null;
    else { const a=clamp(Math.min(age/0.15,(2.8-age)/0.5),0,1), sub=fmNote.sub; ctx.save(); ctx.globalAlpha=a; ctx.imageSmoothingEnabled=false;
      ctx.font='700 13px system-ui'; const mw=emoW(fmNote.msg,13); ctx.font='600 12px Georgia,serif'; const sw=sub?ctx.measureText(sub).width:0;
      const w=Math.round(Math.max(160,mw+32,sw+32)), h=sub?42:26, x=Math.round(CSSW/2-w/2), y=Math.round(SAGA_CP.on ? Math.max(my+10,SAGA_CP.y+SAGA_CP.h+6) : my+10);   // (INTROSTORY C7: under the objective chip when it rides the chart)
      pxPanel(x,y,w,h,PXP.brass); ctx.textAlign='center'; ctx.font='700 13px system-ui'; emoTxt(fmNote.msg, CSSW/2, y+18, '#ffe6a6', 13, 'pan');
      if(sub){ ctx.font='600 12px Georgia,serif'; panTxt(sub, CSSW/2, y+34, '#eaf2ff'); }
      ctx.restore(); ctx.textAlign='left'; } }
}

/* rounded-rect helper (path only) */
function roundRect(x,y,w,h,r){ ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

