"use strict";
/* FILE: js/render/style_pass.js
The PX style pass (PROJECT PX): a WebGL post-process that grades the low-res world buffer pix per mode (a 32-cubed LUT,
an ordered dither anchored to the world's texel grid, a vignette and a glow), its once-a-session watchdog, the CRT
scanlines, and the device-only picture settings (GFX, localStorage mj_boats_gfx_v1) with their Options block.
Moved verbatim from original lines 41117-41241 (build 5109cd5); loads in place, between the main loop and frameInner.
Entry points: artSrc (frameInner and scnBlit: the blit source, the graded canvas or pix itself), artScan (frameInner),
  gfxBlock and gfxBlockWire (renderControlsTab: Options, Picture), gfxBlockRefresh, gfxLoad, gfxSave; internal helpers
  artProf, artGL, artLut, artWatch.
Globals it owns: GFX_KEY, GFX, ART_PROF, ART, ART_VS, ART_FS, plus the functions above. GFX and ART are also read by
  propTells and islTells, and frameInner resets ART.P every frame.
Globals it reads from elsewhere (at runtime only): ITUNE (the art knobs, original line 11679 (build 5109cd5)), env, mode,
  ISL, islScale, icamX, icamY, iscale, camX, camY, TOX, TOY, IW, IH, pix, SCN, ctx, DPR, PIX_SCALE, CSSW, CSSH, clamp,
  toast, sfx, padFocusEl, padSetFocus.
Load-time statements: let GFX=gfxLoad() (original line 41134 (build 5109cd5)) reads localStorage and calls the hoisted
  gfxLoad declared on the next line, so the two must stay in this one file; const ART (original line 41144 (build 5109cd5))
  is a literal holding a new Map(); const ART_FS (original line 41146 (build 5109cd5)) joins the shader source lines.
  GFX_KEY, ART_PROF and ART_VS are pure literals; the rest are function declarations. Nothing starts a timer, rAF or
  listener at load (artGL adds its context-lost and context-restored listeners to its own canvas when first called).
Must load before the first frame; the loop starts only after the whole script (P2).
*/
/* ============================ PROJECT PX — THE STYLE PASS (from TG1 — on the GPU, game-wide) ============================
   One look for the whole pixel world: a frame-level grade on the low-res world buffer (pix), applied between the world's draw and its
   blit. The HUD, the chart, the story's letterbox, every word on the canvas and the full-res glows (worldTint, slGlow, seasGlow, crGlow …)
   are drawn AFTER it — untouched.
   · a 32³ LUT (artLut — TG1's maths, unchanged) grades every texel: shadows lean navy, lights lean cream, a gentle S-curve, a little
     more saturation — and posterises it to artPost levels a channel
   · the posterise is ORDERED-DITHERED (the 4×4 Bayer, × artDith) on the WORLD's texel grid: the pattern scrolls with the ground, so a
     walking camera never makes it swim (TG1's screen-fixed pattern flipped ~45% of the ground's texels on every one-texel step)
   · a vignette (artVig) · a soft glow (artGlow — artGlowT: only what is brighter than it blooms; 0 = TG1's soft lift of everything)
   · per mode (ART_PROF): the crawl's surface exactly as TG1 tuned it · caves keep their dark · the sea leaves the night, storms & fog to
     worldTint (drawn after) · rooms calmer · the night eases the grade where the light is drawn in the world (artNight)
   · ON THE GPU: pix → a WebGL texture (GPU→GPU) → one fragment shader → a WebGL canvas the buffer's size, blitted exactly as pix was.
     TG1's CPU loop read pix back every frame (a read-back of a just-drawn canvas — a GPU stall): +4–8 ms a frame. Never read back here.
     No WebGL (or only a software one) → the pass is simply off.
   · the player's switch & the CRT scanlines: 🎮 Options → 🖼 Picture (GFX — this device, mj_boats_gfx_v1, never in the voyage save)
   Not run on: the title, the Maelstrom table, the chart / island map, the Long Chart (they never draw into pix). */
