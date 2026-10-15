"use strict";
/* FILE: js/debug/playtest_log.js
THE PLAYTEST LOG (DEV/playtest tool, off by default): original lines 5186-5453 (build 5109cd5), moved verbatim, in place.
On via a ?playtest link or the Options switch: an event ring, frame costs, and a note box (0 / F2 key, pad R3, the chip)
that keeps a screenshot, the context and the last 10 s; notes in localStorage, screenshots in IndexedDB; export / copy / clear.
Entry points: plogEv and PLE (the hooks across the game, always behind if(PLOG)), plogFt (every frame from frame, original
  line 41113 (build 5109cd5)), plogOn, plogStart, plogStop, plogSet, plogOpen, plogPad, plogSaveRoom (from saveWrite),
  plogBlock and plogWire (the Options tab), plogDb, plogExport, plogCopy, plogClear; console only: plogImport.
Globals it owns: PLOG_ON, PLOG_KEY, PLOG_IMG, PLOG_N, PLOG_FT, PLOG_WIN, PLOG_SHOT, PLOG_IMGMAX, PLOG_LSMAX, PLOG_TAGS, PLE,
  PLE_CO, PLOG_DB, PLOG_IDBMAX, PLOG_EXP_WAIT, the lets plogUrl, plogStore, plogImgs, plogClrArm, plogWarned, plogDbP, plogPend,
  and about 60 plog functions. PLOG itself stays declared in the inline core (original line 4580 (build 5109cd5)).
Main globals it reads from elsewhere (inside functions, at runtime only): PLOG, toast, env, boat, wind, time, started, mode,
  player, ISL, INT, DK, PRT, HEX, SAGA, SCN, FMV, keys, cv, inDev, the open-panel flags, padFocusEl, padSetFocus, padNavList,
  padRelease (the inline core); sfx (js/audio/sfx.js); audioOn, SNDP, SNDX (js/audio/audio.js); GEMS, MATS
  (js/data/crawl2.js); fDay, shipNm, bearingName, the gear and story names (later inline parts).
Load-time statements (2): try plogUrl=/[?&]playtest.../.test(location.search) (original line 5199 (build 5109cd5)) and
  let plogDbP=null, plogPend=Promise.resolve() (original line 5378 (build 5109cd5)); the rest are pure-literal consts and
  lets plus function declarations. Nothing is called at load. The boot tail calls plogOn, plogStart and plogDb later at load
  (original lines 42158-42159 (build 5109cd5)), so this file must load before the last inline part.
*/
/* ============================ THE PLAYTEST LOG (PT1 PL — the owner's decision, 2026-10-02) ============================
   Off by default: 🎮 Options → 📝 Playtest log (this device's choice, never the voyage's) or a ?playtest link. On, the 0 key (F2 too; the pad: click the RIGHT
   STICK · the mouse: the 📝 by the ☰) opens a small note box anywhere — the game runs on behind it, but every key is the box's while it's up
   (Enter saves · Shift+Enter a new line · Esc cancels · Tab or 1-4 the tag · Alt+1-5 the feel; the pad: A presses · B cancels · Start saves ·
   X the tag · Y the feel). A note keeps its moment, caught at the press: a small screenshot, where you are & what you carry, the last 10 s off a
   fixed ring (hits given & taken with their sources, kills, the KO, loot, wakes & secures, hazards, sounds, music, toasts, mode changes, errors),
   the frame cost of the last 3 s, the errors since the last note, the build. Export = ONE json file (screenshots inside) · Copy = a Markdown
   summary · Clear asks twice. Off = PLOG null: no ring, no listeners, no chip — every hook in the game is a bare `if(PLOG)`. */
const PLOG_ON='mj_boats_plog_on', PLOG_KEY='mj_boats_plog_v1', PLOG_IMG='mj_boats_plog_img_v1';   // (this device: the switch · the notes — text kept forever · their screenshots — capped)
const PLOG_N=512, PLOG_FT=360, PLOG_WIN=10, PLOG_SHOT=61440, PLOG_IMGMAX=1500000, PLOG_LSMAX=3500000;   // ring slots (2^n) · frame costs kept · a note's seconds of events · a screenshot's data-URL ≤ 60 KB · the screenshots ≤ 1.5 M chars · the site's whole storage held under 3.5 M chars (the voyage's own save & the site's other games share it)
const PLOG_TAGS=[['bug','🐞','Bug'],['idea','💡','Idea'],['good','👍','Feels good'],['off','👎','Feels off']];
const PLE={hit:1, hurt:2, kill:3, ko:4, loot:5, drop:6, wake:7, secure:8, haz:9, sfx:10, mus:11, trk:12, sting:13, toast:14, mode:15, err:16}, PLE_CO=[0,1,1,1,0,1,0,0,0,0,1];   // the ring's kinds · the ones a burst folds into one line ×N (hit · hurt · kill · loot · sfx)
let plogUrl=false, plogStore=null, plogImgs=null, plogClrArm=0, plogWarned=0;   // the ?playtest link · the notes & the screenshots (read on first need) · Clear's "really?" · the store's "made room" word, once a session
try{ plogUrl=/[?&]playtest(=|&|$)/.test(location.search); }catch(e){}
function plogOn(){ if(plogUrl) return true; try{ return localStorage.getItem(PLOG_ON)==='1'; }catch(e){ return false; } }
function plogSet(on){ try{ if(on) localStorage.setItem(PLOG_ON,'1'); else localStorage.removeItem(PLOG_ON); }catch(e){} if(!on) plogUrl=false; if(on) plogStart(); else plogStop(); }
function plogStart(){ if(PLOG) return;
  PLOG={rt:new Float64Array(PLOG_N), rk:new Uint8Array(PLOG_N), ra:new Array(PLOG_N).fill(''), rb:new Array(PLOG_N).fill(''), rv:new Float32Array(PLOG_N), rw:new Float32Array(PLOG_N), rc:new Uint32Array(PLOG_N), n:0,
    ft:new Float32Array(PLOG_FT), fi:new Float32Array(PLOG_FT), fn:0, fl:0, md:'', err:[], fe0:window.__frameErr|0, box:null, q:0, ce:console.error, cw:null};
  const ce=PLOG.ce; PLOG.cw=function(){ try{ plogErrAdd(Array.prototype.map.call(arguments,a=>a&&a.stack?a.stack:String(a)).join(' ')); }catch(e){} return ce.apply(console,arguments); };   // (an error the game logs is kept for the next note)
  console.error=PLOG.cw; addEventListener('keydown',plogKey,true); addEventListener('error',plogErrEv); addEventListener('unhandledrejection',plogErrEv);
  plogDom(); plogChip(); plogDb(); }   // (PT2 X2: the screenshots' IndexedDB opens — and takes over any older pictures — as the log comes on)
