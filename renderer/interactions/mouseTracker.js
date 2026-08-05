class MouseVelocityTracker {
  constructor() {
    this.lastSample = null;
    this.velocity = { vx: 0, vy: 0, speed: 0 };
  }

  recordSample({ x, y, tMs }) {
    if (this.lastSample) {
      const dt = tMs - this.lastSample.tMs;
      if (dt > 0) {
        const vx = (x - this.lastSample.x) / dt;
        const vy = (y - this.lastSample.y) / dt;
        this.velocity = { vx, vy, speed: Math.sqrt(vx * vx + vy * vy) };
      }
    }
    this.lastSample = { x, y, tMs };
  }

  getVelocity() {
    return this.velocity;
  }
}

function shouldScatter(velocity, thresholdPxPerMs = 1.5) {
  return velocity.speed > thresholdPxPerMs;
}

module.exports = { MouseVelocityTracker, shouldScatter };
