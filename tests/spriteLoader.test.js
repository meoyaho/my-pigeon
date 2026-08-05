const { ANIMATION_FRAME_COUNTS, getAnimationNames, applyFrameSequence } = require('../renderer/pigeon/spriteLoader');

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

test('flipOver plays 01->02->03->02->03->02->03 instead of a plain 01->02->03 loop', () => {
  const baseFrames = ['f01', 'f02', 'f03'];
  expect(applyFrameSequence('flipOver', baseFrames)).toEqual([
    'f01', 'f02', 'f03', 'f02', 'f03', 'f02', 'f03',
  ]);
});

test('animations with no override just play their base frames in order', () => {
  const baseFrames = ['a01', 'a02'];
  expect(applyFrameSequence('idle', baseFrames)).toBe(baseFrames);
});
