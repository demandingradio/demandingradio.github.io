/*
 * MATCH UI
 * ========
 * Everything a match adds on screen: the scoreboard, the running strip and
 * the partner's call while the ball is live, the throw cue, the margin chip
 * and the verdict card on a tight one, the RUN / BACK / DIVE touch buttons,
 * the live radar (the mini-map with the real fielders), and the panels
 * between balls: the toss, picking your bowler for each over (keys 1-5,
 * Enter, S), innings breaks, the follow-on, the result, and the scorecard.
 *
 * Reads the field only through FieldSim's public side: forecast(),
 * diveLegal(), userCanCall, runners, want, runsRun, thrown, throwEnd, result
 * (and the v0 _runOutChance while forecast() doesn't exist yet).
 */
(function () {
  const CLLM = window.CLLM;
  const { M, Match, UI, FieldSim } = CLLM;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const typeName = (t) => (t === 'pace' ? 'pace' : t === 'off' ? 'off spin' : t === 'leg' ? 'leg spin' : '');
  const nth = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : '4th');

  // ---- tuning (CFG.MATCH, read when used, with the spec's numbers as fallback) --------------------
  const MC = () => (CLLM.CFG && CLLM.CFG.MATCH) || {};
  const STRIP = () => Object.assign({ green: 0.6, red: 0.2, closeS: 0.12, closeCm: 25, flash: 0.6 }, MC().STRIP || {});
  const TELL = () => Object.assign({ club: 'contact', grade: 'chaser', state: 'throw', test: 'never' }, MC().TELL || {});
  const queueMax = () => (MC().RUN && MC().RUN.queueMax != null ? MC().RUN.queueMax : 1);
  const CREASE = (FieldSim && FieldSim.CREASE) || [1.22, 18.9];
  const END_Z = (FieldSim && FieldSim.END_Z) || [0, 20.12];
  const DIRZ = [-1, 1];
  const Z0 = -1.2, Z1 = 21.3;                                 // the strip: from behind one set of stumps to the other
  const FLAG_KEY = 'cricketllm.matchflag';
  const VERDICT_T = 1.2;                                      // s (real time) the verdict card stays up
  const TINT = { green: 'rgba(95,210,138,0.6)', amber: 'rgba(242,193,78,0.65)', red: 'rgba(226,71,75,0.75)' };
  // real seconds (hit-stop and slow-mo don't stretch a flash; a pause freezes it)
  const rt = () => (UI.game && UI.game.realTime) || 0;

  // ---- the live ball, read-only helpers ---------------------------------------------------------
  const isRunning = (fs) => !!(fs && fs.runners && fs.runners.some((r) => r.goal != null));
  // Can YOU call this ball? Only when your side is batting, and not on a
  // padded ball nobody may run for (control 'none'), and not once it's dead
  function canCall(s) {
    const fs = s && s.fs;
    if (!fs || fs.result || fs.control === 'none') return false;
    if (s.game && s.game.mode && s.game.mode !== 'bat') return false;
    return 'userCanCall' in fs ? !!fs.userCanCall : !!fs.userCalls;
  }

  // Has this level's tell stage been reached? (Club from contact, Grade once a
  // chaser's committed, State once it's thrown, Test never: your eyes and the shouts)
  function tellReached(lvl, basis, tLive) {
    const stage = TELL()[lvl] || 'chaser';
    if (stage === 'contact') return true;
    if (stage === 'chaser') return basis !== 'plan' || tLive >= 0.6;
    if (stage === 'throw') return basis === 'thrown';
    return false;
  }

  // The colour of each end of the strip: [{end, margin, col}] (margin = seconds to
  // spare, + = safe). Ends with a runner heading there; both ends (if we go now)
  // when nobody's running. Empty when there's nothing to show.
  function endTints(s) {
    const fs = s && s.fs;
    if (!fs || fs.result || !fs.runners) return [];
    const lvl = s.game && s.game.match ? s.game.match.levelKey : 'grade';
    const running = isRunning(fs);
    let ends = [];
    if (typeof fs.forecast === 'function') {
      const f = fs.forecast();
      if (!f || !f.ends || !tellReached(lvl, f.basis, fs.tLive || 0)) return [];
      ends = f.ends.filter(Boolean).map((E) => ({ end: E.end, margin: E.margin }));
    } else {
      // before forecast() lands: the v0 run-out chance from the man with the ball
      const basis = fs.thrown ? 'thrown' : fs.holder ? 'held' : 'plan';
      if (!tellReached(lvl, basis, fs.tLive || 0)) return [];
      const holder = fs.holder || fs.throwFromF;
      if (!holder || typeof fs._runOutChance !== 'function') return [];
      ends = fs._runOutChance(holder.pos)
        .filter((c) => !(fs.thrown && c.end !== fs.throwEnd))
        .map((c) => ({ end: c.end, margin: -c.margin }));          // v0 is fielder-positive
    }
    if (running) ends = ends.filter((E) => fs.runners.some((r) => r.goal === E.end && r.st !== 'out'));
    const S = STRIP();
    return ends.filter((E) => typeof E.margin === 'number' && !Number.isNaN(E.margin))
      .map((E) => ({ end: E.end, margin: E.margin, col: E.margin > S.green ? 'green' : E.margin >= S.red ? 'amber' : 'red' }));
  }

  // "RUN 2 · 1 done" / "BACK · 1 done" / "0 runs"
  function stripLabel(fs) {
    const res = fs.result, done = fs.runsRun || 0;
    if (res) {
      if (res.out) return 'OUT';
      const n = res.runs || 0;
      return `${n} run${n === 1 ? '' : 's'}`;
    }
    if (isRunning(fs)) return (fs.want || 0) > done ? `RUN ${fs.want} · ${done} done` : `BACK · ${done} done`;
    return `${done} run${done === 1 ? '' : 's'}`;
  }

  // Strip geometry (CSS px): desktop min(520, W/2) wide, bottom-centre at H - 64;
  // touch the full width less 16 px a side, above the RUN / BACK buttons.
  // The pitch band leaves a margin at each end for the ball racing in.
  function stripGeom(W, H, touch) {
    const sw = touch ? Math.max(160, W - 32) : Math.min(520, 0.5 * W);
    const sh = 44, bottom = H - (touch ? 150 : 64);
    const x0 = (W - sw) / 2, y0 = bottom - sh;
    const pad = touch ? 60 : Math.min(48, sw * 0.1);
    const bx0 = x0 + pad, bx1 = x0 + sw - pad;
    const zx = (z) => bx0 + ((z - Z0) / (Z1 - Z0)) * (bx1 - bx0);
    return { x0, y0, sw, sh, pad, bx0, bx1, by: y0 + 21, bh: 14, labelY: y0 + 15, zx };
  }
  const endSpan = (e) => (e === 0 ? [Z0, CREASE[0]] : [CREASE[1], Z1]);

  // ---- close calls ------------------------------------------------------------------------------
  // closest = {end, s, cm, runner, out}: s = seconds he beat it by (- = didn't),
  // cm = how far past the line when the stumps went (- = short). Accepts a
  // FieldSim result too (before result.closest existed: its run-out margin).
  function closestOf(x) {
    if (!x) return null;
    if ('closest' in x) return x.closest || null;
    if ('runs' in x || 'why' in x) {
      const mg = x.margin;
      return mg && mg.cm != null ? { end: mg.end, s: null, cm: mg.cm, runner: mg.runner, out: !!(x.out && x.out.how === 'run out') } : null;
    }
    return x;
  }
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  // The post-ball chip: when it was within a second, or the stumps were broken
  function marginInfo(x) {
    const c = closestOf(x);
    if (!c) return null;
    const hasCm = fin(c.cm), hasS = fin(c.s);
    if (!hasCm && !(hasS && Math.abs(c.s) < 1)) return null;
    const out = !!c.out;
    let text;
    if (out) text = hasCm ? `Short by ${Math.abs(Math.round(c.cm))} cm` : `Short by ${Math.abs(c.s).toFixed(2)} s`;
    else text = hasS ? `Made it by ${Math.abs(c.s).toFixed(2)} s` : `In by ${Math.abs(Math.round(c.cm))} cm`;
    return { text, out };
  }
  // The verdict card: only the tight ones (|s| < 0.12 s or |cm| < 25)
  function verdictInfo(x) {
    const c = closestOf(x);
    if (!c) return null;
    const S = STRIP();
    const hasCm = fin(c.cm), hasS = fin(c.s);
    if (!((hasS && Math.abs(c.s) < S.closeS) || (hasCm && Math.abs(c.cm) < S.closeCm))) return null;
    const out = !!c.out;
    const big = out ? 'OUT' : hasCm ? 'NOT OUT' : 'SAFE';
    const detail = out ? (hasCm ? `short by ${Math.abs(Math.round(c.cm))} cm` : `short by ${Math.abs(c.s).toFixed(2)} s`)
      : hasCm ? `in by ${Math.abs(Math.round(c.cm))} cm` : `made it by ${Math.abs(c.s).toFixed(2)} s`;
    const who = c.runner === 'A' ? 'Striker' : c.runner === 'B' ? 'Non-striker' : '';
    const where = c.end === 0 ? "keeper's end" : c.end === 1 ? "bowler's end" : '';
    return { big, detail, text: `${big} — ${detail}`, sub: [who, where].filter(Boolean).join(' · '), out };
  }

  // ---- panels (and the keys an open panel owns) -------------------------------------------------
  // One capture listener on window for every panel: it runs before Input's
  // (window, bubbling), so a key a panel uses never reaches the session. Its
  // keyup is swallowed too (Space / Enter up is the bowler's "let go").
  let panelKeys = null;                     // (key, repeat) -> true if the panel used it
  let panelAt = 0;                          // when the panel opened (ms): a key already on its way doesn't count
  const swallowed = new Set();
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function panel(html, cls) {
    const p = $('matchPanel');
    p.querySelector('.card').className = 'card setup ' + (cls || '');
    p.querySelector('.card').innerHTML = html;
    p.classList.remove('hidden');
    document.body.classList.add('in-menu');
    panelKeys = null; panelAt = nowMs();
    return p;
  }
  function closePanel() { panelKeys = null; $('matchPanel').classList.add('hidden'); document.body.classList.remove('in-menu'); }
  const armed = () => nowMs() - panelAt > 350;

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', (e) => {
      if (!panelKeys) return;
      const mp = $('matchPanel'), pz = $('pause');
      if (!mp || mp.classList.contains('hidden')) return;
      if (pz && !pz.classList.contains('hidden')) return;        // paused on top of the panel
      const k = (e.key || '').toLowerCase() === 'spacebar' ? ' ' : (e.key || '').toLowerCase();
      if (!panelKeys(k, !!e.repeat)) return;
      e.preventDefault(); e.stopPropagation();
      swallowed.add(k);
    }, true);
    window.addEventListener('keyup', (e) => {
      const k = (e.key || '').toLowerCase() === 'spacebar' ? ' ' : (e.key || '').toLowerCase();
      if (!swallowed.has(k)) return;
      swallowed.delete(k);
      e.preventDefault(); e.stopPropagation();
    }, true);
    // any key or tap puts the verdict card away (after a moment: not the press that was already on its way)
    const dismiss = (e) => { const v = UI._verdict; if (v && !(e && e.repeat) && rt() - v.t0 > 0.25) UI._verdict = null; };
    window.addEventListener('keydown', dismiss);
    window.addEventListener('pointerdown', dismiss);
  }

  // The margin chip goes into whichever result card is up: the batting and
  // bowling cards rewrite #coach, before or after the chip arrives
  function injectChip() {
    const ch = UI._mChip, coach = $('coach');
    if (!ch || !coach || rt() - ch.at > 2.5) return;
    if (coach.querySelector && coach.querySelector('.chip.margin')) return;
    let chips = coach.querySelector ? coach.querySelector('.chips') : null;
    if (!chips) { chips = document.createElement('div'); chips.className = 'chips'; coach.appendChild(chips); }
    const sp = document.createElement('span');
    sp.className = 'chip margin ' + (ch.out ? 'bad' : 'good');
    sp.textContent = ch.text;
    if (chips.firstChild) chips.insertBefore(sp, chips.firstChild); else chips.appendChild(sp);
    coach.classList.remove('hidden');
  }
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.getElementById) {
    const c = $('coach');
    if (c) new MutationObserver(() => { if (UI._mChip) injectChip(); }).observe(c, { childList: true });
  }

  Object.assign(UI, {
    // ---- scoreboard ------------------------------------------------------------------------------
    matchScore(m, ev) {
      if (!m || !m.inn) return;
      const inn = m.inn, BT = m.teams[inn.bat], FT = m.teams[inn.bowl];
      const F = m.F;
      $('sbTitle').innerHTML = `<span>${esc(BT.name)} · ${nth(inn.n)} innings${inn.followOn ? ' (f/o)' : ''}</span><span>${esc(F.name)}</span>`;
      $('sbRuns').textContent = `${inn.runs}/${inn.wkts}${inn.declared ? 'd' : ''}`;
      $('sbBalls').textContent = `(${Match.overs(inn.balls)} ov)`;             // a Test: no cap
      const s = inn.batters[inn.striker], n = inn.batters[inn.nonStriker];
      const bat = (c, star) => c ? `${esc(BT.players[c.i].name)}${star ? '*' : ''} <b>${c.runs}</b> (${c.balls})` : '';
      const bw = inn.bowler != null ? FT.players[inn.bowler] : null;
      const bc = inn.bowler != null ? inn.bowlers[inn.bowler] : null;
      const bowl = bw ? `${esc(bw.name)} <b>${bc ? bc.wkts : 0}-${bc ? bc.runs : 0}</b> (${bc ? Match.overs(bc.balls) : '0'})` : '';
      let day = '';
      if (!m.result && typeof m.day === 'function' && F.budget) {
        const d = m.day();
        if (d) day = `Day ${d.day} · S${d.session} · ${d.left} ov left today`;
      }
      $('sbMeta').innerHTML = `<span>${bat(s, true)}</span><span>${bat(n, false)}</span>` + (bowl ? `<span>${bowl}</span>` : '') +
        `<span class="sit">${esc(m.situation())}</span>` + (day ? `<span class="day">${esc(day)}</span>` : '');
      const rec = $('recent');
      rec.innerHTML = '';
      const over = inn.thisOver.length ? inn.thisOver : (inn.overs[inn.overs.length - 1] || []);
      for (const r of over) {
        const sp = document.createElement('span');
        sp.textContent = r;
        sp.className = r === 'W' ? 'rW' : r === '4' ? 'r4' : r === '6' ? 'r6' : r !== '·' ? 'rN' : '';
        rec.appendChild(sp);
      }
      $('fieldLabel').textContent = 'the field';
      this.drawField();
    },

    // ---- the live ball ---------------------------------------------------------------------------
    // RUN / BACK / DIVE (touch). Shown iff the ball's live, it's yours to call
    // and it isn't dead yet; body.running hands the stance pad's slot to BACK.
    // Called every frame while live, so the DOM is only touched on a change.
    runHud(s, on) {
      const fs = s && s.fs;
      const show = !!(on && fs && canCall(s));
      let label = 'RUN', capped = false, dive = false;
      if (show) {
        const done = fs.runsRun || 0, want = fs.want || 0;
        const next = isRunning(fs) ? want + 1 : done + 1;
        if (isRunning(fs) && want >= done + 1 + queueMax()) { label = `RUN ${want}`; capped = true; }
        else label = next <= 1 ? 'RUN' : `RUN ${next}`;
        dive = typeof fs.diveLegal === 'function' && !!fs.diveLegal();
      }
      const key = show ? `1|${label}|${capped ? 1 : 0}|${dive ? 1 : 0}` : '0';
      if (key !== this._hudKey) {
        this._hudKey = key;
        for (const id of ['runBtns', 'runBack']) { const t = $(id); if (t) t.classList.toggle('hidden', !show); }
        const r = document.querySelector('#runBtns [data-act="runyes"]');
        if (r) { r.textContent = label; r.classList.toggle('capped', capped); }
        const d = document.querySelector('#runBtns [data-act="dive"]');
        if (d) d.classList.toggle('hidden', !dive);
        document.body.classList.toggle('running', show);
      }
      this.runLive = on ? s : null;
    },

    // A fielder lets a hard throw go: "Keeper!" / "Bowler's end!", and that end
    // of the strip flashes (a ball marker races toward it while it's in the air)
    throwCue(end, text) {
      this._cue = { end: end ? 1 : 0, text: text || (end ? "Bowler's end!" : 'Keeper!'), t0: rt() };
    },

    // After the ball: "Made it by 0.21 s" / "Short by 30 cm" in the result card.
    // Returns the text ('' when it wasn't close enough to mention).
    marginChip(closest) {
      const t = marginInfo(closest);
      this._mChip = t ? { text: t.text, out: t.out, at: rt() } : null;
      if (t) injectChip();
      return t ? t.text : '';
    },

    // A tight one: "NOT OUT — in by 22 cm" / "OUT — short by 9 cm", centred for
    // 1.2 s (any key or tap puts it away). Returns whether it's showing.
    verdictCard(res) {
      const v = verdictInfo(res);
      if (!v) return false;
      this._verdict = Object.assign(v, { t0: rt() });
      return true;
    },

    // Canvas overlay for a match (drawn after the batting / bowling overlays)
    drawMatchOverlay(ctx, s, cam) {
      const W = cam.w, H = cam.h;
      if (s && s.live && s.fs) this._drawStrip(ctx, s, W, H);
      this._drawVerdict(ctx, W, H);
    },

    _drawStrip(ctx, s, W, H) {
      const fs = s.fs, g = s.game || this.game, touch = !!(g && g.input && g.input.touch);
      const G = stripGeom(W, H, touch), zx = G.zx, S = STRIP();
      const can = canCall(s);
      const now = rt(), cue = this._cue && now - this._cue.t0 < 1.1 ? this._cue : null;
      const midY = G.by + G.bh / 2;
      ctx.save();
      ctx.fillStyle = 'rgba(10,20,14,0.74)';
      rrect(ctx, G.x0, G.y0, G.sw, G.sh, 10); ctx.fill();
      // the pitch, and how the run looks at each end
      ctx.fillStyle = '#cdbb86';
      ctx.fillRect(G.bx0, G.by, G.bx1 - G.bx0, G.bh);
      if (can) {
        for (const t of endTints(s)) {
          const [a, b] = endSpan(t.end);
          ctx.fillStyle = TINT[t.col];
          ctx.fillRect(zx(a), G.by, zx(b) - zx(a), G.bh);
        }
      }
      if (cue && now - cue.t0 < S.flash) {
        const [a, b] = endSpan(cue.end);
        ctx.fillStyle = Math.floor((now - cue.t0) / 0.1) % 2 === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(226,71,75,0.95)';
        ctx.fillRect(zx(a), G.by - 2, zx(b) - zx(a), G.bh + 4);
      }
      ctx.fillStyle = '#fff';
      for (const z of CREASE) ctx.fillRect(zx(z) - 1, G.by - 3, 2, G.bh + 6);
      ctx.fillStyle = '#2b2015';
      for (const z of END_Z) ctx.fillRect(zx(z) - 1.5, G.by + 2, 3, G.bh - 4);
      // the ball on its way in (from the outer edge to the stumps as it arrives)
      if (fs.thrown && fs.ball && fs.throwEnd != null) {
        const e = fs.throwEnd, b = fs.ball.pos;
        const k = M.clamp(Math.hypot(b.x, b.z - END_Z[e]) / 40, 0, 1);
        const outer = e === 0 ? G.x0 + 7 : G.x0 + G.sw - 7;
        const x = M.lerp(zx(END_Z[e]), outer, k);
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, midY); ctx.lineTo(x + (e === 0 ? -1 : 1) * 12, midY); ctx.stroke();
        ctx.fillStyle = '#d0262f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, midY, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      // the batters, each with a chevron the way he's going
      for (const r of fs.runners) {
        const x = zx(r.z);
        ctx.fillStyle = r.st === 'out' ? '#ff6b6e' : r.key === 'A' ? '#f2c14e' : '#f6f1e3';
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, midY, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        if (r.goal != null && r.st !== 'out') {
          const d = DIRZ[r.goal], cx = x + d * 10;
          ctx.beginPath(); ctx.moveTo(cx - d * 3, midY - 5); ctx.lineTo(cx + d * 3, midY); ctx.lineTo(cx - d * 3, midY + 5); ctx.closePath(); ctx.fill();
        }
      }
      // label, and the keys (desktop, while it's yours to call)
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.font = '800 15px "Barlow Condensed", sans-serif';
      ctx.fillStyle = '#f6f1e3';
      ctx.fillText(stripLabel(fs), G.x0 + 10, G.labelY);
      if (can && !touch) {
        ctx.textAlign = 'right';
        ctx.font = '600 12px "Barlow", sans-serif';
        ctx.fillStyle = 'rgba(246,241,227,0.6)';
        ctx.fillText('W run · S back · Space dive', G.x0 + G.sw - 10, G.labelY);
      }
      // "Keeper!" over the end it's going to
      if (cue) {
        ctx.font = '800 16px "Barlow Condensed", sans-serif';
        const w = ctx.measureText(cue.text).width + 16;
        const cx = M.clamp(zx(END_Z[cue.end]), G.x0 + w / 2, G.x0 + G.sw - w / 2);
        ctx.fillStyle = 'rgba(208,38,47,0.92)';
        rrect(ctx, cx - w / 2, G.y0 - 26, w, 22, 11); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.fillText(cue.text, cx, G.y0 - 10);
      }
      // your partner's shout
      const call = can && s.partnerCall ? s.partnerCall() : null;
      if (call) {
        ctx.textAlign = 'center';
        ctx.font = '800 30px "Barlow Condensed", sans-serif';
        ctx.fillStyle = call === 'YES' || call === 'TWO' ? '#5fd28a' : call === 'WAIT' ? '#f2c14e' : '#ff6b6e';
        ctx.fillText(call === 'TWO' ? 'THERE’S TWO!' : call + '!', W / 2, G.y0 - 32);
        ctx.font = '600 12px "Barlow", sans-serif';
        ctx.fillStyle = 'rgba(246,241,227,0.75)';
        ctx.fillText('your partner', W / 2, G.y0 - 62);
      }
      ctx.restore();
    },

    _drawVerdict(ctx, W, H) {
      const v = this._verdict;
      if (!v) return;
      const age = rt() - v.t0;
      if (age < 0 || age > VERDICT_T) { this._verdict = null; return; }
      const a = age > VERDICT_T - 0.2 ? (VERDICT_T - age) / 0.2 : Math.min(1, age / 0.08);
      const w = Math.min(W - 32, 420), h = 104, x = (W - w) / 2, y = Math.max(12, H * 0.34 - h / 2);
      const col = v.out ? '#ff6b6e' : '#5fd28a';
      ctx.save();
      ctx.globalAlpha = M.clamp(a, 0, 1);
      ctx.fillStyle = 'rgba(8,16,11,0.92)';
      rrect(ctx, x, y, w, h, 14); ctx.fill();
      ctx.fillStyle = col;
      ctx.fillRect(x + 14, y, w - 28, 4);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = '800 40px "Barlow Condensed", sans-serif';
      ctx.fillText(v.big, W / 2, y + 46);
      ctx.fillStyle = '#f6f1e3';
      ctx.font = '700 19px "Barlow", sans-serif';
      ctx.fillText(v.detail, W / 2, y + 72);
      if (v.sub) {
        ctx.fillStyle = 'rgba(246,241,227,0.6)';
        ctx.font = '600 12px "Barlow", sans-serif';
        ctx.fillText(v.sub, W / 2, y + 92);
      }
      ctx.restore();
    },

    // The mini-map, live: the real fielders, the ball, both batters
    _drawRadar(s) {
      const ctx = this.fieldCtx, W = 190, H = 190;
      const B = { cx: 0, cz: 10, rx: 62, rz: 68 };
      const scale = (Math.min(W, H) / 2 - 6) / Math.max(B.rx, B.rz);
      const cx = W / 2, cy = H / 2;
      const X = (x) => cx + (x - B.cx) * scale;
      const Y = (z) => cy + (z - B.cz) * scale;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#2f6a35';
      ctx.beginPath(); ctx.ellipse(cx, cy, B.rx * scale, B.rz * scale, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, B.rx * scale - 1, B.rz * scale - 1, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#c9b98a';
      ctx.fillRect(X(-1.5), Y(-1), 3 * scale, 22 * scale);
      const fs = s.fs;
      if (!fs) return;
      for (const f of fs.fielders) {
        if (f.role === 'bowler' && !fs.live) continue;
        ctx.fillStyle = f.role === 'keeper' ? '#9ec5ff' : f.holding ? '#ff8a8d' : '#f6f1e3';
        ctx.beginPath(); ctx.arc(X(f.pos.x), Y(f.pos.z), 3.2, 0, Math.PI * 2); ctx.fill();
      }
      for (const r of fs.runners) {
        ctx.fillStyle = r.st === 'out' ? '#ff6b6e' : '#f2c14e';
        ctx.beginPath(); ctx.arc(X(r.key === 'A' ? 0.3 : -0.3), Y(r.z), 3.2, 0, Math.PI * 2); ctx.fill();
      }
      const b = s.ball;
      if (fs.live && b && b.mode !== 'hidden') {
        if (fs.thrown && fs.throwTgt) {
          ctx.strokeStyle = 'rgba(255,107,110,0.7)'; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(X(b.pos.x), Y(b.pos.z)); ctx.lineTo(X(fs.throwTgt.x), Y(fs.throwTgt.z)); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = '#ff3b3f';
        ctx.beginPath(); ctx.arc(X(b.pos.x), Y(b.pos.z), 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(X(b.pos.x), Y(b.pos.z), 5.5, 0, Math.PI * 2); ctx.stroke();
      }
    },

    // ---- panels ------------------------------------------------------------------------------------
    toss(m0, cb) {
      const html = `<h2>The toss</h2><p class="lead">Call it.</p>
        <div class="actions" style="justify-content:center"><button class="btn primary" data-c="heads">Heads</button><button class="btn primary" data-c="tails">Tails</button></div>`;
      const p = panel(html);
      p.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
        const coin = Math.random() < 0.5 ? 'heads' : 'tails';
        const won = coin === b.dataset.c;
        if (won) {
          panel(`<h2>It's ${coin}: you won the toss</h2><p class="lead">Bat or bowl?</p>
            <div class="actions" style="justify-content:center"><button class="btn primary" data-d="bat">We'll bat</button><button class="btn primary" data-d="bowl">We'll bowl</button></div>`)
            .querySelectorAll('[data-d]').forEach((d) => d.addEventListener('click', () => { closePanel(); cb(d.dataset.d === 'bat'); }));
        } else {
          const aiBat = Math.random() < 0.75;
          panel(`<h2>It's ${coin}: they won the toss</h2><p class="lead">They've chosen to ${aiBat ? 'bat' : 'bowl'}.</p>
            <div class="actions" style="justify-content:center"><button class="btn primary" id="tossGo">${aiBat ? 'Take the field' : 'Pad up'}</button></div>`)
            .querySelector('#tossGo').addEventListener('click', () => { closePanel(); cb(!aiBat); });
        }
      }));
    },

    // Who bowls this over? Keys: 1-5 pick the Nth bowler you can use (last
    // over's man is out, Law 17.6), Enter bowls the pick (or the captain's),
    // S lets the AI bowl it. The session never sees these keys.
    bowlerPicker(m, cb, first) {
      const inn = m.inn, T = m.teams.you;
      const sugg = m.aiPickBowler();
      const usable = [];
      T.players.forEach((p, i) => { if (p.bowl && i !== inn.lastBowler) usable.push(i); });
      const rows = T.players.map((p, i) => {
        if (!p.bowl) return '';
        const c = inn.bowlers[i];
        const fig = c ? `${Match.overs(c.balls)}-${c.maidens}-${c.runs}-${c.wkts}` : '0-0-0-0';
        const last = i === inn.lastBowler;
        const n = usable.indexOf(i) + 1;
        return `<button class="btn bowlpick${i === sugg ? ' sugg' : ''}" data-i="${i}" ${last ? 'disabled title="Bowled the last over"' : ''}>
          ${n > 0 && n <= 9 ? `<kbd class="kn">${n}</kbd>` : ''}<b>${esc(p.name)}</b><small>${typeName(p.bowl)} · ${fig}${c && c.spell ? ` · spell ${c.spell}` : ''}${last ? ' · just bowled' : i === sugg ? ' · captain\'s pick' : ''}</small></button>`;
      }).join('');
      const keys = usable.length ? `<p class="lead keys"><kbd>1</kbd>–<kbd>${Math.min(9, usable.length)}</kbd> pick · <kbd>Enter</kbd> bowl ${sugg != null ? '(the captain\'s pick if you haven\'t chosen)' : ''} · <kbd>S</kbd> the AI bowls this over</p>` : '';
      const html = `<h2>${first ? 'Who opens the bowling?' : `Over ${Math.floor(inn.balls / 6) + 1}: who's bowling?`}</h2>
        <p class="lead">${esc(m.teams[inn.bat].name)} ${m.scoreLine()} · ${esc(m.situation())}</p>
        <div class="bowlgrid">${rows}</div>${keys}
        <div class="actions"><button class="btn" data-sim="1">Let the AI bowl this over</button><button class="btn" data-sim="2">Sim the rest of the innings</button></div>`;
      const p = panel(html, 'wide');
      let sel = null, done = false;
      const choose = (c) => { if (done) return; done = true; closePanel(); cb(c); };
      const mark = (i) => {
        sel = i;
        p.querySelectorAll('[data-i]').forEach((b) => b.classList.toggle('picked', +b.dataset.i === i));
        if (CLLM.Audio && CLLM.Audio.ui) CLLM.Audio.ui();
      };
      p.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => choose(+b.dataset.i)));
      p.querySelectorAll('[data-sim]').forEach((b) => b.addEventListener('click', () => choose(b.dataset.sim === '1' ? 'sim' : 'siminns')));
      panelKeys = (k, rep) => {
        if (/^[1-9]$/.test(k)) { const i = usable[+k - 1]; if (!rep && i != null) mark(i); return true; }
        if (k === 'enter') { const i = sel != null ? sel : sugg; if (!rep && i != null && armed()) choose(i); return true; }
        if (k === 's') { if (!rep && armed()) choose('sim'); return true; }
        return k === ' ';                                  // nothing to bowl yet: Space does nothing here
      };
      this._pick = { usable, sugg, get sel() { return sel; } };      // (for tests)
    },

    inningsBreak(m, inn, cb) {
      const why = { declared: 'Declared.', 'all out': 'All out.', overs: 'Out of overs.', target: 'Target reached.', time: 'Out of time.' }[inn.closed] || '';
      const html = `<h2>${esc(m.teams[inn.bat].name)} ${m.scoreLine(inn)}</h2>
        <p class="lead">${why} ${esc(m.situation())}</p>
        ${this.inningsCard(m, inn)}
        <div class="actions"><button class="btn primary" id="ibGo">${m.result ? 'Result' : m.youBatting ? 'Pad up' : 'Take the field'}</button></div>`;
      let done = false;
      const go = () => { if (done) return; done = true; closePanel(); cb(); };
      panel(html, 'wide').querySelector('#ibGo').addEventListener('click', go);
      panelKeys = (k, rep) => { if (k !== 'enter') return false; if (!rep && armed()) go(); return true; };
    },

    followOnPrompt(m, cb) {
      const fo = m.followOnPending;
      const html = `<h2>Enforce the follow-on?</h2><p class="lead">You lead by ${fo.lead}. Make them bat again straight away, or bat again yourselves?</p>
        <div class="actions" style="justify-content:center"><button class="btn primary" data-e="1">Enforce it</button><button class="btn" data-e="0">We'll bat</button></div>`;
      panel(html).querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => { closePanel(); cb(b.dataset.e === '1'); }));
    },

    matchResult(m, cb) {
      const html = `<h2>${esc(m.result.text)}</h2>
        <p class="lead">${m.innings.map((i) => `${esc(m.teams[i.bat].name)} ${m.scoreLine(i)}`).join(' · ')}</p>
        ${m.innings.map((i) => this.inningsCard(m, i)).join('')}
        <div class="actions"><button class="btn primary" id="mrGo">Main menu</button></div>`;
      panel(html, 'wide').querySelector('#mrGo').addEventListener('click', () => { closePanel(); cb(); });
      if (m.result.youWon && CLLM.Audio) CLLM.Audio.cheer(true);
    },

    // The full card (Tab, or the pause menu). Tab / Esc / Enter close it.
    scorecard(m, cb) {
      const html = `<h2>Scorecard</h2><p class="lead">${esc(m.F.name)} · ${esc(m.situation())}</p>${m.innings.slice().reverse().map((i) => this.inningsCard(m, i)).join('')}
        <div class="actions"><button class="btn primary" id="scBack">Back</button></div>`;
      let done = false;
      const back = () => { if (done) return; done = true; closePanel(); if (cb) cb(); };
      panel(html, 'wide').querySelector('#scBack').addEventListener('click', back);
      panelKeys = (k, rep) => {
        if (k !== 'tab' && k !== 'escape' && k !== 'enter') return false;
        if (!rep) back();
        return true;
      };
    },

    inningsCard(m, inn) {
      const BT = m.teams[inn.bat], FT = m.teams[inn.bowl];
      const howOut = (c) => {
        if (!c.out) return c.in ? 'not out' : '';
        const o = c.out, bn = o.bowler != null ? FT.players[o.bowler].name : '';
        if (o.how === 'caught') return o.fielder === 'bowler' ? `c &amp; b ${esc(bn)}` : `c ${esc(o.fielder || '')} b ${esc(bn)}`;
        if (o.how === 'run out') return `run out (${esc(o.fielder || '')})`;
        if (o.how === 'stumped') return `st keeper b ${esc(bn)}`;
        if (o.how === 'lbw') return `lbw b ${esc(bn)}`;
        return `b ${esc(bn)}`;
      };
      const bats = inn.batters.filter((c) => c.in || c.out || c.balls).map((c) => `<tr><td>${esc(BT.players[c.i].name)}</td><td class="how">${howOut(c)}</td><td><b>${c.runs}</b></td><td>${c.balls}</td><td>${c.fours}</td><td>${c.sixes}</td></tr>`).join('');
      const ex = inn.extras, exT = ex.b + ex.lb + ex.w + ex.nb;
      const bowls = Object.keys(inn.bowlers).map((k) => { const c = inn.bowlers[k]; return `<tr><td>${esc(FT.players[k].name)}</td><td>${Match.overs(c.balls)}</td><td>${c.maidens}</td><td>${c.runs}</td><td><b>${c.wkts}</b></td></tr>`; }).join('');
      return `<div class="card-inns"><h3>${esc(BT.name)} · ${nth(inn.n)} innings${inn.followOn ? ' (following on)' : ''} <span>${m.scoreLine(inn)}</span></h3>
        <table class="sc"><thead><tr><th>Batter</th><th></th><th>R</th><th>B</th><th>4s</th><th>6s</th></tr></thead><tbody>${bats}
        <tr><td>Extras</td><td class="how">b ${ex.b}, lb ${ex.lb}, w ${ex.w}, nb ${ex.nb}</td><td><b>${exT}</b></td><td></td><td></td><td></td></tr></tbody></table>
        ${bowls ? `<table class="sc"><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th></tr></thead><tbody>${bowls}</tbody></table>` : ''}</div>`;
    },

    // UI-8: the MATCH card is for testers until CFG.MATCH.PUBLIC. ?match=1 turns
    // it on (and remembers it on this device); ?match=0 forgets it.
    matchFlag(search) {
      const q = search != null ? String(search) : (typeof location !== 'undefined' ? location.search || '' : '');
      const on = /[?&]match=1(?:[&#]|$)/.test(q), off = /[?&]match=0(?:[&#]|$)/.test(q);
      let kept = false;
      try {
        if (on) localStorage.setItem(FLAG_KEY, '1');
        else if (off) localStorage.removeItem(FLAG_KEY);
        kept = localStorage.getItem(FLAG_KEY) === '1';
      } catch (e) { /* no storage: the URL alone */ }
      return !!MC().PUBLIC || on || kept;
    },
  });

  function rrect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // In a match the mini-map is the live field
  const baseDrawField = UI.drawField;
  UI.drawField = function () {
    const s = this.game && this.game.session;
    if (this.game && this.game.match && s && s.fs && this.fieldCtx) return this._drawRadar(s);
    return baseDrawField.call(this);
  };
  // ... and the bat overlays step aside while you're running
  const baseBatOverlay = UI.drawBatOverlay;
  UI.drawBatOverlay = function (ctx, s, cam) {
    if (s.live) return;
    return baseBatOverlay.call(this, ctx, s, cam);
  };
  // the batting result card is written fresh each ball: the margin chip goes back in
  const baseBallResult = UI.ballResult;
  UI.ballResult = function () {
    try { return baseBallResult.apply(this, arguments); }
    finally { if (this.game && this.game.match && this._mChip) injectChip(); }
  };

  UI.closePanel = closePanel;
  // pure pieces, for the bots and the console
  UI._matchUI = { canCall, endTints, stripLabel, stripGeom, marginInfo, verdictInfo, closestOf, tellReached };
})();
