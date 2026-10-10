// Jimbog — heads-up display (plain DOM over the canvas).
(function () {
  'use strict';
  const JB = window.JB;
  const $ = (id) => document.getElementById(id);

  class HUD {
    constructor() {
      this.el = $('hud');
      this.cross = $('crosshair');
      this.hit = $('hitmarker');
      this.scope = $('scope');
      this.dmg = $('dmgdirs');
      this.feedEl = $('killfeed');
      this.msgs = $('msgs');
      this.pick = $('pickupmsg');
      this.areaEl = $('area');
      this.hpNum = $('hpnum'); this.hpBar = $('hpbar'); this.arNum = $('arnum'); this.arBar = $('arbar');
      this.wName = $('wname'); this.wMag = $('wmag'); this.wRes = $('wres'); this.slots = $('slots');
      this.timerEl = $('timer'); this.scoreEl = $('scoreline');
      this.deathEl = $('death'); this.deathText = $('deathtext'); this.deathCount = $('deathcount');
      this.board = $('scoreboard');
      this.reloadEl = $('reloadbar'); this.reloadFill = $('reloadfill');
      this.hintEl = $('hint');
      this.cache = {};
      this.hitT = 0; this.pickT = 0; this.areaT = 0;
      this.dirs = [];
      // weapon slots
      this.slotEls = {};
      for (const k of JB.Weapons.ORDER) {
        const d = JB.Weapons.DEFS[k];
        const s = document.createElement('div');
        s.className = 'slot';
        s.innerHTML = '<span class="n">' + d.slot + '</span><span class="w">' + d.short + '</span>';
        this.slots.appendChild(s);
        this.slotEls[k] = s;
      }
    }
    _set(key, el, prop, val) {
      if (this.cache[key] === val) return;
      this.cache[key] = val;
      el[prop] = val;
    }
    show(on) { this.el.hidden = !on; }
    vitals(hp, armor) {
      hp = Math.max(0, Math.ceil(hp)); armor = Math.max(0, Math.ceil(armor));
      this._set('hp', this.hpNum, 'textContent', String(hp));
      this._set('ar', this.arNum, 'textContent', String(armor));
      if (this.cache.hpw !== hp) { this.cache.hpw = hp; this.hpBar.style.width = hp + '%'; this.hpBar.parentNode.classList.toggle('low', hp <= 30); }
      if (this.cache.arw !== armor) { this.cache.arw = armor; this.arBar.style.width = armor + '%'; }
    }
    weapon(type, mag, res, owned, reloadK) {
      const d = JB.Weapons.DEFS[type];
      this._set('wn', this.wName, 'textContent', d.name);
      this._set('wm', this.wMag, 'textContent', d.melee ? '∞' : String(mag));
      this._set('wr', this.wRes, 'textContent', d.melee ? '' : '/ ' + res);
      if (this.cache.wlow !== (mag <= Math.ceil((d.mag || 1) * 0.25))) {
        this.cache.wlow = mag <= Math.ceil((d.mag || 1) * 0.25);
        this.wMag.classList.toggle('low', !d.melee && this.cache.wlow);
      }
      const key = JB.Weapons.ORDER.map((k) => (owned[k] ? '1' : '0') + (k === type ? '*' : '')).join('');
      if (this.cache.slots !== key) {
        this.cache.slots = key;
        for (const k of JB.Weapons.ORDER) {
          this.slotEls[k].classList.toggle('owned', !!owned[k]);
          this.slotEls[k].classList.toggle('cur', k === type);
        }
      }
      const showR = reloadK > 0 && reloadK < 1;
      if (this.cache.rs !== showR) { this.cache.rs = showR; this.reloadEl.hidden = !showR; }
      if (showR) this.reloadFill.style.width = (reloadK * 100).toFixed(1) + '%';
    }
    crosshair(gapPx, visible, scoped) {
      const g = Math.round(Math.min(60, gapPx));
      if (this.cache.cg !== g) { this.cache.cg = g; this.cross.style.setProperty('--gap', g + 'px'); }
      const v = visible && !scoped;
      if (this.cache.cv !== v) { this.cache.cv = v; this.cross.style.opacity = v ? 1 : 0; }
      if (this.cache.sc !== scoped) { this.cache.sc = scoped; this.scope.hidden = !scoped; }
    }
    hitmarker(head, kill) {
      this.hit.className = 'on' + (head ? ' head' : '') + (kill ? ' kill' : '');
      void this.hit.offsetWidth;
      this.hitT = 0.25;
    }
    damageDir(rel) {
      const d = document.createElement('div');
      d.className = 'dd';
      d.style.transform = 'rotate(' + rel + 'rad)';
      this.dmg.appendChild(d);
      setTimeout(() => d.remove(), 1100);
    }
    feed(killer, victim, weapon, head, kp, vp) {
      const row = document.createElement('div');
      row.className = 'kf' + (kp ? ' me' : '') + (vp ? ' died' : '');
      const w = JB.Weapons.DEFS[weapon];
      const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      if (killer && killer !== victim) row.innerHTML = '<b style="color:' + killer.color + '">' + esc(killer.name) + '</b><span class="kw">' + (w ? w.short : '') + (head ? ' ✦' : '') + '</span><b style="color:' + victim.color + '">' + esc(victim.name) + '</b>';
      else row.innerHTML = '<b style="color:' + victim.color + '">' + esc(victim.name) + '</b><span class="kw">coughed up a hairball</span>';
      this.feedEl.prepend(row);
      while (this.feedEl.children.length > 5) this.feedEl.lastChild.remove();
      setTimeout(() => row.classList.add('fade'), 5000);
      setTimeout(() => row.remove(), 5800);
    }
    center(text, cls) {
      const m = document.createElement('div');
      m.className = 'cm ' + (cls || '');
      m.textContent = text;
      this.msgs.appendChild(m);
      while (this.msgs.children.length > 3) this.msgs.firstChild.remove();
      setTimeout(() => m.remove(), 1900);
    }
    pickup(text) { this.pick.textContent = text; this.pick.classList.add('on'); this.pickT = 1.8; }
    area(name) {
      if (this.cache.area === name) return;
      this.cache.area = name;
      this.areaEl.textContent = name;
      this.areaEl.classList.add('on'); this.areaT = 2.2;
    }
    hint(text) { this._set('hint', this.hintEl, 'textContent', text || ''); }
    timer(sec, line) {
      sec = Math.max(0, Math.ceil(sec));
      const t = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
      this._set('t', this.timerEl, 'textContent', t);
      this._set('sl', this.scoreEl, 'textContent', line);
    }
    death(show, text, count) {
      if (this.cache.dshow !== show) { this.cache.dshow = show; this.deathEl.hidden = !show; }
      if (show) { this._set('dt', this.deathText, 'innerHTML', text); this._set('dc', this.deathCount, 'textContent', count); }
    }
    scoreboard(show, fighters, title) {
      if (!show) { if (!this.board.hidden) this.board.hidden = true; return; }
      const rows = fighters.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const html = '<div class="sbt">' + (title || 'SCOREBOARD') + '</div><table><tr><th></th><th>Cat</th><th>Kills</th><th>Deaths</th><th>Best streak</th></tr>' +
        rows.map((f, i) => '<tr class="' + (f.isPlayer ? 'me' : '') + '"><td>' + (i + 1) + '</td><td><i style="background:' + f.color + '"></i>' + f.name.replace(/</g, '&lt;') + '<small>' + f.furLabel + '</small></td><td>' + f.kills + '</td><td>' + f.deaths + '</td><td>' + f.bestStreak + '</td></tr>').join('') + '</table>';
      if (this.cache.sb !== html) { this.cache.sb = html; this.board.innerHTML = html; }
      this.board.hidden = false;
    }
    update(dt) {
      if (this.hitT > 0) { this.hitT -= dt; if (this.hitT <= 0) this.hit.className = ''; }
      if (this.pickT > 0) { this.pickT -= dt; if (this.pickT <= 0) this.pick.classList.remove('on'); }
      if (this.areaT > 0) { this.areaT -= dt; if (this.areaT <= 0) this.areaEl.classList.remove('on'); }
    }
  }

  JB.HUD = HUD;
})();
