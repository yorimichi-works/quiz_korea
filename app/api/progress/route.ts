import { mergePlayerProgress, readLeaderboard, readPlayerProgress, writePlayerProgress, type MatchHistoryItem, type PlayerProgress } from '@/db/progress';

import { requireFirebaseUser, verifyFirebaseToken } from '@/lib/firebase-user';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function cleanMatch(item: unknown): MatchHistoryItem | null {
  if (!item || typeof item !== 'object') return null;
  const value = item as Record<string, unknown>;
  const result = value.result;
  if (!['win', 'loss', 'draw'].includes(String(result))) return null;
  const playedAt = String(value.playedAt || '');
  if (!Number.isFinite(Date.parse(playedAt))) return null;
  const opponentRating = Number(value.opponentRating);
  if (!Number.isInteger(opponentRating) || opponentRating < 0 || opponentRating > 1000000) return null;
  const matchId = String(value.matchId || '').slice(0, 100);
  if (!matchId) return null;
  return {
    matchId,
    opponentName: String(value.opponentName || '').slice(0, 60),
    opponentIcon: String(value.opponentIcon || '').slice(0, 8),
    opponentRating,
    playedAt,
    result: result as MatchHistoryItem['result'],
  };
}

function cleanProgress(input: unknown): PlayerProgress | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const rating = Number(value.rating);
  const rankPoints = Number(value.rankPoints);
  const profileUpdatedAt = Number(value.profileUpdatedAt);
  if (!Number.isInteger(rating) || rating < 0 || rating > 1000000) return null;
  if (!Number.isInteger(rankPoints) || rankPoints < 0 || rankPoints > 1000000000) return null;
  if (!Number.isInteger(profileUpdatedAt) || profileUpdatedAt < 0 || profileUpdatedAt > Date.now() + 300000) return null;
  const rawHistory = Array.isArray(value.matchHistory) ? value.matchHistory : [];
  const matchHistory = rawHistory.map(cleanMatch).filter((item): item is MatchHistoryItem => item !== null).slice(0, 30);
  return { rating, rankPoints, profileUpdatedAt, matchHistory };
}

export async function GET(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    if (!user) return json({ error: 'unauthorized' }, 401);
    if (new URL(request.url).searchParams.get('action') === 'leaderboard') {
      return json({ leaderboard: await readLeaderboard(user.userId) });
    }
    return json({ progress: await readPlayerProgress(user.userId) });
  } catch (error) {
    console.error('progress GET failed', error);
    return json({ error: 'unavailable' }, 503);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireFirebaseUser(request);
    if (!user) return json({ error: 'unauthorized' }, 401);
    const progress = cleanProgress(await request.json());
    if (!progress) return json({ error: 'invalid-progress' }, 400);
    await writePlayerProgress(user.userId, progress);
    return json({ progress });
  } catch (error) {
    console.error('progress PUT failed', error);
    return json({ error: 'unavailable' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    if (new URL(request.url).searchParams.get('action') !== 'merge-guest') return json({ error: 'unknown-action' }, 404);
    const target = await requireFirebaseUser(request);
    if (!target?.accountLinked) return json({ error: 'linked-account-required' }, 401);
    const body = await request.json().catch(() => ({})) as { guestToken?: unknown };
    const source = await verifyFirebaseToken(String(body.guestToken || ''));
    if (!source?.isAnonymous || source.userId === target.userId) return json({ error: 'invalid-guest' }, 400);
    return json({ progress: await mergePlayerProgress(source.userId, target.userId) });
  } catch (error) {
    console.error('progress merge failed', error);
    return json({ error: 'unavailable' }, 503);
  }
}
