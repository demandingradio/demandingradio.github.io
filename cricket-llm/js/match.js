/*
 * MATCH
 * =====
 * A Test match between your XI and an AI XI: the scorecard, the rules and
 * the AI captain. No rendering and no input here (it runs headless too): the
 * batting/bowling sessions play each ball and hand the result to applyBall().
 *
 *   innings order   1st, 2nd, (follow-on?) 3rd, 4th; draws when the overs run out
 *   strike          odd runs swap ends; end of over swaps; caught = new batter
 *                   on strike (Law 18.11, 2022); run out = new batter to the
 *                   vacated end
 *   bowlers         no two overs in a row (Law 17.6); the AI captain rotates
 *                   spells, sets fields and plugs gaps (Law 28.4 legal); you
 *                   pick yours
 *   save            after every ball (localStorage 'cricketllm.match.v1')
 *
 * Ball result shape (from the session, or simBall()):
 *   { runs, boundary: 0|4|6, extras: {w, nb, b, lb}, legal, swapped: bool,
 *     phi (batter-relative bearing of the shot, deg, + off side; optional),
 *     out: null | { how, who: 'striker'|'nonStriker', fielder, bowlerCredit } }
 * applyBall() returns
 *   { overEnd, wicket: {i, how, card, player}|null,
 *     inningsEnd: false|'all out'|'target'|'time'|'declared', matchEnd, newBall,
 *     captain: toast text|null, session: 'lunch'|'tea'|'stumps'|null, tag }
 */
