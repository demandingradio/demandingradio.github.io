/*
 * MAIN
 * ====
 * Boots the game and wires the DOM menus, pause screen and touch buttons.
 */
(function () {
  const CLLM = window.CLLM;
  const { Game, Audio, CFG, Input } = CLLM;
  const $ = (id) => document.getElementById(id);

  const game = new Game($('game'));
  window.__cllm = game;                         // console debugging
  const S = game.save.data.settings;
  const { Match, MatchFlow } = CLLM;
  MatchFlow.init(game);
  game.onMenu = () => { setTouchMode(null); show('title'); };

  let lastSetup = null;                         // 'bat' | 'bowl'

  // Match mode is for testers until CFG.MATCH.PUBLIC: ?match=1 (remembered on this device)
  const matchFlag = game.ui.matchFlag ? game.ui.matchFlag() : !!(CFG.MATCH && CFG.MATCH.PUBLIC);
  $('goMatch').classList.toggle('hidden', !matchFlag);

  function show(id) {
    for (const s of ['title', 'setupBat', 'setupBowl', 'setupMatch', 'pause']) $(s).classList.toggle('hidden', s !== id);
    $('back').classList.toggle('hidden', id == null);
    document.body.classList.toggle('in-menu', !!id);
    if (id === 'title') { renderBests(); renderContinue(); }
  }

  // A match in progress (saved after every ball)
  function renderContinue() {
    let m = null, sub = '';
    if (matchFlag) {
      try {
        m = Match.load();
        if (m) sub = `${m.F.name} · ${m.teams.you.name} v ${m.teams.opp.name} · ${m.teams[m.inn.bat].name} ${m.scoreLine()} · ${m.situation()}`;
      } catch (e) { m = null; }         // a save we can't read: no card rather than a broken menu
    }
    $('goContinue').classList.toggle('hidden', !m);
    if (m) $('continueSub').textContent = sub;
  }

  // Running assist: 'default' is decided when the match starts (touch: your partner runs)
  function resolveAssist(v) {
    if (v === 'manual' || v === 'auto') return v;
    const D = (CFG.MATCH && CFG.MATCH.ASSIST_DEFAULT) || { desktop: 'manual', touch: 'auto' };
    return game.input.touch ? D.touch : D.desktop;
  }

  function renderBests() {
    const top = game.save.topBat();
    const st = game.save.data.stats;
    const parts = [];
    if (top) {
      const [diff, bk, hand] = top.key.split('.');
      const phys = bk.endsWith('-phys');
      const bowler = phys ? bk.slice(0, -5) : bk;
      const bName = bowler === 'mixed' ? 'mixed' : CLLM.Deliveries.TYPES[bowler] ? CLLM.Deliveries.TYPES[bowler].name.toLowerCase() : bowler;
      parts.push(`Best innings <b>${top.runs}</b> (${top.balls}b · ${CFG.DIFFS[diff] ? CFG.DIFFS[diff].name : diff} · ${bName}${phys ? ' · physical bat' : ''})`);
    }
    if (st.batBalls) parts.push(`Balls faced <b>${st.batBalls}</b> · runs <b>${st.batRuns}</b> · 4s <b>${st.fours}</b> · 6s <b>${st.sixes}</b>`);
    if (st.bowlBalls) parts.push(`Balls bowled <b>${st.bowlBalls}</b> · wickets <b>${st.bowlWkts}</b>${st.topSpeed ? ` · top speed <b>${Math.round(st.topSpeed)}</b> km/h` : ''}`);
    $('titleBests').innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
  }

  // The match lengths say what they are (from the formats themselves)
  document.querySelectorAll('.seg[data-key="mFormat"] button').forEach((b) => {
    const F = Match.FORMATS && Match.FORMATS[b.dataset.v], sm = b.querySelector('small');
    if (F && F.blurb && sm) sm.textContent = F.blurb;
  });

  // Segmented option buttons bound to settings
  const segSyncs = [];
  document.querySelectorAll('.seg[data-key]').forEach((seg) => {
    const key = seg.dataset.key;
    const sync = () => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === S[key]));
      if (key === 'diff') $('diffBlurb').textContent = CFG.DIFFS[S.diff].blurb;
      if (key === 'batControls') {
        $('howtoPhys').classList.toggle('hidden', S.batControls !== 'physical');
        $('howtoClassic').classList.toggle('hidden', S.batControls === 'physical');
      }
      if (key === 'runAssist' && $('assistBlurb')) {
        const a = resolveAssist(S.runAssist), def = S.runAssist !== 'manual' && S.runAssist !== 'auto';
        $('assistBlurb').textContent = (def ? (game.input.touch ? 'On a touch screen: ' : 'On a keyboard: ') : '') + (a === 'auto'
          ? 'your partner calls and runs; press RUN or BACK (W / S) and you take over for the rest of that ball.'
          : 'you call every run (W run · S back · Space dive); your partner still shouts behind square.');
      }
    };
    segSyncs.push(sync);
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      S[key] = b.dataset.v;
      game.save.write();
      Audio.unlock(); Audio.ui();
      syncSegs();                               // (the Bat and Match setups share some settings)
    });
    sync();
  });
  const syncSegs = () => segSyncs.forEach((f) => f());

  $('goBat').addEventListener('click', () => { Audio.unlock(); Audio.ui(); show('setupBat'); });
  $('goBowl').addEventListener('click', () => { Audio.unlock(); Audio.ui(); show('setupBowl'); });
  $('goMatch').addEventListener('click', () => {
    Audio.unlock(); Audio.ui();
    syncSegs();                                 // ('default' reads differently once a finger has touched)
    show('setupMatch');
  });
  $('goContinue').addEventListener('click', () => {
    Audio.unlock(); Audio.ui();
    const m = Match.load();
    if (!m) { renderContinue(); return; }
    lastSetup = 'match';
    show(null);
    MatchFlow.begin(m);
    setTouchMode(game.mode);
  });
  $('startMatch').addEventListener('click', () => {
    Audio.unlock();
    show(null);
    document.body.classList.add('in-menu');
    CLLM.World.scene = 'ground';                   // the toss happens out in the middle
    game.ui.toss(null, (youBatFirst) => {
      const assist = resolveAssist(S.runAssist);
      const m = new Match({ format: S.mFormat, level: S.mLevel, hand: S.hand, controls: S.batControls, assist, youBatFirst });
      lastSetup = 'match';
      MatchFlow.begin(m);
      setTouchMode(game.mode);
    });
  });
  // the match switches between batting and bowling on its own
  const baseStartBat = game.startMatchBatting.bind(game), baseStartBowl = game.startMatchBowling.bind(game);
  game.startMatchBatting = (o) => { baseStartBat(o); setTouchMode('bat'); };
  game.startMatchBowling = (o) => { baseStartBowl(o); setTouchMode('bowl'); };
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { Audio.ui(); show('title'); }));

  function startBat() {
    lastSetup = 'bat';
    show(null);
    game.startBatting({ hand: S.hand, bowler: S.bowler, diff: S.diff, controls: S.batControls });
    setTouchMode('bat');
  }
  function startBowl() {
    lastSetup = 'bowl';
    show(null);
    game.startBowling({ type: S.bowlType, hand: S.batterHand, diff: S.batterDiff });
    setTouchMode('bowl');
  }
  $('startBat').addEventListener('click', () => { Audio.unlock(); startBat(); });
  $('startBowl').addEventListener('click', () => { Audio.unlock(); startBowl(); });

  // Pause
  game.onPause = () => {
    $('calib').value = S.calib || 0;
    $('calibVal').textContent = `${S.calib > 0 ? '+' : ''}${S.calib || 0} ms`;
    const physBat = game.mode === 'bat' && !!(game.session && game.session.physical);
    $('batTune').classList.toggle('hidden', !physBat);
    const LS = CFG.PHYS.LIMIT_STEPS, WS = CFG.PHYS.WEIGHT_STEPS;
    $('batLimit').value = Math.max(0, LS.indexOf(+S.batLimit || 0));
    $('batWeight').value = Math.max(0, WS.indexOf(+S.batWeight || 0));
    $('batPower').value = S.batPower || CFG.PHYS.BASE.power;
    showBatTune();
    $('camBtn').classList.toggle('hidden', game.mode !== 'bat' || !!(game.session && game.session.physical) || !!game.match);
    const m = game.match, inMatch = !!m;
    document.querySelectorAll('.match-only').forEach((b) => b.classList.toggle('hidden', !inMatch));
    $('declareConfirm').classList.add('hidden');
    if (inMatch) {
      // declaring and simulating happen at a dead ball: not with one in flight,
      // nor while an innings / the match is being handed over (its card is due or up)
      const s = game.session, b = s && s.b;
      const inFlight = !!(b && b.phase === 'flight');
      const handOff = !s || !!s.parked || !!s.pendingFlow || !!s.pendingOver || !!m.followOnPending || !$('matchPanel').classList.contains('hidden') ||
        !!(b && b.phase === 'done' && s.lastEv && (s.lastEv.inningsEnd || s.lastEv.matchEnd)) ||
        (s instanceof CLLM.MatchBatting) !== m.youBatting || (s.innN != null && s.innN !== m.innings.length);
      const busy = inFlight || handOff;
      $('declareBtn').classList.toggle('hidden', !(m.youBatting && m.F.budget && !m.result));
      $('declareBtn').disabled = busy;
      document.querySelectorAll('#pause [data-sim]').forEach((el) => { el.disabled = busy || !!m.result; });
      $('simNote').classList.toggle('hidden', !inFlight);
      syncPauseAssist();
    }
    $('restart').classList.toggle('hidden', inMatch);
    show('pause');
  };
  game.onResumeKey = () => resume();
  function resume() { show(null); game.resume(); }
  $('resume').addEventListener('click', resume);
  $('pauseBtn').addEventListener('click', (e) => { e.currentTarget.blur(); game.pause(); });
  $('muteBtn').addEventListener('click', (e) => { e.currentTarget.blur(); game.toggleMute(); });
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
  $('camBtn').addEventListener('click', () => { game.toggleCam(); });
  $('restart').addEventListener('click', () => { if (lastSetup === 'bowl') startBowl(); else startBat(); });

  // The scorecard (Tab, or the pause menu). From the pause menu, Back returns
  // there; from play (Tab), straight back to the game.
  game.openScorecard = () => {
    const m = game.match;
    if (!m || !game.mode || !game.ui.scorecard) return false;
    if (!$('matchPanel').classList.contains('hidden')) return false;     // a picker / break card is up
    const fromPause = game.paused;
    if (!fromPause) game.pause();
    $('pause').classList.add('hidden');
    game.ui.scorecard(m, () => { if (fromPause) show('pause'); else resume(); });
    return true;
  };
  $('scoreBtn').addEventListener('click', () => game.openScorecard());
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !game.match || !game.mode) return;
    e.preventDefault();
    if (e.repeat) return;
    // not while you're running: that ball has your full attention
    const s = game.session;
    if (!game.paused && s && s.live && s.fs && !s.fs.result) return;
    game.openScorecard();
  });

  // Declare: always asks first
  $('declareBtn').addEventListener('click', () => {
    const m = game.match;
    if (!m) return;
    $('declareQ').textContent = `Declare at ${m.inn.runs}/${m.inn.wkts}?`;
    $('declareBtn').classList.add('hidden');
    $('declareConfirm').classList.remove('hidden');
  });
  $('declareNo').addEventListener('click', () => { $('declareConfirm').classList.add('hidden'); $('declareBtn').classList.remove('hidden'); });
  $('declareYes').addEventListener('click', () => {
    $('declareConfirm').classList.add('hidden');
    if (!game.match) return;
    show(null); game.resume(); MatchFlow.declare();
  });
  // Simulate to: the end of the over / the next wicket / the session / the innings
  document.querySelectorAll('#pause [data-sim]').forEach((b) => b.addEventListener('click', () => {
    if (!game.match || b.disabled) return;
    show(null); game.resume(); MatchFlow.simTo(b.dataset.sim);
  }));
  // Running assist, mid-match (from the next ball)
  function syncPauseAssist() {
    const v = game.match && game.match.assist ? game.match.assist : resolveAssist(S.runAssist);
    document.querySelectorAll('#pauseAssist button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  }
  $('pauseAssist').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const v = b.dataset.v;
    S.runAssist = v;
    game.save.write();
    if (game.match) { game.match.assist = v; if (game.match.save) game.match.save(); }
    if (game.session && 'assist' in game.session) game.session.assist = v;
    Audio.ui();
    syncPauseAssist(); syncSegs();
  });
  $('toMenu').addEventListener('click', () => { if (game.ui.closePanel) game.ui.closePanel(); game.quitToMenu(); setTouchMode(null); show('title'); });
  // Physical bat tuning (applies live)
  function showBatTune() {
    $('batLimitVal').textContent = game.ui.tuneText('batLimit', +S.batLimit || 0, true);
    $('batWeightVal').textContent = game.ui.tuneText('batWeight', +S.batWeight || 0, true);
    $('batPowerVal').textContent = `×${(+(S.batPower || CFG.PHYS.BASE.power)).toFixed(2)}`;
  }
  $('batLimit').addEventListener('input', (e) => {
    S.batLimit = CFG.PHYS.LIMIT_STEPS[parseInt(e.target.value, 10) || 0] || 0;
    showBatTune(); game.save.write();
  });
  $('batWeight').addEventListener('input', (e) => {
    S.batWeight = CFG.PHYS.WEIGHT_STEPS[parseInt(e.target.value, 10) || 0] || 0;
    showBatTune(); game.save.write();
  });
  $('batPower').addEventListener('input', (e) => {
    S.batPower = parseFloat(e.target.value) || CFG.PHYS.BASE.power;
    showBatTune(); game.save.write();
  });
  $('calib').addEventListener('input', (e) => {
    S.calib = parseInt(e.target.value, 10) || 0;
    $('calibVal').textContent = `${S.calib > 0 ? '+' : ''}${S.calib} ms`;
    game.save.write();
  });

  // Touch buttons inject timed actions
  function setTouchMode(mode) {
    // (RUN / BACK aren't a mode's buttons: UI.runHud shows them while you can run)
    // the live session's controls (a saved match keeps its own; in the nets they're the setting)
    const phys = mode === 'bat' && !!(game.session && game.session.physical);
    document.querySelectorAll('#touch .tgroup[data-mode]').forEach((g) => {
      // physical bat: you swipe to hit, so only the FRONT/BACK/DANCE group stays
      const hideForPhys = phys && g.classList.contains('right');
      g.classList.toggle('hidden', g.dataset.mode !== mode || hideForPhys);
    });
    document.querySelectorAll('#touch .phys-only').forEach((b) => b.classList.toggle('hidden', !phys));
    document.querySelectorAll('#touch .classic-only').forEach((b) => b.classList.toggle('hidden', phys));
  }
  setTouchMode(null);
  document.querySelectorAll('#touch .tbtn').forEach((b) => {
    const act = b.dataset.act;
    const down = (e) => {
      Input.btnHeld[act] = true;
      b.classList.add('down');
      Input.queue.push({ type: 'touchbtn', key: act, stamp: e.timeStamp, phase: 'down' });
    };
    const up = (e) => {
      if (!Input.btnHeld[act] && !b.classList.contains('down')) return;
      Input.btnHeld[act] = false;
      b.classList.remove('down');
      Input.queue.push({ type: 'touchbtn', key: act, stamp: e.timeStamp, phase: 'up' });
    };
    b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); Audio.unlock(); down(e); }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); up(e); }, { passive: false });
    b.addEventListener('touchcancel', (e) => { up(e); });
    // Mouse fallback so the buttons work in desktop testing too
    b.addEventListener('mousedown', (e) => { e.preventDefault(); down(e); });
    b.addEventListener('mouseup', (e) => { e.preventDefault(); up(e); });
    b.addEventListener('mouseleave', (e) => { up(e); });
  });

  // Touch stance pad (physical bat): the left thumb drags up for a front-foot
  // stride, down to go back, and inward to turn the bat cross. Lifting keeps
  // your feet where they are and straightens the bat.
  (function stancePad() {
    const pad = $('stancePad'), knob = pad.querySelector('.spknob');
    let id = null, ox = 0, oy = 0, crossWas = false, fullWas = false;
    const buzz = (ms) => { if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* ignore */ } } };
    const set = (e, dx, dy) => {
      const P = Input.pad;
      P.active = true;
      P.feet = Math.max(-1, Math.min(1, -dy / 45));
      P.cross = dx > 25;
      knob.style.transform = `translate(${Math.max(-40, Math.min(40, dx))}px, ${Math.max(-55, Math.min(55, dy))}px)`;
      pad.classList.toggle('cross', P.cross);
      if (P.cross !== crossWas) { crossWas = P.cross; if (P.cross) buzz(8); Input.queue.push({ type: 'pad', stamp: e.timeStamp }); }
      const full = Math.abs(P.feet) >= 1;
      if (full && !fullWas) buzz(8);
      fullWas = full;
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (id !== null) return;
      Audio.unlock();
      id = e.pointerId; ox = e.clientX; oy = e.clientY;
      try { pad.setPointerCapture(id); } catch (err) { /* ignore */ }
      Input.pad.active = true;
      // start from where your feet already are
      const s = game.session;
      if (s && s.phys) oy += s.phys.feet * 45;
      set(e, 0, e.clientY - oy);
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e, e.clientX - ox, e.clientY - oy); });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      Input.pad.active = false; Input.pad.cross = false; crossWas = false;
      knob.style.transform = '';
      pad.classList.remove('cross');
      Input.queue.push({ type: 'pad', stamp: e.timeStamp });
    };
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);
    // while the pad isn't held, the knob shows where your feet actually are
    const idle = () => {
      if (id === null && !pad.classList.contains('hidden')) {
        const s = game.session, f = s && s.phys ? s.phys.feet : 0;
        const t = Math.abs(f) > 0.01 ? `translate(0px, ${(-f * 45).toFixed(1)}px)` : '';
        if (knob.style.transform !== t) knob.style.transform = t;
      }
      requestAnimationFrame(idle);
    };
    requestAnimationFrame(idle);
  })();

  show('title');
})();
