/* ===========================================================================
   CAVE BALL  —  roll a glowing ball through an endless cave: build speed,
   grab crystals to keep the clock alive, clear chasms, go as far as you can.

   Plain Three.js (vendored global build) + vendored post-processing scripts.
   No modules, no build step. Every feel/look/balance setting lives in CFG.
   =========================================================================== */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  const lerp = function (a, b, t) { return a + (b - a) * t; };

  // -------------------------------------------------------------------------
  // CFG — all the knobs in one place. Units are world-units and seconds.
  // -------------------------------------------------------------------------
  const CFG = {
    // --- The ball ---
    ballRadius:    0.9,
    ballColor:     0x46b1ff,
    ballEmissive:  0x2a7fd0,
    ballEmissiveInt: 0.7,

    // --- Movement & jumping (top speed emerges from thrust vs drag) ---
    moveAccel:     45,
    groundDrag:    1.6,
    airDrag:       0.25,
    slopeAccel:    75,
    maxSpeed:      50,
    airControl:    0.4,
    turnRate:      3.4,        // (grip-steer) rad/s your heading slews toward the input — higher = sharper turns
    airTurnScale:  0.5,        // fraction of that grip available while airborne
    gravity:       40,
    jumpSpeed:     15,
    maxJumps:      2,
    airJumpScale:  1.0,
    coyoteTime:    0.10,

    // --- Camera ---
    camDistance:   11,
    camHeight:     6.0,
    camLookHeight: 1.4,
    camFollowLerp: 7,
    camYawLerp:    8.0,        // snappy: camera swings behind your heading fast, so turns track
    camYawSpeedGate: 1.2,      // re-aim even at lower speed

    // --- Cave streaming ---
    chunkSize:     40,
    viewChunks:    2,
    floorSeg:      18,

    // --- Terrain (fractal, domain-warped) ---
    floorFreq:     0.045,      // base hill frequency
    floorAmp:      5.0,        // fractal detail amplitude
    macroAmp:      9.0,        // big slow elevation changes (valleys & rises)
    warpAmt:       22,         // domain-warp strength (organic, non-griddy shapes)

    // --- Ceiling: tunnels ↔ chambers (gap above the floor, by biome) ---
    tunnelGap:     11,
    chamberGap:    34,
    ceilNoiseAmp:  2.2,

    // --- Biomes (very-low-frequency region field drives gaps/density/tint) ---
    biomeFreq:     0.004,

    // --- Rock formations ---
    rocksPerChunk: 5,          // base count (modulated by biome)
    rockMinR:      1.2,  rockMaxR: 3.4,
    rockMinH:      4,    rockMaxH: 13,
    stalactites:   4,

    // --- Glowing crystal pockets (decoration; feed the bloom) ---
    glowClusterChance: 0.55,   // chance per "open" chunk to host a glowing pocket
    glowClusterColor:  0x49b0ff,
    glowCrystalSize:   0.5,

    // --- Crystals (collectibles) ---
    crystalsPerChunk: 3,
    crystalColor:  0xffcf5a,
    crystalHover:  1.7,
    crystalSize:   0.62,
    crystalSpin:   1.6,
    crystalBob:    0.28,
    crystalBobFreq: 2.0,
    pickRadius:    2.5,

    // --- Chasms ---
    pitChance:     0.5,
    pitRadius:     11,
    pitDepth:      45,
    deathY:        -12,

    // --- Run / scoring ---
    startTime:     20,
    crystalTime:   2.5,
    crystalScore:  100,
    distanceScore: 0.4,
    maxMultiplier: 5,
    multAtSpeed:   30,
    drainRamp:     0.02,

    // --- Atmosphere / look ---
    fogDensity:    0.02,
    ambientColor:  0x8090b0,  ambientInt: 0.14,
    glowColor:     0x66ccff,  glowInt: 2.6,  glowDist: 36,

    // Biome palettes (background/fog tint, lerped by region as you travel)
    biomePalette: [0x05060a, 0x05100f, 0x0b0714, 0x120c06],

    // --- Rendering (tone mapping + bloom) ---
    toneExposure:  1.0,
    bloom:         true,
    bloomStrength: 0.65,
    bloomRadius:   0.5,
    bloomThreshold: 0.85,

    // --- Juice ---
    fovBase:       70,  fovBoost: 22,  fovSpeedRef: 32,
    shakeLand:     0.045,  shakeDeath: 1.0,  shakeDecay: 9,
    popLife:       0.35,
  };

  // -------------------------------------------------------------------------
  // Procedural audio (created on first user gesture; failures never throw)
  // -------------------------------------------------------------------------
  const Sfx = (function () {
    let ctx = null, master = null, rOsc = null, rGain = null, rFilt = null;
    function ensure() {
      if (ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
        rOsc = ctx.createOscillator(); rOsc.type = 'sawtooth'; rOsc.frequency.value = 45;
        rFilt = ctx.createBiquadFilter(); rFilt.type = 'lowpass'; rFilt.frequency.value = 200;
        rGain = ctx.createGain(); rGain.gain.value = 0;
        rOsc.connect(rFilt); rFilt.connect(rGain); rGain.connect(master);
        rOsc.start();
      } catch (e) { ctx = null; }
    }
    function blip(f1, f2, dur, type, vol) {
      if (!ctx) return;
      try {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
        o.type = type || 'sine';
        o.frequency.setValueAtTime(f1, t);
        if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
      } catch (e) {}
    }
    return {
      resume: function () { ensure(); if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } },
      pickup: function () { blip(720, 1200, 0.16, 'triangle', 0.35); },
      jump:   function () { blip(300, 520, 0.11, 'square', 0.18); },
      die:    function () { blip(240, 45, 0.6, 'sawtooth', 0.4); },
      warn:   function () { blip(900, 900, 0.07, 'square', 0.22); },
      setSpeed: function (spd, mx) {
        if (!ctx || !rGain) return;
        const t = clamp01(spd / mx);
        rGain.gain.value = 0.05 * t;
        rFilt.frequency.value = 180 + 700 * t;
        rOsc.frequency.value = 42 + 34 * t;
      }
    };
  })();

  // -------------------------------------------------------------------------
  // Renderer / scene / camera
  // -------------------------------------------------------------------------
  const canvas = document.getElementById('game-canvas');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true }); }
  catch (e) { document.getElementById('error').hidden = false; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
  // (2) Filmic tone mapping + exposure
  if ('ACESFilmicToneMapping' in THREE) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CFG.toneExposure;

  const scene = new THREE.Scene();
  const fogCol = new THREE.Color(CFG.biomePalette[0]);
  scene.background = fogCol.clone();
  scene.fog = new THREE.FogExp2(fogCol.clone().getHex(), CFG.fogDensity);

  const camera = new THREE.PerspectiveCamera(CFG.fovBase, window.innerWidth / window.innerHeight, 0.1, 500);

  // (1) Bloom post-processing (with graceful fallback to direct rendering)
  let useBloom = false, composer = null, bloomPass = null;
  (function setupBloom() {
    if (!CFG.bloom) return;
    if (!(THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass && THREE.ShaderPass && THREE.GammaCorrectionShader)) return;
    try {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        CFG.bloomStrength, CFG.bloomRadius, CFG.bloomThreshold);
      composer.addPass(bloomPass);
      composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader)); // linear → sRGB
      composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      composer.setSize(window.innerWidth, window.innerHeight);
      useBloom = true;
    } catch (e) { useBloom = false; composer = null; }
  })();
  function renderScene() { if (useBloom) composer.render(); else renderer.render(scene, camera); }

  // --- Lights ---
  scene.add(new THREE.AmbientLight(CFG.ambientColor, CFG.ambientInt));
  scene.add(new THREE.HemisphereLight(0x445277, 0x0a0a10, 0.3));
  const glow = new THREE.PointLight(CFG.glowColor, CFG.glowInt, CFG.glowDist);
  scene.add(glow);

  // -------------------------------------------------------------------------
  // Procedural detail texture (a tileable grey speckle, generated in code)
  // -------------------------------------------------------------------------
  function makeNoiseTex(repeat) {
    const s = 128, lr = 16, lo = new Float32Array(lr * lr);
    for (let i = 0; i < lr * lr; i++) lo[i] = Math.random();
    const cv = document.createElement('canvas'); cv.width = cv.height = s;
    const c2 = cv.getContext('2d'), img = c2.createImageData(s, s), d = img.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const gx = x / s * lr, gy = y / s * lr;
      const x0 = Math.floor(gx) % lr, y0 = Math.floor(gy) % lr, x1 = (x0 + 1) % lr, y1 = (y0 + 1) % lr;
      const fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const top = lo[y0 * lr + x0] * (1 - sx) + lo[y0 * lr + x1] * sx;
      const bot = lo[y1 * lr + x0] * (1 - sx) + lo[y1 * lr + x1] * sx;
      let v = top * (1 - sy) + bot * sy;       // tileable blotches
      v = (0.72 + v * 0.28) * (0.93 + Math.random() * 0.07); // + fine grain
      const g = Math.max(0, Math.min(255, v * 255)) | 0, k = (y * s + x) * 4;
      d[k] = g; d[k + 1] = g; d[k + 2] = g; d[k + 3] = 255;
    }
    c2.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    return tex;
  }
  const floorTex = makeNoiseTex(7);
  const rockTex = makeNoiseTex(3);

  // --- Shared materials (vertex-coloured; per-chunk geometry is disposed) ---
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: floorTex, roughness: 0.95, metalness: 0, flatShading: true });
  const ceilMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: floorTex, roughness: 1.0, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  const rockMat  = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: rockTex, roughness: 0.9, metalness: 0, flatShading: true });
  const ballMat  = new THREE.MeshStandardMaterial({ color: CFG.ballColor, emissive: CFG.ballEmissive, emissiveIntensity: CFG.ballEmissiveInt, roughness: 0.3, metalness: 0.15 });
  const crystalMat = new THREE.MeshBasicMaterial({ color: CFG.crystalColor });
  const glowMat  = new THREE.MeshBasicMaterial({ color: CFG.glowClusterColor });
  const crystalGeo = new THREE.OctahedronGeometry(CFG.crystalSize, 0);
  const glowGeo  = new THREE.OctahedronGeometry(CFG.glowCrystalSize, 0);
  const popGeo   = new THREE.IcosahedronGeometry(0.5, 0);

  // --- Ball (with a faint wireframe shell so its rolling reads) ---
  const ball = new THREE.Mesh(new THREE.SphereGeometry(CFG.ballRadius, 24, 18), ballMat);
  ball.add(new THREE.Mesh(
    new THREE.SphereGeometry(CFG.ballRadius * 1.01, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x7fd8ff, wireframe: true, transparent: true, opacity: 0.45 })
  ));
  scene.add(ball);

  // -------------------------------------------------------------------------
  // Noise + world height fields (continuous → chunks tile seamlessly)
  // -------------------------------------------------------------------------
  function vhash(ix, iz) {
    let h = (Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const a = vhash(xi, zi), b = vhash(xi + 1, zi), c = vhash(xi, zi + 1), d = vhash(xi + 1, zi + 1);
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, z) {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < 4; o++) { sum += amp * vnoise(x * freq, z * freq); norm += amp; amp *= 0.5; freq *= 2.0; }
    return sum / norm;
  }
  function hills(x, z) {
    const F = CFG.floorFreq;
    const wx = (fbm(x * F * 0.5 + 19.3, z * F * 0.5 + 7.1) - 0.5) * CFG.warpAmt;
    const wz = (fbm(x * F * 0.5 - 4.7, z * F * 0.5 + 12.9) - 0.5) * CFG.warpAmt;
    const detail = (fbm((x + wx) * F, (z + wz) * F) * 2 - 1) * CFG.floorAmp;
    const macro = (vnoise(x * F * 0.16 + 50, z * F * 0.16 + 50) * 2 - 1) * CFG.macroAmp;
    return detail + macro;
  }
  function region(x, z) { return fbm(x * CFG.biomeFreq + 123.4, z * CFG.biomeFreq + 76.5); }
  function ceilingGap(x, z) {
    const rr = clamp01((region(x, z) - 0.35) / 0.4);
    const s = rr * rr * (3 - 2 * rr);
    return CFG.tunnelGap + (CFG.chamberGap - CFG.tunnelGap) * s;
  }
  function ceilingHeight(x, z) {
    return hills(x, z) + ceilingGap(x, z) + (vnoise(x * 0.05 + 9, z * 0.05 - 3) * 2 - 1) * CFG.ceilNoiseAmp;
  }

  let runSeed = 1;
  const pitMemo = new Map();
  function getPit(cx, cz) {
    const k = cx + ',' + cz;
    if (pitMemo.has(k)) return pitMemo.get(k);
    let pit = null;
    if (Math.abs(cx) > 1 || Math.abs(cz) > 1) {
      const r = mulberry32((hash2(cx, cz) ^ (runSeed >>> 0) ^ 0x9e3779b1) >>> 0);
      if (r() < CFG.pitChance) {
        const safe = Math.max(0, CFG.chunkSize / 2 - CFG.pitRadius * 1.25);
        pit = { x: cx * CFG.chunkSize + (r() * 2 - 1) * safe, z: cz * CFG.chunkSize + (r() * 2 - 1) * safe };
      }
    }
    pitMemo.set(k, pit);
    return pit;
  }
  function pitDepthAt(x, z) {
    const cx = Math.round(x / CFG.chunkSize), cz = Math.round(z / CFG.chunkSize);
    const p = getPit(cx, cz);
    if (!p) return 0;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d >= CFG.pitRadius) return 0;
    return CFG.pitDepth * (0.5 + 0.5 * Math.cos(Math.PI * d / CFG.pitRadius));
  }
  function floorHeight(x, z) { return hills(x, z) - pitDepthAt(x, z); }

  function hash2(ix, iz) {
    let h = (Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // -------------------------------------------------------------------------
  // Chunk building
  // -------------------------------------------------------------------------
  const chunks = new Map();
  const collected = new Set();
  const key = function (cx, cz) { return cx + ',' + cz; };

  function displacePlane(geo, ox, oz, fn) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, fn(ox + p.getX(i), oz + p.getZ(i)));
    geo.computeVertexNormals();
  }
  // Paint per-vertex colours via a callback (worldX, localY/height, worldZ) -> [r,g,b]
  function paint(geo, ox, oz, cb) {
    const p = geo.attributes.position, n = p.count, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const c = cb(ox + p.getX(i), p.getY(i), oz + p.getZ(i));
      arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2];
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  }
  const HRANGE = CFG.floorAmp + CFG.macroAmp;
  function floorColor(wx, h, wz) {
    const t = clamp01((h + HRANGE) / (2 * HRANGE));         // height 0..1
    const m = 0.82 + vnoise(wx * 0.25, wz * 0.25) * 0.36;   // mottle
    return [(0.16 + 0.16 * t) * m, (0.15 + 0.15 * t) * m, (0.20 + 0.17 * t) * m];
  }
  function ceilColor(wx, h, wz) {
    const m = 0.85 + vnoise(wx * 0.2 + 4, wz * 0.2 + 4) * 0.3;
    return [0.12 * m, 0.11 * m, 0.15 * m];
  }

  function buildChunk(cx, cz) {
    const group = new THREE.Group();
    const ox = cx * CFG.chunkSize, oz = cz * CFG.chunkSize, S = CFG.chunkSize, seg = CFG.floorSeg;
    const colliders = [], crystals = [];
    const reg = region(ox, oz);                  // biome at chunk centre
    const open = clamp01((reg - 0.35) / 0.4);    // 0 tunnel … 1 chamber

    // Floor
    const floorGeo = new THREE.PlaneGeometry(S, S, seg, seg);
    floorGeo.rotateX(-Math.PI / 2);
    displacePlane(floorGeo, ox, oz, floorHeight);
    paint(floorGeo, ox, oz, floorColor);
    const floor = new THREE.Mesh(floorGeo, floorMat); floor.position.set(ox, 0, oz); group.add(floor);

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(S, S, seg, seg);
    ceilGeo.rotateX(Math.PI / 2);
    displacePlane(ceilGeo, ox, oz, ceilingHeight);
    paint(ceilGeo, ox, oz, ceilColor);
    const ceil = new THREE.Mesh(ceilGeo, ceilMat); ceil.position.set(ox, 0, oz); group.add(ceil);

    const rnd = mulberry32((hash2(cx, cz) ^ (runSeed >>> 0)) >>> 0);

    // Rock formations — denser in tunnels, varied shapes (incl. floor↔ceiling columns)
    const rockCount = Math.round(CFG.rocksPerChunk * (0.6 + (1 - open) * 0.9));
    for (let i = 0; i < rockCount; i++) {
      const wx = ox + (rnd() - 0.5) * S, wz = oz + (rnd() - 0.5) * S;
      const baseY = floorHeight(wx, wz);
      if (baseY < -6) continue;                   // not inside a pit
      const ty = rnd();
      let geo, h, cr, top, tint;
      if (ty < 0.46) {                            // stalagmite
        const r = CFG.rockMinR + rnd() * (CFG.rockMaxR - CFG.rockMinR);
        h = CFG.rockMinH + rnd() * (CFG.rockMaxH - CFG.rockMinH);
        geo = new THREE.ConeGeometry(r, h, 6 + (rnd() * 4 | 0));
        cr = r * 0.78; top = baseY + h * 0.7; tint = 0;
      } else if (ty < 0.68) {                     // boulder (jumpable)
        const r = CFG.rockMinR * 1.2 + rnd() * 2.2;
        h = r * 1.4;
        geo = new THREE.IcosahedronGeometry(r, 0);
        cr = r * 0.85; top = baseY + h * 0.6; tint = 0.04;
      } else if (ty < 0.88) {                     // tall spire
        const r = CFG.rockMinR * 0.6 + rnd() * 0.9;
        h = CFG.rockMaxH * 0.9 + rnd() * 5;
        geo = new THREE.ConeGeometry(r, h, 5);
        cr = r * 0.8; top = baseY + h * 0.8; tint = -0.03;
      } else {                                    // floor-to-ceiling column
        const gap = ceilingHeight(wx, wz) - baseY;
        h = Math.max(6, gap);
        const r = 1.0 + rnd() * 1.6;
        geo = new THREE.CylinderGeometry(r * 0.7, r, h, 7);
        cr = r * 0.85; top = baseY + h; tint = 0.02;
      }
      paint(geo, 0, 0, function (lx, ly, lz) {
        const u = clamp01((ly + h / 2) / h);      // base → tip
        const m = (0.55 + 0.45 * u) * (0.9 + (rnd0(lx, lz)) * 0.2);
        return [(0.30 + tint) * m, (0.28 + tint) * m, (0.34 + tint) * m];
      });
      const rock = new THREE.Mesh(geo, rockMat);
      rock.position.set(wx, baseY + h / 2, wz);
      rock.rotation.y = rnd() * TAU;
      if (ty < 0.46 || (ty >= 0.68 && ty < 0.88)) rock.position.y = baseY + h / 2;
      group.add(rock);
      colliders.push({ x: wx, z: wz, r: cr, top: top });
    }

    // Glowing crystal pocket (decoration; bright → blooms). Favours open chambers.
    if (rnd() < CFG.glowClusterChance * (0.25 + open)) {
      const gx = ox + (rnd() - 0.5) * S * 0.7, gz = oz + (rnd() - 0.5) * S * 0.7;
      const gBase = floorHeight(gx, gz);
      if (gBase > -6) {
        const n = 3 + (rnd() * 5 | 0);
        for (let i = 0; i < n; i++) {
          const m = new THREE.Mesh(glowGeo, glowMat);
          m.userData.sharedGeo = true;
          const a = rnd() * TAU, rad = rnd() * 2.2, sc = 0.5 + rnd() * 1.3;
          m.position.set(gx + Math.cos(a) * rad, gBase + 0.3 + rnd() * 1.6, gz + Math.sin(a) * rad);
          m.scale.setScalar(sc);
          m.rotation.set(rnd() * TAU, rnd() * TAU, rnd() * TAU);
          group.add(m);
        }
      }
    }

    // Crystals (collectibles)
    const cryCount = Math.round(CFG.crystalsPerChunk * (0.7 + open * 0.6));
    for (let i = 0; i < cryCount; i++) {
      const wx = ox + (rnd() - 0.5) * S * 0.9, wz = oz + (rnd() - 0.5) * S * 0.9;
      const ph = rnd();
      const fY = floorHeight(wx, wz);
      if (fY < -6) continue;
      const id = cx + '_' + cz + '_' + i;
      if (collected.has(id)) continue;
      const m = new THREE.Mesh(crystalGeo, crystalMat);
      m.userData.sharedGeo = true;
      const baseY = fY + CFG.crystalHover;
      m.position.set(wx, baseY, wz);
      group.add(m);
      crystals.push({ mesh: m, x: wx, z: wz, baseY: baseY, id: id, phase: ph * TAU });
    }

    // Stalactites (decoration)
    for (let i = 0; i < CFG.stalactites; i++) {
      const wx = ox + (rnd() - 0.5) * S, wz = oz + (rnd() - 0.5) * S;
      const r = 0.6 + rnd() * 1.3, h = 2 + rnd() * 5;
      const geo = new THREE.ConeGeometry(r, h, 6);
      paint(geo, 0, 0, function (lx, ly, lz) { const m = 0.7 + rnd0(lx, lz) * 0.2; return [0.24 * m, 0.22 * m, 0.28 * m]; });
      const spike = new THREE.Mesh(geo, rockMat);
      const cyY = ceilingHeight(wx, wz);
      spike.position.set(wx, cyY - h / 2, wz);
      spike.rotation.x = Math.PI;
      group.add(spike);
    }

    scene.add(group);
    chunks.set(key(cx, cz), { group: group, colliders: colliders, crystals: crystals });
  }
  // cheap deterministic-ish jitter for per-vertex mottle on rocks
  function rnd0(a, b) { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); }

  function disposeChunk(k) {
    const c = chunks.get(k);
    if (!c) return;
    scene.remove(c.group);
    c.group.traverse(function (o) { if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose(); });
    chunks.delete(k);
  }
  function clearAllChunks() { const ks = Array.from(chunks.keys()); for (let i = 0; i < ks.length; i++) disposeChunk(ks[i]); }
  function updateChunks() {
    const ccx = Math.round(ball.position.x / CFG.chunkSize), ccz = Math.round(ball.position.z / CFG.chunkSize), R = CFG.viewChunks;
    const needed = new Set();
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const k = key(ccx + dx, ccz + dz); needed.add(k);
      if (!chunks.has(k)) buildChunk(ccx + dx, ccz + dz);
    }
    chunks.forEach(function (_, k) { if (!needed.has(k)) disposeChunk(k); });
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------
  const keys = Object.create(null);
  const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', Space: 'jump' };
  let jumpQueued = false;
  window.addEventListener('keydown', function (e) {
    Sfx.resume();
    if (e.code === 'KeyR' && state === 'dead') { startRun(); return; }
    const a = KEYMAP[e.code]; if (!a) return;
    if (a === 'jump') { if (!keys.jump) jumpQueued = true; }
    keys[a] = true;
    if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { const a = KEYMAP[e.code]; if (a) keys[a] = false; });
  window.addEventListener('blur', function () { for (const k in keys) keys[k] = false; });

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const vel = new THREE.Vector3(0, 0, 0);
  let grounded = false, sinceGround = 999, jumpsUsed = 0, camYaw = 0;
  const _axis = new THREE.Vector3();
  const camBase = new THREE.Vector3(0, 8, -11);
  let state = 'playing', score = 0, multiplier = 1, timeLeft = CFG.startTime, elapsed = 0;
  let distance = 0, crystalsGot = 0, lastWarnSec = 99, shake = 0, lastSpeed = 0, clock = 0, best = 0;
  try { best = parseFloat(localStorage.getItem('caveball_best')) || 0; } catch (e) { best = 0; }
  const curFog = new THREE.Color(CFG.biomePalette[0]);

  const pops = [];
  function spawnPop(x, y, z) {
    const mat = new THREE.MeshBasicMaterial({ color: CFG.crystalColor, transparent: true, opacity: 0.9, depthWrite: false });
    const m = new THREE.Mesh(popGeo, mat); m.position.set(x, y, z); m.userData.sharedGeo = true;
    scene.add(m); pops.push({ mesh: m, mat: mat, life: CFG.popLife });
  }
  function updatePops(dt) {
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.life -= dt;
      if (p.life <= 0) { scene.remove(p.mesh); p.mat.dispose(); pops.splice(i, 1); continue; }
      const t = 1 - p.life / CFG.popLife;
      p.mesh.scale.setScalar(1 + t * 3); p.mesh.rotation.y += dt * 5; p.mat.opacity = 0.9 * (1 - t);
    }
  }
  function clearPops() { for (let i = 0; i < pops.length; i++) { scene.remove(pops[i].mesh); pops[i].mat.dispose(); } pops.length = 0; }

  const el = function (id) { return document.getElementById(id); };
  const hudScore = el('stat-score'), hudMult = el('stat-mult'), hudTime = el('stat-time'),
        hudFill = el('timefill'), hudCry = el('stat-crystals'), hudDist = el('stat-dist'),
        hudBest = el('stat-best'), speedfx = el('speedfx'), overlay = el('gameover'),
        goStats = el('go-stats'), goBest = el('go-best');

  function shortestAngle(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }

  // -------------------------------------------------------------------------
  // Simulation (runs only while playing)
  // -------------------------------------------------------------------------
  function update(dt) {
    const px = ball.position.x, pz = ball.position.z;
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
    const Fx = sy, Fz = cy, Rx = -cy, Rz = sy;
    const fwd = (keys.f ? 1 : 0) - (keys.b ? 1 : 0), strafe = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    let dx = Fx * fwd + Rx * strafe, dz = Fz * fwd + Rz * strafe;
    const dl = Math.hypot(dx, dz);

    const accel = (grounded ? 1 : CFG.airControl) * CFG.moveAccel;
    if (dl > 0.0001) {
      dx /= dl; dz /= dl;
      vel.x += dx * accel * dt; vel.z += dz * accel * dt;
      // (1) Grip-steer: rotate the ball's momentum toward the input heading so turns
      // are crisp at any speed (instead of waiting for sideways force to overcome it).
      const h = Math.hypot(vel.x, vel.z);
      if (h > 0.5) {
        const va = Math.atan2(vel.x, vel.z);
        const da = shortestAngle(va, Math.atan2(dx, dz));
        if (Math.abs(da) < 2.4) {                      // skip a hard reverse so S still brakes (no U-turn whip)
          const turn = CFG.turnRate * (grounded ? 1 : CFG.airTurnScale) * dt;
          const na = va + (Math.abs(da) < turn ? da : (da < 0 ? -turn : turn));
          vel.x = h * Math.sin(na); vel.z = h * Math.cos(na);
        }
      }
    }

    if (grounded && CFG.slopeAccel) {
      const e = 0.75;
      const gx = (floorHeight(ball.position.x - e, ball.position.z) - floorHeight(ball.position.x + e, ball.position.z)) / (2 * e);
      const gz = (floorHeight(ball.position.x, ball.position.z - e) - floorHeight(ball.position.x, ball.position.z + e)) / (2 * e);
      vel.x += gx * CFG.slopeAccel * dt; vel.z += gz * CFG.slopeAccel * dt;
    }

    const df = Math.max(0, 1 - (grounded ? CFG.groundDrag : CFG.airDrag) * dt);
    vel.x *= df; vel.z *= df;
    const hsp = Math.hypot(vel.x, vel.z);
    if (hsp > CFG.maxSpeed) { const s = CFG.maxSpeed / hsp; vel.x *= s; vel.z *= s; }

    vel.y -= CFG.gravity * dt;
    if (jumpQueued) {
      const groundEligible = grounded || sinceGround < CFG.coyoteTime;
      if (jumpsUsed === 0 && groundEligible) { vel.y = CFG.jumpSpeed; jumpsUsed = 1; grounded = false; sinceGround = 999; Sfx.jump(); }
      else if (jumpsUsed >= 1 && jumpsUsed < CFG.maxJumps) { vel.y = CFG.jumpSpeed * CFG.airJumpScale; jumpsUsed++; grounded = false; sinceGround = 999; Sfx.jump(); }
    }
    jumpQueued = false;

    ball.position.x += vel.x * dt; ball.position.y += vel.y * dt; ball.position.z += vel.z * dt;

    const fY = floorHeight(ball.position.x, ball.position.z) + CFG.ballRadius;
    if (ball.position.y <= fY) {
      const impact = -vel.y;
      if (!grounded && impact > 8) shake += Math.min(0.6, impact * CFG.shakeLand);
      ball.position.y = fY; if (vel.y < 0) vel.y = 0; grounded = true; sinceGround = 0; jumpsUsed = 0;
    } else { grounded = false; sinceGround += dt; if (jumpsUsed === 0 && sinceGround >= CFG.coyoteTime) jumpsUsed = 1; }

    const cY = ceilingHeight(ball.position.x, ball.position.z) - CFG.ballRadius;
    if (ball.position.y > cY) { ball.position.y = cY; if (vel.y > 0) vel.y = 0; }

    resolveRocks();

    const speed = Math.hypot(vel.x, vel.z);
    if (speed > 0.001) { _axis.set(vel.z, 0, -vel.x).normalize(); ball.rotateOnWorldAxis(_axis, (speed * dt) / CFG.ballRadius); }
    lastSpeed = speed;

    if (speed > CFG.camYawSpeedGate) {
      const fdot = (vel.x * Fx + vel.z * Fz) / speed;
      if (fdot > 0.1) camYaw += shortestAngle(camYaw, Math.atan2(vel.x, vel.z)) * (1 - Math.exp(-CFG.camYawLerp * dt));
    }

    multiplier = 1 + (CFG.maxMultiplier - 1) * clamp01(speed / CFG.multAtSpeed);
    const moved = Math.hypot(ball.position.x - px, ball.position.z - pz);
    distance += moved; score += moved * CFG.distanceScore * multiplier;

    collectCrystals();

    elapsed += dt;
    timeLeft -= (1 + CFG.drainRamp * elapsed) * dt;
    if (timeLeft < 5) { const s = Math.ceil(timeLeft); if (s !== lastWarnSec && s > 0) { lastWarnSec = s; Sfx.warn(); } }

    if (ball.position.y < CFG.deathY) die('fell');
    else if (timeLeft <= 0) { timeLeft = 0; die('time'); }
  }

  function collectCrystals() {
    const ccx = Math.round(ball.position.x / CFG.chunkSize), ccz = Math.round(ball.position.z / CFG.chunkSize);
    const pr2 = CFG.pickRadius * CFG.pickRadius;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = chunks.get(key(ccx + dx, ccz + dz)); if (!c) continue;
      const cs = c.crystals;
      for (let i = 0; i < cs.length; i++) {
        const cr = cs[i]; if (!cr.mesh.visible) continue;
        const ex = ball.position.x - cr.x, ey = ball.position.y - cr.mesh.position.y, ez = ball.position.z - cr.z;
        if (ex * ex + ey * ey + ez * ez < pr2) {
          cr.mesh.visible = false; collected.add(cr.id); crystalsGot++;
          timeLeft += CFG.crystalTime; score += CFG.crystalScore * multiplier;
          spawnPop(cr.x, cr.mesh.position.y, cr.z); Sfx.pickup();
        }
      }
    }
  }

  function resolveRocks() {
    const ccx = Math.round(ball.position.x / CFG.chunkSize), ccz = Math.round(ball.position.z / CFG.chunkSize);
    const by = ball.position.y - CFG.ballRadius;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = chunks.get(key(ccx + dx, ccz + dz)); if (!c) continue;
      const cols = c.colliders;
      for (let i = 0; i < cols.length; i++) {
        const col = cols[i]; if (by > col.top) continue;
        const ex = ball.position.x - col.x, ez = ball.position.z - col.z, min = col.r + CFG.ballRadius, d2 = ex * ex + ez * ez;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) / d;
          ball.position.x += ex * push; ball.position.z += ez * push;
          const nx = ex / d, nz = ez / d, vn = vel.x * nx + vel.z * nz;
          if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
        }
      }
    }
  }

  function animateCrystals(dt) {
    chunks.forEach(function (c) {
      const cs = c.crystals;
      for (let i = 0; i < cs.length; i++) {
        const cr = cs[i]; if (!cr.mesh.visible) continue;
        cr.mesh.rotation.y += CFG.crystalSpin * dt;
        cr.mesh.position.y = cr.baseY + Math.sin(clock * CFG.crystalBobFreq + cr.phase) * CFG.crystalBob;
      }
    });
  }

  function updateCamera(dt) {
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
    const desX = ball.position.x - sy * CFG.camDistance, desZ = ball.position.z - cy * CFG.camDistance, desY = ball.position.y + CFG.camHeight;
    const t = 1 - Math.exp(-CFG.camFollowLerp * dt);
    camBase.x += (desX - camBase.x) * t; camBase.y += (desY - camBase.y) * t; camBase.z += (desZ - camBase.z) * t;
    const ceilCam = ceilingHeight(camBase.x, camBase.z) - 0.6;   // keep camera under the ceiling in tunnels
    if (camBase.y > ceilCam) camBase.y = ceilCam;
    let ox = 0, oy = 0, oz = 0;
    if (shake > 0.0001) {
      ox = (Math.random() - 0.5) * shake; oy = (Math.random() - 0.5) * shake; oz = (Math.random() - 0.5) * shake;
      shake -= shake * Math.min(1, CFG.shakeDecay * dt); if (shake < 0.001) shake = 0;
    }
    camera.position.set(camBase.x + ox, camBase.y + oy, camBase.z + oz);
    camera.lookAt(ball.position.x, ball.position.y + CFG.camLookHeight, ball.position.z);
  }

  function updateJuice(dt) {
    if (state !== 'playing') lastSpeed *= Math.max(0, 1 - 3 * dt);
    const targetFov = CFG.fovBase + CFG.fovBoost * clamp01(lastSpeed / CFG.fovSpeedRef);
    camera.fov += (targetFov - camera.fov) * Math.min(1, 8 * dt);
    camera.updateProjectionMatrix();
    if (speedfx) speedfx.style.opacity = (0.55 * clamp01((lastSpeed - CFG.fovSpeedRef * 0.45) / (CFG.fovSpeedRef * 0.55))).toFixed(3);
    Sfx.setSpeed(lastSpeed, CFG.maxSpeed);

    // Biome fog/background tint, lerped by the region under the ball
    const r = clamp01(region(ball.position.x, ball.position.z));
    const pal = CFG.biomePalette, seg = r * (pal.length - 1), i0 = Math.floor(seg), i1 = Math.min(pal.length - 1, i0 + 1);
    const tmp = new THREE.Color(pal[i0]).lerp(new THREE.Color(pal[i1]), seg - i0);
    curFog.lerp(tmp, Math.min(1, dt * 1.5));
    scene.fog.color.copy(curFog); scene.background.copy(curFog);
  }

  function updateHUD() {
    if (hudScore) hudScore.textContent = Math.floor(score).toLocaleString();
    if (hudMult) hudMult.textContent = '×' + multiplier.toFixed(1);
    if (hudTime) hudTime.textContent = Math.max(0, timeLeft).toFixed(1);
    if (hudFill) hudFill.style.width = (clamp01(timeLeft / CFG.startTime) * 100).toFixed(1) + '%';
    if (hudCry) hudCry.textContent = '◆ ' + crystalsGot;
    if (hudDist) hudDist.textContent = Math.floor(distance) + ' m';
    if (hudBest) hudBest.textContent = 'Best ' + Math.floor(best).toLocaleString();
    const low = state === 'playing' && timeLeft < 5;
    if (hudTime) hudTime.classList.toggle('low', low);
    if (hudFill) hudFill.classList.toggle('low', low);
  }

  // -------------------------------------------------------------------------
  // Run lifecycle
  // -------------------------------------------------------------------------
  function die(cause) {
    if (state !== 'playing') return;
    state = 'dead'; shake += CFG.shakeDeath; Sfx.die();
    if (score > best) { best = score; try { localStorage.setItem('caveball_best', String(Math.floor(best))); } catch (e) {} }
    if (goStats) goStats.innerHTML = 'Score <b>' + Math.floor(score).toLocaleString() + '</b><span>◆ ' + crystalsGot + ' &nbsp;·&nbsp; ' + Math.floor(distance) + ' m</span>';
    if (goBest) goBest.textContent = 'Best ' + Math.floor(best).toLocaleString() + (score >= best && score > 0 ? '  — new best!' : '');
    if (overlay) overlay.hidden = false;
  }
  function startRun() {
    runSeed = (Math.random() * 2147483647) | 0;
    pitMemo.clear(); collected.clear(); clearAllChunks(); clearPops();
    ball.position.set(0, floorHeight(0, 0) + CFG.ballRadius, 0); ball.rotation.set(0, 0, 0);
    vel.set(0, 0, 0); grounded = false; sinceGround = 999; jumpsUsed = 0; camYaw = 0;
    camBase.set(0, ball.position.y + CFG.camHeight, -CFG.camDistance);
    camera.fov = CFG.fovBase; camera.updateProjectionMatrix();
    score = 0; multiplier = 1; timeLeft = CFG.startTime; elapsed = 0; distance = 0; crystalsGot = 0; lastWarnSec = 99; shake = 0; lastSpeed = 0;
    state = 'playing'; if (overlay) overlay.hidden = true;
    updateChunks();
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------
  function tick(dt) {
    clock += dt;
    if (state === 'playing') update(dt);
    animateCrystals(dt); updatePops(dt); updateChunks(); updateCamera(dt); updateJuice(dt);
    glow.position.set(ball.position.x, ball.position.y + 1.6, ball.position.z);
    updateHUD(); renderScene();
  }
  let last = performance.now();
  function frame(now) { let dt = (now - last) / 1000; last = now; if (dt > 0.05) dt = 0.05; tick(dt); requestAnimationFrame(frame); }
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (useBloom) composer.setSize(window.innerWidth, window.innerHeight);
  });
  if (overlay) overlay.addEventListener('click', function () { if (state === 'dead') startRun(); });

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  startRun();
  requestAnimationFrame(frame);
  setTimeout(function () { const h = el('controls-hint'); if (h) h.classList.add('fade'); }, 7000);

  window.__caveball = {
    tick: tick, ball: ball, vel: vel, keys: keys, CFG: CFG,
    state: function () { return state; },
    stats: function () { return { score: score, multiplier: multiplier, timeLeft: timeLeft, distance: distance, crystals: crystalsGot, best: best }; },
    chunkCount: function () { return chunks.size; },
    grounded: function () { return grounded; }, jumpsUsed: function () { return jumpsUsed; },
    camYaw: function () { return camYaw; },
    bloom: function () { return useBloom; },
    sample: function (x, z) { return { floor: +floorHeight(x, z).toFixed(2), ceil: +ceilingHeight(x, z).toFixed(2), region: +region(x, z).toFixed(3) }; },
    startRun: startRun, die: die,
    nearestCrystal: function () {
      let bestC = null, bd = Infinity;
      chunks.forEach(function (c) { for (let i = 0; i < c.crystals.length; i++) { const cr = c.crystals[i]; if (!cr.mesh.visible) continue; const d = Math.hypot(cr.x - ball.position.x, cr.z - ball.position.z); if (d < bd) { bd = d; bestC = { x: cr.x, y: cr.mesh.position.y, z: cr.z, id: cr.id }; } } });
      return bestC;
    },
    findPit: function () { let p = null; for (let cx = -4; cx <= 4 && !p; cx++) for (let cz = -4; cz <= 4 && !p; cz++) { const g = getPit(cx, cz); if (g) p = { x: g.x, z: g.z }; } return p; }
  };
})();
