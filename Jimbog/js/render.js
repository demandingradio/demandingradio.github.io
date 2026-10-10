// Jimbog — renderer, lights, environment reflections and post-processing.
(function () {
  'use strict';
  const JB = window.JB;

  // Post-processing renders into plain (non-multisampled) targets and
  // anti-aliases with FXAA in the final pass. three.js r137 invalidates a
  // multisampled target's colour after every render() into it, so drawing
  // the world and then the view-model into one MSAA target leaves black on
  // real GPUs (software GL ignores the invalidate, which hid the bug).
  const QUALITY = {
    low:    { ratio: 0.75, shadow: 1024, bloom: false, tex: 256 },
    medium: { ratio: 1.25, shadow: 2048, bloom: true, tex: 512 },
    high:   { ratio: 2.0, shadow: 4096, bloom: true, tex: 512 }
  };

  const FinalShader = {
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uDamage: { value: 0 }, uFlash: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) }, uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 768) },
      uSat: { value: 1.08 }, uVignette: { value: 0.55 }, uHeal: { value: 0 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float uTime, uDamage, uFlash, uSat, uVignette, uHeal; uniform vec2 uRes, uTexel; varying vec2 vUv;',
      'vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
      // FXAA (Lottes, PC-lite). Luma uses sqrt() because the input is linear.
      'vec3 fxaa(vec2 uv){',
      '  vec3 nw = texture2D(tDiffuse, uv + vec2(-1.0, -1.0) * uTexel).rgb, ne = texture2D(tDiffuse, uv + vec2(1.0, -1.0) * uTexel).rgb;',
      '  vec3 sw = texture2D(tDiffuse, uv + vec2(-1.0, 1.0) * uTexel).rgb, se = texture2D(tDiffuse, uv + vec2(1.0, 1.0) * uTexel).rgb;',
      '  vec3 m = texture2D(tDiffuse, uv).rgb; vec3 W = vec3(0.299, 0.587, 0.114);',
      '  float lNW = dot(sqrt(nw), W), lNE = dot(sqrt(ne), W), lSW = dot(sqrt(sw), W), lSE = dot(sqrt(se), W), lM = dot(sqrt(m), W);',
      '  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));',
      '  vec2 d = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));',
      '  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);',
      '  float rcp = 1.0 / (min(abs(d.x), abs(d.y)) + red);',
      '  d = clamp(d * rcp, vec2(-8.0), vec2(8.0)) * uTexel;',
      '  vec3 a = 0.5 * (texture2D(tDiffuse, uv + d * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, uv + d * (2.0 / 3.0 - 0.5)).rgb);',
      '  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, uv - d * 0.5).rgb + texture2D(tDiffuse, uv + d * 0.5).rgb);',
      '  float lB = dot(sqrt(b), W);',
      '  return (lB < lMin || lB > lMax) ? a : b;',
      '}',
      'void main(){',
      '  vec2 dir = vUv - 0.5;',
      '  vec3 col = fxaa(vUv);',
      '  if (uDamage > 0.01) { vec2 off = dir * uDamage * 0.007; col.r = texture2D(tDiffuse, vUv + off).r; col.b = texture2D(tDiffuse, vUv - off).b; }',
      '  col = toSRGB(col);',
      '  float l = dot(col, vec3(0.299, 0.587, 0.114));',
      '  col = mix(vec3(l), col, uSat);',
      '  col += vec3(-0.012, 0.004, 0.02) * (1.0 - l) + vec3(0.025, 0.012, -0.02) * l;',
      '  col = (col - 0.5) * 1.07 + 0.5;',
      '  float v = smoothstep(0.92, 0.2, length(dir * vec2(1.0, 0.8)));',
      '  col *= mix(1.0, v, uVignette);',
      '  float edge = smoothstep(0.3, 0.78, length(dir));',
      '  col = mix(col, vec3(0.55, 0.02, 0.03), edge * clamp(uDamage, 0.0, 1.0) * 0.75);',
      '  col = mix(col, col + vec3(0.05, 0.25, 0.12), edge * uHeal);',
      '  float n = fract(sin(dot(vUv * uRes + fract(uTime) * 61.0, vec2(12.9898, 78.233))) * 43758.5453);',
      '  col += (n - 0.5) * 0.022;',
      '  gl_FragColor = vec4(col + uFlash, 1.0);',
      '}'
    ].join('\n')
  };

  function makeEnvironment(renderer) {
    // A small procedural "factory interior" for reflections: dark walls,
    // warm and cool light panels, a bright skylight strip.
    const s = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 30), new THREE.MeshBasicMaterial({ color: 0x23262b, side: THREE.BackSide }));
    s.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ color: 0x3a3632 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -5.9; s.add(floor);
    const panel = (w, h, x, y, z, ry, rx, col, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); s.add(m);
    };
    for (let i = -2; i <= 2; i++) panel(1.5, 6, i * 5, 5.9, 0, 0, Math.PI / 2, 0xffe2bd, 3.2);
    panel(20, 3, 0, 2, -14.9, 0, 0, 0x9ec8ff, 1.2);
    panel(10, 2.5, 14.9, 0, 4, -Math.PI / 2, 0, 0xffb070, 1.4);
    panel(8, 2, -14.9, -1, -3, Math.PI / 2, 0, 0xd8f0ff, 1.0);
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(s, 0.035);
    pm.dispose();
    return rt.texture;
  }

  function create(canvas, qualityName, level) {
    const Q = QUALITY[qualityName] || QUALITY.medium;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !Q.bloom, powerPreference: 'high-performance', stencil: false });
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(Math.min(dpr, Q.ratio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d10);
    scene.fog = new THREE.FogExp2(0x15191e, 0.0085);
    const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.08, 260);
    scene.add(camera);

    const env = makeEnvironment(renderer);
    scene.environment = env;

    const hemi = new THREE.HemisphereLight(0xa9bfd6, 0x2b241d, 0.32);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
    const b = level.bounds, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx - level.SUN_DIR.x * 90, -level.SUN_DIR.y * 90, cz - level.SUN_DIR.z * 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    const sc = sun.shadow.camera;
    sc.left = -74; sc.right = 74; sc.top = 74; sc.bottom = -74; sc.near = 10; sc.far = 190;
    sc.updateProjectionMatrix();   // three only reads the frustum through the projection matrix
    const texel = 148 / Q.shadow;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02 + texel * 0.6;
    sun.shadow.radius = 2.5;
    scene.add(sun); scene.add(sun.target);

    // Fixed pool of flash lights (muzzle flashes, explosions). The count never
    // changes so shaders never recompile mid-game.
    const flashes = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffb060, 0, 9, 2);
      l.position.set(0, -50, 0);
      scene.add(l);
      flashes.push({ light: l, t: 0, dur: 0.06, peak: 0 });
    }

    // View-model (first-person weapon + paws) lives in its own scene/camera so
    // it never clips into walls and can use a narrower FOV.
    const vmScene = new THREE.Scene();
    vmScene.environment = env;
    const vmCamera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.01, 10);
    vmScene.add(vmCamera);
    const vmHemi = new THREE.HemisphereLight(0xcfe0ff, 0x302820, 0.35);
    const vmKey = new THREE.DirectionalLight(0xfff2e0, 0.5);
    vmKey.position.set(0.4, 1, 0.6);
    const vmFlash = new THREE.PointLight(0xffb060, 0, 3, 2);
    vmFlash.position.set(0.1, -0.05, -0.6);
    vmScene.add(vmHemi, vmKey, vmFlash);

    let composer = null, finalPass = null, bloomPass = null;
    if (Q.bloom && THREE.EffectComposer) {
      try {
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        let rt;
        // Half-float keeps dark scenes free of banding; fall back to 8-bit
        // where the GPU can't render to float targets.
        const halfOK = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
        const pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: halfOK ? THREE.HalfFloatType : THREE.UnsignedByteType };
        rt = new THREE.WebGLRenderTarget(size.x, size.y, pars);
        // 24-bit depth (the default here is 16-bit, which makes thin trims flicker)
        if (renderer.capabilities.isWebGL2) rt.depthTexture = new THREE.DepthTexture(size.x, size.y, THREE.UnsignedIntType);
        composer = new THREE.EffectComposer(renderer, rt);
        composer.addPass(new THREE.RenderPass(scene, camera));
        const vmPass = new THREE.RenderPass(vmScene, vmCamera);
        vmPass.clear = false; vmPass.clearDepth = true;
        composer.addPass(vmPass);
        bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.82);
        composer.addPass(bloomPass);
        finalPass = new THREE.ShaderPass(FinalShader);
        composer.addPass(finalPass);
      } catch (e) {
        console.warn('Post-processing disabled:', e);
        composer = null;
      }
    }
    renderer.autoClear = !composer ? false : true;

    function render() {
      if (composer) composer.render();
      else {
        renderer.clear();
        renderer.render(scene, camera);
        renderer.clearDepth();
        renderer.render(vmScene, vmCamera);
      }
    }
    // Safety net: if post-processing produces a black picture on this GPU,
    // drop back to direct rendering. Reads two pixel rows of the frame that
    // was just drawn (only called a few times, at startup).
    let blackChecks = 0;
    function looksBlack() {
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      if (w < 4 || h < 4) return false;
      const row = new Uint8Array(w * 4);
      let max = 0;
      for (const y of [Math.floor(h * 0.5), Math.floor(h * 0.3)]) {
        gl.readPixels(0, y, w, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
        for (let i = 0; i < row.length; i += 4) max = Math.max(max, row[i], row[i + 1], row[i + 2]);
      }
      return max < 6;
    }
    function selfCheck() {
      if (!composer) return;
      if (looksBlack()) {
        if (++blackChecks >= 3) {
          console.warn('Jimbog: post-processing rendered black on this GPU; switching to direct rendering.');
          composer = null; finalPass = null; bloomPass = null;
          api.composer = null; api.finalPass = null; api.bloomPass = null;
          renderer.autoClear = false;
          renderer.setRenderTarget(null);
        }
      } else blackChecks = 0;
    }
    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      vmCamera.aspect = w / h; vmCamera.updateProjectionMatrix();
      if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(w, h);
      }
      if (finalPass) {
        const pr = renderer.getPixelRatio();
        finalPass.uniforms.uRes.value.set(w, h);
        finalPass.uniforms.uTexel.value.set(1 / Math.max(1, Math.floor(w * pr)), 1 / Math.max(1, Math.floor(h * pr)));
      }
    }
    resize();
    window.addEventListener('resize', resize);

    // Briefly light a flash at a position.
    function flash(pos, color, intensity, dist, dur) {
      let f = flashes[0];
      for (const x of flashes) if (x.t <= 0) { f = x; break; } else if (x.t < f.t) f = x;
      f.light.position.copy(pos);
      f.light.color.setHex(color);
      f.light.distance = dist;
      f.peak = intensity; f.dur = dur; f.t = dur;
      f.light.intensity = intensity;
    }
    function update(dt, time) {
      for (const f of flashes) {
        if (f.t > 0) {
          f.t -= dt;
          f.light.intensity = f.t > 0 ? f.peak * (f.t / f.dur) : 0;
          if (f.t <= 0) f.light.position.y = -50;
        }
      }
      if (finalPass) finalPass.uniforms.uTime.value = time;
    }

    const api = {
      renderer, scene, camera, vmScene, vmCamera, vmHemi, vmKey, vmFlash, sun, hemi, env,
      composer, finalPass, bloomPass, render, resize, flash, update, selfCheck, quality: Q
    };
    return api;
  }

  JB.Render = { create, QUALITY };
})();
