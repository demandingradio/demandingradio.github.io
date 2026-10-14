"use strict";
/* FILE: js/render/ui_kit.js
The W5 pixel UI kit: the brass and navy 9-slice frames, baked once per DPR into tiny canvases and handed to CSS as --uf-*
border-images, the same frames drawn on the canvas, emoji swapped for pixel icons in menus, the pixel tooltip, the FF hand
beside the pad's focus, and the crew's portraits. Moved verbatim from original lines 41881-41989 (build 5109cd5); loads in place,
after the load-time overlay wiring and before the title.
Entry points: uiKitBuild, uiKitTips, uiKitHand, uiKitObserve (the boot tail, original line 42157 (build 5109cd5)), uiHandTick
  (frameInner, every frame), ukDraw9 (drawPlacard), ukImg (tnArt), pxImg (about 44 menu and card sites), pxify, pxifyText,
  ukTipShow, ukTipHide, ukTipAt (padSetFocus, the menus, quitToTitle), crewPortrait, drawCrewPor (renderInv, the crew tabs,
  introFace); internal helpers ukCv, ukFrame, ukIcon.
Globals it owns: UIK, EMO_TEST, CREW_POR, plus the functions above.
Globals it reads from elsewhere: EMO_PXI (at load); at runtime pxiURL, pxiCv, emoSeg, pxPanel, PXP, ctx, DPR, inDev,
  padFocusEl, clamp, playerLook, crewLook, paintFolkPortrait, ROLE_DEF.
Load-time statements: const UIK (original line 41897 (build 5109cd5)) is a pure literal; const EMO_TEST (original line 41954
  (build 5109cd5)) builds a RegExp from Object.keys(EMO_PXI), so EMO_PXI (original line 26093 (build 5109cd5), an earlier
  inline part) must be complete first; const CREW_POR (original line 41985 (build 5109cd5)) is a new Map(). The rest are
  function declarations. Nothing starts a timer, rAF or listener at load: uiKitTips adds its document mouse listeners and
  uiKitObserve its MutationObserver only when the boot tail calls them.
Must load before the first frame (uiHandTick runs in every frame, the title's too); the loop starts only after the whole
script (P2).
*/
/* ============================================================ *
 *  W5 — ONE PIXEL UI KIT FOR EVERY MENU & CARD
 *  The DOM twin of the crawl HUD's pxPanel kit (same navy, brass & gold):
 *  · FRAMES — the brass panel, raised cards, sunken tiles, gold /
 *    navy / red / green / spent buttons, tabs, the parchment note —
 *    each baked ONCE per DPR into a tiny 9-slice canvas and handed
 *    to CSS as a border-image (--uf-*). A texel is round(2·DPR)
 *    device px, so every edge lands on whole pixels.
 *  · ICONS — pxify() swaps every known emoji in a menu for its HUD
 *    pixel icon (EMO_PXI). A MutationObserver on the overlays does it
 *    as the renderers write, so they keep writing plain strings.
 *    Dialogue (data-nopx) keeps its words exactly as written.
 *  · a pixel TOOLTIP (title → data-tip, mouse & the pad's focus) ·
 *    the FF HAND beside the pad's focus · the title's dusk sea and
 *    pixel logo · the crew's portraits off the townsfolk painter.
 * ============================================================ */
