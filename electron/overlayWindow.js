const { BrowserWindow, screen } = require('electron');
const path = require('path');

function createOverlayWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return win;
}

// insideRegion: boolean. true = at least one interactive condition holds (cursor is
// over the pigeon's hitbox, and/or feed-placement mode is active), so mouse events
// should be captured by the window. false = fully click-through, so events pass to
// whatever desktop app is beneath the overlay. Callers (main.js) OR together every
// boolean input that wants to claim clicks and pass the combined result here; this
// function only performs the toggle, it does no arbitration itself.
function setClickThroughExceptRegion(win, insideRegion) {
  win.setIgnoreMouseEvents(!insideRegion, { forward: true });
}

module.exports = { createOverlayWindow, setClickThroughExceptRegion };
