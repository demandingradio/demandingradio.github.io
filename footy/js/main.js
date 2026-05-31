/*
 * MAIN
 * ====
 * Wires the DOM (menus, buttons) to the Game.
 */
(function () {
  const canvas   = document.getElementById('game-canvas');
  const hud      = document.getElementById('hud');
  const banner   = document.getElementById('banner');
  const menu     = document.getElementById('menu');
  const pause    = document.getElementById('pause');
  const pauseFp  = document.getElementById('pause-freeplay');
  const scoreA   = document.getElementById('score-a');
  const scoreB   = document.getElementById('score-b');
  const clockEl  = document.getElementById('clock');

  const game = new FOOTY.Game({
    canvas, hud, banner, scoreA, scoreB, clockEl,
  });

  // Mouse drives kick/handball/aim — attach once to the canvas.
  FOOTY.Mouse.attach(canvas);
  FOOTY.Mouse.setEnabled(false);   // off until a match starts

  // Expose for debugging in the console.
  window.__footy = game;

  // ---- Shared resume helper ----
  function resumeGame() {
    pause.classList.add('hidden');
    pauseFp.classList.add('hidden');
    FOOTY.Input.clear();
    FOOTY.Input.setEnabled(true);
    FOOTY.Mouse.setEnabled(true);
    game.resume();
  }

  // ---- Control-mode buttons (freeplay pause only) ----
  const btnCtrlA = document.getElementById('btn-ctrl-a');
  const btnCtrlB = document.getElementById('btn-ctrl-b');

  function updateCtrlButtons() {
    btnCtrlA.classList.toggle('active', game.controlMode === 'A');
    btnCtrlB.classList.toggle('active', game.controlMode === 'B');
  }

  btnCtrlA.addEventListener('click', () => { game.controlMode = 'A'; updateCtrlButtons(); });
  btnCtrlB.addEventListener('click', () => { game.controlMode = 'B'; updateCtrlButtons(); });

  // ---- Game callbacks ----
  game.onPause = () => {
    if (game.mode === 'freeplay') {
      updateCtrlButtons();
      pauseFp.classList.remove('hidden');
    } else {
      pause.classList.remove('hidden');
    }
    FOOTY.Input.setEnabled(false);
    FOOTY.Mouse.setEnabled(false);
  };

  game.onMatchEnd = () => {
    setTimeout(() => {
      menu.classList.remove('hidden');
      hud.classList.add('hidden');
    }, 3200);
  };

  // ---- Main menu ----
  function startGame(mode) {
    menu.classList.add('hidden');
    hud.classList.remove('hidden');
    FOOTY.Input.clear();
    FOOTY.Input.setEnabled(true);
    FOOTY.Mouse.setEnabled(true);
    game.startMatch({ mode });
  }

  document.getElementById('btn-play').addEventListener('click', () => startGame('normal'));
  document.getElementById('btn-freeplay').addEventListener('click', () => startGame('freeplay'));
  document.getElementById('btn-quit').addEventListener('click', () => {
    window.location.href = '../index.html';
  });

  // ---- Normal pause menu ----
  document.getElementById('btn-resume').addEventListener('click', resumeGame);
  document.getElementById('btn-to-menu').addEventListener('click', () => {
    pause.classList.add('hidden');
    hud.classList.add('hidden');
    menu.classList.remove('hidden');
    game.state = 'idle';
    FOOTY.Input.setEnabled(false);
    FOOTY.Mouse.setEnabled(false);
  });

  // ---- Freeplay pause menu ----
  document.getElementById('btn-resume-fp').addEventListener('click', resumeGame);
  document.getElementById('btn-to-menu-fp').addEventListener('click', () => {
    pauseFp.classList.add('hidden');
    hud.classList.add('hidden');
    menu.classList.remove('hidden');
    game.state = 'idle';
    FOOTY.Input.setEnabled(false);
    FOOTY.Mouse.setEnabled(false);
  });

  // Esc on either pause overlay resumes.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (!pause.classList.contains('hidden') || !pauseFp.classList.contains('hidden')) {
        resumeGame();
      }
    }
  });
})();
