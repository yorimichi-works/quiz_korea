import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_QUIZ_TIME_CONFIG, getQuizTimeState } from '../lib/quiz-time.ts';
import { ratingDelta } from '../lib/rating.ts';
import { EMPTY_TITLE_STATS, unlockedTitleIds } from '../lib/titles.ts';

const seoul = (local: string) => Date.parse(`${local}+09:00`);

test('quiz time boundaries follow Asia/Seoul', () => {
  assert.equal(getQuizTimeState(DEFAULT_QUIZ_TIME_CONFIG, seoul('2026-09-04T20:29:59')).phase, 'upcoming');
  assert.equal(getQuizTimeState(DEFAULT_QUIZ_TIME_CONFIG, seoul('2026-09-04T20:30:00')).phase, 'startingSoon');
  assert.equal(getQuizTimeState(DEFAULT_QUIZ_TIME_CONFIG, seoul('2026-09-04T20:59:59')).phase, 'startingSoon');
  assert.equal(getQuizTimeState(DEFAULT_QUIZ_TIME_CONFIG, seoul('2026-09-04T21:00:00')).phase, 'live');
  assert.equal(getQuizTimeState(DEFAULT_QUIZ_TIME_CONFIG, seoul('2026-09-04T21:59:59')).phase, 'live');
  assert.equal(getQuizTimeState(DEFAULT_QUIZ_TIME_CONFIG, seoul('2026-09-04T22:00:00')).phase, 'endedToday');
});

test('quiz time supports configuration and next-day boundary', () => {
  const config = { ...DEFAULT_QUIZ_TIME_CONFIG, startLocalTime:'19:15', endLocalTime:'20:00', startingSoonMinutes:15 };
  assert.equal(getQuizTimeState(config, seoul('2026-09-04T19:00:00')).phase, 'startingSoon');
  assert.equal(getQuizTimeState({ ...config, enabled:false }, seoul('2026-09-04T19:20:00')).phase, 'disabled');
  const ended = getQuizTimeState(config, seoul('2026-09-04T20:00:00'));
  assert.equal(new Date(ended.nextStartAt!).toISOString(), '2026-09-05T10:15:00.000Z');
});

test('Elo is zero-sum across 200 alternating matches', () => {
  let a = 1248; let b = 1248;
  for (let match = 0; match < 200; match += 1) {
    const score = match % 2 === 0 ? 1 : 0;
    const delta = ratingDelta(a, b, score);
    a += delta; b -= delta;
  }
  assert.equal(a + b, 2496);
  assert.ok(Math.abs(a - b) <= 20);
});

test('title thresholds unlock only earned achievements', () => {
  assert.deepEqual(unlockedTitleIds(EMPTY_TITLE_STATS, 0), []);
  const earned = unlockedTitleIds({ ...EMPTY_TITLE_STATS, matches:100, wins:10, fastBuzzWins:20, historyCorrect:20, quizTimeMatches:10 }, 45000);
  assert.deepEqual(earned, ['rookie_winner','ten_wins','quiz_time_regular','fast_hand','history_doctor','veteran','beta_tester','master_arrival']);
});
