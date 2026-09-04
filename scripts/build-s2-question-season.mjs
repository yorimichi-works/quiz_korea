import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, '..');
const sourcePath = resolve(root, 'data/seasons/S1-2026/questions.ko.json');
const seasonDirectory = resolve(root, 'data/seasons/S2-2026');
const batchNames = ['facts.batch-a.json', 'facts.batch-b.json', 'facts.batch-c.json'];

const punctuation = /[\s·.,!?！？'"“”‘’()（）\-_:：/「」『』〈〉《》]/g;
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(punctuation, '');
const allowedQuestionStyles = new Set(['standard', 'misdirection', 'wait_for_clue', 'reasoning', 'lateral']);
const allowedMisdirectionTypes = new Set(['relation_twist', 'late_easy_clue']);
const lateClueMarker = /(?:마지막\s*(?:단서|힌트)(?:로|는|:)?|결정적\s*단서(?:는|:)?)/;
const decisionBridges = [
  '여기서 알아챘다면 과감히 눌러도 좋습니다. 아직 망설여진다면,',
  '지금 누르면 빠른 승부입니다. 확실한 한마디를 더 기다리면,',
  '눈치챘다면 지금이 선점할 순간입니다. 아니라면 조금 더 듣고,',
  '정답이 떠올랐다면 승부를 걸어 보세요. 확신이 더 필요하다면,',
  '아는 사람은 여기서 누를 수 있습니다. 모두를 위한 결정타를 기다리면,',
  '첫 단서들로 도전해도 좋습니다. 한 박자 더 기다리는 쪽을 택한다면,',
];

// These S1 groups describe the same underlying fact.  Keeping one shared
// knowledge group prevents two wordings of that fact from appearing in one
// match without deleting the reviewed source questions.
const canonicalFactGroups = new Map([
  ['world_history_geography_fact_0042', 'general_fact_0036'], // Peru / Lima
  ['world_history_geography_fact_0035', 'general_fact_0032'], // Mexico / Mexico City
  ['world_history_geography_fact_0026', 'general_fact_0019'], // China / Beijing
  ['world_history_geography_fact_0041', 'general_fact_0035'], // Argentina / Buenos Aires
  ['world_history_geography_fact_0008', 'general_fact_0039'], // Ethiopia / Addis Ababa
  ['world_history_geography_fact_0033', 'general_fact_0031'], // Canada / Ottawa
  ['world_history_geography_fact_0034', 'general_fact_0030'], // US / Washington, D.C.
  ['world_history_geography_fact_0030', 'general_fact_0028'], // New Zealand / Wellington
  ['world_history_geography_fact_0001', 'general_fact_0037'], // Egypt / Cairo
  ['world_history_geography_fact_0031', 'general_fact_0027'], // Australia / Canberra
  ['general_fact_0034', 'general_fact_0033'], // former Brazilian capital / Rio
  ['anime_manga_webtoon_fact_0017', 'entertainment_broadcast_fact_0002'], // Misaeng
  ['anime_manga_webtoon_fact_0019', 'entertainment_broadcast_fact_0020'], // Moving
]);

// These groups remain distinct authored fact groups, but share enough of the
// same underlying knowledge that they must not appear in one match or within
// the recent-match exclusion window. Apply this mapping only after the legacy
// fact-group canonicalization above.
const canonicalKnowledgeGroups = new Map([
  ['korean_history_fact_0004', 'korean_history_fact_0003'], // Jumong / Goguryeo founding
  ['korean_history_fact_0007', 'korean_history_fact_0003'], // Goguryeo / Pyongyang
  ['korean_history_fact_0038', 'korean_history_fact_0037'], // Yi Seong-gye / Joseon founding
  ['s2_fact_batch_c_general_014', 's2_fact_s2a_world_033'], // Gutenberg / 42-line Bible
  ['s2_fact_batch_c_games_013', 's2_fact_batch_c_games_012'], // Larian RPGs
  ['s2_fact_batch_c_general_007', 's2_fact_s2a_world_031'], // Rosetta Stone / hieroglyphs
  ['s2_fact_s2a_general_078', 'general_fact_0003'], // London / Thames
  ['s2_fact_s2a_world_017', 'world_history_geography_fact_0005'], // Zimbabwe / Victoria Falls
  ['s2_fact_s2a_world_015', 'world_history_geography_fact_0014'], // Jordan / Dead Sea
  ['s2_fact_s2a_world_021', 's2_fact_s2a_world_006'], // Black Sea / Bosporus
]);

function canonicalKnowledgeGroup(factGroupId) {
  return canonicalKnowledgeGroups.get(factGroupId) || factGroupId;
}

function safeAliases(canonicalAnswer, aliases) {
  const canonical = normalize(canonicalAnswer);
  return [...new Set((Array.isArray(aliases) ? aliases : [])
    .map(value => String(value).trim())
    .filter(value => value && normalize(value) === canonical && value !== canonicalAnswer))];
}

function requiredString(value, label) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`Missing ${label}`);
  return result;
}

