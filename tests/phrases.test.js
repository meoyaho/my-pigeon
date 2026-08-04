const { COMMUTE_IN_PHRASES, COMMUTE_OUT_PHRASES, pickCommuteInPhrase, pickCommuteOutPhrase } = require('../renderer/pigeon/phrases');

test('has at least 4 phrases in each pool', () => {
  expect(COMMUTE_IN_PHRASES.length).toBeGreaterThanOrEqual(4);
  expect(COMMUTE_OUT_PHRASES.length).toBeGreaterThanOrEqual(4);
});

test('pickCommuteInPhrase returns a phrase from the pool', () => {
  expect(COMMUTE_IN_PHRASES).toContain(pickCommuteInPhrase(() => 0));
});

test('pickCommuteOutPhrase returns a phrase from the pool', () => {
  expect(COMMUTE_OUT_PHRASES).toContain(pickCommuteOutPhrase(() => 0.99));
});
