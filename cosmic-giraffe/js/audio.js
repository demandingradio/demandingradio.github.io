/*
 * AUDIO — procedural Web Audio sound design + the music element.
 * ==============================================================
 * Cosmic Giraffe's sound is all synthesised; the only audio file is the
 * background music (<audio id="bg-music">, borrowed from Cosmic Ascent).
 *
 *  - One-shots: every effect is pre-rendered ONCE at init into an AudioBuffer
 *    by plain sample math (seeded noise, so it sounds the same every visit);
 *    the frequent ones in 2 variants, round-robined with a little random pitch
 *    so rapid repeats never sound machine-gunned. Dull/low sounds render at
 *    half the sample rate to keep page-load synthesis quick. A play only builds
 *    BufferSource -> Gain (-> StereoPanner) -> sfx bus (+ optional reverb send).
 *  - The tongue is the star: a wet stretchy "schlllp" when it fires, a sticky
 *    "thwock" + squelch when it sticks, a rubbery "boi-oi-oing... flop" when a
 *    lick misses, a lip-smack pop on release, a scissor snip when a comet cuts it.
 *  - Continuous layers are built once (lazily, after the first user gesture)
 *    and only ever *modulated*, never recreated: flying wind (looping filtered
 *    noise that follows your speed), a cartoon falling whistle, the stretchy
 *    tongue-tension hum, and a low black-hole drone.
 *  - Mix: voices -> sfx -> bus (master volume + sound toggle) -> gentle
 *    compressor/limiter -> speakers, with a small procedural "space hall"
 *    reverb on a send so chimes and sparkles bloom a little.
 *
 * Game code calls play(name, vol, pitch) for its own sounds; the extra moments
 * (tongue cut, phase-out, death, respawn, the goal munch, flares, run start)
 * are picked up from ASCENT.FX events. Every entry point no-ops safely when Web
 * Audio is missing or before the browser allows audio, and never throws into
 * the game loop.
 */
window.ASCENT = window.ASCENT || {};

