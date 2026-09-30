/*
 * AUDIO
 * =====
 * Every sound is synthesised with WebAudio (no files): the willow "tock",
 * edges, the ball thudding into the net, stumps clattering, footfalls,
 * rhythm ticks and a little birdsong ambience.
 */
(function () {
  const CLLM = window.CLLM;

  const A = {
    ctx: null, master: null, noise: null, muted: false, ambT: 0,

    unlock() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.8;
    },

    _env(g, t, a, peak, dec) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    },

    _noise(t, dur, type, freq, q, peak, dec, att = 0.002) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain();
      this._env(g, t, att, peak, dec);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t, Math.random() * 1.0);
      src.stop(t + att + dec + 0.05);
    },

    _tone(t, type, f0, f1, peak, dec, att = 0.002) {
      const c = this.ctx;
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + att + dec);
      const g = c.createGain();
      this._env(g, t, att, peak, dec);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + att + dec + 0.05);
    },

    // quality 0..1 (1 = middled). kind: 'middle' | 'edge' | 'defend' | 'mistimed'
    bat(quality, kind) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      if (kind === 'edge') {
        this._noise(t, 0.05, 'bandpass', 3800, 3, 0.35, 0.05);
        this._tone(t, 'triangle', 2400, 1800, 0.08, 0.04);
        return;
      }
      if (kind === 'defend') {
        this._noise(t, 0.06, 'bandpass', 1300, 2, 0.35, 0.07);
        this._tone(t, 'sine', 620, 420, 0.25, 0.07);
        return;
      }
      const q = Math.max(0, Math.min(1, quality));
      // a crisp, woody knock that gets brighter and louder the better the contact
      this._noise(t, 0.08, 'bandpass', 1100 + 1300 * q, 2.5 + 3 * q, 0.35 + 0.55 * q, 0.06 + 0.05 * q);
      this._tone(t, 'sine', 700 + 380 * q, 480, 0.25 + 0.4 * q, 0.07 + 0.06 * q);
      this._tone(t, 'triangle', 1450 + 500 * q, 1100, 0.08 + 0.12 * q, 0.05);
      if (q > 0.85) this._tone(t + 0.004, 'sine', 2600, 2200, 0.08, 0.12);
    },

    pad() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.1, 'lowpass', 500, 1, 0.5, 0.09);
      this._tone(t, 'sine', 180, 120, 0.3, 0.08);
    },

    bounce(power) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const p = Math.max(0.15, Math.min(1, power));
      this._noise(t, 0.06, 'lowpass', 700, 1, 0.25 * p, 0.06);
      this._tone(t, 'sine', 140, 90, 0.2 * p, 0.06);
    },

    net(power) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const p = Math.max(0.2, Math.min(1, power / 20));
      this._noise(t, 0.3, 'bandpass', 900, 0.8, 0.35 * p, 0.28, 0.01);
      this._noise(t + 0.02, 0.2, 'highpass', 3000, 0.7, 0.1 * p, 0.2, 0.02);
      this._tone(t, 'sine', 110, 70, 0.25 * p, 0.12);
    },

    stumps() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.08, 'bandpass', 1600, 4, 0.7, 0.09);
      this._tone(t, 'square', 900, 500, 0.12, 0.06);
      for (let i = 1; i < 5; i++) {
        const dt = 0.05 * i + Math.random() * 0.03;
        this._noise(t + dt, 0.04, 'bandpass', 2000 + Math.random() * 1500, 5, 0.25 / i, 0.05);
      }
    },

    step(power = 0.5) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this._noise(t, 0.05, 'lowpass', 380 + 200 * power, 1, 0.12 + 0.18 * power, 0.07);
    },

    // Rhythm tick (metronome) — accent for the key beat
    tick(accent) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this._tone(t, 'sine', accent ? 1760 : 1320, null, accent ? 0.16 : 0.09, 0.05);
    },

    // Graded judgement chime (0 = miss .. 3 = perfect)
    judge(level) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      if (level >= 3) { this._tone(t, 'triangle', 1568, null, 0.12, 0.12); this._tone(t + 0.05, 'triangle', 2093, null, 0.1, 0.15); }
      else if (level === 2) this._tone(t, 'triangle', 1318, null, 0.1, 0.1);
      else if (level === 1) this._tone(t, 'triangle', 988, null, 0.08, 0.08);
      else this._tone(t, 'sawtooth', 220, 160, 0.06, 0.12);
    },

    ui() {
      if (!this.ctx) return;
      this._tone(this.ctx.currentTime, 'sine', 880, 660, 0.07, 0.05);
    },

    // Big moment stingers
    cheer(big) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const notes = big ? [523, 659, 784, 1047] : [523, 659, 784];
      notes.forEach((f, i) => this._tone(t + i * 0.07, 'triangle', f, null, 0.09, 0.18));
    },
    groan() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [392, 330, 262].forEach((f, i) => this._tone(t + i * 0.1, 'triangle', f, f * 0.97, 0.08, 0.2));
    },

    // Occasional birdsong + a breath of wind. Call every frame.
    ambience(dt) {
      if (!this.ctx || this.muted) return;
      this.ambT -= dt;
      if (this.ambT > 0) return;
      this.ambT = 2.5 + Math.random() * 6;
      const t = this.ctx.currentTime;
      const base = 2600 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        const tt = t + i * (0.09 + Math.random() * 0.05);
        this._tone(tt, 'sine', base * (1 + Math.random() * 0.2), base * (0.8 + Math.random() * 0.5), 0.018, 0.06);
      }
      if (Math.random() < 0.35) this._noise(t, 1.5, 'lowpass', 400, 0.5, 0.02, 1.4, 0.6);
    },
  };

  CLLM.Audio = A;
})();
