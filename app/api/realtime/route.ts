import { env } from 'cloudflare:workers';
import season from '@/data/seasons/S2-2026/questions.ko.json';
import { ratingDelta, rankPointGain } from '@/lib/rating';
import { DEFAULT_QUIZ_TIME_CONFIG, getQuizTimeState, type QuizTimeConfig } from '@/lib/quiz-time';
import { answerChoiceRandom, answerTimeLimitMs, createAnswerTileChoices, normalizedAnswerCharacters, normalizedAnswerTiles } from '@/lib/answer-choices';
import { matchOutcome } from '@/lib/match-outcome';
import { excludeRecentlySeenQuestionGroups, selectMatchQuestionIds } from '@/lib/question-selection';
import { questionRevealDurationMs, revealedQuestionLength } from '@/lib/question-timing';

const FIREBASE_API_KEY = 'AIzaSyAFNxcPTqD8LK6IWXlygncDoaUFRAdb6sQ';
const FIREBASE_PROJECT_ID = 'tier-online';
const RESULT_MS = 5000;
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
  rating_a: number; rating_b: number; title_a: string | null; title_b: string | null;
  source_a: string; source_b: string; queue_joined_a: number; queue_joined_b: number;
  rating_delta_a: number; rating_delta_b: number; rank_gain_a: number; rank_gain_b: number;
};

const questions = season.questions.filter(question => question.enabledInSeason && question.qaStatus !== 'REJECT');
const questionMap = new Map(questions.map(question => [question.questionId, question]));

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

let databaseReady: Promise<D1Database> | null = null;

async function initializeDatabase(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_player_progress (user_id TEXT PRIMARY KEY, rating INTEGER NOT NULL, rank_points INTEGER NOT NULL, profile_updated_at INTEGER NOT NULL, match_history_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_match_queue (user_id TEXT PRIMARY KEY, joined_at INTEGER NOT NULL, source TEXT NOT NULL DEFAULT 'rated')`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_matches (id TEXT PRIMARY KEY, player_a TEXT NOT NULL, player_b TEXT NOT NULL, status TEXT NOT NULL, phase TEXT NOT NULL, question_ids_json TEXT NOT NULL, question_index INTEGER NOT NULL, question_token TEXT NOT NULL, start_at INTEGER NOT NULL, buzz_open_at INTEGER NOT NULL, buzz_deadline_at INTEGER NOT NULL, buzz_winner_uid TEXT, buzz_id TEXT, answer_deadline_at INTEGER, score_a INTEGER NOT NULL DEFAULT 0, score_b INTEGER NOT NULL DEFAULT 0, lives_a INTEGER NOT NULL DEFAULT 5, lives_b INTEGER NOT NULL DEFAULT 5, result_json TEXT, next_question_at INTEGER, decision_version INTEGER NOT NULL DEFAULT 1, last_seen_a INTEGER NOT NULL DEFAULT 0, last_seen_b INTEGER NOT NULL DEFAULT 0, rating_applied INTEGER NOT NULL DEFAULT 0, rating_a INTEGER NOT NULL DEFAULT 1248, rating_b INTEGER NOT NULL DEFAULT 1248, title_a TEXT, title_b TEXT, source_a TEXT NOT NULL DEFAULT 'rated', source_b TEXT NOT NULL DEFAULT 'rated', queue_joined_a INTEGER NOT NULL DEFAULT 0, queue_joined_b INTEGER NOT NULL DEFAULT 0, rating_delta_a INTEGER NOT NULL DEFAULT 0, rating_delta_b INTEGER NOT NULL DEFAULT 0, rank_gain_a INTEGER NOT NULL DEFAULT 0, rank_gain_b INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_match_events (event_id TEXT PRIMARY KEY, match_id TEXT NOT NULL, user_id TEXT NOT NULL, event_type TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_realtime_sessions (session_token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_player_titles (user_id TEXT PRIMARY KEY, selected_title_id TEXT, matches INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, current_streak INTEGER NOT NULL DEFAULT 0, best_streak INTEGER NOT NULL DEFAULT 0, correct_answers INTEGER NOT NULL DEFAULT 0, fast_buzz_wins INTEGER NOT NULL DEFAULT 0, history_correct INTEGER NOT NULL DEFAULT 0, quiz_time_matches INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_quiz_time_config (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, event_id TEXT NOT NULL DEFAULT 'daily_quiz_time', timezone TEXT NOT NULL DEFAULT 'Asia/Seoul', start_local_time TEXT NOT NULL DEFAULT '21:00', end_local_time TEXT NOT NULL DEFAULT '22:00', starting_soon_minutes INTEGER NOT NULL DEFAULT 30, show_all_day INTEGER NOT NULL DEFAULT 1, copy_version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS meonjeo_quiz_time_events (event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, event_type TEXT NOT NULL, date_key TEXT NOT NULL, phase TEXT NOT NULL, source TEXT NOT NULL, wait_ms INTEGER, rating_band TEXT, match_result TEXT, created_at INTEGER NOT NULL)`),
  ]);
  await db.prepare(`INSERT OR IGNORE INTO meonjeo_quiz_time_config (id) VALUES ('default')`).run();
  return db;
}