(function () {
  const CLLM = window.CLLM;
  const { M } = CLLM;
  const KEY = 'cricketllm.match.v1';
  // CFG.MATCH planning norms (config.js), with the same numbers as a fallback
  const RPO = { club: 3.9, grade: 3.6, state: 3.5, test: 3.4 };
  const BPW = { club: 32, grade: 40, state: 46, test: 52 };
  const MCFG = () => (CLLM.CFG && CLLM.CFG.MATCH) || {};

  // ---- formats ------------------------------------------------------------------------------
  // A real Test, scaled by wickets per innings (W) with a match overs budget
  // (five "days"), so the laws keep their meaning: bowl them out twice in
  // time or it's a draw; declarations and the follow-on (200 x W/10) matter.
  // No per-innings over caps (those turn a Test into limited overs).
  const FORMATS = {
    lite: { key: 'lite', name: 'Lite Test', blurb: '3 wickets an innings · 5 days of 27 overs', wickets: 3, overs: null, budget: 135, perDay: 27, followOn: 60, newBall: 24 },
    half: { key: 'half', name: 'Half Test', blurb: '5 wickets an innings · 5 days of 45 overs', wickets: 5, overs: null, budget: 225, perDay: 45, followOn: 100, newBall: 40 },
    full: { key: 'full', name: 'Full Test', blurb: '10 wickets an innings · 5 days of 90 overs', wickets: 10, overs: null, budget: 450, perDay: 90, followOn: 200, newBall: 80 },
  };
  FORMATS.quick = FORMATS.lite; FORMATS.short = FORMATS.half; FORMATS.test = FORMATS.full;   // older saves

  // ---- field sets (research: distance m / bearing deg; 0 = straight, + = off side, 180 = behind)
  const SETS = {
    paceNew: [['keeper', 18, 178], ['first slip', 19, 172], ['second slip', 19.5, 166], ['third slip', 20, 160], ['gully', 17, 135],
      ['point', 24, 97], ['cover', 27, 60], ['mid-off', 28, 12], ['mid-on', 28, -15], ['fine leg', 62, -155]],
    paceOld: [['keeper', 16, 178], ['first slip', 17, 171], ['gully', 22, 125], ['cover', 28, 60], ['mid-off', 30, 10],
      ['mid-on', 30, -12], ['midwicket', 28, -55], ['square leg', 26, -88], ['third man', 62, 150], ['fine leg', 62, -150]],
    paceTail: [['keeper', 17, 178], ['first slip', 18, 172], ['second slip', 18.5, 166], ['third slip', 19, 160], ['gully', 17, 135],
      ['short leg', 5.5, -72], ['leg gully', 12, -140], ['deep square leg', 62, -88], ['fine leg', 62, -160], ['mid-off', 28, 12]],
    offAttack: [['keeper', 1, 180], ['slip', 3.5, 150], ['short leg', 5.5, -72], ['silly point', 4.5, 70], ['cover', 25, 55],
      ['mid-off', 25, 10], ['mid-on', 25, -15], ['midwicket', 25, -55], ['deep midwicket', 62, -50], ['short fine leg', 30, -155]],
    offContain: [['keeper', 1, 180], ['slip', 3.5, 150], ['short leg', 5.5, -72], ['point', 22, 95], ['cover', 25, 55],
      ['long-off', 65, 8], ['mid-on', 25, -15], ['deep square leg', 60, -95], ['deep midwicket', 62, -50], ['short fine leg', 30, -155]],
    legAttack: [['keeper', 1, 180], ['slip', 3.5, 150], ['silly point', 4.5, 70], ['point', 22, 95], ['cover', 24, 60],
      ['mid-off', 27, 8], ['mid-on', 26, -15], ['midwicket', 26, -60], ['deep square leg', 62, -98], ['fine leg', 45, -160]],
    legContain: [['keeper', 1, 180], ['slip', 3.5, 150], ['point', 22, 95], ['cover', 24, 60], ['deep cover', 58, 50],
      ['mid-off', 27, 8], ['mid-on', 26, -15], ['midwicket', 26, -60], ['deep square leg', 62, -98], ['fine leg', 45, -160]],
  };
  const NOTES = {
    paceNew: 'New-ball field: three slips and a gully', paceOld: 'Old-ball field', paceTail: 'Attacking the tail: slips and a short leg',
    offAttack: 'Off-spin, attacking', offContain: 'Off-spin, saving runs', legAttack: 'Leg-spin, attacking', legContain: 'Leg-spin, saving runs',
  };
  // The keeper for pace is "back" (research: 16-18 m); for spin he's up.
  function fieldFor(setKey, h) {
    return SETS[setKey].map(([name, d, b]) => {
      const r = M.rad(b);
      return { name, x: -h * d * Math.sin(r), z: d * Math.cos(r) };
    });
  }

  // Law 28.4: at most two fielders (not the keeper) behind the popping crease on the leg side
  function legalField(positions, h) {
    let n = 0;
    for (const p of positions) if (p.name !== 'keeper' && p.z < 1.22 && p.x * (h || 1) > 0) n++;
    return n <= 2;
  }

  // ---- the gap-plug ------------------------------------------------------------------------
  // Boundaries are binned by batter-relative bearing into twelve 30-degree
  // sectors (0 = [-180, -150), ..., 11 = [150, 180)); a plug moves one ring
  // fielder back to the rope (ropeK 0.93) on the sector's centre line.
  const sectorOf = (phi) => ((Math.floor((phi + 180) / 30) % 12) + 12) % 12;
  const sectorMid = (s) => -165 + 30 * s;
  const angGap = (a, b) => Math.abs(M.deg(M.wrapAng(M.rad(a - b))));
  const CLOSE = /slip|gully|short|silly/;
  function ropeK(x, z) {
    return CLLM.Ground ? CLLM.Ground.ropeK(x, z) : Math.hypot(x / 62, (z - 10) / 68);   // (the same ellipse)
  }
  function plugDist(b) {
    const s = Math.sin(M.rad(b)), c = Math.cos(M.rad(b));
    let lo = 5, hi = 150;
    for (let i = 0; i < 40; i++) { const d = (lo + hi) / 2; if (ropeK(d * s, d * c) < 0.93) lo = d; else hi = d; }
    return lo;
  }
  // What a deep fielder at this bearing is called
  function deepName(b) {
    const a = Math.abs(b);
    if (a < 22) return b >= 0 ? 'long-off' : 'long-on';
    if (b > 0) return a < 45 ? 'deep extra cover' : a < 75 ? 'deep cover' : a < 105 ? 'deep point' : a < 140 ? 'deep backward point' : 'third man';
    return a < 70 ? 'deep midwicket' : a < 105 ? 'deep square leg' : a < 140 ? 'deep backward square' : 'fine leg';
  }
  // -> { positions, from, to } | null: the nearest non-keeper, non-close
  // (home >= 15 m) fielder by bearing, then the next, until the field is legal
  function plugField(key, sector, h) {
    const set = SETS[key], mid = sectorMid(sector), d = plugDist(mid), r = M.rad(mid);
    const cands = set.map(([name, dist, b], j) => ({ name, dist, b, j }))
      .filter((c) => c.name !== 'keeper' && c.dist >= 15)
      .sort((p, q) => angGap(p.b, mid) - angGap(q.b, mid));
    for (const c of cands) {
      const pos = fieldFor(key, h);
      const taken = (n) => pos.some((p, j) => j !== c.j && p.name === n);
      // a ring fielder takes the deep position's name (the scorecard and FieldSim's roles read it)
      let to = c.name;
      if (c.dist <= 45) {
        to = deepName(mid);
        if (taken(to)) to = CLOSE.test(c.name) ? `deep ${to}` : /^(deep|long)/.test(c.name) ? c.name : `deep ${c.name}`;
        if (taken(to)) continue;
      }
      pos[c.j] = { name: to, x: -h * d * Math.sin(r), z: d * Math.cos(r) };
      if (legalField(pos, h)) return { positions: pos, from: c.name, to };
    }
    return null;
  }

  // ---- teams -----------------------------------------------------------------------------------
  const SURN = ['Ashby', 'Bramwell', 'Carew', 'Dunstan', 'Ellery', 'Fairlie', 'Gorman', 'Hollis', 'Ingram', 'Jarvis', 'Kettle', 'Lorimer',
    'Maddox', 'Norris', 'Oakes', 'Pattinson', 'Quill', 'Radley', 'Stobart', 'Tallis', 'Umbers', 'Vickery', 'Whitlow', 'Yardley',
    'Achari', 'Bhatt', 'Coetzee', 'de Silva', 'Fernando', 'Gupta', 'Hossain', 'Iqbal', 'Joseph', 'Khan', 'Latham', 'Mahmood',
    'Naidoo', 'Ogilvy', 'Pieterse', 'Rahman', 'Sandhu', 'Taylor', 'van Wyk', 'Walsh', 'Younis', 'Zampa'];
  const INIT = 'ABCDEFGHJKLMNPRSTW';

  // Batting skill down the order (x the side's level); bowling attack: 3 pace, off, leg
  const ORDER = [1.0, 1.0, 1.02, 1.0, 0.95, 0.9, 0.78, 0.62, 0.5, 0.42, 0.36];
  const ATTACK = { 7: 'pace', 8: 'pace', 9: 'pace', 10: 'pace', 6: 'off', 5: 'leg' };   // index -> bowling type
  // Opening bowlers are the last four (pace), 6 = off-spinner (a bowling all-rounder), 5 = leg-spinner
  const LEVELS = { club: 0.3, grade: 0.56, state: 0.7, test: 0.88 };

  function makeTeam(name, level, hand, youName) {
    const used = new Set();
    const players = [];
    for (let i = 0; i < 11; i++) {
      let s; do { s = M.pick(SURN); } while (used.has(s)); used.add(s);
      players.push({
        name: `${M.pick(INIT)}. ${s}`,
        bat: M.clamp(level * ORDER[i] * M.rand(0.92, 1.06), 0.08, 0.97),
        hand: hand || (Math.random() < 0.3 ? 'L' : 'R'),
        bowl: ATTACK[i] || null,
        keeper: false,
      });
    }
    players[4].keeper = true;                 // the keeper bats 5
    return { name, level, players, you: !!youName };
  }

  function newInnings(bat, bowl, n) {
    return {
      n, bat, bowl,                         // 'you' | 'opp'
      runs: 0, wkts: 0, balls: 0, extras: { b: 0, lb: 0, w: 0, nb: 0 },
      batters: [], bowlers: {}, fow: [], overs: [],     // overs: per-over tags for the "this over" strip
      striker: 0, nonStriker: 1, next: 2, bowler: null, lastBowler: null, overBalls: 0, overRuns: 0, thisOver: [],
      declared: false, closed: false, followOn: false, newBallAt: 0,
      zone: [], plug: null,                 // the captain: recent boundary sectors, and the gap he's plugged
    };
  }

  const evBlank = () => ({ overEnd: false, wicket: null, inningsEnd: false, matchEnd: false, newBall: false, captain: null, session: null, tag: '' });
  // (not saved) the last session break, for sessionNote(); and "don't save every ball" while simming
  const LAST_SESSION = new WeakMap();
  let quiet = 0;

  // simBall() tuning (calibrated in the Deno match sims, spec §10.5)
  const SIM = {
    wK: 1.08, wExp: 0.8,                   // balls a wicket = BPW x wK x pitch x k^wExp (k = batter / bowling level)
    rK: 1.08, rExp: 0.25,                  // scoring rate x RPO/3.4 x rK x pitch^pitchR x k^rExp
    fresh: 1.15, freshBalls: 12,           // wicket risk x fresh for his first 12 balls
    aggW0: 0.62, aggW1: 1.0,               // wicket risk x(aggW0 + aggW1 * aggression) (1 at 0.45): blocking works
    pitchSD: 0.35, pitchR: 0.3,            // the pitch: flat decks and green tops (log-normal, per match)
    wide: 0.012, nb: 0.004, lb: 0.008, b: 0.0025,
    // the ball and the bowler: quicks with the new ball, spin once it's old
    paceNewW: 1.15, paceOldW: 0.9, spinNewW: 0.8, spinNewR: 1.15, spinOldW: 1.05, spinOldR: 0.93,
  };
  const HOW_PACE = [{ w: 62, h: 'caught' }, { w: 20, h: 'bowled' }, { w: 15, h: 'lbw' }, { w: 3, h: 'run out' }];
  const HOW_SPIN = [{ w: 52, h: 'caught' }, { w: 20, h: 'bowled' }, { w: 17, h: 'lbw' }, { w: 3, h: 'run out' }, { w: 8, h: 'stumped' }];

  class Match {
    // opts: { format, level (AI side: 'club'..'test'), hand (your batters), controls, assist, youBatFirst }
    constructor(opts) {
      if (!opts) return;                    // (load() fills it in)
      this.v = 1;
      this.id = Date.now();
      this.format = FORMATS[opts.format] ? FORMATS[opts.format].key : 'lite';
      this.levelKey = LEVELS[opts.level] ? opts.level : 'grade';
      this.controls = opts.controls || 'physical';
      this.assist = opts.assist || 'manual';
      const lv = LEVELS[this.levelKey];
      this.teams = {
        you: makeTeam(opts.youName || 'Your XI', lv, opts.hand || 'R', true),
        opp: makeTeam(opts.oppName || 'LLM XI', lv, null, false),
      };
      this.hand = opts.hand || 'R';
      // the pitch (for simulated overs): > 1 a flat deck, < 1 a green top
      this.pitch = +M.clamp(Math.exp(M.gauss() * SIM.pitchSD), 0.6, 1.6).toFixed(2);
      this.innings = [];
      this.result = null;
      this.ballsTotal = 0;
      this.sessDone = 0;                     // session breaks reached so far (lunch, tea, stumps...)
      this.followOnPending = null;
      this.mem = { oppBat: {}, oppBowl: {} };   // the AI's learned reads (written by the sessions)
      this.log = [];                         // short commentary lines (last few)
      const first = opts.youBatFirst ? 'you' : 'opp';
      this._startInnings(first, first === 'you' ? 'opp' : 'you');
    }

    get F() { return FORMATS[this.format]; }
    get inn() { return this.innings[this.innings.length - 1]; }
    team(k) { return this.teams[k]; }
    get youBatting() { return this.inn && this.inn.bat === 'you'; }

    _startInnings(bat, bowl) {
      const inn = newInnings(bat, bowl, this.innings.length + 1);
      for (let i = 0; i < 11; i++) inn.batters.push({ i, runs: 0, balls: 0, fours: 0, sixes: 0, out: null, in: i < 2 });
      this.innings.push(inn);
      inn.bowler = null;
      if (bowl === 'opp') inn.bowler = this.aiPickBowler();
      return inn;
    }

    // ---- who's on -------------------------------------------------------------------------------
    striker() { const inn = this.inn; return this.teams[inn.bat].players[inn.striker]; }
    nonStriker() { const inn = this.inn; return this.teams[inn.bat].players[inn.nonStriker]; }
    bowler() { const inn = this.inn; return inn.bowler == null ? null : this.teams[inn.bowl].players[inn.bowler]; }
    batCard(i) { return this.inn.batters[i]; }
    bowlCard(i) {
      const inn = this.inn;
      if (!inn.bowlers[i]) inn.bowlers[i] = { balls: 0, runs: 0, wkts: 0, maidens: 0, spell: 0, rest: 99 };
      return inn.bowlers[i];
    }

    // ---- targets & situation --------------------------------------------------------------------
    // Runs the batting side is behind (+) / ahead (-) across all its innings so far
    lead(team) {
      let r = 0;
      for (const inn of this.innings) r += inn.bat === team ? inn.runs : -inn.runs;
      return r;
    }
    target() {
      // only in the 4th innings (or the 3rd, after a follow-on, where it's "to make them bat again")
      if (this.innings.length < 4) return null;
      const inn = this.inn;
      return -this.lead(inn.bat) + inn.runs + 1;
    }
    oversLeftInnings() {
      const F = this.F, inn = this.inn;
      return F.overs ? F.overs * 6 - inn.balls : Infinity;
    }
    ballsLeftMatch() { return this.F.budget ? this.F.budget * 6 - this.ballsTotal : Infinity; }
    // this level's scoring norms (runs an over, balls a wicket)
    _norms() {
      const C = MCFG();
      return { rpo: (C.RPO || RPO)[this.levelKey] || 3.5, bpw: (C.BPW || BPW)[this.levelKey] || 46 };
    }
    // how old the ball is, as a fraction of the overs until another is due (0 = brand new)
    _ballAge() {
      const inn = this.inn, age = Math.floor(inn.balls / 6) - (inn.newBallAt || 0);
      return { age, a: age / (this.F.newBall || 80), shiny: age / (this.F.newBall || 80) < 0.15 || (inn.newBallAt > 0 && age < 4) };
    }

    // ---- the AI captain ---------------------------------------------------------------------
    // Which of the fielding side's bowlers bowls the next over. Never the last
    // one (Law 17.6). The quicks share the new ball in spells of 5-7 overs
    // (a spell is alternate overs from one end) and need about as long again
    // to recover; the spinners come on once the shine's gone and bowl long.
    aiPickBowler() {
      const inn = this.inn;
      const T = this.teams[inn.bowl];
      const overs = Math.floor(inn.balls / 6);
      const { a, shiny } = this._ballAge();
      const { rpo } = this._norms();
      const other = inn.lastBowler == null ? null : T.players[inn.lastBowler];   // at the other end
      const cand = [];
      T.players.forEach((p, i) => {
        if (!p.bowl || i === inn.lastBowler) return;
        const c = inn.bowlers[i] || { balls: 0, runs: 0, wkts: 0, spell: 0, rest: 99 };
        const pace = p.bowl === 'pace';
        const on = c.spell > 0 && c.rest <= 1;                 // mid-spell: he bowled the over before last
        // new ball: the quicks; old ball: spin
        let s = pace ? (shiny ? 3 : a < 0.5 ? 1.2 : 0.9)
          : shiny ? -4 : a < 0.25 ? -1 + 26 * (a - 0.15) : a < 0.6 ? 1.6 : 1.9;
        // a spinner at one end, a quick at the other (spin twins only once the ball's old)
        if (!pace && other && other.bowl !== 'pace' && !on) s -= a < 0.6 ? 1.2 : 0.4;
        // spells: this one's length (5-7 overs for a quick, 9-15 for a spinner), then a rest
        const len = pace ? 5 + ((i * 7 + inn.n * 5 + Math.floor(c.balls / 30)) % 3) : 9 + ((i * 5 + inn.n * 3 + Math.floor(c.balls / 60)) % 7);
        if (on) s += c.spell < len - 1 ? 3 : c.spell < len ? 1.5 : -6;
        else if (c.rest < 99) s -= c.spell * (pace ? 0.8 : 0.3) + (c.rest < (pace ? 4 : 2) ? 2 : 0);   // (spell counts down while he rests)
        // expensive? take him off. Taking wickets? keep him on.
        if (c.balls >= 24) s -= Math.max(0, (c.runs / c.balls) * 6 - (rpo + 0.7)) * 0.6;
        s += Math.min(3, c.wkts) * 0.25;
        // opening pair: the two best quicks
        if (overs < 2 && pace) s += i >= 9 ? 3 : 0;
        s += Math.random() * 0.6;
        cand.push({ i, s });
      });
      cand.sort((p, q) => q.s - p.s);
      return cand.length ? cand[0].i : null;
    }

    // The set for the next ball: bowler type, new/old ball, who's batting
    _setKey() {
      const inn = this.inn, p = this.bowler();
      const type = p ? p.bowl : 'pace';
      const bat = this.teams[inn.bat].players[inn.striker];
      const card = inn.batters[inn.striker];
      const { a } = this._ballAge();                               // (the new-ball field for its first 30%: 24 overs in a Full Test)
      const tail = bat.bat < 0.45 * this.teams[inn.bat].level + 0.05 || inn.striker >= 8;
      const set = card.runs >= 40 || card.balls >= 70;
      if (type === 'pace') return tail ? 'paceTail' : a < 0.3 && !set ? 'paceNew' : 'paceOld';
      if (type === 'off') return set && !tail ? 'offContain' : 'offAttack';
      return set && !tail ? 'legContain' : 'legAttack';
    }
    _strikerH() { return this.striker().hand === 'L' ? -1 : 1; }

    // The field for the next ball -> { key, positions: [{name, x, z}], note }
    // (plus the captain's plug while this set stays; a new set clears it)
    fieldSet() {
      const inn = this.inn, key = this._setKey(), h = this._strikerH();
      if (inn.plug && inn.plug.key !== key) inn.plug = null;
      let positions = fieldFor(key, h), note = NOTES[key] || key;
      if (inn.plug) {
        const pl = plugField(key, inn.plug.sector, h);
        if (pl) { positions = pl.positions; note += ` · ${pl.to} plugging the gap`; }
      }
      return { key, positions, note };
    }

    // Where the boundaries go: two through the same 30-degree sector within 12
    // legal balls and the captain drops a man back there
    _zone(inn, phi, key, h, ev) {
      const sector = sectorOf(phi);
      inn.zone = (inn.zone || []).filter((z) => inn.balls - z.ball < 12);
      inn.zone.push({ ball: inn.balls, sector });
      if (inn.zone.filter((z) => z.sector === sector).length < 2) return;
      if (inn.plug && inn.plug.key === key && inn.plug.sector === sector) return;   // already there
      const pl = plugField(key, sector, h);
      if (!pl) return;                                                            // nobody can go legally
      inn.plug = { sector, key };
      ev.captain = `Captain moves ${pl.from} back${pl.to !== pl.from ? ` to ${pl.to}` : ''}`;
    }

    // How the AI batters play right now (0 = block it out, 1 = go for it)
    aiAggression() {
      const inn = this.inn, F = this.F;
      let a = 0.45;
      const card = inn.batters[inn.striker];
      if (card.runs > 30) a += 0.1;
      if (card.balls < 10) a -= 0.12;
      const tgt = this.target();
      if (tgt != null) {
        const need = tgt - inn.runs;
        const balls = Math.min(this.oversLeftInnings(), this.ballsLeftMatch());
        if (balls < Infinity) {
          const rr = (need / Math.max(1, balls)) * 6, par = this._norms().rpo;
          const inHand = Math.min(10, F.wickets) - inn.wkts;
          if (rr > 1.6 * par || (inHand <= 1 && rr > 1.25 * par)) a = 0.1;   // can't win: bat for the draw
          else a += M.clamp((rr - par) * 0.12, -0.3, 0.45);
        }
      } else if (inn.n === 3 && F.budget && this.lead(inn.bat) > 150 * F.wickets / 10) {
        a += 0.12;                                                              // runs quickly, then declare
      } else if (F.overs) {
        a += 0.1 + 0.25 * M.clamp(1 - this.oversLeftInnings() / (F.overs * 6), 0, 1);
      }
      return M.clamp(a, 0.05, 0.95);
    }
    // The AI batter's attacking tempo (x pAttack, sqrt x pLoft in AIBatter.face): 1 = the nets
    aiTempo() { return M.clamp(1 + (this.aiAggression() - 0.45) * 1.6, 0.5, 1.6); }

    // AI declaration (3rd innings with a big lead, or 1st with a mountain).
    // Checked at every dead ball while the AI bats (Law 15: any dead ball).
    aiShouldDeclare() {
      const inn = this.inn, F = this.F;
      if (this.result || inn.closed || inn.bat !== 'opp' || !F.budget) return false;
      const k = F.wickets / 10;
      const lead = this.lead('opp');
      const left = this.ballsLeftMatch() / 6;
      // enough to win with, and enough time to bowl them out (about 50 balls a wicket)
      const needOvers = (F.wickets * 50) / 6;
      if (inn.n === 3) return (lead > Math.max(250 * k, left * 3.2) && left >= needOvers * 0.9) || (lead > 180 * k && left < needOvers * 1.2 && left > needOvers * 0.6);
      if (inn.n === 1) return inn.runs > 550 * k;
      return false;
    }

    // ---- sessions: three a day ("Lunch", "Tea", "Stumps, day 2") ------------------------------
    _sessBalls() { return ((this.F.perDay || 90) / 3) * 6; }
    day() {
      const per = this.F.perDay || 90;
      const ov = Math.floor(this.ballsTotal / 6);
      return { day: Math.min(5, Math.floor(ov / per) + 1), session: Math.floor((ov % per) / (per / 3)) + 1, left: per - (ov % per) };
    }
    // At an over end (or an innings end): has a session gone by? (a break
    // falls at the first over end at or past its time)
    _sessionCheck(ev, inn) {
      if (!this.F.budget || this.ballsTotal >= this.F.budget * 6) return;      // (the last one ends the match)
      const idx = Math.floor(this.ballsTotal / this._sessBalls());
      if (idx <= (this.sessDone || 0)) return;
      this.sessDone = idx;
      const kind = ['stumps', 'lunch', 'tea'][idx % 3], day = Math.ceil(idx / 3);
      ev.session = kind;
      LAST_SESSION.set(this, { kind, day, ballsTotal: this.ballsTotal, score: `${this.teams[inn.bat].name} ${this.scoreLine(inn)}` });
    }
    // The toast for the ball just applied ('' if no break)
    sessionNote(ev) {
      const s = LAST_SESSION.get(this);
      if (!s || s.ballsTotal !== this.ballsTotal || (ev && !ev.session)) return '';
      if (s.kind === 'lunch') return `Lunch, day ${s.day}`;
      if (s.kind === 'tea') return `Tea, day ${s.day}`;
      return `Stumps, day ${s.day} · ${s.score}`;
    }

    // ---- applying a ball ----------------------------------------------------------------------
    applyBall(r) {
      const inn = this.inn;
      if (this.result || inn.closed) return evBlank();           // (over: nothing more counts)
      if (inn.bowler == null) inn.bowler = this.aiPickBowler();   // (the sessions always name one)
      const ev = evBlank();
      const ex = Object.assign({ w: 0, nb: 0, b: 0, lb: 0 }, r.extras || {});
      const key0 = this._setKey(), h0 = this._strikerH();         // the field this ball was bowled to
      const bat = inn.batters[inn.striker];
      const bc = this.bowlCard(inn.bowler);
      const legal = r.legal !== false && !ex.w && !ex.nb;
      const bRuns = r.runs || 0;                                 // off the bat
      const extras = ex.w + ex.nb + ex.b + ex.lb;
      const total = bRuns + extras;
      // Law 16.6: the match is won the moment the winning run's completed (a run out after it doesn't count)
      const tgt = this.target();
      if (r.out && r.out.how === 'run out' && tgt != null && inn.runs + total >= tgt) r = Object.assign({}, r, { out: null });
      // 1. the score (byes and leg byes aren't the bowler's)
      inn.runs += total;
      inn.extras.w += ex.w; inn.extras.nb += ex.nb; inn.extras.b += ex.b; inn.extras.lb += ex.lb;
      if (!ex.w) bat.balls++;                                     // a wide isn't a ball faced
      bat.runs += bRuns;
      if (r.boundary === 4 && !ex.b && !ex.lb && !r.overthrow) bat.fours++;      // (overthrows score, but aren't a four)
      if (r.boundary === 6) bat.sixes++;
      bc.runs += bRuns + ex.w + ex.nb;
      inn.overRuns += bRuns + ex.w + ex.nb;
      const tag = r.out ? 'W' : ex.w ? `${ex.w}wd` : ex.nb ? `${total}nb` : ex.b ? `${ex.b}b` : ex.lb ? `${ex.lb}lb` : total ? String(total) : '·';
      // 2. the ball count
      if (legal) { inn.balls++; inn.overBalls++; bc.balls++; this.ballsTotal++; }
      // (the captain watches where the boundaries go)
      if (r.boundary && r.phi != null && isFinite(r.phi) && !ex.b && !ex.lb && !r.overthrow) this._zone(inn, r.phi, key0, h0, ev);
      // 3. the ends: who's out (by who they were when the ball was bowled), then any swap
      const who = r.out ? (r.out.who === 'nonStriker' ? inn.nonStriker : inn.striker) : null;
      if (r.swapped) { const t = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = t; }
      // 4. the wicket
      if (r.out) {
        const card = inn.batters[who];
        card.out = { how: r.out.how, bowler: r.out.bowlerCredit === false ? null : inn.bowler, fielder: r.out.fielder || null };
        card.in = false;
        inn.wkts++;
        inn.plug = null;                                           // a new batter: the captain resets
        if (r.out.bowlerCredit !== false && r.out.how !== 'run out') bc.wkts++;
        inn.fow.push({ w: inn.wkts, runs: inn.runs, i: who, balls: inn.balls });
        ev.wicket = { i: who, how: r.out.how, card: Object.assign({}, card), player: this.teams[inn.bat].players[who] };
        const allOut = inn.wkts >= Math.min(10, this.F.wickets) || inn.next > 10;
        if (!allOut) {
          const nb = inn.next++;
          inn.batters[nb].in = true;
          if (r.out.how === 'caught') {
            // Law 18.11: the new batter takes strike (whether or not they crossed)
            if (who === inn.striker) inn.striker = nb; else { inn.nonStriker = inn.striker; inn.striker = nb; }
          } else if (who === inn.striker) inn.striker = nb; else inn.nonStriker = nb;   // run out etc.: the vacated end
        }
      }
      inn.thisOver.push(tag);
      // 5. the end of the over
      if (legal && inn.overBalls >= 6) {
        ev.overEnd = true;
        if (inn.overRuns === 0) bc.maidens++;
        inn.overs.push(inn.thisOver.slice());
        inn.thisOver = [];
        inn.overBalls = 0; inn.overRuns = 0;
        const t = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = t;
        // spell / rest counters for the captain (a spell counts back down while he rests)
        for (const k in inn.bowlers) { const c = inn.bowlers[k]; if (+k === inn.bowler) { c.spell++; c.rest = 0; } else { c.rest++; if (c.rest >= 2) c.spell = Math.max(0, c.spell - 1); } }
        inn.lastBowler = inn.bowler;
        inn.bowler = null;
        // a new ball after 80 overs (scaled to the format)
        if (this.F.newBall && Math.floor(inn.balls / 6) - (inn.newBallAt || 0) >= this.F.newBall) { inn.newBallAt = Math.floor(inn.balls / 6); ev.newBall = true; }
        this._sessionCheck(ev, inn);
      }
      // 6. innings / match over?
      const end = this._inningsOver();
      if (end) {
        ev.inningsEnd = end;
        if (!ev.overEnd) this._sessionCheck(ev, inn);            // (a break falls with the change of innings)
        this._closeInnings(end);
        if (this.result) ev.matchEnd = true;
      } else if (ev.overEnd && inn.bowl === 'opp') inn.bowler = this.aiPickBowler();   // 7. the AI's next bowler
      ev.tag = tag;
      this.save();                                                 // 8.
      return ev;
    }

    _inningsOver() {
      const inn = this.inn, F = this.F;
      const tgt = this.target();
      if (tgt != null && inn.runs >= tgt) return 'target';              // (before 'all out': the winning run ends it)
      if (inn.wkts >= Math.min(10, F.wickets) || inn.next > 10 && inn.wkts >= 10) return 'all out';
      if (F.overs && inn.balls >= F.overs * 6) return 'overs';
      if (F.budget && this.ballsTotal >= F.budget * 6) return 'time';
      if (inn.declared) return 'declared';
      return null;
    }

    // (ev, optional, gets the session break a mid-over declaration brings; sessionNote() has it too)
    declare(ev) {
      const inn = this.inn;
      if (this.result || inn.closed) return false;
      inn.declared = true;
      this._sessionCheck(ev || evBlank(), inn);
      this._closeInnings('declared');
      this.save();
      return true;
    }

    // Close the innings; start the next one (or finish the match)
    _closeInnings(why) {
      const inn = this.inn;
      inn.closed = why;
      if (inn.thisOver.length) { inn.overs.push(inn.thisOver.slice()); inn.thisOver = []; }
      const n = this.innings.length;
      const A = this.innings[0].bat, B = A === 'you' ? 'opp' : 'you';
      if (why === 'time') return this._finish({ draw: true });
      if (n >= 3) {
        // (after a follow-on the 3rd innings is by the side batting 2nd)
        const lastBat = inn.bat, other = lastBat === 'you' ? 'opp' : 'you';
        const leadLast = this.lead(lastBat);
        // an innings win: the side batting 3rd still behind with its innings done
        // (all out, or declared: a declared innings is a completed one, Law 16)
        if (n === 3 && leadLast < 0) return this._finish({ winner: other, innings: true, by: -leadLast });
        if (n === 4) {
          if (leadLast > 0) return this._finish({ winner: lastBat, wkts: Math.min(10, this.F.wickets) - inn.wkts });
          if (leadLast === 0) return this._finish({ tie: true });
          return this._finish({ winner: other, by: -leadLast });   // all out (or declared) short
        }
      }
      // the match's overs ran out with the ball that ended this innings: no more innings
      if (this.F.budget && this.ballsTotal >= this.F.budget * 6) return this._finish({ draw: true });
      // who bats next
      if (n === 1) { this._startInnings(B, A); return; }
      if (n === 2) {
        const leadA = this.lead(A);
        if (leadA >= this.F.followOn) { this.followOnPending = { by: A, lead: leadA }; }
        this._startNext();
        return;
      }
      if (n === 3) { const bat = inn.bat === 'you' ? 'opp' : 'you'; this._startInnings(bat, inn.bat); return; }
    }

    // After the 2nd innings: normally A bats again; with a follow-on B does
    _startNext(enforce) {
      const A = this.innings[0].bat, B = A === 'you' ? 'opp' : 'you';
      const fo = this.followOnPending;
      if (fo && enforce == null) {
        // the AI decides for itself (enough time left to bowl them out twice); you get asked
        if (fo.by === 'opp') enforce = this.ballsLeftMatch() / 6 >= 18 * this.F.wickets;
        else return;                                                // wait for chooseFollowOn()
      }
      this.followOnPending = null;
      if (enforce) { const inn = this._startInnings(B, A); inn.followOn = true; }
      else this._startInnings(A, B);
    }
    chooseFollowOn(enforce) { if (!this.followOnPending) return; this._startNext(!!enforce); this.save(); }

    _finish(res) {
      const nm = (k) => this.teams[k].name;
      let text;
      if (res.draw) text = 'Match drawn';
      else if (res.tie) text = 'Match tied';
      else if (res.innings) text = `${nm(res.winner)} won by an innings and ${res.by} run${res.by === 1 ? '' : 's'}`;
      else if (res.wkts != null) text = `${nm(res.winner)} won by ${res.wkts} wicket${res.wkts === 1 ? '' : 's'}`;
      else text = `${nm(res.winner)} won by ${res.by} run${res.by === 1 ? '' : 's'}`;
      this.result = Object.assign(res, { text, youWon: res.winner === 'you' });
    }

    // ---- quick sim (overs you'd rather not play) ------------------------------------------------
    // A Test-realistic ball by the numbers. At Test level for a top-order
    // batter: ~71% dots, 18.5% ones, 3.2% twos, 0.5% threes, 5.8% fours, 0.7%
    // sixes and a wicket every ~57 balls; shaded by the batter's skill against
    // the bowling side's level, the level's own norms (CFG.MATCH RPO/BPW), his
    // aggression, whether he's in yet, and the bowler with this ball.
    simBall() {
      const inn = this.inn, S = SIM;
      const bat = this.teams[inn.bat].players[inn.striker];
      const card = inn.batters[inn.striker];
      const FT = this.teams[inn.bowl].players;
      const bw = inn.bowler == null ? null : FT[inn.bowler];
      const lv = this.teams[inn.bowl].level;
      const { rpo, bpw } = this._norms();
      const agg = this.aiAggression();
      const k = M.clamp(bat.bat / Math.max(0.2, lv), 0.3, 1.6);
      const spin = !!bw && bw.bowl !== 'pace';
      const { a, shiny } = this._ballAge();
      const fW = spin ? (shiny ? S.spinNewW : S.spinOldW) : shiny ? S.paceNewW : a > 0.5 ? S.paceOldW : 1;
      const fR = spin ? (shiny ? S.spinNewR : S.spinOldR) : 1;
      const fresh = card.balls < S.freshBalls ? S.fresh : 1;       // most vulnerable before he's in
      const pitch = this.pitch || 1;
      const pW = M.clamp((fresh * fW * (S.aggW0 + S.aggW1 * agg)) / ((S.aggW0 + S.aggW1 * 0.45) * bpw * pitch * S.wK * Math.pow(k, S.wExp)), 0.004, 0.25);
      const rr = M.clamp(((fR * rpo) / 3.4) * Math.pow(pitch, S.pitchR) * S.rK * Math.pow(k, S.rExp) * ((0.7 + 0.7 * agg) / 1.015), 0.35, 2);
      const r = { runs: 0, boundary: 0, extras: {}, legal: true, swapped: false, out: null };
      // extras: wides, no-balls (no free hit in a Test), byes and leg byes
      if (Math.random() < S.wide) { r.extras = { w: 1 }; r.legal = false; return r; }
      const nb = Math.random() < S.nb;
      if (nb) { r.extras = { nb: 1 }; r.legal = false; }
      else if (Math.random() < pW) {
        const how = M.pickW(spin ? HOW_SPIN : HOW_PACE).h;
        const keeper = FT.find((p) => p.keeper) || FT[4];
        const others = FT.filter((p) => p !== keeper && p !== bw);
        let fielder = null;
        if (how === 'stumped') fielder = keeper.name;
        else if (how === 'caught') {
          const u = Math.random();
          fielder = (u < (spin ? 0.12 : 0.28) ? keeper : u < (spin ? 0.2 : 0.32) && bw ? bw : M.pick(others)).name;
        } else if (how === 'run out') fielder = M.pick(others).name;
        r.out = { how, who: how === 'run out' && Math.random() < 0.45 ? 'nonStriker' : 'striker', fielder, bowlerCredit: how !== 'run out' };
        return r;
      } else {
        const x = Math.random();
        if (x < S.lb + S.b) {
          const lb = x < S.lb, u = Math.random();
          const n = lb ? (u < 0.85 ? 1 : u < 0.92 ? 2 : 4) : (u < 0.6 ? 1 : u < 0.7 ? 2 : 4);
          r.extras = lb ? { lb: n } : { b: n };
          if (n === 4) r.boundary = 4;
          r.swapped = n % 2 === 1;
          return r;
        }
      }
      const v = Math.random();
      const p4 = 0.058 * rr, p6 = 0.007 * rr * rr, p1 = 0.185 * Math.sqrt(rr), p2 = 0.032 * rr, p3 = 0.005;
      if (v < p6) { r.runs = 6; r.boundary = 6; }
      else if (v < p6 + p4) { r.runs = 4; r.boundary = 4; }
      else if (v < p6 + p4 + p3) r.runs = 3;
      else if (v < p6 + p4 + p3 + p2) r.runs = 2;
      else if (v < p6 + p4 + p3 + p2 + p1) r.runs = 1;
      r.swapped = r.runs % 2 === 1;
      return r;
    }

    // Simulate ahead: kind 'over' | 'wicket' | 'session' | 'innings'. Stops
    // there, or when the innings changes, a follow-on needs your answer, the
    // match ends (or after 20000 balls). The AI declares when it should.
    // opts.userBowling: stop only at an over's end, so an over is never split
    // between the AI and you (Law 17: "next wicket" runs on to the over's end).
    // -> { events: [ev...], stopped: kind|'innings'|'followOn'|'result'|'guard' }
    simUntil(kind, opts) {
      opts = opts || {};
      const events = [], n0 = this.innings.length;
      let hit = false, guard = 0, stopped = null;
      quiet++;
      try {
        for (;;) {
          if (this.result) { stopped = 'result'; break; }
          if (this.followOnPending) { stopped = 'followOn'; break; }
          if (this.innings.length !== n0) { stopped = 'innings'; break; }
          if (hit && (!opts.userBowling || this.inn.overBalls === 0)) { stopped = kind; break; }
          if (guard++ >= 20000) { stopped = 'guard'; break; }
          if (this.inn.bowler == null) this.inn.bowler = this.aiPickBowler();
          if (this.aiShouldDeclare()) {
            const ev = Object.assign(evBlank(), { inningsEnd: 'declared', tag: 'dec' });
            this.declare(ev);
            ev.matchEnd = !!this.result;
            events.push(ev);
            continue;
          }
          const ev = this.applyBall(this.simBall());
          events.push(ev);
          if ((kind === 'over' && ev.overEnd) || (kind === 'wicket' && ev.wicket) || (kind === 'session' && ev.session)) hit = true;
        }
      } finally { quiet--; }
      this.save();
      return { events, stopped };
    }

    // ---- save / load ------------------------------------------------------------------------------
    save() {
      if (quiet) return;
      try { localStorage.setItem(KEY, JSON.stringify(this)); } catch (e) { /* no storage */ }
    }
    static load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || d.v !== 1 || !d.innings || !d.teams) return null;
        const m = new Match(null);
        Object.assign(m, d);
        // older saves
        if (m.followOnPending === undefined) m.followOnPending = null;
        m.mem = m.mem || {}; m.mem.oppBat = m.mem.oppBat || {}; m.mem.oppBowl = m.mem.oppBowl || {};
        if (m.sessDone == null) m.sessDone = Math.floor(m.ballsTotal / m._sessBalls());
        for (const inn of m.innings) { if (!inn.zone) inn.zone = []; if (inn.plug === undefined) inn.plug = null; }
        return m;
      } catch (e) { return null; }
    }
    static clear() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

    // ---- text helpers ---------------------------------------------------------------------------
    static overs(balls) { return `${Math.floor(balls / 6)}${balls % 6 ? '.' + (balls % 6) : ''}`; }
    scoreLine(inn) {
      inn = inn || this.inn;
      return `${inn.runs}/${inn.wkts}${inn.declared ? 'd' : ''} (${Match.overs(inn.balls)} ov)`;
    }
    situation() {
      const inn = this.inn;
      if (!inn) return '';
      const tgt = this.target();
      const nm = this.teams[inn.bat].name;
      if (this.result) return this.result.text;
      if (tgt != null) {
        const need = tgt - inn.runs;
        const bl = Math.min(this.oversLeftInnings(), this.ballsLeftMatch());
        return `${nm} need ${need} to win` + (bl < Infinity ? ` from ${bl} ball${bl === 1 ? '' : 's'}` : '');
      }
      if (this.innings.length === 1) return `${nm}, 1st innings`;
      const l = this.lead(inn.bat);
      return l > 0 ? `${nm} lead by ${l}` : l < 0 ? `${nm} trail by ${-l}` : 'Scores level';
    }
  }

  Match.FORMATS = FORMATS;
  Match.SETS = SETS;
  Match.fieldFor = fieldFor;
  Match.legalField = legalField;
  Match.plugField = plugField;
  Match.sectorOf = sectorOf;
  Match.SIM = SIM;
  Match.KEY = KEY;
  CLLM.Match = Match;
})();
