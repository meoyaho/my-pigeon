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

// region: {x,y,width,height} in window-local coords, or null for fully click-through.
// Electron has no native "click-through except a rect" primitive, so we approximate
// it by toggling ignoreMouseEvents based on whether the last known cursor position
// (tracked in the renderer via mousemove and reported over IPC) is inside `region`.
// This function only performs the toggle; callers decide when to invoke it.
function setClickThroughExceptRegion(win, insideRegion) {
  win.setIgnoreMouseEvents(!insideRegion, { forward: true });
}

module.exports = { createOverlayWindow, setClickThroughExceptRegion };
