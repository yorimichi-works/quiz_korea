import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifest = JSON.parse(await readFile(new URL('../data/seasons/manifest.json', import.meta.url), 'utf8'));
const activeSeason = manifest.seasons.find(item => item.seasonId === manifest.activeSeasonId);
if (!activeSeason) throw new Error(`Active season not found: ${manifest.activeSeasonId}`);
const activeSeasonUrl = new URL(`../data/seasons/${activeSeason.questionFile}`, import.meta.url);
const activeSeasonData = JSON.parse(await readFile(activeSeasonUrl, 'utf8'));
const live = activeSeasonData.questions.filter(question => question.enabledInSeason && question.qaStatus !== 'REJECT');
const placeholderPattern = /은\(는\)|이\(가\)|말는|기록는|종목는|영법는|게임 또는 대표 시리즈/;
const entertainmentContextPattern = /(?:영화|드라마|방송|예능|작품|소설|제목|감독|연출|프로그램|시리즈|다큐멘터리|애니메이션|뮤지컬|연극|가수|노래|앨범|배우|출연)/;
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\s·.,!?！？'"“”‘’()（）\-_:：/「」]/g, '');

test('live Korean questions contain no unresolved grammar templates', () => {
  const invalid = live.filter(question => placeholderPattern.test(`${question.questionText} ${question.explanation || ''}`));
  assert.deepEqual(invalid.map(question => question.questionId), []);
});

test('active season exposes the complete 2,000-question pool', () => {
  assert.equal(live.length, 2000, `expected exactly 2,000 live questions, got ${live.length}`);
  assert.ok(new Set(live.map(question => question.categoryId)).size >= 10);
});

test('entertainment questions identify the work, medium, or requested role', () => {
  const ambiguous = live.filter(
    question => question.categoryId === 'entertainment_broadcast'
      && !entertainmentContextPattern.test(question.questionText),
  );
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
