/*
 * GIRAFFE — style dispatcher.
 * ===========================
 * Three complete giraffe designs were drawn for this game; all three ship as
 * selectable styles (Options → GIRAFFE):
 *   giraffe-cartoon.js     CARTOON     bold ink outlines, goofy (the default)
 *   giraffe-plush.js       PLUSH       storybook chibi plush toy
 *   giraffe-naturalist.js  NATURALIST  sleek flat-vector illustration
 * Each file defines a full ASCENT.Giraffe and registers itself in
 * ASCENT.GiraffeSkins. This file loads after them and replaces ASCENT.Giraffe
 * with a thin dispatcher that forwards to the chosen style, so the rest of the
 * game only ever talks to one API:
 *   init(g) · update(g, dt) · draw(ctx, g) · drawPortrait(ctx, x, y, scale, t, opts)
 *   mouthPos(g) → {x, y} · hoofPos(g) → {x, y} | null
 */
window.ASCENT = window.ASCENT || {};

(function () {
  const SKINS = ASCENT.GiraffeSkins = ASCENT.GiraffeSkins || {};
  const DEFAULT = 'cartoon';

  // The styles, in the order the Options cycler shows them.
  ASCENT.GIRAFFE_STYLES = [
    { value: 'cartoon', label: 'CARTOON' },
    { value: 'plush', label: 'PLUSH' },
    { value: 'naturalist', label: 'NATURALIST' },
  ].filter((s) => SKINS[s.value]);

  function skin() {
    const id = ASCENT.Save && ASCENT.Save.options && ASCENT.Save.options.giraffeSkin;
    return SKINS[id] || SKINS[DEFAULT] || SKINS[Object.keys(SKINS)[0]];
  }

  ASCENT.Giraffe = {
    skin,
    // Every style listens to gameplay events from init, so all are initialised
    // and switching styles never leaves one half-set-up.
    init(g) { for (const k in SKINS) SKINS[k].init(g); },
    update(g, dt) { skin().update(g, dt); },
    draw(ctx, g) { if (!g.dying) skin().draw(ctx, g); },   // hidden during the death "poof"
    drawPortrait(ctx, x, y, scale, t, opts) { skin().drawPortrait(ctx, x, y, scale, t, opts); },
    mouthPos(g) { return skin().mouthPos(g); },
    hoofPos(g) { const s = skin(); return s.hoofPos ? s.hoofPos(g) : null; },
  };
})();
