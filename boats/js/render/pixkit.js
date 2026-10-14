"use strict";
/* FILE: js/render/pixkit.js
THE CRAWL PIXEL KIT AND THE TREE PAINTERS (STAGE 3, THE GROUND, first part): original lines 22700-23057 (build 5109cd5),
  moved verbatim, in place directly after js/render/spr2_templates.js; the terrain chunk bake (terrTile, terrPrep, terrState)
  follows at original line 23058 (build 5109cd5).
Four parts: the STAGE 3 banner and TB, every biome's ground looks (a pure object literal); the 4x4 Bayer dither (BAY4, bayV),
  the ImageData colour words (cI, cIA, cIR) and the pixel painter kit (PS, psP, psG, psOut, psCv, psLine, psDisc, psPoly,
  psBall), the most-shared utility in the game; one painter per tree or rock kind (trBroad ... trVent, plus psVein) with the
  TR_PAINT, TR_SIZE and TR_LOW tables; then TBI and caveTI (biome and cave palettes as colour words), CAVE_STONE and the
  game-wide baked-sprite cache TSPR with tSpr, shadowSpr, treeSpr and paintTree.
Entry points: cI, cIA, cIR and the ps* kit (sea art, fish and whales, sanctums, the deck, towns, folk portraits: about 145
  functions); tSpr, shadowSpr, TBI and caveTI (sanctums, allies, flags, towns); paintTree (the lands seen from the sea, town
  trees); TB, TR_SIZE, TR_LOW, trBoulder, trSpire and BAY4 (sea lands, towns, escRim, light, terrain and props renderers).
Globals it owns: the consts TB, BAY4, cIR, TR_PAINT, TR_SIZE, TR_LOW, CAVE_STONE and TSPR; the lets TSPR_S and TSPR_V (set by
  terrState, a later script, read live elsewhere); the functions bayV, cI, cIA, the ps* kit, the 22 tr* painters, psVein, TBI,
  caveTI, tSpr, shadowSpr, treeSpr and paintTree.
Main globals it reads from elsewhere (inside functions, at runtime only): clamp, hash2 and TAU (index.html part 1); mixHex and
  cavePal (the caves, original lines 17663 and 17666 (build 5109cd5), an earlier script).
Load-time statements: TR_PAINT (original lines 23019-23020 (build 5109cd5)), 22 references to the tr* painters above it in
  this file, nothing called; original line 23041 (build 5109cd5), const TSPR=new Map() with TSPR_S and TSPR_V set to 0; the
  rest are literal consts and function declarations. cIR is a const arrow and never hoists: the terrain colour tables and
  BAYT in later scripts call the kit at load, so this file must load before them.
*/
/* ======================== STAGE 3 · THE GROUND, THE FOREST WALL, THE SHORE & THE CAVES ========================
   Everything static ashore is BAKED on the one texel grid (1 texel = 1 buffer px · global texel = world × islScale()) into
   64×64-texel chunks, built lazily as they come into view (+ a small per-frame pre-bake of the ring round it) and kept on the isle
   (ISL._T — a floor's stash keeps its surface's chunks); a new texel or a moved terrain knob re-bakes.
   A chunk: the floor (per-biome shade ramps · big soft fbm patches quantised with a 4×4 Bayer dither — never a colour per tile) ·
   organic noise-thresholded edges (bilinear wall-ness + noise) with a dark rim & soft AO, deepest where the top-left light is
   blocked · worn trails fading into the clearings · the beach & wet sand along real water · ice with a rim, sheen & cracks ·
   micro-decals on their own hash · rim dressing · and the forest wall: per-biome pixel-painted trees (outlined like the actors),
   every shadow first, then every tree y-sorted across the chunk — nothing clips. Water texels stay see-through: the animated
   water is drawn beneath and the foam swash over it. What changes mid-run (a gate slammed or opened, frost & tide ice) is drawn
   per frame over the bake, by comparing ISL.tiles with the gen-time snapshot ISL.tiles0. */
