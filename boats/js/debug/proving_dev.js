"use strict";
/* FILE: js/debug/proving_dev.js
The Proving Grounds (DEV trial isles, the Crawl Board, the ephemeral test captain) and the DEV panel (give, spawn,
feel, sound board, jukebox rows, training-dummy readouts). Original lines 40571-41043 (build 5109cd5), moved verbatim.
Entry points: ptBoot, ptNewChar, ptCore, openPtMenu, closePtMenu, ptBoardBack, renderCrawlBoard, ptBoardAct, ptLand,
  ptPortAct, ptQuit; devShow, devTick, renderDev, devAct, devCastAbort, actDrop, legacyToggle, copyTuning;
  sndMapCheck, sndRender, sndCal, sndAll; dummyHit, drawDummies, beatDraw.
Owns: ptTune0, PT_KITS, DEV_KINDS, DEV_TIERS, DEV_SLOTS, devIt, DEV_TYPES, DEV_WIC, DEV_WHY, devGem, DEV_FEEL, devSig,
  devPl, SND_OLD, devSnd, sfxGRpk, SNDL, devMus, SND_CAL_DB, SND_CAL_HIT, SND_CAL_HITS, devSh, HAZ_KINDS, devHz,
  plus all the functions above.
Reads from elsewhere (at runtime only): ITUNE, LTUNE, PTUNE, DEFAULT_ITUNE, the character state (plvl, pxp, EQ, BAG,
  BAR, GEMS), player, ISL, mode, enemies, ctx; ISL_LVL, ptMode and ptestOpen (original line 40350 (build 5109cd5));
  PTB (original line 40355 (build 5109cd5)); PT_SFT (original line 40358 (build 5109cd5)); ptView, ptKit, ptLv,
  devGod and devOn (original line 40359 (build 5109cd5)); the audio graph (actx, SFX2, SNDX, the sfx buses), MUS and
  MUS_T; last (original line 41052 (build 5109cd5)); titlePeek (original line 42162 (build 5109cd5)) and the
  tuning-panel builders such as buildTunePanel (original line 41379 (build 5109cd5)), all in later parts.
Load-time statements: none (only function declarations and let/const with literal values).
Its buttons #ptestBtn and #ptBack are wired at load by the inline part after this file (original line 41048 and
  original line 41049 (build 5109cd5)).
sndMapCheck (original line 40770 (build 5109cd5)) reads document.scripts; after the split it scans the inline parts
  only (DEV only, lead decision D1). Original line 40589 (build 5109cd5) holds backslash-u escape text on purpose.
*/
/* a synthetic trial isle at a chosen level — bigger, rarer, nastier as the level climbs (o.duel: the Crawl Board's 'Boss duel' — genIsland reads core.ptDuel) */
function ptCore(L,seed,o){
  const rng=mulberry32(seed>>>0);
  const r=44+(L-1)*9+rng()*26;
  const tiers = L<=3?[0] : L<=5?[0,1] : L<=6?[1] : L<=8?[1,2] : [2];
  const cand=BIOMES.filter(b=>tiers.indexOf(b.tier)>=0);
  const biome0=cand[(rng()*cand.length)|0], biome=ptBiomeI>=0&&BIOMES[ptBiomeI]?BIOMES[ptBiomeI]:biome0;   // (the Crawl Board's shore picker overrides the draw)
  return {x:WORLD/2, y:WORLD/2, r, amp:1, idx:100000+L*977+(seed%50021), name:'Trial '+L,
    found:true, port:false, lvl:L, biomeObj:biome, ptDuel:!!(o&&o.duel), ptFeat:(o&&o.feat)||null};   // (PT1 K7a ptFeat: the Crawl Board's Feature — 'none' · 'props' (genPropBodies reads it; K10a/K11 add the row)
}
let ptTune0=null;                                    // the tuning blocks as they stood before the Proving Grounds — ptQuit puts them back (G1 fix: the Legacy toggle, the DEV Feel row & the sliders never leak into a voyage)
function ptBoot(){
  if(!ptTune0) ptTune0={I:Object.assign({},ITUNE), L:Object.assign({},LTUNE), P:Object.assign({},PTUNE)};
  if(!PT_HARBOUR._pb) PT_HARBOUR._pb=BIOMES.find(b=>b.key==='meadow')||BIOMES[0];   // (the Proving Harbour's land: a meadow town — slPortBiome reads _pb)
  if(started) return;
  if(!cores.length) titlePeek();   // (SD7 FIX SD7VB-3: pressed before the title's peek world was built — build it now)
  if(!crew.length) genCrew();
  buildTunePanel(); syncTune(); buildPlaytest(); buildIslandTune(); buildFishTune(); buildWhaleTune(); buildPortTune(); buildLvlTune(); buildPlayerTune();
  document.getElementById('mute').textContent=audioOn?'\ud83d\udd0a':'\ud83d\udd07';
  started=true; paused=true; last=performance.now();
  initAudio();
}
/* ---- the harbour's card (#ptest): the Crawl Board, or the starter-kit choice (§13) ---- */
function openPtMenu(view){ ptView=view||'board'; ptestOpen=true; renderCrawlBoard(); document.getElementById('ptest').classList.remove('hidden'); padSetFocus(null);
  if(ptView==='board' && inDev==='pad'){ const b=document.querySelector('#ptBody [data-cb="land"]'); if(b) padSetFocus(b); } }   // (the pad lands on [Land] — A lands, the stick walks up to the pickers)
function closePtMenu(){ ptestOpen=false; const el=document.getElementById('ptest'); el.classList.add('hidden'); if(padFocusEl && el.contains(padFocusEl)) padSetFocus(null); }
function ptBoardBack(){ if(ptView==='kit' && !ptKit){ ptPickKit('sword'); return; } closePtMenu(); }   // Esc / B: the board closes · the kit card takes the cutlass
const PT_KITS=[{k:'sword', ic:'🗡', n:'Cutlass & Buckler', sk:'Whirl', d:'the sword combo · a buckler blocks 15%'},   // §3's starting kits: the gear (C4b/C5a) & their gems (C5b: slot 2 the kit's skill, slot 3 Seafoam Rush)
  {k:'bow', ic:'🏹', n:'Shortbow & Quiver', sk:'Volley', d:'arrows at range · the quiver: +10% projectile damage'},
  {k:'staff', ic:'✧', n:'Driftwood Staff', sk:'Rime Burst', d:'frost bolts that Chill & build a Freeze · the burst knocks down'}];
function ptPickKit(k){ const K=PT_KITS.find(q=>q.k===k); if(!K || K.off) return; ptKit=k; sfx('ui_equip'); starterKit(k); kitGems(k);   // (C4b: the kit's items are worn — the weapon in hand is the main hand's)
  toast(K.ic+'  '+K.n, 'your starting kit  ·  L1  ·  🪙 '+cargo.gold+'  ·  🧪 flask '+flask.ch+' · '+draughts.h+' draughts'); closePtMenu(); }
function ptNewChar(){                       // a fresh, ephemeral test captain (§13): L1, 500 g, 3 draughts, the starter-kit card — never saved (ptMode guards doSave)
  ptMode=true;
  plvl=1; pxp=0; TALLOC={HELM:1}; tpx=0; tpxB={}; treeVer++; TSUM=null; UPG={}; para=0; paraXp=0; ptPar=null; ptLv=1; devGod=false; devOneHit=false; prosp={lv:1, xp:0};   // (a new captain: God & 1-hit off · a fresh Prospector)
  museum=[]; slay={}; GREN=0; gdid={}; musFlash=null; pendingPay=[]; ptLandN=0; exnPend=null;   // (C7c: the grounds' museum & bounties are session-only — the harbour pays a bounty when you dock · C8b: its landfalls count afresh)
  cargo={gold:500}; POUCH={}; HOLD=hold0(); tripGold=0; pouchVer++; flask={ch:3, cap:0, pot:0, ref:0, pts:0}; draughts={h:3, g:0}; elixirs={}; elix=null; ptTopDg=0; fed=0; well={}; spoils={};   // (an empty Hold — the harbour's own, session-only · C7b: no elixirs, no claims yet)
  EQ=eq0(); BAG=bag0(); pity=0; gSel=null; Object.assign(EQ,kitItems('sword')); kitGems('sword'); gFirst=false; bFirst={}; barSel=null; BEST=best0(); fcards=[]; ptCaveRec={}; ptLast='';   // a fresh test hand: the cutlass kit until the card's pick, nothing met, no trial cave explored
  recalcStats(); player.maxhp=eMaxHp(); player.hp=player.maxhp;
  ptKit=null; openPtMenu('kit');
}
function renderCrawlBoard(){ const $=id=>document.getElementById(id), body=$('ptBody'); if(!body) return;
  const band=youBand(), xn=xpToNext(plvl);
  $('ptStat').innerHTML='<div class="ptstat"><span>🧬 <b>Lv '+plvl+'</b></span><span class="ptxp" title="'+Math.round(pxp)+' / '+xn+' XP"><i style="width:'+Math.round(100*Math.min(1,pxp/xn))+'%"></i></span>'+
    '<span>❤ <b>'+Math.round(player.hp)+' / '+player.maxhp+'</b></span><span>🪙 <b>'+cargo.gold+'</b></span><span>🧪 <b>'+flask.ch+' / '+flaskCap()+(draughts.h+draughts.g?' +'+(draughts.h+draughts.g):'')+'</b></span>'+
    '<span title="the danger you are built for (youBand)">⚔ band <b>'+band.toFixed(1)+'</b></span>'+(ptPar?'<span class="ptpts">PAR ⚔'+ptPar.d+'</span>':'')+(treePts()>0?'<span class="ptpts">✦ '+treePts()+' pts</span>':'')+'</div>';
  if(ptView==='kit'){ $('ptTitle').textContent='⚔ Choose your kit'; $('ptSub').textContent='a fresh captain for the Proving Grounds — nothing here touches your voyage';
    body.innerHTML='<div class="cbkit">'+PT_KITS.map(K=>'<button class="ptcard" data-kit="'+K.k+'"'+(K.off?' disabled':'')+'><b>'+K.ic+' '+K.n+'</b><small>slot 2: '+K.sk+'<br>'+K.d+'</small></button>').join('')+'</div>'+
      '<div class="cbinfo">everyone: a Sailcloth Coat · the flask (3 charges) · 3 Healing Draughts · Seafoam Rush in slot 3 (key 1)</div>';
    body.querySelectorAll('[data-kit]').forEach(b=>{ b.onclick=()=>ptPickKit(b.dataset.kit); });
    $('ptFootMsg').textContent='L1 · 🪙 '+cargo.gold+' · 🧪 flask '+flask.ch+' · '+draughts.h+' draughts'; $('ptBack').textContent='Take the cutlass (Esc)'; return; }
  $('ptTitle').textContent='⚔ The Crawl Board'; $('ptSub').textContent='pick a shore, a danger & a depth — then land · the ledger brings you back to the harbour';
  const d=PTB.d, f=PTB.f, cave=PTB.cave; if(PT_SEEDS[d]==null) PT_SEEDS[d]=(Math.random()*1e9)|0; const seed=PT_SEEDS[d];
  const c=ptCore(d,seed,{duel:PTB.duel}), bio=c.biomeObj, fdg=cave?caveDg(c,f):d, v=verdictOf(fdg,band,cave?sizeX(floorFoes(c,f)):PTB.duel?0:sizeX(isleFoes(c)));   // (the sea's own verdict colours, against this captain)
  const row=(lab,inner)=>'<div class="cbrow"><span class="cblab">'+lab+'</span>'+inner+'</div>', btn=(a,t,cls,tip)=>'<button class="sbtn '+(cls==null?'ghost':cls)+'" data-cb="'+a+'"'+(tip?' title="'+tip+'"':'')+'>'+t+'</button>';
  let h=row('Shore', btn('bm-','◀')+'<span class="cbval">'+(ptBiomeI>=0?BIOMES[ptBiomeI].icon+' '+BIOMES[ptBiomeI].name:'🎲 Auto')+'<small>'+(ptBiomeI>=0?TIER_NAME[BIOMES[ptBiomeI].tier]+' shores':'this danger draws '+bio.icon+' '+bio.name)+'</small></span>'+btn('bm+','▶'));
  h+=row('Danger', btn('d-5','◀◀','ghost','−5')+btn('d-','◀')+'<span class="cbval" style="color:'+v.col+'">'+v.glyph+d+'  '+v.word.toUpperCase()+'<small>'+(cave?'floor '+f+' runs ⚔'+fdg+' · ':'')+'your band ⚔'+band.toFixed(1)+'</small></span>'+btn('d+','▶')+btn('d+5','▶▶','ghost','+5'));
  h+=row('Where', btn('surf',(cave?'':'✓ ')+'Surface',cave?'ghost':'')+btn('cave',(cave?'✓ ':'')+'▼ Cave floor',cave?'':'ghost')+
    (cave?btn('f-','◀')+'<span class="cbval" style="min-width:74px">▼ '+f+'<small>'+((c.cvMaxOv=Math.max(caveMax(c),f), ptBotApply(c,f), [caveBossFloor(f,caveMax(c),c)?'☠ a lord of the deep':'', caveMax(c)===f?'⬇ the bottom':'']).filter(Boolean).join(' · ')||'a floor')+'</small></span>'+btn('f+','▶')+btn('f+10','▶▶','ghost','+10'):''));   // (SD3 FIX: the floor's label reads the landing's own cave — startCaveTest's cvMaxOv max(caveMax, F), then the Bottom row — so a floor past the isle's depth is its bottom, and its lord is the landing's)
  if(cave){ const CF=PT_CVF[PTB.cf]||PT_CVF.auto;   // (PT1 K6) the cave Feature: every chamber that can is that archetype (the last chamber: a cavern or a hall)
    h+=row('Feature', btn('cf-','◀')+'<span class="cbval" style="min-width:150px">'+CF[0]+'<small>'+CF[1]+'</small></span>'+btn('cf+','▶'));
    const BT=PT_BOT[PTB.bot]||PT_BOT.auto, mk=ptMkb(); h+=row('Bottom', btn('bt-','◀')+'<span class="cbval" style="min-width:150px">'+BT[0]+'<small>'+BT[1]+'</small></span>'+btn('bt+','▶')+btn('mkb',(mk?'✓ ':'')+'⬇ make this floor the bottom',mk?'':'ghost','Floor '+f+' as the cave’s last — its sealed door & its find')); }   // (DEPTHS DE3) the bottom's find, forced
  else if(!PTB.duel){ const SF=PT_SFT[PTB.feat]||PT_SFT.auto;   // (PT1 K10a) the surface Feature: Auto · None · Props! · a set piece forced in
    h+=row('Feature', btn('sf-','◀')+'<span class="cbval" style="min-width:150px">'+SF[0]+'<small>'+SF[1]+'</small></span>'+btn('sf+','▶')); }
  h+=row('Seed', '<span class="cbval" style="min-width:110px">#'+(seed>>>0).toString(36).toUpperCase()+'</span>'+btn('seed','↻ A new isle'));
  h+=row('Presets', btn('band','⚔ At my band','ghost','danger = your band, rounded')+btn('duel',(PTB.duel?'✓ ':'')+'☠ Boss duel',PTB.duel?'':'ghost','a one-clearing isle: the beach, then the hoard — only its guardian'));
  const bite=fmtDmg(atkAt(fdg)*ITUNE.enemyDmg*(1-armourDR(fdg))), hdg=d+Math.round(ITUNE.depthRiseHp*runRamp(d));
  const bp=cave?null:bossPreview(c), bt=bp?verdictOf(bpThreatD(bp),band):null, hit=m=>fmtDmg(atkAt(hdg)*m*ITUNE.enemyDmg*(1-armourDR(hdg))), GB=BOSS_ATK.greatboar;   // §8.10 its guardian (the same roll you'll meet)
  const info = cave ? 'Floor '+f+' · ⚔'+fdg+' · ~'+floorFoes(c,f)+' foes · a foe ~'+fmtDmg(normalHP(fdg))+' HP · foes bite ~'+bite
             : PTB.duel ? 'the beach, then the hoard — '+bossLabel(bp)+' alone · ~'+fmtDmg(bossHP(hdg))+' HP at ⚔'+hdg+' · charge ~'+hit(GB.charge.mul)+' · stomp ~'+hit(GB.stomp.mul)+' · <span style="color:'+bt.col+'">'+bt.word+' · ~'+bossEst(bp)+' s</span>'
             : '~'+isleZones(c).T+' clearings · ~'+isleFoes(c)+' foes · a foe ~'+fmtDmg(normalHP(d))+' HP · foes bite ~'+bite+' · <span style="color:'+bt.col+'">☠ '+bossLabel(bp)+' '+bt.word+'</span>';
  const fn=cave ? (PTB.cf && PTB.cf!=='auto' && PT_CVF[PTB.cf] ? ' · every chamber '+PT_CVF[PTB.cf][0] : '') : (!PTB.duel && PTB.feat && PTB.feat!=='auto' && PT_SFT[PTB.feat] ? ' · '+PT_SFT[PTB.feat][0]+(PTB.feat==='none'||PTB.feat==='props'?'':(d<=2?' (a ⚔2 isle may hold no room big enough)':' forced')) : '');   // (PT1 K11) the Feature in the summary
  h+='<div class="cbinfo">'+info+fn+'</div><div class="cbland"><button class="sbtn go" data-cb="land">⚓ Land'+(cave?' — ▼ Floor '+f:PTB.duel?' — the duel':'')+'</button></div>';
  body.innerHTML=h; body.querySelectorAll('[data-cb]').forEach(b=>{ b.onclick=()=>ptBoardAct(b.dataset.cb); });
  $('ptFootMsg').textContent=(ptLast?'last: '+ptLast+'  ·  ':'')+(inDev==='pad'?glyph('menu')+' lands · '+glyph('cancel')+' closes':'Enter / Start lands · Esc closes'); $('ptBack').textContent='Close (Esc)'; }
