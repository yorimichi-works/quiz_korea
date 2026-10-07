import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../ads.js', import.meta.url), 'utf8');
const completed = (matchId, extra = {}) => ({ matchId, phase:'complete', status:'complete', result:{ kind:'correct' }, reward:{ rankGain:100 }, ...extra });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function harness({ native = true, storage = new Map(), initialPresentationState = 'idle', throws = false } = {}) {
  let now = 200000;
  let timerId = 0;
  const timers = new Map(); const sent = []; const events = new Map(); const documentEvents = new Map();
  const context = vm.createContext({
    console, Date:class extends Date { static now() { return now; } },
    document:{ hidden:false, addEventListener:(name, fn) => documentEvents.set(name, fn) }, navigator:{ onLine:true },
    localStorage:{ getItem:key => storage.get(key) || null, setItem:(key, value) => storage.set(key, value), removeItem:key => storage.delete(key) },
    CustomEvent:class { constructor(name, options) { this.type = name; this.detail = options.detail; } },
    dispatchEvent:() => {}, addEventListener:(name, fn) => events.set(name, fn),
    setTimeout:(fn, delay) => { timers.set(++timerId, { fn, at:now + delay }); return timerId; }, clearTimeout:id => timers.delete(id),
    ...(native ? { meonjeoNative:{ platform:'ios', bridgeVersion:4, documentId:'doc-a', ads:{ version:1, initialPresentationState, request:(requestId, operation, payload) => { if (throws) throw new Error('bridge unavailable'); sent.push({ requestId, operation, payload }); } } } } : {}),
  });
  vm.runInContext(source, context);
  const reply = (request, data = {}) => context.meonjeoAds.receiveNativeResult({ requestId:request.requestId, documentId:'doc-a', operation:request.operation, generation:request.payload.generation, ok:true, terminal:true, event:'complete', busy:false, presentationActive:false, ...data });
  const latest = operation => sent.filter(item => item.operation === operation).at(-1);
  async function advance(ms) {
    now += ms;
    for (const [id, timer] of [...timers]) { if (timer.at <= now) { timers.delete(id); timer.fn(); } }
    await flush();
  }
  async function results(matchId = 'm3', generation = 1) {
    context.meonjeoAds.setContext({ phase:'results', matchId, generation });
    if (latest('context')) reply(latest('context'));
    await flush();
    if (latest('status')) reply(latest('status'));
    await flush();
  }
  function recordThree() { for (let i = 1; i <= 3; i++) context.meonjeoAds.recordCompletion(completed(`m${i}`)); }
  return { context, ads:context.meonjeoAds, sent, reply, latest, advance, results, recordThree, timers, events, documentEvents, storage };
}

async function readyBoundary(h) {
  h.recordThree(); await h.results();
  let continued = 0;
  h.ads.exitCompletedMatch(completed('m3'), {}, () => continued++);
  h.reply(h.latest('eligibility'), { eligible:true }); await flush();
  return { continued:() => continued, present:h.latest('present') };
}

test('browser clients navigate directly and never request native advertising', async () => {
  const h = harness({ native:false }); await h.results(); let continued = 0;
  h.ads.exitCompletedMatch(completed('m3'), {}, () => continued++);
  assert.equal(continued, 1); assert.equal(h.sent.length, 0); assert.equal(h.ads.isBlocking(), false);
});

test('first two matches, QA, forfeit, cancelled, and incomplete results never enter an ad boundary', async () => {
  for (const [snapshot, options] of [
    [completed('m1'), {}], [completed('qa-123'), {}], [completed('m1'), { qa:true }],
    [completed('m1'), { source:'qa-local' }], [completed('m1', { result:{ kind:'forfeit' } }), {}],
    [completed('m1', { phase:'result' }), {}], [completed('m1', { phase:'cancelled' }), {}],
    [completed('m1', { reward:null }), {}],
  ]) {
    const h = harness(); await h.results(snapshot.matchId); let continued = 0;
    h.ads.exitCompletedMatch(snapshot, options, () => continued++);
    assert.equal(continued, 1); assert.equal(h.latest('eligibility'), undefined);
  }
  const h = harness(); await h.results('m2'); h.ads.recordCompletion(completed('m1'));
  h.ads.exitCompletedMatch(completed('m2'), {}, () => {});
  assert.equal(h.latest('eligibility'), undefined);
});

