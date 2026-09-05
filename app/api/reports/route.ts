import { env } from 'cloudflare:workers';
import { requireFirebaseUser } from '@/lib/firebase-user';

const KINDS = new Set(['feedback', 'question', 'player']);
const CATEGORIES = new Set(['incorrect', 'inappropriate', 'bug', 'request']);
const REPORT_LIMIT_PER_HOUR = 10;

const createReportsSql = `CREATE TABLE IF NOT EXISTS meonjeo_reports (
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
)`;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function cleanOptional(value: unknown, limit: number) {
  const text = String(value || '').trim().slice(0, limit);
  return text || null;
}

export async function POST(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const reportId = String(body.reportId || '').trim().slice(0, 100);
    const kind = String(body.kind || 'feedback');
    const category = String(body.category || 'request');
    const detail = String(body.detail || '').trim().slice(0, 500);
    const locale = body.locale === 'ja' ? 'ja' : 'ko';
    if (!reportId || !KINDS.has(kind) || !CATEGORIES.has(category) || detail.length < 2) {
      return json({ error: 'invalid-report' }, 400);
    }

    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) throw new Error('Report database is unavailable');
    await db.prepare(createReportsSql).run();
    const now = Date.now();
    const recent = await db.prepare(`SELECT COUNT(*) AS count FROM meonjeo_reports WHERE reporter_user_id = ?1 AND created_at >= ?2`)
      .bind(user.userId, now - 60 * 60 * 1000).first<{ count: number }>();
    if (Number(recent?.count || 0) >= REPORT_LIMIT_PER_HOUR) return json({ error: 'rate-limited' }, 429);

    await db.prepare(`INSERT OR IGNORE INTO meonjeo_reports
      (report_id, reporter_user_id, kind, category, target_id, target_label, match_id, detail, locale, status, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'open', ?10, ?10)`)
      .bind(
        reportId,
        user.userId,
        kind,
        category,
        cleanOptional(body.targetId, 120),
        cleanOptional(body.targetLabel, 160),
        cleanOptional(body.matchId, 120),
        detail,
        locale,
        now,
      ).run();
    return json({ accepted: true, reportId }, 201);
  } catch (error) {
    console.error('report submission failed', error);
    return json({ error: 'unavailable' }, 503);
  }
}
