"use strict";
/* FILE: js/audio/audio.js
AUDIO CORE: the Web Audio graph, the per-device sound prefs, the sample bank, stereo pan, ducking, the Sound & music
Options block, thunder and the recorded ambience, moved verbatim from original lines 5454-5737 (build 5109cd5).
Entry points: initAudio, toggleMute (also the #mute button's onclick), sndApplyVol, sndPrefsSave, sndBoot, sndHave, sfxPick,
  sndPan, sndDuck, renderSoundBlock, sndBlockWire, sndBlockRefresh, thunder, ambTick (every frame, from frameInner), ambEmit,
  ambShot, ambOK, ambSynthOff, ambCaveInit, the reverb impulse musIR, musIRjob, musIRstep (shared with the Bard), noiseBuf;
  console only: sndFake, ambStat.
Globals it owns: the graph lets actx, masterG, windG, waveG, masterLim, sfxVolG, ambBus, ambDuckG, ambVolG, droneG (actx must
  stay a mutable let: the DEV sndRender swaps it), SND_LIMK, SND_CMPK, SND_MUS_ROW, SND_KEY, SNDP0, SNDP (let), SND_PACK, SNDX,
  SND_MISS, SFX_FILES (written by a build script, do not hand-edit), SND_DUCKG, SNDD, SND_DUCK, AMB_X, AMB_LOOK, AMB_K, AMB_UP,
  AMB_DN, AMB_TRIM, AMB_GREEN, AMB_EM, AMB_CVHP, AMBS, AMB_PRE, caveSendG, caveConv, and the snd, amb and musIR functions.
Globals it reads from elsewhere (inside functions, at runtime): audioOn (original line 4544 (build 5109cd5)), SFX_SETS
  (js/data/crawl2.js), clamp, TAU, the Bard and the Director (MUS, musBoot, musInit, musHalt, musVolG, musVolOf, musToggle,
  musPreview), the sfx engine (sfxInit, sfx, sfxLast, cmbBus, wldBus, sfxBus, uiBus), padFocusEl, padSetFocus, and game state
  (mode, started, ISL, INT, DK, player, boat, env, wind, the camera and scale names, titleBGOn, nightK, coresNear, portReach, TUNE).
Load-time statements (7, on 6 lines): #mute onclick=toggleMute (original line 5509 (build 5109cd5), only stores the function);
  SNDX and SND_MISS (original line 5513 (build 5109cd5)); sndPan.g=1 (original line 5557 (build 5109cd5)); the document
  visibilitychange listener (original line 5566 (build 5109cd5)), kept before the save-on-hide one (original line 42167 (build 5109cd5));
  let SNDP=sndPrefsLoad() from localStorage, then audioOn=!!SNDP.on (original line 5587 (build 5109cd5)); the AMB_UP and AMB_DN
  curve (original line 5605 (build 5109cd5)). Must load after the state block and before CONTROLS_HTML reads SND_MUS_ROW
  (original line 8043 (build 5109cd5)).
*/
/* ============================ audio (calm ambience) ============================ */
/* (PT1 A1 — SOUND 3.0, pt1_audio §3.1) the graph: sfx voices → cmbBus | wldBus | uiBus → sfxBus → the compressor → ×1.2 → sfxVolG ─┐
   waves · wind · thunder · the drone (droneG) → ambBus → ambDuckG → ambVolG ────────────────────────────────────────────────────────┴→ masterG → ×SND_LIMK → masterLim → out */
let actx=null, masterG=null, windG=null, waveG=null;
let masterLim=null, sfxVolG=null, ambBus=null, ambDuckG=null, ambVolG=null, droneG=null;
const SND_LIMK=0.821, SND_CMPK=0.375;   // (measured offline: the limiter's own makeup is +1.71 dB and the sfx compressor's (with its ×1.2) +8.53 dB on a quiet sound — these trims keep today's loudness)
const SND_MUS_ROW=1;                      // (the 🎵 Music row & the Shift+P line — live since PT1 M2a)
function noiseBuf(secs){
  const b=actx.createBuffer(1, actx.sampleRate*secs, actx.sampleRate);
  const d=b.getChannelData(0); let last=0;
  for(let i=0;i<d.length;i++){ const w=Math.random()*2-1; last=(last+0.02*w)/1.02; d[i]=last*3.2; }
  return b;
}
function initAudio(){
  if(actx) return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext; actx=new AC();
    if(actx.sampleRate>48000) try{ const c=new AC({sampleRate:48000}); try{ const p=actx.close(); if(p && p.catch) p.catch(()=>{}); }catch(e){} actx=c; }catch(e){}   // (GA fix — GAV-B10/C05: a 96 / 192 kHz device runs the game at 48 kHz — the pack decodes to half the memory · 44.1 / 48 kHz devices as ever)
    const lk=actx.createGain(); lk.gain.value=SND_LIMK; masterLim=actx.createDynamicsCompressor();   // the master limiter: nothing clips, a stormy fight included
    masterLim.threshold.value=-3; masterLim.knee.value=0; masterLim.ratio.value=20; masterLim.attack.value=0.001; masterLim.release.value=0.1;
    masterG=actx.createGain(); masterG.connect(lk); lk.connect(masterLim); masterLim.connect(actx.destination);
    sfxVolG=actx.createGain(); sfxVolG.connect(masterG); ambVolG=actx.createGain(); ambVolG.connect(masterG);
    ambDuckG=actx.createGain(); ambDuckG.connect(ambVolG); ambBus=actx.createGain(); ambBus.connect(ambDuckG); SND_DUCKG.amb=ambDuckG;
    droneG=actx.createGain(); droneG.gain.value=(SNDP.musOn && SNDP.mus>0)?0:1; droneG.connect(ambBus); sndApplyVol(true);   // (droneG: 1 = no music · 0 under the music — M2a's musUpdate keeps it so)
    // waves (low filtered noise)
    const ws=actx.createBufferSource(); ws.buffer=noiseBuf(3); ws.loop=true;
    const wf=actx.createBiquadFilter(); wf.type='lowpass'; wf.frequency.value=520; wf.Q.value=0.6;
    waveG=actx.createGain(); waveG.gain.value=0.16;
    ws.connect(wf); wf.connect(waveG); waveG.connect(ambBus); ws.start();
    // wind (band-passed noise, rises with speed/wind)
    const ns=actx.createBufferSource(); ns.buffer=noiseBuf(3); ns.loop=true;
    const nf=actx.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=1100; nf.Q.value=0.8;
    windG=actx.createGain(); windG.gain.value=0.05;
    ns.connect(nf); nf.connect(windG); windG.connect(ambBus); ns.start();
    // soft meditative drone (low, very quiet)
    const chord=[110,164.8,220];
    chord.forEach((f,i)=>{ const o=actx.createOscillator(); o.type='sine'; o.frequency.value=f;
      const g=actx.createGain(); g.gain.value=0.018-(i*0.004);
      const lfo=actx.createOscillator(); lfo.frequency.value=0.05+i*0.017;
      const lg=actx.createGain(); lg.gain.value=0.01; lfo.connect(lg); lg.connect(g.gain);
      o.connect(g); g.connect(droneG); o.start(); lfo.start(); });
  }catch(e){ actx=null; }
  if(actx){ sfxInit(); sndBoot(); musBoot(); }   // (PT1 M1: the Bard's bank, in idle slices)
}
/* (PT1 A1 §3.2) SOUND PREFS — per device, never in the voyage save: on · mst (master) · sfx · amb · mus · musOn · smp (recorded sounds) */
const SND_KEY='mj_boats_snd_v1', SNDP0={on:1, mst:1, sfx:0.8, amb:0.7, mus:0.6, musOn:1, smp:1};
function sndPrefsLoad(){ const P=Object.assign({},SNDP0); try{ const s=JSON.parse(localStorage.getItem(SND_KEY)||'null');
    if(s && typeof s==='object') for(const k in SNDP0){ const v=+s[k]; if(s[k]!=null && Number.isFinite(v)) P[k]=(k==='on'||k==='musOn'||k==='smp')?(v?1:0):clamp(Math.round(v*10)/10,0,1); } }catch(e){}   // (bad data → the defaults)
  return P; }
