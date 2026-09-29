/* Diorama — terrain: world grid data, chunked LOD meshes, landscape shader,
   height sampling and ray picking. */
(function () {
'use strict';
const D = window.D;
const { N, VN, CELL, SIZE, CHUNK, NCH, V } = D;

// ---- World data (the "document") ----------------------------------------
const W = D.W = {
  h: new Float32Array(V),            // heights (m)
  biome: new Uint8Array(V * 4),      // temperate, alpine, desert, tropical weights
  paint: new Uint8Array(V * 8),      // grass, dirt, sand, rock | snow, farmland, paving, flowers
  forest: new Uint8Array(V),         // derived canopy density (from trees)
  water: new Float32Array(V),        // lake surface level, -1e9 = none
  seaLevel: 0,
  climate: 0,
  seed: 1,
  style: 'continental',
  name: 'Untitled world'
};
W.water.fill(-1e9);

const T = D.Terrain = {};
const CV = CHUNK + 1, GRIDV = CV * CV, SKV = 4 * CV, TOTV = GRIDV + SKV;
const SKIRT = 120;
const CHS = CHUNK * CELL; // chunk size in metres (1024)

// ---- Uniforms shared by the terrain shader ----------------------------------
const TU = D.TU = {
  uSea: { value: 0 },
  uTime: { value: 0 },
  uSnow: { value: 0 },
  uWet: { value: 0 },
  uSeason: { value: new THREE.Vector4(0, 1, 0, 0) },
  uBrush: { value: new THREE.Vector4(0, 0, 100, 0.5) },
  uBrushOn: { value: new THREE.Vector4(0, 0.4, 0.8, 1) },
  uLine: { value: new THREE.Vector4(0, 0, 0, 0) },
  uLineOn: { value: new THREE.Vector4(0, 20, 0, 0) },
  uSel: { value: new THREE.Vector4(1, 1, 0, 0) },
  uGrid: { value: 0 },
  uContour: { value: 0 },
  uZoneTex: { value: null },
  uZoneOn: { value: 0 },
  uCam: { value: new THREE.Vector3() },
  uCloud: { value: 0.3 },
  uWind: { value: new THREE.Vector2(1, 0.4) },
  uSnowline: { value: 0 },
  uNight: { value: 0 },
  uPaintVis: { value: 1 },
  // ---- border (cartographer's neatline) ----
  uEdge: { value: new THREE.Vector4(1, 0, 0, 0) },     // x visibility, y pulse, zw pulse focus (world x,z)
  uEdgeCfg: { value: new THREE.Vector4(0, 1, 1, 1) },  // x slab mode, y outside wash, z hatch, w night glow
  // ---- settlements / ground-detail atlas (Town writes .value; never replaces the objects) ----
  uSelSettle: { value: 0 },
  uGOn: { value: 0 },
  uGIdx: { value: dummyTex([0, 0, 0, 0], false) },
  uGAtlas: { value: dummyTex([255, 0, 0, 0], true) },
  uGSize: { value: new THREE.Vector2(1, 1) }
};
function dummyTex(rgba, linear) {
  const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false; t.flipY = false; t.needsUpdate = true;
  return t;
}

// ---- Shared border GLSL (terrain fragment + water) ------------------------------
D.GLSL_EDGE = `
uniform vec4 uEdge; uniform vec4 uEdgeCfg;
const float E_S = 16384.0;
float edgeSD(vec2 xz){ vec2 q = abs(xz - vec2(E_S*0.5)) - vec2(E_S*0.5); return length(max(q,0.0)) + min(max(q.x,q.y),0.0); }
float edgeRun(vec2 xz){ vec2 c = clamp(xz,0.0,E_S), q = abs(xz - vec2(E_S*0.5)); return q.x > q.y ? c.y : c.x; }
float edgeKeys(float run, float pxR){ float lvl = log2(max(pxR*22.0,16.0)/16.0); float L0 = 16.0*exp2(floor(lvl)), t = fract(lvl);
  return mix(step(0.5, fract(run/(2.0*L0))), step(0.5, fract(run/(4.0*L0))), t); }
float edgeHatch(vec2 xz, float px){ float lvl = log2(max(px*7.0,3.0)/3.0); float S0 = 3.0*exp2(floor(lvl)), t = fract(lvl);
  float u = (xz.x + xz.y)*0.7071;
  float a = 1.0 - smoothstep(0.0, px*1.2, abs(fract(u/S0)-0.5)*S0 - S0*0.38);
  float b = 1.0 - smoothstep(0.0, px*1.2, abs(fract(u/(2.0*S0))-0.5)*2.0*S0 - S0*0.76);
  return mix(a, b, t); }
// dry: 1 on land/water surface, 0 on sea bed under water (band not drawn there)
vec3 edgeApply(vec3 col, vec2 xz, float sd, float px, float pxR, float night, float dry, out float bandA, out vec3 emis){
  bandA = 0.0; emis = vec3(0.0);
  float vis = uEdge.x, u = clamp(px, 0.8, 60.0), slab = uEdgeCfg.x;
  float pr = uEdge.y * exp(-length(xz - uEdge.zw)/900.0);
  if (sd > -u*8.0 && slab < 0.5) {
    float o = max(sd, 0.0), inO = smoothstep(0.0, u*1.5, sd);
    float w = inO * mix(0.35, 0.35 + 0.45*vis, smoothstep(0.0, 2500.0, o)) * uEdgeCfg.y;
    float lum = dot(col, vec3(.3,.5,.2));
    col = mix(col, vec3(lum)*vec3(1.06,0.99,0.84), w);
    col *= 1.0 - w*(0.18 + 0.35*night);
    col *= 1.0 - 0.28*vis*inO*exp(-o/(u*14.0));
    float hf = smoothstep(u*4.0, u*40.0, o) * (1.0 - smoothstep(5000.0, 14000.0, o));
    col = mix(col, col*0.72, edgeHatch(xz, px)*hf*0.22*uEdgeCfg.z*vis);
    col *= 1.0 - 0.06*vis*(1.0 - smoothstep(0.0, u*10.0, -sd))*step(sd, 0.0);
  }
  float s = sd/u, aa = 0.6*px/u, wide = 1.0 + pr*0.6;
  vec3 ink = vec3(.10,.08,.06), cream = vec3(.93,.88,.74);
  float outer = smoothstep(-aa,aa,s) * (1.0 - smoothstep(1.6*wide-aa, 1.6*wide+aa, s));
  float keysB = smoothstep(-5.0*wide-aa, -5.0*wide+aa, s) * (1.0 - smoothstep(-aa,aa,s));
  float inner = smoothstep(-6.2*wide-aa, -6.2*wide+aa, s) * (1.0 - smoothstep(-5.4*wide-aa, -5.4*wide+aa, s));
  float kk = edgeKeys(edgeRun(xz), pxR);
  vec3 keyCol = mix(cream, ink, kk);
  if (slab > 0.5) { keyCol = vec3(.95,.80,.45); outer = 0.0; inner = 0.0; keysB *= smoothstep(-2.2-aa, -2.2+aa, s); }
  vec3 lineCol = mix(col, keyCol, keysB);
  lineCol = mix(lineCol, ink, max(outer, inner));
  vec3 hot = vec3(1.0,.42,.20);
  lineCol = mix(lineCol, hot, pr*max(keysB, outer)*0.75);
  float cover = max(max(keysB, outer), inner) * dry;
  float closeFade = mix(0.55, 0.92, smoothstep(0.3, 3.0, px));
  bandA = cover*vis*closeFade;
  col = mix(col, lineCol, bandA);
  emis = (keysB*(1.0 - kk)*vec3(1.0,.74,.42)*0.22*night*uEdgeCfg.w + hot*pr*cover*0.9) * vis * dry;
  return col;
}
`;

// ---- Shared LOD index buffers ----------------------------------------------
const LODS = [1, 2, 4, 8, 16];
const IDX = LODS.map(step => {
  const idx = [];
  for (let j = 0; j < CHUNK; j += step) for (let i = 0; i < CHUNK; i += step) {
    const a = j * CV + i, b = a + step, c = (j + step) * CV + i, d = c + step;
    if ((((i / step) + (j / step)) & 1) === 0) idx.push(a, c, b, b, c, d);
    else idx.push(a, c, d, a, d, b);
  }
  const edges = [[k => k, 0], [k => CHUNK * CV + k, CV], [k => k * CV, 2 * CV], [k => k * CV + CHUNK, 3 * CV]];
  for (const [g, off] of edges) for (let k = 0; k < CHUNK; k += step) {
    const a = g(k), b = g(k + step), sa = GRIDV + off + k, sb = GRIDV + off + k + step;
    idx.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa);
  }
  return new THREE.BufferAttribute(new Uint16Array(idx), 1);
});

// ---- Material ------------------------------------------------------------
const TERRAIN_FRAG_HEAD = `
uniform float uSea; uniform float uTime; uniform float uSnow; uniform float uWet;
uniform vec4 uSeason; uniform vec4 uBrush; uniform vec4 uBrushOn; uniform vec4 uLine; uniform vec4 uLineOn;
uniform vec4 uSel; uniform float uGrid; uniform float uContour;
uniform sampler2D uZoneTex; uniform float uZoneOn; uniform vec3 uCam; uniform float uCloud; uniform vec2 uWind;
uniform float uSnowline; uniform float uNight; uniform float uPaintVis;
uniform float uSelSettle; uniform float uGOn; uniform sampler2D uGIdx; uniform sampler2D uGAtlas; uniform vec2 uGSize;
varying vec3 vWP; varying vec3 vWN; varying vec4 vBiome; varying vec4 vPaintA; varying vec4 vPaintB; varying vec4 vExtra;
float T_rough; vec3 T_emis;
${D.GLSL_NOISE}
${D.GLSL_EDGE}
vec3 seas(vec3 sp, vec3 su, vec3 au, vec3 wi){ return sp*uSeason.x + su*uSeason.y + au*uSeason.z + wi*uSeason.w; }

vec3 biomeCol(int bi, vec3 p, float hs, float slope, float n1, float nn, float nm, out float rough){
  vec3 grass, rock, sand, snow = vec3(.94,.95,.97), sea;
  float snowline, rockT = 0.30, beach = 1.5 + n1 * 3.0;
  rough = 0.95;
  if (bi == 0) {        // temperate
    grass = seas(mix(vec3(.40,.54,.25), vec3(.49,.58,.29), n1), mix(vec3(.33,.44,.21), vec3(.45,.50,.27), n1),
                 mix(vec3(.47,.47,.26), vec3(.62,.53,.30), n1), mix(vec3(.44,.45,.35), vec3(.52,.50,.40), n1));
    grass = mix(grass, grass * vec3(1.12, 1.02, 0.78), smoothstep(0.55, 0.85, nm) * 0.5);
    grass = mix(grass, vec3(.56,.58,.36), smoothstep(350.0, 700.0, hs) * 0.6);
    rock = mix(vec3(.37,.35,.32), vec3(.48,.45,.41), nn);
    sand = vec3(.85,.79,.61); sea = vec3(.60,.56,.44);
    snowline = 950.0 + n1 * 140.0 - uSeason.w * 450.0;
  } else if (bi == 1) { // alpine
    grass = seas(mix(vec3(.34,.52,.26), vec3(.46,.60,.30), n1), mix(vec3(.28,.45,.22), vec3(.40,.54,.27), n1),
                 mix(vec3(.52,.48,.27), vec3(.60,.53,.30), n1), mix(vec3(.40,.43,.34), vec3(.48,.49,.40), n1));
    grass = mix(grass, vec3(.44,.50,.30), smoothstep(200.0, 520.0, hs) * 0.45);
    rock = mix(vec3(.50,.52,.55), vec3(.60,.61,.63), nn);
    sand = vec3(.62,.61,.58); sea = vec3(.45,.46,.44);
    snowline = 600.0 + n1 * 140.0 - uSeason.w * 300.0;
    rockT = 0.25;
  } else if (bi == 2) { // desert
    float dune = 0.5 + 0.5 * sin(p.x * 0.05 + p.z * 0.021 + n1 * 18.0);
    grass = mix(mix(vec3(.88,.73,.49), vec3(.80,.60,.38), n1), vec3(.93,.80,.58), dune * 0.35);
    grass = mix(grass, vec3(.58,.55,.33), step(0.78, nm) * 0.55 * smoothstep(2.0, 20.0, hs));
    float band = fract(p.y / 17.0 + n1 * 0.3);
    rock = mix(vec3(.70,.41,.25), vec3(.56,.30,.19), smoothstep(0.3, 0.7, band));
    rock = mix(rock, vec3(.80,.60,.42), smoothstep(0.85, 0.95, band));
    sand = vec3(.90,.80,.60); sea = vec3(.70,.62,.46);
    snowline = 1700.0 + n1 * 200.0;
    rockT = 0.19;
  } else {              // tropical
    grass = seas(mix(vec3(.27,.52,.21), vec3(.37,.58,.25), n1), mix(vec3(.24,.48,.19), vec3(.34,.55,.23), n1),
                 mix(vec3(.36,.56,.22), vec3(.46,.60,.25), n1), mix(vec3(.32,.52,.23), vec3(.42,.56,.28), n1));
    rock = mix(vec3(.28,.26,.25), vec3(.38,.35,.33), nn);
    sand = vec3(.95,.91,.78); sea = vec3(.80,.78,.66);
    snowline = 3200.0;
    beach += 2.0;
  }
  vec3 c = grass;
  // beaches & sea bed
  float b = 1.0 - smoothstep(beach - 0.5, beach + 0.5, hs);
  c = mix(c, sand, b);
  c = mix(c, sea, smoothstep(0.0, -4.0, hs));
  // cliffs
  float r = smoothstep(rockT - 0.05, rockT + 0.05, slope + (nn - 0.5) * 0.07);
  c = mix(c, rock, r);
  rough = mix(rough, 0.85, r);
  // snow caps
  float s = smoothstep(snowline - 40.0, snowline + 40.0, hs + (nn - 0.5) * 60.0) * (1.0 - smoothstep(0.45, 0.62, slope));
  c = mix(c, snow, s);
  rough = mix(rough, 0.6, s);
  return c;
}

vec3 farmland(vec2 xz, float fade){
  vec2 q = xz / vec2(132.0, 96.0);
  vec2 cell = floor(q);
  float r = d_hash12(cell);
  vec2 f = fract(q);
  vec3 c;
  if (r < 0.24) c = vec3(.82,.71,.36);
  else if (r < 0.44) c = vec3(.49,.62,.27);
  else if (r < 0.60) c = vec3(.47,.35,.23);
  else if (r < 0.80) c = vec3(.63,.71,.33);
  else c = vec3(.73,.62,.31);
  c = seas(c, c, mix(c, vec3(.70,.55,.30), 0.5), mix(c, vec3(.55,.50,.40), 0.6));
  float dir = step(0.5, d_hash12(cell + 7.0));
  float rowc = mix(xz.x, xz.y, dir);
  c *= 1.0 - (0.5 + 0.5 * sin(rowc * 1.4)) * 0.14 * fade;
  float edge = min(min(f.x, 1.0 - f.x) * 132.0, min(f.y, 1.0 - f.y) * 96.0);
  c = mix(vec3(.26,.38,.17), c, smoothstep(1.2, 3.2, edge));
  return c;
}
vec3 paving(vec2 xz, float fade){
  vec2 g = fract(xz / 2.4);
  float grout = min(g.x, g.y);
  vec3 c = vec3(.73,.71,.67) * (0.93 + d_hash12(floor(xz / 2.4)) * 0.10 * fade);
  return mix(c * 0.78, c, mix(1.0, smoothstep(0.03, 0.07, grout), fade));
}
vec3 flowers(vec2 xz, vec3 base, float fade){
  vec2 c = floor(xz / 1.4);
  float r = d_hash12(c);
  vec2 f = fract(xz / 1.4) - 0.5;
  float dotm = (1.0 - smoothstep(0.16, 0.24, length(f))) * step(0.45, r);
  vec3 fc = r < 0.62 ? vec3(.96,.47,.66) : r < 0.76 ? vec3(.98,.86,.32) : r < 0.88 ? vec3(.72,.52,.96) : vec3(.98,.97,.94);
  vec3 far = mix(base, vec3(.85,.62,.72), 0.22);
  return mix(far, mix(base, fc, dotm), fade);
}
// zone palette (sRGB, shared with the navigator + UI): village, farmland, castle, monastery, harbour
vec3 zoneColor(float z){
  if (z < 0.5) return vec3(0.0);
  if (z < 1.5) return vec3(.878,.722,.353);   // #e0b85a parchment gold
  if (z < 2.5) return vec3(.847,.784,.376);   // #d8c860 wheat
  if (z < 3.5) return vec3(.784,.353,.314);   // #c85a50 castle red
  if (z < 4.5) return vec3(.604,.471,.816);   // #9a78d0 monastery violet
  return vec3(.302,.608,.878);                // #4d9be0 harbour blue
}
// outline key of a zone cell: settlement slot of painted cells (0 = empty / erased)
float zKey(ivec2 c){
  if (c.x < 0 || c.y < 0 || c.x > ${N - 1} || c.y > ${N - 1}) return 0.0;
  vec4 t = texelFetch(uZoneTex, c, 0) * 255.0;
  if (t.r < 0.5) return 0.0;
  float g = floor(t.g + 0.5);
  return g > 0.5 ? g : 1000.0 + floor(t.r + 0.5);
}

// ---- ground-detail atlas (Town writes; see spec 3.3) ----
bool gdFetch(vec2 xz, out float sd, out vec4 n){
  sd = 99.0; n = vec4(0.0);
  if (uGOn < 0.5 || xz.x < 0.0 || xz.y < 0.0 || xz.x >= 16384.0 || xz.y >= 16384.0) return false;
  ivec2 t = ivec2(floor(xz / 256.0));
  vec4 ix = texelFetch(uGIdx, t, 0);
  if (ix.a < 0.5) return false;
  vec2 pg = floor(ix.rg * 255.0 + 0.5);
  vec2 loc = (xz - vec2(t) * 256.0) * 0.5 + 1.0;          // continuous texel coords inside page
  vec2 at = pg * 130.0 + loc;
  sd = (textureLod(uGAtlas, at / uGSize, 0.0).r * 255.0 - 128.0) * 0.25;   // bilinear, metres
  // nearest class fetch, jittered by < half a texel so 2 m cells read as organic edges
  vec2 jit = (vec2(d_vnoise(xz * 0.61), d_vnoise(xz * 0.61 + 17.3)) - 0.5) * 0.9;
  n = texelFetch(uGAtlas, ivec2(at + jit), 0) * 255.0;    // n.g lane cls, n.b area cls, n.a angle/flags
  return true;
}
vec3 cobbleAt(vec2 uv, float fade){
  vec2 cc = vec2(uv.x / 0.28, uv.y / 0.36); cc.y += floor(cc.x) * 0.5;
  vec2 f = fract(cc), id = floor(cc);
  float e = min(min(f.x, 1.0 - f.x) * 0.28, min(f.y, 1.0 - f.y) * 0.36);
  float stone = smoothstep(0.012, 0.045, e);
  vec3 sc = vec3(.46,.43,.38) * (0.8 + 0.4 * d_hash12(id)) * (0.9 + 0.1 * smoothstep(0.0, 0.1, e));
  vec3 c = mix(vec3(.17,.15,.12), sc, stone);
  return mix(vec3(.40,.37,.33), c, fade);
}
vec3 laneColor(float cls, vec2 xz, float sd, float gpx, vec3 nrm){
  float fade = 1.0 - smoothstep(0.08, 0.25, gpx);
  float nv = 0.5 + 0.5 * d_vnoise(xz * 0.7);
  vec3 c;
  if (cls < 1.5) {                 // dirt
    c = vec3(.42,.33,.22) * (0.8 + 0.3 * nv);
    float rut = 1.0 - smoothstep(0.1, 0.35, abs(-sd - 1.1));
    c *= 1.0 - rut * 0.22 * mix(0.5, 1.0, fade);
    c = mix(c, c * vec3(0.70, 0.68, 0.66), uWet * (0.35 + 0.45 * rut));
    float gr = smoothstep(0.55, 0.9, d_vnoise(xz * 1.3)) * smoothstep(1.6, 2.6, -sd) * (1.0 - rut);
    c = mix(c, seas(vec3(.36,.46,.22), vec3(.34,.42,.20), vec3(.44,.42,.24), vec3(.40,.40,.32)), gr * 0.35);
  } else if (cls < 2.5) {          // cobbles, rotated 0.3 rad
    vec2 r = vec2(xz.x * 0.9553 - xz.y * 0.2955, xz.x * 0.2955 + xz.y * 0.9553);
    c = cobbleAt(r, fade);
    c = mix(c, c * 0.8, uWet * 0.3);
  } else if (cls < 3.5) {          // flagstones 1.1 x 0.8 m
    vec2 q = xz / vec2(1.1, 0.8); q.x += floor(q.y) * 0.5;
    vec2 f = fract(q), id = floor(q);
    float e = min(min(f.x, 1.0 - f.x) * 1.1, min(f.y, 1.0 - f.y) * 0.8);
    vec3 sc = vec3(.58,.55,.49) * (0.86 + 0.24 * d_hash12(id)) * (0.95 + 0.1 * d_vnoise(xz * 3.0));
    c = mix(vec3(.30,.28,.25) * (1.0 - uWet * 0.3), sc, smoothstep(0.015, 0.05, e));
    c = mix(vec3(.54,.51,.46), c, fade);
  } else if (cls < 4.5) {          // gravel
    float h1 = d_hash12(floor(xz * 7.0)), h2 = d_hash12(floor(xz * 13.0) + 5.0);
    c = vec3(.55,.51,.44) * (0.85 + 0.25 * nv);
    c = mix(c, vec3(.70,.67,.60), step(0.82, h1) * fade);
    c = mix(c, vec3(.32,.30,.27), step(0.86, h2) * fade);
  } else {                         // steps, 0.35 m treads along the gradient
    vec2 gd = length(nrm.xz) > 1e-3 ? normalize(nrm.xz) : vec2(1.0, 0.0);
    float u = dot(xz, gd) / 0.35;
    float e = min(fract(u), 1.0 - fract(u));
    c = vec3(.56,.53,.47) * (0.9 + 0.2 * d_hash12(vec2(floor(u), 3.0)));
    c *= 1.0 - (1.0 - smoothstep(0.0, 0.12, e)) * 0.35 * fade;
  }
  return c;
}
float furrowF(vec2 xz, float ang, float spacing, float gpx){
  vec2 pd = vec2(-sin(ang), cos(ang));          // rows run along ang, stripes vary across them
  float f = sin(dot(xz, pd) * 6.2832 / spacing);
  return f * (1.0 - smoothstep(spacing * 0.2, spacing * 0.4, gpx));
}
vec3 areaColor(float ac, float a, vec2 xz, vec3 base, float gpx){
  float angI = floor(a / 8.0 + 0.001), rf = mod(floor(a / 4.0 + 0.001), 2.0), vr = mod(floor(a + 0.5), 4.0);
  float ang = angI / 32.0 * 3.14159265;
  float sp = rf > 0.5 ? 7.0 : 1.3;
  float fu = furrowF(xz, ang, sp, gpx);
  float ff = rf > 0.5 ? 0.16 : 0.1;
  float fine = 1.0 - smoothstep(0.08, 0.3, gpx);
  float nv = d_vnoise(xz * 0.35);
  vec2 pd = vec2(-sin(ang), cos(ang));
  vec3 grass = seas(vec3(.40,.56,.25), vec3(.36,.50,.22), vec3(.48,.50,.27), vec3(.44,.46,.34));
  vec3 c = base;
  if (ac < 1.5) {                  // yard: trodden earth and straw
    c = vec3(.45,.38,.26) * (0.88 + 0.2 * nv);
    c = mix(c, vec3(.74,.64,.38), step(0.78, d_hash12(floor(xz * 3.1))) * 0.6 * fine);
  } else if (ac < 2.5) {           // garden beds
    float row = 0.5 + 0.5 * sin(dot(xz, pd) * 6.2832 / 0.9);
    vec3 soil = vec3(.30,.23,.16);
    vec3 green = seas(vec3(.30,.48,.18), vec3(.28,.46,.16), vec3(.40,.40,.18), soil);
    float fz = 1.0 - smoothstep(0.12, 0.36, gpx);
    c = mix(mix(soil, green, 0.45), mix(soil, green, smoothstep(0.45, 0.75, row)), fz);
  } else if (ac < 3.5) {           // lush green (village green, garth)
    c = base * vec3(0.9, 1.05, 0.86);
  } else if (ac < 4.5) {           // churchyard
    c = base * vec3(0.76, 0.92, 0.72);
  } else if (ac < 5.5) {           // ploughed
    c = vec3(.36,.27,.18) * (0.9 + 0.15 * nv);
    c *= 1.0 - ff * 1.4 + ff * 1.4 * (0.5 + 0.5 * fu);
  } else if (ac < 9.5) {           // wheat, barley, oats, rye by season
    vec3 ripe = ac < 6.5 ? vec3(.83,.70,.35) : ac < 7.5 ? vec3(.86,.78,.48) : ac < 8.5 ? vec3(.78,.74,.45) : vec3(.72,.66,.40);
    vec3 winter = mix(vec3(.33,.25,.18), vec3(.90,.91,.93), uSnow * 0.5);
    c = seas(vec3(.42,.56,.24), ripe, vec3(.66,.58,.38), winter) * (0.92 + 0.14 * nv);
    c *= 1.0 - ff + ff * fu;
  } else if (ac < 10.5) {          // fallow
    c = mix(vec3(.45,.46,.26), vec3(.50,.42,.28), nv);
    c *= 0.95 + 0.05 * fu;
  } else if (ac < 11.5) {          // pasture
    c = grass * vec3(0.9, 0.97, 0.84) * (0.9 + 0.2 * nv);
    c = mix(c, c * 0.8, step(0.8, d_hash12(floor(xz * 1.7))) * fine);
  } else if (ac < 12.5) {          // hay meadow with flowers
    c = flowers(xz, grass * vec3(0.98, 0.98, 0.86), fine * (uSeason.x + uSeason.y));
  } else if (ac < 13.5) {          // orchard grass
    c = grass * vec3(0.88, 0.95, 0.84);
  } else if (ac < 14.5) {          // vineyard rows
    float row = 0.5 + 0.5 * sin(dot(xz, pd) * 6.2832 / 2.0);
    vec3 soil = vec3(.44,.36,.25);
    c = mix(soil, seas(vec3(.34,.48,.20), vec3(.30,.44,.18), vec3(.55,.40,.18), soil), mix(0.4, smoothstep(0.55, 0.85, row), fine));
  } else if (ac < 15.5) {          // dry ditch
    c = vec3(.20,.18,.12) * (0.85 + 0.2 * nv);
  } else {                         // herb garden: little knot squares
    vec2 f = fract(xz / 0.8);
    float h = d_hash12(floor(xz / 0.8));
    vec3 hc = h < 0.4 ? vec3(.30,.46,.22) : h < 0.7 ? vec3(.40,.50,.28) : h < 0.85 ? vec3(.46,.38,.56) : vec3(.55,.52,.30);
    float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    c = mix(vec3(.32,.25,.17), hc, mix(0.7, smoothstep(0.06, 0.14, e), fine));
  }
  return c * (0.94 + 0.12 * vr / 3.0);
}

void terrainShade(inout vec3 outCol){
  vec3 p = vWP;
  vec3 n = normalize(vWN);
  float slope = 1.0 - n.y;
  float hs = p.y - uSea;
  vec2 xz = p.xz;
  // screen-space derivatives: top level only (uniform control flow)
  float sd = edgeSD(xz);
  float epx = max(fwidth(sd), 1e-3);
  float epr = max(fwidth(edgeRun(xz)), 1e-3);
  float gpx = max(fwidth(xz.x), fwidth(xz.y));
  float inMap = step(sd, 0.0);
  float dist = length(uCam - p);
  float fadeFine = 1.0 - smoothstep(120.0, 420.0, dist);
  float fadeMid = 1.0 - smoothstep(600.0, 2200.0, dist);
  float n1 = d_fbm(xz * 0.0035);
  float n2 = d_vnoise(xz * 0.055);
  float n3 = d_vnoise(xz * 0.31);
  float nn = mix(0.5, n2 * 0.65 + n3 * 0.35, 0.3 + 0.7 * fadeMid);
  float nm = d_vnoise(xz * 0.11);
  vec4 bw = vBiome / max(vBiome.x + vBiome.y + vBiome.z + vBiome.w, 0.001);
  vec3 col = vec3(0.0);
  float rough = 0.0, rr;
  if (bw.x > 0.004) { col += bw.x * biomeCol(0, p, hs, slope, n1, nn, nm, rr); rough += bw.x * rr; }
  if (bw.y > 0.004) { col += bw.y * biomeCol(1, p, hs, slope, n1, nn, nm, rr); rough += bw.y * rr; }
  if (bw.z > 0.004) { col += bw.z * biomeCol(2, p, hs, slope, n1, nn, nm, rr); rough += bw.z * rr; }
  if (bw.w > 0.004) { col += bw.w * biomeCol(3, p, hs, slope, n1, nn, nm, rr); rough += bw.w * rr; }
  // micro variation
  col *= 0.90 + 0.2 * mix(0.5, n3, fadeMid);

  // forest floor / far canopy tint
  float fo = vExtra.x;
  if (fo > 0.01) {
    float far = smoothstep(1500.0, 3800.0, dist);
    vec3 canopy = bw.x * seas(vec3(.21,.38,.15), vec3(.16,.31,.13), vec3(.50,.32,.12), vec3(.29,.27,.23))
                + bw.y * vec3(.11,.23,.15) + bw.z * vec3(.38,.38,.22) + bw.w * vec3(.09,.31,.11);
    canopy *= 0.85 + 0.3 * n2;
    vec3 floorc = mix(col, vec3(.22,.25,.13), 0.6);
    col = mix(col, floorc, fo * (1.0 - far) * 0.85);
    col = mix(col, canopy, fo * far * 0.95);
  }

  // user paint layers
  float jit = (n2 - 0.5) * 0.45 + (n3 - 0.5) * 0.2 * fadeFine;
  vec4 A = vPaintA * uPaintVis, B = vPaintB * uPaintVis;
  if (A.x > 0.01) col = mix(col, seas(vec3(.40,.60,.27), vec3(.34,.53,.23), vec3(.50,.54,.28), vec3(.44,.48,.34)) * (0.96 + 0.06 * step(0.5, fract(xz.x / 7.0)) * fadeFine), smoothstep(0.3, 0.7, A.x + jit * 0.6));
  if (A.y > 0.01) col = mix(col, mix(vec3(.43,.33,.22), vec3(.52,.41,.28), nn), smoothstep(0.3, 0.7, A.y + jit));
  if (A.z > 0.01) col = mix(col, mix(vec3(.86,.79,.60), vec3(.92,.86,.70), n3), smoothstep(0.3, 0.7, A.z + jit));
  if (A.w > 0.01) { float k = smoothstep(0.3, 0.7, A.w + jit); col = mix(col, mix(vec3(.47,.46,.44), vec3(.58,.56,.53), nn), k); rough = mix(rough, 0.8, k); }
  if (B.x > 0.01) { float k = smoothstep(0.3, 0.7, B.x + jit); col = mix(col, vec3(.94,.95,.98), k); rough = mix(rough, 0.55, k); }
  if (B.y > 0.01) col = mix(col, farmland(xz, fadeMid), smoothstep(0.42, 0.58, B.y + jit * 0.3));
  if (B.z > 0.01) { float k = smoothstep(0.44, 0.56, B.z + jit * 0.15); col = mix(col, paving(xz, fadeFine), k); rough = mix(rough, 0.7, k); }
  if (B.w > 0.01) col = mix(col, flowers(xz, col, fadeFine), smoothstep(0.35, 0.65, B.w + jit * 0.5));

  // settlement ground detail: lanes, squares, yards, fields (always on, independent of the overlay)
  float gsd = 99.0; vec4 gn = vec4(0.0); float gLane = 0.0;
  bool gHave = gdFetch(xz, gsd, gn);
  if (gHave) {
    float ac = gn.b;
    if (ac > 0.5) col = mix(col, areaColor(ac, gn.a, xz, col, gpx), 0.92);
    float aaL = max(gpx, 0.3);
    float kL = 1.0 - smoothstep(-0.6 * aaL, 0.6 * aaL + 0.3, gsd);
    float verge = gsd > 0.0 ? (1.0 - smoothstep(0.0, 3.0, gsd)) : 0.0;
    col = mix(col, col * vec3(0.86, 0.84, 0.80), verge * 0.5);
    if (kL > 0.001) { col = mix(col, laneColor(gn.g, xz, gsd, gpx, n), kL); rough = mix(rough, 0.82, kL); }
    gLane = kL;
  }

  // underwater tint
  if (hs < 0.0) col = mix(col, vec3(0.07,0.27,0.31), clamp(-hs / 26.0, 0.0, 0.85));

  // weather: snow cover and wetness
  if (uSnow > 0.01) {
    float sc = clamp(uSnow + (nn - 0.5) * 0.5 - gLane * 0.25, 0.0, 1.0) * smoothstep(0.55, 0.85, n.y) * step(0.3, hs);
    float k = smoothstep(0.25, 0.6, sc);
    col = mix(col, vec3(.93,.95,.98), k); rough = mix(rough, 0.6, k);
  }
  col *= 1.0 - uWet * 0.28;
  rough = mix(rough, 0.42, uWet * step(0.0, hs));

  // drifting cloud shadows
  float cs = d_fbm((xz + uWind * uTime * 9.0) * 0.00032);
  col *= 1.0 - smoothstep(0.50, 0.72, cs) * uCloud * 0.38;

  // ---- the border: cartographer's neatline + engraved outside (replaces the old outer mute) ----
  vec3 emis = vec3(0.0);
  float eBand; vec3 eEmis;
  float dry = smoothstep(-1.0, 0.0, p.y - uSea);
  col = edgeApply(col, xz, sd, epx, epr, uNight, dry, eBand, eEmis);
  emis += eEmis;

  // ---- editor overlays ----
  if (uZoneOn > 0.5 && inMap > 0.5) {
    ivec2 zcell = clamp(ivec2(floor(xz / 16.0)), ivec2(0), ivec2(${N - 1}));
    vec4 zs = texelFetch(uZoneTex, zcell, 0) * 255.0;
    float zr = floor(zs.r + 0.5), zg = floor(zs.g + 0.5), zb = floor(zs.b + 0.5);
    float key = zr > 0.5 ? (zg > 0.5 ? zg : 1000.0 + zr) : 0.0;
    if (zr > 0.5) {
      vec3 zc = zoneColor(zr);
      bool built = gHave && (gsd < 6.0 || gn.b > 0.5);
      bool sel = uSelSettle > 0.5 && abs(zg - uSelSettle) < 0.5;
      if (uZoneOn < 1.5) col = mix(col, zc, built ? 0.12 : 0.30);
      // outline where the neighbour belongs to something else
      vec2 lc = fract(xz / 16.0) * 16.0;
      float wpx = gpx * (sel ? 3.0 : 2.0);
      float e = 0.0;
      if (abs(zKey(zcell + ivec2(1, 0)) - key) > 0.5) e = max(e, 1.0 - smoothstep(0.0, wpx, 16.0 - lc.x));
      if (abs(zKey(zcell - ivec2(1, 0)) - key) > 0.5) e = max(e, 1.0 - smoothstep(0.0, wpx, lc.x));
      if (abs(zKey(zcell + ivec2(0, 1)) - key) > 0.5) e = max(e, 1.0 - smoothstep(0.0, wpx, 16.0 - lc.y));
      if (abs(zKey(zcell - ivec2(0, 1)) - key) > 0.5) e = max(e, 1.0 - smoothstep(0.0, wpx, lc.y));
      // faint 16 m cell grid on painted cells only
      vec2 gg = abs(fract(xz / 16.0 - 0.5) - 0.5) * 16.0 / gpx;
      float gl = (1.0 - min(min(gg.x, gg.y), 1.0)) * (1.0 - smoothstep(0.5, 4.0, gpx));
      if (uZoneOn < 1.5) col = mix(col, zc * 1.1, gl * 0.14);
      col = mix(col, zc, e * 0.92);
      emis += zc * e * 0.12;
      if (sel) emis += zc * 0.10 * (0.6 + 0.4 * sin(uTime * 3.0));
    }
    if (uZoneOn > 1.5 && zb > 0.5) {  // prosperity heat: poor blue -> neutral -> rich gold
      float v = clamp((zb - 128.0) / 127.0, -1.0, 1.0);
      vec3 neu = vec3(.86,.84,.78);
      vec3 heat = v < 0.0 ? mix(neu, vec3(.20,.45,1.0), -v) : mix(neu, vec3(1.0,.76,.16), v);
      col = mix(col, heat, zr > 0.5 ? 0.5 : 0.3);
    }
  }
  if (uGrid > 0.5) {
    vec2 g1 = xz / 64.0; vec2 a1 = abs(fract(g1 - 0.5) - 0.5) / fwidth(g1);
    vec2 g2 = xz / 1024.0; vec2 a2 = abs(fract(g2 - 0.5) - 0.5) / fwidth(g2);
    float l1 = 1.0 - min(min(a1.x, a1.y), 1.0), l2 = 1.0 - min(min(a2.x, a2.y), 1.0);
    col = mix(col, vec3(1.0), (l1 * 0.16 * (1.0 - smoothstep(1500.0, 5000.0, dist)) + l2 * 0.4) * inMap);
  }
  if (uContour > 0.5) {
    float c1 = p.y / 10.0, c2 = p.y / 50.0;
    float l1 = 1.0 - min(abs(fract(c1 - 0.5) - 0.5) / fwidth(c1), 1.0);
    float l2 = 1.0 - min(abs(fract(c2 - 0.5) - 0.5) / fwidth(c2), 1.0);
    col = mix(col, vec3(.16,.10,.05), l1 * 0.3 * (1.0 - smoothstep(2000.0, 6000.0, dist)) + l2 * 0.55);
  }
  if (uSel.x <= uSel.z) {
    vec2 lo = uSel.xy, hi = uSel.zw;
    float inside = step(lo.x, xz.x) * step(xz.x, hi.x) * step(lo.y, xz.y) * step(xz.y, hi.y);
    float dx = min(abs(xz.x - lo.x), abs(xz.x - hi.x)), dz = min(abs(xz.y - lo.y), abs(xz.y - hi.y));
    float px = fwidth(xz.x) + fwidth(xz.y);
    float edge = inside * (1.0 - smoothstep(px * 0.8, px * 2.0, min(dx, dz)));
    float ants = step(0.5, fract((xz.x + xz.y) / (px * 14.0) - uTime * 1.6));
    col = mix(col, mix(vec3(0.02), vec3(1.0), ants), edge);
    col = mix(col, col * 1.1 + vec3(0.02, 0.05, 0.09), inside * 0.6);
    emis += edge * ants * 0.4;
  }
  if (uBrushOn.x > 0.5) {
    float d = length(xz - uBrush.xy);
    float r = uBrush.z;
    float aa = fwidth(d) * 1.6;
    float ring = 1.0 - smoothstep(aa * 0.5, aa * 1.5, abs(d - r));
    float ang = atan(xz.y - uBrush.y, xz.x - uBrush.x);
    float inner = (1.0 - smoothstep(aa * 0.5, aa * 1.5, abs(d - r * uBrush.w))) * step(0.5, fract(ang * 5.0)) * step(uBrush.w, 0.97) * step(0.03, uBrush.w);
    float fill = d < r ? 1.0 - smoothstep(r * uBrush.w, r, d) : 0.0;
    float dotc = 1.0 - smoothstep(aa * 0.5, aa * 2.0, d - aa * 1.5);
    vec3 bc = uBrushOn.yzw;
    col = mix(col, col * 0.7 + bc * 0.35, fill * 0.35);
    col = mix(col, bc, ring * 0.9 + inner * 0.6 + dotc * 0.8);
    emis += bc * (ring * 0.35 + inner * 0.2 + dotc * 0.3);
  }
  if (uLineOn.x > 0.5) {
    vec2 a = uLine.xy, b2 = uLine.zw, ab = b2 - a;
    float t = clamp(dot(xz - a, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
    float d = length(xz - (a + ab * t));
    float w = uLineOn.y * 0.5;
    float aa = fwidth(d) * 1.6;
    float edge = 1.0 - smoothstep(aa * 0.5, aa * 1.5, abs(d - w));
    float fillL = 1.0 - smoothstep(w - aa, w, d);
    vec3 lc = vec3(1.0, 0.75, 0.25);
    col = mix(col, lc, edge * 0.9 + fillL * 0.18);
    emis += lc * edge * 0.3;
  }
  T_rough = rough;
  T_emis = emis;
  outCol = pow(max(col, vec3(0.0)), vec3(2.2));
}
`;

function makeMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 biome; attribute vec4 paintA; attribute vec4 paintB; attribute vec4 extra;
varying vec3 vWP; varying vec3 vWN; varying vec4 vBiome; varying vec4 vPaintA; varying vec4 vPaintB; varying vec4 vExtra;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(objectNormal);
vBiome = biome; vPaintA = paintA; vPaintB = paintB; vExtra = extra;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_FRAG_HEAD)
      .replace('#include <color_fragment>', `vec3 tcol; terrainShade(tcol); diffuseColor.rgb = tcol;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = T_rough;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += pow(T_emis, vec3(2.2)) * 2.0;`);
  };
  m.customProgramCacheKey = () => 'dio-terrain';
  return m;
}

