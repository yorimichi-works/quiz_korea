import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { excludeRecentlySeenQuestionGroups, selectMatchQuestionIds } from '../lib/question-selection.ts';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

const styleCounts = {
  standard: 1700,
  wait_for_clue: 100,
  reasoning: 100,
  lateral: 50,
  misdirection: 50,
};
const categories = ['general','history','geography','science','language','life','sports','music','screen','games','animation'];
const questions = Object.entries(styleCounts).flatMap(([style, count]) =>
  Array.from({ length: count }, (_, index) => ({
    questionId: `${style}-${index}-q1`,
    factGroupId: `${style}-${index}`,
    questionStyle: style,
    categoryId: categories[index % categories.length],
    canonicalAnswer: `${style}-answer-${index}`,
    difficulty: index % 7 === 0 ? 'hard' : index % 3 === 0 ? 'easy' : 'standard',
  })),
);
const byId = new Map(questions.map(question => [question.questionId, question]));

function normalizedAnswer(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s\p{Punctuation}]/gu, '');
}

function assertEnjoyableSequence(selected, seed) {
  assert.equal(new Set(selected.map(question => question.categoryId)).size, categories.length, `seed ${seed} lacks category variety`);
  assert.equal(new Set(selected.map(question => normalizedAnswer(question.canonicalAnswer))).size, selected.length, `seed ${seed} repeats an answer`);
  assert.notEqual(selected[0].difficulty, 'hard', `seed ${seed} opens on hard`);
  const difficulties = selected.reduce((counts, question) => ({
    ...counts,
    [question.difficulty]: (counts[question.difficulty] || 0) + 1,
  }), {});
  assert.deepEqual(difficulties, { easy:7, standard:10, hard:3 }, `seed ${seed} has an uneven difficulty arc`);

  let hardRun = 0;
  for (let index = 0; index < selected.length; index += 1) {
    if (index > 0) assert.notEqual(selected[index].categoryId, selected[index - 1].categoryId, `seed ${seed} repeats a category at ${index}`);
    hardRun = selected[index].difficulty === 'hard' ? hardRun + 1 : 0;
    assert.ok(hardRun < 3, `seed ${seed} has three consecutive hard rounds at ${index}`);
  }
}

test('a full match receives the intended gameplay mix and unique facts', () => {
  for (let seed = 0; seed < 500; seed += 1) {
    const ids = selectMatchQuestionIds(questions, 20, seededRandom(seed));
    const selected = ids.map(id => byId.get(id));
    const styles = selected.map(question => question.questionStyle);
    assert.equal(ids.length, 20);
    assert.equal(new Set(ids).size, 20);
    assert.equal(new Set(selected.map(question => question.factGroupId)).size, 20);
    assertEnjoyableSequence(selected, seed);
    assert.equal(styles.filter(style => style === 'standard').length, 17);
    assert.equal(styles.filter(style => style === 'wait_for_clue').length, 1);
    assert.equal(styles.filter(style => style === 'reasoning').length, 1);
    assert.equal(styles.filter(style => style === 'lateral' || style === 'misdirection').length, 1);
    const specialIndexes = styles.map((style, index) => style === 'standard' ? -1 : index).filter(index => index >= 0);
    assert.ok(specialIndexes[0] >= 2 && specialIndexes[0] <= 3, `seed ${seed} has a mistimed opening beat`);
    assert.ok(specialIndexes[1] >= 5 && specialIndexes[1] <= 6, `seed ${seed} has a mistimed middle beat`);
    assert.equal(specialIndexes[2], 8, `seed ${seed} has a mistimed deciding beat`);
    assert.ok(specialIndexes.every((index, position) => position === 0 || index - specialIndexes[position - 1] > 1));
  }
});

test('pacing is deterministically repaired when random shuffles never improve', () => {
  for (const fixedRandom of [() => 0, () => 0.999999]) {
    const ids = selectMatchQuestionIds(questions, 20, fixedRandom);
    const styles = ids.map(id => byId.get(id).questionStyle);
    const specialIndexes = styles
      .map((style, index) => style === 'standard' ? -1 : index)
      .filter(index => index >= 0);
    assert.ok(specialIndexes[0] >= 2 && specialIndexes[0] <= 3);
    assert.ok(specialIndexes[1] >= 5 && specialIndexes[1] <= 6);
    assert.equal(specialIndexes[2], 8);
    assert.ok(specialIndexes.every((index, position) => position === 0 || index - specialIndexes[position - 1] > 1));
  }
});

test('selection rejects a deck whose special rounds cannot be separated', () => {
  const specialOnly = questions.filter(question => question.questionStyle === 'wait_for_clue').slice(0, 20);
  assert.throws(
    () => selectMatchQuestionIds(specialOnly, 20, () => 0),
    /Cannot pace 20 special rounds/,
  );
});

test('selection rejects pools without enough distinct facts', () => {
  assert.throws(
    () => selectMatchQuestionIds(questions.slice(0, 5), 20, seededRandom(1)),
    /Not enough distinct fact groups/,
  );
});