const UIK={kd:0, dpr:0, mo:null, tipEl:null, handEl:null, tipFor:null};
function ukCv(W,H){ const c=document.createElement('canvas'); c.width=W*UIK.kd; c.height=H*UIK.kd; const g=c.getContext('2d'); g.scale(UIK.kd,UIK.kd); return [c,g]; }
// a 9-slice frame: rings from the outside in, each [top,right,bottom,left] (ring 0 is notched at its corners — a pixel-rounded box) ·
// lip = extra rows above the bottom rings (a button's weight) · face fills the middle (border-image 'fill') · rivet = brass studs in the corners
function ukFrame(o){ const R=o.rings.length, lip=o.lip||[], n=2, W=R*2+n, H=R*2+lip.length+n, [c,g]=ukCv(W,H);
  if(o.face){ g.fillStyle=o.face; g.fillRect(R,R,W-2*R,H-2*R-lip.length); }
  lip.forEach((col,j)=>{ g.fillStyle=col; g.fillRect(R,H-R-lip.length+j,W-2*R,1); });
  o.rings.forEach((q,i)=>{ const x0=i, y0=i, x1=W-1-i, y1=H-1-i, nc=i===0?1:0;
    if(q[0]){ g.fillStyle=q[0]; g.fillRect(x0+nc,y0,x1-x0+1-2*nc,1); }
    if(q[2]){ g.fillStyle=q[2]; g.fillRect(x0+nc,y1,x1-x0+1-2*nc,1); }
    if(q[3]){ g.fillStyle=q[3]; g.fillRect(x0,y0+1,1,y1-y0-1); }
    if(q[1]){ g.fillStyle=q[1]; g.fillRect(x1,y0+1,1,y1-y0-1); } });
  if(o.rivet){ const [a,b,d]=o.rivet; for(const [x,y] of [[1,1],[W-3,1],[1,H-3],[W-3,H-3]]){ g.fillStyle=b; g.fillRect(x,y,2,2); g.fillStyle=a; g.fillRect(x,y,1,1); g.fillStyle=d; g.fillRect(x+1,y+1,1,1); } }
  const k=UIK.kd, t=R, b=R+lip.length;
  return {cv:c, t:t*k, r:R*k, bb:b*k, url:c.toDataURL(), s:(t*k)+' '+(R*k)+' '+(b*k)+' '+(R*k)+(o.face?' fill':''), w:(t*k/UIK.dpr)+'px '+(R*k/UIK.dpr)+'px '+(b*k/UIK.dpr)+'px '+(R*k/UIK.dpr)+'px'}; }
// the same frames on the canvas (a modal card drawn in the world — the museum's placard): nine slices, whole device pixels, the face filled
function ukDraw9(nm,x,y,w,h,fill,g){ const f=UIK.fr&&UIK.fr[nm]; g=g||ctx; if(!f){ pxPanel(x,y,w,h,PXP.brass,g); return; } const s=1/(DPR||1), c=f.cv, W=c.width, H=c.height, T=f.t, R=f.r, B=f.bb;
  const tw=T*s, rw=R*s, bw=B*s; x=Math.round(x); y=Math.round(y); w=Math.round(w); h=Math.round(h); const sm=g.imageSmoothingEnabled; g.imageSmoothingEnabled=false;
  if(fill){ g.fillStyle=fill; g.fillRect(x+rw,y+tw,w-2*rw,h-tw-bw); }
  const P=(sx,sy,sw,sh,dx,dy,dw,dh)=>{ if(sw>0&&sh>0&&dw>0&&dh>0) g.drawImage(c,sx,sy,sw,sh,dx,dy,dw,dh); };
  P(0,0,R,T,x,y,rw,tw); P(W-R,0,R,T,x+w-rw,y,rw,tw); P(0,H-B,R,B,x,y+h-bw,rw,bw); P(W-R,H-B,R,B,x+w-rw,y+h-bw,rw,bw);   // the corners
  P(R,0,W-2*R,T,x+rw,y,w-2*rw,tw); P(R,H-B,W-2*R,B,x+rw,y+h-bw,w-2*rw,bw); P(0,T,R,H-T-B,x,y+tw,rw,h-tw-bw); P(W-R,T,R,H-T-B,x+w-rw,y+tw,rw,h-tw-bw);   // the edges
  g.imageSmoothingEnabled=sm; }
