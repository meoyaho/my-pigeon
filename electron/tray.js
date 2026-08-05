const { Tray, Menu } = require('electron');
const path = require('path');

function createTray(onFeed, onCommuteOut) {
  const tray = new Tray(path.join(__dirname, '..', 'assets', 'tray-icon.png'));
  const menu = Menu.buildFromTemplate([
    { label: '먹이 주기', click: onFeed },
    { label: '퇴근', click: onCommuteOut },
  ]);
  tray.setToolTip('My Pigeon');
  tray.setContextMenu(menu);
  return tray;
}

module.exports = { createTray };
