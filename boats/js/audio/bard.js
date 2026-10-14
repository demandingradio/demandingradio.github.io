"use strict";
/* FILE: js/audio/bard.js
THE BARD: the in-game SNES-style music engine (instrument bank, BTN tracker compiler, scheduler, live graph, DEV jukebox and
offline render), moved verbatim from original lines 5738-6202 (build 5109cd5).
Entry points: musBoot (from initAudio), musInit (the live graph, on the first play), musPlay, musEnd, musFree, musVolOf,
  musCompile, musTrackReady, musBankBuild, musBankReady, musNeed, musSkinOf, musSkinT, musDress, musLen;
  DEV panel and console only: musJuke, musJukeIds, musStop, musAuto, musMeter, musStat, musVoices, musCheck, musLint, musRun,
  musBankCheck, musSeam, musRender, musRenderAll, musRow, musSelfTest.
Globals it owns: MUS_G, MUS_VMAX, MUS_LOOK, MUS_SR, the graph lets musBus, musLP, musComp, musDuckG, musVolG, MUSG (set by
  musInit), MUSB (the bank), MUSC (compiled tracks), MUS (engine and Director state, written from many places at runtime),
  MUS_PATCH, MUS_KIT, MUS_KITG, MUS_KITL, MUS_KITR, MUS_CJ, MUS_PC, MUS_SUF, MUS_MODE, MUS_SKIN and every mus function here.
Globals it reads from elsewhere (inside functions, at runtime): TAU, clamp, mulberry32 (index.html, first part); actx,
  masterG, initAudio, SNDP, audioOn, SND_DUCKG, musIR, musIRjob, musIRstep (js/audio/audio.js); the songbook MUS_T and
  MUS_TD (original line 6209 (build 5109cd5) and original line 7828 (build 5109cd5)); the Director's musResolve, musFin,
  musSounding, musReap (original line 7853 (build 5109cd5) onwards).
Load-time statements (4): MUSB from MUS_SR (original line 5750 (build 5109cd5)); MUS with its Float32Array (original line
  5752 (build 5109cd5)); the loop that names every MUS_PATCH entry (original line 5784 (build 5109cd5)); musSeam.step=0
  (original line 5921 (build 5109cd5)). The idle bank and compile slices, the musTick interval and the musFree timer start
  only at runtime (musBoot, musPlay), never at load. Load after js/audio/audio.js and before the songbook and the Director.
*/
/* ============================ THE BARD (PT1 M1 — pt1_audio §3.9) — the in-game SNES-style music engine ============================
   A SAMPLER, as the SPC700 was: it synthesises its own instrument samples at 32 kHz into AudioBuffers (Karplus-Strong plucks · looped wavetable cycles,
   the ensemble & the vibrato baked in · modal mallets, bells, piano & timpani · noise drums) — one AudioBufferSource + one gain a note, pitched by playbackRate.
   THE GRAPH  voices → chGain (the layer) → [chLP] → chPan → trkG (the instance's fade) ─┬─ dry ──────────────────────────────────→ musBus
                                                                                        ├─ rvSend (fx.rv) → musRev (a convolver, musIR) → musBus
                                                                                        └─ ecSend (fx.ew) → the echo (delay ⇄ fb · 2.2 kHz LP) → musBus
     musBus → musLP (11 kHz: warmth · M2a's muffles) → musComp (−16 dB 3:1) → musDuckG (sndDuck 'mus') → musVolG (the prefs × MUS_G) → masterG.
   The same graph renders offline (musRender) — how a verifier listens. BTN (the BOATS Tracker Notation, §3.9.3) → musCompile (+ musLint) → events ·
   musTick (every 50 ms, 0.3 s ahead) schedules them · ≤ 32 voices. M2a's DIRECTOR drives it (musUpdate → musEval → musGo); the DEV jukebox (musJuke) overrides it till musAuto.
   Console: musCheck · musRender · musRenderAll({from,n}) · musSelfTest · musStat · musVoices · musBankReady · musBankCheck · musSeam */
const MUS_G=0.5, MUS_VMAX=32, MUS_LOOK=0.30, MUS_SR=32000;   // the music's level under the prefs (M6's mix pass: kept — at 60 % in a crawl the music sits ≈ 12 dB under the effects' typical hit peaks, 19 under their loudest tenth) · the voice cap · the look-ahead (s) · the bank's rate
let musBus=null, musLP=null, musComp=null, musDuckG=null, musVolG=null, MUSG=null;   // the live graph (musInit — on the first play)
const MUSB={sr:MUS_SR, p:{}, jt:[], big:[], q:null, busy:false, ready:false, wait:[], n:0, tot:0, ms:0, sl:0, mx:0, t0:0, t1:0, ir:null, irJ:null, err:null};   // THE BANK: p[patch] = {roots:[{f0, buf, ls, le, nx}], done}
const MUSC={};                                                                         // compiled tracks (musCompile)
const MUS={cur:null, old:null, all:[], tickId:null, juke:null, perf:new Float32Array(200), pi:0, pn:0, tk:{n:0, s:0, mx:0}, err:null,
  want:{st:'off', id:null, lv:0, sk:null}, st:'off', evT:0, lm:'', lq:false, ls:false, ev:{n:0, s:0, mx:0}, storm:false, fl:0, flRaw:0, flT:0, vicT:0, rest:null, aftR:false, restMul:1, quiet:false, hold:false,   // (PT1 M2a — THE DIRECTOR's state: what it wants · the state playing · the 2 Hz clock · the storm's hysteresis · the fight level · the victory clock · a rest · DEV)
  unk:{on:false, T:0, off:0, frac:0, rate:0, n0:0, end:-1e9, fresh:true, far:false, sq:0}, seaPick:null, seaL:-1, seaSk:null, sting:null, pv:null, bankAsk:null, lpT:11000, mgT:1, rvK:1, drT:-1, vicF:false, vIsl:null, vKey:'', seaN:0, dsT:0};   // (the unknown trigger · the sea's pick · the sting & the preview · the muffle targets · the drone)
function musHz(m){ return 440*Math.pow(2,(m-69)/12); }
function musRes(f,fc,Q){ return 1/(1+Math.pow(Q*(f/fc-fc/f),2)); }                    // a resonance's weight at f (the fiddle's body)
/* THE INSTRUMENTS (§3.9.2): k = ks (a pluck) · cyc (a looped cycle) · modal (decaying partials) · kit · roots (Hz) · rg the range (MIDI) · env [a, d, s, r] ·
   pl: held (note-off → the release) · ring (plays out, ≤ ring s) · damp (the piano: note-off → r) · g the patch's level (measured, K-weighted: a held note — or a pluck / strike a beat — at v 0.8 ≈ −25.7 LUFS dry; the bells ≈ 2 dB under).
   Beyond §3.9.2 (the warmth pass): fl = a pluck's soft finger (a first-order roll-off, Hz) · air [× f0, q, level] = a looped breath / bow noise under a wind or the fiddle ·
   a slow vibrato in the strings & the choir (each copy its own phase) · the brass filters follow the key a little */
const MUS_PATCH={
  harp:      {k:'ks', roots:[125,250,500,1000], t60:3.0, sm:2, pos:0, br:0.12, fl:2600, len:3.2, env:[.002,0,1,.6], pl:'ring', ring:3.0, rg:[36,96], g:0.38},
  guitar:    {k:'ks', roots:[125,250], t60:2.0, sm:1, pos:0.2, br:0, fl:2200, body:[[110,4,.18],[240,3,.12]], len:2.4, env:[.002,0,1,.35], pl:'held', rg:[40,83], g:0.4},
  pizz:      {k:'ks', roots:[125,250,500], t60:0.55, sm:3, pos:0.15, br:0, fl:2000, body:[[200,2,.1]], len:0.8, env:[.002,0,1,.10], pl:'held', rg:[36,84], g:0.67},
  ubass:     {k:'ks', roots:[62.5,125], t60:1.8, sm:4, pos:0.25, br:0, fl:1100, sine:0.25, len:2.0, env:[.003,0,1,.12], pl:'held', rg:[28,55], g:0.37},
  strings:   {k:'cyc', roots:[125,250,500,1000], hn:28, h:n=>(1/n)*(n>8?8/n:1), cp:[[-1,.8],[0,1],[1,.8]], vib:[5,.0015], loop:0.8, lp:3200, env:[.22,.3,.85,.7], pl:'held', rg:[36,96], g:0.31},
  choir:     {k:'cyc', roots:[125,250,500], hn:30, h:(n,f)=>Math.pow(n,-0.6)*(1/(1+Math.pow((f-730)/90,2))+0.5/(1+Math.pow((f-1090)/110,2))+0.25/(1+Math.pow((f-2440)/170,2))), cp:[[-1,.8],[0,1],[1,.8]], vib:[5,.002], loop:0.8, lp:3000, env:[.45,.3,.9,1.0], pl:'held', rg:[48,81], g:0.29},
  flute:     {k:'cyc', roots:[250,500,1000], h:[1,.2,.1,.03], vib:[5,.004], att:0.2, chiff:{bp:0, q:2, g:.25, dec:.06}, air:[4,1,0.035], loop:0.8, env:[.03,.1,.9,.12], pl:'held', rg:[60,96], g:0.3},
  whistle:   {k:'cyc', roots:[500,1000], h:[1,.35,.22,.1,.05], vib:[6.25,.003], att:0.2, chiff:{bp:0, q:2, g:.35, dec:.05}, air:[3,1,0.045], loop:0.8, env:[.02,.08,.9,.08], pl:'held', rg:[74,98], g:0.3},
  ocarina:   {k:'cyc', roots:[250,500,1000], h:[1,.04,.06], vib:[5,.0025], att:0.2, chiff:{bp:0, q:2, g:.15, dec:.06}, air:[3,1,0.03], loop:0.8, env:[.04,.1,.9,.15], pl:'held', rg:[60,89], g:0.3},
  fiddle:    {k:'cyc', roots:[250,500,1000], hn:24, h:(n,f)=>(1/n)*(1+0.6*musRes(f,450,2)+0.6*musRes(f,2800,2)), vib:[5.625,.008], att:0.2, chiff:{bp:2500, q:1.5, g:.12, dec:.08}, air:[5,1,0.03], loop:1.6, env:[.05,.1,.9,.15], pl:'held', rg:[55,93], g:0.285},
  accordion: {k:'cyc', roots:[125,250,500], hn:30, h:n=>Math.pow(n,-0.75)*(n&1?1.4:1), cp:[[0,1],[3,.8]], oc:.35, loop:0.8, lp:6000, env:[.025,.08,.95,.07], pl:'held', rg:[48,81], g:0.27},
  concertina:{k:'cyc', roots:[250,500], hn:16, h:n=>Math.pow(n,-0.9), cp:[[0,1],[1,.8]], loop:0.8, lp:5500, env:[.03,.1,.9,.08], pl:'held', rg:[60,84], g:0.27},
  horn:      {k:'cyc', roots:[125,250], hn:20, h:n=>Math.pow(n,-1.1), cp:[[0,1],[1,.6]], vlp:[500,2400,.1,1600], loop:0.8, env:[.08,.2,.85,.2], pl:'held', rg:[41,77], g:0.33},
  trumpet:   {k:'cyc', roots:[250,500], hn:24, h:n=>Math.pow(n,-0.8), vlp:[900,4500,.06,3200], loop:0.8, env:[.04,.15,.85,.12], pl:'held', rg:[54,84], g:0.285},
  marimba:   {k:'modal', roots:[261.63,523.25], pr:[1,3.93,9.2], pa:[1,.28,.08], pt:[1.0,.3,.1], tk:0.5, st:{lp:3000, ms:2, g:.2}, pl:'ring', ring:1.2, rg:[48,84], g:0.405},
  celesta:   {k:'modal', roots:[523.25,1046.5], pr:[1,2,3,4.1], pa:[1,.12,.2,.05], pt:[1.8,.6,.35,.15], st:{lp:5000, ms:1, g:.1}, pl:'ring', ring:2.0, rg:[60,96], g:0.161},
  glock:     {k:'modal', roots:[1046.5,2093], pr:[1,2.76,5.40,8.93], pa:[1,.45,.2,.08], pt:[2.2,.9,.45,.2], st:{lp:6000, ms:1, g:.08}, pl:'ring', ring:2.5, rg:[79,108], g:0.17},
  musicbox:  {k:'modal', roots:[1046.5], pr:[1,3.01,5.9], pa:[1,.25,.12], pt:[1.2,.35,.15], st:{lp:7000, ms:1, g:.15}, pl:'ring', ring:1.3, rg:[72,96], g:0.196},
  bell:      {k:'modal', roots:[261.63,523.25], pr:[.5,1,1.19,1.5,2,2.5,2.98,4.1], pa:[.35,1,.55,.3,.45,.2,.15,.08], pt:[4.5,3.5,2.8,2.2,1.8,1.2,.9,.5], st:{lp:4000, ms:3, g:.15}, pl:'ring', ring:4.0, rg:[60,84], g:0.27},
  keys:      {k:'modal', roots:[130.8,261.63,523.25], piano:1, st:{lp:800, ms:8, g:.1}, env:[.002,0,1,.3], pl:'damp', ring:3.0, rg:[33,96], g:0.25},
  timp:      {k:'modal', roots:[98,130.8], pr:[1,1.5,1.99,2.44,2.98], pa:[1,.55,.35,.18,.1], pt:[2.0,1.2,1.0,.7,.5], gl:.02, gt:.05, st:{lp:1200, ms:25, g:.35}, pl:'ring', ring:2.0, rg:[38,57], g:0.434},
  kit:       {k:'kit', g:1} };
