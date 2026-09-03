import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  getIdToken,
  linkWithPopup,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAFNxcPTqD8LK6IWXlygncDoaUFRAdb6sQ',
  appId: '1:553966867727:web:15a764db13734847b8da7a',
  messagingSenderId: '553966867727',
  projectId: 'tier-online',
  authDomain: 'tier-online.firebaseapp.com',
  storageBucket: 'tier-online.firebasestorage.app',
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

let lastSession = { status: 'loading', isAnonymous: true };
let creatingGuest = false;

function publish(session) {
  lastSession = session;
  globalThis.dispatchEvent(new CustomEvent('meonjeo-auth-change', { detail: session }));
}

function sessionFromUser(user) {
  if (!user) return { status: 'signed-out', isAnonymous: true };
  return {
    status: 'ready',
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    provider: user.isAnonymous ? 'anonymous' : 'google',
  };
}

async function ensureGuest() {
  if (auth.currentUser || creatingGuest) return;
  creatingGuest = true;
  try {
    await signInAnonymously(auth);
  } finally {
    creatingGuest = false;
  }
}

async function signInWithGoogle() {
  publish({ ...lastSession, status: 'working', errorCode: null });
  try {
    const current = auth.currentUser;
    if (current?.isAnonymous) {
      const guestToken = await getIdToken(current);
      try {
        await linkWithPopup(current, provider);
      } catch (error) {
        const credential = GoogleAuthProvider.credentialFromError(error);
        if (error?.code !== 'auth/credential-already-in-use' || !credential) throw error;
        await signInWithCredential(auth, credential);
        const googleToken = await getIdToken(auth.currentUser);
        const mergeOptions = {
          method: 'POST',
          headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestToken }),
          cache: 'no-store',
        };
        let mergeResponse = await fetch('/api/progress?action=merge-guest', mergeOptions);
        if (!mergeResponse.ok) {
          await new Promise(resolve => setTimeout(resolve, 400));
          mergeResponse = await fetch('/api/progress?action=merge-guest', mergeOptions);
        }
        if (!mergeResponse.ok) throw new Error(`Guest merge failed (${mergeResponse.status})`);
      }
    } else {
      await signInWithPopup(auth, provider);
    }
    publish(sessionFromUser(auth.currentUser));
    return sessionFromUser(auth.currentUser);
  } catch (error) {
    const session = { ...sessionFromUser(auth.currentUser), status: 'error', errorCode: error?.code || 'auth/unknown' };
    publish(session);
    throw error;
  }
}

async function signOutToGuest() {
  publish({ ...lastSession, status: 'working', errorCode: null });
  try {
    await signOut(auth);
    await ensureGuest();
    publish(sessionFromUser(auth.currentUser));
  } catch (error) {
    publish({ ...sessionFromUser(auth.currentUser), status: 'error', errorCode: error?.code || 'auth/unknown' });
    throw error;
  }
}

function mergeProgress(localProgress, cloudProgress) {
  const localUpdatedAt = Number(localProgress.profileUpdatedAt) || 0;
  const cloudUpdatedAt = Number(cloudProgress?.profileUpdatedAt) || 0;
  const newer = cloudProgress && cloudUpdatedAt > localUpdatedAt ? cloudProgress : localProgress;
  const historyById = new Map();
  for (const item of [...(cloudProgress?.matchHistory || []), ...(localProgress.matchHistory || [])]) {
    if (item?.matchId) historyById.set(item.matchId, item);
  }
  const matchHistory = [...historyById.values()]
    .sort((a, b) => Date.parse(b.playedAt) - Date.parse(a.playedAt))
    .slice(0, 30);
  return {
    rating: Math.max(0, Math.floor(Number(newer.rating) || 0)),
    rankPoints: Math.max(Number(localProgress.rankPoints) || 0, Number(cloudProgress?.rankPoints) || 0),
    profileUpdatedAt: Math.max(localUpdatedAt, cloudUpdatedAt),
    matchHistory,
  };
}

async function authenticatedRequest(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Player session is required');
  const token = await getIdToken(user);
  const response = await fetch(path, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Progress sync failed (${response.status})`);
  return response.json();
}

async function syncGameData(localProgress) {
  const cloudResult = await authenticatedRequest('/api/progress', { method: 'GET' });
  const merged = mergeProgress(localProgress, cloudResult.progress);
  const saved = await authenticatedRequest('/api/progress', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(merged),
  });
  return saved.progress;
}

async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Player session is required');
  return getIdToken(user);
}

globalThis.meonjeoAuth = {
  getSession: () => lastSession,
  signInWithGoogle,
  signOut: signOutToGuest,
  syncGameData,
  getAuthToken,
};

onAuthStateChanged(auth, user => {
  if (!user) {
    ensureGuest().catch(error => publish({ status: 'error', isAnonymous: true, errorCode: error?.code || 'auth/anonymous-failed' }));
    return;
  }
  publish(sessionFromUser(user));
});

setPersistence(auth, browserLocalPersistence)
  .then(ensureGuest)
  .catch(error => publish({ status: 'error', isAnonymous: true, errorCode: error?.code || 'auth/init-failed' }));
