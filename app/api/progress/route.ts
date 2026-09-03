import { mergePlayerProgress, readLeaderboard, readPlayerProgress, writePlayerProgress, type MatchHistoryItem, type PlayerProgress } from '@/db/progress';

const FIREBASE_API_KEY = 'AIzaSyAFNxcPTqD8LK6IWXlygncDoaUFRAdb6sQ';
const FIREBASE_PROJECT_ID = 'tier-online';

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

type VerifiedUser = { userId: string; googleLinked: boolean };

async function verifyFirebaseToken(token: string): Promise<VerifiedUser | null> {
  if (!token || token.length > 4096) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }),
  });
  if (!response.ok) return null;
  const payload = await response.json() as { users?: Array<{ localId?: string; providerUserInfo?: Array<{ providerId?: string }> }> };
  const user = payload.users?.[0];
  if (!user?.localId) return null;
  try {
    const encodedPayload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') || '';
    const paddedPayload = encodedPayload.padEnd(Math.ceil(encodedPayload.length / 4) * 4, '=');
    const tokenPayload = JSON.parse(atob(paddedPayload)) as { aud?: string };
    if (tokenPayload.aud !== FIREBASE_PROJECT_ID) return null;
    return { userId: user.localId, googleLinked: Boolean(user.providerUserInfo?.some(provider => provider.providerId === 'google.com')) };
  } catch { return null; }
}

async function requireFirebaseUser(request: Request): Promise<VerifiedUser | null> {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  return verifyFirebaseToken(token);
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
    if (!target?.googleLinked) return json({ error: 'google-account-required' }, 401);
    const body = await request.json().catch(() => ({})) as { guestToken?: unknown };
    const source = await verifyFirebaseToken(String(body.guestToken || ''));
    if (!source || source.googleLinked || source.userId === target.userId) return json({ error: 'invalid-guest' }, 400);
    return json({ progress: await mergePlayerProgress(source.userId, target.userId) });
  } catch (error) {
    console.error('progress merge failed', error);
    return json({ error: 'unavailable' }, 503);
  }
}