function ukImg(W,H,paint){ const [c,g]=ukCv(W,H); paint(g); return c.toDataURL(); }
function uiKitBuild(){ const dpr=window.devicePixelRatio||1, kd=Math.max(1,Math.round(2*dpr)); if(UIK.kd===kd && UIK.dpr===dpr) return; UIK.kd=kd; UIK.dpr=dpr;
  const K='#04070e', st=document.documentElement.style, set=(nm,f)=>{ (UIK.fr||(UIK.fr={}))[nm]=f; st.setProperty('--uf-'+nm,'url('+f.url+')'); st.setProperty('--uf-'+nm+'-s',f.s); st.setProperty('--uf-'+nm+'-w',f.w); };
  st.setProperty('--tx',(kd/dpr)+'px');
  const panel=(hi,lo,mid,mid2,ih,il,rv)=>ukFrame({rings:[[K,K,K,K],[hi,lo,lo,hi],[mid,mid2,mid2,mid],['#070c18','#070c18','#070c18','#070c18'],[ih,il,il,ih]], rivet:rv});
  set('panel', panel('#f4d488','#6e4f1c','#c49a44','#8a6a2c','#3a5a98','#0d1730',['#fff6c8','#e8b848','#8a6420']));
  set('red',   panel('#ffae90','#7a2014','#c8583e','#8a3020','#6a3040','#1e0a10',['#ffe0d0','#e87a5a','#7a2014']));
  set('cave',  panel('#d8ccff','#3e3080','#9888e0','#5a4aa0','#4a4488','#0e0c24',['#f0ecff','#b8a8ff','#4a3a90']));
  set('parchp',panel('#f4d488','#6e4f1c','#c49a44','#8a6a2c','#fff8e4','#c8b080',['#fff6c8','#e8b848','#8a6420']));   // the Fish Log's page: brass round parchment
  set('card',  ukFrame({rings:[['#050a16','#050a16','#050a16','#050a16'],['#3c5c98','#0c1730','#0c1730','#3c5c98']]}));
  set('goldc', ukFrame({rings:[[K,K,K,K],['#fff0b0','#8a6420','#8a6420','#fff0b0'],['#d8a840','#b0822c','#b0822c','#d8a840']]}));
  set('saga',  ukFrame({rings:[[K,K,K,K],['#d8fff2','#1f5a52','#1f5a52','#d8fff2'],['#7fd6c8','#2f8a7c','#2f8a7c','#7fd6c8']]}));   // (INTROSTORY C4b: the objective chip's sea-glass plate · its dim twin — away, an info line)
  set('sagad', ukFrame({rings:[[K,K,K,K],['#8ab8b0','#183a36','#183a36','#8ab8b0']]}));
  set('inset', ukFrame({rings:[['#050a14','#050a14','#050a14','#050a14'],['#060c1a','#2e4676','#2e4676','#060c1a']]}));
  set('parch', ukFrame({rings:[['#3a2410','#3a2410','#3a2410','#3a2410'],['#fff8e4','#b89a64','#b89a64','#fff8e4']]}));
  set('btn',   ukFrame({rings:[[K,K,K,K],['#fff6cc','#c8962e','#c8962e','#fff6cc']], lip:['#b0801e','#7a520e'], face:'#f4c869'}));
  set('btn2',  ukFrame({rings:[[K,K,K,K],['#6a88c4','#16244a','#16244a','#6a88c4']], lip:['#0c1630'], face:'#243c6e'}));
  set('btnr',  ukFrame({rings:[[K,K,K,K],['#ffb098','#9a2a1c','#9a2a1c','#ffb098']], lip:['#6a140c'], face:'#d0503a'}));
  set('btng',  ukFrame({rings:[[K,K,K,K],['#d4ffe4','#2f8a55','#2f8a55','#d4ffe4']], lip:['#1f6a3c'], face:'#6fdc9c'}));
  set('dis',   ukFrame({rings:[['#0a101c','#0a101c','#0a101c','#0a101c'],['#26345a','#141d34','#141d34','#26345a']], lip:['#0e1528'], face:'#1a2642'}));
  set('tab',   ukFrame({rings:[[K,K,K,K],['#40588a','#121c36','#121c36','#40588a']], face:'#15223f'}));
  set('tabon', ukFrame({rings:[[K,K,K,K],['#f4d488','#8a6a2c','#8a6a2c','#f4d488'],['#2e4a84','#1a2c56','#1a2c56','#2e4a84']], face:'#223a6c'}));
  // ornaments: a brass diamond on the title rule (navy & parchment backs) · the board's brass tack · a faint dither over the panels
  const orn=(bg,hi,lo)=>ukImg(9,5,g=>{ g.fillStyle=bg; g.fillRect(1,0,7,5); g.fillStyle=K; g.fillRect(4,0,1,5); g.fillRect(2,2,5,1); g.fillRect(3,1,3,3); g.fillStyle=hi; g.fillRect(4,1,1,2); g.fillRect(3,2,1,1); g.fillStyle=lo; g.fillRect(5,2,1,1); g.fillRect(4,3,1,1); g.fillStyle=K; g.fillRect(0,2,1,1); g.fillRect(8,2,1,1); });
  st.setProperty('--uf-orn','url('+orn('#1b3060','#fff0b0','#c09440')+')'); st.setProperty('--uf-ornd','url('+orn('#eadbb4','#e8c060','#8a5a1c')+')');
  st.setProperty('--uf-tack','url('+ukImg(7,8,g=>{ g.fillStyle=K; g.fillRect(2,0,3,1); g.fillRect(1,1,5,1); g.fillRect(0,2,7,3); g.fillRect(1,5,5,1); g.fillRect(3,6,1,2); g.fillStyle='#c8342a'; g.fillRect(2,1,3,1); g.fillRect(1,2,5,3); g.fillRect(2,5,3,0); g.fillStyle='#ff8a70'; g.fillRect(2,2,2,1); g.fillStyle='#7a140c'; g.fillRect(2,4,4,1); g.fillStyle='#8a8f98'; g.fillRect(3,6,1,1); })+')');
  st.setProperty('--uf-dith','url('+ukImg(4,4,g=>{ g.fillStyle='rgba(255,255,255,.028)'; g.fillRect(0,0,1,1); g.fillRect(2,2,1,1); g.fillStyle='rgba(0,0,0,.07)'; g.fillRect(2,0,1,1); g.fillRect(0,2,1,1); })+')');
  st.setProperty('--fkhand','url('+pxiURL('hand',2)+')');
  UIK.pxe={}; }
