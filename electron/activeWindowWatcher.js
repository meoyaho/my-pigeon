// active-win@9 ships as an ESM-only package (no CommonJS build), so it cannot
// be loaded with require() from this CommonJS main-process file. We load it
// lazily via dynamic import() the first time poll() runs, and cache the
// resolved function for subsequent polls.
let activeWinPromise = null;
function loadActiveWin() {
  if (!activeWinPromise) {
    activeWinPromise = import('active-win').then((mod) => mod.default);
  }
  return activeWinPromise;
}

function startActiveWindowWatcher(onChange, pollMs = 1500) {
  let lastTitle = null;
  let stopped = false;

  async function poll() {
    if (stopped) return;
    try {
      const activeWin = await loadActiveWin();
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
