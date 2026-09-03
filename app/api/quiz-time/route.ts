import { env } from 'cloudflare:workers';
import { DEFAULT_QUIZ_TIME_CONFIG, getQuizTimeState, type QuizTimeConfig } from '@/lib/quiz-time';

const FIREBASE_API_KEY = 'AIzaSyAFNxcPTqD8LK6IWXlygncDoaUFRAdb6sQ';
const FIREBASE_PROJECT_ID = 'tier-online';
const ALLOWED_EVENTS = new Set(['quiz_time_banner_impression', 'quiz_time_banner_click']);

function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }

async function userId(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token || token.length > 4096) return null;
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) });
  if (!lookup.ok) return null;
  const payload = await lookup.json() as { users?: Array<{ localId?: string }> }; const uid = payload.users?.[0]?.localId;
  if (!uid) return null;
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as { aud?: string };
    return claims.aud === FIREBASE_PROJECT_ID ? uid : null;
  } catch { return null; }
}

async function database() {
  const db = (env as unknown as { DB?: D1Database }).DB; if (!db) throw new Error('Quiz time database is unavailable');
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_quiz_time_config (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, event_id TEXT NOT NULL DEFAULT 'daily_quiz_time', timezone TEXT NOT NULL DEFAULT 'Asia/Seoul', start_local_time TEXT NOT NULL DEFAULT '21:00', end_local_time TEXT NOT NULL DEFAULT '22:00', starting_soon_minutes INTEGER NOT NULL DEFAULT 30, show_all_day INTEGER NOT NULL DEFAULT 1, copy_version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_quiz_time_events (event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_type TEXT NOT NULL, date_key TEXT NOT NULL, phase TEXT NOT NULL, source TEXT NOT NULL, wait_ms INTEGER, rating_band TEXT, match_result TEXT, created_at INTEGER NOT NULL)`),
  ]);
  await db.prepare(`INSERT OR IGNORE INTO meonjeo_quiz_time_config (id) VALUES ('default')`).run();
  return db;
}

async function readConfig(db: D1Database): Promise<QuizTimeConfig> {
  const row = await db.prepare(`SELECT enabled, event_id, timezone, start_local_time, end_local_time, starting_soon_minutes, show_all_day, copy_version FROM meonjeo_quiz_time_config WHERE id = 'default'`).first<Record<string, string | number>>();
  if (!row) return DEFAULT_QUIZ_TIME_CONFIG;
  return { enabled: Boolean(row.enabled), eventId: String(row.event_id), timezone: String(row.timezone), startLocalTime: String(row.start_local_time), endLocalTime: String(row.end_local_time), startingSoonMinutes: Number(row.starting_soon_minutes), showAllDay: Boolean(row.show_all_day), copyVersion: Number(row.copy_version) };
}

export async function GET(request: Request) {
  try {
    const uid = await userId(request); if (!uid) return json({ error: 'unauthorized' }, 401);
    const db = await database(); const config = await readConfig(db); return json({ config, state: getQuizTimeState(config) });
  } catch (error) { console.error('quiz time GET failed', error); return json({ error: 'unavailable' }, 503); }
}

export async function POST(request: Request) {
  try {
    const uid = await userId(request); if (!uid) return json({ error: 'unauthorized' }, 401);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const eventType = String(body.eventType || ''); const eventId = String(body.eventId || '');
    if (!ALLOWED_EVENTS.has(eventType) || !eventId || eventId.length > 100) return json({ error: 'invalid-event' }, 400);
    const db = await database(); const config = await readConfig(db); const state = getQuizTimeState(config);
    await db.prepare(`INSERT OR IGNORE INTO meonjeo_quiz_time_events (event_id, user_id, event_type, date_key, phase, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'home_banner', ?6)`).bind(eventId, uid, eventType, state.dateKey, state.phase, Date.now()).run();
    return json({ ok: true });
  } catch (error) { console.error('quiz time POST failed', error); return json({ error: 'unavailable' }, 503); }
}
