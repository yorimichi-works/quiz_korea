import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createAnswerCharacterChoices,
  createAnswerTileChoices,
  normalizedAnswerCharacters,
  normalizedAnswerTiles,
} from '../lib/answer-choices.ts';

const manifestUrl = new URL('../data/seasons/manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
const activeSeason = manifest.seasons?.find(season => season.seasonId === manifest.activeSeasonId);

assert.ok(activeSeason, `active season not found: ${manifest.activeSeasonId}`);

const seasonUrl = new URL(`../data/seasons/${activeSeason.questionFile}`, import.meta.url);
const season = JSON.parse(await readFile(seasonUrl, 'utf8'));
const questions = Array.isArray(season.questions) ? season.questions : [];
const live = questions.filter(question => question.enabledInSeason && question.qaStatus !== 'REJECT');

const STYLE_TARGETS = Object.freeze({
  standard: 1700,
  misdirection: 50,
  wait_for_clue: 100,
  reasoning: 100,
  lateral: 50,
});
const MISDIRECTION_TYPES = new Set(['late_easy_clue', 'relation_twist']);

const REQUIRED_FIELDS = [
  'questionId',
  'locale',
  'categoryId',
  'categoryKo',
  'difficulty',
  'difficultyScore',
  'questionText',
  'canonicalAnswer',
  'acceptedAliases',
  'explanation',
  'validityType',
  'factCheckedAsOf',
  'sourceUrls',
  'factGroupId',
  'knowledgeFactId',
  'variantId',
  'questionStyle',
  'misdirectionType',
  'qaStatus',
  'enabledInSeason',
];

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{White_Space}\p{Punctuation}]/gu, '');
}

function normalizeAnswer(value) {
  return normalizedAnswerCharacters(value).join('').toLowerCase();
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, [...(groups.get(key) || []), value]);
  }
  return groups;
}

function formatQuestion(question) {
  return `${question.questionId || '<missing-id>'}: ${question.questionText || '<missing-text>'}`;
}