const GFX_KEY='mj_boats_gfx_v1';
let GFX=gfxLoad();                                                   // {art: the pixel filter 1/0 · scan: CRT scanlines 1/0}
function gfxLoad(){ const P={art:1, scan:0}; try{ const o=JSON.parse(localStorage.getItem(GFX_KEY)||'null'); if(o && typeof o==='object'){ P.art=o.art===0?0:1; P.scan=o.scan?1:0; } }catch(e){} return P; }
function gfxSave(){ try{ localStorage.setItem(GFX_KEY,JSON.stringify(GFX)); }catch(e){} }
const ART_PROF={   // per mode, × the ART knobs (the knobs = the crawl's surface): g grade · s saturation · p posterise levels · d dither · v vignette (vL: × the daylight) · w glow · wt the glow's threshold floor · nt: the night eases the grade
  isle:{g:1,   s:1,    d:1,   v:1,   w:1, wt:0,    nt:1},          // the crawl's surface — TG1's look, as the owner approved it
  cave:{g:0.4, s:1, p:1.5, d:1, v:0.5, w:1, wt:0.45, nt:0},       // below ground the dark is the mood: a lighter grade and finer steps (at ×0.7 and 16 levels the dark floors went navy-black), only the lights bloom (lanterns, crystal, lava, the sanctum)
  sea: {g:1,   s:0.33, d:0.5, v:0.6, vL:1, w:0, wt:0, nt:0},       // the night, storms & fog are worldTint's (after the pass) · wide flat water: half the dither, no glow
  town:{g:1,   s:1, p:1.5, d:0.5, v:0.6, w:1, wt:0,    nt:1},     // (PX1 FIX V1-2: 24 levels & half the dither — at 16 / full the grey street's mortar wore a mauve-green checker at noon)
  room:{g:1,   s:0.5, p:2,   d:0.5, v:0.5, w:1, wt:0, nt:1},      // (a small warm room: the wood went very orange at ×1 · PX1 FIX V1-1: 32 levels & half the dither — at 16 the plank floor's two browns fell in one band — dotted seams, red checkers by day · 24 still merged seams & turned planks olive at night)
  deck:{g:1,   s:1,    d:1,   v:0.6, w:1, wt:0,    nt:1}};
const ART={cv:null, gl:null, ok:0, tried:0, tex:null, lut:null, lutKey:'', loc:{}, L:new Map(), scan:null, sk:'', pat:null, P:null, Ps:{}, ms:0, noGlow:0, off:0, probe:0, wdOff:0, wd:{t:0, a:[], base:0, ref:1e9, done:0, st:0, p:0, n:0}};
const ART_VS='attribute vec2 p; void main(){ gl_Position=vec4(p,0.0,1.0); }';
const ART_FS=['#ifdef GL_FRAGMENT_PRECISION_HIGH','precision highp float;','#else','precision mediump float;','#endif',
  'uniform sampler2D uSrc; uniform sampler2D uLut; uniform vec2 uSize; uniform vec2 uBuf; uniform vec2 uOff; uniform float uTop; uniform float uDA; uniform float uVig; uniform float uGlow; uniform float uGlowT; uniform vec2 uTap[7];',
  'float b2(vec2 q){ return mod(2.0*q.x+3.0*q.y,4.0); }',                                                     // the 2×2 Bayer: 0 2 / 3 1
  'void main(){',
  '  float X=floor(gl_FragCoord.x), Y=uTop-floor(gl_FragCoord.y);',                                           // the buffer texel (y down — the output sits at the canvas's top-left)
  '  vec2 uv=(vec2(X,Y)+0.5)/uBuf; vec3 c=texture2D(uSrc,uv).rgb;',
  '  if(uGlow>0.0){ vec3 s=vec3(0.0); float ws=0.0;',                                                         // the glow: TG1's blur(1.5px) brightness(1.15), added (× artGlow)
  '    for(int j=0;j<7;j++){ for(int i=0;i<7;i++){ float w=uTap[i].y*uTap[j].y; s+=texture2D(uSrc,uv+vec2(uTap[i].x,uTap[j].x)/uBuf).rgb*w; ws+=w; } }',
  '    vec3 g=min(s/ws*1.15,1.0); if(uGlowT>0.0) g=max(g-uGlowT,0.0)/(1.0-uGlowT); c=min(c+g*uGlow,1.0); }',
  '  float f=1.0; if(uVig>0.0){ float dx=(X-uSize.x*0.5)/(uSize.x*0.5), dy=(Y-uSize.y*0.5)/(uSize.y*0.5), q=dx*dx+dy*dy*0.85-0.32; if(q>0.0){ float u=min(q,1.0); f=1.0-uVig*u*sqrt(u); } }',
  '  float bx=mod(X-uOff.x+4.0,4.0), by=mod(Y-uOff.y+4.0,4.0), B=4.0*b2(vec2(mod(bx,2.0),mod(by,2.0)))+b2(floor(vec2(bx,by)*0.5));',   // the 4×4 Bayer, on the WORLD's texel
  '  vec3 r=clamp(c*255.0*f+(B/16.0-0.47)*uDA,0.0,255.0), q5=floor(r/8.0);',                                // TG1's order: vignette, dither, then the LUT (5 bits a channel)
  '  gl_FragColor=vec4(texture2D(uLut,vec2((q5.b*32.0+q5.r+0.5)/1024.0,(q5.g+0.5)/32.0)).rgb,1.0);',
  '}'].join('\n');
