/*
 * MAIN — bootstrap: canvas + resolution, the requestAnimationFrame loop, input
 * wiring, audio unlock on first gesture, and save-on-exit. Exposes
 * window.__giraffe.
 *
 * Resolution / quality: the canvas renders at ASCENT.dpr device pixels per CSS
 * px. Options → GRAPHICS picks it:
 *   HIGH  full device pixel ratio (capped at 2)
 *   LOW   0.75 (soft, but far cheaper — for old laptops)
 *   AUTO  starts at HIGH and steps the resolution down if the machine can't
 *         keep up. Each step is a measured experiment (a "probe"): after
 *         sustained slow gameplay frames the resolution drops one step, and it
 *         is kept only if the frame interval actually improves. Our own JS time
 *         can't tell a fill-rate-bound GPU apart (Chrome/Safari rasterise the
 *         canvas in the GPU process after the frame callback returns), and a
 *         browser throttled to 30 fps (battery saver) doesn't speed up at a
 *         lower resolution — so a probe that doesn't help is undone and AUTO
 *         stops trying until the GRAPHICS option or the window size changes.
 *
 * GPU context loss (Chrome): on 'contextrestored' every pre-rendered cache is
 * rebuilt into new canvases on the next frame (see rebuildGfxCaches).
 */
(function () {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const musicEl = document.getElementById('bg-music');
  let dpr = 1, cssW = 0, cssH = 0;

  const Q = {
    LOW: 0.75,          // render scale for GRAPHICS: LOW, and the AUTO floor
    STEP: 0.8,          // AUTO: multiply the scale by this per downgrade
    WINDOW: 90,         // frames per measurement window
    SLOW_MS: 25,        // median frame interval that counts as slow (< 40 fps)
    BUSY_MS: 9,         // diagnostic only (ASCENT.quality.busy): our own JS work per frame
    WINDOWS: 2,         // consecutive slow windows before probing a step down
    SETTLE_MS: 3000,    // ignore frames this long after boot / a resolution change
    PROBE_GAIN: 0.85,   // a probe step is kept if the interval drops below this × before
  };
  let autoFactor = 1, slowWindows = 0, settleUntil = 0;
  // AUTO probe: probing = a step was just taken and the next full window judges it;
  // gaveUp = a step didn't help, so stop probing (until GRAPHICS / the viewport changes).
  let probing = false, gaveUp = false, baseMs = 0, prevFactor = 1, lastMode = 'auto';
  const deltas = [], works = [];
  const diag = { rawMs: 0, workMs: 0 };   // medians of the last full window (console diagnostics)

  function wantedDpr() {
    const device = Math.min(2, Math.max(1, window.devicePixelRatio || 1));   // cap: 4K canvases cost fill-rate
    const mode = ASCENT.Save.options.graphics || 'auto';
    if (mode === 'high') return device;
    if (mode === 'low') return Q.LOW;
    return Math.max(Q.LOW, device * autoFactor);
  }

  function sizeCanvas() {
    // Fall back to a sane default if the viewport reports 0 (some headless/embedded contexts).
    cssW = window.innerWidth || document.documentElement.clientWidth || 1280;
    cssH = window.innerHeight || document.documentElement.clientHeight || 720;
    dpr = wantedDpr();
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ASCENT.dpr = dpr;
    settleUntil = performance.now() + Q.SETTLE_MS;
    deltas.length = 0; works.length = 0; slowWindows = 0;
  }

  // Re-size and rebuild the resolution-dependent caches.
  function applySize() {
    sizeCanvas();
    ASCENT.Gfx.init(ctx);   // canvas resize resets context state
    ASCENT.Game.resize(cssW, cssH);
  }

  // Forget the AUTO probe history: the GRAPHICS option or the viewport changed, so the
  // old verdict no longer applies. An unfinished probe step is undone (it was never proven).
  // Deliberately NOT part of sizeCanvas(): the probe's own applySize() calls must keep it.
  function resetProbe() {
    if (probing) autoFactor = prevFactor;
    probing = false; gaveUp = false; slowWindows = 0;
  }

  ASCENT.Gfx.init(ctx);
  ASCENT.Audio.init(musicEl);
  ASCENT.Save.loadAll();    // options (GRAPHICS) are needed before the first size
  lastMode = ASCENT.Save.options.graphics || 'auto';
  sizeCanvas();
  ASCENT.Game.init(cssW, cssH, canvas);

  window.addEventListener('resize', () => { resetProbe(); applySize(); });

  // ---- GPU context loss (Chrome) ----
  // A GPU process crash, driver reset or laptop GPU switch can drop a 2D canvas's backing
  // store; Chrome then fires contextlost / contextrestored, and a restored canvas comes back
  // CLEARED. The main canvas is redrawn every frame so it recovers by itself, but every cache
  // that was pre-rendered once (star tiles, nebulae, glow sprites, the wordmark…) would stay
  // blank for the rest of the session. So on 'contextrestored' the next frame asks each module
  // to rebuild its caches into NEW canvases (Chrome restores every offscreen canvas on its own
  // timer, so an old one may still be lost and would drop any redraw). Firefox / older Safari
  // fire no such event, so there is nothing to detect there; they are left as they are.
  // (Never preventDefault() 'contextlost' on a 2D canvas: that tells the browser NOT to restore.)
  const NOTICE_MS = 12000;
  const NOTICE_TEXT = 'Graphics were reset. Reload the page to restore full visuals.';
  let gfxRestored = false, gfxNoticeUntil = 0, noticeW = 0;
  if (canvas.addEventListener) canvas.addEventListener('contextrestored', () => { gfxRestored = true; });

  // Each module rebuilds its own caches through an optional rebuild(g) hook (Space, World,
  // Particles, UI, every giraffe style). A module without one can't be repaired from here
  // (its caches are private), so the player gets a short notice to reload instead.
  function rebuildGfxCaches() {
    const g = ASCENT.Game;
    ASCENT.Gfx.init(ctx);   // the restored context comes back with default state
    let complete = true;
    const fix = (name, mod) => {
      if (!mod) return;
      try {
        if (typeof mod.rebuild === 'function') mod.rebuild(g);
        else complete = false;
      } catch (e) {
        complete = false;
        if (window.console) console.warn('[gfx] ' + name + ' rebuild failed', e);
      }
    };
    fix('Space', ASCENT.Space);
    fix('World', ASCENT.World);
    fix('Particles', ASCENT.Particles);
    fix('UI', ASCENT.UI);
    const skins = ASCENT.GiraffeSkins || {};
    for (const k in skins) fix('Giraffe ' + k, skins[k]);
    if (!complete) gfxNoticeUntil = performance.now() + NOTICE_MS;
    // background texture work follows a rebuild: don't let it pass for a slow GPU
    settleUntil = performance.now() + Q.SETTLE_MS;
    deltas.length = 0; works.length = 0;
  }

  // Small screen-space notice (bottom centre, fades out) when a rebuild was incomplete.
  function drawGfxNotice(now) {
    const left = gfxNoticeUntil - now;
    if (!(left > 0)) { gfxNoticeUntil = 0; return; }
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(1, left / 800);
    ctx.font = '600 14px Fredoka, "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!noticeW) noticeW = ctx.measureText(NOTICE_TEXT).width || 420;
    const w = Math.max(40, Math.min(cssW - 32, noticeW + 32)), h = 32;
    const x = (cssW - w) / 2, y = Math.max(8, cssH - h - 24);
    ctx.fillStyle = 'rgba(12,13,40,0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(NOTICE_TEXT, cssW / 2, y + h / 2, w - 16);
    ctx.restore();
  }

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

  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

  // AUTO quality: watch frame pacing and probe a resolution step down if needed.
  // The frame interval is the only signal used: our own JS time (workMs) misses a
  // fill-rate-bound GPU, whose raster work runs after the frame callback returns.
  function watchQuality(now, rawMs, workMs) {
    const mode = ASCENT.Save.options.graphics || 'auto';
    if (mode !== lastMode) { lastMode = mode; resetProbe(); }             // GRAPHICS option changed
    if (Math.abs(wantedDpr() - dpr) > 1e-3) { resetProbe(); applySize(); return; }   // …or the display's dpr
    if (mode !== 'auto' || gaveUp) return;
    if (now < settleUntil || document.visibilityState === 'hidden' || rawMs > 250) return;
    // Gameplay frames only: the title screen generates textures in the background
    // (CPU work), which must not pass for a slow GPU.
    if (ASCENT.Game.state !== 'playing') return;
    deltas.push(rawMs); works.push(workMs);
    if (deltas.length < Q.WINDOW) return;
    const med = median(deltas);
    diag.rawMs = med; diag.workMs = median(works);
    deltas.length = 0; works.length = 0;

    if (probing) {
      // This is the first full window since the step (sizeCanvas restarted the settle).
      probing = false; slowWindows = 0;
      if (med < baseMs * Q.PROBE_GAIN || med <= Q.SLOW_MS) return;   // it helped: keep it
      // It didn't: not fill-rate bound (CPU-bound, or a browser capped at 30 fps).
      autoFactor = prevFactor; gaveUp = true;
      applySize();
      return;
    }
    slowWindows = med > Q.SLOW_MS ? slowWindows + 1 : 0;
    if (slowWindows >= Q.WINDOWS && dpr > Q.LOW + 1e-3) {
      baseMs = med; prevFactor = autoFactor;
      autoFactor *= Q.STEP;
      applySize();            // (resets the window and the settle time)
      probing = true;
    }
  }

  // Main loop. A thrown error is logged (once per message) but never stops
  // the loop — one bad frame must not freeze the game.
  let last = performance.now();
  const seenErrors = new Set();
  function frame(now) {
    const rawMs = now - last;
    let dt = rawMs / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05;        // clamp big gaps (tab switch) to avoid tunnelling
    if (dt < 0) dt = 0;
    const t0 = performance.now();
    try {
      if (gfxRestored) { gfxRestored = false; rebuildGfxCaches(); }   // GPU context came back
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ASCENT.Game.update(dt);
      ASCENT.Game.draw();
      if (gfxNoticeUntil) drawGfxNotice(now);
    } catch (e) {
      const k = String(e && e.message);
      if (!seenErrors.has(k)) { seenErrors.add(k); console.error('[frame]', e); }
    }
    try { watchQuality(now, rawMs, performance.now() - t0); } catch (e) { /* never block the loop */ }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Console diagnostics. rebuildGfx() runs the context-restored path by hand (to test it).
  ASCENT.quality = {
    get dpr() { return dpr; }, get autoFactor() { return autoFactor; },
    get probing() { return probing; }, get gaveUp() { return gaveUp; },
    get frameMs() { return diag.rawMs; }, get workMs() { return diag.workMs; },
    get busy() { return diag.workMs > Q.BUSY_MS; },
    rebuildGfx() { gfxRestored = true; },
  };
  window.__giraffe = ASCENT.Game;   // for console debugging
})();
