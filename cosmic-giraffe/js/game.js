/*
 * GAME — the state machine + the master update loop.
 * ==================================================
 * Holds all shared gameplay state (the object passed around as `g`), runs the
 * states (menu / playing / options / paused / best times / achievements), and
 * orchestrates updateGame() in Cosmic Ascent's exact order:
 *   timers → hazards → platforms → tongue timers → tongue projectile →
 *   gravity → tongue constrain → player move → camera.
 *
 * Cosmic Giraffe additions: g.time, the zoom/lean/shake camera (cam.js), aim
 * recomputed every frame from the mouse (or right stick), killPlayer() with
 * death/respawn events, and per-frame updates for the visual modules.
 */
window.ASCENT = window.ASCENT || {};

ASCENT.Game = {
  STATES: null,
  state: 'menu',
  screenWidth: 0,
  screenHeight: 0,
  shaderTime: 0,      // seconds since boot (all states) — drives ambient animation
  time: 0,            // seconds of gameplay simulation (freezes while paused)
  canvas: null,

  // run/session timers
  gameTimer: 0, timerStarted: false, currentRunTime: 0,
  isFalling: false, fallStartY: 0, currentFallDistance: 0, sessionFallTime: 0,
  inGravityWell: false, gravityWellTimer: 0, meteorSpawnTimer: 0,
  debugFlying: false, fallShake: 0, deaths: 0,
  dying: null,           // {t, x, y, cause} during the short death beat before respawn
  _debugUsed: false,     // a debug cheat (F fly / G warp) was used this run → the win isn't recorded
  _generated: false,

  // menu/ui state
  menuItems: [], selectedMenuItem: 0,
  optionsItems: [], selectedOptionIndex: 0,
  pauseItems: [], selectedPauseItem: 0,
  achievementsTab: 1, achievementsScroll: 0,
  menuTime: 0, titlePulse: 0,
  achievementPopups: [],
  hotspots: [],          // clickable menu regions, rebuilt each menu draw

  init(w, h, canvas) {
    this.STATES = ASCENT.STATES;
    this.screenWidth = w;
    this.screenHeight = h;
    this.canvas = canvas;
    ASCENT.Save.loadAll();
    this._buildMenus();
    this.state = this.STATES.MENU;
    ASCENT.Space.init(this);
    ASCENT.World.init(this);
    ASCENT.Giraffe.init(this);
    ASCENT.Particles.init(this);
    ASCENT.UI.init(this);
  },

  resize(w, h) {
    this.screenWidth = w;
    this.screenHeight = h;
    // Cam.update keeps the view rect in step with the screen, but it doesn't
    // run while paused — refresh it now or world culling uses the old size.
    this._refreshCamView();
    ASCENT.Space.resize(this);
    ASCENT.UI.resize(this);
  },

  // Recompute the camera's visible world rect (viewW/H, x/y) from its centre,
  // zoom and the current screen size. No allocation.
  _refreshCamView() {
    const cam = this.camera;
    if (!cam || !(cam.zoom > 0)) return;
    cam.viewW = this.screenWidth / cam.zoom;
    cam.viewH = this.screenHeight / cam.zoom;
    cam.x = cam.cx - cam.viewW / 2;
    cam.y = cam.cy - cam.viewH / 2;
  },

  _buildMenus() {
    const S = this.STATES, G = this;
    this.menuItems = [
      { text: 'LAUNCH GIRAFFE', action: () => G.startGame() },
      { text: 'OPTIONS', action: () => { G.selectedOptionIndex = 0; G.state = S.OPTIONS; } },
      { text: 'BEST TIMES', action: () => { G.state = S.BEST_TIMES; } },
      { text: 'STATS & ACHIEVEMENTS', action: () => { G.achievementsTab = 1; G.achievementsScroll = 0; G.state = S.ACHIEVEMENTS; } },
      { text: 'EXIT TO EARTH', action: () => { window.location.href = '../index.html'; } },
    ];
    this.optionsItems = [
      { type: 'toggle', key: 'soundEnabled', text: 'SOUND', on: 'ON', off: 'OFF' },
      { type: 'cycle', key: 'giraffeSkin', text: 'GIRAFFE', options: ASCENT.GIRAFFE_STYLES },
      { type: 'cycle', key: 'graphics', text: 'GRAPHICS',
        options: [{ value: 'auto', label: 'AUTO' }, { value: 'high', label: 'HIGH' }, { value: 'low', label: 'LOW' }] },
      { type: 'cycle', key: 'controlScheme', text: 'CONTROLS',
        options: [{ value: 'keyboard', label: 'KEYBOARD + MOUSE' }, { value: 'controller', label: 'CONTROLLER' }] },
      { type: 'toggle', key: 'debugMode', text: 'DEBUG MODE', on: 'ON', off: 'OFF' },
      { type: 'action', text: 'BACK TO MENU', action: () => { ASCENT.Save.saveOptions(); G.state = S.MENU; } },
    ];
    this.pauseItems = [
      { text: 'RESUME', action: () => { G.state = S.PLAYING; } },
      { text: 'CONTROLS', action: () => {} },
      { text: 'MAIN MENU', action: () => G.returnToMenu() },
      { text: 'EXIT GAME', action: () => { window.location.href = '../index.html'; } },
    ];
  },

  startGame() {
    const S = this.STATES;
    this.state = S.PLAYING;
    this.gameTimer = 0; this.timerStarted = false; this.currentRunTime = 0;
    ASCENT.Save.stats.gamesAttempted++;
    this.sessionFallTime = 0; this.isFalling = false; this.fallStartY = 0;
    this.currentFallDistance = 0; this.inGravityWell = false; this.gravityWellTimer = 0;
    this.meteorSpawnTimer = 0; this.fallShake = 0; this.deaths = 0;
    if (!this._generated) {
      ASCENT.Level.generate(this);
      ASCENT.World.onLevel(this);
      ASCENT.Space.onLevel(this);
      this._generated = true;
    } else {
      const p = this.player, r = this.rope;
      p.x = p.startX; p.y = p.startY; p.vx = 0; p.vy = 0;
      p.hasDoubleJump = true; p.ropeGraceTimer = 0; p.boosting = false; p.onGround = false;
      ASCENT.Rope.detach(this);
      ASCENT.Level.resetPlatforms(this);   // un-crumble slabs, rewind phase crystals
      r.shooting = false; r.cooldownTimer = 0; r.failedRopeSegments = []; r.failedRopeTimer = 0;
      this.goal.reached = false; this.goal.timeSaved = false;
      this.meteors.length = 0;
      ASCENT.Cam.reset(this);
    }
    this.debugFlying = false;
    this._debugUsed = false;
    this.dying = null;
    ASCENT.FX.emit('runStart', {});
  },

  returnToMenu() {
    this.state = this.STATES.MENU;
    this.selectedMenuItem = 0;
    ASCENT.Save.saveStats();
    ASCENT.Audio.setTension(false, 0);
  },

  // Death (solar flare / drifting out of the world). Cosmic Ascent respawned
  // instantly; here the giraffe goes "poof" where it died and the camera holds
  // on it for DEATH_BEAT seconds, then it warps back in at the start.
  killPlayer(cause) {
    const p = this.player;
    if (!p || this.dying) return;
    this.deaths++;
    ASCENT.Rope.detach(this);
    this.rope.shooting = false;
    ASCENT.Audio.setTension(false, 0);
    this.dying = { t: 0, x: p.x, y: p.y, cause };
    p.vx = 0; p.vy = 0; p.boosting = false;
    this.fallShake = 0;   // stop the fall whistle / fall-rush through the beat
    ASCENT.FX.emit('death', { x: p.x, y: p.y, cause });
  },

  _updateDying(dt) {
    const d = this.dying, p = this.player;
    d.t += dt;
    // hold the (hidden) giraffe where it died so the camera lingers on the poof
    p.x = Math.max(0, Math.min(this.levelWidth, d.x)); p.y = Math.min(d.y, this.levelHeight); p.vx = 0; p.vy = 0;
    ASCENT.Level.updatePlatforms(this, dt);
    // comets keep flying (progress 0 = no new spawns; the tongue is already detached)
    ASCENT.Level.updateMeteors(this, dt, 0);
    ASCENT.Rope.updateTimers(this, dt);
    ASCENT.Cam.update(this, dt);
    if (d.t >= (ASCENT.CONFIG.DEATH_BEAT || 0.8)) {
      this.dying = null;
      this.resetGame();
      this._updateAim();   // Giraffe.update runs this frame: aim from the respawn camera
      ASCENT.FX.emit('respawn', { x: p.x, y: p.y });
    }
  },

  resetGame() {
    const p = this.player, r = this.rope;
    if (!p) return;
    p.x = p.startX; p.y = p.startY; p.vx = 0; p.vy = 0;
    p.hasDoubleJump = true; p.ropeGraceTimer = 0; p.boosting = false;
    ASCENT.Rope.detach(this);
    ASCENT.Level.resetPlatforms(this);   // un-crumble slabs, rewind phase crystals
    r.shooting = false; r.cooldownTimer = 0; r.failedRopeSegments = []; r.failedRopeTimer = 0;
    this.goal.reached = false; this.goal.timeSaved = false;
    this.debugFlying = false;
    this._debugUsed = false;   // R / respawn restart the timer from 0 → a clean run again
    this.dying = null;
    this.gameTimer = 0; this.timerStarted = false; this.currentRunTime = 0;
    this.isFalling = false; this.fallStartY = 0; this.currentFallDistance = 0;
    this.inGravityWell = false; this.gravityWellTimer = 0;
    this.fallShake = 0;
    ASCENT.Audio.setTension(false, 0);
    ASCENT.Cam.reset(this);
    this._refreshCamView();   // Cam.reset leaves x/y at 0 until the next Cam.update
  },

  progress() {
    const p = this.player;
    if (!p) return 0;
    return Math.max(0, (this.levelHeight - p.y - 150) / (this.levelHeight - 250));
  },

  // ---- achievements ----
  unlockAchievement(id) {
    for (const a of ASCENT.ACHIEVEMENTS) {
      if (a.id === id && !a.unlocked) {
        a.unlocked = true;
        this.achievementPopups.push({ name: a.name, desc: a.desc, timer: 0 });
        ASCENT.Audio.play('achievement', 0.8);
        ASCENT.Save.saveAchievements();
        return true;
      }
    }
    return false;
  },

  checkAchievements() {
    const st = ASCENT.Save.stats;
    if (this.progress() >= 0.5 && !this._debugUsed) this.unlockAchievement('first_50');   // not via F/G cheats
    if (st.gamesCompleted >= 1) this.unlockAchievement('first_win');
    if (st.gamesCompleted >= 25) this.unlockAchievement('win_25');
    if (st.gamesAttempted >= 100) this.unlockAchievement('attempt_100');
    if (st.jumps >= 10000) this.unlockAchievement('jump_10k');
    if (st.successfulRopes >= 10000) this.unlockAchievement('rope_10k');
    if (st.ropesFailed >= 1) this.unlockAchievement('first_fail');
    if (this.currentFallDistance >= this.levelHeight - 200) this.unlockAchievement('long_fall');
    if (this.gravityWellTimer >= 2.0) this.unlockAchievement('gravity_stuck');
  },

  // ---- main update dispatch ----
  update(dt) {
    this.shaderTime += dt;
    if (this.achievementPopups.length > 0) {
      const pop = this.achievementPopups[0];
      pop.timer += dt;
      if (pop.timer > ASCENT.CONFIG.ACHIEVEMENT_POPUP_DURATION) this.achievementPopups.shift();
    }
    ASCENT.Input.pollGamepad();
    const S = this.STATES;
    if (this.state === S.PLAYING) {
      this.time += dt;
      if (this.dying) this._updateDying(dt);
      else this.updateGame(dt);
      ASCENT.World.update(this, dt);
      if (!this.dying) ASCENT.Giraffe.update(this, dt);
      ASCENT.Particles.update(this, dt);
    } else if (this.state !== S.PAUSED) {
      this.menuTime += dt;
      this.titlePulse = Math.sin(this.menuTime * 2) * 0.3 + 0.7;
    }
    ASCENT.Space.update(this, dt);
    ASCENT.UI.update(this, dt);
    ASCENT.Audio.update(this, dt);
  },

  _updateAim() {
    const C = ASCENT.CONFIG, In = ASCENT.Input, p = this.player;
    if (In.hasGamepad()) {
      const rx = In.gamepadAxis('rightx'), ry = In.gamepadAxis('righty');
      if (Math.sqrt(rx * rx + ry * ry) > C.DEADZONE * 1.6) {
        this.aim.angle = Math.atan2(ry, rx);
        this.aim.visible = true;
        this._padAiming = true;
        return;
      }
      if (this._padAiming) return;   // keep last stick aim until the mouse moves
    }
    if (this._mouseSeen) {
      const w = ASCENT.Cam.screenToWorld(this, In.mouseX, In.mouseY);
      this.aim.angle = Math.atan2(w.y - p.y, w.x - p.x);
      this.aim.visible = true;
      this.aim.worldX = w.x; this.aim.worldY = w.y;
    }
  },

  updateGame(dt) {
    const C = ASCENT.CONFIG, p = this.player, rope = this.rope, st = ASCENT.Save.stats;

    // Autosave stats every STATS_SAVE_INTERVAL s of play. Keyed off timePlayed,
    // which always advances — gameTimer sits at 0 until the first move and is
    // frozen on the victory screen, which made a gameTimer-based check fire
    // (and hit localStorage) every frame.
    const prevPlayed = +st.timePlayed || 0;
    st.timePlayed = prevPlayed + dt;
    if (!this.timerStarted && (p.vx !== 0 || p.vy !== 0 || rope.active)) this.timerStarted = true;
    if (this.timerStarted && !this.goal.reached) { this.gameTimer += dt; this.currentRunTime = this.gameTimer; }
    if (Math.floor(st.timePlayed / C.STATS_SAVE_INTERVAL) !== Math.floor(prevPlayed / C.STATS_SAVE_INTERVAL)) {
      ASCENT.Save.saveStats();
    }

    const progress = this.progress();

    if (this.goal.reached) {
      // Victory: the giraffe floats up to the Celestial Acacia and munches.
      // No hazards or gravity — in Cosmic Ascent you kept falling after the
      // win and a flare could reset the run under the victory banner.
      if (rope.active || rope.shooting) { ASCENT.Rope.detach(this); rope.shooting = false; ASCENT.Audio.setTension(false, 0); }
      const tx = this.goal.x - p.facing * (this.goal.radius + 28), ty = this.goal.y + this.goal.radius + 22;
      const k = 1 - Math.pow(0.92, dt * 60);
      p.vx = (tx - p.x) * k / Math.max(dt, 1e-4);
      p.vy = (ty - p.y) * k / Math.max(dt, 1e-4);
      p.x += (tx - p.x) * k;
      p.y += (ty - p.y) * k + Math.sin(this.time * 2.2) * 0.15;
      p.onGround = false;
      p.boosting = false;
      this.fallShake = 0;
      ASCENT.Level.updatePlatforms(this, dt);
      // comets on screen fly on and leave (progress 0 = no new spawns; the
      // tongue was detached above, so nothing can be cut)
      ASCENT.Level.updateMeteors(this, dt, 0);
      ASCENT.Rope.updateTimers(this, dt);
    } else if (ASCENT.Save.options.debugMode && this.debugFlying) {
      p.vy = 0; p.vx = 0;
      const fly = 800;   // FLY_SPEED
      if (ASCENT.Input.isDown('w')) p.y -= fly * dt;
      else if (ASCENT.Input.isDown('s')) p.y += fly * dt;
      if (ASCENT.Input.isDown('a')) p.x -= fly * dt;
      else if (ASCENT.Input.isDown('d')) p.x += fly * dt;
    } else {
      // fall tracking
      if (p.vy > 0) {
        if (!this.isFalling) { this.isFalling = true; this.fallStartY = p.y; }
        this.sessionFallTime += dt;
        ASCENT.Save.stats.totalFallTime += dt;
        this.currentFallDistance = p.y - this.fallStartY;
        ASCENT.Save.stats.totalFallDistance += p.vy * dt;
        if (this.currentFallDistance >= this.levelHeight - 200) this.unlockAchievement('long_fall');
      } else if (this.isFalling) { this.isFalling = false; this.currentFallDistance = 0; }

      if (Math.abs(p.vy) < 100 && progress >= 0.5 && !this._debugUsed) this.unlockAchievement('first_50');
      this.checkAchievements();

      ASCENT.Level.updateMeteors(this, dt, progress);
      ASCENT.Level.updateSolarFlares(this, dt);
      // a flare may have respawned the giraffe; hazards below just see the new position
      ASCENT.Level.updateWind(this, dt);
      ASCENT.Level.updateGravityWells(this, dt);

      this.fallShake = p.vy > C.ABERRATION_THRESHOLD ? Math.min((p.vy - C.ABERRATION_THRESHOLD) / 400, 1) : 0;

      if (!rope.active) p.boosting = false;
      ASCENT.Audio.setTension(rope.active, rope.active ? rope.length / rope.maxLength : 0);

      ASCENT.Level.updatePlatforms(this, dt);
      ASCENT.Rope.updateTimers(this, dt);
      ASCENT.Rope.updateProjectile(this, dt);

      p.vy += this.gravity * dt;          // gravity
      ASCENT.Rope.constrain(this, dt);    // pendulum / swing
      ASCENT.Player.move(this, dt);       // horizontal, friction, integrate, collide, goal
    }

    // Record the win in the same frame Player.move reached the goal, so an
    // Esc / R / pause landing right after it can't skip the save. The time is
    // unchanged: gameTimer stops advancing once `reached` is set. Debug runs
    // (F fly / G warp) are never recorded as best times.
    if (this.goal.reached && !this.goal.timeSaved) {
      if (this.currentRunTime > 0 && !this._debugUsed) ASCENT.Save.addBestTime(this.currentRunTime);
      // Player.move only unlocks first_win; the non-victory branch that runs
      // checkAchievements() no longer runs after a win, so check win_25 here.
      if ((+st.gamesCompleted || 0) >= 25) this.unlockAchievement('win_25');
      this.goal.timeSaved = true;
    }

    ASCENT.Cam.update(this, dt);
    // Aim from this frame's camera + player (the reticle is drawn at aim.worldX/Y).
    this._updateAim();
  },

  draw() {
    ASCENT.Render.draw(this);
  },

  // ---- input ----
  keypressed(name) {
    const S = this.STATES;
    if (name === 'm') { this.toggleSound(); return; }
    switch (this.state) {
      case S.MENU: this._navMenu(name, this.menuItems, 'selectedMenuItem', () => { window.location.href = '../index.html'; }); break;
      case S.PLAYING: this._gameKey(name); break;
      case S.OPTIONS:
        if (name === 'left' || name === 'a' || name === 'right' || name === 'd') {
          const it = this.optionsItems[this.selectedOptionIndex];
          if (it && it.type !== 'action') { this._toggleOption(this.selectedOptionIndex, (name === 'left' || name === 'a') ? -1 : 1); ASCENT.Audio.play('uiMove', 0.4); }
          break;
        }
        this._navMenu(name, this.optionsItems, 'selectedOptionIndex', () => { ASCENT.Save.saveOptions(); this.state = S.MENU; }, (i) => this._toggleOption(i)); break;
      case S.PAUSED:
        if (name === 'p') { this.state = S.PLAYING; break; }   // P toggles pause, like Esc
        this._navMenu(name, this.pauseItems, 'selectedPauseItem', () => { this.state = S.PLAYING; }); break;
      case S.BEST_TIMES: if (name === 'escape' || name === 'return' || name === 'space') this.state = S.MENU; break;
      case S.ACHIEVEMENTS: this._achKey(name); break;
    }
  },

  _navMenu(name, items, sel, onEscape, onActivate) {
    if (name === 'up' || name === 'w') { this[sel] = (this[sel] - 1 + items.length) % items.length; ASCENT.Audio.play('uiMove', 0.4); }
    else if (name === 'down' || name === 's') { this[sel] = (this[sel] + 1) % items.length; ASCENT.Audio.play('uiMove', 0.4); }
    else if (name === 'return' || name === 'space') {
      ASCENT.Audio.play('uiSelect', 0.6);
      if (onActivate) onActivate(this[sel]);
      else items[this[sel]].action();
    } else if (name === 'escape') { onEscape(); }
  },

  _gameKey(name) {
    // Victory: back to the menu once the prompt is up (after 1 s, ui.js WIN_PROMPT_DELAY).
    if (this.goal.reached && (name === 'escape' || name === 'return' || name === 'space') && this.time - this.goal.reachedAt > 1.0) { this.returnToMenu(); return; }
    if (name === 'escape' || name === 'p') { this.state = this.STATES.PAUSED; this.selectedPauseItem = 0; }
    else if (name === 'f11') this.toggleFullscreen();
    else if (name === '=' || name === 'kp+') ASCENT.Audio.setMasterVolume(ASCENT.Audio.master + 0.1);
    else if (name === '-' || name === 'kp-') ASCENT.Audio.setMasterVolume(ASCENT.Audio.master - 0.1);
    // No gameplay input during the death poof (hidden giraffe) or the victory
    // munch; pause, fullscreen, volume and M (keypressed) still work. R during
    // the poof just ends the beat early so the normal respawn + warp-in plays;
    // R on the win screen restarts as usual.
    else if (this.dying) { if (name === 'r') this.dying.t = Math.max(this.dying.t, ASCENT.CONFIG.DEATH_BEAT || 0.8); }
    else if (this.goal.reached) { if (name === 'r') this.resetGame(); }
    else if (name === 'space') ASCENT.Player.jump(this);
    else if (name === 'r') this.resetGame();
    else if (name === 'f' && ASCENT.Save.options.debugMode) { this._debugUsed = true; this.debugFlying = !this.debugFlying; if (this.debugFlying) this.player.vy = 0; }
    else if (name === 'g' && ASCENT.Save.options.debugMode) { this._debugUsed = true; this.player.x = this.goal.x; this.player.y = this.goal.y + 120; this.player.vx = 0; this.player.vy = 0; }
  },

  _achKey(name) {
    const S = this.STATES;
    if (name === 'escape') this.state = S.MENU;
    else if (name === 'left' || name === 'a') { this.achievementsTab = 1; this.achievementsScroll = 0; }
    else if (name === 'right' || name === 'd') { this.achievementsTab = 2; this.achievementsScroll = 0; }
    else if ((name === 'up' || name === 'w') && this.achievementsTab === 2) this.achievementsScroll = Math.max(0, this.achievementsScroll - 1);
    else if ((name === 'down' || name === 's') && this.achievementsTab === 2) this.achievementsScroll = Math.min(Math.max(0, ASCENT.ACHIEVEMENTS.length - 8), this.achievementsScroll + 1);
    else if (name === 'r') { if (window.confirm('Reset ALL statistics and achievements?')) ASCENT.Save.resetStats(); }
  },

  toggleSound() {
    ASCENT.Save.options.soundEnabled = !ASCENT.Save.options.soundEnabled;
    ASCENT.Save.saveOptions();
    ASCENT.Audio.updateMusicVolume();
    if (ASCENT.Save.options.soundEnabled) { if (ASCENT.Audio.music) ASCENT.Audio.music.play().catch(() => {}); }
    else { if (ASCENT.Audio.music) ASCENT.Audio.music.pause(); ASCENT.Audio.setTension(false, 0); }
  },

  // Activate option i. Cycles step forward (dir = 1) or back (dir = -1).
  _toggleOption(i, dir) {
    const it = this.optionsItems[i];
    if (!it) return;
    if (it.type === 'toggle') {
      if (it.key === 'soundEnabled') { this.toggleSound(); return; }
      ASCENT.Save.options[it.key] = !ASCENT.Save.options[it.key];
      ASCENT.Save.saveOptions();
    } else if (it.type === 'cycle') {
      const opts = it.options || [];
      if (!opts.length) return;
      const cur = opts.findIndex((o) => o.value === ASCENT.Save.options[it.key]);
      const next = ((cur < 0 ? 0 : cur) + (dir || 1) + opts.length) % opts.length;
      ASCENT.Save.options[it.key] = opts[next].value;
      ASCENT.Save.saveOptions();
    } else if (it.type === 'action') { it.action(); }
  },

  mousemoved(x, y) {
    const S = this.STATES;
    this._mouseSeen = true;
    this._padAiming = false;
    if (this.state !== S.PLAYING) {
      // menu hover highlight
      const hit = this._hotspotAt(x, y);
      if (hit && hit.sel !== undefined && hit.selKey && this[hit.selKey] !== hit.sel) {
        this[hit.selKey] = hit.sel;
        ASCENT.Audio.play('uiMove', 0.3);
      }
    }
  },

  mousepressed(button) {
    const S = this.STATES;
    if (this.state === S.PLAYING) {
      if (this.goal.reached && this.time - this.goal.reachedAt > 1.0) { this.returnToMenu(); return; }
      if (this.dying || this.goal.reached) return;   // no tongue / jump during the poof or the win's first second
      if (button === 1) { this._mouseSeen = true; this._updateAim(); this._tongueAction(); }
      else if (button === 2) ASCENT.Player.jump(this);
    } else {
      const hit = this._hotspotAt(ASCENT.Input.mouseX, ASCENT.Input.mouseY);
      if (hit && hit.action) { ASCENT.Audio.play('uiSelect', 0.6); hit.action(); }
    }
  },

  _hotspotAt(x, y) {
    for (const h of this.hotspots) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
  },

  // Fire the tongue along the current aim, or let go if it's stuck.
  _tongueAction() {
    const r = this.rope;
    if (this.dying || this.goal.reached) return;   // belt and braces for every input source
    if (r.active) {
      ASCENT.Rope.release(this);
    } else if (!r.shooting && r.cooldownTimer <= 0 && this.aim.visible) {
      ASCENT.Rope.shoot(this, this.aim.angle);
    }
  },

  gamepadpressed(name) {
    const S = this.STATES;
    const nav = (items, selKey, activate, back) => {
      if (name === 'dpup') this.keypressed('up');
      else if (name === 'dpdown') this.keypressed('down');
      else if (name === 'a') { ASCENT.Audio.play('uiSelect', 0.6); activate(); }
      else if (name === 'b' || name === 'start') back();
    };
    if (this.state === S.MENU) nav(this.menuItems, 'selectedMenuItem', () => this.menuItems[this.selectedMenuItem].action(), () => {});
    else if (this.state === S.PLAYING) this._gameGamepad(name);
    else if (this.state === S.PAUSED) nav(this.pauseItems, 'selectedPauseItem', () => this.pauseItems[this.selectedPauseItem].action(), () => { this.state = S.PLAYING; });
    else if (this.state === S.OPTIONS) {
      if (name === 'dpleft') this.keypressed('left');
      else if (name === 'dpright') this.keypressed('right');
      else nav(this.optionsItems, 'selectedOptionIndex', () => this._toggleOption(this.selectedOptionIndex), () => { ASCENT.Save.saveOptions(); this.state = S.MENU; });
    }
    else if (this.state === S.ACHIEVEMENTS) {
      if (name === 'dpleft') this.keypressed('left');
      else if (name === 'dpright') this.keypressed('right');
      else if (name === 'dpup') this.keypressed('up');
      else if (name === 'dpdown') this.keypressed('down');
      else if (name === 'b' || name === 'start') this.state = S.MENU;
    }
    else if (name === 'b' || name === 'a' || name === 'start') this.state = S.MENU;
  },

  _gameGamepad(name) {
    const r = this.rope;
    if (this.goal.reached && (name === 'a' || name === 'start') && this.time - this.goal.reachedAt > 1.0) { this.returnToMenu(); return; }
    if (name === 'start') { this.state = this.STATES.PAUSED; this.selectedPauseItem = 0; }
    else if (this.dying || this.goal.reached) return;   // only pause during the poof / the win's first second
    else if (name === 'a' || name === 'rightshoulder') {
      this._tongueAction();
    } else if (name === 'b') {
      const p = this.player;
      if (this.debugFlying) return;
      if (p.onGround || p.hasDoubleJump || p.ropeGraceTimer > 0) ASCENT.Player.jump(this);
      else if (r.active) { p.vy = this.jumpPower * 0.7; ASCENT.Rope.release(this); ASCENT.Save.stats.jumps++; ASCENT.Audio.play('swingWhoosh', 0.4); }
    }
  },

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      (this.canvas.requestFullscreen || this.canvas.webkitRequestFullscreen || (()=>{})).call(this.canvas);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || (()=>{})).call(document);
    }
  },
};
