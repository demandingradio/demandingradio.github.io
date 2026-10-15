"use strict";
/* FILE: js/render/hud_kit.js
THE CRAWL HUD PIXEL KIT: original lines 25853-26672 (build 5109cd5), moved verbatim, in place after the CEREMONY block (ends at
  original line 25852 (build 5109cd5), still inline) and directly before js/debug/meters.js (original lines 26673-26780).
Globals it owns, by part (plus the other functions between those lines): the WAYFINDING state (wayVer, wayPulse, wayNA,
  wayLastT); the STAGE-3 HUD kit (hudU, hudK, hudB, PXP, pxPanel, panTxt, hudTxt, pxBar, DIAC, pxDia, HUDC, hudPlate); the pixel
  icons PXI_ART with their cache PXI, pxiCv, pxIcon, pxiW, pxiURL; emoji in HUD text (EMO_PXI, EMO_RE, EMOS, TRAIT_PXI, emoSeg,
  emoK, emoW, emoTxt) and key caps (PADFACE, GLC, glyphCap, drawGlyph, glyphW); the one-time lessons, the E prompt and the HUD
  reveal (tutS, HUDR, hudR, tutDone, tutMark, tutPick, tutPick0, drawTutorial, drawPrompt, hudReveal, hudRevRect); the layout
  (hudBtnB, hudBtnBottom, hudLay); wayfinding (wayTarget, wayField, wayAim, the compass, the way pointer, stragglers, THREAT_ST
  and threat marks, feedPick and the pickup feed, the level banner); the run strip, the local map (MMQ, MMFOG, mmPaint), the
  satchel (SATC), YOU (streakPopT), the skill bar (SBC), the buff row (BUFF_IC, BUFF_BC), bossBarOn and bossBarRect.
Entry points: islandHUD calls hudLay and the draw* pieces; PXP, pxPanel, panTxt, hudU, hudPlate, pxIcon, pxiW, pxiCv, pxiURL,
  emoTxt, emoW and drawPrompt are used far beyond the crawl (sea HUD, menus, toasts, ports, deck, story, js/render/ui_kit.js);
  paintChart calls mmPaint; pickups call feedPick; the story calls tutMark, tutDone, tutPick and hudRevRect.
Main globals it reads from elsewhere: at load MATS, ELIXIR, PW_BUFF_IC (js/data/crawl2.js), mixHex and seasLmkPxi with the SEAS
  landmark tables (earlier inline code); at runtime only ctx, DPR, CSSW, CSSH, clamp, glyph, inDev, ITUNE, ISL, player, enemies,
  TUT, TUTPT, GEMS, BAR_ROLES, matPx, findNew (js/ports/museum.js), metersOn, MET_ROWS (js/debug/meters.js), ptMode, SAGA, sagaPin.
Load-time statements (original lines, build 5109cd5), in this order: 25901 DIAC and 25907 HUDC (new Maps); the PXI_ART chain 25983
  (material icons from MATS), 25984 (elixir vials, mixHex), 25985-26037, 26038-26053, 26054-26081 (Object.assign batches), 26082
  seasLmkPxi(); 26098 EMO_RE, EMOS, TRAIT_PXI; 26112 GLC; 26226 the window resize listener that zeroes hudBtnB (the second resize
  listener, kept in its place); 26634 SBC; 26658 BUFF_IC. Later code extends PXI_ART at load and ui_kit.js reads EMO_PXI at load.
*/
/* ============================================================ *
 *  WAYFINDING & MOMENT FEEDBACK (the crawl HUD's navigators)
 *  · the CRAWL COMPASS — a brass rose on the survey's corner: a gold
 *    needle down the real PATH to what's next (the next main clearing /
 *    the hoard / the deep chest, stairs & rope / the boat once she's
 *    yours; mid-fight: the nearest foe left) + rim ticks (caches purple,
 *    the boss red once seen, the way out blue, the cave violet) + metres
 *  · the WAY POINTER — a gold chevron at your boots (bright after a
 *    secure, a whisper otherwise, gone mid-fight)
 *  · STRAGGLER arrows (≤ wayStrag foes left, off-screen) & THREAT
 *    chevrons (off-screen windups / charges / casts, spit inbound)
 *  · the PICKUP FEED, the LEVEL UP banner
 *  STAGE-3 HOOK: every element is one function; hudLay() holds the
 *  positions — re-layout the HUD there.
 * ============================================================ */
let wayVer=0, wayPulse=0, wayNA=null, wayLastT=0;   // tiles changed (a gate opened / slammed) · the post-secure shine (s) · the needle's shown angle · its clock
/* ============================================================ *
 *  STAGE-3 CRAWL HUD — one pixel UI for the whole crawl
 *  · the KIT: brass-framed navy panels in whole pixels (pxPanel),
 *    procedural pixel icons (heart · flask · Tide wave · dash
 *    boot · coin · gem · ore · bone · herb · relic · trinket ring ·
 *    satchel), key caps that name the keyboard key OR the pad's
 *    button — whichever you touched last (glyph / drawGlyph)
 *  · the LAYOUT (hudLay): a thin run strip top-centre · YOU bottom-
 *    left (ARPG: HP + the flask, the Tide, dash, XP, level, combo &
 *    streak) · the local map + compass + satchel + pickup feed
 *    top-right · first cards & toasts in a side lane down the left ·
 *    the boss bar, a lesson strip & the E prompt bottom-centre.
 *    The north lane (where you walk, where the fights come from)
 *    and the ring round you stay clear.
 * ============================================================ */
function hudU(){ return clamp((CSSH>=1000?1.25:CSSH<620?0.92:1)*(ITUNE.hudScale||1),0.6,2.2); }   // the HUD's size (text & panels) — a touch bigger on tall screens
function hudK(){ return Math.max(1,Math.round(2*hudU())); }                                         // an icon texel = k css px (whole pixels, never smoothed)
function hudB(){ return hudU()>=1.2?2:1; }                                                          // a frame line
const PXP={brass:{hi:'#e2bd62',lo:'#6e4f1c',fill:'rgba(11,20,38,.9)'}, red:{hi:'#ff9a7a',lo:'#7a2014',fill:'rgba(46,12,18,.92)'}, cave:{hi:'#c3b4ff',lo:'#3e3080',fill:'rgba(14,11,32,.9)'},
  gold:{hi:'#fff0b0',lo:'#a8781c',fill:'rgba(38,26,8,.92)'}, dim:{hi:'#6d80a8',lo:'#1f2a44',fill:'rgba(7,13,26,.92)'}, green:{hi:'#9ff5c0',lo:'#1f6a3c',fill:'rgba(10,30,20,.92)'},
  parch:{hi:'#fff8e4',lo:'#8a6a3a',fill:'rgba(238,224,190,.98)'}, course:{hi:'#ffd86b',lo:'#8a6420',fill:'rgba(7,13,26,.92)'}, saga:{hi:'#9fe8d8',lo:'#1f5a52',fill:'rgba(8,26,30,.92)'}};   // (parch: the museum's placards — w5 · course: PT1 W5's gold-edged dim plate · saga: Introstory's sea-glass — the objective chip, a chapter's goal)
function pxPanel(x,y,w,h,st,g){ st=st||PXP.brass; g=g||ctx; const b=hudB(); x=Math.round(x); y=Math.round(y); w=Math.round(w); h=Math.round(h); if(w<4*b||h<4*b) return;
  g.fillStyle=st.fill; g.fillRect(x+b,y+b,w-2*b,h-2*b);
  g.fillStyle='#04070e'; g.fillRect(x+b,y,w-2*b,b); g.fillRect(x+b,y+h-b,w-2*b,b); g.fillRect(x,y+b,b,h-2*b); g.fillRect(x+w-b,y+b,b,h-2*b);   // the ink rim (corners notched: a pixel-rounded box)
  g.fillStyle=st.hi; g.fillRect(x+b,y+b,w-2*b,b); g.fillRect(x+b,y+2*b,b,h-3*b);                  // brass, lit from the top-left…
  g.fillStyle=st.lo; g.fillRect(x+2*b,y+h-2*b,w-3*b,b); g.fillRect(x+w-2*b,y+2*b,b,h-4*b);        // …shaded bottom-right
  g.fillStyle='rgba(0,0,0,.4)'; g.fillRect(x+2*b,y+2*b,w-4*b,b); }                                    // (a hairline of shade under the top rim)
function panTxt(t,x,y,col,font,g){ g=g||ctx; if(font) g.font=font; g.fillStyle='rgba(2,4,10,.7)'; g.fillText(t,x+1,y+1); g.fillStyle=col; g.fillText(t,x,y); }   // text ON a plate: a 1px drop shadow (cheap, crisp — the SNES menu look)
function hudTxt(t,x,y,col,font){ if(font) ctx.font=font; ctx.lineJoin='round'; ctx.strokeStyle='rgba(4,7,14,.88)'; ctx.lineWidth=3; ctx.strokeText(t,x,y); ctx.fillStyle=col; ctx.fillText(t,x,y); }   // text over the WORLD: bold system-ui with a dark outline (reads on snow & on ash)
function pxBar(x,y,w,h,f,col,hi,lo,bg){ x=Math.round(x); y=Math.round(y); w=Math.round(w); h=Math.round(h); const fw=f>0?Math.max(2,Math.round(w*clamp(f,0,1))):0, e=Math.max(1,Math.round(h/5));   // a pixel gauge: ink rim, a lit top row, a shaded bottom row
  ctx.fillStyle='#04070e'; ctx.fillRect(x-1,y-1,w+2,h+2); ctx.fillStyle=bg||'#1a2238'; ctx.fillRect(x,y,w,h);
  if(fw){ ctx.fillStyle=col; ctx.fillRect(x,y,fw,h); if(hi){ ctx.fillStyle=hi; ctx.fillRect(x,y,fw,e); } if(lo){ ctx.fillStyle=lo; ctx.fillRect(x,y+h-e,fw,e); } } return fw; }
const DIAC=new Map();   // baked pixel diamonds / triangles: 'r|col|ink' → canvas (one blit, not a row of rects)
function pxDia(x,y,r,col,ink,g){ g=g||ctx; x=Math.round(x); y=Math.round(y); const key='d'+r+'|'+col+'|'+(ink||''); let c=DIAC.get(key);   // a diamond in whole pixels
  if(!c){ if(DIAC.size>160) DIAC.clear(); const R=r+1, n=2*R+1; c=document.createElement('canvas'); c.width=n; c.height=n; const q=c.getContext('2d');
    if(ink){ q.fillStyle=ink; for(let d=-R;d<=R;d++){ const hw=R-Math.abs(d); q.fillRect(R-hw,R+d,hw*2+1,1); } }
    q.fillStyle=col; for(let d=-r;d<=r;d++){ const hw=r-Math.abs(d); q.fillRect(R-hw,R+d,hw*2+1,1); } DIAC.set(key,c); }
  g.drawImage(c,x-r-1,y-r-1); }
const HUDC=new Map();   // baked HUD plates (a lesson strip…): key → {cv,w,h} at the screen's DPR — redrawn only when what they say changes
function hudPlate(key,w,h,paint,M){ M=M||HUDC; let c=M.get(key); if(c) return c; if(M.size>(M===HUDC?40:64)) M.clear();   // (M: a caller's own cache — the skill bar keeps its slots apart)
  const cv2=document.createElement('canvas'); cv2.width=Math.max(1,Math.ceil(w*DPR)); cv2.height=Math.max(1,Math.ceil(h*DPR)); const g=cv2.getContext('2d'); g.scale(DPR,DPR); g.imageSmoothingEnabled=false; paint(g);
  c={cv:cv2,w,h}; M.set(key,c); return c; }
