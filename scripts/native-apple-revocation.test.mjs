import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const candidatePath = fileURLToPath(new URL('../auth.js', import.meta.url));
const source = readFileSync(candidatePath, 'utf8');
const sourceHash = createHash('sha256').update(source).digest('hex');
const start = source.indexOf('let lastSession =');
const end = source.indexOf('onAuthStateChanged(auth, user =>');
assert.ok(start >= 0 && end > start);
const candidateFunctions = source.slice(start, end);
const fakeCode = 'FAKE_APPLE_CODE_OFFLINE_ONLY';
const makeUser = (uid = 'fake-user-a', provider = 'apple.com') => ({ uid, isAnonymous: false, providerData: [{ providerId: provider }] });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 14; i += 1) await Promise.resolve(); };
const observe = promise => {
  const state = { status: 'pending' };
  promise.then(value => { state.status = 'fulfilled'; state.value = value; }, error => { state.status = 'rejected'; state.error = error; });
  return state;
};

function harness(options = {}) {
  const initialUser = options.user === undefined ? makeUser() : options.user;
  const auth = { currentUser: initialUser };
  const calls = { refresh: [], nativeSignIn: [], nativeRevoke: [], reauth: [], popup: [], fetch: [], delete: [], guest: [], events: [] };
  const timers = new Map();
  let timerId = 0;
  const native = {
    platform: 'ios', bridgeVersion: options.bridgeVersion ?? 3,
    signInWithApple: requestId => { calls.nativeSignIn.push(requestId); },
    revokeAppleToken: (requestId, idToken, authorizationCode) => {
      calls.nativeRevoke.push({ requestId, idToken, authorizationCode });
      if (options.bridgeError) throw options.bridgeError;
    },
  };
  if (options.noRevokeMethod) delete native.revokeAppleToken;
  const context = vm.createContext({
    auth,
    googleProvider: { providerId: 'google.com' },
    appleProvider: { credential: value => value },
    meonjeoNative: native,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    dispatchEvent: event => { calls.events.push(event.detail); return true; },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    getIdToken: async (user, force) => {
      calls.refresh.push({ user, force });
      if (options.getToken) return options.getToken(user, force, calls.refresh.length, auth);
      return `FAKE_FIREBASE_ID_TOKEN_${user.uid}_${calls.refresh.length}`;
    },
    reauthenticateWithCredential: async (user, credential) => {
      calls.reauth.push({ user, credential });
      if (options.reauth) return options.reauth(user, credential, auth);
    },
    reauthenticateWithPopup: async user => { calls.popup.push(user); },
    fetch: async (url, request) => {
      assert.equal(url, '/api/account', 'Only the expected fake account endpoint may be invoked');
      calls.fetch.push({ url, request: JSON.parse(JSON.stringify(request)) });
      if (options.fetch) return options.fetch(url, request, auth);
      return { ok: true, status: 200 };
    },
    deleteUser: async user => {
      calls.delete.push(user);
      if (options.deleteUser) return options.deleteUser(user, auth);
      if (auth.currentUser === user) auth.currentUser = null;
    },
    signInAnonymously: async () => {
      calls.guest.push(true);
      auth.currentUser = { uid: 'fake-guest', isAnonymous: true, providerData: [] };
    },
  }, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(candidateFunctions, context, { filename: candidatePath, timeout: 1000 });
  return {
    auth, initialUser, calls, timers, context,
    revoke: (...args) => context.revokeNativeAppleToken(...args),
    deleteAccount: () => context.meonjeoAuth.deleteAccount(),
    pendingId: () => vm.runInContext('nativeAppleRevocation?.requestId', context),
    complete: payload => context.meonjeoAuth.completeNativeAppleRevocation(payload),
    fail: payload => context.meonjeoAuth.failNativeAppleRevocation(payload),
    signInComplete: () => context.meonjeoAuth.completeNativeAppleSignIn({
      requestId: calls.nativeSignIn.at(-1), idToken: 'FAKE_APPLE_ID_TOKEN', rawNonce: 'FAKE_NONCE', authorizationCode: fakeCode,
    }),
    expire: delay => {
      const entry = [...timers].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `A ${delay}ms timeout exists`);
      timers.delete(entry[0]); entry[1].callback();
    },
  };
}