const TB={   // each biome's ground: g floor ramp (6: deep shade → highlight) · u forest floor · p trail · sd beach (5) · fl flowers (never the coin's gold) · tr trees [kind,weight] · tc tree spacing (wu) · cr canopy ramps by kind (tint variants) · tk trunk · ol the outline · pb pebble · decals dg/ds/dt (ground/sand/trail) · dr rim dressing · rk/hb/ru the props' looks · wat water
  tropic:{ g:['#1f4a33','#275a3d','#2f6a46','#34744c','#3b7e53','#56986a'], u:['#0b170d','#102113','#162b19'], p:['#4c3b26','#5b482e','#6a5537','#786241','#8a744f'], sd:['#8e7a52','#a38e62','#b6a273','#c5b283','#d6c596'],
    fl:['#e67a96','#eef2ff','#b99af0'], tr:[['broad',0.55],['palm',0.45]], tc:12.5,
    cr:{broad:[['#123018','#1a3f1e','#245026','#316531','#467d40','#5f9650'],['#16361a','#1f4822','#2a5a2a','#397036','#528a47','#6aa357']], palm:[['#153d1c','#1f5026','#2c6630','#3e7e3a','#56984a','#74b25c'],['#1a4220','#26562a','#346e34','#488840','#62a252','#80bc66']]},
    tk:['#2e2014','#4a3620','#66502e'], ol:'#08120a', pb:['#9a9a8c','#76766a'],
    dg:[['blade',3],['tuft',2.2],['clover',0.8],['flower',0.45],['pebble',0.5],['twig',0.4]], ds:[['shell',1],['ripple',1.2],['pebble',0.7],['twig',0.3]], dt:[['foot',1.4],['pebble',1],['twig',0.3]],
    dr:[['fern',2],['log',0.9],['stump',0.6],['shroom',0.6]], rk:'basalt', hb:'fern', ru:'moss',
    wat:['#2a6c86','#5aa6c0','#6fc0b8','#3a8aa0','#1e5a78'] },
  savanna:{ g:['#574e26','#685d2e','#7a6d37','#84763c','#8f8042','#ae9e58'], u:['#1e1a0c','#282210','#322a14'], p:['#644c30','#735838','#826440','#907048','#a28258'], sd:['#9a8458','#ae9866','#c0aa76','#cdb884','#dcc896'],
    fl:['#e8904e','#f0e2c8','#c87a9a'], tr:[['acacia',0.52],['dgrass',0.3],['scrub',0.18]], tc:10.5,
    cr:{acacia:[['#1f2610','#2c3414','#3a441a','#4c5622','#62702c','#7e8a3c'],['#262a10','#343a16','#44481c','#585c24','#70742e','#8a8e3e']], dgrass:[['#4a3c18','#6a5626','#8a7034','#a88c46','#c4a85c','#dcc47a'],['#44401c','#5e5828','#7a7236','#968c46','#b0a65a','#cac070']], scrub:[['#1e2610','#2a3416','#36421c','#445024','#56622e','#6c783a']]},
    tk:['#281a10','#44301e','#5e4428'], ol:'#120e06', pb:['#b09a78','#86735a'],
    dg:[['blade',2.4],['tuft',2],['pebble',0.8],['twig',0.8],['bone',0.08],['flower',0.25]], ds:[['pebble',1],['ripple',1],['twig',0.4]], dt:[['foot',1.4],['pebble',1.2],['crack',0.4]],
    dr:[['bones',0.6],['log',0.7],['rocks',1.2]], rk:'sandstone', hb:'sage', ru:'sandstone',
    wat:['#2c6a80','#5ca2b6','#78c0b0','#3c8898','#205870'] },
  moor:{ g:['#3a4636','#46533f','#535f48','#5a674e','#637055','#7f8a6c'], u:['#0c1714','#111f1a','#172821'], p:['#48463a','#545144','#605c4e','#6c6758','#7e7868'], sd:['#646058','#76726a','#88847a','#98948a','#aaa69c'],
    fl:['#a884cc','#e6e2f2','#8898d4'], tr:[['gnarl',0.5],['heather',0.5]], tc:11,
    cr:{gnarl:[['#0d1e19','#142a23','#1c362d','#27443a','#35564a','#4a6c5e'],['#101e1c','#162a27','#1f3632','#2a4640','#3a5a52','#507066']], heather:[['#1a2418','#233022','#2c3a2a','#384634','#465440','#56644c']]},
    tk:['#241a14','#382a20','#4e3e30'], ol:'#070e0b', pb:['#a2a6a4','#7a7e7c'],
    dg:[['blade',1.6],['tuft',1],['heather',0.7],['pebble',1.1],['clover',0.4],['flower',0.2]], ds:[['pebble',2],['ripple',0.6]], dt:[['foot',1.2],['pebble',1.4]],
    dr:[['stump',1],['rocks',1.4],['fern',0.4]], rk:'granite', hb:'heather', ru:'granite',
    wat:['#2a5e76','#5894aa','#6aa6a4','#367a90','#1c4c66'] },
  ember:{ g:['#4e3520','#5e4126','#6e4c2c','#76532f','#7f5a33','#9c7446'], u:['#170f07','#20160b','#291d0f'], p:['#5a4430','#685038','#765c40','#846848','#967854'], sd:['#8e7a58','#a28c66','#b49e76','#c2ac84','#d2bc94'],
    fl:['#e8784a','#f0e0d0','#c85a6a'], tr:[['oak',0.8],['broad',0.2]], tc:12.5,
    cr:{oak:[['#4a200c','#6a3212','#8a4818','#aa6222','#c47e30','#dc9c44'],['#44140e','#621e14','#82301c','#a04426','#ba5c32','#d27842'],['#46300e','#624414','#7e5a1a','#9a7222','#b48a2c','#c8a03c']], broad:[['#1e2a10','#2a3814','#36461a','#445622','#56682c','#6c7e3a']]},
    tk:['#26160a','#402a18','#5a4024'], ol:'#120804', pb:['#9a948a','#726c62'],
    dg:[['leaf',3.2],['blade',0.8],['twig',0.9],['pebble',0.4],['flower',0.2]], ds:[['pebble',1],['leaf',0.8],['ripple',0.6]], dt:[['foot',1.2],['leaf',1.2],['pebble',0.6]],
    dr:[['log',1.2],['shroom',1],['stump',1]], rk:'mossy', hb:'berry', ru:'moss',
    wat:['#2a6278','#5898ae','#6eb2a6','#3a8094','#1e526c'] },
  atoll:{ g:['#9c8a60','#ae9c70','#bfad80','#c9b88a','#d4c496','#eadcb6'], u:['#0e2a24','#13332c','#193d35'], p:['#8a7852','#98865c','#a69466','#b4a272','#c2b080'], sd:['#9c8a60','#ae9c70','#bfad80','#c9b88a','#d4c496'],
    fl:['#f08aa0','#fff0f4','#9ad8e8'], tr:[['palm',0.62],['coral',0.18],['scrub',0.2]], tc:12,
    cr:{palm:[['#133a26','#1c4e30','#28663a','#387e46','#4e9852','#6cb264'],['#173e22','#22522c','#2e6a36','#408440','#589e4e','#76b862']], coral:[['#7a4a4c','#9a6262','#ba7e78','#d49c90','#e8bcac','#f6dccc']], scrub:[['#173226','#1f3e2e','#294c36','#355c40','#466e4c','#5a825a']]},
    tk:['#44301c','#644a2c','#846840'], ol:'#0a1812', pb:['#e8ddd0','#c4b4a0'],
    dg:[['shell',1],['ripple',1.4],['pebble',0.5],['twig',0.3]], ds:[['shell',1],['ripple',1.4],['pebble',0.5]], dt:[['foot',1.6],['shell',0.4]],
    dr:[['shells',1.6],['driftwood',1],['coralbit',1]], rk:'coral', hb:'seagrape', ru:'coral',
    wat:['#1e7890','#5cc0d0','#7ad6c6','#2e98aa','#156680'] },
  meadow:{ g:['#4a6e2a','#587e30','#689037','#6f993c','#78a444','#98bf5c'], u:['#0c1d10','#112616','#17301c'], p:['#5a4c32','#68583a','#766442','#84704c','#96825a'], sd:['#98885e','#ac9c6e','#bead7e','#ccbc8c','#dccc9e'],
    fl:['#f08aa6','#f4f4ff','#b49aff','#f0967a'], tr:[['orchard',0.6],['broad',0.4]], tc:13,
    cr:{orchard:[['#173e1e','#1f4c26','#2a5e30','#387440','#4c8c50','#66a664']], broad:[['#143a1c','#1c4824','#275a2c','#346e38','#4a864a','#62a05c']]},
    tk:['#34261a','#503a26','#6c5236'], ol:'#08140a', pb:['#aeb0a4','#86887c'],
    dg:[['flower',2.2],['blade',2],['tuft',1.4],['clover',1.2],['pebble',0.3]], ds:[['pebble',1],['ripple',0.8],['shell',0.3]], dt:[['foot',1.3],['pebble',0.8],['flower',0.3]],
    dr:[['fbush',2],['stump',0.6],['log',0.6]], rk:'mossy', hb:'blossom', ru:'marble',
    wat:['#2a6c86','#5aa6c0','#6fc0b8','#3a8aa0','#1e5a78'] },
  boulder:{ g:['#3a4448','#465256','#525e64','#58666c','#627078','#80909a'], u:['#11140f','#171a14','#1d211a'], p:['#4a4840','#56544a','#626056','#6e6c60','#807e70'], sd:['#646458','#747468','#848478','#949488','#a6a698'],
    fl:['#d8dcd0','#b8a6d8','#e8b0a0'], tr:[['boulder',0.55],['scrub',0.3],['gnarl',0.15]], tc:12,
    cr:{boulder:[['#2e302e','#444642','#5a5c56','#72746c','#8e9086','#aeb0a6'],['#34322e','#4a4640','#605c54','#78736a','#948e84','#b2aca0']], scrub:[['#1a2618','#223220','#2c3e28','#384c32','#465c3e','#58704c']], gnarl:[['#121c16','#1a261e','#223228','#2c3e32','#3a4e40','#4c6250']]},
    tk:['#2a221a','#3e3428','#544838'], ol:'#0a0c08', pb:['#a4a69c','#7c7e74'],
    dg:[['pebble',2.2],['moss',1.3],['blade',0.6],['tuft',0.5],['crack',0.5]], ds:[['pebble',2.4]], dt:[['foot',1],['pebble',1.8]],
    dr:[['rocks',2],['fern',0.4]], rk:'granite', hb:'thyme', ru:'granite',
    wat:['#2a5e76','#5894aa','#6aa6a4','#367a90','#1c4c66'] },
  frost:{ g:['#7c92a8','#93a8bc','#aabccd','#b8c7d6','#c5d3e0','#e4eef7'], u:['#16222e','#1c2a38','#243444'], p:['#7a889a','#8694a6','#92a0b0','#9eacba','#acb8c6'], sd:['#687482','#7a8694','#8c98a4','#9ea8b4','#b0bac4'],
    fl:['#c8e4ff','#e8e0ff','#ffffff'], tr:[['spine',0.86],['boulder',0.14]], tc:11.5,
    cr:{spine:[['#0e1e26','#152a32','#1d3840','#28484e','#385c60','#4c7274'],['#101c28','#172834','#1f3442','#2a4452','#3a5866','#4e6e7a']], boulder:[['#44505c','#5a6672','#707c88','#8a96a0','#a8b2bc','#dce6ee']]},
    tk:['#26262a','#3a3a40','#525258'], ol:'#08101a', pb:['#707c88','#56626e'],
    dg:[['sparkle',1],['drift',1.3],['pebble',0.35],['twig',0.08]], ds:[['pebble',1.4],['sparkle',0.6]], dt:[['foot',1.6],['sparkle',0.4]],
    dr:[['snowmound',1.6],['log',0.6],['rocks',0.8]], rk:'icerime', hb:'snowbell', ru:'icestone',
    wat:['#24566e','#6aa4c0','#7ab8c6','#34768e','#183e58'], ice:['#4a7ea8','#78acd2','#98c8e8','#b0daf2','#dcf2ff'] },
  scorch:{ g:['#363432','#43403d','#504c48','#57534f','#5f5b56','#79736b'], u:['#100e0e','#161312','#1d1917'], p:['#2e2624','#3a302c','#463a34','#50433c','#5e4f46'], sd:['#2a2826','#343230','#403d3a','#4a4643','#57524e'],
    fl:['#ff6a3a','#e84848','#ffb08a'], tr:[['char',0.42],['obsid',0.36],['snag',0.22]], tc:11,
    cr:{char:[['#0c0a09','#171311','#221c18','#2e2520','#3c3029','#4e3f34'],['#0e0b0b','#1a1414','#261d1c','#342826','#443430','#58443c']], snag:[['#0e0a0a','#18120f','#241c18','#322822','#44362c','#5a4838']], obsid:[['#0c0812','#181224','#261e36','#3a3050','#6a5c90','#b4a6dc'],['#100a0c','#1e1418','#2e2026','#44323a','#7a5a68','#c4a0b0']]},
    tk:['#141010','#241c18','#382c24'], ol:'#040303', pb:['#6a6460','#4c4744'],
    dg:[['ash',2],['ember',0.1],['crack',0.8],['pebble',0.9]], ds:[['ash',1.2],['pebble',1]], dt:[['foot',1],['ash',1],['crack',0.4]],
    dr:[['bones',0.8],['obsbit',1.2],['charlog',1]], rk:'obsidian', hb:'firebloom', ru:'basalt',
    wat:['#1e2a32','#4e6270','#3e505a','#2a3a44','#18242c'], rim:[217,201,166,140] },
  crystal:{ g:['#1e3840','#26444c','#2f5059','#355861','#3c6069','#548088'], u:['#080e16','#0c141e','#111a28'], p:['#2a3244','#323b50','#3c465c','#465068','#545e76'], sd:['#384254','#444e62','#505a70','#5c667c','#6a748a'],
    fl:['#8de9ff','#c9a6ff','#ffffff'], tr:[['spire',0.45],['conifer',0.55]], tc:11.5,
    cr:{spire:[['#12204a','#1e3a7a','#2e58a8','#4e8ad4','#7cc8f2','#d6f8ff'],['#20144a','#34207a','#5034a8','#7a5ad4','#aa8cf0','#ecdcff']], conifer:[['#08121a','#0d1a24','#132430','#1b303e','#284050','#385464']]},
    tk:['#161620','#24242e','#34343e'], ol:'#03050a', pb:['#6a7486','#4c5566'],
    dg:[['grit',1.5],['sparkle',0.7],['pebble',0.8],['blade',0.7],['shroom',0.25]], ds:[['grit',1.4],['pebble',1]], dt:[['foot',1],['grit',0.8]],
    dr:[['crybit',1.6],['glowcap',1.2]], rk:'crystal', hb:'glowcap', ru:'crystone',
    wat:['#1a2a58','#5a7ad0','#4a6ab0','#26408a','#121e48'], rim:[159,216,255,118] },
  // ---- the newer shores (w1) ----
  dunes:{ g:['#7a5a32','#8e6a3c','#a27c48','#b08a52','#bc965c','#d8b67a'], u:['#3a2414','#4a2e1a','#5a3a22'], p:['#8a6a40','#96764a','#a28254','#ae8e5e','#c0a070'], sd:['#9a7c4c','#aa8a58','#ba9a66','#c8a872','#d8b882'],
    fl:['#e84a6a','#ffb04a','#f0e0c0'], tr:[['mesa',0.42],['datepalm',0.33],['cactus',0.25]], tc:13,
    cr:{mesa:[['#3a2014','#5a3220','#7a4a2e','#9a623c','#ba7e50','#d8a070'],['#40241a','#623826','#845034','#a66a44','#c48658','#e0a878']], datepalm:[['#1e2a10','#2e3e16','#42561e','#5a7028','#768a34','#94a444'],['#26280e','#383c14','#4e541c','#686e26','#848a32','#a2a642']], cactus:[['#12281a','#1c3a24','#285030','#36683c','#4a8248','#66a05a'],['#162a16','#223e20','#30542a','#406c34','#548640','#70a450']]},
    tk:['#3e2a18','#5e4228','#7e5a38'], ol:'#140a04', pb:['#c0a078','#8a7050'],
    dg:[['dune',2.6],['pebble',0.7],['twig',0.25],['bone',0.1],['flower',0.08]], ds:[['dune',2],['pebble',1],['shell',0.2]], dt:[['foot',1.6],['pebble',0.8]],
    dr:[['bones',1.2],['rocks',1.4],['driftwood',0.5]], rk:'sandstone', hb:'desertrose', ru:'sandstone',
    wat:['#1e6a7a','#5ab0b8','#7ac8b8','#2e8a94','#145a6a'] },
  swamp:{ g:['#243222','#2c3c26','#34462c','#3a4e30','#425836','#5e764a'], u:['#0b1210','#0f1a16','#14221c'], p:['#3a2e1e','#463824','#52422a','#5e4c30','#6e5a3a'], sd:['#3e3a26','#4a4630','#56523a','#625e44','#706c50'],
    fl:['#f4f0e0','#e8d86a','#c8a0e0'], tr:[['mangrove',0.55],['cypress',0.45]], tc:12,
    cr:{mangrove:[['#0c1e10','#143018','#1e4222','#2a562c','#3a6e38','#528a4a'],['#101e12','#18301a','#224024','#2e5430','#3e6a3c','#56844e']], cypress:[['#0e1c18','#162a22','#20382e','#2c4a3a','#3c5e48','#52765a'],['#121c14','#1c2c1e','#283c28','#364e34','#486444','#607c58']]},
    tk:['#1e1810','#2e261a','#443a28'], ol:'#060a06', pb:['#6a6a58','#4e4e40'],
    dg:[['blade',1.6],['tuft',1.3],['moss',1.2],['mud',1],['reed',0.6],['flower',0.2]], ds:[['mud',1.4],['reed',1],['ripple',0.6]], dt:[['foot',1.2],['mud',1]],
    dr:[['reeds',1.6],['log',1.2],['shroom',0.8],['stump',0.6]], rk:'mossy', hb:'bogstar', ru:'moss',
    wat:['#1e3228','#3e5a44','#4e6a4a','#2a4436','#142420'], bog:['#142622','#1a302a','#223a32','#4a4a2e','#5a5a36','#7a9a88'], rim:[200,224,160,110] },
  bamboo:{ g:['#2a4a1e','#335a24','#3c6a2a','#42742e','#4a7e34','#6a9e4a'], u:['#0c160a','#10200e','#162a12'], p:['#4a3e26','#56482c','#625234','#6e5c3c','#806c48'], sd:['#8a7e56','#9e9064','#b0a272','#beb080','#ccbe90'],
    fl:['#f4f4f4','#f8c8d8','#e8e070'], tr:[['bamboo',0.84],['broad',0.16]], tc:9.5,
    cr:{bamboo:[['#10280c','#1a3a14','#28521c','#3a6e26','#5a8e34','#8ab84e'],['#16280a','#223a10','#325216','#466c1e','#62882a','#94b446']], broad:[['#10300e','#183e14','#224e1a','#2e6222','#407a2e','#58943c']]},
    tk:['#2e2414','#4a3a20','#665030'], ol:'#081006', pb:['#9a9a8c','#76766a'],
    dg:[['bleaf',2.4],['blade',1.6],['tuft',1],['pebble',0.5],['flower',0.2]], ds:[['pebble',1],['ripple',0.8],['bleaf',0.6]], dt:[['foot',1.2],['bleaf',1.2]],
    dr:[['bstump',1.4],['fern',1.4],['rocks',0.6]], rk:'mossy', hb:'ginseng', ru:'jade',
    wat:['#2a6c7a','#5aa6b0','#6fc0a8','#3a8a94','#1e5a6a'] },
  mushroom:{ dd:0.62, g:['#24212d','#2c2837','#342f41','#3a3448','#413a50','#5e5674'], u:['#0e0a14','#140e1c','#1a1424'], p:['#3a3040','#463a4c','#524458','#5e4e64','#6e5e74'], sd:['#5a5060','#6a5e70','#7a6e80','#8a7e90','#9a90a0'],
    fl:['#8de9ff','#ff8ad8','#e8ff8a'], tr:[['gshroom',1]], tc:13,
    cr:{gshroom:[['#3a0c10','#6a1a1c','#9a2a26','#c43e30','#e0604a','#f49a7a'],['#2a1430','#44224a','#5e3466','#7a4a82','#9a6aa2','#c49ac8'],['#162a30','#224048','#30565e','#427076','#5e8e92','#90b8b8']]},
    tk:['#8a8070','#c8bca8','#ece4d4'], ol:'#0a0610', pb:['#8a8290','#686070'],
    dg:[['moss2',1.4],['spore',0.45],['shroom',0.3],['blade',0.6],['pebble',0.7]], ds:[['spore',0.4],['pebble',1]], dt:[['foot',1],['spore',0.3]],
    dr:[['glowcap',1.6],['shroom',1.4],['log',0.6]], rk:'granite', hb:'puffcap', ru:'crystone',
    wat:['#2a1e4a','#5a4a9a','#6a5ab0','#3a2e6a','#1a1236'], rim:[222,196,255,110] },
  volcanic:{ g:['#1e1a1a','#282322','#322c2a','#383130','#403836','#5e544e'], u:['#0a0808','#100c0c','#161110'], p:['#2a2220','#342a26','#3e322c','#483a32','#56463c'], sd:['#141414','#1c1c1c','#262524','#302e2c','#3c3a38'],
    fl:['#ff6a2a','#ffb040','#ff4a4a'], tr:[['basalt',0.36],['ashtree',0.64]], tc:12.5,
    cr:{basalt:[['#0a0a0c','#16161a','#222228','#303038','#44444c','#62626a'],['#0c0a0a','#181414','#262020','#342c2c','#484040','#665c5a']], ashtree:[['#161412','#24211e','#34302c','#48423c','#605850','#7e766c']]},
    tk:['#141010','#241c18','#382c24'], ol:'#040303', pb:['#4a4644','#343030'],
    dg:[['ash',2],['ember',0.22],['crack',1],['pebble',0.8]], ds:[['ash',1.2],['pebble',1],['ember',0.1]], dt:[['foot',1],['ash',1]],
    dr:[['obsbit',1.2],['charlog',0.8],['rocks',1.2],['bones',0.4]], rk:'basalt', hb:'firebloom', ru:'basalt',
    wat:['#1e2a32','#4e6270','#3e505a','#2a3a44','#18242c'], lava:['#3a0a04','#8a200a','#e0501a','#ff9a30','#ffd870','#fff4c8'], rim:[217,201,166,140] } };
