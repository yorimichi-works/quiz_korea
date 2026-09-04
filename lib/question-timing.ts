const BASE_CHARACTER_MS = 115;
const SPACE_MS = 40;
const CLAUSE_PAUSE_MS = 210;
const SENTENCE_PAUSE_MS = 360;

export function questionCharacterDelayMs(character: string) {
  if (/\s/u.test(character)) return SPACE_MS;
  if (/[.!?！？…]/u.test(character)) return SENTENCE_PAUSE_MS;
  if (/[,，、:：;；]/u.test(character)) return CLAUSE_PAUSE_MS;
  return BASE_CHARACTER_MS;
}

export function questionRevealDurationMs(text: string) {
  return Array.from(text).reduce((total, character) => total + questionCharacterDelayMs(character), 0);
}

export function revealedQuestionLength(text: string, elapsedMs: number) {
  if (elapsedMs <= 0) return 0;
  const characters = Array.from(text);
  let nextRevealAt = BASE_CHARACTER_MS;
  for (let index = 0; index < characters.length; index += 1) {
    if (nextRevealAt > elapsedMs) return index;
    // Reveal punctuation first, then spend its longer delay as a dramatic
    // pause before the following character.
    nextRevealAt += questionCharacterDelayMs(characters[index]);
  }
  return characters.length;
}
