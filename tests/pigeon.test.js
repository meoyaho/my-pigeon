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
  p.sprite = { textures: spritesheet.frames.idle, gotoAndPlay: jest.fn(), scale: { x: 1, y: 1 } };

  p.flyTo({ x: 100, y: 100 }, 1000, { state: STATES.COMMUTE_IN });
  expect(p.sprite.textures).toBe(spritesheet.frames.flyIn);
  expect(p.sprite.gotoAndPlay).toHaveBeenCalledWith(0);

  p.flyTo({ x: 0, y: 0 }, 1000, { state: STATES.COMMUTE_OUT });
  expect(p.sprite.textures).toBe(spritesheet.frames.flyOut);
});

test('flyTo reverts the sprite to idle frames once COMMUTE_IN arrives at IDLE', () => {
  const spritesheet = { frames: { idle: ['idle1'], flyIn: ['fi1'] } };
  const p = new Pigeon(spritesheet, { x: 0, y: 0 }, { bounds: { width: 800, height: 600 } });
  p.sprite = { textures: spritesheet.frames.idle, gotoAndPlay: jest.fn(), scale: { x: 1, y: 1 } };

  p.flyTo({ x: 100, y: 100 }, 1000, { state: STATES.COMMUTE_IN, arriveState: STATES.IDLE });
  p.update(1000);
  expect(p.getState()).toBe(STATES.IDLE);
  expect(p.sprite.textures).toBe(spritesheet.frames.idle);
});

const FULL_SPRITESHEET = {
  frames: {
    idle: ['idle1'], walk: ['walk1'], flipOver: ['fo1'], featherOnHead: ['foh1'],
    oneLegDoze: ['old1'], courtshipCoo: ['cc1'], hopInPlace: ['hip1'],
    flyIn: ['fi1'], flyOut: ['fout1'], eat: ['eat1'], startled: ['st1'],
    weatherHuddle: ['wh1'], dragged: ['dr1'],
  },
};

class MockAnimatedSprite {
  constructor(frames) {
    this.textures = frames;
    this.anchor = { set: () => {} };
    this.scale = { x: 1, y: 1 };
    this.width = 100;
    this.height = 100;
  }
  gotoAndPlay(frame) { this._frame = frame; }
  play() {}
}
const MOCK_PIXI = { AnimatedSprite: MockAnimatedSprite };

function makeAttachedPigeon(x = 0, y = 0, options = {}) {
  const p = new Pigeon(FULL_SPRITESHEET, { x, y }, { bounds: { width: 800, height: 600 }, ...options });
  p.attachSprite(MOCK_PIXI, { addChild() {} });
  return p;
}

test('WALKING shows the walk animation', () => {
  const p = makeAttachedPigeon(0, 0, { idleDurationMs: 100 });
  p.update(150);
  expect(p.getState()).toBe(STATES.WALKING);
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.walk);
});

test('EATING (entered externally by Flock) shows the eat animation', () => {
  const p = makeAttachedPigeon();
  p._enterState(STATES.EATING);
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.eat);
});

test('FLYING_TO_FOOD (entered externally by Flock.startFeeding) shows the flyIn animation', () => {
  const p = makeAttachedPigeon();
  p._enterState(STATES.FLYING_TO_FOOD);
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.flyIn);
});

test('SCATTERING shows the flyOut animation', () => {
  const p = makeAttachedPigeon();
  p.scatterAwayFrom({ x: 10, y: 0 });
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.flyOut);
});

test('STARTLED shows the startled animation', () => {
  const p = makeAttachedPigeon();
  p.maybeStartle(() => 0, 1); // rng()=>0 < probability=1, always startles
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.startled);
});

test('WEATHER_REACTION shows the weatherHuddle animation', () => {
  const p = makeAttachedPigeon();
  p.setWeather('rain');
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.weatherHuddle);
});

test('DRAGGED shows the dragged animation', () => {
  const p = makeAttachedPigeon();
  p.startDrag();
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.dragged);
});

test('WEIRD_BEHAVIOR shows the specific behavior chosen, e.g. courtshipCoo', () => {
  const p = new Pigeon(FULL_SPRITESHEET, { x: 0, y: 0 }, {
    idleDurationMs: 1_000_000,
    weirdBehaviorIntervalMs: 100,
    rng: () => 0.6, // picks 'courtshipCoo' (index 3 of 5 behaviors)
  });
  p.attachSprite(
    MOCK_PIXI,
    { addChild() {} }
  );
  p.update(100);
  expect(p.currentWeirdBehavior).toBe('courtshipCoo');
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.courtshipCoo);
});

