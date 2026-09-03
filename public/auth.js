import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
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
      try {
        await linkWithPopup(current, provider);
      } catch (error) {
        const credential = GoogleAuthProvider.credentialFromError(error);
        if (error?.code !== 'auth/credential-already-in-use' || !credential) throw error;
        await signInWithCredential(auth, credential);
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

globalThis.meonjeoAuth = {
  getSession: () => lastSession,
  signInWithGoogle,
  signOut: signOutToGuest,
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
