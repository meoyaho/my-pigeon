const STATES = {
  IDLE: 'IDLE',
  WALKING: 'WALKING',
  WEIRD_BEHAVIOR: 'WEIRD_BEHAVIOR',
  FLYING_TO_FOOD: 'FLYING_TO_FOOD',
  EATING: 'EATING',
  SCATTERING: 'SCATTERING',
  STARTLED: 'STARTLED',
  FLEEING: 'FLEEING', // post-STARTLED flight to a random corner (flyOut animation)
  WEATHER_REACTION: 'WEATHER_REACTION',
  DRAGGED: 'DRAGGED',
  COMMUTE_IN: 'COMMUTE_IN',
  COMMUTE_OUT: 'COMMUTE_OUT',
};

const WEIRD_BEHAVIORS = ['flipOver', 'featherOnHead', 'oneLegDoze', 'courtshipCoo', 'hopInPlace'];

function pickRandomWeirdBehavior(rng = Math.random) {
  const index = Math.floor(rng() * WEIRD_BEHAVIORS.length);
  return WEIRD_BEHAVIORS[Math.min(index, WEIRD_BEHAVIORS.length - 1)];
}

module.exports = { STATES, WEIRD_BEHAVIORS, pickRandomWeirdBehavior };
