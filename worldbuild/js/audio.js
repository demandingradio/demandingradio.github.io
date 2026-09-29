/* Diorama — ambient soundscape, synthesised live with WebAudio. Sound follows the
   camera: surf near coasts, wind on the heights, birdsong over forests, crickets at
   night, a city hum over towns, rain, rushing rivers and rolling thunder. */
(function () {
'use strict';
const D = window.D;
const { SIZE } = D;

const A = D.Audio = { on: false, ctx: null };
let ctx, master, layers = {}, noiseBuf, brownBuf;
let sampleT = 0;
const env = { water: 0, forest: 0, city: 0, river: 0, close: 0, high: 0 };

function makeNoise(brown) {
  const len = ctx.sampleRate * 3;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return b;
}
function noiseLayer(buf, filters, gain) {
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  src.playbackRate.value = 0.9 + Math.random() * 0.2;
  let node = src;
  filters.forEach(([type, f, q]) => { const bq = ctx.createBiquadFilter(); bq.type = type; bq.frequency.value = f; if (q) bq.Q.value = q; node.connect(bq); node = bq; });
  const g = ctx.createGain(); g.gain.value = 0;
  node.connect(g); g.connect(master);
  src.start(Math.random() * 2);
  return { src, g, target: 0, cur: 0, gainMax: gain };
}

A.init = function () {
  const pref = D.Save && D.Save.loadPrefs ? D.Save.loadPrefs() : {};
  A.wantOn = !!pref.sound;
  if (A.wantOn) {
    const start = () => { if (!A.on) A.toggle(true); window.removeEventListener('pointerdown', start); window.removeEventListener('keydown', start); };
    window.addEventListener('pointerdown', start); window.addEventListener('keydown', start);
  }
  D.on('lightning', thunder);
  D.on('bells', ring);
};
function start() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  A.ctx = ctx;
  master = ctx.createGain(); master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = makeNoise(false); brownBuf = makeNoise(true);
  layers.wind = noiseLayer(noiseBuf, [['bandpass', 520, 0.6], ['lowpass', 1400]], 0.35);
  layers.wind2 = noiseLayer(brownBuf, [['lowpass', 260]], 0.35);
  layers.surf = noiseLayer(noiseBuf, [['lowpass', 700], ['highpass', 90]], 0.45);
  layers.rain = noiseLayer(noiseBuf, [['highpass', 1300], ['lowpass', 9000]], 0.28);
  layers.city = noiseLayer(brownBuf, [['lowpass', 180], ['highpass', 35]], 0.5);
  layers.river = noiseLayer(noiseBuf, [['bandpass', 1900, 0.5]], 0.25);
  // crickets: pulsing high tone
  const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 4400;
  const am = ctx.createGain(); am.gain.value = 0;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 28; const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
  lfo.connect(lfoG); lfoG.connect(am.gain);
  const cg = ctx.createGain(); cg.gain.value = 0;
  osc.connect(am); am.connect(cg); cg.connect(master);
  osc.start(); lfo.start();
  layers.crickets = { g: cg, target: 0, cur: 0, gainMax: 0.035, lfoG };
  master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.5);
  // one tenor strike, re-pitched per bell with playbackRate
  const rs = D.rng ? D.rng(0xbe11) : Math.random, data = bellStrike(ctx.sampleRate, 4, rs);
  bellBuf = ctx.createBuffer(1, data.length, ctx.sampleRate); bellBuf.getChannelData(0).set(data);
}