test('a temporary pigeon spawned already in EATING shows the eat animation from its very first frame', () => {
  // Mirrors Flock.js: _enterState(EATING) is called BEFORE attachSprite()
  // runs, since the sprite doesn't exist until the renderer's ticker attaches
  // it on a later tick.
  const p = new Pigeon(FULL_SPRITESHEET, { x: 0, y: 0 }, { bounds: { width: 800, height: 600 } });
  p._enterState(STATES.EATING); // sprite is null here — must not throw
  p.attachSprite(
    MOCK_PIXI,
    { addChild() {} }
  );
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.eat);
});

test('random walk targets a corner other than the one the pigeon is already nearest to', () => {
  const p = makeAttachedPigeon(50, 50, { idleDurationMs: 100, walkSpeed: 1000 });
  // (50,50) is nearest the top-left corner (margin 50,50 with the 100x100 mock sprite).
  p.update(150); // crosses idleDurationMs, triggers the corner-walk
  expect(p.getState()).toBe(STATES.WALKING);
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.walk);
  // With walkSpeed this fast, one more tick should essentially complete the walk.
  p.update(10000);
  expect(p.getState()).toBe(STATES.IDLE);
  // Must have actually moved away from the top-left corner it started at.
  expect(Math.hypot(p.x - 50, p.y - 50)).toBeGreaterThan(200);
  // And must have landed near one of the OTHER three corners, not back at start.
  const corners = [[50, 50], [750, 50], [50, 550], [750, 550]];
  const distances = corners.map(([cx, cy]) => Math.hypot(p.x - cx, p.y - cy));
  expect(Math.min(...distances)).toBeLessThan(5);
  expect(distances[0]).toBeGreaterThan(5); // did not just walk back to top-left
});

test('a bounds-less pigeon falls back to the old stationary, fixed-duration WALKING', () => {
  const p = new Pigeon(null, { x: 0, y: 0 }, { idleDurationMs: 100, walkDurationMs: 200, rng: () => 0.9 });
  p.update(150);
  expect(p.getState()).toBe(STATES.WALKING);
  const xBeforeWalking = p.x;
  p.update(50); // still short of walkDurationMs — must not move (no corner target exists)
  expect(p.x).toBe(xBeforeWalking);
  expect(p.getState()).toBe(STATES.WALKING);
  p.update(200); // now past walkDurationMs
  expect(p.getState()).toBe(STATES.IDLE);
});

test('endDrag near a corner just goes IDLE, no walk', () => {
  const p = makeAttachedPigeon(50, 50); // sitting almost exactly on the top-left corner
  p.startDrag();
  p.endDrag();
  expect(p.getState()).toBe(STATES.IDLE);
  expect(p.x).toBe(50);
  expect(p.y).toBe(50);
});

test('endDrag away from any corner walks to the nearest one instead of idling in place', () => {
  const p = makeAttachedPigeon(400, 300, { walkSpeed: 1000 }); // dead center of an 800x600 screen
  p.startDrag();
  p.endDrag();
  expect(p.getState()).toBe(STATES.WALKING);
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.walk);
  p.update(10000); // fast walkSpeed — should arrive well within this
  expect(p.getState()).toBe(STATES.IDLE);
  const corners = [[50, 50], [750, 50], [50, 550], [750, 550]];
  const distances = corners.map(([cx, cy]) => Math.hypot(p.x - cx, p.y - cy));
  expect(Math.min(...distances)).toBeLessThan(5); // landed on some corner
});

test('walk sprite mirrors to face the direction it is actually walking (walk faces left natively)', () => {
  const p = makeAttachedPigeon(400, 300);
  p.flyTo({ x: 700, y: 300 }, 1000, { state: STATES.WALKING }); // moving right
  expect(p.sprite.scale.x).toBe(-1); // walk's native art faces left, so moving right must mirror it

  p.flyTo({ x: 100, y: 300 }, 1000, { state: STATES.WALKING }); // moving left
  expect(p.sprite.scale.x).toBe(1); // native left-facing art, no mirror needed
});

test('flyIn/flyOut sprites face right natively, so moving right needs no mirror', () => {
  const p = makeAttachedPigeon(0, 300);
  p.flyTo({ x: 400, y: 300 }, 1000, { state: STATES.COMMUTE_IN }); // moving right
  expect(p.sprite.scale.x).toBe(1); // flyIn already faces right — no mirror

  p.flyTo({ x: 0, y: 300 }, 1000, { state: STATES.COMMUTE_OUT }); // moving left
  expect(p.sprite.scale.x).toBe(-1); // flyOut faces right natively, moving left must mirror it
});

test('purely vertical movement (directionX === 0) leaves the current facing untouched', () => {
  const p = makeAttachedPigeon(400, 100);
  p.flyTo({ x: 700, y: 100 }, 1000, { state: STATES.WALKING }); // face right (mirrored)
  expect(p.sprite.scale.x).toBe(-1);
  p.flyTo({ x: 700, y: 500 }, 1000, { state: STATES.WALKING }); // same x, only y changes
  expect(p.sprite.scale.x).toBe(-1); // unchanged, not reset to native
});