for(const n in MUS_PATCH) MUS_PATCH[n].nm=n;
/* THE KIT (§3.9.2's table): the token letters (an event's m = the index) · each element's level in the mix — up to 3 takes of each (a new noise each), picked
   never twice running, ±2 % in pitch: no machine gun (MUS_KITR holds the recipes) */
const MUS_KIT='KkDSsTtHWQPCXB', MUS_KITG={K:.44, k:.45, D:.5, S:.62, s:.25, T:.43, t:.22, H:.27, W:.57, Q:.57, P:.85, C:.26, X:.36, B:1};   // (measured: a hit a beat at v 0.8 = a held note's loudness, then K 0 · k −3 · D +1 · S −1 · s −9 · T −3 · t −4 · H −6 · W −3 · P −1 · C −2 dB)
/* the largest playback rate a root serves: the geometric midpoint to the next root up · the top root: its range's top (+3, the compiler's slack) */
function musRateMax(P,i){ const R=P.roots; return i<R.length-1 ? Math.sqrt(R[i+1]/R[i]) : Math.max(1, musHz(P.rg[1]+3)/R[i]); }
function musBuf(d){ let b; try{ b=new AudioBuffer({length:d.length, numberOfChannels:1, sampleRate:MUS_SR}); }catch(e){ b=(actx||new OfflineAudioContext(1,1,MUS_SR)).createBuffer(1,d.length,MUS_SR); } b.getChannelData(0).set(d); return b; }
function musBQ(f,q){ const w=TAU*f/MUS_SR, c=Math.cos(w), al=Math.sin(w)/(2*q), a0=1+al, b0=al/a0, b2=-al/a0, a1=-2*c/a0, a2=(1-al)/a0; let x1=0, x2=0, y1=0, y2=0;   // an RBJ bandpass (0 dB at the peak)
  return x=>{ const y=b0*x+b2*x2-a1*y1-a2*y2; x2=x1; x1=x; y2=y1; y1=y; return y; }; }
function musNz(n,rnd){ const x=new Float32Array(n); for(let i=0;i<n;i++) x[i]=rnd()*2-1; return x; }
function musBQa(x,f,q){ const w=TAU*f/MUS_SR, c=Math.cos(w), al=Math.sin(w)/(2*q), a0=1+al, b0=al/a0, b2=-al/a0, a1=-2*c/a0, a2=(1-al)/a0, y=new Float32Array(x.length); let x1=0, x2=0, y1=0, y2=0;   // the same bandpass over a whole array
  for(let i=0;i<x.length;i++){ const v=b0*x[i]+b2*x2-a1*y1-a2*y2; x2=x1; x1=x[i]; y2=y1; y1=v; y[i]=v; } return y; }
function musLP1(f){ const a=1-Math.exp(-TAU*f/MUS_SR); let y=0; return x=>(y+=a*(x-y)); }
function musNorm(d,pk,fo){ let m=0; for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>m) m=a; } const k=pk/(m||1); for(let i=0;i<d.length;i++) d[i]*=k; const n=Math.min(d.length,Math.round((fo||0)*MUS_SR)); for(let i=0;i<n;i++) d[d.length-1-i]*=i/n; return k; }
/* (the renderers are generators: each yields every few thousand samples, so the bank's slices stay short even while the JIT is cold — musRun(g) runs one through) */
function musRun(g){ let r; while(!(r=g.next()).done); return r.value; }
/* KS — a Karplus-Strong pluck: one period of band-limited noise (the harmonic cap: n·f0·rateMax ≤ 20 kHz, < 15 kHz) smoothed sm× by [¼,½,¼] (cos²(πk/N) a pass),
   the pluck point's comb (2|sin(πk·pos)|), a soft finger · the loop y[n] = ρ·½(y[n−N] + y[n−N−1]), ρ = 10^(−3/(t60·f0)) · its true pitch SR/(N+½) is the root's f0 */
function* musKS(P,f0,rmax,rnd){ const SR=MUS_SR, N=Math.round(SR/f0), n=Math.round(SR*P.len), y=new Float32Array(n), e=new Float64Array(N), F=SR/(N+0.5), cap=Math.min(15000,20000/rmax);
  const K=Math.max(1,Math.min((N>>1)-1, Math.floor(cap/(SR/N)))); yield;
  for(let k=1;k<=K;k++){ let a=(0.55+0.45*rnd())*Math.pow(Math.cos(Math.PI*k/N),2*P.sm); if(P.pos) a*=2*Math.abs(Math.sin(Math.PI*k*P.pos)); if(P.fl) a/=Math.sqrt(1+Math.pow(k*SR/N/P.fl,2));
    const ph=rnd()*TAU, w=TAU*k/N; if(a<0.002) continue;   // (−54 dB: too faint to hear)
    const cw=Math.cos(w), sw=Math.sin(w); let x=Math.cos(ph), z=Math.sin(ph); for(let j=0;j<N;j++){ e[j]+=a*z; const x2=x*cw-z*sw; z=z*cw+x*sw; x=x2; } if((k&3)===3) yield; }
  const rho=Math.pow(10,-3/(P.t60*F));
  for(let i=0;i<n;i++){ y[i]= i<N ? e[i]*(1+(P.br||0)) : rho*0.5*(y[i-N]+(i>N?y[i-N-1]:e[N-1])); if((i&4095)===4095) yield; }
  if(P.sine){ musNorm(y,1,0); const kd=Math.pow(10,-3/(P.t60*SR)), w=TAU*F/SR; let a=P.sine; for(let i=0;i<n;i++){ y[i]+=a*Math.sin(w*i); a*=kd; if((i&8191)===8191) yield; } }   // the upright's round fundamental
  if(P.body){ const x=y.slice(); for(const [f,Q,mx] of P.body){ const th=TAU*f/SR, r=Math.exp(-Math.PI*f/Q/SR), c1=2*r*Math.cos(th), c2=-r*r, b0=(1-r)*Math.sqrt(1-2*r*Math.cos(2*th)+r*r); let y1=0, y2=0;   // the body's resonances
      for(let i=0;i<n;i++){ const v=b0*x[i]+c1*y1+c2*y2; y2=y1; y1=v; y[i]+=mx*v; if((i&8191)===8191) yield; } } }
  yield; musNorm(y,0.9,0.03); return {f0:F, d:y}; }
/* CYC — a looped cycle: a 2048-point wavetable (seeded phases, the harmonic cap) read by each copy at Nc = f0·loop + oc whole cycles a loop (+ the octave-down copy),
   vibrato as a phase wobble with fv·loop whole cycles — so φ(t+loop) − φ(t) is an integer and the seam is seamless by construction · an attack segment (att s)
   holds the chiff / the bow's scrape · the loop's RMS → 0.25, its peak ≤ 0.95 · nx = the sample after the loop's end (musSeam reads it) */
function* musCyc(P,f0,rmax,rnd){ const SR=MUS_SR, L=P.loop||0.8, att=P.att||0, nA=Math.round(att*SR), nL=Math.round(L*SR), n=nA+nL, cap=Math.min(15000,20000/rmax), TS=2048;
  const H=[]; const hn=P.hn||P.h.length; for(let k=1;k<=hn;k++){ if(k*f0>=cap) break; H.push(Array.isArray(P.h)?P.h[k-1]:P.h(k,k*f0)); }
  const W=new Float32Array(TS+1), Wd=new Float64Array(TS), ph=H.map(()=>rnd()*TAU);
  for(let k=0;k<H.length;k++){ const w=TAU*(k+1)/TS, cw=Math.cos(w), sw=Math.sin(w), a=H[k]; let x=Math.cos(ph[k]), z=Math.sin(ph[k]); for(let j=0;j<TS;j++){ Wd[j]+=a*z; const x2=x*cw-z*sw; z=z*cw+x*sw; x=x2; } if((k&7)===7) yield; }
  for(let j=0;j<TS;j++) W[j]=Wd[j]; W[TS]=W[0];
  const o=new Float64Array(n+1), N0=Math.round(f0*L), vf=P.vib?P.vib[0]:0, vd=P.vib?P.vib[1]:0, cps=(P.cp||[[0,1]]).map(c=>[N0+c[0],c[1]]); if(P.oc) cps.push([N0/2,P.oc]);
  cps.forEach((c,ci)=>c.push(ci?rnd()*TAU:0));   // (each copy its own vibrato phase: an ensemble that breathes)
  for(const [Nc,gc,vq] of cps){ const fr=Nc/L, be=vf?vd*fr/vf:0, p0=rnd(); for(let i=0;i<=n;i++){ const t=i/SR; let p=p0+fr*t+(be?be*(i<nA?i/nA:1)*Math.sin(TAU*vf*t+vq):0);   // (the vibrato grows through the attack: a quick note stays pure)
    p-=Math.floor(p); const x=p*TS, j=x|0; o[i]+=gc*(W[j]+(W[j+1]-W[j])*(x-j)); if((i&2047)===2047) yield; } }
  let ss=0, pk=0; for(let i=nA;i<n;i++){ ss+=o[i]*o[i]; } for(let i=0;i<=n;i++) pk=Math.max(pk,Math.abs(o[i])); let k=0.25/Math.sqrt(ss/nL||1); if(pk*k>0.95) k=0.95/pk; yield;
  const d=new Float32Array(n); for(let i=0;i<n;i++) d[i]=o[i]*k; yield;
  if(P.chiff && nA>0){ const C=P.chiff, bq=musBQ(C.bp||clamp(3*f0,1500,4000),C.q||2), fo=Math.round(0.03*SR); for(let i=0;i<nA;i++){ const t=i/SR, en=Math.min(1,t/0.003)*Math.exp(-t/C.dec)*(i>nA-fo?(nA-i)/fo:1); d[i]+=C.g*pk*k*bq(rnd()*2-1)*en*2.5; } }   // the breath / the bow's bite — in the attack only
  let nx=o[n]*k; if(P.air){ const [fm,q,lv]=P.air, w=musNz(nL,rnd), ww=new Float32Array(2*nL); ww.set(w); ww.set(w,nL); yield; const y=musBQa(ww,clamp(fm*f0,1500,6000),q).subarray(nL); yield; let sa=0; for(let j=0;j<nL;j++) sa+=y[j]*y[j];
    const ka=0.25*lv/Math.sqrt(sa/nL||1); for(let j=0;j<nL;j++) d[nA+j]+=ka*y[j]; for(let i=0;i<nA;i++) d[i]+=ka*y[((nL-nA+i)%nL+nL)%nL]; nx+=ka*y[0]; }   // (the breath under a flute, the bow's hiss under a fiddle)
  return {f0:N0/L, d, ls:nA/SR, le:n/SR, nx}; }
/* MODAL — a sum of decaying partials x(t) = Σ aᵢ e^(−6.908 t/t60ᵢ) sin φᵢ(t) (a glide for the timpani's head) + the strike (noise → a one-pole LP) · the piano:
   12 stretched partials (√(1+0.0004n²)) on two strings ±0.8 cents */
function* musModal(P,f0,rmax,rnd){ const SR=MUS_SR, cap=Math.min(15000,20000/rmax), part=[];
  if(P.piano){ const ks=Math.pow(261.6/f0,0.3); for(let n=1;n<=12;n++){ const f=n*f0*Math.sqrt(1+0.0004*n*n), a=Math.pow(n,-1.3), t=3.2/Math.pow(n,0.7)*ks; for(const c of [-0.8,0.8]) part.push([f*Math.pow(2,c/1200),a*0.5,t]); } }
  else { const ks=P.tk?Math.pow(261.6/f0,P.tk):1; P.pr.forEach((r,i)=>part.push([r*f0,P.pa[i],P.pt[i]*ks])); }
  const L=part.filter(p=>p[0]<cap), tm=Math.max(...L.map(p=>p[2])), n=Math.round(SR*Math.min(P.ring||3,tm*1.4+0.05)), y=new Float64Array(n), A=L.reduce((s,p)=>s+p[1],0);
  for(const [f,a,t60] of L){ const kd=Math.exp(-6.908/(t60*SR)), m=Math.min(n,Math.ceil(t60*SR*1.34)); let amp=a, i=0, ph=0;   // (to −80 dB)
    if(P.gl){ const kg=Math.exp(-1/(P.gt*SR)), mg=Math.min(m,Math.round(P.gt*6*SR)); let ge=1; for(;i<mg;i++){ y[i]+=amp*Math.sin(ph); ph+=TAU*f*(1+P.gl*ge)/SR; ge*=kg; amp*=kd; } yield; }   // the head's pitch settles (2 % over ≈ 5τ)
    const w=TAU*f/SR, cw=Math.cos(w), sw=Math.sin(w); let x=Math.cos(ph), z=Math.sin(ph); for(;i<m;i++){ y[i]+=amp*z; const x2=x*cw-z*sw; z=z*cw+x*sw; x=x2; amp*=kd; if((i&16383)===16383) yield; } yield; }
  const S=P.st; if(S){ const l1=musLP1(S.lp), l2=musLP1(S.lp), tau=S.ms/1000, m=Math.min(n,Math.round(tau*5*SR)), k=Math.exp(-1/(tau*SR)), z=new Float32Array(m); let en=1, zs=0;   // the strike: noise through two poles (a felt mallet, not a hiss) at
    for(let i=0;i<m;i++){ z[i]=l2(l1(rnd()*2-1)); zs+=z[i]*z[i]; } const kz=S.g*A*0.5/Math.sqrt(zs/Math.max(1,m)||1); for(let i=0;i<m;i++){ y[i]+=kz*z[i]*en; en*=k; } }   // an RMS of g·Σa/2 as it starts
  yield; const d=new Float32Array(n); for(let i=0;i<n;i++) d[i]=y[i]; yield; musNorm(d,0.9,0.02); return d; }
