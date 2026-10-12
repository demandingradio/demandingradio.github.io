// Jimbog — the map list. Each entry says how to build the map and how to
// light it (see Render.setLevel for the env fields).
(function () {
  'use strict';
  const JB = window.JB;

  JB.Maps = {
    facility: {
      id: 'facility', name: 'Facility', tagline: 'Facility deathmatch · factory interiors',
      builder: 'grid', data: () => JB.MapData,
      // Interiors sit about a stop under the campus sun: dim cool skylight fill, warm bounce, light dusty haze.
      env: { background: 0x0b0d10, fog: [0x262420, 0.0095], hemi: [0x9fb0bd, 0x3a2e22, 0.2], sun: [0xffe6c4, 3.1], exposure: 1.0, envMap: 'factory', far: 260 },
      menuShots: [
        { a: [86, -2.2, 37.5], b: [70, -2.4, 50], look: [80, -1.0, 44] },
        { a: [94, -2.6, 21.5], b: [107, -2.6, 20], look: [101, -2.5, 15] },
        { a: [31, 1.5, 18.5], b: [58, 1.5, 19], look: [64, 1.4, 19] },
        { a: [70, 0.0, 36.5], b: [78, -0.2, 36.8], look: [88, -2.0, 46] },
        { a: [4, -3.0, 55], b: [10, -3.0, 59], look: [11, -3.3, 64] },
        { a: [20, 1.6, 26], b: [12, 1.6, 33], look: [5, 1.4, 22] }
      ]
    },
    campus: {
      id: 'campus', name: 'Research Campus', tagline: 'Research Campus · fields, labs and a two-storey wing',
      builder: 'spans', data: () => JB.MapCampus,
      // Fog colour is the sky horizon (JB.Sky.HORIZON); the density gives pale aerial haze on the far trees and houses.
      env: { background: null, sky: true, fog: [0xb3c7cc, 0.0040], hemi: [0xc9dcf2, 0x6b6a58, 0.24], sun: [0xfff1dc, 2.8], exposure: 0.92, envMap: 'outdoor', envIntensity: 0.28, far: 950 },
      menuShots: null   // from the map data
    }
  };
  JB.Maps.list = ['facility', 'campus'];
  JB.Maps.get = (id) => JB.Maps[id] || JB.Maps.facility;
})();
