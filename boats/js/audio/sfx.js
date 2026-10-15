"use strict";
/* FILE: js/audio/sfx.js
SOUND 3.0, the sound-effect engine: original lines 11807-12003 (build 5109cd5), moved verbatim, in place.
Every sound effect in the game goes through sfx(name, pitch or opts): recorded voice, designed synth, or the old beeps.
Entry points: sfx (original line 11827 (build 5109cd5)), sfxInit (original line 11838 (build 5109cd5)), sndOut, sfx2,
  sfxS, sfxRecipe, sfxOld, sfxBodyBake, pickMat, enTell, enBark, stingSecure.
Globals it owns: SFX_GAP, sfxLast, the buses SFXB sfxBus SFXN sfxComp cmbBus wldBus uiBus, the voice pool SFXV SFX_VMAX
  SFXVAR SFX_LVL SFX_MAKEUP SFX_FMAX sfxFK sfxFW sfxFN, the hit tables SFX_V5ID SFX_HITV SFX_V5 SFX_V3 SFX_BODY sfxThK,
  SND_P0, SND_KINDS, stingI.
Keep the bus lets plain shared globals: sndRender (DEV sound board) swaps and restores them.
Main globals it reads from elsewhere (all at runtime only): actx, masterG, sfxVolG, SNDP, sndHave, sfxPick, sndDuck,
  sndPan, SND_DUCK, SND_CMPK, SND_MISS, caveSendG, caveConv (js/audio/audio.js); SFX2, SFX_SYN, SFX_MAP, SFX_ALIAS,
  SFX_OLD, SFX_OLDP, SND_BUS_OF, MAT_HIT, MATS, ARCH, EMAT, TELL_K, TELL_A, BARK_K, SECURE_V, PICK_MAT (js/data/crawl2.js);
  plogEv, PLE (the playtest log); LF (js/data/itune_defaults.js); MUS_HOOK (the Director);
  audioOn, PLOG, deckNight, ISL, player, last (the main loop's frame stamp) from the inline core.
Load-time statements: none that run code. Only let/const declarations with pure-literal initialisers; nothing is
  called at load. sfxInit is first called from initAudio (original line 5496 (build 5109cd5)) at runtime.
*/

const SFX_GAP={hit:0.045, pop:0.03, crunch:0.05, chip:0.12, hurt:0.1, pick:0.03,   // swarm-safe: these can't machine-gun or clip
  hit_flesh:0.03, hit_shell:0.03, hit_goo:0.03, hit_stone:0.03, hit_crit:0.03, kill_pop:0.03, kill_crunch:0.04, thud:0.08, swing_sword:0.02, swing_heavy:0.02, bow_release:0.02, dash:0.05, dash_perfect:0.05, nope:0.2,
  tide_tick:0.15, tide_full:0.5, flask_full:0.12, hurt_light:0.12, hurt_heavy:0.1, block:0.08, venom:0.3, frost:0.3, stagger_break:0.06,
  swing_axe:0.02, thrust:0.02, dagger:0.02, cast_bolt:0.02, bow_draw:0.05, slam:0.05, storm:0.25, fire:0.25,
  chain_whirr:0.1, chain_thunk:0.06, cannon:0.08, foghorn:0.5, gurgle:0.3, wet_slap:0.08, gem_level:0.2, secret:0.3, shrine:0.3, whistle:2,   // (C5a: the weapons · a status taking on a crowd plays once in a breath)
  tell_snort:0.12, tell_growl:0.15, tell_click:0.12, tell_hiss:0.12, tell_hum:0.3, bark_grunt:0.14, bark_yip:0.12, bark_click:0.1, bark_croak:0.14, bark_chitter:0.12, bark_hoot:0.16,   // (C9: a pack's tells & barks never machine-gun)
  node_hit:0.03, node_break:0.04, geode:0.1, gem_drop:0.08, secure:0.25, secure2:0.25, secure3:0.25, secure4:0.25, claim:1.2, lvl:0.25, ui_click:0.03, ui_equip:0.06, ui_ok:0.1, chest:0.08, streak:0.04, dig:0.05, chart_ink:0.5, sail_set:0.25, waypoint_set:0.1, waypoint_clear:0.1, explorer_none:0.5, drag_pick:0.05, drag_drop:0.05, drag_bad:0.05, drag_salvage:0.05, drag_sell:0.05,
  sw_sword:0.02, sw_axe:0.02, sw_spear:0.02, sw_dagger:0.02, sw_staff:0.02, sw_sword_fin:0.05, sw_axe_fin:0.05, sw_spear_fin:0.05, sw_dagger_fin:0.05, sw_bow_fin:0.05, sw_staff_fin:0.05,   // (PT1 A1 — pt1_audio §3.5.6)
  hit_fin:0.05, crit_crunch:0.08, skill_boom:0.1, arrow_hit:0.04, kill_burst:0.05, body_thud:0.06, trap_arm:0.1, trap_spike:0.08, trap_dart:0.06, dart_hit:0.04, rock_warn:0.3, rock_fall:0.06,
  barrel_hit:0.06, barrel_fuse:0.5, barrel_boom:0.05, crate_hit:0.05, crate_break:0.05, pillar_crack:0.15, pillar_fall:0.3, bridge_creak:0.6, bridge_snap:0.5, lava_hiss:0.25, bog_bubble:0.5, bog_squelch:0.3,
  ice_crack:0.2, ice_slide:0.4, grass_rustle:0.35, shallows_splash:0.25, ledge_jump:0.2, ledge_land:0.2, arena_gong:1.0, temple_rumble:1.0, deflect:0.06, tell_bristle:0.3, tell_lock:0.3, guard_up:0.3, jaw_snap:0.08, ground_thud:0.07,
  rope_snap:0.2, hull_hit:0.15, ground_scrape:0.4, repair:0.3, iron_stick:0.1, spore_puff:0.15, landfall:0.5, port_arrive:0.5, door_in:0.3, door_out:0.3, net_cast:0.3, buoy_drop:0.3, explorer_send:0.5, harpoon_throw:0.1,
  crew_grumble:1.0, eat:0.2, first:0.3, coin_sell:0.05, ui_open:0.08, ui_close:0.08, ui_tab:0.05, ui_tick:0.03, talk_blip:0.045, hex_deal:0.05, hex_rotate:0.05, hex_place:0.05,
  bow_draw_full:0.1, orb_charge:0.2, orb_burst:0.1, fin_gather:0.1, hv_charge:0.2, hv_ready:0.2, hv_fizzle:0.15, hv_sub:0.1, multi_kill:0.1, body_launch:0.05, tide_crest:0.5, last_stand:0.5, swarm_frenzy:0.5, scramble:0.3, cover_break:0.05, hide_on:0.3,   // (the kept crawl ids & the deck's — swarm-safe)
  ambush_crit:0.08, zap_water:0.25, steam_hiss:0.3, fall_chasm:0.2, splash_fall:0.2, helm_leave:0.3, helm_take:0.3, ship_bell:1.0, rigging_creak:1.0, hatch:0.3, anchor_chain:0.5, decor_place:0.05,
  fish_bite:0.3, reel_click:0.03, line_cast:0.3, saw:0.3, mop_swish:0.3, cook:0.3, bed_rest:1.0, dawn:1.0, sea_chest:0.3,
  stamp:0.1, heavy:0.1, rarekill:0.2, loot_sg:0.05, loot_coral:0.05, loot_pearl:0.1, loot_abyss:0.1, drip:0.25}, sfxLast={};   // (PT1 A2: the redesigned old beeps · a mass kill's loot chimes never stack in one breath)