/* ---- pixel icons in the DOM ---- */
function ukIcon(n,k){ const kd=Math.max(1,Math.round(k*(window.devicePixelRatio||1))), key=n+'@'+kd; let e=(UIK.pxe||(UIK.pxe={}))[key]; if(e) return e;
  const c=pxiCv(n); if(!c) return null; const o=document.createElement('canvas'); o.width=c.width*kd; o.height=c.height*kd; const g=o.getContext('2d'); g.imageSmoothingEnabled=false; g.drawImage(c,0,0,o.width,o.height);
  const d=window.devicePixelRatio||1; return UIK.pxe[key]={src:o.toDataURL(), w:c.width*kd/d, h:c.height*kd/d}; }
function pxImg(n,k,cls,alt){ const e=ukIcon(n,k||2); if(!e) return alt||''; return '<img class="'+(cls||'pxi')+'" alt="'+(alt||'')+'" src="'+e.src+'" width="'+e.w+'" height="'+e.h+'" draggable="false">'; }
const EMO_TEST=new RegExp('('+Object.keys(EMO_PXI).join('|')+')','u');
function pxifyText(t){ const v=t.nodeValue; if(!v || !EMO_TEST.test(v)) return; const p=t.parentNode; if(!p || (p.closest && p.closest('[data-nopx],textarea,option,script,style'))) return;
  let k=2; try{ const fs=parseFloat(getComputedStyle(p).fontSize)||13; k=fs>=34?4:fs>=19?3:2; }catch(e){}
  const S=emoSeg(v), fr=document.createDocumentFragment();
  for(const q of S){ if(typeof q==='string'){ fr.appendChild(document.createTextNode(q)); continue; }
    const e=ukIcon(q.i,k); if(!e) continue; const im=document.createElement('img'); im.className='pxe'; im.alt=''; im.draggable=false; im.src=e.src; im.width=e.w; im.height=e.h; fr.appendChild(im); }
  p.replaceChild(fr,t); }
function pxify(root){ if(!root) return; if(root.nodeType===3){ pxifyText(root); return; } if(root.nodeType!==1) return;
  const W=document.createTreeWalker(root,NodeFilter.SHOW_TEXT), hits=[]; let t; while((t=W.nextNode())) if(EMO_TEST.test(t.nodeValue)) hits.push(t); for(const x of hits) pxifyText(x); }
function uiKitObserve(){ if(UIK.mo || typeof MutationObserver==='undefined') return;
  UIK.mo=new MutationObserver(ms=>{ for(const m of ms){ if(m.type==='characterData') pxifyText(m.target); else for(const nd of m.addedNodes) pxify(nd); } });
  for(const id of ['menu','title','shop','journal','notice','intro','ptest','ledger','cavecard','rename','summary','inv','flog','leaveBtn','talk','pxtip','mute','menuBtn','devp','dstore']){ const el=document.getElementById(id); if(el){ pxify(el); UIK.mo.observe(el,{childList:true,subtree:true,characterData:true}); } } }
