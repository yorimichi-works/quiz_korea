import { env } from 'cloudflare:workers';
import { EMPTY_TITLE_STATS, TITLE_IDS, unlockedTitleIds, type TitleId, type TitleStats } from '@/lib/titles';

const FIREBASE_API_KEY = 'AIzaSyAFNxcPTqD8LK6IWXlygncDoaUFRAdb6sQ';
const FIREBASE_PROJECT_ID = 'tier-online';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function userId(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token || token.length > 4096) return null;
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  });
  if (!lookup.ok) return null;
  const payload = await lookup.json() as { users?: Array<{ localId?: string }> };
  const uid = payload.users?.[0]?.localId;
  if (!uid) return null;
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as { aud?: string };
    return claims.aud === FIREBASE_PROJECT_ID ? uid : null;
  } catch { return null; }
}

async function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('Titles database is unavailable');
  await db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_player_titles (
    user_id TEXT PRIMARY KEY, selected_title_id TEXT, matches INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0, current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0, correct_answers INTEGER NOT NULL DEFAULT 0,
    fast_buzz_wins INTEGER NOT NULL DEFAULT 0, history_correct INTEGER NOT NULL DEFAULT 0,
    quiz_time_matches INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  return db;
}

async function titleState(db: D1Database, uid: string) {
  await db.prepare(`INSERT OR IGNORE INTO meonjeo_player_titles (user_id) VALUES (?1)`).bind(uid).run();
  const row = await db.prepare(`SELECT selected_title_id, matches, wins, current_streak, best_streak, correct_answers, fast_buzz_wins, history_correct, quiz_time_matches FROM meonjeo_player_titles WHERE user_id = ?1`).bind(uid).first<Record<string, string | number | null>>();
  const progress = await db.prepare(`SELECT rank_points FROM meonjeo_player_progress WHERE user_id = ?1`).bind(uid).first<{ rank_points: number }>();
  const stats: TitleStats = {
    matches: Number(row?.matches) || 0, wins: Number(row?.wins) || 0,
    currentStreak: Number(row?.current_streak) || 0, bestStreak: Number(row?.best_streak) || 0,
    correctAnswers: Number(row?.correct_answers) || 0, fastBuzzWins: Number(row?.fast_buzz_wins) || 0,
    historyCorrect: Number(row?.history_correct) || 0, quizTimeMatches: Number(row?.quiz_time_matches) || 0,
  };
  const unlocked = unlockedTitleIds(stats || EMPTY_TITLE_STATS, Number(progress?.rank_points) || 0);
  const selected = unlocked.includes(row?.selected_title_id as TitleId) ? row?.selected_title_id : null;
  return { selectedTitleId: selected, unlockedTitleIds: unlocked, stats };
}

export async function GET(request: Request) {
  try {
    const uid = await userId(request); if (!uid) return json({ error: 'unauthorized' }, 401);
    return json(await titleState(await database(), uid));
  } catch (error) { console.error('titles GET failed', error); return json({ error: 'unavailable' }, 503); }
}

export async function PUT(request: Request) {
  try {
    const uid = await userId(request); if (!uid) return json({ error: 'unauthorized' }, 401);
    const db = await database(); const current = await titleState(db, uid);
    const body = await request.json().catch(() => ({})) as { titleId?: unknown };
    const titleId = body.titleId === null ? null : String(body.titleId || '');
    if (titleId !== null && (!TITLE_IDS.includes(titleId as TitleId) || !current.unlockedTitleIds.includes(titleId as TitleId))) return json({ error: 'title-locked' }, 409);
    await db.prepare(`UPDATE meonjeo_player_titles SET selected_title_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?2`).bind(titleId, uid).run();
    return json(await titleState(db, uid));
  } catch (error) { console.error('titles PUT failed', error); return json({ error: 'unavailable' }, 503); }
}
