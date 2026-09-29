/*
 * BUS — tiny gameplay event bus.
 * ==============================
 * Gameplay code announces moments with ASCENT.FX.emit(type, data); visual and
 * audio modules subscribe with ASCENT.FX.on(fn(type, data)). Keeps the
 * physics files free of rendering concerns. A listener that throws is logged
 * and skipped, never allowed to break the game loop.
 *
 * Event types (all positions in world coords):
 *   tongueShoot   {x, y, angle}                 tongue fired from the giraffe
 *   tongueAttach  {x, y, platform|null, ground} tongue stuck (platform or planet)
 *   tongueMiss    {x, y, angle}                 tongue reached max length, flops back
 *   tongueRelease {x, y, px, py}                player let go (x,y = old anchor)
 *   tongueCut     {x, y, vx, vy}                a comet sliced the tongue
 *   phaseDetach   {x, y, platform}              phasing crystal vanished under the tongue
 *   crumble       {x, y, width, platform}       a crumbling comet-ice slab broke apart
 *   boost         {x, y}                        boost started (Shift / RT)
 *   jump          {x, y, double}                jump (y = hoof level)
 *   land          {x, y, speed}                 hit the planet surface hard
 *   flareIgnite   {flare}                       a solar-flare beam started sweeping
 *   death         {x, y, cause}                 'flare' | 'void' — about to respawn
 *   respawn       {x, y}                        giraffe placed back at the start
 *   goal          {x, y}                        reached the Celestial Acacia
 *   runStart      {}                            a new run began (startGame)
 */
window.ASCENT = window.ASCENT || {};

ASCENT.FX = {
  _listeners: [],
  on(fn) { this._listeners.push(fn); },
  emit(type, data) {
    for (const fn of this._listeners) {
      try { fn(type, data || {}); }
      catch (e) { if (window.console) console.error('[FX listener]', type, e); }
    }
  },
};
