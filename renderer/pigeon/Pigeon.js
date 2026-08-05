const { STATES, pickRandomWeirdBehavior, WEIRD_BEHAVIORS } = require('./states');

const DEFAULTS = {
  idleDurationMs: 25 * 60 * 1000, // how long it dwells at a corner before walking to another
  weirdBehaviorIntervalMs: 15000,
  weirdBehaviorDurationMs: 2500, // default duration for weird behaviors with no override below
  weirdBehaviorDurationOverrides: {
    oneLegDoze: 5 * 60 * 1000, // a genuine doze, not a quick gag — stays asleep much longer
  },
  animationSpeed: 0.1, // PIXI frames advanced per game-tick, default pace
  weirdBehaviorAnimationSpeed: 0.04, // slower cadence specifically for the 5 weird behaviors
  walkDurationMs: 2000, // fallback-only: used when bounds are unknown, so no corner target exists
  walkSpeed: 0.06, // px/ms — real corner-to-corner walking pace once bounds are known
  cornerArrivalThreshold: 80, // px — how close to a corner counts as "already there" after a drag
  rng: Math.random,
  bounds: null, // { width, height } — no clamping/corner-seeking without this (kept for existing tests)
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
    // Some behaviors (oneLegDoze) run much longer than the rest — check
    // weirdBehaviorDurationOverrides[currentWeirdBehavior] before falling
    // back to the shared default.
    if (this.state === STATES.WEIRD_BEHAVIOR) {
      const duration = this.opts.weirdBehaviorDurationOverrides[this.currentWeirdBehavior]
        ?? this.opts.weirdBehaviorDurationMs;
      if (this.stateElapsedMs >= duration) {
        this.currentWeirdBehavior = null; // Clear stale behavior name
        this.weirdBehaviorTimerMs = 0; // Reset timer for next interval
        this._enterState(STATES.IDLE);
      }
      return;
    }

    // Only trigger WEIRD_BEHAVIOR while genuinely IDLE (standing still), not
    // mid-walk — a pigeon flipping over or cooing while striding toward a
    // corner looked wrong. Checked before the flight/movement branch below.
    if (this.weirdBehaviorTimerMs >= this.opts.weirdBehaviorIntervalMs &&
        this.state === STATES.IDLE) {
      this.currentWeirdBehavior = pickRandomWeirdBehavior(this.opts.rng);
      this.weirdBehaviorTimerMs = 0;
      this._enterState(STATES.WEIRD_BEHAVIOR);
      return;
    }

    // Handle COMMUTE_IN/COMMUTE_OUT/WALKING flight (triggered via flyTo()).
    // Linearly interpolates x/y from where flyTo() was called to the target
    // over flightDurationMs; intentionally does NOT clampToBounds(), since
    // fly-in/fly-out targets are deliberately off-screen (WALKING's corner
    // targets are always already in-bounds, so this is safe for it too — any
    // point between two points inside a rectangle is itself inside it).
    // Guarded on this.flightTo so a WALKING entered via the bounds-unknown
    // fallback below (no flyTo call, so no flight data) isn't misread as an
    // in-progress flight.
    if (this.flightTo &&
        (this.state === STATES.COMMUTE_IN || this.state === STATES.COMMUTE_OUT || this.state === STATES.WALKING)) {
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

    // Normal state transitions: IDLE -> WALKING.
    // NOTE: every _enterState() call in this function must be immediately followed by return.
    // This prevents multiple state transitions in a single tick when stateElapsedMs is freshly reset.
    if (this.state === STATES.IDLE && this.stateElapsedMs >= this.opts.idleDurationMs) {
      const target = this._pickWalkTarget();
      if (target) {
        // Real pigeon-like corner-to-corner walk: flyTo() also handles the
        // WALKING -> IDLE arrival and the idle/walk sprite swap automatically.
        const distance = Math.hypot(target.x - this.x, target.y - this.y);
        const durationMs = Math.max(1, distance / this.opts.walkSpeed);
        this.flyTo(target, durationMs, { state: STATES.WALKING, arriveState: STATES.IDLE });
      } else {
        // No bounds known (e.g. some unit tests construct a Pigeon without
        // them) — no corner to walk toward, so fall back to a stationary,
        // fixed-duration WALKING state for backward compatibility.
        this._enterState(STATES.WALKING);
      }
      return;
    } else if (this.state === STATES.WALKING && !this.flightTo && this.stateElapsedMs >= this.opts.walkDurationMs) {
      this._enterState(STATES.IDLE);
      return;
    }
  }

  _enterState(newState) {
    this.state = newState;
    this.stateElapsedMs = 0;
    this._syncSpriteAnimation();
  }

  // Maps the current state to a spritesheet animation name. WEIRD_BEHAVIOR
  // has no single fixed animation — it uses whichever behavior
  // pickRandomWeirdBehavior() chose (currentWeirdBehavior is always set
  // before _enterState(WEIRD_BEHAVIOR) is called). SCATTERING and
  // FLYING_TO_FOOD have no dedicated art of their own, so they reuse the
  // closest available flight clips (flyOut/flyIn) rather than freezing on
  // the idle pose while airborne. Returns null for states with no visual
  // change of their own (none currently, but kept as an explicit fallback).
  _animationForState() {
    switch (this.state) {
      case STATES.IDLE: return 'idle';
      case STATES.WALKING: return 'walk';
      case STATES.WEIRD_BEHAVIOR: return this.currentWeirdBehavior;
      case STATES.FLYING_TO_FOOD: return 'flyIn';
      case STATES.EATING: return 'eat';
      case STATES.SCATTERING: return 'flyOut';
      case STATES.STARTLED: return 'startled';
      case STATES.WEATHER_REACTION: return 'weatherHuddle';
      case STATES.DRAGGED: return 'dragged';
      case STATES.COMMUTE_IN: return 'flyIn';
      case STATES.COMMUTE_OUT: return 'flyOut';
      default: return null;
    }
  }

  // Keeps the sprite's textures in sync with whatever _animationForState()
  // says the current state should look like. Called automatically by
  // _enterState(), so every transition (including ones triggered by Flock or
  // dragHandler calling _enterState()/startDrag() directly) gets the right
  // animation for free — no call site needs to remember to swap art itself.
  _syncSpriteAnimation() {
    const animName = this._animationForState();
    if (animName) this._setSpriteAnimation(animName);
  }

  // x/y is the sprite's CENTER (attachSprite sets anchor to 0.5/0.5), so the
  // safe margin from any edge must be half the sprite's actual width/height —
  // otherwise only the anchor point stays on screen while the rest of a large
  // photo cutout can still hang off the edge. Falls back to opts.boundsMargin
  // before a sprite is attached (e.g. a freshly-spawned temporary pigeon).
  _getMargins() {
    return {
      x: this.sprite ? this.sprite.width / 2 : this.opts.boundsMargin,
      y: this.sprite ? this.sprite.height / 2 : this.opts.boundsMargin,
    };
  }

  // Keeps x/y within opts.bounds (if set), so movement never drifts the
  // pigeon off the visible screen. No-ops if bounds weren't provided —
  // used by SCATTERING's own movement and by any external code (Flock,
  // dragHandler) that sets x/y directly.
  clampToBounds() {
    const bounds = this.opts.bounds;
    if (!bounds) return;
    const margin = this._getMargins();
    this.x = Math.max(margin.x, Math.min(bounds.width - margin.x, this.x));
    this.y = Math.max(margin.y, Math.min(bounds.height - margin.y, this.y));
  }

  // The 4 screen corners, inset by the same margin clampToBounds() uses, so a
  // pigeon "at a corner" is fully on-screen there, not clipped. Returns null
  // when bounds aren't known (nothing to compute corners against).
  _getCorners() {
    const bounds = this.opts.bounds;
    if (!bounds) return null;
    const margin = this._getMargins();
    return [
      { x: margin.x, y: margin.y }, // top-left
      { x: bounds.width - margin.x, y: margin.y }, // top-right
      { x: margin.x, y: bounds.height - margin.y }, // bottom-left
      { x: bounds.width - margin.x, y: bounds.height - margin.y }, // bottom-right
    ];
  }

  _nearestCornerIndex(corners, point) {
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

  // Picks a random corner OTHER than the one closest to the pigeon's current
  // position, so a "walk" is always an actual trip across the screen rather
  // than a near-zero-distance walk to the corner it's already standing at.
  // Returns null when bounds aren't known.
  _pickWalkTarget() {
    const corners = this._getCorners();
    if (!corners) return null;
    const nearestIndex = this._nearestCornerIndex(corners, { x: this.x, y: this.y });
    const choices = corners.filter((_, index) => index !== nearestIndex);
    const pickIndex = Math.min(Math.floor(this.opts.rng() * choices.length), choices.length - 1);
    return choices[pickIndex];
  }

  startDrag() {
    this._enterState(STATES.DRAGGED);
  }

  // Real pigeons don't linger wherever they're set down — if the drop point
  // isn't already close to a corner, immediately start walking to the
  // nearest one instead of just idling in the middle of the screen.
  endDrag() {
    const corners = this._getCorners();
    if (corners) {
      const nearestIndex = this._nearestCornerIndex(corners, { x: this.x, y: this.y });
      const nearest = corners[nearestIndex];
      const distance = Math.hypot(nearest.x - this.x, nearest.y - this.y);
      if (distance > this.opts.cornerArrivalThreshold) {
        const durationMs = Math.max(1, distance / this.opts.walkSpeed);
        this.flyTo(nearest, durationMs, { state: STATES.WALKING, arriveState: STATES.IDLE });
        return;
      }
    }
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
    this._enterState(state); // also swaps in flyIn/flyOut/walk frames via _syncSpriteAnimation()
    this._applyFacing(this._animationForState(), this.flightTo.x - this.flightFrom.x);
  }

  scatterAwayFrom(point) {
    const dx = this.x - point.x;
    const dy = this.y - point.y;
    const mag = Math.sqrt(dx * dx + dy * dy) || 1;
    this.fleeDirection = { x: dx / mag, y: dy / mag };
    this._enterState(STATES.SCATTERING);
    this._applyFacing('flyOut', this.fleeDirection.x);
  }

  // Each animation clip is a fixed photo/render, so it faces one direction
  // regardless of where the pigeon is actually headed — 'walk' and 'idle'
  // face left natively, 'flyIn'/'flyOut' face right. Mirrors the sprite
  // horizontally (scale.x sign) so it visually faces the direction it's
  // actually traveling. directionX === 0 (purely vertical/no movement)
  // leaves the current facing untouched rather than guessing.
  _applyFacing(animName, directionX) {
    if (!this.sprite || !directionX) return;
    const facesRightNatively = animName === 'flyIn' || animName === 'flyOut';
    const wantsToFaceRight = directionX > 0;
    this.sprite.scale.x = (wantsToFaceRight === facesRightNatively) ? 1 : -1;
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

  // Swaps the AnimatedSprite's textures to a different animation slot from
  // spritesheet.frames (e.g. 'flyIn', 'flyOut', 'idle') and restarts playback
  // from frame 0. No-ops before a sprite is attached, or if the requested
  // animation name doesn't exist in the loaded spritesheet.
  //
  // The 5 weird behaviors play at their own (slower) cadence via
  // weirdBehaviorAnimationSpeed — everything else uses the shared
  // animationSpeed default.
  _setSpriteAnimation(animName) {
    if (!this.sprite) return;
    const frames = this.spritesheet.frames[animName];
    if (!frames) return;
    this.sprite.textures = frames;
    this.sprite.animationSpeed = WEIRD_BEHAVIORS.includes(animName)
      ? this.opts.weirdBehaviorAnimationSpeed
      : this.opts.animationSpeed;
    this.sprite.gotoAndPlay(0);
  }

  // Creates the AnimatedSprite. Called once after construction by flock.js.
  // Along with _setSpriteAnimation() (which every _enterState() call routes
  // through), this is the only place that touches Pixi objects directly.
  //
  // Starts on whatever animation the pigeon's CURRENT state maps to, not
  // always 'idle' — temporary pigeons are constructed already in EATING
  // (flock.js calls _enterState(EATING) before attachSprite runs), so they
  // must not flash an idle frame before their sprite exists.
  attachSprite(PIXI, container) {
    const initialAnim = this._animationForState() || 'idle';
    const frames = this.spritesheet.frames[initialAnim] || this.spritesheet.frames.idle;
    this.sprite = new PIXI.AnimatedSprite(frames);
    // Center anchor: x/y is the sprite's midpoint, not its top-left corner.
    // Without this, clamping (and dragging) only guaranteed one corner of
    // the photo cutout stayed on screen while the rest of the body — which
    // can extend 100-200px further in any direction — hung off the edge.
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.animationSpeed = WEIRD_BEHAVIORS.includes(initialAnim)
      ? this.opts.weirdBehaviorAnimationSpeed
      : this.opts.animationSpeed;
    this.sprite.play();
    this.clampToBounds(); // sprite.width/height now available for the margin
    this.sprite.x = this.x;
    this.sprite.y = this.y;
    container.addChild(this.sprite);
    return this.sprite;
  }
}

module.exports = { Pigeon };