function ptBoardAct(a){ const d=PTB.d;   // (RC fix: was a second `boardAct`, which hoisted over the harbour's Mission Board handler)
  if(a==='land'){ ptLand(); return; }
  if(a==='bm-') ptBiomeI=ptBiomeI<0?BIOMES.length-1:ptBiomeI-1; else if(a==='bm+') ptBiomeI=ptBiomeI>=BIOMES.length-1?-1:ptBiomeI+1;
  else if(a==='d-'||a==='d+'||a==='d-5'||a==='d+5') PTB.d=clamp(d+(a==='d-'?-1:a==='d+'?1:a==='d-5'?-5:5),1,40);
  else if(a==='surf') PTB.cave=false; else if(a==='cave'){ PTB.cave=true; PTB.duel=false; }
  else if(a==='f-'||a==='f+'||a==='f+10') PTB.f=clamp(PTB.f+(a==='f-'?-1:a==='f+'?1:10),1,60);
  else if(a==='cf-'||a==='cf+'){ const K=Object.keys(PT_CVF), i=Math.max(0,K.indexOf(PTB.cf)); PTB.cf=K[(i+(a==='cf+'?1:K.length-1))%K.length]; }
  else if(a==='bt-'||a==='bt+'){ const K=Object.keys(PT_BOT), i=Math.max(0,K.indexOf(PTB.bot)); PTB.bot=K[(i+(a==='bt+'?1:K.length-1))%K.length]; PTB.mkb=null; }   // (DEPTHS DE3) the bottom's find
  else if(a==='mkb'){ PTB.mkb=!ptMkb(); if(PTB.bot==='not' && PTB.mkb) PTB.bot='auto'; }
  else if(a==='sf-'||a==='sf+'){ const K=Object.keys(PT_SFT), i=Math.max(0,K.indexOf(PTB.feat)); PTB.feat=K[(i+(a==='sf+'?1:K.length-1))%K.length]; }   // (PT1 K10a)
  else if(a==='seed') PT_SEEDS[d]=(Math.random()*1e9)|0;
  else if(a==='band') PTB.d=clamp(Math.round(youBand()),1,40);
  else if(a==='duel'){ PTB.duel=!PTB.duel; if(PTB.duel) PTB.cave=false; }
  sfx('ui_tick'); renderCrawlBoard();
  if(inDev==='pad'){ const b=document.querySelector('#ptBody [data-cb="'+a+'"]'); if(b) padSetFocus(b); } }   // (the pad keeps its place on the rebuilt card)
/* LAND: the Crawl Board's pick → a trial isle (ptCore carries the presets) or straight down its cave. The crawl → the ledger → the harbour. */
function ptLand(){ if(!ptMode) return;
  closePtMenu(); closeShop(); if(talkOpen) closeTalk(true); portChat=null; FCARDS=[]; INT=null; PRT=null;   // (the harbour stays behind)
  document.getElementById('title').classList.add('hidden'); paused=false;
  const d=PTB.d; if(PT_SEEDS[d]==null) PT_SEEDS[d]=(Math.random()*1e9)|0;
  if(PTB.cave){ startCaveTest(d,PTB.f); return; }
  fed=0; player.maxhp=eMaxHp(); player.hp=player.hp>0?Math.min(player.hp,player.maxhp):player.maxhp; toasts.length=0;   // (your HP carries between crawls, as on the sea — DEV ❤ Heal)
  enterIsland(ptCore(d,PT_SEEDS[d],{duel:PTB.duel, feat:PTB.feat}));
  toast('⚔  Crawl — ⚔ danger '+d+(PTB.duel?'  ·  a boss duel':''), 'claim her or be carried off  ·  you are Lv '+plvl); }
/* the harbour's own doors: the Crawl Board, the Helm Stone — and the wharf, which leaves for the title (one confirming press) · (C7b: the forge & the market open as in any port) */
function ptPortAct(a){
  if(a.kind==='crawlboard'){ openPtMenu('board'); sfx('ui_open',{v:'menu'}); return true; }
  if(a.kind==='helm'){ helmStone(); return true; }                                 // (C6a) the ✦ Tree in respec mode
  if(a.kind==='boat'){ if(itime-ptLeaveT>4){ ptLeaveT=itime; sfx('ui_tick',0.8); toast('⚓  Leave the Proving Grounds?','press E again — back to the title (this captain isn’t kept)'); return true; }
    ptQuit(); return true; }
  return false; }
function ptQuit(){                                   // off the wharf: the title (a fresh L1 next time — nothing here was ever saved)
  closePtMenu(); devShow(false); closeShop(); closeMenu(); closeJournal(); if(talkOpen) closeTalk(true); if(LEDG) ledgerHide(false);
  FCARDS=[]; portChat=null; PRT=null; INT=null; mode='sea'; setPixScale(3); toasts.length=0; noticeQ=[]; renderNotice();
  ptMode=false; started=false; paused=true; ptLeaveT=-9;
  if(ptTune0){ ITUNE=ptTune0.I; LTUNE=ptTune0.L; PTUNE=ptTune0.P; ptTune0=null; dangerVer++; recalcStats(); actDrop(); }   // (whatever was tuned here stays here — a voyage starts on its own knobs)
  document.getElementById('title').classList.remove('hidden'); titleSaveChip(); sfx('ui_tick',0.8); }
/* ============ THE DEV PANEL (§13) — ` (backquote) · the pad: both sticks. Row 1: level · gold · heal · God · 1-hit · the noon lock ·
   the Par kit · (crawl) back to the harbour / (town) a new captain. Row 3: SPAWN kind · tier · count · Clear foes · Show tokens.
   Row 2 GIVE: +mats (C4a) — Give item / gem & the Weapon rack land with their systems (C4b–C5b); row 4 (Feel) with C2a. ============ */
const DEV_KINDS=['boar','snake','crab','dingo','urchin','ooze','clam','reefspike','diver','sanddev','alpha','tidecaller','lamprey','siren','coco','kelpie','cinderfox','mshrimp','mothwing','boulderback','scorpion','bogtoad','termqueen','walrus','salamander','beetle','tmantis','sporeling','greatboar','brood','packking','drowned','dummy'];   // (C8c: the six more — a queen at tier swarm spawns termites)
const DEV_TIERS=['swarm','normal','elite','magic','rare'];
const DEV_SLOTS=[['main','sword','Sword'],['main','axe','Axe'],['main','spear','Spear'],['main','daggers','Daggers'],['main','bow','Bow'],['main','staff','Staff'],['off','shield','Shield'],['off','quiver','Quiver'],['off','focus','Focus'],['helm',null,'Helm'],['chest',null,'Chest'],['gloves',null,'Gloves'],['boots',null,'Boots'],['amu',null,'Amulet'],['ring',null,'Ring']];   // the GIVE row's slots (C4b)
const devIt={s:0, r:2, ip:1, pk:0};
function devPwList(){ const S=DEV_SLOTS[devIt.s]; if(devIt.r===4) return Object.keys(UNIQUES); if(devIt.r!==3) return [];   // (C6b) the GIVE row's power picker: a Pearl — 'auto' or a power of that slot & type · an Abyssal — the 13 uniques (each its own base)
  return ['auto'].concat(Object.keys(POWERS).filter(k=>{ const P=POWERS[k]; return P.sl===S[0] && (!P.w || !S[1] || P.w.indexOf(S[1])>=0); })); }