// ---- church bells (Living History): a peal rung when a great work is finished --------------------------------
// The strike is additive: damped partials of a tuned bell (hum .5, prime 1, minor-third tierce 1.19, quint 1.5,
// nominal 2, …) with slight detune, the low partials ringing longest, over a 20 ms clapper-noise transient.
const BELL_P = [0.5, 1, 1.19, 1.5, 2, 2.52, 3, 4.07], BELL_A = [0.45, 0.7, 0.5, 0.3, 0.6, 0.28, 0.22, 0.14], BELL_T = [3.4, 2.4, 1.7, 1.35, 1.1, 0.8, 0.6, 0.42];
function bellStrike(sr, sec, rnd) {
  const n = Math.max(1, Math.floor(sr * sec)), out = new Float32Array(n), f0 = 220;
  for (let k = 0; k < BELL_P.length; k++) {
    const f = f0 * BELL_P[k] * (1 + (rnd() - 0.5) * 0.006), w = 2 * Math.PI * f / sr;
    if (f > sr * 0.45) continue;
    const c = Math.cos(w), s = Math.sin(w), dk = Math.exp(-1 / (BELL_T[k] * sr));
    let x = Math.cos(rnd() * 6.283), y = Math.sin(rnd() * 6.283), a = BELL_A[k];   // phasor rotation: no per-sample sin/exp
    for (let i = 0; i < n; i++) { out[i] += a * y; const nx = x * c - y * s; y = x * s + y * c; x = nx; a *= dk; }
  }
  const nT = Math.floor(sr * 0.02);
  for (let i = 0; i < nT && i < n; i++) { const e = 1 - i / nT; out[i] += (rnd() * 2 - 1) * 0.35 * e * e; }
  const at = Math.floor(sr * 0.004);                                       // 4 ms attack, fade the tail to silence
  for (let i = 0; i < at && i < n; i++) out[i] *= i / at;
  const ft = Math.floor(sr * 0.3); for (let i = 0; i < ft && i < n; i++) out[n - 1 - i] *= i / ft;
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(out[i]));
  if (pk > 0) for (let i = 0; i < n; i++) out[i] *= 0.9 / pk;
  return out;
}
// rounds on eight bells (treble → tenor, a major scale down), .28 s apart with the handstroke gap, three rows,
// then five slow tolls of the tenor → [[time s, playbackRate], ...]
const PEAL_R = [2, 15 / 8, 5 / 3, 3 / 2, 4 / 3, 5 / 4, 9 / 8, 1];
function pealSchedule() {
  const ev = [], gap = 0.28; let t = 0;
  for (let row = 0; row < 3; row++) {
    if (row > 0 && row % 2 === 0) t += gap;                                // handstroke rows open with a one-beat gap
    for (let b = 0; b < 8; b++) { ev.push([t, PEAL_R[b]]); t += gap; }
  }
  t += 1.4;
  for (let k = 0; k < 5; k++) { ev.push([t, 1]); t += 2.4; }
  return ev;
}
// distance d (m) → lowpass cutoff, gain and air delay
function strikeParams(d) { return { lp: 900 + 7000 * Math.exp(-d / 3000), gain: Math.max(0.05, 0.35 / (1 + d / 900)), delay: Math.min(d / 343, 4) }; }
let bellBuf = null;
const bellCam = { x: 0, y: 0, z: 0, rx: 1, rz: 0 }, peals = [];
function ring(e) {
  if (!ctx || !A.on || !bellBuf || !e) return;
  if (document.hidden || (D.Story && (D.Story.catchingUp || D.Story.replaying))) return;
  const now = ctx.currentTime;
  for (let i = peals.length - 1; i >= 0; i--) if (peals[i] < now) peals.splice(i, 1);
  if (peals.length >= 2) return;                                         // ≤ 2 concurrent peals
  const gy = D.Terrain && D.Terrain.hAt ? D.Terrain.hAt(e.x, e.z) : 0;
  const dx = e.x - bellCam.x, dz = e.z - bellCam.z, d = Math.hypot(dx, dz, bellCam.y - gy - 20);
  const P = strikeParams(d), hl = Math.hypot(dx, dz) || 1;
  const pan = D.clamp((dx * bellCam.rx + dz * bellCam.rz) / hl, -1, 1) * 0.85;
  const sched = pealSchedule();
  let end = now;
  for (const [t, rate] of sched) {
    const src = ctx.createBufferSource(); src.buffer = bellBuf; src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.004);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = P.lp;
    const g = ctx.createGain(); g.gain.value = P.gain * (0.85 + Math.random() * 0.15) * (rate === 1 && t > 6 ? 1.1 : 1);
    src.connect(lp); lp.connect(g);
    if (ctx.createStereoPanner) { const sp = ctx.createStereoPanner(); sp.pan.value = pan; g.connect(sp); sp.connect(master); }
    else g.connect(master);
    const t0 = now + P.delay + t;
    src.start(t0); src.stop(t0 + bellBuf.duration / rate + 0.1);
    end = Math.max(end, t0 + bellBuf.duration / rate);
  }
  peals.push(end);
}
A._pure = { bellStrike, pealSchedule, strikeParams };
A.toggle = function (force) {
  const want = force !== undefined ? force : !A.on;
  if (want && !ctx) start();
  if (!ctx) return;
  if (want) { ctx.resume(); master.gain.cancelScheduledValues(ctx.currentTime); master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.8); }
  else master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
  A.on = want;
  if (D.Save) D.Save.prefs({ sound: want });
  if (D.UI && D.UI.refreshQuick) D.UI.refreshQuick();
  if (want) D.toast('Ambient sound on');
};

