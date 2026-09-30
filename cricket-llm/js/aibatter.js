/*
 * AI BATTER (bowling mode)
 * ========================
 * A batter who reads, predicts, commits and — crucially — LEARNS.
 *
 * He keeps running beliefs about how your deliveries move and how fast they
 * are, so a string of away-swingers makes him lean for away-swing, and the one
 * that comes back gets him. Bowl the same ball over and over and he lines you
 * up. Loose balls get punished. A good release disguises variations.
 *
 * Coordinates: x is batter-relative metres (+ = off side), y = length (m from
 * his stumps). Movement: + = away from him.
 */
(function () {
  const CLLM = window.CLLM;
  const { M, BallPhys } = CLLM;

  // Base chance to read each variation from the hand
  const READ = {
    out: 0.55, in: 0.55, cutter: 0.3, slower: 0.3, bouncer: 0.4, yorker: 0.3,
    arm: 0.35, doosra: 0.5, top: 0.4, googly: 0.55, flipper: 0.4, slider: 0.35,
  };
  // Length misread (m, + = he thinks it's shorter than it is) when NOT read
  const MISREAD = { slower: 0.3, top: -0.3, flipper: 0.35 };

  // Pace height at the stumps by length (for the vertical error model)
  const Z_PACE = [[0, 0.05], [1.5, 0.2], [3, 0.32], [5, 0.53], [7, 0.75], [9, 1.03], [11, 1.5], [12, 1.82]];
  function zOf(type, y) {
    if (type !== 'pace') return 0.3 + 0.055 * y;
    for (let i = 1; i < Z_PACE.length; i++) {
      if (y <= Z_PACE[i][0]) {
        const a = Z_PACE[i - 1], b = Z_PACE[i];
        return M.lerp(a[1], b[1], M.clamp((y - a[0]) / (b[0] - a[0]), 0, 1));
      }
    }
    return 1.9;
  }

  class AIBatter {
    constructor(skill, hand) {
      this.S = skill;
      this.hand = hand;
      this.reset();
      this.mAir = 0; this.mPitch = 0; this.vHat = null; this.f = 0;
      this.hist = [];
    }

    reset() { this.C = 0.4; this.P = 0; this.bflag = 0; }

    setType(type) {
      this.type = type;
      const stock = CLLM.Deliveries.VARIATIONS[type][0];
      // Spinners: he expects the stock turn from the start
      this.mPitch = type === 'pace' ? 0 : this.stockPitch(type);
      this.mAir = 0;
    }

    // Stock turn relative to THIS batter (+ = away). Movement is fixed to the
    // (right-arm) bowler, so it flips for a left-hander.
    stockPitch(type) {
      const s = type === 'leg' ? 0.3 : type === 'off' ? -0.26 : 0;
      return this.hand === 'L' ? -s : s;
    }

    /*
     * Decide and resolve. d = {
     *   type, varKey, plan, lengthM, lineOff (x at the pitch, +off), xStumps (+off), zStumps,
     *   mAir, mPitch (actual movement, +away), release: 'perfect'|'good'|'ok'|'wild', freeHit, kmh, onset }
     */
    face(d) {
      const S = this.S;
      const spin = d.type !== 'pace';
      // --- lined up?
      const last3 = this.hist.slice(-3);
      const linedUp = last3.length === 3 && last3.every((h) => h.varKey === d.varKey && Math.abs(h.line - d.lineOff) < 0.12 && Math.abs(h.len - d.lengthM) < 0.6);
      // --- read from the hand
      const disguise = { perfect: 0.6, good: 0.9, ok: 1.3, wild: 1.8 }[d.release] || 1;
      const share = this.hist.slice(-6).filter((h) => h.varKey === d.varKey).length / 6;
      const base = d.varKey === 'stock' ? 0 : (READ[d.varKey] || 0.3);
      const pRead = M.clamp(base * (0.5 + S) * disguise * (1 + 2 * share) * (d.groove5 ? 0.8 : 1), 0, 0.95);
      const read = d.varKey !== 'stock' && Math.random() < pRead;
      // --- predict length
      const sigY = (spin ? 0.25 : 0.35) * (1 - 0.5 * S) * (linedUp ? 0.5 : 1);
      const yHat = d.lengthM + (read ? 0 : MISREAD[d.varKey] || 0) + M.gauss() * sigY;
      const split = (spin ? 5.2 : 7.8) - 1.2 * this.f;
      const foot = d.lengthM < 0.3 ? 'front' : yHat < split ? 'front' : 'back';
      const c = foot === 'front' ? 2.0 : 0.8;
      // predicted line at contact
      const mAirHat = read ? d.mAir : this.mAir;
      const mPitchHat = read ? d.mPitch : this.mPitch;
      const pf = M.clamp((d.lengthM - c) / Math.max(d.lengthM, 0.5), 0, 1);
      const xcHat = d.lineOff + mAirHat * 0.4 + mPitchHat * pf;
      // --- zone
      let zone;
      const Lb = this._band(d.type, yHat);
      if (d.lengthM < 0) zone = 'toss';
      else if (xcHat < -0.18) zone = 'leg';
      else if (Lb === 'yorker') zone = 'yorker';
      else if (Lb === 'hv') zone = 'hv';
      else if (Lb === 'full') zone = 'full';
      else if (Lb === 'good') zone = xcHat > 0.35 ? 'goodWide' : 'good';
      else if (Lb === 'short') zone = xcHat > 0.3 ? 'shortWide' : spin ? 'longhop' : 'short';
      else zone = spin ? 'longhop' : 'bouncer';
      const ZT = {
        toss: [0.97, 1.5], yorker: [0.2, 0.75], leg: [0.8, 1.25], hv: [0.9, 1.3], full: [0.6, 1.05], good: [0.35, 0.9],
        goodWide: [0.4, 1.05], shortWide: [0.85, 1.3], short: [0.6, 1.05], bouncer: [0.35, 0.85], longhop: [0.95, 1.4],
      };
      let [attackBase, Mz] = ZT[zone];
      if (spin && (zone === 'good' || zone === 'full')) attackBase += 0.15;   // batters take spin on
      const A = M.clamp(0.7 + 0.08 * this.P + 0.3 * this.C - 0.25 * this.bflag, 0.2, 1.5);
      // a match sets the tempo (1 in the nets): block it out .. go for it
      const tempo = this.tempo || 1;
      let pAttack = Math.min(0.97, attackBase * A * tempo + (linedUp ? 0.1 : 0));
      if (d.freeHit) pAttack = 1;
      // would it hit (as he sees it)?
      const wouldHitHat = Math.abs(d.xStumps - (read ? 0 : (d.mPitch - mPitchHat) * pf)) < (spin ? 0.35 : 0.23) && d.zStumps < 0.83;
      let shot;
      if (Math.random() < pAttack) {
        let pLoft = M.clamp((0.1 + 0.04 * this.P + 0.25 * this.C) * Math.sqrt(tempo), 0, 0.6);
        if (zone === 'toss' || zone === 'hv' || zone === 'longhop') pLoft = Math.min(0.7, pLoft * 1.5);
        if (d.freeHit) pLoft = 0.8;
        shot = Math.random() < pLoft ? 'loft' : 'hit';
      } else if (wouldHitHat || (spin && Math.abs(d.lineOff) < 0.25)) shot = 'defend';
      else shot = d.zStumps > 1.3 ? 'duck' : 'leave';

      // --- errors
      const vStock = spin ? 85 : 138;
      if (this.vHat == null) this.vHat = d.kmh;
      const v = d.kmh / 3.6;
      const tbc = Math.max(0.02, (d.lengthM - c) / ((spin ? 0.8 : 0.82) * v));
      const uPitch = M.clamp(0.19 / tbc, 0.35, 1);
      const Tfl = 18.9 / (0.9 * v);
      const uAir = spin ? 0.35 : M.clamp(0.19 / ((1 - (d.onset || 0.65)) * Tfl), 0.3, 0.65);
      const dx = uAir * Math.abs(d.mAir - mAirHat) + uPitch * pf * Math.abs(d.mPitch - mPitchHat) + Math.abs(M.gauss() * 0.02 * (1 - 0.5 * S));
      const dz = Math.abs(zOf(d.type, d.lengthM) * (d.bounceMul || 1) - zOf(d.type, yHat)) * uPitch * (0.5 + 0.5 * pf);
      let et = -18000 * (1 / d.kmh - 1 / this.vHat) * (read ? 0.3 : 0.6) * (spin ? 0.6 : 1);
      if (foot === 'front' && d.lengthM > split + 0.6) et -= 40;
      if (foot === 'back' && d.lengthM < split - 0.6) et += 40;
      if (d.lengthM < split) et += 30 * Math.max(0, this.f); else et -= 30 * Math.max(0, -this.f);
      et += M.gauss() * (25 - 12 * S);
      let W = (0.08 + (spin ? 0.02 : 0) + 0.06 * S), Wz = 0.1 + 0.06 * S, T = 55 + 40 * S;
      const k = Mz * (0.9 + 0.2 * this.C) * (linedUp ? 1.2 : 1);
      W *= k; Wz *= k; T *= k;
      if (shot === 'defend') { W *= 1.5; Wz *= 1.5; T *= 1.8; }
      if (shot === 'loft') { W *= 0.85; Wz *= 0.85; T *= 0.85; }
      const E = Math.sqrt((dx / W) ** 2 + (dz / Wz) ** 2 + (et / T) ** 2);
      const timingDominant = Math.abs(et / T) >= Math.max(dx / W, dz / Wz);
      const lateral = dx / W > dz / Wz;
      return { foot, shot, zone, read, linedUp, E, et, dx, dz, timingDominant, lateral, xcHat, yHat, pRead, split };
    }

    _band(type, y) {
      if (type === 'pace') {
        if (y < 1.5) return 'yorker';
        if (y < 4.5) return 'hv';
        if (y < 6) return 'full';
        if (y < 8.5) return 'good';
        if (y < 10.5) return 'short';
        return 'bouncer';
      }
      if (y < 0.8) return 'yorker';
      if (y < 2.5) return 'hv';
      if (y < 3.2) return 'full';
      if (y < 5.5) return 'good';
      if (y < 6.8) return 'short';
      return 'longhop';
    }

    // Learn after the ball. res = {E, attacked, beaten, edged, out}
    learn(d, res) {
      if (res.attacked) this.C += 0.15 * (Math.exp(-res.E * res.E) - 0.5);
      if (res.beaten || res.edged) { this.C -= 0.08; this.bflag = 1; } else this.bflag = Math.max(0, this.bflag - 0.34);
      this.C = M.clamp(this.C, 0, 1);
      if (res.runs === 0 && !res.out) this.P++; else this.P = 0;
      this.mAir = M.lerp(this.mAir, d.mAir, 0.4);
      this.mPitch = M.lerp(this.mPitch, d.mPitch, 0.4);
      this.vHat = M.lerp(this.vHat == null ? d.kmh : this.vHat, d.kmh, 0.35);
      const g = d.lengthM > (d.type === 'pace' ? 9 : 5.8) ? 1 : d.lengthM < (d.type === 'pace' ? 4.5 : 2.6) ? -1 : 0;
      this.f = M.lerp(this.f, g, 0.4);
      this.hist.push({ varKey: d.varKey, line: d.lineOff, len: d.lengthM });
      if (this.hist.length > 10) this.hist.shift();
      if (res.out) { this.C = 0.4; this.P = 0; }
    }
  }

  CLLM.AIBatter = AIBatter;
})();
