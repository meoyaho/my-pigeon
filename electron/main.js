const { app, ipcMain, Menu } = require('electron');
const path = require('path');
const { createOverlayWindow, setClickThroughExceptRegion } = require('./overlayWindow');
const { createTray } = require('./tray');
const { IPC } = require('./ipcChannels');
const { startActiveWindowWatcher } = require('./activeWindowWatcher');
const { startWeatherPolling } = require('./weather');

const APP_PROTOCOL = 'pigeonpet';

let overlayWin;
let tray;
let commuteOutTriggered = false;
let quitTimeout = null;
let cursorOverHitbox = false;
let feedModeActive = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

function registerAppProtocol() {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
    return;
  }

  app.setAsDefaultProtocolClient(APP_PROTOCOL);
}

function bringOverlayForward() {
  if (!overlayWin) return;
  if (overlayWin.isMinimized()) overlayWin.restore();
  overlayWin.show();
}

function updateClickThrough() {
  setClickThroughExceptRegion(overlayWin, cursorOverHitbox || feedModeActive);
}

function quitOnce() {
  if (quitTimeout) {
    clearTimeout(quitTimeout);
    quitTimeout = null;
  }
  app.quit();
}

// Shared by both the tray menu and the pigeon's right-click context menu, so
// the two entry points can never drift apart.
function handleFeed() {
  overlayWin.webContents.send(IPC.FEED_TRIGGERED);
}

function handleCommuteOut() {
  if (commuteOutTriggered) return;
  commuteOutTriggered = true;
  overlayWin.webContents.send(IPC.COMMUTE_OUT);
  // Fallback: if the renderer never responds with commute-out-animation-done
  // (crashed, hung, etc.), still quit within ~6s so the user always has a way
  // to close the app. The real commute-out choreography (move to center ~0.7s
  // + bubble hold ~2.2s + fly out ~1s ≈ 3.9s) needs headroom under this, so
  // don't shrink it without also shrinking that timeline. quitOnce() clears
  // this timer if the normal path fires first, and app.quit() itself is safe
  // to call more than once.
  quitTimeout = setTimeout(() => quitOnce(), 6000);
}

if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    bringOverlayForward();
  });

  app.on('open-url', (event) => {
    event.preventDefault();
    bringOverlayForward();
  });

  app.whenReady().then(() => {
    registerAppProtocol();

    overlayWin = createOverlayWindow();

    startActiveWindowWatcher(() => {
      overlayWin.webContents.send(IPC.FOCUS_CHANGED);
    });

    startWeatherPolling(({ condition }) => {
      overlayWin.webContents.send(IPC.WEATHER_UPDATED, condition);
    });

    ipcMain.on('cursor-over-hitbox', (_event, isOverHitbox) => {
      cursorOverHitbox = isOverHitbox;
      updateClickThrough();
    });

    ipcMain.on('feed-mode-active', (_event, isActive) => {
      feedModeActive = isActive;
      updateClickThrough();
    });

    ipcMain.on(IPC.FEED_PLACED, (_event, point) => {
      overlayWin.webContents.send(IPC.FEED_PLACED, point);
    });

    // NOT 'did-finish-load' — that fires as soon as the page's <script> tag
    // returns (near-instant, since the renderer's async IIFE just starts and
    // returns a promise). The renderer still has to await app.init() and
    // sequentially load ~27 real sprite textures before it registers the
    // COMMUTE_IN listener, so sending on did-finish-load raced ahead of that
    // and was sent into the void — the pigeon just sat at its off-screen
    // spawn point forever. Wait for the renderer's own explicit ready signal
    // instead, sent once every listener (including COMMUTE_IN) is wired up.
    ipcMain.once('renderer-ready', () => {
      overlayWin.webContents.send(IPC.COMMUTE_IN);
    });

    ipcMain.once('commute-out-animation-done', () => quitOnce());

    tray = createTray(handleFeed, handleCommuteOut);

    const contextMenu = Menu.buildFromTemplate([
      { label: '먹이 주기', click: handleFeed },
      { label: '퇴근', click: handleCommuteOut },
    ]);

    ipcMain.on('show-context-menu', () => {
      contextMenu.popup({ window: overlayWin });
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