/* the grade as a 32³ LUT, packed for the GPU (1024 × 32 RGBA: x = b·32 + r, y = g) — TG1's artLut maths, unchanged · cached by (grade, sat, levels) */
function artLut(G,S0,P){ const key=G+'|'+S0+'|'+P, E=ART.L.get(key); if(E) return E;   // (PX1 FIX PX1VC-8: the cache holds the [key,D] pair itself — a hit allocates nothing)
  let D;
  D=new Uint8ClampedArray(1024*32*4); const S=1+S0, shR=26, shG=34, shB=58, hiR=255, hiG=242, hiB=208, con=1+0.22*G;   // the shadows' navy · the lights' cream · the S-curve's gain
  for(let r5=0;r5<32;r5++) for(let g5=0;g5<32;g5++) for(let b5=0;b5<32;b5++){
    let r=r5*8+4, g=g5*8+4, b=b5*8+4; const lum=(0.299*r+0.587*g+0.114*b)/255;
    r=lum*255+(r-lum*255)*S; g=lum*255+(g-lum*255)*S; b=lum*255+(b-lum*255)*S;                 // saturation
    const sh=(1-lum)*(1-lum)*0.38*G, hi=lum*lum*0.22*G;                                          // the tints: shadows → navy, lights → cream
    r=r*(1-sh)+shR*sh; g=g*(1-sh)+shG*sh; b=b*(1-sh)+shB*sh;
    r=r*(1-hi)+hiR*hi; g=g*(1-hi)+hiG*hi; b=b*(1-hi)+hiB*hi;
    r=(r-128)*con+128; g=(g-128)*con+128; b=(b-128)*con+128;                                     // contrast
    if(P>1){ const q=255/(P-1); r=Math.round(r/q)*q; g=Math.round(g/q)*q; b=Math.round(b/q)*q; }  // posterise (the dither is added before the lookup — the shader)
    const o=(g5*1024+b5*32+r5)*4; D[o]=r; D[o+1]=g; D[o+2]=b; D[o+3]=255; }                       // (clamped & rounded by the array, as TG1's)
  if(ART.L.size>=24) ART.L.clear(); const E2=[key,D]; ART.L.set(key,E2); return E2; }
