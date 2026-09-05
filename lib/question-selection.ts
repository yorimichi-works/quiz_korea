export type MatchQuestion = {
  questionId: string;
  knowledgeFactId?: string;
  factGroupId?: string;
  questionStyle?: string;
  categoryId?: string;
  canonicalAnswer?: string;
  difficulty?: string;
};

const COMPARISON_PUNCTUATION = /[\s·.,!?！？'"“”‘’()（）\-_:：/「」『』〈〉《》]/g;

function shuffle<T>(values: readonly T[], random: () => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.min(index, Math.floor(random() * (index + 1)));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function groupKey(question: MatchQuestion) {
  return question.knowledgeFactId || question.factGroupId || question.questionId;
}

function answerKey(question: MatchQuestion) {
  const normalized = String(question.canonicalAnswer || '')
    .normalize('NFKC')
    .toLocaleUpperCase('ko-KR')
    .replace(COMPARISON_PUNCTUATION, '');
  return normalized || `question:${question.questionId}`;
}

function categoryKey(question: MatchQuestion) {
  return question.categoryId || `question:${question.questionId}`;
}

function difficultyKey(question: MatchQuestion) {
  return ['easy', 'standard', 'hard'].includes(question.difficulty || '') ? question.difficulty! : 'standard';
}

function difficultyTargets(roundLimit: number) {
  const hard = Math.floor(roundLimit * 0.15);
  const easy = Math.round(roundLimit * 0.35);
  return { easy, standard: roundLimit - easy - hard, hard };
}

function styleOf(question: MatchQuestion) {
  return question.questionStyle || 'standard';
}

function isSpecial(question: MatchQuestion) {
  return styleOf(question) !== 'standard';
}

export function excludeRecentlySeenQuestionGroups<T extends MatchQuestion>(
  questions: readonly T[],
  recentQuestionIds: Iterable<string>,
) {
  const recentIds = new Set(recentQuestionIds);
  if (recentIds.size === 0) return [...questions];
  const recentQuestions = questions.filter(question => recentIds.has(question.questionId));
  const recentGroups = new Set(recentQuestions.map(groupKey));
  const recentAnswers = new Set(recentQuestions.map(answerKey));
  return questions.filter(question => (
    !recentGroups.has(groupKey(question))
    && !recentAnswers.has(answerKey(question))
  ));
}

function chooseSpecialSlots(length: number, count: number, random: () => number) {
  if (count === 0) return new Set<number>();
  if (count > Math.ceil(length / 2)) {
    throw new Error(`Cannot pace ${count} special rounds without adjacency`);
  }

  // First-to-five matches that award a point every round last at most nine
  // rounds. Put all three authored beats inside that real competitive arc;
  // stalled rounds may continue toward the 20-round safety limit.
  if (count === 3 && length >= 10) {
    const windows: Array<[number, number]> = [
      [Math.min(2, length - 1), Math.min(3, length - 1)],
      [Math.min(5, length - 1), Math.min(6, length - 1)],
      [Math.min(8, length - 1), Math.min(8, length - 1)],
    ];
    return new Set(windows.map(([start, end]) => {
      const width = Math.max(1, end - start + 1);
      return start + Math.floor(random() * width);
    }));
  }

  const slots: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const ideal = Math.round((index + 1) * (length - 1) / (count + 1));
    const minimum = index === 0 ? 0 : slots[index - 1] + 2;
    const remaining = count - index - 1;
    const maximum = length - 1 - remaining * 2;
    slots.push(Math.max(minimum, Math.min(maximum, ideal)));
  }
  return new Set(slots);
}

function arrangementPenalty<T extends MatchQuestion>(
  question: T,
  arranged: readonly T[],
  position: number,
) {
  const previous = arranged.at(-1);
  const previousPrevious = arranged.at(-2);
  let penalty = 0;

  if (previous && categoryKey(previous) === categoryKey(question)) penalty += 10_000;
  if (question.difficulty === 'hard' && previous?.difficulty === 'hard' && previousPrevious?.difficulty === 'hard') {
    penalty += 8_000;
  }
  // A warm first question lets both players settle into the controls before
  // the knowledge ceiling rises.
  if (position === 0 && question.difficulty === 'hard') penalty += 2_000;
  if (position < 3 && question.difficulty === 'hard') penalty += 200;

  return penalty;
}

function arrangementIssueScore<T extends MatchQuestion>(arranged: readonly T[]) {
  let issues = arranged[0]?.difficulty === 'hard' ? 1 : 0;
  let hardRun = 0;
  for (let index = 0; index < arranged.length; index += 1) {
    if (index > 0 && categoryKey(arranged[index - 1]) === categoryKey(arranged[index])) issues += 10;
    hardRun = arranged[index].difficulty === 'hard' ? hardRun + 1 : 0;
    if (hardRun >= 3) issues += 5;
  }
  return issues;
}

function arrangeOnce<T extends MatchQuestion>(selected: readonly T[], random: () => number) {
  const specials = shuffle(selected.filter(isSpecial), random);
  const standards = shuffle(selected.filter(question => !isSpecial(question)), random);
  const specialSlots = chooseSpecialSlots(selected.length, specials.length, random);
  const firstSpecialSlot = Math.min(...specialSlots);
  const arranged: T[] = [];

  for (let position = 0; position < selected.length; position += 1) {
    const specialRound = specialSlots.has(position);
    const pool = specialRound ? specials : standards;
    if (pool.length === 0) throw new Error('Unable to fill the paced match deck');

    let candidateIndexes = pool.map((_, index) => index);
    // A match can end 5-0 after round five. Put the authored wait decision in
    // the opening special slot so even a sweep includes one risk/reward pause.
    if (specialRound && position === firstSpecialSlot) {
      const waitIndexes = candidateIndexes.filter(index => styleOf(pool[index]) === 'wait_for_clue');
      if (waitIndexes.length > 0) candidateIndexes = waitIndexes;
    }

    let bestIndex = candidateIndexes[0];
    let bestPenalty = Number.POSITIVE_INFINITY;
    for (const index of candidateIndexes) {
      const penalty = arrangementPenalty(pool[index], arranged, position);
      if (penalty < bestPenalty) {
        bestPenalty = penalty;
        bestIndex = index;
      }
    }
    arranged.push(pool.splice(bestIndex, 1)[0]);
  }

  return arranged;
}

function arrangeForPlay<T extends MatchQuestion>(selected: readonly T[], random: () => number) {
  let best: T[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const arranged = arrangeOnce(selected, random);
    const score = arrangementIssueScore(arranged);
    if (score === 0) return arranged;
    if (score < bestScore) {
      best = arranged;
      bestScore = score;
    }
  }
  if (!best) throw new Error('Unable to arrange the match deck');
  return best;
}

/**
 * Builds a match deck with the S2 gameplay mix: 85% standard, 5%
 * wait-for-clue, 5% reasoning, and one 5% slot shared by lateral and
 * misdirection questions. It also keeps facts, answers, and categories from
 * repeating in ways that make a match feel predictable.
 */
export function selectMatchQuestionIds<T extends MatchQuestion>(
  questions: readonly T[],
  roundLimit = 20,
  random: () => number = Math.random,
) {
  const records = questions.map(question => ({
    question,
    group: groupKey(question),
    answer: answerKey(question),
    category: categoryKey(question),
    difficulty: difficultyKey(question),
    style: styleOf(question),
  }));
  const selected: T[] = [];
  const seenGroups = new Set<string>();
  const seenAnswers = new Set<string>();
  const categoryCounts = new Map<string, number>();
  const targetDifficulties = difficultyTargets(roundLimit);
  const difficultyCounts = new Map<string, number>();

  const take = (styles: string[], requestedCount: number) => {
    let remaining = requestedCount;
    while (selected.length < roundLimit && remaining > 0) {
      let candidates: typeof records = [];
      for (const record of records) {
        if (!styles.includes(record.style) || seenGroups.has(record.group) || seenAnswers.has(record.answer)) continue;
        candidates.push(record);
      }
      if (candidates.length === 0) break;

      const withinDifficultyTarget = candidates.filter(record => (
        (difficultyCounts.get(record.difficulty) || 0)
        < targetDifficulties[record.difficulty as keyof typeof targetDifficulties]
      ));
      if (withinDifficultyTarget.length > 0) candidates = withinDifficultyTarget;

      const leastUsed = Math.min(...candidates.map(record => categoryCounts.get(record.category) || 0));
      candidates = candidates.filter(record => (categoryCounts.get(record.category) || 0) === leastUsed);

      // Draw from the least-used available category. With the real pool this
      // produces broad variety without making every match use a fixed order.
      const candidateIndex = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
      const picked = candidates[candidateIndex];
      const question = picked.question;
      selected.push(question);
      seenGroups.add(picked.group);
      seenAnswers.add(picked.answer);
      categoryCounts.set(picked.category, (categoryCounts.get(picked.category) || 0) + 1);
      difficultyCounts.set(picked.difficulty, (difficultyCounts.get(picked.difficulty) || 0) + 1);
      remaining -= 1;
    }
  };

  // Rarer authored experiences go first so a standard sibling cannot occupy
  // their fact or answer slot.
  take(['wait_for_clue'], Math.floor(roundLimit * 0.05));
  take(['reasoning'], Math.floor(roundLimit * 0.05));
  const varietySlots = Math.floor(roundLimit * 0.05);
  for (let index = 0; index < varietySlots; index += 1) {
    const preferred = random() < 0.5 ? 'lateral' : 'misdirection';
    const before = selected.length;
    take([preferred], 1);
    if (selected.length === before) take([preferred === 'lateral' ? 'misdirection' : 'lateral'], 1);
  }
  take(['standard'], roundLimit - selected.length);
  if (selected.length < roundLimit) take(
    ['standard', 'wait_for_clue', 'reasoning', 'lateral', 'misdirection'],
    roundLimit - selected.length,
  );

  if (selected.length < roundLimit) {
    throw new Error(`Not enough distinct fact groups and answers for ${roundLimit} rounds`);
  }

  return arrangeForPlay(selected, random).map(question => question.questionId);
}