// ---- Chunks --------------------------------------------------------------
T.chunks = [];
T.dirtyH = new Set();
T.dirtyA = new Set();
T.hTexRect = null;
T.minH = 0; T.maxH = 100;

function makeChunk(cx, cz) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(TOTV * 3);
  for (let j = 0; j < CV; j++) for (let i = 0; i < CV; i++) {
    const k = (j * CV + i) * 3; pos[k] = i * CELL; pos[k + 2] = j * CELL;
  }
  const edgeXZ = [k => [k, 0], k => [k, CHUNK], k => [0, k], k => [CHUNK, k]];
  for (let e = 0; e < 4; e++) for (let k = 0; k < CV; k++) {
    const [i, j] = edgeXZ[e](k); const o = (GRIDV + e * CV + k) * 3;
    pos[o] = i * CELL; pos[o + 2] = j * CELL;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(TOTV * 3), 3));
  g.setAttribute('biome', new THREE.BufferAttribute(new Uint8Array(TOTV * 4), 4, true));
  g.setAttribute('paintA', new THREE.BufferAttribute(new Uint8Array(TOTV * 4), 4, true));
  g.setAttribute('paintB', new THREE.BufferAttribute(new Uint8Array(TOTV * 4), 4, true));
  g.setAttribute('extra', new THREE.BufferAttribute(new Uint8Array(TOTV * 4), 4, true));
  g.setIndex(IDX[2]);
  g.boundingBox = new THREE.Box3();
  g.boundingSphere = new THREE.Sphere();
  const mesh = new THREE.Mesh(g, T.material);
  mesh.position.set(cx * CHS, 0, cz * CHS);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
  const ch = { cx, cz, mesh, geo: g, lod: 2, minY: 0, maxY: 0 };
  return ch;
}

