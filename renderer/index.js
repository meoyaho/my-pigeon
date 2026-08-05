const PIXI = require('pixi.js');
const { buildPlaceholderSpritesheet } = require('./pigeon/spriteLoader');
const { Pigeon } = require('./pigeon/Pigeon');
const { showMessageBubble } = require('./pigeon/messageBubble');
const { pickCommuteInPhrase, pickCommuteOutPhrase } = require('./pigeon/phrases');
const { IPC } = require('../electron/ipcChannels');
const { MouseVelocityTracker, shouldScatter } = require('./interactions/mouseTracker');
const { attachDragHandlers } = require('./interactions/dragHandler');

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

  attachDragHandlers(mainPigeon);
  mainPigeon.sprite.on('pointerover', () => window.pigeonBridge.send('cursor-over-hitbox', true));
  mainPigeon.sprite.on('pointerout', () => window.pigeonBridge.send('cursor-over-hitbox', false));

  app.ticker.add(() => {
    const deltaMs = app.ticker.deltaMS;
    mainPigeon.update(deltaMs);
  });

  const mouseTracker = new MouseVelocityTracker();
  window.addEventListener('mousemove', (e) => {
    mouseTracker.recordSample({ x: e.clientX, y: e.clientY, tMs: performance.now() });
    const velocity = mouseTracker.getVelocity();
    if (shouldScatter(velocity)) {
      mainPigeon.scatterAwayFrom({ x: e.clientX, y: e.clientY });
    }
  });

  window.pigeonBridge.on(IPC.COMMUTE_IN, () => {
    showMessageBubble(PIXI, app.stage, {
      x: mainPigeon.sprite.x,
      y: mainPigeon.sprite.y,
      text: pickCommuteInPhrase(),
    });
  });

  window.pigeonBridge.on(IPC.COMMUTE_OUT, () => {
    showMessageBubble(PIXI, app.stage, {
      x: mainPigeon.sprite.x,
      y: mainPigeon.sprite.y,
      text: pickCommuteOutPhrase(),
    });
    setTimeout(() => {
      window.pigeonBridge.send('commute-out-animation-done');
    }, 3200); // let the bubble show before quitting
  });
})();

module.exports = { getMainPigeon };
