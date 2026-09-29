/*
 * INPUT — keyboard (held + discrete), mouse, and gamepad.
 * ======================================================
 * Mirrors the bits of love.keyboard / love.mouse / love.joystick the game uses.
 * Discrete events (jump, shoot, menu nav) are delivered through hooks that
 * game.js installs; held state (movement, reel, boost) is polled via isDown().
 */
window.ASCENT = window.ASCENT || {};

ASCENT.Input = {
  down: new Set(),          // currently-held LÖVE-style key names
  mouseX: 0,
  mouseY: 0,

  // Hooks installed by the game/state machine:
  onKeyPressed: null,       // fn(name)
  onMousePressed: null,     // fn(button)  (1 = left)
  onMouseMoved: null,       // fn(x, y)
  onGamepadPressed: null,   // fn(name)

  // Gamepad state
  gamepad: null,
  _gpPrev: {},

  isDown(name) { return this.down.has(name); },

  attach(canvas) {
    const self = this;

    window.addEventListener('keydown', (e) => {
      const name = self._key(e);
      // Stop the page from scrolling / activating on game keys.
      if (['space', 'up', 'down', 'left', 'right'].includes(name)) e.preventDefault();
      // Held state also refreshes on auto-repeat (Set.add is idempotent), so a key
      // still physically down after a focus loss cleared it is picked up again.
      self.down.add(name);
      if (!e.repeat && self.onKeyPressed) self.onKeyPressed(name);
    });

    window.addEventListener('keyup', (e) => {
      self.down.delete(self._key(e));
    });

    // Focus loss (alt-tab, devtools, another window, hidden tab): the keyup goes
    // elsewhere, so drop every held key and pause a live run like Esc would.
    // Steer/boost/reel are re-read from isDown() each frame, so they stop at once.
    const focusLost = () => { self.down.clear(); self._autoPause(); };
    window.addEventListener('blur', focusLost);
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => { if (document.hidden) focusLost(); });
    }

    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      self.mouseX = e.clientX - r.left;
      self.mouseY = e.clientY - r.top;
      if (self.onMouseMoved) self.onMouseMoved(self.mouseX, self.mouseY);
    });

    canvas.addEventListener('mousedown', (e) => {
      const r = canvas.getBoundingClientRect();
      self.mouseX = e.clientX - r.left;
      self.mouseY = e.clientY - r.top;
      const button = e.button === 0 ? 1 : (e.button === 2 ? 2 : 3);
      if (self.onMousePressed) self.onMousePressed(button);
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('gamepadconnected', (e) => { self.gamepad = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', () => { self.gamepad = null; });
  },

  // Per-frame gamepad poll — fires onGamepadPressed for newly-pressed buttons.
  pollGamepad() {
    if (this.gamepad === null || !navigator.getGamepads) return null;
    const gp = navigator.getGamepads()[this.gamepad];
    if (!gp) return null;
    const map = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'leftshoulder', 5: 'rightshoulder',
                  9: 'start', 12: 'dpup', 13: 'dpdown', 14: 'dpleft', 15: 'dpright' };
    for (const idx in map) {
      const name = map[idx];
      const pressed = gp.buttons[idx] && gp.buttons[idx].pressed;
      if (pressed && !this._gpPrev[name] && this.onGamepadPressed) this.onGamepadPressed(name);
      this._gpPrev[name] = pressed;
    }
    return gp;
  },

  // LÖVE-style axis read: 'leftx','lefty','rightx','righty','triggerright','triggerleft'.
  gamepadAxis(name) {
    if (this.gamepad === null || !navigator.getGamepads) return 0;
    const gp = navigator.getGamepads()[this.gamepad];
    if (!gp) return 0;
    // Only the W3C 'standard' layout guarantees what lives past the left stick:
    // non-standard pads often put a trigger on axes[2] resting at -1, which
    // would hijack aim (pointing left) and read as a held RT.
    const std = gp.mapping === 'standard';
    if (name === 'leftx') return gp.axes[0] || 0;
    if (name === 'lefty') return gp.axes[1] || 0;
    if (name === 'rightx') return std ? (gp.axes[2] || 0) : 0;
    if (name === 'righty') return std ? (gp.axes[3] || 0) : 0;
    if (name === 'triggerright') return std && gp.buttons[7] ? gp.buttons[7].value : 0;
    if (name === 'triggerleft') return std && gp.buttons[6] ? gp.buttons[6].value : 0;
    return 0;
  },

  // Called when the window loses focus / is hidden: pause a live run (same as
  // Esc at game.js _gameKey). Not during the death beat or the victory munch.
  _autoPause() {
    const G = ASCENT.Game, S = ASCENT.STATES;
    if (!G || !S || G.state !== S.PLAYING || G.dying) return;
    if (G.goal && G.goal.reached) return;
    G.state = S.PAUSED;
    G.selectedPauseItem = 0;
  },

  hasGamepad() { return this.gamepad !== null; },

  // Translate a KeyboardEvent to the LÖVE key names the game expects.
  _key(e) {
    const code = e.code;
    const M = {
      KeyA: 'a', KeyB: 'b', KeyD: 'd', KeyE: 'e', KeyF: 'f', KeyG: 'g',
      KeyR: 'r', KeyS: 's', KeyW: 'w', KeyL: 'l', KeyM: 'm', KeyP: 'p',
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      Space: 'space', Escape: 'escape', Enter: 'return',
      ShiftLeft: 'lshift', ShiftRight: 'rshift',
      Equal: '=', Minus: '-', NumpadAdd: 'kp+', NumpadSubtract: 'kp-',
      F11: 'f11',
    };
    if (M[code]) return M[code];
    if (e.key && e.key.length === 1) return e.key.toLowerCase();
    return code.toLowerCase();
  },
};