function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) throw new Error('Realtime database unavailable');
  if (!databaseReady) {
    databaseReady = initializeDatabase(db).catch(error => {
      databaseReady = null;
      throw error;
    });
  }
  return databaseReady;
}

async function firebaseUserIdFromRequest(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token || token.length > 4096) return null;
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  });
  if (!lookup.ok) return null;
  const payload = await lookup.json() as { users?: Array<{ localId?: string }> };
  const user = payload.users?.[0];
  if (!user?.localId) return null;
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

async function shuffledQuestionIds(db: D1Database, playerA: string, playerB: string) {
  const recentMatchSets = await Promise.all([playerA, playerB].map(player => (
    db.prepare(`SELECT id, question_ids_json, question_index, created_at FROM meonjeo_matches
      WHERE player_a = ?1 OR player_b = ?1
      ORDER BY created_at DESC LIMIT 3`)
      .bind(player).all<{ id: string; question_ids_json: string; question_index: number; created_at: number }>()
  )));
  const recentByMatchId = new Map<string, { questionIds: string[]; createdAt: number }>();
  for (const recentMatches of recentMatchSets) {
    for (const match of recentMatches.results) {
      try {
        const ids = JSON.parse(match.question_ids_json);
        if (Array.isArray(ids)) {
          recentByMatchId.set(match.id, {
            questionIds: ids.filter(id => typeof id === 'string').slice(0, Math.max(0, match.question_index + 1)),
            createdAt: match.created_at,
          });
        }
      } catch { /* An old malformed row should not block matchmaking. */ }
    }
  }
  const recentMatches = [...recentByMatchId.values()].sort((left, right) => right.createdAt - left.createdAt);
  for (let keptMatches = recentMatches.length; keptMatches >= 0; keptMatches -= 1) {
    const recentQuestionIds = recentMatches.slice(0, keptMatches).flatMap(match => match.questionIds);
    const freshQuestions = excludeRecentlySeenQuestionGroups(questions, recentQuestionIds);
    try {
      return selectMatchQuestionIds(freshQuestions, MAX_ROUNDS);
    } catch {
      // If a future small season cannot satisfy every quota, release only the
      // oldest history window and try again instead of discarding all memory.
    }
  }
  throw new Error('Question pool cannot produce a complete match deck');
}

function currentQuestion(match: MatchRow): Question {
  const ids = JSON.parse(match.question_ids_json) as string[];
  const question = questionMap.get(ids[match.question_index]);
  if (!question) throw new Error('Match question missing');
  return question;
}

function normalize(value: string) {
  return normalizedAnswerCharacters(value).join('');
}

function answerCharacters(question: Question, match: MatchRow, uid: string) {
  return createAnswerTileChoices(question.canonicalAnswer, answerChoiceRandom(`${match.question_token}:${uid}`));
}

async function findMatch(db: D1Database, uid: string) {
  return db.prepare(`SELECT * FROM meonjeo_matches WHERE status = 'active' AND (player_a = ?1 OR player_b = ?1) ORDER BY created_at DESC LIMIT 1`).bind(uid).first<MatchRow>();
}

async function quizTimeState(db: D1Database) {
  const row = await db.prepare(`SELECT enabled, event_id, timezone, start_local_time, end_local_time, starting_soon_minutes, show_all_day, copy_version FROM meonjeo_quiz_time_config WHERE id = 'default'`).first<Record<string, string | number>>();
  const config: QuizTimeConfig = row ? { enabled:Boolean(row.enabled), eventId:String(row.event_id), timezone:String(row.timezone), startLocalTime:String(row.start_local_time), endLocalTime:String(row.end_local_time), startingSoonMinutes:Number(row.starting_soon_minutes), showAllDay:Boolean(row.show_all_day), copyVersion:Number(row.copy_version) } : DEFAULT_QUIZ_TIME_CONFIG;
  return getQuizTimeState(config);
}