test('double tapping the settled result requests one ad and continues exactly once after dismissal', async () => {
  const h = harness(); const boundary = await readyBoundary(h);
  h.ads.exitCompletedMatch(completed('m3'), {}, () => assert.fail('duplicate continuation'));
  assert.equal(h.sent.filter(item => item.operation === 'present').length, 1);
  h.reply(boundary.present, { terminal:false, event:'presenting', busy:true, presentationActive:true });
  assert.equal(boundary.continued(), 0); assert.equal(h.ads.isBlocking(), true);
  h.reply(boundary.present, { event:'dismissed' }); await flush();
  h.reply(boundary.present, { event:'dismissed' }); await flush();
  assert.equal(boundary.continued(), 1); assert.equal(h.ads.isBlocking(), false);
});

test('wrong document, wrong generation, and stale request callbacks cannot release presentation', async () => {
  const h = harness(); const boundary = await readyBoundary(h);
  h.reply(boundary.present, { documentId:'other-document', event:'dismissed' });
  h.reply(boundary.present, { generation:0, event:'dismissed' });
  h.reply(boundary.present, { requestId:'stale-request', event:'dismissed' });
  await flush(); assert.equal(boundary.continued(), 0); assert.equal(h.ads.isBlocking(), true);
  h.reply(boundary.present, { event:'dismissed' }); await flush(); assert.equal(boundary.continued(), 1);
});

test('not-ready, offline, disabled consent, and a late eligibility response skip without later presenting', async () => {
  for (const reason of ['not-ready','consent-disabled']) {
    const h = harness(); h.recordThree(); await h.results(); let continued = 0;
    h.ads.exitCompletedMatch(completed('m3'), {}, () => continued++);
    h.reply(h.latest('eligibility'), { eligible:false, reason }); await flush();
    assert.equal(continued, 1); assert.equal(h.latest('present'), undefined);
  }
  const h = harness(); h.recordThree(); await h.results(); let continued = 0;
  h.ads.exitCompletedMatch(completed('m3'), {}, () => continued++);
  const eligibility = h.latest('eligibility'); await h.advance(1600);
  h.reply(eligibility, { eligible:true }); await flush();
  assert.equal(continued, 1); assert.equal(h.latest('present'), undefined);
  const offline = harness(); offline.recordThree(); await offline.results(); offline.context.navigator.onLine = false;
  offline.ads.exitCompletedMatch(completed('m3'), {}, () => {});
  assert.equal(offline.latest('eligibility'), undefined);
});

test('lost dismissal callback stays blocked while native still has an ad, including external click foregrounding', async () => {
  const h = harness(); const boundary = await readyBoundary(h);
  h.reply(boundary.present, { terminal:false, event:'presenting', busy:true, presentationActive:true });
  h.context.document.hidden = true; h.documentEvents.get('visibilitychange')();
  await h.advance(46000); assert.equal(boundary.continued(), 0);
  h.context.document.hidden = false; h.documentEvents.get('visibilitychange')(); await flush();
  h.reply(h.latest('status'), { busy:true, presentationActive:true }); await flush();
  assert.equal(h.ads.isBlocking(), true); assert.equal(boundary.continued(), 0);
  await h.advance(1500); h.reply(h.latest('status')); await flush();
  assert.equal(boundary.continued(), 1); assert.equal(h.ads.isBlocking(), false);
  h.reply(boundary.present, { event:'dismissed' }); await flush(); assert.equal(boundary.continued(), 1);
});

