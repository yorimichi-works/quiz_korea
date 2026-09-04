import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { questionRevealDurationMs } from '../lib/question-timing.ts';

const manifest = JSON.parse(await readFile(new URL('../data/seasons/manifest.json', import.meta.url), 'utf8'));
const active = manifest.seasons.find(season => season.seasonId === manifest.activeSeasonId);
assert.ok(active);
const season = JSON.parse(await readFile(new URL(`../data/seasons/${active.questionFile}`, import.meta.url), 'utf8'));
const live = season.questions.filter(question => question.enabledInSeason && question.qaStatus !== 'REJECT');
const lateClueMarker = /(?:마지막\s*(?:단서|힌트)(?:로|는|:)?|결정적\s*단서(?:는|:)?)/;

function assertNoIssues(issues, label) {
  assert.equal(issues.length, 0, `${label}: ${issues.length} issue(s)\n${issues.slice(0, 40).map(issue => `- ${issue}`).join('\n')}`);
}

test('every clue is read before one terminal question', () => {
  const issues = live
    .filter(question => question.questionText.indexOf('?') !== question.questionText.length - 1)
    .map(question => `${question.questionId}: ${question.questionText}`);
  assertNoIssues(issues, 'question-ending structure');
});

test('retired generator prose cannot return to the live pool', () => {
  const retiredPatterns = [
    /다음 캐릭터가 등장하는 게임 시리즈/,
    /다음 설명에 해당하는 대회 또는 트로피/,
    /한국 웹툰 또는 원작 작품/,
    /작가 또는 원작자/,
    /[’']이라는 표현을 사용하는 스포츠/,
    /(?:열리는|참가하는)\.$/,
  ];
  const issues = live
    .filter(question => retiredPatterns.some(pattern => pattern.test(question.questionText)))
    .map(question => `${question.questionId}: ${question.questionText}`);
  assertNoIssues(issues, 'retired template prose');
});

test('wait-for-clue rounds create a real decision window before the giveaway', () => {
  const issues = [];
  for (const question of live.filter(question => question.questionStyle === 'wait_for_clue')) {
    const marker = lateClueMarker.exec(question.questionText);
    if (!marker) {
      issues.push(`${question.questionId}: final clue marker missing`);
      continue;
    }
    const markerRatio = marker.index / question.questionText.length;
    const expertWindowMs = questionRevealDurationMs(question.questionText.slice(0, marker.index));
    if (markerRatio < 0.48) issues.push(`${question.questionId}: giveaway begins at ${(markerRatio * 100).toFixed(1)}%`);
    if (expertWindowMs < 2_500) issues.push(`${question.questionId}: expert decision window is only ${expertWindowMs}ms`);
    if (questionRevealDurationMs(question.questionText) > 20_000) issues.push(`${question.questionId}: full reveal exceeds 20 seconds`);
  }
  assertNoIssues(issues, 'wait-for-clue pacing');
});

test('relation twists use varied pivots rather than one pasted formula', () => {
  const relationTwists = live.filter(question => question.misdirectionType === 'relation_twist');
  const genericPivotCount = relationTwists.filter(question => question.questionText.includes('그렇다면')).length;
  assert.equal(relationTwists.length, 25);
  assert.ok(genericPivotCount <= 12, `${genericPivotCount}/25 relation twists use 그렇다면`);
});

test('question reveal durations stay readable without stalling a match', () => {
  const issues = live
    .filter(question => questionRevealDurationMs(question.questionText) > 20_000)
    .map(question => `${question.questionId}: ${questionRevealDurationMs(question.questionText)}ms`);
  assertNoIssues(issues, 'question reveal duration');
});