function sndPrefsSave(){ try{ localStorage.setItem(SND_KEY,JSON.stringify(SNDP)); }catch(e){} }
function sndApplyVol(now){ if(!actx||!masterG) return; const t=actx.currentTime, T=(n,v)=>{ if(!n) return; if(now) n.gain.value=v; else n.gain.setTargetAtTime(v,t,0.05); };
  T(masterG, audioOn?0.9*SNDP.mst*SNDP.mst:0); T(sfxVolG, Math.pow(SNDP.sfx/0.8,2)); T(ambVolG, Math.pow(SNDP.amb/0.7,2)); T(musVolG, musVolOf()); }   // (the defaults: 0.9 · 1 · 1 — today's loudness)
function toggleMute(){ audioOn=!audioOn; SNDP.on=audioOn?1:0; sndPrefsSave(); document.getElementById('mute').textContent=audioOn?'🔊':'🔇';
  if(audioOn && actx && actx.state==='suspended' && document.visibilityState!=='hidden') try{ actx.resume().catch(()=>{}); }catch(e){}   // (G5 fix: a refused resume — Safari without a gesture — never logs an unhandled rejection)
  sndApplyVol(); sndBlockRefresh(); if(!audioOn) musHalt(); else if(SNDP.musOn && actx) musInit(); MUS.evT=0; }   // (PT1 M2a: muted, the music stops & its tick with it · back on: the graph is made on this press, if it wasn't)
document.getElementById('mute').onclick=toggleMute;
/* (PT1 A1 §3.3) THE SAMPLE BANK — sfx/manifest.json + sfx/<set>/<key>.mp3. SND_PACK 0 = no request at all (A4 flips it with the files) · T0 at once, T1 when T0
   drains, the T2 one-shots when T1 drains, a T2 loop on first ask (or ahead of the next place — ambPreAsk) · 4 fetches at a time · decode → auto-trim · a failed key is never retried. sndFake(): DEV stand-ins. */
