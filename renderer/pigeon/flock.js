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
    this.mainPigeon.clampToBounds();
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
        const pigeon = new Pigeon(this.mainPigeon.spritesheet, { x: spawnX, y: spawnY }, {
          bounds: this.mainPigeon.opts.bounds,
          boundsMargin: this.mainPigeon.opts.boundsMargin,
        });
        pigeon.clampToBounds();
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