/* ---- the pixel icons: one character per texel (K = the dark outline) — baked once, drawn ×k ---- */
const PXI_ART={
  heart:{p:{K:'#1b0a12',R:'#e8394c',r:'#a4182c',W:'#ffc4ca'}, a:['.KK...KK.','KWRK.KRRK','KWRRKRRrK','KRRRRRRrK','.KRRRRrK.','..KRRrK..','...KrK...','....K....']},
  flask:{p:{K:'#0b1414',C:'#b98a52',g:'#d8f4ff',G:'#46d27e',D:'#1f9450',W:'#e6fff0'}, a:['..KKK..','..KCK..','.KKgKK.','.KgggK.','KgGGGgK','KGWGGDK','KGGGGDK','KDGGDDK','.KKKKK.']},
  flaskE:{p:{K:'#0b1414',C:'#6d5a42',g:'#5d7898',G:'#1b283c',D:'#141e2e',W:'#2c3e58'}, a:'flask'},
  flame:{p:{K:'#2a0c04',R:'#d8401a',O:'#ff8a1e',Y:'#ffd23f',W:'#fff6c8'}, a:['...K....','..KRK...','..KOK.K.','.KROOKRK','.KOYOROK','KROYYOOK','KOYWWYOK','KOYWWYRK','.KRYYRK.','..KKKK..']},
  flameD:{p:{K:'#1a0c06',R:'#5a2a1a',O:'#6e3a22',Y:'#80502e',W:'#8a6040'}, a:'flame'},
  keg:{p:{K:'#1a0e06',L:'#d6a86e',B:'#b07444',b:'#7a4e2a',H:'#9a9aa6',R:'#de4632',f:'#e8d8a8',Y:'#ffd23f',W:'#ffffff'}, a:['......YW..','......fY..','..KKKKfKK.','.KLLLLLLLK','KHHHHHHHHK','KBBRBbRbbK','KBBBRRbbbK','KBBRBbRbbK','KHHHHHHHHK','.KbbbbbbK.','..KKKKKK..']},   // (PT1 K7a) a powder keg, its fuse lit — the keg's first card
  spikes:{p:{K:'#16161c',W:'#ffffff',S:'#d8d8e0',R:'#6a6a78',G:'#3a3a44',H:'#0e0e12'}, a:['.K...K...K.','KWK.KWK.KWK','KSK.KSK.KSK','KSKKKSKKKSK','KRRRRRRRRRK','KGHGGHGGHGK','KGGGGGGGGGK','KGHGGHGGHGK','.KKKKKKKKK.']},   // (PT1 K8) a spike plate, its spikes up
  dart:{p:{K:'#1a1008',W:'#f4ecd8',S:'#d8c8a0',R:'#a83232'}, a:['......KK','.....KWK','....KSK.','...KSK..','..KSK...','.KRSK...','KRRK....','KRK.....','KK......']},   // (PT1 K8) a trap's dart, red-fletched
  bridge:{p:{K:'#1a120a',R:'#e8d8a8',r:'#a89870',P:'#b08a54',p:'#7a5a38',S:'#6a6070',s:'#3e3846',V:'#141018'}, a:['K.........K','KRRRRRRRRRK','KrrrrrrrrrK','KPpPpPpPpPK','KKKKKKKKKKK','S.VVVVVVV.S','SsVVVVVVVsS','.SsVVVVVsS.']},   // (PT1 K10a) a rope bridge over the dark
  stones:{p:{K:'#14120e',G:'#c8c2b2',g:'#8a8478',d:'#5e5a52',C:'#9ff0ff',W:'#ffffff',T:'#6a5a40'}, a:['..K.....K..','.KGK...KgK.','.KgK.K.KgK.','KKgKKGKKdKK','KGgKKCKKgdK','KgdKKWKKgdK','KgdKKCKKddK','TTTTTTTTTTT']},   // (PT1 K10b) an arena ring's standing stones, a rune alight
  boot:{p:{K:'#140a04',b:'#9a6436',h:'#d0985a',S:'#3a2414',w:'#bfefff'}, a:['...KKKK...','...KbhK...','w..KbbK...','...KbbK...','ww.KbbbKK.','...KbbbbbK','.w.KSSSSSK','...KKKKKK.']},
  coinS:{p:{K:'#3a2404',Y:'#ffd23f',W:'#fff3b0',O:'#c8901a'}, a:['.KKK.','KWYYK','KYYOK','KYOOK','.KKK.']},
  boneS:{p:{K:'#2a2418',W:'#f2ead2',s:'#bfb190'}, a:['KK...KK','KWKKKWK','.KWWWsK','KWKKKsK','KK...KK']},
  coin:{p:{K:'#3a2404',Y:'#ffd23f',W:'#fff3b0',O:'#c8901a',D:'#e0a820'}, a:['..KKK..','.KYWYK.','KYWYYOK','KYYDYOK','KYYYYOK','.KOOOK.','..KKK..']},
  gem:{p:{K:'#0a2430',C:'#5fe0f0',c:'#2a9ab8',W:'#e6ffff'}, a:['..KKK..','.KWCCK.','KWCCCcK','KCCCCcK','.KCCcK.','..KcK..','...K...']},
  ore:{p:{K:'#16120e',g:'#8d8478',G:'#5b544c',s:'#e39a4a'}, a:['..KKKK..','.KgGgGK.','KgGsGgGK','KGgGgsGK','KgsGgGgK','.KGgGgK.','..KKKK..']},
  bone:{p:{K:'#2a2418',W:'#f2ead2',s:'#bfb190'}, a:['.KK....KK.','KWWKKKKWWK','.KWWWWWWK.','.KWWWWWsK.','KWsKKKKWsK','.KK....KK.']},
  herb:{p:{K:'#0c2410',L:'#6ad65e',l:'#2f8a36',s:'#7a5a32'}, a:['...K...','..KLK..','.KLlLK.','KLLlLLK','KLlLlLK','.KLlLK.','..KsK..','..KsK..']},
  relic:{p:{K:'#2a1004',u:'#9a4a22',U:'#d8783a',W:'#ffc28a'}, a:['.KKKKK.','..KuK..','.KuUUK.','KuUWUuK','KUUUUuK','KuUUUuK','.KuuuK.','..KKK..']},
  ring:{p:{K:'#1c1004',W:'#f0dcff',G:'#c58cff',g:'#7a4ac0',Y:'#ffd23f',o:'#c8901a'}, a:['..KKK..','.KWGgK.','.KGGgK.','.KKKKK.','KYK.KYK','KY...oK','KY...oK','.KYYoK.','..KKK..']},
  skull:{p:{K:'#2a0a0a',W:'#f2e6d6',s:'#b8a898'}, a:['.KKKKK.','KWWWWWK','KWWWWsK','KKKWKKK','KKKWKKK','.KWWWK.','.KWKsK.','..KKK..']},
  anchor:{p:{K:'#0e1420',W:'#cfd8e2',S:'#7a8a9a'}, a:['...KKK...','...KWK...','...KKK...','.KKKWKKK.','.KSWWWSK.','KK.KWK.KK','KWKKWKKWK','KSWWWWWSK','.KKKKKKK.']},
  book:{p:{K:'#1a0e04',Y:'#e8c040',y:'#a87a18',W:'#f4ecd0'}, a:['.KKKKKK.','KYYYYYYK','KyYYYYYK','KyYWWYYK','KyYYYYYK','KyYYYYYK','KWWWWWWK','.KKKKKK.']},
  flag:{p:{K:'#1a0e04',P:'#a8804c',G:'#ffd23f',g:'#c8901c',R:'#d23a2e'}, a:['KK......','KPKKKKK.','KPGGGGGK','KPGRGGK.','KPGGGgGK','KPKKKKK.','KPK.....','KPK.....','KKK.....']},
  blade:{p:{K:'#10141c',W:'#eef4fb',S:'#8a9aac',H:'#e0a820',h:'#6a4a20'}, a:['......KK','.....KWK','....KWSK','...KWSK.','K.KWSK..','KHKSK...','.KHK....','KhKHK...','KK..K...']},
  bow:{p:{K:'#1a0e04',B:'#b07a42',b:'#6a4424',S:'#e8e0c8'}, a:['.KKK....','KBBK....','KbK.S...','KbK..S..','KbK...S.','KbK..S..','KbK.S...','KBBK....','.KKK....']},
  key:{p:{K:'#1a0e04',G:'#ffd23f',g:'#b8841a'}, a:['.KKK.....','KGGGK....','KG.GKKKKK','KGGGGGGGK','.KKKKgKgK','.....K.K.']},
  star:{p:{K:'#2a1a04',Y:'#ffd23f',W:'#fff3b0'}, a:['....K....','...KYK...','KKKKYKKKK','KYYYWYYYK','.KYYYYYK.','..KYYYK..','.KYKKKYK.','.KK...KK.']},
  spark:{p:{K:'#1a1404',W:'#fff8e0',Y:'#ffd86b'}, a:['...K...','..KWK..','.KKWKK.','KWWWWWK','.KKYKK.','..KYK..','...K...']},
  sign:{p:{K:'#1a0e04',B:'#d8b878',b:'#a07a44',P:'#8a6440'}, a:['KKKKKKKK','KBBBBBBK','KBbBBbBK','KBBBBBBK','KKKKKKKK','...KPK..','...KPK..','...KKK..']},
  wind:{p:{K:'#0a1a22',C:'#9fe8ff',c:'#5ab8d8'}, a:['.....KK.','KKKKKCCK','KCCCCKcK','.KKKKKK.','KKKKK...','KCCCCKK.','.KKKKccK','....KKK.']},
  spine:{p:{K:'#2a1004',O:'#ffb07a',o:'#d8703a'}, a:['K..K..K','.KOKOK.','..KOK..','KOOoOOK','..KOK..','.KOKOK.','K..K..K']},
  shield:{p:{K:'#10141c',S:'#cfd8e2',s:'#8a98a8',R:'#5a6a7a'}, a:['KKKKKKK','KSSSSsK','KSSSSsK','KSSSsRK','.KSSsK.','.KSsRK.','..KsK..','...K...']},
  venom:{p:{K:'#0e2006',G:'#b8ff6a',g:'#5aa02a',W:'#f0ffd0'}, a:['...K...','..KGK..','.KGGGK.','KGWGGGK','KGGGGgK','KgGGggK','.KgggK.','..KKK..']},
  blood:{p:{K:'#2a0610',G:'#ff5a6a',g:'#a01e30',W:'#ffd0d8'}, a:'venom'},
  thorn:{p:{K:'#0e1a06',G:'#9be85a',g:'#4f8a2a',W:'#f0ffd0'}, a:['...K...','..KGK..','K.KGK.K','KWKGKGK','KGKGKGK','.KGGGK.','..KgK..','..KgK..','.KKKKK.']},   // (the Thorned trait — a spiny cactus)
  stone:{p:{K:'#16120e',R:'#b8b0a0',r:'#7a7266',W:'#e0dace'}, a:['..KKKK..','.KWRRRK.','KWRRRRrK','KRRRRrrK','KRRrrrrK','.KKKKKK.']},
  wall:{p:{K:'#16120e',W:'#e0dace',R:'#b8b0a0',r:'#7a7266',m:'#527a3c'}, a:['.KKmmKKKK.','KWRRKWRRRK','KRRrKRRrrK','KKKKKKKKKK','KWRKWRRRrK','KRrKRRrrrK','KKKKKKKKKK']},   // (PT1 K7b) cover — the card's dry-stone wall
  anger:{p:{K:'#2a0404',R:'#ff5d4a'}, a:['KRK.KRK','KRRKRRK','.KK.KK.','.......','.KK.KK.','KRRKRRK','KRK.KRK']},
  snow:{p:{K:'#0a1a2a',W:'#e8f6ff',B:'#9fd0f0'}, a:['K..K..K','.KWKWK.','..KWK..','KWWBWWK','..KWK..','.KWKWK.','K..K..K']},
  palm:{p:{K:'#0a1a0c',G:'#5fc860',g:'#2f8a36',T:'#8a6440'}, a:['.KK.KK.','KGGKGGK','.KgGgK.','KGKTKGK','K.KTK.K','..KTK..','.KKTKK.']},
  grain:{p:{K:'#1a1404',Y:'#e8c860',y:'#a8883a'}, a:['.K.K.K.','KYKYKYK','KyKyKyK','.KyyyK.','..KyK..','..KyK..','..KKK..']},
  mount:{p:{K:'#101810',W:'#f0f4f0',R:'#8a9a7a',r:'#5a6a50'}, a:['...K...','..KWK..','.KWRRK.','.KRRrK.','KRRrrrK','KKKKKKK']},
  leaf:{p:{K:'#1a0a04',O:'#f08a3a',o:'#a84a1a'}, a:['....KK','..KKOK','.KOOoK','KOOoOK','KOoOK.','KoKK..','KK....']},
  isle:{p:{K:'#0a1418',S:'#e8d49a',B:'#4aa8c8',G:'#5fc860'}, a:['..KGK..','.KGKGK.','...K...','.KKSKK.','KSSSSSK','BKKKKKB']},
  blossom:{p:{K:'#2a0a18',P:'#f4a8c8',Y:'#ffd23f'}, a:['.KK.KK.','KPPKPPK','KPPYPPK','.KYYYK.','KPPYPPK','KPPKPPK','.KK.KK.']},
  volcano:{p:{K:'#140a06',R:'#ff7a2a',D:'#5a524c',d:'#3a3430'}, a:['..KRK..','..KRK..','.KDRdK.','.KDDdK.','KDDDddK','KKKKKKK']},
  crystal:{p:{K:'#081420',C:'#8de9ff',c:'#4aa8d8',W:'#f0ffff'}, a:['...K...','..KWK..','.KWCcK.','KWCCccK','.KCccK.','..KcK..','...K...']},
  bag:{p:{K:'#1a0e04',b:'#b07a42',B:'#7a4e26',H:'#ffd23f'}, a:['..KKKK..','.K....K.','KKKKKKKK','KbbbbbbK','KbKKKKbK','KbbHHbbK','KbbbbbbK','KBBBBBBK','.KKKKKK.']},
  frog:{p:{K:'#0a1a06',G:'#6ac83e',g:'#3a8a24',W:'#f0f8e0',B:'#101810'}, a:['.KK.KK.','KWBKBWK','KGGGGGK','KgGGGgK','.KgggK.','KK.K.KK']},   // (the newer shores' biome icons — w1)
  dune:{p:{K:'#2a1a08',Y:'#f0c870',y:'#c89a48',S:'#fff0b0',C:'#4a8a3a'}, a:['......K..','.....KCK.','..KK.KCK.','.KSYKKCKK','KSYYYyKK.','KYYyyyyyK','KKKKKKKKK']},
  bamboo:{p:{K:'#0a1a06',G:'#7ab83e',g:'#3e7a22',L:'#b8e070'}, a:['.K...K.','KLK.KGK','KGKKLGK','KgKKGgK','KGKKLGK','KGK.KGK','KgK.KgK','KKK.KKK']},
  shroom:{p:{K:'#1a0610',R:'#d83a3a',r:'#8a1a22',W:'#fff4e8',S:'#e8dcc8'}, a:['..KKK..','.KRWRK.','KRRRWRK','KrRRRrK','.KKSKK.','..KSK..','..KSK..','..KKK..']},
  vent:{p:{K:'#140a06',D:'#4a4442',d:'#2e2a28',R:'#ff7a2a',Y:'#ffd070',s:'#9a9290'}, a:['.s..s..','..s.s.s','..KYK..','.KDRdK.','.KDDdK.','KDDDddK','KKKKKKK']},
  harpoon:{p:{K:'#10161c',W:'#e8f0f4',S:'#8a98a6',B:'#a07a48',R:'#e8dcbe'}, a:['.....KKKK','......KWK','.....KWSK','....KBKKK','...KBK...','..KBK....','.KBK.....','KRK......','KK.......']},   // (the sea's — w2)
  wave:{p:{K:'#0a1a28',W:'#e8f8ff',B:'#4aa8d8'}, a:['...KKKK..','..KWWWBK.','.KWBKKBBK','KWBK..KBK','KBBKKKBBK','.KKKKKKK.']},
  fish:{p:{K:'#0a1a24',C:'#8ad0e8',c:'#4a90b0',W:'#e8f8ff'}, a:['..KKKK..K','.KWCCCKKK','KCKCCCCcK','.KCCCcKKK','..KKKK..K']},
  net:{p:{K:'#1a1004',R:'#e8dcbe',O:'#e8b878'}, a:['...KKK...','..KOOOK..','.KKKKKKK.','KRKRKRKRK','KKRKRKRKK','.KRKRKRK.','..KRKRK..','...KKK...']},
  tide:{p:{K:'#061a1e',W:'#e8fffc',B:'#2fb7c9'}, a:'wave'}, tideD:{p:{K:'#0a1416',W:'#5a7a80',B:'#2a4a52'}, a:'wave'},   // (C2b) the Tide's wave — brimming / ebbed
  whirl:{p:{K:'#0e1420',W:'#eef4fb',S:'#8aa0bc',Y:'#ffd23f',y:'#b8861a'}, a:['..KKKKK..','.KWWWWWK.','KWKKKKKSK','KWK...KSK','KWK...KKK','KWK..KYK.','.KSK.KYYK','..KSSKYyK','...KKKKK.']},   // Whirl: the blade's full circle
  volley:{p:{S:'#e8e0c8',Y:'#ffd23f',B:'#b07a42'}, a:['Y...Y...Y','.S..S..S.','..S.S.S..','...BBB...','YSSB.BSSY','...BBB...','..S.S.S..','.S..S..S.','Y...Y...Y']},   // Volley: arrows all round
  draughtH:{p:{K:'#1a0608',C:'#b98a52',R:'#e8394c',r:'#a4182c',W:'#ffc4ca'}, a:['.KKK.','.KCK.','KKRKK','KRWRK','KRRrK','KRrrK','.KKK.']},   // a Healing Draught
  draughtG:{p:{K:'#1a1004',C:'#b98a52',R:'#ffc23a',r:'#b8841a',W:'#fff3b0'}, a:'draughtH'},                                   // a Greater Draught
  elixir:{p:{K:'#10141c',C:'#b98a52',R:'#6fd8e8',r:'#2a8a9a',W:'#e8fffc',G:'#d8e8f0'}, a:['.KKK.','.KCK.','.KGK.','KKRKK','KRWRK','KRRrK','KrRrK','.KKK.']},   // (C7b) an Elixir's tall vial (recoloured per kind: ex:<kind>)
  anvil:{p:{K:'#101318',S:'#9aa4b0',s:'#5a6270',W:'#e0e8f0',B:'#6a4420'}, a:['KKKKKKKKK.','KWSSSSSSKK','.KsSSSSsK.','..KKsKK...','..KsSsK...','.KKKKKKK..','.KBBBBBK..','.KKKKKKK..']},   // (C7b) the forge's anvil (its tab & sign)
  geode:{p:{K:'#14161a',g:'#9a948a',G:'#625c54',C:'#c8d0d8',c:'#7a8490',W:'#ffffff'}, a:['..KKK..','.KgGgK.','KgGCcGK','KGCWCgK','KgGcCGK','.KGgGK.','..KKK..']},   // (C4a) a geode: a rock with a crystal heart
  deep:{p:{K:'#060e20',W:'#8fb8ff',S:'#3a5aa8'}, a:'anchor'}, curse:{p:{K:'#1a0624',W:'#e0c0ff',s:'#8a5ac0'}, a:'skull'},   // (C8b) the Deep shrine's blue anchor · CURSED!'s violet skull (the buff row)
  fossil:{p:{K:'#1a140c',S:'#d8c8a0',s:'#9a8a64',W:'#fff4d8'}, a:['..KKKK..','.KWSSSK.','KWSKKKSK','KSKWSKsK','KSKSKKsK','KSsSSSsK','.KsssKK.','..KKKK..']},   // (C7a) a fossil: a coiled shell in stone (recoloured per find)
  plank:{p:{K:'#24160a',W:'#e6b47a',G:'#d09656',w:'#f2c890',P:'#b8844e',p:'#8a5a30',R:'#c8a870',r:'#7a6040'}, a:['.KKKKKKKKK.','KwWGRWGGRWK','KwPPrPPPrPK','KKKKRKKKRKK','KwGWRWWGRGK','KwPPrPPPrpK','KKKKRKKKRKK','KwppRpppRpK','.KKKKKKKKK.']},   // (PT1 B9) Ship's timber: three planks bound with two turns of rope (recoloured: Ironwood · Heartwood)
};
for(const k in MATS){ const m=MATS[k]; if(m.p) PXI_ART['m:'+k]={p:Object.assign({},PXI_ART[m.px].p,m.p), a:m.px}; }   // (C4a) every material's icon: its base art, recoloured (matPx)
for(const k in ELIXIR) PXI_ART['ex:'+k]={p:Object.assign({},PXI_ART.elixir.p,{R:ELIXIR[k].c, r:mixHex(ELIXIR[k].c,'#000000',0.45), W:mixHex(ELIXIR[k].c,'#ffffff',0.6)}), a:'elixir'};   // (C7b) each Elixir's vial in its own colour
Object.assign(PXI_ART,{   // (w5: the menus' icons — tabs, stores, trades, the shops; the same one-character-a-texel art as the HUD's)
  scroll:{p:{K:'#1e1206',W:'#f6eed4',w:'#c8b486',P:'#e8d8aa',p:'#a08452'}, a:['.KKKKKKK.','KWWWWWWWK','KwKKKKKwK','.KPPPPPK.','.KPpppPK.','.KPPPPPK.','.KPppPPK.','.KPPPPPK.','KWKKKKKWK','KWWWWWWwK','.KKKKKKK.']},
  you:{p:{K:'#140c08',H:'#8a5a2c',h:'#5c3a18',B:'#d23a2e',S:'#f0c89a',s:'#b8845a',E:'#2a1810',R:'#d8402e',N:'#2e5470',n:'#1a3448',Y:'#e8c060'}, a:['...KKKKK...','..KHHHHHK..','.KKBBBBBKK.','KhHHHHHHHhK','.KKSSSSSKK.','..KSESESK..','..KSSSSsK..','...KKsKK...','.KKRRRRRKK.','KNNNRNNNnnK','KNNNYNNNNnK','KKKKKKKKKKK']},
  folk:{p:{K:'#140c08',A:'#f0c89a',a:'#b8845a',H:'#5a3a1c',B:'#c8783a',b:'#8a4a22',C:'#4a7ab8',c:'#2a4a80',E:'#2a1810'}, a:['.......KKK..','......KHHHK.','.KKK..KAEAK.','KHHHK.KAAaK.','KAEAK..KaK..','KAAaK.KCCCK.','.KaK.KCCCCcK','KBBBKKCCCCcK','KBBBBKCCCCcK','KKKKKKKKKKKK']},
  cog:{p:{K:'#12161e',W:'#eef2f8',G:'#b8c0cc',g:'#6a7484',h:'#1c222c'}, a:['...KKK...','.KKKWKKK.','.KWGGGgK.','KKGGhGGKK','KWGhhhggK','KKGGhGgKK','.KGgggGK.','.KKKgKKK.','...KKK...']},
  compass:{p:{K:'#140c04',Y:'#e2bd62',y:'#8a6420',W:'#f4ecd0',w:'#c8b488',R:'#d23a2e',B:'#2e5470'}, a:['..KKKKK..','.KYYYYyK.','KYWWRWWyK','KYWWRWWyK','KYWWKWWyK','KYWWBWwyK','KYWWBwwyK','.KyyyyyK.','..KKKKK..']},
  pad:{p:{K:'#0e1018',G:'#6a7aa4',g:'#3e4a70',W:'#dde4f4',D:'#1a2038',R:'#e8504a',B:'#4a8ae8',Y:'#f0c040',V:'#5ac86a'}, a:['.KKKKKKKKK.','KGGGGGGGGGK','KGDGGGGGYGK','KDDDGGGBGRK','KGDGGWGGVGK','KGGGKKKGGgK','KGGgK.KGGgK','.KKK...KKK.']},
  meat:{p:{K:'#1e0a04',R:'#d8703e',r:'#8a3a1e',o:'#f0a870',W:'#f4ecd8',w:'#bfb090'}, a:['....KKKK.','...KoRRRK','..KoRRRrK','..KRRRRrK','.KRRRRrK.','KWKRrrK..','KWWKKK...','KWwK.....','.KK......']},
  crate:{p:{K:'#1a0e04',B:'#c08a4e',b:'#7a4e26',h:'#e0b070'}, a:['KKKKKKKKK','KhhhhhhhK','KBKKKKKBK','KBKBbBKbK','KBKbBbKbK','KBKBbBKbK','KBKKKKKbK','KbbbbbbbK','KKKKKKKKK']},
  map:{p:{K:'#1e1206',P:'#ecdcb0',p:'#b8a070',G:'#6aa84a',B:'#4a8ab8',R:'#d23a2e'}, a:['KKKKKKKKKKK','KPPpKPPKPPK','KPBpKPGKGPK','KBBpKRPKGPK','KPBpKPRKPPK','KPPpKGPKpPK','KKKKKKKKKKK']},
  pin:{p:{K:'#240608',R:'#e8404a',r:'#9a1c26',W:'#ffd0d4',S:'#b8c0cc'}, a:['.KKK.','KRWRK','KRRrK','KrRrK','.KrK.','.KSK.','.KSK.','..K..']},
  tent:{p:{K:'#1a1004',W:'#eadcb4',w:'#b89c68',R:'#b8482f',D:'#3a2410'}, a:['.....K.....','....KWK....','...KWWwK...','..KWWDwwK..','.KWWKDKwwK.','KWWWKDKwwwK','KKKKKKKKKKK']},
  whale:{p:{K:'#0a1624',B:'#4a82c0',b:'#2c5a90',W:'#e8f4ff',w:'#b8d0ea',S:'#cfe8ff'}, a:['.S.S........','..S....KK.KK','..KKKKK.KBBK','.KBBBBBKKbK.','KBWBBBBBBbK.','KBBBBBBBBK..','KwwwwwwbK...','.KKKKKKK....']},
  ship:{p:{K:'#140c04',W:'#f6eed8',w:'#c8b88e',R:'#d23a2e',B:'#9a6436',b:'#5c3a1c',M:'#6a4a28'}, a:['.....KR....','....KWKK...','...KWWKwK..','..KWWWKwwK.','.KWWWWKwwK.','.KKKKKMKKK.','KBBBBBBBBBK','.KBbBbBbBK.','..KKKKKKK..']},
  hammer:{p:{K:'#12141a',S:'#cfd6e0',s:'#7a8494',B:'#a8743e',b:'#6a4420'}, a:['.KKKKKK..','KSSSSSsK.','KSsssssKK','.KKKBKKK.','...KBK...','...KBK...','...KbK...','...KbK...','...KKK...']},
  hall:{p:{K:'#16120e',W:'#f0e8d8',w:'#b8b0a0',s:'#8a8478',R:'#c8a050'}, a:['....KK....','..KKWWKK..','.KWWRRWWK.','KKKKKKKKKK','.KWKWKWKK.','.KWKWKWKK.','.KWKWKWKK.','.KwKwKwKK.','KKKKKKKKKK','KsssssssK.']},
  lock:{p:{K:'#140c04',S:'#b8c0cc',s:'#6a7484',Y:'#e8c040',y:'#a07818',D:'#3a2808'}, a:['..KKK..','.KSKSK.','.KsKsK.','KKKKKKK','KYYYYyK','KYYDYyK','KYYDYyK','KyyyyyK','.KKKKK.']},
  hglass:{p:{K:'#140c04',B:'#a8743e',W:'#dff0ff',Y:'#f0c860'}, a:['KKKKKKK','KBBBBBK','.KWWWK.','.KYYYK.','..KYK..','.KWYWK.','.KYYYK.','KBBBBBK','KKKKKKK']},
  warn:{p:{K:'#1e1404',Y:'#ffd23f',y:'#c89018'}, a:['....K....','...KYK...','...KYK...','..KYKYK..','..KYKYK..','.KYYKYyK.','.KYYYYyK.','KYYYKYyyK','KKKKKKKKK']},
  xp:{p:{K:'#081a2a',W:'#f0faff',Y:'#6fd0ff'}, a:'spark'},
  sparkB:{p:{K:'#0a1430',W:'#e8f0ff',Y:'#8fb8ff'}, a:'spark'},
  bars:{p:{K:'#101418',R:'#e8604a',B:'#4a9ae8',G:'#6ad06a',W:'#ffffff'}, a:['......KKK','......KGK','...KKKKGK','...KBKKGK','KKKKBKKGK','KRKKBKKGK','KRKKBKKGK','KKKKKKKKK']},
  coat:{p:{K:'#101418',N:'#34587a',n:'#1c3448',W:'#e8e0cc',Y:'#e8c060',R:'#d23a2e'}, a:['.KKK.KKK.','KNNKRKNNK','KNNNWNNnK','KNKNWNKnK','KNKNYNKnK','KNKNWNKnK','.KKNNNKK.','..KKKKK..']},
  boar:{p:{K:'#140a06',B:'#8a5a3a',b:'#5a3620',P:'#e0a088',W:'#f4ecd8',E:'#ffe07a'}, a:['K.......K','KBK...KBK','.KBKKKBK.','KBBBBBBBK','KBEBBBEbK','KbBBBBBbK','.KWKPPKWK','..KPPPPK.','...KKKK..']},
  paw:{p:{K:'#140a06',B:'#d8a878',b:'#9a6a40'}, a:['.K..K..K.','KBK.KBK.KBK','KbK.KbK.KbK','.K.KKK.K..','..KBBBBK..','.KBBBBBbK.','.KBBBBbbK.','..KKKKKK..']},
  amber:{p:{K:'#1e1608',Y:'#e8c880',y:'#b0904a',W:'#fff4d4',d:'#8a6a34'}, a:['..KKKK..','.KWYYYK.','KWYYYyyK','KYYdYyyK','KYYYyydK','.KyydyK.','..KKKK..']},
  tusk:{p:{K:'#1a1610',W:'#f8f2e0',w:'#c8bc9a'}, a:['.......KK','......KWK','.....KWwK','....KWwK.','...KWwK..','..KWwK...','.KWwK....','KWwK.....','KKK......']},
  lifering:{p:{K:'#1e0808',R:'#e8483a',r:'#9a2418',W:'#f8f0e8'}, a:['..KKKKK..','.KRRWWRK.','KRKKKKKrK','KWK...KWK','KWK...KWK','KrKKKKKrK','.KrWWrrK.','..KKKKK..']},
  snd:{p:{K:'#101418',W:'#e8eef8',w:'#9aa8c0',C:'#8fd8ff'}, a:['...KK....','..KWK..C.','KKKWK.C.C','KWWWK.C.C','KwwwK.C.C','KKKwK.C.C','..KwK..C.','...KK....']},
  mute:{p:{K:'#101418',W:'#e8eef8',w:'#9aa8c0',R:'#ff6a5a'}, a:['...KK....','..KWK....','KKKWKR..R','KWWWK.RR.','KwwwK.RR.','KKKwKR..R','..KwK....','...KK....']},
  dice:{p:{K:'#101418',W:'#f8f4ec',w:'#c0b8a8',D:'#2a1c14'}, a:['KKKKKKK','KWWWWwK','KWDWWwK','KWWDWwK','KWWWDwK','KwwwwwK','KKKKKKK']},
  spool:{p:{K:'#140c04',B:'#b88a52',R:'#e05a4a',r:'#9a2a22'}, a:['KKKKKKK','KBBBBBK','.KRRrK.','.KRrrK.','.KRRrK.','.KRrrK.','KBBBBBK','KKKKKKK']},
  letter:{p:{K:'#1a1004',W:'#f4ecd6',w:'#c8b890',R:'#c8342a'}, a:['KKKKKKKKK','KWKWWWKwK','KWWKWKWwK','KWWWRWWwK','KwwwwwwwK','KKKKKKKKK']},
  fleur:{p:{K:'#1e1404',Y:'#ffd86b',y:'#b8861c'}, a:['....K....','...KYK...','.K.KYK.K.','KYKKYKKYK','KYYKYKYyK','.KKYYyKK.','..KKYKK..','.KYYYYyK.','..KKKKK..']},
  stew:{p:{K:'#140c08',W:'#e8eef4',B:'#6a7484',b:'#3a4050',S:'#c86a3a'}, a:['.W..W..W.','..W..W...','KKKKKKKKK','KSSSSSSSK','KBBBBBBbK','.KBBBBbK.','..KKKKK..']},
  magnet:{p:{K:'#140808',R:'#e8483a',r:'#9a2418',W:'#dfe6f0'}, a:['KKK.KKK','KWK.KWK','KRK.KrK','KRK.KrK','KRKKKrK','.KRRrK.','..KKK..']},
  hook:{p:{K:'#12141a',S:'#cfd6e0',s:'#7a8494'}, a:['..KKK.','..KSK.','..KSK.','..KsK.','K.KsK.','KSKsK.','KsSsK.','.KKK..']},
  cask:{p:{K:'#1a0e04',B:'#b07a42',b:'#7a4e26',I:'#5a6070'}, a:['.KKKKK.','KBBbBbK','KIIIIIK','KBBbBbK','KBBbBbK','KIIIIIK','KBBbBbK','.KKKKK.']},
  qmark:{p:{K:'#101830',W:'#cfd8ee',w:'#7e8eb4'}, a:['.KKKK.','KWWWwK','KWKKwK','.K.KwK','..KWwK','..KwK.','..KK..','..KwK.','..KK..']},
  darr:{p:{K:'#101830',W:'#cfd8ee',w:'#7e8eb4'}, a:['..KKK..','..KWK..','..KWK..','..KWK..','KKKWKKK','KWWWWwK','.KWWwK.','..KwK..','...K...']},   // (PT1 W10) the drop zone's arrow — down to the ground
  house:{p:{K:'#140a06',R:'#c8483a',r:'#8a2a1e',W:'#ecdcb8',w:'#b8a070',D:'#5a3a1c',Y:'#ffd86b'}, a:['....K....','...KRK...','..KRRrK..','.KRRRRrK.','KKKKKKKKK','.KWWWKwK.','.KWYWKDK.','.KwwwKDK.','.KKKKKKK.']},
  menu:{p:{K:'#0c1018',W:'#f0e6c4',w:'#b89a5a'}, a:['KKKKKKKK','KWWWWWwK','KKKKKKKK','KWWWWWwK','KKKKKKKK','KWWWWWwK','KKKKKKKK']},
  beads:{p:{K:'#101418',B:'#8ad0e8',b:'#3a8ab0',Y:'#e8c060'}, a:['..KKK..','.KBKBK.','KbK.KbK','KK...KK','KBK.KBK','.KbKbK.','..KYK..','..KYK..','...K...']},
  tooth:{p:{K:'#1e1a14',W:'#f8f4e8',s:'#c8bca0'}, a:['.KKKKK.','KWWWWsK','KWWWWsK','KWWWWsK','.KWKWK.','.KWKsK.','..K.K..']},
  trBoar:{p:{K:'#1a1610',W:'#f8f2e0',w:'#c8bc9a',B:'#8a5a30',b:'#5a3a22'}, a:['W......W','Ww....wW','.Ww..wW.','.KWwwWK.','..KWWK..','KBBBBBBK','KbBBBBbK','.KKKKKK.']},   // (PT1 B5a) the trophy shelf's four: the Great Boar's tusks on a plaque
  trBrood:{p:{K:'#1a0a24',V:'#b58cff',v:'#7a4ac8',W:'#f0e6ff'}, a:['..KKKK..','.KVWVVK.','KVWvVvVK','KVvVvVVK','KvVvVvVK','KVvVVvvK','.KvvvvK.','..KKKK..']},   // the Broodmother's violet shell
  trPack:{p:{K:'#14161c',G:'#a8b0bc',g:'#6a7280',c:'#b8863a'}, a:['.KKKKKK.','KGgGcGgK','KgGGcGGK','KGGgcgGK','KgGGcGgK','KGgGcGGK','.KKKKKK.']},   // the Pack King's grey pelt, rolled & tied
  trTide:{p:{K:'#061a14',y:'#b8861c',G:'#5ae0a0',g:'#2a9a6a',W:'#e8fff4'}, a:['..KKK..','.KK.KK.','KyyyyyK','KGWGgGK','KGGWgGK','KgGGggK','KyyyyyK','.KKKKK.']},   // the Drowned Tidecaller's green lantern
  idol:{p:{K:'#101410',G:'#9aa89a',g:'#5a665a',D:'#1c241c',h:'#c8d4c8'}, a:['.KKKKK.','KhGGGgK','KGGGGgK','KDDGDDK','KGGhGgK','KGGhGgK','KGDDDgK','KGGGGgK','KgggggK','KKKKKKK']},
  shell:{p:{K:'#2a1418',P:'#f8d0c0',p:'#d88a8a',W:'#fff4ec'}, a:['...KKK..','..KWPPK.','.KPPpPK.','KPpPPpK.','KPPPpK..','.KPpK...','..KK....']},
  eye:{p:{K:'#081430',B:'#3a6ae8',W:'#f0f6ff',C:'#8ad0ff',D:'#0a1020'}, a:['.KKKKK.','KBBBBBK','KBWWWBK','KBWDCBK','KBWWWBK','KBBBBBK','.KKKKK.']},
  trident:{p:{K:'#1a1404',Y:'#ffd86b',y:'#b8861c'}, a:['K..K..K','KYKKKYK','KYKYKyK','.KYYyK.','..KYK..','..KyK..','..KyK..','..KKK..']},
});
Object.assign(PXI_ART,{   // (C4b §6.9: the gear's ground & doll icons — the slots & weapon types the HUD didn't draw yet · the seals' embosses)
  axe:{p:{K:'#12141a',S:'#cfd6e0',s:'#7a8494',B:'#a8743e',b:'#6a4420'}, a:['.KKK.....','KSSSK....','KSSsSK...','.KSsKBK..','..KKKBK..','....KBK..','.....KBK.','......KbK','.......KK']},
  spear:{p:{K:'#10161c',W:'#e8f0f4',S:'#8a98a6',B:'#a07a48',b:'#6a4a28'}, a:['......KK','.....KWK','....KWSK','...KBKK.','..KBK...','.KBK....','KbK.....','KK......']},
  dagger:{p:{K:'#10141c',W:'#eef4fb',S:'#8a9aac',H:'#e0a820',h:'#6a4a20'}, a:['.....KK','....KWK','...KWSK','..KWSK.','.KHSK..','KhHK...','.KK....']},
  staff:{p:{K:'#140c06',C:'#8fd8ff',c:'#3a8ab8',W:'#f0ffff',B:'#a07a48',b:'#6a4a28'}, a:['..KKK..','.KWCcK.','.KCccK.','..KBK..','..KBK..','..KbK..','..KBK..','..KbK..','..KKK..']},
  wand:{p:{K:'#140606',R:'#ff7f6a',r:'#b8403a',W:'#ffe0d8',B:'#d8b878',b:'#8a6a3a'}, a:['..KK.','.KWRK','.KRrK','..KBK','.KBK.','.KbK.','KBK..','KKK..']},
  quiver:{p:{K:'#140c04',W:'#f2e6c8',R:'#d23a2e',B:'#a8743e',b:'#6a4420'}, a:['.K.K.K.','KWKRKWK','.KBBBK.','.KBbBK.','.KBBBK.','.KBbBK.','.KBBBK.','..KKK..']},
  focus:{p:{K:'#0a1420',W:'#f0ffff',C:'#8de9ff',c:'#4aa8d8',B:'#c8a050'}, a:['..KKK..','.KWCCK.','KWCCCcK','KCCCccK','.KCccK.','..KKK..','.KBBBK.','KKKKKKK']},
  helm:{p:{K:'#0e0c10',N:'#2e3a58',n:'#1a2238',Y:'#e8c060'}, a:['....K....','..KKNKK..','.KNNNNnK.','KNNNNNNnK','KYYYYYYYK','KKKKKKKKK']},
  glove:{p:{K:'#140a04',S:'#b07a42',s:'#7a4e26',B:'#e8c060'}, a:['.K.K.K..','KSKSKSK.','KSKSKSKK','KSSSSSKSK','KSSSSSSK.','.KSSSSsK.','.KBBBBK..','.KKKKKK..']},
  amulet:{p:{K:'#140c04',Y:'#e8c060',W:'#f0ffff',C:'#6fe0c0'}, a:['K.....K','.K...K.','..K.K..','...K...','..KYK..','.KYWYK.','KYWCWYK','.KYCYK.','..KYK..','...K...']},
  knot:{p:{K:'#1e1206',b:'#b89a64',B:'#8a6a3a'}, a:['.K.K.','KbKbK','.KBK.','KbKbK','.K.K.']},
  coralb:{p:{K:'#240806',R:'#ff7f6a',r:'#b8403a'}, a:['.K..K..K.','KRK.KRKRK','KRK.KrKK.','.KRKKRK..','..KRrK...','...KRK...','..KKKKK..']},
  pearl:{p:{K:'#2a2010',W:'#ffffff',w:'#f0e6d0',g:'#c8b890'}, a:['..KKK..','.KWWwK.','KWWWwwK','KWWwwwK','KwwwwgK','.KwwgK.','..KKK..']},
  kraken:{p:{K:'#10061c',V:'#b58cff',W:'#f0e6ff',D:'#1a0830'}, a:['.KKKKK.','KVVVVVK','KVWWWVK','KVWDWVK','KVWWWVK','KVVVVVK','.KKKKK.']},
});
Object.assign(PXI_ART,{   // (C5b §12: the skill gems' icons — the HUD kit's own art, recoloured by what each gem does, and five new: the whirlpool, the rain, the bolt, the gull, the lighthouse)
  g01:{p:{K:'#06181e',W:'#e8fffc',S:'#5fd8e8',H:'#2fb7c9',h:'#1a6a7a'}, a:'blade'},                                   // Riptide Edge: a sea-blue blade
  g03:{p:{K:'#061a1e',W:'#e8fffc',S:'#5fd8e8',B:'#2fb7c9',b:'#1a6a7a'}, a:'spear'},                                  // Tidal Lunge
  g04:{p:{K:'#1e1404',S:'#ffe39a',s:'#c8901a',R:'#8a5a10'}, a:'shield'},                                             // Riposte: a gold guard
  g05:{p:{K:'#1a0606',S:'#ffd0d0',s:'#c8242a',B:'#a8743e',b:'#6a4420'}, a:'axe'},                                    // Rending Chop: a bloodied edge
  g06:{p:{K:'#140c06',S:'#e0c89a',s:'#8a6a3a',B:'#a8743e',b:'#6a4420'}, a:'hammer'},                                 // Groundswell Slam
  g07:{p:{K:'#061a1e',W:'#bff6ff',S:'#2fb7c9'}, a:'anchor'},                                                          // Anchor Chain: a spectral anchor
  g08:{p:{K:'#2a0404',R:'#ff3a2a'}, a:'anger'},                                                                       // Bloodtide Roar
  g09:{p:{K:'#1a1404',Y:'#ffe55a',y:'#c8a018'}, a:'trident'},                                                          // Tempest Thrust
  g11:{p:{K:'#240806',R:'#ff9a7a',r:'#c8403a'}, a:'coralb'},                                                          // Reef Barrage
  g12:{p:{K:'#061a24',W:'#e8fffc',B:'#4ab8d8',b:'#1a6a8a'}, a:['..KKKKK..','.KBBBBBK.','KBKKKKWBK','KBKWWBKBK','KBKBKBKBK','KBKBKKBbK','KBKWBBbK.','.KBKKKK..','..KbbbK..']},   // Whirlpool
  g13:{p:{K:'#0e2006',W:'#e8ffd0',S:'#9be85a',H:'#4a8a2a',h:'#2a4a14'}, a:'dagger'},                                 // Venom Kiss
  g14:{p:{K:'#061a1e',C:'#bff6ff',c:'#2fb7c9'}, a:'wind'},                                                            // Undertow Step
  g15:{p:{K:'#10141c',W:'#eef4fb',S:'#b8c0cc',H:'#e8483a',h:'#8a1a22'}, a:'dagger'},                                 // Knife Fan
  g16:{p:{K:'#0e1420',W:'#e8f6ff',S:'#8fb8ff',Y:'#9ff0ff',y:'#2fb7c9'}, a:'whirl'},                                  // Maelstrom Dance
  g17:{p:{K:'#0e1a06',B:'#8ac860',b:'#4a7a2a',S:'#f2f8e0'}, a:'bow'},                                                 // Split Shot
  g19:{p:{K:'#1a1404',W:'#fffbe0',Y:'#ffe55a'}, a:'spark'},                                                           // Storm Arrow
  g20:{p:{K:'#1a1004',S:'#e8e0c8',Y:'#ffd23f',B:'#b07a42'}, a:['.B..B..B.','.S..S..S.','.S..S..S.','.S..S..S.','.S..S..S.','KYK.S.KYK','.Y.KYK.Y.','....Y....']},   // Rain of Barbs
  g21:{p:{K:'#2a0c04',R:'#d8401a',O:'#ff8a1e',Y:'#ffd23f',W:'#fff6c8'}, a:'flame'},                                  // Ember Lob
  g22:{p:{K:'#0a1a2a',W:'#f0faff',B:'#8fd8ff'}, a:'snow'},                                                            // Rime Burst
  g23:{p:{K:'#1a1404',Y:'#ffe55a',W:'#fffbe0'}, a:['...KKK.','..KYWK.','.KYYK..','KYYYYK.','.KKYYK.','..KYK..','.KYK...','.KK....']},   // St Elmo's Chain
  g24:{p:{K:'#061a16',W:'#9fe8d8',s:'#3fae9e'}, a:'skull'},                                                           // Call the Deep
  g25:{p:{K:'#061a1e',b:'#9ff0ff',h:'#e8fffc',S:'#2fb7c9',w:'#ffffff'}, a:'boot'},                                   // Seafoam Rush
  g26:{p:{K:'#061a1e',S:'#bff6ff',s:'#5fd8e8',R:'#2fb7c9'}, a:'shield'},                                              // Brine Ward
  g27:{p:{K:'#1a1c22',W:'#f4f8fc',Y:'#ffb84a'}, a:['KK.....KK','KWKK.KKWK','.KWWKWWK.','..KWYWK..','...KKK...']},   // Gull Familiar
  g29:{p:{K:'#140c06',Y:'#ffe55a',W:'#f4ecd8',R:'#d23a2e'}, a:['..KYK..','.KYYYK.','..KKK..','..KWK..','..KRK..','..KWK..','.KWRWK.','.KRWRK.','KWWRWWK','KKKKKKK']},   // Lighthouse Beacon
  g30:{p:{K:'#140c04',W:'#f6eed8',w:'#c8b88e',R:'#d23a2e',B:'#9a6436',b:'#5c3a1c',M:'#6a4a28'}, a:'ship'},          // Broadside
  mvHeavy:{p:{K:'#12141a',H:'#f4f8fc',S:'#c8d0dc',s:'#76808f',B:'#a8743e',b:'#6a4420',Y:'#ffd23f',W:'#fff6c8'}, a:['......Y..','.KKKKKYWY','KHSSSsKY.','KSSSssK..','.KKBKK...','..KBK....','..KbK....','..KbK....','..KKK....']}, mvSweep:{p:{K:'#0a1420',W:'#eef8ff',C:'#8fd8ff',c:'#3a8ab8'}, a:['.........','.........','.K.......','KWK.....K','KCWK...KC','.KCWKKKCc','..KCCCCcK','...KKKKK.','.........']}, mvLunge:{p:{K:'#1a1404',W:'#fff6c8',S:'#ffd23f',s:'#c8901a',Y:'#ffb84a'}, a:['.........','....KK...','....KWK..','Y.KKKSWK.','YYWWWWWWK','Y.KKKSsK.','....KsK..','....KK...','.........']} });   // (PROJECT STEEL) the ✦ Tree's NEW MOVE icons: THE HEAVY's hammer & spark · the 4th blow's low SWEEP · the 5th's gold LUNGE
