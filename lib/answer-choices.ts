const STRIPPED_CHARACTERS = /[\s·.,!?！？'"“”‘’()（）\-_:：/「」『』〈〉《》]/g;

const HANGUL_POOL = Array.from('가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허고노도로모보소오조초코토포호국대한민국서울빛물불산강해별달꿈길문답역사과학문화예술스포츠');
const LATIN_POOL = Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
const NUMBER_POOL = Array.from('0123456789');
const CJK_POOL = Array.from('天地人物大小東西南北山川海日月火水木金土本中韓国王城市文字学');
const ALL_CHARACTER_POOL = [...new Set([...HANGUL_POOL, ...LATIN_POOL, ...NUMBER_POOL, ...CJK_POOL])];
const MAX_CORRECT_TILES = 8;

export function answerChoiceRandom(seed: string) {
  let state = 2166136261;
  for (const character of seed) {
    state ^= character.codePointAt(0) || 0;
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

export function normalizedAnswerCharacters(value: string) {
  return Array.from(String(value || '').normalize('NFKC').toUpperCase().replace(STRIPPED_CHARACTERS, ''));
}

/** Keeps short answers snappy while giving long titles and names enough time
 * for deliberate character-tile input. */
export function answerTimeLimitMs(value: string) {
  const characterCount = normalizedAnswerCharacters(value).length;
  if (characterCount === 0) throw new Error('Canonical answer has no selectable characters');
  return Math.min(18_000, Math.max(7_000, 3_000 + characterCount * 500));
}

export function normalizedAnswerTiles(value: string) {
  const characters = normalizedAnswerCharacters(value);
  if (characters.length === 0) throw new Error('Canonical answer has no selectable characters');
  const tileWidth = Math.max(1, Math.ceil(characters.length / MAX_CORRECT_TILES));
  const tiles: string[] = [];
  for (let index = 0; index < characters.length; index += tileWidth) {
    tiles.push(characters.slice(index, index + tileWidth).join(''));
  }
  return tiles;
}

function shuffle<T>(items: T[], random: () => number) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [items[index], items[target]] = [items[target], items[index]];
  }
  return items;
}

function poolsFor(answer: string[]) {
  const pools: string[][] = [];
  if (answer.some(char => /[0-9]/.test(char))) pools.push(NUMBER_POOL);
  if (answer.some(char => /[A-Z]/.test(char))) pools.push(LATIN_POOL);
  if (answer.some(char => /[\uAC00-\uD7A3\u1100-\u11FF]/u.test(char))) pools.push(HANGUL_POOL);
  if (answer.some(char => /[\u3400-\u9FFF\u3040-\u30FF]/u.test(char))) pools.push(CJK_POOL);
  return pools.length ? pools : [HANGUL_POOL];
}

/**
 * Builds the character bag shown during an online answer. The canonical
 * answer's multiset is included exactly once; distractors are unique and may
 * never duplicate a character that is part of the answer.
 */
export function createAnswerCharacterChoices(value: string, random: () => number = Math.random) {
  const correct = normalizedAnswerCharacters(value);
  if (correct.length === 0) throw new Error('Canonical answer has no selectable characters');
  const correctSet = new Set(correct);
  const preferred = [...new Set(poolsFor(correct).flat())].filter(char => !correctSet.has(char));
  const extraCount = correct.length === 1 ? 5 : Math.min(5, Math.max(2, correct.length));
  const extras = shuffle(preferred, random).slice(0, extraCount);
  if (extras.length < extraCount) {
    const preferredSet = new Set(preferred);
    const fallback = ALL_CHARACTER_POOL.filter(char => !correctSet.has(char) && !preferredSet.has(char));
    extras.push(...shuffle(fallback, random).slice(0, extraCount - extras.length));
  }
  if (extras.length < 2) throw new Error('Not enough non-conflicting answer distractors');
  return shuffle([...correct, ...extras], random);
}

/**
 * Long names and titles become at most eight ordered chunks. The buzzer tests
 * recall; the follow-up input should confirm it without turning a correct buzz
 * into twenty-plus mechanical taps.
 */
export function createAnswerTileChoices(value: string, random: () => number = Math.random) {
  const correctTiles = normalizedAnswerTiles(value);
  if (correctTiles.every(tile => Array.from(tile).length === 1)) {
    return createAnswerCharacterChoices(value, random);
  }

  const answerCharacters = normalizedAnswerCharacters(value);
  const answerCharacterSet = new Set(answerCharacters);
  const correctSet = new Set(correctTiles);
  const replacementPool = shuffle(
    [...new Set([...poolsFor(answerCharacters).flat(), ...ALL_CHARACTER_POOL])]
      .filter(character => !answerCharacterSet.has(character)),
    random,
  );
  const extraCount = Math.min(5, Math.max(3, correctTiles.length));
  const extras: string[] = [];

  for (let attempt = 0; extras.length < extraCount && attempt < replacementPool.length * 4; attempt += 1) {
    const base = Array.from(correctTiles[attempt % correctTiles.length]);
    const replacementIndex = attempt % base.length;
    base[replacementIndex] = replacementPool[attempt % replacementPool.length];
    const candidate = base.join('');
    if (!correctSet.has(candidate) && !extras.includes(candidate)) extras.push(candidate);
  }
  if (extras.length < extraCount) throw new Error('Not enough non-conflicting answer tile distractors');
  return shuffle([...correctTiles, ...extras], random);
}
