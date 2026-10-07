export type FailedAnswerReboundInput = {
  failedPlayer: 'a' | 'b';
  lockedA: boolean;
  lockedB: boolean;
  timelinePausedAt: number | null;
  startAt: number;
  buzzOpenAt: number;
  buzzDeadlineAt: number;
  now: number;
};

export function failedAnswerRebound(input: FailedAnswerReboundInput) {
  const lockedA = input.lockedA || input.failedPlayer === 'a';
  const lockedB = input.lockedB || input.failedPlayer === 'b';
  const pausedAt = input.timelinePausedAt ?? input.now;
  const pauseDurationMs = Math.max(0, input.now - pausedAt);
  return {
    lockedA,
    lockedB,
    bothLocked: lockedA && lockedB,
    remainingMs: Math.max(0, input.buzzDeadlineAt - pausedAt),
    startAt: input.startAt + pauseDurationMs,
    buzzOpenAt: input.buzzOpenAt + pauseDurationMs,
    buzzDeadlineAt: input.buzzDeadlineAt + pauseDurationMs,
  };
}