const SND_PACK=1;   // (PT1 A4: the CC0 pack is installed — boats/sfx)
const SNDX={st:SND_PACK?'idle':'none', man:null, buf:{}, bad:{}, req:{}, q:[], act:0, tier:-1, bag:{}, lastK:{}, hist:{}, prev:null, fake:null}, SND_MISS={};
function sndKeys(s){ const S=SFX_SETS[s]; if(!S) return []; if(S.k) return S.k; return S.k=S.x?[]:sndParse(S.f); }   // (A4: an x set has no files of its own)
function sndParse(f){ const L=[]; for(const p of f.split(' ')){ if(!p) continue; const m=/^(.*?)(\d+)-(\d+)$/.exec(p); if(m) for(let i=+m[2];i<=+m[3];i++) L.push(m[1]+i); else L.push(p); } return L; }   // 'hit/fl0-4' → hit/fl0 … hit/fl4
/* (PT1 A4) the installed pack's keys — written by the build script (scratchpad/sfx_work/build_sfx.py) beside manifest.json: sndMapCheck holds the sets to it */
const SFX_FILES='amb/birds amb/breeze amb/cave amb/fire amb/gale amb/harbour amb/rain amb/rig amb/sea amb/tavern amb/whistle amb/wind boom/b0-3 boom/f0-3 boom/th0-7 hit/ar0-4 hit/bl0-3 hit/bone0-4 hit/cl0-5 hit/fl0-4 hit/flh0-4 hit/helm0-4 hit/mt0-4 hit/mth0-4 hit/mtm0-4 hit/sh0-4 hit/so0-4 hit/soh0-4 hit/st0-3 hit/wd0-4 hit/wdh0-4 hit/wdl0-4 mag/ch0-2 mag/chh0-3 mag/fi0-3 mag/sf0-3 mag/sk0-3 mag/sp0-3 sw/bamboo0-2 sw/bl0-3 sw/bow0-3 sw/h0-5 sw/knife0-3 sw/l0-4 sw/rope0-5 sw/sheet0-3 sw/slice0-3 sw/stick0-2 sw/sw0-3 sw/tube0-5 ui/bc0 ui/bo0 ui/bp0-2 ui/ca0-3 ui/ch0-2 ui/ck0-4 ui/cl0-5 ui/co0-4 ui/cs0-2 ui/dr0-3 ui/gl0-4 ui/le0-3 ui/pg0-2 ui/pl0-1 ui/sc0-3 ui/se0-3 ui/ti0-1 vox/be0-3 vox/bu0-3 vox/cu0-4 vox/gr0-4 vox/ro0-3 vox/sl0-3 vox/sp0-3 vox/we0-3 vox/wo0-3 wat/bu0-3 wat/sb0-1 wat/ss0-3 wld/an0-3 wld/be0-2 wld/bw0 wld/cr0-2 wld/dc0-3 wld/dh0 wld/di0-2 wld/do0-1 wld/ds0 wld/gh0-2 wld/gl0-4 wld/gm0-2 wld/gu0-5 wld/la0-1 wld/mine0-4 wld/oa0-1 wld/pl0-4 wld/po0-2 wld/rb0-3 wld/rf0-2 wld/sa0-1 wld/sb0 wld/st0-6 wld/tn0-1 wld/tw0-3';
function sndFiles(){ return sndFiles.k||(sndFiles.k=sndParse(SFX_FILES)); }
function sndBoot(){ if(SNDX.st!=='idle') return; if(!SND_PACK){ SNDX.st='none'; return; } SNDX.st='load';
  fetch('sfx/manifest.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(j=>{ if(!j||!j.files||typeof j.files!=='object'){ SNDX.st='none'; return; } SNDX.st='ok'; SNDX.man=j.files; sndTier(0); })
    .catch(()=>{ SNDX.st='none'; }); }   // (no manifest → exactly the synth game, and no further request)
function sndTier(t){ SNDX.tier=t; for(const s in SFX_SETS) if((SFX_SETS[s].t|0)===t) sndQueue(s); sndPump(); }
function sndQueue(s){ if(SNDX.st!=='ok') return; for(const k of sndKeys(s)) if(SNDX.man[k] && !SNDX.req[k] && !SNDX.bad[k]){ SNDX.req[k]=1; SNDX.q.push(k); } }
function sndPump(){ while(SNDX.act<4 && SNDX.q.length){ SNDX.act++; sndFetch(SNDX.q.shift()); } if(!SNDX.act && !SNDX.q.length && SNDX.tier===0) sndTier(1);
  else if(!SNDX.act && !SNDX.q.length && SNDX.tier===1){ SNDX.tier=2; for(const s in SFX_SETS){ const S=SFX_SETS[s]; if(S.t===2 && !S.loop) sndQueue(s); } sndPump(); } }   // (GA fix — GAV-B08/C02: T1 drained → the T2 one-shots (doors, the forge, shops, the dice, gulls, thunder, cards · ≈ 0.4 MB) load too: none plays its synth first · the loops stay lazy)
function sndFetch(k){ fetch('sfx/'+k+'.mp3').then(r=>{ if(!r.ok) throw 0; return r.arrayBuffer(); }).then(ab=>new Promise((ok,no)=>{ const p=actx.decodeAudioData(ab,ok,no); if(p && p.catch) p.catch(()=>{}); }))   // (A4: a file that won't decode → bad, quietly — Chrome's promise form would also reject unhandled)
  .then(b=>sndTrim(k,b)).catch(()=>{ SNDX.bad[k]=1; }).then(()=>{ SNDX.act--; sndPump(); }); }
function sndTrim(k,b){ const d=b.getChannelData(0), sr=b.sampleRate; let i=0; while(i<d.length && Math.abs(d[i])<=0.004) i++;   // the lead to ≈ −48 dBFS, less 2 ms
  let end=b.duration; if(SNDX.man && SNDX.man[k] && SNDX.man[k].loop){ let j=d.length-1; while(j>0 && Math.abs(d[j])<=0.002) j--; end=Math.min(b.duration,j/sr+0.005); }
  SNDX.buf[k]={b, off:i>=d.length?0:Math.max(0,i/sr-0.002), end, last:performance.now()}; }
function sndLoaded(s){ for(const k of sndKeys(s)) if(SNDX.buf[k]) return true; return false; }
function sndHave(s){ if(SNDX.st!=='ok' && SNDX.st!=='fake') return false; const S=SFX_SETS[s]; if(!S) return false; if(sndLoaded(s)) return true;
  if(S.t===2 && SNDX.st==='ok'){ sndQueue(s); sndPump(); } else if(S.loop && SNDX.st==='fake'){ sndFakeSet(s); return sndLoaded(s); }   // (PT1 A3: a DEV stand-in loop is "fetched" on its first ask — and again after the 180 s drop)
  return !!(S.alt && sndLoaded(S.alt)); }
function sfxPick(s){ let S=SFX_SETS[s], r=1; if(!S) return null; if(!sndLoaded(s)){ if(!S.alt || !sndLoaded(S.alt)) return null; r=S.ar||1; s=S.alt; }   // (a set with nothing decoded plays its alt)
  for(let tr=0;tr<2;tr++){ let bag=SNDX.bag[s];
    if(!bag || !bag.length){ bag=SNDX.bag[s]=sndKeys(s).filter(k=>SNDX.buf[k]); for(let i=bag.length-1;i>0;i--){ const j=(Math.random()*(i+1))|0, x=bag[i]; bag[i]=bag[j]; bag[j]=x; }   // the shuffle bag: every variant heard,
      if(bag.length>1 && bag[bag.length-1]===SNDX.lastK[s]){ const x=bag[0]; bag[0]=bag[bag.length-1]; bag[bag.length-1]=x; } }                                            // never the same one twice running
    const k=bag.pop(), B=SNDX.buf[k]; if(!B){ SNDX.bag[s]=null; continue; }
    SNDX.lastK[s]=k; const H=SNDX.hist[s]||(SNDX.hist[s]=[]); H.push(sndKeys(s).indexOf(k)); if(H.length>32) H.shift(); B.last=performance.now(); return {B, r, k}; }
  return null; }
function sndFake(on){ if(on===false){ if(SNDX.st==='fake'){ for(const k in SNDX.fake) delete SNDX.buf[k]; SNDX.fake=null; SNDX.st=SNDX.prev||'none'; SNDX.bag={}; } return SNDX.st; }   // (DEV) stand-ins for every key
  if(!actx) initAudio(); if(!actx) return 'no audio'; if(SNDX.st==='fake') return 'fake'; SNDX.prev=SNDX.st; SNDX.fake={};
  for(const s in SFX_SETS) if(!SFX_SETS[s].loop) sndFakeSet(s);   // (PT1 A3: the loops wait for their first ask — sndHave — as a T2 load would)
  SNDX.st='fake'; SNDX.bag={}; return 'fake'; }
function sndFakeSet(s){ const S=SFX_SETS[s], L=sndKeys(s), sr=actx.sampleRate; let h=7; for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))|0; h=Math.abs(h);
  const len=S.loop?4:/^(boom|thunder|rockfall)/.test(s)?0.9:/^(sw_|bow_rel|knife|slice|chop)/.test(s)?0.25:0.15, lp=0.04+0.9*((h%97)/97);   // a set's own length & colour
  L.forEach((k,i)=>{ if(SNDX.buf[k]) return; const n=Math.round(sr*len), b=actx.createBuffer(1,n,sr), d=b.getChannelData(0), f=(180+(h%500))*(1+0.12*i); let y=0, pk=0;   // …& a pitch per variant
    for(let j=0;j<n;j++){ const e=S.loop?1:Math.exp(-5*j/n)*Math.min(1,j/(sr*0.002)); y+=lp*((Math.random()*2-1)-y); d[j]=(0.6*y+0.4*Math.sin(TAU*f*j/sr))*e; const a=Math.abs(d[j]); if(a>pk) pk=a; }
    const m=0.7/(pk||1); for(let j=0;j<n;j++) d[j]*=m; SNDX.buf[k]={b, off:0, end:len, last:performance.now()}; if(SNDX.fake) SNDX.fake[k]=1; }); }
/* (PT1 A1 §3.4) STEREO in every mode: the crawl, ports & rooms by the screen x (off-screen −6 dB) · at sea by the camera, fading over 900 u · UI centred. sndPan.g = the gain */
function sndPan(o){ sndPan.g=1; if(!o || o.x==null) return 0;
  if((mode==='island' && ISL) || mode==='port' || mode==='interior' || (mode==='deck' && DK && deckLocal(o))){ const s=islScale(), hw=(IW/2)/s; if(!islOnScr(o.x,o.y==null?icamY:o.y,4)) sndPan.g=0.5; return clamp((o.x-icamX)/Math.max(1,hw),-1,1)*0.6; }   // (PT1 B1: the deck pans like a room — its own level coords)
  if(mode==='deck'){ const hw=(IW/2)/iscale(), y=o.y==null?boat.y:o.y; sndPan.g=clamp(1-Math.hypot(o.x-boat.x,y-boat.y)/900,0.15,1); return clamp((o.x-boat.x)/Math.max(1,hw),-1,1)*0.6; }   // (…and a sound out at sea — a whale's blow — from where it lies off her)
  if(mode==='sea'){ const hw=(IW/2)/iscale(), y=o.y==null?camY:o.y; sndPan.g=clamp(1-Math.hypot(o.x-boat.x,y-boat.y)/900,0.15,1); return clamp((o.x-camX)/Math.max(1,hw),-1,1)*0.6; }
  return 0; }
