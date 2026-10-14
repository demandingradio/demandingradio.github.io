"use strict";
/* FILE: js/ports/museum.js
THE MUSEUM: home's donation hall (and the Proving Harbour's, session-only). Donations, milestone pay-outs, the NEW-find test,
  duplicates, the donation panel and the wall-case placards.
Moved verbatim from original lines 34680-34735 (build 5109cd5). RELOCATED (owner-approved P1, 2026-10-15): it loads just before
  THE GEAR (original line 16320 (build 5109cd5)), not at its old place among the ports code, because original line 16327
  (build 5109cd5) runs BAG=bag0() at load, and bag0 calls bagSize, which calls musGot (here). Keep this file before THE GEAR.
Entry points: musGot (bagSize, flaskCap, stats), musHas, musN, musNext, findNew, museumCases, musWant, spareFinds, spareN,
  relicTake, donate, museumMilestone, museumHTML, museumSub, museumAct (renderShop and wireShop), caseCard (intInteract).
Globals it owns: musFlash (written also by ptBoot and begin) and the 16 functions above.
Main globals it reads from elsewhere: museum, flask, GREN (original lines 11435-11436 (build 5109cd5)); MUS_MS, MUS_SETS,
  MUS_REN, MUS_BAG, MUS_TITLE, MUS_SRC, FINDS, MATS, LOOT_KEYS (js/data/crawl2.js); BAG, eqVer, bagSize, rollUnique,
  keepItem (THE GEAR, just after this file); matHave, matTake, famHave, famTake, pouchVer, SATC, flaskCap, treeBonus,
  recalcStats, firstCard, decorMuseum, decorMusTip, shopFocus, renderShop, price, capTitle, checkCapLevel, youBand, ptMode,
  pxImg, queueSave, toast, sfx (core, later inline parts and js files).
At load musGot reads only museum (original line 11436 (build 5109cd5)) and MUS_MS (original line 2167 (build 5109cd5)),
  and bagSize reads MUS_BAG (original line 2171 (build 5109cd5)): all load earlier. Everything else is runtime only.
Load-time statements: none that run code. One let musFlash=null plus 16 function declarations.
*/
/* ======================= THE MUSEUM (C7c · §7.8) =======================
   Home's museum (and the Proving Harbour's — session-only): its DONATION BOX takes one of each of the 24 finds (FINDS) · three WALL CASES show what the
   hall holds (minerals · fossils · artifacts) · MILESTONES by donations (MUS_MS) pay once, as they're crossed. A find the hall lacks reads ✦ NEW
   (its ground plate, the pickup feed, the geode reveal); a duplicate sells at the market (or answers a townsperson’s request for relics). */
let musFlash=null;                                                                                 // the panel's banner for the milestone just crossed
function musHas(q){ return museum.indexOf(q)>=0; }
function musN(){ return museum.length; }
function musGot(kind){ let n=0; for(const m of MUS_MS) if(m[1]===kind && museum.length>=m[0]) n++; return n; }   // how many of a kind of reward the hall has paid (the flask, the satchel, the gem XP read it)
function musNext(){ return MUS_MS.find(m=>museum.length<m[0])||null; }
function findNew(k){ k=String(k); return k.indexOf('f:')===0 && !!FINDS[k.slice(2)] && !musHas(k.slice(2)); }   // ✦ NEW: a find the museum lacks
function museumCases(){ return MUS_SETS.map(([s,n,wall,ic])=>({s, n, wall, ic, L:Object.keys(FINDS).filter(q=>FINDS[q][1]===s).map(q=>({q, got:musHas(q)}))})); }
function musWant(){ return LOOT_KEYS.filter(k=>MATS[k].f==='find' && findNew(k) && matHave(k)>0); }   // the finds aboard the hall still lacks
function spareFinds(){ return LOOT_KEYS.filter(k=>MATS[k].f==='find' && !findNew(k) && matHave(k)>0).sort((a,b)=>MATS[a].v-MATS[b].v); }   // duplicates (the cheapest first — a townsperson's relic request spends those)
function spareN(){ let n=0; for(const k of spareFinds()) n+=matHave(k); return n; }
function relicTake(n){ if(!(n>0) || famHave('relic')+spareN()<n) return false; const a=Math.min(n,famHave('relic')); if(a>0){ famTake('relic',a); n-=a; }   // (a townsperson's request for relics: an Old relic — else a find the hall already shows)
  for(const k of spareFinds()){ const t=Math.min(n,matHave(k)); if(t>0){ matTake(k,t); n-=t; } if(n<=0) break; } return true; }
function donate(k){ k=String(k); const q=k.slice(2); if(!MATS[k] || MATS[k].f!=='find') return 'that isn’t a find';
  if(musHas(q)) return 'the hall has its '+MATS[k].n+' already'; if(!(matHave(k)>0)) return 'you hold no '+MATS[k].n;
  matTake(k,1); museum.push(q); pouchVer++; sfx('ui_ok');
  const ms=MUS_MS.find(m=>m[0]===museum.length);
  if(ms) museumMilestone(ms); else { const nx=musNext(); toast('🏛  Donated — '+MATS[k].n, museum.length+' / 24'+(nx?' · '+(nx[0]-museum.length)+' more for '+nx[2]:'')); }
  if(!ptMode) queueSave(); return ''; }
