const OFF_DUTY_STORAGE_KEY = 'myPigeonOffDuty';
const STUDY_STORAGE_KEY = 'myPigeonStudySession';
const ACTOR_STORAGE_KEY = 'myPigeonActorState';

const enabled = document.getElementById('enabled');
const status = document.getElementById('status');
const commuteIn = document.getElementById('commute-in');

const state = {
  enabled: true,
  offDuty: false,
};

function emptyStudySession() {
  return {
    startedAt: 0,
    rewardAvailable: false,
    flapCount: 0,
    focusedMinutes: 0,
    completedAt: 0,
    restNoticeId: 0,
    restUntil: 0,
  };
}

function render() {
  enabled.checked = state.enabled;
  commuteIn.hidden = !state.offDuty;
  status.textContent = state.offDuty ? '집에 있음' : '근무 중';
}

function loadSettings() {
  chrome.storage.sync.get({ enabled: true }, (syncSettings) => {
    state.enabled = syncSettings.enabled !== false;
    chrome.storage.local.get({ [OFF_DUTY_STORAGE_KEY]: false }, (localSettings) => {
      state.offDuty = localSettings[OFF_DUTY_STORAGE_KEY] === true;
      render();
    });
  });
}

enabled.addEventListener('change', () => {
  state.enabled = enabled.checked;
  chrome.storage.sync.set({ enabled: state.enabled });
  render();
});

commuteIn.addEventListener('click', () => {
  state.enabled = true;
  state.offDuty = false;
  chrome.storage.local.set({
    [OFF_DUTY_STORAGE_KEY]: false,
    [STUDY_STORAGE_KEY]: emptyStudySession(),
  });
  chrome.storage.local.remove(ACTOR_STORAGE_KEY);
  chrome.storage.sync.set({ enabled: true });
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) {
    state.enabled = changes.enabled.newValue !== false;
  }
  if (area === 'local' && changes[OFF_DUTY_STORAGE_KEY]) {
    state.offDuty = changes[OFF_DUTY_STORAGE_KEY].newValue === true;
  }
  render();
});

loadSettings();
