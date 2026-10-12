// Jimbog - real CC0 textures (Poly Haven, polyhaven.com, public domain). Written by _kit/ph_fetch.py.
// Each entry: image files (relative to Jimbog/) for the colour, normal (OpenGL) and roughness maps,
// and `tile`: how many metres one image covers in the world. Remove an entry to fall back to the
// procedural texture of the same name. See Jimbog/assets/tex/README.md.
(function () {
  'use strict';
  const JB = window.JB = window.JB || {};
  JB.TexManifest = {
    concrete_floor: { albedo: 'assets/tex/concrete_floor/albedo.jpg', normal: 'assets/tex/concrete_floor/normal.jpg', rough: 'assets/tex/concrete_floor/rough.jpg', tile: 3.0 },   // concrete_floor_worn_001
    concrete_wall: { albedo: 'assets/tex/concrete_wall/albedo.jpg', normal: 'assets/tex/concrete_wall/normal.jpg', rough: 'assets/tex/concrete_wall/rough.jpg', tile: 2.71 },   // concrete_wall_008
    lab_white: { albedo: 'assets/tex/lab_white/albedo.jpg', normal: 'assets/tex/lab_white/normal.jpg', rough: 'assets/tex/lab_white/rough.jpg', tile: 2.0 },   // painted_plaster_wall
    brick: { albedo: 'assets/tex/brick/albedo.jpg', normal: 'assets/tex/brick/normal.jpg', rough: 'assets/tex/brick/rough.jpg', tile: 2.0 },   // medieval_red_brick
    tiles_wall: { albedo: 'assets/tex/tiles_wall/albedo.jpg', normal: 'assets/tex/tiles_wall/normal.jpg', rough: 'assets/tex/tiles_wall/rough.jpg', tile: 1.27 },   // long_white_tiles
    tiles_floor: { albedo: 'assets/tex/tiles_floor/albedo.jpg', normal: 'assets/tex/tiles_floor/normal.jpg', rough: 'assets/tex/tiles_floor/rough.jpg', tile: 3.0 },   // large_floor_tiles_02
    painted_metal: { albedo: 'assets/tex/painted_metal/albedo.jpg', normal: 'assets/tex/painted_metal/normal.jpg', rough: 'assets/tex/painted_metal/rough.jpg', tile: 2.5 },   // blue_metal_plate
    metal_panel: { albedo: 'assets/tex/metal_panel/albedo.jpg', normal: 'assets/tex/metal_panel/normal.jpg', rough: 'assets/tex/metal_panel/rough.jpg', tile: 2.0 },   // metal_plate_02
    diamond_plate: { albedo: 'assets/tex/diamond_plate/albedo.jpg', normal: 'assets/tex/diamond_plate/normal.jpg', rough: 'assets/tex/diamond_plate/rough.jpg', tile: 0.5 },   // metal_plate
    rust: { albedo: 'assets/tex/rust/albedo.jpg', normal: 'assets/tex/rust/normal.jpg', rough: 'assets/tex/rust/rough.jpg', tile: 1.25 },   // rusty_metal_05
    crate: { albedo: 'assets/tex/crate/albedo.jpg', normal: 'assets/tex/crate/normal.jpg', rough: 'assets/tex/crate/rough.jpg', tile: 1.5 },   // wood_planks
    ceiling: { albedo: 'assets/tex/ceiling/albedo.jpg', normal: 'assets/tex/ceiling/normal.jpg', rough: 'assets/tex/ceiling/rough.jpg', tile: 2.7 },   // corrugated_iron_02
    epoxy_yellow: { albedo: 'assets/tex/epoxy_yellow/albedo.jpg', normal: 'assets/tex/epoxy_yellow/normal.jpg', rough: 'assets/tex/epoxy_yellow/rough.jpg', tile: 4.0 },   // painted_concrete_02
    grass: { albedo: 'assets/tex/grass/albedo.jpg', normal: 'assets/tex/grass/normal.jpg', rough: 'assets/tex/grass/rough.jpg', tile: 2.51 },   // grass_ground
    paving: { albedo: 'assets/tex/paving/albedo.jpg', normal: 'assets/tex/paving/normal.jpg', rough: 'assets/tex/paving/rough.jpg', tile: 2.0 },   // concrete_pavers_02
    asphalt: { albedo: 'assets/tex/asphalt/albedo.jpg', normal: 'assets/tex/asphalt/normal.jpg', rough: 'assets/tex/asphalt/rough.jpg', tile: 2.0 },   // asphalt_pit_lane
    brick_tan: { albedo: 'assets/tex/brick_tan/albedo.jpg', normal: 'assets/tex/brick_tan/normal.jpg', rough: 'assets/tex/brick_tan/rough.jpg', tile: 2.0 },   // yellow_brick
    brick_dark: { albedo: 'assets/tex/brick_dark/albedo.jpg', normal: 'assets/tex/brick_dark/normal.jpg', rough: 'assets/tex/brick_dark/rough.jpg', tile: 4.0 },   // brick_wall_11
    render_cream: { albedo: 'assets/tex/render_cream/albedo.jpg', normal: 'assets/tex/render_cream/normal.jpg', rough: 'assets/tex/render_cream/rough.jpg', tile: 2.3 },   // plaster_stone_wall_01
    roof_membrane: { albedo: 'assets/tex/roof_membrane/albedo.jpg', normal: 'assets/tex/roof_membrane/normal.jpg', rough: 'assets/tex/roof_membrane/rough.jpg', tile: 6.0 },   // bitumen
    roof_metal: { albedo: 'assets/tex/roof_metal/albedo.jpg', normal: 'assets/tex/roof_metal/normal.jpg', rough: 'assets/tex/roof_metal/rough.jpg', tile: 2.0 },   // corrugated_iron_03
    timber: { albedo: 'assets/tex/timber/albedo.jpg', normal: 'assets/tex/timber/normal.jpg', rough: 'assets/tex/timber/rough.jpg', tile: 2.0 },   // wood_planks_dirt
    timber_floor: { albedo: 'assets/tex/timber_floor/albedo.jpg', normal: 'assets/tex/timber_floor/normal.jpg', rough: 'assets/tex/timber_floor/rough.jpg', tile: 2.08 },   // laminate_floor_03
    soil: { albedo: 'assets/tex/soil/albedo.jpg', normal: 'assets/tex/soil/normal.jpg', rough: 'assets/tex/soil/rough.jpg', tile: 1.3 },   // brown_mud_dry
    gravel: { albedo: 'assets/tex/gravel/albedo.jpg', normal: 'assets/tex/gravel/normal.jpg', rough: 'assets/tex/gravel/rough.jpg', tile: 2.0 },   // gravel_stones
  };
})();
