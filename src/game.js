import { doc, runTransaction, serverTimestamp, deleteField } from 'firebase/firestore';

export const DEFAULT_LOCATIONS = ['Airport', 'Beach', 'Casino', 'Circus', 'Cruise ship', 'Hospital', 'Hotel', 'Movie studio', 'Museum', 'Police station', 'Restaurant', 'School', 'Space station', 'Submarine', 'Supermarket', 'Theater', 'Train', 'University', 'Zoo'];
export const DEFAULT_SETTINGS = { minutes: 8, voting: 'majority', locations: DEFAULT_LOCATIONS };
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function random(n) { const values = new Uint32Array(1); const limit = Math.floor(2 ** 32 / n) * n; do { crypto.getRandomValues(values); } while (values[0] >= limit); return values[0] % n; }
export const threshold = room => room.memberIds.length === 2 ? 1 : room.settings.voting === 'unanimous' ? room.memberIds.length - 1 : Math.floor(room.memberIds.length / 2) + 1;
function check(condition, message) { if (!condition) throw new Error(message); }
export function validSettings(value) {
  check(Number.isInteger(value?.minutes) && value.minutes >= 2 && value.minutes <= 20, 'Choose 2–20 minutes.');
  check(['majority', 'unanimous'].includes(value.voting), 'Choose a voting rule.');
  check(Array.isArray(value.locations) && value.locations.length >= 3 && value.locations.length <= 40, 'Choose 3–40 locations.');
  check(value.locations.every(l => typeof l === 'string' && l.trim().length > 0 && l.length <= 40), 'Use location names of 1–40 characters.');
  check(new Set(value.locations.map(l => l.toLowerCase())).size === value.locations.length, 'Each location must be different.');
  return value;
}
export function normalizeRoom(room) {
  return { ...room, players: room.memberIds.map(id => room.players[id]), endsAt: room.startedAt?.toMillis() + room.settings.minutes * 60000 };
}
export function resolveResult(result, secret) {
  const winner = result.reason === 'timeout' ? 'spy' : result.reason === 'guess' ? (result.guess === secret.location ? 'spy' : 'players') : result.accusedId === secret.spyId ? 'players' : 'spy';
  return { ...result, ...secret, winner };
}
export async function execute(db, uid, data) {
  // A simultaneous round-ending write can invalidate rules before Firestore
  // reports the transaction conflict. Re-read once more rather than replaying it.
  for (let attempt = 0; ; attempt++) {
    try { return await executeOnce(db, uid, data); }
    catch (error) {
      if (error.code !== 'permission-denied' || !['vote','guess','expire'].includes(data.action) || attempt >= 3) throw error;
    }
  }
}
async function executeOnce(db, uid, data) {
  const type = data.action;
  const name = () => { check(typeof data.name === 'string' && data.name.trim().length >= 1 && data.name.trim().length <= 20, 'Enter your name (1–20 characters).'); return data.name.trim(); };
  if (type === 'create') {
    const player = { id: uid, name: name() };
    for (let i = 0; i < 5; i++) {
      const code = Array.from({ length: 6 }, () => alphabet[random(alphabet.length)]).join('');
      const ref = doc(db, 'rooms', code);
      const created = await runTransaction(db, async tx => {
        if ((await tx.get(ref)).exists()) return false;
        tx.set(ref, { hostId: uid, memberIds: [uid], players: { [uid]: player }, status: 'lobby', settings: DEFAULT_SETTINGS, roundId: 0, votes: {}, createdAt: serverTimestamp() });
        return true;
      });
      if (created) return { code };
    }
    throw new Error('Could not create a room. Please try again.');
  }
  check(/^[A-Z2-9]{6}$/.test(data.code || ''), 'Enter a valid six-character room code.');
  const ref = doc(db, 'rooms', data.code);
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    check(snap.exists(), 'That room does not exist. Check the code.');
    const room = snap.data();
    check(Date.now() < room.createdAt.toMillis() + 86400000, 'This room has expired. Create a new room.');
    if (type === 'join') {
      if (room.memberIds.includes(uid)) return { code: data.code };
      check(room.status === 'lobby', 'The round has started. Wait for the host to return to the lobby.');
      check(room.memberIds.length < 12, 'This room is full (12 players maximum).');
      const playerName = name();
      check(!Object.values(room.players).some(p => p.name.toLowerCase() === playerName.toLowerCase()), 'That name is taken. Try another.');
      tx.update(ref, { memberIds: [...room.memberIds, uid], players: { ...room.players, [uid]: { id: uid, name: playerName } } });
      return { code: data.code };
    }
    check(room.memberIds.includes(uid), 'You are not in this room.');
    if (['settings', 'start', 'reset', 'remove'].includes(type)) check(room.hostId === uid, 'Only the host can do that.');
    if (type === 'settings') {
      check(room.status === 'lobby', 'Rules can only change in the lobby.');
      tx.update(ref, { settings: validSettings(data.settings) });
    } else if (type === 'start') {
      check(room.status === 'lobby' && room.memberIds.length >= 2, 'At least 2 players must be in the lobby.');
      const secret = { spyId: room.memberIds[random(room.memberIds.length)], location: room.settings.locations[random(room.settings.locations.length)], roundId: room.roundId + 1 };
      tx.set(doc(ref, 'secrets', 'current'), secret);
      for (const id of room.memberIds) tx.set(doc(ref, 'roles', id), { roundId: secret.roundId, isSpy: id === secret.spyId, location: id === secret.spyId ? null : secret.location });
      tx.update(ref, { status: 'active', roundId: secret.roundId, startedAt: serverTimestamp(), votes: {}, result: null });
    } else if (type === 'reset') {
      check(room.status === 'ended', 'Finish this round first.');
      for (const id of room.memberIds) tx.delete(doc(ref, 'roles', id));
      tx.delete(doc(ref, 'secrets', 'current'));
      tx.update(ref, { status: 'lobby', votes: {}, result: null, startedAt: deleteField() });
    } else if (type === 'leave' || type === 'remove') {
      check(room.status === 'lobby', 'Players can only leave or be removed in the lobby.');
      const target = type === 'leave' ? uid : data.target;
      check(room.memberIds.includes(target), 'Player not found.');
      const memberIds = room.memberIds.filter(id => id !== target), players = { ...room.players };
      delete players[target];
      if (!memberIds.length) tx.delete(ref);
      else tx.update(ref, { memberIds, players, hostId: room.hostId === target ? memberIds[0] : room.hostId });
    } else {
      check(['guess', 'vote', 'expire'].includes(type), 'Unknown action.');
      check(room.roundId === data.roundId, 'The round changed. Please try again.');
      if (room.status === 'ended') return { code: data.code };
      check(room.status === 'active', 'There is no active round.');
      const expired = Date.now() >= room.startedAt.toMillis() + room.settings.minutes * 60000;
      if (expired) tx.update(ref, { status: 'ended', result: { reason: 'timeout' } });
      else if (type === 'guess') {
        const role = (await tx.get(doc(ref, 'roles', uid))).data();
        check(role?.isSpy, 'Only the spy can guess.');
        check(room.settings.locations.includes(data.location), 'Choose a location from the list.');
        tx.update(ref, { status: 'ended', result: { reason: 'guess', guess: data.location } });
      } else if (type === 'vote') {
        check(room.memberIds.includes(data.target) && data.target !== uid, 'Vote for another player.');
        const votes = { ...room.votes, [uid]: data.target };
        const passed = Object.values(votes).filter(id => id === data.target).length >= threshold(room);
        tx.update(ref, { votes, ...(passed ? { status: 'ended', result: { reason: 'vote', accusedId: data.target } } : {}) });
      }
    }
    return { code: data.code };
  });
}
