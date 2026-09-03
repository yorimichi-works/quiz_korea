CREATE TABLE IF NOT EXISTS meonjeo_player_progress (
  user_id TEXT PRIMARY KEY,
  rating INTEGER NOT NULL,
  rank_points INTEGER NOT NULL,
  profile_updated_at INTEGER NOT NULL,
  match_history_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
