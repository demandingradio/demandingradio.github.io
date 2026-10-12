# Real textures for Jimbog (optional)

Jimbog draws every surface from procedural textures (`js/textures.js`), so the game needs no image
files. You can replace any texture with a real CC0 photo set. The procedural one still draws first, and
the image swaps in when it has loaded. A missing or broken file keeps the procedural texture.

## How it is wired

- `js/texmanifest.js` defines `JB.TexManifest`. It is empty by default.
- `js/textures.js` reads the manifest when a texture is first made. Each entry names image files for
  one texture. The files load in the background and are swapped into the same texture objects (and any
  clones of them), so nothing else needs to change.
- The page must load `js/texmanifest.js?v=6` **before** `js/textures.js`. Add this line to `index.html`
  just above the `textures.js` script tag:

      <script src="js/texmanifest.js?v=6"></script>

  Without this line the manifest is never read and everything stays procedural.

## The conventions (match these)

| Slot     | File          | Format                                                       |
|----------|---------------|--------------------------------------------------------------|
| albedo   | `albedo.jpg`  | sRGB colour, no baked lighting or shadows                    |
| normal   | `normal.jpg`  | tangent space, **OpenGL** convention (green = +Y, up)        |
| rough    | `rough.jpg`   | greyscale; white = rough, black = smooth                     |

- One image covers one **2 m x 2 m tile** (the same as the procedural textures). Materials repeat the tile.
  If a real set describes a 1 m patch, tile it 2 x 2 in an image editor before you save it.
- Use the **1K** size (1024 x 1024). Anything larger costs GPU memory for little gain at game distances.
- Keep the edges seamless (Poly Haven and ambientCG sets already are).
- Poly Haven names its OpenGL normal `*_nor_gl_*`. ambientCG names it `*_NormalGL*`. Use those, not the DirectX
  (`*_nor_dx*`, `*_NormalDX*`) versions. If you only have a DirectX normal, flip its green channel:

      python3 -c "from PIL import Image,ImageOps; im=Image.open('in.jpg').convert('RGB'); r,g,b=im.split(); Image.merge('RGB',(r,ImageOps.invert(g),b)).save('out.jpg',quality=92)"

- Roughness only: a gloss or specular map must be inverted (gloss 1 = smooth, so rough = 1 - gloss).

## Adding a set (step by step)

1. Download a 1K JPG set (both sites are CC0):
   - Poly Haven: https://polyhaven.com/textures (download the 1K JPG files: `_diff_`, `_nor_gl_`, `_rough_`).
   - ambientCG: https://ambientcg.com (download the 1K-JPG zip: `_Color`, `_NormalGL`, `_Roughness`).
2. Create a folder for the texture name, for example `Jimbog/assets/tex/concrete_wall/`. Copy in the files and
   rename them to `albedo.jpg`, `normal.jpg` and `rough.jpg`. Remove any extra maps you do not use.
3. Add an entry to `Jimbog/js/texmanifest.js`. Use a texture name from `JB.Tex.list` (for example
   `concrete_wall`, `metal_panel`, `tiles_wall`, `brick`). Paths are relative to `Jimbog/`:

       JB.TexManifest = {
         concrete_wall: {
           albedo: 'assets/tex/concrete_wall/albedo.jpg',
           normal: 'assets/tex/concrete_wall/normal.jpg',
           rough:  'assets/tex/concrete_wall/rough.jpg'
         }
       };

   Leave out a slot to keep its procedural map.
4. Reload the game. Check the console for 404 errors. A 404 means a wrong path, which keeps the procedural map.
5. Tune the look in `js/level.js` (`MATP`): `rough` multiplies the rough map, `metal` sets metalness and `ns` sets
   normal strength. Real sets often need `ns` near 1.0. Start with the existing `MATP` values.

## Names you can use

Run `JB.Tex.list` in the browser console to see them all. The Facility textures are `concrete_floor`,
`concrete_wall`, `metal_panel`, `painted_metal`, `diamond_plate`, `hazard`, `tiles_wall`, `tiles_floor`,
`epoxy_yellow`, `rust`, `ceiling`, `crate`, `brick`, `rubber`, `lab_white` and `grate`. The cat fur textures
(`fur_*`) are part of the cats and should not be replaced.

## Notes

- Low quality (256 px procedural) still uses the same image files. Real images are not resized for it.
- The campus indoor rooms (`level2.js`) also use several of these names, so a manifest entry changes both maps.