function devPwName(k){ return !k?'':k==='auto'?'any power':UNIQUES[k]?UNIQUES[k].n:POWERS[k]?k+' '+POWERS[k].n:k; }
function devGive(){ const S=DEV_SLOTS[devIt.s], ip=devIt.ip, PL=devPwList(), pk=PL.length?PL[devIt.pk%PL.length]:null; let it;
  if(devIt.r===4) it=rollItem({r:4, u:pk, ip});                                                     // (C6b: an Abyssal — the unique picked, at this IP)
  else { let L=Object.keys(IBASE).filter(k=>{ const b=IBASE[k]; return b.s===S[0] && (!S[1]||b.t===S[1]); });   // (a DEV piece: any base of that slot & type whose least IP it meets — else the lowest)
    if(pk && POWERS[pk] && POWERS[pk].h2) L=L.filter(k=>IBASE[k].h===2);                            // (Leviathan's Rib: a two-handed axe)
    const ok=L.filter(k=>IBASE[k].ip<=ip), bk=(ok.length?ok:L.sort((a,b)=>IBASE[a].ip-IBASE[b].ip).slice(0,1))[(Math.random()*(ok.length||1))|0]; it=rollItem({base:bk, r:devIt.r, ip, p:pk&&pk!=='auto'?pk:undefined}); }
  const w=stow(it); if(!w){ if(crawling()) groundItem(it,player.x,player.y); else { toast('🛠  No room','the satchel & the Hold are full'); return; } }
  toast('🛠  '+it.n, IRAR[it.r].n+' · IP '+it.ip+' · '+(w==='bag'?'in your satchel':w==='hold'?'in the Hold':'at your feet')+(reqL(ip)>plvl?' · needs Lv '+reqL(ip):'')); SATC=null; if(menuOpen&&menuTab==='char') renderCharTab(); if(invOpen) renderInv(); }
/* (C5a) THE WEAPON RACK (§13 row 2): every main-hand base at your band (or its least IP) — Driftwood, mid-roll, no affixes, for clean A/B checks — and the
   kits' off-hands (a Buckler, a Quiver, a Sea-glass Focus, a second Dirk): into the satchel, then the Hold (town) or at your feet (a crawl) */
const DEV_TYPES=['sword','axe','spear','daggers','bow','staff'], DEV_WIC={sword:'🗡', axe:'🪓', spear:'🔱', daggers:'🔪', bow:'🏹', staff:'✧'};
const DEV_WHY={sword:'slash · back-slash · the finisher (knocks down)', axe:'chop (180°) · the SLAM (knocks the circle down)', spear:'thrust · thrust · the LUNGE (pierces & knocks the line down)',
  daggers:'stab · stab · stab · the TWIN STAB — backs & exposed foes always crit', bow:'shot · shot · the double nock (knocks down)', staff:'bolt · bolt · BRINE BURST (splash · its target goes down) — its element: the base’s'};
function devRack(){ const ip=Math.max(1,Math.round(youBand())); let nB=0, nH=0, nG=0;
  const give=(bk,w)=>{ const b=IBASE[bk], it=rollItem({base:bk, r:0, ip:Math.max(ip,b.ip), w, so:0, na:0}), where=stow(it); if(where==='bag') nB++; else if(where==='hold') nH++; else if(crawling()){ groundItem(it,player.x,player.y); nG++; } };
  for(const t of DEV_TYPES) for(const k in IBASE){ const b=IBASE[k]; if(b.s==='main' && b.t===t) give(k,(b.w[0]+b.w[1])/2); }
  for(const k of ['buckler','quiver','sgfocus','dirk']) give(k,IBASE[k].w?(IBASE[k].w[0]+IBASE[k].w[1])/2:undefined);
  for(const g of new Set([].concat(...DEV_TYPES.map(t=>GEM_ST[t]||[])))){ const G=gemMk(g,1), where=stow(G); if(where==='bag') nB++; else if(where==='hold') nH++; else if(crawling()){ groundItem(G,player.x,player.y); nG++; } }   // (C5b: every type's Common gems too)
  SATC=null; toast('🛠  The weapon rack', 'every base at IP '+ip+'+ · '+nB+' in the satchel'+(nH?' · '+nH+' in the Hold':'')+(nG?' · '+nG+' at your feet':'')+' — Esc → ⚔ Gear to wear them'); if(menuOpen&&menuTab==='char') renderCharTab(); if(invOpen) renderInv(); }
/* (C5b) GIVE GEM (row 2): a gem of that key & level → your satchel (the Hold in town, your feet on a full crawl) · CAST ALL: every gem in turn at a training
   dummy — the right weapon in hand, slotted alone, Tide one short of full (PT1 K4: never a Crest — the row's own %), cooldowns clear — its cost, cooldown and every damage % its packets carried, against its
   row (the console's [castall] lines · window.__castAll) */
const devGem={i:1, lv:1};
function devGiveGem(g,lv){ const G=gemMk(g,lv), w=stow(G); if(!w){ if(crawling()) groundItem(G,player.x,player.y); else { toast('🛠  No room','the satchel & the Hold are full'); return; } }
  toast('🛠  ◈ '+GEMS[g].n+' · L'+G.lv, w==='bag'?'in your satchel — Esc → ⚔ Gear to slot it':w==='hold'?'in the Hold':'at your feet'); SATC=null; if(menuOpen&&menuTab==='char') renderCharTab(); if(invOpen) renderInv(); }
function devCastAll(){ if(mode!=='island' || !ISL || gemLog) return;
  const keep={EQ:Object.assign({},EQ), BAG:BAG.slice(), BAR:BAR.slice(), god:devGod}; devGod=true; devSpawn('dummy','normal',2);   // (two dummies in a line: the second catches what flies past — a spark, a crescent, a pierce)
  gemLog={rows:{}, keep, hit(P){ const G=BAR[P.gem]; if(!G) return; const D=GEMS[G.g], R=this.rows[G.g]; if(!R) return;
      const ref=D.sl==='basic' ? eBasic() : gemBase(D)*gLvK(G), v=Math.round(P.dmg/Math.max(1e-6,ref)*100*(G.g==='G24'?2:1)); if(R.pct.indexOf(v)<0) R.pct.push(v); },   // (a thrall's row is % a second — it strikes twice a second)
    cast(A){ const R=this.rows[A.sk]; if(R){ R.cost=Math.round(R.t0-tide); R.cd=+(player.cdS[A.si]||0).toFixed(2); } } };
  let t=0.1; for(const g of GEM_KEYS){ gemQ(t,()=>devCast1(g)); t+=1.7; } gemQ(t+0.8,devCastDone);
  toast('🛠  ◈ Cast all', GEM_KEYS.length+' gems, one every 1.7 s, at the training dummy — God on till it’s done'); }
function devCast1(g){ if(!ISL || !gemLog) return; const D=GEMS[g];
  if(D.w && D.w.indexOf(wpnOf())<0){ const t=D.w[0], B=KIT_B[t], it=rollItem({base:B[0], r:0, ip:EQ.main?EQ.main.ip:1, w:WPN0[t], so:0}); EQ.main=it; if(EQ.off && !offFits(EQ.off,it)) EQ.off=null; gearChanged(); }
  const s=D.sl==='basic'?0:1, G=gemMk(g,1); BAR=[null,null,null,null,null,null]; BAR[s]=G; gemBarChanged();
  player.act=null; player.cdS=[0,0,0,0,0,0]; BUFF={}; player.guard=null; tide=tideMax()-1; aimDev='key'; izone=[]; ially=[]; iproj=iproj.filter(p=>p.k==='spit');   // (the last gem's zones, summons & shots cleared — each row logs only its own)
  const dm=enemies.find(e=>e.dummy); if(dm){ for(const [ox,oy] of [[0,40],[0,-40],[40,0],[-40,0]]) if(islFree(dm.x+ox,dm.y+oy,5)){ player.x=dm.x+ox; player.y=dm.y+oy; break; }   // (40u from the dummy, facing it — a leap or a lunge last time moved you)
    const d=Math.hypot(dm.x-player.x,dm.y-player.y)||1; player.fx=(dm.x-player.x)/d; player.fy=(dm.y-player.y)/d; icamX=player.x; icamY=player.y;
    const d2=enemies.filter(e=>e.dummy)[1]; if(d2){ const x2=dm.x+player.fx*36, y2=dm.y+player.fy*36; if(islFree(x2,y2,5)){ d2.x=x2; d2.y=y2; } } }
  const R=gemLog.rows[g]={n:D.n, t0:tide, pct:[], cost:null, cd:null, fx:''};
  if(s===0){ doSlash(); gemQ(0.5,doSlash); gemQ(1.0,doSlash); R.cost=0; R.cd=0; }
  else if(D.sl==='persist'){ gullTick(); R.cost=GEMS.G27.rsv; R.cd=0; }
  else { castSlot(1); if(g==='G04' && dm) gemQ(0.15,()=>{ const gd=devGod; devGod=false; hurtPlayer(0,1,1,true,0,false,dm); devGod=gd; }); }   // (Riposte: the dummy 'strikes' into the guard)
  gemQ(1.5,()=>{ if(!gemLog) return; R.fx=[Object.keys(BUFF).join('+'), player.guard?'guard':'', ially.length?ially.length+' allies':'', izone.length?izone.length+' zones':''].filter(Boolean).join(' · '); }); }
function devCastAbort(){ const L=gemLog; if(!L) return; const K=L.keep; gemLog=null; EQ=K.EQ; BAG=K.BAG; BAR=K.BAR; devGod=K.god; BUFF={}; gearChanged(); gemBarChanged(); if(devOn) renderDev(); }   // (G3 fix: the harbour, a KO or a new floor cut the run short — your weapon, satchel, bar & God back as they were)
function devCastDone(){ if(!gemLog) return; const K=gemLog.keep, rows=gemLog.rows, out=[];
  for(const g of GEM_KEYS){ const D=GEMS[g], R=rows[g]||{pct:[]}, rc=D.sl==='skill'?Math.max(10,D.c):D.sl==='persist'?D.rsv:0, rcd=D.cd?Math.max(D.fl||0,D.cd*(1-(stats().cdr||0))):0;
    const okC=R.cost===rc, okD=Math.abs((R.cd||0)-rcd)<0.02, okP=!D.pct || D.nod || R.pct.some(v=>Math.abs(v-D.pct)<=1) || (D.sl==='basic' && R.pct.length>0);
    out.push({g, n:D.n, cost:R.cost, rowCost:rc, cd:R.cd, rowCd:+rcd.toFixed(2), pct:R.pct.slice().sort((a,b)=>a-b), rowPct:D.pct||0, fx:R.fx, ok:okC&&okD&&okP});
    console.log('[castall] '+g+' '+D.n+' · cost '+R.cost+' (row '+rc+') · cd '+R.cd+' (row '+rcd.toFixed(2)+') · dmg% '+JSON.stringify(R.pct)+' (row '+(D.pct||'—')+')'+(R.fx?' · '+R.fx:'')+' '+(okC&&okD&&okP?'✓':'✗')); }
  window.__castAll=out; gemLog=null; EQ=K.EQ; BAG=K.BAG; BAR=K.BAR; devGod=K.god; gearChanged(); gemBarChanged(); BUFF={}; recalcStats();
  const bad=out.filter(r=>!r.ok).length; toast('🛠  ◈ Cast all done', out.length+' gems · '+(bad?bad+' off their row — see the console':'every one on its row')); if(devOn) renderDev(); }
const DEV_FEEL=[['swWindMul','wind×',0.1,0,3],['swRecMul','rec×',0.1,0,3],['swMoveWind','move',0.05,0,1],['swStepMul','step×',0.25,0,3],['hsWeapMul','stop×',0.1,0,2],['kbSlide','kb×',0.25,0,3],['corpseV','corpse×',0.25,0,2],['shakeCap','shake',1,0,12],['finHsMin','fin stop',0.01,0,0.15],['lightHs','light stop×',0.1,0,2],['crestK','crest×',0.05,1,2],['pdPre','pd pre',0.01,0,0.16],['pdPost','pd post',0.01,0,0.2],['hvTime','heavy t',0.05,0.15,1.5],['hvMul','heavy ×',0.05,0.5,3]];   // (PT1 K2: the finisher's least freeze · the light beats' freeze × · K4: the Crest's × · PT2 X2: the perfect dash's window · PX: THE HEAVY's wind-up & ×)   // row 4 (§13): [knob, label, step, min, max]
function actDrop(){ player.act=null; player.hv=null; player.cmb=0; player.combo=0; player.bufS=0; player.bufD=0; player.bufQ=0; player.bufK=null; player.dsQ=0; }   // the action in flight AND its buffered presses are dropped (a feel or weapon swap) · (PX RELEASE FIX PRC-R1: the charge too, but not hvArm — a strike still held winds a new one, as after a dash; a release disarms)
function legacyToggle(){ ITUNE.legacyFeel=ITUNE.legacyFeel>0?0:1; actDrop(); hitStop=0; hsX=0;   // (§2.14: flip mid-fight — the action in flight is dropped)
  toast(ITUNE.legacyFeel>0?'⟲  LEGACY feel':'✦  Crawl 2.0 feel', ITUNE.legacyFeel>0?'today’s swings (~6/s), no freezes on plain hits, the one-frame shove, the old beeps':'wind-up · the blade arrives · freeze · the slide · bodies fly · the new sounds'); if(devOn) renderDev(); }
