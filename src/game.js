import { doc, runTransaction, serverTimestamp, deleteField } from 'firebase/firestore';

import { DEFAULT_LOCATIONS } from './locations.js';
import { profileData, settleRound } from './scores.js';
import { safeAvatarUrl } from './avatars.js';
export { DEFAULT_LOCATIONS } from './locations.js';
export const DEFAULT_SETTINGS = { minutes: 8, voting: 'majority', spies: 1, locations: DEFAULT_LOCATIONS };
export const MAX_PLAYERS = 15;
export const MAX_SPIES = 3;
export const requiredPlayers = spies => spies === 1 ? 2 : spies * 4;
export const eligiblePlayers = room => room.memberIds.filter(id => !(room.caughtIds || []).includes(id));
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function random(n) { const values = new Uint32Array(1); const limit = Math.floor(2 ** 32 / n) * n; do { crypto.getRandomValues(values); } while (values[0] >= limit); return values[0] % n; }
export const threshold = room => { const n = eligiblePlayers(room).length; return n === 2 ? 1 : room.settings.voting === 'unanimous' ? n - 1 : Math.floor(n / 2) + 1; };
function check(condition, message, i18n) { if (!condition) { const error = new Error(message); if (i18n) error.i18n = i18n; throw error; } }
export function validSettings(value) {
  check(Number.isInteger(value?.minutes) && value.minutes >= 2 && value.minutes <= 20, 'Choose 2–20 minutes.');
  check(['majority', 'unanimous'].includes(value.voting), 'Choose a voting rule.');
  check(Number.isInteger(value.spies ?? 1) && (value.spies ?? 1) >= 1 && (value.spies ?? 1) <= MAX_SPIES, 'Choose 1–3 spies.');
  check(Array.isArray(value.locations) && value.locations.length >= 3 && value.locations.length <= 40, 'Choose 3–40 locations.');
  check(value.locations.every(l => typeof l === 'string' && l.trim().length > 0 && l.trim().length <= 40 && !/[\r\n\t]/.test(l)), 'Use location names of 1–40 characters on one line.');
  const locations = value.locations.map(l => l.trim());
  check(new Set(locations.map(l => l.toLowerCase())).size === locations.length, 'Each location must be different.');
  return { minutes: value.minutes, voting: value.voting, spies: value.spies ?? 1, locations };
}
export function normalizeRoom(room) {
  return { ...room, settings: { spies: 1, ...room.settings }, caughtIds: room.caughtIds || [], players: room.memberIds.map(id => room.players[id]), endsAt: room.startedAt?.toMillis() + room.settings.minutes * 60000 };
}
export function resolveResult(result, secret) {
  const spyIds = secret.spyIds || [secret.spyId];
  const winner = ['timeout', 'host'].includes(result.reason) ? 'spy' : result.reason === 'guess' ? (result.guess === secret.location ? 'spy' : 'players') : spyIds.includes(result.accusedId) ? 'players' : 'spy';
  return { ...result, ...secret, spyIds, winner };
}
export async function execute(db, uid, data) {
  if (['reset', 'leave'].includes(data.action)) await settleRound(db, uid, data.code);
  // A simultaneous round-ending write can invalidate rules before Firestore
  // reports the transaction conflict. Re-read once more rather than replaying it.
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await executeOnce(db, uid, data);
      if (data.action === 'vote') await execute(db, uid, { ...data, action: 'resolve-vote' });
      return result;
    }
    catch (error) {
      if (error.code !== 'permission-denied' || !['vote','guess','resolve-vote'].includes(data.action) || attempt >= MAX_PLAYERS) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
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
        const profile = doc(db, 'profiles', uid), profileSnap = await tx.get(profile);
        const preferences = await tx.get(doc(profile, 'preferences', 'game'));
        player.avatarSeed = profileSnap.data()?.avatarSeed || uid;
        player.avatarUrl = profileSnap.data()?.avatarUrl || '';
        tx.set(profile, { ...(profileSnap.data() || profileData(uid, player.name)), avatarSeed: player.avatarSeed, name: player.name, updatedAt: serverTimestamp() });
        const settings = validSettings({ ...DEFAULT_SETTINGS, locations: preferences.data()?.locations || DEFAULT_LOCATIONS });
        tx.set(ref, { hostId: uid, memberIds: [uid], players: { [uid]: player }, status: 'lobby', settings, roundId: 0, votes: {}, createdAt: serverTimestamp() });
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
      check(room.memberIds.length < MAX_PLAYERS, 'This room is full (15 players maximum).');
      const playerName = name();
      check(!Object.values(room.players).some(p => p.name.toLowerCase() === playerName.toLowerCase()), 'That name is taken. Try another.');
      const profile = doc(db, 'profiles', uid), profileSnap = await tx.get(profile);
      const avatarSeed = profileSnap.data()?.avatarSeed || uid;
      const avatarUrl = profileSnap.data()?.avatarUrl || '';
      tx.set(profile, { ...(profileSnap.data() || profileData(uid, playerName)), name: playerName, avatarSeed, updatedAt: serverTimestamp() });
      tx.update(ref, { memberIds: [...room.memberIds, uid], players: { ...room.players, [uid]: { id: uid, name: playerName, avatarSeed, avatarUrl } } });
      return { code: data.code };
    }
    check(room.memberIds.includes(uid), 'You are not in this room.');
    if (['settings', 'start', 'reset', 'stop', 'end', 'remove'].includes(type)) check(room.hostId === uid, 'Only the host can do that.');
    if (type === 'rename') {
      check(room.status === 'lobby', 'Names can only change in the lobby.');
      const playerName = name();
      check(!Object.values(room.players).some(p => p.id !== uid && p.name.toLowerCase() === playerName.toLowerCase()), 'That name is taken. Try another.');
      const profile = doc(db, 'profiles', uid), profileSnap = await tx.get(profile);
      const avatarSeed = data.avatarSeed || profileSnap.data()?.avatarSeed || room.players[uid].avatarSeed || uid;
      const avatarUrl = data.avatarUrl ?? profileSnap.data()?.avatarUrl ?? '';
      check(avatarUrl === '' || safeAvatarUrl(avatarUrl) === avatarUrl, 'Use a Google profile photo or a generated avatar.');
      check(typeof avatarSeed === 'string' && avatarSeed.length <= 64, 'Choose another avatar.');
      tx.set(profile, { ...(profileSnap.data() || profileData(uid, playerName)), name: playerName, avatarSeed, avatarUrl, updatedAt: serverTimestamp() });
      tx.update(ref, { players: { ...room.players, [uid]: { id: uid, name: playerName, avatarSeed, avatarUrl } } });
    } else if (type === 'settings') {
      check(room.status === 'lobby', 'Rules can only change in the lobby.');
      const settings = validSettings(data.settings);
      tx.update(ref, { settings });
      tx.set(doc(db, 'profiles', uid, 'preferences', 'game'), { locations: settings.locations, updatedAt: serverTimestamp() });
    } else if (type === 'start') {
      const spies = room.settings.spies ?? 1;
      check(room.status === 'lobby' && room.memberIds.length >= requiredPlayers(spies), `At least ${requiredPlayers(spies)} players are needed for ${spies} ${spies === 1 ? 'spy' : 'spies'}.`, { key: 'At least {count} players are needed ({spies}).', values: { count: requiredPlayers(spies), spies } });
      const candidates = [...room.memberIds], spyIds = [];
      while (spyIds.length < spies) spyIds.push(candidates.splice(random(candidates.length), 1)[0]);
      const secret = { spyIds, location: room.settings.locations[random(room.settings.locations.length)], roundId: room.roundId + 1 };
      tx.set(doc(ref, 'secrets', 'current'), secret);
      for (const id of room.memberIds) tx.set(doc(ref, 'roles', id), { roundId: secret.roundId, isSpy: spyIds.includes(id), location: spyIds.includes(id) ? null : secret.location });
      tx.update(ref, { status: 'active', roundId: secret.roundId, roundKey: crypto.randomUUID(), startedAt: serverTimestamp(), votes: {}, caughtIds: [], result: null });
    } else if (type === 'end') {
      check(['active', 'accusing'].includes(room.status), 'There is no active round.');
      tx.update(ref, { status: 'ended', result: { reason: 'host' } });
    } else if (type === 'reset' || type === 'stop') {
      check(type === 'stop' ? ['active','accusing'].includes(room.status) : room.status === 'ended', 'There is no round to reset.');
      for (const id of room.memberIds) tx.delete(doc(ref, 'roles', id));
      tx.delete(doc(ref, 'secrets', 'current'));
      tx.update(ref, { status: 'lobby', votes: {}, caughtIds: [], result: null, startedAt: deleteField() });
    } else if (type === 'leave' || type === 'remove') {
      check(type === 'leave' || room.status === 'lobby', 'Players can only be removed in the lobby.');
      const target = type === 'leave' ? uid : data.target;
      check(room.memberIds.includes(target), 'Player not found.');
      const memberIds = room.memberIds.filter(id => id !== target), players = { ...room.players };
      delete players[target];
      if (room.status !== 'lobby') {
        for (const id of room.memberIds) tx.delete(doc(ref, 'roles', id));
        tx.delete(doc(ref, 'secrets', 'current'));
      }
      if (!memberIds.length) tx.delete(ref);
      else tx.update(ref, { memberIds, players, hostId: room.hostId === target ? memberIds[0] : room.hostId,
        ...(room.status !== 'lobby' ? { status: 'lobby', votes: {}, caughtIds: [], result: null, startedAt: deleteField() } : {}) });
    } else {
      check(['guess', 'vote', 'resolve-vote'].includes(type), 'Unknown action.');
      check(room.roundId === data.roundId, 'The round changed. Please try again.');
      if (room.status === 'ended') return { code: data.code };
      if (type === 'resolve-vote' && room.status !== 'accusing') return { code: data.code };
      check(['active','accusing'].includes(room.status), 'There is no active round.');
      if (type === 'resolve-vote') {
        const target = room.result.accusedId;
        const role = (await tx.get(doc(ref, 'roles', target))).data();
        const caughtIds = [...(room.caughtIds || []), target];
        if (role.isSpy && caughtIds.length < (room.settings.spies ?? 1)) tx.update(ref, { status: 'active', votes: {}, caughtIds, result: null });
        else tx.update(ref, { status: 'ended' });
      } else if (type === 'guess') {
        check(room.status === 'active', 'An accusation is being checked.');
        check(eligiblePlayers(room).includes(uid), 'Caught spies can no longer guess.');
        const role = (await tx.get(doc(ref, 'roles', uid))).data();
        check(role?.isSpy, 'Only the spy can guess.');
        check(room.settings.locations.includes(data.location), 'Choose a location from the list.');
        tx.update(ref, { status: 'ended', result: { reason: 'guess', guess: data.location, guesserId: uid } });
      } else if (type === 'vote') {
        if (room.status === 'accusing') return { code: data.code };
        check(eligiblePlayers(room).includes(uid), 'Caught spies can no longer vote.');
        check(eligiblePlayers(room).includes(data.target) && data.target !== uid, 'Vote for another active player.');
        const votes = { ...room.votes, [uid]: data.target };
        const passed = Object.values(votes).filter(id => id === data.target).length >= threshold(room);
        tx.update(ref, { votes, ...(passed ? { status: 'accusing', result: { reason: 'vote', accusedId: data.target } } : {}) });
      }
    }
    return { code: data.code };
  });
}
