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
  fastWalkSpeed: 0.35, // px/ms — quick beeline pace, e.g. center -> corner right after commute-in
  cornerArrivalThreshold: 80, // px — how close to a corner counts as "already there" after a drag
  rng: Math.random,
  bounds: null, // { width, height } — no clamping/corner-seeking without this (kept for existing tests)
  boundsMargin: 160, // fallback half-extent used only before a sprite is attached
};

// Clamps a raw {x,y} point into [margin, size - margin] on each axis. Pure
// and Pixi-free, exported so callers with a target point but no attached
// pigeon yet (Flock computing an eating spot before spawning the pigeon
// that will occupy it) can keep it on-screen without instantiating one
// just to borrow clampToBounds(). Returns the point unchanged if bounds
// is falsy (nothing to clamp against).
function clampPointToBounds(point, bounds, margin) {
  if (!bounds) return point;
  return {
    x: Math.max(margin.x, Math.min(bounds.width - margin.x, point.x)),
    y: Math.max(margin.y, Math.min(bounds.height - margin.y, point.y)),
  };
}

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
    this.facingRight = false; // matches walk/idle/weird-behaviors' native left-facing art
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

    // Handle STARTLED (triggered externally via maybeStartle()). After the
    // startle, burst into flight (flyOut) to a random corner instead of just
    // resuming IDLE in place — falls back to plain IDLE if bounds aren't
    // known (no corner to flee to).
    if (this.state === STATES.STARTLED) {
      if (this.stateElapsedMs >= 1500) {
        const fled = this._moveToRandomCorner(this.opts.fastWalkSpeed, STATES.FLEEING);
        if (!fled) this._enterState(STATES.IDLE);
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

    // Handle COMMUTE_IN/COMMUTE_OUT/WALKING/FLEEING/FLYING_TO_FOOD flight
    // (triggered via flyTo()). Linearly interpolates x/y from where flyTo()
    // was called to the target over flightDurationMs; intentionally does NOT
    // clampToBounds(), since fly-in/fly-out targets are deliberately
    // off-screen (WALKING/FLEEING/FLYING_TO_FOOD's targets are always
    // already in-bounds, so this is safe for them too — any point between
    // two points inside a rectangle is itself inside it). Guarded on
    // this.flightTo so a WALKING entered via the bounds-unknown fallback
    // below (no flyTo call, so no flight data) isn't misread as an
    // in-progress flight.
    if (this.flightTo && this._isFlightState(this.state)) {
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

  // States whose x/y is driven by an in-progress flyTo() flight rather than
  // update()'s other per-tick logic. Shared by the movement-interpolation
  // branch in update() and attachSprite()'s clamp-skip check below, so a
  // pigeon spawned or attached mid-flight isn't snapped back on-screen by
  // clampToBounds() before it has a chance to visibly fly in.
  _isFlightState(state) {
    return state === STATES.COMMUTE_IN || state === STATES.COMMUTE_OUT ||
      state === STATES.WALKING || state === STATES.FLEEING || state === STATES.FLYING_TO_FOOD;
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
      case STATES.FLEEING: return 'flyOut';
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
  //
  // Also re-applies the pigeon's last known facing direction to the new
  // animation (e.g. entering WEIRD_BEHAVIOR from IDLE keeps whatever
  // direction the pigeon was already facing) — flyTo()/scatterAwayFrom()
  // call _applyFacing() with the real travel direction right after this
  // runs, which overrides this for states that actually move.
  _syncSpriteAnimation() {
    const animName = this._animationForState();
    if (animName) {
      this._setSpriteAnimation(animName);
      this._reapplyFacing(animName);
    }
  }

  // x/y is the sprite's CENTER (attachSprite sets anchor to 0.5/0.5), so the
  // safe margin from any edge must be half the LARGEST frame across the
  // *entire* spritesheet, not just whatever animation happens to be showing
  // right now. Real photo-cutout frames vary a lot in size between clips
  // (idle ~255x320, walk up to 416x157, courtshipCoo up to 320x293, ...) —
  // a margin derived from the current frame (e.g. idle) doesn't guarantee
  // the frame it's about to swap to (e.g. walk, much wider) stays on
  // screen. Using one fixed max-frame margin for every clamp/corner
  // calculation guarantees any frame fits, regardless of which is active
  // when or after the calculation runs. Computed once and cached; falls
  // back to opts.boundsMargin when no real texture dimensions are available
  // (e.g. test spritesheets using plain placeholder values).
  _getMargins() {
    if (!this._cachedMargins) {
      this._cachedMargins = this._computeMaxFrameMargins();
    }
    return this._cachedMargins;
  }

  _computeMaxFrameMargins() {
    let maxWidth = 0;
    let maxHeight = 0;
    if (this.spritesheet && this.spritesheet.frames) {
      for (const textures of Object.values(this.spritesheet.frames)) {
        for (const texture of textures) {
          if (texture && texture.width) maxWidth = Math.max(maxWidth, texture.width);
          if (texture && texture.height) maxHeight = Math.max(maxHeight, texture.height);
        }
      }
    }
    if (maxWidth === 0 || maxHeight === 0) {
      return { x: this.opts.boundsMargin, y: this.opts.boundsMargin };
    }
    return { x: maxWidth / 2, y: maxHeight / 2 };
  }

  // Keeps x/y within opts.bounds (if set), so movement never drifts the
  // pigeon off the visible screen. No-ops if bounds weren't provided —
  // used by SCATTERING's own movement and by any external code (Flock,
  // dragHandler) that sets x/y directly.
  clampToBounds() {
    const bounds = this.opts.bounds;
    if (!bounds) return;
    const margin = this._getMargins();
    const clamped = clampPointToBounds({ x: this.x, y: this.y }, bounds, margin);
    this.x = clamped.x;
    this.y = clamped.y;
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

  // Shared by walkToRandomCorner() (state: WALKING) and the post-STARTLED
  // flee (state: FLEEING) — picks a random corner and flyTo()s there at
  // speedPxPerMs, arriving back at IDLE. No-ops (returns false) if bounds
  // aren't known. Returns true if a move was actually started.
  _moveToRandomCorner(speedPxPerMs, state) {
    const target = this._pickWalkTarget();
    if (!target) return false;
    const distance = Math.hypot(target.x - this.x, target.y - this.y);
    const durationMs = Math.max(1, distance / speedPxPerMs);
    this.flyTo(target, durationMs, { state, arriveState: STATES.IDLE });
    return true;
  }

  // Immediately beelines to a random corner at speedPxPerMs (default:
  // fastWalkSpeed, much quicker than the idle-timer-gated normal walk pace),
  // bypassing the idleDurationMs wait entirely. Used right after commute-in
  // lands at center, so the pigeon doesn't just sit in the middle of the
  // screen for the full idle duration. No-ops (returns false) if bounds
  // aren't known. Returns true if a walk was actually started.
  walkToRandomCorner(speedPxPerMs = this.opts.fastWalkSpeed) {
    return this._moveToRandomCorner(speedPxPerMs, STATES.WALKING);
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
    this.facingRight = directionX > 0;
    this.sprite.scale.x = (this.facingRight === this._facesRightNatively(animName)) ? 1 : -1;
  }

  // Re-applies the pigeon's last known facing (this.facingRight, last set by
  // _applyFacing) to a newly-entered animation that has no travel direction
  // of its own — e.g. WEIRD_BEHAVIOR triggered from IDLE should keep facing
  // whichever way the pigeon was already facing, not snap back to the art's
  // native direction. No-ops before a sprite is attached.
  _reapplyFacing(animName) {
    if (!this.sprite) return;
    this.sprite.scale.x = (this.facingRight === this._facesRightNatively(animName)) ? 1 : -1;
  }

  _facesRightNatively(animName) {
    return animName === 'flyIn' || animName === 'flyOut';
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
    // _enterState()/_syncSpriteAnimation() no-op'd on facing before this.sprite
    // existed (e.g. a temporary pigeon entering EATING before its sprite is
    // attached) — apply the pigeon's current facing now that it does.
    this._reapplyFacing(initialAnim);
    // Skip the auto-clamp while mid-flight (e.g. a temporary pigeon spawned
    // off-screen, about to fly in) — clamping here would snap it back
    // on-screen instantly, before it ever gets to visibly fly in.
    if (!(this.flightTo && this._isFlightState(this.state))) {
      this.clampToBounds(); // sprite.width/height now available for the margin
    }
    this.sprite.x = this.x;
    this.sprite.y = this.y;
    container.addChild(this.sprite);
    return this.sprite;
  }
}

module.exports = { Pigeon, clampPointToBounds };