function plogStop(){ const L=PLOG; if(!L) return; if(L.box) plogClose(false); removeEventListener('keydown',plogKey,true); removeEventListener('error',plogErrEv); removeEventListener('unhandledrejection',plogErrEv);
  if(console.error===L.cw) console.error=L.ce; PLOG=null; plogChip(); }
/* THE RING: a fixed buffer of strings the game already holds (ids, foe types, labels) and numbers — nothing is built until a note asks */
function plogEv(k,a,b,v,w){ const L=PLOG; if(!L || L.q) return; const t=performance.now()/1000; if(b==null) b=''; v=v||0; w=w||0;
  if(PLE_CO[k]) for(let q=1;q<=4 && q<=L.n;q++){ const j=(L.n-q)&(PLOG_N-1); if(L.rk[j]===k && L.ra[j]===a && L.rb[j]===b && t-L.rt[j]<0.5){ L.rt[j]=t; L.rc[j]++; L.rv[j]+=v; L.rw[j]=k===PLE.hurt?w:L.rw[j]+w; return; } }   // (the same again within ½ s, among the last 4: one line ×N)
  const i=(L.n++)&(PLOG_N-1); L.rt[i]=t; L.rk[i]=k; L.ra[i]=a==null?'':a; L.rb[i]=b; L.rv[i]=v; L.rw[i]=w; L.rc[i]=1; }
function plogSfx(id){ const L=PLOG; if(L) L.q=1; try{ sfx(id); } finally{ if(L) L.q=0; } }   // (the log's own clicks & words never land in its ring)
function plogToast(a,b){ const L=PLOG; if(L) L.q=1; try{ toast(a,b); } finally{ if(L) L.q=0; } }
function plogFt(ts,c){ const L=PLOG, i=(L.fn++)%PLOG_FT, m=started?mode:'title'; L.ft[i]=c; L.fi[i]=L.fl?ts-L.fl:0; L.fl=ts; if(m!==L.md){ plogEv(PLE.mode,m,L.md); L.md=m; } }   // (frame(): its cost & the gap since the last · a mode change)
function plogErrAdd(s){ const L=PLOG; if(!L) return; s=String(s).slice(0,400); if(L.err.length<20) L.err.push(s); plogEv(PLE.err,s.slice(0,160).replace(/\s+/g,' ')); }
function plogErrEv(e){ plogErrAdd(e.type==='unhandledrejection' ? 'unhandled rejection: '+String(e.reason&&e.reason.stack||e.reason) : String(e.message||'error')+' @'+String(e.filename||'').split('/').pop()+':'+(e.lineno|0)); }
function plogKey(e){ const L=PLOG; if(!L) return; const B=L.box;
  if(!B){ const tg=e.target, typing=tg&&(tg.tagName==='INPUT'||tg.tagName==='TEXTAREA'||tg.tagName==='SELECT'||tg.isContentEditable);   // (owner: F2 doesn't reach every keyboard — the 0 key, right of 9, opens a note; F2 still works · never while a text box has the keys)
    if((e.key==='0'||e.code==='Digit0'||e.code==='Numpad0'||e.key==='F2') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey){ e.preventDefault(); e.stopPropagation(); if(!e.repeat){ inDev='kb'; plogOpen('key'); } } return; }
  e.stopPropagation(); inDev='kb'; const ta=document.getElementById('plText'), k=e.key, dg=/^(Digit|Numpad)([0-9])$/.exec(e.code||'')||/^()([0-9])$/.exec(k);   // (the box is up: no key reaches the game — the note keeps its letters, the rest is the box's)
  if(k==='Escape'){ e.preventDefault(); plogClose(false); return; }
  if(k==='Enter' && !e.shiftKey){ e.preventDefault(); plogSave(); return; }
  if(k==='Tab'){ e.preventDefault(); plogTag(e.shiftKey?-1:1); return; }
  if(k==='F2'){ e.preventDefault(); return; }
  if(dg && e.altKey){ e.preventDefault(); plogScore(+dg[2]); return; }
  if(dg && !e.ctrlKey && !e.metaKey && +dg[2]>=1 && +dg[2]<=4 && ta && !ta.value.length){ e.preventDefault(); plogTagSet(PLOG_TAGS[+dg[2]-1][0],1); return; }   // (1-4 pick the tag till you start typing — then they're digits)
  if(ta && e.target!==ta && k.length===1 && !e.ctrlKey && !e.metaKey && !e.altKey) ta.focus(); }   // (typing lands in the note wherever the focus was)
/* THE MOMENT — caught when the box opens */
function plogNm(c){ return c ? String(c.port ? c.city : (c.customName||c.label||c.name||'an isle')) : '—'; }
function plogClock(){ const h=((env.dayT||0)*24)%24, m=Math.floor((h%1)*60); return 'Day '+(fDay()+1)+' '+String(Math.floor(h)).padStart(2,'0')+':'+String(m).padStart(2,'0'); }
function plogBuild(){ let snd='?'; try{ snd=(audioOn?'on':'muted')+' · music '+(SNDP.musOn?'on':'off')+' · samples '+SNDX.st; }catch(e){}
  return {ver:'PT2', save:SAVE_KEY, sv:SAVE_SV, wg:WGEN.V, url:location.pathname+location.search, mod:document.lastModified, screen:innerWidth+'×'+innerHeight+' @'+(window.devicePixelRatio||1), pad:padIndex!=null?String(padDevName).slice(0,40):'', sound:snd, wheel:typeof FMV!=='undefined'?{U:FMV.U.map(u=>+u.toFixed(2)), ev:FMV.wl.slice(-8).map(w=>w.dy+'/'+w.mode+'/'+w.ctrl)}:null}; }   // (CH Q1: wheel = the notch per deltaMode + the last 8 events, dy/mode/ctrl)
function plogUi(){ const D=DK, U=[menuOpen&&'menu: '+menuTab, shopOpen&&'shop', invOpen&&'satchel', mapOpen&&'chart', imapOpen&&'isle map', talkOpen&&'talk', journalOpen&&'contracts', flogOpen&&'fish log', LEDG&&'ledger', koOpen&&'KO card',
    introOpen&&'intro', caveOpen&&'cave card', renaming&&'naming', summaryOpen&&'summary', ptestOpen&&'crawl board', devOn&&'DEV panel', D&&D.edit&&'decorating', D&&D.fish&&'hand-line', D&&D.sleep&&'asleep', D&&D.card&&'deck card', SCN&&'scene '+SCN.id+'#'+SCN.i];   // (IS1 FIX: a note written mid-scene names the scene & its op)
  return U.filter(Boolean).join(' · '); }
