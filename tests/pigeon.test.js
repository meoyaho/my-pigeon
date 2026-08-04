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
