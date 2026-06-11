/* ============================================================
   BOATS Wiki — every article, plus nav, navbox and redirects.
   Content is written against the live build of 10 June 2026
   (commit 61cf246, "Whaling — the iron and the ride").
   ============================================================ */
'use strict';

/* ---------------- sidebar ---------------- */
const NAV = [
  { head: 'BOATS Wiki', items: [
    ['Main_Page', 'Main Page'], ['BOATS', 'About the game'], ['Getting_Started', 'Getting started'],
  ]},
  { head: 'Sailing & the sea', items: [
    ['Sailing'], ['The_World', 'The World'], ['Charts_and_Cartography', 'Charts & Cartography'],
    ['Day-Night_and_Weather', 'Day–Night & Weather'], ['Ports'],
  ]},
  { head: 'Ashore', items: [
    ['Islands'], ['Island_Exploration', 'Island Exploration'], ['Combat'], ['Biomes'], ['Treasure'],
  ]},
  { head: 'Fishing & whaling', items: [
    ['Fishing'], ['Fish'], ['Whaling'], ['Whales'], ['The_White', 'The White'],
  ]},
  { head: 'Creatures', items: [ ['Boar'], ['Snake'], ['Great_Boar', 'Great Boar'] ]},
  { head: 'Items', items: [ ['Loot'], ['Satchel_and_Hold', 'Satchel & Hold'] ]},
  { head: 'Reference', items: [
    ['Controls'], ['Tuning_Panel', 'Tuning Panel'], ['Version_History', 'Version History'],
    ['Upcoming_Features', 'Upcoming Features'],
  ]},
];

/* ---------------- bottom navbox ---------------- */
const NAVBOX = [
  ['Gameplay', ['Sailing', 'Islands', 'Island_Exploration', 'Combat', 'Fishing', 'Whaling']],
  ['World', ['The_World', 'Charts_and_Cartography', 'Biomes', 'Day-Night_and_Weather', 'Ports', 'Treasure']],
  ['Creatures', ['Boar', 'Snake', 'Great_Boar', 'Fish', 'Whales', 'The_White']],
  ['Items', ['Loot', 'Satchel_and_Hold']],
  ['Reference', ['Getting_Started', 'Controls', 'Tuning_Panel', 'Version_History', 'Upcoming_Features', 'BOATS']],
];

/* ---------------- redirects (searchable aliases) ---------------- */
const REDIRECTS = {
  Map: 'Charts_and_Cartography', Minimap: 'Charts_and_Cartography', Chart: 'Charts_and_Cartography',
  Cartography: 'Charts_and_Cartography', Survey: 'Charts_and_Cartography/the_island_survey',
  Wind: 'Sailing/wind', Death: 'Combat/death', Hearts: 'Combat/health_and_healing',
  Dash: 'Combat/the_dash', Sword: 'Combat/the_sword', Bow: 'Combat/the_bow',
  Harpoon: 'Whaling', Iron: 'Whaling', Sleigh_Ride: 'Whaling/3_the_sleigh_ride',
  Net: 'Fishing', Fish_Log: 'Fishing/the_well_selling_and_the_log', Cooking: 'Fishing/the_galley_cooking',
  Galley: 'Fishing/the_galley_cooking', Fish_Well: 'Fishing/the_well_selling_and_the_log',
  Inventory: 'Satchel_and_Hold', Satchel: 'Satchel_and_Hold', Hold: 'Satchel_and_Hold',
  Gold: 'Loot', Magnet: 'Loot/the_magnet', Relic: 'Loot', Gems: 'Loot', Ore: 'Loot',
  Herb: 'Loot', Monster_Bits: 'Loot', Ambergris: 'Whaling/4_spoils',
  Storms: 'Day-Night_and_Weather', Weather: 'Day-Night_and_Weather', Night: 'Day-Night_and_Weather',
  Port: 'Ports', Beacon: 'Ports', Buried_Treasure: 'Treasure/buried_treasure',
  Chest: 'Treasure', Hoard: 'Treasure', Flag: 'Islands/clearing_and_claiming',
  White_Whale: 'The_White', Moby_Dick: 'The_White', Dark_Viper: 'Snake', Viper: 'Snake',
  Elite: 'Island_Exploration/side_branches_and_elites', Great_Boar_Hoard: 'Treasure',
  Whale: 'Whales', Narwhal: 'Whales', Blue_Whale: 'Whales', Sperm_Whale: 'Whales',
  Golden_Koi: 'Fish', Tempest_Ray: 'Fish', Biome: 'Biomes', Biome_Log: 'Biomes/the_biome_log',
  Atoll: 'Biomes/palm_atoll', Frost: 'Biomes/frostbound_isle', Scorch: 'Biomes/scorched_isle',
  Crystal: 'Biomes/crystal_hollow', Save: 'The_World/saving', Tune: 'Tuning_Panel',
  Game: 'BOATS', Boats: 'BOATS', Lava: 'Biomes/scorched_isle', Ice: 'Biomes/frostbound_isle',
};

/* ---------------- shared snippets ---------------- */
const FISH_TIERS = ['common', 'uncommon', 'rare', 'exotic'];
const ftier = n => tier(n, FISH_TIERS[n]);
const wtier = n => tier(n, ['gentle giant', 'worthy hunt', 'great hunt', 'strange sea', 'LEGEND'][n]);
const btier = n => tier(n, ['common', 'uncommon', 'rare'][n]);
const K = k => `<kbd>${k}</kbd>`;

/* ============================================================
   THE ARTICLES
   ============================================================ */
