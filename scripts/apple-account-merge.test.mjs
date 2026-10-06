import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { verifyFirebaseToken } from '../lib/firebase-user.ts';

// Execute the actual route after TypeScript stripping, replacing only the DB I/O
// import. Firebase's network boundary is mocked separately per test.
const dbMock = `export async function mergePlayerProgress(source, target) { return { source, target }; }
export async function readLeaderboard() {}
export async function readPlayerProgress() {}
export async function writePlayerProgress() {}`;
const dbURL = `data:text/javascript;base64,${Buffer.from(dbMock).toString('base64')}`;
let routeSource = stripTypeScriptTypes(await readFile(new URL('../app/api/progress/route.ts', import.meta.url), 'utf8'));
routeSource = routeSource.replace("'@/db/progress'", JSON.stringify(dbURL))
  .replace("'@/lib/firebase-user'", JSON.stringify(new URL('../lib/firebase-user.ts', import.meta.url).href));
const { POST } = await import(`data:text/javascript;base64,${Buffer.from(routeSource).toString('base64')}`);

function token(uid, provider, overrides = {}) {
  return `test.${Buffer.from(JSON.stringify({ aud: 'tier-online', sub: uid, firebase: { sign_in_provider: provider }, ...overrides })).toString('base64url')}.test`;
}
function identity(uid, providers = []) {
  return { localId: uid, providerUserInfo: providers.map(providerId => ({ providerId })) };
}
function mockLookup(t, users) {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(String(url), /^https:\/\/identitytoolkit\.googleapis\.com\/v1\/accounts:lookup\?/);
    assert.equal(options.method, 'POST');
    const found = users.get(JSON.parse(options.body).idToken);
    return Response.json(found ? { users: [found] } : { error: 'invalid-token' }, { status: found ? 200 : 400 });
  });
}
function request(target, source) {
  return new Request('https://example.test/api/progress?action=merge-guest', {
    method: 'POST', headers: { Authorization: `Bearer ${target}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ guestToken: source }),
  });
}
for (const provider of ['apple.com', 'google.com']) {
  test(`an existing ${provider} account can receive anonymous guest progress`, async t => {
    const target = token('target', provider); const source = token('guest', 'anonymous');
    mockLookup(t, new Map([[target, identity('target', [provider])], [source, identity('guest')]]));
    const response = await POST(request(target, source));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { progress: { source: 'guest', target: 'target' } });
  });
}
for (const provider of ['apple.com', 'google.com', 'password', 'custom']) {
  test(`a ${provider} account cannot be treated as a guest donor`, async t => {
    const target = token('target', 'apple.com'); const source = token('source', provider);
    mockLookup(t, new Map([[target, identity('target', ['apple.com'])], [source, identity('source', [provider])]]));
    const response = await POST(request(target, source));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid-guest' });
  });
}
test('a stale anonymous token for a now-linked account cannot donate progress', async t => {
  const target = token('target', 'apple.com'); const source = token('source', 'anonymous');
  mockLookup(t, new Map([[target, identity('target', ['apple.com'])], [source, identity('source', ['apple.com'])]]));
  assert.equal((await POST(request(target, source))).status, 400);
});
test('an anonymous recipient cannot receive a merge', async t => {
  const target = token('target', 'anonymous');
  mockLookup(t, new Map([[target, identity('target')]]));
  assert.equal((await POST(request(target, 'unused'))).status, 401);
});
test('a providerless token without explicit anonymous provenance is rejected as a donor', async t => {
  const target = token('target', 'apple.com'); const source = token('source', 'custom');
  mockLookup(t, new Map([[target, identity('target', ['apple.com'])], [source, identity('source')]]));
  assert.equal((await POST(request(target, source))).status, 400);
});
test('a user cannot donate progress to itself', async t => {
  const target = token('same', 'apple.com'); const source = token('same', 'anonymous');
  mockLookup(t, new Map([[target, identity('same', ['apple.com'])], [source, identity('same')]]));
  assert.equal((await POST(request(target, source))).status, 400);
});
for (const [label, overrides] of [['wrong project', { aud: 'other-project' }], ['mismatched subject', { sub: 'other-user' }]]) {
  test(`Firebase lookup success does not bypass ${label} validation`, async t => {
    const value = token('user', 'apple.com', overrides);
    mockLookup(t, new Map([[value, identity('user', ['apple.com'])]]));
    assert.equal(await verifyFirebaseToken(value), null);
  });
}
test('rejected Firebase credentials cannot receive a merge', async t => {
  mockLookup(t, new Map());
  assert.equal((await POST(request('invalid', 'invalid'))).status, 401);
});
