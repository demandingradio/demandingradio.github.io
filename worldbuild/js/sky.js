/* Diorama — sky, sun/moon, time of day, fog, clouds, weather, seasons. */
(function () {
'use strict';
const D = window.D;
const { SIZE } = D;

const Env = D.Env = {
  time: 10.5,          // hours
  timeSpeed: 0,        // game hours per real second
  weather: 'clear',
  season: 'summer',
  wind: 0.5,
  sunDir: new THREE.Vector3(0.4, 0.8, 0.3).normalize(),
  lightDir: new THREE.Vector3(),
  night: 0,
  day: 1,
  cloud: 0.25,
  fogDensity: 0.00003,
  sky: new THREE.Color(), horizon: new THREE.Color(), sunColor: new THREE.Color(), fogColor: new THREE.Color(),
  wet: 0, snow: 0, flash: 0,
  studio: 0
};
const WEATHERS = {
  clear:  { cloud: 0.22, fog: 0.000026, grey: 0.0,  sun: 1.0,  wet: 0, snow: 0, rain: 0, n: 22, cloudCol: 1.0 },
  cloudy: { cloud: 0.75, fog: 0.00004,  grey: 0.45, sun: 0.55, wet: 0, snow: 0, rain: 0, n: 70, cloudCol: 0.9 },
  rain:   { cloud: 0.95, fog: 0.00009,  grey: 0.7,  sun: 0.28, wet: 1, snow: 0, rain: 1, n: 95, cloudCol: 0.62 },
  storm:  { cloud: 1.0,  fog: 0.00012,  grey: 0.85, sun: 0.16, wet: 1, snow: 0, rain: 1.6, n: 110, cloudCol: 0.45 },
  fog:    { cloud: 0.4,  fog: 0.00042,  grey: 0.6,  sun: 0.5,  wet: 0.3, snow: 0, rain: 0, n: 20, cloudCol: 0.9 },
  snow:   { cloud: 0.9,  fog: 0.00011,  grey: 0.55, sun: 0.4,  wet: 0, snow: 1, rain: 0, n: 85, cloudCol: 0.85 }
};
const SEASONS = { spring: [1, 0, 0, 0], summer: [0, 1, 0, 0], autumn: [0, 0, 1, 0], winter: [0, 0, 0, 1] };
D.WEATHERS = WEATHERS; D.SEASONS = SEASONS;

const Sky = D.Sky = {};
// Atlas table lighting targets (spec 3.12 / E sky.js): ak = D.AU.uAtlas, the global drain 0..1
const atlasK = () => (D.AU ? D.AU.uAtlas.value : 0);
const ATLAS_LIGHT = new THREE.Vector3(-0.5, 0.7071, -0.5).normalize();   // from the north-west, 45 degrees up
const ATLAS_WHITE = new THREE.Color(1, 1, 1), ATLAS_HEMI = new THREE.Color(0.62, 0.62, 0.64), ATLAS_GROUND = new THREE.Color(0.30, 0.29, 0.27);
let cur = Object.assign({}, WEATHERS.clear); // smoothed weather params
const seasonW = new THREE.Vector4(0, 1, 0, 0);

// sRGB keyframes by sun elevation
const KEYS = [
  { e: -0.35, zen: 0x05081a, hor: 0x121a33, sun: 0x7a90c8, si: 0.22, hs: 0x1c2644, hg: 0x07080c, hi: 0.32 },
  { e: -0.10, zen: 0x0d1636, hor: 0x2a2f55, sun: 0x8595cf, si: 0.2, hs: 0x28305a, hg: 0x0c0c12, hi: 0.35 },
  { e: -0.02, zen: 0x24346a, hor: 0xc0705a, sun: 0xff8a50, si: 0.45, hs: 0x5a5a88, hg: 0x2a1c18, hi: 0.36 },
  { e: 0.06, zen: 0x46689e, hor: 0xf2b17c, sun: 0xffb070, si: 1.3, hs: 0x9aa8c8, hg: 0x5a4632, hi: 0.42 },
  { e: 0.22, zen: 0x3b74c4, hor: 0xb9d3ea, sun: 0xffe8c8, si: 1.95, hs: 0xb4cdea, hg: 0x6a5a40, hi: 0.5 },
  { e: 0.60, zen: 0x2f6ecf, hor: 0xb4d4ee, sun: 0xfff6e8, si: 2.15, hs: 0xbad4f0, hg: 0x6e6046, hi: 0.55 }
];
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function lerpHex(a, b, t, out) { tmpA.setHex(a); tmpB.setHex(b); return out.copy(tmpA).lerp(tmpB, t); }
function sampleKeys(e) {
  let i = 0; while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = D.clamp((e - a.e) / (b.e - a.e), 0, 1);
  return { a, b, t };
}

Sky.init = function (scene, renderer) {
  Sky.scene = scene;
  // --- dome ---
  const geo = new THREE.SphereGeometry(1, 32, 16);
  Sky.uni = {
    uSunDir: { value: Env.sunDir }, uMoonDir: { value: new THREE.Vector3() },
    uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() }, uNight: { value: 0 }, uCloudy: { value: 0 }, uTime: { value: 0 },
    uStudio: { value: 0 }, uSunset: { value: new THREE.Color() }, uFlash: { value: 0 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: Sky.uni, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 uSunDir, uMoonDir, uZen, uHor, uGround, uSunCol, uSunset; uniform float uNight, uCloudy, uTime, uStudio, uFlash;
      varying vec3 vDir;
      float h13(vec3 p){ p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.5));
        vec2 sxz = normalize(uSunDir.xz + 1e-4);
        float side = max(dot(normalize(d.xz + 1e-4), sxz), 0.0);
        col += uSunset * pow(side, 3.0) * (1.0 - smoothstep(0.0, 0.45, h)) * (1.0 - uCloudy * 0.6);
        col = mix(col, uGround, smoothstep(0.0, -0.12, h));
        float sd = max(dot(d, uSunDir), 0.0);
        float vis = (1.0 - uCloudy * 0.85) * step(-0.02, uSunDir.y);
        col += uSunCol * (pow(sd, 8.0) * 0.18 + pow(sd, 90.0) * 0.6) * vis;
        col += uSunCol * smoothstep(0.99955, 0.99975, sd) * 6.0 * vis;
        if (uNight > 0.01 && h > 0.0) {
          vec3 sp = floor(d * 380.0);
          float s = h13(sp);
          float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 60.0);
          col += vec3(step(0.9986, s) * tw * uNight * (1.0 - uCloudy) * smoothstep(0.0, 0.25, h)) * 1.3;
          float md = dot(d, uMoonDir);
          col += vec3(0.85, 0.88, 1.0) * (smoothstep(0.99935, 0.9996, md) * 1.6 + pow(max(md, 0.0), 60.0) * 0.08) * uNight * (1.0 - uCloudy * 0.7);
        }
        col += vec3(0.8, 0.85, 1.0) * uFlash;
        vec3 studio = mix(vec3(0.030, 0.032, 0.036), vec3(0.20, 0.21, 0.23), smoothstep(-0.3, 0.7, h));
        col = mix(col, studio, uStudio);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  Sky.dome = new THREE.Mesh(geo, mat);
  Sky.dome.renderOrder = -10;
  Sky.dome.frustumCulled = false;
  scene.add(Sky.dome);

  // --- lights ---
  Sky.sun = new THREE.DirectionalLight(0xffffff, 3);
  Sky.sun.castShadow = true;
  Sky.sun.shadow.mapSize.set(4096, 4096);
  Sky.sun.shadow.bias = -0.0004;
  const sc = Sky.sun.shadow.camera;
  sc.near = 10; sc.far = 30000;
  scene.add(Sky.sun); scene.add(Sky.sun.target);
  Sky.hemi = new THREE.HemisphereLight(0xbcd6f0, 0x6b5d44, 0.9);
  scene.add(Sky.hemi);
  scene.fog = new THREE.FogExp2(0xbcd8ee, Env.fogDensity);

  buildClouds(scene);
  buildPrecip(scene);
  Sky.setWeather(Env.weather, true);
  Sky.setSeason(Env.season, true);
};

Sky.setShadowRes = function (n) {
  const s = Sky.sun.shadow;
  if (s.mapSize.x === n) return;
  s.mapSize.set(n, n);
  if (s.map) { s.map.dispose(); s.map = null; }
};

Sky.setWeather = function (w, instant) {
  if (!WEATHERS[w]) return;
  Env.weather = w;
  if (instant) cur = Object.assign({}, WEATHERS[w]);
  D.emit('weather', w);
};
Sky.setSeason = function (s, instant) {
  if (!SEASONS[s]) return;
  Env.season = s;
  if (instant) seasonW.fromArray(SEASONS[s]);
  D.emit('season', s);
};

function sunFromTime(t, out) {
  const a = (t - 6) / 12 * Math.PI;
  out.set(Math.cos(a), Math.sin(a) * 0.86, Math.sin(a) * 0.46 + 0.12).normalize();
  return out;
}
Sky.sunFromTime = sunFromTime;

Sky.update = function (dt, camera, focus, camDist) {
  const T = Date.now() * 0.001;
  if (Env.timeSpeed > 0) { Env.time = (Env.time + dt * Env.timeSpeed) % 24; D.emit('time', Env.time); }
  // smooth weather transition
  const W = WEATHERS[Env.weather];
  const k = 1 - Math.exp(-dt * 0.6);
  for (const key in W) cur[key] += (W[key] - cur[key]) * k;
  const sk = 1 - Math.exp(-dt * 0.8);
  const tgt = SEASONS[Env.season];
  seasonW.x += (tgt[0] - seasonW.x) * sk; seasonW.y += (tgt[1] - seasonW.y) * sk;
  seasonW.z += (tgt[2] - seasonW.z) * sk; seasonW.w += (tgt[3] - seasonW.w) * sk;
  D.TU.uSeason.value.copy(seasonW);

  sunFromTime(Env.time, Env.sunDir);
  const e = Env.sunDir.y;
  const { a, b, t } = sampleKeys(e);
  const U = Sky.uni;
  lerpHex(a.zen, b.zen, t, U.uZen.value);
  lerpHex(a.hor, b.hor, t, U.uHor.value);
  lerpHex(a.sun, b.sun, t, U.uSunCol.value);
  const grey = cur.grey;
  const greyCol = new THREE.Color(0x8d949c).multiplyScalar(0.25 + 0.75 * D.smooth(-0.15, 0.25, e));
  U.uZen.value.lerp(greyCol, grey);
  U.uHor.value.lerp(greyCol.clone().multiplyScalar(1.1), grey * 0.9);
  // sunset tint strongest when sun is near the horizon
  const sunsetAmt = D.smooth(-0.12, 0.0, e) * (1 - D.smooth(0.05, 0.25, e));
  U.uSunset.value.setHex(0xff7a3a).multiplyScalar(sunsetAmt * 0.55);
  // Atlas table (ak = the global drain): lamps out, a neutral studio light, no weather
  const ak = D.AU ? D.AU.uAtlas.value : 0;
  Env.night = D.smooth(0.02, -0.14, e) * (1 - ak);
  Env.day = 1 - Env.night;
  U.uNight.value = Env.night;
  U.uCloudy.value = D.clamp((cur.cloud - 0.25) / 0.75, 0, 1);
  U.uTime.value = T;
  U.uGround.value.copy(U.uHor.value).multiplyScalar(0.55);
  U.uMoonDir.value.set(-Env.sunDir.x, Math.max(0.35, -Env.sunDir.y), -Env.sunDir.z * 0.6 + 0.3).normalize();
  // convert keyframe sRGB colours to linear for rendering
  [U.uZen.value, U.uHor.value, U.uSunCol.value, U.uSunset.value, U.uGround.value].forEach(c => c.convertSRGBToLinear());
  U.uStudio.value = Math.max(Env.studio, ak);   // never writes Env.studio

  // lightning
  if (Env.weather === 'storm' && ak < 0.5 && Math.random() < dt * 0.12) { Env.flash = 1; D.emit('lightning'); }
  Env.flash = Math.max(0, Env.flash - dt * 5);
  U.uFlash.value = Env.flash * (Math.random() > 0.3 ? 0.6 : 0.2);

  // sun / moon light
  const sun = Sky.sun;
  const isMoon = e < -0.03;
  Env.lightDir.copy(isMoon ? U.uMoonDir.value : Env.sunDir);
  if (!isMoon && Env.lightDir.y < 0.05) Env.lightDir.y = 0.05, Env.lightDir.normalize();
  if (ak > 0) Env.lightDir.lerp(ATLAS_LIGHT, ak).normalize();   // a fixed north-west raking hillshade
  const si = D.lerp(a.si, b.si, t) * cur.sun;
  sun.intensity = si * (isMoon ? 1 : D.smooth(-0.03, 0.05, e)) + Env.flash * 2;
  sun.color.copy(U.uSunCol.value);
  if (isMoon) sun.color.setHex(0x9fb2e0).convertSRGBToLinear();
  lerpHex(a.hs, b.hs, t, Sky.hemi.color).lerp(greyCol, grey * 0.6).convertSRGBToLinear();
  lerpHex(a.hg, b.hg, t, Sky.hemi.groundColor).convertSRGBToLinear();
  Sky.hemi.intensity = D.lerp(a.hi, b.hi, t) * (1 + grey * 0.25) + Env.flash * 1.5;
  if (ak > 0) {   // white sun at ~1.8, neutral sky fill
    sun.intensity += (1.8 - sun.intensity) * ak; sun.color.lerp(ATLAS_WHITE, ak);
    Sky.hemi.color.lerp(ATLAS_HEMI, ak); Sky.hemi.groundColor.lerp(ATLAS_GROUND, ak);
    Sky.hemi.intensity += (0.55 - Sky.hemi.intensity) * ak;
  }

  // shadow frustum follows the focus point
  const sd = D.clamp(camDist * 1.15, 260, D.Q.high ? 5200 : 3200);
  const scam = sun.shadow.camera;
  if (Math.abs(scam.right - sd) > sd * 0.05) {
    scam.left = -sd; scam.right = sd; scam.top = sd; scam.bottom = -sd; scam.updateProjectionMatrix();
  }
  // snap to shadow texels to reduce shimmer
  const texel = (2 * sd) / sun.shadow.mapSize.x;
  const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
  sun.target.position.set(fx, focus.y, fz);
  sun.position.set(fx + Env.lightDir.x * 12000, focus.y + Env.lightDir.y * 12000, fz + Env.lightDir.z * 12000);
  sun.shadow.normalBias = texel * 0.9;
  sun.target.updateMatrixWorld();

  // fog
  Env.fogColor.copy(U.uHor.value).lerp(U.uZen.value, 0.15);
  const stF = Math.max(Env.studio, ak);
  if (stF > 0) Env.fogColor.lerp(new THREE.Color(0.06, 0.065, 0.07), stF);
  Sky.scene.fog.color.copy(Env.fogColor);
  Env.fogDensity = cur.fog * (1 - Env.studio * 0.7) * (1 - 0.9 * ak);
  Sky.scene.fog.density = Env.fogDensity;
  Env.sky.copy(U.uZen.value); Env.horizon.copy(U.uHor.value); Env.sunColor.copy(sun.color).multiplyScalar(sun.intensity / 3);
  Env.cloud = cur.cloud;
  Env.wet += ((cur.wet > 0.5 ? 1 : 0) - Env.wet) * dt * (cur.wet > 0.5 ? 0.15 : 0.03);
  const winterBase = seasonW.w * 0.42;
  Env.snow += (Math.max(cur.snow, winterBase) - Env.snow) * dt * 0.08;

  // terrain uniforms
  const TU = D.TU;
  TU.uSea.value = D.W.seaLevel;
  TU.uTime.value = T % 10000;
  TU.uCloud.value = D.clamp(cur.cloud * 1.2, 0, 1) * (1 - Env.night) * (1 - ak);
  TU.uSnow.value = Env.snow * (1 - ak);
  TU.uWet.value = D.clamp(Env.wet, 0, 1) * (1 - ak);
  TU.uNight.value = Env.night;
  TU.uWind.value.set(Math.cos(0.6) * Env.wind * 10, Math.sin(0.6) * Env.wind * 10);

  // dome follows camera
  Sky.dome.position.copy(camera.position);
  Sky.dome.scale.setScalar(camera.far * 0.9);

  updateClouds(dt, camera);
  updatePrecip(dt, camera, camDist);
};

// ---- Clouds: low-poly puffs ------------------------------------------------
let clouds = [];
function buildClouds(scene) {
  const variants = [];
  const rnd = D.rng(4242);
  for (let v = 0; v < 3; v++) {
    const parts = [];
    const n = 6 + v * 2;
    for (let i = 0; i < n; i++) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const s = 90 + rnd() * 120;
      const ang = rnd() * Math.PI * 2, rr = rnd() * 220 * (0.4 + v * 0.3);
      g.scale(s * (1.2 + rnd() * 0.6), s * (0.55 + rnd() * 0.3), s);
      g.translate(Math.cos(ang) * rr * 1.6, s * 0.2 + rnd() * 40, Math.sin(ang) * rr);
      // flatten bottoms
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) if (p.getY(k) < -10) p.setY(k, -10 + (p.getY(k) + 10) * 0.2);
      parts.push(g);
    }
    const m = D.mergeGeos(parts);
    m.computeVertexNormals();
    variants.push(m);
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, metalness: 0, emissive: 0x2a3140, emissiveIntensity: 1 });
  Sky.cloudMat = mat;
  Sky.cloudMeshes = variants.map(g => {
    const im = new THREE.InstancedMesh(g, mat, 60);
    im.count = 0; im.frustumCulled = false;
    scene.add(im);
    return im;
  });
  const r = D.rng(99);
  for (let i = 0; i < 180; i++) clouds.push({
    x: -SIZE * 0.3 + r() * SIZE * 1.6, z: -SIZE * 0.3 + r() * SIZE * 1.6, y: 2700 + r() * 900,
    s: 0.7 + r() * 1.3, rot: r() * 6.28, v: i % 3, seed: r()
  });
}
const cm4 = new THREE.Matrix4(), cq = new THREE.Quaternion(), cs3 = new THREE.Vector3(), cp3 = new THREE.Vector3();
function updateClouds(dt, camera) {
  const n = Math.round(cur.n);
  const counts = [0, 0, 0];
  const wx = Math.cos(0.6) * Env.wind * 14, wz = Math.sin(0.6) * Env.wind * 14;
  const span = SIZE * 1.6, lo = -SIZE * 0.3;
  const vis = D.Layers ? D.Layers.visible('sky') : true;
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    c.x += wx * dt; c.z += wz * dt;
    if (c.x > lo + span) c.x -= span; if (c.z > lo + span) c.z -= span;
    if (i >= n || !vis || atlasK() > 0.5) continue;
    if (Env.studio > 0.5 && (c.x < 300 || c.z < 300 || c.x > SIZE - 300 || c.z > SIZE - 300)) continue;
    const cdx = c.x - camera.position.x, cdy = c.y - camera.position.y, cdz = c.z - camera.position.z;
    if (cdx * cdx + cdy * cdy + cdz * cdz < 900 * 900 * c.s * c.s) continue; // don't fly through clouds
    const im = Sky.cloudMeshes[c.v];
    cq.setFromAxisAngle(THREE.Object3D.DefaultUp, c.rot);
    cs3.setScalar(c.s * (0.8 + cur.cloud * 0.5));
    cp3.set(c.x, c.y - cur.cloud * 300, c.z);
    cm4.compose(cp3, cq, cs3);
    im.setMatrixAt(counts[c.v]++, cm4);
  }
  Sky.cloudMeshes.forEach((im, k) => { im.count = counts[k]; im.instanceMatrix.needsUpdate = true; });
  const g = cur.cloudCol * (0.2 + 0.52 * Env.day);
  Sky.cloudMat.color.setRGB(g, g, g * 1.02);
  Sky.cloudMat.emissive.setRGB(0.05 + Env.day * 0.05, 0.06 + Env.day * 0.06, 0.08 + Env.day * 0.07);
}

