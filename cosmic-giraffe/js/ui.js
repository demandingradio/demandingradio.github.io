/*
 * UI — menus, HUD, pause overlay, achievement toasts and the victory banner.
 * =========================================================================
 * Screen-space module (CSS px — main.js has already applied the DPR
 * transform). Owns every piece of text the player reads:
 *
 *   drawMenu          title screen: a two-line "COSMIC / GIRAFFE" wordmark
 *                     (GIRAFFE is filled with giraffe hide and underlined by a
 *                     tongue that licks a star), a big floating giraffe licking
 *                     a twinkling star, and glassy pill buttons
 *   drawOptions       glass rows with little toggle switches / value cyclers,
 *                     plus a live spotlit preview of the selected giraffe style
 *                     (beside the panel, above it on narrow windows) that pops
 *                     when the style changes
 *   drawBestTimes     ranked list with gold / silver / bronze medals
 *   drawAchievements  tab 1 = lifetime stats, tab 2 = the achievements list
 *                     (both on dark glass so they read over the nebula)
 *   drawHUD           altitude track (right edge), run timer (top right), zone
 *                     announcements, the start-of-run control card, bottom-left
 *                     hints / indicators and the "STELLAR SNACK!" win banner
 *                     (lower half — the victory camera frames the Acacia above
 *                     it). Zone title + control card are skipped while paused.
 *   drawPause         dim + nearly opaque pause pills + a side panel (this
 *                     climb / controls)
 *   drawPopups        achievement toast
 *
 * Every run time is shown as fmtRun(): "01:23.4" (tenths; "1:02:03.4" past an
 * hour). Long cumulative stats (time played, fall time) use fmtDur(): "3h 02m".
 *
 * Every menu/pause draw rebuilds g.hotspots (pooled objects, one reused array)
 * so game.js's mouse hover/click handling works.
 *
 * Performance: the only big cache is the title wordmark (its glow, outline and
 * giraffe-spot texture are baked with shadowBlur / compositing at resize).
 * Glows everywhere else are small pre-rendered radial sprites drawn with
 * 'lighter'; gradients and font strings are built at resize; nothing creates
 * canvases or uses shadowBlur per frame. Typical cost: 40–130 draw ops/frame
 * (plus the Giraffe module's own portrait on the title and options screens).
 *
 * Fredoka arrives from Google Fonts asynchronously, so the cached wordmark and
 * measured HUD metrics are rebuilt once the font is measurably available
 * (_pollFont) — otherwise the logo would stay baked in the fallback font.
 *
 * After a GPU context loss main.js calls rebuild(g), which re-bakes every
 * cache above into brand-new canvases (a restored canvas comes back blank).
 */
window.ASCENT = window.ASCENT || {};

