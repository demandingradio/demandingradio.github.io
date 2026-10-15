"use strict";
/* FILE: js/debug/tuning_panels.js
The tuning slider panels: the ship, chart, sea and town sliders (TUNE_DEF), the playtest trigger rows, and the island
combat sliders (ITUNE_DEF). Original lines 41333-41862 (build 5109cd5), moved verbatim.
Entry points: buildTunePanel, syncTune, buildPlaytest, refreshPlaytest, buildIslandTune (called by ptBoot and begin at
  runtime; syncTune also by the keydown shortcuts).
Owns: TUNE_DEF, ITUNE_DEF, plus the functions above.
Reads from elsewhere (at runtime only): TUNE (original line 4532 (build 5109cd5)), DEFAULT_TUNE (original line 4527
  (build 5109cd5)), ITUNE (original line 11679 (build 5109cd5)), dev, mapOpen, mode, queueSave, toast, townGridFor,
  renDirty, dangerVer (original line 40395 (build 5109cd5)), islPixOn, setIslPix, escFlush, PSPR, SPR2, the port, crew
  and ship debug helpers, and the DEV rows sagaDevRow, seasDevRow and deepDevRow.
Load-time statements: two onclick assignments that only store closures, #tuneReset (original line 41394 (build 5109cd5))
  and #tuneCopy (original line 41395 (build 5109cd5)). A #tuneReset click reassigns the global TUNE object.
The banner 'start / boot' (original line 41468 (build 5109cd5)) heads the ITUNE_DEF table, not boot code.
Several ITUNE_DEF labels hold backslash-escaped apostrophes inside strings; they are copied byte for byte.
*/
/* ============================ tuning panel ============================ */
const TUNE_DEF=[
  ['baseSpeed','Top speed',40,180,1],
  ['accel','Pickup',0.4,3.5,0.05],
  ['glide','Coast / glide',0.1,2.0,0.02],
  ['turn','Turn rate',0.8,3.5,0.05],
  ['windSpread','Wind matters',0,0.85,0.02],
  ['windDrift','Wind shiftiness',0,2.5,0.05],
  ['zoom','Zoom',0.6,1.9,0.02],
  ['chSettle','Chart: repaint the land once it has been still for (ms)',60,600,10],   // (CH Q1)
  ['chNotchWait','Chart: after a single wheel notch, wait this long for the next before repainting (ms · 0 = no extra wait)',0,1000,50],   // (CH Q1)
  ['chZoom','Chart: zoom per mouse-wheel notch ×',1.05,1.5,0.01],   // (CH Q1)
  ['chUnder','Chart: blurry land under the edges while it moves (1 on · 0 = blank parchment)',0,1,1],   // (CH Q1)
  ['chEase','Chart: zoom glide (s · 0 = instant steps)',0,0.2,0.01],   // (CH F1)
  ['chGlide','Chart: coast after a drag (s · 0 = stops dead)',0,0.6,0.01],   // (CH F1)
  ['chKeyV','Chart: arrow-key pan speed (charts a second)',0.3,3,0.05],   // (CH F1)
  ['chPadV','Chart: stick pan speed (charts a second)',0.3,3,0.05],   // (CH F1)
  ['chCoast','Chart: coastline (0 = the classic ink · 1 = the faster grid ink)',0,1,1],   // (CH R1)
  ['seaLand','Lands from the sea: each isle wears her biome (1 = on · 0 = the old flat bands)',0,1,1],
  ['seaProps','Lands from the sea: trees & props ×',0,2,0.05],
  ['seaTree','Lands from the sea: tree size ×',0.2,0.7,0.02],
  ['seaHill','Lands from the sea: hill shading ×',0,3,0.1],
  ['seaTex','Lands from the sea: ground texture & flecks ×',0,2.5,0.1],
  ['seaGlow','Lands from the sea: lava, caps & crystal glow at night ×',0,2,0.05],
  ['seaBudget','Lands from the sea: pre-bake budget (ms a frame)',0,6,0.5],
  ['seaPix','Fish & whales: pixel art (1 = on · 0 = the old smooth drawing)',0,1,1],
  ['fishSize','Fish & whales: fish drawn size ×',0.6,1.8,0.05],
  ['shoalTell','Fish & whales: a school’s shimmer & rare glow ×',0,2,0.05],
  ['gulls','Fish & whales: gulls wheel over rare schools (1 = on)',0,1,1],
  ['creatGlow','Fish & whales: night glow — lures, embers, ghost-lights ×',0,2,0.05],
  ['creatBudget','Fish & whales: whale look bake budget (ms a frame)',0.5,6,0.5],
  ['whaleMem','Fish & whales: whale looks kept (million texels)',1,16,1],
  ['townPix','Towns: pixel art (1 = on · 0 = the old smooth drawing)',0,1,1],
  ['townRows','Towns: texel rows on screen (lower = chunkier)',140,300,10],
  ['townBiome','Towns: wear a biome (0 = the harbour’s own · 1-15 = force one, to preview)',0,15,1],
  ['townLight','Towns & rooms: lamps, windows & the night (1 = on · 0 = the old flat wash)',0,1,1],
  ['townNight','Towns: ambient light at midnight (lower = darker)',0.15,1,0.02],
  ['townLamp','Towns: a street lamp’s reach (world units)',20,160,2],
  ['townWin','Towns: lit windows at night ×',0,2,0.05],
  ['townDecal','Towns: ground detail (flowers, tufts, pebbles, snow) ×',0,3,0.1],
  ['townTree','Towns: tree size ×',0.6,1.5,0.05],
  ['townLife','Towns: ambient life (snow, leaves, fireflies, embers) ×',0,2,0.1],
  ['townBudget','Towns: ground pre-bake budget (ms a frame)',0,6,0.5],
  ['roomNight','Rooms: ambient light after dark (lower = darker)',0.15,1,0.02],
  ['roomLight','Rooms: hearth, candle & lantern reach ×',0.3,2,0.05],
];
function buildTunePanel(){
  const host=document.getElementById('tuneRows'); host.innerHTML='';
  TUNE_DEF.forEach(([k,label,min,max,step])=>{
    const row=document.createElement('div'); row.className='row';
    row.innerHTML='<label>'+label+' <b id="tv_'+k+'">'+TUNE[k]+'</b></label>'+
      '<input type="range" id="ts_'+k+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+TUNE[k]+'">';
    host.appendChild(row);
    row.querySelector('input').addEventListener('input',e=>{
      TUNE[k]=parseFloat(e.target.value); document.getElementById('tv_'+k).textContent=TUNE[k]; queueSave();
      if((k==='townPix'||k==='townRows') && (mode==='port'||mode==='interior')) townGridFor();   // (the towns' grid re-fits live)
    });
  });
}
function syncTune(){ TUNE_DEF.forEach(([k])=>{ const s=document.getElementById('ts_'+k), v=document.getElementById('tv_'+k);
  if(s){s.value=TUNE[k];} if(v){v.textContent=TUNE[k];} }); }
