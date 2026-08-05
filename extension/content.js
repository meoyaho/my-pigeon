(() => {
  if (window.__myPigeonExtensionLoaded) return;
  window.__myPigeonExtensionLoaded = true;

  const ROOT_ID = 'my-pigeon-extension-root';
  const DEFAULTS = { enabled: true };
  const MAX_TEMPORARY_PIGEONS = 8;

  const CONFIG = {
    idleDurationMs: 25 * 60 * 1000,
    weirdBehaviorIntervalMs: 15000,
    weirdBehaviorDurationMs: 2500,
    oneLegDozeDurationMs: 5 * 60 * 1000,
    walkSpeed: 0.06,
    flightSpeed: 0.35,
    hopSpeed: 0.06,
    hopProbability: 0.35,
    backwardsWalkProbability: 0.18,
    cornerArrivalThreshold: 80,
    spawnStaggerMs: 150,
    feedModeTimeoutMs: 5000,
    scatterVelocityPxPerMs: 1.3,
    accessoryScanIntervalMs: 1200,
    accessoryPickupCooldownMs: 4000,
  };

  const SPRITES = {
    idle: ['idle_01.png', 'idle_02.png'],
    walk: ['walk_01.png', 'walk_02.png'],
    hopInPlace: ['hopInPlace_01.png', 'hopInPlace_02.png'],
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
    '개같은 아침! 출근했다',
    '오늘 하루도 힘내자고',
    '자, 오늘도 시작해볼까',
    '나 왔다. 각자의 자리에서 최선을 다하자고',
  ];

  const FAREWELLS = [
    '오늘도 수고했다',
    '내일 또 만나',
    '오늘 하루도 끝! 빨리 꺼져',
    '쉬어, 나도 이만 애보러 간다',
    '오늘 몫은 다 했다, 안녕!',
  ];

  const state = {
    host: null,
    shadow: null,
    main: null,
    tempActors: [],
    nextActorId: 1,
    menu: null,
    feedLayer: null,
    food: null,
    bubbleTimer: null,
    timers: new Set(),
    raf: 0,
    lastTickAt: 0,
    phase: 'normal',
    feed: {
      choosing: false,
      feeding: false,
      point: null,
      spawnTimerMs: 0,
      spawnedCount: 0,
      timeoutId: null,
    },
    mouse: {
      x: 0,
      y: 0,
      t: 0,
    },
    draggedAsset: null,
    nextAccessoryScanAt: 0,
    accessoryPickupCooldownUntil: 0,
  };

  const runtime = typeof chrome !== 'undefined' ? chrome.runtime : null;
  const storage = typeof chrome !== 'undefined' ? chrome.storage : null;

  function asset(path) {
    return runtime ? runtime.getURL(path) : path;
  }

  function spriteUrl(fileName) {
    return asset(`assets/sprites/${fileName}`);
  }

  function pick(items) {
    return items[Math.floor(Math.random() * items.length) % items.length];
  }

  function isHtmlDocument() {
    return document.documentElement && document.documentElement.nodeName.toLowerCase() === 'html';
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
      ? '<div class="bubble" aria-hidden="true"></div><img class="head-accessory" alt="" draggable="false" hidden /><img class="pigeon-img" alt="" draggable="false" />'
      : '<img class="pigeon-img" alt="" draggable="false" />';

    const actor = {
      id: state.nextActorId,
      kind,
      el,
      img: el.querySelector('.pigeon-img'),
      bubble: el.querySelector('.bubble'),
      accessoryImg: el.querySelector('.head-accessory'),
      headAsset: null,
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
    if (actor.headAsset?.objectUrl) URL.revokeObjectURL(actor.headAsset.objectUrl);
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
    const accessoryClearance = actor?.headAsset ? Math.min(52, Math.max(32, box.height * 0.2)) : 0;
    return {
      x: box.width / 2 + 8,
      y: box.height / 2 + 8 + accessoryClearance,
    };
  }

  function clampCenter(point, actor = state.main) {
    const margin = getMargins(actor);
    return {
      x: Math.max(margin.x, Math.min(window.innerWidth - margin.x, point.x)),
      y: Math.max(margin.y, Math.min(window.innerHeight - margin.y, point.y)),
    };
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
    actor.el.style.setProperty('--head-accessory-x', actor.facingRight ? '60%' : '40%');
    actor.el.style.setProperty('--head-accessory-tilt', actor.facingRight ? '5deg' : '-5deg');
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
    if (actor.kind === 'main' && actor.headAsset && !canCarryHeadAssetInMode(mode)) {
      dropHeadAsset(actor);
    }
    actor.mode = mode;
    actor.frameIndex = 0;
    actor.lastFrameAt = now;
    actor.stateElapsedMs = 0;
    applyFacing(actor, mode);
    updateFrame(actor, true, now);
  }

  function weirdBehaviorDurationFor(mode) {
    return mode === 'oneLegDoze'
      ? CONFIG.oneLegDozeDurationMs
      : CONFIG.weirdBehaviorDurationMs;
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

  function canCarryHeadAssetInMode(mode) {
    return mode === 'idle' || mode === 'walk' || mode === 'hopInPlace';
  }

  function isMainIdleForAccessory() {
    const actor = state.main;
    return Boolean(actor && state.phase === 'normal' && actor.mode === 'idle' && !actor.target && !actor.drag);
  }

  function attachHeadAsset(actor, asset) {
    if (!actor?.accessoryImg || !asset?.src || !isMainIdleForAccessory()) return false;
    if (actor.headAsset?.objectUrl) URL.revokeObjectURL(actor.headAsset.objectUrl);
    actor.headAsset = {
      src: asset.src,
      objectUrl: asset.objectUrl || null,
    };
    actor.accessoryImg.src = asset.src;
    actor.accessoryImg.hidden = false;
    return true;
  }

  function dropHeadAsset(actor = state.main) {
    if (!actor?.headAsset || !actor.accessoryImg) return;

    const oldAsset = actor.headAsset;
    const rect = actor.accessoryImg.getBoundingClientRect();
    const falling = document.createElement('img');
    falling.className = 'fallen-accessory';
    falling.src = oldAsset.src;
    falling.alt = '';
    falling.draggable = false;
    falling.style.left = `${Math.round(rect.left)}px`;
    falling.style.top = `${Math.round(rect.top)}px`;
    falling.style.width = `${Math.max(20, Math.round(rect.width || 34))}px`;
    falling.style.height = `${Math.max(20, Math.round(rect.height || 34))}px`;
    state.shadow?.appendChild(falling);
    later(() => falling.remove(), 1200);

    actor.accessoryImg.hidden = true;
    actor.accessoryImg.removeAttribute('src');
    actor.headAsset = null;
    state.accessoryPickupCooldownUntil = performance.now() + CONFIG.accessoryPickupCooldownMs;
    if (oldAsset.objectUrl) later(() => URL.revokeObjectURL(oldAsset.objectUrl), 1200);
  }

  function parseCssImageUrl(backgroundImage) {
    const match = /url\((['"]?)(.*?)\1\)/.exec(backgroundImage || '');
    return match ? match[2] : '';
  }

  function normalizeImageUrl(src) {
    if (!src) return '';
    try {
      return new URL(src, document.baseURI).href;
    } catch {
      return '';
    }
  }

  function isUsableImageUrl(src) {
    return /^(https?:|data:image\/|blob:)/i.test(src);
  }

  function imageAssetFromElement(element) {
    if (!element || element === state.host || state.host?.contains(element)) return null;
    const candidate = element.closest?.('img, [draggable="true"]') || element;

    let src = '';
    if (candidate instanceof HTMLImageElement) {
      src = candidate.currentSrc || candidate.src;
    }

    if (!src) {
      const childImage = candidate.querySelector?.('img');
      if (childImage instanceof HTMLImageElement) {
        src = childImage.currentSrc || childImage.src;
      }
    }

    if (!src && candidate instanceof Element) {
      src = parseCssImageUrl(getComputedStyle(candidate).backgroundImage);
    }

    src = normalizeImageUrl(src);
    if (!isUsableImageUrl(src)) return null;
    return { src };
  }

  function imageAssetFromDataTransfer(dataTransfer) {
    if (!dataTransfer) return null;

    const imageFile = [...(dataTransfer.files || [])].find((file) => file.type.startsWith('image/'));
    if (imageFile) {
      const objectUrl = URL.createObjectURL(imageFile);
      return { src: objectUrl, objectUrl };
    }

    const html = dataTransfer.getData('text/html');
    if (html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const img = doc.querySelector('img[src]');
      const src = normalizeImageUrl(img?.getAttribute('src'));
      if (isUsableImageUrl(src)) return { src };
    }

    const uriList = dataTransfer.getData('text/uri-list')
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith('#'));
    const uri = normalizeImageUrl(uriList);
    if (isUsableImageUrl(uri)) return { src: uri };

    const plainText = dataTransfer.getData('text/plain').trim();
    if (/^(https?:|data:image\/|blob:)/i.test(plainText)) {
      const text = normalizeImageUrl(plainText);
      if (isUsableImageUrl(text)) return { src: text };
    }

    return state.draggedAsset ? { ...state.draggedAsset } : null;
  }

  function cornerRegionForActor(actor) {
    const cornerIndex = nearestCornerIndex(actor);
    const width = Math.min(360, Math.max(180, window.innerWidth * 0.34));
    const height = Math.min(300, Math.max(160, window.innerHeight * 0.34));
    const right = cornerIndex === 1 || cornerIndex === 3;
    const bottom = cornerIndex === 2 || cornerIndex === 3;
    return {
      left: right ? window.innerWidth - width : 0,
      top: bottom ? window.innerHeight - height : 0,
      right: right ? window.innerWidth : width,
      bottom: bottom ? window.innerHeight : height,
    };
  }

  function rectsIntersect(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function findCornerImageAsset(actor) {
    const region = cornerRegionForActor(actor);
    const candidates = document.querySelectorAll('img:not([draggable="false"]), [draggable="true"] img, [draggable="true"]');
    let best = null;
    let bestDistance = Infinity;

    for (const element of candidates) {
      if (!(element instanceof Element) || state.host?.contains(element)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 12 || rect.height < 12) continue;
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) continue;
      if (!rectsIntersect(rect, region)) continue;

      const asset = imageAssetFromElement(element);
      if (!asset) continue;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(centerX - actor.x, centerY - actor.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = asset;
      }
    }

    return best;
  }

  function maybePickupCornerAsset(now) {
    const actor = state.main;
    if (!actor || actor.headAsset || !isMainIdleForAccessory()) return;
    if (!isAtCorner(actor)) return;
    if (now < state.nextAccessoryScanAt || now < state.accessoryPickupCooldownUntil) return;
    state.nextAccessoryScanAt = now + CONFIG.accessoryScanIntervalMs;

    const asset = findCornerImageAsset(actor);
    if (asset) attachHeadAsset(actor, asset);
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

  function resolveTravelTarget(actor, target, options = {}) {
    return options.clampTarget === false ? target : clampCenter(target, actor);
  }

  function travelActor(actor, target, mode, speedPxPerMs, onArrive = null, options = {}) {
    const resolvedTarget = resolveTravelTarget(actor, target, options);
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

  function triggerWeirdBehavior(actor, now) {
    dropHeadAsset(actor);
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

    if (actor.weirdBehaviorTimerMs >= CONFIG.weirdBehaviorIntervalMs) {
      triggerWeirdBehavior(actor, now);
      return;
    }

    maybePickupCornerAsset(now);

    if (actor.stateElapsedMs >= CONFIG.idleDurationMs) {
      walkToRandomCorner(actor);
    }
  }

  function startCommuteIn() {
    const actor = state.main;
    state.phase = 'commuteIn';
    actor.x = -150;
    actor.y = -100;
    actor.allowOffscreen = true;
    applyActorPosition(actor);

    travelActorDuration(actor, {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }, 'flyIn', 1200, (now) => {
      state.phase = 'normal';
      enterIdle(actor, now);
      showBubble(pick(GREETINGS), 2400);
      later(() => {
        if (state.host && state.phase === 'normal' && !actor.drag) {
          walkToRandomCorner(actor, true);
        }
      }, 3000);
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

    const center = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    travelActor(actor, center, 'walk', CONFIG.walkSpeed, (now) => {
      enterIdle(actor, now);
      showBubble(pick(FAREWELLS), 1600);
      later(() => {
        travelActorDuration(actor, {
          x: window.innerWidth + 150,
          y: -100,
        }, 'flyOut', 1000, () => {
          unmount();
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

  function startFeedMode(event = null) {
    if (state.phase === 'commuteOut' || state.feed.feeding) return;
    hideMenu();
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
    if (state.feed.feeding || !state.main) return;
    state.phase = 'feeding';
    state.feed.feeding = true;
    state.feed.point = point;
    state.feed.spawnTimerMs = 0;
    state.feed.spawnedCount = 0;
    showFoodAt(point);

    travelActor(state.main, point, 'flyIn', CONFIG.flightSpeed, (now) => {
      setMode(state.main, 'eat', now);
    });
  }

  function spawnTemporaryPigeon() {
    const foodPoint = state.feed.point;
    if (!foodPoint) return;

    state.feed.spawnedCount += 1;
    const eatAngle = (state.feed.spawnedCount / MAX_TEMPORARY_PIGEONS) * Math.PI * 2;
    const rawEatPoint = {
      x: foodPoint.x + Math.cos(eatAngle) * 40,
      y: foodPoint.y + Math.sin(eatAngle) * 40,
    };

    const temp = createActor('temporary', rawEatPoint.x, rawEatPoint.y);
    const eatPoint = clampCenter(rawEatPoint, temp);
    const arrivalAngle = Math.random() * Math.PI * 2;
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
    updateMainIdleBehavior(deltaMs, now);
    updateFeeding(deltaMs);

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

  function onMainDragOver(event) {
    if (!isMainIdleForAccessory()) return;
    const asset = state.draggedAsset || imageAssetFromDataTransfer(event.dataTransfer);
    if (!asset) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function onMainDrop(event) {
    if (!isMainIdleForAccessory()) return;
    const asset = imageAssetFromDataTransfer(event.dataTransfer);
    if (!asset) return;
    event.preventDefault();
    event.stopPropagation();
    attachHeadAsset(state.main, asset);
    state.draggedAsset = null;
  }

  function onDocumentDragStart(event) {
    state.draggedAsset = imageAssetFromElement(event.target);
  }

  function onDocumentDragEnd() {
    state.draggedAsset = null;
  }

  function onContextMenu(event) {
    if (state.phase === 'commuteOut') return;
    event.preventDefault();
    event.stopPropagation();
    showMenu(event.clientX, event.clientY);
  }

  function showMenu(clientX, clientY) {
    if (!state.menu) return;
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
    if (!state.main?.drag && state.phase === 'normal' && Math.random() < 0.4) {
      setMode(state.main, 'startled');
      later(() => {
        if (state.phase === 'normal') fleeToRandomCorner(state.main);
      }, 1500);
    }
  }

  function bindEvents() {
    const actor = state.main;
    actor.el.addEventListener('pointerdown', onMainPointerDown);
    actor.el.addEventListener('pointermove', onMainPointerMove);
    actor.el.addEventListener('pointerup', onMainPointerUp);
    actor.el.addEventListener('pointercancel', onMainPointerUp);
    actor.el.addEventListener('contextmenu', onContextMenu);
    actor.el.addEventListener('dragover', onMainDragOver);
    actor.el.addEventListener('drop', onMainDrop);
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
    window.addEventListener('resize', onWindowResize, { passive: true });
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('dragstart', onDocumentDragStart, true);
    document.addEventListener('dragend', onDocumentDragEnd, true);
  }

  function mount() {
    if (!isHtmlDocument() || state.host || document.getElementById(ROOT_ID)) return;

    const host = document.createElement('my-pigeon');
    host.id = ROOT_ID;
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
      'opacity: 1 !important',
      'visibility: visible !important',
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
          width: clamp(160px, 22vmin, 240px);
          height: clamp(112px, 18vmin, 168px);
          pointer-events: none;
          user-select: none;
          touch-action: none;
          transform: translate3d(0, 0, 0);
          will-change: transform;
        }

        .pigeon-wrap.main {
          z-index: 3;
          pointer-events: auto;
          cursor: grab;
        }

        .pigeon-wrap.temporary {
          z-index: 2;
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

        .head-accessory {
          position: absolute;
          left: var(--head-accessory-x, 50%);
          top: -25%;
          z-index: 2;
          width: clamp(22px, 3.8vmin, 34px);
          height: clamp(22px, 3.8vmin, 34px);
          object-fit: contain;
          pointer-events: none;
          transform: translate(-50%, 0) rotate(var(--head-accessory-tilt, -5deg));
          transform-origin: center bottom;
          filter: drop-shadow(0 4px 5px rgba(0, 0, 0, 0.18));
          -webkit-user-drag: none;
        }

        .head-accessory[hidden] {
          display: none;
        }

        .fallen-accessory {
          position: absolute;
          z-index: 1;
          object-fit: contain;
          pointer-events: none;
          animation: pigeon-accessory-fall 1100ms ease-in forwards;
          filter: drop-shadow(0 4px 5px rgba(0, 0, 0, 0.14));
        }

        @keyframes pigeon-accessory-fall {
          0% {
            opacity: 1;
            transform: translate3d(0, 0, 0) rotate(-5deg);
          }
          100% {
            opacity: 0;
            transform: translate3d(12px, 72px, 0) rotate(28deg);
          }
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
          z-index: 4;
          min-width: 112px;
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
          display: block;
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
          z-index: 5;
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
        <button type="button" data-action="feed">먹이 주기</button>
        <button type="button" data-action="commute-out">퇴근</button>
      </nav>
    `;

    document.documentElement.appendChild(host);
    state.host = host;
    state.shadow = shadow;
    state.menu = shadow.querySelector('.menu');
    state.feedLayer = shadow.querySelector('.feed-layer');
    state.food = shadow.querySelector('.food');
    state.main = createActor('main', -150, -100);

    bindEvents();
    startCommuteIn();

    state.lastTickAt = performance.now();
    state.raf = window.requestAnimationFrame(tick);
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
    window.removeEventListener('resize', onWindowResize);
    window.removeEventListener('blur', onWindowBlur);
    document.removeEventListener('dragstart', onDocumentDragStart, true);
    document.removeEventListener('dragend', onDocumentDragEnd, true);
    if (state.main?.headAsset?.objectUrl) URL.revokeObjectURL(state.main.headAsset.objectUrl);
    if (state.host) state.host.remove();
    state.host = null;
    state.shadow = null;
    state.main = null;
    state.tempActors = [];
    state.menu = null;
    state.feedLayer = null;
    state.food = null;
    state.phase = 'normal';
    state.draggedAsset = null;
    state.nextAccessoryScanAt = 0;
    state.accessoryPickupCooldownUntil = 0;
    state.feed = {
      choosing: false,
      feeding: false,
      point: null,
      spawnTimerMs: 0,
      spawnedCount: 0,
      timeoutId: null,
    };
  }

  function applyEnabled(enabled) {
    if (enabled) mount();
    else unmount();
  }

  if (storage?.sync) {
    storage.sync.get(DEFAULTS, (settings) => {
      applyEnabled(settings.enabled !== false);
    });
    storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.enabled) {
        applyEnabled(changes.enabled.newValue !== false);
      }
    });
  } else {
    applyEnabled(true);
  }
})();
