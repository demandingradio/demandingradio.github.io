/*
 * LEVEL — world generation + per-frame world updates.
 * ===================================================
 * Ports the original initGame() level builder (220 platforms in 5 difficulty
 * bands, wind zones, gravity wells, solar flares, starfield, constellations)
 * and the hazard/platform update logic from updateGame().
 *
 * Everything reads/writes the shared game object `g` (ASCENT.Game).
 */
window.ASCENT = window.ASCENT || {};

(function () {
  const rf = () => Math.random();                                   // float [0,1)
  const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1)); // int [a,b] like love.math.random

  ASCENT.Level = {

    generate(g) {
      const C = ASCENT.CONFIG;
      const lw = g.levelWidth = g.screenWidth * C.LEVEL_WIDTH_MULT;
      const lh = g.levelHeight = g.screenHeight * C.LEVEL_HEIGHT_MULT;

      // Physics globals (kept on g, ported from initGame).
      g.gravity = C.GRAVITY;
      g.moveSpeed = C.MOVE_SPEED;
      g.jumpPower = C.JUMP_POWER;
      g.friction = C.FRICTION;
      g.airFriction = C.AIR_FRICTION;

      g.player = {
        x: lw / 4, y: lh - 150, vx: 0, vy: 0, radius: C.PLAYER_RADIUS,
        onGround: false, hasDoubleJump: true, ropeGraceTimer: 0,
        startX: lw / 4, startY: lh - 150, boosting: false,
      };

      g.ground = { y: lh - C.GROUND_HEIGHT, height: C.GROUND_HEIGHT };

      // ---- platforms ----
      const aw = lh - 200;            // vertical span platforms are spread over
      const count = C.PLATFORM_COUNT; // 220
      g.platforms = [];
      for (let i = 1; i <= count; i++) {
        const E = (i - 1) / (count - 1);          // 0 (bottom) → 1 (top) progress band
        const y = lh - 150 - E * aw;
        let width, moving, mSpeed, mAmp, type = 'normal';

        if (E < 0.3) {
          width = 200 + ri(-30, 30); moving = rf() > 0.8;
          mSpeed = moving ? 90 + rf() * 60 : 0; mAmp = moving ? 50 + rf() * 50 : 0;
        } else if (E < 0.5) {
          width = 150 + ri(-20, 20); moving = rf() > 0.5;
          mSpeed = moving ? 150 + rf() * 90 : 0; mAmp = moving ? 100 + rf() * 100 : 0;
          if (rf() > 0.7) type = 'rotating';
        } else if (E < 0.7) {
          width = 100 + ri(-15, 15); moving = rf() > 0.2;
          mSpeed = moving ? 210 + rf() * 120 : 0; mAmp = moving ? 150 + rf() * 150 : 0;
          if (E >= 0.65 && rf() > 0.6) type = 'crumbling';
        } else if (E < 0.9) {
          width = 60 + ri(-10, 10); moving = true;
          mSpeed = 270 + rf() * 180; mAmp = 200 + rf() * 200;
          if (rf() > 0.5) type = 'crumbling';
        } else {
          width = 50 + ri(-10, 10); moving = true;
          mSpeed = 300 + rf() * 200; mAmp = 250 + rf() * 250;
          if (rf() > 0.5) type = 'disappearing';
        }

        let x;
        if (i % 3 === 0) x = lw / 2 + ri(-lw / 3, lw / 3);
        else if (i % 3 === 1) x = lw / 4 + ri(-lw / 6, lw / 6);
        else x = 3 * lw / 4 + ri(-lw / 6, lw / 6);
        x = Math.max(width / 2, Math.min(lw - width / 2, x));

        const angle = rf() > 0.9 ? (rf() - 0.5) * 0.4 : 0;

        const p = {
          x, y, width, height: 10, angle, moving, baseX: x,
          moveSpeed: mSpeed, moveAmplitude: mAmp, moveTime: rf() * Math.PI * 2, type,
        };
        if (type === 'rotating') {
          p.rotationSpeed = (0.5 + rf() * 1.5) * (rf() > 0.5 ? 1 : -1);
        } else if (type === 'crumbling') {
          p.crumbleTimer = 0; p.crumbling = false; p.crumbled = false;
          p.crumbleDelay = C.PLATFORM_CRUMBLE_DELAY; p.debris = []; p.pulseTimer = 0;
        } else if (type === 'disappearing') {
          p.phaseTimer = rf() * 4; p.visibleDuration = C.PLATFORM_DISAPPEAR_VISIBLE;
          p.invisibleDuration = C.PLATFORM_DISAPPEAR_INVISIBLE; p.visible = true; p.opacity = 1.0;
        }
        g.platforms.push(p);
      }

      const spacing = aw / count;

      // ---- hazards ----
      g.windZones = [];
      for (let i = 0; i < C.WIND_ZONE_COUNT; i++) {
        const E = 0.3 + rf() * 0.3;
        g.windZones.push({
          x: rf() * lw, y: lh - 150 - E * aw,
          width: 400 + rf() * 200, height: 200 + rf() * 100,
          strength: C.WIND_BASE_STRENGTH + rf() * 1200,
          direction: rf() > 0.5 ? 1 : -1, particles: [],
        });
      }

      g.gravityWells = [];
      for (let i = 0; i < C.GRAVITY_WELL_COUNT; i++) {
        const E = 0.5 + rf() * 0.2;
        g.gravityWells.push({
          x: rf() * lw, y: lh - 150 - E * aw,
          radius: 150 + rf() * 100,
          strength: C.GRAVITY_WELL_BASE_STRENGTH + rf() * 1600, rotation: 0,
        });
      }

      g.solarFlares = [];
      for (let i = 0; i < C.SOLAR_FLARE_COUNT; i++) {
        const E = 0.8 + rf() * 0.15;
        g.solarFlares.push({
          y: lh - 150 - E * aw, x: 0, width: lw, height: 30,
          speed: 200 + rf() * 150, direction: rf() > 0.5 ? 1 : -1,
          warningTime: C.SOLAR_FLARE_WARNING_TIME, activeTime: 0, state: 'idle', timer: rf() * 5,
        });
      }

      g.meteors = [];
      g.meteorSpawnTimer = 0;

      g.rope = {
        active: false, x: 0, y: 0, length: 0,
        maxLength: spacing * C.ROPE_LENGTH_MULTIPLIER, minLength: C.ROPE_MIN_LENGTH,
        angle: 0, shootSpeed: C.ROPE_SHOOT_SPEED, retractSpeed: C.ROPE_RETRACT_SPEED,
        attachedPlatform: null, attachOffsetX: 0, attachOffsetY: 0,
        shooting: false, shootX: 0, shootY: 0, shootDX: 0, shootDY: 0, shootDistance: 0,
        cooldownTimer: 0, cooldownDuration: C.ROPE_COOLDOWN_DURATION,
        failedRopeSegments: [], failedRopeTimer: 0, failedRopeMaxTime: C.ROPE_FAILED_MAX_TIME,
      };

      g.aim = { angle: 0, visible: false, length: 100 };
      g.goal = { x: lw / 2, y: 100, radius: 40, reached: false, timeSaved: false };
      g.camera = { x: 0, y: 0, targetX: 0, targetY: 0, smoothing: C.CAMERA_SMOOTHING };

      // ---- starfield ----
      g.stars = [];
      const starCount = ri(1200, 1500);
      for (let i = 0; i < starCount; i++) {
        let color = [1, 1, 1];
        const w = rf();
        if (w < 0.1) color = [0.8, 0.9, 1.0];
        else if (w < 0.2) color = [1.0, 1.0, 0.8];
        g.stars.push({
          x: rf() * lw, y: rf() * lh, size: 0.5 + rf() * 2,
          brightness: 0.5 + rf() * 0.5, twinkleSpeed: 1 + rf() * 3,
          twinklePhase: rf() * Math.PI * 2, color,
        });
      }

      g.constellations = this._constellations(lw, lh);
      g.constellationSparkleTimer = 0;
      g.nextSparkleTime = 3 + rf() * 2;
      g.sparklingConstellation = -1;
      g.sparklingStar = -1;
    },

    _constellations(lw, lh) {
      return [
        { name: 'Canis Major', y: lh * 0.95, x: lw * 0.3,
          stars: [{x:0,y:0,brightness:1.0,size:5},{x:-30,y:-40,brightness:0.8,size:4},{x:-60,y:-20,brightness:0.7,size:3},{x:40,y:-30,brightness:0.7,size:3},{x:20,y:30,brightness:0.6,size:3},{x:-20,y:40,brightness:0.6,size:3}],
          lines: [[1,2],[2,3],[1,4],[1,5],[5,6]] },
        { name: 'Taurus', y: lh * 0.9, x: lw * 0.7,
          stars: [{x:0,y:0,brightness:0.9,size:4},{x:-40,y:-20,brightness:0.7,size:3},{x:-30,y:20,brightness:0.7,size:3},{x:50,y:-40,brightness:0.8,size:3},{x:60,y:-20,brightness:0.7,size:3},{x:70,y:0,brightness:0.7,size:3}],
          lines: [[1,2],[1,3],[1,4],[4,5],[5,6]] },
        { name: 'Leo', y: lh * 0.85, x: lw * 0.5,
          stars: [{x:0,y:0,brightness:0.9,size:4},{x:40,y:-20,brightness:0.7,size:3},{x:60,y:0,brightness:0.7,size:3},{x:40,y:30,brightness:0.7,size:3},{x:0,y:40,brightness:0.7,size:3},{x:-30,y:20,brightness:0.8,size:3},{x:-40,y:-10,brightness:0.7,size:3}],
          lines: [[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,1]] },
        { name: 'Orion', y: lh * 0.05, x: lw * 0.5,
          stars: [{x:-30,y:-40,brightness:1.0,size:5},{x:30,y:-40,brightness:0.9,size:4},{x:-20,y:0,brightness:0.8,size:3},{x:0,y:0,brightness:0.8,size:3},{x:20,y:0,brightness:0.8,size:3},{x:-25,y:40,brightness:0.9,size:4},{x:25,y:40,brightness:1.0,size:5}],
          lines: [[1,3],[3,6],[2,5],[5,7],[3,4],[4,5]] },
      ];
    },

    // ---- meteors (spawn + move + rope-cut) ----
    updateMeteors(g, dt, progress) {
      const C = ASCENT.CONFIG, p = g.player, rope = g.rope;
      if (progress >= C.METEOR_SPAWN_PROGRESS) {
        g.meteorSpawnTimer += dt;
        const rate = Math.max(0.5, 2 - progress * 1.5);
        if (g.meteorSpawnTimer >= rate) {
          g.meteorSpawnTimer = 0;
          const fromLeft = rf() > 0.5;
          const sx = fromLeft ? -50 : g.levelWidth + 50;
          const sy = p.y - g.screenHeight / 2 + rf() * g.screenHeight;
          let ang = fromLeft ? Math.PI / 6 : Math.PI - Math.PI / 6;
          ang += (rf() - 0.5) * 0.3;
          const speed = C.METEOR_BASE_SPEED + progress * 200;
          g.meteors.push({ x: sx, y: sy, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, radius: 15, trail: [] });
          ASCENT.Audio.play('meteorWhoosh', 0.4);
        }
      }
      for (let i = g.meteors.length - 1; i >= 0; i--) {
        const m = g.meteors[i];
        m.x += m.vx * dt; m.y += m.vy * dt;
        m.trail.push({ x: m.x, y: m.y, life: 0.5 });
        if (m.trail.length > 20) m.trail.shift();
        for (let t = m.trail.length - 1; t >= 0; t--) {
          m.trail[t].life -= dt;
          if (m.trail[t].life <= 0) m.trail.splice(t, 1);
        }
        if (rope.active) {
          const bg = Math.sqrt((rope.x - p.x) ** 2 + (rope.y - p.y) ** 2) || 1;
          const bh = (rope.x - p.x) / bg, bi = (rope.y - p.y) / bg;
          const proj = Math.max(0, Math.min(1, ((m.x - p.x) * bh + (m.y - p.y) * bi) / bg));
          const cx = p.x + proj * (rope.x - p.x), cy = p.y + proj * (rope.y - p.y);
          if (Math.sqrt((m.x - cx) ** 2 + (m.y - cy) ** 2) < m.radius + C.METEOR_HIT_RADIUS_PAD) {
            ASCENT.Rope.detach(g);
            ASCENT.Game.unlockAchievement('meteor_cut');
            rope.failedRopeSegments = [];
            for (let s = 1; s <= 15; s++) {
              const f = s / 15;
              rope.failedRopeSegments.push({
                x: p.x + (cx - p.x) * f, y: p.y + (cy - p.y) * f,
                vx: (rf() - 0.5) * 200 + m.vx * 0.3, vy: -50 + rf() * 100 + m.vy * 0.3,
              });
            }
            rope.failedRopeTimer = rope.failedRopeMaxTime;
            ASCENT.Audio.play('ropeSnap', 1.2, 0.8);
          }
        }
        if (m.x < -200 || m.x > g.levelWidth + 200 ||
            m.y < g.camera.y - 200 || m.y > g.camera.y + g.screenHeight + 200) {
          g.meteors.splice(i, 1);
        }
      }
    },

    // ---- solar flares (idle → warning → active sweep) ----
    updateSolarFlares(g, dt) {
      const p = g.player;
      for (const f of g.solarFlares) {
        f.timer += dt;
        if (f.state === 'idle' && f.timer >= 5) {
          f.state = 'warning'; f.timer = 0; f.x = f.direction > 0 ? -50 : g.levelWidth + 50;
        } else if (f.state === 'warning' && f.timer >= f.warningTime) {
          f.state = 'active'; f.timer = 0;
        } else if (f.state === 'active') {
          f.x += f.speed * f.direction * dt;
          if (p.y > f.y - f.height / 2 && p.y < f.y + f.height / 2) {
            ASCENT.Game.resetGame();
            ASCENT.Audio.play('landing', 1.0, 0.5);
          }
          if ((f.direction > 0 && f.x > g.levelWidth + 100) || (f.direction < 0 && f.x < -100)) {
            f.state = 'idle'; f.timer = 0; f.direction = -f.direction;
          }
        }
      }
    },

    // ---- wind zones (push + drifting particles) ----
    updateWind(g, dt) {
      const p = g.player;
      for (const z of g.windZones) {
        if (p.x > z.x - z.width / 2 && p.x < z.x + z.width / 2 &&
            p.y > z.y - z.height / 2 && p.y < z.y + z.height / 2) {
          p.vx += z.strength * z.direction * dt;
        }
        for (let k = 1; k <= 3; k++) {
          if (rf() < 0.8) {
            const span = z.height + 200;
            const py = z.y - span / 2 + rf() * span;
            const u = (py - z.y) / (z.height / 2);
            const prob = Math.exp(-u * u * 0.5);
            if (rf() < prob) {
              const sx = z.direction > 0
                ? z.x - z.width / 2 - 150 - rf() * 100
                : z.x + z.width / 2 + 150 + rf() * 100;
              z.particles.push({
                x: sx, y: py, life: 2.0, layer: k,
                length: 10 + rf() * 30, speed: (0.5 + k * 0.3) * (250 + rf() * 250),
                opacity: 0.2 + k * 0.15, waveOffset: rf() * Math.PI * 2, waveAmp: 1 + rf() * 2,
              });
            }
          }
        }
        for (let i = z.particles.length - 1; i >= 0; i--) {
          const w = z.particles[i];
          w.x += w.speed * z.direction * dt;
          w.y += Math.sin(w.x * 0.01 + w.waveOffset) * w.waveAmp * dt * 0.3;
          w.life -= dt;
          if (w.life <= 0 ||
              (z.direction > 0 && w.x > z.x + z.width / 2 + 250) ||
              (z.direction < 0 && w.x < z.x - z.width / 2 - 250)) {
            z.particles.splice(i, 1);
          }
        }
      }
    },

    // ---- gravity wells (radial pull + trap timer) ----
    updateGravityWells(g, dt) {
      const p = g.player;
      g.inGravityWell = false;
      for (const w of g.gravityWells) {
        const dx = w.x - p.x, dy = w.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d < w.radius * 2) {
          g.inGravityWell = true;
          const pull = w.strength * (1 - d / (w.radius * 2));
          p.vx += dx / d * pull * dt;
          p.vy += dy / d * pull * dt;
        }
        w.rotation += dt;
      }
      if (g.inGravityWell) {
        g.gravityWellTimer += dt;
        ASCENT.Save.stats.gravityWellTime += dt;
        if (g.gravityWellTimer >= 2.0) ASCENT.Game.unlockAchievement('gravity_stuck');
      } else {
        g.gravityWellTimer = 0;
      }
    },

    // ---- platforms (moving / rotating / crumbling / disappearing) ----
    updatePlatforms(g, dt) {
      const rope = g.rope, lw = g.levelWidth;
      for (const a of g.platforms) {
        if (a.moving) {
          a.moveTime += dt;
          a.x = a.baseX + Math.sin(a.moveTime * a.moveSpeed / 100) * a.moveAmplitude;
          a.x = Math.max(a.width / 2, Math.min(lw - a.width / 2, a.x));
        }
        if (a.type === 'rotating') {
          a.angle += a.rotationSpeed * dt;
        } else if (a.type === 'crumbling') {
          a.pulseTimer += dt;
          if (a.crumbling && !a.crumbled) {
            a.crumbleTimer += dt;
            if (rf() < 0.3) {
              a.debris.push({ x: a.x - a.width / 2 + rf() * a.width, y: a.y + a.height / 2,
                vx: (rf() - 0.5) * 100, vy: 50 + rf() * 100, life: 1.0, size: 2 + rf() * 3 });
            }
            this._updateDebris(a, g, dt);
            if (a.crumbleTimer >= a.crumbleDelay) {
              a.crumbled = true;
              for (let s = 0; s < 15; s++) {
                a.debris.push({ x: a.x - a.width / 2 + rf() * a.width, y: a.y - a.height / 2 + rf() * a.height,
                  vx: (rf() - 0.5) * 200, vy: -100 + rf() * 200, life: 1.5, size: 3 + rf() * 4 });
              }
              ASCENT.Audio.play('crumble', 0.8);
              if (rope.attachedPlatform === a) ASCENT.Rope.detach(g);
            }
          } else {
            this._updateDebris(a, g, dt);
          }
        } else if (a.type === 'disappearing') {
          a.phaseTimer += dt;
          const cycle = a.visibleDuration + a.invisibleDuration;
          const ph = a.phaseTimer % cycle;
          if (ph < a.visibleDuration) { a.visible = true; a.opacity = 1.0; }
          else {
            a.visible = false; a.opacity = 0.3;
            if (rope.attachedPlatform === a) {
              ASCENT.Rope.detach(g);
              g.player.hasDoubleJump = true;
              g.player.ropeGraceTimer = ASCENT.CONFIG.ROPE_GRACE_PERIOD;
            }
          }
        }
      }
    },

    _updateDebris(a, g, dt) {
      for (let i = a.debris.length - 1; i >= 0; i--) {
        const d = a.debris[i];
        d.vy += g.gravity * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt;
        if (d.life <= 0) a.debris.splice(i, 1);
      }
    },
  };
})();
