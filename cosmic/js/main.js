/*
 * MAIN — bootstrap: canvas + DPR, the requestAnimationFrame loop, input wiring,
 * audio unlock on first gesture, and save-on-exit. Exposes window.__cosmic.
 */
(function () {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const musicEl = document.getElementById('bg-music');
  let dpr = 1, cssW = 0, cssH = 0;

  function sizeCanvas() {
    // Fall back to a sane default if the viewport reports 0 (some headless/embedded contexts).
    cssW = window.innerWidth || document.documentElement.clientWidth || 1280;
    cssH = window.innerHeight || document.documentElement.clientHeight || 720;
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
  }

  ASCENT.Gfx.init(ctx);
  ASCENT.Audio.init(musicEl);
  sizeCanvas();
  ASCENT.Game.init(cssW, cssH, canvas);

  window.addEventListener('resize', () => {
    sizeCanvas();
    ASCENT.Game.resize(cssW, cssH);
  });

  // Input → game.
  ASCENT.Input.attach(canvas);
  ASCENT.Input.onKeyPressed = (n) => ASCENT.Game.keypressed(n);
  ASCENT.Input.onMousePressed = (b) => ASCENT.Game.mousepressed(b);
  ASCENT.Input.onMouseMoved = (x, y) => ASCENT.Game.mousemoved(x, y);
  ASCENT.Input.onGamepadPressed = (n) => ASCENT.Game.gamepadpressed(n);

  // Browsers need a user gesture before audio can start.
  const unlock = () => ASCENT.Audio.unlock();
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('mousedown', unlock, { once: true });

  // Persist on the way out.
  window.addEventListener('beforeunload', () => {
    ASCENT.Save.saveStats();
    ASCENT.Save.saveOptions();
    ASCENT.Save.saveBestTimes();
    ASCENT.Save.saveAchievements();
  });

  // Main loop.
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;        // clamp big gaps (tab switch) to avoid tunnelling
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ASCENT.Game.update(dt);
    ASCENT.Game.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.__cosmic = ASCENT.Game;   // for console debugging
})();
