/*
 * INPUT
 * =====
 * Tracks keyboard state by KeyboardEvent.code (layout-independent: 'KeyW',
 * 'ArrowUp', 'Slash', etc.). Distinguishes "held", "just-pressed this frame",
 * and "just-released this frame" — the latter two get cleared after each
 * game tick via Input.endFrame().
 */
window.FOOTY = window.FOOTY || {};

FOOTY.Input = (function () {
  const down     = new Set();   // currently held
  const pressed  = new Set();   // pressed this frame
  const released = new Set();   // released this frame
  let   enabled  = true;        // toggled off during menus so keys don't leak

  // Codes we always preventDefault on (so arrows/space don't scroll the page).
  const PREVENT = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Space', 'Slash', 'Period',
  ]);

  window.addEventListener('keydown', (e) => {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!enabled) return;
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  });

  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
    if (!enabled) return;
    released.add(e.code);
  });

  // Drop held keys if the window loses focus, so movement doesn't stick.
  window.addEventListener('blur', () => {
    down.clear();
    pressed.clear();
    released.clear();
  });

  return {
    isDown:      (code) => enabled && down.has(code),
    wasPressed:  (code) => enabled && pressed.has(code),
    wasReleased: (code) => enabled && released.has(code),
    endFrame:    () => { pressed.clear(); released.clear(); },
    setEnabled:  (v) => { enabled = !!v; if (!enabled) down.clear(); },
    clear:       () => { down.clear(); pressed.clear(); released.clear(); },
  };
})();