seasLmkPxi();   // (SEAS SE4: the landmarks' own icons — lmArch · lmNeedle · lmBanyan · lmFang, from their shapes)
const PXI={};
function pxiCv(n){ let c=PXI[n]; if(c) return c; const A=PXI_ART[n]; if(!A) return null; const rows=typeof A.a==='string'?PXI_ART[A.a].a:A.a, h=rows.length, w=rows.reduce((m,r)=>Math.max(m,r.length),0);
  c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d');
  for(let y=0;y<h;y++) for(let x=0;x<rows[y].length;x++){ const col=A.p[rows[y][x]]; if(col){ g.fillStyle=col; g.fillRect(x,y,1,1); } }
  return PXI[n]=c; }
function pxIcon(n,x,cy,k,g){ const c=pxiCv(n); if(!c) return 0; (g||ctx).drawImage(c,Math.round(x),Math.round(cy-c.height*k/2),c.width*k,c.height*k); return c.width*k; }   // (x = left edge, cy = its vertical middle) → its width · the crawl HUD runs with smoothing OFF, so it lands in hard pixels
function pxiW(n,k){ const c=pxiCv(n); return c?c.width*k:0; }
function pxiURL(n,k){ const key=n+'@'+k; if(PXI[key]) return PXI[key]; const c=pxiCv(n); if(!c) return ''; const o=document.createElement('canvas'); o.width=c.width*k; o.height=c.height*k;
  const g=o.getContext('2d'); g.imageSmoothingEnabled=false; g.drawImage(c,0,0,o.width,o.height); return PXI[key]=o.toDataURL(); }   // (for the satchel panel's DOM tiles)
/* emoji → pixel icons in crawl HUD text: a string is split into text runs & icons (cached), drawn with the plate's shadow ('pan'), the world outline ('hud') or plain */
const EMO_PXI={'⚓':'anchor','📒':'book','📖':'book','🗝':'key','✨':'spark','✦':'spark','🪧':'sign','⚔':'blade','🗡':'blade','🏹':'bow','⭐':'star','🪙':'coin','⚑':'flag','☠':'skull','💀':'skull','🔥':'flame','❄':'snow','🛡':'shield','💍':'ring','🧪':'flask','💨':'wind','✴':'spine','☣':'venom','🩸':'blood','🌵':'thorn','🪨':'stone','💢':'anger','🌴':'palm','🌾':'grain','⛰':'mount','🍂':'leaf','🏝':'isle','🌸':'blossom','🌋':'volcano','💠':'crystal','🐸':'frog','🏜':'dune','🎋':'bamboo','🍄':'shroom','♨':'vent','❤':'heart','🥾':'boot','🎒':'bag','💎':'gem','🌊':'wave','🐟':'fish','⚒':'harpoon','🎣':'net',
  '📜':'scroll','🧍':'you','👥':'folk','⚙':'cog','🧭':'compass','🎮':'pad','🍖':'meat','🧺':'crate','📦':'crate','🗺':'map','📍':'pin','⛺':'tent','🐋':'whale','🐳':'whale','⛵':'ship',   // (w5: the menus' icons — tabs, stores, trades, shops)
  '🛠':'hammer','🔨':'hammer','🏗':'hammer','🪵':'plank','🏛':'hall','🔒':'lock','⏳':'hglass','⏱':'hglass','⚠':'warn','🧬':'xp','✧':'sparkB','📊':'bars','🎽':'coat','🐗':'boar','🐾':'paw','🛟':'lifering','🔊':'snd','🔇':'mute',
  '🎲':'dice','🧵':'spool','🪡':'spool','✉':'letter','💌':'letter','⚜':'fleur','🍲':'stew','🧲':'magnet','🪝':'hook','🛢':'cask','🧨':'keg','🧱':'wall','🪤':'spikes','🪶':'dart','🌉':'bridge','🌁':'lmArch','🗼':'lmNeedle','🌳':'lmBanyan','🧊':'lmFang','🏟':'stones','❔':'qmark','🏠':'house','☰':'menu','📿':'beads','🦷':'tooth','🗿':'idol',
  '🐚':'shell','🧿':'eye','🔱':'trident','🫧':'amber','🦄':'tusk','⛏':'ore','🦴':'bone','🌿':'herb','🏺':'relic','🍺':'mug','💬':'bub','🗣':'bub','❗':'bang','♥':'heart','🤍':'heartE','★':'star','🕸':'net','🛒':'bag','🌍':'isle'};
const EMO_RE=new RegExp('('+Object.keys(EMO_PXI).join('|')+')\uFE0F?','gu'), EMOS=new Map(), TRAIT_PXI={hasty:'wind',spined:'spine',shelled:'shield',venom:'venom',summon:'skull',leech:'blood',thorn:'thorn',stone:'stone',frenzy:'anger',burning:'flame',frost:'snow'};
function emoSeg(t){ t=String(t); let S=EMOS.get(t); if(S) return S; S=[]; let i=0, m; EMO_RE.lastIndex=0;
  while((m=EMO_RE.exec(t))){ if(m.index>i) S.push(t.slice(i,m.index)); S.push({i:EMO_PXI[m[1]]}); i=m.index+m[0].length; }
  if(i<t.length) S.push(t.slice(i)); if(EMOS.size>400) EMOS.clear(); EMOS.set(t,S); return S; }