(function () {
  'use strict';

  // ------------------------------------------------------------------ knobs
  const K = {
    // ---- mix ----
    MAX_VOICES: 28,          // global cap on simultaneous one-shots
    RETRIGGER: 0.03,         // s: the same sound can't restart faster than this
    PEAK: 0.95,              // every synthesised buffer is normalised to this peak
    PAN_WIDTH: 0.55,         // how far positional sounds pan (0 = mono, 1 = hard)
    COMP_THRESHOLD: -10,     // dB  (gentle limiter so overlaps never clip)
    COMP_KNEE: 10,
    COMP_RATIO: 4,
    COMP_ATTACK: 0.004,
    COMP_RELEASE: 0.25,
    REVERB_SEC: 1.8,         // length of the procedural "space hall" impulse
    REVERB_DECAY: 0.5,       // its exponential time constant (s)
    REVERB_RETURN: 0.75,     // wet return level (per-sound sends live in SOUNDS)
    CONTROL_HZ: 30,          // how often update() re-targets the ambient params

    // ---- flying wind (looping filtered noise that follows the giraffe's speed) ----
    WIND_LOOP_SEC: 4,
    WIND_FLOOR: 0.015,       // faint air while drifting slowly
    WIND_GAIN: 0.26,         // extra gain at full speed
    WIND_SPEED_MIN: 60,      // px/s where the wind starts to rise
    WIND_SPEED_MAX: 1300,    // px/s of full wind
    WIND_CUT_MIN: 220,       // lowpass Hz at rest (distant rumble) ...
    WIND_CUT_MAX: 2600,      // ... and at full speed (bright rush)
    WIND_ZONE_BONUS: 0.3,    // extra "speed" while inside a solar-wind current

    // ---- fast-fall whistle (cartoon bomb-drop) ----
    WHISTLE_START_HZ: 1500,
    WHISTLE_END_HZ: 440,
    WHISTLE_FALL_TC: 2.2,    // s time-constant of the downward glide
    WHISTLE_GAIN: 0.045,     // at fallShake = 1
    WHISTLE_VIB_HZ: 5.5,
    WHISTLE_VIB_DEPTH: 16,   // Hz
    WHISTLE_WHILE_LICKING: false, // fallShake also fires on fast downswings; a
                                  // swing isn't a fall, so stay quiet while attached

    // ---- tongue-tension hum ----
    TENSION_GAIN: 0.07,      // at full stretch
    TENSION_BASE_HZ: 82,     // pitch at ratio 0 (rises TENSION_OCTAVES by ratio 1)
    TENSION_OCTAVES: 1.5,
    TENSION_FROM: 0.3,       // silent below this length/maxLength ratio
    TENSION_FULL: 0.9,       // full level from this ratio
    TENSION_SLACK: 0.3,      // level multiplier while the tongue is loose

    // ---- black-hole drone ----
    WELL_GAIN: 0.08,         // at the core
    WELL_HZ: 98,             // drone pitch at the influence edge (bends down inside)

    // ---- event sounds ----
    FLARE_RANGE_SCREENS: 1.5, // flare roar only within this many view-heights
    FLARE_MIN_VOL: 0.35,      // roar volume at the edge of that range
    RESPAWN_DELAY: 0.2,       // s after the death blip
    MUNCH_DELAY: 0.42,        // s after the victory arpeggio starts
    MUNCH_REPEAT_AT: [2.6, 5.4],   // quieter munches while hovering at the Acacia
    MUNCH_REPEAT_VOL: [0.55, 0.35],
  };

  // Partial tables for addTone(): [frequency ratio, amplitude, decay multiplier].
  const PURE = [[1, 1, 1]];
  const SOFT = [[1, 1, 1], [2, 0.15, 0.5]];
  const GLASS = [[1, 1, 1], [2.76, 0.18, 0.5]];
  const ICE = [[1, 1, 1], [1.47, 0.4, 0.7]];
  const BELL = [[1, 1, 1], [1.003, 0.25, 0.9], [2, 0.4, 0.6], [3.01, 0.15, 0.35], [4.2, 0.07, 0.2]];
  const CHIME = [[1, 1, 1], [1.002, 0.3, 1], [2.76, 0.35, 0.45], [5.4, 0.12, 0.25]];

  // Every one-shot. dur (s) · vars (pre-rendered variants) · level (absolute
  // gain before master; balanced by measured RMS × the vol the game passes) ·
  // jitter (± random pitch per play) · wet (reverb send) · max (simultaneous
  // voices of this sound) · half (render at half the sample rate — used for
  // dull/low sounds with nothing above ~6 kHz; halves init cost, the browser
  // resamples on playback) · fn (the synth).
  const SOUNDS = {
    // --- played by game code ---
    ropeShoot:    { dur: 0.26, vars: 2, level: 0.30, jitter: 0.05, wet: 0.06, max: 3, half: true,  fn: synthShoot },
    ropeAttach:   { dur: 0.30, vars: 2, level: 0.32, jitter: 0.06, wet: 0.08, max: 3, half: true,  fn: synthAttach },
    ropeSnap:     { dur: 0.60, vars: 2, level: 0.28, jitter: 0.03, wet: 0.10, max: 2, half: true,  fn: synthSnap },
    ropeRelease:  { dur: 0.16, vars: 2, level: 0.26, jitter: 0.06, wet: 0.06, max: 3, half: false, fn: synthRelease },
    swingWhoosh:  { dur: 0.50, vars: 1, level: 0.22, jitter: 0.08, wet: 0.08, max: 2, half: true,  fn: synthSwing },
    boostPulse:   { dur: 0.70, vars: 1, level: 0.26, jitter: 0.03, wet: 0.22, max: 2, half: true,  fn: synthBoost },
    meteorWhoosh: { dur: 1.20, vars: 2, level: 0.28, jitter: 0.10, wet: 0.12, max: 3, half: true,  fn: synthMeteor },
    landing:      { dur: 0.30, vars: 2, level: 0.48, jitter: 0.06, wet: 0.05, max: 2, half: true,  fn: synthLanding },
    jump:         { dur: 0.20, vars: 2, level: 0.32, jitter: 0.04, wet: 0.06, max: 2, half: true,  fn: synthJump },
    crumble:      { dur: 0.90, vars: 1, level: 0.42, jitter: 0.07, wet: 0.18, max: 3, half: false, fn: synthCrumble },
    victory:      { dur: 2.40, vars: 1, level: 0.36, jitter: 0,    wet: 0.30, max: 1, half: true,  fn: synthVictory },
    achievement:  { dur: 1.80, vars: 1, level: 0.30, jitter: 0,    wet: 0.30, max: 2, half: false, fn: synthAchievement },
    uiMove:       { dur: 0.05, vars: 1, level: 0.12, jitter: 0.03, wet: 0.04, max: 2, half: false, fn: synthUiMove },
    uiSelect:     { dur: 0.30, vars: 1, level: 0.18, jitter: 0,    wet: 0.10, max: 2, half: false, fn: synthUiSelect },
    // --- triggered from ASCENT.FX events ---
    tongueCut:    { dur: 0.16, vars: 1, level: 0.30, jitter: 0.05, wet: 0.10, max: 2, half: false, fn: synthCut },
    phaseDetach:  { dur: 1.10, vars: 1, level: 0.24, jitter: 0.02, wet: 0.40, max: 2, half: false, fn: synthPhase },
    death:        { dur: 0.55, vars: 1, level: 0.15, jitter: 0,    wet: 0.15, max: 1, half: true,  fn: synthDeath },
    respawn:      { dur: 1.50, vars: 1, level: 0.24, jitter: 0,    wet: 0.30, max: 1, half: true,  fn: synthRespawn },
    munch:        { dur: 1.35, vars: 1, level: 0.50, jitter: 0.03, wet: 0.08, max: 1, half: true,  fn: synthMunch },
    flareIgnite:  { dur: 2.00, vars: 1, level: 0.34, jitter: 0.05, wet: 0.15, max: 2, half: true,  fn: synthFlare },
    runStart:     { dur: 1.00, vars: 1, level: 0.26, jitter: 0,    wet: 0.20, max: 1, half: true,  fn: synthRunStart },
  };

  // ------------------------------------------------------------ DSP helpers
  // Synthesis runs once at page load, so the per-sample code avoids Math.exp /
  // Math.pow: envelopes are running products (e *= k each sample), pitch
  // sweeps multiply by a fixed step, harmonics come from the Chebyshev
  // recurrence, and slow modulators update every 16 samples (control rate).
  const TAU = Math.PI * 2;
  let SR = 44100;   // the rate being synthesised right now (set per sound)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Per-sample multiplier that makes e *= kd(tau) follow exp(-t / tau).
  function kd(tau) { return Math.exp(-1 / (Math.max(1e-6, tau) * SR)); }

  // mulberry32: tiny seeded PRNG so every synthesised sound is deterministic.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Topology-preserving state-variable filter (stable for any cutoff, fine to
  // sweep). After tick(): .lp lowpass, .bp band-pass normalised to unity peak,
  // .hp highpass. Sweeping callers re-set() at control rate.
  class Svf {
    constructor(fc, q) {
      this.ic1 = 0; this.ic2 = 0; this.a1 = 0; this.a2 = 0; this.a3 = 0; this.k = 1;
      this.lp = 0; this.bp = 0; this.hp = 0;
      this.set(fc || 1000, q || 0.7);
    }
    set(fc, q) {
      const g = Math.tan(Math.PI * clamp(fc, 20, SR * 0.45) / SR);
      this.k = 1 / Math.max(0.05, q);
      this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
    }
    tick(x) {
      const v3 = x - this.ic2;
      const v1 = this.a1 * this.ic1 + this.a2 * v3;
      const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
      this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
      this.lp = v2; this.bp = v1 * this.k; this.hp = x - this.k * v1 - v2;
      return v2;
    }
  }

  // Pink noise (Paul Kellet's refined filter) and brown noise (leaky integrator).
  function pinkGen(R) {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    return function () {
      const w = R() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
      const out = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
      return out;
    };
  }
  function brownGen(R) {
    let b = 0;
    return function () { b = (b + 0.02 * (R() * 2 - 1)) / 1.02; return b * 3.5; };
  }

  // Adds a decaying tone (with optional partials) starting at t0 seconds.
  // Sines come from the recurrence y[n] = 2cos(w)·y[n-1] − y[n-2].
  function addTone(d, t0, f, amp, decay, partials, attack) {
    const s0 = Math.max(0, Math.floor(t0 * SR));
    if (s0 >= d.length || !(f > 0) || !(decay > 0)) return;
    const pts = partials || PURE;
    const ka = kd(Math.max(1e-4, attack || 0.002));
    for (let p = 0; p < pts.length; p++) {
      const fr = f * pts[p][0];
      if (fr >= SR * 0.45) continue;
      const pa = amp * pts[p][1], pd = decay * pts[p][2];
      const n = Math.min(d.length - s0, Math.ceil(pd * 5 * SR));
      const w = TAU * fr / SR, c2 = 2 * Math.cos(w), kdec = kd(pd);
      let e = 1, ae = 1, y = 0, y1 = -Math.sin(w);
      for (let i = 0; i < n; i++) {
        d[s0 + i] += pa * (1 - ae) * e * y;
        const yn = c2 * y - y1; y1 = y; y = yn;
        e *= kdec; ae *= ka;
      }
    }
  }

  // A tiny rising-pitch sine blip: the sound of a bubble — the secret to "wet".
  function addBubble(d, t0, f0, dur, amp, rise) {
    const s0 = Math.max(0, Math.floor(t0 * SR));
    const n = Math.min(d.length - s0, Math.ceil(dur * SR));
    const ka = kd(0.0006), ke = Math.exp(-5 / (dur * SR)), df = f0 * rise / (dur * SR);
    let ph = 0, f = f0, a = 1, e = 1;
    for (let i = 0; i < n; i++) {
      ph += TAU * f / SR; f += df;
      d[s0 + i] += amp * (1 - a) * e * Math.sin(ph);
      a *= ka; e *= ke;
    }
  }

  // A short band-passed noise click (cracks, snips, crackle).
  function addNoiseBurst(d, R, t0, fc, q, tau, amp) {
    const s0 = Math.max(0, Math.floor(t0 * SR));
    if (s0 >= d.length) return;
    const n = Math.min(d.length - s0, Math.ceil(tau * 6 * SR));
    const f = new Svf(fc, q), ka = kd(0.0003), ke = kd(tau);
    let a = 1, e = 1;
    for (let i = 0; i < n; i++) {
      f.tick(R() * 2 - 1);
      d[s0 + i] += f.bp * amp * (1 - a) * e;
      a *= ka; e *= ke;
    }
  }

  function peakOf(d) {
    let pk = 0;
    for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
    return pk;
  }

  // Warm soft-clip: normalise, then tanh.
  function saturate(d, drive) {
    const pk = peakOf(d);
    if (!(pk > 1e-9)) return;
    const s = drive / pk, norm = 1 / Math.tanh(drive);
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * s) * norm;
  }

  // Final pass for every buffer: scrub non-finite samples, block DC, smooth
  // the tail to zero (no end click), normalise to K.PEAK.
  function finish(d) {
    const n = d.length;
    if (!n) return;
    const pole = 1 - TAU * 20 / SR;
    let x1 = 0, y1 = 0;
    for (let i = 0; i < n; i++) {
      let x = d[i];
      if (!Number.isFinite(x)) x = 0;
      const y = x - x1 + pole * y1;
      x1 = x; y1 = y; d[i] = y;
    }
    const fo = Math.min(Math.floor(n * 0.1), Math.floor(0.03 * SR));
    for (let k = 0; k < fo; k++) d[n - 1 - k] *= 0.5 - 0.5 * Math.cos(Math.PI * k / fo);
    const pk = peakOf(d);
    if (pk > 1e-9) { const s = K.PEAK / pk; for (let i = 0; i < n; i++) d[i] *= s; }
  }

  // ------------------------------------------------------------ the synths
  // Each fills d (a zeroed Float32Array of def.dur seconds at the current SR)
  // using the seeded random R; v is the variant index for small differences.

  // Tongue fires: wet stretchy "thwip / schlllp" — band-passed noise whose
  // centre shoots up, a rubbery rising tone, and a few bubble pops.
  function synthShoot(d, R, v) {
    const n = d.length, bp = new Svf();
    const f0 = 170 + v * 18, f1 = 800 + v * 60;
    const sweep = Math.ceil(0.11 * SR), fStep = Math.pow(f1 / f0, 1 / sweep);
    const kNA = kd(0.004), kND = kd(0.075), kTA = kd(0.003), kTD = kd(0.05);
    let f = f0, ph = 0, na = 1, nd = 1, ta = 1, td = 1;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) {
        const u = Math.min(1, i / SR / 0.17);
        bp.set(480 * Math.pow(7.8, 1 - Math.pow(1 - u, 2.2)), 3.2);   // fast rise, then settle
      }
      bp.tick(R() * 2 - 1);
      ph += TAU * f / SR;
      if (i < sweep) f *= fStep;
      d[i] = bp.bp * (1 - na) * nd * 3.2 + Math.sin(ph + 0.6 * Math.sin(2 * ph)) * (1 - ta) * td * 0.45;
      na *= kNA; nd *= kND; ta *= kTA; td *= kTD;
    }
    const nb = 3 + Math.floor(R() * 3);
    for (let b = 0; b < nb; b++) {
      addBubble(d, 0.015 + R() * 0.12, 900 + R() * 1300, 0.012 + R() * 0.014, 0.22 + R() * 0.18, 0.6 + R() * 0.5);
    }
  }

  // Tongue sticks: "thwock / splat" — a dropping low thump, a hollow tock, a
  // lowpassed noise splat, a wobbling squelch and a few bubbles.
  function synthAttach(d, R, v) {
    const n = d.length, lp = new Svf(), sq = new Svf(880 + v * 60, 5);
    const tockF = 420 + v * 35, sqStart = Math.floor(0.012 * SR);
    const kF = kd(0.018), kA1 = kd(0.002), kD1 = kd(0.07), kA2 = kd(0.0008), kD2 = kd(0.022);
    const kA3 = kd(0.0015), kD3 = kd(0.06), kA4 = kd(0.004), kD4 = kd(0.1);
    let p1 = 0, p2 = 0, fx = 110, wob = 0;
    let a1 = 1, d1 = 1, a2 = 1, d2 = 1, a3 = 1, d3 = 1, a4 = 1, d4 = 1;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      if ((i & 15) === 0) {
        lp.set(600 + 3800 * Math.exp(-t / 0.03), 0.9);
        wob = 0.55 + 0.45 * Math.sin(TAU * 26 * (t - 0.012));
      }
      p1 += TAU * (70 + fx) / SR; fx *= kF;                         // 180 -> 70 Hz thump
      p2 += TAU * tockF * (1 - 0.15 * Math.min(1, t / 0.05)) / SR;  // hollow tock
      const w = R() * 2 - 1;
      lp.tick(w); sq.tick(w);
      let out = Math.sin(p1) * (1 - a1) * d1 * 0.9 + Math.sin(p2) * (1 - a2) * d2 * 0.42 +
                lp.lp * (1 - a3) * d3 * 1.1;
      if (i >= sqStart) { out += sq.bp * (1 - a4) * d4 * wob * 1.3; a4 *= kA4; d4 *= kD4; }
      d[i] = out;
      a1 *= kA1; d1 *= kD1; a2 *= kA2; d2 *= kD2; a3 *= kA3; d3 *= kD3;
    }
    const nb = 4 + Math.floor(R() * 3);
    for (let b = 0; b < nb; b++) {
      addBubble(d, 0.01 + R() * 0.15, 600 + R() * 1000, 0.01 + R() * 0.02, 0.15 + R() * 0.2, 0.5 + R() * 0.6);
    }
  }

  // Missed lick: rubbery "boi-oi-oing" pitching down, then the tongue flops.
  function synthSnap(d, R, v) {
    const n = d.length, lp = new Svf(1900, 0.8), fl = new Svf(900, 0.8);
    const sweep = Math.ceil(0.42 * SR), fStep = Math.pow(0.33, 1 / sweep);
    const flopAt = Math.floor(0.3 * SR);
    const kA = kd(0.004), kD = kd(0.2), kFA = kd(0.002), kFD1 = kd(0.05), kFD2 = kd(0.06), kFF = kd(0.02);
    let base = 370 + v * 25, ph = 0, p2 = 0, ff = 45, wob = 0, mod = 1;
    let a = 1, e = 1, fa = 1, fd1 = 1, fd2 = 1;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) {        // the "oi-oi-oing": fading 13 Hz pitch + level wobble
        const t = i / SR;
        wob = Math.sin(TAU * 13 * t) * 0.14 * Math.exp(-t / 0.18);
        mod = 1 + 0.35 * Math.sin(TAU * 13 * t + 1) * Math.exp(-t / 0.15);
      }
      ph += TAU * base * (1 + wob) / SR;
      if (i < sweep) base *= fStep;
      const s = Math.sin(ph), c = Math.cos(ph);
      const tone = s + 0.6 * s * c + 0.12 * s * (3 - 4 * s * s);   // sin + .3 sin2 + .12 sin3
      lp.tick(tone * (1 - a) * e * mod);
      a *= kA; e *= kD;
      let flop = 0;
      if (i >= flopAt) {
        fl.tick(R() * 2 - 1);
        p2 += TAU * (70 + ff) / SR; ff *= kFF;
        flop = (fl.lp * fd1 * 0.9 + Math.sin(p2) * fd2 * 0.7) * (1 - fa);
        fa *= kFA; fd1 *= kFD1; fd2 *= kFD2;
      }
      d[i] = lp.lp * 0.7 + flop;
    }
  }

  // Let go: a soft wet lip-smack "pop".
  function synthRelease(d, R, v) {
    const n = d.length, hp = new Svf(2600, 0.7);
    const f0 = 500 + v * 50, sweep = Math.ceil(0.035 * SR), df = f0 * 1.1 / sweep;
    const kC = kd(0.0015), kPA = kd(0.0015), kPD = kd(0.028), kBA = kd(0.002), kBD = kd(0.025);
    const wB = TAU * 190 / SR;
    let f = f0, ph = 0, c = 1, pa = 1, pd = 1, ba = 1, bd = 1;
    for (let i = 0; i < n; i++) {
      hp.tick(R() * 2 - 1);
      ph += TAU * f / SR;
      if (i < sweep) f += df;
      d[i] = hp.hp * c * 0.5 + Math.sin(ph) * (1 - pa) * pd * 0.9 + Math.sin(wB * i) * (1 - ba) * bd * 0.35;
      c *= kC; pa *= kPA; pd *= kPD; ba *= kBA; bd *= kBD;
    }
    addBubble(d, 0.02 + R() * 0.02, 1200 + R() * 700, 0.015, 0.2, 0.8);
    addBubble(d, 0.045 + R() * 0.02, 1500 + R() * 600, 0.012, 0.14, 0.9);
  }

  // A plain swoosh: pink noise through a band that rises then falls.
  function synthSwing(d, R, v) {
    const n = d.length, bp = new Svf(), pink = pinkGen(R);
    let e = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) {
        const s = Math.sin(Math.PI * Math.pow(i / n, 0.7));
        e = s * s;
        bp.set(380 + 1150 * s + v * 60, 1.3);
      }
      bp.tick(pink());
      d[i] = bp.bp * e * 3;
    }
  }

  // Boost: a sparkly whoosh — rising noise band, a soft rising tone and an
  // ascending pentatonic sprinkle of glassy pings.
  function synthBoost(d, R) {
    const n = d.length, bp = new Svf();
    const sweep = Math.ceil(0.3 * SR), fStep = Math.pow(2, 1 / sweep);
    const kA = kd(0.03), kD = kd(0.22), kTA = kd(0.01), kTD = kd(0.15);
    let f = 280, ph = 0, a = 1, e = 1, ta = 1, td = 1;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) bp.set(450 * Math.pow(6, Math.pow(Math.min(1, i / SR / 0.45), 0.8)), 1.8);
      bp.tick(R() * 2 - 1);
      ph += TAU * f / SR;
      if (i < sweep) f *= fStep;
      d[i] = bp.bp * (1 - a) * e * 2.6 + Math.sin(ph) * (1 - ta) * td * 0.25;
      a *= kA; e *= kD; ta *= kTA; td *= kTD;
    }
    const notes = [1568, 1760, 2093, 2349, 2637, 3136, 3520];
    for (let k = 0; k < notes.length; k++) addTone(d, 0.03 + k * 0.045, notes[k], 0.2 * (1 - k * 0.06), 0.09, GLASS, 0.002);
  }

  // A comet passing: an airy, doppler-tilted whoosh with a faint low rumble.
  function synthMeteor(d, R, v) {
    const n = d.length, bp = new Svf(), lp = new Svf(160, 0.7);
    const pink = pinkGen(R), brown = brownGen(R);
    const peak = 0.45 + v * 0.1;      // where the pass-by is closest
    let e = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) {
        const u = i / n;
        const w = u < peak ? 0.5 * u / peak : 0.5 + 0.5 * (u - peak) / (1 - peak);
        const s = Math.sin(Math.PI * w);
        e = s * s;
        // the band slides down a little after closest approach (doppler)
        bp.set((320 + 1200 * s) * (1 + 0.14 * Math.tanh((peak - u) * 12)), 0.9);
      }
      bp.tick(pink()); lp.tick(brown());
      d[i] = (bp.bp * 2.4 + lp.lp * 0.8) * e;
    }
  }

  // Hooves meet the planet: a soft thud, a puff of dust and a tiny clip-clop.
  function synthLanding(d, R, v) {
    const n = d.length, lp = new Svf(700, 0.7), bp = new Svf(1500, 1.2);
    const kF = kd(0.025), kA = kd(0.002), kD = kd(0.09), kDA = kd(0.003), kDD = kd(0.05), kC = kd(0.004);
    const clop2 = Math.floor(0.022 * SR);
    let fx = 70, p1 = 0, a = 1, e = 1, da = 1, dd = 1, c1 = 1, c2 = 1;
    for (let i = 0; i < n; i++) {
      p1 += TAU * (58 + fx) / SR; fx *= kF;      // 128 -> 58 Hz thud
      const w = R() * 2 - 1;
      lp.tick(w); bp.tick(w);
      let clop = bp.bp * c1 * 0.35;
      if (i >= clop2) { clop += bp.bp * c2 * 0.25; c2 *= kC; }
      d[i] = Math.sin(p1) * (1 - a) * e + lp.lp * (1 - da) * dd * 0.5 + clop;
      a *= kA; e *= kD; da *= kDA; dd *= kDD; c1 *= kC;
    }
    addTone(d, 0, 680 + v * 30, 0.3, 0.018, PURE, 0.0005);       // clip...
    addTone(d, 0.022, 560 + v * 25, 0.22, 0.016, PURE, 0.0005);  // ...clop
  }

  // Jump: a cute little voiced "hup" — breathy h, a rising "uh" (buzz through
  // two vowel formants), then the lips close on a soft p.
  function synthJump(d, R, v) {
    const n = d.length, fa = new Svf(700, 5), fb = new Svf(1150, 7), br = new Svf(1800, 1), cl = new Svf(900, 0.8);
    const rise = Math.ceil(0.09 * SR), riseStep = Math.pow(1.7, 1 / rise);
    const fall = Math.ceil(0.05 * SR), fallStep = Math.pow(0.92, 1 / fall);
    const vS = Math.floor(0.012 * SR), cS = Math.floor(0.115 * SR), pS = Math.floor(0.122 * SR);
    const kVA = kd(0.008), kVD = kd(0.12), kCl = kd(0.006), kBA = kd(0.003), kBD = kd(0.014), kP = kd(0.003);
    let f = 230 + v * 20, ph = 0, va = 1, vd = 1, vc = 1, ba = 1, bd = 1, pe = 1;
    for (let i = 0; i < n; i++) {
      ph += TAU * f / SR;
      if (i < rise) f *= riseStep; else if (i < rise + fall) f *= fallStep;
      // band-limited buzz: sin(h·ph), h = 1..10, via sin((h+1)x) = 2cos(x)sin(hx) − sin((h−1)x)
      const s1 = Math.sin(ph), c2 = 2 * Math.cos(ph);
      let sPrev = 0, sCur = s1, saw = s1;
      for (let h = 2; h <= 10; h++) { const sN = c2 * sCur - sPrev; sPrev = sCur; sCur = sN; saw += sCur / h; }
      fa.tick(saw); fb.tick(saw);
      let venv = 0;
      if (i >= vS) { venv = (1 - va) * vd; va *= kVA; vd *= kVD; }
      if (i >= cS) { venv *= vc; vc *= kCl; }                   // lips close
      const w = R() * 2 - 1;
      br.tick(w); cl.tick(w);
      let out = (fa.bp * 0.9 + fb.bp * 0.5 + s1 * 0.3) * venv + br.bp * (1 - ba) * bd * 0.6;
      ba *= kBA; bd *= kBD;
      if (i >= pS) { out += cl.lp * pe * 0.3; pe *= kP; }        // soft "p"
      d[i] = out;
    }
  }

  // Comet-ice slab shatters: icy crackle — low rumble, a few cracks and a
  // shower of glassy tinkles that thins out.
  function synthCrumble(d, R) {
    const n = d.length, dur = n / SR, lp = new Svf(260, 0.7), brown = brownGen(R);
    const kA = kd(0.01), kD = kd(0.22);
    let a = 1, e = 1;
    for (let i = 0; i < n; i++) {
      lp.tick(brown());
      d[i] = lp.lp * (1 - a) * e * 0.9;
      a *= kA; e *= kD;
    }
    addNoiseBurst(d, R, 0, 1500 + R() * 700, 1.5, 0.012, 0.8);
    addNoiseBurst(d, R, 0.018 + R() * 0.01, 1800 + R() * 600, 1.5, 0.012, 0.65);
    addNoiseBurst(d, R, 0.06 + R() * 0.06, 1300 + R() * 800, 1.5, 0.012, 0.5);
    for (let k = 0; k < 70; k++) {
      const t0 = dur * 0.85 * Math.pow(R(), 1.8);
      addTone(d, t0, 2600 + R() * 5200, (0.1 + R() * 0.28) * (1 - t0 / dur), 0.003 + R() * 0.009, ICE, 0.0003);
    }
  }

  // Victory: a triumphant little bell arpeggio (C E G C) landing on a ringing
  // chord over a warm pad.
  function synthVictory(d) {
    const n = d.length;
    const arp = [523.25, 659.26, 783.99, 1046.5];
    for (let k = 0; k < arp.length; k++) addTone(d, k * 0.085, arp[k], 0.5, 0.35, BELL, 0.003);
    const chord = [[1046.5, 0.34], [1318.5, 0.3], [1568, 0.28], [2093, 0.12]];
    for (let j = 0; j < chord.length; j++) addTone(d, 0.38 + j * 0.012, chord[j][0], chord[j][1], 0.8, BELL, 0.004);
    // warm pad (C4 E4 G4, soft triangle-ish: fundamental + a ninth of the 3rd)
    const pad = [261.63, 329.63, 392];
    const ke = kd(0.7), ka = kd(0.12);
    for (let k = 0; k < pad.length; k++) {
      const w = TAU * pad[k] / SR, c1 = 2 * Math.cos(w), c3 = 2 * Math.cos(3 * w);
      let a = 0, a1 = -Math.sin(w), b = 0, b1 = -Math.sin(3 * w), e = 1, ae = 1;
      const ga = 0.12 * (1 - k * 0.2);
      for (let i = Math.floor(0.3 * SR); i < n; i++) {
        d[i] += (a + b / 9) * (1 - ae) * e * ga;
        let y = c1 * a - a1; a1 = a; a = y;
        y = c3 * b - b1; b1 = b; b = y;
        e *= ke; ae *= ka;
      }
    }
  }

  // Achievement: a bright two-note chime with a sprinkle on top.
  function synthAchievement(d) {
    addTone(d, 0, 1318.5, 0.5, 0.5, CHIME, 0.002);
    addTone(d, 0.1, 1975.5, 0.55, 0.65, CHIME, 0.002);
    const sp = [2637, 3136, 3951, 4186];
    for (let k = 0; k < sp.length; k++) addTone(d, 0.14 + k * 0.05, sp[k], 0.08, 0.08, PURE, 0.002);
  }

  // Menu hover: a very soft woody tick.
  function synthUiMove(d, R) {
    const n = d.length, lp = new Svf(3000, 0.7);
    const w1 = TAU * 1650 / SR, kA = kd(0.0005), kD1 = kd(0.007), kD2 = kd(0.003), kD3 = kd(0.0015);
    let a = 1, e1 = 1, e2 = 1, e3 = 1;
    for (let i = 0; i < n; i++) {
      lp.tick(R() * 2 - 1);
      d[i] = Math.sin(w1 * i) * (1 - a) * e1 * 0.8 + Math.sin(2 * w1 * i) * e2 * 0.2 + lp.lp * e3 * 0.15;
      a *= kA; e1 *= kD1; e2 *= kD2; e3 *= kD3;
    }
  }

  // Menu confirm: two soft blips rising a fifth.
  function synthUiSelect(d) {
    addTone(d, 0, 740, 0.6, 0.045, SOFT, 0.002);
    addTone(d, 0.055, 1110, 0.55, 0.07, SOFT, 0.002);
  }

  // A comet slices the tongue: a wet scissor "snip-snip".
  function synthCut(d, R, v) {
    const n = d.length;
    addNoiseBurst(d, R, 0, 6000 - v * 300, 2, 0.006, 1.0);
    addTone(d, 0, 4200 + v * 200, 0.3, 0.004, PURE, 0.0002);
    addNoiseBurst(d, R, 0.028, 5200, 2, 0.005, 0.6);
    addTone(d, 0.028, 3700, 0.2, 0.004, PURE, 0.0002);
    addBubble(d, 0.01, 1800, 0.03, 0.35, 0.8);
    addBubble(d, 0.045, 1300, 0.028, 0.25, 0.9);
    const lp = new Svf(1200, 0.8), s0 = Math.floor(0.01 * SR), kA = kd(0.002), kD = kd(0.03);
    let a = 1, e = 1;
    for (let i = s0; i < n; i++) {       // a low wet splat under the snips
      lp.tick(R() * 2 - 1);
      d[i] += lp.lp * (1 - a) * e * 0.3;
      a *= kA; e *= kD;
    }
  }

  // A phase crystal vanishes under the tongue: glassy detuned partials with an
  // accelerating flutter gliding down, and a descending trickle of sparkles.
  function synthPhase(d) {
    const n = d.length, dur = n / SR;
    const fr = [1661, 2217, 2489, 3322], det = [1.0025, 0.9975], wgt = [0.5, 0.42, 0.34, 0.26];
    const y = new Float64Array(8), y1 = new Float64Array(8), c2 = new Float64Array(8);
    for (let j = 0; j < 8; j++) {
      const w = TAU * fr[j >> 1] * det[j & 1] / SR;
      y1[j] = -Math.sin(w); c2[j] = 2 * Math.cos(w);
    }
    let amp = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) {        // glide, envelope and flutter at control rate
        const t = i / SR, u = t / dur, glide = 1 - 0.06 * u;
        const env = (1 - Math.exp(-t / 0.01)) * Math.exp(-t / 0.35);
        const trem = 1 - 0.5 * (0.5 + 0.5 * Math.sin(TAU * (9 + 14 * u) * t)) * Math.min(1, t / 0.2);
        amp = env * trem * 0.3;
        for (let j = 0; j < 8; j++) c2[j] = 2 * Math.cos(TAU * fr[j >> 1] * det[j & 1] * glide / SR);
      }
      let s = 0;
      for (let j = 0; j < 8; j++) {  // detuned pairs beat against each other = the shimmer
        const yn = c2[j] * y[j] - y1[j]; y1[j] = y[j]; y[j] = yn;
        s += yn * wgt[j >> 1];
      }
      d[i] = s * amp;
    }
    for (let k = 0; k < 8; k++) addTone(d, 0.05 + k * 0.07, 3950 * Math.pow(0.87, k), 0.18 * (1 - k / 10), 0.06, GLASS, 0.002);
  }

  // Death: a short comic "bwoop" — a tiny rise, then a soft triangle falling
  // away and darkening.
  function synthDeath(d) {
    const n = d.length, lp = new Svf();
    const riseN = Math.ceil(0.04 * SR), riseStep = Math.pow(620 / 480, 1 / riseN);
    const fallN = Math.ceil(0.4 * SR), fallStep = Math.pow(105 / 620, 1 / fallN);
    const relS = Math.floor(0.36 * SR), kA = kd(0.006), kR = kd(0.05);
    let f = 480, ph = 0, a = 1, r = 1, vib = 1;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) { vib = 1 + 0.03 * Math.sin(TAU * 9 * i / SR); lp.set(Math.min(f * 4, 5000), 1.2); }
      ph += TAU * f * vib / SR;
      if (i < riseN) f *= riseStep; else if (i < riseN + fallN) f *= fallStep;
      const s1 = Math.sin(ph), c2 = 2 * Math.cos(ph);
      const s2 = c2 * s1, s3 = c2 * s2 - s1, s4 = c2 * s3 - s2, s5 = c2 * s4 - s3, s6 = c2 * s5 - s4, s7 = c2 * s6 - s5;
      lp.tick(s1 - s3 / 9 + s5 / 25 - s7 / 49 + 0.35 * s2);   // triangle + a little 2nd = "oo"
      let env = 1 - a;
      a *= kA;
      if (i >= relS) { env *= r; r *= kR; }
      d[i] = lp.lp * env;
    }
  }

  // Respawn: a warp-in — noise and a gliss swelling upward, landing on a ding.
  function synthRespawn(d, R) {
    const n = d.length, bp = new Svf(), tN = Math.floor(0.7 * SR);
    const gStep = Math.pow(4, 1 / tN), kS = kd(0.06), kG = kd(0.08);
    let f = 220, ph = 0, swell = 0, gEnv = 0, trem = 1, sd = 1, gd = 1;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) {
        const t = i / SR, u = Math.min(1, i / tN);
        bp.set(300 * Math.pow(16, u), 2.5);
        if (i < tN) { swell = Math.pow(u, 1.5); gEnv = Math.pow(u, 1.2); }
        trem = 0.65 + 0.35 * Math.sin(TAU * 22 * t);
      }
      bp.tick(R() * 2 - 1);
      ph += TAU * f / SR;
      let sw = swell, ge = gEnv;
      if (i < tN) f *= gStep;
      else { sw = sd; ge = gd; sd *= kS; gd *= kG; }
      d[i] = bp.bp * sw * 2.2 + Math.sin(ph) * ge * trem * 0.3;
    }
    addTone(d, 0.68, 1046.5, 0.4, 0.3, BELL, 0.002);
    addTone(d, 0.7, 1568, 0.3, 0.25, BELL, 0.002);
  }

  // Reaching the Celestial Acacia: munch-munch — four leafy crunches (grains
  // of band-passed noise), each with a chomp body and a contented "mm".
  function synthMunch(d, R) {
    const n = d.length, cr = new Svf(2400, 0.9), body = new Svf(500, 0.8);
    const chews = [0, 0.3, 0.6, 0.92], amps = [1, 0.85, 0.95, 0.7];
    // envelopes first: crunch grains (10-14 tiny clicks per chew) and chomp bodies
    const grain = new Float32Array(n), bodyEnv = new Float32Array(n);
    const kG = kd(0.004), gLen = Math.ceil(0.03 * SR), kBA = kd(0.002), kBD = kd(0.04), bLen = Math.ceil(0.25 * SR);
    for (let c = 0; c < chews.length; c++) {
      const m = 10 + Math.floor(R() * 5);
      for (let k = 0; k < m; k++) {
        const s0 = Math.floor((chews[c] + Math.pow(R(), 1.5) * 0.06) * SR);
        let e = (0.25 + R() * 0.3) * amps[c];
        for (let j = 0; j < gLen && s0 + j < n; j++) { grain[s0 + j] += e; e *= kG; }
      }
      const b0 = Math.floor(chews[c] * SR);
      let ba = 1, bd = amps[c];
      for (let j = 0; j < bLen && b0 + j < n; j++) { bodyEnv[b0 + j] += (1 - ba) * bd; ba *= kBA; bd *= kBD; }
    }
    for (let i = 0; i < n; i++) {
      const w = R() * 2 - 1;
      cr.tick(w); body.tick(w);
      d[i] = cr.bp * grain[i] * 2.2 + body.lp * bodyEnv[i] * 0.6;
    }
    // the "mm" hum after each chew, dipping a little in pitch
    const kHA = kd(0.02), kHD = kd(0.08), hLen = Math.ceil(0.4 * SR), dipN = Math.ceil(0.15 * SR), df = 25 / dipN;
    for (let c = 0; c < chews.length; c++) {
      const s0 = Math.floor((chews[c] + 0.06) * SR);
      let f = 170, ph = 0, a = 1, e = amps[c] * 0.35;
      for (let j = 0; j < hLen && s0 + j < n; j++) {
        ph += TAU * f / SR;
        if (j < dipN) f -= df;
        const s = Math.sin(ph);
        d[s0 + j] += (s + 0.9 * s * Math.cos(ph)) * (1 - a) * e;   // sin + .45 sin2
        a *= kHA; e *= kHD;
      }
    }
  }

  // Solar flare ignites: a low roar that swells and brightens, with crackle.
  function synthFlare(d, R) {
    const n = d.length, lp = new Svf(), brown = brownGen(R);
    const envAt = (t) => (t < 0.55 ? Math.pow(t / 0.55, 1.6) : Math.exp(-(t - 0.55) / 0.55));
    const w1 = TAU * 48 / SR, w2 = TAU * 72.5 / SR, w3 = 3 * w1;
    const c1 = 2 * Math.cos(w1), c2 = 2 * Math.cos(w2), c3 = 2 * Math.cos(w3);
    let y1 = 0, z1 = -Math.sin(w1), y2 = 0, z2 = -Math.sin(w2), y3 = 0, z3 = -Math.sin(w3), env = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0) { env = envAt(i / SR); lp.set(180 + 900 * env, 0.8); }
      lp.tick(brown());
      let t = c1 * y1 - z1; z1 = y1; y1 = t;
      t = c2 * y2 - z2; z2 = y2; y2 = t;
      t = c3 * y3 - z3; z3 = y3; y3 = t;
      d[i] = lp.lp * env * 1.6 + (y1 + 0.7 * y2 + 0.25 * y3) * env * 0.35;
    }
    for (let k = 0; k < 40; k++) {
      const t0 = 0.3 + R() * 1.0;
      addNoiseBurst(d, R, t0, 900 + R() * 1600, 1.2, 0.003, (0.08 + R() * 0.15) * envAt(t0));
    }
    saturate(d, 1.3);
  }

  // A new run: a launch whoosh with a thrusty low tone and a little sparkle.
  function synthRunStart(d, R) {
    const n = d.length, bp = new Svf(), pink = pinkGen(R), tN = Math.floor(0.45 * SR);
    const fStep = Math.pow(2, 1 / tN), kD = kd(0.18);
    let f = 65, ph = 0, env = 0, dec = 1;
    for (let i = 0; i < n; i++) {
      if ((i & 15) === 0 && i < tN) {
        const u = i / tN;
        env = Math.pow(u, 1.3);
        bp.set(220 * Math.pow(10, Math.pow(u, 0.9)), 1.4);
      }
      let e = env;
      if (i < tN) f *= fStep; else { e = dec; dec *= kD; }
      bp.tick(pink());
      ph += TAU * f / SR;
      const s = Math.sin(ph);
      d[i] = bp.bp * e * 3 + (s + 0.6 * s * Math.cos(ph)) * e * 0.35;
    }
    const sp = [1568, 1975.5, 2349];
    for (let k = 0; k < sp.length; k++) addTone(d, 0.42 + k * 0.05, sp[k], 0.15, 0.12, GLASS, 0.002);
  }

  // ------------------------------------------------ loops & reverb impulse

  // Stereo wind loop: softly tilted noise with slow gusts (the live lowpass
  // does the real shaping). The last 0.3 s is crossfaded into the start so
  // the loop is seamless; the right channel is the same loop read from 41%
  // further round — uncorrelated with the left, so it sounds wide for free —
  // and the gust LFOs complete whole cycles per loop.
  function buildWindLoop(ctx) {
    const L = Math.max(2, Math.floor(K.WIND_LOOP_SEC * SR)), F = Math.min(Math.floor(0.3 * SR), L >> 1);
    const R = rng(9001), tmp = new Float32Array(L + F), mono = new Float32Array(L);
    let lp = 0;
    for (let i = 0; i < L + F; i++) { lp += 0.25 * ((R() * 2 - 1) - lp); tmp[i] = lp; }
    for (let i = 0; i < L; i++) {
      if (i < F) { const u = i / F; mono[i] = tmp[i] * Math.sin(u * Math.PI / 2) + tmp[L + i] * Math.cos(u * Math.PI / 2); }
      else mono[i] = tmp[i];
    }
    const buf = ctx.createBuffer(2, L, SR);
    const off = Math.floor(L * 0.41);
    let pk = 0;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let gust = 1;
      for (let i = 0; i < L; i++) {
        if ((i & 15) === 0) {
          const c = i / L;   // 0..1 around the loop
          gust = 0.75 + 0.15 * Math.sin(TAU * 2 * c + ch * 1.7) + 0.1 * Math.sin(TAU * 5 * c + ch * 2.9);
        }
        const x = mono[ch ? (i + off) % L : i] * gust;
        d[i] = x;
        const a = x < 0 ? -x : x;
        if (a > pk) pk = a;
      }
    }
    if (pk > 1e-9) {
      const s = 0.8 / pk;
      for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < L; i++) d[i] *= s; }
    }
    return buf;
  }

  // "Space hall" impulse: decorrelated stereo noise decaying exponentially,
  // growing darker as it fades (a one-pole lowpass that closes over time).
  // Must be built at the context's own sample rate (ConvolverNode rule).
  function buildImpulse(ctx) {
    const n = Math.max(1, Math.floor(K.REVERB_SEC * SR)), pre = Math.floor(0.012 * SR);
    const fo = Math.floor(n * 0.05);
    const buf = ctx.createBuffer(2, n, SR);
    for (let ch = 0; ch < 2; ch++) {
      const R = rng(4242 + ch * 131), d = buf.getChannelData(ch);
      const kdec = kd(K.REVERB_DECAY);
      let lp = 0, e = 1;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / SR;
        const coef = 0.15 + 0.8 * Math.min(1, t / 1.2);
        lp += (1 - coef) * ((R() * 2 - 1) - lp);
        d[i] = lp * e * Math.min(1, t / 0.004);
        e *= kdec;
      }
      for (let k = 0; k < fo; k++) d[n - 1 - k] *= k / fo;
    }
    return buf;
  }

  // --------------------------------------------------------------- module
  ASCENT.Audio = {
    master: 0.7,
    music: null,            // the <audio> element
    ctx: null,
    snd: {},                // name -> [AudioBuffer variants]

    _bus: null, _sfx: null, _comp: null, _rev: null, _revOut: null,
    _canPan: false,
    _unlocked: false,
    _hidden: false,
    _warned: false,
    _fxHooked: false,
    _windBuf: null,
    _loops: null, _loopsTried: false,
    _ends: {}, _endsList: [], _lastStart: {}, _rr: {},
    _ctlT: 0,
    _whistleOn: false,
    _tActive: false, _tRatio: 0,
    _munchIdx: 0,
    // last value sent to each ambient AudioParam (NaN = unknown, re-send)
    _last: { bus: NaN, windG: NaN, windF: NaN, whisG: NaN, tenG: NaN, tenF1: NaN, tenF2: NaN,
             tenCut: NaN, tenVib: NaN, wellG: NaN, wellF: NaN, wellF2: NaN },

    init(musicEl) {
      this.music = musicEl || null;
      this.master = ASCENT.CONFIG.DEFAULT_MASTER_VOLUME;
      this.updateMusicVolume();
      let AC = null;
      try { AC = window.AudioContext || window.webkitAudioContext; } catch (e) { AC = null; }
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
      try {
        SR = this.ctx.sampleRate || 44100;
        this._buildGraph();
      } catch (e) {
        this._warn(e);
        try { this.ctx.close(); } catch (e2) { /* ignore */ }
        this.ctx = null; this._bus = null;
        return;
      }
      this._synthAll();
      try {
        if (typeof document !== 'undefined' && document.addEventListener) {
          this._hidden = document.hidden === true;
          document.addEventListener('visibilitychange', () => {
            this._hidden = document.hidden === true;
            if (this._hidden) this._silence();
          });
        }
      } catch (e) { /* no document events: stay audible */ }
      if (!this._fxHooked && ASCENT.FX && typeof ASCENT.FX.on === 'function') {
        this._fxHooked = true;
        ASCENT.FX.on((type, d) => this._onFx(type, d));
      }
    },

    // First user gesture: let the context run and start the music. Safe to
    // call repeatedly (a keypress like Esc may not count as a gesture, so the
    // later mousedown gets another go at resume()).
    unlock() {
      this._unlocked = true;
      const ctx = this.ctx;
      if (ctx && ctx.state !== 'running' && typeof ctx.resume === 'function') {
        try { const pr = ctx.resume(); if (pr && typeof pr.catch === 'function') pr.catch(() => {}); } catch (e) { /* ignore */ }
      }
      this.updateMusicVolume();
      const m = this.music;
      if (m && this._enabled() && m.paused !== false && typeof m.play === 'function') {
        try { const pr = m.play(); if (pr && typeof pr.catch === 'function') pr.catch(() => {}); } catch (e) { /* ignore */ }
      }
    },

    update(g, dt) {
      if (!this._unlocked) this._autoUnlock();
      if (!this._ready()) return;
      try { this._update(g, dt); } catch (e) { this._warn(e); }
    },

    play(name, vol, pitch) {
      if (!this._unlocked) this._autoUnlock();
      if (!this._ready() || !this._enabled()) return;
      try { this._voice(name, vol, pitch, this._autoPan(name), 0); } catch (e) { this._warn(e); }
    },

    // The tongue's stretch hum. Called every gameplay frame; only stores the
    // wish — update() turns it into smooth gain/pitch ramps (and silences it
    // outside gameplay). A flip on/off is applied at once.
    setTension(active, ratio) {
      const a = !!active;
      const r = Number.isFinite(ratio) ? clamp(ratio, 0, 1) : 0;
      const flip = a !== this._tActive;
      this._tActive = a;
      this._tRatio = r;
      if (flip && this._loops && this._ready()) {
        try { this._applyTension(this.ctx.currentTime, this._isPlaying(ASCENT.Game), ASCENT.Game); } catch (e) { this._warn(e); }
      }
    },

    updateMusicVolume() {
      if (!this.music) return;
      const v = this._enabled() ? this.master * ASCENT.CONFIG.MUSIC_VOLUME_FACTOR : 0;
      try { this.music.volume = clamp(Number.isFinite(v) ? v : 0, 0, 1); } catch (e) { /* ignore */ }
    },

    setMasterVolume(v) {
      v = +v;
      if (!Number.isFinite(v)) return;
      this.master = clamp(v, 0, 1);
      this.updateMusicVolume();
      if (this._ready()) {
        try {
          const on = this._enabled() && !this._hidden;
          this._target('bus', this._bus.gain, on ? this.master : 0, this.ctx.currentTime, 0.03);
          if (on) this._voice('uiMove', 0.9, 1, 0, 0.02);   // a tick at the new level, as feedback
        } catch (e) { this._warn(e); }
      }
    },

    // ------------------------------------------------------------ internals

    _enabled() {
      const o = ASCENT.Save && ASCENT.Save.options;
      return !o || o.soundEnabled !== false;
    },

    // Audio may run once the user has gestured (or the browser already lets
    // the context run, e.g. a returning visitor).
    _ready() {
      return !!(this.ctx && this._bus && (this._unlocked || this.ctx.state === 'running'));
    },

    // main.js unlocks on window keydown/mousedown, but the game's own input
    // handlers run first — so the very first click (e.g. LAUNCH) would lose
    // its sounds. If the browser says the page has had a user gesture, unlock
    // right here (resume() is allowed then). Also covers touch gestures.
    _autoUnlock() {
      if (!this.ctx) return;
      try {
        const ua = typeof navigator !== 'undefined' ? navigator.userActivation : null;
        if (ua && (ua.isActive || ua.hasBeenActive)) this.unlock();
      } catch (e) { /* no userActivation API: main.js's listeners handle it */ }
    },

    _isPlaying(g) {
      return !!(g && g.player && g.state === 'playing' && this._enabled() && !this._hidden);
    },

    _warn(e) {
      if (this._warned) return;
      this._warned = true;
      try { if (window.console) console.warn('[Audio]', e); } catch (e2) { /* ignore */ }
    },

    // voices -> _sfx -> _bus (master) -> _comp -> speakers; sends -> _rev -> _revOut -> _bus
    _buildGraph() {
      const ctx = this.ctx;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = K.COMP_THRESHOLD;
      comp.knee.value = K.COMP_KNEE;
      comp.ratio.value = K.COMP_RATIO;
      comp.attack.value = K.COMP_ATTACK;
      comp.release.value = K.COMP_RELEASE;
      const bus = ctx.createGain();
      bus.gain.value = this.master;
      const sfx = ctx.createGain();
      sfx.gain.value = 1;
      sfx.connect(bus);
      bus.connect(comp);
      comp.connect(ctx.destination);
      this._comp = comp; this._bus = bus; this._sfx = sfx;
      this._canPan = typeof ctx.createStereoPanner === 'function';
      try {
        const rev = ctx.createConvolver();
        rev.normalize = true;
        rev.buffer = buildImpulse(ctx);
        const ret = ctx.createGain();
        ret.gain.value = K.REVERB_RETURN;
        rev.connect(ret);
        ret.connect(bus);
        this._rev = rev; this._revOut = ret;
      } catch (e) { this._rev = null; this._revOut = null; }
    },

    // Pre-render every one-shot (and the wind loop) as sample math. SR is
    // switched per sound (full or half rate) and always restored — the
    // reverb impulse (built earlier) must match the context's rate exactly.
    _synthAll() {
      const ctx = this.ctx;
      const full = ctx.sampleRate || 44100;
      // createBuffer below 22.05 kHz isn't safe on older Safari
      const half = Math.min(full, Math.max(22050, Math.round(full / 2)));
      try {
        for (const name in SOUNDS) {
          const def = SOUNDS[name], list = [];
          SR = def.half ? half : full;
          const n = Math.max(1, Math.ceil(def.dur * SR));
          for (let v = 0; v < def.vars; v++) {
            try {
              const buf = ctx.createBuffer(1, n, SR);
              const d = buf.getChannelData(0);
              def.fn(d, rng(hashStr(name) + v * 7919), v);
              finish(d);
              list.push(buf);
            } catch (e) { this._warn(e); }
          }
          this.snd[name] = list;
          if (!this._ends[name]) {
            const ends = new Float64Array(Math.max(1, def.max));
            this._ends[name] = ends;
            this._endsList.push(ends);
            this._lastStart[name] = -1;
            this._rr[name] = 0;
          }
        }
        SR = half;   // the wind is lowpassed live at <= 2.6 kHz, so half rate is plenty
        try { this._windBuf = buildWindLoop(ctx); } catch (e) { this._windBuf = null; this._warn(e); }
      } finally {
        SR = full;
      }
    },

    // The continuous layers — created once, then only modulated.
    _buildLoops() {
      if (this._loopsTried) return;
      this._loopsTried = true;
      const ctx = this.ctx, bus = this._bus;
      const L = {};
      try {
        // flying wind
        if (this._windBuf) {
          const src = ctx.createBufferSource();
          src.buffer = this._windBuf;
          src.loop = true;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = K.WIND_CUT_MIN;
          lp.Q.value = 0.8;
          const gn = ctx.createGain();
          gn.gain.value = 0;
          src.connect(lp); lp.connect(gn); gn.connect(bus);
          src.start(0);
          L.windFilter = lp; L.windGain = gn;
        }
        // falling whistle (sine + vibrato LFO on its frequency)
        const wo = ctx.createOscillator();
        wo.type = 'sine';
        wo.frequency.value = K.WHISTLE_START_HZ;
        const wlfo = ctx.createOscillator();
        wlfo.frequency.value = K.WHISTLE_VIB_HZ;
        const wdepth = ctx.createGain();
        wdepth.gain.value = K.WHISTLE_VIB_DEPTH;
        wlfo.connect(wdepth); wdepth.connect(wo.frequency);
        const wg = ctx.createGain();
        wg.gain.value = 0;
        wo.connect(wg); wg.connect(bus);
        if (this._rev) { const ws = ctx.createGain(); ws.gain.value = 0.25; wg.connect(ws); ws.connect(this._rev); }
        wo.start(0); wlfo.start(0);
        L.whistle = wo; L.whistleGain = wg;
        // tongue tension: triangle + a slightly sharp octave through a resonant
        // lowpass, with a strain vibrato whose depth grows with the stretch
        const t1 = ctx.createOscillator();
        t1.type = 'triangle';
        t1.frequency.value = K.TENSION_BASE_HZ;
        const t2 = ctx.createOscillator();
        t2.type = 'sine';
        t2.frequency.value = K.TENSION_BASE_HZ * 2.006;
        const t2g = ctx.createGain();
        t2g.gain.value = 0.45;
        const tf = ctx.createBiquadFilter();
        tf.type = 'lowpass';
        tf.frequency.value = 700;
        tf.Q.value = 3;
        const tlfo = ctx.createOscillator();
        tlfo.frequency.value = 6.5;
        const tvib = ctx.createGain();
        tvib.gain.value = 0;
        tlfo.connect(tvib); tvib.connect(t1.frequency); tvib.connect(t2.frequency);
        const tg = ctx.createGain();
        tg.gain.value = 0;
        t1.connect(tf); t2.connect(t2g); t2g.connect(tf); tf.connect(tg); tg.connect(bus);
        t1.start(0); t2.start(0); tlfo.start(0);
        L.ten1 = t1; L.ten2 = t2; L.tenFilter = tf; L.tenVib = tvib; L.tenGain = tg;
        // black-hole drone: triangle + fifth, lowpassed, with a slow "wub"
        // tremolo stage BEFORE the controlled gain (so silence stays silent)
        const w1 = ctx.createOscillator();
        w1.type = 'triangle';
        w1.frequency.value = K.WELL_HZ;
        const w2 = ctx.createOscillator();
        w2.type = 'sine';
        w2.frequency.value = K.WELL_HZ * 1.5;
        const w2g = ctx.createGain();
        w2g.gain.value = 0.5;
        const wf = ctx.createBiquadFilter();
        wf.type = 'lowpass';
        wf.frequency.value = 520;
        wf.Q.value = 1.2;
        const trem = ctx.createGain();
        trem.gain.value = 1;
        const blfo = ctx.createOscillator();
        blfo.frequency.value = 3.2;
        const bdepth = ctx.createGain();
        bdepth.gain.value = 0.35;
        blfo.connect(bdepth); bdepth.connect(trem.gain);
        const wellG = ctx.createGain();
        wellG.gain.value = 0;
        w1.connect(wf); w2.connect(w2g); w2g.connect(wf); wf.connect(trem); trem.connect(wellG); wellG.connect(bus);
        w1.start(0); w2.start(0); blfo.start(0);
        L.well = w1; L.well2 = w2; L.wellGain = wellG;
        this._loops = L;
      } catch (e) { this._loops = null; this._warn(e); }
    },

    // Glide an AudioParam toward v, skipping near-identical re-sends so we
    // don't flood the automation timeline 30 times a second.
    _target(key, param, v, now, tc) {
      if (!param || !Number.isFinite(v) || !Number.isFinite(now)) return;
      const last = this._last[key];
      if (last === last && Math.abs(v - last) <= Math.max(1e-4, Math.abs(last) * 0.01)) return;
      this._last[key] = v;
      try { param.setTargetAtTime(v, now, tc); } catch (e) { /* ignore */ }
    },

    // Tab hidden: rAF (and so update) stops, so fade the whole bus out here
    // and forget the cached targets so update() re-sends them on return.
    _silence() {
      if (!this.ctx || !this._bus) return;
      try { this._bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); } catch (e) { /* ignore */ }
      for (const k in this._last) this._last[k] = NaN;
      this._whistleOn = false;
    },

    _update(g, dt) {
      if (!this._loopsTried) this._buildLoops();
      this._ctlT += dt > 0 && dt < 1 ? dt : 0;
      if (this._ctlT < 1 / K.CONTROL_HZ) return;
      this._ctlT = 0;

      const now = this.ctx.currentTime;
      const on = this._enabled() && !this._hidden;
      this._target('bus', this._bus.gain, on ? this.master : 0, now, 0.03);
      const L = this._loops;
      if (!L || !g) return;
      const p = g.player;
      const playing = this._isPlaying(g);

      // 1) flying wind follows speed (plus a gust inside solar-wind currents)
      if (L.windGain) {
        let s = 0;
        if (playing) {
          const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          s = Number.isFinite(sp) ? clamp((sp - K.WIND_SPEED_MIN) / (K.WIND_SPEED_MAX - K.WIND_SPEED_MIN), 0, 1) : 0;
          if (this._inWindZone(g, p)) s = Math.min(1, s + K.WIND_ZONE_BONUS);
        }
        this._target('windG', L.windGain.gain, playing ? K.WIND_FLOOR + K.WIND_GAIN * Math.pow(s, 1.3) : 0, now, playing ? 0.12 : 0.25);
        this._target('windF', L.windFilter.frequency, K.WIND_CUT_MIN * Math.pow(K.WIND_CUT_MAX / K.WIND_CUT_MIN, s), now, 0.15);
      }

      // 2) cartoon falling whistle: each new fast-fall restarts it high and
      //    lets it slide down for as long as the fall lasts
      const licking = !!(g.rope && (g.rope.active || g.rope.shooting));
      const fs = playing && Number.isFinite(g.fallShake) && (K.WHISTLE_WHILE_LICKING || !licking)
        ? clamp(g.fallShake, 0, 1) : 0;
      if (fs > 0.02 && !this._whistleOn) {
        this._whistleOn = true;
        const fq = L.whistle.frequency;
        try {
          fq.cancelScheduledValues(now);
          fq.setTargetAtTime(K.WHISTLE_START_HZ, now, 0.015);
          fq.setTargetAtTime(K.WHISTLE_END_HZ, now + 0.06, K.WHISTLE_FALL_TC);
        } catch (e) { /* ignore */ }
      } else if (fs <= 0.02 && this._whistleOn) {
        this._whistleOn = false;
      }
      this._target('whisG', L.whistleGain.gain, fs * K.WHISTLE_GAIN, now, fs > 0 ? 0.08 : 0.12);

      // 3) tongue tension hum
      this._applyTension(now, playing, g);

      // 4) black-hole drone: louder and lower the deeper into a well's pull
      let wi = 0;
      if (playing && g.gravityWells) {
        const ws = g.gravityWells;
        for (let i = 0; i < ws.length; i++) {
          const w = ws[i], reach = w.radius * 2;
          if (!(reach > 0)) continue;
          const dx = p.x - w.x, dy = p.y - w.y;
          const k = 1 - Math.sqrt(dx * dx + dy * dy) / reach;
          if (k > wi) wi = k;
        }
        if (!Number.isFinite(wi)) wi = 0;
      }
      this._target('wellG', L.wellGain.gain, Math.pow(wi, 1.5) * K.WELL_GAIN, now, 0.2);
      this._target('wellF', L.well.frequency, K.WELL_HZ * (1 - 0.3 * wi), now, 0.25);
      this._target('wellF2', L.well2.frequency, K.WELL_HZ * 1.5 * (1 - 0.3 * wi), now, 0.25);

      // 5) the giraffe keeps munching at the Acacia (quieter each time)
      const goal = g.goal;
      if (!goal || !goal.reached) this._munchIdx = 0;
      else if (playing && Number.isFinite(goal.reachedAt) && this._munchIdx < K.MUNCH_REPEAT_AT.length) {
        if (g.time - goal.reachedAt >= K.MUNCH_REPEAT_AT[this._munchIdx]) {
          this._voice('munch', K.MUNCH_REPEAT_VOL[this._munchIdx], 1, 0, 0);
          this._munchIdx++;
        }
      }
    },

    _applyTension(now, playing, g) {
      const L = this._loops;
      if (!L) return;
      const r = this._tRatio;
      let lvl = 0, s = 0;
      if (playing && this._tActive) {
        s = clamp((r - K.TENSION_FROM) / (K.TENSION_FULL - K.TENSION_FROM), 0, 1);
        lvl = s * s * (3 - 2 * s) * K.TENSION_GAIN;
        if (g && g.rope && g.rope.taut === false) lvl *= K.TENSION_SLACK;
      }
      this._target('tenG', L.tenGain.gain, lvl, now, 0.06);
      if (!this._tActive) return;   // hold the pitch while silent: no swoop on the next lick
      const f = K.TENSION_BASE_HZ * Math.pow(2, K.TENSION_OCTAVES * r);
      this._target('tenF1', L.ten1.frequency, f, now, 0.08);
      this._target('tenF2', L.ten2.frequency, f * 2.006, now, 0.08);
      this._target('tenCut', L.tenFilter.frequency, 450 + 1500 * r, now, 0.1);
      this._target('tenVib', L.tenVib.gain, f * (0.004 + 0.02 * s), now, 0.2);
    },

    _inWindZone(g, p) {
      const zs = g.windZones;
      if (!zs) return false;
      for (let i = 0; i < zs.length; i++) {
        const z = zs[i];
        if (p.x > z.x - z.width / 2 && p.x < z.x + z.width / 2 &&
            p.y > z.y - z.height / 2 && p.y < z.y + z.height / 2) return true;
      }
      return false;
    },

    // Stereo position of a world x relative to the camera centre.
    _panX(x) {
      const g = ASCENT.Game, c = g && g.camera;
      if (!c || !Number.isFinite(x) || !Number.isFinite(c.cx) || !(c.viewW > 0)) return 0;
      return clamp((x - c.cx) / (c.viewW * 0.5), -1, 1) * K.PAN_WIDTH;
    },

    // Game code calls play() without a position; a few sounds can work it out.
    _autoPan(name) {
      const g = ASCENT.Game;
      if (!g || !g.player) return 0;
      if (name === 'meteorWhoosh') {
        const ms = g.meteors, m = ms && ms[ms.length - 1];   // the comet just spawned
        return m && Number.isFinite(m.vx) ? (m.vx > 0 ? -K.PAN_WIDTH : K.PAN_WIDTH) : 0;
      }
      if (name === 'ropeAttach' && g.rope) return this._panX(g.rope.x);
      if (name === 'ropeSnap' && g.rope && g.rope.failedCause === 'miss') return this._panX(g.rope.shootX) * 0.6;
      return 0;
    },

    // Start one pre-rendered voice. pan/panTo in -1..1 (panTo sweeps across
    // the sound's length); delay in seconds from now.
    _voice(name, vol, pitch, pan, delay, panTo) {
      const def = SOUNDS[name], bufs = this.snd[name];
      if (!def || !bufs || !bufs.length) return;
      const ctx = this.ctx, now = ctx.currentTime;
      if (!Number.isFinite(now)) return;

      let v = vol === undefined ? 1 : +vol;
      if (!Number.isFinite(v)) v = 1;
      v = clamp(v, 0, 2) * def.level;
      if (v < 1e-4) return;
      let r = pitch === undefined ? 1 : +pitch;
      if (!Number.isFinite(r) || r <= 0) r = 1;
      if (def.jitter) r *= 1 + (Math.random() * 2 - 1) * def.jitter;
      r = clamp(r, 0.25, 4);
      const t0 = now + (delay > 0 ? delay : 0);

      // voice limits: no instant double-triggers, a per-sound cap, a global cap
      if (t0 - this._lastStart[name] < K.RETRIGGER) return;
      const ends = this._ends[name];
      let slot = -1;
      for (let k = 0; k < ends.length; k++) if (ends[k] <= now) { slot = k; break; }
      if (slot < 0) return;
      let active = 0;
      for (let j = 0; j < this._endsList.length; j++) {
        const e = this._endsList[j];
        for (let k = 0; k < e.length; k++) if (e[k] > now) active++;
      }
      if (active >= K.MAX_VOICES) return;

      const idx = (this._rr[name] + 1) % bufs.length;   // round-robin variants
      this._rr[name] = idx;
      const buf = bufs[idx];
      const dur = buf.duration / r;

      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = r;
      const gn = ctx.createGain();
      gn.gain.value = v;
      src.connect(gn);
      let out = gn, pn = null, sg = null;
      const p0 = Number.isFinite(pan) ? clamp(pan, -1, 1) : 0;
      const sweep = panTo !== undefined && Number.isFinite(panTo);
      if (this._canPan && (p0 !== 0 || sweep)) {
        pn = ctx.createStereoPanner();
        pn.pan.value = p0;
        if (sweep) {
          pn.pan.setValueAtTime(p0, t0);
          pn.pan.linearRampToValueAtTime(clamp(panTo, -1, 1), t0 + dur);
        }
        gn.connect(pn);
        out = pn;
      }
      out.connect(this._sfx);
      if (def.wet > 0 && this._rev) {
        sg = ctx.createGain();
        sg.gain.value = def.wet;
        out.connect(sg);
        sg.connect(this._rev);
      }
      src.onended = function () {
        try { src.disconnect(); gn.disconnect(); if (pn) pn.disconnect(); if (sg) sg.disconnect(); } catch (e) { /* ignore */ }
      };
      src.start(t0);
      ends[slot] = t0 + dur;
      this._lastStart[name] = t0;
    },

    // Extra moments announced on the FX bus.
    _onFx(type, d) {
      if (!this._unlocked) this._autoUnlock();
      if (!this._ready() || !this._enabled()) return;
      try {
        d = d || {};
        switch (type) {
          case 'tongueCut': this._voice('tongueCut', 1, 1, this._panX(d.x), 0); break;
          case 'phaseDetach': this._voice('phaseDetach', 1, 1, this._panX(d.x), 0); break;
          case 'death': this._voice('death', 1, 1, 0, 0); break;
          case 'respawn': this._voice('respawn', 1, 1, 0, K.RESPAWN_DELAY); break;
          case 'goal': this._voice('munch', 1, 1, 0, K.MUNCH_DELAY); break;
          case 'runStart': this._voice('runStart', 1, 1, 0, 0); break;
          case 'flareIgnite': this._flare(d.flare); break;
        }
      } catch (e) { this._warn(e); }
    },

    // A flare roars only if it's near the giraffe's altitude, louder when
    // closer, panned from the side it sweeps in from toward the other side.
    _flare(f) {
      const g = ASCENT.Game, p = g && g.player;
      if (!f || !p || !Number.isFinite(f.y) || !Number.isFinite(p.y)) return;
      const cam = g.camera;
      const viewH = cam && cam.viewH > 0 ? cam.viewH : (g.screenHeight > 0 ? g.screenHeight : 900);
      const range = K.FLARE_RANGE_SCREENS * viewH;
      const dy = Math.abs(f.y - p.y);
      if (!(dy <= range)) return;
      const vol = 1 - (1 - K.FLARE_MIN_VOL) * (dy / range);
      const dir = f.direction > 0 ? 1 : -1;
      this._voice('flareIgnite', vol, 1, -0.6 * dir, 0, 0.35 * dir);
    },
  };
})();
