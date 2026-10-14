"use strict";
/* FILE: js/render/spr2_core.js
THE SPRITES 2.0 REGISTRY AND HELPERS (Project PX, the crawl's hand-placed pixel bodies): original lines 19345-19435
  (build 5109cd5), moved verbatim, in place after js/render/foe_sprites.js; spr2Build (the 41 templates) follows at
  original line 19436 (build 5109cd5).
The runtime that turns letter-row templates into small CPU-side canvases and draws them on the ESPR paint board (palettes
  and biome tints, the 16-way facing to a view, the whole scale k, frame names, the frame cache SPR2.m), the frame-authoring
  helpers spr2Build composes with, the marks height above a foe (spr2Top) and creature portraits (spr2Portrait).
  ITUNE.artSpr 0 (Tuning) switches it all off: the callers fall back to the old vector painters.
Entry points: spr2Pick (eSprite), spr2Draw (eBake), spr2Tpl and spr2K (allySpr, eBake, eFxPost, drawIslandWorld, the crawl
  HUD), spr2Face (drawAllies), spr2Player (plBody), spr2Top (HP bars, nameplates, DOOM, "!"), spr2Portrait (paintPortrait);
  SPR2.m is cleared by drawExplorerPix and buildIslandTune. spr2F, spr2Bob, spr2Mir, spr2Over, spr2Rep, spr2Shift and
  spr2Flip serve only spr2Build; spr2Rot has no callers.
Globals it owns: the consts SPR2 and SPR2_S0; the functions spr2Hex, spr2Lum, spr2Mul, spr2Tint, spr2Pal, spr2Face, spr2Cv,
  spr2Tpl, spr2K, spr2Name, spr2Names, spr2Idx, spr2Pick, spr2Draw, spr2Player, spr2F, spr2Bob, spr2Mir, spr2Over, spr2Rep,
  spr2Shift, spr2Top, spr2Portrait, spr2Rot, spr2Flip.
Main globals it reads from elsewhere (inside functions, at runtime only): TAU (index.html part 1), ITUNE
  (js/data/itune_defaults.js), ISL and bossTint (earlier inline code), ESPR, ESC_OL, escRim, ePose and pixBake
  (js/render/foe_sprites.js); declared later: spr2Build (the templates, next) and islScale (the crawl renderer).
Load-time statements: const SPR2 (original line 19356 (build 5109cd5), a new Map inside) and const SPR2_S0 (a literal); the
  rest are function declarations. Both, and the helpers, must exist before the idle pre-build (original line 22646
  (build 5109cd5)) runs spr2Build, so this file loads before the one that holds spr2Build.
*/
/* ============================ PROJECT PX — SPRITES 2.0 (from TG1 · hand-placed pixel bodies) ============================
   The crawl's creatures were vector-painted ovals snapped to texels — they read as circles. These are TEMPLATES: rows of letters, one
   texel each, authored in a 3/4 view at a base radius r0 (texels — ERAD × 200/270, the default texel) and drawn at a WHOLE scale k
   (spr2K: from the texel size alone, never the foe's radius — 1 at every real window) onto the same paint board the old painters used,
   so pixBake's dark line, the rank rings, the flash, the drowned & trait casts and the LRU caches all stay as they were. Three views by
   the 16-way facing index (D toward the camera · U away · S the profile facing right, the left its mirror); named frames (idle · walk ·
   atk · atk2 …, ≤ 16 a template, ≤ 8 frames a name — a name a view lacks shows idle). Letters: . empty · d m l h the body's
   dark/mid/light/highlight (a biome tint or an elite / lord palette re-maps them) · the rest are a kind's own (eyes k, tusks t, nose p…).
   cx0/cy0 = the texel on the body's centre (a view may carry its own). Frames bake to CPU-side canvases (willReadFrequently): a GPU
   canvas drawn into the CPU board flips the board onto the GPU path and every bake's read-back then stalls — TG1's 18–20 ms crawl.
   artSpr (Tuning) switches it all off → the old painters. */
