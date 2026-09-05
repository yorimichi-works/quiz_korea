import { env } from 'cloudflare:workers';
import { requireFirebaseUser } from '@/lib/firebase-user';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) throw new Error('Account database is unavailable');
    const uid = user.userId;
    await db.batch([
      db.prepare(`DELETE FROM meonjeo_match_events WHERE user_id = ?1 OR match_id IN (SELECT id FROM meonjeo_matches WHERE player_a = ?1 OR player_b = ?1)`).bind(uid),
      db.prepare(`DELETE FROM meonjeo_matches WHERE player_a = ?1 OR player_b = ?1`).bind(uid),
      db.prepare(`DELETE FROM meonjeo_match_queue WHERE user_id = ?1`).bind(uid),
      db.prepare(`DELETE FROM meonjeo_realtime_sessions WHERE user_id = ?1`).bind(uid),
      db.prepare(`DELETE FROM meonjeo_quiz_time_events WHERE user_id = ?1`).bind(uid),
      db.prepare(`DELETE FROM meonjeo_reports WHERE reporter_user_id = ?1`).bind(uid),
      db.prepare(`DELETE FROM meonjeo_player_titles WHERE user_id = ?1`).bind(uid),
      db.prepare(`DELETE FROM meonjeo_player_progress WHERE user_id = ?1`).bind(uid),
    ]);
    return json({ deleted: true });
  } catch (error) {
    console.error('account deletion failed', error);
    return json({ error: 'unavailable' }, 503);
  }
}
