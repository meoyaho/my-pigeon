const { Pigeon } = require('../renderer/pigeon/Pigeon');
const { STATES } = require('../renderer/pigeon/states');

test('starts in IDLE state', () => {
  const p = new Pigeon(null, { x: 10, y: 10 });
  expect(p.getState()).toBe(STATES.IDLE);
});

test('transitions from IDLE to WALKING after idle timer elapses', () => {
  const p = new Pigeon(null, { x: 0, y: 0 }, { idleDurationMs: 100, rng: () => 0.9 });
  p.update(150);
  expect(p.getState()).toBe(STATES.WALKING);
});

test('enters WEIRD_BEHAVIOR when the weird-behavior timer elapses, then returns to IDLE', () => {
  const p = new Pigeon(null, { x: 0, y: 0 }, {
    idleDurationMs: 1_000_000, // never walk on its own during this test
    weirdBehaviorIntervalMs: 100,
    weirdBehaviorDurationMs: 50,
    rng: () => 0,
  });
  p.update(100);
  expect(p.getState()).toBe(STATES.WEIRD_BEHAVIOR);
  expect(p.currentWeirdBehavior).toBe('flipOver'); // rng()=>0 always picks index 0
  p.update(60);
  expect(p.getState()).toBe(STATES.IDLE);
});

test('clampToBounds is a no-op when no bounds were provided', () => {
  const p = new Pigeon(null, { x: 99999, y: -99999 });
  p.clampToBounds();
  expect(p.x).toBe(99999);
  expect(p.y).toBe(-99999);
});

test('clampToBounds keeps x/y within [margin, size - margin] when bounds are set', () => {
  const p = new Pigeon(null, { x: -500, y: 5000 }, { bounds: { width: 800, height: 600 }, boundsMargin: 20 });
  p.clampToBounds();
  expect(p.x).toBe(20);
  expect(p.y).toBe(580);
});

test('repeated SCATTERING bursts never push the pigeon past the bounds', () => {
  const p = new Pigeon(null, { x: 780, y: 300 }, { bounds: { width: 800, height: 600 }, boundsMargin: 20 });
  // Flee straight toward the right edge, repeatedly, simulating rapid
  // real-world 훠이훠이 triggers that used to drift the pigeon off-screen.
  for (let i = 0; i < 20; i++) {
    p.scatterAwayFrom({ x: p.x - 10, y: p.y });
    p.update(600); // full scatter burst duration, resolves back to IDLE
  }
  expect(p.x).toBeLessThanOrEqual(780);
  expect(p.x).toBeGreaterThanOrEqual(20);
});
