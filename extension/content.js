(() => {
  if (window.__myPigeonExtensionLoaded) return;
  window.__myPigeonExtensionLoaded = true;

  const ROOT_ID = 'my-pigeon-extension-root';
  const DEFAULTS = { enabled: true };
  const STUDY_STORAGE_KEY = 'myPigeonStudySession';
  const OFF_DUTY_STORAGE_KEY = 'myPigeonOffDuty';
  const ACTOR_STORAGE_KEY = 'myPigeonActorState';
  const READY_MESSAGE = 'myPigeon:documentReady';
  const ACTIVE_MESSAGE = 'myPigeon:setActive';
  const MAX_TEMPORARY_PIGEONS = 8;

  const CONFIG = {
    focusDurationMs: 25 * 60 * 1000,
    restDurationMs: 5 * 60 * 1000,
    idleDurationMs: 25 * 60 * 1000,
    weirdBehaviorIntervalMs: 15000,
    focusBehaviorIntervalMs: 4 * 60 * 1000,
    weirdBehaviorDurationMs: 2500,
    focusDozeDurationMs: 45000,
    oneLegDozeDurationMs: 5 * 60 * 1000,
    restMoveIntervalMs: 5500,
    walkSpeed: 0.06,
    flightSpeed: 0.35,
    hopSpeed: 0.06,
    hopProbability: 0.35,
    backwardsWalkProbability: 0.18,
    cornerArrivalThreshold: 80,
    spawnStaggerMs: 150,
    feedModeTimeoutMs: 5000,
    feedGatherMinRadius: 66,
    feedGatherMaxRadius: 130,
    restBubbleDurationMs: 4200,
    actorSyncIntervalMs: 800,
    scatterVelocityPxPerMs: 1.3,
  };

  const SPRITES = {
    idle: ['idle_01.png', 'idle_02.png'],
    walk: ['walk_01.png', 'walk_02.png'],
    hopInPlace: ['idle_01.png', 'hopInPlace.png'],
    flipOver: ['flipOver_01.png', 'flipOver_02.png', 'flipOver_03.png'],
    oneLegDoze: ['oneLegDoze_01.png', 'oneLegDoze_02.png'],
    courtshipCoo: ['courtshipCoo_01.png', 'courtshipCoo_02.png', 'courtshipCoo_03.png'],
    startled: ['startled_01.png'],
    dragged: ['dragged_01.png'],
    flyIn: ['flyIn_01.png', 'flyIn_02.png', 'flyIn_03.png'],
    flyOut: ['flyOut_01.png', 'flyOut_02.png', 'flyOut_03.png'],
    eat: ['eat_01.png', 'eat_02.png'],
  };

  const FRAME_INTERVAL_MS = {
    idle: 620,
    walk: 190,
    hopInPlace: 170,
    flipOver: 220,
    oneLegDoze: 900,
    courtshipCoo: 240,
    startled: 400,
    dragged: 400,
    flyIn: 120,
    flyOut: 120,
    eat: 260,
  };

  const WEIRD_BEHAVIORS = ['flipOver', 'oneLegDoze', 'courtshipCoo'];

  const WEIRD_BEHAVIOR_SEQUENCES = {
    flipOver: {
      intro: ['flipOver_01.png', 'flipOver_02.png', 'flipOver_03.png'],
      loop: ['flipOver_02.png', 'flipOver_03.png'],
      outro: ['flipOver_03.png', 'flipOver_02.png', 'flipOver_01.png'],
    },
    courtshipCoo: {
      intro: ['courtshipCoo_01.png', 'courtshipCoo_02.png', 'courtshipCoo_03.png'],
      loop: ['courtshipCoo_02.png', 'courtshipCoo_03.png'],
      outro: ['courtshipCoo_03.png', 'courtshipCoo_02.png', 'courtshipCoo_01.png'],
    },
  };

  const GREETINGS = [
    '오늘도 열심히 해보자고',
    '둥근해 또 떴네',
    '오늘 하루도 힘내자고',
    '자, 오늘도 시작해볼까',
    '나 신경 쓰지 말고 할일 해',
  ];

  const FAREWELLS = [
    '오늘도 수고했다',
    '내일 또 만나',
    '오늘 하루도 끝!',
    '쉬어, 나는 집 간다',
    '오늘 몫은 다 했다, 안녕!',
  ];

  const state = {
    host: null,
    shadow: null,
    main: null,
    tempActors: [],
    nextActorId: 1,
    remountAfterCommuteOut: false,
    enabled: true,
    offDuty: false,
    activeSurface: hasLocalFocus(),
    settingsLoaded: false,
    forceCommuteIn: false,
    menu: null,
    feedButton: null,
    feedStatus: null,
    feedLayer: null,
    food: null,
    bubbleTimer: null,
    timers: new Set(),
    raf: 0,
    lastTickAt: 0,
    nextActorPersistAt: 0,
    phase: 'normal',
    studyAlignmentSuppressedUntil: 0,
    feed: {
      choosing: false,
      feeding: false,
      point: null,
      spawnTimerMs: 0,
      spawnedCount: 0,
      timeoutId: null,
    },
    study: {
      startedAt: 0,
      rewardAvailable: false,
      flapCount: 0,
      focusedMinutes: 0,
      completedAt: 0,
      restNoticeId: 0,
      restUntil: 0,
    },
    mouse: {
      x: 0,
      y: 0,
      t: 0,
    },
  };

  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : null;
  const storage = typeof chrome !== 'undefined' ? chrome.storage : null;
  const studyStorage = storage?.local || null;

  function asset(path) {
    return runtime ? runtime.getURL(path) : path;
  }

  function spriteUrl(fileName) {
    return asset(`assets/sprites/${fileName}`);
  }

  function pick(items) {
    return items[Math.floor(Math.random() * items.length) % items.length];
  }

  function formatRemaining(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function studyNow() {
    return Date.now();
  }

  function normalizeTimestamp(value) {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function normalizeStudySession(value = {}) {
    const raw = value && typeof value === 'object' ? value : {};
    const session = {
      startedAt: normalizeTimestamp(raw.startedAt),
      rewardAvailable: Boolean(raw.rewardAvailable),
      flapCount: Math.max(0, Math.floor(Number(raw.flapCount) || 0)),
      focusedMinutes: Math.max(0, Math.floor(Number(raw.focusedMinutes) || 0)),
      completedAt: normalizeTimestamp(raw.completedAt),
      restNoticeId: normalizeTimestamp(raw.restNoticeId),
      restUntil: normalizeTimestamp(raw.restUntil),
    };
    if (session.rewardAvailable && !session.restUntil && session.completedAt) {
      session.restUntil = session.completedAt + CONFIG.restDurationMs;
    }
    if (session.rewardAvailable) session.startedAt = 0;
    return session;
  }

  function persistStudySession(overrides = {}) {
    const next = normalizeStudySession({ ...state.study, ...overrides });
    state.study = { ...state.study, ...next };
    if (studyStorage) studyStorage.set({ [STUDY_STORAGE_KEY]: next });
    return next;
  }

  function isFocusActive() {
    return Boolean(state.study.startedAt && !state.study.rewardAvailable);
  }

  function isRestActive(now = studyNow()) {
    return Boolean(state.study.rewardAvailable && state.study.restUntil && now < state.study.restUntil);
  }

  function isStudyPending() {
    return !state.study.startedAt && !state.study.rewardAvailable;
  }

  function isHtmlDocument() {
    return document.documentElement && document.documentElement.nodeName.toLowerCase() === 'html';
  }

  function hasLocalFocus() {
    return document.visibilityState === 'visible' && document.hasFocus();
  }

  function later(fn, delayMs) {
    const id = window.setTimeout(() => {
      state.timers.delete(id);
      fn();
    }, delayMs);
    state.timers.add(id);
    return id;
  }

  function clearLaterTimers() {
    for (const id of state.timers) window.clearTimeout(id);
    state.timers.clear();
  }

  function createActor(kind, x, y) {
    const el = document.createElement('div');
    el.className = `pigeon-wrap ${kind}`;
    el.dataset.actorId = String(state.nextActorId);
    el.innerHTML = kind === 'main'
      ? '<div class="bubble" aria-hidden="true"></div><img class="pigeon-img" alt="" draggable="false" />'
      : '<img class="pigeon-img" alt="" draggable="false" />';

    const actor = {
      id: state.nextActorId,
      kind,
      el,
      img: el.querySelector('.pigeon-img'),
      bubble: el.querySelector('.bubble'),
      x,
      y,
      target: null,
      speedPxPerMs: 0,
      mode: '',
      frameIndex: 0,
      lastFrameAt: 0,
      facingRight: false,
      allowOffscreen: false,
      onArrive: null,
      stateElapsedMs: 0,
      weirdBehaviorTimerMs: 0,
      drag: null,
    };
    state.nextActorId += 1;

    state.shadow.appendChild(el);
    setMode(actor, 'idle');
    applyActorPosition(actor);
    return actor;
  }

  function removeActor(actor) {
    actor.el.remove();
    state.tempActors = state.tempActors.filter((item) => item !== actor);
  }

  function getBox(actor = state.main) {
    if (!actor?.el) return { width: 180, height: 130 };
    const rect = actor.el.getBoundingClientRect();
    return {
      width: rect.width || 180,
      height: rect.height || 130,
    };
  }

  function getMargins(actor = state.main) {
    const box = getBox(actor);
    return {
      x: box.width / 2 + 8,
      y: box.height / 2 + 8,
    };
  }

  function clampCenter(point, actor = state.main) {
    const margin = getMargins(actor);
    return {
      x: Math.max(margin.x, Math.min(window.innerWidth - margin.x, point.x)),
      y: Math.max(margin.y, Math.min(window.innerHeight - margin.y, point.y)),
    };
  }

  function applyActorDepth(actor) {
    if (!actor?.el) return;
    const depth = actor.drag ? 5000 : 100 + Math.max(0, Math.round(actor.y));
    actor.el.style.zIndex = String(depth);
  }

  function applyActorPosition(actor) {
    if (!actor?.el) return;
    if (!actor.allowOffscreen) {
      const clamped = clampCenter({ x: actor.x, y: actor.y }, actor);
      actor.x = clamped.x;
      actor.y = clamped.y;
    }
    const box = getBox(actor);
    actor.el.style.transform = `translate3d(${Math.round(actor.x - box.width / 2)}px, ${Math.round(actor.y - box.height / 2)}px, 0)`;
    applyActorDepth(actor);
  }

  function getCorners(actor = state.main) {
    const margin = getMargins(actor);
    return [
      { x: margin.x, y: margin.y },
      { x: window.innerWidth - margin.x, y: margin.y },
      { x: margin.x, y: window.innerHeight - margin.y },
      { x: window.innerWidth - margin.x, y: window.innerHeight - margin.y },
    ];
  }

  function nearestCornerIndex(actor, point = actor) {
    const corners = getCorners(actor);
    let bestIndex = 0;
    let bestDistSq = Infinity;
    corners.forEach((corner, index) => {
      const distSq = (corner.x - point.x) ** 2 + (corner.y - point.y) ** 2;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function pickWalkTarget(actor = state.main) {
    const corners = getCorners(actor);
    const nearestIndex = nearestCornerIndex(actor);
    const choices = corners.filter((_, index) => index !== nearestIndex);
    return choices[Math.floor(Math.random() * choices.length) % choices.length];
  }

  function pickNearestCorner(actor = state.main) {
    return getCorners(actor)[nearestCornerIndex(actor)];
  }

  function isAtCorner(actor = state.main) {
    const nearest = pickNearestCorner(actor);
    return Math.hypot(nearest.x - actor.x, nearest.y - actor.y) <= CONFIG.cornerArrivalThreshold;
  }

  function modeFacesRightNatively(mode) {
    return mode === 'flyIn' || mode === 'flyOut';
  }

  function applyFacing(actor, mode = actor.mode) {
    const scaleX = actor.facingRight === modeFacesRightNatively(mode) ? 1 : -1;
    actor.el.style.setProperty('--pigeon-direction', String(scaleX));
  }

  function faceTravelDirection(actor, directionX, mode, options = {}) {
    if (directionX) {
      const travelFacingRight = directionX > 0;
      actor.facingRight = options.backwards ? !travelFacingRight : travelFacingRight;
    }
    applyFacing(actor, mode);
  }

  function setMode(actor, mode, now = performance.now()) {
    if (!SPRITES[mode] || actor.mode === mode) return;
    actor.mode = mode;
    actor.frameIndex = 0;
    actor.lastFrameAt = now;
    actor.stateElapsedMs = 0;
    applyFacing(actor, mode);
    updateFrame(actor, true, now);
  }

  function weirdBehaviorDurationFor(mode) {
    if (mode === 'oneLegDoze') {
      if (isRestActive()) return CONFIG.weirdBehaviorDurationMs;
      return isFocusActive() ? CONFIG.focusDozeDurationMs : CONFIG.oneLegDozeDurationMs;
    }
    return CONFIG.weirdBehaviorDurationMs;
  }

  function sequencedWeirdFrame(mode, elapsedMs) {
    const sequence = WEIRD_BEHAVIOR_SEQUENCES[mode];
    if (!sequence) return null;

    const interval = FRAME_INTERVAL_MS[mode] ?? 240;
    const duration = weirdBehaviorDurationFor(mode);
    const introMs = sequence.intro.length * interval;
    const outroMs = sequence.outro.length * interval;
    const outroStartMs = Math.max(introMs, duration - outroMs);

    if (elapsedMs < introMs) {
      return sequence.intro[Math.min(sequence.intro.length - 1, Math.floor(elapsedMs / interval))];
    }
    if (elapsedMs >= outroStartMs) {
      return sequence.outro[Math.min(sequence.outro.length - 1, Math.floor((elapsedMs - outroStartMs) / interval))];
    }
    return sequence.loop[Math.floor((elapsedMs - introMs) / interval) % sequence.loop.length];
  }

  function updateFrame(actor, force = false, now = performance.now()) {
    if (!actor.img) return;
    const sequencedFrame = sequencedWeirdFrame(actor.mode, actor.stateElapsedMs);
    if (sequencedFrame) {
      const src = spriteUrl(sequencedFrame);
      if (force || actor.img.src !== src) actor.img.src = src;
      return;
    }

    const frames = SPRITES[actor.mode] || SPRITES.idle;
    const interval = FRAME_INTERVAL_MS[actor.mode] ?? 400;
    if (force || now - actor.lastFrameAt >= interval) {
      if (!force) actor.frameIndex += 1;
      actor.img.src = spriteUrl(frames[actor.frameIndex % frames.length]);
      actor.lastFrameAt = now;
    }
  }

  function showBubble(text, durationMs = 0) {
    const actor = state.main;
    if (!actor?.bubble) return;
    actor.bubble.textContent = text;
    actor.el.classList.add('show-bubble');
    if (state.bubbleTimer) window.clearTimeout(state.bubbleTimer);
    state.bubbleTimer = null;
    if (durationMs > 0) {
      state.bubbleTimer = window.setTimeout(() => {
        if (actor.el) actor.el.classList.remove('show-bubble');
      }, durationMs);
    }
  }

  function hideBubble() {
    if (state.bubbleTimer) window.clearTimeout(state.bubbleTimer);
    state.bubbleTimer = null;
    if (state.main?.el) state.main.el.classList.remove('show-bubble');
  }

  function normalizeRatio(value, fallback = 0.5) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(0, Math.min(1, number));
  }

  function pointToRatios(point) {
    return {
      xRatio: window.innerWidth > 0 ? normalizeRatio(point.x / window.innerWidth) : 0.5,
      yRatio: window.innerHeight > 0 ? normalizeRatio(point.y / window.innerHeight) : 0.5,
    };
  }

  function pointFromRatios(value, fallback = { xRatio: 0.5, yRatio: 0.5 }) {
    return {
      x: normalizeRatio(value?.xRatio, fallback.xRatio) * window.innerWidth,
      y: normalizeRatio(value?.yRatio, fallback.yRatio) * window.innerHeight,
    };
  }

  function actorSnapshotMode(mode) {
    if (!SPRITES[mode] || mode === 'dragged') return 'idle';
    return mode;
  }

  function persistActorSnapshot(options = {}) {
    const actor = state.main;
    if (!storage?.local || !actor || state.offDuty || state.phase === 'commuteOut') return;
    if (!options.force && (!state.activeSurface || performance.now() < state.nextActorPersistAt)) return;

    state.nextActorPersistAt = performance.now() + CONFIG.actorSyncIntervalMs;
    const position = pointToRatios(actor);
    const target = actor.target && !actor.allowOffscreen ? pointToRatios(actor.target) : null;
    storage.local.set({
      [ACTOR_STORAGE_KEY]: {
        ...position,
        target,
        mode: actorSnapshotMode(actor.mode),
        frameIndex: Math.max(0, Math.floor(actor.frameIndex || 0)),
        facingRight: Boolean(actor.facingRight),
        speedPxPerMs: Number.isFinite(actor.speedPxPerMs) ? actor.speedPxPerMs : 0,
        stateElapsedMs: Math.max(0, Math.floor(actor.stateElapsedMs || 0)),
        weirdBehaviorTimerMs: Math.max(0, Math.floor(actor.weirdBehaviorTimerMs || 0)),
        savedAt: Date.now(),
      },
    });
  }

  function restoreActorSnapshot(value, now = performance.now()) {
    const actor = state.main;
    if (!actor || !value || typeof value !== 'object') return false;
    if (!Number.isFinite(Number(value.xRatio)) || !Number.isFinite(Number(value.yRatio))) return false;

    const point = pointFromRatios(value);
    actor.x = point.x;
    actor.y = point.y;
    actor.facingRight = Boolean(value.facingRight);
    actor.target = null;
    actor.onArrive = null;
    actor.allowOffscreen = false;

    const mode = actorSnapshotMode(value.mode);
    setMode(actor, mode, now);
    applyFacing(actor, mode);
    actor.frameIndex = Math.max(0, Math.floor(Number(value.frameIndex) || 0));
    actor.stateElapsedMs = Math.max(0, Math.floor(Number(value.stateElapsedMs) || 0));
    actor.weirdBehaviorTimerMs = Math.max(0, Math.floor(Number(value.weirdBehaviorTimerMs) || 0));

    if (value.target && (mode === 'walk' || mode === 'hopInPlace' || mode === 'flyIn' || mode === 'flyOut')) {
      const target = clampCenter(pointFromRatios(value.target), actor);
      actor.target = target;
      actor.speedPxPerMs = Number.isFinite(Number(value.speedPxPerMs)) && Number(value.speedPxPerMs) > 0
        ? Number(value.speedPxPerMs)
        : CONFIG.walkSpeed;
      faceTravelDirection(actor, target.x - actor.x, mode);
    }

    state.phase = 'normal';
    updateFrame(actor, true, now);
    applyActorPosition(actor);
    return true;
  }

  function loadActorSnapshot(callback) {
    if (!storage?.local) {
      callback(false);
      return;
    }
    storage.local.get({ [ACTOR_STORAGE_KEY]: null }, (result) => {
      callback(restoreActorSnapshot(result[ACTOR_STORAGE_KEY]));
    });
  }

  function applyStudySession(value, options = {}) {
    const previousNoticeId = state.study.restNoticeId;
    const next = normalizeStudySession(value);
    state.study = { ...state.study, ...next };
    updateFeedMenu();

    const shouldShowRestNotice = options.showRestNotice
      && next.rewardAvailable
      && next.restNoticeId
      && next.restNoticeId !== previousNoticeId;
    if (shouldShowRestNotice) showRestNotice();

    if (performance.now() < state.studyAlignmentSuppressedUntil) return;
    if (!state.host || options.alignActor === false || state.phase !== 'normal' || !state.main?.el) return;
    if (next.startedAt && !isAtCorner(state.main)) {
      moveToFocusCorner(state.main);
    } else if (!next.startedAt && !next.rewardAvailable) {
      moveToFocusCorner(state.main, { startOnArrive: true });
    }
  }

  function syncLocalStudyClock() {
    const now = studyNow();
    if (state.study.startedAt && now - state.study.startedAt >= CONFIG.focusDurationMs) {
      const completedAt = state.study.startedAt + CONFIG.focusDurationMs;
      state.study = normalizeStudySession({
        ...state.study,
        startedAt: 0,
        rewardAvailable: true,
        focusedMinutes: Math.max(25, Math.round((completedAt - state.study.startedAt) / 60000)),
        completedAt,
        restNoticeId: completedAt,
        restUntil: completedAt + CONFIG.restDurationMs,
      });
    }

    if (state.study.rewardAvailable && state.study.restUntil && now >= state.study.restUntil) {
      state.study = normalizeStudySession({
        startedAt: 0,
        rewardAvailable: false,
        flapCount: 0,
        focusedMinutes: 0,
        completedAt: 0,
        restNoticeId: 0,
        restUntil: 0,
      });
    }
    updateFeedMenu();
  }

  function loadStudySession(callback) {
    if (!studyStorage) {
      callback();
      return;
    }
    studyStorage.get({ [STUDY_STORAGE_KEY]: null }, (result) => {
      applyStudySession(result[STUDY_STORAGE_KEY], { alignActor: false, showRestNotice: false });
      syncLocalStudyClock();
      callback();
    });
  }

  function startStudyPeriod(now = studyNow()) {
    if (state.main) {
      state.main.stateElapsedMs = 0;
      state.main.weirdBehaviorTimerMs = 0;
    }
    persistStudySession({
      startedAt: now,
      rewardAvailable: false,
      flapCount: 0,
      focusedMinutes: 0,
      completedAt: 0,
      restNoticeId: 0,
      restUntil: 0,
    });
    updateFeedMenu(now);
  }

  function studyElapsedMs(now = studyNow()) {
    return state.study.startedAt ? Math.max(0, now - state.study.startedAt) : 0;
  }

  function studyRemainingMs(now = studyNow()) {
    if (state.study.rewardAvailable) return 0;
    if (!state.study.startedAt) return CONFIG.focusDurationMs;
    return Math.max(0, CONFIG.focusDurationMs - studyElapsedMs(now));
  }

  function updateFeedMenu(now = studyNow()) {
    if (!state.feedButton || !state.feedStatus) return;
    let statusText = '';
    if (state.study.rewardAvailable) {
      if (isRestActive(now)) statusText = `쉬는 ${formatRemaining(state.study.restUntil - now)}`;
    } else {
      statusText = formatRemaining(studyRemainingMs(now));
    }

    state.feedButton.classList.toggle('reward-ready', state.study.rewardAvailable);
    state.feedButton.classList.toggle('reward-waiting', !state.study.rewardAvailable);
    state.feedButton.classList.toggle('status-empty', !statusText);
    state.feedStatus.textContent = statusText;
  }

  function countStudyFlap(actor, mode) {
    if (actor?.kind !== 'main') return;
    if (!state.study.startedAt || state.study.rewardAvailable) return;
    if (state.phase !== 'normal') return;
    if (mode !== 'flyIn' && mode !== 'flyOut') return;
    persistStudySession({ flapCount: state.study.flapCount + 1 });
  }

  function showRestNotice() {
    const actor = state.main;
    if (!actor) return;
    const showNotice = (now = performance.now()) => {
      state.phase = 'normal';
      enterIdle(actor, now);
      actor.stateElapsedMs = 0;
      actor.weirdBehaviorTimerMs = 0;
      showBubble('25분 끝! 먹이 줘!', CONFIG.restBubbleDurationMs);
    };

    if (state.phase !== 'normal' || actor.drag) {
      showNotice();
      return;
    }

    hideBubble();
    state.phase = 'restNotice';
    travelActor(actor, {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }, 'walk', CONFIG.walkSpeed, showNotice);
  }

  function completeStudyPeriod(options = {}) {
    if (!state.study.startedAt || state.study.rewardAvailable) return;

    const now = studyNow();
    const focusedMinutes = Math.max(1, Math.round(studyElapsedMs(now) / 60000));
    const flapCount = state.study.flapCount;
    persistStudySession({
      startedAt: 0,
      rewardAvailable: true,
      flapCount,
      focusedMinutes,
      completedAt: now,
      restNoticeId: now,
      restUntil: now + CONFIG.restDurationMs,
    });

    if (options.showRestNotice !== false) showRestNotice();
    updateFeedMenu(now);
  }

  function updateStudyPeriod(options = {}) {
    if (state.study.rewardAvailable) {
      if (state.study.restUntil && studyNow() >= state.study.restUntil) finishRestPeriod();
      return;
    }
    if (!state.study.startedAt) return;
    if (studyElapsedMs() >= CONFIG.focusDurationMs) completeStudyPeriod(options);
  }

  function resolveTravelTarget(actor, target, options = {}) {
    return options.clampTarget === false ? target : clampCenter(target, actor);
  }

  function travelActor(actor, target, mode, speedPxPerMs, onArrive = null, options = {}) {
    const resolvedTarget = resolveTravelTarget(actor, target, options);
    countStudyFlap(actor, mode);
    actor.target = resolvedTarget;
    actor.speedPxPerMs = speedPxPerMs;
    actor.onArrive = onArrive;
    actor.allowOffscreen = Boolean(options.allowOffscreen);
    faceTravelDirection(actor, resolvedTarget.x - actor.x, mode, options);
    setMode(actor, mode);
  }

  function travelActorDuration(actor, target, mode, durationMs, onArrive = null, options = {}) {
    const resolvedTarget = resolveTravelTarget(actor, target, options);
    const distance = Math.hypot(resolvedTarget.x - actor.x, resolvedTarget.y - actor.y);
    const speed = distance / Math.max(1, durationMs);
    travelActor(actor, resolvedTarget, mode, speed, onArrive, { ...options, clampTarget: false });
  }

  function enterIdle(actor, now = performance.now()) {
    actor.target = null;
    actor.onArrive = null;
    actor.allowOffscreen = false;
    setMode(actor, 'idle', now);
    applyActorPosition(actor);
  }

  function finishTravel(actor, now) {
    const onArrive = actor.onArrive;
    actor.target = null;
    actor.onArrive = null;
    if (onArrive) onArrive(now);
    else enterIdle(actor, now);
  }

  function walkToRandomCorner(actor = state.main, forceWalk = false) {
    const target = pickWalkTarget(actor);
    const hopping = !forceWalk && Math.random() < CONFIG.hopProbability;
    travelActor(actor, target, hopping ? 'hopInPlace' : 'walk', hopping ? CONFIG.hopSpeed : CONFIG.walkSpeed, null, {
      backwards: Math.random() < CONFIG.backwardsWalkProbability,
    });
  }

  function fleeToRandomCorner(actor = state.main) {
    const target = pickWalkTarget(actor);
    travelActor(actor, target, 'flyOut', CONFIG.flightSpeed);
  }

  function walkToNearestCornerAfterDrag(actor = state.main) {
    const nearest = pickNearestCorner(actor);
    const distance = Math.hypot(nearest.x - actor.x, nearest.y - actor.y);
    if (distance > CONFIG.cornerArrivalThreshold) {
      travelActor(actor, nearest, 'walk', CONFIG.walkSpeed, null, {
        backwards: Math.random() < CONFIG.backwardsWalkProbability,
      });
    } else {
      enterIdle(actor);
    }
  }

  function moveToFocusCorner(actor = state.main, options = {}) {
    if (!actor || actor.drag || state.phase === 'commuteOut') return;
    const nearest = pickNearestCorner(actor);
    const distance = Math.hypot(nearest.x - actor.x, nearest.y - actor.y);
    const arrive = (now = performance.now()) => {
      state.phase = 'normal';
      enterIdle(actor, now);
      if (options.startOnArrive) startStudyPeriod();
    };

    hideBubble();
    if (distance <= CONFIG.cornerArrivalThreshold) {
      arrive();
      return;
    }

    state.phase = 'focusSetup';
    travelActor(actor, nearest, 'walk', CONFIG.walkSpeed, arrive, {
      backwards: Math.random() < CONFIG.backwardsWalkProbability,
    });
  }

  function finishRestPeriod() {
    if (!state.study.rewardAvailable) return;
    if (state.phase !== 'normal' && state.phase !== 'feeding') return;

    hideMenu();
    hideBubble();
    cancelFeedMode();
    clearTemporaryPigeons();
    persistStudySession({
      startedAt: 0,
      rewardAvailable: false,
      flapCount: 0,
      focusedMinutes: 0,
      completedAt: 0,
      restNoticeId: 0,
      restUntil: 0,
    });
    moveToFocusCorner(state.main, { startOnArrive: true });
    updateFeedMenu();
  }

  function triggerWeirdBehavior(actor, now) {
    const behavior = pick(WEIRD_BEHAVIORS);
    actor.weirdBehaviorTimerMs = 0;
    setMode(actor, behavior, now);
  }

  function updateMainIdleBehavior(deltaMs, now) {
    const actor = state.main;
    if (!actor || state.phase !== 'normal' || actor.target || actor.drag) return;

    actor.stateElapsedMs += deltaMs;
    actor.weirdBehaviorTimerMs += deltaMs;

    if (WEIRD_BEHAVIORS.includes(actor.mode)) {
      const duration = weirdBehaviorDurationFor(actor.mode);
      if (actor.stateElapsedMs >= duration) {
        actor.weirdBehaviorTimerMs = 0;
        enterIdle(actor, now);
      }
      return;
    }

    if (actor.mode !== 'idle') return;

    if (isStudyPending() && isAtCorner(actor)) {
      startStudyPeriod();
      return;
    }

    if (isFocusActive()) {
      if (!isAtCorner(actor)) {
        moveToFocusCorner(actor);
        return;
      }
      if (actor.weirdBehaviorTimerMs >= CONFIG.focusBehaviorIntervalMs) {
        actor.weirdBehaviorTimerMs = 0;
        setMode(actor, 'oneLegDoze', now);
      }
      return;
    }

    if (isRestActive()) {
      if (actor.stateElapsedMs >= CONFIG.restMoveIntervalMs) {
        walkToRandomCorner(actor);
        return;
      }
      if (actor.weirdBehaviorTimerMs >= CONFIG.weirdBehaviorIntervalMs) {
        triggerWeirdBehavior(actor, now);
      }
      return;
    }

    if (actor.weirdBehaviorTimerMs >= CONFIG.weirdBehaviorIntervalMs) {
      triggerWeirdBehavior(actor, now);
      return;
    }

    if (actor.stateElapsedMs >= CONFIG.idleDurationMs) {
      walkToRandomCorner(actor);
    }
  }

  function startCommuteIn() {
    const actor = state.main;
    state.phase = 'commuteIn';
    actor.x = -220;
    actor.y = -140;
    actor.allowOffscreen = true;
    applyActorPosition(actor);

    travelActorDuration(actor, {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }, 'flyIn', 1200, (now) => {
      state.phase = 'normal';
      enterIdle(actor, now);
      if (state.study.rewardAvailable) {
        if (isRestActive()) showRestNotice();
        else finishRestPeriod();
      } else if (state.study.startedAt) {
        state.studyAlignmentSuppressedUntil = now + 3200;
        showBubble(pick(GREETINGS), 2400);
        later(() => {
          if (state.host && state.phase === 'normal' && !actor.drag && state.study.startedAt) {
            moveToFocusCorner(actor);
          }
        }, 3000);
      } else {
        state.studyAlignmentSuppressedUntil = now + 3200;
        showBubble(pick(GREETINGS), 2400);
        later(() => {
          if (state.host && state.phase === 'normal' && !actor.drag && isStudyPending()) {
            moveToFocusCorner(actor, { startOnArrive: true });
          }
        }, 3000);
      }
    }, { allowOffscreen: true });
  }

  function startCommuteOut() {
    const actor = state.main;
    if (!actor || state.phase === 'commuteOut') return;
    hideMenu();
    hideBubble();
    cancelFeedMode();
    clearTemporaryPigeons();
    clearLaterTimers();
    state.phase = 'commuteOut';
    state.remountAfterCommuteOut = false;
    state.offDuty = true;
    if (storage?.local) storage.local.set({ [OFF_DUTY_STORAGE_KEY]: true });

    const center = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    travelActor(actor, center, 'walk', CONFIG.walkSpeed, (now) => {
      enterIdle(actor, now);
      showBubble(pick(FAREWELLS), 1600);
      later(() => {
        travelActorDuration(actor, {
          x: window.innerWidth + 220,
          y: -140,
        }, 'flyOut', 1000, () => {
          const shouldRemount = state.remountAfterCommuteOut && state.enabled && !state.offDuty;
          unmount();
          if (shouldRemount) {
            state.remountAfterCommuteOut = false;
            mount();
          }
        }, { clampTarget: false, allowOffscreen: true });
      }, 1600);
    });
  }

  function setFoodPosition(x, y) {
    if (!state.food) return;
    state.food.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
  }

  function showFoodAt(point) {
    if (!state.feedLayer) return;
    state.feedLayer.classList.add('visible');
    setFoodPosition(point.x, point.y);
  }

  function hideFood() {
    if (state.feedLayer) state.feedLayer.classList.remove('visible', 'choosing');
    state.feed.point = null;
  }

  function feedCursorStartPoint(event = null) {
    if (Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)) {
      return { x: event.clientX, y: event.clientY };
    }
    if (state.mouse.t > 0) {
      return { x: state.mouse.x, y: state.mouse.y };
    }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  function feedGatherRadius(actor = state.main) {
    const box = getBox(actor);
    const viewportRadius = Math.max(52, Math.min(window.innerWidth, window.innerHeight) * 0.24);
    return Math.min(
      CONFIG.feedGatherMaxRadius,
      viewportRadius,
      Math.max(CONFIG.feedGatherMinRadius, box.width * 0.38),
    );
  }

  function feedGatherPoint(foodPoint, slotIndex, actor = state.main) {
    const totalSlots = MAX_TEMPORARY_PIGEONS + 1;
    const step = (Math.PI * 2) / totalSlots;
    const wobble = slotIndex % 2 === 0 ? step * 0.16 : -step * 0.12;
    const angle = -Math.PI / 2 + slotIndex * step + wobble;
    const radiusScale = [0.92, 1.14, 1.02][slotIndex % 3];
    const radius = feedGatherRadius(actor) * radiusScale;
    return clampCenter({
      x: foodPoint.x + Math.cos(angle) * radius,
      y: foodPoint.y + Math.sin(angle) * radius * 0.86,
    }, actor);
  }

  function startFeedMode(event = null) {
    if (state.phase === 'commuteOut' || state.feed.feeding) return;
    hideMenu();
    if (!state.study.rewardAvailable) {
      showBubble(`먹이까지 ${formatRemaining(studyRemainingMs())}`, 1800);
      return;
    }
    hideBubble();
    state.feed.choosing = true;
    const startPoint = feedCursorStartPoint(event);
    setFoodPosition(startPoint.x, startPoint.y);
    state.feedLayer.classList.add('visible', 'choosing');
    if (state.feed.timeoutId) window.clearTimeout(state.feed.timeoutId);
    state.feed.timeoutId = window.setTimeout(() => {
      if (state.feed.choosing) cancelFeedMode();
    }, CONFIG.feedModeTimeoutMs);
  }

  function cancelFeedMode() {
    if (state.feed.timeoutId) window.clearTimeout(state.feed.timeoutId);
    state.feed.timeoutId = null;
    state.feed.choosing = false;
    state.feed.feeding = false;
    state.feed.spawnTimerMs = 0;
    state.feed.spawnedCount = 0;
    hideFood();
  }

  function placeFood(event) {
    if (!state.feed.choosing) return;
    event.preventDefault();
    event.stopPropagation();
    if (state.feed.timeoutId) window.clearTimeout(state.feed.timeoutId);
    state.feed.timeoutId = null;
    state.feed.choosing = false;
    state.feedLayer.classList.remove('choosing');

    const point = clampCenter({ x: event.clientX, y: event.clientY }, state.main);
    startFeeding(point);
  }

  function startFeeding(point) {
    if (state.feed.feeding || !state.main || !state.study.rewardAvailable) return;
    state.phase = 'feeding';
    state.feed.feeding = true;
    state.feed.point = point;
    state.feed.spawnTimerMs = 0;
    state.feed.spawnedCount = 0;
    showFoodAt(point);

    travelActor(state.main, feedGatherPoint(point, 0, state.main), 'flyIn', CONFIG.flightSpeed, (now) => {
      setMode(state.main, 'eat', now);
    });
  }

  function spawnTemporaryPigeon() {
    const foodPoint = state.feed.point;
    if (!foodPoint) return;

    state.feed.spawnedCount += 1;
    const temp = createActor('temporary', foodPoint.x, foodPoint.y);
    const eatPoint = feedGatherPoint(foodPoint, state.feed.spawnedCount, temp);
    const eatAngle = Math.atan2(eatPoint.y - foodPoint.y, eatPoint.x - foodPoint.x);
    const arrivalAngle = eatAngle + Math.PI + (Math.random() - 0.5) * 0.9;
    const radius = Math.max(window.innerWidth, window.innerHeight) * 0.75;
    temp.x = eatPoint.x + Math.cos(arrivalAngle) * radius;
    temp.y = eatPoint.y + Math.sin(arrivalAngle) * radius;
    temp.allowOffscreen = true;
    applyActorPosition(temp);
    state.tempActors.push(temp);

    travelActor(temp, eatPoint, 'flyIn', CONFIG.flightSpeed, (now) => {
      temp.allowOffscreen = false;
      setMode(temp, 'eat', now);
      applyActorPosition(temp);
    }, { allowOffscreen: true });
  }

  function updateFeeding(deltaMs) {
    if (!state.feed.feeding) return;
    if (state.feed.spawnedCount >= MAX_TEMPORARY_PIGEONS) return;
    state.feed.spawnTimerMs += deltaMs;
    while (state.feed.spawnTimerMs >= CONFIG.spawnStaggerMs && state.feed.spawnedCount < MAX_TEMPORARY_PIGEONS) {
      state.feed.spawnTimerMs -= CONFIG.spawnStaggerMs;
      spawnTemporaryPigeon();
    }
  }

  function clearTemporaryPigeons() {
    for (const actor of [...state.tempActors]) removeActor(actor);
    state.tempActors = [];
    hideFood();
    state.feed.feeding = false;
  }

  function disperseFlock(point) {
    if (!state.feed.feeding || state.tempActors.length === 0) return;
    state.feed.feeding = false;
    hideFood();

    for (const actor of [...state.tempActors]) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.max(window.innerWidth, window.innerHeight) * 0.75;
      travelActor(actor, {
        x: actor.x + Math.cos(angle) * radius,
        y: actor.y + Math.sin(angle) * radius,
      }, 'flyOut', CONFIG.flightSpeed, () => {
        removeActor(actor);
      }, { clampTarget: false, allowOffscreen: true });
    }

    const main = state.main;
    const dx = main.x - point.x;
    const dy = main.y - point.y;
    const length = Math.hypot(dx, dy) || 1;
    const burst = {
      x: main.x + (dx / length) * 160,
      y: main.y + (dy / length) * 120,
    };
    travelActorDuration(main, burst, 'flyOut', 600, () => {
      state.phase = 'normal';
      fleeToRandomCorner(main);
    });
  }

  function updateActor(actor, deltaMs, now) {
    updateFrame(actor, false, now);

    if (actor.target && !actor.drag) {
      const dx = actor.target.x - actor.x;
      const dy = actor.target.y - actor.y;
      const distance = Math.hypot(dx, dy);
      const step = actor.speedPxPerMs * deltaMs;
      if (distance <= step || distance < 1) {
        actor.x = actor.target.x;
        actor.y = actor.target.y;
        finishTravel(actor, now);
      } else {
        actor.x += (dx / distance) * step;
        actor.y += (dy / distance) * step;
      }
    }

    applyActorPosition(actor);
  }

  function tick(now) {
    if (!state.host) return;
    const deltaMs = Math.min(100, Math.max(0, now - (state.lastTickAt || now)));
    state.lastTickAt = now;

    updateActor(state.main, deltaMs, now);
    for (const actor of [...state.tempActors]) updateActor(actor, deltaMs, now);
    updateStudyPeriod();
    updateMainIdleBehavior(deltaMs, now);
    updateFeeding(deltaMs);
    updateFeedMenu();
    persistActorSnapshot();

    state.raf = window.requestAnimationFrame(tick);
  }

  function onMainPointerDown(event) {
    if (event.button !== 0 || state.phase === 'commuteOut') return;
    event.preventDefault();
    event.stopPropagation();
    hideMenu();
    hideBubble();

    const actor = state.main;
    actor.el.setPointerCapture(event.pointerId);
    actor.drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - actor.x,
      offsetY: event.clientY - actor.y,
      moved: false,
      previousPhase: state.phase,
    };
    actor.target = null;
    actor.onArrive = null;
    setMode(actor, 'dragged');
    actor.el.classList.add('dragging');
  }

  function onMainPointerMove(event) {
    const actor = state.main;
    if (!actor?.drag || actor.drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    actor.drag.moved = true;
    const point = clampCenter({
      x: event.clientX - actor.drag.offsetX,
      y: event.clientY - actor.drag.offsetY,
    }, actor);
    actor.x = point.x;
    actor.y = point.y;
    applyActorPosition(actor);
  }

  function onMainPointerUp(event) {
    const actor = state.main;
    if (!actor?.drag || actor.drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const wasMoved = actor.drag.moved;
    const previousPhase = actor.drag.previousPhase;
    actor.drag = null;
    actor.el.classList.remove('dragging');

    if (previousPhase === 'feeding') {
      setMode(actor, 'eat');
      return;
    }
    if (wasMoved) walkToNearestCornerAfterDrag(actor);
    else enterIdle(actor);
  }

  function onContextMenu(event) {
    if (state.phase === 'commuteOut') return;
    event.preventDefault();
    event.stopPropagation();
    showMenu(event.clientX, event.clientY);
  }

  function showMenu(clientX, clientY) {
    if (!state.menu) return;
    updateFeedMenu();
    state.menu.hidden = false;
    const rect = state.menu.getBoundingClientRect();
    const x = Math.max(8, Math.min(window.innerWidth - rect.width - 8, clientX));
    const y = Math.max(8, Math.min(window.innerHeight - rect.height - 8, clientY));
    state.menu.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

  function hideMenu() {
    if (state.menu) state.menu.hidden = true;
  }

  function onMenuClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.action === 'feed') startFeedMode(event);
    if (button.dataset.action === 'commute-out') startCommuteOut();
  }

  function onWindowPointerDown(event) {
    if (!state.menu || state.menu.hidden) return;
    const path = event.composedPath();
    if (path.includes(state.menu) || path.includes(state.main?.el)) return;
    hideMenu();
  }

  function onWindowPointerMove(event) {
    const now = performance.now();
    if (state.feed.choosing) setFoodPosition(event.clientX, event.clientY);
    if (state.mouse.t > 0 && state.feed.feeding && state.tempActors.length > 0 && !state.feed.choosing) {
      const distance = Math.hypot(event.clientX - state.mouse.x, event.clientY - state.mouse.y);
      const elapsed = Math.max(1, now - state.mouse.t);
      if (distance / elapsed >= CONFIG.scatterVelocityPxPerMs) {
        disperseFlock({ x: event.clientX, y: event.clientY });
      }
    }
    state.mouse = { x: event.clientX, y: event.clientY, t: now };
  }

  function onWindowKeyDown(event) {
    if (event.key !== 'Escape') return;
    hideMenu();
    if (state.feed.choosing) cancelFeedMode();
  }

  function onWindowResize() {
    for (const actor of [state.main, ...state.tempActors]) {
      if (actor) applyActorPosition(actor);
    }
    if (state.feed.point) showFoodAt(state.feed.point);
  }

  function onWindowBlur() {
    persistActorSnapshot({ force: true });
  }

  function onPossibleNavigation() {
    persistActorSnapshot({ force: true });
  }

  function bindEvents() {
    const actor = state.main;
    actor.el.addEventListener('pointerdown', onMainPointerDown);
    actor.el.addEventListener('pointermove', onMainPointerMove);
    actor.el.addEventListener('pointerup', onMainPointerUp);
    actor.el.addEventListener('pointercancel', onMainPointerUp);
    actor.el.addEventListener('contextmenu', onContextMenu);
    state.menu.addEventListener('click', onMenuClick);
    state.feedLayer.addEventListener('click', placeFood);
    state.feedLayer.addEventListener('contextmenu', (event) => {
      if (!state.feed.choosing) return;
      event.preventDefault();
      event.stopPropagation();
      cancelFeedMode();
    });
    window.addEventListener('pointerdown', onWindowPointerDown, true);
    window.addEventListener('pointermove', onWindowPointerMove, true);
    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('click', onPossibleNavigation, true);
    window.addEventListener('submit', onPossibleNavigation, true);
    window.addEventListener('resize', onWindowResize, { passive: true });
    window.addEventListener('blur', onWindowBlur);
  }

  function rootVisibilityStyles() {
    const visible = state.enabled && state.activeSurface;
    return {
      opacity: visible ? '1' : '0',
      visibility: visible ? 'visible' : 'hidden',
    };
  }

  function applyRootVisibility() {
    if (!state.host) return;
    const styles = rootVisibilityStyles();
    state.host.style.setProperty('opacity', styles.opacity, 'important');
    state.host.style.setProperty('visibility', styles.visibility, 'important');
  }

  function mount() {
    if (state.offDuty || !state.activeSurface) return;
    if (!isHtmlDocument() || state.host || document.getElementById(ROOT_ID)) return;

    const host = document.createElement('my-pigeon');
    host.id = ROOT_ID;
    const visibilityStyles = rootVisibilityStyles();
    host.style.cssText = [
      'all: initial !important',
      'display: block !important',
      'position: fixed !important',
      'inset: 0 !important',
      'width: 100vw !important',
      'height: 100vh !important',
      'z-index: 2147483647 !important',
      'overflow: visible !important',
      'pointer-events: none !important',
      `opacity: ${visibilityStyles.opacity} !important`,
      `visibility: ${visibilityStyles.visibility} !important`,
      'contain: layout style paint !important',
    ].join(';');

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .pigeon-wrap {
          --pigeon-direction: 1;
          position: absolute;
          left: 0;
          top: 0;
          width: clamp(208px, 28.6vmin, 312px);
          height: clamp(145.6px, 23.4vmin, 218.4px);
          pointer-events: none;
          user-select: none;
          touch-action: none;
          transform: translate3d(0, 0, 0);
          will-change: transform;
        }

        .pigeon-wrap.main {
          pointer-events: auto;
          cursor: grab;
        }

        .pigeon-wrap.dragging {
          cursor: grabbing;
        }

        .pigeon-img {
          position: relative;
          z-index: 1;
          display: block;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center bottom;
          transform: scaleX(var(--pigeon-direction));
          transform-origin: center bottom;
          filter: drop-shadow(0 10px 12px rgba(0, 0, 0, 0.18));
          -webkit-user-drag: none;
        }

        .bubble {
          position: absolute;
          left: 50%;
          bottom: calc(100% + 14px);
          z-index: 3;
          max-width: calc(100vw - 24px);
          padding: 7px 11px 8px;
          border: 1px solid rgba(0, 0, 0, 0.14);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.96);
          color: #111;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.13);
          font: 400 12px/1.2 "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transform: translateX(-50%) translateY(6px);
          transition: opacity 160ms ease, transform 160ms ease;
        }

        .pigeon-wrap.show-bubble .bubble {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }

        .menu {
          position: absolute;
          left: 0;
          top: 0;
          z-index: 20000;
          min-width: 172px;
          padding: 5px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.16);
          pointer-events: auto;
          transform: translate3d(0, 0, 0);
        }

        .menu[hidden] {
          display: none;
        }

        .menu button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          width: 100%;
          padding: 7px 9px;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #111;
          font: 500 13px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          text-align: left;
          white-space: nowrap;
          cursor: default;
        }

        .feed-status {
          color: #667085;
          font: 500 12px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .menu button.status-empty .feed-status {
          display: none;
        }

        .menu button:hover,
        .menu button:focus-visible {
          background: #f0f2f4;
          outline: none;
        }

        .feed-layer {
          position: absolute;
          inset: 0;
          z-index: 1;
          display: none;
          pointer-events: none;
          cursor: none;
        }

        .feed-layer.visible {
          display: block;
        }

        .feed-layer.choosing {
          z-index: 10000;
          pointer-events: auto;
        }

        .food {
          position: absolute;
          left: 0;
          top: 0;
          width: 34px;
          height: 28px;
          object-fit: contain;
          filter: drop-shadow(0 5px 7px rgba(0, 0, 0, 0.16));
          pointer-events: none;
          transform: translate3d(-100px, -100px, 0);
        }
      </style>
      <div class="feed-layer" aria-hidden="true">
        <img class="food" src="${spriteUrl('food.png')}" alt="" draggable="false" />
      </div>
      <nav class="menu" hidden aria-label="My Pigeon menu">
        <button type="button" data-action="feed">
          <span>먹이 주기</span>
          <span class="feed-status" data-feed-status>25:00</span>
        </button>
        <button type="button" data-action="commute-out">퇴근</button>
      </nav>
    `;

    document.documentElement.appendChild(host);
    state.host = host;
    state.shadow = shadow;
    state.menu = shadow.querySelector('.menu');
    state.feedButton = shadow.querySelector('[data-action="feed"]');
    state.feedStatus = shadow.querySelector('[data-feed-status]');
    state.feedLayer = shadow.querySelector('.feed-layer');
    state.food = shadow.querySelector('.food');
    state.main = createActor('main', -220, -140);

    bindEvents();
    loadStudySession(() => {
      loadActorSnapshot((restoredActor) => {
        if (!state.host) return;
        const shouldCommuteIn = state.forceCommuteIn || !restoredActor;
        state.forceCommuteIn = false;
        state.lastTickAt = performance.now();
        if (shouldCommuteIn) startCommuteIn();
        else updateFeedMenu();
        state.raf = window.requestAnimationFrame(tick);
      });
    });
  }

  function unmount() {
    if (state.raf) window.cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (state.bubbleTimer) window.clearTimeout(state.bubbleTimer);
    state.bubbleTimer = null;
    clearLaterTimers();
    if (state.feed.timeoutId) window.clearTimeout(state.feed.timeoutId);
    state.feed.timeoutId = null;
    window.removeEventListener('pointerdown', onWindowPointerDown, true);
    window.removeEventListener('pointermove', onWindowPointerMove, true);
    window.removeEventListener('keydown', onWindowKeyDown);
    window.removeEventListener('click', onPossibleNavigation, true);
    window.removeEventListener('submit', onPossibleNavigation, true);
    window.removeEventListener('resize', onWindowResize);
    window.removeEventListener('blur', onWindowBlur);
    if (state.host) state.host.remove();
    state.host = null;
    state.shadow = null;
    state.main = null;
    state.tempActors = [];
    state.menu = null;
    state.feedButton = null;
    state.feedStatus = null;
    state.feedLayer = null;
    state.food = null;
    state.phase = 'normal';
    state.studyAlignmentSuppressedUntil = 0;
    state.feed = {
      choosing: false,
      feeding: false,
      point: null,
      spawnTimerMs: 0,
      spawnedCount: 0,
      timeoutId: null,
    };
    state.study = {
      startedAt: 0,
      rewardAvailable: false,
      flapCount: 0,
      focusedMinutes: 0,
      completedAt: 0,
      restNoticeId: 0,
      restUntil: 0,
    };
  }

  function applyVisibility() {
    if (!state.settingsLoaded) return;

    if (state.offDuty) {
      if (state.phase === 'commuteOut') {
        applyRootVisibility();
        return;
      }
      unmount();
      return;
    }

    if (!state.activeSurface) {
      persistActorSnapshot({ force: true });
      unmount();
      return;
    }

    if (state.phase === 'commuteOut') {
      state.remountAfterCommuteOut = state.enabled;
      applyRootVisibility();
      return;
    }

    mount();
    applyRootVisibility();
  }

  function applyEnabled(enabled) {
    state.enabled = enabled !== false;
    applyVisibility();
  }

  function applyOffDuty(offDuty) {
    const wasOffDuty = state.offDuty;
    state.offDuty = offDuty === true;
    if (wasOffDuty && !state.offDuty) state.forceCommuteIn = true;
    applyVisibility();
  }

  function applyActiveSurface(active) {
    const nextActive = active === true;
    if (state.activeSurface && !nextActive) persistActorSnapshot({ force: true });
    state.activeSurface = nextActive;
    if (nextActive) {
      state.nextActorPersistAt = 0;
      state.lastTickAt = performance.now();
    }
    applyVisibility();
  }

  function loadStartupSettings() {
    let pending = 0;
    const done = () => {
      pending -= 1;
      if (pending <= 0) {
        state.settingsLoaded = true;
        applyVisibility();
      }
    };

    if (storage?.sync) {
      pending += 1;
      storage.sync.get(DEFAULTS, (settings) => {
        state.enabled = settings.enabled !== false;
        done();
      });
    }

    if (storage?.local) {
      pending += 1;
      storage.local.get({ [OFF_DUTY_STORAGE_KEY]: false }, (settings) => {
        state.offDuty = settings[OFF_DUTY_STORAGE_KEY] === true;
        done();
      });
    }

    if (pending === 0) {
      state.settingsLoaded = true;
      applyVisibility();
    }
  }

  function requestActiveSurface() {
    if (!runtime?.sendMessage) {
      applyActiveSurface(document.visibilityState === 'visible' && document.hasFocus());
      return;
    }

    try {
      runtime.sendMessage({ type: READY_MESSAGE }, (response) => {
        if (chrome.runtime.lastError) {
          applyActiveSurface(document.visibilityState === 'visible' && document.hasFocus());
          return;
        }
        applyActiveSurface(response?.active === true);
      });
    } catch {
      applyActiveSurface(document.visibilityState === 'visible' && document.hasFocus());
    }
  }

  if (storage) {
    loadStartupSettings();
    requestActiveSurface();
    storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.enabled) {
        applyEnabled(changes.enabled.newValue !== false);
      }
      if (area === 'local' && changes[OFF_DUTY_STORAGE_KEY]) {
        applyOffDuty(changes[OFF_DUTY_STORAGE_KEY].newValue === true);
      }
      if (area === 'local' && changes[STUDY_STORAGE_KEY] && state.host) {
        applyStudySession(changes[STUDY_STORAGE_KEY].newValue, {
          showRestNotice: true,
        });
      }
    });
  } else {
    state.settingsLoaded = true;
    applyEnabled(true);
    requestActiveSurface();
  }

  if (runtime?.onMessage) {
    runtime.onMessage.addListener((message) => {
      if (message?.type === ACTIVE_MESSAGE) applyActiveSurface(message.active === true);
    });
  }

  window.addEventListener('pagehide', () => persistActorSnapshot({ force: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistActorSnapshot({ force: true });
    else requestActiveSurface();
  });
})();