function copyTuning(){ const o={}; for(const k of FEEL_KEYS) if(ITUNE[k]!==DEFAULT_ITUNE[k]) o[k]=ITUNE[k]; const s=JSON.stringify(o), n=Object.keys(o).length;   // one JSON line of the CHANGED feel knobs
  console.log('[feel] '+s); let ok=false;
  try{ const ta=document.createElement('textarea'); ta.value=s; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); ok=document.execCommand('copy'); ta.remove(); }catch(e){}
  if(!ok && navigator.clipboard) navigator.clipboard.writeText(s).then(()=>{},()=>{});
  toast('📋  Feel tuning copied', n ? n+' knob'+(n>1?'s':'')+' changed — '+s.slice(0,70)+(s.length>70?'…':'') : 'nothing changed from the defaults'); }
let devSig='', devPl=1;                                                          // (devPl: the level the Lv stepper last showed — it follows a level-up unless you moved it)
function devKindName(k){ return k==='dummy'?'Training dummy':BOSSES[k]?BOSSES[k].n.replace(/^The /,''):beastName(k); }
function devShow(on){ devOn=!!on; const el=document.getElementById('devp'); if(!el) return; el.classList.toggle('hidden',!devOn);
  if(devOn){ ptLv=plvl; if(devIt.ip===1) devIt.ip=Math.max(1,Math.round(youBand())); renderDev(); } else if(padFocusEl && el.contains(padFocusEl)) padSetFocus(null); }   // (the GIVE row's IP starts at your band)
function devTick(){ if(devOn && devSig!==(window.__frameErr|0)+'|'+mode+'|'+plvl){ if(ptLv===devPl) ptLv=plvl; renderDev(); }
  if(devOn){ const n=performance.now(); if(n-devSnd.mT>200){ devSnd.mT=n; const m=document.getElementById('dvsnd'); if(m) m.textContent=sndMeter(); const mm=document.getElementById('dvmus'); if(mm) mm.textContent=musMeter(); const md=document.getElementById('dvdir'); if(md) md.textContent=musDirMeter(); } } }   // (C9: the board's live voices & gain-reduction readout, 5 Hz)
/* (C9 §11) THE DEV SOUND BOARD — every SFX2 recipe (PT1 A1: + every SFX_SYN & SFX_MAP id, each with its path: S recorded · Y synth · B beep), then the old beeps no recipe replaced · the live voice count (≤ 32) & the compressor's gain reduction (now · peak) */
const SND_OLD=['slash','shoot','hurt','break','secure','land','tink','heart','dash','cast','snap','thunk','hit','pop','crunch','chip','howl','raise','streak','heavy','whirl','legend','volley','first','rarekill','trk','lvl','stamp','pick','chest','dig'];
let devSnd={i:0, run:null, mT:0}, sfxGRpk=0, SNDL=null, devMus={i:0, lv:-1};   // (PT1 M1: devMus — the 🎵 jukebox's track & intensity)
function sndList(){ if(SNDL) return SNDL; const S=new Set(Object.keys(SFX2)); for(const k in SFX_SYN) S.add(k); for(const k in SFX_MAP) S.add(k); return SNDL=[...S].concat(SND_OLD.map(k=>'old:'+k)); }
function sndPath(n){ if(n.indexOf('old:')===0) return 'B'; if(LF('sfxLegacy')>0) return SFX_OLD[n]==='-'?'-':'B'; const id=SFX_ALIAS[n]||n, M=SFX_MAP[id];   // (PT1 A1) the way sfx() will play it
  if(M && !M.k && SNDP.smp && sndHave(M.s)) return 'S'; if(SFX2[id]||SFX_SYN[id]) return 'Y'; return SFX_OLD[id]==='-'?'-':'B'; }
/* (PT1 A2 — DEV / console) sndMapCheck() → the sound map's problems, [] when clean: an id the code fires (the first argument of every call to the sound shim,
   read off this very script — comments skipped, a name built by + left to its table — plus the tables that name ids: WEAPON · ELEM · MAT_HIT · BARK_K · TELL_* ·
   SECURE_V) with neither a map row nor a recipe, or only a recorded row (no synth under it) · an old-beep name fired · a map row naming an unknown set or recipe ·
   an SFX_SYN alias to a missing row · a set with no files or an unknown alt · with a manifest loaded, a set none of whose files it lists · SND_MISS */
