import assert from 'node:assert/strict';
import test from 'node:test';
import { failedAnswerRebound } from '../lib/answer-rebound.ts';

test('a failed answer pauses then resumes the original question timeline', () => {
  const transition = failedAnswerRebound({
    failedPlayer: 'a', lockedA: false, lockedB: false,
    timelinePausedAt: 4_000, startAt: 1_000, buzzOpenAt: 1_300, buzzDeadlineAt: 10_000, now: 7_500,
  });
  assert.equal(transition.lockedA, true);
  assert.equal(transition.lockedB, false);
  assert.equal(transition.bothLocked, false);
  assert.equal(transition.remainingMs, 6_000);
  assert.equal(transition.startAt, 4_500);
  assert.equal(transition.buzzOpenAt, 4_800);
  assert.equal(transition.buzzDeadlineAt, 13_500);
});

test('the round ends after both players have lost the answer right', () => {
  const transition = failedAnswerRebound({
    failedPlayer: 'b', lockedA: true, lockedB: false,
    timelinePausedAt: 8_000, startAt: 1_000, buzzOpenAt: 1_300, buzzDeadlineAt: 10_000, now: 9_000,
  });
  assert.equal(transition.lockedA, true);
  assert.equal(transition.lockedB, true);
  assert.equal(transition.bothLocked, true);
});
