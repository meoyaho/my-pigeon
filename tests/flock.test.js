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

function makeMainWithBounds(options = {}) {
  return new Pigeon(null, { x: 0, y: 0 }, {
    bounds: { width: 800, height: 600 },
    fastWalkSpeed: 1000, // fast enough that flights resolve within a test's update() calls
    ...options,
  });
}

test('startFeeding flies the main pigeon to the food point instead of teleporting (bounds known)', () => {
  const main = makeMainWithBounds();
  const flock = new Flock(main);
  flock.startFeeding({ x: 700, y: 500 });
  expect(main.getState()).toBe(STATES.FLYING_TO_FOOD);
  expect(main.x).toBe(0); // hasn't teleported — still mid-flight from its starting position
  flock.update(10000); // fast speed — arrives well within this
  expect(main.getState()).toBe(STATES.EATING);
  expect(main.x).toBeCloseTo(700, 0);
  expect(main.y).toBeCloseTo(500, 0);
});

test('temporary pigeons fly in from off-screen (bounds known), not materialize already at the food', () => {
  const main = makeMainWithBounds();
  const flock = new Flock(main, { spawnStaggerMs: 100 });
  flock.startFeeding({ x: 400, y: 300 });
  flock.update(150); // triggers the first spawn
  const [first] = flock.getTemporaryPigeons();
  expect(first.getState()).toBe(STATES.FLYING_TO_FOOD);
  // Spawned far from its eventual eating spot (off-screen), not already there.
  expect(Math.hypot(first.x - 400, first.y - 300)).toBeGreaterThan(200);
});

test('temporary pigeons spawn from different positions (different arrival directions)', () => {
  let call = 0;
  const rng = () => { call += 1; return (call % 5) / 5; }; // cycles through several angles
  const main = makeMainWithBounds({ rng });
  const flock = new Flock(main, { spawnStaggerMs: 100, rng });
  flock.startFeeding({ x: 400, y: 300 });
  for (let i = 0; i < 3; i++) flock.update(150);
  const positions = flock.getTemporaryPigeons().map((p) => `${Math.round(p.x)},${Math.round(p.y)}`);
  expect(new Set(positions).size).toBe(positions.length); // all distinct spawn points
});

test('disperseAll sends the whole temporary flock away (FLEEING) and ends the feeding session', () => {
  const main = makeMainWithBounds();
  const flock = new Flock(main, { spawnStaggerMs: 100 });
  flock.startFeeding({ x: 400, y: 300 });
  for (let i = 0; i < 8; i++) flock.update(150);
  expect(flock.getTemporaryPigeons().length).toBe(8);

  flock.disperseAll();
  expect(flock.feeding).toBe(false);
  for (const pigeon of flock.getTemporaryPigeons()) {
    expect(pigeon.getState()).toBe(STATES.FLEEING);
  }
});

test('disperseAll removes each temporary pigeon once it actually finishes leaving, so only the main pigeon remains', () => {
  const main = makeMainWithBounds();
  const flock = new Flock(main, { spawnStaggerMs: 100 });
  flock.startFeeding({ x: 400, y: 300 });
  for (let i = 0; i < 8; i++) flock.update(150);
  expect(flock.getTemporaryPigeons().length).toBe(8);

  flock.disperseAll();
  flock.update(10000); // fast speed — all should have finished leaving
  expect(flock.getTemporaryPigeons().length).toBe(0);
});

test('disperseAll with no active feeding session is a harmless no-op', () => {
  const flock = new Flock(makeMainWithBounds());
  expect(() => flock.disperseAll()).not.toThrow();
  expect(flock.getTemporaryPigeons().length).toBe(0);
});
