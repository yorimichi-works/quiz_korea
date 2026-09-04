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
  assert.match(client, /questionToken:snapshot\.questionToken, answerId:/);
  assert.match(client, /onlinePendingAnswer/);
});

test('root and public clients stay byte-identical', () => {
  assert.equal(publicClient, client);
});
