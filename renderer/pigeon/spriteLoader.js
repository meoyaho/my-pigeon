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

// Loads the real cutout spritesheet: for each animation, the PNG frames at
// assets/sprites/<name>_<NN>.png (background-removed, cropped to content).
// Kept as `buildPlaceholderSpritesheet` for backward-compat naming with the
// original placeholder-era call sites; callers only see frames[name] arrays,
// so this is the only place that needs to change if art is swapped again.
async function buildPlaceholderSpritesheet(PIXI) {
  const frames = {};
  for (const [name, count] of Object.entries(ANIMATION_FRAME_COUNTS)) {
    frames[name] = [];
    for (let i = 1; i <= count; i++) {
      const framePath = path.join(SPRITES_DIR, `${name}_${String(i).padStart(2, '0')}.png`);
      const texture = await PIXI.Assets.load(framePath);
      frames[name].push(texture);
    }
  }
  return { frames };
}

module.exports = { ANIMATION_FRAME_COUNTS, getAnimationNames, buildPlaceholderSpritesheet };
