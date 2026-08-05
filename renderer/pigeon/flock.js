const { Pigeon, clampPointToBounds } = require('./Pigeon');
const { STATES } = require('./states');

const MAX_TEMPORARY_PIGEONS = 8;
const DEFAULTS = {
  spawnStaggerMs: 150, // how soon each pigeon STARTS its arrival, not how fast it flies
  dispersalAfterMs: 6000, // how long the flock stays eating before dispersing
  rng: Math.random,
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
    // Clamp the food point itself, so pigeons never end up eating with part
    // of their body hanging off the edge just because the user placed food
    // right at (or past) the screen border. Uses the main pigeon's real
    // sprite dimensions for the margin, since it's already attached by now.
    const bounds = this.mainPigeon.opts.bounds;
    const margin = this.mainPigeon._getMargins(); // real sprite dims — main pigeon is already attached by now
    this.foodPoint = clampPointToBounds(point, bounds, margin);
    this.spawnTimerMs = 0;
    this.spawnedCount = 0;
    this.dispersalTimerMs = 0;
    // Fly there for real (flyIn animation, visible travel) instead of
    // teleporting instantly — works regardless of bounds since it's just
    // interpolating between the pigeon's current position and the food
    // point, no screen-size knowledge needed.
    const speed = this.mainPigeon.opts.fastWalkSpeed;
    const distance = Math.hypot(this.foodPoint.x - this.mainPigeon.x, this.foodPoint.y - this.mainPigeon.y);
    const durationMs = Math.max(1, distance / speed);
    this.mainPigeon.flyTo(this.foodPoint, durationMs, { state: STATES.FLYING_TO_FOOD, arriveState: STATES.EATING });
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
        // Eating spots stay arranged in an even ring around the food, but
        // each pigeon now flies in to its spot from a different off-screen
        // position and direction — a random angle + a radius guaranteed to
        // start off-screen — instead of just materializing there already
        // eating. Falls back to instant placement when bounds aren't known
        // (no screen size to compute an off-screen spawn point against).
        // The ring offset (±40px) can still push a spot past the edge even
        // though foodPoint itself is already clamped, so clamp again here.
        const bounds = this.mainPigeon.opts.bounds;
        const margin = this.mainPigeon._getMargins(); // real sprite dims — main pigeon is already attached by now
        const eatAngle = (this.spawnedCount / MAX_TEMPORARY_PIGEONS) * Math.PI * 2;
        const rawEatX = this.foodPoint.x + Math.cos(eatAngle) * 40;
        const rawEatY = this.foodPoint.y + Math.sin(eatAngle) * 40;
        const { x: eatX, y: eatY } = clampPointToBounds({ x: rawEatX, y: rawEatY }, bounds, margin);

        let spawnX = eatX;
        let spawnY = eatY;
        if (bounds) {
          const arrivalAngle = this.opts.rng() * Math.PI * 2;
          const radius = Math.max(bounds.width, bounds.height) * 0.75;
          spawnX = eatX + Math.cos(arrivalAngle) * radius;
          spawnY = eatY + Math.sin(arrivalAngle) * radius;
        }

        const pigeon = new Pigeon(this.mainPigeon.spritesheet, { x: spawnX, y: spawnY }, {
          bounds,
          boundsMargin: this.mainPigeon.opts.boundsMargin,
          fastWalkSpeed: this.mainPigeon.opts.fastWalkSpeed,
        });

        if (bounds) {
          const speed = pigeon.opts.fastWalkSpeed;
          const distance = Math.hypot(eatX - spawnX, eatY - spawnY);
          const durationMs = Math.max(1, distance / speed);
          pigeon.flyTo({ x: eatX, y: eatY }, durationMs, { state: STATES.FLYING_TO_FOOD, arriveState: STATES.EATING });
        } else {
          pigeon._enterState(STATES.EATING);
        }
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

  // Triggered by a single 훠이훠이 while a flock is gathered: every temporary
  // pigeon immediately flies off-screen (FLEEING, flyOut animation) in its
  // own random direction and is removed once it actually gets there, ending
  // the feeding session early — leaving only the main pigeon on screen. A
  // pigeon already fleeing is left alone, so repeated triggers during one
  // mouse-wave gesture don't restart an already-departing pigeon.
  disperseAll() {
    if (!this.feeding) return;
    this.feeding = false; // stop staggered spawning and the auto-dispersal timer
    const bounds = this.mainPigeon.opts.bounds;
    for (const pigeon of this.temporaryPigeons) {
      if (pigeon.getState() === STATES.FLEEING) continue;
      const angle = this.opts.rng() * Math.PI * 2;
      const radius = bounds ? Math.max(bounds.width, bounds.height) * 0.75 : 800;
      const exitX = pigeon.x + Math.cos(angle) * radius;
      const exitY = pigeon.y + Math.sin(angle) * radius;
      const speed = pigeon.opts.fastWalkSpeed;
      const distance = Math.hypot(exitX - pigeon.x, exitY - pigeon.y);
      const durationMs = Math.max(1, distance / speed);
      pigeon.flyTo({ x: exitX, y: exitY }, durationMs, {
        state: STATES.FLEEING,
        onComplete: () => {
          this.temporaryPigeons = this.temporaryPigeons.filter((p) => p !== pigeon);
        },
      });
    }
  }
}

module.exports = { Flock, MAX_TEMPORARY_PIGEONS };