const SPR2={tpl:{}, m:new Map(), cap:900, pk:{}};                       // (pk: spr2Pick's scratch — read before the next pick)
const SPR2_S0=200/270;                                                   // the authoring texel scale (islScale at 1280×800, camView 270, pixRows 200)
function spr2Hex(c){ return [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]; }
function spr2Lum(c){ const q=spr2Hex(c); return 0.299*q[0]+0.587*q[1]+0.114*q[2]; }
function spr2Mul(c,k){ const q=spr2Hex(c).map(v=>Math.max(0,Math.min(255,Math.round(v*k)))); return '#'+q.map(v=>v.toString(16).padStart(2,'0')).join(''); }
function spr2Tint(pal,tint){ const P=Object.assign({},pal); if(!tint) return P;                      // a biome's tint → the body's dark / mid / light
  if(typeof tint==='string'){ P.m=tint; P.d=spr2Mul(tint,0.62); P.l=spr2Mul(tint,1.3); P.h=spr2Mul(tint,1.4); return P; }   // (PX E1 lint: l ×1.3 — at ×1.22 a dark tint's m & l fell in one band under the grade: the volcanic boar)
  const a=tint.slice(0,3).sort((x,y)=>spr2Lum(x)-spr2Lum(y)); P.d=a[0]; P.m=a[1]||a[0]; P.l=a[2]||a[1]||a[0]; P.h=spr2Mul(P.l,1.15); return P; }
/* the palette (lord › elite › biome tint › base, then T.alt while en[T.alt.key]) → {P, k}: made once per template × mode (k keys the frame cache) — never mutated */
function spr2Pal(en,T){ const bm=(ISL&&ISL.biome&&ISL.biome.mods)||{}, tv=T.tint&&bm[T.tint], md=en.guard&&T.boss?'b':en.elite&&T.elite?'e':tv?'t'+tv:'p', al=T.alt&&en[T.alt.key]?1:0, k=md+al;
  const M=T._pc||(T._pc=new Map()); let o=M.get(k); if(o) return o;
  let P=md==='b'?Object.assign({},T.pal,T.boss):md==='e'?Object.assign({},T.pal,T.elite):md==='p'?T.pal:spr2Tint(T.pal,tv); if(al) P=Object.assign({},P,T.alt.pal);
  o={P, k:(T._id||(T._id=Object.keys(SPR2.tpl).find(q=>SPR2.tpl[q]===T)))+'|'+k}; M.set(k,o); return o; }
/* the view by the 16-way facing index (the same for fa and fa ± 2π): D fi 3–5 · U 11–13 · S mirrored 6–10 · S 14, 15, 0–2 */
function spr2Face(fa){ const fi=((Math.round(fa/(TAU/16))%16)+16)%16; return [fi>=3&&fi<=5?'D':fi>=11&&fi<=13?'U':'S', fi>=6&&fi<=10]; }
function spr2Cv(key,rows,P,mir,fl,eL){ let cv=SPR2.m.get(key); if(cv){ if(SPR2.m.size>SPR2.cap*0.7){ SPR2.m.delete(key); SPR2.m.set(key,cv); } return cv; }
  const h=rows.length, w=Math.max(...rows.map(r=>r.length)); cv=document.createElement('canvas'); cv.width=w; cv.height=h; const g=cv.getContext('2d',{willReadFrequently:true}), id=g.createImageData(w,h), d=id.data, E=eL?[]:null;   // (CPU-side: see the banner)
  for(let y=0;y<h;y++){ const r=rows[y]; for(let x=0;x<w;x++){ const ch=r[mir?w-1-x:x]||'.'; if(ch==='.' || ch===' ') continue; if(ch===eL) E.push(x,y); const c=fl?'#ffffff':(P[ch]||P.m||'#ff00ff'); const q=spr2Hex(c), i=(y*w+x)*4; d[i]=q[0]; d[i+1]=q[1]; d[i+2]=q[2]; d[i+3]=255; } }
  g.putImageData(id,0,0); cv._e=E; if(SPR2.m.size>=SPR2.cap){ let n=0; for(const k of SPR2.m.keys()){ SPR2.m.delete(k); if(++n>=120) break; } } SPR2.m.set(key,cv); return cv; }
