// Jimbog — boot, menus, settings, pointer lock, touch controls, main loop.
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

  function setLoading(text) { $('loadtext').textContent = text; }

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
          if (changedQuality) { $('qnote').hidden = false; }
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
      el.addEventListener('input', () => { settings[key] = +el.value; save(); show(); if (after) after(); });
    };
    for (const pre of ['', 'p']) {
      if (!$(pre + 'sens')) continue;
      slider(pre + 'sens', 'sens', (v) => v.toFixed(2) + '×');
      slider(pre + 'fov', 'fov', (v) => Math.round(v) + '°');
      slider(pre + 'vol', 'volume', (v) => Math.round(v * 100) + '%', () => JB.Audio && JB.Audio.setMasterVolume(settings.volume));
      const inv = $(pre + 'invert');
      inv.checked = !!settings.invert;
      inv.addEventListener('change', () => { settings.invert = inv.checked; save(); });
    }
    $('deploy').addEventListener('click', deploy);
    $('qreload').addEventListener('click', () => location.reload());
    $('resume').addEventListener('click', resume);
    $('restart').addEventListener('click', () => { hidePause(); startMatch(); });
    $('tomenu').addEventListener('click', toMenu);
    $('rematch').addEventListener('click', () => { $('end').hidden = true; startMatch(); });
    $('endmenu').addEventListener('click', () => { $('end').hidden = true; toMenu(); });
    if (isTouch) document.body.classList.add('touch');
  }
  const click = () => JB.Audio && JB.Audio.play('ui_click');

  // ---------------------------------------------------------------- flow
  function deploy() {
    if (!booted) return;
    if (JB.Audio) { JB.Audio.init(); JB.Audio.setMasterVolume(settings.volume); }
    click();
    $('menu').hidden = true;
    startMatch();
  }
  function startMatch() {
    game.startMatch();
    lock();
  }
  function lock() {
    if (isTouch) { game.touchMode = true; $('touch').hidden = false; return; }
    try {
      const r = game.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => showPause());
    } catch (e) { showPause(); }
  }
  function showPause() {
    if (!game || game.state === 'menu' || game.state === 'end' || !$('end').hidden) return;
    game.paused = true;
    $('pause').hidden = false;
    game.mouse.fire = false; game.mouse.ads = false;
    for (const k in game.keys) game.keys[k] = false;
  }
  function hidePause() { $('pause').hidden = true; game.paused = false; }
  function resume() { click(); hidePause(); lock(); }
  function toMenu() {
    click();
    hidePause();
    if (document.pointerLockElement) document.exitPointerLock();
    game.state = 'menu';
    game.paused = false;
    hud.show(false);
    $('touch').hidden = true;
    for (const f of game.fighters) f.cat.root.visible = false;
    if (game.vm) game.vm.root.visible = false;
    if (JB.Audio) JB.Audio.stopAmbience();
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
    $('endtitle').textContent = res.playerWon ? 'PURR-FECT VICTORY!' : w.name.toUpperCase() + ' WINS';
    $('endsub').textContent = res.playerWon ? 'Top cat of the Facility.' : 'Better luck next life — you have eight left.';
    $('endrows').innerHTML = res.rows.map((f, i) => '<tr class="' + (f.isPlayer ? 'me' : '') + '"><td>' + (i + 1) + '</td><td><i style="background:' + f.color + '"></i>' + f.name.replace(/</g, '&lt;') + '</td><td>' + f.kills + '</td><td>' + f.deaths + '</td><td>' + f.bestStreak + '</td></tr>').join('');
    $('end').hidden = false;
    hud.scoreboard(false);
  }

  // ---------------------------------------------------------------- touch
  function setupTouch() {
    const t = { f: 0, s: 0, fire: false, ads: false, jump: false, crouch: false, reload: false, cycle: false };
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
      else if (name === 'ads') { if (on) t.ads = !t.ads; }
      else if (name === 'jump') t.jump = on;
      else if (name === 'crouch') { if (on) t.crouch = !t.crouch; }
      else if (name === 'reload') { if (on) t.reload = true; }
      else if (name === 'swap') { if (on) t.cycle = true; }
      else if (name === 'pause' && on) showPause();
    }
  }

  // ---------------------------------------------------------------- boot
  function loop(t) {
    requestAnimationFrame(loop);
    const dt = last ? (t - last) / 1000 : 0.016;
    last = t;
    if (game && booted) game.frame(dt);
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
        requestAnimationFrame(loop);
      } catch (e) {
        console.error(e);
        $('loadtext').textContent = 'Something went wrong starting the game: ' + e.message;
      }
    }, 60);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  JB.main = { settings, get game() { return game; } };
})();
