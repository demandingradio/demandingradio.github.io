// Jimbog — the Facility map, traced from the owner's GoldenEye-style plan.
//
// Units are metres. x runs east, z runs south (z = image-y / 10 on the plan),
// y is height. Everything snaps to a 0.5 m grid when the level is built.
//
//   Upper floor  (y = 0)    : Offices, Mid corridor + labs, Keycard lab
//   Lower floor  (y = -4.5) : Washroom, Air Duct (-3), Bottling Hall,
//                             Lower labs, Barrel Room (platforms at -2.5)
//
// Plan connection points, rebuilt as real stairways:
//   A  Air Duct  <-> Washroom          (stairs B2 + crawl passage)
//   B  Offices   <-> Washroom          (stairwell + service tunnel)
//   C  Offices   <-> Washroom          (stairwell)
//   D  Lab (SE)  <-> Barrel Room       (long stair down)
//   E  Lab (NE)  <-> Barrel Room       (stair down to the NW platform)
//   Finish room <-> Keycard lab         (short stair) and the Hall balcony
(function () {
  'use strict';
  const JB = window.JB = window.JB || {};

  const UP = 0, LO = -4.5;

  // ---------------------------------------------------------------- regions
  // Each region: id, group (no walls inside a group), rects, floor, ceil,
  // floor/wall material, light preset, optional skylight rects.
  const R = (id, group, rects, floor, ceil, fmat, wmat, light, extra) =>
    Object.assign({ id, group, rects, floor, ceil, fmat, wmat, light }, extra || {});

  const regions = [
    // ---------------- OFFICES (upper, top-left) ----------------
    R('tl_n', 'tl_n', [[0, 0.5, 22, 4.5]], UP, 3.8, 'concrete_floor', 'concrete_wall', 'office', { name: 'North Offices', sky: [[3, 1.5, 9, 3.5], [12, 1.5, 18, 3.5]] }),
    R('tl_bw', 'tl_bw', [[0, 4.5, 4, 14.5], [4, 8.5, 13, 12]], UP, 3.8, 'concrete_floor', 'concrete_wall', 'office', { name: 'Records' }),
    R('tl_e', 'tl_main', [[13, 8.5, 17.5, 12], [17.5, 4.5, 22, 24.5]], UP, 3.8, 'concrete_floor', 'concrete_wall', 'office', { name: 'East Corridor' }),
    R('tl_sw', 'tl_main', [[0, 14.5, 4, 19.5], [4, 16.5, 7.5, 24.5], [3.5, 19.5, 7.5, 35], [7.5, 24.5, 20.5, 35], [17.5, 24.5, 29.5, 31.5]], UP, 4.2, 'concrete_floor', 'concrete_wall', 'office', { name: 'Office Floor', sky: [[10, 32, 14, 34], [21, 26, 27, 30]] }),
    R('tl_lab', 'tl_lab', [[7.5, 16.5, 17.5, 24.5]], UP, 3.6, 'concrete_floor', 'lab_white', 'lab', { name: 'Lab B' }),
    R('tl_1f', 'tl_1f', [[22, 12, 29.5, 16.5]], UP, 3.6, 'concrete_floor', 'lab_white', 'lab', { name: '1st Floor Lab' }),
    R('tl_lab2', 'tl_lab2', [[23.5, 16.5, 29.5, 24.5]], UP, 3.6, 'concrete_floor', 'lab_white', 'lab', { name: 'Observation Lab' }),
    R('tl_bot', 'tl_bot', [[20.5, 31.5, 29.5, 40]], UP, 3.8, 'concrete_floor', 'concrete_wall', 'office', { name: 'Stair Lobby' }),

    // ---------------- MID SECTION (upper) ----------------
    R('r2', 'r2', [[29.5, 12, 61.5, 16.5]], UP, 4.6, 'concrete_floor', 'metal_panel', 'office', { name: 'Long Store', sky: [[34, 13, 39, 15.5], [47, 13, 52, 15.5]] }),
    R('c1a', 'c1a', [[29.5, 16.5, 41.5, 21]], UP, 3.4, 'concrete_floor', 'concrete_wall', 'corridor', { name: 'Main Corridor' }),
    R('c1b', 'c1b', [[41.5, 16.5, 61.5, 21]], UP, 3.4, 'concrete_floor', 'concrete_wall', 'corridor', { name: 'Main Corridor' }),
    R('c1c', 'c1c', [[61.5, 16.5, 65, 21]], UP, 3.4, 'concrete_floor', 'concrete_wall', 'corridor', { name: 'Airlock' }),
    R('r3', 'r3', [[41.5, 21, 61.5, 26]], UP, 3.6, 'concrete_floor', 'lab_white', 'lab', { name: 'Science Lab' }),

    // ---------------- KEYCARD LAB (upper) ----------------
    R('lab_w', 'lab_w', [[65, 12, 77.5, 16.5], [65, 16.5, 71, 21], [65, 21, 77.5, 26]], UP, 4.0, 'concrete_floor', 'lab_white', 'lab', { name: 'Keycard Lab' }),
    R('lab_k', 'lab_k', [[71, 16.5, 77.5, 21]], UP, 3.4, 'tiles_floor', 'lab_white', 'lab', { name: 'Keycard Vault' }),
    R('lab_ne', 'lab_ne', [[77.5, 12, 86.5, 16.5]], UP, 3.6, 'concrete_floor', 'lab_white', 'lab', { name: 'Lab Annex' }),
    R('lab_se', 'lab_se', [[77.5, 21, 82.5, 26]], UP, 3.6, 'concrete_floor', 'lab_white', 'lab', { name: 'Lab Annex' }),

    // ---------------- BARREL ROOM (lower floor, raised corners) ----------------
    R('br', 'br', [[92.5, 10, 110.5, 28]], LO, 2.5, 'concrete_floor', 'brick', 'barrel', { name: 'Barrel Room', sky: [[99.5, 15.5, 103.5, 22.5]] }),
    R('br_tl', 'br', [[92.5, 10, 97.5, 15]], -2.5, 2.5, 'diamond_plate', 'brick', 'barrel', { name: 'Barrel Room', riser: 'hazard' }),
    R('br_tr', 'br', [[105.5, 10, 110.5, 15]], -2.5, 2.5, 'diamond_plate', 'brick', 'barrel', { name: 'Barrel Room', riser: 'hazard' }),
    R('br_bl', 'br', [[92.5, 23, 97.5, 28]], -2.5, 2.5, 'diamond_plate', 'brick', 'barrel', { name: 'Barrel Room', riser: 'hazard' }),
    R('br_br', 'br', [[105.5, 23, 110.5, 28]], -2.5, 2.5, 'diamond_plate', 'brick', 'barrel', { name: 'Barrel Room', riser: 'hazard' }),
    R('ec', 'ec', [[98, 28, 101, 61]], LO, -1.0, 'concrete_floor', 'brick', 'tunnel', { name: 'Service Corridor' }),
    R('hc', 'hc', [[94, 44, 98, 46.5]], LO, -1.0, 'concrete_floor', 'brick', 'tunnel', { name: 'Service Corridor' }),

    // ---------------- BOTTLING HALL (lower, tall, skylights) ----------------
    R('hall', 'hall', [[64, 35.5, 94, 54]], LO, 5.5, 'epoxy_yellow', 'metal_panel', 'hall', { name: 'Bottling Hall', sky: [[67, 40, 92, 41.5], [67, 45, 92, 46.5], [67, 50, 92, 51.5]] }),
    R('bal', 'hall', [[70.5, 35.5, 79.5, 38]], -1.5, 5.5, 'grate', 'metal_panel', 'hall', { name: 'Finish Balcony', riser: 'hazard', grate: true }),
    R('sp', 'hall', [[75.5, 50.5, 83.5, 54]], -3.0, 5.5, 'diamond_plate', 'metal_panel', 'hall', { name: 'Loading Platform', riser: 'hazard' }),
    R('fin', 'fin', [[70.5, 30.5, 79.5, 35.5]], -1.5, 2.0, 'concrete_floor', 'lab_white', 'lab', { name: 'Finish Room' }),
    R('wc_n', 'wc_n', [[59.5, 35.5, 64, 53.5]], LO, -1.0, 'concrete_floor', 'concrete_wall', 'corridor', { name: 'West Gallery' }),
    R('wc_s', 'wc_s', [[59.5, 53.5, 64, 62]], LO, -1.0, 'concrete_floor', 'concrete_wall', 'corridor', { name: 'West Gallery' }),
    R('sc', 'sc', [[64, 54, 94, 56], [91.5, 56, 94, 74]], LO, -1.0, 'concrete_floor', 'concrete_wall', 'corridor', { name: 'South Corridor' }),

    // ---------------- LOWER LABS (lower, bottom-right) ----------------
    R('lb1', 'lb1', [[64, 56, 77.5, 61]], LO, -1.0, 'concrete_floor', 'lab_white', 'lab', { name: 'Bottling Lab' }),
    R('lb2', 'lb2', [[77.5, 56, 86.5, 61]], LO, -1.0, 'concrete_floor', 'lab_white', 'lab', { name: 'QA Lab' }),
    R('lb3', 'lb3', [[77.5, 61, 91.5, 71.5]], LO, -0.8, 'concrete_floor', 'lab_white', 'lab', { name: 'Big Lab' }),
    R('lb4', 'lb4', [[94, 61, 100, 71.5]], LO, -1.0, 'concrete_floor', 'lab_white', 'lab', { name: 'Side Lab' }),
    R('lb5', 'sc', [[77.5, 71.5, 100, 74], [77.5, 74, 80, 81], [91.5, 74, 100, 81]], LO, -1.0, 'concrete_floor', 'concrete_wall', 'corridor', { name: 'Lower Ring' }),
    R('lb6', 'lb6', [[82.5, 74, 91.5, 81]], LO, -1.0, 'concrete_floor', 'lab_white', 'lab', { name: 'Clean Room' }),
    R('lb_e', 'lb_e', [[73, 74, 77.5, 78.5]], LO, -0.5, 'concrete_floor', 'concrete_wall', 'stair', { name: 'E Stairs' }),
    R('lb_al', 'lb_e', [[66, 74, 69, 79]], -2.5, -0.5, 'diamond_plate', 'concrete_wall', 'stair', { name: 'E Landing', riser: 'hazard' }),

    // ---------------- WASHROOM (lower, south of the offices) ----------------
    R('w_main', 'w_main', [[0, 53.5, 12.5, 61], [0.5, 49, 11.5, 53.5], [0, 61, 12.5, 66]], LO, -1.3, 'tiles_floor', 'tiles_wall', 'wash', { name: 'Washroom' }),
    R('w_e1', 'w_e1', [[12.5, 53.5, 19, 57]], LO, -1.3, 'tiles_floor', 'tiles_wall', 'wash', { name: 'Washroom' }),
    R('w_e2', 'w_e2', [[12.5, 57, 22, 61], [19, 53.5, 24.5, 57]], LO, -1.3, 'tiles_floor', 'tiles_wall', 'wash', { name: 'Washroom' }),
    R('w_ne', 'w_ne', [[19, 47, 24.5, 53.5]], LO, -1.3, 'tiles_floor', 'tiles_wall', 'wash', { name: 'Washroom Lobby' }),
    R('tun', 'st_b', [[0.5, 26.5, 3.5, 49]], LO, -2.0, 'concrete_floor', 'brick', 'tunnel', { name: 'Service Tunnel' }),

    // ---------------- AIR DUCT (raised crawlway) ----------------
    R('duct', 'duct', [[31.5, 59.5, 54, 61.5], [31.5, 61.5, 33.5, 65.5], [44.5, 61.5, 46.5, 65.5], [39, 63.5, 44.5, 65.5], [18.5, 63.5, 31.5, 65.5]], -3.0, -0.6, 'diamond_plate', 'metal_panel', 'duct', { name: 'Air Duct' }),
    R('b_land', 'duct', [[12.5, 63.5, 15, 65.5]], -3.75, -0.6, 'diamond_plate', 'metal_panel', 'duct', { name: 'Air Duct' })
  ];

  // Solid blocks carved back out of the regions (big consoles, U-bench, pillars).
  const voids = [
    [4, 4.5, 17.5, 8.5],                       // Records console bank
    [4, 12, 17.5, 16.5],                       // block between Records and Lab B
    [7.5, 24.5, 17.5, 26.5], [7.5, 26.5, 9, 31.5], [9, 30, 15.5, 31.5], // U-bench
    [19.5, 29.5, 20.5, 31.5],                  // pillar
    [22, 16.5, 23.5, 24.5], [28.5, 21, 29.5, 24.5],
    [71, 16.5, 72, 17.5], [71, 20, 72, 21],    // vault door frame blocks
    [99, 10, 99.5, 15],                        // barrel room wall stub
    [100.5, 18.5, 102, 20],                    // barrel room pillar
    [94.5, 74, 96, 75.5],                      // lower ring pillar
    [0, 49, 0.5, 53.5], [11.5, 49, 12.5, 53.5] // washroom end blocks
  ];

  // Stairs: rect, the direction you face while climbing, bottom/top heights.
  // A stair in an existing group sits open inside that room; otherwise it is
  // its own walled stairwell (group = its id) and doors open its two ends.
  const stairs = [
    { id: 'st_c', group: 'st_c', rect: [20.5, 40, 24.5, 47], up: 'N', y0: LO, y1: UP, name: 'Stairwell C' },
    { id: 'st_b', group: 'st_b', rect: [0.5, 19.5, 3.5, 26.5], up: 'N', y0: LO, y1: UP, name: 'Stairwell B' },
    { id: 'st_e', group: 'st_e', rect: [86.5, 12.5, 92.5, 14.5], up: 'W', y0: -2.5, y1: UP, name: 'Stairs E' },
    { id: 'st_d', group: 'st_d', rect: [82.5, 23.5, 92.5, 25.5], up: 'W', y0: -2.5, y1: UP, name: 'Stairs D' },
    { id: 'st_f', group: 'st_f', rect: [72, 26, 75.5, 30.5], up: 'N', y0: -1.5, y1: UP, name: 'Finish Stairs' },
    { id: 'br_s1', group: 'br', rect: [93, 15, 95, 18.5], up: 'N', y0: LO, y1: -2.5 },
    { id: 'br_s2', group: 'br', rect: [108, 15, 110, 18.5], up: 'N', y0: LO, y1: -2.5 },
    { id: 'br_s3', group: 'br', rect: [93, 19.5, 95, 23], up: 'S', y0: LO, y1: -2.5 },
    { id: 'br_s4', group: 'br', rect: [108, 19.5, 110, 23], up: 'S', y0: LO, y1: -2.5 },
    { id: 'hall_s1', group: 'hall', rect: [79.5, 35.5, 84.5, 38], up: 'W', y0: LO, y1: -1.5 },
    { id: 'hall_s2', group: 'hall', rect: [79, 47.5, 83, 50.5], up: 'S', y0: LO, y1: -3.0 },
    { id: 'lbe_s', group: 'lb_e', rect: [69, 75, 73, 78], up: 'W', y0: LO, y1: -2.5 },
    { id: 'w_bs1', group: 'duct', rect: [12.5, 61, 15, 63.5], up: 'S', y0: LO, y1: -3.75, name: 'Stairs A' },
    { id: 'w_bs2', group: 'duct', rect: [15, 63.5, 18.5, 65.5], up: 'E', y0: -3.75, y1: -3.0 },
    { id: 'duct_s', group: 'duct', rect: [54, 59.5, 59.5, 61.5], up: 'W', y0: LO, y1: -3.0 }
  ];

  // Openings: any wall edge whose two cells both lie inside one of these
  // rects is removed. A lintel is kept above 2.6 m unless `full` is set.
  const D = (x0, z0, x1, z1, full) => ({ r: [x0, z0, x1, z1], full: !!full });
  const doors = [
    // offices
    D(1, 4, 3, 5), D(19, 4, 21, 5), D(12.5, 9.5, 13.5, 11), D(1, 14, 3, 15),
    D(17, 17.5, 18, 19), D(21.5, 14.5, 22.5, 16), D(25, 24, 27, 25), D(29, 18, 30, 20),
    D(21.5, 31, 23, 32), D(20, 32, 21, 34),
    // mid
    D(32.5, 16, 39, 17), D(54, 16, 56, 17), D(41, 18, 42, 20), D(61, 18, 62, 20), D(64.5, 18, 65.5, 20),
    D(46, 20.5, 48, 21.5),
    // keycard lab
    D(70.5, 18, 71.5, 20), D(77, 13.5, 78, 15.5), D(77, 22, 78, 24),
    // stair ends
    D(20.5, 39.5, 24.5, 40.5, true), D(20.5, 46.5, 24.5, 47.5, true),
    D(0.5, 19, 3.5, 20, true), D(0.5, 48.5, 3.5, 49.5),
    D(86, 12.5, 87, 14.5), D(92, 12.5, 93, 14.5),
    D(82, 23.5, 83, 25.5), D(92, 23.5, 93, 25.5),
    D(72, 25.5, 75.5, 26.5), D(72, 30, 75.5, 31),
    // barrel room / service corridor
    D(98, 27.5, 101, 28.5), D(93.5, 44, 94.5, 46.5), D(97.5, 44, 98.5, 46.5), D(98, 60.5, 100, 61.5),
    // bottling hall
    D(72.5, 35, 74.5, 36), D(76.5, 35, 78.5, 36),
    D(63.5, 44, 64.5, 46.5), D(61.5, 53, 63, 54, true), D(63.5, 54, 64.5, 55.5),
    D(64, 53.5, 68, 54.5, true), D(86, 53.5, 89, 54.5),
    // lower labs
    D(77, 57, 78, 59), D(63.5, 59.5, 64.5, 61), D(80, 55.5, 81.5, 56.5), D(80, 60.5, 84, 61.5),
    D(91, 69, 92, 71), D(93.5, 62.5, 94.5, 64.5), D(95, 71, 97, 72), D(79, 71, 81, 72),
    D(88.5, 73.5, 90.5, 74.5), D(77, 75, 78, 77),
    // washroom
    D(12, 55, 13, 56.5), D(13, 56.5, 15, 57.5), D(19.5, 53, 21.5, 54), D(12.5, 60.5, 15, 61.5),
    // duct
    D(59, 59.5, 60, 61.5)
  ];

  // Interior windows (glass from sill to top).
  const windows = [
    { r: [23.5, 16, 29.5, 17], sill: 1.0, top: 2.5 },
    { r: [71, 16, 77.5, 17], sill: 1.0, top: 2.4 },
    { r: [71, 20.5, 77.5, 21.5], sill: 1.0, top: 2.4 }
  ];

  // ---------------------------------------------------------------- props
  // Rect props use [x0,z0,x1,z1]; their base sits on the floor below them.
  const props = [
    // Offices
    { t: 'shelf', r: [0.2, 5, 0.9, 11], rot: 1 },
    { t: 'desk', r: [8.5, 18, 10.5, 21.5] }, { t: 'desk', r: [11.5, 22.5, 17, 24] },
    { t: 'cabinet', r: [28, 12.4, 29.2, 14.5] }, { t: 'desk', r: [25.4, 14.8, 27.2, 16.1] },
    { t: 'desk', r: [24.5, 19, 27.5, 20.5] },
    { t: 'crates', x: 6.5, z: 2, n: 3 }, { t: 'crates', x: 10.5, z: 1.6, n: 2 },
    { t: 'crates', x: 5.5, z: 33.5, n: 3 }, { t: 'crates', x: 27.5, z: 38.5, n: 2 },
    { t: 'desk', r: [11, 27.5, 15, 28.8] },
    { t: 'pipes', r: [0, 0.5, 22, 4.5], axis: 'x' },
    // Mid
    { t: 'shelf', r: [30, 12.2, 31.2, 16.2] }, { t: 'machine', r: [34.3, 13.1, 36.7, 15.3] },
    { t: 'shelf', r: [39.9, 12.2, 41, 16.2] }, { t: 'shelf', r: [41.5, 12.2, 43.2, 13] },
    { t: 'crates', x: 50.2, z: 13.2, n: 2 }, { t: 'crates', x: 59.5, z: 14.5, n: 3 },
    { t: 'desk', r: [44, 24.1, 45.6, 25.4] }, { t: 'desk', r: [57.4, 24.1, 59, 25.4] },
    { t: 'desk', r: [49, 22.6, 53.5, 24] },
    { t: 'lockers', r: [60.4, 21.4, 61.3, 25.8] },
    { t: 'pipes', r: [29.5, 16.5, 65, 21], axis: 'x' },
    // Keycard lab
    { t: 'machine', r: [68, 14, 71, 16.5], big: true }, { t: 'machine', r: [68, 21, 71, 23.5], big: true },
    { t: 'desk', r: [73.6, 17.2, 75.2, 18] }, { t: 'desk', r: [73.6, 19.6, 75.2, 20.4] },
    { t: 'cabinet', r: [76.4, 17.2, 77.3, 18.6] }, { t: 'cabinet', r: [76.4, 19, 77.3, 20.4] },
    { t: 'desk', r: [79.5, 12.3, 83, 13.2] }, { t: 'crates', x: 79, z: 15.8, n: 1 },
    { t: 'desk', r: [66, 24.4, 69, 25.6] },
    // Barrel room
    { t: 'barrels', x: 94.2, z: 11.3, n: 2 }, { t: 'barrels', x: 101, z: 11.3, n: 3 },
    { t: 'barrels', x: 93.6, z: 26.6, n: 2 }, { t: 'barrels', x: 96.5, z: 26.6, n: 1 },
    { t: 'barrels', x: 106.5, z: 26.6, n: 2 }, { t: 'barrels', x: 109.4, z: 26.6, n: 1 },
    { t: 'barrels', x: 109.3, z: 11.5, n: 2 }, { t: 'barrels', x: 104, z: 13.2, n: 3 },
    { t: 'barrels', x: 98.5, z: 21.5, n: 2 }, { t: 'barrels', x: 104.2, z: 18.6, n: 1 },
    { t: 'crates', x: 99.8, z: 26.8, n: 1 },
    { t: 'pipes', r: [98, 28, 101, 61], axis: 'z' },
    // Bottling hall
    { t: 'tanks', xs: [88, 91.1], zs: [38.6, 41.6, 44.7, 47.8, 51] },
    { t: 'conveyor', r: [65.6, 36.2, 67.6, 43.3] },
    { t: 'machine', r: [64.5, 50, 66.5, 51.3] },
    { t: 'crates', x: 71, z: 52.6, n: 3 }, { t: 'crates', x: 84.6, z: 52.2, n: 2 },
    { t: 'crates', x: 73, z: 43, n: 2 }, { t: 'crates', x: 80.2, z: 43.8, n: 1 },
    { t: 'forklift', x: 76.5, z: 46.2, rot: 0.6 },
    { t: 'pallets', x: 69.5, z: 47.5 },
    { t: 'pipes', r: [59.5, 35.5, 64, 62], axis: 'z' },
    { t: 'pipes', r: [64, 54, 94, 56], axis: 'x' },
    // Lower labs
    { t: 'desk', r: [64.7, 56.3, 66.2, 59] }, { t: 'desk', r: [68, 57.7, 71.4, 59.7] }, { t: 'desk', r: [72.7, 57.7, 76.2, 59.7] },
    { t: 'desk', r: [79.8, 63.2, 83.3, 65] }, { t: 'desk', r: [86, 63.2, 89.5, 65] },
    { t: 'desk', r: [79.8, 68.2, 83.3, 70] }, { t: 'desk', r: [86, 68.2, 89.5, 70] },
    { t: 'desk', r: [95.2, 63.2, 98.7, 65] }, { t: 'desk', r: [95.2, 68.2, 98.7, 70] },
    { t: 'desk', r: [85.2, 76.5, 88.7, 78.5] },
    { t: 'cabinet', r: [82.8, 56.3, 86.2, 57] },
    { t: 'crates', x: 98.5, z: 79.5, n: 2 }, { t: 'crates', x: 78.6, z: 79.6, n: 1 },
    // Washroom
    { t: 'sinks', r: [6, 55, 9.5, 59.5] },
    { t: 'stalls', side: 'top', z0: 49, z1: 53.5, xs: [3.5, 6.25, 9, 11.5] },
    { t: 'stalls', side: 'bottom', z0: 61, z1: 66, xs: [0, 2.5, 5, 7.5, 10, 12.5] },
    { t: 'pipes', r: [0.5, 26.5, 3.5, 49], axis: 'z' },
    { t: 'vents', x: 40.5, z: 64.5 }, { t: 'vents', x: 42.5, z: 64.5 }
  ];

  // Pickups: weapons, armour (as on the plan), fish snacks (health), ammo.
  const pickups = [
    { t: 'smg', x: 12.5, z: 20.5 },
    { t: 'rifle', x: 45, z: 14.5 },
    { t: 'shotgun', x: 3, z: 57.5 },
    { t: 'sniper', x: 75, z: 36.8 },
    { t: 'launcher', x: 101.5, z: 24.5 },
    { t: 'smg', x: 88, z: 66 },
    { t: 'shotgun', x: 74.5, z: 18.8 },
    { t: 'rifle', x: 61.8, z: 40 },
    { t: 'armor', x: 21, z: 20.5 },
    { t: 'armor', x: 95, z: 12.5 },
    { t: 'armor', x: 67.5, z: 76.5 },
    { t: 'health', x: 15, z: 2.5 }, { t: 'health', x: 51.5, z: 25.2 }, { t: 'health', x: 83.5, z: 14.5 },
    { t: 'health', x: 99.5, z: 50 }, { t: 'health', x: 70, z: 33 }, { t: 'health', x: 16, z: 59 },
    { t: 'health', x: 2, z: 38 }, { t: 'health', x: 96.5, z: 79 },
    { t: 'ammo', x: 25.5, z: 35 }, { t: 'ammo', x: 37, z: 18.8 }, { t: 'ammo', x: 80, z: 23.5 },
    { t: 'ammo', x: 102.5, z: 16.5 }, { t: 'ammo', x: 89.5, z: 54.9 }, { t: 'ammo', x: 61.8, z: 58 },
    { t: 'ammo', x: 42, z: 60.5 }, { t: 'ammo', x: 8, z: 63.5 }, { t: 'ammo', x: 84, z: 72.8 },
    { t: 'ammo', x: 72, z: 46.5 }
  ];

  // Spawn points [x, z, yaw]. yaw 0 faces north (-z).
  const spawns = [
    [52.5, 60.5, -1.57],            // the plan's "Start" — east end of the Air Duct
    [2, 2.5, 3.14], [20, 10, 3.14], [10, 33, 0], [26, 37, 0],
    [38.2, 14.5, -1.57], [56, 19, 1.57], [51, 25.2, 0],
    [74, 24, 0], [84, 14.5, 1.57], [80, 23.5, 1.57],
    [96, 21, -1.57], [106.5, 19, 1.57], [99.5, 38, 3.14],
    [70, 45, -1.57], [85, 39, 3.14], [90, 52.5, 0], [61.8, 47, 3.14],
    [67.1, 60.2, 3.14], [84, 66.5, 0], [97, 77, 0], [87, 80, 0],
    [3, 56, -1.57], [17, 59, 1.57], [21.5, 50.5, 3.14], [2, 35, 3.14]
  ];

  JB.MapData = { UP, LO, regions, voids, stairs, doors, windows, props, pickups, spawns };
})();
