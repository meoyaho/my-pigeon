const { app, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { createOverlayWindow, setClickThroughExceptRegion } = require('./overlayWindow');
const { createTray } = require('./tray');
const { IPC } = require('./ipcChannels');
const { startActiveWindowWatcher } = require('./activeWindowWatcher');
const { startWeatherPolling } = require('./weather');
const { openCameraWindow } = require('./cameraWindow');

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

function handlePhoto() {
  openCameraWindow();
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

    overlayWin.webContents.once('did-finish-load', () => {
      overlayWin.webContents.send(IPC.COMMUTE_IN);
    });

    ipcMain.once('commute-out-animation-done', () => quitOnce());

    ipcMain.handle('save-photo', async (_event, dataUrl) => {
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: 'pigeon-photo.png',
        filters: [{ name: 'PNG Image', extensions: ['png'] }],
      });
      if (!filePath) return { saved: false };
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(filePath, base64, 'base64');
      return { saved: true, filePath };
    });

    tray = createTray(handleFeed, handlePhoto, handleCommuteOut);

    const contextMenu = Menu.buildFromTemplate([
      { label: '먹이 주기', click: handleFeed },
      { label: '사진 찍기', click: handlePhoto },
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