async function recordQuizTimeEvent(db: D1Database, values: { eventId:string; uid:string; type:string; source:string; waitMs?:number; result?:string }) {
  if (values.source !== 'quiz_time_banner') return;
  const event = await quizTimeState(db);
  await db.prepare(`INSERT OR IGNORE INTO meonjeo_quiz_time_events (event_id, user_id, event_type, date_key, phase, source, wait_ms, rating_band, match_result, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, ?9)`)
    .bind(values.eventId, values.uid, values.type, event.dateKey, event.phase, values.source, values.waitMs ?? null, values.result ?? null, Date.now()).run();
}

async function createMatch(db: D1Database, playerA: string, playerB: string, queueA: { joined_at:number; source:string }, queueB: { joined_at:number; source:string }) {
  const qaMode = queueA.source === 'qa-local' || queueB.source === 'qa-local';
  const id = `${qaMode ? 'qa-' : ''}${crypto.randomUUID()}`;
  const ids = await shuffledQuestionIds(db, playerA, playerB);
  const question = questionMap.get(ids[0])!;
  const now = Date.now();
  const startAt = now + (qaMode ? 10 : 2500);
  const buzzOpenAt = startAt + (qaMode ? 0 : 300);
  const buzzDeadlineAt = startAt + (qaMode ? 60000 : Math.max(6000, questionRevealDurationMs(question.questionText) + 2500));
  const [progressA, progressB, titleA, titleB] = await Promise.all([
    db.prepare(`SELECT rating FROM meonjeo_player_progress WHERE user_id = ?1`).bind(playerA).first<{ rating:number }>(),
    db.prepare(`SELECT rating FROM meonjeo_player_progress WHERE user_id = ?1`).bind(playerB).first<{ rating:number }>(),
    db.prepare(`SELECT selected_title_id FROM meonjeo_player_titles WHERE user_id = ?1`).bind(playerA).first<{ selected_title_id:string | null }>(),
    db.prepare(`SELECT selected_title_id FROM meonjeo_player_titles WHERE user_id = ?1`).bind(playerB).first<{ selected_title_id:string | null }>(),
  ]);
  const inserted = await db.prepare(`INSERT INTO meonjeo_matches
    (id, player_a, player_b, status, phase, question_ids_json, question_index, question_token, start_at, buzz_open_at, buzz_deadline_at, score_a, score_b, lives_a, lives_b, decision_version, rating_a, rating_b, title_a, title_b, source_a, source_b, queue_joined_a, queue_joined_b, created_at, updated_at)
    SELECT ?1, ?2, ?3, 'active', 'scheduled', ?4, 0, ?5, ?6, ?7, ?8, 0, 0, 5, 5, 1, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?17
    WHERE NOT EXISTS (
      SELECT 1 FROM meonjeo_matches
      WHERE status = 'active'
        AND (player_a IN (?2, ?3) OR player_b IN (?2, ?3))
    )`)
    .bind(id, playerA, playerB, JSON.stringify(ids), crypto.randomUUID(), startAt, buzzOpenAt, buzzDeadlineAt, progressA?.rating ?? 1248, progressB?.rating ?? 1248, titleA?.selected_title_id ?? null, titleB?.selected_title_id ?? null, queueA.source, queueB.source, queueA.joined_at, queueB.joined_at, now).run();
  if (inserted.meta.changes !== 1) {
    const callerMatch = await findMatch(db, playerB);
    return { matchId: callerMatch?.id ?? null, created: false };
  }
  await db.prepare(`DELETE FROM meonjeo_match_queue WHERE user_id IN (?1, ?2)`).bind(playerA, playerB).run();
  await Promise.all([
    recordQuizTimeEvent(db, { eventId:`match-found:${id}:${playerA}`, uid:playerA, type:'quiz_time_match_found', source:queueA.source, waitMs:now-queueA.joined_at }),
    recordQuizTimeEvent(db, { eventId:`match-found:${id}:${playerB}`, uid:playerB, type:'quiz_time_match_found', source:queueB.source, waitMs:now-queueB.joined_at }),
  ]);
  return { matchId: id, created: true };
}

async function loadMatch(db: D1Database, matchId: string, uid: string) {
  return db.prepare(`SELECT * FROM meonjeo_matches WHERE id = ?1 AND (player_a = ?2 OR player_b = ?2)`).bind(matchId, uid).first<MatchRow>();
}

