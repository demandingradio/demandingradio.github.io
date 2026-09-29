// Test stub for dev/tests/director.test.js (loaded between core.js and town.js by the harness):
// a flat, dry synthetic world whose terrain the tests can reshape through D._stub.
(function () {
  const D = window.D;
  D.W = { seed: 7, seaLevel: 0, climate: 0 };
  const S = D._stub = { h: (x, z) => 10, water: (x, z) => -1e9 };
  D.Terrain = {
    hAt: (x, z) => S.h(x, z),
    waterAt: (x, z) => S.water(x, z),
    isWet: (x, z, m) => S.water(x, z) > S.h(x, z) + (m || 0)
  };
  D.renderer = null;
  D.subUpload = function () {};
})();
