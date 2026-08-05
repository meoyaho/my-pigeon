const { MouseVelocityTracker, shouldScatter } = require('../renderer/interactions/mouseTracker');

test('computes velocity from two samples', () => {
  const tracker = new MouseVelocityTracker();
  tracker.recordSample({ x: 0, y: 0, tMs: 0 });
  tracker.recordSample({ x: 100, y: 0, tMs: 50 });
  const v = tracker.getVelocity();
  expect(v.vx).toBeCloseTo(2, 1); // 100px / 50ms = 2 px/ms
  expect(v.speed).toBeCloseTo(2, 1);
});

test('shouldScatter is true above threshold, false below', () => {
  expect(shouldScatter({ speed: 3 }, 1.5)).toBe(true);
  expect(shouldScatter({ speed: 0.5 }, 1.5)).toBe(false);
});
