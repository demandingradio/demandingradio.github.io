// GLSL compile check for the Atlas shader code (E2). Not part of run.js (it needs the npm glslang wasm):
//   cd worldbuild && deno run -A dev/tests/glsl-check.js
// Builds the real fragment code of terrain (TERRAIN_FRAG_HEAD + terrainShade), water (sea + river) and the nature
// hooks, wraps each in a stub main, converts WebGL-style declarations to Vulkan GLSL 450 (uniform block, located
// in/out) and compiles with glslang. It catches syntax and type errors, not three.js chunk-integration issues.
import { load } from './harness.js';
import { createRequire } from 'node:module';

const ROOT = new URL('../../', import.meta.url);
const src = f => Deno.readTextFileSync(new URL(f, ROOT)).replace(/\r\n/g, '\n');

async function glslang() {
  const require = createRequire(import.meta.url);
  let mod;
  try { mod = require('npm:@webgpu/glslang@0.0.15'); } catch (e) { mod = (await import('npm:@webgpu/glslang@0.0.15')).default; }
  const log = [];
  const g = await new Promise(res => { const m = mod({ print: s => log.push(s), printErr: s => log.push(s) }); m.then(x => { delete x.then; res(x); }); });
  return { compile(code, stage) { log.length = 0; try { g.compileGLSL(code, stage); return null; } catch (e) { return log.join('\n') || String(e); } } };
}

