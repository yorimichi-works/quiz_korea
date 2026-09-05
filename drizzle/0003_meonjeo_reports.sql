CREATE TABLE IF NOT EXISTS meonjeo_reports (
  report_id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  category TEXT NOT NULL,
  target_id TEXT,
  target_label TEXT,
  match_id TEXT,
  detail TEXT NOT NULL,
  locale TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meonjeo_reports_reporter_created
ON meonjeo_reports(reporter_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_meonjeo_reports_status_created
ON meonjeo_reports(status, created_at);

PRAGMA optimize;