function noDeletion(h) {
  assert.equal(h.calls.fetch.length, 0);
  assert.equal(h.calls.delete.length, 0);
  assert.equal(h.calls.guest.length, 0);
}
async function beginAppleDelete(h) {
  const pending = h.deleteAccount();
  const state = observe(pending);
  assert.equal(h.calls.nativeSignIn.length, 1);
  h.signInComplete();
  await flush();
  assert.equal(h.calls.nativeRevoke.length, 1);
  return { pending, state, requestId: h.calls.nativeRevoke[0].requestId };
}

test('candidate identity and public callback exports', t => {
  t.diagnostic(`candidate=${candidatePath}`);
  t.diagnostic(`sha256=${sourceHash}`);
  const h = harness();
  assert.equal(typeof h.context.meonjeoAuth.completeNativeAppleRevocation, 'function');
  assert.equal(typeof h.context.meonjeoAuth.failNativeAppleRevocation, 'function');
  assert.equal(readFileSync(candidatePath.replace(/\/auth.js$/, '/public/auth.js'), 'utf8'), source);
});

test('native revocation sends fresh Firebase token and Apple code, then resolves only on matching success', async () => {
  const h = harness(); const pending = h.revoke(fakeCode); const state = observe(pending);
  assert.equal(h.calls.nativeRevoke.length, 0);
  await flush();
  assert.equal(h.calls.refresh.length, 1);
  assert.equal(h.calls.refresh[0].user, h.initialUser);
  assert.equal(h.calls.refresh[0].force, true);
  const sent = h.calls.nativeRevoke[0];
  assert.equal(sent.idToken, 'FAKE_FIREBASE_ID_TOKEN_fake-user-a_1');
  assert.equal(sent.authorizationCode, fakeCode);
  h.complete({ requestId: 'wrong-request' }); await flush();
  assert.equal(state.status, 'pending');
  h.complete({ requestId: sent.requestId }); await pending;
  assert.equal(h.timers.size, 0); noDeletion(h);
});

test('known native failure preserves only its allowed code and releases the pending request', async () => {
  const h = harness(); const pending = h.revoke(fakeCode); observe(pending); await flush();
  h.fail({ requestId: h.calls.nativeRevoke[0].requestId, code: 'auth/native-apple-revoke-invalid-request', message: 'DO_NOT_RETAIN_FAKE_SECRET' });
  await assert.rejects(pending, error => error.code === 'auth/native-apple-revoke-invalid-request' && error.message === error.code);
  assert.equal(h.timers.size, 0);
  const next = h.revoke(fakeCode); await flush(); h.complete({ requestId: h.calls.nativeRevoke[1].requestId }); await next;
});

test('unrecognized native failure code and message become a generic error', async () => {
  const h = harness(); const pending = h.revoke(fakeCode); observe(pending); await flush();
  h.fail({ requestId: h.calls.nativeRevoke[0].requestId, code: 'FAKE_SENSITIVE_PAYLOAD', message: 'DO_NOT_RETAIN' });
  await assert.rejects(pending, error => error.code === 'auth/native-apple-revoke-failed' && error.message === error.code);
});

test('timeout releases busy state and stale callbacks cannot settle the replacement request', async () => {
  const h = harness(); const first = h.revoke(fakeCode); observe(first); await flush();
  const oldId = h.calls.nativeRevoke[0].requestId;
  h.expire(60000); await assert.rejects(first, error => error.code === 'auth/native-apple-revoke-timeout');
  const second = h.revoke(fakeCode); const state = observe(second); await flush();
  const newId = h.calls.nativeRevoke[1].requestId;
  assert.notEqual(oldId, newId);
  h.complete({ requestId: oldId }); h.fail({ requestId: oldId }); await flush();
  assert.equal(state.status, 'pending');
  h.complete({ requestId: newId }); await second;
});

