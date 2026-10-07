import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  GoogleAuthProvider,
  OAuthProvider,
  browserLocalPersistence,
  deleteUser,
  getAuth,
  getIdToken,
  linkWithCredential,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  setPersistence,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut,
  updateProfile,
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
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
const appleProvider = new OAuthProvider('apple.com');

let lastSession = { status: 'loading', isAnonymous: true };
let creatingGuest = false;
let nativeAppleRequest = null;
let nativeAppleRequestCounter = 0;
let nativeAppleRevocation = null;
let nativeAppleRevocationCounter = 0;
let accountDeletionInProgress = false;

function publish(session) {
  lastSession = session;
  globalThis.dispatchEvent(new CustomEvent('meonjeo-auth-change', { detail: session }));
}

function sessionFromUser(user) {
  if (!user) return { status: 'signed-out', isAnonymous: true };
  const providerId = user.providerData?.find(item => item.providerId !== 'firebase')?.providerId || '';
  return {
    status: 'ready',
    uid: user.uid,
    isAnonymous: user.isAnonymous,
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    provider: user.isAnonymous ? 'anonymous' : providerId === 'apple.com' ? 'apple' : 'google',
  };
}

function isNativeIOS() {
  return globalThis.meonjeoNative?.platform === 'ios' && typeof globalThis.meonjeoNative?.signInWithApple === 'function';
}

function nativeAppleError(code, message = '') {
  return Object.assign(new Error(message || code), { code });
}

function requestNativeAppleCredential() {
  if (!isNativeIOS()) return Promise.reject(nativeAppleError('auth/native-apple-unavailable'));
  if (nativeAppleRequest) return Promise.reject(nativeAppleError('auth/native-apple-request-in-progress'));
  const requestId = `${Date.now()}-${++nativeAppleRequestCounter}`;
  const correlated = Number(globalThis.meonjeoNative.bridgeVersion) >= 2;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      nativeAppleRequest = null;
      reject(nativeAppleError('auth/native-apple-timeout'));
    }, 120000);
    nativeAppleRequest = {
      requestId,
      correlated,
      resolve: payload => { clearTimeout(timeout); nativeAppleRequest = null; resolve(payload); },
      reject: error => { clearTimeout(timeout); nativeAppleRequest = null; reject(error); },
    };
    try {
      globalThis.meonjeoNative.signInWithApple(requestId);
    } catch (error) {
      nativeAppleRequest.reject(error);
    }
  });
}

function completeNativeAppleSignIn(payload) {
  if (!nativeAppleRequest) return;
  if (nativeAppleRequest.correlated && payload?.requestId !== nativeAppleRequest.requestId) return;
  if (!payload?.idToken || !payload?.rawNonce) {
    nativeAppleRequest.reject(nativeAppleError('auth/native-apple-invalid-credential'));
    return;
  }
  nativeAppleRequest.resolve(payload);
}

function failNativeAppleSignIn(payload = {}) {
  if (nativeAppleRequest?.correlated && payload.requestId !== nativeAppleRequest.requestId) return;
  nativeAppleRequest?.reject(nativeAppleError(payload.code || 'auth/native-apple-failed', payload.message));
}

function firebaseAppleCredential(payload) {
  return appleProvider.credential({ idToken: payload.idToken, rawNonce: payload.rawNonce });
}

function supportsNativeAppleRevocation() {
  return isNativeIOS() && Number(globalThis.meonjeoNative.bridgeVersion) >= 3
    && typeof globalThis.meonjeoNative.revokeAppleToken === 'function';
}

function assertCurrentAccount(user) {
  if (!user || auth.currentUser !== user) throw nativeAppleError('auth/account-changed');
}

function completeNativeAppleRevocation(payload = {}) {
  if (!nativeAppleRevocation?.sent || payload.requestId !== nativeAppleRevocation.requestId) return;
  nativeAppleRevocation.resolve();
}

function failNativeAppleRevocation(payload = {}) {
  if (!nativeAppleRevocation?.sent || payload.requestId !== nativeAppleRevocation.requestId) return;
  const allowedCodes = new Set([
    'auth/native-apple-revoke-failed', 'auth/native-apple-revoke-timeout',
    'auth/native-apple-revoke-unavailable', 'auth/native-apple-revoke-invalid-request',
    'auth/native-apple-revoke-request-in-progress',
  ]);
  const code = allowedCodes.has(payload.code) ? payload.code : 'auth/native-apple-revoke-failed';
  nativeAppleRevocation.reject(nativeAppleError(code));
}

