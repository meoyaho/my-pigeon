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
    // Handle DRAGGED first, before any timer math — both stateElapsedMs and
    // weirdBehaviorTimerMs must stay frozen for the entire drag so no timer
    // fires immediately on release (endDrag() only resets stateElapsedMs).
    if (this.state === STATES.DRAGGED) {
      return; // position is driven externally by dragHandler while dragged
    }

    this.stateElapsedMs += deltaMs;
    this.weirdBehaviorTimerMs += deltaMs;

    // Handle SCATTERING (highest priority — pre-empts everything else).
    if (this.state === STATES.SCATTERING) {
      const speed = 0.4; // px/ms placeholder movement speed
      this.x += this.fleeDirection.x * speed * deltaMs;
      this.y += this.fleeDirection.y * speed * deltaMs;
      if (this.stateElapsedMs >= 600) {
        this._enterState(STATES.IDLE);
      }
      return;
    }

    // Handle WEIRD_BEHAVIOR exit (highest priority to prevent state layering).
    if (this.state === STATES.WEIRD_BEHAVIOR) {
      if (this.stateElapsedMs >= this.opts.weirdBehaviorDurationMs) {
        this.currentWeirdBehavior = null; // Clear stale behavior name
        this.weirdBehaviorTimerMs = 0; // Reset timer for next interval
        this._enterState(STATES.IDLE);
      }
      return;
    }

    // Interrupt any state to trigger WEIRD_BEHAVIOR on interval (prevents task accumulation).
    if (this.weirdBehaviorTimerMs >= this.opts.weirdBehaviorIntervalMs &&
        (this.state === STATES.IDLE || this.state === STATES.WALKING)) {
      this.currentWeirdBehavior = pickRandomWeirdBehavior(this.opts.rng);
      this.weirdBehaviorTimerMs = 0;
      this._enterState(STATES.WEIRD_BEHAVIOR);
      return;
    }

    // Normal state transitions: IDLE ↔ WALKING.
    // NOTE: every _enterState() call in this function must be immediately followed by return.
    // This prevents multiple state transitions in a single tick when stateElapsedMs is freshly reset.
    if (this.state === STATES.IDLE && this.stateElapsedMs >= this.opts.idleDurationMs) {
      this._enterState(STATES.WALKING);
      return;
    } else if (this.state === STATES.WALKING && this.stateElapsedMs >= this.opts.walkDurationMs) {
      this._enterState(STATES.IDLE);
      return;
    }
  }

  _enterState(newState) {
    this.state = newState;
    this.stateElapsedMs = 0;
  }

  startDrag() {
    this._enterState(STATES.DRAGGED);
  }

  endDrag() {
    this._enterState(STATES.IDLE);
  }

  scatterAwayFrom(point) {
    const dx = this.x - point.x;
    const dy = this.y - point.y;
    const mag = Math.sqrt(dx * dx + dy * dy) || 1;
    this.fleeDirection = { x: dx / mag, y: dy / mag };
    this._enterState(STATES.SCATTERING);
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