function emoK(fs){ return Math.max(1,Math.round(fs/8.5)); }
function emoW(t,fs,g){ g=g||ctx; const k=emoK(fs); let w=0; for(const q of emoSeg(t)) w+=typeof q==='string'?g.measureText(q).width:pxiW(q.i,k)+Math.round(fs*0.14); return w; }
function emoTxt(t,x,y,col,fs,mode,g,lw,sc){ g=g||ctx; const S=emoSeg(t); if(S.length===1 && typeof S[0]==='string'){ if(mode==='pan') panTxt(t,x,y,col,null,g); else if(mode==='hud'){ g.lineJoin='round'; g.strokeStyle=sc||'rgba(4,7,14,.88)'; g.lineWidth=lw||3; g.strokeText(t,x,y); g.fillStyle=col; g.fillText(t,x,y); } else { g.fillStyle=col; g.fillText(t,x,y); } return; }
  const al=g.textAlign, k=emoK(fs); if(al==='center'){ x-=emoW(t,fs,g)/2; } else if(al==='right'){ x-=emoW(t,fs,g); } g.textAlign='left';
  const cy=g.textBaseline==='middle'?y:y-Math.round(fs*0.36), sm=g.imageSmoothingEnabled; g.imageSmoothingEnabled=false;
  for(const q of S){ if(typeof q==='string'){ if(mode==='pan') panTxt(q,x,y,col,null,g); else if(mode==='hud'){ g.lineJoin='round'; g.strokeStyle=sc||'rgba(4,7,14,.88)'; g.lineWidth=lw||3; g.strokeText(q,x,y); g.fillStyle=col; g.fillText(q,x,y); } else { g.fillStyle=col; g.fillText(q,x,y); } x+=g.measureText(q).width; }
    else x+=pxIcon(q.i,x,cy,k,g)+Math.round(fs*0.14); }
  g.imageSmoothingEnabled=sm; g.textAlign=al; }
/* ---- key caps: a parchment key on the keyboard · a coloured face button / a dark shoulder plate on the pad ---- */
const PADFACE={A:['#3fb14e','#1f6a2a'], B:['#dd4a3c','#7a1e16'], X:['#3f80e4','#1c3f80'], Y:['#e8b52a','#7a5810']};
const GLC=new Map();
function glyphCap(t,h,pad){ const key=t+'|'+h+'|'+(pad?1:0)+'|'+DPR; let c=GLC.get(key); if(c) return c; if(GLC.size>96) GLC.clear();
  const fs=Math.max(8,Math.round(h*(t.length>2?0.5:0.62))), face=pad&&PADFACE[t]; ctx.save(); ctx.font='800 '+fs+'px system-ui'; const tw=ctx.measureText(t).width; ctx.restore();
  const w=face?h:Math.max(h,Math.round(tw+h*0.62)), cv2=document.createElement('canvas'); cv2.width=Math.ceil(w*DPR); cv2.height=Math.ceil(h*DPR);
  const g=cv2.getContext('2d'); g.scale(DPR,DPR); const b=h>=22?2:1;
  if(face){ const r=h/2, disc=(rr,col,y0,y1)=>{ g.fillStyle=col; for(let yy=y0;yy<y1;yy++){ const dy=yy+0.5-r, hw=Math.round(Math.sqrt(Math.max(0,rr*rr-dy*dy))); if(hw>0) g.fillRect(Math.round(r-hw),yy,hw*2,1); } };
    disc(r,'#04070e',0,h); disc(r-b,PADFACE[t][1],b,h-b); disc(r-b,PADFACE[t][0],b,Math.round(h*0.62)); g.fillStyle='rgba(255,255,255,.35)'; g.fillRect(Math.round(r-h*0.18),b+1,Math.round(h*0.36),b); }
  else if(pad){ g.fillStyle='#04070e'; g.fillRect(b,0,w-2*b,h); g.fillRect(0,b,w,h-2*b);                 // a shoulder / trigger / stick: a dark plate
    g.fillStyle='#2b3656'; g.fillRect(b,b,w-2*b,h-2*b); g.fillStyle='#5a6a94'; g.fillRect(b,b,w-2*b,b); g.fillStyle='#161d30'; g.fillRect(b,h-2*b,w-2*b,b); }
  else { g.fillStyle='#04070e'; g.fillRect(b,0,w-2*b,h); g.fillRect(0,b,w,h-2*b);                        // a key: parchment face, a shaded lip
    g.fillStyle='#e9dcbc'; g.fillRect(b,b,w-2*b,h-2*b); g.fillStyle='#fffaea'; g.fillRect(b,b,w-2*b,b); g.fillStyle='#a8946c'; g.fillRect(b,h-3*b,w-2*b,2*b); }
  g.font='800 '+fs+'px system-ui'; g.textAlign='center'; g.textBaseline='middle'; g.fillStyle=face?'#ffffff':pad?'#eef3ff':'#1c1206';
  if(face){ g.strokeStyle='rgba(0,0,0,.45)'; g.lineWidth=2; g.strokeText(t,w/2,h/2+(pad?0.5:0)); }
  g.fillText(t,w/2,h/2-(pad?0:b*0.5)+0.5);
  c={cv:cv2,w,h}; GLC.set(key,c); return c; }
function drawGlyph(r,x,cy,h,g){ const c=glyphCap(glyph(r),Math.round(h),inDev==='pad'); (g||ctx).drawImage(c.cv,Math.round(x),Math.round(cy-c.h/2),c.w,c.h); return c.w; }   // → its width
function glyphW(r,h){ return glyphCap(glyph(r),Math.round(h),inDev==='pad').w; }
/* ---- one-time LESSONS: a strip at the bottom for the first landfall · the first chest · the first skill point · the Tide (saved — each shows until it's done) ---- */
function tutDone(k){ return !!(ptMode?TUTPT:TUT)[k]; }
function tutMark(k){ const T=ptMode?TUTPT:TUT; if(T[k]) return; T[k]=1; if(!ptMode) queueSave(); }
function tutPick(it){ const T=tutPick0(it); if(T) T.items=T.items.filter(q=>glyph(q[0])!=='—'); return T; }   // (C9 §12: a lesson lists ONLY keys that are bound — an unbound pad role drops out)
function tutSkills(){ const L=[]; for(let i=1;i<6;i++){ const G=barLive(i); if(G && GEMS[G.g].sl==='skill') L.push([i, GEMS[G.g].n.toLowerCase()]); }   // the bar's live skills: slot 2 by name · slots 3–6 by name when few, else '[1–4] skills'
  const out=[], s2=L.find(q=>q[0]===1), rest=L.filter(q=>q[0]>1); if(s2) out.push([BAR_ROLES[1], s2[1]]);
  if(rest.length>=2 && inDev!=='pad') out.push(['#1–'+Math.max(...rest.map(q=>q[0]-1)), 'skills']);
  else for(const q of rest) out.push([BAR_ROLES[q[0]], rest.length>=3?'':q[1]]);
  return out; }
function tutPick0(it){ if(!(ITUNE.tutOn>0) || !ISL || koBeat || caveFade) return null;
  { const B=ISL.boss; if(B && !B.dead && (B.aggro || ISL.seal || ISL.bannerT>=0)) return null; }   // (G3 fix: no lesson over a boss duel — its banner, the sealed room, the fight — they wait for the fall)
  if(sagaCoachOn()) return sagaCoach();                                   // (INTROSTORY C8: while an A step runs the GUILD strip names its keys — the TIP lessons wait)
  if(it && it.kind==='chest' && !tutDone('chest')) return {k:'chest', col:'#ffd86b', items:[['interact','open it — the loot spills out: walk over it to scoop it into your satchel']]};
  if(it && it.kind==='qe' && !tutDone('gear')) return {k:'gear', col:'#7fe3a0', lead:'a better find — ▲', items:[['interact','hold to wear it'],['menu','→ ⚔ Gear to compare']]};   // (§12: the first ▲ item)
  if(!tutDone('land') && !ISL.cave && !ISL.peace)   // (§12: only the keys that are bound — slot 2's skill by name, the rest '[1–4] skills' once two sit there)
    return {k:'land', col:'#9fd0ff', lead:inDev==='pad'?'left stick moves · right stick aims':'WASD moves · the mouse aims',
      items:[['attack','strike · hold: HEAVY'], ...tutSkills(), ['dash','dash'], ['potion','drink'], ['interact','use']]};
  if(treePts()>0 && !tutDone('tree') && tutS.trSn!==tutLandK()) return {k:'tree', col:'#8ef0b0', items:[['menu','→ ✦ Tree — a passive point to spend (a keystone costs 3)']]};   // (§12: the first point · G5 fix: after the landfall lesson, 12 s a landfall — then it lapses till the next)
  if(!tutDone('gem') && tutDone('land') && !islRoused && BAG.some(e=>e && e.k==='g'))   // (C9) the first SKILL GEM in the satchel: where it goes
    return {k:'gem', col:'#6fe0c0', lead:'a skill gem —', items:[['menu','→ ⚔ Gear → your bar: slot it (it levels as you use it)']]};
  if(!tutDone('tide') && tutDone('land') && barCost(1)>0 && tide>=barCost(1) && tripStats.kills>=1){ const D=GEMS[barSk(1)];   // the TIDE: the first time a skill is paid for — spend it
    return {k:'tide', col:'#2fb7c9', lead:'your strikes raise the TIDE — spend it on skills', items:[['skill2', D.n+' ('+barCost(1)+' Tide)']]}; }
  return null; }
let tutS={k:null, t:0, a:0, lt:0, T:null};
function tutLandK(){ return (ptMode?'p':'v')+(ptMode?ptLandN:landN); }   // (G5 fix) this landfall — the tree tip's 12 s are per landfall
function drawTutorial(L,yb,it){ const T=tutPick(it), dtT=clamp(itime-tutS.lt,0,0.1); tutS.lt=itime;
  if(T){ if(T.k!==tutS.k){ tutS.k=T.k; tutS.t=0; tutS.a=0; } tutS.T=T; tutS.t+=dtT; tutS.a=Math.min(1,tutS.a+dtT*4);
    if(T.k==='land' && ((tripStats.kills>=1 && tutS.t>=ITUNE.tutHold) || tutS.t>45)) tutMark('land');
    if(T.k==='gem' && tutS.t>12) tutMark('gem');
    if(T.k==='tree' && tutS.t>12) tutS.trSn=tutLandK(); }                                             // (C9: the gem lesson says its piece, then bows out — or ⚔ Gear opens)   // (the first landfall's lesson stays until your first kill — and a breath more)
  else { tutS.a=Math.max(0,tutS.a-dtT*3); if(tutS.a<=0){ tutS.k=null; tutS.T=null; } }
  const S=tutS.T; if(!S || tutS.a<=0) return yb;
  const U=L.U, gh=Math.round(18*U), fs=Math.round(12.5*U), gap=Math.round(14*U), pdx=Math.round(12*U), fnt='700 '+fs+'px system-ui', minX=L.pc.x+L.pc.w+Math.round(12*U), maxW=Math.min(CSSW-L.pd-minX, Math.round(820*U));
  const gl=S.items.map(q=>glyph(q[0])).join(','), key='tut|'+S.k+'|'+inDev+'|'+gl+'|'+maxW+'|'+U+'|'+DPR+'|'+(S.lead||'')+'|'+S.items.map(q=>q[1]).join('|');
  let lay=tutS.lay; if(!lay || lay.key!==key){ ctx.font=fnt;                                             // (measured & laid out once per lesson — the plate is baked)
    const tagW=Math.round(ctx.measureText(S.tag||'TIP').width+12*U), items=S.items.map(([r,t])=>({r, t, tw:ctx.measureText(t).width, w:glyphW(r,gh)+Math.round(6*U)+ctx.measureText(t).width})), leadW=S.lead?ctx.measureText(S.lead).width:0;
    const rows=[[]]; let rw=tagW+Math.round(8*U)+(S.lead?leadW+gap:0); const rws=[];
    if(S.lead && rw>maxW*0.62){ rws.push(rw); rows.push([]); rw=tagW+Math.round(8*U); }   // (narrow: the lead line stands alone)
    for(const q of items){ if(rows[rows.length-1].length && rw+q.w>maxW-2*pdx){ rws.push(rw); rows.push([]); rw=tagW+Math.round(8*U); } rows[rows.length-1].push(q); rw+=q.w+gap; } rws.push(rw);
    const rh=Math.round(24*U), w=Math.round(Math.min(maxW, Math.max(...rws)-gap+2*pdx)), h=rows.length*rh+Math.round(8*U);
    lay=tutS.lay={key, w, h, P:hudPlate(key,w,h,g=>{ pxPanel(0,0,w,h,null,g); g.textBaseline='middle'; g.textAlign='left';
      rows.forEach((row,ri)=>{ const ry=Math.round(4*U)+ri*rh+rh/2; let tx=pdx;
        if(ri===0){ g.fillStyle=S.col; g.fillRect(tx,Math.round(ry-8*U),tagW,Math.round(16*U)); g.fillStyle='#0b1220'; g.font='800 '+Math.round(10*U)+'px system-ui'; g.fillText(S.tag||'TIP',tx+Math.round(6*U),ry+1); tx+=tagW+Math.round(8*U);
          if(S.lead){ panTxt(S.lead,tx,ry+1,'#cfe0ff',fnt,g); tx+=leadW+gap; } }
        else tx+=tagW+Math.round(8*U);
        for(const q of row){ tx+=drawGlyph(q.r,tx,ry,gh,g)+Math.round(6*U); panTxt(q.t,tx,ry+1,'#ffe6a6',fnt,g); tx+=q.tw+gap; } }); })}; }
  let cx=CSSW/2; if(cx-lay.w/2<minX) cx=Math.min(minX+lay.w/2, CSSW-L.pd-lay.w/2);
  const x=Math.round(cx-lay.w/2), y=Math.round(yb-lay.h), rise=Math.round((1-tutS.a)*8*U);
  ctx.globalAlpha=tutS.a; ctx.drawImage(lay.P.cv,x,y+rise,lay.w,lay.h); ctx.globalAlpha=1;
  return y-Math.round(8*U); }
/* the E prompt: its icon, the key cap (keyboard or pad), what it does — bottom-centre, never over you */
function drawPrompt(L,label,yb,col,hold){ if(SCN) return yb; col=col||'#ffe6a6';   // (INTROSTORY C2: no E prompt over a story scene)
  const U=L.U, fs=Math.round(14*U), gh=Math.round(20*U), h=Math.round(32*U); ctx.font='700 '+fs+'px system-ui';
  const m=String(label).split(/(?:[Pp]ress|[Hh]old)\s+E\s*/), has=m.length>1, pre=has?m[0].trim():''; let post=(has?m[1]:m[0]).trim();   // ('Hold E': a quick-equip — its bar fills as you hold, below)
  const minX=L.pc.x+L.pc.w+Math.round(12*U), maxW=CSSW-L.pd-minX, gw=has?glyphW('interact',gh):0, pw=pre?emoW(pre,fs)+Math.round(8*U):0, fix=pw+gw+(gw?Math.round(8*U):0)+Math.round(28*U);
  while(post.length>4 && fix+emoW(post,fs)>maxW) post=post.slice(0,-2)+'…';
  const qw=emoW(post,fs), w=Math.round(fix+qw);
  let cx=CSSW/2; if(cx-w/2<minX) cx=Math.min(minX+w/2, CSSW-L.pd-w/2);
  const x=Math.round(cx-w/2), y=Math.round(yb-h), ty=y+h/2+1; let tx=x+Math.round(14*U);
  pxPanel(x,y,w,h); ctx.textAlign='left'; ctx.textBaseline='middle';
  if(pre){ emoTxt(pre,tx,ty,col,fs,'pan'); tx+=pw; }   // (the prompt's own emoji — 🗝 💬 ⚓ — as the HUD's pixel icons)
  if(gw){ drawGlyph('interact',tx,ty-1,gh); tx+=gw+Math.round(8*U); }
  emoTxt(post,tx,ty,col,fs,'pan'); ctx.textBaseline='alphabetic';
  if(hold!=null){ const bw=w-Math.round(16*U), bh=Math.max(2,Math.round(3*U)); pxBar(x+Math.round(8*U), y+h-bh-Math.round(5*U), bw, bh, clamp(hold,0,1), '#7fe3a0','#d0ffe0','#2f8a55'); }   // (hold E: the quick-equip fills)
  return y-Math.round(6*U); }
/* (C9) THE HUD REVEAL — a new captain's first quiet moment ashore (after the landfall lesson, no foe roused, nothing else on the bottom stack) walks
   the eye round the crawl HUD once: life → the Tide → the flask → the skills → the chart. A gold frame pulses round each piece while a small plate
   says what it is (1.8 s each). Later, once: the buff row, the first time something rides on you. Saved in the lessons (TUT h / hbuff). */
const HUDR=[['life','LIFE','it doesn’t mend by itself — only drinking heals'],['tide','THE TIDE','your strikes raise it · your skills spend it'],
  ['flask','THE FLASK','kills refill it · #potion to drink'],['bar','YOUR SKILLS','#skill2 and the keys under each — as the Tide allows'],['map','THE CHART','the brass rose points the way on']];
let hudR={i:0, t:0, a:0, lay:null, bt:0};
function hudRevRect(k,L){ const U=L.U, u=v=>Math.round(v*U), P=L.pc, cx=P.x+u(58), rw=P.w-u(64), r3=P.y+u(43);
  if(k==='life') return {x:cx-u(3), y:P.y+u(4), w:rw, h:u(22)};
  if(k==='tide') return {x:cx-u(3), y:r3-u(10), w:rw, h:u(20)};
  if(k==='flask') return {x:cx-u(3), y:r3+u(10), w:rw, h:u(20)};
  if(k==='bar') return {x:L.bar.x-u(4), y:L.bar.y-u(4), w:L.bar.w+u(8), h:L.bar.s+u(26)};
  if(k==='map') return {x:L.mm.x-u(3), y:L.mm.y-u(3), w:L.mm.size+u(6), h:L.mm.size+u(6)};
  if(k==='buff'){ const s=u(24); return {x:P.x-u(3), y:P.y-s-u(11), w:Math.max(1,(Object.keys(BUFF).length+(elix?1:0)+(player.bcn?1:0)))*(s+u(4))+u(2), h:s+u(6)}; }
  return null; }
