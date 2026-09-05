import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/realtime/route.ts', import.meta.url), 'utf8');

function routeSql(marker) {
  const prefix = 'db.prepare(`';
  const start = route.indexOf(`${prefix}${marker}`);
  assert.notEqual(start, -1, `route SQL not found: ${marker}`);
  const sqlStart = start + prefix.length;
  const sqlEnd = route.indexOf('`)', sqlStart);
  assert.notEqual(sqlEnd, -1, `route SQL is unterminated: ${marker}`);
  return route.slice(sqlStart, sqlEnd);
}

const progressSql = routeSql('INSERT INTO meonjeo_player_progress (user_id, rating');
const titlesSql = routeSql('INSERT INTO meonjeo_player_titles (user_id, matches');
const matchCasSql = routeSql('UPDATE meonjeo_matches SET rating_applied = 1');

function createDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE meonjeo_matches (
      id TEXT PRIMARY KEY,
      rating_applied INTEGER NOT NULL DEFAULT 0,
      rating_delta_a INTEGER NOT NULL DEFAULT 0,
      rating_delta_b INTEGER NOT NULL DEFAULT 0,
      rank_gain_a INTEGER NOT NULL DEFAULT 0,
      rank_gain_b INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE meonjeo_player_progress (
      user_id TEXT PRIMARY KEY,
      rating INTEGER NOT NULL,
      rank_points INTEGER NOT NULL,
      profile_updated_at INTEGER NOT NULL,
      match_history_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE meonjeo_player_titles (
      user_id TEXT PRIMARY KEY,
      matches INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      quiz_time_matches INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.prepare('INSERT INTO meonjeo_matches (id) VALUES (?)').run('match-1');
  db.prepare('INSERT INTO meonjeo_player_progress (user_id, rating, rank_points, profile_updated_at, match_history_json) VALUES (?, ?, ?, ?, ?)')
    .run('a', 1248, 10, 1, JSON.stringify([{ matchId: 'older-a' }]));
  db.prepare('INSERT INTO meonjeo_player_progress (user_id, rating, rank_points, profile_updated_at, match_history_json) VALUES (?, ?, ?, ?, ?)')
    .run('b', 1248, 20, 1, JSON.stringify([{ matchId: 'older-b' }]));
  db.prepare('INSERT INTO meonjeo_player_titles (user_id, matches, wins, current_streak, best_streak, quiz_time_matches) VALUES (?, ?, ?, ?, ?, ?)')
    .run('a', 4, 2, 1, 2, 3);
  db.prepare('INSERT INTO meonjeo_player_titles (user_id, matches, wins, current_streak, best_streak, quiz_time_matches) VALUES (?, ?, ?, ?, ?, ?)')
    .run('b', 7, 4, 3, 4, 1);
  return db;
}

function staleTerminalMatch() {
  return {
    id: 'match-1',
    rating_applied: 0,
    player_a: 'a',
    player_b: 'b',
    score_a: 5,
    score_b: 3,
    rating_a: 1248,
    rating_b: 1248,
    source_a: 'quiz_time_banner',
    source_b: 'rated',
  };
}

function applySettlementTransaction(db, match, { failAfterFirstPlayer = false } = {}) {
  if (match.rating_applied) return;
  const players = [
    { uid: match.player_a, score: match.score_a, opponentScore: match.score_b, opponentRating: match.rating_b, delta: 16, rankGain: 12, won: true, quizTimeMatch: 1 },
    { uid: match.player_b, score: match.score_b, opponentScore: match.score_a, opponentRating: match.rating_a, delta: -16, rankGain: 3, won: false, quizTimeMatch: 0 },
  ];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const [index, player] of players.entries()) {
      const row = db.prepare('SELECT rating, rank_points, match_history_json FROM meonjeo_player_progress WHERE user_id = ?').get(player.uid);
      const history = JSON.parse(row?.match_history_json || '[]');
      const item = { matchId: match.id, opponentRating: player.opponentRating, result: player.won ? 'win' : 'loss', score: player.score, opponentScore: player.opponentScore };
      const mergedHistory = [item, ...history.filter(entry => entry?.matchId !== match.id)].slice(0, 30);
      db.prepare(progressSql).run(player.uid, row.rating + player.delta, row.rank_points + player.rankGain, 2, JSON.stringify(mergedHistory), match.id);
      db.prepare(titlesSql).run(player.uid, player.won ? 1 : 0, player.quizTimeMatch, match.id);
      if (failAfterFirstPlayer && index === 0) throw new Error('simulated settlement interruption');
    }
    db.prepare(matchCasSql).run(16, -16, 12, 3, match.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

test('the route settlement SQL applies a stale terminal snapshot only once', () => {
  const db = createDatabase();
  try {
    const staleMatch = staleTerminalMatch();
    applySettlementTransaction(db, staleMatch);
    applySettlementTransaction(db, staleMatch);

    const match = db.prepare('SELECT * FROM meonjeo_matches WHERE id = ?').get(staleMatch.id);
    assert.deepEqual(
      [match.rating_applied, match.rating_delta_a, match.rating_delta_b, match.rank_gain_a, match.rank_gain_b],
      [1, 16, -16, 12, 3],
    );

    const progressA = db.prepare('SELECT * FROM meonjeo_player_progress WHERE user_id = ?').get('a');
    const progressB = db.prepare('SELECT * FROM meonjeo_player_progress WHERE user_id = ?').get('b');
    assert.deepEqual([progressA.rating, progressA.rank_points], [1264, 22]);
    assert.deepEqual([progressB.rating, progressB.rank_points], [1232, 23]);
    assert.deepEqual(JSON.parse(progressA.match_history_json).map(item => item.matchId), ['match-1', 'older-a']);
    assert.deepEqual(JSON.parse(progressB.match_history_json).map(item => item.matchId), ['match-1', 'older-b']);

    const titlesA = db.prepare('SELECT * FROM meonjeo_player_titles WHERE user_id = ?').get('a');
    const titlesB = db.prepare('SELECT * FROM meonjeo_player_titles WHERE user_id = ?').get('b');
    assert.deepEqual([titlesA.matches, titlesA.wins, titlesA.current_streak, titlesA.best_streak, titlesA.quiz_time_matches], [5, 3, 2, 2, 4]);
    assert.deepEqual([titlesB.matches, titlesB.wins, titlesB.current_streak, titlesB.best_streak, titlesB.quiz_time_matches], [8, 4, 0, 4, 1]);
  } finally {
    db.close();
  }
});

test('an interrupted settlement rolls back completely and succeeds on retry', () => {
  const db = createDatabase();
  try {
    const staleMatch = staleTerminalMatch();
    assert.throws(
      () => applySettlementTransaction(db, staleMatch, { failAfterFirstPlayer: true }),
      /simulated settlement interruption/,
    );
    assert.equal(db.prepare('SELECT rating_applied FROM meonjeo_matches WHERE id = ?').get(staleMatch.id).rating_applied, 0);
    assert.deepEqual(
      { ...db.prepare('SELECT rating, rank_points, match_history_json FROM meonjeo_player_progress WHERE user_id = ?').get('a') },
      { rating: 1248, rank_points: 10, match_history_json: JSON.stringify([{ matchId: 'older-a' }]) },
    );
    assert.deepEqual(
      { ...db.prepare('SELECT matches, wins, current_streak, best_streak, quiz_time_matches FROM meonjeo_player_titles WHERE user_id = ?').get('a') },
      { matches: 4, wins: 2, current_streak: 1, best_streak: 2, quiz_time_matches: 3 },
    );

    applySettlementTransaction(db, staleMatch);
    assert.equal(db.prepare('SELECT rating_applied FROM meonjeo_matches WHERE id = ?').get(staleMatch.id).rating_applied, 1);
    assert.equal(db.prepare('SELECT rating FROM meonjeo_player_progress WHERE user_id = ?').get('a').rating, 1264);
    assert.equal(db.prepare('SELECT matches FROM meonjeo_player_titles WHERE user_id = ?').get('a').matches, 5);
  } finally {
    db.close();
  }
});
