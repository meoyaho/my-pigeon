const PIXI = require('pixi.js');
const { buildPlaceholderSpritesheet } = require('./pigeon/spriteLoader');
const { Pigeon } = require('./pigeon/Pigeon');

// pixi.js 8.x moved Application setup to an async `init()` call; the constructor
// no longer accepts renderer options synchronously (that path is deprecated and,
// for a transparent/no-args-ready renderer, throws before `app.renderer`/`app.canvas`
// exist). We create the Application, then `init()` it before touching the canvas
// or stage. `transparent: true` was also removed from pixi.js v7+ in favor of
// `backgroundAlpha: 0`.
const app = new PIXI.Application();

let mainPigeon = null;

function getMainPigeon() {
  return mainPigeon;
}

(async () => {
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundAlpha: 0,
    antialias: true,
  });
  document.body.appendChild(app.canvas);
  window.__pigeonApp = app;

  const spritesheet = buildPlaceholderSpritesheet(PIXI, app.renderer);

  mainPigeon = new Pigeon(spritesheet, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  mainPigeon.attachSprite(PIXI, app.stage);

  app.ticker.add(() => {
    const deltaMs = app.ticker.deltaMS;
    mainPigeon.update(deltaMs);
  });
})();

module.exports = { getMainPigeon };
