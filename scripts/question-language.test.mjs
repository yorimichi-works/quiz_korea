import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const season = JSON.parse(await readFile(new URL('../data/seasons/S1-2026/questions.ko.json', import.meta.url), 'utf8'));
const live = season.questions.filter(question => question.enabledInSeason && question.qaStatus !== 'REJECT');
const placeholderPattern = /은\(는\)|이\(가\)|말는|기록는|종목는|영법는|게임 또는 대표 시리즈/;
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\s·.,!?！？'"“”‘’()（）\-_:：/「」]/g, '');

test('live Korean questions contain no unresolved grammar templates', () => {
  const invalid = live.filter(question => placeholderPattern.test(`${question.questionText} ${question.explanation || ''}`));
  assert.deepEqual(invalid.map(question => question.questionId), []);
});

test('live pool remains large and varied after language quality filtering', () => {
  assert.ok(live.length >= 900, `expected at least 900 live questions, got ${live.length}`);
  assert.ok(new Set(live.map(question => question.categoryId)).size >= 10);
});

test('ambiguous drama role variants are excluded from live matches', () => {
  const ambiguous = live.filter(question => question.categoryId === 'entertainment_broadcast' && question.variantId === 'q2' && !question.questionText.startsWith('영화 '));
  assert.deepEqual(ambiguous.map(question => question.questionId), []);
});

test('questions do not reveal substantial canonical answers verbatim', () => {
  const leaking = live.filter(question => {
    const answer = normalize(question.canonicalAnswer);
    return answer.length >= 3 && normalize(question.questionText).includes(answer);
  });
  assert.deepEqual(leaking.map(question => question.questionId), []);
});

test('live question wording is unique after normalization', () => {
  const seen = new Map();
  for (const question of live) {
    const key = normalize(question.questionText);
    seen.set(key, [...(seen.get(key) || []), question.questionId]);
  }
  const duplicates = [...seen.values()].filter(ids => ids.length > 1);
  assert.deepEqual(duplicates, []);
});