function plogWeather(){ const W=[env.dayName]; if(env.storm>0.2) W.push('storm '+Math.round(env.storm*100)+'%'); if(env.tempest>0.2) W.push('tempest'); if(env.fog>0.2) W.push('fog'); if(env.calm>0.2) W.push('calm'); if(env.drizzle>0.2) W.push('drizzle'); if(W.length===1) W.push('clear'); return W.join(', '); }
function plogSea(){ const r=Math.round, deg=r((((boat.a*180/Math.PI+90)%360)+360)%360), near=[];
  for(const c of cores){ const d=Math.hypot(c.x-boat.x,c.y-boat.y); if(d>9000) continue; near.push([d,c]); } near.sort((a,b)=>a[0]-b[0]);
  return {pos:[r(boat.x),r(boat.y)], heading:bearingName(Math.cos(boat.a),Math.sin(boat.a))+' '+deg+'°', kn:+(Math.abs(boat.spd)*0.11).toFixed(1), sail:r(clamp(boat.sail,0,1)*100)+'%', wind:bearingName(Math.cos(wind.a),Math.sin(wind.a))+' ×'+(+wind.str||0).toFixed(2),
    weather:plogWeather(), hull:r(hull)+'/'+hullMaxNow(), stores:provisions+'/'+provCap(), near:near.slice(0,3).map(q=>plogNm(q[1])+(q[1].port?' ⚓':' ⚔'+dangerOf(q[1]))+(q[1].cleared?' ⚑':'')+' '+r(q[0])+' u'),
    course:COURSE?String(COURSE.label||COURSE.k)+' '+r(Math.hypot(COURSE.x-boat.x,COURSE.y-boat.y))+' u':'', life:schools.length+' schools · '+whales.length+' whales'+(hunt?' · a hunt on':'')+(net?' · the net out':'')}; }
function plogIsle(){ const I=ISL, c=I.core, cv=I.cave, r=Math.round; let cl=null, sec=0, tot=0;
  for(const q of I.clearings||[]){ if(q.kind==='fight'||q.kind==='bonus'){ tot++; if(q.secured) sec++; } if(!cl && inClear(q,player.x,player.y)) cl=q; }
  let alive=0, awake=0, near=0; const ty={};
  for(const en of enemies){ if(en.dead || en.dummy) continue; alive++; if(en.aggro) awake++; if((en.x-player.x)**2+(en.y-player.y)**2<360000){ near++; const k=en.guard?(en.boss||en.type)+' (boss)':en.elite?en.type+' (elite)':en.rar?en.type+' (rare)':en.type; ty[k]=(ty[k]||0)+1; } }
  return {isle:isleLabel(), dg:ISL_LVL, biome:I.biome?String(I.biome.key||''):'', cave:cv?'floor '+cv.f+' of '+cv.max:'', claimed:!!c.cleared, pos:[r(player.x),r(player.y)], rooms:sec+'/'+tot+' secured',
    room:cl?{id:cl.id, kind:cl.kind||'', secured:!!cl.secured, sp:cl.sp||'', left:cl.enemyCount|0}:null, foes:{alive, awake, within600:near, types:ty}, props:iprop.length, traps:itrap.length}; }
function plogYou(){ const r=Math.round, G={}; let wp='';
  try{ for(const s of EQ_SLOTS){ const it=EQ[s]; if(it) G[s]=itName(it)+' ('+(IRAR[it.r]||{n:'?'}).n+')'; } wp=wpnOf(); }catch(e){}
  const bar=[]; try{ for(let i=0;i<6;i++){ const g=barGem(i); bar.push(g?GEMS[g.g].n+' L'+g.lv+(barLive(i)?'':' (inert)'):'—'); } }catch(e){}
  return {lvl:plvl, hp:r(player.hp||0)+'/'+r(player.maxhp||0), tide:r(tide), flask:flask.ch+'/'+flaskCap()+((draughts.h|0)+(draughts.g|0)?' + '+((draughts.h|0)+(draughts.g|0))+' draught'+((draughts.h|0)+(draughts.g|0)>1?'s':''):''), gold:cargo.gold|0, weapon:wp, gear:G, bar}; }
function plogCtx(){ const o={mode:started?(ptMode?'proving · ':'')+mode:'title', ui:plogUi(), clock:started?plogClock():'', voyageT:Math.round(time), sessionT:Math.round(performance.now()/1000), build:plogBuild()}; let w='';
  try{ if(!started) w='the title screen';
    else if(mode==='sea' || mode==='deck'){ o.sea=plogSea(); if(mode==='deck' && DK){ o.deck={ship:shipNm(), stage:SHIP?SHIP.stg|0:0, level:DK.lv, pilot:DK.pilot?DK.pilot.mode||'':'', crew:(DK.crew||[]).length};
        w='on deck ('+DK.lv+') of '+shipNm()+' · S'+o.deck.stage+(o.deck.pilot?' · the Master: '+o.deck.pilot:'')+' · '; } else w='at sea · ';
      w+='('+o.sea.pos.join(', ')+') '+o.sea.heading+' · '+o.sea.kn+' kn · '+o.clock+' · '+o.sea.weather+(o.sea.near[0]?' · near '+o.sea.near[0]:''); }
    else if(mode==='port' && PRT){ const c=PRT.core; o.port={town:plogNm(c), size:PORT_SIZE_NAME[PRT.SZ]||'', rep:ptMode?0:repTier(c.idx), pos:[Math.round(player.x),Math.round(player.y)]}; w='in port — '+o.port.town+' ('+o.port.size+') · '+o.clock; }
    else if(mode==='interior' && INT){ o.room={kind:String(INT.kind||''), town:PRT?plogNm(PRT.core):''}; w='inside the '+o.room.kind+(o.room.town?' at '+o.room.town:'')+' · '+o.clock; }
    else if(mode==='island' && ISL){ const I=o.isle=plogIsle(); w=(I.cave?I.cave+' under ':'ashore — ')+I.isle+' ⚔'+I.dg+' '+I.biome+(I.room?' · room '+I.room.id+' ('+I.room.kind+(I.room.sp?', '+I.room.sp:'')+(I.room.secured?', secured':', '+I.room.left+' left')+')':' · between rooms')+' · '+I.foes.within600+' foes near ('+I.foes.awake+' awake of '+I.foes.alive+')'; }
    else if(mode==='hex' && HEX){ o.hex={phase:HEX.phase||'', turn:HEX.turn|0}; w='the Maelstrom table ('+o.hex.phase+')'; }
    else w=mode;
    if(started) o.you=plogYou();
    if(started && !ptMode && SAGA){ const S=SAGA, r1=v=>Math.round((+v||0)*10)/10, tA={}; for(const k in S.tA) tA[k]=r1(S.tA[k]);   // (INTROSTORY C15: the story's place — the step & phase, the intro's play time, each area's)
      o.story={intro:S.io===1 ? S.st+'/'+S.ph : S.io===2 ? 'the skip cards' : 'done ('+S.m+')', t:r1(S.t), tA, ch:(S.ch>=7 ? 'whole' : S.ch>=1 ? SAGA_ROM[S.ch] : '0')+' '+S.cph, leaves:[0,1,2,3,4,5,6].filter(i=>(S.pc>>i)&1).length, scene:SCN?SCN.id:''};
      if(S.io===1) w+=' · intro '+o.story.intro+' (play '+Math.round(S.t)+' s)'; else if(S.ch>=1 && S.ch<=6) w+=' · Chapter '+SAGA_ROM[S.ch]+' '+S.cph; } }catch(e){ o.ctxErr=String(e).slice(0,200); }
  if(ptMode) w+=' · the Proving Grounds'; if(o.ui) w+=' · ['+o.ui+']'; o.where=w;
  const Y=o.you; o.youLine=Y?'Lv '+Y.lvl+' · HP '+Y.hp+' · Tide '+Y.tide+' · flask '+Y.flask+' · '+Y.weapon+(Y.gear.main?' — '+Y.gear.main:'')+' · '+Y.gold+' g':'';
  return o; }
