/*
 * GAME — the state machine + the master update loop.
 * ==================================================
 * Holds all shared gameplay state (the object passed around as `g`), runs the
 * states (menu / playing / options / paused / best times / achievements), and
 * orchestrates updateGame() in the original's exact order:
 *   timers → hazards → platforms → rope timers → rope projectile →
 *   gravity → rope constrain → player move → camera.
 */
window.ASCENT = window.ASCENT || {};

ASCENT.Game = {
  STATES: null,
  state: 'menu',
  screenWidth: 0,
  screenHeight: 0,
  shaderTime: 0,
  canvas: null,

  // run/session timers
  gameTimer: 0, timerStarted: false, currentRunTime: 0,
  isFalling: false, fallStartY: 0, currentFallDistance: 0, sessionFallTime: 0,
  inGravityWell: false, gravityWellTimer: 0, meteorSpawnTimer: 0,
  debugFlying: false, fallShake: 0,
  _generated: false,

  // menu/ui state
  menuItems: [], selectedMenuItem: 0,
  optionsItems: [], selectedOptionIndex: 0,
  pauseItems: [], selectedPauseItem: 0,
  achievementsTab: 1, achievementsScroll: 0,
  menuStars: [], menuTime: 0, titlePulse: 0,
  achievementPopups: [],
  hotspots: [],          // clickable menu regions, rebuilt each menu draw

  init(w, h, canvas) {
    this.STATES = ASCENT.STATES;
    this.screenWidth = w;
    this.screenHeight = h;
    this.canvas = canvas;
    ASCENT.Save.loadAll();
    this._buildMenus();
    this._initMenuStars();
    this.state = this.STATES.MENU;
  },

  resize(w, h) {
    this.screenWidth = w;
    this.screenHeight = h;
    this._initMenuStars();
  },

  _initMenuStars() {
    this.menuStars = [];
    for (let i = 0; i < 300; i++) {
      this.menuStars.push({
        x: Math.random() * this.screenWidth, y: Math.random() * this.screenHeight,
        size: Math.random() * 2, brightness: 0.3 + Math.random() * 0.7,
        twinkleSpeed: 0.5 + Math.random() * 2,
      });
    }
  },

  _buildMenus() {
    const S = this.STATES, G = this;
    this.menuItems = [
      { text: 'LAUNCH GAME', action: () => G.startGame() },
      { text: 'OPTIONS', action: () => { G.selectedOptionIndex = 0; G.state = S.OPTIONS; } },
      { text: 'BEST TIMES', action: () => { G.state = S.BEST_TIMES; } },
      { text: 'STATS & ACHIEVEMENTS', action: () => { G.achievementsTab = 1; G.achievementsScroll = 0; G.state = S.ACHIEVEMENTS; } },
      { text: 'EXIT TO EARTH', action: () => { window.location.href = '../index.html'; } },
    ];
    this.optionsItems = [
      { type: 'toggle', key: 'soundEnabled', text: 'SOUND', on: 'ON', off: 'OFF' },
      { type: 'cycle', key: 'controlScheme', text: 'CONTROLS', values: ['KEYBOARD + MOUSE', 'CONTROLLER'] },
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
    this.meteorSpawnTimer = 0; this.fallShake = 0;
    if (!this._generated) {
      ASCENT.Level.generate(this);
      this._generated = true;
    } else {
      const p = this.player, r = this.rope;
      p.x = p.startX; p.y = p.startY; p.vx = 0; p.vy = 0;
      p.hasDoubleJump = true; p.ropeGraceTimer = 0; p.boosting = false; p.onGround = false;
      ASCENT.Rope.detach(this);
      r.shooting = false; r.cooldownTimer = 0; r.failedRopeSegments = []; r.failedRopeTimer = 0;
      this.goal.reached = false; this.goal.timeSaved = false;
    }
    this.debugFlying = false;
  },

  returnToMenu() {
    this.state = this.STATES.MENU;
    this.selectedMenuItem = 0;
    ASCENT.Save.saveStats();
    ASCENT.Audio.setTension(false, 0);
  },

  resetGame() {
    const p = this.player, r = this.rope;
    if (!p) return;
    p.x = p.startX; p.y = p.startY; p.vx = 0; p.vy = 0;
    p.hasDoubleJump = true; p.ropeGraceTimer = 0; p.boosting = false;
    ASCENT.Rope.detach(this);
    r.shooting = false; r.cooldownTimer = 0; r.failedRopeSegments = []; r.failedRopeTimer = 0;
    this.goal.reached = false; this.goal.timeSaved = false;
    this.debugFlying = false;
    this.gameTimer = 0; this.timerStarted = false; this.currentRunTime = 0;
    this.isFalling = false; this.fallStartY = 0; this.currentFallDistance = 0;
    this.inGravityWell = false; this.gravityWellTimer = 0;
    ASCENT.Audio.setTension(false, 0);
  },

  progress() {
    const p = this.player;
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
    if (this.progress() >= 0.5) this.unlockAchievement('first_50');
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
    if (this.state === S.PLAYING) this.updateGame(dt);
    else { this.menuTime += dt; this.titlePulse = Math.sin(this.menuTime * 2) * 0.3 + 0.7; }
  },

  updateGame(dt) {
    const C = ASCENT.CONFIG, p = this.player, rope = this.rope;

    ASCENT.Save.stats.timePlayed += dt;
    if (!this.timerStarted && (p.vx !== 0 || p.vy !== 0 || rope.active)) this.timerStarted = true;
    if (this.timerStarted && !this.goal.reached) { this.gameTimer += dt; this.currentRunTime = this.gameTimer; }
    if (Math.floor(this.gameTimer / C.STATS_SAVE_INTERVAL) !== Math.floor((this.gameTimer - dt) / C.STATS_SAVE_INTERVAL)) {
      ASCENT.Save.saveStats();
    }
    if (this.goal.reached && this.currentRunTime > 0 && !this.goal.timeSaved) {
      ASCENT.Save.addBestTime(this.currentRunTime);
      this.goal.timeSaved = true;
    }

    // constellation sparkle (cosmetic)
    this.constellationSparkleTimer += dt;
    if (this.constellationSparkleTimer >= this.nextSparkleTime) {
      this.sparklingConstellation = Math.floor(Math.random() * this.constellations.length);
      this.sparklingStar = Math.floor(Math.random() * this.constellations[this.sparklingConstellation].stars.length);
      this.constellationSparkleTimer = 0;
      this.nextSparkleTime = 3 + Math.random() * 2;
    }

    const progress = this.progress();

    if (ASCENT.Save.options.debugMode && this.debugFlying) {
      p.vy = 0;
      const fly = C.GRAVITY ? 800 : 800;   // FLY_SPEED
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

      if (Math.abs(p.vy) < 100 && progress >= 0.5) this.unlockAchievement('first_50');
      this.checkAchievements();

      ASCENT.Level.updateMeteors(this, dt, progress);
      ASCENT.Level.updateSolarFlares(this, dt);
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

    // camera
    const cam = this.camera;
    cam.targetX = Math.max(0, Math.min(this.levelWidth - this.screenWidth, p.x - this.screenWidth / 2));
    cam.targetY = Math.max(0, Math.min(this.levelHeight - this.screenHeight, p.y - this.screenHeight * C.CAMERA_Y_OFFSET));
    cam.x += (cam.targetX - cam.x) * cam.smoothing;
    cam.y += (cam.targetY - cam.y) * cam.smoothing;
  },

  draw() {
    ASCENT.Render.draw(this);
  },

  // ---- input ----
  keypressed(name) {
    const S = this.STATES;
    switch (this.state) {
      case S.MENU: this._navMenu(name, this.menuItems, 'selectedMenuItem', () => { window.location.href = '../index.html'; }); break;
      case S.PLAYING: this._gameKey(name); break;
      case S.OPTIONS: this._navMenu(name, this.optionsItems, 'selectedOptionIndex', () => { ASCENT.Save.saveOptions(); this.state = S.MENU; }, (i) => this._toggleOption(i)); break;
      case S.PAUSED: this._navMenu(name, this.pauseItems, 'selectedPauseItem', () => { this.state = S.PLAYING; }); break;
      case S.BEST_TIMES: if (name === 'escape') this.state = S.MENU; break;
      case S.ACHIEVEMENTS: this._achKey(name); break;
    }
  },

  _navMenu(name, items, sel, onEscape, onActivate) {
    if (name === 'up') { this[sel] = (this[sel] - 1 + items.length) % items.length; }
    else if (name === 'down') { this[sel] = (this[sel] + 1) % items.length; }
    else if (name === 'return' || name === 'space') {
      if (onActivate) onActivate(this[sel]);
      else items[this[sel]].action();
    } else if (name === 'escape') { onEscape(); }
  },

  _gameKey(name) {
    if (this.goal.reached && (name === 'escape' || name === 'space' || name === 'return')) { this.returnToMenu(); return; }
    if (name === 'escape') { this.state = this.STATES.PAUSED; this.selectedPauseItem = 0; }
    else if (name === 'f11') this.toggleFullscreen();
    else if (name === '=' || name === 'kp+') ASCENT.Audio.setMasterVolume(ASCENT.Audio.master + 0.1);
    else if (name === '-' || name === 'kp-') ASCENT.Audio.setMasterVolume(ASCENT.Audio.master - 0.1);
    else if (name === 'space') ASCENT.Player.jump(this);
    else if (name === 'r') this.resetGame();
    else if (name === 'f' && ASCENT.Save.options.debugMode) { this.debugFlying = !this.debugFlying; if (this.debugFlying) this.player.vy = 0; }
    else if (name === 'g' && ASCENT.Save.options.debugMode) { this.player.x = this.goal.x; this.player.y = this.goal.y - 50; this.player.vx = 0; this.player.vy = 0; }
  },

  _achKey(name) {
    const S = this.STATES;
    if (name === 'escape') this.state = S.MENU;
    else if (name === 'left') { this.achievementsTab = 1; this.achievementsScroll = 0; }
    else if (name === 'right') { this.achievementsTab = 2; this.achievementsScroll = 0; }
    else if (name === 'up' && this.achievementsTab === 2) this.achievementsScroll = Math.max(0, this.achievementsScroll - 1);
    else if (name === 'down' && this.achievementsTab === 2) this.achievementsScroll = Math.min(Math.max(0, ASCENT.ACHIEVEMENTS.length - 8), this.achievementsScroll + 1);
    else if (name === 'r') { if (window.confirm('Reset ALL statistics and achievements?')) ASCENT.Save.resetStats(); }
  },

  _toggleOption(i) {
    const it = this.optionsItems[i];
    if (it.type === 'toggle') {
      ASCENT.Save.options[it.key] = !ASCENT.Save.options[it.key];
      if (it.key === 'soundEnabled') { ASCENT.Audio.updateMusicVolume(); if (ASCENT.Save.options.soundEnabled) ASCENT.Audio.music.play().catch(()=>{}); else ASCENT.Audio.music.pause(); }
    } else if (it.type === 'cycle') {
      if (it.key === 'controlScheme') {
        ASCENT.Save.options.controlScheme = ASCENT.Save.options.controlScheme === 'keyboard' ? 'controller' : 'keyboard';
      }
    } else if (it.type === 'action') { it.action(); }
  },

  mousemoved(x, y) {
    const S = this.STATES;
    if (this.state === S.PLAYING && ASCENT.Save.options.controlScheme === 'keyboard') {
      const wx = x + this.camera.x, wy = y + this.camera.y;
      this.aim.angle = Math.atan2(wy - this.player.y, wx - this.player.x);
      this.aim.visible = true;
    } else {
      // menu hover highlight
      const hit = this._hotspotAt(x, y);
      if (hit && hit.sel !== undefined && hit.selKey) this[hit.selKey] = hit.sel;
    }
  },

  mousepressed(button) {
    const S = this.STATES;
    if (this.state === S.PLAYING) {
      if (button === 1 && ASCENT.Save.options.controlScheme === 'keyboard') this._mouseRope();
    } else {
      const hit = this._hotspotAt(ASCENT.Input.mouseX, ASCENT.Input.mouseY);
      if (hit && hit.action) hit.action();
    }
  },

  _hotspotAt(x, y) {
    for (const h of this.hotspots) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
    }
    return null;
  },

  _mouseRope() {
    const r = this.rope;
    if (r.active) {
      ASCENT.Rope.release(this);
    } else if (!r.shooting && r.cooldownTimer <= 0 && this.aim.visible) {
      ASCENT.Rope.shoot(this, this.aim.angle);
    }
  },

  gamepadpressed(name) {
    const S = this.STATES;
    if (this.state === S.MENU) { if (name === 'dpup') this.keypressed('up'); else if (name === 'dpdown') this.keypressed('down'); else if (name === 'a') this.menuItems[this.selectedMenuItem].action(); }
    else if (this.state === S.PLAYING) this._gameGamepad(name);
    else if (this.state === S.PAUSED) { if (name === 'dpup') this.keypressed('up'); else if (name === 'dpdown') this.keypressed('down'); else if (name === 'a') this.pauseItems[this.selectedPauseItem].action(); else if (name === 'b' || name === 'start') this.state = S.PLAYING; }
    else if (this.state === S.OPTIONS) { if (name === 'dpup') this.keypressed('up'); else if (name === 'dpdown') this.keypressed('down'); else if (name === 'a') this._toggleOption(this.selectedOptionIndex); else if (name === 'b' || name === 'start') { ASCENT.Save.saveOptions(); this.state = S.MENU; } }
    else if (name === 'b') this.state = S.MENU;
  },

  _gameGamepad(name) {
    const r = this.rope;
    if (name === 'start') { this.state = this.STATES.PAUSED; this.selectedPauseItem = 0; }
    else if (name === 'a') {
      if (r.active) ASCENT.Rope.release(this);
      else if (!r.shooting && r.cooldownTimer <= 0 && this.aim.visible) ASCENT.Rope.shoot(this, this.aim.angle);
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
