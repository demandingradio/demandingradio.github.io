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

  let lastSetup = null;                         // 'bat' | 'bowl'

  function show(id) {
    for (const s of ['title', 'setupBat', 'setupBowl', 'pause']) $(s).classList.toggle('hidden', s !== id);
    $('back').classList.toggle('hidden', id == null);
    document.body.classList.toggle('in-menu', !!id);
    if (id === 'title') renderBests();
  }

  function renderBests() {
    const top = game.save.topBat();
    const st = game.save.data.stats;
    const parts = [];
    if (top) {
      const [diff, bowler, hand] = top.key.split('.');
      parts.push(`Best innings <b>${top.runs}</b> (${top.balls}b · ${CFG.DIFFS[diff] ? CFG.DIFFS[diff].name : diff} · ${bowler === 'mixed' ? 'mixed' : CLLM.Deliveries.TYPES[bowler] ? CLLM.Deliveries.TYPES[bowler].name.toLowerCase() : bowler})`);
    }
    if (st.batBalls) parts.push(`Balls faced <b>${st.batBalls}</b> · runs <b>${st.batRuns}</b> · 4s <b>${st.fours}</b> · 6s <b>${st.sixes}</b>`);
    if (st.bowlBalls) parts.push(`Balls bowled <b>${st.bowlBalls}</b> · wickets <b>${st.bowlWkts}</b>${st.topSpeed ? ` · top speed <b>${Math.round(st.topSpeed)}</b> km/h` : ''}`);
    $('titleBests').innerHTML = parts.map((p) => `<span>${p}</span>`).join('');
  }

  // Segmented option buttons bound to settings
  document.querySelectorAll('.seg').forEach((seg) => {
    const key = seg.dataset.key;
    const sync = () => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === S[key]));
      if (key === 'diff') $('diffBlurb').textContent = CFG.DIFFS[S.diff].blurb;
    };
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      S[key] = b.dataset.v;
      game.save.write();
      Audio.unlock(); Audio.ui();
      sync();
    });
    sync();
  });

  $('goBat').addEventListener('click', () => { Audio.unlock(); Audio.ui(); show('setupBat'); });
  $('goBowl').addEventListener('click', () => { Audio.unlock(); Audio.ui(); show('setupBowl'); });
  document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { Audio.ui(); show('title'); }));

  function startBat() {
    lastSetup = 'bat';
    show(null);
    game.startBatting({ hand: S.hand, bowler: S.bowler, diff: S.diff });
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
    $('camBtn').classList.toggle('hidden', game.mode !== 'bat');
    show('pause');
  };
  game.onResumeKey = () => resume();
  function resume() { show(null); game.resume(); }
  $('resume').addEventListener('click', resume);
  $('pauseBtn').addEventListener('click', () => game.pause());
  $('muteBtn').addEventListener('click', () => game.toggleMute());
  $('muteBtn').textContent = S.muted ? '🔇' : '🔊';
  $('camBtn').addEventListener('click', () => { game.toggleCam(); });
  $('restart').addEventListener('click', () => { if (lastSetup === 'bowl') startBowl(); else startBat(); });
  $('toMenu').addEventListener('click', () => { game.quitToMenu(); setTouchMode(null); show('title'); });
  $('calib').addEventListener('input', (e) => {
    S.calib = parseInt(e.target.value, 10) || 0;
    $('calibVal').textContent = `${S.calib > 0 ? '+' : ''}${S.calib} ms`;
    game.save.write();
  });

  // Touch buttons inject timed actions
  function setTouchMode(mode) {
    document.querySelectorAll('#touch .tgroup').forEach((g) => g.classList.toggle('hidden', g.dataset.mode !== mode));
  }
  setTouchMode(null);
  document.querySelectorAll('#touch .tbtn').forEach((b) => {
    const act = b.dataset.act;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      Audio.unlock();
      b.classList.add('down');
      Input.queue.push({ type: 'touchbtn', key: act, stamp: e.timeStamp, phase: 'down' });
    }, { passive: false });
    b.addEventListener('touchend', (e) => {
      e.preventDefault(); e.stopPropagation();
      b.classList.remove('down');
      Input.queue.push({ type: 'touchbtn', key: act, stamp: e.timeStamp, phase: 'up' });
    }, { passive: false });
    // Mouse fallback so the buttons work in desktop testing too
    b.addEventListener('mousedown', (e) => { e.preventDefault(); Input.queue.push({ type: 'touchbtn', key: act, stamp: e.timeStamp, phase: 'down' }); });
    b.addEventListener('mouseup', (e) => { e.preventDefault(); Input.queue.push({ type: 'touchbtn', key: act, stamp: e.timeStamp, phase: 'up' }); });
  });

  show('title');
})();
