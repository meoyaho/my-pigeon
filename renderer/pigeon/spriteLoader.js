const ANIMATION_FRAME_COUNTS = {
  idle: 2,
  walk: 4,
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

// Builds a placeholder spritesheet: for each animation, a set of small
// PIXI.Graphics-rendered textures (colored pixel blocks) so the FSM and
// rendering pipeline are fully wired and visually testable before real
// pixel art exists. Swapping in a real spritesheet later only requires
// replacing this function's body — callers only see frames[name] arrays.
function buildPlaceholderSpritesheet(PIXI, renderer) {
  const frames = {};
  const colors = [0x8b7d6b, 0xa89a8a, 0x6b5d4d, 0xc4b8a8]; // pigeon-ish grays/browns

  for (const [name, count] of Object.entries(ANIMATION_FRAME_COUNTS)) {
    frames[name] = [];
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      g.beginFill(colors[i % colors.length]);
      g.drawRoundedRect(0, 0, 24, 24, 4);
      g.endFill();
      // Small offset per frame so animations visibly change (placeholder motion cue).
      g.beginFill(0x2b2b2b);
      g.drawCircle(16 + (i % 2 === 0 ? 0 : 2), 8, 2);
      g.endFill();
      frames[name].push(renderer.generateTexture(g));
    }
  }
  return { frames };
}

module.exports = { ANIMATION_FRAME_COUNTS, getAnimationNames, buildPlaceholderSpritesheet };