function spr2Tpl(en){ if(!spr2Build.done) spr2Build(); const t=en.type, L=SPR2.tpl; return (en.guard && L[t+'Boss']) || (en.clone && L[t+'Clone']) || ((en.fodder || (en.gen|0)>0) && L[t+'Mini']) || L[t]; }   // (PX E1) a lord's own › a King's shadow › the Mini BY ROLE (the swarm · an ooze's halves, gen 1 — never by size) › the kind · (PX Z1) built on first use
/* k: ONE whole scale for a kind's normal, elite, mini and drowned alike — from the texel scale alone (px_critique M2) */
function spr2K(T,en,r){ const kt=islScale()/SPR2_S0*(T===SPR2.tpl.player ? ITUNE.pScale/1.5 : 1);   // (PX K7b: every lord has its own Boss template — the interim fractional clause is gone · T null: an ally)
  return kt<1.5 ? 1 : Math.round(kt); }
function spr2Name(en,T,pose){ const st=en.st; if(T.sel) return T.sel(en,pose);   // the frame's NAME now — the kind's own T.sel (PX E1), else TG1's rules: atk2 › atk › walk (moving, or always) › idle
  if(T.atk2 && T.atk2.indexOf(st)>=0) return 'atk2'; if(T.atk && T.atk.indexOf(st)>=0) return 'atk'; return (en.mv || T.always) ? 'walk' : 'idle'; }
function spr2Names(T){ if(T._nm) return T._nm; const s=['idle']; for(const f of ['S','D','U']){ const F=T[f]; if(F) for(const k in F) if(k[0]!=='_' && k!=='cx0' && k!=='cy0' && s.indexOf(k)<0) s.push(k); } return T._nm=s; }   // (idle first · ≤ 16 · not the anchors, not the _u fold cache)
function spr2Idx(T,name){ const i=spr2Names(T).indexOf(name); return i<0?0:Math.min(15,i); }
/* ONE computation per look (eSprite keys on it, eBake draws it): {T, face, mir, vi (the view's canonical facing), name, idx, frames, n, lift, pk} — or null (no template / artSpr 0) */
function spr2Pick(en,fa,pose,r){ const T=spr2Tpl(en); if(!T || !(ITUNE.artSpr>0)) return null;
  const fi=((Math.round(fa/(TAU/16))%16)+16)%16, face=T.faces==='D'?'D':fi>=3&&fi<=5?'D':fi>=11&&fi<=13?'U':'S', mir=face==='S'&&fi>=6&&fi<=10, F=T[face]||T.S;   // (spr2Face, inline: no array a foe a frame · PX E1 faces:'D' — one drawing every way)
  let name=spr2Name(en,T,pose), fr=F[name]; if(!fr){ name='idle'; fr=F.idle; }
  const lt=T.lift?Math.round(T.lift(en,r)):0, K=SPR2.pk, n=typeof fr[0]==='string'?1:fr.length, U=F._u||(F._u={});
  K.T=T; K.face=face; K.mir=mir; K.vi=face==='D'?4:face==='U'?12:mir?8:0; K.name=name; K.idx=spr2Idx(T,name); K.frames=fr; K.n=n; K.lift=lt;
  K.u=n>1?(U[name]||(U[name]=fr.map(q=>{ const s=q.join('|'); return fr.findIndex(o=>o.join('|')===s); }))):null;   // (a cycle's repeats — [A,B,A,B] — bake once: f → its first identical frame)
  K.pk=(T.alt&&en[T.alt.key]?1:0)+2*Math.min(15,Math.max(0,lt)); return K; }      // pk: the template pose code — all the key needs beyond view & name (px_critique M5)
/* a creature on the board: the pick's frame (f of its n), its palette, at the whole scale k, its view's anchor on the centre */
function spr2Draw(en,cx,cy,r,K,fl,f,kk){ if(!K) return false; const T=K.T, F=T[K.face]||T.S, i=K.n>1?(f|0)%K.n:0, rows=K.n>1||typeof K.frames[0]!=='string'?K.frames[i]:K.frames;
  const pal=spr2Pal(en,T), cv=spr2Cv(pal.k+'|'+K.face+'|'+K.name+i+'|'+(K.mir?1:0)+'|'+(fl?1:0),rows,pal.P,K.mir,fl,T.eyeL);
  const k=kk||spr2K(T,en,r), g=ESPR.ctx, ax=F.cx0!=null?F.cx0:T.cx0, ay=F.cy0!=null?F.cy0:T.cy0, x0=K.mir?(cv.width-1-ax):ax, X=Math.round(cx-(x0+0.5)*k), Y=Math.round(cy-K.lift-(ay+0.5)*k); g.imageSmoothingEnabled=false;
  g.drawImage(cv, X, Y, Math.max(1,Math.round(cv.width*k)), Math.max(1,Math.round(cv.height*k)));
  const E=cv._e; K.ey=null; if(E){ const o=[]; for(let j=0;j<E.length;j+=2) o.push(Math.round(X+E[j]*k-cx), Math.round(Y+E[j+1]*k-cy)); K.ey=o; K.ek=Math.max(1,Math.round(k)); }   // (PX E1) the eyes, in texels from the body's centre (eBake → C.eyes) · kk: a portrait's own 1:1
  return true; }