/* this frame's look: the mode's profile × the knobs, the night, the world's texel offset (the dither's anchor) — null = no pass here */
function artProf(o){ let k, ox=0, oy=0;
  if(mode==='island'){ if(!ISL) return null; k=ISL.cave?'cave':'isle'; const s=islScale(); ox=Math.round(IW/2-icamX*s); oy=Math.round(IH/2-icamY*s); }   // (iwp's rounding)
  else if(mode==='sea'){ k='sea'; const s=iscale(); ox=Math.round(IW/2-camX*s); oy=Math.round(IH/2-camY*s); }
  else if(mode==='port' || mode==='interior' || mode==='deck'){ k=mode==='port'?'town':mode==='interior'?'room':'deck'; ox=TOX; oy=TOY; }   // (the towns' whole-texel camera — the deck's bobs with her)
  else return null;
  const A=ART_PROF[k], I=ITUNE, L=clamp(+env.L||0,0,1), nq=A.nt ? Math.round(clamp((0.6-L)/0.4,0,1)*2)/2 : 0;   // the night in 3 steps (≤ 3 LUTs a profile)
  const P=Math.round((+I.artPost||0)*(A.p||1)), G=Math.round(clamp((+I.artGrade||0)*A.g*(1-clamp(+I.artNight||0,0,1)*nq),0,1)*100)/100, S=Math.round((+I.artSat||0)*A.s*100)/100;
  const R=o||{}; R.k=k; R.G=G; R.S=S; R.P=P; R.dA=P>1 ? (255/(P-1))*Math.max(0,+I.artDith||0)*A.d : 0; R.v=Math.max(0,+I.artVig||0)*A.v*(A.vL?L:1);   // (PX1 FIX PX1VC-8: artSrc fills ART.Ps — no new object a frame · a bare artProf() still returns a fresh one)
  R.w=ART.noGlow?0:Math.max(0,+I.artGlow||0)*A.w; R.wt=clamp(Math.max(+I.artGlowT||0,A.wt,0.45*nq),0,0.95); R.ox=((ox%4)+4)%4; R.oy=((oy%4)+4)%4; return R; }
function artGL(){ if(ART.ok) return true; if(ART.tried) return false; ART.tried=1;
  try{ const cv=document.createElement('canvas'); cv.width=2; cv.height=2;
    const gl=cv.getContext('webgl',{alpha:false, antialias:false, depth:false, stencil:false, premultipliedAlpha:false, preserveDrawingBuffer:false, failIfMajorPerformanceCaveat:true});
    if(!gl) return false;
    const sh=(t,s)=>{ const o=gl.createShader(t); gl.shaderSource(o,s); gl.compileShader(o); if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)) throw new Error('ART shader: '+gl.getShaderInfoLog(o)); return o; };
    const pr=gl.createProgram(); gl.attachShader(pr,sh(gl.VERTEX_SHADER,ART_VS)); gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,ART_FS)); gl.linkProgram(pr);
    if(!gl.getProgramParameter(pr,gl.LINK_STATUS)) throw new Error('ART link: '+gl.getProgramInfoLog(pr)); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const ap=gl.getAttribLocation(pr,'p'); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap,2,gl.FLOAT,false,0,0);
    for(const n of ['uSrc','uLut','uSize','uBuf','uOff','uTop','uDA','uVig','uGlow','uGlowT','uTap']) ART.loc[n]=gl.getUniformLocation(pr,n);
    const mk=u=>{ const t=gl.createTexture(); gl.activeTexture(u); gl.bindTexture(gl.TEXTURE_2D,t); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); return t; };
    ART.lut=mk(gl.TEXTURE1); ART.tex=mk(gl.TEXTURE0); gl.uniform1i(ART.loc.uSrc,0); gl.uniform1i(ART.loc.uLut,1);
    const tp=[]; for(let i=-3;i<=3;i++) tp.push(i,Math.exp(-(i*i)/(2*1.5*1.5))); gl.uniform2fv(ART.loc.uTap,new Float32Array(tp));   // (σ 1.5 — TG1's blur(1.5px))
    cv.addEventListener('webglcontextlost',e=>{ e.preventDefault(); ART.ok=0; },false);                                        // (the pass steps aside: pix is blitted as it always was)
    cv.addEventListener('webglcontextrestored',()=>{ ART.cv=null; ART.gl=null; ART.tried=0; ART.lutKey=''; },false);          // (a fresh context on the next frame)
    ART.cv=cv; ART.gl=gl; ART.lutKey=''; ART.ok=1; return true;
  }catch(e){ console.error(e); return false; } }