const BAY4=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
function bayV(x,y){ return (BAY4[((y&3)<<2)|(x&3)]+0.5)/16-0.5; }                                  // the 4×4 ordered dither, −.5….5, on GLOBAL texels (seamless across chunks)
function cI(h){ const v=parseInt(h.slice(1,7),16); return ((255<<24)|((v&255)<<16)|(v&0xff00)|((v>>16)&255))>>>0; }   // '#rrggbb' → an ImageData word (little-endian ABGR)
function cIA(h,a){ const v=parseInt(h.slice(1,7),16); return ((Math.round(clamp(a,0,1)*255)<<24)|((v&255)<<16)|(v&0xff00)|((v>>16)&255))>>>0; }
const cIR=A=>A.map(cI);
/* ---- the pixel painter: sprites painted texel by texel (crisp at any scale), then the dark SNES line round them ---- */
function PS(w,h){ w=Math.max(1,Math.ceil(w)); h=Math.max(1,Math.ceil(h)); return {w,h,d:new Uint32Array(w*h)}; }
function psP(S,x,y,c){ x=Math.floor(x); y=Math.floor(y); if(x>=0&&y>=0&&x<S.w&&y<S.h) S.d[y*S.w+x]=c; }
function psG(S,x,y){ x=Math.floor(x); y=Math.floor(y); return (x>=0&&y>=0&&x<S.w&&y<S.h) ? S.d[y*S.w+x] : 0; }
function psOut(S,c,diag){ const w=S.w,h=S.h,d=S.d,o=[];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=y*w+x; if(d[i]) continue;
    if((x>0&&d[i-1])||(x<w-1&&d[i+1])||(y>0&&d[i-w])||(y<h-1&&d[i+w])||(diag&&((x>0&&y>0&&d[i-w-1])||(x<w-1&&y>0&&d[i-w+1])||(x>0&&y<h-1&&d[i+w-1])||(x<w-1&&y<h-1&&d[i+w+1])))) o.push(i); }
  for(const i of o) d[i]=c; return S; }
function psCv(S,ax,ay){ const c=document.createElement('canvas'); c.width=S.w; c.height=S.h; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(S.d.buffer),S.w,S.h),0,0); return {cv:c, ax:Math.round(ax), ay:Math.round(ay), w:S.w, h:S.h}; }
function psLine(S,x0,y0,x1,y1,c,w){ w=w||1; const n=Math.max(1,Math.ceil(Math.max(Math.abs(x1-x0),Math.abs(y1-y0))*1.5));
  for(let i=0;i<=n;i++){ const t=i/n, x=x0+(x1-x0)*t, y=y0+(y1-y0)*t; for(let q=0;q<w;q++) psP(S,x-(w>>1)+q,y,c); } }
