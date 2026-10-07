ALTER TABLE meonjeo_matches ADD COLUMN answer_locked_a INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meonjeo_matches ADD COLUMN answer_locked_b INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meonjeo_matches ADD COLUMN answer_progress TEXT NOT NULL DEFAULT '';
ALTER TABLE meonjeo_matches ADD COLUMN timeline_paused_at INTEGER;