// WebGL-ish GLSL -> Vulkan GLSL 450
function toVulkan(code, stage) {
  code = code.replace(/\/\/[^\n]*/g, '').replace(/^\s*precision\s+\w+\s+\w+\s*;/gm, '');
  const block = []; let bind = 1, loc = 0, aloc = 0;
  code = code.replace(/\buniform\s+(\w+)\s+([^;{]+);/g, (m, type, names) => {
    const ns = names.split(',').map(s => s.trim());
    if (/^sampler/.test(type)) return ns.map(n => `layout(set=0, binding=${bind++}) uniform ${type} ${n};`).join(' ');
    ns.forEach(n => block.push(`${type} ${n};`)); return '';
  });
  code = code.replace(/\b(flat\s+)?varying\s+(\w+)\s+([^;]+);/g, (m, flat, type, names) =>
    names.split(',').map(n => `layout(location=${loc++}) ${flat || ''}${stage === 'fragment' ? 'in' : 'out'} ${type} ${n.trim()};`).join(' '));
  code = code.replace(/\battribute\s+(\w+)\s+([^;]+);/g, (m, type, names) =>
    names.split(',').map(n => { const l = aloc; aloc += type === 'mat4' ? 4 : 1; return `layout(location=${l}) in ${type} ${n.trim()};`; }).join(' '));
  code = code.replace(/^\s*#include\s*<[^>]+>\s*$/gm, '');
  // ES 3.10 (not desktop 4.50): no implicit int->float conversions, the same strictness as WebGL2's ES 3.00
  const head = '#version 310 es\nprecision highp float; precision highp int; precision highp sampler2D;\n#define texture2D texture\n' + (stage === 'fragment' ? 'layout(location=0) out vec4 fragOut_;\n#define gl_FragColor fragOut_\n' : '') +
    (block.length ? `layout(set=0, binding=0) uniform UB_ { ${block.join(' ')} };\n` : '');
  return head + code;
}
function between(text, a, b) { const i = text.indexOf(a); if (i < 0) throw new Error('marker not found: ' + a); const j = text.indexOf(b, i + a.length); if (j < 0) throw new Error('end marker not found: ' + b); return text.slice(i + a.length, j); }
const tpl = (body, names, vals) => new Function(...names, 'return `' + body + '`;')(...vals);

export async function check(verbose) {
  const D = load(['js/core.js', 'js/terrain.js']);
  const G = await glslang();
  const out = [];
  const run = (name, code, stage) => { const err = G.compile(toVulkan(code, stage), stage); out.push({ name, err }); if (verbose) console.log((err ? 'FAIL ' : 'ok   ') + name + (err ? '\n' + err : '')); };

  // 1) GLSL_ATLAS on its own, every public helper used
  run('GLSL_ATLAS', D.GLSL_ATLAS + `
void main(){ vec2 xz = gl_FragCoord.xy * 16.0; vec3 c = vec3(.5);
  c = at_surface(c, xz); c = at_surfaceLin(c, xz, 1200.0); c = at_ink(c, xz, 2.0, 0.3); c += at_emis(xz, 0.8) + at_pageCol(xz) * at_k(xz);
  gl_FragColor = vec4(c, 1.0); }`, 'fragment');

  // 2) terrain: the real head + terrainShade (evaluated from terrain.js), stub main mirroring makeMaterial's hooks
  const ts = src('js/terrain.js');
  const head = tpl(between(ts, 'const TERRAIN_FRAG_HEAD = `', '\n`;\n\nfunction makeMaterial'), ['D', 'N'], [D, D.N]);
  run('terrain', head + `
uniform mat4 viewMatrix;
void main(){ vec3 tcol; terrainShade(tcol); vec3 normal = vec3(0.0, 1.0, 0.0);
  if (T_bumpOn > 0.0) normal = normalize((viewMatrix * vec4(T_nW, 0.0)).xyz);
  gl_FragColor = vec4(tcol * T_rough + pow(T_emis, vec3(2.2)) * 2.0 + normal, 1.0); }`, 'fragment');

  // 3) water: WATER_COMMON + both material bodies (water.js evaluated for real so D.AU/GLSL_ATLAS are present)
  const D2 = load(['js/core.js', 'js/terrain.js']);
  const ws = src('js/water.js');
  const common = tpl(between(ws, 'const WATER_COMMON = `', '\n`;\n\nfunction makeWaterMat'), ['D', 'CELL', 'N', 'SIZE'], [D2, D2.CELL, D2.N, D2.SIZE]);
  const bodies = [...ws.matchAll(/fragmentShader: WATER_COMMON \+ `([\s\S]*?)`\n/g)].map(m => m[1]);
  if (bodies.length !== 2) throw new Error('water bodies not found: ' + bodies.length);
  bodies.forEach((b, i) => run('water ' + (i ? 'river' : 'sea'), common + b, 'fragment'));

  // 4) nature: run the real onBeforeCompile over stub vertex/fragment programs carrying the chunk markers it edits
  const ns = src('js/nature.js');
  const makeMat = between(ns, 'function makeMat(far) {', '\n// ---- Rendering');
  class Mat { constructor(p) { Object.assign(this, p || {}); } }
  const fakeD = { AU: D.AU, GLSL_ATLAS: D.GLSL_ATLAS, TU: D.TU };
  const mat = new Function('D', 'THREE', 'NU', 'function makeMat(far) {' + makeMat + '\nreturn makeMat(false);')(fakeD, { MeshStandardMaterial: Mat }, { uTime: {}, uWind: {}, uNight: {} });
  const sh = {
    uniforms: {},
    vertexShader: `#include <common>
attribute vec3 position; attribute vec3 normal; attribute vec3 color; attribute mat4 instanceMatrix; attribute vec3 instanceColor;
varying vec3 vColor;
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
void main(){
vec3 transformed = position;
#include <begin_vertex>
#include <color_vertex>
gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
}`,
    fragmentShader: `#include <common>
varying vec3 vColor;
void main(){
vec4 diffuseColor = vec4(1.0);
#include <color_fragment>
vec3 totalEmissiveRadiance = vec3(0.0);
#include <emissivemap_fragment>
gl_FragColor = vec4(diffuseColor.rgb + totalEmissiveRadiance, 1.0);
}`
  };
  const warn = console.warn; console.warn = () => {};
  mat.onBeforeCompile(sh);
  console.warn = warn;
  if (!sh.uniforms.uAtlas) out.push({ name: 'nature uniforms', err: 'D.AU not merged into nature uniforms' });
  run('nature vertex', sh.vertexShader, 'vertex');
  run('nature fragment', sh.fragmentShader, 'fragment');
  return out;
}

if (import.meta.main) {
  const res = await check(true);
  const bad = res.filter(r => r.err).length;
  console.log(bad ? `\n${bad} shader(s) failed` : '\nall shaders compile');
  Deno.exit(bad ? 1 : 0);
}