document.getElementById('tuneReset').onclick=()=>{ TUNE=Object.assign({},DEFAULT_TUNE); syncTune(); queueSave(); if(mode==='port'||mode==='interior') townGridFor(); };
document.getElementById('tuneCopy').onclick=()=>{ const s=JSON.stringify(TUNE);
  navigator.clipboard&&navigator.clipboard.writeText(s); toast('Feel values copied','paste them to me'); };

/* playtest triggers — force time of day / weather on demand */
function buildPlaytest(){
  const times=[['Auto',null],['Dawn',0.25],['Day',0.5],['Dusk',0.75],['Night',0.0]];
  const weath=[['Auto','auto'],['Clear',0],['Storm',1]];
  const tEl=document.getElementById('ptTime'), wEl=document.getElementById('ptWeather');
  tEl.innerHTML=''; wEl.innerHTML='';
  times.forEach(([label,val])=>{ const b=document.createElement('button'); b.className='ptb'; b.textContent=label;
    b.dataset.val=(val===null?'auto':String(val));
    b.onclick=()=>{ if(val===null) dev.timeAuto=true; else { dev.timeAuto=false; dev.timeOfDay=val; } refreshPlaytest(); };
    tEl.appendChild(b); });
  weath.forEach(([label,val])=>{ const b=document.createElement('button'); b.className='ptb'; b.textContent=label;
    b.dataset.val=String(val);
    b.onclick=()=>{ if(val==='auto') dev.stormAuto=true; else { dev.stormAuto=false; dev.stormManual=val; } refreshPlaytest(); };
    wEl.appendChild(b); });
  const fog=[['On',false],['Off (debug)',true]], fEl=document.getElementById('ptFog'); fEl.innerHTML='';
  fog.forEach(([label,val])=>{ const b=document.createElement('button'); b.className='ptb'; b.textContent=label;
    b.dataset.val=String(val);
    b.onclick=()=>{ dev.revealAll=val; if(mapOpen) renderFullMap(); refreshPlaytest(); };
    fEl.appendChild(b); });
  const fsh=[['Common',0],['Uncommon',1],['Rare',2],['Exotic',3],['Biome','b']], fiEl=document.getElementById('ptFish');
  if(fiEl){ fiEl.innerHTML='';
    fsh.forEach(([label,val])=>{ const b=document.createElement('button'); b.className='ptb'; b.textContent=label;
      b.onclick=()=>debugSpawnFish(val);
      fiEl.appendChild(b); }); }
  const whl=[['Pilot','pilot'],['Humpback','humpback'],['Sperm','sperm'],['Blue','blue'],['Exotic','exotic'],['WHITE','white']], whEl=document.getElementById('ptWhale');
  if(whEl){ whEl.innerHTML='';
    whl.forEach(([label,val])=>{ const b=document.createElement('button'); b.className='ptb'; b.textContent=label;
      b.onclick=()=>debugSpawnWhale(val);
      whEl.appendChild(b); }); }
  const prt=[['+250g',()=>{ cargo.gold+=250; toast('🪙  (debug) +250 gold',''); queueSave(); }],
             ['Hull −30',()=>{ hull=clamp(hull-30,0,hullMaxNow()); toast('🛠  (debug) hull −30',Math.round(hull)+' / '+hullMaxNow()); }],
             ['Goods',()=>{ matAdd(gemK(1,biomeOf(cores[homePortIdx]||cores[0]).key),3,true); matAdd('o1',3,true); matAdd('relic',2,true); matAdd('h:sage',3,true); matAdd('scrap',3,true); toast('🧺  (debug) materials in the Hold',''); queueSave(); }],   // (the tier-1 kinds, C4a)
             ['To port',()=>teleportToPort()],
             ['Rep +60 here',()=>{ const c=repCore(); if(!c){ toast('⚓  (debug) no harbour here','dock, or lie in a port’s bay'); return; } repAdd(c.idx,60/(ETUNE.repGain||1),'debug'); toast('⚓  (debug) '+c.city,REP_N[repTier(c.idx)]); }],   // (PT1 W8: the town you're in — or whose bay you're in)
             ['Rep 0 here',()=>{ const c=repCore(); if(!c){ toast('⚓  (debug) no harbour here','dock, or lie in a port’s bay'); return; } delete TREP[c.idx]; queueSave(); toast('⚓  (debug) '+c.city,REP_N[0]); }]], prEl=document.getElementById('ptPort');
  if(prEl){ prEl.innerHTML='';
    prt.forEach(([label,fn])=>{ const b=document.createElement('button'); b.className='ptb'; b.textContent=label;
      b.onclick=fn;
      prEl.appendChild(b); }); }
  const crw=[['Rations +20',()=>{ const n=provAdd(20); toast('🍖  (debug) +'+n+' rations',provisions+' / '+provCap()); }],
             ['Skip day',()=>{ if(mode==='sea') settleCrewDay(); }],
             ['Rep +1',()=>{ for(const m of crew) if(m.role!=='captain'){ m.rep=Math.min(10,m.rep+1); crewLoad(m); }   // (PT1 B4: the XP kept within the new level)
               toast('⭐  (debug) crew rep +1',''); queueSave(); if(menuOpen) renderCrewTab(); }],
             ['Strike',()=>{ crewUnpaid=!crewUnpaid; toast('⚠  (debug) strike '+(crewUnpaid?'ON':'off'),''); }],
             ['Explorer 5',()=>{ if(!hasExplorer()){ crew.push(crewLoad({role:'explorer', name:'Tess Marrow', rep:5}));
               toast('⛺  (debug) explorer aboard','rep 5'); queueSave(); if(menuOpen) renderCrewTab(); } }]], cwEl=document.getElementById('ptCrew');
  if(cwEl){ cwEl.innerHTML='';
    crw.forEach(([label,fn])=>{ const b=document.createElement('button'); b.className='ptb'; b.textContent=label;
      b.onclick=fn;
      cwEl.appendChild(b); }); }
  const shp=[['Stage −','st-'],['Stage +','st+'],['All decor','decor'],['Crew +200 XP','xp'],['Finish works','works'],['Timber +50','timber'],['Story +1 chapter','story']], shEl=document.getElementById('ptShip');   // (PT1 B11: the ship's DEV row — shipDev)
  if(shEl){ shEl.innerHTML='';
    shp.forEach(([label,k])=>{ const b=document.createElement('button'); b.className='ptb'; b.textContent=label;
      b.onclick=()=>shipDev(k);
      shEl.appendChild(b); }); }
  sagaDevRow();   // (INTROSTORY C15: the Introstory row)
  seasDevRow();   // (SEAS SE2: the 🌊 Seas row — where you are, sail to a sea, the weather bias)
  deepDevRow();   // (DEPTHS DE6: the ⬇ Depths row — the floor you're on, its find, its sealed door)
  refreshPlaytest();
}
function refreshPlaytest(){
  document.querySelectorAll('#ptTime .ptb').forEach(b=>{ const v=b.dataset.val;
    const on = dev.timeAuto ? v==='auto' : (v!=='auto' && Math.abs(parseFloat(v)-dev.timeOfDay)<0.001);
    b.classList.toggle('on',on); });
  document.querySelectorAll('#ptWeather .ptb').forEach(b=>{ const v=b.dataset.val;
    const on = dev.stormAuto ? v==='auto' : (v!=='auto' && parseFloat(v)===dev.stormManual);
    b.classList.toggle('on',on); });
  document.querySelectorAll('#ptFog .ptb').forEach(b=>{ b.classList.toggle('on', String(dev.revealAll)===b.dataset.val); });
}