/* ---- the pixel tooltip: any [title] in a menu becomes a brass tip (the mouse's hover · the pad's focus) ---- */
function ukTipShow(el,x,y){ const tp=UIK.tipEl; if(!tp || !el) return; if(el.hasAttribute('title')){ el.dataset.tip=el.getAttribute('title'); el.removeAttribute('title'); }
  const s=el.dataset.tip; if(!s){ ukTipHide(); return; } if(UIK.tipFor!==el){ tp.textContent=s; UIK.tipFor=el; } tp.style.display='block';
  const w=tp.offsetWidth, h=tp.offsetHeight; tp.style.left=Math.round(clamp(x,6,innerWidth-w-6))+'px'; tp.style.top=Math.round(y+h+8>innerHeight?y-h-26:y)+'px'; }
function ukTipHide(){ if(UIK.tipEl){ UIK.tipEl.style.display='none'; } UIK.tipFor=null; }
function ukTipAt(el){ if(!el){ ukTipHide(); return; } const r=el.getBoundingClientRect(); ukTipShow(el, r.left, r.bottom+6); }
function uiKitTips(){ const tp=document.createElement('div'); tp.id='pxtip'; document.body.appendChild(tp); UIK.tipEl=tp;
  const ov='#menu,#shop,#ptest,#ledger,#cavecard,#flog,#inv,#title,#talk,#scn,#notice,#intro,#devp,#dstore';
  document.addEventListener('mouseover',e=>{ const el=e.target&&e.target.closest&&e.target.closest('[title],[data-tip]'); if(!el || !el.closest(ov)){ if(UIK.tipFor && !(inDev==='pad'&&padFocusEl)) ukTipHide(); return; } ukTipShow(el,e.clientX+14,e.clientY+18); });
  document.addEventListener('mousemove',e=>{ if(UIK.tipFor && UIK.tipEl.style.display==='block' && inDev!=='pad'){ const el=UIK.tipFor; if(!el.isConnected){ ukTipHide(); return; } ukTipShow(el,e.clientX+14,e.clientY+18); } });
  document.addEventListener('mousedown',()=>ukTipHide(),true); }
/* ---- the FF hand beside the pad's focus (the conversation box draws its own) ---- */
function uiKitHand(){ const h=document.createElement('img'); h.id='pxhand'; h.alt=''; const e=ukIcon('hand',2); if(e){ h.src=e.src; h.width=e.w; h.height=e.h; } document.body.appendChild(h); UIK.handEl=h; }
function uiHandTick(){ const h=UIK.handEl; if(!h) return; const el=padFocusEl, gone=!!(el && (!el.isConnected || el.closest('.hidden'))), on=!!(el && inDev==='pad' && !gone && !el.closest('#talk,#scn'));
  { const tf=UIK.tipFor; if(tf && (!tf.isConnected || tf.closest('.hidden'))) ukTipHide(); }                     // (a tip over something now hidden goes with it)
  if(!on){ if(h.style.display!=='none') h.style.display='none'; return; }
  const r=el.getBoundingClientRect(); if(!r.width){ h.style.display='none'; return; }
  const x=Math.round(Math.max(2,r.left-h.width-6)), y=Math.round(r.top+r.height/2-h.height/2); h.style.display='block'; h.style.left=x+'px'; h.style.top=y+'px'; }
/* ---- the crew's portraits: the townsfolk painter, in each hand's own look (you: the explorer you walk the wharf as) ---- */
const CREW_POR=new Map();
function crewPortrait(m){ const L=m.role==='captain'?playerLook():crewLook(m), key=m.role+'|'+m.name; let c=CREW_POR.get(key); if(c) return c;
  if(CREW_POR.size>40) CREW_POR.clear(); c=paintFolkPortrait(L,'neutral',false); CREW_POR.set(key,c); return c; }
function drawCrewPor(cv2,m){ const c=crewPortrait(m); cv2.width=c.width; cv2.height=c.height; const g=cv2.getContext('2d'); g.imageSmoothingEnabled=false; g.clearRect(0,0,c.width,c.height);
  g.fillStyle='#16284e'; g.fillRect(0,0,c.width,c.height); const R=ROLE_DEF[m.role]; if(R){ g.fillStyle=R.col; g.globalAlpha=0.16; g.fillRect(0,0,c.width,c.height); g.globalAlpha=1; } g.drawImage(c,0,0); }