function sndMapCheck(){ const P=[], ids=new Map(), add=(id,w)=>{ if(id && !ids.has(id)) ids.set(id,w); };
  const src=[...document.scripts].reduce((a,q)=>(q.text||'').length>a.length?q.text:a,''), re=/\bsfx\(/g; let m;
  while((m=re.exec(src))){ const ls=src.lastIndexOf('\n',m.index); if(src.slice(ls+1,m.index).indexOf('//')>=0 || src.lastIndexOf('/*',m.index)>src.lastIndexOf('*/',m.index)) continue;   // (in a comment)
    let i=m.index+4, d=0, q='', a='';   // the call's first argument (to its first top-level , or ))
    for(;i<src.length && a.length<240;i++){ const c=src[i]; if(q){ a+=c; if(c==='\\'){ a+=src[++i]; continue; } if(c===q) q=''; continue; } if(c==="'"||c==='"'||c==='`'){ q=c; a+=c; continue; }
      if(c==='('||c==='['||c==='{') d++; else if(c===')'||c===']'||c==='}'){ if(!d) break; d--; } else if(c===',' && !d) break; a+=c; }
    if(/'\s*\+/.test(a)) continue; const lr=/(^\s*|[?:\[,|&]\s*)'([A-Za-z0-9_]+)'/g; let k; while((k=lr.exec(a))) add(k[2],src.slice(0,m.index).split('\n').length); }
  for(const w in WEAPON){ const W=WEAPON[w]; add(W.swing,'WEAPON'); add(W.draw,'WEAPON'); for(const c of W.combo||[]){ add(c.snd,'WEAPON'); add(c.snd2,'WEAPON'); } }
  for(const e in ELEM) add(ELEM[e].snd,'ELEM'); for(const k in MAT_HIT) add(MAT_HIT[k],'MAT_HIT'); for(const k in BARK_K) add('bark_'+BARK_K[k],'BARK_K');
  for(const k in TELL_A) add(TELL_A[k],'TELL_A'); for(const k in TELL_K) add(TELL_K[k],'TELL_K'); add('tell_click','tellOf'); add('tell_hiss','tellOf'); for(const k of SECURE_V) add(k,'SECURE_V');
  const OLD=['tink','thunk','snap','land','cast','hurt','pop','shoot','heart'];
  for(const [n,w] of ids){ const id=SFX_ALIAS[n]||n, M=SFX_MAP[id], Y=SFX2[id]||SFX_SYN[id];
    if(OLD.indexOf(n)>=0) P.push('old-beep name fired: '+n+' (line '+w+')');
    else if(!M && !Y) P.push('no map row & no recipe: '+n+' ('+w+')'); else if(!Y) P.push('a recorded row with no synth under it: '+n+' ('+w+')'); }
  const set=(s,id,f)=>{ if(s && !SFX_SETS[s]) P.push('map row '+id+'.'+f+': unknown set '+s); };
  for(const id in SFX_MAP){ const M=SFX_MAP[id]; if(!M.k && !M.s) P.push('map row '+id+': no set'); set(M.s,id,'s'); for(const l of (M.l||[]).concat(M.lb||[])) set(l[0],id,'l');
    for(const k in (M.st||{})){ const V=M.st[k]; set(V && typeof V==='object'?V.s:V,id,'st'); } for(const k in (M.sv||{})){ const V=M.sv[k]; if(V && typeof V==='object'){ set(V.s,id,'sv'); for(const l of V.l||[]) set(l[0],id,'sv.l'); } else set(V,id,'sv'); } for(const k in (M.kl||{})) set(M.kl[k][0],id,'kl');
    if(M.y && !M.y.split('|').every(k=>SND_KINDS.indexOf(k)>=0) && M.y!=='all' && !SFX2[M.y]) P.push('map row '+id+'.y: unknown recipe '+M.y);
    if(M.y==='all' && !sfxRecipe(id,{})) P.push('map row '+id+'.y: all, but no recipe'); }
  for(const k in SFX_SYN) if(!SFX2[SFX_SYN[k][0]]) P.push('SFX_SYN '+k+' → missing row '+SFX_SYN[k][0]);
  const man=SNDX.st==='ok' && SNDX.man;
  const F=new Set(sndFiles()), used=new Set();   // (PT1 A4: SFX_FILES — the installed pack's keys)
  for(const s in SFX_SETS){ const S=SFX_SETS[s], K=sndKeys(s); if(!K.length && !S.x) P.push('set '+s+': no files'); if(S.alt && !SFX_SETS[S.alt]) P.push('set '+s+': unknown alt '+S.alt);
    for(const k of K){ used.add(k); if(SND_PACK && !F.has(k)) P.push('set '+s+': '+k+' is not in the pack (SFX_FILES)'); }
    if(man){ const miss=K.filter(k=>!man[k]); if(miss.length) P.push('set '+s+': '+miss.length+' of its '+K.length+' files not in the manifest ('+miss.slice(0,3).join(' ')+')'); } }
  for(const k of F) if(!used.has(k)) P.push('SFX_FILES '+k+': in the pack, but no set plays it');
  if(man){ for(const k in man) if(!F.has(k)) P.push('manifest '+k+': not in SFX_FILES'); for(const k of F) if(!man[k]) P.push('SFX_FILES '+k+': not in the manifest'); }
  for(const k in SND_MISS) P.push('SND_MISS: '+k);
  return P; }
/* (PT1 A4 §3.6.4 — DEV / console) sndRender(id, o, path 'Y' synth | 'S' recorded, {sr, dur}) → the voice rendered offline (an OfflineAudioContext stands in for
   the live graph a moment: no compressor, no limiter — the voice as it enters the bus) → a Float32Array. sndLoud(x, sr) → its loudness: the loudest 400 ms of
   K-weighted power (BS.1770's momentary, dB) */
async function sndRender(id,o,path,opt){ opt=opt||{}; const sr=opt.sr||48000, oc=new OfflineAudioContext(1,Math.round(sr*(opt.dur||2.5)),sr), bus=oc.createGain(); bus.connect(oc.destination);
  const M=SFX_MAP[id], sv={actx, sfxBus, cmbBus, wldBus, uiBus, SFXN, SFXB, sfxComp, V:SFXV.slice(), L:Object.assign({},sfxLast)};
  try{ actx=oc; sfxBus=cmbBus=wldBus=uiBus=bus; sfxComp=null; SFXN=[0,1,2].map(()=>{ const b=oc.createBuffer(1,Math.round(sr*0.5),sr), d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b; });
    try{ SFXB=sfxBodyBake(); }catch(e){ SFXB=null; } SFXV.length=0; sfxFN=0; sfxFK=-1; for(const k in sfxLast) delete sfxLast[k];
    const oo=Object.assign({},o||{}); if(path==='S' && M && !M.k) sfxS(id,M,oo); else sfx2(id,oo); }
  finally{ actx=sv.actx; sfxBus=sv.sfxBus; cmbBus=sv.cmbBus; wldBus=sv.wldBus; uiBus=sv.uiBus; SFXN=sv.SFXN; SFXB=sv.SFXB; sfxComp=sv.sfxComp; SFXV.length=0; for(const v of sv.V) SFXV.push(v); for(const k in sfxLast) delete sfxLast[k]; Object.assign(sfxLast,sv.L); sfxFN=0; }
  return (await oc.startRendering()).getChannelData(0).slice(); }
function sndLoud(x,sr){ const bq=(y,b,a)=>{ let x1=0,x2=0,y1=0,y2=0; for(let i=0;i<y.length;i++){ const v=y[i], w=b[0]*v+b[1]*x1+b[2]*x2-a[1]*y1-a[2]*y2; x2=x1; x1=v; y2=y1; y1=w; y[i]=w; } };
  const y=Float64Array.from(x); let K=Math.tan(Math.PI*1681.974450955533/sr), Q=0.7071752369554196, Vh=Math.pow(10,3.999843853973347/20), Vb=Math.pow(Vh,0.4996667741545416), a0=1+K/Q+K*K;
  bq(y,[(Vh+Vb*K/Q+K*K)/a0,2*(K*K-Vh)/a0,(Vh-Vb*K/Q+K*K)/a0],[1,2*(K*K-1)/a0,(1-K/Q+K*K)/a0]); K=Math.tan(Math.PI*38.13547087602444/sr); Q=0.5003270373238773; a0=1+K/Q+K*K;
  bq(y,[1,-2,1],[1,2*(K*K-1)/a0,(1-K/Q+K*K)/a0]);
  const w=Math.round(sr*0.4), h=Math.round(sr*0.01); let s=0, mx=0; for(let i=0;i<y.length;i++){ s+=y[i]*y[i]; if(i>=w) s-=y[i-w]*y[i-w]; if(i>=w-1 && (i-w+1)%h===0 && s>mx) mx=s; }
  if(y.length<w){ mx=s; } return -0.691+10*Math.log10(Math.max(1e-20,mx/w)); }
/* sndCal(o) — every mapped id with recorded sets (not KEEP) rendered both ways, n renders each (the variants & jitter average out): its synth & recorded loudness,
   the target (the synth + SND_CAL_DB: the samples sit where the owner's tested synth mix sits, a touch fuller) and the gain that hits it. o.apply: re-render
   & move SFX_MAP[id].g until within ±0.5 dB (in memory — the builder writes the numbers into the file). o.ids · o.n (4). → a promise of the rows (window.__sndCal)
   (GA fix — GAV-C01) each variant too — an sv key rendered with {mat, v}, an st key with {step} — its own g (× the row's) fitted the same way (rows 'id.sv.k') ·
   o.vars false: the rows only · o.vonly: the variants only */
const SND_CAL_DB=1, SND_CAL_HIT=0, SND_CAL_HITS={hit_fin:1, crit_crunch:1, skill_boom:1};   // (G11V-B06: the hits stay where the owner tested them — already ≈ +4 dB over the old game against the KEEP chimes (K-weighted) — so the recordings change their grain, not their level)
async function sndCal(o){ o=o||{}; if(!actx) initAudio(); if(SNDX.st!=='ok' && SNDX.st!=='fake') return 'no samples ('+SNDX.st+')';
  if(SNDX.st==='ok'){ for(const s in SFX_SETS) sndQueue(s); sndPump(); for(let i=0;i<400 && (SNDX.q.length||SNDX.act);i++) await new Promise(r=>setTimeout(r,50)); }   // (every tier in first — the layers too)
  const ids=o.ids||Object.keys(SFX_MAP).filter(id=>!SFX_MAP[id].k && SFX_MAP[id].s), n=o.n||4, sr=48000, rows=window.__sndCal=[];
  const L=async(id,p,oo)=>{ let e=0; for(let i=0;i<n;i++) e+=Math.pow(10,sndLoud(await sndRender(id,oo||{mat:id==='hit_crit'?'fur':undefined},p,{sr}),sr)/10); return 10*Math.log10(e/n); };
  for(const id of ids){ const M=SFX_MAP[id]; if(!sndHave(M.s)){ rows.push({id, skip:'its set is not loaded'}); continue; }
    const dB=SFX_HITV[id]!=null||SND_CAL_HITS[id]?SND_CAL_HIT:SND_CAL_DB, syn=o.vonly?0:await L(id,'Y'), tgt=syn+dB, g0=M.g==null?0.8:M.g; let smp=o.vonly?0:await L(id,'S'), g=g0, it=0;
    const gr=v=>{ const q=v<0.2?1000:100; return clamp(Math.round(v*q)/q,0.005,2.5); }, r=v=>Math.round(v*10)/10;   // (a quiet row's gain to 0.001: 0.01 is 2 dB at 0.05)
    if(!o.vonly){ if(o.apply) while(Math.abs(smp-tgt)>0.5 && it++<5){ g=gr(g*Math.pow(10,(tgt-smp)/20)); M.g=g; smp=await L(id,'S'); }
      rows.push({id, syn:r(syn), smp:r(smp), tgt:r(tgt), d:r(smp-tgt), g0, g:o.apply?g:gr(g0*Math.pow(10,(tgt-smp)/20))}); }
    if(o.vars===false) continue;   // (GA fix — GAV-C01: each variant — sv {v|mat} · st {step} — rendered both ways too, and its own g (× the row's) fitted to its synth + the same dB)
    for(const w of ['sv','st']) for(const k in (M[w]||{})){ const V=M[w][k], VO=V&&typeof V==='object'?V:null, s=VO?VO.s:V; if(!s || (s===M.s && !VO) || !sndHave(s)) continue;
      const oo=w==='st'?{step:+k, mat:id==='hit_crit'?'fur':undefined}:{mat:k, v:k}, sy=await L(id,'Y',oo), tg=sy+dB, v0=VO&&VO.g||1, gv=v=>clamp(Math.round(v*100)/100,0.05,8);
      let O=VO, sm=await L(id,'S',oo), vg=v0, j=0;
      if(o.apply && Math.abs(sm-tg)>0.5){ if(!O){ O={s}; M[w][k]=O; } while(Math.abs(sm-tg)>0.5 && j++<5){ vg=gv(vg*Math.pow(10,(tg-sm)/20)); O.g=vg; sm=await L(id,'S',oo); } }
      rows.push({id:id+'.'+w+'.'+k, syn:r(sy), smp:r(sm), tgt:r(tg), d:r(sm-tg), g0:v0, g:o.apply?vg:gv(v0*Math.pow(10,(tg-sm)/20))}); } }
  return rows; }

function sfxVoices(){ if(!actx) return 0; const t=actx.currentTime; let n=0; for(const v of SFXV) if(v.end>t) n++; return n; }
function sfxGR(){ if(!sfxComp) return 0; const r=sfxComp.reduction; const g=typeof r==='number'?r:(r&&r.value)||0; if(-g>sfxGRpk) sfxGRpk=-g; return -g; }   // (dB of gain reduction, ≥ 0)
function sndMeter(){ return !actx?'(no audio yet — click the page)':actx.state!=='running'?'audio '+actx.state:'voices '+sfxVoices()+'/'+SFX_VMAX+' · GR '+sfxGR().toFixed(1)+' dB (peak '+sfxGRpk.toFixed(1)+')'; }
function sndPlay(n){ if(!actx) initAudio(); if(actx && actx.state==='suspended') try{ actx.resume().catch(()=>{}); }catch(e){}
  const old=n.indexOf('old:')===0, k=old?n.slice(4):n, pa=sndPath(n); sfxLast[k]=-9; const v0=SFXV.length?SFXV[SFXV.length-1]:null;
  if(old) sfxOld(k,1); else sfx(k,{pitch:1, x:mode==='island'&&ISL?player.x:null, y:mode==='island'&&ISL?player.y:null});   // (PT1 A1: through sfx() — the recorded path too)
  const v1=SFXV.length?SFXV[SFXV.length-1]:null; return pa==='B' ? !!(actx&&audioOn&&masterG) : !!(v1 && v1!==v0 && v1.s.length>0); }   // (a designed voice made — its layers scheduled)
function sndAll(){ if(devSnd.run){ clearTimeout(devSnd.run); devSnd.run=null; return; } const L=sndList(), out=window.__sndBoard=[]; let i=0;
  const step=()=>{ if(i>=L.length){ devSnd.run=null; console.log('[sfx] board done — '+out.filter(r=>r.ok).length+' / '+L.length+' made a sound'); renderDev(); return; }
    const n=L[i++], path=sndPath(n), ok=sndPlay(n), k=n.replace('old:',''); out.push({n, ok, v:sfxVoices(), path}); console.log('[sfx] '+n+' '+(ok?'✓':'✗'));
    devSnd.run=setTimeout(step, Math.round(1000*Math.max(0.35, Math.min(1.2,(SFX_LEN[k]||0.3)+0.1)))); };
  step(); }   // (re-drawn only when what it shows changes: the red pip, town ↔ crawl, your level)
function renderDev(){ const el=document.getElementById('devp'); if(!el) return; devSig=(window.__frameErr|0)+'|'+mode+'|'+plvl; devPl=plvl;
  const fk=padFocusEl&&el.contains(padFocusEl)?padFocusEl.dataset.dev:null, er=window.__frameErr|0, isl=mode==='island'&&!!ISL, town=mode==='port'||mode==='interior';
  const B=(a,t,on,tip,dis)=>'<button class="sbtn'+(on?'':' ghost')+'" data-dev="'+a+'"'+(tip?' title="'+tip+'"':'')+(dis?' disabled':'')+'>'+t+'</button>';
  const kind=DEV_KINDS[DEVS.k], fixed=!!BOSSES[kind]||kind==='dummy';
  el.style.top=(hudBtnBottom()+6)+'px';
  el.innerHTML='<div class="dvr"><span class="dvl">🛠 DEV'+(er?' <b style="color:#ff6a5a" title="frames that threw — see the console">● '+er+'</b>':'')+'</span>'+   // (the red pip: a frame threw)
      '<span class="dvs">Lv '+plvl+' →'+B('lv-','◀')+'<b>'+ptLv+'</b>'+B('lv+','▶')+B('setlv','Set',ptLv!==plvl,'jump to this level — its passive points wait in Esc → ✦ Tree (Set hands the tree back: every node returned)')+'</span>'+B('tpx','✦ +5',0,'five bonus passive points (the boss-first & museum kind) — 35 in all at most · for trying keystones early')+
      B('g1k','+1k 🪙')+B('g10k','+10k 🪙')+B('heal','❤ Heal')+B('god','🛡 God',devGod,'nothing hurts you')+B('one','☠ 1-hit',devOneHit,'every blow of yours kills (not the dummy)')+B('noon','☀ Noon',ptNoon,'lock the clock at noon, clear skies')+
      '<span class="dvs">'+B('pd-','◀')+B('par','Par kit ⚔'+ptParD,!!ptPar,'level Lp(d) · the par gear set at IP d (the par hit, life & armour)')+B('pd+','▶')+'</span>'+
      (isl?B('harbour','⚓ Harbour',0,'abandon this crawl — the ledger, then the Proving Harbour'):B('reset','↺ New captain',0,'a fresh L1 and the kit card',!town))+'</div>'+
    '<div class="dvr"><span class="dvl">GIVE</span>'+B('mats','+mats ×20',0,'every material ×20 — into your pouch on a crawl, the Hold in town (C4a)')+B('prosp','⛏ '+prosp.lv,0,'the Prospector one level up (10 → back to 1) — try its perks: 2 Keen Pick · 3 Forager · 4 Rich Veins · 6 Geologist · 8 Lode Sense · 10 Bedrock (C7a)')+   // row 2 (§13): Give item (C4b) · Give gem & the Weapon rack join with their systems (C5a/C5b)
      '<span class="dvs">'+B('is-','◀')+'<b style="min-width:54px">'+DEV_SLOTS[devIt.s][2]+'</b>'+B('is+','▶')+'</span>'+
      '<span class="dvs">'+B('ir-','◀')+'<b style="min-width:62px;color:'+IRAR[devIt.r].c+'">'+IRAR[devIt.r].n+'</b>'+B('ir+','▶')+'</span>'+
      '<span class="dvs">IP'+B('ip-','◀')+'<b>'+devIt.ip+'</b>'+B('ip+','▶')+'</span>'+
      (devIt.r>=3?(()=>{ const L=devPwList(), k=L[devIt.pk%L.length]; return '<span class="dvs">✦'+B('pw-','◀')+'<b style="min-width:120px;color:'+IRAR[devIt.r].c+'">'+devPwName(k)+'</b>'+B('pw+','▶')+'</span>'; })():'')+   // (C6b: the power / unique picker)
      B('give','Give item',1,'a rolled piece of that slot, tier & item power → your satchel (a Pearl carries the power picked — or any of its slot’s · an Abyssal is the unique picked, on its own base)')+B('pwlog','✦ Power log',0,'which Pearl & Abyssal powers have fired this session — the console lists the counts (window.__powFired)')+
      B('rack','🗡 Weapon rack',0,'every weapon base at your band (Driftwood, no affixes) + the kits’ off-hands + every type’s Common gems → your satchel (the rest to the Hold / your feet) — for A/B checks')+
      '<span class="dvs">◈'+B('gm-','◀')+'<b style="min-width:104px;color:'+GEM_RAR[GEMS[GEM_KEYS[devGem.i]].r].c+'">'+GEMS[GEM_KEYS[devGem.i]].n+'</b>'+B('gm+','▶')+'L'+B('gl-','◀')+'<b>'+devGem.lv+'</b>'+B('gl+','▶')+'</span>'+B('ggive','Give gem',1,'that skill gem at that level → your satchel (C5b)')+B('castall','◈ Cast all',!!gemLog,'every gem, one after another, at a training dummy — each one’s cost, cooldown & damage % logged against its row (the console & window.__castAll)',!isl)+'</div>'+
    '<div class="dvr"><span class="dvl">SPAWN</span>'+
      '<span class="dvs">'+B('k-','◀')+'<b style="min-width:92px">'+devKindName(kind)+'</b>'+B('k+','▶')+'</span>'+
      '<span class="dvs">'+B('t-','◀',0,'',fixed)+'<b style="min-width:46px">'+(fixed?'—':DEV_TIERS[DEVS.t])+'</b>'+B('t+','▶',0,'',fixed)+'</span>'+
      '<span class="dvs">×'+B('n-','◀')+'<b>'+DEVS.n+'</b>'+B('n+','▶')+'</span>'+
      B('spawn','Spawn',1,'80u ahead of you (crawl only)',!isl)+B('clear','Clear foes',0,'the fight you’re in, and every DEV spawn — no XP, no loot',!isl)+B('tok','👁 Tokens',!!dev.showTok,'the attack-token director: gold pips = holding a token · grey = waiting its turn · the grey rings = their wait rings')+
      '<span class="dvs">⛩'+B('sh-','◀')+'<b style="min-width:52px;color:'+SHRINE_K[SHRINE_KEYS[devSh]].c+'">'+SHRINE_K[SHRINE_KEYS[devSh]].n+'</b>'+B('sh+','▶')+'</span>'+B('shrine','Place',1,'a shrine of that kind 50u ahead of you — E at it (C8b · crawl only)',!isl)+B('rock','+rock',0,'a rock 60u ahead of you — the bow fix’s test target (PT1 K1 · crawl only)',!isl)+
      B('secF','🗝 Secrets '+(dev.secF?'always':'auto'),!!dev.secF,'always: every crawl you land (from now) hides a secret room where one fits — and a shrine from ⚔1 — whatever the landfall count & the odds (C8b)')+'</div>'+
    '<div class="dvr"><span class="dvl">FEEL</span>'+B('legacy',ITUNE.legacyFeel>0?'⟲ Legacy':'✦ Crawl 2.0',ITUNE.legacyFeel>0,'today’s swings, freezes, shoves & beeps ⟷ the new feel (the [ key)')+
      B('wpn',(DEV_WIC[wpnOf()]||'🗡')+' '+wpnOf(),1,'the weapon in hand — click for the next type (a Driftwood base & its kit off-hand at your main’s IP): sword → axe → spear → daggers → bow → staff')+
      DEV_FEEL.map(f=>'<span class="dvs">'+f[1]+B('f-'+f[0],'◀')+'<b>'+(+(+ITUNE[f[0]]).toFixed(2))+'</b>'+B('f+'+f[0],'▶')+'</span>').join('')+
      B('copy','📋 Copy tuning',0,'one JSON line of the feel knobs you changed → the clipboard (and the console)')+B('rfeel','Reset feel',0,'every feel knob back to its default')+'</div>'+
    '<div class="dvr"><span class="dvl">COMBO</span>'+B('cmbR','📊 Beats',dev.cmbR!==0,'over the training dummy: your last 6 basic beats — 1 · 2 · FIN · HVY, the damage each one landed on it, its freeze (ms) and the time since the beat before (PT1 K2)')+   // (PT1 K2) the chain's lab
      B('cmbG','⏱ Beat gaps',!!dev.cmbG,'a 2-second timeline over the dummy: a tick at each beat (gold = the finisher) and its freeze under it (debug only)')+B('dum40','🎯 Dummy 40u',0,'a training dummy 40u ahead of you (crawl only) — strike it — tap the chain, hold a HEAVY',!isl)+
      B('pdR','💨 Perfect dash',dev.pdR!==0,'over the skill bar after a dash: the 0.16 s dash, THE PERFECT DASH window in gold (its last pdPre s + pdPost s after the end — FEEL: pd pre / pd post), a tick a press (gold perfect · red too soon · grey late) and the last press’s offset (PT2 X2)')+'</div>'+
    '<div class="dvr"><span class="dvl">HAZARD</span><span class="dvs">'+B('hz-','◀')+'<b style="min-width:84px">'+HAZ_KINDS[devHz%HAZ_KINDS.length][1]+'</b>'+B('hz+','▶')+'</span>'+   // (PT1 K7a) the hazard lab: place a prop · clear them · a blast anywhere
      B('hzput','Place',1,'that prop 60u ahead of you, in the clearing you stand in (crawl only) · a set piece ⟳: this isle lands again with one in its first big fight room (below ground: the rift)',!isl)+B('hzclr','Clear props',0,'every prop on this isle or floor goes',!isl)+B('hzboom','🔥 Boom here',0,'a powder keg’s blast at the cursor (the mouse) or 60u ahead (keys / pad) — try a chain',!isl)+'</div>'+
    (()=>{ const L=sndList(), n=L[devSnd.i%L.length];   // (C9) THE SOUND BOARD: every designed recipe (and every old beep, 'old:') — one at a time or the lot
      return '<div class="dvr"><span class="dvl">SOUND</span><span class="dvs">'+B('snd-','◀')+'<b style="min-width:108px">'+n+' <i style="color:#7fd6c8" title="S recorded · Y synth · B the old beep">'+sndPath(n)+'</i></b>'+B('snd+','▶')+'</span>'+B('sndplay','▶ Play',1,'play it (throttles off) — the designed recipe, or the old beep')+
        B('sndall',devSnd.run?'■ Stop':'▶▶ All '+L.length,!!devSnd.run,'play every sound in turn (≈0.4 s apart) — the console lists each: [sfx] name ✓ (a voice made) · window.__sndBoard holds the run')+
        '<span id="dvsnd" style="color:#9fb6dd;margin-left:4px">'+sndMeter()+'</span></div>'; })()+
    (()=>{ const L=musJukeIds(), id=L[devMus.i%L.length]||'', T=MUS_T[id]||MUS_TD[id], nl=T&&T.lv?T.lv.length:1; if(devMus.lv<0 || devMus.lv>=nl) devMus.lv=nl-1;   // (PT1 M1) THE 🎵 JUKEBOX: a track · its intensity · play · stop · back to the director
      return '<div class="dvr"><span class="dvl">🎵 MUSIC</span><span class="dvs">'+B('mus-','◀')+'<b style="min-width:108px" title="'+(T?T.n:'')+'">'+id+'</b>'+B('mus+','▶')+'</span>'+
        '<span class="dvs">lv'+B('mlv-','◀')+'<b>'+devMus.lv+'</b>'+B('mlv+','▶')+'</span>'+B('musplay','▶ Play',1,'play it through the Bard (a crossfade from the last) — playing, ◀ ▶ lv set its intensity')+B('musstop','■ Stop',0,'fade the music out')+
        B('musauto','Auto ⟲',!MUS.juke && !MUS.hold,'hand the music back to the director (■ Stop & ▶ Play take it over till then)')+'<span id="dvmus" style="color:#9fb6dd;margin-left:4px">'+musMeter()+'</span></div>'; })()+
    '<div class="dvr"><span class="dvl">🎵 DIRECTOR</span>'+MUS_UNKK.map(q=>'<span class="dvs">'+q[0]+B('u-'+q[0],'◀')+'<b>'+(+(+MUS_UNK[q[0]]).toFixed(2))+'</b>'+B('u+'+q[0],'▶')+'</span>').join('')+   // (PT1 M2a) THE DIRECTOR: the unknown trigger's knobs (MUS_UNK) · rests × · repick · skip · what it wants
      '<span class="dvs">rest×'+B('rm-','◀')+'<b>'+MUS.restMul+'</b>'+B('rm+','▶')+'</span>'+B('mrepick','⟲ Repick',0,'the sea picks its tune again now (day or night) — musRepick()')+B('mskip','⏭ Tail',0,'the playing tune jumps to its tail — its `end` section\'s last bar (then its coda), else T (a stand-in: its last section) — and, if it rests, on its last loop: the rest follows')+
      '<span id="dvdir" style="color:#9fb6dd;margin-left:4px">'+musDirMeter()+'</span></div>';
  el.querySelectorAll('[data-dev]').forEach(b=>{ b.onclick=()=>devAct(b.dataset.dev); });
  if(fk){ const b=el.querySelector('[data-dev="'+fk+'"]'); if(b && !b.disabled) padSetFocus(b); } }
function devAct(a){
  if(a==='lv-'||a==='lv+') ptLv=clamp(ptLv+(a==='lv-'?-1:1),1,PTUNE.lvlCap);
  else if(a==='setlv'){ devSetLevel(ptLv); toast('🧬  Level '+plvl, (treePts()>0?treePts()+' passive point'+(treePts()>1?'s':'')+' to spend — Esc → ✦ Tree · ':'')+'full health'); }
  else if(a==='tpx'){ const g=treeBonus(5,'(DEV) bonus points'); if(!g) toast('✦  (DEV) the tree is full','35 points is every point a captain can earn'); }
  else if(a==='g1k') cargo.gold+=1000; else if(a==='g10k') cargo.gold+=10000;
  else if(a==='heal'){ player.maxhp=eMaxHp()+(mode==='island'?fedHp():0); player.hp=player.maxhp; }
  else if(a==='god') devGod=!devGod; else if(a==='one') devOneHit=!devOneHit; else if(a==='noon') ptNoon=!ptNoon;
  else if(a==='pd-'||a==='pd+') ptParD=clamp(ptParD+(a==='pd-'?-1:1),1,40);
  else if(a==='par'){ if(ptPar && ptPar.d===ptParD){ ptPar=null; EQ=eq0(); starterKit(ptKit||'sword'); kitGems(ptKit||'sword'); player.hp=Math.min(player.hp,player.maxhp); toast('⚔  Par kit off','your starter kit again — what you wore before waits in the satchel'); } else parKit(ptParD); }
  else if(a==='harbour'){ if(mode==='island' && ISL && !koBeat && !caveFade) leaveIsland(false); }
  else if(a==='prosp'){ if(prosp.lv>=PROSP.max){ prosp={lv:1, xp:0}; toast('⛏  (DEV) Prospector 1','back to a fresh pick'); } else { prosp.xp=prospNeed(prosp.lv); prospLevel(); } }
  else if(a==='mats'){ for(const k of LOOT_KEYS) matAdd(k,20); toast('🧺  (DEV) every material ×20', (mode==='island'&&ISL?'in your pouch':'in the Hold')+' — '+LOOT_KEYS.length+' kinds'); if(menuOpen && menuTab==='char') renderCharTab(); }
  else if(a==='reset'){ if(mode==='interior') leaveInterior(); if(mode==='port') ptNewChar(); }
  else if(a==='k-'||a==='k+') DEVS.k=(DEVS.k+(a==='k-'?DEV_KINDS.length-1:1))%DEV_KINDS.length;
  else if(a==='t-'||a==='t+') DEVS.t=(DEVS.t+(a==='t-'?DEV_TIERS.length-1:1))%DEV_TIERS.length;
  else if(a==='n-'||a==='n+') DEVS.n=clamp(DEVS.n+(a==='n-'?-1:1),1,20);
  else if(a==='spawn') devSpawn(DEV_KINDS[DEVS.k], DEV_TIERS[DEVS.t], DEVS.n);
  else if(a==='clear') devClearFoes();
  else if(a==='tok') dev.showTok=!dev.showTok;                                   // (drawTokDbg over the crawl + a line of counts)
  else if(a==='sh-'||a==='sh+') devSh=(devSh+(a==='sh-'?SHRINE_KEYS.length-1:1))%SHRINE_KEYS.length;
  else if(a==='shrine') devShrine(SHRINE_KEYS[devSh]);
  else if(a==='rock') devRock();                                                 // (PT1 K1: a rock 60u ahead)
  else if(a==='cmbR') dev.cmbR=dev.cmbR===0?1:0; else if(a==='cmbG') dev.cmbG=!dev.cmbG; else if(a==='dum40') devDummy(40);   // (PT1 K2: the COMBO row)
  else if(a==='pdR') dev.pdR=dev.pdR===0?1:0;                                     // (PT2 X2: the perfect dash's readout)
  else if(a==='hz-'||a==='hz+') devHz=(devHz+(a==='hz-'?HAZ_KINDS.length-1:1))%HAZ_KINDS.length;   // (PT1 K7a: the HAZARD row)
  else if(a==='hzput') devProp(HAZ_KINDS[devHz%HAZ_KINDS.length][0]); else if(a==='hzclr'){ if(mode==='island' && ISL){ const n=propClearAll(); toast('🛠  Cleared '+n+' prop'+(n===1?'':'s'),'crates, kegs & the rest — gone'); } } else if(a==='hzboom') devBoom();
  else if(a==='secF') dev.secF=!dev.secF;                                        // (C8b: force a secret room & a shrine on every crawl you land)
  else if(a==='legacy') legacyToggle();
  else if(a==='wpn'){ const t=DEV_TYPES[(DEV_TYPES.indexOf(wpnOf())+1)%DEV_TYPES.length], ip=EQ.main?EQ.main.ip:1, B=KIT_B[t];   // (C5a: the next type — a Driftwood base at your main's IP & its kit off-hand; the old pair goes to the satchel)
    const it=rollItem({base:B[0], r:0, ip, w:WPN0[t], so:0}), why=equipItem(it,{w:'new'},'main');
    if(!why && B[1] && !EQ.off){ const o=rollItem({base:B[1], r:0, ip, w:IBASE[B[1]].w?WPN0[t]:undefined, so:0}); equipItem(o,{w:'new'},'off'); }
    if(why) toast('🛠  '+it.n, why); else toast((DEV_WIC[t]||'🗡')+'  '+it.n+' in hand', DEV_WHY[t]+' — your old one is in the satchel'); }
  else if(a==='rack') devRack();
  else if(a==='is-'||a==='is+'){ devIt.s=(devIt.s+(a==='is-'?DEV_SLOTS.length-1:1))%DEV_SLOTS.length; if(devIt.r===3) devIt.pk=0; }
  else if(a==='ir-'||a==='ir+'){ devIt.r=clamp(devIt.r+(a==='ir-'?-1:1),0,4); devIt.pk=0; }
  else if(a==='pw-'||a==='pw+'){ const n=Math.max(1,devPwList().length); devIt.pk=(devIt.pk+(a==='pw-'?n-1:1))%n; }   // (C6b) the power / unique picker
  else if(a==='pwlog') devPowLog();
  else if(a==='ip-'||a==='ip+') devIt.ip=clamp(devIt.ip+(a==='ip-'?-1:1),1,60);
  else if(a==='give') devGive();
  else if(a==='gm-'||a==='gm+') devGem.i=(devGem.i+(a==='gm-'?GEM_KEYS.length-1:1))%GEM_KEYS.length;
  else if(a==='gl-'||a==='gl+') devGem.lv=clamp(devGem.lv+(a==='gl-'?-1:1),1,GEM_XP.max);
  else if(a==='ggive') devGiveGem(GEM_KEYS[devGem.i], devGem.lv);
  else if(a==='castall') devCastAll();
  else if(a.startsWith('f-')||a.startsWith('f+')){ const f=DEV_FEEL.find(q=>q[0]===a.slice(2)); if(f) ITUNE[f[0]]=+clamp(ITUNE[f[0]]+(a[1]==='-'?-f[2]:f[2]),f[3],f[4]).toFixed(3); }
  else if(a==='copy') copyTuning();
  else if(a==='snd-'||a==='snd+'){ const n=sndList().length; devSnd.i=(devSnd.i+(a==='snd-'?n-1:1))%n; }   // (C9) the sound board
  else if(a==='sndplay') sndPlay(sndList()[devSnd.i%sndList().length]);
  else if(a==='sndall') sndAll();
  else if(a==='mus-'||a==='mus+'){ const n=Math.max(1,musJukeIds().length); devMus.i=(devMus.i+(a==='mus-'?n-1:1))%n; devMus.lv=-1; }   // (PT1 M1) the jukebox (M5a: the skins listed after their tune)
  else if(a==='mlv-'||a==='mlv+'){ const L=musJukeIds(), id=L[devMus.i%L.length], T=MUS_T[id]||MUS_TD[id]; devMus.lv=clamp(devMus.lv+(a==='mlv-'?-1:1),0,(T&&T.lv?T.lv.length:1)-1); if(MUS.juke && MUS.juke.id===id) musJuke(id,devMus.lv); }
  else if(a==='musplay'){ const L=musJukeIds(); musJuke(L[devMus.i%L.length],devMus.lv); } else if(a==='musstop') musStop(); else if(a==='musauto') musAuto();
  else if(a.startsWith('u-')||a.startsWith('u+')){ const q=MUS_UNKK.find(k=>k[0]===a.slice(2)); if(q) MUS_UNK[q[0]]=+clamp(MUS_UNK[q[0]]+(a[1]==='-'?-q[1]:q[1]),q[2],q[3]).toFixed(3); }   // (PT1 M2a) the director's knobs
  else if(a==='rm-'||a==='rm+'){ const L=[0.05,0.1,0.2,0.5,1]; let i=L.indexOf(MUS.restMul); if(i<0) i=4; MUS.restMul=L[clamp(i+(a==='rm-'?-1:1),0,4)]; }
  else if(a==='mrepick') musRepick(); else if(a==='mskip'){ const I=MUS.cur, e=I && !I.fin && I.R.end; if(I && I.endLoops) I.loopsDone=Math.max(I.loopsDone,I.endLoops-1); musSkipTo(e||'T', e?I.R.secs[e].b:1); }   // (G12 FIX: the real ending — `end` + coda)
  else if(a==='rfeel'){ for(const k of FEEL_KEYS) ITUNE[k]=DEFAULT_ITUNE[k]; toast('↺  Feel reset','every feel knob at its default'); }
  if(a!=='sndplay' && a!=='sndall') sfx('ui_click'); renderDev(); if(ptestOpen) renderCrawlBoard(); }   // (C9: the board's own plays aren't masked by the click)
function devSetLevel(L){ plvl=clamp(L|0,1,PTUNE.lvlCap); pxp=0; para=0; paraXp=0; ptPar=null; treeSet([]);   // (the tree is handed back: the level's points wait unspent in ✦ Tree — plus any bonus points · G4 fix: treeSet → treeChanged clamps the dash charges, the Tide & the badge)
  recalcStats(); player.maxhp=eMaxHp()+(mode==='island'?fedHp():0); player.hp=player.maxhp; }
/* the PAR KIT ⚔d (§13): the par player at danger d — level Lp(d) (Salt & the legacy skills cleared) wearing the PAR GEAR SET at IP d (parGearSet: a
   Cutlass carrying the par hit, a Tricorn the par armour & life — nothing else; what you wore goes to the satchel). C5b adds par-level gems. */
function parKit(d){ d=clamp(Math.round(d),1,200); plvl=clamp(Math.round(Lp(d)),1,PTUNE.lvlCap); pxp=0; para=0; paraXp=0; treeSet([]);   // (the par player holds no passive nodes — the par model is level + gear + gems; its points wait unspent)
  ptPar={d}; parGearSet(d); parGems(d);                                          // (C5b: the par player's gem — Whirl at gL(d))
  recalcStats(); player.maxhp=eMaxHp()+(mode==='island'?fedHp():0); player.hp=player.maxhp;
  const v=verdictOf(d,youBand()); toast('⚔  Par kit — ⚔'+d, 'Lv '+plvl+' · a hit '+fmtDmg(eSlashDmg())+' · life '+fmtDmg(eMaxHp())+' · armour −'+Math.round(armourDR(d)*100)+'% · reads '+v.word+' (band ⚔'+youBand().toFixed(1)+')'); }
/* SPAWN: kind × tier × count, 80u ahead of you, into the clearing you stand in (its danger) — a boss with no living rival wears the boss bar ·
   the TRAINING DUMMY: bottomless HP, never moves or strikes, and floats its live DPS (5 s) · hits/s · stagger over its head (drawDummies) */
function devSpawn(kind,tier,n){ if(mode!=='island' || !ISL || koBeat) return;
  let cur=-1; for(const cl of ISL.clearings) if(inClear(cl,player.x,player.y)){ cur=cl.id; break; }
  if(cur<0){ let bd=1e18; for(const cl of ISL.clearings){ const q=(cl.x-player.x)**2+(cl.y-player.y)**2; if(q<bd){ bd=q; cur=cl.id; } } }
  const cl=ISL.clearings[cur], dg=(cl&&cl.dlE)||ISL_LVL||1, fl=Math.hypot(player.fx,player.fy)||1, ax=player.x+player.fx/fl*80, ay=player.y+player.fy/fl*80, bm=ISL.biome.mods;
  const spot=i=>{ for(let t=0;t<24;t++){ const a=Math.random()*TAU, dd=(i||t)?8+Math.random()*(12+n*3):0, x=ax+Math.cos(a)*dd, y=ay+Math.sin(a)*dd; if(islFree(x,y,7)) return {x,y}; }
    for(let t=0;t<24;t++){ const a=Math.random()*TAU, dd=24+Math.random()*60, x=player.x+Math.cos(a)*dd, y=player.y+Math.sin(a)*dd; if(islFree(x,y,7)) return {x,y}; } return {x:player.x, y:player.y}; };
  const base=()=>({vx:0, vy:0, flash:0, stun:0, dlE:dg, clear:cur, cw:Math.random()<0.5?1:-1, fa:Math.random()*TAU, sd:Math.random()*TAU, devSp:1});   // (every spawner sets dlE — crawl2 notes)
  let made=0;
  for(let i=0;i<n;i++){ const p=spot(i); let en;
    if(kind==='dummy'){ en=Object.assign(base(),{type:'dummy', dummy:true, x:p.x, y:p.y, r:11, hp:1e12, hp0:1e12, st:'idle', tmr:0, aggro:false, met:1, fa:Math.PI/2, t0:MET?MET.t:itime, dd:[], dh:[]}); stagMax(en);   // (its stagger bar: an elite boar's at this danger)
      enemies.push(en); made++; continue; }                                      // (a dummy never counts toward its clearing — it never falls)
    if(BOSSES[kind]){ const B=BOSSES[kind], hp=Math.max(10,Math.round((kind==='greatboar'?1:LTUNE.lordK)*bossHP(dg)));
      en=Object.assign(base(),{type:B.t, guard:true, boss:kind, x:p.x, y:p.y, r:B.r, hp, hp0:hp, ph:1, st:'idle', tmr:0.8, aggro:true, chain:0, cw:1});
      if(!ISL.boss || ISL.boss.dead){ ISL.boss=en; ISL.bannerT=-1; ISL.bossGoneT=-1; } }
    else if(tier==='swarm'){ const t=['boar','snake','crab','dingo'].indexOf(kind)>=0?kind:kind==='termqueen'?'termite':'boar', h=eHp('swarm',dg);   // (C8c: a queen's swarm — termites)
      en=Object.assign(base(),{type:t, fodder:true, x:p.x, y:p.y, r:Math.max(5,ERAD[t]*0.62), hp:h, hp0:h, st:'run', tmr:0, aggro:true, spd:0.85+Math.random()*0.5}); }
    else { const el=tier!=='normal', h=Math.max(1,Math.round((EHP[kind]||EHP.boar)*(kind==='boar'?(bm.boarHPMul||1):1)*(el?ELITE_HP:1)*hpScale(dg)));
      en=Object.assign(base(),{type:kind, elite:el, x:p.x, y:p.y, r:(ERAD[kind]||11)+(el?2.5:0), hp:h, hp0:h, st:'idle', tmr:0.4+Math.random(), aggro:true, scorch:kind==='ooze'&&(bm.hazard==='lava'||!!bm.magma)});
      if(tier==='magic'||tier==='rare') devTraits(en, tier==='rare'?2:1); }
    enemies.push(en); if(cl) cl.enemyCount++; made++; }
  toast('🛠  Spawned '+made+' × '+devKindName(kind)+(BOSSES[kind]||kind==='dummy'?'':' · '+tier), kind==='dummy'?'bottomless — its DPS floats over it':'⚔'+dg+' (this clearing’s danger)'); }
let devSh=0;                                                                     // (C8b) the DEV shrine picker
function devShrine(k){ if(mode!=='island' || !ISL || koBeat) return; const fl=Math.hypot(player.fx,player.fy)||1; let x=player.x+player.fx/fl*50, y=player.y+player.fy/fl*50;   // a shrine of kind k, 50u ahead
  if(!islFree(x,y,8)){ x=player.x; y=player.y-40; if(!islFree(x,y,8)){ x=player.x; y=player.y; } }
  let cl=0; for(const c of ISL.clearings) if(inClear(c,x,y)){ cl=c.id; break; }
  ishrines.push({x, y, k, used:false, cl, dev:1}); toast('🛠  ⛩ '+SHRINE_K[k].n+' shrine placed', glyph('interact')+' at it — '+SHRINE_K[k].tx); }
function devRock(){ if(mode!=='island' || !ISL || koBeat) return null; const fl=Math.hypot(player.fx,player.fy)||1; let x=player.x+player.fx/fl*60, y=player.y+player.fy/fl*60;   // (PT1 K1) a rock 60u ahead — the bow fix's test target
  if(!islWalk(x,y)){ x=player.x; y=player.y-60; if(!islWalk(x,y)){ x=player.x; y=player.y; } }
  const dl=ISL_LVL||1, nd={x, y, type:'rock', cry:false, hp:3, r:10, dead:false, flash:0, dl, ot:oreTier(dl), dev:1}; inodes.push(nd);
  toast('🛠  ⛏ a rock placed','60u ahead — shoot it (keys & the pad lean onto it when no foe is near)'); return nd; }
function devDummy(d){ if(mode!=='island' || !ISL || koBeat) return null; const fl=Math.hypot(player.fx,player.fy)||1, x=player.x+player.fx/fl*d, y=player.y+player.fy/fl*d;   // (PT1 K2) a training dummy d u ahead — the COMBO readout's target
  let cur=0; for(const cl of ISL.clearings) if(inClear(cl,x,y)){ cur=cl.id; break; } const dg=(ISL.clearings[cur]&&ISL.clearings[cur].dlE)||ISL_LVL||1;
  const en={type:'dummy', dummy:true, x, y, r:11, hp:1e12, hp0:1e12, st:'idle', tmr:0, aggro:false, met:1, fa:Math.PI/2, sd:0, cw:1, vx:0, vy:0, flash:0, stun:0, dlE:dg, clear:cur, devSp:1, t0:MET?MET.t:itime, dd:[], dh:[]};
  stagMax(en); enemies.push(en); toast('🛠  A training dummy',d+'u ahead — tap the strike: its readout shows each beat (1 · 2 · FIN · HVY — hold for a heavy)'); return en; }
/* (PT1 K7a) THE HAZARD ROW: a prop of the picked kind 60u ahead (in the clearing you stand in — its danger) · 🔥 Boom here: a keg's blast at the cursor / 60u ahead */
const HAZ_KINDS=[['barrel','🧨 Powder keg'],['crate','📦 Crate'],['cover','🧱 Cover'],['pillar','🏛 Pillar'],['spike','🪤 Spike plate'],['dart','🪶 Dart trap'],['rockfall','🪨 Loose rocks'],['grass','🌾 Grass patch'],['shallows','🌊 Shallows patch'],['fetid','☣ Fetid pool'],
  ['sp:temple','🏛 Temple ⟳'],['sp:arena','🏟 Arena ⟳'],['sp:ledge','⛰ Ledge ⟳'],['sp:ravine','🌉 Ravine ⟳']];   // ([kind, label] — PT1 K8: the traps · K9a: tall grass · K9b: the shallows, a fetid pool · K11: the set pieces — ⟳ the isle lands again with one)
let devHz=0;
function devSetPiece(k){ const S=PT_SFT[k]; if(!S || mode!=='island' || !ISL || koBeat) return null;   // (PT1 K11) a set piece can't be dropped into a room already laid — the isle lands again with it forced in (the Feature row's rule)
  if(!ptMode){ toast('🛠  '+S[0],'the Proving Grounds only — the Crawl Board’s Feature row'); return null; }
  if(ISL.cave){ if(k!=='ravine'){ toast('🛠  '+S[0],'below ground only the rift — pick 🌉 Ravine'); return null; } PTB.cave=true; PTB.f=ISL.cave.f; PTB.cf='rift'; PTB.duel=false; ptLand(); toast('🛠  🌉 A rift floor','floor '+PTB.f+' again — every chamber that can is a rift'); return true; }
  PTB.feat=k; PTB.cave=false; PTB.duel=false; ptLand(); toast('🛠  '+S[0],'this isle again — '+S[1].replace(/^[^:]*: /,'')); return true; }
function devProp(k){ if(k.slice(0,3)==='sp:') return devSetPiece(k.slice(3));   // (PT1 K11) a set piece: the isle lands again with it
  if(k==='grass' && mode==='island' && ISL && !koBeat) return devGrass();   // (PT1 K9a) a patch of tall grass
  if((k==='shallows'||k==='fetid') && mode==='island' && ISL && !koBeat) return devWater(k);   // (PT1 K9b) a shallows patch · a fetid pool
  if(mode!=='island' || !ISL || koBeat || !(PROP[k]||TRAP[k])) return null; if(TRAP[k]) return devTrap(k); if(k==='cover'||k==='pillar') return devPropTile(k);   // (PT1 K7b: a tile prop snaps to the tiles · K8: a trap)
  const fl=Math.hypot(player.fx,player.fy)||1; let x=player.x+player.fx/fl*60, y=player.y+player.fy/fl*60;
  if(!islFree(x,y,6)){ x=player.x; y=player.y-60; if(!islFree(x,y,6)){ x=player.x; y=player.y; } }
  let cl=-1; for(const c of ISL.clearings) if(inClear(c,x,y)){ cl=c.id; break; } const dg=(cl>=0 && ISL.clearings[cl].dlE)||ISL_LVL||1;
  const P=propMk(k,x,y,cl,dg,k==='crate'?propCrateV(ISL.cave?'cave':ISL.biome.key):''); P.dev=1;
  toast('🛠  '+(k==='barrel'?'🧨 A powder keg':'📦 A crate')+' placed','60u ahead — '+(k==='barrel'?'strike it and get clear':'two blows break it')); return P; }
function devBoom(){ if(mode!=='island' || !ISL || koBeat) return; let x, y; if(aimDev==='mouse' && cvMX>=0){ const m=mouseWorld(cvMX,cvMY); x=m.x; y=m.y; } else { const fl=Math.hypot(player.fx,player.fy)||1; x=player.x+player.fx/fl*60; y=player.y+player.fy/fl*60; }   // (G8 fix: the cursor's last spot over the game — not the button under it)
  let cl=null; for(const c of ISL.clearings) if(inClear(c,x,y)){ cl=c; break; } boom(x,y,ITUNE.kegR,{dl:(cl&&cl.dlE)||ISL_LVL||1, dev:1}); }
function devTraits(en,rar){ const pool=TRAIT_KEYS.filter(k=>!TRAITS[k].no[en.type]), tr=[], n=rar===2?2+(Math.random()<0.4?1:0):1;   // random traits for a DEV magic / rare (no danger gate)
  while(tr.length<n && pool.length){ const k=pool.splice((Math.random()*pool.length)|0,1)[0]; if(TRAIT_X[k] && TRAIT_X[k].some(x=>tr.indexOf(x)>=0)) continue; tr.push(k); }
  if(tr.length) applyTraits(en,rar,tr); }
function devClearFoes(){ if(mode!=='island' || !ISL) return; let cur=-1, n=0; for(const cl of ISL.clearings) if(inClear(cl,player.x,player.y)){ cur=cl.id; break; }
  for(const e of [...enemies]){ if(e.dead) continue; if(!(e.devSp || e.aggro || e.clear===cur || (e.x-player.x)**2+(e.y-player.y)**2<400*400)) continue;   // the fight you're in (and every DEV spawn)
    if(e.dummy){ const i=enemies.indexOf(e); if(i>=0) enemies.splice(i,1); e.dead=true; n++; continue; }
    killEnemy(e,true); n++; if(!ISL) return; }                                   // (self: no XP, no loot — its clearing still counts it gone)
  if(ISL.boss && ISL.boss.dead && ISL.bossGoneT<0) ISL.bossGoneT=3; unsealBoss();
  toast('🛠  Cleared '+n+' foe'+(n===1?'':'s'),'no XP, no loot'); }
/* the dummy's readout: live DPS over the last 5 s and hits a second (the meters' own window, on the run clock), and its stagger (a dash until C3a) */
function dummyHit(en,v,cb){ const t=MET?MET.t:itime; evPush(en.dd,t,v,5); evPush(en.dh,t,1,5); if(cb) cb.d+=v; }   // (PT1 K2 cb: the DEV COMBO beat that landed it)
function drawDummies(){ let any=false, bt=false; for(const en of enemies) if(en.dummy){ any=true; break; } if(!any) return;
  const s=islScale(), U=hudU(), t=MET?MET.t:itime; ctx.textAlign='center'; ctx.font='700 '+Math.round(11*U)+'px system-ui';
  for(const en of enemies){ if(!en.dummy) continue; const sx=Math.round(izX((en.x-icamX)*s+IW/2)), sy=Math.round(izY((en.y-en.r*3.9-icamY)*s+IH/2)); if(sx<-120||sx>CSSW+120||sy<-40||sy>CSSH+40) continue;
    const w5=Math.min(5,Math.max(0.1,t-(en.t0||0))), dps=evSum(en.dd,t,5)/w5, hps=evSum(en.dh,t,5)/w5;
    const txt='DPS '+fmtDmg(dps)+'  ·  '+hps.toFixed(2)+' hits/s  ·  stagger '+(en.stgImm>0?'recovering '+en.stgImm.toFixed(1)+'s':en.stgMax?Math.round(100*(en.stg||0)/en.stgMax)+'%':'—')+(en.brkN?'  ·  '+en.brkN+' break'+(en.brkN>1?'s':''):'');   // (an elite-sized bar at its danger — §2.7)
    const w=Math.round(ctx.measureText(txt).width+18*U), h=Math.round(20*U); pxPanel(sx-(w>>1), sy-h, w, h, PXP.dim); panTxt(txt, sx, sy-Math.round(h/2)+Math.round(4*U), '#ffe9a6');
    if(!bt && (dev.cmbR!==0 || dev.cmbG) && BEATL.length){ bt=true; beatDraw(sx, sy-h-Math.round(4*U), U); ctx.font='700 '+Math.round(11*U)+'px system-ui'; } }   // (PT1 K2) the COMBO readout (over the first dummy)
  ctx.textAlign='left'; }
/* (PT1 K2) THE COMBO READOUT over the dummy: a row a beat (1 · 2 · FIN · DS the dash strike), its damage on the dummy, its freeze & its own length (G6 fix) ·
   ⏱ Beat gaps: the last 2 s as a timeline — a tick a beat (gold the finisher, taller), its freeze as a red bar under it */
function beatDraw(cx,by,U){ const L=BEATL, n=L.length, lh=Math.round(12*U); let y0=by;
  if(dev.cmbR!==0){ ctx.font='700 '+Math.round(10*U)+'px system-ui'; const T=L.map(e=>(e.ds?'DS':e.hv?'HVY':e.fin?'FIN':String(e.b+1))+'  ·  '+fmtDmg(e.d*DMG_DISP)+'  ·  '+e.hs+' ms  ·  '+(e.len!=null?e.len.toFixed(2)+' s':'— s')); let w=0; for(const t of T) w=Math.max(w,ctx.measureText(t).width);   // (G6 fix: each row's own length — '—' until the next beat starts)
    w=Math.round(w+16*U); const h=n*lh+Math.round(6*U); y0=by-h; pxPanel(cx-(w>>1), y0, w, h, PXP.dim);
    for(let j=0;j<n;j++) panTxt(T[j], cx, y0+Math.round(3*U)+lh*j+Math.round(lh*0.78), L[j].hv?'#ffe08a':L[j].fin?'#ffd23f':L[j].ds?'#9ff0ff':'#e8eef4'); }   // (PX: HVY — THE HEAVY — in a paler gold)
  if(dev.cmbG){ const W=Math.round(170*U), H=Math.round(22*U), x0=Math.round(cx-W/2), yb=y0-Math.round(4*U)-H, now=last/1000; pxPanel(x0, yb, W, H, PXP.dim);
    ctx.fillStyle='rgba(232,238,244,.25)'; for(let q=0;q<=4;q++) ctx.fillRect(x0+Math.round(W*q/4), yb+H-Math.round(4*U), 1, Math.round(3*U));   // (½ s marks)
    for(const e of L){ const x=Math.round(x0+W*(1-(now-e.t)/2)); if(x<x0+2 || x>x0+W-2) continue; ctx.fillStyle=e.fin?'#ffd23f':'#e8eef4'; const th=Math.round((e.fin?14:9)*U); ctx.fillRect(x, yb+H-Math.round(5*U)-th, Math.max(1,Math.round(U)), th);
      if(e.hs>0){ ctx.fillStyle='#ff6a5a'; ctx.fillRect(x, yb+H-Math.round(5*U), Math.max(1,Math.round(W*e.hs/2000)), Math.max(1,Math.round(2*U))); } } } }