/* ---- SOUND 3.0 (PT1 A1, pt1_audio §3.4): sfx(name, pitch | {pitch, gain, x, y, mat, layers, thump, step, blade, v}) — the one way to make a sound.
   The Legacy feel → today's old beeps · else a recorded voice (SFX_MAP + a decoded set, sfxS) · else the designed synth (SFX2 / SFX_SYN, sfx2) · else the old beep. ---- */
function sfx(name,a){ if(PLOG) plogEv(PLE.sfx,name); if(!actx||!audioOn||!masterG||deckNight) return; const o=(a&&typeof a==='object')?a:{pitch:a||1};
  const mh=MUS_HOOK[name]?MUS_HOOK[name](o):false;                                      // (PT1 M2a: the claim fanfare, a discovery, the KO — the Bard's when it takes them over · asked under the Legacy feel too: it never touches the music)
  if(LF('sfxLegacy')>0){ const on=SFX_OLD[name]; if(on==='-') return; return sfxOld(on||name, (o.pitch||1)*(on&&SFX_OLDP[name]||1)); }   // (C9: a sound the old game never had stays silent under the Legacy feel · G11 fix: a split id's beep at its old call's pitch — SFX_OLDP)
  if(SND_DUCK[name]) for(const d of SND_DUCK[name]) sndDuck(d[0],d[1],d[2]);
  if(mh) return;                                                                         // (…the Bard took it: the synth stays quiet)
  const id=SFX_ALIAS[name]||name, M=SFX_MAP[id];
  if(M && SNDP.smp){ if(!M.k && sndHave(M.s)) return sfxS(id,M,o); if(M.k && M.kl) sfxKeepLayer(id,M,o); }
  if(SFX2[id] || SFX_SYN[id]) return sfx2(id,o);
  const on=SFX_OLD[id]; if(on==='-') return;
  return sfxOld(on||id, o.pitch||1); }
