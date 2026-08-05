const { FeedModeController } = require('../renderer/interactions/feedMode');

test('inactive by default; handleClick is a no-op', () => {
  const fm = new FeedModeController();
  expect(fm.isActive()).toBe(false);
  expect(fm.handleClick({ x: 1, y: 1 })).toBeNull();
});

test('start() activates mode; handleClick places food and deactivates', () => {
  const fm = new FeedModeController();
  fm.start();
  expect(fm.isActive()).toBe(true);
  const point = fm.handleClick({ x: 50, y: 60 });
  expect(point).toEqual({ x: 50, y: 60 });
  expect(fm.isActive()).toBe(false);
});

test('auto-cancels after 5000ms with no click', () => {
  const fm = new FeedModeController();
  fm.start();
  fm.tick(4999);
  expect(fm.isActive()).toBe(true);
  fm.tick(2);
  expect(fm.isActive()).toBe(false);
});
