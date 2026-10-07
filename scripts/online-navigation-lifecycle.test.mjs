import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const complete = (extra = {}) => ({ matchId:'live-1', phase:'complete', status:'complete', version:9, serverNow:1000, myScore:5, opponentScore:2, myLives:4, opponentLives:3, outcome:'win', result:{ kind:'correct' }, reward:{ ratingBefore:1248, ratingAfter:1266, ratingDelta:18, rankGain:100 }, ...extra });

function harness({ realtime = {}, storage = new Map(), blocked = false } = {}) {
  const elements = new Map(); const timers = new Map(); const events = new Map(); const boundaries = []; const records = []; const leaves = [];
  let timerId = 0;
  class Element {
    constructor(id = '') { this.id = id; this.disabled = false; this.hidden = false; this.dataset = {}; this.style = {}; this.listeners = new Map(); this.classList = { add() {}, remove() {}, contains:() => false }; }
    set innerHTML(value) {
      this.html = value;
      if (this.id !== 'app') return;
      for (const [id] of elements) if (!['app','settings','top-profile'].includes(id)) elements.delete(id);
      for (const match of value.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) { const element = new Element(match[1]); element.disabled = /\sdisabled(?:\s|>)/.test(match[0]); elements.set(match[1], element); }
      this.candidates = [...value.matchAll(/<button class="candidate"[^>]*data-index="([^"]+)" data-char="([^"]+)"[^>]*>/g)].map(match => { const element = new Element(); element.dataset = { index:match[1], char:match[2] }; element.disabled = true; return element; });
    }
    get innerHTML() { return this.html || ''; }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    insertAdjacentHTML() {}
  }
  for (const id of ['app','settings','top-profile']) elements.set(id, new Element(id));
  const ads = { setContext() {}, recordCompletion:(...args) => records.push(args), exitCompletedMatch:(...args) => boundaries.push(args), isBlocking:() => blocked, prepare() {}, privacyOptionsRequired:() => false };
  const context = vm.createContext({
    console, URLSearchParams, Uint32Array, Date, performance:{ now:() => 1000 }, crypto:{ randomUUID:() => 'request-1' },
    document:{ querySelector:selector => selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null, querySelectorAll:selector => selector === '.candidate' ? elements.get('app').candidates || [] : [], documentElement:{}, hidden:false, addEventListener:(name, fn) => events.set(name, fn), createElement:() => new Element(), body:{ appendChild() {} } },
    location:{ hostname:'meonjeo.syamo.chatgpt.site', search:'', pathname:'/game.html' }, navigator:{ onLine:true },
    localStorage:{ getItem:key => storage.get(key) || null, setItem:(key, value) => storage.set(key, value), removeItem:key => storage.delete(key) },
    sessionStorage:{ getItem:() => 'seen', setItem() {} },
    Audio:class { play() { return Promise.resolve(); } },
    setTimeout:(fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout:id => timers.delete(id),
    setInterval:(fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; }, clearInterval:id => timers.delete(id),
    addEventListener:(name, fn) => events.set(name, fn), meonjeoAds:ads,
    meonjeoRealtime:{ syncClock:async () => ({ offsetMs:0, medianRttMs:10 }), leave:async id => leaves.push(id), ...realtime },
  });
  context.window = context;
  vm.runInContext(source.replace(/bootstrap\(\);\s*$/, `globalThis.testApp = { state, home, onlineMatching, cancelOnlineMatching, pollMatchmaking, pollOnlineSnapshot, applyOnlineSnapshot, renderOnlineComplete, submitOnlineBuzz, renderOnlineAnswer, leaveOnlineMatch, matching, startFriendMatch, clearLocalAccountData };`), context);
  const api = context.testApp;
  function live(matchId = 'live-1') { Object.assign(api.state, { phase:'online-match', onlineMatchId:matchId, navigationGeneration:1, onlineSnapshot:null }); }
  return { context, api, elements, timers, events, boundaries, records, leaves, storage, ads, live, block:flag => { blocked = flag; } };
}

test('a completed snapshot stops polling, retires its match id, and freezes its settled result', async () => {
  const snapshot = complete(); const h = harness({ realtime:{ snapshot:async () => ({ snapshot }) } }); h.live();
  await h.api.pollOnlineSnapshot();
  assert.equal(h.api.state.phase, 'online-complete'); assert.equal(h.api.state.onlineMatchId, null);
  assert.equal(h.api.state.rankPoints, 100); assert.equal(h.api.state.rating, 1266);
  assert.equal([...h.timers.values()].filter(timer => [100,150,250,1000].includes(timer.delay)).length, 0);
  assert.ok(Object.isFrozen(h.api.state.onlineCompletedSnapshot)); assert.ok(Object.isFrozen(h.api.state.onlineCompletedSnapshot.reward));
  snapshot.reward.rankGain = 9999; assert.equal(h.api.state.onlineCompletedSnapshot.reward.rankGain, 100);
  h.api.applyOnlineSnapshot(complete({ version:10 })); h.api.renderOnlineComplete(complete({ version:11 }));
  assert.equal(h.api.state.rankPoints, 100); assert.equal(h.records.length, 1);
});

test('completed reward fallback is not applied again after a reload and a zero rating is preserved', () => {
  const h = harness(); h.live(); h.api.applyOnlineSnapshot(complete({ reward:{ ratingBefore:10, ratingAfter:0, ratingDelta:-10, rankGain:100 } }));
  assert.equal(h.api.state.rating, 0);
  const reloaded = harness({ storage:h.storage }); reloaded.live(); reloaded.api.applyOnlineSnapshot(complete());
  assert.equal(reloaded.api.state.rankPoints, 100);
});

test('a snapshot resolving after leaving cannot recreate a result, award points, or schedule polling', async () => {
  const pending = deferred(); const h = harness({ realtime:{ snapshot:() => pending.promise } }); h.live();
  const polling = h.api.pollOnlineSnapshot(); h.api.home(); const generation = h.api.state.navigationGeneration;
  pending.resolve({ snapshot:complete() }); await polling;
  assert.equal(h.api.state.phase, 'home'); assert.equal(h.api.state.navigationGeneration, generation);
  assert.equal(h.api.state.rankPoints, 0); assert.equal(h.records.length, 0); assert.equal(h.boundaries.length, 0);
  assert.equal([...h.timers.values()].filter(timer => timer.delay === 100).length, 0);
});

test('cancelling during clock setup prevents a subsequent join and handles stale setup errors', async () => {
  for (const shouldReject of [false,true]) {
    const clock = deferred(); let joins = 0;
    const h = harness({ realtime:{ syncClock:() => clock.promise, join:async () => { joins++; return {}; } } });
    const matching = h.api.onlineMatching(); await h.api.cancelOnlineMatching();
    if (shouldReject) clock.reject(new Error('late network failure')); else clock.resolve({ offsetMs:0, medianRttMs:10 });
    await matching;
    assert.equal(joins, 0); assert.equal(h.api.state.phase, 'home'); assert.deepEqual(h.leaves, [null]);
  }
});

test('cancellation waits for an in-flight join and leaves its matched id exactly once before another game', async () => {
  const join = deferred(); let joins = 0;
  const h = harness({ realtime:{ join:() => { joins++; return join.promise; } } });
  const matching = h.api.onlineMatching(); await flush();
  const cancelling = h.api.cancelOnlineMatching();
  await h.api.onlineMatching(); assert.equal(joins, 1); assert.equal(h.api.state.onlineLeaving, true);
  join.resolve({ state:'matched', matchId:'late-match' }); await matching; await cancelling;
  assert.deepEqual(h.leaves, ['late-match']); assert.equal(h.api.state.phase, 'home'); assert.equal(h.records.length, 0);
});

test('native ad or consent presentation prevents all live, QA, and friend-match starts', async () => {
  let joins = 0; let clocks = 0;
  const h = harness({ blocked:true, realtime:{ join:async () => { joins++; }, syncClock:async () => { clocks++; } } });
  await h.api.onlineMatching(); h.api.matching(); h.api.startFriendMatch('1234');
  assert.equal(joins, 0); assert.equal(clocks, 0); assert.equal(h.api.state.phase, 'home');
  h.api.state.phase = 'online-matching'; await h.api.pollMatchmaking(); assert.equal(joins, 0);
});

test('result Home double taps create one boundary and an old completion cannot replace newer navigation', () => {
  const h = harness(); h.live(); h.api.applyOnlineSnapshot(complete());
  const button = h.elements.get('online-home'); button.onclick(); button.onclick();
  assert.equal(h.boundaries.length, 1); assert.equal(button.disabled, true); assert.equal(h.api.state.phase, 'online-complete');
  const continueHome = h.boundaries[0][2]; h.api.home(); const generation = h.api.state.navigationGeneration;
  continueHome(); assert.equal(h.api.state.navigationGeneration, generation); assert.equal(h.api.state.rankPoints, 100);
});

test('forfeiting leaves once, never creates an advertising boundary, and stale buzz callbacks cannot revive play', async () => {
  const buzz = deferred(); const h = harness({ realtime:{ buzz:() => buzz.promise } }); h.live();
  h.api.state.onlineSnapshot = { matchId:'live-1', questionToken:'q1' };
  h.elements.set('online-buzz', { disabled:false, classList:{ add() {}, remove() {} } });
  const buzzing = h.api.submitOnlineBuzz({ preventDefault() {} });
  await h.api.leaveOnlineMatch(); await h.api.leaveOnlineMatch();
  buzz.resolve({ snapshot:complete() }); await buzzing;
  assert.deepEqual(h.leaves, ['live-1']); assert.equal(h.api.state.phase, 'home'); assert.equal(h.api.state.rankPoints, 0); assert.equal(h.boundaries.length, 0);
});

test('late answer callbacks cannot change a terminal result or reapply its rewards', async () => {
  const answer = deferred(); const h = harness({ realtime:{ answer:() => answer.promise } }); h.live();
  const answering = { matchId:'live-1', phase:'answering', questionToken:'q1', buzzWinner:'me', answerCharacters:['A'], answerDeadlineAt:Date.now() + 5000 };
  h.api.state.onlineSnapshot = answering; h.api.renderOnlineAnswer(answering);
  const candidate = h.elements.get('app').candidates[0]; candidate.disabled = false; const submitting = candidate.onclick();
  h.api.applyOnlineSnapshot(complete());
  answer.resolve({ snapshot:complete({ version:10 }) }); await submitting;
  assert.equal(h.api.state.phase, 'online-complete'); assert.equal(h.api.state.rankPoints, 100); assert.equal(h.records.length, 1);
});

test('foreground reconciliation resumes a pending queue start without joining behind native UI', async () => {
  const clock = deferred(); let joins = 0;
  const h = harness({ realtime:{ syncClock:() => clock.promise, join:async () => { joins++; return { state:'waiting' }; } } });
  const matching = h.api.onlineMatching(); h.block(true);
  clock.resolve({ offsetMs:0, medianRttMs:10 }); await matching;
  assert.equal(joins, 0); assert.equal(h.api.state.phase, 'online-matching');
  h.block(false); h.events.get('meonjeo-ads-change')(); await flush();
  assert.equal(joins, 1);
});

test('a match assigned by an already-started join is retained across background status reconciliation', async () => {
  const join = deferred(); const snapshot = deferred();
  const h = harness({ realtime:{ join:() => join.promise, snapshot:() => snapshot.promise } });
  const matching = h.api.onlineMatching(); await flush(); h.block(true);
  join.resolve({ state:'matched', matchId:'live-1' }); await flush();
  assert.equal(h.api.state.phase, 'online-match'); assert.equal(h.api.state.onlineMatchId, 'live-1');
  assert.equal(h.storage.get('meonjeo.online-match.v1'), 'live-1');
  snapshot.resolve({ snapshot:complete() }); await matching;
  assert.equal(h.api.state.phase, 'online-complete');
});

test('a native UI appearing during a delayed menu tap releases that tap for a later retry', () => {
  const h = harness(); h.api.home(); h.api.state.authSession.status = 'ready';
  const button = h.elements.get('online-match'); button.onclick();
  assert.equal(h.elements.get('app').dataset.homeLocked, 'true');
  h.block(true); [...h.timers.values()].find(timer => timer.delay === 220).fn();
  assert.equal(h.elements.get('app').dataset.homeLocked, undefined);
  assert.equal(h.api.state.phase, 'home');
  h.block(false); h.events.get('meonjeo-ads-change')(); assert.equal(button.disabled, false);
});

test('possibly active native UI has a visible recovery explanation and retry control', () => {
  const h = harness({ blocked:true }); let retries = 0;
  h.ads.recoveryState = () => ({ recovering:true }); h.ads.reconcile = () => { retries++; };
  h.api.home();
  assert.equal(h.elements.get('native-screen-status').hidden, false);
  assert.match(h.elements.get('native-screen-message').textContent, /다시 확인/);
  assert.equal(h.elements.get('native-screen-retry').hidden, false);
  h.elements.get('native-screen-retry').onclick(); assert.equal(retries, 1);
  assert.equal(h.elements.get('online-match').disabled, true);
});

test('successful account cleanup also erases advertising match history', () => {
  const h = harness(); let erased = 0; h.ads.resetLocalHistory = () => { erased++; };
  h.api.clearLocalAccountData(); assert.equal(erased, 1);
});
