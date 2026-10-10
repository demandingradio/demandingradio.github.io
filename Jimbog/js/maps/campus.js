// Jimbog — "Research Campus": traced from the owner's education-centre plan
// (the old school is gone; the layout lives on as a 1970s research campus).
//
// Scale: 1 plan unit = 0.25 m. x = (planX - 20) * 0.25 east, z = (planY - 34)
// * 0.25 south, so north is up exactly as on the plan. Ground is y = 0.
//
//   1  Lab Block North / South Research Wing (south block is 2 storeys)
//   2  Research Wing east (2 storeys)    3  Archive Library
//   4  Test Hall (gym)                   5  Administration
//   6  Conference Centre (barrel roof)   7  Workshop
//   8  Data Centre                       9  Amenities
//   10 tennis court  11 basketball court  12 car parks  13 pergola
(function () {
  'use strict';
  const JB = window.JB;

  const UP = 3.7;           // upstairs floor in the south wing
  const SL = (y) => y;      // readability helper for heights

  // ---------------------------------------------------------------- ground
  // Painted in order; later entries win. All outdoor ground is one open group.
  const G = (id, name, rects, fmat, extra) => Object.assign({ id, name, rects, fmat, floor: 0 }, extra || {});
  const ground = [
    G('site', 'Campus Grounds', [[5, 1, 124.5, 159]], 'grass'),
    G('nfield', 'North Field', [[6.5, 3.5, 73.5, 51]], 'grass'),
    G('sfield', 'South Field', [[6.5, 111.5, 81, 159]], 'grass'),
    G('vines', 'Experimental Vineyard', [[101, 64, 122.5, 101.5]], 'soil'),
    G('orchard', 'Test Orchard', [[101, 103, 122.5, 124]], 'grass'),
    G('tennis', 'Tennis Court', [[54.5, 34, 83.5, 47.5]], 'court_blue'),
    G('bball', 'Basketball Court', [[54.5, 47.5, 83.5, 61]], 'court_grey'),
    G('cpa', 'West Car Park', [[39.5, 57.5, 53, 79]], 'asphalt'),
    G('cpb', 'East Car Park', [[88, 106.5, 100, 145.5]], 'asphalt'),
    G('shedyard', 'Shed Yard', [[87, 43, 99.5, 52]], 'gravel'),
    // paths and courtyards
    G('walkw', 'West Walk', [[33, 56, 39.5, 108]], 'paving'),
    G('quad', 'The Quad', [[53, 76, 87, 81], [37, 79, 53, 81]], 'paving'),
    G('courtpath', 'Court Path', [[54.5, 61, 87, 65]], 'paving'),
    G('eastpath', 'East Path', [[87, 56, 101, 108]], 'paving'),
    G('court', 'Courtyard', [[37, 89, 87, 96]], 'paving'),
    G('entry', 'Front Entrance', [[5, 89, 37, 91]], 'paving'),
    G('alley', 'Amenities Lane', [[22, 87, 37, 89]], 'paving'),
    G('southpath', 'Wing Path', [[37, 106, 88, 108]], 'paving'),
    // pergola (13): ground-level centre walk, raised dark side platforms, roof
    G('perg_m', 'Pergola', [[66.5, 81, 69.5, 89]], 'paving', { ceil: 2.75, ceilMat: 'timber' }),
    G('perg_w', 'Pergola Platform', [[64, 81, 66.5, 89]], 'rubber', { floor: 0.8, ceil: 2.75, riser: 'rubber', ceilMat: 'timber' }),
    G('perg_e', 'Pergola Platform', [[69.5, 81, 71.5, 89]], 'rubber', { floor: 0.8, ceil: 2.75, riser: 'rubber', ceilMat: 'timber' }),
    G('perg_roof', 'Pergola Roof', [[64, 81, 71.5, 89]], 'roof_metal', { floor: 2.95, riser: 'timber', roof: true, parapet: 0 })
  ];

  // ---------------------------------------------------------------- buildings
  // ext = façade material, roof = height of the roof surface.
  const brick = { plinth: 'brick_dark' };
  const buildings = [
    { id: 'n1', name: 'Lab Block North', rects: [[54.5, 65, 83, 76]], roof: 3.8, facade: brick },
    { id: 'sw', name: 'South Research Wing', rects: [[50, 96, 68, 106], [68, 97, 87, 105.5]], roof: 7.4, facade: { plinth: 'brick_dark', bands: [[3.2, 3.95, 'panel_green']] } },
    { id: 'tw', name: 'Stair Tower', rects: [[46, 96, 50, 106]], roof: 8.2, facade: { plinth: 'brick_dark', bands: [[3.2, 3.95, 'panel_green']] } },
    { id: 'ad', name: 'Administration', rects: [[41, 81, 64, 89]], roof: 3.8, facade: brick },
    { id: 'lib', name: 'Archive Library', rects: [[71.5, 80, 85, 93]], roof: 4.4, facade: brick },
    { id: 'gym', name: 'Test Hall', rects: [[19.5, 62, 33, 80.5]], roof: 6.6, facade: brick },
    { id: 'ws', name: 'Workshop', rects: [[6.5, 70, 19.5, 80.5]], roof: 4.0, facade: brick },
    { id: 'dc', name: 'Data Centre', rects: [[12, 80.5, 22, 89]], roof: 3.8, ext: 'render_cream', facade: { plinth: false } },
    { id: 'am', name: 'Amenities', rects: [[22, 80.5, 32, 87]], roof: 3.6, facade: brick },
    { id: 'cc', name: 'Conference Centre', rects: [[21, 91, 37, 104]], roof: 4.4, ext: 'cladding_white', parapet: 0.15, facade: { plinth: false, bands: [[0, 1.6, 'cladding_bluegrey', 0.02]] } },
    { id: 'shed', name: 'Groundskeeper Shed', rects: [[89, 45, 97.5, 50]], roof: 2.9, ext: 'roof_metal', roofMat: 'roof_metal', parapet: 0, facade: { plinth: false } }
  ];

  // ---------------------------------------------------------------- rooms
  const Rm = (id, bldg, name, rects, o) => Object.assign({ id, bldg, name, rects, floor: 0, ceil: 3.2, fmat: 'lino', wmat: 'lab_white', light: 'lab' }, o || {});
  const SW0 = { group: 'sw0' };
  const rooms = [
    // Lab Block North (1): corridor + 8 labs
    Rm('n1c', 'n1', 'Lab Block North', [[54.5, 69.5, 83, 71.5]], { light: 'corridor', fmat: 'lino' }),
    Rm('n1a', 'n1', 'Lab N1', [[54.5, 65, 62, 69.5]]), Rm('n1b', 'n1', 'Lab N2', [[62, 65, 69.5, 69.5]]),
    Rm('n1d', 'n1', 'Lab N3', [[69.5, 65, 76.5, 69.5]]), Rm('n1e', 'n1', 'Lab N4', [[76.5, 65, 83, 69.5]]),
    Rm('n1f', 'n1', 'Lab S1', [[54.5, 71.5, 61, 76]]), Rm('n1g', 'n1', 'Lab S2', [[61, 71.5, 68, 76]]),
    Rm('n1h', 'n1', 'Lab S3', [[68, 71.5, 75.5, 76]]), Rm('n1i', 'n1', 'Lab S4', [[75.5, 71.5, 83, 76]]),

    // South Research Wing (1 + 2), ground floor
    Rm('swc0', 'sw', 'Research Wing', [[50, 96, 68, 98.5], [68, 97, 83, 99.5]], Object.assign({ light: 'corridor' }, SW0)),
    Rm('swg1', 'sw', 'Lab G1', [[50, 98.5, 58.5, 106]]), Rm('swg2', 'sw', 'Lab G2', [[58.5, 98.5, 64, 106]]),
    Rm('swpl', 'sw', 'Plant Room', [[64, 98.5, 68, 106]], { fmat: 'concrete_floor', wmat: 'concrete_wall', light: 'tunnel' }),
    Rm('swg3', 'sw', 'Lab G3', [[68, 99.5, 75.5, 105.5]]), Rm('swg4', 'sw', 'Lab G4', [[75.5, 99.5, 83, 105.5]]),
    // east stairwell (atrium beside stair B) + its landing
    Rm('swe0', 'sw', 'East Stairs', [[85.5, 99.5, 87, 105.5], [83, 105, 85.5, 105.5]], Object.assign({ ceil: 6.8, light: 'stair' }, SW0)),
    Rm('swec', 'sw', 'Research Wing', [[83, 97, 87, 99.5]], Object.assign({ light: 'corridor' }, SW0)),
    Rm('swel', 'sw', 'East Landing', [[83, 97, 87, 99.5]], Object.assign({ floor: UP, ceil: 6.8, light: 'stair' }, SW0)),
    // upstairs
    Rm('swc1', 'sw', 'Research Wing Upstairs', [[50, 96, 68, 98.5], [68, 97, 83, 99.5]], { group: 'sw1', floor: UP, ceil: 6.8, light: 'corridor' }),
    Rm('swu1', 'sw', 'Lab U1', [[50, 98.5, 58.5, 106]], { floor: UP, ceil: 6.8 }),
    Rm('swu2', 'sw', 'Lab U2', [[58.5, 98.5, 64, 106]], { floor: UP, ceil: 6.8 }),
    Rm('swu3', 'sw', 'Seminar Room', [[64, 98.5, 68, 106]], { floor: UP, ceil: 6.8, fmat: 'carpet_grey', light: 'office' }),
    Rm('swu4', 'sw', 'Lab U4', [[68, 99.5, 75.5, 105.5]], { floor: UP, ceil: 6.8 }),
    Rm('swu5', 'sw', 'Observation Lab', [[75.5, 99.5, 83, 105.5]], { floor: UP, ceil: 6.8 }),
    // west stair tower (taller, glazed both floors): atrium + landing
    Rm('twl', 'tw', 'Stair Tower', [[46, 104, 50, 106], [48.5, 98.5, 50, 104]], Object.assign({ ceil: 7.6, wmat: 'lab_white', light: 'stair' }, SW0)),
    Rm('twg', 'tw', 'Stair Tower', [[46, 96, 50, 98.5]], Object.assign({ light: 'corridor' }, SW0)),
    Rm('twu', 'tw', 'Tower Landing', [[46, 96, 50, 98.5]], Object.assign({ floor: UP, ceil: 7.6, light: 'stair' }, SW0)),

    // Administration (5)
    Rm('adr', 'ad', 'Reception', [[41, 81, 48, 89]], { fmat: 'carpet_grey', light: 'office' }),
    Rm('adc', 'ad', 'Administration', [[48, 84, 64, 86]], { fmat: 'carpet_grey', light: 'corridor' }),
    Rm('ado1', 'ad', 'Office', [[48, 81, 53.5, 84]], { fmat: 'carpet_grey', light: 'office' }),
    Rm('ado2', 'ad', 'Office', [[53.5, 81, 59, 84]], { fmat: 'carpet_grey', light: 'office' }),
    Rm('ado3', 'ad', 'Director', [[59, 81, 64, 84]], { fmat: 'carpet_grey', light: 'office' }),
    Rm('ado4', 'ad', 'Office', [[48, 86, 53.5, 89]], { fmat: 'carpet_grey', light: 'office' }),
    Rm('ado5', 'ad', 'Meeting Room', [[53.5, 86, 59, 89]], { fmat: 'carpet_grey', light: 'office' }),
    Rm('ado6', 'ad', 'Records', [[59, 86, 64, 89]], { fmat: 'carpet_grey', light: 'office' }),

    // Archive Library (3)
    Rm('lib', 'lib', 'Archive Library', [[71.5, 80, 85, 88.5], [71.5, 88.5, 80.5, 93]], { ceil: 3.8, fmat: 'carpet_grey', wmat: 'lab_white', light: 'library' }),
    Rm('libs', 'lib', 'Archive Store', [[80.5, 88.5, 85, 93]], { ceil: 3.8, fmat: 'concrete_floor', light: 'office' }),

    // Test Hall (4), Workshop (7), Data Centre (8), Amenities (9)
    Rm('gym', 'gym', 'Test Hall', [[19.5, 62, 33, 80.5]], { ceil: 6.0, fmat: 'timber_floor', wmat: 'brick_tan', light: 'gym' }),
    Rm('ws', 'ws', 'Workshop', [[6.5, 70, 19.5, 80.5]], { ceil: 3.4, fmat: 'concrete_floor', wmat: 'concrete_wall', light: 'corridor' }),
    Rm('dc', 'dc', 'Data Centre', [[12, 80.5, 22, 89]], { fmat: 'lino', wmat: 'lab_white', light: 'lab' }),
    Rm('am', 'am', 'Amenities', [[22, 80.5, 32, 87]], { ceil: 3.0, fmat: 'tiles_floor', wmat: 'tiles_wall', light: 'wash' }),

    // Conference Centre (6): hall with a stage at the east end
    Rm('cc', 'cc', 'Conference Centre', [[21, 91, 37, 104]], { ceil: 4.0, fmat: 'carpet_grey', wmat: 'lab_white', light: 'hall' }),
    Rm('ccs', 'cc', 'Stage', [[33, 92, 37, 103]], { group: 'cc', floor: 0.8, ceil: 4.0, fmat: 'timber_floor', riser: 'timber', light: 'hall' }),

    // Groundskeeper shed
    Rm('shed', 'shed', 'Groundskeeper Shed', [[89, 45, 97.5, 50]], { ceil: 2.5, fmat: 'concrete_floor', wmat: 'roof_metal', light: 'shed' })
  ];

  // ---------------------------------------------------------------- stairs
  const stairs = [
    { id: 'stA', bldg: 'tw', group: 'sw0', rect: [46, 98.5, 48.5, 104], up: 'N', y0: 0, y1: UP, ceil: 7.6, name: 'Stair Tower', wmat: 'lab_white' },
    { id: 'stB', bldg: 'sw', group: 'sw0', rect: [83, 99.5, 85.5, 105], up: 'N', y0: 0, y1: UP, ceil: 6.8, name: 'East Stairs', wmat: 'lab_white' },
    { id: 'ccst', bldg: 'cc', group: 'cc', rect: [31.5, 96.5, 33, 98.5], up: 'E', y0: 0, y1: 0.8, ceil: 4.0, name: 'Stage Steps', riser: 'timber', fmat: 'timber_floor' },
    // pergola platform steps
    { id: 'pgs1', group: 'out', outdoor: true, rect: [64, 81, 66.5, 82], up: 'S', y0: 0, y1: 0.8, ceil: 2.75, ceilMat: 'timber', riser: 'rubber', name: 'Pergola' },
    { id: 'pgs2', group: 'out', outdoor: true, rect: [64, 88, 66.5, 89], up: 'N', y0: 0, y1: 0.8, ceil: 2.75, ceilMat: 'timber', riser: 'rubber', name: 'Pergola' },
    { id: 'pgs3', group: 'out', outdoor: true, rect: [69.5, 81, 71.5, 82], up: 'S', y0: 0, y1: 0.8, ceil: 2.75, ceilMat: 'timber', riser: 'rubber', name: 'Pergola' },
    { id: 'pgs4', group: 'out', outdoor: true, rect: [69.5, 88, 71.5, 89], up: 'N', y0: 0, y1: 0.8, ceil: 2.75, ceilMat: 'timber', riser: 'rubber', name: 'Pergola' }
  ];

  // ---------------------------------------------------------------- doors
  // r covers the two cells either side of the wall; y = floor of the doorway.
  const D = (x0, z0, x1, z1, o) => Object.assign({ r: [x0, z0, x1, z1] }, o || {});
  const doors = [
    // Lab Block North
    D(54, 70, 55, 71.5), D(82.5, 70, 83.5, 71.5),
    D(57, 69, 58.5, 70), D(65, 69, 66.5, 70), D(72.5, 69, 74, 70), D(79, 69, 80.5, 70),
    D(57.5, 71, 59, 72), D(64, 71, 65.5, 72), D(71, 71, 72.5, 72), D(78.5, 71, 80, 72),
    D(64.5, 75.5, 66, 76.5), D(72.5, 64.5, 74, 65.5),
    // South wing, ground
    D(55, 95.5, 56.5, 96.5), D(75, 96.5, 76.5, 97.5),
    D(53.5, 98, 55, 99), D(60.5, 98, 62, 99), D(65.5, 98, 67, 99), D(71, 99, 72.5, 100), D(78.5, 99, 80, 100),
    D(86.5, 101, 87.5, 102.5),                                   // east stairwell -> East Path
    D(46.5, 105.5, 48, 106.5),                                   // tower -> South Field
    // South wing, upstairs
    D(53.5, 98, 55, 99, { y: UP }), D(60.5, 98, 62, 99, { y: UP }), D(65.5, 98, 67, 99, { y: UP }),
    D(71, 99, 72.5, 100, { y: UP }), D(78.5, 99, 80, 100, { y: UP }),
    D(49.5, 96, 50.5, 98.5, { y: UP, full: true }),             // tower landing <-> upstairs corridor
    D(82.5, 97, 83.5, 99.5, { y: UP, full: true }),             // east landing <-> upstairs corridor
    // Administration
    D(40.5, 84, 41.5, 86), D(43, 80.5, 45, 81.5), D(47.5, 84, 48.5, 86),
    D(50, 83.5, 51.5, 84.5), D(55.5, 83.5, 57, 84.5), D(61, 83.5, 62.5, 84.5),
    D(50, 85.5, 51.5, 86.5), D(55.5, 85.5, 57, 86.5), D(61, 85.5, 62.5, 86.5),
    D(63.5, 84, 64.5, 86, { y: 0.8, h: 1.9 }),                  // corridor end -> pergola platform (a step up)
    // Library
    D(71, 90.5, 72, 92), D(76, 79.5, 78, 80.5), D(84.5, 84, 85.5, 86), D(80, 90, 81, 91.5),
    // Test Hall, Workshop, Data Centre, Amenities
    D(25, 61.5, 27.5, 62.5), D(32.5, 70, 33.5, 72), D(19, 74, 20, 75.5), D(27.5, 80, 29, 81),
    D(10, 69.5, 13.5, 70.5),
    D(17, 88.5, 18.5, 89.5), D(21.5, 83, 22.5, 84.5),
    D(28, 86.5, 29.5, 87.5),
    // Conference Centre
    D(24, 90.5, 26, 91.5), D(28.5, 90.5, 30, 91.5), D(20.5, 95, 21.5, 97), D(26, 103.5, 28, 104.5),
    // Shed
    D(92, 49.5, 95, 50.5)
  ];
  // (doorways are at least 1.5 m wide so the AI cats can path through them)

  // ---------------------------------------------------------------- windows
  // y = floor of the storey; sill/top measured from it.
  const Wn = (x0, z0, x1, z1, y, sill, top, o) => Object.assign({ r: [x0, z0, x1, z1], y, sill, top }, o || {});
  const windows = [
    // Lab Block North: north and south façades
    Wn(55.5, 64.5, 61, 65.5, 0, 0.9, 2.3), Wn(63, 64.5, 68.5, 65.5, 0, 0.9, 2.3), Wn(70, 64.5, 72, 65.5, 0, 0.9, 2.3),
    Wn(74, 64.5, 76, 65.5, 0, 0.9, 2.3), Wn(77.5, 64.5, 82, 65.5, 0, 0.9, 2.3),
    Wn(55.5, 75.5, 60, 76.5, 0, 0.9, 2.3), Wn(62, 75.5, 64, 76.5, 0, 0.9, 2.3), Wn(66, 75.5, 67.5, 76.5, 0, 0.9, 2.3),
    Wn(69, 75.5, 74.5, 76.5, 0, 0.9, 2.3), Wn(76.5, 75.5, 82, 76.5, 0, 0.9, 2.3),
    // South wing: south façade, two ground groups with brick between, continuous upstairs ribbon
    Wn(50.5, 105.5, 63.5, 106.5, 0, 0.9, 2.4, { mullion: 1.2 }), Wn(68.5, 105, 82.5, 106, 0, 0.9, 2.4, { mullion: 1.2 }),
    Wn(50.5, 105.5, 67.5, 106.5, UP, 0.8, 2.4, { mullion: 1.2 }), Wn(68.5, 105, 82.5, 106, UP, 0.8, 2.4, { mullion: 1.2 }),
    // South wing: north façade (corridors)
    Wn(51, 95.5, 54.5, 96.5, 0, 0.9, 2.4), Wn(57.5, 95.5, 67, 96.5, 0, 0.9, 2.4), Wn(69, 96.5, 74.5, 97.5, 0, 0.9, 2.4), Wn(77.5, 96.5, 82.5, 97.5, 0, 0.9, 2.4),
    Wn(50.5, 95.5, 67.5, 96.5, UP, 0.9, 2.4), Wn(68.5, 96.5, 82.5, 97.5, UP, 0.9, 2.4),
    // stair tower: glazed on both floors (south), east stairwell glazing
    Wn(48, 105.5, 49.5, 106.5, 0, 0.3, 2.6), Wn(46.5, 105.5, 49.5, 106.5, 3.6, 0.4, 3.4),
    Wn(86.5, 103, 87.5, 105, 0, 1.0, 5.6),
    // Administration
    Wn(48.5, 80.5, 53, 81.5, 0, 0.9, 2.3), Wn(54, 80.5, 58.5, 81.5, 0, 0.9, 2.3), Wn(59.5, 80.5, 63.5, 81.5, 0, 0.9, 2.3), Wn(45.5, 80.5, 47.5, 81.5, 0, 0.9, 2.3),
    Wn(48.5, 88.5, 53, 89.5, 0, 0.9, 2.3), Wn(54, 88.5, 58.5, 89.5, 0, 0.9, 2.3), Wn(59.5, 88.5, 63.5, 89.5, 0, 0.9, 2.3), Wn(41.5, 88.5, 47.5, 89.5, 0, 0.9, 2.3),
    // Library
    Wn(72.5, 79.5, 75.5, 80.5, 0, 0.9, 2.8), Wn(78.5, 79.5, 84, 80.5, 0, 0.9, 2.8), Wn(84.5, 81, 85.5, 83.5, 0, 0.9, 2.8),
    Wn(72, 92.5, 79.5, 93.5, 0, 0.9, 2.8), Wn(71, 81.5, 72, 88, 0.8, 0.6, 1.8),
    // Test Hall clerestory, Workshop, Data Centre glazing under the canopy, Conference Centre small low windows
    Wn(32.5, 63, 33.5, 69, 0, 3.6, 5.4), Wn(32.5, 73, 33.5, 79, 0, 3.6, 5.4), Wn(19, 62.5, 20, 69.5, 0, 3.6, 5.4),
    Wn(14, 69.5, 18.5, 70.5, 0, 1.0, 2.6), Wn(6, 72, 7, 78, 0, 1.0, 2.6),
    Wn(12.5, 88.5, 16.5, 89.5, 0, 0.3, 2.5),
    Wn(22, 103.5, 23, 104.5, 0, 0.3, 1.5), Wn(24.5, 103.5, 25.5, 104.5, 0, 0.3, 1.5), Wn(30.5, 103.5, 31.5, 104.5, 0, 0.3, 1.5)
  ];

  // ---------------------------------------------------------------- props
  const props = [];
  const P = (o) => props.push(o);
  // boundary fences (west gate by the entrance sign), court fences
  P({ t: 'fence', a: [5, 1], b: [5, 159], h: 2.1, gates: [[88, 90]] });
  P({ t: 'fence', a: [5, 1], b: [124.5, 1], h: 2.1 });
  P({ t: 'fence', a: [124.5, 1], b: [124.5, 159], h: 2.1 });
  P({ t: 'fence', a: [5, 159], b: [124.5, 159], h: 2.1 });
  P({ t: 'fence', a: [54.5, 34], b: [83.5, 34], h: 3.6, gates: [[13.5, 15.5]] });
  P({ t: 'fence', a: [54.5, 47.5], b: [83.5, 47.5], h: 3.6, gates: [[2, 4], [25, 27]] });
  P({ t: 'fence', a: [54.5, 34], b: [54.5, 47.5], h: 3.6, gates: [[6, 8]] });
  P({ t: 'fence', a: [83.5, 34], b: [83.5, 47.5], h: 3.6, gates: [[6, 8]] });
  P({ t: 'fence', a: [5, 104], b: [21, 104], h: 2.1, gates: [[6, 8]] });   // mesh fence at the west end of the Conference Centre
  // court gear + markings
  P({ t: 'tennis_net', r: [68.9, 35.5, 69.1, 46] });
  P({ t: 'hoop', x: 55.6, z: 54.25, facing: 'E' }); P({ t: 'hoop', x: 82.4, z: 54.25, facing: 'W' });
  P({ t: 'lines', kind: 'tennis', r: [57.1, 35.25, 80.9, 46.25] });
  P({ t: 'lines', kind: 'basketball', r: [55.5, 48.25, 82.5, 60.25] });
  P({ t: 'lines', kind: 'bays', r: [39.5, 57.5, 44, 79], axis: 'z', every: 2.6 });
  P({ t: 'lines', kind: 'bays', r: [48.5, 57.5, 53, 79], axis: 'z', every: 2.6 });
  P({ t: 'lines', kind: 'bays', r: [88, 106.5, 92.5, 145.5], axis: 'z', every: 2.6 });
  P({ t: 'lines', kind: 'bays', r: [95.5, 106.5, 100, 145.5], axis: 'z', every: 2.6 });
  // soccer goals
  P({ t: 'goal', x: 8.5, z: 18, facing: 'E' }); P({ t: 'goal', x: 71.5, z: 18, facing: 'W' });
  P({ t: 'goal', x: 8.5, z: 135, facing: 'E' }); P({ t: 'goal', x: 79, z: 135, facing: 'W' });
  // gum trees: west boundary (as on the plan), by the south wing, scattered in the fields
  for (const z of [14, 29, 44, 59, 97.5, 111.5, 126.5, 141.5, 154]) P({ t: 'gum_tree', x: 8, z, h: 13 + (z % 5) });
  P({ t: 'gum_tree', x: 55.5, z: 108.8, h: 15 }); P({ t: 'gum_tree', x: 81, z: 108.8, h: 16 });
  P({ t: 'gum_tree', x: 38, z: 30, h: 14 }); P({ t: 'gum_tree', x: 24, z: 46, h: 12 }); P({ t: 'gum_tree', x: 90, z: 20, h: 15 });
  P({ t: 'gum_tree', x: 110, z: 40, h: 13 }); P({ t: 'gum_tree', x: 32, z: 128, h: 14 }); P({ t: 'gum_tree', x: 60, z: 146, h: 13 });
  P({ t: 'gum_tree', x: 110, z: 140, h: 15 }); P({ t: 'gum_tree', x: 98, z: 155, h: 12 });
  P({ t: 'small_tree', x: 9.5, z: 93.5, h: 5 });
  // vineyard rows (east-west) and orchard grid
  for (let z = 65.5; z < 101; z += 2.5) P({ t: 'vine_row', r: [102.5, z - 0.25, 121, z + 0.25] });
  for (let x = 103; x < 122; x += 3.5) for (let z = 105; z < 123; z += 3.5) P({ t: 'orchard_tree', x, z });
  // cars (west car park: two rows facing the aisle; east car park likewise)
  const carsW = [[41.8, 59.5, 1], [41.8, 62.1, 1], [41.8, 67.3, 1], [41.8, 72.5, 1], [41.8, 75.1, 1], [50.8, 60.8, 3], [50.8, 66, 3], [50.8, 68.6, 3], [50.8, 73.8, 3]];
  for (const [x, z, q] of carsW) P({ t: 'car', x, z, rot: q * Math.PI / 2 });
  const carsE = [[90.2, 108.5, 1], [90.2, 113.7, 1], [90.2, 116.3, 1], [90.2, 124.1, 1], [90.2, 131.9, 1], [90.2, 137.1, 1], [97.8, 109.8, 3], [97.8, 117.6, 3], [97.8, 120.2, 3], [97.8, 128, 3], [97.8, 135.8, 3], [97.8, 141, 3]];
  for (const [x, z, q] of carsE) P({ t: 'car', x, z, rot: q * Math.PI / 2 });
  // campus furniture
  P({ t: 'sign', x: 7.5, z: 93, facing: 'W' });
  P({ t: 'street_light', x: 36.2, z: 64, facing: 'E' }); P({ t: 'street_light', x: 36.2, z: 98, facing: 'E' });
  P({ t: 'street_light', x: 94, z: 112, facing: 'E' }); P({ t: 'street_light', x: 94, z: 132, facing: 'E' });
  P({ t: 'weather_station', x: 30, z: 12 });
  P({ t: 'bench', x: 45, z: 92.5, rot: 0 }); P({ t: 'bench', x: 60, z: 92.5, rot: 0 }); P({ t: 'bench', x: 63, z: 78.5, rot: 0 });
  P({ t: 'picnic_table', x: 41, z: 102 }); P({ t: 'picnic_table', x: 90, z: 92 }); P({ t: 'picnic_table', x: 92, z: 70, rot: Math.PI / 2 });
  P({ t: 'planter', r: [50, 91.5, 56, 92.5] }); P({ t: 'planter', r: [62, 91.5, 68, 92.5] }); P({ t: 'planter', r: [76, 94, 82, 95] });
  P({ t: 'bin', x: 46, z: 79.8 }); P({ t: 'bin', x: 87.6, z: 64 }); P({ t: 'bin', x: 36, z: 88 }); P({ t: 'bin', x: 70.5, z: 92 });
  P({ t: 'bike_rack', x: 38, z: 84, rot: Math.PI / 2 });
  P({ t: 'canopy', r: [12, 89, 17, 90.6], y: 2.7 });
  P({ t: 'posts', a: [22, 104.9], b: [36, 104.9], n: 8, h: 3.4 });
  P({ t: 'barrel_vault', r: [21, 91, 25.5, 104], y0: 4.4, rise: 1.6, axis: 'z' });
  P({ t: 'pergola_frame', r: [64, 81, 71.5, 89], y: 2.75, axis: 'z' });

  // ---- interiors
  const isl = (r, y) => P({ t: 'lab_island', r, y: y || 0 });
  // Lab Block North
  isl([56.5, 66.6, 60, 67.6]); isl([64, 66.6, 67.5, 67.6]); isl([71.5, 66.6, 74.5, 67.6]); isl([78.5, 66.6, 81.5, 67.6]);
  isl([56.5, 73.4, 59.5, 74.4]); isl([63, 73.4, 66, 74.4]); isl([70, 73.4, 73.5, 74.4]); isl([77.5, 73.4, 81, 74.4]);
  P({ t: 'fume_hood', x: 55.5, z: 66, facing: 'E' }); P({ t: 'fume_hood', x: 82, z: 75, facing: 'W' });
  P({ t: 'desk', r: [61.6, 65.3, 62, 68.6] }); P({ t: 'desk', r: [68.3, 72.4, 69, 75.6] });
  // South wing ground labs
  isl([52, 101.5, 56.5, 102.5]); isl([60, 101.5, 62.5, 102.5]); isl([70, 101.5, 73.5, 102.5]); isl([77.5, 101.5, 81, 102.5]);
  P({ t: 'fume_hood', x: 51, z: 104.8, facing: 'N' }); P({ t: 'fume_hood', x: 82, z: 104.4, facing: 'N' });
  P({ t: 'machine', r: [64.4, 100, 67.6, 102.5], big: true }); P({ t: 'crates', x: 65.5, z: 104.6, n: 2 }); P({ t: 'pipes', r: [64, 98.5, 68, 106], axis: 'z' });
  // upstairs
  isl([52, 101.5, 56.5, 102.5], UP); isl([60, 101.5, 62.5, 102.5], UP); isl([70, 101.5, 73.5, 102.5], UP);
  P({ t: 'meeting_table', r: [64.6, 100.5, 67.4, 103.5], y: UP }); P({ t: 'whiteboard', x: 66, z: 99.2, facing: 'S', y: UP });
  P({ t: 'desk', r: [76.5, 104.4, 82.5, 105.2], y: UP }); P({ t: 'whiteboard', x: 79, z: 101, facing: 'S', y: UP });
  P({ t: 'fume_hood', x: 51, z: 104.8, facing: 'N', y: UP });
  P({ t: 'vending', x: 51.5, z: 96.5, facing: 'S', y: UP }); P({ t: 'sofa', x: 60, z: 97.4, rot: 0, y: UP });
  // Administration
  P({ t: 'reception_desk', r: [43, 83.5, 46.5, 84.5] }); P({ t: 'sofa', x: 44, z: 88, rot: Math.PI }); P({ t: 'vending', x: 41.6, z: 82, facing: 'E' });
  P({ t: 'desk', r: [49, 81.3, 52.5, 82.2] }); P({ t: 'desk', r: [54.5, 81.3, 58, 82.2] }); P({ t: 'desk', r: [60, 81.3, 63, 82.2] });
  P({ t: 'cabinet', r: [52.6, 82.6, 53.4, 83.6] }); P({ t: 'printer', x: 49, z: 88.2 }); P({ t: 'desk', r: [49.5, 87.8, 52.5, 88.7] });
  P({ t: 'meeting_table', r: [54.6, 86.9, 58, 88.1] }); P({ t: 'shelf', r: [59.2, 88.4, 63.8, 89] }); P({ t: 'cabinet', r: [59.2, 86.2, 60.2, 87.2] });
  // Archive Library: shelving rows with aisles, reading tables
  for (const z of [81.5, 83.5, 85.5]) P({ t: 'bookshelf', r: [73, z, 79, z + 0.6] });
  for (const z of [81.5, 83.5]) P({ t: 'bookshelf', r: [80.5, z, 84, z + 0.6] });
  P({ t: 'meeting_table', r: [73, 89.5, 76, 91] }); P({ t: 'meeting_table', r: [77, 89.5, 79.5, 91] });
  P({ t: 'sofa', x: 82.5, z: 87.4, rot: Math.PI });
  P({ t: 'shelf', r: [81, 89, 81.7, 92.6] }); P({ t: 'shelf', r: [84.2, 89, 84.9, 92.6] }); P({ t: 'crates', x: 82.8, z: 92.2, n: 2 });
  // Test Hall
  P({ t: 'bleachers', r: [30, 64, 33, 78], facing: 'W' });
  P({ t: 'hoop', x: 26.25, z: 62.6, facing: 'S' }); P({ t: 'hoop', x: 26.25, z: 79.9, facing: 'N' });
  P({ t: 'gym_mats', r: [20.2, 63, 22.6, 65] }); P({ t: 'gym_mats', r: [20.2, 77, 23, 79.5] });
  // Workshop
  P({ t: 'workbench', r: [7.2, 72, 8.4, 77] }); P({ t: 'workbench', r: [11, 75.5, 15, 76.7] }); P({ t: 'lathe', x: 16.5, z: 72.5, rot: 0 });
  P({ t: 'timber_rack', r: [7, 79.2, 13, 80.2] }); P({ t: 'machine', r: [15.5, 77.5, 18.5, 79.6] });
  // Data Centre: rows of racks with aisles
  for (const z of [82.5, 85, 87.2]) P({ t: 'server_rack', r: [13.5, z, 20.5, z + 0.8] });
  // Amenities
  P({ t: 'stalls', side: 'top', z0: 80.5, z1: 83, xs: [22, 24.4, 26.8, 29.2, 31.6] });
  P({ t: 'sinks', r: [24, 85.4, 29, 86.8] });
  // Conference Centre
  P({ t: 'chair_rows', r: [23.5, 92.5, 30.5, 102.5], facing: 'E' }); P({ t: 'piano', x: 35, z: 100.5, rot: Math.PI / 2, y: 0.8 });
  P({ t: 'whiteboard', x: 34, z: 94, facing: 'W', y: 0.8 });
  // Shed
  P({ t: 'crates', x: 90.5, z: 46.2, n: 3 }); P({ t: 'pallets', x: 95.5, z: 46.5 }); P({ t: 'barrels', x: 96.6, z: 48.6, n: 2 });

  // ---------------------------------------------------------------- pickups
  const pickups = [
    { t: 'sniper', x: 66, z: 104.6, y: UP },          // Seminar Room upstairs: the south-field window
    { t: 'rifle', x: 79.5, z: 87 }, { t: 'rifle', x: 93, z: 47.5 },
    { t: 'smg', x: 44.5, z: 86.5 }, { t: 'smg', x: 10, z: 74 },
    { t: 'shotgun', x: 17, z: 84 }, { t: 'shotgun', x: 26, z: 70 },
    { t: 'launcher', x: 68, z: 85 },
    { t: 'armor', x: 64, z: 41 }, { t: 'armor', x: 48, z: 97.2, y: UP }, { t: 'armor', x: 111.5, z: 84.25 },
    { t: 'health', x: 69, z: 70.5 }, { t: 'health', x: 61, z: 97.2, y: UP }, { t: 'health', x: 27, z: 84 },
    { t: 'health', x: 40, z: 135 }, { t: 'health', x: 94, z: 125 }, { t: 'health', x: 30, z: 25 },
    { t: 'health', x: 112, z: 113.5 }, { t: 'health', x: 35, z: 96 },
    { t: 'ammo', x: 46.25, z: 68 }, { t: 'ammo', x: 75, z: 97.2 }, { t: 'ammo', x: 75, z: 98.2, y: UP }, { t: 'ammo', x: 69, z: 54 },
    { t: 'ammo', x: 15, z: 22 }, { t: 'ammo', x: 60, z: 130 }, { t: 'ammo', x: 94, z: 80 }, { t: 'ammo', x: 31.2, z: 100 },
    { t: 'ammo', x: 112, z: 66.75 },
    { t: 'nades', x: 64.5, z: 93.5 }, { t: 'nades', x: 86.25, z: 102.5 }, { t: 'nades', x: 36, z: 75 },
    { t: 'nades', x: 76, z: 63 }, { t: 'nades', x: 20, z: 140 }, { t: 'nades', x: 93, z: 31 }
  ];

  // ---------------------------------------------------------------- spawns [x, z, yaw, y]
  // yaw 0 faces north (-z), PI/2 faces west.
  const spawns = [
    [10, 10, 2.4], [40, 8, 3.14], [66, 8, 3.14], [100, 10, 3.14], [118, 30, 1.57], [96, 38, 3.14],
    [64, 40.75, 1.57], [58, 54, -1.57], [80, 54, 1.57], [46.25, 70, 3.14], [36, 60, 3.14],
    [69, 70.5, 1.57], [26, 66, 3.14], [12.5, 75, -1.57], [17, 86, 0], [27, 84, 3.14],
    [44.5, 86.5, -1.57], [68, 85, 0], [78, 83, 3.14], [57, 93.5, 1.57], [31.2, 94, -1.57], [35, 96, 1.57],
    [48, 105, 3.14], [54, 104, 0], [79, 104, 0], [93, 100, 1.57], [111.5, 79.25, 1.57], [111.5, 113.5, 1.57],
    [94, 120, 0], [70, 130, 0], [40, 145, 0], [15, 120, -1.57], [10, 150, -0.8], [110, 152, 0.8],
    [54, 104.5, 0, UP], [76, 98.2, 1.57, UP], [65, 99.3, 3.14, UP]
  ];

  // ---------------------------------------------------------------- scenery
  const backdrop = {
    road: { x0: -4, x1: 3.5, z0: -60, z1: 225 },
    footpath: { x0: 3.5, x1: 5, z0: -60, z1: 225 },
    streetLights: [[4.2, 12], [4.2, 46], [4.2, 80], [4.2, 114], [4.2, 148]],
    houses: [{ x0: 58, z0: 163, x1: 70, z1: 176 }, { x0: 72, z0: 163, x1: 84, z1: 176 }, { x0: 88, z0: 163, x1: 99, z1: 176 }, { x0: 101, z0: 163, x1: 113, z1: 176 },
      { x0: 40, z0: 165, x1: 52, z1: 177 }, { x0: 115, z0: 164, x1: 126, z1: 176 }]
  };

  // camera fly-throughs behind the menu: from, to, look-at
  const menuShots = [
    { a: [60, 1.7, 112], b: [76, 1.7, 112], look: [66, 4, 100] },
    { a: [52, 2.0, 92], b: [68, 2.0, 93], look: [68, 1.5, 84] },
    { a: [30, 9, 40], b: [50, 9, 44], look: [69, 0, 54] },
    { a: [104, 1.6, 58], b: [104, 1.6, 74], look: [115, 1, 80] },
    { a: [20, 1.6, 90], b: [33, 1.6, 90], look: [40, 2, 90] },
    { a: [57, 5.4, 104.5], b: [64, 5.4, 104.5], look: [60, 2, 130] }
  ];

  // Painted lines (tennis, basketball, parking bays) as thin strips on the ground.
  JB.Props.addMaterials({ 'p:paint_white': { params: { color: 0xf2f2ee, roughness: 0.7 } } });
  JB.Props.register('lines', (p, ctx) => {
    const Pa = ctx.P, [x0, z0, x1, z1] = p.r;
    const f = Pa.floorAt((x0 + x1) / 2, (z0 + z1) / 2), g = Pa.groupAt((x0 + x1) / 2, (z0 + z1) / 2), y = f + 0.004, w = 0.05;
    const seg = (ax, az, bx, bz) => {
      const minx = Math.min(ax, bx) - w / 2, maxx = Math.max(ax, bx) + w / 2, minz = Math.min(az, bz) - w / 2, maxz = Math.max(az, bz) + w / 2;
      Pa.boxGeo('p:paint_white', minx, f, minz, maxx, y, maxz, g, 't', 1);
    };
    const rect = (a, b, c, d) => { seg(a, b, c, b); seg(a, d, c, d); seg(a, b, a, d); seg(c, b, c, d); };
    const arc = (cx, cz, r, a0, a1, n) => { for (let k = 0; k < n; k++) { const t0 = a0 + (a1 - a0) * k / n, t1 = a0 + (a1 - a0) * (k + 1) / n; const ax = cx + Math.cos(t0) * r, az = cz + Math.sin(t0) * r, bx = cx + Math.cos(t1) * r, bz = cz + Math.sin(t1) * r; Pa.quad('p:paint_white', [ax - w / 2, y, az], [bx - w / 2, y, bz], [bx + w / 2, y, bz], [ax + w / 2, y, az], [0, 1, 0], Pa.uvXZ, g, null, 4); } };
    if (p.kind === 'tennis') {
      rect(x0, z0, x1, z1);
      const s = 1.37, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      seg(x0, z0 + s, x1, z0 + s); seg(x0, z1 - s, x1, z1 - s);
      seg(mx - 6.4, z0 + s, mx - 6.4, z1 - s); seg(mx + 6.4, z0 + s, mx + 6.4, z1 - s);
      seg(mx - 6.4, mz, mx + 6.4, mz); seg(x0, mz, x0 + 0.15, mz); seg(x1 - 0.15, mz, x1, mz);
    } else if (p.kind === 'basketball') {
      rect(x0, z0, x1, z1);
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      seg(mx, z0, mx, z1);
      arc(mx, mz, 1.8, 0, Math.PI * 2, 24);
      for (const [ex, dir] of [[x0, 1], [x1, -1]]) {
        rect(Math.min(ex, ex + dir * 5.8), mz - 2.45, Math.max(ex, ex + dir * 5.8), mz + 2.45);
        arc(ex + dir * 5.8, mz, 1.8, -Math.PI / 2, Math.PI / 2, 12);
        arc(ex + dir * 1.575, mz, 6.75, dir > 0 ? -1.35 : Math.PI - 1.35 + 0, dir > 0 ? 1.35 : Math.PI + 1.35, 20);
      }
    } else if (p.kind === 'bays') {
      const along = p.axis || 'z', every = p.every || 2.6;
      if (along === 'z') { for (let z = z0; z <= z1 + 1e-6; z += every) seg(x0, z, x1, z); }
      else { for (let x = x0; x <= x1 + 1e-6; x += every) seg(x, z0, x, z1); }
    }
  });

  JB.MapCampus = {
    grid: { x0: -1, z0: -1, x1: 127, z1: 167 },
    bounds: { x0: -1, z0: -1, x1: 127, z1: 167 },
    sunDir: [0.38, -0.9, 0.45],
    UP, ground, buildings, rooms, stairs, doors, windows, props, pickups, spawns, backdrop, menuShots
  };
  void SL;
})();
