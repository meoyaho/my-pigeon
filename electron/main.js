const { app, ipcMain } = require('electron');
const { createOverlayWindow, setClickThroughExceptRegion } = require('./overlayWindow');
const { createTray } = require('./tray');
const { IPC } = require('./ipcChannels');
const { startActiveWindowWatcher } = require('./activeWindowWatcher');

let overlayWin;
let tray;
let commuteOutTriggered = false;

app.whenReady().then(() => {
  overlayWin = createOverlayWindow();

  startActiveWindowWatcher(() => {
    overlayWin.webContents.send(IPC.FOCUS_CHANGED);
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

  tray = createTray(
    () => overlayWin.webContents.send(IPC.FEED_TRIGGERED),
    () => { /* wired in Task 12 */ },
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
