/* Diorama — post-processing: HDR bloom, tilt-shift / depth of field, colour
   grading presets, vignette, film grain, letterbox, PNG capture. */
(function () {
'use strict';
const D = window.D;

const PRESETS = {
  natural:   { name: 'Natural',        exposure: 1.0,  contrast: 1.04, saturation: 1.06, temp: 0.0,   tint: 0.0,  lift: 0.0,  split: 0,   grain: 0.02, vignette: 0.22 },
  diorama:   { name: 'Diorama',        exposure: 1.05, contrast: 1.12, saturation: 1.38, temp: 0.06,  tint: 0.0,  lift: 0.0,  split: 0,   grain: 0.02, vignette: 0.3, tilt: true },
  golden:    { name: 'Golden hour',    exposure: 1.05, contrast: 1.08, saturation: 1.15, temp: 0.35,  tint: 0.04, lift: 0.02, split: 0,   grain: 0.03, vignette: 0.3 },
  morning:   { name: 'Cool morning',   exposure: 1.05, contrast: 0.96, saturation: 0.92, temp: -0.28, tint: -0.02, lift: 0.04, split: 0,  grain: 0.02, vignette: 0.2 },
  cinematic: { name: 'Teal & orange',  exposure: 1.0,  contrast: 1.12, saturation: 1.1,  temp: 0.05,  tint: 0.0,  lift: 0.01, split: 1,   grain: 0.04, vignette: 0.35 },
  vivid:     { name: 'Vivid',          exposure: 1.02, contrast: 1.14, saturation: 1.5,  temp: 0.0,   tint: 0.0,  lift: 0.0,  split: 0,   grain: 0.0,  vignette: 0.15 },
  pastel:    { name: 'Pastel',         exposure: 1.12, contrast: 0.84, saturation: 0.82, temp: 0.04,  tint: 0.03, lift: 0.09, split: 0,   grain: 0.02, vignette: 0.1 },
  vintage:   { name: 'Vintage film',   exposure: 1.0,  contrast: 0.92, saturation: 0.72, temp: 0.18,  tint: 0.02, lift: 0.07, split: 0,   grain: 0.12, vignette: 0.5 },
  noir:      { name: 'Noir',           exposure: 1.05, contrast: 1.38, saturation: 0.0,  temp: 0.0,   tint: 0.0,  lift: 0.0,  split: 0,   grain: 0.1,  vignette: 0.55 }
};

const Post = D.Post = {
  PRESETS,
  preset: 'natural',
  p: Object.assign({}, PRESETS.natural, { bloom: 0.25, tiltOn: false, tiltY: 0.5, tiltBand: 0.12, tiltBlur: 1, dofOn: false, dofFocus: 800, dofAperture: 1.2, chroma: 0, letterbox: 0 }),
  pixelRatio: 1,
  enabled: true
};

const quadGeo = new THREE.PlaneGeometry(2, 2);
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
function pass(frag, uniforms) {
  const m = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const s = new THREE.Scene(); s.add(new THREE.Mesh(quadGeo, m));
  return { m, s, u: uniforms };
}
function rt(w, h, opt) {
  return new THREE.WebGLRenderTarget(w, h, Object.assign({ type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }, opt || {}));
}

Post.init = function (renderer) {
  Post.renderer = renderer;
  renderer.outputEncoding = THREE.LinearEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  const isGL2 = renderer.capabilities.isWebGL2;
  const makeScene = (w, h, plain) => {
    const depthTex = new THREE.DepthTexture(w, h);
    depthTex.type = THREE.UnsignedIntType;
    let t;
    if (!plain && isGL2 && D.Q.high && THREE.WebGLMultisampleRenderTarget) {
      t = new THREE.WebGLMultisampleRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: depthTex, depthBuffer: true });
      t.samples = 4;
    } else t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: depthTex, depthBuffer: true });
    return t;
  };
  Post.makeScene = makeScene;
  Post.rtScene = makeScene(4, 4);
  Post.rtMS = Post.rtScene; Post.rtPlain = null; // plain target (resolvable depth) is made on demand for depth of field
  Post.rtA = rt(4, 4); Post.rtB = rt(4, 4); Post.rtC = rt(4, 4); Post.rtD = rt(4, 4); Post.rtE = rt(4, 4);

  Post.bright = pass(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
    void main(){
      vec3 c = vec3(0.0);
      c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1.0, -1.0)).rgb;
      c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb; c += texture2D(tSrc, vUv + uTexel * vec2(1.0, 1.0)).rgb;
      c *= 0.25;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);   // one bad pixel must never bloom into a white blob
      c = clamp(c, 0.0, 40.0);
      float l = max(max(c.r, c.g), c.b);
      float k = smoothstep(uThresh, uThresh * 1.8 + 0.2, l);
      gl_FragColor = vec4(min(c * k, vec3(40.0)), 1.0);
    }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1.0 } });
  Post.blur = pass(`uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;
      c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162; c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
      c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703; c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
      gl_FragColor = vec4(c, 1.0);
    }`, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  Post.down = pass(`uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tSrc, vUv).rgb, 1.0); }`, { tSrc: { value: null } });
  // Depth of field / tilt-shift gather blur (half res)
  Post.dof = pass(`uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uTexel; uniform float uNear, uFar;
    uniform float uTiltOn, uTiltY, uTiltBand, uTiltBlur, uDofOn, uFocus, uAperture, uAspect; varying vec2 vUv;
    float linD(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    float coc(vec2 uv){
      float c = 0.0;
      if (uTiltOn > 0.5) c = max(c, smoothstep(uTiltBand, uTiltBand + 0.28, abs(uv.y - uTiltY)) * uTiltBlur);
      if (uDofOn > 0.5) { float z = linD(texture2D(tDepth, uv).r); c = max(c, clamp(abs(1.0 / uFocus - 1.0 / z) * uFocus * uAperture * 1.2, 0.0, 1.0)); }
      return c;
    }
    void main(){
      float c0 = coc(vUv);
      vec3 acc = texture2D(tSrc, vUv).rgb; float wsum = 1.0;
      float R = c0 * 14.0;
      float rot = fract(sin(dot(vUv * 4000.0, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
      if (R > 0.3) {
        for (int i = 1; i < 32; i++) {
          float fi = float(i);
          float r = sqrt(fi / 32.0) * R;
          float a = fi * 2.39996323 + rot;
          vec2 o = vec2(cos(a), sin(a)) * r * uTexel;
          vec2 uv = vUv + o;
          float cs = coc(uv);
          float w = clamp(cs * 14.0 - r + 1.0, 0.0, 1.0) + 0.05;
          acc += texture2D(tSrc, uv).rgb * w; wsum += w;
        }
      }
      gl_FragColor = vec4(acc / wsum, c0);
    }`, { tSrc: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uNear: { value: 1 }, uFar: { value: 1000 },
      uTiltOn: { value: 0 }, uTiltY: { value: 0.5 }, uTiltBand: { value: 0.12 }, uTiltBlur: { value: 1 }, uDofOn: { value: 0 }, uFocus: { value: 800 }, uAperture: { value: 1 }, uAspect: { value: 1 } });
  Post.comp = pass(`uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB; uniform sampler2D tDof;
    uniform float uBloom, uExposure, uContrast, uSat, uTemp, uTint, uLift, uSplit, uGrain, uVig, uChroma, uTime, uLetter, uUseDof, uTiltSat;
    uniform vec2 uRes; varying vec2 vUv;
    vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec2 uv = vUv;
      vec3 col;
      if (uChroma > 0.001) {
        vec2 dc = (uv - 0.5) * uChroma * 0.012;
        col = vec3(texture2D(tScene, uv + dc).r, texture2D(tScene, uv).g, texture2D(tScene, uv - dc).b);
      } else col = texture2D(tScene, uv).rgb;
      if (uUseDof > 0.5) {
        vec4 d = texture2D(tDof, uv);
        col = mix(col, d.rgb, smoothstep(0.02, 0.35, d.a));
      }
      col += (texture2D(tBloomA, uv).rgb * 0.7 + texture2D(tBloomB, uv).rgb * 0.9) * uBloom;
      col *= uExposure;
      // white balance (temperature / tint)
      col *= vec3(1.0 + uTemp * 0.35, 1.0 + uTint * 0.2, 1.0 - uTemp * 0.35);
      col = aces(col);
      vec3 g = toSRGB(col);
      // grade in display space
      float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
      g = mix(vec3(l), g, uSat + uTiltSat);
      g = (g - 0.5) * uContrast + 0.5;
      g = g * (1.0 - uLift) + uLift * vec3(1.0, 0.97, 0.92);
      if (uSplit > 0.5) {
        float ll = dot(g, vec3(0.333));
        g += mix(vec3(-0.02, 0.03, 0.05), vec3(0.05, 0.015, -0.035), smoothstep(0.2, 0.8, ll));
      }
      // vignette
      vec2 q = uv - 0.5; q.x *= uRes.x / uRes.y;
      g *= 1.0 - uVig * smoothstep(0.35, 1.05, length(q) * 1.25);
      // grain
      g += (h12(uv * uRes + fract(uTime) * 311.0) - 0.5) * uGrain;
      // letterbox
      if (uLetter > 0.0 && (uv.y < uLetter || uv.y > 1.0 - uLetter)) g = vec3(0.0);
      gl_FragColor = vec4(clamp(g, 0.0, 1.0), 1.0);
    }`, { tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null }, tDof: { value: null },
      uBloom: { value: 0.3 }, uExposure: { value: 1 }, uContrast: { value: 1 }, uSat: { value: 1 }, uTemp: { value: 0 }, uTint: { value: 0 },
      uLift: { value: 0 }, uSplit: { value: 0 }, uGrain: { value: 0 }, uVig: { value: 0.2 }, uChroma: { value: 0 }, uTime: { value: 0 },
      uLetter: { value: 0 }, uUseDof: { value: 0 }, uTiltSat: { value: 0 }, uRes: { value: new THREE.Vector2() } });
};

