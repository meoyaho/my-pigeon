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
