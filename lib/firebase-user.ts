const FIREBASE_API_KEY = 'AIzaSyAFNxcPTqD8LK6IWXlygncDoaUFRAdb6sQ';
const FIREBASE_PROJECT_ID = 'tier-online';

export type VerifiedFirebaseUser = {
  userId: string;
  googleLinked: boolean;
};

export async function verifyFirebaseToken(token: string): Promise<VerifiedFirebaseUser | null> {
  if (!token || token.length > 4096) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
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
    return {
      userId: user.localId,
      googleLinked: Boolean(user.providerUserInfo?.some(provider => provider.providerId === 'google.com')),
    };
  } catch {
    return null;
  }
}

export async function requireFirebaseUser(request: Request): Promise<VerifiedFirebaseUser | null> {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  return verifyFirebaseToken(token);
}
