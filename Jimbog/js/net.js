/* Jimbog online transport (PeerJS). Needs lib/peerjs.min.js loaded first (it sets window.Peer).
 *
 *   JB.Net.available()      -> true if PeerJS loaded
 *   JB.Net.parseJoin()      -> game code from ?join=, or null
 *   JB.Net.create(cb)       -> session
 *
 *   cb (all optional): onMessage(msg, fromId), onPeerJoin(id), onPeerLeave(id),
 *                      onError(err), onClose(reason)
 *   session.host()          -> Promise<{ id, link }>
 *   session.join(hostId)    -> Promise<void>
 *   session.send(msg, toId) / session.broadcast(msg, exceptId)
 *   session.peers() / session.rtt(id) / session.close()
 *   session.isHost, session.id, session.hostId
 *
 * Messages are plain objects, up to 64 KB of JSON; bigger ones are split and joined internally.
 * Anything whose `t` starts with "_" is internal (heartbeat, frames) and never reaches onMessage.
 */
(function () {
  'use strict';

  const JB = window.JB = window.JB || {};

  const CODE_RE = /^jimbog-[a-z0-9]{6}$/;
  const CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const MAX_MESSAGE_BYTES = 64 * 1024;  // app cap on the JSON size of a message
  const JSON_CHANNEL_LIMIT = 16300;     // PeerJS json serializer refuses payloads >= this many bytes
  const PING_MS = 1000;
  const SILENT_MS = 15000;   // generous: a slow phone can stall a few seconds compiling shaders at match start
  const CONNECT_MS = 15000;
  const HOST_ATTEMPTS = 5;
  const RECONNECT_TRIES = 5;
  const RTT_SMOOTHING = 0.25;
  const CHUNK_CHARS = 4000;  // a split message goes out as frames of this many characters
  const MAX_CHUNKS = Math.ceil(MAX_MESSAGE_BYTES / CHUNK_CHARS);

  const MSG_NO_PEERJS = 'Online play is unavailable (PeerJS did not load).';
  const MSG_NOT_FOUND = 'Game not found — the host may have left.';
  const MSG_NO_CONNECT = 'Could not connect to the host (network blocked?).';
  const MSG_NO_SERVER = 'Could not reach the matchmaking server.';
  const MSG_BROWSER = 'This browser does not support online play (WebRTC is missing).';
  const MSG_NO_HOST = 'Could not create a game. Please try again.';

  // PeerJS error types that point at the signalling server or the network.
  const SERVER_ERRORS = {
    'network': 1, 'server-error': 1, 'socket-error': 1, 'socket-closed': 1,
    'unavailable-id': 1, 'invalid-key': 1, 'invalid-id': 1, 'ssl-unavailable': 1, 'disconnected': 1
  };

  const DEBUG = (function () {
    try { return new URLSearchParams(window.location.search).get('peerdebug') === '1'; }
    catch (e) { return false; }
  })();

  const textEncoder = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;

  function dbg() {
    if (DEBUG) console.log.apply(console, ['[JB.Net]'].concat(Array.prototype.slice.call(arguments)));
  }

  function makeError(message, type) {
    const e = new Error(message);
    e.type = type || 'jimbog';
    return e;
  }

  // Run a user callback; an exception in it must never break the session.
  function safeCall(fn) {
    if (typeof fn !== 'function') return;
    try { fn.apply(null, Array.prototype.slice.call(arguments, 1)); }
    catch (e) { console.error('[JB.Net] callback threw:', e); }
  }

  function byteLength(str) {
    return textEncoder ? textEncoder.encode(str).length : str.length;
  }

  function isInternal(m) {
    return m !== null && typeof m === 'object' && typeof m.t === 'string' && m.t.charAt(0) === '_';
  }

  // Test overrides from the URL: peerhost, peerport, peerpath, peersecure, peerice=none.
  function peerOptions() {
    let q;
    try { q = new URLSearchParams(window.location.search); } catch (e) { q = new URLSearchParams(); }
    const opts = {};
    if (q.get('peerhost')) opts.host = q.get('peerhost');
    const port = parseInt(q.get('peerport'), 10);
    if (port > 0) opts.port = port;
    if (q.get('peerpath')) opts.path = q.get('peerpath');
    const secure = q.get('peersecure');
    if (secure === 'true') opts.secure = true;
    else if (secure === 'false') opts.secure = false;
    if (q.get('peerice') === 'none') opts.config = { iceServers: [] };
    if (DEBUG) opts.debug = 3;
    return opts;
  }

  function newPeer(id) {
    const opts = peerOptions();
    return id ? new window.Peer(id, opts) : new window.Peer(undefined, opts);
  }

  function newCode() {
    const rnd = new Uint8Array(6);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(rnd);
    else for (let i = 0; i < 6; i++) rnd[i] = Math.floor(Math.random() * 256);
    let s = 'jimbog-';
    for (let i = 0; i < 6; i++) s += CODE_CHARS.charAt(rnd[i] % CODE_CHARS.length);
    return s;
  }

  // The page address without query or hash, so the link works from file:// too.
  function baseUrl() {
    const loc = window.location;
    if (loc.origin && loc.origin !== 'null') return loc.origin + loc.pathname;
    return loc.href.split(/[?#]/)[0];
  }

  function parseJoin() {
    try {
      const v = new URLSearchParams(window.location.search).get('join');
      return (v && CODE_RE.test(v)) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function joinError(type, phase) {
    if (type === 'peer-unavailable') return makeError(MSG_NOT_FOUND, type);
    if (type === 'browser-incompatible') return makeError(MSG_BROWSER, type);
    if (phase === 'signal' || SERVER_ERRORS[type]) return makeError(MSG_NO_SERVER, type);
    return makeError(MSG_NO_CONNECT, type || 'connection');
  }

  function hostError(type) {
    if (type === 'browser-incompatible') return makeError(MSG_BROWSER, type);
    return makeError(MSG_NO_SERVER, type);
  }

  // Calls fn every ms milliseconds, from a Worker timer when possible. A background tab's own
  // timers are throttled (Chrome cuts them to about once a minute after a while), and the other
  // side would read that as silence and drop us. Falls back to setInterval if the Worker does not
  // start. Returns a function that stops the clock.
  function startClock(fn, ms) {
    let stopped = false, ready = false, worker = null, url = null, timer = null;
    function fallback(why) {
      if (stopped || timer !== null) return;
      dbg('heartbeat on setInterval (' + why + ')');
      if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; }
      timer = setInterval(fn, ms);
    }
    try {
      url = URL.createObjectURL(new Blob(
        ['postMessage("ready");setInterval(function(){postMessage("tick");},' + ms + ');'],
        { type: 'text/javascript' }));
      worker = new Worker(url);
      worker.onmessage = function (e) {
        if (stopped) return;
        if (e.data === 'ready') ready = true;
        else fn();
      };
      worker.onerror = function () { fallback('worker error'); };
      setTimeout(function () { if (!ready) fallback('worker did not start'); }, 2000);
    } catch (e) {
      fallback('no worker');
    }
    return function stop() {
      stopped = true;
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (worker) { try { worker.terminate(); } catch (e) { /* ignore */ } worker = null; }
      if (url) { try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ } url = null; }
    };
  }

  function create(cb) {
    cb = cb || {};

    let role = null;          // 'host' | 'client' | null
    let peer = null;          // the current PeerJS Peer
    let myId = null;          // our own PeerJS id once open
    let hostIdRef = null;     // client: the host we joined
    let closed = false;
    const links = new Map();  // remote id -> { id, conn, open, rtt, lastSeen }
    let pending = null;       // { resolve, reject } until host() / join() settles
    let phase = 'signal';     // join: 'signal' (our Peer opening) or 'conn' (host channel opening)
    let timeoutTimer = null;
    let stopClock = null;     // stops the heartbeat clock
    let reconnects = 0;

    function current(link) {
      return !closed && links.get(link.id) === link;
    }

    function armTimeout(err) {
      clearTimeout(timeoutTimer);
      timeoutTimer = setTimeout(function () { failPending(err); }, CONNECT_MS);
    }

    function succeedPending(value) {
      const p = pending;
      if (!p) return;
      pending = null;
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
      p.resolve(value);
    }

    function failPending(err) {
      const p = pending;
      if (!p) return;
      pending = null;
      teardown();
      p.reject(err);
    }

    // Silent: no callbacks. Safe to call any number of times.
    function teardown() {
      if (closed) return;
      closed = true;
      if (stopClock) { stopClock(); stopClock = null; }
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
      const list = Array.from(links.values());
      links.clear();
      list.forEach(function (link) {
        try { link.conn.close(); } catch (e) { /* already closed */ }
      });
      const p = peer;
      peer = null;
      if (p) { try { p.destroy(); } catch (e) { /* already destroyed */ } }
      if (pending) {
        const pe = pending;
        pending = null;
        pe.reject(makeError('Session closed.', 'closed'));
      }
    }

    function makeLink(id, conn) {
      return { id: id, conn: conn, open: false, rtt: null, lastSeen: Date.now(), created: Date.now(), inbox: null };
    }

    function attach(link) {
      const c = link.conn;
      c.on('open', function () { onOpen(link); });
      c.on('data', function (d) { onData(link, d); });
      c.on('close', function () { onClosed(link); });
      c.on('error', function (e) { onConnError(link, e); });
      if (c.open) onOpen(link);
    }

    function sendRaw(link, msg) {
      if (!link.open) return false;
      try { link.conn.send(msg); return true; }
      catch (e) { dbg('send failed', link.id, e); return false; }
    }

    // App messages only. Returns { json, bytes }, or null when the message must not be sent.
    function encode(msg) {
      if (isInternal(msg)) {
        console.warn('[JB.Net] dropped message: types starting with "_" are reserved');
        return null;
      }
      let json;
      try { json = JSON.stringify(msg); } catch (e) { json = undefined; }
      if (typeof json !== 'string') {
        console.warn('[JB.Net] dropped message: not JSON-serializable');
        return null;
      }
      const bytes = byteLength(json);
      if (bytes > MAX_MESSAGE_BYTES) {
        console.warn('[JB.Net] dropped message: ' + bytes + ' bytes is over the ' + MAX_MESSAGE_BYTES + ' byte limit');
        return null;
      }
      return { json: json, bytes: bytes };
    }

    // Sends one encoded message on one link. PeerJS's json channel refuses payloads of
    // JSON_CHANNEL_LIMIT bytes or more, so bigger ones go out as '_c' frames that onChunk() joins.
    // The frames are sent back to back, so they arrive in order.
    function transmit(link, msg, out) {
      if (!link.open) return false;
      try {
        if (out.bytes < JSON_CHANNEL_LIMIT) { link.conn.send(msg); return true; }
        const n = Math.ceil(out.json.length / CHUNK_CHARS);
        for (let i = 0; i < n; i++) {
          link.conn.send({ t: '_c', i: i, n: n, d: out.json.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS) });
        }
        return true;
      } catch (e) {
        dbg('send failed', link.id, e);
        return false;
      }
    }

    function onOpen(link) {
      if (link.open || !current(link)) return;
      link.open = true;
      link.lastSeen = Date.now();
      if (role === 'host') {
        dbg('client connected', link.id);
        safeCall(cb.onPeerJoin, link.id);
      } else {
        dbg('connected to host', link.id);
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
        startTick();
        succeedPending(undefined);
      }
    }

    function onData(link, data) {
      if (!current(link)) return;
      link.lastSeen = Date.now();
      if (isInternal(data)) {
        if (data.t === '_ping') {
          sendRaw(link, { t: '_pong', s: data.s });
        } else if (data.t === '_pong') {
          const sample = performance.now() - Number(data.s);
          if (isFinite(sample) && sample >= 0 && sample < 60000) {
            link.rtt = (link.rtt === null) ? sample : link.rtt + RTT_SMOOTHING * (sample - link.rtt);
          }
        } else if (data.t === '_c') {
          onChunk(link, data);
        }
        return;
      }
      safeCall(cb.onMessage, data, link.id);
    }

    // Joins the frames of a message split by transmit(). The channel is reliable and ordered, so a
    // gap or a mismatch means the message is broken, and it is dropped.
    function onChunk(link, f) {
      const n = f.n, i = f.i;
      if (!(Number.isInteger(n) && Number.isInteger(i) && n >= 1 && n <= MAX_CHUNKS &&
            i >= 0 && i < n && typeof f.d === 'string')) {
        link.inbox = null;
        return;
      }
      let box = link.inbox;
      if (i === 0) {
        box = link.inbox = { n: n, parts: [], size: 0 };
      } else if (!box || box.n !== n || box.parts.length !== i) {
        link.inbox = null;
        return;
      }
      box.parts.push(f.d);
      box.size += f.d.length;
      // Characters never outnumber UTF-8 bytes, so more than the cap in characters is over it.
      if (box.size > MAX_MESSAGE_BYTES) { link.inbox = null; return; }
      if (box.parts.length < n) return;
      link.inbox = null;
      let msg;
      try { msg = JSON.parse(box.parts.join('')); }
      catch (e) { dbg('bad split message from', link.id); return; }
      if (isInternal(msg)) return;
      safeCall(cb.onMessage, msg, link.id);
    }

    function dropLink(link) {
      if (links.get(link.id) !== link) return;
      links.delete(link.id);
      try { link.conn.close(); } catch (e) { /* already closed */ }
      if (link.open) safeCall(cb.onPeerLeave, link.id);
    }

    // The host, or the host's connection, went away.
    function hostGone(reason) {
      if (closed) return;
      teardown();
      safeCall(cb.onClose, reason);
    }

    function onClosed(link) {
      if (!current(link)) return;
      if (role === 'host') {
        dropLink(link);
        return;
      }
      if (!link.open) {
        failPending(joinError('connection-closed', 'conn'));
        return;
      }
      hostGone('host-left');
    }

    function onConnError(link, err) {
      if (!current(link)) return;
      const type = err && err.type;
      dbg('connection error', link.id, type);
      if (type === 'message-too-big') return;  // sends are size-checked first, so this is not fatal
      if (role === 'host') {
        dropLink(link);
        return;
      }
      if (!link.open) {
        failPending(joinError(type, 'conn'));
        return;
      }
      hostGone('host-left');
    }

    function startTick() {
      if (stopClock || closed) return;
      stopClock = startClock(tick, PING_MS);
    }

    function tick() {
      if (closed) return;
      const now = Date.now();
      Array.from(links.values()).forEach(function (link) {
        if (closed || !current(link)) return;
        if (!link.open) {
          // a host-side connection that never finished opening: drop it after the connect window
          if (role === 'host' && now - link.created > CONNECT_MS) dropLink(link);
          return;
        }
        if (now - link.lastSeen > SILENT_MS) {
          dbg('silent for ' + SILENT_MS / 1000 + ' s', link.id);
          if (role === 'host') dropLink(link);
          else hostGone('host-timeout');
          return;
        }
        sendRaw(link, { t: '_ping', s: performance.now() });
      });
    }

    function onIncoming(conn) {
      if (closed || role !== 'host') {
        try { conn.close(); } catch (e) { /* ignore */ }
        return;
      }
      const id = conn.peer;
      const old = links.get(id);
      if (old) {
        links.delete(id);
        if (old.open) safeCall(cb.onPeerLeave, id);
        try { old.conn.close(); } catch (e) { /* ignore */ }
      }
      const link = makeLink(id, conn);
      links.set(id, link);
      attach(link);
    }

    // ---- host ----

    function hostAttempt(n) {
      const code = newCode();
      let p;
      try { p = newPeer(code); }
      catch (e) { failPending(makeError(MSG_NO_SERVER, 'init')); return; }
      peer = p;
      let opened = false;
      armTimeout(makeError(MSG_NO_SERVER, 'timeout'));

      p.on('open', function (id) {
        if (p !== peer) return;
        reconnects = 0;
        if (opened) { dbg('signalling restored'); return; }
        opened = true;
        myId = id;
        startTick();
        dbg('hosting as', id);
        succeedPending({ id: id, link: baseUrl() + '?join=' + id });
      });

      p.on('connection', function (conn) {
        if (p !== peer) { try { conn.close(); } catch (e) { /* ignore */ } return; }
        onIncoming(conn);
      });

      p.on('error', function (err) {
        if (p !== peer) return;
        const type = err && err.type;
        if (!opened) {
          if (type === 'unavailable-id' && n < HOST_ATTEMPTS) {
            dbg('code taken, retrying with a new one (attempt ' + (n + 1) + ')');
            try { p.destroy(); } catch (e) { /* ignore */ }
            hostAttempt(n + 1);
            return;
          }
          failPending(type === 'unavailable-id' ? makeError(MSG_NO_HOST, type) : hostError(type));
          return;
        }
        safeCall(cb.onError, err);
      });

      p.on('disconnected', function () {
        if (p !== peer || closed || reconnects >= RECONNECT_TRIES) return;
        reconnects += 1;
        dbg('signalling lost; retry ' + reconnects);
        setTimeout(function () {
          if (p !== peer || closed || !p.disconnected || p.destroyed) return;
          try { p.reconnect(); } catch (e) { dbg('reconnect failed', e); }
        }, 1000 * reconnects);
      });
    }

    function host() {
      if (!window.Peer) return Promise.reject(makeError(MSG_NO_PEERJS, 'unavailable'));
      if (role || closed) return Promise.reject(makeError('This session is already in use.', 'busy'));
      role = 'host';
      return new Promise(function (resolve, reject) {
        pending = { resolve: resolve, reject: reject };
        hostAttempt(1);
      });
    }

    // ---- client ----

    function join(hostId) {
      if (!window.Peer) return Promise.reject(makeError(MSG_NO_PEERJS, 'unavailable'));
      if (role || closed) return Promise.reject(makeError('This session is already in use.', 'busy'));
      if (typeof hostId !== 'string' || !hostId) return Promise.reject(makeError(MSG_NOT_FOUND, 'invalid-id'));
      role = 'client';
      hostIdRef = hostId;
      return new Promise(function (resolve, reject) {
        pending = { resolve: resolve, reject: reject };
        phase = 'signal';
        armTimeout(makeError(MSG_NO_SERVER, 'timeout'));
        let p;
        try { p = newPeer(undefined); }
        catch (e) { failPending(makeError(MSG_NO_SERVER, 'init')); return; }
        peer = p;

        p.on('open', function (id) {
          if (p !== peer || closed) return;
          myId = id;
          phase = 'conn';
          armTimeout(makeError(MSG_NO_CONNECT, 'timeout'));
          let conn = null;
          try { conn = p.connect(hostId, { reliable: true, serialization: 'json' }); }
          catch (e) { conn = null; }
          if (!conn) { failPending(makeError(MSG_NO_CONNECT, 'connect')); return; }
          const link = makeLink(hostId, conn);
          links.set(hostId, link);
          attach(link);
        });

        p.on('error', function (err) {
          if (p !== peer || closed) return;
          if (pending) { failPending(joinError(err && err.type, phase)); return; }
          safeCall(cb.onError, err);
        });

        p.on('disconnected', function () {
          if (p !== peer || closed) return;
          dbg('signalling lost; an open game connection is unaffected');
        });
      });
    }

    // ---- shared ----

    function send(msg, toId) {
      if (closed || !role) return false;
      const out = encode(msg);
      if (!out) return false;
      const link = (role === 'client') ? links.get(hostIdRef) : links.get(toId);
      return link ? transmit(link, msg, out) : false;
    }

    function broadcast(msg, exceptId) {
      if (closed || role !== 'host') return 0;
      const out = encode(msg);
      if (!out) return 0;
      let n = 0;
      Array.from(links.values()).forEach(function (link) {
        if (link.id === exceptId || !link.open) return;
        if (transmit(link, msg, out)) n++;
      });
      return n;
    }

    function peers() {
      if (closed) return [];
      if (role === 'host') {
        return Array.from(links.values()).filter(function (l) { return l.open; }).map(function (l) { return l.id; });
      }
      if (role === 'client') {
        const h = links.get(hostIdRef);
        return (h && h.open) ? [hostIdRef] : [];
      }
      return [];
    }

    // Smoothed round-trip time in ms, or null until the first sample arrives.
    function rtt(id) {
      if (role === 'client') {
        const h = links.get(hostIdRef);
        return (h && h.rtt !== null) ? h.rtt : null;
      }
      if (role === 'host') {
        const l = links.get(id);
        return (l && l.rtt !== null) ? l.rtt : null;
      }
      return null;
    }

    function close() {
      teardown();
    }

    return {
      host: host,
      join: join,
      send: send,
      broadcast: broadcast,
      peers: peers,
      rtt: rtt,
      close: close,
      get isHost() { return role === 'host'; },
      get id() { return myId; },
      get hostId() { return role === 'client' ? hostIdRef : null; }
    };
  }

  JB.Net = {
    available: function () { return !!window.Peer; },
    parseJoin: parseJoin,
    create: create,
    MAX_MESSAGE_BYTES: MAX_MESSAGE_BYTES,
    JSON_CHANNEL_LIMIT: JSON_CHANNEL_LIMIT
  };
})();