test('concurrent revocation rejects before a second token refresh or bridge send', async () => {
  const h = harness(); const first = h.revoke(fakeCode);
  await assert.rejects(h.revoke(fakeCode), error => error.code === 'auth/native-apple-revoke-request-in-progress');
  await flush(); assert.equal(h.calls.refresh.length, 1); assert.equal(h.calls.nativeRevoke.length, 1);
  h.complete({ requestId: h.calls.nativeRevoke[0].requestId }); await first;
});

test('matching callbacks before bridge send are ignored', async () => {
  const gate = deferred(); const h = harness({ getToken: () => gate.promise });
  const pending = h.revoke(fakeCode); const state = observe(pending); const requestId = h.pendingId();
  h.complete({ requestId }); h.fail({ requestId }); await flush();
  assert.equal(state.status, 'pending');
  gate.resolve('FAKE_REFRESHED_TOKEN'); await flush(); h.complete({ requestId }); await pending;
});

test('refresh failure propagates without bridge send and clears the timer', async () => {
  const failure = Object.assign(new Error('offline fixture'), { code: 'auth/fake-refresh' });
  const h = harness({ getToken: async () => { throw failure; } });
  await assert.rejects(h.revoke(fakeCode), error => error === failure);
  assert.equal(h.calls.nativeRevoke.length, 0); assert.equal(h.timers.size, 0);
});

test('expired request cannot send after a slow token refresh completes', async () => {
  const gate = deferred(); const h = harness({ getToken: () => gate.promise });
  const pending = h.revoke(fakeCode); observe(pending); await flush();
  h.expire(60000); await assert.rejects(pending, error => error.code === 'auth/native-apple-revoke-timeout');
  gate.resolve('FAKE_LATE_TOKEN'); await flush();
  assert.equal(h.calls.nativeRevoke.length, 0);
});

test('account switch during refresh blocks the bridge send', async () => {
  const gate = deferred(); const h = harness({ getToken: () => gate.promise });
  const pending = h.revoke(fakeCode); observe(pending); await flush();
  h.auth.currentUser = makeUser('fake-user-b'); gate.resolve('FAKE_OLD_USER_TOKEN');
  await assert.rejects(pending, error => error.code === 'auth/account-changed');
  assert.equal(h.calls.nativeRevoke.length, 0); assert.equal(h.timers.size, 0);
});

test('explicit stale user fails before token refresh', async () => {
  const h = harness();
  await assert.rejects(h.revoke(fakeCode, makeUser('fake-user-b')), error => error.code === 'auth/account-changed');
  assert.equal(h.calls.refresh.length, 0);
});

for (const token of ['', null, undefined, 123]) {
  test(`invalid refreshed token (${String(token)}) blocks native revocation`, async () => {
    const h = harness({ getToken: async () => token });
    await assert.rejects(h.revoke(fakeCode), error => error.code === 'auth/native-apple-revoke-invalid-request');
    assert.equal(h.calls.nativeRevoke.length, 0);
  });
}

test('a synchronous bridge exception rejects and releases busy state', async () => {
  const failure = new Error('offline bridge exception'); const h = harness({ bridgeError: failure });
  await assert.rejects(h.revoke(fakeCode), error => error === failure);
  assert.equal(h.timers.size, 0);
  await assert.rejects(h.revoke(fakeCode), error => error === failure);
  assert.equal(h.calls.nativeRevoke.length, 2);
});

for (const bridgeVersion of [1, 2]) {
  test(`bridge v${bridgeVersion} fails closed for both revocation and Apple deletion`, async () => {
    const h = harness({ bridgeVersion });
    await assert.rejects(h.revoke(fakeCode), error => error.code === 'auth/native-apple-revoke-unavailable');
    await assert.rejects(h.deleteAccount(), error => error.code === 'auth/native-apple-revoke-unavailable');
    assert.equal(h.calls.refresh.length, 0); assert.equal(h.calls.nativeSignIn.length, 0); noDeletion(h);
  });
}