function museumMilestone(ms){ const [n,kind,nm,tx]=ms; let got=tx;                                // a milestone pays out — once, the moment it's crossed
  if(kind==='flask') flask.ch=Math.min(flaskCap(),flask.ch+1);                                  // (the new charge comes full)
  else if(kind==='pt') treeBonus(1,'the museum’s thanks');
  else if(kind==='bag'){ while(BAG.length<bagSize()) BAG.push(null); SATC=null; }
  else if(kind==='gem') recalcStats();
  else if(kind==='white'){ const it=rollUnique('U13',Math.max(1,Math.round(youBand()))); keepItem(it); GREN+=MUS_REN; got='✦ '+it.n+' is yours · +'+MUS_REN+' renown · Capt. '+capTitle()+', '+MUS_TITLE; checkCapLevel(); }
  eqVer++; musFlash={n, t:performance.now(), got};
  sfx('claim',{gain:0.75});                                                                     // the fanfare (the renown rank-up's) — the panel's banner & the room's card say it (no toast over the card)
  firstCard({title:'THE MUSEUM — '+n+' DONATIONS', name:nm, col:'#ffd86b', icon:kind==='flask'?'🧪':kind==='white'?'⚔':kind==='bag'?'⭐':'✦', lines:[{txt:got}].concat(decorMuseum(n)), mus:1}); }   // (mus: the room plays it once the panel closes · stepping out drops it)
/* the donation panel (renderShop 'museum') — the milestone track · what you can give · the three cases · your duplicates */
function museumHTML(){ const n=musN(), nx=musNext();
  let h='<div class="mustrack">'+MUS_MS.map(m=>'<span class="msp'+(n>=m[0]?' on':nx===m?' nx':'')+'" title="'+m[2]+' — '+m[3]+decorMusTip(m[0])+'"><b>'+m[0]+'</b><small>'+m[2]+'</small></span>').join('')+'</div>';
  if(musFlash && performance.now()-musFlash.t<12000){ const m=MUS_MS.find(q=>q[0]===musFlash.n); if(m) h+='<div class="musflash">✦ '+m[0]+' donations — <b>'+m[2]+'</b><small>'+musFlash.got+'</small></div>'; }
  const W=musWant(); h+='<div class="shead">✦ For the hall — finds it lacks ('+W.length+')</div>';
  if(W.length){ h+=W.map(k=>'<div class="srow2"><span class="ic">'+pxImg(matPx(k),2)+'</span><span class="nm">'+MATS[k].n+' <b class="fnew">✦ NEW</b><small>'+MUS_SETS.find(s=>s[0]===MATS[k].set)[1]+' · worth '+price(MATS[k].v)+'g at a market — the hall pays in honour</small></span>'+
      '<button class="sbtn" data-act="don:'+k+'" data-fk="md-'+k.slice(2)+'">Donate</button></div>').join('');
    if(W.length>1) h+='<div class="stotal"><span>Give all <b>'+W.length+'</b> — '+(!nx?'the hall is complete':n+W.length>=nx[0]?'enough for '+nx[2].charAt(0).toLowerCase()+nx[2].slice(1):nx[2].charAt(0).toLowerCase()+nx[2].slice(1)+' then wants '+(nx[0]-n-W.length)+' more')+'</span><button class="sbtn" data-act="donall" data-fk="mdall">Donate all</button></div>'; }
  else h+='<div class="mempty">nothing new aboard — crack geodes at a forge, break rocks & ruins on the isles</div>';
  for(const C of museumCases()){ const g=C.L.filter(x=>x.got).length;
    h+='<div class="shead">'+pxImg(C.ic,2)+' '+C.n+' — '+g+' / '+C.L.length+' <small class="mwall">'+C.wall+'</small></div><div class="cabrow mcab">'+C.L.map(x=>{ const k='f:'+x.q, hv=!x.got&&matHave(k)>0;
      return x.got ? '<span class="cabslot mgot" title="'+MATS[k].n+' — in the case">'+pxImg(matPx(k),3)+'</span>'
        : hv ? '<span class="cabslot mhv" title="'+MATS[k].n+' — aboard: donate it">'+pxImg(matPx(k),3)+'<i>✦</i></span>'
        : '<span class="cabslot un" title="??? — '+MUS_SRC[x.q]+'">'+pxImg('qmark',2)+'</span>'; }).join('')+'</div>'; }
  const SP=spareFinds(); if(SP.length) h+='<div class="shead">Duplicates — the hall has these</div>'+SP.map(k=>'<div class="srow2"><span class="ic">'+pxImg(matPx(k),2)+'</span><span class="nm">'+MATS[k].n+'<small>sell at a market ('+price(MATS[k].v)+'g)</small></span><span class="qty">×'+matHave(k)+'</span></div>').join('');
  return h; }
function museumSub(){ const n=musN(), nx=musNext(); return n+' / 24 donated'+(nx?' · next: '+nx[2]+' at '+nx[0]:' · the hall is complete — '+MUS_TITLE); }
function museumAct(a){ let why='';
  if(a.indexOf('don:')===0){ why=donate(a.slice(4)); if(!why){ const W=musWant(); shopFocus=W.length?'md-'+W[0].slice(2):null; } }
  else if(a==='donall'){ for(const k of musWant()) donate(k); shopFocus=null; }
  if(why){ toast('🏛  The museum', why); sfx('nope'); }
  renderShop(); }
function caseCard(s){ const C=museumCases().find(c=>c.s===s), got=C.L.filter(x=>x.got), hint=s==='min'?'geodes hold them — crack one at any forge':s==='fos'?'rocks hide them — some shores more than others, the deep caves most of all':'ruins, hoards & the isles’ hidden places';   // (C7c) a wall case's placard
  return {title:C.n+' — '+got.length+' / '+C.L.length, icons:C.L.map(x=>({n:matPx('f:'+x.q), got:x.got})),
    body:(got.length?'In the case: '+got.map(x=>FINDS[x.q][0]).join(', ')+'. ':'Bare velvet, waiting. ')+(got.length<C.L.length?'Still wanted: '+(C.L.length-got.length)+' — '+hint+'. The donation box by the door takes them.':'Complete — the finest case on this sea.')}; }
