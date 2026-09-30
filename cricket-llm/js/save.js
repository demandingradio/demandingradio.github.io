/*
 * SAVE
 * ====
 * Best scores, lifetime stats and settings in localStorage. Every access is
 * wrapped so private windows / blocked storage just mean "no saving".
 */
(function () {
  const CLLM = window.CLLM;
  const KEY = 'cricketllm.v1';

  const DEFAULT = () => ({
    settings: { hand: 'R', bowler: 'pace', diff: 'club', bowlType: 'pace', batterHand: 'R', batterDiff: 'grade', calib: 0, muted: false, cam: 'broadcast', seenBat: false, seenBowl: false },
    best: { bat: {}, bowl: {} },
    stats: { batBalls: 0, batRuns: 0, batOuts: 0, fours: 0, sixes: 0, bowlBalls: 0, bowlWkts: 0, bowlRuns: 0, topSpeed: 0 },
  });

  const Save = {
    data: DEFAULT(),

    load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
          const d = JSON.parse(raw);
          const def = DEFAULT();
          this.data = {
            settings: Object.assign(def.settings, d.settings || {}),
            best: { bat: Object.assign({}, (d.best && d.best.bat) || {}), bowl: Object.assign({}, (d.best && d.best.bowl) || {}) },
            stats: Object.assign(def.stats, d.stats || {}),
          };
          // Never let a bad value (NaN/null) poison the lifetime stats
          for (const k in this.data.stats) if (!Number.isFinite(this.data.stats[k])) this.data.stats[k] = 0;
          if (!Number.isFinite(this.data.settings.calib)) this.data.settings.calib = 0;
        }
      } catch (e) { /* no storage */ }
      return this;
    },

    write() {
      try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
    },

    _k(diff, bowler, hand) { return `${diff}.${bowler}.${hand}`; },

    best(mode, diff, bowler, hand) {
      const b = this.data.best[mode][this._k(diff, bowler, hand)];
      return b || (mode === 'bat' ? { runs: 0, balls: 0 } : { wkts: 0, runs: 0, balls: 0 });
    },

    setBest(mode, diff, bowler, hand, val) {
      this.data.best[mode][this._k(diff, bowler, hand)] = val;
      this.write();
    },

    // Highest batting score across everything (for the title screen)
    topBat() {
      let top = null;
      for (const k in this.data.best.bat) {
        const v = this.data.best.bat[k];
        if (!top || v.runs > top.runs) top = Object.assign({ key: k }, v);
      }
      return top;
    },
  };

  CLLM.Save = Save;
})();
