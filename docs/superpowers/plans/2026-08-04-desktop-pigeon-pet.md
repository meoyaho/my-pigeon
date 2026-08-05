# Desktop Pigeon Pet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Electron desktop app that shows a pixel-art pigeon roaming a transparent always-on-top overlay, with feeding, scatter, drag, commute, weather, focus-change, and camera-photo interactions, per `docs/superpowers/specs/2026-08-04-desktop-pigeon-pet-design.md`.

**Architecture:** Electron main process owns OS integration (tray, active-window polling, weather fetch, camera window, app lifecycle). A single transparent/frameless/always-on-top renderer window runs a PixiJS scene driving a finite-state-machine (FSM) per pigeon. Main and renderer communicate over a small fixed set of IPC channels.

**Tech Stack:** Electron, PixiJS (`pixi.js`), Node.js, `active-win` (focus detection), Open-Meteo + `ip-api.com`-style free IP geolocation (no key), Jest for pure-logic unit tests.

## Global Constraints

- No sound features anywhere in the app (per spec section 1).
- No affection/closeness system (spec "v1 스코프 밖").
- No fixed 09:00/18:00 schedule — CommuteIn fires on app launch, CommuteOut fires only from the tray "퇴근" menu item, which also quits the app (spec section 3, "출퇴근").
- Tray menu has exactly 3 items: 먹이 주기 / 퇴근 (spec section 1 & clarification). No separate "종료" item.
- Overlay window is click-through by default everywhere except: (a) a pigeon's hit box, (b) during the 5-second food-placement mode when the whole screen is clickable (spec section 3, "먹이 주기").
- Max 8 temporary pigeons + 1 main pigeon = 9 total during feeding (spec section 2).
- Weird behaviors are exactly these 5, chosen at random: 발라당 뒤집기 (flip-over), 머리에 깃털 꽂기 (feather-on-head), 한 다리로 졸기 (one-leg doze), 구애 구구거리기 (courtship coo), 폴짝폴짝 뛰기 (hop-in-place).
- Weather API: Open-Meteo (no API key required). IP geolocation must degrade gracefully to "weather feature disabled" on failure, never crash the app.
- Pixel-art sprite assets are not hand-drawn in this plan (no artist in the loop). Task 3 builds a **placeholder procedurally-generated spritesheet** (simple pixel-block frames) behind a `spriteLoader` interface, so real pixel art can be dropped in later without touching any other file.

---

## File Structure

```
desktop-pigeon-pet/
  package.json
  electron-builder.yml
  electron/
    main.js                 # app entry, wires everything together
    ipcChannels.js           # shared IPC channel name constants (used by main + renderer)
    overlayWindow.js         # creates the transparent overlay BrowserWindow
    tray.js                  # tray icon + 3-item menu
    activeWindowWatcher.js   # polls active-win, emits change events
    weather.js               # IP geolocation + Open-Meteo fetch, with fallback
    cameraWindow.js           # small BrowserWindow for photo capture
  renderer/
    index.html
    index.js                 # Pixi app bootstrap, game loop, wires IPC listeners
    pigeon/
      states.js              # state name constants + weird-behavior pool
      phrases.js             # commute-in / commute-out phrase pools + picker
      spriteLoader.js         # placeholder spritesheet generator + frame lookup
      Pigeon.js                # Pigeon class: FSM + Pixi sprite + per-state update()
      flock.js                 # owns main pigeon + temporary pigeon pool, feeding sequence
    interactions/
      mouseTracker.js          # velocity/threshold logic for 훠이훠이 scatter (pure logic)
      dragHandler.js            # mousedown/mouseup drag wiring on a Pigeon's sprite
      feedMode.js                # food-placement mode state machine (pure logic) + Pixi cursor swap
      messageBubble.js           # renders a Pixi speech bubble with text + auto-hide timer
  tests/
    states.test.js
    phrases.test.js
    mouseTracker.test.js
    feedMode.test.js
    flock.test.js
  assets/
    tray-icon.png            # generated placeholder tray icon (Task 1)
```

**Boundary rules:**
- Anything in `renderer/pigeon/*` and `renderer/interactions/mouseTracker.js`, `feedMode.js` is pure JS with no DOM/Pixi/Electron globals where feasible, so it's unit-testable with Jest. Pixi/DOM wiring lives at the edges (`Pigeon.js`'s render calls, `index.js`, `dragHandler.js`, `messageBubble.js`).
- `electron/*` files are Electron-API glue; verified manually (per spec's own testing strategy — automated Electron window testing has low value here).

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `electron/main.js` (minimal — opens a single empty window, quits on all-windows-closed)
- Create: `electron/ipcChannels.js`
- Create: `renderer/index.html`
- Create: `renderer/index.js` (just logs "renderer ready" for now)
- Create: `assets/tray-icon.png` (16x16 solid-color PNG, generated via Node `Buffer` — no external tool needed)

**Interfaces:**
- Produces: `IPC` constant object exported from `electron/ipcChannels.js` with keys `FEED_TRIGGERED`, `FEED_PLACED`, `SCATTER`, `COMMUTE_IN`, `COMMUTE_OUT`, `FOCUS_CHANGED`, `WEATHER_UPDATED`, `OPEN_CAMERA`. (Values are the same strings as keys, lowercased with hyphens, e.g. `'feed-triggered'`.) All later tasks import from this file — never hardcode channel strings elsewhere.

- [ ] **Step 1: Initialize package.json and install dependencies**

```bash
cd /Users/jisuryou/desktop-pigeon-pet
npm init -y
npm install electron pixi.js active-win --save
npm install jest --save-dev
```

Edit `package.json` scripts section:

```json
{
  "name": "desktop-pigeon-pet",
  "version": "0.1.0",
  "main": "electron/main.js",
  "scripts": {
    "start": "electron .",
    "test": "jest"
  }
}
```

- [ ] **Step 2: Create the IPC channel constants**

`electron/ipcChannels.js`:

```js
const IPC = {
  FEED_TRIGGERED: 'feed-triggered',
  FEED_PLACED: 'feed-placed',
  SCATTER: 'scatter',
  COMMUTE_IN: 'commute-in',
  COMMUTE_OUT: 'commute-out',
  FOCUS_CHANGED: 'focus-changed',
  WEATHER_UPDATED: 'weather-updated',
  OPEN_CAMERA: 'open-camera',
};

module.exports = { IPC };
```

- [ ] **Step 3: Create a minimal main process entry**

`electron/main.js`:

```js
const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'index.js'),
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 4: Create renderer shell**

`renderer/index.html`:

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Pigeon</title></head>
<body style="margin:0;overflow:hidden;background:transparent;">
  <script src="index.js"></script>
</body>
</html>
```

`renderer/index.js`:

```js
console.log('renderer ready');
```

- [ ] **Step 5: Generate a placeholder tray icon**

Create `scripts/generate-tray-icon.js`:

```js
const fs = require('fs');
const path = require('path');

// 16x16 solid gray PNG, hand-encoded minimal PNG bytes are impractical here,
// so we draw it with a tiny canvas-free PNG writer is overkill for a placeholder.
// Simplest reliable approach: write a 1x1 transparent PNG and let macOS/Windows
// scale it; Electron accepts any valid PNG for tray icons.
const onePixelTransparentPng = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6360000002000155a8f9500000000049454e44ae426082',
  'hex'
);
fs.mkdirSync(path.join(__dirname, '..', 'assets'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'assets', 'tray-icon.png'), onePixelTransparentPng);
console.log('tray-icon.png written');
```

Run it:

```bash
node scripts/generate-tray-icon.js
```

Expected: `assets/tray-icon.png` exists (this is a functional placeholder; swap for a real icon later — no other file depends on its pixel content, only its path).

- [ ] **Step 6: Manual verification**

Run: `npm start`
Expected: an empty Electron window opens, devtools console (via `win.webContents.openDevTools()` if needed) shows "renderer ready", app quits cleanly on window close.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json electron/ renderer/ scripts/ assets/
git commit -m "chore: scaffold electron project with IPC channel constants"
```

---

### Task 2: Transparent overlay window with click-through toggling

**Files:**
- Create: `electron/overlayWindow.js`
- Modify: `electron/main.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `createOverlayWindow()` returning a `BrowserWindow` instance; the module also exports `setClickThroughExceptRegion(win, region)` where `region` is `{x, y, width, height} | null` — passing `null` makes the whole window click-through (default state), passing a rect makes only that rect clickable (used later for pigeon hit-testing and feed-mode). This is the only place `setIgnoreMouseEvents` is called — later tasks call `setClickThroughExceptRegion`, never the raw Electron API directly.

- [ ] **Step 1: Implement the overlay window factory**

`electron/overlayWindow.js`:

```js
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
      contextIsolation: true,
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
```

- [ ] **Step 2: Create the preload script**

`renderer/preload.js`:

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pigeonBridge', {
  send: (channel, payload) => ipcRenderer.send(channel, payload),
  on: (channel, callback) => ipcRenderer.on(channel, (_event, payload) => callback(payload)),
});
```

- [ ] **Step 3: Wire it into main.js**

Modify `electron/main.js`:

```js
const { app, ipcMain } = require('electron');
const { createOverlayWindow, setClickThroughExceptRegion } = require('./overlayWindow');