/* the frame's source for the blit: the graded canvas, or pix itself (filter off · no WebGL · not a pixel-world mode) — same size, same coords */
function artSrc(){ ART.P=null; if(!GFX.art || ART.off || !pix.width) return pix;
  if(ART.probe && !(SCN || (mode==='island' && ISL && ISL.boss && !ISL.boss.dead && (ISL.boss.aggro || ISL.seal)))){ artWatch(); return pix; }   // (PX1 FIX V1-4: a probe never bypasses a story scene or a lord fight — the pass runs, its closing artWatch cancels the probe)
  const P=artProf(ART.Ps); if(!P || !artGL()) return pix; if(ART.gl.isContextLost()){ ART.ok=0; return pix; } ART.P=P;   // (PX1 FIX PX1VC-1: a GPU reset before its event — pix, never a blank frame; tried stays 1, the restore rebuilds)
  const t0=performance.now(), gl=ART.gl, cv=ART.cv, W=IW, H=IH, U=ART.loc;
  if(cv.width<pix.width || cv.height<pix.height){ cv.width=Math.max(cv.width,pix.width); cv.height=Math.max(cv.height,pix.height); }   // (it only grows — the fight zoom-out never reallocates it step by step)
  gl.viewport(0,cv.height-H,W,H);                                                                   // (the output at the canvas's top-left: the blit's source rect is (0,0,IW,IH))
  const [key,D]=artLut(P.G,P.S,P.P); if(key!==ART.lutKey){ ART.lutKey=key; gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,ART.lut); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,32,0,gl.RGBA,gl.UNSIGNED_BYTE,D); }
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,ART.tex); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,pix);   // (GPU→GPU — the world as drawn)
  gl.uniform2f(U.uSize,W,H); gl.uniform2f(U.uBuf,pix.width,pix.height); gl.uniform2f(U.uOff,P.ox,P.oy); gl.uniform1f(U.uTop,cv.height-1);
  gl.uniform1f(U.uDA,P.dA); gl.uniform1f(U.uVig,P.v); gl.uniform1f(U.uGlow,P.w); gl.uniform1f(U.uGlowT,P.wt);
  gl.drawArrays(gl.TRIANGLE_STRIP,0,4); ART.ms=performance.now()-t0; artWatch(); return cv; }
/* the watchdog — ONCE a session (px_critique C1): 180 pass frames running late → ONE 180-frame probe without the pass. Not clearly faster (the pass is
   innocent) → it retires, the glow kept · clearly faster (guilty) → the pass comes back without its glow for one more window; still clearly slower than
   the probe → off for the session (one toast). Never judged in a story scene or a lord fight (a probe in flight is cancelled); a third probe start retires
   it · ART.wdOff: a test run's pin · 🎮 Options Off → On re-arms it */
function artWatch(){ const Wd=ART.wd; if(Wd.done || ART.wdOff){ Wd.a.length=0; return; }   // (retired for the session · or a test run pinned it)
  const now=performance.now(), dt=now-Wd.t; Wd.t=now;
  if(SCN || (mode==='island' && ISL && ISL.boss && !ISL.boss.dead && (ISL.boss.aggro || ISL.seal))){ Wd.a.length=0; ART.probe=0; return; }   // (a story scene or a lord fight: never judged — a probe in flight is cancelled, so neither plays unfiltered)
  if(!(dt>0 && dt<100) || document.hidden){ Wd.a.length=0; return; }                           // (a pause or a hidden tab isn't the pass's)
  Wd.a.push(dt); if(Wd.a.length<180) return; const a=Wd.a.slice().sort((x,y)=>x-y), m=a[90]; Wd.a.length=0; Wd.ref=Math.min(Wd.ref,a[18]);   // (ref: the display's own frame — the best p10 seen)
  if(ART.probe){ ART.probe=0; if(m<Wd.base*0.85){ ART.noGlow=1; Wd.p=m; Wd.st=1; } else Wd.done=1; return; }   // the probe's verdict: innocent → retire, glow kept · guilty → try the pass without its glow
  if(Wd.st===1){ Wd.done=1; if(m>Wd.p*1.15){ ART.off=1; toast('🖼 The pixel filter is off for now','it was slowing this device — 🎮 Options turns it back on'); } return; }   // still clearly slower than no pass → off for the session
  if(m<=Wd.ref*1.3) return; if(++Wd.n>2){ Wd.done=1; return; } Wd.base=m; ART.probe=1; }      // late → a probe (a third start retires it)