// map chunk-local vertex k (grid or skirt) to world vertex index
function skirtSrc(e, k) { return e === 0 ? [k, 0] : e === 1 ? [k, CHUNK] : e === 2 ? [0, k] : [CHUNK, k]; }

function fillHeights(ch) {
  const h = W.h;
  const pos = ch.geo.attributes.position.array, nor = ch.geo.attributes.normal.array;
  const i0 = ch.cx * CHUNK, j0 = ch.cz * CHUNK;
  let mn = 1e9, mx = -1e9;
  const c2 = 2 * CELL;
  for (let j = 0; j < CV; j++) {
    const gj = j0 + j;
    const jm = gj > 0 ? gj - 1 : 0, jp = gj < N ? gj + 1 : N;
    for (let i = 0; i < CV; i++) {
      const gi = i0 + i;
      const v = gj * VN + gi;
      const y = h[v];
      const k = j * CV + i;
      pos[k * 3 + 1] = y;
      if (y < mn) mn = y; if (y > mx) mx = y;
      const im = gi > 0 ? gi - 1 : 0, ip = gi < N ? gi + 1 : N;
      const nx = h[gj * VN + im] - h[gj * VN + ip], nz = h[jm * VN + gi] - h[jp * VN + gi];
      const inv = 1 / Math.sqrt(nx * nx + c2 * c2 + nz * nz);
      nor[k * 3] = nx * inv; nor[k * 3 + 1] = c2 * inv; nor[k * 3 + 2] = nz * inv;
    }
  }
  for (let e = 0; e < 4; e++) for (let k = 0; k < CV; k++) {
    const [i, j] = skirtSrc(e, k); const src = j * CV + i, dst = GRIDV + e * CV + k;
    pos[dst * 3 + 1] = pos[src * 3 + 1] - SKIRT;
    nor[dst * 3] = nor[src * 3]; nor[dst * 3 + 1] = nor[src * 3 + 1]; nor[dst * 3 + 2] = nor[src * 3 + 2];
  }
  ch.geo.attributes.position.needsUpdate = true;
  ch.geo.attributes.normal.needsUpdate = true;
  ch.minY = mn; ch.maxY = mx;
  ch.geo.boundingBox.min.set(0, mn - SKIRT, 0); ch.geo.boundingBox.max.set(CHS, mx, CHS);
  ch.geo.boundingBox.getBoundingSphere(ch.geo.boundingSphere);
}

