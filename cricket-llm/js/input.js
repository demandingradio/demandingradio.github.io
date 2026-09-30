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
    ptrType: null,           // type of the pointer that last moved the bat
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
      // Bat history: pointer events carry every high-rate sample the browser
      // merged into one frame (getCoalescedEvents), each with its own stamp.
      // Mouse events don't, so they'd only give one sample per frame.
      // On touch, the first finger down holds the bat until it lifts: a
      // second finger or a resting palm isn't the bat.
      let batId = null;
      const onPtr = (e) => {
        if (e.pointerType && e.pointerType !== 'mouse' && e.pointerId !== batId) return;
        this.ptrType = e.pointerType || 'mouse';
        const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
        if (list && list.length) for (const c of list) this._hist(c.clientX, c.clientY, c.timeStamp > 0 ? c.timeStamp : e.timeStamp);
        else this._hist(e.clientX, e.clientY, e.timeStamp);
      };
      if (window.PointerEvent) {
        canvas.addEventListener('pointermove', onPtr);
        canvas.addEventListener('pointerdown', (e) => {
          this.ptrType = e.pointerType || 'mouse';
          if (e.pointerType !== 'mouse') {
            if (batId !== null && batId !== e.pointerId) return;
            batId = e.pointerId;
            this._newTouch(e.clientX, e.clientY, e.timeStamp);
          } else this._hist(e.clientX, e.clientY, e.timeStamp);
        });
        const release = (e) => { if (e.pointerId === batId) batId = null; };
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);
      } else {
        canvas.addEventListener('mousemove', (e) => { this.ptrType = 'mouse'; onPtr(e); });
      }
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
        if (!window.PointerEvent) { this.ptrType = 'touch'; this._newTouch(t.clientX, t.clientY, e.timeStamp); }
        push({ type: 'touchstart', stamp: e.timeStamp, x: t.clientX, y: t.clientY, id: t.identifier });
        e.preventDefault();
      }, { passive: false });
      canvas.addEventListener('touchmove', (e) => {
        const t = e.changedTouches[0];
        this.mouse.x = t.clientX; this.mouse.y = t.clientY; this.mouse.moved = true;
        if (!window.PointerEvent) this._hist(t.clientX, t.clientY, e.timeStamp);
        push({ type: 'touchmove', stamp: e.timeStamp, x: t.clientX, y: t.clientY, id: t.identifier });
        e.preventDefault();
      }, { passive: false });
      canvas.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        push({ type: 'touchend', stamp: e.timeStamp, x: t.clientX, y: t.clientY, id: t.identifier });
        e.preventDefault();
      }, { passive: false });
    },

    // ---- pointer history (for the physical bat) ----------------------------
    hist: [],
    rest: null,              // where the bat sat before the current touch began
    // A new touch isn't a swipe from where the last one lifted: start a fresh
    // history, but remember the bat was resting there until now, so earlier
    // moments are still judged with the bat where it really was.
    _newTouch(x, y, s) {
      const h = this.hist, last = h[h.length - 1];
      this.rest = last ? { x: last.x, y: last.y, until: s } : null;
      this.hist = [];
      this._hist(x, y, s);
    },
    touchBat() { return this.ptrType ? this.ptrType === 'touch' : this.touch; },
    _hist(x, y, s) {
      const h = this.hist;
      if (h.length && s <= h[h.length - 1].s) s = h[h.length - 1].s + 0.01;
      h.push({ x, y, s });
      while (h.length > 2 && h[0].s < s - 600) h.shift();
    },
    // Pointer position at perf time s (ms), linearly interpolated.
    sampleAt(s) {
      const h = this.hist;
      if (!h.length) return { x: this.mouse.x, y: this.mouse.y };
      if (this.rest && s < this.rest.until) return { x: this.rest.x, y: this.rest.y };
      if (s >= h[h.length - 1].s) return { x: h[h.length - 1].x, y: h[h.length - 1].y };
      if (s <= h[0].s) return { x: h[0].x, y: h[0].y };
      let i = h.length - 1;
      while (i > 0 && h[i - 1].s > s) i--;
      const a = h[i - 1], b = h[i];
      const u = (s - a.s) / Math.max(1e-6, b.s - a.s);
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
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