function plogPerf(){ const L=PLOG, n=Math.min(L.fn,PLOG_FT); if(!n) return null; const c=[], iv=[]; let s=0;
  for(let k=1;k<=n && s<=3000;k++){ const i=(L.fn-k)%PLOG_FT; c.push(L.ft[i]); if(L.fi[i]>0){ iv.push(L.fi[i]); s+=L.fi[i]; } }   // (the last ~3 s of frames)
  const q=(a,p)=>a.length?a[Math.min(a.length-1,Math.floor(a.length*p))]:0; c.sort((x,y)=>x-y); iv.sort((x,y)=>x-y); let m=0; for(const v of iv) m+=v;
  return {frames:c.length, p95:+q(c,0.95).toFixed(2), max:+c[c.length-1].toFixed(2), fps:m?Math.round(1000*iv.length/m):0, gap95:+q(iv,0.95).toFixed(1)}; }
function plogGem(b){ return (typeof GEMS!=='undefined' && GEMS[b]) ? GEMS[b].n : b; }
function plogLine(k,a,b,v,w,c){ const x=c>1?' ×'+c:'', r=Math.round;
  switch(k){ case PLE.hit: return 'hit '+a+' '+r(v)+(b?' ('+plogGem(b)+')':'')+(w>0?' · '+w+' crit':'')+x;
    case PLE.hurt: return 'HURT by '+a+' −'+r(v)+(b?' ('+b+')':'')+' → '+r(w)+' HP'+x;
    case PLE.kill: return 'kill '+a+(b?' ('+b+')':'')+x;
    case PLE.ko: return 'KO — '+a;
    case PLE.loot: return 'loot '+(b||(MATS[a]?MATS[a].n:a==='gold'?'coin':a))+(v>1?' ×'+r(v):'');
    case PLE.drop: return 'drop '+b+' ('+a+')';
    case PLE.wake: return 'wake: a pack of '+r(w)+' in room '+r(v)+' ('+a+')';
    case PLE.secure: return 'SECURED room '+r(v)+(a?' ('+a+')':'')+(b?' · '+b:'');
    case PLE.haz: return 'hazard: '+a+(b?' '+b:'');
    case PLE.sfx: return 'sfx '+a+x;
    case PLE.mus: return 'music '+(b||'—')+' → '+a+' (lv '+r(v)+')';
    case PLE.trk: return 'track '+a+(b?' ('+b+')':'');
    case PLE.sting: return 'sting '+a;
    case PLE.toast: return 'toast “'+a+(b?' — '+b:'')+'”';
    case PLE.mode: return 'mode '+(b||'—')+' → '+a;
    case PLE.err: return 'ERROR '+a; }
  return String(a); }
function plogEvents(){ const L=PLOG, t=performance.now()/1000, n=Math.min(L.n,PLOG_N), A=[];
  for(let q=n;q>=1;q--){ const i=(L.n-q)&(PLOG_N-1); A.push(i); } A.sort((a,b)=>L.rt[a]-L.rt[b]);
  let k=A.findIndex(i=>t-L.rt[i]<=PLOG_WIN); if(k<0) k=A.length; k=Math.max(Math.min(k,A.length-12),0);   // (the last 10 s — or, after a quiet spell (a menu, a pause), at least the last 12 things that happened)
  let W=A.slice(k), cut=0; if(W.length>120){ const G=W.filter(i=>L.rk[i]!==PLE.sfx), S=W.filter(i=>L.rk[i]===PLE.sfx), ks=new Set(G.slice(-120).concat(S.slice(S.length-Math.max(0,120-G.length)))); cut=W.length-ks.size; W=W.filter(i=>ks.has(i)); }   // (G21 FIX · G21V-B06: 120 lines at most — a busy fight's sound ids give way first: every hit, hurt, kill & wake of the 10 s, then the newest sounds)
  const O=W.map(i=>'−'+(t-L.rt[i]).toFixed(1)+' s · '+plogLine(L.rk[i],L.ra[i],L.rb[i],L.rv[i],L.rw[i],L.rc[i])); if(cut) O.unshift('('+cut+' older lines left out — sound ids first)'); return O; }
function plogShot(){ try{ const W0=cv.width, H0=cv.height; if(!W0 || !H0) return null; const c=plogShot.c||(plogShot.c=document.createElement('canvas')), g=c.getContext('2d'); let w=Math.min(640,W0), q=0.62;
    for(let k=0;k<6;k++){ const h=Math.max(1,Math.round(w*H0/W0)); c.width=w; c.height=h; g.imageSmoothingEnabled=true; g.drawImage(cv,0,0,w,h);
      let u=c.toDataURL('image/webp',q); if(u.indexOf('data:image/webp')!==0) u=c.toDataURL('image/jpeg',q);   // (WebP where the browser makes it, else JPEG)
      if(u.length<=PLOG_SHOT) return u; if(q>0.4) q-=0.12; else w=Math.round(w*0.8); } }catch(e){} return null; }
