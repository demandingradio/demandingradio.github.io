/*
 * MOUSE
 * =====
 * Tracks pointer position and button state for the human player.
 *
 * Stores raw canvas-pixel position. The Game converts to field coordinates
 * each frame using its current render transform (set via setTransform()).
 *
 *   FOOTY.Mouse.worldX / worldY  — field-unit position of the cursor
 *   FOOTY.Mouse.leftDown / rightDown          — currently held
 *   FOOTY.Mouse.leftPressed / rightPressed    — became held this frame
 *   FOOTY.Mouse.leftReleased / rightReleased  — released this frame
 *
 * Press/release flags cleared by Game via endFrame().
 */
window.FOOTY = window.FOOTY || {};

FOOTY.Mouse = (function () {
  const state = {
    canvasX: 0, canvasY: 0,      // raw canvas pixel
    worldX:  0, worldY:  0,      // field-unit (Game updates each render)
    leftDown: false, rightDown: false,
    leftPressed: false, rightPressed: false,
    leftReleased: false, rightReleased: false,
    enabled: true,
  };

  // Most recent transform that maps field-units → canvas-pixels.
  // Game writes these when it sets up its render so we can invert.
  let scale = 1, offX = 0, offY = 0, dpr = 1;
  let canvas = null;

  function attach(c) {
    canvas = c;

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      state.canvasX = (e.clientX - rect.left) * dpr;
      state.canvasY = (e.clientY - rect.top)  * dpr;
      _recomputeWorld();
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!state.enabled) return;
      if (e.button === 0) {
        if (!state.leftDown) state.leftPressed = true;
        state.leftDown = true;
      } else if (e.button === 2) {
        if (!state.rightDown) state.rightPressed = true;
        state.rightDown = true;
      }
    });

    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        state.leftDown = false;
        if (state.enabled) state.leftReleased = true;
      } else if (e.button === 2) {
        state.rightDown = false;
        if (state.enabled) state.rightReleased = true;
      }
    });

    // Suppress browser context menu — right-click is our handball.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // If the cursor leaves the canvas while buttons are held, drop the held
    // state so the player doesn't get stuck charging a kick.
    canvas.addEventListener('mouseleave', () => {
      state.leftDown = false;
      state.rightDown = false;
    });

    window.addEventListener('blur', () => {
      state.leftDown = false;
      state.rightDown = false;
      state.leftPressed = state.rightPressed = false;
      state.leftReleased = state.rightReleased = false;
    });
  }

  // Game calls this every render so we can convert pointer position into
  // field-units. Pass the same scale/offset used to draw the field.
  function setTransform(s, ox, oy, devicePixelRatio) {
    scale = s; offX = ox; offY = oy; dpr = devicePixelRatio || 1;
    _recomputeWorld();
  }

  function _recomputeWorld() {
    if (scale <= 0) return;
    state.worldX = (state.canvasX - offX) / scale;
    state.worldY = (state.canvasY - offY) / scale;
  }

  function endFrame() {
    state.leftPressed = state.rightPressed = false;
    state.leftReleased = state.rightReleased = false;
  }

  function setEnabled(v) {
    state.enabled = !!v;
    if (!v) {
      state.leftDown = state.rightDown = false;
      state.leftPressed = state.rightPressed = false;
      state.leftReleased = state.rightReleased = false;
    }
  }

  return {
    attach,
    setTransform,
    endFrame,
    setEnabled,
    get worldX()        { return state.worldX; },
    get worldY()        { return state.worldY; },
    get leftDown()      { return state.enabled && state.leftDown; },
    get rightDown()     { return state.enabled && state.rightDown; },
    get leftPressed()   { return state.enabled && state.leftPressed; },
    get rightPressed()  { return state.enabled && state.rightPressed; },
    get leftReleased()  { return state.enabled && state.leftReleased; },
    get rightReleased() { return state.enabled && state.rightReleased; },
  };
})();