sndPan.g=1;
/* (PT1 A1 §3.4) DUCKING: sndDuck(bus 'amb'|'mus', dB, secs) — down in τ 0.03, held, back in τ 0.25; overlaps keep the deepest & the latest end. M1 registers SND_DUCKG.mus */
const SND_DUCKG={amb:null, mus:null}, SNDD={}, SND_DUCK={barrel_boom:[['amb',-9,0.4],['mus',-4,0.5]], pillar_fall:[['amb',-9,0.4],['mus',-4,0.5]], slam:[['amb',-9,0.4],['mus',-4,0.5]],
  lvl:[['mus',-6,1.2]], secure:[['mus',-4,0.6]], secure2:[['mus',-4,0.6]], secure3:[['mus',-4,0.6]], secure4:[['mus',-4,0.6]], loot_pearl:[['mus',-5,1.0]], loot_abyss:[['mus',-5,1.0]], boss_roar:[['mus',-4,1.0]]};   // (PT1 A2 — §3.10: the KEEP stings duck the music; inert until M1 registers SND_DUCKG.mus)
function sndDuck(bus,db,secs){ const G=SND_DUCKG[bus]; if(!G || !actx) return; const t=actx.currentTime, S=SNDD[bus]||(SNDD[bus]={lv:1,end:0}), lv=Math.pow(10,db/20);
  if(t<S.end){ S.lv=Math.min(S.lv,lv); S.end=Math.max(S.end,t+secs); } else { S.lv=lv; S.end=t+secs; }
  const p=G.gain; try{ if(p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); p.setValueAtTime(p.value,t); } p.setTargetAtTime(S.lv,t,0.03); p.setTargetAtTime(1,S.end,0.25); }catch(e){} }
/* (PT1 A1 §3.4) a hidden tab sleeps its sound (the game is frozen anyway); back in view it wakes — unless muted */
function sndVis(vis){ if(!actx) return Promise.resolve(); try{ return vis ? (SNDP.on ? actx.resume().catch(()=>{}) : Promise.resolve()) : actx.suspend().catch(()=>{}); }catch(e){ return Promise.resolve(); } }   // (G5 fix: a refused resume/suspend is swallowed — no unhandled rejection)
document.addEventListener('visibilitychange', ()=>{ sndVis(document.visibilityState!=='hidden'); });
/* (PT1 A1 §3.7) THE 🔊 SOUND & MUSIC BLOCK — the top of the 🎮 Options tab: All sound (+ master) · 🎵 Music (hidden till M2a) · ⚔ Effects · 🌊 Ambience · 🎧 Recorded sounds (with samples) */
function sndBar(k){ const n=Math.round(SNDP[k]*10), d0=SNDP0[k]<1?Math.round(SNDP0[k]*10)-1:-1;   // (G5 fix) a white mark after the default cell: the standard mix (Effects 80 % · Ambience 70 % play today's mix exactly — more is louder)
  let h='<span class="sndbar" data-snd="'+k+'" title="click to set'+(d0>=0?' · the white mark is the standard mix ('+Math.round(SNDP0[k]*100)+'%)':'')+'">';
  for(let i=0;i<10;i++){ const c=(i<n?'f':'')+(i===d0?' d':''); h+='<i'+(c?' class="'+c.trim()+'"':'')+'></i>'; } return h+'</span>'; }
function sndRow(k,lab,tg,cls){ return '<div class="ctlrow sndrow'+(cls?' '+cls:'')+'"><span class="cln">'+lab+'</span>'+(tg||'<span class="sntg"></span>')+
  (k?'<button class="sbtn ghost snpm" data-sndd="'+k+'" data-d="-1">−</button>'+sndBar(k)+'<button class="sbtn ghost snpm" data-sndd="'+k+'" data-d="1">+</button><b class="snv">'+Math.round(SNDP[k]*100)+'%</b>':'<span class="snsp"></span>')+'</div>'; }
function renderSoundBlock(){ const P=SNDP, T=(k,on,a,b)=>'<button class="sbtn'+(on?'':' ghost')+' sntg" data-sndt="'+k+'">'+(on?a:b)+'</button>';
  return '<div id="sndBlock"'+(P.on?'':' class="off"')+'><h3>🔊 Sound &amp; music</h3>'+
    sndRow('mst','All sound',T('on',P.on,'🔊 On','🔇 Off'),'snall')+sndRow('mus','🎵 Music',T('musOn',P.musOn,'On','Off'),SND_MUS_ROW?'':'hidden')+
    sndRow('sfx','⚔ Effects')+sndRow('amb','🌊 Ambience')+(SNDX.st==='ok'?sndRow('','<span title="the CC0 recordings · Off = the designed synth (A/B)">🎧 Recorded sounds</span>',T('smp',P.smp,'On','Off').replace('<button','<button title="the CC0 recordings · Off = the designed synth (A/B)"')):'')+
    '<p class="hint">P mutes everything'+(SND_MUS_ROW?' · Shift+P turns the music on/off':'')+' · the settings stay on this device</p></div>'; }
function sndBlockWire(){ const B=document.getElementById('sndBlock'); if(!B) return;
  B.querySelectorAll('[data-sndd]').forEach(b=>{ b.onclick=()=>sndSet(b.dataset.sndd, SNDP[b.dataset.sndd]+0.1*(+b.dataset.d)); });
  B.querySelectorAll('.sndbar').forEach(s=>{ s.onclick=e=>{ const r=s.getBoundingClientRect(); sndSet(s.dataset.snd, Math.round(((e.clientX-r.left)/Math.max(1,r.width))*10)/10); }; });
  B.querySelectorAll('[data-sndt]').forEach(b=>{ b.onclick=()=>{ const k=b.dataset.sndt; if(k==='on') toggleMute(); else if(k==='musOn') musToggle(1); else { SNDP[k]=SNDP[k]?0:1; sndPrefsSave(); sndApplyVol(); sndBlockRefresh(); } }; }); }
function sndSet(k,v){ if(!(k in SNDP0)) return; SNDP[k]=clamp(Math.round(v*10)/10,0,1); sndPrefsSave(); sndApplyVol(); sndBlockRefresh();
  if(k==='sfx'||k==='mst'){ sfxLast.ui_tick=-9; sfx('ui_tick'); } else if(k==='mus') musPreview(); }   // (a preview at the new level — the music's: three harp notes through the Bard)
function sndBlockRefresh(){ const B=document.getElementById('sndBlock'); if(!B) return; const f=padFocusEl && B.contains(padFocusEl) ? padFocusEl : null;
  const fk=f ? (f.dataset.sndd ? '[data-sndd="'+f.dataset.sndd+'"][data-d="'+f.dataset.d+'"]' : f.dataset.sndt ? '[data-sndt="'+f.dataset.sndt+'"]' : null) : null;
  B.outerHTML=renderSoundBlock(); sndBlockWire(); if(fk){ const n=document.querySelector('#sndBlock '+fk); if(n) padSetFocus(n); } }   // (only the block redraws — the pad keeps its place)
