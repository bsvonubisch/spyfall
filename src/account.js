import {
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
  signInWithCredential,
  signOut,
} from 'firebase/auth';
import { auth, identity } from './firebase.js';

export { googleAccount, adminAccount } from './admin-access.js';

// Open the popup directly from the click, before any asynchronous work.
export async function connectGoogle() {
  const user = auth.currentUser;
  const linking = Boolean(user?.isAnonymous);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = linking
      ? await linkWithPopup(user, provider)
      : await signInWithPopup(auth, provider);
    await result.user.getIdToken(true);
    return { user: result.user, linked: linking };
  } catch (error) {
    if (error.code === 'auth/credential-already-in-use') {
      const credential = GoogleAuthProvider.credentialFromError(error);
      if (credential) return { credential };
    }
    throw error;
  }
}
export async function useGoogleAccount(credential) {
  const { user } = await signInWithCredential(auth, credential);
  await user.getIdToken(true);
  return user;
}
export async function returnToGuest() {
  await signOut(auth);
  return identity();
}
export function accountError(error) {
  return (
    {
      'auth/popup-blocked': 'Allow the Google sign-in popup, then try again.',
      'auth/popup-closed-by-user': 'Sign-in was cancelled. You can keep playing as a guest.',
      'auth/cancelled-popup-request': 'Sign-in was cancelled. Please try again.',
      'auth/operation-not-allowed': 'Google sign-in must be enabled in Firebase Authentication.',
      'auth/unauthorized-domain':
        'This address needs to be added to Firebase Authentication’s authorized domains.',
      'auth/network-request-failed':
        'Could not connect to Google. Check your connection and try again.',
      'auth/account-exists-with-different-credential':
        'This email already uses another sign-in method. Use that account’s sign-in method first.',
    }[error.code] || 'Could not sign in. Please try again.'
  );
}
