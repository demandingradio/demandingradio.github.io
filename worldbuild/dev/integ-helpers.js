// Integration-test console helpers (dev only; never loaded by index.html).
// Usage in the browser console: eval(await (await fetch('/worldbuild/dev/integ-helpers.js?' + Date.now())).text())
// __pump(n) drives the main.js frame order by hand (the hidden Browser pane throttles rAF).
window.__pump = function (n, dt) {
  dt = dt || 1 / 60; let t = performance.now(); const cam = D.camera;
  for (let i = 0; i < n; i++) {
    t += dt * 1000; D.renderer.info.reset(); D.Cam.update(dt);   // info.reset bumps render.frame (autoReset is off): without it three uploads geometry attributes only once
    if (D.Atlas && D.Atlas.update) D.Atlas.update(dt, cam);
    const dist = D.Cam.distance(), focus = D.Cam.focusPoint();
    D.Sky.update(dt, cam, focus, dist); D.Terrain.update(dt, cam); D.Water.update(dt, cam); D.Nature.update(dt, cam);
    if (D.Story && D.Story.update) D.Story.update(dt);
    if (D.Roads && D.Roads.update) D.Roads.update(dt, cam);
    if (D.City && D.City.update) D.City.update(dt, cam);
    if (D.Kit && D.Kit.update) D.Kit.update(dt, cam);
    if (D.Life && D.Life.update) D.Life.update(dt, cam);
    D.Tools.update(dt);
    if (D.Audio && D.Audio.update) D.Audio.update(dt, cam, focus, dist);
    D.UI.update(dt);
    if (D.Save && D.Save.update) D.Save.update(dt);
    D.Post.render(D.renderer, D.scene, cam, t / 1000);
  }
  return true;
};
window.__views = [{ x: 11992, z: 2728, dist: 450, pitch: .5, yaw: .9 }, { x: 3852, z: 9507, dist: 700, pitch: .45, yaw: 2.2 }, { x: 9000, z: 6000, dist: 9000, pitch: .7, yaw: .3 }];
window.__view = function (i, n) { Object.assign(D.Cam.goal, __views[i]); D.Cam.snap(); D.Env.time = 10.5; D.Env.timeSpeed = 0; __pump(n || 150); return 1; };
window.__idb = async (k, v) => {
  const d = await new Promise(res => { const r = indexedDB.open('diorama', 1); r.onsuccess = () => res(r.result); });
  if (v === undefined) return await new Promise(res => { const r = d.transaction('worlds', 'readonly').objectStore('worlds').get(k); r.onsuccess = () => res(r.result); });
  await new Promise(res => { const tx = d.transaction('worlds', 'readwrite'); tx.objectStore('worlds').put(v, k); tx.oncomplete = res; });
};
// deterministic capture: Date.now frozen (cloud shadows / sky), cloud meshes hidden (they drift with dt)
window.__cap1 = async function (tag, i, pre) {
  const dn = Date.now; Date.now = () => 1790000000000;
  try {
    __view(i, 240); D.TU.uCloud.value = 0; D.Sky.cloudMeshes.forEach(m => m.visible = false);
    const undo = pre ? pre() : null;
    D.Post.render(D.renderer, D.scene, D.camera, 1000); D.Post.render(D.renderer, D.scene, D.camera, 1000);
    const url = D.renderer.domElement.toDataURL('image/png');
    if (undo) undo(); D.Sky.cloudMeshes.forEach(m => m.visible = true);
    await __idb('cmp-' + tag + '-' + i, url);
  } finally { Date.now = dn; }
  return 1;
};
window.__capX = async function (tag, pre) { for (let i = 0; i < 3; i++) await __cap1(tag, i, pre); return 1; };
window.__img = u => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = u; });
window.__cmp = async function (a, b, i) {
  const A = await __img(await __idb('cmp-' + a + '-' + i)), B = await __img(await __idb('cmp-' + b + '-' + i));
  const w = A.width, h = A.height, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, w, h).data; x.drawImage(B, 0, 0); const db = x.getImageData(0, 0, w, h).data;
  let sum = 0, big = 0, sgn = 0; const out = x.createImageData(w, h);
  for (let p = 0; p < da.length; p += 4) {
    const d = Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2]);
    sgn += (db[p] + db[p + 1] + db[p + 2]) - (da[p] + da[p + 1] + da[p + 2]);
    sum += d; if (d > 40) big++; const v = Math.min(255, d * 3); out.data[p] = v; out.data[p + 1] = v * 0.3; out.data[p + 2] = 0; out.data[p + 3] = 255;
  }
  x.putImageData(out, 0, 0); await __idb('diff-' + a + '-' + b + '-' + i, c.toDataURL());
  return { mean: +(sum / (w * h) / 3).toFixed(2), bigPct: +(100 * big / (w * h)).toFixed(2), signed: +(sgn / (w * h) / 3).toFixed(2) };
};
window.__ov = function () { let o = document.getElementById('__ov'); if (!o) { o = document.createElement('div'); o.id = '__ov'; o.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;flex-wrap:wrap;gap:2px'; document.body.appendChild(o); } o.innerHTML = ''; return o; };
window.__ovOff = () => { const o = document.getElementById('__ov'); if (o) o.remove(); };
window.__crop = async function (keys, sx, sy, sw, sh) {
  const o = __ov();
  for (const k of keys) { const im = await __img(await __idb(k)); const c = document.createElement('canvas'); c.width = sw; c.height = sh; c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh); c.style.cssText = 'width:49%;image-rendering:pixelated'; o.appendChild(c); }
  return 1;
};
window.__noShadow = () => { const L = []; D.scene.traverse(o => { if (o.isDirectionalLight && o.castShadow) { L.push(o); o.castShadow = false; } }); return () => L.forEach(o => o.castShadow = true); };
window.__noNature = () => { const L = []; D.scene.traverse(o => { if (o.isInstancedMesh && o.material && o.material.customProgramCacheKey && /nature/.test(o.material.customProgramCacheKey()) && o.visible) { L.push(o); o.visible = false; } }); return () => L.forEach(o => o.visible = true); };
// synthetic pointer stroke on the canvas: pts = [[fx,fy],...] as fractions of the canvas rect; pumps frames between moves
window.__stroke = function (tool, pts, framesPer, btn) {
  const cv = D.Tools.canvas; if (!cv.__noCap) { cv.setPointerCapture = () => { }; cv.releasePointerCapture = () => { }; cv.__noCap = true; }
  if (tool) D.Tools.select(tool);
  const r = cv.getBoundingClientRect(), at = p => ({ clientX: r.left + p[0] * r.width, clientY: r.top + p[1] * r.height });
  const ev = (type, p) => cv.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, pointerId: 1, button: btn || 0, buttons: 1, pointerType: 'mouse' }, at(p))));
  ev('pointermove', pts[0]); __pump(2);
  ev('pointerdown', pts[0]); __pump(framesPer || 4);
  for (let i = 1; i < pts.length; i++) { ev('pointermove', pts[i]); __pump(framesPer || 4); }
  ev('pointerup', pts[pts.length - 1]); __pump(2);
  return { entries: D.History.entries.length, pos: D.History.pos, top: D.History.entries[D.History.pos - 1] && D.History.entries[D.History.pos - 1].label };
};
window.__h32 = function (arr) { const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); let h = 2166136261 >>> 0; for (let i = 0; i < u.length; i += 1) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
window.__hs = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
window.__state = function () {
  const js = o => { try { return __hs(JSON.stringify(o, (k, v) => ArrayBuffer.isView(v) ? Array.from(v.subarray ? v.subarray(0, Math.min(v.length, 1e6)) : v) : v)); } catch (e) { return 'ERR ' + e.message; } };
  return { h: __h32(D.W.h), zone: D.W.zone ? __h32(D.W.zone) : null, paint: __h32(D.W.paint), roads: D.Roads ? js(D.Roads.serialize()) : null, city: D.City ? js(D.City.serialize()) : null, nature: D.Nature.count(), story: D.Story ? js(D.Story.serialize()) : null };
};
// delete-a-module check (polish step): boot state, a player stroke + undo, Atlas pages, and n history seasons
window.__degrade = function (seasons) {
  const out = { mods: ['Story', 'Director', 'Wayfarer', 'Works', 'Realm', 'Atlas'].filter(k => D[k]).join(','), booted: D.booted, hasWorld: D.UI.hasWorld };
  out.yearbar = !!document.getElementById('yearbar'); out.qAtlas = (() => { const q = document.getElementById('q-atlas'); return q ? getComputedStyle(q).display : 'none'; })();
  out.uAtlas = D.AU ? D.AU.uAtlas.value : 'noAU'; out.uYear = D.Kit && D.Kit.CU ? D.Kit.CU.uYear.value : '?';
  const h0 = __h32(D.W.h), n0 = D.History.entries.length;
  const s = __stroke('raise', [[.45, .5], [.5, .52], [.55, .5]], 3); out.stroke = s.top; out.hChanged = __h32(D.W.h) !== h0;
  D.History.undo(); __pump(3); out.undoOk = __h32(D.W.h) === h0; D.History.redo(); __pump(3); D.History.undo(); __pump(3);
  if (D.Atlas && D.Atlas.toggle) { D.Atlas.toggle(true); __pump(120); out.atlas = { on: D.Atlas.on, k: +D.AU.uAtlas.value.toFixed(2), pages: D.Atlas.PAGES && D.Atlas.PAGES.join('/'), tabs: [...document.querySelectorAll('.ac-tab')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.textContent.trim()).join('/') }; D.Atlas.toggle(false); __pump(120); out.atlasOffK = D.AU.uAtlas.value; }
  if (D.Story && seasons) {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    const q0 = D.Story.q, l0 = D.Story.events().length; D.Story.setSpeed(4); D.Story.play(); __pump(5);
    const c = D.Story._dev.step(seasons); D.Story.pause(); __pump(5);
    out.story = { steps: c, dq: D.Story.q - q0, newLog: D.Story.events().length - l0, parts: D.Story._dev.state().parts.join(','), started: D.Story.started, label: D.Story._dev.state().label, last: D.Story.events().slice(-3).map(e => e[5]) };
  }
  return out;
};
