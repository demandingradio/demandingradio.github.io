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
    settings: { hand: 'R', bowler: 'pace', diff: 'club', batControls: 'physical', bowlType: 'pace', batterHand: 'R', batterDiff: 'grade', calib: 0, batLimit: 0, batWeight: 20, batPower: 0.82, tuneV: 2, mFormat: 'lite', mLevel: 'grade', runAssist: 'default', muted: false, cam: 'broadcast', seenBat: false, seenBowl: false },
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
          // New standard bat (2026-09-30): swing power x0.82, heaviest bat weight
          const st = this.data.settings;
          if (!(d.settings && d.settings.tuneV >= 2)) { st.batPower = 0.82; st.batWeight = 20; st.tuneV = 2; }
          // Match settings: old length names, and "no choice yet" = the default for the device
          st.mFormat = { quick: 'lite', short: 'half', test: 'full' }[st.mFormat] || st.mFormat;
          if (['lite', 'half', 'full'].indexOf(st.mFormat) < 0) st.mFormat = 'lite';
          if (['club', 'grade', 'state', 'test'].indexOf(st.mLevel) < 0) st.mLevel = 'grade';
          if (['default', 'manual', 'auto'].indexOf(st.runAssist) < 0) st.runAssist = 'default';
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