async function applyMatchRewards(db: D1Database, match: MatchRow) {
  if (match.rating_applied) return;
  const outcome = matchOutcome(match);
  const tied = outcome === 'draw';
  const winner = outcome === 'a' ? match.player_a : outcome === 'b' ? match.player_b : null;
  const scoreA: 0 | 0.5 | 1 = tied ? 0.5 : winner === match.player_a ? 1 : 0;
  const deltaA = ratingDelta(match.rating_a, match.rating_b, scoreA);
  const deltaB = -deltaA;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  const players = [
    { uid:match.player_a, score:match.score_a, opponentScore:match.score_b, opponentRating:match.rating_b, source:match.source_a, delta:deltaA },
    { uid:match.player_b, score:match.score_b, opponentScore:match.score_a, opponentRating:match.rating_a, source:match.source_b, delta:deltaB },
  ];
  let rankGainA = 0; let rankGainB = 0;
  for (const [index, player] of players.entries()) {
    const { uid, score, opponentScore, opponentRating, source, delta } = player;
    const row = await db.prepare(`SELECT rating, rank_points, match_history_json FROM meonjeo_player_progress WHERE user_id = ?1`).bind(uid).first<{ rating: number; rank_points: number; match_history_json: string }>();
    const won = winner === uid; const rankGain = rankPointGain(won, tied);
    if (index === 0) rankGainA = rankGain; else rankGainB = rankGain;
    let history: unknown[] = [];
    try { const parsed = JSON.parse(row?.match_history_json || '[]'); if (Array.isArray(parsed)) history = parsed; } catch { history = []; }
    const item = { matchId: match.id, opponentName: 'LIVE PLAYER', opponentIcon: '●', opponentRating, playedAt: new Date(now).toISOString(), result: tied ? 'draw' : won ? 'win' : 'loss', score, opponentScore };
    const mergedHistory = [item, ...history.filter(entry => (entry as { matchId?: string })?.matchId !== match.id)].slice(0, 30);
    statements.push(db.prepare(`INSERT INTO meonjeo_player_progress (user_id, rating, rank_points, profile_updated_at, match_history_json, updated_at)
      SELECT ?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP
      WHERE EXISTS (SELECT 1 FROM meonjeo_matches WHERE id = ?6 AND rating_applied = 0)
      ON CONFLICT(user_id) DO UPDATE SET rating = excluded.rating, rank_points = excluded.rank_points, profile_updated_at = excluded.profile_updated_at, match_history_json = excluded.match_history_json, updated_at = CURRENT_TIMESTAMP`)
      .bind(uid, Math.max(0, (row?.rating ?? 1248) + delta), Math.max(0, (row?.rank_points ?? 0) + rankGain), now, JSON.stringify(mergedHistory), match.id));
    const quizTimeMatch = source === 'quiz_time_banner' ? 1 : 0;
    statements.push(db.prepare(`INSERT INTO meonjeo_player_titles (user_id, matches, wins, current_streak, best_streak, quiz_time_matches)
      SELECT ?1, 1, ?2, ?2, ?2, ?3
      WHERE EXISTS (SELECT 1 FROM meonjeo_matches WHERE id = ?4 AND rating_applied = 0)
      ON CONFLICT(user_id) DO UPDATE SET matches = matches + 1, wins = wins + excluded.wins, current_streak = CASE WHEN excluded.wins = 1 THEN current_streak + 1 ELSE 0 END, best_streak = MAX(best_streak, CASE WHEN excluded.wins = 1 THEN current_streak + 1 ELSE best_streak END), quiz_time_matches = quiz_time_matches + excluded.quiz_time_matches, updated_at = CURRENT_TIMESTAMP`)
      .bind(uid, won ? 1 : 0, quizTimeMatch, match.id));
  }
  statements.push(db.prepare(`UPDATE meonjeo_matches SET rating_applied = 1, rating_delta_a = ?1, rating_delta_b = ?2, rank_gain_a = ?3, rank_gain_b = ?4 WHERE id = ?5 AND rating_applied = 0`).bind(deltaA, deltaB, rankGainA, rankGainB, match.id));
  await db.batch(statements);
  try {
    await Promise.all(players.map(player => recordQuizTimeEvent(db, { eventId:`match-complete:${match.id}:${player.uid}`, uid:player.uid, type:'quiz_time_match_complete', source:player.source, result:tied ? 'draw' : winner === player.uid ? 'win' : 'loss' })));
  } catch (error) {
    // Match settlement must not be reported as failed after its transactional
    // rewards committed merely because optional analytics were unavailable.
    console.error('quiz time completion analytics failed', error);
  }
}

async function settleCompletedMatch(db: D1Database, match: MatchRow) {
  let latest = (await loadMatch(db, match.id, match.player_a)) || match;
  if (latest.status === 'complete' && !latest.rating_applied) {
    await applyMatchRewards(db, latest);
    latest = (await loadMatch(db, match.id, match.player_a)) || latest;
  }
  return latest;
}