let SNDP=sndPrefsLoad(); audioOn=!!SNDP.on;
function thunder(){ if(!actx||!audioOn) return; const t0=actx.currentTime;
  if(t0-(thunder.t||-9)>=2.5 && ambShot('thunder',0.65*(0.6+0.4*Math.random()),(Math.random()*2-1)*0.3,0.85+Math.random()*0.23)){ thunder.t=t0; return; }   // (PT1 A3: the recorded clap once its file is in — else today's rumble · GA fix — GAV-B02: one recorded clap per 2.5 s at most, from 8 takes (4 far), rate 0.85-1.08, ×0.6-1 for distance)
  const q=ambOK() && sndLoaded('thunder') ? 0.5 : 1;                                                // (…between the claps, the synth's rumble 6 dB down)
  try{ const b=actx.createBufferSource(); b.buffer=(thunder.B||(thunder.B=[noiseBuf(1.6),noiseBuf(1.6),noiseBuf(1.6)]))[(Math.random()*3)|0];   // (three rumbles made once — 70k random samples per clap was a 2-6 ms hitch every lightning flash)
    const f=actx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=190;
    const g=actx.createGain(); const t=actx.currentTime;
    g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.55*q,t+0.06);
    g.gain.exponentialRampToValueAtTime(0.0008,t+1.7);
    b.connect(f); f.connect(g); g.connect(ambBus||masterG); b.start(t); b.stop(t+1.8);   // (PT1 A1: weather is ambience)
  }catch(e){}
}
/* (PT1 A3 — pt1_audio §3.8) THE AMBIENCE under every mode, the title too (ambTick, the top of frameInner). BEDS: a recorded loop per key (SFX_SETS amb_*), two
   sides (pseudo-stereo: panned ∓0.45, 7.3 s apart in the buffer), each side a chain of copies from random offsets, the next fading in (equal power, 2 s) as one
   nears its buffer's end — never the same place twice · ambSet(key, gain, τ) · a bed at 0 for 10 s lets its sources go (the buffer stays till the 180 s drop,
   ≤ 4 loops resident unless more are playing). ONE-SHOTS: gulls off a coast & in port (recorded only) · a cave's drips (the synth drip without files).
   EMITTERS — ambEmit(key, x, y, R), called by the hazard code: the nearest lava (amb_fire; without its file a soft hiss now & then) · the nearest bog pool
   (bubbles). THE CAVE'S REVERB: cmbBus + wldBus → caveSendG (0.22 below ground) → a convolver (musIR) → sfxBus. No files: the synth waves & wind as ever. */
const AMB_X=2, AMB_LOOK=1, AMB_K=0.6, AMB_UP=new Float32Array(33).map((v,i)=>Math.sin(i/32*Math.PI/2)), AMB_DN=AMB_UP.slice().reverse();   // crossfade s · a side's next copy is laid this far ahead · the beds' trim (A4 calibrates) · the equal-power curves
const AMB_TRIM={amb_rig:0.7};   // (PT1 A4: AMB_K 0.6 puts the recorded sea within ±1.3 dB of today's synth waves & wind at rest · full sail · a storm (K-weighted, offline); the canvas a touch under the waves)
const AMB_GREEN={meadow:1, tropic:1, bamboo:1, jungle:1, mushroom:1}, AMB_EM={amb_fire:1}, AMB_CVHP=280;   // (the shores with birdsong by day · a bed an emitter steers: panned to its source · the cave send's highpass, Hz: the hits' sub-thump never booms round the cave — measured offline, A3 notes)
const AMBS={beds:{}, want:{}, em:{}, f:0, clk:0, et:0, emt:0, send:-1, lg:0, loops:null, irJ:null, os:{drip:2.5, gull:4, fire:2, bub:2}, n:{drip:0, gull:0, bub:0, hiss:0}, tk:{n:0, s:0, mx:0}};
let caveSendG=null, caveConv=null;
/* a REVERB's impulse, made for one context at its own rate (a convolver wants its rate): stereo seeded noise · e^(−t/decay) · a one-pole lowpass falling from
   `bright` to 1.2 kHz over the tail (two poles: a stone room's tail is dark, not hiss) · a 12 ms pre-delay & 6 early reflections (11-47 ms, 0.5 → 0.2) · unit energy a side · the last 15 % faded. The cave
   (2.6 s, 0.7, 5000) · M1's music (2.2, 0.45, 7000). musIRjob → musIRstep(J, n samples) → true when J.B is done (the cave's is made a slice an evaluation — no hitch) */
function musIRjob(c,secs,decay,bright){ const sr=c.sampleRate, n=Math.max(2,Math.round(sr*secs)), pre=Math.round(sr*0.012);
  return {B:c.createBuffer(2,n,sr), sr, n, pre, fo:Math.max(1,Math.round(n*0.15)), kf:Math.pow(1200/bright,1/Math.max(1,n-pre)), ke:Math.exp(-1/(sr*decay)), w:pre+Math.round(sr*0.05), sd:Math.round(secs*1000)*31+Math.round(bright), bright, ch:0, i:pre, ph:0, x:0, y:0, z:0, f:0, a:0, e:1, ss:0, s0:0, m:1, done:false}; }
function musIRstep(J,cnt){ if(J.done) return true; const d=J.B.getChannelData(J.ch), n=J.n, sr=J.sr;
  if(J.ph===0){ if(J.i===J.pre){ J.x=(0x9E3779B1^(J.ch*7919+J.sd))|0||1; J.y=J.z=J.ss=J.s0=J.a=0; J.f=J.bright; J.e=1; }   // (seeded xorshift, inline: 2 × 2.6 s at 96 kHz in a few ms)
    let x=J.x, y=J.y, z=J.z, f=J.f, a=J.a, e=J.e, ss=J.ss, s0=J.s0; const pre=J.pre, fo=J.fo, kf=J.kf, ke=J.ke, w=J.w, i1=Math.min(n,J.i+cnt);
    for(let i=J.i;i<i1;i++){ if(((i-pre)&63)===0) a=1-Math.exp(-TAU*f/sr); f*=kf; x^=x<<13; x^=x>>>17; x^=x<<5; y+=a*(x*4.656612875e-10-y); z+=a*(y-z); const v=z*e*(i>n-fo?(n-i)/fo:1); d[i]=v; ss+=v*v; if(i<w) s0+=v*v; e*=ke; }
    J.x=x; J.y=y; J.z=z; J.f=f; J.a=a; J.e=e; J.ss=ss; J.s0=s0; J.i=i1; if(i1<n) return false;
    const r0=Math.sqrt(3*s0/Math.max(1,w-pre));                                  // (the taps sit on the tail's own scale — as on unit noise, at any rate)
    for(let k=0;k<6;k++){ const j=Math.round(sr*(0.011+k*0.0072+(J.ch?0.0013*((k*5)%3):0))); if(j<n){ const o=d[j]; d[j]+=(0.5-0.06*k)*r0*((k+J.ch)&1?-1:1); ss+=d[j]*d[j]-o*o; } }   // (the walls' first answers — each side its own)
    J.m=1/Math.sqrt(ss||1); J.ph=1; J.i=0; return false; }
  const i1=Math.min(n,J.i+cnt*2), m=J.m; for(let i=J.i;i<i1;i++) d[i]*=m; J.i=i1; if(i1<n) return false;   // unit energy a side
  J.ch++; J.ph=0; J.i=J.pre; if(J.ch>1) J.done=true; return J.done; }
