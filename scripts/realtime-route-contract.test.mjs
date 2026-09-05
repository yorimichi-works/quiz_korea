import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(new URL('../app/api/realtime/route.ts', import.meta.url), 'utf8');
const client = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const publicClient = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('match creation atomically rejects players who are already active', () => {
  assert.match(route, /INSERT INTO meonjeo_matches[\s\S]*?WHERE NOT EXISTS\s*\([\s\S]*?status = 'active'/);
  assert.match(route, /player_a IN \(\?2, \?3\) OR player_b IN \(\?2, \?3\)/);
  assert.match(route, /DELETE FROM meonjeo_match_queue WHERE user_id IN \(\?1, \?2\)/);
});

test('rated snapshots disclose only the question prefix already revealed by the server clock', () => {
  assert.match(route, /!match\.id\.startsWith\('qa-'\)[\s\S]*?revealedQuestionLength/);
  assert.match(route, /question: \{ text: gatedQuestionText, category:/);
});

test('answer submissions are bound to a question token and retry id', () => {
  assert.match(route, /match\.question_token !== questionToken/);
  assert.match(route, /resultData = \{[\s\S]*?answerId, questionToken/);
  assert.match(route, /existingResult\?\.answerId === answerId[\s\S]*?existingResult\.questionToken === questionToken/);
  assert.match(client, /questionToken:snapshot\.questionToken, answerId:/);
  assert.match(client, /onlinePendingAnswer/);
});

test('terminal results settle before disconnect forfeits and retry failed rewards', () => {
  const resultTransition = route.indexOf("match.phase === 'result'");
  const disconnectCheck = route.indexOf("match.status === 'active' && now - match.created_at > 15000");
  assert.ok(resultTransition >= 0 && disconnectCheck > resultTransition);
  assert.match(route, /latest\.status === 'complete' && !latest\.rating_applied[\s\S]*?applyMatchRewards/);
  assert.match(route, /return settleCompletedMatch\(db, match\)/);
  assert.ok((route.match(/WHERE EXISTS \(SELECT 1 FROM meonjeo_matches WHERE id = \?\d+ AND rating_applied = 0\)/g) || []).length >= 2);
});

test('idempotent retries derive acceptance from authoritative match state', () => {
  assert.match(route, /match\.buzz_id === buzzId && match\.buzz_winner_uid === uid/);
  assert.match(route, /event_id = \?1 AND match_id = \?2 AND user_id = \?3 AND event_type = 'buzz'/);
  assert.match(route, /event_id = \?1 AND match_id = \?2 AND user_id = \?3 AND event_type = 'answer'/);
});

test('the client ignores snapshots that arrive out of order', () => {
  assert.match(client, /snapshot\.version < current\.version/);
  assert.match(client, /snapshot\.version === current\.version && snapshot\.serverNow < current\.serverNow/);
  assert.doesNotMatch(client, /applyOnlineSnapshot\(result\.snapshot, true\)/);
});

test('root and public clients stay byte-identical', () => {
  assert.equal(publicClient, client);
});
