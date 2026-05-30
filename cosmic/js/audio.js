/*
 * AUDIO — Web Audio port of the original procedural AudioGenerator.
 * ================================================================
 * The original synthesises every SFX sample-by-sample (love.sound.newSoundData)
 * then plays them as Sources. We do the same: build short AudioBuffers once,
 * play them on demand. The looping background music is a plain <audio> element.
 *
 * Browsers block audio until a user gesture, so unlock() is called on first input.
 */
window.ASCENT = window.ASCENT || {};

ASCENT.Audio = {
  ctx: null,
  master: 0.7,
  snd: {},            // named SFX buffers
  music: null,        // <audio> element
  _osc: null,         // dynamic rope-tension oscillator
  _oscGain: null,
  _unlocked: false,

  init(musicEl) {
    this.master = ASCENT.CONFIG.DEFAULT_MASTER_VOLUME;
    this.music = musicEl;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this._build();
    } catch (e) { this.ctx = null; }
  },

  // Resume context + start music — must be triggered by a user gesture.
  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.updateMusicVolume();
    if (this.music && ASCENT.Save.options.soundEnabled) {
      this.music.play().catch(() => {});
    }
  },

  // ---- buffer synthesis (matches AudioGenerator:createRopeTension/createImpact) ----
  _ropeTension(freq, dur) {
    const sr = this.ctx.sampleRate;
    const n = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let env = 1.0;
      if (t > dur * 0.8) env = (dur - t) / (dur * 0.2);
      const vib = 1 + Math.sin(t * 6 * Math.PI * 2) * 0.02;
      d[i] = Math.sin(2 * Math.PI * freq * vib * t) * env * 0.3;
    }
    return buf;
  },

  _impact(freq, attack, decay) {
    const sr = this.ctx.sampleRate;
    const dur = attack + decay;
    const n = Math.floor(sr * dur);
    const buf = this.ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      let env = t < attack ? t / attack : 1.0 - (t - attack) / decay;
      env = Math.max(0, env);
      const q = 1.0 - t / dur * 0.3;
      const p = Math.sin(2 * Math.PI * freq * q * t);
      const noise = (Math.random() * 2 - 1) * 0.3;
      d[i] = (p * 0.7 + noise * 0.3) * env * 0.4;
    }
    return buf;
  },

  _build() {
    if (!this.ctx) return;
    const T = (f, d) => this._ropeTension(f, d);
    const I = (f, a, d) => this._impact(f, a, d);
    this.snd = {
      ropeShoot:   T(440, 0.2),
      ropeAttach:  T(220, 0.1),
      ropeSnap:    T(880, 0.15),
      swingWhoosh: T(60,  0.3),
      boostPulse:  T(330, 0.25),
      meteorWhoosh:T(100, 0.2),
      solarFlare:  T(2000, 0.5),
      landing:     I(80,  0.01, 0.2),
      jump:        I(200, 0.02, 0.15),
      crumble:     I(150, 0.01, 0.3),
      victory:     I(440, 0.05, 0.5),
      achievement: I(880, 0.02, 0.3),
    };
  },

  play(name, vol, pitch) {
    if (!this.ctx || !ASCENT.Save.options.soundEnabled) return;
    const buf = this.snd[name];
    if (!buf) return;
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = pitch || 1;
      const g = this.ctx.createGain();
      g.gain.value = (vol === undefined ? 1 : vol) * this.master;
      src.connect(g).connect(this.ctx.destination);
      src.start();
    } catch (e) { /* ignore */ }
  },

  // Dynamic rope-tension hum — frequency & volume track rope length ratio.
  setTension(active, ratio) {
    if (!this.ctx) return;
    const want = active && ratio > 0.3 && ASCENT.Save.options.soundEnabled;
    if (want) {
      if (!this._osc) {
        this._osc = this.ctx.createOscillator();
        this._osc.type = 'triangle';
        this._oscGain = this.ctx.createGain();
        this._oscGain.gain.value = 0;
        this._osc.connect(this._oscGain).connect(this.ctx.destination);
        this._osc.start();
      }
      const bE = 1 + ratio * 0.5;
      this._osc.frequency.value = 110 * bE;
      this._oscGain.gain.value = ratio * 0.25 * this.master;
    } else if (this._osc) {
      try { this._osc.stop(); this._osc.disconnect(); } catch (e) {}
      this._osc = null; this._oscGain = null;
    }
  },

  updateMusicVolume() {
    if (!this.music) return;
    this.music.volume = ASCENT.Save.options.soundEnabled
      ? this.master * ASCENT.CONFIG.MUSIC_VOLUME_FACTOR : 0;
  },

  setMasterVolume(v) {
    this.master = Math.max(0, Math.min(1, v));
    this.updateMusicVolume();
  },
};