let SFXB=null, sfxBus=null, SFXN=null, sfxComp=null, cmbBus=null, wldBus=null, uiBus=null; const SFXV=[], SFX_VMAX=32, SFXVAR={}, SFX_LVL=0.62, SFX_MAKEUP=1.2;   // (C9: a voice's level into the bus 0.8 → 0.62 (−2.2 dB) & +1.6 dB of makeup after the compressor: the same loudness, 2 dB more headroom)   // the three buses (→ one compressor → sfxVolG) · 3 cached noise buffers · the live voices (32 at most — PT1 A1)
function sfxInit(){ if(sfxBus || !actx) return !!sfxBus;
  try{ const c=actx.createDynamicsCompressor(); c.threshold.value=-18; c.knee.value=6; c.ratio.value=4; c.attack.value=0.003; c.release.value=0.12;
    sfxBus=actx.createGain(); sfxBus.gain.value=1; sfxBus.connect(c); const mk=actx.createGain(); mk.gain.value=SFX_MAKEUP; c.connect(mk); mk.connect(sfxVolG||masterG); sfxComp=c;   // (C9: a makeup gain after the compressor — the voices go in a little lower, so a full horde keeps its GR under 12 dB)   // (C9: sfxComp.reduction — the DEV sound board's gain-reduction readout)
    cmbBus=actx.createGain(); wldBus=actx.createGain(); uiBus=actx.createGain(); for(const b of [cmbBus,wldBus,uiBus]) b.connect(sfxBus);   // (PT1 A1: combat · world · UI)
    try{ ambCaveInit(); }catch(e){ caveSendG=caveConv=null; }   // (PT1 A3) the cave's reverb send: combat & world (never the UI) → a convolver → back into the bus
    SFXN=[0,1,2].map(()=>{ const b=actx.createBuffer(1,Math.round(actx.sampleRate*0.5),actx.sampleRate), d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b; }); try{ SFXB=sfxBodyBake(); }catch(e){ SFXB=null; } }   // (made once — like thunder() · PT1 A2: + the hit family's baked bodies — a failed bake only drops the body)
  catch(e){ sfxBus=null; } return !!sfxBus; }
function sndOut(b){ return !sfxInit() ? masterG : b==='wld' ? wldBus : b==='ui' ? uiBus : cmbBus; }
function sfxBusOf(id){ const M=SFX_MAP[id]; return (M&&M.b)||SND_BUS_OF[id]||'cmb'; }
const SFX_FMAX=16; let sfxFK=-1, sfxFW=0, sfxFN=0;   // (G5 fix) ≤ 16 new voices a frame: past that a combat / world voice is dropped (never a UI one) — a 45-sound frame cost 5–13 ms of node building (and past 32 the full pool stole them straight back)
function sfxVoice(t,dur,gain,pan,m){ m=m||{}; const w=performance.now(); if(sfxFK!==last || w-sfxFW>20){ sfxFK=last; sfxFW=w; sfxFN=0; } if((sfxFN+=(m.w||1))>SFX_FMAX && (m.pr||2)<=2) return null;   // (a frame: the same game frame and the same 20 ms)
  while(SFXV.length && SFXV[0].end<t) SFXV.shift();                         // (the finished ones leave the pool)
  if(SFXV.length>=SFX_VMAX) for(let i=SFXV.length-1;i>=0;i--) if(SFXV[i].end<t) SFXV.splice(i,1);
  if(SFXV.length>=SFX_VMAX){ const pr=m.pr||2; let i=0; while(i<SFXV.length && (SFXV[i].pr||2)>pr) i++; if(i>=SFXV.length) return null;   // pool full: the oldest voice of no higher priority is stolen — else this one is dropped
    const o=SFXV.splice(i,1)[0]; try{ o.g.gain.cancelScheduledValues(t); o.g.gain.setValueAtTime(0,t); for(const s of o.s) s.stop(t+0.005); }catch(e){} }
  const g=actx.createGain(); g.gain.value=gain; let out=g;
  if(actx.createStereoPanner && pan){ const p=actx.createStereoPanner(); p.pan.value=pan; g.connect(p); out=p; }
  out.connect(sndOut(m.bus)); const v={g, s:[], end:t+dur+0.05, id:m.id||'', pr:m.pr||2, smp:!!m.smp}; SFXV.push(v); return v; }
