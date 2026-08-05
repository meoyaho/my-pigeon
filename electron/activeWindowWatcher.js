// get-windows ships as an ESM-only package (no CommonJS build), so it cannot
// be loaded with require() from this CommonJS main-process file. We load it
// lazily via dynamic import() the first time poll() runs, and cache the
// resolved function for subsequent polls.
//
// (This used to depend on active-win@9, which is deprecated in favor of
// get-windows and — on this platform at least — completely broken: its
// index.js statically imports lib/windows.js, which eagerly `require()`s a
// prebuilt native binding for the Windows implementation at module-load
// time, regardless of the actual OS. On macOS that native binding load
// throws "Module did not self-register" immediately, so activeWindow()
// never even got the chance to run — Startled silently never fired, for
// every user, always. get-windows fixed this by making the Windows binding
// load lazy (only inside its own activeWindow()/activeWindowSync(), which
// this app never calls on macOS/Linux), so importing it no longer touches
// that broken path at all.)
let activeWindowPromise = null;
function loadActiveWindow() {
  if (!activeWindowPromise) {
    activeWindowPromise = import('get-windows').then((mod) => mod.activeWindow);
  }
  return activeWindowPromise;
}

function startActiveWindowWatcher(onChange, pollMs = 1500) {
  // Comparing on win.title looked right at first but overfired: a window's
  // title text changes for reasons that have nothing to do with focus (a
  // terminal's busy-spinner glyph, a page's loading-progress text, an
  // unsaved-changes dot), so just typing or moving the mouse inside the
  // SAME window could flip the title and trigger Startled with no real
  // focus change. win.id identifies the window itself and only changes
  // when the frontmost window actually changes — switching apps or
  // switching windows within an app — which is what Startled should key
  // off of.
  let lastWindowId = null;
  let stopped = false;

  async function poll() {
    if (stopped) return;
    try {
      const activeWindow = await loadActiveWindow();
      const win = await activeWindow();
      const windowId = win ? win.id : null;
      if (windowId !== null && windowId !== lastWindowId) {
        if (lastWindowId !== null) onChange(); // don't fire on the very first read
        lastWindowId = windowId;
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