/* the explorer's body (plBody): the view by the facing index · the walk's 6 frames → the template's cycle (no template until A2 → false) */
function spr2Player(g,cx,cy,pr,pfa,wf){ if(!spr2Build.done) spr2Build(); const T=SPR2.tpl.player; if(!T || !(ITUNE.artSpr>0)) return false;   // (PX Z1) built on first use
  const [face,mir]=spr2Face(pfa), F=T[face]||T.S; let rows=F.idle, fk='i'; if(wf>=0 && F.walk && F.walk.length){ const i=Math.floor(wf*F.walk.length/6)%F.walk.length; rows=F.walk[i]; fk='w'+i; }
  const cv=spr2Cv('player|'+face+'|'+fk+'|'+(mir?1:0),rows,T.pal,mir,false), k=spr2K(T,null,pr), ax=F.cx0!=null?F.cx0:T.cx0, ay=F.cy0!=null?F.cy0:T.cy0, x0=mir?(cv.width-1-ax):ax; g.imageSmoothingEnabled=false;
  g.drawImage(cv, Math.round(cx-(x0+0.5)*k), Math.round(cy-(ay+0.5)*k), cv.width*k, cv.height*k); return true; }
/* frame helpers: a frame is a list of rows (strings; '.' = empty). Bodies and legs are authored apart and composed:
   spr2F(body,legs) stacks them; spr2Bob(body,legs) is the same frame sunk one row (the walk's bob) on shorter legs */
function spr2F(a,b){ return a.concat(b); }
function spr2Bob(body,legs){ return [body[0].replace(/[^.]/g,'.')].concat(body,legs); }
function spr2Mir(rows){ return rows.map(r=>r.split('').reverse().join('')); }
/* (PX E1) authoring helpers: spr2Over stamps `over`'s non-'.' texels onto `base` at (ox,oy) · spr2Rep recolours letters ({k:'d'}: the eyes shut) ·
   spr2Shift moves a frame inside its own box (a lean, a lowered head) — all return new rows, the size kept */
function spr2Over(base,over,ox,oy){ ox=ox|0; oy=oy|0; const out=base.slice();
  for(let y=0;y<over.length;y++){ const by=y+oy; if(by<0||by>=out.length) continue; const r=out[by].split('');
    for(let x=0;x<over[y].length;x++){ const ch=over[y][x], bx=x+ox; if(ch==='.'||ch===' '||bx<0||bx>=r.length) continue; r[bx]=ch; } out[by]=r.join(''); }
  return out; }
function spr2Rep(rows,map){ return rows.map(r=>r.replace(/./g,c=>map[c]!=null?map[c]:c)); }
function spr2Shift(rows,dx,dy){ const w=rows[0].length, e='.'.repeat(w); let o=rows.map(r=>dx>0?('.'.repeat(dx)+r).slice(0,w):dx<0?(r.slice(-dx)+'.'.repeat(-dx)):r);
  if(dy>0) o=Array(dy).fill(e).concat(o).slice(0,rows.length); else if(dy<0) o=o.slice(-dy).concat(Array(-dy).fill(e)); return o; }
/* (PX E1) THE MARKS ABOVE A FOE: texels from its centre up to the top of its baked IDLE look in the view it shows (the SNES line & its rank / rim ring
   included, the lift added) — HP & stagger bars, nameplates, DOOM and "!" clear the taller 3/4 bodies by it · 0 with artSpr 0 or no template (the old offsets) */