function musIR(c,secs,decay,bright){ const J=musIRjob(c,secs,decay,bright); while(!musIRstep(J,1<<30)); return J.B; }
function ambCaveNodes(c){ const g=c.createGain(), hp=c.createBiquadFilter(), cv=c.createConvolver(); g.gain.value=0; hp.type='highpass'; hp.frequency.value=AMB_CVHP; hp.Q.value=0; cv.normalize=false; g.connect(hp); hp.connect(cv); return {g, cv}; }   // the send: its gain → a highpass → the convolver
function ambCaveInit(){ const N=ambCaveNodes(actx); cmbBus.connect(N.g); wldBus.connect(N.g); N.cv.connect(sfxBus); caveSendG=N.g; caveConv=N.cv; }   // (its impulse is made in slices once a voyage is under way — ambEval)
function ambLoops(){ return AMBS.loops||(AMBS.loops=Object.keys(SFX_SETS).filter(s=>SFX_SETS[s].loop)); }
function ambBed(k){ let B=AMBS.beds[k]; if(B) return B; if(!actx || !ambBus || !actx.createStereoPanner) return null;
  const g=actx.createGain(); g.gain.value=0; B={k, g, lp:null, pn:null, sd:[{pn:null, c:null},{pn:null, c:null}], tgt:0, z:0, on:0};
  for(let s=0;s<2;s++){ const p=actx.createStereoPanner(); p.pan.value=s?0.45:-0.45; p.connect(g); B.sd[s].pn=p; }   // the two sides
  if(AMB_EM[k]){ B.pn=actx.createStereoPanner(); g.connect(B.pn); B.pn.connect(ambBus); } else g.connect(ambBus);
  return AMBS.beds[k]=B; }
function ambLP(B,f){ if(!B.lp){ if(!f) return; const lp=actx.createBiquadFilter(); lp.type='lowpass'; lp.Q.value=0; lp.frequency.value=f; B.g.disconnect(); B.g.connect(lp); lp.connect(B.pn||ambBus); B.lp=lp; return; }   // (muffled through a wall — made on the first ask)
  const v=f||20000; if(B.lpv!==v){ B.lpv=v; B.lp.frequency.setTargetAtTime(v,actx.currentTime,0.25); } }
/* one copy of a bed's loop on side s from t: a random offset (or `of`), out of step with the other side · it fades in (fin) or starts full · it fades out over
   its buffer's last X s, where the next copy fades in */
function ambCopy(B,s,t,fin,of){ const Q=SNDX.buf[sndKeys(B.k)[0]]; if(!Q) return null;
  const o0=Q.off||0, o1=Math.min(Q.b.duration,Q.end||Q.b.duration), len=Math.max(0.05,o1-o0), X=Math.min(AMB_X,len*0.25), sp=Math.max(0,len-X-Math.min(4,len*0.5)), O=B.sd[1-s].c;
  let off=of!=null ? o0+(sp>0?(((of-o0)%sp)+sp)%sp:0) : o0+Math.random()*sp;
  if(of==null && O && sp>0 && Math.abs(O.o+Math.max(0,t-O.t0)-off)<Math.min(1.5,len*0.2)) off=o0+((off-o0+Math.min(7.3,len*0.37))%sp);   // (never in step with the other side)
  const src=actx.createBufferSource(), g=actx.createGain(), life=Math.max(X+0.02,o1-off-X); src.buffer=Q.b; src.connect(g); g.connect(B.sd[s].pn);
  try{ if(fin){ g.gain.value=0; g.gain.setValueCurveAtTime(AMB_UP,t,X); } g.gain.setValueCurveAtTime(AMB_DN,t+life,X); }catch(e){}
  src.start(t,off); src.stop(t+life+X+0.03); src.onended=()=>{ try{ g.disconnect(); }catch(e){} }; if(B.tgt>0) Q.last=performance.now();   // (G11 fix: a silent tail never counts as wanted — the 180 s runs from the last want)
  return {src, g, t0:t, o:off, end:t+life, X, len}; }
function ambStart(B,t){ const c0=ambCopy(B,0,t+0.02,false); if(!c0) return; B.sd[0].c=c0; B.sd[1].c=ambCopy(B,1,t+0.02,false,c0.o+Math.min(7.3,c0.len*0.37)); B.on=1; }   // (side 2: 7.3 s on in the buffer)
function ambStop(B,t){ try{ B.g.gain.cancelScheduledValues(t); B.g.gain.setTargetAtTime(0,t,0.03); }catch(e){} for(const S of B.sd){ if(S.c) try{ S.c.src.stop(t+0.2); }catch(e){} S.c=null; } B.on=0; B.tgt=0; B.z=t; }
function ambSet(k,v,tau){ const B=AMBS.beds[k]; if(!B || !actx) return; v=Math.max(0,+v||0); if(v<0.004) v=0; if(Math.abs(v-B.tgt)<0.004 && !(v===0 && B.tgt>0)) return; const t=actx.currentTime;   // (G11 fix: a glide to 0 always lands on 0 — stamps z, so the 10 s stop comes)
  if(v<=0) B.z=t; B.tgt=v; try{ B.g.gain.setTargetAtTime(v*AMB_K*(AMB_TRIM[k]||1),t,tau==null?0.5:tau); }catch(e){} }
function ambOK(){ return audioOn && SNDP.smp && (SNDX.st==='ok' || SNDX.st==='fake'); }
function ambSynthOff(){ if(!ambOK()) return false; if(SNDX.st==='fake') return true; for(const k in AMBS.want){ if(AMB_EM[k]) continue; return !!SNDX.buf[sndKeys(k)[0]]; } return false; }   // the recorded ambience owns the air once the mode's own bed (its recipe's first) is in: the synth waves & wind step back · (GA fix — GAV-C03/B01: still loading, or failed → the synth plays on, never a silent port · the title too)
/* a recorded one-shot straight onto the ambience bus (a gull, the thunder) — false when its set isn't in (the caller plays its synth, or nothing) */
function ambShot(s,g,pan,r){ if(!ambBus || !ambOK() || !sndHave(s)) return false; const P=sfxPick(s); if(!P) return false; const t=actx.currentTime, src=actx.createBufferSource(), G=actx.createGain(); let o=G;
  src.buffer=P.B.b; src.playbackRate.value=clamp((r||0.94+Math.random()*0.12)*P.r,0.5,2); G.gain.value=g*AMB_K; src.connect(G);   // (r: the caller's own rate — the thunder's)
  if(pan && actx.createStereoPanner){ const p=actx.createStereoPanner(); p.pan.value=pan; G.connect(p); o=p; } o.connect(ambBus); src.start(t,P.B.off); src.onended=()=>{ try{ o.disconnect(); }catch(e){} }; return true; }
/* the hazard code reports its nearest source each frame — the nearest of the frame wins (one per key) · not heard from for 0.5 s, it fades */
function ambEmit(k,x,y,R){ if(!actx) return; const d=Math.hypot(x-player.x,y-player.y); let E=AMBS.em[k]; if(E && E.f===AMBS.f && E.d<=d) return;
  if(!E) E=AMBS.em[k]={}; E.x=x; E.y=y; E.R=R; E.d=d; E.f=AMBS.f; E.c=itime; E.I=ISL; }   // (G11 fix: aged on the isle's own clock — a menu or the satchel pauses it, and the lava keeps roaring)