function assertNoIssues(issues, label) {
  assert.equal(
    issues.length,
    0,
    `${label}: ${issues.length} issue(s)\n${issues.slice(0, 40).map(issue => `- ${issue}`).join('\n')}`,
  );
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function multiset(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function hasCommaSplitAliases(question) {
  const canonicalDigits = String(question.canonicalAnswer ?? '').normalize('NFKC').replace(/[\s,]/g, '');
  if (!/^\d+$/.test(canonicalDigits)) return false;
  const numericAliases = (question.acceptedAliases || [])
    .map(alias => String(alias).normalize('NFKC').trim())
    .filter(alias => /^\d+$/.test(alias));
  return numericAliases.length >= 2 && numericAliases.join('') === canonicalDigits;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exposesAnswer(question) {
  const answer = normalizeAnswer(question.canonicalAnswer);
  if (!answer) return false;
  if (Array.from(answer).length >= 3) return normalizeAnswer(question.questionText).includes(answer);

  const rawAnswer = String(question.canonicalAnswer).normalize('NFKC').trim();
  if (!rawAnswer || !/^[\p{Letter}\p{Number}]+$/u.test(rawAnswer)) return false;
  const particles = '(?:은|는|이|가|을|를|의|에|에서|에게|으로|로|와|과|도|만|부터|까지)?';
  const pattern = new RegExp(
    `(^|[^\\p{Letter}\\p{Number}])${escapeRegExp(rawAnswer)}${particles}(?=$|[^\\p{Letter}\\p{Number}])`,
    'iu',
  );
  return pattern.test(String(question.questionText));
}

test('active season metadata and exact live count agree', () => {
  assert.equal(season.seasonId, activeSeason.seasonId, 'seasonId must match the active manifest entry');
  assert.equal(season.total, questions.length, 'season.total must equal questions.length');
  assert.equal(season.eligibleCount, live.length, 'season.eligibleCount must equal the actual live pool');
  assert.equal(activeSeason.eligibleCount, live.length, 'manifest eligibleCount must equal the actual live pool');
  assert.equal(live.length, 2000, 'the active live pool must contain exactly 2,000 questions');
});

test('every question satisfies the required schema', () => {
  const issues = [];
  const allowedDifficulties = new Set(['easy', 'standard', 'hard']);
  const allowedValidityTypes = new Set(['static', 'seasonal']);
  const allowedStatuses = new Set(['APPROVED', 'REVIEW', 'HOLD', 'REJECT']);
  const allowedStyles = new Set(Object.keys(STYLE_TARGETS));

  for (const [index, question] of questions.entries()) {
    const label = question?.questionId || `questions[${index}]`;
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
      issues.push(`${label} must be an object`);
      continue;
    }
    for (const field of REQUIRED_FIELDS) {
      if (!(field in question)) issues.push(`${label} is missing ${field}`);
    }
    for (const field of ['questionId', 'locale', 'categoryId', 'categoryKo', 'questionText', 'canonicalAnswer', 'explanation', 'factGroupId', 'knowledgeFactId', 'variantId', 'questionStyle', 'qaStatus']) {
      if (typeof question[field] !== 'string' || !question[field].trim()) issues.push(`${label}.${field} must be a non-empty string`);
    }
    if (question.locale !== activeSeason.locale) issues.push(`${label}.locale must be ${activeSeason.locale}`);
    if (!allowedDifficulties.has(question.difficulty)) issues.push(`${label}.difficulty is invalid: ${question.difficulty}`);
    if (!Number.isInteger(question.difficultyScore) || question.difficultyScore < 1 || question.difficultyScore > 100) {
      issues.push(`${label}.difficultyScore must be an integer from 1 through 100`);
    }
    if (!allowedValidityTypes.has(question.validityType)) issues.push(`${label}.validityType is invalid: ${question.validityType}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(question.factCheckedAsOf || '')) issues.push(`${label}.factCheckedAsOf must use YYYY-MM-DD`);
    if (!Array.isArray(question.acceptedAliases)) issues.push(`${label}.acceptedAliases must be an array`);
    if (!Array.isArray(question.sourceUrls) || question.sourceUrls.some(url => typeof url !== 'string' || !isHttpUrl(url))) {
      issues.push(`${label}.sourceUrls must contain only HTTP(S) URLs`);
    }
    if (!/^q[1-9]\d*$/.test(question.variantId || '')) issues.push(`${label}.variantId must look like q1 or q2`);
    if (!allowedStyles.has(question.questionStyle)) issues.push(`${label}.questionStyle is invalid: ${question.questionStyle}`);
    if (!allowedStatuses.has(question.qaStatus)) issues.push(`${label}.qaStatus is invalid: ${question.qaStatus}`);
    if (typeof question.enabledInSeason !== 'boolean') issues.push(`${label}.enabledInSeason must be boolean`);
  }

  assertNoIssues(issues, 'question schema');
});

test('question IDs are unique', () => {
  const duplicates = [...groupBy(questions, question => question.questionId).entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([id, matches]) => `${id} appears ${matches.length} times`);
  assertNoIssues(duplicates, 'duplicate question IDs');
});

test('normalized wording is unique across every record', () => {
  const duplicates = [...groupBy(questions, question => normalizeText(question.questionText)).values()]
    .filter(matches => matches.length > 1)
    .map(matches => matches.map(formatQuestion).join(' | '));
  assertNoIssues(duplicates, 'duplicate normalized wording');
});

test('identical wording never maps to different answers', () => {
  const conflicts = [...groupBy(questions, question => normalizeText(question.questionText)).values()]
    .filter(matches => new Set(matches.map(question => normalizeAnswer(question.canonicalAnswer))).size > 1)
    .map(matches => matches.map(question => `${question.questionId} => ${question.canonicalAnswer}`).join(' | '));
  assertNoIssues(conflicts, 'same-wording answer conflicts');
});

test('fact groups use safe, unique, consecutive variants', () => {
  const issues = [];
  for (const [factGroupId, members] of groupBy(questions, question => question.factGroupId)) {
    const variants = members.map(question => question.variantId);
    const variantNumbers = variants
      .map(variant => /^q([1-9]\d*)$/.exec(variant)?.[1])
      .map(Number)
      .sort((left, right) => left - right);
    const expectedNumbers = Array.from({ length: members.length }, (_, index) => index + 1);
    const isNewGroup = String(factGroupId).startsWith('s2_fact_');
    const safeSize = isNewGroup ? members.length === 2 : members.length >= 1 && members.length <= 4;
    const safeVariants = new Set(variants).size === variants.length
      && variantNumbers.length === members.length
      && variantNumbers.every((value, index) => value === expectedNumbers[index]);
    if (!safeSize || !safeVariants || (isNewGroup && !variants.includes('q1')) || (isNewGroup && !variants.includes('q2'))) {
      issues.push(`${factGroupId || '<missing-group>'}: ${members.map(question => `${question.questionId}/${question.variantId}`).join(', ')}`);
    }
  }
  assertNoIssues(issues, 'fact group variants');
});

test('fact groups do not repeat the same multi-answer fingerprint', () => {
  const fingerprints = new Map();
  const issues = [];

  for (const [factGroupId, members] of groupBy(questions, question => question.factGroupId)) {
    const answers = [...new Set(members.map(question => normalizeAnswer(question.canonicalAnswer)).filter(Boolean))].sort();
    // A single shared answer can legitimately describe unrelated facts. Two or
    // more answers repeated as a set is a strong signal that the same fact was
    // expressed under two different group IDs.
    if (answers.length < 2) continue;
    const fingerprint = answers.join('\u001f');
    const previous = fingerprints.get(fingerprint);
    if (previous && previous !== factGroupId) {
      issues.push(`${previous} and ${factGroupId}: ${answers.join(' / ')}`);
    } else {
      fingerprints.set(fingerprint, factGroupId);
    }
  }

  assertNoIssues(issues, 'duplicate fact answer fingerprints');
});

test('each authored fact group maps to exactly one knowledge fact', () => {
  const questionsWithKnowledgeFacts = questions.filter(
    question => typeof question.knowledgeFactId === 'string' && question.knowledgeFactId.trim(),
  );
  const issues = [...groupBy(questionsWithKnowledgeFacts, question => question.factGroupId).entries()]
    .filter(([, members]) => new Set(members.map(question => question.knowledgeFactId)).size > 1)
    .map(([factGroupId, members]) => `${factGroupId || '<missing-fact-group>'}: ${[...new Set(members.map(question => question.knowledgeFactId))].join(', ')}`);
  assertNoIssues(issues, 'knowledge fact grouping');
});

test('new S2 questions include at least one source URL', () => {
  const issues = questions
    .filter(question => String(question.questionId).includes('_s2_'))
    .filter(question => !Array.isArray(question.sourceUrls) || question.sourceUrls.length === 0)
    .map(question => `${question.questionId}: sourceUrls is empty`);
  assertNoIssues(issues, 'new question sources');
});

test('misdirection questions stay within two to three percent of the live pool', () => {
  const misdirection = live.filter(question => question.questionStyle === 'misdirection');
  const ratio = misdirection.length / live.length;
  assert.ok(
    misdirection.length >= 40 && misdirection.length <= 60,
    `expected 40-60 live misdirection questions, got ${misdirection.length}`,
  );
  assert.ok(ratio >= 0.02 && ratio <= 0.03, `misdirection ratio must be 2%-3%, got ${(ratio * 100).toFixed(2)}%`);
});

test('live question styles match the exact season mix', () => {
  const counts = live.reduce((result, question) => {
    result.set(question.questionStyle, (result.get(question.questionStyle) || 0) + 1);
    return result;
  }, new Map());
  const issues = [];

  for (const [style, expected] of Object.entries(STYLE_TARGETS)) {
    const actual = counts.get(style) || 0;
    if (actual !== expected) issues.push(`${style}: expected ${expected}, got ${actual}`);
  }
  for (const style of counts.keys()) {
    if (!(style in STYLE_TARGETS)) issues.push(`unexpected style in live pool: ${style}`);
  }
  if (season.questionStyleCounts !== undefined) {
    if (!season.questionStyleCounts || typeof season.questionStyleCounts !== 'object' || Array.isArray(season.questionStyleCounts)) {
      issues.push('season.questionStyleCounts must be an object when present');
    } else {
      for (const [style, expected] of counts) {
        if (season.questionStyleCounts[style] !== expected) {
          issues.push(`season.questionStyleCounts.${style}: expected ${expected}, got ${season.questionStyleCounts[style]}`);
        }
      }
    }
  }

  assertNoIssues(issues, 'question style mix');
});

test('misdirection metadata is present only on misdirection questions', () => {
  const issues = [];
  const typeCounts = new Map();
  for (const question of questions) {
    const type = typeof question.misdirectionType === 'string' ? question.misdirectionType.trim() : question.misdirectionType;
    if (question.questionStyle === 'misdirection') {
      if (!MISDIRECTION_TYPES.has(type)) {
        issues.push(`${question.questionId}: invalid or missing misdirectionType ${JSON.stringify(type)}`);
      } else if (live.includes(question)) {
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
      }
    } else if (type !== null && type !== undefined && type !== '') {
      issues.push(`${question.questionId}: ${question.questionStyle} question must not have misdirectionType ${JSON.stringify(type)}`);
    }
  }
  for (const type of MISDIRECTION_TYPES) {
    const actual = typeCounts.get(type) || 0;
    if (actual !== 25) issues.push(`${type}: expected 25 live questions, got ${actual}`);
  }
  if (season.misdirectionTypeCounts !== undefined) {
    if (!season.misdirectionTypeCounts || typeof season.misdirectionTypeCounts !== 'object' || Array.isArray(season.misdirectionTypeCounts)) {
      issues.push('season.misdirectionTypeCounts must be an object when present');
    } else {
      for (const [type, expected] of typeCounts) {
        if (season.misdirectionTypeCounts[type] !== expected) {
          issues.push(`season.misdirectionTypeCounts.${type}: expected ${expected}, got ${season.misdirectionTypeCounts[type]}`);
        }
      }
    }
  }
  assertNoIssues(issues, 'misdirection metadata');
});

test('special question styles retain their objective reading structure', () => {
  const issues = [];
  const lateClueMarker = /(?:마지막\s*(?:단서|힌트)(?:로|는|:)?|결정적\s*단서(?:는|:)?)/;
  const inferenceCue = /(?:두\s*(?:정보|조건|특징|기록|단서|뜻)|세\s*(?:집단|주인공)|함께|동시에|모두\s*만족|조합|연결|가리키|추론|연상|합치|더하|합(?:은|이|을|쳐|치면)|곱|나누|빼서|계산|세면|각각|반대|보다|차례|한\s*바퀴|몇\s*(?:개|명|줄|종류|비트|점|미터|분|배|도)|절반|두\s*쌍|대조|겹치|이은|곧\s*제목|제목에\s*담|부제|바로\s*그|자리한)/;
  const naturalRelationCue = /(?:속하|가운데|따라|흘러|들어가|삼각주|걸쳐|사이|가장|최장|최고|이루어|경계|국경|지류|거슬러|비그늘|그래서|같|다르|바꾸|동안|만큼|더\s*이상|빨라질수록|비례|있|포함|먼저|흐름|대비|횟수|변화|공통|결과|조건|단계|순서|반올림|다음|뒤|후|전|때|마다|부터|까지|라면|하지만|막힌)/;
  const associationCue = /(?:연상|연결|합치|이어|잇는|붙여|붙인\s*형태|빼면|같은|다른|공통|뜻|머리글자|팬덤명|무게\s*단위|더하|합(?:은|이|을|쳐|치면)|곱|나누|세면|각각|반대|거꾸로|보다|차례|한\s*바퀴|몇\s*(?:개|명|줄|종류|비트)|절반|두\s*쌍|닮은|빗대|그대로|떠올리|떠올렸|시작|끝|처럼|아니|그렇다면|반응|이름|되기\s*전|훗날|묶|맡았|담당|어느\s*팀도|두\s*선수)/;

  for (const question of questions) {
    const text = String(question.questionText || '');
    if (question.questionStyle === 'wait_for_clue') {
      const markerIndex = lateClueMarker.exec(text)?.index ?? -1;
      const clauses = text.split(/[.!?]+/).map(clause => clause.trim()).filter(Boolean);
      if (text.length < 60) issues.push(`${question.questionId}: wait-for-clue question is too short to stage its clues`);
      if (markerIndex < Math.floor(text.length / 4)) issues.push(`${question.questionId}: final-clue marker is missing or appears too early`);
      if (clauses.length < 2) issues.push(`${question.questionId}: wait-for-clue question needs at least two clauses`);
    } else if (question.questionStyle === 'reasoning') {
      if (text.length < 24 || (!inferenceCue.test(text) && !naturalRelationCue.test(text))) {
        issues.push(`${question.questionId}: reasoning question needs an explicit multi-clue deduction prompt`);
      }
    } else if (question.questionStyle === 'lateral' && (text.length < 24 || !associationCue.test(text))) {
      issues.push(`${question.questionId}: lateral question needs a clear association cue`);
    }

    if (['wait_for_clue', 'reasoning', 'lateral'].includes(question.questionStyle) && !text.trim().endsWith('?')) {
      issues.push(`${question.questionId}: styled question must end with a question mark`);
    }
  }

  assertNoIssues(issues, 'special question structure');
});

test('canonical answers and aliases are safe for one-answer character input', () => {
  const issues = [];
  for (const question of questions) {
    const canonical = normalizeAnswer(question.canonicalAnswer);
    const aliases = Array.isArray(question.acceptedAliases) ? question.acceptedAliases : [];
    if (!canonical) issues.push(`${question.questionId}: canonicalAnswer normalizes to empty`);
    if (Array.from(canonical).length > 100) issues.push(`${question.questionId}: canonicalAnswer exceeds the API input limit`);
    if (hasCommaSplitAliases(question)) issues.push(`${question.questionId}: aliases look like a comma-formatted number split into fragments`);

    const rawAliases = new Set();
    for (const alias of aliases) {
      if (typeof alias !== 'string') {
        issues.push(`${question.questionId}: alias must be a string`);
        continue;
      }
      const rawKey = alias.normalize('NFKC').trim().toLowerCase();
      const normalized = normalizeAnswer(alias);
      if (!rawKey || !normalized) issues.push(`${question.questionId}: alias must not be empty`);
      if (Array.from(normalized).length === 1) issues.push(`${question.questionId}: one-character alias is unsafe: ${JSON.stringify(alias)}`);
      if (rawAliases.has(rawKey)) issues.push(`${question.questionId}: duplicate alias: ${JSON.stringify(alias)}`);
      rawAliases.add(rawKey);
      if (normalized !== canonical) {
        issues.push(`${question.questionId}: alias is not normalization-equivalent to canonicalAnswer: ${JSON.stringify(alias)}`);
      }
    }
  }
  assertNoIssues(issues, 'answer and alias safety');
});

test('question wording does not reveal its canonical answer', () => {
  const leaking = questions.filter(exposesAnswer).map(formatQuestion);
  assertNoIssues(leaking, 'answer leakage');
});

test('result explanations explicitly recover the canonical answer', () => {
  const issues = live
    .filter(question => !normalizeAnswer(question.explanation).includes(normalizeAnswer(question.canonicalAnswer)))
    .map(question => `${question.questionId}: explanation does not name ${JSON.stringify(question.canonicalAnswer)}`);
  assertNoIssues(issues, 'answer-recovering explanations');
});

test('candidate character bags preserve the canonical answer multiset without collisions', () => {
  const issues = [];
  for (const question of live) {
    const correct = normalizedAnswerCharacters(question.canonicalAnswer);
    const answerLength = Array.from(normalizeAnswer(question.canonicalAnswer)).length;
    const extraCount = correct.length === 1 ? 5 : Math.min(5, Math.max(2, correct.length));
    if (correct.length !== answerLength) {
      issues.push(`${question.questionId}: answerLength ${answerLength} differs from candidate character length ${correct.length}`);
      continue;
    }
    const correctCounts = multiset(correct);
    for (let seed = 0; seed < 32; seed += 1) {
      let candidates;
      try {
        candidates = createAnswerCharacterChoices(question.canonicalAnswer, seededRandom(seed));
      } catch (error) {
        issues.push(`${question.questionId}/seed-${seed}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      const candidateCounts = multiset(candidates);
      for (const [character, count] of correctCounts) {
        if ((candidateCounts.get(character) || 0) !== count) {
          issues.push(`${question.questionId}/seed-${seed}: canonical character multiplicity changed for ${JSON.stringify(character)}`);
        }
      }
      const distractors = candidates.filter(character => !correctCounts.has(character));
      if (new Set(distractors).size !== distractors.length) {
        issues.push(`${question.questionId}/seed-${seed}: distractors are not unique`);
      }
      if (distractors.length !== extraCount) {
        issues.push(`${question.questionId}/seed-${seed}: got ${distractors.length} distractors, expected ${extraCount}`);
      }
      if (candidates.length !== correct.length + extraCount) {
        issues.push(`${question.questionId}/seed-${seed}: candidate bag has the wrong size`);
      }
    }

    const acceptedForms = [question.canonicalAnswer, ...(question.acceptedAliases || [])]
      .map(normalizeAnswer);
    if (new Set(acceptedForms).size !== 1) issues.push(`${question.questionId}: candidate input permits more than one normalized accepted answer`);
    for (const alias of question.acceptedAliases || []) {
      if (normalizedAnswerCharacters(alias).join('') !== correct.join('')) {
        issues.push(`${question.questionId}: accepted alias cannot be entered with the canonical candidate sequence: ${JSON.stringify(alias)}`);
      }
    }
  }
  assertNoIssues(issues, 'candidate character multiset');
});

test('long answers use a bounded, unambiguous tile sequence', () => {
  const issues = [];
  for (const question of live) {
    let correctTiles;
    try {
      correctTiles = normalizedAnswerTiles(question.canonicalAnswer);
    } catch (error) {
      issues.push(`${question.questionId}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (correctTiles.length > 8) issues.push(`${question.questionId}: ${correctTiles.length} correct tiles exceeds the interaction cap`);
    if (correctTiles.join('') !== normalizedAnswerCharacters(question.canonicalAnswer).join('')) {
      issues.push(`${question.questionId}: answer tiles do not reconstruct the canonical answer`);
    }
    const correctCounts = multiset(correctTiles);
    for (let seed = 0; seed < 8; seed += 1) {
      let choices;
      try {
        choices = createAnswerTileChoices(question.canonicalAnswer, seededRandom(seed));
      } catch (error) {
        issues.push(`${question.questionId}/tile-seed-${seed}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      const choiceCounts = multiset(choices);
      for (const [tile, count] of correctCounts) {
        if ((choiceCounts.get(tile) || 0) !== count) {
          issues.push(`${question.questionId}/tile-seed-${seed}: canonical tile multiplicity changed for ${JSON.stringify(tile)}`);
        }
      }
      const distractors = choices.filter(tile => !correctCounts.has(tile));
      if (new Set(distractors).size !== distractors.length) {
        issues.push(`${question.questionId}/tile-seed-${seed}: tile distractors are not unique`);
      }
    }
  }
  assertNoIssues(issues, 'answer tile sequence');
});