function fillAttrs(ch) {
  const bio = ch.geo.attributes.biome.array, pa = ch.geo.attributes.paintA.array, pb = ch.geo.attributes.paintB.array, ex = ch.geo.attributes.extra.array;
  const i0 = ch.cx * CHUNK, j0 = ch.cz * CHUNK;
  const B = W.biome, P = W.paint, F = W.forest;
  const copy = (dst, src) => {
    const v = src; // world vertex
    bio[dst * 4] = B[v * 4]; bio[dst * 4 + 1] = B[v * 4 + 1]; bio[dst * 4 + 2] = B[v * 4 + 2]; bio[dst * 4 + 3] = B[v * 4 + 3];
    const p8 = v * 8;
    pa[dst * 4] = P[p8]; pa[dst * 4 + 1] = P[p8 + 1]; pa[dst * 4 + 2] = P[p8 + 2]; pa[dst * 4 + 3] = P[p8 + 3];
    pb[dst * 4] = P[p8 + 4]; pb[dst * 4 + 1] = P[p8 + 5]; pb[dst * 4 + 2] = P[p8 + 6]; pb[dst * 4 + 3] = P[p8 + 7];
    ex[dst * 4] = F[v];
  };
  for (let j = 0; j < CV; j++) for (let i = 0; i < CV; i++) copy(j * CV + i, (j0 + j) * VN + i0 + i);
  for (let e = 0; e < 4; e++) for (let k = 0; k < CV; k++) {
    const [i, j] = skirtSrc(e, k); copy(GRIDV + e * CV + k, (j0 + j) * VN + i0 + i);
  }
  ch.geo.attributes.biome.needsUpdate = true;
  ch.geo.attributes.paintA.needsUpdate = true;
  ch.geo.attributes.paintB.needsUpdate = true;
  ch.geo.attributes.extra.needsUpdate = true;
}

