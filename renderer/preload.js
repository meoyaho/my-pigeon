const { ipcRenderer } = require('electron');

window.pigeonBridge = {
  send: (channel, payload) => ipcRenderer.send(channel, payload),
  invoke: (channel, payload) => ipcRenderer.invoke(channel, payload),
  on: (channel, callback) => ipcRenderer.on(channel, (_event, payload) => callback(payload)),
};
