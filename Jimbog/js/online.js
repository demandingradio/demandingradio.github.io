// Jimbog — online play with friends (no bots).
//
// Star topology over WebRTC (JB.Net): the host's browser owns health,
// armour, kills, spawns, pickups and the match clock; every player moves
// their own cat and does their own hit detection ("favour the shooter"),
// reporting hits to the host. Remote cats are drawn ~100 ms in the past and
// interpolated between snapshots so they move smoothly.
//
// Messages (JSON, short keys):
//   client -> host : hello, st (my state, 20 Hz), ev (fire/nade/...), hit, rs (respawn me), pick
//   host -> all    : welcome, roster, start, snap (20 Hz), ev, dmg, kill, spawn, spawned, picked, pon, left, end
(function () {
  'use strict';
  const JB = window.JB;
  const U = JB.U;
  const W = JB.Weapons, DEFS = W.DEFS;
  const SEND_HZ = 20, INTERP = 0.1, MAX_PLAYERS = 8;
  const r2 = (v) => Math.round(v * 100) / 100;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

  class Online {
    // ui: { onLobby(online), onStatus(text), onStart(), onEnd(), onLeave(reason) }
    constructor(game, ui) {
      this.game = game; this.ui = ui || {};
      this.isHost = false; this.started = false; this.closed = false;
      this.roster = [];            // [{ id, name, fur, c (colour index) }]
      this.byId = new Map();       // netId -> Fighter (during a match)
      this.sendT = 0; this.snapT = 0;
      this.settings = null;
      this.session = JB.Net.create({
        onMessage: (m, from) => { try { this.onMessage(m, from); } catch (e) { console.warn('net message failed', m && m.t, e); } },
        onPeerJoin: (id) => this.onPeerJoin(id),
        onPeerLeave: (id) => this.onPeerLeave(id),
        onClose: (reason) => this.onClose(reason),
        onError: (err) => this.status(err && err.message ? err.message : String(err))
      });
    }
    status(t) { if (this.ui.onStatus) this.ui.onStatus(t); }

    // ---------------------------------------------------------------- setup
    async host(me) {
      this.isHost = true;
      const res = await this.session.host();
      this.myId = res.id; this.link = res.link;
      this.me = Object.assign({ id: res.id, c: 0 }, me);
      this.roster = [this.me];
      if (this.ui.onLobby) this.ui.onLobby(this);
      return res;
    }
    async join(hostId, me) {
      this.isHost = false;
      await this.session.join(hostId);
      this.myId = this.session.id;
      this.me = Object.assign({ id: this.myId }, me);
      this.session.send({ t: 'hello', name: me.name, fur: me.fur });
      this.status('Connected — waiting for the host…');
    }
    leave() {
      if (this.closed) return;
      this.closed = true;
      try { this.session.close(); } catch (e) { /* ignore */ }
    }
    myInfo() {
      const c = JB.Game.NET_COLORS[(this.me.c || 0) % JB.Game.NET_COLORS.length];
      return { name: this.me.name, fur: this.me.fur, vest: c.vest, color: c.color, voice: 1.05, netId: this.myId };
    }
    infoFor(r) {
      const c = JB.Game.NET_COLORS[(r.c || 0) % JB.Game.NET_COLORS.length];
      return { name: r.name, fur: r.fur, vest: c.vest, color: c.color, voice: 0.9 + ((r.c || 0) % 4) * 0.1, netId: r.id };
    }

    // ---------------------------------------------------------------- host side
    onPeerJoin(id) { /* wait for their hello */ void id; }
    onPeerLeave(id) {
      if (!this.isHost) return;
      const i = this.roster.findIndex((r) => r.id === id);
      if (i < 0) return;
      const r = this.roster[i];
      this.roster.splice(i, 1);
      this.session.broadcast({ t: 'left', id });
      this.session.broadcast({ t: 'roster', r: this.roster });
      this.dropFighter(id, r.name);
      if (this.ui.onLobby) this.ui.onLobby(this);
    }
    dropFighter(id, name) {
      const f = this.byId.get(id);
      if (f) { this.game.removeFighter(f); this.byId.delete(id); }
      if (this.started) this.game.hud.center((name || 'A cat') + ' left the game', '');
    }
    hostHello(m, from) {
      if (this.roster.length >= MAX_PLAYERS) { this.session.send({ t: 'full' }, from); return; }
      const used = new Set(this.roster.map((r) => r.c));
      let c = 0; while (used.has(c)) c++;
      const r = { id: from, name: String(m.name || 'Cat').slice(0, 16), fur: JB.Cat.FURS[m.fur] ? m.fur : 'ginger', c };
      this.roster = this.roster.filter((x) => x.id !== from).concat([r]);
      const g = this.game;
      const live = this.started && !g.ended;
      this.session.send({
        t: 'welcome', you: r, r: this.roster, s: this.settings || this.pickSettings(),
        state: live ? 'play' : 'lobby', mt: g.matchTime || 0,
        sc: live ? g.fighters.map((f) => [f.netId, f.kills, f.deaths]) : [],
        pk: live ? g.pickups.map((p) => [p.index, p.active ? 1 : 0]) : []
      }, from);
      this.session.broadcast({ t: 'roster', r: this.roster }, from);
      if (live) {
        this.byId.set(from, g.addRemote(this.infoFor(r)));
        g.hud.center(r.name + ' joined', '');
      }
      if (this.ui.onLobby) this.ui.onLobby(this);
    }
    pickSettings() {
      const s = this.game.settings;
      this.settings = { frags: s.frags, time: s.time, loadout: s.loadout };
      return this.settings;
    }
    // Host presses Start (or Rematch).
    startMatch() {
      if (!this.isHost) return;
      this.pickSettings();
      this.session.broadcast({ t: 'start', s: this.settings, r: this.roster });
      this.begin(this.settings, this.roster, false, this.settings.time * 60, null);
    }

    // ---------------------------------------------------------------- both
    begin(settings, roster, lateJoin, matchTime, extra) {
      const g = this.game;
      this.settings = settings;
      this.started = true;
      this.byId.clear();
      g.startMatch({ online: this, frags: settings.frags, matchTime, skipCountdown: lateJoin, loadout: settings.loadout });
      this.byId.set(this.myId, g.player);
      g.player.netId = this.myId;
      for (const r of roster) if (r.id !== this.myId) this.byId.set(r.id, g.addRemote(this.infoFor(r)));
      if (extra && extra.sc) for (const [id, k, d] of extra.sc) { const f = this.byId.get(id); if (f) { f.kills = k; f.deaths = d; } }
      if (extra && extra.pk) extra.pk.forEach((e, n) => {
        const [i, on] = Array.isArray(e) ? e : [n, e];
        const it = g.pickups.find((p) => p.index === i);
        if (it && !on) it.take();
      });
      if (this.ui.onStart) this.ui.onStart(this);
    }

    onMessage(m, from) {
      const g = this.game;
      switch (m.t) {
        // ---- host receives
        case 'hello': if (this.isHost) this.hostHello(m, from); break;
        case 'st': if (this.isHost) this.applyState(this.byId.get(from), m.s); break;
        case 'ev':
          if (this.isHost) {
            if (m.d) m.d.id = from;   // a player can only speak for their own cat
            this.applyEvent(m.e, m.d, from); this.session.broadcast({ t: 'ev', e: m.e, d: m.d }, from);
          }
          else this.applyEvent(m.e, m.d, null);
          break;
        case 'hit': if (this.isHost) this.hostHit(m, from); break;
        case 'rs': if (this.isHost) this.hostRespawn(this.byId.get(from)); break;
        case 'pick': if (this.isHost) this.hostPick(m.i, this.byId.get(from), from); break;
        // ---- clients receive
        case 'welcome':
          this.me = Object.assign(this.me, m.you);
          this.roster = m.r; this.settings = m.s;
          if (m.state === 'play') this.begin(m.s, m.r, true, m.mt, m);
          else if (this.ui.onLobby) this.ui.onLobby(this);
          break;
        case 'full': this.status('That game is full (8 cats max).'); this.leave(); break;
        case 'roster':
          this.roster = m.r;
          if (this.started && !g.ended) for (const r of m.r) if (r.id !== this.myId && !this.byId.has(r.id)) { this.byId.set(r.id, g.addRemote(this.infoFor(r))); g.hud.center(r.name + ' joined', ''); }
          if (this.ui.onLobby) this.ui.onLobby(this);
          break;
        case 'left': { const r = this.roster.find((x) => x.id === m.id); this.roster = this.roster.filter((x) => x.id !== m.id); this.dropFighter(m.id, r && r.name); break; }
        case 'start': if (!this.isHost) this.begin(m.s, m.r, false, m.s.time * 60, null); break;
        case 'snap': if (!this.isHost) this.applySnap(m); break;
        case 'dmg': if (!this.isHost) this.applyDmg(m); break;
        case 'kill': if (!this.isHost) this.applyKill(m); break;
        case 'spawn': if (!this.isHost && this.started) { g.placeAt(g.player, v3(m.p), m.y); g.player.invuln = 1.5; } break;
        case 'spawned': if (!this.isHost) this.applySpawned(m); break;
        case 'picked': if (!this.isHost) this.applyPicked(m); break;
        case 'pon': if (!this.isHost) { const it = g.pickups.find((p) => p.index === m.i); if (it && !it.active) it.reappear(); } break;
        case 'end': if (!this.isHost) { g.matchTime = 0; g.endMatch(m.r.map((id) => this.byId.get(id)).filter(Boolean)); } break;
      }
    }
    onClose(reason) {
      if (this.closed) return;
      this.closed = true;
      if (this.ui.onLeave) this.ui.onLeave(reason === 'host-timeout' ? 'Lost connection to the host.' : 'The host left the game.');
    }

    // ---------------------------------------------------------------- per frame
    update(dt) {
      if (this.closed || !this.started) return;
      const g = this.game;
      this.sendT -= dt;
      if (this.sendT <= 0) {
        this.sendT = 1 / SEND_HZ;
        if (this.isHost) this.session.broadcast(this.snapshot());
        else if (g.player) this.session.send({ t: 'st', s: this.myState() });
      }
      // host: pickups come back on its clock
      if (this.isHost) {
        for (const it of g.pickups) if (!it.active && !it.temp && it.timer <= 0) { it.reappear(); this.session.broadcast({ t: 'pon', i: it.index }); }
      }
      // interpolate remote cats
      const now = performance.now() / 1000 - INTERP;
      for (const f of this.byId.values()) if (f.remote) this.interpolate(f, now, dt);
    }
    myState() {
      const p = this.game.player;
      return [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.vel.x), r2(p.vel.y), r2(p.vel.z), r3(p.yaw), r3(p.pitch), r2(p.crouchK), W.ORDER.indexOf(p.current), p.body.onGround ? 1 : 0, p.zoom || 0];
    }
    snapshot() {
      const g = this.game, P = [];
      for (const [id, f] of this.byId) {
        P.push([id, r2(f.pos.x), r2(f.pos.y), r2(f.pos.z), r2(f.vel.x), r2(f.vel.y), r2(f.vel.z), r3(f.yaw), r3(f.pitch), r2(f.crouchK),
          W.ORDER.indexOf(f.current), f.alive ? 1 : 0, Math.ceil(f.hp), Math.ceil(f.armor), f.helmet ? 1 : 0, f.kills, f.deaths, f.invuln > 0 ? 1 : 0, f.body.onGround ? 1 : 0]);
      }
      return { t: 'snap', mt: r2(g.matchTime), st: g.state, P };
    }
    // a remote fighter's own report of where it is
    applyState(f, s) {
      if (!f || !s) return;
      this.pushSample(f, s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9], s[10]);
    }
    pushSample(f, x, y, z, vx, vy, vz, yaw, pitch, ck, wi, ground) {
      const buf = f.netBuf || (f.netBuf = []);
      buf.push({ t: performance.now() / 1000, x, y, z, vx, vy, vz, yaw, pitch, ck, ground });
      if (buf.length > 30) buf.shift();
      const w = W.ORDER[wi];
      if (w && w !== f.current) { f.current = w; f.cat.setWeapon(w); }
    }
    interpolate(f, now, dt) {
      const buf = f.netBuf;
      if (!buf || !buf.length) return;
      let a = buf[0], b = buf[buf.length - 1];
      for (let i = 0; i < buf.length - 1; i++) if (buf[i].t <= now && buf[i + 1].t >= now) { a = buf[i]; b = buf[i + 1]; break; }
      let k = b.t > a.t ? U.clamp((now - a.t) / (b.t - a.t), 0, 1) : 1;
      if (now > b.t) { a = b; k = 0; }
      f.pos.set(U.lerp(a.x, b.x, k), U.lerp(a.y, b.y, k), U.lerp(a.z, b.z, k));
      f.vel.set(U.lerp(a.vx, b.vx, k), U.lerp(a.vy, b.vy, k), U.lerp(a.vz, b.vz, k));
      f.yaw = a.yaw + U.angDiff(a.yaw, b.yaw) * k;
      f.pitch = U.lerp(a.pitch, b.pitch, k);
      f.crouchK = U.lerp(a.ck, b.ck, k);
      f.crouching = f.crouchK > 0.5;
      f.eyeH = 1.58 - f.crouchK * 0.52;
      f.body.onGround = !!b.ground;
      f.invuln = Math.max(0, (f.invuln || 0) - dt);
    }
    // clients: the host's view of everyone
    applySnap(m) {
      const g = this.game;
      if (typeof m.mt === 'number') g.matchTime = m.mt;
      for (const e of m.P) {
        const f = this.byId.get(e[0]);
        if (!f) continue;
        if (f === g.player) {
          // the host owns my health/armour/score
          f.hp = e[12]; f.armor = e[13]; f.helmet = !!e[14]; f.kills = e[15]; f.deaths = e[16];
          continue;
        }
        this.pushSample(f, e[1], e[2], e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10], e[18]);
        f.hp = e[12]; f.armor = e[13]; f.helmet = !!e[14]; f.kills = e[15]; f.deaths = e[16];
        if (e[17]) f.invuln = 0.1;   // host says protected; lapses quickly once the flag stops
        if (e[11] && !f.alive) this.reviveRemote(f, v3([e[1], e[2], e[3]]));
      }
    }
    reviveRemote(f, pos) {
      f.alive = true; f.hp = 100;
      f.cat.revive(); f.cat.root.visible = true;
      f.cat.setWeapon(f.current);
      if (pos) { f.pos.copy(pos); if (f.netBuf) f.netBuf.length = 0; }
    }

    // ---------------------------------------------------------------- events
    // Called by the game for things this browser's player did.
    local(type, data) {
      if (this.closed || !this.started) return;
      if (data && data.id === undefined) data.id = this.myId;
      if (data && data.id !== this.myId) return;   // only my own actions go out
      if (this.isHost) this.session.broadcast({ t: 'ev', e: type, d: data });
      else this.session.send({ t: 'ev', e: type, d: data });
    }
    applyEvent(type, d, from) {
      const g = this.game;
      const f = this.byId.get(d && d.id);
      if (!f || f === g.player) return;
      const sfx = (n, o) => JB.Audio && JB.Audio.play(n, o);
      if (type === 'fire') {
        const def = DEFS[d.w] || DEFS.pistol;
        if (d.w && d.w !== f.current) { f.current = d.w; f.cat.setWeapon(d.w); }
        const muzzle = d.m ? v3(d.m) : g.eyeOf(f, new THREE.Vector3());
        sfx(def.sound, { pos: muzzle, occluded: !g.audibleLOS(muzzle) });
        g.R.flash(muzzle, 0xffb35c, def.slot === 6 ? 7 : 4.5, 7, 0.06);
        f.cat.fire();
        for (const t of d.t || []) {
          const pt = v3(t);
          g.fx.tracer(muzzle, pt, 0xffc890, def.slot === 6 ? 0.045 : 0.022);
          g.fx.sparks(pt, null, 0, 1, 0, 2, false);
          if (g.player.alive) g.whiz(muzzle, pt.clone().sub(muzzle).normalize(), pt.distanceTo(muzzle));
        }
      } else if (type === 'melee') {
        sfx(d.s ? 'knife_stab' : 'knife_slash', { pos: f.pos }); f.cat.fire();
      } else if (type === 'nade') {
        g.spawnNade(d.k, v3(d.p), v3(d.v), f);
        sfx('grenade_throw', { pos: f.pos, volume: 0.6 }); f.cat.fire();
      } else if (type === 'hairball') {
        g.spawnHairball(f, v3(d.p), v3(d.v), false);
        sfx('launcher', { pos: f.pos }); f.cat.fire();
      } else if (type === 'weapon') {
        if (d.w && d.w !== f.current) { f.current = d.w; f.cat.setWeapon(d.w); }
      } else if (type === 'step') {
        sfx('footstep', { pos: f.pos, surface: d.s, occluded: !g.audibleLOS(f.pos) });
      }
      void from;
    }

    // ---------------------------------------------------------------- damage
    // Client: tell the host what I hit.
    sendHit(victim, dmg, weapon, opts) {
      if (!victim || !victim.netId) return;
      const p = opts.point;
      this.session.send({
        t: 'hit', v: victim.netId, d: r2(dmg), w: weapon, g: opts.group || 'chest', h: opts.head ? 1 : 0,
        p: p ? [r2(p.x), r2(p.y), r2(p.z)] : null, dir: opts.dir ? [r2(opts.dir.x), r2(opts.dir.y), r2(opts.dir.z)] : null,
        push: opts.push || null
      });
    }
    hostHit(m, from) {
      const g = this.game;
      const attacker = this.byId.get(from), victim = this.byId.get(m.v);
      if (!attacker || !victim || !(m.d >= 0) || m.d > (m.w === 'fall' ? 1000 : 800)) return;
      if (m.w === 'fall' && victim !== attacker) return;   // you can only fall yourself
      g.applyDamage(victim, m.d, attacker, DEFS[m.w] || m.w === 'fall' ? m.w : 'pistol', {
        premult: true, group: m.g, head: !!m.h, point: m.p ? v3(m.p) : null, dir: m.dir ? v3(m.dir) : null, push: m.push
      });
    }
    // Host: damage was applied (by anyone) -> tell everyone.
    onDamage(v, attacker, dmg, weapon, o) {
      if (!this.isHost) return;
      this.session.broadcast({
        t: 'dmg', v: v.netId, a: attacker ? attacker.netId : null, d: r2(dmg), hp: Math.ceil(v.hp), ar: Math.ceil(v.armor), he: v.helmet ? 1 : 0,
        h: o.head ? 1 : 0, dk: o.dink ? 1 : 0, w: weapon,
        p: o.point ? [r2(o.point.x), r2(o.point.y), r2(o.point.z)] : null, dir: o.dir ? [r2(o.dir.x), r2(o.dir.y), r2(o.dir.z)] : null, push: o.push || null
      });
      // knockback on the host's own cat
      if (v === this.game.player && o.push) { v.vel.add(v3(o.push)); v.body.onGround = false; }
    }
    applyDmg(m) {
      const g = this.game;
      const v = this.byId.get(m.v), a = this.byId.get(m.a);
      if (!v) return;
      v.hp = m.hp; v.armor = m.ar; v.helmet = !!m.he;
      if (v === g.player && m.w && DEFS[m.w] && DEFS[m.w].tag) v.velMod = Math.min(v.velMod, 1 - DEFS[m.w].tag);
      if (v === g.player && m.push) { v.vel.add(v3(m.push)); v.body.onGround = false; }
      g.hitFX(v, a, m.d, { head: !!m.h, dink: !!m.dk, point: m.p ? v3(m.p) : null, dir: m.dir ? v3(m.dir) : null });
    }
    onKill(v, killer, weapon, head) {
      if (!this.isHost) return;
      this.session.broadcast({ t: 'kill', v: v.netId, k: killer ? killer.netId : null, w: weapon, h: head ? 1 : 0, sc: this.game.fighters.map((f) => [f.netId, f.kills, f.deaths]) });
    }
    applyKill(m) {
      const g = this.game;
      const v = this.byId.get(m.v), k = this.byId.get(m.k);
      for (const [id, kills, deaths] of m.sc || []) { const f = this.byId.get(id); if (f) { f.kills = kills; f.deaths = deaths; } }
      if (!v) return;
      if (k && k !== v) k.streak = (k.streak || 0) + 1;
      g.killFX(v, k, m.w, !!m.h);
      if (v === g.player) g.awaitSpawn = false;
    }
    onEnd() {
      if (!this.isHost) return;
      const rows = this.game.fighters.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      this.session.broadcast({ t: 'end', r: rows.map((f) => f.netId) });
    }

    // ---------------------------------------------------------------- spawns
    requestRespawn() {
      if (this.isHost) this.hostRespawn(this.game.player);
      else this.session.send({ t: 'rs' });
    }
    hostRespawn(f) {
      const g = this.game;
      if (!f || f.alive || !this.started) return;
      if (f === g.player) { g.respawn(f); return; }
      g.respawn(f);   // -> sendSpawn
    }
    // host -> a client: here's your spawn point
    sendSpawn(f, sp) {
      f.pos.copy(sp.pos); f.yaw = sp.yaw;
      f.hp = 100; f.armor = 0; f.helmet = false; f.invuln = 1.5;
      this.reviveRemote(f, sp.pos);
      this.session.send({ t: 'spawn', p: [r2(sp.pos.x), r2(sp.pos.y), r2(sp.pos.z)], y: r3(sp.yaw) }, f.netId);
      this.session.broadcast({ t: 'spawned', id: f.netId, p: [r2(sp.pos.x), r2(sp.pos.y), r2(sp.pos.z)] }, f.netId);
    }
    // host respawned itself
    announceSpawn(f) {
      if (!this.isHost) return;
      this.session.broadcast({ t: 'spawned', id: f.netId, p: [r2(f.pos.x), r2(f.pos.y), r2(f.pos.z)] });
    }
    applySpawned(m) {
      const f = this.byId.get(m.id);
      if (!f || f === this.game.player) return;
      this.reviveRemote(f, v3(m.p));
      f.invuln = 1.5;
    }

    // ---------------------------------------------------------------- pickups
    requestPickup(it) {
      if (this.isHost) this.hostPick(it.index, this.game.player, this.myId);
      else this.session.send({ t: 'pick', i: it.index });
    }
    hostPick(i, f, from) {
      const g = this.game;
      const it = g.pickups.find((p) => p.index === i);
      if (!it || !it.active || !f || !f.alive) return;
      if ((it.kind === 'health' && f.hp >= 100) || (it.kind === 'armor' && f.armor >= 100 && f.helmet)) return;
      it.take();
      // health/armour are host-owned
      if (it.kind === 'health') f.hp = Math.min(100, f.hp + 35);
      if (it.kind === 'armor') { f.armor = Math.min(100, f.armor + 50); f.helmet = true; }
      this.session.broadcast({ t: 'picked', i, by: from === this.myId ? this.myId : from });
      if (f === g.player) { const hp = f.hp, ar = f.armor; g.grab(f, it); f.hp = hp; f.armor = ar; f.helmet = it.kind === 'armor' ? true : f.helmet; }
    }
    applyPicked(m) {
      const g = this.game;
      const it = g.pickups.find((p) => p.index === m.i);
      if (!it) return;
      if (it.active) it.take();
      if (m.by === this.myId) g.grab(g.player, it);
    }
  }

  JB.Online = Online;
})();