// ---- Public API -------------------------------------------------------------
T.init = function (scene, renderer) {
  T.scene = scene; T.renderer = renderer;
  T.material = makeMaterial();
  T.group = new THREE.Group();
  scene.add(T.group);
  for (let cz = 0; cz < NCH; cz++) for (let cx = 0; cx < NCH; cx++) {
    const ch = makeChunk(cx, cz);
    T.chunks.push(ch); T.group.add(ch.mesh);
  }
  // Heights as a float texture (shares W.h memory) for water depth shading.
  T.hTex = new THREE.DataTexture(W.h, VN, VN, THREE.RedFormat, THREE.FloatType);
  T.hTex.magFilter = THREE.NearestFilter; T.hTex.minFilter = THREE.NearestFilter;
  T.hTex.generateMipmaps = false; T.hTex.flipY = false;
  T.hTex.needsUpdate = true;
  T.buildOuter();
  // history registration
  D.History.regArray('h', { get data() { return W.h; }, ch: 1, res: VN, onRestore: (a, b, c, d) => T.markH(a, b, c, d, true) });
  D.History.regArray('biome', { get data() { return W.biome; }, ch: 4, res: VN, onRestore: (a, b, c, d) => T.markA(a, b, c, d) });
  D.History.regArray('paint', { get data() { return W.paint; }, ch: 8, res: VN, onRestore: (a, b, c, d) => T.markA(a, b, c, d) });
};

