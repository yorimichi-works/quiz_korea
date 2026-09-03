import { env } from 'cloudflare:workers';

export type MatchHistoryItem = {
  matchId: string;
  opponentName: string;
  opponentIcon: string;
  opponentRating: number;
  playedAt: string;
  result: 'win' | 'loss' | 'draw';
};

export type PlayerProgress = {
  rating: number;
  rankPoints: number;
  profileUpdatedAt: number;
  matchHistory: MatchHistoryItem[];
};

const createProgressTableSql = `CREATE TABLE IF NOT EXISTS meonjeo_player_progress (
  user_id TEXT PRIMARY KEY,
  rating INTEGER NOT NULL,
  rank_points INTEGER NOT NULL,
  profile_updated_at INTEGER NOT NULL,
  match_history_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

const createTitlesTableSql = `CREATE TABLE IF NOT EXISTS meonjeo_player_titles (
  user_id TEXT PRIMARY KEY,
  selected_title_id TEXT,
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  fast_buzz_wins INTEGER NOT NULL DEFAULT 0,
  history_correct INTEGER NOT NULL DEFAULT 0,
  quiz_time_matches INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

async function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('Progress database is unavailable');
  await db.batch([db.prepare(createProgressTableSql), db.prepare(createTitlesTableSql)]);
  return db;
}

export async function readLeaderboard(userId: string) {
  const db = await database();
  const result = await db.prepare(
    `SELECT p.user_id, p.rating, p.rank_points, t.selected_title_id
       FROM meonjeo_player_progress p
       LEFT JOIN meonjeo_player_titles t ON t.user_id = p.user_id
      ORDER BY p.rating DESC, p.rank_points DESC, p.updated_at ASC
      LIMIT 100`,
  ).all<{ user_id: string; rating: number; rank_points: number; selected_title_id: string | null }>();
  return (result.results || []).map((row, index) => ({
    position: index + 1,
    rating: row.rating,
    rankPoints: row.rank_points,
    titleId: row.selected_title_id,
    isMe: row.user_id === userId,
  }));
}

export async function readPlayerProgress(userId: string): Promise<PlayerProgress | null> {
  const db = await database();
  const row = await db.prepare(
    `SELECT rating, rank_points, profile_updated_at, match_history_json
     FROM meonjeo_player_progress WHERE user_id = ?1`,
  ).bind(userId).first<{
    rating: number;
    rank_points: number;
    profile_updated_at: number;
    match_history_json: string;
  }>();
  if (!row) return null;
  let matchHistory: MatchHistoryItem[] = [];
  try {
    const parsed = JSON.parse(row.match_history_json);
    if (Array.isArray(parsed)) matchHistory = parsed;
  } catch {
    matchHistory = [];
  }
  return {
    rating: row.rating,
    rankPoints: row.rank_points,
    profileUpdatedAt: row.profile_updated_at,
    matchHistory,
  };
}

export async function writePlayerProgress(userId: string, progress: PlayerProgress) {
  const db = await database();
  await db.prepare(
    `INSERT INTO meonjeo_player_progress
       (user_id, rating, rank_points, profile_updated_at, match_history_json, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
       rating = excluded.rating,
       rank_points = excluded.rank_points,
       profile_updated_at = excluded.profile_updated_at,
       match_history_json = excluded.match_history_json,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    userId,
    progress.rating,
    progress.rankPoints,
    progress.profileUpdatedAt,
    JSON.stringify(progress.matchHistory),
  ).run();
}

export async function mergePlayerProgress(sourceUserId: string, targetUserId: string) {
  if (sourceUserId === targetUserId) return readPlayerProgress(targetUserId);
  const [source, target] = await Promise.all([readPlayerProgress(sourceUserId), readPlayerProgress(targetUserId)]);
  if (!source) return target;
  const newer = !target || source.profileUpdatedAt > target.profileUpdatedAt ? source : target;
  const historyById = new Map<string, MatchHistoryItem>();
  for (const item of [...(target?.matchHistory || []), ...source.matchHistory]) historyById.set(item.matchId, item);
  const merged: PlayerProgress = {
    rating: newer.rating,
    rankPoints: Math.max(source.rankPoints, target?.rankPoints || 0),
    profileUpdatedAt: Math.max(source.profileUpdatedAt, target?.profileUpdatedAt || 0),
    matchHistory: [...historyById.values()].sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt)).slice(0, 30),
  };
  const db = await database();
  const [sourceTitles, targetTitles] = await Promise.all([
    db.prepare(`SELECT selected_title_id, matches, wins, current_streak, best_streak, correct_answers, fast_buzz_wins, history_correct, quiz_time_matches FROM meonjeo_player_titles WHERE user_id = ?1`).bind(sourceUserId).first<Record<string, string | number | null>>(),
    db.prepare(`SELECT selected_title_id, matches, wins, current_streak, best_streak, correct_answers, fast_buzz_wins, history_correct, quiz_time_matches FROM meonjeo_player_titles WHERE user_id = ?1`).bind(targetUserId).first<Record<string, string | number | null>>(),
  ]);
  const number = (row: Record<string, string | number | null> | null, key: string) => Number(row?.[key]) || 0;
  await db.batch([
    db.prepare(
      `INSERT INTO meonjeo_player_progress
         (user_id, rating, rank_points, profile_updated_at, match_history_json, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id) DO UPDATE SET
         rating = excluded.rating,
         rank_points = excluded.rank_points,
         profile_updated_at = excluded.profile_updated_at,
         match_history_json = excluded.match_history_json,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(targetUserId, merged.rating, merged.rankPoints, merged.profileUpdatedAt, JSON.stringify(merged.matchHistory)),
    db.prepare(`INSERT INTO meonjeo_player_titles (user_id, selected_title_id, matches, wins, current_streak, best_streak, correct_answers, fast_buzz_wins, history_correct, quiz_time_matches, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET selected_title_id = excluded.selected_title_id, matches = excluded.matches, wins = excluded.wins, current_streak = excluded.current_streak, best_streak = excluded.best_streak, correct_answers = excluded.correct_answers, fast_buzz_wins = excluded.fast_buzz_wins, history_correct = excluded.history_correct, quiz_time_matches = excluded.quiz_time_matches, updated_at = CURRENT_TIMESTAMP`)
      .bind(targetUserId, targetTitles?.selected_title_id || sourceTitles?.selected_title_id || null, number(sourceTitles,'matches') + number(targetTitles,'matches'), number(sourceTitles,'wins') + number(targetTitles,'wins'), Math.max(number(sourceTitles,'current_streak'), number(targetTitles,'current_streak')), Math.max(number(sourceTitles,'best_streak'), number(targetTitles,'best_streak')), number(sourceTitles,'correct_answers') + number(targetTitles,'correct_answers'), number(sourceTitles,'fast_buzz_wins') + number(targetTitles,'fast_buzz_wins'), number(sourceTitles,'history_correct') + number(targetTitles,'history_correct'), number(sourceTitles,'quiz_time_matches') + number(targetTitles,'quiz_time_matches')),
    db.prepare(`DELETE FROM meonjeo_player_progress WHERE user_id = ?1`).bind(sourceUserId),
    db.prepare(`DELETE FROM meonjeo_player_titles WHERE user_id = ?1`).bind(sourceUserId),
  ]);
  return merged;
}
