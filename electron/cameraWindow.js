const { BrowserWindow } = require('electron');
const path = require('path');

let cameraWin = null;

function openCameraWindow() {
  if (cameraWin) {
    cameraWin.focus();
    return cameraWin;
  }
  cameraWin = new BrowserWindow({
    width: 480,
    height: 420,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true,
    },
  });
  cameraWin.loadFile(path.join(__dirname, '..', 'renderer', 'camera.html'));
  cameraWin.on('closed', () => { cameraWin = null; });
  return cameraWin;
}

module.exports = { openCameraWindow };
