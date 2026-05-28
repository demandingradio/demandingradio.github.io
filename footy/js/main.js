/*
 * MAIN
 * ====
 * Wires the DOM (menus, buttons) to the Game.
 */
(function () {
  const canvas  = document.getElementById('game-canvas');
  const hud     = document.getElementById('hud');
  const banner  = document.getElementById('banner');
  const menu    = document.getElementById('menu');
  const pause   = document.getElementById('pause');
  const scoreA  = document.getElementById('score-a');
  const scoreB  = document.getElementById('score-b');
  const clockEl = document.getElementById('clock');

  const game = new FOOTY.Game({
    canvas, hud, banner, scoreA, scoreB, clockEl,
  });

  // Mouse drives kick/handball/aim — attach once to the canvas.
  FOOTY.Mouse.attach(canvas);
  FOOTY.Mouse.setEnabled(false);   // off until a match starts

  // Expose for debugging in the console.
  window.__footy = game;

  // Game tells us when to pop the pause menu.
  game.onPause = () => {
    pause.classList.remove('hidden');
    FOOTY.Input.setEnabled(false);
    FOOTY.Mouse.setEnabled(false);
  };
  game.onMatchEnd = () => {
    // Show main menu again after the end banner clears.
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
    // Quit returns to the Monday Jeffrey desktop.
    window.location.href = '../index.html';
  });

  // ---- Pause menu ----
  document.getElementById('btn-resume').addEventListener('click', () => {
    pause.classList.add('hidden');
    FOOTY.Input.clear();
    FOOTY.Input.setEnabled(true);
    FOOTY.Mouse.setEnabled(true);
    game.resume();
  });

  document.getElementById('btn-to-menu').addEventListener('click', () => {
    pause.classList.add('hidden');
    hud.classList.add('hidden');
    menu.classList.remove('hidden');
    game.state = 'idle';
    FOOTY.Input.setEnabled(false);
    FOOTY.Mouse.setEnabled(false);
  });

  // Esc on the pause overlay also resumes.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !pause.classList.contains('hidden')) {
      document.getElementById('btn-resume').click();
    }
  });
})();
