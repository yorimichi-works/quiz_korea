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

async function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('Progress database is unavailable');
  await db.prepare(createProgressTableSql).run();
  return db;
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
    db.prepare(`DELETE FROM meonjeo_player_progress WHERE user_id = ?1`).bind(sourceUserId),
  ]);
  return merged;
}