test('scatterAwayFrom mirrors flyOut to face the actual flee direction', () => {
  const p = makeAttachedPigeon(400, 300);
  p.scatterAwayFrom({ x: 500, y: 300 }); // cursor to the right -> flee left
  expect(p.sprite.scale.x).toBe(-1); // flyOut faces right natively, fleeing left must mirror it
});

test('WEIRD_BEHAVIOR no longer triggers while WALKING, only while genuinely IDLE', () => {
  const p = makeAttachedPigeon(400, 300, {
    idleDurationMs: 1_000_000, // never auto-walk during this test
    weirdBehaviorIntervalMs: 100,
    rng: () => 0,
  });
  p.flyTo({ x: 700, y: 300 }, 10_000, { state: STATES.WALKING }); // put it mid-walk
  p.update(200); // past weirdBehaviorIntervalMs, but still mid-walk
  expect(p.getState()).toBe(STATES.WALKING); // must NOT have been interrupted

  p._enterState(STATES.IDLE);
  p.weirdBehaviorTimerMs = 0;
  p.update(200); // now genuinely idle — should trigger
  expect(p.getState()).toBe(STATES.WEIRD_BEHAVIOR);
});

test('default idleDurationMs is 25 minutes, so the pigeon dwells at a corner a long while before walking again', () => {
  // idleDurationMs left at its default; weirdBehaviorIntervalMs pushed out so
  // it doesn't fire first and mask the idle-duration threshold being tested.
  const p = makeAttachedPigeon(50, 50, { rng: () => 0.9, weirdBehaviorIntervalMs: 1_000_000_000 });
  const TWENTY_FIVE_MIN_MS = 25 * 60 * 1000;
  p.update(TWENTY_FIVE_MIN_MS - 1);
  expect(p.getState()).toBe(STATES.IDLE); // not yet
  p.update(1);
  expect(p.getState()).toBe(STATES.WALKING); // just crossed 25 minutes
});

test('doze (oneLegDoze) lasts 5 minutes, far longer than the other weird behaviors', () => {
  const p = makeAttachedPigeon(0, 0, {
    idleDurationMs: 1_000_000,
    weirdBehaviorIntervalMs: 100,
    rng: () => 0.4, // picks 'oneLegDoze' (index 2 of 5 behaviors)
  });
  p.update(100);
  expect(p.currentWeirdBehavior).toBe('oneLegDoze');
  const FIVE_MIN_MS = 5 * 60 * 1000;
  p.update(FIVE_MIN_MS - 1);
  expect(p.getState()).toBe(STATES.WEIRD_BEHAVIOR); // still dozing
  p.update(1);
  expect(p.getState()).toBe(STATES.IDLE); // just crossed 5 minutes
});

test('weird-behavior animations play at a slower cadence than normal ones', () => {
  const p = makeAttachedPigeon(0, 0, {
    idleDurationMs: 1_000_000,
    weirdBehaviorIntervalMs: 100,
    rng: () => 0, // picks 'flipOver'
  });
  const normalSpeed = p.sprite.animationSpeed; // currently idle
  p.update(100);
  expect(p.getState()).toBe(STATES.WEIRD_BEHAVIOR);
  expect(p.sprite.animationSpeed).toBeLessThan(normalSpeed);
});

test('walkToRandomCorner immediately starts a fast walk, bypassing the idle-duration wait', () => {
  const p = makeAttachedPigeon(400, 300, { idleDurationMs: 1_000_000_000 }); // would never auto-walk
  const started = p.walkToRandomCorner();
  expect(started).toBe(true);
  expect(p.getState()).toBe(STATES.WALKING);
  expect(p.sprite.textures).toBe(FULL_SPRITESHEET.frames.walk);
});

test('walkToRandomCorner uses fastWalkSpeed by default, much quicker than the normal walkSpeed', () => {
  const p = makeAttachedPigeon(400, 300, { walkSpeed: 0.06, fastWalkSpeed: 0.35 });
  p.walkToRandomCorner();
  // At fastWalkSpeed the ~400px trip from center to a corner finishes well
  // under 2s; at the normal (5-6x slower) walkSpeed it would still be
  // mid-flight at this point.
  p.update(2000);
  expect(p.getState()).toBe(STATES.IDLE);
});

test('walkToRandomCorner is a no-op when bounds are unknown', () => {
  const p = new Pigeon(FULL_SPRITESHEET, { x: 0, y: 0 });
  const started = p.walkToRandomCorner();
  expect(started).toBe(false);
  expect(p.getState()).toBe(STATES.IDLE);
});