/* ============================ start / boot ============================ */
/* island combat tuning rows + rename overlay wiring */
const ITUNE_DEF=[
  ['artSpr','Art style: Sprites 2.0 — the hand-placed bodies (1 on · 0 = the old ovals)',0,1,1],   // (PX A1)
  ['artGrade','Art style: colour grade — shadows cool, lights warm, contrast',0,1,0.05],   // (PX A2) the style pass (🎮 Options → 🖼 Picture is the player's switch)
  ['artSat','Art style: saturation +',-0.4,0.6,0.02],
  ['artPost','Art style: posterise — levels a channel (0 = off)',0,32,1],
  ['artDith','Art style: ordered dither of the posterise',0,1,0.05],
  ['artVig','Art style: vignette',0,0.8,0.02],
  ['artGlow','Art style: glow',0,0.5,0.02],
  ['artGlowT','Art style: glow threshold (0 = a soft lift of everything · 0.5 = only the lights bloom)',0,0.9,0.05],
  ['artNight','Art style: the night eases the grade by (crawl surface · towns · rooms · deck)',0,1,0.05],
  ['artScan','Art style: CRT scanlines strength (the switch is in 🎮 Options)',0,0.5,0.02],
  ['moveSpeed','Move speed',40,140,2],
  ['slashDmg','Slash damage × (the sword’s Attack)',0.25,4,0.05],
  ['slashCD','Legacy feel: the old slash cooldown (s)',0.12,0.7,0.02],
  ['slashRange','Slash reach (the sword cone’s R, u — every melee shape scales with it)',16,50,1],
  ['arrowSpeed','Arrow speed (u/s)',120,480,5],
  ['arrowDmg','Arrow damage × (the bow’s Attack)',0.25,4,0.05],
  ['boarCharge','Boar charge',80,320,5],
  ['enemyDmg','Enemy damage × (every blow’s atkAt)',0,4,0.05],
  ['nipMul','Swarm nip: × a normal blow',0,0.6,0.01],
  ['depthRiseHp','Run arc: foe HP & bite danger + by the hoard (dlE)',0,3,0.25],
  ['lightInvul','Grace after chip hit',0,0.4,0.02],
  ['heavyInvul','Grace after heavy hit',0.2,2,0.05],
  ['heavyChipGrace','Chip grace after heavy hit',0,1,0.05],
  ['hitPush','Knockback on you ×',0,2.5,0.1],
  ['nipCap','Swarm: most nips a second',0.2,4,0.1],
  ['nipHorde','Swarm: most nips a second (a horde)',0.2,4,0.1],
  ['nipGnaw','Swarm: gnaw before a nip (s)',0,1,0.05],
  ['nipQuietN','Swarm: a swing felling this many hushes the nips',1,12,1],
  ['nipQuietT','Swarm: …for this long (s)',0,1,0.05],
  ['oocStride','Stride on won ground (out of a fight) ×',1,2,0.05],
  ['oocDelay','…from this long after your last blow (s)',0,5,0.1],
  ['oocMagnet','…and the loot scoop reaches ×',1,3,0.1],
  ['lastStand','Last stand: a clearing’s last ≤ N non-swarm (≤ ⅓ of its first, at least 2) charge — no leash (0 = off)',0,6,1],
  ['lastRing','…their wait ring shrinks to (u)',20,120,5],
  ['lastCd','…and their attack cooldowns ×',0.2,1,0.05],
  ['lsSpd','…and they move ×',1,2,0.05],
  ['swarmLast','Swarm remnant: a clearing’s last ≤ N swarm frenzy (at least 3; 0 = off)',0,30,1],
  ['swarmLastPct','…or this share of its first swarm, if fewer',0,0.5,0.01],
  ['swarmFrenzy','…and they rush ×',1,2,0.05],
  ['stuckT','Last stand: one stuck this long (s) far off scrambles out',2,15,0.5],
  ['cloneBite','The Pack King’s shadows bite ×',0.2,1,0.05],
  ['tokenCap','Tokens: most foes attacking at once',1,8,1],
  ['tokenBase','Tokens: attackers at ⚔1',1,6,1],
  ['tokenPer','Tokens: +1 attacker per this much danger',1,20,1],
  ['orbitK','Waiting circlers wheel round you at × pace',0,1,0.05],
  ['waitOut','A waiting foe inside its ring eases out at × pace',0,1,0.05],
  ['skirmBack','Skirmisher: most back-off in any 5 s (s)',0,3,0.05],
  ['skirmIn','Skirmisher: steps in to this ring between shots (u)',30,150,5],
  ['stagElite','Stagger: an elite’s bar × its HP',0.1,2,0.05],
  ['stagBoss','Stagger: a boss’s bar × its HP',0.05,0.6,0.01],
  ['stagGrow','Stagger: a boss’s bar + per break',0,1,0.05],
  ['stagMul','Stagger ×',0,3,0.05],
  ['statusTick','Statuses tick every (s)',0.25,1,0.05],
  ['crawlLitFloor','A fight’s light floor (the ambient never darker)',0,1,0.05],
  ['hitStun','Enemy flinch (stun)',0,0.5,0.02],
  ['poise','Flinch poise window',0,1.5,0.05],
  ['hitFreeze','Legacy feel: hit-freeze on the struck foe (s)',0,0.2,0.01],
  ['shakeCap','Screen-kick cap (px)',0,12,0.5],
  ['leash','Aggro leash reach',120,800,10],
  ['inputBuffer','Input buffer: a press in a phase’s last N s fires at the action’s end',0,0.4,0.01],
  ['aimAssist','Aim assist cone ° (keys/pad)',0,90,5],
  ['sleepAim','Shot assist passes a sleeping foe farther than (u)',0,400,10],
  ['brkAssist','Shot assist onto rocks, herbs, ruins & secret doors, cone ° (keys/pad)',0,60,5],
  ['comboWindow','Combo lapses after this idle (s)',0.2,1.2,0.05],
  ['swMoveWind','Swing: move × while winding up & striking',0,1,0.05],
  ['swMoveRec','Swing: move × while recovering',0,1,0.05],
  ['swWindMul','Swing: wind-up ×',0,3,0.05],
  ['swRecMul','Swing: recovery ×',0,3,0.05],
  ['swStepMul','Swing: forward step ×',0,3,0.1],
  ['hsFod','Hit-stop: a swarm hit (s × weapon)',0,0.06,0.005],
  ['hsFoe','Hit-stop: a foe hit (s × weapon)',0,0.15,0.005],
  ['hsHeavy','Hit-stop: crit / heavy / wall slam / multi-kill (s × weapon)',0,0.2,0.005],
  ['hsElite','Hit-stop: an elite kill / BREAK (s)',0,0.3,0.01],
  ['hsBoss','Hit-stop: a boss kill (s, then the slow-mo)',0,0.5,0.01],
  ['hsFoeOnly','Hit-stop: an arrow holds its foe (s)',0,0.15,0.01],
  ['hsBank','Hit-stop bank (s)',0.05,0.5,0.01],
  ['hsRefill','Hit-stop bank refill (s a second)',0.05,1,0.01],
  ['hsWeapMul','Hit-stop × every weapon’s weight',0,2,0.05],
  ['finHsMin','Hit-stop: a finisher’s least (s — even from an empty bank)',0,0.15,0.005],
  ['lightHs','Hit-stop × on the combo’s light beats (1 · 2)',0,2,0.05],
  ['kbSlide','Knockback slide × (0 = the old one-frame shove)',0,3,0.05],
  ['kbFric','Knockback friction /s',4,30,0.5],
  ['pinball','Pinball: a flung body passes on ×',0,1,0.05],
  ['kdTime','Heavy knockdown (s)',0,1.5,0.05],
  ['kdImm','Knockdown immunity after (s)',0,4,0.1],
  ['corpseV','Corpse launch × (0 = dissolve in place)',0,2,0.05],
  ['corpseCap','Most corpses at once',0,80,1],
  ['gibN','Gibs ×',0,3,0.1],
  ['sparkN','Sparks ×',0,3,0.1],
  ['fxCap','Most sparks + gibs at once',80,600,10],
  ['burstOver','Burst apart: a killing blow this × what it had left',1,6,0.1],
  ['burstCap','Bursts: most a 0.1 s (the rest fall as bodies)',0,40,1],
  ['bowlV','Bowling: a flung body this fast (u/s) knocks foes over',100,400,10],
  ['bowlK','Bowling: × the killing blow it carries (≤ ½ a normal’s HP)',0,1,0.05],
  ['bowlMax','Bowling: most foes one body knocks over',0,6,1],
  ['legacyFeel','LEGACY feel (1 = the old swings, freezes, shoves & beeps)',0,1,1],
  ['sfxLegacy','Old beeps (1 = every sound the old way)',0,1,1],
  ['tideRest','Tide: rests at (out of a fight)',0,100,1],
  ['tideDecay','Tide: drift toward its rest / s',0,20,0.5],
  ['skillK','Skills: damage × (every skill’s hit — 1 = 3–5× a basic)',0.5,2,0.05],
  ['crestK','Crest: a damaging skill cast on a FULL Tide bar × (1 = off)',1,2,0.05],
  ['skillHs','Skills: a skill’s first hit freezes the world (1 on · 0 off)',0,1,1],
  ['flaskPer','Flask: kill points a charge',10,120,1],
  ['dashCh','Dash: charges',1,4,1],
  ['dashDist','Dash: distance (u)',20,140,2],
  ['pdPre','Dash: PERFECT window — its last s before the dash ends (PT2 X2)',0,0.16,0.01],
  ['pdPost','Dash: PERFECT window — s after the dash ends',0,0.2,0.01],
  ['hvOn','THE HEAVY: allowed (1 on · 0 off — the ✦ Tree node is still needed: hold Shift / LT to charge, strike when white)',0,1,1],   // (PROJECT STEEL: the Shift charge)
  ['hvTime','THE HEAVY: the charge to full, from the Shift press (s)',0.15,1.5,0.05],
  ['hvMul','THE HEAVY: damage × the finisher’s',0.5,3,0.05],
  ['hvReach','THE HEAVY: reach × the finisher’s',1,2,0.05],
  ['hvKb','THE HEAVY: shove × the finisher’s',0.5,3,0.1],
  ['hvStag','THE HEAVY: stagger × (elites, rares, bosses)',1,4,0.1],
  ['hvMove','THE HEAVY: you move at × while it charges',0,1,0.05],
  ['hvMoveF','THE HEAVY: you move at × once it is full',0,1,0.05],
  ['hvGrace','THE HEAVY: the grace after letting go of Shift at full — a strike still fires it (s)',0,1.5,0.05],
  ['hvMax','THE HEAVY: a full charge held this long lapses (s · 0 = never)',0,10,0.5],
  ['hvStop','THE HEAVY: its freeze (s — fixed, past the hit-stop bank)',0,0.4,0.01],
  ['hvKick','THE HEAVY: its screen kick (px — the cap is shakeCap)',0,8,0.5],
  ['hvZoom','THE HEAVY: its camera punch (whole texels in for 0.25 s · 0 = off)',0,2,1],
  ['hvHs','THE HEAVY: (not read since Project Steel — hvStop is its freeze)',0.5,3,0.1],
  ['hvTide','THE HEAVY: Tide × (replaces the finisher’s 1.5)',0.1,4,0.1],   // (PX RELEASE FIX PRC-R2: min 0.1 — a 0 read as the 1.5 fallback)
  ['splitFan','Split shot fan gap (rad)',0.05,0.5,0.01],
  ['splitRepeat','Split: same-foe extra arrow ×',0,1,0.05],
  ['enemySep','Enemy spacing',0,1.5,0.1],
  ['clearSize','Clearing size ×',0.6,1.8,0.05],
  ['mainShare','⚔3+ isles: share of the clearings on the main trail (the rest are caches)',0.4,1,0.01],
  ['wakeR','Packs: a sleeping pack wakes with you this near its heart (u, + a sightline)',40,300,5],
  ['wakeBusy','Packs: while another pack of its room still fights, it wakes only within wakeR × this (1 = off)',0.2,1,0.05],
  ['packAlertR','Packs: an awake pack wakes its neighbours this near (u, 0 = never)',0,400,10],
  ['dawdleT','Packs: linger this long in a clearing with nothing awake and the nearest pack wakes (s)',4,60,1],
  ['startleT','Packs: startled on waking (s — your blows crit: “Caught napping!”)',0,1.5,0.05],
  ['packLeash','Packs: a foe gives up this far from its pack’s heart (u)',120,800,10],
  ['hordeHp','Horde: swarm HP ×',0.2,1.5,0.05],
  ['hordeIn','Horde: wakes once you’re this far in (× its radius)',0,0.9,0.05],
  ['trailMin','Trail packs: a corridor at least this long (tiles) holds one',4,30,1],
  ['claimHold','Claim beat before naming (s)',0.5,4,0.1],
  ['depthRise','Run arc: danger + by the hoard',0,6,0.5],
  ['depthRamp','Run arc: full rise from danger (0 = always)',0,10,1],
  ['packElites','Elite pack: sure elites',0,6,1],
  ['packDg','Elite pack: from isle danger',1,10,1],
  ['bossTraitDg','Boss affixes: one per this much danger (≥ 1 from boss ⚔3)',2,20,1],
  ['bossHerd','Great Boar: phase-2 herd size (swarm, × 1 + 0.04/danger, cap 10)',0,16,1],
  ['bossEnrage','Great Boar: enraged speed ×',1,2,0.05],
  ['bossSlow','Boss death slow-mo (s)',0,1.5,0.05],
  ['hoardGold','Hoard gold per clearing',0,30,0.5],
  ['hoardRelic','Hoard relics per clearing',0,0.6,0.02],
  ['hoardOre','Hoard ore per clearing (on the ladder)',0,2,0.05],
  ['claimBounty','Claim bounty × danger (real voyage)',0,40,1],
  ['threatPay','Real foes pay XP/loot by threat (0 = flat)',0,1.5,0.05],
  ['koBeatT','KO beat before the card (s, 0 = instant)',0,2,0.05],
  ['trMagic','Rares: MAGIC chance (elites) at danger 1',0,1,0.01],
  ['trMagicLvl','Rares: MAGIC chance + / danger',0,0.1,0.005],
  ['trMagicCap','Rares: MAGIC chance ceiling',0,1,0.05],
  ['trRare','Rares: RARE chance at danger 1',0,1,0.01],
  ['trRareLvl','Rares: RARE chance + / danger (no ceiling but below)',0,0.1,0.005],
  ['trRareCap','Rares: RARE chance ceiling',0,1,0.05],
  ['trMagicDg','Rares: no MAGIC below isle danger',1,10,1],
  ['trRareDg','Rares: no RARE below isle danger',1,10,1],
  ['newMonCap','Isles: most never-met creature kinds (& traits) per landfall',1,14,1],
  ['trGate','Rares: traits arrive by danger × (0 = all from the start)',0,2,0.1],
  ['eliteBudget','Elites: pack/cache/warden elites count against the danger share (0 = on top)',0,1,0.05],
  ['tr3Lvl','Rares: a 3rd trait from danger',1,20,1],
  ['tr4Lvl','Rares: a 4th trait from danger',1,30,1],
  ['trHpMagic','Rares: MAGIC HP × (on the elite’s)',1,3,0.05],
  ['trHpRare','Rares: RARE HP × (on the elite’s)',1,4,0.05],
  ['trXpMagic','Rares: MAGIC XP ×',1,6,0.25],
  ['trXpRare','Rares: RARE XP ×',1,10,0.25],
  ['trHaste','Trait Hasty: extra chase speed',0,120,2],
  ['trSpines','Trait Spined: death spines',0,24,1],
  ['trVenomCD','Trait Venomous: fan every (s)',0.8,8,0.1],
  ['trSummonCD','Trait Summoning: raise every (s)',1,15,0.5],
  ['trSummonMax','Trait Summoning: most raised',0,8,1],
  ['trLeech','Trait Leeching: heal × max HP / bite',0,0.4,0.01],
  ['trStone','Trait Stoneskin: damage cut (till its bar breaks)',0,0.9,0.05],
  ['trFrenzy','Trait Frenzied: tempo × below half HP',1,3,0.05],
  ['trTrailCD','Trait Burning/Frost: trail every (s)',0.2,4,0.1],
  ['itNorm','Gear drop: a normal foe’s item chance',0,0.2,0.005],
  ['itNormDw','Gear drop: share of a normal’s items that are plain Driftwood',0,1,0.05],
  ['itElite','Gear drop: an elite’s item chance',0,1,0.01],
  ['itMagic','Gear drop: a MAGIC foe’s item chance',0,1,0.01],
  ['itRare','Gear drop: a RARE foe’s item chance',0,1,0.05],
  ['itCache','Gear drop: a cache’s item chance (else 2 cut gems)',0,1,0.05],
  ['itPearlW','Gear drop: the Pearl tier’s weight × (0 = no Pearls)',0,3,0.1],
  ['itGrab','Gear: items come to hand within (units)',12,120,2],
  ['caveStep','Cave: danger + per floor (past the first cvEase floors)',0.5,3,0.5],
  ['cvStep0','Cave: danger + per floor on the first cvEase floors (DE1)',0,2,0.5],
  ['cvEase','Cave: floors that ease in at cvStep0 (0 = a full ring from Floor 1 · DE1)',0,5,1],
  ['cvMin','Cave depth: the fewest floors a cave has (DE1)',1,4,1],
  ['cvD0','Cave depth: base floors',-3,6,0.5],
  ['cvDdg','Cave depth: + per isle danger (up to the knee)',0,2,0.05],
  ['cvDknee','Cave depth: the knee — past this isle danger … (DE1)',1,20,1],
  ['cvDslope','Cave depth: … + per isle danger past the knee (0.9 = no knee · DE1)',0,2,0.05],
  ['cvDtier','Cave depth: + per biome tier',0,4,0.1],
  ['cvDsize','Cave depth: + for a big isle',0,4,0.1],
  ['cvDjit','Cave depth: per-isle wobble ±',0,3,0.1],
  ['cvBossEvery','Cave: a lord of the deep every N floors',2,10,1],
  ['cvBossBottom','Cave: the bottom is a lord’s floor from depth',1,12,1],
  ['cvLordShallow','Cave bottom lords: 0 the lair roll for all · 1 a 3–4-floor cave keeps its lord · 2 every cave 3+ deep (owner Q1 · DE2)',0,2,1],
  ['cvLairP','Cave bottom: a Lord’s Lair this often (a cave 3+ deep · DE2)',0,1,0.05],
  ['cvRooms','Cave floor: chambers past the landing (avg — 2.7 = 2 or 3, mostly 3)',2,6,0.1],
  ['cvNodes','Cave floor: nodes × a surface clearing’s',1,4,0.25],
  ['cvRoomSize','Cave floor: chamber size ×',0.5,1.5,0.05],
  ['cvPack','Cave floor: a pack’s count ×',0.3,2,0.05],
  ['cvNewMon','Cave floor: + strange-monster share',0,0.5,0.01],
  ['cvElite','Cave floor: + elite chance',0,0.5,0.01],
  ['cvRareDg','Cave floor: rares roll as danger +',0,10,1],
  ['cvWarden','Cave floor: sure elites in the last chamber',0,6,1],
  ['cvWakeIn','Cave room: its nearest pack wakes this far inside the doorway (u)',0,80,2],
  ['cvHeartMin','Cave room: no pack sleeps nearer its doorway than (u)',40,160,5],
  ['cvCavern','Cave chamber odds: cavern (stalagmites)',0,100,5],
  ['cvHall','Cave chamber odds: pillared hall',0,100,5],
  ['cvLake','Cave chamber odds: lake & bridge (from floor 2)',0,100,5],
  ['cvGrotto','Cave chamber odds: grotto & side pockets',0,100,5],
  ['cvRift','Cave chamber odds: rift & rope bridges (from floor 3 · PT1 K10a)',0,100,5],
  ['cvFlood','Cave chamber odds: a Flooded Gallery (from floor 4 · DE4)',0,100,1],
  ['cvMine','Cave chamber odds: the Old Workings (from floor 4 · DE4)',0,100,1],
  ['cvOldFade','Cave chambers: the old five fade × (1 − this) a floor from floor 5 (DE4)',0,0.2,0.01],
  ['cvRoomsF','Cave floor: chambers + per floor down (DE4)',0,0.6,0.05],
  ['cvBotRoom','Cave floor: chambers + on the bottom floor (DE4)',0,2,1],
  ['cvRoomsMax','Cave floor: chambers at most (DE4)',3,8,1],
  ['cvSizeF','Cave floor: chamber size + per floor down (≤ 10 floors · DE4)',0,0.05,0.005],
  ['cvGrow0','Cave floor: floors 1–N stay exactly as before the floors grew (0 = the design · 3 = Floors 1–3 untouched · SD5)',0,3,1],
  ['sanctPre','Cave bottom: bake the open sanctum while its door is sealed (1 on · 0 off · DE4)',0,1,1],
  ['cvCrystal','Cave chamber odds: a Crystal Cathedral (from floor 5 · DE5)',0,100,1],
  ['cvFungal','Cave chamber odds: a Fungal Grotto (from floor 6 · DE5)',0,100,1],
  ['cvMagma','Cave chamber odds: a Magma Vault (from floor 7 · 4 on the fire shores · DE5)',0,100,1],
  ['cvShardR','Crystal Cathedral: a broken crystal’s ring — its reach (u · DE5)',16,90,1],
  ['cvShardT','Crystal Cathedral: the ring holds foes this long, then shatters (s · DE5)',0.2,1.5,0.05],
  ['cvFrond','Fungal Grotto: its floor’s share in fronds (DE5)',0,0.6,0.05],
  ['cvLightCap','Cave floor: the deep rooms’ lights a frame at most (DE5)',4,40,1],
  ['propK','Props: crates & powder kegs a clearing × (0 = none)',0,3,0.1],
  ['kegFuse','Powder keg: its fuse once struck (s)',0.3,1.5,0.05],
  ['kegR','Powder keg: blast radius (u)',24,80,2],
  ['kegDmg','Powder keg: on you × a blow (1.5 ≈ 12% of par life)',0,3,0.05],
  ['kegFoe','Powder keg: on a foe × a normal’s HP (at its heart)',0,3,0.05],
  ['coverHp','Cover: blows to break it (PT1 K7b)',1,10,1],
  ['pillarHp','Cracked pillar: blows to topple it (PT1 K7b)',1,10,1],
  ['trapK','Traps: spike plates, dart traps & loose rocks a clearing × (0 = none · PT1 K8)',0,3,0.1],
  ['spikeDmg','Spike plate: on you × a blow (0.8 ≈ 6% of par life)',0,2,0.05],
  ['spikeFoe','Spike plate: on a foe × a normal’s HP (+ a 30% Bleed)',0,1.5,0.05],
  ['dartDmg','Dart trap: a dart on you × a blow (+ venom)',0,2,0.05],
  ['dartFoe','Dart trap: a dart on a foe × a normal’s HP (+ 30% poison)',0,1,0.05],
  ['rockDmg','Loose rocks: a rock on you × a blow (heavy)',0,3,0.05],
  ['rockFoe','Loose rocks: a rock on a foe × a normal’s HP (floored)',0,2,0.05],
  ['ringOutV','Ring-out: a foe flung this fast (u/s) into lava or deep water falls in',30,200,5],
  ['grassK','Tall grass: × a fight clearing’s share of it (0 = none · PT1 K9a)',0,3,0.1],
  ['hideDelay','Tall grass: still (no blow) this long → hidden (s)',0,2,0.05],
  ['hideR','Tall grass: a foe this near still sees you (u)',20,200,5],
  ['hideLost','Tall grass: a farther foe loses you after (s)',0.2,4,0.1],
  ['shalSlow','Shallows: pace × for you & every foe afoot (PT1 K9b)',0.3,1,0.01],
  ['shalZap','Shallows: a storm blow leaps to ≤ 4 foes in the water × the blow',0,1,0.05],
  ['fetidDmg','Fetid pool: on you × a blow every 0.5 s (+ poison)',0,0.5,0.01],
  ['fetidFoe','Fetid pool: a woken foe loses × its life every 0.5 s',0,0.2,0.01],
  ['iceFric','Ice: a struck foe’s friction × (0.35 = it skates ~3× as far)',0.1,1,0.05],
  ['skateV','Ice: a foe flung this fast (u/s) skates helpless till it slows (G9 fix)',60,300,5],
  ['setK','Set pieces: × an isle’s ravines, ledges, temples & arenas (0 = none · PT1 K10a/b)',0,3,0.1],
  ['highDmg','High ground: your shot from a ledge on a foe below × (1 + this)',0,1,0.05],
  ['highRng','High ground: your shot from a ledge flies × (1 + this) as far',0,0.5,0.05],
  ['ringReward','Arena ring won: its champions’ purse — an item ≥ Sea-glass, a gem, ×1.5 coin (1 = on · PT1 K10b)',0,1,1],
  ['cvChest','Deep chest: × a surface hoard',0,2,0.05],
  ['cvRen','Cave renown: per floor reached',0,30,1],
  ['cvRenBoss','Cave renown: per lord beaten',0,100,5],
  ['cvRenBot','Cave renown: a bottom’s find claimed × (1 + 0.1 × its danger · DE2)',0,100,5],
  ['cvRenDg','Cave renown: × (1 + this × floor danger)',0,1,0.05],
  ['cvBossXp','Lord XP ×',1,6,0.25],
  ['cvXp','Cave floors: XP ×',0.2,2,0.05],
  ['cvXpF','Cave floors: XP × per floor down, compounding (DE1)',1,1.2,0.01],
  ['cvLootF','Cave floors: coin, gems, ore & relics × per floor down, compounding (DE1)',1,1.2,0.01],
  ['cvBandF','Cave floors: ore, cuts & geodes read +1 danger every N floors (0 = off · DE1)',0,10,1],
  ['cvIt1','Deep chest: its item ≥ Sea-glass from this floor (DE1)',1,20,1],
  ['cvIt2','Deep chest: its item ≥ Coral from this floor (DE1)',1,30,1],
  ['cvBossAdds','Lords: most adds at once',2,24,1],
  ['cvBroodCD','Broodmother: phase-3 crabling waves every (s)',2,12,0.5],
  ['cvBroodWave','Broodmother: crablings a seal / a wave',0,8,1],
  ['cvShellT','Broodmother: sealed shell (s)',0.5,5,0.1],
  ['cvShellCD','Broodmother: seals again every (s)',4,20,0.5],
  ['cvHowlCD','Pack King: howls every (s — phase 3 ×⅔)',2,14,0.5],
  ['cvClones','Pack King: shadows a howl keeps (phase 3 +1)',0,6,1],
  ['cvTideCD','Drowned: tide ring every (s)',1.5,8,0.1],
  ['cvRaiseCD','Drowned: raises every (s)',1.5,10,0.5],
  ['cvLight','Cave: your light radius',40,300,5],
  ['cvDark','Cave: darkness',0,0.95,0.01],
  ['cvDarkF','Cave: + darkness per floor',0,0.05,0.002],
  ['cvLip','Cave: chamber edges glow faintly past your light (0 = off)',0,1,0.05],
  ['wayFlash','Wayfinding: pointer shines after a secure (s)',0,15,0.5],
  ['wayChevA','Wayfinding: idle pointer at you (alpha, 0 = off)',0,1,0.05],
  ['wayLook','Wayfinding: needle looks down the path (tiles)',1,20,1],
  ['wayStrag','Wayfinding: straggler arrows at ≤ N foes left',0,10,1],
  ['threatOn','Off-screen threat chevrons (1 = on)',0,1,1],
  ['threatSpit','Threat chevrons: spit landing within (s)',0.2,4,0.1],
  ['threatReach','Threat chevrons: foes within (units)',150,1200,10],
  ['ledgerSpd','Results ledger pace × (0 = instant)',0,3,0.1],
  ['lvlGrace','Level-up grace (s)',0,1.5,0.05],
  ['feedLife','Pickup feed: a line lasts (s)',0.5,6,0.1],
  ['magnetR','Magnet reach',40,170,5],
  ['dashCool','Dash: a charge\'s recharge (s)',0.3,2.5,0.1],
  ['camView','Crawl camera: view height (world units)',200,380,5],
  ['camLead','Crawl camera: look-ahead (× view)',0,0.3,0.01],
  ['camNorth','Crawl camera: sits north of you (× view)',0,0.15,0.01],
  ['camFight','Crawl camera: zoom-out in a busy fight (+ view · 0 = off, pixels exact)',0,0.4,0.01],
  ['camFightN','Crawl camera: …when more than N foes fight you',2,40,1],
  ['pixRows','Crawl pixels: texel rows on screen (lower = chunkier)',140,400,10],
  ['pScale','Explorer: drawn size × (the old oval body · the pixel explorer’s body stays 1×, only his weapon, off hand & shadow follow it · hitbox unchanged)',1,1.6,0.05],
  ['pRing','Explorer: your cream ring (alpha, 0 = off — drawn over the crowd, under you)',0,1,0.02],
  ['pXray','Explorer: a cream x-ray rim when foes crowd over you (1 = on)',0,1,1],
  ['landFade','Landfall / new floor: fade in from black over N frames while the view bakes (0 = cut)',0,40,1],
  ['fodderMute','Swarm fodder: desaturated by',0,1,0.05],
  ['terrEdge','Ground: edge wobble (organic clearing edges · 0 = the tile line)',0,0.35,0.01],
  ['terrDither','Ground: dither between shades',0,1.2,0.05],
  ['terrPatch','Ground: patch contrast ×',0,2.5,0.05],
  ['terrDecal','Ground: decals (grass, pebbles, flowers…) ×',0,3,0.1],
  ['terrAO','Ground: edge shadow ×',0,2.5,0.05],
  ['terrTrail','Trail: half-width (world units)',2,14,0.5],
  ['terrTrailFade','Trail: fades into a clearing over (world units)',10,200,5],
  ['terrTrees','Forest: tree spacing × (lower = denser)',0.6,1.8,0.05],
  ['terrBeach','Shore: beach depth (tiles)',0.5,5,0.1],
  ['terrDress','Ground: rim dressing (logs, bones, shells…) ×',0,3,0.1],
  ['terrCliff','Caves: cliff-face height (world units)',4,24,1],
  ['terrBudget','Ground: pre-bake budget (ms per frame)',0,6,0.5],
  ['lightOn','Light: lanterns & darkness ashore (1 = on · 0 = the old flat wash)',0,1,1],
  ['lantern','Light: your lantern’s reach at night (world units)',40,300,5],
  ['lanternFlick','Light: lantern flicker',0,1.5,0.05],
  ['nightLit','Night: ambient light at midnight (lower = darker)',0.1,1,0.02],
  ['duskWarm','Dusk & dawn: warm light ×',0,2,0.05],
  ['lightBands','Light: falloff steps (pixel rings)',2,8,1],
  ['lightDither','Light: dither across a step (0 = hard rings)',0,1,0.05],
  ['flareBloom','Light bursts (level-up, legendary, lava flare): glow by day ×',0,1,0.05],
  ['eyeGlow','Night & caves: glowing eyes past your light (×, 0 = off)',0,2,0.05],
  ['cvLightF','Cave: your light shrinks × per floor',0,0.1,0.005],
  ['cvLightMin','Cave: …never below × your light',0.2,1,0.05],
  ['cvTorch','Cave: wall torches per chamber on floor 1',0,6,1],
  ['cvTorchF','Cave: − torches per floor down',0,1,0.05],
  ['cvTorchR','Cave: a torch’s reach (world units)',20,160,2],
  ['ambLife','Ambient life: particles × (0 = off)',0,2,0.1],
  ['rainAsh','Weather ashore: rain ×',0,2,0.1],
  ['fogAsh','Weather ashore: fog ×',0,2,0.05],
  ['markCap','Aftermath: ground marks kept per isle (0 = off)',0,600,20],
  ['markSize','Aftermath: ground mark size ×',0.5,2,0.05],
  ['deathDissolve','Kills: death dissolve (s, 0 = off)',0,0.8,0.02],
  ['claimZoom','Claim: camera push-in (1 = on)',0,1,1],
  ['claimRay','Claim: light shaft strength',0,2,0.05],
  ['bossIntro','Boss intro: letterbox & light pulse (1 = on)',0,1,1],
  ['bossIntroT','Boss intro: hold (s)',0.5,4,0.1],
  ['hudScale','HUD ashore: size ×',0.7,1.6,0.05],
  ['mmTiles','Local map: tiles across (lower = closer)',16,90,2],
  ['mmSize','Local map: size ×',0.6,1.6,0.05],
  ['mmFade','Local map: see-through while a foe is under it (alpha)',0.1,1,0.05],
  ['floatJit','Damage numbers: fan out ×',0,2.5,0.1],
  ['floatMerge','Damage numbers: hits on one foe merge within (s)',0,0.4,0.02],
  ['streakMin','Kill streak counter: shows from N kills',2,20,1],
  ['tutOn','Lesson strips: first landfall / chest / passive point / the Tide (1 = on)',0,1,1],
  ['tutHold','Lesson strips: the landfall one holds (s) past your first kill',0,20,1],
  ['bogSlow','Newer shores · Mire: a bog pool slows steps to ×',0.2,1,0.05],
  ['bogPools','Newer shores · Mire: bog pools per clearing ×',0,3,0.1],
  ['pitN','Newer shores · Dunes: sinking-sand pits per fight ×',0,3,0.1],
  ['pitR','Newer shores · Dunes: a pit\'s reach (world units)',12,60,1],
  ['pitSlow','Newer shores · Dunes: in a pit, steps ×',0.2,1,0.05],
  ['pitPull','Newer shores · Dunes: a pit\'s pull toward its eye (units/s)',0,120,2],
  ['pitSpin','Newer shores · Dunes: the pit\'s swirl (frames/s)',0,16,1],
  ['gustEvery','Newer shores · Dunes: a gust every ~ (s)',3,40,1],
  ['gustWarn','Newer shores · Dunes: the sand streams first for (s)',0,3,0.1],
  ['gustT','Newer shores · Dunes: a gust lasts (s)',0.3,5,0.1],
  ['gustForce','Newer shores · Dunes: a gust\'s shove on arrows & venom (units/s²)',0,700,10],
  ['bambooPer','Newer shores · Bamboo: floor tiles per bamboo stand (0 = none)',0,120,2],
  ['ambushShare','Newer shores · Bamboo: share of the real foes hiding in the canes',0,1,0.05],
  ['ambushR','Newer shores · Bamboo: they spring out when you\'re within (units)',20,160,2],
  ['ambushBeat','Newer shores · Bamboo: the beat before an ambusher strikes (s)',0,1.5,0.05],
  ['ambushMax','Newer shores · Bamboo: a hider springs out this long after the rest of its clearing is down (s)',1,30,1],
  ['ambushDg','Newer shores · Bamboo: ambushes from isle danger',0,10,1],
  ['puffN','Newer shores · Mushroom: puffballs per clearing ×',0,3,0.1],
  ['puffTrig','Newer shores · Mushroom: a puffball swells when you\'re within (units)',6,60,1],
  ['puffSwell','Newer shores · Mushroom: its swell, before the burst (s)',0.2,2,0.05],
  ['puffCD','Newer shores · Mushroom: it regrows after (s)',2,40,1],
  ['sporeR','Newer shores · Mushroom: a spore cloud\'s reach (units)',16,90,1],
  ['sporeLife','Newer shores · Mushroom: a spore cloud lingers (s)',0.5,8,0.1],
  ['sporeTick','Newer shores · Mushroom: poison ticks every (s)',0.2,1.5,0.05],
  ['sporeDmg','Newer shores · Mushroom: a poison tick bites × (a swarm nip)',0,3,0.05],
  ['sporeHang','Newer shores · Mushroom: slowed blows linger after the cloud (s)',0,3,0.1],
  ['sporeAtk','Newer shores · Mushroom: blows recover at × while spored',0.2,1,0.05],
  ['sporeFoe','Newer shores · Mushroom: a tick takes this share of a foe\'s max HP',0,0.2,0.005],
  ['lavaRivers','Newer shores · Caldera: lava rivers per isle',0,8,1],
  ['emberEvery','Newer shores · Caldera: a burning rock falls every ~ (s, in a fight)',1,20,0.5],
  ['emberWarn','Newer shores · Caldera: its shadow grows for (s)',0.4,3,0.05],
  ['emberR','Newer shores · Caldera: where it lands, it burns within (units)',10,60,1],
  ['emberDmg','Newer shores · Caldera: its blow on you ×',0,4,0.1],
  ['emberFoe','Newer shores · Caldera: its blow on foes × your slash',0,5,0.1],
  ['emberH','Newer shores · Caldera: it falls from (units up)',40,260,5],
];
function buildIslandTune(){ const host=document.getElementById('tuneIslandRows'); if(!host) return; host.innerHTML='';
  ITUNE_DEF.forEach(([k,label,min,max,step])=>{ const row=document.createElement('div'); row.className='row';
    row.innerHTML='<label>'+label+' <b id="iv_'+k+'">'+ITUNE[k]+'</b></label><input type="range" id="is_'+k+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+ITUNE[k]+'">';
    host.appendChild(row);
    row.querySelector('input').addEventListener('input',e=>{ ITUNE[k]=parseFloat(e.target.value); document.getElementById('iv_'+k).textContent=ITUNE[k]; if(k.indexOf('cv')===0||k==='caveStep') renDirty=true; dangerVer++;
      if(k==='camView'||k==='pixRows'){ if(islPixOn) setIslPix(); } if(k==='camView'||k==='pixRows'||k==='pScale'||k==='fodderMute') escFlush(); if(k==='artSpr'){ escFlush(); PSPR.m.clear(); PSPR.wi=0; SPR2.m.clear(); }   // (a new grid → every look re-bakes)
      queueSave(); });   // (cave renown re-derives · every isle's ~foes & verdict re-reckon)
  });
}
