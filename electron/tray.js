const { Tray, Menu } = require('electron');
const path = require('path');

function createTray(onFeed, onPhoto, onCommuteOut) {
  const tray = new Tray(path.join(__dirname, '..', 'assets', 'tray-icon.png'));
  const menu = Menu.buildFromTemplate([
    { label: '먹이 주기', click: onFeed },
    { label: '사진 찍기', click: onPhoto },
    { label: '퇴근', click: onCommuteOut },
  ]);
  tray.setToolTip('비둘기 펫');
  tray.setContextMenu(menu);
  return tray;
}

module.exports = { createTray };
