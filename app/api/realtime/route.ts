import { env } from 'cloudflare:workers';
import season from '@/data/seasons/S1-2026/questions.ko.json';

const FIREBASE_API_KEY = 'AIzaSyAFNxcPTqD8LK6IWXlygncDoaUFRAdb6sQ';
const FIREBASE_PROJECT_ID = 'tier-online';
const CHAR_MS = 130;
const RESULT_MS = 5000;
const ANSWER_MS = 7000;
const MAX_ROUNDS = 20;
const WIN_SCORE = 5;

type Question = (typeof season.questions)[number];
type MatchRow = {
  id: string; player_a: string; player_b: string; status: string; phase: string;
  question_ids_json: string; question_index: number; question_token: string;
  start_at: number; buzz_open_at: number; buzz_deadline_at: number;
  buzz_winner_uid: string | null; buzz_id: string | null; answer_deadline_at: number | null;
  score_a: number; score_b: number; lives_a: number; lives_b: number;
  result_json: string | null; next_question_at: number | null; decision_version: number;
  last_seen_a: number; last_seen_b: number; created_at: number; rating_applied: number;
};

const questions = season.questions.filter(question => question.enabledInSeason && question.qaStatus !== 'REJECT');
const questionMap = new Map(questions.map(question => [question.questionId, question]));

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('Realtime database unavailable');
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_match_queue (user_id TEXT PRIMARY KEY, joined_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_matches (id TEXT PRIMARY KEY, player_a TEXT NOT NULL, player_b TEXT NOT NULL, status TEXT NOT NULL, phase TEXT NOT NULL, question_ids_json TEXT NOT NULL, question_index INTEGER NOT NULL, question_token TEXT NOT NULL, start_at INTEGER NOT NULL, buzz_open_at INTEGER NOT NULL, buzz_deadline_at INTEGER NOT NULL, buzz_winner_uid TEXT, buzz_id TEXT, answer_deadline_at INTEGER, score_a INTEGER NOT NULL DEFAULT 0, score_b INTEGER NOT NULL DEFAULT 0, lives_a INTEGER NOT NULL DEFAULT 5, lives_b INTEGER NOT NULL DEFAULT 5, result_json TEXT, next_question_at INTEGER, decision_version INTEGER NOT NULL DEFAULT 1, last_seen_a INTEGER NOT NULL DEFAULT 0, last_seen_b INTEGER NOT NULL DEFAULT 0, rating_applied INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_match_events (event_id TEXT PRIMARY KEY, match_id TEXT NOT NULL, user_id TEXT NOT NULL, event_type TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_realtime_sessions (session_token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`),
  ]);
  return db;
}

async function firebaseUserIdFromRequest(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token || token.length > 4096) return null;
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  });
  if (!lookup.ok) return null;
  const payload = await lookup.json() as { users?: Array<{ localId?: string; providerUserInfo?: Array<{ providerId?: string }> }> };
  const user = payload.users?.[0];
  if (!user?.localId || !user.providerUserInfo?.some(provider => provider.providerId === 'google.com')) return null;
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as { aud?: string };
    return claims.aud === FIREBASE_PROJECT_ID ? user.localId : null;
  } catch { return null; }
}

async function userIdFromSession(request: Request, db: D1Database) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Meonjeo ') ? authorization.slice(8).trim() : '';
  if (!token || token.length > 200) return null;
  const session = await db.prepare(`SELECT user_id FROM meonjeo_realtime_sessions WHERE session_token = ?1 AND expires_at > ?2`).bind(token, Date.now()).first<{ user_id: string }>();
  return session?.user_id || null;
}

function shuffledQuestionIds() {
  const seen = new Set<string>();
  const pool = [...questions].sort(() => Math.random() - 0.5).filter(question => {
    const key = question.factGroupId || question.questionId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return pool.slice(0, MAX_ROUNDS).map(question => question.questionId);
}

function currentQuestion(match: MatchRow): Question {
  const ids = JSON.parse(match.question_ids_json) as string[];
  const question = questionMap.get(ids[match.question_index]);
  if (!question) throw new Error('Match question missing');
  return question;
}

function normalize(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[\s·.,!?！？'"“”‘’()（）\-_:：/]/g, '');
}

function answerCharacters(question: Question) {
  const correct = Array.from(question.canonicalAnswer.normalize('NFKC').toUpperCase().replace(/[\s·.,!?！？'"“”‘’()（）\-_:：/]/g, ''));
  const extras = Array.from('가나다라마바사아자차카타파하').filter(char => !correct.includes(char)).sort(() => Math.random() - 0.5).slice(0, Math.min(5, Math.max(2, correct.length)));
  return [...correct, ...extras].sort(() => Math.random() - 0.5);
}

async function findMatch(db: D1Database, uid: string) {
  return db.prepare(`SELECT * FROM meonjeo_matches WHERE status = 'active' AND (player_a = ?1 OR player_b = ?1) ORDER BY created_at DESC LIMIT 1`).bind(uid).first<MatchRow>();
}

async function createMatch(db: D1Database, playerA: string, playerB: string) {
  const id = crypto.randomUUID();
  const ids = shuffledQuestionIds();
  const question = questionMap.get(ids[0])!;
  const now = Date.now();
  const startAt = now + 2500;
  const buzzOpenAt = startAt + 300;
  const buzzDeadlineAt = startAt + Math.max(6000, question.questionText.length * CHAR_MS + 2500);
  await db.prepare(`INSERT INTO meonjeo_matches
    (id, player_a, player_b, status, phase, question_ids_json, question_index, question_token, start_at, buzz_open_at, buzz_deadline_at, score_a, score_b, lives_a, lives_b, decision_version, created_at, updated_at)
    VALUES (?1, ?2, ?3, 'active', 'scheduled', ?4, 0, ?5, ?6, ?7, ?8, 0, 0, 5, 5, 1, ?9, ?9)`)
    .bind(id, playerA, playerB, JSON.stringify(ids), crypto.randomUUID(), startAt, buzzOpenAt, buzzDeadlineAt, now).run();
  return id;
}

async function loadMatch(db: D1Database, matchId: string, uid: string) {
  return db.prepare(`SELECT * FROM meonjeo_matches WHERE id = ?1 AND (player_a = ?2 OR player_b = ?2)`).bind(matchId, uid).first<MatchRow>();
}

async function applyMatchRewards(db: D1Database, match: MatchRow) {
  if (match.rating_applied) return;
  const tied = match.score_a === match.score_b && match.lives_a === match.lives_b;
  const winner = tied ? null : match.score_a > match.score_b || match.lives_b <= 0 ? match.player_a : match.player_b;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  const players = [[match.player_a, match.player_b, match.score_a, match.score_b], [match.player_b, match.player_a, match.score_b, match.score_a]] as const;
  for (const [uid, , score, opponentScore] of players) {
    const row = await db.prepare(`SELECT rating, rank_points, match_history_json FROM meonjeo_player_progress WHERE user_id = ?1`).bind(uid).first<{ rating: number; rank_points: number; match_history_json: string }>();
    const won = winner === uid; const ratingDelta = tied ? 0 : won ? 18 : -14; const rankGain = won ? 100 : 0;
    let history: unknown[] = [];
    try { const parsed = JSON.parse(row?.match_history_json || '[]'); if (Array.isArray(parsed)) history = parsed; } catch { history = []; }
    const item = { matchId: match.id, opponentName: 'LIVE PLAYER', opponentIcon: '●', opponentRating: 1248, playedAt: new Date(now).toISOString(), result: tied ? 'draw' : won ? 'win' : 'loss', score, opponentScore };
    const mergedHistory = [item, ...history.filter(entry => (entry as { matchId?: string })?.matchId !== match.id)].slice(0, 30);
    statements.push(db.prepare(`INSERT INTO meonjeo_player_progress (user_id, rating, rank_points, profile_updated_at, match_history_json, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET rating = excluded.rating, rank_points = excluded.rank_points, profile_updated_at = excluded.profile_updated_at, match_history_json = excluded.match_history_json, updated_at = CURRENT_TIMESTAMP`)
      .bind(uid, Math.max(0, (row?.rating ?? 1248) + ratingDelta), Math.max(0, (row?.rank_points ?? 0) + rankGain), now, JSON.stringify(mergedHistory)));
  }
  statements.push(db.prepare(`UPDATE meonjeo_matches SET rating_applied = 1 WHERE id = ?1 AND rating_applied = 0`).bind(match.id));
  await db.batch(statements);
}

async function advance(db: D1Database, match: MatchRow) {
  const now = Date.now();
  const otherLastSeen = match.last_seen_a > match.last_seen_b ? match.last_seen_b : match.last_seen_a;
  if (match.status === 'active' && now - match.created_at > 15000 && (otherLastSeen === 0 || now - otherLastSeen > 15000)) {
    await db.prepare(`UPDATE meonjeo_matches SET status = 'cancelled', phase = 'cancelled', decision_version = decision_version + 1, updated_at = ?1 WHERE id = ?2 AND status = 'active'`).bind(now, match.id).run();
    return (await loadMatch(db, match.id, match.player_a)) || match;
  }
  if (match.phase === 'scheduled' && now >= match.buzz_open_at) {
    await db.prepare(`UPDATE meonjeo_matches SET phase = 'open', decision_version = decision_version + 1, updated_at = ?1 WHERE id = ?2 AND phase = 'scheduled'`).bind(now, match.id).run();
  } else if (match.phase === 'open' && now > match.buzz_deadline_at) {
    const question = currentQuestion(match);
    const result = { kind: 'no_buzz', answer: question.canonicalAnswer, explanation: question.explanation };
    await db.prepare(`UPDATE meonjeo_matches SET phase = 'result', result_json = ?1, next_question_at = ?2, decision_version = decision_version + 1, updated_at = ?3 WHERE id = ?4 AND phase = 'open'`)
      .bind(JSON.stringify(result), now + RESULT_MS, now, match.id).run();
  } else if (match.phase === 'answering' && match.answer_deadline_at && now > match.answer_deadline_at) {
    const question = currentQuestion(match);
    const result = { kind: 'answer_timeout', answer: question.canonicalAnswer, explanation: question.explanation, answerUid: match.buzz_winner_uid };
    const livesA = match.player_a === match.buzz_winner_uid ? Math.max(0, match.lives_a - 1) : match.lives_a;
    const livesB = match.player_b === match.buzz_winner_uid ? Math.max(0, match.lives_b - 1) : match.lives_b;
    await db.prepare(`UPDATE meonjeo_matches SET phase = 'result', lives_a = ?1, lives_b = ?2, result_json = ?3, next_question_at = ?4, decision_version = decision_version + 1, updated_at = ?5 WHERE id = ?6 AND phase = 'answering'`)
      .bind(livesA, livesB, JSON.stringify(result), now + RESULT_MS, now, match.id).run();
  } else if (match.phase === 'result' && match.next_question_at && now >= match.next_question_at) {
    const complete = match.score_a >= WIN_SCORE || match.score_b >= WIN_SCORE || match.lives_a <= 0 || match.lives_b <= 0 || match.question_index + 1 >= MAX_ROUNDS;
    if (complete) {
      const completed = await db.prepare(`UPDATE meonjeo_matches SET status = 'complete', phase = 'complete', decision_version = decision_version + 1, updated_at = ?1 WHERE id = ?2 AND phase = 'result'`).bind(now, match.id).run();
      if (completed.meta.changes === 1) await applyMatchRewards(db, match);
    } else {
      const nextIndex = match.question_index + 1;
      const ids = JSON.parse(match.question_ids_json) as string[];
      const question = questionMap.get(ids[nextIndex])!;
      const startAt = now + 1800;
      await db.prepare(`UPDATE meonjeo_matches SET phase = 'scheduled', question_index = ?1, question_token = ?2, start_at = ?3, buzz_open_at = ?4, buzz_deadline_at = ?5, buzz_winner_uid = NULL, buzz_id = NULL, answer_deadline_at = NULL, result_json = NULL, next_question_at = NULL, decision_version = decision_version + 1, updated_at = ?6 WHERE id = ?7 AND phase = 'result'`)
        .bind(nextIndex, crypto.randomUUID(), startAt, startAt + 300, startAt + Math.max(6000, question.questionText.length * CHAR_MS + 2500), now, match.id).run();
    }
  }
  return (await loadMatch(db, match.id, match.player_a)) || match;
}

function clientSnapshot(match: MatchRow, uid: string) {
  const question = currentQuestion(match);
  const isA = uid === match.player_a;
  const result = match.result_json ? JSON.parse(match.result_json) : null;
  return {
    serverNow: Date.now(), matchId: match.id, phase: match.phase, status: match.status,
    questionIndex: match.question_index, roundLimit: MAX_ROUNDS, questionToken: match.question_token,
    question: { text: question.questionText, category: question.categoryKo },
    startAt: match.start_at, buzzOpenAt: match.buzz_open_at, buzzDeadlineAt: match.buzz_deadline_at,
    buzzWinner: match.buzz_winner_uid === uid ? 'me' : match.buzz_winner_uid ? 'opponent' : null,
    answerDeadlineAt: match.answer_deadline_at,
    answerCharacters: match.phase === 'answering' && match.buzz_winner_uid === uid ? answerCharacters(question) : null,
    answerLength: match.phase === 'answering' && match.buzz_winner_uid === uid ? Array.from(normalize(question.canonicalAnswer)).length : null,
    myScore: isA ? match.score_a : match.score_b, opponentScore: isA ? match.score_b : match.score_a,
    myLives: isA ? match.lives_a : match.lives_b, opponentLives: isA ? match.lives_b : match.lives_a,
    result: result ? { ...result, answerUid: result.answerUid === uid ? 'me' : result.answerUid ? 'opponent' : null } : null,
    nextQuestionAt: match.next_question_at, version: match.decision_version,
  };
}

async function handleJoin(db: D1Database, uid: string) {
  const active = await findMatch(db, uid);
  if (active) return { state: 'matched', matchId: active.id };
  await db.prepare(`DELETE FROM meonjeo_match_queue WHERE joined_at < ?1`).bind(Date.now() - 30000).run();
  const claimed = await db.prepare(`DELETE FROM meonjeo_match_queue WHERE user_id = (SELECT user_id FROM meonjeo_match_queue WHERE user_id != ?1 ORDER BY joined_at LIMIT 1) RETURNING user_id`).bind(uid).first<{ user_id: string }>();
  if (claimed?.user_id) return { state: 'matched', matchId: await createMatch(db, claimed.user_id, uid) };
  await db.prepare(`INSERT INTO meonjeo_match_queue (user_id, joined_at) VALUES (?1, ?2) ON CONFLICT(user_id) DO UPDATE SET joined_at = excluded.joined_at`).bind(uid, Date.now()).run();
  return { state: 'waiting' };
}

async function handleBuzz(db: D1Database, uid: string, body: Record<string, unknown>) {
  const matchId = String(body.matchId || ''); const buzzId = String(body.buzzId || ''); const token = String(body.questionToken || '');
  if (!matchId || !buzzId || buzzId.length > 100) return response({ error: 'invalid-buzz' }, 400);
  const prior = await db.prepare(`SELECT response_json FROM meonjeo_match_events WHERE event_id = ?1 AND user_id = ?2`).bind(buzzId, uid).first<{ response_json: string }>();
  if (prior) return response(JSON.parse(prior.response_json));
  let match = await loadMatch(db, matchId, uid); if (!match) return response({ error: 'match-not-found' }, 404);
  match = await advance(db, match);
  const now = Date.now();
  const won = await db.prepare(`UPDATE meonjeo_matches SET phase = 'answering', buzz_winner_uid = ?1, buzz_id = ?2, answer_deadline_at = ?3, decision_version = decision_version + 1, updated_at = ?4 WHERE id = ?5 AND phase = 'open' AND question_token = ?6 AND buzz_winner_uid IS NULL AND buzz_open_at <= ?4 AND buzz_deadline_at >= ?4`)
    .bind(uid, buzzId, now + ANSWER_MS, now, matchId, token).run();
  match = (await loadMatch(db, matchId, uid))!;
  const payload = { accepted: won.meta.changes === 1, winner: match.buzz_winner_uid === uid ? 'me' : match.buzz_winner_uid ? 'opponent' : null, snapshot: clientSnapshot(match, uid) };
  await db.prepare(`INSERT OR IGNORE INTO meonjeo_match_events (event_id, match_id, user_id, event_type, response_json, created_at) VALUES (?1, ?2, ?3, 'buzz', ?4, ?5)`).bind(buzzId, matchId, uid, JSON.stringify(payload), now).run();
  return response(payload);
}

async function handleAnswer(db: D1Database, uid: string, body: Record<string, unknown>) {
  const matchId = String(body.matchId || ''); const answerId = String(body.answerId || ''); const answer = String(body.answer || '').slice(0, 100);
  if (!matchId || !answerId) return response({ error: 'invalid-answer' }, 400);
  const prior = await db.prepare(`SELECT response_json FROM meonjeo_match_events WHERE event_id = ?1 AND user_id = ?2`).bind(answerId, uid).first<{ response_json: string }>();
  if (prior) return response(JSON.parse(prior.response_json));
  let match = await loadMatch(db, matchId, uid); if (!match) return response({ error: 'match-not-found' }, 404);
  match = await advance(db, match);
  if (match.phase !== 'answering' || match.buzz_winner_uid !== uid || !match.answer_deadline_at || Date.now() > match.answer_deadline_at) return response({ error: 'answer-closed' }, 409);
  const question = currentQuestion(match);
  const correct = [question.canonicalAnswer, ...(question.acceptedAliases || [])].some(value => normalize(value) === normalize(answer));
  const now = Date.now();
  const scoreA = match.score_a + (correct && uid === match.player_a ? 1 : 0); const scoreB = match.score_b + (correct && uid === match.player_b ? 1 : 0);
  const livesA = match.lives_a - (!correct && uid === match.player_a ? 1 : 0); const livesB = match.lives_b - (!correct && uid === match.player_b ? 1 : 0);
  const resultData = { kind: correct ? 'correct' : 'wrong', answer: question.canonicalAnswer, explanation: question.explanation, answerUid: uid };
  const updated = await db.prepare(`UPDATE meonjeo_matches SET phase = 'result', score_a = ?1, score_b = ?2, lives_a = ?3, lives_b = ?4, result_json = ?5, next_question_at = ?6, decision_version = decision_version + 1, updated_at = ?7 WHERE id = ?8 AND phase = 'answering' AND buzz_winner_uid = ?9`)
    .bind(scoreA, scoreB, livesA, livesB, JSON.stringify(resultData), now + RESULT_MS, now, matchId, uid).run();
  match = (await loadMatch(db, matchId, uid))!;
  const payload = { accepted: updated.meta.changes === 1, snapshot: clientSnapshot(match, uid) };
  await db.prepare(`INSERT OR IGNORE INTO meonjeo_match_events (event_id, match_id, user_id, event_type, response_json, created_at) VALUES (?1, ?2, ?3, 'answer', ?4, ?5)`).bind(answerId, matchId, uid, JSON.stringify(payload), now).run();
  return response(payload);
}

export async function GET(request: Request) {
  try {
    const db = await database(); const uid = await userIdFromSession(request, db); if (!uid) return response({ error: 'unauthorized' }, 401);
    const action = new URL(request.url).searchParams.get('action');
    if (action === 'ping') return response({ serverNow: Date.now() });
    return response({ error: 'unknown-action' }, 404);
  } catch (error) { console.error('realtime GET failed', error); return response({ error: 'unavailable' }, 503); }
}

export async function POST(request: Request) {
  try {
    const action = new URL(request.url).searchParams.get('action');
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const db = await database();
    if (action === 'session') {
      const uid = await firebaseUserIdFromRequest(request); if (!uid) return response({ error: 'unauthorized' }, 401);
      const sessionToken = crypto.randomUUID(); const expiresAt = Date.now() + 60 * 60 * 1000;
      await db.prepare(`INSERT INTO meonjeo_realtime_sessions (session_token, user_id, expires_at) VALUES (?1, ?2, ?3)`).bind(sessionToken, uid, expiresAt).run();
      await db.prepare(`DELETE FROM meonjeo_realtime_sessions WHERE expires_at <= ?1`).bind(Date.now()).run();
      return response({ sessionToken, expiresAt });
    }
    const uid = await userIdFromSession(request, db); if (!uid) return response({ error: 'unauthorized' }, 401);
    if (action === 'join') return response(await handleJoin(db, uid));
    if (action === 'snapshot') {
      let match = await loadMatch(db, String(body.matchId || ''), uid); if (!match) return response({ error: 'match-not-found' }, 404);
      const seenColumn = uid === match.player_a ? 'last_seen_a' : 'last_seen_b';
      await db.prepare(`UPDATE meonjeo_matches SET ${seenColumn} = ?1, updated_at = ?1 WHERE id = ?2`).bind(Date.now(), match.id).run();
      match = (await loadMatch(db, match.id, uid))!;
      match = await advance(db, match); return response({ snapshot: clientSnapshot(match, uid) });
    }
    if (action === 'buzz') return handleBuzz(db, uid, body);
    if (action === 'answer') return handleAnswer(db, uid, body);
    if (action === 'leave') {
      await db.prepare(`DELETE FROM meonjeo_match_queue WHERE user_id = ?1`).bind(uid).run();
      const matchId = String(body.matchId || '');
      if (matchId) await db.prepare(`UPDATE meonjeo_matches SET status = 'cancelled', phase = 'cancelled', updated_at = ?1 WHERE id = ?2 AND status = 'active' AND (player_a = ?3 OR player_b = ?3)`).bind(Date.now(), matchId, uid).run();
      return response({ ok: true });
    }
    return response({ error: 'unknown-action' }, 404);
  } catch (error) {
    console.error('realtime API failed', error);
    return response({ error: 'unavailable' }, 503);
  }
}