function sfxKill(v,t){ try{ const p=v.g.gain; if(p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else { p.cancelScheduledValues(t); p.setValueAtTime(p.value,t); } p.linearRampToValueAtTime(0,t+0.02); for(const s of v.s) s.stop(t+0.025); }catch(e){}
  v.end=t; const i=SFXV.indexOf(v); if(i>=0) SFXV.splice(i,1); }   // (a 20 ms fade — the per-id cap's steal)
function sfxEnd(v){ let n=v.s.length; if(!n){ try{ v.g.disconnect(); }catch(e){} return; } for(const s of v.s) s.onended=()=>{ if(--n<=0) try{ v.g.disconnect(); }catch(e){} }; }   // (the voice lets go of the bus once its last layer ends)
function sfxEnv(G,t,a,d,g){ G.gain.setValueAtTime(0.0001,t); G.gain.exponentialRampToValueAtTime(Math.max(0.0002,g),t+Math.max(0.001,a)); G.gain.exponentialRampToValueAtTime(0.0001,t+Math.max(a+0.002,d)); }
function sfxSrc(v,node,t,d){ node.start(t); node.stop(t+d+0.03); v.s.push(node); }
function sfxNz(v,t,type,f0,f1,q,d,a,g){ const b=actx.createBufferSource(); b.buffer=SFXN[(Math.random()*3)|0]; const f=actx.createBiquadFilter(); f.type=type; f.frequency.setValueAtTime(f0,t);
  if(f1 && f1!==f0) f.frequency.exponentialRampToValueAtTime(f1,t+d); if(q) f.Q.value=q; const G=actx.createGain(); sfxEnv(G,t,a,d,g); b.connect(f); f.connect(G); G.connect(v.g); b.start(t,Math.random()*0.4); b.stop(t+d+0.03); v.s.push(b); }
function sfxBody(v,t,r,g){ const b=actx.createBufferSource(), G=actx.createGain(); b.buffer=SFXB[(Math.random()*SFXB.length)|0]; b.playbackRate.value=r; G.gain.value=g;   // (PT1 A2) a hit's BODY: one of the baked takes (sfxBodyBake) at rate r — the band moves with it
  b.connect(G); G.connect(v.g); b.start(t); b.stop(t+b.buffer.duration/r+0.01); v.s.push(b); }
/* (PT1 A2) the hit family's BODY, baked once (sfxInit): 6 takes of noise held in a band round 175-250 Hz — a highpass at 0.72 f into a lowpass at 1.1 f (the
   WebAudio biquads' own maths: their Q in dB), a smooth 10 ms swell & a 20 ms fall (SFX_BODY.a, .d/3). Played as one buffer (2 nodes a hit; 4 filtered live) */
function sfxBodyBake(){ const sr=actx.sampleRate, n=Math.round(sr*0.2), qL=q=>Math.pow(10,q/20), A=Math.round(sr*SFX_BODY.a), tau=sr*SFX_BODY.d/3;
  const biq=(d,hp,f,Q)=>{ const w=2*Math.PI*f/sr, c=Math.cos(w), al=Math.sin(w)/(2*Q), a0=1+al, a1=-2*c/a0, a2=(1-al)/a0, b0=(hp?(1+c)/2:(1-c)/2)/a0, b1=(hp?-(1+c):(1-c))/a0, b2=b0;
    let x1=0, x2=0, y1=0, y2=0; for(let i=0;i<d.length;i++){ const x=d[i], y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2; x2=x1; x1=x; y2=y1; y1=y; d[i]=y; } };
  return [175,190,205,220,235,250].map(f=>{ const B=actx.createBuffer(1,n,sr), d=B.getChannelData(0); for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
    biq(d,1,f*0.72,qL(0.7)); biq(d,0,f*1.1,qL(SFX_BODY.q)); for(let i=0;i<n;i++) d[i]*=i<A?i/A:Math.exp(-(i-A)/tau); return B; }); }
function sfxOsc(v,t,w,f0,f1,d,a,g,lp,lp1){ const o=actx.createOscillator(); o.type=w; o.frequency.setValueAtTime(f0,t); if(f1 && f1!==f0) o.frequency.exponentialRampToValueAtTime(f1,t+d);
  const G=actx.createGain(); sfxEnv(G,t,a,d,g); if(lp){ const f=actx.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(lp,t); if(lp1) f.frequency.exponentialRampToValueAtTime(lp1,t+d); o.connect(f); f.connect(G); } else o.connect(G); G.connect(v.g); sfxSrc(v,o,t,d); }   // (lp1: the lowpass closes over the layer — the boss's roar)
function sfxMat(v,t,m,g,fk){ switch(m){                                                                                     // §11.1 the material layer
  case 'shell': sfxNz(v,t,'bandpass',2500*fk,2500*fk,8,0.04,0.001,g); sfxOsc(v,t,'square',1200*fk,1150*fk,0.04,0.001,g*0.18,3200); break;   // a tink + a square ring
  case 'goo': sfxNz(v,t,'lowpass',700*fk,300*fk,0.8,0.12,0.004,g); sfxOsc(v,t,'sine',200,120,0.14,0.006,g*0.6); break;                   // a squelch + a wobble
  case 'feather': sfxNz(v,t,'highpass',3000*fk,2500*fk,0.7,0.04,0.002,g*0.8); break;
  case 'stone': sfxNz(v,t,'lowpass',400*fk,250*fk,0.7,0.09,0.002,g); sfxOsc(v,t,'sine',70,55,0.1,0.003,g*0.7); break;
  case 'sand': sfxNz(v,t,'bandpass',1200*fk,900*fk,1.2,0.09,0.004,g); break;
  case 'wet': sfxNz(v,t,'lowpass',600*fk,400*fk,0.8,0.09,0.003,g); sfxOsc(v,t+0.01,'sine',300,620,0.06,0.004,g*0.35); break;          // a slap + a bubble
  case 'scale': sfxNz(v,t,'bandpass',1500*fk,1100*fk,1.4,0.05,0.002,g); break;
  case 'coin': sfxNz(v,t,'bandpass',3200*fk,3000*fk,9,0.05,0.001,g*0.7); sfxOsc(v,t,'sine',2600*fk,2550*fk,0.07,0.001,g*0.35); break;   // (C9: the pickup's flavours) a coin's chink
  case 'glass': sfxOsc(v,t,'sine',3136*fk,3100*fk,0.09,0.001,g*0.4); sfxNz(v,t,'highpass',5000*fk,5000*fk,0.7,0.02,0.001,g*0.4); break;   // a cut gem's ping
  case 'leaf': sfxNz(v,t,'bandpass',2200*fk,1600*fk,1.1,0.06,0.004,g*0.8); break;                                                     // a herb's rustle
  default: sfxNz(v,t,'lowpass',800*fk,500*fk,0.7,0.06,0.002,g); } }                                                                 // fur: a dull thwack
function sfxLayer(v,t0,L,o,pm,fk){ const k=L[0], p=L[1], t=t0+(p.at||0), d=p.d||0.08, a=p.a||0.002, g=p.g||0.3;
  if(k==='tr') sfxNz(v,t,'highpass',(p.hp||3000)*fk,0,0.7,d,0.0008,g);
  else if(k==='th') sfxOsc(v,t,'sine',p.f0*pm*sfxThK,p.f1*pm*sfxThK,d,0.003,g*(p.w?o.thump:1));     // (the thump's gain × the weapon's weight — §11.2 · PT1 A2: × the hit family's variant)
  else if(k==='bd') sfxOsc(v,t,p.w,p.f0*pm,p.f1*pm,d,a,g,p.lp?p.lp*fk:0,p.lp1?p.lp1*fk:0);
  else if(k==='nz') sfxNz(v,t,p.t,p.f0*fk*pm,p.f1*fk*pm,p.q||0.9,d,a,g);
  else if(k==='mat') sfxMat(v,t,p.m||o.mat||'fur',g,fk*pm);
  else if(k==='sin') sfxOsc(v,t,'sine',p.f*pm,p.f1?p.f1*pm:0,d,0.004,g); }                            // (f1: a sweep — the KO's fall, the venom's bubble)
function sfxRecipe(id,o){ const r=SFX2[id]?id:(SFX_SYN[id] && SFX2[SFX_SYN[id][0]] ? SFX_SYN[id][0] : null); if(!r) return null;
  return r==='hit_crit' ? SFX2[MAT_HIT[o.mat]||'hit_flesh'].concat(SFX2.hit_crit) : SFX2[r]; }   // a crit is the struck material's hit + its own bite
function sfx2Voice(id,t,len,gain,pan){ const b=sfxBusOf(id), M=SFX_MAP[id]; return sfxVoice(t,len,gain,pan,{id, pr:(M&&M.pr)||(b==='ui'?3:2), bus:b, w:SFX_HITV[id]!=null?2:1}); }   // (PT1 A2: a map row's pr · a thickened hit counts 2 toward the frame's 16 — its body & 2nd transient cost nodes: ≈ 1.7× a plain voice to build (G11 fix: 1.5 → 2))
/* (PT1 A2 — G5V-B02: the synth hits were "thin" and "repetitive") THE HIT FAMILY: id → its BODY's gain (a 160-260 Hz band of noise, 40-60 ms — the weight a
   laptop's speakers can play; the sub-thump under 110 Hz they can't) · 5 variants, never the same twice running: [pitch ×, filter ×, th f0 ×] (±4 % · ±13 % · ±8 %)
   · a 2nd transient 3-8 ms after the first · ±1 dB. The recipes' th is ×1.3 (SFX2) */
const SFX_V5ID={sw_sword:1, sw_axe:1, sw_spear:1, sw_dagger:1, sw_staff:1, swing_sword:1, swing_heavy:1, swing_axe:1, thrust:1, dagger:1, cast_bolt:1, bow_release:1, hurt_light:1, jaw_snap:1, ground_thud:1, deflect:1, chip:1, thud:1, body_thud:1, arrow_hit:1, volley:1, sw_bow_fin:1};   // (the other oft-heard ids: 5 variants too, no body · G11 fix: + the arrow's hit & the bow's finisher)
const SFX_HITV={hit_flesh:0.55, hit_shell:0.32, hit_goo:0.45, hit_stone:0.5, hit_crit:0.5, kill_pop:0.1, kill_crunch:0.6, multi_kill:0.6};
const SFX_V5=[[1,1,1],[0.96,0.87,1.08],[1.04,1.13,0.92],[0.98,0.93,1.04],[1.02,1.07,0.96]], SFX_V3=[[1,1,1],[0.94,0.9,1],[1.06,1.1,1]], SFX_BODY={q:0.9, d:0.06, a:0.01, g:5}; let sfxThK=1;   // (SFX_BODY: the body's lowpass Q · fall (τ = d/3) · swell · gain × SFX_HITV — measured offline, A2 notes)
function sfx2Layers(R,v,t,o,kinds,gain,pm,fk){ if(!R || !v) return; if(pm==null) pm=o.pitch||1; if(fk==null) fk=1; let d=v;   // a recipe's layers (kinds: only these, e.g. ['th'] — the sub-thump under a recorded hit)
  if(gain!=null && gain!==1){ const g=actx.createGain(); g.gain.value=gain; g.connect(v.g); d={g, s:v.s}; }
  for(const l of R) if(!kinds || kinds.indexOf(l[0])>=0) sfxLayer(d,t,l,o,pm,fk); }
function sfx2(name,o){ if(!sfxInit()) return; const t=actx.currentTime, L=sfxRecipe(name,o);
  if(!L){ SND_MISS[name]=1; const on=SFX_OLD[name]; if(on!=='-') sfxOld(on||name,o.pitch||1); return; }   // (PT1 A1: a missing recipe never throws — noted in SND_MISS, then the old beep or silence)
  if(SFX_GAP[name]){ if(t-(sfxLast[name]||-9)<SFX_GAP[name]) return; sfxLast[name]=t; }
  const syn=SFX2[name]?null:SFX_SYN[name], pan=sndPan(o), off=sndPan.g;   // stereo from the screen x · off-screen −6 dB (§3.4: every mode)
  const HB=SFX_HITV[name], N=(HB!=null||SFX_V5ID[name])?5:3, vv=(SFXVAR[name]=((SFXVAR[name]||0)+1+((Math.random()*(N-1))|0))%N), V=(N===5?SFX_V5:SFX_V3)[vv];   // 3 variants: pitch ±6% · filter ±10% (the hit family: 5 — SFX_V5)
  const pm=(o.pitch||1)*V[0]*(syn?syn[1]:1), fk=V[1], x=Math.max(0,o.layers|0), gj=HB!=null?Math.pow(10,(Math.random()*2-1)/20):1;
  const v=sfx2Voice(name,t,SFX_LEN[name]||(syn&&SFX_LEN[syn[0]])||0.4,(o.gain||1)*(syn?syn[2]:1)*off*Math.pow(10,1.5*x/20)*SFX_LVL*gj,pan); if(!v) return; if(o.thump==null) o.thump=1;
  sfxThK=V[2]; try{
  sfx2Layers(L,v,t,o,null,1,pm,fk);
  if(HB!=null){ const T0=L.find(l=>l[0]==='tr'), hp=T0?T0[1].hp||3000:2800, tg=T0?T0[1].g||0.3:0.3, bf=(175+Math.random()*60)*Math.sqrt(pm);   // the hit family: a 2nd transient & the BODY
    sfxNz(v,t+0.003+Math.random()*0.005,'highpass',hp*fk*(0.8+Math.random()*0.45),0,0.7,0.004,0.0008,tg*(0.4+Math.random()*0.3));
    if(SFXB && HB>=0.15) sfxBody(v,t+0.002,bf/205,HB*SFX_BODY.g*(0.6+0.4*Math.min(1.5,o.thump))); }
  for(let i=0;i<x;i++){ sfxNz(v,t+0.004*(i+1),'highpass',(2600+700*i)*fk,0,0.7,0.005,0.0008,0.3); sfxMat(v,t+0.006*(i+1),o.mat||'fur',0.3,fk*(1+0.08*i)); }   // one voice, N targets: more transient & material stacked (+1.5 dB each — §11.2)
  if(o.gong) sfx2Layers(SFX2.gong,v,t,o,null,1,1,1);                                                  // the finisher's low gong
  if(o.chord) for(const q of [1.5,2]) sfx2Layers(SFX2.kill_crunch,v,t+0.01,o,null,1,pm*q,fk);        // a multi-kill: root · fifth · octave
  } finally { sfxThK=1; }
  sfxEnd(v); }
/* (PT1 A1 §3.4) a RECORDED voice: the set (per variant · per combo step) from its shuffle bag, a random rate & gain, its layers, N targets thicker (never N voices),
   the synth's sub-thump kept under it (the cure for "thin") — one voice, ≤ m of this id alive (the oldest fades), on its bus */
const SND_P0=[0.96,1.04], SND_KINDS=['tr','th','bd','nz','mat','sin'];
function sfxS(id,M,o){ if(!sfxInit()) return; const t=actx.currentTime, gp=SFX_GAP[id], was=sfxLast[id];
  if(gp){ if(t-(was||-9)<gp) return; sfxLast[id]=t; }
  let V=M.sv&&M.sv[o.v||o.mat]; if(V==null && M.st) V=M.st[o.step]; let VO=V&&typeof V==='object'?V:null, set=(VO?VO.s:V)||M.s; if(set!==M.s) sndHave(set);   // (A4 — G11V-C10: a variant (sv, st) may be {s, l, r, g}: its own set, layers, rate & gain — GA fix — GAV-C01 · GAV-C02: an unloaded T2 variant is fetched)
  let P=sfxPick(set); if(!P && set!==M.s){ P=sfxPick(M.s); VO=null; set=M.s; }                       // (the variant's set not in yet: the row's own voice)
  if(!P){ sfxLast[id]=was; return (SFX2[id]||SFX_SYN[id]) ? sfx2(id,o) : undefined; }                 // (nothing decoded after all — the synth)
  let n=0, ov=null; for(const v of SFXV) if(v.id===id && v.end>t){ n++; if(!ov) ov=v; } if(ov && n>=(M.m||3)) sfxKill(ov,t);
  const ui=M.pos===0||(M.b==='ui'&&M.pos==null), pan=ui?0:sndPan(o), pg=ui?1:sndPan.g, pr=M.p||SND_P0, gj=M.gj==null?1:M.gj;
  const rate=clamp((o.pitch||1)*(pr[0]+Math.random()*(pr[1]-pr[0]))*P.r*(VO&&VO.r||1),0.5,2), x=Math.min(2,Math.max(0,o.layers|0));
  const gain=(M.g==null?0.8:M.g)*((VO&&VO.g)||1)*(o.gain==null?1:o.gain)*Math.pow(10,(Math.random()*2-1)*gj/20)*SFX_LVL*pg;
  const S=[[P,rate,1,0]];                                                                                // [pick, rate, gain, delay s]
  for(let i=0;i<x;i++) S.push([sfxPick(set)||P,clamp(rate*(i?1.03:0.97),0.5,2),0.631,i?0.011:0.006]);   // N targets: 1-2 more picks at −4 dB, 6 / 11 ms on
  for(const l of ((VO&&VO.l)||M.l||[]).concat(o.blade&&M.lb?M.lb:[])){ const q=sfxPick(l[0]); if(q) S.push([q,clamp(rate*(l[3]||1)*q.r,0.5,2),l[1],(l[2]||0)/1000]); else sndHave(l[0]); }   // (GA fix — GAV-C02: a layer's T2 set not in yet is fetched for next time — the gamble's dice)
  let dur=0; for(const s of S) dur=Math.max(dur,s[3]+(s[0].B.b.duration-s[0].B.off)/s[1]); if(M.y||o.gong||o.chord) dur=Math.max(dur,SFX_LEN[id]||0.4); dur=Math.min(3,dur);
  const b=M.b||'cmb', v=sfxVoice(t,dur,gain,pan,{id, pr:M.pr||(b==='ui'?3:2), smp:1, bus:b}); if(!v) return; if(o.thump==null) o.thump=1;
  for(const s of S){ const B=s[0].B, src=actx.createBufferSource(); src.buffer=B.b; src.playbackRate.value=s[1]; let out=src;
    if(s[2]!==1){ const g=actx.createGain(); g.gain.value=s[2]; src.connect(g); out=g; } out.connect(v.g); src.start(t+s[3],B.off); src.stop(t+s[3]+Math.min(3,(B.b.duration-B.off)/s[1])+0.02); v.s.push(src); }
  if(M.y){ const K=M.y.split('|'), kinds=K.every(k=>SND_KINDS.indexOf(k)>=0)?K:null; sfx2Layers(kinds||M.y==='all'?sfxRecipe(id,o):SFX2[M.y],v,t,o,kinds,M.yg==null?1:M.yg); }
  if(o.gong) sfx2Layers(SFX2.gong,v,t,o,null,1,1,1);                                                  // (no caller after K2 — a safety net: the synth gong only)
  if(o.chord) for(const q of [1.5,2]) sfx2Layers(SFX2.kill_crunch,v,t+0.01,o,null,1,(o.pitch||1)*q,1);
  sfxEnd(v); }
function sfxKeepLayer(id,M,o){ const L=M.kl[o.v||o.mat||'coin']; if(!L || !sndHave(L[0]) || !sfxInit()) return; const P=sfxPick(L[0]); if(!P) return;   // a KEEP id's quiet recorded layer (the synth plays too)
  const t=actx.currentTime, v=sfxVoice(t,Math.min(1.5,(P.B.b.duration-P.B.off)/P.r),L[1]*SFX_LVL*(o.gain==null?1:o.gain),0,{id:id+'~', pr:1, smp:1, bus:M.b||'ui'}); if(!v) return;
  const src=actx.createBufferSource(); src.buffer=P.B.b; src.playbackRate.value=clamp((o.pitch||1)*P.r,0.5,2); src.connect(v.g); src.start(t,P.B.off); src.stop(t+1.5); v.s.push(src); sfxEnd(v); }
/* (C9 §11.3) the voices a crawl speaks with: a wind-up's TELL · a kind's BARK (its pack wakes · it falls) · the clearing's STING · the pickup's flavour */
function pickMat(k){ return k==='gold'?'coin':(PICK_MAT[(MATS[k]||{}).f]||'coin'); }
function tellOf(en){ return TELL_K[en.type]||TELL_A[(ARCH[en.type]||{}).a]||(EMAT[en.type]==='shell'?'tell_click':'tell_hiss'); }
function enTell(en){ if(en.fodder || en.dummy || en.guard || !ISL || Math.abs(en.x-player.x)>420 || Math.abs(en.y-player.y)>300) return;   // (near you only — a far pack's wind-ups stay quiet)
  sfx(tellOf(en),{x:en.x, y:en.y, gain:0.6, pitch:en.elite?0.88:1}); }
function enBark(en,g){ const b=BARK_K[en.type]; if(!b || !ISL || en.dummy || Math.abs(en.x-player.x)>520 || Math.abs(en.y-player.y)>360) return;
  sfx('bark_'+b,{x:en.x, y:en.y, gain:g||0.55, pitch:(en.elite?0.85:1)*(0.95+Math.random()*0.1)}); }
let stingI=0; function stingSecure(p){ sfx(SECURE_V[stingI++%SECURE_V.length], p||1); }   // §11.2: a secured clearing's 3-note sting — never the same twice running
function sfxOld(name,mul){ if(!actx||!audioOn||!masterG) return; try{
  const t=actx.currentTime;
  if(SFX_GAP[name]){ if(t-(sfxLast[name]||-9)<SFX_GAP[name]) return; sfxLast[name]=t; }
  const o=actx.createOscillator(), g=actx.createGain(), out=sndOut('ui'); o.connect(g); g.connect(out);   // (PT1 A1: the UI bus — no beep skips the compressor & the limiter now)
  let f=440,d=0.1,ty='square',gv=0.16;
  if(name==='slash'){f=300;d=0.08;ty='sawtooth';} else if(name==='shoot'){f=720;d=0.07;ty='triangle';}
  else if(name==='hurt'){f=150;d=0.2;ty='square';} else if(name==='break'){f=210;d=0.12;ty='square';}
  else if(name==='secure'){f=620;d=0.3;ty='sine';} else if(name==='land'){f=320;d=0.22;ty='sine';}
  else if(name==='tink'){f=560;d=0.05;ty='square';} else if(name==='heart'){f=540;d=0.2;ty='sine';}
  else if(name==='pick'){f=640;d=0.06;ty='triangle';} else if(name==='chest'){f=330;d=0.5;ty='triangle';}
  else if(name==='dig'){f=130;d=0.1;ty='square';} else if(name==='dash'){f=520;d=0.12;ty='triangle';}
  else if(name==='cast'){f=250;d=0.24;ty='sine';} else if(name==='snap'){f=95;d=0.34;ty='sawtooth';}
  else if(name==='thunk'){f=170;d=0.14;ty='square';}
  else if(name==='hit'){f=190;d=0.07;ty='square';gv=0.11;} else if(name==='pop'){f=900;d=0.045;ty='triangle';gv=0.09;}   // a blow lands · trash pops
  else if(name==='crunch'){f=140;d=0.17;ty='sawtooth';gv=0.13;} else if(name==='chip'){f=175;d=0.07;ty='square';gv=0.09;}   // a real kill · a swarm nip
  else if(name==='howl'){f=250;d=0.55;ty='sawtooth';gv=0.1;} else if(name==='raise'){f=210;d=0.5;ty='triangle';}   // threats: low & falling
  else if(name==='streak'){f=520;d=0.14;ty='square';gv=0.1;}
  else if(name==='heavy'){f=150;d=0.17;ty='sawtooth';gv=0.2;} else if(name==='whirl'){f=160;d=0.38;ty='sawtooth';gv=0.16;}   // combo finisher · the Whirl
  else if(name==='legend'){f=440;d=0.42;ty='triangle';gv=0.12;} else if(name==='volley'){f=980;d=0.22;ty='triangle';gv=0.13;}   // a rising swell (a legendary find · the Legacy Tide-full) · the Volley
  else if(name==='first'){f=660;d=0.45;ty='sine';gv=0.14;} else if(name==='rarekill'){f=520;d=0.5;ty='triangle';gv=0.14;}   // a first meeting (a rising chime) · a magic/rare foe falls
  else if(name==='trk'){f=1100;d=0.3;ty='triangle';gv=0.1;}                                    // a trinket drops (pitch climbs with its rarity)
  else if(name==='lvl'){f=523;d=0.26;ty='triangle';gv=0.12;} else if(name==='stamp'){f=95;d=0.16;ty='square';gv=0.14;}   // the level-up chime's notes · the ledger's name stamp (a dull thunk)
  o.type=ty; o.frequency.setValueAtTime(f*(mul||1),t);
  if(name==='first') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*2,t+0.3);
  if(name==='rarekill') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*3,t+d);
  if(name==='trk') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*1.6,t+d);
  if(name==='lvl') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*1.12,t+0.12);
  if(name==='stamp') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*0.5,t+d);
  if(name==='heavy') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*0.45,t+d);
  if(name==='whirl'){ o.frequency.exponentialRampToValueAtTime(f*(mul||1)*2.2,t+0.18); o.frequency.exponentialRampToValueAtTime(f*(mul||1)*0.7,t+d); }
  if(name==='legend') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*2,t+0.3);
  if(name==='volley') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*0.4,t+d);
  if(name==='hit') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*0.6,t+d);
  if(name==='pop') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*1.7,t+d);
  if(name==='crunch'||name==='chip') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*0.42,t+d);
  if(name==='howl'){ o.frequency.exponentialRampToValueAtTime(f*(mul||1)*1.18,t+0.12); o.frequency.exponentialRampToValueAtTime(f*(mul||1)*0.5,t+d); }
  if(name==='raise') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*0.4,t+d);
  if(name==='streak') o.frequency.exponentialRampToValueAtTime(f*(mul||1)*2,t+d);
  if(name==='secure') o.frequency.exponentialRampToValueAtTime(f*2,t+0.25);
  if(name==='chest') o.frequency.exponentialRampToValueAtTime(f*2.4,t+0.4);
  if(name==='dash') o.frequency.exponentialRampToValueAtTime(f*0.45,t+d);
  if(name==='cast') o.frequency.exponentialRampToValueAtTime(f*0.42,t+d);
  if(name==='snap') o.frequency.exponentialRampToValueAtTime(f*0.5,t+d);
  if(name==='heart') o.frequency.exponentialRampToValueAtTime(f*1.7,t+0.16);
  if(name==='shoot') o.frequency.exponentialRampToValueAtTime(f*0.5,t+d);
  if(out!==masterG) gv*=SND_CMPK; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gv,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+d);
  o.start(t); o.stop(t+d+0.02);
}catch(e){} }
