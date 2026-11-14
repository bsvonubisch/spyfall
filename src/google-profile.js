import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { safeAvatarUrl } from './avatars.js';
import { profileData } from './scores.js';

export function googleProfile(user, current = {}) {
  const google = user.providerData?.find((provider) => provider.providerId === 'google.com');
  return {
    id: user.uid,
    name: (
      google?.displayName?.trim() ||
      user.displayName?.trim() ||
      current.name ||
      'Agent'
    ).slice(0, 20),
    avatarSeed: current.avatarSeed || user.uid,
    avatarUrl:
      safeAvatarUrl(google?.photoURL) || safeAvatarUrl(user.photoURL) || current.avatarUrl || '',
  };
}

// Import once on restored sessions, or explicitly when the player connects Google.
// Preserve the player's chosen name after import, and keep their Google photo
// in sync when an older session used a generated avatar or Google changes it.
export async function syncGoogleProfile(db, user, { force = false, code = '' } = {}) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'profiles', user.uid),
      identity = doc(ref, 'preferences', 'identity');
    const saved = await tx.get(ref),
      marker = await tx.get(identity);
    const current = saved.data();
    const importing = force || !current || !marker.data()?.googleProfileApplied;
    const google = user.providerData?.find((provider) => provider.providerId === 'google.com');
    if (!google || !(google.displayName || google.photoURL || user.displayName || user.photoURL))
      return current || null;
    const profile = googleProfile(user, current);
    if (!importing) {
      profile.name = current.name;
      if (current.avatarUrl === profile.avatarUrl) return current;
    }
    const roomRef = /^[A-Z2-9]{6}$/.test(code) ? doc(db, 'rooms', code) : null;
    const room = roomRef ? (await tx.get(roomRef)).data() : null;
    const inLobby =
      room?.status === 'lobby' &&
      room.memberIds.includes(user.uid) &&
      Date.now() < room.createdAt.toMillis() + 86400000;
    if (
      inLobby &&
      Object.values(room.players).some(
        (p) => p.id !== user.uid && p.name.toLowerCase() === profile.name.toLowerCase(),
      )
    )
      profile.name = `${profile.name.slice(0, 15)} ${user.uid.slice(0, 4)}`;
    const next = {
      ...(current || profileData(user.uid, profile.name)),
      ...profile,
      updatedAt: serverTimestamp(),
    };
    tx.set(ref, next);
    tx.set(identity, { googleProfileApplied: true, updatedAt: serverTimestamp() });
    if (inLobby) tx.update(roomRef, { players: { ...room.players, [user.uid]: profile } });
    return next;
  });
}
