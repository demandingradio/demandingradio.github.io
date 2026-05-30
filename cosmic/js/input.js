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
      if (!e.repeat) {
        self.down.add(name);
        if (self.onKeyPressed) self.onKeyPressed(name);
      }
    });

    window.addEventListener('keyup', (e) => {
      self.down.delete(self._key(e));
    });

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

  // LÖVE-style axis read: 'leftx','lefty','triggerright'.
  gamepadAxis(name) {
    if (this.gamepad === null || !navigator.getGamepads) return 0;
    const gp = navigator.getGamepads()[this.gamepad];
    if (!gp) return 0;
    if (name === 'leftx') return gp.axes[0] || 0;
    if (name === 'lefty') return gp.axes[1] || 0;
    if (name === 'triggerright') return gp.buttons[7] ? gp.buttons[7].value : 0;
    return 0;
  },

  hasGamepad() { return this.gamepad !== null; },

  // Translate a KeyboardEvent to the LÖVE key names the game expects.
  _key(e) {
    const code = e.code;
    const M = {
      KeyA: 'a', KeyB: 'b', KeyD: 'd', KeyE: 'e', KeyF: 'f', KeyG: 'g',
      KeyR: 'r', KeyS: 's', KeyW: 'w', KeyL: 'l',
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