// ---- Rain / snow particles around the camera --------------------------------
function buildPrecip(scene) {
  const N = 9000;
  const pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2);
  const r = D.rng(7);
  for (let i = 0; i < N; i++) {
    const x = r(), y = r(), z = r();
    for (let e = 0; e < 2; e++) {
      pos[(i * 2 + e) * 3] = x; pos[(i * 2 + e) * 3 + 1] = y; pos[(i * 2 + e) * 3 + 2] = z;
      seed[i * 2 + e] = e;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('tail', new THREE.BufferAttribute(seed, 1));
  Sky.precipU = { uCam: { value: new THREE.Vector3() }, uBox: { value: 200 }, uT: { value: 0 }, uLen: { value: 3 },
    uWind: { value: new THREE.Vector2() }, uAlpha: { value: 0 }, uCol: { value: new THREE.Color(0.7, 0.75, 0.8) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: Sky.precipU, transparent: true, depthWrite: false,
    vertexShader: `uniform vec3 uCam; uniform float uBox, uT, uLen; uniform vec2 uWind; attribute float tail;
      void main(){
        vec3 p = position;
        float y = fract(p.y - uT * (0.9 + p.x * 0.2));
        vec2 xz = fract(p.xz + uWind * uT * 0.02 - uCam.xz / uBox) - 0.5;
        vec3 w = vec3(uCam.x + xz.x * uBox, uCam.y + (y - 0.5) * uBox, uCam.z + xz.y * uBox);
        w.xz -= uWind * 0.02 * uLen * tail;
        w.y += tail * uLen;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: `uniform float uAlpha; uniform vec3 uCol; void main(){ gl_FragColor = vec4(uCol, uAlpha); }`
  });
  Sky.rain = new THREE.LineSegments(g, mat);
  Sky.rain.frustumCulled = false;
  scene.add(Sky.rain);

  // snow as points
  const NS = 7000;
  const sp = new Float32Array(NS * 3);
  for (let i = 0; i < NS * 3; i++) sp[i] = r();
  const gs = new THREE.BufferGeometry();
  gs.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  Sky.snowU = { uCam: { value: new THREE.Vector3() }, uBox: { value: 200 }, uT: { value: 0 }, uAlpha: { value: 0 }, uSize: { value: 3 } };
  const ms = new THREE.ShaderMaterial({
    uniforms: Sky.snowU, transparent: true, depthWrite: false,
    vertexShader: `uniform vec3 uCam; uniform float uBox, uT, uSize;
      void main(){
        vec3 p = position;
        float y = fract(p.y - uT * (0.06 + p.x * 0.04));
        vec2 xz = fract(p.xz + vec2(sin(uT * 2.0 + p.y * 30.0), cos(uT * 1.7 + p.x * 20.0)) * 0.01 - uCam.xz / uBox) - 0.5;
        vec3 w = vec3(uCam.x + xz.x * uBox, uCam.y + (y - 0.5) * uBox, uCam.z + xz.y * uBox);
        vec4 mv = viewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * clamp(60.0 / -mv.z, 0.6, 3.0);
      }`,
    fragmentShader: `uniform float uAlpha; void main(){ vec2 c = gl_PointCoord - 0.5; if (dot(c, c) > 0.25) discard; gl_FragColor = vec4(vec3(1.0), uAlpha); }`
  });
  Sky.snowPts = new THREE.Points(gs, ms);
  Sky.snowPts.frustumCulled = false;
  scene.add(Sky.snowPts);
}
function updatePrecip(dt, camera, camDist) {
  const box = D.clamp(camDist * 0.5, 40, 900);
  const U = Sky.precipU;
  U.uCam.value.copy(camera.position);
  U.uBox.value = box;
  U.uT.value = (U.uT.value + dt * (1.6 * 40 / box)) % 1000;
  U.uLen.value = box * 0.012;
  U.uWind.value.set(Math.cos(0.6) * Env.wind * 30, Math.sin(0.6) * Env.wind * 30);
  U.uAlpha.value = D.clamp(cur.rain, 0, 1.6) * 0.16;
  const lum = 0.16 + 0.42 * Env.day;
  U.uCol.value.setRGB(lum * 0.8, lum * 0.85, lum * 0.9);
  Sky.rain.visible = cur.rain > 0.02 && Env.studio < 0.5 && atlasK() <= 0.5;
  const S = Sky.snowU;
  S.uCam.value.copy(camera.position);
  S.uBox.value = box;
  S.uT.value = (S.uT.value + dt * (40 / box) * 0.8) % 1000;
  S.uAlpha.value = D.clamp(cur.snow, 0, 1) * 0.85;
  S.uSize.value = 3 * (D.Post ? D.Post.pixelRatio : 1);
  Sky.snowPts.visible = cur.snow > 0.02 && Env.studio < 0.5 && atlasK() <= 0.5;
}
})();
