/*
 * MATCH PLAY
 * ==========
 * Plays a Match (match.js) ball by ball with the nets' own batting and
 * bowling, on a real ground with a real field (fieldsim.js):
 *
 *   MatchBatting   you bat exactly as in the nets; once it's off the bat (or
 *                  past it to the keeper) the ball is live: the field chases
 *                  it and YOU run: W / up = run (again = one more), S / down =
 *                  get back, from anywhere (touch: RUN / BACK). Or let your
 *                  partner run for you (Auto) and just send him back.
 *   MatchBowling   you bowl exactly as in the nets; the AI batters play it
 *                  (their timing sets how hard and where it goes) and run
 *   MatchCam       (matchcam.js) holds the delivery view a beat, then cuts to one high
 *                  camera and follows by crop & zoom (no re-render)
 *   MatchFlow      toss -> innings -> (your bowler each over) -> innings
 *                  breaks -> follow-on -> result; autosaves every ball
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, World, FieldSim, FielderAnim, Match, Deliveries, BallPhys, BatterAnim, Audio } = CLLM;

  // Outfield (research: rolling a = c + 0.0045 v^2, c ~1.0 fast .. 2.0 slow;
  // a bounce loses pace in proportion to how hard it lands)
  const MC = (CLLM.CFG && CLLM.CFG.MATCH) || {};
  const OUTFIELD = MC.OUTFIELD || { rollDecel: 1.05, rollLin: 0, bounceK: 0.42, keep: 0.8, keepK: 0.035, keepMin: 0.75, keepMax: 0.97 };
  const FIELD_SKILL = MC.FIELD_SKILL || { club: 0.45, grade: 0.62, state: 0.76, test: 0.9 };
  const CAPS = MC.CAPS || { you: '#1f4d2c', opp: '#6b1422' };
  const LINGER = MC.LINGER || 1.0;       // seconds after the ball is dead before the next one
  const RUN_LOCK = MC.RUN_LOCK || 0.12;  // no running calls in the first moment after contact
  const FF = MC.FF || 3;                 // fast-forward while the ball's just being returned
  const LIVE_MISSES = MC.LIVE_MISSES !== false;
  const WIDE = { off: (MC.WIDE && MC.WIDE.off) || 1.3, leg: -((MC.WIDE && MC.WIDE.leg) || 1.0) };   // Test wides: well out of reach, no shot played
  const D2R = Math.PI / 180;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---- shared bits for both sessions -------------------------------------------------------------
  function matchOf(s) { return s.game.match; }

  // The ball result the Match understands (caught: no runs, Law 33; stumped
  // by the keeper is the bowler's, like the crease's own stumping)
  function liveBallResult(fr, hit, padded) {
    const res = { runs: 0, boundary: 0, extras: {}, legal: true, swapped: false, out: null };
    if (!fr) return res;
    if (fr.out) res.out = { how: fr.out.how, who: fr.out.runner === 'A' ? 'striker' : 'nonStriker', fielder: fr.out.fielder, bowlerCredit: fr.out.how !== 'run out' };
    if (hit) { if (!(fr.out && fr.out.how === 'caught')) { res.runs = fr.runs; res.boundary = fr.boundary; } }
    else if (fr.runs) { if (padded) res.extras.lb = fr.runs; else res.extras.b = fr.runs; }
    res.swapped = fr.swapped != null ? fr.swapped : fr.ends.A === 1;
    if (fr.overthrow) res.overthrow = true;
    return res;
  }

  // (inn0: the innings the wicket fell in; the match may have moved on to the next)
  function outText(m, ev, inn0) {
    if (!ev.wicket) return '';
    const w = ev.wicket, c = w.card.out || {};
    const bowlT = m.teams[(inn0 || m.inn).bowl];
    const bn = c.bowler != null ? bowlT.players[c.bowler].name : '';
    let how = c.how;
    if (how === 'caught') how = c.fielder === 'bowler' ? `c & b ${bn}` : `c ${c.fielder || ''} b ${bn}`;
    else if (how === 'run out') how = `run out (${c.fielder || ''})`;
    else if (how === 'stumped') how = `st keeper b ${bn}`;
    else how = `${how} b ${bn}`.replace('bowled b', 'b');
    return `${w.player.name} ${how} ${w.card.runs} (${w.card.balls})`;
  }

  // "in by 12 cm" / "short by 30 cm" for a close run-out call
  function marginText(fr) {
    const mg = fr && fr.margin;
    if (!mg || Math.abs(mg.cm) > 60) return '';
    return mg.cm >= 0 ? `in by ${mg.cm} cm` : `short by ${-mg.cm} cm`;
  }

  // The live-ball bits both sessions share (mixed into their prototypes)
  const LiveMixin = {
    _mInit() {
      if (this.mm) return;
      this.mm = true;
      const m = matchOf(this);
      this.fs = new FieldSim({ skill: FIELD_SKILL[m.levelKey] || 0.62, cap: CAPS[m.inn.bowl] });
      this.ball.open = OUTFIELD;
      this.liveCam = new CLLM.MatchCam(this.game);      // holds, cuts, follows by crop & zoom (matchcam.js)
      this.live = false;
      this.figs = [];
      this.bowler.kit = FielderAnim.whites(CAPS[m.inn.bowl]);
      this.batter.kit = Object.assign({}, CLLM.Figure.KITS.batter, { helmet: CAPS[m.inn.bat], glovesTrim: CAPS[m.inn.bat] });
      this.fs.nsFig.kit = Object.assign({}, this.batter.kit);
      // your batters: sliding the bat in is automatic in v1
      this.fs.slideManual = false;
    },
    _goLive(hit, control, ai) {
      const b = this.b, now = this.game.clock;
      this.live = true; this.liveHit = hit; this.liveDoneAt = null;
      this.tContact = now; this.userCalled = false;
      this.runLock = now + RUN_LOCK;
      this.padded = !!(b.res && b.res.padHit) || !!(b.out && b.out.text && /pad/i.test(b.out.text));
      const pel = this.bowler.J ? this.bowler.J.pel : V.v(-1, 1, 17);
      this.batHide0 = this.batter.hideBat;
      this.batter.hideBat = false;
      const strikerZ = this.phys ? Math.max(0.6, this.phys.plane - 0.5) : 1.0;
      const keeperFumble = !!(b.res && b.res.keeperFumble);      // a missed stumping: the keeper's fumbled it
      this.fs.startLive(this.ball, { now, strikerFig: this.batter, strikerZ, hit, control, ai, bowlerFig: this.bowler, bowlerPos: { x: pel.x, z: pel.z }, keeperFumble });
      this.fs.userCalls = this.game.mode === 'bat' && control !== 'none';
      if (control === 'ai' && this.fs.runners[0].startIn > 0.35) this.fs.runners[0].startIn = 0.35;
      this.partner = null;
      this.liveDir = Math.atan2(this.ball.vel.x, this.ball.vel.z);
      this.liveCam.start(this.ball, this.fs, this.game.mode === 'bowl' ? 'bowl' : 'bat');
      this.game.ui.runHud(this, true);
      document.getElementById('bowlerTag').classList.add('hidden'); document.getElementById('controlsHint').classList.add('hidden');
      document.getElementById('coach').classList.add('hidden');       // eyes on the running
    },
    _liveStep(dt) {
      const now = this.game.clock, fs = this.fs;
      // nothing left to run for (it's in hand, or on its way back, and both
      // are in their ground): get on with it
      const settled = fs.canFastForward ? fs.canFastForward() : fs.tLive > 1.5 && !fs.result && fs.runners.every((r) => r.goal == null) &&
        (fs.ball.mode === 'held' || (fs.thrown && !fs.overthrow));
      fs.update(dt * (settled ? FF : 1), now);
      this.liveCam.update(dt);
      if (fs.result && this.liveDoneAt == null) {
        this.liveDoneAt = now;
        if (this.game.ui.verdictCard) this.game.ui.verdictCard(fs.result);
      }
      this._liveEvents();
    },
    // Sounds and shouts from the field
    _liveEvents() {
      const ui = this.game.ui;
      for (const e of this.fs.events.splice(0)) {
        if (e.type === 'boundary') { Audio.cheer(e.runs === 6); ui.callout(e.runs === 6 ? 'SIX!' : 'FOUR!', e.runs === 6 ? 'six' : 'four', e.overthrow ? 'overthrows' : ''); }
        else if (e.type === 'caught') { Audio.cheer(true); }
        else if (e.type === 'dropped') { Audio.groan(); ui.toast(`Dropped! ${e.fielder} put it down`); }
        else if (e.type === 'stumps') { Audio.stumps(); this.game.cam.shake = 0.2; }
        else if (e.type === 'runout') { Audio.cheer(true); }
        else if (e.type === 'safe') { const mt = marginText({ margin: this.fs.lastMargin }); ui.toast(`Not out${mt ? ' — ' + mt : ''}`); }
        else if (e.type === 'throw') {
          if (e.hard) {
            const txt = e.end === 0 ? 'Keeper!' : "Bowler's end!";
            if (ui.throwCue) ui.throwCue(e.end, txt); else ui.toast(`${e.fielder}: "${txt}"`);
          }
        }
        else if (e.type === 'dive') { if (e.runner) Audio.bounce(0.5); }
        else if (e.type === 'overthrow') ui.toast('Overthrow!');
        else if (e.type === 'fumble') ui.toast(`Fumbled by ${e.fielder}`);
        else if (e.type === 'call' && this.fs.userCalls) {
          const q = this.fs.queued;
          ui.toast(e.what === 'yes' ? (q > 1 ? 'Yes — and another!' : 'Yes!') : e.what === 'back' ? 'No! Get back!' : 'Just the one');
        }
      }
    },
    _liveEnd() {
      if (this.fs) this.fs.endLive();
      this.live = false;
      if (this.batHide0 != null) { this.batter.hideBat = this.batHide0; this.batHide0 = null; }
      if (this.liveCam) this.liveCam.stop();
      this.game.ui.runHud(this, false);
      document.body.classList.remove('running');
      document.getElementById('bowlerTag').classList.remove('hidden'); document.getElementById('controlsHint').classList.remove('hidden');
      this.game._setCamera();
    },
    // Your partner's call. The striker calls in front of square (that's
    // you); behind square your partner shouts it (at Club, always). Made
    // once, early, like a real one (WAIT while it's in the balance), and
    // changed only by news: a fumble or an overthrow.
    partnerCall() {
      const fs = this.fs;
      if (!this.live || !fs || fs.result || !fs.userCalls || fs.control === 'ai') return null;
      if (fs.tLive < 0.35) return null;
      const m = matchOf(this);
      const behind = Math.abs(this.liveDir || 0) > 100 * D2R;
      if (!behind && m.levelKey !== 'club' && fs.misfield == null) return null;
      const P = this.partner || (this.partner = { call: null, leg: -1, news: null });
      if (fs.misfield != null && fs.misfield !== P.news) { P.news = fs.misfield; P.call = null; P.leg = -1; }
      const running = fs.runners.some((r) => r.goal != null);
      if (fs.advice) {
        // YES / NO lock once given; WAIT until it resolves; TWO once per leg
        if (!running) {
          if (P.call === 'YES' || P.call === 'NO') return P.call;
          const c = fs.advice();
          if (c === 'YES' || c === 'NO') P.call = c;
          return c === 'TWO' ? null : c;
        }
        if (P.leg === fs.runsRun) return P.two ? 'TWO' : null;
        const c = fs.advice();
        if (c === 'TWO' || (c === null && Math.abs(fs.runners[0].z - 10) < 4)) { P.leg = fs.runsRun; P.two = c === 'TWO'; }
        return P.two && P.leg === fs.runsRun ? 'TWO' : null;
      }
      const back = fs._ballBackIn();
      if (!running) {
        if (P.call === 'YES' || P.call === 'NO') return P.call;
        const t1 = fs._legTime(true);
        const c = back > t1 + 0.45 ? 'YES' : back > t1 - 0.1 && fs.tLive < 1.2 ? 'WAIT' : 'NO';
        if (c !== 'WAIT') P.call = c;
        return c;
      }
      // running: halfway down, is there another?
      if (fs.queued > 1) return null;
      const A = fs.runners[0];
      if (P.leg === fs.runsRun) return P.two ? 'TWO' : null;
      if (Math.abs(A.z - 10) > 4) return null;
      P.leg = fs.runsRun;
      const tMore = fs._legTimeLeft(A) + fs._legTime(false) + 0.3;
      P.two = back > tMore + 0.5;
      return P.two ? 'TWO' : null;
    },
    _cullField() {
      for (const f of this.fs.fielders) if (f.role !== 'bowler' && f.fig !== this.batter && f.fig !== this.bowler) f.fig.cull = true;
      for (const u of this.fs.umpires) u.fig.cull = true;
    },
    camOverride() { return !!(this.liveCam && (this.liveCam.active != null ? this.liveCam.active : this.liveCam.on && this.liveCam.cut)); },
    // Scene: the ground, everyone on it
    _matchScene(base) {
      const figs = (this.figs || []).slice();
      if (!this.live) { figs.push(this.batter); }
      if (!this.live || this.fs.fielders.every((f) => f.role !== 'bowler')) figs.push(this.bowler);
      const fx = this.fs ? this.fs.stumpsState() : [null, null];
      base.figures = figs;
      base.stumps = [{ z: 0, state: fx[0] || this.stumpsFx }, { z: World.PITCH.LENGTH, state: fx[1] }];
      return base;
    },
  };

  // =================================================================================================
  // You bat
  // =================================================================================================
  class MatchBatting extends CLLM.BattingSession {
    constructor(game, opts) {
      super(game, Object.assign({}, opts, { bowler: 'pace' }));
      this.matchMode = true;
      this.assist = opts.assist || 'manual';
      this.innN = game.match.innings.length;                   // the innings this session plays
      game.ui.matchScore(game.match);
    }

    _newBall(delay) {
      this._mInit();
      const m = matchOf(this);
      if (m.inn.bowler == null) m.inn.bowler = m.aiPickBowler();
      const idx = m.inn.bowler, p = m.bowler();
      this.ais = this.ais || {};
      if (this.curBowler !== idx) {
        const habits = this.ai && this.ai.habits;
        if (p.bowl !== this.type) { this.type = p.bowl; this.bowlAnim.setType(this.type); }
        if (!this.ais[idx]) {
          this.ais[idx] = new Deliveries.AIBowler(this.type, this.diff);
          const mem = m.mem && m.mem.oppBowl && m.mem.oppBowl[idx];
          if (mem) this.ais[idx].habits = mem;
        }
        this.ai = this.ais[idx];
        if (habits && !this.ai.habits) this.ai.habits = habits;
        if (this.curBowler != null) this.game.ui.toast(`New bowler: ${p.name} (${Deliveries.TYPES[this.type].name.toLowerCase()})`);
        this.curBowler = idx;
        this.bowler.setSkin(idx + 2);
      }
      this.ramp = 0;
      // the real field (and keep the imaginary one in step, for anything that reads it)
      const fset = m.fieldSet();
      this.fs.setField(fset.positions, this.h);
      this._cullField();
      this.field.players = fset.positions.map((q) => ({ name: q.name, x: q.x, z: q.z }));
      this.fieldKey = fset.key;
      if (fset.note && fset.note !== this.fieldNote) { this.fieldNote = fset.note; }
      this.wide = false;
      super._newBall(delay);
      this.fs.preBall({ bowlerX: this.bowlAnim.S.runX });
      document.getElementById('bowlerTag').innerHTML = `<b>${esc(p.name)}</b> · ${Deliveries.TYPES[this.type].name}`;
    }

    _captain() { /* the match captain sets the fields */ }

    // Physical & classic verdicts: in a match the field decides catches and
    // runs, live. What's decided at the crease stays (bowled, LBW, played
    // on, stumped - though the keeper can miss a stumping).
    _physResolve() { super._physResolve(); this._toLive(); }
    _resolve() { super._resolve(); this._toLive(); }
    _resolveLeave() { super._resolveLeave(); this._toLive(); }
    _toLive() {
      const r = this.b.res;
      if (!r) return;
      if (r.out && r.how === 'caught') { r.out = false; r.how = null; }
      if (r.out && r.how === 'stumped' && Math.random() > 0.5 + 0.45 * (FIELD_SKILL[matchOf(this).levelKey] || 0.6)) {
        r.out = false; r.how = null; r.call = 'Missed stumping!'; r.sub = 'The keeper fumbled it'; r.keeperFumble = true;
      }
      r.runs = 0;
      r.proj = null;
    }

    input(ev, t) {
      if (this.waiting) return;                                // handed over to the flow (a break / result card)
      if (this.live) {
        const fs = this.fs, now = this.game.clock, k = ev.key;
        // the ball's dead: Enter / Space / a click / a tap gets on with it
        if (fs.result) {
          const skip = (ev.type === 'keydown' && (k === 'enter' || k === ' ')) || ev.type === 'mousedown' || (ev.type === 'touchbtn' && ev.phase !== 'up');
          if (skip && this.liveDoneAt != null && now >= this.liveDoneAt + 0.3) this.liveDoneAt = now - LINGER;
          return;
        }
        if (t < this.tContact + RUN_LOCK || !fs.userCalls) return;
        let cmd = null;
        // fresh presses only (held keys don't repeat): W / up = run, S / down = back, Space = dive
        if (ev.type === 'keydown') {
          if (k === 'w' || k === 'arrowup') cmd = 'run';
          else if (k === 's' || k === 'arrowdown') cmd = 'back';
          else if (k === ' ' && fs.diveLegal && fs.diveLegal()) cmd = 'dive';
        } else if (ev.type === 'touchbtn' && ev.phase !== 'up') cmd = k === 'runyes' ? 'run' : k === 'runno' ? 'back' : k === 'dive' ? 'dive' : null;
        if (cmd && fs.call(cmd)) {
          this.userCalled = true;
          if (cmd === 'run' && this.liveCam.forceCut) this.liveCam.forceCut();
        }
        return;
      }
      super.input(ev, t);
    }

    update(dt) {
      const b = this.b, now = this.game.clock;
      if (this.waiting) { this.figs = this.fs.pose(now, {}); return; }     // parked under a break / result card
      if (!this.live && b) {
        const run = b.phase === 'runup' ? M.clamp(1 - (b.tRelease - now) / 2.2, 0, 1) : 1;
        this.fs.preUpdate(dt, now, run, b.phase !== 'runup');
      }
      // wides: well out of reach as it passes the stumps, and no shot at it
      if (b && b.plan && !b.wideChecked && b.phase === 'flight' && now >= this.tAt(0)) {
        b.wideChecked = true;
        const x = BallPhys.posAt(b.plan, BallPhys.timeAtZ(b.plan, 0)).x * -this.h;
        if ((x > WIDE.off || x < WIDE.leg) && !(b.res && b.res.contact) && !this._offered()) { this.wide = true; this.game.ui.toast('Wide'); }
      }
      super.update(dt);
      if (this.waiting) return;                                // (_nextBall just handed over)
      if (this.live) this._liveStep(dt);
      this.figs = this.fs.pose(now, { set: b && b.phase === 'runup' });
      // the delivery view: anyone right on top of the camera (the keeper
      // standing up) fades, as the nets fade the bowler; the follow cam sees all
      const follow = this.camOverride(), cam = this.game.cam;
      for (const f of this.fs.fielders) {
        const fig = f.fig;
        if (f.role === 'bowler' || fig === this.batter || fig === this.bowler || !fig.J) continue;
        fig.alpha = follow ? 1 : M.clamp((cam.depth(fig.J.pel) - 1.8) / 3.5, 0, 1);
      }
      if (this.live) this.game.ui.runHud(this, true);
    }

    // Did you play at it? (physical: not a leave; classic: you clicked)
    _offered() {
      const b = this.b, r = b && b.res;
      if (this.physical) return !!(r && r.kind !== 'leave');
      return !!(b && b.ex);
    }
    _runControl() {
      const m = matchOf(this);
      const skill = M.clamp(m.striker().bat || 0.7, 0.3, 0.95);
      return { control: m.assist === 'auto' ? 'ai' : 'player', ai: { skill, aggression: 0.45 } };
    }
    _doHit() {
      super._doHit();
      if (!this.b.res.out) { const c = this._runControl(); this._goLive(true, c.control, c.ai); }
    }
    _missVisual(now) {
      super._missVisual(now);
      const b = this.b, r = b.res;
      if (!(b.hitDone && !r.out && !this.live)) return;
      if (!LIVE_MISSES) return;
      // padded with no shot offered: no leg-byes (it's dead once settled)
      const c = r.padHit && !this._offered() ? { control: 'none', ai: null } : this._runControl();
      this._goLive(false, c.control, c.ai);
    }
    _resultReady(now) {
      const r = this.b.res;
      if (r.out && !this.live) return super._resultReady(now);
      if (!this.live) return !LIVE_MISSES && !r.contact ? super._resultReady(now) : false;
      return this.liveDoneAt != null && now >= this.liveDoneAt + LINGER;
    }

    _finishBall() {
      const b = this.b, r = b.res, m = matchOf(this);
      b.phase = 'done'; b.tDone = this.game.clock;
      let res;
      if (r.out && !this.live) res = { runs: 0, boundary: 0, extras: {}, legal: true, swapped: false, out: { how: r.how, who: 'striker', fielder: r.how === 'stumped' ? 'keeper' : null, bowlerCredit: true } };
      else res = liveBallResult(this.fs.result, this.liveHit, !!r.padHit);
      if (this.wide) { res.extras.w = 1 + (res.extras.b || 0); delete res.extras.b; res.legal = false; }
      if (r.exitPhi != null) res.phi = M.deg(M.wrapAng(r.exitPhi * -this.h));
      const inn0 = m.inn;
      const ev = m.applyBall(res);
      this.lastEv = ev;
      if (res.out && !ev.wicket) res.out = null;               // (a run out after the winning run: it didn't count, Law 16.6)
      // remember how this bowler has been working you out
      if (this.ai && this.curBowler != null) { m.mem = m.mem || { oppBat: {}, oppBowl: {} }; m.mem.oppBowl[this.curBowler] = this.ai.habits || null; }
      if (ev.captain) this.game.ui.toast(ev.captain);
      // the call: what happened
      const fr = this.fs.result;
      if (fr && this.game.ui.marginChip) this.game.ui.marginChip(fr.closest || null);
      const mt = marginText(fr);
      r.runs = res.runs;
      if (res.out) {
        r.out = true;
        r.call = res.out.how === 'run out' ? 'RUN OUT!' : res.out.how === 'caught' ? `Caught${res.out.fielder ? ' — ' + res.out.fielder : ''}!` : res.out.how === 'stumped' ? 'Stumped!' : r.call;
        r.sub = outText(m, ev, inn0) + (res.out.how === 'run out' && mt ? ` · ${mt}` : '');
      } else {
        r.out = false;
        const x = res.extras;
        r.call = res.boundary === 6 ? 'SIX!' : res.boundary === 4 ? 'FOUR!' : x.w ? 'Wide' : x.lb ? `${x.lb} leg bye${x.lb > 1 ? 's' : ''}` : x.b ? `${x.b} bye${x.b > 1 ? 's' : ''}` : res.runs ? `${res.runs} run${res.runs > 1 ? 's' : ''}` : (r.call || 'Dot ball');
        r.sub = [fr && fr.drops.length ? `Dropped by ${fr.drops[0]}` : '', mt ? `Made it — ${mt}` : '', fr && fr.overthrow ? 'overthrows' : ''].filter(Boolean).join(' · ') || (r.sub || '');
      }
      this.game.ui.ballResult(this, r);
      this.game.ui.matchScore(m, ev);
      b.tEnd = b.tDone + (res.out ? 1.6 : 0.6);
      if (ev.overEnd && !ev.inningsEnd) this.game.ui.toast(`End of the over · ${m.scoreLine()}`);
      this.game.matchFlow.overNotes(ev);
    }

    _nextBall() {
      const m = matchOf(this), ev = this.lastEv || {};
      this._liveEnd();
      // the innings (or the match) is over: hand over to the flow ONCE and park
      if (ev.inningsEnd || ev.matchEnd || m.result || m.followOnPending || !m.youBatting) { this.waiting = true; this.game.matchFlow.afterInnings(); return; }
      this._newBall(0.25);
      this.game.ui.matchScore(m);
    }

    scene() { return this._matchScene(super.scene()); }
    _extra(queue, cam) { if (!this.live) super._extra(queue, cam); }
  }
  Object.assign(MatchBatting.prototype, LiveMixin);

  // =================================================================================================
  // You bowl
  // =================================================================================================
  class MatchBowling extends CLLM.BowlingSession {
    constructor(game, opts) {
      super(game, opts);
      this.matchMode = true;
      this._mInit();
      this.ais = {};
      this.innN = game.match.innings.length;
      this._setStriker();
      this._toPlan(0.3);                                       // (the nets' own _toPlan ran before there was a field)
      game.ui.matchScore(game.match);
    }

    input(ev, t) {
      if (this.waiting) return;                                // the bowler picker has the keys
      if (this.live && this.fs.result && this.liveDoneAt != null) {
        const k = ev.key;
        const skip = (ev.type === 'keydown' && (k === 'enter' || k === ' ')) || ev.type === 'mousedown' || (ev.type === 'touchbtn' && ev.phase !== 'up');
        if (skip && this.game.clock >= this.liveDoneAt + 0.3) { this.liveDoneAt = this.game.clock - LINGER; return; }
      }
      if (this.live) return;
      // skipping the result card mustn't skip an over break or an innings break
      const b = this.b;
      if (b && b.phase === 'result' && (this.pendingOver || this.pendingFlow)) {
        const k = ev.key;
        const skip = (ev.type === 'keydown' && (k === ' ' || k === 'enter')) || (ev.type === 'mousedown' && ev.button === 0) || (ev.type === 'touchbtn' && k === 'bowl' && ev.phase === 'down');
        if (skip && this.game.clock > b.tResult + 0.4) b.tResult = this.game.clock - 1.4;
        return;
      }
      super.input(ev, t);
    }

    // The batter on strike: his hand, his skill, his own read of you
    _setStriker() {
      const m = matchOf(this), inn = m.inn;
      const p = m.striker();
      const i = inn.striker;
      if (this.strikerIdx !== i) {
        this.strikerIdx = i;
        this.hand = p.hand; this.h = p.hand === 'L' ? -1 : 1;
        this.batter.mirror = p.hand === 'L';
        this.batter.setSkin(i + 3);
        if (!this.ais[i]) {
          const a = new CLLM.AIBatter(p.bat, p.hand);
          a.setType(this.type);
          const mem = m.mem && m.mem.oppBat && m.mem.oppBat[i];
          if (mem) Object.assign(a, mem);
          this.ais[i] = a;
        }
        this.ai = this.ais[i];
      }
      this.ai.S = M.clamp(p.bat, 0.08, 0.97);
      this.aggression = m.aiAggression();
      // Test cricket: far more patient than the nets batter (who's there to hit you)
      this.ai.tempo = 0.8 * (m.aiTempo ? m.aiTempo() : M.clamp(1 + (this.aggression - 0.45) * 1.6, 0.5, 1.6));
      if (this.ai.C > 0.35) this.ai.C = 0.35;          // a Test innings: nobody starts out slogging
    }

    // Your bowler for this over (picked in the over break)
    setBowler(idx) {
      const m = matchOf(this), p = m.teams.you.players[idx];
      m.inn.bowler = idx;
      if (p.bowl !== this.type) {
        this.type = p.bowl; this.spin = this.type !== 'pace';
        this.bowlAnim.setType(this.type);
        for (const k in this.ais) this.ais[k].setType(this.type);
        this.varIdx = 0; this.flight = 'stock';
        this.target = { off: 0.18, len: this.spin ? 4.0 : 7.0 };
        this.groove = 0;
      }
      this.bowler.setSkin(idx + 1);
      this.refreshHud();
    }

    _toPlan(delay) {
      if (this.mm) {
        this._liveEnd();
        const m = matchOf(this);
        this._setStriker();
        const fset = m.fieldSet();
        this.fs.setField(fset.positions, this.h);
        this._cullField();
        this.field.players = fset.positions.map((q) => ({ name: q.name, x: q.x, z: q.z }));
        this.fs.preBall({ bowlerX: this.bowlAnim.S.runX });
        this.freeHit = false;                                   // no free hits in Tests
      }
      super._toPlan(delay);
    }

    // The AI batter's stroke: how well he timed it (E, lower = better) sets
    // how hard it goes and where; the live field then decides what it's worth.
    _batterResponds() {
      super._batterResponds();
      const b = this.b, o = b.out, r = b.ai, plan = b.plan;
      if (o.out && o.how === 'caught') { o.out = false; o.how = null; o.text = ''; }
      o.runs = 0;
      if (!b.exit || b.exit.playedOn || o.out) return;
      const E = r.E, spin = this.spin;
      const vIn = V.len(BallPhys.velAt(plan, BallPhys.timeAtZ(plan, 1.5)));
      let ex = b.exit;
      // Test batters keep it on the ground: most lofts become drives
      if (o.kind === 'loft' && Math.random() < 0.75 && !b.d.freeHit) o.kind = 'hit';
      // where it goes (into a gap now and then, better players more often) is
      // separate from how hard (the timing): a soft push into a gap is a
      // single, a firm one to the man is a dot, a firm one into a gap is four
      const placed = Math.random() < 0.18 + 0.25 * this.ai.S;
      // a defensive push with soft hands, now and then, into a gap: the quick single
      if (o.kind === 'block' && Math.random() < 0.3 + 0.2 * (this.aggression || 0.45)) {
        o.kind = 'push';
        ex = { rel: this._gapAngle(Math.random() < 0.7), v: M.rand(3.5, 7.5), loft: 0.02 };
      }
      if (o.kind === 'hit') ex = { rel: this._gapAngle(placed), v: M.lerp(26, 8, M.clamp(E, 0, 1)) * (spin ? 0.87 : 1), loft: M.rand(0.02, 0.07) };
      else if (o.kind === 'loft') {
        ex = E <= 0.75
          ? { rel: this._gapAngle(placed), v: M.lerp(35, 22, E / 0.75), loft: M.rand(0.48, 0.6) }
          : { rel: this._gapAngle(false), v: M.rand(15, 18), loft: M.rand(0.85, 1.0) };           // skied, toward a fielder
      } else if (o.kind === 'edge') {
        if (r.timingDominant && r.et < 0) ex = { rel: (r.xcHat > 0 ? 1 : -1) * M.rand(20, 45), v: 13, loft: 0.6 };      // leading edge: up in the air
        else if (r.timingDominant) ex = { rel: M.rand(110, 135), v: M.rand(10, 15), loft: 0.04 };                       // thick edge, squirts square
        else if (b.exit.rel > 120 || b.exit.rel < -120) ex = b.exit.rel > 0
          ? { rel: M.rand(150, 175), v: 0.75 * vIn, loft: M.rand(0.1, 0.2) }                                             // thin edge: to the keeper and slips
          : { rel: M.rand(-165, -140), v: 0.45 * vIn, loft: M.rand(0.0, 0.08) };                                         // inside edge, fine
      } else if (o.kind === 'block') ex = { rel: M.rand(-20, 20), v: M.rand(2, 4), loft: -0.2, block: true };
      b.exit = ex;
      // re-aim the stroke to match
      const relToWorld = (deg) => M.wrapAng(deg * D2R * -this.h);
      b.phi = relToWorld(ex.rel);
      if (o.kind === 'hit' || o.kind === 'loft') {
        const dW = { x: Math.sin(b.phi), z: Math.cos(b.phi) };
        const u = V.norm(V.v(this.batter.mirror ? -dW.x : dW.x, 0, dW.z));
        const c = r.foot === 'front' ? 2.0 : 0.8;
        const C0 = BallPhys.posAt(plan, BallPhys.timeAtZ(plan, c));
        const C = this.batter.mirror ? V.v(-C0.x, C0.y, C0.z) : C0;
        const fam = r.foot === 'front' ? (ex.rel < -40 ? 'flick' : o.kind === 'loft' ? 'loft' : 'drive') : (ex.rel > 70 ? 'cut' : ex.rel < -40 ? 'pull' : 'punch');
        this.batAnim.playShot(BatterAnim.makeShot(fam, C, u, b.tContact, 0.11));
      }
    }

    // Aiming at the field: "into a gap" or "at a man" means the ring and the
    // deep, not the close catchers (a firm shot isn't aimed at silly point)
    _gapAngle(good) {
      const pl = this.field.players.filter((p) => p.name !== 'keeper' && Math.hypot(p.x, p.z) >= 12);
      const cands = [];
      for (let a = -150; a <= 150; a += 6) {
        const phi = M.wrapAng(a * D2R * -this.h);
        let near = Infinity;
        for (const p of pl) near = Math.min(near, Math.abs(M.wrapAng(Math.atan2(p.x, p.z) - phi)));
        cands.push({ a, near });
      }
      cands.sort((x, y) => (good ? y.near - x.near : x.near - y.near));
      return cands[Math.floor(Math.random() * Math.min(6, cands.length))].a;
    }

    _contact() {
      super._contact();
      const b = this.b;
      if (!b.exit || !b.exit.playedOn) this._goLive(true, 'ai', { skill: this.ai.S, aggression: this.aggression || 0.5 });
    }
    _missVisual() {
      super._missVisual();
      const b = this.b;
      if (!(b.hitDone && !b.out.out && !this.live) || !LIVE_MISSES) return;
      const offered = b.ai && b.ai.shot !== 'leave' && b.ai.shot !== 'duck';
      const padded = !!(b.out && !b.contact && /pad/i.test(b.out.text || ''));     // (this ball's, not the last live one's)
      this._goLive(false, padded && !offered ? 'none' : 'ai', { skill: this.ai.S, aggression: 0.2 });
    }

    update(dt) {
      const b = this.b, now = this.game.clock;
      if (!this.live && b) {
        const run = b.phase === 'runup' || b.phase === 'load' ? M.clamp(b.beats && b.beats.length ? (now - b.beats[0]) / Math.max(0.5, b.tRelTarget - b.beats[0]) : 0, 0, 1) : b.phase === 'plan' ? 0 : 1;
        this.fs.preUpdate(dt, now, run, b.phase === 'flight' || b.phase === 'result');
      }
      super.update(dt);
      if (this.live) this._liveStep(dt);
      this.figs = this.fs.pose(now, { set: b && (b.phase === 'runup' || b.phase === 'load') });
      if (this.live) this.game.ui.runHud(this, true);
    }

    _finish() {
      const b = this.b;
      if (this.live && (this.liveDoneAt == null || this.game.clock < this.liveDoneAt + LINGER * 0.6)) return;
      if (!this.live && !b.out.out && !b.hitDone) return;          // wait for it to reach the keeper
      if (!this.live && !b.out.out && LIVE_MISSES && !b.contact && b.hitDone) return;   // it's about to go live
      const m = matchOf(this), o = b.out;
      let res;
      if (o.out && !this.live) res = { runs: 0, boundary: 0, extras: {}, legal: true, swapped: false, out: { how: o.how, who: 'striker', fielder: null, bowlerCredit: true } };
      else res = liveBallResult(this.fs.result, this.liveHit, this.padded);
      if (b.noBall) {
        res.extras.nb = 1; res.legal = false;
        if (res.out && res.out.how !== 'run out') {
          // a no-ball: not out, and a catch no longer cancels the runs they'd completed
          const fr = this.fs.result;
          if (res.out.how === 'caught' && fr && this.liveHit) res.runs = fr.ran != null ? fr.ran : fr.runs || 0;
          res.out = null;
        }
      }
      // wides: well out of the batter's reach, and he didn't play at it (a no-ball
      // call trumps a wide, Law 21.13; a run out or stumping off a wide stands with it)
      const xs = b.plan ? BallPhys.posAt(b.plan, BallPhys.timeAtZ(b.plan, 0)).x * -this.h : 0;
      const offered = b.ai && b.ai.shot !== 'leave' && b.ai.shot !== 'duck';
      if (!b.noBall && !b.contact && !offered && (xs > WIDE.off || xs < WIDE.leg)) { res.extras.w = 1 + (res.extras.b || 0); delete res.extras.b; res.legal = false; }
      if (b.exit && b.exit.rel != null) res.phi = b.exit.rel;
      const inn0 = m.inn;
      const ev = m.applyBall(res);
      this.lastEv = ev;
      if (res.out && !ev.wicket) res.out = null;               // (a run out after the winning run: it didn't count, Law 16.6)
      // he remembers you (and it's saved with the match)
      if (this.ai) {
        m.mem = m.mem || { oppBat: {}, oppBowl: {} };
        const a = this.ai;
        m.mem.oppBat[this.strikerIdx] = { C: a.C, P: a.P, mAir: a.mAir, mPitch: a.mPitch, vHat: a.vHat, f: a.f, hist: (a.hist || []).slice(-12) };
      }
      // the AI captain declares when he's got enough (checked at every dead ball)
      if (!ev.inningsEnd && !m.result && m.aiShouldDeclare()) { m.declare(); ev.inningsEnd = 'declared'; this.game.ui.toast(`${m.teams.opp.name} declare`); }
      if (ev.captain) this.game.ui.toast(ev.captain);
      // the nets' spell bookkeeping + result card, with the live outcome
      const fr = this.fs.result, mt = marginText(fr);
      o.runs = res.runs;
      o.out = !!res.out;
      if (res.out) { o.how = res.out.how; o.text = outText(m, ev, inn0) + (res.out.how === 'run out' && mt ? ` · ${mt}` : ''); }
      else if (res.boundary) o.text = res.boundary === 6 ? 'SIX — cleared the rope' : 'FOUR — to the rope';
      else if (res.extras.w) o.text = 'Wide';
      else if (res.extras.lb || res.extras.b) o.text = `${res.extras.lb || res.extras.b} ${res.extras.lb ? 'leg bye' : 'bye'}${(res.extras.lb || res.extras.b) > 1 ? 's' : ''}`;
      else if (res.runs) o.text = `${res.runs} run${res.runs > 1 ? 's' : ''}${mt ? ' — ' + mt : ''}`;
      else if (!o.text) o.text = 'Dot ball';
      if (fr && fr.drops.length) o.text += ` · dropped by ${fr.drops[0]}`;
      super._finish();
      this.freeHit = false;
      b.tResult -= 0.6;                                   // a match moves along a touch quicker than the nets
      this.game.ui.matchScore(m, ev);
      this.game.matchFlow.overNotes(ev);
      if (ev.inningsEnd || ev.matchEnd || m.result || m.followOnPending) { this.pendingFlow = true; }
      else if (ev.overEnd) this.pendingOver = true;
    }

    // The nets' result card (rhythm, release, pace...), with the match's words
    _resultCard() {
      super._resultCard(false);
      const b = this.b, o = b.out;
      const big = o.out ? 'WICKET!' : o.runs === 6 ? 'SIX' : o.runs === 4 ? 'FOUR' : b.noBall ? 'NO BALL' : o.runs ? `${o.runs} run${o.runs > 1 ? 's' : ''}` : /Wide|bye/.test(o.text) ? o.text : 'Dot ball';
      this.game.ui.callout(big, o.out ? 'good' : o.runs >= 4 ? 'out' : '', o.text);
    }

    refreshHud() {
      const m = matchOf(this);
      if (!m) return super.refreshHud();
      this.game.ui.matchScore(m);
      const p = m.bowler();
      document.getElementById('bowlerTag').innerHTML = `${p ? `<b>${esc(p.name)}</b> · ` : ''}${Deliveries.TYPES[this.type].name} · ${this.vars[this.varIdx].name}${this.spin ? ` · ${this.flight}` : ''}`;
    }

    // after the result: over breaks and innings breaks go through the flow
    _tick() {
      const b = this.b;
      if (b.phase === 'result' && this.game.clock > b.tResult + 1.4) {
        if (this.pendingFlow) { this.pendingFlow = false; this._liveEnd(); this.waiting = true; this.game.matchFlow.afterInnings(); return true; }
        if (this.pendingOver) { this.pendingOver = false; this._liveEnd(); this.game.matchFlow.overBreak(); return true; }
      }
      return false;
    }

    scene() { return this._matchScene(super.scene()); }
  }
  Object.assign(MatchBowling.prototype, LiveMixin);
  // BowlingSession.update moves on to the next ball 2.6 s after the result;
  // a match first checks for an over / innings break.
  const baseBowlUpdate = MatchBowling.prototype.update;
  MatchBowling.prototype.update = function (dt) {
    if (this.b && this.b.phase === 'result' && this._tick()) return;
    if (this.waiting) { this.figs = this.fs.pose(this.game.clock, {}); return; }
    return baseBowlUpdate.call(this, dt);
  };

  // =================================================================================================
  // The flow of a match
  // =================================================================================================
  const MatchFlow = {
    game: null,
    shown: null,                     // the between-innings card that's up (each is shown once)
    init(game) { this.game = game; game.matchFlow = this; },

    // A new match (after the toss) or a saved one
    begin(m) {
      const g = this.game;
      g.match = m;
      m.save();
      this.startInnings();
    },

    startInnings() {
      const g = this.game, m = g.match;
      this.shown = null;
      if (m.result) return this.showResult();
      if (m.followOnPending) return this.askFollowOn();
      World.scene = 'ground';
      if (m.youBatting) {
        g.startMatchBatting({ hand: m.hand, diff: m.levelKey, controls: m.controls, assist: m.assist });
      } else {
        g.startMatchBowling({ type: 'pace', hand: m.striker().hand, diff: m.levelKey });
        // a new over: pick your bowler; a match saved mid-over: he carries on
        if (m.inn.bowler == null) this.overBreak(m.inn.balls === 0);
        else { g.session.setBowler(m.inn.bowler); g.session._toPlan(0.3); }
      }
      g.ui.matchScore(m);
    },

    // The flow takes over (a break, the follow-on, the result): the ball's
    // dead and the session stops where it is (it only poses the figures)
    // until startInnings replaces it
    _park() {
      const s = this.game.session;
      if (!s) return;
      if (s.live && s._liveEnd) s._liveEnd();
      if (s._stopAudio) s._stopAudio();
      s.waiting = true; s.parked = true; s.pendingOver = false; s.pendingFlow = false;
    },
    // each card once per innings end (a repeat call while it's up changes nothing)
    _once(kind) {
      const m = this.game.match, key = `${m.id}.${m.innings.length}.${kind}`;
      if (this.shown === key) return false;
      this.shown = key;
      return true;
    },
    // Does the session still play the match's current innings? (not when an
    // innings, or the match, has just ended and its card is due)
    _inStep() {
      const g = this.game, m = g.match, s = g.session;
      return !!(s && !s.parked && !m.result && !m.followOnPending && (s.innN == null || s.innN === m.innings.length) && (g.mode === 'bat') === m.youBatting);
    },

    // Lunch, tea, stumps (and a new ball) as the overs tick by
    overNotes(ev) {
      if (!ev) return;
      const m = this.game.match;
      const note = ev.session ? m.sessionNote(ev) : '';
      if (note) this.game.ui.toast(note);
      if (ev.newBall) this.game.ui.toast('New ball taken');
    },

    // Your bowling: choose who bowls the next over
    overBreak(first) {
      const g = this.game, m = g.match, s = g.session;
      if (!m || m.youBatting || m.result) return;
      s.waiting = true;
      g.ui.bowlerPicker(m, (choice) => {
        s.waiting = false;
        if (choice === 'sim') { this.simOver(); return; }
        if (choice === 'siminns') { this.simTo('innings'); return; }
        s.setBowler(choice);
        s._toPlan(0.3);
      }, first);
    },

    // Let the AI bowl an over for you (by the numbers; their captain still
    // declares at any dead ball he should)
    simOver() {
      const g = this.game, m = g.match;
      const r = m.simUntil('over', { userBowling: true });
      for (const ev of r.events) if (ev.session || ev.newBall) this.overNotes(ev);
      if (r.events.some((ev) => ev.tag === 'dec')) g.ui.toast(`${m.teams.opp.name} declare`);
      if (r.stopped !== 'over' && r.stopped !== 'guard') return this.afterInnings();
      g.ui.matchScore(m);
      g.ui.toast(`Over simulated · ${m.scoreLine()}`);
      this.overBreak();
    },

    // Simulate ahead: 'wicket' | 'innings' | 'bat' (until you're batting) | 'bowl'
    simTo(until) {
      const g = this.game, m = g.match, s = g.session;
      if (!m) return;
      if (s && s.live) s._liveEnd();
      if (s) { s.pendingOver = false; s.pendingFlow = false; }
      // an innings that's just ended goes to its card first (never sim the next one behind it)
      if (!this._inStep()) return this.afterInnings();
      const n = m.innings.length, w0 = m.inn.wkts;
      const userBowling = g.mode === 'bowl';
      if (m.simUntil && (until === 'over' || until === 'wicket' || until === 'session' || until === 'innings')) {
        m.simUntil(until, { userBowling });
      } else {
        let guard = 0;
        while (!m.result && !m.followOnPending && guard++ < 20000) {
          const overDone = !userBowling || m.inn.overBalls === 0;
          if (until === 'innings' && m.innings.length !== n) break;
          if (until === 'over' && m.innings.length === n && m.inn.overBalls === 0 && guard > 1) break;
          if (until === 'wicket' && (m.inn.wkts !== w0 || m.innings.length !== n) && overDone) break;
          if (until === 'bat' && m.youBatting && m.innings.length !== n) break;
          if (until === 'bowl' && !m.youBatting && m.innings.length !== n) break;
          if (m.inn.bowler == null) m.inn.bowler = m.aiPickBowler();
          if (m.inn.bat === 'opp' && m.aiShouldDeclare()) { m.declare(); continue; }
          m.applyBall(m.simBall());
        }
      }
      g.ui.matchScore(m);
      if (m.innings.length !== n || m.result || m.followOnPending) return this.afterInnings();
      // same innings (a wicket fell, an over went by): carry on playing it
      if (g.mode === 'bat') { s._liveEnd && s._liveEnd(); s._newBall(0.8); }
      else if (m.inn.overBalls > 0 && m.inn.bowler != null) { s.setBowler(m.inn.bowler); s._toPlan(0.3); }
      else this.overBreak();
    },

    afterInnings() {
      const g = this.game, m = g.match;
      this._park();
      g.ui.matchScore(m);
      if (m.result) return this.showResult();
      if (m.followOnPending) return this.askFollowOn();
      if (!this._once('break')) return;
      // an innings just ended: show the card, then start the next
      const done = m.innings[m.innings.length - 2];
      g.ui.inningsBreak(m, done, () => this.startInnings());
    },

    askFollowOn() {
      const g = this.game, m = g.match;
      this._park();
      if (!this._once('followOn')) return;
      g.ui.followOnPrompt(m, (enforce) => { m.chooseFollowOn(enforce); this.startInnings(); });
    },

    showResult() {
      const g = this.game, m = g.match;
      this._park();
      if (!this._once('result')) return;
      g.ui.matchResult(m, () => { Match.clear(); g.match = null; g.quitToMenu(); g.onMenu && g.onMenu(); });
    },

    declare() {
      const g = this.game, m = g.match;
      if (!m || !m.youBatting || !m.F.budget) return;
      if (!this._inStep()) return this.afterInnings();        // (your innings hasn't begun: its card first)
      this._park();
      m.declare();
      this.afterInnings();
    },
  };

  CLLM.MatchBatting = MatchBatting;
  CLLM.MatchBowling = MatchBowling;
  CLLM.MatchFlow = MatchFlow;
  CLLM.MATCH_OUTFIELD = OUTFIELD;
})();