test('recent question variants exclude their whole fact group', () => {
  const pool = [
    { questionId:'seen-q1', factGroupId:'seen', canonicalAnswer:'같은 답', questionStyle:'standard' },
    { questionId:'seen-q2', factGroupId:'seen', canonicalAnswer:'다른 답', questionStyle:'standard' },
    { questionId:'other-group-same-answer', factGroupId:'other', canonicalAnswer:'같은 답', questionStyle:'standard' },
    { questionId:'fresh-q1', factGroupId:'fresh', canonicalAnswer:'새 답', questionStyle:'standard' },
  ];
  assert.deepEqual(
    excludeRecentlySeenQuestionGroups(pool, ['seen-q1']).map(question => question.questionId),
    ['fresh-q1'],
  );
});

test('a knowledge fact excludes differently authored fact groups from one deck', () => {
  const pool = [
    { questionId:'shared-a', factGroupId:'authored-a', knowledgeFactId:'shared-knowledge', canonicalAnswer:'답 A', questionStyle:'standard' },
    { questionId:'shared-b', factGroupId:'authored-b', knowledgeFactId:'shared-knowledge', canonicalAnswer:'답 B', questionStyle:'standard' },
    { questionId:'fresh-a', factGroupId:'fresh-a', knowledgeFactId:'fresh-a', canonicalAnswer:'답 C', questionStyle:'standard' },
    { questionId:'fresh-b', factGroupId:'fresh-b', knowledgeFactId:'fresh-b', canonicalAnswer:'답 D', questionStyle:'standard' },
  ];
  const selected = selectMatchQuestionIds(pool, 3, () => 0);
  assert.equal(selected.filter(id => id === 'shared-a' || id === 'shared-b').length, 1);
  assert.deepEqual(new Set(selected), new Set(['shared-a', 'fresh-a', 'fresh-b']));
});

test('recent three-match history excludes a different fact group with the same knowledge fact', () => {
  const pool = [
    { questionId:'recent-one', factGroupId:'recent-one', knowledgeFactId:'recent-one', canonicalAnswer:'지난 답 1' },
    { questionId:'recent-two', factGroupId:'recent-two', knowledgeFactId:'recent-two', canonicalAnswer:'지난 답 2' },
    { questionId:'recent-three', factGroupId:'authored-a', knowledgeFactId:'shared-knowledge', canonicalAnswer:'지난 답 3' },
    { questionId:'linked-variant', factGroupId:'authored-b', knowledgeFactId:'shared-knowledge', canonicalAnswer:'별도 답' },
    { questionId:'fresh', factGroupId:'fresh', knowledgeFactId:'fresh', canonicalAnswer:'새 답' },
  ];
  const recentThreeMatches = [['recent-one'], ['recent-two'], ['recent-three']];
  assert.deepEqual(
    excludeRecentlySeenQuestionGroups(pool, recentThreeMatches.flat()).map(question => question.questionId),
    ['fresh'],
  );
});

test('the active season produces paced decks from real fact groups', async () => {
  const manifest = JSON.parse(await readFile(new URL('../data/seasons/manifest.json', import.meta.url), 'utf8'));
  const active = manifest.seasons.find(season => season.seasonId === manifest.activeSeasonId);
  assert.ok(active);
  const season = JSON.parse(await readFile(new URL(`../data/seasons/${active.questionFile}`, import.meta.url), 'utf8'));
  const live = season.questions.filter(question => question.enabledInSeason && question.qaStatus !== 'REJECT');
  const realById = new Map(live.map(question => [question.questionId, question]));

  for (let seed = 0; seed < 200; seed += 1) {
    const ids = selectMatchQuestionIds(live, 20, seededRandom(seed));
    const selected = ids.map(id => realById.get(id));
    const styles = selected.map(question => question.questionStyle);
    assert.equal(new Set(selected.map(question => question.knowledgeFactId || question.factGroupId || question.questionId)).size, 20);
    assert.equal(new Set(selected.map(question => normalizedAnswer(question.canonicalAnswer))).size, 20);
    assert.equal(new Set(selected.map(question => question.categoryId)).size, 11);
    assert.notEqual(selected[0].difficulty, 'hard');
    assert.equal(selected.filter(question => question.difficulty === 'easy').length, 7);
    assert.equal(selected.filter(question => question.difficulty === 'standard').length, 10);
    assert.equal(selected.filter(question => question.difficulty === 'hard').length, 3);
    for (let index = 1; index < selected.length; index += 1) {
      assert.notEqual(selected[index].categoryId, selected[index - 1].categoryId);
      assert.ok(!(
        selected[index].difficulty === 'hard'
        && selected[index - 1].difficulty === 'hard'
        && selected[index - 2]?.difficulty === 'hard'
      ));
    }
    assert.equal(styles.filter(style => style === 'standard').length, 17);
    assert.equal(styles.filter(style => style === 'wait_for_clue').length, 1);
    assert.equal(styles.filter(style => style === 'reasoning').length, 1);
    assert.equal(styles.filter(style => style === 'lateral' || style === 'misdirection').length, 1);
  }
});
