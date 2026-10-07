import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../auth.js', import.meta.url), 'utf8');
const requestSource = source.slice(source.indexOf('function isNativeIOS()'), source.indexOf('function firebaseAppleCredential('));

function harness({ bridgeVersion = 2, throws = false } = {}) {
  const sent = [];
  const timers = new Map();
  let timerId = 0;
  const context = vm.createContext({
    meonjeoNative: {
      platform: 'ios', bridgeVersion,
      signInWithApple: id => { if (throws) throw new Error('bridge unavailable'); sent.push(id); },
    },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(`let nativeAppleRequest = null; let nativeAppleRequestCounter = 0; ${requestSource}`, context);
  return { context, sent, timers, complete: (requestId, extra = {}) => context.completeNativeAppleSignIn({ requestId, idToken: 'fake-test-token', rawNonce: 'fake-test-nonce', ...extra }) };
}

test('Apple completion settles the matching request and clears its timeout', async () => {
  const h = harness(); const pending = h.context.requestNativeAppleCredential();
  h.complete(h.sent[0]);
  assert.equal((await pending).requestId, h.sent[0]);
  assert.equal(h.timers.size, 0);
});

test('repeated Apple button clicks do not send a second native request', async () => {
  const h = harness(); const pending = h.context.requestNativeAppleCredential();
  await assert.rejects(h.context.requestNativeAppleCredential(), error => error.code === 'auth/native-apple-request-in-progress');
  assert.equal(h.sent.length, 1);
  h.complete(h.sent[0]); await pending;
});

test('a timed-out callback cannot complete or cancel a later Apple request', async () => {
  const h = harness(); const first = h.context.requestNativeAppleCredential();
  const rejected = assert.rejects(first, error => error.code === 'auth/native-apple-timeout');
  const timeout = [...h.timers.values()][0]; h.timers.clear(); timeout(); await rejected;
  const second = h.context.requestNativeAppleCredential(); let settled = false;
  second.then(() => { settled = true; }, () => { settled = true; });
  assert.notEqual(h.sent[0], h.sent[1]);
  h.complete(h.sent[0]);
  h.context.failNativeAppleSignIn({ requestId: h.sent[0], code: 'auth/native-apple-cancelled' });
  await Promise.resolve(); assert.equal(settled, false);
  h.complete(h.sent[1]); assert.equal((await second).requestId, h.sent[1]);
});

test('Apple cancellation allows the next request to start normally', async () => {
  const h = harness(); const pending = h.context.requestNativeAppleCredential();
  const rejected = assert.rejects(pending, error => error.code === 'auth/native-apple-cancelled');
  h.context.failNativeAppleSignIn({ requestId: h.sent[0], code: 'auth/native-apple-cancelled' }); await rejected;
  assert.equal(h.timers.size, 0);
  const next = h.context.requestNativeAppleCredential(); h.complete(h.sent[1]); await next;
});

test('a malformed matching credential fails without leaving the request busy', async () => {
  const h = harness(); const pending = h.context.requestNativeAppleCredential();
  const rejected = assert.rejects(pending, error => error.code === 'auth/native-apple-invalid-credential');
  h.complete(h.sent[0], { rawNonce: '' }); await rejected;
  assert.equal(h.timers.size, 0);
});

test('an older native bridge remains compatible with web auth updates', async () => {
  const h = harness({ bridgeVersion: 1 }); const pending = h.context.requestNativeAppleCredential();
  h.complete(undefined); assert.equal((await pending).idToken, 'fake-test-token');
});

test('a synchronous bridge failure clears the pending request and timeout', async () => {
  const h = harness({ throws: true });
  await assert.rejects(h.context.requestNativeAppleCredential(), /bridge unavailable/);
  assert.equal(h.timers.size, 0);
  await assert.rejects(h.context.requestNativeAppleCredential(), /bridge unavailable/);
});

test('v4 native callbacks are tied to the active controller and trusted destination', () => {
  const swift = readFileSync(new URL('../ios/Meonjeo/NativeBridge.swift', import.meta.url), 'utf8');
  assert.match(swift, /bridgeVersion: 4/);
  assert.match(swift, /guard authorizationController == nil/);
  assert.equal(swift.match(/guard controller === authorizationController/g)?.length, 2);
  assert.match(swift, /webView\.url\?\.host\?\.lowercased\(\) == Self\.allowedHost/);
  assert.match(swift, /webView\.url\?\.scheme\?\.lowercased\(\) == "https"/);
});

test('native loading failures offer retry and intentional cancellations are ignored', () => {
  const swift = readFileSync(new URL('../ios/Meonjeo/GameWebView.swift', import.meta.url), 'utf8');
  const content = readFileSync(new URL('../ios/Meonjeo/ContentView.swift', import.meta.url), 'utf8');
  assert.match(swift, /NSURLErrorDomain.*NSURLErrorCancelled/);
  assert.match(swift, /webViewWebContentProcessDidTerminate/);
  assert.match(swift, /lastReloadRequest != reloadRequest/);
  assert.match(content, /Button\("다시 시도"\)/);
  assert.match(content, /reloadRequest \+= 1/);
});