const WIKI = {

/* ---------------------------------------------- Main Page */
Main_Page: { title: 'Main Page', icon: '⛵', noTitle: true, notoc: true, cats: [], html: `
<div class="mp-banner">
  <h2>Welcome to the BOATS Wiki</h2>
  <p>The cartographer's companion to <b>BOATS</b> — an open-world game of sailing, charting,
     landfall, treasure, ring-net fishing and whale hunting, played right in your browser.
     27 pages of charts, numbers and sea-lore, kept honest against the live build.</p>
  <a class="play-big" href="/boats">⛵ Play BOATS now — it's free</a>
  <div class="waves">🌊</div>
</div>

<div class="mp-stats">
  <div class="mp-stat"><b>82,000u</b><span>of open sea</span></div>
  <div class="mp-stat"><b>~3,000</b><span>islands</span></div>
  <div class="mp-stat"><b>10</b><span>${L('Biomes', 'biomes')}</span></div>
  <div class="mp-stat"><b>20</b><span>${L('Fish', 'fish species')}</span></div>
  <div class="mp-stat"><b>10</b><span>${L('Whales', 'whales')}</span></div>
  <div class="mp-stat"><b>1</b><span>${L('The_White', 'legend')}</span></div>
</div>

<h3 style="margin:6px 0 2px">Set a course</h3>
<div class="portal-grid">
  <a class="portal" href="#/Getting_Started"><span class="p-ico">🧭</span><span class="p-name">Getting started</span><span class="p-desc">Your first voyage, from raising sail to raising a flag.</span></a>
  <a class="portal" href="#/Sailing"><span class="p-ico">⛵</span><span class="p-name">Sailing</span><span class="p-desc">Wind, sail trim, glide and the point of sail.</span></a>
  <a class="portal" href="#/Charts_and_Cartography"><span class="p-ico">🗺️</span><span class="p-name">Charts</span><span class="p-desc">Fog-of-war cartography and the parchment map.</span></a>
  <a class="portal" href="#/Island_Exploration"><span class="p-ico">🏝️</span><span class="p-name">Island exploration</span><span class="p-desc">Landfall crawls, clearings, hoards and flags.</span></a>
  <a class="portal" href="#/Combat"><span class="p-ico">⚔️</span><span class="p-name">Combat</span><span class="p-desc">Sword, bow, dash — and how not to lose the haul.</span></a>
  <a class="portal" href="#/Biomes"><span class="p-ico">💠</span><span class="p-name">Biomes</span><span class="p-desc">Ten island types; the far sea holds the rare ones.</span></a>
  <a class="portal" href="#/Fishing"><span class="p-ico">🎣</span><span class="p-name">Fishing</span><span class="p-desc">Ring-netting: circle the school, mind the strain.</span></a>
  <a class="portal" href="#/Whaling"><span class="p-ico">🐋</span><span class="p-name">Whaling</span><span class="p-desc">The iron, the sleigh ride, and the spoils.</span></a>
  <a class="portal" href="#/Loot"><span class="p-ico">💎</span><span class="p-name">Loot</span><span class="p-desc">Gold, gems, relics and the 95-unit magnet.</span></a>
  <a class="portal" href="#/Controls"><span class="p-ico">⌨️</span><span class="p-name">Controls</span><span class="p-desc">Every key, at sea and ashore.</span></a>
</div>

<div class="mp-cols">
  <div class="mp-box">
    <h3>⭐ Featured article: ${L('The_White')}</h3>
    <div class="mp-body">
      <p style="text-align:center">${spr('whale', 5, { B:'#f6f9fb', b:'#e8ecf0', w:'#d8dee6', f:'#d8dee6', s:'#eef6ff' })}</p>
      <p><i>“The one the songs warn about.”</i> A single named white bull roams each world's deep
      water — vanishingly rare, four dive-cycles strong, and the only whale that turns and
      <b>rams</b> the boat. Taking him is a once-per-voyage event and a permanent trophy.
      ${L('The_White', 'Read the legend…')}</p>
    </div>
  </div>
  <div class="mp-box">
    <h3>💡 Did you know…</h3>
    <div class="mp-body"><ul class="dyk">
      <li>…that a ${L('Whales', 'Sperm Whale')} at a dead run (100&nbsp;u/s) is <b>faster than your boat</b> at full sail (96&nbsp;u/s)? Tire her out before she tires you.</li>
      <li>…that ${L('Loot', 'gold')} is weightless? Coins never take a ${L('Satchel_and_Hold', 'satchel')} slot.</li>
      <li>…that cooking a fish at the ${L('Fishing', 'galley')} (${K('C')}) grants a bonus heart on your <i>next</i> landfall — and the pot holds two meals?</li>
      <li>…that the further you sail from the centre of ${L('The_World', 'the world')}, the rarer the ${L('Biomes', 'biomes')} get — from a 4% rare chance in home waters to roughly a third at the rim?</li>
      <li>…that roughly half of all islands hide ${L('Treasure', 'buried treasure')}, marked by a red ✕ — three digs deep?</li>
      <li>…that crossing your own cork-line is what cinches a ${L('Fishing', 'fishing net')} shut? Greed is a loop the size of your nerve.</li>
    </ul></div>
  </div>
</div>

<div class="mp-box" style="margin-bottom:14px">
  <h3>📰 Current build</h3>
  <div class="mp-body">
    <p><b>“Whaling — the iron and the ride”</b> (10 June 2026) added the harpoon, hit zones, the
    sleigh ride, hull strain, ten ${L('Whales', 'whale species')} and ${L('The_White', 'THE WHITE')} —
    the day after ring-net ${L('Fishing', 'fishing')} with 20 species and the 10-biome update.
    See the full ${L('Version_History', 'version history')} · ${L('Upcoming_Features', "what's next")}.</p>
  </div>
</div>
` },

/* ---------------------------------------------- BOATS (the game) */
BOATS: { title: 'BOATS', icon: '⛵', cats: ['Reference'], html: `
${ib({ title: 'BOATS', sub: "a cartographer's voyage", art: spr('boat', 7), cap: 'The sloop, ready for sea',
  rows: [
    ['Developer', 'Monday Jeffrey'],
    ['Engine', 'Hand-rolled HTML5 Canvas/JS — one file, no build step'],
    ['Platform', 'Web browser (desktop, keyboard &amp; mouse)'],
    ['Released', '9 June 2026'],
    ['Latest update', '10 June 2026 (whaling)'],
    ['Status', 'In active development'],
    ['Modes', `${L('Sailing', 'Open sea')} · ${L('Island_Exploration', 'island crawl')}`],
    ['Saving', 'Automatic, in your browser (localStorage)'],
    ['Price', 'Free'],
    ['Play at', '<a href="/boats">mondayjeffrey.com/boats</a>'],
  ]})}
<p><b>BOATS</b> is an open-world sailing and cartography game. You are a cartographer-explorer
on a procedurally generated sea ${L('The_World', '82,000 units')} across, charting fog-of-war
${L('Charts_and_Cartography', 'parchment maps')}, making landfall on ${L('Islands', 'islands')}
that open into top-down ${L('Island_Exploration', 'exploration crawls')}, ring-netting
${L('Fishing', 'fish')}, and hunting ${L('Whales', 'whales')} with a hand-thrown iron.</p>
<p>The game runs in the browser with no install and saves automatically. Its stated design goal
is a <i>calm and meditative</i> sail punctuated by sharper adventures ashore and at the hunt.</p>

<h2>Premise</h2>
<p>The sea is unmapped. Your chart begins blank, and every league sailed paints it in. Islands
take names when sighted, ${L('Ports', 'port cities')} burn as beacons after dark, and a cleared
island flies your flag forever. The eventual goal — per the developer's roadmap — is a full
trading loop: sell your haul in port, fit out the boat, hire a crew of five, and push deeper
into seas where the ${L('Biomes', 'strange isles')} and the ${L('The_White', 'great legend')} wait.</p>

<h2>The two modes</h2>
<p>Play alternates between two views:</p>
<ul>
  <li><b>At sea</b> — light-touch ${L('Sailing', 'sailing physics')} with wind, weather and a
  ${L('Day-Night_and_Weather', 'day–night cycle')}; ${L('Fishing', 'fishing')},
  ${L('Whaling', 'whaling')} and ${L('Charts_and_Cartography', 'charting')} all happen here,
  in the world, with no separate minigame screens.</li>
  <li><b>Ashore</b> — sail close to an island and press ${K('E')} to begin an
  ${L('Island_Exploration', 'island exploration')}: a connected-clearing crawl with
  ${L('Combat', 'snappy combat')}, ${L('Loot', 'physical loot')}, a guardian
  ${L('Great_Boar', 'Great Boar')} and a ${L('Treasure', 'hoard chest')} at the end of the path.</li>
</ul>

<h2>Development</h2>
<p>BOATS shipped its sailing core on 9 June 2026 and has updated at a run rate the fish find
alarming — fourteen updates in its first two days, including the world growing tenfold, the
treasure arc, ten biomes, fishing and whaling. See ${L('Version_History', 'Version History')}
for the full log and ${L('Upcoming_Features', 'Upcoming Features')} for the roadmap.</p>
<p>A signature of its development is the in-game ${L('Tuning_Panel', 'tuning panel')} (${K('T')}):
nearly every feel-number — sail physics, combat, fishing, whaling — is a live slider, because the
game is tuned by playing it, not by guessing.</p>

<h2>Reception</h2>
<p>The game's beta-testing department (population: one) describes the sailing as
<i>“absolutely nailed.”</i> The boars declined to comment.</p>

<h2>See also</h2>
<ul>
  <li>${L('Getting_Started', 'Getting started')} — a first-voyage walkthrough</li>
  <li>${L('Controls')} — the full key reference</li>
</ul>
` },

/* ---------------------------------------------- Getting Started */
Getting_Started: { title: 'Getting started', icon: '🧭', cats: ['Guides'], html: `
${hatnote(`New to BOATS? This guide covers your first hour. For the full key list, see ${L('Controls')}.`)}
<p>You wake in open water with a furled sail, a blank ${L('Charts_and_Cartography', 'chart')},
five hearts and a sword you haven't needed yet. Here is a sensible first voyage.</p>

<h2>1. Learn the wind</h2>
<p>Hold ${K('W')} to raise sail and ${K('A')}/${K('D')} to steer. The compass rose at the top of
the screen shows the wind; sail <i>with</i> it and the boat surges, point <i>into</i> it and she
wallows. You cannot capsize, run aground or break anything by sailing badly — ${L('Sailing', 'sailing')}
in BOATS is forgiving by design. Tap ${K('Space')} to drop sail quickly when you want to stop.</p>

<h2>2. Find your first island</h2>
<p>Pick any direction and hold course. Land smudges onto your corner minimap as you approach —
that is the fog of war peeling back. Sail near an island and it announces itself with a name.
When the prompt <b>“⚓ Press E to explore”</b> appears, you are close enough to land.</p>

<h2>3. Make landfall</h2>
<p>Press ${K('E')} and the view drops into a top-down ${L('Island_Exploration', 'island crawl')}.
You land on a beach with your boat behind you — that boat is your bank and your exit. Push
inland through connected clearings. Gates of bramble open only when the clearing before them is
secured (every enemy down).</p>

<h2>4. Fight carefully, bank often</h2>
<p>${L('Boar', 'Boars')} telegraph a charge with a tremble and a <b>!</b> — step sideways, then
punish. ${L('Snake', 'Vipers')} keep their distance and spit; close the gap with ${K('Space')}
(dash) or shoot back with ${K('K')} / right-click. Securing a clearing patches <b>+2 ♥</b>.
Everything you pick up rides in your ${L('Satchel_and_Hold', 'satchel')} (18 slots) as
<i>unbanked</i> loot — walk back to the boat and press ${K('E')} to bank it into the hold.
If you are knocked out, <b>the unbanked haul is gone</b>. Greed has a price; the beach is free.</p>

<h2>5. Take the hoard, raise the flag</h2>
<p>The last clearing on the main path holds a ${L('Great_Boar', 'Great Boar')} and a chest.
Drop the guardian, crack the chest, ride the ${L('Loot', 'loot eruption')} — then plant the flag
at the island's peak, give the place a name, and it is yours on the map forever. Sail off and
read your run summary like a proud accountant.</p>

<h2>6. Then the sea opens up</h2>
<ul>
  <li><b>Fish</b> — press ${K('F')} near a shimmering school, sail a circle, cross your own
  line. See ${L('Fishing')}.</li>
  <li><b>Sell</b> — find a ${L('Ports', 'port beacon')} and press ${K('G')} to turn the well
  into gold. Cook first (${K('C')}) for bonus hearts ashore.</li>
  <li><b>Listen</b> — a far-off spout and a cry of <i>“Thar she blows”</i> means a
  ${L('Whales', 'whale')}. Read ${L('Whaling')} before you throw; the flank forgives,
  the head does not.</li>
  <li><b>Sail out</b> — the far sea is where the ${L('Biomes', 'rare isles')} are. Distance is
  rarity.</li>
</ul>

<h2>Five mistakes every new sailor makes</h2>
<ol>
  <li>Hoarding 18/18 unbanked items deep in an island. Bank at the beach between pushes.</li>
  <li>Sword-trading with a charging boar instead of side-stepping the <b>!</b>.</li>
  <li>Throwing the iron at a whale's head. It sticks. She remembers.</li>
  <li>Netting a whole school of ${L('Fish', 'Grouper')} in one greedy loop — strain 3.0 each;
  the mesh tears at 26.</li>
  <li>Ignoring weather. Storm species exist, but so does getting rocked mid-cinch.</li>
</ol>
` },

/* ---------------------------------------------- Sailing */
Sailing: { title: 'Sailing', icon: '⛵', cats: ['Gameplay'], html: `
${ib({ title: 'Sailing', art: spr('boat', 6), cap: 'Full sail, flag flying',
  rows: [
    ['Top speed', '96 u/s at full sail, fair wind'],
    ['Raise sail', `${K('W')} / ${K('↑')} (smooth, ~1.2s to full)`],
    ['Furl sail', `${K('S')} / ${K('↓')} (can back slightly)`],
    ['Drop sail', `${K('Space')} (fast)`],
    ['Steer', `${K('A')} / ${K('D')} or ${K('←')} ${K('→')}`],
    ['Zoom', `${K('+')} / ${K('−')}`],
    ['Collision', 'Coastlines are hard edges — you slide, never strand'],
  ]})}
<p><b>Sailing</b> is the heart of BOATS: a light, forgiving model tuned for calm rather than
simulation. The sail is a continuous setting from furled to full — hold ${K('W')} to sheet out,
${K('S')} to take in. Momentum carries; the boat glides long after the sail drops, and turning
costs little speed. Holding ${K('S')} past zero backs the sail slightly for a slow shunt astern.</p>

<h2>Wind</h2>
<p>The wind has a direction and strength, shown on the compass rose with a point-of-sail
readout. Running with the wind is fastest; beating into it is slow but never impossible — the
model is deliberately generous (the developer calls it <i>light sailing</i>). Wind shifts
slowly over time, and freshens hard in ${L('Day-Night_and_Weather', 'storms')}, when it also
gusts and swings.</p>
<p>Wind matters more than raw speed when hunting: a fast approach alarms wary
${L('Whales', 'whales')}, and your moving hull spooks ${L('Fish', 'fish schools')} —
much of the late game is played with the sail half-dropped, gliding.</p>

<h2>Speed and stopping</h2>
<ul>
  <li>Full sail in fair wind makes <b>96 u/s</b>; the world is 82,000u across, so a rim-to-rim
  passage runs about 14 minutes.</li>
  <li>${K('Space')} strikes the sail about three times faster than holding ${K('S')} — the
  brake, such as it is.</li>
  <li>While fast to a whale on the ${L('Whaling', 'sleigh ride')}, the sail is down and the
  whale provides all propulsion.</li>
  <li>A swamped boat (${L('Whaling', 'hull')} at zero) limps at <b>half speed for ~60s</b> while
  you bail.</li>
</ul>

<h2>Running aground</h2>
<p>You can't. Coastlines are hard edges: the bow slides along them and open water can never
strand you on land. Sailing close inshore is how you find the <b>“⚓ Press E to explore”</b>
prompt for ${L('Islands', 'landfall')} — hugging the coast is encouraged, not punished.</p>

<h2>Feel-tuning</h2>
<p>Every number above is live in the ${L('Tuning_Panel', 'tuning panel')} (${K('T')}): top
speed, pickup, coast, turn rate, how much the wind matters, how shifty it is. The defaults are
the developer's play-tested values (baseSpeed 96, turn 1.5, wind spread 0.55).</p>

<h2>See also</h2>
<ul><li>${L('Controls')} — everything the keyboard does at sea</li>
<li>${L('The_World')} — what you're sailing across</li></ul>
` },

/* ---------------------------------------------- The World */
The_World: { title: 'The World', icon: '🌍', cats: ['World'], html: `
${ib({ title: 'The World', art: '<span style="font-size:54px">🌍</span>',
  rows: [
    ['Size', '82,000 × 82,000 units'],
    ['Crossing time', '≈ 14 minutes at full sail'],
    ['Islands', '~3,000, procedurally placed'],
    ['Port cities', '~370 beacon harbours'],
    ['Generation', 'Seeded — your world persists'],
    ['Day length', `210s real time (${L('Day-Night_and_Weather', 'cycle')})`],
    ['Rarity rule', 'Distance from centre = rarity'],
  ]})}
<p><b>The world</b> of BOATS is a single bounded square ocean, 82,000 units on a side, scattered
with roughly three thousand islands and several hundred ${L('Ports', 'port cities')}. It is
generated from a seed when a voyage begins and then never changes — every island you chart is
exactly where you left it, forever.</p>

<h2>Units</h2>
<p>Distances on this wiki are in <b>units (u)</b>, the game's own measure. For scale: the boat
makes 96&nbsp;u/s at full sail, the ${L('Loot', 'loot magnet')} reaches 95u, and a
${L('Fishing', 'cork-line')} pays out 650u of net.</p>

<h2>Distance is rarity</h2>
<p>You spawn near the centre, in gentle waters. The further out you sail, the stranger the sea:</p>
${scrollTable(`<table class="wikitable">
<thead><tr><th>Distance from centre</th><th>Common isle</th><th>Uncommon</th><th>Rare</th></tr></thead>
<tbody>
<tr><td>Home waters (inner 18%)</td><td class="num">100%</td><td class="num">—</td><td class="num">—</td></tr>
<tr><td>Out to 45%</td><td class="num">78%</td><td class="num">18%</td><td class="num">4%</td></tr>
<tr><td>Out to 70%</td><td class="num">55%</td><td class="num">28%</td><td class="num">17%</td></tr>
<tr><td>The rim</td><td class="num">38%</td><td class="num">30%</td><td class="num">32%</td></tr>
</tbody></table>`)}
<p>The same gradient governs sea life: exotic ${L('Fish', 'fish')} and the great
${L('Whales', 'whales')} favour the deep, far water. See ${L('Biomes')} for what the tiers mean.</p>

<h2>Depth</h2>
<p>The water itself is depth-shaded — pale over shallows, dark over the deep. Depth is a real
mechanic: <i>shallow</i> species school along coastlines, <i>deep</i> species (Grouper, Marlin,
every great whale) want genuinely deep water, and ${L('Whaling', 'whale spouts')} only roam the
deeps.</p>

<h2>Saving</h2>
<p>The game saves automatically to your browser (localStorage, save key <code>mj_boats_v2</code>):
position, charts, discoveries, cargo, cleared islands, the fish log, tuning values — all of it.
“New voyage” from the title screen starts a fresh world. Clearing your browser data is the only
kraken that can eat a save.</p>

<h2>See also</h2>
<ul><li>${L('Charts_and_Cartography')} — how the world reveals itself</li>
<li>${L('Day-Night_and_Weather')} — the sky above it</li></ul>
` },

/* ---------------------------------------------- Charts */
Charts_and_Cartography: { title: 'Charts and Cartography', icon: '🗺️', cats: ['World', 'Gameplay'], html: `
${hatnote(`“Map” and “minimap” redirect here.`)}
<p>You are a cartographer first: <b>the chart is the score sheet</b>. The world starts as blank
parchment and fills in only where you have sailed or walked — classic fog-of-war, kept forever
in your save.</p>

<h2>The corner chart</h2>
<p>A live minimap rides in the screen corner at sea, painting itself from your explored area:
land, water, ⚓ ports, gold ⚑ flags on islands you have ${L('Islands', 'cleared')}, and shimmer
markers where a rare ${L('Biomes', 'biome')} isle is in sensing range.</p>

<h2>The parchment map</h2>
<p>Press ${K('M')} for the full chart — a zoomable, pannable parchment of everything you have
ever surveyed. It opens auto-framed on your charted region.</p>
${scrollTable(`<table class="wikitable">
<thead><tr><th>Action</th><th>Control</th></tr></thead>
<tbody>
<tr><td>Zoom</td><td>Scroll wheel (zooms toward the cursor), or ${K('+')} / ${K('−')}</td></tr>
<tr><td>Pan</td><td>Click-drag, or ${K('W')}${K('A')}${K('S')}${K('D')} / arrow keys</td></tr>
<tr><td>Close</td><td>${K('M')}</td></tr>
</tbody></table>`)}
<p>The map shows discovered islands with their names (your renamed conquests in gold italics with
a ring), port cities in serif type, a scale bar, and a legend totting up <b>✦ charted · ⚓ ports
· ⚑ cleared · 📒 biomes found</b>.</p>

<h2>The island survey</h2>
<p>Ashore, cartography continues: each island keeps its own <b>survey chart</b>, fogging in as
you walk. The survey panel (bottom-right during ${L('Island_Exploration', 'exploration')})
marks chests you've seen, the red ✕ of ${L('Treasure', 'buried treasure')}, your landing beach
and your own position. Each island's survey is saved with the island — return visits remember
your mapping.</p>

<h2>Naming</h2>
<p>Islands take procedural names when first sighted ("discovered" toast). Clear one to its
${L('Treasure', 'hoard')} and the flag ceremony lets you <b>rename it at the peak</b> — your
name then appears on every chart, in gold. Port cities keep their own names ("⚓ Something
Harbour"); they were here before you.</p>

<h2>See also</h2>
<ul><li>${L('The_World')} — what the parchment is hiding</li></ul>
` },

/* ---------------------------------------------- Day-Night & Weather */
'Day-Night_and_Weather': { title: 'Day–Night and Weather', icon: '🌙', cats: ['World'], html: `
${hatnote(`“Storms” redirects here. For storm-only fish, see ${L('Fish')}.`)}
<p>The sky runs on a <b>210-second day</b> — about three and a half minutes from dawn, through
noon glare, into a navy night, and round again. A readout under the compass gives the time of
day and the weather. Both systems follow you ashore: an island raid at midnight happens in the
dark, with fireflies.</p>

<h2>Night</h2>
<ul>
  <li>${L('Ports', 'Port beacons')} blaze after dark — the easiest time to spot a harbour.</li>
  <li>Night species rise: Herring, Reef Squid, the Moonfin Drifter, the Abyss Lantern, and the
  ghostly ${L('Whales', 'Pale Sounder')} are night-only encounters.</li>
  <li>On islands, fireflies drift and the world tints navy; the ${L('Combat', 'fight')} rules
  don't change, but your nerves might.</li>
</ul>

<h2>Storms</h2>
<p>Weather drifts on slow noise; occasionally it builds into a proper blow — rain, gloom,
whitecaps, lightning and thunder, the boat rocking, and wind that is <b>stronger, gustier and
shiftier</b>. Storms are opportunity as much as hazard: the Storm Runner and the exotic Tempest
Ray school only in heavy weather, and a storm-time ${L('Whaling', 'sleigh ride')} is the most
cinematic thing in the game. Calm seas matter too — the Moonfin Drifter only schools when the
water is glass.</p>

<h2>What checks the sky</h2>
${scrollTable(`<table class="wikitable">
<thead><tr><th>System</th><th>Day/Night</th><th>Storm/Calm</th></tr></thead>
<tbody>
<tr><td>${L('Fish', 'Fish spawns')}</td><td class="ctr">✓ (night/day species)</td><td class="ctr">✓ (storm/calm species)</td></tr>
<tr><td>${L('Whales', 'Whale spawns')}</td><td class="ctr">✓ (Pale Sounder)</td><td class="ctr">—</td></tr>
<tr><td>${L('Sailing', 'Wind')}</td><td class="ctr">—</td><td class="ctr">✓ stronger &amp; gustier</td></tr>
<tr><td>Beacons / visibility</td><td class="ctr">✓</td><td class="ctr">✓ gloom</td></tr>
<tr><td>Island ambience</td><td class="ctr">✓ fireflies, navy tint</td><td class="ctr">✓ rain ashore</td></tr>
</tbody></table>`)}
<p>The ${L('Tuning_Panel', 'tuning panel')} can pin the time of day for playtesting (and for
screenshots of your boat at sunset, which is allowed).</p>
` },

/* ---------------------------------------------- Ports */
Ports: { title: 'Ports', icon: '⚓', cats: ['World'], html: `
${ib({ title: 'Port city', sub: 'beacon harbour', art: '<span style="font-size:52px">⚓</span>',
  rows: [
    ['Count', '~370 across the world'],
    ['Found by', 'Sailing near — “⚓ Port sighted”'],
    ['At night', 'Beacon blazes, visible far off'],
    ['Sell here', `${K('G')} — fish well + whale spoils`],
    ['Enterable?', `Not yet — see ${L('Upcoming_Features')}`],
  ]})}
<p><b>Port cities</b> are the civilised punctuation of the sea: several hundred named harbours
("Something Harbour" and cousins) marked by tall beacons that burn bright after dark. Sighting
one charts it permanently with its name.</p>

<h2>The fish merchant</h2>
<p>Ports currently have one service, and it is the one that matters: sail close and press
${K('G')} to <b>sell everything</b> in your ${L('Fishing', 'fish well')} and every
${L('Whaling', 'whale spoil')} on deck. A receipt itemises the catch (the wiki recommends
reading it aloud). Gold goes straight to the boat's purse.</p>
${scrollTable(`<table class="wikitable">
<thead><tr><th>Goods</th><th>Price</th></tr></thead>
<tbody>
<tr><td>Fish</td><td>1–25g each by ${L('Fish', 'species')}</td></tr>
<tr><td>🛢 Whale-oil cask</td><td class="num">8g</td></tr>
<tr><td>🦴 Baleen plate</td><td class="num">14g</td></tr>
<tr><td>🦄 Narwhal tusk</td><td class="num">45g</td></tr>
<tr><td>🫧 Ambergris</td><td class="num">60g</td></tr>
</tbody></table>`)}

<h2>The future of ports</h2>
<p>Walking ashore in a port, trading, boat upgrades and hiring a crew of five are the next major
item on the developer's roadmap — the gold sink that fishing and whaling were built to feed.
Until then, ports are merchants with excellent lighting. See ${L('Upcoming_Features')}.</p>
` },

/* ---------------------------------------------- Islands */
Islands: { title: 'Islands', icon: '🏝️', cats: ['World'], html: `
${hatnote(`This page covers islands at sea level. For what happens after landfall, see ${L('Island_Exploration')}.`)}
<p>Roughly <b>three thousand islands</b> freckle the world, from skerries to small kingdoms.
Each rolls a ${L('Biomes', 'biome')} from its position and seed — stable forever — and large
ones hide multi-clearing interiors, ${L('Great_Boar', 'guardians')} and
${L('Treasure', 'hoards')}.</p>

<h2>Discovery</h2>
<p>Sail near an unknown island and it is <b>discovered</b>: named, toasted, charted. Rare-biome
isles advertise themselves at distance with a coloured shimmer beacon over the water (pale blue
for ${L('Biomes', 'frost')}, ember for scorch, cyan for crystal) — worth a detour, always.</p>

<h2>Landfall</h2>
<p>Close with the coast and the prompt appears: <b>“⚓ Press E to explore 🌴 [name]”</b> — the
icon tells you the biome before you commit. ${K('E')} begins the
${L('Island_Exploration', 'exploration crawl')}. Your boat waits beached at the landing with a
glow ring; it is your bank, your exit, and your insurance policy.</p>

<h2>Clearing and claiming</h2>
<p>Fight along the island's path of clearings to the hoard, defeat the guardian, open the chest,
and the <b>flag ceremony</b> begins: a gold pennant rises at the peak (confetti is involved) and
you name the island. Claimed islands show:</p>
<ul>
  <li>a stone cairn and waving gold pennant on the island itself, visible from the sea;</li>
  <li>a gold ⚑ flag and your name in gold italics on the ${L('Charts_and_Cartography', 'charts')};</li>
  <li>a tick in the sea HUD's running count (<b>⚑ N cleared</b>) — and a check mark in the
  landfall prompt, since a cleared island stays cleared.</li>
</ul>
<p>You can still land on cleared islands to gather ${L('Loot', 'nodes')} at leisure — the
guardian does not respawn. The flag stays. It's your island now.</p>

<h2>See also</h2>
<ul><li>${L('Biomes')} — the ten kinds of island</li>
<li>${L('Treasure')} — hoards, caches and the buried ✕</li></ul>
` },

/* ---------------------------------------------- Island Exploration */
Island_Exploration: { title: 'Island Exploration', icon: '🏝️', cats: ['Gameplay'], html: `
${ib({ title: 'Island Exploration', sub: 'the landfall crawl', art: spr('explorer', 6), cap: 'The explorer, sword always in hand',
  rows: [
    ['Enter', `${K('E')} near a coast`],
    ['Leave', `${K('E')} at your beached boat`],
    ['Structure', 'Branching path of clearings'],
    ['Main path', '≈3–8 clearings by island size'],
    ['Side branches', '0–2, elite + cache chest'],
    ['Finale', `${L('Great_Boar', 'Great Boar')} + ${L('Treasure', 'hoard chest')}`],
    ['Move', `${K('W')}${K('A')}${K('S')}${K('D')} — 86 u/s`],
    ['On death', `Unbanked haul lost — see ${L('Combat', 'Combat § Death')}`],
  ]})}
<p>Press ${K('E')} at a coast and BOATS becomes a top-down crawl in the Stardew-mines spirit:
<b>clear the clearings</b>, follow the path, take the hoard, plant the flag. The camera drops
low, the pixels get finer, and the island keeps the sea's time of day and weather — night raids
are dark, storms rain inland.</p>

<h2>The shape of an island</h2>
<p>Every island generates a <b>branching tree</b> of clearings joined by worn paths:</p>
<ul>
  <li><b>The landing</b> — a shell-speckled beach with your boat. Banking and leaving happen here.</li>
  <li><b>Fight clearings</b> — each holds ${L('Boar', 'boars')}, ${L('Snake', 'vipers')} and
  ${L('Loot', 'loot nodes')}. Bramble gates seal the next clearing until this one is
  <b>secured</b> (all enemies down) — securing also patches you <b>+2 ♥</b>.</li>
  <li><b>The hoard</b> — end of the main path: the ${L('Great_Boar', 'Great Boar')} guards a
  big chest. Securing it starts the ${L('Treasure', 'chest → flag ceremony')} finale.</li>
</ul>
<p>Enemies are <b>arena-bound</b>: they engage only inside their own clearing, so the path
between fights is a breather, not an ambush.</p>

<h2>Side branches and elites</h2>
<p>Up to two bonus branches fork off the middle of the path, each ending in an <b>elite</b> —
a red-hided boar or a purple viper that spits a three-shot fan, at better than double health —
guarding a <b>cache chest</b>. Optional, profitable, and the elite knows why you came.</p>

<h2>The HUD</h2>
<p>A tracker shows the main path as dots (gold ★ for the hoard, diamonds for branches), enemies
remaining in the current clearing, your hearts, the dash pip, satchel count and the island's
<b>survey chart</b> fogging in as you walk (chests and the buried ✕ get marked when seen).
About half of all islands hide ${L('Treasure', 'buried treasure')} — three digs with ${K('E')}.</p>

<h2>Banking</h2>
<p>Loot rides in the 18-slot ${L('Satchel_and_Hold', 'satchel')} as an <i>unbanked trip haul</i>.
At the boat, ${K('E')} banks it into the 50-slot hold (most-precious first; gold always banks).
Bank early, bank often — a knockout forfeits everything unbanked.</p>

<h2>Leaving and the summary</h2>
<p>Sail off (or get carried off) and a <b>run summary</b> card settles the books: clearings
secured, kills, hoard taken, time ashore, what got banked — and, if the hold was full, what got
left on the beach. Cleared islands stay cleared forever and fly your ${L('Islands', 'flag')}.</p>

<h2>See also</h2>
<ul><li>${L('Combat')} — the sword, the bow, the dash</li>
<li>${L('Biomes')} — how the ten island types change the crawl</li></ul>
` },

/* ---------------------------------------------- Combat */
Combat: { title: 'Combat', icon: '⚔️', cats: ['Gameplay'], html: `
${hatnote(`“Death”, “Hearts” and “Dash” redirect here. For enemy stats, see ${L('Boar')}, ${L('Snake')} and ${L('Great_Boar')}.`)}
<p>Island combat is <b>simple and snappy</b>: one sword, one bow, one dash, readable telegraphs,
and stakes carried in your ${L('Satchel_and_Hold', 'satchel')} rather than an XP bar.</p>

<h2>The sword</h2>
<p>${K('J')} or <b>left-click</b> swings an instant arc (left-click aims at the cursor first).
The visible wedge <i>is</i> the hitbox — if the wedge touched it, you hit it.</p>
<ul>
  <li>Damage <b>2</b> · reach <b>30u</b> · cooldown <b>0.33s</b></li>
  <li>Hits stagger enemies (<b>0.2s hit-stun</b>) and shove them <b>20u</b> — walls respected;
  the shove can't push a viper through a cliff, sadly</li>
</ul>

<h2>The bow</h2>
<p>${K('K')} or <b>right-click</b> shoots an arrow where you face (or at the cursor). Damage
<b>1</b>, speed 215 u/s, <b>infinite arrows</b>, and they fly clean over water — the only way
to hit something across an ${L('Biomes', 'atoll lagoon')}. Mouse aim lets you retreat and shoot
in different directions at once, which the vipers consider cheating.</p>

<h2>The dash</h2>
<p>${K('Space')} bursts you ~54u in your held direction at nearly four times run speed, with a
<b>dodge-grace invulnerability</b> (0.26s) at the start and a particle afterimage for morale.
Cooldown <b>0.9s</b>, tracked by the ⚡ pip under your hearts. It is your answer to the
${L('Boar', 'boar charge')} and your ticket across a ${L('Biomes', 'lava crack')} about to flare.</p>

<h2>Health and healing</h2>
<ul>
  <li><b>5 hearts</b> base. Enemy contact and venom cost 1 heart; you get <b>1.1s</b> of
  invulnerability and a safe knockback after each hit.</li>
  <li><b>Securing a clearing: +2 ♥.</b> The island patches its conqueror.</li>
  <li><b>Heart drops</b>: enemies (~22%) and herbs (~15%) shed hearts; they only collect when
  you're hurt.</li>
  <li><b>Hot meals</b>: each fish ${L('Fishing', 'cooked at the galley')} before landfall adds a
  bonus heart, up to <b>7 total</b>. The meal is eaten when you sail away.</li>
  <li>At ≤2 hearts the screen warns you with a pulse and vignette. Listen to it.</li>
</ul>

<h2>Death</h2>
<p>Hit zero hearts ashore and you are carried back to sea. The price is the cartographer's
oldest rule: <b>everything unbanked is lost</b> — the entire trip haul. Banked cargo, gold,
charts, cleared flags and your dignity-adjacent fish log are all safe. There is no other death
penalty: no respawn timer, no equipment damage, no lecture (this page is the lecture).</p>

<h2>Tuning</h2>
<p>Every number here is a slider in the ${L('Tuning_Panel', 'tuning panel')}'s ⚔ section —
move speed, slash range/damage/cooldown, arrow speed, enemy HP and damage, dash cooldown,
magnet reach, satchel and hold size.</p>
` },

/* ---------------------------------------------- Boar */
Boar: { title: 'Boar', icon: '🐗', cats: ['Creatures'], html: `
${ib({ title: 'Boar', sub: 'island charger', art: spr('boar', 6), cap: 'Tusks first, questions later',
  rows: [
    ['Health', '4 (elite ×2.2 · boulder isles ×1.5)'],
    ['Damage', '1 ♥ contact'],
    ['Walk / charge', '60 / 150 u/s'],
    ['Telegraph', 'Trembles + “!” for 0.62s'],
    ['Found', `Most ${L('Biomes', 'biomes')}; scarce on savanna &amp; scorch`],
    ['Drops', `${L('Loot', 'Monster bits')}, gold, ~22% a heart`],
    ['Elite', 'Red-hided, guards cache chests'],
  ]})}
<p>The <b>boar</b> is the island's standing army: a bristled charger that trots the clearing
until it has an angle, trembles, flashes a <b>!</b> above its head for 0.62 seconds, and then
commits everything to a straight 150&nbsp;u/s charge.</p>

<h2>Fighting one</h2>
<p>The charge is the whole fight. It cannot turn once launched:</p>
<ol>
  <li>Wait for the <b>!</b> — that is your contract with the boar.</li>
  <li>Step or ${L('Combat', 'dash')} sideways; the grace window trivialises it once learned.</li>
  <li>Two sword hits finish a common boar; the hit-stun and shove keep it off you between swings.</li>
</ol>
<p>A trotting dust trail telegraphs even before the tremble. Boars engage only inside their own
clearing — from the path, they merely glare.</p>

<h2>Variants</h2>
${scrollTable(`<table class="wikitable">
<thead><tr><th>Variant</th><th>Where</th><th>What changes</th></tr></thead>
<tbody>
<tr><td><b>Elite boar</b> 🔴</td><td>${L('Island_Exploration', 'Side-branch')} cache clearings</td><td>Red hide, ×2.2 health (≈9), same telegraph, better loot behind it</td></tr>
<tr><td><b>Boulder boar</b></td><td>${L('Biomes', 'Boulder Field')} isles</td><td>×1.5 health — the rocks breed them stubborn</td></tr>
<tr><td><b>Frost boar</b></td><td>${L('Biomes', 'Frostbound')} isles</td><td>Pale hide, charges 25% harder — and you're on ice</td></tr>
<tr><td>${L('Great_Boar', 'Great Boar')}</td><td>Hoard clearings</td><td>A different conversation entirely — see its page</td></tr>
</tbody></table>`)}

<h2>Trivia</h2>
<ul><li>Savanna isles roll barely a third of normal boar weight, and scorched isles even fewer —
the vipers took over.</li></ul>
` },

/* ---------------------------------------------- Snake */
Snake: { title: 'Snake', icon: '🐍', cats: ['Creatures'], html: `
${ib({ title: 'Dark Viper', sub: 'keep-away spitter', art: spr('snake', 6), cap: 'Segmented, slithering, opinionated',
  rows: [
    ['Health', '2 (elite ×2.2 ≈ 4)'],
    ['Damage', '1 ♥ (venom or contact)'],
    ['Behaviour', 'Keeps distance, spits venom'],
    ['Venom', 'Bright ringed glob — dodgeable'],
    ['Found', `All ${L('Biomes', 'biomes')}; thick on scorched isles`],
    ['Drops', `${L('Loot', 'Monster bits')}, gold, ~22% a heart`],
    ['Elite', 'Purple, spits a 3-shot fan'],
  ]})}
<p>The <b>dark viper</b> is the island's artillery: a coiled, segmented snake that backpedals to
hold range and spits bright, ringed venom globs. The venom is loud on purpose — early builds
camouflaged it against the grass, a war crime since patched.</p>

<h2>Fighting one</h2>
<ul>
  <li><b>Close fast.</b> A viper at sword range is a dead viper — two pokes (one if your slash
  hits twice through hit-stun follow-up). The ${L('Combat', 'dash')} closes its keep-away gap
  in one beat.</li>
  <li><b>Or out-shoot it.</b> Mouse-aimed ${L('Combat', 'arrows')} while retreating beats venom
  while retreating; you have infinite ammunition and it does not.</li>
  <li>Sidestep venom on reflex — it travels straight and telegraphs bright.</li>
</ul>

<h2>Variants</h2>
${scrollTable(`<table class="wikitable">
<thead><tr><th>Variant</th><th>Where</th><th>What changes</th></tr></thead>
<tbody>
<tr><td><b>Elite viper</b> 🟣</td><td>${L('Island_Exploration', 'Side-branch')} caches</td><td>Purple, ×2.2 health, spits a <b>three-shot fan</b> — strafe through the gap, not away from it</td></tr>
<tr><td><b>Ember viper</b></td><td>${L('Biomes', 'Scorched')} isles</td><td>Ember-dark hide, venom ~15% faster, and they outnumber the boars heavily</td></tr>
<tr><td><b>Indigo viper</b></td><td>${L('Biomes', 'Crystal Hollow')} isles</td><td>Indigo sheen; same fight, better lighting</td></tr>
</tbody></table>`)}

<h2>Trivia</h2>
<ul><li>Vipers are the reason corridor-camping was nerfed out of the game: enemies only engage
inside their own clearing, so no more being sniped down a hallway.</li></ul>
` },

/* ---------------------------------------------- Great Boar */
Great_Boar: { title: 'Great Boar', icon: '👑', cats: ['Creatures'], html: `
${ib({ title: 'Great Boar', sub: 'guardian of the hoard', art: spr('boar', 7, { B:'#4a3322', D:'#382414', m:'#2a1c0e', e:'#ff4030' }), cap: 'The landlord',
  rows: [
    ['Health', '12 (3× a boar, never under 10)'],
    ['Damage', '1 ♥ contact — but see “double charge”'],
    ['Telegraph', '“!!” — then TWO chained charges'],
    ['Aggro range', '230u — the whole clearing'],
    ['Found', `Every ${L('Treasure', 'hoard')} clearing`],
    ['Guards', "The island's big chest"],
    ['Drops', `A heavy spray of ${L('Loot', 'loot')} + the chest unlock`],
  ]})}
<p>At the end of every island's main path stands the <b>Great Boar</b> — twice the bulk of its
cousins, three times the health, and the only thing between you and the
${L('Treasure', 'hoard chest')} it sleeps beside.</p>

<h2>The double charge</h2>
<p>Where a ${L('Boar', 'boar')} flashes <b>!</b>, the Great Boar flashes <b>!!</b> — and means
it. It charges, skids, and <b>immediately chains a second charge</b> along your new position.
The first dodge is free; the second is the fight. Treat the pair as one move: dodge, <i>hold</i>,
dodge again, then punish the long skid.</p>

<h2>Strategy</h2>
<ul>
  <li>It aggros at 230u — effectively the moment you enter the hoard clearing. Arrive healed
  (${L('Combat', 'secure')} the previous clearing for +2 ♥).</li>
  <li>Arrows during its trot phase are free chip damage; the sword belongs in the post-charge skid.</li>
  <li>The ${L('Combat', 'dash')} grace window beats both charges if your timing is honest.</li>
  <li>Frost-isle Great Boars on ice are the hardest fight in the game right now. Bank first.</li>
</ul>

<h2>The payoff</h2>
<p>Securing the hoard clearing unlocks the chest: ~38 pieces of ${L('Loot', 'loot')} erupt in a
fountain, the ${L('Islands', 'flag ceremony')} begins, and the island becomes yours. See
${L('Treasure')}.</p>
` },

/* ---------------------------------------------- Loot */
Loot: { title: 'Loot', icon: '💎', cats: ['Items'], html: `
${hatnote(`“Gold”, “Gems”, “Ore”, “Herb”, “Relic”, “Monster bits” and “Magnet” redirect here. For carrying capacity, see ${L('Satchel_and_Hold')}.`)}
<p>Island loot is <b>physical</b>: it bursts from rocks, chests and beaten enemies, bounces with
a little arc, settles, glitters — and then flies to you. Collecting is its own small joy, with a
rising-pitch pickup combo for vacuuming a whole spray.</p>

<h2>The six kinds</h2>
${scrollTable(`<table class="wikitable sortable">
<thead><tr><th>Item</th><th class="num">Preciousness</th><th>Takes space?</th><th>Main sources</th></tr></thead>
<tbody>
<tr><td>${spr('gold', 2, null, 'sprite-inline')} <b>Gold</b></td><td class="num" data-sort="0">— (coin)</td><td><b>No — weightless</b></td><td>Enemies, chests, ruins, ${L('Treasure', 'buried ✕')}, selling at ${L('Ports', 'ports')}</td></tr>
<tr><td>${spr('relic', 2, null, 'sprite-inline')} <b>Ancient relic</b></td><td class="num">5</td><td>Yes</td><td>Ruin nodes, chests, buried treasure (60%)</td></tr>
<tr><td>${spr('gem', 2, null, 'sprite-inline')} <b>Gem</b></td><td class="num">4</td><td>Yes</td><td>Rocks (esp. ${L('Biomes', 'boulder/crystal isles')}), chests</td></tr>
<tr><td>${spr('ore', 2, null, 'sprite-inline')} <b>Ore chunk</b></td><td class="num">3</td><td>Yes</td><td>Rock nodes (moor/scorch bonus)</td></tr>
<tr><td>${spr('herb', 2, null, 'sprite-inline')} <b>Wild herb</b></td><td class="num">2</td><td>Yes</td><td>Herb plants (ember/meadow bonus); ~15% shed a heart</td></tr>
<tr><td>🦴 <b>Monster bits</b></td><td class="num">1</td><td>Yes</td><td>Anything you out-fenced</td></tr>
</tbody></table>`)}
<p><b>Preciousness</b> drives two automatic systems: full-satchel
${L('Satchel_and_Hold', 'value-swaps')} and most-precious-first banking. (Selling island goods
for gold arrives with ${L('Upcoming_Features', 'port trading')} — for now they are points,
beautiful points.)</p>

<h2>The magnet</h2>
<p>Settled loot inside <b>95u</b> pulls toward you, accelerating as it closes, and collects at
13u. The reach is a ${L('Tuning_Panel', 'slider')}. Two graces keep it honest: loot mid-bounce
isn't grabbed until it settles (or 0.45s passes), and items you <i>can't</i> take — satchel full
of better things — don't chase you around jittering.</p>

<h2>Nodes</h2>
<p>Rocks, herbs and ruins are the gatherables. All telegraph: a glint sparkle, a pulsing
outline when in reach, crack stages as you hit them, a white flash on the breaking blow, and
remnants left on the ground so cleared ground reads cleared. Rocks want the sword; everything
wants the sword; the sword is also the shovel-adjacent tool of choice ashore.</p>

<h2>Heart drops</h2>
<p>Enemies (~22%) and herbs (~15%) drop hearts, which only collect while you're hurt — they sit
patiently otherwise. See ${L('Combat', 'Combat § Health')}.</p>

<h2>At sea</h2>
<p>The magnet works afloat too: ${L('Whaling', 'whale spoils')} bob where the whale slipped
under, and the boat scoops them on a slow pass. Net hauls go straight to the
${L('Fishing', 'well')} — fish do not bounce. Mostly.</p>
` },

/* ---------------------------------------------- Satchel & Hold */
Satchel_and_Hold: { title: 'Satchel and Hold', icon: '🎒', cats: ['Items'], html: `
${hatnote(`“Inventory” redirects here. For what fills it, see ${L('Loot')}.`)}
<p>BOATS has two pockets, and the game is the space between them: the <b>satchel</b> you carry
ashore, and the <b>hold</b> in the boat. Gold, being coin, never occupies either.</p>

<h2>The satchel — 18 slots</h2>
<p>Everything picked up ashore is the <i>unbanked trip haul</i>. When the satchel is full, the
game value-swaps for you, menu-free:</p>
<ul>
  <li>Pick up something <b>more precious</b> than your least-precious held item → the cheap one
  is ejected as a drop (the float reads <code>🦴 ⇄ 💎</code>) and the good one taken.</li>
  <li>Pick up something equal-or-worse → it bounces off with a <b>“Satchel full!”</b> and stops
  magneting at you.</li>
</ul>
<p>Press ${K('I')} for the satchel panel — the island pauses while it's open. Tiles show each
type with counts; <b>click a tile to drop one</b> deliberately (dropped items wait 2.5s before
they'll re-magnet, so they actually stay dropped).</p>

<h2>The hold — 50 slots</h2>
<p>At your beached boat, ${K('E')} banks the satchel into the hold, <b>most-precious first</b>
(relics down to bits); gold always banks. If the hold fills mid-banking, the overflow stays on
the beach and your ${L('Island_Exploration', 'run summary')} prints a quiet little
<i>“hold full — left on the beach”</i> line for your conscience. The sea HUD tracks
<b>🧺 Hold X/50 · 🪙 gold</b>.</p>

<h2>Why bank at all</h2>
<p>Because ${L('Combat', 'death')} forfeits the satchel, never the hold. The 18/50 split is the
game's push-your-luck dial: every clearing deeper is more haul at more risk. The numbers are
${L('Tuning_Panel', 'sliders')}, if your nerve and the developer's disagree.</p>

<h2>The fish well</h2>
<p>Fish live in neither pocket: the <b>well</b> holds 80 fish, separate from cargo, and empties
when ${L('Ports', 'sold')}. ${L('Whaling', 'Whale spoils')} ride the deck as their own tally.
Nobody wants relics smelling of mackerel.</p>
` },

/* ---------------------------------------------- Treasure */
Treasure: { title: 'Treasure', icon: '🪙', cats: ['World', 'Gameplay'], html: `
${ib({ title: 'Treasure', art: spr('chest', 6), cap: 'The hoard chest, post-Boar',
  rows: [
    ['Hoard chest', 'End of every main path'],
    ['Cache chests', 'End of side branches (0–2)'],
    ['Buried ✕', '~50% of islands · 3 digs'],
    ['Chest yield', '~38-piece loot eruption'],
    ['Buried yield', '5–8 gold, 1–2 gems, 60% a relic'],
    ['Then', 'Flag ceremony — name the island'],
  ]})}
<p>Every island's crawl bends toward <b>treasure</b>: a guarded hoard at the end of the main
path, optional caches up the side branches, and — on about half of all islands — a red ✕
that has been waiting longer than you have.</p>

<h2>The hoard</h2>
<p>The final clearing holds a big banded chest and its ${L('Great_Boar', 'Great Boar')}.
Secure the clearing and the chest unlocks; open it and <b>~38 pieces of loot erupt</b> in a
fountain of coins, gems, ore and the occasional relic — the single biggest payday ashore.
The ${L('Loot', 'magnet')} earns its keep here.</p>

<h2>The flag ceremony</h2>
<p>Taking the hoard starts the ceremony: a gold pennant rises at the island's peak over 1.4
seconds of confetti, the island is marked cleared, and you <b>name it</b> then and there, at
the summit, like a person in a painting. The name goes on every
${L('Charts_and_Cartography', 'chart')} in gold.</p>

<h2>Side caches</h2>
<p>Branch clearings end in a smaller cache chest behind an ${L('Island_Exploration', 'elite')}.
Same eruption, smaller scale, no ceremony — strictly business.</p>

<h2>Buried treasure</h2>
<p>Roughly half of all islands hide a buried cache, marked in the world by a worn ✕ (and on
your ${L('Charts_and_Cartography', 'survey chart')} in red once spotted). Stand on it and dig
with ${K('E')} — <b>three digs</b> — for a burst of gold (5–8), gems (1–2) and, six times in
ten, an ${L('Loot', 'ancient relic')}. The dig counter on the prompt counts you down; the third
shovelful always sounds different. That's not a mechanic. That's atmosphere.</p>

<h2>See also</h2>
<ul><li>${L('Satchel_and_Hold')} — carrying it all home without crying on the beach</li></ul>
` },

/* ---------------------------------------------- Biomes */
Biomes: { title: 'Biomes', icon: '💠', cats: ['World'], html: `
${hatnote(`Ten biomes are live (wave 1). Future waves are listed under ${L('Upcoming_Features')}.`)}
<p>Every ${L('Islands', 'island')} rolls one of <b>ten biomes</b> from its seed and its distance
from the world's centre — <b>distance is rarity</b> (the exact bands are on
${L('The_World', 'The World')}). The biome sets the island's palette, terrain, hazards, enemy
mix and loot leanings, and rare-tier isles even change the <i>sea</i> around them: their waters
host exclusive ${L('Fish', 'fish')} and ${L('Whales', 'whales')}, and a coloured shimmer beacon
marks them from far off.</p>

<h2>The ten</h2>
${scrollTable(`<table class="wikitable sortable">
<thead><tr><th>Biome</th><th>Tier</th><th>Character</th><th>What changes</th></tr></thead>
<tbody>
<tr><td>🌴 <b>Lush Tropic</b></td><td data-sort="0">${btier(0)}</td><td>The baseline isle — green, kind</td><td>Nothing; this is the control group</td></tr>
<tr><td>🌾 <b>Dry Savanna</b></td><td data-sort="0">${btier(0)}</td><td>Gold grass, sparse shade</td><td>Boars scarce (×0.65) · gold +25%</td></tr>
<tr><td>⛰️ <b>Highland Moor</b></td><td data-sort="0">${btier(0)}</td><td>Cool, stony uplands</td><td>Rocks ×1.7 · ore +25%</td></tr>
<tr><td>🍂 <b>Ember Wood</b></td><td data-sort="0">${btier(0)}</td><td>Permanent autumn</td><td>Herbs ×1.5 · herb yield +30%</td></tr>
<tr><td>🏝️ <b>Palm Atoll</b></td><td data-sort="0">${btier(0)}</td><td>A sand ring around a lagoon</td><td>All beach · gentler spawns (×0.7) · lagoon is unwalkable, arrows fly over it</td></tr>
<tr><td>🌸 <b>Wildflower Meadow</b></td><td data-sort="1">${btier(1)}</td><td>Flowers ×3, menace ×0.75</td><td>Herbs ×1.7 +30% yield · heart drops more common</td></tr>
<tr><td>🪨 <b>Boulder Field</b></td><td data-sort="1">${btier(1)}</td><td>Stone on stone</td><td>Rocks ×2.4 · <b>half of rocks bear gems</b> · boars ×1.5 HP</td></tr>
<tr><td>❄️ <b>Frostbound Isle</b></td><td data-sort="2">${btier(2)}</td><td>Ice patches, pale boars</td><td><b>Ice slides</b> (momentum!) · charges +25% · gems +35% · pale-blue sea beacon</td></tr>
<tr><td>🌋 <b>Scorched Isle</b></td><td data-sort="2">${btier(2)}</td><td>Lava-cracked waste</td><td><b>Lava cracks</b> (warn 1.1s → flare) · snake-heavy · gold +40% · ore +25% · ember beacon</td></tr>
<tr><td>💠 <b>Crystal Hollow</b></td><td data-sort="2">${btier(2)}</td><td>Gem clusters in indigo dusk</td><td>Crystal rocks · rocks ×1.8 · <b>gems +80%</b> · cyan beacon</td></tr>
</tbody></table>`)}

<h2>Palm Atoll</h2>
<p>The odd one out structurally: clearings ring a central lagoon instead of climbing inland.
The lagoon is open water — unwalkable on foot, but ${L('Combat', 'arrows')} fly straight over
it, which turns ring fights into archery problems. Foam edges, gentler enemies, postcard light.</p>

<h2>Frostbound Isle</h2>
<p>Ice patches carry momentum: you (and your dodges) <b>slide</b>. Boar charges hit 25% harder
and pale frost-boars look born to it. The payoff is gem-rich ground, Frostfin Char in the
surrounding water, and the only seas where a ${L('Whales', 'Narwhal')} swims.</p>

<h2>Scorched Isle</h2>
<p>Lava cracks idle, glow a 1.1-second warning, then flare for real damage — to you <i>and</i>
to enemies, which a patient explorer treats as free artillery. Boars barely tolerate the place
(×0.35); ember vipers with faster venom run it instead. Gold +40% is the hazard pay. Cinder
Carp school offshore, and the ${L('Whales', 'Cinderback')} runs warm in these seas.</p>

<h2>Crystal Hollow</h2>
<p>Rock nodes grow as crystal clusters and the gem multiplier (+80%) is the best in the game.
Indigo vipers, cyan beacon, Prism Tetra in the shallows. Cartographers describe the palette as
“worth the trip”; their satchels agree.</p>

<h2>The biome log</h2>
<p>First landfall on each biome toasts <b>“📒 New biome”</b> and adds it to your log — the
count rides the ${L('Charts_and_Cartography', 'map')} legend and your
${L('Island_Exploration', 'run summaries')}. Ten of ten is the quiet achievement of the
current build.</p>
` },

/* ---------------------------------------------- Fishing */
Fishing: { title: 'Fishing', icon: '🎣', cats: ['Gameplay', 'The Sea'], html: `
${ib({ title: 'Fishing', sub: 'open-world ring-netting', art: spr('fish', 6), cap: 'The quarry, pre-net',
  rows: [
    ['Method', 'Encircle the school with a cork-line'],
    ['Start / finish', `${K('F')} pays out · cross your own line`],
    ['Net length', '650u of line'],
    ['Net capacity', '26 strain before tearing'],
    ['Cinch time', '2.2s (the tense part)'],
    ['Torn net', '26s to mend'],
    ['The well', 'Holds 80 fish until sold'],
    ['Sell / cook / log', `${K('G')} at ports · ${K('C')} · ${K('L')}`],
  ]})}
<p><b>Fishing</b> happens in the open world, no minigame screen: schools swim as visible
shimmers near the boat, and you catch them with seamanship. The core verb is
<b>encircle the school</b>.</p>

<h2>The ring</h2>
<ol>
  <li><b>${K('F')}</b> pays a cork-line out from the stern — up to 650u of it.</li>
  <li><b>Sail a loop</b> around the school. The floating line blocks the school's escape.</li>
  <li><b>Cross your own line.</b> The ring closes and cinches over 2.2 seconds; every fish
  inside the polygon is caught.</li>
</ol>
<p>Loop size is the greed lever. Each species has a <b>strain</b> value (a Sardine is 0.3, an
Ocean Sunfish is 9.0); if the catch totals past <b>26</b>, the mesh <b>tears mid-cinch</b> —
the strain meter snaps at the cap tick, the overflow escapes, and you spend 26 seconds mending.
Run out of line before closing the ring and it's a 4-second re-rig instead. Both failures are
tuition.</p>

<h2>The school is not an idiot</h2>
<ul>
  <li><b>Skittish</b> species scatter off a moving hull or a dragged cork-line — approach slow,
  lay the ring wide.</li>
  <li><b>Divers</b> sense the gap in your ring and bolt through it if you close too lazily —
  and some (Reef Squid especially) roll to slip <i>under</i> the corks at the cinch.</li>
  <li>Gulls wheel over <b>rare and exotic</b> schools, species-coloured glow marks the water,
  and big fish jump. The sea advertises; you read.</li>
</ul>

<h2>The well, selling, and the log</h2>
<p>Hauls leap aboard in a fountain and tally species by species into the <b>well</b> (80 fish).
Sell at any ${L('Ports', 'port')} with ${K('G')} for an itemised receipt. The <b>fish log</b>
(${K('L')}) tracks every species caught — count, best length, and a condition hint for the ones
you haven't met (❔ tiles tell you <i>where to look</i>, not what it is).</p>

<h2>The galley (cooking)</h2>
<p>${K('C')} cooks your <b>cheapest</b> fish into a hot meal — up to two waiting in the pot.
Each meal is a <b>bonus heart on your next landfall</b> (so up to 7 ♥ ashore); the meals are
eaten when you sail away. The galley is the only thing in BOATS that prefers your worst fish.</p>

<h2>What schools where</h2>
<p>Spawns check depth, time, weather and ${L('Biomes', 'biome waters')} — the full 20-species
table with all conditions lives at ${L('Fish')}. Rule of thumb: shorelines for shallow species,
the far deep for monsters, night and storms for the strange ones, and rare-biome coasts for
their exclusives.</p>
` },

/* ---------------------------------------------- Fish */
Fish: { title: 'Fish', icon: '🐟', cats: ['Creatures', 'The Sea'], html: `
${hatnote(`This is the species list. For how to catch them, see ${L('Fishing')}.`)}
<p>Twenty species school in the world's waters, in four tiers. <b>Val</b> is the sale price at
${L('Ports', 'port')}; <b>strain</b> is what each fish costs against the net's capacity of 26
(catch strain, not personality — though for the Sunfish, both). Click a column to sort.</p>
${scrollTable(`<table class="wikitable sortable">
<thead><tr><th>Species</th><th>Tier</th><th class="num">Val</th><th>School</th><th>Size (cm)</th><th class="num">Strain</th><th>Waters</th><th>The log says</th></tr></thead>
<tbody>
<tr><td>🐟 <b>Sardine</b></td><td data-sort="0">${ftier(0)}</td><td class="num">1g</td><td>10–18</td><td>8–15</td><td class="num">0.3</td><td>Anywhere</td><td class="sub">gentle waters, any time</td></tr>
<tr><td>🐟 <b>Mackerel</b></td><td data-sort="0">${ftier(0)}</td><td class="num">2g</td><td>8–14</td><td>25–40</td><td class="num">0.6</td><td>Anywhere</td><td class="sub">open water, fair weather</td></tr>
<tr><td>🐟 <b>Mullet</b></td><td data-sort="0">${ftier(0)}</td><td class="num">2g</td><td>7–12</td><td>28–45</td><td class="num">0.6</td><td>Shallows</td><td class="sub">close along the shorelines</td></tr>
<tr><td>🐟 <b>Herring</b></td><td data-sort="0">${ftier(0)}</td><td class="num">2g</td><td>10–16</td><td>20–32</td><td class="num">0.45</td><td>Night</td><td class="sub">rises after dusk</td></tr>
<tr><td>🐟 <b>Flying Fish</b></td><td data-sort="1">${ftier(1)}</td><td class="num">4g</td><td>6–10</td><td>22–34</td><td class="num">0.5</td><td>Day</td><td class="sub">leaping in open daylight</td></tr>
<tr><td>🐠 <b>Reef Snapper</b></td><td data-sort="1">${ftier(1)}</td><td class="num">4g</td><td>5–9</td><td>30–55</td><td class="num">1.1</td><td>Shallows</td><td class="sub">warm shallows by the isles</td></tr>
<tr><td>🦑 <b>Reef Squid</b></td><td data-sort="1">${ftier(1)}</td><td class="num">5g</td><td>5–9</td><td>25–45</td><td class="num">0.7</td><td>Night</td><td class="sub">night waters — slips under nets</td></tr>
<tr><td>🐟 <b>Bonito</b></td><td data-sort="1">${ftier(1)}</td><td class="num">4g</td><td>5–8</td><td>40–60</td><td class="num">1.0</td><td>Anywhere</td><td class="sub">a fast open-water hunter</td></tr>
<tr><td>🐡 <b>Grouper</b></td><td data-sort="1">${ftier(1)}</td><td class="num">6g</td><td>2–4</td><td>60–110</td><td class="num">3.0</td><td>Deep</td><td class="sub">a heavy lurker of the deeps</td></tr>
<tr><td>🐟 <b>Amberjack</b></td><td data-sort="1">${ftier(1)}</td><td class="num">5g</td><td>4–7</td><td>50–80</td><td class="num">1.4</td><td>Deep</td><td class="sub">deep, restless water</td></tr>
<tr><td>⚡ <b>Storm Runner</b></td><td data-sort="2">${ftier(2)}</td><td class="num">10g</td><td>4–8</td><td>45–70</td><td class="num">1.0</td><td>Storms</td><td class="sub">only ever seen in a blow</td></tr>
<tr><td>🌙 <b>Moonfin Drifter</b></td><td data-sort="2">${ftier(2)}</td><td class="num">9g</td><td>4–7</td><td>35–55</td><td class="num">0.8</td><td>Calm night</td><td class="sub">calm, moonlit seas</td></tr>
<tr><td>🗡️ <b>Spiketail Marlin</b></td><td data-sort="2">${ftier(2)}</td><td class="num">12g</td><td>1–3</td><td>160–280</td><td class="num">5.0</td><td>Deep</td><td class="sub">the wide deep — fights the mesh</td></tr>
<tr><td>🐡 <b>Ocean Sunfish</b></td><td data-sort="2">${ftier(2)}</td><td class="num">11g</td><td>1–2</td><td>120–240</td><td class="num">9.0</td><td>Deep, day</td><td class="sub">sunning itself far offshore</td></tr>
<tr><td>❄️ <b>Frostfin Char</b></td><td data-sort="2">${ftier(2)}</td><td class="num">12g</td><td>4–7</td><td>40–60</td><td class="num">1.2</td><td>${L('Biomes', 'Frost waters')}</td><td class="sub">the frozen waters</td></tr>
<tr><td>🔥 <b>Cinder Carp</b></td><td data-sort="2">${ftier(2)}</td><td class="num">12g</td><td>4–7</td><td>45–70</td><td class="num">1.8</td><td>${L('Biomes', 'Scorch waters')}</td><td class="sub">ember-warmed seas</td></tr>
<tr><td>💠 <b>Prism Tetra</b></td><td data-sort="2">${ftier(2)}</td><td class="num">13g</td><td>8–14</td><td>12–20</td><td class="num">0.4</td><td>${L('Biomes', 'Crystal waters')}</td><td class="sub">crystal-bright waters</td></tr>
<tr><td>👑 <b>Golden Koi</b></td><td data-sort="3">${ftier(3)}</td><td class="num">25g</td><td>1–2</td><td>40–75</td><td class="num">1.5</td><td>Anywhere — ultra-rare</td><td class="sub">a rumor in any sea</td></tr>
<tr><td>🏮 <b>Abyss Lantern</b></td><td data-sort="3">${ftier(3)}</td><td class="num">16g</td><td>3–5</td><td>30–50</td><td class="num">1.3</td><td>Deep night</td><td class="sub">the deep, after dark</td></tr>
<tr><td>🌩️ <b>Tempest Ray</b></td><td data-sort="3">${ftier(3)}</td><td class="num">20g</td><td>1–2</td><td>140–260</td><td class="num">6.5</td><td>Deep storms</td><td class="sub">storm over deep water</td></tr>
</tbody></table>`)}

<h2>Reading the table like a fisherman</h2>
<ul>
  <li><b>Strain × school size is the real number.</b> Fourteen Prism Tetra cost 5.6 strain —
  net the lot. Three Marlin cost 15 — pick your loop. Two Sunfish cost 18 — one at a time,
  sailor.</li>
  <li><b>"Biome waters"</b> means within sensing range (~950u) of a rare-tier isle's coast —
  the shimmer-beacon islands. See ${L('Biomes')}.</li>
  <li>The <b>Golden Koi</b> ignores every rule, appears anywhere, and is worth 25g of pure
  smugness. The log's ❔ hint for it reads simply: <i>a rumor in any sea</i>.</li>
  <li>Speed and skittishness aren't listed — on the water they translate to: fast fish need a
  wider, earlier ring; nervy fish need a slow, sail-down approach. The worst offenders
  (Flying Fish, Prism Tetra, Moonfin) will teach you personally.</li>
</ul>
` },

/* ---------------------------------------------- Whaling */
Whaling: { title: 'Whaling', icon: '🐋', cats: ['Gameplay', 'The Sea'], html: `
${ib({ title: 'Whaling', sub: 'the iron and the ride', art: spr('whale', 6), cap: 'A spout on the horizon',
  rows: [
    ['Find', 'Rare spouts roaming the deep'],
    ['Throw', 'Left-click — mouse-aimed iron, ~130u'],
    ['Hit zones', 'Flank stick · flukes glance · head angers'],
    ['The ride', `${K('A')}/${K('D')} track · ${K('W')} haul · ${K('S')} give line`],
    ['Line', '420u — strain parts it'],
    ['Hull', "100 — at 0 you're swamped (60s limp)"],
    ['Prize', 'Floating spoils — casks, baleen, ambergris'],
    ['Roster', `${L('Whales', '10 species')} + ${L('The_White', 'one legend')}`],
  ]})}
<p><b>Whaling</b> is the game's boss fight, played with sails. A spout on the deep-water horizon,
a cry of <i>“Thar she blows!”</i> with a bearing — and then a hunt in four movements.</p>

<h2>1. The approach</h2>
<p>Every species has a <b>wariness</b>. Come in under fast sail and a wary whale alarms — a
warning float, then she <b>sounds</b> (dives) and is gone. Drop sail early and <i>glide</i> the
last stretch, or read her dive rhythm and ambush the resurface. Grazers like the Right Whale
barely care; the ${L('Whales', 'Pale Sounder')} (wariness 1.4) is practically a rumour.</p>

<h2>2. The iron</h2>
<p>Left-click throws the harpoon, mouse-aimed with a real flight arc — <b>lead the swim</b>.
Where it lands matters:</p>
<ul>
  <li><b>Flank</b> (the long middle) — clean stick. The hunt is on.</li>
  <li><b>Flukes</b> (the tail) — <b>glances off</b>. Approaching from dead astern is the classic
  novice error; come abeam.</li>
  <li><b>Head</b> — sticks, but <b>angers</b> her: wilder thrashing, more hull risk, a worse
  ride. The Cinderback (anger 1.2) on a head-stick is an apology in waiting. THE WHITE on a
  head-stick (anger 2) is an obituary.</li>
</ul>

<h2>3. The sleigh ride</h2>
<p>Stuck fast, your sail drops — <b>she is the engine now</b>. The fight is a conversation
between three gauges:</p>
<ul>
  <li><b>Strain</b> — builds when your heading fights hers and when you haul close-hauled.
  Track her turns with ${K('A')}/${K('D')}; misalignment is what parts the line.</li>
  <li><b>Line</b> — 420u in stock. ${K('W')} hauls in (tires her ~2.3× faster up close, strain
  up); ${K('S')} pays out (strain bleeds off fast, line is finite). Snagging the line on rocks
  is bad news for both gauges — steer the channel, not the shortcut.</li>
  <li><b>Hull</b> — 100 points, at risk only in the fight: thrashing in the red, rock snags,
  breach slams, and one whale that ${L('The_White', 'rams')}. At 0 you're <b>swamped</b>:
  she escapes, you limp at half sail for a minute, and nothing else is lost. The sea is fair;
  embarrassment is included free.</li>
</ul>
<p><b>Giants sound in rounds.</b> Below stamina thresholds she dives — pay out line <i>fast</i>
or lose the iron; survive it and the iron draws clean, leaving her loose, tired and trailing
bubbles. Chase, wait for the rise, stick her again. A Sperm Whale is a three-round fight; THE
WHITE goes four. Stamina regenerates while she's loose (+1.1/s) — dawdling between rounds is
how hunts are lost.</p>

<h2>4. Spoils</h2>
<p>Spent, she wallows and slips under, leaving a bobbing field of spoils to
${L('Loot', 'magnet-scoop')}: <b>🛢 whale-oil casks (8g)</b>, <b>🦴 baleen plates (14g)</b>,
<b>🦄 narwhal tusks (45g)</b> and the lottery ticket, <b>🫧 ambergris (60g)</b>. Sold at any
${L('Ports', 'port')} with the fish. Whales join the ${L('Fishing', 'log')} (${K('L')}) with
your greatest length in metres.</p>

<h2>See also</h2>
<ul><li>${L('Whales')} — the full roster and stats</li>
<li>${L('The_White')} — read before you meet him</li></ul>
` },

/* ---------------------------------------------- Whales */
Whales: { title: 'Whales', icon: '🐳', cats: ['Creatures', 'The Sea'], html: `
${hatnote(`This is the species list. For the hunt itself, see ${L('Whaling')}. For the legend, see ${L('The_White')}.`)}
<p>Ten leviathans swim the world. <b>Rounds</b> is how many dive-cycles a full hunt runs;
<b>run</b> is her flight speed against your 96 u/s at full sail; <b>wary</b> is how gently you
must approach (0 = placid, 1.4 = a ghost). Spoils are listed per successful hunt.</p>
${scrollTable(`<table class="wikitable sortable">
<thead><tr><th>Whale</th><th>Tier</th><th>Length</th><th class="num">Run</th><th class="num">Stamina</th><th class="num">Rounds</th><th class="num">Wary</th><th>Waters</th><th>Spoils</th></tr></thead>
<tbody>
<tr><td>🐬 <b>Pilot Whale</b></td><td data-sort="0">${wtier(0)}</td><td>5–7m</td><td class="num">70</td><td class="num">38</td><td class="num">1</td><td class="num">0</td><td>Anywhere</td><td>🛢 2–3</td></tr>
<tr><td>🐋 <b>Minke Whale</b></td><td data-sort="0">${wtier(0)}</td><td>7–10m</td><td class="num">82</td><td class="num">50</td><td class="num">1</td><td class="num">0.4</td><td>Anywhere</td><td>🛢 3–4</td></tr>
<tr><td>🐳 <b>Humpback</b></td><td data-sort="1">${wtier(1)}</td><td>13–17m</td><td class="num">86</td><td class="num">80</td><td class="num">2</td><td class="num">0.6</td><td>Anywhere</td><td>🛢 4–6 · 🦴 1–2</td></tr>
<tr><td>🐋 <b>Right Whale</b></td><td data-sort="1">${wtier(1)}</td><td>14–18m</td><td class="num">60</td><td class="num">95</td><td class="num">2</td><td class="num">0.2</td><td>Anywhere</td><td>🛢 5–7 · 🦴 2–3</td></tr>
<tr><td>🐋 <b>Sperm Whale</b></td><td data-sort="2">${wtier(2)}</td><td>16–20m</td><td class="num">100</td><td class="num">120</td><td class="num">3</td><td class="num">0.8</td><td>Deep</td><td>🛢 6–8 · 🫧 45%</td></tr>
<tr><td>🐳 <b>Blue Whale</b></td><td data-sort="2">${wtier(2)}</td><td>24–33m</td><td class="num">92</td><td class="num">150</td><td class="num">3</td><td class="num">0.7</td><td>Deep</td><td>🛢 10–14 · 🦴 4–6</td></tr>
<tr><td>🦄 <b>Narwhal</b></td><td data-sort="3">${wtier(3)}</td><td>4–6m</td><td class="num">104</td><td class="num">45</td><td class="num">1</td><td class="num">1.2</td><td>${L('Biomes', 'Frost waters')}</td><td>🦄 1 · 🛢 1–2</td></tr>
<tr><td>🔥 <b>Cinderback</b></td><td data-sort="3">${wtier(3)}</td><td>10–14m</td><td class="num">96</td><td class="num">85</td><td class="num">2</td><td class="num">0.7</td><td>${L('Biomes', 'Scorch waters')}</td><td>🛢 4–6 · 🫧 20%</td></tr>
<tr><td>👻 <b>Pale Sounder</b></td><td data-sort="3">${wtier(3)}</td><td>9–13m</td><td class="num">90</td><td class="num">80</td><td class="num">2</td><td class="num">1.4</td><td>Deep, night only</td><td>🛢 4–6 · 🫧 30%</td></tr>
<tr><td>🤍 <b>${L('The_White', 'THE WHITE')}</b></td><td data-sort="4">${wtier(4)}</td><td>20–22m</td><td class="num">115</td><td class="num">190</td><td class="num">4</td><td class="num">1.0</td><td>Deep — once per world</td><td>🛢 12–16 · 🫧 ×2</td></tr>
</tbody></table>`)}

<h2>Field notes</h2>
<ul>
  <li><b>Pilot and Minke</b> are the teaching hunts: one round, short ride, forgiving line.</li>
  <li>The <b>Humpback</b> breaches mid-fight — spectacular, and a hull slam if she lands close.</li>
  <li>The <b>Right Whale</b> is the classic economy hunt: slow (run 60), placid (wary 0.2),
  heavy in the water (strain ×1.25). The name was always a review.</li>
  <li>The <b>Sperm Whale</b> is fierce (anger 0.9 — keep irons off the brow) and the best
  ambergris odds shy of the legend.</li>
  <li>The <b>Blue Whale</b> barely angers but pulls like a moving island: strain ×1.6 is the
  highest in the game. Bring patience and all 420u of line.</li>
  <li><b>Narwhal, Cinderback, Pale Sounder</b> are the strange-sea trio — biome and night
  exclusives that make the far ocean worth hunting. The Narwhal can outrun you (104); cut
  corners on her turns.</li>
  <li>Three whales outrun a full sail (96): Sperm, Narwhal, and ${L('The_White', 'the one')}.
  Hunting them is the argument for hauling close and tiring fast.</li>
  <li>Whale song carries underwater before you see a spout. The eerie variant means the pale
  ones. Trust the spine.</li>
</ul>
` },

/* ---------------------------------------------- The White */
The_White: { title: 'The White', icon: '🤍', cats: ['Creatures', 'The Sea'], html: `
${ib({ title: 'THE WHITE', sub: 'the one the songs warn about', art: spr('whale', 7, { B:'#f6f9fb', b:'#e8ecf0', w:'#d8dee6', f:'#d8dee6', s:'#eef6ff' }), cap: 'Scarred, pale, patient',
  rows: [
    ['Tier', wtier(4)],
    ['Length', '20–22m'],
    ['Encounter', '<b>Once per world</b> — a named bull'],
    ['Run speed', '115 u/s (you make 96)'],
    ['Stamina', '190 · <b>4 dive-rounds</b>'],
    ['Temper', 'Anger 2 — and he <b>RAMS</b>'],
    ['Ram', '170 u/s charge · −45 hull on impact'],
    ['Spoils', '🛢 12–16 casks · 🫧 ambergris ×2'],
    ['Legacy', 'Permanent trophy in the log'],
  ]})}
<p>Each world holds exactly one <b>WHITE</b> — a vast, scarred white bull, vanishingly rare,
named, and the only whale in the sea that fights back on purpose. By night he carries a pale
halo in the water. Sailors who have seen it mostly talk about something else.</p>

<h2>The fight</h2>
<p>Everything in ${L('Whaling', 'the hunt')} applies, at the top of every dial — 190 stamina,
four full dive-cycles, run speed that beats your best sail, strain ×1.4 — plus one rule that is
his alone: <b>the ram</b>. He turns, telegraphs, and charges the <i>boat</i> at 170 u/s; impact
costs <b>45 hull</b> of your 100 and shoves the boat bodily. Two rams and a thrash is a swamping.
Full Essex rules, for him alone.</p>

<h2>Doctrine</h2>
<ul>
  <li><b>Never the head.</b> Anger 2 means a head-stick turns the fight feral. Flank, always.</li>
  <li><b>Respect the telegraph.</b> When he squares up, your job is steering, not hauling —
  beat the ram with an early turn; his charge runs straight.</li>
  <li><b>Budget four rounds.</b> Pay out fast on every sound; he strips line quicker than
  anything alive. Dawdle between rounds and his 190 stamina walks back up at +1.1/s.</li>
  <li><b>Go in whole.</b> Full hull, mended net stowed, no half-finished hunts. He is not a
  target of opportunity; he is the appointment.</li>
</ul>

<h2>The trophy</h2>
<p>Take him and the world records it permanently: the richest spoils field in the game (twelve
to sixteen casks and a <i>double</i> ambergris) and a trophy entry in the log that no later
voyage on that save can repeat. There is exactly one. That is the whole point of him.</p>

<h2>Trivia</h2>
<ul>
  <li>His ram fixed a real bug: early homing maths had a dead zone directly astern — the classic
  fleeing-whale blind spot — discovered, fittingly, by the only whale that charges.</li>
  <li>The fish log files him under <i>LEGEND</i>, a tier with one resident.</li>
</ul>
` },

/* ---------------------------------------------- Controls */
Controls: { title: 'Controls', icon: '⌨️', cats: ['Reference'], html: `
${hatnote(`Keyboard and mouse, desktop browser. Keys are remappable only by sailing tradition (i.e. not yet).`)}
<h2>At sea</h2>
${scrollTable(`<table class="wikitable">
<thead><tr><th>Input</th><th>Action</th></tr></thead>
<tbody>
<tr><td>${K('W')} / ${K('↑')}</td><td>Raise sail (hold)</td></tr>
<tr><td>${K('S')} / ${K('↓')}</td><td>Furl sail · keep holding to back slowly astern</td></tr>
<tr><td>${K('A')} ${K('D')} / ${K('←')} ${K('→')}</td><td>Steer</td></tr>
<tr><td>${K('Space')}</td><td>Drop sail fast</td></tr>
<tr><td>${K('E')}</td><td>${L('Islands', 'Make landfall')} (near a coast)</td></tr>
<tr><td>${K('F')}</td><td>Pay out / reel in the ${L('Fishing', 'cork-line')}</td></tr>
<tr><td><b>Left-click</b></td><td>Throw the ${L('Whaling', 'harpoon')} (when a whale is about)</td></tr>
<tr><td>${K('G')}</td><td>${L('Ports', 'Sell')} fish &amp; spoils (at a port)</td></tr>
<tr><td>${K('C')}</td><td>${L('Fishing', 'Cook')} the cheapest fish (bonus ♥ ashore)</td></tr>
<tr><td>${K('L')}</td><td>Fish &amp; whale log</td></tr>
<tr><td>${K('M')}</td><td>${L('Charts_and_Cartography', 'Parchment map')}</td></tr>
<tr><td>${K('+')} / ${K('−')}</td><td>Camera zoom</td></tr>
<tr><td>${K('P')}</td><td>Mute / unmute</td></tr>
<tr><td>${K('T')}</td><td>${L('Tuning_Panel', 'Tuning panel')}</td></tr>
</tbody></table>`)}

<h2>Map open</h2>
${scrollTable(`<table class="wikitable">
<thead><tr><th>Input</th><th>Action</th></tr></thead>
<tbody>
<tr><td>Scroll wheel</td><td>Zoom toward cursor</td></tr>
<tr><td>Click-drag</td><td>Pan</td></tr>
<tr><td>${K('W')}${K('A')}${K('S')}${K('D')} / arrows</td><td>Pan</td></tr>
<tr><td>${K('+')} / ${K('−')}</td><td>Zoom</td></tr>
<tr><td>${K('M')}</td><td>Close</td></tr>
</tbody></table>`)}

<h2>Ashore (island mode)</h2>
${scrollTable(`<table class="wikitable">
<thead><tr><th>Input</th><th>Action</th></tr></thead>
<tbody>
<tr><td>${K('W')}${K('A')}${K('S')}${K('D')}</td><td>Move</td></tr>
<tr><td>${K('J')} / <b>left-click</b></td><td>${L('Combat', 'Sword slash')} (click aims at cursor)</td></tr>
<tr><td>${K('K')} / <b>right-click</b></td><td>${L('Combat', 'Shoot an arrow')} (click aims at cursor)</td></tr>
<tr><td>${K('Space')}</td><td>${L('Combat', 'Dash')} (0.9s cooldown, dodge-grace)</td></tr>
<tr><td>${K('E')}</td><td>Context: open chest › ${L('Treasure', 'dig')} › bank &amp; board at the boat</td></tr>
<tr><td>${K('I')}</td><td>${L('Satchel_and_Hold', 'Satchel panel')} (pauses; click a tile to drop one)</td></tr>
<tr><td>${K('P')} · ${K('T')}</td><td>Mute · tuning panel (work everywhere)</td></tr>
</tbody></table>`)}

<h2>Panels</h2>
<p>Summary cards, the satchel and the log all close with ${K('E')}, ${K('Esc')}, their own key,
or a click outside. The game pauses the island while the satchel is open; the sea, like the sea,
does not pause.</p>
` },

/* ---------------------------------------------- Tuning Panel */
Tuning_Panel: { title: 'Tuning Panel', icon: '🎛️', cats: ['Reference'], html: `
${hatnote(`Press ${K('T')} at any time. Values persist on your machine and ship with the developer's play-tested defaults.`)}
<p>BOATS is tuned by feel, and the <b>tuning panel</b> is that philosophy bolted into the game:
live sliders for nearly every number that matters, grouped by system, applied instantly. It
doubles as the playtest/debug menu.</p>

<h2>Sections</h2>
${scrollTable(`<table class="wikitable">
<thead><tr><th>Section</th><th>Sliders (defaults)</th></tr></thead>
<tbody>
<tr><td><b>⛵ Sailing</b></td><td>Top speed (96) · pickup (1.4) · coast/glide (0.42) · turn (1.5) · wind matters (0.55) · wind shiftiness (1.0) · zoom (1.0)</td></tr>
<tr><td><b>⚔ Island combat</b></td><td>Move speed (86) · slash range (30), damage (2), cooldown (0.33) · arrow speed (215), damage (1) · boar HP (4), speed (60), charge (150) · snake HP (2) · enemy damage (1) · spawn count (×1) · clearing size (×1) · magnet reach (95) · satchel (18) · hold (50) · dash cooldown (0.9)</td></tr>
<tr><td><b>🎣 Fishing</b></td><td>Net length (650) · cinch time (2.2s) · net capacity (26) · spook radius (34) · school speed (×1) · spawn rate (×1) · mend time (26s) · well size (80)</td></tr>
<tr><td><b>🐋 Whaling</b></td><td>Spawn rate (×1) · run speed (×1) · strain rate (×1) · line max (420) · reel speed (34) · stamina (×1) · hull max (100) · throw range (130) · wariness (×1)</td></tr>
</tbody></table>`)}

<h2>Playtest tools</h2>
<ul>
  <li><b>Debug spawns</b>: buttons to summon fish schools by tier (Common/Uncommon/Rare/Exotic/Biome)
  and whales by species (Pilot/Humpback/Sperm/Blue/Exotic/<b>WHITE</b>) — the only legal way to
  schedule an appointment with ${L('The_White', 'the legend')}.</li>
  <li><b>Force weather/time</b>: pin night or storm, or let the sky run free.</li>
  <li><b>Fog of war on/off</b>: reveals the chart for testing; your real explored record is kept
  separately, so honesty survives curiosity.</li>
  <li><b>Copy values</b>: exports your slider settings as text — the official channel for
  arguing with the developer about glide.</li>
</ul>
<p>Tuned values save locally and persist between sessions; sailing feel and combat feel are
versioned separately by the game, so a balance patch may reset one section's sliders to new
defaults while leaving the rest alone.</p>
` },

/* ---------------------------------------------- Version History */
Version_History: { title: 'Version History', icon: '📜', cats: ['Reference'], html: `
${hatnote(`Newest first. BOATS updates ship continuously; this log tracks the meaningful builds.`)}
<p>BOATS released its sailing core on 9 June 2026 and has been updated at ramming speed since.</p>
${scrollTable(`<table class="wikitable">
<thead><tr><th>Date</th><th>Build</th><th>Update</th><th>What it brought</th></tr></thead>
<tbody>
<tr><td>10 Jun 2026</td><td class="mono">61cf246</td><td><b>The Iron and the Ride</b></td><td>${L('Whaling')}: spouts, hit-zones, the sleigh ride, dive-cycles, hull strain, spoils, 10 ${L('Whales', 'species')} incl. ${L('The_White', 'THE WHITE')}, whale song</td></tr>
<tr><td>10 Jun 2026</td><td class="mono">c04ceee</td><td><b>Ring-Netting</b></td><td>${L('Fishing')}: the cork-line, strain &amp; tearing, school AI, 20 ${L('Fish', 'species')}, the well, ${L('Ports', 'selling')}, cooking, the log</td></tr>
<tr><td>10 Jun 2026</td><td class="mono">5b3882c</td><td><b>Biomes, Wave 1</b></td><td>10 ${L('Biomes', 'island biomes')} with distance-based rarity, ice slides, lava cracks, crystal nodes, sea beacons, the biome log</td></tr>
<tr><td>10 Jun 2026</td><td class="mono">e9bafd2</td><td><b>Satchel, Mouse &amp; Dash</b></td><td>${K('I')} ${L('Satchel_and_Hold', 'satchel panel')}, mouse-aimed ${L('Combat', 'sword/bow')}, ${K('Space')} dash with dodge-grace</td></tr>
<tr><td>10 Jun 2026</td><td class="mono">dfc6cff</td><td><b>Pockets &amp; Magnets</b></td><td>Satchel 18 / hold 50 caps, weightless gold, value-swaps, priority banking, ${L('Loot', 'magnet')} buffed 52→95u</td></tr>
<tr><td>10 Jun 2026</td><td class="mono">4a30afd</td><td><b>The Treasure Arc</b></td><td>Branching island paths, the ${L('Great_Boar', 'Great Boar')}, hoard &amp; cache chests, physical loot with pickup combos, ${L('Treasure', 'buried ✕')}, flag ceremony, survey charts, run summaries</td></tr>
<tr><td>10 Jun 2026</td><td class="mono">bdff46b</td><td><b>The Explorer</b></td><td>Animated explorer sprite with an always-drawn sword; cleared-island flags in-world, on charts, and a running count</td></tr>
<tr><td>10 Jun 2026</td><td class="mono">ad6f53c</td><td><b>Island Graphics Overhaul</b></td><td>Finer pixels ashore, living terrain (tufts, flowers, canopies, beaches), 4 island palettes, weather &amp; fireflies ashore, critter sprite pass</td></tr>
<tr><td>10 Jun 2026</td><td class="mono">500a2af</td><td><b>A Fair Fight</b></td><td>${L('Combat')} readability pass: honest slash wedge, hit-stun &amp; knockback, boar “!” telegraph, visible vipers &amp; venom, healing on secure, heart drops, arena-bound aggro</td></tr>
<tr><td>9 Jun 2026</td><td class="mono">2cf7b65</td><td><b>Landfall</b></td><td>First ${L('Island_Exploration', 'island exploration')}: clearings, gates, boars &amp; snakes, nodes, banking, lose-it-all ${L('Combat', 'death')}</td></tr>
<tr><td>9 Jun 2026</td><td class="mono">d28bf3a</td><td><b>The Pannable Chart</b></td><td>Full ${L('Charts_and_Cartography', 'map')} became zoomable &amp; pannable, rendered crisp at every scale</td></tr>
<tr><td>9 Jun 2026</td><td class="mono">5fed0b7</td><td><b>The World Grows Tenfold</b></td><td>${L('The_World', '82,000u world')} (~14 min to cross) via streamed generation; ~3,000 islands, ~370 ports</td></tr>
<tr><td>9 Jun 2026</td><td class="mono">e5f631f</td><td><i>(minor)</i></td><td>Fog-of-war debug toggle in the ${L('Tuning_Panel', 'tuning panel')}</td></tr>
<tr><td>9 Jun 2026</td><td class="mono">5e1fe7b</td><td><b>Release — Step One</b></td><td>The sailing core: procedural sea, light-sail physics, wind &amp; compass, fog-of-war ${L('Charts_and_Cartography', 'cartography')}, discovery &amp; naming, ambience, saves — plus ${L('Day-Night_and_Weather', 'day–night and storms')} the same day</td></tr>
</tbody></table>`)}
<p>For what's next, see ${L('Upcoming_Features')}.</p>
` },

/* ---------------------------------------------- Upcoming */
Upcoming_Features: { title: 'Upcoming Features', icon: '🔮', cats: ['Reference'], html: `
${hatnote(`Everything here is roadmap, not release — drawn from the developer's in-source notes and pitches. The tide may rearrange it.`)}
<h2>Next: ports &amp; upgrades</h2>
<p>The confirmed next arc. ${L('Ports', 'Port cities')} become places — trading the
${L('Loot', 'island haul')} for gold, and gold for the boat: upgrades, gear, and eventually a
<b>crew of five</b> to run the ship. ${L('Fishing')} and ${L('Whaling', 'whaling')} were built
deliberately as the income side of this economy; ports are the spending side.</p>

<h2>Pitched: biome waves 2 and 3</h2>
<p>The ${L('Biomes', 'biome system')} was designed as a ~25-biome catalogue in five tiers;
wave 1 shipped ten. The pitched (not built) waves include fog isles, swamps, bamboo groves,
bee meadows and temple ruins — and a mythic tier with one-per-world wonders in the spirit of
${L('The_White', 'THE WHITE')}: a dragon's isle, a heist, a haunting, a titan. Exclusive
resources per biome came with the pitch.</p>

<h2>Ongoing: feel-tuning</h2>
<p>Fishing and whaling are new enough that their dials (school glow, ride strain and reel rates,
wary radii, ram dodge difficulty) are still being tuned by hand, by playing. The
${L('Tuning_Panel', 'tuning panel')} exists exactly for this; expect numbers on this wiki to
drift a point or two as the sea settles.</p>

<h2>Stated long ago, still true</h2>
<p>The founding concept names the full loop: <i>sail, chart, trade, crew, explore, fish,
whale</i>. Five of seven verbs are live. The wiki maintains a small, professional excitement
about the other two.</p>
` },

};