async function completeForfeit(db: D1Database, match: MatchRow, loserUid: string) {
  const now = Date.now();
  const result = { kind:'forfeit', answer:'', explanation:'상대가 대전을 떠나 기권 처리되었습니다.', answerUid:loserUid };
  await db.prepare(`UPDATE meonjeo_matches SET status = 'complete', phase = 'complete', lives_a = CASE WHEN player_a = ?1 THEN 0 ELSE lives_a END, lives_b = CASE WHEN player_b = ?1 THEN 0 ELSE lives_b END, result_json = ?2, next_question_at = NULL, decision_version = decision_version + 1, updated_at = ?3 WHERE id = ?4 AND status = 'active'`)
    .bind(loserUid, JSON.stringify(result), now, match.id).run();
  return settleCompletedMatch(db, match);
}

async function advance(db: D1Database, match: MatchRow) {
  const now = Date.now();
  const qaMode = match.id.startsWith('qa-');
  if (match.status === 'complete') return settleCompletedMatch(db, match);
  const staleA = match.last_seen_a === 0 || now - match.last_seen_a > 15000;
  const staleB = match.last_seen_b === 0 || now - match.last_seen_b > 15000;
  if (match.phase === 'scheduled' && now > match.buzz_deadline_at) {
    const question = currentQuestion(match);
    const result = { kind: 'no_buzz', answer: question.canonicalAnswer, explanation: question.explanation };
    await db.prepare(`UPDATE meonjeo_matches SET phase = 'result', result_json = ?1, next_question_at = ?2, decision_version = decision_version + 1, updated_at = ?3 WHERE id = ?4 AND phase = 'scheduled'`)
      .bind(JSON.stringify(result), now + (qaMode ? 10 : RESULT_MS), now, match.id).run();
  } else if (match.phase === 'scheduled' && now >= match.buzz_open_at) {
    await db.prepare(`UPDATE meonjeo_matches SET phase = 'open', decision_version = decision_version + 1, updated_at = ?1 WHERE id = ?2 AND phase = 'scheduled'`).bind(now, match.id).run();
  } else if (match.phase === 'open' && now > match.buzz_deadline_at) {
    const question = currentQuestion(match);
    const result = { kind: 'no_buzz', answer: question.canonicalAnswer, explanation: question.explanation };
    await db.prepare(`UPDATE meonjeo_matches SET phase = 'result', result_json = ?1, next_question_at = ?2, decision_version = decision_version + 1, updated_at = ?3 WHERE id = ?4 AND phase = 'open'`)
      .bind(JSON.stringify(result), now + (qaMode ? 10 : RESULT_MS), now, match.id).run();
  } else if (match.phase === 'answering' && match.answer_deadline_at && now > match.answer_deadline_at) {
    const question = currentQuestion(match);
    const result = { kind: 'answer_timeout', answer: question.canonicalAnswer, explanation: question.explanation, answerUid: match.buzz_winner_uid };
    const livesA = match.player_a === match.buzz_winner_uid ? Math.max(0, match.lives_a - 1) : match.lives_a;
    const livesB = match.player_b === match.buzz_winner_uid ? Math.max(0, match.lives_b - 1) : match.lives_b;
    await db.prepare(`UPDATE meonjeo_matches SET phase = 'result', lives_a = ?1, lives_b = ?2, result_json = ?3, next_question_at = ?4, decision_version = decision_version + 1, updated_at = ?5 WHERE id = ?6 AND phase = 'answering'`)
      .bind(livesA, livesB, JSON.stringify(result), now + (qaMode ? 10 : RESULT_MS), now, match.id).run();
  } else if (match.phase === 'result' && match.next_question_at && now >= match.next_question_at) {
    const complete = match.score_a >= WIN_SCORE || match.score_b >= WIN_SCORE || match.lives_a <= 0 || match.lives_b <= 0 || match.question_index + 1 >= (qaMode ? 1 : MAX_ROUNDS);
    if (complete) {
      const completed = await db.prepare(`UPDATE meonjeo_matches SET status = 'complete', phase = 'complete', decision_version = decision_version + 1, updated_at = ?1 WHERE id = ?2 AND phase = 'result'`).bind(now, match.id).run();
      if (completed.meta.changes === 1) await applyMatchRewards(db, match);
    } else {
      const nextIndex = match.question_index + 1;
      const ids = JSON.parse(match.question_ids_json) as string[];
      const question = questionMap.get(ids[nextIndex])!;
      const startAt = now + 1800;
      await db.prepare(`UPDATE meonjeo_matches SET phase = 'scheduled', question_index = ?1, question_token = ?2, start_at = ?3, buzz_open_at = ?4, buzz_deadline_at = ?5, buzz_winner_uid = NULL, buzz_id = NULL, answer_deadline_at = NULL, result_json = NULL, next_question_at = NULL, decision_version = decision_version + 1, updated_at = ?6 WHERE id = ?7 AND phase = 'result'`)
        .bind(nextIndex, crypto.randomUUID(), startAt, startAt + 300, startAt + Math.max(6000, questionRevealDurationMs(question.questionText) + 2500), now, match.id).run();
    }
  }
  // Resolve an earned result before considering disconnect forfeits. Otherwise
  // a player reconnecting after a terminal result could reverse the winner.
  if (match.status === 'active' && now - match.created_at > 15000 && (staleA || staleB)) {
    if (staleA && staleB) {
      await db.prepare(`UPDATE meonjeo_matches SET status = 'cancelled', phase = 'cancelled', decision_version = decision_version + 1, updated_at = ?1 WHERE id = ?2 AND status = 'active'`).bind(now, match.id).run();
      return settleCompletedMatch(db, match);
    }
    return completeForfeit(db, match, staleA ? match.player_a : match.player_b);
  }
  return settleCompletedMatch(db, match);
}

