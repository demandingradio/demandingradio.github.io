/*
 * Jimbog procedural audio.
 *
 * Every sound is synthesised at runtime with the Web Audio API: no sample
 * files, no libraries, no modules. Loaded with a plain <script> tag.
 *
 * Signal flow, per voice:
 *   voice bus -> [occlusion lowpass] -> [distance lowpass] -> head
 *   head -> reverb send (spec ramp x panner distance gain) -> shared reverb
 *   head -> [HRTF/equalpower panner] -> master (or bypass)
 * Shared:
 *   master -> duck -> deafen lowpass -> compressor -> speakers
 *   bypass ---------------------------> compressor  (flash_ring only)
 *   reverb (short + long convolver) -> wet return -> master
 *
 *   JB.Audio.init();                             // call from a click
 *   JB.Audio.play('pistol');                     // 2D sound (UI, first person)
 *   JB.Audio.play('hit', { pos: { x, y, z } });  // 3D sound, panned and distance-filtered
 *   JB.Audio.play('footstep', { pos, surface: 'metal', occluded: true });
 *   JB.Audio.setListener(pos, fwd);              // every frame
 *   JB.Audio.setRoom(0.7);                       // 0 = small office, 1 = huge hall
 *   JB.Audio.setDeafen(1, 2);                    // flashbang: muffle and duck, recover over 2 s
 */
