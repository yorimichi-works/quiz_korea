import assert from 'node:assert/strict';
import test from 'node:test';
import {
  questionCharacterDelayMs,
  questionRevealDurationMs,
  revealedQuestionLength,
} from '../lib/question-timing.ts';

test('question reveal follows reading rhythm instead of a metronome', () => {
  assert.ok(questionCharacterDelayMs(' ') < questionCharacterDelayMs('가'));
  assert.ok(questionCharacterDelayMs(',') > questionCharacterDelayMs('가'));
  assert.ok(questionCharacterDelayMs('.') > questionCharacterDelayMs(','));
});

test('reveal length is monotonic and reaches the full Unicode text', () => {
  const text = '첫 단서, 다음 단서. 정답은 무엇일까요?';
  const duration = questionRevealDurationMs(text);
  let previous = 0;
  for (let elapsed = 0; elapsed <= duration; elapsed += 25) {
    const visible = revealedQuestionLength(text, elapsed);
    assert.ok(visible >= previous);
    assert.ok(visible <= Array.from(text).length);
    previous = visible;
  }
  assert.equal(revealedQuestionLength(text, duration), Array.from(text).length);
});

test('sentence punctuation creates a perceptible dramatic beat', () => {
  const plain = questionRevealDurationMs('가나다라마바사');
  const staged = questionRevealDurationMs('가나다.라마바');
  assert.ok(staged - plain >= 200);
});

test('punctuation is visible during the pause it creates', () => {
  const text = '가.나';
  const punctuationVisibleAt = questionCharacterDelayMs('가') + 115;
  assert.equal(revealedQuestionLength(text, punctuationVisibleAt), 2);
  assert.equal(revealedQuestionLength(text, punctuationVisibleAt + questionCharacterDelayMs('.') - 1), 2);
  assert.equal(revealedQuestionLength(text, punctuationVisibleAt + questionCharacterDelayMs('.')), 3);
});
