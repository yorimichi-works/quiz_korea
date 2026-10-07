// Native ads only. The web game owns navigation; the bridge owns consent and presentation.
(() => {
  const bridge = globalThis.meonjeoNative;
  const supported = bridge?.platform === 'ios' && bridge?.bridgeVersion >= 4 && bridge?.ads?.version === 1 && typeof bridge.ads.request === 'function';
  const documentId = bridge?.documentId;
  const config = Object.freeze({
    minimumCompletedMatches: Math.max(3, Number(globalThis.meonjeoAdsConfig?.minimumCompletedMatches) || 3),
    cooldownMs: Math.max(180000, Number(globalThis.meonjeoAdsConfig?.cooldownMs) || 180000),
  });
  const STORAGE_KEY = 'meonjeo.interstitial-frequency.v1';
  const pending = new Map();
  const attempted = new Set();
  let counter = 0;
  let context = { phase:'menu', generation:0, matchId:null };
  let uncertain = supported;
  let advertisingDisabled = false;
  let cleanBootstrap = bridge?.ads?.initialPresentationState === 'idle';
  let presentationCapableRequestSent = false;
  let recovering = false;
  let contextHandshake = null;
  let handshakeGeneration = -1;
  let lastPrepareOptions = { qa:false };
  let nativeBusy = false;
  let privacyOptionsRequired = false;
  let boundary = null;
  let preparation = null;
  let prepared = false;
  let recovery = null;
  let recoveryTimer = null;
  let suspended = false;
  const resumeContinuations = new Set();
  let ledger;
  try { ledger = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { /* Storage can be unavailable. */ }
  ledger = {
    completed: Array.isArray(ledger?.completed) ? ledger.completed.filter(id => typeof id === 'string').slice(-100) : [],
    count: Math.max(0, Number(ledger?.count) || 0),
    shownAtCount: Math.max(0, Number(ledger?.shownAtCount) || 0),
    lastShownAt: Math.max(0, Number(ledger?.lastShownAt) || 0),
  };
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger)); } catch { /* Frequency still holds for this document. */ } };
  const isBlocking = () => supported && !advertisingDisabled && (uncertain || nativeBusy || Boolean(boundary) || Boolean(preparation));
  const notify = () => globalThis.dispatchEvent(new CustomEvent('meonjeo-ads-change', { detail:{ blocking:isBlocking(), privacyOptionsRequired, recovering, advertisingDisabled } }));
  const usable = () => supported && !advertisingDisabled && !suspended && !document.hidden && navigator.onLine !== false;
  const sameContext = value => value.generation === context.generation && value.phase === context.phase && value.matchId === context.matchId;

  function request(operation, payload = {}, timeoutMs = 1500, onEvent = null) {
    return new Promise(resolve => {
      const requestId = `ad-${++counter}`;
      const generation = context.generation;
      const timeout = setTimeout(() => { pending.delete(requestId); resolve(null); }, timeoutMs);
      pending.set(requestId, { operation, generation, resolve, timeout, onEvent });
      try {
        if (['prepare','present','privacyOptions'].includes(operation)) presentationCapableRequestSent = true;
        bridge.ads.request(requestId, operation, { ...payload, generation });
      }
      catch { clearTimeout(timeout); pending.delete(requestId); resolve(null); }
    });
  }

  function receiveNativeResult(result) {
    if (!supported || advertisingDisabled || result?.documentId !== documentId) return;
    const entry = pending.get(result.requestId);
    if (!entry || entry.operation !== result.operation || result.generation !== entry.generation || entry.generation !== context.generation) return;
    if (result.busy === true || result.presentationActive === true) cleanBootstrap = false;
    if (typeof result.privacyOptionsRequired === 'boolean') privacyOptionsRequired = result.privacyOptionsRequired;
    entry.onEvent?.(result);
    if (result.terminal !== true) return;
    clearTimeout(entry.timeout);
    pending.delete(result.requestId);
    entry.resolve(result);
    notify();
  }

  function disableAdvertising() {
    advertisingDisabled = true;
    uncertain = false; nativeBusy = false; recovering = false;
    clearTimeout(recoveryTimer); recoveryTimer = null;
    notify();
  }

  function handleHandshakeFailure() {
    // Native supplies this proof only for the first document of a clean web view.
    // A restored document or any sent UI-capable request must recover through native status.
    if (cleanBootstrap && !presentationCapableRequestSent) disableAdvertising();
    else { uncertain = true; recovering = true; notify(); }
  }

  // A timeout never means that a full-screen native controller has gone away.
  // No consent/presentation request is sent until a read-only context/status handshake succeeds.
  async function reconcile() {
    if (advertisingDisabled) return true;
    if (!supported || suspended || document.hidden) return false;
    if (recovery) return recovery;
    const generation = context.generation;
    recovery = (async () => {
      if (handshakeGeneration !== generation) {
        if (!contextHandshake) contextHandshake = request('context', context);
        const result = await contextHandshake;
        if (generation !== context.generation || suspended) return false;
        if (result?.ok !== true) { contextHandshake = null; handleHandshakeFailure(); return advertisingDisabled; }
        handshakeGeneration = generation;
      }
      const result = await request('status');
      if (generation !== context.generation || suspended) return false;
      if (result?.ok === true && typeof result.busy === 'boolean' && typeof result.presentationActive === 'boolean') {
        nativeBusy = result.busy || result.presentationActive;
        uncertain = false;
        recovering = false;
        if (!nativeBusy && result.configurationVerified === false) disableAdvertising();
      } else handleHandshakeFailure();
      notify();
      return advertisingDisabled || (!uncertain && !nativeBusy);
    })();
    try { return await recovery; }
    finally {
      recovery = null;
      if (!advertisingDisabled && (uncertain || nativeBusy || boundary || preparation) && !suspended && !document.hidden) scheduleReconcile();
    }
  }

  function scheduleReconcile() {
    if (recoveryTimer || advertisingDisabled) return;
    recoveryTimer = setTimeout(() => { recoveryTimer = null; void reconcile(); }, 1500);
  }

  function setContext(next) {
    context = { phase:next.phase, generation:next.generation, matchId:next.matchId || null };
    if (!supported || advertisingDisabled) return;
    for (const [requestId, entry] of pending) {
      if (entry.generation === context.generation) continue;
      clearTimeout(entry.timeout); pending.delete(requestId); entry.resolve(null);
    }
    handshakeGeneration = -1;
    contextHandshake = request('context', context);
    if (uncertain || nativeBusy) void reconcile();
  }

  async function waitForIdle() {
    // Reconciliation observes native state, never dismisses a visible ad or consent form.
    while (supported && !suspended && !advertisingDisabled) {
      if (await reconcile()) return true;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    return advertisingDisabled;
  }

  const retryablePreparationReasons = new Set(['background','document-changed','context-changed','unsafe-consent-boundary','prepare-timeout','consent-error','presentation-busy']);
  async function prepare(options = lastPrepareOptions) {
    lastPrepareOptions = options;
    if (!usable() || options.qa || prepared || preparation || context.phase !== 'menu' || boundary) return;
    const owner = { ...context };
    preparation = true;
    notify();
    if (!(await waitForIdle()) || !usable() || !sameContext(owner)) {
      preparation = null; notify(); return;
    }
    prepared = true;
    const result = await request('prepare', { allowConsentUI:true }, 45000);
    if (!result || result.busy || result.presentationActive) {
      uncertain = true; recovering = true; notify();
      await waitForIdle();
      prepared = false;
    } else {
      nativeBusy = false; uncertain = false; recovering = false;
      if (['consent-config-unverified','tracking-not-authorized','sdk-unavailable'].includes(result.reason)) disableAdvertising();
      else if (retryablePreparationReasons.has(result.reason)) prepared = false;
    }
    preparation = null;
    notify();
  }

  async function resumeMenuPreparation() {
    if (await reconcile()) {
      if (usable() && context.phase === 'menu' && !prepared && !preparation) void prepare();
    }
  }

  function isNormalCompletion(snapshot, { qa = false, source = 'rated' } = {}) {
    return !qa && ['rated','quiz_time_banner'].includes(source)
      && typeof snapshot?.matchId === 'string' && !/^(qa-|friend-)/.test(snapshot.matchId)
      && snapshot.phase === 'complete' && snapshot.status === 'complete' && Boolean(snapshot.reward)
      && ['correct','wrong','answer_timeout','both_wrong','no_buzz'].includes(snapshot.result?.kind);
  }

  function recordCompletion(snapshot, options) {
    if (!isNormalCompletion(snapshot, options)) return false;
    if (!ledger.completed.includes(snapshot.matchId)) {
      ledger.completed = [...ledger.completed, snapshot.matchId].slice(-100);
      ledger.count += 1;
      save();
    }
    return true;
  }

  function frequencyAllows() {
    return ledger.count >= config.minimumCompletedMatches
      && ledger.count - ledger.shownAtCount >= config.minimumCompletedMatches
      && (!ledger.lastShownAt || Date.now() - ledger.lastShownAt >= config.cooldownMs);
  }

  function exitCompletedMatch(snapshot, options, continuation) {
    const matchId = snapshot?.matchId;
    if (!matchId || attempted.has(matchId) || boundary) return;
    attempted.add(matchId);
    const owner = { ...context };
    const eligibleCompletion = recordCompletion(snapshot, options);
    let continued = false;
    const finish = () => {
      if (continued) return;
      if (suspended) { resumeContinuations.add(finish); return; }
      continued = true;
      boundary = null;
      notify();
      if (!suspended && sameContext(owner)) continuation();
    };
    if (!eligibleCompletion || !usable() || isBlocking() || !frequencyAllows()
        || owner.phase !== 'results' || owner.matchId !== matchId) { finish(); return; }
    boundary = { matchId, generation:owner.generation };
    notify();
    const expiresAt = Date.now() + 1500;
    const onPresentation = result => {
      if (result.event !== 'presenting') return;
      nativeBusy = true;
      notify();
    };
    void (async () => {
      const eligibility = await request('eligibility', { placement:'match-exit-home', matchId });
      if (!sameContext(owner) || !usable() || Date.now() >= expiresAt || !eligibility?.eligible) { finish(); return; }
      // Reserve the frequency budget before presentation. Lost bridge callbacks
      // must not permit an additional ad; a skipped request can conservatively use this slot.
      ledger.shownAtCount = ledger.count; ledger.lastShownAt = Date.now(); save();
      const result = await request('present', { placement:'match-exit-home', matchId, expiresAt }, 45000, onPresentation);
      if (!result || result.busy || result.presentationActive) {
        uncertain = true; recovering = true; notify();
        // Invalidate permission for a not-yet-presented ad before an idle status can release navigation.
        if (sameContext(owner)) void request('context', { phase:'menu', matchId:null });
        await waitForIdle();
      } else { nativeBusy = false; uncertain = false; recovering = false; }
      finish();
    })();
  }

  async function privacyOptions() {
    if (!usable() || isBlocking() || context.phase !== 'menu') return;
    preparation = true;
    notify();
    const result = await request('privacyOptions', {}, 45000);
    if (!result || result.busy || result.presentationActive) { uncertain = true; recovering = true; notify(); await waitForIdle(); }
    else { nativeBusy = false; uncertain = false; recovering = false; }
    preparation = null; prepared = false;
    notify();
    if (usable() && context.phase === 'menu') void prepare();
  }

  function resetLocalHistory() {
    ledger = { completed:[], count:0, shownAtCount:0, lastShownAt:0 };
    attempted.clear();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* In-memory identifiers are still cleared. */ }
  }

  globalThis.meonjeoAds = Object.freeze({
    config, setContext, prepare, recordCompletion, exitCompletedMatch, receiveNativeResult, reconcile, privacyOptions,
    isBlocking, isSupported: () => supported, privacyOptionsRequired: () => privacyOptionsRequired && !advertisingDisabled,
    recoveryState: () => ({ blocking:isBlocking(), recovering, advertisingDisabled }), resetLocalHistory,
  });
  globalThis.addEventListener('pagehide', () => {
    suspended = true; cleanBootstrap = false;
    clearTimeout(recoveryTimer); recoveryTimer = null;
    if (supported && !advertisingDisabled) void request('context', { phase:'menu', matchId:null });
  });
  globalThis.addEventListener('pageshow', event => {
    suspended = false;
    if (event?.persisted) cleanBootstrap = false;
    if (!supported || advertisingDisabled) return;
    uncertain = true;
    void waitForIdle().then(idle => {
      if (!idle) return;
      for (const finish of resumeContinuations) finish();
      resumeContinuations.clear();
      if (usable() && context.phase === 'menu') void prepare();
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (!supported || advertisingDisabled) return;
    if (document.hidden) { uncertain = true; clearTimeout(recoveryTimer); recoveryTimer = null; }
    else void resumeMenuPreparation();
  });
})();
