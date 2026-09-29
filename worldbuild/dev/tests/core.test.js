import { load, test, assert, eq } from './harness.js';

test('core.js loads in the harness and its RNG is deterministic', () => {
  const D = load(['js/core.js']);
  assert(D.N === 1024 && D.CELL === 16, 'constants');
  const a = D.rng(42), b = D.rng(42);
  eq([a(), a(), a()], [b(), b(), b()]);
});
