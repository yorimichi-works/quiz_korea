export function ratingDelta(playerRating: number, opponentRating: number, score: 0 | 0.5 | 1, kFactor = 32) {
  const expected = 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
  const raw = Math.round(kFactor * (score - expected));
  if (score === 0.5) return raw;
  const direction = score === 1 ? 1 : -1;
  return direction * Math.max(4, Math.abs(raw));
}

export function rankPointGain(won: boolean, tied: boolean) {
  return won && !tied ? 100 : 0;
}