function psDisc(S,cx,cy,rx,ry,fn){ for(let y=Math.floor(cy-ry-1);y<=Math.ceil(cy+ry+1);y++) for(let x=Math.floor(cx-rx-1);x<=Math.ceil(cx+rx+1);x++){   // fn(nx,ny,x,y) → a colour (0 = skip) for each texel inside the ellipse
    const nx=(x+0.5-cx)/rx, ny=(y+0.5-cy)/ry; if(nx*nx+ny*ny>1) continue; const c=fn(nx,ny,x,y); if(c) psP(S,x,y,c); } }
function psPoly(S,P,fn){ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const p of P){ x0=Math.min(x0,p[0]); y0=Math.min(y0,p[1]); x1=Math.max(x1,p[0]); y1=Math.max(y1,p[1]); }   // a filled polygon (fn(x,y) → colour)
  for(let y=Math.floor(y0);y<=Math.ceil(y1);y++) for(let x=Math.floor(x0);x<=Math.ceil(x1);x++){ const px=x+0.5, py=y+0.5; let inn=false;
    for(let i=0,j=P.length-1;i<P.length;j=i++){ const a=P[i], b=P[j]; if(((a[1]>py)!==(b[1]>py)) && px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0]) inn=!inn; }
    if(inn){ const c=fn(x,y); if(c) psP(S,x,y,c); } } }
/* a leafy (or rocky) ball: lit from the top-left, its own lower rim shaded, the whole crown lit as one (g=[cx,cy,R]) — rag roughens the silhouette, tex the leaf clumps */
function psBall(S,cx,cy,rx,ry,R,g,sd,rag,tex){ const n=R.length; rag=rag==null?1:rag; tex=tex==null?0.9:tex;
  for(let y=Math.floor(cy-ry-1);y<=Math.ceil(cy+ry+1);y++) for(let x=Math.floor(cx-rx-1);x<=Math.ceil(cx+rx+1);x++){
    const nx=(x+0.5-cx)/rx, ny=(y+0.5-cy)/ry, q=nx*nx+ny*ny, e=1-hash2(x*7+sd,y*13-sd)*rag*1.1/Math.max(2,Math.min(rx,ry));
    if(q>e*e) continue;
    const loc=-(nx*0.6+ny*0.8), glo=g?-((x+0.5-g[0])*0.6+(y+0.5-g[1])*0.8)/g[2]:0, t=hash2((x>>1)*5+sd*3,(y>>1)*7+sd)-0.5;
    let v=(n-1)*0.44+loc*1.25+glo*0.95+t*tex+bayV(x,y)*0.6; if(q>0.6 && ny>0.2) v-=1;
    psP(S,x,y,R[clamp(Math.floor(v),0,n-1)]); } }
/* ---- the trees & rock of the forest wall (R = crown radius in texels, C = its ramp [6 ints], tk trunk ramp, sd a seed) ---- */
function trBroad(R,C,tk,sd,o){ const th=Math.max(2,Math.round(R*0.5)), w=Math.ceil(R*2.4)+6, h=Math.ceil(R*2.05)+th+5, S=PS(w,h), bx=w>>1, by=h-3, cx=bx+(hash2(sd,2)-0.5)*1.5, cy=by-th-R*0.92;
  const tw=Math.max(2,Math.round(R*0.26)); for(let y=Math.round(cy+R*0.4);y<=by;y++) for(let i=0;i<tw;i++) psP(S,bx-(tw>>1)+i,y, i===0?tk[2]:y>=by?tk[0]:tk[1]);   // the trunk, lit on its left
  psP(S,bx-(tw>>1)-1,by,tk[0]); psP(S,bx-(tw>>1)+tw,by,tk[0]);                                                                     // root flare
  const n=5+(sd%3), cl=[[cx,cy-R*0.12,R*0.64]];
  for(let i=0;i<n;i++){ const a=i/n*TAU+sd*0.9, d=R*(0.4+hash2(sd,i+9)*0.1); cl.push([cx+Math.cos(a)*d*1.05, cy+Math.sin(a)*d*0.82, R*(0.4+hash2(sd,i)*0.14)]); }
  cl.sort((a,b)=>a[1]-b[1]); for(let i=0;i<cl.length;i++){ const c=cl[i]; psBall(S,c[0],c[1],c[2],c[2]*0.94,C,[cx,cy,R],sd*13+i,1,0.9); }
  if(o && o.ash){ const A2=cIR(['#5e5650','#80766c']), ys=Math.round(cy+R*0.55); for(let y=0;y<ys;y++) for(let x=1;x<w;x++){ if(!psG(S,x,y) || y===0) continue; if(!psG(S,x-1,y) || !psG(S,x,y-1)) psP(S,x,y,A2[(x+y)&1?1:0]); } }   // a charred crown's lit ash-grey edge (top-left)
  if(o && o.dots){ for(let i=0;i<o.n;i++){ const a=hash2(sd*3+i,5)*TAU, d=Math.sqrt(hash2(sd*7+i,11))*R*0.78, x=cx+Math.cos(a)*d, y=cy+Math.sin(a)*d*0.85; if(!psG(S,x,y)) continue;   // fruit / blossom
      const c=o.dots[i%o.dots.length]; psP(S,x,y,c); if(o.big) psP(S,x+1,y,c); if(psG(S,x,y+1)) psP(S,x,y+1,C[1]); } }
  return psCv(psOut(S,o&&o.ol||C[0],false),bx,by); }
