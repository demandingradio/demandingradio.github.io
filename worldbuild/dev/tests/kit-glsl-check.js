// GLSL compile check for the kit programs (D: Works & Age). Not part of run.js (needs the npm glslang wasm):
//   cd worldbuild && deno run -A dev/tests/kit-glsl-check.js [--verbose]
// Loads the REAL vendored three r137 (ShaderLib / ShaderChunk), runs kit.js's own onBeforeCompile on the standard
// and depth programs (WALL, ROOF, PLAIN, VC + their depth materials; with and without the Atlas hook; centroid
// varyings as on WebGL2), resolves the includes, prepends a three-like WebGL2 prefix (instancing, instance colour,
// one shadowed directional light + one hemisphere light) and compiles every stage with glslang (ES 3.10).
// It catches syntax / type errors and injection-marker misses (checkShader warnings), not driver limits.
import { load } from './harness.js';
import { createRequire } from 'node:module';

const ROOT = new URL('../../', import.meta.url);
const verbose = Deno.args.includes('--verbose');

async function glslang() {
  const require = createRequire(import.meta.url);
  let mod;
  try { mod = require('npm:@webgpu/glslang@0.0.15'); } catch (e) { mod = (await import('npm:@webgpu/glslang@0.0.15')).default; }
  const log = [];
  const g = await new Promise(res => { const m = mod({ print: s => log.push(s), printErr: s => log.push(s) }); m.then(x => { delete x.then; res(x); }); });
  return { compile(code, stage) { log.length = 0; try { g.compileGLSL(code, stage); return null; } catch (e) { return log.join('\n') || String(e); } } };
}

// real three.js (UMD → globalThis.THREE)
(0, eval)(Deno.readTextFileSync(new URL('lib/three.min.js', ROOT)));
const THREE = globalThis.THREE;
const LIGHTS = { NUM_DIR_LIGHTS: 1, NUM_SPOT_LIGHTS: 0, NUM_RECT_AREA_LIGHTS: 0, NUM_POINT_LIGHTS: 0, NUM_HEMI_LIGHTS: 1,
  NUM_DIR_LIGHT_SHADOWS: 1, NUM_SPOT_LIGHT_SHADOWS: 0, NUM_POINT_LIGHT_SHADOWS: 0, NUM_CLIPPING_PLANES: 0, UNION_CLIPPING_PLANES: 0 };

