/*
 * GAME
 * ====
 * Owns the clock, camera, renderer and the active session (batting or
 * bowling). The clock is real seconds that stop while paused; slow-motion
 * and hit-stop scale how fast it advances.
 */
(function () {
  const CLLM = window.CLLM;
  const { V, M, Camera, Renderer, Input, Audio, UI, Save } = CLLM;

  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.cam = new Camera();
      this.renderer = new Renderer(canvas, this.cam);
      this.input = Input;
      this.ui = UI;
      this.save = Save.load();
      this.clock = 0;
      this.slowmo = 1;
      this._stop = 0; this._slowT = 0; this._slowScale = 1;
      this.mode = null;          // 'bat' | 'bowl' | null (menu)
      this.session = null;
      this.paused = false;
      this.lastPerf = performance.now();
      this.camMode = this.save.data.settings.cam || 'broadcast';
      this.idle = null;          // attract-mode scene behind the menus
      Input.attach(canvas);
      UI.init(this);
      Audio.setMuted(!!this.save.data.settings.muted);
      window.addEventListener('resize', () => {
        this.renderer.resize();
        // a match's follow cam re-fits its crop now (it only updates while unpaused)
        const s = this.session;
        if (s && s.camOverride && s.camOverride() && s.liveCam) s.liveCam.update(0);
        this._setCamera();
      });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode && !this.paused) this.pause(); });
      this._setCamera();
      requestAnimationFrame((t) => this._loop(t));
    }

    // ---- camera -------------------------------------------------------------
    _setCamera() {
      const s = this.session;
      if (s && s.camOverride && s.camOverride()) return;      // a match's live camera is following the ball
      const h = s && s.h ? s.h : 1;
      this.cam.hfov = null;
      this.cam.zoom = 1; this.cam.ox = 0; this.cam.oy = 0; this.cam.dolly = 0;
      if (this.mode === 'bowl') {
        this.cam.set(V.v(0.55, 4.0, 40.5), V.v(-0.05, 0.6, 4), 14.5);
      } else if (this.mode === 'bat' && s && s.physical) {
        // Behind the batter, looking down the pitch: the ball comes at you.
        // Framed so the whole hitting zone (ground to head height) sits well
        // inside the screen, with room below it for a finger. On a phone,
        // fit the width instead of widening the view (keeps the ball big).
        this.cam.hfov = 40;
        const dz = s.phys ? s.phys.camShift : 0;
        if (s.phys) s.phys.camApplied = dz;
        this.cam.dolly = dz;
        this.cam.set(V.v(0.25 * h, 1.5, -1.7 + dz), V.v(-0.05 * h, 0.1, 10 + dz), 48);
      } else if (this.mode === 'bat' && this.camMode === 'eye') {
        this.cam.set(V.v(0.1 * h, 1.58, 0.55), V.v(-0.05 * h, 0.95, 13), 46);
      } else {
        // Broadcast: behind the bowler's arm, nudged toward the off side
        this.cam.set(V.v(-0.25 * h, 3.3, 33), V.v(-0.08 * h, 0.85, 2), 13.5);
      }
    }

    toggleCam() {
      if (this.mode !== 'bat') return;
      if (this.session && this.session.physical) { this.ui.toast('The camera stays behind you with the physical bat'); return; }
      this.camMode = this.camMode === 'eye' ? 'broadcast' : 'eye';
      this.save.data.settings.cam = this.camMode;
      this.save.write();
      this._setCamera();
      this.ui.toast(this.camMode === 'eye' ? "Camera: batter's eye" : 'Camera: broadcast');
    }

    // ---- sessions -----------------------------------------------------------
    startBatting(opts) {
      CLLM.World.scene = 'nets';
      this.match = null;
      this.mode = 'bat';
      this.session = new CLLM.BattingSession(this, opts);
      this._setCamera();
      this.ui.showHud('bat');
      document.getElementById('bowlerTag').innerHTML = `Net bowler: <b>${opts.bowler === 'mixed' ? 'Mixed' : CLLM.Deliveries.TYPES[opts.bowler].name}</b>`;
      this.ui.tips('bat');
      this.ui.score(this.session);
      this.paused = false;
      Input.clear();
    }

    startBowling(opts) {
      CLLM.World.scene = 'nets';
      this.match = null;
      this.mode = 'bowl';
      this.session = new CLLM.BowlingSession(this, opts);
      this._setCamera();
      this.ui.showHud('bowl');
      this.session.refreshHud();
      this.ui.tips('bowl');
      this.paused = false;
      Input.clear();
    }

    // A match: the same batting / bowling, on a ground with a field
    startMatchBatting(opts) {
      if (this.session && this.session.live && this.session._liveEnd) this.session._liveEnd();   // (never left running from the last one)
      CLLM.World.scene = 'ground';
      this.mode = 'bat';
      this.session = new CLLM.MatchBatting(this, opts);
      this._setCamera();
      this.ui.showHud('bat', true);
      this.ui.tips('bat');
      this.paused = false;
      Input.clear();
    }

    startMatchBowling(opts) {
      if (this.session && this.session.live && this.session._liveEnd) this.session._liveEnd();
      CLLM.World.scene = 'ground';
      this.mode = 'bowl';
      this.session = new CLLM.MatchBowling(this, opts);
      this._setCamera();
      this.ui.showHud('bowl', true);
      this.session.refreshHud();
      this.paused = false;
      Input.clear();
    }

    quitToMenu() {
      if (this.session && this.session.onPause) this.session.onPause();
      if (this.session && this.session._liveEnd && this.session.live) this.session._liveEnd();
      CLLM.World.scene = 'nets';
      this.match = null;
      this.mode = null;
      this.session = null;
      this.paused = false;
      this.ui.showHud(null);
      this._setCamera();
    }

    pause() {
      if (!this.mode) return;
      this.paused = true;
      if (this.session && this.session.onPause) this.session.onPause();
      if (this.onPause) this.onPause();
    }
    resume() {
      this.paused = false;
      Input.queue = [];
      if (this.session && this.session.onResume) this.session.onResume();
      this.lastPerf = performance.now();
    }

    // Game-clock seconds -> performance.now() ms (within the current frame)
    perfAt(g) {
      const m = this._map;
      if (!m) return performance.now();
      if (m.dt < 1e-6) return m.p1;
      return m.p0 + ((g - m.g0) / m.dt) * (m.p1 - m.p0);
    }

    // Freeze for `stop` seconds, then run at `scale` speed for `dur` seconds.
    hitStop(stop, dur, scale) {
      this._stop = stop; this._slowT = dur; this._slowScale = scale;
    }

    // ---- main loop ------------------------------------------------------------
    _loop(perf) {
      requestAnimationFrame((t) => this._loop(t));
      let dtReal = (perf - this.lastPerf) / 1000;
      this.lastPerf = perf;
      if (dtReal > 0.002 && dtReal < 0.06) this.frameMs = this.frameMs ? this.frameMs + (dtReal * 1000 - this.frameMs) * 0.05 : dtReal * 1000;
      if (dtReal > 0.1) dtReal = 0.1;       // tab hiccups
      if (dtReal < 0) dtReal = 0;
      this._tick(dtReal, perf, this._prevPerf != null ? this._prevPerf : perf - dtReal * 1000);
      this._prevPerf = perf;
      this._render();
    }

    // Test hook: advance the simulation by `sec` seconds without rAF
    // (the browser freezes rAF in hidden tabs). fn(game) runs every step.
    advance(sec, fn, step = 1 / 120) {
      const n = Math.round(sec / step);
      for (let i = 0; i < n; i++) {
        if (fn && fn(this) === true) break;
        const pn = performance.now();
        this._tick(step, pn, pn - step * 1000);
      }
      this._render();
    }

    _tick(dtReal, perf, prevPerf) {
      // Input clock sync happens BEFORE advancing, so event stamps map onto
      // the clock value that was current when they fired.
      const clockBefore = this.clock;
      const rate = this.paused ? 0 : (this._stop > 0 ? 0 : this._slowT > 0 ? this._slowScale : 1);
      const p0 = prevPerf != null ? prevPerf : perf - dtReal * 1000;
      Input.sync(p0, perf, clockBefore, dtReal * rate);
      this._map = { p0, p1: perf, g0: clockBefore, dt: dtReal * rate };

      if (!this.paused) {
        // time dilation
        let rate = 1;
        if (this._stop > 0) { this._stop -= dtReal; rate = 0; }
        else if (this._slowT > 0) { this._slowT -= dtReal; rate = this._slowScale; }
        this.slowmo = rate;
        this.realTime = (this.realTime || 0) + dtReal;
        const dt = dtReal * rate;
        // Drain input with precise event times (in game-clock seconds)
        const evs = Input.drain();
        for (const ev of evs) this._handle(ev);
        this.clock += dt;
        if (this.session) {
          if (this.mode === 'bat' && Input.mouse.moved) { this.session.updateAim(Input.mouse.x, Input.mouse.y, this.cam); Input.mouse.moved = false; }
          if (this.mode === 'bowl' && Input.mouse.moved) { this.session.mouseMove(Input.mouse.x, Input.mouse.y, this.cam); Input.mouse.moved = false; }
          this.session.update(dt);
        } else {
          this._idle(dt);
        }
        Audio.ambience(dtReal);
      } else {
        Input.drain().forEach((ev) => { if (ev.type === 'keydown' && ev.key === 'escape') this.onResumeKey && this.onResumeKey(); });
      }
      this.cam.shake *= Math.pow(0.02, dtReal);
    }

    _render() {
      const scene = this.session ? this.session.scene() : this._idleScene();
      scene.overlay = (ctx, cam) => {
        if (this.mode === 'bat' && this.session) this.ui.drawBatOverlay(ctx, this.session, cam);
        if (this.mode === 'bowl' && this.session) this.session.drawOverlay(ctx, cam);
        if (this.match && this.session) this.ui.drawMatchOverlay(ctx, this.session, cam);
      };
      this.renderer.frame(scene);
      if (this.session) this.ui.drawField();
    }

    _handle(ev) {
      if (ev.type === 'keydown') {
        if (ev.key === 'escape') { if (this.mode) this.pause(); return; }
        if (ev.key === 'm') { this.toggleMute(); return; }
        if (ev.key === 'c' && this.mode === 'bat') { this.toggleCam(); return; }
      }
      if (ev.type === 'mousedown' || ev.type === 'keydown' || ev.type === 'touchstart') Audio.unlock();
      if (!this.session) return;
      const t = ev.stamp != null ? Input.toGame(ev.stamp) : this.clock;
      // A click carries its own position: aim with it before the swing is resolved
      if (this.mode === 'bat' && ev.type === 'mousedown' && ev.x != null) this.session.updateAim(ev.x, ev.y, this.cam);
      this.session.input(ev, t);
    }

    toggleMute() {
      const m = !this.save.data.settings.muted;
      this.save.data.settings.muted = m;
      this.save.write();
      Audio.setMuted(m);
      this.ui.toast(m ? 'Sound off' : 'Sound on');
      const b = document.getElementById('muteBtn');
      if (b) b.textContent = m ? '🔇' : '🔊';
    }

    // ---- attract mode behind the menus ---------------------------------------------
    _idle(dt) {
      if (!this.idle) {
        const bat = new CLLM.Figure('batter');
        const bowl = new CLLM.Figure('bowler');
        const ba = new CLLM.BatterAnim(bat);
        const bw = new CLLM.BowlerAnim(bowl, 'pace');
        const ball = new CLLM.Ball();
        this.idle = { bat, bowl, ba, bw, ball, t0: this.clock, launched: false, type: 'pace', n: 0 };
        bw.autoSchedule(this.clock + 1.0);
      }
      const I = this.idle;
      const now = this.clock;
      I.bw.pose(now);
      I.bowl.alpha = M.clamp((this.cam.depth(I.bowl.J.pel) - 1.8) / 3.5, 0, 1);
      if (!I.launched && now >= I.bw.tRelease) {
        I.launched = true;
        const spec = { type: I.type, varKey: 'stock', length: I.type === 'pace' ? M.rand(3, 7) : M.rand(1.5, 4), offLine: M.rand(0, 0.25), hand: 'R', release: I.bw.releasePoint(), quality: 0.8 };
        const plan = CLLM.Deliveries.build(spec);
        I.plan = plan;
        I.tsc = CLLM.BallPhys.timeAtZ(plan, 0) / (I.type === 'pace' ? 0.9 : 1.2);
        I.tRel = now;
        I.ball.launch(plan);
        I.ba.startBacklift(now);
        const tPlane = I.tRel + CLLM.BallPhys.timeAtZ(plan, 2.0) / I.tsc;
        I.ba.setFoot('front', now + 0.2);
        const C = CLLM.BallPhys.posAt(plan, CLLM.BallPhys.timeAtZ(plan, 2.0));
        I.hitT = tPlane;
        I.ba.playShot(CLLM.BatterAnim.makeShot('drive', C, V.norm(V.v(M.rand(-0.6, 0.3), 0, 1)), tPlane, 0.1));
      }
      if (I.launched && I.ball.mode === 'delivery') {
        I.ball.update(Math.max(0, (now - I.tRel) * I.tsc - I.ball.t));
        if (now >= I.hitT) {
          const phi = M.rand(-0.9, 0.9);
          I.ball.free(I.ball.pos, V.v(Math.sin(phi) * 14, 2 + Math.random() * 3, Math.cos(phi) * 14), 0);
        }
      } else if (I.ball.mode === 'free') I.ball.update(dt * 0.9);
      I.ba.pose(now);
      if (I.launched && now > I.bw.tEnd + 0.8) {
        I.n++;
        I.type = ['pace', 'off', 'leg'][I.n % 3];
        I.bw.setType(I.type);
        I.ba.reset(); I.ball.reset(); I.launched = false;
        I.bw.autoSchedule(now + 0.6);
      }
    }

    _idleScene() {
      const I = this.idle;
      if (!I) return { figures: [], stumps: [{ z: 0 }, { z: 20.12 }] };
      return { figures: [I.bat, I.bowl], ball: I.ball, stumps: [{ z: 0 }, { z: 20.12 }] };
    }
  }

  CLLM.Game = Game;
})();