function hudRevTxt(t){ return t.replace(/#(\w+)/g,(m,r)=>'['+glyph(r)+']'); }
function hudReveal(L,busy){ if(!ISL || koBeat || caveFade || imapOpen) return; const dt=clamp(itime-(hudR.lt||itime),0,0.1); hudR.lt=itime;
  let step=null;
  if(!tutDone('h')){ const quiet=tutDone('land') && !busy && !islRoused && !bossBarOn() && !ISL.cave;
    if(quiet){ hudR.t+=dt; if(hudR.t>1.8){ hudR.t=0; hudR.i++; if(hudR.i>=HUDR.length){ tutMark('h'); hudR.i=0; } } if(!tutDone('h')) step=HUDR[hudR.i]; }
    else if(hudR.t>0.6){ hudR.t=0; } }                                                    // (interrupted: that piece starts over when it's quiet again)
  else if(!tutDone('hbuff') && (Object.keys(BUFF).length || elix) && !busy){ hudR.bt+=dt; step=['buff','BUFFS','what rides on you — and how long it lasts']; if(hudR.bt>3.2) tutMark('hbuff'); }
  hudR.a=step?Math.min(1,hudR.a+dt*5):Math.max(0,hudR.a-dt*4); if(step) hudR.s=step; if(hudR.a<=0 || !hudR.s) return;
  const S=hudR.s, R=hudRevRect(S[0],L); if(!R) return; const U=L.U, u=v=>Math.round(v*U), pl=0.5+0.5*Math.sin(itime*7);
  ctx.globalAlpha=hudR.a; hlFrame(R); const b=Math.max(2,u(2));   // the gold frame round the piece (INTROSTORY C3: hlFrame — the scenes' & the lessons' frame too)
  const line=hudRevTxt(S[2]), key='hr|'+S[0]+'|'+line+'|'+U+'|'+DPR; let P=hudR.lay;
  if(!P || P.key!==key){ const fs=u(11), tf='800 '+fs+'px system-ui', lf='700 '+fs+'px system-ui'; ctx.font=lf; const lw=ctx.measureText(line).width; ctx.font=tf; const w=Math.round(Math.max(lw,ctx.measureText(S[1]).width)+u(20)), h=u(40);
    P=hudR.lay={key, w, h, P:hudPlate(key,w,h,g=>{ pxPanel(0,0,w,h,PXP.gold,g); g.textBaseline='middle'; g.textAlign='left'; panTxt(S[1],u(10),u(13),'#ffd86b',tf,g); panTxt(line,u(10),u(28),'#fff3d6',lf,g); })}; }
  let x, y; if(S[0]==='map'){ x=R.x-P.w-u(10); y=R.y+u(10); } else if(S[0]==='bar'){ x=R.x+R.w+u(10); y=R.y+R.h-P.h-u(8); } else { x=L.pc.x; y=(S[0]==='buff'?R.y:L.pc.y)-P.h-u(10); }   // (the bar's plate beside it — the stack above it is the prompts')
  x=clamp(x,L.pd,CSSW-L.pd-P.w); ctx.drawImage(P.P.cv,x,y,P.w,P.h);
  if(S[0]!=='map' && S[0]!=='bar'){ ctx.fillStyle='rgba(255,210,63,.85)'; const lx=Math.min(R.x+u(16), x+P.w-u(8)); ctx.fillRect(lx, y+P.h, b, Math.max(0,R.y-(y+P.h))); }   // (a gold stem down to it)
  ctx.globalAlpha=1; }
/* THE LAYOUT — every movable crawl-HUD piece, in one place */
let hudBtnB=0; addEventListener('resize',()=>{ hudBtnB=0; });
function hudBtnBottom(){ if(!hudBtnB){ const e=document.getElementById('menuBtn'), r=e&&e.getBoundingClientRect(); hudBtnB=(r&&r.bottom>0&&r.bottom<140)?Math.ceil(r.bottom):42; } return hudBtnB; }   // the DOM ☰ / 🔊 buttons' bottom edge (measured once per resize)
function hudLay(){ const U=hudU(), b=hudB(), pd=Math.round(12*U), k=hudK();
  const S=Math.round(clamp(Math.min(CSSW*0.14, CSSH*0.22, 176*U)*(ITUNE.mmSize||1), 110, 320)), mx=CSSW-pd-S, my=Math.max(pd, hudBtnBottom()+Math.round(6*U));   // (under the ☰ & sound buttons)              // TOP-RIGHT: the local map…
  const R=Math.round(clamp(S*0.15,20,34)), comp={x:mx+Math.round(R*0.15), y:my+S-Math.round(R*0.15), R};                 // …the brass rose laid on its lower-left corner…
  const beside=S>=150*U, labH=Math.round(22*U);
  const lab=beside ? {x:comp.x+R+Math.round(5*U), y:my+S+Math.round(7*U), h:labH, r:CSSW-pd}                              // …its reading beside the rose (or, on a small map, under it)
                   : {x:mx-R, y:comp.y+R+Math.round(6*U), h:labH, r:CSSW-pd};
  const satY=Math.max(lab.y+labH, comp.y+R)+Math.round(6*U), satH=Math.round(24*U);
  const sat={r:CSSW-pd, y:satY, h:satH}, feed={x:CSSW-pd, y:satY+satH+Math.round(16*U)};                                   // …the satchel under it, the pickup feed under that
  const pcH=Math.round(80*U), pcW=Math.round(Math.min(320*U, CSSW*0.44)), pc={x:pd, y:CSSH-pd-pcH, w:pcW, h:pcH};       // BOTTOM-LEFT: you
  const top={y:Math.round(5*U), h:Math.round(28*U), maxW:Math.round(2*(Math.min(mx, comp.x-R)-Math.round(10*U)-CSSW/2))};  // TOP-CENTRE: the run strip (never under the map)
  const met=metersOn ? {x:pd, y:top.y+top.h+Math.round(12*U), w:Math.round(Math.min(340*U, CSSW*0.4)), h:Math.round((MET_ROWS*14+20)*U)} : null;   // the DEV meters plate (']') heads the left lane…
  const lane={x:pd, y:met?met.y+met.h+Math.round(8*U):top.y+top.h+Math.round(12*U), w:Math.round(Math.min(340*U, CSSW*0.3)), bot:pc.y-Math.round(10*U)};  // DOWN THE LEFT: first cards, then toasts (under the meters when they're up)
  const bS=Math.round(38*U), bG=Math.round(6*U), bSl=barSlots(), bW=bSl.length*bS+(bSl.length-1)*bG;                 // BOTTOM-CENTRE: THE SKILL BAR (§12) — only the slots that hold something (slot 1 always), key caps under them
  const bar={s:bS, g:bG, slots:bSl, w:bW, x:Math.round(Math.max(pc.x+pc.w+16*U, CSSW/2-bW/2)), y:CSSH-pd-bS-Math.round(14*U)};
  return {U, b, k, pd, mm:{x:mx, y:my, size:S}, sv:{x:mx, y:my, size:S}, comp, lab, sat, feed, pc, top, lane, met, bar,
    edge:{m:22, top:top.y+top.h+14, bot:18, av:[[comp.x-R-8, -40, CSSW-comp.x+R+48, satY+satH+8+40], [-40, pc.y-8, pc.x+pc.w+48, CSSH], [bar.x-8, bar.y-8, bar.x+bW+8, CSSH]]} };   // off-screen badges clamp inside this, and slide off the map, off you & off the bar
}
function wayWalk(t){ return t===W_GROUND||t===W_PATH||t===W_ICE; }
/* what's next? {x,y,key, ic,txt,col, cl? (a clearing: its whole floor seeds the path), line? (straight bearing), fight?} */
function wayTarget(cur){ if(!ISL) return null; const cv=ISL.cave;
  if(cur && !cur.secured && cur.id>0){ let b=null,bd=1e18,n=0;                    // a fight on: the nearest of what's left here
    for(const e of enemies){ if(e.dead||e.clear!==cur.id) continue; n++; const d=(e.x-player.x)**2+(e.y-player.y)**2; if(d<bd){ bd=d; b=e; } }
    return b ? {x:b.x, y:b.y, key:'foe', line:true, ic:'⚔', txt:n+' left', col:'#ff8a6a', fight:true} : {x:cur.x, y:cur.y, key:'foe', line:true, ic:'⚔', txt:'clear it', col:'#ff8a6a', fight:true}; }
  if(iflag && !iflag.done) return {x:iflag.x, y:iflag.y, key:'flag', line:true, ic:'⚑', txt:'the claim', col:'#ffd86b'};
  if(cv){ if(ISL.caveOpen){ const dc=ichests.find(c=>c.big&&!c.opened);
      if(dc) return {x:dc.x, y:dc.y, key:'dchest', ic:'🗝', txt:'the deep chest', col:'#ffd86b'};
      { const SN=ISL.sanct; if(SN && SN.open && !SN.claimed && !SN.spent && SN.k!=='leaf') return {x:SN.obj.x, y:SN.obj.y, key:'sanct', ic:'✦', txt:'the bottom’s find', col:'#ffe9a6'}; }   // (DEPTHS DE2)
      if(cv.f<cv.max && ISL.stairP) return {x:ISL.stairP.x, y:ISL.stairP.y, key:'stairs', ic:'▼', txt:'down to Floor '+(cv.f+1), col:'#c9b8ff'};
      if(ISL.ropeP) return {x:ISL.ropeP.x, y:ISL.ropeP.y, key:'rope', ic:'▲', txt:'the rope up', col:'#9fd0ff'}; } }
  else if(islandCleared) return {x:ISL.landing.x, y:ISL.landing.y, key:'boat', ic:'⚓', txt:'the boat', col:'#9fd0ff'};
  else { const hc=ISL.clearings[ISL.hoardId], hch=ichests.find(c=>c.big&&!c.opened);
    if(hc && hc.secured && hch) return {x:hch.x, y:hch.y, key:'hoard', ic:'🗝', txt:'crack the hoard', col:'#ffd86b'}; }
  const mains=ISL.clearings.filter(c=>c.kind!=='bonus'); let nx=null;                  // the trail: the first unwon main clearing whose gate stands open
  for(const c of mains){ if(c.kind==='landing'||c.secured) continue; if(ISL.gates[c.id-1].open){ nx=c; break; } if(!nx) nx=c; }
  if(!nx) return null; const hd=nx.kind==='hoard';
  return {x:nx.x, y:nx.y, key:'c'+nx.id, cl:nx, ic:hd?(cv?'▼':'☠'):'⚔', col:'#ffd86b',
    txt:hd?(cv?(cv.boss?'the lord’s chamber':'the last chamber'):'the hoard'):(cv?'chamber ':'clearing ')+mains.indexOf(nx)}; }
/* the path: a breadth-first flood from the target over walkable ground (shut gates block it) — cached until the target or the tiles change */
function wayField(T){ const key=T.key+':'+wayVer; if(ISL.way && ISL.way.key===key) return ISL.way;
  const W=ISL.W, H=ISL.H, tl=ISL.tiles, TS=ISL.TS, D=new Int32Array(W*H).fill(-1), q=new Int32Array(W*H); let h=0, n=0;
  const seed=i=>{ if(i>=0 && i<W*H && D[i]<0 && wayWalk(tl[i])){ D[i]=0; q[n++]=i; } };
  if(T.cl){ const c=T.cl, r=Math.ceil(c.r/TS)+1, cx=(c.x/TS)|0, cy=(c.y/TS)|0;             // a clearing: its whole floor is 'there'
    for(let y=Math.max(0,cy-r);y<=Math.min(H-1,cy+r);y++) for(let x=Math.max(0,cx-r);x<=Math.min(W-1,cx+r);x++) if(inClear(c,(x+0.5)*TS,(y+0.5)*TS)) seed(y*W+x); }
  const tx=(T.x/TS)|0, ty=(T.y/TS)|0; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) if(tx+dx>=0&&tx+dx<W) seed((ty+dy)*W+tx+dx);
  while(h<n){ const i=q[h++], x=i%W, d=D[i]+1;
    if(x>0 && D[i-1]<0 && wayWalk(tl[i-1])){ D[i-1]=d; q[n++]=i-1; } if(x<W-1 && D[i+1]<0 && wayWalk(tl[i+1])){ D[i+1]=d; q[n++]=i+1; }
    if(i>=W && D[i-W]<0 && wayWalk(tl[i-W])){ D[i-W]=d; q[n++]=i-W; } if(i<W*(H-1) && D[i+W]<0 && wayWalk(tl[i+W])){ D[i+W]=d; q[n++]=i+W; } }
  return ISL.way={key, D}; }
/* the needle: follow the flood downhill wayLook tiles and point there — round hedges, through the doorways · d = the path's length (world units) */
function wayAim(T){ const dl=Math.hypot(T.x-player.x,T.y-player.y), la={a:Math.atan2(T.y-player.y,T.x-player.x), d:dl, line:true};
  if(T.line) return la; const F=wayField(T), W=ISL.W, H=ISL.H, TS=ISL.TS, D=F.D;
  let i=((player.y/TS)|0)*W+((player.x/TS)|0);
  if(!(D[i]>=0)){ let b=-1, bd=1e9; for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){ const j=i+dy*W+dx; if(j>=0&&j<W*H&&D[j]>=0&&D[j]<bd){ bd=D[j]; b=j; } } if(b<0) return la; i=b; }   // (a gate edge / a pinch: the nearest charted step)
  if(D[i]===0) return {a:la.a, d:T.cl?0:dl};                             // you're there (or in the clearing)
  let c=i; const tx=T.x/TS, ty=T.y/TS, run=[];
  for(let k=0;k<Math.round(ITUNE.wayLook) && D[c]>0;k++){ const x=c%W, want=D[c]-1; let nb=-1, nd=1e18;
    for(const j of [c-1,c+1,c-W,c+W]){ if(j<0||j>=W*H||D[j]!==want) continue; if((j===c-1&&x===0)||(j===c+1&&x===W-1)) continue;
      const q=((j%W)+0.5-tx)**2+(((j/W)|0)+0.5-ty)**2; if(q<nd){ nd=q; nb=j; } }
    if(nb<0) break; c=nb; run.push(c); }
  let lx=player.x, ly=player.y;                                           // the farthest step along it you can walk to in a straight line — never a needle through a hedge's corner
  for(let k=run.length-1;k>=0;k--){ const x=(run[k]%W+0.5)*TS, y=(((run[k]/W)|0)+0.5)*TS; if(k===0 || wayClear(player.x,player.y,x,y)){ lx=x; ly=y; break; } }
  return {a:Math.atan2(ly-player.y, lx-player.x), d:D[i]*TS}; }
function wayClear(x0,y0,x1,y1){ const n=Math.ceil(Math.hypot(x1-x0,y1-y0)/5), r=player.r*0.8;   // a body-wide straight walk (not just a sightline)
  for(let i=1;i<=n;i++) if(!islFree(x0+(x1-x0)*i/n, y0+(y1-y0)*i/n, r)) return false; return true; }
/* the rim: what else is out there (straight bearings) — caches · the boss once seen · the way out · the cave · a known ✕ */
function wayTicks(T){ const out=[], add=(x,y,col,sh)=>out.push({a:Math.atan2(y-player.y,x-player.x), col, sh}), key=T?T.key:'';
  for(const ch of ichests){ if(ch.big||ch.opened) continue; const cl=ISL.clearings[ch.clear]; if(!cl) continue;
    if(islandCleared || ISL.gates[cl.id-1].open) add(ch.x,ch.y,'#c9b8ff','dia'); }                 // an unopened cache whose door is open (all of them, once she's claimed)
  const B=ISL.boss; if(B && !B.dead && (ISL.bannerT>=0 || B.met)) add(B.x,B.y,'#ff4d3d','tri');        // the boss, once you've seen it
  if(!ISL.cave){ if(key!=='boat') add(ISL.landing.x,ISL.landing.y,'#6fc8ff','dot'); if(ISL.mouthOn && ISL.mouthP) add(ISL.mouthP.x,ISL.mouthP.y,'#9f8cff','tri'); }
  else { if(ISL.caveOpen && key!=='rope' && ISL.ropeP) add(ISL.ropeP.x,ISL.ropeP.y,'#6fc8ff','dot'); if(key!=='stairs' && stairsOn()) add(ISL.stairP.x,ISL.stairP.y,'#9f8cff','tri'); }   // (C7a: stairs bared under a rock show on the rim too)
  if(iburied && !iburied.dug && (ISL.claimMarks || ivisit[((iburied.y/ISL.TS)|0)*ISL.W+((iburied.x/ISL.TS)|0)] || lodeSee(iburied.x,iburied.y))) add(iburied.x,iburied.y,'#e0693f','x');
  return out; }
function wayMetres(d){ return Math.max(0,Math.round(d/10)); }             // 10 world units = a metre (a tile is 2 m; the view is 20 m tall)
/* the brass rose (the sea compass's little brother) */
function compassPlate(R,top){ const S=2*R+14, o=S/2;   // the rose's brass bezel & face (baked once per size) — or, top, its glass
  return hudPlate('rose|'+R+'|'+(top?1:0)+'|'+DPR, S, S, g=>{ g.textAlign='center'; g.textBaseline='middle';
    if(top){ const gs=g.createRadialGradient(o-R*0.35,o-R*0.45,2, o-R*0.2,o-R*0.2,R*1.1); gs.addColorStop(0,'rgba(255,255,255,.22)'); gs.addColorStop(0.42,'rgba(255,255,255,.03)'); gs.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=gs; g.beginPath(); g.arc(o,o,R-2.5,0,TAU); g.fill(); return; }
    const gb=g.createRadialGradient(o-R*0.4,o-R*0.4,R*0.2, o,o,R*1.08); gb.addColorStop(0,'#cba84e'); gb.addColorStop(0.55,'#9c7a34'); gb.addColorStop(0.82,'#6e5424'); gb.addColorStop(1,'#3a2c14');
    g.fillStyle='rgba(0,0,0,.35)'; g.beginPath(); g.arc(o+1.5,o+2.5,R+4,0,TAU); g.fill();          // (a drop shadow onto the map)
    g.fillStyle=gb; g.beginPath(); g.arc(o,o,R+4,0,TAU); g.fill();
    g.strokeStyle='rgba(40,28,12,.75)'; g.lineWidth=1.6; g.beginPath(); g.arc(o,o,R,0,TAU); g.stroke();
    const gf=g.createRadialGradient(o,o-R*0.25,R*0.2, o,o,R); gf.addColorStop(0,'#1d3454'); gf.addColorStop(1,'#0c1830'); g.fillStyle=gf; g.beginPath(); g.arc(o,o,R-2.5,0,TAU); g.fill();
    for(let i=0;i<16;i++){ const a=i/16*TAU, maj=i%4===0, r0=R-3.5, r1=R-(maj?8:5.5);
      g.strokeStyle=maj?'rgba(255,228,160,.6)':'rgba(170,195,230,.25)'; g.lineWidth=maj?1.3:0.8; g.beginPath(); g.moveTo(o+Math.cos(a)*r0,o+Math.sin(a)*r0); g.lineTo(o+Math.cos(a)*r1,o+Math.sin(a)*r1); g.stroke(); }
    g.font='800 '+Math.round(R*0.3)+'px Georgia,serif'; g.fillStyle='#ffd27a'; g.fillText('N', o, o-R+R*0.36); }); }   // the chart is north-up
