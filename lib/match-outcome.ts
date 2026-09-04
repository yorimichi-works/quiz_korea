export type MatchOutcomeSide = 'a' | 'b' | 'draw';

export type MatchOutcomeInput = {
  score_a: number;
  score_b: number;
  lives_a: number;
  lives_b: number;
};

/**
 * Resolves a finished match symmetrically. Running out of lives is decisive;
 * otherwise score is compared first and remaining lives break a score tie.
 */
export function matchOutcome(match: MatchOutcomeInput): MatchOutcomeSide {
  if (match.lives_a <= 0 && match.lives_b > 0) return 'b';
  if (match.lives_b <= 0 && match.lives_a > 0) return 'a';
  if (match.score_a !== match.score_b) return match.score_a > match.score_b ? 'a' : 'b';
  if (match.lives_a !== match.lives_b) return match.lives_a > match.lives_b ? 'a' : 'b';
  return 'draw';
}