function clientSnapshot(match: MatchRow, uid: string) {
  const question = currentQuestion(match);
  const isA = uid === match.player_a;
  const result = match.result_json ? JSON.parse(match.result_json) : null;
  const publicResult = result ? { ...result } : null;
  if (publicResult) {
    delete publicResult.answerId;
    delete publicResult.questionToken;
  }
  const ratingBefore = isA ? match.rating_a : match.rating_b;
  const ratingDeltaValue = isA ? match.rating_delta_a : match.rating_delta_b;
  const rankGain = isA ? match.rank_gain_a : match.rank_gain_b;
  const now = Date.now();
  const gatedQuestionText = !match.id.startsWith('qa-') && (match.phase === 'scheduled' || match.phase === 'open')
    ? Array.from(question.questionText).slice(0, revealedQuestionLength(question.questionText, Math.max(0, now - match.start_at))).join('')
    : question.questionText;
  const outcome = match.status === 'complete' ? matchOutcome(match) : null;
  return {
    serverNow: now, matchId: match.id, phase: match.phase, status: match.status,
    questionIndex: match.question_index, roundLimit: MAX_ROUNDS, questionToken: match.question_token,
    question: { text: gatedQuestionText, category: question.categoryKo },
    startAt: match.start_at, buzzOpenAt: match.buzz_open_at, buzzDeadlineAt: match.buzz_deadline_at,
    buzzWinner: match.buzz_winner_uid === uid ? 'me' : match.buzz_winner_uid ? 'opponent' : null,
    answerDeadlineAt: match.answer_deadline_at,
    answerCharacters: match.phase === 'answering' && match.buzz_winner_uid === uid ? answerCharacters(question, match, uid) : null,
    answerLength: match.phase === 'answering' && match.buzz_winner_uid === uid ? normalizedAnswerTiles(question.canonicalAnswer).length : null,
    myScore: isA ? match.score_a : match.score_b, opponentScore: isA ? match.score_b : match.score_a,
    myLives: isA ? match.lives_a : match.lives_b, opponentLives: isA ? match.lives_b : match.lives_a,
    myTitleId: isA ? match.title_a : match.title_b, opponentTitleId: isA ? match.title_b : match.title_a,
    myRating: ratingBefore, opponentRating: isA ? match.rating_b : match.rating_a,
    result: publicResult ? { ...publicResult, answerUid: publicResult.answerUid === uid ? 'me' : publicResult.answerUid ? 'opponent' : null } : null,
    outcome: outcome === null ? null : outcome === 'draw' ? 'draw' : (outcome === 'a') === isA ? 'win' : 'loss',
    reward: match.phase === 'complete' ? { ratingBefore, ratingAfter:Math.max(0,ratingBefore+ratingDeltaValue), ratingDelta:ratingDeltaValue, rankGain } : null,
    nextQuestionAt: match.next_question_at, version: match.decision_version,
  };
}