(function () {
  'use strict';

  // ===========================================================================
  // Tuning knobs
  // ===========================================================================
  const K = {
    FAMILY: 'Fredoka, "Segoe UI", system-ui, sans-serif',
    UNIT_BASE: 900,              // min(screenW, screenH) that counts as 1 UI unit
    UNIT_MIN: 0.45,              // …clamped so tiny / huge windows stay sane
    UNIT_MAX: 2.4,
    MIN_FONT_PX: 9,              // floor for small print on small windows
    CACHE_DPR_MAX: 2,            // retina cap for cached sprites
    WORDMARK_MAX_PIXELS: 2.0e6,  // device-pixel area cap of the title cache (≈8 MB)
    FONT_POLL_EVERY: 0.4,        // s between "has Fredoka arrived?" checks
    FONT_POLL_GIVE_UP: 20,       // s after which we stop checking

    HOVER_RATE: 16,              // 1/s — how fast a pill glides into its selected look
    PILL_GROW: 0.035,            // selected pill scale-up
    PILL_GLOW: 0.34,             // selected pill halo strength

    TITLE_GIRAFFE_MIN_SIDE: 300, // UI units of free side-space for the big title giraffe
    LICK_PERIOD: 3.4,            // s between the title giraffe's "slurps" of its star

    ZONE_ANN_TIME: 2.6,          // s a zone title stays up
    ZONE_ANN_IN: 0.45,
    ZONE_ANN_OUT: 0.7,

    CARD_TIME: 10,               // s the start-of-run control card stays up
    CARD_LICKS: 3,               // successful licks that dismiss it early
    CARD_FADE: 0.9,

    HUD_RESUME_FADE: 0.35,       // s — zone title / control card fade back in after un-pausing

    TOAST_IN: 0.35,
    TOAST_OUT: 0.5,
    WIN_PROMPT_DELAY: 1.0,       // game.js only accepts "back to menu" after 1 s
    // Victory banner: the camera frames the Acacia at ~0.3 of the height (cam.js),
    // so the banner lives in the lower half: title centre at WIN_TITLE_Y of the
    // height (pulled up if the block would run into the bottom toast) and
    // nothing above WIN_TOP.
    WIN_TITLE_Y: 0.6,
    WIN_TOP: 0.47,

    PAUSE_DIM: 0.7,              // flat darkening over the frozen game while paused

    // Options: live preview of the selected giraffe style
    PV_W: 300,                   // UI units — preview column beside the options panel
    PV_MIN_W: 210,               // …narrower than this: preview goes above the panel
    PV_GAP: 40,                  // UI units between the panel and the preview
    PV_ABOVE_MIN: 150,           // UI units of free height needed to show it above the panel
    PV_POP: 0.42,                // s — scale bounce when the style changes
    PV_BOX: [95, 112],           // px footprint of a floating giraffe at portrait scale 1
    // Visual centre of each style's float pose, px at scale 1 facing right, relative
    // to the drawPortrait anchor (measured from the three styles' own geometry).
    PV_CENTRE: { cartoon: [4.8, -19.3], plush: [-3.9, -0.7], naturalist: [3.3, -5.3] },
    PV_TAG: {
      cartoon: 'Bold ink, big goofy grin',
      plush: 'A huggable storybook plush',
      naturalist: 'Sleek wildlife illustration',
    },

    ZONE_CAPS: 'ENTERING',       // small caps over a zone title…
    ZONE_CAPS_START: 'THE CLIMB BEGINS',   // …and over the starting zone at launch
    // Short names for the altitude-track labels (index = ASCENT.ZONES index).
    ZONE_SHORT: ['Savanna', 'Low Orbit', 'Solar Winds', 'Black Holes', 'Comets', 'Canopy'],
    // One-liners under each zone announcement.
    ZONE_FLAVOR: [
      'Next stop: everything else',
      'The air gives up. The stars don’t.',
      'Hot currents — lean into them',
      'Don’t lick the black holes',
      'Keep your tongue out of traffic',
      'Something up here smells delicious',
    ],
    OPT_DESC: {
      soundEnabled: 'Music and sound effects · M mutes at any time',
      controlScheme: 'Which controls the in-game guide card shows',
      giraffeSkin: 'Pick your giraffe · ←/→ to flip through the styles',
      graphics: 'Resolution · AUTO lowers it if your computer struggles, LOW is fastest',
      debugMode: 'While playing: F free-flies, G warps to the Acacia',
      back: 'Settings are saved automatically',
    },
  };

  // Control listings (module constants — no per-frame allocation).
  // [chip, label]
  const KB_CARD = [['Mouse', 'Aim'], ['Click', 'Tongue / let go'], ['Space', 'Jump'],
    ['A / D', 'Steer'], ['W / S', 'Reel in / out'], ['Shift', 'Boost']];
  const PAD_CARD = [['R-stick', 'Aim'], ['A / RB', 'Tongue / let go'], ['B', 'Jump'],
    ['L-stick', 'Steer + reel'], ['RT', 'Boost'], ['Start', 'Pause']];
  // [chip, label, sub-line 1, sub-line 2]
  const KB_FULL = [
    ['Mouse', 'Aim the tongue', '', ''],
    ['Left click', 'Fire tongue / let go', '', ''],
    ['Right click / Space', 'Jump', 'double-jump in the air', '& just after letting go'],
    ['A D  /  ← →', 'Steer', '', ''],
    ['W S  /  ↑ ↓', 'Reel tongue in / out', '', ''],
    ['Shift', 'Boost the swing', '', ''],
    ['M', 'Mute', '', ''],
    ['Esc / P', 'Pause', '', ''],
    ['R', 'Restart run', '', ''],
  ];
  const PAD_FULL = [
    ['Right stick', 'Aim', '', ''],
    ['A / RB', 'Tongue', '', ''],
    ['B', 'Jump', '', ''],
    ['Left stick', 'Steer + reel', '', ''],
    ['RT', 'Boost', '', ''],
    ['Start', 'Pause', '', ''],
  ];
  const MEDALS = [
    { fill: '#ffd35c', ring: '#fff3c2', text: '#4a2a00' },   // gold
    { fill: '#d6dff0', ring: '#ffffff', text: '#27304a' },   // silver
    { fill: '#e0915a', ring: '#ffd2ad', text: '#3d1a05' },   // bronze
  ];
  const GOLD_BORDER = 'rgba(255,211,92,0.95)';
  const TEXT_IDLE = 'rgba(214,224,255,0.86)';
  const TEXT_HOT = '#fffaf0';
  const TEXT_DIM = 'rgba(170,180,215,0.62)';
  const PAUSE_FILL = 'rgba(5,4,13,' + K.PAUSE_DIM + ')';

  // ===========================================================================
  // Small helpers
  // ===========================================================================
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
  function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1, q = t - 1; return 1 + c3 * q * q * q + c1 * q * q; }
  const p2 = (n) => (n < 10 ? '0' + n : '' + n);

  function hexRgb(hex) {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    if (!isFinite(n) || h.length !== 6) return '255,255,255';
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }

  // Deterministic PRNG (mulberry32) so baked textures look the same every build.
  function prng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Rounded-rect path (ctx.roundRect is missing on older Safari).
  function rrect(ctx, x, y, w, h, r) {
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    r = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Four-point "twinkle" star as a sub-path (caller does beginPath / fill).
  // k = waist thickness (0.1 needle-thin … 0.3 chubby).
  function sparkle(ctx, x, y, r, k) {
    r = Math.max(0, r);
    const q = r * k;
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x + q, y - q, x + r, y);
    ctx.quadraticCurveTo(x + q, y + q, x, y + r);
    ctx.quadraticCurveTo(x - q, y + q, x - r, y);
    ctx.quadraticCurveTo(x - q, y - q, x, y - r);
    ctx.closePath();
  }

  // Five-point star sub-path.
  function star5(ctx, x, y, R, r, rot) {
    for (let i = 0; i < 10; i++) {
      const a = rot + i * Math.PI / 5, d = i & 1 ? r : R;
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  // Additive glow sprite (caller sets 'lighter').
  function glow(ctx, img, x, y, w, h, a) {
    if (!img || a <= 0.003 || w <= 0 || h <= 0) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(img, x - w * 0.5, y - h * 0.5, w, h);
  }

  // (Re)size an offscreen canvas for cssW×cssH at `scale` device px per CSS px.
  // Only creates a canvas when `c` is missing (init / first resize).
  function sizeCanvas(c, cssW, cssH, scale) {
    c = c || document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(cssW * scale));
    c.height = Math.max(1, Math.ceil(cssH * scale));
    const x = c.getContext('2d');
    x.setTransform(scale, 0, 0, scale, 0, 0);
    x.clearRect(0, 0, cssW, cssH);
    return c;
  }

  function zoneIndex(p) {
    const Z = ASCENT.ZONES;
    let k = 0;
    for (let i = 0; i < Z.length; i++) if (p >= Z[i].from) k = i;
    return k;
  }

  // THE run-time format, used for every run time the player sees (HUD clock,
  // HUD best, menu best chip, best-times list, win banner, pause card, stats):
  // "01:23.4" with tenths, or "1:02:03.4" once a run passes an hour.
  function fmtRun(s) {
    s = s > 0 && isFinite(s) ? s : 0;
    const tot = Math.floor(s);
    const tenth = clamp(Math.floor(s * 10) - tot * 10, 0, 9);
    const hh = Math.floor(tot / 3600), mm = Math.floor((tot % 3600) / 60), ss = tot % 60;
    return (hh > 0 ? hh + ':' + p2(mm) : p2(mm)) + ':' + p2(ss) + '.' + tenth;
  }

  // Long cumulative durations (time played, fall time): "42s", "12m 05s", "3h 02m".
  function fmtDur(s) {
    s = s > 0 && isFinite(s) ? s : 0;
    if (s < 60) return Math.floor(s) + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + p2(Math.floor(s % 60)) + 's';
    return Math.floor(s / 3600) + 'h ' + p2(Math.floor((s % 3600) / 60)) + 'm';
  }

  // Rounded-rect as a sub-path (no beginPath) so several can share one fill.
  function rrectSub(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fmtInt(n) {
    n = Math.round(+n || 0);
    const s = String(Math.abs(n));
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ',';
      out += s[i];
    }
    return (n < 0 ? '-' : '') + out;
  }

  function fmtPct(num, den) {
    if (!(den > 0)) return '—';
    return clamp((+num || 0) / den * 100, 0, 100).toFixed(1) + '%';
  }

  function fmtDist(px) {
    px = +px || 0;
    return px >= 10000 ? (px / 1000).toFixed(1) + ' km' : fmtInt(px) + ' m';
  }

  // ===========================================================================
  // The module
  // ===========================================================================
  const UI = {
    _L: null,                   // layout (recomputed on resize)
    _f: {},                     // font strings
    _grad: {},                  // gradients built at resize
    _cv: {},                    // cached canvases
    _glow: null,                // radial glow sprites
    _zoneGlow: null,
    _mctx: null,                // scratch context for measuring text
    _lsOK: false,               // ctx.letterSpacing supported?

    // hotspot pool
    _hs: [], _hsPool: [], _hsN: 0,

    // eased selection amounts per list, option switch positions, pause panel mix
    _hv: { menu: new Float32Array(16), opt: new Float32Array(16), pause: new Float32Array(16) },
    _sw: new Float32Array(16),
    _pauseMix: 0,
    _lastState: null,

    // run memory (zone announcements, control card, session best)
    _maxZone: -1, _ann: -1, _annT: 0,
    _runClock: 0, _licks: 0, _cardEnd: K.CARD_TIME, _lastTimer: 0,
    _sessBest: 0,
    _hudIn: 1,                  // 0 while paused → 1 shortly after resuming
    _toastY: 0,

    // options preview: which style is shown, time since it changed (pop)
    _pvSkin: null, _pvPop: 1, _pvLabel: '', _pvTag: '', _pvLabelFor: null,
    _cycLx: 0,                  // left ‹ of the last cycle row drawn (its back hotspot)

    // small string caches (avoid re-formatting every frame)
    _tK: -1, _tS: '', _pK: -1, _pS: '', _bV: null, _bS: '', _bLabel: '',
    _bt: [],                    // best-times rows: {v, main, tenth}
    _rankN: -1, _rankS: '',

    _font: { done: false, t: 0, next: 0 },
    _errs: {},

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------
    init(g) {
      this._lsOK = typeof CanvasRenderingContext2D !== 'undefined' &&
        'letterSpacing' in CanvasRenderingContext2D.prototype;
      if (!this._glow) this._buildGlows();
      this._portraitOpts = { pose: 'lick', facing: 1, tongueTo: { x: 0, y: 0 } };
      this._pvOpts = { pose: 'float', facing: 1 };

      // Hotspot actions, built once (reused every frame).
      this._optAct = [];
      for (let i = 0; i < 16; i++) {
        this._optAct.push(() => { if (g.optionsItems && g.optionsItems[i]) g._toggleOption(i); });
      }
      // ‹ on a cycle row / the preview caption steps backwards
      this._optActBack = [];
      for (let i = 0; i < 16; i++) {
        this._optActBack.push(() => { if (g.optionsItems && g.optionsItems[i]) g._toggleOption(i, -1); });
      }
      this._backAct = () => { g.state = ASCENT.STATES.MENU; };
      this._tabAct1 = () => { g.achievementsTab = 1; g.achievementsScroll = 0; };
      this._tabAct2 = () => { g.achievementsTab = 2; g.achievementsScroll = 0; };
      this._scrollUpAct = () => { g.achievementsScroll = Math.max(0, (g.achievementsScroll | 0) - 1); };
      this._scrollDnAct = () => {
        const max = Math.max(0, ASCENT.ACHIEVEMENTS.length - 8);
        g.achievementsScroll = Math.min(max, (g.achievementsScroll | 0) + 1);
      };

      if (!this._subscribed && ASCENT.FX) {
        this._subscribed = true;
        ASCENT.FX.on((type) => this._onFx(type));
      }
      this._layout(g);
      this._toastY = this._L.toY;
    },

    resize(g) { this._layout(g); },

    // GPU context restored (main.js): every cached canvas may be blank or still
    // lost, so bake into NEW ones — dropping _cv makes sizeCanvas() create fresh
    // wordmark / layer / head / badge canvases, _buildGlows() makes fresh glow
    // sprites and measuring scratch, and _layout() re-bakes those plus every
    // gradient. Selection easing, toasts and run/zone state are left alone, so
    // nothing visibly jumps. Safe before init (glows only; init lays out later)
    // and on repeat calls.
    rebuild(g) {
      this._cv = {};
      this._buildGlows();
      if (this._L && g) this._layout(g);
    },

    _onFx(type) {
      if (type === 'runStart') {
        this._maxZone = -1;           // -1 → the starting zone gets its title card too
        this._ann = -1; this._annT = 0;
        this._runClock = 0; this._licks = 0; this._cardEnd = K.CARD_TIME;
        this._lastTimer = 0;
        this._hudIn = 1;              // (a run left via the pause menu ended at 0)
      } else if (type === 'respawn') {
        this._maxZone = 0;            // zones get re-announced on the next climb
        this._ann = -1; this._annT = 0;   // no stale title over the home planet
        this._lastTimer = 0;
      } else if (type === 'tongueAttach') {
        this._licks++;
      }
    },

    update(g, dt) {
      if (!this._L) return;
      if (!(dt > 0)) dt = 0;
      this._pollFont(g, dt);

      const S = ASCENT.STATES, st = g.state;
      const entered = st !== this._lastState;
      this._lastState = st;
      const k = 1 - Math.exp(-dt * K.HOVER_RATE);

      if (st === S.MENU) {
        this._ease(this._hv.menu, g.selectedMenuItem, k, false);
      } else if (st === S.OPTIONS) {
        this._ease(this._hv.opt, g.selectedOptionIndex, k, false);
        const items = g.optionsItems || [], O = ASCENT.Save.options;
        for (let i = 0; i < items.length && i < 16; i++) {
          if (items[i].type !== 'toggle') continue;
          const tgt = O[items[i].key] ? 1 : 0;
          this._sw[i] = entered ? tgt : this._sw[i] + (tgt - this._sw[i]) * k;
        }
        // giraffe preview: pop when the style changes (not on entering the screen)
        const skin = O.giraffeSkin;
        if (entered) { this._pvSkin = skin; this._pvPop = 1; }
        else if (skin !== this._pvSkin) { this._pvSkin = skin; this._pvPop = 0; }
        this._pvPop = Math.min(1, this._pvPop + dt / K.PV_POP);
      } else if (st === S.PAUSED) {
        this._ease(this._hv.pause, g.selectedPauseItem, k, entered);
        const tgt = g.selectedPauseItem === 1 ? 1 : 0;
        this._pauseMix = entered ? tgt : this._pauseMix + (tgt - this._pauseMix) * k;
      }

      // Zone title + control card are hidden under the pause screen; their
      // timers only run in _updateRun (playing), so they hold where they were
      // and fade back in on resume instead of popping.
      if (st === S.PAUSED) this._hudIn = 0;
      else if (st === S.PLAYING) this._hudIn = Math.min(1, this._hudIn + dt / K.HUD_RESUME_FADE);

      if (st === S.PLAYING && g.player) this._updateRun(g, dt);

      // The achievement toast slides below a zone title while one is up.
      const annUp = st !== S.PAUSED && this._annAlpha() * this._hudIn > 0.05;
      const ty = annUp ? this._L.toYBelow : this._L.toY;
      this._toastY += (ty - this._toastY) * (1 - Math.exp(-dt * 9));
    },

    _ease(arr, sel, k, snap) {
      for (let i = 0; i < arr.length; i++) {
        const t = i === sel ? 1 : 0;
        arr[i] = snap ? t : arr[i] + (t - arr[i]) * k;
      }
    },

    _updateRun(g, dt) {
      const prog = clamp01(g.progress());
      // 'R' (resetGame) restarts the run without an event — spot the timer reset.
      const timer = g.gameTimer || 0;
      if (timer + 1e-6 < this._lastTimer) {
        this._maxZone = Math.min(this._maxZone, 0);
        this._ann = -1; this._annT = 0;
      }
      this._lastTimer = timer;

      this._runClock += dt;
      if (!g.debugFlying && prog > this._sessBest) this._sessBest = prog;

      const won = g.goal && g.goal.reached;
      const zi = zoneIndex(prog);
      if (!won && zi > this._maxZone) { this._maxZone = zi; this._ann = zi; this._annT = 0; }
      if (this._ann >= 0) {
        this._annT += dt * (won ? 3 : 1);        // hurry it away under the win banner
        if (this._annT > K.ZONE_ANN_TIME) this._ann = -1;
      }
      // A few successful licks = they've got it; retire the control card early.
      if (this._licks >= K.CARD_LICKS && this._cardEnd > this._runClock + K.CARD_FADE) {
        this._cardEnd = this._runClock + K.CARD_FADE;
      }
    },

    _annAlpha() {
      if (this._ann < 0) return 0;
      const t = this._annT;
      return Math.min(easeOut(clamp01(t / K.ZONE_ANN_IN)), clamp01((K.ZONE_ANN_TIME - t) / K.ZONE_ANN_OUT));
    },

    // Rebuild font-dependent caches once Fredoka is actually usable. check()
    // alone can't be trusted (it's true before the Google stylesheet has even
    // declared the face), so compare a measurement against the fallback.
    _pollFont(g, dt) {
      const P = this._font;
      if (P.done) return;
      P.t += dt;
      if (P.t < P.next) return;
      P.next = P.t + K.FONT_POLL_EVERY;
      let ready = false;
      try {
        const m = this._mctx, probe = 'COSMIC GIRAFFE 0123';
        m.font = '700 40px monospace';
        const a = m.measureText(probe).width;
        m.font = '700 40px Fredoka, monospace';
        const b = m.measureText(probe).width;
        ready = Math.abs(a - b) > 0.5;
      } catch (e) { ready = false; }
      if (ready) { P.done = true; this._layout(g); }
      else if (P.t > K.FONT_POLL_GIVE_UP) P.done = true;
    },

    _warnOnce(key, e) {
      if (this._errs[key]) return;
      this._errs[key] = true;
      if (window.console) console.error('[UI] ' + key, e);
    },

    // -------------------------------------------------------------------------
    // Sprites & layout (init / resize / font-ready only)
    // -------------------------------------------------------------------------
    _buildGlows() {
      const scratch = document.createElement('canvas');
      scratch.width = 8; scratch.height = 8;
      this._mctx = scratch.getContext('2d');
      const mk = (rgb) => {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        const x = c.getContext('2d');
        const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(' + rgb + ',1)');
        gr.addColorStop(0.22, 'rgba(' + rgb + ',0.55)');
        gr.addColorStop(0.5, 'rgba(' + rgb + ',0.16)');
        gr.addColorStop(1, 'rgba(' + rgb + ',0)');
        x.fillStyle = gr;
        x.fillRect(0, 0, 128, 128);
        return c;
      };
      this._glow = {
        gold: mk('255,205,110'),
        violet: mk('150,95,255'),
        white: mk('255,248,230'),
        leaf: mk(hexRgb(ASCENT.PAL.leafGlow)),
      };
      this._zoneGlow = ASCENT.ZONES.map((z) => mk(hexRgb(z.tint)));
    },

    // solid = nearly opaque glass (pause screen, where the game shows behind)
    _pillGrad(ctx, h, solid) {
      const idle = ctx.createLinearGradient(0, 0, 0, h);
      idle.addColorStop(0, solid ? 'rgba(44,48,112,0.9)' : 'rgba(60,66,140,0.50)');
      idle.addColorStop(1, solid ? 'rgba(12,13,40,0.93)' : 'rgba(14,16,46,0.70)');
      const act = ctx.createLinearGradient(0, 0, 0, h);
      act.addColorStop(0, 'rgba(255,214,120,0.44)');
      act.addColorStop(0.55, 'rgba(214,90,150,0.34)');
      act.addColorStop(1, 'rgba(106,47,168,0.52)');
      return { idle, act };
    },

    _layout(g) {
      const PAL = ASCENT.PAL, Z = ASCENT.ZONES;
      const ctx = (ASCENT.Gfx && ASCENT.Gfx.ctx) || this._mctx;
      const w = Math.max(1, g.screenWidth || 1), h = Math.max(1, g.screenHeight || 1);
      const u = clamp(Math.min(w, h) / K.UNIT_BASE, K.UNIT_MIN, K.UNIT_MAX);
      const L = this._L || (this._L = {});
      const F = this._f, GR = this._grad, mc = this._mctx;
      const fnt = (wt, px) => wt + ' ' + (Math.round(Math.max(K.MIN_FONT_PX, px) * 10) / 10) + 'px ' + K.FAMILY;
      const measure = (font, s) => { mc.font = font; return mc.measureText(s).width; };
      L.w = w; L.h = h; L.u = u;
      const m = L.m = Math.max(10, 16 * u);

      // ---- shared type ----
      F.sub = fnt(500, 16 * u);
      F.hint = fnt(500, 13 * u);
      F.caps = fnt(700, 11.5 * u);
      L.lsN = 1.8 * u; L.lsS = L.lsN.toFixed(2) + 'px';
      L.lsWN = 4 * u; L.lsWS = L.lsWN.toFixed(2) + 'px';

      // ---- glass fills in unit space (0..1 top → bottom): _glass() maps them
      //      onto any panel height, so no per-frame gradients ----
      GR.glassDark = ctx.createLinearGradient(0, 0, 0, 1);    // stats / lists over the nebula
      GR.glassDark.addColorStop(0, 'rgba(22,22,58,0.86)');
      GR.glassDark.addColorStop(0.5, 'rgba(12,12,36,0.86)');
      GR.glassDark.addColorStop(1, 'rgba(8,8,26,0.9)');
      GR.glassPause = ctx.createLinearGradient(0, 0, 0, 1);   // pause side panel
      GR.glassPause.addColorStop(0, 'rgba(26,26,66,0.92)');
      GR.glassPause.addColorStop(1, 'rgba(9,9,28,0.94)');

      // ---- title screen ----
      L.wmF = Math.max(24, Math.min(150 * u, (w * 0.84) / 4.4));   // GIRAFFE cap size
      L.wmTop = Math.max(10 * u, h * 0.055);
      this._buildWordmark();
      const wmBottom = L.wmTop + this._wm.contentH;
      const nM = Math.max(1, (g.menuItems && g.menuItems.length) || 5);
      L.pillW = Math.min(420 * u, w * 0.86);
      L.pillH = 54 * u; L.pillGap = 14 * u;
      let total = nM * L.pillH + (nM - 1) * L.pillGap;
      let start = Math.max(wmBottom + 34 * u, h * 0.4);
      const limit = h - 34 * u - 54 * u;                 // footer line + best-time chip
      if (start + total > limit) {
        start = Math.max(wmBottom + 14 * u, limit - total);
        if (start + total > limit) {
          const s = clamp((limit - start) / total, 0.55, 1);
          L.pillH *= s; L.pillGap *= s; total *= s;
        }
      }
      L.pillX = (w - L.pillW) / 2;
      L.pillY0 = start;
      L.menuBestY = start + total + 38 * u;              // clear gap so it doesn't read as a button
      L.footY = h - 20 * u;
      F.pill = fnt(600, L.pillH * 0.38);
      F.chip = fnt(600, 14 * u);
      F.foot = fnt(500, 13 * u);
      F.tiny = fnt(500, 11.5 * u);
      GR.pillMenu = this._pillGrad(ctx, L.pillH);

      // The big title giraffe floats in the free space left of the buttons; on
      // narrow windows it shrinks into the bottom-left corner instead.
      const side = (w - L.pillW) / 2, colMid = start + total / 2;
      L.girWide = side >= K.TITLE_GIRAFFE_MIN_SIDE * u;
      if (L.girWide) {
        const S = L.girS = clamp(Math.min(side / 150, h / 230), 1.4, 9);
        L.girX = side * 0.5;
        L.girY = colMid + 40 * u;
        L.starX = L.girX + 60 * S;
        L.starY = L.girY - 54 * S;
      } else {
        const S = L.girS = clamp(side / 120, 1.0, 2.2);
        L.girX = Math.max(side * 0.5, 34 * S);
        L.girY = h - 60 * u - 40 * S;
        L.starX = L.girX + 42 * S;
        L.starY = L.girY - 62 * S;
      }
      L.girFacing = 1;

      // ---- sub-screens (options / best times / stats) ----
      L.titleSize = Math.max(18, Math.min(52 * u, (w - 2 * m) / 12.5));
      L.titleY = Math.max(34 * u, h * 0.075) + L.titleSize * 0.5;
      L.subY = L.titleY + L.titleSize * 0.8;
      L.contentTop = L.subY + 28 * u;
      L.hintY = h - 20 * u;
      L.backW = 168 * u; L.backH = 44 * u;
      L.backY = L.hintY - 16 * u - L.backH;
      L.contentBottom = L.backY - 16 * u;
      L.panelW = Math.min(700 * u, w - 2 * m);
      F.title = fnt(700, L.titleSize);
      F.back = fnt(600, L.backH * 0.38);
      GR.pillBack = this._pillGrad(ctx, L.backH);
      const T = L.titleSize;
      GR.title = ctx.createLinearGradient(0, -T * 0.45, 0, T * 0.45);
      GR.title.addColorStop(0, '#ffffff');
      GR.title.addColorStop(0.5, '#e2e8ff');
      GR.title.addColorStop(1, '#b9a2ff');

      // options
      L.optW = Math.min(620 * u, w - 2 * m); L.optH = 58 * u; L.optGap = 14 * u;
      L.optBackW = Math.min(300 * u, L.optW); L.optBackH = 50 * u;
      L.optX = (w - L.optW) / 2;
      const nO = (g.optionsItems && g.optionsItems.length) || 4;
      const rowsH = (nO - 1) * (L.optH + L.optGap);
      const optBlock = rowsH + 10 * u + L.optBackH + 44 * u;
      const optFree = L.hintY - 24 * u - L.contentTop - optBlock;
      L.optY0 = L.contentTop + Math.max(6 * u, optFree * 0.36);
      this._layoutPreview(g, L, u, m, rowsH, optFree, ctx);
      F.opt = fnt(600, L.optH * 0.33);
      F.optVal = fnt(600, L.optH * 0.27);
      F.optBack = fnt(600, L.optBackH * 0.38);
      F.pvName = fnt(700, 20 * u);
      GR.pillOpt = this._pillGrad(ctx, L.optH);
      GR.pillOptBack = this._pillGrad(ctx, L.optBackH);

      // best times
      F.rowTime = fnt(600, 20 * u);
      F.rowTenth = fnt(500, 14 * u);
      F.rowDate = fnt(500, 13.5 * u);
      F.rowRank = fnt(700, 14 * u);

      // stats & achievements
      L.tabH = 44 * u;
      L.tabW = Math.min(230 * u, (w - 2 * m - 12 * u) / 2);
      L.tabY = L.titleY + L.titleSize * 0.62 + 10 * u;
      L.achTop = L.tabY + L.tabH + 16 * u;
      F.tab = fnt(600, L.tabH * 0.36);
      GR.pillTab = this._pillGrad(ctx, L.tabH);
      F.statLabel = fnt(500, 15 * u);
      F.statVal = fnt(600, 17 * u);
      F.achName = fnt(700, 18 * u);
      F.achDesc = fnt(500, 13.5 * u);
      F.achCount = fnt(600, 15 * u);
      L.achBarW = Math.max(10, Math.min(760 * u, w - 2 * m) - 150 * u - 84 * u);
      GR.achBar = ctx.createLinearGradient(0, 0, L.achBarW, 0);
      GR.achBar.addColorStop(0, '#ff9a4a');
      GR.achBar.addColorStop(0.5, '#ffd35c');
      GR.achBar.addColorStop(1, '#fff2c4');

      // ---- pause ----
      const nP = (g.pauseItems && g.pauseItems.length) || 4;
      L.pzW = Math.min(300 * u, w - 2 * m); L.pzH = 50 * u; L.pzGap = 12 * u;
      const pillsH = nP * L.pzH + (nP - 1) * L.pzGap;
      const CP_W = 668, CP_H = 380, RC_H = 262;            // side panel design size (units)
      L.pzWide = w >= L.pzW + 40 * u + CP_W * u + 2 * m;
      const head = T + 34 * u;                                // title + subtitle block
      // stacked (narrow) layout: shrink the side panel to fit both width and height
      const stackRoom = h - 2 * m - 26 * u - head - pillsH - 20 * u;
      const fs = L.cpFs = L.pzWide
        ? clamp((h - 2 * m - 26 * u - head) / (CP_H * u), 0.5, 1)
        : clamp(Math.min((w - 2 * m) / (CP_W * u), stackRoom / (CP_H * u)), 0.5, 1);
      L.cpW = CP_W * u * fs; L.cpH = CP_H * u * fs; L.rcH = RC_H * u * fs;
      let y0;
      if (L.pzWide) {
        const groupW = L.pzW + 40 * u + L.cpW;
        const groupH = head + Math.max(pillsH, L.cpH);
        y0 = Math.max(m, (h - groupH) / 2);
        L.pzX = (w - groupW) / 2;
        L.pzY0 = y0 + head;
        L.cpX = L.pzX + L.pzW + 40 * u;
        L.cpY = L.pzY0;
      } else {
        const groupH = head + pillsH + 20 * u + L.cpH;
        y0 = Math.max(m, (h - groupH) / 2);
        L.pzX = (w - L.pzW) / 2;
        L.pzY0 = y0 + head;
        L.cpX = (w - L.cpW) / 2;
        L.cpY = L.pzY0 + pillsH + 20 * u;
      }
      L.pzTitleY = y0 + T * 0.5;
      L.pzSubY = L.pzTitleY + T * 0.8;
      F.pz = fnt(600, L.pzH * 0.38);
      GR.pillPause = this._pillGrad(ctx, L.pzH, true);
      const su = u * fs;
      F.cpHead = fnt(700, 12 * su);
      F.cpChip = fnt(600, 12.5 * su);
      F.cpLabel = fnt(500, 14.5 * su);
      F.cpSub = fnt(500, 11.5 * su);
      F.rcZone = fnt(700, 24 * su);
      F.rcFlavor = fnt(500, 13.5 * su);
      F.rcLabel = fnt(700, 11.5 * su);
      F.rcVal = fnt(600, 17 * su);
      GR.pauseVig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.78);
      GR.pauseVig.addColorStop(0, 'rgba(5,4,13,0)');
      GR.pauseVig.addColorStop(1, 'rgba(5,4,13,0.55)');

      // ---- HUD ----
      L.tpW = 172 * u; L.tpH = 70 * u; L.tpY = m;
      F.timer = fnt(600, 30 * u);
      F.hudSmall = fnt(500, 12.5 * u);
      F.hudCaps = fnt(700, 10.5 * u);
      mc.font = F.timer;
      let dw = 0;
      for (let d = 0; d < 10; d++) dw = Math.max(dw, mc.measureText(String(d)).width);
      L.digW = Math.max(4, dw);
      L.colW = Math.max(3, mc.measureText(':').width);
      L.dotW = Math.max(3, mc.measureText('.').width);

      L.trX = w - m - 12 * u;
      L.trTop = Math.max(L.tpY + L.tpH + 64 * u, h * 0.2);
      L.trBot = Math.min(h - 44 * u, Math.max(L.trTop + 120 * u, h * 0.84));
      if (L.trBot < L.trTop + 40) L.trBot = L.trTop + 40;
      F.track = fnt(600, 11.5 * u);
      F.pct = fnt(700, 12 * u);
      L.trLabW = L.trLabW || new Float32Array(16);        // zone-label widths (for their backing pills)
      for (let i = 0; i < Z.length && i < 16; i++) L.trLabW[i] = measure(F.track, K.ZONE_SHORT[i] || Z[i].name);
      L.headSize = 40 * u;
      GR.trackDim = ctx.createLinearGradient(0, L.trBot, 0, L.trTop);
      GR.trackLit = ctx.createLinearGradient(0, L.trBot, 0, L.trTop);
      for (let i = 0; i < Z.length; i++) {
        const off = clamp01(Z[i].from), rgb = hexRgb(Z[i].tint);
        GR.trackDim.addColorStop(off, 'rgba(' + rgb + ',0.32)');
        GR.trackLit.addColorStop(off, 'rgba(' + rgb + ',1)');
      }
      GR.trackDim.addColorStop(1, 'rgba(' + hexRgb(PAL.gold) + ',0.32)');
      GR.trackLit.addColorStop(1, '#fff2c4');

      L.zoneSize = Math.max(14, Math.min(38 * u, (w - 2 * m) / 11));
      L.annY = Math.max(66 * u, h * 0.13);
      F.zone = fnt(700, L.zoneSize);
      F.zoneCaps = fnt(700, 12.5 * u);
      F.zoneFlavor = fnt(500, 15 * u);
      GR.zone = [];
      for (let i = 0; i < Z.length; i++) {
        const zg = ctx.createLinearGradient(0, -L.zoneSize * 0.5, 0, L.zoneSize * 0.5);
        zg.addColorStop(0, '#ffffff');
        zg.addColorStop(0.55, Z[i].tint);
        zg.addColorStop(1, Z[i].tint);
        GR.zone.push(zg);
      }

      L.cardW = 256 * u; L.cardRowH = 25 * u;
      L.cardH = 40 * u + 6 * L.cardRowH + 10 * u;
      L.cardX = m;
      L.hudHintY = h - m - 7 * u;
      L.cardY = L.hudHintY - 20 * u - L.cardH;
      F.cardKey = fnt(600, 12 * u);
      F.cardLabel = fnt(500, 13.5 * u);

      L.toW = Math.min(470 * u, w - 2 * m); L.toH = 84 * u;
      L.toY = m + 6 * u;
      L.toYBelow = L.annY + L.zoneSize * 0.9 + 34 * u;
      F.toName = fnt(700, 20 * u);
      F.toDesc = fnt(500, 14 * u);

      L.toWinY = h - m - L.toH;                          // toast during the win: bottom edge

      // victory banner — lower half of the screen; the victory camera frames
      // the Acacia + munching giraffe at ~0.3 of the height above it
      L.vicSize = Math.max(22, Math.min(88 * u, (w - 2 * m) / 8.4));
      F.vic = fnt(700, L.vicSize);
      L.vicHalfW = measure(F.vic, 'STELLAR SNACK!') * 0.5;
      F.vicCaps = fnt(700, 13 * u);
      F.vicTime = fnt(600, 54 * u);
      F.vicLine = fnt(700, 23 * u);
      F.vicSmall = fnt(500, 14.5 * u);
      const V = L.vicSize;
      GR.vic = ctx.createLinearGradient(0, -V * 0.45, 0, V * 0.45);
      GR.vic.addColorStop(0, '#fffbe6');
      GR.vic.addColorStop(0.45, '#ffe07a');
      GR.vic.addColorStop(1, '#ff9f3d');
      // vertical offsets of the lines under the title (from the title centre)
      L.vcCapsDY = 0.62 * V + 12 * u;                    // "YOUR TIME"
      L.vcTimeDY = L.vcCapsDY + 37 * u;                  // 01:23.4
      L.vcLineDY = L.vcCapsDY + 86 * u;                  // NEW PERSONAL BEST! / Rank #n
      L.vcBestDY = L.vcLineDY + 27 * u;                  // Best: …
      L.vcPromptDY = L.vcLineDY + 60 * u;                // click to return
      const below = L.vcPromptDY + 10 * u;
      // title centre ≈ WIN_TITLE_Y of the height, raised if the block would reach
      // the bottom toast, but never so high the title pokes above WIN_TOP
      L.vcY = Math.max(h * K.WIN_TOP + 0.46 * V, Math.min(h * K.WIN_TITLE_Y, L.toWinY - 14 * u - below));
      L.vbTop = Math.max(h * K.WIN_TOP, L.vcY - V);
      L.vbBot = L.vcY + below + 24 * u;
      GR.band = ctx.createLinearGradient(0, L.vbTop, 0, L.vbBot);
      GR.band.addColorStop(0, 'rgba(5,4,13,0)');
      GR.band.addColorStop(0.2, 'rgba(5,4,13,0.5)');
      GR.band.addColorStop(0.8, 'rgba(5,4,13,0.5)');
      GR.band.addColorStop(1, 'rgba(5,4,13,0)');
      // sunburst rays radiate from the Acacia itself: clear at the core so the
      // tree stays untouched, brightest just outside its canopy, then fading
      L.sunR = Math.max(40, Math.min(w, h) * 0.5);
      GR.sun = ctx.createRadialGradient(0, 0, 0, 0, 0, L.sunR);
      GR.sun.addColorStop(0, 'rgba(255,224,140,0)');
      GR.sun.addColorStop(0.14, 'rgba(255,224,140,0.03)');
      GR.sun.addColorStop(0.32, 'rgba(255,214,120,0.24)');
      GR.sun.addColorStop(0.6, 'rgba(255,190,90,0.09)');
      GR.sun.addColorStop(1, 'rgba(255,170,70,0)');
      const rnd = prng(4242);
      L.vsp = new Float32Array(14 * 4);
      for (let i = 0; i < 14; i++) {
        const a = rnd() * TAU, rr = 0.8 + rnd() * 0.45;
        L.vsp[i * 4] = Math.cos(a) * (L.vicHalfW + 30 * u) * rr;
        L.vsp[i * 4 + 1] = Math.sin(a) * V * 0.78 * rr;
        L.vsp[i * 4 + 2] = rnd();
        L.vsp[i * 4 + 3] = (6 + rnd() * 9) * u;
      }

      this._buildHead();
      this._buildBadges();
    },

    // Options → live giraffe preview. Beside the panel when there's room (the
    // panel + preview are then centred together as one group, the giraffe
    // turned to look at the settings), above the panel on narrow windows with
    // spare height, hidden otherwise.
    _layoutPreview(g, L, u, m, rowsH, free, ctx) {
      const items = g.optionsItems || [], GR = this._grad;
      L.pvItem = -1;
      for (let i = 0; i < items.length; i++) if (items[i].key === 'giraffeSkin') L.pvItem = i;
      L.pvMode = 0;
      if (L.pvItem < 0) return;
      const bw = K.PV_BOX[0], bh = K.PV_BOX[1];
      const gap = K.PV_GAP * u, room = L.w - 2 * m - L.optW - gap;
      if (room >= K.PV_MIN_W * u) {
        L.pvMode = 1;
        const pw = Math.min(K.PV_W * u, room);
        L.optX = (L.w - (L.optW + gap + pw)) / 2;
        const top = L.optY0, bot = L.optY0 + rowsH + 10 * u + L.optBackH;   // rows + back button
        const capH = 52 * u, pedGap = 26 * u;           // name + tagline · pedestal gap
        const S = clamp(Math.min(pw * 0.66 / bw, (bot - top - capH - pedGap) * 0.86 / bh), 0.4, 8);
        const figH = bh * S, compH = figH + pedGap + capH;
        const y0 = top + Math.max(0, (bot - top - compH) / 2);
        L.pvS = S; L.pvFacing = -1;
        L.pvX = L.optX + L.optW + gap + pw / 2;
        L.pvY = y0 + figH / 2;
        L.pvPedY = y0 + figH + pedGap * 0.3;
        L.pvNameY = y0 + figH + pedGap + 18 * u;
        L.pvTagY = L.pvNameY + 24 * u;
        L.pvHx = L.pvX - pw / 2; L.pvHy = top; L.pvHw = pw; L.pvHh = bot - top;
        L.pvCap = true;
        // faint spotlight cone from above the column down to the pedestal
        const bt = top - 18 * u;
        L.pvBeamTop = bt;
        GR.pvBeam = ctx.createLinearGradient(0, bt, 0, L.pvPedY);
        GR.pvBeam.addColorStop(0, 'rgba(255,238,200,0)');
        GR.pvBeam.addColorStop(0.3, 'rgba(255,234,190,0.045)');
        GR.pvBeam.addColorStop(1, 'rgba(255,222,160,0.11)');
      } else if (free >= K.PV_ABOVE_MIN * u) {
        L.pvMode = 2;
        const boxH = Math.min(free - 20 * u, 210 * u);
        const S = clamp(boxH * 0.72 / bh, 0.3, 6);
        L.optY0 = L.contentTop + boxH + Math.max(6 * u, (free - boxH) * 0.3);
        L.pvS = S; L.pvFacing = 1;
        L.pvX = L.w / 2;
        L.pvY = L.contentTop + boxH * 0.46;
        L.pvPedY = L.pvY + bh * S * 0.5 + 4 * u;
        const hw = Math.min(L.w - 2 * m, bw * S * 1.8);
        L.pvHx = L.pvX - hw / 2; L.pvHy = L.contentTop; L.pvHw = hw; L.pvHh = boxH;
        L.pvCap = false;
      }
    },

    // The two-line lockup: letter-spaced starlight "COSMIC" over a big
    // "GIRAFFE" filled with giraffe hide, a tongue swoosh licking a star, and
    // the subtitle. Glow/outline/texture are baked here once per resize.
    _buildWordmark() {
      const L = this._L, PAL = ASCENT.PAL;
      const F = L.wmF, Fc = F * 0.44, Fs = Math.max(11, F * 0.145);
      const fam = K.FAMILY;
      const fontG = '700 ' + F.toFixed(1) + 'px ' + fam;
      const fontC = '700 ' + Fc.toFixed(1) + 'px ' + fam;
      const fontS = '500 ' + Fs.toFixed(1) + 'px ' + fam;
      const mc = this._mctx;

      mc.font = fontG;
      const wG = Math.max(F, mc.measureText('GIRAFFE').width);
      mc.font = fontC;
      const COS = 'COSMIC', cw = [];
      let wCraw = 0;
      for (let i = 0; i < COS.length; i++) { cw.push(mc.measureText(COS[i]).width); wCraw += cw[i]; }
      const track = clamp((wG * 0.74 - wCraw) / 5, Fc * 0.12, Fc * 0.75);
      const wC = wCraw + track * 5;
      const SUB = 'A Space Tongue Adventure', subTrack = Fs * 0.05;
      mc.font = fontS;
      const sw = [];
      let wS = 0;
      for (let i = 0; i < SUB.length; i++) { sw.push(mc.measureText(SUB[i]).width); wS += sw[i] + (i ? subTrack : 0); }
      const flour = Fs * 3.4, flourGap = Fs * 0.9;

      const pad = F * 0.36;
      // extra width on the right is room for the tongue curling past the "E"
      const contentW = Math.max(wG * 1.18, wC, wS + 2 * (flour + flourGap + Fs));
      const W = contentW + pad * 2;
      const yC = pad + 0.72 * Fc;                      // COSMIC baseline
      const yG = yC + 0.17 * F + 0.72 * F;             // GIRAFFE baseline
      const yS = yG + 0.46 * F + 0.78 * Fs;            // subtitle baseline
      const H = yS + 0.34 * Fs + pad;
      const cx = W / 2;

      const dpr = Math.min(K.CACHE_DPR_MAX, Math.max(1, ASCENT.dpr || 1));
      const sc = Math.max(0.5, Math.min(dpr, Math.sqrt(K.WORDMARK_MAX_PIXELS / (W * H))));
      const cv = this._cv.wm = sizeCanvas(this._cv.wm, W, H, sc);
      const lay = this._cv.layer = sizeCanvas(this._cv.layer, W, H, sc);
      const x = cv.getContext('2d'), t = lay.getContext('2d');
      x.textBaseline = 'alphabetic'; x.lineJoin = 'round'; x.lineCap = 'round';
      t.textBaseline = 'alphabetic';

      const cosmic = (c, stroke) => {
        let px = cx - wC / 2;
        c.textAlign = 'left';
        for (let i = 0; i < COS.length; i++) {
          if (stroke) c.strokeText(COS[i], px, yC); else c.fillText(COS[i], px, yC);
          px += cw[i] + track;
        }
      };

      // 1) soft outer glows (violet haze + warm core for GIRAFFE, cool for COSMIC)
      x.save();
      x.font = fontG; x.textAlign = 'center';
      x.shadowColor = 'rgba(150,80,255,0.75)'; x.shadowBlur = 0.6 * F * sc;
      x.fillStyle = '#b07cff'; x.fillText('GIRAFFE', cx, yG);
      x.shadowColor = 'rgba(255,170,80,0.9)'; x.shadowBlur = 0.22 * F * sc;
      x.fillStyle = '#ffbf5a'; x.fillText('GIRAFFE', cx, yG);
      x.font = fontC;
      x.shadowColor = 'rgba(110,190,255,0.9)'; x.shadowBlur = 0.32 * Fc * sc;
      x.fillStyle = '#bcd8ff'; cosmic(x, false);
      x.restore();

      // 2) the tongue swoosh (drawn before the letters so "G" hides its root)
      const tip = this._swoosh(x, cx, yG, wG, F, sc);

      // 3) dark outlines
      x.save();
      x.font = fontG; x.textAlign = 'center';
      x.strokeStyle = '#2b0d3d'; x.lineWidth = 0.1 * F; x.strokeText('GIRAFFE', cx, yG);
      x.font = fontC;
      x.strokeStyle = '#150f3c'; x.lineWidth = 0.14 * Fc; cosmic(x, true);
      x.restore();

      // 4) GIRAFFE fill: coat gradient + reticulated spots + gloss (on a layer,
      //    so 'source-atop' only paints inside the letters)
      const gy0 = yG - 0.74 * F, gy1 = yG + 0.02 * F, gh = gy1 - gy0;
      t.save();
      t.font = fontG; t.textAlign = 'center';
      const coat = t.createLinearGradient(0, gy0, 0, gy1);
      coat.addColorStop(0, '#fff1c0');
      coat.addColorStop(0.45, '#ffcb5e');
      coat.addColorStop(1, '#ee9533');
      t.fillStyle = coat; t.fillText('GIRAFFE', cx, yG);
      t.globalCompositeOperation = 'source-atop';
      this._spots(t, cx - wG / 2 - 0.1 * F, gy0 - 0.12 * F, wG + 0.2 * F, gh + 0.24 * F, F);
      const gl = t.createLinearGradient(0, gy0, 0, gy0 + gh * 0.5);
      gl.addColorStop(0, 'rgba(255,255,255,0.5)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      t.fillStyle = gl; t.fillRect(cx - wG, gy0 - 0.1 * F, wG * 2, gh * 0.5 + 0.1 * F);
      const sh = t.createLinearGradient(0, gy0 + gh * 0.55, 0, gy1);
      sh.addColorStop(0, 'rgba(160,60,10,0)');
      sh.addColorStop(1, 'rgba(160,60,10,0.32)');
      t.fillStyle = sh; t.fillRect(cx - wG, gy0 + gh * 0.55, wG * 2, gh * 0.5);
      t.restore();
      x.drawImage(lay, 0, 0, W, H);

      // 5) COSMIC fill: starlight gradient + gloss
      t.clearRect(0, 0, W, H);
      t.save();
      t.font = fontC;
      const st = t.createLinearGradient(0, yC - 0.74 * Fc, 0, yC);
      st.addColorStop(0, '#ffffff');
      st.addColorStop(0.55, '#d6e6ff');
      st.addColorStop(1, '#a98cff');
      t.fillStyle = st; cosmic(t, false);
      t.restore();
      x.drawImage(lay, 0, 0, W, H);

      // 6) subtitle, letter-spaced, with star-tipped flourishes
      x.save();
      x.font = fontS; x.textAlign = 'left';
      x.shadowColor = 'rgba(5,4,13,0.9)'; x.shadowBlur = Math.max(2, 0.35 * Fs) * sc;
      x.fillStyle = '#d8ccff';
      let px = cx - wS / 2;
      for (let i = 0; i < SUB.length; i++) { x.fillText(SUB[i], px, yS); px += sw[i] + subTrack; }
      x.shadowBlur = 0; x.shadowColor = 'rgba(0,0,0,0)';
      const fy = yS - 0.34 * Fs;
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const sx = cx + sgn * (wS / 2 + flourGap), x0 = sx + sgn * Fs * 0.55, x1 = x0 + sgn * flour;
        const lg = x.createLinearGradient(x0, 0, x1, 0);
        lg.addColorStop(0, 'rgba(216,204,255,0.85)');
        lg.addColorStop(1, 'rgba(216,204,255,0)');
        x.strokeStyle = lg; x.lineWidth = Math.max(1, Fs * 0.08);
        x.beginPath(); x.moveTo(x0, fy); x.lineTo(x1, fy); x.stroke();
        x.fillStyle = PAL.gold;
        x.beginPath(); sparkle(x, sx, fy, Fs * 0.3, 0.2); x.fill();
      }
      x.restore();

      // 7) the star at the tongue's tip
      x.save();
      x.shadowColor = 'rgba(255,200,90,0.95)'; x.shadowBlur = 0.12 * F * sc;
      x.fillStyle = '#fff3c0';
      x.beginPath(); sparkle(x, tip.x, tip.y, 0.085 * F, 0.2); x.fill();
      x.shadowBlur = 0; x.fillStyle = '#ffffff';
      x.beginPath(); x.arc(tip.x, tip.y, 0.018 * F, 0, TAU); x.fill();
      x.restore();

      // free the layer's pixels until the next rebuild
      lay.width = 1; lay.height = 1;

      this._wm = {
        cv, w: W, h: H, pad, F,
        contentH: yS + 0.34 * Fs - pad,
        glowY: (yC - 0.72 * Fc + yG) * 0.5,          // middle of the two words
        textW: wG,
        tipX: tip.x, tipY: tip.y,
        // twinkle points (cache-relative): over COSMIC's last C, the G, the A/F
        tw: [
          cx + wC / 2 - cw[5] * 0.25, yC - 0.78 * Fc,
          cx - wG / 2 + 0.1 * F, yG - 0.66 * F,
          cx + wG * 0.1, yG - 0.78 * F,
          cx - wC / 2 + cw[0] * 0.2, yC - 0.12 * Fc,
        ],
      };
    },

    // Reticulated giraffe patches: rounded blobs on a jittered brick grid,
    // leaving thin cream lines between them (painted 'source-atop').
    _spots(t, x0, y0, w, h, F) {
      const rnd = prng(20260929);
      const c = 0.25 * F;
      const cols = Math.ceil(w / c) + 1, rows = Math.ceil(h / (c * 0.9)) + 1;
      const vx = [0, 0, 0, 0, 0, 0], vy = [0, 0, 0, 0, 0, 0];
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const px = x0 + i * c + (j % 2) * c * 0.5 + (rnd() - 0.5) * c * 0.28;
          const py = y0 + j * c * 0.9 + (rnd() - 0.5) * c * 0.28;
          const rot = rnd() * TAU;
          for (let k = 0; k < 6; k++) {
            const a = rot + k / 6 * TAU, r = c * (0.44 + rnd() * 0.1);
            vx[k] = px + Math.cos(a) * r;
            vy[k] = py + Math.sin(a) * r * 0.9;
          }
          t.beginPath();
          t.moveTo((vx[0] + vx[1]) / 2, (vy[0] + vy[1]) / 2);
          for (let k = 1; k <= 6; k++) {
            const a = k % 6, b = (k + 1) % 6;
            t.quadraticCurveTo(vx[a], vy[a], (vx[a] + vx[b]) / 2, (vy[a] + vy[b]) / 2);
          }
          t.closePath();
          t.fillStyle = rnd() < 0.3 ? '#8e4314' : '#a8561d';
          t.fill();
        }
      }
    },

    // A tapered purple tongue: its root hides inside the "G", it dips under
    // the word and curls up past the "E" to lick a star. Returns the star spot.
    _swoosh(x, cx, yG, wG, F, sc) {
      const P = [cx - wG * 0.40, yG - 0.10 * F, cx - wG * 0.12, yG + 0.42 * F,
        cx + wG * 0.34, yG + 0.30 * F, cx + wG * 0.555, yG - 0.06 * F];
      const N = 48;
      const px = new Float32Array(N + 1), py = new Float32Array(N + 1);
      const nx = new Float32Array(N + 1), ny = new Float32Array(N + 1);
      for (let i = 0; i <= N; i++) {
        const s = i / N, a = 1 - s;
        px[i] = a * a * a * P[0] + 3 * a * a * s * P[2] + 3 * a * s * s * P[4] + s * s * s * P[6];
        py[i] = a * a * a * P[1] + 3 * a * a * s * P[3] + 3 * a * s * s * P[5] + s * s * s * P[7];
        const dx = 3 * a * a * (P[2] - P[0]) + 6 * a * s * (P[4] - P[2]) + 3 * s * s * (P[6] - P[4]);
        const dy = 3 * a * a * (P[3] - P[1]) + 6 * a * s * (P[5] - P[3]) + 3 * s * s * (P[7] - P[5]);
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        nx[i] = -dy / len; ny[i] = dx / len;          // +n points "down" for a rightward stroke
      }
      const half = (s, extra) => F * (0.058 - 0.02 * s) + extra;   // thick root → rounded tip
      const shape = (extra) => {
        x.beginPath();
        for (let i = 0; i <= N; i++) {
          const hw = half(i / N, extra);
          if (i) x.lineTo(px[i] + nx[i] * hw, py[i] + ny[i] * hw);
          else x.moveTo(px[i] + nx[i] * hw, py[i] + ny[i] * hw);
        }
        const hwT = half(1, extra), an = Math.atan2(ny[N], nx[N]);
        x.arc(px[N], py[N], Math.max(0, hwT), an, an + Math.PI, true);   // rounded tip
        for (let i = N; i >= 0; i--) {
          const hw = half(i / N, extra);
          x.lineTo(px[i] - nx[i] * hw, py[i] - ny[i] * hw);
        }
        x.closePath();
      };
      x.save();
      // outline + faint violet halo
      x.shadowColor = 'rgba(140,90,255,0.6)'; x.shadowBlur = 0.12 * F * sc;
      x.fillStyle = '#1a0d30'; shape(0.013 * F); x.fill();
      x.shadowBlur = 0; x.shadowColor = 'rgba(0,0,0,0)';
      // body
      const body = x.createLinearGradient(P[0], 0, P[6], 0);
      body.addColorStop(0, '#3a2266');
      body.addColorStop(0.6, '#5b3b92');
      body.addColorStop(1, '#7050ad');
      x.fillStyle = body; shape(0); x.fill();
      // centre groove
      x.beginPath();
      for (let i = 6; i <= N - 4; i++) { if (i === 6) x.moveTo(px[i], py[i]); else x.lineTo(px[i], py[i]); }
      x.strokeStyle = 'rgba(25,10,50,0.45)'; x.lineWidth = Math.max(0.5, 0.008 * F); x.stroke();
      // wet highlight along the upper edge
      x.beginPath();
      for (let i = 4; i <= N - 5; i++) {
        const hw = half(i / N, 0) * 0.5;
        if (i === 4) x.moveTo(px[i] - nx[i] * hw, py[i] - ny[i] * hw);
        else x.lineTo(px[i] - nx[i] * hw, py[i] - ny[i] * hw);
      }
      x.strokeStyle = 'rgba(190,160,255,0.75)'; x.lineWidth = Math.max(0.6, 0.012 * F); x.stroke();
      x.restore();
      // star sits just beyond the tip, nudged up (the lick)
      const tx = ny[N], ty = -nx[N];                  // unit tangent (n = tangent rotated +90°)
      const d = half(1, 0) + 0.1 * F;
      return { x: px[N] + tx * d, y: py[N] + ty * d - 0.03 * F };
    },

    // Tiny giraffe head (snout up-left, tongue out) for the altitude marker.
    _buildHead() {
      const L = this._L, PAL = ASCENT.PAL, S0 = L.headSize;
      const sc = Math.min(K.CACHE_DPR_MAX, Math.max(1, ASCENT.dpr || 1));
      const cv = this._cv.head = sizeCanvas(this._cv.head, S0, S0, sc);
      const x = cv.getContext('2d');
      const k = S0 / 40;                                  // design box is 40×40
      x.scale(k, k);
      x.lineCap = 'round'; x.lineJoin = 'round';
      // neck (outline, then coat)
      x.beginPath(); x.moveTo(29, 40); x.quadraticCurveTo(25, 30, 21, 22);
      x.strokeStyle = PAL.spotsDark; x.lineWidth = 9.5; x.stroke();
      x.strokeStyle = PAL.hide; x.lineWidth = 7; x.stroke();
      x.fillStyle = PAL.spots;
      x.beginPath(); x.ellipse(25.5, 31.5, 1.8, 1.4, 0.4, 0, TAU); x.fill();
      x.beginPath(); x.ellipse(24, 26, 1.4, 1.1, 0.4, 0, TAU); x.fill();
      // head frame: rotate so the snout (local −x) points up-left
      x.save();
      x.translate(19, 18); x.rotate(0.64);
      // ossicones (behind the head)
      x.strokeStyle = PAL.spotsDark; x.lineWidth = 2.2;
      x.beginPath(); x.moveTo(2, -4); x.lineTo(3.5, -10.5); x.moveTo(5, -3.5); x.lineTo(8, -9.5); x.stroke();
      x.fillStyle = PAL.spotsDark;
      x.beginPath(); x.arc(3.5, -10.5, 1.9, 0, TAU); x.arc(8, -9.5, 1.9, 0, TAU); x.fill();
      // ear
      x.beginPath(); x.ellipse(8.5, -2.5, 4, 1.8, -0.5, 0, TAU);
      x.fillStyle = PAL.spotsDark; x.fill();
      x.beginPath(); x.ellipse(8.5, -2.5, 3, 1.1, -0.5, 0, TAU);
      x.fillStyle = PAL.hideLight; x.fill();
      // tongue curling out of the mouth
      x.beginPath(); x.moveTo(-10, 2.2); x.quadraticCurveTo(-14.5, 5, -16.5, 1.5);
      x.strokeStyle = PAL.tongueDark; x.lineWidth = 3.4; x.stroke();
      x.strokeStyle = PAL.tongueHi; x.lineWidth = 2; x.stroke();
      // skull
      x.beginPath(); x.ellipse(0, 0, 10.8, 7, 0, 0, TAU); x.fillStyle = PAL.spotsDark; x.fill();
      x.beginPath(); x.ellipse(0, 0, 9.6, 5.9, 0, 0, TAU); x.fillStyle = PAL.hide; x.fill();
      x.beginPath(); x.ellipse(-6.6, 0.9, 4.2, 4, 0, 0, TAU); x.fillStyle = PAL.hideLight; x.fill();
      x.beginPath(); x.ellipse(3.2, 1.2, 2.2, 1.7, 0.3, 0, TAU); x.fillStyle = PAL.spots; x.fill();
      // eye + nostril
      x.fillStyle = '#1b0f08';
      x.beginPath(); x.arc(-1.8, -2.4, 1.35, 0, TAU); x.fill();
      x.beginPath(); x.arc(-9.4, -0.6, 0.7, 0, TAU); x.fill();
      x.fillStyle = '#ffffff';
      x.beginPath(); x.arc(-2.2, -2.8, 0.45, 0, TAU); x.fill();
      x.restore();
      L.headAx = 19 / 40; L.headAy = 18 / 40;           // head centre within the sprite
    },

    // Achievement badges: glowing gold star medal / dim locked disc.
    _buildBadges() {
      const L = this._L, B = Math.max(16, 72 * L.u);
      const sc = Math.min(K.CACHE_DPR_MAX, Math.max(1, ASCENT.dpr || 1));
      const c = B / 2, R = 0.34 * B;
      // unlocked
      let cv = this._cv.badgeOn = sizeCanvas(this._cv.badgeOn, B, B, sc);
      let x = cv.getContext('2d');
      let gr = x.createRadialGradient(c, c, R * 0.7, c, c, B * 0.5);
      gr.addColorStop(0, 'rgba(255,200,90,0.5)');
      gr.addColorStop(1, 'rgba(255,200,90,0)');
      x.fillStyle = gr; x.fillRect(0, 0, B, B);
      gr = x.createRadialGradient(c - R * 0.35, c - R * 0.4, R * 0.1, c, c, R);
      gr.addColorStop(0, '#fff3c0');
      gr.addColorStop(0.6, '#ffc94a');
      gr.addColorStop(1, '#d4851f');
      x.beginPath(); x.arc(c, c, R, 0, TAU); x.fillStyle = gr; x.fill();
      x.lineWidth = 0.05 * B; x.strokeStyle = 'rgba(255,246,210,0.95)'; x.stroke();
      x.beginPath(); star5(x, c, c + 0.01 * B, 0.2 * B, 0.085 * B, -Math.PI / 2);
      x.fillStyle = '#fffdf2'; x.fill();
      x.lineWidth = 0.014 * B; x.strokeStyle = 'rgba(160,80,10,0.55)'; x.stroke();
      // locked
      cv = this._cv.badgeOff = sizeCanvas(this._cv.badgeOff, B, B, sc);
      x = cv.getContext('2d');
      x.beginPath(); x.arc(c, c, R, 0, TAU);
      x.fillStyle = 'rgba(22,26,64,0.92)'; x.fill();
      x.lineWidth = 0.035 * B; x.strokeStyle = 'rgba(150,165,220,0.45)'; x.stroke();
      x.beginPath(); star5(x, c, c + 0.01 * B, 0.19 * B, 0.08 * B, -Math.PI / 2);
      x.lineJoin = 'round'; x.lineWidth = 0.025 * B; x.strokeStyle = 'rgba(160,175,228,0.55)'; x.stroke();
    },

    // -------------------------------------------------------------------------
    // Shared drawing pieces
    // -------------------------------------------------------------------------
    _hotBegin(g) { this._hs.length = 0; this._hsN = 0; g.hotspots = this._hs; },

    _hot(x, y, w, h, selKey, sel, action) {
      let o = this._hsPool[this._hsN];
      if (!o) { o = { x: 0, y: 0, w: 0, h: 0, selKey: undefined, sel: undefined, action: null }; this._hsPool[this._hsN] = o; }
      this._hsN++;
      o.x = x; o.y = y; o.w = w; o.h = h; o.selKey = selKey; o.sel = sel; o.action = action;
      this._hs.push(o);
    },

    _mouseIn(x, y, w, h) {
      const In = ASCENT.Input, mx = In.mouseX, my = In.mouseY;
      return mx >= x && mx <= x + w && my >= y && my <= y + h;
    },

    // Letter-spaced small caps. Canvas letterSpacing (where supported) also
    // pads after the last glyph, so centred / right-aligned text is nudged back.
    _caps(ctx, s, x, y, align, lsN, lsS) {
      ctx.textAlign = align;
      if (this._lsOK) {
        ctx.letterSpacing = lsS;
        x += align === 'center' ? lsN * 0.5 : align === 'right' ? lsN : 0;
      }
      ctx.fillText(s, x, y);
      if (this._lsOK) ctx.letterSpacing = '0px';
    },

    // Soft dark glass panel.
    _panel(ctx, x, y, w, h, r) {
      rrect(ctx, x, y, w, h, r);
      ctx.fillStyle = ASCENT.PAL.uiPanel; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,190,255,0.20)'; ctx.stroke();
      if (w > 2 * r + 4) {          // top sheen (skipped on capsules — it'd be a dot)
        ctx.beginPath(); ctx.moveTo(x + r, y + 1.5); ctx.lineTo(x + w - r, y + 1.5);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.stroke();
      }
    },

    // Denser glass panel filled with a unit-space gradient (GR.glassDark /
    // GR.glassPause). The path is built first, then the transform maps the
    // 0..1 gradient onto this panel's height, so no gradient is made per frame.
    _glass(ctx, x, y, w, h, r, grad) {
      h = Math.max(1, h);
      rrect(ctx, x, y, w, h, r);
      ctx.save();
      ctx.translate(x, y); ctx.scale(1, h);
      ctx.fillStyle = grad; ctx.fill();
      ctx.restore();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,190,255,0.24)'; ctx.stroke();
      if (w > 2 * r + 4) {
        ctx.beginPath(); ctx.moveTo(x + r, y + 1.5); ctx.lineTo(x + w - r, y + 1.5);
        ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.stroke();
      }
    },

    // Glassy capsule button. a = selection amount 0..1 (eased).
    // flags: 1 = back chevron, 2 = plain (no grow, no sparkle bullets).
    _pill(ctx, x, y, w, h, a, gr, label, font, flags) {
      const u = this._L.u, PAL = ASCENT.PAL, plain = flags === 2;
      a = clamp01(a || 0);
      const r = h * 0.5, on = a > 0.01;
      ctx.save();
      ctx.translate(x + w * 0.5, y + h * 0.5);
      if (on && !plain) { const s = 1 + K.PILL_GROW * a; ctx.scale(s, s); }
      ctx.translate(-w * 0.5, -h * 0.5);
      if (on) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, this._glow.gold, w * 0.5, h * 0.5, w + h * 1.8, h * 2.8, K.PILL_GLOW * a);
        ctx.globalCompositeOperation = 'source-over';
      }
      rrect(ctx, 0, 0, w, h, r);
      ctx.globalAlpha = 1; ctx.fillStyle = gr.idle; ctx.fill();
      if (on) { ctx.globalAlpha = a; ctx.fillStyle = gr.act; ctx.fill(); }
      ctx.globalAlpha = 1 - a * 0.7;
      ctx.lineWidth = Math.max(1, 1.1 * u); ctx.strokeStyle = 'rgba(175,195,255,0.30)'; ctx.stroke();
      if (on) { ctx.globalAlpha = a; ctx.lineWidth = Math.max(1.2, 1.7 * u); ctx.strokeStyle = GOLD_BORDER; ctx.stroke(); }
      // glass sheen along the top
      ctx.globalAlpha = 0.14 + 0.22 * a;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, 1.2 * u); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r * 0.9, h * 0.16); ctx.lineTo(w - r * 0.9, h * 0.16); ctx.stroke();
      if (label) {
        ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        let lx = w * 0.5;
        if (flags === 1) {           // back chevron to the left of the label
          const tw = ctx.measureText(label).width, cs = h * 0.13, chx = lx - tw * 0.5 - h * 0.18;
          lx += h * 0.14;
          ctx.globalAlpha = 0.7 + 0.3 * a;
          ctx.beginPath(); ctx.moveTo(chx + cs * 0.4, h * 0.5 - cs); ctx.lineTo(chx - cs * 0.6, h * 0.5); ctx.lineTo(chx + cs * 0.4, h * 0.5 + cs);
          ctx.strokeStyle = a > 0.5 ? TEXT_HOT : TEXT_IDLE; ctx.lineWidth = Math.max(1.4, 2 * u); ctx.lineJoin = 'round'; ctx.stroke();
        }
        const ty = h * 0.53;
        if (a < 0.98) { ctx.globalAlpha = 1 - a; ctx.fillStyle = TEXT_IDLE; ctx.fillText(label, lx, ty); }
        if (a > 0.02) { ctx.globalAlpha = a; ctx.fillStyle = TEXT_HOT; ctx.fillText(label, lx, ty); }
      }
      if (a > 0.05 && !plain && flags !== 1) {   // sparkle bullets
        const sr = h * 0.15 * a;
        ctx.globalAlpha = a; ctx.fillStyle = PAL.gold;
        ctx.beginPath(); sparkle(ctx, h * 0.62, h * 0.5, sr, 0.22); sparkle(ctx, w - h * 0.62, h * 0.5, sr, 0.22); ctx.fill();
      }
      ctx.restore();
    },

    // Screen title: glow sprite + dark outline + luminous gradient fill.
    _title(ctx, g, text, cx, cy, sub, subY) {
      const L = this._L, T = L.titleSize;
      ctx.font = this._f.title;
      const tw = ctx.measureText(text).width;
      const maxW = L.w - 2 * L.m, s = tw > maxW ? maxW / tw : 1;
      const pulse = 0.5 + 0.5 * Math.sin((g.shaderTime || 0) * 1.4);
      ctx.save();
      ctx.translate(cx, cy);
      if (s < 1) ctx.scale(s, s);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this._glow.violet, 0, 0, tw * 1.35 + T, T * 2.4, 0.26 + 0.08 * pulse);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      ctx.lineWidth = T * 0.12; ctx.strokeStyle = '#150b33'; ctx.strokeText(text, 0, 0);
      ctx.fillStyle = this._grad.title; ctx.fillText(text, 0, 0);
      ctx.restore();
      if (sub) {
        ctx.font = this._f.sub; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(200,208,245,0.72)';
        ctx.fillText(sub, cx, subY, L.w - 2 * L.m);
      }
    },

    _hint(ctx, text) {
      const L = this._L;
      ctx.font = this._f.hint; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(170,180,215,0.58)';
      ctx.fillText(text, L.w / 2, L.hintY, L.w - 2 * L.m);
    },

    _backButton(ctx, g) {
      const L = this._L, x = (L.w - L.backW) / 2, y = L.backY;
      const hov = this._mouseIn(x, y, L.backW, L.backH);
      this._pill(ctx, x, y, L.backW, L.backH, hov ? 0.85 : 0, this._grad.pillBack, 'BACK', this._f.back, 1);
      this._hot(x, y, L.backW, L.backH, undefined, undefined, this._backAct);
    },

    _bestLabel(best) {
      if (best !== this._bV) {
        this._bV = best;
        this._bS = best != null ? fmtRun(best) : '—';
        this._bLabel = 'Best: ' + this._bS;
      }
      return this._bLabel;
    },

    // Just the time ("01:23.4"), or "—" with no best yet.
    _bestStr(best) { this._bestLabel(best); return this._bS; },

    // Best-times row i: "01:23" + ".4" (tenths drawn smaller), cached per value.
    _btRow(i, secs) {
      let r = this._bt[i];
      if (!r) r = this._bt[i] = { v: NaN, main: '', tenth: '' };
      if (r.v !== secs) {
        const s = fmtRun(secs), d = s.lastIndexOf('.');
        r.v = secs; r.main = s.slice(0, d); r.tenth = s.slice(d);
      }
      return r;
    },

    _timerStr(s) {
      const k = Math.floor((s > 0 && isFinite(s) ? s : 0) * 10);
      if (k !== this._tK) { this._tK = k; this._tS = fmtRun(s); }
      return this._tS;
    },

    _pctStr(p) {
      const k = Math.floor(clamp01(p) * 100 + 1e-6);
      if (k !== this._pK) { this._pK = k; this._pS = k + '%'; }
      return this._pS;
    },

    // -------------------------------------------------------------------------
    // Title screen
    // -------------------------------------------------------------------------
    drawMenu(ctx, g) {
      if (ASCENT.Space && ASCENT.Space.drawMenuBack) ASCENT.Space.drawMenuBack(ctx, g);
      const L = this._L;
      if (!L) return;
      this._hotBegin(g);
      const t = g.menuTime || 0;
      ctx.save();
      try {
        ctx.textBaseline = 'middle';
        this._titleGiraffe(ctx, g, t);
        this._titleWordmark(ctx, g, t);
        const items = g.menuItems || [], hv = this._hv.menu;
        for (let i = 0; i < items.length; i++) {
          const y = L.pillY0 + i * (L.pillH + L.pillGap);
          this._pill(ctx, L.pillX, y, L.pillW, L.pillH, hv[i] || 0, this._grad.pillMenu, items[i].text, this._f.pill, 0);
          this._hot(L.pillX, y, L.pillW, L.pillH, 'selectedMenuItem', i, items[i].action);
        }
        this._menuFooter(ctx, g);
      } finally { ctx.restore(); }
    },

    // A big giraffe drifting in space, lazily licking a twinkling star.
    _titleGiraffe(ctx, g, t) {
      const L = this._L, u = L.u, S = L.girS;
      const bob = Math.sin(t * 1.05) * 9 * u, sway = Math.sin(t * 0.63) * 0.05;
      const gx = L.girX, gy = L.girY + bob;
      const sx = L.starX + Math.cos(t * 0.8) * 5 * u;
      const sy = L.starY + Math.sin(t * 1.2) * 7 * u + bob * 0.4;
      const ph = (t % K.LICK_PERIOD) / K.LICK_PERIOD;
      const squish = ph < 0.14 ? Math.sin(ph / 0.14 * Math.PI) : 0;   // the slurp
      const tw = Math.sin(t * 5.1);
      const r = 15 * u * (1 + 0.08 * tw);

      // back light: violet haze around the giraffe, warm halo around the star
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this._glow.violet, gx, gy - 10 * S, 170 * S, 170 * S, 0.14);
      glow(ctx, this._glow.gold, sx, sy, 130 * u, 130 * u, 0.5 + 0.12 * tw + 0.25 * squish);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // the star (squishes when licked)
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(t * 0.35);
      ctx.scale(1 + 0.25 * squish, 1 - 0.2 * squish);
      ctx.fillStyle = '#fff1c4';
      ctx.beginPath(); sparkle(ctx, 0, 0, r * 1.7, 0.22); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, TAU); ctx.fill();
      ctx.restore();

      // the giraffe (Giraffe module), tongue aimed at the star in its own frame
      const o = this._portraitOpts;
      o.facing = L.girFacing;
      const dx = sx - gx, dy = sy - gy, c = Math.cos(-sway), s = Math.sin(-sway);
      o.tongueTo.x = dx * c - dy * s;
      o.tongueTo.y = dx * s + dy * c;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(sway);
      try { ASCENT.Giraffe.drawPortrait(ctx, 0, 0, S, t, o); }
      catch (e) { this._warnOnce('Giraffe.drawPortrait threw', e); }
      ctx.restore();

      // front twinkle + slurp motes, so the star still reads as a light source
      // even where the tongue tip covers its core
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this._glow.white, sx, sy, r * 2.4, r * 2.4, 0.55 + 0.25 * squish);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-t * 0.5);
      ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 7.3);
      ctx.fillStyle = '#fff1b8';
      ctx.beginPath(); sparkle(ctx, 0, 0, r * 2.6 * (0.85 + 0.15 * Math.sin(t * 3.1)), 0.07); ctx.fill();
      ctx.restore();
      if (ph > 0.08 && ph < 0.5) {
        const k = (ph - 0.08) / 0.42, d = (10 + 46 * easeOut(k)) * u, mr = 4.5 * u * (1 - k);
        ctx.globalAlpha = 1 - k;
        ctx.fillStyle = '#ffe59a';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -2.6 + i * 0.75 + Math.sin(i * 12.9898) * 0.2;
          sparkle(ctx, sx + Math.cos(a) * d, sy + Math.sin(a) * d, mr, 0.25);
        }
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },

    _titleWordmark(ctx, g, t) {
      const L = this._L, W = this._wm, u = L.u;
      if (!W) return;
      const x = (L.w - W.w) / 2, y = L.wmTop - W.pad + Math.sin(t * 0.9) * 3 * u;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this._glow.violet, L.w / 2, y + W.glowY, W.textW * 1.3, W.F * 2.4, 0.2 + 0.1 * (g.titlePulse || 0));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(W.cv, x, y, W.w, W.h);

      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#fff6d8';
      // twinkles that flash across the letters in turn
      const n = W.tw.length / 2;
      for (let i = 0; i < n; i++) {
        const cyc = (t * 0.42 + i / n) % 1;
        if (cyc > 0.2) continue;
        const a = Math.sin(cyc / 0.2 * Math.PI);
        ctx.globalAlpha = a;
        ctx.beginPath(); sparkle(ctx, x + W.tw[i * 2], y + W.tw[i * 2 + 1], W.F * 0.13 * (0.6 + 0.4 * a), 0.1); ctx.fill();
      }
      // the swoosh star keeps pulsing
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * 4.2);
      ctx.beginPath(); sparkle(ctx, x + W.tipX, y + W.tipY, W.F * 0.16, 0.07); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    },

    _menuFooter(ctx, g) {
      const L = this._L, u = L.u, F = this._f, PAL = ASCENT.PAL;
      const best = ASCENT.Save.bestTime();
      if (best != null) {
        const s = this._bestLabel(best);
        ctx.font = F.chip;
        const tw = ctx.measureText(s).width;
        const ch = 30 * u, cw = tw + 50 * u, x0 = L.w / 2 - cw / 2, cy = L.menuBestY;
        rrect(ctx, x0, cy - ch / 2, cw, ch, ch / 2);
        ctx.fillStyle = 'rgba(12,14,40,0.55)'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,211,92,0.38)'; ctx.stroke();
        ctx.fillStyle = PAL.gold;
        ctx.beginPath(); star5(ctx, x0 + 18 * u, cy, 7 * u, 3 * u, -Math.PI / 2); ctx.fill();
        ctx.textAlign = 'left'; ctx.fillStyle = '#ffe9a8';
        ctx.fillText(s, x0 + 32 * u, cy + 0.5);
      }
      ctx.font = F.foot; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(170,180,215,0.62)';
      ctx.fillText('Arrow keys / mouse · Enter or click', L.w / 2, L.footY);
      ctx.font = F.tiny; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(170,180,215,0.42)';
      ctx.fillText('the sequel to Cosmic Ascent', L.w - L.m, L.footY);
    },

    // -------------------------------------------------------------------------
    // Options
    // -------------------------------------------------------------------------
    drawOptions(ctx, g) {
      if (ASCENT.Space && ASCENT.Space.drawMenuBack) ASCENT.Space.drawMenuBack(ctx, g);
      const L = this._L;
      if (!L) return;
      this._hotBegin(g);
      const u = L.u, F = this._f, GR = this._grad, hv = this._hv.opt;
      ctx.save();
      try {
        ctx.textBaseline = 'middle';
        this._title(ctx, g, 'OPTIONS', L.w / 2, L.titleY, 'Tune your flight', L.subY);
        const items = g.optionsItems || [];
        if (L.pvMode) this._giraffePreview(ctx, g);
        let y = L.optY0;
        for (let i = 0; i < items.length; i++) {
          const it = items[i], a = hv[i] || 0;
          if (it.type === 'action') {
            y += 10 * u;
            const bx = L.optX + (L.optW - L.optBackW) / 2;   // centred under the panel
            this._pill(ctx, bx, y, L.optBackW, L.optBackH, a, GR.pillOptBack, it.text, F.optBack, 0);
            this._hot(bx, y, L.optBackW, L.optBackH, 'selectedOptionIndex', i, this._optAct[i]);
            y += L.optBackH + L.optGap;
          } else {
            this._pill(ctx, L.optX, y, L.optW, L.optH, a, GR.pillOpt, null, null, 2);
            this._optRow(ctx, it, i, L.optX, y, a);
            // ‹ steps back (first match wins), the rest of the row steps forward
            if (it.type === 'cycle') {
              this._hot(this._cycLx - 27 * u, y, 34 * u, L.optH, 'selectedOptionIndex', i, this._optActBack[i]);
            }
            this._hot(L.optX, y, L.optW, L.optH, 'selectedOptionIndex', i, this._optAct[i]);
            y += L.optH + L.optGap;
          }
        }
        const sel = items[g.selectedOptionIndex];
        const desc = sel ? (sel.type === 'action' ? K.OPT_DESC.back : K.OPT_DESC[sel.key]) : '';
        if (desc) {
          // centred under the panel (which sits left of centre beside the preview)
          const wide = L.pvMode === 1;
          ctx.font = F.sub; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(200,208,245,0.66)';
          ctx.fillText(desc, wide ? L.optX + L.optW / 2 : L.w / 2, y + 18 * u, wide ? L.optW : L.w - 2 * L.m);
        }
        this._hint(ctx, '↑/↓ choose · ←/→ or click to change · Esc back');
      } finally { ctx.restore(); }
    },

    // The selected giraffe style, floating in a soft spotlight beside (or
    // above) the options, looking at them. Pops when the style changes; hover
    // selects the GIRAFFE row and a click flips to the next style (the
    // caption's ‹ flips back).
    _giraffePreview(ctx, g) {
      const L = this._L, u = L.u, F = this._f, GR = this._grad, PAL = ASCENT.PAL;
      const t = g.menuTime || 0, S = L.pvS, fc = L.pvFacing;
      const skin = ASCENT.Save.options.giraffeSkin;
      const it = (g.optionsItems || [])[L.pvItem];
      const sel = clamp01(this._hv.opt[L.pvItem] || 0);
      const k = clamp01(this._pvPop), fresh = 1 - k;
      // quick squash-free scale bounce: 0.62 → ~1.08 → 1
      const c1 = 2.6, q = k - 1, back = 1 + (c1 + 1) * q * q * q + c1 * q * q;
      const pop = 0.62 + 0.38 * back;
      const bw = K.PV_BOX[0] * S, bh = K.PV_BOX[1] * S;
      const cx = L.pvX, cy = L.pvY + Math.sin(t * 1.1) * 5 * u;

      // spotlight: faint cone from above, warm pool + violet haze behind
      ctx.globalCompositeOperation = 'lighter';
      if (L.pvCap && GR.pvBeam) {
        const tw = 16 * u, bwid = bw * 0.62;
        ctx.globalAlpha = 0.75 + 0.25 * sel;
        ctx.beginPath();
        ctx.moveTo(cx - tw, L.pvBeamTop); ctx.lineTo(cx + tw, L.pvBeamTop);
        ctx.lineTo(L.pvX + bwid, L.pvPedY); ctx.lineTo(L.pvX - bwid, L.pvPedY);
        ctx.closePath();
        ctx.fillStyle = GR.pvBeam; ctx.fill();
      }
      glow(ctx, this._glow.violet, cx, cy, bw * 2.6, bh * 2.1, 0.2 + 0.06 * sel);
      glow(ctx, this._glow.gold, cx, cy - bh * 0.05, bw * 1.7, bh * 1.35, 0.17 + 0.08 * sel + 0.5 * fresh * fresh);
      // pedestal of light under the hooves
      glow(ctx, this._glow.gold, L.pvX, L.pvPedY, bw * 1.25, bw * 0.28, 0.32 + 0.12 * sel);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.3 + 0.2 * sel;
      ctx.beginPath(); ctx.ellipse(L.pvX, L.pvPedY, Math.max(0, bw * 0.46), Math.max(0, bw * 0.085), 0, 0, TAU);
      ctx.lineWidth = Math.max(1, 1.5 * u); ctx.strokeStyle = PAL.gold; ctx.stroke();

      // pop ring on a style change
      if (fresh > 0.01) {
        ctx.globalAlpha = 0.55 * fresh;
        ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, bh * (0.28 + 0.42 * easeOut(k))), 0, TAU);
        ctx.lineWidth = Math.max(1, 2.5 * u * fresh + 0.5); ctx.strokeStyle = '#fff1c4'; ctx.stroke();
      }

      // the giraffe (anchored so its visual centre sits on the spotlight)
      const off = K.PV_CENTRE[skin] || K.PV_CENTRE.cartoon;
      const o = this._pvOpts;
      o.pose = 'float'; o.facing = fc;
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pop, pop);
      try { ASCENT.Giraffe.drawPortrait(ctx, -fc * off[0] * S, -off[1] * S, S, t, o); }
      catch (e) { this._warnOnce('Giraffe.drawPortrait (options) threw', e); }
      ctx.restore();

      // twinkles around the figure (one path; size carries the twinkle)
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#fff1c4';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const tw = Math.max(0, Math.sin(t * (1.3 + i * 0.37) + i * 2.1));
        const px = cx + (i & 1 ? 0.62 : -0.6) * bw * (i < 2 ? 1 : 0.85);
        const py = cy + (i < 2 ? -0.34 : 0.18) * bh + (i & 1 ? 0.06 : 0) * bh;
        sparkle(ctx, px, py, (3 + 5 * tw) * u * (1 + fresh), 0.16);
      }
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // caption: ‹ NAME › + tagline (side layout only)
      if (L.pvCap && it) {
        if (this._pvLabelFor !== skin) {
          this._pvLabelFor = skin;
          const opts = it.options || [];
          const hit = opts.find((op) => op.value === skin) || opts[0];   // same fallback as the row
          this._pvLabel = hit ? String(hit.label) : '';
          this._pvTag = (hit && K.PV_TAG[hit.value]) || '';
        }
        const ny = L.pvNameY, ns = 1 + 0.18 * fresh * fresh, ch = 5 * u;
        let hw = 0;
        ctx.save();
        ctx.translate(L.pvX, ny); ctx.scale(ns, ns);
        ctx.font = F.pvName; ctx.textAlign = 'center';
        ctx.fillStyle = '#ffe28a';
        this._caps(ctx, this._pvLabel, 0, 0, 'center', L.lsN, L.lsS);
        hw = ctx.measureText(this._pvLabel).width * 0.5 + (this._lsOK ? L.lsN * this._pvLabel.length * 0.5 : 0) + 16 * u;
        const nudge = 2 * u * Math.sin(t * 3) * sel;
        ctx.beginPath();
        ctx.moveTo(-hw - nudge, -ch); ctx.lineTo(-hw - ch - nudge, 0); ctx.lineTo(-hw - nudge, ch);
        ctx.moveTo(hw + nudge, -ch); ctx.lineTo(hw + ch + nudge, 0); ctx.lineTo(hw + nudge, ch);
        ctx.globalAlpha = 0.45 + 0.4 * sel;
        ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = Math.max(1.2, 2 * u);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.restore();
        if (this._pvTag) {
          ctx.globalAlpha = 1;
          ctx.font = F.hint; ctx.textAlign = 'center'; ctx.fillStyle = TEXT_DIM;
          ctx.fillText(this._pvTag, L.pvX, L.pvTagY, L.pvHw);
        }
        // the caption's ‹ steps back (pushed first: first match wins)
        const lcx = L.pvX - (hw + ch) * ns, lcy = ny;
        this._hot(lcx - 18 * u, lcy - 16 * u, 36 * u, 32 * u, 'selectedOptionIndex', L.pvItem, this._optActBack[L.pvItem]);
      }
      ctx.globalAlpha = 1;
      this._hot(L.pvHx, L.pvHy, L.pvHw, L.pvHh, 'selectedOptionIndex', L.pvItem, this._optAct[L.pvItem]);
    },

    _optRow(ctx, it, i, x, y, a) {
      const L = this._L, u = L.u, F = this._f, PAL = ASCENT.PAL, O = ASCENT.Save.options;
      const w = L.optW, h = L.optH, cy = y + h * 0.53;
      ctx.globalAlpha = 1;
      ctx.font = F.opt; ctx.textAlign = 'left';
      ctx.fillStyle = a > 0.5 ? TEXT_HOT : TEXT_IDLE;
      ctx.fillText(it.text, x + 26 * u, cy);
      if (it.type === 'toggle') {
        const on = !!O[it.key], s = clamp01(this._sw[i]);
        const sw = 52 * u, sh = 28 * u, sx = x + w - 24 * u - sw, sy = y + h * 0.5 - sh / 2;
        rrect(ctx, sx, sy, sw, sh, sh / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fill();
        if (s > 0.01) { ctx.globalAlpha = s; ctx.fillStyle = PAL.gold; ctx.fill(); ctx.globalAlpha = 1; }
        ctx.beginPath();
        ctx.arc(sx + sh / 2 + (sw - sh) * s, y + h * 0.5, Math.max(0, sh / 2 - 3.5 * u), 0, TAU);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        ctx.font = F.optVal; ctx.textAlign = 'right';
        ctx.fillStyle = on ? '#ffe28a' : 'rgba(170,180,215,0.72)';
        ctx.fillText(on ? it.on : it.off, sx - 12 * u, cy);
      } else if (it.type === 'cycle') {
        const opts = it.options || [];
        const hit = opts.find((o) => o.value === O[it.key]) || opts[0];
        const val = String(hit ? hit.label : '');
        ctx.font = F.optVal; ctx.textAlign = 'right'; ctx.fillStyle = '#ffe28a';
        const rx = x + w - 44 * u;
        ctx.fillText(val, rx, cy);
        const tw = ctx.measureText(val).width, ch = 5 * u, lx = rx - tw - 14 * u, qx = rx + 16 * u, my = y + h * 0.5;
        this._cycLx = lx;             // drawOptions hangs the step-back hotspot here
        ctx.beginPath();
        ctx.moveTo(lx, my - ch); ctx.lineTo(lx - ch, my); ctx.lineTo(lx, my + ch);
        ctx.moveTo(qx, my - ch); ctx.lineTo(qx + ch, my); ctx.lineTo(qx, my + ch);
        ctx.strokeStyle = 'rgba(255,226,138,0.7)'; ctx.lineWidth = Math.max(1.2, 2 * u);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
      }
    },

    // -------------------------------------------------------------------------
    // Best times
    // -------------------------------------------------------------------------
    drawBestTimes(ctx, g) {
      if (ASCENT.Space && ASCENT.Space.drawMenuBack) ASCENT.Space.drawMenuBack(ctx, g);
      const L = this._L;
      if (!L) return;
      this._hotBegin(g);
      const u = L.u, F = this._f, PAL = ASCENT.PAL;
      ctx.save();
      try {
        ctx.textBaseline = 'middle';
        this._title(ctx, g, 'BEST TIMES', L.w / 2, L.titleY, 'Fastest licks to the Celestial Acacia', L.subY);
        const bt = ASCENT.Save.bestTimes || [];
        const n = Math.min(bt.length, ASCENT.CONFIG.MAX_BEST_TIMES || 10);
        const PW = L.panelW, x0 = (L.w - PW) / 2, top0 = L.contentTop + 4 * u;
        const avail = Math.max(60 * u, L.contentBottom - top0);
        const t = g.menuTime || 0;

        if (n === 0) {
          const PH = Math.min(avail, 210 * u), top = top0 + (avail - PH) * 0.3, cy = top + PH / 2;
          this._glass(ctx, x0, top, PW, PH, 18 * u, this._grad.glassDark);
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, this._glow.gold, L.w / 2, cy - 36 * u, 110 * u, 110 * u, 0.35 + 0.1 * Math.sin(t * 2));
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(255,230,160,0.85)';
          ctx.beginPath(); sparkle(ctx, L.w / 2, cy - 36 * u, 20 * u, 0.2); ctx.fill();
          ctx.font = F.rowTime; ctx.textAlign = 'center'; ctx.fillStyle = '#eef3ff';
          ctx.fillText('No stellar snacks yet', L.w / 2, cy + 14 * u, PW - 32 * u);
          ctx.font = F.sub; ctx.fillStyle = TEXT_DIM;
          ctx.fillText('Launch the giraffe and lick your way up to the Celestial Acacia.', L.w / 2, cy + 44 * u, PW - 32 * u);
        } else {
          const headH = 36 * u, pad = 12 * u;
          const RH = clamp((avail - headH - pad * 2) / n, 28 * u, 46 * u);
          const PH = headH + pad * 2 + RH * n;
          const top = top0 + Math.max(0, (avail - PH) * 0.3);
          this._glass(ctx, x0, top, PW, PH, 18 * u, this._grad.glassDark);
          const rankX = x0 + 44 * u, timeX = x0 + Math.max(96 * u, PW * 0.3), dateX = x0 + PW - 26 * u;
          const hy = top + pad + headH * 0.48;
          ctx.font = F.caps; ctx.fillStyle = 'rgba(170,180,215,0.7)';
          this._caps(ctx, 'RANK', rankX, hy, 'center', L.lsN, L.lsS);
          this._caps(ctx, 'TIME', timeX, hy, 'left', L.lsN, L.lsS);
          this._caps(ctx, 'DATE', dateX, hy, 'right', L.lsN, L.lsS);
          ctx.beginPath(); ctx.moveTo(x0 + 18 * u, top + pad + headH - 2 * u); ctx.lineTo(x0 + PW - 18 * u, top + pad + headH - 2 * u);
          ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,190,255,0.16)'; ctx.stroke();

          for (let i = 0; i < n; i++) {
            const b = bt[i] || {}, yc = top + pad + headH + RH * (i + 0.5);
            if (i === 0) {
              ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 2.6);
              rrect(ctx, x0 + 8 * u, yc - RH / 2 + 3 * u, PW - 16 * u, RH - 6 * u, 10 * u);
              ctx.fillStyle = 'rgba(255,211,92,0.10)'; ctx.fill();
              ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,211,92,0.30)'; ctx.stroke();
              ctx.globalAlpha = 1;
            }
            if (i < 3) {
              const M = MEDALS[i], mr = Math.min(RH * 0.34, 15 * u);
              if (i === 0) {
                ctx.globalCompositeOperation = 'lighter';
                glow(ctx, this._glow.gold, rankX, yc, mr * 4, mr * 4, 0.45);
                ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
              }
              ctx.beginPath(); ctx.arc(rankX, yc, Math.max(0, mr), 0, TAU);
              ctx.fillStyle = M.fill; ctx.fill();
              ctx.lineWidth = Math.max(1, 1.8 * u); ctx.strokeStyle = M.ring; ctx.stroke();
              ctx.font = F.rowRank; ctx.textAlign = 'center'; ctx.fillStyle = M.text;
              ctx.fillText(String(i + 1), rankX, yc + 0.5);
            } else {
              ctx.font = F.rowRank; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(170,180,215,0.7)';
              ctx.fillText('#' + (i + 1), rankX, yc + 0.5);
            }
            const row = this._btRow(i, +b.seconds || 0);       // "01:23" + ".4"
            ctx.font = F.rowTime; ctx.textAlign = 'left';
            ctx.fillStyle = i === 0 ? '#ffe6a0' : '#eef3ff';
            ctx.fillText(row.main, timeX, yc + 0.5);
            const tw = ctx.measureText(row.main).width;
            ctx.font = F.rowTenth; ctx.fillStyle = i === 0 ? 'rgba(255,230,160,0.7)' : 'rgba(200,208,245,0.62)';
            ctx.fillText(row.tenth, timeX + tw + 1, yc + 2 * u);
            ctx.font = F.rowDate; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(170,180,215,0.7)';
            ctx.fillText(String(b.date || ''), dateX, yc + 0.5);
          }
        }
        this._backButton(ctx, g);
        this._hint(ctx, 'Esc or Enter to go back');
      } finally { ctx.restore(); }
    },

    // -------------------------------------------------------------------------
    // Stats & achievements
    // -------------------------------------------------------------------------
    drawAchievements(ctx, g) {
      if (ASCENT.Space && ASCENT.Space.drawMenuBack) ASCENT.Space.drawMenuBack(ctx, g);
      const L = this._L;
      if (!L) return;
      this._hotBegin(g);
      const u = L.u, F = this._f, GR = this._grad;
      ctx.save();
      try {
        ctx.textBaseline = 'middle';
        this._title(ctx, g, 'STATS & ACHIEVEMENTS', L.w / 2, L.titleY, null, 0);
        // tabs
        const tw = L.tabW, th = L.tabH, gap = 12 * u, tx = L.w / 2 - tw - gap / 2;
        for (let k = 0; k < 2; k++) {
          const x = tx + k * (tw + gap), sel = g.achievementsTab === k + 1;
          const a = sel ? 1 : this._mouseIn(x, L.tabY, tw, th) ? 0.35 : 0;
          this._pill(ctx, x, L.tabY, tw, th, a, GR.pillTab, k ? 'ACHIEVEMENTS' : 'STATISTICS', F.tab, 2);
          this._hot(x, L.tabY, tw, th, undefined, undefined, k ? this._tabAct2 : this._tabAct1);
        }
        if (g.achievementsTab === 2) this._achList(ctx, g); else this._statsTab(ctx, g);
        this._backButton(ctx, g);
        this._hint(ctx, g.achievementsTab === 2
          ? 'Esc back · ←/→ tabs · ↑/↓ scroll · R reset all'
          : 'Esc back · ←/→ tabs · R reset all');
      } finally { ctx.restore(); }
    },

    _statsTab(ctx, g) {
      const L = this._L, u = L.u, PAL = ASCENT.PAL;
      const st = ASCENT.Save.stats || {};
      const PW = Math.min(820 * u, L.w - 2 * L.m), x0 = (L.w - PW) / 2;
      const avail = Math.max(80 * u, L.contentBottom - L.achTop);
      const two = PW >= 560 * u;
      const pad = 18 * u, headH = 30 * u, perCol = two ? 6 : 12, heads = two ? 1 : 2;
      const RH = clamp((avail - pad * 2 - headH * heads) / perCol, 20 * u, 46 * u);
      const PH = pad * 2 + headH * heads + RH * perCol;
      const top = L.achTop + Math.max(0, (avail - PH) * 0.3);
      this._glass(ctx, x0, top, PW, PH, 18 * u, this._grad.glassDark);
      const colW = two ? (PW - pad * 3) / 2 : PW - pad * 2;

      const best = ASCENT.Save.bestTime();
      let cx = x0 + pad, cy = top + pad;
      ctx.font = this._f.caps; ctx.fillStyle = PAL.gold;
      this._caps(ctx, 'THE CLIMB', cx, cy + headH * 0.45, 'left', L.lsN, L.lsS);
      cy += headH;
      this._statRow(ctx, 'Time played', fmtDur(st.timePlayed), cx, cy, colW, RH, 0);
      this._statRow(ctx, 'Climbs completed', fmtInt(st.gamesCompleted), cx, cy, colW, RH, 1);
      this._statRow(ctx, 'Climbs attempted', fmtInt(st.gamesAttempted), cx, cy, colW, RH, 2);
      this._statRow(ctx, 'Completion rate', fmtPct(st.gamesCompleted, st.gamesAttempted), cx, cy, colW, RH, 3);
      this._statRow(ctx, 'Best time', this._bestStr(best), cx, cy, colW, RH, 4);
      this._statRow(ctx, 'Jumps', fmtInt(st.jumps), cx, cy, colW, RH, two ? -5 : 5);

      if (two) { cx = x0 + pad * 2 + colW; cy = top + pad; } else { cy += RH * 6; }
      ctx.font = this._f.caps; ctx.fillStyle = '#b89cff';
      this._caps(ctx, 'TONGUE & GRAVITY', cx, cy + headH * 0.45, 'left', L.lsN, L.lsS);
      cy += headH;
      this._statRow(ctx, 'Tongues fired', fmtInt(st.ropesShot), cx, cy, colW, RH, 0);
      this._statRow(ctx, 'Missed licks', fmtInt(st.ropesFailed), cx, cy, colW, RH, 1);
      this._statRow(ctx, 'Lick success', fmtPct(st.successfulRopes, st.ropesShot), cx, cy, colW, RH, 2);
      this._statRow(ctx, 'Total fall time', fmtDur(st.totalFallTime), cx, cy, colW, RH, 3);
      this._statRow(ctx, 'Total fall distance', fmtDist(st.totalFallDistance), cx, cy, colW, RH, 4);
      this._statRow(ctx, 'Black-hole time', (+st.gravityWellTime || 0).toFixed(1) + ' s', cx, cy, colW, RH, -5);
    },

    // row index r (negative = last row in its column: no separator)
    _statRow(ctx, label, value, x, y0, w, RH, r) {
      const last = r < 0, i = last ? -r : r, yc = y0 + RH * (i + 0.5);
      ctx.font = this._f.statLabel; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(200,208,238,0.92)';
      ctx.fillText(label, x, yc + 0.5, w * 0.62);
      ctx.font = this._f.statVal; ctx.textAlign = 'right'; ctx.fillStyle = '#f4f7ff';
      ctx.fillText(value, x + w, yc + 0.5, w * 0.4);
      if (!last) {
        ctx.beginPath(); ctx.moveTo(x, y0 + RH * (i + 1)); ctx.lineTo(x + w, y0 + RH * (i + 1));
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,190,255,0.13)'; ctx.stroke();
      }
    },

    _achList(ctx, g) {
      const L = this._L, u = L.u, F = this._f, PAL = ASCENT.PAL, A = ASCENT.ACHIEVEMENTS;
      const n = A.length, per = 8, maxS = Math.max(0, n - per);
      const sc = clamp(Math.floor(g.achievementsScroll || 0), 0, maxS);
      // the whole list sits on a dark glass backing so it reads over the nebula
      const pad = 14 * u;
      const PW = Math.min(760 * u, L.w - 2 * L.m - 2 * pad), x0 = (L.w - PW) / 2;
      const avail = Math.max(80 * u, L.contentBottom - L.achTop);
      const barH = 34 * u, gap = 10 * u;
      const RH = clamp((avail - barH - gap - pad * 2) / per, 34 * u, 64 * u);
      const PH = pad * 2 + barH + gap + RH * Math.min(per, n);
      const top0 = L.achTop + Math.max(0, (avail - PH) * 0.3), top = top0 + pad;
      this._glass(ctx, x0 - pad, top0, PW + pad * 2, PH, 18 * u, this._grad.glassDark);
      let unlocked = 0;
      for (let i = 0; i < n; i++) if (A[i].unlocked) unlocked++;

      // progress row: count, bar, scroll buttons
      const by = top + barH * 0.5;
      ctx.font = F.achCount; ctx.textAlign = 'left'; ctx.fillStyle = '#ffe28a';
      ctx.fillText(unlocked + ' / ' + n + ' unlocked', x0 + 4 * u, by, 140 * u);
      const bx = x0 + 150 * u, bw = Math.max(10, Math.min(L.achBarW, PW - 150 * u - (maxS > 0 ? 84 * u : 8 * u)));
      const bh = 8 * u;
      rrect(ctx, bx, by - bh / 2, bw, bh, bh / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
      const frac = n > 0 ? unlocked / n : 0;
      if (frac > 0) {
        ctx.save();
        ctx.translate(bx, 0);
        rrect(ctx, 0, by - bh / 2, Math.max(bh, bw * frac), bh, bh / 2);
        ctx.fillStyle = this._grad.achBar; ctx.fill();
        ctx.restore();
      }
      if (maxS > 0) {
        const r = 14 * u, ux = x0 + PW - 52 * u, dx = x0 + PW - 16 * u;
        this._scrollBtn(ctx, ux, by, r, -1, sc > 0);
        this._scrollBtn(ctx, dx, by, r, 1, sc < maxS);
        if (sc > 0) this._hot(ux - r, by - r, r * 2, r * 2, undefined, undefined, this._scrollUpAct);
        if (sc < maxS) this._hot(dx - r, by - r, r * 2, r * 2, undefined, undefined, this._scrollDnAct);
      }

      // cards
      const listTop = top + barH + gap;
      for (let k = 0; k < per && sc + k < n; k++) {
        const a = A[sc + k], y = listTop + k * RH, on = !!a.unlocked;
        rrect(ctx, x0, y + 3 * u, PW, RH - 6 * u, 12 * u);
        ctx.fillStyle = on ? 'rgba(255,211,92,0.10)' : 'rgba(255,255,255,0.04)'; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = on ? 'rgba(255,211,92,0.42)' : 'rgba(170,190,255,0.14)'; ctx.stroke();
        const s = (RH - 6 * u) * 1.02, bxx = x0 + 6 * u;
        ctx.drawImage(on ? this._cv.badgeOn : this._cv.badgeOff, bxx, y + RH / 2 - s / 2, s, s);
        const tx = bxx + s + 6 * u, maxW = Math.max(10, x0 + PW - 16 * u - tx);
        ctx.textAlign = 'left';
        // locked = cool grey-blue and softer than unlocked cream, but readable
        ctx.font = F.achName; ctx.fillStyle = on ? '#fff6dc' : 'rgba(204,212,240,0.76)';
        ctx.fillText(a.name, tx, y + RH * 0.37, maxW);
        ctx.font = F.achDesc; ctx.fillStyle = on ? 'rgba(234,242,255,0.84)' : 'rgba(176,186,224,0.66)';
        ctx.fillText(a.desc, tx, y + RH * 0.67, maxW);
      }
    },

    _scrollBtn(ctx, x, y, r, dir, enabled) {
      const u = this._L.u, hov = enabled && this._mouseIn(x - r, y - r, r * 2, r * 2);
      ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU);
      ctx.fillStyle = hov ? 'rgba(255,211,92,0.25)' : 'rgba(255,255,255,0.07)'; ctx.fill();
      const c = r * 0.36;
      ctx.beginPath();
      ctx.moveTo(x - c, y - dir * c * 0.5); ctx.lineTo(x, y + dir * c * 0.6); ctx.lineTo(x + c, y - dir * c * 0.5);
      ctx.strokeStyle = enabled ? '#ffe28a' : 'rgba(170,180,215,0.25)';
      ctx.lineWidth = Math.max(1.2, 2 * u); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    },

    // -------------------------------------------------------------------------
    // Pause
    // -------------------------------------------------------------------------
    drawPause(ctx, g) {
      const L = this._L;
      if (!L) return;
      this._hotBegin(g);
      const u = L.u, F = this._f, GR = this._grad, hv = this._hv.pause;
      ctx.save();
      try {
        ctx.textBaseline = 'middle';
        // the frozen game stays visible but clearly in the background
        ctx.fillStyle = PAUSE_FILL; ctx.fillRect(0, 0, L.w, L.h);
        ctx.fillStyle = GR.pauseVig; ctx.fillRect(0, 0, L.w, L.h);
        this._title(ctx, g, 'PAUSED', L.w / 2, L.pzTitleY, 'Tongue in. Deep breath.', L.pzSubY);

        const items = g.pauseItems || [];
        for (let i = 0; i < items.length; i++) {
          const y = L.pzY0 + i * (L.pzH + L.pzGap);
          this._pill(ctx, L.pzX, y, L.pzW, L.pzH, hv[i] || 0, GR.pillPause, items[i].text, F.pz, 0);
          this._hot(L.pzX, y, L.pzW, L.pzH, 'selectedPauseItem', i, items[i].action);
        }

        // side panel: this climb ↔ the full controls list (CONTROLS highlighted)
        const mix = clamp01(this._pauseMix);
        const bh = L.pzWide ? L.cpH : L.rcH + (L.cpH - L.rcH) * mix;
        this._glass(ctx, L.cpX, L.cpY, L.cpW, bh, 18 * u, GR.glassPause);
        if (mix < 0.99) this._runCard(ctx, g, L.cpX, L.cpY, L.cpW, bh, 1 - mix);
        if (mix > 0.01) this._controlsTable(ctx, g, L.cpX, L.cpY, L.cpW, bh, mix);
        ctx.globalAlpha = 1;
        this._hint(ctx, '↑/↓ choose · Enter select · Esc resume');
      } finally { ctx.restore(); }
    },

    _runCard(ctx, g, x, y, w, h, A) {
      const L = this._L, F = this._f, s = L.u * L.cpFs, PAL = ASCENT.PAL;
      const prog = g.player ? clamp01(g.progress()) : 0;
      const zi = zoneIndex(prog), z = ASCENT.ZONES[zi];
      const pad = 26 * s, cw = w - pad * 2, x0 = x + pad;
      const contentH = 210 * s;
      let cy = y + Math.max(pad, (h - contentH) / 2);
      ctx.globalAlpha = A;
      ctx.font = F.rcLabel; ctx.fillStyle = PAL.gold;
      this._caps(ctx, 'THIS CLIMB', x0, cy + 6 * s, 'left', L.lsN, L.lsS);
      ctx.font = F.rcZone; ctx.textAlign = 'left'; ctx.fillStyle = z.tint;
      ctx.fillText(z.name, x0, cy + 36 * s, cw);
      ctx.font = F.rcFlavor; ctx.fillStyle = TEXT_DIM;
      ctx.fillText(K.ZONE_FLAVOR[zi] || '', x0, cy + 62 * s, cw);
      // altitude bar
      cy += 92 * s;
      ctx.font = F.rcLabel; ctx.fillStyle = 'rgba(170,180,215,0.7)';
      this._caps(ctx, 'ALTITUDE', x0, cy, 'left', L.lsN, L.lsS);
      ctx.font = F.rcVal; ctx.textAlign = 'right'; ctx.fillStyle = '#f4f7ff';
      ctx.fillText(this._pctStr(prog), x0 + cw, cy);
      const bh = 8 * s, byy = cy + 17 * s;
      rrect(ctx, x0, byy, cw, bh, bh / 2);
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
      if (prog > 0.001) {
        rrect(ctx, x0, byy, Math.max(bh, cw * prog), bh, bh / 2);
        ctx.fillStyle = z.tint; ctx.fill();
      }
      const sb = this._sessBest;
      if (sb > prog + 0.005) {
        ctx.fillStyle = PAL.gold;
        ctx.fillRect(x0 + cw * sb - 1 * s, byy - 3 * s, 2 * s, bh + 6 * s);
      }
      // numbers
      cy = byy + bh + 30 * s;
      const colW = cw / 2;
      const best = ASCENT.Save.bestTime();
      this._rcStat(ctx, 'RUN TIME', this._timerStr(g.gameTimer), x0, cy, A);
      this._rcStat(ctx, 'BEST', this._bestStr(best), x0 + colW, cy, A);
      this._rcStat(ctx, 'SESSION HIGH', this._pctStr2(sb), x0, cy + 48 * s, A);
      this._rcStat(ctx, 'WIPEOUTS', fmtInt(g.deaths || 0), x0 + colW, cy + 48 * s, A);
    },

    _pctStr2(p) { return Math.floor(clamp01(p) * 100 + 1e-6) + '%'; },

    _rcStat(ctx, label, val, x, y, A) {
      const L = this._L, F = this._f, s = L.u * L.cpFs;
      ctx.globalAlpha = A;
      ctx.font = F.rcLabel; ctx.fillStyle = 'rgba(170,180,215,0.7)';
      this._caps(ctx, label, x, y, 'left', L.lsN, L.lsS);
      ctx.font = F.rcVal; ctx.textAlign = 'left'; ctx.fillStyle = '#f4f7ff';
      ctx.fillText(val, x, y + 20 * s);
    },

    _controlsTable(ctx, g, x, y, w, h, A) {
      const L = this._L, F = this._f, s = L.u * L.cpFs, PAL = ASCENT.PAL;
      const pad = 24 * s, headH = 28 * s, rowH = 30 * s, chipH = 21 * s, subH = 13 * s;
      const kbX = x + pad, kbChipW = 150 * s, kbLabX = kbX + kbChipW + 12 * s;
      const pdX = kbLabX + 172 * s + 34 * s, pdChipW = 104 * s, pdLabX = pdX + pdChipW + 12 * s;
      const y0 = y + Math.max(pad * 0.75, (h - L.cpH) / 2 + pad);
      ctx.globalAlpha = A;
      ctx.font = F.cpHead; ctx.fillStyle = PAL.gold;
      this._caps(ctx, 'KEYBOARD & MOUSE', kbX, y0 + headH * 0.4, 'left', L.lsN, L.lsS);
      this._caps(ctx, 'CONTROLLER', pdX, y0 + headH * 0.4, 'left', L.lsN, L.lsS);
      ctx.beginPath(); ctx.moveTo(pdX - 17 * s, y0 + 2 * s); ctx.lineTo(pdX - 17 * s, y0 + headH + rowH * 9 + subH * 2);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(170,190,255,0.14)'; ctx.stroke();
      let ry = y0 + headH;
      for (let i = 0; i < KB_FULL.length; i++) {
        const r = KB_FULL[i];
        this._chipRow(ctx, r[0], r[1], kbX, kbChipW, kbLabX, ry, rowH, chipH, s, A);
        if (r[2]) {
          ctx.font = F.cpSub; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(170,180,215,0.72)';
          ctx.fillText(r[2], kbLabX, ry + rowH * 0.5 + subH * 0.95);
          ctx.fillText(r[3], kbLabX, ry + rowH * 0.5 + subH * 1.95);
          ry += subH * 2;
        }
        ry += rowH;
      }
      ry = y0 + headH;
      for (let i = 0; i < PAD_FULL.length; i++) {
        const r = PAD_FULL[i];
        this._chipRow(ctx, r[0], r[1], pdX, pdChipW, pdLabX, ry, rowH, chipH, s, A);
        ry += rowH;
      }
      ctx.font = F.cpSub; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(170,180,215,0.6)';
      ctx.fillText('Menus: D-pad · A select · B back', pdX, ry + rowH * 0.6, x + w - pad - pdX);
    },

    _chipRow(ctx, chip, label, cx, chipMaxW, labX, ry, rowH, chipH, s, A) {
      const F = this._f, cy = ry + rowH * 0.5;
      ctx.font = F.cpChip;
      const cw = Math.min(chipMaxW, ctx.measureText(chip).width + 16 * s);
      rrect(ctx, cx, cy - chipH / 2, cw, chipH, 6 * s);
      ctx.globalAlpha = A;
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = '#eaf2ff';
      ctx.fillText(chip, cx + cw / 2, cy + 0.5, chipMaxW - 8 * s);
      ctx.font = F.cpLabel; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(234,242,255,0.88)';
      ctx.fillText(label, labX, cy + 0.5);
    },

    // -------------------------------------------------------------------------
    // HUD
    // -------------------------------------------------------------------------
    drawHUD(ctx, g) {
      const L = this._L;
      if (!L || !g.player) return;
      ctx.save();
      try {
        ctx.textBaseline = 'middle';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const won = !!(g.goal && g.goal.reached);
        this._hudTrack(ctx, g);
        this._hudTimer(ctx, g);
        // Under the pause screen the zone title would sit right behind
        // "PAUSED" and the control card behind the side panel: skip both (their
        // timers are frozen, and they fade back in on resume).
        if (g.state !== ASCENT.STATES.PAUSED) {
          this._hudZone(ctx, g);
          this._hudCard(ctx, g);
        }
        if (won) this._hudVictory(ctx, g);           // (its toast owns the bottom edge)
        else this._hudHints(ctx, g);
      } finally { ctx.restore(); }
    },

    // Right edge: home planet (bottom) → the Celestial Acacia (top).
    _hudTrack(ctx, g) {
      const L = this._L, u = L.u, F = this._f, GR = this._grad, PAL = ASCENT.PAL, Z = ASCENT.ZONES;
      const prog = clamp01(g.progress());
      const x = L.trX, top = L.trTop, bot = L.trBot, len = bot - top;
      const my = bot - prog * len, zi = zoneIndex(prog);

      // glass capsule + dim track + lit progress
      this._panel(ctx, x - 8 * u, top - 10 * u, 16 * u, len + 20 * u, 8 * u);
      ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, top);
      ctx.lineWidth = 3 * u; ctx.strokeStyle = GR.trackDim; ctx.stroke();
      if (my < bot - 0.5) {
        ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(x, my);
        ctx.lineWidth = 4 * u; ctx.strokeStyle = GR.trackLit; ctx.stroke();
      }
      // zone boundary ticks
      ctx.beginPath();
      for (let i = 1; i < Z.length; i++) {
        const ty = bot - Z[i].from * len;
        ctx.moveTo(x - 17 * u, ty); ctx.lineTo(x - 11 * u, ty);
      }
      ctx.lineWidth = Math.max(1, 1.2 * u); ctx.strokeStyle = 'rgba(200,210,255,0.42)'; ctx.stroke();
      // zone labels, each on a small dark glass tab so they read over any
      // gameplay; the one beside the altitude marker fades so they don't clash
      ctx.font = F.track; ctx.textAlign = 'right';
      const lx = x - 21 * u, tabH = Math.max(11, 16 * u), tabR = tabH * 0.5, tpad = 5 * u;
      for (let i = 0; i < Z.length; i++) {
        const f1 = i + 1 < Z.length ? Z[i + 1].from : 1;
        const ly = bot - (Z[i].from + f1) * 0.5 * len;
        const label = K.ZONE_SHORT[i] || Z[i].name, cur = i === zi;
        const near = clamp01((Math.abs(ly - my) - 10 * u) / (14 * u));
        const la = 0.2 + 0.8 * near;
        const tw = L.trLabW[i] || 0;
        ctx.globalAlpha = la;
        rrect(ctx, lx - tw - tpad, ly - tabH / 2, tw + tpad * 2 - 1 * u, tabH, tabR);
        ctx.fillStyle = cur ? 'rgba(8,7,24,0.74)' : 'rgba(8,7,24,0.56)'; ctx.fill();
        if (cur) { ctx.lineWidth = 1; ctx.strokeStyle = Z[i].tint; ctx.globalAlpha = la * 0.55; ctx.stroke(); ctx.globalAlpha = la; }
        ctx.fillStyle = cur ? Z[i].tint : 'rgba(196,204,236,0.8)';
        ctx.fillText(label, lx, ly + 0.5);
      }
      ctx.globalAlpha = 1;
      // home planet
      const py = bot + 21 * u;
      ctx.beginPath(); ctx.arc(x, py, 6.5 * u, 0, TAU); ctx.fillStyle = PAL.savanna; ctx.fill();
      ctx.beginPath(); ctx.arc(x, py, 6.5 * u, Math.PI * 1.08, Math.PI * 1.92);
      ctx.lineWidth = 2 * u; ctx.strokeStyle = PAL.dusk1; ctx.stroke();
      // the Celestial Acacia (flat-topped canopy on a forked trunk)
      const ay = top - 23 * u;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this._glow.leaf, x, ay, 40 * u, 40 * u, 0.3 + 0.5 * prog * prog);
      glow(ctx, this._glow.gold, x, my, 54 * u, 54 * u, 0.5);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(x, ay + 10 * u); ctx.lineTo(x, ay + 3 * u);
      ctx.moveTo(x, ay + 5.5 * u); ctx.lineTo(x - 4 * u, ay + 1 * u);
      ctx.moveTo(x, ay + 4.5 * u); ctx.lineTo(x + 4.5 * u, ay + 0.5 * u);
      ctx.lineWidth = Math.max(1, 1.6 * u); ctx.strokeStyle = '#9a6a3a'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x, ay, 10 * u, 3.8 * u, 0, 0, TAU); ctx.fillStyle = PAL.leaf; ctx.fill();

      // session-best notch
      const sb = this._sessBest;
      if (sb > prog + 0.01) {
        const gy = bot - sb * len;
        ctx.beginPath(); ctx.moveTo(x - 8 * u, gy); ctx.lineTo(x + 8 * u, gy);
        ctx.lineWidth = 2 * u; ctx.strokeStyle = 'rgba(255,211,92,0.8)'; ctx.stroke();
      }

      // marker: giraffe head + altitude readout
      const hs = L.headSize;
      ctx.drawImage(this._cv.head, x - hs * L.headAx, my - hs * L.headAy, hs, hs);
      const pct = this._pctStr(prog);
      ctx.font = F.pct;
      const pw = ctx.measureText(pct).width + 14 * u, ph = 20 * u, pxx = x - 21 * u - pw;
      rrect(ctx, pxx, my - ph / 2, pw, ph, ph / 2);
      ctx.fillStyle = 'rgba(12,14,40,0.85)'; ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = '#fff4d6';
      ctx.fillText(pct, pxx + pw / 2, my + 0.5);
    },

    // Top right: run clock (fixed-width digits so it doesn't jitter) + best.
    _hudTimer(ctx, g) {
      const L = this._L, u = L.u, F = this._f, PAL = ASCENT.PAL;
      const s = this._timerStr(g.gameTimer);
      let tw = 0;
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        tw += c === 58 ? L.colW : c === 46 ? L.dotW : L.digW;
      }
      const pw = Math.max(L.tpW, tw + 64 * u), x0 = L.w - L.m - pw, y0 = L.tpY;
      this._panel(ctx, x0, y0, pw, L.tpH, 14 * u);
      const won = g.goal && g.goal.reached;
      const ty = y0 + 27 * u;
      // little stopwatch whose hand sweeps once a minute
      const a = ((g.gameTimer || 0) % 60) / 60 * TAU, wx = x0 + 22 * u;
      ctx.beginPath();
      ctx.moveTo(wx + 7.5 * u, ty); ctx.arc(wx, ty, 7.5 * u, 0, TAU);
      ctx.moveTo(wx, ty); ctx.lineTo(wx + Math.sin(a) * 5 * u, ty - Math.cos(a) * 5 * u);
      ctx.moveTo(wx, ty - 7.5 * u); ctx.lineTo(wx, ty - 10.5 * u);
      ctx.lineWidth = Math.max(1, 1.5 * u); ctx.strokeStyle = won ? PAL.gold : 'rgba(190,200,240,0.7)'; ctx.stroke();

      ctx.font = F.timer; ctx.textAlign = 'center';
      ctx.fillStyle = won ? '#ffe08a' : g.timerStarted ? '#f4f7ff' : 'rgba(200,210,240,0.55)';
      let cx = x0 + pw - 16 * u - tw;
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i), cw = c === 58 ? L.colW : c === 46 ? L.dotW : L.digW;
        ctx.fillText(s[i], cx + cw / 2, ty);
        cx += cw;
      }
      const best = ASCENT.Save.bestTime();
      this._bestLabel(best);
      const by = y0 + L.tpH - 16 * u, rx = x0 + pw - 16 * u;
      ctx.font = F.hudSmall; ctx.textAlign = 'right';
      ctx.fillStyle = best != null ? 'rgba(255,226,150,0.92)' : 'rgba(170,180,215,0.6)';
      ctx.fillText(this._bS, rx, by);
      const bw = ctx.measureText(this._bS).width;
      ctx.font = F.hudCaps; ctx.fillStyle = 'rgba(170,180,215,0.7)';
      this._caps(ctx, 'BEST', rx - bw - 8 * u, by, 'right', L.lsN, L.lsS);
    },

    // "ENTERING / The Solar Winds / flavour line", tinted with the zone.
    _hudZone(ctx, g) {
      const a = this._annAlpha() * this._hudIn;
      if (a <= 0.003) return;
      const i = this._ann, z = ASCENT.ZONES[i];
      if (!z) return;
      const L = this._L, u = L.u, F = this._f, t = this._annT, Zs = L.zoneSize;
      const inK = easeOut(clamp01(t / K.ZONE_ANN_IN));
      const cx = L.w / 2, cy = L.annY - (1 - inK) * 14 * u;
      ctx.font = F.zone;
      const nw = ctx.measureText(z.name).width;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this._zoneGlow[i] || this._glow.white, cx, cy, nw * 1.5 + 90 * u, Zs * 3.4, 0.36 * a);
      ctx.globalCompositeOperation = 'source-over';

      // ENTERING + flourishes that stretch out
      const caps = i === 0 ? K.ZONE_CAPS_START : K.ZONE_CAPS;
      const ey = cy - Zs * 0.98;
      ctx.globalAlpha = 0.9 * a;
      ctx.font = F.zoneCaps; ctx.fillStyle = z.tint;
      this._caps(ctx, caps, cx, ey, 'center', L.lsWN, L.lsWS);
      const ew = ctx.measureText(caps).width + (this._lsOK ? L.lsWN * caps.length : 0);
      const spread = (12 + 46 * easeOut(clamp01(t / 0.8))) * u, e0 = ew / 2 + 12 * u;
      ctx.beginPath();
      ctx.moveTo(cx - e0, ey); ctx.lineTo(cx - e0 - spread, ey);
      ctx.moveTo(cx + e0, ey); ctx.lineTo(cx + e0 + spread, ey);
      ctx.lineWidth = Math.max(1, 1.5 * u); ctx.strokeStyle = z.tint; ctx.stroke();

      // the name
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.font = F.zone; ctx.textAlign = 'center';
      ctx.lineWidth = 6 * u; ctx.strokeStyle = 'rgba(5,4,13,0.55)'; ctx.strokeText(z.name, 0, 0);
      ctx.fillStyle = this._grad.zone[i] || z.tint; ctx.fillText(z.name, 0, 0);
      ctx.restore();

      const fl = K.ZONE_FLAVOR[i];
      if (fl) {
        ctx.globalAlpha = 0.88 * a;
        ctx.font = F.zoneFlavor; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(228,234,255,0.9)';
        ctx.fillText(fl, cx, cy + Zs * 0.92, L.w - 2 * L.m);
      }
      ctx.globalAlpha = 1;
    },

    // Bottom-left quick-controls card for the first ~10 s of a run.
    _hudCard(ctx, g) {
      if (g.goal && g.goal.reached) return;
      const rc = this._runClock;
      const fin = easeOut(clamp01((rc - 0.25) / 0.45)), fout = clamp01((this._cardEnd - rc) / K.CARD_FADE);
      const a = Math.min(fin, fout) * this._hudIn;
      if (a <= 0.003) return;
      const L = this._L, u = L.u, F = this._f, PAL = ASCENT.PAL;
      const In = ASCENT.Input;
      const pad = (In.hasGamepad && In.hasGamepad()) || ASCENT.Save.options.controlScheme === 'controller';
      const rows = pad ? PAD_CARD : KB_CARD;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate((1 - fin) * -24 * u, 0);
      const x = L.cardX, y = L.cardY, w = L.cardW;
      this._panel(ctx, x, y, w, L.cardH, 14 * u);
      ctx.font = F.caps; ctx.fillStyle = PAL.gold;
      this._caps(ctx, 'QUICK CONTROLS', x + 16 * u, y + 20 * u, 'left', L.lsN, L.lsS);
      const chipH = 19 * u, labX = x + 16 * u + 68 * u;
      for (let i = 0; i < rows.length; i++) {
        const cy = y + 40 * u + L.cardRowH * (i + 0.5);
        ctx.font = F.cardKey;
        const cw = Math.min(62 * u, ctx.measureText(rows[i][0]).width + 14 * u);
        rrect(ctx, x + 16 * u, cy - chipH / 2, cw, chipH, 5 * u);
        ctx.fillStyle = 'rgba(255,255,255,0.11)'; ctx.fill();
        ctx.textAlign = 'center'; ctx.fillStyle = '#eaf2ff';
        ctx.fillText(rows[i][0], x + 16 * u + cw / 2, cy + 0.5, 58 * u);
        ctx.font = F.cardLabel; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(234,242,255,0.86)';
        ctx.fillText(rows[i][1], labX, cy + 0.5, x + w - 12 * u - labX);
      }
      ctx.restore();
    },

    // Bottom-left: muted / fly-mode indicators + the two essential keys.
    _hudHints(ctx, g) {
      const L = this._L, u = L.u, F = this._f;
      const y = L.hudHintY;
      let x = L.m;
      ctx.font = F.hudSmall; ctx.textAlign = 'left';
      if (!ASCENT.Save.options.soundEnabled) {
        ctx.beginPath();
        ctx.moveTo(x, y - 3 * u); ctx.lineTo(x + 4 * u, y - 3 * u); ctx.lineTo(x + 9 * u, y - 7 * u);
        ctx.lineTo(x + 9 * u, y + 7 * u); ctx.lineTo(x + 4 * u, y + 3 * u); ctx.lineTo(x, y + 3 * u);
        ctx.closePath(); ctx.fillStyle = '#ff8a7a'; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 12 * u, y - 3.5 * u); ctx.lineTo(x + 19 * u, y + 3.5 * u);
        ctx.moveTo(x + 19 * u, y - 3.5 * u); ctx.lineTo(x + 12 * u, y + 3.5 * u);
        ctx.lineWidth = Math.max(1.2, 1.8 * u); ctx.strokeStyle = '#ff8a7a'; ctx.stroke();
        x += 25 * u;
        ctx.fillStyle = '#ff8a7a'; ctx.fillText('MUTED', x, y);
        x += ctx.measureText('MUTED').width + 16 * u;
      }
      if (g.debugFlying) {
        ctx.fillStyle = '#ff7ad9'; ctx.fillText('FLY MODE (F)', x, y);
        x += ctx.measureText('FLY MODE (F)').width + 16 * u;
      }
      ctx.fillStyle = 'rgba(170,180,215,0.55)';
      ctx.fillText('Esc: pause · M: mute', x, y);
    },

    // "STELLAR SNACK!" — the victory camera frames the Acacia + the munching
    // giraffe at ~0.3 of the height, so the banner (title, run time, PB / rank,
    // prompt) lives in the lower half on a dark band, and the sunburst rays
    // radiate from the tree itself (clear at its core so it stays untouched).
    _hudVictory(ctx, g) {
      const L = this._L, u = L.u, F = this._f, GR = this._grad, PAL = ASCENT.PAL, V = L.vicSize;
      const t = Math.max(0, (g.time || 0) - (g.goal.reachedAt || 0));
      const aIn = easeOut(clamp01(t / 0.5));
      const cx = L.w / 2, cy = L.vcY;

      // where the Acacia is on screen right now (tracks the easing camera)
      let sx = L.w / 2, sy = L.h * 0.3;
      const cam = g.camera, goal = g.goal;
      if (cam && cam.zoom > 0) {
        let dx = (goal.x - cam.cx) * cam.zoom, dy = (goal.y - cam.cy) * cam.zoom;
        if (cam.tilt) {
          const c = Math.cos(cam.tilt), s = Math.sin(cam.tilt), rx = dx * c - dy * s;
          dy = dx * s + dy * c; dx = rx;
        }
        const qx = dx + L.w / 2 + (cam.shakeX || 0), qy = dy + L.h / 2 + (cam.shakeY || 0);
        if (isFinite(qx) && isFinite(qy)) { sx = qx; sy = qy; }
      }

      // rotating sunburst from the tree
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(t * 0.12);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9 * aIn;
      const R = L.sunR;
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const a0 = i / 18 * TAU, a1 = a0 + TAU / 40;
        ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R); ctx.lineTo(Math.cos(a1) * R, Math.sin(a1) * R);
        ctx.closePath();
      }
      ctx.fillStyle = GR.sun; ctx.fill();
      ctx.restore();

      // dark band behind the text (it also calms the rays that reach down here)
      ctx.globalAlpha = aIn;
      ctx.fillStyle = GR.band; ctx.fillRect(0, L.vbTop, L.w, L.vbBot - L.vbTop);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this._glow.gold, cx, cy, L.vicHalfW * 2.4, V * 2.0, 0.32 * aIn);
      ctx.globalCompositeOperation = 'source-over';

      // the title pops in with a little overshoot, then breathes
      const sp = Math.max(0.01, easeOutBack(clamp01(t / 0.55))) * (1 + 0.015 * Math.sin(t * 2.4));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.035);
      ctx.scale(sp, sp);
      ctx.globalAlpha = clamp01(t / 0.25);
      ctx.font = F.vic; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
      ctx.lineWidth = V * 0.13; ctx.strokeStyle = '#3a1450'; ctx.strokeText('STELLAR SNACK!', 0, 0);
      ctx.fillStyle = GR.vic; ctx.fillText('STELLAR SNACK!', 0, 0);
      ctx.restore();

      // confetti twinkles around the title
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#fff1b8';
      const vs = L.vsp;
      for (let i = 0; i < 14; i++) {
        const cyc = (t * 0.55 + vs[i * 4 + 2]) % 1;
        if (cyc > 0.35) continue;
        const k = Math.sin(cyc / 0.35 * Math.PI) * aIn;
        if (k <= 0.01) continue;
        ctx.globalAlpha = k;
        ctx.beginPath(); sparkle(ctx, cx + vs[i * 4], cy + vs[i * 4 + 1], vs[i * 4 + 3] * k, 0.12); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // run time
      const a2 = easeOut(clamp01((t - 0.35) / 0.4));
      if (a2 > 0.003) {
        ctx.globalAlpha = a2 * 0.8;
        ctx.font = F.vicCaps; ctx.fillStyle = 'rgba(200,208,245,0.85)';
        this._caps(ctx, 'YOUR TIME', cx, cy + L.vcCapsDY, 'center', L.lsWN, L.lsWS);
        ctx.globalAlpha = a2;
        ctx.font = F.vicTime; ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
        ctx.fillText(this._timerStr(g.currentRunTime), cx, cy + L.vcTimeDY + (1 - a2) * 10 * u);
      }

      // personal best / rank (the run is already in bestTimes a frame after the win)
      const a3 = easeOut(clamp01((t - 0.6) / 0.4));
      if (a3 > 0.003) {
        const bt = ASCENT.Save.bestTimes || [], rt = g.currentRunTime || 0;
        const isPB = bt.length === 0 || rt <= (+bt[0].seconds || 0) + 1e-3;
        const py = cy + L.vcLineDY;
        ctx.font = F.vicLine; ctx.textAlign = 'center';
        if (g._debugUsed) {
          // F-fly / G-warp was used: game.js didn't record this run
          ctx.globalAlpha = a3 * 0.85;
          ctx.fillStyle = 'rgba(190,198,232,0.9)';
          ctx.fillText('DEBUG RUN — NOT RECORDED', cx, py);
        } else if (isPB) {
          const p = 0.8 + 0.2 * Math.sin(t * 5);
          ctx.globalAlpha = a3 * p;
          ctx.fillStyle = PAL.gold;
          ctx.fillText('NEW PERSONAL BEST!', cx, py);
          const hw = ctx.measureText('NEW PERSONAL BEST!').width / 2 + 20 * u, sr = 8 * u * (0.8 + 0.2 * Math.sin(t * 6));
          ctx.beginPath(); sparkle(ctx, cx - hw, py, sr, 0.2); sparkle(ctx, cx + hw, py, sr, 0.2); ctx.fill();
        } else {
          let rank = 1;
          for (let i = 0; i < bt.length; i++) if ((+bt[i].seconds || 0) < rt - 1e-3) rank++;
          if (rank <= (ASCENT.CONFIG.MAX_BEST_TIMES || 10)) {
            if (rank !== this._rankN) { this._rankN = rank; this._rankS = 'Rank #' + rank; }
            ctx.globalAlpha = a3;
            ctx.fillStyle = '#9fd0ff';
            ctx.fillText(this._rankS, cx, py);
          }
          const best = ASCENT.Save.bestTime();
          if (best != null) {
            ctx.globalAlpha = a3 * 0.8;
            ctx.font = F.vicSmall; ctx.fillStyle = 'rgba(190,198,232,0.8)';
            ctx.fillText(this._bestLabel(best), cx, cy + L.vcBestDY);
          }
        }
      }

      // prompt (only once game.js will accept it)
      const a4 = clamp01((t - K.WIN_PROMPT_DELAY) / 0.4);
      if (a4 > 0.003) {
        ctx.globalAlpha = a4 * (0.62 + 0.3 * Math.sin(t * 3));
        ctx.font = F.vicSmall; ctx.textAlign = 'center'; ctx.fillStyle = '#e6ecff';
        ctx.fillText('Click / Esc / Enter to return to the menu', cx, cy + L.vcPromptDY, L.w - 2 * L.m);
      }
      ctx.globalAlpha = 1;
    },

    // -------------------------------------------------------------------------
    // Achievement toast
    // -------------------------------------------------------------------------
    drawPopups(ctx, g) {
      const pops = g.achievementPopups, L = this._L;
      if (!L || !pops || !pops.length) return;
      const pop = pops[0];
      const D = ASCENT.CONFIG.ACHIEVEMENT_POPUP_DURATION || 3;
      const t = clamp(+pop.timer || 0, 0, D);
      const aIn = easeOut(clamp01(t / K.TOAST_IN)), aOut = clamp01((D - t) / K.TOAST_OUT);
      const a = Math.min(aIn, aOut);
      if (a <= 0.003) return;
      const u = L.u, F = this._f, PAL = ASCENT.PAL;
      const w = L.toW, h = L.toH, x = (L.w - w) / 2;
      // during the win the Acacia is framed up top and the banner fills the
      // lower half: the toast takes the bottom edge (the banner is laid out to
      // end above it, and the HUD hint line is hidden then)
      const bottom = !!(g.goal && g.goal.reached && g.state === ASCENT.STATES.PLAYING);
      let y = bottom ? L.toWinY : this._toastY;
      y += (1 - aIn) * 18 * u * (bottom ? 1 : -1) - (1 - aOut) * 8 * u;

      ctx.save();
      try {
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = a;
        rrect(ctx, x, y, w, h, 16 * u);
        ctx.fillStyle = 'rgba(14,12,40,0.88)'; ctx.fill();
        ctx.lineWidth = Math.max(1, 1.4 * u); ctx.strokeStyle = 'rgba(255,211,92,0.55)'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 24 * u, y + 1.5 * u); ctx.lineTo(x + w - 24 * u, y + 1.5 * u);
        ctx.lineWidth = Math.max(1, 1.2 * u); ctx.strokeStyle = 'rgba(255,236,170,0.55)'; ctx.stroke();

        const bs = h * 0.98, bcx = x + 6 * u + bs / 2, bcy = y + h / 2;
        const pop2 = Math.max(0.01, easeOutBack(clamp01(t / 0.5)));
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, this._glow.gold, bcx, bcy, bs * 1.3, bs * 1.3, a * (0.3 + 0.12 * Math.sin(t * 6)));
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a;
        const bd = bs * pop2;
        ctx.drawImage(this._cv.badgeOn, bcx - bd / 2, bcy - bd / 2, bd, bd);

        const tx = x + 6 * u + bs + 4 * u, maxW = Math.max(10, x + w - 16 * u - tx);
        ctx.font = F.caps; ctx.fillStyle = PAL.gold;
        this._caps(ctx, 'ACHIEVEMENT UNLOCKED', tx, y + h * 0.25, 'left', L.lsN, L.lsS);
        ctx.textAlign = 'left';
        ctx.font = F.toName; ctx.fillStyle = '#fffaf0';
        ctx.fillText(String(pop.name || ''), tx, y + h * 0.52, maxW);
        ctx.font = F.toDesc; ctx.fillStyle = 'rgba(200,208,245,0.78)';
        ctx.fillText(String(pop.desc || ''), tx, y + h * 0.77, maxW);
        if (pops.length > 1) {
          ctx.font = F.caps; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,211,92,0.7)';
          ctx.fillText('+' + (pops.length - 1), x + w - 14 * u, y + h * 0.25);
        }
      } finally { ctx.restore(); }
    },
  };

  ASCENT.UI = UI;
})();