(function () {
  'use strict';

  const JB = window.JB = window.JB || {};
  const AudioCtor = window.AudioContext || window.webkitAudioContext;

  // ---- State ---------------------------------------------------------------
  let ctx = null;          // AudioContext, created by the first init() call
  let master = null;       // master volume gain (setMasterVolume)
  let duck = null;         // flashbang duck gain, between master and deafenLP
  let deafenLP = null;     // flashbang lowpass
  let comp = null;         // final compressor -> destination
  let bypass = null;       // flash_ring path: skips the duck and the deafen lowpass
  let reverbIn = null;     // mono send bus into both convolvers
  let shortG = null;       // crossfade gain for the short IR
  let longG = null;        // crossfade gain for the long IR
  let wetG = null;         // wet return to master
  let bufs = null;         // shared 2 s noise loops: { white, pink, brown }
  let masterVol = 0.8;
  let voices = 0;          // one-shot sounds still playing
  let amb = null;          // running ambience (see buildAmbience), or null
  let ambWanted = false;   // startAmbience() was called; may start after init()
  let roomSize = 0.6;      // 0 = small office, 1 = huge hall
  let deaf = null;         // current deafen effect: { amt, t0, secs }, or null
  let lis = { x: 0, y: 0, z: 0 };   // listener position, for distance filtering

  const SOFT_CAP = 48;     // at this many voices, LOW-priority sounds are dropped
  const HARD_CAP = 72;     // at this many, everything except CRITICAL is dropped
  const AMB_LEVEL = 0.03;  // ambience bus gain: bed sits about -34 dBFS RMS, well under the guns
  const OCC_GAIN = 0.55;   // occluded sounds: level
  const OCC_CUTOFF = 650;  // occluded sounds: extra lowpass, Hz
  const DEAF_HZ = 20000;   // deafen lowpass when not deafened
  const DEAF_MIN_HZ = 450; // deafen lowpass at full strength
  const DUCK_DEPTH = 0.6;  // deafen at full strength drops master gain by this much
  const DUCK_ATTACK = 0.015; // the duck drops over 15 ms, so it does not click
  const WET_TRIM = 6;      // reverb return scale. Sets how loud the room is; see makeIR

  // Voice priority. LOW sounds are the first to go when voices pile up.
  const LOW = new Set(['footstep', 'walk_step', 'jump', 'land', 'impact', 'bullet_whiz', 'shell',
    'empty', 'dryfire', 'switch', 'claw', 'hiss', 'smoke_hiss', 'ui_click', 'grenade_pin',
    'grenade_throw', 'grenade_bounce', 'scope_in', 'scope_out', 'knife_slash', 'deploy']);
  const CRITICAL = new Set(['sniper', 'shotgun', 'explosion', 'launcher', 'hurt', 'death', 'kill',
    'flash_explode', 'flash_ring']);

  // Sounds that skip the duck and the deafen lowpass (the player's own tinnitus).
  const BYPASS = new Set(['flash_ring']);

  // Floor materials for footsteps, landings and bounces.
  const SURFACES = new Set(['concrete', 'metal', 'tile', 'grate']);

  // Relative loudness per sound, multiplied by the caller's volume.
  const LEVEL = {
    sniper: 1.0, shotgun: 0.95, explosion: 0.95, launcher: 0.8,
    rifle: 0.8, pistol: 0.7, smg: 0.5, claw: 0.6, claw_hit: 0.7,
    empty: 0.4, dryfire: 0.4, reload: 0.5, shell: 0.5, switch: 0.45, bullet_whiz: 0.4,
    impact: 0.45, ricochet: 0.6, footstep: 0.42, walk_step: 0.2, jump: 0.5, land: 0.45,
    pickup_weapon: 0.5, pickup_ammo: 0.45, pickup_health: 0.5, pickup_armor: 0.55,
    hit: 0.6, hit_armor: 0.6, hitmarker: 0.4, headshot: 0.5, headshot_helmet: 0.55,
    hurt: 0.7, death: 0.6, meow: 0.6,
    hiss: 0.5, kill: 0.5, respawn: 0.5, countdown: 0.5, go: 0.5, match_end: 0.5,
    ui_click: 0.25,
    grenade_pin: 0.5, grenade_throw: 0.5, grenade_bounce: 0.55, flash_explode: 0.9,
    smoke_pop: 0.6, smoke_hiss: 0.5, flash_ring: 0.7,
    scope_in: 0.5, scope_out: 0.5, knife_slash: 0.6, knife_stab: 0.7, knife_hit_wall: 0.6,
    deploy: 0.5
  };

  // These keep their exact pitch. Every other sound gets +/-4% random variation.
  const NO_JITTER = new Set(['countdown', 'go', 'match_end', 'kill', 'respawn', 'ui_click', 'flash_ring']);

  // ---- Utilities -----------------------------------------------------------
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
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

  // Procedural room impulse response, stereo. Each channel is built on its
  // own so the room is decorrelated (wide, not mono). len in seconds; t60 is
  // the time the tail takes to fall 60 dB.
  function makeIR(len, t60) {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * len);
    const buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      // Early reflections: 14 bounces off nearby walls and pillars, 15-60 ms.
      // Each is a half-millisecond burst of noise, so it is not a bare click.
      for (let r = 0; r < 14; r++) {
        const t = rnd(0.015, 0.06);
        const amp = rnd(0.4, 1) * (Math.random() < 0.5 ? -1 : 1) * Math.exp(-(t - 0.015) / 0.03);
        const i0 = Math.floor(t * sr);
        for (let k = 0; k < 24 && i0 + k < n; k++) {
          d[i0 + k] += amp * (1 - k / 24) * (Math.random() * 2 - 1);
        }
      }
      // Late tail: noise with an exponential decay. The highs die faster than
      // the lows, as they do in concrete and steel rooms.
      let y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const fc = 7000 * Math.pow(2000 / 7000, Math.min(1, t / len));
        const a = Math.exp(-2 * Math.PI * fc / sr);
        y = (1 - a) * (Math.random() * 2 - 1) + a * y;
        const onset = clamp((t - 0.01) / 0.05, 0, 1);   // fades in after the early reflections
        d[i] += y * onset * Math.exp(-6.9078 * t / t60);
      }
    }
    // Scale so the first 100 ms carry unit energy (both channels). Both IRs then
    // start at the same level, and the long one simply sustains longer. The
    // convolvers do not normalise (Chrome's normalize flag applies a fixed
    // calibration that is far too quiet), so WET_TRIM sets the level instead.
    let e = 0;
    const early = Math.min(n, Math.floor(sr * 0.1));
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < early; i++) e += d[i] * d[i];
    }
    const k = 1 / Math.sqrt(e || 1);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) d[i] *= k;
    }
    return buf;
  }

  // The output chain: compressor -> destination, deafen lowpass and duck in
  // front of it, and the bypass path for the player's own tinnitus.
  function buildOutput() {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);

    deafenLP = ctx.createBiquadFilter();
    deafenLP.type = 'lowpass';
    deafenLP.frequency.value = DEAF_HZ;
    deafenLP.Q.value = 0.5;
    deafenLP.connect(comp);

    duck = ctx.createGain();
    duck.gain.value = 1;
    duck.connect(deafenLP);

    master = ctx.createGain();
    master.gain.value = masterVol;
    master.connect(duck);

    bypass = ctx.createGain();
    bypass.gain.value = masterVol;
    bypass.connect(comp);
  }

  // Two convolvers, one short (~0.8 s) and one long (~2.2 s), fed by one mono
  // send bus. setRoom() crossfades between them and sets the wet return.
  function buildReverb() {
    reverbIn = ctx.createGain();
    reverbIn.channelCount = 1;
    reverbIn.channelCountMode = 'explicit';

    const shortConv = ctx.createConvolver();
    shortConv.normalize = false;
    shortConv.buffer = makeIR(0.8, 0.7);
    const longConv = ctx.createConvolver();
    longConv.normalize = false;
    longConv.buffer = makeIR(2.2, 2.0);

    shortG = ctx.createGain();
    longG = ctx.createGain();
    wetG = ctx.createGain();
    reverbIn.connect(shortConv);
    shortConv.connect(shortG);
    shortG.connect(wetG);
    reverbIn.connect(longConv);
    longConv.connect(longG);
    longG.connect(wetG);
    wetG.connect(master);
    applyRoom(roomSize, false);
  }

  // Set the crossfade and wet level for a room size. glide: ramp instead of jump.
  function applyRoom(s, glide) {
    const t = ctx.currentTime;
    const targets = [
      [shortG, Math.cos(s * Math.PI / 2)],   // equal-power crossfade
      [longG, Math.sin(s * Math.PI / 2)],
      [wetG, WET_TRIM * lerp(0.5, 1.2, s)]   // bigger room, longer and louder tail
    ];
    targets.forEach(([node, v]) => {
      if (glide) node.gain.setTargetAtTime(v, t, 0.3);
      else node.gain.setValueAtTime(v, t);
    });
  }

  // Create the audio graph on the first call, and resume it if the browser
  // suspended it. Call from a click so the browser allows sound. Safe to repeat.
  function init() {
    try {
      if (!AudioCtor) return;
      if (!ctx) {
        ctx = new AudioCtor();
        buildOutput();
        bufs = {
          white: makeNoise('white'),
          pink: makeNoise('pink'),
          brown: makeNoise('brown')
        };
        buildReverb();
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
      if (master) {
        master.gain.setTargetAtTime(masterVol, ctx.currentTime, 0.02);
        bypass.gain.setTargetAtTime(masterVol, ctx.currentTime, 0.02);
      }
    } catch (e) { warn('setMasterVolume failed', e); }
  }

  // Called every frame. pos is the listener position, fwd a unit forward vector.
  // Up is always +Y.
  function setListener(pos, fwd) {
    const p = pos || { x: 0, y: 0, z: 0 };
    lis = { x: num(p.x, 0), y: num(p.y, 0), z: num(p.z, 0) };
    if (!ctx) return;
    try {
      const L = ctx.listener;
      const f = fwd || { x: 0, y: 0, z: -1 };
      const fx = num(f.x, 0), fy = num(f.y, 0), fz = num(f.z, 0);
      if (L.positionX) {
        L.positionX.value = lis.x; L.positionY.value = lis.y; L.positionZ.value = lis.z;
        L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
        L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else {
        // Older browsers only have the deprecated methods.
        L.setPosition(lis.x, lis.y, lis.z);
        L.setOrientation(fx, fy, fz, 0, 1, 0);
      }
    } catch (e) { warn('setListener failed', e); }
  }

  // Flashbang: muffle everything (except BYPASS sounds) and duck the master
  // gain. amount 0..1, seconds = recovery time. The lowpass starts at
  // lerp(20000, 450, amount) and climbs back to 20000 along an exponential
  // curve over `seconds`: exponential in Hz, so the muffle lingers and then
  // opens up. The duck recovers on the same schedule. A new call while a
  // stronger effect is active is ignored.
  function deafStrength(t) {
    if (!deaf) return 0;
    const k = (t - deaf.t0) / deaf.secs;
    return k >= 1 ? 0 : deaf.amt * (1 - k);
  }
  function setDeafen(amount, seconds) {
    try {
      if (!ctx || !deafenLP) return;
      const a = clamp(num(Number(amount), 0), 0, 1);
      const secs = clamp(num(Number(seconds), 2), 0.05, 30);
      if (a <= 0) return;
      const t = ctx.currentTime;
      if (a < deafStrength(t)) return;     // keep the stronger effect
      deaf = { amt: a, t0: t, secs };
      const f = deafenLP.frequency;
      f.cancelScheduledValues(t);
      f.setValueAtTime(lerp(DEAF_HZ, DEAF_MIN_HZ, a), t);
      f.exponentialRampToValueAtTime(DEAF_HZ, t + secs);
      // Duck: falls over DUCK_ATTACK (no step, so no click), then recovers on the same curve.
      const g = duck.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(1 - DUCK_DEPTH * a, t + DUCK_ATTACK);
      g.exponentialRampToValueAtTime(1, t + secs);
    } catch (e) { warn('setDeafen failed', e); }
  }

  // Room size 0..1: 0 = small office, 1 = huge hall. Works before init too.
  function setRoom(size) {
    try {
      const x = Number(size);
      if (!isFinite(x)) return;
      roomSize = clamp(x, 0, 1);
      if (ctx && wetG) applyRoom(roomSize, true);
    } catch (e) { warn('setRoom failed', e); }
  }

  // ---- Playback ------------------------------------------------------------

  // Play a named sound. opts (all optional):
  //   pos        {x,y,z}: 3D sound, panned and distance-filtered
  //   volume     0..2, default 1
  //   pitch      0.25..4, default 1
  //   occluded   true: behind a wall (quieter, muffled, more reverb)
  //   surface    'concrete' | 'metal' | 'tile' | 'grate' (footstep, walk_step, land, grenade_bounce)
  //   duration   flash_ring only: fade-out length in seconds, default 3
  // Never throws. Unknown names and calls before init() are ignored.
  function play(name, opts) {
    try {
      if (!isReady() || !reverbIn) return;
      if (!hasOwn(SOUNDS, name)) return;

      // Voice limiting: minor sounds go first, then everything but CRITICAL.
      if (voices >= SOFT_CAP && LOW.has(name)) return;
      if (voices >= HARD_CAP && !CRITICAL.has(name)) return;

      opts = opts || {};
      const pos = opts.pos || null;
      const occluded = !!opts.occluded;
      const dist = pos ? distTo(pos) : 0;
      const vol = clamp(num(opts.volume, 1), 0, 2) * (LEVEL[name] || 0.5) * (occluded ? OCC_GAIN : 1);
      let pitch = clamp(num(opts.pitch, 1), 0.25, 4);
      if (!NO_JITTER.has(name)) pitch *= rnd(0.96, 1.04);
      const surface = SURFACES.has(opts.surface) ? opts.surface : 'concrete';

      // Voice bus (mono) -> optional filters -> head, which feeds the reverb
      // send and the output.
      const bus = ctx.createGain();
      bus.channelCount = 1;
      bus.channelCountMode = 'explicit';
      bus.gain.value = vol;
      const nodes = [bus];
      let head = bus;
      const chain = (node) => { head.connect(node); head = node; nodes.push(node); };

      if (occluded) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = OCC_CUTOFF;
        lp.Q.value = 0.7;
        chain(lp);
      }
      if (pos) {
        // Distance: 18 kHz up to 6 m, falling exponentially to 2.2 kHz at 70 m.
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = distCutoff(dist);
        lp.Q.value = 0.7;
        chain(lp);
      }

      // Reverb send, tapped after the filters so distant sounds are dull in the tail too.
      // The spec send ramp sets how wet a 3D sound is. The send also takes the panner's
      // distance gain, so the tail falls with distance too. Without it, far sounds came
      // out louder than near ones (a 70 m shot peaked about 13 dB above a 3 m shot).
      const step = name === 'footstep' || name === 'walk_step';
      const pp = panParams(step);
      const send = ctx.createGain();
      send.gain.value = sendLevel(pos ? dist : -1, occluded) * (pos ? distGain(dist, pp) : 1);
      head.connect(send);
      send.connect(reverbIn);
      nodes.push(send);

      const out = BYPASS.has(name) ? bypass : master;
      if (pos) {
        const pan = ctx.createPanner();
        // Footsteps are key information and need front/back cues, which only HRTF gives.
        // Other LOW-priority sounds keep equalpower to save CPU.
        pan.panningModel = LOW.has(name) && !step ? 'equalpower' : 'HRTF';
        pan.distanceModel = 'inverse';
        pan.refDistance = pp.ref;
        pan.maxDistance = pp.max;
        pan.rolloffFactor = pp.roll;
        placePanner(pan, pos);
        head.connect(pan);
        pan.connect(out);
        nodes.push(pan);
      } else {
        head.connect(out);
      }

      const c = { ctx, out: bus, t: ctx.currentTime + 0.005, p: pitch, nodes, end: 0, surface, opts };
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

  // Distance from the listener to a point.
  function distTo(p) {
    const dx = num(p.x, 0) - lis.x, dy = num(p.y, 0) - lis.y, dz = num(p.z, 0) - lis.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Lowpass cutoff for a 3D sound at distance d (metres).
  function distCutoff(d) {
    return 18000 * Math.pow(2200 / 18000, clamp((d - 6) / 64, 0, 1));
  }

  // Reverb send level. d < 0 means a 2D sound.
  function sendLevel(d, occluded) {
    const s = d < 0 ? 0.10 : lerp(0.08, 0.5, clamp(d / 50, 0, 1));
    return occluded ? s * 1.4 : s;
  }

  // Panner settings for a 3D sound. Footsteps reach further and roll off gently.
  function panParams(step) {
    return step ? { ref: 3.5, max: 45, roll: 1.0 } : { ref: 2.5, max: 90, roll: 1.1 };
  }
  // The PannerNode's 'inverse' distance gain, so the reverb send can follow it.
  function distGain(d, p) {
    return p.ref / (p.ref + p.roll * (clamp(d, p.ref, p.max) - p.ref));
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
  //   c.surface, c.opts  the play() options
  // Offsets (o.at) are seconds from c.t. Durations (o.dur) are total length.

  function hold(c, t) {
    if (t > c.end) c.end = t;
  }

  // Attack-decay envelope: quick rise to peak, exponential fall to silence.
  // Exponential ramps can't reach 0, so they end at 0.0001 instead.
  // Attacks down to 0.5 ms, so gunshot cracks can be real transients.
  function envelope(param, t, peak, attack, dur) {
    const a = Math.max(attack > 0 ? attack : 0.002, 0.0005);
    const end = t + Math.max(dur, a + 0.003);
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

  // Gunshot, CS:GO style, as layers:
  //   crack  1-2 ms highpassed noise: the snap you hear first
  //   body   pitch-dropping tone plus lowpassed noise for 30-80 ms of boom
  //   click  a quiet mechanical click 40-80 ms later
  // The tail is not in here: it comes from the reverb bus.
  function shot(c, s) {
    noise(c, { dur: s.crackDur, peak: s.crack, a: 0.0005, dst: filt(c, { type: 'highpass', f: s.crackF, q: 0.7 }) });
    tone(c, { type: s.bodyType || 'sine', f: s.body, dur: s.bodyDur, peak: s.bodyPeak, a: 0.001 });
    noise(c, { dur: s.boomDur, peak: s.boom, a: 0.002, dst: filt(c, { type: 'lowpass', f: s.boomF, q: 0.7 }) });
    click(c, s.clickAt, s.click, s.clickF);
  }

  // Floor contact for footsteps, landings and bounces. The surface sets the
  // character; k scales the level.
  function floorHit(c, surface, k) {
    if (surface === 'metal') {
      // A short ring from a steel plate: resonant band around 1.8-3 kHz.
      tone(c, { f: rnd(1900, 2600), dur: 0.12, peak: 0.16 * k, a: 0.0008 });
      noise(c, { dur: 0.12, peak: 0.1 * k, a: 0.001, dst: filt(c, { type: 'bandpass', f: 2400, q: 12 }) });
    } else if (surface === 'tile') {
      // Crisper: a sharp high click instead of grit.
      noise(c, { dur: 0.008, peak: 0.5 * k, a: 0.0005, dst: filt(c, { type: 'highpass', f: 4500 }) });
      tone(c, { f: 3400, dur: 0.02, peak: 0.12 * k, a: 0.0005 });
    } else if (surface === 'grate') {
      // Two or three rapid tiny rattles.
      const n = Math.random() < 0.5 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        noise(c, {
          at: i * rnd(0.016, 0.024), dur: 0.01, peak: rnd(0.2, 0.3) * k, a: 0.0005,
          dst: filt(c, { type: 'bandpass', f: rnd(2400, 3400), q: 3 })
        });
      }
    } else {
      // Concrete (default): low grit.
      noise(c, { dur: 0.06, peak: 0.22 * k, a: 0.002, dst: filt(c, { type: 'lowpass', f: 900 }) });
    }
  }

  // A footstep: a punchy thud and a heel click, then the floor material.
  function stepSound(c, k) {
    tone(c, { type: 'triangle', f: [[0, 130], [0.06, 52]], dur: 0.08, peak: 0.6 * k, a: 0.0015 });  // thud
    tone(c, { f: [[0, 220], [0.03, 100]], dur: 0.05, peak: 0.25 * k, a: 0.001 });                  // knock
    noise(c, { dur: 0.008, peak: 0.35 * k, a: 0.0005, dst: filt(c, { type: 'highpass', f: 2200 }) }); // heel click
    // high scuff: gives the ear (HRTF) enough treble to tell front from behind
    noise(c, { at: 0.01, dur: 0.045, peak: 0.14 * k, a: 0.004, dst: filt(c, { type: 'bandpass', f: rnd(5500, 7500), q: 1.2 }) });
    floorHit(c, c.surface, k);
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
    pistol: (c) => shot(c, {
      crackF: 1800, crack: 0.75, crackDur: 0.003,
      body: [[0, 330], [0.03, 150]], bodyDur: 0.05, bodyPeak: 0.5,
      boomF: 1600, boom: 0.35, boomDur: 0.035,
      clickAt: 0.055, click: 0.12, clickF: 2600
    }),

    smg: (c) => shot(c, {
      crackF: 3000, crack: 0.5, crackDur: 0.002,
      body: [[0, 260], [0.025, 130]], bodyDur: 0.035, bodyPeak: 0.3,
      boomF: 2200, boom: 0.2, boomDur: 0.03,
      clickAt: 0.045, click: 0.06, clickF: 3000
    }),

    rifle: (c) => shot(c, {
      crackF: 2000, crack: 0.8, crackDur: 0.003,
      body: [[0, 95], [0.06, 66], [0.14, 60]], bodyDur: 0.14, bodyPeak: 0.85,  // ~70 Hz thump
      boomF: 1100, boom: 0.42, boomDur: 0.07,
      clickAt: 0.06, click: 0.14, clickF: 2200
    }),

    shotgun: (c) => {
      shot(c, {
        crackF: 900, crack: 0.6, crackDur: 0.004,
        body: [[0, 95], [0.2, 52], [0.45, 45]], bodyDur: 0.45, bodyPeak: 0.8,   // 50 Hz thump
        boomF: 800, boom: 0.5, boomDur: 0.3,
        clickAt: 0.07, click: 0.1, clickF: 1800
      });
      noise(c, { dur: 0.12, peak: 0.12, a: 0.002, dst: filt(c, { type: 'highpass', f: 4000 }) }); // pellets
    },

    sniper: (c) => {
      shot(c, {
        crackF: 1200, crack: 0.7, crackDur: 0.003,
        body: [[0, 90], [0.15, 42]], bodyDur: 0.25, bodyPeak: 0.7,
        boomF: 900, boom: 0.4, boomDur: 0.1,
        clickAt: 0.07, click: 0.15, clickF: 2000
      });
      noise(c, { at: 0.02, dur: 0.6, peak: 0.12, a: 0.03, dst: filt(c, { type: 'lowpass', f: [[0, 500], [0.6, 150]], q: 0.7 }) }); // long bass tail
    },

    launcher: (c) => {
      tone(c, { f: [[0, 230], [0.28, 70]], dur: 0.28, peak: 0.6, a: 0.004 });                 // hollow pitch drop
      tone(c, { type: 'triangle', f: [[0, 110], [0.3, 55]], dur: 0.3, peak: 0.3, a: 0.004 });
      noise(c, { dur: 0.22, peak: 0.4, a: 0.01, dst: filt(c, { type: 'bandpass', f: 450, q: 1.8 }) }); // puff
      noise(c, { dur: 0.01, peak: 0.2, a: 0.0005, dst: filt(c, { type: 'highpass', f: 1500 }) });   // launch snap
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

    dryfire: (c) => SOUNDS.empty(c),

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

    deploy: (c) => {
      click(c, 0, 0.3, 1900);                                                                 // bolt back
      noise(c, { at: 0.1, dur: 0.05, peak: 0.25, a: 0.002, dst: filt(c, { type: 'bandpass', f: 3000, q: 2 }) });
      tone(c, { f: [[0, 600], [0.12, 900]], at: 0.15, dur: 0.12, peak: 0.1, a: 0.003 });      // draw
      click(c, 0.3, 0.35, 2300);                                                              // ready
    },

    grenade_pin: (c) => {
      noise(c, { dur: 0.05, peak: 0.25, a: 0.002, dst: filt(c, { type: 'bandpass', f: [[0, 2000], [0.05, 4200]], q: 4 }) }); // slide
      tone(c, { f: 3100, at: 0.045, dur: 0.14, peak: 0.12, a: 0.001 });                       // ring
      tone(c, { f: 4650, at: 0.045, dur: 0.09, peak: 0.05, a: 0.001 });
    },

    grenade_throw: (c) => noise(c, {
      dur: 0.22, peak: 0.3, a: 0.02,
      dst: filt(c, { type: 'bandpass', f: [[0, 500], [0.1, 1600], [0.22, 700]], q: 1.4 })
    }),

    grenade_bounce: (c) => {
      tone(c, { f: [[0, 260], [0.05, 140]], dur: 0.07, peak: 0.35, a: 0.001 });               // clunk
      tone(c, { f: rnd(2000, 2600), at: 0.002, dur: 0.12, peak: 0.12, a: 0.0008 });           // tink
      noise(c, { dur: 0.006, peak: 0.25, a: 0.0005, dst: filt(c, { type: 'highpass', f: 3000 }) });
      floorHit(c, c.surface, 0.6);
    },

    flash_explode: (c) => {
      noise(c, { dur: 0.004, peak: 0.7, a: 0.0005, dst: filt(c, { type: 'highpass', f: 2000, q: 0.7 }) }); // crack
      noise(c, { dur: 0.4, peak: 0.35, a: 0.001, dst: filt(c, { type: 'highpass', f: 3500, q: 0.6 }) }); // bright noise
      noise(c, { dur: 0.25, peak: 0.25, a: 0.001, dst: filt(c, { type: 'bandpass', f: 1500, q: 0.9 }) }); // body
      tone(c, { f: [[0, 220], [0.2, 90]], dur: 0.22, peak: 0.2, a: 0.001 });                  // thump
    },

    smoke_pop: (c) => {
      tone(c, { f: [[0, 160], [0.07, 70]], dur: 0.08, peak: 0.5, a: 0.001 });                 // pop
      noise(c, { dur: 0.05, peak: 0.35, a: 0.001, dst: filt(c, { type: 'lowpass', f: 700 }) });
      noise(c, { at: 0.03, dur: 0.3, peak: 0.12, a: 0.06, dst: filt(c, { type: 'bandpass', f: 2600, q: 0.8 }) }); // start of the hiss
    },

    smoke_hiss: (c) => noise(c, {
      dur: 3.0, peak: 0.12, a: 0.25,
      dst: filt(c, { type: 'bandpass', f: [[0, 2600], [3, 1800]], q: 0.7 })
    }),

    flash_ring: (c) => {
      // Tinnitus: two sines 12 Hz apart, so they beat. Fade in, hold, then fade
      // out over `duration`. Routed around the deafen filter (see BYPASS).
      const dur = clamp(num(c.opts.duration, 3), 0.2, 20);
      const t = c.t;
      const fadeIn = 0.05, sustain = 0.3;
      const end = t + fadeIn + sustain + dur;
      const g = c.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + fadeIn);
      g.gain.setValueAtTime(0.09, t + fadeIn + sustain);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      g.connect(c.out);
      c.nodes.push(g);
      [3400, 3412].forEach((f) => {
        const o = c.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * c.p;
        o.connect(g);
        o.start(t);
        o.stop(end + 0.05);
        c.nodes.push(o);
      });
      hold(c, end + 0.05);
    },

    scope_in: (c) => {
      noise(c, { dur: 0.1, peak: 0.12, a: 0.01, dst: filt(c, { type: 'bandpass', f: [[0, 1200], [0.1, 3000]], q: 3 }) }); // zoom whirr
      click(c, 0.1, 0.25, 2400);
    },

    scope_out: (c) => {
      noise(c, { dur: 0.1, peak: 0.12, a: 0.01, dst: filt(c, { type: 'bandpass', f: [[0, 3000], [0.1, 1200]], q: 3 }) });
      click(c, 0.1, 0.25, 1800);
    },

    knife_slash: (c) => noise(c, {
      dur: 0.22, peak: 0.4, a: 0.012,
      dst: filt(c, { type: 'bandpass', f: [[0, 1200], [0.12, 2600], [0.22, 800]], q: 1.5 })
    }),

    knife_stab: (c) => {
      noise(c, {
        dur: 0.32, peak: 0.5, a: 0.02,
        dst: filt(c, { type: 'bandpass', f: [[0, 500], [0.15, 1100], [0.32, 400]], q: 1.2 })
      });
      tone(c, { f: [[0, 130], [0.1, 70]], dur: 0.12, peak: 0.3, a: 0.003 });                  // weight
    },

    knife_hit_wall: (c) => {
      click(c, 0, 0.5, 1800);                                                                 // metal tick
      noise(c, { at: 0.005, dur: 0.1, peak: 0.22, a: 0.004, dst: filt(c, { type: 'bandpass', f: [[0, 2600], [0.1, 1400]], q: 2.5 }) }); // scrape
    },

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

    footstep: (c) => stepSound(c, 1),

    walk_step: (c) => stepSound(c, 0.5),

    jump: (c) => noise(c, {
      dur: 0.28, peak: 0.25, a: 0.05,
      dst: filt(c, { type: 'bandpass', f: [[0, 500], [0.25, 1400]], q: 1 })
    }),

    land: (c) => {
      tone(c, { f: [[0, 95], [0.15, 42]], dur: 0.18, peak: 0.5, a: 0.003 });
      noise(c, { dur: 0.12, peak: 0.22, a: 0.002, dst: filt(c, { type: 'lowpass', f: 500 }) });
      floorHit(c, c.surface, 1.1);
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

    hit_armor: (c) => {
      tone(c, { type: 'triangle', f: [[0, 95], [0.1, 55]], dur: 0.12, peak: 0.5, a: 0.002 }); // padded thump
      noise(c, { dur: 0.1, peak: 0.25, a: 0.003, dst: filt(c, { type: 'lowpass', f: 380 }) }); // dull, no ring
      noise(c, { dur: 0.02, peak: 0.1, a: 0.001, dst: filt(c, { type: 'bandpass', f: 800, q: 1.2 }) });
    },

    hitmarker: (c) => {
      tone(c, { f: 2000, dur: 0.035, peak: 0.2, a: 0.001 });                                  // "tk"
      tone(c, { f: 3000, dur: 0.03, peak: 0.08, a: 0.001 });
    },

    headshot_helmet: (c) => {
      // The CS helmet "dink": inharmonic metal partials, fast attack.
      noise(c, { dur: 0.0015, peak: 0.3, a: 0.0005, dst: filt(c, { type: 'highpass', f: 5000 }) }); // tiny click
      tone(c, { f: 2900, dur: 0.25, peak: 0.24, a: 0.0005 });
      tone(c, { f: 4600, dur: 0.15, peak: 0.13, a: 0.0005 });
      tone(c, { f: 6900, dur: 0.08, peak: 0.06, a: 0.0005 });
    },

    headshot: (c) => {
      // No helmet: a wet, bright crack.
      noise(c, { dur: 0.004, peak: 0.55, a: 0.0005, dst: filt(c, { type: 'highpass', f: 3500, q: 0.7 }) }); // crack
      noise(c, { dur: 0.05, peak: 0.25, a: 0.001, dst: filt(c, { type: 'bandpass', f: 1600, q: 1.2 }) });  // wet body
      tone(c, { f: [[0, 320], [0.06, 130]], dur: 0.07, peak: 0.25, a: 0.001 });                           // splat drop
      noise(c, { at: 0.012, dur: 0.05, peak: 0.12, a: 0.002, dst: filt(c, { type: 'highpass', f: 6000 }) }); // sheen
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
      a.sources.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } disconnectNode(s); });
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
  JB.Audio = {
    init, play, setListener, setMasterVolume, startAmbience, stopAmbience, isReady,
    setRoom, setDeafen
  };
})();