async function handleJoin(db: D1Database, uid: string, body: Record<string, unknown>) {
  const active = await findMatch(db, uid);
  if (active) return { state: 'matched', matchId: active.id };
  const source = body.localQa === true ? 'qa-local' : body.source === 'quiz_time_banner' ? 'quiz_time_banner' : 'rated';
  await db.prepare(`DELETE FROM meonjeo_match_queue WHERE joined_at < ?1`).bind(Date.now() - 30000).run();
  const claimed = await db.prepare(`DELETE FROM meonjeo_match_queue WHERE user_id = (SELECT user_id FROM meonjeo_match_queue WHERE user_id != ?1 ORDER BY joined_at LIMIT 1) RETURNING user_id, joined_at, source`).bind(uid).first<{ user_id: string; joined_at:number; source:string }>();
  const now = Date.now();
  if (claimed?.user_id) {
    await recordQuizTimeEvent(db, { eventId:`queue:${now}:${uid}`, uid, type:'quiz_time_queue_join', source });
    const created = await createMatch(db, claimed.user_id, uid, { joined_at:claimed.joined_at, source:claimed.source }, { joined_at:now, source });
    if (!created.created) {
      const claimedMatch = await findMatch(db, claimed.user_id);
      if (!claimedMatch) {
        await db.prepare(`INSERT INTO meonjeo_match_queue (user_id, joined_at, source) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET joined_at = excluded.joined_at, source = excluded.source`)
          .bind(claimed.user_id, claimed.joined_at, claimed.source).run();
      }
    }
    if (created.matchId) return { state: 'matched', matchId: created.matchId };
  }
  const newlyActive = await findMatch(db, uid);
  if (newlyActive) return { state: 'matched', matchId: newlyActive.id };
  await db.prepare(`INSERT INTO meonjeo_match_queue (user_id, joined_at, source) VALUES (?1, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET source = excluded.source`).bind(uid, now, source).run();
  const queued = await db.prepare(`SELECT joined_at, source FROM meonjeo_match_queue WHERE user_id = ?1`).bind(uid).first<{ joined_at:number; source:string }>();
  await recordQuizTimeEvent(db, { eventId:`queue:${queued?.joined_at ?? now}:${uid}`, uid, type:'quiz_time_queue_join', source:queued?.source ?? source });
  return { state: 'waiting' };
}

async function handleBuzz(db: D1Database, uid: string, body: Record<string, unknown>) {
  const matchId = String(body.matchId || ''); const buzzId = String(body.buzzId || ''); const token = String(body.questionToken || '');
  if (!matchId || !buzzId || buzzId.length > 100) return response({ error: 'invalid-buzz' }, 400);
  const prior = await db.prepare(`SELECT response_json FROM meonjeo_match_events WHERE event_id = ?1 AND match_id = ?2 AND user_id = ?3 AND event_type = 'buzz'`).bind(buzzId, matchId, uid).first<{ response_json: string }>();
  if (prior) return response(JSON.parse(prior.response_json));
  let match = await loadMatch(db, matchId, uid); if (!match) return response({ error: 'match-not-found' }, 404);
  match = await advance(db, match);
  const now = Date.now();
  const question = currentQuestion(match);
  const won = await db.prepare(`UPDATE meonjeo_matches SET phase = 'answering', buzz_winner_uid = ?1, buzz_id = ?2, answer_deadline_at = ?3, decision_version = decision_version + 1, updated_at = ?4 WHERE id = ?5 AND phase = 'open' AND question_token = ?6 AND buzz_winner_uid IS NULL AND buzz_open_at <= ?4 AND buzz_deadline_at >= ?4`)
    .bind(uid, buzzId, now + (match.id.startsWith('qa-') ? 60000 : answerTimeLimitMs(question.canonicalAnswer)), now, matchId, token).run();
  // Cosmetic title progress gets a modest network allowance; the actual buzz winner remains fully server-authoritative.
  if (won.meta.changes === 1 && now - match.buzz_open_at <= 2000) {
    await db.prepare(`INSERT INTO meonjeo_player_titles (user_id, fast_buzz_wins) VALUES (?1, 1) ON CONFLICT(user_id) DO UPDATE SET fast_buzz_wins = fast_buzz_wins + 1, updated_at = CURRENT_TIMESTAMP`).bind(uid).run();
  }
  match = (await loadMatch(db, matchId, uid))!;
  const payload = { accepted: match.buzz_id === buzzId && match.buzz_winner_uid === uid, winner: match.buzz_winner_uid === uid ? 'me' : match.buzz_winner_uid ? 'opponent' : null, snapshot: clientSnapshot(match, uid) };
  await db.prepare(`INSERT OR IGNORE INTO meonjeo_match_events (event_id, match_id, user_id, event_type, response_json, created_at) VALUES (?1, ?2, ?3, 'buzz', ?4, ?5)`).bind(buzzId, matchId, uid, JSON.stringify(payload), now).run();
  return response(payload);
}

