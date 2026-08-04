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
