/*
 * RENDER — every screen drawn to the canvas.
 * ==========================================
 * Ports the original love.draw dispatch: menu, options, best times,
 * stats/achievements, gameplay (parallax starfield + world + HUD), pause
 * overlay and achievement popups. Menus also publish clickable hotspots
 * (g.hotspots) so the web build is mouse-navigable as well as keyboard.
 */
window.ASCENT = window.ASCENT || {};

(function () {
  const G = () => ASCENT.Gfx;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

  ASCENT.Render = {
    draw(g) {
      const S = ASCENT.STATES;
      switch (g.state) {
        case S.MENU: this.drawMenu(g); break;
        case S.PLAYING: this.drawGame(g); this.drawAchievementPopup(g); break;
        case S.OPTIONS: this.drawOptions(g); break;
        case S.PAUSED: this.drawGame(g); this.drawPauseOverlay(g); this.drawAchievementPopup(g); break;
        case S.BEST_TIMES: this.drawBestTimes(g); break;
        case S.ACHIEVEMENTS: this.drawAchievements(g); break;
      }
    },

    _bgStars(g) {
      const gfx = G();
      gfx.clear(0.05, 0.05, 0.08);
      for (const s of g.menuStars) {
        const tw = Math.sin(g.menuTime * s.twinkleSpeed) * 0.3 + 0.7;
        gfx.setColor(1, 1, 1, s.brightness * tw);
        gfx.circle('fill', s.x, s.y, s.size);
      }
    },

    drawMenu(g) {
      const gfx = G(), w = g.screenWidth, h = g.screenHeight;
      g.hotspots = [];
      this._bgStars(g);

      // Title with soft glow halos.
      gfx.setFont(64, true);
      const tp = g.titlePulse;
      gfx.setColor(0.5, 0.7, 1.0, 0.2 * tp); gfx.printf('COSMIC ASCENT', 0, h * 0.15 - 4, w, 'center');
      gfx.printf('COSMIC ASCENT', 0, h * 0.15 + 4, w, 'center');
      gfx.setColor(0.7, 0.85, 1.0, 0.5 * tp);
      gfx.printf('COSMIC ASCENT', -2, h * 0.15, w, 'center'); gfx.printf('COSMIC ASCENT', 2, h * 0.15, w, 'center');
      gfx.setColor(1, 1, 1, 1); gfx.printf('COSMIC ASCENT', 0, h * 0.15, w, 'center');

      gfx.setFont(22); gfx.setColor(0.7, 0.7, 0.8, 0.8);
      gfx.printf('A Space Rope Adventure', 0, h * 0.15 + 78, w, 'center');

      gfx.setFont(30);
      const top = h * 0.4;
      for (let i = 0; i < g.menuItems.length; i++) {
        const y = top + i * 60;
        const selected = i === g.selectedMenuItem;
        if (selected) {
          const pulse = Math.sin(g.menuTime * 4) * 0.2 + 0.8;
          gfx.setColor(0.5, 0.8, 1.0, 0.3 * pulse);
          gfx.printf(g.menuItems[i].text, 0, y - 2, w, 'center');
          gfx.printf(g.menuItems[i].text, 0, y + 2, w, 'center');
          gfx.setColor(1, 1, 0.8, 1);
        } else gfx.setColor(0.6, 0.6, 0.7, 0.85);
        gfx.printf(g.menuItems[i].text, 0, y, w, 'center');
        g.hotspots.push({ x: w / 2 - 260, y: y - 6, w: 520, h: 40, selKey: 'selectedMenuItem', sel: i, action: g.menuItems[i].action });
      }

      const best = ASCENT.Save.bestTime();
      if (best != null) { gfx.setFont(20); gfx.setColor(0.8, 1.0, 0.8, 0.9); gfx.printf('Best Time: ' + ASCENT.formatTime(best), 0, h - 100, w, 'center'); }
      gfx.setFont(15); gfx.setColor(0.5, 0.5, 0.6, 0.7);
      gfx.printf('Arrow keys / mouse to navigate · Enter or click to select', 0, h - 60, w, 'center');
    },

    drawOptions(g) {
      const gfx = G(), w = g.screenWidth, h = g.screenHeight;
      g.hotspots = [];
      this._bgStars(g);
      gfx.setFont(46, true); gfx.setColor(1, 1, 1); gfx.printf('OPTIONS', 0, h * 0.15, w, 'center');
      gfx.setFont(28);
      const top = h * 0.35;
      for (let i = 0; i < g.optionsItems.length; i++) {
        const it = g.optionsItems[i], y = top + i * 70;
        const selected = i === g.selectedOptionIndex;
        if (selected) { gfx.setColor(1, 1, 0.5); gfx.printf('>', w * 0.25, y, w * 0.5, 'left'); gfx.setColor(1, 1, 0.8); }
        else gfx.setColor(0.7, 0.7, 0.8);
        let label = it.text;
        if (it.type === 'toggle') label += ': ' + (ASCENT.Save.options[it.key] ? it.on : it.off);
        else if (it.type === 'cycle') label += ': ' + (ASCENT.Save.options[it.key] === 'keyboard' ? it.values[0] : it.values[1]);
        gfx.printf(label, w * 0.3, y, w * 0.4, 'left');
        g.hotspots.push({ x: w * 0.25, y: y - 6, w: w * 0.5, h: 40, selKey: 'selectedOptionIndex', sel: i, action: () => ASCENT.Game._toggleOption(i) });
      }
      gfx.setFont(15); gfx.setColor(0.6, 0.6, 0.7);
      gfx.printf('Arrow keys / click to change · Esc to go back', 0, h - 70, w, 'center');
    },

    drawBestTimes(g) {
      const gfx = G(), w = g.screenWidth, h = g.screenHeight;
      g.hotspots = [];
      this._bgStars(g);
      gfx.setFont(46, true); gfx.setColor(1, 1, 1); gfx.printf('BEST TIMES', 0, h * 0.1, w, 'center');
      gfx.setFont(20); gfx.setColor(0.7, 0.7, 0.8, 0.8); gfx.printf('Your fastest ascents to the stars', 0, h * 0.1 + 56, w, 'center');
      const top = h * 0.3, bt = ASCENT.Save.bestTimes;
      gfx.setFont(22);
      if (bt.length === 0) { gfx.setColor(0.5, 0.5, 0.6); gfx.printf('No completed runs yet. Launch the game and reach the goal!', 0, top, w, 'center'); }
      else {
        gfx.setColor(0.8, 0.9, 1.0);
        gfx.print('RANK', w * 0.3, top - 40); gfx.print('TIME', w * 0.45, top - 40); gfx.print('DATE', w * 0.65, top - 40);
        gfx.setLineWidth(2); gfx.setColor(0.5, 0.6, 0.8); gfx.line(w * 0.3, top - 12, w * 0.8, top - 12);
        for (let i = 0; i < bt.length; i++) {
          const y = top + i * 35;
          if (i === 0) { const p = 0.5 + 0.5 * Math.sin(g.menuTime * 3); gfx.setColor(1.0, 0.9, 0.3, 0.2 * p); gfx.rectangle('fill', w * 0.28, y - 5, w * 0.54, 30, 5); gfx.setColor(1.0, 0.9, 0.3); }
          else if (i === 1) gfx.setColor(0.8, 0.8, 0.9);
          else if (i === 2) gfx.setColor(0.9, 0.6, 0.4);
          else gfx.setColor(0.7, 0.7, 0.8);
          gfx.print('#' + (i + 1), w * 0.3, y);
          gfx.print(ASCENT.formatTime(bt[i].seconds), w * 0.45, y);
          gfx.setFont(18); gfx.print(bt[i].date, w * 0.65, y); gfx.setFont(22);
        }
      }
      this._backHint(g);
    },

    drawAchievements(g) {
      const gfx = G(), w = g.screenWidth, h = g.screenHeight;
      g.hotspots = [];
      this._bgStars(g);
      gfx.setFont(44, true); gfx.setColor(1, 1, 1); gfx.printf('STATS & ACHIEVEMENTS', 0, h * 0.08, w, 'center');
      gfx.setFont(26);
      const ty = h * 0.16, tabL = w * 0.35, tabR = w * 0.65;
      if (g.achievementsTab === 1) { gfx.setColor(1, 1, 0.8); gfx.rectangle('fill', tabL - 100, ty - 5, 200, 40, 5); gfx.setColor(0, 0, 0); }
      else gfx.setColor(0.5, 0.5, 0.6);
      gfx.printf('STATISTICS', tabL - 100, ty + 3, 200, 'center');
      g.hotspots.push({ x: tabL - 100, y: ty - 5, w: 200, h: 40, action: () => { g.achievementsTab = 1; g.achievementsScroll = 0; } });
      if (g.achievementsTab === 2) { gfx.setColor(1, 1, 0.8); gfx.rectangle('fill', tabR - 100, ty - 5, 200, 40, 5); gfx.setColor(0, 0, 0); }
      else gfx.setColor(0.5, 0.5, 0.6);
      gfx.printf('ACHIEVEMENTS', tabR - 100, ty + 3, 200, 'center');
      g.hotspots.push({ x: tabR - 100, y: ty - 5, w: 200, h: 40, action: () => { g.achievementsTab = 2; g.achievementsScroll = 0; } });

      if (g.achievementsTab === 1) this._drawStatistics(g); else this._drawAchievementsList(g);
      this._backHint(g, 'Esc back · ←/→ tabs · R reset all');
    },

    _drawStatistics(g) {
      const gfx = G(), w = g.screenWidth, h = g.screenHeight, st = ASCENT.Save.stats, bt = ASCENT.Save.bestTimes;
      gfx.setFont(20);
      const top = h * 0.28, lx = w * 0.3, rx = w * 0.7;
      const compl = st.gamesAttempted > 0 ? st.gamesCompleted / st.gamesAttempted * 100 : 0;
      const best = st.gamesCompleted > 0 && bt.length ? bt[0].seconds : 0;
      const ropeRate = st.ropesShot > 0 ? st.successfulRopes / st.ropesShot * 100 : 0;
      const rows = [
        ['Time Played:', ASCENT.formatTime(st.timePlayed)],
        ['Games Completed:', '' + st.gamesCompleted],
        ['Games Attempted:', '' + st.gamesAttempted],
        ['Completion Rate:', compl.toFixed(1) + '%'],
        ['Best Time:', best > 0 ? ASCENT.formatTime(best) : 'N/A'],
        ['Total Fall Time:', ASCENT.formatTime(st.totalFallTime)],
        ['Total Fall Distance:', Math.round(st.totalFallDistance) + 'm'],
        ['Ropes Shot:', '' + st.ropesShot],
        ['Ropes Failed:', '' + st.ropesFailed],
        ['Rope Success Rate:', ropeRate.toFixed(1) + '%'],
        ['Total Jumps:', '' + st.jumps],
        ['Gravity Well Time:', st.gravityWellTime.toFixed(1) + 's'],
      ];
      for (let i = 0; i < rows.length; i++) {
        const y = top + i * 32;
        if (i % 2 === 0) { gfx.setColor(0.1, 0.1, 0.15, 0.5); gfx.rectangle('fill', lx - 50, y - 4, w * 0.5, 28); }
        gfx.setColor(0.7, 0.8, 0.9); gfx.print(rows[i][0], lx, y);
        gfx.setColor(1, 1, 0.8); gfx.printf(rows[i][1], rx - 200, y, 200, 'right');
      }
    },

    _drawAchievementsList(g) {
      const gfx = G(), w = g.screenWidth, h = g.screenHeight, A = ASCENT.ACHIEVEMENTS;
      gfx.setFont(20);
      const top = h * 0.25, lx = w * 0.2;
      const unlocked = A.filter(a => a.unlocked).length;
      gfx.setColor(0.3, 0.3, 0.4); gfx.rectangle('fill', lx, top - 40, w * 0.6, 20, 5);
      gfx.setColor(0.3, 1, 0.3); gfx.rectangle('fill', lx, top - 40, w * 0.6 * unlocked / A.length, 20, 5);
      gfx.setColor(1, 1, 1); gfx.printf(unlocked + '/' + A.length + ' Unlocked', lx, top - 38, w * 0.6, 'center');
      const perPage = 8, start = Math.floor(g.achievementsScroll), end = Math.min(start + perPage, A.length);
      for (let i = start; i < end; i++) {
        const a = A[i], y = top + (i - start) * 60;
        gfx.setColor(a.unlocked ? 0.2 : 0.1, a.unlocked ? 0.3 : 0.1, a.unlocked ? 0.2 : 0.15, 0.5);
        gfx.rectangle('fill', lx - 10, y - 5, w * 0.65, 55, 5);
        if (a.unlocked) { gfx.setColor(1, 0.9, 0.3); gfx.circle('fill', lx + 20, y + 20, 15); gfx.setColor(0, 0, 0); gfx.print('✓', lx + 13, y + 10); }
        else { gfx.setColor(0.3, 0.3, 0.4); gfx.circle('line', lx + 20, y + 20, 15); gfx.print('?', lx + 16, y + 10); }
        gfx.setFont(20); gfx.setColor(a.unlocked ? 1 : 0.5, a.unlocked ? 1 : 0.5, a.unlocked ? 0.8 : 0.6); gfx.print(a.name, lx + 50, y + 5);
        gfx.setFont(15); gfx.setColor(a.unlocked ? 0.8 : 0.4, a.unlocked ? 0.8 : 0.4, a.unlocked ? 0.9 : 0.5); gfx.print(a.desc, lx + 50, y + 28);
        gfx.setFont(20);
      }
      if (A.length > perPage) { gfx.setColor(0.5, 0.5, 0.6); gfx.setFont(15); gfx.print('↑↓ scroll', w * 0.8, top + 200); }
    },

    _backHint(g, text) {
      const gfx = G(), w = g.screenWidth, h = g.screenHeight;
      gfx.setFont(15); gfx.setColor(0.5, 0.5, 0.6, 0.8);
      gfx.printf(text || 'Press Esc or click here to return to menu', 0, h - 50, w, 'center');
      g.hotspots.push({ x: w / 2 - 200, y: h - 56, w: 400, h: 30, action: () => { g.state = ASCENT.STATES.MENU; } });
    },

    drawPauseOverlay(g) {
      const gfx = G(), w = g.screenWidth, h = g.screenHeight;
      g.hotspots = [];
      gfx.setColor(0, 0, 0, 0.8); gfx.rectangle('fill', 0, 0, w, h);
      gfx.setFont(46, true); gfx.setColor(1, 1, 1); gfx.printf('PAUSED', 0, h * 0.2, w, 'center');
      gfx.setFont(30);
      const top = h * 0.35;
      for (let i = 0; i < g.pauseItems.length; i++) {
        const y = top + i * 56, selected = i === g.selectedPauseItem;
        if (selected) { gfx.setColor(1, 1, 0.8); gfx.printf('> ' + g.pauseItems[i].text + ' <', 0, y, w, 'center'); }
        else { gfx.setColor(0.7, 0.7, 0.8); gfx.printf(g.pauseItems[i].text, 0, y, w, 'center'); }
        g.hotspots.push({ x: w / 2 - 200, y: y - 6, w: 400, h: 40, selKey: 'selectedPauseItem', sel: i, action: g.pauseItems[i].action });
      }
      if (g.selectedPauseItem === 1) {
        gfx.setFont(16); gfx.setColor(0.8, 0.9, 1.0);
        const cy = h * 0.66;
        gfx.printf('WASD move · W/S on rope: reel in/out · Mouse aim', 0, cy, w, 'center');
        gfx.printf('Left-click: shoot / release rope · Space: jump · Shift: boost swing · Esc: pause', 0, cy + 24, w, 'center');
      }
    },

    drawAchievementPopup(g) {
      if (g.achievementPopups.length === 0) return;
      const gfx = G(), w = g.screenWidth, pop = g.achievementPopups[0];
      let a = 1.0;
      if (pop.timer < 0.3) a = pop.timer / 0.3;
      else if (pop.timer > 2.7) a = (3.0 - pop.timer) / 0.3;
      const bw = 400, bh = 100, x = w / 2 - bw / 2, y = 100;
      gfx.setColor(0.1, 0.1, 0.2, 0.9 * a); gfx.rectangle('fill', x, y, bw, bh, 10);
      gfx.setColor(1, 0.9, 0.3, 0.5 * a); gfx.setLineWidth(3); gfx.rectangle('line', x, y, bw, bh, 10);
      gfx.setColor(1, 0.9, 0.3, a); gfx.circle('fill', x + 50, y + 50, 25);
      gfx.setColor(0, 0, 0, a); gfx.setFont(20); gfx.print('★', x + 40, y + 38);
      gfx.setColor(1, 1, 1, a); gfx.setFont(18, true); gfx.print('ACHIEVEMENT UNLOCKED!', x + 90, y + 18);
      gfx.setColor(0.9, 0.9, 1, a); gfx.setFont(16); gfx.print(pop.name, x + 90, y + 44);
      gfx.setColor(0.7, 0.7, 0.8, a); gfx.setFont(13); gfx.print(pop.desc, x + 90, y + 68);
      gfx.setLineWidth(1);
    },

    // ===================== GAMEPLAY =====================
    drawGame(g) {
      const gfx = G(), w = g.screenWidth, h = g.screenHeight, cam = g.camera, P = 0.95;
      gfx.clear(0.05, 0.05, 0.08);

      // --- parallax starfield (screen space) ---
      for (const s of g.stars) {
        const sx = s.x - cam.x * P, sy = s.y - cam.y * P;
        if (sx > -100 && sx < w + 100 && sy > -100 && sy < h + 100) {
          const tw = 0.7 + 0.3 * Math.sin(g.shaderTime * s.twinkleSpeed + s.twinklePhase);
          gfx.setColor(s.color[0], s.color[1], s.color[2], s.brightness * tw);
          gfx.circle('fill', sx, sy, s.size);
        }
      }
      for (let ci = 0; ci < g.constellations.length; ci++) {
        const c = g.constellations[ci], cx = c.x - cam.x * P, cy = c.y - cam.y * P;
        if (cy > -200 && cy < h + 200) {
          gfx.setColor(0.6, 0.7, 1.0, 0.25); gfx.setLineWidth(1);
          for (const ln of c.lines) {
            const a = c.stars[ln[0] - 1], b = c.stars[ln[1] - 1];
            if (a && b) gfx.line(cx + a.x, cy + a.y, cx + b.x, cy + b.y);
          }
          for (let si = 0; si < c.stars.length; si++) {
            const s = c.stars[si];
            let mul = 0.8 + 0.2 * Math.sin(g.shaderTime * 2);
            if (ci === g.sparklingConstellation && si === g.sparklingStar && g.constellationSparkleTimer < 0.5) mul = 1.5 + 0.5 * Math.sin(g.constellationSparkleTimer * 20);
            gfx.setColor(0.8, 0.9, 1.0, 0.1 * mul); gfx.circle('fill', cx + s.x, cy + s.y, s.size * 3);
            gfx.setColor(0.9, 0.95, 1.0, 0.3 * mul); gfx.circle('fill', cx + s.x, cy + s.y, s.size * 1.5);
            gfx.setColor(1, 1, 1, s.brightness * mul); gfx.circle('fill', cx + s.x, cy + s.y, s.size);
          }
        }
      }

      // --- world (camera space) ---
      gfx.push(); gfx.translate(-cam.x, -cam.y);

      gfx.setColor(0.3, 0.3, 0.3); gfx.rectangle('fill', 0, g.ground.y, g.levelWidth, g.ground.height);

      this._drawWind(g);
      this._drawWells(g);
      this._drawFlares(g);
      this._drawMeteors(g);
      this._drawPlatforms(g);

      // goal
      gfx.setColor(g.goal.reached ? 0 : 1, 1, g.goal.reached ? 0 : 0);
      gfx.circle('fill', g.goal.x, g.goal.y, g.goal.radius);
      gfx.setColor(1, 1, 1); gfx.setFont(16); gfx.print('GOAL', g.goal.x - 18, g.goal.y - 8);

      this._drawRope(g);
      this._drawPlayer(g);

      gfx.pop();

      this._drawHUD(g);
    },

    _drawWind(g) {
      const gfx = G(), cam = g.camera, w = g.screenWidth, h = g.screenHeight;
      for (const z of g.windZones) {
        if (!(z.x + z.width / 2 + 200 > cam.x && z.x - z.width / 2 - 200 < cam.x + w && z.y + z.height / 2 > cam.y && z.y - z.height / 2 < cam.y + h)) continue;
        for (const p of z.particles) {
          const cj = Math.abs(p.x - z.x) / (z.width / 2 + 150), ck = Math.abs(p.y - z.y) / (z.height / 2);
          const cl = Math.sqrt(cj * cj + ck * ck), cm = Math.exp(-cl * cl * 1.5);
          const a = p.opacity * p.life / 1.5 * cm;
          if (a <= 0.01) continue;
          if (p.layer === 1) gfx.setColor(0.6, 0.75, 0.9, a * 0.25);
          else if (p.layer === 2) gfx.setColor(0.7, 0.85, 0.95, a * 0.4);
          else gfx.setColor(0.85, 0.92, 1.0, a * 0.6);
          gfx.setLineWidth((1 + p.layer * 0.5) * cm);
          const len = p.length * (0.3 + 0.7 * cm);
          gfx.line(p.x, p.y, p.x - len * z.direction, p.y);
        }
        // faint flow ellipses
        for (let i = 1; i <= 8; i++) {
          const rad = i / 8 * (z.width / 2 + 100), a = 0.015 * (1 - i / 8);
          gfx.setColor(0.5, 0.7, 0.9, a); gfx.setLineWidth(1);
          const pts = [];
          for (let an = 0; an < Math.PI * 2; an += Math.PI / 8) { pts.push(z.x + Math.cos(an) * rad * 1.2); pts.push(z.y + Math.sin(an) * rad * 0.6); }
          gfx.polygon('line', pts);
        }
      }
    },

    _drawWells(g) {
      const gfx = G(), cam = g.camera, w = g.screenWidth, h = g.screenHeight;
      for (const b of g.gravityWells) {
        if (!(b.x + b.radius > cam.x && b.x - b.radius < cam.x + w && b.y + b.radius > cam.y && b.y - b.radius < cam.y + h)) continue;
        gfx.setColor(0.8, 0.3, 0.8, 0.2);
        for (let i = 1; i <= 3; i++) { gfx.setLineWidth(2); gfx.arc('line', b.x, b.y, b.radius * i / 3, b.rotation * i, b.rotation * i + Math.PI * 1.5); }
        gfx.setColor(0.5, 0.1, 0.5, 0.5); gfx.circle('fill', b.x, b.y, 20);
        gfx.setColor(0.2, 0.0, 0.2, 0.8); gfx.circle('fill', b.x, b.y, 10);
      }
    },

    _drawFlares(g) {
      const gfx = G(), cam = g.camera, h = g.screenHeight;
      for (const f of g.solarFlares) {
        if (!(f.y + f.height / 2 > cam.y && f.y - f.height / 2 < cam.y + h)) continue;
        if (f.state === 'warning') {
          const a = 0.3 + 0.2 * Math.sin(g.shaderTime * 10);
          gfx.setColor(1.0, 0.5, 0.0, a); gfx.rectangle('fill', 0, f.y - f.height / 2, g.levelWidth, f.height);
          gfx.setColor(1.0, 0.3, 0.0, 0.8);
          for (let i = 0; i <= 5; i++) {
            const x = f.direction > 0 ? 50 + i * 30 : g.levelWidth - 50 - i * 30, d = f.direction > 0 ? 20 : -20;
            gfx.polygon('fill', [x, f.y - 10, x + d, f.y, x, f.y + 10]);
          }
        } else if (f.state === 'active') {
          gfx.setColor(1.0, 0.8, 0.0, 0.8); gfx.rectangle('fill', 0, f.y - f.height / 2, f.x, f.height);
          gfx.setColor(1.0, 0.5, 0.0, 0.3); gfx.rectangle('fill', 0, f.y - f.height, f.x, f.height * 2);
          gfx.setColor(1.0, 1.0, 0.5, 0.9); gfx.rectangle('fill', f.x - 5, f.y - f.height / 2, 10, f.height);
        }
      }
    },

    _drawMeteors(g) {
      const gfx = G();
      for (const m of g.meteors) {
        for (let i = 0; i < m.trail.length; i++) {
          const t = m.trail[i], a = t.life / 0.5 * (i + 1) / m.trail.length;
          gfx.setColor(1.0, 0.5, 0.2, a); gfx.circle('fill', t.x, t.y, m.radius * (i + 1) / m.trail.length);
        }
        gfx.setColor(1.0, 0.7, 0.3); gfx.circle('fill', m.x, m.y, m.radius);
        gfx.setColor(1.0, 0.9, 0.5); gfx.circle('fill', m.x, m.y, m.radius * 0.6);
      }
    },

    _drawPlatforms(g) {
      const gfx = G(), cam = g.camera;
      const cl = cam.x - 100, cr = cam.x + g.screenWidth + 100, ct = cam.y - 100, cb = cam.y + g.screenHeight + 100;
      for (const a of g.platforms) {
        if (a.type === 'crumbling' && a.crumbled) continue;
        if (!(a.x + a.width / 2 > cl && a.x - a.width / 2 < cr && a.y + a.height / 2 > ct && a.y - a.height / 2 < cb)) continue;
        const E = (g.levelHeight - a.y - 150) / (g.levelHeight - 200);
        const cw = a.type === 'disappearing' ? a.opacity : 1.0;

        if (a.type === 'crumbling') {
          if (a.crumbling) {
            const shake = Math.sin(g.shaderTime * 50) * 4;
            gfx.push(); gfx.translate(a.x + shake, a.y); gfx.rotate(a.angle);
            gfx.setColor(0.5, 0.2, 0.1, cw); gfx.rectangle('fill', -a.width / 2, -a.height / 2, a.width, a.height);
            gfx.setColor(0.2, 0.05, 0.05, cw); gfx.setLineWidth(3);
            for (let k = 0; k < 5; k++) { const x1 = -a.width / 2 + Math.random() * a.width, x2 = -a.width / 2 + Math.random() * a.width; gfx.line(x1, -a.height / 2, x2, a.height / 2); }
            gfx.pop();
            for (const d of a.debris) { gfx.setColor(0.4, 0.15, 0.1, d.life); gfx.circle('fill', d.x, d.y, d.size); }
          } else {
            gfx.push(); gfx.translate(a.x, a.y); gfx.rotate(a.angle);
            gfx.setColor(0.8, 0.3, 0.15, cw); gfx.rectangle('fill', -a.width / 2, -a.height / 2, a.width, a.height);
            gfx.setColor(1.0, 0.4, 0.2, cw); gfx.setLineWidth(3); gfx.rectangle('line', -a.width / 2, -a.height / 2, a.width, a.height);
            const pulse = 0.5 + 0.5 * Math.sin(a.pulseTimer * 3);
            gfx.setColor(1.0, 0.3, 0.1, 0.2 * pulse * cw); gfx.setLineWidth(5); gfx.rectangle('line', -a.width / 2 - 3, -a.height / 2 - 3, a.width + 6, a.height + 6);
            gfx.pop();
          }
        } else {
          if (a.type === 'rotating') gfx.setColor(0.4, 0.6, 0.8, cw);
          else if (a.type === 'disappearing') gfx.setColor(0.8, 0.8, 0.4, cw);
          else if (E < 0.3) gfx.setColor(0.4, 0.4, 0.5, cw);
          else if (E < 0.6) gfx.setColor(0.5, 0.4, 0.3, cw);
          else if (E < 0.85) gfx.setColor(0.6, 0.3, 0.3, cw);
          else gfx.setColor(0.7, 0.2, 0.7, cw);
          gfx.push(); gfx.translate(a.x, a.y); gfx.rotate(a.angle); gfx.rectangle('fill', -a.width / 2, -a.height / 2, a.width, a.height); gfx.pop();

          if (a.type === 'rotating') {
            gfx.setColor(0.6, 0.8, 1.0, 0.3); gfx.setLineWidth(2); gfx.circle('line', a.x, a.y, a.width / 2 + 10);
          } else if (a.type === 'disappearing' && a.visible) {
            const frac = (a.phaseTimer % (a.visibleDuration + a.invisibleDuration)) / a.visibleDuration;
            if (frac <= 1) { gfx.setColor(1.0, 1.0, 0.0, 0.3 * (1 - frac)); gfx.setLineWidth(2); gfx.rectangle('line', a.x - a.width / 2 - 5, a.y - a.height / 2 - 5, a.width + 10, a.height + 10); }
          }
        }
        if (a.moving) { gfx.setColor(1, 1, 0, 0.15); gfx.setLineWidth(1); gfx.circle('line', a.baseX, a.y, a.moveAmplitude + a.width / 2); }
      }
    },

    _drawRope(g) {
      const gfx = G(), r = g.rope, p = g.player;
      // aim line
      if (g.aim.visible && !r.active && !r.shooting && r.cooldownTimer <= 0) {
        gfx.setColor(1, 1, 1, 0.3); gfx.setLineWidth(2);
        gfx.line(p.x, p.y, p.x + Math.cos(g.aim.angle) * g.aim.length, p.y + Math.sin(g.aim.angle) * g.aim.length);
      }
      // shooting
      if (r.shooting) {
        gfx.setColor(0.8, 0.6, 0.4); gfx.setLineWidth(3); gfx.line(p.x, p.y, r.shootX, r.shootY);
        gfx.setColor(1, 0.5, 0.5); gfx.circle('fill', r.shootX, r.shootY, 3);
      }
      // snapped-rope debris
      if (r.failedRopeSegments.length > 0) {
        const a = r.failedRopeTimer / r.failedRopeMaxTime;
        gfx.setColor(0.8, 0.6, 0.4, a); gfx.setLineWidth(2);
        for (let i = 1; i < r.failedRopeSegments.length; i++) gfx.line(r.failedRopeSegments[i - 1].x, r.failedRopeSegments[i - 1].y, r.failedRopeSegments[i].x, r.failedRopeSegments[i].y);
        if (r.failedRopeSegments[0]) gfx.line(p.x, p.y, r.failedRopeSegments[0].x, r.failedRopeSegments[0].y);
      }
      // active rope with faux glow (brown→yellow by tension + halo)
      if (r.active) {
        const t = r.length / r.maxLength, tf = smooth(0, 0.8, t);
        if (t > 0.5) { gfx.setColor(1, 1, 0, 0.1 * (t - 0.5)); gfx.setLineWidth(12 + t * 8); gfx.line(p.x, p.y, r.x, r.y); gfx.circle('fill', r.x, r.y, 10 + t * 5); }
        gfx.setColor(lerp(0.8, 1, tf), lerp(0.6, 1, tf), lerp(0.4, 0, tf));
        gfx.setLineWidth(4 + t * 2); gfx.line(p.x, p.y, r.x, r.y);
        gfx.setColor(1, 1, 1); gfx.circle('fill', r.x, r.y, 5 + t * 2);
      }
      // cooldown ring
      if (r.cooldownTimer > 0) {
        gfx.setColor(1, 0, 0, 0.5); gfx.setLineWidth(2);
        gfx.circle('line', p.x, p.y, p.radius * (1 + r.cooldownTimer / r.cooldownDuration));
      }
    },

    _drawPlayer(g) {
      const gfx = G(), p = g.player, r = g.rope, In = ASCENT.Input;
      if (g.debugFlying) {
        gfx.setColor(0, 1, 1, 0.3); gfx.circle('fill', p.x, p.y, p.radius * 2);
        gfx.setColor(0, 1, 1); gfx.circle('fill', p.x, p.y, p.radius); return;
      }
      let boosting = In.hasGamepad() ? In.gamepadAxis('triggerright') > 0.1 : (In.isDown('lshift') || In.isDown('rshift'));
      if (r.active) gfx.setColor(boosting ? 1 : 0.5, 1, boosting ? 0 : 0.5);
      else if (r.cooldownTimer > 0) gfx.setColor(1, 0.3, 0.3);
      else gfx.setColor(1, 0.5, 0.5);
      gfx.circle('fill', p.x, p.y, p.radius);
    },

    _drawHUD(g) {
      const gfx = G(), w = g.screenWidth, h = g.screenHeight;
      // fast-fall red vignette (aberration substitute)
      if (g.fallShake > 0) { gfx.setColor(1, 0.2, 0.2, 0.12 * g.fallShake); gfx.rectangle('fill', 0, 0, w, h); }

      const E = g.progress();
      gfx.setColor(0, 0, 0, 0.5); gfx.rectangle('fill', w - 220, 10, 210, 90, 10);
      gfx.setFont(20); gfx.setColor(0.8, 0.9, 1.0); gfx.print('Progress: ' + (E * 100).toFixed(1) + '%', w - 200, 20);
      gfx.setColor(1.0, 1.0, 0.8); gfx.print('Time: ' + ASCENT.formatTime(g.gameTimer), w - 200, 46);
      const best = ASCENT.Save.bestTime();
      if (best != null) { gfx.setColor(0.8, 1.0, 0.8); gfx.print('Best: ' + ASCENT.formatTime(best), w - 200, 72); }
      else { gfx.setColor(0.6, 0.6, 0.7); gfx.print('Best: --:--:--', w - 200, 72); }

      gfx.setFont(14); gfx.setColor(0.5, 0.5, 0.6, 0.8); gfx.print('Esc: Pause', 12, h - 28);

      if (g.goal.reached) {
        gfx.setColor(0, 1, 0); gfx.setFont(48, true); gfx.printf('YOU WIN!', 0, h / 2 - 50, w, 'center');
        gfx.setFont(24); gfx.setColor(1, 1, 0.8); gfx.printf('Time: ' + ASCENT.formatTime(g.currentRunTime), 0, h / 2 + 20, w, 'center');
        const bt = ASCENT.Save.bestTimes;
        const isBest = bt.length === 0 || (bt[0] && g.currentRunTime <= bt[0].seconds);
        gfx.setFont(22);
        if (isBest) { gfx.setColor(1, 1, 0); gfx.printf('NEW PERSONAL BEST!', 0, h / 2 + 60, w, 'center'); }
        else {
          let rank = 1; for (const b of bt) { if (g.currentRunTime >= b.seconds) rank++; else break; }
          gfx.setColor(0.8, 0.8, 1.0); if (rank <= ASCENT.CONFIG.MAX_BEST_TIMES) gfx.printf('Rank #' + rank + ' time!', 0, h / 2 + 60, w, 'center');
        }
        gfx.setFont(16); gfx.setColor(0.7, 0.7, 0.8); gfx.printf('Press Esc to return to menu', 0, h / 2 + 100, w, 'center');
      }
    },
  };
})();
