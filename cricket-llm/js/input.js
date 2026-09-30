/*
 * INPUT
 * =====
 * Keyboard + mouse + touch, with precise timestamps.
 *
 * Timing judgements use event.timeStamp (same clock as performance.now()),
 * never the animation frame, so a 16 ms frame can't eat half a Perfect
 * window. Game code converts stamps to game-clock seconds with toGame().
 */
(function () {
  const CLLM = window.CLLM;

  const Input = {
    keys: new Set(),
    mouse: { x: 0, y: 0, inside: false, moved: false },
    queue: [],               // discrete actions: {type, key, button, stamp, x, y}
    enabled: true,
    touch: false,
    _clockRef: { p0: 0, p1: 1, g0: 0, dt: 0 },

    attach(canvas) {
      const push = (ev) => { if (this.enabled) this.queue.push(ev); };
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const k = normKey(e);
        this.keys.add(k);
        if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].indexOf(k) >= 0) e.preventDefault();
        push({ type: 'keydown', key: k, stamp: e.timeStamp, shift: e.shiftKey, ctrl: e.ctrlKey });
      });
      window.addEventListener('keyup', (e) => {
        const k = normKey(e);
        this.keys.delete(k);
        push({ type: 'keyup', key: k, stamp: e.timeStamp });
      });
      window.addEventListener('blur', () => { this.keys.clear(); push({ type: 'blur', stamp: performance.now() }); });
      canvas.addEventListener('mousemove', (e) => {
        this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; this.mouse.moved = true;
      });
      canvas.addEventListener('mouseleave', () => { this.mouse.inside = false; });
      canvas.addEventListener('mousedown', (e) => {
        this.mouse.x = e.clientX; this.mouse.y = e.clientY;
        push({ type: 'mousedown', button: e.button, stamp: e.timeStamp, x: e.clientX, y: e.clientY, shift: e.shiftKey });
        e.preventDefault();
      });
      canvas.addEventListener('mouseup', (e) => {
        push({ type: 'mouseup', button: e.button, stamp: e.timeStamp, x: e.clientX, y: e.clientY });
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      // Touch: the page decides what a touch means (buttons are DOM elements)
      window.addEventListener('touchstart', () => {
        if (!this.touch) { this.touch = true; document.body.classList.add('touch'); }
      }, { passive: true });
      canvas.addEventListener('touchstart', (e) => {
        const t = e.changedTouches[0];
        this.mouse.x = t.clientX; this.mouse.y = t.clientY; this.mouse.inside = true; this.mouse.moved = true;
        push({ type: 'touchstart', stamp: e.timeStamp, x: t.clientX, y: t.clientY, id: t.identifier });
        e.preventDefault();
      }, { passive: false });
      canvas.addEventListener('touchmove', (e) => {
        const t = e.changedTouches[0];
        this.mouse.x = t.clientX; this.mouse.y = t.clientY; this.mouse.moved = true;
        push({ type: 'touchmove', stamp: e.timeStamp, x: t.clientX, y: t.clientY, id: t.identifier });
        e.preventDefault();
      }, { passive: false });
      canvas.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        push({ type: 'touchend', stamp: e.timeStamp, x: t.clientX, y: t.clientY, id: t.identifier });
        e.preventDefault();
      }, { passive: false });
    },

    // A DOM button (touch controls) can inject an action.
    inject(type, key) {
      this.queue.push({ type, key, stamp: performance.now() });
    },

    drain() { const q = this.queue; this.queue = []; return q; },
    clear() { this.queue = []; this.keys.clear(); },
    down(k) { return this.keys.has(k); },

    // Tell the input module what the game clock read at a given perf time.
    // The frame spanned perf [p0, p1] (ms) and moves the game clock from g0 by dt.
    sync(p0, p1, g0, dt) { const r = this._clockRef; r.p0 = p0; r.p1 = p1; r.g0 = g0; r.dt = dt; },
    // Convert an event stamp (ms, perf clock) to game-clock seconds: map the
    // stamp's position inside the frame linearly onto the clock's advance.
    toGame(stamp) {
      const r = this._clockRef;
      const span = Math.max(1e-3, r.p1 - r.p0);
      const u = Math.min(1, Math.max(0, (stamp - r.p0) / span));
      return r.g0 + u * r.dt;
    },
  };

  function normKey(e) {
    const k = (e.key || '').toLowerCase();
    if (k === 'spacebar') return ' ';
    return k;
  }

  CLLM.Input = Input;
})();
