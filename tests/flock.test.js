const { Flock } = require('../renderer/pigeon/flock');
const { Pigeon } = require('../renderer/pigeon/Pigeon');
const { STATES } = require('../renderer/pigeon/states');

function makeMain() {
  return new Pigeon(null, { x: 0, y: 0 });
}

test('startFeeding spawns temporary pigeons staggered over time, capped at 8', () => {
  const flock = new Flock(makeMain());
  flock.startFeeding({ x: 100, y: 100 });

  flock.update(0);
  expect(flock.getTemporaryPigeons().length).toBe(0); // none spawned yet at t=0

  for (let i = 0; i < 8; i++) flock.update(1000); // well past each 300-1000ms stagger step
  expect(flock.getTemporaryPigeons().length).toBe(8);

  flock.update(1000);
  expect(flock.getTemporaryPigeons().length).toBe(8); // capped, no ninth
});

test('main pigeon enters FLYING_TO_FOOD immediately on startFeeding', () => {
  const main = makeMain();
  const flock = new Flock(main);
  flock.startFeeding({ x: 5, y: 5 });
  expect(main.getState()).toBe(STATES.FLYING_TO_FOOD);
});

test('a second startFeeding call while feeding is active is a no-op', () => {
  const flock = new Flock(makeMain());
  flock.startFeeding({ x: 1, y: 1 });
  flock.update(8000);
  const countAfterFirst = flock.getTemporaryPigeons().length;
  flock.startFeeding({ x: 2, y: 2 }); // should be ignored
  expect(flock.getTemporaryPigeons().length).toBe(countAfterFirst);
});

test('temporary pigeons are removed after they finish dispersing', () => {
  const flock = new Flock(makeMain(), { dispersalAfterMs: 500, spawnStaggerMs: 100 });
  flock.startFeeding({ x: 0, y: 0 });
  for (let i = 0; i < 8; i++) flock.update(100);
  expect(flock.getTemporaryPigeons().length).toBe(8);

  flock.update(600); // past dispersalAfterMs
  expect(flock.getTemporaryPigeons().length).toBe(0);
});
