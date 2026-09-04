import assert from 'node:assert/strict';
import test from 'node:test';
import {
  answerChoiceRandom,
  answerTimeLimitMs,
  createAnswerCharacterChoices,
  createAnswerTileChoices,
  normalizedAnswerCharacters,
  normalizedAnswerTiles,
} from '../lib/answer-choices.ts';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function counts(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) || 0) + 1);
  return result;
}

test('answer choices contain the canonical multiset once and no conflicting distractors', () => {
  const answers = ['대한민국', '1000', 'APPLE', '워싱턴 D.C.', '오사카성', '토론토', '『Straße』'];
  for (const answer of answers) {
    const correct = normalizedAnswerCharacters(answer);
    const expected = counts(correct);
    for (let seed = 0; seed < 1000; seed += 1) {
      const choices = createAnswerCharacterChoices(answer, seededRandom(seed));
      const actual = counts(choices);
      for (const [character, count] of expected) assert.equal(actual.get(character), count, `${answer}: ${character}`);
      const distractors = choices.filter(character => !expected.has(character));
      assert.equal(new Set(distractors).size, distractors.length, `${answer}: duplicate distractor`);
      assert.ok(distractors.length >= 2, `${answer}: too few distractors`);
    }
  }
});

test('normalization is shared-safe for wrappers and Unicode case expansion', () => {
  assert.equal(normalizedAnswerCharacters('『Straße』').join(''), 'STRASSE');
});

test('exhausted character families fall back to other non-conflicting pools', () => {
  const answer = '0123456789';
  const correct = normalizedAnswerCharacters(answer);
  const choices = createAnswerCharacterChoices(answer, seededRandom(12));
  const actual = counts(choices);
  for (const character of correct) assert.equal(actual.get(character), 1);
  const distractors = choices.filter(character => !correct.includes(character));
  assert.equal(distractors.length, 5);
  assert.equal(new Set(distractors).size, distractors.length);
});

test('distractors follow the answer character family', () => {
  const numeric = createAnswerCharacterChoices('1024', seededRandom(4)).filter(char => !'1024'.includes(char));
  const latin = createAnswerCharacterChoices('NASA', seededRandom(7)).filter(char => !'NASA'.includes(char));
  assert.ok(numeric.every(char => /[0-9]/.test(char)));
  assert.ok(latin.every(char => /[A-Z]/.test(char)));
});

test('one-character answers resist a blind one-in-three guess', () => {
  const choices = createAnswerCharacterChoices('π', seededRandom(9));
  assert.equal(choices.length, 6);
  assert.equal(choices.filter(choice => choice === 'Π').length, 1);
});

test('long answers are entered as at most eight ordered chunks', () => {
  const answers = ['Unknown Worlds Entertainment', 'Frieren: Beyond Journey’s End', '대한민국헌법제일조', 'ABCDEFGHIJKL'];
  for (const answer of answers) {
    const correct = normalizedAnswerTiles(answer);
    assert.ok(correct.length <= 8, answer);
    assert.equal(correct.join(''), normalizedAnswerCharacters(answer).join(''), answer);
    const expected = counts(correct);
    for (let seed = 0; seed < 100; seed += 1) {
      const choices = createAnswerTileChoices(answer, seededRandom(seed));
      const actual = counts(choices);
      for (const [tile, count] of expected) assert.equal(actual.get(tile), count, `${answer}: ${tile}`);
      const distractors = choices.filter(tile => !expected.has(tile));
      assert.equal(new Set(distractors).size, distractors.length, `${answer}: duplicate tile distractor`);
      assert.ok(distractors.length >= 3, `${answer}: too few tile distractors`);
    }
  }
});

test('a question token keeps choices stable across reconnect snapshots', () => {
  const first = createAnswerTileChoices('Unknown Worlds Entertainment', answerChoiceRandom('token-1:player-a'));
  const reconnect = createAnswerTileChoices('Unknown Worlds Entertainment', answerChoiceRandom('token-1:player-a'));
  const nextQuestion = createAnswerTileChoices('Unknown Worlds Entertainment', answerChoiceRandom('token-2:player-a'));
  assert.deepEqual(reconnect, first);
  assert.notDeepEqual(nextQuestion, first);
});

test('answer time scales for long tile sequences without slowing short answers', () => {
  assert.equal(answerTimeLimitMs('산소'), 7_000);
  assert.equal(answerTimeLimitMs('12345678'), 7_000);
  assert.equal(answerTimeLimitMs('123456789'), 7_500);
  assert.equal(answerTimeLimitMs('Unknown Worlds Entertainment'), 16_000);
  assert.equal(answerTimeLimitMs('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'), 18_000);
  assert.throws(() => answerTimeLimitMs(' - '), /no selectable characters/);
});