/* THE BOX */
function plogDom(){ if(document.getElementById('plBox')) return;
  const ch=document.createElement('div'); ch.id='plChip'; ch.className='hidden'; ch.title='Playtest log — 0 (the pad: click the right stick) writes a note'; document.body.appendChild(ch);
  ch.onclick=e=>{ e.stopPropagation(); plogOpen('chip'); }; for(const ev of ['pointerdown','mousedown','mouseup']) ch.addEventListener(ev,e=>e.stopPropagation());
  const B=document.createElement('div'); B.id='plBox'; B.className='hidden';
  B.innerHTML='<div class="pltop"><b>📝 Playtest note</b><span id="plWhere"></span><span id="plCnt"></span></div>'+
    '<div class="plrow">'+PLOG_TAGS.map(T=>'<button class="sbtn ghost" data-pltag="'+T[0]+'">'+T[1]+' '+T[2]+'</button>').join('')+'</div>'+
    '<div class="plrow"><span class="pllab">Feel</span>'+[1,2,3,4,5].map(i=>'<button class="sbtn ghost plsc" data-plsc="'+i+'">'+i+'</button>').join('')+'<span class="pllab">(optional · 1 rough → 5 great)</span></div>'+
    '<div class="plmain"><img id="plImg" alt=""><textarea id="plText" maxlength="2000" rows="3" placeholder="What happened? What did you expect? (the words are optional)"></textarea></div>'+
    '<div class="plfoot"><span id="plHint"></span><span class="plbtns"><button class="sbtn ghost" id="plExpB">⬇ Export</button><button class="sbtn ghost" id="plCopyB">📋 Copy</button><button class="sbtn ghost" id="plCancel">Cancel</button><button class="sbtn" id="plSave">Save note</button></span></div>';
  document.body.appendChild(B);
  for(const ev of ['pointerdown','pointerup','mousedown','mouseup','click','dblclick','wheel','contextmenu']) B.addEventListener(ev,e=>e.stopPropagation());   // (the box's clicks never reach the game — a chart tap, the decorator, a swing)
  B.querySelectorAll('[data-pltag]').forEach(b=>{ b.onclick=()=>plogTagSet(b.dataset.pltag); });
  B.querySelectorAll('[data-plsc]').forEach(b=>{ b.onclick=()=>plogScore(+b.dataset.plsc); });
  document.getElementById('plSave').onclick=()=>plogSave(); document.getElementById('plCancel').onclick=()=>plogClose(false);
  document.getElementById('plExpB').onclick=()=>plogExport(); document.getElementById('plCopyB').onclick=()=>plogCopy(); }
function plogChip(){ const k=document.getElementById('tPlogK'); if(k) k.classList.toggle('hidden',!PLOG);   // (R1a: the title's keys name the 0 key while the log is on)
  const c=document.getElementById('plChip'); if(!c) return; c.classList.toggle('hidden',!PLOG); if(PLOG) c.textContent='📝 '+plogLoad().notes.length; }
function plogOpen(src){ const L=PLOG; if(!L || L.box) return; plogDom();
  const B=L.box={src, iso:new Date().toISOString(), shot:plogShot(), ctx:plogCtx(), ev:plogEvents(), perf:plogPerf(), err:{frame:(window.__frameErr|0)-L.fe0, console:L.err.slice()}, fe:window.__frameErr|0, ne:L.err.length, tag:'', sc:0, af:document.activeElement, pf:padFocusEl};
  for(const k in keys) keys[k]=false; mouseL=false; mouseR=false; fmDrag=null; padRelease(); hvDrop();   // (nothing held carries on under the box · PX: a charge is dropped · STEEL: hvDrop — its riser stops too)
  const el=document.getElementById('plBox'), ta=document.getElementById('plText'), im=document.getElementById('plImg');
  document.getElementById('plWhere').textContent=B.ctx.where; ta.value=''; if(B.shot){ im.src=B.shot; im.style.display=''; } else { im.removeAttribute('src'); im.style.display='none'; }
  el.classList.remove('hidden'); plogBoxSync(); plogSfx('ui_open');
  if(src==='pad'){ inDev='pad'; plogBoxSync(); padSetFocus(el.querySelector('[data-pltag]')); } else { try{ ta.focus(); }catch(e){} } }
function plogClose(saved){ const L=PLOG, B=L&&L.box; if(!B) return; L.box=null; const el=document.getElementById('plBox'), ta=document.getElementById('plText');
  if(el) el.classList.add('hidden'); try{ if(ta) ta.blur(); }catch(e){}
  if(padFocusEl && el && el.contains(padFocusEl)) padSetFocus(B.pf && B.pf.isConnected ? B.pf : null);
  try{ if(B.af && B.af!==document.body && B.af.isConnected && B.af.focus) B.af.focus(); }catch(e){}
  if(!saved) plogSfx('ui_close'); }
function plogBoxSync(){ const B=PLOG&&PLOG.box, el=document.getElementById('plBox'); if(!B || !el) return;
  el.querySelectorAll('[data-pltag]').forEach(b=>b.classList.toggle('ghost',b.dataset.pltag!==B.tag));
  el.querySelectorAll('[data-plsc]').forEach(b=>b.classList.toggle('ghost',+b.dataset.plsc!==B.sc));
  const n=plogLoad().notes.length; document.getElementById('plCnt').textContent=n?n+' logged':'';
  document.getElementById('plHint').textContent=inDev==='pad' ? 'A presses · B cancels · Start saves · X the tag · Y the feel' : 'Enter saves · Shift+Enter a new line · Esc cancels · Tab or 1–4 the tag · Alt+1–5 the feel'; }
function plogTag(d){ const B=PLOG&&PLOG.box; if(!B) return; const L=['',...PLOG_TAGS.map(t=>t[0])]; B.tag=L[(L.indexOf(B.tag)+d+L.length)%L.length]; plogBoxSync(); plogSfx('ui_tick'); }
function plogTagSet(t,keep){ const B=PLOG&&PLOG.box; if(!B) return; B.tag=(B.tag===t && !keep)?'':t; plogBoxSync(); plogSfx('ui_tick'); }   // (a click on the lit tag puts it out · a key always picks)
function plogScore(n){ const B=PLOG&&PLOG.box; if(!B) return; B.sc=(n<1 || B.sc===n)?0:Math.min(5,n); plogBoxSync(); plogSfx('ui_tick'); }
function plogPad(P,eU,eD,eL,eR){ const el=document.getElementById('plBox'), B=PLOG.box; if(!el) return;
  if(P('menu')) plogSave(); else if(P('skill2')) plogTag(1); else if(P('deck')||P('skill3')) plogScore(B.sc>=5?0:B.sc+1);
  else padNavList(el,P,eU,eD,eL,eR,()=>plogClose(false)); }
function plogSave(){ const L=PLOG, B=L&&L.box; if(!B) return; const S=plogLoad(), ta=document.getElementById('plText'), C=B.ctx;
  let id=S.seq+1; while(S.notes.some(n=>n.id===id)) id++; S.seq=id;
  S.notes.push({id, iso:B.iso, tag:B.tag, score:B.sc, text:String(ta?ta.value:'').trim().slice(0,2000), mode:C.mode, where:C.where, you:C.youLine, ctx:C, events:B.ev, perf:B.perf, errors:B.err, shot:B.shot?1:0});
  L.err.splice(0,B.ne); L.fe0=B.fe; plogClose(true); const ok=plogPersist(); plogChip(); plogSfx('ui_ok');
  if(B.shot) plogImgQ([[id,B.shot]]);                                                              // (PT2 X2: the words are kept now — the picture goes to IndexedDB a moment later)
  const T=PLOG_TAGS.find(t=>t[0]===B.tag); plogToast('📝  Note '+id+' logged', (T?T[1]+' '+T[2]+' · ':'')+S.notes.length+' in the log'+(ok?' — 🎮 Options exports it':' — the device storage is FULL: export, then clear')); }