test('v3 without a revoke method fails closed', async () => {
  const h = harness({ noRevokeMethod: true });
  await assert.rejects(h.revoke(fakeCode), error => error.code === 'auth/native-apple-revoke-unavailable');
  await assert.rejects(h.deleteAccount(), error => error.code === 'auth/native-apple-revoke-unavailable'); noDeletion(h);
});

test('missing authorization code fails before refresh', async () => {
  const h = harness();
  await assert.rejects(h.revoke(''), error => error.code === 'auth/native-apple-missing-authorization-code');
  assert.equal(h.calls.refresh.length, 0);
});

test('successful Apple deletion waits for revocation, deletes only the captured account, and returns to guest', async () => {
  const h = harness(); const { pending, requestId } = await beginAppleDelete(h);
  noDeletion(h);
  h.complete({ requestId }); assert.equal((await pending).deleted, true);
  assert.equal(h.calls.reauth[0].user, h.initialUser);
  assert.equal(h.calls.fetch.length, 1);
  assert.equal(h.calls.fetch[0].request.method, 'DELETE');
  assert.equal(h.calls.fetch[0].request.headers.Authorization, 'Bearer FAKE_FIREBASE_ID_TOKEN_fake-user-a_2');
  assert.deepEqual(h.calls.delete, [h.initialUser]);
  assert.equal(h.calls.guest.length, 1); assert.equal(h.auth.currentUser.uid, 'fake-guest');
});

test('failed native revocation prevents server DELETE and Firebase user deletion', async () => {
  const h = harness(); const { pending, requestId } = await beginAppleDelete(h);
  h.fail({ requestId }); await assert.rejects(pending, error => error.code === 'auth/native-apple-revoke-failed'); noDeletion(h);
});

test('revocation timeout prevents all account deletion effects', async () => {
  const h = harness(); const { pending } = await beginAppleDelete(h);
  h.expire(60000); await assert.rejects(pending, error => error.code === 'auth/native-apple-revoke-timeout'); noDeletion(h);
});

test('repeated delete clicks cannot launch a second deletion while the first is pending', async () => {
  const h = harness(); const { pending, requestId } = await beginAppleDelete(h);
  await assert.rejects(h.deleteAccount(), error => error.code === 'account/delete-in-progress');
  assert.equal(h.calls.nativeSignIn.length, 1); noDeletion(h);
  h.complete({ requestId }); await pending;
  assert.equal(h.calls.fetch.length, 1); assert.deepEqual(h.calls.delete, [h.initialUser]);
});

test('account switch while Apple sign-in is pending prevents reauthentication and deletion', async () => {
  const h = harness(); const pending = h.deleteAccount(); observe(pending);
  h.auth.currentUser = makeUser('fake-user-b'); h.signInComplete();
  await assert.rejects(pending, error => error.code === 'auth/account-changed');
  assert.equal(h.calls.reauth.length, 0); assert.equal(h.calls.nativeRevoke.length, 0); noDeletion(h);
});

test('account switch during reauthentication prevents native revocation and deletion', async () => {
  const gate = deferred(); const h = harness({ reauth: () => gate.promise });
  const pending = h.deleteAccount(); observe(pending); h.signInComplete(); await flush();
  h.auth.currentUser = makeUser('fake-user-b'); gate.resolve();
  await assert.rejects(pending, error => error.code === 'auth/account-changed');
  assert.equal(h.calls.nativeRevoke.length, 0); noDeletion(h);
});