function resolve(src) { return src.replace(/^[ \t]*#include +<([\w\d./]+)>/gm, (m, n) => { const c = THREE.ShaderChunk[n]; if (c === undefined) throw new Error('chunk ' + n); return resolve(c); }); }
function unroll(src) {
  return src.replace(/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g,
    (m, a, b, body) => { let s = ''; for (let i = +a; i < +b; i++) s += body.replace(/\[\s*i\s*\]/g, '[ ' + i + ' ]').replace(/UNROLLED_LOOP_INDEX/g, i); return s; });
}
function lights(src) { for (const k in LIGHTS) src = src.replace(new RegExp(k, 'g'), LIGHTS[k]); return src; }

// WebGL-style declarations → Vulkan GLSL (each plain uniform its own block, declared in place; located in / out)
function toVulkan(code, stage) {
  code = code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*precision\s+\w+\s+\w+\s*;/gm, '');
  code = code.replace(/\baverage\b/g, 'average_');                // a glslang built-in name in this target, not in WebGL
  let bind = 0, loc = 0, aloc = 0;
  code = code.replace(/\buniform\s+(\w+)\s+([^;{]+);/g, (m, type, names) => names.split(',').map(s => s.trim()).map(n =>
    /^sampler/.test(type) ? `layout(set=0, binding=${bind++}) uniform ${type} ${n};` : `layout(set=0, binding=${bind++}) uniform UB${bind}_ { ${type} ${n}; };`).join(' '));
  code = code.replace(/\b(flat\s+|centroid\s+)?varying\s+(\w+)\s+([^;]+);/g, (m, q, type, names) =>
    names.split(',').map(n => { const l = loc; loc += 4; return `layout(location=${l}) ${q || ''}${stage === 'fragment' ? 'in' : 'out'} ${type} ${n.trim()};`; }).join(' '));
  code = code.replace(/\battribute\s+(\w+)\s+([^;]+);/g, (m, type, names) =>
    names.split(',').map(n => { const l = aloc; aloc += type === 'mat4' ? 4 : 1; return `layout(location=${l}) in ${type} ${n.trim()};`; }).join(' '));
  const head = '#version 310 es\nprecision highp float; precision highp int; precision highp sampler2D;\n#define texture2D texture\n' +
    (stage === 'fragment' ? 'layout(location=0) out vec4 fragOut_;\n#define gl_FragColor fragOut_\n' : '');
  return head + code;
}
function prefix(stage, defs) {
  const d = defs.map(x => '#define ' + x).join('\n') + '\n';
  if (stage === 'vertex') return d + `uniform mat4 modelMatrix; uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix; uniform mat4 viewMatrix;
uniform mat3 normalMatrix; uniform vec3 cameraPosition; uniform bool isOrthographic;
#ifdef USE_INSTANCING
attribute mat4 instanceMatrix;
#endif
#ifdef USE_INSTANCING_COLOR
attribute vec3 instanceColor;
#endif
attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
#ifdef USE_COLOR
attribute vec3 color;
#endif
`;
  return d + `uniform mat4 viewMatrix; uniform vec3 cameraPosition; uniform bool isOrthographic;
${THREE.ShaderChunk.encodings_pars_fragment}
vec4 linearToOutputTexel( vec4 value ) { return LinearToLinear( value ); }
`;
}

export async function check() {
  const G = await glslang();
  const out = [];
  for (const atlas of [false, true]) {
    const warns = [];
    const cw = console.warn; console.warn = (...a) => warns.push(a.join(' '));
    let D;
    try {
      D = load(['js/core.js', 'js/terrain.js', 'js/kit.js'], { THREE });
      D.renderer = { capabilities: { isWebGL2: true } };        // centroid varyings, as on WebGL2
      if (!atlas) { delete D.AU; delete D.GLSL_ATLAS; }
      D.Kit.init(new THREE.Scene());
    } finally { console.warn = cw; }
    const { mats, dmats } = D.Kit._mats();
    const names = ['wall', 'roof', 'plain', 'vc'];
    const progs = [];
    mats.forEach((m, i) => progs.push({ name: 'kit-' + names[i] + (atlas ? ' +atlas' : ''), m, lib: THREE.ShaderLib.standard,
      defs: ['STANDARD', 'USE_INSTANCING', 'USE_INSTANCING_COLOR', 'USE_SHADOWMAP', 'SHADOWMAP_TYPE_PCF_SOFT'].concat(i === 3 ? ['USE_COLOR', 'FLAT_SHADED'] : []) }));
    dmats.forEach((m, i) => progs.push({ name: 'kit-' + names[i] + '-depth' + (atlas ? ' +atlas' : ''), m, lib: THREE.ShaderLib.depth,
      defs: ['USE_INSTANCING', 'DEPTH_PACKING 3201'] }));
    for (const p of progs) {
      const sh = { vertexShader: p.lib.vertexShader, fragmentShader: p.lib.fragmentShader, uniforms: THREE.UniformsUtils.clone(p.lib.uniforms) };
      console.warn = (...a) => warns.push(p.name + ': ' + a.join(' '));
      try { p.m.onBeforeCompile(sh); } finally { console.warn = cw; }
      for (const stage of ['vertex', 'fragment']) {
        const body = stage === 'vertex' ? sh.vertexShader : sh.fragmentShader;
        const code = unroll(lights(resolve(prefix(stage, p.defs) + body)));
        const err = G.compile(toVulkan(code, stage), stage);
        out.push({ name: p.name + ' ' + stage, err });
        if (verbose || err) console.log((err ? 'FAIL ' : 'ok   ') + p.name + ' ' + stage + (err ? '\n' + err.split('\n').slice(0, 12).join('\n') : ''));
      }
      // every CU uniform used by the program must be handed over
      for (const k of ['uYear', 'uView', 'uViewRise', 'uAgeT', 'uAgeIvy']) if (!sh.uniforms[k]) out.push({ name: p.name + ' uniform ' + k, err: 'missing' });
      if (atlas && !p.name.includes('depth') && !sh.uniforms.uAtlas) out.push({ name: p.name + ' uniform uAtlas', err: 'missing' });
    }
    for (const w of warns) { out.push({ name: 'warn', err: w }); console.log('WARN ' + w); }
  }
  return out;
}

if (import.meta.main) {
  const res = await check();
  const bad = res.filter(r => r.err);
  console.log(bad.length ? `\n${bad.length} problem(s)` : `\nall ${res.length} kit shader checks pass`);
  Deno.exit(bad.length ? 1 : 0);
}