T.rebuildAll = function () {
  for (const ch of T.chunks) { fillHeights(ch); fillAttrs(ch); }
  T.dirtyH.clear(); T.dirtyA.clear();
  T.hTex.needsUpdate = true;
  T.hTexRect = null;
  T.recalcRange();
  T.buildOuter();
  D.emit('terrain:all');
};

T.recalcRange = function () {
  let mn = 1e9, mx = -1e9; const h = W.h;
  for (let k = 0; k < V; k += 7) { const y = h[k]; if (y < mn) mn = y; if (y > mx) mx = y; }
  T.minH = mn; T.maxH = mx;
};

// Mark a vertex rect as changed. heights=true -> geometry + height texture.
T.markH = function (i0, j0, i1, j1, fromUndo) {
  i0 = Math.max(0, i0 | 0); j0 = Math.max(0, j0 | 0); i1 = Math.min(N, Math.ceil(i1)); j1 = Math.min(N, Math.ceil(j1));
  // normals reach one vertex further
  const ci0 = Math.max(0, Math.floor((i0 - 1) / CHUNK)), ci1 = Math.min(NCH - 1, Math.floor((i1 + 1) / CHUNK));
  const cj0 = Math.max(0, Math.floor((j0 - 1) / CHUNK)), cj1 = Math.min(NCH - 1, Math.floor((j1 + 1) / CHUNK));
  for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) T.dirtyH.add(cj * NCH + ci);
  const r = T.hTexRect;
  if (!r) T.hTexRect = [i0, j0, i1, j1];
  else { r[0] = Math.min(r[0], i0); r[1] = Math.min(r[1], j0); r[2] = Math.max(r[2], i1); r[3] = Math.max(r[3], j1); }
  if (i0 <= 0 || j0 <= 0 || i1 >= N || j1 >= N) T.outerDirty = true;
  D.emit('terrain:h', i0, j0, i1, j1);
  if (fromUndo) D.emit('terrain:undo', [i0, j0, i1, j1]);
};
T.markA = function (i0, j0, i1, j1) {
  i0 = Math.max(0, i0 | 0); j0 = Math.max(0, j0 | 0); i1 = Math.min(N, Math.ceil(i1)); j1 = Math.min(N, Math.ceil(j1));
  const ci0 = Math.floor(Math.max(0, i0 - 1) / CHUNK), ci1 = Math.min(NCH - 1, Math.floor((i1 + 1) / CHUNK));
  const cj0 = Math.floor(Math.max(0, j0 - 1) / CHUNK), cj1 = Math.min(NCH - 1, Math.floor((j1 + 1) / CHUNK));
  for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) T.dirtyA.add(cj * NCH + ci);
  D.emit('terrain:a', i0, j0, i1, j1);
};

let hTexTimer = 0;
T.update = function (dt, camera) {
  if (T.dirtyH.size) {
    T.dirtyH.forEach(k => fillHeights(T.chunks[k]));
    T.dirtyH.clear();
  }
  if (T.dirtyA.size) {
    T.dirtyA.forEach(k => fillAttrs(T.chunks[k]));
    T.dirtyA.clear();
  }
  hTexTimer -= dt;
  if (T.hTexRect && hTexTimer <= 0) {
    const r = T.hTexRect;
    D.subUpload(T.renderer, T.hTex, r[0], r[1], r[2] - r[0] + 1, r[3] - r[1] + 1);
    T.hTexRect = null; hTexTimer = 0.12;
  }
  if (T.outerDirty && !D.History.active()) { T.outerDirty = false; T.buildOuter(); }
  // LOD
  const cp = camera.position;
  const base = D.Q.high ? 1350 : 800;
  for (const ch of T.chunks) {
    const x0 = ch.cx * CHS, z0 = ch.cz * CHS;
    const dx = Math.max(x0 - cp.x, 0, cp.x - (x0 + CHS));
    const dz = Math.max(z0 - cp.z, 0, cp.z - (z0 + CHS));
    const dy = Math.max(ch.minY - cp.y, 0, cp.y - ch.maxY);
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // chunks carrying roads keep full detail much further out, so graded road beds never
    // get interpolated away under the road ribbon
    const K = T.roadChunks[ch.cz * NCH + ch.cx] ? LOD_ROAD : LOD_BASE;
    const lod = d < base * K[0] ? 0 : d < base * K[1] ? 1 : d < base * K[2] ? 2 : d < base * K[3] ? 3 : 4;
    if (lod !== ch.lod) { ch.lod = lod; ch.geo.setIndex(IDX[lod]); }
  }
  TU.uCam.value.copy(cp);
  // ---- border state ----
  const E = TU.uEdge.value;
  E.y *= Math.exp(-dt * 1.6);
  const want = (D.UI && D.UI.photo) || (D.Cam && D.Cam.flyT >= 0) || T.showBorder === false ? 0 : 1;
  E.x += (want - E.x) * (1 - Math.exp(-dt * 5));
  TU.uEdgeCfg.value.x = T.edgeMode === 'slab' ? 1 : 0;
  if (T.markers) T.markers.visible = E.x >= 0.05;
};
const LOD_BASE = [1, 2.2, 4.5, 9], LOD_ROAD = [2.5, 7, 14, 28];

// ---- Road-aware LOD: chunks within reach of any road segment ---------------------------
T.roadChunks = new Uint8Array(NCH * NCH);
D.on('roads:rebuilt', () => {
  T.roadChunks.fill(0);
  if (!D.Roads || !D.Roads.segs) return;
  D.Roads.segs.forEach(seg => {
    const S = D.Roads.segSamples(seg), TT = D.Roads.TYPES[seg.type], m = (TT ? TT.w : 6) / 2 + 24;
    for (let q = 0; q < S.n; q += 2) for (const ox of [-m, m]) for (const oz of [-m, m]) {
      const cx = D.clamp(Math.floor((S.x[q] + ox) / CHS), 0, NCH - 1), cz = D.clamp(Math.floor((S.z[q] + oz) / CHS), 0, NCH - 1);
      T.roadChunks[cz * NCH + cx] = 1;
    }
  });
});

