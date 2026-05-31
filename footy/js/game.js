/*
 * GAME
 * ====
 * Glue layer. Owns the canvas, the field/ball/players/AI, the game state
 * machine (menu/playing/paused/celebrating), and the main update+render loop.
 *
 * The game is rendered in field-units. We compute a "viewport" transform each
 * frame that letterboxes the field into the available canvas size so the
 * whole oval is always visible.
 */
window.FOOTY = window.FOOTY || {};

FOOTY.Game = class {
  constructor(opts) {
    this.cfg = FOOTY.CONFIG;
    this.canvas = opts.canvas;
    this.ctx    = this.canvas.getContext('2d');
    this.hud    = opts.hud;
    this.banner = opts.banner;
    this.scoreA = opts.scoreA;
    this.scoreB = opts.scoreB;
    this.clockEl = opts.clockEl;

    this.field = new FOOTY.Field(this.cfg);
    this.ball  = new FOOTY.Ball(this.cfg, this.field);

    this._buildPlayers();

    this.state = 'idle';     // 'idle' | 'playing' | 'paused' | 'celebrating'
    this.controlMode = 'A'; // 'A' = WASD | 'B' = follow cursor
    this.score = { A: 0, B: 0 };
    this.timeLeft = this.cfg.MATCH.DURATION;
    this.kickoffTimer = 0;   // when > 0, ball is frozen (just-scored / start)
    this.bannerTimer = 0;

    this._loop = this._loop.bind(this);
    this._lastT = performance.now();

    window.addEventListener('resize', () => this._fitCanvas());
    this._fitCanvas();

    requestAnimationFrame(this._loop);
  }

  _buildPlayers() {
    const C = this.cfg.COLORS;
    const A = this.cfg.TEAMS.A_ATTACKS;
    const B = this.cfg.TEAMS.B_ATTACKS;

    // Human — red — mouse + keyboard.
    this.p1 = new FOOTY.Player(this.cfg, {
      id: 'P1',
      team: 'A',
      attacks: A,
      bindings: this.cfg.KEYS.P1,
      colors: { BODY: C.P1_BODY, HEAD: C.P1_HEAD },
      x: this.field.cx - 120,
      y: this.field.cy - 60,
      tackleStrength: 0.55,
    });

    // AI teammate — blue — same team as P1, attacks the same goal.
    this.p2 = new FOOTY.Player(this.cfg, {
      id: 'P2',
      team: 'A',
      attacks: A,
      bindings: null,
      colors: { BODY: C.P2_BODY, HEAD: C.P2_HEAD },
      x: this.field.cx - 120,
      y: this.field.cy + 60,
      tackleStrength: 0.55,
    });

    // AI opponent — yellow.
    this.aiP = new FOOTY.Player(this.cfg, {
      id: 'AI',
      team: 'B',
      attacks: B,
      bindings: null,
      colors: { BODY: C.AI_BODY, HEAD: C.AI_HEAD },
      x: this.field.cx + 140,
      y: this.field.cy,
      tackleStrength: 0.70,   // slightly stronger — difficulty knob
    });

    this.aiAlly = new FOOTY.AI(this.cfg, this.p2,  this.field);
    this.aiOpp  = new FOOTY.AI(this.cfg, this.aiP, this.field);
    this.players = [this.p1, this.p2, this.aiP];
  }

  // ---- Public state transitions ----
  // opts.mode: 'normal' (default) or 'freeplay'.
  // In freeplay the AI is excluded from the active players, the clock doesn't
  // tick, and both goals score for team A so you can shoot at either end.
  startMatch(opts) {
    const mode = (opts && opts.mode) || 'normal';
    this.mode = mode;
    this.controlMode = 'A';
    this.score.A = 0;
    this.score.B = 0;
    this.timeLeft = this.cfg.MATCH.DURATION;

    if (mode === 'freeplay') {
      // Solo — just the human on the field; no teammate, no opponent.
      this.players = [this.p1];
    } else {
      this.players = [this.p1, this.p2, this.aiP];
    }

    // Tell the HUD which mode we're in (drives the "FREE PLAY" label + hides CPU score).
    this.hud.classList.toggle('freeplay', mode === 'freeplay');

    this._resetForCenterBounce();
    this.state = 'playing';
    this._lastT = performance.now();
    this._updateHUD();
  }

  pause()  { if (this.state === 'playing') this.state = 'paused'; }
  resume() { if (this.state === 'paused')  { this.state = 'playing'; this._lastT = performance.now(); } }
  isPlaying() { return this.state === 'playing'; }

  // ---- Internal ----
  _resetForCenterBounce() {
    this.ball.reset();
    const isFreeplay = this.mode === 'freeplay';

    this.p1.x = this.field.cx - 100; this.p1.y = this.field.cy - 60;
    this.p1.vx = this.p1.vy = 0;
    this.p1.lastKickRequest = null;
    this.p1.handballRequest = false;
    this.p1.tackleRequest = false;

    if (!isFreeplay) {
      this.p2.x = this.field.cx - 100; this.p2.y = this.field.cy + 60;
      this.p2.vx = this.p2.vy = 0;
      this.p2.lastKickRequest = null;
      this.p2.handballRequest = false;
      this.p2.tackleRequest = false;

      this.aiP.x = this.field.cx + 120; this.aiP.y = this.field.cy;
      this.aiP.vx = this.aiP.vy = 0;
      this.aiP.lastKickRequest = null;
      this.aiP.handballRequest = false;
      this.aiP.tackleRequest = false;
    }

    this.kickoffTimer = this.cfg.MATCH.KICKOFF_DELAY;
  }

  _showBanner(text, ms = 1400) {
    this.banner.textContent = text;
    this.banner.classList.remove('hidden');
    this.bannerTimer = ms / 1000;
  }

  _updateHUD() {
    this.scoreA.textContent = this.score.A;
    this.scoreB.textContent = this.score.B;
    if (this.mode === 'freeplay') {
      this.clockEl.textContent = 'FREE PLAY';
    } else {
      const t = Math.max(0, Math.ceil(this.timeLeft));
      const m = Math.floor(t / 60);
      const s = t % 60;
      this.clockEl.textContent = m + ':' + (s < 10 ? '0' + s : s);
    }
  }

  _fitCanvas() {
    // Set internal resolution to match the displayed pixels (DPR aware).
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width  = Math.floor(window.innerWidth  * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width  = window.innerWidth  + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this._dpr = dpr;
  }

  // ---- Frame loop ----
  _loop(now) {
    let dt = (now - this._lastT) / 1000;
    this._lastT = now;
    if (dt > 0.05) dt = 0.05;          // clamp big stalls (e.g. tab switch)

    if (this.state === 'playing') {
      this._update(dt);
    } else if (this.state === 'paused' || this.state === 'idle') {
      // freeze — just re-render.
    }
    this._render();
    requestAnimationFrame(this._loop);

    // Banner countdown runs regardless of pause so the GOAL flash clears.
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.add('hidden');
    }

    FOOTY.Input.endFrame();
    FOOTY.Mouse.endFrame();
  }

  _update(dt) {
    // Pause input on Esc.
    if (FOOTY.Input.wasPressed(this.cfg.KEYS.PAUSE)) {
      this.pause();
      // Show pause overlay via main.js (which listens to state via a hook).
      if (this.onPause) this.onPause();
      return;
    }

    const isFreeplay = this.mode === 'freeplay';

    // Kick-off freeze: no ball motion or possession changes.
    if (this.kickoffTimer > 0) {
      this.kickoffTimer -= dt;
      this.p1.applyInput(FOOTY.Input, dt);
      this.p1.update(dt, this.ball, this.field);
      if (!isFreeplay) {
        this.p2.update(dt, this.ball, this.field);
        this.aiP.update(dt, this.ball, this.field);
      }
      this.ball.followHolder();
      return;
    }

    // Match clock — freeplay never expires.
    if (!isFreeplay) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this._endMatch();
        return;
      }
    }

    // 1) Human input — movement + sprint + tackle button.
    this.p1.applyInput(FOOTY.Input, dt);

    // 1b) Mouse aim + charge-to-kick for P1. Direction comes from cursor,
    //     power from how long left-click was held; release fires the kick.
    //     Past CHARGE_TIME the kick stays at max power but adds wobble
    //     (overcharge), shown in red on the power bar.
    const M = FOOTY.Mouse;
    this.p1.aimX = M.worldX;
    this.p1.aimY = M.worldY;
    const carrying = this.ball.holder === this.p1;
    if (carrying) {
      // Start a fresh charge on press.
      if (M.leftPressed && !this.p1.kickHeld) {
        this.p1.kickHeld = true;
        this.p1.kickChargeTime = 0;
      }
      // Accumulate while held.
      if (this.p1.kickHeld && M.leftDown) {
        this.p1.kickChargeTime += dt;
      }
      // Release: produce the kick request.
      if (this.p1.kickHeld && !M.leftDown) {
        const K = this.cfg.KICK;
        const charge = this.p1.kickChargeTime;
        const power01 = Math.min(1, charge / K.CHARGE_TIME);
        const overSec = Math.max(0, charge - K.CHARGE_TIME);
        const overcharge = Math.min(1, overSec / K.OVERCHARGE_TIME);
        const extraWobble = overcharge * K.MAX_OVERCHARGE_WOBBLE;
        const angle = Math.atan2(M.worldY - this.p1.y, M.worldX - this.p1.x);
        this.p1.lastKickRequest = { power01, angle, extraWobble };
        this.p1.kickHeld = false;
        this.p1.kickChargeTime = 0;
      }
      if (M.rightPressed) {
        this.p1.requestHandballAimed(M.worldX, M.worldY);
      }
    } else if (this.p1.kickHeld) {
      // Lost the ball mid-charge — abort the charge, no kick.
      this.p1.kickHeld = false;
      this.p1.kickChargeTime = 0;
    }

    // Control B: override movement wish-direction to follow the cursor.
    // applyInput() still ran above (handles sprint + tackle keys).
    if (this.controlMode === 'B') {
      const dx = M.worldX - this.p1.x;
      const dy = M.worldY - this.p1.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 15) {
        this.p1.wishDx = dx / dist;
        this.p1.wishDy = dy / dist;
      } else {
        this.p1.wishDx = 0;
        this.p1.wishDy = 0;
      }
    }

    // 2) Drive both AIs (skipped in freeplay).
    if (!isFreeplay) {
      this.aiAlly.update(dt, this.ball, [this.p1, this.aiP]);
      this.aiOpp.update(dt, this.ball, [this.p1, this.p2]);
    }

    // 3) Resolve any pending kicks/handballs *before* moving — so ball
    //    launches from the player's current frame position.
    // Note: rejected kicks (mouse aimed > 90° behind facing) are silently
    // dropped. The aim line going red is the visual cue.
    this.p1.executeActions(this.ball);
    if (!isFreeplay) {
      this.p2.executeActions(this.ball);
      this.aiP.executeActions(this.ball);
    }

    // 4) Integrate motion.
    this.p1.update(dt, this.ball, this.field);
    if (!isFreeplay) {
      this.p2.update(dt, this.ball, this.field);
      this.aiP.update(dt, this.ball, this.field);
    }

    // 5) Soft player-vs-player separation.
    this._separatePlayers();

    // 6) Ball physics (only if not held).
    const step = this.ball.step(dt);

    // 7) Possession checks: marks (descending kicks) then tackles then pickups.
    if (!this.ball.holder) {
      // Marks first (catching in the air).
      for (const p of this.players) {
        if (p.tryMark(this.ball)) {
          this._maybeBanner('MARK!', 700);
          break;
        }
      }
    }
    if (!this.ball.holder) {
      // Loose-ball pickups.
      for (const p of this.players) {
        if (p.tryPickup(this.ball)) break;
      }
    } else {
      // Tackle: only fires when a player explicitly requested it this frame
      // (space-bar for the human, AI sets it when adjacent to an opposing
      // carrier). Outcome depends on carrier.possessionTime + tacker strength.
      const carrier = this.ball.holder;
      for (const p of this.players) {
        if (!p.tackleRequest) continue;
        p.tackleRequest = false;
        if (p === carrier) continue;
        if (p.team === carrier.team) continue;
        if (p.tackleCooldown > 0) continue;
        const d = Math.hypot(p.x - carrier.x, p.y - carrier.y);
        if (d < this.cfg.PLAYER.TACKLE_RADIUS) {
          this._resolveTackle(carrier, p);
          break;
        }
      }
    }
    // Clear any leftover tackleRequest flags (e.g. pressed when no holder).
    for (const p of this.players) p.tackleRequest = false;

    // 8) Goal-line crossing check — only if ball is currently free.
    if (!this.ball.holder) {
      const left  = this.field.checkGoalCrossing(step.prev, step.curr, 'left');
      const right = this.field.checkGoalCrossing(step.prev, step.curr, 'right');
      if (left)  this._handleGoalAttempt(left,  'left');
      if (right) this._handleGoalAttempt(right, 'right');
    }

    this._updateHUD();
  }

  // Tackle outcome decided here. Two outcomes:
  //   (a) HOLDING THE BALL — free kick to tackler (they get possession)
  //   (b) Ball spills loose — current scramble behaviour
  // The dice roll uses carrier.possessionTime and other.tackleStrength.
  _resolveTackle(carrier, tackler) {
    const H = this.cfg.HOLDING_BALL;
    const t = carrier.possessionTime;
    let prob = 0;
    if (t >= H.PRIOR_OPP_TIME) {
      const overflow = t - H.PRIOR_OPP_TIME;
      const base = Math.min(1, overflow / H.FULL_PENALTY_DELAY);
      prob = base + (tackler.tackleStrength - 0.5) * H.STRENGTH_INFLUENCE;
      prob = Math.max(0, Math.min(1, prob));
    }

    if (Math.random() < prob) {
      // Holding the ball — tackler gets the free kick from the spot.
      this.ball.holder = tackler;
      this.ball.vx = this.ball.vy = this.ball.vz = 0;
      this.ball.lastKicker = null;
      // Reset both possession timers — tackler just got it, carrier no longer has it.
      tackler.possessionTime = 0;
      carrier.possessionTime = 0;
      carrier.tackleCooldown = this.cfg.PLAYER.TACKLE_COOLDOWN;
      // Cancel any in-flight charges the carrier had — they no longer hold the ball.
      carrier.kickHeld = false;
      carrier.kickCharge = 0;
      carrier.lastKickRequest = null;
      carrier.handballRequest = false;
      this._showBanner('HOLDING THE BALL!', H.BANNER_MS);
    } else {
      // Spill — ball pops loose for the scramble.
      this.ball.holder = null;
      this.ball.vx = Math.cos(carrier.facing) * 120 + (Math.random() - 0.5) * 60;
      this.ball.vy = Math.sin(carrier.facing) * 120 + (Math.random() - 0.5) * 60;
      this.ball.vz = 220;
      carrier.tackleCooldown = this.cfg.PLAYER.TACKLE_COOLDOWN;
      this._maybeBanner('TACKLE!', 600);
    }
  }

  _separatePlayers() {
    const minDist = this.cfg.PLAYER.COLLIDE_RADIUS * 2;
    for (let i = 0; i < this.players.length; i++) {
      for (let j = i + 1; j < this.players.length; j++) {
        const a = this.players[i], b = this.players[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 0 && d < minDist) {
          const push = (minDist - d) / 2;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
  }

  _handleGoalAttempt(result, end) {
    // Which team SCORES depends on which goal was crossed:
    // - crossing the goal Team A attacks (A_ATTACKS) → A scores
    // - crossing the goal Team B attacks (B_ATTACKS) → B scores
    // In freeplay there's no opponent — every goal credits team A so the
    // player can shoot at either end.
    let scoringTeam = null;
    if (this.mode === 'freeplay') {
      scoringTeam = 'A';
    } else if (end === this.cfg.TEAMS.A_ATTACKS) {
      scoringTeam = 'A';
    } else if (end === this.cfg.TEAMS.B_ATTACKS) {
      scoringTeam = 'B';
    }

    if (!scoringTeam) return;

    if (result === 'goal') {
      this.score[scoringTeam] += this.cfg.SCORE.GOAL;
      this._showBanner('GOAL!', 1500);
    } else if (result === 'behind') {
      this.score[scoringTeam] += this.cfg.SCORE.BEHIND;
      this._showBanner('BEHIND', 1200);
    } else {
      // 'out' — out of bounds past the post; treat as a turnover for now.
      this._showBanner('OUT OF BOUNDS', 900);
    }
    this._resetForCenterBounce();
    this._updateHUD();
  }

  _maybeBanner(text, ms) {
    // Cheap banner debounce — don't spam the same text repeatedly.
    if (this.banner.textContent === text && !this.banner.classList.contains('hidden')) return;
    this._showBanner(text, ms);
  }

  _endMatch() {
    const winner = (this.score.A > this.score.B) ? 'US WIN!' :
                   (this.score.B > this.score.A) ? 'CPU WINS' : 'DRAW';
    this._showBanner(winner, 3000);
    this.state = 'idle';
    if (this.onMatchEnd) this.onMatchEnd();
  }

  // ---- Rendering ----
  _render() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, cw, ch);

    // Compute scale to fit the field into the canvas with letterboxing.
    const scale = Math.min(cw / this.field.w, ch / this.field.h);
    const offX = (cw - this.field.w * scale) / 2;
    const offY = (ch - this.field.h * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, offX, offY);

    // Feed the mouse module our current transform so its worldX/worldY map
    // pointer position back to field-units.
    FOOTY.Mouse.setTransform(scale, offX, offY, this._dpr);

    // Draw field, ball, players.
    this.field.draw(ctx);

    // Players first (under accuracy bar/HUD overlays), ball last so it's on top.
    for (const p of this.players) {
      p.draw(ctx, false, this.ball.holder === p);
    }

    this.ball.draw(ctx);

    // Accuracy bar overlay (if a human carrier is in range of their goal).
    this._drawAccuracyBar(ctx);

    // Debug: collision radii etc.
    if (this.cfg.DEBUG) this._drawDebug(ctx);
  }

  _drawAccuracyBar(ctx) {
    const carrier = this.ball.holder;
    if (!carrier) return;
    if (carrier.team !== 'A') return; // only show for humans

    const goalEnd = carrier.attacks;
    const dist = this.field.distToGoalCenter(carrier.x, carrier.y, goalEnd);
    if (dist > this.cfg.ACCURACY.TRIGGER_DIST) return;

    // Bar above the carrier.
    const w = 120, h = 10;
    const x = carrier.x - w / 2;
    const y = carrier.y - this.cfg.PLAYER.RADIUS - 30;

    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(x, y, w, h);

    // Perfect zone.
    const pz = this.cfg.ACCURACY.PERFECT_ZONE;
    ctx.fillStyle = '#3aa83a';
    ctx.fillRect(x + w * (0.5 - pz), y, w * pz * 2, h);

    // Oscillating indicator.
    const period = this.cfg.ACCURACY.BAR_PERIOD;
    const t = (performance.now() / 1000) % (period * 2);
    const phase = (t < period) ? (t / period) : (1 - (t - period) / period);
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(x + w * phase - 2, y - 3, 4, h + 6);
  }

  // Returns the current accuracy [0..1] where 0 = perfect, 1 = max miss.
  // Game logic can call this on kick-release to apply deflection.
  currentAccuracyOffset() {
    const period = this.cfg.ACCURACY.BAR_PERIOD;
    const t = (performance.now() / 1000) % (period * 2);
    const phase = (t < period) ? (t / period) : (1 - (t - period) / period);
    return Math.abs(phase - 0.5) * 2; // 0..1
  }

  _drawDebug(ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    for (const p of this.players) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.cfg.PLAYER.POSSESSION_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, this.cfg.PLAYER.MARK_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
};