/* what each mode wants to hear: {bed: gain | [gain, lowpass Hz]} (B2 adds the deck's rows here) */
function ambWant(W){ if(titleBGOn()){ W.amb_sea=0.55; return; } if(!started) return;   // (GA fix — GAV-B01: the title's sea alone now, at the sea-at-rest level — ≈ the synth's −30 LUFS it replaces)
  if(mode==='sea' || (mode==='deck' && !(DK && DK.lv!=='top'))){ const sp=clamp(boat.spd/TUNE.baseSpeed,0,1.2), st=env.storm, dz=env.drizzle; let rain=0;   // (PT1 B1: her deck hears the sea she sails, as at the helm)
    W.amb_sea=0.55; W.amb_rig=0.10+0.35*sp; W.amb_wind=0.15+0.45*sp*wind.str;
    if(st>0.2){ W.amb_gale=0.9*st; rain=0.8*st; W.amb_whistle=0.6*Math.max(0,st-0.5)*2; } if(dz>0.2) rain=Math.max(rain,0.35*dz); W.amb_rain=rain; }
  else if(mode==='deck'){ const r=Math.max(env.storm>0.2?0.8*env.storm:0, env.drizzle>0.2?0.35*env.drizzle:0); W.amb_sea=[0.2,700]; if(r>0.02) W.amb_rain=[0.5*r,900]; }   // (PT1 B2: your cabin & below — the sea through her planking, the rain on the deck over your head)
  else if(mode==='port') W.amb_harbour=env.dayName==='Night'?0.3:0.6;
  else if(mode==='interior' && INT){ if(INT.kind==='tavern') W.amb_tavern=0.55; else W.amb_harbour=[0.12,700]; }   // (the museum & your home: the harbour through the walls)
  else if(mode==='island' && ISL){ if(ISL.cave) W.amb_cave=0.5;
    else { W.amb_breeze=0.4; W.amb_sea=0.25*ambSurf(); const r=Math.max(env.storm,env.drizzle); if(nightK()<0.5 && AMB_GREEN[ISL.biome.key] && r<0.3) W.amb_birds=0.35*(1-r/0.3); if(r>0.05) W.amb_rain=0.5*r; } }   // (G11 fix: the birds hush as the rain comes on — none past 0.3 · GA fix — GAV-B06: the surf, louder by the shore)
  else if(mode==='hex') W.amb_tavern=0.35; }
/* (GA fix — GAV-B06) how near the sea you stand on a surface isle: 16 probes (8 ways × 120 / 240 u) for its water → 0.3 inland … 1 on the beach (a pool in a
   room gives a hit or two, the open sea many) */
function ambSurf(){ if(!ISL || ISL.cave) return 0; let n=0; for(let i=0;i<8;i++){ const a=i*Math.PI/4, c=Math.cos(a), s=Math.sin(a); if(islTile(player.x+c*120,player.y+s*120)===W_WATER) n++; if(islTile(player.x+c*240,player.y+s*240)===W_WATER) n++; } return Math.min(1,0.3+0.12*n); }
/* 4× a second: the recipe → each bed's gain (a bed starts once its loop is in — the first ask queues a T2 load) · the synth's step back · the cave's send ·
   the loops' memory: unplayed 180 s → dropped (fetched again on need), and past 4 resident the stalest go */
function ambEval(t){ const W=AMBS.want; for(const k in W) delete W[k]; ambWant(W); const ok=ambOK(), K=new Set(Object.keys(W)); for(const k in AMBS.beds) K.add(k);
  const off=ambSynthOff(), tb=titleBGOn(), dsea=mode==='sea'||mode==='deck', dup=!off && dsea && !tb;   // (GA fix — GAV-B12: while the synth carries the sea, its wind is the wind — the recorded wind & gale wait · PT1 B2: on her deck too)
  for(const k of K){ let B=AMBS.beds[k]; if(B && B.on && !SNDX.buf[sndKeys(k)[0]]) ambStop(B,t);   // (its loop was dropped, or the DEV bank went away)
    if(AMB_EM[k]) continue; const w=W[k], A=Array.isArray(w); let v=ok?(A?w[0]:w)||0:0; if(v>0 && !sndHave(k)) v=0; if(dup && (k==='amb_wind' || k==='amb_gale')) v=0;
    if(!B){ if(v<=0) continue; B=ambBed(k); if(!B) continue; }
    ambLP(B,A?w[1]:0); ambSet(k,v,0.6); if(v>0 && !B.on) ambStart(B,t); }
  if(waveG && (!dsea || tb)){ const lg=(off?1:0)|(tb?2:4); if(lg!==AMBS.lg){ AMBS.lg=lg; waveG.gain.setTargetAtTime(off?0:tb?0.16:0.13+env.storm*0.16,t,0.6); windG.gain.setTargetAtTime(off?0:tb?0.05:0.04+env.storm*0.22,t,0.6); } }   // (no files: untouched, as ever · GA fix — GAV-B01: the title's own synth sea steps back too, and comes back with 🎧 Off)
  else AMBS.lg=0;
  if(ok && SNDX.st==='ok') ambPreAsk(tb);
  const cv=mode==='island' && !!ISL && !!ISL.cave;
  if(caveConv && !caveConv.buffer && started && mode!=='island' && !(AMBS.irJ && AMBS.irJ.done)) try{ const J=AMBS.irJ||(AMBS.irJ=musIRjob(actx,2.6,0.7,5000)); J.st=Math.min(8192,(J.st||512)*2); musIRstep(J,J.st); }catch(e){ caveConv=null; AMBS.irJ=null; }   // (the cave's impulse, made in small slices while the code is cold, ≤ 8k samples after (≤ 0.6 ms) — 12-24 s at sea or in port, never in a fight, long before the first cave · ambTick hands it over)
  if(caveSendG){ const v=cv && caveConv && caveConv.buffer ? 0.22 : 0; if(v!==AMBS.send){ AMBS.send=v; try{ caveSendG.gain.setTargetAtTime(v,t,0.3); }catch(e){} } }
  { const now=performance.now(), L=[];
    for(const s of ambLoops()){ const k=sndKeys(s)[0], Q=SNDX.buf[k]; if(!Q) continue; const B=AMBS.beds[s], live=!!(B && B.tgt>0); if(live) Q.last=now; L.push([now-(Q.last||0),s,k,live,!!(B && B.on && t-B.z<3)]); }
    L.sort((a,b)=>b[0]-a[0]); let n=L.length;
    for(const r of L){ if(r[3] || !(r[0]>180000 || (n>4 && !r[4]))) continue; const B=AMBS.beds[r[1]]; if(B && B.on) ambStop(B,t); delete SNDX.buf[r[2]]; delete SNDX.req[r[2]]; if(SNDX.fake) delete SNDX.fake[r[2]]; SNDX.bag[r[1]]=null; n--; } } }   // (G11 fix: a bed still fading out (3 s) is never cut by the cap)
/* (GA fix — GAV-B08) the next place's beds, fetched before you get there (a T2 loop's first ask played the synth a moment, then the recording): at the title the
   harbour's & the sea's canvas & wind (New voyage → port · Continue → sea) · in port the sea's three · at sea in a harbour's waters (portReach) its bed — only while
   < 4 loops are resident (A3's memory rule: a storm's six never pull another in) · a resident pre-asked bed counts as wanted for the 180 s drop */
const AMB_PRE={title:['amb_harbour','amb_rig','amb_wind'], port:['amb_sea','amb_rig','amb_wind'], sea:['amb_harbour']};
function ambPreAsk(tb){ const L=tb?AMB_PRE.title : mode==='port'?AMB_PRE.port : mode==='sea' && started && ambNearPort()?AMB_PRE.sea : null; if(!L) return;
  let n=0; for(const s of ambLoops()) if(SNDX.buf[sndKeys(s)[0]]) n++;
  for(const s of L){ const k=sndKeys(s)[0], Q=SNDX.buf[k]; if(Q){ Q.last=performance.now(); continue; } if(SNDX.req[k] || SNDX.bad[k] || !SNDX.man[k] || n>=4) continue; n++; sndHave(s); } }