function drawCrawlCompass(L,T,A){ const cx=L.comp.x, cy=L.comp.y, R=L.comp.R;
  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
  { const P=compassPlate(R,false); ctx.imageSmoothingEnabled=true; ctx.drawImage(P.cv,cx-P.w/2,cy-P.h/2,P.w,P.h); }
  if(T) for(const k of wayTicks(T)){ const rx=cx+Math.cos(k.a)*(R+1), ry=cy+Math.sin(k.a)*(R+1), s=Math.max(3.2,R*0.15);   // rim ticks, riding the brass
    ctx.save(); ctx.translate(rx,ry); ctx.rotate(k.a); ctx.fillStyle=k.col; ctx.strokeStyle='rgba(12,8,4,.85)'; ctx.lineWidth=1.2; ctx.beginPath();
    if(k.sh==='tri'){ ctx.moveTo(-s*0.9,-s); ctx.lineTo(s,0); ctx.lineTo(-s*0.9,s); }
    else if(k.sh==='dia'){ ctx.moveTo(-s,0); ctx.lineTo(0,-s); ctx.lineTo(s,0); ctx.lineTo(0,s); }
    else if(k.sh==='x'){ ctx.rotate(-k.a); ctx.moveTo(-s,-s); ctx.lineTo(s,s); ctx.moveTo(s,-s); ctx.lineTo(-s,s); ctx.strokeStyle=k.col; ctx.lineWidth=2.2; ctx.stroke(); ctx.restore(); continue; }
    else ctx.arc(0,0,s*0.85,0,TAU);
    ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
  if(T){ const a=A, len=R-6, l=a+Math.PI/2, w=Math.max(3.5,R*0.17), col=T.col;          // the needle: gold down the path (red toward a foe)
    ctx.fillStyle='rgba(20,12,4,.55)'; ctx.beginPath(); ctx.moveTo(cx-Math.cos(a)*len*0.55,cy-Math.sin(a)*len*0.55); ctx.lineTo(cx+Math.cos(l)*w*0.8,cy+Math.sin(l)*w*0.8); ctx.lineTo(cx-Math.cos(l)*w*0.8,cy-Math.sin(l)*w*0.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle=col; ctx.strokeStyle='#5a3a12'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(cx+Math.cos(a)*len,cy+Math.sin(a)*len); ctx.lineTo(cx+Math.cos(l)*w,cy+Math.sin(l)*w); ctx.lineTo(cx-Math.cos(a)*w,cy-Math.sin(a)*w); ctx.lineTo(cx-Math.cos(l)*w,cy-Math.sin(l)*w); ctx.closePath(); ctx.fill(); ctx.stroke();
    if(wayPulse>0){ ctx.strokeStyle='rgba(255,216,107,'+(0.5*Math.min(1,wayPulse)*(0.5+0.5*Math.sin(itime*9))).toFixed(3)+')'; ctx.lineWidth=2.5; ctx.beginPath(); ctx.arc(cx,cy,R+6,0,TAU); ctx.stroke(); } }   // it just swung: a gold halo
  ctx.fillStyle='#3a2c14'; ctx.beginPath(); ctx.arc(cx,cy,3.4,0,TAU); ctx.fill(); ctx.fillStyle='#cba84e'; ctx.beginPath(); ctx.arc(cx,cy,2,0,TAU); ctx.fill();
  { const P=compassPlate(R,true); ctx.drawImage(P.cv,cx-P.w/2,cy-P.h/2,P.w,P.h); }
  ctx.restore(); ctx.textAlign='left'; ctx.textBaseline='alphabetic'; }
/* its reading: what & how far (a pill beside the rose) */
function drawWayLabel(L,T,d){ if(!T) return; const U=L.U, m=wayMetres(d), tail=T.fight?'':(m>0?' · '+m+' m':' · here'); let head=T.ic+' '+T.txt;   // its reading: a brass plate beside the rose
  ctx.font='700 '+Math.round(12*U)+'px system-ui'; const maxW=L.lab.r-L.lab.x, pdx=Math.round(9*U);
  while(head.length>4 && ctx.measureText(head+tail).width+2*pdx>maxW) head=head.slice(0,-2)+'…';   // (the name gives way — never the distance)
  const txt=head+tail;
  const w=Math.round(Math.min(ctx.measureText(txt).width+2*pdx, maxW)), x=Math.round(L.lab.r-w), y=L.lab.y, h=L.lab.h;
  pxPanel(x,y,w,h,T.fight?PXP.red:PXP.brass); ctx.textAlign='left'; ctx.textBaseline='middle';
  emoTxt(txt,x+pdx,y+h/2+1,T.fight?'#ffb09a':'#ffe6a6',Math.round(12*U),'pan'); ctx.textBaseline='alphabetic'; }
function wayPin(ox,oy,sc,k,T){ if(!T || T.fight || !ISL) return; let x=T.x, y=T.y; const TS=ISL.TS, vis=(a,b)=>ivisit && ivisit[((b/TS)|0)*ISL.W+((a/TS)|0)];   // the compass's target on a chart: a gold ring (a '?' where you've never been)
  if(T.cl && T.cl.gx!==undefined && !vis(T.cl.x,T.cl.y)){ x=T.cl.gx; y=T.cl.gy; }                  // (an unseen clearing: pin its doorway — that's where the trail goes)
  const px=ox+x/TS*sc, py=oy+y/TS*sc, pl=1+0.25*Math.sin(itime*5);
  ctx.strokeStyle='rgba(26,14,4,.85)'; ctx.lineWidth=3.2*k; ctx.beginPath(); ctx.arc(px,py,4.6*k*pl,0,TAU); ctx.stroke();
  ctx.strokeStyle=T.col; ctx.lineWidth=1.7*k; ctx.stroke();
  if(!vis(x,y)){ ctx.font='800 '+Math.round(8*k)+'px system-ui'; ctx.textAlign='center'; ctx.fillStyle='#6a4212'; ctx.fillText('?',px,py+3*k); ctx.textAlign='left'; } }
function iScr(x,y){ const s=islScale(); return [izX((x-icamX)*s+IW/2), izY((y-icamY)*s+IH/2)]; }   // world → screen (CSS px) — through the claim's push-in
function edgeClamp(px,py,tx,ty,E){ const dx=tx-px, dy=ty-py; let k=1e9;             // from you toward (tx,ty), stopped at the screen's inset rectangle
  if(dx>0) k=Math.min(k,(CSSW-E.m-px)/dx); else if(dx<0) k=Math.min(k,(E.m-px)/dx);
  if(dy>0) k=Math.min(k,(CSSH-E.bot-py)/dy); else if(dy<0) k=Math.min(k,(E.top-py)/dy);
  k=clamp(k,0,1); let x=px+dx*k, y=py+dy*k;
  if(E.av) for(const r of E.av){ if(x>r[0] && x<r[0]+r[2] && y>r[1] && y<r[1]+r[3]){ let best=1e9, nx=x, ny=y;   // (it slides off the local map & off you — out through whichever of the panel's sides faces the screen)
      if(r[0]>0 && x-r[0]<best){ best=x-r[0]; nx=r[0]-2; ny=y; } if(r[0]+r[2]<CSSW && r[0]+r[2]-x<best){ best=r[0]+r[2]-x; nx=r[0]+r[2]+2; ny=y; }
      if(r[1]>0 && y-r[1]<best){ best=y-r[1]; nx=x; ny=r[1]-2; } if(r[1]+r[3]<CSSH && r[1]+r[3]-y<best){ best=r[1]+r[3]-y; nx=x; ny=r[1]+r[3]+2; }
      x=nx; y=ny; } }
  return [x,y]; }
function chevron(x,y,a,sz,col,al){ ctx.save(); ctx.translate(x,y); ctx.rotate(a); ctx.globalAlpha=al;   // an arrowhead pointing along a
  ctx.fillStyle=col; ctx.strokeStyle='rgba(16,6,4,.9)'; ctx.lineWidth=2; ctx.lineJoin='round';
  ctx.beginPath(); ctx.moveTo(sz,0); ctx.lineTo(-sz*0.7,-sz*0.8); ctx.lineTo(-sz*0.3,0); ctx.lineTo(-sz*0.7,sz*0.8); ctx.closePath(); ctx.stroke(); ctx.fill();
  ctx.restore(); }
function edgeBadge(x,y,a,R,col,txt,al,pu){ const cx=x-Math.cos(a)*(R+6), cy=y-Math.sin(a)*(R+6), l=a+Math.PI/2;   // an edge marker: its tip ON the screen's edge toward the thing, a dark disc & a coloured ring, a glyph inside
  ctx.save(); ctx.globalAlpha=clamp(al,0,1); ctx.lineJoin='round';
  ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(cx+Math.cos(a)*R*0.45+Math.cos(l)*R*0.72, cy+Math.sin(a)*R*0.45+Math.sin(l)*R*0.72); ctx.lineTo(cx+Math.cos(a)*R*0.45-Math.cos(l)*R*0.72, cy+Math.sin(a)*R*0.45-Math.sin(l)*R*0.72); ctx.closePath();
  ctx.fillStyle=col; ctx.strokeStyle='rgba(10,6,4,.9)'; ctx.lineWidth=2; ctx.stroke(); ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy,R,0,TAU); ctx.fillStyle='rgba(12,10,20,.84)'; ctx.fill(); ctx.lineWidth=2+(pu||0)*1.6; ctx.strokeStyle=col; ctx.stroke();
  if(txt){ ctx.fillStyle=col; ctx.font='900 '+Math.round(txt.length>2?R*0.66:R*1.2)+'px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(txt,cx,cy+1); }
  ctx.restore(); }
/* the way pointer at your boots: bright for a breath after a secure (the way on just opened), a whisper after — never mid-fight */
function drawWayPointer(T,A){ if(!T || T.fight || koBeat) return; const base=ITUNE.wayChevA, sh=Math.min(1,wayPulse/0.6);
  const al=Math.max(base, sh*(0.7+0.3*Math.sin(itime*8))); if(al<=0.02) return;
  const [px,py]=iScr(player.x,player.y), r=player.r*islScale()*IKY*1.9+14;
  chevron(px+Math.cos(A)*r, py+Math.sin(A)*r, A, 8+4*sh, T.col, clamp(al,0,1)); }
/* the last few in a big clearing: edge arrows to the ones you can't see (with how far) */
function drawStragglers(cur,L){ if(!cur || cur.secured || cur.id<=0 || koBeat || !(cur.enemyCount>0) || cur.enemyCount>ITUNE.wayStrag) return;
  const [px,py]=iScr(player.x,player.y);
  for(const e of enemies){ if(e.dead || e.clear!==cur.id || islOnScr(e.x,e.y,-6) || (ITUNE.threatOn>0 && (THREAT_ST[e.st] || e.cast>0))) continue;   // (one winding up wears the threat badge instead)
    const [tx,ty]=iScr(e.x,e.y), [x,y]=edgeClamp(px,py,tx,ty,L.edge), a=Math.atan2(ty-py,tx-px);
    edgeBadge(x,y,a,14,'#ffe9a6',wayMetres(Math.hypot(e.x-player.x,e.y-player.y))+'m',0.8+0.2*Math.sin(itime*4),0); } }
/* OFF-SCREEN THREATS: foes winding up / charging / casting beyond the frame, and spit that will land on you — chevrons on the edge, coloured by what's coming */
const THREAT_ST={charge:'hit', pounce:'hit', lunge:'hit', dive:'hit', windup:'tell', crouch:'tell', wind:'tell', paw:'tell', rumble:'burst', swell:'burst', stomp:'burst'};
function drawThreatMarks(curId,L){ if(!ISL || !(ITUNE.threatOn>0) || koBeat) return; const [px,py]=iScr(player.x,player.y), E=L.edge;
  for(const en of enemies){ if(en.dead || islOnScr(en.x,en.y,-4)) continue; if(!enAct(en,curId)) continue;
    let k=THREAT_ST[en.st]; if(!k && en.cast>0) k='cast'; if(!k) continue;
    const d=Math.hypot(en.x-player.x,en.y-player.y); if(d>ITUNE.threatReach) continue;
    const [tx,ty]=iScr(en.x,en.y), [x,y]=edgeClamp(px,py,tx,ty,E), a=Math.atan2(ty-py,tx-px);
    const col=k==='hit'?'#ff3b30':k==='burst'?'#ff7a2e':k==='cast'?'#c58cff':'#ffb43a', R=(en.guard?16:en.elite||en.rar?13.5:11.5)*(k==='hit'?1.12:1);
    const near=1-clamp((d-180)/Math.max(60,ITUNE.threatReach-180),0,1), pu=0.5+0.5*Math.sin(itime*(k==='hit'?16:9));
    edgeBadge(x,y,a,R,col,k==='cast'?'✦':k==='hit'?'!!':'!',0.62+0.38*near,pu); }   // the game's own tell: '!' winding up · '!!' coming NOW · ✦ casting
  for(const pr of iproj){ if(pr.k!=='spit' || islOnScr(pr.x,pr.y,-2)) continue;         // spit inbound: it must be heading at you, and soon
    const rx=player.x-pr.x, ry=player.y-pr.y, v=Math.hypot(pr.vx,pr.vy)||1, along=(rx*pr.vx+ry*pr.vy)/v; if(along<=0 || along/v>ITUNE.threatSpit) continue;
    const miss=Math.abs(rx*pr.vy-ry*pr.vx)/v; if(miss>player.r+22) continue;
    const [tx,ty]=iScr(pr.x,pr.y), [x,y]=edgeClamp(px,py,tx,ty,E), a=Math.atan2(ty-py,tx-px);
    edgeBadge(x,y,a,pr.big?9:7.5,pr.pearl?'#ffe2b0':'#a6e22e','•',0.95,0.5+0.5*Math.sin(itime*14)); } }
/* THE PICKUP FEED — what you just scooped (same kind merges while it keeps coming), with its worth; one quiet line when the satchel fills */
function feedPick(k,n,txt,col,ic){ if(PLOG) plogEv(PLE.loot,k,txt,n); const last=pfeed[pfeed.length-1];
  if(last && last.k===k && k!=='item' && k!=='note' && k!=='swap' && last.t<0.9){ last.n+=n; last.t=0; last.pop=0.18; return; }
  pfeed.push({k, n, t:0, txt:txt||'', col:col||'#ffe9a6', pop:0.18, ic}); if(pfeed.length>5) pfeed.shift(); }
function drawPickupFeed(L){ if(!pfeed.length) return; const life=ITUNE.feedLife, U=L.U, k=L.k, lh=Math.round(20*U);   // under the satchel, newest on top — pixel icons, not emoji
  const maxN=Math.max(1,Math.min(5,Math.floor((CSSH*0.6-L.feed.y)/lh)));   // (never down into the arena's lower half)
  const shown=pfeed.slice(-maxN).reverse(); ctx.save(); ctx.textAlign='left'; ctx.textBaseline='middle';
  shown.forEach((f,i)=>{ const a=clamp(Math.min(f.t/0.12,(life-f.t)/0.6),0,1); if(a<=0) return; const y=L.feed.y+i*lh;
    let segs;                                                            // [text] or ['@icon']
    if(f.k==='gold') segs=['+'+f.n+' ','@coin'];
    else if(MATS[f.k]) segs=['+'+f.n+' ','@'+matPx(f.k),' '+MATS[f.k].n.toLowerCase()+'  ·  '+(f.n*price(MATS[f.k].v))+'g'+(MATS[f.k].f==='find'&&findNew(f.k)?'  ✦ NEW':'')];   // (C7c: a find the museum lacks)   // (a material: its own recoloured icon & name)
    else if(f.k==='potion') segs=['+'+f.n+' ','@flask',' draught'];
    else if(f.k==='item') segs=['@'+(f.ic||'bag'),' '+f.txt];                        // (C4b) a find: its slot's icon & its name in its tier's colour
    else segs=[f.txt];
    const sc=1+Math.max(0,f.pop)*1.2; ctx.font='700 '+Math.round(13*U*sc)+'px system-ui'; ctx.globalAlpha=a;
    const ws=segs.map(s=>s[0]==='@'?pxiW(s.slice(1),k):ctx.measureText(s).width); let x=L.feed.x-ws.reduce((p,q)=>p+q,0);
    segs.forEach((s,j)=>{ if(s[0]==='@') pxIcon(s.slice(1),x,y,k); else hudTxt(s,x,y+1,f.col); x+=ws[j]; }); });
  ctx.restore(); ctx.globalAlpha=1; ctx.textAlign='left'; ctx.textBaseline='alphabetic'; }
/* LEVEL UP — a banner over your head (the ring & pillar are drawn in the world) */
function drawLevelBanner(){ const B=lvlBan; if(!B) return; const life=2.6, t=B.t; if(t>life) return;
  const a=clamp(Math.min(t/0.12,(life-t)/0.6),0,1), pop=1+0.35*(1-clamp(t/0.22,0,1)), [px,py0]=iScr(player.x,player.y), py=Math.max(118,py0-player.r*islScale()*IKY-56-Math.min(t,0.5)*16);
  ctx.save(); ctx.globalAlpha=a; ctx.textAlign='center'; ctx.lineJoin='round'; const LS='letterSpacing' in ctx;
  const fs=Math.round(clamp(CSSW/42,20,30)*pop); ctx.font='800 '+fs+'px Georgia,serif'; if(LS) ctx.letterSpacing='3px';
  const g=ctx.createLinearGradient(0,py-fs,0,py); g.addColorStop(0,'#fff6c8'); g.addColorStop(1,'#ffc23a');
  ctx.strokeStyle='rgba(40,20,2,.9)'; ctx.lineWidth=6; ctx.strokeText('LEVEL '+B.lv, px, py); ctx.fillStyle=g; ctx.fillText('LEVEL '+B.lv, px, py);
  if(LS) ctx.letterSpacing='0px'; ctx.font='700 12px system-ui'; ctx.lineWidth=3.5;
  const tp=treePts(), sub='+'+B.add+' max HP  ·  ✦ '+tp+' passive point'+(tp===1?'':'s')+'  —  '+keyGlyph('menu','Esc')+' → ✦ Tree';
  ctx.strokeStyle='rgba(6,10,20,.9)'; ctx.strokeText(sub, px, py+18); ctx.fillStyle='#bff5d4'; ctx.fillText(sub, px, py+18);
  ctx.restore(); ctx.textAlign='left'; }
/* THE RUN STRIP — top-centre, one thin line: [▼floor ·] ⚔danger · won/fights · the trail's pips (caches as diamonds) · this clearing's foes */
function drawRunStrip(L,cur){ const U=L.U, mains=ISL.clearings.filter(c=>c.kind!=='bonus'), bons=ISL.clearings.filter(c=>c.kind==='bonus');
  const h=L.top.h, y=L.top.y, cy=Math.round(y+h/2), fs=Math.round(13*U), font='800 '+fs+'px system-ui'; ctx.font=font;
  const segL=[]; if(ISL.cave) segL.push(['▼'+ISL.cave.f,'#c9b8ff']); if(ISL_LVL>0) segL.push(['⚔'+ISL_LVL, verdictOf(ISL_LVL).col]); segL.push([securedCount+'/'+ISL.fightN, '#e6eeff']);   // (⚔ = the ISLE's danger, coloured by how it sits against you — 'Lv' is only ever you)
  let segR=[];
  if(cur && !cur.secured && cur.id>0){ let nR=0,nF=0; for(const e of enemies){ if(e.clear!==cur.id||e.dead) continue; if(e.fodder) nF++; else nR++; }   // the dangerous few vs the swarm — and how deep you've come
    if(cur.pack) segR.push(['ELITE PACK','#ff8a6a','skull']); if((cur.dl||0)>ISL_LVL) segR.push(['⚔'+cur.dl+' deeper','#ffce54']);
    segR.push([nR+' foes','#ffb07a']); if(nF) segR.push([nF+' swarm','#9fb0cc']); }
  { const pv=Math.floor(((cur&&!cur.secured&&cur.id>0)?(cur.purse||0):0)+(ISL.purseP||0)); if(pv>0) segR.push([''+pv,'#ffd86b','coin']); }   // §12 THE PURSE (🪙 N): this clearing's kill coin (+ a trail pack's, waiting) — it bursts from the gate when you win it
  const gapW=ctx.measureText(' · ').width, iw=q=>q[2]?pxiW(q[2],L.k)+(q[0]?Math.round(4*U):0):0, wsum=a=>a.reduce((s,q,i)=>s+ctx.measureText(q[0]).width+iw(q)+(i?gapW:0),0), sep=Math.round(10*U), pdx=Math.round(10*U);
  const n=mains.length+bons.length; let stepM=Math.round((n>12?15:19)*U), stepB=Math.round((n>12?12:15)*U), pr=Math.round((n>12?5:6.5)*U);
  const pw=()=>mains.length*stepM+(bons.length?bons.length*stepB+Math.round(6*U):0);
  let wl=wsum(segL), wr=wsum(segR), w=wl+pw()+(segR.length?sep+wr:0)+sep+2*pdx; const maxW=Math.max(220,L.top.maxW);
  if(w>maxW && segR.length){ segR=segR.map(q=>[q[0].replace(' foes','').replace(' swarm','◦').replace('ELITE PACK','').replace(' deeper',''),q[1],q[2]]); wr=wsum(segR); w=wl+pw()+sep+wr+sep+2*pdx; }   // tighter words…
  if(w>maxW){ const q=clamp((maxW-(w-pw()))/Math.max(1,pw()),0.45,1); stepM=Math.max(7,Math.round(stepM*q)); stepB=Math.max(6,Math.round(stepB*q)); pr=Math.max(2,Math.round(pr*q)); w=wl+pw()+(segR.length?sep+wr:0)+sep+2*pdx; }   // …then tighter pips
  w=Math.round(w); const x=Math.round(CSSW/2-w/2); pxPanel(x,y,w,h, ISL.cave?PXP.cave:PXP.brass);
  ctx.textAlign='left'; ctx.textBaseline='middle'; let tx=x+pdx;
  const seg=a=>a.forEach((q,i)=>{ if(i){ panTxt(' · ',tx,cy+1,'#6f82a8',font); tx+=gapW; } if(q[2]){ pxIcon(q[2],tx,cy,L.k); tx+=iw(q); } if(q[0]){ panTxt(q[0],tx,cy+1,q[1],font); tx+=ctx.measureText(q[0]).width; } });
  seg(segL); tx+=sep;
  let nxtId=-1; for(const c of mains) if(c.kind!=='landing' && !c.secured && ISL.gates[c.id-1].open){ nxtId=c.id; break; }   // the next clearing on the trail (the compass's target) — its pip pulses
  const lf='800 '+Math.max(7,Math.round(pr*1.35))+'px system-ui', dr=Math.max(2,Math.round(pr*0.85)), bxo=mains.length*stepM+Math.round(6*U), mg=4, pX=i=>Math.round(tx+i*stepM+stepM/2), bX=b=>Math.round(tx+bxo+b*stepB+stepB/2);
  for(let i=0;i<mains.length;i++){ const cl=mains[i]; if(cl.id===nxtId && cur!==cl){ const px=pX(i); ctx.fillStyle='rgba(255,216,107,'+(0.45+0.45*Math.sin(itime*5)).toFixed(3)+')'; ctx.fillRect(px-pr-3,cy-pr-3,2*pr+6,2*pr+6); } }   // (live, under the pips: the next one's pulse…)
  for(let b=0;b<bons.length;b++){ const cl=bons[b]; if(!cl.secured && cur!==cl && ISL.gates[cl.id-1].open){ ctx.globalAlpha=0.5+0.35*Math.sin(itime*4); pxDia(bX(b),cy,dr+2,'#d6c8ff'); ctx.globalAlpha=1; } }   // (…& a cache whose gate stands open — go get it)
  const st=[]; for(const cl of mains) st.push(cl.kind[0]+(cl.secured?1:0)+(cur===cl?'c':'')+(cl.pack?'p':'')); for(const cl of bons) st.push((cl.secured?1:0)+(cur===cl?'c':''));
  const P=hudPlate('pips|'+st.join(',')+'|n'+nxtId+'|'+stepM+','+stepB+','+pr+','+h+','+U+','+DPR, Math.ceil(pw())+2*mg, h, g=>{   // THE PIPS — baked: they change only when a clearing is won or entered
    const c0=Math.round(h/2), lx=i=>mg+Math.round(i*stepM+stepM/2);
    for(let i=0;i<mains.length;i++){ const cl=mains[i], px=lx(i); let col,lab='';
      if(cl.kind==='landing'){ col='#7fa6dd'; }
      else if(cl.kind==='hoard'){ col=cl.secured?'#e7b416':(cur===cl?'#ffce54':'#6b5a2e'); lab=(cl.secured||cur!==cl)?'★':''; }
      else if(cl.secured){ col='#3ddc84'; lab='✓'; }
      else if(cur===cl){ col='#ffce54'; } else col='#46526e';
      if(i<mains.length-1){ g.fillStyle=cl.secured?'#2fae68':'#2a3450'; g.fillRect(px+pr, c0-Math.max(1,Math.round(U)), stepM-2*pr, Math.max(2,Math.round(2*U))); }   // the trail between them
      if(!cl.secured && (cl.pack || cl.kind==='hoard') && !(cl.id===nxtId && cur!==cl)){ g.fillStyle=cl.kind==='hoard'?'#ff5438':'#ff9a7a'; g.fillRect(px-pr-2,c0-pr-2,2*pr+4,2*pr+4); }   // the elite pack & the boss room, ringed red
      g.fillStyle='#04070e'; g.fillRect(px-pr,c0-pr-1,2*pr,2*pr+2); g.fillRect(px-pr-1,c0-pr,2*pr+2,2*pr);   // a pixel-rounded pip
      g.fillStyle=col; g.fillRect(px-pr,c0-pr,2*pr,2*pr); g.fillStyle='rgba(255,255,255,.28)'; g.fillRect(px-pr,c0-pr,2*pr,Math.max(1,Math.round(pr/3)));
      if(lab && pr>=4){ g.fillStyle='#0c1830'; g.font=lf; g.textAlign='center'; g.textBaseline='middle'; g.fillText(lab,px,c0+1); } }
    for(let b=0;b<bons.length;b++){ const cl=bons[b]; pxDia(mg+Math.round(bxo+b*stepB+stepB/2),c0,dr, cl.secured?'#e7b416':(cur===cl?'#ffce54':'#56507e'), '#04070e', g); } });
  ctx.drawImage(P.cv, Math.round(tx)-mg, y, P.w, P.h);
  if(pr>=4 && cur && !cur.secured){ ctx.font=lf; ctx.textAlign='center'; ctx.fillStyle='#0c1830';   // live: this clearing's count (it drops with every kill)
    const mi=mains.indexOf(cur), bi=bons.indexOf(cur); if(mi>=0) ctx.fillText(''+cur.enemyCount,pX(mi),cy+1); else if(bi>=0 && dr>=4) ctx.fillText(''+cur.enemyCount,bX(bi),cy+1); ctx.textAlign='left'; }
  tx+=pw()+sep; seg(segR); ctx.textBaseline='alphabetic'; }
/* THE LOCAL MAP — top-right, centred on you, a fixed scale (ITUNE.mmTiles across): walls & clearings you've walked, foes as dots, chests, gates, the cave's stairs, the boat, where the compass points. M opens the whole isle. */
function mmPal(){ if(ISL._mmp) return ISL._mmp; const p=ISL.pal, cv=!!ISL.cave, M=mixHex, nv=cv?'#0c0a1a':'#0c1830';
  const fl=(p.grass&&p.grass[0])||'#5a9a4a', wl=(p.canopy&&(p.canopy[1]||p.canopy[0]))||'#2c5a2a', un=p.under||'#1d3a1b', pa=(p.path&&p.path[1])||'#9a8557';
  return ISL._mmp={g:M(fl,nv,0.22), p:M(pa,nv,0.12), we:M(wl,'#e8f0d8',cv?0.1:0.06), wi:M(un,nv,0.4), gate:'#b0662a', water:cv?'#2e5676':'#2f75aa', ice:'#c4e6f4', tg:M(M(fl,nv,0.22),'#06100a',0.32), ash:'#4a4642', sh:M(M(fl,nv,0.22),cv?'#2e5676':'#2f75aa',0.45), ld:M(M(fl,nv,0.22),'#ffffff',0.22), fg:M(pa,'#f4e8c8',0.35)}; }   // (PT1 K9a tg: tall grass — the ground a shade deeper · burnt grass · K9b sh: the shallows — half the ground, half the water)
function mmPaint(tx,ty,t){ let c=ISL._mm; if(!c){ c=ISL._mm=document.createElement('canvas'); c.width=ISL.W; c.height=ISL.H; ISL._mmg=c.getContext('2d'); }   // (paintChart's twin, in the HUD's own colours — rides on the isle, so a cave's floor & the surface each keep theirs)
  if(t===W_CRACK) t=W_WALL;                                                                                                 // (C8b: a cracked wall paints as wall)
  const P=mmPal(), W=ISL.W, tl=ISL.tiles, i=ty*W+tx, wk=v=>v===W_GROUND||v===W_PATH||v===W_ICE;
  ISL._mmg.fillStyle = t===W_WALL ? (((tx>0&&wk(tl[i-1]))||(tx<W-1&&wk(tl[i+1]))||(ty>0&&wk(tl[i-W]))||(ty<ISL.H-1&&wk(tl[i+W])))?P.we:P.wi) : t===W_PATH?P.p : t===W_GATE?P.gate : t===W_WATER?P.water : t===W_ICE?P.ice : t===W_LAVA?'#e0501a' : t===W_PROP?'#8a7a60' : t===W_CHASM?'#141018' : t===W_CLIFF?'#6a5e50' : (ISL.bog&&ISL.bog[i])?((ISL.fet&&ISL.fet[i])?'#5a7a1a':'#3a4a2a') : (t===W_GROUND&&ISL.gnd&&ISL.gnd[i]===G_LEDGE)?P.ld : (t===W_GROUND&&ISL.gnd&&ISL.gnd[i]===G_FLAG)?P.fg : (t===W_GROUND&&ISL.gnd&&ISL.gnd[i]===G_SHAL)?P.sh : (t===W_GROUND&&ISL.gnd&&ISL.gnd[i]===G_GRASS)?P.tg : (t===W_GROUND&&ISL.gnd&&ISL.gnd[i]===G_ASH)?P.ash : P.g;   // (PT1 K9a: tall grass · ash)   // (a wall that meets the ground is the rim — it outlines every clearing)
  ISL._mmg.fillRect(tx,ty,1,1); }
const MMQ=['###','..#','.#.','...','.#.'];
function mmQ(x,y){ x=Math.round(x); y=Math.round(y); const k=2; ctx.fillStyle='#04070e'; ctx.fillRect(x-2*k,y-3*k,5*k,7*k); ctx.fillStyle=Math.sin(itime*3)>-0.6?'#e8c070':'#b08a48';   // (C8b) a pixel '?' (2-px texels) on the local map — a secret room's smudge
  for(let r=0;r<5;r++) for(let c=0;c<3;c++) if(MMQ[r][c]==='#') ctx.fillRect(x+(c-1)*k-1,y+(r-2)*k-1,k,k); }
function mmTri(x,y,r,up,col){ const key='t'+r+'|'+(up?1:0)+'|'+col; let c=DIAC.get(key);   // a pixel ▲ / ▼ (baked once)
  if(!c){ const n=2*r+5; c=document.createElement('canvas'); c.width=n; c.height=n; const q=c.getContext('2d'), o=r+2;
    q.fillStyle='#04070e'; for(let d=0;d<=r+1;d++){ const hw=Math.round(d*0.8)+1, yy=up?o-r+d:o+r-d; q.fillRect(o-hw,yy-1,hw*2+1,2); }
    q.fillStyle=col; for(let d=0;d<=r;d++){ const hw=Math.round(d*0.8), yy=up?o-r+d:o+r-d; q.fillRect(o-hw,yy,hw*2+1,1); } DIAC.set(key,c); }
  ctx.drawImage(c,Math.round(x)-r-2,Math.round(y)-r-2); }
const MMFOG={};
function mmFog(cv){ const k=cv?'c':'s'; if(MMFOG[k]) return MMFOG[k]; const c=document.createElement('canvas'); c.width=4; c.height=4; const g=c.getContext('2d');
  g.fillStyle=cv?'#07060f':'#070e1b'; g.fillRect(0,0,4,4); g.fillStyle=cv?'#0e0b1c':'#0d1830'; g.fillRect(0,0,1,1); g.fillRect(2,2,1,1); return MMFOG[k]=ctx.createPattern(c,'repeat'); }
function drawLocalMap(L,cur,WT){ const M=L.mm, S=M.size, U=L.U, b=L.b, TS=ISL.TS, W=ISL.W, H=ISL.H;
  const ppt=Math.max(2,Math.round(S/Math.max(12,ITUNE.mmTiles))), ox=Math.round(M.x+S/2-player.x/TS*ppt), oy=Math.round(M.y+S/2-player.y/TS*ppt);
  let under=false;                                    // a foe on screen right under the map? it goes see-through (nothing hides beneath it)
  { const s=islScale(), kx=IKX, ky=IKY, x0=M.x-12, y1=M.y+S+12;
    for(const en of enemies){ if(en.dead) continue; const sx=((en.x-icamX)*s+IW/2)*kx; if(sx<x0 || sx>CSSW+8) continue; const sy=((en.y-icamY)*s+IH/2)*ky; if(sy>-8 && sy<y1){ under=true; break; } } }
  if(under) ctx.globalAlpha=clamp(ITUNE.mmFade,0.1,1);
  pxPanel(M.x-3*b,M.y-3*b,S+6*b,S+6*b, ISL.cave?PXP.cave:PXP.brass);
  ctx.save(); ctx.beginPath(); ctx.rect(M.x,M.y,S,S); ctx.clip();
  ctx.fillStyle=mmFog(!!ISL.cave); ctx.fillRect(M.x,M.y,S,S);                 // the unwalked: a dark, dithered fog
  const tx0=Math.max(0,Math.floor((M.x-ox)/ppt)), ty0=Math.max(0,Math.floor((M.y-oy)/ppt)), tx1=Math.min(W,Math.ceil((M.x+S-ox)/ppt)), ty1=Math.min(H,Math.ceil((M.y+S-oy)/ppt));
  const sm=ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled=false;
  if(ISL._mm && tx1>tx0 && ty1>ty0) ctx.drawImage(ISL._mm,tx0,ty0,tx1-tx0,ty1-ty0, ox+tx0*ppt,oy+ty0*ppt,(tx1-tx0)*ppt,(ty1-ty0)*ppt);
  ctx.imageSmoothingEnabled=sm;
  const X=v=>Math.round(ox+v/TS*ppt), Y=v=>Math.round(oy+v/TS*ppt), inB=(x,y,m)=>x>M.x-m&&x<M.x+S+m&&y>M.y-m&&y<M.y+S+m, seen=(x,y)=>ivisit[((y/TS)|0)*W+((x/TS)|0)], cm=ISL.claimMarks;
  const sq=(x,y,z,col)=>{ ctx.fillStyle=col; ctx.fillRect(x-(z>>1),y-(z>>1),z,z); };
  for(const cl of ISL.clearings){ if(cl.kind!=='bonus'||cl.secured||!ISL.gates[cl.id-1].open||!ivisit[((cl.gy/TS)|0)*W+((cl.gx/TS)|0)]) continue;   // an open cache doorway you've passed (the strip's lit diamond, placed)
    const x=X(cl.gx), y=Y(cl.gy); if(inB(x,y,4)) pxDia(x,y,2+(Math.sin(itime*4)>0?1:0),'#c9b8ff','#2a1a5a'); }
  for(const ch of ichests){ const x=X(ch.x), y=Y(ch.y); if(!inB(x,y,5) || (!cm && !seen(ch.x,ch.y))) continue;
    if(ch.big){ sq(x,y,7,'#04070e'); sq(x,y,5,ch.opened?'#7a6a44':'#ffd23f'); if(!ch.opened) sq(x,y-1,1,'#fff6c8'); }
    else { sq(x,y,5,'#04070e'); sq(x,y,3,ch.opened?'#6b5d40':(cm?'#c9b8ff':'#e7b416')); } }
  if(iburied && !iburied.dug && (cm || seen(iburied.x,iburied.y) || lodeSee(iburied.x,iburied.y))){ const x=X(iburied.x), y=Y(iburied.y); if(inB(x,y,4)){ ctx.fillStyle='#e0693f'; for(let d=-2;d<=2;d++){ ctx.fillRect(x+d,y+d,1,1); ctx.fillRect(x+d,y-d,1,1); } } }
  { const SL=ISL.secrets; if(SL) for(const S of SL){ if(S.open || !secSeen(S)) continue; const x=X(S.px), y=Y(S.py); if(inB(x,y,4)) mmQ(x,y); } }   // (C8b) a '?' where a grotto waits — once you've walked its clearing (Lode Sense: 30 tiles)
  if(ISL.mouthOn && ISL.mouthP){ const x=X(ISL.mouthP.x), y=Y(ISL.mouthP.y); if(inB(x,y,5)) mmTri(x,y,3,false,'#9f8cff'); }
  if(ISL.cave && ISL.caveOpen && ISL.ropeP){ const x=X(ISL.ropeP.x), y=Y(ISL.ropeP.y); if(inB(x,y,5)) mmTri(x,y,3,true,'#ffd86b'); }
  if(stairsOn()){ const x=X(ISL.stairP.x), y=Y(ISL.stairP.y); if(inB(x,y,5)) mmTri(x,y,3,false,'#9f8cff'); }
  if(!ISL.cave){ const x=X(ISL.landing.x), y=Y(ISL.landing.y); if(inB(x,y,5)){ ctx.fillStyle='#04070e'; ctx.fillRect(x-4,y-4,9,7); ctx.fillStyle='#6fc8ff'; ctx.fillRect(x-3,y,7,2); ctx.fillStyle='#e9e2cc'; ctx.fillRect(x,y-3,1,3); ctx.fillRect(x+1,y-2,2,2); } }   // your boat
  const fd=Math.max(2,ppt-1);
  for(const en of enemies){ if(en.dead || en.amb || (en.type==='sanddev'&&en.st!=='erupt')) continue; const x=X(en.x), y=Y(en.y); if(!inB(x,y,4) || !seen(en.x,en.y)) continue;   // foes — only where you've walked
    const act=enAct(en,cur?cur.id:-9);                                                               // (a sleeping pack reads dim — C3b)
    if(en.guard){ sq(x,y,7,'#04070e'); sq(x,y,5,'#ff2a2a'); sq(x,y,1,'#ffd86b'); }
    else if(en.elite||en.rar){ sq(x,y,fd+3,'#04070e'); sq(x,y,fd+1,act?'#ffa23a':'#a8702e'); }
    else if(en.fodder) sq(x,y,Math.max(1,fd-1),act?'#d98f7a':'#7a4e46');
    else { sq(x,y,fd+2,'#04070e'); sq(x,y,fd,act?'#ff4d3d':'#9a3a32'); } }
  if(WT && !WT.fight){ let tx=WT.x, ty=WT.y; if(WT.cl && WT.cl.gx!==undefined && !seen(WT.cl.x,WT.cl.y)){ tx=WT.cl.gx; ty=WT.cl.gy; }   // where the compass points: a gold ring — or, off the map, a gold notch on its rim
    const x=X(tx), y=Y(ty), on=Math.sin(itime*5)>-0.4;
    if(inB(x,y,-4)){ if(on){ ctx.fillStyle='#04070e'; ctx.fillRect(x-5,y-5,11,11); ctx.fillStyle='#ffd86b'; ctx.fillRect(x-4,y-4,9,9); ctx.fillStyle='#04070e'; ctx.fillRect(x-2,y-2,5,5); } }
    else { const cx0=M.x+S/2, cy0=M.y+S/2, a=Math.atan2(y-cy0,x-cx0), ca=Math.cos(a), sa=Math.sin(a), kk=(S/2-5)/Math.max(Math.abs(ca),Math.abs(sa)), ex=Math.round(cx0+ca*kk), ey=Math.round(cy0+sa*kk);
      pxDia(ex,ey,on?4:3,'#ffd86b','#04070e'); } }
  if(SAGA && SAGA_MK.on && SAGA_MK.m==='island' && !SAGA_MK.ta){ const x=X(SAGA_MK.x), y=Y(SAGA_MK.y); if(inB(x,y,-4)) sagaPin(x,y,1,1); }   // (INTROSTORY C4b) the goal's quill pin
  { const cx0=Math.round(M.x+S/2), cy0=Math.round(M.y+S/2), nx=Math.round(player.fx*3), ny=Math.round(player.fy*3);   // you: white, a gold nose the way you face
    ctx.fillStyle='#04070e'; ctx.fillRect(cx0-3,cy0-3,7,7); ctx.fillStyle='#ffffff'; ctx.fillRect(cx0-2,cy0-2,5,5); ctx.fillStyle='#04070e'; ctx.fillRect(cx0+nx-1,cy0+ny-1,3,3); ctx.fillStyle='#ffd23f'; ctx.fillRect(cx0+nx,cy0+ny,1,1); }
  ctx.restore();
  { const gh=Math.round(16*U), lab=ISL.cave?'▼'+ISL.cave.f:'', gw=glyphW('map',gh); ctx.font='800 '+Math.round(11*U)+'px system-ui'; const lw=lab?ctx.measureText(lab).width+Math.round(6*U):0;   // the key that opens the whole isle
    const x1=M.x+S-Math.round(3*U), yb=M.y+S-Math.round(3*U)-gh/2; drawGlyph('map',x1-gw,yb,gh); if(lab){ ctx.textAlign='right'; ctx.textBaseline='middle'; panTxt(lab,x1-gw-Math.round(4*U),yb+1,'#c9b8ff'); ctx.textAlign='left'; ctx.textBaseline='alphabetic'; } }
  ctx.globalAlpha=1; }
/* THE SATCHEL ROW — under the map (§12): 🎒 the bag n/24 · this landfall's coin · its 4 most valuable pouch stacks (pixel icons) */
let SATC=null;                                                                           // (the row's items — rebuilt only when the bag, the pouch, the trip's coin or the size change)
function drawSatchel(L){ const U=L.U, k=L.k, h=L.sat.h, cy=L.sat.y+h/2, fs=Math.round(12.5*U), font='800 '+fs+'px system-ui'; ctx.font=font;
  const bn=bagCount(), g=Math.round(4*U), gi=Math.round(10*U), pdx=Math.round(9*U);
  if(!SATC || SATC.pv!==pouchVer || SATC.tg!==tripGold || SATC.bn!==bn || SATC.fs!==fs || SATC.k!==k || SATC.W!==CSSW){   // (the items AND their measured widths — no measureText in a steady frame)
    const top=Object.keys(POUCH).sort((a,b)=>POUCH[b]*MATS[b].v-POUCH[a]*MATS[a].v).slice(0,4), it=[];
    if(tripGold>0) it.push(['coin',tripGold]); for(const q of top) it.push([matPx(q),POUCH[q]]);
    const head=bn+'/'+bagSize(), hw=ctx.measureText(head).width, base=pdx+pxiW('bag',k)+g+hw+pdx, nw=it.map(([ic,n])=>ctx.measureText(''+n).width);
    const iw=it.map(([ic],i)=>gi+pxiW(ic,k)+Math.round(3*U)+nw[i]), maxW=Math.min(CSSW*0.42, 440*U);
    let show=it.length, w=base+iw.reduce((p,q)=>p+q,0); while(show>0 && w>maxW){ show--; w-=iw[show]; }   // (narrow: the head alone — never over the arena)
    SATC={pv:pouchVer, tg:tripGold, bn, fs, k, W:CSSW, items:it, head, hw, nw, show, w:Math.round(w)}; }
  const S=SATC, x=Math.round(L.sat.r-S.w), y=L.sat.y; pxPanel(x,y,S.w,h, bn>=bagSize()?PXP.red:PXP.brass);   // (the bag FULL: a red plate — gear waits on the ground)
  ctx.textAlign='left'; ctx.textBaseline='middle'; let tx=x+pdx; const tc=haulPulse>0?'#ffffff':'#ffe9a6';
  tx+=pxIcon('bag',tx,cy,k)+g; panTxt(S.head,tx,cy+1,tc,font); tx+=S.hw;
  for(let i=0;i<S.show;i++){ const [ic,n]=S.items[i]; tx+=gi; tx+=pxIcon(ic,tx,cy,k)+Math.round(3*U); panTxt(''+n,tx,cy+1,ic==='ring'?'#e0c8ff':ic==='coin'?'#ffd86b':'#e6eeff',font); tx+=S.nw[i]; }
  ctx.textBaseline='alphabetic'; }
/* YOU — bottom-left, ARPG-style: the level badge (skill points waiting pulse green) · heart + HP (a galley meal's bonus in gold) · the XP sliver ·
   the Tide (wave, bar, the skills' price notches) & the dash (boot, its charges, its key) · the flask (+ the draughts & the drink key) · the combo pips & the kill streak */
let streakPopT=-9;
function drawYou(L){ const U=L.U, k=L.k, P=L.pc, x=P.x, y=P.y, w=P.w, h=P.h, u=v=>Math.round(v*U);
  pxPanel(x,y,w,h);
  const bw=u(44), bx=x+u(6), by=y+u(6), bh=h-u(12), lf=clamp(levelFx/1.3,0,1), tpN=treePts(), pts=tpN>0;   // (the "✦ point" badge — §9.4: it stays till you spend it)
  pxPanel(bx,by,bw,bh, lf>0?PXP.gold:(pts?PXP.green:PXP.dim));
  ctx.textAlign='center'; ctx.textBaseline='middle';
  panTxt('LV',bx+bw/2,by+u(12),'#9fb6dd','800 '+u(9.5)+'px system-ui');
  if(lf>0){ ctx.save(); ctx.shadowColor='rgba(255,210,63,.95)'; ctx.shadowBlur=14*lf; }            // a fresh level glows gold for a breath
  panTxt(''+plvl,bx+bw/2,by+(pts?u(31):bh/2+u(5)),lf>0?'#fff6c8':'#ffd86b','800 '+u(plvl>=100?16:22)+'px system-ui'); if(lf>0) ctx.restore();
  if(pts){ const gp=0.5+0.5*Math.sin(itime*(lf>0?12:4)), ph=u(15), pw2=bw-u(8), px=bx+u(4), py=by+bh-ph-u(4);   // the waiting points: a green plate that pulses (hard, right after a level)
    ctx.fillStyle='#04070e'; ctx.fillRect(px,py,pw2,ph); ctx.fillStyle=gp>0.5?'#9ff5c0':'#6fdc9c'; ctx.fillRect(px+1,py+1,pw2-2,ph-2);
    ctx.fillStyle='#0b2a18'; ctx.font='800 '+u(10.5)+'px system-ui'; ctx.fillText('✦'+tpN,px+pw2/2,py+ph/2+1); }
  ctx.textAlign='left';
  const cx=bx+bw+u(8), rx=x+w-u(8);
  // row 1 — the heart & your HP (0-100+, it persists between landfalls; only draughts heal)
  const hbH=u(16), r1=y+u(7), frac=clamp(player.hp/player.maxhp,0,1), mhp=player.maxhp, lowHp=player.hp<=mhp*0.25, base=eMaxHp();
  if(lowHp && Math.sin(itime*9)>0.2) ctx.globalAlpha=0.6;
  const hw=pxIcon('heart',cx,r1+hbH/2,k); ctx.globalAlpha=1;
  const barX=cx+hw+u(4), barW=rx-barX;
  ctx.globalAlpha=lowHp?0.62+0.38*Math.sin(itime*7):1;
  const fw=pxBar(barX,r1,barW,hbH,frac,lowHp?'#ff4d5e':'#e23a4c',lowHp?'#ff9aa4':'#ff8190','#a3172c','#3a1422'); ctx.globalAlpha=1;
  if(mhp>base){ const gx=barX+Math.round(barW*base/mhp); if(barX+fw>gx){ ctx.fillStyle='rgba(255,210,63,.85)'; ctx.fillRect(gx,r1,barX+fw-gx,hbH); } }   // (trinket HP is yours — only a galley meal shows gold)
  ctx.fillStyle='rgba(0,0,0,.35)'; for(const f of [0.25,0.5,0.75]) ctx.fillRect(barX+Math.round(barW*f),r1+2,1,hbH-4);
  ctx.textBaseline='middle'; panTxt(Math.ceil(player.hp)+' / '+mhp,barX+u(6),r1+hbH/2+1,lowHp?'#ffd0d6':'#fff2f4','800 '+u(11.5)+'px system-ui');
  // row 2 — the XP sliver (past the cap it fills toward the next grain of salt) & its numbers
  const xpn=xpToNext(plvl), cap=plvl>=PTUNE.lvlCap, xf=cap?clamp(paraXp/xpn,0,1):clamp(pxp/xpn,0,1), r2=r1+hbH+u(5);
  const xt=cap?('✦ salt '+para):(pxp+' / '+xpn+' xp'); ctx.font='700 '+u(9.5)+'px system-ui'; const xtw=ctx.measureText(xt).width;
  pxBar(barX,r2,Math.max(20,rx-barX-xtw-u(8)),Math.max(2,u(3)),xf,lf>0?'#bfe9ff':'#6fc8ff',null,null,'#15233c');
  ctx.textAlign='right'; panTxt(xt,rx,r2+1,'#9fb6dd'); ctx.textAlign='left';
  // row 3 — THE TIDE (your basic blows raise it, skills spend it: it glows once a skill on the bar is paid for — a notch marks each price) · the DASH (boot, a pip a charge, its key)
  const bt=!!TR.kBT, r3=r2+u(15), gh=u(17), tm=Math.max(1,tideMax()), tf=bt?0:clamp(tide/tm,0,1), gp=0.5+0.5*Math.sin(itime*9);   // (C6a BLOOD TIDE: no Tide — the row says so)
  let minC=1e9; for(let i=1;i<6;i++){ const c=barCost(i); if(c>0 && c<minC) minC=c; } const glow=tide+1e-6>=minC;
  const dn=dashCh(), pipW=u(7), pipG=u(3), dgw=glyphW('dash',gh), bootW=pxiW('boot',k), dx0=rx-dgw-u(4)-dn*pipW-(dn-1)*pipG-u(4)-bootW;
  ctx.globalAlpha=player.dashN>0?1:0.55; pxIcon('boot',dx0,r3,k); ctx.globalAlpha=1;
  for(let i=0;i<dn;i++){ const f=i<player.dashN?1:(i===player.dashN?clamp(1-player.dashRc/Math.max(0.05,eDashCool()),0,1):0);   // (the one recharging fills)
    pxBar(dx0+bootW+u(4)+i*(pipW+pipG),r3-u(4),pipW,u(8),f,f>=1?'#7fd6ff':'#3f8fae',f>=1?'#d8f6ff':null,null,'#16294a'); }
  drawGlyph('dash',rx-dgw,r3,gh);
  const twI=pxiW('tide',k), tbx=cx+twI+u(4), tbw=Math.max(24,dx0-u(10)-tbx);
  pxIcon(tide>0.5?'tide':'tideD',cx,r3,k);
  if(glow){ const gy=r3-u(6), gh2=u(12); ctx.fillStyle='rgba(159,240,255,'+(0.35+0.4*gp).toFixed(3)+')'; ctx.fillRect(tbx-3,gy-3,tbw+6,2); ctx.fillRect(tbx-3,gy+gh2+1,tbw+6,2); ctx.fillRect(tbx-3,gy-1,2,gh2+2); ctx.fillRect(tbx+tbw+1,gy-1,2,gh2+2); }   // a skill is paid for: a pulsing pixel halo (no canvas shadow — it's per frame)
  const crest=glow && !bt && tf>=1 && ITUNE.crestK>1 && crestSlot();                                  // (PT1 K4) THE CREST is ready: a gold ring outside the teal halo, pulsing against it · CREST at the bar's right end (G6 fix: only when a slotted skill that strikes is paid for)
  if(crest){ const gy=r3-u(6), gh2=u(12); ctx.fillStyle='rgba(255,210,63,'+(0.3+0.45*(1-gp)).toFixed(3)+')'; ctx.fillRect(tbx-5,gy-5,tbw+10,2); ctx.fillRect(tbx-5,gy+gh2+3,tbw+10,2); ctx.fillRect(tbx-5,gy-3,2,gh2+6); ctx.fillRect(tbx+tbw+3,gy-3,2,gh2+6); }
  if(bt){ pxBar(tbx,r3-u(6),tbw,u(12),1,'#7a1420','#c83a3a','#3a0a10','#1a0608');                     // BLOOD TIDE: a dark red band — your skills are paid from the heart row above
    if(tbw>u(56)){ ctx.textAlign='center'; panTxt('BLOOD TIDE', tbx+tbw/2, r3+1, '#ffd0d0', '800 '+u(9.5)+'px system-ui'); ctx.textAlign='left'; } }
  else { pxBar(tbx,r3-u(6),tbw,u(12),tf,tf>=1?(gp>0.5?'#9ff0ff':'#5fd8e8'):'#2fb7c9',tf>=1?'#e8fffc':'#7fe0ec','#1a7a8a','#0c2228');
  for(let i=1;i<6;i++){ const c=barCost(i); if(c>0 && c<tm){ ctx.fillStyle=tide+1e-6>=c?'rgba(232,255,252,.85)':'rgba(4,7,14,.8)'; ctx.fillRect(tbx+Math.round(tbw*c/tm),r3-u(6),1,u(12)); } }
  const cw=crest && tbw>u(118);                                                                          // (a wide bar keeps its numbers & wears CREST at its right end — a narrow one says CREST instead)
  if(tbw>u(56) && !(crest && !cw)){ ctx.textAlign='center'; panTxt(Math.floor(tide)+' / '+tm, tbx+tbw/2, r3+1, '#eafcff', '800 '+u(9.5)+'px system-ui'); ctx.textAlign='left'; }
  if(crest && tbw>u(56)){ const fC='900 '+u(8.5)+'px system-ui'; ctx.font=fC; const cww=Math.ceil(ctx.measureText('CREST').width), cxL=Math.round(cw?tbx+tbw-u(4)-cww:tbx+tbw/2-cww/2);
    ctx.fillStyle='rgba(6,14,24,.75)'; ctx.fillRect(cxL-u(3),r3+1-u(5),cww+u(6),u(10));                   // (G6 fix) a dark chip under the word — gold reads on the bright full bar
    ctx.textAlign=cw?'right':'center'; panTxt('CREST', cw?tbx+tbw-u(4):tbx+tbw/2, r3+1, '#ffd23f', fC); ctx.textAlign='left'; } }
  // row 4 — THE FLASK (full charges, the next filling from the bottom with kill points, the empties — a green blink as one fills) · the draughts you carry · the drink key · the combo & the streak
  const r4=r3+u(20), cap2=flaskCap(), pgw=glyphW('potion',gh);
  let right=rx;                                                            // the streak & the combo take the row's right end
  if(killStreak>=ITUNE.streakMin && killStreakT>0){ const pop=1+0.45*Math.max(0,1-(itime-streakPopT)/0.3), fsz=Math.round(u(13+Math.min(9,killStreak*0.22))*pop);
    ctx.textAlign='right'; panTxt('×'+killStreak,right,r4+1,killStreak>=18?'#ff4d2e':'#ff7a3d','900 '+fsz+'px system-ui'); const sw=ctx.measureText('×'+killStreak).width;
    panTxt('streak',right-sw-u(4),r4+u(2),'#c98a5a','800 '+u(8.5)+'px system-ui'); right-=sw+u(4)+ctx.measureText('streak').width+u(8); ctx.textAlign='left'; }
  if(player.combo>0 && (player.comboT>0 || player.act)){ const dr=u(4), step=dr*2+u(4), CB=comboOf(wpnOf()), N=CB.length;   // a diamond a blow of the chain you have (3 · 4 · 5 — STEEL comboOf) · lit = the chain is live · a FINISHER's is bigger & gold (dim till it's lit) — blinking = your NEXT swing is it
    for(let i=0;i<N;i++){ const on=i<player.combo, fin=!!CB[i].fin, prime=fin&&i===player.combo, px=right-(N-1-i)*step-dr;
      pxDia(px,r4,fin?dr+u(1):dr, on?'#ffd23f':(prime?(Math.sin(itime*16)>0?'#fff6c8':'#b8861a'):fin?'#5a4618':'#2a3450'),'#04070e'); }
    right-=N*step+u(6); }
  const DQ=draughtPlate(k,U), dW=DQ?DQ.w:0;                                  // the draughts behind the flask (a baked plate: their icons & counts)
  const room=right-cx-u(8)-pgw-dW; let kk=k; if(cap2*(pxiW('flask',k)+Math.max(1,u(2)))>room && k>1) kk=k-1;
  const fw2=pxiW('flask',kk), st=fw2+Math.max(1,u(2)), dry=flask.ch<=0 && !DQ; let tx=cx;
  if(cap2*st<=room){ const pf=flask.ch<cap2?clamp(flask.pts/flaskPer(),0,1):0, bl=clamp(1-(itime-flaskBlink)/0.5,0,1), fh=pxiCv('flask').height*kk;
    for(let i=0;i<cap2;i++){ const fx2=cx+i*st;
      if(i<flask.ch){ pxIcon('flask',fx2,r4,kk);
        if(bl>0 && i===flask.ch-1 && Math.sin(itime*30)>-0.3){ ctx.fillStyle='rgba(143,240,176,'+(0.9*bl).toFixed(3)+')'; const t0=Math.round(r4-fh/2)-1; ctx.fillRect(fx2-1,t0,fw2+2,1); ctx.fillRect(fx2-1,t0+fh+1,fw2+2,1); ctx.fillRect(fx2-1,t0,1,fh+2); ctx.fillRect(fx2+fw2,t0,1,fh+2); } }   // a charge just filled: it blinks green
      else { pxIcon('flaskE',fx2,r4,kk); if(i===flask.ch && pf>0){ ctx.globalAlpha=0.8; pxIconFill('flask',fx2,r4,kk,pf,3); ctx.globalAlpha=1; } } }   // (the next one fills from the bottom as the kills pour in — its body only, a touch paler)
    tx=cx+cap2*st; }
  else { pxIcon(flask.ch>0?'flask':'flaskE',cx,r4,k); const t=flask.ch+'/'+cap2; panTxt(t,cx+pxiW('flask',k)+u(4),r4+1,flask.ch>0?'#9fe8c0':'#ff8a8a','800 '+u(12)+'px system-ui'); tx=cx+pxiW('flask',k)+u(8)+ctx.measureText(t).width; }   // (a long strap: one flask & the count)
  if(DQ){ ctx.drawImage(DQ.cv,Math.round(tx),Math.round(r4-DQ.h/2),DQ.w,DQ.h); tx+=DQ.w; }
  drawGlyph('potion',tx+u(6),r4,gh);
  if(dry){ ctx.globalAlpha=0.5+0.5*Math.sin(itime*3); ctx.fillStyle='#ff8a8a'; ctx.fillRect(cx,Math.round(r4+u(10)),Math.max(u(8),tx-cx),1); ctx.globalAlpha=1; }   // (nothing left to drink: the strap glows red)
  ctx.textBaseline='alphabetic'; }
function draughtPlate(k,U){ if(!(draughts.h>0) && !(draughts.g>0)) return null; const u=v=>Math.round(v*U), dq=[];   // the carried draughts: 🧪 N (+ a Greater's gold 🧪 N) — baked per count (text is the costly part of the HUD)
  if(draughts.h>0) dq.push(['draughtH',draughts.h,'#ffc4ca']); if(draughts.g>0) dq.push(['draughtG',draughts.g,'#ffe28c']);
  const font='800 '+u(11)+'px system-ui', key='dq|'+draughts.h+'|'+draughts.g+'|'+k+'|'+U+'|'+DPR; let c=HUDC.get(key); if(c) return c;
  ctx.save(); ctx.font=font; let w=0; const tw=dq.map(q=>ctx.measureText(''+q[1]).width); ctx.restore(); dq.forEach((q,i)=>{ w+=u(6)+pxiW(q[0],k)+u(2)+tw[i]; }); w=Math.ceil(w)+2;
  const h=Math.max(pxiCv('draughtH').height*k, u(14))+2;
  return hudPlate(key,w,h,g=>{ let x=0; g.textBaseline='middle'; g.textAlign='left'; dq.forEach((q,i)=>{ x+=u(6); x+=pxIcon(q[0],x,h/2,k,g)+u(2); panTxt(''+q[1],x,h/2+1,q[2],font,g); x+=tw[i]; }); }); }
function pxIconFill(n,x,cy,k,f,r0){ const c=pxiCv(n); if(!c || !(f>0)) return; const h=c.height, fh=Math.max(1,Math.round((h-(r0||0))*clamp(f,0,1))), top=Math.round(cy-h*k/2);   // an icon drawn only from its bottom up (a filling flask — r0: the rows above the body that never fill)
  ctx.drawImage(c,0,h-fh,c.width,fh,Math.round(x),top+(h-fh)*k,c.width*k,fh*k); }
/* THE SKILL BAR (§12) — bottom-centre: slot 1 = the weapon basic (a BASIC gem's icon rides in its corner), then every slot that holds a gem — its icon (dim
   when you can't pay it, greyed with a red bar when the weapon in hand can't use it), its Tide price in the corner (red when short), its level pip (L1-20,
   gold from L15), a gold frame while it plays (a quick gold blink while the press buffer waits), a red flash when a cast fails, a glint as it becomes
   affordable, a dithered cooldown wipe from the top, and its key cap under it. Each slot's plate is baked (SBC). */
const SBC=new Map();
function drawSkillBar(L){ const B=L.bar, U=L.U, S=B.s, H=S+Math.round(14*U), gh=Math.round(14*U), A=player.act;
  for(let n=0;n<B.slots.length;n++){ const i=B.slots[n], x=B.x+n*(S+B.g), y=B.y, G=barGem(i), D=G?GEMS[G.g]:null, fit=!D||gemFits(D), cost=gemCost(i), F=barFx[i]||{};
    const aff=!cost || canPay(cost), live=!!A && (i===0 ? A.slot==='basic' : (A.slot==='skill' && A.si===i)), wait=!!(player.bufK && player.bufK.i===i), per=!!(D && D.sl==='persist');
    const fr=itime-(F.nope||-9)<0.25 ? 'r' : (live || (wait && Math.sin(itime*24)>0)) ? 'g' : 'd', wic=(EQ.main&&IB(EQ.main)&&IB(EQ.main).ic)||'blade', ic=i===0?wic:D.ic, gl=glyph(BAR_ROLES[i]), lv=G?gemLv(G):0;
    const key=i+'|'+ic+'|'+(D?D.ic:'')+'|'+(aff?1:0)+'|'+(fit?1:0)+'|'+fr+'|'+gl+'|'+(inDev==='pad'?1:0)+'|'+cost+'|'+lv+'|'+S+'|'+U+'|'+DPR;
    const P=hudPlate(key,S,H,g=>{ pxPanel(0,0,S,S, fr==='r'?PXP.red:fr==='g'?PXP.gold:PXP.dim, g);
      const c=pxiCv(ic), kk=Math.max(1,Math.floor((S-Math.round(10*U))/Math.max(c.width,c.height)));
      if(!aff || (!fit && i>0)) g.globalAlpha=0.4; pxIcon(ic,Math.round((S-c.width*kk)/2),Math.round(S/2),kk,g); g.globalAlpha=1;
      if(i===0 && D){ const c2=pxiCv(D.ic), k2=Math.max(1,Math.floor(kk*0.5)); g.fillStyle='rgba(4,7,14,.7)'; g.fillRect(Math.round(2*U),Math.round(2*U),c2.width*k2+2,c2.height*k2+2);   // (slot 1: the BASIC gem that modifies it, small in the corner)
        if(!fit) g.globalAlpha=0.4; pxIcon(D.ic,Math.round(2*U)+1,Math.round(2*U)+1+c2.height*k2/2,k2,g); g.globalAlpha=1; }
      g.textAlign='right'; g.textBaseline='alphabetic';
      if(cost) panTxt(''+cost, S-Math.round(4*U), S-Math.round(4*U), aff?'#9ff0ff':'#ff7a6a', '800 '+Math.round(10*U)+'px system-ui', g);
      else if(per && fit) panTxt('on', S-Math.round(4*U), S-Math.round(4*U), '#9fe8c0', '800 '+Math.round(9*U)+'px system-ui', g);
      if(G){ g.textBaseline='top'; panTxt(''+lv, S-Math.round(3*U), Math.round(2*U), lv>=15?'#ffd86b':lv>=5?'#ffb89a':'#cfe8ff', '800 '+Math.round(9*U)+'px system-ui', g); g.textBaseline='alphabetic'; }   // the gem-level pip
      if(!fit){ g.fillStyle='#ff5d4a'; g.globalAlpha=0.85; for(let q=0;q<S-8;q++) g.fillRect(4+q, S-5-q, 2, 1); g.globalAlpha=1; }   // (the wrong weapon in hand: a red bar across — it's inert)
      g.textAlign='left';
      const gw=glyphW(BAR_ROLES[i],gh); drawGlyph(BAR_ROLES[i], Math.round(S/2-gw/2), S+Math.round(6*U), gh, g); }, SBC);
    ctx.drawImage(P.cv,x,y,P.w,P.h);
    const cd=cost && player.cdS[i]>0 ? clamp(player.cdS[i]/(player.cdM[i]||1),0,1) : 0;
    if(cd>0){ const b=hudB(), hh=Math.round((S-4*b)*cd); ctx.fillStyle='rgba(4,7,14,.62)'; for(let r=0;r<hh;r++) ctx.fillRect(x+2*b+(r&1),y+2*b+r,S-4*b-1,1); }   // the cooldown: a dithered wipe from the top
    const gt=itime-(F.glint||-9); if(gt<0.35){ const p=gt/0.35, b=hudB(); ctx.fillStyle='rgba(255,255,255,'+(0.55*(1-p)).toFixed(3)+')'; ctx.fillRect(x+2*b+Math.round((S-4*b-3)*p),y+2*b,Math.max(2,Math.round(3*U)),S-4*b); } }   // just affordable: a glint sweeps across
  drawBuffs(L); }
/* THE BUFF ROW (§12 L.buffs): above you (bottom-left), a small plate per buff — its icon & a draining time bar (a ward's bar is its shield left) */
const BUFF_IC=Object.assign({roar:'g08', rush:'g25', ward:'g26', ut:'g14', bcn:'g29'}, PW_BUFF_IC, {sq:'wind', fl:'tide', kr:'kraken', pr:'pearl', dp:'deep', cu:'curse'});   // (C6b: + the powers' — a barrier · a free skill · the anchor · Mermaid's Tear · the King's Howl · C8b: the shrines' & CURSED!)
const BUFF_BC={sq:'#9fe8ff', fl:'#2fb7c9', kr:'#6fe0a0', pr:'#ffe9a6', dp:'#6a8cff', cu:'#c58cff'};   // (C8b) their time bars wear the shrine's colour
function drawBuffs(L){ const U=L.U, s=Math.round(24*U), g=Math.round(4*U); let n=0, x=L.pc.x; const y=L.pc.y-s-Math.round(8*U);
  const one=(k,f,ic,bc)=>{ ic=ic||BUFF_IC[k]; const c=pxiCv(ic); if(!c) return; pxPanel(x,y,s,s,PXP.dim); const kk=Math.max(1,Math.floor((s-Math.round(8*U))/Math.max(c.width,c.height)));
    pxIcon(ic,Math.round(x+(s-c.width*kk)/2),Math.round(y+s/2-Math.round(2*U)),kk);
    pxBar(x+Math.round(3*U), y+s-Math.round(6*U), s-Math.round(6*U), Math.max(2,Math.round(3*U)), clamp(f,0,1), bc||((k==='ward'||k==='bar')?'#9ff0ff':'#ffd86b'), null, null, '#15233c'); x+=s+g; n++; };
  if(elix && ELIXIR[elix.k]) one('elix', elix.t/ELIXIR_T, 'ex:'+elix.k, ELIXIR[elix.k].c);   // (C7b) the Elixir you drank leads the row — its 20 minutes draining
  for(const k in BUFF){ const b=BUFF[k]; one(k, (k==='ward'||k==='bar')?b.hp/b.max:b.t/(b.T||1), null, BUFF_BC[k]);   // (a shield's bar is what's left of it)
    if(k==='pr' && b.n>0){ const x0=x-g-Math.round(8*U), y0=y+Math.round(2*U); ctx.fillStyle='#04070e'; ctx.fillRect(x0-1,y0-1,Math.round(8*U)+2,Math.round(10*U)+2); hudTxt(''+b.n,x0+Math.round(1*U),y0+Math.round(8*U),'#ffe9a6','800 '+Math.round(9*U)+'px system-ui'); } }   // (the Pearl shrine: finds still to raise)
  if(player.bcn) one('bcn',1); }
/* the boss bar's place — bottom-centre, clear of you (bottom-left) */
function bossBarOn(){ const B=ISL&&ISL.boss; return !!(B && ISL.bannerT>=0 && !(B.dead && ISL.bossGoneT>2.2)); }
function bossBarRect(L){ const U=L.U, bh=Math.round(12*U); let w=Math.round(Math.min(520*U, CSSW*0.5)), x=Math.round(CSSW/2-w/2); const minX=L.pc.x+L.pc.w+Math.round(24*U);
  if(x<minX){ x=minX; w=Math.max(160, Math.min(w, CSSW-L.pd-Math.round(12*U)-x)); }
  const y=L.bar.y-Math.round(14*U)-bh; return {x, y, w, h:bh, top:y-Math.round(26*U)}; }   // (above the skill bar — §12: the bottom-centre stack starts over it)
