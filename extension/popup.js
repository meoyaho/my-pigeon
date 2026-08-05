const enabled = document.getElementById('enabled');

chrome.storage.sync.get({ enabled: true }, (settings) => {
  enabled.checked = settings.enabled !== false;
});

enabled.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabled.checked });
});
