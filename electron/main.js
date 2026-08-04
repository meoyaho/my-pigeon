const { app, ipcMain } = require('electron');
const { createOverlayWindow, setClickThroughExceptRegion } = require('./overlayWindow');

let overlayWin;

app.whenReady().then(() => {
  overlayWin = createOverlayWindow();

  ipcMain.on('cursor-over-hitbox', (_event, isOverHitbox) => {
    setClickThroughExceptRegion(overlayWin, isOverHitbox);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
