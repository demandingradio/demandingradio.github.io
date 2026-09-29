/* Diorama — camera: Cities-Skylines-style orbit, street-level walk & drive,
   and cinematic flyovers through saved keyframes. */
(function () {
'use strict';
const D = window.D;
const { SIZE } = D;

const Cam = D.Cam = {
  mode: 'orbit',
  target: new THREE.Vector3(SIZE / 2, 0, SIZE / 2),
  yaw: 0.7, pitch: 0.62, dist: 9000,
  goal: { x: SIZE / 2, z: SIZE / 2, yaw: 0.7, pitch: 0.62, dist: 9000 },
  fov: 50, roll: 0,
  keys: {},
  autoOrbit: 0,
  flyKeys: [],
  flyDur: 20, flyLoop: false, flyT: -1,
  dragging: false   // set by tools.js while a grab-pan drag is in progress
};

Cam.init = function (camera, canvas) {
  Cam.camera = camera; Cam.canvas = canvas;
  Cam.target.y = 0;
  window.addEventListener('keydown', e => { if (isTyping(e)) return; Cam.keys[e.code] = true; });
  window.addEventListener('keyup', e => { Cam.keys[e.code] = false; });
  window.addEventListener('blur', () => { Cam.keys = {}; });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && (Cam.mode === 'walk' || Cam.mode === 'drive') && !Cam._switching) Cam.exitStreet();
  });
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement !== canvas) return;
    if (Cam.mode === 'walk') {
      Cam.walk.yaw -= e.movementX * 0.0022;
      Cam.walk.pitch = D.clamp(Cam.walk.pitch - e.movementY * 0.0022, -1.45, 1.45);
    } else if (Cam.mode === 'drive') {
      Cam.drive.look = D.clamp(Cam.drive.look - e.movementX * 0.003, -2.5, 2.5);
    }
  });
};
function isTyping(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA'); }

// ---- Orbit controls (driven from tools.js pointer handlers) --------------------------
Cam.orbitBy = function (dx, dy) {
  const g = Cam.goal;
  g.yaw -= dx * 0.0055;
  g.pitch = D.clamp(g.pitch + dy * 0.0045, 0.06, 1.53);
  Cam.autoOrbit = 0;
};
Cam.zoomAt = function (delta, ground) {
  const g = Cam.goal;
  const f = Math.pow(1.0018, delta);
  const nd = D.clamp(g.dist * f, 14, 32000);
  const k = 1 - nd / g.dist;
  if (ground && delta < 0) { g.x += (ground.x - g.x) * k; g.z += (ground.z - g.z) * k; }
  g.dist = nd;
  clampGoal();
};
// Soft border: panning past the edge meets growing resistance, and the view springs back
// toward the land when you let go.
const edgeMargin = () => D.clamp(Cam.goal.dist * 0.45, 500, SIZE * 0.25);
function over(v) { return v < 0 ? -v : v > SIZE ? v - SIZE : 0; }
function resist(v, d) { const o = over(v); if (!o || (v < 0) === (d > 0)) return 1; return 1 / (1 + Math.pow(o / 250, 1.5)); }
Cam.panBy = function (dx, dz) { const g = Cam.goal; g.x += dx * resist(g.x, dx); g.z += dz * resist(g.z, dz); clampGoal(); };
Cam.focusOn = function (x, z, dist) { Cam.goal.x = x; Cam.goal.z = z; if (dist) Cam.goal.dist = dist; clampGoal(); };
Cam.overview = function () { Object.assign(Cam.goal, { x: SIZE / 2, z: SIZE / 2, dist: 21000, pitch: 0.95 }); };
function clampGoal() {
  const g = Cam.goal, m = edgeMargin();
  g.x = D.clamp(g.x, -m, SIZE + m); g.z = D.clamp(g.z, -m, SIZE + m);
}
function springBack(dt) {
  const g = Cam.goal, soft = Math.min(edgeMargin() * 0.35, 1500), k = 1 - Math.exp(-dt * 2.2);
  if (g.x < -soft) g.x += (-soft - g.x) * k; else if (g.x > SIZE + soft) g.x += (SIZE + soft - g.x) * k;
  if (g.z < -soft) g.z += (-soft - g.z) * k; else if (g.z > SIZE + soft) g.z += (SIZE + soft - g.z) * k;
}
// walk / drive: bumping into the border pulses the neatline and says so in the HUD
let edgeMsgT = 0;
function edgeBump(x, z) {
  if (D.Terrain && D.Terrain.edgePulse) D.Terrain.edgePulse(x, z);
  edgeMsgT = 1.5;
}
function edgeNote(dt) {
  if (edgeMsgT <= 0) return '';
  edgeMsgT -= dt;
  return ' · <b style="color:#ffb070">Edge of your land</b>';
}
Cam.snap = function () { // jump to goal immediately
  const g = Cam.goal;
  Cam.target.x = g.x; Cam.target.z = g.z; Cam.yaw = g.yaw; Cam.pitch = g.pitch; Cam.dist = g.dist;
  Cam.target.y = groundY(g.x, g.z);
};
function groundY(x, z) {
  const inside = D.inMap(x, z);
  const y = D.Terrain.hAt(D.clamp(x, 0, SIZE), D.clamp(z, 0, SIZE));
  return Math.max(inside ? y : Math.min(y, D.W.seaLevel), D.W.seaLevel);
}

const tmpV = new THREE.Vector3();
Cam.update = function (dt) {
  const cam = Cam.camera;
  if (Cam.flyT >= 0) { updateFly(dt); return; }
  if (Cam.mode === 'walk') { updateWalk(dt); return; }
  if (Cam.mode === 'drive') { updateDrive(dt); return; }
  const g = Cam.goal, K = Cam.keys;
  // keyboard pan / rotate
  let keyPan = false;
  if (!Cam.suspendKeys) {
    const sp = g.dist * (K.ShiftLeft || K.ShiftRight ? 2.6 : 0.9) * dt;
    let fx = 0, fz = 0;
    if (K.KeyW || K.ArrowUp) fz -= 1; if (K.KeyS || K.ArrowDown) fz += 1;
    if (K.KeyA || K.ArrowLeft) fx -= 1; if (K.KeyD || K.ArrowRight) fx += 1;
    if (fx || fz) {
      const s = Math.sin(g.yaw), c = Math.cos(g.yaw);
      Cam.panBy((fx * c + fz * s) * sp, (-fx * s + fz * c) * sp);
      keyPan = true;
    }
    if (K.KeyQ) g.yaw += 1.6 * dt;
    if (K.KeyE) g.yaw -= 1.6 * dt;
    if (K.Equal || K.NumpadAdd) Cam.zoomAt(-900 * dt);
    if (K.Minus || K.NumpadSubtract) Cam.zoomAt(900 * dt);
  }
  if (Cam.autoOrbit) g.yaw += Cam.autoOrbit * dt;
  if (!Cam.dragging && !keyPan) springBack(dt);
  // smooth follow
  const k = 1 - Math.exp(-dt * 11);
  Cam.target.x += (g.x - Cam.target.x) * k;
  Cam.target.z += (g.z - Cam.target.z) * k;
  Cam.yaw += D.angDiff(Cam.yaw, g.yaw) * k;
  Cam.pitch += (g.pitch - Cam.pitch) * k;
  Cam.dist += (g.dist - Cam.dist) * k;
  const gy = groundY(Cam.target.x, Cam.target.z);
  Cam.target.y += (gy - Cam.target.y) * (1 - Math.exp(-dt * 6));
  const cp = Math.cos(Cam.pitch);
  tmpV.set(Math.sin(Cam.yaw) * cp, Math.sin(Cam.pitch), Math.cos(Cam.yaw) * cp).multiplyScalar(Cam.dist).add(Cam.target);
  const floor = groundY(tmpV.x, tmpV.z) + Math.max(2.5, Cam.dist * 0.02);
  if (tmpV.y < floor) tmpV.y = floor;
  cam.position.copy(tmpV);
  cam.up.set(0, 1, 0);
  cam.lookAt(Cam.target);
  if (Cam.roll) cam.rotateZ(Cam.roll);
  setClip(cam, cam.position.y - groundY(cam.position.x, cam.position.z));
};
function setClip(cam, above) {
  const near = D.clamp(above * 0.06, 0.25, 40);
  const far = Cam.mode === 'walk' || Cam.mode === 'drive' ? 40000 : 110000;
  if (Math.abs(cam.near - near) > near * 0.1 || cam.far !== far || cam.fov !== Cam.fov) {
    cam.near = near; cam.far = far; cam.fov = Cam.fov; cam.updateProjectionMatrix();
  }
}
Cam.distance = function () {
  if (Cam.mode === 'orbit' && Cam.flyT < 0) return Cam.dist;
  return Math.max(20, Cam.camera.position.y - groundY(Cam.camera.position.x, Cam.camera.position.z));
};
Cam.focusPoint = function () {
  if (Cam.mode === 'orbit' && Cam.flyT < 0) return Cam.target;
  const c = Cam.camera; const d = new THREE.Vector3(); c.getWorldDirection(d);
  return c.position.clone().addScaledVector(d, 120);
};

// ---- Walk mode ---------------------------------------------------------------------
Cam.walk = { x: 0, z: 0, y: 0, vy: 0, yaw: 0, pitch: 0, grounded: true };
Cam.enterWalk = function (x, z) {
  const w = Cam.walk;
  w.x = x; w.z = z; w.y = D.Terrain.hAt(x, z) + 1.7; w.vy = 0;
  w.yaw = Cam.yaw + Math.PI; w.pitch = -0.05;
  Cam.mode = 'walk';
  lockPointer();
  D.emit('cammode', 'walk');
};
function eyeGround(x, z) {
  const t = D.Terrain.hAt(x, z);
  const wl = D.Terrain.waterAt(x, z);
  return { t, wl };
}
function updateWalk(dt) {
  const w = Cam.walk, K = Cam.keys, cam = Cam.camera;
  const run = K.ShiftLeft || K.ShiftRight;
  const sp = (run ? 14 : 5) * dt;
  let fx = 0, fz = 0;
  if (K.KeyW || K.ArrowUp) fz -= 1; if (K.KeyS || K.ArrowDown) fz += 1;
  if (K.KeyA || K.ArrowLeft) fx -= 1; if (K.KeyD || K.ArrowRight) fx += 1;
  const len = Math.hypot(fx, fz) || 1;
  const s = Math.sin(w.yaw), c = Math.cos(w.yaw);
  let nx = w.x + (fx * c + fz * s) / len * sp, nz = w.z + (-fx * s + fz * c) / len * sp;
  if (D.City && D.City.collide) { const r = D.City.collide(nx, nz, 0.5); if (r) { nx = r[0]; nz = r[1]; } }
  const cxw = D.clamp(nx, 1, SIZE - 1), czw = D.clamp(nz, 1, SIZE - 1);
  if (cxw !== nx || czw !== nz) edgeBump(nx, nz);
  nx = cxw; nz = czw;
  w.x = nx; w.z = nz;
  const g = eyeGround(w.x, w.z);
  const swim = g.wl > g.t + 1.2;
  const floorY = swim ? g.wl + 0.4 : g.t + 1.7;
  if (K.Space && w.grounded && !swim) { w.vy = 5.5; w.grounded = false; }
  w.vy -= 16 * dt;
  w.y += w.vy * dt;
  if (w.y <= floorY) { w.y = D.lerp(w.y, floorY, 0.5); w.vy = 0; w.grounded = true; }
  const bob = w.grounded && (fx || fz) && !swim ? Math.sin(Date.now() * (run ? 0.018 : 0.011)) * (run ? 0.07 : 0.04) : 0;
  cam.position.set(w.x, w.y + bob, w.z);
  const cp = Math.cos(w.pitch);
  cam.up.set(0, 1, 0);
  cam.lookAt(w.x - Math.sin(w.yaw) * cp, w.y + bob + Math.sin(w.pitch), w.z - Math.cos(w.yaw) * cp);
  setClip(cam, 1.7);
  if (D.hud) D.hud(`<b>Walking</b> · WASD move · Shift run · Space jump · mouse look · <b>C</b> ride a cart · <b>Esc</b> back to editor${edgeNote(dt)}`);
}

// ---- Drive mode -------------------------------------------------------------------------
Cam.drive = { x: 0, z: 0, y: 0, heading: 0, speed: 0, steer: 0, look: 0, pitch: 0, roll: 0, mesh: null };
function carMesh() {
  if (Cam.drive.mesh) return Cam.drive.mesh;
  // medieval era: a horse and two-wheeled cart (forward = local -z)
  const bx = (w, h, d, x, y, z, hex) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, z); return D.colorGeo(b, hex); };
  const parts = [
    bx(1.6, 0.14, 2.3, 0, 0.95, 0.7, 0x7a5a3a),                                   // cart bed
    bx(0.08, 0.45, 2.3, -0.78, 1.24, 0.7, 0x6a4c30), bx(0.08, 0.45, 2.3, 0.78, 1.24, 0.7, 0x6a4c30),
    bx(1.6, 0.45, 0.08, 0, 1.24, 1.82, 0x6a4c30),                                 // tailboard
    bx(1.3, 0.5, 1.2, 0, 1.3, 1.0, 0xc8b070),                                     // sacks under a cloth
    bx(0.09, 0.09, 2.2, -0.5, 1.0, -1.0, 0x5a4028), bx(0.09, 0.09, 2.2, 0.5, 1.0, -1.0, 0x5a4028),   // shafts
    bx(0.7, 0.75, 1.8, 0, 1.45, -2.5, 0x6b4a2e),                                  // horse body
    bx(0.36, 0.8, 0.45, 0, 2.0, -3.35, 0x6b4a2e), bx(0.3, 0.32, 0.72, 0, 2.3, -3.72, 0x5e4028),   // neck, head
    bx(0.12, 0.5, 0.2, 0, 2.05, -3.2, 0x2a1e14),                                  // mane
    bx(0.18, 1.05, 0.18, -0.22, 0.52, -1.85, 0x4a3322), bx(0.18, 1.05, 0.18, 0.22, 0.52, -1.85, 0x4a3322),
    bx(0.18, 1.05, 0.18, -0.22, 0.52, -3.1, 0x4a3322), bx(0.18, 1.05, 0.18, 0.22, 0.52, -3.1, 0x4a3322),
    bx(0.1, 0.7, 0.1, 0, 1.45, -1.55, 0x2a1e14)                                   // tail
  ];
  const g = D.mergeGeos(parts);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, flatShading: true }));
  m.castShadow = true;
  const wheelG = new THREE.CylinderGeometry(0.62, 0.62, 0.14, 12); wheelG.rotateZ(Math.PI / 2);
  const wm = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 });
  [-0.9, 0.9].forEach(x => { const w = new THREE.Mesh(wheelG, wm); w.position.set(x, 0.62, 0.8); w.castShadow = true; m.add(w); });
  const lm = new THREE.MeshStandardMaterial({ color: 0xffc46a, emissive: 0xffb050, emissiveIntensity: 1.6 });
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), lm); l.position.set(-0.7, 1.75, -0.35); m.add(l);   // cart lantern
  D.scene.add(m);
  Cam.drive.mesh = m;
  return m;
}
Cam.enterDrive = function (x, z, heading) {
  const d = Cam.drive;
  d.x = x; d.z = z; d.y = D.Terrain.hAt(x, z); d.speed = 0; d.heading = heading !== undefined ? heading : Cam.yaw + Math.PI; d.look = 0;
  if (D.Roads) { const snap = D.Roads.nearestPoint(x, z, 60); if (snap) { d.x = snap.x; d.z = snap.z; d.heading = snap.heading; } }
  carMesh().visible = true;
  Cam.mode = 'drive';
  lockPointer();
  D.emit('cammode', 'drive');
};
function updateDrive(dt) {
  const d = Cam.drive, K = Cam.keys, cam = Cam.camera;
  const onRoad = D.Roads ? D.Roads.near(d.x, d.z, 1) : false;
  const maxV = onRoad ? 18 : 9;   // a cantering horse on a road, a trot across fields
  const acc = K.KeyW || K.ArrowUp ? 1 : 0, brk = K.KeyS || K.ArrowDown ? 1 : 0;
  if (acc) d.speed += (d.speed < maxV ? 5 : -4) * dt;
  if (brk) d.speed -= (d.speed > 0 ? 12 : 4) * dt;
  if (!acc && !brk) d.speed *= 1 - dt * 0.8;
  d.speed = D.clamp(d.speed, -4, onRoad ? 20 : 11);
  const st = (K.KeyA || K.ArrowLeft ? 1 : 0) - (K.KeyD || K.ArrowRight ? 1 : 0);
  d.steer += (st - d.steer) * Math.min(1, dt * 6);
  d.heading += d.steer * dt * D.clamp(d.speed / 8, -1.2, 1.2) * 0.9;
  let nx = d.x - Math.sin(d.heading) * d.speed * dt, nz = d.z - Math.cos(d.heading) * d.speed * dt;
  if (D.City && D.City.collide) { const r = D.City.collide(nx, nz, 1.6); if (r) { nx = r[0]; nz = r[1]; d.speed *= 0.4; } }
  const cxd = D.clamp(nx, 2, SIZE - 2), czd = D.clamp(nz, 2, SIZE - 2);
  if (cxd !== nx || czd !== nz) { edgeBump(nx, nz); d.speed *= 0.6; }
  nx = cxd; nz = czd;
  // roads carry their own height (bridges); otherwise follow terrain
  let gy = D.Terrain.hAt(nx, nz);
  if (D.Roads) { const ry = D.Roads.heightAt(nx, nz); if (ry !== null && ry > gy - 3) gy = ry; }
  const wl = D.Terrain.waterAt(nx, nz);
  if (wl > gy + 0.6) { d.speed *= 0.9; gy = wl - 0.3; }
  d.x = nx; d.z = nz; d.y += (gy - d.y) * Math.min(1, dt * 12);
  // tilt to terrain
  const fwd = 2.0;
  const hf = D.Terrain.hAt(d.x - Math.sin(d.heading) * fwd, d.z - Math.cos(d.heading) * fwd), hb = D.Terrain.hAt(d.x + Math.sin(d.heading) * fwd, d.z + Math.cos(d.heading) * fwd);
  const hl = D.Terrain.hAt(d.x - Math.cos(d.heading), d.z + Math.sin(d.heading)), hr = D.Terrain.hAt(d.x + Math.cos(d.heading), d.z - Math.sin(d.heading));
  const onBridge = D.Roads && D.Roads.heightAt(d.x, d.z) !== null && D.Roads.heightAt(d.x, d.z) > D.Terrain.hAt(d.x, d.z) + 1;
  d.pitch += ((onBridge ? 0 : Math.atan2(hf - hb, fwd * 2)) - d.pitch) * Math.min(1, dt * 8);
  d.roll += ((onBridge ? 0 : Math.atan2(hl - hr, 2)) - d.roll) * Math.min(1, dt * 8);
  const m = carMesh();
  m.position.set(d.x, d.y, d.z);
  m.rotation.set(0, 0, 0);
  m.rotateY(d.heading); m.rotateX(d.pitch); m.rotateZ(-d.roll);
  // chase cam
  const ch = d.heading + d.look;
  const cx = d.x + Math.sin(ch) * 9, cz = d.z + Math.cos(ch) * 9;
  let cy = d.y + 3.6;
  cy = Math.max(cy, D.Terrain.hAt(cx, cz) + 1.2);
  cam.position.lerp(tmpV.set(cx, cy, cz), Math.min(1, dt * 7));
  cam.up.set(0, 1, 0);
  cam.lookAt(d.x - Math.sin(d.heading) * 4, d.y + 1.4, d.z - Math.cos(d.heading) * 4);
  setClip(cam, 3);
  if (d.speed > 12 && Math.random() < dt * 0.3 && D.Audio) D.Audio.blip && D.Audio.blip();
  if (D.hud) D.hud(`<b>Riding a cart</b> ${Math.abs(d.speed * 3.6).toFixed(0)} km/h ${onRoad ? '' : '· off-road'} · WASD drive the horse · mouse look · <b>C</b> walk · <b>Esc</b> back to editor${edgeNote(dt)}`);
}

