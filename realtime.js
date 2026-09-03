const API_PATH = '/api/realtime';
let realtimeSessionToken = null;

async function ensureSession() {
  if (realtimeSessionToken) return realtimeSessionToken;
  const firebaseToken = await globalThis.meonjeoAuth?.getAuthToken?.();
  if (!firebaseToken) throw new Error('auth-required');
  const response = await fetch(`${API_PATH}?action=session`, {
    method: 'POST', headers: { Authorization: `Bearer ${firebaseToken}`, 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store',
  });
  const payload = await response.json();
  if (!response.ok || !payload.sessionToken) throw new Error(payload.error || 'session-failed');
  realtimeSessionToken = payload.sessionToken;
  return realtimeSessionToken;
}

async function request(action, body = null) {
  const token = await ensureSession();
  const options = { method: body === null ? 'GET' : 'POST', headers: { Authorization: `Meonjeo ${token}`, ...(body === null ? {} : { 'Content-Type': 'application/json' }) }, body: body === null ? undefined : JSON.stringify(body), cache: 'no-store' };
  let response;
  try { response = await fetch(`${API_PATH}?action=${encodeURIComponent(action)}`, options); }
  catch { await new Promise(resolve => setTimeout(resolve, 450)); response = await fetch(`${API_PATH}?action=${encodeURIComponent(action)}`, options); }
  if (response.status === 401) { realtimeSessionToken = null; }
  const payload = await response.json().catch(() => ({ error: 'invalid-response' }));
  if (!response.ok) throw Object.assign(new Error(payload.error || `request-failed-${response.status}`), { status: response.status, payload });
  return payload;
}

async function syncClock(samples = 5) {
  const measurements = [];
  for (let index = 0; index < samples; index += 1) {
    const sentAt = performance.now();
    const wallAt = Date.now();
    const payload = await request('ping');
    const rtt = performance.now() - sentAt;
    measurements.push({ rtt, offset: payload.serverNow - (wallAt + rtt / 2) });
  }
  const byRtt = measurements.sort((a, b) => a.rtt - b.rtt);
  const trimmed = byRtt.length >= 5 ? byRtt.slice(1, -1) : byRtt;
  const offsets = trimmed.map(sample => sample.offset).sort((a, b) => a - b);
  const rtts = trimmed.map(sample => sample.rtt).sort((a, b) => a - b);
  return {
    offsetMs: offsets[Math.floor(offsets.length / 2)] || 0,
    medianRttMs: Math.round(rtts[Math.floor(rtts.length / 2)] || 0),
  };
}

globalThis.meonjeoRealtime = {
  syncClock,
  join: () => request('join', {}),
  snapshot: matchId => request('snapshot', { matchId }),
  buzz: payload => request('buzz', payload),
  answer: payload => request('answer', payload),
  leave: matchId => request('leave', { matchId }),
  resetSession: () => { realtimeSessionToken = null; },
};

globalThis.dispatchEvent(new Event('meonjeo-realtime-ready'));