let overlayWin;

app.whenReady().then(() => {
  overlayWin = createOverlayWindow();

  ipcMain.on('cursor-over-hitbox', (_event, isOverHitbox) => {
    setClickThroughExceptRegion(overlayWin, isOverHitbox);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

(This replaces the Task 1 `createWindow`/`BrowserWindow` code entirely.)

- [ ] **Step 4: Manual verification**

Run: `npm start`
Expected: a fullscreen transparent window appears (nothing visible since renderer is empty), it does not appear in the taskbar/dock switcher, and clicking anywhere passes the click through to whatever app is behind it (verify by clicking a Finder/Explorer icon underneath — it should activate).

- [ ] **Step 5: Commit**

```bash
git add electron/overlayWindow.js electron/main.js renderer/preload.js
git commit -m "feat: transparent always-on-top overlay window with click-through toggling"
```

---

### Task 3: Placeholder pixel-art spritesheet + sprite loader

**Files:**
- Create: `renderer/pigeon/spriteLoader.js`
- Test: `tests/spriteLoader.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildPlaceholderSpritesheet(PIXI)` → returns a `PIXI.Spritesheet`-like lookup object `{ frames: { [animationName]: PIXI.Texture[] } }` for these animation names, each with the given frame count: `idle`(2), `walk`(4), `flipOver`(3), `featherOnHead`(2), `oneLegDoze`(2), `courtshipCoo`(3), `hopInPlace`(2), `flyIn`(3), `flyOut`(3), `eat`(2), `startled`(2), `weatherHuddle`(2), `dragged`(1). Later tasks (`Pigeon.js`, `states.js`) reference these exact animation-name strings.

- [ ] **Step 1: Write the failing test**

`tests/spriteLoader.test.js`:

```js
const { ANIMATION_FRAME_COUNTS, getAnimationNames } = require('../renderer/pigeon/spriteLoader');

test('exposes exactly the 13 required animation names', () => {
  const names = getAnimationNames();
  expect(names.sort()).toEqual([
    'courtshipCoo', 'dragged', 'eat', 'featherOnHead', 'flipOver',
    'flyIn', 'flyOut', 'hopInPlace', 'idle', 'oneLegDoze',
    'startled', 'walk', 'weatherHuddle',
  ].sort());
});

test('frame counts match spec', () => {
  expect(ANIMATION_FRAME_COUNTS.idle).toBe(2);
  expect(ANIMATION_FRAME_COUNTS.walk).toBe(4);
  expect(ANIMATION_FRAME_COUNTS.flipOver).toBe(3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/spriteLoader.test.js`
Expected: FAIL — `spriteLoader` module not found.

- [ ] **Step 3: Implement spriteLoader.js**

```js
const ANIMATION_FRAME_COUNTS = {
  idle: 2,
  walk: 4,
  flipOver: 3,
  featherOnHead: 2,
  oneLegDoze: 2,
  courtshipCoo: 3,
  hopInPlace: 2,
  flyIn: 3,
  flyOut: 3,
  eat: 2,
  startled: 2,
  weatherHuddle: 2,
  dragged: 1,
};

function getAnimationNames() {
  return Object.keys(ANIMATION_FRAME_COUNTS);
}

// Builds a placeholder spritesheet: for each animation, a set of small
// PIXI.Graphics-rendered textures (colored pixel blocks) so the FSM and
// rendering pipeline are fully wired and visually testable before real
// pixel art exists. Swapping in a real spritesheet later only requires
// replacing this function's body — callers only see frames[name] arrays.
function buildPlaceholderSpritesheet(PIXI, renderer) {
  const frames = {};
  const colors = [0x8b7d6b, 0xa89a8a, 0x6b5d4d, 0xc4b8a8]; // pigeon-ish grays/browns

  for (const [name, count] of Object.entries(ANIMATION_FRAME_COUNTS)) {
    frames[name] = [];
    for (let i = 0; i < count; i++) {
      const g = new PIXI.Graphics();
      g.beginFill(colors[i % colors.length]);
      g.drawRoundedRect(0, 0, 24, 24, 4);
      g.endFill();
      // Small offset per frame so animations visibly change (placeholder motion cue).
      g.beginFill(0x2b2b2b);
      g.drawCircle(16 + (i % 2 === 0 ? 0 : 2), 8, 2);
      g.endFill();
      frames[name].push(renderer.generateTexture(g));
    }
  }
  return { frames };
}

module.exports = { ANIMATION_FRAME_COUNTS, getAnimationNames, buildPlaceholderSpritesheet };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/spriteLoader.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add renderer/pigeon/spriteLoader.js tests/spriteLoader.test.js
git commit -m "feat: placeholder pixel-art spritesheet generator with 13 animation slots"
```

---

### Task 4: Pigeon state names, weird-behavior pool, and phrase pools (pure logic)

**Files:**
- Create: `renderer/pigeon/states.js`
- Create: `renderer/pigeon/phrases.js`
- Test: `tests/states.test.js`
- Test: `tests/phrases.test.js`

**Interfaces:**
- Produces from `states.js`: `STATES` object with keys `IDLE, WALKING, WEIRD_BEHAVIOR, FLYING_TO_FOOD, EATING, SCATTERING, STARTLED, WEATHER_REACTION, DRAGGED, COMMUTE_IN, COMMUTE_OUT` (string values, same as keys but as animation-agnostic state IDs — distinct from the animation names in Task 3). Also `WEIRD_BEHAVIORS` array of the 5 behavior IDs (`'flipOver', 'featherOnHead', 'oneLegDoze', 'courtshipCoo', 'hopInPlace'`) and `pickRandomWeirdBehavior(rng = Math.random)` returning one of them.
- Produces from `phrases.js`: `COMMUTE_IN_PHRASES` (array of ≥4 Korean strings), `COMMUTE_OUT_PHRASES` (array of ≥4 Korean strings), `pickCommuteInPhrase(rng)`, `pickCommuteOutPhrase(rng)`.

- [ ] **Step 1: Write failing tests**

`tests/states.test.js`:

```js
const { STATES, WEIRD_BEHAVIORS, pickRandomWeirdBehavior } = require('../renderer/pigeon/states');

test('has exactly the 5 spec-required weird behaviors', () => {
  expect(WEIRD_BEHAVIORS.sort()).toEqual(
    ['flipOver', 'featherOnHead', 'oneLegDoze', 'courtshipCoo', 'hopInPlace'].sort()
  );
});

test('pickRandomWeirdBehavior always returns a valid behavior', () => {
  const rng = () => 0; // deterministic
  expect(WEIRD_BEHAVIORS).toContain(pickRandomWeirdBehavior(rng));
});

test('pickRandomWeirdBehavior covers the full range', () => {
  const seen = new Set();
  for (let i = 0; i < WEIRD_BEHAVIORS.length; i++) {
    const rng = () => i / WEIRD_BEHAVIORS.length;
    seen.add(pickRandomWeirdBehavior(rng));
  }
  expect(seen.size).toBe(WEIRD_BEHAVIORS.length);
});

test('STATES has no duplicate values', () => {
  const values = Object.values(STATES);
  expect(new Set(values).size).toBe(values.length);
});
```

`tests/phrases.test.js`:

```js
const { COMMUTE_IN_PHRASES, COMMUTE_OUT_PHRASES, pickCommuteInPhrase, pickCommuteOutPhrase } = require('../renderer/pigeon/phrases');

test('has at least 4 phrases in each pool', () => {
  expect(COMMUTE_IN_PHRASES.length).toBeGreaterThanOrEqual(4);
  expect(COMMUTE_OUT_PHRASES.length).toBeGreaterThanOrEqual(4);
});

test('pickCommuteInPhrase returns a phrase from the pool', () => {
  expect(COMMUTE_IN_PHRASES).toContain(pickCommuteInPhrase(() => 0));
});

test('pickCommuteOutPhrase returns a phrase from the pool', () => {
  expect(COMMUTE_OUT_PHRASES).toContain(pickCommuteOutPhrase(() => 0.99));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/states.test.js tests/phrases.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement states.js**

```js
const STATES = {
  IDLE: 'IDLE',
  WALKING: 'WALKING',
  WEIRD_BEHAVIOR: 'WEIRD_BEHAVIOR',
  FLYING_TO_FOOD: 'FLYING_TO_FOOD',
  EATING: 'EATING',
  SCATTERING: 'SCATTERING',
  STARTLED: 'STARTLED',
  WEATHER_REACTION: 'WEATHER_REACTION',
  DRAGGED: 'DRAGGED',
  COMMUTE_IN: 'COMMUTE_IN',
  COMMUTE_OUT: 'COMMUTE_OUT',
};

const WEIRD_BEHAVIORS = ['flipOver', 'featherOnHead', 'oneLegDoze', 'courtshipCoo', 'hopInPlace'];

function pickRandomWeirdBehavior(rng = Math.random) {
  const index = Math.floor(rng() * WEIRD_BEHAVIORS.length);
  return WEIRD_BEHAVIORS[Math.min(index, WEIRD_BEHAVIORS.length - 1)];
}

module.exports = { STATES, WEIRD_BEHAVIORS, pickRandomWeirdBehavior };
```

- [ ] **Step 4: Implement phrases.js**

```js
const COMMUTE_IN_PHRASES = [
  '오늘도 열심히 해보자고',
  '좋은 아침! 출근했어요',
  '오늘 하루도 힘내봐요',
  '자, 오늘도 시작해볼까',
  '뭐부터 할까? 나 왔어요',
];

const COMMUTE_OUT_PHRASES = [
  '오늘도 수고했어',
  '내일 또 만나요',
  '오늘 하루도 끝! 잘 자요',
  '푹 쉬어요, 나도 이만 갈게',
  '오늘 몫은 다 했다, 안녕!',
];

function pickCommuteInPhrase(rng = Math.random) {
  return COMMUTE_IN_PHRASES[Math.floor(rng() * COMMUTE_IN_PHRASES.length) % COMMUTE_IN_PHRASES.length];
}

function pickCommuteOutPhrase(rng = Math.random) {
  return COMMUTE_OUT_PHRASES[Math.floor(rng() * COMMUTE_OUT_PHRASES.length) % COMMUTE_OUT_PHRASES.length];
}

module.exports = { COMMUTE_IN_PHRASES, COMMUTE_OUT_PHRASES, pickCommuteInPhrase, pickCommuteOutPhrase };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/states.test.js tests/phrases.test.js`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add renderer/pigeon/states.js renderer/pigeon/phrases.js tests/states.test.js tests/phrases.test.js
git commit -m "feat: pigeon state constants, weird-behavior pool, commute phrase pools"
```

---

### Task 5: Pigeon class — Idle/Walking/WeirdBehavior loop

**Files:**
- Create: `renderer/pigeon/Pigeon.js`
- Test: `tests/pigeon.test.js`

**Interfaces:**
- Consumes: `STATES`, `pickRandomWeirdBehavior` from `states.js` (Task 4); `buildPlaceholderSpritesheet` output shape from `spriteLoader.js` (Task 3).
- Produces: `class Pigeon` with constructor `(spritesheet, { x, y })`, method `update(deltaMs)` (advances internal timers/state, pure — no Pixi calls inside `update` itself so it's unit-testable), method `getState()` returning current `STATES` value, method `attachSprite(PIXI, container)` (the one Pixi-touching method, called once by `flock.js`/`index.js`). Later tasks (`flock.js`) construct `Pigeon` instances and call `update`/`attachSprite`.

- [ ] **Step 1: Write the failing test**

`tests/pigeon.test.js`:

```js
const { Pigeon } = require('../renderer/pigeon/Pigeon');
const { STATES } = require('../renderer/pigeon/states');

test('starts in IDLE state', () => {
  const p = new Pigeon(null, { x: 10, y: 10 });
  expect(p.getState()).toBe(STATES.IDLE);
});

test('transitions from IDLE to WALKING after idle timer elapses', () => {
  const p = new Pigeon(null, { x: 0, y: 0 }, { idleDurationMs: 100, rng: () => 0.9 });
  p.update(150);
  expect(p.getState()).toBe(STATES.WALKING);
});

test('enters WEIRD_BEHAVIOR when the weird-behavior timer elapses, then returns to IDLE', () => {
  const p = new Pigeon(null, { x: 0, y: 0 }, {
    idleDurationMs: 1_000_000, // never walk on its own during this test
    weirdBehaviorIntervalMs: 100,
    weirdBehaviorDurationMs: 50,
    rng: () => 0,
  });
  p.update(100);
  expect(p.getState()).toBe(STATES.WEIRD_BEHAVIOR);
  expect(p.currentWeirdBehavior).toBe('flipOver'); // rng()=>0 always picks index 0
  p.update(60);
  expect(p.getState()).toBe(STATES.IDLE);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/pigeon.test.js`
Expected: FAIL — `Pigeon` not found.

- [ ] **Step 3: Implement Pigeon.js**

```js
const { STATES, pickRandomWeirdBehavior } = require('./states');

const DEFAULTS = {
  idleDurationMs: 3000,
  weirdBehaviorIntervalMs: 15000,
  weirdBehaviorDurationMs: 2500,
  walkDurationMs: 2000,
  rng: Math.random,
};

class Pigeon {
  constructor(spritesheet, { x, y }, options = {}) {
    this.spritesheet = spritesheet;
    this.x = x;
    this.y = y;
    this.opts = { ...DEFAULTS, ...options };
    this.state = STATES.IDLE;
    this.currentWeirdBehavior = null;
    this.stateElapsedMs = 0;
    this.weirdBehaviorTimerMs = 0;
    this.sprite = null;
  }

  getState() {
    return this.state;
  }

  update(deltaMs) {
    this.stateElapsedMs += deltaMs;
    this.weirdBehaviorTimerMs += deltaMs;

    if (this.state === STATES.WEIRD_BEHAVIOR) {
      if (this.stateElapsedMs >= this.opts.weirdBehaviorDurationMs) {
        this._enterState(STATES.IDLE);
      }
      return;
    }

    if (this.weirdBehaviorTimerMs >= this.opts.weirdBehaviorIntervalMs &&
        (this.state === STATES.IDLE || this.state === STATES.WALKING)) {
      this.currentWeirdBehavior = pickRandomWeirdBehavior(this.opts.rng);
      this.weirdBehaviorTimerMs = 0;
      this._enterState(STATES.WEIRD_BEHAVIOR);
      return;
    }

    if (this.state === STATES.IDLE && this.stateElapsedMs >= this.opts.idleDurationMs) {
      this._enterState(STATES.WALKING);
    } else if (this.state === STATES.WALKING && this.stateElapsedMs >= this.opts.walkDurationMs) {
      this._enterState(STATES.IDLE);
    }
  }

  _enterState(newState) {
    this.state = newState;
    this.stateElapsedMs = 0;
  }

  // The only method that touches Pixi. Called once after construction by flock.js.
  attachSprite(PIXI, container) {
    const frames = this.spritesheet.frames.idle;
    this.sprite = new PIXI.AnimatedSprite(frames);
    this.sprite.x = this.x;
    this.sprite.y = this.y;
    this.sprite.animationSpeed = 0.1;
    this.sprite.play();
    container.addChild(this.sprite);
    return this.sprite;
  }
}

module.exports = { Pigeon };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/pigeon.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add renderer/pigeon/Pigeon.js tests/pigeon.test.js
git commit -m "feat: Pigeon FSM with idle/walking/weird-behavior loop"
```

---

### Task 6: Wire Pigeon into the Pixi renderer (main pigeon on screen)

**Files:**
- Modify: `renderer/index.js`

**Interfaces:**
- Consumes: `Pigeon` (Task 5), `buildPlaceholderSpritesheet` (Task 3).
- Produces: a running Pixi `Application` reachable as `window.__pigeonApp` for later tasks/manual debugging, and a `mainPigeon` module-level reference other renderer tasks will import via a small accessor — add `getMainPigeon()` export.

- [ ] **Step 1: Implement the Pixi bootstrap**

`renderer/index.js`:

```js
const PIXI = require('pixi.js');
const { buildPlaceholderSpritesheet } = require('./pigeon/spriteLoader');
const { Pigeon } = require('./pigeon/Pigeon');

const app = new PIXI.Application({
  width: window.innerWidth,
  height: window.innerHeight,
  transparent: true,
  antialias: true,
});
document.body.appendChild(app.view);
window.__pigeonApp = app;

const spritesheet = buildPlaceholderSpritesheet(PIXI, app.renderer);

let mainPigeon = new Pigeon(spritesheet, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
mainPigeon.attachSprite(PIXI, app.stage);

function getMainPigeon() {
  return mainPigeon;
}

app.ticker.add((delta) => {
  const deltaMs = app.ticker.deltaMS;
  mainPigeon.update(deltaMs);
});

module.exports = { getMainPigeon };
```

- [ ] **Step 2: Manual verification**

Run: `npm start`
Expected: overlay window shows a small colored pixel block (placeholder pigeon) roughly centered on screen; it should not error in devtools console. Leaving it running past `weirdBehaviorIntervalMs` (15s default) should not throw.

- [ ] **Step 3: Commit**

```bash
git add renderer/index.js
git commit -m "feat: render main pigeon in the overlay via Pixi ticker"
```

---

### Task 7: Tray menu + CommuteIn/CommuteOut wiring (app lifecycle)

**Files:**
- Create: `electron/tray.js`
- Modify: `electron/main.js`
- Modify: `renderer/index.js`
- Create: `renderer/pigeon/messageBubble.js`

**Interfaces:**
- Consumes: `IPC` (Task 1), `pickCommuteInPhrase`/`pickCommuteOutPhrase` (Task 4), `getMainPigeon` (Task 6).
- Produces: `createTray(overlayWin, onFeed, onPhoto, onCommuteOut)` from `tray.js`. `messageBubble.js` exports `showMessageBubble(PIXI, container, { x, y, text, durationMs = 3000 })` — draws a `PIXI.Container` with a rounded-rect background + `PIXI.Text`, auto-removes itself after `durationMs`. Later feeding/weather tasks don't use this, only commute does.

- [ ] **Step 1: Implement the tray**

`electron/tray.js`:

```js
const { Tray, Menu } = require('electron');
const path = require('path');

function createTray(onFeed, onPhoto, onCommuteOut) {
  const tray = new Tray(path.join(__dirname, '..', 'assets', 'tray-icon.png'));
  const menu = Menu.buildFromTemplate([
    { label: '먹이 주기', click: onFeed },
    { label: '퇴근', click: onCommuteOut },
  ]);
  tray.setToolTip('비둘기 펫');
  tray.setContextMenu(menu);
  return tray;
}

module.exports = { createTray };
```

- [ ] **Step 2: Implement the speech bubble renderer**

`renderer/pigeon/messageBubble.js`:

```js
function showMessageBubble(PIXI, container, { x, y, text, durationMs = 3000 }) {
  const bubble = new PIXI.Container();
  const padding = 8;

  const label = new PIXI.Text(text, { fontSize: 14, fill: 0x222222 });
  label.x = padding;
  label.y = padding;

  const bg = new PIXI.Graphics();
  bg.beginFill(0xffffff, 0.95);
  bg.lineStyle(1, 0x333333, 1);
  bg.drawRoundedRect(0, 0, label.width + padding * 2, label.height + padding * 2, 8);
  bg.endFill();

  bubble.addChild(bg, label);
  bubble.x = x;
  bubble.y = y - bg.height - 12;
  container.addChild(bubble);

  setTimeout(() => {
    container.removeChild(bubble);
    bubble.destroy({ children: true });
  }, durationMs);

  return bubble;
}

module.exports = { showMessageBubble };
```

- [ ] **Step 3: Wire IPC for commute events in main.js**

Modify `electron/main.js` (add to the `app.whenReady().then(...)` block):

```js
const { createTray } = require('./tray');
const { IPC } = require('./ipcChannels');

// ...inside app.whenReady().then(() => { ... })
overlayWin.webContents.once('did-finish-load', () => {
  overlayWin.webContents.send(IPC.COMMUTE_IN);
});

createTray(
  () => overlayWin.webContents.send(IPC.FEED_TRIGGERED),
  () => { /* wired in Task 12 */ },
  () => {
    overlayWin.webContents.send(IPC.COMMUTE_OUT);
    ipcMain.once('commute-out-animation-done', () => app.quit());
  }
);
```

- [ ] **Step 4: Handle commute events in the renderer**

Modify `renderer/index.js` (add near the bottom, after `mainPigeon` is created):

```js
const { showMessageBubble } = require('./pigeon/messageBubble');
const { pickCommuteInPhrase, pickCommuteOutPhrase } = require('./pigeon/phrases');
const { IPC } = require('../electron/ipcChannels');

window.pigeonBridge.on(IPC.COMMUTE_IN, () => {
  showMessageBubble(PIXI, app.stage, {
    x: mainPigeon.sprite.x,
    y: mainPigeon.sprite.y,
    text: pickCommuteInPhrase(),
  });
});

window.pigeonBridge.on(IPC.COMMUTE_OUT, () => {
  showMessageBubble(PIXI, app.stage, {
    x: mainPigeon.sprite.x,
    y: mainPigeon.sprite.y,
    text: pickCommuteOutPhrase(),
  });
  setTimeout(() => {
    window.pigeonBridge.send('commute-out-animation-done');
  }, 3200); // let the bubble show before quitting
});
```

- [ ] **Step 5: Update preload to allow the new outbound channel**

Modify `renderer/preload.js` — no change needed; `send`/`on` are already generic passthroughs from Task 2.

- [ ] **Step 6: Manual verification**

Run: `npm start`
Expected: on launch, a speech bubble with a commute-in phrase appears near the pigeon for ~3s then disappears. Click the tray icon → "퇴근" → a commute-out phrase bubble appears, and ~3.2s later the app fully quits (verify process exits, e.g. via `ps aux | grep electron`).

- [ ] **Step 7: Commit**

```bash
git add electron/tray.js electron/main.js renderer/index.js renderer/pigeon/messageBubble.js
git commit -m "feat: tray menu with commute-in/commute-out speech bubbles and app quit"
```

---

### Task 8: Mouse scatter (훠이훠이) — pure velocity logic + wiring

**Files:**
- Create: `renderer/interactions/mouseTracker.js`
- Test: `tests/mouseTracker.test.js`
- Modify: `renderer/index.js`
- Modify: `renderer/pigeon/Pigeon.js`

**Interfaces:**
- Consumes: nothing external.
- Produces: `class MouseVelocityTracker` with `recordSample({x, y, tMs})` and `getVelocity()` returning `{vx, vy, speed}` (pixels/ms), and `shouldScatter(velocity, thresholdPxPerMs = 1.5)` pure function. `Pigeon.js` gains a new method `scatterAwayFrom({x, y})` that sets state to `SCATTERING` and stores a flee target.

- [ ] **Step 1: Write the failing test**

`tests/mouseTracker.test.js`:

```js
const { MouseVelocityTracker, shouldScatter } = require('../renderer/interactions/mouseTracker');

test('computes velocity from two samples', () => {
  const tracker = new MouseVelocityTracker();
  tracker.recordSample({ x: 0, y: 0, tMs: 0 });
  tracker.recordSample({ x: 100, y: 0, tMs: 50 });
  const v = tracker.getVelocity();
  expect(v.vx).toBeCloseTo(2, 1); // 100px / 50ms = 2 px/ms
  expect(v.speed).toBeCloseTo(2, 1);
});

test('shouldScatter is true above threshold, false below', () => {
  expect(shouldScatter({ speed: 3 }, 1.5)).toBe(true);
  expect(shouldScatter({ speed: 0.5 }, 1.5)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/mouseTracker.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement mouseTracker.js**

```js
class MouseVelocityTracker {
  constructor() {
    this.lastSample = null;
    this.velocity = { vx: 0, vy: 0, speed: 0 };
  }

  recordSample({ x, y, tMs }) {
    if (this.lastSample) {
      const dt = tMs - this.lastSample.tMs;
      if (dt > 0) {
        const vx = (x - this.lastSample.x) / dt;
        const vy = (y - this.lastSample.y) / dt;
        this.velocity = { vx, vy, speed: Math.sqrt(vx * vx + vy * vy) };
      }
    }
    this.lastSample = { x, y, tMs };
  }

  getVelocity() {
    return this.velocity;
  }
}

function shouldScatter(velocity, thresholdPxPerMs = 1.5) {
  return velocity.speed > thresholdPxPerMs;
}

module.exports = { MouseVelocityTracker, shouldScatter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/mouseTracker.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Add scatterAwayFrom to Pigeon.js**

Modify `renderer/pigeon/Pigeon.js` — add inside the `Pigeon` class:

```js
  scatterAwayFrom(point) {
    const dx = this.x - point.x;
    const dy = this.y - point.y;
    const mag = Math.sqrt(dx * dx + dy * dy) || 1;
    this.fleeDirection = { x: dx / mag, y: dy / mag };
    this._enterState(STATES.SCATTERING);
  }
```

And in `update()`, add a branch so scattering resolves back to IDLE after a short burst:

```js
    if (this.state === STATES.SCATTERING) {
      const speed = 0.4; // px/ms placeholder movement speed
      this.x += this.fleeDirection.x * speed * deltaMs;
      this.y += this.fleeDirection.y * speed * deltaMs;
      if (this.stateElapsedMs >= 600) {
        this._enterState(STATES.IDLE);
      }
      return;
    }
```
(Insert this branch at the top of `update()`, before the `WEIRD_BEHAVIOR` check, so scattering pre-empts everything else.)

- [ ] **Step 6: Wire mousemove tracking into the renderer**

Modify `renderer/index.js` (add near the ticker):

```js
const { MouseVelocityTracker, shouldScatter } = require('./interactions/mouseTracker');

const mouseTracker = new MouseVelocityTracker();
window.addEventListener('mousemove', (e) => {
  mouseTracker.recordSample({ x: e.clientX, y: e.clientY, tMs: performance.now() });
  const velocity = mouseTracker.getVelocity();
  if (shouldScatter(velocity)) {
    mainPigeon.scatterAwayFrom({ x: e.clientX, y: e.clientY });
  }
});
```

- [ ] **Step 7: Manual verification**

Run: `npm start`. Move the mouse slowly near the pigeon — no reaction. Whip the mouse quickly past/at it — pigeon sprite should visibly move away for ~600ms then resume idling.

- [ ] **Step 8: Commit**

```bash
git add renderer/interactions/mouseTracker.js tests/mouseTracker.test.js renderer/pigeon/Pigeon.js renderer/index.js
git commit -m "feat: 훠이훠이 mouse-scatter interaction"
```

---

### Task 9: Drag interaction

**Files:**
- Create: `renderer/interactions/dragHandler.js`
- Modify: `renderer/pigeon/Pigeon.js`
- Modify: `renderer/index.js`

**Interfaces:**
- Consumes: `Pigeon` instance (specifically `.sprite`, `.x`/`.y`, and a new `STATES.DRAGGED` transition method `startDrag()`/`endDrag()`).
- Produces: `attachDragHandlers(pigeon, appStage)` — wires Pixi `pointerdown`/`pointermove`/`pointerup` on `pigeon.sprite`, calling `pigeon.startDrag()` / updating `pigeon.x/y` / `pigeon.endDrag()`. Pure enough logic (the coordinate math) is kept in `dragHandler.js`; only the event-listener registration touches Pixi.

- [ ] **Step 1: Add startDrag/endDrag to Pigeon.js**

Modify `renderer/pigeon/Pigeon.js` — add:

```js
  startDrag() {
    this._enterState(STATES.DRAGGED);
  }

  endDrag() {
    this._enterState(STATES.IDLE);
  }
```

And guard the top of `update()` so dragging suppresses all other timers:

```js
    if (this.state === STATES.DRAGGED) {
      return; // position is driven externally by dragHandler while dragged
    }
```
(Insert above the `SCATTERING` check added in Task 8.)

- [ ] **Step 2: Implement dragHandler.js**

```js
function attachDragHandlers(pigeon) {
  const sprite = pigeon.sprite;
  sprite.eventMode = 'static';
  sprite.cursor = 'grab';

  let dragging = false;

  sprite.on('pointerdown', () => {
    dragging = true;
    pigeon.startDrag();
  });

  sprite.on('globalpointermove', (event) => {
    if (!dragging) return;
    const pos = event.global;
    pigeon.x = pos.x;
    pigeon.y = pos.y;
    sprite.x = pos.x;
    sprite.y = pos.y;
  });

  const stopDragging = () => {
    if (!dragging) return;
    dragging = false;
    pigeon.endDrag();
  };
  sprite.on('pointerup', stopDragging);
  sprite.on('pointerupoutside', stopDragging);
}

module.exports = { attachDragHandlers };
```

- [ ] **Step 3: Wire it in index.js**

Modify `renderer/index.js` — after `mainPigeon.attachSprite(PIXI, app.stage)`:

```js
const { attachDragHandlers } = require('./interactions/dragHandler');
attachDragHandlers(mainPigeon);
```

Also report cursor-over-hitbox to main so click-through toggles correctly (needed since the sprite must be clickable to start a drag):

```js
mainPigeon.sprite.on('pointerover', () => window.pigeonBridge.send('cursor-over-hitbox', true));
mainPigeon.sprite.on('pointerout', () => window.pigeonBridge.send('cursor-over-hitbox', false));
```

- [ ] **Step 4: Manual verification**

Run: `npm start`. Hover the pigeon — cursor should become clickable (test by clicking and dragging it to a new screen position). Release — it should stay at the drop position and resume idle/walking behavior.

- [ ] **Step 5: Commit**

```bash
git add renderer/interactions/dragHandler.js renderer/pigeon/Pigeon.js renderer/index.js
git commit -m "feat: drag-to-move interaction for the pigeon"
```

---

### Task 10: Feed-placement mode (pure logic) + food spawn point

**Files:**
- Create: `renderer/interactions/feedMode.js`
- Test: `tests/feedMode.test.js`
- Modify: `renderer/index.js`
- Modify: `electron/main.js`

**Interfaces:**
- Consumes: `IPC.FEED_TRIGGERED`, `IPC.FEED_PLACED` (Task 1).
- Produces: `class FeedModeController` with `start()`, `handleClick({x, y}) → {x, y} | null` (returns the placed point if active, else null and no-op), `isActive()`, `tick(deltaMs)` (auto-cancels after 5000ms). Later Task 11 (flock feeding sequence) is triggered by the `{x, y}` this returns.

- [ ] **Step 1: Write the failing test**

`tests/feedMode.test.js`:

```js
const { FeedModeController } = require('../renderer/interactions/feedMode');

test('inactive by default; handleClick is a no-op', () => {
  const fm = new FeedModeController();
  expect(fm.isActive()).toBe(false);
  expect(fm.handleClick({ x: 1, y: 1 })).toBeNull();
});

test('start() activates mode; handleClick places food and deactivates', () => {
  const fm = new FeedModeController();
  fm.start();
  expect(fm.isActive()).toBe(true);
  const point = fm.handleClick({ x: 50, y: 60 });
  expect(point).toEqual({ x: 50, y: 60 });
  expect(fm.isActive()).toBe(false);
});

test('auto-cancels after 5000ms with no click', () => {
  const fm = new FeedModeController();
  fm.start();
  fm.tick(4999);
  expect(fm.isActive()).toBe(true);
  fm.tick(2);
  expect(fm.isActive()).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/feedMode.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement feedMode.js**

```js
const TIMEOUT_MS = 5000;

class FeedModeController {
  constructor() {
    this.active = false;
    this.elapsedMs = 0;
  }

  start() {
    this.active = true;
    this.elapsedMs = 0;
  }

  isActive() {
    return this.active;
  }

  handleClick(point) {
    if (!this.active) return null;
    this.active = false;
    return point;
  }

  tick(deltaMs) {
    if (!this.active) return;
    this.elapsedMs += deltaMs;
    if (this.elapsedMs >= TIMEOUT_MS) {
      this.active = false;
    }
  }
}

module.exports = { FeedModeController, TIMEOUT_MS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/feedMode.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire IPC — tray "먹이 주기" already sends FEED_TRIGGERED (Task 7); add renderer handling**

Modify `renderer/index.js`:

```js
const { FeedModeController } = require('./interactions/feedMode');
const feedMode = new FeedModeController();

window.pigeonBridge.on(IPC.FEED_TRIGGERED, () => {
  feedMode.start();
  document.body.style.cursor = 'crosshair';
  window.pigeonBridge.send('feed-mode-active', true); // main makes whole window clickable
});

window.addEventListener('click', (e) => {
  const point = feedMode.handleClick({ x: e.clientX, y: e.clientY });
  if (point) {
    document.body.style.cursor = 'default';
    window.pigeonBridge.send('feed-mode-active', false);
    window.pigeonBridge.send(IPC.FEED_PLACED, point); // consumed in Task 11
  }
});

app.ticker.add(() => {
  feedMode.tick(app.ticker.deltaMS);
  if (!feedMode.isActive() && document.body.style.cursor === 'crosshair') {
    document.body.style.cursor = 'default';
    window.pigeonBridge.send('feed-mode-active', false);
  }
});
```

- [ ] **Step 6: Make main.js honor feed-mode-active for click-through**

Modify `electron/main.js` — add alongside the existing `cursor-over-hitbox` listener:

```js
  ipcMain.on('feed-mode-active', (_event, isActive) => {
    setClickThroughExceptRegion(overlayWin, isActive ? { x: 0, y: 0, width: 99999, height: 99999 } : false);
  });
```

- [ ] **Step 7: Manual verification**

Run: `npm start`. Click tray "먹이 주기" — cursor becomes crosshair and the whole overlay is now clickable. Click anywhere — devtools console (temporarily log the `FEED_PLACED` payload) should show the clicked coordinates, and clicking again elsewhere should do nothing (mode already consumed). Waiting 5s without clicking should silently cancel (cursor reverts, click-through restored).

- [ ] **Step 8: Commit**

```bash
git add renderer/interactions/feedMode.js tests/feedMode.test.js renderer/index.js electron/main.js
git commit -m "feat: feed-placement mode with 5s timeout and click-through toggling"
```

---

### Task 11: Flock — temporary pigeon pool, feeding sequence, jostling, dispersal

**Files:**
- Create: `renderer/pigeon/flock.js`
- Test: `tests/flock.test.js`
- Modify: `renderer/index.js`

**Interfaces:**
- Consumes: `Pigeon` (Task 5), `STATES` (Task 4).
- Produces: `class Flock` with `constructor(mainPigeon)`, `startFeeding(point)` (spawns up to 8 `Pigeon` instances at staggered times), `update(deltaMs)` (advances main pigeon + all temporary pigeons, removes ones that finished dispersing), `getTemporaryPigeons()` (array, for rendering). Governs the max-9 constraint: `startFeeding` is a no-op if a feeding sequence is already in progress.

- [ ] **Step 1: Write the failing test**

`tests/flock.test.js`:

```js
const { Flock } = require('../renderer/pigeon/flock');
const { Pigeon } = require('../renderer/pigeon/Pigeon');
const { STATES } = require('../renderer/pigeon/states');

function makeMain() {
  return new Pigeon(null, { x: 0, y: 0 });
}

test('startFeeding spawns temporary pigeons staggered over time, capped at 8', () => {
  const flock = new Flock(makeMain());
  flock.startFeeding({ x: 100, y: 100 });

  flock.update(0);
  expect(flock.getTemporaryPigeons().length).toBe(0); // none spawned yet at t=0

  for (let i = 0; i < 8; i++) flock.update(1000); // well past each 300-1000ms stagger step
  expect(flock.getTemporaryPigeons().length).toBe(8);

  flock.update(1000);
  expect(flock.getTemporaryPigeons().length).toBe(8); // capped, no ninth
});

test('main pigeon enters FLYING_TO_FOOD immediately on startFeeding', () => {
  const main = makeMain();
  const flock = new Flock(main);
  flock.startFeeding({ x: 5, y: 5 });
  expect(main.getState()).toBe(STATES.FLYING_TO_FOOD);
});

test('a second startFeeding call while feeding is active is a no-op', () => {
  const flock = new Flock(makeMain());
  flock.startFeeding({ x: 1, y: 1 });
  flock.update(8000);
  const countAfterFirst = flock.getTemporaryPigeons().length;
  flock.startFeeding({ x: 2, y: 2 }); // should be ignored
  expect(flock.getTemporaryPigeons().length).toBe(countAfterFirst);
});

test('temporary pigeons are removed after they finish dispersing', () => {
  const flock = new Flock(makeMain(), { dispersalAfterMs: 500, spawnStaggerMs: 100 });
  flock.startFeeding({ x: 0, y: 0 });
  for (let i = 0; i < 8; i++) flock.update(100);
  expect(flock.getTemporaryPigeons().length).toBe(8);

  flock.update(600); // past dispersalAfterMs
  expect(flock.getTemporaryPigeons().length).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/flock.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement flock.js**

```js
const { Pigeon } = require('./Pigeon');
const { STATES } = require('./states');

const MAX_TEMPORARY_PIGEONS = 8;
const DEFAULTS = {
  spawnStaggerMs: 500,
  dispersalAfterMs: 6000, // how long the flock stays eating before dispersing
};

class Flock {
  constructor(mainPigeon, options = {}) {
    this.mainPigeon = mainPigeon;
    this.opts = { ...DEFAULTS, ...options };
    this.temporaryPigeons = [];
    this.feeding = false;
    this.foodPoint = null;
    this.spawnTimerMs = 0;
    this.spawnedCount = 0;
    this.dispersalTimerMs = 0;
  }

  startFeeding(point) {
    if (this.feeding) return;
    this.feeding = true;
    this.foodPoint = point;
    this.spawnTimerMs = 0;
    this.spawnedCount = 0;
    this.dispersalTimerMs = 0;
    this.mainPigeon.x = point.x;
    this.mainPigeon.y = point.y;
    this.mainPigeon._enterState(STATES.FLYING_TO_FOOD);
  }

  getTemporaryPigeons() {
    return this.temporaryPigeons;
  }

  update(deltaMs) {
    this.mainPigeon.update(deltaMs);
    for (const pigeon of this.temporaryPigeons) pigeon.update(deltaMs);

    if (!this.feeding) return;

    if (this.spawnedCount < MAX_TEMPORARY_PIGEONS) {
      this.spawnTimerMs += deltaMs;
      if (this.spawnTimerMs >= this.opts.spawnStaggerMs) {
        this.spawnTimerMs = 0;
        this.spawnedCount += 1;
        const angle = (this.spawnedCount / MAX_TEMPORARY_PIGEONS) * Math.PI * 2;
        const spawnX = this.foodPoint.x + Math.cos(angle) * 40;
        const spawnY = this.foodPoint.y + Math.sin(angle) * 40;
        const pigeon = new Pigeon(this.mainPigeon.spritesheet, { x: spawnX, y: spawnY });
        pigeon._enterState(STATES.EATING);
        this.temporaryPigeons.push(pigeon);
      }
    }

    if (this.spawnedCount >= MAX_TEMPORARY_PIGEONS) {
      this.dispersalTimerMs += deltaMs;
      if (this.dispersalTimerMs >= this.opts.dispersalAfterMs) {
        this.temporaryPigeons = [];
        this.feeding = false;
        this.mainPigeon._enterState(STATES.IDLE);
      }
    }
  }
}

module.exports = { Flock, MAX_TEMPORARY_PIGEONS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/flock.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire Flock into index.js, replacing direct mainPigeon ticking**

Modify `renderer/index.js` — replace the `app.ticker.add((delta) => { mainPigeon.update(...) })` block from Task 6 and the `FEED_PLACED` no-op from Task 10:

```js
const { Flock } = require('./pigeon/flock');
const flock = new Flock(mainPigeon);
const temporarySprites = new Map();

window.pigeonBridge.on(IPC.FEED_PLACED, (point) => {
  flock.startFeeding(point);
});

app.ticker.add(() => {
  const deltaMs = app.ticker.deltaMS;
  feedMode.tick(deltaMs);
  flock.update(deltaMs);

  // Sync Pixi sprites for temporary pigeons with the flock's current list.
  const current = new Set(flock.getTemporaryPigeons());
  for (const pigeon of flock.getTemporaryPigeons()) {
    if (!temporarySprites.has(pigeon)) {
      pigeon.attachSprite(PIXI, app.stage);
      temporarySprites.set(pigeon, pigeon.sprite);
    }
  }
  for (const [pigeon, sprite] of temporarySprites) {
    if (!current.has(pigeon)) {
      app.stage.removeChild(sprite);
      sprite.destroy();
      temporarySprites.delete(pigeon);
    }
  }
});
```

(Remove the standalone `app.ticker.add((delta) => { mainPigeon.update(deltaMs); })` added in Task 6 — `flock.update` now drives the main pigeon.)

- [ ] **Step 6: Manual verification**

Run: `npm start`. Trigger feed mode from tray, click a spot on screen. Confirm: main pigeon moves there immediately; 8 more pigeon blocks appear one by one around that point over the next ~4s; after ~6s of "eating" they all disappear and only the main pigeon remains, idling.

- [ ] **Step 7: Commit**

```bash
git add renderer/pigeon/flock.js tests/flock.test.js renderer/index.js
git commit -m "feat: flock feeding sequence with staggered spawn and timed dispersal"
```

---

### Task 12: Focus-window-change detection → Startled reaction

**Files:**
- Create: `electron/activeWindowWatcher.js`
- Modify: `electron/main.js`
- Modify: `renderer/pigeon/Pigeon.js`
- Modify: `renderer/index.js`

**Interfaces:**
- Consumes: `active-win` package (Task 1 dependency), `IPC.FOCUS_CHANGED`.
- Produces: `startActiveWindowWatcher(onChange, pollMs = 1500)` returning a `stop()` function. `onChange` is called with no arguments whenever the foreground window's title differs from the previous poll. `Pigeon.js` gains `maybeStartle(rng = Math.random, probability = 0.4)`.

- [ ] **Step 1: Implement activeWindowWatcher.js**

```js
const activeWin = require('active-win');

function startActiveWindowWatcher(onChange, pollMs = 1500) {
  let lastTitle = null;
  let stopped = false;

  async function poll() {
    if (stopped) return;
    try {
      const win = await activeWin();
      const title = win ? win.title : null;
      if (title !== null && title !== lastTitle) {
        if (lastTitle !== null) onChange(); // don't fire on the very first read
        lastTitle = title;
      }
    } catch (err) {
      // Permission not granted or unsupported platform: silently skip per spec's
      // error-handling section — Startled just never fires, nothing else breaks.
    }
    if (!stopped) setTimeout(poll, pollMs);
  }
  poll();

  return () => { stopped = true; };
}

module.exports = { startActiveWindowWatcher };
```

- [ ] **Step 2: Add maybeStartle to Pigeon.js**

Modify `renderer/pigeon/Pigeon.js` — add:

```js
  maybeStartle(rng = Math.random, probability = 0.4) {
    if (this.state === STATES.DRAGGED || this.state === STATES.SCATTERING) return;
    if (rng() < probability) {
      this._enterState(STATES.STARTLED);
    }
  }
```

And a resolve branch in `update()` (add alongside the other early-return branches, e.g. after `SCATTERING`):

```js
    if (this.state === STATES.STARTLED) {
      if (this.stateElapsedMs >= 1500) {
        this._enterState(STATES.IDLE);
      }
      return;
    }
```

- [ ] **Step 3: Wire the watcher in main.js**

Modify `electron/main.js`:

```js
const { startActiveWindowWatcher } = require('./activeWindowWatcher');

// inside app.whenReady().then(() => { ... }), after overlayWin is created:
startActiveWindowWatcher(() => {
  overlayWin.webContents.send(IPC.FOCUS_CHANGED);
});
```

- [ ] **Step 4: Handle it in the renderer**

Modify `renderer/index.js`:

```js
window.pigeonBridge.on(IPC.FOCUS_CHANGED, () => {
  mainPigeon.maybeStartle();
  for (const pigeon of flock.getTemporaryPigeons()) pigeon.maybeStartle();
});
```

- [ ] **Step 5: Manual verification**

Run: `npm start`. Alt-tab / cmd-tab between other apps a handful of times. Expect the pigeon to occasionally (not every time — 40% chance) flash into a visibly different placeholder frame for ~1.5s (Startled state) then resume. On a machine without Accessibility/Screen-Recording permission granted, confirm the app doesn't crash and simply never startles.

- [ ] **Step 6: Commit**

```bash
git add electron/activeWindowWatcher.js electron/main.js renderer/pigeon/Pigeon.js renderer/index.js
git commit -m "feat: focus-window-change detection triggers probabilistic Startled reaction"
```

---

### Task 13: Weather integration → WeatherReaction

**Files:**
- Create: `electron/weather.js`
- Modify: `electron/main.js`
- Modify: `renderer/pigeon/Pigeon.js`
- Modify: `renderer/index.js`

**Interfaces:**
- Consumes: `IPC.WEATHER_UPDATED`.
- Produces: `async function fetchWeather()` from `weather.js`, returning `{ condition: 'clear' | 'rain' | 'snow', ok: boolean }` — `ok: false` on any failure (network, geolocation), with `condition` defaulting to `'clear'` in that case, per spec's fallback rule. `startWeatherPolling(onUpdate, intervalMs = 30 * 60 * 1000)` fetches immediately then on the interval.

- [ ] **Step 1: Implement weather.js**

```js
const https = require('https');

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'desktop-pigeon-pet' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function mapWeatherCode(code) {
  // Open-Meteo WMO weather codes: 51-67,80-82 = rain family, 71-77,85-86 = snow family
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  return 'clear';
}

let lastKnownCondition = 'clear';

async function fetchWeather() {
  try {
    const geo = await httpGetJson('http://ip-api.com/json/?fields=lat,lon,status');
    if (geo.status !== 'success') throw new Error('geolocation failed');

    const meteo = await httpGetJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}&current_weather=true`
    );
    const code = meteo.current_weather.weathercode;
    lastKnownCondition = mapWeatherCode(code);
    return { condition: lastKnownCondition, ok: true };
  } catch (err) {
    // Per spec: fall back to last known condition, or 'clear' if none yet.
    return { condition: lastKnownCondition, ok: false };
  }
}

function startWeatherPolling(onUpdate, intervalMs = 30 * 60 * 1000) {
  const run = () => fetchWeather().then(onUpdate);
  run();
  const timer = setInterval(run, intervalMs);
  return () => clearInterval(timer);
}

module.exports = { fetchWeather, startWeatherPolling, mapWeatherCode };
```

- [ ] **Step 2: Add weather reaction to Pigeon.js**

Modify `renderer/pigeon/Pigeon.js` — add:

```js
  setWeather(condition) {
    this.weatherCondition = condition;
    if (condition === 'rain' || condition === 'snow') {
      if (this.state === STATES.IDLE || this.state === STATES.WALKING) {
        this._enterState(STATES.WEATHER_REACTION);
      }
    } else if (this.state === STATES.WEATHER_REACTION) {
      this._enterState(STATES.IDLE);
    }
  }
```

(`WEATHER_REACTION` is a persistent state driven by external condition changes, not a timer — no auto-resolve branch needed in `update()`; it clears when `setWeather` is called again with `'clear'`.)

- [ ] **Step 3: Wire it in main.js**

Modify `electron/main.js`:

```js
const { startWeatherPolling } = require('./weather');

// inside app.whenReady().then(() => { ... })
startWeatherPolling(({ condition }) => {
  overlayWin.webContents.send(IPC.WEATHER_UPDATED, condition);
});
```

- [ ] **Step 4: Handle it in the renderer**

Modify `renderer/index.js`:

```js
window.pigeonBridge.on(IPC.WEATHER_UPDATED, (condition) => {
  mainPigeon.setWeather(condition);
  for (const pigeon of flock.getTemporaryPigeons()) pigeon.setWeather(condition);
});
```

- [ ] **Step 5: Manual verification**

Run: `npm start` with real network access — after startup, check devtools console (temporarily log the resolved `condition`) to confirm a real weather condition is fetched. To verify the `rain`/`snow` visual path without waiting for real weather, temporarily call `window.pigeonBridge.on`'s handler manually from devtools: `mainPigeon.setWeather('rain')` and confirm the pigeon's state becomes `WEATHER_REACTION`. Then disconnect network and restart — confirm no crash and pigeon defaults to `clear`/idle behavior.

- [ ] **Step 6: Commit**

```bash
git add electron/weather.js electron/main.js renderer/pigeon/Pigeon.js renderer/index.js
git commit -m "feat: weather polling via IP geolocation + Open-Meteo, drives WeatherReaction state"
```

## Self-Review Notes

- **Spec coverage:** commute-in/out ✅(Task 7), feeding at a clicked point with 8 staggered temp pigeons + jostling-via-Eating-state + dispersal ✅(Task 10, 11), 훠이훠이 scatter ✅(Task 8), 5 named weird behaviors ✅(Task 4, 5), drag ✅(Task 9), focus-change startle ✅(Task 12), weather ✅(Task 13), camera ✅(Task 14), click-through overlay ✅(Task 2), tray with exactly 3 items and 퇴근-quits-app ✅(Task 7), no sound/no affection system/no fixed schedule ✅(never implemented, consistent with Global Constraints).
- **Jostling animation nuance:** Task 11 sets temporary pigeons directly to `EATING` rather than giving them a distinct "jostling" sub-animation — this is an intentional v1 simplification (the spec calls it a "미니 애니메이션" within Eating, not a separate FSM state) and can be refined by extending `Pigeon.js`'s `EATING` handling later without touching `flock.js`'s interface.
- **Type consistency check:** `STATES` values used consistently across `Pigeon.js`, `flock.js`, `states.test.js`. `IPC` channel names used consistently across all `electron/*.js` and `renderer/index.js` — verified no hardcoded channel strings outside `ipcChannels.js` except the `save-photo`/`cursor-over-hitbox`/`feed-mode-active`/`commute-out-animation-done` ad-hoc channels, which are intentionally left out of the shared `IPC` map since they're main↔renderer implementation details not referenced by the spec's named events — acceptable, but noted here for the implementer's awareness.