/* THE STORE — the notes in one key (kept whole) · their screenshots in IndexedDB since PT2 X2 (below) — the localStorage picture key (PLOG_IMG) is now only
   the stand-in for a browser with no IndexedDB, and what an older log left there (moved over on first open) */
function plogLoad(){ if(plogStore) return plogStore; let S=null; try{ S=JSON.parse(localStorage.getItem(PLOG_KEY)); }catch(e){}
  if(!S || typeof S!=='object' || !Array.isArray(S.notes)) S={v:1, seq:0, notes:[]}; S.notes=S.notes.filter(n=>n && typeof n==='object' && n.id>0); let m=S.seq|0; for(const n of S.notes) m=Math.max(m,n.id|0); S.seq=m; S.v=1; return plogStore=S; }
function plogImgsLoad(){ if(plogImgs) return plogImgs; let I=null; try{ I=JSON.parse(localStorage.getItem(PLOG_IMG)); }catch(e){}
  const O={}; if(I && typeof I==='object') for(const k in I) if(typeof I[k]==='string' && I[k].indexOf('data:image/')===0) O[k]=I[k]; return plogImgs=O; }
function plogLsOther(){ let n=0; try{ for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k===PLOG_KEY || k===PLOG_IMG) continue; n+=k.length+(localStorage.getItem(k)||'').length; } }catch(e){} return n; }
function plogPersist(){ const S=plogLoad(), I=plogImgsLoad(), nj=JSON.stringify(S), other=plogLsOther(), old=()=>Object.keys(I).sort((a,b)=>a-b)[0]; let dropped=0, tot=0;
  for(const k in I) tot+=I[k].length+12;
  while(tot>0 && (tot>PLOG_IMGMAX || other+nj.length+tot>PLOG_LSMAX)){ const k=old(); if(k==null) break; tot-=I[k].length+12; delete I[k]; dropped++; }
  let ok=false; try{ localStorage.setItem(PLOG_KEY,nj); ok=true; }catch(e){}
  if(!ok){ for(const k in I){ delete I[k]; dropped++; } try{ localStorage.removeItem(PLOG_IMG); localStorage.setItem(PLOG_KEY,nj); ok=true; }catch(e){} }   // (the words before the pictures)
  for(let t=0;t<60;t++){ try{ if(Object.keys(I).length) localStorage.setItem(PLOG_IMG,JSON.stringify(I)); else localStorage.removeItem(PLOG_IMG); break; }catch(e){ const k=old(); if(k==null) break; delete I[k]; dropped++; } }
  if(dropped && !plogWarned){ plogWarned=1; plogToast('📝  The playtest log made room','its oldest screenshots went (their notes stay) — export to keep them'); }
  return ok; }
function plogSaveRoom(str){ if(!localStorage.getItem(PLOG_IMG)) return false; const I=plogImgsLoad(); let n=0;   // (G21 FIX · G21V-C03: the voyage's save refused for room — the playtest log's oldest screenshots go, a quarter at a time, till it fits; their notes stay)
  for(let t=0;t<24;t++){ const K=Object.keys(I).sort((a,b)=>a-b); for(const k of K.slice(0,Math.max(1,Math.ceil(K.length/4)))){ delete I[k]; n++; }
    try{ if(Object.keys(I).length) localStorage.setItem(PLOG_IMG,JSON.stringify(I)); else localStorage.removeItem(PLOG_IMG); }catch(e){ continue; }
    try{ localStorage.setItem(SAVE_KEY,str); plogToast('📝  The playtest log made room for the voyage',n+' old screenshot'+(n>1?'s':'')+' went (their notes stay) — export to keep the rest'); return true; }catch(e){} if(!Object.keys(I).length) break; }
  return false; }
/* (PT2 X2) THE SCREENSHOTS IN INDEXEDDB — the owner's exported log had 5 notes with "shot":1 and "img":null: beside a voyage save, localStorage had no room
   left for pictures. Now the words stay in localStorage (PLOG_KEY, kept whole) and the pictures live in IndexedDB — DB PLOG_DB, store 'img'
   {id: the note's id, u: its data URL, t} — which has far more room. Async: a note keeps its words at once and its picture a moment later (plogImgQ
   chains every write on plogPend — an export or a clear waits for them). The pictures are capped at PLOG_IDBMAX, the oldest going first (a toast, once a
   session); a refused write (the quota) drops the oldest quarter and tries again (≤ 4). Any older pictures still in localStorage (PLOG_IMG) move over the
   first time the DB opens (at boot when there are some, else on first need) and that key goes. No IndexedDB at all (a locked-down browser): the old
   localStorage store stands in — plogImgsLoad / plogPersist / plogSaveRoom, unchanged. Export awaits both and embeds every picture; Clear clears both. */
const PLOG_DB='mj_boats_plog', PLOG_IDBMAX=200;
let plogDbP=null, plogPend=Promise.resolve();
function plogDb(){ if(plogDbP) return plogDbP;
  plogDbP=new Promise(res=>{ let rq; try{ if(!window.indexedDB) return res(null); rq=indexedDB.open(PLOG_DB,1); }catch(e){ return res(null); }
    rq.onupgradeneeded=()=>{ try{ const db=rq.result; if(!db.objectStoreNames.contains('img')) db.createObjectStore('img',{keyPath:'id'}); }catch(e){} };
    rq.onsuccess=()=>{ const db=rq.result; db.onversionchange=()=>{ try{ db.close(); }catch(e){} plogDbP=null; }; db.onclose=()=>{ if(plogDbP) plogDbP=null; }; res(db); };   // (PT2F · PT2F-4: the browser closed it (storage pressure, site data cleared) — the next write opens a fresh one)
    rq.onerror=()=>res(null); })
    .then(db=>db ? plogDbMigrate(db).then(()=>db,()=>db) : null);
  return plogDbP; }
function plogTx(db,mode,fn){ return new Promise((res,rej)=>{ let t, rq; try{ t=db.transaction('img',mode); rq=fn(t.objectStore('img')); }catch(e){ rej(e); return; }   // (resolves with the request's result once the transaction is done)
  t.oncomplete=()=>res(rq && 'result' in rq ? rq.result : undefined); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error||new Error('the write was aborted')); }); }