/* CRT scanlines (Options): thin dark rows on every texel row, at full resolution — after the blit, under the HUD (TG1's look, filled from a 1-row pattern) */
function artScan(){ const a=+ITUNE.artScan||0; if(!GFX.scan || !ART.P || !(a>0)) return; const step=Math.max(2,Math.round(PIX_SCALE*DPR))/DPR, n=Math.round(step*DPR), k=n+'|'+a;   // (PX RELEASE FIX PRC-D1: keyed on the tile's device-px height — a DPR change at the same texel size rebuilds it)
  if(ART.sk!==k){ ART.sk=k; const c=ART.scan||(ART.scan=document.createElement('canvas')); c.width=1; c.height=n; const q=c.getContext('2d'); q.clearRect(0,0,1,n); q.fillStyle='rgba(6,8,16,'+a+')'; q.fillRect(0,0,1,1); ART.pat=ctx.createPattern(c,'repeat'); }   // (one dark row every n device px: a 1 × n tile, ≈ 0 memory at any window)
  ctx.save(); ctx.setTransform(1,0,0,1,0,0); ctx.fillStyle=ART.pat; ctx.fillRect(0,0,Math.ceil(CSSW*DPR),Math.ceil(CSSH*DPR)); ctx.restore(); }
/* 🎮 Options → 🖼 Picture (renderControlsTab, after 📖 Story scenes) */
function gfxBlock(){ const can=artGL(), on=can&&GFX.art&&!ART.off, sd=!can?1:!on?2:0, B=(k,v,sel,t,tip,dis)=>'<button class="sbtn'+(sel?'':' ghost')+'" data-gfx="'+k+':'+v+'"'+(tip?' title="'+tip+'"':'')+(dis===2?' disabled data-stop="1"':dis?' disabled':'')+'>'+t+'</button>';   // (PX RELEASE FIX PRC-B1: on = the filter as it runs — the watchdog's off shows Off · PRB-B4: dis 2 = disabled, but a pad focus stop (padFocusables) — A does nothing)
  return '<div id="gfxBlock"><h3>🖼 Picture</h3>'+
    '<div class="ctlrow"><span class="cln">Pixel filter</span><span class="scnseg">'+B('art',1,on,'On','the SNES look — a colour grade, a soft dither, a vignette',!can)+B('art',0,!on,'Off','',!can)+'</span></div>'+
    '<div class="ctlrow"><span class="cln">CRT scanlines</span><span class="scnseg">'+B('scan',0,!GFX.scan,'Off','',sd)+B('scan',1,!!GFX.scan,'On','thin dark lines, like an old TV',sd)+'</span></div>'+
    '<p class="hint">'+(can ? (ART.off ? 'Turned off for now — it was slowing this device. ' : '')+'The filter only touches the world — words, maps & menus stay crisp · kept on this device' : 'This browser can’t run the pixel filter — the game looks as it always has')+'</p></div>'; }
function gfxBlockWire(){ const H=document.getElementById('gfxBlock'); if(!H) return;
  H.querySelectorAll('[data-gfx]').forEach(b=>{ b.onclick=()=>{ if(b.disabled) return; const q=b.dataset.gfx.split(':'); GFX[q[0]]=+q[1];
    if(q[0]==='art' && GFX.art){ ART.off=0; ART.noGlow=0; ART.probe=0; ART.wd.a.length=0; Object.assign(ART.wd,{done:0, st:0, p:0, n:0, base:0, ref:1e9}); }      // (turned back on: the watchdog starts over, re-armed · PX7 FIX: ref too — the display's frame is learnt afresh, so an old 144 Hz best can't call a 60/72 Hz window late)
    gfxSave(); sfx('ui_tick'); gfxBlockRefresh(); }; }); }
function gfxBlockRefresh(){ const H=document.getElementById('gfxBlock'); if(!H) return; const f=padFocusEl && H.contains(padFocusEl) ? padFocusEl.dataset.gfx : null;
  H.outerHTML=gfxBlock(); gfxBlockWire(); if(f){ const k=f.split(':')[0], n=document.querySelector('#gfxBlock [data-gfx^="'+k+':"].sbtn:not(.ghost)')||document.querySelector('#gfxBlock [data-gfx^="'+k+':"]'); if(n) padSetFocus(n); } }