test('a newly loaded document checks native presentation before permitting play', async () => {
  const h = harness();
  assert.equal(h.ads.isBlocking(), true);
  h.ads.setContext({ phase:'menu', generation:1 });
  h.reply(h.latest('context')); await flush();
  h.reply(h.latest('status'), { busy:true, presentationActive:true }); await flush();
  assert.equal(h.ads.isBlocking(), true);
  await h.advance(1500); h.reply(h.latest('status')); await flush(); assert.equal(h.ads.isBlocking(), false);
});

test('new navigation prevents an old result continuation, and visible consent holds the play lock', async () => {
  const h = harness(); const boundary = await readyBoundary(h);
  h.ads.setContext({ phase:'menu', generation:2 });
  h.reply(h.latest('context')); await flush();
  h.reply(boundary.present, { event:'dismissed' }); await flush();
  assert.equal(boundary.continued(), 0);
  const p = harness(); p.ads.setContext({ phase:'menu', generation:1 }); p.reply(p.latest('context')); await flush(); p.reply(p.latest('status')); await flush();
  const preparing = p.ads.prepare(); await flush(); p.reply(p.latest('status')); await flush(); assert.equal(p.ads.isBlocking(), true);
  await p.advance(46000); p.reply(p.latest('status'), { busy:true, presentationActive:false }); await flush();
  assert.equal(p.ads.isBlocking(), true);
  await p.advance(1500); p.reply(p.latest('status')); await flush(); await preparing;
  assert.equal(p.ads.isBlocking(), false);
});

test('cooldown and three-match frequency survive document reload; duplicate matches do not count twice', async () => {
  const h = harness(); const boundary = await readyBoundary(h);
  h.reply(boundary.present, { terminal:false, event:'presenting', busy:true, presentationActive:true });
  h.reply(boundary.present, { event:'dismissed' }); await flush();
  for (let i = 0; i < 5; i++) h.ads.recordCompletion(completed('m4'));
  await h.results('m4', 2); h.ads.exitCompletedMatch(completed('m4'), {}, () => {});
  assert.equal(h.sent.filter(item => item.operation === 'present').length, 1);
  const reloaded = harness({ storage:h.storage });
  for (const id of ['m5','m6']) reloaded.ads.recordCompletion(completed(id));
  await reloaded.results('m6'); reloaded.ads.exitCompletedMatch(completed('m6'), {}, () => {});
  assert.equal(reloaded.latest('eligibility'), undefined, 'cooldown persists');
  await reloaded.advance(180001); await reloaded.results('m7', 2);
  reloaded.ads.exitCompletedMatch(completed('m7'), {}, () => {});
  assert.ok(reloaded.latest('eligibility'));
});

test('shipping entry points load ads before the game and retain byte-identical script mirrors', () => {
  assert.equal(source, readFileSync(new URL('../public/ads.js', import.meta.url), 'utf8'));
  assert.equal(readFileSync(new URL('../app.js', import.meta.url), 'utf8'), readFileSync(new URL('../public/app.js', import.meta.url), 'utf8'));
  for (const path of ['index.html','public/game.html']) {
    const html = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.ok(html.indexOf('ads.js?v=1') < html.indexOf('app.js?v=17'));
  }
});

test('restoring a page from the back-forward cache waits for native idle before one Home continuation', async () => {
  const h = harness(); const boundary = await readyBoundary(h);
  h.events.get('pagehide')();
  h.reply(boundary.present, { event:'dismissed' }); await flush();
  assert.equal(boundary.continued(), 0);
  h.events.get('pageshow')(); await flush();
  h.reply(h.latest('status'), { busy:true, presentationActive:true }); await flush();
  assert.equal(boundary.continued(), 0);
  await h.advance(1500); h.reply(h.latest('status')); await flush();
  assert.equal(boundary.continued(), 1); assert.equal(h.ads.isBlocking(), false);
});

