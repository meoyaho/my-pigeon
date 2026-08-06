const READY_MESSAGE = 'myPigeon:documentReady';
const ACTIVE_MESSAGE = 'myPigeon:setActive';
const CHROME_FOCUS_MESSAGE = 'myPigeon:chromeFocusChanged';

let activeTabId = 0;

function sendActiveState(tabId, active) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: ACTIVE_MESSAGE, active }, () => {
    void chrome.runtime.lastError;
  });
}

function sendChromeFocusState(tabId, focused) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: CHROME_FOCUS_MESSAGE, focused }, () => {
    void chrome.runtime.lastError;
  });
}

function notifyActiveTabChromeFocus(focused) {
  if (activeTabId) {
    sendChromeFocusState(activeTabId, focused);
    return;
  }

  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) return;
    const tabId = tabs[0]?.id;
    if (tabId) sendChromeFocusState(tabId, focused);
  });
}

function activateTab(tabId) {
  if (!tabId) return;
  activeTabId = tabId;
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError) {
      sendActiveState(tabId, true);
      return;
    }
    for (const tab of tabs) {
      if (tab.id) sendActiveState(tab.id, tab.id === tabId);
    }
  });
}

function activateFocusedTab() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) return;
    const tabId = tabs[0]?.id;
    if (tabId) activateTab(tabId);
  });
}

chrome.runtime.onInstalled.addListener(activateFocusedTab);
chrome.runtime.onStartup.addListener(activateFocusedTab);

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  chrome.windows.get(windowId, (windowInfo) => {
    if (chrome.runtime.lastError) return;
    if (windowInfo?.focused) activateTab(tabId);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.status === 'complete') {
    sendActiveState(tabId, true);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId !== activeTabId) return;
  activeTabId = 0;
  activateFocusedTab();
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    notifyActiveTabChromeFocus(false);
    return;
  }
  chrome.tabs.query({ active: true, windowId }, (tabs) => {
    if (chrome.runtime.lastError) return;
    const tabId = tabs[0]?.id;
    if (tabId) {
      activateTab(tabId);
      sendChromeFocusState(tabId, true);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== READY_MESSAGE) return false;

  const senderTabId = sender.tab?.id;
  if (!senderTabId) {
    sendResponse({ active: false });
    return false;
  }

  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (!chrome.runtime.lastError && tabs[0]?.id) {
      activeTabId = tabs[0].id;
    }
    const active = senderTabId === activeTabId;
    sendResponse({ active });
    if (active) sendActiveState(senderTabId, true);
  });
  return true;
});

activateFocusedTab();