// ---- Border helpers --------------------------------------------------------------------
T.showBorder = true;
function outDist(x, z) { const cx = D.clamp(x, 0, SIZE), cz = D.clamp(z, 0, SIZE); return Math.hypot(x - cx, z - cz); }
T.hOut = function (x, z) { return edgeH(x, z) - 0.4; }; // replaced by the ring's real profile in buildRing
// Terrain ray first; if it misses the map, march the outer ring (or the slab's sea plane).
T.raycastAny = function (o, d) {
  const hit = T.raycast(o, d);
  if (hit) return hit;
  if (T.edgeMode === 'slab') {
    const p = T.rayPlane(o, d, W.seaLevel);
    if (!p) return null;
    p.outside = true; p.dOut = outDist(p.x, p.z);
    return p;
  }
  const hf = T.hOut, sea = W.seaLevel;
  const f = t => { const x = o.x + d.x * t, z = o.z + d.z * t; return o.y + d.y * t - Math.max(hf(x, z), sea); };
  let t = 0, dt = 20, prev = f(0);
  if (prev < 0) return null;
  for (let s = 0; s < 96; s++) {
    const t2 = t + dt, v = f(t2);
    if (v < 0) {
      let a = t, b = t2;
      for (let k = 0; k < 12; k++) { const m = (a + b) * 0.5; if (f(m) < 0) b = m; else a = m; }
      const x = o.x + d.x * b, z = o.z + d.z * b;
      return { x, z, y: Math.max(hf(x, z), sea), t: b, outside: true, dOut: outDist(x, z) };
    }
    t = t2; prev = v; dt *= 1.06;
  }
  return null;
};
T.edgePulse = function (x, z) {
  let px = D.clamp(x, 0, SIZE), pz = D.clamp(z, 0, SIZE);
  if (px === x && pz === z) { // inside: nearest point on the border
    const m = Math.min(x, SIZE - x, z, SIZE - z);
    if (m === x) px = 0; else if (m === SIZE - x) px = SIZE; else if (m === z) pz = 0; else pz = SIZE;
  }
  const E = TU.uEdge.value;
  E.y = 1; E.z = px; E.w = pz;
};
let refuseT = -1e9;
T.edgeRefuse = function (x, z, msg) {
  T.edgePulse(x, z);
  const now = performance.now();
  if (now - refuseT > 3000) { refuseT = now; D.toast(msg || "That's beyond the border of your land."); }
};

T.setFaceted = function (on) { T.material.flatShading = on; T.material.needsUpdate = true; };

// ---- Sampling -----------------------------------------------------------
// Height at world x,z matching the rendered (LOD0) triangles.
T.hAt = function (x, z) {
  let fx = x / CELL, fz = z / CELL;
  if (fx < 0) fx = 0; else if (fx > N) fx = N;
  if (fz < 0) fz = 0; else if (fz > N) fz = N;
  let i = fx | 0, j = fz | 0;
  if (i >= N) i = N - 1; if (j >= N) j = N - 1;
  const u = fx - i, v = fz - j;
  const k = j * VN + i, h = W.h;
  const a = h[k], b = h[k + 1], c = h[k + VN], d = h[k + VN + 1];
  if (((i + j) & 1) === 0) {
    if (u + v <= 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  if (u >= v) return a + (b - a) * u + (d - b) * v;
  return a + (c - a) * v + (d - c) * u;
};
T.hGrid = (i, j) => W.h[D.vi(i, j)];
T.normalAt = function (x, z, out) {
  const e = CELL;
  const nx = T.hAt(x - e, z) - T.hAt(x + e, z), nz = T.hAt(x, z - e) - T.hAt(x, z + e);
  out = out || new THREE.Vector3();
  return out.set(nx, 2 * e, nz).normalize();
};
T.slopeAt = function (x, z) { // degrees
  const n = T.normalAt(x, z, tmpN);
  return Math.acos(D.clamp(n.y, -1, 1)) * 180 / Math.PI;
};
const tmpN = new THREE.Vector3();
T.waterAt = function (x, z) { // surface level of any water at x,z (sea, lake) or -1e9
  const i = D.clamp(Math.round(x / CELL), 0, N), j = D.clamp(Math.round(z / CELL), 0, N);
  let w = W.water[j * VN + i];
  if (W.seaLevel > w) w = W.seaLevel;
  if (D.Water && D.Water.riverAt) { const r = D.Water.riverAt(x, z); if (r > w) w = r; }
  return w;
};
T.isWet = function (x, z, margin) { return T.waterAt(x, z) > T.hAt(x, z) + (margin || 0); };

// ---- Ray picking ----------------------------------------------------------
// Returns {x,y,z} of the first terrain hit along the ray, or null.
T.raycast = function (o, d, maxT) {
  maxT = maxT || 90000;
  let t = 0;
  // clip to the map's bounding box
  const lo = [0, T.minH - 50, 0], hi = [SIZE, Math.max(T.maxH, W.seaLevel) + 50, SIZE];
  const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  let t0 = 0, t1 = maxT;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(dd[a]) < 1e-9) { if (oo[a] < lo[a] || oo[a] > hi[a]) return null; continue; }
    let ta = (lo[a] - oo[a]) / dd[a], tb = (hi[a] - oo[a]) / dd[a];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  t = t0;
  let prevT = t;
  let px = o.x + d.x * t, pz = o.z + d.z * t, py = o.y + d.y * t;
  let prevDiff = py - T.hAt(px, pz);
  if (prevDiff < 0) return { x: px, y: T.hAt(px, pz), z: pz, t };
  let guard = 0;
  while (t < t1 && guard++ < 4000) {
    const step = Math.max(0.8, Math.min(prevDiff * 0.35, 300));
    t += step;
    px = o.x + d.x * t; pz = o.z + d.z * t; py = o.y + d.y * t;
    const diff = py - T.hAt(px, pz);
    if (diff < 0) {
      let a = prevT, b = t;
      for (let k = 0; k < 16; k++) {
        const m = (a + b) * 0.5;
        const mx = o.x + d.x * m, mz = o.z + d.z * m, my = o.y + d.y * m;
        if (my - T.hAt(mx, mz) < 0) b = m; else a = m;
      }
      const hx = o.x + d.x * b, hz = o.z + d.z * b;
      return { x: hx, y: T.hAt(hx, hz), z: hz, t: b };
    }
    prevT = t; prevDiff = diff;
  }
  return null;
};
// Ray vs horizontal plane
T.rayPlane = function (o, d, y) {
  if (Math.abs(d.y) < 1e-6) return null;
  const t = (y - o.y) / d.y;
  if (t < 0) return null;
  return { x: o.x + d.x * t, y, z: o.z + d.z * t, t };
};

// ---- Outer world ring + diorama slab ------------------------------------------
T.edgeMode = 'endless';
T.buildOuter = function () {
  if (!T.scene) return;
  if (T.outer) { T.group.remove(T.outer); T.outer.geometry.dispose(); T.outer = null; }
  if (T.slab) { T.group.remove(T.slab); T.slab.geometry.dispose(); T.slab = null; }
  if (T.markers) { T.group.remove(T.markers); T.markers.geometry.dispose(); T.markers = null; }
  if (T.edgeMode === 'slab') buildSlab(); else { buildRing(); buildMarkers(); }
};

// Boundary markers: stones every 192 m just outside the line, lantern posts every 4th,
// pennant poles every 16th, cairns at the corners. One merged static mesh, not saved.
let markerMat = null;
function markerMaterial() {
  if (markerMat) return markerMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = TU.uNight; sh.uniforms.uEdge = TU.uEdge;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow; varying float vGlowM;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlowM = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight; uniform vec4 uEdge; varying float vGlowM;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlowM * uNight * 3.0 * uEdge.x;');
    if (!sh.vertexShader.includes('vGlowM = glow') || !sh.fragmentShader.includes('vGlowM * uNight')) console.warn('border marker shader injection failed');
  };
  m.customProgramCacheKey = () => 'dio-bmarks';
  return markerMat = m;
}
function buildMarkers() {
  const parts = [];
  const put = (geo, hex, glow, x, y, z, rot) => {
    const g = D.colorGeo(geo, hex, 'glow', glow);
    if (rot) g.rotateY(rot);
    g.translate(x, y, z);
    parts.push(g);
  };
  const box = (w, h, d, ox, oy, oz) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(ox || 0, (oy || 0) + h / 2, oz || 0); return g; };
  const wet = (x, z) => {
    const y = T.hOut(x, z);
    if (y < W.seaLevel + 0.15) return true;
    const cx = D.clamp(x, 0, SIZE), cz = D.clamp(z, 0, SIZE);
    return T.waterAt(cx, cz) > T.hAt(cx, cz) + 0.1;
  };
  const stone = (x, z, rot) => {
    const y = T.hOut(x, z) - 0.3;
    put(box(0.55, 1.3, 0.35), 0x8e897e, 0, x, y, z, rot);
    put(box(0.45, 0.1, 0.3, 0, 1.3), 0x77736b, 0, x, y, z, rot);
  };
  const lantern = (x, z, rot, outX, outZ) => {
    const y = T.hOut(x, z) - 0.2;
    put(box(0.5, 0.35, 0.5), 0x7d786e, 0, x, y, z, rot);                   // stone footing
    put(box(0.18, 2.6, 0.18), 0x4a3a2a, 0, x, y, z, rot);                  // oak post
    put(box(0.08, 0.08, 0.62, 0, 2.42, 0.28), 0x2e2a26, 0, x, y, z, rot);   // iron arm (outward = local +z)
    put(box(0.3, 0.38, 0.3, 0, 1.98, 0.52), 0xffc46a, 1, x, y, z, rot);     // glazed box (glows)
    put(new THREE.ConeGeometry(0.26, 0.22, 4).rotateY(Math.PI / 4).translate(0, 2.47, 0.52), 0x2e2a26, 0, x, y, z, rot);
  };
  const pennant = (x, z, rot) => {
    const y = T.hOut(x, z) - 0.3;
    put(box(0.7, 0.4, 0.7), 0x7d786e, 0, x, y, z, rot);
    put(new THREE.CylinderGeometry(0.08, 0.1, 9, 6).translate(0, 4.5, 0), 0x5a4632, 0, x, y, z, rot);
    put(new THREE.SphereGeometry(0.16, 6, 4).translate(0, 9.1, 0), 0xd8a820, 0, x, y, z, rot);
    const f = new THREE.BufferGeometry();
    const P = [0, 8.8, 0, 0, 7.6, 0, 0, 8.2, 2.2];
    f.setAttribute('position', new THREE.Float32BufferAttribute(P.concat([P[0], P[1], P[2], P[6], P[7], P[8], P[3], P[4], P[5]]), 3));
    f.computeVertexNormals();
    put(f, 0xb8322a, 0, x, y, z, rot);
  };
  const cairn = (x, z) => {
    const y = T.hOut(x, z) - 0.4, r = D.rng((x * 7 + z * 13) | 0);
    const cols = [0x8e897e, 0x7d786e, 0x99948a, 0x857f74];
    let h = 0;
    for (let k = 0; k < 6; k++) {
      const s = 1.1 - k * 0.14, g = new THREE.DodecahedronGeometry(s, 0);
      g.scale(1, 0.62, 1); g.rotateY(r() * 6.28);
      g.translate((r() - 0.5) * 0.3, h + s * 0.5, (r() - 0.5) * 0.3);
      put(g, cols[k & 3], 0, x, y, z, 0);
      h += s * 0.72;
    }
  };
  const STEP = 192, OFF = 1.5, NK = Math.floor(SIZE / STEP);
  // sides: [x(t), z(t), rotation so local +z points outward]
  const sides = [
    [t => t, () => -OFF, Math.PI],        // north edge z = 0: outward -z
    [() => SIZE + OFF, t => t, Math.PI / 2], // east edge x = SIZE: outward +x
    [t => t, () => SIZE + OFF, 0],        // south edge z = SIZE: outward +z
    [() => -OFF, t => t, -Math.PI / 2]    // west edge x = 0: outward -x
  ];
  for (const [fx, fz, rot] of sides) {
    for (let k = 1; k <= NK; k++) {
      const t = k * STEP; if (t > SIZE - 40) break;
      const x = fx(t), z = fz(t);
      if (wet(x, z)) continue;
      if (k % 16 === 0) pennant(x, z, rot);
      else if (k % 4 === 0) lantern(x, z, rot);
      else stone(x, z, rot);
    }
  }
  for (const [x, z] of [[-4, -4], [SIZE + 4, -4], [SIZE + 4, SIZE + 4], [-4, SIZE + 4]]) if (!wet(x, z)) cairn(x, z);
  if (!parts.length) return;
  const g = D.mergeGeos(parts);
  parts.forEach(p => p.dispose());
  const m = new THREE.Mesh(g, markerMaterial());
  m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
  m.visible = TU.uEdge.value.x >= 0.05;
  T.markers = m;
  T.group.add(m);
}

