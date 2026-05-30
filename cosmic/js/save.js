/*
 * SAVE — persistence + stats + achievements + best times.
 * =======================================================
 * Replaces LÖVE's love.filesystem .dat files with localStorage (JSON).
 * Holds the live options/stats/bestTimes objects the game reads & writes.
 */
window.ASCENT = window.ASCENT || {};

ASCENT.formatTime = function (seconds) {
  seconds = Math.max(0, seconds || 0);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const p = (n) => (n < 10 ? '0' + n : '' + n);
  return `${p(h)}:${p(m)}:${p(s)}`;
};

ASCENT.Save = {
  KEY_OPT: 'cosmic_options',
  KEY_STATS: 'cosmic_stats',
  KEY_BEST: 'cosmic_best_times',
  KEY_ACH: 'cosmic_achievements',

  options: {
    soundEnabled: true,
    lightingEnabled: false,
    controlScheme: 'keyboard',   // web default = keyboard+mouse (original was 'controller')
    debugMode: false,
  },

  stats: {
    timePlayed: 0, gamesCompleted: 0, gamesAttempted: 0,
    totalFallTime: 0, totalFallDistance: 0,
    ropesShot: 0, ropesFailed: 0, jumps: 0, successfulRopes: 0,
    gravityWellTime: 0,
  },

  bestTimes: [],   // [{ seconds, date }]

  _read(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  },
  _write(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); }
    catch (e) { /* private mode / quota — fail quietly like the original's pcall */ }
  },

  loadAll() {
    const o = this._read(this.KEY_OPT);
    if (o) Object.assign(this.options, o);
    const s = this._read(this.KEY_STATS);
    if (s) Object.assign(this.stats, s);
    const b = this._read(this.KEY_BEST);
    if (Array.isArray(b)) this.bestTimes = b;
    this.bestTimes.sort((a, c) => a.seconds - c.seconds);

    // Apply unlocked achievement ids onto the ACHIEVEMENTS list.
    const unlocked = this._read(this.KEY_ACH) || [];
    for (const a of ASCENT.ACHIEVEMENTS) a.unlocked = unlocked.includes(a.id);
  },

  saveOptions() { this._write(this.KEY_OPT, this.options); },
  saveStats() { this._write(this.KEY_STATS, this.stats); },
  saveBestTimes() { this._write(this.KEY_BEST, this.bestTimes); },
  saveAchievements() {
    this._write(this.KEY_ACH, ASCENT.ACHIEVEMENTS.filter(a => a.unlocked).map(a => a.id));
  },

  bestTime() { return this.bestTimes.length ? this.bestTimes[0].seconds : null; },

  addBestTime(seconds) {
    const d = new Date();
    const pad = (n) => (n < 10 ? '0' + n : '' + n);
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
                 `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    this.bestTimes.push({ seconds, date });
    this.bestTimes.sort((a, c) => a.seconds - c.seconds);
    while (this.bestTimes.length > ASCENT.CONFIG.MAX_BEST_TIMES) this.bestTimes.pop();
    this.saveBestTimes();
  },

  resetStats() {
    for (const k in this.stats) this.stats[k] = 0;
    for (const a of ASCENT.ACHIEVEMENTS) a.unlocked = false;
    this.saveStats();
    this.saveAchievements();
  },
};
