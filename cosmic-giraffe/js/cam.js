/*
 * CAM — the "flying through space" camera.
 * ========================================
 * Follows the giraffe like Cosmic Ascent's camera (player held 60% down the
 * view, clamped to the level), plus: speed-based zoom-out (you see more sky
 * the faster you fly), a slight lean into horizontal motion, and trauma-based
 * screen shake (ASCENT.Cam.shake(amount)).
 *
 * g.camera fields (read by every render module):
 *   cx, cy     world point at the centre of the screen (un-shaken)
 *   zoom       world→screen scale (1 = 1 world unit per CSS px)
 *   viewW/H    visible world size = screen / zoom
 *   x, y       world coords of the visible rect's top-left (un-rotated)
 *   tilt       lean in radians
 *   shakeX/Y   current shake offset in screen px
 *   trauma     0..1 shake energy
 *   vx, vy     camera velocity in world px/s (for parallax streaks)
 *
 * World drawing: ctx.save(); ASCENT.Cam.apply(ctx, g); ...; ctx.restore().
 */
window.ASCENT = window.ASCENT || {};

ASCENT.Cam = {
  reset(g) {
    const p = g.player;
    g.camera = {
      cx: p ? p.x : 0, cy: p ? p.y : 0, zoom: 1, viewW: g.screenWidth, viewH: g.screenHeight,
      x: 0, y: 0, tilt: 0, shakeX: 0, shakeY: 0, trauma: 0, vx: 0, vy: 0,
      smoothing: ASCENT.CONFIG.CAMERA_SMOOTHING,
    };
    this._target(g, true);
  },

  // Add shake trauma (0..1). Shake magnitude grows with trauma².
  shake(g, amount) {
    if (!g.camera) return;
    g.camera.trauma = Math.min(1, g.camera.trauma + amount);
  },

  _target(g, snap) {
    const C = ASCENT.CONFIG, cam = g.camera, p = g.player;
    if (!p) return;
    cam.viewW = g.screenWidth / cam.zoom;
    cam.viewH = g.screenHeight / cam.zoom;
    const lw = g.levelWidth, lh = g.levelHeight;
    let tx, ty;
    if (g.goal && g.goal.reached) {
      // Victory: frame the Acacia + munching giraffe in the upper part of the
      // screen (above the win banner). Ignores the level-top clamp.
      tx = (g.goal.x + p.x) / 2;
      ty = g.goal.y + (0.5 - C.CAMERA_VICTORY_GOAL_Y) * cam.viewH;
      tx = lw <= cam.viewW ? lw / 2 : Math.max(cam.viewW / 2, Math.min(lw - cam.viewW / 2, tx));
    } else {
      // Keep the giraffe at CAMERA_Y_OFFSET down the view.
      tx = p.x;
      ty = p.y - cam.viewH * (C.CAMERA_Y_OFFSET - 0.5);
      // Clamp so the view stays inside the level (centre if the level is
      // smaller); the top may overscroll a little so the Acacia isn't jammed
      // against the screen edge on the final climb.
      tx = lw <= cam.viewW ? lw / 2 : Math.max(cam.viewW / 2, Math.min(lw - cam.viewW / 2, tx));
      ty = lh <= cam.viewH ? lh / 2 : Math.max(cam.viewH / 2 - C.CAMERA_TOP_OVERSCROLL, Math.min(lh - cam.viewH / 2, ty));
    }
    // Snapping (Cam.reset / respawn) also sets the top-left: that frame is
    // drawn before any Cam.update, and World culls against cam.x/y.
    if (snap) { cam.cx = tx; cam.cy = ty; cam.x = tx - cam.viewW / 2; cam.y = ty - cam.viewH / 2; }
    return { tx, ty };
  },

  update(g, dt) {
    const C = ASCENT.CONFIG, cam = g.camera, p = g.player;
    if (!cam || !p) return;
    const f60 = dt * 60;

    // Speed-driven zoom.
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const s = Math.min(1, speed / C.CAMERA_ZOOM_SPEED_REF);
    const zt = (g.goal && g.goal.reached) ? C.CAMERA_VICTORY_ZOOM
      : C.CAMERA_ZOOM_MAX + (C.CAMERA_ZOOM_MIN - C.CAMERA_ZOOM_MAX) * (s * s * (3 - 2 * s));
    cam.zoom += (zt - cam.zoom) * (1 - Math.pow(1 - C.CAMERA_ZOOM_SMOOTHING, f60));

    const t = this._target(g, false);
    const k = 1 - Math.pow(1 - cam.smoothing, f60);
    const ox = cam.cx, oy = cam.cy;
    cam.cx += (t.tx - cam.cx) * k;
    cam.cy += (t.ty - cam.cy) * k;
    if (dt > 0) { cam.vx = (cam.cx - ox) / dt; cam.vy = (cam.cy - oy) / dt; }

    cam.viewW = g.screenWidth / cam.zoom;
    cam.viewH = g.screenHeight / cam.zoom;
    cam.x = cam.cx - cam.viewW / 2;
    cam.y = cam.cy - cam.viewH / 2;

    // Lean into horizontal speed.
    const tiltT = Math.max(-1, Math.min(1, p.vx / 900)) * C.CAMERA_TILT_MAX;
    cam.tilt += (tiltT - cam.tilt) * (1 - Math.pow(0.94, f60));

    // Trauma shake.
    cam.trauma = Math.max(0, cam.trauma - C.CAMERA_SHAKE_DECAY * dt);
    const sh = cam.trauma * cam.trauma * C.CAMERA_SHAKE_MAX_PX;
    const tt = (g.time || 0) * 47;
    cam.shakeX = sh * (Math.sin(tt * 1.3) * 0.6 + Math.sin(tt * 2.9 + 1.7) * 0.4);
    cam.shakeY = sh * (Math.sin(tt * 1.7 + 0.5) * 0.6 + Math.sin(tt * 3.3 + 2.1) * 0.4);
  },

  // Apply the world transform to ctx (call inside save/restore).
  apply(ctx, g) {
    const cam = g.camera;
    ctx.translate(g.screenWidth / 2 + cam.shakeX, g.screenHeight / 2 + cam.shakeY);
    if (cam.tilt) ctx.rotate(cam.tilt);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.cx, -cam.cy);
  },

  screenToWorld(g, sx, sy) {
    const cam = g.camera;
    let dx = sx - g.screenWidth / 2 - cam.shakeX, dy = sy - g.screenHeight / 2 - cam.shakeY;
    if (cam.tilt) {
      const c = Math.cos(-cam.tilt), s = Math.sin(-cam.tilt);
      const rx = dx * c - dy * s, ry = dx * s + dy * c;
      dx = rx; dy = ry;
    }
    return { x: dx / cam.zoom + cam.cx, y: dy / cam.zoom + cam.cy };
  },

  worldToScreen(g, wx, wy) {
    const cam = g.camera;
    let dx = (wx - cam.cx) * cam.zoom, dy = (wy - cam.cy) * cam.zoom;
    if (cam.tilt) {
      const c = Math.cos(cam.tilt), s = Math.sin(cam.tilt);
      const rx = dx * c - dy * s, ry = dx * s + dy * c;
      dx = rx; dy = ry;
    }
    return { x: dx + g.screenWidth / 2 + cam.shakeX, y: dy + g.screenHeight / 2 + cam.shakeY };
  },

  // Cheap culling: is a world-space circle (x, y, r) possibly on screen?
  // Pads generously for tilt/shake.
  visible(g, x, y, r) {
    const cam = g.camera, pad = 60 / cam.zoom + (r || 0);
    return x + pad > cam.x && x - pad < cam.x + cam.viewW &&
           y + pad > cam.y && y - pad < cam.y + cam.viewH;
  },
};
