const { app, ipcMain, dialog } = require('electron');
const fs = require('fs');
const { createOverlayWindow, setClickThroughExceptRegion } = require('./overlayWindow');
const { createTray } = require('./tray');
const { IPC } = require('./ipcChannels');
const { startActiveWindowWatcher } = require('./activeWindowWatcher');
const { startWeatherPolling } = require('./weather');
const { openCameraWindow } = require('./cameraWindow');

let overlayWin;
let tray;
let commuteOutTriggered = false;

app.whenReady().then(() => {
  overlayWin = createOverlayWindow();

  startActiveWindowWatcher(() => {
    overlayWin.webContents.send(IPC.FOCUS_CHANGED);
  });

  startWeatherPolling(({ condition }) => {
    overlayWin.webContents.send(IPC.WEATHER_UPDATED, condition);
  });

  ipcMain.on('cursor-over-hitbox', (_event, isOverHitbox) => {
    setClickThroughExceptRegion(overlayWin, isOverHitbox);
  });

  ipcMain.on('feed-mode-active', (_event, isActive) => {
    setClickThroughExceptRegion(overlayWin, isActive ? { x: 0, y: 0, width: 99999, height: 99999 } : false);
  });

  overlayWin.webContents.once('did-finish-load', () => {
    overlayWin.webContents.send(IPC.COMMUTE_IN);
  });

  ipcMain.once('commute-out-animation-done', () => app.quit());

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

  tray = createTray(
    () => overlayWin.webContents.send(IPC.FEED_TRIGGERED),
    () => openCameraWindow(),
    () => {
      if (commuteOutTriggered) return;
      commuteOutTriggered = true;
      overlayWin.webContents.send(IPC.COMMUTE_OUT);
    }
  );
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
