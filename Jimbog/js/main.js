// Jimbog — boot, menus, settings, online lobby, pointer lock, touch, main loop.
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;
  const $ = (id) => document.getElementById(id);

  const isTouch = ('ontouchstart' in window) && matchMedia('(pointer: coarse)').matches;
  const DEFAULTS = {
    name: 'Jimbog', fur: 'tuxedo', difficulty: 'normal', frags: 15, time: 10, loadout: 'pickups',
    quality: isTouch ? 'low' : 'medium', sens: 1.0, fov: 72, volume: 0.8, invert: false, bots: 3
  };
  const settings = Object.assign({}, DEFAULTS, U.load('jimbog.settings', {}));
  settings.bots = 3;
  const save = () => U.save('jimbog.settings', settings);

  let game = null, hud = null, last = 0, booted = false;
  const syncers = [];         // refresh the menu + pause sliders from settings
  const syncSettings = () => syncers.forEach((f) => f());
  let online = null;          // JB.Online while hosting / joined
  const joinId = JB.Net && JB.Net.parseJoin ? JB.Net.parseJoin() : null;

  function setLoading(text) { $('loadtext').textContent = text; }
  const click = () => JB.Audio && JB.Audio.play('ui_click');
  function initAudio() { if (JB.Audio) { JB.Audio.init(); JB.Audio.setMasterVolume(settings.volume); } }
  function notice(title, text) { $('noticetitle').textContent = title; $('noticetext').textContent = text; $('notice').hidden = false; }

  // ---------------------------------------------------------------- menu UI
  function buildMenu() {
    $('pname').value = settings.name;
    $('pname').addEventListener('input', () => { settings.name = $('pname').value.trim() || 'Jimbog'; save(); });
    const furs = $('furs');
    for (const k of Object.keys(JB.Cat.FURS)) {
      const F = JB.Cat.FURS[k];
      const b = document.createElement('button');
      b.className = 'fur' + (settings.fur === k ? ' sel' : '');
      b.type = 'button';
      const base = '#' + new THREE.Color(F.base === 0xffffff ? 0xf3ece2 : F.base).getHexString();
      const light = '#' + new THREE.Color(F.light).getHexString();
      const extra = k === 'calico' ? 'radial-gradient(circle at 30% 35%, #e0862e 0 22%, transparent 23%), radial-gradient(circle at 70% 65%, #222 0 20%, transparent 21%),' : '';
      b.innerHTML = '<span class="sw" style="background:' + extra + 'linear-gradient(160deg,' + base + ' 0 58%,' + light + ' 59%)"><i style="background:#' + new THREE.Color(F.eye).getHexString() + '"></i><i style="background:#' + new THREE.Color(F.eye).getHexString() + '"></i></span><span>' + F.label + '</span>';
      b.addEventListener('click', () => {
        settings.fur = k; save();
        furs.querySelectorAll('.fur').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        click();
      });
      furs.appendChild(b);
    }
    const seg = (id, key, conv) => {
      const el = $(id);
      el.querySelectorAll('button').forEach((b) => {
        if (String(settings[key]) === b.dataset.v) b.classList.add('sel');
        b.addEventListener('click', () => {
          const v = conv ? conv(b.dataset.v) : b.dataset.v;
          const changedQuality = key === 'quality' && v !== settings.quality;
          settings[key] = v; save();
          el.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
          b.classList.add('sel');
          click();
          if (changedQuality) $('qnote').hidden = false;
        });
      });
    };
    seg('diff', 'difficulty'); seg('frags', 'frags', Number); seg('tlimit', 'time', Number);
    seg('loadout', 'loadout'); seg('quality', 'quality');
    const slider = (id, key, fmt, after) => {
      const el = $(id), out = $(id + 'v');
      el.value = settings[key];
      const show = () => { out.textContent = fmt(+el.value); };
      show();
      syncers.push(() => { el.value = settings[key]; show(); });
      el.addEventListener('input', () => { settings[key] = +el.value; save(); show(); if (after) after(); });
    };
    for (const pre of ['', 'p']) {
      if (!$(pre + 'sens')) continue;
      slider(pre + 'sens', 'sens', (v) => v.toFixed(2) + '×');
      slider(pre + 'fov', 'fov', (v) => Math.round(v) + '°');
      slider(pre + 'vol', 'volume', (v) => Math.round(v * 100) + '%', () => JB.Audio && JB.Audio.setMasterVolume(settings.volume));
      const inv = $(pre + 'invert');
      inv.checked = !!settings.invert;
      syncers.push(() => { inv.checked = !!settings.invert; });
      inv.addEventListener('change', () => { settings.invert = inv.checked; save(); });
    }
    $('deploy').addEventListener('click', deploy);
    $('online').addEventListener('click', () => { click(); openOnline(); });
    $('qreload').addEventListener('click', () => location.reload());
    $('resume').addEventListener('click', resume);
    $('restart').addEventListener('click', () => { hidePause(); if (!online) startBots(); });
    $('tomenu').addEventListener('click', toMenu);
    $('rematch').addEventListener('click', () => {
      $('end').hidden = true;
      if (online && online.isHost) { online.startMatch(); lock(); }
      else if (!online) startBots();
    });
    $('endmenu').addEventListener('click', () => { $('end').hidden = true; toMenu(); });
    $('noticeok').addEventListener('click', () => { $('notice').hidden = true; });
    // online box
    $('onhost').addEventListener('click', hostGame);
    $('onjoin').addEventListener('click', joinGame);
    $('onstart').addEventListener('click', () => { click(); if (online) { online.startMatch(); } });
    $('onleave').addEventListener('click', () => { click(); leaveOnline(); $('onlinebox').hidden = true; });
    $('oncopy').addEventListener('click', () => {
      const inp = $('onlinkurl');
      inp.select();
      const done = () => { $('oncopy').textContent = 'Copied!'; setTimeout(() => { $('oncopy').textContent = 'Copy link'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(done, () => { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    });
    if (isTouch) document.body.classList.add('touch');
  }

  // ---------------------------------------------------------------- bots mode
  function deploy() {
    if (!booted) return;
    initAudio(); click();
    $('menu').hidden = true;
    startBots();
  }
  function startBots() {
    if (online) leaveOnline();
    game.startMatch();
    lock();
  }

  // ---------------------------------------------------------------- online
  function onlineUI() {
    return {
      onStatus: (t) => { $('onstatus').textContent = t; },
      onLobby: (o) => renderLobby(o),
      onStart: () => {
        $('onlinebox').hidden = true; $('menu').hidden = true; $('end').hidden = true; $('pause').hidden = true;
        game.paused = false;
        if (isTouch) { game.touchMode = true; $('touch').hidden = false; }
        else if (!document.pointerLockElement) showPause(true);
      },
      onLeave: (reason) => {
        const wasPlaying = game.state !== 'menu';
        online = null; game.net = null;
        if (wasPlaying) toMenu(true);
        $('onlinebox').hidden = true;
        notice('DISCONNECTED', reason);
      }
    };
  }
  function openOnline() {
    if (!booted) return;
    $('onlinebox').hidden = false;
    $('onlink').hidden = true; $('onplayers').innerHTML = ''; $('onstart').hidden = true;
    const available = JB.Net && JB.Net.available && JB.Net.available();
    if (!available) { $('onstatus').textContent = 'Online play could not load in this browser.'; $('onhost').hidden = true; $('onjoin').hidden = true; return; }
    if (joinId && !online) {
      $('onsub').textContent = 'You were invited to a game. Pick your name and cat in the menu, then join.';
      $('onjoin').hidden = false; $('onhost').hidden = true;
      $('onstatus').textContent = 'Game code: ' + joinId;
    } else if (!online) {
      $('onsub').textContent = 'Play against your friends — no bots. Host a game and send them the link.';
      $('onhost').hidden = false; $('onjoin').hidden = true;
      $('onstatus').textContent = '';
    } else renderLobby(online);
  }
  function me() { return { name: (settings.name || 'Jimbog').slice(0, 16), fur: settings.fur }; }
  async function hostGame() {
    click(); initAudio();
    $('onhost').hidden = true;
    $('onstatus').textContent = 'Creating your game…';
    online = new JB.Online(game, onlineUI());
    try {
      const res = await online.host(me());
      $('onlinkurl').value = res.link;
      $('onlink').hidden = false;
      $('onstatus').textContent = 'Send this link to your friends. Start when everyone is in.';
      $('onstart').hidden = false;
      renderLobby(online);
    } catch (e) {
      $('onstatus').textContent = (e && e.message) || 'Could not create the game.';
      $('onhost').hidden = false;
      leaveOnline();
    }
  }
  async function joinGame() {
    click(); initAudio();
    $('onjoin').hidden = true;
    $('onstatus').textContent = 'Connecting to the host…';
    online = new JB.Online(game, onlineUI());
    try {
      await online.join(joinId, me());
    } catch (e) {
      $('onstatus').textContent = (e && e.message) || 'Could not join that game.';
      $('onjoin').hidden = false;
      leaveOnline();
    }
  }
  function renderLobby(o) {
    if (!o) return;
    const host = o.roster[0];
    $('onplayers').innerHTML = o.roster.map((r) => {
      const c = JB.Game.NET_COLORS[(r.c || 0) % JB.Game.NET_COLORS.length];
      const F = JB.Cat.FURS[r.fur] || JB.Cat.FURS.ginger;
      return '<div class="pl"><i style="background:' + c.color + '"></i>' + String(r.name).replace(/[<&]/g, '') + (r.id === o.myId ? ' (you)' : '') + '<small>' + F.label + (host && r.id === host.id ? ' · host' : '') + '</small></div>';
    }).join('');
    if (o.isHost) $('onstart').textContent = o.roster.length > 1 ? 'START MATCH (' + o.roster.length + ' cats)' : 'START MATCH (just you)';
    else if (!o.started) $('onstatus').textContent = 'Connected — waiting for the host to start…';
  }
  function leaveOnline() {
    if (online) { online.leave(); online = null; }
    if (game) game.net = null;
  }

  // ---------------------------------------------------------------- flow
  function lock() {
    if (isTouch) { game.touchMode = true; $('touch').hidden = false; return; }
    try {
      const r = game.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => showPause());
    } catch (e) { showPause(); }
  }
  // starting=true: a match just began without a click (online) — ask for one
  function showPause(starting) {
    if (!game || game.state === 'menu' || game.state === 'end' || !$('end').hidden) return;
    game.paused = true;
    syncSettings();
    hud.scoreboard(false);
    if (isTouch) $('touch').hidden = true;
    $('pause').hidden = false;
    $('resume').textContent = starting ? 'PLAY' : 'RESUME';
    $('restart').hidden = !!online;
    $('tomenu').textContent = online ? 'Leave game' : 'Quit to menu';
    game.mouse.fire = false; game.mouse.alt = false;
    for (const k in game.keys) game.keys[k] = false;
  }
  function hidePause() { $('pause').hidden = true; game.paused = false; }
  function resume() { click(); initAudio(); hidePause(); lock(); }
  function toMenu(keepNotice) {
    if (!keepNotice) click();
    leaveOnline();
    hidePause();
    if (document.pointerLockElement) document.exitPointerLock();
    game.state = 'menu';
    game.paused = false;
    hud.show(false);
    $('touch').hidden = true;
    game.clearMatch();
    if (game.vm) game.vm.root.visible = false;
    if (JB.Audio) JB.Audio.stopAmbience();
    syncSettings();
    $('menu').hidden = false;
  }
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && game && (game.state === 'play' || game.state === 'countdown')) showPause();
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && game && isTouch && (game.state === 'play' || game.state === 'countdown')) showPause();
  });

  function onEnd(res) {
    if (document.pointerLockElement) document.exitPointerLock();
    $('touch').hidden = true;
    const w = res.winner;
    $('endtitle').textContent = res.playerWon ? 'PURR-FECT VICTORY!' : (w ? w.name.toUpperCase() + ' WINS' : 'MATCH OVER');
    $('endsub').textContent = res.playerWon ? 'Top cat of the Facility.' : 'Better luck next life — you have eight left.';
    $('endrows').innerHTML = res.rows.map((f, i) => '<tr class="' + (f.isPlayer ? 'me' : '') + '"><td>' + (i + 1) + '</td><td><i style="background:' + f.color + '"></i>' + f.name.replace(/</g, '&lt;') + '</td><td>' + f.kills + '</td><td>' + f.deaths + '</td><td>' + f.bestStreak + '</td></tr>').join('');
    const client = res.online && !res.host;
    $('rematch').hidden = client;
    $('endwait').hidden = !client;
    $('endmenu').textContent = res.online ? 'Leave' : 'Menu';
    $('end').hidden = false;
    hud.scoreboard(false);
  }

  // ---------------------------------------------------------------- touch
  function setupTouch() {
    const t = { f: 0, s: 0, fire: false, alt: false, jump: false, crouch: false, reload: false, cycle: false };
    game.touch = t;
    const stick = $('stick'), knob = $('knob');
    let stickId = null, sx = 0, sy = 0, lookId = null, lx = 0, ly = 0;
    const zone = $('touch');
    zone.addEventListener('touchstart', (e) => {
      for (const tc of e.changedTouches) {
        const b = tc.target.closest && tc.target.closest('[data-b]');
        if (b) { press(b.dataset.b, true); b.classList.add('on'); continue; }
        if (tc.clientX < innerWidth * 0.4 && stickId === null) {
          stickId = tc.identifier; sx = tc.clientX; sy = tc.clientY;
          stick.style.left = (sx - 60) + 'px'; stick.style.top = (sy - 60) + 'px'; stick.classList.add('on');
        } else if (lookId === null) { lookId = tc.identifier; lx = tc.clientX; ly = tc.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === stickId) {
          let dx = tc.clientX - sx, dy = tc.clientY - sy;
          const L = Math.hypot(dx, dy), m = 50;
          if (L > m) { dx *= m / L; dy *= m / L; }
          knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
          t.s = dx / m; t.f = -dy / m;
        } else if (tc.identifier === lookId) {
          game.look.x += (tc.clientX - lx) * 2.2; game.look.y += (tc.clientY - ly) * 2.2;
          lx = tc.clientX; ly = tc.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const tc of e.changedTouches) {
        if (tc.identifier === stickId) { stickId = null; t.f = 0; t.s = 0; knob.style.transform = ''; stick.classList.remove('on'); }
        else if (tc.identifier === lookId) lookId = null;
        const b = tc.target.closest && tc.target.closest('[data-b]');
        if (b) { press(b.dataset.b, false); b.classList.remove('on'); }
      }
    };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    function press(name, on) {
      if (name === 'fire') t.fire = on;
      else if (name === 'ads') t.alt = on;
      else if (name === 'jump') t.jump = on;
      else if (name === 'crouch') { if (on) t.crouch = !t.crouch; }
      else if (name === 'reload') { if (on) t.reload = true; }
      else if (name === 'swap') { if (on) t.cycle = true; }
      else if (name === 'pause' && on) showPause();
    }
  }

  // ---------------------------------------------------------------- boot
  let lastTick = 0, lastBg = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = last ? (t - last) / 1000 : 0.016;
    last = t;
    lastTick = performance.now();
    if (game && booted) game.frame(dt);
  }
  // Browsers pause animation frames in background tabs. Online, that would
  // freeze the match for everyone (the host runs it), so a worker timer keeps
  // the game ticking without drawing while this tab is hidden.
  function backgroundTicker() {
    if (!window.Worker || !window.Blob) return;
    try {
      const src = 'setInterval(function () { postMessage(0); }, 50);';
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = () => {
        if (!online || !game || !booted || game.state === 'menu') return;
        const now = performance.now();
        if (now - lastTick < 250) { lastBg = now; return; }   // animation frames are still running
        const dt = Math.min(0.05, (now - lastBg) / 1000);
        lastBg = now;
        game.headless = true;
        try { game.frame(dt); } finally { game.headless = false; }
      };
    } catch (e) { /* no workers: the match pauses while hidden */ }
  }

  function boot() {
    buildMenu();
    if (!window.WebGLRenderingContext) { $('loadtext').textContent = 'Jimbog needs WebGL, which this browser could not start.'; return; }
    setTimeout(() => {
      try {
        hud = new JB.HUD();
        game = new JB.Game($('game'), settings, hud);
        game.build(setLoading);
        game.onEnd = onEnd;
        game.bindInput();
        setupTouch();
        hud.show(false);
        booted = true;
        $('loading').classList.add('done');
        $('deploy').disabled = false;
        $('online').disabled = false;
        if (joinId) openOnline();
        requestAnimationFrame(loop);
        backgroundTicker();
      } catch (e) {
        console.error(e);
        $('loadtext').textContent = 'Something went wrong starting the game: ' + e.message;
      }
    }, 60);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  JB.main = { settings, get game() { return game; }, get online() { return online; } };
})();