function lockPointer() {
  Cam._switching = true;
  try { const p = Cam.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { }
  setTimeout(() => { Cam._switching = false; }, 300);
  D.emit('street', true);
}
Cam.toggleWalkDrive = function () {
  Cam._switching = true;
  const c = Cam.camera.position;
  if (Cam.mode === 'walk') { Cam.enterDrive(Cam.walk.x, Cam.walk.z, Cam.walk.yaw); }
  else if (Cam.mode === 'drive') { if (Cam.drive.mesh) Cam.drive.mesh.visible = false; Cam.enterWalk(Cam.drive.x + 3, Cam.drive.z); }
  setTimeout(() => { Cam._switching = false; }, 300);
};
Cam.exitStreet = function () {
  const p = Cam.mode === 'walk' ? Cam.walk : Cam.drive;
  if (Cam.drive.mesh) Cam.drive.mesh.visible = false;
  Cam.mode = 'orbit';
  Object.assign(Cam.goal, { x: p.x, z: p.z, dist: Math.max(120, Cam.goal.dist * 0.2), pitch: 0.5 });
  if (document.pointerLockElement) document.exitPointerLock();
  D.emit('cammode', 'orbit');
  D.emit('street', false);
  if (D.hud) D.hud(null);
};

// ---- Flyover -------------------------------------------------------------------------------
Cam.addKey = function () {
  const c = Cam.camera; const d = new THREE.Vector3(); c.getWorldDirection(d);
  const look = Cam.mode === 'orbit' ? Cam.target.clone() : c.position.clone().addScaledVector(d, 200);
  Cam.flyKeys.push({ p: c.position.clone(), t: look });
  D.emit('flykeys');
};
Cam.removeKey = function (i) { Cam.flyKeys.splice(i, 1); D.emit('flykeys'); };
Cam.playFly = function () {
  if (Cam.flyKeys.length < 2) { D.toast('Add at least two camera keyframes first.', 'warn'); return; }
  Cam.flyT = 0;
  D.emit('flyover', true);
};
Cam.stopFly = function () {
  if (Cam.flyT < 0) return;
  Cam.flyT = -1;
  // hand control back to the orbit rig at the current view
  const c = Cam.camera, dir = new THREE.Vector3(); c.getWorldDirection(dir);
  const hit = D.Terrain.raycast(c.position, dir) || { x: c.position.x + dir.x * 800, z: c.position.z + dir.z * 800 };
  const dx = c.position.x - hit.x, dz = c.position.z - hit.z;
  Object.assign(Cam.goal, { x: hit.x, z: hit.z, yaw: Math.atan2(dx, dz), dist: c.position.distanceTo(new THREE.Vector3(hit.x, hit.y || 0, hit.z)) });
  Cam.goal.pitch = D.clamp(Math.asin(D.clamp((c.position.y - (hit.y || 0)) / Math.max(1, Cam.goal.dist), -1, 1)), 0.06, 1.5);
  Cam.snap();
  D.emit('flyover', false);
};
function cr(p0, p1, p2, p3, t, out) {
  const t2 = t * t, t3 = t2 * t;
  return out.set(
    0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3));
}
const fp = new THREE.Vector3(), ft = new THREE.Vector3();
function updateFly(dt) {
  const K = Cam.flyKeys, n = K.length;
  Cam.flyT += dt / Cam.flyDur;
  if (Cam.flyT >= 1) { if (Cam.flyLoop) Cam.flyT -= 1; else { Cam.stopFly(); return; } }
  let u = Cam.flyT;
  if (!Cam.flyLoop) u = u * u * (3 - 2 * u); // ease in/out
  const seg = u * (n - 1), i = Math.min(n - 2, Math.floor(seg)), t = seg - i;
  const P = k => K[D.clamp(k, 0, n - 1)];
  cr(P(i - 1).p, P(i).p, P(i + 1).p, P(i + 2).p, t, fp);
  cr(P(i - 1).t, P(i).t, P(i + 1).t, P(i + 2).t, t, ft);
  const gy = D.Terrain.hAt(D.clamp(fp.x, 0, SIZE), D.clamp(fp.z, 0, SIZE)) + 3;
  if (fp.y < gy) fp.y = gy;
  const cam = Cam.camera;
  cam.position.copy(fp);
  cam.up.set(0, 1, 0);
  cam.lookAt(ft);
  if (Cam.roll) cam.rotateZ(Cam.roll);
  setClip(cam, fp.y - D.Terrain.hAt(D.clamp(fp.x, 0, SIZE), D.clamp(fp.z, 0, SIZE)));
}
})();