function explanationWithAnswer(value, answer) {
  const explanation = requiredString(value, 'explanation');
  if (normalize(explanation).includes(normalize(answer))) return explanation;
  return `${explanation.replace(/[.!?]+$/u, '')}. 이 문제의 정답은 「${answer}」이다.`;
}

function stagedQuestionText(value, style, stableKey) {
  const text = requiredString(value, `${stableKey}.questionText`);
  if (style !== 'wait_for_clue' || text.length >= 120) return text;
  const match = lateClueMarker.exec(text);
  if (!match || match.index / text.length >= 0.55) return text;
  const hash = Array.from(stableKey).reduce((total, character) => total + character.codePointAt(0), 0);
  const bridge = decisionBridges[hash % decisionBridges.length];
  return `${text.slice(0, match.index)}${bridge} ${text.slice(match.index)}`;
}

function questionFromFact(fact, variant, ordinal) {
  const item = fact[variant];
  const categoryId = requiredString(fact.categoryId, `${fact.key}.categoryId`);
  const factGroupId = `s2_fact_${requiredString(fact.key, 'fact.key')}`;
  const answer = requiredString(item?.canonicalAnswer, `${fact.key}.${variant}.canonicalAnswer`);
  const isMisdirection = fact.misdirectionVariant === variant;
  const requestedStyle = String(item?.questionStyle || 'standard').trim();
  if (!allowedQuestionStyles.has(requestedStyle)) {
    throw new Error(`Invalid questionStyle in ${fact.key}.${variant}: ${requestedStyle}`);
  }
  if (isMisdirection && requestedStyle !== 'standard') {
    throw new Error(`${fact.key}.${variant} cannot combine misdirection with ${requestedStyle}`);
  }
  const misdirectionType = isMisdirection ? requiredString(fact.misdirectionType, `${fact.key}.misdirectionType`) : null;
  if (misdirectionType && !allowedMisdirectionTypes.has(misdirectionType)) {
    throw new Error(`Invalid misdirectionType in ${fact.key}: ${misdirectionType}`);
  }
  const questionStyle = isMisdirection ? 'misdirection' : requestedStyle;
  return {
    questionId: `${categoryId}_s2_${String(ordinal).padStart(4, '0')}_${variant}`,
    locale: 'ko',
    categoryId,
    categoryKo: requiredString(fact.categoryKo, `${fact.key}.categoryKo`),
    difficulty: requiredString(fact.difficulty, `${fact.key}.difficulty`),
    difficultyScore: Number(fact.difficultyScore),
    questionText: stagedQuestionText(item?.questionText, questionStyle, `${fact.key}.${variant}`),
    canonicalAnswer: answer,
    acceptedAliases: safeAliases(answer, item?.acceptedAliases),
    explanation: explanationWithAnswer(requiredString(fact.explanation, `${fact.key}.explanation`), answer),
    validityType: 'static',
    factCheckedAsOf: '2026-09-04',
    sourceUrls: [...new Set((Array.isArray(fact.sourceUrls) ? fact.sourceUrls : []).map(String).filter(Boolean))],
    factGroupId,
    knowledgeFactId: canonicalKnowledgeGroup(factGroupId),
    variantId: variant,
    questionStyle,
    misdirectionType,
    qaStatus: 'REVIEW',
    enabledInSeason: true,
  };
}

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const inherited = source.questions
  .filter(question => question.enabledInSeason && question.qaStatus !== 'REJECT')
  .map(question => {
    const factGroupId = canonicalFactGroups.get(question.factGroupId) || question.factGroupId;
    const knowledgeFactId = canonicalKnowledgeGroup(factGroupId);
    const isOxygenLateClue = question.questionId === 'general_0098';
    const explanation = explanationWithAnswer(question.explanation, question.canonicalAnswer);
    return {
      ...question,
      questionText: isOxygenLateClue
        ? '미토콘드리아 전자전달계에서 최종 전자수용체로 작용하고 산화적 인산화가 이어지게 하는 분자입니다. 어렵게 생각하지 말고, 사람이 숨을 쉴 때 반드시 들이마셔야 하는 기체는 무엇일까요?'
        : question.questionText,
      acceptedAliases: safeAliases(question.canonicalAnswer, question.acceptedAliases),
      explanation,
      sourceUrls: isOxygenLateClue
        ? ['https://www.ncbi.nlm.nih.gov/books/NBK26882/']
        : question.sourceUrls,
      factGroupId,
      knowledgeFactId,
      questionStyle: isOxygenLateClue ? 'misdirection' : 'standard',
      misdirectionType: isOxygenLateClue ? 'late_easy_clue' : null,
    };
  });