/* the kit's elements (§3.9.2's recipes) — [length s, takes, …parts]: ['sw', f0, f1, tf, ta, g] a pitched thump (f0 + f1·e^(−t/tf), amp e^(−t/ta)) · ['n', lp|hp|bp, f, q,
   attack, decay, g] noise · ['p', f, decay, g, attack] a partial · ['clap'] three bursts and a tail · ['swell'] the cymbal's rise to the bar line. B is the bell patch */
const MUS_KITL='KkDSTtHWQPCX', MUS_KITR={
  K:[0.5,3,['sw',62,33,.03,.12,1],['n','lp',900,0,0,.02,.25]], k:[0.25,3,['sw',120,40,.02,.05,1],['n','lp',2000,0,0,.015,.35]], D:[1.2,2,['sw',42,30,.05,.25,1],['n','lp',400,0,0,.04,.3]],
  S:[0.3,3,['n','bp',1800,.8,0,.06,1],['sw',160,25,.02,.03,.4]], T:[0.3,3,['n','hp',6000,0,0,.05,1],['p',5200,.08,.15],['p',6900,.08,.15],['p',8400,.08,.15]],
  t:[0.35,3,['n','hp',6000,0,.03,.2,1],['p',5200,.2,.15,.03],['p',6900,.2,.15,.03],['p',8400,.2,.15,.03]], H:[0.12,3,['n','hp',5000,0,.015,.06,1]],
  W:[0.12,1,['p',880,.025,1],['p',1560,.015,.5]], Q:[0.35,3,['sw',55,25,.02,.09,1],['n','lp',600,0,0,.03,.5]], P:[0.3,3,['clap']], C:[1.5,1,['swell']],
  X:[2.0,1,['n','hp',3500,0,0,.6,1],['p',3100,.4,.2],['p',4700,.4,.2],['p',6300,.4,.2]] };
function* musKitEl(L,rnd){ const R=MUS_KITR[L], SR=MUS_SR, n=Math.round(R[0]*SR), out=[], E=Math.exp;
  for(let tk=0;tk<R[1];tk++){ const d=new Float32Array(n);
    for(let pi=2;pi<R.length;pi++){ const q=R[pi];
      if(q[0]==='sw'){ const kf=E(-1/(q[3]*SR)), ka=E(-1/(q[4]*SR)); let ph=0, ef=1, ea=q[5]; for(let i=0;i<n;i++){ d[i]+=ea*Math.sin(ph); ph+=TAU*(q[1]+q[2]*ef)/SR; ef*=kf; ea*=ka; } yield; }
      else if(q[0]==='n'){ const ty=q[1], kd=E(-1/(q[5]*SR)), na=Math.round(q[4]*SR), a=1-E(-TAU*q[2]/SR), bq=ty==='bp'?musBQ(q[2],q[3]):null, gk=q[6]*(ty==='lp'?2:ty==='bp'?1.6:1); let ed=1, y=0;
        for(let i=0;i<n;i++){ const x=rnd()*2-1; let v; if(bq) v=bq(x); else { y+=a*(x-y); v=ty==='lp'?y:x-y; } d[i]+=gk*v*(i<na?i/na:ed); if(i>=na) ed*=kd; if((i&8191)===8191) yield; } }
      else if(q[0]==='p'){ const w=TAU*q[1]/SR, cw=Math.cos(w), sw=Math.sin(w), ka=E(-1/(q[2]*SR)), na=Math.round((q[4]||0)*SR); let x=Math.cos(q[1]), z=Math.sin(q[1]), ea=q[3];
        for(let i=0;i<n;i++){ d[i]+=z*(i<na?ea*i/na:ea); if(i>=na) ea*=ka; const x2=x*cw-z*sw; z=z*cw+x*sw; x=x2; } yield; }
      else if(q[0]==='clap'){ const x=musNz(n,rnd), b=musBQa(x,1200,1), k1=E(-1/(0.006*SR)), k2=E(-1/(0.08*SR)), i1=Math.round(0.011*SR), i2=Math.round(0.022*SR); let e0=1, e1=0, e2=0, et=0;
        for(let i=0;i<n;i++){ if(i===i1) e1=1; if(i===i2){ e2=1; et=0.5; } d[i]+=b[i]*(e0+e1+e2+et)*1.5; e0*=k1; e1*=k1; e2*=k1; et*=k2; } }   // three hands, 11 ms apart, and the room
      else if(q[0]==='swell'){ const x=musNz(n,rnd); yield; const b1=musBQa(x,5200,3); yield; const b2=musBQa(x,7600,3), a=1-E(-TAU*3000/SR), kd=E(-1/(0.12*SR)), nr=Math.round(1.2*SR); let y=0, ed=1; yield;
        for(let i=0;i<n;i++){ y+=a*(x[i]-y); let en; if(i<nr){ en=i/nr; en*=en; } else { en=ed; ed*=kd; } d[i]+=en*((x[i]-y)+0.8*b1[i]+0.6*b2[i]); if((i&16383)===16383) yield; } } }
    yield; musNorm(d,0.9,0.005); out.push(musBuf(d)); yield; }
  return out; }
/* THE BANK — built time-sliced (≤ 6 ms of work a slice, in idle time): one root of one patch a slice (cheap ones share a slice) · the patches a track wants first ·
   musBankReady(ids?) → a promise when those patches (else all) are in · the live reverb's impulse is made in the same slices (musIRjob) once there is a context */
function musBankJobs(first){ const J=[], seen={}, put=n=>{ const P=MUS_PATCH[n]; if(!P || seen[n]) return; seen[n]=1; if(P.k==='kit') for(let i=0;i<MUS_KITL.length;i++) J.push({p:n, i}); else P.roots.forEach((f,i)=>J.push({p:n, i})); };
  for(const n of first||[]) put(n); for(const n in MUS_PATCH) put(n); return J; }
function musBankJob(J,dl){ const P=MUS_PATCH[J.p], B=MUSB.p[J.p]||(MUSB.p[J.p]={roots:[], done:false, nb:0}), rnd=J.r||(J.r=mulberry32((musHashS(J.p)+J.i*7919)>>>0));
  const f0=P.k==='kit'?0:P.roots[J.i], rm=P.k==='kit'?1:musRateMax(P,J.i), g=J.g||(J.g=P.k==='kit'?musKitEl(MUS_KITL[J.i],rnd):P.k==='ks'?musKS(P,f0,rm,rnd):P.k==='cyc'?musCyc(P,f0,rm,rnd):musModal(P,f0,rm,rnd));
  let r; while(!(r=g.next()).done) if(performance.now()>dl) return false;                // (not done: the next slice carries on)
  if(P.k==='kit'){ const L=MUS_KITL[J.i], K=B.k||(B.k={}); K[L]=r.value; if(L==='S') K.s=K.S; if(++B.nb>=MUS_KITL.length) B.done=true; return true; }   // (an element a job)
  const v=r.value; B.roots[J.i]=P.k==='modal'?{f0, buf:musBuf(v), ls:null, le:null}:{f0:v.f0, buf:musBuf(v.d), ls:v.ls==null?null:v.ls, le:v.le==null?null:v.le, nx:v.nx};
  if(++B.nb>=P.roots.length) B.done=true; return true; }