function plogDbMigrate(db){ let raw=null; try{ raw=localStorage.getItem(PLOG_IMG); }catch(e){} if(!raw) return Promise.resolve(0);
  let I=null; try{ I=JSON.parse(raw); }catch(e){} const K=I && typeof I==='object' ? Object.keys(I).filter(k=>+k>0 && typeof I[k]==='string' && I[k].indexOf('data:image/')===0) : [];
  const done=()=>{ try{ localStorage.removeItem(PLOG_IMG); }catch(e){} plogImgs=null; return K.length; };
  if(!K.length) return Promise.resolve(done());
  return plogTx(db,'readwrite',st=>{ for(const k of K) st.put({id:+k, u:I[k], t:Date.now()}); }).then(done); }   // (a failed move leaves them where they were)
function plogImgTrim(db,frac){ return plogTx(db,'readonly',st=>st.getAllKeys()).then(K=>{ K=(K||[]).slice().sort((a,b)=>a-b); const n=frac<1 ? Math.max(1,Math.ceil(K.length*frac)) : Math.max(0,K.length-frac);   // (frac < 1: that share of them · else: keep frac)
  if(!n) return []; const G=K.slice(0,n); return plogTx(db,'readwrite',st=>{ for(const k of G) st.delete(k); }).then(()=>{ plogShotGone(G); return G; }); }); }   // (PT2F: the ids that went — their notes say so)
function plogShotGone(G){ const S=plogLoad(), g=new Set(G.map(Number)); let k=0; for(const n of S.notes) if(n.shot && g.has(n.id)){ n.shot=0; n.shotGone=1; k++; } if(k) plogPersist(); return k; }   // (PT2F · PT2FV-B05: a trimmed picture's note is "shot":0 + "shotGone":1 — never "shot":1 with no picture)
function plogImgPut(pairs){ return plogDb().then(db=>{ if(!db){ const I=plogImgsLoad(); for(const [id,u] of pairs) I[id]=u; plogPersist();   // (no IndexedDB: the old store — and a picture it had no room for leaves its note "shot":0)
      const S=plogLoad(); let k=0; for(const [id] of pairs) if(!I[id]){ const n=S.notes.find(q=>q.id===id); if(n && n.shot){ n.shot=0; k++; } } if(k) plogPersist(); return k?'ls-full':'ls'; }
    let tries=0, reopen=0, qGone=0; const go=()=>plogTx(db,'readwrite',st=>{ for(const [id,u] of pairs) st.put({id, u, t:Date.now()}); }).then(()=>'idb', e=>{ const nm=String(e&&e.name||e);
        if(tries++<4 && /quota/i.test(nm)) return plogImgTrim(db,0.25).then(G=>{ qGone+=G.length; return go(); });
        if(!reopen && /InvalidState/i.test(nm)){ reopen=1; plogDbP=null; return plogDb().then(d2=>{ if(!d2) throw e; db=d2; return go(); }); }   // (PT2F · PT2F-4: a connection the browser closed — once more on a fresh one)
        throw e; });
    return go().then(r=>plogImgTrim(db,PLOG_IDBMAX).catch(()=>[]).then(G=>{ const n=G.length+qGone; if(n) plogToast('📝  The playtest log made room','its '+n+' oldest screenshot'+(n>1?'s':'')+' went ('+(qGone?'the storage was full':PLOG_IDBMAX+' kept')+' — their notes stay) — export to keep them'); return r; })); })   // (PT2F: every trim, its true count)
  .catch(e=>{ const S=plogLoad(); let k=0; for(const [id] of pairs){ const n=S.notes.find(q=>q.id===id); if(n && n.shot){ n.shot=0; k++; } } if(k) plogPersist();   // (the note says so — never "shot":1 with no picture)
    plogToast('📝  A screenshot could not be kept', String(e&&e.name||e).slice(0,60)+' — the note’s words are saved'); return 'fail'; }); }
function plogImgQ(pairs){ return plogPend=plogPend.then(()=>plogImgPut(pairs)); }               // (writes in order — an export or a clear waits for them)
function plogImgAll(){ return plogPend.then(()=>plogDb()).then(db=>{ const O={}, I=plogImgsLoad(); for(const k in I) O[k]=I[k];   // (any still in localStorage: the stand-in store)
  if(!db) return O; return plogTxR(db,'readonly',st=>st.getAll()).then(A=>{ for(const r of (A||[])) if(r && r.id>0 && typeof r.u==='string') O[r.id]=r.u; return O; }, ()=>null); }); }   // (PT2F: a read that fails gives null — the export then says its pictures couldn't be read, never that they're gone)
function plogTxR(db,mode,fn){ return plogTx(db,mode,fn).catch(e=>{ if(!/InvalidState/i.test(String(e&&e.name||e))) throw e; plogDbP=null; return plogDb().then(d2=>{ if(!d2) throw e; return plogTx(d2,mode,fn); }); }); }   // (PT2F · PT2F-4: a connection the browser closed — once more on a fresh one)
function plogImgClear(){ plogImgs={}; try{ localStorage.removeItem(PLOG_IMG); }catch(e){} return plogPend=plogPend.then(()=>plogDb()).then(db=>db ? plogTxR(db,'readwrite',st=>{ st.clear(); }) : null).catch(()=>null); }
const PLOG_EXP_WAIT=6000;   // (PT2F) an export waits this long (ms) for the pictures, then goes with the words alone
async function plogExportObj(){ let late=false; const I=(await Promise.race([plogImgAll().catch(()=>null), new Promise(r=>setTimeout(()=>r(null),PLOG_EXP_WAIT))]))||(late=true,{}), S=plogLoad();   // (late: still being written when the wait ran out — or the store couldn't be read)
  return {app:'BOATS playtest log', v:1, exported:new Date().toISOString(), build:plogBuild(), n:S.notes.length, late:late?1:0, notes:S.notes.map(n=>{ const u=n.shot?I[n.id]||null:null, o=Object.assign({},n,{img:u}); if(n.shot && !u){ o.shot=0; if(late) o.shotPending=1; else o.shotGone=1; } return o; })}; }   // (a note without a shot never borrows a picture · PT2F: a shot with no picture to give exports as "shot":0 and says why — gone, or still being written when the export gave up waiting)
