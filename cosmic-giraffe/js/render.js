/*
 * RENDER — frame compositor.
 * ==========================
 * Decides what gets drawn in which order for each state. The actual drawing
 * lives in the visual modules:
 *   space.js      ASCENT.Space      deep-space backdrop (screen space) + foreground dust/streaks
 *   world.js      ASCENT.World      home planet, asteroid slabs, hazards, comets, the Celestial Acacia
 *   giraffe.js    ASCENT.Giraffe    the giraffe + its tongue + aim reticle
 *   particles.js  ASCENT.Particles  sparks / slobber / stardust / bursts (+ shake on events)
 *   ui.js         ASCENT.UI         menus, HUD, pause, popups, win banner
 *
 * Layer order while playing (back → front):
 *   Space.drawBack            (screen space: gradient, nebulae, galaxies, planets, stars)
 *   ── camera transform on ──
 *   World.drawBack            (home planet, solar-wind currents, black holes, flare bands)
 *   World.drawPlatforms       (asteroid slabs, satellites, comet-ice, phase crystals)
 *   World.drawGoal            (the Celestial Acacia)
 *   Particles.drawBack        (particles that sit behind the giraffe)
 *   Giraffe.draw              (tongue, giraffe, aim reticle)
 *   World.drawFront           (comets, active flare beams — things that pass in front)
 *   Particles.drawFront       (additive sparks / bursts)
 *   ── camera transform off ──
 *   Space.drawFront           (screen space: near dust, speed streaks, vignette)
 *   UI.drawHUD / overlays
 */
window.ASCENT = window.ASCENT || {};

ASCENT.Render = {
  draw(g) {
    const S = ASCENT.STATES, ctx = ASCENT.Gfx.ctx;
    switch (g.state) {
      // Toasts are drawn on every screen so one unlocked just before leaving a
      // run isn't silently timed out on the menu.
      case S.MENU: ASCENT.UI.drawMenu(ctx, g); ASCENT.UI.drawPopups(ctx, g); break;
      case S.OPTIONS: ASCENT.UI.drawOptions(ctx, g); ASCENT.UI.drawPopups(ctx, g); break;
      case S.BEST_TIMES: ASCENT.UI.drawBestTimes(ctx, g); ASCENT.UI.drawPopups(ctx, g); break;
      case S.ACHIEVEMENTS: ASCENT.UI.drawAchievements(ctx, g); ASCENT.UI.drawPopups(ctx, g); break;
      case S.PLAYING:
        this.drawGame(ctx, g);
        ASCENT.UI.drawHUD(ctx, g);
        ASCENT.UI.drawPopups(ctx, g);
        break;
      case S.PAUSED:
        this.drawGame(ctx, g);
        ASCENT.UI.drawHUD(ctx, g);
        ASCENT.UI.drawPause(ctx, g);
        ASCENT.UI.drawPopups(ctx, g);
        break;
    }
  },

  drawGame(ctx, g) {
    if (!g.player) return;
    ASCENT.Space.drawBack(ctx, g);

    ctx.save();
    ASCENT.Cam.apply(ctx, g);
    ASCENT.World.drawBack(ctx, g);
    ASCENT.World.drawPlatforms(ctx, g);
    ASCENT.World.drawGoal(ctx, g);
    ASCENT.Particles.drawBack(ctx, g);
    ASCENT.Giraffe.draw(ctx, g);
    ASCENT.World.drawFront(ctx, g);
    ASCENT.Particles.drawFront(ctx, g);
    ctx.restore();

    ASCENT.Space.drawFront(ctx, g);
  },
};
