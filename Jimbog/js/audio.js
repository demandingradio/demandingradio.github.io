/*
 * Jimbog procedural audio.
 *
 * Every sound is synthesised at runtime with the Web Audio API: no sample
 * files, no libraries, no modules. Loaded with a plain <script> tag.
 *
 *   JB.Audio.init();                             // call from a click
 *   JB.Audio.play('pistol');                     // 2D sound (UI, first person)
 *   JB.Audio.play('hit', { pos: { x, y, z } });  // 3D sound, HRTF panned
 */
(function () {
  'use strict';

  const JB = window.JB = window.JB || {};
  const AudioCtor = window.AudioContext || window.webkitAudioContext;

  // ---- State ---------------------------------------------------------------
  let ctx = null;          // AudioContext, created by the first init() call
  let master = null;       // master GainNode -> compressor -> speakers
  let bufs = null;         // shared 2 s noise loops: { white, pink, brown }
  let masterVol = 0.8;
  let voices = 0;          // one-shot sounds still playing
  let amb = null;          // running ambience (see buildAmbience), or null
  let ambWanted = false;   // startAmbience() was called; may start after init()

  const SOFT_CAP = 48;     // at this many voices, LOW-priority sounds are dropped
  const HARD_CAP = 72;     // at this many, everything except CRITICAL is dropped
  const AMB_LEVEL = 0.03;  // ambience bus gain: bed sits about -34 dBFS RMS, well under the guns

  // Voice priority. LOW sounds are the first to go when voices pile up.
  const LOW = new Set(['footstep', 'jump', 'land', 'impact', 'bullet_whiz', 'shell',
    'empty', 'switch', 'claw', 'hiss', 'ui_click']);
  const CRITICAL = new Set(['sniper', 'shotgun', 'explosion', 'launcher', 'hurt', 'death', 'kill']);

  // Relative loudness per sound, multiplied by the caller's volume.
  const LEVEL = {
    sniper: 1.0, shotgun: 0.95, explosion: 0.95, launcher: 0.8,
    rifle: 0.8, pistol: 0.7, smg: 0.5, claw: 0.6, claw_hit: 0.7,
    empty: 0.4, reload: 0.5, shell: 0.5, switch: 0.45, bullet_whiz: 0.4,
    impact: 0.45, ricochet: 0.6, footstep: 0.22, jump: 0.5, land: 0.45,
    pickup_weapon: 0.5, pickup_ammo: 0.45, pickup_health: 0.5, pickup_armor: 0.55,
    hit: 0.6, hitmarker: 0.4, headshot: 0.5, hurt: 0.7, death: 0.6, meow: 0.6,
    hiss: 0.5, kill: 0.5, respawn: 0.5, countdown: 0.5, go: 0.5, match_end: 0.5,
    ui_click: 0.25
  };

  // These keep their exact pitch. Every other sound gets +/-4% random variation.
  const NO_JITTER = new Set(['countdown', 'go', 'match_end', 'kill', 'respawn', 'ui_click']);

  // ---- Utilities -----------------------------------------------------------
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  function warn(...args) {
    try { console.warn('[JB.Audio]', ...args); } catch (e) { /* no console */ }
  }
  function disconnectNode(n) {
    try { n.disconnect(); } catch (e) { /* already disconnected */ }
  }

  // ---- Setup ---------------------------------------------------------------

  // Build a 2 s noise loop. The loop seam is hidden by crossfading the tail
  // into the head, so repeats don't click.
  function makeNoise(kind) {
    const sr = ctx.sampleRate;
    const len = sr * 2;
    const fade = Math.floor(sr * 0.1);
    const raw = new Float32Array(len + fade);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, walk = 0;
    for (let i = 0; i < raw.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') {
        // Paul Kellet's pink-noise filter bank
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else if (kind === 'brown') {
        // Leaky integration of white noise
        walk = (walk + 0.02 * w) / 1.02;
        raw[i] = walk * 3.5;
      } else {
        raw[i] = w;
      }
    }
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      if (i < fade) {
        const k = i / fade;
        d[i] = raw[i] * k + raw[i + len] * (1 - k);
      } else {
        d[i] = raw[i];
      }
    }
    return buf;
  }

  // Create the audio graph on the first call, and resume it if the browser
  // suspended it. Call from a click so the browser allows sound. Safe to repeat.
  function init() {
    try {
      if (!AudioCtor) return;
      if (!ctx) {
        ctx = new AudioCtor();

        // Final stage: a gentle compressor so stacked gunshots don't clip.
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -10;
        comp.knee.value = 8;
        comp.ratio.value = 8;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        comp.connect(ctx.destination);

        master = ctx.createGain();
        master.gain.value = masterVol;
        master.connect(comp);

        bufs = {
          white: makeNoise('white'),
          pink: makeNoise('pink'),
          brown: makeNoise('brown')
        };
        if (ambWanted) buildAmbience();
      }
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {
      warn('init failed', e);
    }
  }

  // True once the context exists and is running.
  function isReady() {
    return !!ctx && ctx.state === 'running';
  }

  // Master volume, 0..1.
  function setMasterVolume(v) {
    const x = Number(v);
    if (!isFinite(x)) return;
    masterVol = clamp(x, 0, 1);
    try {
      if (master) master.gain.setTargetAtTime(masterVol, ctx.currentTime, 0.02);
    } catch (e) { warn('setMasterVolume failed', e); }
  }

  // Called every frame. pos is the listener position, fwd a unit forward vector.
  // Up is always +Y.
  function setListener(pos, fwd) {
    if (!ctx) return;
    try {
      const L = ctx.listener;
      const p = pos || { x: 0, y: 0, z: 0 };
      const f = fwd || { x: 0, y: 0, z: -1 };
      const x = num(p.x, 0), y = num(p.y, 0), z = num(p.z, 0);
      const fx = num(f.x, 0), fy = num(f.y, 0), fz = num(f.z, 0);
      if (L.positionX) {
        L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
        L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
        L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else {
        // Older browsers only have the deprecated methods.
        L.setPosition(x, y, z);
        L.setOrientation(fx, fy, fz, 0, 1, 0);
      }
    } catch (e) { warn('setListener failed', e); }
  }

  // ---- Playback ------------------------------------------------------------

  // Play a named sound. opts: { pos, volume, pitch } (all optional).
  // Never throws. Unknown names and calls before init() are ignored.
  function play(name, opts) {
    try {
      if (!isReady()) return;
      if (!Object.prototype.hasOwnProperty.call(SOUNDS, name)) return;

      // Voice limiting: minor sounds go first, then everything but CRITICAL.
      if (voices >= SOFT_CAP && LOW.has(name)) return;
      if (voices >= HARD_CAP && !CRITICAL.has(name)) return;

      opts = opts || {};
      const vol = clamp(num(opts.volume, 1), 0, 2) * (LEVEL[name] || 0.5);
      let pitch = clamp(num(opts.pitch, 1), 0.25, 4);
      if (!NO_JITTER.has(name)) pitch *= rnd(0.96, 1.04);

      // Voice bus -> (optional HRTF panner) -> master.
      const bus = ctx.createGain();
      bus.gain.value = vol;
      const nodes = [bus];
      if (opts.pos) {
        const pan = ctx.createPanner();
        pan.panningModel = LOW.has(name) ? 'equalpower' : 'HRTF';
        pan.distanceModel = 'inverse';
        pan.refDistance = 2.5;
        pan.maxDistance = 90;
        pan.rolloffFactor = 1.1;
        placePanner(pan, opts.pos);
        bus.connect(pan);
        pan.connect(master);
        nodes.push(pan);
      } else {
        bus.connect(master);
      }

      const c = { ctx, out: bus, t: ctx.currentTime + 0.005, p: pitch, nodes, end: 0 };
      c.end = c.t;
      voices++;
      try {
        SOUNDS[name](c);
      } catch (e) {
        warn('synth error in', name, e);
      }
      finishLater(c, () => { voices = Math.max(0, voices - 1); });
    } catch (e) {
      warn('play failed', name, e);
    }
  }

  function placePanner(pan, p) {
    const x = num(p.x, 0), y = num(p.y, 0), z = num(p.z, 0);
    if (pan.positionX) {
      pan.positionX.value = x;
      pan.positionY.value = y;
      pan.positionZ.value = z;
    } else {
      pan.setPosition(x, y, z);
    }
  }

  // Disconnect a finished sound's nodes once its tail has played out.
  function finishLater(c, done) {
    const ms = Math.max(0, c.end - c.ctx.currentTime) * 1000 + 200;
    setTimeout(() => {
      c.nodes.forEach(disconnectNode);
      if (done) done();
    }, ms);
  }

  // ---- Synthesis helpers ---------------------------------------------------
  // A build context "c" describes one sound being made:
  //   c.ctx  AudioContext        c.out  node the sound feeds (voice bus)
  //   c.t    start time          c.p    pitch multiplier
  //   c.nodes  every node made, so it can be disconnected later
  //   c.end    latest time anything is still audible
  // Offsets (o.at) are seconds from c.t. Durations (o.dur) are total length.

  function hold(c, t) {
    if (t > c.end) c.end = t;
  }

  // Attack-decay envelope: quick rise to peak, exponential fall to silence.
  // Exponential ramps can't reach 0, so they end at 0.0001 instead.
  function envelope(param, t, peak, attack, dur) {
    const a = Math.max(attack || 0.002, 0.002);
    const end = t + Math.max(dur, a + 0.01);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    param.exponentialRampToValueAtTime(0.0001, end);
    return end;
  }

  // Set a param to a number, or sweep it through [[seconds, value], ...].
  function sweep(param, t, spec, mul) {
    if (typeof spec === 'number') {
      param.setValueAtTime(spec * mul, t);
      return;
    }
    param.setValueAtTime(spec[0][1] * mul, t + spec[0][0]);
    for (let i = 1; i < spec.length; i++) {
      param.exponentialRampToValueAtTime(spec[i][1] * mul, t + spec[i][0]);
    }
  }

  // Biquad filter, optionally sweeping its cutoff. Output goes to o.dst or c.out.
  function filt(c, o) {
    const n = c.ctx.createBiquadFilter();
    n.type = o.type;
    n.Q.value = o.q || 0.7;
    sweep(n.frequency, c.t + (o.at || 0), o.f, 1);
    n.connect(o.dst || c.out);
    c.nodes.push(n);
    return n;
  }

  // Oscillator with a pitch contour (o.f) and an AD envelope.
  function tone(c, o) {
    const t = c.t + (o.at || 0);
    const osc = c.ctx.createOscillator();
    osc.type = o.type || 'sine';
    sweep(osc.frequency, t, o.f, c.p);
    const g = c.ctx.createGain();
    const end = envelope(g.gain, t, o.peak, o.a, o.dur);
    osc.connect(g);
    g.connect(o.dst || c.out);
    osc.start(t);
    osc.stop(end + 0.02);
    c.nodes.push(osc, g);
    hold(c, end + 0.02);
  }

  // Noise burst from a shared buffer, started at a random offset so repeats differ.
  function noise(c, o) {
    const t = c.t + (o.at || 0);
    const src = c.ctx.createBufferSource();
    src.buffer = bufs[o.kind || 'white'];
    src.loop = true;
    src.playbackRate.value = c.p;
    const g = c.ctx.createGain();
    const end = envelope(g.gain, t, o.peak, o.a, o.dur);
    src.connect(g);
    g.connect(o.dst || c.out);
    src.start(t, Math.random() * 1.5);
    src.stop(end + 0.02);
    c.nodes.push(src, g);
    hold(c, end + 0.02);
  }

  // Short metal click: a high noise tick plus a falling ping.
  function click(c, at, peak, f) {
    noise(c, { at, dur: 0.02, peak, a: 0.001, dst: filt(c, { type: 'highpass', f: 2500, q: 0.7 }) });
    tone(c, { f: [[0, f], [0.035, f * 0.7]], at, dur: 0.035, peak: peak * 0.4, a: 0.001 });
  }

  // Feedback delay with a lowpass in the loop: a long, darkening echo.
  // Returns the input node. Feed it a short noise burst.
  function echo(c, time, feedback, tail) {
    const input = c.ctx.createGain();
    const delay = c.ctx.createDelay(1.0);
    delay.delayTime.value = time;
    const fb = c.ctx.createGain();
    fb.gain.value = feedback;
    const lp = filt(c, { type: 'lowpass', f: 1800, q: 0.5 });
    input.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    c.nodes.push(input, delay, fb);
    hold(c, c.t + tail);
    return input;
  }

  // Gunshot recipe: optional low thump, sharp crack, noisy tail, extras.
  function gunshot(c, s) {
    if (s.thump) tone(c, { f: s.thump.f, dur: s.thump.dur, peak: s.thump.peak, a: 0.002 });
    noise(c, {
      dur: s.crack.dur, peak: s.crack.peak, a: 0.001,
      dst: filt(c, { type: s.crack.type, f: s.crack.f, q: s.crack.q })
    });
    noise(c, { dur: s.tail.dur, peak: s.tail.peak, a: 0.003, dst: filt(c, { type: 'lowpass', f: s.tail.f }) });
    if (s.extra) s.extra(c);
  }

  // Cat voice: a sawtooth buzz run through parallel formant bandpasses (the
  // "mouth"), with light vibrato. Pitch and formant entries are [seconds, Hz] contours.
  function catVoice(c, o) {
    const t = c.t + (o.at || 0);
    const src = c.ctx.createOscillator();
    src.type = 'sawtooth';
    sweep(src.frequency, t, o.pitch, c.p);

    const vib = c.ctx.createOscillator();
    vib.frequency.value = o.vibRate;
    const vibAmt = c.ctx.createGain();
    vibAmt.gain.value = o.vibDepth;
    vib.connect(vibAmt);
    vibAmt.connect(src.frequency);

    const env = c.ctx.createGain();
    const end = envelope(env.gain, t, o.peak, o.a, o.dur);
    env.connect(c.out);

    for (const fm of o.formants) {
      const bp = c.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = fm.q;
      sweep(bp.frequency, t, fm.f, 1);
      const g = c.ctx.createGain();
      g.gain.value = fm.g;
      src.connect(bp);
      bp.connect(g);
      g.connect(env);
      c.nodes.push(bp, g);
    }
    src.start(t);
    vib.start(t);
    src.stop(end + 0.02);
    vib.stop(end + 0.02);
    c.nodes.push(src, vib, vibAmt, env);
    hold(c, end + 0.02);
  }

  // ---- Sound definitions ---------------------------------------------------
  const SOUNDS = {

    // Weapons
    pistol: (c) => gunshot(c, {
      thump: { f: [[0, 180], [0.1, 60]], dur: 0.1, peak: 0.5 },
      crack: { type: 'bandpass', f: 2200, q: 0.9, dur: 0.05, peak: 0.8 },
      tail: { f: 1400, dur: 0.2, peak: 0.22 }
    }),

    smg: (c) => gunshot(c, {
      thump: { f: [[0, 200], [0.06, 90]], dur: 0.06, peak: 0.32 },
      crack: { type: 'bandpass', f: 3400, q: 1.1, dur: 0.03, peak: 0.5 },
      tail: { f: 2600, dur: 0.09, peak: 0.14 }
    }),

    rifle: (c) => gunshot(c, {
      thump: { f: [[0, 150], [0.16, 45]], dur: 0.16, peak: 0.75 },
      crack: { type: 'bandpass', f: 2000, q: 0.8, dur: 0.05, peak: 0.75 },
      tail: { f: 1100, dur: 0.22, peak: 0.34 }
    }),

    shotgun: (c) => gunshot(c, {
      thump: { f: [[0, 120], [0.35, 30]], dur: 0.35, peak: 0.95 },
      crack: { type: 'bandpass', f: 1200, q: 0.7, dur: 0.06, peak: 0.6 },
      tail: { f: 800, dur: 0.5, peak: 0.5 },
      extra: (c2) => {
        tone(c2, { f: [[0, 60], [0.4, 25]], dur: 0.4, peak: 0.5, a: 0.003 });                 // sub boom
        noise(c2, { dur: 0.12, peak: 0.12, a: 0.002, dst: filt(c2, { type: 'highpass', f: 4000 }) }); // pellets
      }
    }),

    sniper: (c) => {
      gunshot(c, {
        thump: { f: [[0, 220], [0.14, 55]], dur: 0.14, peak: 0.8 },
        crack: { type: 'highpass', f: 1400, q: 0.7, dur: 0.05, peak: 1.0 },
        tail: { f: 1200, dur: 0.15, peak: 0.25 }
      });
      // Long echo fed by a short burst.
      const input = echo(c, 0.19, 0.6, 1.3);
      noise(c, { dur: 0.03, peak: 1.0, a: 0.001, dst: input });
    },

    launcher: (c) => {
      tone(c, { f: [[0, 230], [0.28, 70]], dur: 0.28, peak: 0.7, a: 0.004 });                 // hollow pitch drop
      tone(c, { type: 'triangle', f: [[0, 110], [0.3, 55]], dur: 0.3, peak: 0.25, a: 0.004 });
      noise(c, { dur: 0.22, peak: 0.45, a: 0.01, dst: filt(c, { type: 'bandpass', f: 450, q: 1.8 }) }); // puff
    },

    explosion: (c) => {
      tone(c, { f: [[0, 80], [1.2, 30]], dur: 1.2, peak: 0.9, a: 0.01 });                    // sub sweep
      noise(c, {
        dur: 1.2, peak: 0.8, a: 0.005,
        dst: filt(c, { type: 'lowpass', f: [[0, 1000], [0.3, 400], [1.2, 150]], q: 0.7 })
      });
      noise(c, { dur: 0.08, peak: 0.5, a: 0.001, dst: filt(c, { type: 'highpass', f: 1800 }) }); // crack
      for (let i = 0; i < 14; i++) {                                                          // crackle
        noise(c, {
          at: rnd(0.05, 0.85), dur: 0.03, peak: rnd(0.05, 0.18), a: 0.001,
          dst: filt(c, { type: 'highpass', f: 2500 })
        });
      }
    },

    claw: (c) => noise(c, {
      dur: 0.18, peak: 0.45, a: 0.02,
      dst: filt(c, { type: 'bandpass', f: [[0, 600], [0.18, 3000]], q: 1.2 })
    }),

    claw_hit: (c) => {
      tone(c, { f: [[0, 200], [0.1, 70]], dur: 0.1, peak: 0.6, a: 0.002 });                   // fleshy thwack
      noise(c, { dur: 0.1, peak: 0.4, a: 0.002, dst: filt(c, { type: 'lowpass', f: 700 }) });
      noise(c, { at: 0.01, dur: 0.07, peak: 0.3, a: 0.001, dst: filt(c, { type: 'bandpass', f: 4000, q: 1.5 }) });
    },

    empty: (c) => {
      noise(c, { dur: 0.02, peak: 0.35, a: 0.001, dst: filt(c, { type: 'highpass', f: 3500 }) });
      tone(c, { type: 'triangle', f: 1400, dur: 0.012, peak: 0.08, a: 0.001 });
    },

    reload: (c) => {
      click(c, 0, 0.5, 1800);                                                                 // magazine out
      click(c, 0.35, 0.6, 1300);                                                              // magazine in
      tone(c, { f: [[0, 220], [0.06, 120]], at: 0.35, dur: 0.06, peak: 0.3, a: 0.002 });      // seat thunk
      noise(c, { at: 0.6, dur: 0.04, peak: 0.35, a: 0.001, dst: filt(c, { type: 'bandpass', f: 3000, q: 2 }) });
      noise(c, { at: 0.7, dur: 0.05, peak: 0.4, a: 0.001, dst: filt(c, { type: 'bandpass', f: 2600, q: 2 }) });
      tone(c, { f: [[0, 320], [0.07, 180]], at: 0.7, dur: 0.07, peak: 0.25, a: 0.002 });      // slide rack
    },

    shell: (c) => click(c, 0, 0.45, 1100),

    switch: (c) => {
      noise(c, { dur: 0.14, peak: 0.18, a: 0.03, dst: filt(c, { type: 'bandpass', f: [[0, 1200], [0.14, 2000]], q: 0.7 }) }); // cloth
      click(c, 0.12, 0.4, 2400);                                                              // metal click
    },

    bullet_whiz: (c) => noise(c, {
      dur: 0.3, peak: 1.2, a: 0.07,
      dst: filt(c, { type: 'bandpass', f: [[0, 800], [0.12, 3200], [0.3, 500]], q: 5 })
    }),

    // Impacts and world
    impact: (c) => {
      if (Math.random() < 0.5) {
        noise(c, { dur: 0.02, peak: 0.35, a: 0.001, dst: filt(c, { type: 'highpass', f: 3000 }) });
        tone(c, { f: 3800, dur: 0.12, peak: 0.12, a: 0.001 });                                 // tiny ring
      } else {
        noise(c, { dur: 0.03, peak: 0.3, a: 0.001, dst: filt(c, { type: 'bandpass', f: 1800, q: 2 }) });
        tone(c, { f: 2600, dur: 0.09, peak: 0.1, a: 0.001 });
      }
    },

    ricochet: (c) => {
      tone(c, { f: [[0, 2500], [0.3, 900]], dur: 0.3, peak: 0.35, a: 0.005 });               // "pyeeew"
      noise(c, { dur: 0.3, peak: 0.1, a: 0.01, dst: filt(c, { type: 'highpass', f: 1500 }) });
    },

    footstep: (c) => {
      tone(c, { type: 'triangle', f: [[0, 120], [0.06, 55]], dur: 0.07, peak: 0.22, a: 0.003 }); // padded thud
      noise(c, { dur: 0.05, peak: 0.1, a: 0.002, dst: filt(c, { type: 'lowpass', f: 900 }) });   // grit
      noise(c, { dur: 0.01, peak: 0.04, a: 0.001, dst: filt(c, { type: 'highpass', f: 3500 }) });
    },

    jump: (c) => noise(c, {
      dur: 0.28, peak: 0.25, a: 0.05,
      dst: filt(c, { type: 'bandpass', f: [[0, 500], [0.25, 1400]], q: 1 })
    }),

    land: (c) => {
      tone(c, { f: [[0, 90], [0.15, 40]], dur: 0.18, peak: 0.45, a: 0.003 });
      noise(c, { dur: 0.12, peak: 0.25, a: 0.002, dst: filt(c, { type: 'lowpass', f: 500 }) });
    },

    pickup_weapon: (c) => {
      noise(c, { dur: 0.04, peak: 0.4, a: 0.001, dst: filt(c, { type: 'bandpass', f: 2500, q: 1.5 }) }); // "cha"
      tone(c, { type: 'triangle', f: [[0, 1400], [0.09, 2200]], at: 0.09, dur: 0.1, peak: 0.25, a: 0.002 }); // "chick"
      tone(c, { f: 2800, at: 0.09, dur: 0.14, peak: 0.12, a: 0.002 });
    },

    pickup_ammo: (c) => {
      [0, 0.035, 0.06, 0.09].forEach((at) => {                                                // small parts rattling
        noise(c, { at, dur: 0.012, peak: rnd(0.15, 0.3), a: 0.001, dst: filt(c, { type: 'bandpass', f: 3500, q: 3 }) });
      });
      tone(c, { f: 1200, at: 0.11, dur: 0.03, peak: 0.15, a: 0.001 });                        // latch click
    },

    pickup_health: (c) => {
      tone(c, { type: 'triangle', f: 880, dur: 0.14, peak: 0.25, a: 0.004 });
      tone(c, { type: 'triangle', f: 1320, at: 0.09, dur: 0.3, peak: 0.25, a: 0.004 });        // rising fifth
      tone(c, { f: 2640, at: 0.09, dur: 0.15, peak: 0.05, a: 0.004 });                        // bright overtone
    },

    pickup_armor: (c) => {
      tone(c, { f: [[0, 140], [0.12, 85]], dur: 0.14, peak: 0.5, a: 0.003 });                 // "clunk"
      noise(c, { dur: 0.08, peak: 0.2, a: 0.002, dst: filt(c, { type: 'lowpass', f: 800 }) });
      [[1480, 0.12], [2390, 0.08], [3110, 0.05]].forEach(([f, peak]) => {                     // "shing" metal ring
        tone(c, { f, at: 0.1, dur: 0.5, peak, a: 0.003 });
      });
    },

    // Characters (cats)
    hit: (c) => {
      tone(c, { f: [[0, 130], [0.12, 60]], dur: 0.15, peak: 0.55, a: 0.002 });                // dull thud
      noise(c, { dur: 0.12, peak: 0.35, a: 0.003, dst: filt(c, { type: 'lowpass', f: 500 }) });
      noise(c, { dur: 0.04, peak: 0.15, a: 0.002, dst: filt(c, { type: 'bandpass', f: 900, q: 1.5 }) });
    },

    hitmarker: (c) => {
      tone(c, { f: 2000, dur: 0.035, peak: 0.2, a: 0.001 });                                  // "tk"
      tone(c, { f: 3000, dur: 0.03, peak: 0.08, a: 0.001 });
    },

    headshot: (c) => {
      tone(c, { f: 2800, dur: 0.25, peak: 0.22, a: 0.001 });                                  // "ding"
      tone(c, { f: 4200, dur: 0.14, peak: 0.1, a: 0.001 });
      tone(c, { f: 5600, dur: 0.06, peak: 0.04, a: 0.001 });
      noise(c, { dur: 0.01, peak: 0.12, a: 0.001, dst: filt(c, { type: 'highpass', f: 6000 }) });
    },

    hurt: (c) => catVoice(c, {
      dur: 0.3, peak: 0.6, a: 0.02, vibRate: 7, vibDepth: 14,
      pitch: [[0, 450], [0.12, 800], [0.3, 500]],
      formants: [
        { f: [[0, 700], [0.12, 1100], [0.3, 800]], q: 3, g: 2.0 },
        { f: [[0, 2000], [0.12, 3000], [0.3, 2200]], q: 4, g: 1.0 }
      ]
    }),

    death: (c) => catVoice(c, {
      dur: 0.8, peak: 0.6, a: 0.03, vibRate: 6, vibDepth: 22,
      pitch: [[0, 820], [0.15, 900], [0.8, 240]],
      formants: [
        { f: [[0, 900], [0.2, 700], [0.8, 350]], q: 3, g: 2.0 },
        { f: [[0, 2600], [0.3, 1800], [0.8, 900]], q: 4, g: 1.0 }
      ]
    }),

    meow: (c) => {
      // "mew": closed vowel, pitch rises then settles
      catVoice(c, {
        dur: 0.24, peak: 0.4, a: 0.02, vibRate: 5, vibDepth: 8,
        pitch: [[0, 520], [0.08, 780], [0.24, 600]],
        formants: [
          { f: [[0, 350], [0.1, 400], [0.24, 300]], q: 3, g: 2.0 },
          { f: [[0, 2300], [0.1, 2600], [0.24, 2200]], q: 4, g: 1.0 }
        ]
      });
      // "ow": open vowel, pitch falls
      catVoice(c, {
        at: 0.22, dur: 0.3, peak: 0.42, a: 0.015, vibRate: 5, vibDepth: 8,
        pitch: [[0, 640], [0.1, 560], [0.3, 380]],
        formants: [
          { f: [[0, 650], [0.15, 600], [0.3, 450]], q: 3, g: 2.0 },
          { f: [[0, 1100], [0.15, 950], [0.3, 800]], q: 4, g: 1.0 }
        ]
      });
    },

    hiss: (c) => noise(c, { dur: 0.55, peak: 0.3, a: 0.01, dst: filt(c, { type: 'highpass', f: 2200, q: 0.6 }) }),

    // UI and match
    kill: (c) => {
      tone(c, { type: 'triangle', f: 1000, dur: 0.12, peak: 0.25, a: 0.003 });                // two-note rise
      tone(c, { type: 'triangle', f: 1500, at: 0.08, dur: 0.32, peak: 0.25, a: 0.003 });
      tone(c, { f: 3000, at: 0.08, dur: 0.15, peak: 0.05, a: 0.003 });
    },

    respawn: (c) => {
      const lp = filt(c, { type: 'lowpass', f: [[0, 300], [0.5, 2200]], q: 2 });              // filter opens
      tone(c, { type: 'sawtooth', f: [[0, 160], [0.5, 440]], dur: 0.55, peak: 0.16, a: 0.3, dst: lp });
      tone(c, { f: [[0, 320], [0.5, 880]], dur: 0.55, peak: 0.12, a: 0.3 });
    },

    countdown: (c) => tone(c, {
      type: 'square', f: 440, dur: 0.12, peak: 0.1, a: 0.004,
      dst: filt(c, { type: 'lowpass', f: 2400 })
    }),

    go: (c) => {
      const lp = filt(c, { type: 'lowpass', f: 3000 });
      tone(c, { type: 'square', f: 880, dur: 0.35, peak: 0.1, a: 0.004, dst: lp });
      tone(c, { f: 1760, dur: 0.35, peak: 0.04, a: 0.004 });
    },

    match_end: (c) => {
      // Three rising notes, the last one held
      [[523.25, 0, 0.13], [659.25, 0.13, 0.13], [783.99, 0.26, 0.55]].forEach(([f, at, dur]) => {
        tone(c, { type: 'triangle', f, at, dur, peak: 0.22, a: 0.005 });
        tone(c, { f: f * 2, at, dur: dur * 0.6, peak: 0.04, a: 0.005 });
      });
    },

    ui_click: (c) => {
      tone(c, { f: 1600, dur: 0.012, peak: 0.1, a: 0.001 });
      noise(c, { dur: 0.008, peak: 0.08, a: 0.001, dst: filt(c, { type: 'highpass', f: 4000 }) });
    }
  };

  // ---- Factory ambience ----------------------------------------------------

  // Start the looping factory bed: hum, machinery rumble, and occasional
  // distant clanks or steam. Fades in over about 1.5 s. If called before init(),
  // the bed starts as soon as init() creates the context.
  function startAmbience() {
    ambWanted = true;
    if (ctx && !amb) {
      try { buildAmbience(); } catch (e) { warn('ambience failed', e); }
    }
  }

  // Fade the bed out over 0.5 s, then tear it down.
  function stopAmbience() {
    ambWanted = false;
    const a = amb;
    amb = null;
    if (!a) return;
    clearTimeout(a.timer);
    try {
      const g = a.bus.gain;
      const t = ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.5);
    } catch (e) { warn('stopAmbience failed', e); }
    setTimeout(() => {
      a.sources.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } });
      a.nodes.forEach(disconnectNode);
      disconnectNode(a.bus);
    }, 600);
  }

  function buildAmbience() {
    const t = ctx.currentTime;
    const a = { bus: ctx.createGain(), sources: [], nodes: [], timer: 0 };
    a.bus.gain.setValueAtTime(0, t);
    a.bus.gain.linearRampToValueAtTime(AMB_LEVEL, t + 1.5);
    a.bus.connect(master);

    // Electrical hum: 50 Hz mains plus harmonics. The 50.8 Hz partner beats slowly.
    const hum = ctx.createGain();
    const humLP = ctx.createBiquadFilter();
    humLP.type = 'lowpass';
    humLP.frequency.value = 500;
    hum.connect(humLP);
    humLP.connect(a.bus);
    a.nodes.push(hum, humLP);
    [[50, 'sine', 0.5], [50.8, 'sine', 0.35], [100, 'triangle', 0.18], [150, 'sine', 0.1], [200, 'sine', 0.05]]
      .forEach(([f, type, level]) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = f;
        g.gain.value = level;
        o.connect(g);
        g.connect(hum);
        o.start(t);
        a.sources.push(o);
        a.nodes.push(g);
      });

    // Machinery rumble: low-passed brown noise with a slow swell.
    const rumble = ctx.createBufferSource();
    rumble.buffer = bufs.brown;
    rumble.loop = true;
    const rLP = ctx.createBiquadFilter();
    rLP.type = 'lowpass';
    rLP.frequency.value = 220;
    rLP.Q.value = 0.7;
    const rGain = ctx.createGain();
    rGain.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    const lfoAmt = ctx.createGain();
    lfo.frequency.value = 0.09;
    lfoAmt.gain.value = 0.25;
    lfo.connect(lfoAmt);
    lfoAmt.connect(rGain.gain);
    rumble.connect(rLP);
    rLP.connect(rGain);
    rGain.connect(a.bus);
    rumble.start(t, Math.random() * 1.5);
    lfo.start(t);
    a.sources.push(rumble, lfo);
    a.nodes.push(rLP, rGain, lfoAmt);

    amb = a;
    scheduleAmbienceEvent(a);
  }

  // One distant event: a metallic clank or a steam hiss, low-passed to sound far away.
  function ambientEvent(a) {
    const c = { ctx, out: a.bus, t: ctx.currentTime + 0.02, p: 1, nodes: [], end: 0 };
    c.end = c.t;
    if (Math.random() < 0.6) {
      const lp = filt(c, { type: 'lowpass', f: 1400, q: 0.5 });
      [[420, 0.5, 0.6], [1130, 0.25, 0.4], [1790, 0.15, 0.3], [2650, 0.08, 0.2]].forEach(([f, peak, dur]) => {
        tone(c, { f: f * rnd(0.99, 1.01), dur, peak, a: 0.002, dst: lp });
      });
      noise(c, { dur: 0.02, peak: 0.3, a: 0.001, dst: filt(c, { type: 'bandpass', f: 2200, q: 2 }) });
    } else {
      noise(c, { dur: 1.8, peak: 0.4, a: 0.35, dst: filt(c, { type: 'highpass', f: 1800, q: 0.6 }) });
    }
    finishLater(c, null);
  }

  // Next distant event lands 4 to 12 seconds from now.
  function scheduleAmbienceEvent(a) {
    a.timer = setTimeout(() => {
      if (amb !== a) return;
      ambientEvent(a);
      scheduleAmbienceEvent(a);
    }, rnd(4000, 12000));
  }

  // ---- Public API ----------------------------------------------------------
  JB.Audio = { init, play, setListener, setMasterVolume, startAmbience, stopAmbience, isReady };
})();
