import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

export function profileData(id, name) {
  return { id, name, avatarSeed: id, wins: 0, gamesPlayed: 0, lastRoundKey: '', updatedAt: serverTimestamp() };
}
export async function saveProfile(db, uid, name) {
  const ref = doc(db, 'profiles', uid);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) tx.set(ref, profileData(uid, name));
    else if (name !== snap.data().name || !snap.data().avatarSeed) tx.update(ref, { name, avatarSeed: snap.data().avatarSeed || uid, updatedAt: serverTimestamp() });
  });
}

// Archive a verified result before anyone can clear the room. Awards can then
// finish even if the room closes, and competing clients cannot count them twice.
export async function settleRound(db, uid, code) {
  const result = await runTransaction(db, async tx => {
    const roomSnap = await tx.get(doc(db, 'rooms', code));
    if (!roomSnap.exists()) return null;
    const room = roomSnap.data();
    if (room.status !== 'ended' || !room.roundKey) return null;
    const ref = doc(db, 'results', room.roundKey);
    const existing = await tx.get(ref);
    if (existing.exists()) return { key: room.roundKey, ...existing.data() };
    const secret = (await tx.get(doc(db, 'rooms', code, 'secrets', 'current'))).data();
    const spyIds = secret.spyIds || [secret.spyId];
    const spyWins = ['timeout', 'host'].includes(room.result.reason) || (room.result.reason === 'guess'
      ? room.result.guess === secret.location : !spyIds.includes(room.result.accusedId));
    const record = { code, roundId: room.roundId, memberIds: room.memberIds, players: room.players,
      winnerIds: spyWins ? spyIds : room.memberIds.filter(id => !spyIds.includes(id)), completedAt: serverTimestamp() };
    tx.set(ref, record);
    return { key: room.roundKey, ...record };
  });
  if (!result) return;
  // A small transaction for each player stays within Firestore's rule-read limit,
  // including 15-player rooms. Any participant can credit offline teammates.
  for (const id of result.memberIds) await awardResult(db, result, id);
}
export async function awardResult(db, result, id) {
  const award = doc(db, 'results', result.key, 'awards', id);
  const profile = doc(db, 'profiles', id), score = doc(db, 'rooms', result.code, 'scores', id);
  return runTransaction(db, async tx => {
    if ((await tx.get(award)).exists()) return;
    const [profileSnap, scoreSnap] = await Promise.all([tx.get(profile), tx.get(score)]);
    const won = result.winnerIds.includes(id), name = result.players[id].name;
    const increment = snap => ({ wins: (snap.data()?.wins || 0) + Number(won), gamesPlayed: (snap.data()?.gamesPlayed || 0) + 1,
      lastRoundKey: result.key, updatedAt: serverTimestamp() });
    tx.set(profile, { id, name: profileSnap.data()?.name || name, avatarSeed: profileSnap.data()?.avatarSeed || result.players[id].avatarSeed || id, ...increment(profileSnap) });
    tx.set(score, { id, name, avatarSeed: result.players[id].avatarSeed || id, ...increment(scoreSnap) });
    tx.set(award, { won, createdAt: serverTimestamp() });
  });
}
