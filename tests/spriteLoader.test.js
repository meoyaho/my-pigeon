const { ANIMATION_FRAME_COUNTS, getAnimationNames } = require('../renderer/pigeon/spriteLoader');

test('exposes exactly the 13 required animation names', () => {
  const names = getAnimationNames();
  expect(names.sort()).toEqual([
    'courtshipCoo', 'dragged', 'eat', 'featherOnHead', 'flipOver',
    'flyIn', 'flyOut', 'hopInPlace', 'idle', 'oneLegDoze',
    'startled', 'walk', 'weatherHuddle',
  ].sort());
});

test('frame counts match spec', () => {
  expect(ANIMATION_FRAME_COUNTS.idle).toBe(2);
  expect(ANIMATION_FRAME_COUNTS.walk).toBe(2);
  expect(ANIMATION_FRAME_COUNTS.flipOver).toBe(3);
});