function ambNearPort(){ for(const c of coresNear(boat.x,boat.y,4000)) if(c.port && Math.hypot(c.x-boat.x,c.y-boat.y)<portReach(c)) return true; return false; }
/* game-time one-shots: a cave's drips (1.5-5 s, anywhere across the screen) · gulls by day within 700 u of a coast (6-14 s, from her side) & in port (8-16 s) */
function ambOneShots(dt){ const O=AMBS.os, R=Math.random;
  if(mode==='island' && ISL && ISL.cave && !caveFade){ if((O.drip-=dt)<=0){ O.drip=1.5+R()*3.5; const s=islScale(); AMBS.n.drip++; sfx('drip',{x:icamX+(R()*2-1)*(IW/2)/s, y:icamY, pitch:0.8+R()*0.5, gain:0.2+R()*0.2}); } }
  else if(O.drip<1.5) O.drip=1.5+(AMBS.clk*7.31)%3.5;                          // (a fresh wait for the next cave — no draw on the game's random stream)
  const dk=mode==='deck' && !!DK && DK.lv==='top', sea=mode==='sea' || dk, gk=(sea || mode==='port') && env.dayName!=='Night' && started && !titleBGOn();   // (G15 FIX: her top deck hears the gulls as the helm does — not the cabin)
  if(!gk){ if(O.gull<2) O.gull=4+(AMBS.clk*5.17)%6; return; }
  if((O.gull-=dt)>0) return; O.gull=sea?6+R()*8:8+R()*8; if(!ambOK() || !sndHave('gull')) return;
  let pan=(R()*2-1)*0.5;
  if(sea){ let best=null, bd=700; for(const c of coresNear(boat.x,boat.y,1500)){ const d=Math.hypot(c.x-boat.x,c.y-boat.y)-c.r; if(d<bd){ bd=d; best=c; } } if(!best){ O.gull=2; return; }
    pan=dk ? clamp(Math.cos(Math.atan2(best.y-boat.y,best.x-boat.x)-boat.a),-1,1)*0.6 : clamp((best.x-camX)/Math.max(1,(IW/2)/iscale()),-1,1)*0.6; }   // (on deck her bow is to your right: a coast off the bow pans right, astern left)
  if(ambShot('gull',0.35,pan)) AMBS.n.gull++; }   // (A4: thunder 0.65 → its synth's level +1 dB · a gull ≈ 2-3 dB over the waves at rest)
/* 10× a second: the emitters → the lava bed's gain & side (no file: a soft hiss every 2.5-6 s) · a bog's bubble every 1.5-4 s (K9b's own pool bubble counts) */
function ambEmitTick(dt,t){ if((AMBS.emt-=dt)>0) return; AMBS.emt=0.1; const isl=mode==='island' && !!ISL, gl=E=>isl && E && E.I===ISL && itime-E.c<0.5 ? 0.6*Math.pow(clamp(1-E.d/E.R,0,1),2) : 0;   // (stale after 0.5 s of island time · another isle's or floor's: none)
  const E=AMBS.em.amb_fire, g=gl(E);
  if((g>0 || AMBS.beds.amb_fire) && ambOK() && sndHave('amb_fire')){ const B=ambBed('amb_fire'); if(B){ if(g>0){ try{ B.pn.pan.setTargetAtTime(sndPan(E),t,0.1); }catch(e){} if(!B.on) ambStart(B,t); } ambSet('amb_fire',g,g>B.tgt?0.15:0.12); } }
  else if(g>0.03 && (AMBS.os.fire-=0.1)<=0){ AMBS.os.fire=2.5+Math.random()*3.5; AMBS.n.hiss++; sfx('lava_hiss',{x:E.x, y:E.y, gain:g*0.5, pitch:0.7+Math.random()*0.15}); }
  const P=AMBS.em.bubbles, pg=gl(P);
  if(pg>0.03 && (AMBS.os.bub-=0.1)<=0){ AMBS.os.bub=1.5+Math.random()*2.5; if(t-(sfxLast.bog_bubble||-9)>1){ AMBS.n.bub++; sfx('bog_bubble',{x:P.x, y:P.y, gain:pg}); } } }
/* every frame, first thing in frameInner: the beds' crossfades (a copy nearing its end → the next fades in over it) · 4× a second the recipe · the one-shots ·
   the emitters. Muted: no new copies (the beds run out, and pick up again on unmute) */
function ambTick(dt){ if(!actx || !ambBus) return; const w0=performance.now(), t=actx.currentTime; AMBS.f++; AMBS.clk+=dt;
  if(caveConv && !caveConv.buffer && mode==='island' && ISL && ISL.cave) try{ const J=AMBS.irJ||(AMBS.irJ=musIRjob(actx,2.6,0.7,5000)); while(!musIRstep(J,1<<30)); caveConv.buffer=J.B; AMBS.irJ=null; }catch(e){ caveConv=null; AMBS.irJ=null; }   // (the first frame below ground — in the black between floors: setting a convolver's buffer builds its FFT partitions there & then, ≈ 14 ms at 48 kHz · 28 at 96)
  if(audioOn) for(const k in AMBS.beds){ const B=AMBS.beds[k]; if(!B.on) continue;
    if(B.tgt<=0 && t-B.z>10){ ambStop(B,t); continue; }                       // (silent 10 s: its sources go — the buffer stays)
    for(let s=0;s<2;s++){ const S=B.sd[s], C=S.c; if(C && C.end-t>AMB_LOOK) continue; const live=!!C && t<C.end+C.X-0.05;
      S.c=ambCopy(B,s,live?Math.max(C.end,t+0.02):t+0.02,true)||(live?C:null); } }
  if((AMBS.et-=dt)<=0){ AMBS.et=0.25; ambEval(t); }
  if(audioOn){ ambOneShots(dt); ambEmitTick(dt,t); }
  const w=performance.now()-w0, K=AMBS.tk; K.n++; K.s+=w; if(w>K.mx) K.mx=w; }
/* (DEV / console) ambStat(reset) → the beds (target · gain now · live), what the mode wants, the resident loops, the emitters, the cave's send, the synth's
   waves & wind, the one-shots so far, ambTick's cost (ms: avg · max) */
function ambStat(reset){ const r3=v=>+(+v).toFixed(3), o={st:SNDX.st, want:{}, beds:{}, gain:{}, live:[], resident:[], em:{}, send:caveSendG?r3(caveSendG.gain.value):null, ir:!!(caveConv&&caveConv.buffer),
    legacy:waveG?{wave:r3(waveG.gain.value), wind:r3(windG.gain.value)}:null, n:Object.assign({},AMBS.n), tick:{n:AMBS.tk.n, avg:+(AMBS.tk.s/Math.max(1,AMBS.tk.n)).toFixed(4), max:r3(AMBS.tk.mx)}};
  for(const k in AMBS.want){ const w=AMBS.want[k]; o.want[k]=Array.isArray(w)?w.map(r3):r3(w); }
  for(const k in AMBS.beds){ const B=AMBS.beds[k]; o.beds[k]=r3(B.tgt); o.gain[k]=r3(B.g.gain.value); if(B.on) o.live.push(k); }
  for(const s of ambLoops()){ const k=sndKeys(s)[0]; if(SNDX.buf[k]) o.resident.push(k); }
  for(const k in AMBS.em){ const E=AMBS.em[k]; o.em[k]={d:Math.round(E.d), R:E.R, age:r3(itime-E.c), here:E.I===ISL, x:Math.round(E.x), y:Math.round(E.y)}; }
  if(reset) AMBS.tk={n:0, s:0, mx:0}; return o; }

