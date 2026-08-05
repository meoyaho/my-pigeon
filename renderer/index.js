const PIXI = require('pixi.js');
const { buildPlaceholderSpritesheet } = require('./pigeon/spriteLoader');
const { Pigeon } = require('./pigeon/Pigeon');
const { STATES } = require('./pigeon/states');
const { showMessageBubble } = require('./pigeon/messageBubble');
const { pickCommuteInPhrase, pickCommuteOutPhrase } = require('./pigeon/phrases');
const { IPC } = require('../electron/ipcChannels');
const { MouseVelocityTracker, shouldScatter } = require('./interactions/mouseTracker');
const { attachDragHandlers } = require('./interactions/dragHandler');
const { FeedModeController } = require('./interactions/feedMode');
const { Flock } = require('./pigeon/flock');

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

  const spritesheet = await buildPlaceholderSpritesheet(PIXI);

  // Spawn off-screen at the left edge so COMMUTE_IN can fly it in to center —
  // matches where the pigeon will actually start before the fly-in animation.
  mainPigeon = new Pigeon(spritesheet, { x: -100, y: window.innerHeight / 2 }, {
    bounds: { width: window.innerWidth, height: window.innerHeight },
  });
  mainPigeon.attachSprite(PIXI, app.stage);
  // attachSprite() clamps to bounds on attach (so a pigeon dropped in mid-app
  // never spawns off-screen) — override that here since this specific spawn
  // is deliberately off-screen, waiting for the COMMUTE_IN fly-in.
  mainPigeon.x = -100;
  mainPigeon.y = window.innerHeight / 2;
  mainPigeon.sprite.x = mainPigeon.x;
  mainPigeon.sprite.y = mainPigeon.y;

  attachDragHandlers(mainPigeon);
  mainPigeon.sprite.on('pointerover', () => window.pigeonBridge.send('cursor-over-hitbox', true));
  mainPigeon.sprite.on('pointerout', () => window.pigeonBridge.send('cursor-over-hitbox', false));
  // Right-click the pigeon to reveal the same 먹이 주기/사진 찍기/퇴근 menu as the
  // tray icon — surfaces the app's controls without any always-visible UI chrome.
  mainPigeon.sprite.on('rightdown', () => window.pigeonBridge.send('show-context-menu'));
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  const flock = new Flock(mainPigeon);
  const temporarySprites = new Map();

  const feedMode = new FeedModeController();

  window.pigeonBridge.on(IPC.FEED_TRIGGERED, () => {
    feedMode.start();
    document.body.style.cursor = 'crosshair';
    window.pigeonBridge.send('feed-mode-active', true); // main makes whole window clickable
  });

  window.addEventListener('click', (e) => {
    const point = feedMode.handleClick({ x: e.clientX, y: e.clientY });
    if (point) {
      document.body.style.cursor = 'default';
      window.pigeonBridge.send('feed-mode-active', false);
      window.pigeonBridge.send(IPC.FEED_PLACED, point);
    }
  });

  window.pigeonBridge.on(IPC.FEED_PLACED, (point) => {
    flock.startFeeding(point);
  });

  window.pigeonBridge.on(IPC.FOCUS_CHANGED, () => {
    mainPigeon.maybeStartle();
    for (const pigeon of flock.getTemporaryPigeons()) pigeon.maybeStartle();
  });

  window.pigeonBridge.on(IPC.WEATHER_UPDATED, (condition) => {
    mainPigeon.setWeather(condition);
    for (const pigeon of flock.getTemporaryPigeons()) pigeon.setWeather(condition);
  });

  app.ticker.add(() => {
    const deltaMs = app.ticker.deltaMS;
    feedMode.tick(deltaMs);
    if (!feedMode.isActive() && document.body.style.cursor === 'crosshair') {
      document.body.style.cursor = 'default';
      window.pigeonBridge.send('feed-mode-active', false);
    }
    flock.update(deltaMs);

    // Sync sprite position from each pigeon's FSM-internal x/y — the FSM (e.g.
    // Flock.startFeeding, SCATTERING) mutates x/y directly and never touches
    // sprite.x/y itself, so without this the sprite would never actually move.
    if (mainPigeon.sprite) {
      mainPigeon.sprite.x = mainPigeon.x;
      mainPigeon.sprite.y = mainPigeon.y;
    }

    // Sync Pixi sprites for temporary pigeons with the flock's current list.
    const current = new Set(flock.getTemporaryPigeons());
    for (const pigeon of flock.getTemporaryPigeons()) {
      if (!temporarySprites.has(pigeon)) {
        pigeon.attachSprite(PIXI, app.stage);
        temporarySprites.set(pigeon, pigeon.sprite);
      }
      if (pigeon.sprite) {
        pigeon.sprite.x = pigeon.x;
        pigeon.sprite.y = pigeon.y;
      }
    }
    for (const [pigeon, sprite] of temporarySprites) {
      if (!current.has(pigeon)) {
        app.stage.removeChild(sprite);
        sprite.destroy();
        temporarySprites.delete(pigeon);
      }
    }
  });

  const mouseTracker = new MouseVelocityTracker();
  window.addEventListener('mousemove', (e) => {
    mouseTracker.recordSample({ x: e.clientX, y: e.clientY, tMs: performance.now() });
    const velocity = mouseTracker.getVelocity();
    const temporaryPigeons = flock.getTemporaryPigeons();
    // 훠이훠이 only scatters a gathered flock (feeding in progress) — a lone
    // main pigeon just wandering around isn't affected by fast mouse moves.
    if (shouldScatter(velocity) && temporaryPigeons.length > 0) {
      mainPigeon.scatterAwayFrom({ x: e.clientX, y: e.clientY });
      for (const pigeon of temporaryPigeons) {
        pigeon.scatterAwayFrom({ x: e.clientX, y: e.clientY });
      }
    }
  });

  window.pigeonBridge.on(IPC.COMMUTE_IN, () => {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    // Fly in from the left edge (where the pigeon spawned) to screen center,
    // then show the greeting bubble once it has actually arrived.
    mainPigeon.flyTo({ x: centerX, y: centerY }, 1200, {
      state: STATES.COMMUTE_IN,
      arriveState: STATES.IDLE,
      onComplete: () => {
        showMessageBubble(PIXI, app.stage, {
          x: mainPigeon.sprite.x,
          y: mainPigeon.sprite.y,
          text: pickCommuteInPhrase(),
        });
      },
    });
  });

  window.pigeonBridge.on(IPC.COMMUTE_OUT, () => {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    // Move to center first, show the farewell bubble once arrived, hold it
    // long enough to read, then fly off the right edge and quit.
    mainPigeon.flyTo({ x: centerX, y: centerY }, 700, {
      state: STATES.COMMUTE_OUT,
      onComplete: () => {
        showMessageBubble(PIXI, app.stage, {
          x: mainPigeon.sprite.x,
          y: mainPigeon.sprite.y,
          text: pickCommuteOutPhrase(),
        });
        setTimeout(() => {
          const rightX = window.innerWidth + 150;
          mainPigeon.flyTo({ x: rightX, y: mainPigeon.y }, 1000, {
            state: STATES.COMMUTE_OUT,
            onComplete: () => {
              window.pigeonBridge.send('commute-out-animation-done');
            },
          });
        }, 2200); // let the bubble show before flying off
      },
    });
  });

  // Tell main every listener above (especially COMMUTE_IN) is registered and
  // ready to receive — sending COMMUTE_IN any earlier than this races ahead
  // of app.init()/texture loading and gets lost.
  window.pigeonBridge.send('renderer-ready');
})();

module.exports = { getMainPigeon };
