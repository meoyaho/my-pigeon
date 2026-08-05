const { STATES, pickRandomWeirdBehavior } = require('./states');

const DEFAULTS = {
  idleDurationMs: 3000,
  weirdBehaviorIntervalMs: 15000,
  weirdBehaviorDurationMs: 2500,
  walkDurationMs: 2000,
  rng: Math.random,
  bounds: null, // { width, height } — no clamping by default (kept for existing tests)
  boundsMargin: 160, // fallback half-extent used only before a sprite is attached
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

    // Handle COMMUTE_IN/COMMUTE_OUT flight (triggered externally via flyTo()).
    // Linearly interpolates x/y from where flyTo() was called to the target
    // over flightDurationMs; intentionally does NOT clampToBounds(), since
    // fly-in/fly-out targets are deliberately off-screen.
    if (this.state === STATES.COMMUTE_IN || this.state === STATES.COMMUTE_OUT) {
      const t = Math.min(1, this.stateElapsedMs / this.flightDurationMs);
      this.x = this.flightFrom.x + (this.flightTo.x - this.flightFrom.x) * t;
      this.y = this.flightFrom.y + (this.flightTo.y - this.flightFrom.y) * t;
      if (t >= 1) {
        const onComplete = this.flightOnComplete;
        this.flightOnComplete = null; // fire once
        const arriveState = this.flightArriveState;
        if (arriveState) {
          this._enterState(arriveState);
        }
        if (onComplete) onComplete();
      }
      return;
    }

    // Handle SCATTERING (highest priority — pre-empts everything else).
    if (this.state === STATES.SCATTERING) {
      const speed = 0.4; // px/ms placeholder movement speed
      this.x += this.fleeDirection.x * speed * deltaMs;
      this.y += this.fleeDirection.y * speed * deltaMs;
      this.clampToBounds();
      if (this.stateElapsedMs >= 600) {
        this._enterState(STATES.IDLE);
      }
      return;
    }

    // Handle STARTLED (triggered externally via maybeStartle()).
    if (this.state === STATES.STARTLED) {
      if (this.stateElapsedMs >= 1500) {
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

  // Keeps x/y within opts.bounds (if set), so movement never drifts the
  // pigeon off the visible screen. No-ops if bounds weren't provided —
  // used by SCATTERING's own movement and by any external code (Flock,
  // dragHandler) that sets x/y directly.
  //
  // x/y is the sprite's CENTER (attachSprite sets anchor to 0.5/0.5), so the
  // margin must be half the sprite's actual width/height — otherwise only the
  // anchor point stays on screen while the rest of a large photo cutout can
  // still hang off the edge. Falls back to opts.boundsMargin before a sprite
  // is attached (e.g. a freshly-spawned temporary pigeon).
  clampToBounds() {
    const bounds = this.opts.bounds;
    if (!bounds) return;
    const marginX = this.sprite ? this.sprite.width / 2 : this.opts.boundsMargin;
    const marginY = this.sprite ? this.sprite.height / 2 : this.opts.boundsMargin;
    this.x = Math.max(marginX, Math.min(bounds.width - marginX, this.x));
    this.y = Math.max(marginY, Math.min(bounds.height - marginY, this.y));
  }

  startDrag() {
    this._enterState(STATES.DRAGGED);
  }

  endDrag() {
    this._enterState(STATES.IDLE);
  }

  // Starts a linear fly-to animation toward targetPoint, taking durationMs.
  // state must be STATES.COMMUTE_IN or STATES.COMMUTE_OUT (the two states
  // update() knows how to animate). arriveState, if given, is entered
  // automatically once the flight completes (e.g. COMMUTE_IN -> IDLE, so the
  // pigeon resumes normal life after landing). onComplete, if given, fires
  // once — after arriveState has already been entered — letting the caller
  // sequence follow-up steps (showing a speech bubble, starting a second
  // flyTo, etc.) off of Pixi-side state that only the renderer knows about.
  flyTo(targetPoint, durationMs, { state, arriveState, onComplete } = {}) {
    this.flightFrom = { x: this.x, y: this.y };
    this.flightTo = targetPoint;
    this.flightDurationMs = durationMs;
    this.flightArriveState = arriveState || null;
    this.flightOnComplete = onComplete || null;
    this._enterState(state);
  }

  scatterAwayFrom(point) {
    const dx = this.x - point.x;
    const dy = this.y - point.y;
    const mag = Math.sqrt(dx * dx + dy * dy) || 1;
    this.fleeDirection = { x: dx / mag, y: dy / mag };
    this._enterState(STATES.SCATTERING);
  }

  maybeStartle(rng = Math.random, probability = 0.4) {
    if (this.state === STATES.DRAGGED || this.state === STATES.SCATTERING) return;
    if (rng() < probability) {
      this._enterState(STATES.STARTLED);
    }
  }

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

  // The only method that touches Pixi. Called once after construction by flock.js.
  attachSprite(PIXI, container) {
    const frames = this.spritesheet.frames.idle;
    this.sprite = new PIXI.AnimatedSprite(frames);
    // Center anchor: x/y is the sprite's midpoint, not its top-left corner.
    // Without this, clamping (and dragging) only guaranteed one corner of
    // the photo cutout stayed on screen while the rest of the body — which
    // can extend 100-200px further in any direction — hung off the edge.
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.animationSpeed = 0.1;
    this.sprite.play();
    this.clampToBounds(); // sprite.width/height now available for the margin
    this.sprite.x = this.x;
    this.sprite.y = this.y;
    container.addChild(this.sprite);
    return this.sprite;
  }
}

module.exports = { Pigeon };
