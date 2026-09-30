/*
 * UI
 * ==
 * DOM HUD (scoreboard, callouts, coach line, toasts, mini-map) plus the
 * canvas overlays drawn on top of the 3D scene (aim reticle, timing bar,
 * the "hand read" tell bubble, bowling meters).
 */
(function () {
  const CLLM = window.CLLM;
  const { M, V, Field, Deliveries } = CLLM;
  const $ = (id) => document.getElementById(id);

  const UI = {
    game: null,
    fieldCtx: null,
    shotAnim: null,
    calloutTimer: null,

    init(game) {
      this.game = game;
      const fc = $('fieldCanvas');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      fc.width = 190 * dpr; fc.height = 190 * dpr;
      this.fieldCtx = fc.getContext('2d');
      this.fieldCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.fieldDpr = dpr;
    },

    showHud(mode) {
      document.body.dataset.mode = mode || '';
      this.shotAnim = null;
      for (const id of ['scoreboard', 'field', 'coach', 'bowlerTag', 'controlsHint', 'pauseBtn', 'muteBtn']) $(id).classList.toggle('hidden', !mode);
      $('callout').classList.toggle('hidden', !mode);
      this.clearCallout();
      $('coach').innerHTML = '';
      $('coach').classList.add('hidden');
      this.setHint(mode);
    },

    setHint(mode) {
      const el = $('controlsHint');
      if (mode === 'bat') {
        el.innerHTML = '<kbd>W</kbd> front foot · <kbd>S</kbd> back foot' + (this.game.session && this.game.session.spin ? ' · <kbd>E</kbd> dance' : '') +
          '<br>aim with the mouse · <b>click</b> hit · <b>right-click</b> loft<br><kbd>Space</kbd> defend · no click = leave · <kbd>Esc</kbd> pause';
      } else if (mode === 'bowl') {
        el.innerHTML = 'mouse: aim the spot · <kbd>1</kbd>-<kbd>5</kbd> variation<br><kbd>Space</kbd>/click to run in, tap on each footfall<br><b>hold</b> on the last beat · <b>let go</b> at the top · <kbd>Esc</kbd> pause';
      } else el.innerHTML = '';
    },

    // A short coaching card before the first ball of a session
    tips(mode) {
      const c = $('coach');
      const touch = this.game.input.touch;
      if (mode === 'bat') {
        c.innerHTML = `<div><span class="tag">Coach</span>Watch the hand, then the ball. <b>Full</b>? ${touch ? 'FRONT' : '<kbd>W</kbd>'} and drive. <b>Short</b>? ${touch ? 'BACK' : '<kbd>S</kbd>'} and cut or pull.</div>` +
          `<div class="chips"><span class="chip">${touch ? 'drag to aim' : 'aim with the mouse'}</span><span class="chip">${touch ? 'HIT' : 'click'} as it arrives</span><span class="chip">${touch ? 'LOFT' : 'right-click'} to go aerial</span><span class="chip">${touch ? 'BLOCK' : 'Space'} to defend</span><span class="chip">do nothing = leave</span></div>`;
      } else {
        c.innerHTML = `<div><span class="tag">Coach</span>Put the marker where you want it to pitch, then ${touch ? 'tap BOWL' : 'press <kbd>Space</kbd>'} to run in.</div>` +
          `<div class="chips"><span class="chip">tap on every footfall ring</span><span class="chip">HOLD on the jump</span><span class="chip">LET GO on the notch</span><span class="chip">early = fuller · late = shorter</span></div>`;
      }
      c.classList.remove('hidden');
    },

    toast(msg) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.remove('show');
      void t.offsetWidth;
      t.classList.add('show');
    },

    clearCallout() {
      const big = $('calloutBig'), small = $('calloutSmall');
      big.className = 'big'; big.textContent = ''; small.textContent = '';
    },

    callout(text, cls, sub) {
      const big = $('calloutBig'), small = $('calloutSmall');
      big.className = 'big';
      void big.offsetWidth;
      big.textContent = text;
      big.className = 'big show ' + (cls || '');
      small.textContent = sub || '';
      clearTimeout(this.calloutTimer);
      this.calloutTimer = setTimeout(() => this.clearCallout(), 2300);
    },

    // ---- batting ---------------------------------------------------------------
    score(s) {
      $('sbTitle').innerHTML = `<span>Net session</span><span>${s.diff.name} · ${s.hand === 'L' ? 'Left' : 'Right'}-hander</span>`;
      $('sbRuns').textContent = s.runs;
      $('sbBalls').textContent = `(${s.balls} ball${s.balls === 1 ? '' : 's'})`;
      const best = this.game.save.best('bat', s.diff.key, s.bowlerChoice, s.hand);
      const last = s.innings.slice(0, 4).map((i) => i.runs).join(', ');
      $('sbMeta').innerHTML = `<span>Best <b>${best.runs}</b></span><span>4s <b>${s.fours}</b> · 6s <b>${s.sixes}</b></span>` + (last ? `<span>Last: <b>${last}</b></span>` : '');
      const rec = $('recent');
      rec.innerHTML = '';
      for (const r of s.recent.slice(-8)) {
        const sp = document.createElement('span');
        sp.textContent = r;
        sp.className = r === 'W' ? 'rW' : r === '4' ? 'r4' : r === '6' ? 'r6' : r !== '·' ? 'rN' : '';
        rec.appendChild(sp);
      }
      this.drawField();
    },

    bowlerInfo(plan, type) {
      const T = Deliveries.TYPES[type];
      $('bowlerTag').innerHTML = `${T.name} · <b>${Math.round(plan.kmh)} km/h</b>`;
    },

    ballResult(s, r) {
      // Big call
      let cls = '';
      if (r.out) cls = 'out';
      else if (r.runs === 6) cls = 'six';
      else if (r.runs === 4) cls = 'four';
      else if (r.label === 'MIDDLED') cls = 'good';
      let big = r.out ? 'OUT!' : r.call;
      let sub = r.out ? `${r.call} ${r.sub ? '— ' + r.sub : ''}` : r.sub;
      if (r.out && r.innings) sub += `  ·  Innings: ${r.innings.runs} (${r.innings.balls})${r.innings.isBest ? ' — NEW BEST!' : ''}`;
      this.callout(big, cls, sub);
      // Coach line
      const chips = [];
      const c = $('coach');
      if (r.kind === 'leave') {
        chips.push({ t: 'Left it', c: r.out ? 'bad' : 'good' });
      } else if (r.e != null) {
        const ms = Math.round(r.e);
        const tl = Math.abs(ms) <= r.Pw ? 'PERFECT' : ms < 0 ? 'EARLY' : 'LATE';
        chips.push({ t: `${r.label} · ${tl} ${ms > 0 ? '+' : ''}${ms} ms`, c: r.cls === 3 ? 'good' : r.cls === 2 ? 'meh' : 'bad' });
      }
      const foot = r.foot;
      if (r.kind !== 'leave') {
        const plan = s.b.plan;
        const lenName = plan.lengthName;
        if (foot === 'stance') chips.push({ t: 'No foot movement (×0.75)', c: 'meh' });
        else if (foot === 'dance') chips.push({ t: 'Danced down the track', c: r.fitFoot >= 1 ? 'good' : 'bad' });
        else {
          const ok = r.fitFoot >= 0.95;
          chips.push({ t: `${foot === 'front' ? 'Front' : 'Back'} foot ${ok ? '✓' : r.fitFoot >= 0.75 ? '~' : '✗'} ${lenName}${r.lateFeet ? ' · late feet' : ''}`, c: ok && !r.lateFeet ? 'good' : r.fitFoot >= 0.75 ? 'meh' : 'bad' });
        }
        const fs = r.fitShot;
        const shotTxt = `${r.fam.name}${r.notes && r.notes.length ? ' — ' + r.notes[0] : ''}`;
        chips.push({ t: `${shotTxt} ${fs >= 0.95 ? '✓' : fs >= 0.7 ? '~' : '✗'}`, c: fs >= 0.95 ? 'good' : fs >= 0.7 ? 'meh' : 'bad' });
        if (r.lateMove) chips.push({ t: `${Deliveries.describeMove(plan) || 'moved'} ${Math.round(Math.abs(r.dx) * 100)} cm after you'd committed`, c: 'bad' });
        if (r.earlySet) chips.push({ t: 'In position early ×1.15', c: 'good' });
        if (r.K != null) chips.push({ t: `window ×${r.K.toFixed(2)}`, c: r.K >= 1 ? 'good' : r.K >= 0.7 ? 'meh' : 'bad' });
      }
      const plan = s.b.plan;
      const mv = Deliveries.describeMove(plan);
      const del = `${plan.varName} · ${Math.round(plan.kmh)} km/h · ${plan.lengthName}${mv ? ' · ' + mv : ''}`;
      c.innerHTML = `<div><span class="tag">${r.out ? 'Out' : 'Ball'}</span>${del}</div><div class="chips">${chips.map((ch) => `<span class="chip ${ch.c}">${ch.t}</span>`).join('')}</div>`;
      c.classList.remove('hidden');
      this.score(s);
      this.fieldShot(r.proj || s.field.last, false);
    },

    newInnings(s) {
      this.score(s);
      this.toast('New innings — score reset to 0');
    },

    // Animate the last shot on the mini-map
    fieldShot(proj, animate) {
      this.shotAnim = { proj, t0: performance.now(), animate };
    },

    drawField() {
      const s = this.game.session;
      if (!s || !this.fieldCtx) return;
      let shotT = 1;
      let proj = null;
      if (this.shotAnim && this.shotAnim.proj) {
        proj = this.shotAnim.proj;
        shotT = this.shotAnim.animate ? M.clamp((performance.now() - this.shotAnim.t0) / 900, 0, 1) : 1;
      }
      const showAim = s.aimPhi != null && s.b && s.b.phase !== 'done' && this.game.mode === 'bat';
      s.field.draw(this.fieldCtx, 190, 190, { aimPhi: showAim ? (s.b.ex ? s.b.ex.phi : s.aimPhi) : null, shot: s.b && s.b.phase === 'runup' ? null : proj, shotT });
    },

    // ---- canvas overlays -------------------------------------------------------
    drawBatOverlay(ctx, s, cam) {
      const b = s.b;
      if (!b) return;
      const g = this.game;
      // Tell bubble
      if (b.phase === 'runup' && b.spec) {
        const tleft = b.tRelease - g.clock;
        const tellMs = s.diff.tell.ms / 1000;
        if (tleft < tellMs && tleft > -0.05) this._tellBubble(ctx, s, cam, 1 - Math.max(0, tleft) / tellMs);
      }
      // Reticle + shot label (mouse aim)
      if (!g.input.touch && g.input.mouse.inside && b.phase !== 'done') {
        const mx = g.input.mouse.x, my = g.input.mouse.y;
        ctx.save();
        ctx.strokeStyle = b.ex ? 'rgba(242,193,78,0.35)' : 'rgba(242,193,78,0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(mx - 14, my); ctx.lineTo(mx - 5, my); ctx.moveTo(mx + 5, my); ctx.lineTo(mx + 14, my);
        ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my - 5); ctx.moveTo(mx, my + 5); ctx.lineTo(mx, my + 14); ctx.stroke();
        const label = this._shotLabel(s);
        ctx.font = '700 13px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = 'rgba(10,20,14,0.72)';
        ctx.fillRect(mx + 16, my + 10, w, 20);
        ctx.fillStyle = '#f6f1e3';
        ctx.fillText(label, mx + 22, my + 20);
        ctx.restore();
      } else if ((g.input.touch || s.keyAim) && b.phase !== 'done') {
        // show the aim label near the batter
        const p = cam.project(V.v(0, 2.1, 1.2));
        if (p) {
          ctx.save();
          ctx.font = '700 13px "Barlow Condensed", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(10,20,14,0.72)';
          const label = this._shotLabel(s);
          const w = ctx.measureText(label).width + 12;
          ctx.fillRect(p.x - w / 2, p.y - 24, w, 20);
          ctx.fillStyle = '#f6f1e3';
          ctx.fillText(label, p.x, p.y - 14);
          ctx.restore();
        }
      }
      // Foot status chip under the batter
      if (b.phase === 'flight' || b.phase === 'runup') {
        const p = cam.project(V.v(0.1 * s.h, 0, 0.6));
        if (p && b.foot) {
          ctx.save();
          ctx.font = '700 12px "Barlow", sans-serif';
          ctx.textAlign = 'center';
          const txt = b.foot === 'front' ? 'FRONT FOOT' : b.foot === 'back' ? 'BACK FOOT' : 'DANCING!';
          const w = ctx.measureText(txt).width + 14;
          ctx.fillStyle = 'rgba(242,193,78,0.9)';
          ctx.fillRect(p.x - w / 2, p.y + 8, w, 18);
          ctx.fillStyle = '#1b1606';
          ctx.fillText(txt, p.x, p.y + 21);
          ctx.restore();
        }
      }
      this._timingBar(ctx, s);
    },

    _shotLabel(s) {
      const b = s.b;
      const a = s.aimRel();
      const region = s.field.regionName(s.aimPhi);
      if (b && b.foot) {
        const fam = CLLM.BattingSession.family(b.foot, a, s.spin, 0.5);
        return `${fam.name.toUpperCase()} · ${region}`;
      }
      return region;
    },

    _tellBubble(ctx, s, cam, k) {
      const fig = s.bowler;
      if (!fig.J) return;
      const hand = cam.project(fig.J.rHand);
      if (!hand) return;
      const plan = { grip: null };
      const vr = Deliveries.VARIATIONS[s.type].find((v) => v.key === s.b.spec.varKey) || Deliveries.VARIATIONS[s.type][0];
      const grip = vr.grip;
      const R = 26;
      const x = hand.x + 40, y = hand.y - 46;
      const a = Math.min(1, k * 3);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(10,20,14,0.8)';
      ctx.strokeStyle = 'rgba(242,193,78,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, R + 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hand.x + 8, hand.y - 8); ctx.lineTo(x - R * 0.7, y + R * 0.7); ctx.stroke();
      drawGrip(ctx, x, y, R * 0.8, grip, vr, s);
      if (s.diff.tell.label) {
        ctx.font = '700 12px "Barlow", sans-serif';
        ctx.textAlign = 'center';
        const w = ctx.measureText(grip).width + 12;
        ctx.fillStyle = 'rgba(10,20,14,0.85)';
        ctx.fillRect(x - w / 2, y + R + 10, w, 18);
        ctx.fillStyle = '#f2c14e';
        ctx.fillText(grip, x, y + R + 23);
      }
      ctx.restore();
    },

    _timingBar(ctx, s) {
      const g = this.game;
      const W = g.cam.w, H = g.cam.h;
      const bw = g.input.touch ? Math.max(120, Math.min(360, W - 240)) : Math.min(360, W * 0.6), bh = 10;
      const coach = document.getElementById('coach');
      const coachH = coach && !coach.classList.contains('hidden') ? coach.offsetHeight + 18 : 0;
      const x0 = (W - bw) / 2, y0 = g.input.touch ? (H < 520 ? 58 : H - 188) : H - Math.max(56, coachH + 34);
      const r = s.b && s.b.res && s.b.res.Pw ? s.b.res : null;
      const D = s.diff.win;
      const P = r ? r.Pw : D.P, G = r ? r.Gw : D.G, E = r ? r.Ew : D.E;
      const range = 200;
      const X = (ms) => x0 + bw / 2 + (M.clamp(ms, -range, range) / range) * (bw / 2);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(10,20,14,0.6)';
      ctx.fillRect(x0 - 6, y0 - 16, bw + 12, bh + 28);
      ctx.fillStyle = 'rgba(226,71,75,0.55)'; ctx.fillRect(X(-E), y0, X(E) - X(-E), bh);
      ctx.fillStyle = 'rgba(242,193,78,0.75)'; ctx.fillRect(X(-G), y0, X(G) - X(-G), bh);
      ctx.fillStyle = 'rgba(95,210,138,0.95)'; ctx.fillRect(X(-P), y0, X(P) - X(-P), bh);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(X(0) - 0.5, y0 - 3, 1, bh + 6);
      // history ticks
      const log = s.timingLog;
      log.forEach((e, i) => {
        const last = i === log.length - 1 && s.b && s.b.res && s.b.res.e != null;
        ctx.fillStyle = last ? '#ffffff' : `rgba(255,255,255,${0.2 + 0.4 * (i / log.length)})`;
        ctx.fillRect(X(e) - (last ? 1.5 : 1), y0 - (last ? 6 : 3), last ? 3 : 2, bh + (last ? 12 : 6));
      });
      ctx.font = '600 11px "Barlow", sans-serif';
      ctx.fillStyle = 'rgba(246,241,227,0.75)';
      ctx.textAlign = 'left'; ctx.fillText('EARLY', x0, y0 - 7);
      ctx.textAlign = 'right'; ctx.fillText('LATE', x0 + bw, y0 - 7);
      if (log.length >= 5) {
        const avg = log.slice(-8).reduce((a, b) => a + b, 0) / Math.min(8, log.length);
        ctx.textAlign = 'center';
        const txt = Math.abs(avg) < 12 ? 'timing: on average spot on' : `timing: ${Math.round(Math.abs(avg))} ms ${avg < 0 ? 'early' : 'late'} on average`;
        ctx.fillText(txt, x0 + bw / 2, y0 - 7);
      }
      ctx.restore();
    },
  };

  // Stylised grip read: a ball, its seam, and a hint of the hand.
  function drawGrip(ctx, x, y, r, grip, vr, s) {
    const skin = '#c98f67', back = '#8a5a3c';
    // world movement direction of this variation -> screen tilt
    const mv = (vr.swingB || 0) * 2 + (vr.turn || 0) * 0.3 + (vr.seam && vr.seam !== 'rand' ? vr.seam * 0.2 : 0);
    const tilt = M.clamp(mv * 1.2, -0.6, 0.6);
    // hand behind the ball
    if (grip === 'back of hand') {
      ctx.fillStyle = back;
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.2, r * 1.05, r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * r * 0.3, y - r * 0.4); ctx.lineTo(x + i * r * 0.35, y + r * 0.6); ctx.stroke(); }
    } else if (grip === 'palm to batter' || grip === 'side of hand') {
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.35, r * 0.9, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
    // the ball
    const br = grip === 'back of hand' ? r * 0.55 : r * 0.72;
    const by = grip === 'back of hand' ? y - r * 0.55 : y - r * 0.05;
    ctx.fillStyle = '#b3202a';
    ctx.beginPath(); ctx.arc(x, by, br, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(x - br * 0.3, by - br * 0.3, br * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f6ecd6'; ctx.lineWidth = Math.max(1.5, br * 0.14);
    ctx.save();
    ctx.translate(x, by);
    if (grip === 'fingers across seam') ctx.rotate(Math.PI / 2 - 0.2);
    else ctx.rotate(tilt);
    ctx.beginPath(); ctx.moveTo(0, -br); ctx.lineTo(0, br); ctx.stroke();
    ctx.setLineDash([2, 2]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-3, -br * 0.9); ctx.lineTo(-3, br * 0.9); ctx.moveTo(3, -br * 0.9); ctx.lineTo(3, br * 0.9); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // fingers / knuckles
    ctx.fillStyle = skin;
    if (grip === 'knuckles' || grip === 'knuckles forward') {
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(x + i * br * 0.45, by - br * 0.95, br * 0.2, 0, Math.PI * 2); ctx.fill(); }
    } else if (grip === 'squeezed from under') {
      ctx.beginPath(); ctx.ellipse(x, by + br * 1.05, br * 0.7, br * 0.25, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, by + br * 1.6); ctx.lineTo(x, by + br * 1.2); ctx.stroke();
    } else if (grip !== 'back of hand') {
      ctx.save(); ctx.translate(x, by); ctx.rotate(grip === 'fingers across seam' ? Math.PI / 2 - 0.2 : tilt);
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.ellipse(-br * 0.28, -br * 0.55, br * 0.14, br * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(br * 0.28, -br * 0.55, br * 0.14, br * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (grip === 'seam forward') {
      ctx.strokeStyle = '#f2c14e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, by + br * 1.5); ctx.lineTo(x, by + br * 1.15); ctx.moveTo(x - 4, by + br * 1.3); ctx.lineTo(x, by + br * 1.15); ctx.lineTo(x + 4, by + br * 1.3); ctx.stroke();
    }
  }

  UI.drawGrip = drawGrip;
  CLLM.UI = UI;
})();
