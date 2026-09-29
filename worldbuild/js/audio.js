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
}
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