async function handleAnswer(db: D1Database, uid: string, body: Record<string, unknown>) {
  const matchId = String(body.matchId || ''); const answerId = String(body.answerId || ''); const questionToken = String(body.questionToken || ''); const answer = String(body.answer || '').slice(0, 100);
  if (!matchId || !answerId || !questionToken) return response({ error: 'invalid-answer' }, 400);
  const prior = await db.prepare(`SELECT response_json FROM meonjeo_match_events WHERE event_id = ?1 AND match_id = ?2 AND user_id = ?3 AND event_type = 'answer'`).bind(answerId, matchId, uid).first<{ response_json: string }>();
  if (prior) return response(JSON.parse(prior.response_json));
  let match = await loadMatch(db, matchId, uid); if (!match) return response({ error: 'match-not-found' }, 404);
  match = await advance(db, match);
  if (match.question_token !== questionToken) return response({ error: 'stale-question' }, 409);
  const existingResult = match.result_json ? JSON.parse(match.result_json) as { answerId?:string; questionToken?:string; answerUid?:string } : null;
  if (existingResult?.answerId === answerId && existingResult.questionToken === questionToken && existingResult.answerUid === uid) {
    const payload = { accepted: true, snapshot: clientSnapshot(match, uid) };
    await db.prepare(`INSERT OR IGNORE INTO meonjeo_match_events (event_id, match_id, user_id, event_type, response_json, created_at) VALUES (?1, ?2, ?3, 'answer', ?4, ?5)`).bind(answerId, matchId, uid, JSON.stringify(payload), Date.now()).run();
    return response(payload);
  }
  if (match.phase !== 'answering' || match.buzz_winner_uid !== uid || !match.answer_deadline_at || Date.now() > match.answer_deadline_at) return response({ error: 'answer-closed' }, 409);
  const question = currentQuestion(match);
  const correct = [question.canonicalAnswer, ...(question.acceptedAliases || [])].some(value => normalize(value) === normalize(answer));
  const now = Date.now();
  const scoreA = match.score_a + (correct && uid === match.player_a ? 1 : 0); const scoreB = match.score_b + (correct && uid === match.player_b ? 1 : 0);
  const livesA = match.lives_a - (!correct && uid === match.player_a ? 1 : 0); const livesB = match.lives_b - (!correct && uid === match.player_b ? 1 : 0);
  const resultData = { kind: correct ? 'correct' : 'wrong', answer: question.canonicalAnswer, explanation: question.explanation, answerUid: uid, answerId, questionToken };
  const updated = await db.prepare(`UPDATE meonjeo_matches SET phase = 'result', score_a = ?1, score_b = ?2, lives_a = ?3, lives_b = ?4, result_json = ?5, next_question_at = ?6, decision_version = decision_version + 1, updated_at = ?7 WHERE id = ?8 AND phase = 'answering' AND buzz_winner_uid = ?9`)
    .bind(scoreA, scoreB, livesA, livesB, JSON.stringify(resultData), now + (match.id.startsWith('qa-') ? 10 : RESULT_MS), now, matchId, uid).run();
  if (updated.meta.changes === 1 && correct) {
    await db.prepare(`INSERT INTO meonjeo_player_titles (user_id, correct_answers, history_correct) VALUES (?1, 1, ?2) ON CONFLICT(user_id) DO UPDATE SET correct_answers = correct_answers + 1, history_correct = history_correct + excluded.history_correct, updated_at = CURRENT_TIMESTAMP`).bind(uid, question.categoryKo === '한국사' ? 1 : 0).run();
  }
  match = (await loadMatch(db, matchId, uid))!;
  const appliedResult = match.result_json ? JSON.parse(match.result_json) as { answerId?:string; questionToken?:string; answerUid?:string } : null;
  const payload = { accepted: appliedResult?.answerId === answerId && appliedResult.questionToken === questionToken && appliedResult.answerUid === uid, snapshot: clientSnapshot(match, uid) };
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
    const requestUrl = new URL(request.url); const action = requestUrl.searchParams.get('action');
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
    if (action === 'join') {
      const localQa = ['localhost','127.0.0.1'].includes(requestUrl.hostname) && request.headers.get('x-meonjeo-qa') === 'local-200';
      return response(await handleJoin(db, uid, { ...body, localQa }));
    }
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
      const queued = await db.prepare(`SELECT joined_at, source FROM meonjeo_match_queue WHERE user_id = ?1`).bind(uid).first<{ joined_at:number; source:string }>();
      await db.prepare(`DELETE FROM meonjeo_match_queue WHERE user_id = ?1`).bind(uid).run();
      if (queued) await recordQuizTimeEvent(db, { eventId:`queue-cancel:${queued.joined_at}:${uid}`, uid, type:'quiz_time_queue_cancel', source:queued.source });
      const matchId = String(body.matchId || '');
      if (matchId) {
        const match = await loadMatch(db, matchId, uid);
        if (match?.status === 'active') await completeForfeit(db, match, uid);
      }
      return response({ ok: true });
    }
    return response({ error: 'unknown-action' }, 404);
  } catch (error) {
    console.error('realtime API failed', error);
    return response({ error: 'unavailable' }, 503);
  }
}