Post.setSize = function (w, h, pr) {
  Post.pixelRatio = pr;
  const W = Math.max(4, Math.floor(w * pr)), H = Math.max(4, Math.floor(h * pr));
  Post.w = W; Post.h = H;
  Post.rtMS.dispose();
  Post.rtMS = Post.makeScene(W, H);
  if (Post.rtPlain) { Post.rtPlain.dispose(); Post.rtPlain = null; }
  Post.rtScene = Post.rtMS;
  const q = (v, s) => Math.max(1, v >> s);
  Post.rtA.setSize(q(W, 2), q(H, 2)); Post.rtB.setSize(q(W, 2), q(H, 2));
  Post.rtC.setSize(q(W, 3), q(H, 3)); Post.rtD.setSize(q(W, 3), q(H, 3));
  Post.rtE.setSize(q(W, 1), q(H, 1));
  Post.comp.u.uRes.value.set(W, H);
};

Post.applyPreset = function (id) {
  const pr = PRESETS[id]; if (!pr) return;
  Post.preset = id;
  Object.assign(Post.p, pr);
  Post.p.tiltOn = !!pr.tilt;
  D.emit('post');
};

Post.render = function (renderer, scene, camera, time) {
  const P = Post.p;
  if (P.dofOn) { if (!Post.rtPlain) Post.rtPlain = Post.makeScene(Post.w, Post.h, true); Post.rtScene = Post.rtPlain; }
  else Post.rtScene = Post.rtMS;
  renderer.setRenderTarget(Post.rtScene);
  renderer.render(scene, camera);
  const bloomOn = P.bloom > 0.01;
  if (bloomOn) {
    const b = Post.bright.u;
    b.tSrc.value = Post.rtScene.texture; b.uTexel.value.set(1 / Post.w, 1 / Post.h); b.uThresh.value = 1.5;
    renderer.setRenderTarget(Post.rtA); renderer.render(Post.bright.s, orthoCam);
    const bl = Post.blur.u;
    bl.tSrc.value = Post.rtA.texture; bl.uDir.value.set(1 / Post.rtA.width, 0);
    renderer.setRenderTarget(Post.rtB); renderer.render(Post.blur.s, orthoCam);
    bl.tSrc.value = Post.rtB.texture; bl.uDir.value.set(0, 1 / Post.rtA.height);
    renderer.setRenderTarget(Post.rtA); renderer.render(Post.blur.s, orthoCam);
    Post.down.u.tSrc.value = Post.rtA.texture;
    renderer.setRenderTarget(Post.rtC); renderer.render(Post.down.s, orthoCam);
    bl.tSrc.value = Post.rtC.texture; bl.uDir.value.set(1.5 / Post.rtC.width, 0);
    renderer.setRenderTarget(Post.rtD); renderer.render(Post.blur.s, orthoCam);
    bl.tSrc.value = Post.rtD.texture; bl.uDir.value.set(0, 1.5 / Post.rtC.height);
    renderer.setRenderTarget(Post.rtC); renderer.render(Post.blur.s, orthoCam);
  }
  const useDof = P.tiltOn || P.dofOn;
  if (useDof) {
    const u = Post.dof.u;
    u.tSrc.value = Post.rtScene.texture; u.tDepth.value = Post.rtScene.depthTexture;
    u.uTexel.value.set(2 / Post.w * (Post.w / 1600), 2 / Post.h * (Post.w / 1600));
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uTiltOn.value = P.tiltOn ? 1 : 0; u.uTiltY.value = P.tiltY; u.uTiltBand.value = P.tiltBand; u.uTiltBlur.value = P.tiltBlur;
    u.uDofOn.value = P.dofOn ? 1 : 0; u.uFocus.value = Math.max(1, P.dofFocus); u.uAperture.value = P.dofAperture;
    renderer.setRenderTarget(Post.rtE); renderer.render(Post.dof.s, orthoCam);
  }
  const c = Post.comp.u;
  c.tScene.value = Post.rtScene.texture;
  c.tBloomA.value = Post.rtA.texture; c.tBloomB.value = Post.rtC.texture; c.tDof.value = Post.rtE.texture;
  c.uBloom.value = bloomOn ? P.bloom : 0;
  c.uExposure.value = P.exposure; c.uContrast.value = P.contrast; c.uSat.value = P.saturation;
  c.uTemp.value = P.temp; c.uTint.value = P.tint; c.uLift.value = P.lift; c.uSplit.value = P.split;
  c.uGrain.value = P.grain; c.uVig.value = P.vignette; c.uChroma.value = P.chroma; c.uTime.value = time;
  // Atlas table: a calm, neutral print. Tame bloom, flat saturation/contrast, a faint warm lift, a little
  // more vignette. P (the user's grade) is never written; tilt-shift stays theirs.
  const ak = D.AU ? D.AU.uAtlas.value : 0;
  if (ak > 0.001) {
    const L = (a, b) => a + (b - a) * ak;
    c.uBloom.value *= 1 - 0.8 * ak;
    c.uSat.value = L(P.saturation, 1); c.uContrast.value = L(P.contrast, 1);
    c.uLift.value = L(P.lift, 0.03); c.uTemp.value = L(P.temp, 0.03); c.uTint.value = L(P.tint, 0);
    c.uGrain.value = L(P.grain, 0.015); c.uVig.value = L(P.vignette, Math.max(P.vignette, 0.22) + 0.14);
    c.uChroma.value = L(P.chroma, 0); if (ak > 0.5) c.uSplit.value = 0;
  }
  c.uLetter.value = P.letterbox; c.uUseDof.value = useDof ? 1 : 0;
  c.uTiltSat.value = P.tiltOn ? 0.12 : 0;
  renderer.setRenderTarget(null);
  renderer.render(Post.comp.s, orthoCam);
  if (Post._capture) { const cb = Post._capture; Post._capture = null; cb(renderer.domElement); }
};

// Grab the very next frame as a PNG download
Post.capture = function (scale) {
  scale = scale || 1;
  D.toast(scale > 1 ? 'Rendering a ' + scale + '× photo…' : 'Saving photo…');
  const go = () => {
    Post._capture = (canvas) => {
      canvas.toBlob(b => {
        const a = document.createElement('a');
        const name = (D.W.name || 'diorama').replace(/[^\w-]+/g, '-').toLowerCase();
        a.download = `${name}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
        a.href = URL.createObjectURL(b);
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        if (scale > 1) D.emit('resize');
        D.toast('Photo saved to your downloads');
      }, 'image/png');
    };
  };
  if (scale > 1) { D.emit('resize', scale); setTimeout(go, 60); } else go();
};
})();
