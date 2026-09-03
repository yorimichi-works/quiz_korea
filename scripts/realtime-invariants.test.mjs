import assert from 'node:assert/strict';
import test from 'node:test';

function makeBuzzGate({ openAt = 1000, closeAt = 5000, token = 'question-1' } = {}) {
  let winner = null;
  const events = new Map();
  return ({ uid, buzzId, questionToken = token, receivedAt }) => {
    if (events.has(buzzId)) return events.get(buzzId);
    const accepted = winner === null && questionToken === token && receivedAt >= openAt && receivedAt <= closeAt;
    if (accepted) winner = uid;
    const result = Object.freeze({ accepted, winner });
    events.set(buzzId, result);
    return result;
  };
}

function medianClockEstimate(samples) {
  const sortedByRtt = [...samples].sort((a, b) => a.rtt - b.rtt);
  const trimmed = sortedByRtt.length >= 5 ? sortedByRtt.slice(1, -1) : sortedByRtt;
  const offsets = trimmed.map(sample => sample.offset).sort((a, b) => a - b);
  return offsets[Math.floor(offsets.length / 2)];
}

test('100 simultaneous buzzes produce exactly one server winner', async () => {
  const claim = makeBuzzGate();
  const attempts = Array.from({ length: 100 }, (_, index) =>
    Promise.resolve().then(() => claim({ uid: `player-${index}`, buzzId: `buzz-${index}`, receivedAt: 1500 + index }))
  );
  const results = await Promise.all(attempts);
  assert.equal(results.filter(result => result.accepted).length, 1);
  assert.equal(new Set(results.map(result => result.winner)).size, 1);
});

test('repeated event id returns the same decision', () => {
  const claim = makeBuzzGate();
  const first = claim({ uid: 'a', buzzId: 'same-id', receivedAt: 1200 });
  const retry = claim({ uid: 'a', buzzId: 'same-id', receivedAt: 9000 });
  assert.deepEqual(retry, first);
});

test('old question token and closed-window buzz are rejected', () => {
  const claim = makeBuzzGate();
  assert.equal(claim({ uid: 'a', buzzId: 'old', questionToken: 'question-0', receivedAt: 1200 }).accepted, false);
  assert.equal(claim({ uid: 'b', buzzId: 'late', receivedAt: 5001 }).accepted, false);
});

test('trimmed median clock estimate ignores large latency outliers', () => {
  const estimate = medianClockEstimate([
    { rtt: 28, offset: 102 }, { rtt: 31, offset: 100 }, { rtt: 34, offset: 101 },
    { rtt: 600, offset: 900 }, { rtt: 5, offset: -700 },
  ]);
  assert.equal(estimate, 101);
});
