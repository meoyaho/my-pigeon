const COMMUTE_IN_PHRASES = [
  '오늘도 열심히 해보자고',
  '좋은 아침! 출근했어요',
  '오늘 하루도 힘내봐요',
  '자, 오늘도 시작해볼까',
  '뭐부터 할까? 나 왔어요',
];

const COMMUTE_OUT_PHRASES = [
  '오늘도 수고했어',
  '내일 또 만나요',
  '오늘 하루도 끝! 잘 자요',
  '푹 쉬어요, 나도 이만 갈게',
  '오늘 몫은 다 했다, 안녕!',
];

function pickCommuteInPhrase(rng = Math.random) {
  return COMMUTE_IN_PHRASES[Math.floor(rng() * COMMUTE_IN_PHRASES.length) % COMMUTE_IN_PHRASES.length];
}

function pickCommuteOutPhrase(rng = Math.random) {
  return COMMUTE_OUT_PHRASES[Math.floor(rng() * COMMUTE_OUT_PHRASES.length) % COMMUTE_OUT_PHRASES.length];
}

module.exports = { COMMUTE_IN_PHRASES, COMMUTE_OUT_PHRASES, pickCommuteInPhrase, pickCommuteOutPhrase };
