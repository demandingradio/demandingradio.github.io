// Jimbog — renderer, lights, environment reflections and post-processing.
(function () {
  'use strict';
  const JB = window.JB;

  const QUALITY = {
    low:    { ratio: 0.75, shadow: 1024, bloom: false, msaa: 0, tex: 256 },
    medium: { ratio: 1.25, shadow: 2048, bloom: true, msaa: 4, tex: 512 },
    high:   { ratio: 2.0, shadow: 4096, bloom: true, msaa: 4, tex: 512 }
  };

  const FinalShader = {
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uDamage: { value: 0 }, uFlash: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) }, uSat: { value: 1.08 }, uVignette: { value: 0.55 }, uHeal: { value: 0 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float uTime, uDamage, uFlash, uSat, uVignette, uHeal; uniform vec2 uRes; varying vec2 vUv;',
      'vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
      'void main(){',
      '  vec2 dir = vUv - 0.5;',
      '  float ca = 0.0008 + uDamage * 0.007;',
      '  vec3 col = vec3(texture2D(tDiffuse, vUv + dir * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - dir * ca).b);',
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
    const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 260);
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
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.045;
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
        const pars = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType };
        if (Q.msaa && renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget) {
          rt = new THREE.WebGLMultisampleRenderTarget(size.x, size.y, pars);
          rt.samples = Q.msaa;
        } else rt = new THREE.WebGLRenderTarget(size.x, size.y, pars);
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
    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      vmCamera.aspect = w / h; vmCamera.updateProjectionMatrix();
      if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(w, h);
      }
      if (finalPass) finalPass.uniforms.uRes.value.set(w, h);
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

    return {
      renderer, scene, camera, vmScene, vmCamera, vmHemi, vmKey, vmFlash, sun, hemi, env,
      composer, finalPass, bloomPass, render, resize, flash, update, quality: Q
    };
  }

  JB.Render = { create, QUALITY };
})();
