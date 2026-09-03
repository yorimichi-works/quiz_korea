CREATE TABLE IF NOT EXISTS meonjeo_player_titles (
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
);

ALTER TABLE meonjeo_match_queue ADD COLUMN source TEXT NOT NULL DEFAULT 'rated';

ALTER TABLE meonjeo_matches ADD COLUMN rating_a INTEGER NOT NULL DEFAULT 1248;
ALTER TABLE meonjeo_matches ADD COLUMN rating_b INTEGER NOT NULL DEFAULT 1248;
ALTER TABLE meonjeo_matches ADD COLUMN title_a TEXT;
ALTER TABLE meonjeo_matches ADD COLUMN title_b TEXT;
ALTER TABLE meonjeo_matches ADD COLUMN source_a TEXT NOT NULL DEFAULT 'rated';
ALTER TABLE meonjeo_matches ADD COLUMN source_b TEXT NOT NULL DEFAULT 'rated';
ALTER TABLE meonjeo_matches ADD COLUMN queue_joined_a INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meonjeo_matches ADD COLUMN queue_joined_b INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meonjeo_matches ADD COLUMN rating_delta_a INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meonjeo_matches ADD COLUMN rating_delta_b INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meonjeo_matches ADD COLUMN rank_gain_a INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meonjeo_matches ADD COLUMN rank_gain_b INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS meonjeo_quiz_time_config (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  event_id TEXT NOT NULL DEFAULT 'daily_quiz_time',
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  start_local_time TEXT NOT NULL DEFAULT '21:00',
  end_local_time TEXT NOT NULL DEFAULT '22:00',
  starting_soon_minutes INTEGER NOT NULL DEFAULT 30,
  show_all_day INTEGER NOT NULL DEFAULT 1,
  copy_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO meonjeo_quiz_time_config (id) VALUES ('default');

CREATE TABLE IF NOT EXISTS meonjeo_quiz_time_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  date_key TEXT NOT NULL,
  phase TEXT NOT NULL,
  source TEXT NOT NULL,
  wait_ms INTEGER,
  rating_band TEXT,
  match_result TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meonjeo_quiz_time_events_date_type
ON meonjeo_quiz_time_events(date_key, event_type);

CREATE INDEX IF NOT EXISTS idx_meonjeo_quiz_time_events_user_date
ON meonjeo_quiz_time_events(user_id, date_key);

PRAGMA optimize;