function edgeH(x, z) { // nearest in-map height for a point outside the map
  return T.hAt(D.clamp(x, 0, SIZE), D.clamp(z, 0, SIZE));
}

function buildRing() {
  // Non-uniform grid: 32 m spacing along the map edge, growing outward to the horizon.
  const outs = [32, 96, 224, 480, 900, 1600, 2700, 4400, 7000, 11000, 17000, 26000, 40000];
  const xs = [];
  for (let k = outs.length - 1; k >= 0; k--) xs.push(-outs[k]);
  for (let x = 0; x <= SIZE; x += 32) xs.push(x);
  for (let k = 0; k < outs.length; k++) xs.push(SIZE + outs[k]);
  const R = xs.length;
  const nz = D.makeNoise(W.seed * 7 + 3);
  const base = W.seaLevel - 90;
  const clim = W.climate | 0;
  const pos = [], nor = [], bio = [], ex = [], idx = [];
  const map = new Int32Array(R * R).fill(-1);
  const hOut = (x, z) => {
    const cx = D.clamp(x, 0, SIZE), cz = D.clamp(z, 0, SIZE);
    const dist = Math.hypot(x - cx, z - cz);
    const e = T.hAt(cx, cz);
    if (dist < 1) return e - 0.4;
    const k = D.smooth(0, 5200, dist);
    return D.lerp(e, Math.min(e, base), k) + nz.fbm(x / 3000, z / 3000, 3) * 90 * D.smooth(0, 1500, dist) * (1 - k * 0.6) - 0.4;
  };
  T.hOut = hOut;
  const vtx = (i, j) => {
    const key = j * R + i;
    if (map[key] >= 0) return map[key];
    const x = xs[i], z = xs[j];
    const y = hOut(x, z);
    const e = 24;
    const n = new THREE.Vector3(hOut(x - e, z) - hOut(x + e, z), 2 * e, hOut(x, z - e) - hOut(x, z + e)).normalize();
    pos.push(x, y, z); nor.push(n.x, n.y, n.z);
    bio.push(clim === 0 ? 255 : 0, clim === 1 ? 255 : 0, clim === 2 ? 255 : 0, clim === 3 ? 255 : 0);
    ex.push(0, 0, 0, 255);
    return (map[key] = pos.length / 3 - 1);
  };
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < R - 1; i++) {
    if (xs[i] >= 0 && xs[i + 1] <= SIZE && xs[j] >= 0 && xs[j + 1] <= SIZE) continue;
    const a = vtx(i, j), b = vtx(i + 1, j), c = vtx(i, j + 1), d = vtx(i + 1, j + 1);
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  const cnt = pos.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('biome', new THREE.BufferAttribute(new Uint8Array(bio), 4, true));
  g.setAttribute('paintA', new THREE.BufferAttribute(new Uint8Array(cnt * 4), 4, true));
  g.setAttribute('paintB', new THREE.BufferAttribute(new Uint8Array(cnt * 4), 4, true));
  g.setAttribute('extra', new THREE.BufferAttribute(new Uint8Array(ex), 4, true));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, T.material);
  m.receiveShadow = true;
  T.outer = m;
  T.group.add(m);
}

// Diorama slab: the map as a model on a plinth with a soil cross-section.
function buildSlab() {
  const pos = [], col = [], idx = [];
  const bottom = Math.min(T.minH, W.seaLevel) - 260;
  const soil = [[0.40, 0.29, 0.18], [0.52, 0.38, 0.24], [0.33, 0.25, 0.17], [0.58, 0.48, 0.34], [0.45, 0.42, 0.40]];
  const sides = [
    k => [k * CELL, 0, 0, -1], k => [SIZE - k * CELL, SIZE, 0, 1], k => [0, SIZE - k * CELL, -1, 0], k => [SIZE, k * CELL, 1, 0]
  ];
  const STEP = 1;
  for (const s of sides) {
    for (let k = 0; k < N; k += STEP) {
      const [xa, za] = s(k), [xb, zb] = s(k + STEP);
      const ya = T.hAt(xa, za), yb = T.hAt(xb, zb);
      // stack strata bands for a layered cross-section
      const bands = [bottom, bottom + 60, bottom + 130, bottom + 170, bottom + 220];
      const topA = ya, topB = yb;
      for (let bI = 0; bI < bands.length; bI++) {
        const y0 = bands[bI], y1n = bI + 1 < bands.length ? bands[bI + 1] : 1e9;
        const a0 = Math.min(y0, topA), b0 = Math.min(y0, topB);
        const a1 = Math.min(y1n, topA), b1 = Math.min(y1n, topB);
        if (a1 - a0 < 0.01 && b1 - b0 < 0.01) continue;
        const c = soil[bI];
        const base = pos.length / 3;
        pos.push(xa, a0, za, xb, b0, zb, xa, a1, za, xb, b1, zb);
        const cA = bI === bands.length - 1 ? [0.30, 0.42, 0.20] : c;
        for (let q = 0; q < 4; q++) col.push(...(q >= 2 && bI === bands.length - 1 ? [0.36, 0.30, 0.20] : cA));
        idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
      // water face where the sea sits above the ground
      const wl = W.seaLevel;
      if (wl > ya || wl > yb) {
        const base = pos.length / 3;
        pos.push(xa, Math.min(ya, wl), za, xb, Math.min(yb, wl), zb, xa, wl, za, xb, wl, zb);
        for (let q = 0; q < 4; q++) col.push(0.10, 0.36, 0.45);
        idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
  }
  // base plate
  const b = pos.length / 3, M = 120;
  pos.push(-M, bottom, -M, SIZE + M, bottom, -M, -M, bottom, SIZE + M, SIZE + M, bottom, SIZE + M);
  for (let q = 0; q < 4; q++) col.push(0.12, 0.11, 0.10);
  idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  const g = new THREE.BufferGeometry();
  const lc = col.map(v => Math.pow(v, 2.2));
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  T.slab = new THREE.Mesh(g, mat);
  T.slab.receiveShadow = true;
  T.group.add(T.slab);
}

T.setEdgeMode = function (m) { T.edgeMode = m; T.buildOuter(); D.emit('edgemode', m); };
})();
