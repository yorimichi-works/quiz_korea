import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const origin = 'https://meonjeo.example.test';

function harness({ response = new Response('network'), offline = false, quotaFailure = false, cached = null } = {}) {
  const handlers = new Map(); const stored = []; const deleted = []; let networkCalls = 0;
  const context = vm.createContext({
    URL, Response,
    self: { location: { origin }, addEventListener: (name, callback) => handlers.set(name, callback), skipWaiting() {}, clients: { claim() {} } },
    fetch: async () => { networkCalls++; if (offline) throw new Error('offline'); return response; },
    caches: {
      open: async () => ({ addAll: async () => {}, put: async (...args) => { if (quotaFailure) throw new Error('quota'); stored.push(args); } }),
      match: async () => cached,
      keys: async () => ['meonjeo-shell-v17', 'meonjeo-shell-v18', 'unrelated-app-cache'],
      delete: async key => { deleted.push(key); return true; },
    },
  });
  vm.runInContext(source, context);
  return { handlers, stored, deleted, networkCalls: () => networkCalls };
}

function fetchEvent(h, path, options = {}) {
  let pending;
  const request = new Request(new URL(path, origin), options);
  h.handlers.get('fetch')({ request, respondWith: promise => { pending = promise; } });
  return pending;
}

test('service worker never intercepts API, auth, or authorization-bearing requests', () => {
  const h = harness();
  for (const path of ['/api/progress', '/api/progress?action=leaderboard', '/api', '/__/auth/handler']) assert.equal(fetchEvent(h, path), undefined, path);
  assert.equal(fetchEvent(h, '/game.html', { headers: { Authorization: 'Bearer test-only' } }), undefined);
  assert.equal(h.networkCalls(), 0);
  assert.equal(h.stored.length, 0);
});

test('third-party and non-GET traffic use their own network handling', () => {
  const h = harness();
  assert.equal(fetchEvent(h, 'https://www.gstatic.com/firebasejs/auth.js'), undefined);
  assert.equal(fetchEvent(h, '/api/reports', { method: 'POST', body: '{}' }), undefined);
});

test('public static resources keep their network-first cache behavior', async () => {
  const h = harness(); const response = await fetchEvent(h, '/app.js?v=16');
  assert.equal(await response.text(), 'network');
  assert.equal(h.stored.length, 1);
});

test('private, no-store and failed HTTP responses are not cached', async () => {
  for (const headers of [{ 'Cache-Control': 'private, max-age=60' }, { 'Cache-Control': 'NO-STORE' }]) {
    const h = harness({ response: new Response('private', { headers }) });
    assert.equal(await (await fetchEvent(h, '/private-view')).text(), 'private');
    assert.equal(h.stored.length, 0);
  }
  const failed = harness({ response: new Response('unavailable', { status: 503 }) });
  assert.equal((await fetchEvent(failed, '/styles.css')).status, 503);
  assert.equal(failed.stored.length, 0);
});

test('cache quota failure preserves the successful network response', async () => {
  const h = harness({ quotaFailure: true });
  assert.equal(await (await fetchEvent(h, '/app.js')).text(), 'network');
});

test('offline script misses do not receive an HTML application fallback', async () => {
  const h = harness({ offline: true });
  assert.equal((await fetchEvent(h, '/missing.js')).type, 'error');
});

test('activation removes legacy app caches and preserves unrelated caches', async () => {
  const h = harness(); let pending;
  h.handlers.get('activate')({ waitUntil: promise => { pending = promise; } });
  await pending;
  assert.deepEqual(h.deleted, ['meonjeo-shell-v17']);
});

test('entry pages and both service workers point at the revised auth shell', () => {
  assert.equal(source, readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'));
  assert.match(source, /meonjeo-shell-v18/);
  assert.match(source, /auth\.js\?v=8/);
  for (const path of ['index.html', 'public/game.html']) {
    const html = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(html, /auth\.js\?v=8/);
    assert.match(html, /app\.js\?v=16/);
    assert.match(html, /sw\.js\?v=18/);
  }
});
