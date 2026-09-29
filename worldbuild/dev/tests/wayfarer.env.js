// Test environment for roads.js + wayfarer.js in the Deno harness (loaded by wayfarer.test.js; not a test).
// Terrain, history and town are stubs whose behaviour the tests steer through D._env.
(function () {
  const D = window.D;
  const env = D._env = {
    ground: (x, z) => 10, water: (x, z) => -100,
    touched: 0, hidden: [], places: [], gates: {}, manual: [], logs: []
  };
  D.W = { h: new Float32Array(D.VN * D.VN), zone: new Uint8Array(D.N * D.N * 4), seed: 1 };
  D.Terrain = { hAt: (x, z) => env.ground(x, z), waterAt: (x, z) => env.water(x, z), markH() {}, isWet: (x, z) => env.water(x, z) > env.ground(x, z) - 0.3 };
  D.History = { touch() {}, touchObj() { env.touched++; }, regObj() {}, regArray() {}, regStore() {}, active: () => false };
  const chunks = []; for (let i = 0; i < D.NCH * D.NCH; i++) chunks.push([]);
  D.Town = {
    chunks,
    hist: { list: () => env.places, gates: sid => env.gates[sid] || [] },
    hideRoadRect(bb) { env.hidden.push(bb); },
    addManual(b) { const CS = D.CHUNK * D.CELL; chunks[Math.floor(b.z / CS) * D.NCH + Math.floor(b.x / CS)].push(b); }
  };
})();