function spr2Top(en){ if(!(ITUNE.artSpr>0)) return 0; const T=spr2Tpl(en); if(!T) return 0;
  const fi=((Math.round((en._fa||0)/(TAU/16))%16)+16)%16, fc=T.faces==='D'?'D':fi>=3&&fi<=5?'D':fi>=11&&fi<=13?'U':'S', F=T[fc]||T.S;
  if(F._t==null){ let t=99; for(const nm in F){ const v=F[nm]; if(!Array.isArray(v) || !v.length) continue; for(const I of (typeof v[0]==='string'?[v]:v)){ const i=I.findIndex(r=>/[^. ]/.test(r)); if(i>=0 && i<t) t=i; } } F._t=t<99?t:0; }   // (cached: the top opaque row of the view's TALLEST frame · PX2 FIX: a tell that rises over the idle — the alpha's U howl, an ooze's stretch — still clears the marks)
  let t0=F._t; if(T.topN){ const nm=T.sel(en,0), M=F._tn||(F._tn={}); t0=M[nm]; if(t0==null){ const v=F[nm]||F.idle; let t=99; for(const I of (typeof v[0]==='string'?[v]:v)){ const i=I.findIndex(r=>/[^. ]/.test(r)); if(i>=0 && i<t) t=i; } t0=M[nm]=t<99?t:0; } }   // (PX5 FIX) T.topN: over the frame it SHOWS (a buried sand devil's mound, not its erupt) — the marks may then sit lower than the old offsets
  const rs=en.r*islScale(), k=spr2K(T,en,rs), ay=F.cy0!=null?F.cy0:T.cy0, lt=T.lift?Math.round(T.lift(en,rs)):0;
  return -Math.round(-lt-(ay+0.5)*k)-t0*k+1+(en.rar===2?2:(en.rar||en.guard||en.elite||escRim())?1:0); }
/* (PX E1) a creature's PORTRAIT (first cards, the bestiary, FIRST TIME FELLED): the frame spr2Pick gives paintPortrait's own stand-in (its pose — a clam open,
   a diver grounded, a sand devil erupting), facing right, 1:1 + the SNES line, blitted at the largest whole scale the card holds · a lord under 60 % of the card
   at ×1 → ×2, its head & shoulders · false → the old painters */
function spr2Portrait(en,g,W,H){ if(!(ITUNE.artSpr>0)) return false; const T0=spr2Tpl(en), K=spr2Pick(en,T0&&T0.port==='D'?TAU/4:0.45,ePose(en,false),en.r); if(!K) return false;   // (PX Z0 T.port 'D': a kind whose card reads best from the front — the mothwing's wings, the salamander's & the termite's faces)
  const ec=ESPR.ctx, SZ=ESPR.sz, c=ESPR.c; ec.clearRect(0,0,SZ,SZ); spr2Draw(en,c,c,en.r,K,false,0,1); bossTint(en,false);
  const B=pixBake(ec,SZ,c,[ESC_OL],0,0,0); if(!B) return false; let k=Math.max(1,Math.floor(Math.min(W/(B.w+2),H/(B.h+2)))), sx=0, sw=B.w, sh=B.h;
  if(en.guard && k===1 && Math.max(B.w/W,B.h/H)<0.7){ k=2; sw=Math.min(B.w,Math.floor(W/2)); sh=Math.min(B.h,Math.floor(H/2)); sx=Math.max(0,Math.min(B.w-sw,Math.round(B.w*0.62-sw/2))); }   // (the head leads: a right-facing body's front, from the top · PX6F: < 0.7, so the Broodmother's 0.64 crops like the other lords)
  g.imageSmoothingEnabled=false; g.drawImage(B.cv, sx, 0, sw, sh, Math.round(W/2-sw*k/2), Math.round(H/2-sh*k/2), sw*k, sh*k); return true; }
/* rotate a frame a quarter turn clockwise (rows -> columns) */
function spr2Rot(rows){ const h=rows.length, w=Math.max(...rows.map(r=>r.length)); const out=[]; for(let x=0;x<w;x++){ let r=''; for(let y=h-1;y>=0;y--) r+=(rows[y][x]||'.'); out.push(r); } return out; }
function spr2Flip(rows){ return rows.slice().reverse(); }
