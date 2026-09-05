import { readFile } from 'node:fs/promises';
import {
  excludeRecentlySeenQuestionGroups,
  selectMatchQuestionIds,
} from '../lib/question-selection.ts';
import { questionRevealDurationMs } from '../lib/question-timing.ts';

const season = JSON.parse(await readFile(new URL('../data/seasons/S2-2026/questions.ko.json', import.meta.url), 'utf8'));
const questions = season.questions.filter(question => question.enabledInSeason && question.qaStatus !== 'REJECT');
const byId = new Map(questions.map(question => [question.questionId, question]));

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function answerKey(question) {
  return String(question.canonicalAnswer).normalize('NFKC').toLocaleUpperCase('ko-KR').replace(/[\s\p{Punctuation}]/gu, '');
}

const simulations = 5_000;
const failures = [];
const varietyStyles = { lateral:0, misdirection:0 };
const specialRounds = new Map();
const waitRounds = new Map();

for (let seed = 0; seed < simulations; seed += 1) {
  const selected = selectMatchQuestionIds(questions, 20, seededRandom(seed)).map(id => byId.get(id));
  const styles = selected.map(question => question.questionStyle);
  const difficulties = Object.fromEntries(['easy','standard','hard'].map(value => [value, selected.filter(question => question.difficulty === value).length]));
  const specialIndexes = styles.map((style, index) => style === 'standard' ? -1 : index).filter(index => index >= 0);
  const waitIndex = styles.indexOf('wait_for_clue');
  let hardRun = 0;
  const invalid = selected.length !== 20
    || new Set(selected.map(question => question.factGroupId)).size !== 20
    || new Set(selected.map(question => question.knowledgeFactId || question.factGroupId || question.questionId)).size !== 20
    || new Set(selected.map(answerKey)).size !== 20
    || new Set(selected.map(question => question.categoryId)).size !== 11
    || selected.some((question, index) => index > 0 && question.categoryId === selected[index - 1].categoryId)
    || selected.some(question => {
      hardRun = question.difficulty === 'hard' ? hardRun + 1 : 0;
      return hardRun >= 3;
    })
    || selected[0].difficulty === 'hard'
    || difficulties.easy !== 7 || difficulties.standard !== 10 || difficulties.hard !== 3
    || styles.filter(style => style === 'standard').length !== 17
    || styles.filter(style => style === 'wait_for_clue').length !== 1
    || styles.filter(style => style === 'reasoning').length !== 1
    || styles.filter(style => style === 'lateral' || style === 'misdirection').length !== 1
    || waitIndex !== specialIndexes[0]
    || specialIndexes[0] < 2 || specialIndexes[0] > 3
    || specialIndexes[1] < 5 || specialIndexes[1] > 6
    || specialIndexes[2] !== 8;
  if (invalid) failures.push(seed);
  const variety = styles.find(style => style === 'lateral' || style === 'misdirection');
  varietyStyles[variety] += 1;
  for (const index of specialIndexes) specialRounds.set(index + 1, (specialRounds.get(index + 1) || 0) + 1);
  waitRounds.set(waitIndex + 1, (waitRounds.get(waitIndex + 1) || 0) + 1);
}

let recentAnswerRepeats = 0;
let history = [];
for (let index = 0; index < 1_000; index += 1) {
  const recentIds = history.flat();
  const recentAnswers = new Set(recentIds.map(id => answerKey(byId.get(id))));
  const fresh = excludeRecentlySeenQuestionGroups(questions, recentIds);
  const ids = selectMatchQuestionIds(fresh, 20, seededRandom(10_000 + index));
  recentAnswerRepeats += ids.map(id => byId.get(id)).filter(question => recentAnswers.has(answerKey(question))).length;
  history = [ids, ...history].slice(0, 3);
}

const durations = questions.map(question => questionRevealDurationMs(question.questionText)).sort((left, right) => left - right);
const percentile = ratio => durations[Math.floor((durations.length - 1) * ratio)];
const report = {
  simulations,
  invariantFailures: failures.length,
  varietyStyles,
  specialRoundCounts: Object.fromEntries([...specialRounds].sort((left, right) => left[0] - right[0])),
  waitRoundCounts: Object.fromEntries([...waitRounds].sort((left, right) => left[0] - right[0])),
  recentAnswerRepeatsAcross1_000Matches: recentAnswerRepeats,
  revealDurationMs: { p50:percentile(0.5), p90:percentile(0.9), p99:percentile(0.99), max:durations.at(-1) },
};

console.log(JSON.stringify(report, null, 2));
if (failures.length || recentAnswerRepeats) process.exitCode = 1;
