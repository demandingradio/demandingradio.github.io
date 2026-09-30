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
      if (mode === 'bat' && this.game.session && this.game.session.physical) {
        el.innerHTML = 'the mouse <b>is the bat</b> · hold still to block<br><b>swipe through</b> the ball to hit · direction steers<br>hold <kbd>Space</kbd> (or right-click) = <b>cross bat</b><br>hold <kbd>W</kbd> forward · <kbd>S</kbd> back · <kbd>Esc</kbd> pause';
      } else if (mode === 'bat') {
        el.innerHTML = '<kbd>W</kbd> front foot · <kbd>S</kbd> back foot' + (this.game.session && this.game.session.spin ? ' · <kbd>E</kbd> dance' : '') +
          '<br>aim with the mouse · <b>click</b> hit · <b>right-click</b> loft<br><kbd>Space</kbd> defend · no click = leave · <kbd>Esc</kbd> pause';
      } else if (mode === 'bowl') {
        el.innerHTML = 'mouse: aim the spot · <kbd>1</kbd>-<kbd>5</kbd> variation<br><kbd>Space</kbd>/click to run in, then tap on the beats<br><b>hold</b> on the green · <b>let go</b> on the line · <kbd>Esc</kbd> pause';
      } else el.innerHTML = '';
    },

    // A short coaching card before the first ball of a session
    tips(mode) {
      const c = $('coach');
      const touch = this.game.input.touch;
      if (mode === 'bat' && this.game.session && this.game.session.physical) {
        c.innerHTML = `<div><span class="tag">Coach</span>You're holding the bat. ${touch ? 'Your finger' : 'The mouse'} puts it where you want it — get it in the ball's path.</div>` +
          `<div class="chips"><span class="chip">hold still = block</span><span class="chip">swipe through = hit</span><span class="chip">swipe sideways = steer</span><span class="chip">swipe up = loft · down = along the ground</span><span class="chip">move it away = leave</span><span class="chip">${touch ? 'stance pad: drag in' : 'hold Space / right-click'} = cross bat (pull, cut, hook)</span><span class="chip">${touch ? 'stance pad: drag up / down' : 'hold W / S'} = feet: forward to full, back to short</span></div>`;
      } else if (mode === 'bat') {
        c.innerHTML = `<div><span class="tag">Coach</span>Watch the hand, then the ball. <b>Full</b>? ${touch ? 'FRONT' : '<kbd>W</kbd>'} and drive. <b>Short</b>? ${touch ? 'BACK' : '<kbd>S</kbd>'} and cut or pull.</div>` +
          `<div class="chips"><span class="chip">${touch ? 'drag to aim' : 'aim with the mouse'}</span><span class="chip">${touch ? 'HIT' : 'click'} as it arrives</span><span class="chip">${touch ? 'LOFT' : 'right-click'} to go aerial</span><span class="chip">${touch ? 'BLOCK' : 'Space'} to defend</span><span class="chip">do nothing = leave</span></div>`;
      } else {
        c.innerHTML = `<div><span class="tag">Coach</span>Put the marker where you want it to pitch, then ${touch ? 'tap BOWL' : 'press <kbd>Space</kbd>'} to run in.</div>` +
          `<div class="chips"><span class="chip">tap as each footprint hits the ring</span><span class="chip">HOLD on the green bar</span><span class="chip">LET GO on the white line</span><span class="chip">early = fuller · late = shorter</span></div>`;
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
      const best = this.game.save.best('bat', s.diff.key, s.bestKey || s.bowlerChoice, s.hand);
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
      if (r.phys) {
        this._physChips(r, chips);
      } else if (r.kind === 'leave') {
        chips.push({ t: 'Left it', c: r.out ? 'bad' : 'good' });
      } else if (r.e != null) {
        const ms = Math.round(r.e);
        const tl = Math.abs(ms) <= r.Pw ? 'PERFECT' : ms < 0 ? 'EARLY' : 'LATE';
        chips.push({ t: `${r.label} · ${tl} ${ms > 0 ? '+' : ''}${ms} ms`, c: r.cls === 3 ? 'good' : r.cls === 2 ? 'meh' : 'bad' });
      }
      const foot = r.foot;
      if (r.kind !== 'leave' && !r.phys) {
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

    // Physical bat feedback: where it hit the bat, how fast you swung, where it went
    _physChips(r, chips) {
      const p = r.physInfo || {};
      const cm = (m) => Math.round(Math.abs(m) * 100);
      const crossB = p.cross > 0.5;
      if (!r.contact) {
        if (r.kind === 'leave') chips.push({ t: 'Left it', c: r.out ? 'bad' : 'good' });
        else chips.push({ t: `Missed — ${p.miss || 'passed the bat'}`, c: 'bad' });
        if (p.speed != null && r.kind !== 'leave') chips.push({ t: `bat speed ${Math.round(p.speed)} m/s`, c: 'meh' });
        if (r.kind !== 'leave') this._footChip(p, chips);
        if (crossB && p.B && p.B.y < 0.5 && r.kind !== 'leave') chips.push({ t: 'Cross bat at a full one: only the bat\u2019s width to hit with', c: 'bad' });
        return;
      }
      this._footChip(p, chips);
      let where;
      const hi = crossB ? 'toward the handle' : 'above the middle', lo = crossB ? 'toward the toe' : 'below the middle';
      if (r.label === 'GLOVED') where = 'off your gloves';
      else if (p.edge) where = `off the ${p.edgeName || 'edge'}`;
      else if (r.label === 'MIDDLED' || Math.abs(p.along) < 0.05) where = 'sweet spot';
      else if (p.along > 0) where = `${crossB ? 'Toward the toe' : 'Toe end'} — ${cm(p.along)} cm ${lo}`;
      else where = `${crossB ? 'Toward the handle' : 'High on the bat'} — ${cm(p.along)} cm ${hi}`;
      chips.push({ t: `${crossB ? 'Cross bat · ' : ''}${r.label} · ${where}`, c: r.label === 'MIDDLED' ? 'good' : /EDGED|MISTIMED|MISHIT|GLOVED/.test(r.label) ? 'bad' : 'meh' });
      if (p.noRoom) chips.push({ t: 'No room to pull: it was at your body', c: 'bad' });
      if (p.noWidth) chips.push({ t: 'No width to cut: too close to you', c: 'bad' });
      if (p.reachU > 0.2) chips.push({ t: 'Hung the bat out, away from your body', c: 'bad' });
      const sp = Math.round(p.speed || 0);
      const capTxt = p.capped ? ` · capped at ${Math.round((p.cap / CLLM.PhysBat.PHYS.MAX_BAT) * 100)}% (feet)` : '';
      chips.push({ t: sp < 3 ? 'still bat (block)' : `bat speed ${sp} m/s${capTxt}`, c: p.capped ? 'bad' : sp >= 18 ? 'good' : sp >= 8 ? 'meh' : '' });
      if (sp >= 3 && p.tErr != null) {
        const ms = Math.round(Math.abs(p.tErr)), deg = Math.round(Math.abs(p.tRot || 0));
        const early = p.tErr < 0;
        let t;
        if (ms < 8) t = 'timing: bang on';
        else if (p.tAxis === 'line') t = `${ms} ms ${early ? 'early' : 'late'} — ${early ? 'dragged it round' : 'pushed it the other way'}${deg >= 3 ? ` ${deg}°` : ''}`;
        else t = `${ms} ms ${early ? 'early' : 'late'} — face ${early ? 'opened' : 'closed'}${deg >= 3 ? ` ${deg}°` : ''} (${early ? 'lifts it' : 'keeps it down'})`;
        chips.push({ t, c: ms < 8 ? 'good' : ms < 22 ? 'meh' : 'bad' });
      }
      if (p.exit != null) chips.push({ t: `off the bat ${Math.round(p.exit * 3.6)} km/h · ${Math.round(p.launch)}° ${p.launch > 8 ? 'in the air' : p.launch < -3 ? 'into the ground' : 'flat'}`, c: '' });
      const yaw = Math.round((p.yaw || 0) / (Math.PI / 180));
      // yaw > 0 = swiped right on screen = toward -x = a right-hander's off side
      if (Math.abs(yaw) >= 8) chips.push({ t: `face turned ${Math.abs(yaw)}° ${yaw * (this.game.session.h) > 0 ? 'to the off side' : 'to the leg side'}`, c: '' });
    },

    // Footwork verdict in coaching language: which foot, for which length,
    // and what it cost you.
    _footChip(p, chips) {
      const ff = p.ff;
      if (!ff) return;
      const s = this.game.session, len = (s.b.plan && s.b.plan.lengthName) || 'that';
      const good = ff.fit >= 0.9;
      let t;
      if (ff.danced) t = good ? 'Down the track to the pitch ✓' : 'Down the track — beaten in the flight ✗';
      else {
        const fwd = ff.feet > 0.4, back = ff.feet < -0.4, row = ff.row;
        const fullish = row.front > row.back + 0.2, shortish = row.back > row.front + 0.2;
        if (good && fwd) t = ff.spin ? 'Got to the pitch ✓' : `Got forward to a ${len} ball ✓`;
        else if (good && back) t = `Went back to a ${len} ball ✓`;
        else if (good) t = `Feet fine for a ${len} ball ✓`;
        else if (back && fullish) t = `Played back to a ${len} ball ✗ (trapped)`;
        else if (fwd && shortish) t = `Front foot to a ${len} ball ✗ — cramped`;
        else if (ff.spin && ff.feet > 0.15 && ff.feet <= 0.75) t = 'Half-forward to the spinner ✗';
        else if (!fwd && !back) t = `Caught on the crease ✗ — ${ff.bestFoot > 0 ? 'get forward' : ff.bestFoot < 0 ? 'go back' : 'commit'} to that length`;
        else t = `${fwd ? 'Front' : 'Back'} foot to a ${len} ball ~`;
      }
      if (ff.notes && ff.notes.length) t += ` · ${ff.notes[0]}`;
      if (ff.late) t += ' · late feet';
      chips.push({ t, c: good ? 'good' : ff.fit >= 0.7 ? 'meh' : 'bad' });
    },

    // Readable value for the bat tuning settings
    tuneText(key, v, short) {
      if (key === 'batLimit') return short ? (v ? `${v} m/s` : 'off') : `Bat speed limit: ${v ? v + ' m/s' : 'off'}`;
      const W = CLLM.CFG.PHYS.WEIGHT_STEPS, i = Math.max(0, W.indexOf(v));
      const name = ['off', 'light', 'medium', 'heavy', 'heavier', 'heaviest'][i] || 'heavy';
      if (key === 'batWeight') return short ? name : `Bat weight: ${name}`;
      return String(v);
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
      const showAim = !s.physical && s.aimPhi != null && s.b && s.b.phase !== 'done' && this.game.mode === 'bat';
      s.field.draw(this.fieldCtx, 190, 190, { aimPhi: showAim ? (s.b.ex ? s.b.ex.phi : s.aimPhi) : null, shot: s.b && s.b.phase === 'runup' ? null : proj, shotT });
    },

    // ---- canvas overlays -------------------------------------------------------
    drawBatOverlay(ctx, s, cam) {
      const b = s.b;
      if (!b) return;
      const g = this.game;
      if (s.physical) return this._drawPhysOverlay(ctx, s, cam);
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

    _drawPhysOverlay(ctx, s, cam) {
      const b = s.b, g = this.game;
      if (b.phase === 'runup' && b.spec) {
        const tleft = b.tRelease - g.clock;
        const tellMs = s.diff.tell.ms / 1000;
        if (tleft < tellMs && tleft > -0.05) this._tellBubble(ctx, s, cam, 1 - Math.max(0, tleft) / tellMs);
      }
      // swing-speed meter: a vertical bar on the right edge
      const W = cam.w, H = cam.h;
      let bh = Math.min(260, H * 0.34, W * 0.5), y0 = H * 0.52 - bh / 2;
      const bw = 12, x0 = W - 34;
      const hint = document.getElementById('controlsHint');
      const hr = hint ? hint.getBoundingClientRect() : null;
      if (hr && hr.height > 0 && y0 - 26 < hr.bottom + 6) {      // hint showing: sit under it
        y0 = hr.bottom + 32;
        bh = Math.max(90, Math.min(bh, H - 110 - y0));
      }
      const max = CLLM.PhysBat.PHYS.MAX_BAT;
      const sp = s.phys.speedNow;
      const Y = (v) => y0 + bh - M.clamp(v / max, 0, 1) * bh;
      ctx.save();
      ctx.fillStyle = 'rgba(10,20,14,0.65)';
      ctx.fillRect(x0 - 26, y0 - 26, bw + 34, bh + 44);
      const zones = [[0, 3, 'rgba(158,197,255,0.45)', 'block'], [3, 10, 'rgba(242,193,78,0.35)', 'push'], [10, 20, 'rgba(242,193,78,0.6)', 'drive'], [20, max, 'rgba(95,210,138,0.7)', 'smash']];
      ctx.font = '600 9px "Barlow", sans-serif'; ctx.textAlign = 'right';
      for (const [a, z, col, name] of zones) {
        ctx.fillStyle = col; ctx.fillRect(x0, Y(z), bw, Y(a) - Y(z));
        ctx.fillStyle = 'rgba(246,241,227,0.75)'; ctx.fillText(name, x0 - 3, (Y(a) + Y(z)) / 2 + 3);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0 - 3, Y(sp) - 2, bw + 6, 4);
      if (s.phys.ghost && g.clock - s.phys.ghost.t < 2 && b.res && b.res.physInfo) {
        ctx.fillStyle = '#ff9d6b';
        ctx.fillRect(x0 - 5, Y(b.res.physInfo.speed || 0) - 1, bw + 10, 2);
      }
      // cramped: once it has pitched, the most your feet will let you swing
      const cap = b.physCap;
      if (cap != null && cap < max - 0.5) {
        ctx.fillStyle = 'rgba(10,20,14,0.55)'; ctx.fillRect(x0, y0, bw, Y(cap) - y0);
        ctx.fillStyle = '#ff6b6e'; ctx.fillRect(x0 - 6, Y(cap) - 1.5, bw + 12, 3);
      }
      ctx.textAlign = 'center'; ctx.font = '700 10px "Barlow", sans-serif'; ctx.fillStyle = 'rgba(246,241,227,0.8)';
      ctx.fillText(s.phys.pose && s.phys.pose.cross > 0.5 ? 'CROSS' : 'SWING', x0 + bw / 2, y0 - 12);
      ctx.fillText(`${Math.round(sp)}`, x0 + bw / 2, y0 + bh + 13);
      // tuning in effect (pause menu / hotkeys)
      const S = g.save.data.settings, tags = [];
      if (+S.batLimit) tags.push(`limit ${S.batLimit}`);
      if (+S.batWeight) tags.push(this.tuneText('batWeight', +S.batWeight, true));
      if (Math.abs((+S.batPower || 1) - 1) > 1e-6) tags.push(`power ×${(+S.batPower).toFixed(2)}`);
      if (tags.length) {
        ctx.font = '600 9px "Barlow", sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(242,193,78,0.85)';
        tags.forEach((tg, i) => ctx.fillText(tg, x0 + bw + 6, y0 + bh + 30 + i * 11));
      }
      ctx.restore();
      if (!g.input.touch) this._drawFeetMeter(ctx, s, cam, y0, bh);
      // first-ball hint
      if (W >= 700 && g.save.data.stats.batBalls < 4 && (b.phase === 'runup' || b.phase === 'flight')) {
        const txt = g.input.touch ? 'Your finger is the bat: get it in the ball\u2019s path, swipe through to hit' : 'Your mouse is the bat: get it in the ball\u2019s path, swipe through to hit';
        ctx.save();
        ctx.font = '700 15px "Barlow", sans-serif'; ctx.textAlign = 'center';
        const w = ctx.measureText(txt).width + 20;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W / 2 - w / 2, H * 0.14 - 16, w, 24);
        ctx.fillStyle = '#f6f1e3'; ctx.fillText(txt, W / 2, H * 0.14 + 1);
        ctx.restore();
      }
    },

    // Back <-> front footwork meter (left edge). Club/Grade light up the right
    // zone for this ball once it has pitched.
    _drawFeetMeter(ctx, s, cam, y0, bh) {
      const b = s.b, g = this.game, ph = s.phys, D = s.diff;
      const bw = 12, x0 = 22;
      const Y = (p) => y0 + bh * (1 - (p + 1) / 2);            // +1 (front) at the top
      ctx.save();
      ctx.fillStyle = 'rgba(10,20,14,0.65)';
      ctx.fillRect(x0 - 8, y0 - 26, bw + 44, bh + 44);
      ctx.fillStyle = 'rgba(246,241,227,0.18)'; ctx.fillRect(x0, y0, bw, bh);
      // Where your feet should be for this ball: from release on Club, once
      // it has pitched on Grade, never on State / Test (read it yourself)
      const inPlay = b.plan && b.phase === 'flight';
      const pitched = inPlay && s.simAt(g.clock) >= b.plan.T;
      const show = D.physRing === true ? inPlay : D.physRing === 'late' ? pitched : false;
      if (show && !b.danced) {
        const row = ph.footRow(b.plan, s.spin, ph.crossOn);
        for (let i = 0; i < 20; i++) {
          const p0 = -1 + i * 0.1, p1 = p0 + 0.1, f = ph.fitAt(row, (p0 + p1) / 2, s.spin);
          if (f < 0.72) continue;
          ctx.fillStyle = f >= 0.9 ? 'rgba(95,210,138,0.75)' : 'rgba(242,193,78,0.45)';
          ctx.fillRect(x0, Y(p1), bw, Y(p0) - Y(p1));
        }
      }
      ctx.fillStyle = 'rgba(246,241,227,0.5)'; ctx.fillRect(x0 - 2, Y(0) - 1, bw + 4, 2);
      ctx.fillStyle = b.physPending || b.danced ? '#ff9d6b' : '#ffffff';
      ctx.fillRect(x0 - 3, Y(b.danced ? 1 : ph.feet) - 2, bw + 6, 4);
      ctx.font = '700 10px "Barlow", sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(246,241,227,0.8)';
      ctx.fillText('FRONT', x0 - 4, y0 - 12);
      ctx.fillText('BACK', x0 - 2, y0 + bh + 13);
      ctx.font = '600 9px "Barlow", sans-serif'; ctx.fillStyle = 'rgba(246,241,227,0.6)';
      ctx.fillText(g.input.touch ? '' : 'W', x0 + bw + 6, y0 + 10);
      ctx.fillText(g.input.touch ? '' : 'S', x0 + bw + 6, y0 + bh - 2);
      ctx.restore();
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
