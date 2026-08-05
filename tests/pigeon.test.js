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

test('flyTo interpolates x/y linearly toward the target over the flight duration', () => {
  const p = new Pigeon(null, { x: 0, y: 100 }, { bounds: { width: 800, height: 600 } });
  p.flyTo({ x: 100, y: 100 }, 1000, { state: STATES.COMMUTE_IN });
  expect(p.getState()).toBe(STATES.COMMUTE_IN);
  p.update(500); // halfway through the flight
  expect(p.x).toBeCloseTo(50, 5);
  expect(p.getState()).toBe(STATES.COMMUTE_IN); // not arrived yet
});

test('flyTo does not clamp to bounds even when the target is off-screen', () => {
  const p = new Pigeon(null, { x: 400, y: 300 }, { bounds: { width: 800, height: 600 }, boundsMargin: 20 });
  p.flyTo({ x: -100, y: 300 }, 1000, { state: STATES.COMMUTE_OUT });
  p.update(1000); // full duration, arrives exactly at the off-screen target
  expect(p.x).toBe(-100);
});

test('flyTo enters arriveState and fires onComplete exactly once on arrival', () => {
  const onComplete = jest.fn();
  const p = new Pigeon(null, { x: 0, y: 0 }, { bounds: { width: 800, height: 600 } });
  p.flyTo({ x: 400, y: 300 }, 1000, { state: STATES.COMMUTE_IN, arriveState: STATES.IDLE, onComplete });
  p.update(999);
  expect(p.getState()).toBe(STATES.COMMUTE_IN);
  expect(onComplete).not.toHaveBeenCalled();
  p.update(1); // crosses the 1000ms threshold
  expect(p.getState()).toBe(STATES.IDLE);
  expect(onComplete).toHaveBeenCalledTimes(1);
  p.update(1000); // further ticks in IDLE must not re-fire the flight callback
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('flyTo swaps the sprite to flyIn/flyOut frames when a sprite is attached', () => {
  const spritesheet = { frames: { idle: ['idle1'], flyIn: ['fi1', 'fi2'], flyOut: ['fo1', 'fo2'] } };
  const p = new Pigeon(spritesheet, { x: 0, y: 0 }, { bounds: { width: 800, height: 600 } });
  p.sprite = { textures: spritesheet.frames.idle, gotoAndPlay: jest.fn() };

  p.flyTo({ x: 100, y: 100 }, 1000, { state: STATES.COMMUTE_IN });
  expect(p.sprite.textures).toBe(spritesheet.frames.flyIn);
  expect(p.sprite.gotoAndPlay).toHaveBeenCalledWith(0);

  p.flyTo({ x: 0, y: 0 }, 1000, { state: STATES.COMMUTE_OUT });
  expect(p.sprite.textures).toBe(spritesheet.frames.flyOut);
});

test('flyTo reverts the sprite to idle frames once COMMUTE_IN arrives at IDLE', () => {
  const spritesheet = { frames: { idle: ['idle1'], flyIn: ['fi1'] } };
  const p = new Pigeon(spritesheet, { x: 0, y: 0 }, { bounds: { width: 800, height: 600 } });
  p.sprite = { textures: spritesheet.frames.idle, gotoAndPlay: jest.fn() };

  p.flyTo({ x: 100, y: 100 }, 1000, { state: STATES.COMMUTE_IN, arriveState: STATES.IDLE });
  p.update(1000);
  expect(p.getState()).toBe(STATES.IDLE);
  expect(p.sprite.textures).toBe(spritesheet.frames.idle);
});
