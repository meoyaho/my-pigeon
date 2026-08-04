const { STATES, WEIRD_BEHAVIORS, pickRandomWeirdBehavior } = require('../renderer/pigeon/states');

test('has exactly the 5 spec-required weird behaviors', () => {
  expect(WEIRD_BEHAVIORS.sort()).toEqual(
    ['flipOver', 'featherOnHead', 'oneLegDoze', 'courtshipCoo', 'hopInPlace'].sort()
  );
});

test('pickRandomWeirdBehavior always returns a valid behavior', () => {
  const rng = () => 0; // deterministic
  expect(WEIRD_BEHAVIORS).toContain(pickRandomWeirdBehavior(rng));
});

test('pickRandomWeirdBehavior covers the full range', () => {
  const seen = new Set();
  for (let i = 0; i < WEIRD_BEHAVIORS.length; i++) {
    const rng = () => i / WEIRD_BEHAVIORS.length;
    seen.add(pickRandomWeirdBehavior(rng));
  }
  expect(seen.size).toBe(WEIRD_BEHAVIORS.length);
});

test('STATES has no duplicate values', () => {
  const values = Object.values(STATES);
  expect(new Set(values).size).toBe(values.length);
});
