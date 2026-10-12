// Jimbog - optional real-texture manifest. Empty by default: every texture is procedural.
//
// Each key is a texture name from JB.Tex.list. Each value gives image files, relative to the page
// (Jimbog/), for any of these slots (leave out what you do not have):
//   albedo  sRGB colour
//   normal  OpenGL convention (+Y up, as Poly Haven "_nor_gl" and ambientCG "_NormalGL")
//   rough   greyscale roughness
// One image covers one 2 m tile, the same as the procedural textures.
// How to add a set: see Jimbog/assets/tex/README.md.
//
// Example (do not uncomment until the files exist):
//   concrete_wall: { albedo: 'assets/tex/concrete_wall/albedo.jpg', normal: 'assets/tex/concrete_wall/normal.jpg', rough: 'assets/tex/concrete_wall/rough.jpg' },
(function () {
  'use strict';
  const JB = window.JB = window.JB || {};
  JB.TexManifest = {};
})();