test('account switch while native revocation is pending prevents server DELETE and Firebase deletion', async () => {
  const h = harness(); const { pending, requestId } = await beginAppleDelete(h);
  const otherUser = makeUser('fake-user-b'); h.auth.currentUser = otherUser;
  h.complete({ requestId }); await assert.rejects(pending, error => error.code === 'auth/account-changed');
  noDeletion(h); assert.equal(h.auth.currentUser, otherUser);
});

test('account switch during server-token refresh prevents the server DELETE', async () => {
  const gate = deferred();
  const h = harness({ getToken: (user, force, count) => count === 2 ? gate.promise : 'FAKE_REVOKE_TOKEN' });
  const { pending, requestId } = await beginAppleDelete(h); h.complete({ requestId }); await flush();
  h.auth.currentUser = makeUser('fake-user-b'); gate.resolve('FAKE_OLD_USER_TOKEN');
  await assert.rejects(pending, error => error.code === 'auth/account-changed'); noDeletion(h);
});

test('account switch during the already-started server DELETE never deletes the newly active Firebase user', async () => {
  const gate = deferred(); const h = harness({ fetch: () => gate.promise });
  const { pending, requestId } = await beginAppleDelete(h); h.complete({ requestId }); await flush();
  assert.equal(h.calls.fetch.length, 1);
  assert.match(h.calls.fetch[0].request.headers.Authorization, /fake-user-a/);
  const otherUser = makeUser('fake-user-b'); h.auth.currentUser = otherUser; gate.resolve({ ok: true, status: 200 });
  await assert.rejects(pending, error => error.code === 'auth/account-changed');
  assert.equal(h.calls.delete.length, 0); assert.equal(h.calls.guest.length, 0); assert.equal(h.auth.currentUser, otherUser);
});

test('account switch during already-started Firebase deletion cannot change its captured deletion target', async () => {
  const gate = deferred(); const h = harness({ deleteUser: () => gate.promise });
  const { pending, requestId } = await beginAppleDelete(h); h.complete({ requestId }); await flush();
  assert.deepEqual(h.calls.delete, [h.initialUser]);
  const otherUser = makeUser('fake-user-b'); h.auth.currentUser = otherUser; gate.resolve(); await pending;
  assert.deepEqual(h.calls.delete, [h.initialUser]); assert.equal(h.calls.guest.length, 0); assert.equal(h.auth.currentUser, otherUser);
});

test('server DELETE failure prevents Firebase user deletion', async () => {
  const h = harness({ fetch: async () => ({ ok: false, status: 500 }) });
  const { pending, requestId } = await beginAppleDelete(h); h.complete({ requestId });
  await assert.rejects(pending, error => error.status === 500);
  assert.equal(h.calls.delete.length, 0); assert.equal(h.calls.guest.length, 0);
});

test('reauthentication failure prevents revocation and all deletion effects', async () => {
  const failure = Object.assign(new Error('offline fixture'), { code: 'auth/fake-reauth' });
  const h = harness({ reauth: async () => { throw failure; } }); const pending = h.deleteAccount(); observe(pending);
  h.signInComplete(); await assert.rejects(pending, error => error === failure);
  assert.equal(h.calls.nativeRevoke.length, 0); noDeletion(h);
});

test('failed deletion releases the lock for a later deliberate retry', async () => {
  const h = harness(); const first = await beginAppleDelete(h); h.fail({ requestId: first.requestId });
  await assert.rejects(first.pending);
  const next = h.deleteAccount(); observe(next); assert.equal(h.calls.nativeSignIn.length, 2);
  h.signInComplete(); await flush(); h.complete({ requestId: h.calls.nativeRevoke.at(-1).requestId }); await next;
  assert.equal(h.calls.fetch.length, 1); assert.deepEqual(h.calls.delete, [h.initialUser]);
});

test('candidate files remained unchanged during offline execution', () => {
  assert.equal(createHash('sha256').update(readFileSync(candidatePath)).digest('hex'), sourceHash);
  assert.equal(readFileSync(candidatePath.replace(/\/auth.js$/, '/public/auth.js'), 'utf8'), source);
});