function chirp() {
  if (!ctx || !A.on) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  const base = 2200 + Math.random() * 2600;
  o.type = 'sine';
  const n = 1 + Math.floor(Math.random() * 4);
  g.gain.value = 0;
  for (let k = 0; k < n; k++) {
    const t0 = t + k * (0.09 + Math.random() * 0.06);
    o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), t0);
    o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), t0 + 0.06);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.05 * env.forest * env.close, t0 + 0.015); g.gain.linearRampToValueAtTime(0, t0 + 0.08);
  }
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; o.connect(g); g.connect(pan); pan.connect(master); } else { o.connect(g); g.connect(master); }
  o.start(t); o.stop(t + n * 0.16 + 0.1);
}
function thunder() {
  if (!ctx || !A.on) return;
  const delay = 0.4 + Math.random() * 1.8;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = brownBuf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180 + Math.random() * 200;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(master);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.08); g.gain.exponentialRampToValueAtTime(0.001, t + 3.5 + Math.random() * 2);
  src.start(t, Math.random() * 1.5); src.stop(t + 6);
}

// sample the neighbourhood of the view
function sampleEnv(focus, dist) {
  const r = D.clamp(dist * 0.5, 120, 2500);
  let water = 0, forest = 0, n = 0;
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, rr = r * (0.35 + (k % 3) * 0.3);
    const x = focus.x + Math.cos(a) * rr, z = focus.z + Math.sin(a) * rr;
    if (!D.inMap(x, z)) { water++; n++; continue; }
    if (D.Terrain.isWet(x, z, 0.5)) water++;
    const i = Math.round(x / D.CELL), j = Math.round(z / D.CELL);
    forest += D.W.forest[j * D.VN + i] / 255;
    n++;
  }
  env.water = water / n;
  env.forest = forest / n;
  let b = 0;
  if (D.City) D.City.chunks.forEach(a => { for (const bb of a) if (Math.abs(bb.x - focus.x) < r && Math.abs(bb.z - focus.z) < r) b++; });
  env.city = D.clamp(b / 120, 0, 1);
  env.river = D.Water && D.Water.riverNear(focus.x, focus.z, Math.min(600, r)) ? 1 : 0;
  if (D.Water && D.Water.falls) D.Water.falls.forEach(f => { if (Math.hypot(f[0] - focus.x, f[2] - focus.z) < 500) env.river = 1.6; });
  env.close = 1 - D.smooth(300, 9000, dist);
  env.high = D.smooth(600, 12000, dist);
}

A.update = function (dt, camera, focus, dist) {
  if (camera && camera.matrixWorld) {                                    // bells pan against the camera's right vector
    const m = camera.matrixWorld.elements, rl = Math.hypot(m[0], m[2]) || 1;
    bellCam.x = camera.position.x; bellCam.y = camera.position.y; bellCam.z = camera.position.z; bellCam.rx = m[0] / rl; bellCam.rz = m[2] / rl;
  }
  if (!ctx || !A.on) return;
  sampleT -= dt;
  if (sampleT <= 0) { sampleT = 0.4; sampleEnv(focus, dist); }
  const E = D.Env;
  const rain = E.weather === 'rain' ? 0.7 : E.weather === 'storm' ? 1 : 0;
  const wind = 0.25 + E.wind * 0.5 + (E.weather === 'storm' ? 0.5 : 0);
  const t = ctx.currentTime;
  const swell = 0.55 + 0.45 * Math.sin(t * 0.55) * Math.sin(t * 0.21 + 1);
  const L = layers;
  L.wind.target = D.clamp(wind * (0.25 + env.high * 0.9), 0, 1);
  L.wind2.target = D.clamp(wind * (0.2 + env.high * 0.6), 0, 1);
  L.surf.target = env.water * env.close * (0.5 + 0.5 * swell) * (1 + rain * 0.3);
  L.rain.target = rain * (0.6 + 0.4 * env.close);
  L.city.target = env.city * env.close * (0.45 + 0.55 * E.day);
  L.river.target = D.clamp(env.river * env.close * 0.8, 0, 1);
  L.crickets.target = E.night * env.forest * env.close * (1 - rain) * 1.4;
  for (const k in L) {
    const l = L[k];
    l.cur += (l.target - l.cur) * Math.min(1, dt * 1.5);
    l.g.gain.setTargetAtTime(l.cur * l.gainMax, t, 0.1);
  }
  L.crickets.lfoG.gain.value = 0.5;
  if (E.day > 0.5 && rain < 0.5 && Math.random() < dt * env.forest * env.close * 3.5) chirp();
};
})();