function trPalm(R,C,tk,sd,ol){ const H=Math.round(R*1.55), lean=(hash2(sd,3)-0.5)*R*0.9, w=Math.ceil(R*2.8)+Math.ceil(Math.abs(lean))+6, h=Math.ceil(R*1.5)+H+6, S=PS(w,h), bx=Math.round(w/2-lean/2), by=h-3, cx=bx+lean, cy=by-H;
  for(let i=0;i<=H;i++){ const t=i/H, x=Math.round(bx+lean*t*t), y=by-i, ring=((i+(sd&1))>>1)&1;                                  // the ringed trunk, bowing
    psP(S,x,y,ring?tk[1]:tk[2]); psP(S,x+1,y,ring?tk[0]:tk[1]); if(i<2) psP(S,x-1,y,tk[0]); }
  const nf=7, fr=[]; for(let k=0;k<nf;k++) fr.push(-Math.PI/2+(k-(nf-1)/2)*(Math.PI*1.95/nf)+(hash2(sd,k+20)-0.5)*0.35);
  fr.sort((a,b)=>Math.sin(a)-Math.sin(b));                                                                                            // the fronds reaching away first, the drooping ones over them
  for(let f=0;f<fr.length;f++){ const a=fr[f], L=R*(1.02+hash2(sd,f+40)*0.34), ca=Math.cos(a), sa=Math.sin(a), px=-sa, py=ca;
    for(let t=0;t<=1.0001;t+=0.5/L){ const x=cx+ca*L*t, y=cy+sa*L*t*0.78+L*0.42*t*t, wd=(1-t)*R*0.3+0.7;
      for(let q=-wd;q<=wd;q+=0.5){ if(Math.abs(q)>0.8 && hash2(Math.round(x*3+q*5)+sd,Math.round(y*3))<0.28) continue;   // feathered leaflets
        const lit=(px*q)*(-0.6)+(py*q)*(-0.8)>0, c=Math.abs(q)<0.7?C[4]:lit?C[3]:t>0.75?C[1]:C[2]; psP(S,x+px*q,y+py*q*0.8,c); } } }
  { const K1=cI('#5a3a1c'), K2=cI('#3a2410'); psP(S,cx-1,cy+1,K1); psP(S,cx,cy+2,K2); psP(S,cx+1,cy+1,K1); }                           // coconuts
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trAcacia(R,C,tk,sd,ol){ const th=Math.round(R*0.95), w=Math.ceil(R*3.1)+6, h=Math.ceil(R*1.1)+th+6, S=PS(w,h), bx=w>>1, by=h-3, cy=by-th-R*0.28, cx=bx+(hash2(sd,4)-0.5)*2;
  psLine(S,bx,by,bx,by-th*0.5,tk[1],2); psLine(S,bx,by-th*0.5,cx-R*0.62,cy+R*0.15,tk[1],1); psLine(S,bx+1,by-th*0.5,cx+R*0.58,cy+R*0.12,tk[2],1); psLine(S,bx,by-th*0.5,cx,cy+R*0.2,tk[0],1);   // the forked trunk
  const n=6, cl=[]; for(let i=0;i<n;i++){ const t=i/(n-1)-0.5; cl.push([cx+t*R*2.3, cy+(Math.abs(t)*R*0.25)+(hash2(sd,i)-0.5)*R*0.2, R*(0.46+hash2(sd,i+7)*0.1)]); }
  cl.push([cx,cy-R*0.2,R*0.55]); cl.sort((a,b)=>a[1]-b[1]);
  for(let i=0;i<cl.length;i++){ const c=cl[i]; psBall(S,c[0],c[1],c[2]*1.15,c[2]*0.55,C,[cx,cy,R*1.3],sd*7+i,1.2,0.8); }                    // the flat umbrella crown
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trPine(R,C,tk,sd,snow,ol){ const H=Math.round(R*2.5), w=Math.ceil(R*2.3)+6, h=H+Math.round(R*0.45)+6, S=PS(w,h), bx=w>>1, by=h-3, top=by-Math.round(R*0.4)-H, nT=3+(sd&1);
  for(let y=by-Math.round(R*0.5);y<=by;y++){ psP(S,bx-1,y,tk[2]); psP(S,bx,y,tk[1]); }                                                  // the trunk stub under the skirts
  const SW=snow?cIR(['#9fb4c6','#c4d4e2','#e2ecf4','#ffffff']):null;
  for(let k=0;k<nT;k++){ const tt=top+H*k/nT*0.8, tH=H*(0.34+0.1*k/nT), mw=R*(0.42+0.62*(k+1)/nT);
    for(let y=Math.floor(tt);y<tt+tH;y++){ const f=(y-tt)/tH;
      for(let x=Math.floor(bx-mw-1);x<=bx+mw+1;x++){ const jag=(hash2(x+sd*3,y*7+k)-0.5)*(snow?0.7:1.6), hw=mw*f+jag*f; if(Math.abs(x+0.5-bx)>hw) continue;
        const side=(x+0.5-bx)/Math.max(1,mw), rel=(x+0.5-bx)/Math.max(1,hw); let v=2.6-side*1.3+(f<0.3?0.6:0)-(f>0.84?1.4:0)+bayV(x,y)*(SW?0.2:0.8)+(hash2(x*5+sd,y*3)-0.5)*(SW?0.1:0.6);
        let c=C[clamp(Math.floor(v),0,4)];
        if(SW){ if(f<0.5) c=SW[clamp(Math.floor(3.1-Math.max(0,rel)*0.9-f*1.6),0,3)];                               // PROJECT PX (from TG1): snow is each tier's whole upper half — one clean white cap (paler on the lit side)
          else if(f<0.62) c=C[0]; }                                                                                  // over a dark hem, then the boughs: no per-texel chevrons (they read as static at this size)
        psP(S,x,y,c); } } }
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trGnarl(R,C,tk,sd,ol){ const H=Math.round(R*2.1), w=Math.ceil(R*2.4)+6, h=H+Math.round(R*0.5)+6, S=PS(w,h), bx=w>>1, by=h-3, lean=(hash2(sd,1)-0.5)*R*0.8;
  for(let i=0;i<H*0.8;i++){ const t=i/(H*0.8), x=Math.round(bx+Math.sin(t*3+sd)*1.2+lean*t), y=by-i; psP(S,x,y,tk[1]); psP(S,x-1,y,tk[2]); }   // a twisted trunk
  const n=3+(sd%2); for(let k=0;k<n;k++){ const t=0.35+k/n*0.6, y=by-H*t, x=bx+lean*t+(k&1?1:-1)*R*(0.25+hash2(sd,k)*0.3);
    psBall(S,x,y,R*(0.62-k*0.08)*1.2,R*(0.48-k*0.05),C,[bx,by-H*0.6,R*1.2],sd*5+k,1.4,1); }                                          // wind-bent clumps
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trHeather(R,C,tk,sd,ol){ const w=Math.ceil(R*2.3)+6, h=Math.ceil(R*1.5)+6, S=PS(w,h), bx=w>>1, by=h-3, cx=bx, cy=by-R*0.55, P=cIR(['#6a3c86','#8a52a8','#aa6cc6','#cc92dc']);
  for(let i=0;i<4;i++) psBall(S,cx+(i-1.5)*R*0.42,cy+(i&1?-R*0.1:R*0.05),R*0.55,R*0.45,C,[cx,cy,R],sd*3+i,1.4,1);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ if(!psG(S,x,y)) continue; const hh=hash2(x*9+sd,y*5); if(hh<0.3) psP(S,x,y,P[clamp(Math.floor(hh*10+(y<cy?1.2:0)+bayV(x,y)),0,3)]); }   // the purple bloom
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trGrass(R,C,tk,sd,ol){ const w=Math.ceil(R*2.6)+6, h=Math.ceil(R*2.1)+6, S=PS(w,h), bx=w>>1, by=h-3, n=7+(sd%4), cl=[bx-R*0.45+(hash2(sd,1)-0.5)*R*0.4, bx+R*0.4+(hash2(sd,2)-0.5)*R*0.4];
  const bl=[]; for(let i=0;i<n;i++){ const c0=cl[i&1], sp=(hash2(sd,i)-0.5)*R*0.9; bl.push([c0+sp, R*(0.55+hash2(sd,i+30)*1.35), sp*0.9+(hash2(sd,i+60)-0.5)*R*0.9, Math.floor(hash2(sd,i+90)*2)-1]); }   // two clumps, each a fan: height & lean vary blade to blade
  bl.sort((a,b)=>b[1]-a[1]);
  for(const b of bl){ const L=b[1]; for(let t=0;t<=1;t+=0.5/L){ const x=b[0]+b[2]*t*t, y=by-L*t; psP(S,x,y,C[clamp(Math.floor(1+t*3.6+b[3]*0.7+bayV(Math.round(x),Math.round(y))*0.6),0,5)]); if(t<0.4) psP(S,x+1,y,C[clamp(Math.floor(t*3.6+b[3]*0.5),0,5)]); } }   // tall dry blades, dark at the root, pale at the tip
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trScrub(R,C,tk,sd,ol){ const w=Math.ceil(R*1.9)+6, h=Math.ceil(R*1.4)+6, S=PS(w,h), bx=w>>1, by=h-3, cy=by-R*0.55;
  psBall(S,bx-R*0.3,cy,R*0.55,R*0.45,C,[bx,cy,R],sd,1.3,1); psBall(S,bx+R*0.28,cy+R*0.05,R*0.55,R*0.42,C,[bx,cy,R],sd+1,1.3,1); psBall(S,bx,cy-R*0.2,R*0.5,R*0.42,C,[bx,cy,R],sd+2,1.3,1);
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trBoulder(R,C,tk,sd,o){ const w=Math.ceil(R*2.3)+6, h=Math.ceil(R*1.9)+6, S=PS(w,h), bx=w>>1, by=h-3, cx=bx, cy=by-R*0.78, rx=R*(0.92+hash2(sd,1)*0.2), ry=R*0.78, ph=hash2(sd,2)*TAU;
  const M2=o&&o.moss?cIR(['#34502a','#46663a','#5a7e46']):null, SN=o&&o.snow?cIR(['#c4d2de','#e0eaf2','#ffffff']):null;
  psDisc(S,cx,cy,rx,ry,(nx,ny,x,y)=>{ const fa=Math.floor(((Math.atan2(ny,nx)+ph+TAU)%TAU)/TAU*6), fl=hash2(sd*5+fa,3)-0.5, l=-(nx*0.62+ny*0.78);   // flat-faced facets, lit top-left
    let v=2.2+l*1.75+fl*1.25+bayV(x,y)*0.55-(ny>0.55?1:0); if(nx*nx+ny*ny>0.8 && ny>0.1) v-=0.6;
    if(o && o.strata && ((y+sd)%3===0)) v-=0.8; if(o && o.speck && hash2(x*11+sd,y*5)<0.1) v+=hash2(x,y*9)<0.5?1.2:-1.2;   // sandstone's bands · granite's speckle
    if(SN && ny<-0.18+hash2(x,y*3)*0.25) return SN[clamp(Math.floor(1.4+l+bayV(x,y)),0,2)];
    if(M2 && ny<-0.25 && hash2(x*3+sd,y*7)<0.55) return M2[clamp(Math.floor(1+l+bayV(x,y)*0.8),0,2)];
    return C[clamp(Math.floor(v),0,5)]; });
  if(hash2(sd,9)<0.6) psLine(S,cx-rx*0.2,cy-ry*0.1,cx+rx*0.15,cy+ry*0.35,C[0],1);                                                     // a crack
  if(o && o.vein) psVein(S,o.vein,sd);
  return psCv(psOut(S,o&&o.ol||C[0],false),bx,by); }
/* (C7a) ORE SEAMS: a rock shows its tier before it breaks (§7.3's colours: copper · iron · silver · cobalt · star-iron · deepsteel) — 4 short seams on its
   inner texels (never the rim, so the outline stays), each with a lit fleck; star-iron speckles, deepsteel glints violet */
function psVein(S,hex,sd){ const w=S.w, h=S.h, d=S.d, inn=[], v=parseInt(hex.slice(1,7),16), r=v>>16, g=(v>>8)&255, b=v&255, lt=k=>'#'+[r,g,b].map(q=>Math.round(q+(255-q)*k).toString(16).padStart(2,'0')).join('');
  const C0=cI(hex), C1=cI(lt(0.55));
  for(let y=2;y<h-2;y++) for(let x=2;x<w-2;x++){ const k=y*w+x; if(d[k] && d[k-1] && d[k+1] && d[k-w] && d[k+w] && d[k-w-1] && d[k+w+1]) inn.push(k); }
  if(!inn.length) return;
  for(let s=0;s<4;s++){ let k=inn[Math.floor(hash2(sd*7+s,31)*inn.length)]; const dx=hash2(sd,s+40)<0.5?1:-1, n=2+Math.floor(hash2(sd,s+50)*3);
    for(let i=0;i<n;i++){ if(!d[k] || !d[k+1] || !d[k-1] || !d[k+w] || !d[k-w]) break; d[k]=i===0?C1:C0; k+=w+(i%2?dx:0); } } }
function trCoral(R,C,tk,sd,ol,vn){ const w=Math.ceil(R*2.2)+6, h=Math.ceil(R*1.9)+6, S=PS(w,h), bx=w>>1, by=h-3, cy=by-R*0.6;
  psDisc(S,bx,cy,R*0.9,R*0.62,(nx,ny,x,y)=>{ const l=-(nx*0.6+ny*0.8); if(hash2(x*5+sd,y*3)<0.12) return C[1]; return C[clamp(Math.floor(2.3+l*1.4+bayV(x,y)*0.7),0,5)]; });   // porous coral rock
  for(let k=0;k<3;k++){ const x0=bx+(k-1)*R*0.5, y0=cy-R*0.3; let x=x0, y=y0; for(let i=0;i<R*0.8;i++){ x+=(hash2(sd+k,i)-0.5)*1.2; y-=0.8; psP(S,x,y,C[4]); psP(S,x+1,y,C[3]); } }   // branching fingers
  if(vn) psVein(S,vn,sd);                                                                                       // (C7a: a node's ore seams)
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trSnag(R,C,tk,sd,ol){ const H=Math.round(R*2.3), w=Math.ceil(R*2.4)+6, h=H+6, S=PS(w,h), bx=w>>1, by=h-3, E=cIR(['#8a2a10','#e0601c','#ffa040']);   // a burnt-out tree: a charred trunk, bare forked branches, a coal or two
  for(let i=0;i<H;i++){ const t=i/H, wd=t<0.25?3:t<0.75?2:1; for(let q=0;q<wd;q++) psP(S,bx-1+q,by-i,q===0?C[4]:q===wd-1?C[1]:C[2]); }
  const nb=3+(sd%2); for(let k=0;k<nb;k++){ const t=0.35+k*0.17, sg=k&1?1:-1, x0=bx, y0=by-H*t, L=R*(0.5+hash2(sd,k)*0.5), x1=x0+sg*L, y1=y0-L*0.8;
    psLine(S,x0,y0,x1,y1,C[3],1); psLine(S,x0,y0+1,x1,y1+1,C[1],1); psLine(S,x1,y1,x1+sg*L*0.3,y1-L*0.5,C[2],1); if(k===0) psP(S,x1,y1,E[1]); }
  if(sd%3===0) psP(S,bx,by-Math.round(H*0.3),E[0]);
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trObsid(R,C,tk,sd,ol,vn){ const w=Math.ceil(R*2.3)+6, h=Math.ceil(R*2.2)+6, S=PS(w,h), bx=w>>1, by=h-3, n=3+(sd%2);
  const sh=[]; for(let k=0;k<n;k++){ const x=bx+(k-(n-1)/2)*R*0.55+(hash2(sd,k)-0.5)*2, H2=R*(0.9+hash2(sd,k+4)*1.1), W2=R*(0.28+hash2(sd,k+8)*0.18); sh.push([x,H2,W2,(hash2(sd,k+12)-0.5)*R*0.5]); }
  sh.sort((a,b)=>b[1]-a[1]);
  for(const q of sh){ const x=q[0], H2=q[1], W2=q[2], tl=q[3], P=[[x-W2,by],[x+tl-W2*0.2,by-H2],[x+tl+W2*0.3,by-H2+W2*0.6],[x+W2,by]];            // a glassy shard: the lit face, the dark face, a bright edge
    psPoly(S,P,(px,py)=>{ const lf=px+0.5<x+tl*((by-py)/H2)*0.9; return lf?C[clamp(Math.floor(2.4+bayV(px,py)*0.8),0,5)]:C[clamp(Math.floor(1.2+bayV(px,py)*0.8),0,5)]; });
    psLine(S,x-W2+0.5,by-0.5,x+tl-W2*0.2+0.5,by-H2+0.5,C[4],1); psP(S,x+tl-W2*0.2,by-H2+1,C[5]); }
  if(vn) psVein(S,vn,sd);                                                                                       // (C7a: a node's ore seams)
  return psCv(psOut(S,ol||C[0],true),bx,by); }
function trSpire(R,C,tk,sd,ol){ const w=Math.ceil(R*2.3)+6, h=Math.ceil(R*2.6)+6, S=PS(w,h), bx=w>>1, by=h-3, n=2+(sd%3);
  const sp=[]; for(let k=0;k<n;k++) sp.push([bx+(k-(n-1)/2)*R*0.6+(hash2(sd,k)-0.5)*2, R*(1.1+hash2(sd,k+3)*1.3), Math.max(1.5,R*(0.2+hash2(sd,k+6)*0.12))]);
  sp.sort((a,b)=>b[1]-a[1]);
  for(const q of sp){ const x=q[0], H2=q[1], W2=q[2], tip=W2*1.6;                                                                    // hexagonal prisms: lit left face, shaded right, a pale tip
    psPoly(S,[[x-W2,by],[x-W2,by-H2+tip],[x,by-H2],[x+W2,by-H2+tip],[x+W2,by]],(px,py)=>{ const lf=px+0.5<x; const v=(lf?3.2:1.6)+((by-py)/H2)*0.9+bayV(px,py)*0.7; return C[clamp(Math.floor(v),0,5)]; });
    psLine(S,x-W2+0.5,by-H2+tip,x,by-H2+0.5,C[5],1); }
  return psCv(psOut(S,ol||C[0],true),bx,by); }
/* ---- the newer shores' forests (w1): mangroves & cypress over the mire · sandstone buttes, date palms & saguaro in the dunes · bamboo stands ·
   giant capped mushrooms · basalt columns & ash-grey dead trees in the caldera. Painted texel by texel like the rest, so they also read tiny from the sea. ---- */
function trMangrove(R,C,tk,sd,ol){ const th=Math.max(2,Math.round(R*0.6)), w=Math.ceil(R*2.9)+6, h=Math.ceil(R*1.75)+th+6, S=PS(w,h), bx=w>>1, by=h-3, cx=bx+(hash2(sd,2)-0.5)*1.5, cy=by-th-R*0.66;
  const nr=4+(sd%2); for(let k=0;k<nr;k++){ const sg=k%2?1:-1, sp=(0.4+(k>>1)*0.32+hash2(sd,k+30)*0.15)*R*sg, top=by-th;   // stilt roots arching down into the water
    for(let t=0;t<=1.0001;t+=0.5/Math.max(2,Math.abs(sp)+th)){ const x=bx+sp*t, y=top+th*t-Math.sin(t*Math.PI)*R*0.28; psP(S,x,y,tk[1]); psP(S,x,y-1,t<0.5?tk[2]:tk[1]); } }
  for(let y=Math.round(cy+R*0.3);y<=by-th+1;y++){ psP(S,bx-1,y,tk[2]); psP(S,bx,y,tk[1]); }                                          // the short trunk
  const n=6+(sd%2), cl=[[cx,cy-R*0.1,R*0.6]];
  for(let i=0;i<n;i++){ const a=i/n*TAU+sd*0.7, d=R*(0.5+hash2(sd,i+9)*0.12); cl.push([cx+Math.cos(a)*d*1.25, cy+Math.sin(a)*d*0.55, R*(0.4+hash2(sd,i)*0.12)]); }
  cl.sort((a,b)=>a[1]-b[1]); for(let i=0;i<cl.length;i++){ const c=cl[i]; psBall(S,c[0],c[1],c[2],c[2]*0.78,C,[cx,cy,R*1.1],sd*11+i,1,0.9); }   // a broad, flat, dense crown
  const MS=cIR(['#5a6a4a','#7a8a62']); for(let i=0;i<4;i++){ const x=Math.round(cx+(hash2(sd,i+50)-0.5)*R*1.8), y0=Math.round(cy+R*0.25); if(!psG(S,x,y0-1)) continue;   // aerial roots hanging from the crown
    const L=Math.round(th*(0.5+hash2(sd,i+60)*0.6)); for(let j=0;j<L;j++) psP(S,x,y0+j,MS[j<L-1?1:0]); }
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trCypress(R,C,tk,sd,ol){ const H=Math.round(R*2.6), w=Math.ceil(R*2.2)+6, h=H+Math.round(R*0.4)+6, S=PS(w,h), bx=w>>1, by=h-3, fb=R*0.8;
  for(let y=Math.round(by-fb);y<=by;y++){ const f=(y-(by-fb))/fb, hw=0.9+f*f*R*0.4; for(let x=Math.floor(bx-hw);x<=Math.ceil(bx+hw);x++){ const rel=(x+0.5-bx)/hw; psP(S,x,y,tk[rel<-0.25?2:rel>0.35?0:1]); } }   // the flared, buttressed foot
  const n=4; for(let k=0;k<n;k++){ const t=k/(n-1), y=by-fb-t*(H-R*1.2), rx=R*(0.7-t*0.3), ry=R*(0.46-t*0.1); psBall(S,bx+(hash2(sd,k)-0.5)*1.6,y,rx,ry,C,[bx,by-H*0.55,R*1.2],sd*3+k,1.3,1); }   // tiers of feathery crown
  const MS=cIR(['#6a7a5e','#8e9e80','#b2bea0']); for(let i=0;i<6;i++){ const x=Math.round(bx+(hash2(sd,i+7)-0.5)*R*1.2), y0=Math.round(by-fb-hash2(sd,i+11)*H*0.55); if(!psG(S,x,y0)) continue;   // Spanish moss draping off the boughs
    const L=2+Math.floor(hash2(sd,i+3)*R*0.55); for(let j=1;j<=L;j++) psP(S,x+(j>2&&i%2?1:0),y0+j,MS[j<2?2:j<L?1:0]); }
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trCactus(R,C,tk,sd,ol){ const H=Math.round(R*2), cw=Math.max(2,Math.round(R*0.44)), w=Math.ceil(R*2.3)+6, h=H+6, S=PS(w,h), bx=w>>1, by=h-3, x0=bx-(cw>>1);
  const col=(xa,ya,yb,wd)=>{ for(let y=Math.round(ya);y<=Math.round(yb);y++) for(let i=0;i<wd;i++){ if(y===Math.round(ya) && wd>2 && (i===0||i===wd-1)) continue;   // a ribbed column, lit on its left, the top rounded
      let v=i===0?4:i===wd-1?1:(i%2?2:3); if(y===Math.round(ya)+ (wd>2?0:0)) v=Math.min(5,v+1); psP(S,xa+i,y,C[v]); } };
  col(x0,by-H,by,cw);
  const na=1+(sd%2); for(let k=0;k<na;k++){ const sg=k?1:-1, aw=Math.max(2,cw-1), ay=Math.round(by-H*(0.32+hash2(sd,k)*0.22)), reach=Math.max(2,Math.round(R*0.5)), ax=sg<0?x0-reach:x0+cw+reach-aw, up=Math.round(R*(0.5+hash2(sd,k+5)*0.4));
    const xa=sg<0?ax:x0+cw, xb=sg<0?x0-1:ax+aw-1; for(let x=xa;x<=xb;x++) for(let j=0;j<aw;j++) psP(S,x,ay-j,C[j===aw-1?4:j===0?1:2]);   // the elbow
    col(ax,ay-up,ay,aw); }
  if(sd%3===0){ psP(S,bx,by-H-1,cI('#ff7aa0')); psP(S,bx-1,by-H,cI('#ffd0e0')); }                                                          // a bloom on top
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trMesa(R,C,tk,sd,ol){ const H=Math.round(R*(1.25+hash2(sd,1)*0.55)), w=Math.ceil(R*2.5)+6, h=H+6, S=PS(w,h), bx=w>>1, by=h-3, hw=R*(0.95+hash2(sd,2)*0.2), lip=Math.max(2,Math.round(R*0.38)), st=Math.max(2,Math.round(R*0.3));
  const P=[[bx-hw,by],[bx-hw*0.84,by-H+lip],[bx-hw*0.66,by-H],[bx+hw*0.62,by-H],[bx+hw*0.84,by-H+lip*0.8],[bx+hw,by]];
  psPoly(S,P,(x,y)=>{ if(y<by-H+lip) return C[clamp(Math.floor(4.2+bayV(x,y)*0.8-(y-(by-H))/lip*0.6),0,5)];                           // the flat, sun-baked top
    const lf=(x+0.5-bx)/hw, band=Math.floor((y+sd*3)/st)%2; let v=(band?2.3:2.9)-lf*1.1+bayV(x,y)*0.5; if(y<by-H+lip+1) v-=1.4; if(y>by-2) v-=0.8;   // strata; a shadow under the lip; a dark foot
    if(hash2((x>>1)*5+sd,y*3)<0.04) v-=1.2; return C[clamp(Math.floor(v),0,5)]; });
  for(let i=0;i<2;i++){ const x=Math.round(bx+(hash2(sd,i+8)-0.5)*hw*1.2); let y=by-H+lip+1; for(let j=0;j<H*0.5;j++){ if(psG(S,x,y)) psP(S,x,y,C[0]); y++; } }   // weathered cracks
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trBamboo(R,C,tk,sd,ol){ const H=Math.round(R*2.9), n=4+(sd%3), w=Math.ceil(R*0.5*n+R*1.6)+6, h=H+6, S=PS(w,h), bx=w>>1, by=h-3, seg=Math.max(3,Math.round(R*0.6)), canes=[];
  for(let i=0;i<n;i++) canes.push([bx+(i-(n-1)/2)*R*0.5+(hash2(sd,i)-0.5)*R*0.16, H*(0.6+hash2(sd,i+20)*0.4), (hash2(sd,i+40)-0.5)*R*0.5, i]);
  canes.sort((a,b)=>b[1]-a[1]);                                                                                                          // the tall ones behind
  for(const q of canes){ const L=q[1], x0=q[0], ln=q[2], of=q[3]%seg;
    for(let t=0;t<=L;t++){ const x=Math.round(x0+ln*(t/L)*(t/L)), y=by-t, node=((t+of)%seg)===0&&t>1; psP(S,x,y,node?C[1]:C[4]); psP(S,x+1,y,node?C[0]:C[2]); }   // a two-texel cane, lit on its left, a dark node every segment
    for(let k=0;k<3;k++){ const t=Math.round(L-k*seg*1.1-1); if(t<L*0.55) break; const x=Math.round(x0+ln*(t/L)*(t/L)), y=by-t, sg=(k+q[3])%2?1:-1, ll=Math.max(2,Math.round(R*(0.32+hash2(sd,q[3]*7+k)*0.26)));
      for(let j=1;j<=ll;j++){ const yy=y+Math.round(j*0.5); psP(S,x+(sg>0?1:0)+sg*j,yy,C[j<ll*0.55?5:3]); if(j>1) psP(S,x+(sg>0?1:0)+sg*j,yy+1,C[2]); } } }   // leaf sprays off the upper nodes
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trGShroom(R,C,tk,sd,o){ const H=Math.round(R*(1.4+hash2(sd,1)*0.8)), w=Math.ceil(R*2.5)+6, h=H+Math.round(R*0.8)+6, S=PS(w,h), bx=w>>1, by=h-3, sw=Math.max(1.5,R*0.3), cy=by-H, rx=R*1.05, ry=R*0.66;
  for(let y=Math.round(cy);y<=by;y++){ const t=(y-cy)/H, xo=Math.round(Math.sin(t*2.2+sd)*R*0.12), hw=sw*(0.85+t*0.4); for(let x=Math.floor(bx-hw);x<=Math.ceil(bx+hw);x++){ const rel=(x+0.5-bx)/hw; psP(S,x+xo,y,tk[rel<-0.3?2:rel>0.4?0:1]); } }   // the pale stalk, a little bowed
  const sk=Math.round(cy+H*0.34); for(let x=Math.round(bx-sw-1);x<=Math.round(bx+sw+1);x++){ psP(S,x,sk,tk[2]); psP(S,x,sk+1,tk[0]); }       // its skirt
  psDisc(S,bx,cy+ry*0.34,rx*0.9,ry*0.42,(nx,ny,x,y)=>C[(x+y)&1?0:1]);                                                                  // the gills under the cap's rim
  psDisc(S,bx,cy,rx,ry,(nx,ny,x,y)=>{ if(ny>0.5) return 0; const l=-(nx*0.55+ny*0.85); return C[clamp(Math.floor(2.5+l*1.7+bayV(x,y)*0.6),0,5)]; });   // the domed cap, lit top-left
  const D=o&&o.dots, nd=R<6?2:4+(sd%3); if(D) for(let i=0;i<nd;i++){ const a=hash2(sd*3+i,5)*TAU, d=Math.sqrt(hash2(sd*7+i,11))*0.78, x=bx+Math.cos(a)*d*rx, y=cy+Math.sin(a)*d*ry*0.7-ry*0.12; if(!psG(S,x,y)) continue;   // spots (glowing, on the grove's own kinds)
    psP(S,x,y,D[i%D.length]); if(R>6){ psP(S,x+1,y,D[i%D.length]); if(psG(S,x,y+1)) psP(S,x,y+1,D[(i+1)%D.length]); } }
  return psCv(psOut(S,(o&&o.ol)||C[0],false),bx,by); }
function trBasalt(R,C,tk,sd,ol){ const w=Math.ceil(R*2.5)+6, h=Math.ceil(R*2.7)+6, S=PS(w,h), bx=w>>1, by=h-3, n=3+(sd%3), cols=[];
  for(let k=0;k<n;k++) cols.push([bx+(k-(n-1)/2)*R*0.54+(hash2(sd,k)-0.5)*1.5, R*(0.8+hash2(sd,k+4)*1.6), Math.max(1.6,R*0.29), by-Math.round(hash2(sd,k+9)*R*0.25)]);
  cols.sort((a,b)=>a[3]-b[3]);                                                                                                           // (the ones set further back, first)
  for(const q of cols){ const x=q[0], H2=q[1], W2=q[2], yb=q[3], top=yb-H2, cap=Math.max(1,Math.round(W2*0.5));
    psPoly(S,[[x-W2,yb],[x-W2,top+cap],[x+W2,top+cap],[x+W2,yb]],(px,py)=>{ const lf=px+0.5<x; return C[clamp(Math.floor((lf?2.5:1.2)+((yb-py)/H2)*0.7+bayV(px,py)*0.6),0,5)]; });   // a hexagonal prism: lit left face, shaded right
    psPoly(S,[[x-W2,top+cap],[x-W2*0.5,top],[x+W2*0.5,top],[x+W2,top+cap],[x+W2*0.5,top+cap*2],[x-W2*0.5,top+cap*2]],(px,py)=>C[clamp(Math.floor(4.1+bayV(px,py)*0.8),0,5)]);   // its flat hex top
    psLine(S,x,top+cap*2,x,yb,C[0],1); }
  if(sd%2===0){ const E=cIR(['#8a200a','#ff8a3c']); psP(S,bx+1,by-1,E[1]); psP(S,bx,by-1,E[0]); }                                          // a glow of lava at its foot
  return psCv(psOut(S,ol||C[0],true),bx,by); }
function trAshTree(R,C,tk,sd,ol){ const H=Math.round(R*2.2), w=Math.ceil(R*2.7)+6, h=H+6, S=PS(w,h), bx=w>>1, by=h-3;
  for(let i=0;i<H*0.85;i++){ const t=i/H, wd=t<0.2?3:t<0.6?2:1, xo=Math.round(Math.sin(t*4+sd)*0.8); for(let q=0;q<wd;q++) psP(S,bx-1+q+xo,by-i,q===0?C[4]:q===wd-1?C[1]:C[2]); }   // a grey, dead trunk
  const nb=3+(sd%2); for(let k=0;k<nb;k++){ const t=0.35+k*0.16, sg=k&1?1:-1, x0=bx, y0=by-H*t, L=R*(0.55+hash2(sd,k)*0.45), x1=x0+sg*L, y1=y0-L*0.7;
    psLine(S,x0,y0,x1,y1,C[3],1); psLine(S,x1,y1,x1+sg*L*0.3,y1-L*0.4,C[2],1);
    psBall(S,x1+sg*L*0.15,y1-L*0.25,R*0.36,R*0.27,C,[bx,by-H*0.7,R*1.4],sd*5+k,1.4,1); }                                                     // a sparse tuft of ash-grey leaves at each tip
  return psCv(psOut(S,ol||C[0],false),bx,by); }
function trVent(R,C,tk,sd,ol){ const w=Math.ceil(R*2.2)+6, h=Math.ceil(R*1.2)+6, S=PS(w,h), bx=w>>1, by=h-3, E=cIR(['#8a200a','#e0501a','#ffb040']);   // a fumarole: a low cinder cone with a glowing throat
  psPoly(S,[[bx-R,by],[bx-R*0.3,by-R*0.9],[bx+R*0.3,by-R*0.9],[bx+R,by]],(x,y)=>C[clamp(Math.floor((x+0.5<bx?2.6:1.4)+bayV(x,y)*0.7),0,5)]);
  psP(S,bx,Math.round(by-R*0.9),E[2]); psP(S,bx-1,Math.round(by-R*0.9),E[1]); psP(S,bx+1,Math.round(by-R*0.9),E[0]);
  return psCv(psOut(S,ol||C[0],false),bx,by); }
const TR_PAINT={char:trBroad, broad:trBroad, oak:trBroad, orchard:trBroad, palm:trPalm, acacia:trAcacia, spine:trPine, conifer:trPine, gnarl:trGnarl, heather:trHeather, dgrass:trGrass, scrub:trScrub, boulder:trBoulder, coral:trCoral, snag:trSnag, obsid:trObsid, spire:trSpire,
  mangrove:trMangrove, cypress:trCypress, datepalm:trPalm, cactus:trCactus, mesa:trMesa, bamboo:trBamboo, gshroom:trGShroom, basalt:trBasalt, ashtree:trAshTree, vent:trVent};
const TR_SIZE={char:11.5, broad:12, oak:12.5, orchard:10.5, palm:11.5, acacia:12, spine:10.5, conifer:10.5, gnarl:11, heather:9, dgrass:9, scrub:8.5, boulder:10, coral:9, snag:10, obsid:9.5, spire:10,
  mangrove:12, cypress:10.5, datepalm:11, cactus:8.5, mesa:12, bamboo:10, gshroom:11, basalt:9.5, ashtree:10.5, vent:7};   // crown radius (world units) of each kind, before its size roll
const TR_LOW={dgrass:1, heather:1, scrub:1, boulder:1, coral:1, mesa:1, vent:1};   // (low things cast a short shadow)
function TBI(bk){ const B=TB[bk]||TB.tropic; if(B._i) return B._i;   // a biome's look as ImageData words (converted once)
  const I={key:bk, g:cIR(B.g), u:cIR(B.u), p:cIR(B.p), sd:cIR(B.sd), fl:cIR(B.fl), cr:{}, tk:cIR(B.tk), ol:cI(B.ol), pb:cIR(B.pb), wat:B.wat, ice:cIR(B.ice||TB.frost.ice), tr:B.tr, tc:B.tc, dg:B.dg, ds:B.ds, dt:B.dt, dd:B.dd||1, dr:B.dr, rk:B.rk, hb:B.hb, ru:B.ru,
    bog:cIR(B.bog||TB.swamp.bog), lava:cIR(B.lava||TB.volcanic.lava),   // (the mire's pools · the caldera's rivers)
    wet:cIR([mixHex(B.sd[0],'#18242c',0.42), mixHex(B.sd[1],'#18242c',0.34), mixHex(B.sd[2],'#18242c',0.28)]),
    sh:cIA(B.wat[2],0.62), md:cIA(B.wat[3],0.42), dp:cIA(B.wat[4],0.3), fo:cI('#e8f4f0'), fo2:cI('#c8e2e2')};
  for(const k in B.cr) I.cr[k]=B.cr[k].map(cIR);
  return B._i=I; }
const CAVE_STONE={_:'#6a645a', frost:'#66707c', scorch:'#4a4440', crystal:'#4a5264', atoll:'#6e6a60', meadow:'#666456', tropic:'#625e52', ember:'#6a6052', savanna:'#766a58', boulder:'#686860', moor:'#5e5e58', dunes:'#8a6a48', swamp:'#4a5244', bamboo:'#566050', mushroom:'#5a4e66', volcanic:'#3a3434'};
function caveTI(b){ if(b._cti) return b._cti; const cp=cavePal(b), B=TB[b.key]||TB.tropic, M=mixHex, K='#000000', Wt='#ffffff';   // a cave's stone: a floor a shade of the isle's own earth, rock tops dark & lumpy, cliff faces between
  const fb=M(M(B.p[2],CAVE_STONE[b.key]||CAVE_STONE._,0.6),B.g[3],0.12), rb=M(M(B.u[2],'#34323a',0.55),fb,0.18), fc=M(rb,fb,0.42), tr=M(fb,K,0.2), vein=cp.vein||null;
  return b._cti={floor:cIR([M(fb,K,0.55),M(fb,K,0.36),M(fb,K,0.17),fb,M(fb,Wt,0.1),M(fb,Wt,0.24)]),
    wet:cIR([M(fb,'#0c1a26',0.6),M(fb,'#0c1a26',0.45),M(fb,'#14283a',0.32),M(fb,'#20384c',0.22),M(fb,'#6a8aa0',0.22),M(fb,'#a8c4d4',0.34)]),
    trail:cIR([M(tr,K,0.5),M(tr,K,0.32),M(tr,K,0.14),tr,M(tr,Wt,0.08)]),
    top:cIR([M(rb,K,0.55),M(rb,K,0.3),rb,M(rb,Wt,0.1),M(rb,Wt,0.22),M(rb,Wt,0.38)]),
    face:cIR([M(fc,K,0.62),M(fc,K,0.42),M(fc,K,0.2),fc,M(fc,Wt,0.14),M(fc,Wt,0.3)]),
    vein:vein?cIR([M(vein,K,0.45),vein,M(vein,Wt,0.55)]):null, grit:cI(cp.grit), crack:cI(M(fb,K,0.6)), ol:cI(M(rb,K,0.7)), rock:[M(fc,K,0.55),M(fc,K,0.3),M(fc,K,0.1),fc,M(fc,Wt,0.15),M(fc,Wt,0.32)],
    wat:[M('#183848',fb,0.1),M('#4a7e92',fb,0.12)], fo:cI(M('#86a8b4',fb,0.3)), fo2:cI(M('#5e8090',fb,0.3)), sh:cIA('#5a8e9e',0.5), md:cIA('#2e5a6e',0.36), dp:cIA('#0e2632',0.3)}; }   // (PT1 K6: an underground lake — still, dark water under the stone's light; its edge a dull wet rim)
const TSPR=new Map(); let TSPR_S=0, TSPR_V=0;                                              // the ground's baked sprites (trees, props, dressing) at the texel they were painted for
function tSpr(key,mk){ let o=TSPR.get(key); if(!o){ o=mk(); TSPR.set(key,o); } return o; }
function shadowSpr(rx,ry,a){ rx=Math.max(1,rx); ry=Math.max(1,ry); return tSpr('sh'+rx+'_'+ry+'_'+(a||0.3), ()=>{ const S=PS(rx*2+2,ry*2+2), c=cIA('#000000',a||0.3); psDisc(S,rx+1,ry+1,rx,ry,()=>c); return psCv(S,rx+1,ry+1); }); }   // a hard-edged drop shadow (the light is top-left)
function treeSpr(bk,kind,v){ const s=TSPR_S; return tSpr('t'+bk+kind+v, ()=>{ const sz=[0.84,1,1.17][((v/3)|0)%3], R=Math.max(3,TR_SIZE[kind]*sz*s);
  const o=paintTree(bk,kind,v,R);
  o.R=R; const low=!!TR_LOW[kind]; o.sh=shadowSpr(Math.round(R*(low?0.8:0.95)),Math.max(1,Math.round(R*(low?0.32:0.42))),0.3); o.low=low;
  return o; }); }
/* one tree of a biome's kind & variant at crown radius R texels — shared by the crawl's forest wall and the lands seen from the sea (tiny R there) */
function paintTree(bk,kind,v,R){ const B=TBI(bk), rl=B.cr[kind]||B.cr[Object.keys(B.cr)[0]], C=rl[v%rl.length], sd=v*7+kind.length*13+3, tk=B.tk, ol=C[0];   // (the crown's own darkest shade is its line: overlapping crowns read as clumps, not cells)
  if(kind==='orchard') return trBroad(R,C,tk,sd,{ol, dots:v%2?cIR(['#d4463a','#b0302a']):cIR(['#f4b4c8','#ffffff','#f08aa6']), n:Math.round(R*0.9)});
  if(kind==='broad'||kind==='oak') return trBroad(R,C,tk,sd,{ol});
  if(kind==='char') return trBroad(R,C,tk,sd,{ol, ash:1, dots:cIR(['#e0501a','#ff9a30']), n:v%2});   // a burnt crown: an ash-grey lit edge, an ember or two still in it
  if(kind==='spine') return trPine(R,C,tk,sd,true,cI('#0a141c')); if(kind==='conifer') return trPine(R,C,tk,sd,false,ol);
  if(kind==='boulder') return trBoulder(R,C,tk,sd,{ol, moss:bk==='boulder'&&v%3!==2, snow:bk==='frost'});
  if(kind==='gshroom'){ const g=v%rl.length; return trGShroom(R,C,tk,sd,{ol:cI('#0a0610'), dots:g===0?cIR(['#fff4e8','#f4e0d0']):g===1?cIR(['#e8c8ff','#ffffff']):cIR(['#b8fff4','#ffffff'])}); }   // red & white-spotted · violet & teal glow
  if(kind==='datepalm') return trPalm(R,C,tk,sd,ol);
  return (TR_PAINT[kind]||trBroad)(R,C,tk,sd,ol); }