const facts = [];
for (const name of batchNames) {
  const path = resolve(seasonDirectory, name);
  const batch = JSON.parse(await readFile(path, 'utf8'));
  const entries = Array.isArray(batch) ? batch : batch?.facts;
  if (!Array.isArray(entries)) throw new Error(`${name} must contain a JSON array or a facts array`);
  facts.push(...entries);
}

if (inherited.length !== 918) throw new Error(`Expected 918 inherited live questions, got ${inherited.length}`);
if (facts.length !== 541) throw new Error(`Expected 541 new facts, got ${facts.length}`);
if (new Set(facts.map(fact => fact.key)).size !== facts.length) throw new Error('New fact keys must be unique');

for (const fact of facts) {
  if (!fact.misdirectionVariant) {
    if (fact.misdirectionType) throw new Error(`${fact.key} has misdirectionType without misdirectionVariant`);
    continue;
  }
  if (!['q1', 'q2'].includes(fact.misdirectionVariant)) {
    throw new Error(`${fact.key}.misdirectionVariant must be q1 or q2`);
  }
  if (!allowedMisdirectionTypes.has(fact.misdirectionType)) {
    throw new Error(`${fact.key}.misdirectionType must be relation_twist or late_easy_clue`);
  }
}

const additions = facts.flatMap((fact, index) => [
  questionFromFact(fact, 'q1', index + 1),
  questionFromFact(fact, 'q2', index + 1),
]);
const questions = [...inherited, ...additions];
const ids = new Set();
const texts = new Map();
const contentIssues = [];
for (const question of questions) {
  if (ids.has(question.questionId)) contentIssues.push(`Duplicate questionId: ${question.questionId}`);
  ids.add(question.questionId);
  const textKey = normalize(question.questionText);
  if (texts.has(textKey)) contentIssues.push(`Duplicate wording: ${texts.get(textKey)} / ${question.questionId}`);
  texts.set(textKey, question.questionId);
  if (normalize(question.questionText).includes(normalize(question.canonicalAnswer)) && normalize(question.canonicalAnswer).length >= 3) {
    contentIssues.push(`Canonical answer leaked in ${question.questionId}`);
  }
  if (question.questionId.includes('_s2_') && question.sourceUrls.length === 0) contentIssues.push(`Missing source URL: ${question.questionId}`);
}
if (contentIssues.length > 0) {
  throw new Error(`Question content validation failed (${contentIssues.length}):\n${contentIssues.slice(0, 100).join('\n')}`);
}
const misdirectionCount = questions.filter(question => question.questionStyle === 'misdirection').length;
const questionStyleCounts = Object.fromEntries([...allowedQuestionStyles]
  .map(style => [style, questions.filter(question => question.questionStyle === style).length]));
const misdirectionTypeCounts = Object.fromEntries([...new Set(questions.map(question => question.misdirectionType).filter(Boolean))]
  .map(type => [type, questions.filter(question => question.misdirectionType === type).length]));
if (questions.length !== 2000) throw new Error(`Expected exactly 2000 questions, got ${questions.length}`);
if (misdirectionCount !== 50) throw new Error(`Expected exactly 50 misdirection questions, got ${misdirectionCount}`);
if (misdirectionTypeCounts.late_easy_clue !== 25 || misdirectionTypeCounts.relation_twist !== 25) {
  throw new Error(`Expected a 25/25 misdirection mix, got ${JSON.stringify(misdirectionTypeCounts)}`);
}
const expectedQuestionStyleCounts = {
  standard: 1700,
  misdirection: 50,
  wait_for_clue: 100,
  reasoning: 100,
  lateral: 50,
};
for (const [style, expected] of Object.entries(expectedQuestionStyleCounts)) {
  if (questionStyleCounts[style] !== expected) {
    throw new Error(`Expected ${expected} ${style} questions, got ${questionStyleCounts[style]}`);
  }
}

// Variant IDs only need to be unique inside a fact group.  Some inherited S1
// groups were merged above, so renumber them deterministically.
const variantsByGroup = new Map();
for (const question of questions) {
  const count = (variantsByGroup.get(question.factGroupId) || 0) + 1;
  variantsByGroup.set(question.factGroupId, count);
  question.variantId = `q${count}`;
}

const season = {
  schemaVersion: 2,
  reviewedAt: '2026-09-04',
  total: questions.length,
  seasonId: 'S2-2026',
  eligibleCount: questions.length,
  misdirectionCount,
  questionStyleCounts,
  misdirectionTypeCounts,
  questions,
};
const serialized = `${JSON.stringify(season, null, 2)}\n`;
await mkdir(seasonDirectory, { recursive: true });
await writeFile(resolve(seasonDirectory, 'questions.ko.json'), serialized, 'utf8');
console.log(JSON.stringify({ inherited: inherited.length, added: additions.length, total: questions.length, questionStyleCounts, misdirectionTypeCounts }, null, 2));