test('a lost presentation-start callback still consumes the conservative frequency budget', async () => {
  const h = harness(); const boundary = await readyBoundary(h);
  h.reply(boundary.present, { event:'dismissed' }); await flush();
  await h.advance(180001); await h.results('m4', 2);
  h.ads.exitCompletedMatch(completed('m4'), {}, () => {});
  assert.equal(h.sent.filter(item => item.operation === 'present').length, 1);
  assert.equal(h.sent.filter(item => item.operation === 'eligibility').length, 1);
});

test('a clean bootstrap with a throwing or silent bridge disables ads, enables play, and never sends prepare', async () => {
  for (const throws of [true,false]) {
    const h = harness({ throws, initialPresentationState:'idle' });
    h.ads.setContext({ phase:'menu', generation:1 });
    const preparing = h.ads.prepare();
    await flush(); await h.advance(1600); await preparing;
    assert.equal(h.ads.isBlocking(), false);
    assert.equal(h.ads.recoveryState().advertisingDisabled, true);
    assert.equal(h.latest('prepare'), undefined);
    h.ads.setContext({ phase:'menu', generation:2 }); await h.ads.prepare();
    h.documentEvents.get('visibilitychange')(); h.events.get('pageshow')();
    assert.equal(h.latest('prepare'), undefined, 'fallback is permanent for this document');
  }
});

test('a successful read-only context and idle status handshake precedes every initial prepare', async () => {
  const h = harness(); h.ads.setContext({ phase:'menu', generation:1 });
  const preparing = h.ads.prepare();
  assert.equal(h.latest('prepare'), undefined);
  h.reply(h.latest('context')); await flush(); assert.equal(h.latest('prepare'), undefined);
  h.reply(h.latest('status')); await flush(); assert.ok(h.latest('prepare'));
  h.reply(h.latest('prepare'), { canRequestAds:true }); await preparing;
  assert.equal(h.ads.isBlocking(), false);
});

test('unverified configuration, SDK unavailability, and denied ATT immediately release play without retrying consent', async () => {
  const unverified = harness(); unverified.ads.setContext({ phase:'menu', generation:1 });
  const first = unverified.ads.prepare();
  unverified.reply(unverified.latest('context')); await flush();
  unverified.reply(unverified.latest('status'), { configurationVerified:false }); await first;
  assert.equal(unverified.latest('prepare'), undefined); assert.equal(unverified.ads.isBlocking(), false);
  for (const reason of ['consent-config-unverified','sdk-unavailable','tracking-not-authorized']) {
    const h = harness(); h.ads.setContext({ phase:'menu', generation:1 }); const preparing = h.ads.prepare();
    h.reply(h.latest('context')); await flush(); h.reply(h.latest('status')); await flush();
    h.reply(h.latest('prepare'), { ok:false, reason, canRequestAds:false }); await preparing;
    assert.equal(h.ads.isBlocking(), false); assert.equal(h.ads.recoveryState().advertisingDisabled, true);
    await h.ads.prepare(); assert.equal(h.sent.filter(item => item.operation === 'prepare').length, 1);
  }
});

test('an unknown restored bootstrap cannot fail open and exposes a retryable recovery state', async () => {
  const h = harness({ initialPresentationState:'unknown' }); h.ads.setContext({ phase:'menu', generation:1 });
  await h.advance(1600);
  assert.equal(h.ads.isBlocking(), true); assert.equal(h.ads.recoveryState().recovering, true);
  assert.equal(h.ads.recoveryState().advertisingDisabled, false); assert.equal(h.latest('prepare'), undefined);
  await h.advance(1500); h.reply(h.latest('context')); await flush();
  h.reply(h.latest('status'), { busy:true, presentationActive:true }); await flush();
  assert.equal(h.ads.isBlocking(), true);
  await h.advance(1500); h.reply(h.latest('status')); await flush(); assert.equal(h.ads.isBlocking(), false);
});

