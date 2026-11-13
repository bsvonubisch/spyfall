import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { execute } from './game.js';

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true';
const config = useEmulators ? { apiKey: 'demo-key', authDomain: 'demo-spyfall.firebaseapp.com', projectId: 'demo-spyfall', appId: 'demo-spyfall' }
  : JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG);
const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
if (useEmulators) {
  const host = location.hostname;
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
}
let signingIn;
export async function identity() {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  if (!signingIn) signingIn = signInAnonymously(auth).finally(() => { signingIn = null; });
  return (await signingIn).user;
}
export async function callGame(data) {
  const user = await identity();
  return execute(db, user.uid, data);
}