function plogStamp(){ const d=new Date(), p=v=>String(v).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes()); }
async function plogExport(){ const S=plogLoad(); if(!S.notes.length){ plogToast('📝  The log is empty','0 writes a note'); return null; } let txt=null;
  try{ txt=JSON.stringify(await plogExportObj(),null,1); const u=URL.createObjectURL(new Blob([txt],{type:'application/json'})), a=document.createElement('a'); a.href=u; a.download='boats-playtest-'+plogStamp()+'.json'; a.style.display='none'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(u),8000);
    const ni=(txt.match(/"img": "data:image\//g)||[]).length;
    const np=(txt.match(/"shotPending": 1/g)||[]).length;
    plogToast('📝  Log exported', S.notes.length+' note'+(S.notes.length>1?'s':'')+(ni?' · '+ni+' screenshot'+(ni>1?'s':''):'')+' → your Downloads ('+Math.max(1,Math.round(txt.length/1024))+' KB)'+(np?' · '+np+' picture'+(np>1?'s':'')+' not ready (still being written, or unreadable) — export again in a moment':'')); }catch(e){ plogToast('📝  Export failed', String(e).slice(0,60)); }
  return txt; }
function plogImport(x){ let o=x; if(typeof x==='string'){ try{ o=JSON.parse(x); }catch(e){ return 0; } } if(!o || !Array.isArray(o.notes)) return 0;   // (an exported file back in — the console's, for the round trip · PT2 X2: its pictures go to IndexedDB — await plogPend for them)
  const S=plogLoad(), have=new Set(S.notes.map(n=>n.iso+'|'+n.text)), P=[]; let k=0;
  for(const n0 of o.notes){ if(!n0 || typeof n0!=='object' || have.has(n0.iso+'|'+n0.text)) continue; const n=Object.assign({},n0), img=n.img; delete n.img;
    if(!(n.id>0) || S.notes.some(q=>q.id===n.id)) n.id=S.seq+1; S.seq=Math.max(S.seq,n.id); S.notes.push(n); have.add(n.iso+'|'+n.text); if(typeof img==='string' && img.indexOf('data:image/')===0) P.push([n.id,img]); else if(n.shot) n.shot=0; k++; }   // (PT2F: an imported note with no picture can't claim one)
  if(k){ S.notes.sort((a,b)=>a.id-b.id); plogPersist(); plogChip(); if(P.length) plogImgQ(P); } return k; }
function plogMd(){ const S=plogLoad(), b=plogBuild(), d=s=>String(s||'').slice(0,16).replace('T',' ');
  let s='# BOATS playtest log — '+S.notes.length+' note'+(S.notes.length===1?'':'s')+'\n_'+d(new Date().toISOString())+' UTC · '+b.ver+' · '+b.save+' sv'+b.sv+' · '+b.url+'_\n';
  for(const n of S.notes){ const T=PLOG_TAGS.find(t=>t[0]===n.tag), E=n.errors||{}, P=n.perf;
    s+='\n## '+n.id+'. '+(T?T[1]+' '+T[2]:'📝 Note')+(n.score?' · feel '+n.score+'/5':'')+' · '+d(n.iso)+' UTC\n';
    if(n.text) s+='> '+String(n.text).replace(/\n/g,'\n> ')+'\n';
    s+='- where: '+(n.where||n.mode||'?')+'\n'; if(n.you) s+='- you: '+n.you+'\n';
    if(n.events && n.events.length) s+='- the last '+PLOG_WIN+' s: '+n.events.slice(-10).join(' · ')+'\n';
    if(P) s+='- frame: p95 '+P.p95+' ms · max '+P.max+' ms'+(P.fps?' · '+P.fps+' fps':'')+'\n';
    if(E.frame || (E.console && E.console.length)) s+='- errors: '+(E.frame?E.frame+' frame error(s) · ':'')+(E.console||[]).slice(0,3).map(x=>String(x).split('\n')[0]).join(' | ')+'\n';
    if(n.shot) s+='- screenshot: in the exported file\n'; }
  return s; }
function plogCopy(){ const md=plogMd(), done=()=>plogToast('📋  Summary copied','paste it anywhere — the screenshots are in the export');
  const fb=()=>{ try{ const t=document.createElement('textarea'); t.value=md; t.style.position='fixed'; t.style.opacity='0'; document.body.appendChild(t); t.select(); const ok=document.execCommand('copy'); t.remove(); if(ok) done(); else plogToast('📋  Copy failed','use Export instead'); }catch(e){ plogToast('📋  Copy failed','use Export instead'); }
    const ta=PLOG&&PLOG.box&&document.getElementById('plText'); if(ta) try{ ta.focus(); }catch(e){} };
  try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(md).then(done,fb); else fb(); }catch(e){ fb(); } return md; }
function plogClear(){ plogStore={v:1, seq:plogLoad().seq, notes:[]}; plogImgs={}; try{ localStorage.setItem(PLOG_KEY,JSON.stringify(plogStore)); localStorage.removeItem(PLOG_IMG); }catch(e){} plogImgClear(); plogChip(); plogToast('📝  Playtest log cleared','its notes & screenshots are gone from this device'); }   // (PT2 X2: IndexedDB's pictures too)
/* the 🎮 Options block (under 🔊 Sound & music) */
function plogBlock(){ const on=!!PLOG, n=plogLoad().notes.length, arm=plogClrArm>performance.now();
  return '<div id="plogBlock"><h3>📝 Playtest log</h3><div class="ctlrow"><span class="cln">Jot notes as you play'+(plogUrl?' <i>(on by the ?playtest link)</i>':'')+'</span><button class="sbtn'+(on?'':' ghost')+'" id="plogTog">'+(on?'📝 On':'Off')+'</button></div>'+
    '<p class="hint">'+(on?'<b>0</b> (the 0 key, right of 9 · the pad: click the <b>right stick</b> · or the 📝 by the ☰) opens a note box anywhere — the game runs on behind it · Enter saves, Esc cancels · each note keeps a screenshot, where you are, what you carry and the last '+PLOG_WIN+' s of what happened':'Off — turn it on and <b>F2</b> (the pad: click the right stick) jots a note with a screenshot and what was happening, for the playtest')+' · kept on this device'+(n?' · <b>'+n+'</b> note'+(n>1?'s':'')+' logged':'')+'</p>'+
    (n?'<div class="btns"><button id="plogExp">⬇ Export the log (one file)</button><button id="plogCopy">📋 Copy text summary</button><button id="plogClr">'+(arm?'Really clear '+n+' note'+(n>1?'s':'')+'?':'🗑 Clear log')+'</button></div>':'')+'</div>'; }
function plogWire(){ const H=document.getElementById('plogBlock'); if(!H) return; const g=id=>H.querySelector('#'+id);
  g('plogTog').onclick=()=>{ plogSet(!PLOG); plogSfx('ui_tick'); plogBlockRefresh(); };
  if(g('plogExp')) g('plogExp').onclick=()=>plogExport();
  if(g('plogCopy')) g('plogCopy').onclick=()=>plogCopy();
  if(g('plogClr')) g('plogClr').onclick=()=>{ if(plogClrArm>performance.now()){ plogClrArm=0; plogClear(); } else { plogClrArm=performance.now()+4000; setTimeout(plogBlockRefresh,4100); } plogBlockRefresh(); }; }
function plogBlockRefresh(){ const H=document.getElementById('plogBlock'); if(!H) return; const f=padFocusEl && H.contains(padFocusEl) ? padFocusEl.id : null;
  H.outerHTML=plogBlock(); plogWire(); if(f) padSetFocus(document.getElementById(f)||document.getElementById('plogTog')); }

