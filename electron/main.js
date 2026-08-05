const { app, ipcMain } = require('electron');
const { createOverlayWindow, setClickThroughExceptRegion } = require('./overlayWindow');
const { createTray } = require('./tray');
const { IPC } = require('./ipcChannels');

let overlayWin;

app.whenReady().then(() => {
  overlayWin = createOverlayWindow();

  ipcMain.on('cursor-over-hitbox', (_event, isOverHitbox) => {
    setClickThroughExceptRegion(overlayWin, isOverHitbox);
  });

  overlayWin.webContents.once('did-finish-load', () => {
    overlayWin.webContents.send(IPC.COMMUTE_IN);
  });

  createTray(
    () => overlayWin.webContents.send(IPC.FEED_TRIGGERED),
    () => { /* wired in Task 12 */ },
    () => {
      overlayWin.webContents.send(IPC.COMMUTE_OUT);
      ipcMain.once('commute-out-animation-done', () => app.quit());
    }
  );
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