function musHashS(s){ let h=2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
function musBankBuild(first){ if(!MUSB.q){ MUSB.q=musBankJobs(first); MUSB.tot=MUSB.q.length; MUSB.t0=performance.now(); }
  else if(first && first.length){ const F=new Set(first); MUSB.q.sort((a,b)=>(F.has(b.p)?1:0)-(F.has(a.p)?1:0)); }   // (a track's patches to the front — the job in hand stays first only if it is one of them)
  if(!MUSB.busy && (MUSB.q.length || (actx && !MUSB.ir && !MUSG))) musBankSched(); }
function musBankUrg(){ return MUSB.wait.length>0 || !!(MUS.bankAsk && !musTrackReady(MUS.bankAsk)); }   // (G12 FIX) a tune waits on the bank — the title's first press, a Continue: timer slices, not a busy page's scraps of idle time
function musBankSched(){ MUSB.busy=true; const hid=document.visibilityState==='hidden', u=!hid && musBankUrg();
  if(!hid && !u && window.requestIdleCallback) requestIdleCallback(musBankSlice,{timeout:60}); else setTimeout(()=>musBankSlice(null),hid||u?0:4); }
function musBankSlice(dl){ const w0=performance.now(), hid=document.visibilityState==='hidden', lim=hid?40:dl?(dl.didTimeout?5.5:clamp(dl.timeRemaining()-1,1,6)):musBankUrg()?4.5:4;
  musBankSlice.lj=null; try{ while(MUSB.q.length){ const J=MUSB.q[0], j0=performance.now(); musBankSlice.lj=J.p+':'+J.i; const dn=musBankJob(J,w0+lim-1.5); J.ms=(J.ms||0)+performance.now()-j0; if(dn){ MUSB.q.shift(); MUSB.n++; MUSB.jt.push([J.p,J.i,+J.ms.toFixed(2)]); } const w=performance.now()-w0; if(w>=lim-1.5) break; }   // (jobs back to back while the slice has time — each yields every ≈ 0.1–1 ms)
    if(!MUSB.q.length && actx && !MUSB.ir && !MUSG && performance.now()-w0<lim){ const J=MUSB.irJ||(MUSB.irJ=musIRjob(actx,2.2,0.45,7000)); while(!musIRstep(J,4096)) if(performance.now()-w0>=lim) break; if(J.done){ MUSB.ir=J.B; MUSB.irJ=null; } }
  }catch(e){ MUSB.err=String(e&&e.stack||e).slice(0,300); if(MUSB.q.length) MUSB.q.shift(); }
  const w=performance.now()-w0; MUSB.ms+=w; MUSB.sl++; if(w>MUSB.mx) MUSB.mx=w; if(w>6 && MUSB.big.length<20) MUSB.big.push([+w.toFixed(1), musBankSlice.lj||'ir']);   // (DEV: the slices over budget, and what they were on)
  if(!MUSB.q.length && !MUSB.ready){ MUSB.ready=true; MUSB.t1=performance.now(); musCmpIdle(); }   // (M6: then the tunes compile in idle time)
  musBankWake(); if(MUSB.q.length || (actx && !MUSB.ir && !MUSG)) musBankSched(); else MUSB.busy=false; }   // (G12 FIX: the impulse only while the graph waits — musInit makes its own)
function musNeed(ids){ const S=new Set(); if(!ids){ for(const p in MUS_PATCH) S.add(p); return S; }
  for(const id of [].concat(ids)){ const T=MUS_T[id]||MUS_TD[id]; if(!T) continue; for(const c in T.ch){ const i=T.ch[c].i; S.add(i); if(i==='kit') S.add('bell'); }   // (the kit's B is the bell patch)
    if(T.skin) for(const g in T.skin) for(const c in (T.skin[g].ch||{})) if(T.skin[g].ch[c].i) S.add(T.skin[g].ch[c].i); }
  return S; }
function musBankHas(S){ for(const p of S) if(MUS_PATCH[p] && !(MUSB.p[p] && MUSB.p[p].done)) return false; return true; }
function musBankWake(){ for(let i=MUSB.wait.length-1;i>=0;i--){ const W=MUSB.wait[i]; if(musBankHas(W.need)){ MUSB.wait.splice(i,1); W.ok(true); } } }
function musBankReady(ids){ const need=musNeed(ids); if(musBankHas(need)) return Promise.resolve(true); musBankBuild([...need]); return new Promise(ok=>MUSB.wait.push({need, ok})); }
function musTrackReady(id){ return musBankHas(musNeed(id)); }
/* (M6 — G13V-C06) THE IDLE COMPILE: once the bank is built, every tune (and skin) not yet compiled is compiled a step at a time (the header, a section,
   a section's lint — musCmpStep) in the page's real idle time: requestIdleCallback with NO timeout, a step only while timeRemaining() covers the dearest
   step seen — so the first port, the first squall, the first night find their tune ready instead of compiling it inside that frame. A hidden page never
   idles: the lazy compile (musCompile on the first want) stands, as before */
const MUS_CJ={J:null, busy:false, n:0, st:0, ms:0, mx:0.5, done:false, bad:{}};
function musCmpNext(){ for(const id in MUS_T){ if(!MUSC[id] && !MUS_CJ.bad[id]) return id; for(const g in (MUS_T[id].skin||{})){ const d=id+'.'+g; if(!MUSC[d] && !MUS_CJ.bad[d]){ musSkinT(id,g); return d; } } } return null; }
function musCmpIdle(){ if(MUS_CJ.busy || MUS_CJ.done || !window.requestIdleCallback) return; MUS_CJ.busy=true; requestIdleCallback(musCmpSlice); }
function musCmpSlice(dl){ const w0=performance.now(), K=MUS_CJ;
  try{ while(dl.timeRemaining()>=K.mx+1){ let J=K.J; if(J && (MUSC[J.id] || (MUS_T[J.id]||MUS_TD[J.id])!==J.T)) J=K.J=null;   // (compiled meanwhile — a state wanted it — or the track changed: the job is dropped)
      if(!J){ const id=musCmpNext(); if(!id){ K.done=true; break; } J=K.J=musCmpJob(id); }
      const t=performance.now(); let dn=false; try{ dn=musCmpStep(J); }catch(e){ K.bad[J.id]=1; dn=true; } const w=performance.now()-t; K.st++; if(w>K.mx) K.mx=Math.min(w,12);   // (the dearest step sets the idle time a step waits for · a track that throws is left to the lazy compile)
      if(dn){ K.J=null; K.n++; } } }catch(e){}
  K.ms+=performance.now()-w0; K.busy=false; musCmpIdle(); }
/* (DEV) musBankCheck() → [] when every patch has every root, no NaN and no peak over 1 · musSeam(patch) → the worst loop seam: the step from the loop's
   end back to its start, set against the waveform's own next sample (nx), in units of the loop's RMS (< 0.15) — plus that step vs the loop's largest natural step */
function musBankCheck(){ const P=[]; for(const n in MUS_PATCH){ const D=MUS_PATCH[n], B=MUSB.p[n]; if(!B || !B.done){ P.push(n+': not built'); continue; }
    if(D.k==='kit'){ for(const L in B.k) for(const b of B.k[L]){ const d=b.getChannelData(0); let pk=0, nan=0; for(let i=0;i<d.length;i++){ const a=d[i]; if(a!==a) nan++; else if(Math.abs(a)>pk) pk=Math.abs(a); } if(nan) P.push(n+'.'+L+': NaN'); if(pk>1) P.push(n+'.'+L+': peak '+pk.toFixed(3)); } continue; }
    D.roots.forEach((f,i)=>{ const R=B.roots[i]; if(!R){ P.push(n+': root '+f+' missing'); return; } const d=R.buf.getChannelData(0); let pk=0, nan=0; for(let j=0;j<d.length;j++){ const a=d[j]; if(a!==a) nan++; else if(Math.abs(a)>pk) pk=Math.abs(a); }
      if(nan) P.push(n+' '+f+': '+nan+' NaN'); if(pk>1) P.push(n+' '+f+': peak '+pk.toFixed(3)); if(!(pk>0.01)) P.push(n+' '+f+': silent'); }); }
  return P; }
function musSeam(name){ const B=MUSB.p[name], D=MUS_PATCH[name]; if(!B || !B.done || D.k!=='cyc') return null; let worst=0, step=0;
  for(const R of B.roots){ const d=R.buf.getChannelData(0), a=Math.round(R.ls*MUS_SR), e=d.length; let ss=0, mx=0; for(let i=a;i<e;i++){ ss+=d[i]*d[i]; if(i>a) mx=Math.max(mx,Math.abs(d[i]-d[i-1])); }
    const rms=Math.sqrt(ss/Math.max(1,e-a)), j=Math.abs(d[a]-R.nx)/(rms||1), s=Math.abs(d[a]-d[e-1])/(mx||1); if(j>worst) worst=j; if(s>step) step=s; }
  musSeam.step=+step.toFixed(3); return +worst.toFixed(5); }
musSeam.step=0;
/* ---- BTN → events (§3.9.3–3.9.4). An event {t, c, m:[midi | kit index], w (written midi), d, v, f, k (its step), s} · f: 1 accent · 2 ghost · 4 cut · 8 scoop ·
   16 strum up · 32 strum down · 64 staccato · 128 roll (a timp's ~) ---- */
const MUS_PC={c:0, d:2, e:4, f:5, g:7, a:9, b:11}, MUS_SUF={'!':1, '?':2, '~':4, '^':8, '>':16, '<':32, '*':64};
const MUS_MODE={ion:[0,2,4,5,7,9,11], maj:[0,2,4,5,7,9,11], dor:[0,2,3,5,7,9,10], phr:[0,1,3,5,7,8,10], lyd:[0,2,4,6,7,9,11], mix:[0,2,4,5,7,9,10], aeo:[0,2,3,5,7,8,10], min:[0,2,3,5,7,8,10], loc:[0,1,3,5,6,8,10], hm:[0,2,3,5,7,8,11]};
function musKeyOf(k){ const m=/^\s*([a-gA-G])([#b]?)\s*([a-z]*)\s*$/.exec(k||''); if(!m) return null; const md=MUS_MODE[m[3]||'ion']; if(!md) return null;
  const t=(MUS_PC[m[1].toLowerCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0)+12)%12; return {t, md, sc:md.map(x=>(x+t)%12)}; }
function musMeterOf(m){ const q=/^(\d+)\/(\d+)$/.exec(m||'4/4'), a=q?+q[1]:4, b=q?+q[2]:4, cp=b===8 && a%3===0 && a>3; return {pb:cp?a/3:a, pf:cp?3/b:1/b}; }   // pulses a bar · a pulse as a fraction of a whole note
function musTokParse(tok,kit){ const m=[], chr=[]; let f=0;
  for(let p of tok.split('+')){ let c=false; while(p.length>1){ const z=p[p.length-1]; if(z==="'"){ c=true; p=p.slice(0,-1); } else if(MUS_SUF[z]){ f|=MUS_SUF[z]; p=p.slice(0,-1); } else break; }
    if(kit){ const i=MUS_KIT.indexOf(p); if(p.length!==1 || i<0) return null; m.push(i); chr.push(false); continue; }
    const q=/^([a-gA-G])([#b]?)(-?\d)$/.exec(p); if(!q) return null; m.push(12*(+q[3]+1)+MUS_PC[q[1].toLowerCase()]+(q[2]==='#'?1:q[2]==='b'?-1:0)); chr.push(c); }
  return m.length?{m, chr, f}:null; }
function musLine(R,X,ci,ch,str,s,S,ev,E){ const bars=str.split('|').map(x=>x.trim()).filter(x=>x.length), stp=X.bar/s, sw=(s===8||s===16)?R.sw:0, nm=X.name+'.'+ch.n;
  const base=0.8*(ch.C.v==null?1:ch.C.v)*(S.v && S.v[ch.n]!=null?S.v[ch.n]:1), lo=ch.C.oct?ch.C.oct[0]:ch.P&&ch.P.rg?ch.P.rg[0]:0, hi=ch.C.oct?ch.C.oct[1]:ch.P&&ch.P.rg?ch.P.rg[1]:127, timp=ch.C.i==='timp';
  if(bars.length!==X.b) E(nm+': '+bars.length+' bars, not '+X.b);
  let open=null, av=1, at=0, prev=null;
  const tAt=k=>{ const bi=Math.floor(k/s), j=k-bi*s; return bi*X.bar+j*stp+((j&1) && sw?sw*stp:0); };   // a step's time (swing delays the odd steps)
  const close=()=>{ if(!open) return; const t=tAt(open.k); let d=tAt(open.k+open.n)-t; if(open.f&64) d*=0.5; ev.push({t, c:ci, m:open.m, w:open.w, chr:open.chr, d, v:open.v, f:open.f, k:open.k, s}); open=null; };
  bars.forEach((bs,bi)=>{ let toks=bs.split(/\s+/).filter(x=>x); if(toks.length===1 && toks[0]==='%'){ if(prev) toks=prev; else { E(nm+' bar '+(bi+1)+': % with no bar before'); toks=['_']; } }
    let n=0; const k0=bi*s;
    for(const tk of toks){
      if(tk[0]==='@'){ const q=/^@([vt])([+-]?\d*\.?\d+)$/.exec(tk); if(!q){ E(nm+' bar '+(bi+1)+': bad token '+tk); continue; } if(q[1]==='v') av=+q[2]; else at=Math.round(+q[2]); continue; }
      if(tk==='_' || tk==='='){ if(toks.filter(x=>x[0]!=='@').length>1) E(nm+' bar '+(bi+1)+': '+tk+' must be alone in its bar'); if(tk==='_') close(); else if(open) open.n+=s; n+=s; continue; }
      if(tk==='-'){ if(open && !ch.kit) open.n++; n++; continue; }
      if(tk==='.'){ close(); n++; continue; }
      const p=musTokParse(tk,ch.kit); if(!p){ E(nm+' bar '+(bi+1)+': bad token '+tk); n++; continue; }
      close(); if(p.m.length>4) E(nm+' bar '+(bi+1)+': a chord of '+p.m.length+' notes (4 at most)');
      let f=p.f; if(timp && (f&4)) f=(f&~4)|128;   // (a timp's ~ is a roll)
      const tr=(X.tr|0)+at+(ch.C.t|0), m=ch.kit?p.m:p.m.map(x=>x+tr);   // (M5a: ch.C.t — a skin's octave shift for its swapped patch)
      if(!ch.kit) for(const x of m) if(x<lo-3 || x>hi+3) E(nm+' bar '+(bi+1)+': '+tk+' is out of the '+ch.C.i+"'s range");
      open={k:k0+n, n:1, m, w:p.m, chr:p.chr, f, v:base*av*(f&1?1.3:1)*(f&2?0.55:1)}; if(ch.kit) close(); n++; }
    if(n!==s) E(nm+' bar '+(bi+1)+': '+n+' steps, not '+s);
    prev=toks; });
  close(); }
function musCompile(id){ if(MUSC[id]) return MUSC[id]; const J=musCmpJob(id); while(!musCmpStep(J)); return J.R; }   // (M6: the compile in steps — musCmpIdle runs the same steps in idle time)
function musCmpJob(id){ const T=MUS_T[id]||MUS_TD[id], R={id, secs:{}, form:[], loop:0, errs:[], warns:[], chs:[], key:null, mt:null, sw:0};
  return {id, T, R, E:s=>{ if(R.errs.length<40) R.errs.push(s); }, sn:Object.keys((T && T.sec)||{}), i:0, ph:0, L:null}; }
function musCmpStep(J){ const T=J.T, R=J.R, E=J.E;   // one step → true when done (and cached): the header · each section · the form · each section's lint · the cache
  if(J.ph===0){ if(!T){ E('no track '+J.id); J.ph=9; return true; }
    const key=R.key=musKeyOf(T.key); if(!key) E('bad key '+T.key); R.mt=musMeterOf(T.m); R.sw=clamp(+T.sw||0,0,0.33);
    const chn=Object.keys(T.ch||{}); if(chn.length>8) E('more than 8 channels ('+chn.length+')');
    chn.forEach(n=>{ const C=T.ch[n]; if(C.i!=='kit' && !MUS_PATCH[C.i]) E(n+': unknown patch '+C.i); R.chs.push({n, C, P:MUS_PATCH[C.i]||null, kit:C.i==='kit'}); });
    if(key && T.tr) R.ksc=key.sc.map(x=>(x+(T.tr|0)+120)%12);                              // (M5a: a skin's whole-tune lift — the cuts read the sounding scale; the lint reads the written key)
    J.ph=1; return false; }
  if(J.ph===1){ if(J.i<J.sn.length){ const sn=J.sn[J.i++], S=T.sec[sn], bpm=S.bpm||T.bpm||90, bar=R.mt.pb*60/bpm, ev=[], X={name:sn, b:S.b|0, bar, bpm, dur:(S.b|0)*bar, ev, tr:(S.tr|0)+(T.tr|0)};
      R.chs.forEach((ch,ci)=>{ const str=S[ch.n]; if(str==null) return; musLine(R,X,ci,ch,String(str),(S.s && S.s[ch.n])||ch.C.s||1,S,ev,E); });
      ev.sort((a,b)=>a.t-b.t || a.c-b.c); R.secs[sn]=X; return false; }
    R.form=(T.form||[]).slice(); if(!R.form.length) E('no form'); for(const f of R.form) if(!R.secs[f]) E('the form names a missing section '+f);
    R.loop=clamp(T.loop|0,0,Math.max(0,R.form.length-1)); R.once=T.loop<0; R.end=T.end||null; R.coda=T.coda||null;   // (G12 FIX: a rested tune's last section before its rest · the coda after it — a section outside the form · M6: loop −1 = once through, then it ends (the stings))
    if(R.end && R.form.indexOf(R.end)<0) E('the end names a section outside the form '+R.end); if(R.coda && !R.secs[R.coda]) E('the coda names a missing section '+R.coda);
    J.i=0; J.ph=(R.key && !R.errs.length)?2:3; if(J.ph===2) J.L=musLintCtx(R); return false; }
  if(J.ph===2){ if(J.i<J.sn.length){ musLintSec(R,J.L,J.sn[J.i++]); return false; } musLintEnd(R,J.L); J.ph=3; }
  MUSC[J.id]=R; J.ph=9; return true; }
/* THE LINT (§3.9.4) — the ears of composers who cannot hear: 1 out of the key's scale (no ') · 2 a lead's strong-step note a m2 / M7 / tritone against anything
   sounding · 3 a lead's leap past an octave · 4 parallel 8ves / 5ths, the bass against a lead, strong step to strong step · 5 more than 24 voices at once (est.) ·
   6 a section's last strong-step melody note not a chord tone of I, IV or V */
function musLint(R){ const C=musLintCtx(R); for(const sn in R.secs) musLintSec(R,C,sn); musLintEnd(R,C); }   // (M6: a section at a time — musCmpStep)
function musLintCtx(R){ const W=R.warns, pc=x=>((x%12)+12)%12, lead=R.chs.map((ch,i)=>!ch.kit && (ch.C.mono || ch.n==='mel' || ch.C.L==='top')?i:-1).filter(i=>i>=0);
  return {sc:new Set(R.key.sc), K:R.key.sc, pc, nn:x=>['c','c#','d','eb','e','f','f#','g','ab','a','bb','b'][pc(x)]+(Math.floor(x/12)-1), wv:s=>{ if(W.length<80) W.push(s); },
    lead, mel:lead.find(i=>R.chs[i].n==='mel')??lead[0], bas:R.chs.findIndex(ch=>ch.n==='bas'), tot:{}, out:{}}; }
function musLintEnd(R,C){ for(const c in C.out) if(C.out[c]>0.1*C.tot[c]) R.errs.push(R.chs[c].n+': '+C.out[c]+' of '+C.tot[c]+' notes out of the key ('+Object.keys(MUS_MODE).find(k=>MUS_MODE[k]===R.key.md)+')'); }
function musLintSec(R,Cx,sn){ const {sc,K,pc,nn,wv,lead,mel,bas,tot,out}=Cx;
  { const X=R.secs[sn], ev=X.ev, at=(c,t)=>{ let r=null; for(const e of ev) if(e.c===c && e.t<=t+1e-6 && e.t+e.d>t+1e-6) r=e; return r; };
    for(const e of ev){ const ch=R.chs[e.c]; if(ch.kit) continue; e.w.forEach((x,i)=>{ tot[e.c]=(tot[e.c]||0)+1; if(!e.chr[i] && !sc.has(pc(x))){ out[e.c]=(out[e.c]||0)+1; wv('1 out of key: '+sn+'.'+ch.n+' bar '+(Math.floor(e.k/e.s)+1)+' '+nn(x)); } }); }
    for(const c of lead){ const L=ev.filter(e=>e.c===c); let pv=null;
      for(const e of L){ const j=e.k%e.s; if(j===0 || (e.s%2===0 && j===e.s/2)){ let hit=null;
          for(const o of ev){ if(o.c===c || R.chs[o.c].kit || !(o.t<=e.t+1e-6 && o.t+o.d>e.t+1e-6)) continue; for(const a of e.m) for(const b of o.m){ const ic=pc(a-b); if(ic===1 || ic===11 || ic===6){ hit=nn(a)+' vs '+R.chs[o.c].n+' '+nn(b); break; } } if(hit) break; }
          if(hit) wv('2 clash: '+sn+'.'+R.chs[c].n+' bar '+(Math.floor(e.k/e.s)+1)+' step '+j+': '+hit); }
        const top=Math.max(...e.m); if(pv!=null && Math.abs(top-pv)>12) wv('3 leap: '+sn+'.'+R.chs[c].n+' bar '+(Math.floor(e.k/e.s)+1)+' '+nn(pv)+' → '+nn(top)); pv=top; }
      if(bas>=0 && c!==bas){ let p=null;   // 4: the strong steps (each half bar) of this section
        for(let q=0;q<2*X.b;q++){ const t=q*X.bar/2, a=at(c,t), b=at(bas,t); if(!a || !b){ p=null; continue; } const hi=Math.max(...a.m), lo=Math.min(...b.m), ic=pc(hi-lo);
          if(p && (ic===0 || ic===7) && ic===p.ic && hi!==p.hi && lo!==p.lo && Math.sign(hi-p.hi)===Math.sign(lo-p.lo)) wv('4 parallel '+(ic?'5ths':'8ves')+': '+sn+' bar '+((q>>1)+1)+(q&1?' (mid)':'')+' '+R.chs[c].n+'/bas');
          p={ic, hi, lo}; } } }
    { const pts=[]; for(const e of ev){ const ch=R.chs[e.c]; let len=e.d; if(ch.kit) len=0.3; else if(ch.P){ len=ch.P.pl==='ring'?Math.min(ch.P.ring||2,Math.max(e.d,1)):e.d+(ch.P.env?ch.P.env[3]:0.1); } for(let i=0;i<e.m.length;i++){ pts.push([e.t,1],[e.t+len,-1]); } }
      pts.sort((a,b)=>a[0]-b[0]||a[1]-b[1]); let n=0, mx=0; for(const p of pts){ n+=p[1]; if(n>mx) mx=n; } X.vmax=mx; if(mx>24) wv('5 voices: '+sn+' ≈ '+mx+' at once'); }
    if(mel!=null){ const tl=X.dur-(R.chs[mel].C.s%2===0?X.bar/2:X.bar), e=at(mel,tl+1e-4);
      if(e){ const deg=[0,3,4], ok=new Set(); for(const d of deg) for(const q of [0,2,4]) ok.add(K[(d+q)%7]); const w=Math.max(...e.w); if(!ok.has(pc(w))) wv('6 ending: '+sn+' ends on '+nn(w)+' — not a tone of I, IV or V'); } } } }
/* (PT1 M5a) THE BIOME SKINS — a crawl tune dressed for its shore: T.skin={group:{ch:{name:{i, v, t}}, tr, rv}} swaps a channel's patch (its v, and t: an
   octave shift so the new patch sits in its range), lifts or drops the whole tune (tr) and wets the reverb (rv +). musSkinOf(biome key) → the group (every
   shore not listed: warm, as written) · musSkinT(id, group) → the dressed tune's id ('crawl_a.cold', made once into MUS_TD) — or id, when it has no such skin */
const MUS_SKIN={frost:'cold', moor:'cold', crystal:'cold', ember:'fire', scorch:'fire', volcanic:'fire', swamp:'wet', mushroom:'wet', bamboo:'wet'};
function musSkinOf(bk){ return MUS_SKIN[bk]||null; }
function musSkinT(id,g){ const T=MUS_T[id], S=g && T && T.skin && T.skin[g]; if(!S) return id; const d=id+'.'+g; if(MUS_TD[d]) return d;
  const ch={}; for(const c in T.ch) ch[c]=Object.assign({},T.ch[c],(S.ch||{})[c]||{}); const fx=Object.assign({},T.fx||{}); if(S.rv) fx.rv=clamp((fx.rv||0)+S.rv,0,1);
  let sec=T.sec; for(const c in (S.ch||{})){ const km=S.ch[c].km; if(!km || !T.ch[c]) continue; if(sec===T.sec) sec=Object.assign({},T.sec);   // (SEAS SE8: km — a kit channel's letters swapped, e.g. the kick for a frame drum)
    for(const s in sec){ const q=sec[s]; if(typeof q[c]==='string') sec[s]=Object.assign({},q,{[c]:q[c].split(/(\s+)/).map(t=>t[0]==='@'?t:t.replace(/[A-Za-z]/g,L=>km[L]||L)).join('')}); } }   // (an @ token is left as written)
  MUS_TD[d]=Object.assign({},T,{n:T.n+' · '+g, ch, fx, sec, tr:(T.tr|0)+(S.tr|0), skin:null, sk:g, of:id}); return d; }
function musDress(id,g){ const d=g && id ? musSkinT(id,g) : id; return d===id || !musCompile(d).errs.length ? d : id; }   // (G14 FIX: the director's dressed tune — a skin that fails to compile plays the tune as written)
function musCheck(){ const o={}; for(const id in MUS_T){ delete MUSC[id]; const R=musCompile(id); o[id]={errs:R.errs.slice(), warns:R.warns.slice()};
    for(const g in (MUS_T[id].skin||{})){ const d=id+'.'+g; delete MUS_TD[d]; delete MUSC[d]; const Q=musCompile(musSkinT(id,g)); o[d]={errs:Q.errs.slice(), warns:Q.warns.slice()}; } }   // (M5a: every skin compiles too — a swapped patch's range)
  return o; }
function musLen(id){ const R=musCompile(id); let s=0; for(const f of R.form) if(R.secs[f]) s+=R.secs[f].dur; return s; }
/* ---- THE SCHEDULER & THE VOICES (§3.9.5) ---- */
function musVolOf(){ return audioOn && SNDP.on && SNDP.musOn ? Math.pow(SNDP.mus/0.6,2)*MUS_G : 0; }
function musGraph(c,out,off){ const G={c, off:!!off, V:[], now:0, nv:0};
  G.bus=c.createGain(); G.lp=c.createBiquadFilter(); G.lp.type='lowpass'; G.lp.frequency.value=11000; G.lp.Q.value=0.5;
  G.comp=c.createDynamicsCompressor(); G.comp.threshold.value=-16; G.comp.knee.value=6; G.comp.ratio.value=3; G.comp.attack.value=0.01; G.comp.release.value=0.25;
  G.duck=c.createGain(); G.mg=c.createGain(); G.vol=c.createGain(); G.vol.gain.value=off?1:musVolOf();   // (mg: M2a's muffle gain — −3 dB behind a menu, in a room, under a talk)
  G.bus.connect(G.lp); G.lp.connect(G.comp); G.comp.connect(G.duck); G.duck.connect(G.mg); G.mg.connect(G.vol); G.vol.connect(out);
  G.rvIn=c.createGain(); G.rv=c.createConvolver(); G.rv.normalize=false; G.rvIn.connect(G.rv); G.rv.connect(G.bus);
  G.ecIn=c.createGain(); G.ec=c.createDelay(1); G.ecLP=c.createBiquadFilter(); G.ecLP.type='lowpass'; G.ecLP.frequency.value=2200; G.ecLP.Q.value=0.5; G.fb=c.createGain(); G.fb.gain.value=0;
  G.ecIn.connect(G.ec); G.ec.connect(G.ecLP); G.ecLP.connect(G.bus); G.ecLP.connect(G.fb); G.fb.connect(G.ec);   // (each repeat darker — the SNES echo)
  return G; }
function musEchoSec(T){ const q=/^(\d+)\/(\d+)$/.exec((T.fx&&T.fx.ec)||'1/8'), mt=musMeterOf(T.m), whole=(60/(T.bpm||90))/mt.pf; return Math.min(0.9, q?whole*(+q[1])/(+q[2]):0.3); }   // a note value at the track's tempo
function musInst(G,id,o){ o=o||{}; const R=musCompile(id); if(R.errs.length) return null; const T=MUS_T[id]||MUS_TD[id], c=G.c, fx=T.fx||{}, t0=o.t0!=null?o.t0:c.currentTime+0.1;
  const I={id, R, T, G, trkG:c.createGain(), ch:[], fi:0, sec:null, t0, ptr:0, lv:0, loopsDone:0, ending:false, rnd:o.rnd||Math.random, solo:o.solo||null, hum:(T.hum||0)/1000, mono:[], ring:[], hist:[], kl:{}};
  const g0=T.g==null?1:T.g; if(o.fadeIn){ const p=I.trkG.gain; p.setValueAtTime(0,c.currentTime); p.setValueAtTime(0,Math.max(c.currentTime,t0)); p.linearRampToValueAtTime(g0,t0+o.fadeIn); } else I.trkG.gain.value=g0;   // (G12 FIX: silent till its first note — a fade-in on the bar line starts there, not when it was asked for)
  I.trkG.connect(G.bus); const rv=c.createGain(), ec=c.createGain(); rv.gain.value=fx.rv||0; ec.gain.value=fx.ew||0; I.trkG.connect(rv); rv.connect(G.rvIn); I.trkG.connect(ec); ec.connect(G.ecIn); I.snd=[rv,ec];
  if(!o.keepFx) try{ G.ec.delayTime.setValueAtTime(musEchoSec(T),t0); G.fb.gain.setValueAtTime(clamp(fx.fb||0,0,0.8),t0); }catch(e){}   // (the incoming track's echo wins — a sting keeps the music's: keepFx)
  R.chs.forEach(ch=>{ const g=c.createGain(); let tail=g; if(ch.P && ch.P.lp){ const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=ch.P.lp; f.Q.value=0.5; g.connect(f); tail=f; }
    if(c.createStereoPanner){ const p=c.createStereoPanner(); p.pan.value=clamp(ch.C.p||0,-1,1); tail.connect(p); tail=p; } tail.connect(I.trkG); I.ch.push({g, out:tail, ch, L:ch.C.L||'', tgt:1}); });
  if(o.sec && R.form.indexOf(o.sec)>=0) o.fi=R.form.indexOf(o.sec); I.fi=clamp(o.fi|0,0,R.form.length-1); I.sec=o.sec&&R.secs[o.sec]?R.secs[o.sec]:R.secs[R.form[I.fi]]; I.ts=t0; I.fiL=o.fadeIn||0;
  if(o.bar>1){ const off=(Math.min(o.bar,I.sec.b)-1)*I.sec.bar; I.t0-=off; while(I.ptr<I.sec.ev.length && I.sec.ev[I.ptr].t<off-1e-6) I.ptr++; }   // (o.bar: begin at that bar of the section — musSkipTo)
  I.setLv=n=>musSetLv(I,n); musSetLv(I, o.lv==null?(T.lv||[[]]).length-1:o.lv, true); return I; }   // (o.sec: start at a section — M2a's intros)
function musSetLv(I,n,now){ const L=I.T.lv||[[]]; n=clamp(n|0,0,L.length-1); I.lv=n; const on=new Set(L[n]||[]), c=I.G.c, t=now?0:musNextBeat(I);
  for(const C of I.ch){ const tg=(I.solo && C.ch.n!==I.solo)?0:(!C.L || on.has(C.L))?1:0; C.tgt=tg; const p=C.g.gain;
    if(now){ p.cancelScheduledValues(0); p.value=tg; } else { try{ if(p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); }catch(e){} p.setTargetAtTime(tg,t,tg?0.25:0.8); } } }   // (up ≈ 0.8 s to full · down ≈ 3 s, from the next beat)
function musNextBar(I){ const c=I.G.c, now=c.currentTime; let t0=I.t0, S=I.sec; if(now<t0 && I.hist[0]){ t0=I.hist[0].t0; S=I.hist[0].S; } return Math.max(now, t0+Math.ceil((now-t0)/S.bar-1e-6)*S.bar); }   // (M2a: transitions land on the bar line)
function musNextBeat(I){ const c=I.G.c, now=c.currentTime, S=I.sec, pu=60/(S.bpm||90); return Math.max(now, I.t0+Math.ceil((now-I.t0)/pu-1e-6)*pu); }
function musSched(I,until){ if(I.fin) return; for(let g=0;g<512;g++){ const S=I.sec; while(I.ptr<S.ev.length){ const e=S.ev[I.ptr]; if(I.t0+e.t>=until) return; musEv(I,e,S); I.ptr++; }
    if(I.t0+S.dur>=until) return; I.hist.unshift({S, t0:I.t0}); if(I.hist.length>2) I.hist.pop();
    I.t0+=S.dur; I.fi++; if(I.endSec){ musFin(I); return; }                                // (M2a: a one-section sting ends with its section)
    if(I.coda){ I.coda=false; if(I.endLoops){ musFin(I); return; } I.fi=I.R.form.length; }   // (G12 FIX) the coda rung: the rest · (the plan dropped meanwhile — another state took the tune: on round the form)
    else if(I.endLoops && S.name===I.R.end && I.loopsDone>=I.endLoops-1){ if(!I.R.coda){ musFin(I); return; } I.coda=true; I.sec=I.R.secs[I.R.coda]; I.ptr=0; continue; }   // a rested tune ends on its `end` (a tonic, never the turnaround) — then its coda
    if(I.fi>=I.R.form.length){ if(I.R.once){ musFin(I); return; } I.fi=I.R.loop; I.loopsDone++; if(I.endLoops && I.loopsDone>=I.endLoops){ musFin(I); return; } }   // (…and a tune its planned loops: the director's rest · M6: a once-through tune — a sting — ends with its form, live or offline)
    I.sec=I.R.secs[I.R.form[I.fi]]; I.ptr=0; } }
function musUpper(R,m){ const sc=R.ksc||R.key.sc; for(let d=1;d<=3;d++) if(sc.indexOf(((m+d)%12+12)%12)>=0) return m+d; return m+2; }   // the diatonic upper neighbour (a cut — in a skin's lifted key)
function musEv(I,e,S){ const C=I.ch[e.c]; if(!C || (C.tgt===0 && C.g.gain.value<0.01)) return; const ch=C.ch, t=I.t0+e.t+(ch.kit?0:(I.rnd()*2-1)*I.hum), v=e.v*(1+(I.rnd()*2-1)*0.04);
  if(!I.G.off && t<I.G.c.currentTime-0.08) return;                                       // (G12 FIX: a note a stall made late is dropped — never a cluster of them at once)
  if(ch.kit){ for(const k of e.m) musKitHit(I,C,k,Math.max(t,0),v,e,S); return; }
  const f=e.f, ms=e.m.slice(); if(f&48){ ms.sort((a,b)=>a-b); if(f&32) ms.reverse(); }
  ms.forEach((m,i)=>{ let tt=Math.max(0,t+((f&48)?0.018*i:0)), d=e.d;
    if(f&4){ musVoice(I,C,ch.P,musUpper(I.R,m),tt,0.035,v*0.8,0); tt+=0.035; d=Math.max(0.03,d-0.035); }   // a cut: 35 ms of the upper neighbour, then the note
    if(f&128){ for(let x=0;x<d-0.01;x+=0.05) musVoice(I,C,ch.P,m,tt+x,0.05,v*(0.5+0.2*I.rnd()),0); return; }   // a roll: a re-strike every 50 ms (each damps the last)
    musVoice(I,C,ch.P,m,tt,d,v,f&8); }); }
function musCap(G,t,cv){ const V=G.V, lim=G.off?t:Math.min(t,G.now); let n=0, old=null;
  for(let i=V.length-1;i>=0;i--){ const x=V[i]; if(x.e<=lim){ V.splice(i,1); continue; } if(x.t<=t+1e-4 && x.e>t){ n++; if(!old || x.t<old.t) old=x; } }
  if(n<MUS_VMAX) return true; if((cv==null?1:cv)<0.5) return false; if(old) musKill(old,t,0.02); return true; }   // at the cap: a quiet channel's note is dropped, else the oldest voice is stolen
function musKill(V,t,fd){ try{ const p=V.g.gain; if(p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); p.setTargetAtTime(0,t,fd/3); V.s.stop(t+fd*2.5+0.01); }catch(e){} V.e=Math.min(V.e,t+fd*2.5+0.01); }
function musVoice(I,C,P,m,t,d,v,sc){ const G=I.G, c=G.c, B=MUSB.p[P.nm]; if(!B || !B.done) return null; const f=musHz(m); let R=B.roots[0], bd=1e9;
  for(const r of B.roots){ const q=Math.abs(Math.log2(f/r.f0)); if(q<bd){ bd=q; R=r; } }   // the nearest root
  if(C.ch.C.mono && C.last && C.last.e>t) musKill(C.last,t,0.03);                       // mono: a new note cuts the last one's release to 30 ms
  if(P.pl==='ring'){ const K=C.rg||(C.rg={}), o=K[m]; if(o && o.e>t) musKill(o,t,0.08); }  // a ring patch's same pitch re-struck: an 80 ms damp
  if(!musCap(G,t,C.ch.C.v)) return null;
  const src=c.createBufferSource(), g=c.createGain(), rate=f/R.f0, pk=v*(P.g||0.4), E=P.env||[.001,0,1,.08]; src.buffer=R.buf; g.gain.value=0; let te, ts;   // (0 before the envelope's first event: a source starting between two samples renders that first sample — at the default gain of 1 it was a one-sample click)
  if(sc){ src.playbackRate.setValueAtTime(rate*0.94387,t); src.playbackRate.linearRampToValueAtTime(rate,t+0.06); } else src.playbackRate.value=rate;   // a scoop: up from a semitone below
  if(R.ls!=null){ src.loop=true; src.loopStart=R.ls; src.loopEnd=R.le; }
  let node=src; if(P.vlp){ const lp=c.createBiquadFilter(), vn=clamp(v/0.64,0.3,1.3), kt=clamp(Math.sqrt(f/220),0.75,1.8); lp.type='lowpass'; lp.Q.value=0.7;   // the brass bloom: dark → bright with the velocity → settled
      lp.frequency.setValueAtTime(P.vlp[0]*kt,t); lp.frequency.linearRampToValueAtTime(P.vlp[1]*vn*kt,t+P.vlp[2]); lp.frequency.setTargetAtTime(P.vlp[3]*(0.6+0.4*vn)*kt,t+P.vlp[2],0.12); src.connect(lp); node=lp; }
  node.connect(g); g.connect(C.g); const dur=R.buf.duration/rate;
  if(P.pl==='ring'){ g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(pk,t+0.001); ts=t+Math.min(P.ring||3,dur); }
  else { const a=Math.max(0.001,Math.min(E[0],d*0.6)); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(pk,t+a); if(E[1]>0 && E[2]<1) g.gain.setTargetAtTime(pk*E[2],t+a,E[1]/3);
    te=Math.max(t+a,t+d); g.gain.setTargetAtTime(0,te,Math.max(0.005,E[3]/4)); ts=te+E[3]*2+0.05; if(R.ls==null) ts=Math.min(ts,t+dur); }
  src.start(t); src.stop(ts); const V={s:src, g, t, e:ts, C, m, I}; G.V.push(V); G.nv++; C.n=(C.n||0)+1; C.last=V; if(P.pl==='ring') C.rg[m]=V;
  if(!G.off) src.onended=()=>{ try{ g.disconnect(); if(node!==src) node.disconnect(); }catch(e){} };
  return V; }
function musKitHit(I,C,k,t,v,e,S){ const L=MUS_KIT[k], G=I.G, c=G.c;
  if(L==='B') return musVoice(I,C,MUS_PATCH.bell,74,t,1,0.75*v,0);                      // the ship's bell: the bell patch at D5
  const K=MUSB.p.kit; if(!K || !K.done || !K.k[L]) return null; if(!musCap(G,t,C.ch.C.v)) return null;
  const tk=K.k[L], last=I.kl[L]==null?-1:I.kl[L], j=(last+1+((I.rnd()*(tk.length-1))|0))%tk.length; I.kl[L]=j;   // a take never the same twice running
  const b=tk[j], src=c.createBufferSource(), g=c.createGain(); src.buffer=b; src.playbackRate.value=1+(I.rnd()*2-1)*0.02; g.gain.value=v*(MUS_KITG[L]||0.5); src.connect(g); g.connect(C.g);
  let st=t, off=0; if(L==='C'){ const be=I.t0+(Math.floor(e.k/e.s)+1)*S.bar; st=be-1.2; if(st<t){ off=t-st; st=t; } }   // the swell peaks on the next bar line
  const ts=st+(b.duration-off)/src.playbackRate.value; src.start(st,off); src.stop(ts+0.01); const V={s:src, g, t:st, e:ts, C, m:-1, I}; G.V.push(V); G.nv++; C.n=(C.n||0)+1;
  if(!G.off) src.onended=()=>{ try{ g.disconnect(); }catch(e){} }; return V; }
/* ---- live: the graph on the first play · the tick · the jukebox ---- */
function musInit(){ if(MUSG) return true; if(!actx){ initAudio(); if(MUSG) return true; } if(!actx || !masterG) return false;   // (G12 FIX: initAudio → musBoot may have made it — never a second graph)
  try{ MUSG=musGraph(actx,masterG,false); musBus=MUSG.bus; musLP=MUSG.lp; musComp=MUSG.comp; musDuckG=MUSG.duck; musVolG=MUSG.vol; SND_DUCKG.mus=musDuckG;   // (the KEEP stings' & the blasts' music ducks go live)
    MUSG.rv.buffer=(MUSB.ir && MUSB.ir.sampleRate===actx.sampleRate)?MUSB.ir:musIR(actx,2.2,0.45,7000); MUSB.irJ=null; }catch(e){ MUSG=null; MUS.err=String(e).slice(0,200); return false; }   // (a half-made bank impulse is dropped — the graph has its own)
  return true; }
function musBoot(){ if(SNDP.musOn){ musBankBuild(); if(SNDP.on) musInit(); } }          // (initAudio: the bank in idle slices — ready long before the music is asked for · M2a: the graph too (its convolver ≈ 24 ms) — on the title's first press or a voyage's start, never mid-play)
function musTickOn(){ if(MUS.tickId==null) MUS.tickId=setInterval(musTick,50); }
function musTick(){ const w0=performance.now();
  try{ if(actx && MUSG){ const now=MUSG.now=actx.currentTime; for(const I of MUS.all.slice()){ if(!I.fin) musSched(I,now+MUS_LOOK); else if(now>I.tEnd && !musSounding(I,now)) musReap(I); } } }catch(e){ MUS.err=String(e&&e.stack||e).slice(0,300); }   // (M2a: a finished tune — its last note rung out — lets go)
  const w=performance.now()-w0; MUS.perf[MUS.pi]=w; MUS.pi=(MUS.pi+1)%200; if(MUS.pn<200) MUS.pn++; const K=MUS.tk; K.n++; K.s+=w; if(w>K.mx) K.mx=w;
  if(!MUS.all.length){ clearInterval(MUS.tickId); MUS.tickId=null; } }
function musPlay(id,o){ o=o||{}; if(!musInit() || !musTrackReady(id)) return null; const I=musInst(MUSG,id,{lv:o.lv, sec:o.sec, fadeIn:o.fadeIn==null?0.3:o.fadeIn, t0:o.t0!=null?o.t0:actx.currentTime+0.12});   // (o: lv · sec · fadeIn · t0 · xf, the outgoing track's fade)
  if(!I) return null;
  if(MUS.cur){ MUS.old=MUS.cur; musEnd(MUS.old,o.xf==null?1.0:o.xf,o.xfAt); } MUS.cur=I; MUS.all.push(I); musTickOn(); musSched(I,actx.currentTime+MUS_LOOK); return I; }
function musEnd(I,fade,at){ if(!I || I.ending) return; I.ending=true; const c=I.G.c, t=Math.max(c.currentTime,at||0), p=I.trkG.gain; fade=Math.max(0.05,fade);   // (at: the fade begins then — M2a's bar line)
  try{ if(p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); p.setValueAtTime(p.value,t); } p.setTargetAtTime(0,t,fade/4); }catch(e){}
  if(MUS.cur===I) MUS.cur=null; setTimeout(()=>musFree(I),(t-c.currentTime+fade+0.1)*1000); }        // (it keeps playing as it fades — a crossfade — then lets go)
function musFree(I){ const G=I.G, t=G.c.currentTime; for(let i=G.V.length-1;i>=0;i--){ const V=G.V[i]; if(V.I!==I) continue; try{ V.s.stop(t); }catch(e){} G.V.splice(i,1); }
  try{ I.trkG.disconnect(); for(const n of I.snd) n.disconnect(); for(const C of I.ch) C.g.disconnect(); }catch(e){}
  const k=MUS.all.indexOf(I); if(k>=0) MUS.all.splice(k,1); if(MUS.old===I) MUS.old=null; if(MUS.cur===I) MUS.cur=null; }
/* (DEV / console) musJuke(id, lv) plays a track (crossfading from the last) or sets its intensity · musStop(fade) (the director stands aside too) · musAuto() hands back
   to the director (M2a) · musVoices() · musStat(reset) → the state, the tick's cost (ms), the bank */
function musJukeIds(){ const L=[]; for(const id in MUS_T){ L.push(id); for(const g in (MUS_T[id].skin||{})) L.push(musSkinT(id,g)); } return L; }   // (M5a: the jukebox's list — each tune, then its skins)
function musJuke(id,lv){ if(!MUS_T[id] && !MUS_TD[id] && /\./.test(id||'')){ const q=id.split('.'); musSkinT(q[0],q[1]); } const T=MUS_T[id]||MUS_TD[id]; if(!T) return 'no track '+id; const R=musCompile(id); if(R.errs.length) return R.errs.slice();
  if(!actx) initAudio(); if(!actx) return 'no audio'; if(actx.state==='suspended' && SNDP.on) try{ actx.resume().catch(()=>{}); }catch(e){}
  lv=clamp(lv==null?(T.lv||[[]]).length-1:lv|0,0,(T.lv||[[]]).length-1); MUS.juke={id, lv};
  const go=()=>{ if(!MUS.juke || MUS.juke.id!==id) return; if(MUS.cur && MUS.cur.id===id && !MUS.cur.ending){ if(MUS.cur.lv!==MUS.juke.lv) musSetLv(MUS.cur,MUS.juke.lv); return; } musPlay(id,{lv:MUS.juke.lv}); };
  if(musTrackReady(id)) go(); else musBankReady([id]).then(go); return 'ok'; }
function musStop(fade){ MUS.juke=null; MUS.hold=true; for(const I of MUS.all.slice()) musEnd(I,fade==null?0.6:fade); return MUS.all.length; }   // (DEV: the director stands aside too — till musAuto)
function musAuto(){ MUS.juke=null; MUS.hold=false; MUS.rest=null; MUS.evT=0; return 'auto'; }   // (M2a: the director takes over — the jukebox's tune carries on if it's the one it wants, else a crossfade)
function musVoices(){ const G=MUSG; if(!G || !actx) return 0; const now=actx.currentTime; let n=0; for(const V of G.V) if(V.e>now) n++; return n; }
function musStat(reset){ const I=MUS.cur, now=actx?actx.currentTime:0; let sec=null, bar=0, nb=0;
  if(I){ let S=I.sec, t0=I.t0; if(now<t0 && I.hist[0]){ S=I.hist[0].S; t0=I.hist[0].t0; } sec=S.name; nb=S.b; bar=clamp(Math.floor((now-t0)/S.bar)+1,1,S.b); }
  let ra=0, rm=0; for(let i=0;i<MUS.pn;i++){ ra+=MUS.perf[i]; if(MUS.perf[i]>rm) rm=MUS.perf[i]; }
  const o={st:MUS.juke?'juke':I?'play':MUS.rest?'rest':'off', id:I?I.id:null, lv:I?I.lv:null, sec, bar, bars:nb, loops:I?I.loopsDone:0, voices:musVoices(), live:MUS.all.length, tickOn:MUS.tickId!=null,
    tick:{n:MUS.tk.n, avg:+(MUS.tk.s/Math.max(1,MUS.tk.n)).toFixed(4), max:+MUS.tk.mx.toFixed(3), recent:+(ra/Math.max(1,MUS.pn)).toFixed(4), rmax:+rm.toFixed(3)},
    bank:{ready:MUSB.ready, built:MUSB.n, total:MUSB.tot, ms:+MUSB.ms.toFixed(1), slices:MUSB.sl, maxSlice:+MUSB.mx.toFixed(2), took:MUSB.t1?Math.round(MUSB.t1-MUSB.t0):null, ir:!!MUSB.ir, err:MUSB.err,
      cmp:{n:MUS_CJ.n, steps:MUS_CJ.st, ms:+MUS_CJ.ms.toFixed(1), maxStep:+MUS_CJ.mx.toFixed(2), done:MUS_CJ.done}}, err:MUS.err, ctx:actx?actx.state:'none'};   // (M6: the idle compile)
  const W=MUS.want, E=MUS.ev; o.dir={st:W.st, id:W.id, rid:W.id?musDress(musResolve(W.id),W.sk):null, sk:W.sk, lv:W.lv, rest:MUS.rest?+Math.max(0,MUS.rest.until-now).toFixed(2):null, fl:MUS.fl, vicT:MUS.vicT, quiet:MUS.quiet, hold:MUS.hold,   // (PT1 M2a: the director's view)
    unk:Object.assign({},MUS.unk), lp:MUS.lpT, mg:MUS.mgT, eval:{n:E.n, avg:+(E.s/Math.max(1,E.n)).toFixed(4), max:+E.mx.toFixed(3)}};
  if(reset){ MUS.tk={n:0, s:0, mx:0}; MUS.pn=0; MUS.pi=0; MUS.ev={n:0, s:0, mx:0}; } return o; }
function musMeter(){ const s=musStat(); return 'state '+s.st+(s.id?' · '+s.id+' · lv '+s.lv+' · '+s.sec+' '+s.bar+'/'+s.bars:'')+' · voices '+s.voices+' · tick '+s.tick.recent.toFixed(2)+'/'+s.tick.rmax.toFixed(1)+' ms · bank '+(MUSB.ready?'✓':MUSB.q?MUSB.n+'/'+MUSB.tot:'—'); }
/* ---- OFFLINE (§3.9.6) — how a verifier listens: musRender(id, secs, {lv, solo, from, seed}) renders the track through the same graph in an OfflineAudioContext
   (44.1 kHz) from its form's start (or section `from`) → {rmsDb, peakDb, lufs (K-weighted, ungated), nan, clipN, notes, perCh:{ch:{notes, rmsDb, lufs}} (a channel's own, before the bus — dry, mono), silentCh, offCh,
   bands (dB of the total: <250 · 250-2k · 2k-6k · >6k Hz), onsets (s, a solo render's — or the mix's with {onsets:1}: musOnsets), t0 (the form's start in the render), len (one pass), seam (a render past the loop point: musSeamAt) · buf with {buf:1}}.
   The level is the mix's — after the bus compressor, before the volume (MUS_G & the prefs); a track's own g (M6's mix pass) is inside it, so numbers taken before M6 were at g 1 ---- */
async function musRender(id,secs,o){ o=o||{}; secs=Math.max(0.5,+secs||20); const R=musCompile(id); if(R.errs.length) return {id, err:R.errs.slice()};
  await musBankReady([id]); const SR=44100, nch=R.chs.length, oc=new OfflineAudioContext(2+nch,Math.ceil(secs*SR),SR), mg=oc.createChannelMerger(2+nch);
  oc.destination.channelCount=2+nch; oc.destination.channelCountMode='explicit'; oc.destination.channelInterpretation='discrete'; mg.connect(oc.destination);
  const tap=oc.createGain(), sp=oc.createChannelSplitter(2); tap.connect(sp); sp.connect(mg,0,0); sp.connect(mg,1,1);
  const G=musGraph(oc,tap,true); G.rv.buffer=musIR(oc,2.2,0.45,7000); const t0=0.05;
  const I=musInst(G,id,{t0, lv:o.lv, solo:o.solo, rnd:mulberry32((o.seed||12345)>>>0), sec:o.from&&R.secs[o.from]?o.from:null, fi:o.from?Math.max(0,R.form.indexOf(o.from)):0});
  I.ch.forEach((C,k)=>C.out.connect(mg,0,2+k)); musSched(I,secs);
  const buf=await oc.startRendering(), L=buf.getChannelData(0), Rr=buf.getChannelData(1), n=L.length; let ss=0, pk=0, nan=0, clip=0;
  for(let i=0;i<n;i++){ const a=L[i], b=Rr[i]; if(a!==a || b!==b){ nan++; continue; } ss+=a*a+b*b; const m=Math.max(Math.abs(a),Math.abs(b)); if(m>pk) pk=m; if(m>=1) clip++; }
  const dB=x=>x>0?+(10*Math.log10(x)).toFixed(2):-120, perCh={}, silentCh=[], offCh=[];
  R.chs.forEach((ch,k)=>{ const d=buf.getChannelData(2+k); let s=0; for(let i=0;i<n;i++) s+=d[i]*d[i]; const C=I.ch[k], r=dB(s/n); perCh[ch.n]={notes:C.n|0, rmsDb:r, lufs:r>-119?musLufs(d,null,SR):-120};
    if(C.tgt===0) offCh.push(ch.n); else if(!(C.n>0) || r<-60) silentCh.push(ch.n); });
  const mono=new Float32Array(n); for(let i=0;i<n;i++) mono[i]=0.5*(L[i]+Rr[i]);
  const si=o.solo?R.chs.findIndex(ch=>ch.n===o.solo):-1, od=si>=0?buf.getChannelData(2+si):mono;
  const res={id, secs, lv:I.lv, rmsDb:dB(ss/(2*n)), peakDb:pk>0?+(20*Math.log10(pk)).toFixed(2):-120, lufs:musLufs(L,Rr,SR), nan, clipN:clip, notes:G.nv, perCh, silentCh, offCh, bands:musBands(mono,SR), onsets:(si>=0 || o.onsets)?musOnsets(od,SR):null, t0, len:+musLen(id).toFixed(3)};
  const bl=[]; { let t=t0, fi=0; for(let g=0;g<400 && t<secs;g++){ const X=R.secs[R.form[fi]]; for(let b=0;b<X.b;b++) bl.push(t+b*X.bar); t+=X.dur; fi++; if(fi>=R.form.length) fi=R.loop; } }   // (the bar lines, for the seam)
  res.seam=musSeamAt(mono,SR,res.len+t0,o.from?null:1,bl); if(o.buf) res.buf=buf; return res; }   // ({buf:1} keeps the rendered AudioBuffer — a verifier's spectrogram)
function musBiq(type,f,q,gdb,SR){ const w=TAU*f/SR, c=Math.cos(w), s=Math.sin(w), al=s/(2*q), A=Math.pow(10,(gdb||0)/40); let b0,b1,b2,a0,a1,a2;   // RBJ: hp · lp · hs
  if(type==='hp'){ b0=(1+c)/2; b1=-(1+c); b2=(1+c)/2; a0=1+al; a1=-2*c; a2=1-al; } else if(type==='lp'){ b0=(1-c)/2; b1=1-c; b2=(1-c)/2; a0=1+al; a1=-2*c; a2=1-al; }
  else { const sq=2*Math.sqrt(A)*al; b0=A*((A+1)+(A-1)*c+sq); b1=-2*A*((A-1)+(A+1)*c); b2=A*((A+1)+(A-1)*c-sq); a0=(A+1)-(A-1)*c+sq; a1=2*((A-1)-(A+1)*c); a2=(A+1)-(A-1)*c-sq; }
  b0/=a0; b1/=a0; b2/=a0; a1/=a0; a2/=a0; let x1=0, x2=0, y1=0, y2=0; return x=>{ const y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2; x2=x1; x1=x; y2=y1; y1=y; return y; }; }
function musLufs(L,R,SR){ let s=0; for(const d of (R?[L,R]:[L,L])){ const h=musBiq('hs',1681.97,0.7072,4,SR), p=musBiq('hp',38.13,0.5,0,SR); for(let i=0;i<d.length;i++){ const y=p(h(d[i])); s+=y*y; } } return +(-0.691+10*Math.log10(s/L.length+1e-20)).toFixed(2); }   // (BS.1770's K-weighting, no gate)
function musBands(x,SR){ const E=[0,0,0,0], f=[[musBiq('lp',250,0.7071,0,SR),musBiq('lp',250,0.7071,0,SR)],[musBiq('hp',250,0.7071,0,SR),musBiq('lp',2000,0.7071,0,SR)],[musBiq('hp',2000,0.7071,0,SR),musBiq('lp',6000,0.7071,0,SR)],[musBiq('hp',6000,0.7071,0,SR),musBiq('hp',6000,0.7071,0,SR)]];
  for(let i=0;i<x.length;i++){ const v=x[i]; for(let k=0;k<4;k++){ const y=f[k][1](f[k][0](v)); E[k]+=y*y; } } const T=E.reduce((a,b)=>a+b,0)||1; return E.map(e=>+(10*Math.log10(e/T+1e-12)).toFixed(1)); }
/* the onsets (a solo render's): 11.6 ms Hann frames a millisecond apart (a 512-point FFT, to 5 kHz) · the spectral flux against the frame 10 ms before — a legato
   line's new note shows as new partials even when the loudness holds · peaks ≥ 70 ms apart over 15 % of the largest · each set back to where its strongest new
   partial began to rise (the partial grown most over what the note before left in its bin · the 20-80 % stretch of its rise, run back to the level before it) */
function musFFT(re,im){ const n=re.length; for(let i=1,j=0;i<n;i++){ let b=n>>1; for(;j&b;b>>=1) j^=b; j^=b; if(i<j){ let t=re[i]; re[i]=re[j]; re[j]=t; t=im[i]; im[i]=im[j]; im[j]=t; } }
  for(let len=2;len<=n;len<<=1){ const a=-TAU/len, wr=Math.cos(a), wi=Math.sin(a), h=len>>1; for(let i=0;i<n;i+=len){ let cr=1, ci=0; for(let k=0;k<h;k++){ const p=i+k, q=p+h, tr=re[q]*cr-im[q]*ci, ti=re[q]*ci+im[q]*cr; re[q]=re[p]-tr; im[q]=im[p]-ti; re[p]+=tr; im[p]+=ti; const c2=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=c2; } } } }
function musOnsets(x,SR){ const N=512, hop=Math.max(1,Math.round(SR*0.001)), nb=Math.min(N>>1,Math.ceil(5000*N/SR)), nf=Math.floor((x.length-N)/hop), D=10; if(nf<60) return [];
  const win=new Float64Array(N), re=new Float64Array(N), im=new Float64Array(N), M=new Float32Array(nf*nb); for(let i=0;i<N;i++) win[i]=0.5-0.5*Math.cos(TAU*i/(N-1));
  for(let f=0;f<nf;f++){ const o=f*hop; for(let i=0;i<N;i++){ re[i]=x[o+i]*win[i]; im[i]=0; } musFFT(re,im); for(let b=0;b<nb;b++) M[f*nb+b]=Math.hypot(re[b],im[b]); }
  const SF=new Float32Array(nf); let mx=0; for(let f=D;f<nf;f++){ let s=0; const q=(f-D)*nb; for(let b=1;b<nb;b++){ const d=M[f*nb+b]-Math.max(M[q+b-1],M[q+b],b+1<nb?M[q+b+1]:0); if(d>0) s+=d; } SF[f]=s; if(s>mx) mx=s; }   // (each bin against its neighbours a frame back too — a vibrato's wander is no onset)
  const pk=[]; for(let f=D+1;f<nf-1;f++){ if(SF[f]<0.15*mx) continue; let top=true; for(let g=Math.max(D,f-40);g<=Math.min(nf-1,f+40);g++) if(SF[g]>SF[f] || (SF[g]===SF[f] && g<f)){ top=false; break; } if(top && (!pk.length || f-pk[pk.length-1]>=70)) pk.push(f); }
  const out=[]; for(const fp of pk){ let bb=1, bd=0, bs=-1; const fa=Math.max(0,fp-25), fz=Math.min(nf-1,fp+D); for(let b=1;b<nb;b++) bd=Math.max(bd,M[fz*nb+b]-M[fa*nb+b]);
    for(let b=1;b<nb;b++){ const d=M[fz*nb+b]-M[fa*nb+b]; if(d<0.3*bd) continue; const sc=d/(M[fa*nb+b]+0.05*bd); if(sc>bs){ bs=sc; bb=b; } }   // (the new partial the old note least covered)
    const m=f=>M[clamp(f,0,nf-1)*nb+bb]; let fmn=fp, fmx=fp; for(let f=fp;f>=Math.max(0,fp-45);f--) if(m(f)<m(fmn)) fmn=f; for(let f=fp;f<=Math.min(nf-1,fp+45);f++) if(m(f)>m(fmx)) fmx=f;
    const lo=m(fmn), hi=m(fmx); if(!(hi>lo)) continue; let f2=fmn, f8=fmn; while(f2<fmx && m(f2)<lo+0.2*(hi-lo)) f2++; f8=f2; while(f8<fmx && m(f8)<lo+0.8*(hi-lo)) f8++;
    const sl=f8>f2?(m(f8)-m(f2))/(f8-f2):0, f0=sl>0?f2-(m(f2)-lo)/sl:f2; out.push(+((f0*hop+N/2)/SR).toFixed(4)); }
  return out; }
/* the loop's seam heard: the largest sample step within ±20 ms of the form's end, against the same at the render's other bar lines (their largest — a downbeat's
   own attack; k ≤ ≈ 1.2: the seam sounds like any other bar line, no click) and the 99.9th-percentile step of the whole render (kr) */
function musSeamAt(x,SR,tl,on,bars){ if(!on || tl>=x.length/SR-0.03) return null; const mx=t=>{ const a=Math.max(1,Math.round((t-0.02)*SR)), b=Math.min(x.length,Math.round((t+0.02)*SR)); let m=0; for(let i=a;i<b;i++) m=Math.max(m,Math.abs(x[i]-x[i-1])); return m; }, m=mx(tl);
  const st=[]; for(let i=1;i<x.length;i+=7) st.push(Math.abs(x[i]-x[i-1])); st.sort((p,q)=>p-q); const ref=st[Math.floor(st.length*0.999)]||1e-9;
  let bm=0; for(const t of bars||[]) if(Math.abs(t-tl)>0.05 && t>0.06 && t<x.length/SR-0.03) bm=Math.max(bm,mx(t));
  return {t:+tl.toFixed(3), step:+m.toFixed(5), bars:+bm.toFixed(5), k:bm?+(m/bm).toFixed(2):null, kr:+(m/ref).toFixed(2)}; }
/* (M6) a row: a loop renders 30 s at its top level (the composers' 30 s rule — G13V-C07: 20 s called a late first entrance silent) and, with {lv0:1}, at
   lv 0 too (rms0, silent0) · a sting (loop −1) renders its own length, so its rms is the sting's loudness, not a sting diluted in silence */
async function musRow(id,o){ o=o||{}; const R=musCompile(id), T=MUS_T[id]||MUS_TD[id], len=musLen(id), secs=R.once?len+0.05:(o.secs||30), r=await musRender(id,secs), nl=(T.lv||[[]]).length;
  const r0=(!R.once && o.lv0 && nl>1)?await musRender(id,secs,{lv:0}):null;
  return {id, n:T.n, len:+len.toFixed(1), once:!!R.once, secs:+secs.toFixed(2), rmsDb:r.rmsDb, rms0:r0?r0.rmsDb:null, peakDb:r.peakDb, lufs:r.lufs, nan:r.nan, clipN:r.clipN, notes:r.notes, silentCh:r.silentCh, silent0:r0?r0.silentCh:null, bands:r.bands, g:T.g==null?1:T.g, errs:R.errs.length, warns:R.warns.length}; }
async function musRenderAll(o){ const ids=Object.keys(MUS_T); if(!o){ const rows=[]; for(const id of ids) rows.push(await musRow(id)); return rows; }   // (resumable: {from, n, lv0, secs} → {rows, next})
  const from=o.from|0, n=o.n||4, rows=[]; for(let i=from;i<Math.min(ids.length,from+n);i++) rows.push(await musRow(ids[i],o)); return {rows, next:from+n<ids.length?from+n:null}; }
/* (DEV) musSelfTest() — the BTN compiler, the ornaments and the offline render checked on `_orn` (every token: ~ ^ > < * ! ? ' @v @t % = _ · a timp roll · the kit)
   plus seven broken lines that must each refuse to compile → {ok, fails, ...} */
async function musSelfTest(){ const F=[], ok=(c,s)=>{ if(!c) F.push(s); }; delete MUSC._orn; const R=musCompile('_orn'); ok(!R.errs.length,'compile: '+R.errs.join(' | '));
  if(!R.errs.length){ const A=R.secs.A, ev=c=>A.ev.filter(e=>R.chs[e.c].n===c), a=ev('a'), k=ev('k'), t=ev('t'), d=ev('d'), st=A.bar/8, near=(x,y)=>Math.abs(x-y)<1e-6;
    ok(a.length===16,'mel events '+a.length+' ≠ 16'); ok(a[0].f&4,'~ cut'); ok(a[1].f&8,'^ scoop'); ok((a[2].f&64) && near(a[2].d,st*0.5),'* staccato'); ok((a[3].f&1) && near(a[3].v,0.8*0.8*1.3),'! accent');
    ok((a[4].f&2) && near(a[4].v,0.8*0.8*0.55),'? ghost'); ok(near(a[5].d,2*st),'- hold'); ok(near(a[7].t,A.bar) && a[7].m[0]===a[0].m[0] && (a[7].f&4),'% repeat');
    ok(near(a[14].v,0.8*0.8*0.5) && a[14].m[0]===84,'@v0.5'); ok(a[15].m[0]===74 && a[15].w[0]===72,'@t+2'); ok(!a.some(e=>e.t>=3*A.bar-1e-6),'_ rest');
    ok((k[0].f&16) && (k[1].f&32),'> < strums'); ok(near(k[1].d,6*A.bar/4),'= hold through a bar'); ok(k.length===4 && k[3].m.length===4,'a 4-note chord');
    ok(!R.warns.some(w=>/out of key/.test(w)),"' marks a chromatic"); ok(t[0].f&128,'timp ~ roll'); ok(d.length===16,'kit hits '+d.length+' ≠ 16');
    const bad={b1:"| c5 c5 c5 |", b2:"| c5 c5 c5 c5 c5 c5 c5 c5 | c5 c5 c5 c5 c5 c5 c5 c5 |", b3:"| q5 c5 c5 c5 c5 c5 c5 c5 |", b4:"| c5+e5+g5+b5+d6 - - - - - - - |", b5:"| c1 - - - - - - - |"}, base=MUS_TD._orn;
    for(const kk in bad){ MUS_TD._bad={...base, sec:{A:{b:1, a:bad[kk]}}, form:['A']}; delete MUSC._bad; ok(musCompile('_bad').errs.length>0,'refuses '+kk); }
    MUS_TD._bad={...base, ch:{...base.ch, z:{i:'kazoo', v:1, s:8}}, sec:{A:{b:1, a:'| _ |'}}, form:['A']}; delete MUSC._bad; ok(musCompile('_bad').errs.length>0,'refuses an unknown patch');
    MUS_TD._bad={...base, sec:{A:{b:1, a:'| _ |'}}, form:['A','Q']}; delete MUSC._bad; ok(musCompile('_bad').errs.length>0,'refuses a missing section'); delete MUS_TD._bad; delete MUSC._bad;
    const r=await musRender('_orn',8,{}), s=await musRender('_orn',8,{solo:'a'}); ok(!r.err && r.nan===0 && r.peakDb<=0 && r.notes>40,'render: '+JSON.stringify(r.err||{nan:r.nan, peak:r.peakDb, notes:r.notes}));
    ok(s.perCh && s.perCh.a.notes===18,'the cuts add a voice each: '+(s.perCh&&s.perCh.a.notes)+' ≠ 18'); ok(r.perCh && r.perCh.t.notes>=40,'the roll re-strikes: '+(r.perCh&&r.perCh.t.notes));
    musSelfTest.last={r, s}; }
  return {ok:!F.length, fails:F}; }