test('hidden-page status timeouts ignore a late old reply and recover from a later valid status', async () => {
  const h = harness({ initialPresentationState:'unknown' }); await h.results();
  h.context.document.hidden = true; h.documentEvents.get('visibilitychange')();
  h.context.document.hidden = false; h.documentEvents.get('visibilitychange')(); await flush();
  const lost = h.latest('status'); await h.advance(1600);
  h.context.document.hidden = true; h.documentEvents.get('visibilitychange')();
  h.reply(lost); await flush(); assert.equal(h.ads.isBlocking(), true);
  h.context.document.hidden = false; h.documentEvents.get('visibilitychange')(); await flush();
  const current = h.latest('status'); assert.notEqual(current.requestId, lost.requestId);
  h.reply(current); await flush(); assert.equal(h.ads.isBlocking(), false);
});

test('cancelled preparation can retry at the next menu without repeating a denied ATT prompt', async () => {
  const h = harness(); h.ads.setContext({ phase:'menu', generation:1 }); const preparing = h.ads.prepare();
  h.reply(h.latest('context')); await flush(); h.reply(h.latest('status')); await flush();
  h.reply(h.latest('prepare'), { ok:false, reason:'background' }); await preparing;
  assert.equal(h.ads.isBlocking(), false);
  h.ads.setContext({ phase:'menu', generation:2 }); const retry = h.ads.prepare();
  h.reply(h.latest('context')); await flush(); h.reply(h.latest('status')); await flush();
  assert.equal(h.sent.filter(item => item.operation === 'prepare').length, 2);
  h.reply(h.latest('prepare'), { ok:false, reason:'tracking-not-authorized' }); await retry;
  await h.ads.prepare(); assert.equal(h.sent.filter(item => item.operation === 'prepare').length, 2);
});

test('account deletion clears persisted and in-memory match identifiers while preserving consent state', async () => {
  const h = harness(); const boundary = await readyBoundary(h);
  h.reply(boundary.present, { event:'dismissed', privacyOptionsRequired:true }); await flush();
  assert.match(h.storage.get('meonjeo.interstitial-frequency.v1'), /m3/);
  h.ads.resetLocalHistory();
  assert.equal(h.storage.has('meonjeo.interstitial-frequency.v1'), false);
  assert.equal(h.ads.privacyOptionsRequired(), true);
  await h.results('new-match', 2); h.ads.exitCompletedMatch(completed('new-match'), {}, () => {});
  const saved = JSON.parse(h.storage.get('meonjeo.interstitial-frequency.v1'));
  assert.deepEqual(saved.completed, ['new-match']); assert.equal(saved.count, 1);
  assert.equal(h.sent.filter(item => item.operation === 'present').length, 1);
});

test('observing any active native modal revokes clean-bootstrap failure fallback', async () => {
  const h = harness({ initialPresentationState:'idle' }); h.ads.setContext({ phase:'menu', generation:1 });
  h.reply(h.latest('context'), { busy:true, presentationActive:true }); await flush();
  await h.advance(1600);
  assert.equal(h.ads.isBlocking(), true); assert.equal(h.ads.recoveryState().recovering, true);
  assert.equal(h.ads.recoveryState().advertisingDisabled, false);
});

test('changing privacy choices permits a fresh safe preparation without changing match history', async () => {
  const h = harness(); h.ads.setContext({ phase:'menu', generation:1 }); const preparing = h.ads.prepare();
  h.reply(h.latest('context')); await flush(); h.reply(h.latest('status')); await flush();
  h.reply(h.latest('prepare'), { privacyOptionsRequired:true }); await preparing;
  h.ads.recordCompletion(completed('keep-match'));
  const privacy = h.ads.privacyOptions(); h.reply(h.latest('privacyOptions'), { privacyOptionsRequired:true }); await privacy;
  h.reply(h.latest('status')); await flush();
  assert.equal(h.sent.filter(item => item.operation === 'prepare').length, 2);
  h.reply(h.latest('prepare')); await flush();
  assert.equal(h.ads.isBlocking(), false);
  assert.deepEqual(JSON.parse(h.storage.get('meonjeo.interstitial-frequency.v1')).completed, ['keep-match']);
});
