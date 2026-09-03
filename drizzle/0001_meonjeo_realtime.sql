CREATE TABLE IF NOT EXISTS meonjeo_match_queue (
  user_id TEXT PRIMARY KEY,
  joined_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meonjeo_match_queue_joined_at
ON meonjeo_match_queue(joined_at);

CREATE TABLE IF NOT EXISTS meonjeo_matches (
  id TEXT PRIMARY KEY,
  player_a TEXT NOT NULL,
  player_b TEXT NOT NULL,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  question_ids_json TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  question_token TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  buzz_open_at INTEGER NOT NULL,
  buzz_deadline_at INTEGER NOT NULL,
  buzz_winner_uid TEXT,
  buzz_id TEXT,
  answer_deadline_at INTEGER,
  score_a INTEGER NOT NULL DEFAULT 0,
  score_b INTEGER NOT NULL DEFAULT 0,
  lives_a INTEGER NOT NULL DEFAULT 5,
  lives_b INTEGER NOT NULL DEFAULT 5,
  result_json TEXT,
  next_question_at INTEGER,
  decision_version INTEGER NOT NULL DEFAULT 1,
  last_seen_a INTEGER NOT NULL DEFAULT 0,
  last_seen_b INTEGER NOT NULL DEFAULT 0,
  rating_applied INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meonjeo_matches_player_a_status
ON meonjeo_matches(player_a, status);

CREATE INDEX IF NOT EXISTS idx_meonjeo_matches_player_b_status
ON meonjeo_matches(player_b, status);

CREATE TABLE IF NOT EXISTS meonjeo_match_events (
  event_id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meonjeo_match_events_match
ON meonjeo_match_events(match_id, created_at);

CREATE TABLE IF NOT EXISTS meonjeo_realtime_sessions (
  session_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