function revokeNativeAppleToken(authorizationCode, user = auth.currentUser) {
  if (!authorizationCode) return Promise.reject(nativeAppleError('auth/native-apple-missing-authorization-code'));
  if (!supportsNativeAppleRevocation()) return Promise.reject(nativeAppleError('auth/native-apple-revoke-unavailable'));
  if (nativeAppleRevocation) return Promise.reject(nativeAppleError('auth/native-apple-revoke-request-in-progress'));
  try { assertCurrentAccount(user); } catch (error) { return Promise.reject(error); }
  const requestId = `revoke-${Date.now()}-${++nativeAppleRevocationCounter}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (nativeAppleRevocation?.requestId === requestId) {
        nativeAppleRevocation = null;
        reject(nativeAppleError('auth/native-apple-revoke-timeout'));
      }
    }, 60000);
    const settle = (callback, value) => {
      if (nativeAppleRevocation?.requestId !== requestId) return;
      clearTimeout(timeout);
      nativeAppleRevocation = null;
      callback(value);
    };
    nativeAppleRevocation = {
      requestId, sent: false,
      resolve: () => settle(resolve),
      reject: error => settle(reject, error),
    };
    Promise.resolve().then(() => getIdToken(user, true)).then(idToken => {
      if (nativeAppleRevocation?.requestId !== requestId) return;
      assertCurrentAccount(user);
      if (typeof idToken !== 'string' || !idToken) throw nativeAppleError('auth/native-apple-revoke-invalid-request');
      nativeAppleRevocation.sent = true;
      globalThis.meonjeoNative.revokeAppleToken(requestId, idToken, authorizationCode);
    }).catch(error => {
      if (nativeAppleRevocation?.requestId === requestId) nativeAppleRevocation.reject(error);
    });
  });
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

async function mergeGuestProgress(guestToken) {
  const accountToken = await getIdToken(auth.currentUser);
  const mergeOptions = {
    method: 'POST',
    headers: { Authorization: `Bearer ${accountToken}`, 'Content-Type': 'application/json' },
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

async function signInWithGoogle() {
  publish({ ...lastSession, status: 'working', errorCode: null });
  try {
    const current = auth.currentUser;
    if (current?.isAnonymous) {
      const guestToken = await getIdToken(current);
      try {
        await linkWithPopup(current, googleProvider);
      } catch (error) {
        const credential = GoogleAuthProvider.credentialFromError(error);
        if (error?.code !== 'auth/credential-already-in-use' || !credential) throw error;
        await signInWithCredential(auth, credential);
        await mergeGuestProgress(guestToken);
      }
    } else {
      await signInWithPopup(auth, googleProvider);
    }
    publish(sessionFromUser(auth.currentUser));
    return sessionFromUser(auth.currentUser);
  } catch (error) {
    const session = { ...sessionFromUser(auth.currentUser), status: 'error', errorCode: error?.code || 'auth/unknown' };
    publish(session);
    throw error;
  }
}

async function signInWithApple() {
  publish({ ...lastSession, status: 'working', errorCode: null });
  try {
    const payload = await requestNativeAppleCredential();
    const credential = firebaseAppleCredential(payload);
    const current = auth.currentUser;
    if (current?.isAnonymous) {
      const guestToken = await getIdToken(current);
      try {
        await linkWithCredential(current, credential);
      } catch (error) {
        if (error?.code !== 'auth/credential-already-in-use') throw error;
        await signInWithCredential(auth, credential);
        await mergeGuestProgress(guestToken);
      }
    } else {
      await signInWithCredential(auth, credential);
    }
    if (payload.fullName?.trim() && auth.currentUser && !auth.currentUser.displayName) {
      await updateProfile(auth.currentUser, { displayName: payload.fullName.trim() });
    }
    publish(sessionFromUser(auth.currentUser));
    return sessionFromUser(auth.currentUser);
  } catch (error) {
    publish({ ...sessionFromUser(auth.currentUser), status: 'error', errorCode: error?.code || 'auth/native-apple-failed' });
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

async function deleteCurrentAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error('Player session is required');
  if (accountDeletionInProgress) throw nativeAppleError('account/delete-in-progress');
  accountDeletionInProgress = true;
  publish({ ...lastSession, status: 'working', errorCode: null });
  try {
    const removeServerData = async () => {
      assertCurrentAccount(user);
      const token = await getIdToken(user, true);
      assertCurrentAccount(user);
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!response.ok) throw Object.assign(new Error(`Account deletion failed (${response.status})`), { status: response.status });
    };
    const appleAccount = user.providerData?.some(item => item.providerId === 'apple.com');
    if (appleAccount) {
      if (!supportsNativeAppleRevocation()) throw nativeAppleError('auth/native-apple-revoke-unavailable');
      const payload = await requestNativeAppleCredential();
      assertCurrentAccount(user);
      await reauthenticateWithCredential(user, firebaseAppleCredential(payload));
      assertCurrentAccount(user);
      await revokeNativeAppleToken(payload.authorizationCode, user);
    }
    await removeServerData();
    try {
      assertCurrentAccount(user);
      await deleteUser(user);
    } catch (error) {
      if (error?.code !== 'auth/requires-recent-login' || user.isAnonymous) throw error;
      if (appleAccount) throw error;
      assertCurrentAccount(user);
      await reauthenticateWithPopup(user, googleProvider);
      await removeServerData();
      assertCurrentAccount(user);
      await deleteUser(user);
    }
    await ensureGuest();
    publish(sessionFromUser(auth.currentUser));
    return { deleted: true };
  } catch (error) {
    publish({ ...sessionFromUser(auth.currentUser), status: 'error', errorCode: error?.code || 'account/delete-failed' });
    throw error;
  } finally {
    accountDeletionInProgress = false;
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

async function playerApi(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Player session is required');
  const token = await getIdToken(user);
  const response = await fetch(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const payload = await response.json().catch(() => ({ error: 'invalid-response' }));
  if (!response.ok) throw Object.assign(new Error(payload.error || `Request failed (${response.status})`), { status: response.status });
  return payload;
}

globalThis.meonjeoAuth = {
  getSession: () => lastSession,
  signInWithGoogle,
  signInWithApple,
  completeNativeAppleSignIn,
  failNativeAppleSignIn,
  completeNativeAppleRevocation,
  failNativeAppleRevocation,
  isNativeIOS,
  signOut: signOutToGuest,
  deleteAccount: deleteCurrentAccount,
  syncGameData,
  getAuthToken,
  getTitles: () => playerApi('/api/titles'),
  selectTitle: titleId => playerApi('/api/titles', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titleId }) }),
  getQuizTime: () => playerApi('/api/quiz-time'),
  trackQuizTime: (eventType, eventId) => playerApi('/api/quiz-time', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventType, eventId }) }),
  getLeaderboard: () => playerApi('/api/progress?action=leaderboard'),
  submitReport: report => playerApi('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }),
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
