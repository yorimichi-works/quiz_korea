export type TitleStats = {
  matches: number; wins: number; currentStreak: number; bestStreak: number;
  correctAnswers: number; fastBuzzWins: number; historyCorrect: number; quizTimeMatches: number;
};

export const TITLE_IDS = ['rookie_winner', 'ten_wins', 'quiz_time_regular', 'fast_hand', 'history_doctor', 'veteran', 'beta_tester', 'master_arrival'] as const;
export type TitleId = (typeof TITLE_IDS)[number];

export function unlockedTitleIds(stats: TitleStats, rankPoints: number): TitleId[] {
  return TITLE_IDS.filter(id => {
    if (id === 'rookie_winner') return stats.wins >= 1;
    if (id === 'ten_wins') return stats.wins >= 10;
    if (id === 'quiz_time_regular') return stats.quizTimeMatches >= 10;
    if (id === 'fast_hand') return stats.fastBuzzWins >= 20;
    if (id === 'history_doctor') return stats.historyCorrect >= 20;
    if (id === 'veteran') return stats.matches >= 100;
    if (id === 'beta_tester') return stats.matches >= 1;
    return rankPoints >= 45000;
  });
}

export const EMPTY_TITLE_STATS: TitleStats = {
  matches: 0, wins: 0, currentStreak: 0, bestStreak: 0,
  correctAnswers: 0, fastBuzzWins: 0, historyCorrect: 0, quizTimeMatches: 0,
};
