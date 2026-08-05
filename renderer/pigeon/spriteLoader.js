const path = require('path');

const ANIMATION_FRAME_COUNTS = {
  idle: 2,
  walk: 2,
  flipOver: 3,
  featherOnHead: 2,
  oneLegDoze: 2,
  courtshipCoo: 3,
  hopInPlace: 2,
  flyIn: 3,
  flyOut: 3,
  eat: 2,
  startled: 2,
  weatherHuddle: 2,
  dragged: 1,
};

function getAnimationNames() {
  return Object.keys(ANIMATION_FRAME_COUNTS);
}

const SPRITES_DIR = path.join(__dirname, '..', '..', 'assets', 'sprites');

// Some animations play a custom, non-sequential frame order instead of a
// straight 01->02->03 loop. Indices are 0-based into the animation's base
// frame list (flipOver_01/02/03 -> indices 0/1/2). flipOver plays the flip
// once (01->02->03) then wobbles between "legs up" and "on its back" a few
// times (02<->03) before the whole thing loops back to frame 01 again.
const FRAME_SEQUENCE_OVERRIDES = {
  flipOver: [0, 1, 2, 1, 2, 1, 2],
};

// Applies a FRAME_SEQUENCE_OVERRIDES entry (if any) to a loaded base frame
// list. Pure and PIXI-free so it's unit-testable without loading real
// textures — exported for that reason.
function applyFrameSequence(name, baseFrames) {
  const sequence = FRAME_SEQUENCE_OVERRIDES[name];
  if (!sequence) return baseFrames;
  return sequence.map((index) => baseFrames[index]);
}

// Loads the real cutout spritesheet: for each animation, the PNG frames at
// assets/sprites/<name>_<NN>.png (background-removed, cropped to content).
// Kept as `buildPlaceholderSpritesheet` for backward-compat naming with the
// original placeholder-era call sites; callers only see frames[name] arrays,
// so this is the only place that needs to change if art is swapped again.
async function buildPlaceholderSpritesheet(PIXI) {
  const frames = {};
  for (const [name, count] of Object.entries(ANIMATION_FRAME_COUNTS)) {
    const baseFrames = [];
    for (let i = 1; i <= count; i++) {
      const framePath = path.join(SPRITES_DIR, `${name}_${String(i).padStart(2, '0')}.png`);
      const texture = await PIXI.Assets.load(framePath);
      baseFrames.push(texture);
    }
    frames[name] = applyFrameSequence(name, baseFrames);
  }
  return { frames };
}

module.exports = {
  ANIMATION_FRAME_COUNTS,
  getAnimationNames,
  buildPlaceholderSpritesheet,
  FRAME_SEQUENCE_OVERRIDES,
  applyFrameSequence,
};
