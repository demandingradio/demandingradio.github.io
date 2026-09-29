/* Diorama — bootstrap and render loop. */
(function () {
'use strict';
const D = window.D;

function boot() {
  const canvas = document.getElementById('c');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false });
  } catch (e) { renderer = null; }
  if (!renderer || !renderer.capabilities.isWebGL2) { document.getElementById('webgl-error').hidden = false; return; }
  canvas.tabIndex = 0;
  const prefs = D.Save && D.Save.loadPrefs ? D.Save.loadPrefs() : {};
  if (prefs.quality) D.Q.level = prefs.quality;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 100000);
  D.scene = scene; D.renderer = renderer; D.camera = camera;

  D.Terrain.init(scene, renderer);
  D.Sky.init(scene, renderer);
  if (!D.Q.high) D.Sky.setShadowRes(2048);
  D.Water.init(scene, renderer);
  D.Nature.init(scene);
  if (D.Kit && D.Kit.init) D.Kit.init(scene);
  if (D.Roads && D.Roads.init) D.Roads.init(scene);
  if (D.City && D.City.init) D.City.init(scene);
  if (D.Life && D.Life.init) D.Life.init(scene);
  D.Post.init(renderer);
  D.Cam.init(camera, canvas);
  D.Tools.init(canvas);
  if (D.Audio && D.Audio.init) D.Audio.init();
  D.UI.init();
  if (D.Save && D.Save.init) D.Save.init();

  // sizing
  const vp = document.getElementById('viewport');
  let scaleOverride = 1;
  function resize(scale) {
    scaleOverride = scale || 1;
    const w = vp.clientWidth, h = vp.clientHeight;
    const pr = Math.min(window.devicePixelRatio || 1, D.Q.high ? 1.5 : 1) * scaleOverride;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    D.Post.setSize(w, h, pr);
  }
  new ResizeObserver(() => resize()).observe(vp);
  D.on('resize', s => resize(s));
  resize();

  // start: load autosave, or open the New World dialog over a quick default world
  (async () => {
    let loaded = false;
    if (D.Save && D.Save.load) { try { loaded = await D.Save.load(); } catch (e) { console.warn('load failed', e); } }
    if (loaded) {
      D.UI.hasWorld = true;
      D.toast(`Welcome back to <b>${D.W.name}</b>`, '', 3500);
    } else {
      D.UI.newWorld();
    }
  })();

  // loop
  let last = performance.now(), fpsT = 0, frames = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    renderer.info.reset();
    last = now;
    D.Cam.update(dt);
    const dist = D.Cam.distance(), focus = D.Cam.focusPoint();
    D.Sky.update(dt, camera, focus, dist);
    D.Terrain.update(dt, camera);
    D.Water.update(dt, camera);
    D.Nature.update(dt, camera);
    if (D.Roads && D.Roads.update) D.Roads.update(dt, camera);
    if (D.City && D.City.update) D.City.update(dt, camera);
    if (D.Kit && D.Kit.update) D.Kit.update(dt, camera);
    if (D.Life && D.Life.update) D.Life.update(dt, camera);
    D.Tools.update(dt);
    if (D.Audio && D.Audio.update) D.Audio.update(dt, camera, focus, dist);
    D.UI.update(dt);
    if (D.Save && D.Save.update) D.Save.update(dt);
    D.Post.render(renderer, scene, camera, now / 1000);
    frames++; fpsT += dt;
    if (fpsT > 0.5) {
      const info = renderer.info.render;
      D.UI.setPerf(Math.round(frames / fpsT), `${(info.triangles / 1e6).toFixed(1)}M tris`);
      frames = 0; fpsT = 0;
    }
  }
  requestAnimationFrame(frame);
  D.booted = true;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
